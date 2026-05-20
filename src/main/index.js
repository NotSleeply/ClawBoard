/**
 * ClawBoard - Electron 主进程
 * 负责窗口管理、系统托盘、IPC 通信
 */

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  clipboard,
  nativeImage,
  shell,
  dialog,
  globalShortcut,
  Notification,
} = require("electron");
const path = require("path");
const fs = require("fs");
const log = require("electron-log");
const { autoUpdater } = require("electron-updater");
const SecureUtils = require("../utils/SecureUtils");
const SessionManager = require("../utils/SessionManager");
const TextFormatter = require("../utils/TextFormatter");
const PasteModeManager = require("../utils/PasteModeManager");
const SnippetsManager = require("../utils/SnippetsManager");
const TriggerEngine = require("../utils/TriggerEngine");

log.transports.file.level = "info";
log.transports.file.resolvePathFn = () =>
  path.join(app.getPath("userData"), "logs", "clawboard.log");
log.info("ClawBoard 启动...");

const ClipboardWatcher = require("../core/clipboard/ClipboardWatcher");
const Database = require("../core/database/Database");
const AI = require("../core/ai/AIService");

const OCRService = require("../features/ocr/OCRService");
const Insights = require("../features/insights/InsightsService");
const RuleEngine = require("../features/rules/RuleEngine");

const Platform = require("../utils/platform");
const SmartPaste = require("../utils/smart-paste");
const IgnoreRules = require("../utils/ignore-rules");
const HotkeyTemplates = require("../utils/hotkey-templates");
const AutoCategorize = require("../utils/auto-categorize");

const Snippets = require("../features/snippets/SnippetsManager");

let mainWindow = null;
let cycleWindow = null;
let quickPasteWindow = null;
let tray = null;
let db = null;
let sessionManager = null;
let pasteModeManager = null;
let snippetsManager = null;
let triggerEngine = null;
let clipboardWatcher = null;
let ocrService = null;
let smartPaste = null;
let ignoreRules = null;
let autoExpiryTimer = null;
let hotkeyTemplates = null;
let autoCat = null;
let insightsEngine = null;
let ruleEngine = null;
let monitoringPaused = false;
let snippets = null;

let shortcutsConfig = {
  cyclePaste: Platform.getDefaultCyclePasteShortcut(),
  quickPaste: Platform.getDefaultQuickPasteShortcut(),
  toggleMonitoring: Platform.isMac ? "Option+Ctrl+P" : "Alt+Ctrl+P",
};

function loadShortcutsConfig() {
  try {
    const configPath = require("path").join(
      app.getPath("userData"),
      "shortcuts.json",
    );
    if (require("fs").existsSync(configPath)) {
      const saved = JSON.parse(require("fs").readFileSync(configPath, "utf8"));
      Object.assign(shortcutsConfig, saved);
    }
  } catch (e) {
    log.error("loadShortcutsConfig error:", e);
  }
}

function saveShortcutsConfig() {
  try {
    const configPath = require("path").join(
      app.getPath("userData"),
      "shortcuts.json",
    );
    require("fs").writeFileSync(
      configPath,
      JSON.stringify(shortcutsConfig, null, 2),
      "utf8",
    );
  } catch (e) {
    log.error("saveShortcutsConfig error:", e);
  }
}

let notificationSettings = {
  enabled: false,
  soundEnabled: false,
  showPreview: true,
  ignoreLargeText: true,
  largeTextThreshold: 1000,
  mergeEnabled: true,
  mergeWindow: 5000,
  position: "bottom-right",
};

let notificationQueue = [];
let notificationTimer = null;

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

require('./ipc/formatIpc')(ipcMain, log, TextFormatter, () => pasteModeManager);
require('./ipc/snippetIpc')(ipcMain, snippetsManager, () => snippets, () => db, log);

function ensureSnippets() {
  if (!snippets && db) {
    snippets = new Snippets(db.db || db);
  }
  return snippets;
}

function createCycleWindow() {
  if (cycleWindow && !cycleWindow.isDestroyed()) {
    try {
      const { screen: scr } = require("electron");
      const pos = scr.getCursorScreenPoint();
      const disp = scr.getDisplayNearestPoint(pos);
      const b = disp.workArea;
      const w = 420,
        h = 380;
      let nx = pos.x + 10;
      let ny = pos.y - 100;
      if (nx + w > b.x + b.width) nx = b.x + b.width - w - 10;
      if (ny + h > b.y + b.height) ny = b.y + b.height - h - 10;
      if (ny < b.y) ny = b.y + 10;
      if (nx < b.x) nx = b.x + 10;
      cycleWindow.setBounds({ x: nx, y: ny, width: w, height: h });
    } catch (_) {
      /* ignore reposition errors */
    }
    cycleWindow.show();
    cycleWindow.focus();
    return cycleWindow;
  }

  const { screen } = require("electron");
  const cursorPos = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPos);
  const bounds = display.workArea;
  const scaleFactor = display.scaleFactor;

  let x = cursorPos.x + 10;
  let y = cursorPos.y - 100;

  const w = 420,
    h = 380;
  if (x + w > bounds.x + bounds.width) x = bounds.x + bounds.width - w - 10;
  if (y + h > bounds.y + bounds.height) y = bounds.y + bounds.height - h - 10;
  if (y < bounds.y) y = bounds.y + 10;
  if (x < bounds.x) x = bounds.x + 10;

  cycleWindow = new BrowserWindow({
    width: w,
    height: h,
    x: x,
    y: y,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  cycleWindow.loadFile(path.join(__dirname, "../renderer", "cycle-panel.html"));
  cycleWindow.once("ready-to-show", () => {
    cycleWindow.show();
  });
  cycleWindow.on("closed", () => {
    cycleWindow = null;
  });

  cycleWindow.on("blur", () => {
    if (cycleWindow && !cycleWindow.isDestroyed()) {
      cycleWindow.webContents.send("cycle-paste-now");
      setTimeout(() => {
        if (cycleWindow && !cycleWindow.isDestroyed()) {
          cycleWindow.close();
        }
      }, 100);
    }
  });

  return cycleWindow;
}

function createQuickPasteWindow() {
  if (quickPasteWindow && !quickPasteWindow.isDestroyed()) {
    quickPasteWindow.close();
    quickPasteWindow = null;
  }

  const { screen } = require("electron");
  const cursorPos = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPos);
  const b = display.workArea;
  const w = 380,
    h = 400;
  let x = cursorPos.x + 10;
  let y = cursorPos.y + 10;
  if (x + w > b.x + b.width) x = b.x + b.width - w - 10;
  if (y + h > b.y + b.height) y = b.y + b.height - h - 10;
  if (x < b.x) x = b.x + 10;
  if (y < b.y) y = b.y + 10;

  quickPasteWindow = new BrowserWindow({
    width: w,
    height: h,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  quickPasteWindow.loadFile(path.join(__dirname, "windows/quick-paste.html"));

  quickPasteWindow.webContents.on("did-finish-load", () => {
    const recent = db.searchRecords({ limit: 30 });
    quickPasteWindow.webContents.send(
      "quick-paste-data",
      recent.map((r) => ({
        id: r.id,
        type: r.type,
        content: r.content ? r.content.substring(0, 200) : "",
      })),
    );
  });

  quickPasteWindow.once("ready-to-show", () => quickPasteWindow.show());
  quickPasteWindow.on("blur", () => {
    if (quickPasteWindow && !quickPasteWindow.isDestroyed())
      quickPasteWindow.close();
  });
  quickPasteWindow.on("closed", () => {
    quickPasteWindow = null;
  });

  return quickPasteWindow;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 400,
    frame: true,
    show: false,
    backgroundColor: "#0F172A",
    webPreferences: {
      preload: path.join(__dirname, "../preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: path.join(__dirname, "../assets/icon.png"),
  });

  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    log.info("主窗口已显示");
  });

  mainWindow.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, "../assets/tray-icon.png");

  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      trayIcon = nativeImage.createEmpty();
    }
  } catch {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "📋 打开 ClawBoard",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: "🔍 搜索剪贴板",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.webContents.send("focus-search");
        }
      },
    },
    { type: "separator" },
    {
      label: "⏸️ 暂停监控",
      click: async () => {
        const result = { paused: !monitoringPaused };
        if (monitoringPaused) {
          clipboardWatcher.start();
          monitoringPaused = false;
        } else {
          clipboardWatcher.stop();
          monitoringPaused = true;
        }
        if (tray) {
          tray.displayBalloon({
            title: "ClawBoard",
            content: monitoringPaused ? "监控已暂停" : "监控已恢复",
            icon: nativeImage.createFromPath(
              path.join(__dirname, "../assets/tray-icon.png"),
            ),
          });
        }
      },
    },
    { type: "separator" },
    {
      label: "📊 统计信息",
      click: () => {
        if (db) {
          const stats = db.getStats();
          dialog.showMessageBox({
            type: "info",
            title: "📊 ClawBoard 统计",
            message: `总记录数: ${stats.total}\n文字记录: ${stats.text}\n图片记录: ${stats.image}\n文件路径: ${stats.file}\n收藏数: ${stats.favorite}`,
          });
        }
      },
    },
    {
      label: "📁 数据目录",
      click: () => {
        shell.openPath(app.getPath("userData"));
      },
    },
    {
      label: "📌 窗口置顶",
      type: "checkbox",
      checked: false,
      click: (menuItem) => {
        if (mainWindow) {
          mainWindow.setAlwaysOnTop(menuItem.checked);
        }
      },
    },
    { type: "separator" },
    {
      label: "🔄 检查更新",
      click: () => {
        checkForUpdates();
      },
    },
    {
      label: "❓ 关于",
      click: () => {
        dialog.showMessageBox({
          type: "info",
          title: "🦞 ClawBoard",
          message: `ClawBoard v${app.getVersion()}\n\nAI驱动的本地剪贴板管理器\n\n© 2024 NotSleeply`,
        });
      },
    },
    { type: "separator" },
    {
      label: "❌ 退出",
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip("🦞 ClawBoard - 剪贴板管理器");
  tray.setContextMenu(contextMenu);

  tray.on("double-click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function setupIPC() {
  require('./ipc/recordIpc')(ipcMain, db, log, () => clipboardWatcher);
  require('./ipc/groupIpc')(ipcMain, db, log);
  require('./ipc/statsIpc')(ipcMain, db, log, () => insightsEngine, () => app);
  require('./ipc/ruleIpc')(ipcMain, db, log);
  require('./ipc/aiIpc')(ipcMain, db, log, AI);
  require('./ipc/settingsIpc')(ipcMain, db, log, () => app, () => notificationSettings, updateNotificationSettings, showClipboardNotification);
  require('./ipc/windowIpc')(ipcMain, db, log, () => mainWindow, () => clipboardWatcher, () => tray, () => monitoringPaused, (v) => { monitoringPaused = v; });
  log.info("IPC 处理器已注册");
}

require('./ipc/dataIpc')(ipcMain, db, log, () => mainWindow);
require('./ipc/templateIpc')(ipcMain, db, log);
require('./ipc/ocrIpc')(ipcMain, ocrService, db, log);
require('./ipc/encryptionIpc')(ipcMain, db, log);
require('./ipc/syncIpc')(ipcMain, db, log);

app.whenReady().then(async () => {
  log.info("应用准备就绪");

  db = new Database(app.getPath("userData"));
  await db._init();

  try {
    db.startAutoBackup();
    log.info("[Database] 自动备份机制已启用");
  } catch (err) {
    log.warn("[Database] 自动备份启动失败:", err.message);
  }

  try {
    sessionManager = new SessionManager(app.getPath("userData"), db);
    log.info("[Security] 会话安全管理器已启用");
  } catch (err) {
    log.error("[Security] 会话管理器初始化失败:", err);
  }

  try {
    pasteModeManager = new PasteModeManager();
    log.info("[Feature] 特殊粘贴模式管理器已启用 (12种模式)");

    snippetsManager = new SnippetsManager(app.getPath("userData"), db);
    log.info(`[Feature] 快捷短语管理器已启用 (${snippetsManager.snippets.size} 个预设短语)`);

    triggerEngine = new TriggerEngine(db, clipboardWatcher);
    log.info("[Feature] 自动触发器引擎已启用");
  } catch (err) {
    log.error("[Feature] 模块初始化失败:", err);
  }

  const ocrLangPath = path.join(app.getAppPath(), "assets", "tessdata");
  const ocrCachePath = path.join(app.getPath("userData"), "tessdata");
  ocrService = new OCRService({
    langPath: ocrLangPath,
    cachePath: ocrCachePath,
  });
  await ocrService.init().then((success) => {
    if (success) {
      log.info("OCR 服务初始化成功");
    } else {
      log.warn("OCR 服务初始化失败，图片文字识别功能不可用");
    }
  });

  clipboardWatcher = new ClipboardWatcher(db, clipboard, log, AI, ocrService);
  clipboardWatcher.start();

  global.showClipboardNotification = showClipboardNotification;
  global.db = db;
  global.ignoreRules = ignoreRules;

  startAutoExpiryTimer();

  hotkeyTemplates = new HotkeyTemplates(db);
  hotkeyTemplates.registerAll((accelerator, content, label) => {
    log.info(`[HotkeyTemplates] 触发: ${accelerator} → ${label}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("hotkey-triggered", {
        accelerator,
        content,
        label,
      });
    }
  });
  log.info("[HotkeyTemplates] 快捷键模板系统已初始化");

  autoCat = new AutoCategorize();
  log.info("[AutoCategorize] 自动分类引擎已初始化");

  insightsEngine = new Insights(db);
  log.info("[Insights] 智能洞察引擎已初始化");

  ruleEngine = new RuleEngine(db);
  log.info("[RuleEngine] 规则引擎已初始化");

  createWindow();
  createTray();

  const settings = db.getSettings();
  if (settings.autoStart) {
    app.setLoginItemSettings({
      openAtLogin: true,
      path: app.getPath("exe"),
    });
  }

  updateNotificationSettings(settings);

  registerGlobalShortcut(settings);

  registerCycleShortcut();

  registerQuickPasteShortcut();

  setupIPC();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  log.info("应用即将退出");
  app.isQuitting = true;
  if (clipboardWatcher) {
    clipboardWatcher.stop();
  }
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = "info";

autoUpdater.on("checking-for-update", () => {
  log.info("[AutoUpdater] 正在检查更新...");
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-status", { status: "checking" });
  }
});

autoUpdater.on("update-available", (info) => {
  log.info("[AutoUpdater] 发现新版本:", info.version);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-status", {
      status: "available",
      version: info.version,
    });
  }
  showUpdateNotification(`发现新版本 v${info.version}，正在下载...`);
});

autoUpdater.on("update-not-available", (info) => {
  log.info("[AutoUpdater] 当前已是最新版本:", info.version);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-status", {
      status: "not-available",
      version: info.version,
    });
  }
});

autoUpdater.on("download-progress", (progressObj) => {
  const percent = Math.round(progressObj.percent);
  log.info(`[AutoUpdater] 下载进度: ${percent}%`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-status", {
      status: "downloading",
      percent,
    });
  }
});

autoUpdater.on("update-downloaded", (info) => {
  log.info("[AutoUpdater] 更新下载完成:", info.version);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-status", {
      status: "downloaded",
      version: info.version,
    });
  }
  showUpdateNotification(`v${info.version} 下载完成，即将重启应用以完成更新`);
  setTimeout(() => {
    autoUpdater.quitAndInstall(false, true);
  }, 3000);
});

autoUpdater.on("error", (err) => {
  log.error("[AutoUpdater] 更新出错:", err.message);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-status", {
      status: "error",
      message: err.message,
    });
  }
});

function showUpdateNotification(message) {
  try {
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: "🦞 ClawBoard 更新",
        body: message,
        icon: path.join(__dirname, "../assets/icon.png"),
        silent: false,
        timeoutType: "default",
      });
      notification.show();
    }
  } catch (err) {
    log.warn("显示更新通知失败:", err.message);
  }
}

function checkForUpdates() {
  if (
    process.env.NODE_ENV === "development" ||
    process.argv.includes("--dev")
  ) {
    log.info("[AutoUpdater] 开发模式，跳过更新检查");
    return;
  }
  try {
    autoUpdater.checkForUpdatesAndNotify();
  } catch (err) {
    log.error("[AutoUpdater] 检查更新失败:", err.message);
  }
}

require('./ipc/appIpc')(ipcMain, db, log, app, autoUpdater, registerGlobalShortcut);

process.on("uncaughtException", (err) => {
  log.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason) => {
  log.error("Unhandled Rejection:", reason);
});

function playNotificationSound() {
  try {
    const { exec } = require("child_process");
    const cmd = Platform.getNotificationSoundCommand();
    if (cmd) {
      if (Platform.isWindows) {
        exec(cmd, { windowsHide: true });
      } else if (Platform.isMac) {
        exec(cmd);
      } else {
        exec(cmd, (err) => {
          if (err) {
            exec(
              "paplay /usr/share/sounds/freedesktop/stereo/message.oga",
              () => {},
            );
          }
        });
      }
    }
  } catch (err) {
    log.warn("播放通知声音失败:", err.message);
  }
}

function startAutoExpiryTimer() {
  if (autoExpiryTimer) clearInterval(autoExpiryTimer);
  if (!db) return;
  const settings = db.getAutoExpirySettings();
  if (!settings.enabled) return;
  autoExpiryTimer = setInterval(() => {
    try {
      const count = db.cleanExpiredItems();
      if (count > 0) {
        log.info("自动过期清理: 删除了 " + count + " 条过期记录");
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("expiry-cleanup", { count });
        }
      }
      db.autoCleanTrash();
    } catch (err) {
      log.error("自动过期清理失败:", err);
    }
  }, 3600000);
  const count = db.cleanExpiredItems();
  if (count > 0) {
    log.info("启动时自动过期清理: 删除了 " + count + " 条过期记录");
  }
  db.autoCleanTrash();
}

function showClipboardNotification(record) {
  if (!notificationSettings.enabled) return;

  try {
    const contentLength = record.content ? record.content.length : 0;
    if (
      notificationSettings.ignoreLargeText &&
      contentLength > notificationSettings.largeTextThreshold
    ) {
      return;
    }

    if (notificationSettings.mergeEnabled) {
      notificationQueue.push({
        record,
        type: record.type,
        timestamp: Date.now(),
      });

      if (notificationTimer) {
        clearTimeout(notificationTimer);
      }

      notificationTimer = setTimeout(() => {
        flushNotificationQueue();
      }, notificationSettings.mergeWindow);

      return;
    }

    showSingleNotification(record);
  } catch (err) {
    log.warn("显示通知失败:", err.message);
  }
}

function flushNotificationQueue() {
  if (notificationQueue.length === 0) return;

  const count = notificationQueue.length;
  const latestRecord = notificationQueue[count - 1].record;

  const typeCounts = {};
  for (const item of notificationQueue) {
    typeCounts[item.type] = (typeCounts[item.type] || 0) + 1;
  }

  let title, body;

  if (count === 1) {
    showSingleNotification(latestRecord);
  } else {
    title = `📋 已捕获 ${count} 条内容`;

    const typeLabels = {
      text: "文字",
      code: "代码",
      image: "图片",
      file: "文件",
    };
    const parts = [];
    for (const [type, cnt] of Object.entries(typeCounts)) {
      parts.push(`${typeLabels[type] || type}×${cnt}`);
    }
    body = `包含: ${parts.join(", ")}`;

    const notification = new Notification({
      title,
      body,
      icon: path.join(__dirname, "../assets/icon.png"),
      silent: !notificationSettings.soundEnabled,
      timeoutType: "default",
    });

    notification.on("click", () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });

    notification.show();

    if (notificationSettings.soundEnabled) {
      playNotificationSound();
    }

    log.info(`已显示合并通知: ${count} 条`);
  }

  notificationQueue = [];
  notificationTimer = null;
}

function showSingleNotification(record) {
  const contentLength = record.content ? record.content.length : 0;

  let title = "📋 已捕获剪贴板";
  let body = "";

  switch (record.type) {
    case "text":
      title = "📝 已捕获文字";
      body = notificationSettings.showPreview
        ? (record.content || "").substring(0, 100) +
          (contentLength > 100 ? "..." : "")
        : `文字内容 (${contentLength} 字符)`;
      break;
    case "code":
      title = "💻 已捕获代码";
      body = notificationSettings.showPreview
        ? (record.content || "").substring(0, 100) +
          (contentLength > 100 ? "..." : "")
        : `代码片段 (${contentLength} 字符)`;
      break;
    case "image":
      title = "🖼️ 已捕获图片";
      body = "图片已保存到剪贴板历史";
      break;
    case "file":
      title = "📁 已捕获文件";
      body = notificationSettings.showPreview
        ? (record.content || "").substring(0, 100)
        : "文件路径已保存";
      break;
    default:
      body = notificationSettings.showPreview
        ? (record.content || "").substring(0, 100)
        : "新内容已捕获";
  }

  const notification = new Notification({
    title: title,
    body: body,
    icon: path.join(__dirname, "../assets/icon.png"),
    silent: !notificationSettings.soundEnabled,
    timeoutType: "default",
  });

  notification.on("click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send("select-record", record.id);
    }
  });

  notification.show();

  if (notificationSettings.soundEnabled) {
    playNotificationSound();
  }

  log.info("已显示剪贴板捕获通知:", record.type);
}

function updateNotificationSettings(settings) {
  notificationSettings = {
    enabled: settings?.notificationEnabled ?? false,
    soundEnabled: settings?.notificationSound ?? false,
    showPreview: settings?.notificationPreview ?? true,
    ignoreLargeText: settings?.notificationIgnoreLarge ?? true,
    largeTextThreshold: settings?.notificationLargeThreshold ?? 1000,
    mergeEnabled: settings?.notificationMergeEnabled ?? true,
    mergeWindow: settings?.notificationMergeWindow ?? 5000,
    position: settings?.notificationPosition ?? "bottom-right",
  };
  log.info("通知设置已更新:", notificationSettings);
}

let currentShortcut = null;
let cycleShortcut = null;

function registerGlobalShortcut(settings) {
  if (currentShortcut) {
    globalShortcut.unregister(currentShortcut);
  }

  const shortcut = settings?.globalShortcut || "CommandOrControl+Shift+V";

  const ret = globalShortcut.register(shortcut, () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  if (!ret) {
    log.warn("全局快捷键注册失败: " + shortcut);
  } else {
    log.info("全局快捷键 " + shortcut + " 已注册");
    currentShortcut = shortcut;
  }
}

function registerCycleShortcut() {
  if (cycleShortcut) {
    globalShortcut.unregister(cycleShortcut);
  }
  const shortcut = shortcutsConfig.cyclePaste || "Alt+V";
  if (!shortcut) return;
  try {
    const ret = globalShortcut.register(shortcut, () => {
      if (cycleWindow && !cycleWindow.isDestroyed()) {
        cycleWindow.webContents.send("cycle-next");
      } else {
        createCycleWindow();
      }
    });
    if (!ret) {
      log.warn("循环模式快捷键注册失败: " + shortcut);
    } else {
      log.info("循环模式快捷键 " + shortcut + " 已注册");
      cycleShortcut = shortcut;
    }
  } catch (e) {
    log.warn("循环模式快捷键注册失败:", e);
  }
}

let quickPasteShortcut = null;
function registerQuickPasteShortcut() {
  if (quickPasteShortcut) {
    globalShortcut.unregister(quickPasteShortcut);
  }
  const shortcut = shortcutsConfig.quickPaste || "Alt+Q";
  if (!shortcut) return;
  try {
    const ret = globalShortcut.register(shortcut, () => {
      createQuickPasteWindow();
    });
    if (!ret) {
      log.warn("快速粘贴快捷键注册失败: " + shortcut);
    } else {
      log.info("快速粘贴快捷键 " + shortcut + " 已注册");
      quickPasteShortcut = shortcut;
    }
  } catch (e) {
    log.warn("快速粘贴快捷键注册失败:", e);
  }
}

require('./ipc/smartPasteIpc')(ipcMain, log, () => smartPaste);
require('./ipc/ignoreRulesIpc')(ipcMain, db, log, () => ignoreRules);
require('./ipc/expiryIpc')(ipcMain, db, log, startAutoExpiryTimer);
require('./ipc/hotkeyIpc')(ipcMain, log, () => hotkeyTemplates, () => mainWindow);
require('./ipc/transformIpc')(ipcMain, log);

require('./ipc/exportIpc')(ipcMain, db, log);
require('./ipc/fileIpc')(ipcMain, db, log, () => mainWindow);

require('./ipc/cycleIpc')(ipcMain, log, db, () => cycleWindow, () => quickPasteWindow);

require('./ipc/systemIpc')(ipcMain, db, log, () => app);
require('./ipc/previewIpc')(ipcMain, log);
require('./ipc/backupIpc')(ipcMain, db, log, () => mainWindow);
require('./ipc/securityIpc')(ipcMain, log, SecureUtils, () => app);

/**
 * ClawBoard - Electron 主进程
 * 负责窗口管理、系统托盘、IPC 通信
 */

const { app, BrowserWindow, Tray, Menu, ipcMain, clipboard, nativeImage, shell, dialog, globalShortcut, Notification } = require('electron');
const path = require('path');
const log = require('electron-log');

// 配置日志
log.transports.file.level = 'info';
log.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs', 'clawboard.log');
log.info('ClawBoard 启动...');

// 模块
const ClipboardWatcher = require('./clipboard');
const Database = require('./database');
const AI = require('./ai');
const OCRService = require('./ocr'); // v0.17.0 OCR服务
const SmartPaste = require('./smart-paste'); // v0.31.0 智能粘贴
const IgnoreRules = require('./ignore-rules'); // v0.31.0 忽略规则
const HotkeyTemplates = require('./hotkey-templates'); // v0.32.0 快捷键模板
const TextTransform = require('./text-transform'); // v0.33.0 格式转换

let mainWindow = null;
let cycleWindow = null; // v0.39.0: Cycle mode window
let tray = null;
let db = null;
let clipboardWatcher = null;
let ocrService = null; // v0.17.0 OCR服务实例
let smartPaste = null; // v0.31.0 智能粘贴实例
let ignoreRules = null; // v0.31.0
let autoExpiryTimer = null; // v0.31.0 忽略规则实例
let hotkeyTemplates = null; // v0.32.0 快捷键模板实例

// v0.29.0: 通知与声音设置
let notificationSettings = {
  enabled: false,
  soundEnabled: false,
  showPreview: true,
  ignoreLargeText: true,
  largeTextThreshold: 1000
};

// 单实例锁
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// v0.39.0: Cycle mode window
function createCycleWindow() {
  if (cycleWindow && !cycleWindow.isDestroyed()) {
    // v0.42.0: Reposition cycle window near current cursor on repeated trigger
    try {
      const { screen: scr } = require('electron');
      const pos = scr.getCursorScreenPoint();
      const disp = scr.getDisplayNearestPoint(pos);
      const b = disp.workArea;
      const w = 420, h = 380;
      let nx = pos.x + 10;
      let ny = pos.y - 100;
      if (nx + w > b.x + b.width) nx = b.x + b.width - w - 10;
      if (ny + h > b.y + b.height) ny = b.y + b.height - h - 10;
      if (ny < b.y) ny = b.y + 10;
      if (nx < b.x) nx = b.x + 10;
      cycleWindow.setBounds({ x: nx, y: ny, width: w, height: h });
    } catch (_) { /* ignore reposition errors */ }
    cycleWindow.show();
    cycleWindow.focus();
    return cycleWindow;
  }
  
  // Get mouse position to show near cursor
  const { screen } = require('electron');
  const cursorPos = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPos);
  const bounds = display.workArea;
  const scaleFactor = display.scaleFactor;
  
  // v0.42.0: Account for DPI scaling in multi-monitor setups
  // cursorPos is in logical pixels; on high-DPI secondary monitors,
  // the workArea coordinates may differ from raw cursor coordinates.
  // We use logical coordinates consistently.
  let x = cursorPos.x + 10;
  let y = cursorPos.y - 100;
  
  // Keep within the target display's work area
  const w = 420, h = 380;
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
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  cycleWindow.loadFile(path.join(__dirname, 'renderer', 'cycle-panel.html'));
  cycleWindow.once('ready-to-show', () => {
    cycleWindow.show();
  });
  cycleWindow.on('closed', () => {
    cycleWindow = null;
  });
  
  // Close cycle window when it loses focus
  cycleWindow.on('blur', () => {
    // Paste the selected item when window loses focus
    if (cycleWindow && !cycleWindow.isDestroyed()) {
      cycleWindow.webContents.send('cycle-paste-now');
      setTimeout(() => {
        if (cycleWindow && !cycleWindow.isDestroyed()) {
          cycleWindow.close();
        }
      }, 100);
    }
  });

  return cycleWindow;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 400,
    frame: true,
    show: false,
    backgroundColor: '#0F172A',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: path.join(__dirname, '../assets/icon.png'),
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    log.info('主窗口已显示');
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  
  // 如果没有图标文件，创建一个简单的默认图标
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
      label: '📋 打开 ClawBoard',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: '🔍 搜索剪贴板',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.webContents.send('focus-search');
        }
      }
    },
    { type: 'separator' },
    {
      label: '📊 统计信息',
      click: () => {
        if (db) {
          const stats = db.getStats();
          dialog.showMessageBox({
            type: 'info',
            title: '📊 ClawBoard 统计',
            message: `总记录数: ${stats.total}\n文字记录: ${stats.text}\n图片记录: ${stats.image}\n文件路径: ${stats.file}\n收藏数: ${stats.favorite}`
          });
        }
      }
    },
    {
      label: '📁 数据目录',
      click: () => {
        shell.openPath(app.getPath('userData'));
      }
    },
    {
      label: '📌 窗口置顶',
      type: 'checkbox',
      checked: false,
      click: (menuItem) => {
        if (mainWindow) {
          mainWindow.setAlwaysOnTop(menuItem.checked);
        }
      }
    },
    { type: 'separator' },
    {
      label: '❌ 退出',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    },
  ]);

  tray.setToolTip('🦞 ClawBoard - 剪贴板管理器');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function setupIPC() {
  // 获取所有记录
  ipcMain.handle('get-records', async (event, { type, limit, offset, search, favorite }) => {
    try {
      return db.getRecords({ type, limit, offset, search, favorite });
    } catch (err) {
      log.error('get-records error:', err);
      return [];
    }
  });

  // 获取单条记录
  ipcMain.handle('get-record', async (event, id) => {
    try {
      return db.getRecord(id);
    } catch (err) {
      log.error('get-record error:', err);
      return null;
    }
  });

  // 切换收藏状态
  ipcMain.handle('toggle-favorite', async (event, id) => {
    try {
      return db.toggleFavorite(id);
    } catch (err) {
      log.error('toggle-favorite error:', err);
      return false;
    }
  });

  // 更新备注
  ipcMain.handle('update-note', async (event, { id, note }) => {
    try {
      return db.updateNote(id, note);
    } catch (err) {
      log.error('update-note error:', err);
      return false;
    }
  });

  // v0.38.0: 更新条目内容（内容编辑器）
  ipcMain.handle('update-item-content', async (event, { id, content }) => {
    try {
      return db.updateItemContent(id, content);
    } catch (err) {
      log.error('update-item-content error:', err);
      return null;
    }
  });

  // 删除记录
  ipcMain.handle('delete-record', async (event, id) => {
    try {
      return db.deleteRecord(id);
    } catch (err) {
      log.error('delete-record error:', err);
      return false;
    }
  });

  // 清空历史
  ipcMain.handle('clear-history', async () => {
    try {
      return db.clearHistory();
    } catch (err) {
      log.error('clear-history error:', err);
      return false;
    }
  });

  // 复制到剪贴板
  ipcMain.handle('copy-to-clipboard', async (event, text) => {
    try {
      clipboard.writeText(text);
      return true;
    } catch (err) {
      log.error('copy-to-clipboard error:', err);
      return false;
    }
  });

  // 获取统计
  ipcMain.handle('get-stats', async () => {
    try {
      return db.getStats();
    } catch (err) {
      log.error('get-stats error:', err);
      return { total: 0, text: 0, image: 0, file: 0, favorite: 0 };
    }
  });

  // 获取详细统计
  ipcMain.handle('get-detailed-stats', async () => {
    try {
      return db.getDetailedStats();
    } catch (err) {
      log.error('get-detailed-stats error:', err);
      return null;
    }
  });

  // 获取系统健康状态 (v0.26.0)
  ipcMain.handle('get-system-health', async () => {
    try {
      const memUsage = process.memoryUsage();
      const dbPath = path.join(app.getPath('userData'), 'clawboard.db');
      let dbSize = 0;
      if (fs.existsSync(dbPath)) {
        dbSize = fs.statSync(dbPath).size;
      }
      return {
        memoryUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        memoryTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        rss: Math.round(memUsage.rss / 1024 / 1024), // MB
        dbSize: dbSize,
        dbSizeMB: Math.round(dbSize / 1024 / 1024 * 10) / 10,
        uptime: Math.round(process.uptime()), // seconds
        uptimeFormatted: formatUptime(process.uptime())
      };
    } catch (err) {
      log.error('get-system-health error:', err);
      return null;
    }
  });

  function formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
  }

  // 获取来源应用列表
  ipcMain.handle('get-source-apps', async () => {
    try {
      return db.getSourceApps();
    } catch (err) {
      log.error('get-source-apps error:', err);
      return [];
    }
  });

  // 标签相关
  ipcMain.handle('get-all-tags', async () => {
    try {
      return db.getAllTags();
    } catch (err) {
      log.error('get-all-tags error:', err);
      return [];
    }
  });

  ipcMain.handle('add-tag', async (event, { recordId, tag }) => {
    try {
      return db.addTag(recordId, tag);
    } catch (err) {
      log.error('add-tag error:', err);
      return false;
    }
  });

  ipcMain.handle('remove-tag', async (event, { recordId, tag }) => {
    try {
      return db.removeTag(recordId, tag);
    } catch (err) {
      log.error('remove-tag error:', err);
      return false;
    }
  });

  ipcMain.handle('delete-tag', async (event, tag) => {
    try {
      return db.deleteTag(tag);
    } catch (err) {
      log.error('delete-tag error:', err);
      return 0;
    }
  });

  // 智能去重相关
  ipcMain.handle('find-similar', async (event, content) => {
    try {
      return db.findSimilar(content);
    } catch (err) {
      log.error('find-similar error:', err);
      return [];
    }
  });

  ipcMain.handle('find-duplicates', async () => {
    try {
      return db.findDuplicates();
    } catch (err) {
      log.error('find-duplicates error:', err);
      return [];
    }
  });

  ipcMain.handle('cleanup-duplicates', async () => {
    try {
      return db.cleanupDuplicates();
    } catch (err) {
      log.error('cleanup-duplicates error:', err);
      return 0;
    }
  });

  // 更新当前来源应用（由剪贴板监控调用）
  ipcMain.handle('set-current-source', async (event, { app, title, url }) => {
    try {
      // 存储当前前台窗口信息
      clipboardWatcher.setCurrentSource({ app, title, url });
      return { success: true };
    } catch (err) {
      log.error('set-current-source error:', err);
      return { success: false };
    }
  });

  // AI 摘要（占位）
  ipcMain.handle('ai-summary', async (event, text) => {
    try {
      const AI = require('./ai');
      return await AI.summarize(text);
    } catch (err) {
      log.error('ai-summary error:', err);
      return null;
    }
  });

  // 获取设置
  ipcMain.handle('get-settings', async () => {
    try {
      return db.getSettings();
    } catch (err) {
      log.error('get-settings error:', err);
      return {};
    } catch {}
  });

  // 保存设置
  ipcMain.handle('save-settings', async (event, settings) => {
    try {
      // 处理开机自启动
      if (settings.autoStart !== undefined) {
        app.setLoginItemSettings({
          openAtLogin: settings.autoStart,
          path: app.getPath('exe')
        });
      }
      // v0.29.0: 更新通知设置
      updateNotificationSettings(settings);
      return db.saveSettings(settings);
    } catch (err) {
      log.error('save-settings error:', err);
      return false;
    }
  });

  // v0.29.0: 通知设置相关 IPC
  ipcMain.handle('get-notification-settings', async () => {
    try {
      return {
        enabled: notificationSettings.enabled,
        soundEnabled: notificationSettings.soundEnabled,
        showPreview: notificationSettings.showPreview,
        ignoreLargeText: notificationSettings.ignoreLargeText,
        largeTextThreshold: notificationSettings.largeTextThreshold
      };
    } catch (err) {
      log.error('get-notification-settings error:', err);
      return null;
    }
  });

  ipcMain.handle('update-notification-settings', async (event, settings) => {
    try {
      updateNotificationSettings(settings);
      // 同时保存到数据库
      const dbSettings = db.getSettings();
      dbSettings.notificationEnabled = settings.enabled;
      dbSettings.notificationSound = settings.soundEnabled;
      dbSettings.notificationPreview = settings.showPreview;
      dbSettings.notificationIgnoreLarge = settings.ignoreLargeText;
      dbSettings.notificationLargeThreshold = settings.largeTextThreshold;
      return db.saveSettings(dbSettings);
    } catch (err) {
      log.error('update-notification-settings error:', err);
      return false;
    }
  });

  // v0.29.0: 测试通知
  ipcMain.handle('test-notification', async () => {
    try {
      showClipboardNotification({
        type: 'text',
        content: '这是一条测试通知 📋 ClawBoard 通知功能已启用！',
        id: 'test'
      });
      return { success: true };
    } catch (err) {
      log.error('test-notification error:', err);
      return { success: false, error: err.message };
    }
  });

  // 搜索（支持关键词 + 语义搜索）
  ipcMain.handle('search', async (event, { query, useSemantic = true }) => {
    try {
      // 如果启用语义搜索且 Ollama 可用
      if (useSemantic && AI) {
        const isHealthy = await AI.checkHealth();
        if (isHealthy) {
          return await db.semanticSearch(query, AI.getEmbedding.bind(AI));
        }
      }
      // 回退到关键词搜索
      return db.search(query);
    } catch (err) {
      log.error('search error:', err);
      return [];
    }
  });

  log.info('IPC 处理器已注册');
}

// 导出数据
ipcMain.handle('export-data', async (event, { format = 'json' }) => {
  try {
    const records = db.getRecords({ limit: 10000 });
    const { dialog } = require('electron');
    
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `clawboard-backup-${Date.now()}.${format}`,
      filters: [
        { name: 'JSON', extensions: ['json'] },
        { name: 'CSV', extensions: ['csv'] },
      ]
    });
    
    if (result.canceled) return { success: false, message: '已取消' };
    
    const fs = require('fs');
    let content;
    
    if (format === 'json') {
      content = JSON.stringify(records, null, 2);
    } else if (format === 'csv') {
      const headers = 'id,type,content,summary,source,favorite,language,created_at\n';
      const rows = records.map(r => 
        `${r.id},"${r.type}","${(r.content || '').replace(/"/g, '""')}","${(r.summary || '').replace(/"/g, '""')}","${r.source}",${r.favorite || 0},"${r.language || ''}","${r.created_at}"`
      ).join('\n');
      content = headers + rows;
    }
    
    fs.writeFileSync(result.filePath, content, 'utf-8');
    return { success: true, message: `已导出 ${records.length} 条记录` };
  } catch (err) {
    log.error('export-data error:', err);
    return { success: false, message: err.message };
  }
});

// 导入数据
ipcMain.handle('import-data', async (event, filePath) => {
  try {
    const fs = require('fs');
    const content = fs.readFileSync(filePath, 'utf-8');
    const records = JSON.parse(content);
    
    let count = 0;
    for (const record of records) {
      if (record.content) {
        db.addRecord({
          type: record.type || 'text',
          content: record.content,
          summary: record.summary,
          source: 'import',
          favorite: record.favorite || 0,
          language: record.language
        });
        count++;
      }
    }
    
    return { success: true, message: `已导入 ${count} 条记录` };
  } catch (err) {
    log.error('import-data error:', err);
    return { success: false, message: err.message };
  }
});

// 模板管理
ipcMain.handle('get-templates', async () => {
  try {
    return db.getTemplates();
  } catch (err) {
    log.error('get-templates error:', err);
    return [];
  }
});

ipcMain.handle('add-template', async (event, { name, content, category }) => {
  try {
    return db.addTemplate(name, content, category);
  } catch (err) {
    log.error('add-template error:', err);
    return null;
  }
});

ipcMain.handle('update-template', async (event, { id, name, content, category }) => {
  try {
    return db.updateTemplate(id, name, content, category);
  } catch (err) {
    log.error('update-template error:', err);
    return null;
  }
});

ipcMain.handle('delete-template', async (event, id) => {
  try {
    return db.deleteTemplate(id);
  } catch (err) {
    log.error('delete-template error:', err);
    return false;
  }
});

// 窗口置顶
ipcMain.handle('set-always-on-top', async (event, flag) => {
  try {
    if (mainWindow) {
      mainWindow.setAlwaysOnTop(flag);
      return true;
    }
    return false;
  } catch (err) {
    log.error('set-always-on-top error:', err);
    return false;
  }
});

// v0.17.0: OCR 相关 IPC
// 手动触发 OCR 识别
ipcMain.handle('ocr-recognize', async (event, imagePath) => {
  try {
    if (!ocrService) {
      return { success: false, error: 'OCR 服务未初始化' };
    }
    return await ocrService.recognize(imagePath);
  } catch (err) {
    log.error('ocr-recognize error:', err);
    return { success: false, error: err.message };
  }
});

// 获取 OCR 文本
ipcMain.handle('get-ocr-text', async (event, id) => {
  try {
    const record = db.getRecord(id);
    return record ? record.ocr_text : null;
  } catch (err) {
    log.error('get-ocr-text error:', err);
    return null;
  }
});

// 切换锁定状态
ipcMain.handle('toggle-lock', async (event, id) => {
  try {
    return db.toggleLock(id);
  } catch (err) {
    log.error('toggle-lock error:', err);
    return false;
  }
});

// ==================== 加密相关 ====================

// 设置加密密码（解密所有加密记录）
ipcMain.handle('set-encryption-password', async (event, password) => {
  try {
    db.setEncryptionKey(password);
    return { success: true };
  } catch (err) {
    log.error('set-encryption-password error:', err);
    return { success: false, message: err.message };
  }
});

// 清除加密密钥
ipcMain.handle('clear-encryption-key', async () => {
  try {
    db.clearEncryptionKey();
    return { success: true };
  } catch (err) {
    log.error('clear-encryption-key error:', err);
    return false;
  }
});

// 加密记录
ipcMain.handle('encrypt-record', async (event, id) => {
  try {
    return db.encryptRecord(id);
  } catch (err) {
    log.error('encrypt-record error:', err);
    return false;
  }
});

// 解密记录（临时查看）
ipcMain.handle('decrypt-record', async (event, id) => {
  try {
    return db.decryptRecord(id);
  } catch (err) {
    log.error('decrypt-record error:', err);
    return null;
  }
});

// 取消加密
ipcMain.handle('remove-encryption', async (event, id) => {
  try {
    return db.removeEncryption(id);
  } catch (err) {
    log.error('remove-encryption error:', err);
    return false;
  }
});

// v0.23.0: 保存记录（用于合并功能）
ipcMain.handle('save-record', async (event, record) => {
  try {
    const result = db.addRecord(record);
    return { success: true, record: result };
  } catch (err) {
    log.error('save-record error:', err);
    return { success: false, message: err.message };
  }
});

// ==================== 分组管理 ====================
// 获取所有分组
ipcMain.handle('get-all-groups', async () => {
  try {
    return db.getAllGroups();
  } catch (err) {
    log.error('get-all-groups error:', err);
    return [];
  }
});

// 创建分组
ipcMain.handle('create-group', async (event, { name, color, icon }) => {
  try {
    return db.createGroup(name, color, icon);
  } catch (err) {
    log.error('create-group error:', err);
    return null;
  }
});

// 更新分组
ipcMain.handle('update-group', async (event, { id, ...updates }) => {
  try {
    return db.updateGroup(id, updates);
  } catch (err) {
    log.error('update-group error:', err);
    return null;
  }
});

// 删除分组
ipcMain.handle('delete-group', async (event, id) => {
  try {
    return db.deleteGroup(id);
  } catch (err) {
    log.error('delete-group error:', err);
    return false;
  }
});

// 切换分组折叠状态
ipcMain.handle('toggle-group-collapsed', async (event, id) => {
  try {
    return db.toggleGroupCollapsed(id);
  } catch (err) {
    log.error('toggle-group-collapsed error:', err);
    return false;
  }
});

// 移动记录到分组
ipcMain.handle('move-record-to-group', async (event, { recordId, groupId }) => {
  try {
    return db.moveRecordToGroup(recordId, groupId);
  } catch (err) {
    log.error('move-record-to-group error:', err);
    return false;
  }
});

// 更新记录排序
ipcMain.handle('update-record-sort-order', async (event, { recordId, newOrder, newGroupId }) => {
  try {
    return db.updateRecordSortOrder(recordId, newOrder, newGroupId);
  } catch (err) {
    log.error('update-record-sort-order error:', err);
    return false;
  }
});

// 批量更新排序
ipcMain.handle('batch-update-sort-order', async (event, updates) => {
  try {
    return db.batchUpdateSortOrder(updates);
  } catch (err) {
    log.error('batch-update-sort-order error:', err);
    return false;
  }
});

// v0.25.0: 统计导出
ipcMain.handle('get-stats-for-export', async () => {
  try {
    return db.getDetailedStatsForExport();
  } catch (err) {
    log.error('get-stats-for-export error:', err);
    return null;
  }
});

// v0.25.0: 导出记录
ipcMain.handle('export-records', async (event, { format, options }) => {
  try {
    return db.exportRecords(format, options);
  } catch (err) {
    log.error('export-records error:', err);
    return null;
  }
});

// v0.25.0: 保存导出文件
ipcMain.handle('save-export-file', async (event, { content, filename }) => {
  try {
    const { dialog } = require('electron');
    const fs = require('fs');
    const result = await dialog.showSaveDialog({
      defaultPath: filename,
      filters: [
        { name: 'JSON', extensions: ['json'] },
        { name: 'CSV', extensions: ['csv'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    if (result.canceled) return { success: false, canceled: true };
    fs.writeFileSync(result.filePath, content, 'utf8');
    return { success: true, path: result.filePath };
  } catch (err) {
    log.error('save-export-file error:', err);
    return { success: false, error: err.message };
  }
});

// v0.26.0: 获取运行时健康监控数据
ipcMain.handle('get-runtime-stats', async () => {
  try {
    return db.getRuntimeStats();
  } catch (err) {
    log.error('get-runtime-stats error:', err);
    return null;
  }
});

// v0.27.0: 置顶记录管理
ipcMain.handle('get-pinned-records', async (_, options) => {
  try {
    return db.getPinnedRecords(options || {});
  } catch (err) {
    log.error('get-pinned-records error:', err);
    return [];
  }
});

ipcMain.handle('update-pinned-record', async (_, id, updates) => {
  try {
    return db.updatePinnedRecord(id, updates);
  } catch (err) {
    log.error('update-pinned-record error:', err);
    return null;
  }
});

ipcMain.handle('batch-update-pinned', async (_, ids, options) => {
  try {
    return db.batchUpdatePinned(ids, options);
  } catch (err) {
    log.error('batch-update-pinned error:', err);
    return { updated: 0, deleted: 0 };
  }
});

ipcMain.handle('get-pinned-stats', async () => {
  try {
    return db.getPinnedStats();
  } catch (err) {
    log.error('get-pinned-stats error:', err);
    return null;
  }
});

// v0.28.0: 云端同步功能
ipcMain.handle('get-sync-metadata', async () => {
  try {
    return db.getSyncMetadata();
  } catch (err) {
    log.error('get-sync-metadata error:', err);
    return null;
  }
});

ipcMain.handle('save-sync-config', async (_, config) => {
  try {
    return db.saveSyncConfig(config);
  } catch (err) {
    log.error('save-sync-config error:', err);
    return false;
  }
});

ipcMain.handle('get-sync-stats', async () => {
  try {
    return db.getSyncStats();
  } catch (err) {
    log.error('get-sync-stats error:', err);
    return null;
  }
});

ipcMain.handle('export-for-sync', async (_, options) => {
  try {
    return db.exportForSync(options);
  } catch (err) {
    log.error('export-for-sync error:', err);
    return null;
  }
});

ipcMain.handle('import-from-sync', async (_, syncData, encryptionKey, options) => {
  try {
    return db.importFromSync(syncData, encryptionKey, options);
  } catch (err) {
    log.error('import-from-sync error:', err);
    return { error: err.message };
  }
});

ipcMain.handle('test-webdav-connection', async (_, config) => {
  try {
    const { protocol, host, port, path, username, password } = config;
    const url = `${protocol}://${host}:${port}${path}`;
    
    // 简单的连接测试 - 使用 fetch
    const response = await fetch(url, {
      method: 'PROPFIND',
      headers: {
        'Depth': '0',
        'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
      },
    });
    
    return { success: response.ok, status: response.status };
  } catch (err) {
    log.error('test-webdav-connection error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sync-to-webdav', async (_, config) => {
  try {
    const { protocol, host, port, path, username, password, encrypt, encryptionKey } = config;
    const url = `${protocol}://${host}:${port}${path}/clawboard-sync.json`;
    
    // 导出数据
    const exportData = db.exportForSync({ encrypt, encryptionKey });
    
    // 上传到 WebDAV
    const auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(exportData),
    });
    
    if (response.ok) {
      // 更新同步时间
      db.updateLastSyncTime();
      
      // 标记所有记录为已同步
      const records = db.getSyncableRecords({ limit: 10000 });
      const ids = records.map(r => r.id);
      if (ids.length > 0) {
        db.markAsSynced(ids);
      }
      
      return { success: true, recordCount: ids.length };
    }
    
    return { success: false, status: response.status };
  } catch (err) {
    log.error('sync-to-webdav error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sync-from-webdav', async (_, config) => {
  try {
    const { protocol, host, port, path, username, password, encryptionKey } = config;
    const url = `${protocol}://${host}:${port}${path}/clawboard-sync.json`;
    
    // 从 WebDAV 下载
    const auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': auth,
      },
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: '远程没有找到同步文件' };
      }
      return { success: false, status: response.status };
    }
    
    const syncData = await response.json();
    
    // 导入数据
    const result = db.importFromSync(syncData, encryptionKey);
    
    // 更新同步时间
    db.updateLastSyncTime();
    
    return { success: true, ...result };
  } catch (err) {
    log.error('sync-from-webdav error:', err);
    return { success: false, error: err.message };
  }
});

// 应用启动
app.whenReady().then(async () => {
  log.info('应用准备就绪');

  // 初始化数据库（异步）
  db = new Database(app.getPath('userData'));
  await db._init();

  // v0.17.0: 初始化 OCR 服务
  ocrService = new OCRService();
  await ocrService.init().then(success => {
    if (success) {
      log.info('OCR 服务初始化成功');
    } else {
      log.warn('OCR 服务初始化失败，图片文字识别功能不可用');
    }
  });

  // 初始化剪贴板监控（传入 AI 和 OCR 模块）
  clipboardWatcher = new ClipboardWatcher(db, clipboard, log, AI, ocrService);
  clipboardWatcher.start();

  // v0.29.0: 将通知函数暴露给全局，供剪贴板模块调用
  global.showClipboardNotification = showClipboardNotification;
  // v0.45.0: 将数据库和忽略规则暴露给全局，供剪贴板模块自动加密使用
  global.db = db;
  global.ignoreRules = ignoreRules;

  // v0.31.0: 启动自动过期清理定时器
  startAutoExpiryTimer();

  // v0.32.0: 初始化快捷键模板系统
  hotkeyTemplates = new HotkeyTemplates(db.getDb());
  hotkeyTemplates.registerAll((accelerator, content, label) => {
    log.info(`[HotkeyTemplates] 触发: ${accelerator} → ${label}`);
    // 通知渲染进程快捷键已触发
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('hotkey-triggered', { accelerator, content, label });
    }
  });
  log.info('[HotkeyTemplates] 快捷键模板系统已初始化');

  // 创建窗口和托盘
  createWindow();
  createTray();

  // 设置开机自启动（从设置读取）
  const settings = db.getSettings();
  if (settings.autoStart) {
    app.setLoginItemSettings({
      openAtLogin: true,
      path: app.getPath('exe')
    });
  }

  // v0.29.0: 加载通知设置
  updateNotificationSettings(settings);

  // 注册全局快捷键（从设置读取）
  registerGlobalShortcut(settings);

  // v0.39.0: 注册循环模式快捷键
  registerCycleShortcut();

  // 注册 IPC
  setupIPC();

  // 注册全局快捷键 Ctrl+Shift+V
  registerGlobalShortcut();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 退出前清理
app.on('before-quit', () => {
  log.info('应用即将退出');
  app.isQuitting = true;
  if (clipboardWatcher) {
    clipboardWatcher.stop();
  }
  // 注销全局快捷键
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 全局异常处理
process.on('uncaughtException', (err) => {
  log.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled Rejection:', reason);
});

// v0.29.0: 播放通知声音
function playNotificationSound() {
  try {
    // 使用系统默认声音
    const { exec } = require('child_process');
    if (process.platform === 'win32') {
      // Windows: 使用 PowerShell 播放系统声音
      exec('powershell -c "[System.Media.SystemSounds]::Beep.Play()"', { windowsHide: true });
    } else if (process.platform === 'darwin') {
      // macOS: 使用 afplay
      exec('afplay /System/Library/Sounds/Glass.aiff');
    } else {
      // Linux: 使用 canberra-gtk-play 或 paplay
      exec('canberra-gtk-play -i message', (err) => {
        if (err) {
          exec('paplay /usr/share/sounds/freedesktop/stereo/message.oga', () => {});
        }
      });
    }
  } catch (err) {
    log.warn('播放通知声音失败:', err.message);
  }
}

// v0.29.0: 显示剪贴板捕获通知

// v0.31.0: 自动过期清理定时器
function startAutoExpiryTimer() {
  if (autoExpiryTimer) clearInterval(autoExpiryTimer);
  if (!db) return;
  const settings = db.getAutoExpirySettings();
  if (!settings.enabled) return;
  autoExpiryTimer = setInterval(() => {
    try {
      const count = db.cleanExpiredItems();
      if (count > 0) {
        log.info('自动过期清理: 删除了 ' + count + ' 条过期记录');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('expiry-cleanup', { count });
        }
      }
    } catch (err) {
      log.error('自动过期清理失败:', err);
    }
  }, 3600000);
  const count = db.cleanExpiredItems();
  if (count > 0) {
    log.info('启动时自动过期清理: 删除了 ' + count + ' 条过期记录');
  }
}

function showClipboardNotification(record) {
  if (!notificationSettings.enabled) return;
  
  try {
    // 检查是否为大文本
    const contentLength = record.content ? record.content.length : 0;
    if (notificationSettings.ignoreLargeText && contentLength > notificationSettings.largeTextThreshold) {
      return;
    }

    // 准备通知内容
    let title = '📋 已捕获剪贴板';
    let body = '';
    
    switch (record.type) {
      case 'text':
        title = '📝 已捕获文字';
        body = notificationSettings.showPreview 
          ? (record.content || '').substring(0, 100) + (contentLength > 100 ? '...' : '')
          : `文字内容 (${contentLength} 字符)`;
        break;
      case 'code':
        title = '💻 已捕获代码';
        body = notificationSettings.showPreview
          ? (record.content || '').substring(0, 100) + (contentLength > 100 ? '...' : '')
          : `代码片段 (${contentLength} 字符)`;
        break;
      case 'image':
        title = '🖼️ 已捕获图片';
        body = '图片已保存到剪贴板历史';
        break;
      case 'file':
        title = '📁 已捕获文件';
        body = notificationSettings.showPreview
          ? (record.content || '').substring(0, 100)
          : '文件路径已保存';
        break;
      default:
        body = notificationSettings.showPreview
          ? (record.content || '').substring(0, 100)
          : '新内容已捕获';
    }

    // 创建通知
    const notification = new Notification({
      title: title,
      body: body,
      icon: path.join(__dirname, '../assets/icon.png'),
      silent: !notificationSettings.soundEnabled, // 如果启用自定义声音，则静音系统通知声音
      timeoutType: 'default'
    });

    notification.on('click', () => {
      // 点击通知时打开主窗口
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
        // 可以在这里选中对应的记录
        mainWindow.webContents.send('select-record', record.id);
      }
    });

    notification.show();

    // 播放自定义声音（如果启用且系统通知声音被静音）
    if (notificationSettings.soundEnabled && notificationSettings.enabled) {
      playNotificationSound();
    }

    log.info('已显示剪贴板捕获通知:', record.type);
  } catch (err) {
    log.warn('显示通知失败:', err.message);
  }
}

// v0.29.0: 更新通知设置
function updateNotificationSettings(settings) {
  notificationSettings = {
    enabled: settings?.notificationEnabled ?? false,
    soundEnabled: settings?.notificationSound ?? false,
    showPreview: settings?.notificationPreview ?? true,
    ignoreLargeText: settings?.notificationIgnoreLarge ?? true,
    largeTextThreshold: settings?.notificationLargeThreshold ?? 1000
  };
  log.info('通知设置已更新:', notificationSettings);
}

// 注册全局快捷键
let currentShortcut = null;
let cycleShortcut = null; // v0.39.0

function registerGlobalShortcut(settings) {
  // 先注销之前的快捷键
  if (currentShortcut) {
    globalShortcut.unregister(currentShortcut);
  }

  // 获取快捷键（默认 Ctrl+Shift+V）
  const shortcut = settings?.globalShortcut || 'CommandOrControl+Shift+V';
  
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
    log.warn('全局快捷键注册失败: ' + shortcut);
  } else {
    log.info('全局快捷键 ' + shortcut + ' 已注册');
    currentShortcut = shortcut;
  }
}

// v0.39.0: Register cycle mode shortcut (Alt+V)
function registerCycleShortcut() {
  if (cycleShortcut) {
    globalShortcut.unregister(cycleShortcut);
  }
  const shortcut = 'Alt+V';
  const ret = globalShortcut.register(shortcut, () => {
    if (cycleWindow && !cycleWindow.isDestroyed()) {
      // Already open: cycle to next item
      cycleWindow.webContents.send('cycle-next');
    } else {
      // Open cycle window
      createCycleWindow();
    }
  });
  if (!ret) {
    log.warn('循环模式快捷键注册失败: ' + shortcut);
  } else {
    log.info('循环模式快捷键 ' + shortcut + ' 已注册');
    cycleShortcut = shortcut;
  }
}

// 更新全局快捷键
ipcMain.handle('update-shortcut', async (event, shortcut) => {
  try {
    const settings = db.getSettings();
    settings.globalShortcut = shortcut;
    db.saveSettings(settings);
    
    // 重新注册快捷键
    registerGlobalShortcut(settings);
    
    return { success: true };
  } catch (err) {
    log.error('update-shortcut error:', err);
    return { success: false, message: err.message };
  }
});

// v0.29.0: 通知与声音功能
// 播放提示音
function playNotificationSound() {
  try {
    // Electron Notification 使用系统默认音效，silent 参数控制是否静音
    return { success: true };
  } catch (e) {
    log.error('播放提示音失败:', e);
  }
}

// 获取通知设置
ipcMain.handle('get-notification-settings', async () => {
  try {
    return db.getNotificationSettings();
  } catch (err) {
    log.error('get-notification-settings error:', err);
    return { enabled: false, soundEnabled: true, durationSeconds: 3, showPreview: true, minContentLength: 0, excludedApps: [] };
  }
});

// 保存通知设置
ipcMain.handle('save-notification-settings', async (_, settings) => {
  try {
    db.saveNotificationSettings(settings);
    return { success: true };
  } catch (err) {
    log.error('save-notification-settings error:', err);
    return { success: false, message: err.message };
  }
});

// 发送剪贴板捕获通知
ipcMain.handle('show-clipboard-notification', async (_, { type, preview, source }) => {
  try {
    const notifySettings = db.getNotificationSettings();
    if (!notifySettings.enabled) return { success: false, reason: 'disabled' };
    
    const contentLength = (preview || '').length;
    if (contentLength < notifySettings.minContentLength) return { success: false, reason: 'too_short' };
    
    // 发送桌面通知
    const { Notification } = require('electron');
    
    let body = '';
    if (notifySettings.showPreview) {
      const truncated = contentLength > 100 ? preview.substring(0, 100) + '...' : preview;
      body = truncated;
    } else {
      const typeLabels = { text: '文本', code: '代码', image: '图片', file: '文件', url: '链接' };
      body = typeLabels[type] || '新内容';
    }
    
    const notification = new Notification({
      title: '📋 ClawBoard 已捕获',
      body,
      silent: !notifySettings.soundEnabled,
      timeoutType: 'default',
    });
    
    notification.show();
    return { success: true };
  } catch (err) {
    log.error('show-clipboard-notification error:', err);
    return { success: false, message: err.message };
  }
});

// ==================== v0.31.0: 智能粘贴功能 ====================

// 获取可用的智能粘贴类型
ipcMain.handle('get-smart-paste-types', async () => {
  try {
    if (!smartPaste) {
      smartPaste = new SmartPaste();
    }
    return smartPaste.getAvailableTypes();
  } catch (err) {
    log.error('get-smart-paste-types error:', err);
    return [];
  }
});

// 执行智能粘贴转换
ipcMain.handle('smart-paste-transform', async (_, { content, type, options }) => {
  try {
    if (!smartPaste) {
      smartPaste = new SmartPaste();
    }
    const result = smartPaste.transform(content, type, options);
    return { success: true, result };
  } catch (err) {
    log.error('smart-paste-transform error:', err);
    return { success: false, error: err.message };
  }
});

// 智能粘贴到剪贴板
ipcMain.handle('smart-paste-to-clipboard', async (_, { content, type, options }) => {
  try {
    if (!smartPaste) {
      smartPaste = new SmartPaste();
    }
    const result = smartPaste.transform(content, type, options);
    clipboard.writeText(result);
    return { success: true, result };
  } catch (err) {
    log.error('smart-paste-to-clipboard error:', err);
    return { success: false, error: err.message };
  }
});

// 获取忽略规则
ipcMain.handle('get-ignore-rules', async () => {
  try {
    if (!ignoreRules) {
      ignoreRules = new IgnoreRules();
    }
    return ignoreRules.getRules();
  } catch (err) {
    log.error('get-ignore-rules error:', err);
    return null;
  }
});

// 保存忽略规则
ipcMain.handle('save-ignore-rules', async (_, rules) => {
  try {
    if (!ignoreRules) {
      ignoreRules = new IgnoreRules();
    }
    // 更新规则
    ignoreRules.rules = rules;
    return { success: true };
  } catch (err) {
    log.error('save-ignore-rules error:', err);
    return { success: false, error: err.message };
  }
});

// 添加忽略应用
ipcMain.handle('add-ignored-app', async (_, pattern) => {
  try {
    if (!ignoreRules) {
      ignoreRules = new IgnoreRules();
    }
    ignoreRules.addIgnoredApp(pattern);
    return { success: true };
  } catch (err) {
    log.error('add-ignored-app error:', err);
    return { success: false, error: err.message };
  }
});

// 移除忽略应用
ipcMain.handle('remove-ignored-app', async (_, pattern) => {
  try {
    if (!ignoreRules) {
      ignoreRules = new IgnoreRules();
    }
    ignoreRules.removeIgnoredApp(pattern);
    return { success: true };
  } catch (err) {
    log.error('remove-ignored-app error:', err);
    return { success: false, error: err.message };
  }
});

// 测试内容是否应该被忽略
ipcMain.handle('test-ignore-rules', async (_, { content, metadata }) => {
  try {
    if (!ignoreRules) {
      ignoreRules = new IgnoreRules();
    }
    return ignoreRules.shouldIgnore(content, metadata);
  } catch (err) {
    log.error('test-ignore-rules error:', err);
    return { shouldIgnore: false, reason: '' };
  }
});

// ==================== v0.45.0: 自动加密规则 ====================

// 获取自动加密设置
ipcMain.handle('get-auto-encrypt-settings', async () => {
  try {
    if (!ignoreRules) {
      ignoreRules = new IgnoreRules();
    }
    return ignoreRules.getAutoEncryptSettings();
  } catch (err) {
    log.error('get-auto-encrypt-settings error:', err);
    return null;
  }
});

// 设置自动加密总开关
ipcMain.handle('set-auto-encrypt-enabled', async (_, enabled) => {
  try {
    if (!ignoreRules) {
      ignoreRules = new IgnoreRules();
    }
    ignoreRules.setAutoEncryptEnabled(enabled);
    // 同步到设置面板的忽略规则
    return { success: true };
  } catch (err) {
    log.error('set-auto-encrypt-enabled error:', err);
    return { success: false, error: err.message };
  }
});

// 切换自动加密内置规则
ipcMain.handle('toggle-auto-encrypt-rule', async (_, { type, enabled }) => {
  try {
    if (!ignoreRules) {
      ignoreRules = new IgnoreRules();
    }
    ignoreRules.toggleAutoEncryptRule(type, enabled);
    return { success: true };
  } catch (err) {
    log.error('toggle-auto-encrypt-rule error:', err);
    return { success: false, error: err.message };
  }
});

// 添加自定义自动加密规则
ipcMain.handle('add-custom-auto-encrypt-rule', async (_, { name, pattern }) => {
  try {
    if (!ignoreRules) {
      ignoreRules = new IgnoreRules();
    }
    ignoreRules.addCustomAutoEncryptRule(name, pattern);
    return { success: true };
  } catch (err) {
    log.error('add-custom-auto-encrypt-rule error:', err);
    return { success: false, error: err.message };
  }
});

// 移除自定义自动加密规则
ipcMain.handle('remove-custom-auto-encrypt-rule', async (_, name) => {
  try {
    if (!ignoreRules) {
      ignoreRules = new IgnoreRules();
    }
    ignoreRules.removeCustomAutoEncryptRule(name);
    return { success: true };
  } catch (err) {
    log.error('remove-custom-auto-encrypt-rule error:', err);
    return { success: false, error: err.message };
  }
});

// 批量自动加密已有记录（扫描所有未加密记录）
ipcMain.handle('batch-auto-encrypt', async () => {
  try {
    if (!ignoreRules) {
      ignoreRules = new IgnoreRules();
    }
    if (!db.encryptionKey) {
      return { success: false, message: '未设置加密密码' };
    }
    
    const records = db.getRecords({ limit: 10000 });
    let encryptedCount = 0;
    let skippedCount = 0;
    
    for (const record of records) {
      if (record.encrypted) { skippedCount++; continue; }
      
      const result = ignoreRules.shouldIgnore(record.content, {});
      if (result.autoEncrypt) {
        const success = db.encryptRecord(record.id);
        if (success) {
          // 更新敏感类型标记
          db.db.run(
            `UPDATE records SET sensitive_types = ? WHERE id = ?`,
            [result.types ? result.types.join(',') : '', record.id]
          );
          encryptedCount++;
        }
      }
    }
    
    db._save();
    log.info(`批量自动加密完成: ${encryptedCount} 条已加密, ${skippedCount} 条跳过`);
    return { success: true, encryptedCount, skippedCount };
  } catch (err) {
    log.error('batch-auto-encrypt error:', err);
    return { success: false, message: err.message };
  }
});\n
// ==================== v0.31.0: 自动过期清理 ====================

ipcMain.handle('get-auto-expiry-settings', async () => {
  try {
    return db.getAutoExpirySettings();
  } catch (err) {
    log.error('get-auto-expiry-settings error:', err);
    return { enabled: false, days: 30, keepFavorites: true };
  }
});

ipcMain.handle('save-auto-expiry-settings', async (_, settings) => {
  try {
    db.saveAutoExpirySettings(settings);
    startAutoExpiryTimer();
    return { success: true };
  } catch (err) {
    log.error('save-auto-expiry-settings error:', err);
    return { success: false, message: err.message };
  }
});

ipcMain.handle('get-expiry-stats', async () => {
  try {
    return db.getExpiryStats();
  } catch (err) {
    log.error('get-expiry-stats error:', err);
    return { total: 0, expired: 0, protected: 0 };
  }
});

ipcMain.handle('clean-expired-items', async () => {
  try {
    const count = db.cleanExpiredItems();
    return { success: true, count };
  } catch (err) {
    log.error('clean-expired-items error:', err);
    return { success: false, count: 0, message: err.message };
  }
});

// ==================== v0.32.0: 快捷键模板系统 ====================

ipcMain.handle('hotkey-get-all-slots', async () => {
  try {
    if (!hotkeyTemplates) return [];
    return hotkeyTemplates.getAllSlots();
  } catch (err) {
    log.error('hotkey-get-all-slots error:', err);
    return [];
  }
});

ipcMain.handle('hotkey-bind', async (_, { slot, label, content, isTemplate }) => {
  try {
    if (!hotkeyTemplates) return { success: false, message: '快捷键模板系统未初始化' };
    const result = hotkeyTemplates.bind(slot, label, content, isTemplate, (accelerator, rendered, lbl) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('hotkey-triggered', { accelerator, content: rendered, label: lbl });
      }
    });
    return result;
  } catch (err) {
    log.error('hotkey-bind error:', err);
    return { success: false, message: err.message };
  }
});

ipcMain.handle('hotkey-bind-from-item', async (_, { slot, clipboardItem }) => {
  try {
    if (!hotkeyTemplates) return { success: false, message: '快捷键模板系统未初始化' };
    const result = hotkeyTemplates.bindFromClipboardItem(slot, clipboardItem, (accelerator, rendered, lbl) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('hotkey-triggered', { accelerator, content: rendered, label: lbl });
      }
    });
    return result;
  } catch (err) {
    log.error('hotkey-bind-from-item error:', err);
    return { success: false, message: err.message };
  }
});

ipcMain.handle('hotkey-unbind', async (_, { slot }) => {
  try {
    if (!hotkeyTemplates) return false;
    return hotkeyTemplates.unbindSlot(slot);
  } catch (err) {
    log.error('hotkey-unbind error:', err);
    return false;
  }
});

ipcMain.handle('hotkey-render-template', async (_, { content }) => {
  try {
    if (!hotkeyTemplates) return content;
    return hotkeyTemplates.renderTemplate(content);
  } catch (err) {
    log.error('hotkey-render-template error:', err);
    return content;
  }
});

// ==================== v0.33.0: 格式转换 ====================

const textTransformer = new TextTransform();

ipcMain.handle('list-transforms', async () => {
  return textTransformer.listTransforms();
});

ipcMain.handle('apply-transform', async (_, { transformId, text }) => {
  try {
    const result = textTransformer.apply(transformId, text);
    return { success: true, ...result };
  } catch (err) {
    log.error('apply-transform error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('apply-transform-copy', async (_, { transformId, text }) => {
  try {
    const result = textTransformer.apply(transformId, text);
    clipboard.writeText(result.result);
    return { success: true, label: result.label, result: result.result };
  } catch (err) {
    log.error('apply-transform-copy error:', err);
    return { success: false, error: err.message };
  }
});
// ==================== v0.34.0: 导入导出 ====================

ipcMain.handle('export-records-json', async () => {
  try {
    const records = db.exportAllRecords();
    return { success: true, data: records };
  } catch (err) {
    log.error('export-records-json error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('export-records-csv', async () => {
  try {
    const csv = db.exportAllRecordsCSV();
    return { success: true, data: csv };
  } catch (err) {
    log.error('export-records-csv error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('import-records', async (_, { records, mode }) => {
  try {
    const result = db.importRecords(records, mode);
    return { success: true, ...result };
  } catch (err) {
    log.error('import-records error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('show-save-dialog', async (_, options) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, options);
    return result;
  } catch (err) {
    log.error('show-save-dialog error:', err);
    return { canceled: true };
  }
});

ipcMain.handle('show-open-dialog', async (_, options) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, options);
    return result;
  } catch (err) {
    log.error('show-open-dialog error:', err);
    return { canceled: true };
  }
});

ipcMain.handle('write-file', async (_, { filePath, content }) => {
  try {
    require('fs').writeFileSync(filePath, content, 'utf8');
    return { success: true };
  } catch (err) {
    log.error('write-file error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('read-file', async (_, { filePath }) => {
  try {
    const content = require('fs').readFileSync(filePath, 'utf8');
    return { success: true, content };
  } catch (err) {
    log.error('read-file error:', err);
    return { success: false, error: err.message };
  }
});

// ==================== v0.47.0: 文件路径快捷操作 ====================

// 在资源管理器中打开
ipcMain.handle('open-in-explorer', async (_, filePath) => {
  try {
    const fs = require('fs');
    // 检查路径是否存在
    if (!fs.existsSync(filePath)) {
      return { success: false, error: '路径不存在' };
    }
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      await shell.openPath(filePath);
    } else {
      // 打开文件所在目录并选中
      await shell.openPath(path.dirname(filePath));
    }
    return { success: true };
  } catch (err) {
    log.error('open-in-explorer error:', err);
    return { success: false, error: err.message };
  }
});

// 在终端中打开
ipcMain.handle('open-in-terminal', async (_, filePath) => {
  try {
    const fs = require('fs');
    let targetDir = filePath;
    
    // 如果是文件，取其所在目录
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        targetDir = path.dirname(filePath);
      }
    } else {
      return { success: false, error: '路径不存在' };
    }
    
    // Windows: 使用系统默认终端
    const { exec } = require('child_process');
    if (process.platform === 'win32') {
      // 优先尝试 Windows Terminal，回退到 cmd
      exec('where wt', (err) => {
        if (!err) {
          // Windows Terminal 可用
          exec(`wt -d "${targetDir}"`, { windowsHide: true });
        } else {
          // 回退到 cmd
          exec(`cmd /c start cmd /K "cd /d ${targetDir}"`, { windowsHide: true });
        }
      });
    } else if (process.platform === 'darwin') {
      exec(`open -a Terminal "${targetDir}"`);
    } else {
      exec(`gnome-terminal --working-directory="${targetDir}"`);
    }
    return { success: true };
  } catch (err) {
    log.error('open-in-terminal error:', err);
    return { success: false, error: err.message };
  }
});

// 检查路径是否存在
ipcMain.handle('check-path-exists', async (_, filePath) => {
  try {
    const fs = require('fs');
    if (!fs.existsSync(filePath)) {
      return { exists: false, type: null };
    }
    const stat = fs.statSync(filePath);
    return { exists: true, type: stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : 'other' };
  } catch (err) {
    return { exists: false, type: null };
  }
});

// 批量在资源管理器中打开
ipcMain.handle('batch-open-in-explorer', async (_, filePaths) => {
  try {
    let opened = 0;
    let failed = 0;
    const fs = require('fs');
    for (const fp of filePaths) {
      if (fs.existsSync(fp)) {
        const stat = fs.statSync(fp);
        if (stat.isDirectory()) {
          await shell.openPath(fp);
        } else {
          await shell.openPath(path.dirname(fp));
        }
        opened++;
      } else {
        failed++;
      }
    }
    return { success: true, opened, failed };
  } catch (err) {
    log.error('batch-open-in-explorer error:', err);
    return { success: false, error: err.message };
  }
});

// v0.39.0: Cycle mode IPC handlers
ipcMain.on('cycle-paste', (event, item) => {
  try {
    if (item && item.content) {
      clipboard.writeText(item.content);
      log.info('Cycle mode: pasted item #' + (item.id || 'unknown'));
    }
    if (cycleWindow && !cycleWindow.isDestroyed()) {
      cycleWindow.close();
    }
  } catch (err) {
    log.error('cycle-paste error:', err);
    if (cycleWindow && !cycleWindow.isDestroyed()) cycleWindow.close();
  }
});

ipcMain.on('cycle-cancel', () => {
  if (cycleWindow && !cycleWindow.isDestroyed()) {
    cycleWindow.close();
  }
});

// ==================== v0.48.0: 快捷片段 ====================

const Snippets = require('./snippets');
const snippets = new Snippets(db.db || db); // 传入底层 sql.js 数据库实例

ipcMain.handle('snippets-get-all', async (_, category) => {
  try { return snippets.getAll(category); } catch (e) { return { error: e.message }; }
});

ipcMain.handle('snippets-get-by-id', async (_, id) => {
  try { return snippets.getById(id); } catch (e) { return { error: e.message }; }
});

ipcMain.handle('snippets-search', async (_, query) => {
  try { return snippets.search(query); } catch (e) { return { error: e.message }; }
});

ipcMain.handle('snippets-create', async (_, data) => {
  try { return snippets.create(data); } catch (e) { return { error: e.message }; }
});

ipcMain.handle('snippets-update', async (_, { id, ...updates }) => {
  try { return snippets.update(id, updates); } catch (e) { return { error: e.message }; }
});

ipcMain.handle('snippets-delete', async (_, id) => {
  try { return snippets.delete(id); } catch (e) { return { error: e.message }; }
});

ipcMain.handle('snippets-get-categories', async () => {
  try { return snippets.getCategories(); } catch (e) { return { error: e.message }; }
});

ipcMain.handle('snippets-get-by-shortcut', async (_, shortcut) => {
  try { return snippets.getByShortcut(shortcut); } catch (e) { return { error: e.message }; }
});

ipcMain.handle('snippets-use', async (_, id) => {
  try {
    const snippet = snippets.use(id);
    if (snippet) {
      const content = snippets.renderContent(snippet.content);
      clipboard.writeText(content);
    }
    return snippet;
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle('snippets-create-from-record', async (_, { record, title, category }) => {
  try { return snippets.createFromRecord(record, { title, category }); } catch (e) { return { error: e.message }; }
});

ipcMain.handle('snippets-import', async (_, snippetList) => {
  try { return snippets.importSnippets(snippetList); } catch (e) { return { error: e.message }; }
});

ipcMain.handle('snippets-export', async () => {
  try { return snippets.exportSnippets(); } catch (e) { return { error: e.message }; }
});

ipcMain.handle('snippets-stats', async () => {
  try { return snippets.getStats(); } catch (e) { return { error: e.message }; }
});

ipcMain.handle('snippets-render-content', async (_, content) => {
  try {
    let rendered = snippets.renderContent(content);
    // 动态替换 {{clipboard}}
    if (rendered.includes('{{clipboard}}')) {
      const currentClipboard = clipboard.readText();
      rendered = rendered.split('{{clipboard}}').join(currentClipboard || '');
    }
    return rendered;
  } catch (e) { return { error: e.message }; }
});

// ==================== v0.37.0: 诊断信息 ====================

ipcMain.handle('get-diagnostics', async () => {
  try {
    const memUsage = process.memoryUsage();
    const dbPath = path.join(app.getPath('userData'), 'clawboard.db');
    let dbSize = 0;
    if (fs.existsSync(dbPath)) {
      dbSize = fs.statSync(dbPath).size;
    }
    const stats = db.getStats();
    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      chromeVersion: process.versions.chrome,
      platform: process.platform,
      arch: process.arch,
      osRelease: require('os').release(),
      totalMemory: Math.round(require('os').totalmem() / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      dbSize: dbSize,
      recordCount: stats.total,
      favoriteCount: stats.favorite,
      userDataPath: app.getPath('userData'),
      dbPath: dbPath,
      uptime: Math.round(process.uptime()),
    };
  } catch (err) {
    log.error('get-diagnostics error:', err);
    return { error: err.message };
  }
});

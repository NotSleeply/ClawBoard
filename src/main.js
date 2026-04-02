/**
 * ClawBoard - Electron 主进程
 * 负责窗口管理、系统托盘、IPC 通信
 */

const { app, BrowserWindow, Tray, Menu, ipcMain, clipboard, nativeImage, shell, dialog } = require('electron');
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

let mainWindow = null;
let tray = null;
let db = null;
let clipboardWatcher = null;

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
      return db.saveSettings(settings);
    } catch (err) {
      log.error('save-settings error:', err);
      return false;
    }
  });

  // 搜索（支持 AI 语义）
  ipcMain.handle('search', async (event, query) => {
    try {
      return db.search(query);
    } catch (err) {
      log.error('search error:', err);
      return [];
    }
  });

  log.info('IPC 处理器已注册');
}

// 应用启动
app.whenReady().then(async () => {
  log.info('应用准备就绪');

  // 初始化数据库（异步）
  db = new Database(app.getPath('userData'));
  await db._init();

  // 初始化剪贴板监控（传入 AI 模块）
  clipboardWatcher = new ClipboardWatcher(db, clipboard, log, AI);
  clipboardWatcher.start();

  // 创建窗口和托盘
  createWindow();
  createTray();

  // 注册 IPC
  setupIPC();

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

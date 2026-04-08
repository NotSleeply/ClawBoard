/**
 * ClawBoard - Electron 主进程
 * 负责窗口管理、系统托盘、IPC 通信
 */

const { app, BrowserWindow, Tray, Menu, ipcMain, clipboard, nativeImage, shell, dialog, globalShortcut } = require('electron');
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

let mainWindow = null;
let tray = null;
let db = null;
let clipboardWatcher = null;
let ocrService = null; // v0.17.0 OCR服务实例

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
      return db.saveSettings(settings);
    } catch (err) {
      log.error('save-settings error:', err);
      return false;
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

  // 注册全局快捷键（从设置读取）
  registerGlobalShortcut(settings);

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

// 注册全局快捷键
let currentShortcut = null;

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

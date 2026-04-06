/**
 * ClawBoard - 预加载脚本
 * 安全桥接主进程和渲染进程
 */

const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('ClawBoard', {
  // 记录相关
  getRecords: (options) => ipcRenderer.invoke('get-records', options),
  getRecord: (id) => ipcRenderer.invoke('get-record', id),
  toggleFavorite: (id) => ipcRenderer.invoke('toggle-favorite', id),
  deleteRecord: (id) => ipcRenderer.invoke('delete-record', id),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  getStats: () => ipcRenderer.invoke('get-stats'),
  getDetailedStats: () => ipcRenderer.invoke('get-detailed-stats'),
  getSourceApps: () => ipcRenderer.invoke('get-source-apps'),
  getAllTags: () => ipcRenderer.invoke('get-all-tags'),
  addTag: (recordId, tag) => ipcRenderer.invoke('add-tag', { recordId, tag }),
  removeTag: (recordId, tag) => ipcRenderer.invoke('remove-tag', { recordId, tag }),
  deleteTag: (tag) => ipcRenderer.invoke('delete-tag', tag),
  
  // 搜索相关
  search: (query) => ipcRenderer.invoke('search', query),
  
  // AI 相关
  aiSummary: (text) => ipcRenderer.invoke('ai-summary', text),
  
  // 设置相关
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  updateShortcut: (shortcut) => ipcRenderer.invoke('update-shortcut', shortcut),
  saveShortcuts: (shortcuts) => ipcRenderer.invoke('save-settings', { shortcuts }),
  
  // 加密相关
  setEncryptionPassword: (password) => ipcRenderer.invoke('set-encryption-password', password),
  clearEncryptionKey: () => ipcRenderer.invoke('clear-encryption-key'),
  encryptRecord: (id) => ipcRenderer.invoke('encrypt-record', id),
  decryptRecord: (id) => ipcRenderer.invoke('decrypt-record', id),
  removeEncryption: (id) => ipcRenderer.invoke('remove-encryption', id),
  
  // v0.17.0: OCR 相关
  ocrRecognize: (imagePath) => ipcRenderer.invoke('ocr-recognize', imagePath),
  getOCRText: (id) => ipcRenderer.invoke('get-ocr-text', id),
  
  // 事件监听
  onNewRecord: (callback) => {
    ipcRenderer.on('new-record', (event, record) => callback(record));
  },
  onFocusSearch: (callback) => {
    ipcRenderer.on('focus-search', () => callback());
  },
  
  // 移除监听
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});

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
  
  // 搜索相关
  search: (query) => ipcRenderer.invoke('search', query),
  
  // AI 相关
  aiSummary: (text) => ipcRenderer.invoke('ai-summary', text),
  
  // 设置相关
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  updateShortcut: (shortcut) => ipcRenderer.invoke('update-shortcut', shortcut),
  
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

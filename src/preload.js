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
  updateNote: (id, note) => ipcRenderer.invoke('update-note', { id, note }),
  updateItemContent: (id, content) => ipcRenderer.invoke('update-item-content', { id, content }),
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
  findSimilar: (content) => ipcRenderer.invoke('find-similar', content),
  findDuplicates: () => ipcRenderer.invoke('find-duplicates'),
  cleanupDuplicates: () => ipcRenderer.invoke('cleanup-duplicates'),
  
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
  // v0.53.0: OCR 语言管理
  getOcrLanguages: () => ipcRenderer.invoke('get-ocr-languages'),
  setOcrLanguage: (langCodes) => ipcRenderer.invoke('set-ocr-language', langCodes),
  getCurrentOcrLanguage: () => ipcRenderer.invoke('get-current-ocr-language'),
  
  // v0.23.0: 保存记录（用于合并功能）
  saveRecord: (record) => ipcRenderer.invoke('save-record', record),
  
  // v0.24.0: 分组管理
  getAllGroups: () => ipcRenderer.invoke('get-all-groups'),
  createGroup: (name, color, icon) => ipcRenderer.invoke('create-group', { name, color, icon }),
  updateGroup: (id, updates) => ipcRenderer.invoke('update-group', { id, ...updates }),
  deleteGroup: (id) => ipcRenderer.invoke('delete-group', id),
  toggleGroupCollapsed: (id) => ipcRenderer.invoke('toggle-group-collapsed', id),
  moveRecordToGroup: (recordId, groupId) => ipcRenderer.invoke('move-record-to-group', { recordId, groupId }),
  updateRecordSortOrder: (recordId, newOrder, newGroupId) => ipcRenderer.invoke('update-record-sort-order', { recordId, newOrder, newGroupId }),
  batchUpdateSortOrder: (updates) => ipcRenderer.invoke('batch-update-sort-order', updates),

  // v0.25.0: 统计导出
  getStatsForExport: () => ipcRenderer.invoke('get-stats-for-export'),
  exportRecords: (format, options) => ipcRenderer.invoke('export-records', { format, options }),
  saveExportFile: (content, filename) => ipcRenderer.invoke('save-export-file', { content, filename }),
  
  // v0.26.0: 运行时健康监控
  getRuntimeStats: () => ipcRenderer.invoke('get-runtime-stats'),
  // v0.44.0: 系统健康状态（包含数据库大小）
  getSystemHealth: () => ipcRenderer.invoke('get-system-health'),

  // v0.27.0: 置顶记录管理
  getPinnedRecords: (options) => ipcRenderer.invoke('get-pinned-records', options),
  updatePinnedRecord: (id, updates) => ipcRenderer.invoke('update-pinned-record', id, updates),
  batchUpdatePinned: (ids, options) => ipcRenderer.invoke('batch-update-pinned', ids, options),
  getPinnedStats: () => ipcRenderer.invoke('get-pinned-stats'),
  
  // 事件监听
  onNewRecord: (callback) => {
    ipcRenderer.on('new-record', (event, record) => callback(record));
  },
  onFocusSearch: (callback) => {
    ipcRenderer.on('focus-search', () => callback());
  },
  
  // v0.28.0: 云端同步
  getSyncMetadata: () => ipcRenderer.invoke('get-sync-metadata'),
  saveSyncConfig: (config) => ipcRenderer.invoke('save-sync-config', config),
  getSyncStats: () => ipcRenderer.invoke('get-sync-stats'),
  exportForSync: (options) => ipcRenderer.invoke('export-for-sync', options),
  importFromSync: (syncData, encryptionKey, options) => ipcRenderer.invoke('import-from-sync', syncData, encryptionKey, options),
  testWebDAVConnection: (config) => ipcRenderer.invoke('test-webdav-connection', config),
  syncToWebDAV: (config) => ipcRenderer.invoke('sync-to-webdav', config),
  syncFromWebDAV: (config) => ipcRenderer.invoke('sync-from-webdav', config),

  // v0.29.0: 通知与声音
  getNotificationSettings: () => ipcRenderer.invoke('get-notification-settings'),
  saveNotificationSettings: (settings) => ipcRenderer.invoke('save-notification-settings', settings),
  showClipboardNotification: (data) => ipcRenderer.invoke('show-clipboard-notification', data),
  // v0.31.0: 自动过期清理
  getAutoExpirySettings: () => ipcRenderer.invoke('get-auto-expiry-settings'),
  saveAutoExpirySettings: (settings) => ipcRenderer.invoke('save-auto-expiry-settings', settings),
  getExpiryStats: () => ipcRenderer.invoke('get-expiry-stats'),
  cleanExpiredItems: () => ipcRenderer.invoke('clean-expired-items'),
  onExpiryCleanup: (callback) => ipcRenderer.on('expiry-cleanup', (_, data) => callback(data)),

  // v0.31.0: 智能粘贴
  getSmartPasteTypes: () => ipcRenderer.invoke('get-smart-paste-types'),
  smartPasteTransform: (content, type, options) => ipcRenderer.invoke('smart-paste-transform', { content, type, options }),
  smartPasteToClipboard: (content, type, options) => ipcRenderer.invoke('smart-paste-to-clipboard', { content, type, options }),

  // v0.31.0: 忽略规则
  getIgnoreRules: () => ipcRenderer.invoke('get-ignore-rules'),
  saveIgnoreRules: (rules) => ipcRenderer.invoke('save-ignore-rules', rules),
  addIgnoredApp: (pattern) => ipcRenderer.invoke('add-ignored-app', pattern),
  removeIgnoredApp: (pattern) => ipcRenderer.invoke('remove-ignored-app', pattern),
  testIgnoreRules: (content, metadata) => ipcRenderer.invoke('test-ignore-rules', { content, metadata }),

  // v0.45.0: 自动加密规则
  getAutoEncryptSettings: () => ipcRenderer.invoke('get-auto-encrypt-settings'),
  setAutoEncryptEnabled: (enabled) => ipcRenderer.invoke('set-auto-encrypt-enabled', enabled),
  toggleAutoEncryptRule: (type, enabled) => ipcRenderer.invoke('toggle-auto-encrypt-rule', { type, enabled }),
  addCustomAutoEncryptRule: (name, pattern) => ipcRenderer.invoke('add-custom-auto-encrypt-rule', { name, pattern }),
  removeCustomAutoEncryptRule: (name) => ipcRenderer.invoke('remove-custom-auto-encrypt-rule', name),
  batchAutoEncrypt: () => ipcRenderer.invoke('batch-auto-encrypt'),

  // v0.32.0: 快捷键模板系统
  hotkeyGetAllSlots: () => ipcRenderer.invoke('hotkey-get-all-slots'),
  hotkeyBind: (slot, label, content, isTemplate) => ipcRenderer.invoke('hotkey-bind', { slot, label, content, isTemplate }),
  hotkeyBindFromItem: (slot, clipboardItem) => ipcRenderer.invoke('hotkey-bind-from-item', { slot, clipboardItem }),
  hotkeyUnbind: (slot) => ipcRenderer.invoke('hotkey-unbind', { slot }),
  hotkeyRenderTemplate: (content) => ipcRenderer.invoke('hotkey-render-template', { content }),
  // v0.33.0: 格式转换
  listTransforms: () => ipcRenderer.invoke('list-transforms'),
  applyTransform: (data) => ipcRenderer.invoke('apply-transform', data),
  applyTransformCopy: (data) => ipcRenderer.invoke('apply-transform-copy', data),
  // v0.34.0: 导入导出
  exportRecordsJSON: () => ipcRenderer.invoke('export-records-json'),
  exportRecordsCSV: () => ipcRenderer.invoke('export-records-csv'),
  importRecords: (data) => ipcRenderer.invoke('import-records', data),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  writeFile: (data) => ipcRenderer.invoke('write-file', data),
  readFile: (data) => ipcRenderer.invoke('read-file', data),
  onHotkeyTriggered: (callback) => ipcRenderer.on('hotkey-triggered', (_, data) => callback(data)),
  // v0.37.0: 诊断信息
  getDiagnostics: () => ipcRenderer.invoke('get-diagnostics'),


  // v0.49.0: 文件路径快捷操作增强
  fileLaunch: (filePath) => ipcRenderer.invoke('file-launch', filePath),
  fileOpenExplorer: (filePath) => ipcRenderer.invoke('file-open-explorer', filePath),
  fileOpenTerminal: (filePath) => ipcRenderer.invoke('file-open-terminal', filePath),
  // v0.52.0: Copy image to user-chosen path
  copyImageToPath: (srcPath, destPath) => ipcRenderer.invoke('copy-image-to-path', { srcPath, destPath }),
  // v0.47.0: 文件路径快捷操作
  openInExplorer: (filePath) => ipcRenderer.invoke('open-in-explorer', filePath),
  openInTerminal: (filePath) => ipcRenderer.invoke('open-in-terminal', filePath),
  checkPathExists: (filePath) => ipcRenderer.invoke('check-path-exists', filePath),
  batchOpenInExplorer: (filePaths) => ipcRenderer.invoke('batch-open-in-explorer', filePaths),

  // v0.48.0: 快捷片段
  snippetsGetAll: (category) => ipcRenderer.invoke('snippets-get-all', category),
  snippetsGetById: (id) => ipcRenderer.invoke('snippets-get-by-id', id),
  snippetsSearch: (query) => ipcRenderer.invoke('snippets-search', query),
  snippetsCreate: (data) => ipcRenderer.invoke('snippets-create', data),
  snippetsUpdate: (id, updates) => ipcRenderer.invoke('snippets-update', { id, ...updates }),
  snippetsDelete: (id) => ipcRenderer.invoke('snippets-delete', id),
  snippetsGetCategories: () => ipcRenderer.invoke('snippets-get-categories'),
  snippetsGetByShortcut: (shortcut) => ipcRenderer.invoke('snippets-get-by-shortcut', shortcut),
  snippetsUse: (id) => ipcRenderer.invoke('snippets-use', id),
  snippetsCreateFromRecord: (record, title, category) => ipcRenderer.invoke('snippets-create-from-record', { record, title, category }),
  snippetsImport: (list) => ipcRenderer.invoke('snippets-import', list),
  snippetsExport: () => ipcRenderer.invoke('snippets-export'),
  snippetsStats: () => ipcRenderer.invoke('snippets-stats'),
  snippetsRenderContent: (content) => ipcRenderer.invoke('snippets-render-content', content),

  // 移除监听
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});

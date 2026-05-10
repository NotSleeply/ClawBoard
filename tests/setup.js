// Jest 测试环境设置
// 模拟 Electron API
global.window = {
  webContents: {
    send: jest.fn(),
  },
  isDestroyed: () => false,
};

// 模拟 BrowserWindow
const { mock } = require('jest-mock');
global.BrowserWindow = {
  getAllWindows: () => [],
  fromWebContents: () => null,
};

// 模拟 ipcMain 和 ipcRenderer
global.ipcMain = {
  handle: jest.fn(),
  on: jest.fn(),
};

global.ipcRenderer = {
  invoke: jest.fn(),
  on: jest.fn(),
  send: jest.fn(),
};

// 模拟 app
global.app = {
  getPath: (name) => `/tmp/test-${name}`,
  getVersion: () => '0.76.0',
  getName: () => 'ClawBoard',
  on: jest.fn(),
  quit: jest.fn(),
  isPackaged: false,
};

// 模拟 dialog
global.dialog = {
  showMessageBox: jest.fn().mockResolvedValue({ response: 0 }),
  showOpenDialog: jest.fn().mockResolvedValue({ canceled: false, filePaths: [] }),
  showSaveDialog: jest.fn().mockResolvedValue({ canceled: false, filePath: '' }),
};

// 设置测试超时
jest.setTimeout(10000);

// 全局错误处理
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection in Test:', reason);
});

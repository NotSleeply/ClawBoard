import { vi } from 'vitest';

global.window = {
  webContents: { send: vi.fn() },
  isDestroyed: () => false
};

global.BrowserWindow = {
  getAllWindows: () => [],
  fromWebContents: () => null
};

global.ipcMain = { handle: vi.fn(), on: vi.fn() };
global.ipcRenderer = { invoke: vi.fn(), on: vi.fn(), send: vi.fn() };

global.app = {
  getPath: name => `/tmp/test-${name}`,
  getVersion: () => '0.76.0',
  getName: () => 'ClawBoard',
  on: vi.fn(),
  quit: vi.fn(),
  isPackaged: false
};

global.dialog = {
  showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
  showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [] }),
  showSaveDialog: vi.fn().mockResolvedValue({ canceled: false, filePath: '' })
};

process.on('unhandledRejection', reason => {
  console.error('Unhandled Rejection in Test:', reason);
});

const path = require('path');
const fs = require('fs');
const os = require('os');

// Simple logger replacement for electron-log
const log = {
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  debug: (...args) => console.log('[DEBUG]', ...args)
};

// Ensure log directory exists
const logDir = path.join(os.homedir(), '.clawboard', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Log to file as well
const logFile = path.join(logDir, 'watcher.log');
log.info = (...args) => {
  const msg = `[INFO] ${args.join(' ')}`;
  console.log(msg);
  fs.appendFileSync(logFile, `${new Date().toISOString()} ${msg}\n`);
};
log.warn = (...args) => {
  const msg = `[WARN] ${args.join(' ')}`;
  console.warn(msg);
  fs.appendFileSync(logFile, `${new Date().toISOString()} ${msg}\n`);
};
log.error = (...args) => {
  const msg = `[ERROR] ${args.join(' ')}`;
  console.error(msg);
  fs.appendFileSync(logFile, `${new Date().toISOString()} ${msg}\n`);
};

log.info('[Watcher] 剪贴板监控守护进程启动');

const Database = require('../core/database/Database');
const ClipboardWatcher = require('../core/clipboard/ClipboardWatcher');
const AI = require('../core/ai/AIService');

const dataDir = process.env.CLAWBOARD_DATA || path.join(os.homedir(), '.clawboard');

const db = new Database(dataDir);

const clipboard = {
  readText: () => {
    const { execSync } = require('child_process');
    try {
      if (process.platform === 'win32') {
        return execSync('powershell -Command "Get-Clipboard"', {
          encoding: 'utf8',
          windowsHide: true
        }).trim();
      } else if (process.platform === 'darwin') {
        return execSync('pbpaste', { encoding: 'utf8' }).trim();
      } else {
        return execSync('xclip -selection clipboard -o', { encoding: 'utf8' }).trim();
      }
    } catch {
      return '';
    }
  },
  readImage: () => null
};

const watcher = new ClipboardWatcher(db, clipboard, log, AI, null);
watcher.start();

log.info('[Watcher] 监控已启动');

process.on('SIGTERM', () => {
  log.info('[Watcher] 收到 SIGTERM，正在停止...');
  watcher.stop();
  db.close();
  const pidFile = path.join(dataDir, 'watcher.pid');
  if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
  process.exit(0);
});

process.on('SIGINT', () => {
  watcher.stop();
  db.close();
  process.exit(0);
});

process.on('uncaughtException', err => {
  log.error('[Watcher] Uncaught Exception:', err);
});

process.on('unhandledRejection', reason => {
  log.error('[Watcher] Unhandled Rejection:', reason);
});

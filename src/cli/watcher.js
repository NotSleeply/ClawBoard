const path = require('path');
const fs = require('fs');
const os = require('os');

const logDir = path.join(os.homedir(), '.board-clip', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFile = path.join(logDir, 'watcher.log');
function writeLog(level, ...args) {
  const msg = `[${level}] ${args.join(' ')}`;
  const line = `${new Date().toISOString()} ${msg}\n`;
  console.log(msg);
  try {
    fs.appendFileSync(logFile, line);
  } catch {}
}

const log = {
  info: (...args) => writeLog('INFO', ...args),
  warn: (...args) => writeLog('WARN', ...args),
  error: (...args) => writeLog('ERROR', ...args),
  debug: (...args) => writeLog('DEBUG', ...args)
};

async function main() {
  log.info('[Watcher] 剪贴板监控守护进程启动');

  const Database = require('../core/database/Database');
  const ClipboardWatcher = require('../core/clipboard/ClipboardWatcher');
  const AI = require('../core/ai/AIService');

  const dataDir = process.env.BOARD_CLIP_DATA || path.join(os.homedir(), '.board-clip');

  const db = new Database(dataDir);
  await db._init();

  const clipboard = {
    readText: () => {
      const { execSync } = require('child_process');
      try {
        if (process.platform === 'win32') {
          return execSync(
            'powershell -NoProfile -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Clipboard"',
            {
              encoding: 'utf8',
              windowsHide: true,
              timeout: 5000
            }
          ).replace(/\r?\n$/, '');
        } else if (process.platform === 'darwin') {
          return execSync('pbpaste', { encoding: 'utf8', timeout: 5000 }).replace(/\r?\n$/, '');
        } else {
          return execSync('xclip -selection clipboard -o', {
            encoding: 'utf8',
            timeout: 5000
          }).replace(/\r?\n$/, '');
        }
      } catch {
        return '';
      }
    },
    readImage: () => null
  };

  const watcher = new ClipboardWatcher(db, clipboard, log, AI);
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
}

main().catch(err => {
  log.error('[Watcher] 启动失败:', err);
  process.exit(1);
});

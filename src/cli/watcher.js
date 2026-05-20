const path = require('path');
const fs = require('fs');
const os = require('os');
const log = require('electron-log');

log.transports.file.resolvePathFn = () =>
    path.join(os.homedir(), '.clawboard', 'logs', 'watcher.log');
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
                return execSync('powershell -Command "Get-Clipboard"', { encoding: 'utf8', windowsHide: true }).trim();
            } else if (process.platform === 'darwin') {
                return execSync('pbpaste', { encoding: 'utf8' }).trim();
            } else {
                return execSync('xclip -selection clipboard -o', { encoding: 'utf8' }).trim();
            }
        } catch {
            return '';
        }
    },
    readImage: () => null,
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

process.on('uncaughtException', (err) => {
    log.error('[Watcher] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
    log.error('[Watcher] Unhandled Rejection:', reason);
});

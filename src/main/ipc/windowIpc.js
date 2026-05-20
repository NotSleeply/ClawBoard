const path = require('path');

function setupWindowIpc(ipcMain, db, log, getMainWindow, getClipboardWatcher, getTray, getMonitoringPaused, setMonitoringPaused) {
    ipcMain.handle("toggle-monitoring", async () => {
        try {
            const clipboardWatcher = getClipboardWatcher();
            const monitoringPaused = getMonitoringPaused();
            if (monitoringPaused) {
                clipboardWatcher.start();
                setMonitoringPaused(false);
                const tray = getTray();
                if (tray)
                    tray.setImage(path.join(__dirname, "../assets/tray-icon.png"));
                return { success: true, paused: false };
            } else {
                clipboardWatcher.stop();
                setMonitoringPaused(true);
                const tray = getTray();
                if (tray)
                    tray.setImage(path.join(__dirname, "../assets/tray-icon.png"));
                return { success: true, paused: true };
            }
        } catch (e) {
            log.error("toggle-monitoring error:", e);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle("get-monitoring-status", async () => {
        return { paused: getMonitoringPaused() };
    });

    ipcMain.handle("set-always-on-top", async (event, flag) => {
        try {
            const mainWindow = getMainWindow();
            if (mainWindow) {
                mainWindow.setAlwaysOnTop(flag);
                return true;
            }
            return false;
        } catch (err) {
            log.error("set-always-on-top error:", err);
            return false;
        }
    });

    ipcMain.handle("toggle-lock", async (event, id) => {
        try {
            return db.toggleLock(id);
        } catch (err) {
            log.error("toggle-lock error:", err);
            return false;
        }
    });
}

module.exports = setupWindowIpc;

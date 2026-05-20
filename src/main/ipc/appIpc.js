function setupAppIpc(ipcMain, db, log, app, autoUpdater, registerGlobalShortcut) {
    ipcMain.handle("check-for-updates", async () => {
        try {
            if (
                process.env.NODE_ENV === "development" ||
                process.argv.includes("--dev")
            ) {
                return { success: false, message: "开发模式下无法检查更新" };
            }
            const result = await autoUpdater.checkForUpdates();
            if (result && result.updateInfo) {
                return { success: true, version: result.updateInfo.version };
            }
            return { success: true, message: "已是最新版本" };
        } catch (err) {
            log.error("[AutoUpdater] 手动检查更新失败:", err.message);
            return { success: false, message: err.message };
        }
    });

    ipcMain.handle("get-app-version", async () => {
        return app.getVersion();
    });

    ipcMain.handle("update-shortcut", async (event, shortcut) => {
        try {
            const settings = db.getSettings();
            settings.globalShortcut = shortcut;
            db.saveSettings(settings);

            registerGlobalShortcut(settings);

            return { success: true };
        } catch (err) {
            log.error("update-shortcut error:", err);
            return { success: false, message: err.message };
        }
    });
}

module.exports = setupAppIpc;

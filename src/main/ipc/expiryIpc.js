function setupExpiryIpc(ipcMain, db, log, startAutoExpiryTimer) {
    ipcMain.handle("get-auto-expiry-settings", async () => {
        try {
            return db.getAutoExpirySettings();
        } catch (err) {
            log.error("get-auto-expiry-settings error:", err);
            return { enabled: false, days: 30, keepFavorites: true };
        }
    });

    ipcMain.handle("save-auto-expiry-settings", async (_, settings) => {
        try {
            db.saveAutoExpirySettings(settings);
            startAutoExpiryTimer();
            return { success: true };
        } catch (err) {
            log.error("save-auto-expiry-settings error:", err);
            return { success: false, message: err.message };
        }
    });

    ipcMain.handle("get-expiry-stats", async () => {
        try {
            return db.getExpiryStats();
        } catch (err) {
            log.error("get-expiry-stats error:", err);
            return { total: 0, expired: 0, protected: 0 };
        }
    });

    ipcMain.handle("clean-expired-items", async () => {
        try {
            const count = db.cleanExpiredItems();
            return { success: true, count };
        } catch (err) {
            log.error("clean-expired-items error:", err);
            return { success: false, count: 0, message: err.message };
        }
    });
}

module.exports = setupExpiryIpc;

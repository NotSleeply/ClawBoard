const { Notification } = require('electron');

function setupSettingsIpc(ipcMain, db, log, getApp, getNotificationSettings, updateNotificationSettings, showClipboardNotification) {
    ipcMain.handle("get-settings", async () => {
        try {
            return db.getSettings();
        } catch (err) {
            log.error("get-settings error:", err);
            return {};
        }
    });

    ipcMain.handle("save-settings", async (event, settings) => {
        try {
            const app = getApp();
            if (settings.autoStart !== undefined) {
                app.setLoginItemSettings({
                    openAtLogin: settings.autoStart,
                    path: app.getPath("exe"),
                });
            }
            updateNotificationSettings(settings);
            return db.saveSettings(settings);
        } catch (err) {
            log.error("save-settings error:", err);
            return false;
        }
    });

    ipcMain.handle("get-notification-settings", async () => {
        try {
            const ns = getNotificationSettings();
            return {
                enabled: ns.enabled,
                soundEnabled: ns.soundEnabled,
                showPreview: ns.showPreview,
                ignoreLargeText: ns.ignoreLargeText,
                largeTextThreshold: ns.largeTextThreshold,
                mergeEnabled: ns.mergeEnabled,
                mergeWindow: ns.mergeWindow,
                position: ns.position,
            };
        } catch (err) {
            log.error("get-notification-settings error:", err);
            return null;
        }
    });

    ipcMain.handle("update-notification-settings", async (event, settings) => {
        try {
            updateNotificationSettings(settings);
            const dbSettings = db.getSettings();
            dbSettings.notificationEnabled = settings.enabled;
            dbSettings.notificationSound = settings.soundEnabled;
            dbSettings.notificationPreview = settings.showPreview;
            dbSettings.notificationIgnoreLarge = settings.ignoreLargeText;
            dbSettings.notificationLargeThreshold = settings.largeTextThreshold;
            dbSettings.notificationMergeEnabled = settings.mergeEnabled;
            dbSettings.notificationMergeWindow = settings.mergeWindow;
            dbSettings.notificationPosition = settings.position;
            return db.saveSettings(dbSettings);
        } catch (err) {
            log.error("update-notification-settings error:", err);
            return false;
        }
    });

    ipcMain.handle("test-notification", async () => {
        try {
            showClipboardNotification({
                type: "text",
                content: "这是一条测试通知 📋 ClawBoard 通知功能已启用！",
                id: "test",
            });
            return { success: true };
        } catch (err) {
            log.error("test-notification error:", err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("save-notification-settings", async (_, settings) => {
        try {
            db.saveNotificationSettings(settings);
            return { success: true };
        } catch (err) {
            log.error("save-notification-settings error:", err);
            return { success: false, message: err.message };
        }
    });

    ipcMain.handle(
        "show-clipboard-notification",
        async (_, { type, preview, source }) => {
            try {
                const notifySettings = db.getNotificationSettings();
                if (!notifySettings.enabled)
                    return { success: false, reason: "disabled" };

                const contentLength = (preview || "").length;
                if (contentLength < notifySettings.minContentLength)
                    return { success: false, reason: "too_short" };

                let body = "";
                if (notifySettings.showPreview) {
                    const truncated =
                        contentLength > 100 ? preview.substring(0, 100) + "..." : preview;
                    body = truncated;
                } else {
                    const typeLabels = {
                        text: "文本",
                        code: "代码",
                        image: "图片",
                        file: "文件",
                        url: "链接",
                    };
                    body = typeLabels[type] || "新内容";
                }

                const notification = new Notification({
                    title: "📋 ClawBoard 已捕获",
                    body,
                    silent: !notifySettings.soundEnabled,
                    timeoutType: "default",
                });

                notification.show();
                return { success: true };
            } catch (err) {
                log.error("show-clipboard-notification error:", err);
                return { success: false, message: err.message };
            }
        },
    );
}

module.exports = setupSettingsIpc;

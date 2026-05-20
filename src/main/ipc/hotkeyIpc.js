function setupHotkeyIpc(ipcMain, log, getHotkeyTemplates, getMainWindow) {
    ipcMain.handle("hotkey-get-all-slots", async () => {
        try {
            const hotkeyTemplates = getHotkeyTemplates();
            if (!hotkeyTemplates) return [];
            return hotkeyTemplates.getAllSlots();
        } catch (err) {
            log.error("hotkey-get-all-slots error:", err);
            return [];
        }
    });

    ipcMain.handle(
        "hotkey-bind",
        async (_, { slot, label, content, isTemplate }) => {
            try {
                const hotkeyTemplates = getHotkeyTemplates();
                if (!hotkeyTemplates)
                    return { success: false, message: "快捷键模板系统未初始化" };
                const result = hotkeyTemplates.bind(
                    slot,
                    label,
                    content,
                    isTemplate,
                    (accelerator, rendered, lbl) => {
                        const mainWindow = getMainWindow();
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send("hotkey-triggered", {
                                accelerator,
                                content: rendered,
                                label: lbl,
                            });
                        }
                    },
                );
                return result;
            } catch (err) {
                log.error("hotkey-bind error:", err);
                return { success: false, message: err.message };
            }
        },
    );

    ipcMain.handle("hotkey-bind-from-item", async (_, { slot, clipboardItem }) => {
        try {
            const hotkeyTemplates = getHotkeyTemplates();
            if (!hotkeyTemplates)
                return { success: false, message: "快捷键模板系统未初始化" };
            const result = hotkeyTemplates.bindFromClipboardItem(
                slot,
                clipboardItem,
                (accelerator, rendered, lbl) => {
                    const mainWindow = getMainWindow();
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send("hotkey-triggered", {
                            accelerator,
                            content: rendered,
                            label: lbl,
                        });
                    }
                },
            );
            return result;
        } catch (err) {
            log.error("hotkey-bind-from-item error:", err);
            return { success: false, message: err.message };
        }
    });

    ipcMain.handle("hotkey-unbind", async (_, { slot }) => {
        try {
            const hotkeyTemplates = getHotkeyTemplates();
            if (!hotkeyTemplates) return false;
            return hotkeyTemplates.unbindSlot(slot);
        } catch (err) {
            log.error("hotkey-unbind error:", err);
            return false;
        }
    });

    ipcMain.handle("hotkey-render-template", async (_, { content }) => {
        try {
            const hotkeyTemplates = getHotkeyTemplates();
            if (!hotkeyTemplates) return content;
            return hotkeyTemplates.renderTemplate(content);
        } catch (err) {
            log.error("hotkey-render-template error:", err);
            return content;
        }
    });
}

module.exports = setupHotkeyIpc;

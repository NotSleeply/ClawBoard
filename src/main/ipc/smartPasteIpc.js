const { clipboard } = require('electron');
const SmartPaste = require('../../utils/smart-paste');

function setupSmartPasteIpc(ipcMain, log, getSmartPaste) {
    ipcMain.handle("get-smart-paste-types", async () => {
        try {
            let smartPaste = getSmartPaste();
            if (!smartPaste) {
                smartPaste = new SmartPaste();
            }
            return smartPaste.getAvailableTypes();
        } catch (err) {
            log.error("get-smart-paste-types error:", err);
            return [];
        }
    });

    ipcMain.handle(
        "smart-paste-transform",
        async (_, { content, type, options }) => {
            try {
                let smartPaste = getSmartPaste();
                if (!smartPaste) {
                    smartPaste = new SmartPaste();
                }
                const result = smartPaste.transform(content, type, options);
                return { success: true, result };
            } catch (err) {
                log.error("smart-paste-transform error:", err);
                return { success: false, error: err.message };
            }
        },
    );

    ipcMain.handle(
        "smart-paste-to-clipboard",
        async (_, { content, type, options }) => {
            try {
                let smartPaste = getSmartPaste();
                if (!smartPaste) {
                    smartPaste = new SmartPaste();
                }
                const result = smartPaste.transform(content, type, options);
                clipboard.writeText(result);
                return { success: true, result };
            } catch (err) {
                log.error("smart-paste-to-clipboard error:", err);
                return { success: false, error: err.message };
            }
        },
    );
}

module.exports = setupSmartPasteIpc;

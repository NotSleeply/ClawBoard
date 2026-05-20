function setupFormatIpc(ipcMain, log, TextFormatter, getPasteModeManager) {
    ipcMain.handle("format-text", async (_, text, formatType) => {
        try {
            let result = '';
            switch (formatType) {
                case 'plain':
                    result = TextFormatter.toPlainText(text);
                    break;
                case 'uppercase':
                    result = TextFormatter.toUpperCase(text);
                    break;
                case 'lowercase':
                    result = TextFormatter.toLowerCase(text);
                    break;
                case 'titlecase':
                    result = TextFormatter.toTitleCase(text);
                    break;
                case 'sentencecase':
                    result = TextFormatter.toSentenceCase(text);
                    break;
                case 'togglecase':
                    result = TextFormatter.toggleCase(text);
                    break;
                case 'strip-html':
                    result = TextFormatter.stripHTML(text);
                    break;
                case 'strip-markdown':
                    result = TextFormatter.stripMarkdown(text);
                    break;
                default:
                    result = text;
            }

            return { success: true, data: result, originalLength: text.length, newLength: result.length };
        } catch (err) {
            log.error("format-text error:", err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("get-text-stats", async (_, text) => {
        try {
            const stats = TextFormatter.getStats(text);
            return { success: true, stats };
        } catch (err) {
            log.error("get-text-stats error:", err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("paste-with-mode", async (_, text, modeId) => {
        try {
            const pasteModeManager = getPasteModeManager();
            if (!pasteModeManager) {
                return { success: false, error: '粘贴模式管理器未初始化' };
            }

            const result = pasteModeManager.paste(text, modeId);
            return result;
        } catch (err) {
            log.error("paste-with-mode error:", err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("preview-paste-modes", async (_, text) => {
        try {
            const pasteModeManager = getPasteModeManager();
            if (!pasteModeManager) {
                return { success: false, error: '粘贴模式管理器未初始化', modes: [] };
            }

            const previews = pasteModeManager.previewAllModes(text);
            return { success: true, modes: previews };
        } catch (err) {
            log.error("preview-paste-modes error:", err);
            return { success: false, error: err.message, modes: [] };
        }
    });

    ipcMain.handle("get-paste-modes", async () => {
        try {
            const pasteModeManager = getPasteModeManager();
            if (!pasteModeManager) {
                return { success: false, error: '未初始化', modes: [] };
            }

            const modes = pasteModeManager.getModes();
            return { success: true, modes };
        } catch (err) {
            log.error("get-paste-modes error:", err);
            return { success: false, error: err.message, modes: [] };
        }
    });
}

module.exports = setupFormatIpc;

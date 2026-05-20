function setupAiIpc(ipcMain, db, log, AIService) {
    ipcMain.handle("ai-summary", async (event, text) => {
        try {
            const AI = require("../ai");
            return await AI.summarize(text);
        } catch (err) {
            log.error("ai-summary error:", err);
            return null;
        }
    });

    ipcMain.handle("ai-get-models", async () => {
        try {
            const AI = require("../ai");
            return await AI.listModels();
        } catch (err) {
            log.error("ai-get-models error:", err);
            return [];
        }
    });

    ipcMain.handle("ai-get-settings", async () => {
        try {
            return db.getAISettings();
        } catch (err) {
            log.error("ai-get-settings error:", err);
            return {};
        }
    });

    ipcMain.handle("ai-save-settings", async (event, settings) => {
        try {
            return db.saveAISettings(settings);
        } catch (err) {
            log.error("ai-save-settings error:", err);
            return false;
        }
    });

    ipcMain.handle("get-ai-config", async () => {
        try {
            return AIService.getConfig();
        } catch (e) {
            return {};
        }
    });

    ipcMain.handle("update-ai-config", async (_, updates) => {
        try {
            return AIService.updateConfig(updates);
        } catch (e) {
            log.error("update-ai-config error:", e);
            return null;
        }
    });

    ipcMain.handle("get-ai-prompts", async () => {
        try {
            return AIService.getPrompts();
        } catch (e) {
            return {};
        }
    });

    ipcMain.handle("update-ai-prompt", async (_, { key, template }) => {
        try {
            return AIService.updatePrompt(key, template);
        } catch (e) {
            return false;
        }
    });

    ipcMain.handle("reset-ai-defaults", async () => {
        try {
            return AIService.resetToDefaults();
        } catch (e) {
            return false;
        }
    });

    ipcMain.handle("get-ai-defaults", async () => {
        try {
            return { config: AIService.getDefaultConfig(), prompts: AIService.getDefaultPrompts() };
        } catch (e) {
            return null;
        }
    });
}

module.exports = setupAiIpc;

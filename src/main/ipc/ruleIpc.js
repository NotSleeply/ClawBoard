const RuleEngine = require('../../features/rules/RuleEngine');

function setupRuleIpc(ipcMain, db, log) {
    let ruleEngine = null;

    function getRuleEngine() {
        if (!ruleEngine) ruleEngine = new RuleEngine(db);
        return ruleEngine;
    }

    ipcMain.handle("get-rules", async () => {
        try {
            return getRuleEngine().getRules();
        } catch (e) {
            log.error("get-rules error:", e);
            return [];
        }
    });

    ipcMain.handle("add-rule", async (_, rule) => {
        try {
            return getRuleEngine().addRule(rule);
        } catch (e) {
            log.error("add-rule error:", e);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle("update-rule", async (_, { id, ...updates }) => {
        try {
            return getRuleEngine().updateRule(id, updates);
        } catch (e) {
            log.error("update-rule error:", e);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle("delete-rule", async (_, id) => {
        try {
            return getRuleEngine().deleteRule(id);
        } catch (e) {
            log.error("delete-rule error:", e);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle("reset-rules", async () => {
        try {
            return getRuleEngine().resetToDefaults();
        } catch (e) {
            log.error("reset-rules error:", e);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle("get-rule-templates", async () => {
        try {
            return getRuleEngine().getBuiltInTemplates();
        } catch (e) {
            log.error("get-rule-templates error:", e);
            return [];
        }
    });

    ipcMain.handle("export-rules", async () => {
        try {
            return getRuleEngine().exportRules();
        } catch (e) {
            log.error("export-rules error:", e);
            return "[]";
        }
    });

    ipcMain.handle("import-rules", async (_, jsonStr) => {
        try {
            return getRuleEngine().importRules(jsonStr);
        } catch (e) {
            log.error("import-rules error:", e);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle("get-rule-execution-log", async (_, limit) => {
        try {
            return getRuleEngine().getExecutionLog(limit || 20);
        } catch (e) {
            log.error("get-rule-execution-log error:", e);
            return [];
        }
    });

    ipcMain.handle("test-rule", async (_, { content, type, sourceApp }) => {
        try {
            const result = getRuleEngine().process({
                content,
                type: type || "text",
                sourceApp: sourceApp || "",
                tags: "[]",
            });
            return { success: true, result };
        } catch (e) {
            log.error("test-rule error:", e);
            return { success: false, error: e.message };
        }
    });
}

module.exports = setupRuleIpc;

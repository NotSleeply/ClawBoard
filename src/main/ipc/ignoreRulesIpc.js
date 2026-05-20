const IgnoreRules = require('../../utils/ignore-rules');

function setupIgnoreRulesIpc(ipcMain, db, log, getIgnoreRules) {
    function ensureIgnoreRules() {
        let ignoreRules = getIgnoreRules();
        if (!ignoreRules) {
            ignoreRules = new IgnoreRules();
        }
        return ignoreRules;
    }

    ipcMain.handle("get-ignore-rules", async () => {
        try {
            return ensureIgnoreRules().getRules();
        } catch (err) {
            log.error("get-ignore-rules error:", err);
            return null;
        }
    });

    ipcMain.handle("save-ignore-rules", async (_, rules) => {
        try {
            const ignoreRules = ensureIgnoreRules();
            ignoreRules.rules = rules;
            return { success: true };
        } catch (err) {
            log.error("save-ignore-rules error:", err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("add-ignored-app", async (_, pattern) => {
        try {
            ensureIgnoreRules().addIgnoredApp(pattern);
            return { success: true };
        } catch (err) {
            log.error("add-ignored-app error:", err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("remove-ignored-app", async (_, pattern) => {
        try {
            ensureIgnoreRules().removeIgnoredApp(pattern);
            return { success: true };
        } catch (err) {
            log.error("remove-ignored-app error:", err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("test-ignore-rules", async (_, { content, metadata }) => {
        try {
            return ensureIgnoreRules().shouldIgnore(content, metadata);
        } catch (err) {
            log.error("test-ignore-rules error:", err);
            return { shouldIgnore: false, reason: "" };
        }
    });

    ipcMain.handle("get-auto-encrypt-settings", async () => {
        try {
            return ensureIgnoreRules().getAutoEncryptSettings();
        } catch (err) {
            log.error("get-auto-encrypt-settings error:", err);
            return null;
        }
    });

    ipcMain.handle("set-auto-encrypt-enabled", async (_, enabled) => {
        try {
            ensureIgnoreRules().setAutoEncryptEnabled(enabled);
            return { success: true };
        } catch (err) {
            log.error("set-auto-encrypt-enabled error:", err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("toggle-auto-encrypt-rule", async (_, { type, enabled }) => {
        try {
            ensureIgnoreRules().toggleAutoEncryptRule(type, enabled);
            return { success: true };
        } catch (err) {
            log.error("toggle-auto-encrypt-rule error:", err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("add-custom-auto-encrypt-rule", async (_, { name, pattern }) => {
        try {
            ensureIgnoreRules().addCustomAutoEncryptRule(name, pattern);
            return { success: true };
        } catch (err) {
            log.error("add-custom-auto-encrypt-rule error:", err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("remove-custom-auto-encrypt-rule", async (_, name) => {
        try {
            ensureIgnoreRules().removeCustomAutoEncryptRule(name);
            return { success: true };
        } catch (err) {
            log.error("remove-custom-auto-encrypt-rule error:", err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("batch-auto-encrypt", async () => {
        try {
            const ignoreRules = ensureIgnoreRules();
            if (!db.encryptionKey) {
                return { success: false, message: "未设置加密密码" };
            }

            const records = db.getRecords({ limit: 10000 });
            let encryptedCount = 0;
            let skippedCount = 0;

            for (const record of records) {
                if (record.encrypted) {
                    skippedCount++;
                    continue;
                }

                const result = ignoreRules.shouldIgnore(record.content, {});
                if (result.autoEncrypt) {
                    const success = db.encryptRecord(record.id);
                    if (success) {
                        db.db.run(`UPDATE records SET sensitive_types = ? WHERE id = ?`, [
                            result.types ? result.types.join(",") : "",
                            record.id,
                        ]);
                        encryptedCount++;
                    }
                }
            }

            db._save();
            log.info(
                `批量自动加密完成: ${encryptedCount} 条已加密, ${skippedCount} 条跳过`,
            );
            return { success: true, encryptedCount, skippedCount };
        } catch (err) {
            log.error("batch-auto-encrypt error:", err);
            return { success: false, message: err.message };
        }
    });
}

module.exports = setupIgnoreRulesIpc;

const { clipboard } = require('electron');

function setupRecordIpc(ipcMain, db, log, getClipboardWatcher) {
    ipcMain.handle(
        "get-records",
        async (event, { type, limit, offset, search, favorite }) => {
            try {
                return db.getRecords({ type, limit, offset, search, favorite });
            } catch (err) {
                log.error("get-records error:", err);
                return [];
            }
        },
    );

    ipcMain.handle("get-record", async (event, id) => {
        try {
            return db.getRecord(id);
        } catch (err) {
            log.error("get-record error:", err);
            return null;
        }
    });

    ipcMain.handle("toggle-favorite", async (event, id) => {
        try {
            return db.toggleFavorite(id);
        } catch (err) {
            log.error("toggle-favorite error:", err);
            return false;
        }
    });

    ipcMain.handle("update-note", async (event, { id, note }) => {
        try {
            return db.updateNote(id, note);
        } catch (err) {
            log.error("update-note error:", err);
            return false;
        }
    });

    ipcMain.handle("update-item-content", async (event, { id, content }) => {
        try {
            return db.updateItemContent(id, content);
        } catch (err) {
            log.error("update-item-content error:", err);
            return null;
        }
    });

    ipcMain.handle("delete-record", async (event, id, permanent = false) => {
        try {
            return db.deleteRecord(id, permanent);
        } catch (err) {
            log.error("delete-record error:", err);
            return false;
        }
    });

    ipcMain.handle("get-trash-records", async (_, limit = 50, offset = 0) => {
        try {
            return db.getTrashRecords(limit, offset);
        } catch (err) {
            log.error("get-trash-records error:", err);
            return [];
        }
    });

    ipcMain.handle("get-trash-stats", async () => {
        try {
            return db.getTrashStats();
        } catch (err) {
            log.error("get-trash-stats error:", err);
            return { total: 0 };
        }
    });

    ipcMain.handle("restore-from-trash", async (_, trashId) => {
        try {
            return db.restoreFromTrash(trashId);
        } catch (err) {
            log.error("restore-from-trash error:", err);
            return false;
        }
    });

    ipcMain.handle("delete-trash-record", async (_, trashId) => {
        try {
            return db.deleteTrashRecord(trashId);
        } catch (err) {
            log.error("delete-trash-record error:", err);
            return false;
        }
    });

    ipcMain.handle("empty-trash", async () => {
        try {
            return db.emptyTrash();
        } catch (err) {
            log.error("empty-trash error:", err);
            return false;
        }
    });

    ipcMain.handle("clear-history", async () => {
        try {
            return db.clearHistory();
        } catch (err) {
            log.error("clear-history error:", err);
            return false;
        }
    });

    ipcMain.handle(
        "clear-records-filtered",
        async (_, { range, type, favorite }) => {
            try {
                let query = "DELETE FROM records WHERE 1=1";
                const params = [];

                const now = new Date();
                if (range === "today") {
                    const today = new Date(
                        now.getFullYear(),
                        now.getMonth(),
                        now.getDate(),
                    );
                    query += " AND created_at >= ?";
                    params.push(today.toISOString());
                } else if (range === "week") {
                    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
                    query += " AND created_at >= ?";
                    params.push(weekAgo.toISOString());
                } else if (range === "month") {
                    const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
                    query += " AND created_at >= ?";
                    params.push(monthAgo.toISOString());
                }

                if (type !== "all") {
                    query += " AND type = ?";
                    params.push(type);
                }

                if (favorite) {
                    query += " AND favorite = 1";
                }

                const stmt = db.db.prepare(query);
                const result = stmt.run(...params);

                return { success: true, deleted: result.changes };
            } catch (e) {
                log.error("clear-records-filtered error:", e);
                return { success: false, error: e.message };
            }
        },
    );

    ipcMain.handle("copy-to-clipboard", async (event, text) => {
        try {
            clipboard.writeText(text);
            return true;
        } catch (err) {
            log.error("copy-to-clipboard error:", err);
            return false;
        }
    });

    ipcMain.handle("save-record", async (event, record) => {
        try {
            const result = db.addRecord(record);
            return { success: true, record: result };
        } catch (err) {
            log.error("save-record error:", err);
            return { success: false, message: err.message };
        }
    });

    ipcMain.handle("find-similar", async (event, content) => {
        try {
            return db.findSimilar(content);
        } catch (err) {
            log.error("find-similar error:", err);
            return [];
        }
    });

    ipcMain.handle("find-duplicates", async () => {
        try {
            return db.findDuplicates();
        } catch (err) {
            log.error("find-duplicates error:", err);
            return [];
        }
    });

    ipcMain.handle("cleanup-duplicates", async () => {
        try {
            return db.cleanupDuplicates();
        } catch (err) {
            log.error("cleanup-duplicates error:", err);
            return 0;
        }
    });

    ipcMain.handle("set-current-source", async (event, { app, title, url }) => {
        try {
            const clipboardWatcher = getClipboardWatcher();
            if (clipboardWatcher) {
                clipboardWatcher.setCurrentSource({ app, title, url });
            }
            return { success: true };
        } catch (err) {
            log.error("set-current-source error:", err);
            return { success: false };
        }
    });

    ipcMain.handle("search", async (event, { query, useSemantic = true }) => {
        try {
            const AI = require("../../core/ai/AIService");
            if (useSemantic && AI) {
                const isHealthy = await AI.checkHealth();
                if (isHealthy) {
                    return await db.semanticSearch(query, AI.getEmbedding.bind(AI));
                }
            }
            return db.search(query);
        } catch (err) {
            log.error("search error:", err);
            return [];
        }
    });

    ipcMain.handle("get-all-tags", async () => {
        try {
            return db.getAllTags();
        } catch (err) {
            log.error("get-all-tags error:", err);
            return [];
        }
    });

    ipcMain.handle("add-tag", async (event, { recordId, tag }) => {
        try {
            return db.addTag(recordId, tag);
        } catch (err) {
            log.error("add-tag error:", err);
            return false;
        }
    });

    ipcMain.handle("remove-tag", async (event, { recordId, tag }) => {
        try {
            return db.removeTag(recordId, tag);
        } catch (err) {
            log.error("remove-tag error:", err);
            return false;
        }
    });

    ipcMain.handle("delete-tag", async (event, tag) => {
        try {
            return db.deleteTag(tag);
        } catch (err) {
            log.error("delete-tag error:", err);
            return 0;
        }
    });

    ipcMain.handle("get-pinned-records", async (_, options) => {
        try {
            return db.getPinnedRecords(options || {});
        } catch (err) {
            log.error("get-pinned-records error:", err);
            return [];
        }
    });

    ipcMain.handle("update-pinned-record", async (_, id, updates) => {
        try {
            return db.updatePinnedRecord(id, updates);
        } catch (err) {
            log.error("update-pinned-record error:", err);
            return null;
        }
    });

    ipcMain.handle("batch-update-pinned", async (_, ids, options) => {
        try {
            return db.batchUpdatePinned(ids, options);
        } catch (err) {
            log.error("batch-update-pinned error:", err);
            return { updated: 0, deleted: 0 };
        }
    });

    ipcMain.handle("get-pinned-stats", async () => {
        try {
            return db.getPinnedStats();
        } catch (err) {
            log.error("get-pinned-stats error:", err);
            return null;
        }
    });
}

module.exports = setupRecordIpc;

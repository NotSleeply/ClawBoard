function setupGroupIpc(ipcMain, db, log) {
    ipcMain.handle("get-all-groups", async () => {
        try {
            return db.getAllGroups();
        } catch (err) {
            log.error("get-all-groups error:", err);
            return [];
        }
    });

    ipcMain.handle("create-group", async (event, { name, color, icon }) => {
        try {
            return db.createGroup(name, color, icon);
        } catch (err) {
            log.error("create-group error:", err);
            return null;
        }
    });

    ipcMain.handle("update-group", async (event, { id, ...updates }) => {
        try {
            return db.updateGroup(id, updates);
        } catch (err) {
            log.error("update-group error:", err);
            return null;
        }
    });

    ipcMain.handle("delete-group", async (event, id) => {
        try {
            return db.deleteGroup(id);
        } catch (err) {
            log.error("delete-group error:", err);
            return false;
        }
    });

    ipcMain.handle("toggle-group-collapsed", async (event, id) => {
        try {
            return db.toggleGroupCollapsed(id);
        } catch (err) {
            log.error("toggle-group-collapsed error:", err);
            return false;
        }
    });

    ipcMain.handle("move-record-to-group", async (event, { recordId, groupId }) => {
        try {
            return db.moveRecordToGroup(recordId, groupId);
        } catch (err) {
            log.error("move-record-to-group error:", err);
            return false;
        }
    });

    ipcMain.handle(
        "update-record-sort-order",
        async (event, { recordId, newOrder, newGroupId }) => {
            try {
                return db.updateRecordSortOrder(recordId, newOrder, newGroupId);
            } catch (err) {
                log.error("update-record-sort-order error:", err);
                return false;
            }
        },
    );

    ipcMain.handle("batch-update-sort-order", async (event, updates) => {
        try {
            return db.batchUpdateSortOrder(updates);
        } catch (err) {
            log.error("batch-update-sort-order error:", err);
            return false;
        }
    });
}

module.exports = setupGroupIpc;

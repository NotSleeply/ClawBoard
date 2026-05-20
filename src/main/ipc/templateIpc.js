function setupTemplateIpc(ipcMain, db, log) {
    ipcMain.handle("get-templates", async () => {
        try {
            return db.getTemplates();
        } catch (err) {
            log.error("get-templates error:", err);
            return [];
        }
    });

    ipcMain.handle("add-template", async (event, { name, content, category }) => {
        try {
            return db.addTemplate(name, content, category);
        } catch (err) {
            log.error("add-template error:", err);
            return null;
        }
    });

    ipcMain.handle(
        "update-template",
        async (event, { id, name, content, category }) => {
            try {
                return db.updateTemplate(id, name, content, category);
            } catch (err) {
                log.error("update-template error:", err);
                return null;
            }
        },
    );

    ipcMain.handle("delete-template", async (event, id) => {
        try {
            return db.deleteTemplate(id);
        } catch (err) {
            log.error("delete-template error:", err);
            return false;
        }
    });
}

module.exports = setupTemplateIpc;

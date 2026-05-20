const { dialog } = require('electron');
const fs = require('fs');

function setupDataIpc(ipcMain, db, log, getMainWindow) {
    ipcMain.handle("export-data", async (event, { format = "json" }) => {
        try {
            const records = db.getRecords({ limit: 10000 });
            const mainWindow = getMainWindow();

            const result = await dialog.showSaveDialog(mainWindow, {
                defaultPath: `clawboard-backup-${Date.now()}.${format}`,
                filters: [
                    { name: "JSON", extensions: ["json"] },
                    { name: "CSV", extensions: ["csv"] },
                ],
            });

            if (result.canceled) return { success: false, message: "已取消" };

            let content;

            if (format === "json") {
                content = JSON.stringify(records, null, 2);
            } else if (format === "csv") {
                const headers =
                    "id,type,content,summary,source,favorite,language,created_at\n";
                const rows = records
                    .map(
                        (r) =>
                            `${r.id},"${r.type}","${(r.content || "").replace(/"/g, '""')}","${(r.summary || "").replace(/"/g, '""')}","${r.source}",${r.favorite || 0},"${r.language || ""}","${r.created_at}"`,
                    )
                    .join("\n");
                content = headers + rows;
            }

            fs.writeFileSync(result.filePath, content, "utf-8");
            return { success: true, message: `已导出 ${records.length} 条记录` };
        } catch (err) {
            log.error("export-data error:", err);
            return { success: false, message: err.message };
        }
    });

    ipcMain.handle("import-data", async (event, filePath) => {
        try {
            const content = fs.readFileSync(filePath, "utf-8");
            const records = JSON.parse(content);

            let count = 0;
            for (const record of records) {
                if (record.content) {
                    db.addRecord({
                        type: record.type || "text",
                        content: record.content,
                        summary: record.summary,
                        source: "import",
                        favorite: record.favorite || 0,
                        language: record.language,
                    });
                    count++;
                }
            }

            return { success: true, message: `已导入 ${count} 条记录` };
        } catch (err) {
            log.error("import-data error:", err);
            return { success: false, message: err.message };
        }
    });

    ipcMain.handle("export-records", async (event, { format, options }) => {
        try {
            return db.exportRecords(format, options);
        } catch (err) {
            log.error("export-records error:", err);
            return null;
        }
    });

    ipcMain.handle("save-export-file", async (event, { content, filename }) => {
        try {
            const result = await dialog.showSaveDialog({
                defaultPath: filename,
                filters: [
                    { name: "JSON", extensions: ["json"] },
                    { name: "CSV", extensions: ["csv"] },
                    { name: "所有文件", extensions: ["*"] },
                ],
            });
            if (result.canceled) return { success: false, canceled: true };
            fs.writeFileSync(result.filePath, content, "utf8");
            return { success: true, path: result.filePath };
        } catch (err) {
            log.error("save-export-file error:", err);
            return { success: false, error: err.message };
        }
    });
}

module.exports = setupDataIpc;

function setupExportIpc(ipcMain, db, log) {
    ipcMain.handle("export-records-json", async () => {
        try {
            const records = db.exportAllRecords();
            return { success: true, data: records };
        } catch (err) {
            log.error("export-records-json error:", err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("export-records-csv", async () => {
        try {
            const csv = db.exportAllRecordsCSV();
            return { success: true, data: csv };
        } catch (err) {
            log.error("export-records-csv error:", err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("import-records", async (_, { records, mode }) => {
        try {
            const result = db.importRecords(records, mode);
            return { success: true, ...result };
        } catch (err) {
            log.error("import-records error:", err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle(
        "export-with-filters",
        async (_, { format, range, type, favorite }) => {
            try {
                const crypto = require("crypto");
                let records = db.getRecords({ limit: 10000 });

                const now = new Date();
                if (range === "today") {
                    const today = new Date(
                        now.getFullYear(),
                        now.getMonth(),
                        now.getDate(),
                    );
                    records = records.filter((r) => new Date(r.created_at) >= today);
                } else if (range === "week") {
                    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    records = records.filter((r) => new Date(r.created_at) >= weekAgo);
                } else if (range === "month") {
                    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    records = records.filter((r) => new Date(r.created_at) >= monthAgo);
                }

                if (type && type !== "all") {
                    records = records.filter((r) => r.type === type);
                }

                if (favorite) {
                    records = records.filter((r) => r.favorite);
                }

                if (format === "json") {
                    return JSON.stringify(records, null, 2);
                } else if (format === "csv") {
                    const headers = "ID,类型,内容,创建时间,收藏,标签\n";
                    const rows = records
                        .map(
                            (r) =>
                                `${r.id},"${r.type}","${(r.content || "").replace(/"/g, '""').substring(0, 500)}","${r.created_at}",${r.favorite},"${r.tags}"`,
                        )
                        .join("\n");
                    return headers + rows;
                } else if (format === "markdown") {
                    return records
                        .map((r) => {
                            const preview = (r.content || "")
                                .substring(0, 200)
                                .replace(/\n/g, " ");
                            return `## ${r.type} (${r.created_at})\n\n${preview}\n\n---\n`;
                        })
                        .join("\n");
                }
                return "";
            } catch (err) {
                log.error("export-with-filters error:", err);
                return "";
            }
        },
    );

    ipcMain.handle("get-export-count", async (_, { range, type, favorite }) => {
        try {
            let records = db.getRecords({ limit: 10000 });
            const now = new Date();

            if (range === "today") {
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                records = records.filter((r) => new Date(r.created_at) >= today);
            } else if (range === "week") {
                const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                records = records.filter((r) => new Date(r.created_at) >= weekAgo);
            } else if (range === "month") {
                const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                records = records.filter((r) => new Date(r.created_at) >= monthAgo);
            }

            if (type && type !== "all") {
                records = records.filter((r) => r.type === type);
            }

            if (favorite) {
                records = records.filter((r) => r.favorite);
            }

            return records.length;
        } catch (err) {
            log.error("get-export-count error:", err);
            return 0;
        }
    });

    ipcMain.handle(
        "import-records-enhanced",
        async (_, { records, duplicateMode }) => {
            try {
                const crypto = require("crypto");
                const contentHashes = new Set();
                const existingRecords = db.getRecords({ limit: 10000 });

                existingRecords.forEach((r) => {
                    if (r.content) {
                        const hash = crypto.createHash("md5").update(r.content).digest("hex");
                        contentHashes.add(hash);
                    }
                });

                let imported = 0,
                    skipped = 0;

                for (const record of records) {
                    if (!record.content) continue;

                    const hash = crypto
                        .createHash("md5")
                        .update(record.content)
                        .digest("hex");

                    if (contentHashes.has(hash) && duplicateMode === "skip") {
                        skipped++;
                        continue;
                    }

                    db.addRecord({
                        type: record.type || "text",
                        content: record.content,
                        source: "import",
                        source_app: record.source_app || "",
                        tags: record.tags || "[]",
                        favorite: record.favorite ? 1 : 0,
                    });

                    contentHashes.add(hash);
                    imported++;
                }

                return { success: true, imported, skipped };
            } catch (err) {
                log.error("import-records-enhanced error:", err);
                return { success: false, error: err.message };
            }
        },
    );
}

module.exports = setupExportIpc;

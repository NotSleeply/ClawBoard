function setupSyncIpc(ipcMain, db, log) {
    ipcMain.handle("get-sync-metadata", async () => {
        try {
            return db.getSyncMetadata();
        } catch (err) {
            log.error("get-sync-metadata error:", err);
            return null;
        }
    });

    ipcMain.handle("save-sync-config", async (_, config) => {
        try {
            return db.saveSyncConfig(config);
        } catch (err) {
            log.error("save-sync-config error:", err);
            return false;
        }
    });

    ipcMain.handle("get-sync-stats", async () => {
        try {
            return db.getSyncStats();
        } catch (err) {
            log.error("get-sync-stats error:", err);
            return null;
        }
    });

    ipcMain.handle("export-for-sync", async (_, options) => {
        try {
            return db.exportForSync(options);
        } catch (err) {
            log.error("export-for-sync error:", err);
            return null;
        }
    });

    ipcMain.handle(
        "import-from-sync",
        async (_, syncData, encryptionKey, options) => {
            try {
                return db.importFromSync(syncData, encryptionKey, options);
            } catch (err) {
                log.error("import-from-sync error:", err);
                return { error: err.message };
            }
        },
    );

    ipcMain.handle("test-webdav-connection", async (_, config) => {
        try {
            const { protocol, host, port, path, username, password } = config;
            const url = `${protocol}://${host}:${port}${path}`;

            const response = await fetch(url, {
                method: "PROPFIND",
                headers: {
                    Depth: "0",
                    Authorization:
                        "Basic " + Buffer.from(`${username}:${password}`).toString("base64"),
                },
            });

            return { success: response.ok, status: response.status };
        } catch (err) {
            log.error("test-webdav-connection error:", err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("sync-to-webdav", async (_, config) => {
        try {
            const {
                protocol,
                host,
                port,
                path,
                username,
                password,
                encrypt,
                encryptionKey,
            } = config;
            const url = `${protocol}://${host}:${port}${path}/clawboard-sync.json`;

            const exportData = db.exportForSync({ encrypt, encryptionKey });

            const auth =
                "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
            const response = await fetch(url, {
                method: "PUT",
                headers: {
                    Authorization: auth,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(exportData),
            });

            if (response.ok) {
                db.updateLastSyncTime();

                const records = db.getSyncableRecords({ limit: 10000 });
                const ids = records.map((r) => r.id);
                if (ids.length > 0) {
                    db.markAsSynced(ids);
                }

                return { success: true, recordCount: ids.length };
            }

            return { success: false, status: response.status };
        } catch (err) {
            log.error("sync-to-webdav error:", err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("sync-from-webdav", async (_, config) => {
        try {
            const { protocol, host, port, path, username, password, encryptionKey } =
                config;
            const url = `${protocol}://${host}:${port}${path}/clawboard-sync.json`;

            const auth =
                "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
            const response = await fetch(url, {
                method: "GET",
                headers: {
                    Authorization: auth,
                },
            });

            if (!response.ok) {
                if (response.status === 404) {
                    return { success: false, error: "远程没有找到同步文件" };
                }
                return { success: false, status: response.status };
            }

            const syncData = await response.json();

            const result = db.importFromSync(syncData, encryptionKey);

            db.updateLastSyncTime();

            return { success: true, ...result };
        } catch (err) {
            log.error("sync-from-webdav error:", err);
            return { success: false, error: err.message };
        }
    });
}

module.exports = setupSyncIpc;

const path = require('path');
const fs = require('fs');

function setupSystemIpc(ipcMain, db, log, getApp) {
    ipcMain.handle("get-diagnostics", async () => {
        try {
            const app = getApp();
            const memUsage = process.memoryUsage();
            const dbPath = path.join(app.getPath("userData"), "clawboard.db");
            let dbSize = 0;
            if (fs.existsSync(dbPath)) {
                dbSize = fs.statSync(dbPath).size;
            }
            const stats = db.getStats();
            return {
                appVersion: app.getVersion(),
                electronVersion: process.versions.electron,
                nodeVersion: process.versions.node,
                chromeVersion: process.versions.chrome,
                platform: process.platform,
                arch: process.arch,
                osRelease: require("os").release(),
                totalMemory: Math.round(require("os").totalmem() / 1024 / 1024),
                heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
                heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
                dbSize: dbSize,
                recordCount: stats.total,
                favoriteCount: stats.favorite,
                userDataPath: app.getPath("userData"),
                dbPath: dbPath,
                uptime: Math.round(process.uptime()),
            };
        } catch (err) {
            log.error("get-diagnostics error:", err);
            return { error: err.message };
        }
    });

    ipcMain.handle("get-storage-stats", async () => {
        try {
            const app = getApp();
            const dbPath = path.join(app.getPath("userData"), "clawboard.db");
            let dbSize = 0;
            if (fs.existsSync(dbPath)) {
                dbSize = fs.statSync(dbPath).size;
            }
            const stats = db.getDetailedStats ? db.getDetailedStats() : db.getStats();
            let compressedCount = 0;
            try {
                compressedCount =
                    db.db.exec(
                        "SELECT COUNT(*) as count FROM records WHERE compressed = 1",
                    )[0]?.values[0][0] || 0;
            } catch (e) { }
            return {
                dbSize,
                dbSizeMB: Math.round((dbSize / 1024 / 1024) * 10) / 10,
                totalRecords: stats.total || 0,
                compressedRecords: compressedCount,
                compressionRatio:
                    compressedCount > 0
                        ? Math.round((compressedCount / (stats.total || 1)) * 100)
                        : 0,
            };
        } catch (e) {
            log.error("get-storage-stats error:", e);
            return {
                dbSize: 0,
                dbSizeMB: 0,
                totalRecords: 0,
                compressedRecords: 0,
                compressionRatio: 0,
            };
        }
    });

    ipcMain.handle("compress-all", async () => {
        try {
            const lz = require("lz-string");
            const result = db.db.exec(
                "SELECT id, content FROM records WHERE compressed = 0 AND LENGTH(content) > 1024",
            );
            if (!result.length || !result[0].values.length)
                return { success: true, compressed: 0 };
            let compressed = 0;
            for (const row of result[0].values) {
                const [id, content] = row;
                try {
                    const compressedStr = lz.compress(content);
                    if (compressedStr.length < content.length) {
                        db.db.run(
                            "UPDATE records SET content = ?, compressed = 1 WHERE id = ?",
                            [compressedStr, id],
                        );
                        compressed++;
                    }
                } catch (e) { }
            }
            if (compressed > 0) db._save();
            return { success: true, compressed };
        } catch (e) {
            log.error("compress-all error:", e);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle(
        "find-fuzzy-duplicates",
        async (_, { threshold = 0.75 } = {}) => {
            try {
                return db._findFuzzyDuplicates(threshold);
            } catch (err) {
                log.error("find-fuzzy-duplicates error:", err);
                return [];
            }
        },
    );

    ipcMain.handle(
        "cleanup-fuzzy-duplicates",
        async (_, { threshold = 0.85 } = {}) => {
            try {
                return db.cleanupFuzzyDuplicates(threshold);
            } catch (err) {
                log.error("cleanup-fuzzy-duplicates error:", err);
                return { deleted: 0, found: 0 };
            }
        },
    );

    ipcMain.handle("get-fuzzy-dedup-stats", async () => {
        try {
            return db.getFuzzyStats();
        } catch (err) {
            log.error("get-fuzzy-dedup-stats error:", err);
            return { total: 0, fuzzyPairsFound: 0, samples: [] };
        }
    });
}

module.exports = setupSystemIpc;

const path = require('path');
const fs = require('fs');

function setupStatsIpc(ipcMain, db, log, getInsightsEngine, getApp) {
    ipcMain.handle("get-stats", async () => {
        try {
            return db.getStats();
        } catch (err) {
            log.error("get-stats error:", err);
            return { total: 0, text: 0, image: 0, file: 0, favorite: 0 };
        }
    });

    ipcMain.handle("get-detailed-stats", async () => {
        try {
            return db.getDetailedStats();
        } catch (err) {
            log.error("get-detailed-stats error:", err);
            return null;
        }
    });

    ipcMain.handle("get-stats-by-type", async () => {
        try {
            return db.getStatsByType();
        } catch (e) {
            log.error("get-stats-by-type error:", e);
            return [];
        }
    });

    ipcMain.handle("get-stats-by-app", async (_, limit) => {
        try {
            return db.getStatsByApp(limit || 10);
        } catch (e) {
            log.error("get-stats-by-app error:", e);
            return [];
        }
    });

    ipcMain.handle("get-daily-stats", async (_, days) => {
        try {
            return db.getDailyStats(days || 30);
        } catch (e) {
            log.error("get-daily-stats error:", e);
            return [];
        }
    });

    ipcMain.handle("get-hourly-stats", async () => {
        try {
            return db.getHourlyStats();
        } catch (e) {
            log.error("get-hourly-stats error:", e);
            return Array(24).fill(0);
        }
    });

    ipcMain.handle("get-weekly-trend", async () => {
        try {
            return db.getWeeklyTrend();
        } catch (e) {
            log.error("get-weekly-trend error:", e);
            return [];
        }
    });

    ipcMain.handle("get-insights", async () => {
        try {
            const insightsEngine = getInsightsEngine();
            if (!insightsEngine) return [];
            return insightsEngine.generateInsights();
        } catch (e) {
            log.error("get-insights error:", e);
            return [];
        }
    });

    ipcMain.handle("get-calendar-data", async (_, days) => {
        try {
            return db.getCalendarData(days || 365);
        } catch (e) {
            log.error("get-calendar-data error:", e);
            return { days: 365, dataMap: {} };
        }
    });

    ipcMain.handle("get-system-health", async () => {
        try {
            const app = getApp();
            const memUsage = process.memoryUsage();
            const dbPath = path.join(app.getPath("userData"), "clawboard.db");
            let dbSize = 0;
            if (fs.existsSync(dbPath)) {
                dbSize = fs.statSync(dbPath).size;
            }
            return {
                memoryUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
                memoryTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
                rss: Math.round(memUsage.rss / 1024 / 1024),
                dbSize: dbSize,
                dbSizeMB: Math.round((dbSize / 1024 / 1024) * 10) / 10,
                uptime: Math.round(process.uptime()),
                uptimeFormatted: formatUptime(process.uptime()),
            };
        } catch (err) {
            log.error("get-system-health error:", err);
            return null;
        }
    });

    ipcMain.handle("get-source-apps", async () => {
        try {
            return db.getSourceApps();
        } catch (err) {
            log.error("get-source-apps error:", err);
            return [];
        }
    });

    ipcMain.handle("get-stats-for-export", async () => {
        try {
            return db.getDetailedStatsForExport();
        } catch (err) {
            log.error("get-stats-for-export error:", err);
            return null;
        }
    });

    ipcMain.handle("get-runtime-stats", async () => {
        try {
            return db.getRuntimeStats();
        } catch (err) {
            log.error("get-runtime-stats error:", err);
            return null;
        }
    });
}

function formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
}

module.exports = setupStatsIpc;

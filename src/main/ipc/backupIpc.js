const { dialog } = require('electron');
const fs = require('fs');
const path = require('path');

function setupBackupIpc(ipcMain, db, log, getMainWindow) {
  ipcMain.handle("create-backup", async (_, reason = "manual") => {
    try {
      const result = db.createBackup(reason);
      return result;
    } catch (err) {
      log.error("create-backup error:", err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("get-backups", async () => {
    try {
      const backups = db.getBackups();
      return backups;
    } catch (err) {
      log.error("get-backups error:", err);
      return [];
    }
  });

  ipcMain.handle("restore-from-backup", async (_, backupFilename) => {
    try {
      const mainWindow = getMainWindow();
      const result = await dialog.showMessageBox(mainWindow, {
        type: "warning",
        title: "确认恢复备份",
        message: `即将从备份恢复数据:\n${backupFilename}\n\n当前数据将自动备份，但此操作不可撤销。`,
        buttons: ["取消", "确认恢复"],
        defaultId: 0,
        cancelId: 0,
      });

      if (result.response !== 1) {
        return { success: false, canceled: true, message: "用户取消操作" };
      }

      const restoreResult = db.restoreFromBackup(backupFilename);

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("database-restored", restoreResult);
      }

      return restoreResult;
    } catch (err) {
      log.error("restore-from-backup error:", err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("delete-backup", async (_, backupFilename) => {
    try {
      const backupPath = path.join(db.backupPath, backupFilename);

      if (!fs.existsSync(backupPath)) {
        return { success: false, error: "备份文件不存在" };
      }

      fs.unlinkSync(backupPath);

      const metaPath = path.join(db.backupPath, "backup-manifest.json");
      if (fs.existsSync(metaPath)) {
        let manifest = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        manifest = manifest.filter((b) => b.filename !== backupFilename);
        fs.writeFileSync(metaPath, JSON.stringify(manifest, null, 2));
      }

      return { success: true };
    } catch (err) {
      log.error("delete-backup error:", err);
      return { success: false, error: err.message };
    }
  });
}

module.exports = setupBackupIpc;

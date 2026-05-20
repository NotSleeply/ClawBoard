function setupEncryptionIpc(ipcMain, db, log) {
  ipcMain.handle("set-encryption-password", async (event, password) => {
    try {
      db.setEncryptionKey(password);
      return { success: true };
    } catch (err) {
      log.error("set-encryption-password error:", err);
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle("clear-encryption-key", async () => {
    try {
      db.clearEncryptionKey();
      return { success: true };
    } catch (err) {
      log.error("clear-encryption-key error:", err);
      return false;
    }
  });

  ipcMain.handle("encrypt-record", async (event, { id, algorithm = 'aes-256-gcm' }) => {
    try {
      return db.encryptRecord(id, algorithm);
    } catch (err) {
      log.error("encrypt-record error:", err);
      return false;
    }
  });

  ipcMain.handle("decrypt-record", async (event, id) => {
    try {
      return db.decryptRecord(id);
    } catch (err) {
      log.error("decrypt-record error:", err);
      return null;
    }
  });

  ipcMain.handle("remove-encryption", async (event, id) => {
    try {
      return db.removeEncryption(id);
    } catch (err) {
      log.error("remove-encryption error:", err);
      return false;
    }
  });

  ipcMain.handle("batch-decrypt", async (event, ids) => {
    try {
      let targetIds = ids;
      if (!ids || ids.length === 0) {
        const allEncrypted = db.db.prepare('SELECT id FROM records WHERE encrypted = 1').all();
        targetIds = allEncrypted.map(r => r.id);
      }
      let success = 0, failed = 0;
      for (const id of targetIds) {
        try {
          const result = db.decryptRecord(id);
          if (result) { db.removeEncryption(id); success++; } else { failed++; }
        } catch { failed++; }
      }
      return { success, failed, total: targetIds.length };
    } catch (err) {
      log.error("batch-decrypt error:", err);
      return { success: 0, failed: 0, total: 0, error: err.message };
    }
  });

  ipcMain.handle("get-encryption-stats", async () => {
    try {
      if (!db) return null;
      return db.getEncryptionStats ? db.getEncryptionStats() : null;
    } catch (err) {
      log.error("get-encryption-stats error:", err);
      return null;
    }
  });

  ipcMain.handle("check-password-strength", async (event, password) => {
    const analyze = (pw) => {
      let score = 0;
      const suggestions = [];
      if (pw.length < 8) { suggestions.push('至少8个字符'); } else { score += 20; }
      if (pw.length >= 12) score += 15;
      if (pw.length >= 16) score += 10;
      if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 15;
      if (/[0-9]/.test(pw)) score += 10;
      if (/[^A-Za-z0-9]/.test(pw)) score += 15;
      if (/(.)\1{2,}/.test(pw)) { suggestions.push('避免连续重复字符'); score -= 10; }
      if (/^[a-z]+$/i.test(pw)) { suggestions.push('避免纯字母'); score -= 10; }
      if (/^[0-9]+$/.test(pw)) { suggestions.push('避免纯数字'); score -= 15; }
      const commonPasswords = ['password', '123456', 'qwerty', 'admin', 'letmein', 'welcome'];
      if (commonPasswords.some(p => pw.toLowerCase().includes(p))) { suggestions.push('避免常见密码'); score -= 20; }
      score = Math.max(0, Math.min(100, score));
      const levels = ['极弱', '弱', '中等', '强', '很强'];
      return { score, level: levels[Math.min(Math.floor(score / 20), 4)], suggestions };
    };
    return analyze(password);
  });
}

module.exports = setupEncryptionIpc;

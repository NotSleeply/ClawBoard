const crypto = require('crypto');
const path = require('path');

function setupSecurityIpc(ipcMain, log, SecureUtils, getApp) {
    ipcMain.handle("secure-delete-file", async (_, filePath) => {
        try {
            const app = getApp();
            const normalizedPath = path.normalize(filePath);
            if (!normalizedPath.startsWith(app.getPath("userData")) &&
                !normalizedPath.startsWith(app.getPath("app"))) {
                return { success: false, error: "不允许删除此位置的文件" };
            }

            const result = SecureUtils.secureDelete(normalizedPath);
            log.info(`[Security] 安全删除: ${result.method} - ${result.size || 0} bytes`);
            return result;
        } catch (err) {
            log.error("secure-delete-file error:", err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("get-password-strength", async (_, password) => {
        try {
            const strength = SecureUtils.checkPasswordStrength(password);
            return strength;
        } catch (err) {
            log.error("get-password-strength error:", err);
            return { score: 0, strength: 'error', suggestions: ['检测失败'] };
        }
    });

    ipcMain.handle("encrypt-text-gcm", async (_, plaintext, password) => {
        try {
            const salt = SecureUtils.generateSalt();
            const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');

            const encrypted = SecureUtils.encryptGCM(plaintext, key);

            return {
                success: true,
                data: encrypted,
                salt: salt.toString('hex'),
                algorithm: 'aes-256-gcm'
            };
        } catch (err) {
            log.error("encrypt-text-gcm error:", err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("decrypt-text-gcm", async (_, encryptedData, password, saltHex) => {
        try {
            const salt = Buffer.from(saltHex, 'hex');
            const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');

            const decrypted = SecureUtils.decryptGCM(encryptedData, key);

            return {
                success: true,
                data: decrypted
            };
        } catch (err) {
            log.error("decrypt-text-gcm error:", err);
            return { success: false, error: '解密失败,请检查密码' };
        }
    });

    ipcMain.handle("hash-file", async (_, filePath) => {
        try {
            const hash = await SecureUtils.fileHashSHA256(filePath);
            return { success: true, hash, algorithm: 'sha-256' };
        } catch (err) {
            log.error("hash-file error:", err);
            return { success: false, error: err.message };
        }
    });
}

module.exports = setupSecurityIpc;

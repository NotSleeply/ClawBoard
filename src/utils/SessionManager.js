/**
 * ClawBoard - 会话安全管理器
 * v0.75.0: 主密码 + 会话超时 + 自动锁定
 */

const { ipcMain } = require('electron');
const SecureUtils = require('./SecureUtils');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const log = require('electron-log');

class SessionManager {
  constructor(userDataPath, database) {
    this.userDataPath = userDataPath;
    this.db = database;
    
    // 会话状态
    this._isLocked = true;           // 默认锁定
    this._sessionStart = null;       // 会话开始时间
    this._lastActivity = null;       // 最后活动时间
    this._masterPasswordHash = null; // 主密码哈希 (不存储明文)
    this._sessionKey = null;         // 当前会话的加密密钥

    // 配置
    this.config = {
      sessionTimeout: 30 * 60 * 1000,  // 默认30分钟无操作自动锁定
      maxAttempts: 5,                   // 最大尝试次数
      lockoutTime: 5 * 60 * 1000,       // 锁定时间 (5分钟)
    };

    // 尝试计数器
    this._failedAttempts = 0;
    this._lockoutUntil = null;

    // 初始化
    this._init();
  }

  /**
   * 初始化会话管理器
   * @private
   */
  _init() {
    log.info('[Session] 会话管理器初始化');

    // 加载保存的密码哈希
    const hashFile = path.join(this.userDataPath, 'master-password.hash');
    if (fs.existsSync(hashFile)) {
      try {
        this._masterPasswordHash = JSON.parse(fs.readFileSync(hashFile, 'utf8'));
        log.info('[Session] 已加载主密码哈希');
      } catch (err) {
        log.error('[Session] 加载密码哈希失败:', err);
      }
    }

    // 注册 IPC 处理程序
    this._registerIPC();

    // 启动活动监控
    this._startActivityMonitor();
  }

  /**
   * 注册 IPC 接口
   * @private
   */
  _registerIPC() {
    // 设置主密码
    ipcMain.handle('set-master-password', async (_, password) => {
      return this.setMasterPassword(password);
    });

    // 验证主密码 (解锁)
    ipcMain.handle('verify-master-password', async (_, password) => {
      return this.verifyPassword(password);
    });

    // 检查会话状态
    ipcMain.handle('get-session-status', async () => {
      return this.getStatus();
    });

    // 手动锁定
    ipcMain.handle('lock-session', async () => {
      return this.lock();
    });

    // 更新活动时间 (用户交互时调用)
    ipcMain.handle('update-activity', async () => {
      this._updateActivity();
      return { success: true };
    });

    // 获取密码强度
    ipcMain.handle('check-password-strength', async (_, password) => {
      return SecureUtils.checkPasswordStrength(password);
    });

    // 更改主密码
    ipcMain.handle('change-master-password', async (_, oldPassword, newPassword) => {
      return this.changePassword(oldPassword, newPassword);
    });
  }

  /**
   * 设置/更改主密码
   * @param {string} password - 新密码
   * @returns {Object} - 操作结果
   */
  setMasterPassword(password) {
    if (!password || password.length < 8) {
      return { success: false, error: '密码长度至少8位' };
    }

    // 使用 Argon2id 哈希密码
    const salt = SecureUtils.generateSalt(32);
    const hash = crypto.createHmac('sha256', salt).update(password).digest('hex'); // 简化版，生产环境应使用 Argon2

    const passwordData = {
      algorithm: 'hmac-sha256',
      salt: salt.toString('hex'),
      hash: hash,
      createdAt: new Date().toISOString(),
      version: '1.0'
    };

    // 安全存储哈希值
    const hashFile = path.join(this.userDataPath, 'master-password.hash');
    fs.writeFileSync(hashFile, JSON.stringify(passwordData, null, 2), { mode: 0o600 }); // 仅所有者可读写

    this._masterPasswordHash = passwordData;

    // 派生会话密钥
    this._deriveSessionKey(password);

    log.info('[Session] 主密码设置成功');
    return { success: true };
  }

  /**
   * 验证密码并解锁
   * @param {string} password - 用户输入的密码
   * @returns {Object} - 验证结果
   */
  verifyPassword(password) {
    // 检查是否在锁定期内
    if (this._lockoutUntil && Date.now() < this._lockoutUntil) {
      const remaining = Math.ceil((this._lockoutUntil - Date.now()) / 1000);
      return {
        success: false,
        locked: true,
        error: `账户已锁定,请等待 ${remaining} 秒后重试`,
        remainingSeconds: remaining
      };
    }

    if (!this._masterPasswordHash) {
      // 未设置密码,直接解锁
      this.unlock(password);
      return { success: true, firstSetup: true };
    }

    // 验证密码
    const salt = Buffer.from(this._masterPasswordHash.salt, 'hex');
    const expectedHash = this._masterPasswordHash.hash;
    const actualHash = crypto.createHmac('sha256', salt).update(password).digest('hex');

    if (actualHash === expectedHash) {
      // 密码正确
      this._failedAttempts = 0;
      this._lockoutUntil = null;

      this.unlock(password);
      log.info('[Session] 密码验证成功,会话已解锁');
      
      return { success: true };
    } else {
      // 密码错误
      this._failedAttempts++;
      log.warn(`[Session] 密码错误 (第${this._failedAttempts}次)`);

      if (this._failedAttempts >= this.config.maxAttempts) {
        this._lockoutUntil = Date.now() + this.config.lockoutTime;
        this._failedAttempts = 0;
        
        log.error(`[Session] 连续${this.config.maxAttempts}次错误,已锁定 ${this.config.lockoutTime / 1000}秒`);
        return {
          success: false,
          locked: true,
          error: `连续错误次数过多,已锁定 ${this.config.lockoutTime / 1000}秒`,
          lockoutDuration: this.config.lockoutTime / 1000
        };
      }

      const remaining = this.config.maxAttempts - this._failedAttempts;
      return {
        success: false,
        error: `密码错误,还剩 ${remaining} 次尝试机会`,
        attemptsRemaining: remaining
      };
    }
  }

  /**
   * 解锁会话
   * @param {string} password - 密码
   */
  unlock(password) {
    this._isLocked = false;
    this._sessionStart = Date.now();
    this._updateActivity();

    // 派生会话密钥
    this._deriveSessionKey(password);
  }

  /**
   * 锁定会话
   * @returns {Object}
   */
  lock() {
    this._isLocked = true;
    this._sessionKey = null; // 清除内存中的密钥
    this._sessionStart = null;
    this._lastActivity = null;

    log.info('[Session] 会话已锁定');
    return { success: true, locked: true };
  }

  /**
   * 更改主密码
   * @param {string} oldPassword - 旧密码
   * @param {string} newPassword - 新密码
   * @returns {Object}
   */
  changePassword(oldPassword, newPassword) {
    // 先验证旧密码
    const verifyResult = this.verifyPassword(oldPassword);
    if (!verifyResult.success) {
      return { success: false, error: '旧密码错误' };
    }

    // 设置新密码
    return this.setMasterPassword(newPassword);
  }

  /**
   * 派生会话密钥
   * @param {string} password - 用户密码
   * @private
   */
  _deriveSessionKey(password) {
    const salt = Buffer.from('clawboard-session-key-salt-v1', 'utf8');
    this._sessionKey = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
  }

  /**
   * 获取当前会话状态
   * @returns {Object}
   */
  getStatus() {
    return {
      isLocked: this._isLocked,
      hasMasterPassword: !!this._masterPasswordHash,
      sessionDuration: this._sessionStart ? Date.now() - this._sessionStart : 0,
      lastActivity: this._lastActivity,
      idleTime: this._lastActivity ? Date.now() - this._lastActivity : Infinity,
      failedAttempts: this._failedAttempts,
      isLockout: this._lockoutUntil && Date.now() < this._lockoutUntil,
    };
  }

  /**
   * 更新最后活动时间
   * @private
   */
  _updateActivity() {
    this._lastActivity = Date.now();
  }

  /**
   * 启动活动监控定时器
   * @private
   */
  _startActivityMonitor() {
    // 防止重复创建定时器
    if (this._activityMonitor) {
      clearInterval(this._activityMonitor);
    }

    this._activityMonitor = setInterval(() => {
      if (!this._isLocked && this._lastActivity) {
        const idleTime = Date.now() - this._lastActivity;

        if (idleTime >= this.config.sessionTimeout) {
          log.info(`[Session] 无操作超时 (${Math.round(idleTime / 1000)}s),自动锁定`);
          this.lock();

          // 通知渲染进程
          const { BrowserWindow } = require('electron');
          const windows = BrowserWindow.getAllWindows();
          windows.forEach(win => {
            if (!win.isDestroyed()) {
              win.webContents.send('session-locked', { reason: 'timeout' });
            }
          });
        }
      }
    }, 5000); // 每5秒检查一次
  }

  /**
   * 获取当前会话密钥 (用于数据库解密)
   * @returns {string|null}
   */
  getSessionKey() {
    if (this._isLocked) return null;
    return this._sessionKey;
  }

  /**
   * 检查是否已设置主密码
   * @returns {boolean}
   */
  hasMasterPassword() {
    return !!this._masterPasswordHash;
  }

  /**
   * 安全销毁 (退出前调用)
   */
  destroy() {
    this.lock();
    this._failedAttempts = 0;
    this._lockoutUntil = null;

    // 清理活动监控定时器 (防止内存泄漏)
    if (this._activityMonitor) {
      clearInterval(this._activityMonitor);
      this._activityMonitor = null;
      log.info('[Session] 活动监控定时器已清理');
    }

    log.info('[Session] 会话管理器已销毁');
  }
}

module.exports = SessionManager;
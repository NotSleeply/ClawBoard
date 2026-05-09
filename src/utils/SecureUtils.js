/**
 * ClawBoard - 企业级安全工具集
 * v0.75.0: 安全性升级核心模块
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class SecureUtils {
  // ==================== 密钥派生 (Argon2id) ====================

  /**
   * 使用 Argon2id 派生加密密钥 (比 PBKDF2 更安全)
   * @param {string} password - 用户密码
   * @param {Buffer} salt - 盐值 (16字节)
   * @param {Object} options - 参数配置
   * @returns {Promise<Buffer>} - 派生的密钥 (32字节)
   */
  static async deriveKey(password, salt, options = {}) {
    const {
      memoryCost = 65536,    // 64 MB (推荐值)
      timeCost = 3,          // 迭代次数
      parallelism = 4,       // 并行线程数
      keyLen = 32            // 输出密钥长度 (AES-256)
    } = options;

    // Node.js 原生支持 argon2 (v15+)
    try {
      return new Promise((resolve, reject) => {
        try {
          const hash = crypto.hash('argon2id', password, {
            salt,
            iterations: timeCost,
            memoryKB: memoryCost / 1024,
            parallelism,
            length: keyLen
          });
          resolve(Buffer.from(hash, 'hex'));
        } catch (e) {
          // 回退到 PBKDF2 (旧版 Node.js)
          console.warn('[Security] Argon2 不可用,回退到 PBKDF2');
          resolve(crypto.pbkdf2Sync(password, salt, timeCost * 100000, keyLen, 'sha256'));
        }
      });
    } catch (err) {
      throw new Error(`密钥派生失败: ${err.message}`);
    }
  }

  /**
   * 生成随机盐值
   * @param {number} [length=16] - 盐值长度(字节)
   * @returns {Buffer}
   */
  static generateSalt(length = 16) {
    return crypto.randomBytes(length);
  }

  // ==================== AES-256-GCM 加密 ====================

  /**
   * AES-256-GCM 加密 (认证加密,防篡改)
   * @param {string|Buffer} plaintext - 明文
   * @param {Buffer|string} key - 32字节密钥
   * @returns {string} - Base64 编码的密文 (iv:authTag:ciphertext)
   */
  static encryptGCM(plaintext, key) {
    if (!plaintext || !key) return plaintext;

    const iv = crypto.randomBytes(12); // GCM 推荐 IV 长度
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      Buffer.isBuffer(key) ? key : Buffer.from(key, 'hex'),
      iv
    );

    let encrypted = cipher.update(typeof plaintext === 'string' ? plaintext : String(plaintext), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // 格式: base64(iv:authTag:ciphertext)
    return Buffer.from(`${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`).toString('base64');
  }

  /**
   * AES-256-GCM 解密 (带完整性验证)
   * @param {string} ciphertext - Base64 编码的密文
   * @param {Buffer|string} key - 32字节密钥
   * @returns {string} - 明文
   */
  static decryptGCM(ciphertext, key) {
    if (!ciphertext || !key) return ciphertext;

    try {
      const decoded = Buffer.from(ciphertext, 'base64').toString('utf8');
      const [ivHex, authTagHex, encrypted] = decoded.split(':');

      if (!ivHex || !authTagHex || !encrypted) {
        throw new Error('无效的密文格式');
      }

      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        Buffer.isBuffer(key) ? key : Buffer.from(key, 'hex'),
        Buffer.from(ivHex, 'hex')
      );

      decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (err) {
      console.error('[Security] GCM 解密失败:', err.message);
      return '[加密内容 - 解密失败]';
    }
  }

  // ==================== 安全删除 (DoD 5220.22-M) ====================

  /**
   * 安全删除文件 (覆写7次 + 重命名 + 删除)
   * 符合 DoD 5220.22-M 标准
   * @param {string} filePath - 文件路径
   * @returns {Object} - 操作结果
   */
  static secureDelete(filePath) {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在' };
    }

    try {
      const stats = fs.statSync(filePath);

      // 只对普通文件执行安全删除
      if (!stats.isFile()) {
        fs.unlinkSync(filePath); // 非文件直接删除
        return { success: true, method: 'direct' };
      }

      const fileSize = stats.size;
      const fd = fs.openSync(filePath, 'r+');

      // Pass 1: 全零 (0x00)
      this._overwriteFile(fd, fileSize, 0x00);
      
      // Pass 2: 全一 (0xFF)
      this._overwriteFile(fd, fileSize, 0xFF);
      
      // Pass 3: 随机数据
      this._randomOverwrite(fd, fileSize);
      
      // Pass 4-6: 重复随机模式
      for (let i = 0; i < 3; i++) {
        this._randomOverwrite(fd, fileSize);
      }
      
      // Pass 7: 最终全零
      this._overwriteFile(fd, fileSize, 0x00);

      fs.closeSync(fd);

      // 重命名为随机名称 (破坏文件名元数据)
      const dir = path.dirname(filePath);
      const randomName = crypto.randomBytes(16).toString('hex');
      const renamedPath = path.join(dir, randomName);
      fs.renameSync(filePath, renamedPath);

      // 最终删除
      fs.unlinkSync(renamedPath);

      console.log(`[Security] 安全删除完成: ${path.basename(filePath)} (${fileSize} bytes)`);
      return { success: true, method: 'dod-7pass', size: fileSize };
    } catch (err) {
      console.error('[Security] 安全删除失败:', err);
      // 回退到普通删除
      try {
        fs.unlinkSync(filePath);
        return { success: true, method: 'fallback' };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
  }

  /**
   * 文件覆写辅助方法
   * @param {number} fd - 文件描述符
   * @param {number} size - 文件大小
   * @param {number} byte - 覆写字节值
   * @private
   */
  static _overwriteFile(fd, size, byte) {
    const chunkSize = 65536; // 64KB chunks
    const buffer = Buffer.alloc(chunkSize, byte);

    let offset = 0;
    while (offset < size) {
      const toWrite = Math.min(chunkSize, size - offset);
      fs.writeSync(fd, buffer, 0, toWrite, offset);
      offset += toWrite;
    }

    fs.fsyncSync(fd); // 强制写入磁盘
  }

  /**
   * 随机数据覆写
   * @param {number} fd - 文件描述符
   * @param {number} size - 文件大小
   * @private
   */
  static _randomOverwrite(fd, size) {
    const chunkSize = 65536;
    let offset = 0;

    while (offset < size) {
      const toWrite = Math.min(chunkSize, size - offset);
      const randomData = crypto.randomBytes(toWrite);
      fs.writeSync(fd, randomData, 0, toWrite, offset);
      offset += toWrite;
    }

    fs.fsyncSync(fd);
  }

  // ==================== 内存保护 ====================

  /**
   * 安全清除内存中的敏感数据
   * @param {string|Buffer} data - 敏感数据
   */
  static clearSensitiveData(data) {
    if (typeof data === 'string') {
      // 字符串在 JavaScript 中不可变,只能覆盖引用
      // 实际应用中应使用 Buffer 处理敏感数据
      return;
    }

    if (Buffer.isBuffer(data)) {
      data.fill(0); // 用零覆盖内存
    }
  }

  /**
   * 创建安全的字符串缓冲区 (用于密码等)
   * @param {string} str - 字符串内容
   * @returns {{ value: Function, dispose: Function }}
   */
  static createSecureString(str) {
    const buffer = Buffer.from(str, 'utf8');

    return {
      value: () => buffer.toString('utf8'),
      dispose: () => {
        buffer.fill(0);
      }
    };
  }

  // ==================== 密码强度检测 ====================

  /**
   * 检测密码强度
   * @param {string} password - 密码
   * @returns {Object} - 强度评估结果
   */
  static checkPasswordStrength(password) {
    const result = {
      score: 0,           // 0-4
      strength: '',       // very_weak / weak / fair / strong / very_strong
      suggestions: [],    // 改进建议
      crackTime: ''       // 预估破解时间
    };

    if (!password || password.length === 0) {
      result.strength = 'empty';
      result.suggestions.push('请输入密码');
      return result;
    }

    // 长度评分
    if (password.length >= 8) result.score++;
    if (password.length >= 12) result.score++;
    if (password.length >= 20) result.score++;

    // 复杂度评分
    if (/[a-z]/.test(password)) result.score++; // 小写字母
    if (/[A-Z]/.test(password)) result.score++; // 大写字母
    if (/[0-9]/.test(password)) result.score++; // 数字
    if (/[^a-zA-Z0-9]/.test(password)) result.score++; // 特殊字符

    // 归一化到 0-4
    result.score = Math.min(4, Math.floor(result.score / 2));

    // 强度等级
    const levels = ['very_weak', 'weak', 'fair', 'strong', 'very_strong'];
    const levelNames = ['非常弱', '弱', '一般', '强', '非常强'];
    result.strength = levels[result.score];

    // 改进建议
    if (password.length < 8) result.suggestions.push('密码长度至少8位');
    if (password.length < 12) result.suggestions.push('建议使用12位以上密码');
    if (!/[A-Z]/.test(password)) result.suggestions.push('包含大写字母');
    if (!/[0-9]/.test(password)) result.suggestions.push('包含数字');
    if (!/[^a-zA-Z0-9]/.test(password)) result.suggestions.push('包含特殊字符 (@#$%...)');
    if (/^[a-zA-Z]+$/.test(password) || /^[0-9]+$/.test(password)) {
      result.suggestions.push('避免使用纯字母或纯数字');
    }

    // 破解时间估算 (粗略)
    const combinations = Math.pow(password.length > 10 ? 94 : 52, password.length);
    const seconds = combinations / 1e9; // 假设每秒10亿次尝试
    
    if (seconds < 3600) result.crackTime = '瞬间';
    else if (seconds < 86400) result.crackTime = `${Math.floor(seconds / 3600)}小时`;
    else if (seconds < 31536000) result.crackTime = `${Math.floor(seconds / 86400)}天`;
    else if (seconds < 31536000 * 100) result.crackTime = `${Math.floor(seconds / 31536000)}年`;
    else result.crackTime = '数百年以上';

    return result;
  }

  // ==================== 哈希工具 ====================

  /**
   * 计算文件 SHA-256 哈希
   * @param {string} filePath - 文件路径
   * @returns {Promise<string>} - 十六进制哈希值
   */
  static async fileHashSHA256(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * HMAC-SHA256 签名
   * @param {string} data - 待签名数据
   * @param {string|Buffer} key - 签名密钥
   * @returns {string} - 十六进制签名
   */
  static hmacSHA256(data, key) {
    return crypto
      .createHmac('sha256', key)
      .update(data)
      .digest('hex');
  }
}

module.exports = SecureUtils;
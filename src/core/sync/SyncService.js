/**
 * ClawBoard - 同步服务模块 (v0.18.0)
 * 支持跨设备剪贴板同步和云备份
 */

const crypto = require('crypto');
const EventEmitter = require('events');

class SyncService extends EventEmitter {
  constructor(db, log) {
    super();
    this.db = db;
    this.log = log;
    this.deviceId = this._generateDeviceId();
    this.deviceName = null;
    this.pairedDevices = new Map();
    this.ws = null;
    this.syncEnabled = false;
    this.encryptionKey = null;
    this.offlineQueue = [];
    this.relayServerUrl = 'wss://relay.clawboard.app';
  }

  // 生成设备唯一ID
  _generateDeviceId() {
    return crypto.randomBytes(16).toString('hex');
  }

  // 初始化同步服务
  async init(deviceName) {
    this.deviceName = deviceName || `Device-${this.deviceId.slice(0, 8)}`;
    this.log.info(`同步服务初始化 - 设备: ${this.deviceName} (${this.deviceId})`);

    // 加载已配对设备
    await this._loadPairedDevices();
    return true;
  }

  // 启用同步
  async enableSync(password) {
    if (!password || password.length < 8) {
      throw new Error('密码至少需要8位字符');
    }

    // 从密码派生加密密钥
    const salt = 'clawboard-sync-v1';
    this.encryptionKey = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    this.syncEnabled = true;

    this.log.info('同步功能已启用');

    // 连接到中继服务器
    await this._connectRelay();

    // 处理离线队列
    await this._processOfflineQueue();

    return true;
  }

  // 禁用同步
  disableSync() {
    this.syncEnabled = false;
    this.encryptionKey = null;

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.log.info('同步功能已禁用');
    return true;
  }

  // 生成配对二维码数据
  generatePairingData() {
    if (!this.syncEnabled) {
      throw new Error('请先启用同步功能');
    }

    const pairingData = {
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      timestamp: Date.now(),
      type: 'pairing'
    };

    // 加密配对数据
    const encrypted = this._encryptData(JSON.stringify(pairingData));

    return {
      qrData: JSON.stringify({
        v: 1,
        data: encrypted
      }),
      plainData: pairingData
    };
  }

  // 配对设备
  async pairDevice(qrData) {
    try {
      const parsed = JSON.parse(qrData);
      if (parsed.v !== 1) {
        throw new Error('不支持的配对协议版本');
      }

      const decrypted = this._decryptData(parsed.data);
      const deviceInfo = JSON.parse(decrypted);

      if (Date.now() - deviceInfo.timestamp > 5 * 60 * 1000) {
        throw new Error('配对二维码已过期');
      }

      if (deviceInfo.deviceId === this.deviceId) {
        throw new Error('不能配对同一设备');
      }

      // 添加到配对列表
      this.pairedDevices.set(deviceInfo.deviceId, {
        id: deviceInfo.deviceId,
        name: deviceInfo.deviceName,
        pairedAt: Date.now(),
        lastSync: null
      });

      await this._savePairedDevices();

      this.log.info(`设备配对成功: ${deviceInfo.deviceName}`);
      this.emit('devicePaired', deviceInfo);

      return deviceInfo;
    } catch (err) {
      this.log.error('设备配对失败:', err);
      throw err;
    }
  }

  // 同步记录到所有配对设备
  async syncRecord(record) {
    if (!this.syncEnabled || !this.encryptionKey) {
      // 离线模式，加入队列
      this.offlineQueue.push(record);
      return { queued: true };
    }

    const syncData = {
      type: 'record',
      deviceId: this.deviceId,
      timestamp: Date.now(),
      record: {
        id: record.id,
        type: record.type,
        content: record.content,
        summary: record.summary,
        tags: record.tags,
        language: record.language,
        created_at: record.created_at
      }
    };

    const encrypted = this._encryptData(JSON.stringify(syncData));

    // 发送到所有配对设备
    const targets = Array.from(this.pairedDevices.keys());

    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify({
        action: 'broadcast',
        targets,
        payload: encrypted
      }));
    } else {
      // 离线，加入队列
      this.offlineQueue.push(syncData);
    }

    return { synced: targets.length, targets };
  }

  // 连接中继服务器
  async _connectRelay() {
    return new Promise((resolve, reject) => {
      try {
        const WebSocket = require('ws');
        this.ws = new WebSocket(this.relayServerUrl);

        this.ws.on('open', () => {
          this.log.info('已连接到中继服务器');

          // 发送设备注册信息
          this.ws.send(JSON.stringify({
            action: 'register',
            deviceId: this.deviceId,
            deviceName: this.deviceName
          }));

          resolve(true);
        });

        this.ws.on('message', (data) => {
          this._handleMessage(data);
        });

        this.ws.on('close', () => {
          this.log.warn('中继服务器连接断开');
          this.ws = null;

          // 5秒后重连
          setTimeout(() => {
            if (this.syncEnabled) {
              this._connectRelay().catch(() => { });
            }
          }, 5000);
        });

        this.ws.on('error', (err) => {
          this.log.error('WebSocket 错误:', err);
          reject(err);
        });
      } catch (err) {
        this.log.error('连接中继服务器失败:', err);
        reject(err);
      }
    });
  }

  // 处理收到的消息
  _handleMessage(data) {
    try {
      const message = JSON.parse(data);

      if (message.action === 'sync') {
        const decrypted = this._decryptData(message.payload);
        const syncData = JSON.parse(decrypted);

        if (syncData.deviceId !== this.deviceId) {
          this.emit('recordReceived', syncData.record);
          this.log.info(`收到来自 ${syncData.deviceId} 的同步记录`);
        }
      }
    } catch (err) {
      this.log.error('处理同步消息失败:', err);
    }
  }

  // 加密数据
  _encryptData(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      iv: iv.toString('hex'),
      data: encrypted,
      tag: authTag.toString('hex')
    };
  }

  // 解密数据
  _decryptData(encryptedObj) {
    const iv = Buffer.from(encryptedObj.iv, 'hex');
    const authTag = Buffer.from(encryptedObj.tag, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedObj.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  // 处理离线队列
  async _processOfflineQueue() {
    if (this.offlineQueue.length === 0) return;

    this.log.info(`处理 ${this.offlineQueue.length} 条离线队列记录`);

    for (const record of this.offlineQueue) {
      await this.syncRecord(record);
    }

    this.offlineQueue = [];
  }

  // 加载配对设备
  async _loadPairedDevices() {
    try {
      const devices = this.db.getSetting('pairedDevices');
      if (devices) {
        const list = JSON.parse(devices);
        for (const device of list) {
          this.pairedDevices.set(device.id, device);
        }
      }
    } catch (err) {
      this.log.error('加载配对设备失败:', err);
    }
  }

  // 保存配对设备
  async _savePairedDevices() {
    const list = Array.from(this.pairedDevices.values());
    this.db.setSetting('pairedDevices', JSON.stringify(list));
  }

  // 获取同步状态
  getStatus() {
    return {
      enabled: this.syncEnabled,
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      pairedDevices: Array.from(this.pairedDevices.values()),
      connected: this.ws !== null && this.ws.readyState === 1,
      offlineQueueSize: this.offlineQueue.length
    };
  }

  // 解绑设备
  async unpairDevice(deviceId) {
    this.pairedDevices.delete(deviceId);
    await this._savePairedDevices();
    this.log.info(`已解绑设备: ${deviceId}`);
    return true;
  }
}

module.exports = SyncService;

/**
 * ClawBoard - SQLite 数据库模块 (sql.js 纯 JS 实现，无需编译)
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

class Database {
  constructor(userDataPath) {
    this.dbPath = path.join(userDataPath, 'clawboard.db');
    this.dataPath = userDataPath;
    this.db = null;
    this.encryptionKey = null; // 用于内存中临时存储的加密密钥
    this._init();
  }

  // AES-256 加密
  _encrypt(text, key) {
    if (!key) return text;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  // AES-256 解密
  _decrypt(encryptedText, key) {
    if (!key || !encryptedText.includes(':')) return encryptedText;
    try {
      const [ivHex, encrypted] = encryptedText.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err) {
      console.error('解密失败:', err);
      return '[加密内容 - 需要密码]';
    }
  }

  // 设置加密密钥
  setEncryptionKey(password) {
    // 使用 PBKDF2 从密码派生密钥
    const salt = 'clawboard-salt-v1';
    this.encryptionKey = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
    return true;
  }

  // 清除加密密钥
  clearEncryptionKey() {
    this.encryptionKey = null;
    return true;
  }

  async _init() {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();

    // 加载已有数据或创建新数据库
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }

    // 创建表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL DEFAULT 'text',
        content TEXT NOT NULL,
        summary TEXT,
        source TEXT DEFAULT 'clipboard',
        favorite INTEGER DEFAULT 0,
        tags TEXT DEFAULT '[]',
        ai_summary TEXT,
        embedding BLOB,
        language TEXT,
        locked INTEGER DEFAULT 0,
        encrypted INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 添加 encrypted 列（如果不存在）
    try {
      this.db.run(`ALTER TABLE records ADD COLUMN encrypted INTEGER DEFAULT 0`);
    } catch (e) {
      // 列已存在，忽略
    }

    // 添加 ocr_text 列（如果不存在）- v0.17.0 OCR功能
    try {
      this.db.run(`ALTER TABLE records ADD COLUMN ocr_text TEXT`);
    } catch (e) {
      // 列已存在，忽略
    }

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_type ON records(type)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_favorite ON records(favorite)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_created ON records(created_at DESC)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_encrypted ON records(encrypted)`);

    this.db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);

    // 模板表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT DEFAULT '默认',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this._save();
  }

  // 保存到磁盘
  _save() {
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    } catch (err) {
      console.error('数据库保存失败:', err);
    }
  }

  // 添加记录
  addRecord({ type, content, summary, source, tags = '[]', ai_summary = null, embedding = null, language = null, encrypted = false, ocr_text = null }) {
    let finalContent = content;
    if (encrypted && this.encryptionKey) {
      finalContent = this._encrypt(content, this.encryptionKey);
    }
    
    this.db.run(
      `INSERT INTO records (type, content, summary, source, tags, ai_summary, embedding, language, encrypted, ocr_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [type, finalContent, summary, source, tags, ai_summary, embedding, language, encrypted ? 1 : 0, ocr_text]
    );
    
    // 自动清理旧记录（保留收藏）
    this._autoCleanup();
    
    const id = this.db.exec("SELECT last_insert_rowid() as id")[0].values[0][0];
    this._save();
    return this.getRecord(id);
  }

  // 加密已有记录
  encryptRecord(id) {
    if (!this.encryptionKey) return false;
    
    const record = this.getRecord(id);
    if (!record || record.encrypted) return false;
    
    const encryptedContent = this._encrypt(record.content, this.encryptionKey);
    this.db.run(
      `UPDATE records SET content = ?, encrypted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [encryptedContent, id]
    );
    this._save();
    return true;
  }

  // 解密记录（临时解密查看）
  decryptRecord(id) {
    if (!this.encryptionKey) return null;
    
    const record = this.getRecord(id);
    if (!record || !record.encrypted) return record;
    
    const decryptedContent = this._decrypt(record.content, this.encryptionKey);
    return { ...record, content: decryptedContent, decrypted: true };
  }

  // 取消加密
  removeEncryption(id) {
    if (!this.encryptionKey) return false;
    
    const record = this.getRecord(id);
    if (!record || !record.encrypted) return false;
    
    const decryptedContent = this._decrypt(record.content, this.encryptionKey);
    this.db.run(
      `UPDATE records SET content = ?, encrypted = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [decryptedContent, id]
    );
    this._save();
    return true;
  }

  // v0.17.0: 更新 OCR 文本
  updateOCRText(id, ocrText) {
    this.db.run(
      `UPDATE records SET ocr_text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [ocrText, id]
    );
    this._save();
    return true;
  }

  // 自动清理旧记录
  _autoCleanup() {
    const settings = this.getSettings();
    const maxRecords = settings.maxRecords || 1000;
    
    // 获取总记录数
    const total = this.db.exec(`SELECT COUNT(*) FROM records`)[0]?.values[0][0] || 0;
    
    if (total > maxRecords) {
      // 删除最早的未收藏且未锁定的记录
      const deleteCount = total - maxRecords;
      this.db.run(
        `DELETE FROM records WHERE id IN (
          SELECT id FROM records WHERE favorite = 0 AND locked = 0 ORDER BY created_at ASC LIMIT ?
        )`,
        [deleteCount]
      );
      console.log(`自动清理了 ${deleteCount} 条旧记录`);
    }
  }

  // 切换锁定状态
  toggleLock(id) {
    this.db.run(`UPDATE records SET locked = NOT locked, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
    this._save();
    return true;
  }

  // 获取记录
  getRecord(id) {
    const result = this.db.exec(`SELECT * FROM records WHERE id = ?`, [id]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    return this._rowToRecord(result[0].columns, result[0].values[0]);
  }

  // 获取记录列表
  getRecords({ type, limit = 50, offset = 0, search, favorite } = {}) {
    let sql = 'SELECT * FROM records WHERE 1=1';
    const params = [];

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    if (favorite) {
      sql += ' AND favorite = 1';
    }

    if (search) {
      sql += ' AND (content LIKE ? OR summary LIKE ? OR ocr_text LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      // 加密记录不参与搜索
      sql += ' AND encrypted = 0';
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const result = this.db.exec(sql, params);
    if (result.length === 0) return [];
    return result[0].values.map(row => this._rowToRecord(result[0].columns, row));
  }

  // 搜索（支持关键词 + 语义搜索）
  async search(query, limit = 50, useSemantic = true) {
    if (!query) return [];
    
    // 先尝试关键词搜索
    const keywordResult = this.db.exec(
      `SELECT * FROM records WHERE content LIKE ? OR summary LIKE ? ORDER BY created_at DESC LIMIT ?`,
      [`%${query}%`, `%${query}%`, limit]
    );
    
    // 如果不启用语义搜索或没有 embedding 列，直接返回关键词结果
    if (!useSemantic) {
      if (keywordResult.length === 0) return [];
      return keywordResult[0].values.map(row => this._rowToRecord(keywordResult[0].columns, row));
    }
    
    // 语义搜索需要外部传入 embedding 和 AI 模块
    // 这里先返回关键词结果，语义搜索由外部处理
    if (keywordResult.length === 0) return [];
    return keywordResult[0].values.map(row => this._rowToRecord(keywordResult[0].columns, row));
  }

  // 语义搜索（使用嵌入向量）
  async semanticSearch(query, embeddingFunc, limit = 10) {
    if (!query || !embeddingFunc) return [];
    
    try {
      // 生成查询的 embedding
      const queryEmbedding = await embeddingFunc(query);
      if (!queryEmbedding) return [];
      
      // 获取所有有 embedding 的记录
      const result = this.db.exec(`SELECT id, content, summary, embedding FROM records WHERE embedding IS NOT NULL`);
      if (result.length === 0 || result[0].values.length === 0) return [];
      
      // 计算余弦相似度并排序
      const records = result[0].values.map(row => {
        const id = row[0];
        const content = row[1];
        const summary = row[2];
        // embedding 是 base64 编码的 Blob
        const embedding = row[3] ? this._decodeEmbedding(row[3]) : null;
        
        if (!embedding) return null;
        
        const similarity = this._cosineSimilarity(queryEmbedding, embedding);
        return { id, content, summary, similarity };
      }).filter(r => r !== null);
      
      // 按相似度排序
      records.sort((a, b) => b.similarity - a.similarity);
      
      // 返回 top N
      return records.slice(0, limit).map(r => this.getRecord(r.id)).filter(r => r !== null);
    } catch (err) {
      console.error('语义搜索失败:', err);
      return [];
    }
  }

  // 解码 embedding（支持 Array 和 Blob）
  _decodeEmbedding(embeddingData) {
    if (!embeddingData) return null;
    
    // 如果是 Array（sql.js 返回）
    if (Array.isArray(embeddingData)) {
      return embeddingData;
    }
    
    // 如果是 Buffer/Blob
    if (embeddingData instanceof Uint8Array || Buffer.isBuffer(embeddingData)) {
      return Array.from(embeddingData);
    }
    
    return null;
  }

  // 计算余弦相似度
  _cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // 切换收藏
  toggleFavorite(id) {
    this.db.run(`UPDATE records SET favorite = NOT favorite, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
    this._save();
    return true;
  }

  // 删除记录
  deleteRecord(id) {
    this.db.run(`DELETE FROM records WHERE id = ?`, [id]);
    this._save();
    return true;
  }

  // 清空历史
  clearHistory() {
    this.db.run(`DELETE FROM records WHERE favorite = 0`);
    this._save();
    return true;
  }

  // 获取统计
  getStats() {
    const total = this.db.exec(`SELECT COUNT(*) FROM records`)[0]?.values[0][0] || 0;
    const text = this.db.exec(`SELECT COUNT(*) FROM records WHERE type = 'text'`)[0]?.values[0][0] || 0;
    const image = this.db.exec(`SELECT COUNT(*) FROM records WHERE type = 'image'`)[0]?.values[0][0] || 0;
    const file = this.db.exec(`SELECT COUNT(*) FROM records WHERE type = 'file'`)[0]?.values[0][0] || 0;
    const code = this.db.exec(`SELECT COUNT(*) FROM records WHERE type = 'code'`)[0]?.values[0][0] || 0;
    const favorite = this.db.exec(`SELECT COUNT(*) FROM records WHERE favorite = 1`)[0]?.values[0][0] || 0;
    return { total, text, image, file, code, favorite };
  }

  // 获取设置
  getSettings() {
    const result = this.db.exec(`SELECT key, value FROM settings`);
    if (result.length === 0) return {};
    const settings = {};
    result[0].values.forEach(([key, value]) => {
      try {
        settings[key] = JSON.parse(value);
      } catch {
        settings[key] = value;
      }
    });
    return settings;
  }

  // 保存设置
  saveSettings(settings) {
    for (const [key, value] of Object.entries(settings)) {
      this.db.run(
        `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
        [key, JSON.stringify(value)]
      );
    }
    this._save();
    return true;
  }

  // ==================== 模板管理 ====================
  // 获取所有模板
  getTemplates() {
    const result = this.db.exec(`SELECT * FROM templates ORDER BY created_at DESC`);
    if (result.length === 0) return [];
    return result[0].values.map(row => this._rowToRecord(result[0].columns, row));
  }

  // 添加模板
  addTemplate(name, content, category = '默认') {
    this.db.run(
      `INSERT INTO templates (name, content, category) VALUES (?, ?, ?)`,
      [name, content, category]
    );
    const id = this.db.exec("SELECT last_insert_rowid() as id")[0].values[0][0];
    this._save();
    return this.getTemplate(id);
  }

  // 获取单个模板
  getTemplate(id) {
    const result = this.db.exec(`SELECT * FROM templates WHERE id = ?`, [id]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    return this._rowToRecord(result[0].columns, result[0].values[0]);
  }

  // 更新模板
  updateTemplate(id, name, content, category) {
    this.db.run(
      `UPDATE templates SET name = ?, content = ?, category = ? WHERE id = ?`,
      [name, content, category, id]
    );
    this._save();
    return this.getTemplate(id);
  }

  // 删除模板
  deleteTemplate(id) {
    this.db.run(`DELETE FROM templates WHERE id = ?`, [id]);
    this._save();
    return true;
  }

  // 关闭
  close() {
    if (this.db) {
      this._save();
      this.db.close();
    }
  }

  // 辅助：将列和值转为对象
  _rowToRecord(columns, values) {
    if (!values) return null;
    const record = {};
    columns.forEach((col, i) => {
      record[col] = values[i];
    });
    // 加密记录的内容替换为占位符
    if (record.encrypted && !this.encryptionKey) {
      record.content = '🔒 加密内容';
    }
    return record;
  }
}

module.exports = Database;

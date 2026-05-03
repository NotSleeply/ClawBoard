/**
 * ClawBoard - SQLite 数据库模块 (sql.js 纯 JS 实现，无需编译)
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const lz = require('lz-string');

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
        source_app TEXT,
        source_title TEXT,
        source_url TEXT,
        favorite INTEGER DEFAULT 0,
        tags TEXT DEFAULT '[]',
        ai_summary TEXT,
        embedding BLOB,
        language TEXT,
        locked INTEGER DEFAULT 0,
        encrypted INTEGER DEFAULT 0,
        synced INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 添加新列（如果不存在）
    ['source_app', 'source_title', 'source_url', 'synced'].forEach(col => {
      try {
        this.db.run(`ALTER TABLE records ADD COLUMN ${col} ${col === 'synced' ? 'INTEGER DEFAULT 0' : 'TEXT'}`);
      } catch (e) {
        // 列已存在，忽略
      }
    });

    // 添加 ocr_text 列（如果不存在）- v0.17.0 OCR功能
    try {
      this.db.run(`ALTER TABLE records ADD COLUMN ocr_text TEXT`);
    } catch (e) {
      // 列已存在，忽略
    }

    // 添加合并相关列（如果不存在）- v0.23.0 合并功能
    ['merged_from', 'is_merged'].forEach(col => {
      try {
        this.db.run(`ALTER TABLE records ADD COLUMN ${col} TEXT`);
      } catch (e) {
        // 列已存在，忽略
      }
    });

    // 添加分组和排序相关列（如果不存在）- v0.24.0 分组管理
    try {
      this.db.run(`ALTER TABLE records ADD COLUMN sort_order INTEGER DEFAULT 0`);
    } catch (e) {
      // 列已存在，忽略
    }
    try {
      this.db.run(`ALTER TABLE records ADD COLUMN group_id INTEGER`);
    } catch (e) {
      // 列已存在，忽略
    }

    // 添加备注列（如果不存在）- v0.30.0 条目备注功能
    try {
      this.db.run(`ALTER TABLE records ADD COLUMN note TEXT DEFAULT ''`);
    } catch (e) {
      // 列已存在，忽略
    }

    // 添加敏感类型列（如果不存在）- v0.45.0 自动加密规则
    try {
      this.db.run(`ALTER TABLE records ADD COLUMN sensitive_types TEXT DEFAULT ''`);
    } catch (e) {
      // 列已存在，忽略
    }

    // v0.70.0: 添加压缩标记列
    try {
      this.db.run(`ALTER TABLE records ADD COLUMN compressed INTEGER DEFAULT 0`);
    } catch (e) {
      // 列已存在，忽略
    }

    // 添加 AI 设置表（v0.54.0 AI 能力扩展）
    this.db.run(`
      CREATE TABLE IF NOT EXISTS ai_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建分组表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#3b82f6',
        icon TEXT DEFAULT '📁',
        collapsed INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

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
  addRecord({ type, content, summary, source, source_app, source_title, source_url, tags = '[]', ai_summary = null, embedding = null, language = null, encrypted = false, ocr_text = null, merged_from = null, is_merged = false, sensitive_types = '' }) {
    let finalContent = content;
    let compressed = 0;
    if (encrypted && this.encryptionKey) {
      finalContent = this._encrypt(content, this.encryptionKey);
    }

    // v0.70.0: Compress large content (skip encrypted records)
    if (!encrypted && finalContent.length > 1024) {
      try {
        const compressedStr = lz.compress(finalContent);
        if (compressedStr.length < finalContent.length) {
          finalContent = compressedStr;
          compressed = 1;
        }
      } catch (e) {
        console.error('Compression failed:', e);
      }
    }

    this.db.run(
      `INSERT INTO records (type, content, compressed, summary, source, source_app, source_title, source_url, tags, ai_summary, embedding, language, encrypted, ocr_text, merged_from, is_merged, sensitive_types) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [type, finalContent, compressed, summary, source || 'clipboard', source_app || null, source_title || null, source_url || null, tags, ai_summary, embedding, language, encrypted ? 1 : 0, ocr_text, merged_from, is_merged ? 1 : 0, sensitive_types]
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

  // ==================== 智能去重 ====================
  // 计算文本相似度（基于编辑距离）
  _levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  // 计算相似度（0-1）
  _similarity(a, b) {
    if (!a || !b) return 0;
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    const dist = this._levenshteinDistance(a, b);
    return 1 - dist / maxLen;
  }

  // 查找相似记录
  findSimilar(content, threshold = 0.8, limit = 5) {
    if (!content || content.length < 10) return [];

    const result = this.db.exec(`
      SELECT id, content, created_at, favorite, type
      FROM records
      WHERE encrypted = 0 AND type = 'text'
      ORDER BY created_at DESC
      LIMIT 100
    `);

    if (result.length === 0 || result[0].values.length === 0) return [];

    const similar = [];
    for (const row of result[0].values) {
      const [id, recordContent, createdAt, favorite, type] = row;
      const sim = this._similarity(content, recordContent);
      if (sim >= threshold && sim < 1) { // 排除完全相同
        similar.push({
          id,
          content: recordContent.substring(0, 200),
          similarity: Math.round(sim * 100),
          created_at: createdAt,
          favorite: favorite === 1,
          type,
        });
        if (similar.length >= limit) break;
      }
    }

    return similar.sort((a, b) => b.similarity - a.similarity);
  }

  // 检查完全重复
  findExactDuplicate(content) {
    const result = this.db.exec(
      `SELECT id, created_at FROM records WHERE content = ? AND encrypted = 0 LIMIT 1`,
      [content]
    );
    if (result.length === 0 || result[0].values.length === 0) return null;
    return { id: result[0].values[0][0], created_at: result[0].values[0][1] };
  }

  // 批量查找重复记录
  findDuplicates() {
    const result = this.db.exec(`
      SELECT content, COUNT(*) as count, GROUP_CONCAT(id) as ids
      FROM records
      WHERE encrypted = 0
      GROUP BY content
      HAVING count > 1
      ORDER BY count DESC
      LIMIT 50
    `);

    if (result.length === 0) return [];
    return result[0].values.map(([content, count, ids]) => ({
      content: content.substring(0, 100),
      count,
      ids: ids.split(',').map(Number),
    }));
  }

  // 清理重复记录（保留最新的一条）
  cleanupDuplicates() {
    const duplicates = this.findDuplicates();
    let deletedCount = 0;

    for (const dup of duplicates) {
      // 保留最后一条，删除其他的
      const idsToDelete = dup.ids.slice(0, -1);
      for (const id of idsToDelete) {
        this.db.run(`DELETE FROM records WHERE id = ? AND favorite = 0 AND locked = 0`, [id]);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      this._save();
    }
    return deletedCount;
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
  getRecords({ type, limit = 50, offset = 0, search, favorite, sourceApp } = {}) {
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
      sql += ' AND (content LIKE ? OR summary LIKE ? OR ocr_text LIKE ? OR note LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      // 加密记录不参与搜索
      sql += ' AND encrypted = 0';
    }

    // 按来源应用筛选
    if (sourceApp) {
      sql += ' AND source_app = ?';
      params.push(sourceApp);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const result = this.db.exec(sql, params);
    if (result.length === 0) return [];
    return result[0].values.map(row => this._rowToRecord(result[0].columns, row));
  }

  // v0.57.0: 快速粘贴搜索方法
  searchRecords(options = {}) {
    const limit = options.limit || 30;
    const search = options.search;
    try {
      let result;
      if (search) {
        result = this.db.exec(
          `SELECT id, type, content, created_at FROM records WHERE content LIKE ? ORDER BY created_at DESC LIMIT ?`,
          [`%${search}%`, limit]
        );
      } else {
        result = this.db.exec(
          `SELECT id, type, content, created_at FROM records ORDER BY created_at DESC LIMIT ?`,
          [limit]
        );
      }
      if (result.length === 0 || result[0].values.length === 0) return [];
      return result[0].values.map(row => {
        const rec = {};
        result[0].columns.forEach((col, i) => { rec[col] = row[i]; });
        return rec;
      });
    } catch (e) {
      console.error('searchRecords error:', e);
      return [];
    }
  }

  // 获取来源应用列表及其记录数
  getSourceApps() {
    const result = this.db.exec(`
      SELECT source_app, COUNT(*) as count
      FROM records
      WHERE source_app IS NOT NULL AND source_app != ''
      GROUP BY source_app
      ORDER BY count DESC
      LIMIT 20
    `);
    if (result.length === 0) return [];
    return result[0].values.map(([app, count]) => ({ app, count }));
  }

  // ==================== 标签系统 ====================
  // 获取所有标签及其记录数
  getAllTags() {
    // 从所有记录的 tags 字段提取标签
    const result = this.db.exec(`SELECT tags FROM records WHERE tags IS NOT NULL AND tags != '[]'`);
    const tagCount = {};

    if (result.length > 0 && result[0].values.length > 0) {
      result[0].values.forEach(([tagsJson]) => {
        try {
          const tags = JSON.parse(tagsJson);
          tags.forEach(tag => {
            tagCount[tag] = (tagCount[tag] || 0) + 1;
          });
        } catch (e) {}
      });
    }

    return Object.entries(tagCount)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  // 为记录添加标签
  addTag(recordId, tag) {
    const record = this.getRecord(recordId);
    if (!record) return false;

    let tags = [];
    try {
      tags = JSON.parse(record.tags || '[]');
    } catch (e) {}

    tag = tag.trim();
    if (!tag || tags.includes(tag)) return true; // 标签已存在

    tags.push(tag);
    this.db.run(`UPDATE records SET tags = ? WHERE id = ?`, [JSON.stringify(tags), recordId]);
    this._save();
    return true;
  }

  // 移除记录标签
  removeTag(recordId, tag) {
    const record = this.getRecord(recordId);
    if (!record) return false;

    let tags = [];
    try {
      tags = JSON.parse(record.tags || '[]');
    } catch (e) {}

    const index = tags.indexOf(tag);
    if (index === -1) return true;

    tags.splice(index, 1);
    this.db.run(`UPDATE records SET tags = ? WHERE id = ?`, [JSON.stringify(tags), recordId]);
    this._save();
    return true;
  }

  // 获取带标签的记录
  getRecords({ type, limit = 50, offset = 0, search, favorite, sourceApp, tag } = {}) {
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
      sql += ' AND encrypted = 0';
    }

    if (sourceApp) {
      sql += ' AND source_app = ?';
      params.push(sourceApp);
    }

    // 按标签筛选
    if (tag) {
      sql += ' AND tags LIKE ?';
      params.push(`%"${tag}"%`);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const result = this.db.exec(sql, params);
    if (result.length === 0) return [];
    return result[0].values.map(row => this._rowToRecord(result[0].columns, row));
  }

  // 删除标签（从所有记录中移除）
  deleteTag(tag) {
    const result = this.db.exec(`SELECT id, tags FROM records WHERE tags LIKE ?`, [`%"${tag}"%`]);
    if (result.length === 0) return 0;

    let count = 0;
    result[0].values.forEach(([id, tagsJson]) => {
      try {
        let tags = JSON.parse(tagsJson || '[]');
        const index = tags.indexOf(tag);
        if (index !== -1) {
          tags.splice(index, 1);
          this.db.run(`UPDATE records SET tags = ? WHERE id = ?`, [JSON.stringify(tags), id]);
          count++;
        }
      } catch (e) {}
    });

    if (count > 0) this._save();
    return count;
  }

  // 搜索（支持关键词 + 语义搜索）
  async search(query, limit = 50, useSemantic = true) {
    if (!query) return [];
    
    // 先尝试关键词搜索（包含 ocr_text 和 note）
    const keywordResult = this.db.exec(
      `SELECT * FROM records WHERE content LIKE ? OR summary LIKE ? OR ocr_text LIKE ? OR note LIKE ? ORDER BY created_at DESC LIMIT ?`,
      [`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, limit]
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
      
      // 获取所有有 embedding 的记录（v0.40.0: 含 ocr_text）
      const result = this.db.exec(`SELECT id, content, summary, ocr_text, embedding FROM records WHERE embedding IS NOT NULL`);
      if (result.length === 0 || result[0].values.length === 0) return [];
      
      // 计算余弦相似度并排序
      const records = result[0].values.map(row => {
        const id = row[0];
        const content = row[1];
        const summary = row[2];
        const ocrText = row[3];
        // embedding 是 base64 编码的 Blob
        const embedding = row[4] ? this._decodeEmbedding(row[4]) : null;
        
        if (!embedding) return null;
        
        const similarity = this._cosineSimilarity(queryEmbedding, embedding);
        return { id, content, summary, ocrText, similarity };
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

  // 更新备注
  updateNote(id, note) {
    this.db.run(`UPDATE records SET note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [note, id]);
    this._save();
    return true;
  }

  // v0.38.0: 更新条目内容（内容编辑器）
  updateItemContent(id, newContent) {
    const record = this.getRecord(id);
    if (!record) return null;
    if (record.encrypted) return null; // 加密记录不允许直接编辑

    this.db.run(
      `UPDATE records SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [newContent, id]
    );
    this._save();
    return this.getRecord(id);
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

  // 获取详细统计
  getDetailedStats() {
    const basic = this.getStats();

    // 今日记录数
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayCount = this.db.exec(`SELECT COUNT(*) FROM records WHERE created_at >= ?`, [todayStart.toISOString()])[0]?.values[0][0] || 0;

    // 本周记录数
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekCount = this.db.exec(`SELECT COUNT(*) FROM records WHERE created_at >= ?`, [weekStart.toISOString()])[0]?.values[0][0] || 0;

    // 本月记录数
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthCount = this.db.exec(`SELECT COUNT(*) FROM records WHERE created_at >= ?`, [monthStart.toISOString()])[0]?.values[0][0] || 0;

    // 平均每日记录数
    const firstRecord = this.db.exec(`SELECT MIN(created_at) FROM records`)[0]?.values[0][0];
    let avgPerDay = 0;
    if (firstRecord) {
      const days = Math.max(1, Math.ceil((Date.now() - new Date(firstRecord).getTime()) / (1000 * 60 * 60 * 24)));
      avgPerDay = Math.round((basic.total / days) * 10) / 10;
    }

    // 最活跃时段（按小时统计）
    const hourlyStats = this.db.exec(`
      SELECT strftime('%H', created_at) as hour, COUNT(*) as count
      FROM records
      GROUP BY hour
      ORDER BY count DESC
      LIMIT 3
    `);
    const peakHours = hourlyStats.length > 0
      ? hourlyStats[0].values.map(([h, c]) => ({ hour: parseInt(h), count: c }))
      : [];

    // 类型占比
    const typePercent = {};
    if (basic.total > 0) {
      typePercent.text = Math.round((basic.text / basic.total) * 100);
      typePercent.image = Math.round((basic.image / basic.total) * 100);
      typePercent.file = Math.round((basic.file / basic.total) * 100);
      typePercent.code = Math.round((basic.code / basic.total) * 100);
    }

    // 最近7天趋势
    const trend = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const nextD = new Date(d);
      nextD.setDate(nextD.getDate() + 1);
      const count = this.db.exec(
        `SELECT COUNT(*) FROM records WHERE created_at >= ? AND created_at < ?`,
        [d.toISOString(), nextD.toISOString()]
      )[0]?.values[0][0] || 0;
      trend.push({
        date: d.toISOString().slice(0, 10),
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        count,
      });
    }

    // 加密记录数
    const encrypted = this.db.exec(`SELECT COUNT(*) FROM records WHERE encrypted = 1`)[0]?.values[0][0] || 0;

    return {
      ...basic,
      today: todayCount,
      week: weekCount,
      month: monthCount,
      avgPerDay,
      peakHours,
      typePercent,
      trend,
      encrypted,
      firstRecordDate: firstRecord,
    };
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

  // ==================== 分组管理 ====================
  // 获取所有分组
  getAllGroups() {
    const result = this.db.exec(`SELECT * FROM groups ORDER BY sort_order ASC, created_at DESC`);
    if (result.length === 0) return [];
    return result[0].values.map(row => {
      const group = {};
      result[0].columns.forEach((col, i) => group[col] = row[i]);
      return group;
    });
  }

  // 创建分组
  createGroup(name, color = '#3b82f6', icon = '📁') {
    // 获取最大排序值
    const maxOrder = this.db.exec(`SELECT MAX(sort_order) FROM groups`)[0]?.values[0][0] || 0;
    
    this.db.run(
      `INSERT INTO groups (name, color, icon, sort_order) VALUES (?, ?, ?, ?)`,
      [name, color, icon, maxOrder + 1]
    );
    const id = this.db.exec(`SELECT last_insert_rowid() as id`)[0].values[0][0];
    this._save();
    return this.getGroup(id);
  }

  // 获取单个分组
  getGroup(id) {
    const result = this.db.exec(`SELECT * FROM groups WHERE id = ?`, [id]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    const group = {};
    result[0].columns.forEach((col, i) => group[col] = result[0].values[0][i]);
    return group;
  }

  // 更新分组
  updateGroup(id, { name, color, icon, collapsed, sort_order }) {
    const updates = [];
    const params = [];
    
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (color !== undefined) { updates.push('color = ?'); params.push(color); }
    if (icon !== undefined) { updates.push('icon = ?'); params.push(icon); }
    if (collapsed !== undefined) { updates.push('collapsed = ?'); params.push(collapsed ? 1 : 0); }
    if (sort_order !== undefined) { updates.push('sort_order = ?'); params.push(sort_order); }
    
    if (updates.length === 0) return this.getGroup(id);
    
    params.push(id);
    this.db.run(`UPDATE groups SET ${updates.join(', ')} WHERE id = ?`, params);
    this._save();
    return this.getGroup(id);
  }

  // 删除分组（将记录移到未分组）
  deleteGroup(id) {
    // 先将分组中的记录移到未分组
    this.db.run(`UPDATE records SET group_id = NULL WHERE group_id = ?`, [id]);
    this.db.run(`DELETE FROM groups WHERE id = ?`, [id]);
    this._save();
    return true;
  }

  // 切换分组折叠状态
  toggleGroupCollapsed(id) {
    const group = this.getGroup(id);
    if (!group) return false;
    this.db.run(`UPDATE groups SET collapsed = NOT collapsed WHERE id = ?`, [id]);
    this._save();
    return true;
  }

  // 移动记录到分组
  moveRecordToGroup(recordId, groupId) {
    this.db.run(
      `UPDATE records SET group_id = ? WHERE id = ?`,
      [groupId, recordId]
    );
    this._save();
    return true;
  }

  // 获取分组中的记录
  getRecords({ type, limit = 50, offset = 0, search, favorite, sourceApp, tag, groupId } = {}) {
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
      sql += ' AND encrypted = 0';
    }

    if (sourceApp) {
      sql += ' AND source_app = ?';
      params.push(sourceApp);
    }

    if (tag) {
      sql += ' AND tags LIKE ?';
      params.push(`%"${tag}"%`);
    }

    if (groupId !== undefined) {
      if (groupId === null) {
        sql += ' AND group_id IS NULL';
      } else {
        sql += ' AND group_id = ?';
        params.push(groupId);
      }
    }

    sql += ' ORDER BY sort_order ASC, created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const result = this.db.exec(sql, params);
    if (result.length === 0) return [];
    return result[0].values.map(row => this._rowToRecord(result[0].columns, row));
  }

  // 更新记录排序
  updateRecordSortOrder(recordId, newOrder, newGroupId = null) {
    this.db.run(
      `UPDATE records SET sort_order = ?, group_id = ? WHERE id = ?`,
      [newOrder, newGroupId, recordId]
    );
    this._save();
    return true;
  }

  // 批量更新排序
  batchUpdateSortOrder(updates) {
    // updates: [{ id, sort_order, group_id }]
    for (const update of updates) {
      this.db.run(
        `UPDATE records SET sort_order = ?, group_id = ? WHERE id = ?`,
        [update.sort_order, update.group_id, update.id]
      );
    }
    this._save();
    return true;
  }

  // v0.25.0: 统计数据导出
  getDetailedStatsForExport() {
    const stats = this.getStats();
    const detailedStats = this.getDetailedStats();

    // 按类型获取记录
    const typeRecords = {};
    const types = ['text', 'code', 'file', 'image'];
    for (const type of types) {
      const result = this.db.exec(
        `SELECT id, content, created_at FROM records WHERE type = ? ORDER BY created_at DESC`,
        [type]
      );
      if (result.length > 0) {
        typeRecords[type] = result[0].values.map(row => ({
          id: row[0],
          content: row[1],
          created_at: row[2]
        }));
      } else {
        typeRecords[type] = [];
      }
    }

    // 按来源应用获取记录
    const sourceRecords = {};
    const sourceResult = this.db.exec(
      `SELECT source_app, COUNT(*) as count FROM records WHERE source_app IS NOT NULL GROUP BY source_app ORDER BY count DESC LIMIT 20`
    );
    if (sourceResult.length > 0) {
      sourceResult[0].values.forEach(row => {
        sourceRecords[row[0]] = row[1];
      });
    }

    // 按标签统计
    const tagRecords = {};
    const tagResult = this.db.exec(`SELECT id, tags FROM records WHERE tags IS NOT NULL AND tags != ''`);
    if (tagResult.length > 0) {
      tagResult[0].values.forEach(row => {
        try {
          const tags = JSON.parse(row[1]);
          tags.forEach(tag => {
            tagRecords[tag] = (tagRecords[tag] || 0) + 1;
          });
        } catch (e) {}
      });
    }

    return {
      summary: stats,
      detailed: detailedStats,
      byType: typeRecords,
      bySource: sourceRecords,
      byTag: tagRecords
    };
  }

  // 导出记录为指定格式
  exportRecords(format = 'json', options = {}) {
    let sql = 'SELECT * FROM records WHERE 1=1';
    const params = [];

    if (options.type) {
      sql += ' AND type = ?';
      params.push(options.type);
    }

    if (options.startDate) {
      sql += ' AND created_at >= ?';
      params.push(options.startDate);
    }

    if (options.endDate) {
      sql += ' AND created_at <= ?';
      params.push(options.endDate);
    }

    if (options.favorite) {
      sql += ' AND favorite = 1';
    }

    sql += ' ORDER BY created_at DESC';

    const result = this.db.exec(sql, params);
    if (result.length === 0) return [];

    const records = result[0].values.map(row => this._rowToRecord(result[0].columns, row));

    switch (format) {
      case 'csv':
        return this._recordsToCSV(records);
      case 'json':
      default:
        return JSON.stringify(records, null, 2);
    }
  }

  _recordsToCSV(records) {
    if (records.length === 0) return '';

    const headers = ['id', 'type', 'content', 'created_at', 'favorite', 'source_app', 'language', 'tags'];
    const rows = [headers.join(',')];

    for (const record of records) {
      const row = headers.map(h => {
        let value = record[h];
        if (value === null || value === undefined) return '';
        if (typeof value === 'string') {
          // 处理 CSV 中的特殊字符
          value = value.replace(/"/g, '""');
          if (value.includes(',') || value.includes('\n') || value.includes('"')) {
            value = `"${value}"`;
          }
        }
        return value;
      });
      rows.push(row.join(','));
    }

    return rows.join('\n');
  }

  // 辅助：将列和值转为对象
  _rowToRecord(columns, values) {
    if (!values) return null;
    const record = {};
    columns.forEach((col, i) => {
      record[col] = values[i];
    });
    // v0.70.0: Decompress if needed
    if (record.compressed && record.content) {
      try {
        record.content = lz.decompress(record.content);
      } catch (e) {
        console.error('Decompression failed:', e);
      }
    }
    // 加密记录的内容替换为占位符
    if (record.encrypted && !this.encryptionKey) {
      record.content = '🔒 加密内容';
    }
    return record;
  }

  // v0.27.0: 获取所有置顶记录（支持分页和搜索）
  getPinnedRecords({ search, limit = 100, offset = 0, tag } = {}) {
    let sql = 'SELECT * FROM records WHERE favorite = 1';
    const params = [];

    if (search) {
      sql += ' AND (content LIKE ? OR summary LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
      sql += ' AND encrypted = 0';
    }

    if (tag) {
      sql += ' AND tags LIKE ?';
      params.push(`%"${tag}"%`);
    }

    sql += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const result = this.db.exec(sql, params);
    if (result.length === 0) return [];
    return result[0].values.map(row => this._rowToRecord(result[0].columns, row));
  }

  // v0.27.0: 更新置顶记录内容
  updatePinnedRecord(id, { content, tags, summary }) {
    const record = this.getRecord(id);
    if (!record) return null;

    // 只能更新已置顶的记录
    if (!record.favorite) return null;

    const updates = [];
    const params = [];

    if (content !== undefined) {
      updates.push('content = ?');
      params.push(content);
    }
    if (tags !== undefined) {
      updates.push('tags = ?');
      params.push(typeof tags === 'string' ? tags : JSON.stringify(tags));
    }
    if (summary !== undefined) {
      updates.push('summary = ?');
      params.push(summary);
    }

    if (updates.length === 0) return record;

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    this.db.run(`UPDATE records SET ${updates.join(', ')} WHERE id = ?`, params);
    this._save();
    return this.getRecord(id);
  }

  // v0.27.0: 批量更新置顶记录
  batchUpdatePinned(ids, { favorite, tags, groupId, delete: shouldDelete }) {
    if (!Array.isArray(ids) || ids.length === 0) return { updated: 0, deleted: 0 };

    const placeholders = ids.map(() => '?').join(',');

    if (shouldDelete) {
      // 批量删除
      this.db.run(`DELETE FROM records WHERE id IN (${placeholders}) AND favorite = 1`, ids);
      this._save();
      return { updated: 0, deleted: ids.length };
    }

    let updated = 0;
    if (favorite !== undefined) {
      this.db.run(`UPDATE records SET favorite = ? WHERE id IN (${placeholders})`, [favorite ? 1 : 0, ...ids]);
      updated += this.db.getRowsModified();
    }
    if (tags !== undefined) {
      const tagsJson = typeof tags === 'string' ? tags : JSON.stringify(tags);
      this.db.run(`UPDATE records SET tags = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`, [tagsJson, ...ids]);
      updated += this.db.getRowsModified();
    }
    if (groupId !== undefined) {
      this.db.run(`UPDATE records SET group_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`, [groupId, ...ids]);
      updated += this.db.getRowsModified();
    }

    if (updated > 0) this._save();
    return { updated, deleted: 0 };
  }

  // v0.27.0: 获取置顶记录统计
  getPinnedStats() {
    const total = this.db.exec(`SELECT COUNT(*) FROM records WHERE favorite = 1`)[0]?.values[0][0] || 0;

    // 按类型分布
    const byType = {};
    const typeResult = this.db.exec(`
      SELECT type, COUNT(*) as count
      FROM records WHERE favorite = 1
      GROUP BY type
    `);
    if (typeResult.length > 0) {
      typeResult[0].values.forEach(([type, count]) => {
        byType[type] = count;
      });
    }

    // 按来源应用分布
    const bySource = {};
    const sourceResult = this.db.exec(`
      SELECT source_app, COUNT(*) as count
      FROM records WHERE favorite = 1 AND source_app IS NOT NULL
      GROUP BY source_app
      ORDER BY count DESC
      LIMIT 10
    `);
    if (sourceResult.length > 0) {
      sourceResult[0].values.forEach(([app, count]) => {
        bySource[app] = count;
      });
    }

    // 带标签的置顶记录数
    const withTags = this.db.exec(`
      SELECT COUNT(*) FROM records
      WHERE favorite = 1 AND tags IS NOT NULL AND tags != '[]' AND tags != ''
    `)[0]?.values[0][0] || 0;

    // 最近一周新增的置顶记录
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recentWeek = this.db.exec(`
      SELECT COUNT(*) FROM records
      WHERE favorite = 1 AND updated_at >= ?
    `, [weekAgo.toISOString()])[0]?.values[0][0] || 0;

    return {
      total,
      byType,
      bySource,
      withTags,
      withoutTags: total - withTags,
      recentWeek,
    };
  }

  // v0.26.0: 获取运行时健康监控数据
  getRuntimeStats() {
    const stats = this.getStats();
    
    // 获取数据库文件大小
    let dbSize = 0;
    try {
      const dbInfo = fs.statSync(this.dbPath);
      dbSize = dbInfo.size;
    } catch (e) {
      dbSize = 0;
    }

    // 获取设置信息
    const settings = this.getSettings();

    return {
      records: stats,
      database: {
        path: this.dbPath,
        size: dbSize,
        sizeFormatted: this._formatBytes(dbSize),
      },
      settings: {
        maxRecords: settings.maxRecords || 1000,
        autoCleanup: settings.autoCleanup !== false,
        encryption: settings.encryptionPassword ? true : false,
      },
      version: 'v0.26.0-dev',
    };
  }

  // 格式化字节大小
  _formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // v0.28.0: 云端同步功能

  /**
   * 获取同步元数据
   */
  getSyncMetadata() {
    const stats = this.getStats();
    const settings = this.getSettings();
    
    // 获取上次同步时间
    let lastSyncTime = null;
    try {
      const syncInfo = this.db.exec(`
        SELECT value FROM settings WHERE key = 'last_sync_time'
      `);
      if (syncInfo.length > 0 && syncInfo[0].values.length > 0) {
        lastSyncTime = syncInfo[0].values[0][0];
      }
    } catch (e) {}

    // 获取同步配置
    let syncConfig = null;
    try {
      const configResult = this.db.exec(`
        SELECT value FROM settings WHERE key = 'sync_config'
      `);
      if (configResult.length > 0 && configResult[0].values.length > 0) {
        syncConfig = JSON.parse(configResult[0].values[0][0]);
      }
    } catch (e) {
      syncConfig = null;
    }

    return {
      lastSyncTime,
      totalRecords: stats.total,
      syncedRecords: this._getSyncedCount(),
      pendingRecords: stats.total - this._getSyncedCount(),
      config: syncConfig,
    };
  }

  _getSyncedCount() {
    try {
      const result = this.db.exec(`
        SELECT COUNT(*) FROM records WHERE synced = 1
      `);
      return result[0]?.values[0][0] || 0;
    } catch (e) {
      return 0;
    }
  }

  /**
   * 保存同步配置
   */
  saveSyncConfig(config) {
    this.db.run(`
      INSERT OR REPLACE INTO settings (key, value) VALUES ('sync_config', ?)
    `, [JSON.stringify(config)]);
    this._save();
    return true;
  }

  /**
   * 更新最后同步时间
   */
  updateLastSyncTime() {
    const now = new Date().toISOString();
    this.db.run(`
      INSERT OR REPLACE INTO settings (key, value) VALUES ('last_sync_time', ?)
    `, [now]);
    this._save();
    return now;
  }

  /**
   * 获取可同步的记录（用于上传）
   * @param {Object} options - 筛选选项
   * @param {boolean} options.onlyFavorites - 仅同步收藏
   * @param {string} options.since - 仅获取指定时间后的记录
   * @param {number} options.limit - 限制数量
   */
  getSyncableRecords({ onlyFavorites = false, since = null, limit = 100 } = {}) {
    let sql = 'SELECT * FROM records WHERE 1=1';
    const params = [];

    if (onlyFavorites) {
      sql += ' AND favorite = 1';
    }

    if (since) {
      sql += ' AND updated_at >= ?';
      params.push(since);
    }

    sql += ' ORDER BY updated_at DESC LIMIT ?';
    params.push(limit);

    const result = this.db.exec(sql, params);
    if (result.length === 0) return [];

    return result[0].values.map(row => this._rowToRecord(result[0].columns, row));
  }

  /**
   * 导出数据用于同步（支持加密）
   * @param {Object} options - 导出选项
   */
  exportForSync({ 
    records = null,     // 指定记录，不指定则导出所有
    includeSettings = true,
    encrypt = false,
    encryptionKey = null
  } = {}) {
    // 获取要导出的记录
    const recordsToExport = records || this.getSyncableRecords({ limit: 10000 });

    // 构建导出数据
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      recordCount: recordsToExport.length,
      records: recordsToExport.map(r => ({
        ...r,
        // 不包含敏感字段
        synced: undefined,
      })),
    };

    if (includeSettings) {
      exportData.settings = this.getSettings();
    }

    // 如果需要加密
    if (encrypt && encryptionKey) {
      const crypto = require('crypto');
      const iv = crypto.randomBytes(16);
      const key = crypto.scryptSync(encryptionKey, 'salt', 32);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      
      let encrypted = cipher.update(JSON.stringify(exportData), 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag().toString('hex');

      return {
        encrypted: true,
        iv: iv.toString('hex'),
        authTag,
        data: encrypted,
      };
    }

    return {
      encrypted: false,
      data: exportData,
    };
  }

  /**
   * 从同步数据导入
   * @param {Object} syncData - 同步数据
   * @param {string} encryptionKey - 解密密钥（如果数据加密）
   * @param {Object} options - 导入选项
   */
  importFromSync(syncData, encryptionKey = null, { 
    conflictMode = 'newer',  // newer: 保留较新的, local: 保留本地, remote: 保留远程
    skipExisting = true,
  } = {}) {
    let importData = syncData;

    // 如果数据加密，先解密
    if (syncData.encrypted && encryptionKey) {
      try {
        const crypto = require('crypto');
        const iv = Buffer.from(syncData.iv, 'hex');
        const authTag = Buffer.from(syncData.authTag, 'hex');
        const key = crypto.scryptSync(encryptionKey, 'salt', 32);
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(syncData.data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        importData = JSON.parse(decrypted);
      } catch (e) {
        throw new Error('解密失败，请检查密钥是否正确');
      }
    }

    if (!importData.records) {
      throw new Error('无效的同步数据格式');
    }

    let imported = 0;
    let skipped = 0;
    let conflicts = 0;

    for (const record of importData.records) {
      const existing = this.db.exec(`
        SELECT * FROM records WHERE content = ? AND type = ?
      `, [record.content, record.type]);

      if (existing.length > 0 && existing[0].values.length > 0) {
        if (skipExisting) {
          skipped++;
          continue;
        }

        if (conflictMode === 'newer') {
          const existingRecord = this._rowToRecord(existing[0].columns, existing[0].values[0]);
          const existingTime = new Date(existingRecord.updated_at);
          const incomingTime = new Date(record.updated_at);

          if (incomingTime > existingTime) {
            // 更新本地记录
            this.db.run(`
              UPDATE records SET 
                content = ?, summary = ?, tags = ?, favorite = ?,
                updated_at = ?, synced = 1
              WHERE id = ?
            `, [record.content, record.summary, record.tags, record.favorite, record.updated_at, existingRecord.id]);
            imported++;
          } else {
            conflicts++;
          }
        }
      } else {
        // 新增记录
        this.db.run(`
          INSERT INTO records (content, type, summary, tags, favorite, source_app, encrypted, created_at, updated_at, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `, [
          record.content,
          record.type,
          record.summary,
          record.tags,
          record.favorite,
          record.source_app,
          record.encrypted,
          record.created_at,
          record.updated_at
        ]);
        imported++;
      }
    }

    this._save();

    return {
      imported,
      skipped,
      conflicts,
      total: importData.records.length,
    };
  }

  /**
   * 标记记录为已同步
   */
  markAsSynced(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return 0;

    const placeholders = ids.map(() => '?').join(',');
    this.db.run(`UPDATE records SET synced = 1 WHERE id IN (${placeholders})`, ids);
    this._save();
    return ids.length;
  }

  /**
   * 获取同步统计
   */
  getSyncStats() {
    const total = this.getStats().total;
    const synced = this._getSyncedCount();
    const pending = total - synced;

    // 获取待同步记录的类型分布
    const byType = {};
    try {
      const result = this.db.exec(`
        SELECT type, COUNT(*) as count
        FROM records WHERE synced = 0
        GROUP BY type
      `);
      if (result.length > 0) {
        result[0].values.forEach(([type, count]) => {
          byType[type] = count;
        });
      }
    } catch (e) {}

    // 获取最早和最新的待同步记录时间
    let oldestPending = null;
    let newestPending = null;
    try {
      const timeResult = this.db.exec(`
        SELECT MIN(created_at), MAX(created_at) FROM records WHERE synced = 0
      `);
      if (timeResult.length > 0 && timeResult[0].values[0][0]) {
        oldestPending = timeResult[0].values[0][0];
        newestPending = timeResult[0].values[0][1];
      }
    } catch (e) {}

    return {
      total,
      synced,
      pending,
      syncProgress: total > 0 ? Math.round((synced / total) * 100) : 100,
      byType,
      oldestPending,
      newestPending,
    };
  }
}

  // 获取通知与声音设置
  getNotificationSettings() {
    try {
      const result = this.db.exec(`SELECT key, value FROM settings WHERE key LIKE 'notify_%'`);
      const settings = {
        enabled: false,
        soundEnabled: true,
        durationSeconds: 3,
        showPreview: true,
        minContentLength: 0,
        excludedApps: [],
      };
      if (result.length > 0) {
        for (const row of result[0].values) {
          const key = row[0];
          const value = row[1];
          if (key === 'notify_enabled') settings.enabled = value === 'true';
          else if (key === 'notify_sound_enabled') settings.soundEnabled = value === 'true';
          else if (key === 'notify_duration') settings.durationSeconds = parseInt(value) || 3;
          else if (key === 'notify_show_preview') settings.showPreview = value === 'true';
          else if (key === 'notify_min_length') settings.minContentLength = parseInt(value) || 0;
          else if (key === 'notify_excluded_apps') {
            try { settings.excludedApps = JSON.parse(value); } catch(e) {}
          }
        }
      }
      return settings;
    } catch (e) {
      console.error('获取通知设置失败:', e);
      return { enabled: false, soundEnabled: true, durationSeconds: 3, showPreview: true, minContentLength: 0, excludedApps: [] };
    }
  }

  // 保存通知与声音设置
  saveNotificationSettings(settings) {
    try {
      const updates = [
        ['notify_enabled', settings.enabled ? 'true' : 'false'],
        ['notify_sound_enabled', settings.soundEnabled ? 'true' : 'false'],
        ['notify_duration', String(settings.durationSeconds || 3)],
        ['notify_show_preview', settings.showPreview ? 'true' : 'false'],
        ['notify_min_length', String(settings.minContentLength || 0)],
        ['notify_excluded_apps', JSON.stringify(settings.excludedApps || [])],
      ];
      for (const [key, value] of updates) {
        this.db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [key, value]);
      }
      return true;
    } catch (e) {
      console.error('保存通知设置失败:', e);
      return false;
    }
  }
}


  // v0.31.0: 自动过期清理
  getAutoExpirySettings() {
    try {
      const get = (key, def) => {
        const row = this.db.exec(\SELECT value FROM settings WHERE key = ''\);
        return row.length > 0 && row[0].values.length > 0 ? row[0].values[0][0] : def;
      };
      return {
        enabled: get('expiry_enabled', 'false') === 'true',
        days: parseInt(get('expiry_days', '30')) || 30,
        keepFavorites: get('expiry_keep_favorites', 'true') === 'true',
      };
    } catch (e) {
      console.error('获取自动过期设置失败:', e);
      return { enabled: false, days: 30, keepFavorites: true };
    }
  }

  saveAutoExpirySettings(settings) {
    try {
      const updates = [
        ['expiry_enabled', settings.enabled ? 'true' : 'false'],
        ['expiry_days', String(settings.days || 30)],
        ['expiry_keep_favorites', settings.keepFavorites ? 'true' : 'false'],
      ];
      for (const [key, value] of updates) {
        this.db.run(\INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)\, [key, value]);
      }
      return true;
    } catch (e) {
      console.error('保存自动过期设置失败:', e);
      return false;
    }
  }

  cleanExpiredItems() {
    try {
      const settings = this.getAutoExpirySettings();
      if (!settings.enabled || settings.days <= 0) return 0;
      const cutoffDate = new Date(Date.now() - settings.days * 86400000).toISOString();
      let query;
      if (settings.keepFavorites) {
        query = \DELETE FROM clipboard_history WHERE created_at < '' AND favorite = 0\;
      } else {
        query = \DELETE FROM clipboard_history WHERE created_at < ''\;
      }
      this.db.run(query);
      const result = this.db.exec('SELECT changes() as count');
      return result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : 0;
    } catch (e) {
      console.error('清理过期条目失败:', e);
      return 0;
    }
  }

  getExpiryStats() {
    try {
      const settings = this.getAutoExpirySettings();
      if (!settings.enabled || settings.days <= 0) return { total: 0, expired: 0, protected: 0 };
      const cutoffDate = new Date(Date.now() - settings.days * 86400000).toISOString();
      const getTotal = () => {
        const r = this.db.exec(\SELECT COUNT(*) FROM clipboard_history WHERE created_at < ''\);
        return r.length > 0 && r[0].values.length > 0 ? r[0].values[0][0] : 0;
      };
      const getExpired = () => {
        const q = settings.keepFavorites
          ? \SELECT COUNT(*) FROM clipboard_history WHERE created_at < '' AND favorite = 0          : \SELECT COUNT(*) FROM clipboard_history WHERE created_at < ''\;
        const r = this.db.exec(q);
        return r.length > 0 && r[0].values.length > 0 ? r[0].values[0][0] : 0;
      };
      const getProtected = () => {
        const r = this.db.exec(\SELECT COUNT(*) FROM clipboard_history WHERE created_at < '' AND favorite = 1\);
        return r.length > 0 && r[0].values.length > 0 ? r[0].values[0][0] : 0;
      };
      return { total: getTotal(), expired: getExpired(), protected: getProtected() };
    } catch (e) {
      console.error('获取过期统计失败:', e);
      return { total: 0, expired: 0, protected: 0 };
    }
  }
\nmodule.exports = Database;

// ==================== v0.54.0: AI 设置管理 ====================
Database.prototype.getAISettings = function() {
  try {
    const result = this.db.exec(`SELECT key, value FROM ai_settings`);
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
  } catch (e) {
    return {};
  }
};

Database.prototype.saveAISettings = function(settings) {
  try {
    for (const [key, value] of Object.entries(settings)) {
      this.db.run(
        `INSERT OR REPLACE INTO ai_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
        [key, JSON.stringify(value)]
      );
    }
    this._save();
    // 同时更新 AI 模块配置
    const ai = require('./ai');
    ai.setConfig(settings);
    return true;
  } catch (e) {
    console.error('保存 AI 设置失败:', e);
    return false;
  }
};
  // ==================== v0.34.0: 导入导出 ====================
  exportAllRecords() {
    const records = this.db.exec(`
      SELECT id, type, content, favorite, tags, note, group_id, group_order,
             created_at, updated_at, source_app, language, ai_summary, ocr_text,
             encrypted, is_pinned
      FROM records
      ORDER BY created_at DESC
    `);
    if (!records.length) return [];

    const columns = records[0].columns;
    const values = records[0].values;
    return values.map(row => {
      const obj = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  }

  exportAllRecordsCSV() {
    const records = this.db.exec(`
      SELECT created_at, type, source_app, content
      FROM records
      WHERE type = 'text' OR type = 'code'
      ORDER BY created_at DESC
    `);
    if (!records.length) return '';

    const header = 'created_at,type,source_app,content\n';
    const rows = records[0].values.map(row => {
      const escaped = row.map(v => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      });
      return rows.length; // placeholder, actual row below
    });

    // Rebuild properly
    const lines = records[0].values.map(row => {
      const vals = row.map(v => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      });
      return vals.join(',');
    });
    return header + lines.join('\n');
  }

  importRecords(records, mode = 'merge') {
    // mode: 'merge' (skip duplicates) or 'replace' (delete all first)
    if (mode === 'replace') {
      this.db.exec('DELETE FROM records WHERE is_pinned = 0');
    }
    let imported = 0, skipped = 0;
    for (const r of records) {
      if (!r.content) continue;
      // Check duplicate
      const existing = this.db.exec(
        `SELECT id FROM records WHERE content = $c LIMIT 1`,
        { $c: r.content }
      );
      if (existing.length && existing[0].values.length) {
        skipped++;
        continue;
      }
      this.addRecord({
        type: r.type || 'text',
        content: r.content,
        favorite: r.favorite ? 1 : 0,
        tags: r.tags || '[]',
        note: r.note || '',
        groupId: r.group_id || null,
        sourceApp: r.source_app || '',
        language: r.language || '',
        aiSummary: r.ai_summary || '',
        encrypted: r.encrypted || 0,
      });
      imported++;
    }
    return { imported, skipped };
  }

}



// ==================== v0.55.0: MinHash 模糊去重 ====================
// MinHash 实现（纯 JS，无需外部依赖）

// 全局 MinHash 签名宽度
const MH_NUM_HASHES = 128;

// 生成单个 hash 值（murmurhash3 32-bit 风格）
function _murmurHash3_32(key, seed) {
  let h1 = seed;
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  const chars = Array.from(key);
  const len = chars.length;
  const nblocks = Math.floor(len / 4);

  for (let i = 0; i < nblocks; i++) {
    let k1 = (chars[i*4] & 0xff) |
            ((chars[i*4+1] & 0xff) << 8) |
            ((chars[i*4+2] & 0xff) << 16) |
            ((chars[i*4+3] & 0xff) << 24);
    k1 = Math.imul(k1, c1);
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = Math.imul(k1, c2);
    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >>> 19);
    h1 = Math.imul(h1, 5) + 0xe6546b64;
  }

  let k1 = 0;
  const tail = nblocks * 4;
  switch (len & 3) {
    case 3: k1 ^= (chars[tail+2] & 0xff) << 16;
    case 2: k1 ^= (chars[tail+1] & 0xff) << 8;
    case 1: k1 ^= (chars[tail] & 0xff);
      k1 = Math.imul(k1, c1);
      k1 = (k1 << 15) | (k1 >>> 17);
      k1 = Math.imul(k1, c2);
      h1 ^= k1;
  }

  h1 ^= len;
  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 0x85ebca6b);
  h1 ^= h1 >>> 13;
  h1 = Math.imul(h1, 0xc2b2ae35);
  h1 ^= h1 >>> 16;
  return h1 >>> 0;
}

// 字符串的 3-gram 集合
function _getNGrams(text, n = 3) {
  const grams = new Set();
  for (let i = 0; i <= text.length - n; i++) {
    grams.add(text.substring(i, i + n));
  }
  return grams;
}

// 计算一条文本的 MinHash 签名（MH_NUM_HASHES 维）
function _minhash(text) {
  const tokens = _getNGrams(text.toLowerCase());
  if (tokens.size === 0) return null;
  const sig = new Int32Array(MH_NUM_HASHES);
  sig.fill(0x7fffffff);
  let pairIdx = 0;
  for (let i = 0; i < MH_NUM_HASHES; i++) {
    for (const tok of tokens) {
      const h = _murmurHash3_32(tok + '#' + i, i + 1) >>> 0;
      if (h < sig[i]) sig[i] = h;
    }
    pairIdx++;
  }
  return sig;
}

// Jaccard 相似度（基于 MinHash 签名）
function _minhashJaccard(sig1, sig2) {
  if (!sig1 || !sig2 || sig1.length !== sig2.length) return 0;
  let match = 0;
  for (let i = 0; i < sig1.length; i++) {
    if (sig1[i] === sig2[i]) match++;
  }
  return match / sig1.length;
}

// 批量扫描并返回疑似模糊重复的配对
// 返回 [{idA, idB, contentA, contentB, jaccard}]
Database.prototype._findFuzzyDuplicates = function(threshold = 0.75, limit = 200) {
  const rows = this.db.exec(
    'SELECT id, content, type FROM records WHERE encrypted = 0 AND type IN (\"text\",\"code\") ORDER BY created_at DESC LIMIT ?',
    [limit]
  );
  if (!rows[0] || rows[0].values.length === 0) return [];

  const ids = rows[0].values.map(v => v[0]);
  const contents = rows[0].values.map(v => v[1]);
  const types = rows[0].values.map(v => v[2]);

  const sigs = contents.map(c => _minhash(c));
  const pairs = [];

  outer:
  for (let i = 0; i < sigs.length; i++) {
    if (!sigs[i]) continue;
    for (let j = i + 1; j < sigs.length; j++) {
      if (!sigs[j]) continue;
      const sim = _minhashJaccard(sigs[i], sigs[j]);
      if (sim >= threshold) {
        pairs.push({
          idA: ids[i], idB: ids[j],
          contentA: contents[i].substring(0, 150),
          contentB: contents[j].substring(0, 150),
          jaccard: Math.round(sim * 100),
        });
        if (pairs.length >= 50) break outer;
      }
    }
  }
  return pairs;
};

// 清理模糊重复项（保留最新，删除旧的）
// threshold: Jaccard 相似度阈值
Database.prototype.cleanupFuzzyDuplicates = function(threshold = 0.85) {
  const dups = this._findFuzzyDuplicates(threshold);
  let deletedCount = 0;
  const toDelete = new Set();

  for (const dup of dups) {
    // idA 是更新的（列表按时间倒序，i < j，所以 idB 是更旧的）
    toDelete.add(dup.idB);
  }

  for (const id of toDelete) {
    this.db.run(
      'DELETE FROM records WHERE id = ? AND favorite = 0 AND locked = 0',
      [id]
    );
    deletedCount++;
  }

  if (deletedCount > 0) this._save();
  return { deleted: deletedCount, found: dups.length };
};

// 获取模糊去重统计
Database.prototype.getFuzzyStats = function() {
  const all = this.db.exec(
    'SELECT COUNT(*) FROM records WHERE encrypted = 0 AND type IN (\"text\",\"code\")'
  )[0]?.values[0][0] || 0;
  const dups = this._findFuzzyDuplicates(0.75);
  return {
    total: all,
    fuzzyPairsFound: dups.length,
    samples: dups.slice(0, 3),
  };
};

// 改进版 findSimilar：多策略（编辑距离 + token 级别相似度）
Database.prototype.findSimilar = function(content, threshold = 0.8, limit = 5) {
  if (!content || content.length < 10) return [];

  const result = this.db.exec(
    SELECT id, content, created_at, favorite, type
    FROM records
    WHERE encrypted = 0 AND type = 'text'
    ORDER BY created_at DESC
    LIMIT 200
  );

  if (result.length === 0 || result[0].values.length === 0) return [];

  const textLower = content.toLowerCase();
  const contentTokens = new Set(textLower.split(/\s+/).filter(t => t.length > 2));

  const similar = [];
  for (const row of result[0].values) {
    const [id, recordContent, createdAt, favorite, type] = row;

    // 策略 1：编辑距离相似度（排除完全相同）
    const levSim = this._similarity(content, recordContent);
    if (levSim >= threshold && levSim < 0.9999) {
      similar.push({
        id,
        content: recordContent.substring(0, 200),
        similarity: Math.round(levSim * 100),
        strategy: 'edit',
        created_at: createdAt,
        favorite: favorite === 1,
        type,
      });
      continue;
    }

    // 策略 2：Token 级重叠（适合长文本有轻微差异的情况）
    const recTokens = new Set(recordContent.toLowerCase().split(/\s+/).filter(t => t.length > 2));
    let overlap = 0;
    for (const tok of contentTokens) {
      if (recTokens.has(tok)) overlap++;
    }
    const union = contentTokens.size + recTokens.size - overlap;
    const tokenSim = union > 0 ? overlap / union : 0;

    if (tokenSim >= threshold && tokenSim < 0.9999) {
      similar.push({
        id,
        content: recordContent.substring(0, 200),
        similarity: Math.round(tokenSim * 100),
        strategy: 'token',
        created_at: createdAt,
        favorite: favorite === 1,
        type,
      });
    }
  }

  return similar.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
};

// ==================== v0.61.0: 统计与可视化 ====================

Database.prototype.getStatsByType = function() {
  try {
    const result = this.db.exec(`
      SELECT type, COUNT(*) as count
      FROM records
      GROUP BY type
      ORDER BY count DESC
    `);
    if (!result.length || !result[0].values.length) return [];
    return result[0].values.map(row => ({ type: row[0], count: row[1] }));
  } catch (e) {
    console.error('getStatsByType error:', e);
    return [];
  }
};

Database.prototype.getStatsByApp = function(limit) {
  limit = limit || 10;
  try {
    const result = this.db.exec(`
      SELECT source_app, COUNT(*) as count
      FROM records
      WHERE source_app IS NOT NULL AND source_app != ''
      GROUP BY source_app
      ORDER BY count DESC
      LIMIT ${limit}
    `);
    if (!result.length || !result[0].values.length) return [];
    return result[0].values.map(row => ({ source_app: row[0], count: row[1] }));
  } catch (e) {
    console.error('getStatsByApp error:', e);
    return [];
  }
};

Database.prototype.getDailyStats = function(days) {
  days = days || 30;
  try {
    const result = this.db.exec(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as count,
        SUM(CASE WHEN type='text' THEN 1 ELSE 0 END) as text_count,
        SUM(CASE WHEN type='code' THEN 1 ELSE 0 END) as code_count,
        SUM(CASE WHEN type='file' THEN 1 ELSE 0 END) as file_count,
        SUM(CASE WHEN type='image' THEN 1 ELSE 0 END) as image_count
      FROM records
      WHERE created_at >= DATE('now', '-${days} days')
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);
    if (!result.length || !result[0].values.length) return [];
    return result[0].values.map(row => ({
      date: row[0],
      count: row[1],
      text_count: row[2],
      code_count: row[3],
      file_count: row[4],
      image_count: row[5]
    }));
  } catch (e) {
    console.error('getDailyStats error:', e);
    return [];
  }
};

Database.prototype.getHourlyStats = function() {
  try {
    const result = this.db.exec(`
      SELECT
        CAST(strftime('%H', created_at) AS INTEGER) as hour,
        COUNT(*) as count
      FROM records
      WHERE created_at >= DATE('now', '-30 days')
      GROUP BY hour
      ORDER BY hour
    `);
    const hourly = Array(24).fill(0);
    if (result.length > 0 && result[0].values.length > 0) {
      result[0].values.forEach(row => { hourly[row[0]] = row[1]; });
    }
    return hourly;
  } catch (e) {
    console.error('getHourlyStats error:', e);
    return Array(24).fill(0);
  }
};

// v0.62.0: Calendar heatmap data
Database.prototype.getCalendarData = function(days) {
  days = days || 365;
  try {
    const result = this.db.exec(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM records 
      WHERE created_at >= DATE('now', '-' || ${days} || ' days')
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);
    const dataMap = {};
    if (result.length && result[0].values.length) {
      result[0].values.forEach(row => { dataMap[row[0]] = row[1]; });
    }
    return { days: days, dataMap: dataMap };
  } catch (e) {
    console.error('getCalendarData error:', e);
    return { days: days, dataMap: {} };
  }
};

Database.prototype.getWeeklyTrend = function() {
  try {
    const result = this.db.exec(`
      SELECT
        strftime('%w', created_at) as weekday,
        COUNT(*) as count
      FROM records
      WHERE created_at >= DATE('now', '-30 days')
      GROUP BY weekday
      ORDER BY weekday
    `);
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    if (!result.length || !result[0].values.length) return [];
    return result[0].values.map(row => ({
      day: dayNames[parseInt(row[0])],
      count: row[1]
    }));
  } catch (e) {
    console.error('getWeeklyTrend error:', e);
    return [];
  }
};

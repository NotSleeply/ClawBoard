/**
 * ClawBoard - SQLite 数据库模块
 */

const path = require('path');
const fs = require('fs');

class Database {
  constructor(userDataPath) {
    this.dbPath = path.join(userDataPath, 'clawboard.db');
    this.dataPath = userDataPath;

    // 确保目录存在
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // 初始化数据库
    this._init();
  }

  _init() {
    const Database = require('better-sqlite3');
    this.db = new Database(this.dbPath);

    // 启用 WAL 模式提升性能
    this.db.pragma('journal_mode = WAL');

    // 创建表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL DEFAULT 'text',
        content TEXT NOT NULL,
        summary TEXT,
        source TEXT DEFAULT 'clipboard',
        favorite INTEGER DEFAULT 0,
        tags TEXT DEFAULT '[]',
        ai_summary TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_records_type ON records(type);
      CREATE INDEX IF NOT EXISTS idx_records_favorite ON records(favorite);
      CREATE INDEX IF NOT EXISTS idx_records_created ON records(created_at DESC);

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS records_fts USING fts5(
        content, summary, ai_summary, tags,
        content='records',
        content_rowid='id'
      );

      -- 触发器保持 FTS 同步
      CREATE TRIGGER IF NOT EXISTS records_ai AFTER INSERT ON records BEGIN
        INSERT INTO records_fts(rowid, content, summary, ai_summary, tags)
        VALUES (new.id, new.content, new.summary, new.ai_summary, new.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS records_ad AFTER DELETE ON records BEGIN
        INSERT INTO records_fts(records_fts, rowid, content, summary, ai_summary, tags)
        VALUES ('delete', old.id, old.content, old.summary, old.ai_summary, old.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS records_au AFTER UPDATE ON records BEGIN
        INSERT INTO records_fts(records_fts, rowid, content, summary, ai_summary, tags)
        VALUES ('delete', old.id, old.content, old.summary, old.ai_summary, old.tags);
        INSERT INTO records_fts(rowid, content, summary, ai_summary, tags)
        VALUES (new.id, new.content, new.summary, new.ai_summary, new.tags);
      END;
    `);
  }

  // 添加记录
  addRecord({ type, content, summary, source, tags = '[]', ai_summary = null }) {
    const stmt = this.db.prepare(`
      INSERT INTO records (type, content, summary, source, tags, ai_summary)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(type, content, summary, source, tags, ai_summary);
    return this.getRecord(result.lastInsertRowid);
  }

  // 获取记录
  getRecord(id) {
    const stmt = this.db.prepare('SELECT * FROM records WHERE id = ?');
    return stmt.get(id);
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
      sql += ' AND (content LIKE ? OR summary LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  // 搜索
  search(query, limit = 50) {
    if (!query) return [];

    // 优先使用 FTS 全文搜索
    try {
      const stmt = this.db.prepare(`
        SELECT records.* FROM records_fts
        JOIN records ON records.id = records_fts.rowid
        WHERE records_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `);
      return stmt.all(query, limit);
    } catch {
      // FTS 失败时降级到 LIKE
      const stmt = this.db.prepare(`
        SELECT * FROM records
        WHERE content LIKE ? OR summary LIKE ?
        ORDER BY created_at DESC
        LIMIT ?
      `);
      return stmt.all(`%${query}%`, `%${query}%`, limit);
    }
  }

  // 切换收藏状态
  toggleFavorite(id) {
    const stmt = this.db.prepare(`
      UPDATE records SET favorite = NOT favorite, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // 删除记录
  deleteRecord(id) {
    const stmt = this.db.prepare('DELETE FROM records WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // 清空历史
  clearHistory() {
    this.db.exec('DELETE FROM records WHERE favorite = 0');
    return true;
  }

  // 获取统计
  getStats() {
    const total = this.db.prepare('SELECT COUNT(*) as count FROM records').get().count;
    const text = this.db.prepare("SELECT COUNT(*) as count FROM records WHERE type = 'text'").get().count;
    const image = this.db.prepare("SELECT COUNT(*) as count FROM records WHERE type = 'image'").get().count;
    const file = this.db.prepare("SELECT COUNT(*) as count FROM records WHERE type = 'file'").get().count;
    const code = this.db.prepare("SELECT COUNT(*) as count FROM records WHERE type = 'code'").get().count;
    const favorite = this.db.prepare('SELECT COUNT(*) as count FROM records WHERE favorite = 1').get().count;
    return { total, text, image, file, code, favorite };
  }

  // 获取设置
  getSettings() {
    const rows = this.db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    rows.forEach(row => {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = row.value;
      }
    });
    return settings;
  }

  // 保存设置
  saveSettings(settings) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)
    `);
    const transaction = this.db.transaction((settings) => {
      for (const [key, value] of Object.entries(settings)) {
        stmt.run(key, JSON.stringify(value));
      }
    });
    transaction(settings);
    return true;
  }

  // 关闭数据库
  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = Database;

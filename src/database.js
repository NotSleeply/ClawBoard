/**
 * ClawBoard - SQLite 数据库模块 (sql.js 纯 JS 实现，无需编译)
 */

const path = require('path');
const fs = require('fs');

class Database {
  constructor(userDataPath) {
    this.dbPath = path.join(userDataPath, 'clawboard.db');
    this.dataPath = userDataPath;
    this.db = null;
    this._init();
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_type ON records(type)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_favorite ON records(favorite)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_created ON records(created_at DESC)`);

    this.db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);

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
  addRecord({ type, content, summary, source, tags = '[]', ai_summary = null }) {
    this.db.run(
      `INSERT INTO records (type, content, summary, source, tags, ai_summary) VALUES (?, ?, ?, ?, ?, ?)`,
      [type, content, summary, source, tags, ai_summary]
    );
    const id = this.db.exec("SELECT last_insert_rowid() as id")[0].values[0][0];
    this._save();
    return this.getRecord(id);
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
      sql += ' AND (content LIKE ? OR summary LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const result = this.db.exec(sql, params);
    if (result.length === 0) return [];
    return result[0].values.map(row => this._rowToRecord(result[0].columns, row));
  }

  // 搜索
  search(query, limit = 50) {
    if (!query) return [];
    const result = this.db.exec(
      `SELECT * FROM records WHERE content LIKE ? OR summary LIKE ? ORDER BY created_at DESC LIMIT ?`,
      [`%${query}%`, `%${query}%`, limit]
    );
    if (result.length === 0) return [];
    return result[0].values.map(row => this._rowToRecord(result[0].columns, row));
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
    return record;
  }
}

module.exports = Database;

/**
 * Snippets - 快捷片段模块 v0.48.0
 * 独立于剪贴板历史的常用文本片段管理
 * 支持分类、快捷键绑定、变量替换、搜索
 */

class Snippets {
  constructor(db) {
    this.db = db;
    this._ensureTable();
  }

  _ensureTable() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS snippets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT DEFAULT '默认',
        shortcut TEXT DEFAULT '',
        icon TEXT DEFAULT '📝',
        sort_order INTEGER DEFAULT 0,
        use_count INTEGER DEFAULT 0,
        last_used_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_snippets_category ON snippets(category)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_snippets_shortcut ON snippets(shortcut)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_snippets_sort ON snippets(sort_order)`);
    this._save();
  }

  _save() {
    if (this.db && this.db._save) {
      this.db._save();
    }
  }

  /**
   * 创建片段
   */
  create({ title, content, category = '默认', shortcut = '', icon = '📝' }) {
    if (!title || !content) {
      throw new Error('标题和内容不能为空');
    }

    // 检查快捷键是否已被占用
    if (shortcut) {
      const existing = this.db.exec(
        `SELECT id, title FROM snippets WHERE shortcut = ? AND id != ?`,
        [shortcut, 0]
      );
      if (existing[0] && existing[0].values.length > 0) {
        throw new Error(`快捷键 ${shortcut} 已被片段「${existing[0].values[0][1]}」占用`);
      }
    }

    // 获取当前最大排序值
    const maxOrder = this.db.exec(`SELECT COALESCE(MAX(sort_order), 0) + 1 FROM snippets`);
    const sortOrder = maxOrder[0] ? maxOrder[0].values[0][0] : 1;

    this.db.run(
      `INSERT INTO snippets (title, content, category, shortcut, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
      [title, content, category, shortcut, icon, sortOrder]
    );
    this._save();

    const result = this.db.exec(`SELECT last_insert_rowid() as id`);
    const id = result[0] ? result[0].values[0][0] : null;
    return this.getById(id);
  }

  /**
   * 更新片段
   */
  update(id, updates) {
    const allowed = ['title', 'content', 'category', 'shortcut', 'icon', 'sort_order'];
    const fields = [];
    const values = [];

    for (const key of allowed) {
      if (updates[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    }

    if (fields.length === 0) return null;

    // 检查快捷键冲突
    if (updates.shortcut) {
      const existing = this.db.exec(
        `SELECT id, title FROM snippets WHERE shortcut = ? AND id != ?`,
        [updates.shortcut, id]
      );
      if (existing[0] && existing[0].values.length > 0) {
        throw new Error(`快捷键 ${updates.shortcut} 已被片段「${existing[0].values[0][1]}」占用`);
      }
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    this.db.run(`UPDATE snippets SET ${fields.join(', ')} WHERE id = ?`, values);
    this._save();
    return this.getById(id);
  }

  /**
   * 删除片段
   */
  delete(id) {
    this.db.run(`DELETE FROM snippets WHERE id = ?`, [id]);
    this._save();
    return true;
  }

  /**
   * 获取单个片段
   */
  getById(id) {
    const result = this.db.exec(`SELECT * FROM snippets WHERE id = ?`, [id]);
    if (!result[0] || result[0].values.length === 0) return null;
    return this._rowToObject(result[0], 0);
  }

  /**
   * 获取所有片段
   */
  getAll(category = null) {
    let sql = `SELECT * FROM snippets`;
    const params = [];
    if (category) {
      sql += ` WHERE category = ?`;
      params.push(category);
    }
    sql += ` ORDER BY sort_order ASC, created_at DESC`;

    const result = this.db.exec(sql, params);
    if (!result[0]) return [];
    return result[0].values.map((_, i) => this._rowToObject(result[0], i));
  }

  /**
   * 搜索片段
   */
  search(query) {
    if (!query) return this.getAll();
    const sql = `SELECT * FROM snippets WHERE title LIKE ? OR content LIKE ? OR category LIKE ? ORDER BY use_count DESC, sort_order ASC`;
    const param = `%${query}%`;
    const result = this.db.exec(sql, [param, param, param]);
    if (!result[0]) return [];
    return result[0].values.map((_, i) => this._rowToObject(result[0], i));
  }

  /**
   * 获取所有分类
   */
  getCategories() {
    const result = this.db.exec(
      `SELECT category, COUNT(*) as count FROM snippets GROUP BY category ORDER BY category ASC`
    );
    if (!result[0]) return [];
    return result[0].values.map(row => ({ name: row[0], count: row[1] }));
  }

  /**
   * 通过快捷键获取片段
   */
  getByShortcut(shortcut) {
    if (!shortcut) return null;
    const result = this.db.exec(`SELECT * FROM snippets WHERE shortcut = ?`, [shortcut]);
    if (!result[0] || result[0].values.length === 0) return null;
    return this._rowToObject(result[0], 0);
  }

  /**
   * 使用片段（记录使用次数和时间）
   */
  use(id) {
    this.db.run(
      `UPDATE snippets SET use_count = use_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [id]
    );
    this._save();
    return this.getById(id);
  }

  /**
   * 渲染片段内容（支持变量替换）
   * 支持变量: {{date}}, {{time}}, {{datetime}}, {{clipboard}}, {{year}}, {{month}}, {{day}}
   */
  renderContent(content) {
    const now = new Date();
    const vars = {
      '{{date}}': now.toLocaleDateString('zh-CN'),
      '{{time}}': now.toLocaleTimeString('zh-CN'),
      '{{datetime}}': now.toLocaleString('zh-CN'),
      '{{year}}': String(now.getFullYear()),
      '{{month}}': String(now.getMonth() + 1).padStart(2, '0'),
      '{{day}}': String(now.getDate()).padStart(2, '0'),
      '{{clipboard}}': '', // 需要在 IPC 层动态获取
    };

    let rendered = content;
    for (const [key, value] of Object.entries(vars)) {
      rendered = rendered.split(key).join(value);
    }
    return rendered;
  }

  /**
   * 从剪贴板记录创建片段
   */
  createFromRecord(record, { title, category } = {}) {
    return this.create({
      title: title || record.content.substring(0, 50),
      content: record.content,
      category: category || '从剪贴板',
      icon: this._typeToIcon(record.type),
    });
  }

  /**
   * 批量导入片段
   */
  importSnippets(snippets) {
    const results = [];
    for (const s of snippets) {
      try {
        const created = this.create({
          title: s.title,
          content: s.content,
          category: s.category || '导入',
          shortcut: s.shortcut || '',
          icon: s.icon || '📝',
        });
        results.push({ success: true, snippet: created });
      } catch (e) {
        results.push({ success: false, error: e.message, title: s.title });
      }
    }
    return results;
  }

  /**
   * 导出所有片段
   */
  exportSnippets() {
    return this.getAll().map(s => ({
      title: s.title,
      content: s.content,
      category: s.category,
      shortcut: s.shortcut,
      icon: s.icon,
    }));
  }

  /**
   * 获取片段统计
   */
  getStats() {
    const total = this.db.exec(`SELECT COUNT(*) FROM snippets`);
    const categories = this.db.exec(`SELECT COUNT(DISTINCT category) FROM snippets`);
    const mostUsed = this.db.exec(
      `SELECT title, use_count FROM snippets ORDER BY use_count DESC LIMIT 5`
    );
    const recentUsed = this.db.exec(
      `SELECT title, last_used_at FROM snippets WHERE last_used_at IS NOT NULL ORDER BY last_used_at DESC LIMIT 5`
    );

    return {
      total: total[0] ? total[0].values[0][0] : 0,
      categories: categories[0] ? categories[0].values[0][0] : 0,
      mostUsed: mostUsed[0] ? mostUsed[0].values.map(r => ({ title: r[0], count: r[1] })) : [],
      recentUsed: recentUsed[0] ? recentUsed[0].values.map(r => ({ title: r[0], lastUsed: r[1] })) : [],
    };
  }

  /**
   * 重置排序
   */
  resetSortOrder() {
    const all = this.db.exec(`SELECT id FROM snippets ORDER BY created_at ASC`);
    if (all[0]) {
      all[0].values.forEach((row, i) => {
        this.db.run(`UPDATE snippets SET sort_order = ? WHERE id = ?`, [i + 1, row[0]]);
      });
      this._save();
    }
    return true;
  }

  _typeToIcon(type) {
    const icons = {
      text: '📝',
      code: '💻',
      image: '🖼️',
      file: '📂',
    };
    return icons[type] || '📝';
  }

  _rowToObject(result, index) {
    const columns = result.columns;
    const values = result.values[index];
    const obj = {};
    columns.forEach((col, i) => {
      obj[col] = values[i];
    });
    return obj;
  }
}

module.exports = Snippets;

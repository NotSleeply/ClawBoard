/**
 * ClawBoard - 剪贴板自动分类规则模块 (v0.65.0)
 * 
 * 根据预设规则自动将新捕获的剪贴板内容分类到指定分组，
 * 实现零干预的智能整理。
 */

class AutoCategorizer {
  constructor(db, log) {
    this.db = db;
    this.log = log;
    this._ensureTable();
    this._initDefaultRules();
  }

  // 确保规则表存在
  _ensureTable() {
    this.db.db.run(`
      CREATE TABLE IF NOT EXISTS auto_categorize_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        conditions TEXT NOT NULL DEFAULT '{}',
        target_group_id INTEGER,
        priority INTEGER DEFAULT 0,
        enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    this.db._save();
  }

  // 初始化预设规则（仅当表为空时）
  _initDefaultRules() {
    const result = this.db.db.exec('SELECT COUNT(*) FROM auto_categorize_rules');
    const count = result.length > 0 ? result[0].values[0][0] : 0;
    if (count > 0) return;

    const defaults = [
      {
        name: '代码片段自动归类',
        conditions: JSON.stringify({ type: 'code' }),
        priority: 10,
      },
      {
        name: '文件路径自动归类',
        conditions: JSON.stringify({ type: 'file' }),
        priority: 20,
      },
      {
        name: '网址链接自动归类',
        conditions: JSON.stringify({ regex: 'https?://[\\w\\-._~:/?#\\[\\]@!$&\'()*+,;=%]+' }),
        priority: 30,
      },
    ];

    for (const rule of defaults) {
      this.db.db.run(
        `INSERT INTO auto_categorize_rules (name, conditions, target_group_id, priority, enabled) VALUES (?, ?, NULL, ?, 0)`,
        [rule.name, rule.conditions, rule.priority]
      );
    }
    this.db._save();
  }

  // 获取所有规则
  getAllRules() {
    const result = this.db.db.exec(
      `SELECT r.*, g.name as group_name FROM auto_categorize_rules r LEFT JOIN groups g ON r.target_group_id = g.id ORDER BY r.priority ASC, r.created_at ASC`
    );
    if (result.length === 0 || result[0].values.length === 0) return [];

    return result[0].values.map(row => {
      const obj = {};
      result[0].columns.forEach((col, i) => obj[col] = row[i]);
      obj.conditions = JSON.parse(obj.conditions || '{}');
      obj.enabled = obj.enabled === 1;
      return obj;
    });
  }

  // 获取单条规则
  getRule(id) {
    const result = this.db.db.exec(
      `SELECT r.*, g.name as group_name FROM auto_categorize_rules r LEFT JOIN groups g ON r.target_group_id = g.id WHERE r.id = ?`,
      [id]
    );
    if (result.length === 0 || result[0].values.length === 0) return null;

    const obj = {};
    result[0].columns.forEach((col, i) => obj[col] = result[0].values[0][i]);
    obj.conditions = JSON.parse(obj.conditions || '{}');
    obj.enabled = obj.enabled === 1;
    return obj;
  }

  // 创建规则
  createRule({ name, conditions, target_group_id, priority = 0, enabled = true }) {
    const conditionsStr = typeof conditions === 'string' ? conditions : JSON.stringify(conditions);
    this.db.db.run(
      `INSERT INTO auto_categorize_rules (name, conditions, target_group_id, priority, enabled) VALUES (?, ?, ?, ?, ?)`,
      [name, conditionsStr, target_group_id || null, priority, enabled ? 1 : 0]
    );
    this.db._save();
    const id = this.db.db.exec("SELECT last_insert_rowid() as id")[0].values[0][0];
    return this.getRule(id);
  }

  // 更新规则
  updateRule(id, updates) {
    const fields = [];
    const params = [];

    if (updates.name !== undefined) { fields.push('name = ?'); params.push(updates.name); }
    if (updates.conditions !== undefined) {
      fields.push('conditions = ?');
      params.push(typeof updates.conditions === 'string' ? updates.conditions : JSON.stringify(updates.conditions));
    }
    if (updates.target_group_id !== undefined) { fields.push('target_group_id = ?'); params.push(updates.target_group_id); }
    if (updates.priority !== undefined) { fields.push('priority = ?'); params.push(updates.priority); }
    if (updates.enabled !== undefined) { fields.push('enabled = ?'); params.push(updates.enabled ? 1 : 0); }

    if (fields.length === 0) return this.getRule(id);

    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    this.db.db.run(`UPDATE auto_categorize_rules SET ${fields.join(', ')} WHERE id = ?`, params);
    this.db._save();
    return this.getRule(id);
  }

  // 删除规则
  deleteRule(id) {
    this.db.db.run('DELETE FROM auto_categorize_rules WHERE id = ?', [id]);
    this.db._save();
    return true;
  }

  // 切换规则启用状态
  toggleRule(id) {
    const rule = this.getRule(id);
    if (!rule) return null;
    return this.updateRule(id, { enabled: !rule.enabled });
  }

  // 重新排序规则
  reorderRules(orderedIds) {
    orderedIds.forEach((id, index) => {
      this.db.db.run('UPDATE auto_categorize_rules SET priority = ? WHERE id = ?', [index, id]);
    });
    this.db._save();
    return this.getAllRules();
  }

  /**
   * 对一条新记录执行自动分类
   * @param {Object} record - 剪贴板记录（含 type, content, source_app 等）
   * @returns {Object|null} 匹配结果 { ruleId, ruleName, groupId, groupName } 或 null
   */
  categorize(record) {
    const rules = this.getAllRules().filter(r => r.enabled && r.target_group_id);

    for (const rule of rules) {
      if (this._matchRule(record, rule.conditions)) {
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          groupId: rule.target_group_id,
          groupName: rule.group_name,
        };
      }
    }
    return null;
  }

  // 匹配单条规则的条件
  _matchRule(record, conditions) {
    // 条件是 AND 关系：所有条件必须同时满足

    // 类型匹配
    if (conditions.type) {
      const types = Array.isArray(conditions.type) ? conditions.type : [conditions.type];
      if (!types.includes(record.type)) return false;
    }

    // 来源应用匹配
    if (conditions.sourceApp) {
      const apps = Array.isArray(conditions.sourceApp) ? conditions.sourceApp : [conditions.sourceApp];
      const srcApp = (record.source_app || '').toLowerCase();
      if (!apps.some(a => srcApp.includes(a.toLowerCase()))) return false;
    }

    // 正则匹配
    if (conditions.regex) {
      try {
        const regexes = Array.isArray(conditions.regex) ? conditions.regex : [conditions.regex];
        const content = record.content || '';
        if (!regexes.some(r => new RegExp(r, 'i').test(content))) return false;
      } catch (e) {
        this.log.warn(`自动分类正则错误: ${e.message}`);
        return false;
      }
    }

    // 关键词匹配
    if (conditions.keywords) {
      const keywords = Array.isArray(conditions.keywords) ? conditions.keywords : [conditions.keywords];
      const content = (record.content || '').toLowerCase();
      if (!keywords.some(k => content.includes(k.toLowerCase()))) return false;
    }

    // 长度条件
    if (conditions.minLength) {
      if ((record.content || '').length < conditions.minLength) return false;
    }
    if (conditions.maxLength) {
      if ((record.content || '').length > conditions.maxLength) return false;
    }

    // 收藏状态
    if (conditions.favorite !== undefined) {
      if (record.favorite !== conditions.favorite) return false;
    }

    return true;
  }

  // 批量对现有记录执行分类（用于首次启用时整理历史记录）
  batchCategorize(options = {}) {
    const { dryRun = false, limit = 500 } = options;
    const rules = this.getAllRules().filter(r => r.enabled && r.target_group_id);

    if (rules.length === 0) return { total: 0, categorized: 0, results: [] };

    // 获取未分组的记录
    const result = this.db.db.exec(
      `SELECT * FROM records WHERE group_id IS NULL ORDER BY created_at DESC LIMIT ?`,
      [limit]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return { total: 0, categorized: 0, results: [] };
    }

    const records = result[0].values.map(row => {
      const obj = {};
      result[0].columns.forEach((col, i) => obj[col] = row[i]);
      return obj;
    });

    let categorized = 0;
    const results = [];

    for (const record of records) {
      const match = this.categorize(record);
      if (match) {
        if (!dryRun) {
          this.db.moveRecordToGroup(record.id, match.groupId);
        }
        categorized++;
        results.push({
          recordId: record.id,
          content: (record.content || '').substring(0, 50),
          ruleName: match.ruleName,
          groupName: match.groupName,
        });
      }
    }

    return { total: records.length, categorized, results };
  }

  // 获取规则统计
  getRuleStats() {
    const rules = this.getAllRules();
    const enabled = rules.filter(r => r.enabled).length;
    const withGroup = rules.filter(r => r.target_group_id).length;
    return {
      total: rules.length,
      enabled,
      disabled: rules.length - enabled,
      withGroup,
      withoutGroup: rules.length - withGroup,
    };
  }
}

module.exports = AutoCategorizer;

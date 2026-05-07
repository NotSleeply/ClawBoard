/**
 * RuleEngine - 剪贴板规则引擎 v0.73.0
 * 支持基于条件的自动处理规则（格式化、打标签、添加备注等）
 * 
 * 规则类型:
 * - condition: 触发条件（正则匹配、内容类型、来源应用等）
 * - action: 执行动作（格式化、打标签、添加备注、加密等）
 * - priority: 优先级（数值越大越先执行）
 */

class RuleEngine {
  constructor(db) {
    this.db = db;
    this.rules = [];
    this.executionLog = [];
    this.maxLogSize = 100;
    
    // 内置规则模板
    this.builtInTemplates = [
      {
        id: 'json-format',
        name: 'JSON 自动格式化',
        description: '检测到 JSON 内容时自动美化',
        enabled: true,
        priority: 100,
        condition: { type: 'regex', value: '^\\s*[{\\[]' },
        action: { type: 'format', format: 'json' }
      },
      {
        id: 'url-title',
        name: 'URL 标题提取',
        description: '复制 URL 时自动获取页面标题作为备注',
        enabled: true,
        priority: 80,
        condition: { type: 'regex', value: '^https?://' },
        action: { type: 'extract-title' }
      },
      {
        id: 'email-tag',
        name: '邮箱地址检测',
        description: '自动为邮箱地址添加 email 标签',
        enabled: true,
        priority: 50,
        condition: { type: 'regex', value: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}' },
        action: { type: 'add-tag', tag: 'email' }
      },
      {
        id: 'ip-tag',
        name: 'IP 地址检测',
        description: '自动为 IP 地址添加 network 标签',
        enabled: true,
        priority: 50,
        condition: { type: 'regex', value: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b' },
        action: { type: 'add-tag', tag: 'network' }
      },
      {
        id: 'phone-tag',
        name: '手机号检测',
        description: '自动为手机号添加 phone 标签',
        enabled: true,
        priority: 50,
        condition: { type: 'regex', value: '\\b1[3-9]\\d{9}\\b' },
        action: { type: 'add-tag', tag: 'phone' }
      },
      {
        id: 'code-tag',
        name: '代码片段检测',
        description: '检测代码特征自动添加 code 标签',
        enabled: true,
        priority: 40,
        condition: { type: 'code-detect' },
        action: { type: 'add-tag', tag: 'code' }
      },
      {
        id: 'sensitive-encrypt',
        name: '敏感信息自动加密',
        description: '检测到密钥/token 时自动加密存储',
        enabled: false,
        priority: 200,
        condition: { type: 'sensitive-detect' },
        action: { type: 'encrypt' }
      }
    ];
    
    this._loadRules();
  }

  /**
   * 从数据库加载规则
   */
  _loadRules() {
    try {
      if (!this.db) return;
      
      const result = this.db.db.exec('SELECT * FROM rules ORDER BY priority DESC');
      if (result.length > 0 && result[0].values) {
        this.rules = result[0].values.map(row => ({
          id: row[0],
          name: row[1],
          description: row[2],
          enabled: row[3] === 1,
          priority: row[4],
          condition: JSON.parse(row[5] || '{}'),
          action: JSON.parse(row[6] || '{}'),
          createdAt: row[7],
          lastExecutedAt: row[8],
          executionCount: row[9] || 0
        }));
      }
      
      // 首次运行时初始化内置模板
      if (this.rules.length === 0) {
        this._initBuiltInRules();
      }
    } catch (e) {
      console.error('RuleEngine _loadRules error:', e);
      this.rules = [];
    }
  }

  /**
   * 初始化内置规则模板
   */
  _initBuiltInRules() {
    for (const template of this.builtInTemplates) {
      this.addRule(template);
    }
  }

  /**
   * 初始化规则表（在 Database 类中调用）
   */
  static initTable(db) {
    db.run(`
      CREATE TABLE IF NOT EXISTS rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        enabled INTEGER DEFAULT 1,
        priority INTEGER DEFAULT 50,
        condition TEXT NOT NULL,
        action TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_executed_at DATETIME,
        execution_count INTEGER DEFAULT 0
      )
    `);
    
    db.run('CREATE INDEX IF NOT EXISTS idx_rules_priority ON rules(priority DESC)');
    db.run('CREATE INDEX IF NOT EXISTS idx_rules_enabled ON rules(enabled)');
  }

  /**
   * 添加新规则
   */
  addRule(rule) {
    try {
      const stmt = this.db.db.prepare(`
        INSERT INTO rules (name, description, enabled, priority, condition, action)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.bind([
        rule.name,
        rule.description || '',
        rule.enabled !== false ? 1 : 0,
        rule.priority || 50,
        JSON.stringify(rule.condition),
        JSON.stringify(rule.action)
      ]);
      stmt.run();
      
      const id = this.db.db.exec('SELECT last_insert_rowid()')[0].values[0][0];
      this._loadRules();
      return { success: true, id };
    } catch (e) {
      console.error('addRule error:', e);
      return { success: false, error: e.message };
    }
  }

  /**
   * 更新规则
   */
  updateRule(id, updates) {
    try {
      const fields = [];
      const values = [];
      
      ['name', 'description', 'enabled', 'priority', 'condition', 'action'].forEach(field => {
        if (updates[field] !== undefined) {
          fields.push(`${field} = ?`);
          values.push(
            field === 'condition' || field === 'action' 
              ? JSON.stringify(updates[field]) 
              : updates[field]
          );
        }
      });
      
      if (fields.length === 0) return { success: false, error: 'No fields to update' };
      
      values.push(id);
      this.db.db.run(`UPDATE rules SET ${fields.join(', ')} WHERE id = ?`, ...values);
      this._loadRules();
      return { success: true };
    } catch (e) {
      console.error('updateRule error:', e);
      return { success: false, error: e.message };
    }
  }

  /**
   * 删除规则
   */
  deleteRule(id) {
    try {
      this.db.db.run('DELETE FROM rules WHERE id = ?', id);
      this._loadRules();
      return { success: true };
    } catch (e) {
      console.error('deleteRule error:', e);
      return { success: false, error: e.message };
    }
  }

  /**
   * 获取所有规则
   */
  getRules() {
    return this.rules;
  }

  /**
   * 获取内置模板
   */
  getBuiltInTemplates() {
    return this.builtInTemplates;
  }

  /**
   * 重置为默认规则
   */
  resetToDefaults() {
    try {
      this.db.db.run('DELETE FROM rules');
      this._initBuiltInRules();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * 处理剪贴板内容 - 核心方法
   * @param {object} record - 剪贴板记录对象
   * @returns {object} 处理后的记录及执行日志
   */
  process(record) {
    const result = {
      record: { ...record },
      appliedRules: [],
      modified: false
    };

    // 按优先级排序的启用规则
    const enabledRules = this.rules
      .filter(r => r.enabled)
      .sort((a, b) => b.priority - a.priority);

    for (const rule of enabledRules) {
      if (this._matchCondition(record, rule.condition)) {
        const actionResult = this._executeAction(result.record, rule.action);
        if (actionResult.modified) {
          result.record = actionResult.record;
          result.appliedRules.push({
            ruleId: rule.id,
            ruleName: rule.name,
            action: rule.action.type,
            details: actionResult.details
          });
          result.modified = true;
        }
        
        // 更新执行计数
        this._updateExecutionStats(rule.id);
      }
    }

    // 记录执行日志
    if (result.appliedRules.length > 0) {
      this._logExecution(result);
    }

    return result;
  }

  /**
   * 匹配条件
   */
  _matchCondition(record, condition) {
    try {
      switch (condition.type) {
        case 'regex': {
          const regex = new RegExp(condition.value, condition.flags || '');
          return regex.test(record.content || '');
        }
        case 'content-type':
          return record.type === condition.value;
        case 'source-app': {
          const pattern = new RegExp(condition.value, 'i');
          return pattern.test(record.sourceApp || '');
        }
        case 'length-range': {
          const len = (record.content || '').length;
          return len >= (condition.min || 0) && len <= (condition.max || Infinity);
        }
        case 'code-detect':
          return this._detectCode(record.content || '');
        case 'sensitive-detect':
          return this._detectSensitive(record.content || '');
        default:
          return false;
      }
    } catch (e) {
      console.error('_matchCondition error:', e);
      return false;
    }
  }

  /**
   * 执行动作
   */
  _executeAction(record, action) {
    const result = { record: { ...record }, modified: false, details: '' };

    try {
      switch (action.type) {
        case 'format': {
          if (action.format === 'json') {
            try {
              const parsed = JSON.parse(record.content);
              result.record.content = JSON.stringify(parsed, null, 2);
              result.modified = true;
              result.details = 'JSON 格式化完成';
            } catch (e) {
              // 解析失败，不处理
            }
          }
          break;
        }
        case 'add-tag': {
          const tags = JSON.parse(record.tags || '[]');
          if (!tags.includes(action.tag)) {
            tags.push(action.tag);
            result.record.tags = JSON.stringify(tags);
            result.modified = true;
            result.details = `添加标签: ${action.tag}`;
          }
          break;
        }
        case 'set-note': {
          result.record.note = action.note || '';
          result.modified = true;
          result.details = `设置备注: ${action.note}`;
          break;
        }
        case 'encrypt': {
          result.record.encrypted = 1;
          result.modified = true;
          result.details = '已标记为加密';
          break;
        }
        case 'extract-title': {
          // URL 标题提取需要在主进程中异步执行
          // 这里只标记需要提取
          result.record._needsTitleExtract = true;
          result.details = '标记需要提取标题';
          break;
        }
        default:
          break;
      }
    } catch (e) {
      console.error('_executeAction error:', e);
    }

    return result;
  }

  /**
   * 检测代码特征
   */
  _detectCode(content) {
    const codePatterns = [
      /function\s*\(/,
      /class\s+\w+/,
      /import\s+.*from/,
      /const\s+\w+\s*=/,
      /def\s+\w+\(/,
      /#\s*include/,
      /<\w+>.*<\/\w+>/,
      /\{\s*\n\s*"\w+":/
    ];
    
    return codePatterns.some(p => p.test(content));
  }

  /**
   * 检测敏感信息
   */
  _detectSensitive(content) {
    const sensitivePatterns = [
      /api[_-]?key\s*[:=]\s*["']?\w{16,}/i,
      /secret\s*[:=]\s*["']?\w{16,}/i,
      /token\s*[:=]\s*["']?\w{16,}/i,
      /password\s*[:=]\s*["']?\w+/i,
      /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/
    ];
    
    return sensitivePatterns.some(p => p.test(content));
  }

  /**
   * 更新执行统计
   */
  _updateExecutionStats(ruleId) {
    try {
      this.db.db.run(`
        UPDATE rules 
        SET execution_count = execution_count + 1,
            last_executed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, ruleId);
    } catch (e) {
      console.error('_updateExecutionStats error:', e);
    }
  }

  /**
   * 记录执行日志
   */
  _logExecution(result) {
    this.executionLog.unshift({
      timestamp: new Date().toISOString(),
      appliedRules: result.appliedRules,
      recordId: result.record.id
    });
    
    // 限制日志大小
    if (this.executionLog.length > this.maxLogSize) {
      this.executionLog = this.executionLog.slice(0, this.maxLogSize);
    }
  }

  /**
   * 获取执行日志
   */
  getExecutionLog(limit = 20) {
    return this.executionLog.slice(0, limit);
  }

  /**
   * 导出规则配置
   */
  exportRules() {
    return JSON.stringify(this.rules, null, 2);
  }

  /**
   * 导入规则配置
   */
  importRules(jsonStr) {
    try {
      const imported = JSON.parse(jsonStr);
      if (!Array.isArray(imported)) {
        return { success: false, error: 'Invalid format' };
      }
      
      // 清空现有规则
      this.db.db.run('DELETE FROM rules');
      
      // 导入新规则
      let importedCount = 0;
      for (const rule of imported) {
        const result = this.addRule(rule);
        if (result.success) importedCount++;
      }
      
      return { success: true, imported: importedCount };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

module.exports = RuleEngine;

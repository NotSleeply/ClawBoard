/**
 * ClawBoard - 快捷短语/模板管理器
 * v0.76.0: 借鉴 CopyQ 的 Snippets 功能
 *
 * 功能:
 * - 创建常用文本片段
 * - 支持变量替换 {{date}}, {{time}}, {{clipboard}} 等
 * - 分组管理 (工作/个人/开发)
 * - 快捷键绑定
 * - 使用统计
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SnippetsManager {
  constructor(userDataPath, database) {
    this.userDataPath = userDataPath;
    this.db = database;
    this.snippetsFile = path.join(userDataPath, 'snippets.json');
    this.snippets = new Map();
    this.usageStats = new Map(); // 使用统计

    this._init();
  }

  /**
   * 初始化加载
   * @private
   */
  _init() {
    this._loadSnippets();

    // 创建默认分组和示例
    if (this.snippets.size === 0) {
      this._createDefaultSnippets();
    }
  }

  /**
   * 从文件加载短语
   * @private
   */
  _loadSnippets() {
    try {
      if (fs.existsSync(this.snippetsFile)) {
        const data = JSON.parse(fs.readFileSync(this.snippetsFile, 'utf8'));

        if (data.snippets && Array.isArray(data.snippets)) {
          data.snippets.forEach(snippet => {
            this.snippets.set(snippet.id, snippet);
          });
        }

        if (data.usageStats) {
          this.usageStats = new Map(Object.entries(data.usageStats));
        }

        console.log(`[Snippets] 已加载 ${this.snippets.size} 个短语`);
      }
    } catch (err) {
      console.error('[Snippets] 加载失败:', err);
      this.snippets = new Map();
      this.usageStats = new Map();
    }
  }

  /**
   * 保存到文件
   * @private
   */
  _saveSnippets() {
    try {
      const data = {
        snippets: Array.from(this.snippets.values()),
        usageStats: Object.fromEntries(this.usageStats),
        updatedAt: new Date().toISOString(),
        version: '1.0'
      };

      fs.writeFileSync(
        this.snippetsFile,
        JSON.stringify(data, null, 2),
        { mode: 0o600 } // 仅所有者可读写
      );
    } catch (err) {
      console.error('[Snippets] 保存失败:', err);
    }
  }

  /**
   * 创建默认示例短语
   * @private
   */
  _createDefaultSnippets() {
    const defaults = [
      {
        group: '通用',
        name: '当前日期时间',
        content: '{{YYYY}}-{{MM}}-{{DD}} {{HH}}:{{mm}}:{{ss}}',
        description: '插入当前日期和时间',
        icon: '📅',
        tags: ['时间', '日期', '常用']
      },
      {
        group: '通用',
        name: '邮箱签名',
        content: '--\n{{user_name}}\n{{user_email}}\n{{user_phone}}',
        description: '标准邮件签名模板',
        icon: '✉️',
        tags: ['邮件', '签名']
      },
      {
        group: '开发',
        name: '代码注释头',
        content:
          '/**\n * {{description}}\n * @author {{author}}\n * @date {{YYYY}}-{{MM}}-{{DD}}\n */',
        description: 'JSDoc 风格的函数注释',
        icon: '💻',
        tags: ['代码', '注释', 'JavaScript']
      },
      {
        group: '开发',
        name: 'TODO 注释',
        content:
          '// TODO: {{clipboard}}\n// 创建时间: {{YYYY-MM-DD HH:mm:ss}}\n// 优先级: [高/中/低]',
        description: '创建待办事项注释',
        icon: '📝',
        tags: ['代码', 'TODO', '任务']
      },
      {
        group: '办公',
        name: '会议纪要模板',
        content:
          '# 会议纪要\n\n**主题**: {{meeting_topic}}\n**日期**: {{YYYY-MM-DD}}\n**参会人员**: {{attendees}}\n\n## 议程\n1. \n2. \n3. \n\n## 决议\n- \n- \n\n## 待办事项\n- [ ] \n- [ ] ',
        description: '标准会议记录格式',
        icon: '📋',
        tags: ['会议', '办公', '模板']
      },
      {
        group: '办公',
        name: '周报模板',
        content:
          '# 工作周报\n\n**姓名**: {{name}}\n**部门**: {{department}}\n**周期**: {{week_range}}\n\n## 本周完成\n1. \n2. \n3. \n\n## 进行中工作\n- \n- \n\n## 下周计划\n1. \n2. \n\n## 问题与风险\n- \n- ',
        description: '周工作报告模板',
        icon: '📊',
        tags: ['报告', '办公', '周报']
      }
    ];

    defaults.forEach(item => {
      this.createSnippet({
        ...item,
        isDefault: true
      });
    });

    console.log(`[Snippets] 已创建 ${defaults.length} 个默认短语`);
  }

  // ==================== CRUD 操作 ====================

  /**
   * 创建新短语
   * @param {Object} data - 短语数据
   * @returns {Object} - 创建的短语
   */
  createSnippet(data) {
    const id = crypto.randomBytes(8).toString('hex');

    const snippet = {
      id,
      name: data.name || '未命名短语',
      content: data.content || '',
      description: data.description || '',
      group: data.group || '未分组',
      icon: data.icon || '📌',
      tags: data.tags || [],
      shortcut: data.shortcut || '',
      variables: this._extractVariables(data.content || ''),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      useCount: 0,
      lastUsedAt: null,
      isPinned: false,
      isDefault: data.isDefault || false
    };

    this.snippets.set(id, snippet);
    this._saveSnippets();

    return snippet;
  }

  /**
   * 更新短语
   * @param {string} id - 短语ID
   * @param {Object} updates - 更新内容
   * @returns {Object|null}
   */
  updateSnippet(id, updates) {
    const snippet = this.snippets.get(id);
    if (!snippet) return null;

    const updated = {
      ...snippet,
      ...updates,
      id, // 防止修改ID
      variables: updates.content ? this._extractVariables(updates.content) : snippet.variables,
      updatedAt: new Date().toISOString()
    };

    this.snippets.set(id, updated);
    this._saveSnippets();

    return updated;
  }

  /**
   * 删除短语
   * @param {string} id - 短语ID
   * @returns {boolean}
   */
  deleteSnippet(id) {
    const deleted = this.snippets.delete(id);
    if (deleted) {
      this._saveSnippets();
    }
    return deleted;
  }

  /**
   * 获取短语
   * @param {string} id - 短语ID
   * @returns {Object|null}
   */
  getSnippet(id) {
    return this.snippets.get(id) || null;
  }

  /**
   * 获取所有短语
   * @param {Object} options - 过滤选项
   * @returns {Array}
   */
  getAllSnippets(options = {}) {
    let snippets = Array.from(this.snippets.values());

    // 按分组过滤
    if (options.group) {
      snippets = snippets.filter(s => s.group === options.group);
    }

    // 搜索关键词
    if (options.search) {
      const keyword = options.search.toLowerCase();
      snippets = snippets.filter(
        s =>
          s.name.toLowerCase().includes(keyword) ||
          s.content.toLowerCase().includes(keyword) ||
          s.tags.some(t => t.toLowerCase().includes(keyword))
      );
    }

    // 按标签过滤
    if (options.tag) {
      snippets = snippets.filter(s => s.tags.includes(options.tag));
    }

    // 排序
    const sortBy = options.sortBy || 'updatedAt';
    const sortOrder = options.sortOrder || 'desc';
    snippets.sort((a, b) => {
      const valA = a[sortBy] || '';
      const valB = b[sortBy] || '';
      return sortOrder === 'desc' ? (valB > valA ? 1 : -1) : valA > valB ? 1 : -1;
    });

    return snippets;
  }

  // ==================== 变量处理 ====================

  /**
   * 提取模板中的变量
   * @param {string} content - 模板内容
   * @returns {Array<string>}
   * @private
   */
  _extractVariables(content) {
    const matches = content.match(/\{\{([^}]+)\}\}/g);
    return matches ? [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))] : [];
  }

  /**
   * 渲染短语 (替换变量)
   * @param {string} id - 短语ID
   * @param {Object} context - 变量上下文
   * @returns {{ success: boolean, text: string, variables: Object }}
   */
  renderSnippet(id, context = {}) {
    const snippet = this.snippets.get(id);
    if (!snippet) {
      return {
        success: false,
        text: '',
        error: `短语不存在: ${id}`
      };
    }

    try {
      let text = snippet.content;

      // 内置变量
      const now = new Date();
      const builtInVars = {
        // 日期
        YYYY: now.getFullYear(),
        MM: String(now.getMonth() + 1).padStart(2, '0'),
        DD: String(now.getDate()).padStart(2, '0'),
        YYYYMMDD: `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`,
        'YYYY-MM-DD': `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,

        // 时间
        HH: String(now.getHours()).padStart(2, '0'),
        mm: String(now.getMinutes()).padStart(2, '0'),
        ss: String(now.getSeconds()).padStart(2, '0'),
        'HH:mm:ss': `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`,

        // 用户信息 (从配置读取)
        user_name: context.user_name || '',
        user_email: context.user_email || '',
        user_phone: context.user_phone || '',

        // 其他
        clipboard: context.clipboard || '',
        newline: '\n',
        tab: '\t',

        // 自定义变量 (用户传入)
        ...context
      };

      // 替换变量
      for (const [key, value] of Object.entries(builtInVars)) {
        text = text.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      }

      // 记录使用统计
      this._recordUsage(id);

      return {
        success: true,
        text,
        snippetId: id,
        snippetName: snippet.name,
        renderedAt: new Date().toISOString()
      };
    } catch (err) {
      console.error('[Snippets] 渲染失败:', err);
      return {
        success: false,
        text: snippet.content,
        error: `渲染错误: ${err.message}`
      };
    }
  }

  /**
   * 记录使用次数
   * @param {string} id - 短语ID
   * @private
   */
  _recordUsage(id) {
    const snippet = this.snippets.get(id);
    if (snippet) {
      snippet.useCount = (snippet.useCount || 0) + 1;
      snippet.lastUsedAt = new Date().toISOString();
      this._saveSnippets();
    }
  }

  // ==================== 分组管理 ====================

  /**
   * 获取所有分组
   * @returns {Array<{name: string, count: number}>}
   */
  getGroups() {
    const groups = {};

    for (const snippet of this.snippets.values()) {
      const group = snippet.group || '未分组';
      if (!groups[group]) {
        groups[group] = { name: group, count: 0 };
      }
      groups[group].count++;
    }

    return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
  }

  // ==================== 统计信息 ====================

  /**
   * 获取使用统计
   * @returns {Object}
   */
  getStats() {
    const totalSnippets = this.snippets.size;
    const totalUsage = Array.from(this.snippets.values()).reduce(
      (sum, s) => sum + (s.useCount || 0),
      0
    );

    const topUsed = Array.from(this.snippets.values())
      .sort((a, b) => (b.useCount || 0) - (a.useCount || 0))
      .slice(0, 10);

    const recentlyUsed = Array.from(this.snippets.values())
      .filter(s => s.lastUsedAt)
      .sort((a, b) => new Date(b.lastUsedAt) - new Date(a.lastUsedAt))
      .slice(0, 5);

    return {
      totalSnippets,
      totalUsage,
      averageUsage: totalSnippets > 0 ? Math.round((totalUsage / totalSnippets) * 10) / 10 : 0,
      groups: this.getGroups(),
      topUsed: topUsed.map(s => ({
        id: s.id,
        name: s.name,
        useCount: s.useCount,
        lastUsedAt: s.lastUsedAt
      })),
      recentlyUsed: recentlyUsed.map(s => ({
        id: s.id,
        name: s.name,
        lastUsedAt: s.lastUsedAt
      }))
    };
  }

  // ==================== 导入导出 ====================

  /**
   * 导出所有短语为 JSON
   * @returns {string}
   */
  exportJSON() {
    const data = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      snippets: Array.from(this.snippets.values()),
      stats: this.getStats()
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * 从 JSON 导入短语
   * @param {string} jsonStr - JSON 字符串
   * @returns {{ imported: number, skipped: number, errors: Array }}
   */
  importJSON(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      let imported = 0;
      let skipped = 0;
      const errors = [];

      if (data.snippets && Array.isArray(data.snippets)) {
        for (const snippet of data.snippets) {
          try {
            // 生成新ID避免冲突
            const newId = crypto.randomBytes(8).toString('hex');

            this.snippets.set(newId, {
              ...snippet,
              id: newId,
              createdAt: new Date().toISOString(),
              useCount: 0,
              lastUsedAt: null
            });

            imported++;
          } catch (e) {
            errors.push({ snippet: snippet.name || 'unknown', error: e.message });
            skipped++;
          }
        }

        this._saveSnippets();
      }

      return { imported, skipped, errors };
    } catch (e) {
      return { imported: 0, skipped: 0, errors: [{ error: e.message }] };
    }
  }
}

module.exports = SnippetsManager;

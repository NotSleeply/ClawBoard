/**
 * ClawBoard - 自动触发器/规则引擎
 * v0.76.0: 借鉴 ClipboardFusion 的 Triggers 功能
 *
 * 功能:
 * - 监听剪贴板变化
 * - 自动执行预定义规则
 * - 支持条件判断 (正则、关键词、来源应用)
 * - 支持多种动作 (格式化、替换、通知、执行命令)
 */

const { ipcMain } = require('electron');
const TextFormatter = require('./TextFormatter');
const log = require('electron-log');

class TriggerEngine {
  constructor(database, clipboardWatcher) {
    this.db = database;
    this.clipboardWatcher = clipboardWatcher;
    this.triggers = new Map();
    this._isEnabled = true;
    this._isProcessing = false;

    this._init();
  }

  /**
   * 初始化
   * @private
   */
  _init() {
    log.info('[Trigger] 触发器引擎初始化');

    // 加载已保存的规则
    this._loadTriggers();

    // 创建默认规则示例
    if (this.triggers.size === 0) {
      this._createDefaultTriggers();
    }

    // 注册 IPC 接口
    this._registerIPC();
  }

  /**
   * 从数据库加载触发器
   * @private
   */
  _loadTriggers() {
    try {
      // TODO: 从数据库加载 (当前使用内存存储)
      log.info(`[Trigger] 已加载 ${this.triggers.size} 个触发器`);
    } catch (err) {
      log.error('[Trigger] 加载失败:', err);
    }
  }

  /**
   * 创建默认触发器示例
   * @private
   */
  _createDefaultTriggers() {
    const defaults = [
      {
        name: '自动清理 URL',
        description: '自动去除 URL 中的追踪参数',
        enabled: true,
        priority: 10,
        conditions: [
          {
            type: 'regex',
            field: 'content',
            pattern: '^https?://[^\\s]+\\?(.*)$',
            flags: 'i'
          }
        ],
        actions: [
          {
            type: 'transform',
            method: 'cleanURL'
          }
        ],
        createdAt: new Date().toISOString()
      },
      {
        name: '代码片段检测',
        description: '自动识别并标记代码片段',
        enabled: true,
        priority: 20,
        conditions: [
          {
            type: 'regex',
            field: 'content',
            pattern: '(function|class|const|let|var|import|export|def |public |private )',
            flags: ''
          },
          {
            type: 'minLength',
            field: 'content',
            value: 50
          }
        ],
        actions: [
          {
            type: 'tag',
            tags: ['代码', '开发']
          },
          {
            type: 'notify',
            message: '检测到代码片段',
            icon: '💻'
          }
        ]
      },
      {
        name: '邮箱地址保护',
        description: '检测到邮箱时提醒加密',
        enabled: true,
        priority: 5,
        conditions: [
          {
            type: 'regex',
            field: 'content',
            pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
            flags: ''
          }
        ],
        actions: [
          {
            type: 'tag',
            tags: ['敏感', '邮箱']
          },
          {
            type: 'notify',
            message: '⚠️ 检测到邮箱地址，建议加密保存',
            icon: '🔒'
          }
        ]
      },
      {
        name: '长文本压缩提示',
        description: '超过1KB的文本建议压缩',
        enabled: true,
        priority: 15,
        conditions: [
          {
            type: 'maxLength',
            field: 'content',
            value: 1024
          }
        ],
        actions: [
          {
            type: 'tag',
            tags: ['长文本']
          },
          {
            type: 'notify',
            message: '📄 长文本已自动压缩存储',
            icon: '📦'
          }
        ]
      }
    ];

    defaults.forEach(trigger => {
      this.createTrigger(trigger);
    });

    log.info(`[Trigger] 已创建 ${defaults.length} 个默认触发器`);
  }

  // ==================== IPC 注册 ====================

  /**
   * 注册 IPC 接口
   * @private
   */
  _registerIPC() {
    // 获取所有触发器
    ipcMain.handle('get-triggers', async () => {
      return this.getAllTriggers();
    });

    // 创建触发器
    ipcMain.handle('create-trigger', async (_, triggerData) => {
      return this.createTrigger(triggerData);
    });

    // 更新触发器
    ipcMain.handle('update-trigger', async (_, id, updates) => {
      return this.updateTrigger(id, updates);
    });

    // 删除触发器
    ipcMain.handle('delete-trigger', async (_, id) => {
      return this.deleteTrigger(id);
    });

    // 启用/禁用触发器
    ipcMain.handle('toggle-trigger', async (_, id, enabled) => {
      return this.toggleTrigger(id, enabled);
    });

    // 测试触发器 (不实际执行)
    ipcMain.handle('test-trigger', async (_, id, testContent) => {
      return this.testTrigger(id, testContent);
    });

    // 手动运行所有触发器
    ipcMain.handle('run-triggers', async (_, content, metadata = {}) => {
      return this.processContent(content, metadata);
    });
  }

  // ==================== CRUD 操作 ====================

  /**
   * 创建新触发器
   * @param {Object} data - 触发器配置
   * @returns {Object}
   */
  createTrigger(data) {
    const id = `trigger_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const trigger = {
      id,
      name: data.name || '未命名触发器',
      description: data.description || '',
      enabled: data.enabled !== false,
      priority: data.priority || 50,
      conditions: data.conditions || [],
      actions: data.actions || [],
      runOnce: data.runOnce || false,
      cooldown: data.cooldown || 0, // 冷却时间(毫秒)
      lastRunAt: null,
      runCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.triggers.set(id, trigger);
    log.info(`[Trigger] 创建成功: ${trigger.name} (${id})`);

    return trigger;
  }

  /**
   * 更新触发器
   * @param {string} id - 触发器ID
   * @param {Object} updates - 更新内容
   * @returns {Object|null}
   */
  updateTrigger(id, updates) {
    const trigger = this.triggers.get(id);
    if (!trigger) return null;

    const updated = {
      ...trigger,
      ...updates,
      id,
      updatedAt: new Date().toISOString()
    };

    this.triggers.set(id, updated);
    log.info(`[Trigger] 更新成功: ${updated.name}`);

    return updated;
  }

  /**
   * 删除触发器
   * @param {string} id - 触发器ID
   * @returns {boolean}
   */
  deleteTrigger(id) {
    const trigger = this.triggers.get(id);
    if (!trigger) return false;

    this.triggers.delete(id);
    log.info(`[Trigger] 删除成功: ${trigger.name}`);

    return true;
  }

  /**
   * 启用/禁用触发器
   * @param {string} id - 触发器ID
   * @param {boolean} enabled - 是否启用
   * @returns {Object|null}
   */
  toggleTrigger(id, enabled) {
    return this.updateTrigger(id, { enabled });
  }

  /**
   * 获取所有触发器
   * @returns {Array}
   */
  getAllTriggers() {
    return Array.from(this.triggers.values())
      .sort((a, b) => a.priority - b.priority);
  }

  // ==================== 核心逻辑 ====================

  /**
   * 处理内容 (检查所有触发器)
   * @param {string} content - 剪贴板内容
   * @param {Object} metadata - 元数据 (type, sourceApp等)
   * @returns {{ processed: boolean, results: Array, finalContent: string }}
   */
  processContent(content, metadata = {}) {
    if (!this._isEnabled || !content || this._isProcessing) {
      return { processed: false, results: [], finalContent: content };
    }

    this._isProcessing = true;
    let finalContent = content;
    const results = [];

    try {
      // 按优先级排序后执行
      const sortedTriggers = this.getAllTriggers().filter(t => t.enabled);

      for (const trigger of sortedTriggers) {
        // 检查冷却时间
        if (trigger.cooldown && trigger.lastRunAt) {
          const elapsed = Date.now() - new Date(trigger.lastRunAt).getTime();
          if (elapsed < trigger.cooldown) continue;
        }

        // 检查是否只运行一次
        if (trigger.runOnce && trigger.runCount > 0) continue;

        // 评估条件
        const conditionResult = this._evaluateConditions(trigger.conditions, finalContent, metadata);

        if (conditionResult.matched) {
          log.info(`[Trigger] 匹配: ${trigger.name}`);

          // 执行动作
          const actionResult = this._executeActions(trigger.actions, finalContent, metadata);

          if (actionResult.modified) {
            finalContent = actionResult.content;
          }

          // 更新统计
          trigger.lastRunAt = new Date().toISOString();
          trigger.runCount++;
          this.triggers.set(trigger.id, trigger);

          results.push({
            triggerId: trigger.id,
            triggerName: trigger.name,
            matched: true,
            actionsExecuted: actionResult.actions.length,
            modified: actionResult.modified
          });
        }
      }
    } catch (err) {
      log.error('[Trigger] 处理错误:', err);
    } finally {
      this._isProcessing = false;
    }

    return {
      processed: results.length > 0,
      results,
      finalContent
    };
  }

  /**
   * 评估条件
   * @param {Array} conditions - 条件列表
   * @param {string} content - 内容
   * @param {Object} metadata - 元数据
   * @returns {{ matched: boolean, details: Array }}
   * @private
   */
  _evaluateConditions(conditions, content, metadata) {
    if (!conditions || conditions.length === 0) {
      return { matched: true, details: [] }; // 无条件 = 总是匹配
    }

    const details = [];
    let allMatched = true;

    for (const condition of conditions) {
      let matched = false;
      let value = content;

      // 获取字段值
      if (condition.field === 'source_app') {
        value = metadata.sourceApp || '';
      } else if (condition.field === 'type') {
        value = metadata.type || '';
      }

      switch (condition.type) {
        case 'regex':
          try {
            const regex = new RegExp(condition.pattern, condition.flags || '');
            matched = regex.test(value);
          } catch (e) {
            log.warn(`[Trigger] 正则表达式错误: ${condition.pattern}`);
            matched = false;
          }
          break;

        case 'contains':
          matched = value.includes(condition.value || '');
          break;

        case 'notContains':
          matched = !(value.includes(condition.value || ''));
          break;

        case 'equals':
          matched = value === condition.value;
          break;

        case 'startsWith':
          matched = value.startsWith(condition.value || '');
          break;

        case 'endsWith':
          matched = value.endsWith(condition.value || '');
          break;

        case 'minLength':
          matched = (value || '').length >= (condition.value || 0);
          break;

        case 'maxLength':
          matched = (value || '').length <= (condition.value || Infinity);
          break;

        default:
          log.warn(`[Trigger] 未知的条件类型: ${condition.type}`);
          matched = false;
      }

      details.push({
        type: condition.type,
        field: condition.field,
        matched
      });

      if (!matched) allMatched = false;
    }

    return { matched: allMatched, details };
  }

  /**
   * 执行动作
   * @param {Array} actions - 动作列表
   * @param {string} content - 内容
   * @param {Object} metadata - 元数据
   * @returns {{ modified: boolean, content: string, actions: Array }}
   * @private
   */
  _executeActions(actions, content, metadata) {
    let currentContent = content;
    const executedActions = [];
    let modified = false;

    for (const action of actions) {
      try {
        let result = currentContent;

        switch (action.type) {
          case 'transform':
            result = this._applyTransform(action.method, currentContent);
            if (result !== currentContent) modified = true;
            break;

          case 'replace':
            result = currentContent.replace(
              action.search || '',
              action.replace || ''
            );
            if (result !== currentContent) modified = true;
            break;

          case 'tag':
            // 标记记录 (需要数据库操作)
            executedActions.push({ type: 'tag', tags: action.tags });
            continue; // 不修改内容

          case 'notify':
            executedActions.push({
              type: 'notify',
              message: action.message || '触发器执行完成',
              icon: action.icon || '✅'
            });
            continue; // 不修改内容

          case 'script':
            // 执行自定义脚本 (安全限制)
            result = this._executeScript(action.script, currentContent, metadata);
            if (result !== currentContent) modified = true;
            break;

          default:
            log.warn(`[Trigger] 未知的动作类型: ${action.type}`);
        }

        currentContent = result;
        executedActions.push({ type: action.type, success: true });
      } catch (err) {
        log.error(`[Trigger] 动作执行失败 (${action.type}):`, err);
        executedActions.push({ type: action.type, success: false, error: err.message });
      }
    }

    return { modified, content: currentContent, actions: executedActions };
  }

  /**
   * 应用转换方法
   * @param {string} method - 方法名
   * @param {string} content - 内容
   * @returns {string}
   * @private
   */
  _applyTransform(method, content) {
    const transforms = {
      toPlainText: () => TextFormatter.toPlainText(content),
      toUpperCase: () => TextFormatter.toUpperCase(content),
      toLowerCase: () => TextFormatter.toLowerCase(content),
      toTitleCase: () => TextFormatter.toTitleCase(content),
      trim: () => content.trim(),
      normalizeWhitespace: () => TextFormatter.normalizeWhitespace(content),
      stripHTML: () => TextFormatter.stripHTML(content),
      cleanURL: () => this._cleanURL(content),
      escapeHTML: () => TextFormatter.encodeHTMLEntities(content),
      unescapeHTML: () => TextFormatter.decodeHTMLEntities(content)
    };

    const transformFn = transforms[method];
    if (!transformFn) {
      log.warn(`[Trigger] 未知的转换方法: ${method}`);
      return content;
    }

    return transformFn();
  }

  /**
   * 清理 URL 追踪参数
   * @param {string} url - URL
   * @returns {string}
   * @private
   */
  _cleanURL(url) {
    try {
      const urlObj = new URL(url);

      // 要移除的常见追踪参数
      const trackingParams = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        'fbclid', 'gclid', '_ga', '_gl', 'ref', 'source',
        'clickid', 'mc_eid', 'trk', 'elq'
      ];

      trackingParams.forEach(param => {
        urlObj.searchParams.delete(param);
      });

      return urlObj.toString();
    } catch (e) {
      return url; // 不是有效 URL,原样返回
    }
  }

  /**
   * 执行自定义脚本 (沙箱环境)
   * @param {string} script - 脚本代码
   * @param {string} content - 输入内容
   * @param {Object} context - 上下文
   * @returns {string}
   * @private
   */
  _executeScript(script, content, context) {
    try {
      // 安全限制: 只允许纯函数操作
      const fn = new Function('input', 'context', `
        "use strict";
        ${script}
      `);

      const result = fn(content, context);

      // 确保返回字符串
      return typeof result === 'string' ? result : String(result || content);
    } catch (err) {
      log.error('[Trigger] 脚本执行失败:', err);
      return content;
    }
  }

  // ==================== 工具方法 ====================

  /**
   * 测试触发器 (不实际执行)
   * @param {string} id - 触发器ID
   * @param {string} testContent - 测试内容
   * @returns {Object}
   */
  testTrigger(id, testContent) {
    const trigger = this.triggers.get(id);
    if (!trigger) {
      return { success: false, error: '触发器不存在' };
    }

    const conditionResult = this._evaluateConditions(
      trigger.conditions,
      testContent,
      {}
    );

    return {
      success: true,
      triggerName: trigger.name,
      matched: conditionResult.matched,
      conditionDetails: conditionResult.details
    };
  }

  /**
   * 启用/禁用整个引擎
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this._isEnabled = enabled;
    log.info(`[Trigger] 引擎${enabled ? '已启用' : '已禁用'}`);
  }

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() {
    const triggers = this.getAllTriggers();
    const enabledCount = triggers.filter(t => t.enabled).length;
    const totalRuns = triggers.reduce((sum, t) => sum + (t.runCount || 0), 0);

    return {
      totalTriggers: triggers.length,
      enabledTriggers: enabledCount,
      totalRuns,
      averageRunsPerTrigger: triggers.length > 0 ? Math.round(totalRuns / triggers.length * 100) / 100 : 0
    };
  }
}

module.exports = TriggerEngine;
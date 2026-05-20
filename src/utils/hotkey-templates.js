/**
 * HotkeyTemplates - 快捷键模板系统 v0.32.0 (CLI version)
 * 为常用剪贴板内容绑定快捷键（CLI 版本仅提供数据管理，无全局快捷键功能）
 */

class HotkeyTemplates {
  constructor(db) {
    this.db = db;
    // 已注册的快捷键映射 { accelerator -> templateId }
    this.registered = new Map();
    // 支持的槽位：Ctrl+Shift+1 ~ Ctrl+Shift+9
    this.slots = Array.from({ length: 9 }, (_, i) => `Ctrl+Shift+${i + 1}`);
    this._ensureTable();
  }

  /**
   * 确保数据库表存在
   */
  _ensureTable() {
    this.db.db.run(`
      CREATE TABLE IF NOT EXISTS hotkey_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        accelerator TEXT NOT NULL UNIQUE,
        slot INTEGER NOT NULL,
        label TEXT NOT NULL,
        content TEXT NOT NULL,
        is_template INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  /**
   * 渲染模板变量
   * @param {string} content - 含变量的模板内容
   * @returns {string} 渲染后的内容
   */
  renderTemplate(content) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const datetime = `${date} ${time}`;

    return content
      .replace(/\{\{date\}\}/g, date)
      .replace(/\{\{time\}\}/g, time)
      .replace(/\{\{datetime\}\}/g, datetime)
      .replace(/\{\{clipboard\}\}/g, '{{clipboard}}'); // CLI 版本无法读取当前剪贴板
  }

  /**
   * 注册所有已保存的快捷键
   * 注意：CLI 版本不支持真正的全局快捷键，仅作数据管理
   * @param {Function} _onTrigger - 触发回调 (accelerator, content, label)
   */
  registerAll(_onTrigger) {
    const templates = this.getAll();
    console.log(`[HotkeyTemplates] CLI 版本不支持全局快捷键，已加载 ${templates.length} 个模板`);
    return { registered: 0, failed: 0, templates };
  }

  /**
   * 注销所有快捷键
   */
  unregisterAll() {
    this.registered.clear();
    console.log('[HotkeyTemplates] 已清除所有模板缓存');
  }

  /**
   * 绑定快捷键到内容
   * @param {number} slot - 槽位编号 1-9
   * @param {string} label - 显示名称
   * @param {string} content - 内容（支持模板变量）
   * @param {boolean} isTemplate - 是否启用模板变量渲染
   */
  bind(slot, label, content, isTemplate = false) {
    if (slot < 1 || slot > 9) {
      throw new Error('槽位编号必须在 1-9 之间');
    }

    const accelerator = this.slots[slot - 1];

    // 先删除该槽位已有绑定
    this.unbindSlot(slot);

    // 写入数据库
    this.db.db.run(
      `
      INSERT OR REPLACE INTO hotkey_templates (accelerator, slot, label, content, is_template, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
      [accelerator, slot, label, content, isTemplate ? 1 : 0]
    );

    return { success: true, accelerator, slot };
  }

  /**
   * 解绑指定槽位
   * @param {number} slot - 槽位编号 1-9
   */
  unbindSlot(slot) {
    const accelerator = this.slots[slot - 1];
    if (!accelerator) return false;

    this.registered.delete(accelerator);
    this.db.db.run('DELETE FROM hotkey_templates WHERE slot = ?', [slot]);
    return true;
  }

  /**
   * 获取所有绑定
   * @returns {Array} 模板列表
   */
  getAll() {
    const result = this.db.db.exec('SELECT * FROM hotkey_templates ORDER BY slot ASC');
    if (result.length === 0 || result[0].values.length === 0) return [];

    const columns = result[0].columns;
    return result[0].values.map(row => {
      const obj = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj;
    });
  }

  /**
   * 获取指定槽位绑定
   * @param {number} slot
   */
  getSlot(slot) {
    const result = this.db.db.exec('SELECT * FROM hotkey_templates WHERE slot = ?', [slot]);
    if (result.length === 0 || result[0].values.length === 0) return null;

    const columns = result[0].columns;
    const row = result[0].values[0];
    const obj = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  }

  /**
   * 获取所有槽位状态（含空槽位）
   * @returns {Array} 9个槽位的状态数组
   */
  getAllSlots() {
    const bindings = this.getAll();
    const bindingMap = new Map(bindings.map(b => [b.slot, b]));

    return this.slots.map((accelerator, i) => {
      const slot = i + 1;
      const binding = bindingMap.get(slot);
      return {
        slot,
        accelerator,
        bound: !!binding,
        label: binding?.label || null,
        content: binding?.content || null,
        is_template: binding?.is_template || false,
        preview: binding
          ? binding.content.substring(0, 50) + (binding.content.length > 50 ? '...' : '')
          : null
      };
    });
  }

  /**
   * 从剪贴板记录快速绑定
   * @param {number} slot - 槽位编号
   * @param {object} clipboardItem - 剪贴板记录对象 { content, id }
   */
  bindFromClipboardItem(slot, clipboardItem) {
    const label =
      clipboardItem.content.substring(0, 20) + (clipboardItem.content.length > 20 ? '...' : '');
    return this.bind(slot, label, clipboardItem.content, false);
  }
}

module.exports = HotkeyTemplates;

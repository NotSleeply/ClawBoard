/**
 * HotkeyTemplates - 快捷键模板系统 v0.32.0
 * 为常用剪贴板内容绑定全局快捷键，实现一键粘贴
 */

const { globalShortcut, clipboard } = require('electron');

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
    this.db.exec(`
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
    const pad = (n) => String(n).padStart(2, '0');
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const datetime = `${date} ${time}`;
    const currentClipboard = clipboard.readText();

    return content
      .replace(/\{\{date\}\}/g, date)
      .replace(/\{\{time\}\}/g, time)
      .replace(/\{\{datetime\}\}/g, datetime)
      .replace(/\{\{clipboard\}\}/g, currentClipboard);
  }

  /**
   * 注册所有已保存的快捷键
   * @param {Function} onTrigger - 触发回调 (accelerator, content, label)
   */
  registerAll(onTrigger) {
    const templates = this.getAll();
    let registered = 0;
    let failed = 0;

    for (const tpl of templates) {
      const success = this._register(tpl.accelerator, () => {
        const rendered = tpl.is_template ? this.renderTemplate(tpl.content) : tpl.content;
        clipboard.writeText(rendered);
        if (onTrigger) onTrigger(tpl.accelerator, rendered, tpl.label);
      });
      if (success) registered++;
      else failed++;
    }

    console.log(`[HotkeyTemplates] 注册完成: ${registered} 成功, ${failed} 失败`);
    return { registered, failed };
  }

  /**
   * 注销所有快捷键
   */
  unregisterAll() {
    for (const accelerator of this.registered.keys()) {
      try {
        globalShortcut.unregister(accelerator);
      } catch (e) {
        console.warn(`[HotkeyTemplates] 注销失败: ${accelerator}`, e.message);
      }
    }
    this.registered.clear();
    console.log('[HotkeyTemplates] 已注销所有快捷键');
  }

  /**
   * 内部注册单个快捷键
   */
  _register(accelerator, handler) {
    try {
      if (globalShortcut.isRegistered(accelerator)) {
        globalShortcut.unregister(accelerator);
      }
      const ok = globalShortcut.register(accelerator, handler);
      if (ok) {
        this.registered.set(accelerator, true);
      }
      return ok;
    } catch (e) {
      console.error(`[HotkeyTemplates] 注册失败: ${accelerator}`, e.message);
      return false;
    }
  }

  /**
   * 绑定快捷键到内容
   * @param {number} slot - 槽位编号 1-9
   * @param {string} label - 显示名称
   * @param {string} content - 内容（支持模板变量）
   * @param {boolean} isTemplate - 是否启用模板变量渲染
   * @param {Function} onTrigger - 触发回调
   */
  bind(slot, label, content, isTemplate = false, onTrigger = null) {
    if (slot < 1 || slot > 9) {
      throw new Error('槽位编号必须在 1-9 之间');
    }

    const accelerator = this.slots[slot - 1];

    // 先删除该槽位已有绑定
    this.unbindSlot(slot);

    // 写入数据库
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO hotkey_templates (accelerator, slot, label, content, is_template, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    stmt.run(accelerator, slot, label, content, isTemplate ? 1 : 0);

    // 注册全局快捷键
    const success = this._register(accelerator, () => {
      const rendered = isTemplate ? this.renderTemplate(content) : content;
      clipboard.writeText(rendered);
      if (onTrigger) onTrigger(accelerator, rendered, label);
    });

    return { success, accelerator, slot };
  }

  /**
   * 解绑指定槽位
   * @param {number} slot - 槽位编号 1-9
   */
  unbindSlot(slot) {
    const accelerator = this.slots[slot - 1];
    if (!accelerator) return false;

    try {
      globalShortcut.unregister(accelerator);
      this.registered.delete(accelerator);
    } catch (e) {
      // 忽略未注册的快捷键
    }

    const stmt = this.db.prepare('DELETE FROM hotkey_templates WHERE slot = ?');
    stmt.run(slot);
    return true;
  }

  /**
   * 获取所有绑定
   * @returns {Array} 模板列表
   */
  getAll() {
    const stmt = this.db.prepare('SELECT * FROM hotkey_templates ORDER BY slot ASC');
    return stmt.all();
  }

  /**
   * 获取指定槽位绑定
   * @param {number} slot
   */
  getSlot(slot) {
    const stmt = this.db.prepare('SELECT * FROM hotkey_templates WHERE slot = ?');
    return stmt.get(slot);
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
        preview: binding ? binding.content.substring(0, 50) + (binding.content.length > 50 ? '...' : '') : null,
      };
    });
  }

  /**
   * 从剪贴板记录快速绑定
   * @param {number} slot - 槽位编号
   * @param {object} clipboardItem - 剪贴板记录对象 { content, id }
   * @param {Function} onTrigger
   */
  bindFromClipboardItem(slot, clipboardItem, onTrigger = null) {
    const label = clipboardItem.content.substring(0, 20) + (clipboardItem.content.length > 20 ? '...' : '');
    return this.bind(slot, label, clipboardItem.content, false, onTrigger);
  }
}

module.exports = HotkeyTemplates;

/**
 * ClawBoard - 特殊粘贴模式管理器
 * v0.76.0: 借鉴 Ditto 的特殊粘贴功能
 *
 * 支持的粘贴模式:
 * - plain: 纯文本 (去除所有格式)
 * - uppercase: 全大写
 * - lowercase: 全小写
 * - titlecase: 首字母大写
 * - sentencecase: 句首大写
 * - togglecase: 反转大小写
 * - camelcase: 驼峰命名
 * - snakecase: 下划线命名
 * - urlencoded: URL 编码
 * - base64: Base64 编码/解码
 */

const TextFormatter = require('./TextFormatter');

class PasteModeManager {
  constructor() {
    this.modes = new Map();
    this._currentMode = 'plain';
    this._registerDefaultModes();
  }

  /**
   * 注册默认粘贴模式
   * @private
   */
  _registerDefaultModes() {
    // 纯文本模式 (最常用)
    this.registerMode('plain', {
      name: '纯文本',
      description: '去除 HTML、Markdown、多余空白等格式',
      icon: '📝',
      shortcut: 'Ctrl+Shift+V',
      hotkey: 'CommandOrControl+Shift+V',
      transform: (text) => TextFormatter.toPlainText(text)
    });

    // 大写模式
    this.registerMode('uppercase', {
      name: '大写',
      description: '转换为大写字母',
      icon: '🔠',
      shortcut: 'Ctrl+Shift+U',
      transform: (text) => TextFormatter.toUpperCase(text)
    });

    // 小写模式
    this.registerMode('lowercase', {
      name: '小写',
      description: '转换为小写字母',
      icon: '🔡',
      shortcut: 'Ctrl+Shift+L',
      transform: (text) => TextFormatter.toLowerCase(text)
    });

    // 标题模式
    this.registerMode('titlecase', {
      name: '标题格式',
      description: '每个单词首字母大写',
      icon: '📌',
      shortcut: 'Ctrl+Shift+T',
      transform: (text) => TextFormatter.toTitleCase(text)
    });

    // 句子模式
    this.registerMode('sentencecase', {
      name: '句子格式',
      description: '仅句首字母大写',
      icon: '📄',
      transform: (text) => TextFormatter.toSentenceCase(text)
    });

    // 反转大小写
    this.registerMode('togglecase', {
      name: '反转大小写',
      description: '大小写互换',
      icon: '🔄',
      transform: (text) => TextFormatter.toggleCase(text)
    });

    // 驼峰命名
    this.registerMode('camelcase', {
      name: '驼峰命名',
      description: '下划线 → 驼峰 (user_name → userName)',
      icon: '🐪',
      transform: (text) => TextFormatter.snakeToCamel(text)
    });

    // 下划线命名
    this.registerMode('snakecase', {
      name: '下划线命名',
      description: '驼峰 → 下划线 (userName → user_name)',
      icon: '🐍',
      transform: (text) => TextFormatter.camelToSnake(text)
    });

    // URL 编码
    this.registerMode('urlencoded', {
      name: 'URL 编码',
      description: '编码为 URL 安全格式',
      icon: '🔗',
      transform: (text) => TextFormatter.encodeURL(text)
    });

    // URL 解码
    this.registerMode('urldecoded', {
      name: 'URL 解码',
      description: '解码 URL 编码文本',
      icon: '🔓',
      transform: (text) => TextFormatter.decodeURL(text)
    });

    // Base64 编码
    this.registerMode('base64encode', {
      name: 'Base64 编码',
      description: '编码为 Base64',
      icon: '🔐',
      transform: (text) => TextFormatter.encodeBase64(text)
    });

    // Base64 解码
    this.registerMode('base64decode', {
      name: 'Base64 解码',
      description: '解码 Base64 文本',
      icon: '🔓',
      transform: (text) => TextFormatter.decodeBase64(text)
    });
  }

  /**
   * 注册新的粘贴模式
   * @param {string} id - 模式ID
   * @param {Object} config - 模式配置
   */
  registerMode(id, config) {
    if (!id || typeof id !== 'string') {
      throw new Error('模式 ID 必须是非空字符串');
    }

    if (!config || typeof config.transform !== 'function') {
      throw new Error('模式配置必须包含 transform 函数');
    }

    this.modes.set(id, {
      id,
      name: config.name || id,
      description: config.description || '',
      icon: config.icon || '✨',
      shortcut: config.shortcut || '',
      hotkey: config.hotkey || '',
      transform: config.transform,
      createdAt: new Date().toISOString()
    });
  }

  /**
   * 使用指定模式转换文本
   * @param {string} text - 原始文本
   * @param {string} [modeId] - 模式ID (默认使用当前模式)
   * @returns {{ success: boolean, text: string, mode: string, error?: string }}
   */
  paste(text, modeId) {
    const mode = modeId || this._currentMode;

    if (!text || typeof text !== 'string') {
      return {
        success: false,
        text: '',
        mode,
        error: '输入文本无效'
      };
    }

    const modeConfig = this.modes.get(mode);
    if (!modeConfig) {
      return {
        success: false,
        text,
        mode,
        error: `未知的粘贴模式: ${mode}`
      };
    }

    try {
      const transformed = modeConfig.transform(text);

      return {
        success: true,
        text: transformed,
        mode,
        modeName: modeConfig.name,
        originalLength: text.length,
        transformedLength: transformed.length
      };
    } catch (err) {
      console.error(`[PasteMode] 转换失败 (${mode}):`, err);
      return {
        success: false,
        text,
        mode,
        error: `转换失败: ${err.message}`
      };
    }
  }

  /**
   * 设置当前默认模式
   * @param {string} modeId - 模式ID
   */
  setCurrentMode(modeId) {
    if (this.modes.has(modeId)) {
      this._currentMode = modeId;
      console.log(`[PasteMode] 当前模式切换为: ${modeId}`);
    } else {
      console.warn(`[PasteMode] 无效的模式ID: ${modeId}`);
    }
  }

  /**
   * 获取当前模式
   * @returns {string}
   */
  getCurrentMode() {
    return this._currentMode;
  }

  /**
   * 获取所有可用模式列表
   * @returns {Array}
   */
  getModes() {
    return Array.from(this.modes.values()).map(mode => ({
      id: mode.id,
      name: mode.name,
      description: mode.description,
      icon: mode.icon,
      shortcut: mode.shortcut
    }));
  }

  /**
   * 获取模式详情
   * @param {string} modeId - 模式ID
   * @returns {Object|null}
   */
  getMode(modeId) {
    return this.modes.get(modeId) || null;
  }

  /**
   * 批量预览所有模式的转换结果
   * @param {string} text - 原始文本
   * @returns {Array} - 所有模式的预览结果
   */
  previewAllModes(text) {
    const previews = [];

    for (const [id, mode] of this.modes) {
      try {
        const result = mode.transform(text);
        previews.push({
          id,
          name: mode.name,
          icon: mode.icon,
          preview: result.substring(0, 100) + (result.length > 100 ? '...' : ''),
          length: result.length,
          isDifferent: result !== text
        });
      } catch (e) {
        previews.push({
          id,
          name: mode.name,
          icon: mode.icon,
          preview: '[转换错误]',
          length: 0,
          isDifferent: false,
          error: e.message
        });
      }
    }

    return previews;
  }
}

module.exports = PasteModeManager;
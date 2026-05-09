/**
 * ClawBoard - 文本格式清理器
 * v0.76.0: 借鉴 ClipboardFusion 的文本处理功能
 *
 * 功能:
 * - 去除 HTML 标签
 * - 去除 Word/Office 格式
 * - 去除多余空白字符
 * - 统一换行符
 * - 转义特殊字符
 */

class TextFormatter {
  /**
   * 清理所有格式 (纯文本)
   * @param {string} text - 待清理的文本
   * @returns {string} - 纯文本
   */
  static toPlainText(text) {
    if (!text || typeof text !== 'string') return '';

    let cleaned = text;

    // 1. 移除 HTML 标签
    cleaned = this.stripHTML(cleaned);

    // 2. 移除 Markdown 语法
    cleaned = this.stripMarkdown(cleaned);

    // 3. 统一换行符 (→ \n)
    cleaned = this.normalizeLineEndings(cleaned);

    // 4. 移除多余空白
    cleaned = this.normalizeWhitespace(cleaned);

    // 5. 移除零宽字符
    cleaned = this.removeZeroWidthChars(cleaned);

    return cleaned.trim();
  }

  /**
   * 去除 HTML 标签
   * @param {string} html - HTML 字符串
   * @returns {string} - 纯文本
   */
  static stripHTML(html) {
    if (!html) return '';

    // 使用正则表达式移除标签 (简单但有效)
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')  // 移除脚本
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')     // 移除样式
      .replace(/<[^>]+>/g, '')                               // 移除所有标签
      .replace(/&nbsp;/g, ' ')                               // 空格实体
      .replace(/&amp;/g, '&')                                // & 符号
      .replace(/&lt;/g, '<')                                 // < 符号
      .replace(/&gt;/g, '>')                                 // > 符号
      .replace(/&quot;/g, '"')                               // 引号
      .replace(/&#39;/g, "'")                                // 单引号
      .replace(/&#\d+;/g, '')                                // 其他数字实体
      .replace(/&[a-zA-Z]+;/g, '');                          // 其他命名实体

    return text;
  }

  /**
   * 去除 Markdown 语法
   * @param {string} md - Markdown 文本
   * @returns {string} - 纯文本
   */
  static stripMarkdown(md) {
    if (!md) return '';

    return md
      .replace(/^#{1,6}\s+/gm, '')           // 移除标题标记
      .replace(/\*\*([^*]+)\*\*/g, '$1')     // 移除粗体
      .replace(/\*([^*]+)\*/g, '$1')         // 移除斜体
      .replace(/`([^`]+)`/g, '$1')           // 移除行内代码
      .replace(/```[\s\S]*?```/g, '')        // 移除代码块
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 移除链接,保留文字
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1') // 移除图片
      .replace(/^[-*+]\s+/gm, '')            // 移除无序列表
      .replace(/^\d+\.\s+/gm, '')            // 移除有序列表
      .replace(/^>\s+/gm, '');               // 移除引用
  }

  /**
   * 统一换行符为 \n
   * @param {string} text - 文本
   * @returns {string}
   */
  static normalizeLineEndings(text) {
    if (!text) return '';
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  /**
   * 规范化空白字符
   * @param {string} text - 文本
   * @returns {string}
   */
  static normalizeWhitespace(text) {
    if (!text) return '';
    return text
      .replace(/[ \t]+/g, ' ')                    // 多个空格/制表符 → 单个空格
      .replace(/\n{3,}/g, '\n\n');                // 多于2个连续换行 → 2个
  }

  /**
   * 移除零宽字符 (可能包含隐藏信息)
   * @param {string} text - 文本
   * @returns {string}
   */
  static removeZeroWidthChars(text) {
    if (!text) return '';
    // 零宽空格、零宽非连接符、零宽连接符等
    return text.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '');
  }

  // ==================== 高级格式转换 ====================

  /**
   * 转换为大写
   * @param {string} text - 文本
   * @returns {string}
   */
  static toUpperCase(text) {
    return text ? text.toUpperCase() : '';
  }

  /**
   * 转换为小写
   * @param {string} text - 文本
   * @returns {string}
   */
  static toLowerCase(text) {
    return text ? text.toLowerCase() : '';
  }

  /**
   * 首字母大写 (Title Case)
   * @param {string} text - 文本
   * @returns {string}
   */
  static toTitleCase(text) {
    if (!text) return '';
    return text.replace(
      /\w\S*/g,
      (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  }

  /**
   * 句子首字母大写 (Sentence case)
   * @param {string} text - 文本
   * @returns {string}
   */
  static toSentenceCase(text) {
    if (!text) return '';
    return text.toLowerCase().replace(/(^\w|[.!?]\s+\w)/g, (char) => char.toUpperCase());
  }

  /**
   * 反转大小写 (Toggle Case)
   * @param {string} text - 文本
   * @returns {string}
   */
  static toggleCase(text) {
    if (!text) return '';
    return text.split('').map(char =>
      char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase()
    ).join('');
  }

  /**
   * 驼峰转下划线 (camelCase → snake_case)
   * @param {string} text - 文本
   * @returns {string}
   */
  static camelToSnake(text) {
    if (!text) return '';
    return text.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  /**
   * 下划线转驼峰 (snake_case → camelCase)
   * @param {string} text - 文本
   * @returns {string}
   */
  static snakeToCamel(text) {
    if (!text) return '';
    return text.toLowerCase().replace(/_([a-z])/g, (g) => g[1].toUpperCase());
  }

  // ==================== 编码转换 ====================

  /**
   * URL 编码
   * @param {string} text - 文本
   * @returns {string}
   */
  static encodeURL(text) {
    return text ? encodeURIComponent(text) : '';
  }

  /**
   * URL 解码
   * @param {string} text - 文本
   * @returns {string}
   */
  static decodeURL(text) {
    try {
      return text ? decodeURIComponent(text) : '';
    } catch (e) {
      console.warn('[TextFormatter] URL 解码失败:', e.message);
      return text;
    }
  }

  /**
   * Base64 编码
   * @param {string} text - 文本
   * @returns {string}
   */
  static encodeBase64(text) {
    try {
      return text ? Buffer.from(text, 'utf-8').toString('base64') : '';
    } catch (e) {
      console.warn('[TextFormatter] Base64 编码失败:', e.message);
      return '';
    }
  }

  /**
   * Base64 解码
   * @param {string} text - Base64 字符串
   * @returns {string}
   */
  static decodeBase64(text) {
    try {
      return text ? Buffer.from(text, 'base64').toString('utf-8') : '';
    } catch (e) {
      console.warn('[TextFormatter] Base64 解码失败:', e.message);
      return '';
    }
  }

  /**
   * HTML 实体编码
   * @param {string} text - 文本
   * @returns {string}
   */
  static encodeHTMLEntities(text) {
    if (!text) return '';
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return text.replace(/[&<>"']/g, char => entities[char]);
  }

  /**
   * HTML 实体解码
   * @param {string} text - 文本
   * @returns {string}
   */
  static decodeHTMLEntities(text) {
    if (!text) return '';
    const entities = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'"
    };
    return text.replace(/&(?:amp|lt|gt|quot|#39);/g, entity => entities[entity]);
  }

  // ==================== 实用工具 ====================

  /**
   * 统计文本信息
   * @param {string} text - 文本
   * @returns {Object} - 统计信息
   */
  static getStats(text) {
    if (!text || typeof text !== 'string') {
      return {
        characters: 0,
        words: 0,
        lines: 0,
        bytes: 0,
        hasHTML: false,
        hasEmoji: false,
        language: 'unknown'
      };
    }

    const stats = {
      characters: text.length,
      words: text.trim() ? text.trim().split(/\s+/).length : 0,
      lines: text.split('\n').length,
      bytes: Buffer.byteLength(text, 'utf8'),
      hasHTML: /<[a-z][\s\S]*>/i.test(text),
      hasEmoji: /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(text),
    };

    // 简单语言检测 (基于字符分布)
    const chineseRatio = (/[\u4e00-\u9fa5]/g.test(text) ? text.match(/[\u4e00-\u9fa5]/g).length : 0) / stats.characters;
    stats.language = chineseRatio > 0.3 ? 'zh' : 'en';

    return stats;
  }

  /**
   * 提取纯文本内容 (智能识别格式)
   * @param {string} content - 可能包含格式的文本
   * @returns {{ text: string, format: string }}
   */
  static extractText(content) {
    if (!content) return { text: '', format: 'empty' };

    // 检测是否为 HTML
    if (/<[a-z][\s\S]*>/i.test(content)) {
      return {
        text: this.toPlainText(content),
        format: 'html'
      };
    }

    // 检测是否为 JSON
    if (/^\s*{/.test(content)) {
      try {
        const json = JSON.parse(content);
        return {
          text: JSON.stringify(json, null, 2),
          format: 'json'
        };
      } catch (e) {
        // 不是有效 JSON
      }
    }

    // 普通文本
    return {
      text: content.trim(),
      format: 'plain'
    };
  }
}

module.exports = TextFormatter;
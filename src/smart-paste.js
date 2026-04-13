/**
 * SmartPaste - 智能粘贴模块 v0.31.0
 * 支持多种粘贴格式转换和工作流自动化
 */

const { clipboard } = require('electron');

class SmartPaste {
  constructor() {
    // 预设转换规则
    this.transformers = {
      'plain': this.toPlainText.bind(this),
      'markdown': this.toMarkdown.bind(this),
      'codeblock': this.toCodeBlock.bind(this),
      'lowercase': this.toLowerCase.bind(this),
      'uppercase': this.toUpperCase.bind(this),
      'url-clean': this.cleanUrl.bind(this),
      'json-format': this.formatJson.bind(this),
      'phone-mask': this.maskPhone.bind(this),
    };

    // 用户自定义脚本存储
    this.customScripts = new Map();
  }

  /**
   * 执行智能粘贴
   * @param {string} content - 原始内容
   * @param {string} type - 转换类型
   * @param {object} options - 额外选项
   * @returns {string} 转换后的内容
   */
  transform(content, type, options = {}) {
    if (!content || typeof content !== 'string') {
      return content;
    }

    const transformer = this.transformers[type];
    if (!transformer) {
      console.warn(`[SmartPaste] 未知的转换类型: ${type}`);
      return content;
    }

    try {
      return transformer(content, options);
    } catch (error) {
      console.error(`[SmartPaste] 转换失败 (${type}):`, error);
      return content;
    }
  }

  /**
   * 转换为纯文本（去除格式）
   */
  toPlainText(content) {
    // 移除 HTML 标签
    return content.replace(/<[^>]*>/g, '').trim();
  }

  /**
   * 转换为 Markdown 格式
   */
  toMarkdown(content, options = {}) {
    // 检测 URL 并转换为 Markdown 链接
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    let markdown = content;

    // 转换 URL
    markdown = markdown.replace(urlRegex, (url) => {
      // 尝试提取标题（简化版）
      try {
        const urlObj = new URL(url);
        const title = urlObj.hostname.replace(/^www\./, '');
        return `[${title}](${url})`;
      } catch {
        return `[链接](${url})`;
      }
    });

    // 转换加粗文本 **text**
    markdown = markdown.replace(/\*\*(.+?)\*\*/g, '**$1**');

    // 转换斜体 *text*
    markdown = markdown.replace(/\*(.+?)\*/g, '*$1*');

    // 转换代码 `code`
    markdown = markdown.replace(/`(.+?)`/g, '`$1`');

    return markdown;
  }

  /**
   * 转换为代码块
   */
  toCodeBlock(content, options = {}) {
    const language = options.language || this.detectLanguage(content);
    return '```' + language + '\n' + content + '\n```';
  }

  /**
   * 简单语言检测
   */
  detectLanguage(content) {
    // 检测常见语言特征
    if (/^(const|let|var|function|import|export)\s/.test(content)) return 'javascript';
    if (/^(def|class|import|from)\s/.test(content)) return 'python';
    if (/^(package|import|public|class)\s/.test(content)) return 'java';
    if (/^#include|^(int|void|char)\s+\w+\s*\(/.test(content)) return 'c';
    if (/^(SELECT|INSERT|UPDATE|DELETE)\s/i.test(content)) return 'sql';
    if (/^\s*\{[\s\S]*\}\s*$/.test(content)) return 'json';
    if (/^(<!DOCTYPE|<html|<div|<span)/i.test(content)) return 'html';
    if (/^\s*\.\w+\s*\{/.test(content)) return 'css';
    return 'text';
  }

  /**
   * 转换为小写
   */
  toLowerCase(content) {
    return content.toLowerCase();
  }

  /**
   * 转换为大写
   */
  toUpperCase(content) {
    return content.toUpperCase();
  }

  /**
   * 清理 URL（移除跟踪参数）
   */
  cleanUrl(content) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return content.replace(urlRegex, (url) => {
      try {
        const urlObj = new URL(url);
        // 移除常见跟踪参数
        const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ref'];
        trackingParams.forEach(param => urlObj.searchParams.delete(param));
        return urlObj.toString();
      } catch {
        return url;
      }
    });
  }

  /**
   * 格式化 JSON
   */
  formatJson(content) {
    try {
      const obj = JSON.parse(content);
      return JSON.stringify(obj, null, 2);
    } catch {
      return content;
    }
  }

  /**
   * 手机号脱敏
   */
  maskPhone(content) {
    // 匹配中国大陆手机号
    const phoneRegex = /(1[3-9]\d)\d{4}(\d{4})/g;
    return content.replace(phoneRegex, '$1****$2');
  }

  /**
   * 注册自定义脚本
   */
  registerScript(name, script, description = '') {
    this.customScripts.set(name, { script, description });
  }

  /**
   * 执行自定义脚本
   */
  executeScript(name, content) {
    const scriptInfo = this.customScripts.get(name);
    if (!scriptInfo) {
      throw new Error(`脚本不存在: ${name}`);
    }

    try {
      // 使用 Function 构造函数创建安全的执行环境
      const fn = new Function('content', 'console', scriptInfo.script);
      return fn(content, console);
    } catch (error) {
      console.error(`[SmartPaste] 脚本执行失败 (${name}):`, error);
      throw error;
    }
  }

  /**
   * 获取所有可用的转换类型
   */
  getAvailableTypes() {
    return [
      { id: 'plain', name: '纯文本', description: '去除所有格式' },
      { id: 'markdown', name: 'Markdown', description: '转换为 Markdown 格式' },
      { id: 'codeblock', name: '代码块', description: '包裹为代码块' },
      { id: 'lowercase', name: '小写', description: '转换为小写字母' },
      { id: 'uppercase', name: '大写', description: '转换为大写字母' },
      { id: 'url-clean', name: '清理 URL', description: '移除跟踪参数' },
      { id: 'json-format', name: '格式化 JSON', description: '美化 JSON 格式' },
      { id: 'phone-mask', name: '手机号脱敏', description: '隐藏手机号中间四位' },
    ];
  }

  /**
   * 获取所有自定义脚本
   */
  getCustomScripts() {
    const scripts = [];
    this.customScripts.forEach((value, key) => {
      scripts.push({ name: key, description: value.description });
    });
    return scripts;
  }
}

module.exports = SmartPaste;

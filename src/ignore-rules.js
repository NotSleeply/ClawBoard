/**
 * IgnoreRules - 剪贴板忽略规则模块 v0.31.0
 * 支持按来源应用、内容模式、长度等条件忽略剪贴板内容
 */

class IgnoreRules {
  constructor() {
    // 默认规则
    this.rules = {
      // 按来源应用忽略
      ignoredApps: [
        { pattern: '1Password', enabled: true },
        { pattern: 'Bitwarden', enabled: true },
        { pattern: 'KeePass', enabled: true },
        { pattern: 'LastPass', enabled: true },
        { pattern: '密码', enabled: true },
        { pattern: 'Password', enabled: true },
      ],
      // 按内容正则忽略
      ignoredPatterns: [
        { pattern: '^\s*$', enabled: true, description: '空内容' },
        { pattern: '^[\s\n\r]*$', enabled: true, description: '仅空白字符' },
      ],
      // 长度限制
      lengthLimits: {
        min: 1,      // 最小长度
        max: 100000, // 最大长度（约 100KB）
        enabled: true,
      },
      // 敏感信息检测
      sensitiveDetection: {
        enabled: true,
        patterns: [
          { name: '信用卡号', pattern: '\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12})\b' },
          { name: '身份证号', pattern: '\b[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b' },
          { name: 'API 密钥', pattern: '(?:api[_-]?key|apikey|token)\s*[:=]\s*["\']?[a-zA-Z0-9_-]{16,}["\']?' },
        ],
      },
    };

    // 忽略的剪贴板内容缓存（用于去重）
    this.recentContents = new Set();
    this.maxRecentCache = 100;
  }

  /**
   * 检查是否应该忽略此剪贴板内容
   * @param {string} content - 剪贴板内容
   * @param {object} metadata - 元数据（来源应用等）
   * @returns {object} { shouldIgnore: boolean, reason: string }
   */
  shouldIgnore(content, metadata = {}) {
    // 1. 检查长度限制
    if (this.rules.lengthLimits.enabled) {
      if (content.length < this.rules.lengthLimits.min) {
        return { shouldIgnore: true, reason: '内容太短' };
      }
      if (content.length > this.rules.lengthLimits.max) {
        return { shouldIgnore: true, reason: '内容超过长度限制' };
      }
    }

    // 2. 检查来源应用
    const sourceApp = metadata.sourceApp || '';
    for (const rule of this.rules.ignoredApps) {
      if (rule.enabled && sourceApp.toLowerCase().includes(rule.pattern.toLowerCase())) {
        return { shouldIgnore: true, reason: `来源应用被忽略: ${rule.pattern}` };
      }
    }

    // 3. 检查内容模式
    for (const rule of this.rules.ignoredPatterns) {
      if (rule.enabled) {
        try {
          const regex = new RegExp(rule.pattern, 'i');
          if (regex.test(content)) {
            return { shouldIgnore: true, reason: rule.description || '匹配忽略规则' };
          }
        } catch (e) {
          console.error('[IgnoreRules] 无效的正则表达式:', rule.pattern);
        }
      }
    }

    // 4. 检查敏感信息
    if (this.rules.sensitiveDetection.enabled) {
      const sensitiveInfo = this.detectSensitiveInfo(content);
      if (sensitiveInfo.found) {
        return { 
          shouldIgnore: true, 
          reason: `检测到敏感信息: ${sensitiveInfo.types.join(', ')}`,
          sensitive: true,
          types: sensitiveInfo.types,
        };
      }
    }

    // 5. 检查重复内容（最近 100 条）
    const contentHash = this.hashContent(content);
    if (this.recentContents.has(contentHash)) {
      return { shouldIgnore: true, reason: '重复内容' };
    }

    // 添加到最近缓存
    this.recentContents.add(contentHash);
    if (this.recentContents.size > this.maxRecentCache) {
      const first = this.recentContents.values().next().value;
      this.recentContents.delete(first);
    }

    return { shouldIgnore: false, reason: '' };
  }

  /**
   * 检测敏感信息
   */
  detectSensitiveInfo(content) {
    const foundTypes = [];

    for (const pattern of this.rules.sensitiveDetection.patterns) {
      try {
        const regex = new RegExp(pattern.pattern, 'i');
        if (regex.test(content)) {
          foundTypes.push(pattern.name);
        }
      } catch (e) {
        console.error('[IgnoreRules] 敏感信息检测正则错误:', pattern.name);
      }
    }

    return {
      found: foundTypes.length > 0,
      types: foundTypes,
    };
  }

  /**
   * 简单的内容哈希
   */
  hashContent(content) {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString();
  }

  /**
   * 添加忽略规则
   */
  addIgnoredApp(pattern) {
    this.rules.ignoredApps.push({ pattern, enabled: true });
  }

  /**
   * 添加内容忽略规则
   */
  addIgnoredPattern(pattern, description = '') {
    this.rules.ignoredPatterns.push({ pattern, description, enabled: true });
  }

  /**
   * 移除忽略规则
   */
  removeIgnoredApp(pattern) {
    this.rules.ignoredApps = this.rules.ignoredApps.filter(r => r.pattern !== pattern);
  }

  /**
   * 移除内容忽略规则
   */
  removeIgnoredPattern(pattern) {
    this.rules.ignoredPatterns = this.rules.ignoredPatterns.filter(r => r.pattern !== pattern);
  }

  /**
   * 设置长度限制
   */
  setLengthLimits(min, max) {
    this.rules.lengthLimits.min = min;
    this.rules.lengthLimits.max = max;
  }

  /**
   * 启用/禁用敏感信息检测
   */
  setSensitiveDetection(enabled) {
    this.rules.sensitiveDetection.enabled = enabled;
  }

  /**
   * 获取所有规则
   */
  getRules() {
    return this.rules;
  }

  /**
   * 导出规则为 JSON
   */
  exportRules() {
    return JSON.stringify(this.rules, null, 2);
  }

  /**
   * 从 JSON 导入规则
   */
  importRules(json) {
    try {
      this.rules = JSON.parse(json);
      return true;
    } catch (e) {
      console.error('[IgnoreRules] 导入规则失败:', e);
      return false;
    }
  }
}

module.exports = IgnoreRules;

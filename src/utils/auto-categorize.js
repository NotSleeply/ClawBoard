/**
 * Auto-categorize rules engine
 * v0.65.0
 */
class AutoCategorize {
  constructor() {
    this.rules = [];
    this.loadRules();
  }

  loadRules() {
    try {
      const fs = require('fs');
      const path = require('path');
      const userData = require('electron').app.getPath('userData');
      const rulesPath = path.join(userData, 'auto-cat-rules.json');
      if (fs.existsSync(rulesPath)) {
        this.rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
      }
    } catch (e) {
      console.error('Load auto-cat rules failed:', e);
      this.rules = [];
    }
  }

  saveRules() {
    try {
      const fs = require('fs');
      const path = require('path');
      const userData = require('electron').app.getPath('userData');
      const rulesPath = path.join(userData, 'auto-cat-rules.json');
      fs.writeFileSync(rulesPath, JSON.stringify(this.rules, null, 2), 'utf8');
      return true;
    } catch (e) {
      console.error('Save auto-cat rules failed:', e);
      return false;
    }
  }

  evaluate(content, type, sourceApp) {
    if (!content || this.rules.length === 0) return { tags: [], groupId: null };

    const result = { tags: [], groupId: null };

    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      let matched = false;
      const target = rule.field === 'content' ? content :
        rule.field === 'source' ? (sourceApp || '') :
          (content || '');

      if (rule.matchType === 'contains') {
        matched = target.toLowerCase().includes(rule.pattern.toLowerCase());
      } else if (rule.matchType === 'regex') {
        try {
          const regex = new RegExp(rule.pattern, 'i');
          matched = regex.test(target);
        } catch (e) { /* invalid regex */ }
      } else if (rule.matchType === 'startsWith') {
        matched = target.toLowerCase().startsWith(rule.pattern.toLowerCase());
      }

      if (matched) {
        if (rule.action === 'tag' && rule.tag) {
          if (!result.tags.includes(rule.tag)) result.tags.push(rule.tag);
        } else if (rule.action === 'group' && rule.groupId) {
          result.groupId = rule.groupId;
        }

        if (rule.stopOnMatch) break;
      }
    }

    return result;
  }

  addRule(rule) {
    this.rules.push({
      id: Date.now().toString(),
      enabled: true,
      field: rule.field || 'content',
      matchType: rule.matchType || 'contains',
      pattern: rule.pattern || '',
      action: rule.action || 'tag',
      tag: rule.tag || null,
      groupId: rule.groupId || null,
      stopOnMatch: rule.stopOnMatch || false,
    });
    this.saveRules();
    return true;
  }

  removeRule(id) {
    this.rules = this.rules.filter(r => r.id !== id);
    this.saveRules();
    return true;
  }

  toggleRule(id, enabled) {
    const rule = this.rules.find(r => r.id === id);
    if (rule) {
      rule.enabled = enabled;
      this.saveRules();
      return true;
    }
    return false;
  }

  updateRule(id, updates) {
    const rule = this.rules.find(r => r.id === id);
    if (rule) {
      Object.assign(rule, updates);
      this.saveRules();
      return true;
    }
    return false;
  }

  getRules() {
    return this.rules;
  }
}

module.exports = AutoCategorize;

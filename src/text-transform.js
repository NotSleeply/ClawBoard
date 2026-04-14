/**
 * TextTransform - 剪贴板内容格式转换 v0.33.0
 * 提供多种文本格式转换功能
 */

class TextTransform {
  constructor() {
    this.transforms = {
      'url-encode': { label: 'URL 编码', fn: (s) => encodeURIComponent(s), desc: '将文本转为 URL 安全格式' },
      'url-decode': { label: 'URL 解码', fn: (s) => decodeURIComponent(s), desc: '将 URL 编码还原为文本' },
      'html-encode': { label: 'HTML 实体编码', fn: (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])), desc: '转义 HTML 特殊字符' },
      'html-decode': { label: 'HTML 实体解码', fn: (s) => s.replace(/&(amp|lt|gt|quot|#39);/g, (_, m) => ({ 'amp': '&', 'lt': '<', 'gt': '>', 'quot': '"', '#39': "'" }[m])), desc: '还原 HTML 实体为文本' },
      'base64-encode': { label: 'Base64 编码', fn: (s) => Buffer.from(s, 'utf8').toString('base64'), desc: '将文本转为 Base64' },
      'base64-decode': { label: 'Base64 解码', fn: (s) => Buffer.from(s, 'base64').toString('utf8'), desc: '将 Base64 还原为文本' },
      'json-format': { label: 'JSON 格式化', fn: (s) => { try { return JSON.stringify(JSON.parse(s), null, 2); } catch (e) { throw new Error('无效的 JSON'); } }, desc: '美化 JSON 格式（带缩进）' },
      'json-minify': { label: 'JSON 压缩', fn: (s) => { try { return JSON.stringify(JSON.parse(s)); } catch (e) { throw new Error('无效的 JSON'); } }, desc: '压缩 JSON 为单行' },
      'uppercase': { label: '全部大写', fn: (s) => s.toUpperCase(), desc: '转换为大写字母' },
      'lowercase': { label: '全部小写', fn: (s) => s.toLowerCase(), desc: '转换为小写字母' },
      'titlecase': { label: '首字母大写', fn: (s) => s.replace(/\b\w/g, (c) => c.toUpperCase()), desc: '每个单词首字母大写' },
      'trim': { label: '去除首尾空格', fn: (s) => s.trim(), desc: '移除文本首尾的空白字符' },
      'remove-spaces': { label: '去除全部空格', fn: (s) => s.replace(/\s+/g, ''), desc: '移除所有空白字符包括换行' },
      'reverse': { label: '反转字符串', fn: (s) => s.split('').reverse().join(''), desc: '将文本倒序排列' },
      'line-numbers': { label: '添加行号', fn: (s) => s.split('\n').map((l, i) => `${i + 1}. ${l}`).join('\n'), desc: '为每行添加行号' },
    };
  }

  apply(transformId, text) {
    const t = this.transforms[transformId];
    if (!t) throw new Error('未知的转换类型: ' + transformId);
    return { label: t.label, result: t.fn(text), desc: t.desc };
  }

  listTransforms() {
    return Object.entries(this.transforms).map(([id, t]) => ({ id, label: t.label, desc: t.desc }));
  }
}

module.exports = TextTransform;

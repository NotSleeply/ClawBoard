import { describe, test, expect } from 'vitest';
import TextFormatter from '../TextFormatter.js';

describe('TextFormatter', () => {
  describe('toPlainText - 纯文本转换', () => {
    test('应该去除 HTML 标签', () => {
      const html = '<div><p>Hello <b>World</b></p></div>';
      expect(TextFormatter.toPlainText(html)).toBe('Hello World');
    });

    test('应该去除 Markdown 语法', () => {
      const md = '**bold** and *italic*';
      expect(TextFormatter.toPlainText(md)).toBe('bold and italic');
    });

    test('应该统一换行符', () => {
      const text = 'line1\r\nline2\rline3';
      const result = TextFormatter.toPlainText(text);
      expect(result).not.toContain('\r');
      expect(result).toContain('line1\n');
    });

    test('应该移除多余空白字符', () => {
      const text = 'hello   world\t\ttest';
      const result = TextFormatter.toPlainText(text);
      expect(result).toBe('hello world test');
    });

    test('应该处理空输入', () => {
      expect(TextFormatter.toPlainText('')).toBe('');
      expect(TextFormatter.toPlainText(null)).toBe('');
      expect(TextFormatter.toPlainText(undefined)).toBe('');
    });
  });

  describe('stripHTML - HTML 标签移除', () => {
    test('应该移除 script 和 style 标签及其内容', () => {
      const html = '<script>alert("xss")</script><style>.class{}</style>content';
      expect(TextFormatter.stripHTML(html)).toBe('content');
    });

    test('应该解码 HTML 实体', () => {
      const html = '&amp; &lt; &gt; &quot; &#39;';
      expect(TextFormatter.stripHTML(html)).toBe('& < > " \'');
    });

    test('应该处理复杂的 HTML 结构', () => {
      const html = '<a href="link">text</a><img src="image.jpg" />';
      expect(TextFormatter.stripHTML(html)).toBe('text');
    });
  });

  describe('大小写转换', () => {
    test('toUpperCase 应该转大写', () => {
      expect(TextFormatter.toUpperCase('hello')).toBe('HELLO');
    });

    test('toLowerCase 应该转小写', () => {
      expect(TextFormatter.toLowerCase('HELLO')).toBe('hello');
    });

    test('toTitleCase 应该首字母大写', () => {
      expect(TextFormatter.toTitleCase('hello world')).toBe('Hello World');
    });

    test('toSentenceCase 应该句首大写', () => {
      expect(TextFormatter.toSentenceCase('hello. WORLD.')).toBe('Hello. World.');
    });

    test('toggleCase 应该反转大小写', () => {
      expect(TextFormatter.toggleCase('HeLLo')).toBe('hEllO');
    });
  });

  describe('命名规范转换', () => {
    test('camelToSnake 应该转为下划线命名', () => {
      expect(TextFormatter.camelToSnake('userName')).toBe('user_name');
      expect(TextFormatter.camelToSnake('getFullName')).toBe('get_full_name');
    });

    test('snakeToCamel 应该转为驼峰命名', () => {
      expect(TextFormatter.snakeToCamel('user_name')).toBe('userName');
      expect(TextFormatter.snakeToCamel('get_full_name')).toBe('getFullName');
    });
  });

  describe('编码转换', () => {
    test('encodeURL / decodeURL 应该双向兼容', () => {
      const original = 'hello world?foo=bar&baz=qux';
      const encoded = TextFormatter.encodeURL(original);
      const decoded = TextFormatter.decodeURL(encoded);
      expect(decoded).toBe(original);
    });

    test('encodeBase64 / decodeBase64 应该双向兼容', () => {
      const original = 'Hello, World!';
      const encoded = TextFormatter.encodeBase64(original);
      const decoded = TextFormatter.decodeBase64(encoded);
      expect(decoded).toBe(original);
    });

    test('encodeHTMLEntities / decodeHTMLEntities 应该双向兼容', () => {
      const original = '<div class="test">content</div>';
      const encoded = TextFormatter.encodeHTMLEntities(original);
      const decoded = TextFormatter.decodeHTMLEntities(encoded);
      expect(decoded).toBe(original);
    });
  });

  describe('文本统计', () => {
    test('getStats 应该返回正确的统计信息', () => {
      const stats = TextFormatter.getStats('Hello 世界!');

      expect(stats.characters).toBe(9);
      expect(stats.words).toBe(2);
      expect(stats.lines).toBe(1);
      expect(stats.bytes).toBeGreaterThan(0);
    });

    test('应该检测中文内容', () => {
      const stats = TextFormatter.getStats('你好世界');
      expect(stats.language).toBe('zh');
    });

    test('应该检测英文内容', () => {
      const stats = TextFormatter.getStats('Hello World');
      expect(stats.language).toBe('en');
    });

    test('应该检测 HTML 内容', () => {
      const stats = TextFormatter.getStats('<div>test</div>');
      expect(stats.hasHTML).toBe(true);
    });

    test('应该检测 Emoji', () => {
      const stats = TextFormatter.getStats('Hello 🌍');
      expect(stats.hasEmoji).toBe(true);
    });

    test('空字符串应返回零值统计', () => {
      const stats = TextFormatter.getStats('');
      expect(stats.characters).toBe(0);
      expect(stats.words).toBe(0);
    });
  });

  describe('extractText - 智能提取', () => {
    test('应该识别 HTML 格式', () => {
      const result = TextFormatter.extractText('<b>text</b>');
      expect(result.format).toBe('html');
      expect(result.text).toBe('text');
    });

    test('应该识别 JSON 格式', () => {
      const json = '{"key": "value"}';
      const result = TextFormatter.extractText(json);
      expect(result.format).toBe('json');
    });

    test('应该返回纯文本格式', () => {
      const result = TextFormatter.extractText('plain text');
      expect(result.format).toBe('plain');
      expect(result.text).toBe('plain text');
    });
  });
});

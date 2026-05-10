/**
 * PasteModeManager 单元测试
 */

const PasteModeManager = require('../../src/utils/PasteModeManager');

describe('PasteModeManager', () => {
  let manager;

  beforeEach(() => {
    manager = new PasteModeManager();
  });

  describe('初始化', () => {
    test('应该有默认的粘贴模式', () => {
      const modes = manager.getModes();
      expect(modes.length).toBeGreaterThan(0);
      expect(modes.some(m => m.id === 'plain')).toBe(true);
      expect(modes.some(m => m.id === 'uppercase')).toBe(true);
    });

    test('默认模式应该是 plain', () => {
      expect(manager.getCurrentMode()).toBe('plain');
    });
  });

  describe('paste - 粘贴转换', () => {
    test('plain 模式应该返回纯文本', () => {
      const result = manager.paste('<b>HTML</b> text', 'plain');
      expect(result.success).toBe(true);
      // plain 模式应该去除 HTML 标签
      expect(result.text).not.toContain('<b>');
    });

    test('uppercase 模式应该转大写', () => {
      const result = manager.paste('hello world', 'uppercase');
      expect(result.success).toBe(true);
      expect(result.text).toBe('HELLO WORLD');
    });

    test('lowercase 模式应该转小写', () => {
      const result = manager.paste('HELLO WORLD', 'lowercase');
      expect(result.success).toBe(true);
      expect(result.text).toBe('hello world');
    });

    test('titlecase 模式应该首字母大写', () => {
      const result = manager.paste('hello world', 'titlecase');
      expect(result.success).toBe(true);
      expect(result.text).toBe('Hello World');
    });

    test('togglecase 模式应该反转大小写', () => {
      const result = manager.paste('HeLLo', 'togglecase');
      expect(result.success).toBe(true);
      expect(result.text).toBe('hEllO');
    });

    test('camelcase 模式应该转为驼峰', () => {
      const result = manager.paste('user_name', 'camelcase');
      expect(result.success).toBe(true);
      expect(result.text).toBe('userName');
    });

    test('snakecase 模式应该转为下划线', () => {
      const result = manager.paste('userName', 'snakecase');
      expect(result.success).toBe(true);
      expect(result.text).toBe('user_name');
    });

    test('urlencoded 模式应该 URL 编码', () => {
      const result = manager.paste('hello world', 'urlencoded');
      expect(result.success).toBe(true);
      expect(result.text).toContain('%20');
    });

    test('base64encode 模式应该 Base64 编码', () => {
      const result = manager.paste('test', 'base64encode');
      expect(result.success).toBe(true);
      expect(result.text).toBe('dGVzdA=='); // base64 of 'test'
    });
  });

  describe('错误处理', () => {
    test('无效的模式ID应该返回错误', () => {
      const result = manager.paste('text', 'invalid-mode');
      expect(result.success).toBe(false);
      expect(result.error).toContain('未知的粘贴模式');
    });

    test('空文本应该优雅处理', () => {
      const result = manager.paste('', 'uppercase');
      expect(result.success).toBe(true);
      expect(result.text).toBe('');
    });

    test('null 文本应该处理', () => {
      const result = manager.paste(null, 'uppercase');
      expect(result.success).toBe(false);
    });
  });

  describe('模式管理', () => {
    test('setCurrentMode 应该切换当前模式', () => {
      manager.setCurrentMode('uppercase');
      expect(manager.getCurrentMode()).toBe('uppercase');
    });

    test('设置无效模式不应该改变当前模式', () => {
      const original = manager.getCurrentMode();
      manager.setCurrentMode('nonexistent');
      expect(manager.getCurrentMode()).toBe(original);
    });

    test('getMode 应该返回模式详情', () => {
      const mode = manager.getMode('plain');
      expect(mode).toBeTruthy();
      expect(mode.name).toBeTruthy();
      expect(mode.description).toBeTruthy();
    });

    test('不存在的模式应返回 null', () => {
      const mode = manager.getMode('nonexistent');
      expect(mode).toBeNull();
    });
  });

  describe('自定义模式注册', () => {
    test('registerMode 应该添加新模式', () => {
      manager.registerMode('reverse', {
        name: '反转',
        description: '反转字符串',
        icon: '🔄',
        transform: (text) => text.split('').reverse().join('')
      });

      const mode = manager.getMode('reverse');
      expect(mode).toBeTruthy();
      expect(mode.name).toBe('反转');

      const result = manager.paste('hello', 'reverse');
      expect(result.text).toBe('olleh');
    });

    test('缺少 transform 函数应该抛出错误', () => {
      expect(() => {
        manager.registerMode('bad', { name: 'Bad' });
      }).toThrow('transform');
    });

    test('无效的 ID 应该抛出错误', () => {
      expect(() => {
        manager.registerMode('', { name: 'Empty' });
      }).toThrow('非空字符串');
    });
  });

  describe('previewAllModes - 批量预览', () => {
    test('应该返回所有模式的预览结果', () => {
      const previews = manager.previewAllModes('Hello World');
      
      expect(previews.length).toBeGreaterThan(0);
      
      // 每个预览应该包含必要字段
      previews.forEach(preview => {
        expect(preview).toHaveProperty('id');
        expect(preview).toHaveProperty('name');
        expect(preview).toHaveProperty('preview');
        expect(preview).toHaveProperty('isDifferent');
      });
    });

    test('原始文本和转换后不同的模式 should mark isDifferent as true', () => {
      const previews = manager.previewAllModes('hello');
      
      const uppercase = previews.find(p => p.id === 'uppercase');
      expect(uppercase.isDifferent).toBe(true); // hello → HELLO (不同)
    });

    test('plain 模式通常会产生不同结果 (去除格式)', () => {
      const htmlText = '<b>bold</b>';
      const previews = manager.previewAllModes(htmlText);
      
      const plain = previews.find(p => p.id === 'plain');
      expect(plain.isDifferent).toBe(true); // 去除 HTML 标签
    });
  });
});

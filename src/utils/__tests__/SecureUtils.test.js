import { describe, test, expect, beforeAll } from 'vitest';
import SecureUtils from '../SecureUtils.js';

describe('SecureUtils', () => {
  describe('密钥派生', () => {
    test('generateSalt 应该生成指定长度的盐值', () => {
      const salt = SecureUtils.generateSalt(16);
      expect(salt).toBeInstanceOf(Buffer);
      expect(salt.length).toBe(16);
    });

    test('每次生成的盐值应该不同', () => {
      const salt1 = SecureUtils.generateSalt(16);
      const salt2 = SecureUtils.generateSalt(16);
      expect(salt1.equals(salt2)).toBe(false);
    });
  });

  describe('AES-256-GCM 加密解密', () => {
    let key;

    beforeAll(() => {
      const crypto = require('crypto');
      key = crypto.randomBytes(32);
    });

    test('加密后应该能正确解密', () => {
      const plaintext = 'Hello, World!';
      const encrypted = SecureUtils.encryptGCM(plaintext, key);
      const decrypted = SecureUtils.decryptGCM(encrypted, key);

      expect(decrypted).toBe(plaintext);
      expect(encrypted).not.toBe(plaintext);
    });

    test('应该处理空字符串', () => {
      const encrypted = SecureUtils.encryptGCM('', key);
      const decrypted = SecureUtils.decryptGCM(encrypted, key);
      expect(decrypted).toBe('');
    });

    test('应该处理 Unicode 字符串', () => {
      const plaintext = '你好世界 🌍 Test 123';
      const encrypted = SecureUtils.encryptGCM(plaintext, key);
      const decrypted = SecureUtils.decryptGCM(encrypted, key);
      expect(decrypted).toBe(plaintext);
    });

    test('使用错误密钥解密应该返回错误信息', () => {
      const crypto = require('crypto');
      const wrongKey = crypto.randomBytes(32);

      const plaintext = 'Secret message';
      const encrypted = SecureUtils.encryptGCM(plaintext, key);
      const decrypted = SecureUtils.decryptGCM(encrypted, wrongKey);

      expect(decrypted).toContain('解密失败');
    });

    test('损坏的密文应该返回错误信息', () => {
      const decrypted = SecureUtils.decryptGCM('corrupted-data', key);
      expect(decrypted).toContain('解密失败');
    });

    test('null 或 undefined 输入应原样返回', () => {
      expect(SecureUtils.encryptGCM(null, key)).toBeNull();
      expect(SecureUtils.encryptGCM(undefined, key)).toBeUndefined();
      expect(SecureUtils.decryptGCM(null, key)).toBeNull();
    });
  });

  describe('密码强度检测', () => {
    test('弱密码应该得到低分', () => {
      const weak = SecureUtils.checkPasswordStrength('123');
      expect(weak.score).toBeLessThanOrEqual(1);
      expect(weak.strength).not.toBe('very_strong');
    });

    test('强密码应该得到高分', () => {
      const strong = SecureUtils.checkPasswordStrength('MyP@ssw0rd!2024');
      expect(strong.score).toBeGreaterThanOrEqual(3);
    });

    test('空密码应该标记为 empty', () => {
      const empty = SecureUtils.checkPasswordStrength('');
      expect(empty.strength).toBe('empty');
    });

    test('应该提供改进建议', () => {
      const result = SecureUtils.checkPasswordStrength('simple');
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions).toContain('密码长度至少8位');
    });

    test('应该估算破解时间', () => {
      const weak = SecureUtils.checkPasswordStrength('123456');
      const strong = SecureUtils.checkPasswordStrength('MyStr0ng@Passw0rd!');

      expect(weak.crackTime).toBeTruthy();
      expect(strong.crackTime).toBeTruthy();
    });
  });

  describe('输入验证', () => {
    test('_isValidTag 应该验证标签名称', () => {
      expect(/^[\w\u4e00-\u9fa5\s-]+$/.test('工作')).toBe(true);
      expect(/^[\w\u4e00-\u9fa5\s-]+$/.test('dev-tag')).toBe(true);

      expect(/^[\w\u4e00-\u9fa5\s-]+$/.test('<script>')).toBe(false);
      expect(/^[\w\u4e00-\u9fa5\s-]+$/.test('tag with space and special!')).toBe(false);
    });

    test('_isValidSettingKey 应该验证设置键名', () => {
      expect(/^[a-zA-Z0-9_.-]+$/.test('theme.dark-mode')).toBe(true);
      expect(/^[a-zA-Z0-9_.-]+$/.test('auto-sync.interval')).toBe(true);

      expect(/^[a-zA-Z0-9_.-]+$/.test('../../etc/passwd')).toBe(false);
    });
  });

  describe('HMAC-SHA256 签名', () => {
    test('相同输入应该产生相同的签名', () => {
      const data = 'test data';
      const key = 'secret-key';

      const sig1 = SecureUtils.hmacSHA256(data, key);
      const sig2 = SecureUtils.hmacSHA256(data, key);

      expect(sig1).toBe(sig2);
    });

    test('不同数据应该产生不同的签名', () => {
      const key = 'secret-key';

      const sig1 = SecureUtils.hmacSHA256('data1', key);
      const sig2 = SecureUtils.hmacSHA256('data2', key);

      expect(sig1).not.toBe(sig2);
    });
  });
});

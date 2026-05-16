/**
 * Database 相似度算法优化测试
 * 直接测试算法逻辑，不依赖完整 Database 实例
 */

// 复制优化后的算法逻辑（与 Database.js 保持同步）
// 这样可以避免 Electron/SQL 依赖问题

// 单行数组优化的 Levenshtein 距离
function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array(a.length + 1);
  for (let j = 0; j <= a.length; j++) prev[j] = j;

  for (let i = 1; i <= b.length; i++) {
    const curr = new Array(a.length + 1);
    curr[0] = i;
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        curr[j] = prev[j - 1];
      } else {
        curr[j] = 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
      }
    }
    prev = curr;
  }
  return prev[a.length];
}

const SIMILARITY_MAX_LEN = 256;

// 带预过滤和截断的相似度计算
function similarity(a, b) {
  if (a == null || b == null) return 0;

  const maxLen = Math.max(a.length, b.length);
  const minLen = Math.min(a.length, b.length);
  if (maxLen === 0) return 1;

  // 快速路径：长度差异过大
  const lenRatio = minLen / maxLen;
  if (lenRatio < 0.5) return 0;

  // 截断长文本
  const ta = a.length > SIMILARITY_MAX_LEN ? a.substring(0, SIMILARITY_MAX_LEN) : a;
  const tb = b.length > SIMILARITY_MAX_LEN ? b.substring(0, SIMILARITY_MAX_LEN) : b;

  const dist = levenshteinDistance(ta, tb);
  const truncMax = Math.max(ta.length, tb.length);
  return truncMax === 0 ? 1 : 1 - dist / truncMax;
}

describe('相似度算法优化', () => {
  describe('levenshteinDistance 单行数组优化', () => {
    test('相同字符串距离为 0', () => {
      expect(levenshteinDistance('abc', 'abc')).toBe(0);
    });

    test('空字符串处理', () => {
      expect(levenshteinDistance('', 'abc')).toBe(3);
      expect(levenshteinDistance('abc', '')).toBe(3);
      expect(levenshteinDistance('', '')).toBe(0);
    });

    test('单字符替换距离为 1', () => {
      expect(levenshteinDistance('abc', 'xbc')).toBe(1);
    });

    test('插入和删除', () => {
      expect(levenshteinDistance('abc', 'ab')).toBe(1);
      expect(levenshteinDistance('ab', 'abc')).toBe(1);
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    });

    test('长文本不抛异常', () => {
      const longA = 'a'.repeat(500);
      const longB = 'a'.repeat(500) + 'b';
      expect(levenshteinDistance(longA, longB)).toBe(1);
    });

    test('与经典实现结果一致', () => {
      const pairs = [
        ['', '', 0],
        ['a', '', 1],
        ['', 'abc', 3],
        ['abc', 'abc', 0],
        ['abc', 'def', 3],
        ['kitten', 'sitting', 3],
        ['flaw', 'lawn', 2],
        ['intention', 'execution', 5],
      ];
      for (const [a, b, expected] of pairs) {
        expect(levenshteinDistance(a, b)).toBe(expected);
      }
    });
  });

  describe('similarity 预过滤和截断优化', () => {
    test('完全相同返回 1', () => {
      expect(similarity('hello', 'hello')).toBe(1);
    });

    test('空字符串处理', () => {
      expect(similarity('', '')).toBe(1);
      expect(similarity('abc', '')).toBe(0);
      expect(similarity('', 'abc')).toBe(0);
    });

    test('长度差异过大时快速返回 0（预过滤）', () => {
      expect(similarity('a', 'b'.repeat(1000))).toBe(0);
      expect(similarity('short', 'very long text that goes on and on')).toBe(0);
    });

    test('长度差异超过 50% 时返回 0', () => {
      // minLen/maxLen = 5/11 ≈ 0.45 < 0.5
      expect(similarity('hello', 'hello world!')).toBe(0);
    });

    test('截断后计算：前 256 字相同', () => {
      const a = 'x'.repeat(256) + 'different_tail_a';
      const b = 'x'.repeat(256) + 'different_tail_b';
      expect(similarity(a, b)).toBe(1); // 截断后完全相同
    });

    test('截断后检测差异', () => {
      const a = 'x'.repeat(256);
      const b = 'y'.repeat(256);
      expect(similarity(a, b)).toBe(0);
    });

    test('短文本正常工作', () => {
      const sim = similarity('hello world', 'hello world!');
      expect(sim).toBeGreaterThan(0.9);
    });

    test('null/undefined 处理', () => {
      expect(similarity(null, 'abc')).toBe(0);
      expect(similarity('abc', null)).toBe(0);
      expect(similarity(undefined, undefined)).toBe(0);
    });

    test('中等长度文本精度', () => {
      const a = 'const x = 1 + 2;';
      const b = 'const x = 1 + 3;';
      const sim = similarity(a, b);
      expect(sim).toBeGreaterThan(0.8);
      expect(sim).toBeLessThan(1);
    });
  });

  describe('性能验证', () => {
    test('长文本截断后计算速度在可接受范围内', () => {
      const longText = 'a'.repeat(5000);
      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        similarity(longText, longText.substring(0, 5000 - i));
      }
      const elapsed = performance.now() - start;
      // 100 次计算应在 500ms 内完成（截断后实际只比较 256 字符）
      expect(elapsed).toBeLessThan(500);
    });

    test('预过滤跳过大幅提升性能', () => {
      const shortText = 'abc';
      const longText = 'x'.repeat(5000);
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        similarity(shortText, longText);
      }
      const elapsed = performance.now() - start;
      // 1000 次预过滤跳过应在 10ms 内完成
      expect(elapsed).toBeLessThan(10);
    });
  });
});

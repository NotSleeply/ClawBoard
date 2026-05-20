/**
 * LRUCache 单元测试
 */

const LRUCache = require('../LRUCache');

describe('LRUCache', () => {
  let cache;

  beforeEach(() => {
    cache = new LRUCache(3);
  });

  describe('基础操作', () => {
    test('应该正确设置和获取值', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    test('不存在的键应返回 undefined', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    test('应该检查键是否存在', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
    });

    test('应该删除键', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.delete('nonexistent')).toBe(false);
    });

    test('应该清空缓存', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.size).toBe(0);
    });
  });

  describe('LRU 淘汰策略', () => {
    test('当超过容量时应淘汰最久未使用的项', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // 访问 a, 使其变为最近使用
      cache.get('a');

      // 添加新项, 应该淘汰 b (最久未使用)
      cache.set('d', 4);

      // a 应该还在 (最近访问过)
      expect(cache.get('a')).toBe(1);
      // b 应该被淘汰
      expect(cache.get('b')).toBeUndefined();
      // c 和 d 应该在
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
    });

    test('容量应为 maxSize', () => {
      const smallCache = new LRUCache(2);
      smallCache.set('x', 10);
      smallCache.set('y', 20);
      expect(smallCache.size).toBe(2);

      // 超出容量, 自动淘汰
      smallCache.set('z', 30);
      expect(smallCache.size).toBe(2);
    });
  });

  describe('getOrSet 方法', () => {
    test('如果键不存在应调用工厂函数', () => {
      const factory = jest.fn().mockReturnValue('computed');
      const result = cache.getOrSet('newKey', factory);

      expect(factory).toHaveBeenCalledTimes(1);
      expect(result).toBe('computed');
      expect(cache.get('newKey')).toBe('computed');
    });

    test('如果键已存在不应调用工厂函数', () => {
      cache.set('existingKey', 'cached');
      const factory = jest.fn().mockReturnValue('should-not-be-called');
      const result = cache.getOrSet('existingKey', factory);

      expect(factory).not.toHaveBeenCalled();
      expect(result).toBe('cached');
    });
  });

  describe('访问更新顺序', () => {
    test('get 操作应该更新项的访问时间', () => {
      cache.set('first', 1);
      cache.set('second', 2);
      cache.set('third', 3);

      // 访问 first, 使其变为最近使用
      cache.get('first');

      // 添加第四个, 应该淘汰 second (不是 first)
      cache.set('fourth', 4);

      expect(cache.get('first')).toBe(1); // first 还在
      expect(cache.get('second')).toBeUndefined(); // second 被淘汰
    });
  });

  describe('边界情况', () => {
    test('应该处理空值和 undefined', () => {
      cache.set('null', null);
      cache.set('undefined', undefined);

      expect(cache.has('null')).toBe(true);
      expect(cache.has('undefined')).toBe(true);
      expect(cache.get('null')).toBeNull();
      expect(cache.get('undefined')).toBeUndefined();
    });

    test('应该处理大容量缓存', () => {
      const largeCache = new LRUCache(1000);
      for (let i = 0; i < 1000; i++) {
        largeCache.set(`key${i}`, `value${i}`);
      }
      expect(largeCache.size).toBe(1000);

      // 添加一个, 应淘汰最早的
      largeCache.set('new', 'new');
      expect(largeCache.size).toBe(1000);
      expect(largeCache.get('key0')).toBeUndefined();
      expect(largeCache.get('key999')).toBe('value999');
    });

    test('覆盖已存在的键不应该增加大小', () => {
      cache.set('same', 'first');
      cache.set('same', 'updated');
      expect(cache.size).toBe(1);
      expect(cache.get('same')).toBe('updated');
    });
  });
});

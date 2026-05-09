/**
 * ClawBoard - LRU (Least Recently Used) Cache 实现
 * 用于缓存频繁访问的数据，提升性能
 */

class LRUCache {
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.cache = new Map(); // Map 保持插入顺序，便于实现LRU
  }

  /**
   * 获取缓存值
   * @param {string} key - 缓存键
   * @returns {*} - 缓存值，不存在返回 undefined
   */
  get(key) {
    if (!this.cache.has(key)) return undefined;

    // 访问后移到末尾（最近使用）
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);

    return value;
  }

  /**
   * 设置缓存值
   * @param {string} key - 缓存键
   * @param {*} value - 缓存值
   */
  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // 删除最久未使用的项（Map的第一个元素）
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, value);
  }

  /**
   * 检查键是否存在
   * @param {string} key - 缓存键
   * @returns {boolean}
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * 删除缓存项
   * @param {string} key - 缓存键
   * @returns {boolean} - 是否删除成功
   */
  delete(key) {
    return this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear() {
    this.cache.clear();
  }

  /**
   * 获取当前缓存大小
   * @returns {number}
   */
  get size() {
    return this.cache.size;
  }

  /**
   * 获取或设置（如果不存在则调用工厂函数）
   * @param {string} key - 缓存键
   * @param {Function} factory - 值工厂函数
   * @returns {*}
   */
  getOrSet(key, factory) {
    if (this.has(key)) {
      return this.get(key);
    }

    const value = factory();
    this.set(key, value);
    return value;
  }
}

module.exports = LRUCache;
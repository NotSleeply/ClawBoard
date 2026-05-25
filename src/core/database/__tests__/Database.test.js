import { describe, test, expect, afterEach } from 'vitest';
import Database from '../Database.js';

describe('Database', () => {
  let db;
  let tmpDir;

  afterEach(() => {
    if (db && typeof db.close === 'function') {
      db.close();
    }
    if (tmpDir) {
      try { require('fs').rmSync(tmpDir, { recursive: true, force: true }); } catch { }
    }
  });

  function createTmpDir(suffix = '') {
    const os = require('os');
    const path = require('path');
    tmpDir = path.join(os.tmpdir(), `clawboard-test-${suffix}-${Date.now()}`);
    require('fs').mkdirSync(tmpDir, { recursive: true });
    return tmpDir;
  }

  function addTestRecord(database, overrides = {}) {
    return database.addRecord({
      type: 'text',
      content: 'Hello Test',
      summary: 'Hello Test',
      source: 'clipboard',
      ...overrides
    });
  }

  test('Database 模块应存在', () => {
    expect(Database).toBeDefined();
  });

  test('Database 应该具有核心方法', () => {
    const dbInstance = new Database('/mock/path');
    expect(typeof dbInstance._init).toBe('function');
    expect(typeof dbInstance.addRecord).toBe('function');
    expect(typeof dbInstance.getRecords).toBe('function');
    expect(typeof dbInstance.clearAllRecords).toBe('function');
    expect(typeof dbInstance.deleteRecord).toBe('function');
    expect(typeof dbInstance.getStats).toBe('function');
  });

  test('Database 初始化后可以添加和查询记录', async () => {
    db = new Database(createTmpDir('add'));
    await db._initPromise;

    addTestRecord(db);
    const records = db.getRecords({ limit: 10 });
    expect(records.length).toBe(1);
    expect(records[0].content).toBe('Hello Test');
  });

  test('Database clearAllRecords 应该清空所有记录', async () => {
    db = new Database(createTmpDir('clear'));
    await db._initPromise;

    addTestRecord(db, { content: 'record 1', summary: 'record 1' });
    addTestRecord(db, { content: 'record 2', summary: 'record 2' });
    addTestRecord(db, { content: 'record 3', summary: 'record 3' });

    expect(db.getRecords({ limit: 10 }).length).toBe(3);

    db.clearAllRecords();
    expect(db.getRecords({ limit: 10 }).length).toBe(0);
  });

  test('Database deleteRecord 应该删除指定记录', async () => {
    db = new Database(createTmpDir('del'));
    await db._initPromise;

    addTestRecord(db, { content: 'to be deleted', summary: 'to be deleted' });
    const allRecords = db.getRecords({ limit: 10 });
    expect(allRecords.length).toBe(1);

    const targetId = allRecords[0].id;
    const beforeDelete = db.getRecord(targetId);
    expect(beforeDelete).not.toBeNull();

    db.deleteRecord(targetId, true);

    const afterDelete = db.getRecord(targetId);
    expect(afterDelete).toBeNull();

    expect(db.getRecords({ limit: 10 }).length).toBe(0);
  });

  test('Database getStats 应该返回统计信息', async () => {
    db = new Database(createTmpDir('stats'));
    await db._initPromise;

    addTestRecord(db, { content: 'stats test', summary: 'stats test' });
    const stats = db.getStats();
    expect(stats).toBeDefined();
  });

  test('Database 添加代码类型记录', async () => {
    db = new Database(createTmpDir('code'));
    await db._initPromise;

    addTestRecord(db, { type: 'code', content: 'const x = 1;', summary: 'const x = 1;', language: 'javascript' });
    const records = db.getRecords({ limit: 10 });
    expect(records.length).toBe(1);
    expect(records[0].type).toBe('code');
  });

  test('Database 搜索记录', async () => {
    db = new Database(createTmpDir('search'));
    await db._initPromise;

    addTestRecord(db, { content: 'Hello World', summary: 'Hello World' });
    addTestRecord(db, { content: 'Goodbye Moon', summary: 'Goodbye Moon' });

    const results = db.searchRecords({ search: 'Hello' });
    expect(results.length).toBe(1);
    expect(results[0].content).toBe('Hello World');
  });

  test('Database toggleFavorite 应该切换收藏状态', async () => {
    db = new Database(createTmpDir('fav'));
    await db._initPromise;

    addTestRecord(db, { content: 'favorite me', summary: 'favorite me' });
    const records = db.getRecords({ limit: 10 });
    const id = records[0].id;

    db.toggleFavorite(id);
    const updated = db.getRecord(id);
    expect(updated.favorite).toBe(1);
  });

  test('Database updateNote 应该更新备注', async () => {
    db = new Database(createTmpDir('note'));
    await db._initPromise;

    addTestRecord(db, { content: 'note test', summary: 'note test' });
    const records = db.getRecords({ limit: 10 });
    const id = records[0].id;

    db.updateNote(id, 'my note');
    const updated = db.getRecord(id);
    expect(updated.note).toBe('my note');
  });

  test('Database 软删除记录应该移入回收站', async () => {
    db = new Database(createTmpDir('softdel'));
    await db._initPromise;

    addTestRecord(db, { content: 'soft delete test', summary: 'soft delete test' });
    const records = db.getRecords({ limit: 10 });
    const id = records[0].id;

    db.deleteRecord(id, false);
    expect(db.getRecords({ limit: 10 }).length).toBe(0);
  });

  test('Database 创建和查询分组', async () => {
    db = new Database(createTmpDir('groups'));
    await db._initPromise;

    db.createGroup('Work', '#3b82f6', '💼');
    const groups = db.getAllGroups();
    expect(groups.length).toBe(1);
    expect(groups[0].name).toBe('Work');
  });

  test('Database 删除分组', async () => {
    db = new Database(createTmpDir('delgroup'));
    await db._initPromise;

    db.createGroup('Temp', '#ff0000', '📁');
    const groups = db.getAllGroups();
    expect(groups.length).toBe(1);

    db.deleteGroup(groups[0].id);
    expect(db.getAllGroups().length).toBe(0);
  });

  test('Database 添加标签', async () => {
    db = new Database(createTmpDir('tags'));
    await db._initPromise;

    const record = addTestRecord(db, { content: 'tagged item', summary: 'tagged item' });
    db.addTag(record.id, 'important');
    db.addTag(record.id, 'work');

    const updated = db.getRecord(record.id);
    const tags = JSON.parse(updated.tags || '[]');
    expect(tags).toContain('important');
    expect(tags).toContain('work');
  });

  test('Database 大内容应该被压缩', async () => {
    db = new Database(createTmpDir('compress'));
    await db._initPromise;

    const longContent = 'a'.repeat(2000);
    addTestRecord(db, { content: longContent, summary: 'long content' });
    const records = db.getRecords({ limit: 10 });
    expect(records.length).toBe(1);
    expect(records[0].compressed).toBe(1);
  });
});

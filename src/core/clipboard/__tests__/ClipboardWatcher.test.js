import { describe, test, expect, afterEach, vi } from 'vitest';
import ClipboardWatcher from '../ClipboardWatcher.js';

describe('ClipboardWatcher', () => {
  let watcher;

  afterEach(() => {
    if (watcher && typeof watcher.stop === 'function') {
      watcher.stop();
    }
  });

  test('ClipboardWatcher 模块应存在', () => {
    expect(ClipboardWatcher).toBeDefined();
  });

  test('ClipboardWatcher 可以实例化并具有核心方法', () => {
    const watcherInstance = new ClipboardWatcher();
    expect(typeof watcherInstance.start).toBe('function');
    expect(typeof watcherInstance.stop).toBe('function');
    expect(typeof watcherInstance._check).toBe('function');
    expect(typeof watcherInstance._handleText).toBe('function');
    expect(typeof watcherInstance._isCode).toBe('function');
    expect(typeof watcherInstance._isFilePath).toBe('function');
    expect(typeof watcherInstance._detectLanguage).toBe('function');
    expect(typeof watcherInstance._generateSummary).toBe('function');
  });

  test('start 后应该启动轮询', () => {
    const mockDb = { addRecord: vi.fn(), getRecords: vi.fn().mockReturnValue([]) };
    const mockClipboard = { readText: vi.fn().mockReturnValue('hello') };
    const mockLog = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
    watcher = new ClipboardWatcher(mockDb, mockClipboard, mockLog);
    watcher.start();
    expect(mockLog.info).toHaveBeenCalledWith('剪贴板监控已启动');
    expect(watcher.interval).not.toBeNull();
  });

  test('stop 应该停止轮询', () => {
    const mockDb = { addRecord: vi.fn(), getRecords: vi.fn().mockReturnValue([]) };
    const mockClipboard = { readText: vi.fn().mockReturnValue('text') };
    const mockLog = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
    watcher = new ClipboardWatcher(mockDb, mockClipboard, mockLog);
    watcher.start();
    watcher.stop();
    expect(watcher.interval).toBeNull();
  });

  test('_check 检测到新文本应该调用 _handleText', () => {
    const mockDb = { addRecord: vi.fn(), getRecords: vi.fn().mockReturnValue([]) };
    const mockClipboard = { readText: vi.fn().mockReturnValue('new text') };
    const mockLog = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
    watcher = new ClipboardWatcher(mockDb, mockClipboard, mockLog);
    watcher.lastText = 'old text';

    const handleSpy = vi.spyOn(watcher, '_handleText');
    watcher._check();
    expect(handleSpy).toHaveBeenCalledWith('new text');
  });

  test('_check 重复文本不应该调用 _handleText', () => {
    const mockDb = { addRecord: vi.fn(), getRecords: vi.fn().mockReturnValue([]) };
    const mockClipboard = { readText: vi.fn().mockReturnValue('same text') };
    const mockLog = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
    watcher = new ClipboardWatcher(mockDb, mockClipboard, mockLog);
    watcher.lastText = 'same text';

    const handleSpy = vi.spyOn(watcher, '_handleText');
    watcher._check();
    expect(handleSpy).not.toHaveBeenCalled();
  });

  test('_check 空文本不应该调用 _handleText', () => {
    const mockDb = { addRecord: vi.fn(), getRecords: vi.fn().mockReturnValue([]) };
    const mockClipboard = { readText: vi.fn().mockReturnValue('') };
    const mockLog = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
    watcher = new ClipboardWatcher(mockDb, mockClipboard, mockLog);
    watcher.lastText = '';

    const handleSpy = vi.spyOn(watcher, '_handleText');
    watcher._check();
    expect(handleSpy).not.toHaveBeenCalled();
  });

  test('_check readText 抛出异常不应该崩溃', () => {
    const mockDb = { addRecord: vi.fn(), getRecords: vi.fn().mockReturnValue([]) };
    const mockClipboard = { readText: vi.fn().mockImplementation(() => { throw new Error('read error'); }) };
    const mockLog = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
    watcher = new ClipboardWatcher(mockDb, mockClipboard, mockLog);
    watcher.lastText = '';

    expect(() => watcher._check()).not.toThrow();
    expect(mockLog.error).toHaveBeenCalled();
  });

  test('_isCode 应该识别代码', () => {
    const mockDb = { addRecord: vi.fn(), getRecords: vi.fn().mockReturnValue([]) };
    const mockClipboard = { readText: vi.fn() };
    const mockLog = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
    watcher = new ClipboardWatcher(mockDb, mockClipboard, mockLog);

    expect(watcher._isCode('const x = 1;')).toBe(true);
    expect(watcher._isCode('function hello() {}')).toBe(true);
    expect(watcher._isCode('import os')).toBe(true);
    expect(watcher._isCode('hello world')).toBe(false);
  });

  test('_isFilePath 应该识别文件路径', () => {
    const mockDb = { addRecord: vi.fn(), getRecords: vi.fn().mockReturnValue([]) };
    const mockClipboard = { readText: vi.fn() };
    const mockLog = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
    watcher = new ClipboardWatcher(mockDb, mockClipboard, mockLog);

    expect(watcher._isFilePath('C:\\Users\\test\\file.txt')).toBe(true);
    expect(watcher._isFilePath('/home/user/file.txt')).toBe(true);
    expect(watcher._isFilePath('~/Documents/file.txt')).toBe(true);
    expect(watcher._isFilePath('just some text')).toBe(false);
  });

  test('_detectLanguage 应该识别编程语言', () => {
    const mockDb = { addRecord: vi.fn(), getRecords: vi.fn().mockReturnValue([]) };
    const mockClipboard = { readText: vi.fn() };
    const mockLog = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
    watcher = new ClipboardWatcher(mockDb, mockClipboard, mockLog);

    expect(watcher._detectLanguage('const x = 1;')).toBe('javascript');
    expect(watcher._detectLanguage('def hello():')).toBe('python');
    expect(watcher._detectLanguage('<html><body>')).toBe('html');
    expect(watcher._detectLanguage('SELECT * FROM users')).toBe('sql');
  });

  test('_generateSummary 应该生成摘要', () => {
    const mockDb = { addRecord: vi.fn(), getRecords: vi.fn().mockReturnValue([]) };
    const mockClipboard = { readText: vi.fn() };
    const mockLog = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
    watcher = new ClipboardWatcher(mockDb, mockClipboard, mockLog);

    expect(watcher._generateSummary('short')).toBe('short');
    const longText = 'a'.repeat(200);
    const summary = watcher._generateSummary(longText);
    expect(summary.length).toBeLessThan(longText.length);
    expect(summary.endsWith('...')).toBe(true);
  });

  test('_processText 应该调用 db.addRecord', async () => {
    const mockDb = { addRecord: vi.fn(), getRecords: vi.fn().mockReturnValue([]) };
    const mockClipboard = { readText: vi.fn() };
    const mockLog = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
    watcher = new ClipboardWatcher(mockDb, mockClipboard, mockLog, null);

    watcher._processText('Hello World');
    await new Promise(r => setTimeout(r, 50));

    expect(mockDb.addRecord).toHaveBeenCalled();
    const call = mockDb.addRecord.mock.calls[0][0];
    expect(call.content).toBe('Hello World');
    expect(call.source).toBe('clipboard');
  });

  test('setCurrentSource 应该更新来源信息', () => {
    const mockDb = { addRecord: vi.fn(), getRecords: vi.fn().mockReturnValue([]) };
    const mockClipboard = { readText: vi.fn() };
    const mockLog = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
    watcher = new ClipboardWatcher(mockDb, mockClipboard, mockLog);

    watcher.setCurrentSource({ app: 'Chrome', title: 'Google' });
    expect(watcher.currentSource.app).toBe('Chrome');
    expect(watcher.currentSource.title).toBe('Google');
  });
});

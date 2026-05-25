import { describe, test, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';
import os from 'os';

const cliPath = path.resolve(import.meta.dirname, '..', 'index.js');

function runCli(args) {
  try {
    const result = execSync(`node "${cliPath}" ${args}`, {
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, HOME: os.homedir() }
    });
    return { stdout: result, exitCode: 0 };
  } catch (err) {
    return { stdout: err.stdout || '', stderr: err.stderr || '', exitCode: err.status };
  }
}

describe('BoardClip CLI', () => {
  test('--help 应该输出帮助信息', () => {
    const result = runCli('--help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('board-clip');
    expect(result.stdout).toContain('list');
    expect(result.stdout).toContain('search');
    expect(result.stdout).toContain('stats');
    expect(result.stdout).toContain('copy');
    expect(result.stdout).toContain('delete');
  });

  test('--version 应该输出版本号', () => {
    const result = runCli('--version');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
  });

  test('list 命令应该正常执行', () => {
    const result = runCli('list');
    expect(result.exitCode).toBe(0);
  });

  test('list --limit 5 应该正常执行', () => {
    const result = runCli('list --limit 5');
    expect(result.exitCode).toBe(0);
  });

  test('list --type text 应该正常执行', () => {
    const result = runCli('list --type text');
    expect(result.exitCode).toBe(0);
  });

  test('list --favorite 应该正常执行', () => {
    const result = runCli('list --favorite');
    expect(result.exitCode).toBe(0);
  });

  test('stats 命令应该输出统计信息', () => {
    const result = runCli('stats');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('BoardClip');
  });

  test('stats --detailed 应该输出详细统计', () => {
    const result = runCli('stats --detailed');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('总记录数');
  });

  test('groups 命令应该正常执行', () => {
    const result = runCli('groups');
    expect(result.exitCode).toBe(0);
  });

  test('groups --create 应该创建分组', () => {
    const result = runCli('groups --create TestGroup');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('已创建分组');
  });

  test('tags 命令应该正常执行', () => {
    const result = runCli('tags');
    expect(result.exitCode).toBe(0);
  });

  test('search 命令应该正常执行', () => {
    const result = runCli('search "test query"');
    expect(result.exitCode).toBe(0);
  });

  test('config 命令应该正常执行', () => {
    const result = runCli('config');
    expect(result.exitCode).toBe(0);
  });

  test('backup --list 应该正常执行', () => {
    const result = runCli('backup --list');
    expect(result.exitCode).toBe(0);
  });

  test('watch --status 应该正常执行', () => {
    const result = runCli('watch --status');
    expect(result.exitCode).toBe(0);
  });

  test('delete 不存在的记录应该报错', () => {
    const result = runCli('delete nonexistent-id');
    expect(result.exitCode).not.toBe(0);
  });

  test('copy 不存在的记录应该报错', () => {
    const result = runCli('copy nonexistent-id');
    expect(result.exitCode).not.toBe(0);
  });

  test('encrypt 不存在的记录应该报错', () => {
    const result = runCli('encrypt nonexistent-id');
    expect(result.exitCode).not.toBe(0);
  });

  test('decrypt 不存在的记录应该报错', () => {
    const result = runCli('decrypt nonexistent-id');
    expect(result.exitCode).not.toBe(0);
  });

  test('import 不存在的文件应该报错', () => {
    const result = runCli('import nonexistent-file.json');
    expect(result.exitCode).not.toBe(0);
  });

  test('clear --help 应该显示帮助', () => {
    const result = runCli('clear --help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('清空');
  });
});

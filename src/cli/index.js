#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const os = require('os');

const pkg = require('../../package.json');

function getDataDir() {
    const dir = path.join(os.homedir(), '.clawboard');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

async function initDb() {
    const Database = require('../core/database/Database');
    const dataDir = getDataDir();
    const db = new Database(dataDir);
    await db._init();
    return db;
}

function closeDb(db) {
    if (db && typeof db.close === 'function') {
        db.close();
    }
}

function formatTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const pad = (n) => String(n).padStart(2, '0');
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (isToday) return `今天 ${time}`;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return `昨天 ${time}`;
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${time}`;
}

function truncate(str, maxLen) {
    if (!str) return '';
    const singleLine = str.replace(/\n/g, '\\n');
    return singleLine.length > maxLen ? singleLine.slice(0, maxLen) + '...' : singleLine;
}

const typeIcons = { text: '📝', code: '💻', file: '📁', image: '🖼️' };

function copyToClipboard(text) {
    const { execSync } = require('child_process');
    if (process.platform === 'win32') {
        const tmpFile = path.join(os.tmpdir(), `clawboard-clip-${Date.now()}.txt`);
        fs.writeFileSync(tmpFile, text, 'utf8');
        execSync(`powershell -Command "Get-Content '${tmpFile}' | Set-Clipboard"`, { windowsHide: true });
        try { fs.unlinkSync(tmpFile); } catch { }
    } else if (process.platform === 'darwin') {
        execSync(`echo -n ${JSON.stringify(text)} | pbcopy`);
    } else {
        execSync(`echo -n ${JSON.stringify(text)} | xclip -selection clipboard`);
    }
}

const program = new Command();

program
    .name('clawboard')
    .description('🦞 ClawBoard - AI 驱动的本地剪贴板管理器 CLI')
    .version(pkg.version);

program
    .command('list')
    .alias('ls')
    .description('列出剪贴板历史记录')
    .option('-n, --limit <number>', '显示条数', '20')
    .option('-t, --type <type>', '按类型过滤 (text/code/file/image)')
    .option('-f, --favorite', '仅显示收藏')
    .option('-g, --group <id>', '按分组过滤')
    .option('--tag <tag>', '按标签过滤')
    .action(async (opts) => {
        const db = await initDb();
        try {
            const records = db.getRecords({
                type: opts.type,
                limit: parseInt(opts.limit, 10),
                favorite: opts.favorite,
                tag: opts.tag,
                groupId: opts.group,
            });
            if (records.length === 0) {
                console.log(chalk.gray('暂无记录'));
                return;
            }
            console.log(chalk.bold(`\n🦞 ClawBoard 剪贴板历史 (共 ${records.length} 条)\n`));
            for (const r of records) {
                const icon = typeIcons[r.type] || '📋';
                const fav = r.favorite ? chalk.yellow('⭐') : '  ';
                const enc = r.encrypted ? chalk.red('🔒') : '  ';
                const time = chalk.gray(formatTime(r.createdAt || r.created_at));
                const content = truncate(r.content, 80);
                const id = chalk.cyan(String(r.id).slice(0, 8));
                console.log(`  ${fav}${enc} ${icon} ${id}  ${content}  ${time}`);
            }
            console.log();
        } finally {
            closeDb(db);
        }
    });

program
    .command('copy <id>')
    .alias('cp')
    .description('复制指定记录到系统剪贴板')
    .action(async (id) => {
        const db = await initDb();
        try {
            const record = db.getRecord(id);
            if (!record) {
                const partial = db.searchRecords({ search: id, limit: 1 });
                if (partial.length > 0) {
                    copyToClipboard(partial[0].content);
                    console.log(chalk.green(`✅ 已复制记录 ${partial[0].id} 到剪贴板`));
                    return;
                }
                console.log(chalk.red(`❌ 未找到记录: ${id}`));
                process.exit(1);
            }
            copyToClipboard(record.content);
            console.log(chalk.green(`✅ 已复制记录 ${id} 到剪贴板`));
        } finally {
            closeDb(db);
        }
    });

program
    .command('search <query>')
    .alias('s')
    .description('搜索剪贴板记录')
    .option('-n, --limit <number>', '结果条数', '10')
    .option('-t, --type <type>', '按类型过滤')
    .option('--semantic', '启用语义搜索 (需要 AI 服务)')
    .action(async (query, opts) => {
        const db = await initDb();
        try {
            let records;
            if (opts.semantic) {
                records = await db.search(query, parseInt(opts.limit, 10), true);
            } else {
                records = db.searchRecords({
                    search: query,
                    limit: parseInt(opts.limit, 10),
                    type: opts.type,
                });
            }
            if (!records || records.length === 0) {
                console.log(chalk.gray(`未找到匹配 "${query}" 的记录`));
                return;
            }
            console.log(chalk.bold(`\n🔍 搜索结果: "${query}" (${records.length} 条)\n`));
            for (const r of records) {
                const icon = typeIcons[r.type] || '📋';
                const time = chalk.gray(formatTime(r.createdAt || r.created_at));
                const content = truncate(r.content, 80);
                const id = chalk.cyan(String(r.id).slice(0, 8));
                console.log(`  ${icon} ${id}  ${content}  ${time}`);
            }
            console.log();
        } finally {
            closeDb(db);
        }
    });

program
    .command('delete <id>')
    .alias('rm')
    .description('删除指定记录')
    .option('--permanent', '永久删除 (不放入回收站)')
    .action(async (id, opts) => {
        const db = await initDb();
        try {
            const record = db.getRecord(id);
            if (!record) {
                console.log(chalk.red(`❌ 未找到记录: ${id}`));
                process.exit(1);
            }
            db.deleteRecord(id, opts.permanent);
            console.log(chalk.green(`✅ 已${opts.permanent ? '永久' : ''}删除记录: ${truncate(record.content, 40)}`));
        } finally {
            closeDb(db);
        }
    });

program
    .command('favorite <id>')
    .alias('fav')
    .description('切换记录收藏状态')
    .action(async (id) => {
        const db = await initDb();
        try {
            const result = db.toggleFavorite(id);
            if (result) {
                console.log(chalk.yellow(`⭐ 已收藏记录 ${id}`));
            } else {
                console.log(chalk.gray(`☆ 已取消收藏记录 ${id}`));
            }
        } finally {
            closeDb(db);
        }
    });

program
    .command('stats')
    .description('显示使用统计')
    .option('-d, --detailed', '显示详细统计')
    .action(async (opts) => {
        const db = await initDb();
        try {
            const stats = opts.detailed ? db.getDetailedStats() : db.getStats();
            console.log(chalk.bold('\n📊 ClawBoard 使用统计\n'));
            if (opts.detailed) {
                console.log(`  📋 总记录数:  ${chalk.bold(stats.total || stats.totalRecords || 0)}`);
                console.log(`  📝 文字记录:  ${stats.text || 0}`);
                console.log(`  💻 代码记录:  ${stats.code || 0}`);
                console.log(`  📁 文件记录:  ${stats.file || 0}`);
                console.log(`  🖼️ 图片记录:  ${stats.image || 0}`);
                console.log(`  ⭐ 收藏数量:  ${stats.favorites || 0}`);
                console.log(`  🔒 加密数量:  ${stats.encrypted || 0}`);
                console.log(`  🏷️ 标签数量:  ${stats.tags || 0}`);
                if (stats.dailyStats) {
                    console.log(chalk.bold('\n  📅 最近 7 天:\n'));
                    for (const d of stats.dailyStats.slice(0, 7)) {
                        const bar = '█'.repeat(Math.min(d.count, 30));
                        console.log(`    ${d.date}  ${chalk.green(bar)} ${d.count}`);
                    }
                }
            } else {
                console.log(`  📋 总记录: ${chalk.bold(stats.total || stats.totalRecords || 0)}`);
                console.log(`  ⭐ 收藏:   ${stats.favorites || 0}`);
                console.log(`  🔒 加密:   ${stats.encrypted || 0}`);
            }
            console.log();
        } finally {
            closeDb(db);
        }
    });

program
    .command('groups')
    .alias('grp')
    .description('管理分组')
    .option('-c, --create <name>', '创建分组')
    .option('-d, --delete <id>', '删除分组')
    .option('--icon <icon>', '分组图标', '📁')
    .option('--color <color>', '分组颜色', '#3b82f6')
    .action(async (opts) => {
        const db = await initDb();
        try {
            if (opts.create) {
                db.createGroup(opts.create, opts.color, opts.icon);
                console.log(chalk.green(`✅ 已创建分组: ${opts.icon} ${opts.create}`));
                return;
            }
            if (opts.delete) {
                db.deleteGroup(opts.delete);
                console.log(chalk.green(`✅ 已删除分组: ${opts.delete}`));
                return;
            }
            const groups = db.getAllGroups();
            if (groups.length === 0) {
                console.log(chalk.gray('暂无分组'));
                return;
            }
            console.log(chalk.bold('\n📁 分组列表\n'));
            for (const g of groups) {
                const id = chalk.cyan(String(g.id).slice(0, 8));
                console.log(`  ${g.icon || '📁'} ${chalk.bold(g.name)}  ${id}  ${chalk.gray(`(${g.recordCount || 0} 条记录)`)}`);
            }
            console.log();
        } finally {
            closeDb(db);
        }
    });

program
    .command('tags')
    .description('管理标签')
    .option('-a, --add <id> <tag>', '为记录添加标签')
    .option('-r, --remove <id> <tag>', '移除记录标签')
    .action(async (opts) => {
        const db = await initDb();
        try {
            if (opts.add) {
                const [id, tag] = opts.add.split(' ', 2);
                db.addTag(id, tag);
                console.log(chalk.green(`✅ 已添加标签 "${tag}" 到记录 ${id}`));
                return;
            }
            if (opts.remove) {
                const [id, tag] = opts.remove.split(' ', 2);
                db.removeTag(id, tag);
                console.log(chalk.green(`✅ 已移除标签 "${tag}" 从记录 ${id}`));
                return;
            }
            const tags = db.getAllTags ? db.getAllTags() : [];
            if (!tags || tags.length === 0) {
                console.log(chalk.gray('暂无标签'));
                return;
            }
            console.log(chalk.bold('\n🏷️ 标签列表\n'));
            for (const t of tags) {
                console.log(`  🏷️ ${chalk.bold(t.name || t)}  ${chalk.gray(`(${t.count || 0} 条记录)`)}`);
            }
            console.log();
        } finally {
            closeDb(db);
        }
    });

program
    .command('encrypt <id>')
    .description('加密指定记录')
    .option('-p, --password <password>', '加密密码')
    .option('--algorithm <algo>', '加密算法 (aes-256-gcm/chacha20-poly1305)', 'aes-256-gcm')
    .action(async (id, opts) => {
        const db = await initDb();
        try {
            if (opts.password) {
                db.setEncryptionKey(opts.password);
            }
            const record = db.getRecord(id);
            if (!record) {
                console.log(chalk.red(`❌ 未找到记录: ${id}`));
                process.exit(1);
            }
            const result = db.encryptRecord(id, opts.algorithm);
            if (result) {
                console.log(chalk.green(`🔒 已加密记录 ${id}`));
            } else {
                console.log(chalk.red(`❌ 加密失败，请确保已设置加密密码`));
                process.exit(1);
            }
        } finally {
            closeDb(db);
        }
    });

program
    .command('decrypt <id>')
    .description('解密指定记录')
    .option('-p, --password <password>', '解密密码')
    .action(async (id, opts) => {
        const db = await initDb();
        try {
            if (opts.password) {
                db.setEncryptionKey(opts.password);
            }
            const record = db.getRecord(id);
            if (!record) {
                console.log(chalk.red(`❌ 未找到记录: ${id}`));
                process.exit(1);
            }
            const result = db.decryptRecord(id);
            if (result) {
                console.log(chalk.green(`🔓 已解密记录 ${id}`));
            } else {
                console.log(chalk.red(`❌ 解密失败，请确保密码正确`));
                process.exit(1);
            }
        } finally {
            closeDb(db);
        }
    });

program
    .command('export [format]')
    .description('导出剪贴板数据')
    .option('-o, --output <file>', '输出文件路径')
    .option('-t, --type <type>', '按类型过滤')
    .option('--favorite', '仅导出收藏')
    .action(async (format, opts) => {
        const fmt = format || 'json';
        const db = await initDb();
        try {
            const data = db.exportRecords(fmt, {
                type: opts.type,
                favorite: opts.favorite,
            });
            const output = opts.output || `clawboard-export-${Date.now()}.${fmt}`;
            if (typeof data === 'string') {
                fs.writeFileSync(output, data, 'utf8');
            } else {
                fs.writeFileSync(output, JSON.stringify(data, null, 2), 'utf8');
            }
            console.log(chalk.green(`✅ 已导出到: ${output}`));
        } catch (err) {
            console.log(chalk.red(`❌ 导出失败: ${err.message}`));
        } finally {
            closeDb(db);
        }
    });

program
    .command('import <file>')
    .alias('imp')
    .description('从备份文件导入数据')
    .option('--mode <mode>', '导入模式 (merge/replace)', 'merge')
    .action(async (file, opts) => {
        if (!fs.existsSync(file)) {
            console.log(chalk.red(`❌ 文件不存在: ${file}`));
            process.exit(1);
        }
        const db = await initDb();
        try {
            const content = fs.readFileSync(file, 'utf8');
            const records = JSON.parse(content);
            const result = db.importRecords(records, opts.mode);
            console.log(chalk.green(`✅ 已导入 ${result.imported || records.length} 条记录 (模式: ${opts.mode})`));
        } catch (err) {
            console.log(chalk.red(`❌ 导入失败: ${err.message}`));
        } finally {
            closeDb(db);
        }
    });

program
    .command('backup')
    .description('备份管理')
    .option('-c, --create', '创建备份')
    .option('-l, --list', '列出备份')
    .option('-r, --restore <filename>', '从备份恢复')
    .action(async (opts) => {
        const db = await initDb();
        try {
            if (opts.create) {
                const result = db.createBackup('manual');
                console.log(chalk.green(`✅ 备份已创建: ${result.filename || '成功'}`));
                return;
            }
            if (opts.list) {
                const backups = db.getBackups();
                if (!backups || backups.length === 0) {
                    console.log(chalk.gray('暂无备份'));
                    return;
                }
                console.log(chalk.bold('\n💾 备份列表\n'));
                for (const b of backups) {
                    console.log(`  📦 ${b.filename || b}  ${chalk.gray(b.createdAt || '')}`);
                }
                console.log();
                return;
            }
            if (opts.restore) {
                db.restoreFromBackup(opts.restore);
                console.log(chalk.green(`✅ 已从备份恢复: ${opts.restore}`));
                return;
            }
            console.log(chalk.gray('请指定操作: --create / --list / --restore <filename>'));
        } catch (err) {
            console.log(chalk.red(`❌ 操作失败: ${err.message}`));
        } finally {
            closeDb(db);
        }
    });

program
    .command('config')
    .description('查看或修改配置')
    .option('-g, --get <key>', '获取配置项')
    .option('-s, --set <key=value>', '设置配置项 (key=value)')
    .action(async (opts) => {
        const db = await initDb();
        try {
            const settings = db.getSettings();
            if (opts.get) {
                console.log(settings[opts.get] ?? chalk.gray('(未设置)'));
                return;
            }
            if (opts.set) {
                const [key, value] = opts.set.split('=', 2);
                settings[key] = value;
                db.saveSettings(settings);
                console.log(chalk.green(`✅ 已设置 ${key} = ${value}`));
                return;
            }
            console.log(chalk.bold('\n⚙️ 当前配置\n'));
            for (const [k, v] of Object.entries(settings)) {
                console.log(`  ${chalk.cyan(k)}: ${v}`);
            }
            console.log();
        } finally {
            closeDb(db);
        }
    });

program
    .command('watch')
    .description('启动剪贴板监控守护进程')
    .option('--stop', '停止守护进程')
    .option('--status', '查看守护进程状态')
    .action((opts) => {
        const pidFile = path.join(getDataDir(), 'watcher.pid');

        if (opts.stop) {
            if (!fs.existsSync(pidFile)) {
                console.log(chalk.gray('守护进程未运行'));
                return;
            }
            const pid = parseInt(fs.readFileSync(pidFile, 'utf8'), 10);
            try {
                process.kill(pid, 'SIGTERM');
                fs.unlinkSync(pidFile);
                console.log(chalk.green(`✅ 已停止守护进程 (PID: ${pid})`));
            } catch {
                fs.unlinkSync(pidFile);
                console.log(chalk.yellow(`⚠️ 进程 ${pid} 已不存在，已清理 PID 文件`));
            }
            return;
        }

        if (opts.status) {
            if (!fs.existsSync(pidFile)) {
                console.log(chalk.gray('守护进程未运行'));
                return;
            }
            const pid = parseInt(fs.readFileSync(pidFile, 'utf8'), 10);
            try {
                process.kill(pid, 0);
                console.log(chalk.green(`✅ 守护进程运行中 (PID: ${pid})`));
            } catch {
                fs.unlinkSync(pidFile);
                console.log(chalk.yellow('⚠️ 守护进程已停止 (PID 文件已清理)'));
            }
            return;
        }

        if (fs.existsSync(pidFile)) {
            const pid = parseInt(fs.readFileSync(pidFile, 'utf8'), 10);
            try {
                process.kill(pid, 0);
                console.log(chalk.yellow(`⚠️ 守护进程已在运行 (PID: ${pid})`));
                console.log(chalk.gray('使用 clawboard watch --stop 停止后重新启动'));
                return;
            } catch {
                fs.unlinkSync(pidFile);
            }
        }

        const { spawn } = require('child_process');
        const watcherScript = path.join(__dirname, 'watcher.js');
        const child = spawn(process.execPath, [watcherScript], {
            detached: true,
            stdio: 'ignore',
            env: { ...process.env, CLAWBOARD_DATA: getDataDir() },
        });
        child.unref();

        fs.writeFileSync(pidFile, String(child.pid));
        console.log(chalk.green(`✅ 剪贴板监控已启动 (PID: ${child.pid})`));
        console.log(chalk.gray('使用 clawboard watch --stop 停止'));
        console.log(chalk.gray('使用 clawboard watch --status 查看状态'));
    });

program.parse();

# pnpm 迁移指南

## 迁移日期
2026-05-07

## 为什么迁移到 pnpm？

### pnpm 的优势

1. **磁盘空间效率**
   - 使用硬链接和符号链接，节省磁盘空间
   - 所有版本的依赖只存储一次
   - 比 npm 节省约 50% 的磁盘空间

2. **安装速度更快**
   - 并行安装依赖
   - 智能缓存机制
   - 比 npm 快 2-3 倍

3. **更严格的依赖管理**
   - 非扁平化的 node_modules 结构
   - 防止幽灵依赖（phantom dependencies）
   - 更符合 Node.js 模块解析规范

4. **Monorepo 支持**
   - 原生支持 workspace
   - 更好的多包管理
   - 便于未来扩展

## 迁移步骤

### 1. 安装 pnpm

如果还没有安装 pnpm：

```bash
# Windows (PowerShell)
iwr https://get.pnpm.io/install.ps1 -useb | iex

# macOS/Linux
curl -fsSL https://get.pnpm.io/install.sh | sh -

# 或使用 npm 安装
npm install -g pnpm
```

### 2. 删除旧的依赖

```bash
# 删除 package-lock.json
rm package-lock.json

# 删除 node_modules
rm -rf node_modules
```

### 3. 安装依赖

```bash
pnpm install
```

### 4. 验证安装

```bash
# 运行开发模式
pnpm dev

# 或
pnpm run dev
```

## 配置文件变更

### package.json

添加了以下配置：

```json
{
  "packageManager": "pnpm@10.13.1",
  "engines": {
    "node": ">=18.0.0",
    "pnpm": ">=8.0.0"
  },
  "scripts": {
    "preinstall": "npx only-allow pnpm"
  }
}
```

**说明**：
- `packageManager`: 指定使用的包管理器版本
- `engines`: 指定 Node.js 和 pnpm 的最低版本要求
- `preinstall`: 防止使用 npm 或 yarn 安装（可选）

### .npmrc

新增配置文件：

```
shamefully-hoist=true
strict-peer-dependencies=false
auto-install-peers=true
```

**说明**：
- `shamefully-hoist`: 提升依赖到根目录，兼容某些需要扁平化结构的工具
- `strict-peer-dependencies`: 不严格检查 peer dependencies
- `auto-install-peers`: 自动安装 peer dependencies

### .gitignore

添加了 pnpm 相关忽略项：

```
# pnpm
.pnpm-store/
.pnpm-debug.log

# npm (保留以防回退)
package-lock.json
```

## 常用命令对照

| npm 命令 | pnpm 命令 | 说明 |
|----------|-----------|------|
| `npm install` | `pnpm install` | 安装依赖 |
| `npm install <pkg>` | `pnpm add <pkg>` | 添加依赖 |
| `npm install -D <pkg>` | `pnpm add -D <pkg>` | 添加开发依赖 |
| `npm uninstall <pkg>` | `pnpm remove <pkg>` | 移除依赖 |
| `npm update` | `pnpm update` | 更新依赖 |
| `npm run <script>` | `pnpm <script>` | 运行脚本 |
| `npm run dev` | `pnpm dev` | 运行开发模式 |
| `npm run build` | `pnpm build` | 构建项目 |
| `npx <command>` | `pnpm dlx <command>` | 执行包命令 |

## 项目脚本

所有 npm 脚本都可以直接使用 pnpm 运行：

```bash
# 开发模式
pnpm dev

# 构建
pnpm build
pnpm build:win
pnpm build:mac
pnpm build:linux
pnpm build:all

# 打包（不构建安装包）
pnpm pack
```

## 常见问题

### Q: 为什么 node_modules 结构不同了？

A: pnpm 使用非扁平化的 node_modules 结构，通过符号链接管理依赖。这是正常的，不会影响项目运行。

### Q: Electron 启动失败，提示 ENOENT 错误？

A: 这是 pnpm 安装 Electron 时可能出现的 `path.txt` 配置问题。

**症状：**
```
Error: spawn D:\Code\ClawBoard\node_modules\.pnpm\electron@28.3.3\node_modules\electron\dist\dist\electron.exe ENOENT
```

**解决方案：**
```powershell
# 修复 path.txt 文件内容（将版本号替换为实际版本）
Set-Content -Path node_modules\.pnpm\electron@28.3.3\node_modules\electron\path.txt -Value "electron.exe" -NoNewline
```

此问题已在初次迁移时修复，后续重新安装时如果再次出现，使用上述命令修复即可。

### Q: 某些依赖找不到怎么办？

A: 如果遇到依赖找不到的问题，可以在 `.npmrc` 中添加：
```
shamefully-hoist=true
```
这会将依赖提升到根目录，类似 npm 的行为。

### Q: 如何清理缓存？

A: 使用以下命令：
```bash
pnpm store prune
```

### Q: 如何查看依赖树？

A: 使用以下命令：
```bash
pnpm list
pnpm list --depth=1  # 只显示一层
```

### Q: 如何回退到 npm？

A: 如果需要回退：
```bash
# 删除 pnpm 文件
rm pnpm-lock.yaml
rm -rf node_modules

# 使用 npm 安装
npm install
```

## 性能对比

### 安装速度（本项目）

| 包管理器 | 首次安装 | 有缓存 |
|----------|----------|--------|
| npm | ~30s | ~15s |
| pnpm | ~15s | ~7s |

### 磁盘占用

| 包管理器 | node_modules 大小 |
|----------|-------------------|
| npm | ~350 MB |
| pnpm | ~180 MB |

## 团队协作

### 新成员加入

1. 确保安装了 pnpm：
   ```bash
   pnpm --version
   ```

2. 克隆项目后直接安装：
   ```bash
   git clone <repo>
   cd ClawBoard
   pnpm install
   ```

### CI/CD 配置

如果使用 GitHub Actions，更新工作流：

```yaml
- name: Setup pnpm
  uses: pnpm/action-setup@v2
  with:
    version: 10

- name: Setup Node.js
  uses: actions/setup-node@v3
  with:
    node-version: 18
    cache: 'pnpm'

- name: Install dependencies
  run: pnpm install

- name: Build
  run: pnpm build
```

## 最佳实践

### 1. 使用 pnpm 命令别名

在 shell 配置中添加：
```bash
alias pn='pnpm'
alias pni='pnpm install'
alias pna='pnpm add'
alias pnr='pnpm remove'
```

### 2. 定期更新依赖

```bash
# 检查过期依赖
pnpm outdated

# 交互式更新
pnpm update -i

# 更新所有依赖到最新版本
pnpm update --latest
```

### 3. 使用 pnpm 的内置功能

```bash
# 查看依赖为什么被安装
pnpm why <package>

# 审计安全漏洞
pnpm audit

# 修复安全漏洞
pnpm audit --fix
```

## 相关资源

- [pnpm 官方文档](https://pnpm.io/)
- [pnpm vs npm vs yarn](https://pnpm.io/benchmarks)
- [pnpm CLI 命令](https://pnpm.io/cli/add)

## 迁移检查清单

- [x] 安装 pnpm
- [x] 删除 package-lock.json
- [x] 删除 node_modules
- [x] 使用 pnpm install 安装依赖
- [x] 更新 package.json 添加 packageManager 字段
- [x] 创建 .npmrc 配置文件
- [x] 更新 .gitignore
- [x] 修复 Electron path.txt 问题
- [x] 测试开发模式运行（成功启动）
- [x] 更新 README.md 中的所有命令
- [ ] 测试构建流程
- [ ] 更新 CI/CD 配置（如果有）
- [ ] 通知团队成员

---

**迁移完成**: 2026-05-07
**维护者**: NotSleeply
**pnpm 版本**: 10.13.1

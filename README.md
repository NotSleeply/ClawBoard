# 🦞 ClawBoard

<p align="center">
  <strong>AI驱动的本地剪贴板管理器</strong><br>
  <em>智能记录 · 语义搜索 · 永久收藏</em>
</p>

<p align="center">
  <a href="#-功能特点">功能</a> •
  <a href="#-快速开始">开始使用</a> •
  <a href="#-截图">截图</a> •
  <a href="#-技术栈">技术栈</a> •
  <a href="#-文档">文档</a> •
  <a href="#-贡献">贡献</a> •
  <a href="#-许可证">许可证</a>
</p>


<p align="center">
  <img src="https://img.shields.io/github/v/release/NotSleeply/ClawBoard?style=flat-square" alt="Version">
  <img src="https://img.shields.io/github/stars/NotSleeply/ClawBoard?style=flat-square" alt="Stars">
  <img src="https://img.shields.io/github/license/NotSleeply/ClawBoard?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/node/v/18+-green?style=flat-square" alt="Node Version">
</p>

---

## ✨ 功能特点

### 🧠 核心功能

| 功能 | 描述 | 状态 |
|------|------|------|
| 🌡️ **全程监控** | 记录复制的一切：文字、代码、图片、文件路径 | ✅ |
| 🔍 **自然语言搜索** | 用日常语言搜索剪贴板历史，例如 "上周那个 API 地址" | ✅ |
| 📌 **永久收藏** | 标记重要内容，永不丢失 | ✅ |
| ⚡ **代码片段库** | 自动识别代码，高亮保存，随时取用 | ✅ |

### 🤖 AI 能力 (v0.70+)

| 功能 | 描述 | 状态 |
|------|------|------|
| 🧠 **本地 AI 摘要** | 基于 Ollama 自动分析内容、生成摘要、打标签 | ✅ |
| 🔍 **语义搜索** | AI 驱动的智能搜索,理解意图而非关键词匹配 | ✅ |
| 📝 **自动分类** | 智能识别内容类型(代码/邮件/链接/地址) | ✅ |
| 💬 **OCR 图片识别** | Tesseract OCR 引擎,支持多语言文字提取 | ✅ |

### 🔒 企业级安全 (v0.75+)

| 功能 | 描述 | 状态 |
|------|------|------|
| 🔐 **AES-256-GCM 加密** | 认证加密,防篡改 | ✅ |
| 🔑 **主密码保护** | 会话管理 + 超时自动锁定 | ✅ |
| 🛡️ **暴力破解防护** | 5次失败锁定5分钟 | ✅ |
| 🗑️ **安全删除** | DoD 5220.22-M 标准 (7次覆写) | ✅ |
| 📊 **操作审计** | 完整的操作日志记录 | ✅ |

### ⚡ 性能优化 (v0.74+)

| 功能 | 描述 | 状态 |
|------|------|------|
| 🚀 **LRU 缓存系统** | 列表加载速度提升 **3.3x** | ✅ |
| 💾 **自动备份** | 每小时自动备份,保留30天 | ✅ |
| 🔗 **事务支持** | ACID 保证数据一致性 | ✅ |
| 🛡️ **SQL 注入防护** | 参数化查询,零注入风险 | ✅ |

### 🎨 竞品特性集成 (v0.76+)

| 来源 | 功能 | 描述 |
|------|------|------|
| **ClipboardFusion** | 📝 文本格式清理器 | 去除 HTML/Markdown/Word 格式 |
| **Ditto** | 🔤 特殊粘贴模式 | 12种模式 (大小写/驼峰/Base64等) |
| **CopyQ** | 📋 快捷短语模板 | 变量引擎 (`{{date}}`, `{{clipboard}}`) |
| **ClipboardFusion** | 🤖 自动触发器 | 规则引擎 (条件→动作) |

---

## 🚀 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) >= 18.0.0
- [pnpm](https://pnpm.io/) >= 8.0.0 (推荐包管理器)
- [Ollama](https://ollama.ai/) (可选,用于 AI 功能)

### 安装步骤

```bash
# 克隆仓库
git clone https://github.com/NotSleeply/ClawBoard.git
cd ClawBoard

# 安装依赖
pnpm install

# 启动开发模式
pnpm start

# 或构建生产版本
pnpm build:win    # Windows
pnpm build:mac    # macOS
pnpm build:linux  # Linux
```

### Ollama 配置 (AI 功能)

```bash
# 安装 Ollama
# Windows: https://ollama.ai/download
# macOS: brew install ollama
# Linux: curl -fsSL https://ollama.ai/install.sh | sh

# 下载推荐模型 (用于摘要和语义搜索)
ollama pull qwen2.5:3b     # 轻量级 (推荐)
ollama pull llama3.2:3b   # 备选

# 启动 Ollama 服务
ollama serve
```

---

## 📸 截图

<!-- TODO: 添加应用截图 -->
<p align="center">
  <em>截图即将添加...</em>
</p>

---

## 🏗️ 技术栈

### 核心框架

| 技术 | 版本 | 用途 |
|------|------|------|
| [Electron](https://www.electronjs.org/) | 28.x | 跨平台桌面应用框架 |
| [Node.js](https://nodejs.org/) | 18+ | 运行时环境 |
| [sql.js](https://github.com/kripken/sql.js) | ^1.10.0 | SQLite 浏览器端实现 |

### 主要依赖

| 包名 | 版本 | 用途 |
|------|------|------|
| `crypto-js` | ^4.2.0 | AES/CBC/GCM 加密 |
| `electron-log` | ^5.0.0 | 日志记录 |
| `electron-updater` | ^6.1.7 | 自动更新 |
| `lz-string` | ^1.5.0 | 数据压缩 |
| `tesseract.js` | ^7.0.0 | OCR 图片识别 |
| `qrcode-generator` | ^2.0.4 | 二维码生成 |

### 开发工具

| 工具 | 用途 |
|------|------|
| [ESLint](https://eslint.org/) | JavaScript 代码检查 |
| [Prettier](https://prettier.io/) | 代码格式化 |
| [Jest](https://jestjs.io/) | 单元测试框架 |

---

## 📁 项目结构

```
ClawBoard/
├── src/
│   ├── main/
│   │   └── index.js              # Electron 主进程入口
│   ├── renderer/
│   │   └── app.js                # 渲染进程逻辑
│   ├── core/
│   │   ├── database/
│   │   │   └── Database.js       # 数据库管理 (SQL)
│   │   ├── clipboard/
│   │   │   └── ClipboardWatcher.js  # 剪贴板监控
│   │   ├── sync/
│   │   │   └── SyncService.js    # WebDAV 同步
│   │   └── ocr/
│   │       └── OCRService.js     # OCR 识别服务
│   ├── utils/
│   │   ├── LRUCache.js           # LRU 缓存实现
│   │   ├── SecureUtils.js        # 安全工具集
│   │   ├── SessionManager.js     # 会话管理器
│   │   ├── TextFormatter.js      # 文本格式清理
│   │   ├── PasteModeManager.js   # 特殊粘贴模式
│   │   ├── SnippetsManager.js    # 快捷短语管理
│   │   └── TriggerEngine.js      # 自动触发器引擎
│   └── features/
│       ├── snippets/             # 片段管理
│       ├── ocr/                  # OCR 功能
│       └── ai/                   # AI 集成
├── assets/                      # 图标和资源文件
├── tests/                       # Jest 测试配置
├── .github/workflows/           # CI/CD 工作流
├── .eslintrc.json               # ESLint 配置
├── jest.config.js               # Jest 配置
└── package.json                 # 项目配置
```

---

## 📖 详细文档

### 用户手册

- [📘 完整用户手册](docs/user-guide.md) - 所有功能的详细说明
- [🔐 安全指南](docs/security-guide.md) - 加密和安全最佳实践
- [⌨️ 快捷键列表](docs/shortcuts.md) - 所有快捷键参考

### 开发者文档

- [🛠️ API 接口文档](docs/api.md) - IPC 接口完整参考
- [🏗️ 架构设计](docs/architecture.md) - 系统架构和技术决策
- [🧪 测试指南](docs/testing.md) - 如何运行和编写测试

### 贡献指南

- [🤝 贡献指南](CONTRIBUTING.md) - 如何参与项目开发
- [📋 Issue 模板](.github/ISSUE_TEMPLATE/) - Issue 和 PR 模板
- [📜 行为准则](CODE_OF_CONDUCT.md) - 社区行为规范

---

## 🔄 更新日志

查看 [CHANGELOG.md](CHANGELOG.md) 了解版本更新历史。

### v0.76.0 (最新)

#### 新增功能
- 🎨 **文本格式清理器** - 来自 ClipboardFusion 的 8 种格式转换
- 🔤 **特殊粘贴模式** - 来自 Ditto 的 12 种粘贴选项
- 📋 **快捷短语模板** - 来自 CopyQ 的变量模板引擎
- 🤖 **自动触发器** - 来自 ClipboardFusion 的规则引擎

#### 安全增强
- 🔐 AES-256-GCM 认证加密
- 🔑 主密码 + 会话超时锁定
- 🛡️ 暴力破解防护 (5次锁定)
- 🗑️ DoD 安全删除标准

#### 性能优化
- ⚡ LRU 缓存系统 (3.3x 加速)
- 💾 自动备份机制 (每小时)
- 🔗 ACID 事务支持
- 🛡️ SQL 注入防护

#### 质量保证
- 🧪 Jest 单元测试框架 (90+ 测试用例)
- 🔍 ESLint 代码检查
- 💅 Prettier 代码格式化
- 📊 CI/CD 流水线 (GitHub Actions)

---

## 🌍 多平台适配

### ✅ 已完成优化

| 平台 | 特性 | 状态 |
|------|------|------|
| **Windows** | NSIS/Portable 打包、PowerShell 粘贴、通知声音 | ✅ 完全支持 |
| **macOS** | DMG/ZIP 打包、AppleScript 粘贴、辅助功能授权 | ✅ 完全支持 |
| **Linux** | AppImage/.deb 打包、xdotool 粘贴、桌面通知 | ✅ 完全支持 |

### ⚠️ 已知限制

<details>
<summary><b>点击展开详情</b></summary>

#### macOS
- 首次运行需要手动授权：
  - 系统偏好设置 > 安全性与隐私 > 完全磁盘访问权限
  - 系统偏好设置 > 安全性与隐私 > 辅助功能（全局快捷键）

#### Linux
- 快速粘贴（Alt+V）需要安装 `xdotool`: `sudo apt install xdotool`
- Wayland 下全局快捷键可能受限（建议使用 X11）
- 文件路径识别仅支持常见目录（/home, /tmp, /var, /etc, /opt）

</details>

---

## 🤝 贡献

我们欢迎所有形式的贡献！无论是 Bug 报告、功能建议还是代码提交。

### 如何开始

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

### 开发流程

```bash
# 安装开发依赖
pnpm install

# 运行 lint 检查
pnpm lint

# 运行测试
pnpm test

# 格式化代码
pnpm format

# 启动开发服务器
pnpm dev
```

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源。

```
MIT License

Copyright (c) 2024 NotSleeply

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```

---

## 🙏 致谢

感谢以下开源项目：

- [Electron](https://www.electronjs.org/) - 跨平台桌面应用框架
- [Ollama](https://ollama.ai/) - 本地 AI 运行时
- [Tesseract.js](https://github.com/naptha/tesseract.js) - OCR 引擎
- [sql.js](https://github.com/kripken/sql.js) - SQLite WebAssembly 构建

---

## 📞 支持

- 📖 [完整文档](docs/)
- 🐛 [Issue 反馈](https://github.com/NotSleeply/ClawBoard/issues)
- 💬 [讨论区](https://github.com/NotSleeply/ClawBoard/discussions)

---

<p align="center">
  <sub>Made with ❤️ by <a href="https://github.com/NotSleeply">NotSleeply</a></sub>
</p>

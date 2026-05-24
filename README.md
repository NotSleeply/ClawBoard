# 🦞 ClawBoard CLI

<p align="center">
  <strong>AI驱动的本地剪贴板管理器 CLI</strong><br>
  <em>智能记录 · 语义搜索 · 永久收藏</em>
</p>

<p align="center">
  <a href="#-功能特点">功能</a> •
  <a href="#-快速开始">开始使用</a> •
  <a href="#-技术栈">技术栈</a> •
  <a href="#-文档">文档</a> •
  <a href="#-贡献">贡献</a> •
  <a href="#-许可证">许可证</a>
</p>

<p align="center">
  <img src="https://img.shields.io/github/v/release/NotSleeply/ClawBoard?style=flat-square" alt="Version">
  <img src="https://img.shields.io/github/stars/NotSleeply/ClawBoard?style=flat-square" alt="Stars">
  <img src="https://img.shields.io/github/license/NotSleeply/ClawBoard?style=flat-square&label=License" alt="License">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/node/v/18+-green?style=flat-square" alt="Node Version">
</p>

---

## ✨ 功能特点

### 🧠 核心功能

| 功能                | 描述                                               | 状态 |
| ------------------- | -------------------------------------------------- | ---- |
| 🌡️ **全程监控**     | 记录复制的一切：文字、代码、图片、文件路径         | ✅   |
| 🔍 **自然语言搜索** | 用日常语言搜索剪贴板历史，例如 "上周那个 API 地址" | ✅   |
| 📌 **永久收藏**     | 标记重要内容，永不丢失                             | ✅   |
| ⚡ **代码片段库**   | 自动识别代码，高亮保存，随时取用                   | ✅   |

### 🤖 AI 能力 (v0.70+)

| 功能                | 描述                                       | 状态 |
| ------------------- | ------------------------------------------ | ---- |
| 🧠 **本地 AI 摘要** | 基于 Ollama 自动分析内容、生成摘要、打标签 | ✅   |
| 🔍 **语义搜索**     | AI 驱动的智能搜索,理解意图而非关键词匹配   | ✅   |
| 📝 **自动分类**     | 智能识别内容类型(代码/邮件/链接/地址)      | ✅   |
| 💬 **OCR 图片识别** | Tesseract OCR 引擎,支持多语言文字提取      | ✅   |

### 🔒 企业级安全 (v0.75+)

| 功能                    | 描述                         | 状态 |
| ----------------------- | ---------------------------- | ---- |
| 🔐 **AES-256-GCM 加密** | 认证加密,防篡改              | ✅   |
| 🔑 **主密码保护**       | 会话管理 + 超时自动锁定      | ✅   |
| 🛡️ **暴力破解防护**     | 5次失败锁定5分钟             | ✅   |
| 🗑️ **安全删除**         | DoD 5220.22-M 标准 (7次覆写) | ✅   |
| 📊 **操作审计**         | 完整的操作日志记录           | ✅   |

### ⚡ 性能优化 (v0.74+)

| 功能                | 描述                      | 状态 |
| ------------------- | ------------------------- | ---- |
| 🚀 **LRU 缓存系统** | 列表加载速度提升 **3.3x** | ✅   |
| 💾 **自动备份**     | 每小时自动备份,保留30天   | ✅   |
| 🔗 **事务支持**     | ACID 保证数据一致性       | ✅   |
| 🛡️ **SQL 注入防护** | 参数化查询,零注入风险     | ✅   |

---

## 📖 详细文档

### 用户手册

- [📘 完整用户手册](docs/user-guide.md) - 所有功能的详细说明
- [🔐 安全指南](docs/security-guide.md) - 加密和安全最佳实践

### 开发者文档

- [🏗️ 架构设计](docs/architecture.md) - 系统架构和技术决策
- [🧪 测试指南](docs/testing.md) - 如何运行和编写测试

### 贡献指南

- [🤝 贡献指南](docs/CONTRIBUTING.md) - 如何参与项目开发
- [📋 Issue 模板](.github/ISSUE_TEMPLATE/) - Issue 和 PR 模板
- [📜 行为准则](docs/CODE_OF_CONDUCT.md) - 社区行为规范

---

## 🔄 更新日志

查看 [CHANGELOG.md](docs/CHANGELOG.md) 了解版本更新历史。

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

| 平台        | 特性                      | 状态        |
| ----------- | ------------------------- | ----------- |
| **Windows** | PowerShell 粘贴、通知声音 | ✅ 完全支持 |
| **macOS**   | pbcopy 粘贴               | ✅ 完全支持 |
| **Linux**   | xclip 粘贴                | ✅ 完全支持 |

### ⚠️ 已知限制

<details>
<summary><b>点击展开详情</b></summary>

#### Linux

- 需要安装 `xclip`: `sudo apt install xclip`
- 文件路径识别仅支持常见目录（/home, /tmp, /var, /etc, /opt）

</details>

---

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
```

## 目录结构

```
src/
├── cli/                    # CLI 入口和命令
│   ├── index.js           # CLI 主入口
│   └── watcher.js         # 剪贴板监控守护进程
│
├── core/                   # 核心功能模块
│   ├── database/           # 数据库相关
│   │   └── Database.js     # 数据库管理类
│   ├── clipboard/          # 剪贴板相关
│   │   └── ClipboardWatcher.js
│   ├── ai/                 # AI 相关
│   │   └── AIService.js
│   └── sync/               # 同步相关
│       └── SyncService.js
│
├── features/               # 功能模块
│   ├── snippets/           # 代码片段
│   │   └── SnippetsManager.js
│   ├── ocr/                # OCR 文字识别
│   │   └── OCRService.js
│   ├── rules/              # 规则引擎
│   │   └── RuleEngine.js
│   └── insights/           # 洞察分析
│       └── InsightsService.js
│
└── utils/                  # 工具函数
    ├── platform.js         # 跨平台抽象
    ├── text-transform.js   # 文本转换
    ├── hotkey-templates.js # 快捷键模板
    ├── ignore-rules.js     # 忽略规则
    ├── auto-categorize.js  # 自动分类
    ├── smart-paste.js      # 智能粘贴
    ├── SessionManager.js   # 会话管理
    ├── SecureUtils.js      # 安全工具
    ├── TextFormatter.js    # 文本格式化
    ├── PasteModeManager.js # 粘贴模式管理
    ├── SnippetsManager.js  # 片段管理
    ├── TriggerEngine.js    # 触发引擎
    └── LRUCache.js         # LRU 缓存
```

## 模块说明

### CLI (cli/)

- **index.js**: CLI 主入口，提供所有命令行命令
- **watcher.js**: 剪贴板监控守护进程

### 核心模块 (core/)

- **database/**: 数据库操作，使用 sql.js 实现
- **clipboard/**: 剪贴板监控和处理
- **ai/**: AI 功能，包括摘要生成、语义搜索等
- **sync/**: 数据同步功能

### 功能模块 (features/)

- **snippets/**: 快捷片段管理
- **ocr/**: 图片文字识别
- **rules/**: 自动化规则引擎
- **insights/**: 智能洞察和分析

### 工具模块 (utils/)

通用工具函数和辅助类

## 可用命令

```bash
clawboard list              # 列出剪贴板历史
clawboard copy <id>         # 复制指定记录到剪贴板
clawboard search <query>    # 搜索剪贴板记录
clawboard delete <id>       # 删除指定记录
clawboard favorite <id>     # 切换收藏状态
clawboard stats             # 显示使用统计
clawboard groups            # 管理分组
clawboard tags              # 管理标签
clawboard encrypt <id>      # 加密指定记录
clawboard decrypt <id>      # 解密指定记录
clawboard export [format]   # 导出数据
clawboard import <file>     # 导入数据
clawboard backup            # 备份管理
clawboard config            # 查看或修改配置
clawboard watch             # 启动监控守护进程
```

详见 [CONTRIBUTING.md](docs/CONTRIBUTING.md)。

---

## 📄 许可证

本项目基于 [PolyForm Noncommercial License 1.0.0](LICENSE) 开源，**禁止商业用途**。

允许个人学习、研究、非营利组织使用。如需商用，请联系作者获取授权。

## 📞 支持

- 📖 [完整文档](docs/)
- 🐛 [Issue 反馈](https://github.com/NotSleeply/ClawBoard/issues)
- 💬 [讨论区](https://github.com/NotSleeply/ClawBoard/discussions)

---

<p align="center">
  <sub>Made with ❤️ by <a href="https://github.com/NotSleeply">NotSleeply</a></sub>
</p>

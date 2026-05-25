# 🦞 BoardClip

<p align="center">
  <strong>AI 驱动的本地剪贴板管理器 CLI</strong><br>
  <em>智能记录 · 语义搜索 · 永久收藏</em>
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/board-clip?style=flat-square" alt="npm">
  <img src="https://img.shields.io/npm/dt/board-clip?style=flat-square" alt="Downloads">
  <img src="https://img.shields.io/github/license/NotSleeply/ClawBoard?style=flat-square&label=License" alt="License">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/node/v/18+-green?style=flat-square" alt="Node Version">
</p>

---

## 安装

```bash
npm install -g board-clip
```

> 需要 Node.js >= 18

## 快速上手

```bash
# 启动剪贴板监控（后台守护进程）
board-clip watch

# 查看剪贴板历史
board-clip list

# 搜索记录
board-clip search "API 地址"

# 复制某条记录到剪贴板
board-clip copy <id>

# 停止监控
board-clip watch --stop
```

## 命令参考

| 命令                         | 别名  | 说明                     |
| ---------------------------- | ----- | ------------------------ |
| `board-clip list`            | `ls`  | 列出剪贴板历史记录       |
| `board-clip copy <id>`       | `cp`  | 复制指定记录到系统剪贴板 |
| `board-clip search <query>`  | `s`   | 搜索剪贴板记录           |
| `board-clip delete <id>`     | `rm`  | 删除指定记录             |
| `board-clip favorite <id>`   | `fav` | 切换记录收藏状态         |
| `board-clip stats`           |       | 显示使用统计             |
| `board-clip groups`          | `grp` | 管理分组                 |
| `board-clip tags`            |       | 管理标签                 |
| `board-clip encrypt <id>`    |       | 加密指定记录             |
| `board-clip decrypt <id>`    |       | 解密指定记录             |
| `board-clip export [format]` |       | 导出数据（json/csv/md）  |
| `board-clip import <file>`   | `imp` | 从备份文件导入数据       |
| `board-clip backup`          |       | 备份管理                 |
| `board-clip config`          |       | 查看或修改配置           |
| `board-clip watch`           |       | 启动剪贴板监控守护进程   |
| `board-clip watch --stop`    |       | 停止监控守护进程         |

## 功能特点

### 🧠 核心能力

- **剪贴板监控** — 后台守护进程，自动记录所有复制内容
- **自然语言搜索** — 用日常语言搜索历史，如 "上周那个 API 地址"
- **永久收藏** — 标记重要内容，永不丢失
- **代码片段库** — 自动识别代码，随时取用

### 🤖 AI 能力（需 [Ollama](https://ollama.ai)）

- **本地 AI 摘要** — 自动分析内容、生成摘要、打标签
- **语义搜索** — AI 驱动的智能搜索，理解意图而非关键词匹配
- **自动分类** — 智能识别内容类型（代码/邮件/链接/地址）

### 🔒 安全

- **AES-256-GCM 加密** — 认证加密，防篡改
- **主密码保护** — 会话管理 + 超时自动锁定
- **暴力破解防护** — 5 次失败锁定 5 分钟
- **安全删除** — DoD 5220.22-M 标准（7 次覆写）

### 🌍 多平台

| 平台        | 状态        | 备注                                     |
| ----------- | ----------- | ---------------------------------------- |
| **Windows** | ✅ 完全支持 | PowerShell 剪贴板交互                    |
| **macOS**   | ✅ 完全支持 | pbcopy / pbpaste                         |
| **Linux**   | ✅ 完全支持 | 需安装 `xclip`：`sudo apt install xclip` |

<details>
<summary><b>开发相关</b></summary>

### 开发

```bash
git clone https://github.com/NotSleeply/ClawBoard.git
cd ClawBoard
pnpm install
pnpm test
node src/cli/index.js <command>
```

### 项目结构

```
src/
├── cli/              # CLI 入口和命令
├── core/             # 核心模块（数据库、剪贴板、AI）
├── features/         # 功能模块（片段、规则、洞察）
└── utils/            # 工具函数
```

</details>

---

## 📄 许可证

[PolyForm Noncommercial License 1.0.0](LICENSE) — **禁止商业用途**。

允许个人学习、研究、非营利组织使用。如需商用，请联系作者获取授权。

## 📞 支持

- 🐛 [Issue 反馈](https://github.com/NotSleeply/ClawBoard/issues)
- 💬 [讨论区](https://github.com/NotSleeply/ClawBoard/discussions)

---

<p align="center">
  <sub>Made with ❤️ by <a href="https://github.com/NotSleeply">NotSleeply</a></sub>
</p>

# 🦞 ClawBoard

> AI驱动的本地剪贴板管理器 — 智能记录、语义搜索、永久收藏

[![GitHub stars](https://img.shields.io/github/stars/NotSleeply/ClawBoard)](https://github.com/NotSleeply/ClawBoard)
[![License](https://img.shields.io/github/license/NotSleeply/ClawBoard)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-blue)](https://github.com/NotSleeply/ClawBoard)

---

## ✨ 功能特点

- 🌡️ **全程监控** — 记录复制的一切：文字、代码、图片、文件路径
- 🧠 **本地 AI** — 基于 Ollama 自动分析内容、生成摘要、打标签
- 🔍 **自然语言搜索** — 用日常语言搜索剪贴板历史，例如 "上周那个 API 地址"
- 📌 **永久收藏** — 标记重要内容，永不丢失
- ⚡ **代码片段库** — 自动识别代码，高亮保存，随时取用
- 🔒 **隐私优先** — 所有数据存储在本地，不上传任何服务器
- ⚡ **快速响应** — 即开即用，内存占用极低

---

## 🚀 快速开始

### 环境要求

- **Windows** 10/11
- [Node.js](https://nodejs.org/) 18+
- [Ollama](https://ollama.com/)（可选，用于 AI 摘要功能）

### 安装

```bash
# 克隆仓库
git clone https://github.com/NotSleeply/ClawBoard.git
cd ClawBoard

# 安装依赖
npm install

# 运行
npm start
```

### Ollama 配置（可选）

```bash
# 安装 Ollama
# 下载地址: https://ollama.com/download

# 拉取模型
ollama pull nomic-embed-text
ollama pull qwen2.5:3b
```

---

## 🗂️ 项目结构

```
ClawBoard/
├── src/
│   ├── main.js           # Electron 主进程
│   ├── preload.js        # 预加载脚本（安全桥接）
│   ├── clipboard.js      # 剪贴板监控核心
│   ├── database.js       # SQLite 数据库
│   ├── ai.js             # Ollama AI 集成
│   └── renderer/
│       ├── index.html    # 主界面
│       ├── styles.css    # 样式
│       └── app.js        # 渲染进程逻辑
├── assets/               # 图标等资源
├── docs/                 # 文档
├── package.json
├── README.md
└── LICENSE
```

---

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Electron |
| 数据库 | SQLite (better-sqlite3) |
| AI | Ollama (本地 LLM) |
| 前端 | 原生 HTML/CSS/JS |
| 构建 | electron-builder |

---

## 📝 更新日志

### v0.1.0 (2026-04-02)
- ✅ 完成基础项目框架搭建
- ✅ 实现剪贴板监控核心逻辑
- ✅ SQLite 数据持久化
- ✅ 基础 Web UI 界面
- ⏳ AI 摘要功能（开发中）
- ⏳ 自然语言搜索（开发中）

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📄 许可证

本项目采用 [MIT License](./LICENSE) 开源。

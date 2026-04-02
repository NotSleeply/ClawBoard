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

### v0.12.0 (2026-04-03)
- ✅ **内容预览面板** - 详情面板支持原文/预览模式切换
- ✅ **Markdown 渲染** - 自动识别 Markdown 内容，支持 GFM 语法渲染（标题、列表、代码块、表格、引用、任务列表等）
- ✅ **预览样式** - 适配深色/浅色主题

### v0.11.0 (2026-04-02)
- ✅ **快捷键自定义** - 设置中可修改全局快捷键

### v0.10.0 (2026-04-02)
- ✅ **文件拖拽** - 拖拽文件到窗口自动复制路径
- ✅ **键盘快捷键** - Delete/Enter/Esc 快速操作

### v0.9.0 (2026-04-02)
- ✅ **窗口置顶** - 托盘菜单切换窗口始终在最前
- ✅ **记录锁定** - 锁定记录不被自动清理

### v0.8.0 (2026-04-02)
- ✅ **快捷短语模板** - 模板列表管理，一键复制
- ✅ **自动清理** - 超出上限自动删除旧记录

### v0.7.0 (2026-04-02)
- ✅ **主题切换** - 支持浅色/深色模式

### v0.6.0 (2026-04-02)
- ✅ **开机自启动** - 开机自动运行，可设置开关

### v0.5.0 (2026-04-02)
- ✅ **全局快捷键** - Ctrl+Shift+V 快速调出/隐藏窗口
- ✅ **数据导出导入** - 支持 JSON/CSV 格式备份与恢复
- ✅ **历史记录去重** - 自动跳过连续重复内容

### v0.4.0 (2026-04-02)
- ✅ **代码片段库** - 自动识别编程语言，highlight.js 高亮显示
- ✅ **托盘图标优化** - 自定义托盘图标（非空白）
- ✅ **自然语言搜索** - 支持语义搜索

### v0.3.0 (2026-04-02)
- ✅ **自然语言搜索** - 支持语义搜索

### v0.2.0 (2026-04-02)
- ✅ **AI 摘要功能** - 自动调用 Ollama 生成智能摘要

### v0.1.0 (2026-04-02)
- ✅ 完成基础项目框架搭建

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📄 许可证

本项目采用 [MIT License](./LICENSE) 开源。

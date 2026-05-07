# 📝 更新日志

所有重要的版本更新都会记录在这里。

## [Unreleased]

### 🚧 开发中

- 向量语义搜索（基于 Ollama embeddings）
- 代码片段库 + 高亮
- 开机自启动
- 全局快捷键支持
- Windows exe 安装包构建

---

## [0.55.0] - 2026-04-30

### ✨ 新功能：模糊去重引擎

#### 核心功能

- 🧮 **MinHash 去重** - 纯 JS 实现的 MinHash 算法，无需外部依赖，检测近似重复文本
- 🎯 **双策略 findSimilar** - 编辑距离 + Token 级别重叠，精准找到"几乎一样"的内容
- 🧹 **自动清理** - 支持批量模糊去重，保留最新条目，自动跳过收藏/锁定记录
- 📊 **去重统计面板** - 提供模糊重复发现统计，含样本展示

#### 技术实现

- MurmurHash3-32 哈希函数作为 MinHash 基础
- 128 维签名，支持 0.75 Jaccard 阈值扫描
- 与现有精确去重（Levenshtein）形成互补，高效处理大规模数据

#### IPC 接口

- ind-fuzzy-duplicates: 扫描模糊重复对
- cleanup-fuzzy-duplicates: 批量清理模糊重复
- get-fuzzy-dedup-stats: 获取模糊去重统计

---

## [0.38.0] - 2026-04-17

## [0.38.0] - 2026-04-17

### ✨ 新功能：剪贴板条目内容编辑器

#### 核心功能

- ✏️ 双击条目或点击详情面板「编辑」按钮打开内容编辑器
- 📝 文字条目支持多行纯文本编辑
- 💻 代码条目自动关闭换行，等宽字体显示
- 💾 Ctrl+S 快速保存，Esc 关闭编辑器
- 📊 实时字符数/行数统计

#### 编辑器界面

- 标题栏显示条目类型和原始复制时间
- 自动换行开关（代码类型默认关闭）
- 保存后自动刷新列表和详情面板

#### 安全限制

- 加密条目需先解密才能编辑
- 图片条目暂不支持内容编辑
- 保存后保留收藏状态

#### 竞品参考

- CopyQ: 内置脚本编辑器
- Ditto: 内部编辑器（Bring back the internal editor for clips）
- Maccy: Settings 中可编辑 Pin 内容

## [0.1.0] - 2026-04-02

### ✨ 首次发布

#### 已完成

- ✅ 基础 Electron 应用框架
- ✅ 剪贴板监控核心（文字/代码/图片/文件路径）
- ✅ SQLite 本地数据库（sql.js，纯 JS 无需编译）
- ✅ FTS5 全文搜索
- ✅ 分类筛选（全部/文字/代码/文件/图片/收藏）
- ✅ 收藏与取消收藏
- ✅ Ollama AI 集成（摘要/标签生成）
- ✅ 现代深色主题 UI
- ✅ 系统托盘 + 右键菜单
- ✅ 窗口管理（最小化/关闭到托盘/双击托盘打开）
- ✅ 设置面板（最大历史数/Ollama 配置/AI 摘要开关/开机自启）
- ✅ 清空历史功能（保留收藏）
- ✅ GitHub 开源

#### 技术栈

- Electron 28
- sql.js (SQLite)
- Ollama (本地 LLM)
- 原生 HTML/CSS/JS

---

[Unreleased]: https://github.com/NotSleeply/ClawBoard/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/NotSleeply/ClawBoard/releases/tag/v0.1.0

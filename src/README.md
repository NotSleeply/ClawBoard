# ClawBoard 源代码结构

本项目采用模块化的目录结构，便于代码维护和扩展。

## 目录结构

```
src/
├── main/                    # 主进程相关
│   ├── index.js            # 主入口文件（原 main.js）
│   ├── ipc/                # IPC 处理器（待拆分）
│   ├── windows/            # 窗口管理
│   │   └── quick-paste.html
│   └── services/           # 服务层（待拆分）
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
├── utils/                  # 工具函数
│   ├── platform.js         # 跨平台抽象
│   ├── text-transform.js   # 文本转换
│   ├── hotkey-templates.js # 快捷键模板
│   ├── ignore-rules.js     # 忽略规则
│   ├── auto-categorize.js  # 自动分类
│   └── smart-paste.js      # 智能粘贴
│
├── renderer/               # 渲染进程
│   ├── index.html          # 主窗口
│   ├── app.js              # 主窗口逻辑
│   ├── cycle-panel.html    # 循环粘贴窗口
│   ├── cycle-panel.js      # 循环粘贴逻辑
│   ├── styles.css          # 主样式
│   └── styles_extra.css    # 额外样式
│
└── preload.js              # 预加载脚本
```

## 模块说明

### 主进程 (main/)
- **index.js**: 应用主入口，负责窗口管理、系统托盘、全局快捷键等
- **ipc/**: IPC 通信处理器（计划拆分）
- **windows/**: 窗口相关的 HTML 文件
- **services/**: 服务层代码（计划拆分）

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

### 渲染进程 (renderer/)
前端界面相关代码

## 下一步优化建议

1. **拆分 main/index.js**
   - 将 IPC 处理器提取到 `main/ipc/` 目录
   - 将窗口创建逻辑提取到 `main/windows/` 目录
   - 将业务逻辑提取到 `main/services/` 目录

2. **添加索引文件**
   - 在各个模块目录添加 `index.js` 作为导出入口
   - 简化 require 路径

3. **类型定义**
   - 考虑添加 JSDoc 或 TypeScript 类型定义
   - 提高代码可维护性

4. **测试文件**
   - 在各模块目录添加对应的测试文件
   - 建立完整的测试体系

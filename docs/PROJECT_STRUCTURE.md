# ClawBoard 项目结构

## 根目录结构

```
ClawBoard/
├── .git/                   # Git 版本控制
├── .github/                # GitHub 配置（Actions, Issue 模板等）
├── assets/                 # 资源文件
│   ├── icon.svg           # 应用图标
│   ├── tray-icon.png      # 托盘图标
│   └── tessdata/          # OCR 训练数据
│       ├── chi_sim.traineddata  # 简体中文
│       └── eng.traineddata      # 英文
├── build/                  # 构建输出目录
├── docs/                   # 项目文档
│   ├── ARCHITECTURE.md    # 架构设计文档
│   ├── CROSSPLATFORM.md   # 跨平台开发指南
│   ├── MIGRATION_GUIDE.md # 迁移指南
│   ├── REFACTORING_SUMMARY.md  # 重构总结
│   ├── PROJECT_STRUCTURE.md    # 本文档
│   ├── issue_body.md      # Issue 模板
│   └── pr_body.md         # PR 模板
├── node_modules/           # NPM 依赖（不提交到 Git）
├── src/                    # 源代码（详见下方）
├── .gitignore             # Git 忽略配置
├── CHANGELOG.md           # 更新日志
├── CONTRIBUTING.md        # 贡献指南
├── LICENSE                # 开源协议
├── package.json           # NPM 配置
├── package-lock.json      # NPM 依赖锁定
└── README.md              # 项目说明
```

## 源代码结构 (src/)

```
src/
├── main/                   # 主进程
│   ├── index.js           # 主入口文件
│   ├── ipc/               # IPC 处理器（待拆分）
│   ├── windows/           # 窗口管理
│   │   └── quick-paste.html
│   └── services/          # 服务层（待拆分）
│
├── core/                   # 核心功能模块
│   ├── database/          # 数据库管理
│   │   └── Database.js    # SQLite 数据库封装
│   ├── clipboard/         # 剪贴板监控
│   │   └── ClipboardWatcher.js
│   ├── ai/                # AI 服务
│   │   └── AIService.js   # Ollama 集成
│   └── sync/              # 数据同步
│       └── SyncService.js # WebDAV 同步
│
├── features/              # 功能模块
│   ├── snippets/          # 快捷片段
│   │   └── SnippetsManager.js
│   ├── ocr/               # OCR 文字识别
│   │   └── OCRService.js
│   ├── rules/             # 规则引擎
│   │   └── RuleEngine.js
│   └── insights/          # 智能洞察
│       └── InsightsService.js
│
├── utils/                 # 工具函数
│   ├── platform.js        # 跨平台抽象
│   ├── text-transform.js  # 文本转换
│   ├── hotkey-templates.js # 快捷键模板
│   ├── ignore-rules.js    # 忽略规则
│   ├── auto-categorize.js # 自动分类
│   └── smart-paste.js     # 智能粘贴
│
├── renderer/              # 渲染进程（前端）
│   ├── index.html         # 主窗口
│   ├── app.js             # 主窗口逻辑
│   ├── cycle-panel.html   # 循环粘贴窗口
│   ├── cycle-panel.js     # 循环粘贴逻辑
│   ├── styles.css         # 主样式
│   └── styles_extra.css   # 额外样式
│
├── preload.js             # 预加载脚本
└── README.md              # 源代码说明
```

## 目录说明

### 根目录文件

| 文件 | 说明 |
|------|------|
| `.gitignore` | Git 忽略配置，排除 node_modules、build 等 |
| `CHANGELOG.md` | 版本更新日志 |
| `CONTRIBUTING.md` | 贡献指南 |
| `LICENSE` | MIT 开源协议 |
| `package.json` | NPM 项目配置 |
| `package-lock.json` | NPM 依赖版本锁定 |
| `README.md` | 项目主说明文档 |

### 资源目录 (assets/)

存放应用所需的静态资源：
- **图标**: 应用图标、托盘图标
- **OCR 数据**: Tesseract.js 训练数据文件

### 文档目录 (docs/)

存放所有项目文档：
- **架构文档**: 系统设计、模块说明
- **开发文档**: 迁移指南、跨平台开发
- **模板文件**: Issue、PR 模板

### 源代码目录 (src/)

#### main/ - 主进程
Electron 主进程代码，负责：
- 窗口管理
- 系统托盘
- 全局快捷键
- IPC 通信
- 应用生命周期

#### core/ - 核心模块
应用的核心功能：
- **database**: 数据持久化
- **clipboard**: 剪贴板监控
- **ai**: AI 功能集成
- **sync**: 数据同步

#### features/ - 功能模块
独立的功能特性：
- **snippets**: 快捷片段管理
- **ocr**: 图片文字识别
- **rules**: 自动化规则
- **insights**: 使用分析

#### utils/ - 工具模块
通用工具函数和辅助类

#### renderer/ - 渲染进程
前端界面代码（HTML/CSS/JS）

## 文件命名规范

### 类文件
使用 **PascalCase**（大驼峰）：
- `Database.js`
- `ClipboardWatcher.js`
- `AIService.js`

### 工具文件
使用 **kebab-case**（短横线）：
- `text-transform.js`
- `hotkey-templates.js`
- `auto-categorize.js`

### 目录
使用 **kebab-case**（短横线）：
- `clipboard/`
- `snippets/`
- `ocr/`

## 模块依赖关系

```
main/index.js
    ├─► core/
    │   ├─► database/Database.js
    │   ├─► clipboard/ClipboardWatcher.js
    │   ├─► ai/AIService.js
    │   └─► sync/SyncService.js
    │
    ├─► features/
    │   ├─► snippets/SnippetsManager.js
    │   ├─► ocr/OCRService.js
    │   ├─► rules/RuleEngine.js
    │   └─► insights/InsightsService.js
    │
    └─► utils/
        ├─► platform.js
        ├─► text-transform.js
        └─► ...
```

## 添加新功能

### 1. 确定模块类型

- **核心功能** → `src/core/`
- **独立功能** → `src/features/`
- **工具函数** → `src/utils/`

### 2. 创建目录和文件

```bash
# 示例：添加新功能 "my-feature"
mkdir src/features/my-feature
touch src/features/my-feature/MyFeature.js
```

### 3. 实现功能

```javascript
// src/features/my-feature/MyFeature.js
class MyFeature {
  constructor(dependencies) {
    // 初始化
  }
  
  // 方法实现
}

module.exports = MyFeature;
```

### 4. 在主进程中引入

```javascript
// src/main/index.js
const MyFeature = require('../features/my-feature/MyFeature');
let myFeature = null;

// 在 app.whenReady() 中初始化
myFeature = new MyFeature(dependencies);
```

## 构建和部署

### 开发模式
```bash
npm run dev
```

### 构建应用
```bash
npm run build        # 当前平台
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

### 输出目录
构建后的文件在 `build/` 目录：
- Windows: `.exe` 安装包和便携版
- macOS: `.dmg` 和 `.zip`
- Linux: `.AppImage` 和 `.deb`

## 版本控制

### 不提交到 Git 的文件/目录
- `node_modules/` - NPM 依赖
- `build/` - 构建输出
- `dist/` - 打包输出
- 用户数据文件
- 临时文件

### 提交到 Git 的文件
- 所有源代码
- 配置文件
- 文档
- 资源文件（图标、训练数据等）

## 相关文档

- [架构设计](./ARCHITECTURE.md)
- [迁移指南](./MIGRATION_GUIDE.md)
- [重构总结](./REFACTORING_SUMMARY.md)
- [跨平台开发](./CROSSPLATFORM.md)

---

**最后更新**: 2026-05-07
**维护者**: NotSleeply

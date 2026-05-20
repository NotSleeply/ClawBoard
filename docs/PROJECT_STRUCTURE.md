# ClawBoard 项目结构

ClawBoard 当前是轻量 Node.js CLI 项目。源码保持 CommonJS，不引入 TypeScript 源码；类型约束通过 JSDoc 与 `tsc --noEmit` 渐进启用。

## 根目录结构

```
ClawBoard/
├── .github/                # GitHub Actions、Issue 模板、PR 模板
├── assets/                 # 静态资源，当前主要是 OCR tessdata
├── docs/                   # 架构、流程、迁移与项目文档
├── src/                    # CLI 运行时代码
├── tests/                  # Jest 全局测试设置
├── jest.config.js          # Jest 配置
├── package.json            # pnpm 脚本、依赖与 CLI bin
├── pnpm-lock.yaml          # 可复现依赖锁定
├── tsconfig.json           # JSDoc/checkJs 类型检查配置
└── README.md               # 项目说明
```

## 源代码结构

```
src/
├── cli/                    # 命令行入口与守护进程
│   ├── index.js            # `clawboard` 命令入口
│   ├── watcher.js          # 剪贴板监控守护进程
│   └── __tests__/          # CLI smoke/integration tests
├── core/                   # 核心能力，直接支撑 CLI 行为
│   ├── ai/                 # Ollama AI 集成
│   ├── clipboard/          # 剪贴板监控
│   ├── database/           # sql.js 数据持久化
│   ├── sync/               # 同步与导入导出
│   └── index.js            # core 模块聚合出口
├── features/               # 可选业务能力模块
│   ├── insights/           # 使用洞察
│   ├── ocr/                # OCR 识别
│   ├── rules/              # 自动规则
│   ├── snippets/           # 数据库存储的快捷片段
│   └── index.js            # features 模块聚合出口
└── utils/                  # 无 UI 的通用工具与轻量管理器
    ├── __tests__/          # 工具模块单元测试
    ├── index.js            # utils 模块聚合出口
    ├── LRUCache.js
    ├── SecureUtils.js
    ├── TextFormatter.js
    └── ...
```

## 分层规则

- `cli/` 可以依赖 `core/`、`features/`、`utils/`，负责参数解析、输出与进程生命周期。
- `core/` 放置没有它 CLI 就无法工作的深模块，例如数据库、剪贴板、AI、同步。
- `features/` 放置可独立演进的功能模块，例如 OCR、规则、洞察、快捷片段。
- `utils/` 放置纯工具或轻量状态管理器，不应反向依赖 `cli/`。
- 新模块优先通过所在层级的 `index.js` 暴露，便于后续整理依赖图。

## 测试布局

测试文件优先靠近被测模块，放在对应目录的 `__tests__/` 下。全局 Jest 设置放在 `tests/setup.js`。

```
src/core/database/__tests__/
src/core/clipboard/__tests__/
src/cli/__tests__/
src/utils/__tests__/
tests/setup.js
```

## 命名规范

- 类或构造器模块使用 PascalCase，例如 `Database.js`、`ClipboardWatcher.js`。
- 纯函数工具模块可以使用 kebab-case，例如 `text-transform.js`、`smart-paste.js`。
- 目录使用 kebab-case 或清晰领域名，例如 `database/`、`clipboard/`、`snippets/`。
- CommonJS 聚合出口统一命名为 `index.js`。

## JSDoc 约束

- 新增或重构模块时优先添加 `@typedef`、`@param`、`@returns`。
- 需要启用严格 JS 类型检查的文件可单独添加 `// @ts-check`。
- `tsconfig.json` 负责运行 `pnpm typecheck`，不要求把源码改为 TypeScript。

## 添加新功能

1. 先创建 GitHub Issue，写清目标、实现思路和 DoD。
2. 从 Issue 创建独立分支，例如 `feature/issue-123-my-feature`。
3. 根据职责选择目录：核心能力放 `core/`，可选功能放 `features/`，通用工具放 `utils/`，命令入口放 `cli/`。
4. 添加或更新自动化测试。
5. 运行 `pnpm lint`、`pnpm format:check`、`pnpm typecheck`、`pnpm test`。
6. 创建 PR，并在描述中说明实现逻辑、困难与解决思路、合并后的项目形态。

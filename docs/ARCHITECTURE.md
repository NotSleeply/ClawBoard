# ClawBoard 架构文档

## 项目概述

ClawBoard 是一个轻量 Node.js CLI 剪贴板管理器，支持本地历史记录、搜索、收藏、AI 摘要、OCR、加密和同步。项目使用 JavaScript + CommonJS 编写，通过 JSDoc 与 `tsc --noEmit` 做渐进类型检查，不引入 TypeScript 源码。

## 技术栈

- **运行时**: Node.js 18+
- **CLI**: Commander.js
- **数据库**: sql.js (SQLite 的纯 JS 实现)
- **AI**: Ollama 本地模型
- **OCR**: Tesseract.js
- **测试**: Jest
- **质量门禁**: ESLint、Prettier、JSDoc typecheck、GitHub Actions

## 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI App                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐        ┌──────────────┐                  │
│  │ cli/index.js │        │ cli/watcher  │                  │
│  │ commands     │        │ daemon       │                  │
│  └──────┬───────┘        └──────┬───────┘                  │
│         │                       │                          │
│         ├───────────┬───────────┘                          │
│         │           │                                      │
│         ▼           ▼                                      │
│  ┌──────────────────────────────────────┐                  │
│  │ core/                                │                  │
│  │ database · clipboard · ai · sync     │                  │
│  └──────────────────────────────────────┘                  │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────────────────────────────┐                  │
│  │ features/                            │                  │
│  │ snippets · ocr · rules · insights    │                  │
│  └──────────────────────────────────────┘                  │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────────────────────────────┐                  │
│  │ utils/                               │                  │
│  │ formatting · security · platform     │                  │
│  └──────────────────────────────────────┘                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 模块职责

### `cli/`

负责命令注册、参数解析、终端输出、守护进程启动和退出码。CLI 层可以调用下层模块，但下层模块不应依赖 CLI。

### `core/`

核心模块直接支撑主要运行路径：

- `database/Database.js`: sql.js 数据持久化、查询、加密、备份、统计。
- `clipboard/ClipboardWatcher.js`: 剪贴板读取、类型识别、内容入库。
- `ai/AIService.js`: Ollama 配置、摘要、分类、向量生成。
- `sync/SyncService.js`: 数据导入导出与同步。

### `features/`

功能模块围绕可独立演进的能力组织：

- `snippets/`: 数据库存储的快捷片段。
- `ocr/`: Tesseract OCR。
- `rules/`: 自动规则与动作执行。
- `insights/`: 使用洞察。

### `utils/`

工具模块提供可复用能力，例如文本格式化、安全工具、LRU 缓存、平台适配、智能粘贴、触发器等。工具模块应保持低耦合，避免依赖 `cli/`。

## 数据流

### 剪贴板记录流

```
系统剪贴板
  ↓
ClipboardWatcher
  ↓
忽略规则 / 类型识别 / 安全检测
  ↓
AI 摘要或 OCR 识别（可选）
  ↓
Database.addRecord()
  ↓
CLI 查询、搜索、复制、统计
```

### CLI 查询流

```
用户命令
  ↓
cli/index.js
  ↓
Database / core modules
  ↓
格式化终端输出
```

## 工程化约束

- 每个任务先创建 GitHub Issue，再创建独立分支。
- 每个 PR 必须有对应测试或说明测试范围。
- CI 必须通过 `pnpm lint`、`pnpm format:check`、`pnpm typecheck`、`pnpm test:coverage` 和 CLI smoke test。
- JavaScript 保持轻量，类型信息通过 JSDoc 渐进补充。
- 格式由 Prettier 统一处理，ESLint 聚焦语义和质量问题。

## 演进方向

- 新功能优先通过层级 `index.js` 暴露，逐步减少跨层深路径引用。
- 大型模块应按可测试接口逐步拆分，不为了目录好看做无行为收益的搬家。
- `Database.js` 是当前最大深模块，后续应以测试保护为前提，按备份、同步、搜索、统计等主题渐进拆分。

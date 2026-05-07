# 代码重构迁移指南

本文档说明了项目重构后的文件位置变化，帮助开发者快速适应新的项目结构。

## 文件位置变化

### 主进程文件

| 旧路径 | 新路径 | 说明 |
|--------|--------|------|
| `src/main.js` | `src/main/index.js` | 主入口文件 |
| `src/quick-paste.html` | `src/main/windows/quick-paste.html` | 快速粘贴窗口 |

### 核心模块

| 旧路径 | 新路径 | 说明 |
|--------|--------|------|
| `src/database.js` | `src/core/database/Database.js` | 数据库管理 |
| `src/clipboard.js` | `src/core/clipboard/ClipboardWatcher.js` | 剪贴板监控 |
| `src/ai.js` | `src/core/ai/AIService.js` | AI 服务 |
| `src/sync.js` | `src/core/sync/SyncService.js` | 同步服务 |

### 功能模块

| 旧路径 | 新路径 | 说明 |
|--------|--------|------|
| `src/snippets.js` | `src/features/snippets/SnippetsManager.js` | 代码片段管理 |
| `src/ocr.js` | `src/features/ocr/OCRService.js` | OCR 服务 |
| `src/rule-engine.js` | `src/features/rules/RuleEngine.js` | 规则引擎 |
| `src/insights.js` | `src/features/insights/InsightsService.js` | 洞察分析 |

### 工具模块

| 旧路径 | 新路径 | 说明 |
|--------|--------|------|
| `src/platform.js` | `src/utils/platform.js` | 平台抽象 |
| `src/text-transform.js` | `src/utils/text-transform.js` | 文本转换 |
| `src/hotkey-templates.js` | `src/utils/hotkey-templates.js` | 快捷键模板 |
| `src/ignore-rules.js` | `src/utils/ignore-rules.js` | 忽略规则 |
| `src/auto-categorize.js` | `src/utils/auto-categorize.js` | 自动分类 |
| `src/smart-paste.js` | `src/utils/smart-paste.js` | 智能粘贴 |

### 渲染进程（无变化）

| 路径 | 说明 |
|------|------|
| `src/renderer/index.html` | 主窗口 |
| `src/renderer/app.js` | 主窗口逻辑 |
| `src/renderer/cycle-panel.html` | 循环粘贴窗口 |
| `src/renderer/cycle-panel.js` | 循环粘贴逻辑 |
| `src/renderer/styles.css` | 主样式 |
| `src/renderer/styles_extra.css` | 额外样式 |

### 其他文件（无变化）

| 路径 | 说明 |
|------|------|
| `src/preload.js` | 预加载脚本 |

## require 路径变化

### 在 main/index.js 中

```javascript
// 旧的 require 方式
const Database = require('./database');
const AI = require('./ai');
const ClipboardWatcher = require('./clipboard');

// 新的 require 方式
const Database = require('../core/database/Database');
const AI = require('../core/ai/AIService');
const ClipboardWatcher = require('../core/clipboard/ClipboardWatcher');
```

### 在其他模块中

如果你的模块需要引用其他模块，请使用相对路径：

```javascript
// 从 features/snippets/SnippetsManager.js 引用 Database
const Database = require('../../core/database/Database');

// 从 utils/auto-categorize.js 引用 AI
const AI = require('../core/ai/AIService');
```

## package.json 变化

```json
{
  "main": "src/main/index.js"  // 原来是 "src/main.js"
}
```

## 开发建议

### 1. 模块化开发

每个功能模块应该：
- 独立完成特定功能
- 最小化外部依赖
- 提供清晰的接口
- 包含必要的注释

### 2. 命名规范

- **类文件**: 使用 PascalCase，如 `Database.js`, `AIService.js`
- **工具文件**: 使用 kebab-case，如 `text-transform.js`, `platform.js`
- **目录**: 使用 kebab-case，如 `clipboard/`, `snippets/`

### 3. 导入导出

```javascript
// 推荐：使用 module.exports 导出类
class MyService {
  // ...
}
module.exports = MyService;

// 推荐：使用 require 导入
const MyService = require('../path/to/MyService');
```

### 4. 添加新功能

当添加新功能时：

1. **确定模块类型**
   - 核心功能 → `core/`
   - 独立功能 → `features/`
   - 工具函数 → `utils/`

2. **创建目录和文件**
   ```bash
   mkdir src/features/my-feature
   touch src/features/my-feature/MyFeature.js
   ```

3. **实现功能**
   ```javascript
   class MyFeature {
     constructor(dependencies) {
       // 初始化
     }
     
     // 方法
   }
   
   module.exports = MyFeature;
   ```

4. **在 main/index.js 中引入**
   ```javascript
   const MyFeature = require('../features/my-feature/MyFeature');
   let myFeature = null;
   
   // 在 app.whenReady() 中初始化
   myFeature = new MyFeature(dependencies);
   ```

5. **添加 IPC 处理器**
   ```javascript
   ipcMain.handle('my-feature-action', async (_, args) => {
     return myFeature.doSomething(args);
   });
   ```

## 测试更新

如果你有测试文件，需要更新导入路径：

```javascript
// 旧的测试导入
const Database = require('../src/database');

// 新的测试导入
const Database = require('../src/core/database/Database');
```

## 常见问题

### Q: 为什么要重构？

A: 原来的结构将所有文件平铺在 `src/` 目录下，随着项目增长变得难以维护。新结构按功能模块组织，更清晰、更易扩展。

### Q: 会影响现有功能吗？

A: 不会。重构只是改变了文件位置和导入路径，功能逻辑完全不变。

### Q: 如何快速找到某个功能的代码？

A: 参考本文档的文件位置变化表，或查看 `src/README.md` 了解目录结构。

### Q: 未来还会有大的结构调整吗？

A: 短期内不会。但我们计划进一步拆分 `main/index.js`，将 IPC 处理器和窗口管理提取到独立文件。

## 下一步计划

1. **拆分 main/index.js**
   - 提取 IPC 处理器到 `main/ipc/`
   - 提取窗口管理到 `main/windows/`
   - 提取业务逻辑到 `main/services/`

2. **添加索引文件**
   - 在各模块添加 `index.js` 简化导入

3. **完善文档**
   - 为每个模块添加 README
   - 添加 API 文档
   - 添加使用示例

4. **建立测试体系**
   - 单元测试
   - 集成测试
   - E2E 测试

## 反馈

如果你在使用新结构时遇到问题，或有改进建议，请：
- 提交 Issue
- 发起 Pull Request
- 联系维护者

---

**重构完成日期**: 2026-05-07
**维护者**: NotSleeply

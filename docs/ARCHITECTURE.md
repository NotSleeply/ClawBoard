# ClawBoard 架构文档

## 项目概述

ClawBoard 是一个基于 Electron 的 AI 驱动的本地剪贴板管理器，支持智能记录、语义搜索、永久收藏等功能。

## 技术栈

- **框架**: Electron 28.0.0
- **数据库**: sql.js (SQLite 的纯 JS 实现)
- **AI**: 支持 Ollama 本地模型
- **OCR**: Tesseract.js
- **日志**: electron-log
- **更新**: electron-updater

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Electron App                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐         ┌──────────────┐                  │
│  │  Main Process │◄───────►│   Renderer   │                  │
│  │   (Node.js)   │   IPC   │   (Browser)  │                  │
│  └───────┬───────┘         └──────────────┘                  │
│          │                                                    │
│          ├─► Core Modules                                    │
│          │   ├─ Database (sql.js)                           │
│          │   ├─ Clipboard Watcher                           │
│          │   ├─ AI Service (Ollama)                         │
│          │   └─ Sync Service                                │
│          │                                                    │
│          ├─► Feature Modules                                 │
│          │   ├─ Snippets Manager                            │
│          │   ├─ OCR Service                                 │
│          │   ├─ Rule Engine                                 │
│          │   └─ Insights Service                            │
│          │                                                    │
│          └─► Utils                                           │
│              ├─ Platform Abstraction                        │
│              ├─ Text Transform                              │
│              └─ Auto Categorize                             │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 模块依赖关系

```
Main Process (index.js)
    │
    ├─► Core Modules
    │   ├─► Database ──────────► sql.js
    │   ├─► ClipboardWatcher ──► Database, AI, OCR
    │   ├─► AIService ─────────► Ollama API
    │   └─► SyncService ───────► Database
    │
    ├─► Feature Modules
    │   ├─► SnippetsManager ───► Database
    │   ├─► OCRService ────────► Tesseract.js
    │   ├─► RuleEngine ────────► Database
    │   └─► InsightsService ───► Database, AI
    │
    └─► Utils
        ├─► Platform
        ├─► TextTransform
        ├─► HotkeyTemplates
        ├─► IgnoreRules
        ├─► AutoCategorize
        └─► SmartPaste
```

## 核心模块详解

### 1. Database (core/database/)

**职责**: 
- 管理 SQLite 数据库
- 提供数据 CRUD 操作
- 支持数据加密
- 实现数据压缩
- 提供搜索和统计功能

**主要方法**:
- `addRecord()`: 添加记录
- `getRecords()`: 获取记录列表
- `search()`: 搜索记录
- `encryptRecord()`: 加密记录
- `getStats()`: 获取统计信息

### 2. ClipboardWatcher (core/clipboard/)

**职责**:
- 监控系统剪贴板变化
- 自动保存剪贴板内容
- 支持文本、图片、文件等多种类型
- 集成 AI 自动摘要
- 集成 OCR 文字识别

**工作流程**:
```
剪贴板变化
    ↓
检查忽略规则
    ↓
识别内容类型
    ↓
OCR 识别（图片）
    ↓
AI 摘要生成
    ↓
保存到数据库
    ↓
触发规则引擎
```

### 3. AIService (core/ai/)

**职责**:
- 与 Ollama 本地模型通信
- 生成内容摘要
- 提供语义搜索
- 支持多种 AI 模型

**功能**:
- 文本摘要
- 代码解释
- 语义向量生成
- 智能分类

### 4. SyncService (core/sync/)

**职责**:
- 数据导入导出
- WebDAV 同步
- 冲突解决
- 增量同步

## 功能模块详解

### 1. SnippetsManager (features/snippets/)

**职责**:
- 管理快捷片段
- 支持变量替换
- 快捷键触发
- 使用统计

### 2. OCRService (features/ocr/)

**职责**:
- 图片文字识别
- 支持多语言
- 异步处理
- 结果缓存

### 3. RuleEngine (features/rules/)

**职责**:
- 自动化规则执行
- 条件匹配
- 动作执行
- 规则优先级

### 4. InsightsService (features/insights/)

**职责**:
- 使用习惯分析
- 智能建议
- 趋势统计
- 可视化数据

## 数据流

### 剪贴板数据流

```
用户复制内容
    ↓
ClipboardWatcher 监听
    ↓
内容类型识别
    ↓
┌─────────┬─────────┬─────────┐
│  文本   │  图片   │  文件   │
└────┬────┴────┬────┴────┬────┘
     │         │         │
     ↓         ↓         ↓
  AI摘要    OCR识别   元数据提取
     │         │         │
     └────┬────┴────┬────┘
          ↓         ↓
       Database  RuleEngine
          ↓
       UI 更新
```

### 搜索数据流

```
用户输入搜索词
    ↓
关键词搜索 (SQL LIKE)
    ↓
语义搜索 (AI Embedding)
    ↓
结果合并排序
    ↓
返回给 UI
```

## IPC 通信

主进程和渲染进程通过 IPC 通信：

```javascript
// 渲染进程 → 主进程
window.api.invoke('method-name', args)

// 主进程 → 渲染进程
mainWindow.webContents.send('event-name', data)
```

**主要 IPC 通道**:
- `get-records`: 获取记录
- `search-records`: 搜索记录
- `add-record`: 添加记录
- `delete-record`: 删除记录
- `toggle-favorite`: 切换收藏
- `ai-summarize`: AI 摘要
- `ocr-recognize`: OCR 识别

## 性能优化

### 1. 数据库优化
- 使用索引加速查询
- 大内容压缩存储
- 分页加载数据
- 定期清理过期数据

### 2. 内存优化
- 延迟加载模块
- 图片缩略图缓存
- 限制历史记录数量
- 及时释放资源

### 3. UI 优化
- 虚拟滚动
- 防抖节流
- 异步渲染
- 懒加载图片

## 安全性

### 1. 数据加密
- AES-256 加密敏感内容
- PBKDF2 密钥派生
- 加密标记和占位符

### 2. 权限控制
- 最小权限原则
- 上下文隔离
- 禁用 Node 集成

### 3. 数据保护
- 本地存储
- 可选同步
- 数据备份

## 扩展性

### 添加新功能模块

1. 在 `src/features/` 创建新目录
2. 实现功能类
3. 在 `main/index.js` 中引入
4. 添加 IPC 处理器
5. 更新 UI

### 添加新的 AI 功能

1. 在 `AIService` 中添加方法
2. 定义 prompt 模板
3. 处理响应数据
4. 暴露给其他模块

## 测试策略

### 单元测试
- 核心模块测试
- 工具函数测试
- 数据库操作测试

### 集成测试
- IPC 通信测试
- 模块协作测试
- 端到端流程测试

### 性能测试
- 大数据量测试
- 内存泄漏检测
- 响应时间测试

## 部署

### 构建命令
```bash
npm run build        # 构建当前平台
npm run build:win    # 构建 Windows
npm run build:mac    # 构建 macOS
npm run build:linux  # 构建 Linux
```

### 发布流程
1. 更新版本号
2. 更新 CHANGELOG
3. 构建应用
4. 创建 GitHub Release
5. 上传安装包
6. 自动更新推送

## 未来规划

- [ ] 插件系统
- [ ] 云端同步优化
- [ ] 移动端支持
- [ ] 团队协作功能
- [ ] 更多 AI 模型支持
- [ ] 性能监控和分析

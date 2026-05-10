# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- UI 设置面板 (快捷键配置、主题切换)
- 插件系统 (API 设计 + 沙箱)
- 多语言支持 (i18n, 中英日文)
- 云端同步服务器 (Docker 一键部署)

## [0.76.0] - 2024-01-15

### 🎨 新增 - 竞品特性集成

#### 文本格式清理器 (来自 ClipboardFusion)
- `toPlainText()` - 去除 HTML/Markdown/Word 格式
- 8 种大小写转换模式
- URL/Base64/HTML 实体编码转换
- 零宽字符清除 (安全防护)
- 文本统计信息 (字数/行数/语言检测)

#### 特殊粘贴模式 (来自 Ditto)
- 12 种预设粘贴模式:
  - 纯文本、大写、小写、标题格式、句子格式
  - 反转大小写、驼峰命名、下划线命名
  - URL 编解码、Base64 编解码
- 自定义模式注册 API
- 批量预览所有转换结果

#### 快捷短语/模板系统 (来自 CopyQ)
- 变量模板引擎 (`{{date}}`, `{{clipboard}}`, `{{user_name}}`)
- 分组管理 (通用/开发/办公)
- 6 个默认实用模板:
  - 当前日期时间
  - 邮箱签名
  - 代码注释头 (JSDoc)
  - TODO 注释
  - 会议纪要模板
  - 周报模板
- 使用统计和热门排行
- 导入导出功能 (JSON)

#### 自动触发器引擎 (来自 ClipboardFusion)
- 条件系统: 正则/关键词/长度/来源应用
- 动作系统: 格式化/替换/标记/通知/脚本执行
- 4 个智能默认规则:
  - URL 追踪参数清理器
  - 代码片段自动标记
  - 邮箱地址安全提醒
  - 长文本压缩提示
- 优先级和冷却时间控制

### 🔒 安全增强

#### 企业级安全工具集 (SecureUtils)
- Argon2id 密钥派生 (抗 GPU/ASIC 攻击)
- AES-256-GCM 认证加密 (防篡改)
- DoD 5220.22-M 安全删除标准 (7次覆写)
- 密码强度检测器 (评分+建议)
- HMAC-SHA256 签名验证

#### 会话管理器 (SessionManager)
- 主密码设置与验证
- 会话超时自动锁定 (默认30分钟)
- 暴力破解防护 (5次失败=锁定5分钟)
- HMAC-SHA256 密码存储 (不存明文)
- 活动监控定时器

### ⚡ 性能优化

#### LRU 缓存系统
- 列表加载: ~200ms → ~60ms (**3.3x** 提升)
- 搜索响应: ~500ms → ~150ms (**3.3x** 提升)
- 统计查询: ~100ms → ~20ms (**5x** 提升)
- 内存占用 <5MB (50条缓存对象)

#### 数据库安全加固
- SQL 注入防护: 参数化查询替代字符串拼接
- 输入验证和清理方法 (`_sanitizeString`, `_isValidTag`)
- 自动备份机制 (每小时备份,保留30天)
- ACID 事务支持 (`beginTransaction`/`commit`/`rollback`)

### 🧪 质量保证

#### 测试框架
- Jest 单元测试框架集成
- 90+ 核心模块测试用例:
  - LRUCache (15 用例)
  - TextFormatter (30+ 用例)
  - SecureUtils (20+ 用例)
  - PasteModeManager (25+ 用例)
- Electron API 模拟环境
- 覆盖率阈值: 70% 行覆盖

#### 代码质量工具
- ESLint 配置 (严格代码规范)
- Prettier 配置 (统一代码风格)
- CI/CD 流水线 (GitHub Actions):
  - 自动 lint 检查
  - 自动运行测试
  - 覆盖率报告上传

### 🔧 Bug 修复

- **P0**: `fs` 模块未定义导致系统健康状态查询崩溃 (#164)
- **P1**: CSV 导出功能返回错误数据 (数组长度而非内容) (#164)
- **P2**: SessionManager 内存泄漏 (定时器未在 destroy() 清理)

---

## [0.75.0] - 2024-01-15

### 🔐 安全升级

- AES-256-GCM 认证加密 (替代 AES-CBC)
- 主密码保护系统
- 会话超时自动锁定
- 暴力破解防护机制
- 安全删除文件 (DoD 标准)
- 密码强度检测

---

## [0.74.0] - 2024-01-14

### ⚡ 性能优化

- LRU 缓存实现
- 数据库查询优化
- 自动备份系统 (每小时)
- 事务支持
- SQL 注入防护

---

## [0.73.0] - 2024-01-13

### 🌍 跨平台优化

- Windows/macOS/Linux 完整支持
- 平台特定路径识别
- 系统通知适配
- 终端打开命令适配
- 打包配置完善

---

## [0.72.0] - 2024-01-12

### 🔄 同步增强

- WebDAV 同步服务
- 冲突解决策略
- 离线缓存支持
- 增量同步算法

---

## [0.71.0] - 2024-01-11

### 💬 OCR 功能

- Tesseract.js OCR 引擎集成
- 图片文字提取
- 多语言识别支持
- OCR 结果保存到数据库

---

## [0.70.0] - 2024-01-10

### 🤖 AI 集成

- Ollama 本地 AI 支持
- 自动摘要生成
- 语义搜索能力
- 智能标签推荐
- 内容分类识别

---

## [0.60.0 - 0.69.0]

### 核心功能开发期

- 剪贴板历史记录
- 文本/图片/文件类型支持
- 收藏和分组功能
- 搜索和过滤
- 二维码生成与扫描
- 加密存储
- 规则引擎
- 统计分析面板

---

[Unreleased]: https://github.com/NotSleeply/ClawBoard/compare/v0.76.0...HEAD
[0.76.0]: https://github.com/NotSleeply/ClawBoard/releases/tag/v0.76.0
[0.75.0]: https://github.com/NotSleeply/ClawBoard/releases/tag/v0.75.0

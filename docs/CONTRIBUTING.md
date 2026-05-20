# Contributing to ClawBoard

感谢你对 ClawBoard 项目的兴趣!我们欢迎各种形式的贡献,包括但不限于:

- 🐛 Bug 报告
- ✨ 新功能建议
- 📝 文档改进
- 🔧 代码提交
- 🌍 翻译

---

## 🚀 快速开始

### 环境准备

```bash
# 克隆仓库
git clone https://github.com/NotSleeply/ClawBoard.git
cd ClawBoard

# 安装 pnpm (如果还没有)
npm install -g pnpm

# 安装依赖
pnpm install
```

### 开发命令

```bash
# 查看 CLI 帮助
node src/cli/index.js --help

# 运行本地 CLI 命令
node src/cli/index.js list
```

---

## 🔧 Issue Driven Development

每次开始新任务前必须先创建 GitHub Issue，并在 Issue 中说明：

- 本次任务目标是什么。
- 具体实现思路是什么。
- 做到什么程度算达到阶段性 Definition of Done (DoD)。

针对每个 Issue 创建独立分支，例如 `feature/issue-207-ci-tests-jsdoc-structure`。开发完成后创建 PR，PR 描述必须包含：

- 具体的实现逻辑。
- 开发中遇到的困难及解决思路。
- 合并后项目的整体形态。

合并前必须通过 GitHub Actions CI：`pnpm lint`、`pnpm format:check`、`pnpm typecheck`、`pnpm test:coverage` 和 CLI smoke test。

## 🔧 开发流程

### 0. JSDoc 类型约束

项目保持 JavaScript + CommonJS，不引入 TypeScript 源码。新增或重构模块时使用 JSDoc 提供类型信息：

```javascript
// @ts-check

/**
 * @typedef {Object} ClipboardRecord
 * @property {string} id
 * @property {string} content
 * @property {'text'|'code'|'file'|'image'} type
 */

/**
 * @param {ClipboardRecord} record
 * @returns {string}
 */
function formatRecord(record) {
  return `${record.id}: ${record.content}`;
}
```

`// @ts-check` 可以按文件渐进启用。不要为了类型化一次性重写大模块；优先在新模块、测试覆盖较好的模块和正在重构的模块中补 JSDoc。

### 1. 代码规范

在开始编码前,请确保你的开发环境配置正确:

```bash
# 运行 lint 检查 (不允许 error 或 warning)
pnpm lint

# 自动修复可修复的问题
pnpm lint:fix

# 格式化代码
pnpm format

# 检查格式
pnpm format:check

# JSDoc/JavaScript 类型检查
pnpm typecheck
```

**推荐 VS Code 扩展**:

- ESLint - 实时显示代码问题
- Prettier - 保存时自动格式化
- Jest - 测试结果内联显示

### 2. 编写测试

如果你修改了核心模块,**必须**添加或更新对应的单元测试:

```bash
# 运行所有测试
pnpm test

# 运行测试并生成覆盖率，CI 使用该命令
pnpm test:coverage

# 运行特定测试文件
pnpm test -- src/utils/__tests__/LRUCache.test.js

# 监视模式 (文件变化自动重跑)
pnpm test:watch

# 查看覆盖率报告
pnpm test --coverage
```

#### 测试文件位置

```
src/
├── utils/
│   ├── __tests__/
│   │   ├── LRUCache.test.js        # LRUCache 测试
│   │   ├── TextFormatter.test.js   # TextFormatter 测试
│   │   ├── SecureUtils.test.js     # SecureUtils 测试
│   │   └── PasteModeManager.test.js # PasteModeManager 测试
├── core/
│   └── database/
│       └── __tests__/
│           └── Database.test.js      # Database 测试 (待添加)
```

#### 测试编写示例

```javascript
describe('ModuleName', () => {
  beforeEach(() => {
    // 每个测试前的初始化
  });

  describe('methodName', () => {
    it('should do something expected', () => {
      // Arrange (准备数据)
      const input = 'test';

      // Act (执行操作)
      const result = module.methodName(input);

      // Assert (验证结果)
      expect(result).toBe('expected output');
    });

    it('should handle edge cases', () => {
      // 边界情况测试
      expect(() => module.methodName(null)).not.toThrow();
    });
  });
});
```

### 3. 提交代码

```bash
# 创建 Issue 对应的特性分支
git checkout -b feature/issue-123-short-description

# 添加更改
git add .

# 提交 (遵循 Conventional Commits 规范)
git commit -m "feat: add amazing feature"

# 推送到你的 fork
git push origin feature/your-feature-name
```

#### Commit Message 规范

我们使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范:

| 类型       | 描述                          |
| ---------- | ----------------------------- |
| `feat`     | 新功能                        |
| `fix`      | Bug 修复                      |
| `docs`     | 文档变更                      |
| `style`    | 代码格式 (不影响逻辑)         |
| `refactor` | 重构 (既不是新功能也不是修复) |
| `perf`     | 性能优化                      |
| `test`     | 测试相关                      |
| `chore`    | 构建/工具/辅助工具的变动      |

**示例**:

```
feat: 添加文本格式清理器功能
fix: 修复 CSV 导出时返回错误数据的问题
perf: 实现 LRU 缓存系统提升列表加载速度 3.3x
docs: 更新 README 添加安全指南链接
```

### 4. 创建 Pull Request

1. 访问 https://github.com/NotSleeply/ClawBoard/pulls
2. 点击 **"New Pull Request"**
3. 选择你的分支并填写 PR 信息

#### PR 模板

```markdown
## Implementation Logic

具体实现逻辑。

## Difficulties And Resolutions

开发中遇到的困难及解决思路。

## Project Shape After Merge

合并后项目的整体形态。

## Verification

- [ ] `pnpm lint`
- [ ] `pnpm format:check`
- [ ] `pnpm typecheck`
- [ ] `pnpm test` or `pnpm test:coverage`

## Linked Issue

Fixes #issue-number
```

---

## 🐛 报告 Bug

### Bug 报告模板

在创建 Issue 前,请先搜索是否已有相同问题的报告。

**必需信息**:

1. **环境信息**
   - 操作系统: Windows/macOS/Linux + 版本号
   - Node.js 版本: `node --version`
   - ClawBoard 版本: 在关于页面查看

2. **复现步骤**

   ```markdown
   1. 打开应用
   2. 复制一段文字
   3. 尝试粘贴到某处
   4. 观察到错误...
   ```

3. **期望行为**: 你认为应该发生什么

4. **实际行为**: 实际发生了什么

5. **日志/截图**: 开发者工具控制台的输出或截图

6. **附加信息**: 可能相关的其他信息

---

## ✨ 功能建议

### 功能建议模板

**标题**: 清晰简洁的功能名称

**问题描述**:
当前缺少什么?为什么需要这个功能?

**解决方案建议**:
你希望如何实现?有没有参考实现?

**替代方案**:
你考虑过哪些其他方案?

**附加信息**:
截图、mockup、参考链接等

---

## 📖 文档贡献

文档同样重要!你可以帮助改进:

- 用户手册 (docs/user-guide.md)
- API 文档 (docs/api.md)
- 代码注释 (JSDoc 格式)
- README 示例代码

### 文档风格指南

- 使用清晰简洁的语言
- 提供可运行的代码示例
- 包含必要的上下文说明
- 保持与现有文档一致的格式

---

## 💬 行为准则

- ✅ 尊重他人,保持友善和专业
- ✅ 接受建设性批评
- ✅ 关注对社区最有利的事情
- ✅ 对不同观点保持包容

详见 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

---

## 🎨 代码风格指南

### JavaScript

- 使用 2 空格缩进
- 单引号字符串
- 分号结尾
- const/let (禁止 var)
- 箭号 === (禁止 ==)
- 函数使用命名函数表达式或箭头函数

**示例**:

```javascript
// Good ✅
const fetchData = async url => {
  try {
    const response = await fetch(url);
    return await response.json();
  } catch (error) {
    console.error('[Module] Fetch failed:', error.message);
    throw error;
  }
};

// Bad ❌
var fetchData = function (url) {
  var response = fetch(url); // missing await
  return response.json();
};
```

### 命名约定

| 类型      | 规范             | 示例                                 |
| --------- | ---------------- | ------------------------------------ |
| 变量/函数 | camelCase        | `getUserData`, `isLoading`           |
| 类/构造器 | PascalCase       | `DatabaseManager`, `LRUCache`        |
| 常量      | UPPER_SNAKE_CASE | `MAX_CACHE_SIZE`, `API_BASE_URL`     |
| 私有属性  | 下划线前缀       | `_cache`, `_isLocked`                |
| 文件名    | PascalCase       | `TextFormatter.js`, `SecureUtils.js` |

### 注释规范

- 公共 API 必须有 JSDoc 注释
- 复杂逻辑添加行内注释
- TODO 标记待完成的工作

**示例**:

```javascript
/**
 * 加密文本内容
 * @param {string} plaintext - 待加密的明文
 * @param {string} key - 32字节加密密钥
 * @returns {string} Base64 编码的密文
 */
function encrypt(plaintext, key) {
  // TODO: 添加性能监控
  const iv = crypto.randomBytes(12);
  // ... implementation
}
```

---

## 🏗️ 架构决策记录 (ADR)

对于重大技术决策,请在 docs/architecture/ 目录下添加 ADR 文档:

```markdown
# ADR-001: 选择 sql.js 作为数据库引擎

## 状态

已接受

## 背景

我们需要一个嵌入式数据库来存储剪贴板历史。

## 决策

选择 sql.js (SQLite 的 WebAssembly 构建),原因:

1. 无需原生编译,跨平台兼容性好
2. 支持浏览器端和 Node.js 环境
3. 成熟稳定,文档完善

## 后果

- 正面: 简化构建流程,无需平台特定依赖
- 负面: 性能略逊于原生 SQLite (但足够用)
```

---

## ❓ 需要帮助?

- 查看 [现有 Issues](https://github.com/NotSleeply/ClawBoard/issues) 寻找类似问题
- 加入 [Discussions](https://github.com/NotSleeply/ClawBoard/discussions) 发起讨论
- 阅读 [源码中的注释](src/) 了解实现细节

---

再次感谢你的贡献!🎉

<p align="center">
  <sub>Made with ❤️ by the ClawBoard Team</sub>
</p>

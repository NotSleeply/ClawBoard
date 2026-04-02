# 🤝 贡献指南

感谢你愿意为 ClawBoard 贡献力量！🎉

## 📋 贡献方式

### 🐛 报告 Bug
- 在 [GitHub Issues](https://github.com/NotSleeply/ClawBoard/issues) 中创建 Issue
- 选择 `bug` 标签
- 描述清楚：复现步骤、环境配置、预期 vs 实际结果
- 尽量提供截图或日志

### 💡 提出功能建议
- 在 [GitHub Issues](https://github.com/NotSleeply/ClawBoard/issues) 中创建 Issue
- 选择 `enhancement` 标签
- 清晰描述功能需求和使用场景

### 🔧 提交代码
1. **Fork** 本仓库
2. 创建新分支：`git checkout -b feature/your-feature-name`
3. 进行开发，遵循代码风格
4. 提交：`git commit -m "feat: add xxx"`
5. 推送：`git push origin feature/your-feature-name`
6. 提交 **Pull Request**

## 🛠️ 开发环境

```bash
# 克隆你的 Fork
git clone https://github.com/YOUR_USERNAME/ClawBoard.git
cd ClawBoard

# 安装依赖
npm install

# 启动开发模式
npm run dev
```

## 📐 代码规范

- 使用 **2 空格**缩进
- 变量/函数命名：`camelCase`
- 常量命名：`UPPER_SNAKE_CASE`
- 注释使用 JSDoc 风格
- 所有新增功能需附带测试（或说明）

## 🔍 提交信息规范

```
<type>(<scope>): <subject>

feat(core): add clipboard image detection
fix(ui): correct dark mode flash on startup
docs(readme): update installation guide
refactor(db): migrate to sql.js for cross-platform
```

**Type 类型：**
- `feat` - 新功能
- `fix` - Bug 修复
- `docs` - 文档更新
- `style` - 代码格式（不影响功能）
- `refactor` - 重构
- `perf` - 性能优化
- `test` - 测试相关
- `chore` - 构建/工具变更

## ❓ 有问题？

- 查看 [README.md](./README.md) 常见问题
- 创建 Discussion 和社区交流
- 提交 Issue 描述你的问题

---

> 🦞 ClawBoard 由 **AI 助手** 和社区共同维护
> 每一份贡献都值得感谢！

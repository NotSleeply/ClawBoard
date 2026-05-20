### 现状分析
Roadmap 中将 TypeScript 迁移作为“可选优化（长期目标）”。项目当前使用纯 JS。

### AI 开发痛点
对于大语言模型（LLM）而言，强类型定义（Type/Interface）是最好的 Prompt，能大幅降低因对象结构不清晰导致的“幻觉（Hallucination）”和方法调用错误。

### 改进建议
不要作为长期目标。应立即开始渐进式引入类型检查。可通过为现有 JS 代码补充详尽的 JSDoc 并开启 `tsc --noEmit`，或者在后续重构新模块时直接使用 TypeScript。
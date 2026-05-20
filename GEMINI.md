# ClawBoard AI Development Instructions (GEMINI.md)

Welcome, AI Developer. This file contains strict rules and architectural constraints for maintaining and developing the ClawBoard project. You MUST adhere to these rules at all times.

## 1. Code Quality & Security
- **No SQL Injection:** Never use string concatenation for SQL queries. Always use parameterized queries (e.g., `stmt.run([param1, param2])`).
- **Error Handling & Logging:** Any caught errors MUST be logged using `electron-log`. Do not use `console.error` for critical runtime errors; ensure `electron-log` is imported and used.
- **File Size Limits:** Single files MUST NOT exceed 400-500 lines of code. If you are modifying a file that is near or exceeds this limit (e.g., `src/main/index.js`), your priority should be to refactor and split it into smaller, manageable modules.

## 2. Typing and JSDoc
- **JSDoc Requirements:** All new and modified JavaScript functions, classes, and complex variables MUST be thoroughly documented using JSDoc type annotations. This acts as a clear prompt for you and reduces hallucinations.
- **Progressive TypeScript:** We are progressively introducing type checking. Treat the project as if it requires strict typing. Use `@typedef` and `@param` / `@returns` extensively.

## 3. Testing
- **Test-Driven Development (TDD):** TDD is mandatory for core components. Before modifying critical layers (like `Database`, `ClipboardWatcher`), ensure there are test cases.
- **Verify Regressions:** Always use `pnpm test` to verify that your refactoring or new features have not broken existing functionality.

## 4. Architectural Constraints
- Follow the existing project structure (`src/main`, `src/renderer`, `src/core`, `src/utils`, `src/features`).
- Maintain the local-first philosophy.
- Do not add new external dependencies without careful consideration of their size and security implications.

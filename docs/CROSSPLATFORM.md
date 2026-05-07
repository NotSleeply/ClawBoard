# ClawBoard 跨平台适配指南 (Issue #93)

## 📋 当前状态分析

### ✅ 已有跨平台支持

1. **Platform 抽象层** (`src/platform.js`)
   - 平台检测（Windows/macOS/Linux）
   - 终端/文件管理器/通知声音等基础工具方法
   - 配置目录路径抽象

2. **Electron API 使用**
   - 剪贴板监控使用 `clipboard` 模块（原生跨平台）
   - 全局快捷键使用 `globalShortcut`（原生跨平台）
   - 系统托盘使用 `Tray` 类（原生跨平台）

3. **部分已适配的功能** (main.js)
   - 通知声音播放（Windows/macOS/Linux）
   - 终端打开功能（Windows Terminal/macOS Terminal/gnome-terminal）
   - 窗口关闭行为（macOS 特殊处理）

---

### ❌ 需要适配的问题

#### P0 - 核心功能阻塞

1. **文件路径检测** (`src/clipboard.js:326-331`)
   - 问题：只识别 Windows 路径格式 (`C:\`, UNC)
   - 影响：macOS/Linux 上无法自动识别文件路径类型

2. **快速粘贴模拟** (`src/main.js:2991`)
   - 问题：使用 Windows PowerShell 的 SendKeys
   - 影响：macOS/Linux 无法使用 Alt+V 循环粘贴的自动粘贴功能

#### P1 - 功能受限

3. **系统托盘图标** (`src/main.js:282-298`)
   - 问题：可能需要不同尺寸的图标
   - macOS: 要求 16x16, 18x18, 32x32 等 Template Image
   - Linux: 通常 22x22 或 24x24

4. **应用打包配置** (`package.json`)
   - 问题：当前可能只有 Windows 打包配置
   - 需要：macOS (.dmg) / Linux (.AppImage/.deb/.rpm)

#### P2 - 用户体验优化

5. **全局快捷键默认值**
   - Windows: `Ctrl+Shift+V`
   - macOS: `Cmd+Shift+V` （更符合习惯）
   - Linux: `Ctrl+Shift+V`

6. **开机自启动配置**
   - Windows: 注册表 / 启动文件夹
   - macOS: Launch Agent
   - Linux: .desktop 文件 / systemd

7. **文档更新** (README.md)
   - 补充 macOS/Linux 安装说明
   - 说明已知兼容性问题
   - 提供各平台的运行要求

---

## 🔧 适配方案

### Phase 1: 核心功能修复 (P0)

#### 1.1 文件路径检测增强

**文件**: `src/clipboard.js`
**方法**: `_isFilePath()`

```javascript
_isFilePath(text) {
  const trimmed = text.trim();
  
  // Windows 路径
  const windowsPath = /^[a-zA-Z]:\\[\s\S]*$/;
  const uncPath = /^\\\\[\s\S]+$/;
  
  // Unix 路径 (macOS/Linux)
  // 绝对路径：以 / 开头，且包含 /
  const unixAbsolutePath = /^\/(Users|home|tmp|var|etc|opt|usr|root)(\/[\w.-]+)+$/;
  // 相对路径：包含 ~ 开头
  const homePath = /^~\/[\w.-]+(\/[\w.-]+)*(\.\w+)?$/;
  
  return windowsPath.test(trimmed) || 
         uncPath.test(trimmed) || 
         unixAbsolutePath.test(trimmed) ||
         homePath.test(trimmed);
}
```

#### 1.2 快速粘贴模拟跨平台

**文件**: `src/main.js`
**位置**: `quick-paste-select` IPC 处理器

```javascript
// v0.57.0: Quick paste IPC handlers
ipcMain.on('quick-paste-select', (event, item) => {
  if (quickPasteWindow && !quickPasteWindow.isDestroyed()) quickPasteWindow.close();
  const record = db.getRecord(item.id);
  if (record && record.content) {
    clipboard.writeText(record.content);
    
    // 模拟粘贴操作（跨平台）
    setTimeout(() => {
      const { exec } = require('child_process');
      const pasteCmd = Platform.getQuickPasteCommand();
      
      if (pasteCmd) {
        exec(pasteCmd, { windowsHide: true });
      } else {
        // macOS/Linux fallback: 使用 xdotool 或 AppleScript
        if (process.platform === 'darwin') {
          exec(`osascript -e 'tell application "System Events" to keystroke "v" using command down'`);
        } else if (process.platform === 'linux') {
          exec('xdotool key ctrl+v', (err) => {
            if (err) log.warn('快速粘贴失败: xdotool 不可用');
          });
        }
      }
    }, 100);
  }
});
```

**扩展 Platform 类**:
```javascript
// Platform.js 新增方法
static getQuickPasteCommand() {
  if (this.isWindows) {
    return 'powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'^v\')"';
  }
  if (this.isMac) {
    return null; // 使用 AppleScript
  }
  // Linux: xdotool
  return null; // 使用 xdotool
}
```

---

### Phase 2: 打包配置 (P1)

#### 2.1 electron-builder 配置

更新 `package.json` 或创建 `electron-builder.yml`:

```yaml
appId: com.clawboard.app
productName: ClawBoard
directories:
  output: release

# Windows 配置（已有）
win:
  target:
    - nsis
    - portable
  icon: assets/icon.png

# macOS 配置（新增）
mac:
  target:
    - dmg
    - zip
  category: public.app-category.productivity
  icon: assets/icon.icns
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist

dmg:
  contents:
    - x: 130
      y: 220
    - x: 410
      y: 220
      type: link
      path: /Applications

# Linux 配置（新增）
linux:
  target:
    - AppImage
    - deb
  icon: assets/icon.png
  category: Utility

AppImage:
  license: LICENSE

deb:
  depends:
    - libnotify4
    - libxtst6
    - libnss3
```

#### 2.2 图标资源准备

需要生成以下图标：
- `assets/icon.png` (256x256, 已有)
- `assets/icon.ico` (Windows, 多尺寸)
- `assets/icon.icns` (macOS, 多尺寸)
- `assets/icon.png` (Linux, 512x512 可选)

---

### Phase 3: 用户体验优化 (P2)

#### 3.1 默认快捷键调整

**文件**: `src/main.js`

```javascript
let shortcutsConfig = {
  cyclePaste: process.platform === 'darwin' ? 'Option+V' : 'Alt+V',
  quickPaste: process.platform === 'darwin' ? 'Option+Q' : 'Alt+Q',
  toggleMonitoring: process.platform === 'darwin' 
    ? 'Option+Ctrl+P' 
    : 'Alt+Ctrl+P'
};
```

#### 3.2 README 文档更新

在 README.md 中新增章节：

```markdown
## 🌍 多平台支持

### 支持的平台

| 平台 | 状态 | 备注 |
|------|------|------|
| Windows 10/11 | ✅ 官方支持 | 主力开发平台 |
| macOS 12+ | ⚠️ 实验性支持 | Apple Silicon + Intel |
| Ubuntu 20.04+ | ⚠️ 实验性支持 | 需要安装依赖 |

### 安装方式

#### Windows
```bash
# 下载 .exe 安装包或便携版
npm run build:win
```

#### macOS
```bash
# 下载 .dmg 安装包
npm run build:mac
# 或从源码运行
npm install && npm run dev
```

#### Linux (Ubuntu/Debian)
```bash
# 下载 .deb 包
sudo dpkg -i clawboard_*.deb
# 或下载 AppImage
chmod +x clawboard.AppImage
./clawboard.AppImage
```

### 已知限制

- **macOS**:
  - 需要在"系统偏好设置 > 安全性与隐私"中允许应用
  - 首次运行需要授予"辅助功能"权限（用于全局快捷键）
  - 剪贴板监控需要"完全磁盘访问权限"
  
- **Linux**:
  - 快速粘贴功能需要安装 `xdotool`: `sudo apt install xdotool`
  - 通知功能需要 `libnotify` 和 `canberra-gtk-play`
  - 部分桌面环境可能需要额外配置

### 运行时依赖

#### Windows
- 无额外依赖（Electron 内置）

#### macOS
- macOS 12 (Monterey) 或更高版本
- Xcode Command Line Tools（仅开发时需要）

#### Linux
- libnss3
- libxtst6
- libnotify4 (可选，用于系统通知)
- xdotool (可选，用于快速粘贴)
```

---

## 📊 测试清单

### Windows (已有)
- [ ] 剪贴板文字/图片监控
- [ ] 全局快捷键
- [ ] 系统托盘
- [ ] 通知显示
- [ ] AI 摘要（需 Ollama）
- [ ] OCR 识别
- [ ] 加密存储

### macOS (待测试)
- [ ] 应用启动与窗口显示
- [ ] 剪贴板监控（需授权）
- [ ] 全局快捷键（需辅助功能权限）
- [ ] 系统托盘（菜单栏图标）
- [ ] 通知显示
- [ ] 文件路径识别
- [ ] 终端打开
- [ ] 打包后的 .dmg 安装

### Linux (待测试)
- [ ] 应用启动与窗口显示
- [ ] 剪贴板监控
- [ ] 全局快捷键
- [ ] 系统托盘
- [ ] 通知显示
- [ ] 文件路径识别
- [ ] 终端打开（gnome-terminal）
- [ ] 打包后的 AppImage/deb 运行

---

## 🚀 发布计划

### v0.74.0 - macOS 实验性支持
- 修复文件路径检测
- 修复快速粘贴模拟
- 添加 electron-builder macOS 配置
- 更新 README

### v0.75.0 - Linux 实验性支持
- 完善 Linux 打包配置
- 添加 CI/CD 自动构建
- 测试主流发行版兼容性

### v0.76.0 - 正式多平台发布
- 移除"实验性"标签
- 完善所有平台文档
- 用户反馈收集和 Bug 修复

---

## 📝 开发笔记

### 关键差异点

1. **剪贴板权限**
   - Windows: 无需特殊权限
   - macOS: 需要"完全磁盘访问权限"
   - Linux: 通常无需权限（X11/Wayland 差异）

2. **全局快捷键**
   - Windows/Linux: 直接注册
   - macOS: 需要"辅助功能"权限

3. **系统托盘**
   - Windows: 任务栏右下角
   - macOS: 菜单栏（Status Bar）
   - Linux: 任务栏通知区域（GNOME/KDE 不同）

4. **路径分隔符**
   - Windows: `\` 或 `/`（都支持）
   - macOS/Linux: `/`

5. **大小写敏感**
   - Windows: 不区分
   - macOS: 默认不区分（可格式化为区分）
   - Linux: 区分

---

## 📚 参考资源

- [Electron 跨平台最佳实践](https://www.electronjs.org/docs/latest/tutorial/support)
- [electron-builder 多平台打包](https://www.electron.build/)
- [macOS 权限系统](https://developer.apple.com/documentation/bundleresources/entitlements)
- [Linux Desktop Entry 规范](https://specifications.freedesktop.org/desktop-entry-spec/latest/)

---

**最后更新**: 2026-05-07
**维护者**: NotSleeply
**状态**: 进行中

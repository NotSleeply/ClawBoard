/**
 * Platform detection and platform-specific utilities
 * v0.60.0 - Cross-platform abstraction layer
 */

const path = require('path');
const { app } = require('electron');
const os = require('os');

class Platform {
  static get isWindows() { return process.platform === 'win32'; }
  static get isMac() { return process.platform === 'darwin'; }
  static get isLinux() { return process.platform === 'linux'; }

  // Default terminal commands per platform
  static get terminalCommands() {
    if (this.isWindows) {
      return {
        open: 'start cmd /k',
        openWT: 'wt.exe',
        checkWT: 'where wt',
        wtPrefix: 'wt -d',
      };
    }
    if (this.isMac) {
      return {
        open: 'open -a Terminal',
        openWT: null,
        checkWT: null,
        wtPrefix: 'open -a Terminal',
      };
    }
    // Linux
    return {
      open: 'gnome-terminal',
      openWT: null,
      checkWT: null,
      wtPrefix: 'gnome-terminal --working-directory=',
    };
  }

  // File explorer commands per platform
  static get fileExplorerCommands() {
    if (this.isWindows) return { open: 'explorer', select: 'explorer /select,' };
    if (this.isMac) return { open: 'open -R', select: 'open -R' };
    // Linux
    return { open: 'xdg-open', select: 'xdg-open' };
  }

  // Path to config directory
  static getConfigDir() {
    if (this.isWindows) return path.join(app.getPath('appData'), 'ClawBoard');
    if (this.isMac) return path.join(app.getPath('home'), '.config', 'clawboard');
    // Linux
    return path.join(app.getPath('home'), '.config', 'clawboard');
  }

  // Default hotkey modifiers
  static get metaKey() {
    if (this.isWindows) return 'Ctrl';
    if (this.isMac) return 'Command';
    return 'Ctrl';
  }

  // Windows Terminal executable path
  static getWindowsTerminalPath() {
    if (!this.isWindows) return null;
    return path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'wt.exe');
  }

  // Play notification sound command
  static getNotificationSoundCommand() {
    if (this.isWindows) {
      return 'powershell -c "[System.Media.SystemSounds]::Beep.Play()"';
    }
    if (this.isMac) {
      return 'afplay /System/Library/Sounds/Glass.aiff';
    }
    // Linux
    return 'canberra-gtk-play -i message';
  }

  // Quick paste command (cross-platform)
  static getQuickPasteCommand() {
    if (this.isWindows) {
      return 'powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'^v\')"';
    }
    // macOS and Linux handled separately in main.js
    return null;
  }

  // Get default platform-specific shortcut modifier
  static getDefaultShortcutModifier() {
    if (this.isMac) {
      return 'Command'; // macOS 使用 Cmd 键
    }
    return 'Ctrl'; // Windows/Linux 使用 Ctrl
  }

  // Get default cycle paste shortcut (Alt on Win/Linux, Option on Mac)
  static getDefaultCyclePasteShortcut() {
    return this.isMac ? 'Option+V' : 'Alt+V';
  }

  // Get default quick paste shortcut
  static getDefaultQuickPasteShortcut() {
    return this.isMac ? 'Option+Q' : 'Alt+Q';
  }

  // Check if platform requires special permissions for clipboard
  static getClipboardPermissionNote() {
    if (this.isMac) {
      return {
        title: 'macOS 权限要求',
        requirements: [
          '系统偏好设置 > 安全性与隐私 > 完全磁盘访问权限',
          '系统偏好设置 > 安全性与隐私 > 辅助功能（全局快捷键）',
        ],
      };
    }
    if (this.isLinux) {
      return {
        title: 'Linux 依赖说明',
        requirements: [
          '快速粘贴功能需要 xdotool: sudo apt install xdotool',
          '通知功能需要 libnotify: sudo apt install libnotify4',
        ],
      };
    }
    return null; // Windows 无需特殊权限
  }

  // Platform-specific app configuration
  static getAppConfig() {
    const config = {
      platform: process.platform,
      arch: process.arch,
    };

    if (this.isWindows) {
      config.name = 'ClawBoard';
      config.defaultShortcut = 'CommandOrControl+Shift+V';
    } else if (this.isMac) {
      config.name = 'ClawBoard';
      config.defaultShortcut = 'Cmd+Shift+V';
      config.category = 'public.app-category.productivity';
    } else {
      config.name = 'clawboard';
      config.defaultShortcut = 'Ctrl+Shift+V';
      config.category = 'Utility';
    }

    return config;
  }
}

module.exports = Platform;

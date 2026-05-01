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

  // Quick paste Ctrl+V paste command (Windows only)
  static getQuickPasteCommand() {
    if (this.isWindows) {
      return 'powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'^v\')"';
    }
    // macOS: Cmd+V, Linux: Ctrl+Shift+V or custom
    // Return null for non-Windows; implementers should handle per-platform
    return null;
  }
}

module.exports = Platform;

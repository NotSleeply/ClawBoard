const { clipboard } = require('electron');
const Platform = require('../../utils/platform');

function setupCycleIpc(ipcMain, log, db, getCycleWindow, getQuickPasteWindow) {
    ipcMain.on("cycle-paste", (event, item) => {
        try {
            if (item && item.content) {
                clipboard.writeText(item.content);
                log.info("Cycle mode: pasted item #" + (item.id || "unknown"));
            }
            const cycleWindow = getCycleWindow();
            if (cycleWindow && !cycleWindow.isDestroyed()) {
                cycleWindow.close();
            }
        } catch (err) {
            log.error("cycle-paste error:", err);
            const cycleWindow = getCycleWindow();
            if (cycleWindow && !cycleWindow.isDestroyed()) cycleWindow.close();
        }
    });

    ipcMain.on("cycle-cancel", () => {
        const cycleWindow = getCycleWindow();
        if (cycleWindow && !cycleWindow.isDestroyed()) {
            cycleWindow.close();
        }
    });

    ipcMain.on("quick-paste-select", (event, item) => {
        const quickPasteWindow = getQuickPasteWindow();
        if (quickPasteWindow && !quickPasteWindow.isDestroyed())
            quickPasteWindow.close();
        const record = db.getRecord(item.id);
        if (record && record.content) {
            clipboard.writeText(record.content);

            setTimeout(() => {
                const { exec } = require("child_process");
                const pasteCmd = Platform.getQuickPasteCommand();

                if (pasteCmd) {
                    exec(pasteCmd, { windowsHide: true });
                } else if (process.platform === "darwin") {
                    exec(
                        `osascript -e 'tell application "System Events" to keystroke "v" using command down'`,
                        (err) => {
                            if (err) log.warn("macOS 快速粘贴失败:", err.message);
                        },
                    );
                } else if (process.platform === "linux") {
                    exec("xdotool key ctrl+v", (err) => {
                        if (err)
                            log.warn(
                                "Linux 快速粘贴失败: xdotool 不可用，请安装: sudo apt install xdotool",
                            );
                    });
                }
            }, 100);
        }
    });

    ipcMain.on("quick-paste-close", () => {
        const quickPasteWindow = getQuickPasteWindow();
        if (quickPasteWindow && !quickPasteWindow.isDestroyed())
            quickPasteWindow.close();
    });
}

module.exports = setupCycleIpc;

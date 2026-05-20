const { dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

function setupFileIpc(ipcMain, db, log, getMainWindow) {
    ipcMain.handle("show-save-dialog", async (_, options) => {
        try {
            const mainWindow = getMainWindow();
            const result = await dialog.showSaveDialog(mainWindow, options);
            return result;
        } catch (err) {
            log.error("show-save-dialog error:", err);
            return { canceled: true };
        }
    });

    ipcMain.handle("show-open-dialog", async (_, options) => {
        try {
            const mainWindow = getMainWindow();
            const result = await dialog.showOpenDialog(mainWindow, options);
            return result;
        } catch (err) {
            log.error("show-open-dialog error:", err);
            return { canceled: true };
        }
    });

    ipcMain.handle("write-file", async (_, { filePath, content }) => {
        try {
            fs.writeFileSync(filePath, content, "utf8");
            return { success: true };
        } catch (err) {
            log.error("write-file error:", err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("read-file", async (_, { filePath }) => {
        try {
            const content = fs.readFileSync(filePath, "utf8");
            return { success: true, content };
        } catch (err) {
            log.error("read-file error:", err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("open-in-explorer", async (_, filePath) => {
        try {
            if (!fs.existsSync(filePath)) {
                return { success: false, error: "路径不存在" };
            }
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
                await shell.openPath(filePath);
            } else {
                await shell.openPath(path.dirname(filePath));
            }
            return { success: true };
        } catch (err) {
            log.error("open-in-explorer error:", err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("open-in-terminal", async (_, filePath) => {
        try {
            let targetDir = filePath;

            if (fs.existsSync(filePath)) {
                const stat = fs.statSync(filePath);
                if (stat.isFile()) {
                    targetDir = path.dirname(filePath);
                }
            } else {
                return { success: false, error: "路径不存在" };
            }

            const { exec, spawn } = require("child_process");
            if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
                return { success: false, error: 'Invalid directory path' };
            }
            targetDir = path.resolve(targetDir);
            if (process.platform === "win32") {
                exec("where wt", (err) => {
                    if (!err) {
                        spawn('wt', ['-d', targetDir], { windowsHide: true, shell: false, detached: true }).unref();
                    } else {
                        spawn('cmd', ['/c', 'start', 'cmd', '/K', `cd /d ${targetDir}`], { windowsHide: true, shell: false, detached: true }).unref();
                    }
                });
            } else if (process.platform === "darwin") {
                spawn('open', ['-a', 'Terminal', targetDir], { detached: true }).unref();
            } else {
                spawn('gnome-terminal', ['--working-directory', targetDir], { detached: true }).unref();
            }
            return { success: true };
        } catch (err) {
            log.error("open-in-terminal error:", err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("check-path-exists", async (_, filePath) => {
        try {
            if (!fs.existsSync(filePath)) {
                return { exists: false, type: null };
            }
            const stat = fs.statSync(filePath);
            return {
                exists: true,
                type: stat.isFile() ? "file" : stat.isDirectory() ? "directory" : "other",
            };
        } catch (err) {
            return { exists: false, type: null };
        }
    });

    ipcMain.handle("batch-open-in-explorer", async (_, filePaths) => {
        try {
            let opened = 0;
            let failed = 0;
            for (const fp of filePaths) {
                if (fs.existsSync(fp)) {
                    const stat = fs.statSync(fp);
                    if (stat.isDirectory()) {
                        await shell.openPath(fp);
                    } else {
                        await shell.openPath(path.dirname(fp));
                    }
                    opened++;
                } else {
                    failed++;
                }
            }
            return { success: true, opened, failed };
        } catch (err) {
            log.error("batch-open-in-explorer error:", err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("copy-image-to-path", async (_, { srcPath, destPath }) => {
        try {
            const normalizedDest = path.normalize(destPath);
            if (normalizedDest.includes("..") || !normalizedDest.startsWith(path.resolve(destPath))) {
                return { success: false, error: "非法的目标路径" };
            }

            if (!fs.existsSync(srcPath)) {
                return { success: false, error: "源图片不存在" };
            }

            const destDir = path.dirname(normalizedDest);
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }

            fs.copyFileSync(srcPath, normalizedDest);
            return { success: true };
        } catch (err) {
            log.error("copy-image-to-path error:", err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("file-launch", async (_, filePath) => {
        try {
            const normalizedPath = filePath.trim().replace(/^["']|["']$/g, "");
            if (!fs.existsSync(normalizedPath)) {
                return { success: false, error: "文件不存在" };
            }
            await shell.openPath(normalizedPath);
            return { success: true, path: normalizedPath };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("file-open-explorer", async (_, filePath) => {
        try {
            const normalizedPath = filePath.trim().replace(/^["']|["']$/g, "");
            if (!fs.existsSync(normalizedPath)) {
                const parentDir = path.dirname(normalizedPath);
                if (fs.existsSync(parentDir)) {
                    await shell.openPath(parentDir);
                    return {
                        success: true,
                        path: parentDir,
                        note: "文件不存在，已打开父目录",
                    };
                }
                return { success: false, error: "路径不存在" };
            }
            const stat = fs.statSync(normalizedPath);
            if (stat.isDirectory()) {
                await shell.openPath(normalizedPath);
            } else {
                await shell.openPath(path.dirname(normalizedPath));
            }
            return { success: true, path: normalizedPath };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("file-open-terminal", async (_, filePath) => {
        try {
            const { spawn } = require("child_process");
            const normalizedPath = filePath.trim().replace(/^["']|["']$/g, "");
            const targetDir =
                fs.existsSync(normalizedPath) && fs.statSync(normalizedPath).isFile()
                    ? path.dirname(normalizedPath)
                    : normalizedPath;
            if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
                return { success: false, error: "路径不存在或不是目录" };
            }
            const safeDir = path.resolve(targetDir);
            const wtPath = path.join(
                process.env.LOCALAPPDATA,
                "Microsoft",
                "WindowsApps",
                "wt.exe",
            );
            if (fs.existsSync(wtPath)) {
                spawn(wtPath, ['-d', safeDir], { windowsHide: true, shell: false, detached: true }).unref();
            } else {
                spawn('cmd', ['/c', 'start', 'cmd', '/k', `cd /d ${safeDir}`], { windowsHide: true, shell: false, detached: true }).unref();
            }
            return { success: true, path: safeDir };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });
}

module.exports = setupFileIpc;

const { nativeImage, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

function setupPreviewIpc(ipcMain, log) {
    ipcMain.handle("get-image-info", async (_, filePath) => {
        try {
            if (!fs.existsSync(filePath)) {
                return { success: false, error: "文件不存在" };
            }
            const stat = fs.statSync(filePath);
            const img = nativeImage.createFromPath(filePath);
            const size = img.getSize();
            const ext = path
                .extname(filePath)
                .toLowerCase()
                .replace(".", "")
                .toUpperCase();
            const formatMap = {
                PNG: "PNG",
                JPG: "JPEG",
                JPEG: "JPEG",
                GIF: "GIF",
                BMP: "BMP",
                WEBP: "WebP",
                SVG: "SVG",
                ICO: "ICO",
                TIFF: "TIFF",
                TIF: "TIFF",
                AVIF: "AVIF",
            };
            return {
                success: true,
                width: size.width,
                height: size.height,
                format: formatMap[ext] || ext,
                fileSize: stat.size,
                fileName: path.basename(filePath),
                aspectRatio: (size.width / size.height).toFixed(2),
            };
        } catch (err) {
            log.error("get-image-info error:", err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("read-file-preview", async (_, filePath) => {
        try {
            if (!fs.existsSync(filePath)) {
                return { success: false, error: "文件不存在" };
            }
            const stat = fs.statSync(filePath);
            const maxSize = 100 * 1024;
            const textExtensions = new Set([
                ".txt",
                ".md",
                ".markdown",
                ".json",
                ".csv",
                ".tsv",
                ".xml",
                ".html",
                ".htm",
                ".css",
                ".js",
                ".jsx",
                ".ts",
                ".tsx",
                ".py",
                ".java",
                ".c",
                ".cpp",
                ".h",
                ".hpp",
                ".cs",
                ".go",
                ".rs",
                ".rb",
                ".php",
                ".sh",
                ".bash",
                ".ps1",
                ".bat",
                ".cmd",
                ".yaml",
                ".yml",
                ".toml",
                ".ini",
                ".conf",
                ".cfg",
                ".env",
                ".sql",
                ".log",
                ".gitignore",
                ".dockerignore",
                ".editorconfig",
                ".vue",
                ".svelte",
                ".astro",
                ".scss",
                ".sass",
                ".less",
                ".lua",
                ".r",
                ".m",
                ".swift",
                ".kt",
                ".kts",
                ".dart",
                ".zig",
            ]);
            const ext = path.extname(filePath).toLowerCase();
            if (!textExtensions.has(ext) && stat.size > maxSize) {
                return {
                    success: false,
                    error: "文件过大或格式不支持预览",
                    isTextFile: false,
                };
            }
            if (stat.size > maxSize) {
                return {
                    success: false,
                    error: `文件过大（${(stat.size / 1024).toFixed(0)}KB），超过 100KB 限制`,
                    isTextFile: true,
                };
            }
            const content = fs.readFileSync(filePath, "utf8");
            return {
                success: true,
                content,
                fileName: path.basename(filePath),
                fileSize: stat.size,
                extension: ext.replace(".", ""),
                isTruncated: false,
            };
        } catch (err) {
            log.error("read-file-preview error:", err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("copy-image-clipboard", async (_, filePath) => {
        try {
            if (!fs.existsSync(filePath)) {
                return { success: false, error: "文件不存在" };
            }
            const img = nativeImage.createFromPath(filePath);
            clipboard.writeImage(img);
            return { success: true };
        } catch (err) {
            log.error("copy-image-clipboard error:", err);
            return { success: false, error: err.message };
        }
    });
}

module.exports = setupPreviewIpc;

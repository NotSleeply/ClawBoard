/**
 * ClawBoard - 剪贴板监控核心
 */

const path = require('path');
const { app } = require('electron');

class ClipboardWatcher {
  constructor(db, clipboard, log, ai, ocr) {
    this.db = db;
    this.clipboard = clipboard;
    this.log = log;
    this.ai = ai;
    this.ocr = ocr; // v0.17.0 OCR服务
    this.interval = null;
    this.lastText = '';
    this.lastImage = '';
    this.pollInterval = 1000; // 每秒检查一次
    this.currentSource = { app: null, title: null, url: null }; // 来源应用信息
  }

  setCurrentSource(source) {
    this.currentSource = { ...this.currentSource, ...source };
  }

  start() {
    if (this.interval) return;

    // 初始化当前剪贴板内容
    this.lastText = this.clipboard.readText() || '';
    this.lastImage = this._getImageHash(this.clipboard.readImage());

    this.interval = setInterval(() => {
      this._check();
    }, this.pollInterval);

    this.log.info('剪贴板监控已启动');
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.log.info('剪贴板监控已停止');
    }
  }

  _check() {
    try {
      // 检查文本变化
      const currentText = this.clipboard.readText() || '';
      if (currentText && currentText !== this.lastText) {
        this.lastText = currentText;
        this._handleText(currentText);
        return;
      }

      // 检查图片变化
      const currentImage = this.clipboard.readImage();
      const currentHash = this._getImageHash(currentImage);
      if (!currentImage.isEmpty() && currentHash !== this.lastImage) {
        this.lastImage = currentHash;
        this._handleImage(currentImage);
        return;
      }
    } catch (err) {
      this.log.error('剪贴板检查出错:', err);
    }
  }

  _handleText(text) {
    const trimmed = text.trim();
    if (!trimmed) return;

    // v0.45.0: 检查忽略规则（含自动加密逻辑）
    if (global.ignoreRules) {
      const ignoreResult = global.ignoreRules.shouldIgnore(trimmed, {
        sourceApp: this.currentSource.app
      });

      // 自动加密：检测到敏感信息但需要加密而非忽略
      if (ignoreResult.autoEncrypt) {
        // 需要加密密钥才能自动加密
        if (global.db && global.db.encryptionKey) {
          this.log.info(`自动加密: ${ignoreResult.reason}`);
          // 继续处理，但标记为加密
          this._handleTextWithEncrypt(trimmed, ignoreResult.types);
          return;
        } else {
          // 没有加密密钥，仍记录但不加密，添加敏感类型标记
          this.log.warn('自动加密: 未设置加密密码，仅标记敏感类型');
        }
      } else if (ignoreResult.shouldIgnore) {
        this.log.info(`忽略剪贴板内容: ${ignoreResult.reason}`);
        return;
      }
    }

    // 判断类型
    let type = 'text';
    let content = trimmed;

    // 检测是否为文件路径
    if (this._isFilePath(trimmed)) {
      type = 'file';
    }
    // 检测是否为代码
    else if (this._isCode(trimmed)) {
      type = 'code';
    }

    // 检测代码语言
    const language = type === 'code' ? this._detectLanguage(trimmed) : null;

    // 检查去重
    const lastRecords = this.db.getRecords({ limit: 1 });
    if (lastRecords.length > 0 && lastRecords[0].content === trimmed && !lastRecords[0].locked) {
      this.log.info('内容重复，跳过记录');
      return;
    }

    // 异步生成 AI 摘要和嵌入向量
    this._generateAI(trimmed).then(aiResult => {
      // 保存到数据库
      const record = this.db.addRecord({
        type,
        content,
        summary: (aiResult && aiResult.summary) || this._generateSummary(trimmed),
        ai_summary: aiResult && aiResult.summary,
        embedding: aiResult && aiResult.embedding,
        language: language,
        source: 'clipboard',
      });

      this.log.info(`新记录: [${type}] ${trimmed.substring(0, 50)}...`);

      // 通知渲染进程
      if (global.mainWindow && !global.mainWindow.isDestroyed()) {
        global.mainWindow.webContents.send('new-record', record);
      }

      // v0.29.0: 触发系统通知
      if (global.showClipboardNotification) {
        global.showClipboardNotification(record);
      }
    }).catch(err => {
      this.log.warn('AI 处理失败，使用默认摘要:', err.message);
      // 降级处理
      const record = this.db.addRecord({
        type,
        content,
        summary: this._generateSummary(trimmed),
        source: 'clipboard',
      });

      this.log.info(`新记录: [${type}] ${trimmed.substring(0, 50)}...`);

      if (global.mainWindow && !global.mainWindow.isDestroyed()) {
        global.mainWindow.webContents.send('new-record', record);
      }

      // v0.29.0: 触发系统通知
      if (global.showClipboardNotification) {
        global.showClipboardNotification(record);
      }
    });
  }

  /**
   * v0.45.0: 处理需要自动加密的文本
   */
  _handleTextWithEncrypt(text, sensitiveTypes) {
    let type = 'text';
    if (this._isFilePath(text)) {
      type = 'file';
    } else if (this._isCode(text)) {
      type = 'code';
    }

    const language = type === 'code' ? this._detectLanguage(text) : null;
    const sensitiveTypesStr = sensitiveTypes.join(',');

    // 检查去重
    const lastRecords = this.db.getRecords({ limit: 1 });
    if (lastRecords.length > 0 && lastRecords[0].content === text && !lastRecords[0].locked) {
      this.log.info('内容重复，跳过记录');
      return;
    }

    this._generateAI(text).then(aiResult => {
      const record = this.db.addRecord({
        type,
        content: text,
        summary: (aiResult && aiResult.summary) || this._generateSummary(text),
        ai_summary: aiResult && aiResult.summary,
        embedding: aiResult && aiResult.embedding,
        language,
        source: 'clipboard',
        encrypted: true, // 自动加密
        sensitive_types: sensitiveTypesStr,
      });

      this.log.info(`自动加密记录: [${type}] ${sensitiveTypesStr} → 已加密`);

      if (global.mainWindow && !global.mainWindow.isDestroyed()) {
        global.mainWindow.webContents.send('new-record', record);
      }

      if (global.showClipboardNotification) {
        global.showClipboardNotification({
          ...record,
          _autoEncrypted: true,
          _sensitiveTypes: sensitiveTypes,
        });
      }
    }).catch(err => {
      this.log.warn('AI 处理失败，使用默认摘要:', err.message);
      const record = this.db.addRecord({
        type,
        content: text,
        summary: this._generateSummary(text),
        source: 'clipboard',
        encrypted: true,
        sensitive_types: sensitiveTypesStr,
      });

      this.log.info(`自动加密记录: [${type}] ${sensitiveTypesStr} → 已加密`);

      if (global.mainWindow && !global.mainWindow.isDestroyed()) {
        global.mainWindow.webContents.send('new-record', record);
      }

      if (global.showClipboardNotification) {
        global.showClipboardNotification({
          ...record,
          _autoEncrypted: true,
          _sensitiveTypes: sensitiveTypes,
        });
      }
    });
  }

  // 异步生成 AI 摘要和嵌入向量
  async _generateAI(text) {
    if (!this.ai || !text || text.length < 20) {
      return null;
    }

    try {
      // 检查 Ollama 是否可用
      const isHealthy = await this.ai.checkHealth();
      if (!isHealthy) {
        return null;
      }

      // 并行生成摘要和嵌入
      const [summary, embedding] = await Promise.all([
        this.ai.summarize(text).catch(() => null),
        this.ai.getEmbedding(text).catch(() => null)
      ]);

      return { summary, embedding };
    } catch (err) {
      this.log.warn('AI 处理失败:', err.message);
      return null;
    }
  }

  _handleImage(image) {
    try {
      const { nativeImage, app } = require('electron');
      const path = require('path');
      const fs = require('fs');

      // 保存图片
      const dataDir = path.join(app.getPath('userData'), 'images');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const filename = `clip_${Date.now()}.png`;
      const filepath = path.join(dataDir, filename);

      const imageBuffer = image.toPNG();
      fs.writeFileSync(filepath, imageBuffer);

      // v0.17.0: 异步进行 OCR 识别
      let ocrText = null;
      if (this.ocr) {
        this.ocr.recognizeClipboardImage(imageBuffer).then(ocrResult => {
          if (ocrResult.success && ocrResult.text) {
            // 更新记录的 OCR 文本
            this.db.updateOCRText(record.id, ocrResult.text);
            this.log.info(`图片 OCR 完成: ${ocrResult.text.substring(0, 50)}...`);

            // 通知渲染进程更新
            if (global.mainWindow && !global.mainWindow.isDestroyed()) {
              global.mainWindow.webContents.send('ocr-complete', { id: record.id, text: ocrResult.text });
            }
          }
        }).catch(err => {
          this.log.warn('OCR 识别失败:', err.message);
        });
      }

      // 保存到数据库（先保存，OCR 结果异步更新）
      const record = this.db.addRecord({
        type: 'image',
        content: filepath,
        summary: '[图片]',
        source: 'clipboard',
        ocr_text: ocrText, // 初始为空，OCR 完成后更新
      });

      this.log.info(`新图片记录: ${filename}`);

      // v0.29.0: 触发系统通知
      if (global.showClipboardNotification) {
        global.showClipboardNotification(record);
      }
    } catch (err) {
      this.log.error('保存图片失败:', err);
    }
  }

  _isFilePath(text) {
    const trimmed = text.trim();

    // Windows 路径
    const windowsPath = /^[a-zA-Z]:\\[\s\S]*$/;
    // UNC 路径
    const uncPath = /^\\\\[\s\S]+$/;

    // Unix 路径 (macOS/Linux) - v0.74.0: 跨平台适配
    // 绝对路径：以 / 开头，包含常见根目录
    const unixAbsolutePath = /^\/(Users|home|tmp|var|etc|opt|usr|root|srv|mnt|media)(\/[\w.\-+]+)+(\.\w+)?$/;
    // Home 目录缩写：~ 开头
    const homePath = /^~\/[\w.\-+]+(\/[\w.\-+]+)*(\.\w+)?$/;
    // 其他绝对路径（以 / 开头且包含多个层级）
    const otherAbsolutePath = /^\/[\w.\-+]+\/[\w./\-+]+(\.\w+)?$/;

    return windowsPath.test(trimmed) ||
      uncPath.test(trimmed) ||
      unixAbsolutePath.test(trimmed) ||
      homePath.test(trimmed) ||
      otherAbsolutePath.test(trimmed);
  }

  _isCode(text) {
    // 简单代码检测：包含常见代码关键词
    const codePatterns = [
      /^(const|let|var|function|class|import|export|def|public|private|if|for|while)\s/m,
      /[{}\[\]()].*[{}\[\]()]/,
      /<\/?[a-zA-Z][^>]*>/,  // HTML/XML 标签
      /^\s*(import|from|require)\s/m,
      /^\s*#include\s/m,
      /^\s*using\s+\w+/m,
      /=>|->|::|\.\.\./,
    ];
    return codePatterns.some(p => p.test(text));
  }

  _detectLanguage(text) {
    const trimmed = text.trim();

    // JavaScript/TypeScript
    if (/^(const|let|var|function|class|import|export|async|await)\s/.test(trimmed) ||
      /=>\s*{/.test(trimmed) || /\(.*\)\s*=>/.test(trimmed)) {
      return 'javascript';
    }
    // Python
    if (/^(def|class|import|from|if __name__|print\(|async def)\s/.test(trimmed)) {
      return 'python';
    }
    // HTML
    if (/<(!DOCTYPE|html|head|body|div|span|p|a|script|style)/i.test(trimmed)) {
      return 'html';
    }
    // CSS
    if (/^(\.|#)[\w-]+\s*{/.test(trimmed) ||
      /(margin|padding|color|background):\s*/.test(trimmed)) {
      return 'css';
    }
    // Java
    if (/^(public|private|protected|class|interface|void|static)\s/.test(trimmed)) {
      return 'java';
    }
    // C/C++
    if (/^(#include|#define|int main|void|printf|cout|std::)/.test(trimmed)) {
      return 'cpp';
    }
    // Go
    if (/^(package|func|import|type)\s/.test(trimmed) || /:=/.test(trimmed)) {
      return 'go';
    }
    // Rust
    if (/^(fn|let|mut|impl|struct|enum|use|pub)\s/.test(trimmed)) {
      return 'rust';
    }
    // SQL
    if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s/i.test(trimmed)) {
      return 'sql';
    }
    // JSON
    if (/^\s*{[\s\S]*}\s*$/.test(trimmed) && /"\w+":\s*/.test(trimmed)) {
      return 'json';
    }
    // Shell/Bash
    if (/^#!/.test(trimmed) || /^(echo|cd|ls|grep|awk|sed)\s/.test(trimmed)) {
      return 'bash';
    }

    return 'javascript';
  }

  _generateSummary(text) {
    // 生成简短摘要（避免过长）
    const trimmed = text.trim();
    if (trimmed.length <= 100) return trimmed;
    return trimmed.substring(0, 97) + '...';
  }

  _getImageHash(image) {
    if (image.isEmpty()) return '';
    try {
      const { nativeImage } = require('electron');
      const buffer = image.toPNG();
      // 简单哈希：取前1KB的CRC
      const partial = buffer.slice(0, 1024);
      let hash = 0;
      for (let i = 0; i < partial.length; i++) {
        hash = ((hash << 5) - hash) + partial[i];
        hash |= 0;
      }
      return hash.toString(16);
    } catch {
      return image.toDataURL().substring(0, 100);
    }
  }
}

module.exports = ClipboardWatcher;

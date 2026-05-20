/**
 * ClawBoard - 剪贴板监控核心 (CLI version)
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

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
          this._processText(trimmed, { encrypted: true, sensitive_types: ignoreResult.types });
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

    /** @type {{encrypted?: boolean, sensitive_types?: string[]}} */
    const defaultOptions = {};
    this._processText(trimmed, defaultOptions);
  }

  /**
   * v0.45.0: 处理需要自动加密的文本（保留向后兼容，内部委托给 _processText）
   */
  _handleTextWithEncrypt(text, sensitiveTypes) {
    this._processText(text, { encrypted: true, sensitive_types: sensitiveTypes });
  }

  /**
   * 统一文本处理流程，消除 _handleText 和 _handleTextWithEncrypt 之间的重复代码
   * @param {string} text - 剪贴板文本
   * @param {object} options - 可选标记
   * @param {boolean} options.encrypted - 是否自动加密
   * @param {string[]} options.sensitive_types - 敏感信息类型列表
   */
  _processText(
    text,
    options = /** @type {{encrypted?: boolean, sensitive_types?: string[]}} */ ({})
  ) {
    // 判断类型
    let type = 'text';
    if (this._isFilePath(text)) {
      type = 'file';
    } else if (this._isCode(text)) {
      type = 'code';
    }

    const language = type === 'code' ? this._detectLanguage(text) : null;
    const sensitiveTypesStr = options.sensitive_types ? options.sensitive_types.join(',') : null;
    const isEncrypted = !!options.encrypted;

    // 检查去重
    const lastRecords = this.db.getRecords({ limit: 1 });
    if (lastRecords.length > 0 && lastRecords[0].content === text && !lastRecords[0].locked) {
      this.log.info('内容重复，跳过记录');
      return;
    }

    const logPrefix = isEncrypted ? `自动加密记录` : '新记录';

    // 异步生成 AI 摘要和嵌入向量
    this._generateAI(text)
      .then(aiResult => {
        const record = this.db.addRecord({
          type,
          content: text,
          summary: (aiResult && aiResult.summary) || this._generateSummary(text),
          ai_summary: aiResult && aiResult.summary,
          embedding: aiResult && aiResult.embedding,
          language,
          source: 'clipboard',
          ...(isEncrypted ? { encrypted: true, sensitive_types: sensitiveTypesStr } : {})
        });

        this.log.info(
          `${logPrefix}: [${type}] ${isEncrypted ? sensitiveTypesStr + ' → ' : ''}${text.substring(0, 50)}...`
        );

        // v0.29.0: 触发系统通知
        if (global.showClipboardNotification) {
          const notificationData = isEncrypted
            ? { ...record, _autoEncrypted: true, _sensitiveTypes: options.sensitive_types }
            : record;
          global.showClipboardNotification(notificationData);
        }
      })
      .catch(err => {
        this.log.warn('AI 处理失败，使用默认摘要:', err.message);
        // 降级处理
        const record = this.db.addRecord({
          type,
          content: text,
          summary: this._generateSummary(text),
          source: 'clipboard',
          ...(isEncrypted ? { encrypted: true, sensitive_types: sensitiveTypesStr } : {})
        });

        this.log.info(
          `${logPrefix}: [${type}] ${isEncrypted ? sensitiveTypesStr + ' → ' : ''}${text.substring(0, 50)}...`
        );

        if (global.showClipboardNotification) {
          const notificationData = isEncrypted
            ? { ...record, _autoEncrypted: true, _sensitiveTypes: options.sensitive_types }
            : record;
          global.showClipboardNotification(notificationData);
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
      // 保存图片
      const dataDir = this._getDataDir();
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const filename = `clip_${Date.now()}.png`;
      const filepath = path.join(dataDir, filename);

      const imageBuffer = image.toPNG();
      fs.writeFileSync(filepath, imageBuffer);

      // v0.17.0: 保存到数据库（先保存，OCR 结果异步更新）
      const record = this.db.addRecord({
        type: 'image',
        content: filepath,
        summary: '[图片]',
        source: 'clipboard',
        ocr_text: null // OCR 完成后更新
      });

      // v0.17.0: 异步进行 OCR 识别（record 已声明，闭包安全）
      if (this.ocr) {
        this.ocr
          .recognizeClipboardImage(imageBuffer)
          .then(ocrResult => {
            if (ocrResult.success && ocrResult.text) {
              this.db.updateOCRText(record.id, ocrResult.text);
              this.log.info(`图片 OCR 完成: ${ocrResult.text.substring(0, 50)}...`);
            }
          })
          .catch(err => {
            this.log.warn('OCR 识别失败:', err.message);
          });
      }

      this.log.info(`新图片记录: ${filename}`);

      // v0.29.0: 触发系统通知
      if (global.showClipboardNotification) {
        global.showClipboardNotification(record);
      }
    } catch (err) {
      this.log.error('保存图片失败:', err);
    }
  }

  _getDataDir() {
    const homeDir = os.homedir();
    if (process.platform === 'win32') {
      return path.join(homeDir, 'AppData', 'Roaming', 'ClawBoard', 'images');
    }
    return path.join(homeDir, '.config', 'clawboard', 'images');
  }

  _isFilePath(text) {
    const trimmed = text.trim();

    // Windows 路径
    const windowsPath = /^[a-zA-Z]:\\[\s\S]*$/;
    // UNC 路径
    const uncPath = /^\\\\[\s\S]+$/;

    // Unix 路径 (macOS/Linux) - v0.74.0: 跨平台适配
    // 绝对路径：以 / 开头，包含常见根目录
    const unixAbsolutePath =
      /^\/(Users|home|tmp|var|etc|opt|usr|root|srv|mnt|media)(\/[\w.\-+]+)+(\.\w+)?$/;
    // Home 目录缩写：~ 开头
    const homePath = /^~\/[\w.\-+]+(\/[\w.\-+]+)*(\.\w+)?$/;
    // 其他绝对路径（以 / 开头且包含多个层级）
    const otherAbsolutePath = /^\/[\w.\-+]+\/[\w./\-+]+(\.\w+)?$/;

    return (
      windowsPath.test(trimmed) ||
      uncPath.test(trimmed) ||
      unixAbsolutePath.test(trimmed) ||
      homePath.test(trimmed) ||
      otherAbsolutePath.test(trimmed)
    );
  }

  _isCode(text) {
    // 简单代码检测：包含常见代码关键词
    const codePatterns = [
      /^(const|let|var|function|class|import|export|def|public|private|if|for|while)\s/m,
      /(?:[{}()]|\[|\]).*(?:[{}()]|\[|\])/,
      /<\/?[a-zA-Z][^>]*>/, // HTML/XML 标签
      /^\s*(import|from|require)\s/m,
      /^\s*#include\s/m,
      /^\s*using\s+\w+/m,
      /=>|->|::|\.{3}/
    ];
    return codePatterns.some(p => p.test(text));
  }

  _detectLanguage(text) {
    const trimmed = text.trim();

    // JavaScript/TypeScript
    if (
      /^(const|let|var|function|class|import|export|async|await)\s/.test(trimmed) ||
      /=>\s*{/.test(trimmed) ||
      /\(.*\)\s*=>/.test(trimmed)
    ) {
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
    if (
      /^(\.|#)[\w-]+\s*{/.test(trimmed) ||
      /(margin|padding|color|background):\s*/.test(trimmed)
    ) {
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
      const buffer = image.toPNG();
      // 简单哈希：取前1KB的CRC
      const partial = buffer.slice(0, 1024);
      let hash = 0;
      for (let i = 0; i < partial.length; i++) {
        hash = (hash << 5) - hash + partial[i];
        hash |= 0;
      }
      return hash.toString(16);
    } catch {
      return '';
    }
  }
}

module.exports = ClipboardWatcher;

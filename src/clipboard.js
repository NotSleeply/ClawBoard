/**
 * ClawBoard - 剪贴板监控核心
 */

const path = require('path');
const { app } = require('electron');

class ClipboardWatcher {
  constructor(db, clipboard, log, ai) {
    this.db = db;
    this.clipboard = clipboard;
    this.log = log;
    this.ai = ai;
    this.interval = null;
    this.lastText = '';
    this.lastImage = '';
    this.pollInterval = 1000; // 每秒检查一次
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

      fs.writeFileSync(filepath, image.toPNG());

      // 保存到数据库
      const record = this.db.addRecord({
        type: 'image',
        content: filepath,
        summary: '[图片]',
        source: 'clipboard',
      });

      this.log.info(`新图片记录: ${filename}`);
    } catch (err) {
      this.log.error('保存图片失败:', err);
    }
  }

  _isFilePath(text) {
    // Windows 文件路径检测
    const windowsPath = /^[a-zA-Z]:\\[\s\S]*$/;
    // UNC 路径
    const uncPath = /^\\\\[\s\S]+$/;
    return windowsPath.test(text.trim()) || uncPath.test(text.trim());
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
    if (/^#!/ .test(trimmed) || /^(echo|cd|ls|grep|awk|sed)\s/.test(trimmed)) {
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

class ClipboardWatcher {
  constructor(db, clipboard, log, ai) {
    this.db = db;
    this.clipboard = clipboard;
    this.log = log;
    this.ai = ai;
    this.interval = null;
    this.lastText = '';
    this.pollInterval = 1000;
    this.currentSource = { app: null, title: null, url: null };
  }

  setCurrentSource(source) {
    this.currentSource = { ...this.currentSource, ...source };
  }

  start() {
    if (this.interval) return;

    this.lastText = this.clipboard.readText() || '';

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
      const currentText = this.clipboard.readText() || '';
      if (currentText && currentText !== this.lastText) {
        this.lastText = currentText;
        this._handleText(currentText);
      }
    } catch (err) {
      this.log.error('剪贴板检查出错:', err.message);
    }
  }

  _handleText(text) {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (global.ignoreRules) {
      const ignoreResult = global.ignoreRules.shouldIgnore(trimmed, {
        sourceApp: this.currentSource.app
      });

      if (ignoreResult.autoEncrypt) {
        if (global.db && global.db.encryptionKey) {
          this.log.info(`自动加密: ${ignoreResult.reason}`);
          this._processText(trimmed, { encrypted: true, sensitive_types: ignoreResult.types });
          return;
        } else {
          this.log.warn('自动加密: 未设置加密密码，仅标记敏感类型');
        }
      } else if (ignoreResult.shouldIgnore) {
        this.log.info(`忽略剪贴板内容: ${ignoreResult.reason}`);
        return;
      }
    }

    this._processText(trimmed, {});
  }

  _processText(text, options = {}) {
    let type = 'text';
    if (this._isFilePath(text)) {
      type = 'file';
    } else if (this._isCode(text)) {
      type = 'code';
    }

    const language = type === 'code' ? this._detectLanguage(text) : null;
    const sensitiveTypesStr = options.sensitive_types ? options.sensitive_types.join(',') : null;
    const isEncrypted = !!options.encrypted;

    const lastRecords = this.db.getRecords({ limit: 1 });
    if (lastRecords.length > 0 && lastRecords[0].content === text && !lastRecords[0].locked) {
      this.log.info('内容重复，跳过记录');
      return;
    }

    const logPrefix = isEncrypted ? '自动加密记录' : '新记录';

    this._generateAI(text)
      .then(aiResult => {
        this.db.addRecord({
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

        if (global.showClipboardNotification) {
          global.showClipboardNotification({ type, content: text, encrypted: isEncrypted });
        }
      })
      .catch(err => {
        this.log.warn('AI 处理失败，使用默认摘要:', err.message);

        this.db.addRecord({
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
          global.showClipboardNotification({ type, content: text, encrypted: isEncrypted });
        }
      });
  }

  async _generateAI(text) {
    if (!this.ai || !text || text.length < 20) {
      return null;
    }

    try {
      const isHealthy = await this.ai.checkHealth();
      if (!isHealthy) {
        return null;
      }

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

  _isFilePath(text) {
    const trimmed = text.trim();
    const windowsPath = /^[a-zA-Z]:\\[\s\S]*$/;
    const uncPath = /^\\\\[\s\S]+$/;
    const unixAbsolutePath =
      /^\/(Users|home|tmp|var|etc|opt|usr|root|srv|mnt|media)(\/[\w.\-+]+)+(\.\w+)?$/;
    const homePath = /^~\/[\w.\-+]+(\/[\w.\-+]+)*(\.\w+)?$/;
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
    const codePatterns = [
      /^(const|let|var|function|class|import|export|def|public|private|if|for|while)\s/m,
      /(?:[{}()]|\[|\]).*(?:[{}()]|\[|\])/,
      /<\/?[a-zA-Z][^>]*>/,
      /^\s*(import|from|require)\s/m,
      /^\s*#include\s/m,
      /^\s*using\s+\w+/m,
      /=>|->|::|\.{3}/
    ];
    return codePatterns.some(p => p.test(text));
  }

  _detectLanguage(text) {
    const trimmed = text.trim();

    if (
      /^(const|let|var|function|class|import|export|async|await)\s/.test(trimmed) ||
      /=>\s*{/.test(trimmed) ||
      /\(.*\)\s*=>/.test(trimmed)
    ) {
      return 'javascript';
    }
    if (/^(def|class|import|from|if __name__|print\(|async def)\s/.test(trimmed)) {
      return 'python';
    }
    if (/<(!DOCTYPE|html|head|body|div|span|p|a|script|style)/i.test(trimmed)) {
      return 'html';
    }
    if (
      /^(\.|#)[\w-]+\s*{/.test(trimmed) ||
      /(margin|padding|color|background):\s*/.test(trimmed)
    ) {
      return 'css';
    }
    if (/^(public|private|protected|class|interface|void|static)\s/.test(trimmed)) {
      return 'java';
    }
    if (/^(#include|#define|int main|void|printf|cout|std::)/.test(trimmed)) {
      return 'cpp';
    }
    if (/^(package|func|import|type)\s/.test(trimmed) || /:=/.test(trimmed)) {
      return 'go';
    }
    if (/^(fn|let|mut|impl|struct|enum|use|pub)\s/.test(trimmed)) {
      return 'rust';
    }
    if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s/i.test(trimmed)) {
      return 'sql';
    }
    if (/^\s*{[\s\S]*}\s*$/.test(trimmed) && /"\w+":\s*/.test(trimmed)) {
      return 'json';
    }
    if (/^#!/.test(trimmed) || /^(echo|cd|ls|grep|awk|sed)\s/.test(trimmed)) {
      return 'bash';
    }

    return 'javascript';
  }

  _generateSummary(text) {
    const trimmed = text.trim();
    if (trimmed.length <= 100) return trimmed;
    return trimmed.substring(0, 97) + '...';
  }
}

module.exports = ClipboardWatcher;

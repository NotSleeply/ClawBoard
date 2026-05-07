/**
 * ClawBoard - OCR 文字识别模块 (Tesseract.js)
 * v0.17.0 新增功能
 */

const { createWorker } = require("tesseract.js");
const path = require("path");
const fs = require("fs");

class OCRService {
  constructor(options = {}) {
    const { langPath = null, cachePath = null } = options;
    this.worker = null;
    this.isReady = false;
    this.language = "chi_sim+eng"; // 简体中文 + 英文
    this.langPath = langPath;
    this.cachePath = cachePath;
    // v0.53.0: 支持的语言列表
    this.availableLanguages = [
      { code: "chi_sim", name: "简体中文", installed: true },
      { code: "chi_tra", name: "繁体中文", installed: false },
      { code: "eng", name: "英文", installed: true },
      { code: "jpn", name: "日语", installed: false },
      { code: "kor", name: "韩语", installed: false },
      { code: "fra", name: "法语", installed: false },
      { code: "deu", name: "德语", installed: false },
      { code: "spa", name: "西班牙语", installed: false },
      { code: "rus", name: "俄语", installed: false },
    ];
    this.currentLanguages = ["chi_sim", "eng"]; // 当前启用的语言
  }

  // v0.53.0: 获取可用语言列表
  getAvailableLanguages() {
    return this.availableLanguages;
  }

  // v0.53.0: 设置 OCR 语言
  async setLanguage(langCodes) {
    if (!Array.isArray(langCodes) || langCodes.length === 0) {
      return { success: false, error: "无效的语言代码" }; // 返回错误而非抛出
    }

    // 终止旧的 worker
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.isReady = false;
    }

    this.currentLanguages = langCodes;
    const langStr = langCodes.join("+");
    this.language = langStr;

    try {
      await this.init();
      return { success: true, language: langStr }; // 返回成功对象
    } catch (err) {
      console.error("OCR 语言切换失败:", err);
      return { success: false, error: err.message }; // 返回错误对象
    }
  }

  // v0.53.0: 获取当前语言设置
  getCurrentLanguage() {
    return this.currentLanguages;
  }

  _ensureCacheDir() {
    if (!this.cachePath) return;
    if (!fs.existsSync(this.cachePath)) {
      fs.mkdirSync(this.cachePath, { recursive: true });
    }
  }

  _getLocalLangConfig() {
    if (!this.langPath) return null;
    const langCodes = this.language.split("+").filter(Boolean);
    if (langCodes.length === 0) return null;

    const hasPlain = langCodes.every((code) =>
      fs.existsSync(path.join(this.langPath, `${code}.traineddata`)),
    );
    if (hasPlain) {
      return { langPath: this.langPath, gzip: false };
    }

    const hasGzip = langCodes.every((code) =>
      fs.existsSync(path.join(this.langPath, `${code}.traineddata.gz`)),
    );
    if (hasGzip) {
      return { langPath: this.langPath, gzip: true };
    }

    return null;
  }

  _getWorkerOptions() {
    const options = {};
    const localConfig = this._getLocalLangConfig();
    if (localConfig) {
      options.langPath = localConfig.langPath;
      options.gzip = localConfig.gzip;
    }
    if (this.cachePath) {
      options.cachePath = this.cachePath;
    }
    return options;
  }

  // 初始化 OCR Worker
  async init() {
    if (this.isReady) return true;

    try {
      this._ensureCacheDir();
      const workerOptions = this._getWorkerOptions();
      this.worker = await createWorker(this.language, 1, workerOptions);
      this.isReady = true;
      console.log("OCR 服务初始化成功");
      return true;
    } catch (err) {
      console.error("OCR 初始化失败:", err);
      return false;
    }
  }

  // 识别图片中的文字
  async recognize(imagePathOrBuffer) {
    if (!this.isReady) {
      const initialized = await this.init();
      if (!initialized) {
        return { success: false, text: "", error: "OCR 服务未就绪" };
      }
    }

    try {
      const result = await this.worker.recognize(imagePathOrBuffer);
      const text = result.data.text.trim();

      return {
        success: true,
        text: text,
        confidence: result.data.confidence,
        words: result.data.words.length,
      };
    } catch (err) {
      console.error("OCR 识别失败:", err);
      return { success: false, text: "", error: err.message };
    }
  }

  // 识别剪贴板图片（Buffer）
  async recognizeClipboardImage(imageBuffer) {
    return await this.recognize(imageBuffer);
  }

  // 终止 OCR Worker
  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.isReady = false;
    }
  }

  // 检查是否支持 OCR
  static isSupported() {
    try {
      require("tesseract.js");
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = OCRService;

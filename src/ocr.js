/**
 * ClawBoard - OCR 文字识别模块 (Tesseract.js)
 * v0.17.0 新增功能
 */

const { createWorker } = require('tesseract.js');
const path = require('path');

class OCRService {
  constructor() {
    this.worker = null;
    this.isReady = false;
    this.language = 'chi_sim+eng'; // 简体中文 + 英文
  }

  // 初始化 OCR Worker
  async init() {
    if (this.isReady) return true;
    
    try {
      this.worker = await createWorker(this.language);
      this.isReady = true;
      console.log('OCR 服务初始化成功');
      return true;
    } catch (err) {
      console.error('OCR 初始化失败:', err);
      return false;
    }
  }

  // 识别图片中的文字
  async recognize(imagePathOrBuffer) {
    if (!this.isReady) {
      const initialized = await this.init();
      if (!initialized) {
        return { success: false, text: '', error: 'OCR 服务未就绪' };
      }
    }

    try {
      const result = await this.worker.recognize(imagePathOrBuffer);
      const text = result.data.text.trim();
      
      return {
        success: true,
        text: text,
        confidence: result.data.confidence,
        words: result.data.words.length
      };
    } catch (err) {
      console.error('OCR 识别失败:', err);
      return { success: false, text: '', error: err.message };
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
      require('tesseract.js');
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = OCRService;

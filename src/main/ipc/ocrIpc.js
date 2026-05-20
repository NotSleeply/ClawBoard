function setupOcrIpc(ipcMain, ocrService, db, log) {
  ipcMain.handle("ocr-recognize", async (event, imagePath) => {
    try {
      if (!ocrService) {
        return { success: false, error: "OCR 服务未初始化" };
      }
      return await ocrService.recognize(imagePath);
    } catch (err) {
      log.error("ocr-recognize error:", err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("get-ocr-text", async (event, id) => {
    try {
      const record = db.getRecord(id);
      return record ? record.ocr_text : null;
    } catch (err) {
      log.error("get-ocr-text error:", err);
      return null;
    }
  });

  ipcMain.handle("get-ocr-languages", async () => {
    try {
      return ocrService.getAvailableLanguages();
    } catch (err) {
      log.error("get-ocr-languages error:", err);
      return [];
    }
  });

  ipcMain.handle("set-ocr-language", async (_, langCodes) => {
    try {
      const result = await ocrService.setLanguage(langCodes);
      return result;
    } catch (err) {
      log.error("set-ocr-language error:", err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("get-current-ocr-language", async () => {
    try {
      return { success: true, languages: ocrService.getCurrentLanguage() };
    } catch (err) {
      log.error("get-current-ocr-language error:", err);
      return {
        success: false,
        error: err.message,
        languages: ["chi_sim", "eng"],
      };
    }
  });
}

module.exports = setupOcrIpc;

const { clipboard } = require('electron');

function setupSnippetIpc(ipcMain, snippetsManager, getSnippets, getDb, log) {
  ipcMain.handle("get-snippets", async (_, options) => {
    try {
      if (!snippetsManager) {
        return { success: false, error: '未初始化', snippets: [] };
      }

      const snippets = snippetsManager.getAllSnippets(options || {});
      return { success: true, snippets };
    } catch (err) {
      log.error("get-snippets error:", err);
      return { success: false, error: err.message, snippets: [] };
    }
  });

  ipcMain.handle("render-snippet", async (_, snippetId, context) => {
    try {
      if (!snippetsManager) {
        return { success: false, error: '未初始化' };
      }

      const result = snippetsManager.renderSnippet(snippetId, context || {});
      return result;
    } catch (err) {
      log.error("render-snippet error:", err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("create-snippet", async (_, snippetData) => {
    try {
      if (!snippetsManager) {
        return { success: false, error: '未初始化' };
      }

      const snippet = snippetsManager.createSnippet(snippetData);
      return { success: true, snippet };
    } catch (err) {
      log.error("create-snippet error:", err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("update-snippet", async (_, id, updates) => {
    try {
      if (!snippetsManager) {
        return { success: false, error: '未初始化' };
      }

      const snippet = snippetsManager.updateSnippet(id, updates);
      return { success: !!snippet, snippet };
    } catch (err) {
      log.error("update-snippet error:", err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("delete-snippet", async (_, id) => {
    try {
      if (!snippetsManager) {
        return { success: false, error: '未初始化' };
      }

      const deleted = snippetsManager.deleteSnippet(id);
      return { success: deleted };
    } catch (err) {
      log.error("delete-snippet error:", err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("get-snippet-groups", async () => {
    try {
      if (!snippetsManager) {
        return { success: false, error: '未初始化', groups: [] };
      }

      const groups = snippetsManager.getGroups();
      return { success: true, groups };
    } catch (err) {
      log.error("get-snippet-groups error:", err);
      return { success: false, error: err.message, groups: [] };
    }
  });

  ipcMain.handle("get-snippet-stats", async () => {
    try {
      if (!snippetsManager) {
        return { success: false, error: '未初始化', stats: {} };
      }

      const stats = snippetsManager.getStats();
      return { success: true, stats };
    } catch (err) {
      log.error("get-snippet-stats error:", err);
      return { success: false, error: err.message, stats: {} };
    }
  });

  ipcMain.handle("export-snippets", async () => {
    try {
      if (!snippetsManager) {
        return { success: false, error: '未初始化', json: '' };
      }

      const json = snippetsManager.exportJSON();
      return { success: true, json };
    } catch (err) {
      log.error("export-snippets error:", err);
      return { success: false, error: err.message, json: '' };
    }
  });

  ipcMain.handle("import-snippets", async (_, jsonString) => {
    try {
      if (!snippetsManager) {
        return { success: false, error: '未初始化' };
      }

      const result = snippetsManager.importJSON(jsonString);
      return { success: true, ...result };
    } catch (err) {
      log.error("import-snippets error:", err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("snippets-get-all", async (_, category) => {
    try {
      const s = getSnippets();
      return s ? s.getAll(category) : { error: "Database not initialized" };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle("snippets-get-by-id", async (_, id) => {
    try {
      const s = getSnippets();
      return s ? s.getById(id) : { error: "Database not initialized" };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle("snippets-search", async (_, query) => {
    try {
      const s = getSnippets();
      return s ? s.search(query) : { error: "Database not initialized" };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle("snippets-create", async (_, data) => {
    try {
      const s = getSnippets();
      return s ? s.create(data) : { error: "Database not initialized" };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle("snippets-update", async (_, { id, ...updates }) => {
    try {
      const s = getSnippets();
      return s ? s.update(id, updates) : { error: "Database not initialized" };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle("snippets-delete", async (_, id) => {
    try {
      const s = getSnippets();
      return s ? s.delete(id) : { error: "Database not initialized" };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle("snippets-get-categories", async () => {
    try {
      const s = getSnippets();
      return s ? s.getCategories() : { error: "Database not initialized" };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle("snippets-get-by-shortcut", async (_, shortcut) => {
    try {
      const s = getSnippets();
      return s
        ? s.getByShortcut(shortcut)
        : { error: "Database not initialized" };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle("snippets-use", async (_, id) => {
    try {
      const s = getSnippets();
      if (!s) return { error: "Database not initialized" };
      const snippet = s.use(id);
      if (snippet) {
        const content = s.renderContent(snippet.content);
        clipboard.writeText(content);
      }
      return snippet;
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle(
    "snippets-create-from-record",
    async (_, { record, title, category }) => {
      try {
        const s = getSnippets();
        return s
          ? s.createFromRecord(record, { title, category })
          : { error: "Database not initialized" };
      } catch (e) {
        return { error: e.message };
      }
    },
  );

  ipcMain.handle("snippets-import", async (_, snippetList) => {
    try {
      const s = getSnippets();
      return s
        ? s.importSnippets(snippetList)
        : { error: "Database not initialized" };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle("snippets-export", async () => {
    try {
      const s = getSnippets();
      return s ? s.exportSnippets() : { error: "Database not initialized" };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle("snippets-stats", async () => {
    try {
      const s = getSnippets();
      return s ? s.getStats() : { error: "Database not initialized" };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle("snippets-render-content", async (_, content) => {
    try {
      const s = getSnippets();
      if (!s) return { error: "Database not initialized" };
      let rendered = s.renderContent(content);
      if (rendered.includes("{{clipboard}}")) {
        const currentClipboard = clipboard.readText();
        rendered = rendered.split("{{clipboard}}").join(currentClipboard || "");
      }
      return rendered;
    } catch (e) {
      return { error: e.message };
    }
  });
}

module.exports = setupSnippetIpc;

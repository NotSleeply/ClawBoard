/**
 * ClawBoard - 渲染进程应用
 */

(function() {
  'use strict';

  // ==================== 状态 ====================
  let currentFilter = 'all';
  let searchQuery = '';
  let records = [];
  let selectedRecord = null;
  let isLoading = false;
  let currentPreviewMode = 'raw'; // 'raw' | 'preview'
  // 多选模式状态
  let isMultiSelectMode = false;
  let selectedIds = new Set();
  let lastSelectedIndex = -1; // v0.51.0: Shift+click 范围选中的锚点索引
  // 视图模式：'list' | 'timeline'
  let currentViewMode = 'list';
  // 加密状态
  let isEncryptionUnlocked = false;
  // 标签筛选
  let currentTag = null;
  // 预设标签颜色
  const tagColors = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#ec4899', '#eab308', '#06b6d4', '#ef4444'];
  
  // 分组相关状态
  let groups = [];
  let currentGroupId = null; // null = 全部记录
  let draggedRecord = null;
  let draggedGroup = null;
  // v0.35.0: 搜索历史
  let searchHistory = [];
  const SEARCH_HISTORY_KEY = 'searchHistory';
  const SEARCH_HISTORY_MAX = 20;
  let searchHistoryDropdown = null;
  let isSearchHistoryOpen = false;

  // ==================== DOM 元素 ====================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const searchInput = $('#searchInput');
  const clearSearchBtn = $('#clearSearch');
  const recordsList = $('#recordsList');
  const emptyState = $('#emptyState');
  const loading = $('#loading');
  const detailPanel = $('#detailPanel');
  const settingsOverlay = $('#settingsOverlay');
  const totalCount = $('#totalCount');
  const toast = $('#toast');
  const toastMessage = $('#toastMessage');

  // ==================== 初始化 ====================
  async function init() {
    setupEventListeners();
    initShortcutRecording();  // 初始化快捷键录制
    initAboutPanel();         // v0.37.0: 初始化关于面板
    loadSearchHistory();      // v0.35.0: 加载搜索历史
    initSearchHistoryUI();    // v0.35.0: 初始化搜索历史下拉
    loadHoverPreviewSettings(); // v0.46.0: 加载悬浮预览设置
    await loadGroups();
    await loadRecords();
    await loadStats();
    setupIpcListeners();
  }

  function setupEventListeners() {
    // 搜索
    searchInput.addEventListener('input', debounce(handleSearch, 300));
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        handleSearch();
      }
      if (e.key === 'Enter') {
        handleSearch();
      }
      // v0.35.0: 搜索历史键盘导航
      if (e.key === 'ArrowDown' && isSearchHistoryOpen) {
        e.preventDefault();
        navigateSearchHistory(1);
      }
      if (e.key === 'ArrowUp' && isSearchHistoryOpen) {
        e.preventDefault();
        navigateSearchHistory(-1);
      }
    });
    // v0.35.0: 聚焦搜索框时显示历史
    searchInput.addEventListener('focus', () => {
      if (searchInput.value.trim() === '' && searchHistory.length > 0) {
        showSearchHistory();
      }
    });
    // v0.35.0: 点击外部关闭搜索历史
    document.addEventListener('click', (e) => {
      if (isSearchHistoryOpen && !e.target.closest('.search-box')) {
        closeSearchHistory();
      }
    });

    // 快捷键
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      }
      // 多选模式下 Ctrl+A 全选
      if (isMultiSelectMode && (e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        handleSelectAll();
      }
      // 多选模式下 Escape 退出
      if (isMultiSelectMode && e.key === 'Escape') {
        e.preventDefault();
        setMultiSelectMode(false);
      }
      // 键盘快捷操作
      if (selectedRecord) {
        if (e.key === 'Delete') {
          e.preventDefault();
          handleDeleteRecord();
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          handleCopyRecord();
        }
        if (e.key === 'Escape') {
          closeDetailPanel();
        }
      }
    });

    // 文件拖拽支持
    document.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.body.classList.add('drag-over');
    });

    document.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.body.classList.remove('drag-over');
    });

    document.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.body.classList.remove('drag-over');
      
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const filePaths = Array.from(files).map(f => f.path).join('\n');
        await window.ClawBoard.copyToClipboard(filePaths);
        showToast('✅ 文件路径已复制', 'success');
      }
    });

    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      handleSearch();
    });

    // 标签切换
    $$('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentFilter = tab.dataset.filter;
        loadRecords();
      });
    });

    // 设置面板
    $('#btnSettings').addEventListener('click', () => {
      loadSettings();
      settingsOverlay.classList.add('show');
    });

    // 设置标签切换
    $$('.settings-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.settings-tab').forEach(t => t.classList.remove('active'));
        $$('.settings-tab-content').forEach(c => c.classList.remove('show'));
        tab.classList.add('active');
        const tabId = 'settings' + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1);
        $('#' + tabId).classList.add('show');
        // v0.32.0: 切换到快捷模板 tab 时加载槽位
        if (tab.dataset.tab === 'hotkeys') loadHotkeySlots();
        // v0.37.0: 切换到关于 tab 时加载诊断信息
        if (tab.dataset.tab === 'about') loadDiagnostics();
        // v0.45.0: 切换到自动加密 tab 时加载规则
        if (tab.dataset.tab === 'autoEncrypt') loadAutoEncryptSettings();
        // v0.48.0: 切换到快捷片段 tab 时加载片段
        if (tab.dataset.tab === 'snippets') { loadSnippets(); initSnippetsUI(); }
        // v0.59.0: 切换到 AI 设置 tab 时加载 AI 配置
        if (tab.dataset.tab === 'aiSettings') loadAISettingsTab();
        // v0.66.0: 切换到监控 tab 时加载状态
        if (tab.dataset.tab === 'monitoring') loadMonitoringPanel();
        // v0.68.0: 切换到搜索 tab 时加载搜索设置
        if (tab.dataset.tab === 'search') loadSearchSettingsTab();
      });
    });

    $('#btnCloseSettings').addEventListener('click', () => {
      settingsOverlay.classList.remove('show');
    });

    settingsOverlay.addEventListener('click', (e) => {
      if (e.target === settingsOverlay) {
        settingsOverlay.classList.remove('show');
      }
    });

    $('#btnSaveSettings').addEventListener('click', handleSaveSettings);
    $('#btnClearHistory').addEventListener('click', handleClearHistory);
    $('#btnFindDuplicates').addEventListener('click', handleFindDuplicates);

    // v0.34.0: 导入导出按钮
    $('#btnExportJSON').addEventListener('click', handleExportJSON);
    $('#btnExportCSV').addEventListener('click', handleExportCSV);
    $('#btnImportJSON').addEventListener('click', handleImportJSON);

    // 详情面板
    $('#btnCloseDetail').addEventListener('click', closeDetailPanel);
    $('#btnCopy').addEventListener('click', handleCopyRecord);
    $('#btnFavorite').addEventListener('click', handleToggleFavorite);
    $('#btnDelete').addEventListener('click', handleDeleteRecord);

    // v0.47.0: 文件路径快捷操作
    $('#btnOpenExplorer').addEventListener('click', async () => {
      if (!selectedRecord || selectedRecord.type !== 'file') return;
      const result = await window.ClawBoard.openInExplorer(selectedRecord.content.trim());
      if (!result.success) {
        showToast(`无法打开: ${result.error}`, 'error');
      }
    });
    $('#btnOpenTerminal').addEventListener('click', async () => {
      if (!selectedRecord || selectedRecord.type !== 'file') return;
      const result = await window.ClawBoard.openInTerminal(selectedRecord.content.trim());
      if (!result.success) {
        showToast(`无法打开终端: ${result.error}`, 'error');
      }
    });

    // v0.38.0: 内容编辑器
    $('#btnEdit').addEventListener('click', openEditor);
    $('#btnCloseEditor').addEventListener('click', closeEditor);
    $('#btnCancelEditor').addEventListener('click', closeEditor);
    $('#btnSaveEditor').addEventListener('click', handleSaveEditor);
    $('#editorOverlay').addEventListener('click', (e) => {
      if (e.target === $('#editorOverlay')) closeEditor();
    });
    $('#editorWrapToggle').addEventListener('change', (e) => {
      const textarea = $('#editorTextarea');
      if (e.target.checked) {
        textarea.classList.remove('no-wrap');
        textarea.wrap = 'soft';
      } else {
        textarea.classList.add('no-wrap');
        textarea.wrap = 'off';
      }
    });
    // v0.44.0: 性能模式切换
    $('#editorPerfToggle').addEventListener('change', (e) => {
      togglePerfMode(e.target.checked);
      if (!e.target.checked) updateEditorStats();
      else {
        const textarea = $('#editorTextarea');
        const chars = textarea.value.length;
        $('#editorStats').textContent = `${chars} 字符 · 性能模式`;
      }
    });
    $('#editorTextarea').addEventListener('input', debouncedUpdateEditorStats);
    // Ctrl+S 保存
    $('#editorTextarea').addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveEditor();
      }
    });

    // 预览模式切换
    $$('.preview-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.preview-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentPreviewMode = btn.dataset.mode;
        renderPreviewContent(selectedRecord);
      });
    });

    // 多选模式按钮
    $('#btnMultiSelect').addEventListener('click', toggleMultiSelectMode);
    $('#btnSelectAll').addEventListener('click', handleSelectAll);
    $('#btnExitMultiSelect').addEventListener('click', () => setMultiSelectMode(false));
    $('#btnBatchMerge').addEventListener('click', handleBatchMerge);
    $('#btnBatchFavorite').addEventListener('click', handleBatchFavorite);
    $('#btnBatchDelete').addEventListener('click', handleBatchDelete);
    $('#btnBatchExport').addEventListener('click', handleBatchExport);
    $('#btnBatchMoveToGroup').addEventListener('click', handleBatchMoveToGroup);
    $('#btnBatchTag').addEventListener('click', handleBatchTag);           // v0.51.0
    $('#btnBatchEncrypt').addEventListener('click', handleBatchEncrypt);   // v0.51.0
    $('#btnBatchCopy').addEventListener('click', handleBatchCopy);         // v0.51.0

    // v0.62.0: Diff 对比按钮
    $('#btnBatchDiff').addEventListener('click', () => {
      if (selectedIds.size !== 2) {
        showToast('请选择恰好 2 条记录进行对比', 'error');
        return;
      }
      const ids = Array.from(selectedIds);
      Promise.all([window.ClawBoard.getRecord(ids[0]), window.ClawBoard.getRecord(ids[1])])
        .then(([a, b]) => openDiffPanel(a, b))
        .catch(() => showToast('加载记录失败', 'error'));
    });
    $('#btnCloseDiff').addEventListener('click', () => {
      document.getElementById('diffOverlay').classList.remove('show');
    });
    document.getElementById('diffOverlay').addEventListener('click', (e) => {
      if (e.target === document.getElementById('diffOverlay')) {
        document.getElementById('diffOverlay').classList.remove('show');
      }
    });
    document.querySelectorAll('.diff-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.diff-view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentDiffView = btn.dataset.view;
        if (document.getElementById('diffOverlay').classList.contains('show') && diffRecordA && diffRecordB) {
          renderDiffContent(diffRecordA, diffRecordB);
        }
      });
    });

    // v0.51.0: 批量标签对话框
    $('#btnCloseBatchTag').addEventListener('click', () => $('#batchTagOverlay').classList.remove('show'));
    $('#btnCancelBatchTag').addEventListener('click', () => $('#batchTagOverlay').classList.remove('show'));
    $('#btnConfirmBatchTag').addEventListener('click', handleConfirmBatchTag);
    $('#batchTagOverlay').addEventListener('click', (e) => { if (e.target === $('#batchTagOverlay')) $('#batchTagOverlay').classList.remove('show'); });

    // v0.51.0: 右键菜单事件
    document.querySelectorAll('#multiSelectContextMenu .context-menu-item').forEach(item => {
      item.addEventListener('click', () => handleContextMenuAction(item.dataset.action));
    });
    document.addEventListener('click', () => { const cm = $('#multiSelectContextMenu'); if (cm) cm.style.display = 'none'; });

    // 分组管理
    $('#btnAddGroup').addEventListener('click', () => showGroupDialog());
    $('#btnCloseGroup').addEventListener('click', () => $('#groupOverlay').classList.remove('show'));
    $('#btnCancelGroup').addEventListener('click', () => $('#groupOverlay').classList.remove('show'));
    $('#btnConfirmGroup').addEventListener('click', handleConfirmGroup);
    $('#btnDeleteGroup').addEventListener('click', handleDeleteGroup);
    $('#groupOverlay').addEventListener('click', (e) => {
      if (e.target === $('#groupOverlay')) $('#groupOverlay').classList.remove('show');
    });

    // 图标选择
    $$('.icon-option').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.icon-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        $('#selectedGroupIcon').value = btn.dataset.icon;
      });
    });

    // 颜色选择
    $$('.color-option').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.color-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        $('#selectedGroupColor').value = btn.dataset.color;
      });
    });

    // 移动到分组
    $('#btnCloseMoveToGroup').addEventListener('click', () => $('#moveToGroupOverlay').classList.remove('show'));
    $('#moveToGroupOverlay').addEventListener('click', (e) => {
      if (e.target === $('#moveToGroupOverlay')) $('#moveToGroupOverlay').classList.remove('show');
    });

    // 统计导出
    $('#btnCloseExport').addEventListener('click', () => $('#exportOverlay').classList.remove('show'));
    $('#exportOverlay').addEventListener('click', (e) => {
      if (e.target === $('#exportOverlay')) $('#exportOverlay').classList.remove('show');
    });
    $('#btnExportStatsJSON').addEventListener('click', () => handleExportStats('json'));
    $('#btnExportStatsCSV').addEventListener('click', () => handleExportStats('csv'));
    $('#btnExportRecords').addEventListener('click', handleExportRecords);

    // 合并对话框
    $('#btnCloseMerge').addEventListener('click', () => {
      $('#mergeOverlay').classList.remove('show');
    });
    $('#mergeOverlay').addEventListener('click', (e) => {
      if (e.target === $('#mergeOverlay')) {
        $('#mergeOverlay').classList.remove('show');
      }
    });
    $('#btnCancelMerge').addEventListener('click', () => {
      $('#mergeOverlay').classList.remove('show');
    });
    $('#btnConfirmMerge').addEventListener('click', handleConfirmMerge);

    // 视图切换
    $('#btnViewToggle').addEventListener('click', toggleViewMode);

    // 加密功能
    $('#btnEncryption').addEventListener('click', () => {
      $('#encryptionOverlay').classList.add('show');
      updateEncryptionUI();
    });

    // 统计面板
    $('#btnStats').addEventListener('click', async () => {
      $('#statsOverlay').classList.add('show');
      await loadDetailedStats();
    });

    // 运行状态面板
    $('#btnRuntimeStats').addEventListener('click', async () => {
      $('#runtimeStatsOverlay').classList.add('show');
      await loadRuntimeStats();
    });
    $('#btnCloseRuntimeStats').addEventListener('click', () => {
      $('#runtimeStatsOverlay').classList.remove('show');
    });
    $('#runtimeStatsOverlay').addEventListener('click', (e) => {
      if (e.target === $('#runtimeStatsOverlay')) {
        $('#runtimeStatsOverlay').classList.remove('show');
      }
    });

    // 置顶管理面板 v0.27.0
    $('#btnPinnedManager').addEventListener('click', async () => {
      $('#pinnedManagerOverlay').classList.add('show');
      await loadPinnedManager();
    });
    $('#btnClosePinnedManager').addEventListener('click', () => {
      $('#pinnedManagerOverlay').classList.remove('show');
    });
    $('#pinnedManagerOverlay').addEventListener('click', (e) => {
      if (e.target === $('#pinnedManagerOverlay')) {
        $('#pinnedManagerOverlay').classList.remove('show');
      }
    });

    // 置顶管理搜索和筛选
    $('#pinnedSearchInput').addEventListener('input', debounce(async () => {
      await loadPinnedList();
    }, 300));
    $('#pinnedTypeFilter').addEventListener('change', async () => {
      await loadPinnedList();
    });
    $('#pinnedTagFilter').addEventListener('change', async () => {
      await loadPinnedList();
    });

    // 云端同步面板 v0.28.0
    $('#btnCloudSync').addEventListener('click', async () => {
      $('#cloudSyncOverlay').classList.add('show');
      await loadSyncPanel();
    });
    $('#btnCloseCloudSync').addEventListener('click', () => {
      $('#cloudSyncOverlay').classList.remove('show');
    });
    $('#cloudSyncOverlay').addEventListener('click', (e) => {
      if (e.target === $('#cloudSyncOverlay')) {
        $('#cloudSyncOverlay').classList.remove('show');
      }
    });

    // 加密开关
    $('#syncEncrypt').addEventListener('change', (e) => {
      $('#syncEncryptKeyItem').style.display = e.target.checked ? 'block' : 'none';
    });

    // 测试连接
    $('#btnTestConnection').addEventListener('click', async () => {
      const config = getSyncConfigFromForm();
      if (!config.host) {
        showToast('请填写服务器地址', 'error');
        return;
      }
      
      $('#btnTestConnection').disabled = true;
      $('#btnTestConnection').textContent = '🔄 测试中...';
      
      try {
        const result = await window.ClawBoard.testWebDAVConnection(config);
        if (result.success) {
          showToast('连接成功！');
        } else {
          showToast(`连接失败: ${result.error || result.status}`, 'error');
        }
      } catch (err) {
        showToast('测试失败: ' + err.message, 'error');
      }
      
      $('#btnTestConnection').disabled = false;
      $('#btnTestConnection').textContent = '🔗 测试连接';
    });

    // 保存配置
    $('#btnSaveSyncConfig').addEventListener('click', async () => {
      const config = getSyncConfigFromForm();
      
      try {
        await window.ClawBoard.saveSyncConfig(config);
        showToast('配置已保存');
        await loadSyncPanel();
      } catch (err) {
        showToast('保存失败: ' + err.message, 'error');
      }
    });

    // 上传
    $('#btnSyncUpload').addEventListener('click', async () => {
      const config = getSyncConfigFromForm();
      if (!config.host) {
        showToast('请先配置并保存 WebDAV', 'error');
        return;
      }
      
      if (!confirm('确定要上传到云端吗？这将覆盖云端的数据。')) return;
      
      $('#syncProgress').style.display = 'block';
      $('#syncProgressText').textContent = '上传中...';
      $('#syncProgressFill').style.width = '0%';
      
      try {
        const result = await window.ClawBoard.syncToWebDAV(config);
        if (result.success) {
          $('#syncProgressFill').style.width = '100%';
          $('#syncProgressText').textContent = `上传完成！${result.recordCount} 条记录已同步`;
          showToast(`上传成功！${result.recordCount} 条记录`);
          await loadSyncPanel();
        } else {
          showToast(`上传失败: ${result.error || result.status}`, 'error');
          $('#syncProgress').style.display = 'none';
        }
      } catch (err) {
        showToast('上传失败: ' + err.message, 'error');
        $('#syncProgress').style.display = 'none';
      }
    });

    // 下载
    $('#btnSyncDownload').addEventListener('click', async () => {
      const config = getSyncConfigFromForm();
      if (!config.host) {
        showToast('请先配置并保存 WebDAV', 'error');
        return;
      }
      
      if (!confirm('确定要从云端下载吗？这将导入云端数据到本地。')) return;
      
      $('#syncProgress').style.display = 'block';
      $('#syncProgressText').textContent = '下载中...';
      $('#syncProgressFill').style.width = '0%';
      
      try {
        const result = await window.ClawBoard.syncFromWebDAV(config);
        if (result.success) {
          $('#syncProgressFill').style.width = '100%';
          $('#syncProgressText').textContent = `下载完成！导入 ${result.imported} 条记录`;
          showToast(`下载成功！导入 ${result.imported} 条记录`);
          await loadSyncPanel();
        } else {
          showToast(`下载失败: ${result.error || result.status}`, 'error');
          $('#syncProgress').style.display = 'none';
        }
      } catch (err) {
        showToast('下载失败: ' + err.message, 'error');
        $('#syncProgress').style.display = 'none';
      }
    });

    function getSyncConfigFromForm() {
      const serverUrl = $('#syncServer').value.trim();
      let host = serverUrl;
      let protocol = 'https';
      
      // 解析 URL
      if (serverUrl.startsWith('http://')) {
        protocol = 'http';
        host = serverUrl.replace('http://', '').split('/')[0];
      } else if (serverUrl.startsWith('https://')) {
        host = serverUrl.replace('https://', '').split('/')[0];
      }
      
      const port = host.includes(':') ? parseInt(host.split(':')[1]) : (protocol === 'https' ? 443 : 80);
      if (host.includes(':')) host = host.split(':')[0];
      
      return {
        protocol,
        host,
        port,
        path: $('#syncPath').value.trim() || '/',
        username: $('#syncUsername').value.trim(),
        password: $('#syncPassword').value,
        encrypt: $('#syncEncrypt').checked,
        encryptionKey: $('#syncEncryptKey').value,
        onlyFavorites: $('#syncOnlyFavorites').checked,
      };
    }

    async function loadSyncPanel() {
      try {
        // 加载同步元数据
        const metadata = await window.ClawBoard.getSyncMetadata();
        
        // 更新状态显示
        if (metadata.config && metadata.config.host) {
          $('#syncServer').value = `${metadata.config.protocol}://${metadata.config.host}:${metadata.config.port}`;
          $('#syncPath').value = metadata.config.path || '/';
          $('#syncUsername').value = metadata.config.username || '';
          $('#syncPassword').value = metadata.config.password || '';
          $('#syncEncrypt').checked = metadata.config.encrypt !== false;
          $('#syncOnlyFavorites').checked = metadata.config.onlyFavorites || false;
          $('#syncEncryptKeyItem').style.display = metadata.config.encrypt ? 'block' : 'none';
          $('#syncEncryptKey').value = metadata.config.encryptionKey || '';
          
          $('#syncStatusText').textContent = '已配置';
          $('#syncStatusDetail').textContent = metadata.lastSyncTime 
            ? `上次同步: ${formatTime(metadata.lastSyncTime)}`
            : '从未同步';
          $('#syncStatusIcon').textContent = '☁️';
          
          $('#btnSyncUpload').disabled = false;
          $('#btnSyncDownload').disabled = false;
        } else {
          $('#syncStatusText').textContent = '未配置';
          $('#syncStatusDetail').textContent = '点击配置 WebDAV 同步';
          $('#btnSyncUpload').disabled = true;
          $('#btnSyncDownload').disabled = true;
        }
        
        // 加载同步统计
        const stats = await window.ClawBoard.getSyncStats();
        if (stats) {
          $('#syncStats').style.display = 'block';
          $('#syncTotalRecords').textContent = stats.total;
          $('#syncSyncedRecords').textContent = stats.synced;
          $('#syncPendingRecords').textContent = stats.pending;
        }
      } catch (err) {
        console.error('加载同步面板失败:', err);
      }
    }

    // 统计导出按钮
    const originalLoadDetailedStats = loadDetailedStats;
    window.loadDetailedStats = async function() {
      await originalLoadDetailedStats();
      // 添加导出按钮
      const statsContent = $('#statsContent');
      const exportBtn = document.createElement('button');
      exportBtn.className = 'btn-secondary';
      exportBtn.style.marginTop = '1rem';
      exportBtn.style.width = '100%';
      exportBtn.textContent = '📥 导出统计报告';
      exportBtn.addEventListener('click', () => {
        $('#statsOverlay').classList.remove('show');
        $('#exportOverlay').classList.add('show');
      });
      statsContent.appendChild(exportBtn);

      // v0.69.0: 加载智能洞察
      await loadInsights();
    };

    // v0.69.0: 智能洞察按钮
    $('#btnGenerateInsights').addEventListener('click', loadInsights);

    // 标签面板
    $('#btnTags').addEventListener('click', async () => {
      $('#tagsOverlay').classList.add('show');
      await loadTags();
    });
    $('#btnCloseTags').addEventListener('click', () => {
      $('#tagsOverlay').classList.remove('show');
    });
    $('#tagsOverlay').addEventListener('click', (e) => {
      if (e.target === $('#tagsOverlay')) {
        $('#tagsOverlay').classList.remove('show');
      }
    });
    $('#btnClearTagFilter').addEventListener('click', () => {
      currentTag = null;
      $('#tagsFilter').style.display = 'none';
      $('#currentTagFilter').textContent = '';
      loadRecords();
    });

    // 标签输入
    $('#btnCloseTagInput').addEventListener('click', () => {
      $('#tagInputOverlay').classList.remove('show');
    });
    $('#tagInputOverlay').addEventListener('click', (e) => {
      if (e.target === $('#tagInputOverlay')) {
        $('#tagInputOverlay').classList.remove('show');
      }
    });
    $('#btnConfirmTag').addEventListener('click', handleConfirmTag);
    $('#newTagInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleConfirmTag();
    });
    $('#btnCloseStats').addEventListener('click', () => {
      $('#statsOverlay').classList.remove('show');
    });
    $('#statsOverlay').addEventListener('click', (e) => {
      if (e.target === $('#statsOverlay')) {
        $('#statsOverlay').classList.remove('show');
      }
    });

    $('#btnCloseEncryption').addEventListener('click', () => {
      $('#encryptionOverlay').classList.remove('show');
    });
    $('#encryptionOverlay').addEventListener('click', (e) => {
      if (e.target === $('#encryptionOverlay')) {
        $('#encryptionOverlay').classList.remove('show');
      }
    });
    $('#btnConfirmEncryption').addEventListener('click', handleSetEncryption);
    $('#btnLockEncryption').addEventListener('click', handleLockEncryption);
    $('#btnEncrypt').addEventListener('click', handleEncryptRecord);
    $('#btnDecrypt').addEventListener('click', handleDecryptRecord);
    $('#btnAddTag').addEventListener('click', () => {
      $('#tagInputOverlay').classList.add('show');
      $('#newTagInput').focus();
    });

    // v0.30.0: 备注按钮
    $('#btnNote').addEventListener('click', () => {
      const section = $('#detailNoteSection');
      const wasVisible = section.style.display !== 'none';
      if (wasVisible) {
        // 保存并关闭
        saveDetailNote();
        section.style.display = 'none';
      } else {
        section.style.display = 'block';
        $('#detailNoteInput').focus();
      }
    });

    // 备注输入框失焦自动保存
    $('#detailNoteInput').addEventListener('blur', () => {
      if ($('#detailNoteSection').style.display !== 'none') {
        saveDetailNote();
      }
    });

    // v0.17.0: OCR 复制按钮
    $('#btnCopyOCR').addEventListener('click', handleCopyOCR);

    // v0.41.0: QR 码按钮
    $('#btnQR').addEventListener('click', handleQRCode);
    $('#btnCloseQR').addEventListener('click', closeQROverlay);
    $('#btnCopyQRImage').addEventListener('click', copyQRImage);
    $('#btnSaveQRImage').addEventListener('click', saveQRImage);

    // 详情面板点击外部关闭
    detailPanel.addEventListener('click', (e) => {
      if (e.target === detailPanel) {
        closeDetailPanel();
      }
    });
  }

  // v0.17.0: 复制 OCR 结果
  async function handleCopyOCR() {
    if (!selectedRecord || !selectedRecord.ocr_text) return;
    try {
      await window.electron.copyToClipboard(selectedRecord.ocr_text);
      showToast('📋 OCR 文字已复制', 'success');
    } catch (err) {
      showToast('复制失败', 'error');
    }
  }

  function setupIpcListeners() {
    // 新记录通知
    window.ClawBoard.onNewRecord((record) => {
      if (currentFilter === 'all' || currentFilter === record.type) {
        records.unshift(record);
        renderRecords();
      }
      totalCount.textContent = parseInt(totalCount.textContent) + 1;
      showToast('📋 新记录已添加', 'success');
    });

    // v0.33.0: 加载转换列表
    try {
      transformList = await window.ClawBoard.listTransforms();
    } catch (e) {
      console.error('加载转换列表失败:', e);
    }

    // 搜索框聚焦
    window.ClawBoard.onFocusSearch(() => {
      searchInput.focus();
    });
  }

  // ==================== 数据加载 ====================
  async function loadRecords() {
    if (isLoading) return;
    isLoading = true;

    loading.classList.add('show');
    emptyState.classList.remove('show');
    recordsList.innerHTML = '';

    try {
      const options = { limit: 100, offset: 0 };

      if (currentFilter === 'favorite') {
        options.favorite = true;
      } else if (currentFilter !== 'all') {
        options.type = currentFilter;
      }

      if (currentTag) {
        options.tag = currentTag;
      }

      // 按分组筛选
      if (currentGroupId !== null) {
        options.groupId = currentGroupId;
      }

      // v0.68.0: 检测是否使用增强搜索语法
      const hasEnhancedSyntax = searchQuery && (
        /date:\d/.test(searchQuery) ||
        /type:\w/.test(searchQuery) ||
        /tag:\S/.test(searchQuery) ||
        /"[^"]+"/.test(searchQuery) ||
        /^\/.+\//.test(searchQuery)
      );

      if (searchQuery) {
        if (hasEnhancedSyntax) {
          // 增强搜索：先加载全部记录（不带搜索词），再客户端过滤
          records = await window.ClawBoard.getRecords({ ...options, search: undefined });
          records = enhancedSearchFilter(records, searchQuery);
        } else {
          options.search = searchQuery;
          records = await window.ClawBoard.search(searchQuery);
        }
      } else {
        records = await window.ClawBoard.getRecords(options);
      }

      renderRecords();
    } catch (err) {
      console.error('加载记录失败:', err);
    } finally {
      isLoading = false;
      loading.classList.remove('show');
    }
  }

  // ==================== 分组管理 ====================
  async function loadGroups() {
    try {
      groups = await window.ClawBoard.getAllGroups();
      renderGroups();
    } catch (err) {
      console.error('加载分组失败:', err);
    }
  }

  function renderGroups() {
    const groupsList = $('#groupsList');
    groupsList.innerHTML = `
      <div class="group-item ${currentGroupId === null ? 'active' : ''}" data-group-id="">
        <span class="group-icon">📋</span>
        <span class="group-name">全部记录</span>
      </div>
    `;

    groups.forEach(group => {
      const groupEl = document.createElement('div');
      groupEl.className = `group-item ${currentGroupId === group.id ? 'active' : ''}`;
      groupEl.dataset.groupId = group.id;
      groupEl.draggable = true;
      groupEl.innerHTML = `
        <span class="group-icon" style="color:${group.color}">${group.icon}</span>
        <span class="group-name">${escapeHtml(group.name)}</span>
        <button class="group-edit" title="编辑">✏️</button>
      `;

      // 点击选择分组
      groupEl.querySelector('.group-name').addEventListener('click', () => selectGroup(group.id));

      // 点击编辑
      groupEl.querySelector('.group-edit').addEventListener('click', (e) => {
        e.stopPropagation();
        showGroupDialog(group);
      });

      // 拖拽记录到分组
      groupEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        groupEl.classList.add('drag-over');
      });
      groupEl.addEventListener('dragleave', () => {
        groupEl.classList.remove('drag-over');
      });
      groupEl.addEventListener('drop', async (e) => {
        e.preventDefault();
        groupEl.classList.remove('drag-over');
        if (draggedRecord) {
          await window.ClawBoard.moveRecordToGroup(draggedRecord, group.id);
          showToast(`已移动到 ${group.name}`, 'success');
          draggedRecord = null;
          loadRecords();
        }
      });

      groupsList.appendChild(groupEl);
    });

    // "全部记录"点击事件
    groupsList.querySelector('[data-group-id=""]').addEventListener('click', () => selectGroup(null));
  }

  function selectGroup(groupId) {
    currentGroupId = groupId;
    renderGroups();
    loadRecords();
  }

  function showGroupDialog(group = null) {
    const overlay = $('#groupOverlay');
    const title = $('#groupDialogTitle');
    const nameInput = $('#groupName');
    const confirmBtn = $('#btnConfirmGroup');
    const deleteBtn = $('#btnDeleteGroup');
    const iconInput = $('#selectedGroupIcon');
    const colorInput = $('#selectedGroupColor');

    if (group) {
      title.textContent = '✏️ 编辑分组';
      nameInput.value = group.name;
      confirmBtn.textContent = '保存';
      deleteBtn.style.display = 'inline-block';
      iconInput.value = group.icon;
      colorInput.value = group.color;
      overlay.dataset.groupId = group.id;

      // 更新选中状态
      $$('.icon-option').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.icon === group.icon);
      });
      $$('.color-option').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.color === group.color);
      });
    } else {
      title.textContent = '📁 新建分组';
      nameInput.value = '';
      confirmBtn.textContent = '创建';
      deleteBtn.style.display = 'none';
      iconInput.value = '📁';
      colorInput.value = '#3b82f6';
      overlay.dataset.groupId = '';

      // 重置选中状态
      $$('.icon-option').forEach((btn, i) => btn.classList.toggle('selected', i === 0));
      $$('.color-option').forEach((btn, i) => btn.classList.toggle('selected', i === 0));
    }

    overlay.classList.add('show');
    nameInput.focus();
  }

  async function handleConfirmGroup() {
    const overlay = $('#groupOverlay');
    const groupId = overlay.dataset.groupId;
    const name = $('#groupName').value.trim();
    const icon = $('#selectedGroupIcon').value;
    const color = $('#selectedGroupColor').value;

    if (!name) {
      showToast('请输入分组名称', 'error');
      return;
    }

    try {
      if (groupId) {
        await window.ClawBoard.updateGroup(parseInt(groupId), { name, icon, color });
        showToast('✅ 分组已更新', 'success');
      } else {
        await window.ClawBoard.createGroup(name, color, icon);
        showToast('✅ 分组已创建', 'success');
      }
      overlay.classList.remove('show');
      await loadGroups();
    } catch (err) {
      showToast('❌ 操作失败', 'error');
    }
  }

  async function handleDeleteGroup() {
    const overlay = $('#groupOverlay');
    const groupId = overlay.dataset.groupId;
    if (!groupId) return;

    if (!confirm('确定要删除这个分组吗？分组内的记录将移到"未分组"。')) return;

    try {
      await window.ClawBoard.deleteGroup(parseInt(groupId));
      showToast('🗑️ 分组已删除', 'success');
      overlay.classList.remove('show');
      if (currentGroupId === parseInt(groupId)) {
        currentGroupId = null;
      }
      await loadGroups();
      await loadRecords();
    } catch (err) {
      showToast('❌ 删除失败', 'error');
    }
  }

  // ==================== 统计导出 ====================
  async function handleExportStats(format) {
    try {
      showToast('正在生成统计报告...', '');
      const stats = await window.ClawBoard.getStatsForExport();
      if (!stats) {
        showToast('❌ 获取统计数据失败', 'error');
        return;
      }

      let content;
      let filename;
      const timestamp = new Date().toISOString().slice(0, 10);

      if (format === 'csv') {
        // 生成 CSV 格式
        const rows = ['类别,项目,数值'];
        rows.push(`总统计,总记录数,${stats.summary.total}`);
        rows.push(`总统计,今日新增,${stats.summary.today}`);
        rows.push(`总统计,本周新增,${stats.summary.week}`);
        rows.push(`总统计,收藏数,${stats.summary.favorite}`);
        rows.push(`总统计,加密数,${stats.summary.encrypted}`);
        rows.push(`类型分布,文字,${stats.detailed.typePercent.text || 0}%`);
        rows.push(`类型分布,代码,${stats.detailed.typePercent.code || 0}%`);
        rows.push(`类型分布,文件,${stats.detailed.typePercent.file || 0}%`);
        rows.push(`类型分布,图片,${stats.detailed.typePercent.image || 0}%`);
        content = rows.join('\n');
        filename = `clawboard_stats_${timestamp}.csv`;
      } else {
        content = JSON.stringify(stats, null, 2);
        filename = `clawboard_stats_${timestamp}.json`;
      }

      const result = await window.ClawBoard.saveExportFile(content, filename);
      if (result.success) {
        showToast('✅ 统计报告已保存', 'success');
      } else if (!result.canceled) {
        showToast('❌ 保存失败', 'error');
      }
    } catch (err) {
      console.error('导出统计失败:', err);
      showToast('❌ 导出失败', 'error');
    }
  }

  async function handleExportRecords() {
    try {
      const format = $('#exportFormat').value;
      const type = $('#exportType').value;
      const favorite = $('#exportFavorite').checked;

      showToast('正在导出记录...', '');
      const content = await window.ClawBoard.exportRecords(format, { type, favorite });

      if (!content) {
        showToast('❌ 无记录可导出', 'error');
        return;
      }

      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `clawboard_records_${timestamp}.${format}`;

      const result = await window.ClawBoard.saveExportFile(content, filename);
      if (result.success) {
        showToast('✅ 记录已导出', 'success');
        $('#exportOverlay').classList.remove('show');
      } else if (!result.canceled) {
        showToast('❌ 保存失败', 'error');
      }
    } catch (err) {
      console.error('导出记录失败:', err);
      showToast('❌ 导出失败', 'error');
    }
  }

  async function handleBatchMoveToGroup() {
    if (selectedIds.size === 0) return;
    await showMoveToGroupDialog();
  }

  async function showMoveToGroupDialog() {
    const overlay = $('#moveToGroupOverlay');
    const list = $('#moveToGroupList');

    // 渲染分组列表
    let html = `
      <div class="move-group-item" data-group-id="">
        <span class="group-icon">📋</span>
        <span>未分组</span>
      </div>
    `;

    for (const group of groups) {
      html += `
        <div class="move-group-item" data-group-id="${group.id}">
          <span class="group-icon" style="color:${group.color}">${group.icon}</span>
          <span>${escapeHtml(group.name)}</span>
        </div>
      `;
    }

    list.innerHTML = html;

    // 绑定点击事件
    list.querySelectorAll('.move-group-item').forEach(item => {
      item.addEventListener('click', async () => {
        const targetGroupId = item.dataset.groupId === '' ? null : parseInt(item.dataset.groupId);
        const ids = Array.from(selectedIds);
        for (const id of ids) {
          await window.ClawBoard.moveRecordToGroup(id, targetGroupId);
        }
        overlay.classList.remove('show');
        setMultiSelectMode(false);
        showToast(`已移动 ${ids.length} 条记录`, 'success');
        await loadRecords();
      });
    });

    overlay.classList.add('show');
  }

  async function loadStats() {
    try {
      const stats = await window.ClawBoard.getStats();
      totalCount.textContent = stats.total;
    } catch (err) {
      console.error('加载统计失败:', err);
    }
  }

  // v0.26.0: 加载运行时状态
  async function loadRuntimeStats() {
    const loading = $('#runtimeStatsLoading');
    const content = $('#runtimeStatsContent');
    loading.style.display = 'flex';

    try {
      const stats = await window.ClawBoard.getRuntimeStats();
      loading.style.display = 'none';

      if (!stats) {
        content.innerHTML = '<p style="color:var(--muted);text-align:center;padding:2rem">加载失败</p>';
        return;
      }

      // 渲染运行时状态面板
      let html = `
        <div class="runtime-stats-grid">
          <div class="runtime-stats-card">
            <div class="runtime-stats-icon">📋</div>
            <div class="runtime-stats-info">
              <div class="runtime-stats-value">${stats.records.total}</div>
              <div class="runtime-stats-label">总记录</div>
            </div>
          </div>
          <div class="runtime-stats-card">
            <div class="runtime-stats-icon">💾</div>
            <div class="runtime-stats-info">
              <div class="runtime-stats-value">${stats.database.sizeFormatted}</div>
              <div class="runtime-stats-label">数据库</div>
            </div>
          </div>
        </div>

        <div class="runtime-stats-section">
          <div class="runtime-stats-section-title">📊 记录统计</div>
          <div class="runtime-stats-detail">
            <div class="detail-row">
              <span class="detail-label">📝 文字</span>
              <span class="detail-value">${stats.records.text}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">💻 代码</span>
              <span class="detail-value">${stats.records.code}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">📁 文件</span>
              <span class="detail-value">${stats.records.file}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">🖼️ 图片</span>
              <span class="detail-value">${stats.records.image}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">⭐ 收藏</span>
              <span class="detail-value">${stats.records.favorite}</span>
            </div>
          </div>
        </div>

        <div class="runtime-stats-section">
          <div class="runtime-stats-section-title">⚙️ 设置</div>
          <div class="runtime-stats-detail">
            <div class="detail-row">
              <span class="detail-label">🔢 最大记录数</span>
              <span class="detail-value">${stats.settings.maxRecords}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">🧹 自动清理</span>
              <span class="detail-value">${stats.settings.autoCleanup ? '✅ 开启' : '❌ 关闭'}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">🔒 加密存储</span>
              <span class="detail-value">${stats.settings.encryption ? '✅ 已启用' : '❌ 未启用'}</span>
            </div>
          </div>
        </div>

        <div class="runtime-stats-footer">
          <span class="version-info">${stats.version}</span>
        </div>
      `;

      content.innerHTML = html;
    } catch (err) {
      console.error('加载运行时状态失败:', err);
      loading.style.display = 'none';
      content.innerHTML = '<p style="color:var(--muted);text-align:center;padding:2rem">加载失败</p>';
    }
  }

  // v0.27.0: 置顶管理面板
  let pinnedSelectedIds = new Set();

  async function loadPinnedManager() {
    await loadPinnedStats();
    await loadPinnedList();
    await loadPinnedTags();
  }

  async function loadPinnedStats() {
    try {
      const stats = await window.ClawBoard.getPinnedStats();
      if (stats) {
        $('#pinnedTotal').textContent = stats.total;
        $('#pinnedThisWeek').textContent = stats.recentWeek;
        $('#pinnedWithTags').textContent = stats.withTags;
      }
    } catch (err) {
      console.error('加载置顶统计失败:', err);
    }
  }

  async function loadPinnedTags() {
    try {
      const tags = await window.ClawBoard.getAllTags();
      const select = $('#pinnedTagFilter');
      select.innerHTML = '<option value="">全部标签</option>';
      tags.forEach(tagInfo => {
        const option = document.createElement('option');
        option.value = tagInfo.tag;
        option.textContent = `${tagInfo.tag} (${tagInfo.count})`;
        select.appendChild(option);
      });
    } catch (err) {
      console.error('加载标签失败:', err);
    }
  }

  async function loadPinnedList() {
    const loading = $('#pinnedLoading');
    const list = $('#pinnedList');
    loading.style.display = 'flex';
    list.innerHTML = '';
    pinnedSelectedIds.clear();
    updatePinnedBatchBar();

    try {
      const search = $('#pinnedSearchInput').value;
      const type = $('#pinnedTypeFilter').value;
      const tag = $('#pinnedTagFilter').value;

      const records = await window.ClawBoard.getPinnedRecords({
        search: search || undefined,
        type: type || undefined,
        tag: tag || undefined,
      });

      loading.style.display = 'none';

      if (!records || records.length === 0) {
        list.innerHTML = '<p style="color:var(--muted);text-align:center;padding:2rem">暂无置顶记录</p>';
        return;
      }

      records.forEach(record => {
        const item = createPinnedItem(record);
        list.appendChild(item);
      });
    } catch (err) {
      console.error('加载置顶列表失败:', err);
      loading.style.display = 'none';
      list.innerHTML = '<p style="color:var(--muted);text-align:center;padding:2rem">加载失败</p>';
    }
  }

  function createPinnedItem(record) {
    const item = document.createElement('div');
    item.className = 'record-item pinned-item';
    item.dataset.id = record.id;

    const typeIcon = {
      text: '📝',
      code: '💻',
      file: '📁',
      image: '🖼️',
    }[record.type] || '📋';

    const content = record.encrypted ? '🔒 加密内容' : record.content;
    const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;

    let tagsHtml = '';
    if (record.tags && record.tags !== '[]') {
      try {
        const tags = JSON.parse(record.tags);
        if (tags.length > 0) {
          tagsHtml = '<div class="record-tags">' + tags.map(t => `<span class="record-tag">${t}</span>`).join('') + '</div>';
        }
      } catch (e) {}
    }

    item.innerHTML = `
      <div class="record-checkbox-wrapper">
        <input type="checkbox" class="pinned-checkbox" data-id="${record.id}">
      </div>
      <div class="record-type-icon">${typeIcon}</div>
      <div class="record-content-wrapper">
        <div class="record-content-preview">${escapeHtml(preview)}</div>
        ${tagsHtml}
        <div class="record-meta">
          <span class="record-time">${formatTime(record.created_at)}</span>
          ${record.source_app ? `<span class="record-source">📱 ${record.source_app}</span>` : ''}
        </div>
      </div>
      <div class="record-actions">
        <button class="record-btn pinned-edit-btn" data-id="${record.id}" title="编辑">✏️</button>
        <button class="record-btn pinned-copy-btn" data-id="${record.id}" title="复制">📋</button>
        <button class="record-btn danger pinned-remove-btn" data-id="${record.id}" title="取消置顶">⭐</button>
      </div>
    `;

    // 复选框事件
    const checkbox = item.querySelector('.pinned-checkbox');
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        pinnedSelectedIds.add(record.id);
      } else {
        pinnedSelectedIds.delete(record.id);
      }
      updatePinnedBatchBar();
    });

    // 复制按钮
    item.querySelector('.pinned-copy-btn').addEventListener('click', async () => {
      const fullRecord = await window.ClawBoard.getRecord(record.id);
      if (fullRecord && !fullRecord.encrypted) {
        await window.ClawBoard.copyToClipboard(fullRecord.content);
        showToast('已复制到剪贴板');
      }
    });

    // 取消置顶按钮
    item.querySelector('.pinned-remove-btn').addEventListener('click', async () => {
      if (confirm('确定取消置顶？')) {
        await window.ClawBoard.toggleFavorite(record.id);
        await loadPinnedList();
        await loadPinnedStats();
        showToast('已取消置顶');
      }
    });

    return item;
  }

  function updatePinnedBatchBar() {
    const batchBar = $('#pinnedBatchBar');
    const count = pinnedSelectedIds.size;
    $('#pinnedSelectedCount').textContent = count;
    batchBar.style.display = count > 0 ? 'flex' : 'none';
  }

  // 置顶批量操作
  $('#btnPinnedBatchUnfavorite').addEventListener('click', async () => {
    if (pinnedSelectedIds.size === 0) return;
    if (confirm(`确定取消置顶 ${pinnedSelectedIds.size} 条记录？`)) {
      await window.ClawBoard.batchUpdatePinned([...pinnedSelectedIds], { favorite: false });
      await loadPinnedList();
      await loadPinnedStats();
      showToast('已批量取消置顶');
    }
  });

  $('#btnPinnedBatchDelete').addEventListener('click', async () => {
    if (pinnedSelectedIds.size === 0) return;
    if (confirm(`确定删除 ${pinnedSelectedIds.size} 条置顶记录？`)) {
      await window.ClawBoard.batchUpdatePinned([...pinnedSelectedIds], { delete: true });
      await loadPinnedList();
      await loadPinnedStats();
      showToast('已批量删除');
    }
  });

  // v0.69.0: 加载智能洞察
  async function loadInsights() {
    const section = document.getElementById('insightsSection');
    const list = document.getElementById('insightsList');
    if (!section || !list) return;

    try {
      const insights = await window.ClawBoard.getInsights();
      if (!insights || insights.length === 0) {
        section.style.display = 'none';
        return;
      }

      section.style.display = 'block';
      list.innerHTML = insights.map(i => `
        <div class="insight-card insight-${i.priority}">
          <div class="insight-icon">${i.icon}</div>
          <div class="insight-content">
            <div class="insight-title">${escapeHtml(i.title)}</div>
            <div class="insight-desc">${escapeHtml(i.desc)}</div>
          </div>
        </div>
      `).join('');
    } catch (e) {
      console.error('Load insights failed:', e);
    }
  }

  async function loadDetailedStats() {
    const loading = $('#statsLoading');
    const content = $('#statsContent');
    loading.style.display = 'flex';

    try {
      const stats = await window.ClawBoard.getDetailedStats();
      loading.style.display = 'none';

      if (!stats) {
        content.innerHTML = '<p style="color:var(--muted);text-align:center;padding:2rem">加载失败</p>';
        return;
      }

      // 类型颜色
      const typeColors = {
        text: '#3b82f6',
        code: '#a855f7',
        file: '#22c55e',
        image: '#f97316',
      };

      // 渲染统计面板
      let html = `
        <div class="stats-grid">
          <div class="stats-card">
            <div class="stats-card-value">${stats.total}</div>
            <div class="stats-card-label">总记录数</div>
          </div>
          <div class="stats-card">
            <div class="stats-card-value">${stats.today}</div>
            <div class="stats-card-label">今日新增</div>
          </div>
          <div class="stats-card">
            <div class="stats-card-value">${stats.week}</div>
            <div class="stats-card-label">本周新增</div>
          </div>
          <div class="stats-card">
            <div class="stats-card-value">${stats.avgPerDay}</div>
            <div class="stats-card-label">日均记录</div>
          </div>
        </div>

        <div class="stats-section">
          <div class="stats-section-title">📈 近7天趋势</div>
          <div class="stats-trend">
      `;

      const maxTrend = Math.max(...stats.trend.map(t => t.count), 1);
      stats.trend.forEach(day => {
        const height = Math.max(4, Math.round((day.count / maxTrend) * 70));
        html += `
          <div class="stats-trend-bar" style="height:${height}px">
            <span class="bar-label">${day.label}</span>
          </div>
        `;
      });

      html += `
          </div>
        </div>

        <div class="stats-section">
          <div class="stats-section-title">📂 类型分布</div>
      `;

      const typeLabels = { text: '文字', code: '代码', file: '文件', image: '图片' };
      for (const [type, pct] of Object.entries(stats.typePercent)) {
        html += `
          <div class="stats-type-row">
            <span class="stats-type-label">${typeLabels[type] || type}</span>
            <div class="stats-type-bar">
              <div class="stats-type-bar-fill" style="width:${pct}%;background:${typeColors[type] || 'var(--accent)'}"></div>
            </div>
            <span class="stats-type-pct">${pct}%</span>
          </div>
        `;
      }

      html += `
          </div>
      `;

      // 最活跃时段
      if (stats.peakHours && stats.peakHours.length > 0) {
        html += `
          <div class="stats-section">
            <div class="stats-section-title">⏰ 最活跃时段</div>
            <div class="stats-peak-hours">
        `;
        stats.peakHours.forEach(h => {
          const label = `${String(h.hour).padStart(2, '0')}:00`;
          html += `<span class="stats-peak-hour">${label} (${h.count}条)</span>`;
        });
        html += `
            </div>
          </div>
        `;
      }

      // 其他统计
      html += `
        <div class="stats-section">
          <div class="stats-section-title">📋 其他统计</div>
        </div>
        <div class="stats-grid">
          <div class="stats-card">
            <div class="stats-card-value">${stats.favorite}</div>
            <div class="stats-card-label">⭐ 收藏数</div>
          </div>
          <div class="stats-card">
            <div class="stats-card-value">${stats.encrypted}</div>
            <div class="stats-card-label">🔒 加密数</div>
          </div>
          <div class="stats-card">
            <div class="stats-card-value">${stats.month}</div>
            <div class="stats-card-label">本月记录</div>
          </div>
          <div class="stats-card">
            <div class="stats-card-value">${stats.code}</div>
            <div class="stats-card-label">💻 代码数</div>
          </div>
        </div>
      `;

      // 系统健康状态 (v0.26.0)
      try {
        const health = await window.ClawBoard.getSystemHealth();
        if (health) {
          const memPercent = health.memoryTotal > 0 ? Math.round((health.memoryUsed / health.memoryTotal) * 100) : 0;
          html += `
            <div class="stats-section">
              <div class="stats-section-title">💻 系统状态</div>
              <div class="stats-health-grid">
                <div class="stats-health-item">
                  <span class="health-label">内存占用</span>
                  <div class="health-bar">
                    <div class="health-bar-fill" style="width:${memPercent}%;background:${memPercent > 80 ? 'var(--danger)' : 'var(--accent)'}"></div>
                  </div>
                  <span class="health-value">${health.memoryUsed} MB / ${health.memoryTotal} MB (${memPercent}%)</span>
                </div>
                <div class="stats-health-item">
                  <span class="health-label">进程内存(RSS)</span>
                  <span class="health-value">${health.rss} MB</span>
                </div>
                <div class="stats-health-item">
                  <span class="health-label">数据库大小</span>
                  <span class="health-value">${health.dbSizeMB} MB</span>
                </div>
                <div class="stats-health-item">
                  <span class="health-label">运行时长</span>
                  <span class="health-value">${health.uptimeFormatted}</span>
                </div>
              </div>
            </div>
          `;
        }
      } catch (e) {
        console.error('获取系统健康状态失败:', e);
      }

      content.innerHTML = html;
    } catch (err) {
      loading.style.display = 'none';
      content.innerHTML = '<p style="color:var(--muted);text-align:center;padding:2rem">加载失败: ' + err.message + '</p>';
    }
  }

  async function loadSettings() {
    try {
      const settings = await window.ClawBoard.getSettings();
      $('#settingMaxRecords').value = settings.maxRecords || 1000;
      $('#settingOllama').value = settings.ollamaHost || 'http://localhost:11434';
      $('#settingAiSummary').checked = settings.aiSummary !== false;
      $('#settingStartWithSystem').checked = settings.startWithSystem || false;
      applyTheme(settings.theme || 'dark');
      $('#settingTheme').value = settings.theme || 'dark';

      // 加载快捷键设置
      const shortcuts = settings.shortcuts || {};
      $('#shortcutGlobal').value = shortcuts.global || 'Ctrl+Shift+V';
      $('#shortcutGlobal').dataset.value = shortcuts.global || 'Ctrl+Shift+V';
      $('#shortcutSearch').value = shortcuts.search || 'Ctrl+K';
      $('#shortcutSearch').dataset.value = shortcuts.search || 'Ctrl+K';
      $('#shortcutCopy').value = shortcuts.copy || 'Enter';
      $('#shortcutCopy').dataset.value = shortcuts.copy || 'Enter';
      $('#shortcutDelete').value = shortcuts.delete || 'Delete';
      $('#shortcutDelete').dataset.value = shortcuts.delete || 'Delete';
      $('#shortcutEscape').value = shortcuts.escape || 'Escape';
      $('#shortcutEscape').dataset.value = shortcuts.escape || 'Escape';
      $('#shortcutSelectAll').value = shortcuts.selectAll || 'Ctrl+A';
      $('#shortcutSelectAll').dataset.value = shortcuts.selectAll || 'Ctrl+A';

      // v0.29.0: 加载通知设置
      try {
        const notifySettings = await window.ClawBoard.getNotificationSettings();
        $('#settingNotificationEnabled').checked = notifySettings.enabled || false;
        $('#settingNotificationSound').checked = notifySettings.soundEnabled || false;
        $('#settingNotificationPreview').checked = notifySettings.showPreview !== false;
        $('#settingNotificationIgnoreLarge').checked = notifySettings.ignoreLargeText !== false;
        const thresh = notifySettings.largeTextThreshold || notifySettings.minContentLength;
        if (thresh) $('#settingNotificationLargeThreshold').value = thresh;
      } catch (e) {
        console.error('加载通知设置失败:', e);
      }

      // v0.31.0: 加载自动过期设置
      try {
        const expirySettings = await window.ClawBoard.getAutoExpirySettings();
        $('#settingExpiryEnabled').checked = expirySettings.enabled || false;
        $('#settingExpiryDays').value = expirySettings.days || 30;
        $('#settingExpiryKeepFavorites').checked = expirySettings.keepFavorites !== false;
        loadExpiryStats();
      } catch (e) {
        console.error('加载自动过期设置失败:', e);
      }

      // v0.59.0: 加载 AI 设置（使用新 IPC API）
      try {
        const aiConfig = await window.ClawBoard.getAIConfig();
        const aiPrompts = await window.ClawBoard.getAIPrompts();
        if (aiConfig.chatModel) $('#settingAiChatModel').value = aiConfig.chatModel;
        if (aiConfig.embedModel) $('#settingAiEmbedModel').value = aiConfig.embedModel;
        if (aiPrompts.summary) $('#settingAiSummarizePrompt').value = aiPrompts.summary;
        if (aiPrompts.tag) $('#settingAiTagsPrompt').value = aiPrompts.tag;
        if (aiPrompts.search) $('#settingAiSearchPrompt').value = aiPrompts.search;
        // 刷新模型列表
        loadAiModels();
      } catch (e) {
        console.error('加载 AI 设置失败:', e);
      }
    } catch (err) {
      console.error('加载设置失败:', err);
    }
  }

  // v0.59.0: 加载 AI 设置 tab（切换标签时调用）
  async function loadAISettingsTab() {
    try {
      const aiConfig = await window.ClawBoard.getAIConfig();
      const aiPrompts = await window.ClawBoard.getAIPrompts();
      if (aiConfig.chatModel) $('#settingAiChatModel').value = aiConfig.chatModel;
      if (aiConfig.embedModel) $('#settingAiEmbedModel').value = aiConfig.embedModel;
      if (aiPrompts.summary) $('#settingAiSummarizePrompt').value = aiPrompts.summary;
      if (aiPrompts.tag) $('#settingAiTagsPrompt').value = aiPrompts.tag;
      if (aiPrompts.search) $('#settingAiSearchPrompt').value = aiPrompts.search;
      loadAiModels();
    } catch (e) {
      console.error('加载 AI 设置 tab 失败:', e);
    }
  }

  // v0.54.0: 加载可用 AI 模型列表
  async function loadAiModels() {
    try {
      const models = await window.ClawBoard.aiGetModels();
      const chatSelect = $('#settingAiChatModel');
      const embedSelect = $('#settingAiEmbedModel');
      const currentChat = chatSelect.value;
      const currentEmbed = embedSelect.value;
      
      // 清空并重新填充
      chatSelect.innerHTML = '';
      embedSelect.innerHTML = '';
      
      if (models && models.length > 0) {
        models.forEach(m => {
          const opt1 = document.createElement('option');
          opt1.value = m;
          opt1.textContent = m;
          if (m === currentChat) opt1.selected = true;
          chatSelect.appendChild(opt1);
          
          // 嵌入模型通常包含 embed 或 text
          const opt2 = document.createElement('option');
          opt2.value = m;
          opt2.textContent = m;
          if (m === currentEmbed) opt2.selected = true;
          embedSelect.appendChild(opt2);
        });
        $('#aiModelsStatus').textContent = `已发现 ${models.length} 个模型`;
      } else {
        chatSelect.innerHTML = '<option value="qwen2.5:3b">qwen2.5:3b (默认)</option>';
        embedSelect.innerHTML = '<option value="nomic-embed-text">nomic-embed-text (默认)</option>';
        $('#aiModelsStatus').textContent = '未检测到 Ollama 服务';
      }
    } catch (e) {
      $('#aiModelsStatus').textContent = '加载模型列表失败';
      console.error('加载 AI 模型失败:', e);
    }
  }

  let _themeMode = 'dark';
  let _systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function applyTheme(theme) {
    _themeMode = theme;
    const effective = theme === 'system'
      ? (_systemDarkQuery.matches ? 'dark' : 'light')
      : theme;
    if (effective === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  // 系统主题变化时自动切换
  _systemDarkQuery.addEventListener('change', (e) => {
    if (_themeMode === 'system') {
      applyTheme('system');
    }
  });

  // ==================== 渲染 ====================
  function renderRecords() {
    // 根据视图模式选择渲染方式
    if (currentViewMode === 'timeline') {
      renderTimelineView();
    } else {
      renderListView();
    }
  }

  function renderListView() {
    recordsList.style.display = '';
    $('#timelineView').style.display = 'none';

    recordsList.innerHTML = '';

    if (records.length === 0) {
      emptyState.classList.add('show');
      return;
    }

    emptyState.classList.remove('show');

    records.forEach((record, index) => {
      const card = createRecordCard(record, index);
      recordsList.appendChild(card);
    });
  }

  function renderTimelineView() {
    recordsList.style.display = 'none';
    const timelineView = $('#timelineView');
    timelineView.style.display = '';

    // 按时间分组
    const groups = groupRecordsByTime(records);

    timelineView.innerHTML = '';

    if (records.length === 0) {
      emptyState.classList.add('show');
      return;
    }

    emptyState.classList.remove('show');

    // 渲染每个分组
    const groupOrder = ['today', 'yesterday', 'thisWeek', 'thisMonth', 'older'];
    const groupLabels = {
      today: '📅 今天',
      yesterday: '📅 昨天',
      thisWeek: '📆 本周',
      thisMonth: '📆 本月',
      older: '📆 更早',
    };

    groupOrder.forEach(groupKey => {
      const groupRecords = groups[groupKey];
      if (!groupRecords || groupRecords.length === 0) return;

      const groupEl = document.createElement('div');
      groupEl.className = 'timeline-group';

      const header = document.createElement('div');
      header.className = 'timeline-group-header';
      header.innerHTML = `
        <span class="timeline-group-title">${groupLabels[groupKey]}</span>
        <span class="timeline-group-count">${groupRecords.length} 条</span>
        <span class="timeline-group-toggle">▼</span>
      `;
      header.addEventListener('click', () => {
        groupEl.classList.toggle('collapsed');
        header.querySelector('.timeline-group-toggle').textContent =
          groupEl.classList.contains('collapsed') ? '▶' : '▼';
      });

      const content = document.createElement('div');
      content.className = 'timeline-group-content';

      groupRecords.forEach((record, index) => {
        const card = createRecordCard(record, index, true);
        content.appendChild(card);
      });

      groupEl.appendChild(header);
      groupEl.appendChild(content);
      timelineView.appendChild(groupEl);
    });
  }

  async function loadTags() {
    const tagsList = $('#tagsList');
    tagsList.innerHTML = '<div class="spinner" style="margin:2rem auto"></div>';

    try {
      const tags = await window.ClawBoard.getAllTags();
      if (tags.length === 0) {
        tagsList.innerHTML = '<p style="color:var(--muted);text-align:center;padding:2rem">暂无标签，添加记录后自动显示</p>';
        return;
      }

      tagsList.innerHTML = '';
      tags.forEach((item, index) => {
        const color = tagColors[index % tagColors.length];
        const tagEl = document.createElement('div');
        tagEl.className = 'tag-item';
        tagEl.innerHTML = `
          <span class="tag-dot" style="background:${color}"></span>
          <span class="tag-name">${escapeHtml(item.tag)}</span>
          <span class="tag-count">${item.count}条</span>
          <button class="tag-delete" data-tag="${escapeHtml(item.tag)}" title="删除标签">×</button>
        `;
        tagEl.querySelector('.tag-name').addEventListener('click', () => {
          currentTag = item.tag;
          $('#currentTagFilter').textContent = item.tag;
          $('#tagsFilter').style.display = '';
          $('#tagsOverlay').classList.remove('show');
          loadRecords();
        });
        tagEl.querySelector('.tag-delete').addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm(`确定删除标签 "${item.tag}" 吗？`)) return;
          await window.ClawBoard.deleteTag(item.tag);
          showToast(`已删除标签 "${item.tag}"`, 'success');
          await loadTags();
        });
        tagsList.appendChild(tagEl);
      });
    } catch (err) {
      tagsList.innerHTML = '<p style="color:var(--muted);text-align:center;padding:2rem">加载失败</p>';
    }
  }

  async function handleConfirmTag() {
    if (!selectedRecord) return;
    const input = $('#newTagInput');
    const tag = input.value.trim();
    if (!tag) {
      showToast('请输入标签名', 'error');
      return;
    }
    try {
      await window.ClawBoard.addTag(selectedRecord.id, tag);
      selectedRecord.tags = selectedRecord.tags || '[]';
      let tags;
      try {
        tags = JSON.parse(selectedRecord.tags);
      } catch { tags = []; }
      if (!tags.includes(tag)) tags.push(tag);
      selectedRecord.tags = JSON.stringify(tags);
      input.value = '';
      $('#tagInputOverlay').classList.remove('show');
      renderTagsInDetail();
      showToast(`已添加标签 "${tag}"`, 'success');
      await loadTags();
    } catch (err) {
      showToast('添加失败', 'error');
    }
  }

  function renderTagsInDetail() {
    const footer = $('#detailFooter');
    let tagsHtml = '';
    try {
      const tags = JSON.parse(selectedRecord.tags || '[]');
      if (tags.length > 0) {
        tagsHtml = `
          <div class="record-tags" style="margin-top:0.5rem">
            ${tags.map(t => `<span class="record-tag">${escapeHtml(t)}</span>`).join('')}
          </div>
        `;
      }
    } catch (e) {}
    footer.innerHTML += tagsHtml;
  }

  function groupRecordsByTime(records) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(thisWeekStart.getDate() - today.getDay());
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const groups = {
      today: [],
      yesterday: [],
      thisWeek: [],
      thisMonth: [],
      older: [],
    };

    records.forEach(record => {
      const recordDate = new Date(record.created_at);
      if (recordDate >= today) {
        groups.today.push(record);
      } else if (recordDate >= yesterday) {
        groups.yesterday.push(record);
      } else if (recordDate >= thisWeekStart) {
        groups.thisWeek.push(record);
      } else if (recordDate >= thisMonthStart) {
        groups.thisMonth.push(record);
      } else {
        groups.older.push(record);
      }
    });

    return groups;
  }

  function toggleViewMode() {
    currentViewMode = currentViewMode === 'list' ? 'timeline' : 'list';
    const btn = $('#btnViewToggle');
    btn.textContent = currentViewMode === 'timeline' ? '📋' : '📅';
    btn.classList.toggle('active', currentViewMode === 'timeline');
    renderRecords();
  }

  function createRecordCard(record, index, isTimelineMode = false) {
    const card = document.createElement('div');
    card.className = 'record-card' + (record.favorite ? ' favorite' : '') + (isTimelineMode ? ' timeline-card' : '') + (record.encrypted ? ' encrypted-card' : '');
    card.dataset.id = record.id;
    card.style.animationDelay = `${index * 30}ms`;

    // 多选模式下显示选中状态
    if (isMultiSelectMode && selectedIds.has(record.id)) {
      card.classList.add('selected');
    }

    const typeLabels = {
      text: '📝 文字',
      code: '💻 代码',
      file: '📁 文件',
      image: '🖼️ 图片',
    };

    const timeAgo = formatTimeAgo(new Date(record.created_at));
    const encryptedBadge = record.encrypted ? '<span class="encrypted-badge">🔒</span>' : '';
    // 标签
    let tagsHtml = '';
    try {
      const tags = JSON.parse(record.tags || '[]');
      if (tags.length > 0) {
        tagsHtml = `<div class="record-tags">${tags.slice(0, 3).map(t => `<span class="record-tag">${escapeHtml(t)}</span>`).join('')}${tags.length > 3 ? `<span class="record-tag">+${tags.length - 3}</span>` : ''}</div>`;
      }
    } catch (e) {}

    // 备注
    const noteText = record.note || '';
    const noteHtml = noteText
      ? `<div class="record-note" title="${escapeHtml(noteText)}">📝 ${escapeHtml(noteText.length > 40 ? noteText.substring(0, 38) + '...' : noteText)}</div>`
      : '';

    // v0.40.0: OCR 匹配标记（搜索图片时 OCR 命中）
    const ocrBadgeHtml = (record.type === 'image' && record.ocr_text && searchQuery)
      ? `<span class="ocr-match-badge" title="OCR 识别: ${escapeHtml(record.ocr_text.substring(0, 60))}">🔍 OCR</span>`
      : '';

    // 多选模式下显示复选框
    const checkboxHtml = isMultiSelectMode
      ? `<span class="record-checkbox ${selectedIds.has(record.id) ? 'checked' : ''}">${selectedIds.has(record.id) ? '✓' : ''}</span>`
      : '';

    // v0.49.0: 文件路径快捷操作按钮
    let fileActionsHtml = '';
    if (record.type === 'file' && !record.encrypted) {
      const fp = (record.content || '').trim().replace(/^["']|["']$/g, '');
      if (fp && (fp.match(/^[A-Za-z]:\\/) || fp.match(/^\//))) {
        fileActionsHtml = `<div class="file-path-actions" data-id="${record.id}">
          <button class="file-action-btn" data-action="explorer" title="在资源管理器中打开">📂</button>
          <button class="file-action-btn" data-action="terminal" title="在终端中打开">⬛</button>
          <button class="file-action-btn" data-action="launch" title="打开文件">🚀</button>
        </div>`;
      }
    }

    card.innerHTML = `
      <div class="record-header">
        ${checkboxHtml}
        <span class="record-type ${record.type}">${typeLabels[record.type] || '📋'}</span>
        ${encryptedBadge}
        ${ocrBadgeHtml}
        <span class="record-time">${timeAgo}</span>
        <span class="record-fav" title="${record.favorite ? '取消收藏' : '收藏'}">
          ${record.favorite ? '★' : '☆'}
        </span>
        <button class="record-note-btn ${noteText ? 'has-note' : ''}" data-id="${record.id}" title="${noteText ? '查看/编辑备注' : '添加备注'}">
          📝
        </button>
      </div>
      <div class="record-content ${record.type}">${formatContent(record)}</div>
      ${fileActionsHtml}
      ${tagsHtml}
      ${noteHtml}
    `;

    card.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isMultiSelectMode) {
        handleSelectRecord(record, e);
      } else {
        openDetailPanel(record);
      }
    });

    // v0.51.0: 多选模式右键菜单
    card.addEventListener('contextmenu', (e) => {
      if (!isMultiSelectMode) return;
      e.preventDefault();
      e.stopPropagation();
      // 如果右键的条目未选中，先选中它
      if (!selectedIds.has(record.id)) {
        handleSelectRecord(record, e);
      }
      if (selectedIds.size > 0) {
        showMultiSelectContextMenu(e.clientX, e.clientY);
      }
    });

    // v0.38.0: 双击编辑
    card.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (!isMultiSelectMode && record.type !== 'image' && !record.encrypted) {
        selectedRecord = record;
        openEditor();
      }
    });

    // 备注按钮 - 内联编辑
    const noteBtn = card.querySelector('.record-note-btn');
    noteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showNoteEditor(record, noteBtn);
    });

    // v0.49.0: 文件路径快捷操作
    card.querySelectorAll('.file-action-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const filePath = (record.content || '').trim().replace(/^["']|["']$/g, '');
        if (!filePath) return;
        try {
          let result;
          if (action === 'explorer') result = await window.ClawBoard.fileOpenExplorer(filePath);
          else if (action === 'terminal') result = await window.ClawBoard.fileOpenTerminal(filePath);
          else if (action === 'launch') result = await window.ClawBoard.fileLaunch(filePath);
          if (result && result.success) showToast(result.note || '已打开', 'success');
          else showToast(result?.error || '操作失败', 'error');
        } catch (err) {
          showToast('操作失败: ' + err.message, 'error');
        }
      });
    });

    // 拖拽排序
    card.draggable = true;
    card.addEventListener('dragstart', (e) => {
      draggedRecord = record.id;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      draggedRecord = null;
    });
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    card.addEventListener('drop', async (e) => {
      e.preventDefault();
      if (!draggedRecord || draggedRecord === record.id) return;
      
      // 交换排序顺序
      const draggedRecordData = records.find(r => r.id === draggedRecord);
      if (!draggedRecordData) return;
      
      const updates = [
        { id: draggedRecord, sort_order: record.sort_order || 0, group_id: draggedRecordData.group_id },
        { id: record.id, sort_order: (record.sort_order || 0) + 1, group_id: record.group_id }
      ];
      
      await window.ClawBoard.batchUpdateSortOrder(updates);
      await loadRecords();
    });

    // v0.46.0: 悬浮预览
    card.addEventListener('mouseenter', () => {
      if (!_hoverPreviewEnabled || isMultiSelectMode) return;
      _hoverTimer = setTimeout(() => showHoverPreview(record, card), _hoverDelay);
    });
    card.addEventListener('mouseleave', () => {
      clearTimeout(_hoverTimer);
      hideHoverPreview();
    });

    return card;
  }

  // v0.44.0: 长文本性能阈值
  const LONG_TEXT_LINE_THRESHOLD = 10; // 列表预览最大行数
  const LONG_TEXT_CHAR_THRESHOLD = 5000; // 性能模式字符阈值
  const HIGHLIGHT_MATCH_LIMIT = 100; // 搜索高亮最大匹配数

  function formatContent(record) {
    if (record.type === 'image') {
      let imgHtml = `<img src="file://${record.content}" alt="图片" loading="lazy">`;
      // v0.40.0: 搜索时显示 OCR 文字提示
      if (searchQuery && record.ocr_text) {
        const ocrPreview = escapeHtml(record.ocr_text.substring(0, 120));
        imgHtml += `<div class="ocr-search-hint">🔍 OCR: ${searchQuery ? highlightText(ocrPreview, searchQuery) : ocrPreview}</div>`;
      }
      return imgHtml;
    }

    let text = escapeHtml(record.content || record.summary || '');
    const lines = text.split('\n');

    // v0.44.0: 按行截断预览，替代仅按字符数截断
    if (lines.length > LONG_TEXT_LINE_THRESHOLD) {
      text = lines.slice(0, LONG_TEXT_LINE_THRESHOLD).join('\n') + `\n<span class="long-text-hint">... 还有 ${lines.length - LONG_TEXT_LINE_THRESHOLD} 行</span>`;
    } else if (text.length > 200) {
      text = text.substring(0, 197) + '...';
    }
    // v0.35.0: 搜索高亮
    if (searchQuery) {
      text = highlightText(text, searchQuery);
    }
    return text;
  }

  // v0.35.0: 搜索关键词高亮
  // v0.44.0: 限制高亮匹配数量，避免大文本重渲染卡顿
  function highlightText(text, query) {
    if (!query || query.length < 1) return text;
    try {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escaped})`, 'gi');
      let count = 0;
      return text.replace(regex, (match) => {
        if (count >= HIGHLIGHT_MATCH_LIMIT) return match;
        count++;
        return `<mark class="search-highlight">${match}</mark>`;
      });
    } catch (e) {
      return text;
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ==================== 详情面板 ====================
  function isMarkdown(text) {
    // 检测常见 Markdown 语法特征
    const mdPatterns = [
      /^#{1,6}\s/m,           // 标题
      /\*{1,2}[^*]+\*{1,2}/,  // 粗体/斜体
      /^\s*[-*+]\s/m,         // 无序列表
      /^\s*\d+\.\s/m,         // 有序列表
      /^\s*>\s/m,             // 引用
      /\[.+\]\(.+\)/,         // 链接
      /```[\s\S]*?```/,       // 代码块
      /^\|.+\|$/m,            // 表格
      /- \[[ x]\]/m,          // 任务列表
      /^---$/m,               // 分隔线
    ];
    let matchCount = 0;
    for (const pattern of mdPatterns) {
      if (pattern.test(text)) matchCount++;
    }
    return matchCount >= 2;
  }

  function renderPreviewContent(record) {
    const content = $('#detailContent');
    const preview = $('#detailPreview');

    if (!record) return;

    if (currentPreviewMode === 'preview' && isMarkdown(record.content)) {
      content.style.display = 'none';
      preview.classList.add('show');
      // 使用 marked 渲染 Markdown
      try {
        let mdHtml = marked.parse(record.content, {
          breaks: true,
          gfm: true,
        });
        // v0.35.0: Markdown 预览中搜索高亮
        if (searchQuery) {
          mdHtml = highlightText(mdHtml, searchQuery);
        }
        preview.innerHTML = mdHtml;
        // 高亮代码块
        preview.querySelectorAll('pre code').forEach(block => {
          hljs.highlightElement(block);
        });
      } catch (e) {
        preview.textContent = record.content;
      }
    } else {
      content.style.display = '';
      preview.classList.remove('show');
      if (record.type === 'image') {
        content.innerHTML = `<img src="file://${record.content}" alt="图片">`;
      } else if (record.type === 'code' && record.language) {
        content.innerHTML = `<code class="hljs language-${record.language}">${escapeHtml(record.content)}</code>`;
        hljs.highlightElement(content.querySelector('code'));
      } else {
        // v0.35.0: 详情面板搜索高亮
        const text = escapeHtml(record.content);
        content.innerHTML = `<code>${searchQuery ? highlightText(text, searchQuery) : text}</code>`;
      }
    }
  }

  function openDetailPanel(record) {
    selectedRecord = record;
    currentPreviewMode = 'raw';
    detailPanel.classList.add('open');

    const typeLabels = {
      text: '📝 文字',
      code: '💻 代码',
      file: '📁 文件',
      image: '🖼️ 图片',
    };

    $('#detailType').textContent = typeLabels[record.type] || '📋';
    $('#detailTime').textContent = formatTimeAgo(new Date(record.created_at));

    const btnFav = $('#btnFavorite');
    btnFav.textContent = record.favorite ? '☆ 取消收藏' : '☆ 收藏';

    // v0.30.0: 显示备注
    const noteSection = $('#detailNoteSection');
    const noteInput = $('#detailNoteInput');
    noteInput.value = record.note || '';
    if (record.note) {
      noteSection.style.display = 'block';
    }

    // 显示/隐藏预览模式按钮（仅文字类型支持 Markdown 预览）
    const previewModes = $('#previewModes');
    if (record.type === 'text' && isMarkdown(record.content)) {
      previewModes.style.display = 'flex';
    } else {
      previewModes.style.display = 'none';
    }

    // 重置预览模式按钮
    $$('.preview-mode-btn').forEach(b => b.classList.remove('active'));
    $$('.preview-mode-btn[data-mode="raw"]')[0].classList.add('active');

    // 显示/隐藏加密按钮
    const btnEncrypt = $('#btnEncrypt');
    const btnDecrypt = $('#btnDecrypt');
    if (isEncryptionUnlocked) {
      if (record.encrypted) {
        btnEncrypt.style.display = 'none';
        btnDecrypt.style.display = '';
      } else {
        btnEncrypt.style.display = '';
        btnDecrypt.style.display = 'none';
      }
    } else {
      btnEncrypt.style.display = 'none';
      btnDecrypt.style.display = 'none';
    }

    // v0.41.0: QR 码按钮 - 仅对文字/代码/链接类型且未加密时显示
    const btnQR = $('#btnQR');
    if ((record.type === 'text' || record.type === 'code') && !record.encrypted && record.content && record.content.length <= 2000) {
      btnQR.style.display = '';
    } else {
      btnQR.style.display = 'none';
    }

    // v0.47.0: 文件路径快捷操作按钮 - 仅对文件类型且未加密时显示
    const btnOpenExplorer = $('#btnOpenExplorer');
    const btnOpenTerminal = $('#btnOpenTerminal');
    if (record.type === 'file' && !record.encrypted) {
      btnOpenExplorer.style.display = '';
      btnOpenTerminal.style.display = '';
    } else {
      btnOpenExplorer.style.display = 'none';
      btnOpenTerminal.style.display = 'none';
    }

    renderPreviewContent(record);

    // v0.17.0: 显示 OCR 结果（图片类型）
    const ocrSection = $('#ocrSection');
    const ocrContent = $('#ocrContent');
    const ocrStatus = $('#ocrStatus');
    const btnCopyOCR = $('#btnCopyOCR');
    
    if (record.type === 'image') {
      ocrSection.style.display = 'block';
      if (record.ocr_text) {
        ocrContent.textContent = record.ocr_text;
        ocrStatus.textContent = '✓ 识别完成';
        ocrStatus.className = 'ocr-status completed';
        btnCopyOCR.style.display = 'inline-block';
      } else {
        ocrContent.textContent = '';
        ocrStatus.textContent = '⏳ 识别中...';
        ocrStatus.className = 'ocr-status processing';
        btnCopyOCR.style.display = 'none';
        // 异步获取 OCR 结果
        loadOCRText(record.id);
      }
    } else {
      ocrSection.style.display = 'none';
    }

    // AI 摘要和语言标签
    const footer = $('#detailFooter');
    let footerHtml = '';
    if (record.type === 'code' && record.language) {
      footerHtml += `<div class="language-tag">🔤 ${record.language}</div>`;
    }
    if (record.ai_summary) {
      footerHtml += `
        <div class="ai-summary">
          <div class="ai-summary-title">🤖 AI 摘要</div>
          <div class="ai-summary-text">${escapeHtml(record.ai_summary)}</div>
        </div>
      `;
    }
    footer.innerHTML = footerHtml;
  }

  // v0.38.0: 内容编辑器
  let editorRecordId = null;

  function openEditor() {
    if (!selectedRecord) return;
    if (selectedRecord.type === 'image') {
      showToast('图片条目暂不支持编辑');
      return;
    }
    if (selectedRecord.encrypted) {
      showToast('加密条目请先解密再编辑');
      return;
    }

    editorRecordId = selectedRecord.id;
    const typeLabels = { text: '📝 文字', code: '💻 代码', file: '📁 文件', image: '🖼️ 图片' };
    $('#editorType').textContent = typeLabels[selectedRecord.type] || '📋';
    $('#editorTime').textContent = '复制于 ' + formatTimeAgo(new Date(selectedRecord.created_at));

    const textarea = $('#editorTextarea');
    textarea.value = selectedRecord.content || '';
    textarea.classList.remove('no-wrap');
    textarea.wrap = 'soft';
    $('#editorWrapToggle').checked = true;

    // 代码类型不自动换行
    if (selectedRecord.type === 'code') {
      textarea.classList.add('no-wrap');
      textarea.wrap = 'off';
      $('#editorWrapToggle').checked = false;
    }

    // v0.44.0: 性能模式 — 超长文本自动启用
    const content = selectedRecord.content || '';
    const isLongText = content.length > LONG_TEXT_CHAR_THRESHOLD;
    const perfToggle = $('#editorPerfToggle');
    if (perfToggle) {
      perfToggle.checked = isLongText;
      togglePerfMode(isLongText);
    }

    if (!isLongText) {
      updateEditorStats();
    } else {
      $('#editorStats').textContent = `${content.length} 字符 · 性能模式`;
    }

    $('#editorOverlay').classList.add('show');
    textarea.focus();
  }

  function closeEditor() {
    $('#editorOverlay').classList.remove('show');
    editorRecordId = null;
  }

  // v0.44.0: 性能模式切换
  function togglePerfMode(enabled) {
    const textarea = $('#editorTextarea');
    if (enabled) {
      textarea.classList.add('perf-mode');
      // 性能模式：禁用拼写检查和实时统计
      textarea.spellcheck = false;
    } else {
      textarea.classList.remove('perf-mode');
      textarea.spellcheck = false; // 原本就是 false
      updateEditorStats();
    }
  }

  // v0.44.0: 防抖的编辑器统计更新
  let editorStatsTimer = null;
  function debouncedUpdateEditorStats() {
    const perfToggle = document.getElementById('editorPerfToggle');
    if (perfToggle && perfToggle.checked) return; // 性能模式跳过实时统计
    clearTimeout(editorStatsTimer);
    editorStatsTimer = setTimeout(updateEditorStats, 500);
  }

  function updateEditorStats() {
    const textarea = $('#editorTextarea');
    const text = textarea.value;
    const chars = text.length;
    const lines = text ? text.split('\n').length : 0;
    $('#editorStats').textContent = `${chars} 字符 · ${lines} 行`;
  }

  async function handleSaveEditor() {
    if (!editorRecordId) return;
    const newContent = $('#editorTextarea').value;
    try {
      const updated = await window.ClawBoard.updateItemContent(editorRecordId, newContent);
      if (updated) {
        showToast('✅ 内容已保存');
        closeEditor();
        // 刷新列表和详情
        await loadRecords();
        if (selectedRecord && selectedRecord.id === editorRecordId) {
          selectedRecord = updated;
          openDetailPanel(updated);
        }
      } else {
        showToast('❌ 保存失败');
      }
    } catch (err) {
      console.error('保存编辑内容失败:', err);
      showToast('❌ 保存失败');
    }
  }

  // v0.17.0: 异步加载 OCR 文本
  async function loadOCRText(recordId) {
    try {
      const ocrText = await window.electron.getOCRText(recordId);
      if (ocrText && selectedRecord && selectedRecord.id === recordId) {
        const ocrContent = $('#ocrContent');
        const ocrStatus = $('#ocrStatus');
        const btnCopyOCR = $('#btnCopyOCR');
        ocrContent.textContent = ocrText;
        ocrStatus.textContent = '✓ 识别完成';
        ocrStatus.className = 'ocr-status completed';
        btnCopyOCR.style.display = 'inline-block';
      }
    } catch (err) {
      console.error('获取 OCR 文本失败:', err);
    }
  }

  // v0.41.0: QR 码生成
  let currentQRCanvas = null;

  function handleQRCode() {
    if (!selectedRecord) return;
    const content = selectedRecord.content || '';
    if (!content || content.length > 2000) {
      showToast('⚠️ 内容过长或为空，无法生成 QR 码', 'warning');
      return;
    }
    try {
      const qr = qrcode(0, 'M');
      qr.addData(content);
      qr.make();

      const container = $('#qrCodeContainer');
      const size = 200;
      const moduleCount = qr.getModuleCount();
      const cellSize = Math.floor(size / moduleCount);

      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#1e293b';

      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
          if (qr.isDark(row, col)) {
            ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
          }
        }
      }

      container.innerHTML = '';
      container.appendChild(canvas);
      currentQRCanvas = canvas;

      // Show content preview
      const preview = $('#qrContentPreview');
      preview.textContent = content.length > 60 ? content.substring(0, 57) + '...' : content;

      // Show overlay
      $('#qrOverlay').classList.add('show');
    } catch (err) {
      console.error('QR 码生成失败:', err);
      showToast('❌ QR 码生成失败', 'error');
    }
  }

  function closeQROverlay() {
    $('#qrOverlay').classList.remove('show');
    currentQRCanvas = null;
  }

  async function copyQRImage() {
    if (!currentQRCanvas) return;
    try {
      const blob = await new Promise(resolve => currentQRCanvas.toBlob(resolve, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showToast('✅ QR 码图片已复制', 'success');
    } catch (err) {
      console.error('复制 QR 码失败:', err);
      showToast('❌ 复制失败', 'error');
    }
  }

  async function saveQRImage() {
    if (!currentQRCanvas) return;
    try {
      const dataUrl = currentQRCanvas.toDataURL('image/png');
      const result = await window.ClawBoard.showSaveDialog({
        defaultPath: 'clawboard-qr.png',
        filters: [{ name: 'PNG', extensions: ['png'] }]
      });
      if (result.canceled) return;
      // Convert data URL to base64 content
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
      const saveResult = await window.ClawBoard.writeFile({ filePath: result.filePath, content: base64 });
      if (saveResult.success) {
        showToast('✅ QR 码已保存', 'success');
      } else {
        showToast('❌ 保存失败', 'error');
      }
    } catch (err) {
      console.error('保存 QR 码失败:', err);
      showToast('❌ 保存失败', 'error');
    }
  }

  // v0.33.0: 格式转换面板
  function showTransformPanel(content) {
    const panel = $('#transformPanel');
    const result = $('#transformResult');
    const actions = $('#transformActions');

    panel.style.display = 'block';
    result.textContent = '选择一种转换方式...';
    result.className = 'transform-result';

    // 生成转换按钮
    actions.innerHTML = '';
    transformList.forEach(t => {
      const btn = document.createElement('button');
      btn.textContent = t.label;
      btn.title = t.desc;
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        result.textContent = '转换中...';
        result.className = 'transform-result';
        try {
          const res = await window.ClawBoard.applyTransform({ transformId: t.id, text: content });
          if (res.success) {
            result.textContent = res.result;
            result.className = 'transform-result';
            // 显示操作按钮
            actions.innerHTML = '';
            const copyBtn = document.createElement('button');
            copyBtn.textContent = '📋 复制结果';
            copyBtn.addEventListener('click', async () => {
              await window.ClawBoard.copyRecord(selectedRecord.id, res.result);
              showToast('✅ 已复制转换结果', 'success');
            });
            const pasteBtn = document.createElement('button');
            pasteBtn.textContent = '📌 直接粘贴';
            pasteBtn.addEventListener('click', async () => {
              await window.ClawBoard.applyTransformCopy({ transformId: t.id, text: content });
              showToast('✅ 已转换并粘贴', 'success');
              closeTransformPanel();
            });
            actions.appendChild(copyBtn);
            actions.appendChild(pasteBtn);
          } else {
            result.textContent = '❌ ' + (res.error || '转换失败');
            result.className = 'transform-result error';
          }
        } catch (e) {
          result.textContent = '❌ ' + e.message;
          result.className = 'transform-result error';
        }
        btn.disabled = false;
      });
      actions.appendChild(btn);
    });
  }

  function closeTransformPanel() {
    $('#transformPanel').style.display = 'none';
  }

  function closeDetailPanel() {
    // v0.30.0: 保存备注
    if ($('#detailNoteSection').style.display !== 'none') {
      saveDetailNote();
    }
    detailPanel.classList.remove('open');
    selectedRecord = null;
  }

  // ==================== 多选批量操作 ====================
  function toggleMultiSelectMode() {
    setMultiSelectMode(!isMultiSelectMode);
  }

  function setMultiSelectMode(enabled) {
    isMultiSelectMode = enabled;
    selectedIds.clear();
    updateMultiSelectUI();
    renderRecords();
  }

  function updateMultiSelectUI() {
    const batchBar = $('#batchBar');
    const multiSelectBtn = $('#btnMultiSelect');
    const selectAllBtn = $('#btnSelectAll');

    if (isMultiSelectMode) {
      batchBar.classList.add('show');
      multiSelectBtn.classList.add('active');
      selectAllBtn.classList.add('show');
    } else {
      batchBar.classList.remove('show');
      multiSelectBtn.classList.remove('active');
      selectAllBtn.classList.remove('show');
    }

    // 更新选中计数
    $('#selectedCount').textContent = selectedIds.size;

    // 更新批量操作按钮状态
    const hasSelection = selectedIds.size > 0;
    $('#btnBatchFavorite').disabled = !hasSelection;
    $('#btnBatchDelete').disabled = !hasSelection;
    $('#btnBatchExport').disabled = !hasSelection;
    $('#btnBatchTag').disabled = !hasSelection;       // v0.51.0
    $('#btnBatchEncrypt').disabled = !hasSelection;   // v0.51.0
    $('#btnBatchCopy').disabled = !hasSelection;      // v0.51.0
    $('#btnBatchMerge').disabled = !hasSelection;

    // 更新全选按钮状态
    const allSelected = records.length > 0 && selectedIds.size === records.length;
    selectAllBtn.textContent = allSelected ? '取消全选' : '全选';
  }

  function handleSelectAll() {
    if (selectedIds.size === records.length) {
      // 已全选，取消全选
      selectedIds.clear();
    } else {
      // 全选
      records.forEach(r => selectedIds.add(r.id));
    }
    updateMultiSelectUI();
    renderRecords();
  }

  function handleSelectRecord(record, event) {
    const recordIndex = records.findIndex(r => r.id === record.id);

    // v0.51.0: Shift+click 范围选中
    if (event && event.shiftKey && lastSelectedIndex >= 0 && recordIndex >= 0) {
      const start = Math.min(lastSelectedIndex, recordIndex);
      const end = Math.max(lastSelectedIndex, recordIndex);
      for (let i = start; i <= end; i++) {
        selectedIds.add(records[i].id);
      }
      lastSelectedIndex = recordIndex;
      updateMultiSelectUI();
      renderRecords();
      return;
    }

    if (selectedIds.has(record.id)) {
      selectedIds.delete(record.id);
    } else {
      selectedIds.add(record.id);
    }
    lastSelectedIndex = recordIndex;
    updateMultiSelectUI();
    // 只更新对应的卡片选中状态，不重新渲染整个列表
    const card = recordsList.querySelector(`[data-id="${record.id}"]`);
    if (card) {
      card.classList.toggle('selected', selectedIds.has(record.id));
      const cb = card.querySelector('.record-checkbox');
      if (cb) {
        cb.classList.toggle('checked', selectedIds.has(record.id));
        cb.textContent = selectedIds.has(record.id) ? '✓' : '';
      }
    }
  }

  async function handleBatchFavorite() {
    if (selectedIds.size === 0) return;

    try {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        await window.ClawBoard.toggleFavorite(id);
      }
      showToast(`⭐ 已批量操作 ${ids.length} 条记录`, 'success');
      setMultiSelectMode(false);
      await loadRecords();
    } catch (err) {
      showToast('❌ 批量收藏失败', 'error');
    }
  }

  async function handleBatchDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedIds.size} 条记录吗？`)) return;

    try {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        await window.ClawBoard.deleteRecord(id);
      }
      showToast(`🗑️ 已删除 ${ids.length} 条记录`, 'success');
      setMultiSelectMode(false);
      await loadRecords();
      await loadStats();
    } catch (err) {
      showToast('❌ 批量删除失败', 'error');
    }
  }

  async function handleBatchMerge() {
    if (selectedIds.size < 2) {
      showToast('❌ 请至少选择 2 条记录进行合并', 'error');
      return;
    }

    // 只支持文本和代码类型的合并
    const selectedRecords = records.filter(r => selectedIds.has(r.id));
    const mergeableRecords = selectedRecords.filter(r => r.type === 'text' || r.type === 'code');
    
    if (mergeableRecords.length < 2) {
      showToast('❌ 请至少选择 2 条文本或代码记录', 'error');
      return;
    }

    // 显示合并对话框
    showMergeDialog(mergeableRecords);
  }

  function showMergeDialog(mergeableRecords) {
    const overlay = $('#mergeOverlay');
    const preview = $('#mergePreview');
    const previewCount = $('#mergePreviewCount');
    const customSep = $('#customSeparator');

    // 更新预览
    previewCount.textContent = mergeableRecords.length;
    updateMergePreview(mergeableRecords);

    // 显示对话框
    overlay.classList.add('show');

    // 监听分隔符变化
    $$('input[name="mergeSeparator"]').forEach(radio => {
      radio.addEventListener('change', () => {
        customSep.style.display = radio.value === 'custom' ? 'block' : 'none';
        updateMergePreview(mergeableRecords);
      });
    });

    customSep.addEventListener('input', () => updateMergePreview(mergeableRecords));
  }

  function updateMergePreview(records) {
    const preview = $('#mergePreview');
    const separator = getSelectedSeparator();
    
    // 按时间排序（旧的在前面）
    const sorted = [...records].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    
    // 生成预览
    const contents = sorted.map(r => {
      let content = r.content;
      if (content.length > 100) {
        content = content.substring(0, 100) + '...';
      }
      return escapeHtml(content);
    });
    
    preview.innerHTML = contents.join(`<span style="color:var(--primary);font-weight:bold">[${escapeHtml(separator)}]</span>`);
  }

  function getSelectedSeparator() {
    const selected = $('input[name="mergeSeparator"]:checked');
    if (selected.value === 'custom') {
      return $('#customSeparator').value || '';
    }
    return selected.value;
  }

  async function handleConfirmMerge() {
    const selectedRecords = records.filter(r => selectedIds.has(r.id) && (r.type === 'text' || r.type === 'code'));
    const separator = getSelectedSeparator();
    const keepOriginals = $('#mergeKeepOriginals').checked;

    try {
      // 按时间排序
      const sorted = [...selectedRecords].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      
      // 合并内容
      const mergedContent = sorted.map(r => r.content).join(separator);
      
      // 收集所有标签
      const allTags = new Set();
      sorted.forEach(r => {
        if (r.tags) {
          r.tags.split(',').forEach(tag => allTags.add(tag.trim()));
        }
      });
      
      // 确定类型（如果有代码，优先代码）
      const hasCode = sorted.some(r => r.type === 'code');
      const mergedType = hasCode ? 'code' : 'text';
      
      // 保存合并后的记录
      const mergedRecord = await window.ClawBoard.saveRecord({
        type: mergedType,
        content: mergedContent,
        tags: Array.from(allTags).join(', '),
        merged_from: sorted.map(r => r.id).join(','),
        is_merged: true
      });

      // 如果不保留原始记录，删除它们
      if (!keepOriginals) {
        for (const r of sorted) {
          await window.ClawBoard.deleteRecord(r.id);
        }
      }

      showToast(`✅ 已合并 ${sorted.length} 条记录`, 'success');
      $('#mergeOverlay').classList.remove('show');
      setMultiSelectMode(false);
      await loadRecords();
      await loadStats();
    } catch (err) {
      console.error('合并失败:', err);
      showToast('❌ 合并失败', 'error');
    }
  }

  async function handleBatchExport() {
    if (selectedIds.size === 0) return;

    try {
      const selectedRecords = records.filter(r => selectedIds.has(r.id));
      const exportData = selectedRecords.map(r => ({
        id: r.id,
        type: r.type,
        content: r.content,
        created_at: r.created_at,
        favorite: r.favorite,
        language: r.language || null,
        ai_summary: r.ai_summary || null,
      }));

      // 生成 JSON 文件并保存
      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      // 创建下载链接
      const a = document.createElement('a');
      a.href = url;
      a.download = `clawboard_export_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      showToast(`✅ 已导出 ${selectedRecords.length} 条记录`, 'success');
      setMultiSelectMode(false);
    } catch (err) {
      showToast('❌ 批量导出失败', 'error');
    }
  }

  // ==================== v0.51.0: 多选增强 ====================

  // 批量复制：将选中条目内容拼接复制到剪贴板
  async function handleBatchCopy() {
    if (selectedIds.size === 0) return;
    try {
      const selectedRecords = records.filter(r => selectedIds.has(r.id));
      // 按时间排序，旧在前
      const sorted = [...selectedRecords].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const allContent = sorted.map(r => r.content).join('\n---\n');
      await window.ClawBoard.copyToClipboard(allContent);
      showToast(`📋 已复制 ${sorted.length} 条记录内容`, 'success');
      setMultiSelectMode(false);
    } catch (err) {
      showToast('❌ 批量复制失败', 'error');
    }
  }

  // 批量添加标签
  async function handleBatchTag() {
    if (selectedIds.size === 0) return;
    // 显示标签对话框
    const overlay = $('#batchTagOverlay');
    $('#batchTagCount').textContent = selectedIds.size;
    $('#batchTagInput').value = '';
    // 显示已有的常用标签供快速选择
    try {
      const allTags = await window.ClawBoard.getAllTags();
      const container = $('#batchTagExisting');
      if (allTags.length > 0) {
        container.innerHTML = '<span style="color:var(--muted);font-size:0.8rem;margin-right:0.4rem">常用:</span>' +
          allTags.slice(0, 10).map(t => `<button class="record-tag" style="cursor:pointer" data-tag="${escapeHtml(t.tag)}">${escapeHtml(t.tag)}</button>`).join('');
        container.querySelectorAll('[data-tag]').forEach(btn => {
          btn.addEventListener('click', () => {
            const input = $('#batchTagInput');
            const current = input.value.trim();
            input.value = current ? current + ',' + btn.dataset.tag : btn.dataset.tag;
          });
        });
      } else {
        container.innerHTML = '';
      }
    } catch (e) {
      $('#batchTagExisting').innerHTML = '';
    }
    overlay.classList.add('show');
    $('#batchTagInput').focus();
  }

  async function handleConfirmBatchTag() {
    const tagInput = $('#batchTagInput').value.trim();
    if (!tagInput) {
      showToast('请输入至少一个标签', 'error');
      return;
    }
    const tags = tagInput.split(',').map(t => t.trim()).filter(t => t.length > 0);
    if (tags.length === 0) {
      showToast('请输入有效标签', 'error');
      return;
    }
    try {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        for (const tag of tags) {
          await window.ClawBoard.addTag(id, tag);
        }
      }
      showToast(`🏷️ 已为 ${ids.length} 条记录添加 ${tags.length} 个标签`, 'success');
      $('#batchTagOverlay').classList.remove('show');
      setMultiSelectMode(false);
      await loadRecords();
    } catch (err) {
      showToast('❌ 批量标签失败', 'error');
    }
  }

  // 批量加密
  async function handleBatchEncrypt() {
    if (selectedIds.size === 0) return;
    if (!isEncryptionUnlocked) {
      showToast('❌ 请先在设置中解锁加密功能', 'error');
      return;
    }
    const selectedRecords = records.filter(r => selectedIds.has(r.id));
    const unencryptedRecords = selectedRecords.filter(r => !r.encrypted);
    if (unencryptedRecords.length === 0) {
      showToast('选中的记录已全部加密', '');
      return;
    }
    if (!confirm(`确定要加密选中的 ${unencryptedRecords.length} 条未加密记录吗？`)) return;
    try {
      let encryptedCount = 0;
      for (const r of unencryptedRecords) {
        const success = await window.ClawBoard.encryptRecord(r.id);
        if (success) encryptedCount++;
      }
      showToast(`🔒 已加密 ${encryptedCount} 条记录`, 'success');
      setMultiSelectMode(false);
      await loadRecords();
    } catch (err) {
      showToast('❌ 批量加密失败', 'error');
    }
  }

  // 多选右键菜单
  function showMultiSelectContextMenu(x, y) {
    const menu = $('#multiSelectContextMenu');
    // 调整位置，避免超出窗口
    const menuWidth = 200;
    const menuHeight = 300;
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.style.display = 'block';
  }

  function handleContextMenuAction(action) {
    const menu = $('#multiSelectContextMenu');
    menu.style.display = 'none';
    switch (action) {
      case 'copy': handleBatchCopy(); break;
      case 'favorite': handleBatchFavorite(); break;
      case 'tag': handleBatchTag(); break;
      case 'encrypt': handleBatchEncrypt(); break;
      case 'export': handleBatchExport(); break;
      case 'move': handleBatchMoveToGroup(); break;
      case 'delete': handleBatchDelete(); break;
    }
  }

  // ==================== 加密操作 ====================
  function updateEncryptionUI() {
    const status = $('#encryptionStatus');
    const setup = $('#encryptionSetup');
    const btnConfirm = $('#btnConfirmEncryption');

    if (isEncryptionUnlocked) {
      status.style.display = 'block';
      setup.style.display = 'none';
      btnConfirm.textContent = '关闭';
    } else {
      status.style.display = 'none';
      setup.style.display = 'block';
      btnConfirm.textContent = '确认';
    }
  }

  async function handleSetEncryption() {
    const status = $('#encryptionStatus');

    if (isEncryptionUnlocked) {
      // 关闭加密面板
      $('#encryptionOverlay').classList.remove('show');
      return;
    }

    const password = $('#encryptionPassword').value;
    const confirm = $('#encryptionPasswordConfirm').value;

    if (!password) {
      showToast('❌ 请输入密码', 'error');
      return;
    }

    if (password.length < 4) {
      showToast('❌ 密码至少 4 个字符', 'error');
      return;
    }

    if (password !== confirm) {
      showToast('❌ 两次密码不一致', 'error');
      return;
    }

    try {
      await window.ClawBoard.setEncryptionPassword(password);
      isEncryptionUnlocked = true;
      $('#encryptionPassword').value = '';
      $('#encryptionPasswordConfirm').value = '';
      updateEncryptionUI();
      showToast('✅ 加密已启用', 'success');
      await loadRecords();
    } catch (err) {
      showToast('❌ 设置失败', 'error');
    }
  }

  async function handleLockEncryption() {
    try {
      await window.ClawBoard.clearEncryptionKey();
      isEncryptionUnlocked = false;
      updateEncryptionUI();
      showToast('🔒 加密已锁定', 'success');
      closeDetailPanel();
      await loadRecords();
    } catch (err) {
      showToast('❌ 锁定失败', 'error');
    }
  }

  async function handleEncryptRecord() {
    if (!selectedRecord || !isEncryptionUnlocked) return;

    try {
      await window.ClawBoard.encryptRecord(selectedRecord.id);
      showToast('🔒 已加密', 'success');
      closeDetailPanel();
      await loadRecords();
    } catch (err) {
      showToast('❌ 加密失败', 'error');
    }
  }

  async function handleDecryptRecord() {
    if (!selectedRecord || !isEncryptionUnlocked) return;

    try {
      const decrypted = await window.ClawBoard.decryptRecord(selectedRecord.id);
      if (decrypted) {
        selectedRecord = decrypted;
        renderPreviewContent(decrypted);
        showToast('🔓 已解密查看', 'success');
      }
    } catch (err) {
      showToast('❌ 解密失败', 'error');
    }
  }

  // ==================== v0.68.0: 增强搜索 ====================
  function enhancedSearchFilter(allRecords, query) {
    if (!query || !query.trim()) return allRecords;

    const q = query.trim();
    let results = [...allRecords];
    let remaining = q;

    // 日期范围: date:YYYY-MM-DD..YYYY-MM-DD
    const dateMatch = remaining.match(/date:(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      const start = new Date(dateMatch[1]);
      const end = new Date(dateMatch[2]);
      end.setHours(23, 59, 59, 999);
      results = results.filter(r => {
        const d = new Date(r.created_at);
        return d >= start && d <= end;
      });
      remaining = remaining.replace(/date:\S+/, '').trim();
    }

    // 类型过滤: type:text|code|file|image
    const typeMatch = remaining.match(/type:(\w+)/);
    if (typeMatch) {
      results = results.filter(r => r.type === typeMatch[1]);
      remaining = remaining.replace(/type:\S+/, '').trim();
    }

    // 标签过滤: tag:xxx
    const tagMatch = remaining.match(/tag:(\S+)/);
    if (tagMatch) {
      results = results.filter(r => {
        try {
          const tags = JSON.parse(r.tags || '[]');
          return tags.includes(tagMatch[1]);
        } catch { return false; }
      });
      remaining = remaining.replace(/tag:\S+/, '').trim();
    }

    // 精确短语: "exact phrase"
    const exactMatch = remaining.match(/"([^"]+)"/);
    if (exactMatch) {
      const phrase = exactMatch[1].toLowerCase();
      results = results.filter(r => {
        const content = (r.content || '').toLowerCase();
        return content.includes(phrase);
      });
      remaining = remaining.replace(/"[^"]+"/, '').trim();
    }

    // 正则搜索: /pattern/flags
    const regexMatch = remaining.match(/^\/(.+)\/(\w*)$/);
    if (regexMatch) {
      try {
        const regex = new RegExp(regexMatch[1], regexMatch[2]);
        results = results.filter(r => regex.test(r.content || ''));
      } catch (e) {
        showToast('无效的正则表达式: ' + e.message, 'error');
        return [];
      }
      return results;
    }

    // 默认关键词搜索（如果还有剩余文字）
    if (remaining) {
      const keywords = remaining.toLowerCase().split(/\s+/).filter(Boolean);
      results = results.filter(r => {
        const content = (r.content || '').toLowerCase();
        return keywords.every(kw => content.includes(kw));
      });
    }

    return results;
  }

  // ==================== 操作处理 ====================
  async function handleSearch() {
    searchQuery = searchInput.value.trim();
    clearSearchBtn.classList.toggle('show', !!searchQuery);
    // v0.35.0: 保存搜索历史
    if (searchQuery && searchQuery.length >= 2) {
      saveSearchHistory(searchQuery);
    }
    closeSearchHistory();
    await loadRecords();
  }

  async function handleCopyRecord() {
    if (!selectedRecord) return;

    try {
      await window.ClawBoard.copyToClipboard(selectedRecord.content);
      showToast('✅ 已复制到剪贴板', 'success');
    } catch (err) {
      showToast('❌ 复制失败', 'error');
    }
  }

  async function handleToggleFavorite() {
    if (!selectedRecord) return;

    try {
      await window.ClawBoard.toggleFavorite(selectedRecord.id);
      selectedRecord.favorite = !selectedRecord.favorite;
      const btnFav = $('#btnFavorite');
      btnFav.textContent = selectedRecord.favorite ? '☆ 取消收藏' : '☆ 收藏';

      // 更新列表中的对应卡片
      const card = records.find(r => r.id === selectedRecord.id);
      if (card) {
        card.favorite = selectedRecord.favorite;
      }

      showToast(selectedRecord.favorite ? '⭐ 已收藏' : '☆ 已取消收藏', 'success');
      await loadRecords();
    } catch (err) {
      showToast('❌ 操作失败', 'error');
    }
  }

  async function handleDeleteRecord() {
    if (!selectedRecord) return;
    if (!confirm('确定要删除这条记录吗？')) return;

    try {
      await window.ClawBoard.deleteRecord(selectedRecord.id);
      closeDetailPanel();
      await loadRecords();
      await loadStats();
      showToast('🗑️ 已删除', 'success');
    } catch (err) {
      showToast('❌ 删除失败', 'error');
    }
  }

  // v0.34.0: 导出 JSON
  async function handleExportJSON() {
    const status = $('#exportStatus');
    status.textContent = '正在导出...';
    try {
      const res = await window.ClawBoard.exportRecordsJSON();
      if (!res.success) throw new Error(res.error);
      if (!res.data.length) {
        status.textContent = '暂无记录可导出';
        return;
      }
      const dialogRes = await window.ClawBoard.showSaveDialog({
        title: '导出 JSON 备份',
        defaultPath: `clawboard-backup-${new Date().toISOString().slice(0,10)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      });
      if (dialogRes.canceled) { status.textContent = '已取消'; return; }
      await window.ClawBoard.writeFile({ filePath: dialogRes.filePath, content: JSON.stringify(res.data, null, 2) });
      status.textContent = `✅ 成功导出 ${res.data.length} 条记录`;
      showToast(`📤 已导出 ${res.data.length} 条记录`, 'success');
    } catch (err) {
      status.textContent = '❌ 导出失败: ' + err.message;
      showToast('❌ 导出失败', 'error');
    }
  }

  // v0.34.0: 导出 CSV
  async function handleExportCSV() {
    const status = $('#exportStatus');
    status.textContent = '正在导出...';
    try {
      const res = await window.ClawBoard.exportRecordsCSV();
      if (!res.success) throw new Error(res.error);
      if (!res.data) {
        status.textContent = '暂无文本记录可导出';
        return;
      }
      const dialogRes = await window.ClawBoard.showSaveDialog({
        title: '导出 CSV',
        defaultPath: `clawboard-export-${new Date().toISOString().slice(0,10)}.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      });
      if (dialogRes.canceled) { status.textContent = '已取消'; return; }
      await window.ClawBoard.writeFile({ filePath: dialogRes.filePath, content: res.data });
      const lines = res.data.split('\n').length - 1;
      status.textContent = `✅ 成功导出 ${lines} 条文本记录`;
      showToast(`📤 已导出 ${lines} 条文本记录`, 'success');
    } catch (err) {
      status.textContent = '❌ 导出失败: ' + err.message;
      showToast('❌ 导出失败', 'error');
    }
  }

  // v0.34.0: 导入 JSON
  async function handleImportJSON() {
    const status = $('#importStatus');
    status.textContent = '正在导入...';
    try {
      const dialogRes = await window.ClawBoard.showOpenDialog({
        title: '选择备份文件',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile']
      });
      if (dialogRes.canceled) { status.textContent = '已取消'; return; }
      const fileRes = await window.ClawBoard.readFile({ filePath: dialogRes.filePaths[0] });
      if (!fileRes.success) throw new Error(fileRes.error);
      const records = JSON.parse(fileRes.content);
      if (!Array.isArray(records)) throw new Error('文件格式错误：需要 JSON 数组');
      const mode = document.querySelector('input[name="importMode"]:checked').value;
      const result = await window.ClawBoard.importRecords({ records, mode });
      if (!result.success) throw new Error(result.error);
      status.textContent = `✅ 导入完成：新增 ${result.imported} 条，跳过 ${result.skipped} 条重复`;
      showToast(`📥 导入完成：新增 ${result.imported} 条`, 'success');
      loadRecords();
    } catch (err) {
      status.textContent = '❌ 导入失败: ' + err.message;
      showToast('❌ 导入失败', 'error');
    }
  }

  async function handleClearHistory() {
    if (!confirm('确定要清空所有历史记录吗？收藏的内容不会被删除。')) return;

    try {
      await window.ClawBoard.clearHistory();
      await loadRecords();
      await loadStats();
      showToast('🗑️ 历史已清空', 'success');
    } catch (err) {
      showToast('❌ 清空失败', 'error');
    }
  }

  async function handleFindDuplicates() {
    const resultDiv = $('#duplicatesResult');
    resultDiv.innerHTML = '<span style="color:var(--muted)">扫描中...</span>';

    try {
      const duplicates = await window.ClawBoard.findDuplicates();

      if (duplicates.length === 0) {
        resultDiv.innerHTML = '<span style="color:var(--green)">✅ 未发现重复内容</span>';
        return;
      }

      const totalCount = duplicates.reduce((sum, d) => sum + d.count - 1, 0);
      resultDiv.innerHTML = `
        <div style="color:var(--muted);margin-bottom:0.5rem">
          发现 ${duplicates.length} 组重复内容，共 ${totalCount} 条可清理
        </div>
        <button class="btn-danger" id="btnCleanupDuplicates">一键清理重复项</button>
      `;
      $('#btnCleanupDuplicates').addEventListener('click', async () => {
        if (!confirm(`确定清理 ${totalCount} 条重复记录吗？\n将保留每组最新的一条。`)) return;
        const deleted = await window.ClawBoard.cleanupDuplicates();
        showToast(`已清理 ${deleted} 条重复记录`, 'success');
        resultDiv.innerHTML = '<span style="color:var(--green)">✅ 清理完成</span>';
        await loadStats();
      });
    } catch (err) {
      resultDiv.innerHTML = '<span style="color:var(--red)">扫描失败</span>';
    }
  }

  async function handleSaveSettings() {
    const settings = {
      maxRecords: parseInt($('#settingMaxRecords').value) || 1000,
      ollamaHost: $('#settingOllama').value,
      aiSummary: $('#settingAiSummary').checked,
      startWithSystem: $('#settingStartWithSystem').checked,
      theme: $('#settingTheme').value || 'dark',
    };

    // 收集所有快捷键设置
    const shortcuts = {
      global: $('#shortcutGlobal').dataset.value || $('#shortcutGlobal').value,
      search: $('#shortcutSearch').dataset.value || $('#shortcutSearch').value,
      copy: $('#shortcutCopy').dataset.value || $('#shortcutCopy').value,
      delete: $('#shortcutDelete').dataset.value || $('#shortcutDelete').value,
      escape: $('#shortcutEscape').dataset.value || $('#shortcutEscape').value,
      selectAll: $('#shortcutSelectAll').dataset.value || $('#shortcutSelectAll').value,
    };

    // v0.29.0: 收集通知设置
    const notificationSettings = {
      enabled: $('#settingNotificationEnabled').checked,
      soundEnabled: $('#settingNotificationSound').checked,
      showPreview: $('#settingNotificationPreview').checked,
      ignoreLargeText: $('#settingNotificationIgnoreLarge').checked,
      largeTextThreshold: parseInt($('#settingNotificationLargeThreshold').value) || 1000
    };

    try {
      // 先保存设置
      await window.ClawBoard.saveSettings(settings);
      // 保存快捷键设置
      await window.ClawBoard.saveShortcuts(shortcuts);
      // v0.29.0: 保存通知设置
      const notificationSettings = {
        enabled: $('#settingNotificationEnabled').checked,
        soundEnabled: $('#settingNotificationSound').checked,
        showPreview: $('#settingNotificationPreview').checked,
        ignoreLargeText: $('#settingNotificationIgnoreLarge').checked,
        largeTextThreshold: parseInt($('#settingNotificationLargeThreshold').value) || 1000,
      };
      await window.ClawBoard.updateNotificationSettings(notificationSettings);
      // v0.31.0: 保存自动过期设置
      const expirySettings = {
        enabled: $('#settingExpiryEnabled').checked,
        days: parseInt($('#settingExpiryDays').value) || 30,
        keepFavorites: $('#settingExpiryKeepFavorites').checked,
      };
      await window.ClawBoard.saveAutoExpirySettings(expirySettings);
      
      // v0.59.0: 保存 AI 设置（使用新 IPC API）
      const chatModel = $('#settingAiChatModel').value;
      const embedModel = $('#settingAiEmbedModel').value;
      await window.ClawBoard.updateAIConfig({ chatModel, embedModel });
      const summaryPrompt = $('#settingAiSummarizePrompt').value;
      const tagPrompt = $('#settingAiTagsPrompt').value;
      const searchPrompt = $('#settingAiSearchPrompt').value;
      if (summaryPrompt) await window.ClawBoard.updateAIPrompt({ key: 'summary', template: summaryPrompt });
      if (tagPrompt) await window.ClawBoard.updateAIPrompt({ key: 'tag', template: tagPrompt });
      if (searchPrompt) await window.ClawBoard.updateAIPrompt({ key: 'search', template: searchPrompt });
      
      // 更新全局快捷键
      await window.ClawBoard.updateShortcut(shortcuts.global);
      applyTheme(settings.theme);
      settingsOverlay.classList.remove('show');
      showToast('✅ 设置已保存', 'success');
    } catch (err) {
      showToast('❌ 保存失败', 'error');
    }
  }

  // v0.31.0: 加载过期统计
  // v0.44.0: 添加存储大小显示
  async function loadExpiryStats() {
    try {
      const stats = await window.ClawBoard.getExpiryStats();
      $('#expiryExpiredCount').textContent = stats.expired;
      $('#expiryProtectedCount').textContent = stats.protected;
      
      // v0.44.0: 加载存储大小和记录数
      const health = await window.ClawBoard.getSystemHealth();
      if (health) {
        const formatStorageSize = (bytes) => {
          if (bytes < 1024) return bytes + ' B';
          if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
          if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
          return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
        };
        $('#storageSize').textContent = formatStorageSize(health.dbSize);
        // 获取总记录数
        const dbStats = await window.ClawBoard.getStats();
        $('#recordCount').textContent = dbStats.total || 0;
      }
    } catch (e) {
      console.error('加载过期统计失败:', e);
    }
  }

  // v0.29.0: 测试通知
  async function handleTestNotification() {
    try {
      await window.ClawBoard.testNotification();
      showToast('🔔 测试通知已发送', 'success');
    } catch (err) {
      showToast('❌ 通知测试失败', 'error');
    }
  }

  // 添加重置快捷键按钮事件监听
  $('#btnResetShortcuts').addEventListener('click', resetShortcuts);

  // v0.29.0: 测试通知按钮
  $('#btnTestNotification').addEventListener('click', handleTestNotification);

  // v0.59.0: AI 设置相关按钮
  $('#btnRefreshAiModels').addEventListener('click', loadAiModels);
  $('#btnResetAiPrompts').addEventListener('click', async () => {
    if (!confirm('确定重置 AI 设置为默认值？')) return;
    try {
      const defaults = await window.ClawBoard.resetAIDefaults();
      // 重新加载 AI 设置以反映默认值
      const aiConfig = await window.ClawBoard.getAIConfig();
      const aiPrompts = await window.ClawBoard.getAIPrompts();
      if (aiConfig.chatModel) $('#settingAiChatModel').value = aiConfig.chatModel;
      if (aiConfig.embedModel) $('#settingAiEmbedModel').value = aiConfig.embedModel;
      if (aiPrompts.summary) $('#settingAiSummarizePrompt').value = aiPrompts.summary;
      if (aiPrompts.tag) $('#settingAiTagsPrompt').value = aiPrompts.tag;
      if (aiPrompts.search) $('#settingAiSearchPrompt').value = aiPrompts.search;
      showToast('✅ 已重置为默认值', 'success');
    } catch (e) {
      showToast('❌ 重置失败', 'error');
    }
  });

  // v0.31.0: 立即清理过期条目
  $('#btnCleanExpired').addEventListener('click', async () => {
    try {
      const result = await window.ClawBoard.cleanExpiredItems();
      if (result.success) {
        showToast('🗑️ 已清理 ' + result.count + ' 条过期记录', 'success');
        loadExpiryStats();
        loadRecords();
      } else {
        showToast('❌ 清理失败', 'error');
      }
    } catch (e) {
      showToast('❌ 清理失败', 'error');
    }
  });

  // v0.31.0: 监听过期清理事件
  window.ClawBoard.onExpiryCleanup((data) => {
    if (data.count > 0) {
      showToast('🗑️ 自动清理了 ' + data.count + ' 条过期记录', 'info');
      loadExpiryStats();
      loadRecords();
    }
  });

  // ==================== 工具函数 ====================
  // 默认快捷键配置
  const defaultShortcuts = {
    global: 'Ctrl+Shift+V',
    search: 'Ctrl+K',
    copy: 'Enter',
    delete: 'Delete',
    escape: 'Escape',
    selectAll: 'Ctrl+A',
  };

  let currentRecordingInput = null;

  function initShortcutRecording() {
    const shortcutInputs = $$('.shortcut-input');
    shortcutInputs.forEach(input => {
      input.addEventListener('click', () => startShortcutRecording(input));
      input.addEventListener('keydown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });
  }

  function startShortcutRecording(input) {
    // 如果正在录制另一个，取消
    if (currentRecordingInput && currentRecordingInput !== input) {
      currentRecordingInput.classList.remove('recording');
      currentRecordingInput.value = currentRecordingInput.dataset.value || '';
    }

    currentRecordingInput = input;
    input.classList.add('recording');
    input.value = '按下快捷键...';
    input.readOnly = false;
    input.focus();

    // 绑定一次性键盘事件
    const handleKeyDown = (e) => {
      e.preventDefault();
      e.stopPropagation();

      const keys = [];
      if (e.ctrlKey) keys.push('Ctrl');
      if (e.shiftKey) keys.push('Shift');
      if (e.altKey) keys.push('Alt');
      if (e.metaKey) keys.push('Meta');

      const key = e.key;
      if (key && !['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
        keys.push(key.length === 1 ? key.toUpperCase() : key);
      }

      if (keys.length > 0) {
        const shortcut = keys.join('+');
        input.value = shortcut;
        input.dataset.value = shortcut;
      }

      input.classList.remove('recording');
      currentRecordingInput = null;
      document.removeEventListener('keydown', handleKeyDown);
    };

    document.addEventListener('keydown', handleKeyDown, { once: true });

    // 点击其他位置取消录制
    const handleClickOutside = (e) => {
      if (!input.contains(e.target)) {
        input.classList.remove('recording');
        input.value = input.dataset.value || '';
        currentRecordingInput = null;
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('click', handleClickOutside);
      }
    };
    setTimeout(() => document.addEventListener('click', handleClickOutside), 100);
  }

  function resetShortcuts() {
    const shortcutInputs = $$('.shortcut-input');
    shortcutInputs.forEach(input => {
      const key = input.id.replace('shortcut', '').toLowerCase();
      const defaultVal = defaultShortcuts[key] || '';
      input.value = defaultVal;
      input.dataset.value = defaultVal;
    });
    showToast('✅ 快捷键已重置', 'success');
  }
  function formatTimeAgo(date) {
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}天前`;
    if (hours > 0) return `${hours}小时前`;
    if (minutes > 0) return `${minutes}分钟前`;
    return '刚刚';
  }

  function debounce(fn, delay) {
    let timer = null;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function saveDetailNote() {
    if (!selectedRecord) return;
    const note = $('#detailNoteInput').value.trim();
    window.ClawBoard.updateNote(selectedRecord.id, note);
    selectedRecord.note = note;
    // 更新卡片上的备注显示
    const card = document.querySelector(`.record-card[data-id="${selectedRecord.id}"]`);
    if (card) {
      const btn = card.querySelector('.record-note-btn');
      const noteEl = card.querySelector('.record-note');
      if (btn) {
        btn.classList.toggle('has-note', !!note);
        btn.title = note ? '查看/编辑备注' : '添加备注';
      }
      if (note) {
        const contentDiv = card.querySelector('.record-content');
        if (noteEl) {
          noteEl.textContent = '📝 ' + note;
        } else {
          const newNote = document.createElement('div');
          newNote.className = 'record-note';
          newNote.textContent = '📝 ' + note;
          contentDiv.after(newNote);
        }
      } else if (noteEl) {
        noteEl.remove();
      }
    }
  }

  function showNoteEditor(record, btn) {
    // 如果已经有一个编辑框在显示，先移除
    const existing = document.querySelector('.note-editor-popup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.className = 'note-editor-popup';
    popup.innerHTML = `
      <textarea class="note-textarea" placeholder="添加备注..." rows="3">${escapeHtml(record.note || '')}</textarea>
      <div class="note-editor-actions">
        <button class="btn-note-save">保存</button>
        <button class="btn-note-cancel">取消</button>
      </div>
    `;

    btn.parentNode.insertBefore(popup, btn.nextSibling);

    const textarea = popup.querySelector('.note-textarea');
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    popup.querySelector('.btn-note-save').addEventListener('click', async () => {
      const note = textarea.value.trim();
      await window.ClawBoard.updateNote(record.id, note);
      // 更新卡片 UI
      const card = btn.closest('.record-card');
      if (card) {
        const noteEl = card.querySelector('.record-note');
        if (note) {
          if (noteEl) {
            noteEl.textContent = '📝 ' + note;
            noteEl.title = note;
          } else {
            const contentDiv = card.querySelector('.record-content');
            const newNote = document.createElement('div');
            newNote.className = 'record-note';
            newNote.textContent = '📝 ' + note;
            newNote.title = note;
            contentDiv.after(newNote);
          }
        } else if (noteEl) {
          noteEl.remove();
        }
        btn.classList.toggle('has-note', !!note);
        btn.title = note ? '查看/编辑备注' : '添加备注';
      }
      popup.remove();
      showToast(note ? '✅ 备注已保存' : '✅ 备注已清除', 'success');
    });

    popup.querySelector('.btn-note-cancel').addEventListener('click', () => {
      popup.remove();
    });

    // 点击外部关闭
    const handleOutside = (e) => {
      if (!popup.contains(e.target) && e.target !== btn) {
        popup.remove();
        document.removeEventListener('click', handleOutside);
      }
    };
    setTimeout(() => document.addEventListener('click', handleOutside), 50);
  }

  // ==================== v0.35.0: 搜索历史 ====================
  function loadSearchHistory() {
    try {
      const stored = localStorage.getItem(SEARCH_HISTORY_KEY);
      searchHistory = stored ? JSON.parse(stored) : [];
    } catch (e) {
      searchHistory = [];
    }
  }

  function saveSearchHistory(query) {
    // 去重，最新放前面
    searchHistory = searchHistory.filter(h => h !== query);
    searchHistory.unshift(query);
    if (searchHistory.length > SEARCH_HISTORY_MAX) {
      searchHistory = searchHistory.slice(0, SEARCH_HISTORY_MAX);
    }
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory));
  }

  function removeSearchHistoryItem(query) {
    searchHistory = searchHistory.filter(h => h !== query);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory));
    if (isSearchHistoryOpen) {
      renderSearchHistoryDropdown();
    }
  }

  function clearAllSearchHistory() {
    searchHistory = [];
    localStorage.removeItem(SEARCH_HISTORY_KEY);
    closeSearchHistory();
    showToast('🗑️ 搜索历史已清除', 'success');
  }

  // v0.68.0: 搜索设置 tab
  function loadSearchSettingsTab() {
    const countEl = document.getElementById('searchHistoryCount');
    if (countEl) countEl.textContent = searchHistory.length;
    const maxEl = document.getElementById('settingSearchHistoryMax');
    if (maxEl) maxEl.value = SEARCH_HISTORY_MAX;
  }

  // v0.68.0: 搜索设置事件
  document.addEventListener('DOMContentLoaded', () => {
    const btnClear = document.getElementById('btnClearSearchHistory');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        if (!confirm('确定清除所有搜索历史？')) return;
        clearAllSearchHistory();
        const countEl = document.getElementById('searchHistoryCount');
        if (countEl) countEl.textContent = '0';
      });
    }
    const maxInput = document.getElementById('settingSearchHistoryMax');
    if (maxInput) {
      maxInput.addEventListener('change', () => {
        // SEARCH_HISTORY_MAX is const, so we store override in localStorage
        localStorage.setItem('searchHistoryMax', maxInput.value);
        showToast('已更新搜索历史上限', 'success');
      });
    }
  });

  function initSearchHistoryUI() {
    // 创建搜索历史下拉容器
    searchHistoryDropdown = document.createElement('div');
    searchHistoryDropdown.className = 'search-history-dropdown';
    searchHistoryDropdown.style.display = 'none';
    // 插入搜索框后面
    const searchContainer = searchInput.closest('.search-box') || searchInput.parentElement;
    if (searchContainer) {
      searchContainer.style.position = 'relative';
      searchContainer.appendChild(searchHistoryDropdown);
    }
  }

  function showSearchHistory() {
    if (searchHistory.length === 0) return;
    renderSearchHistoryDropdown();
    searchHistoryDropdown.style.display = 'block';
    isSearchHistoryOpen = true;
  }

  function closeSearchHistory() {
    if (searchHistoryDropdown) {
      searchHistoryDropdown.style.display = 'none';
    }
    isSearchHistoryOpen = false;
  }

  function renderSearchHistoryDropdown() {
    if (!searchHistoryDropdown) return;
    let items = searchHistory.slice(0, 8);
    searchHistoryDropdown.innerHTML = `
      <div class="search-history-header">
        <span>🔍 搜索历史</span>
        <button class="search-history-clear" title="清除全部">🗑️</button>
      </div>
      <div class="search-history-list">
        ${items.map((item, i) => `
          <div class="search-history-item" data-index="${i}">
            <span class="search-history-icon">🕐</span>
            <span class="search-history-text">${escapeHtml(item)}</span>
            <button class="search-history-delete" data-query="${escapeHtml(item)}" title="删除">×</button>
          </div>
        `).join('')}
      </div>
    `;
    // 绑定事件
    searchHistoryDropdown.querySelectorAll('.search-history-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.search-history-delete')) return;
        const idx = parseInt(el.dataset.index);
        searchInput.value = searchHistory[idx];
        searchInput.focus();
        handleSearch();
      });
    });
    searchHistoryDropdown.querySelectorAll('.search-history-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeSearchHistoryItem(btn.dataset.query);
      });
    });
    searchHistoryDropdown.querySelector('.search-history-clear').addEventListener('click', (e) => {
      e.stopPropagation();
      clearAllSearchHistory();
    });
  }

  let searchHistoryNavIndex = -1;
  function navigateSearchHistory(direction) {
    const items = searchHistoryDropdown.querySelectorAll('.search-history-item');
    if (items.length === 0) return;
    // 清除旧高亮
    items.forEach(it => it.classList.remove('active'));
    searchHistoryNavIndex += direction;
    if (searchHistoryNavIndex < 0) searchHistoryNavIndex = items.length - 1;
    if (searchHistoryNavIndex >= items.length) searchHistoryNavIndex = 0;
    items[searchHistoryNavIndex].classList.add('active');
    searchInput.value = searchHistory[searchHistoryNavIndex];
  }

  function showToast(message, type = '') {
    toastMessage.textContent = message;
    toast.className = 'toast show ' + type;
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }

  // ==================== v0.37.0: 关于 & 诊断信息 ====================
  let _diagnosticsText = '';

  async function loadDiagnostics() {
    try {
      const d = await window.ClawBoard.getDiagnostics();
      if (d.error) {
        $('#diagnosticsInfo').innerHTML = '<span style="color:var(--red)">加载失败: ' + d.error + '</span>';
        return;
      }
      const formatSize = (bytes) => bytes < 1024 ? bytes + ' B' : bytes < 1048576 ? (bytes/1024).toFixed(1) + ' KB' : (bytes/1048576).toFixed(1) + ' MB';
      const uptimeH = Math.floor(d.uptime / 3600);
      const uptimeM = Math.floor((d.uptime % 3600) / 60);
      const lines = [
        ['📋 版本', 'ClawBoard v' + d.appVersion],
        ['⚡ Electron', d.electronVersion],
        ['🟢 Node.js', d.nodeVersion],
        ['🌐 Chromium', d.chromeVersion],
        ['💻 系统', d.platform + ' ' + d.osRelease + ' (' + d.arch + ')'],
        ['🧠 内存', d.heapUsed + ' MB / ' + d.heapTotal + ' MB (系统 ' + d.totalMemory + ' MB)'],
        ['📦 数据库', formatSize(d.dbSize) + ' · ' + d.recordCount + ' 条记录 · ' + d.favoriteCount + ' 个收藏'],
        ['⏱ 运行时间', uptimeH + '时' + uptimeM + '分'],
        ['📂 数据路径', d.userDataPath],
      ];
      _diagnosticsText = lines.map(l => l[0].replace(/[^\w\s.]/g,'').trim() + ': ' + l[1]).join('\n');
      $('#diagnosticsInfo').innerHTML = lines.map(([icon_label, value]) =>
        '<div><strong>' + icon_label + '</strong> ' + value + '</div>'
      ).join('');
      $('#aboutVersion').textContent = 'v' + d.appVersion;
    } catch (e) {
      $('#diagnosticsInfo').innerHTML = '<span style="color:var(--red)">加载失败</span>';
    }
  }

  function initAboutPanel() {
    const btn = $('#btnCopyDiagnostics');
    if (btn) {
      btn.addEventListener('click', () => {
        if (_diagnosticsText) {
          navigator.clipboard.writeText(_diagnosticsText).then(() => {
            showToast('📋 诊断信息已复制', 'success');
          });
        }
      });
    }
  }

  // ==================== v0.45.0: 自动加密规则 ====================

  async function loadAutoEncryptSettings() {
    try {
      const settings = await window.electronAPI.getAutoEncryptSettings();
      if (!settings) return;
      $('#settingAutoEncrypt').checked = settings.enabled;
      renderBuiltinRules(settings.builtinRules || []);
      renderCustomRules(settings.customRules || []);
    } catch (err) {
      console.error('loadAutoEncryptSettings error:', err);
    }
  }

  function renderBuiltinRules(rules) {
    const container = $('#autoEncryptBuiltinRules');
    container.innerHTML = '';
    rules.forEach(rule => {
      const item = document.createElement('div');
      item.className = 'setting-item';
      item.style.cssText = 'flex-direction:row;align-items:center;justify-content:space-between';
      item.innerHTML = `
        <div>
          <label style="margin:0">
            <input type="checkbox" data-builtin-type="${rule.type}" class="builtin-encrypt-toggle" ${rule.enabled ? 'checked' : ''}>
            ${rule.name}
          </label>
          <small style="color:var(--muted);display:block;margin-left:1.5rem">${rule.description}</small>
        </div>
      `;
      container.appendChild(item);
    });
    container.querySelectorAll('.builtin-encrypt-toggle').forEach(cb => {
      cb.addEventListener('change', async () => {
        await window.electronAPI.toggleAutoEncryptRule(cb.dataset.builtinType, cb.checked);
        showToast(cb.checked ? '✅ 已启用' : '❌ 已禁用', 'success');
      });
    });
  }

  function renderCustomRules(rules) {
    const container = $('#autoEncryptCustomRules');
    container.innerHTML = '';
    if (rules.length === 0) {
      container.innerHTML = '<small style="color:var(--muted)">暂无自定义规则</small>';
      return;
    }
    rules.forEach(rule => {
      const item = document.createElement('div');
      item.className = 'setting-item';
      item.style.cssText = 'flex-direction:row;align-items:center;justify-content:space-between';
      item.innerHTML = `
        <div>
          <strong>${rule.name}</strong>
          <small style="color:var(--muted);display:block;margin-left:0.5rem;font-family:monospace">${rule.pattern}</small>
        </div>
        <button class="btn-danger btn-sm" data-rule-name="${rule.name}" style="padding:0.2rem 0.5rem;font-size:0.75rem">删除</button>
      `;
      container.appendChild(item);
    });
    container.querySelectorAll('.btn-danger[data-rule-name]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await window.electronAPI.removeCustomAutoEncryptRule(btn.dataset.ruleName);
        showToast('🗑️ 已删除规则', 'success');
        loadAutoEncryptSettings();
      });
    });
  }

  $('#settingAutoEncrypt').addEventListener('change', async () => {
    await window.electronAPI.setAutoEncryptEnabled($('#settingAutoEncrypt').checked);
    showToast($('#settingAutoEncrypt').checked ? '🔐 自动加密已启用' : '🔓 自动加密已禁用', 'success');
  });

  $('#btnAddAutoEncryptRule').addEventListener('click', async () => {
    const name = $('#customRuleName').value.trim();
    const pattern = $('#customRulePattern').value.trim();
    if (!name || !pattern) {
      showToast('请填写规则名称和正则表达式', 'error');
      return;
    }
    try {
      new RegExp(pattern);
    } catch (e) {
      showToast('正则表达式无效：' + e.message, 'error');
      return;
    }
    await window.electronAPI.addCustomAutoEncryptRule(name, pattern);
    $('#customRuleName').value = '';
    $('#customRulePattern').value = '';
    showToast('✅ 规则已添加', 'success');
    loadAutoEncryptSettings();
  });

  $('#btnBatchAutoEncrypt').addEventListener('click', async () => {
    const result = await window.electronAPI.batchAutoEncrypt();
    if (result.success) {
      $('#batchEncryptResult').innerHTML = `<small style="color:var(--success)">✅ 加密 ${result.encryptedCount} 条，跳过 ${result.skippedCount} 条</small>`;
      showToast(`✅ 批量加密完成：${result.encryptedCount} 条`, 'success');
    } else {
      $('#batchEncryptResult').innerHTML = `<small style="color:var(--danger)">❌ ${result.message}</small>``;
    }
  });

  // ==================== v0.46.0: 悬浮预览弹窗 ====================

  let _hoverPreviewEnabled = true;
  let _hoverDelay = 400;
  let _hoverTimer = null;
  let _hoverPreviewVisible = false;

  function showHoverPreview(record, cardEl) {
    const preview = $('#hoverPreview');
    const typeEl = $('#hoverPreviewType');
    const metaEl = $('#hoverPreviewMeta');
    const bodyEl = $('#hoverPreviewBody');

    const typeLabels = { text: '📝 文字', code: '💻 代码', file: '📁 文件', image: '🖼️ 图片' };
    typeEl.textContent = typeLabels[record.type] || '📋';
    const charCount = (record.content || '').length;
    metaEl.textContent = `${formatTimeAgo(new Date(record.created_at))} · ${charCount} 字符`;

    if (record.encrypted) {
      bodyEl.textContent = '🔒 内容已加密';
      bodyEl.className = 'hover-preview-body';
    } else if (record.type === 'image') {
      bodyEl.innerHTML = `<img src="file://${record.content}" alt="图片">`;
      bodyEl.className = 'hover-preview-body';
    } else if (record.type === 'code') {
      bodyEl.textContent = record.content || record.summary || '';
      bodyEl.className = 'hover-preview-body code-preview';
    } else {
      bodyEl.textContent = record.content || record.summary || '';
      bodyEl.className = 'hover-preview-body';
    }

    preview.style.display = 'block';
    positionHoverPreview(cardEl);
    requestAnimationFrame(() => preview.classList.add('show'));
    _hoverPreviewVisible = true;
  }

  function hideHoverPreview() {
    const preview = $('#hoverPreview');
    preview.classList.remove('show');
    _hoverPreviewVisible = false;
    setTimeout(() => {
      if (!_hoverPreviewVisible) preview.style.display = 'none';
    }, 150);
  }

  function positionHoverPreview(cardEl) {
    const preview = $('#hoverPreview');
    const rect = cardEl.getBoundingClientRect();
    const pW = 380, pH = 300;
    let left = rect.right + 8;
    let top = rect.top;
    if (left + pW > window.innerWidth) {
      left = rect.left - pW - 8;
    }
    if (left < 4) left = 4;
    if (top + pH > window.innerHeight) {
      top = window.innerHeight - pH - 8;
    }
    if (top < 4) top = 4;
    preview.style.left = left + 'px';
    preview.style.top = top + 'px';
  }

  function loadHoverPreviewSettings() {
    const enabled = localStorage.getItem('hoverPreview') !== 'false';
    const delay = parseInt(localStorage.getItem('hoverDelay') || '400', 10);
    _hoverPreviewEnabled = enabled;
    _hoverDelay = Math.max(100, Math.min(2000, delay));
    $('#settingHoverPreview').checked = enabled;
    $('#settingHoverDelay').value = _hoverDelay;
  }

  $('#settingHoverPreview').addEventListener('change', () => {
    _hoverPreviewEnabled = $('#settingHoverPreview').checked;
    localStorage.setItem('hoverPreview', _hoverPreviewEnabled);
  });

  $('#settingHoverDelay').addEventListener('change', () => {
    _hoverDelay = Math.max(100, Math.min(2000, parseInt($('#settingHoverDelay').value, 10) || 400));
    $('#settingHoverDelay').value = _hoverDelay;
    localStorage.setItem('hoverDelay', _hoverDelay);
  });

  // ==================== v0.48.0: 快捷片段管理 ====================

  let _snippetEditId = null;
  let _snippetCurrentCategory = '';

  async function loadSnippets(category) {
    try {
      _snippetCurrentCategory = category || '';
      const snippets = await window.ClawBoard.snippetsGetAll(category || null);
      const categories = await window.ClawBoard.snippetsGetCategories();
      renderSnippetCategories(categories);
      renderSnippetList(snippets);
    } catch (e) {
      console.error('loadSnippets error:', e);
    }
  }

  function renderSnippetCategories(categories) {
    const container = $('#snippetCategoryFilter');
    if (!container) return;
    let html = `<button class="snippet-cat-btn ${!_snippetCurrentCategory ? 'active' : ''}" data-category="" style="padding:0.2rem 0.6rem;border-radius:4px;border:1px solid var(--border);background:${!_snippetCurrentCategory ? 'var(--accent)' : 'var(--surface2)'};color:${!_snippetCurrentCategory ? 'white' : 'var(--text)'};font-size:0.78rem;cursor:pointer">全部</button>`;
    categories.forEach(cat => {
      const isActive = _snippetCurrentCategory === cat.name;
      html += `<button class="snippet-cat-btn ${isActive ? 'active' : ''}" data-category="${cat.name}" style="padding:0.2rem 0.6rem;border-radius:4px;border:1px solid var(--border);background:${isActive ? 'var(--accent)' : 'var(--surface2)'};color:${isActive ? 'white' : 'var(--text)'};font-size:0.78rem;cursor:pointer">${cat.name} (${cat.count})</button>`;
    });
    container.innerHTML = html;
    container.querySelectorAll('.snippet-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => loadSnippets(btn.dataset.category || null));
    });
  }

  function renderSnippetList(snippets) {
    const container = $('#snippetList');
    if (!container) return;
    if (!snippets || snippets.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--muted);font-size:0.9rem">暂无片段，点击「新建片段」开始</div>';
      return;
    }
    container.innerHTML = snippets.map(s => `
      <div class="snippet-item" data-id="${s.id}" style="padding:0.6rem 0.8rem;border:1px solid var(--border);border-radius:8px;margin-bottom:0.5rem;background:var(--surface2);cursor:pointer;display:flex;align-items:center;gap:0.6rem">
        <span style="font-size:1.2rem">${s.icon || '📝'}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(s.title)}</div>
          <div style="color:var(--muted);font-size:0.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:0.15rem">${escapeHtml(s.content.substring(0, 80))}</div>
        </div>
        <div style="display:flex;gap:0.3rem;flex-shrink:0">
          ${s.shortcut ? `<span style="background:var(--surface1);padding:0.1rem 0.4rem;border-radius:3px;font-size:0.7rem;color:var(--muted)">${s.shortcut}</span>` : ''}
          <button class="snippet-use-btn" data-id="${s.id}" title="复制并使用" style="padding:0.2rem 0.4rem;border:none;border-radius:4px;background:var(--accent);color:white;font-size:0.75rem;cursor:pointer">📋</button>
          <button class="snippet-edit-btn" data-id="${s.id}" title="编辑" style="padding:0.2rem 0.4rem;border:none;border-radius:4px;background:var(--surface1);color:var(--text);font-size:0.75rem;cursor:pointer">✏️</button>
          <button class="snippet-delete-btn" data-id="${s.id}" title="删除" style="padding:0.2rem 0.4rem;border:none;border-radius:4px;background:var(--surface1);color:var(--red);font-size:0.75rem;cursor:pointer">🗑️</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.snippet-use-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const snippet = await window.ClawBoard.snippetsUse(parseInt(btn.dataset.id));
        if (snippet && !snippet.error) {
          showToast(`📋 已复制「${snippet.title}」`, 'success');
        }
      });
    });

    container.querySelectorAll('.snippet-edit-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const snippet = await window.ClawBoard.snippetsGetById(parseInt(btn.dataset.id));
        if (snippet && !snippet.error) openSnippetEditor(snippet);
      });
    });

    container.querySelectorAll('.snippet-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('确认删除此片段？')) {
          await window.ClawBoard.snippetsDelete(parseInt(btn.dataset.id));
          showToast('🗑️ 片段已删除', 'success');
          loadSnippets(_snippetCurrentCategory || null);
        }
      });
    });
  }

  function openSnippetEditor(snippet = null) {
    _snippetEditId = snippet ? snippet.id : null;
    $('#snippetEditTitle').textContent = snippet ? '📋 编辑片段' : '📋 新建片段';
    $('#snippetEditId').value = _snippetEditId || '';
    $('#snippetEditName').value = snippet ? snippet.title : '';
    $('#snippetEditContent').value = snippet ? snippet.content : '';
    $('#snippetEditCategory').value = snippet ? snippet.category : '默认';
    $('#snippetEditIcon').value = snippet ? snippet.icon : '📝';
    $('#snippetEditShortcut').value = snippet ? (snippet.shortcut || '') : '';
    $('#snippetEditOverlay').style.display = 'flex';
  }

  function closeSnippetEditor() {
    $('#snippetEditOverlay').style.display = 'none';
    _snippetEditId = null;
  }

  async function saveSnippet() {
    const title = $('#snippetEditName').value.trim();
    const content = $('#snippetEditContent').value;
    const category = $('#snippetEditCategory').value.trim() || '默认';
    const icon = $('#snippetEditIcon').value.trim() || '📝';
    const shortcut = $('#snippetEditShortcut').value.trim();

    if (!title || !content) {
      showToast('标题和内容不能为空', 'error');
      return;
    }

    try {
      if (_snippetEditId) {
        const result = await window.ClawBoard.snippetsUpdate(_snippetEditId, { title, content, category, icon, shortcut });
        if (result.error) { showToast(result.error, 'error'); return; }
        showToast('✅ 片段已更新', 'success');
      } else {
        const result = await window.ClawBoard.snippetsCreate({ title, content, category, icon, shortcut });
        if (result.error) { showToast(result.error, 'error'); return; }
        showToast('✅ 片段已创建', 'success');
      }
      closeSnippetEditor();
      loadSnippets(_snippetCurrentCategory || null);
    } catch (e) {
      showToast('保存失败: ' + e.message, 'error');
    }
  }

  function initSnippetsUI() {
    const addBtn = $('#btnAddSnippet');
    if (addBtn) addBtn.addEventListener('click', () => openSnippetEditor());

    const closeBtn = $('#btnCloseSnippetEdit');
    if (closeBtn) closeBtn.addEventListener('click', closeSnippetEditor);

    const cancelBtn = $('#btnCancelSnippetEdit');
    if (cancelBtn) cancelBtn.addEventListener('click', closeSnippetEditor);

    const saveBtn = $('#btnSaveSnippetEdit');
    if (saveBtn) saveBtn.addEventListener('click', saveSnippet);

    const searchInput = $('#snippetSearchInput');
    if (searchInput) {
      let timer;
      searchInput.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          const query = searchInput.value.trim();
          if (!query) {
            loadSnippets(_snippetCurrentCategory || null);
          } else {
            const results = await window.ClawBoard.snippetsSearch(query);
            renderSnippetList(results);
          }
        }, 300);
      });
    }

    const importBtn = $('#btnImportSnippets');
    if (importBtn) {
      importBtn.addEventListener('click', async () => {
        try {
          const result = await window.ClawBoard.showOpenDialog({
            title: '导入片段',
            filters: [{ name: 'JSON', extensions: ['json'] }]
          });
          if (!result.filePaths || result.filePaths.length === 0) return;
          const fileContent = await window.ClawBoard.readFile({ filePath: result.filePaths[0] });
          const data = JSON.parse(fileContent);
          const snippets = Array.isArray(data) ? data : (data.snippets || []);
          const results = await window.ClawBoard.snippetsImport(snippets);
          const success = results.filter(r => r.success).length;
          showToast(`📥 导入完成: ${success} 个片段`, 'success');
          loadSnippets(_snippetCurrentCategory || null);
        } catch (e) {
          showToast('导入失败: ' + e.message, 'error');
        }
      });
    }

    const exportBtn = $('#btnExportSnippets');
    if (exportBtn) {
      exportBtn.addEventListener('click', async () => {
        try {
          const data = await window.ClawBoard.snippetsExport();
          const json = JSON.stringify(data, null, 2);
          const result = await window.ClawBoard.showSaveDialog({
            title: '导出片段',
            defaultPath: 'clawboard-snippets.json',
            filters: [{ name: 'JSON', extensions: ['json'] }]
          });
          if (!result.filePath) return;
          await window.ClawBoard.writeFile({ filePath: result.filePath, content: json });
          showToast('📤 片段已导出', 'success');
        } catch (e) {
          showToast('导出失败: ' + e.message, 'error');
        }
      });
    }
  }

  // ==================== v0.62.0: Diff 对比 ====================
  let currentDiffView = 'split';
  let diffRecordA = null, diffRecordB = null;

  function openDiffPanel(recordA, recordB) {
    diffRecordA = recordA;
    diffRecordB = recordB;
    renderDiffContent(recordA, recordB);
    document.getElementById('diffOverlay').classList.add('show');
  }

  function renderDiffContent(recordA, recordB) {
    const content = document.getElementById('diffContent');
    const stats = document.getElementById('diffStats');
    const textA = recordA.encrypted ? '[加密内容]' : (recordA.content || '');
    const textB = recordB.encrypted ? '[加密内容]' : (recordB.content || '');
    const changes = Diff.diffLines(textA, textB);
    let added = 0, removed = 0;
    let html = '';
    if (currentDiffView === 'split') {
      html = renderSplitDiff(changes);
    } else {
      html = renderUnifiedDiff(changes);
    }
    changes.forEach(part => {
      if (part.added) added += part.count;
      if (part.removed) removed += part.count;
    });
    stats.textContent = `+${added} -${removed} 行变更`;
    content.innerHTML = html;
  }

  function renderUnifiedDiff(changes) {
    let html = '<div class="diff-unified">';
    changes.forEach(part => {
      const cls = part.added ? 'diff-added' : part.removed ? 'diff-removed' : 'diff-context';
      const lines = part.value.split('\n');
      lines.forEach(line => {
        const prefix = part.added ? '+' : part.removed ? '-' : ' ';
        html += `<div class="${cls}"><span class="diff-prefix">${prefix}</span>${escapeHtml(line)}</div>`;
      });
    });
    html += '</div>';
    return html;
  }

  function renderSplitDiff(changes) {
    let leftHtml = '<div class="diff-split"><div class="diff-left">';
    let rightParts = [];
    changes.forEach(part => {
      const lines = part.value.split('\n');
      lines.forEach(line => {
        if (part.removed) {
          leftHtml += `<div class="diff-removed"><span class="diff-prefix">-</span>${escapeHtml(line)}</div>`;
        } else if (part.added) {
          rightParts.push(`<div class="diff-added"><span class="diff-prefix">+</span>${escapeHtml(line)}</div>`);
        } else {
          leftHtml += `<div class="diff-context"><span class="diff-prefix"> </span>${escapeHtml(line)}</div>`;
          rightParts.push(`<div class="diff-context"><span class="diff-prefix"> </span>${escapeHtml(line)}</div>`);
        }
      });
    });
    leftHtml += '</div><div class="diff-right">' + rightParts.join('') + '</div></div>';
    return leftHtml;
  }

  // ==================== v0.66.0: 监控控制 ====================
  async function loadMonitoringPanel() {
    try {
      const status = await window.ClawBoard.getMonitoringStatus();
      updateMonitoringUI(status.paused);
    } catch (e) {
      console.error('Load monitoring status failed:', e);
    }
  }

  function updateMonitoringUI(paused) {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    const btn = document.getElementById('btnToggleMonitoring');
    if (!dot || !text || !btn) return;
    if (paused) {
      dot.className = 'status-dot paused';
      text.textContent = '已暂停';
      btn.textContent = '恢复监控';
    } else {
      dot.className = 'status-dot running';
      text.textContent = '运行中';
      btn.textContent = '暂停监控';
    }
  }

  // Event: toggle monitoring (bind once via init)
  document.addEventListener('DOMContentLoaded', () => {
    const btnToggle = document.getElementById('btnToggleMonitoring');
    if (btnToggle) {
      btnToggle.addEventListener('click', async () => {
        try {
          const result = await window.ClawBoard.toggleMonitoring();
          if (result.success) {
            updateMonitoringUI(result.paused);
            showToast(result.paused ? '监控已暂停' : '监控已恢复', 'success');
          }
        } catch (e) {
          showToast('操作失败', 'error');
        }
      });
    }

    const btnClear = document.getElementById('btnClearFiltered');
    if (btnClear) {
      btnClear.addEventListener('click', async () => {
        const range = document.getElementById('clearRange').value;
        const type = document.getElementById('clearType').value;
        const favorite = document.getElementById('clearFavorite').checked;
        if (!confirm('确定清空符合条件的记录？此操作不可撤销！')) return;
        try {
          const result = await window.ClawBoard.clearRecordsFiltered({ range, type, favorite });
          if (result.success) {
            showToast(`已清空 ${result.deleted} 条记录`, 'success');
            await loadRecords();
            await loadStats();
          }
        } catch (e) {
          showToast('清空失败', 'error');
        }
      });
    }
  });

  // ==================== 启动 ====================
  document.addEventListener('DOMContentLoaded', init);
})();



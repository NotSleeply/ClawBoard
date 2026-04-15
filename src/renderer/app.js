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
    loadSearchHistory();      // v0.35.0: 加载搜索历史
    initSearchHistoryUI();    // v0.35.0: 初始化搜索历史下拉
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
    };

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

      if (searchQuery) {
        options.search = searchQuery;
        records = await window.ClawBoard.search(searchQuery);
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
    } catch (err) {
      console.error('加载设置失败:', err);
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

    // 多选模式下显示复选框
    const checkboxHtml = isMultiSelectMode
      ? `<span class="record-checkbox ${selectedIds.has(record.id) ? 'checked' : ''}">${selectedIds.has(record.id) ? '✓' : ''}</span>`
      : '';

    card.innerHTML = `
      <div class="record-header">
        ${checkboxHtml}
        <span class="record-type ${record.type}">${typeLabels[record.type] || '📋'}</span>
        ${encryptedBadge}
        <span class="record-time">${timeAgo}</span>
        <span class="record-fav" title="${record.favorite ? '取消收藏' : '收藏'}">
          ${record.favorite ? '★' : '☆'}
        </span>
        <button class="record-note-btn ${noteText ? 'has-note' : ''}" data-id="${record.id}" title="${noteText ? '查看/编辑备注' : '添加备注'}">
          📝
        </button>
      </div>
      <div class="record-content ${record.type}">${formatContent(record)}</div>
      ${tagsHtml}
      ${noteHtml}
    `;

    card.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isMultiSelectMode) {
        handleSelectRecord(record);
      } else {
        openDetailPanel(record);
      }
    });

    // 备注按钮 - 内联编辑
    const noteBtn = card.querySelector('.record-note-btn');
    noteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showNoteEditor(record, noteBtn);
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

    return card;
  }

  function formatContent(record) {
    if (record.type === 'image') {
      return `<img src="file://${record.content}" alt="图片" loading="lazy">`;
    }

    let text = escapeHtml(record.content || record.summary || '');
    if (text.length > 200) {
      text = text.substring(0, 197) + '...';
    }
    // v0.35.0: 搜索高亮
    if (searchQuery) {
      text = highlightText(text, searchQuery);
    }
    return text;
  }

  // v0.35.0: 搜索关键词高亮
  function highlightText(text, query) {
    if (!query || query.length < 1) return text;
    try {
      // 转义正则特殊字符
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // 大小写不敏感匹配，高亮所有匹配项
      const regex = new RegExp(`(${escaped})`, 'gi');
      return text.replace(regex, '<mark class="search-highlight">$1</mark>');
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

  function handleSelectRecord(record) {
    if (selectedIds.has(record.id)) {
      selectedIds.delete(record.id);
    } else {
      selectedIds.add(record.id);
    }
    updateMultiSelectUI();
    // 只更新对应的卡片选中状态，不重新渲染整个列表
    const card = recordsList.querySelector(`[data-id="${record.id}"]`);
    if (card) {
      card.classList.toggle('selected', selectedIds.has(record.id));
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
  async function loadExpiryStats() {
    try {
      const stats = await window.ClawBoard.getExpiryStats();
      $('#expiryExpiredCount').textContent = stats.expired;
      $('#expiryProtectedCount').textContent = stats.protected;
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

  // ==================== 启动 ====================
  document.addEventListener('DOMContentLoaded', init);
})();



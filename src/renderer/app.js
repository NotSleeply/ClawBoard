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
    $('#btnBatchFavorite').addEventListener('click', handleBatchFavorite);
    $('#btnBatchDelete').addEventListener('click', handleBatchDelete);
    $('#btnBatchExport').addEventListener('click', handleBatchExport);

    // 视图切换
    $('#btnViewToggle').addEventListener('click', toggleViewMode);

    // 详情面板点击外部关闭
    detailPanel.addEventListener('click', (e) => {
      if (e.target === detailPanel) {
        closeDetailPanel();
      }
    });
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

  async function loadStats() {
    try {
      const stats = await window.ClawBoard.getStats();
      totalCount.textContent = stats.total;
    } catch (err) {
      console.error('加载统计失败:', err);
    }
  }

  async function loadSettings() {
    try {
      const settings = await window.ClawBoard.getSettings();
      $('#settingMaxRecords').value = settings.maxRecords || 1000;
      $('#settingOllama').value = settings.ollamaHost || 'http://localhost:11434';
      $('#settingAiSummary').checked = settings.aiSummary !== false;
      $('#settingStartWithSystem').checked = settings.startWithSystem || false;
      $('#settingShortcut').value = settings.globalShortcut || 'Ctrl+Shift+V';
      // 应用主题
      applyTheme(settings.theme || 'dark');
    } catch (err) {
      console.error('加载设置失败:', err);
    }
  }

  function applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

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
    card.className = 'record-card' + (record.favorite ? ' favorite' : '') + (isTimelineMode ? ' timeline-card' : '');
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

    // 多选模式下显示复选框
    const checkboxHtml = isMultiSelectMode
      ? `<span class="record-checkbox ${selectedIds.has(record.id) ? 'checked' : ''}">${selectedIds.has(record.id) ? '✓' : ''}</span>`
      : '';

    card.innerHTML = `
      <div class="record-header">
        ${checkboxHtml}
        <span class="record-type ${record.type}">${typeLabels[record.type] || '📋'}</span>
        <span class="record-time">${timeAgo}</span>
        <span class="record-fav" title="${record.favorite ? '取消收藏' : '收藏'}">
          ${record.favorite ? '★' : '☆'}
        </span>
      </div>
      <div class="record-content ${record.type}">${formatContent(record)}</div>
    `;

    card.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isMultiSelectMode) {
        handleSelectRecord(record);
      } else {
        openDetailPanel(record);
      }
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
    return text;
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
        preview.innerHTML = marked.parse(record.content, {
          breaks: true,
          gfm: true,
        });
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
        content.innerHTML = `<code>${escapeHtml(record.content)}</code>`;
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

    renderPreviewContent(record);

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

  function closeDetailPanel() {
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

  // ==================== 操作处理 ====================
  async function handleSearch() {
    searchQuery = searchInput.value.trim();
    clearSearchBtn.classList.toggle('show', !!searchQuery);
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

  async function handleSaveSettings() {
    const settings = {
      maxRecords: parseInt($('#settingMaxRecords').value) || 1000,
      ollamaHost: $('#settingOllama').value,
      aiSummary: $('#settingAiSummary').checked,
      startWithSystem: $('#settingStartWithSystem').checked,
      theme: $('#settingTheme').value || 'dark',
      globalShortcut: $('#settingShortcut').value || 'Ctrl+Shift+V',
    };

    try {
      // 先保存设置
      await window.ClawBoard.saveSettings(settings);
      // 更新快捷键
      await window.ClawBoard.updateShortcut(settings.globalShortcut);
      applyTheme(settings.theme);
      settingsOverlay.classList.remove('show');
      showToast('✅ 设置已保存', 'success');
    } catch (err) {
      showToast('❌ 保存失败', 'error');
    }
  }

  // ==================== 工具函数 ====================
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

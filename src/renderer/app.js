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

  function createRecordCard(record, index) {
    const card = document.createElement('div');
    card.className = 'record-card' + (record.favorite ? ' favorite' : '');
    card.style.animationDelay = `${index * 30}ms`;

    const typeLabels = {
      text: '📝 文字',
      code: '💻 代码',
      file: '📁 文件',
      image: '🖼️ 图片',
    };

    const timeAgo = formatTimeAgo(new Date(record.created_at));

    card.innerHTML = `
      <div class="record-header">
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
      openDetailPanel(record);
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
  function openDetailPanel(record) {
    selectedRecord = record;
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

    const content = $('#detailContent');
    if (record.type === 'image') {
      content.innerHTML = `<img src="file://${record.content}" alt="图片">`;
    } else if (record.type === 'code' && record.language) {
      // 代码高亮显示
      content.innerHTML = `<code class="hljs language-${record.language}">${escapeHtml(record.content)}</code>`;
      hljs.highlightElement(content.querySelector('code'));
    } else {
      content.innerHTML = `<code>${escapeHtml(record.content)}</code>`;
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

  function closeDetailPanel() {
    detailPanel.classList.remove('open');
    selectedRecord = null;
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
    };

    try {
      await window.ClawBoard.saveSettings(settings);
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

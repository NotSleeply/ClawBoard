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
      </div>
      <div class="record-content ${record.type}">${formatContent(record)}</div>
      ${tagsHtml}
    `;

    card.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isMultiSelectMode) {
        handleSelectRecord(record);
      } else {
        openDetailPanel(record);
      }
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

    try {
      // 先保存设置
      await window.ClawBoard.saveSettings(settings);
      // 保存快捷键设置
      await window.ClawBoard.saveShortcuts(shortcuts);
      // 更新全局快捷键
      await window.ClawBoard.updateShortcut(shortcuts.global);
      applyTheme(settings.theme);
      settingsOverlay.classList.remove('show');
      showToast('✅ 设置已保存', 'success');
    } catch (err) {
      showToast('❌ 保存失败', 'error');
    }
  }

  // 添加重置快捷键按钮事件监听
  $('#btnResetShortcuts').addEventListener('click', resetShortcuts);

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

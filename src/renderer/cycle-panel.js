const { ipcRenderer } = require('electron');

let records = [];
let activeIndex = 0;
const listEl = document.getElementById('cycleList');
const countEl = document.getElementById('cycleCount');

function typeLabel(type) {
  const map = { text: '\u6587\u5b57', code: '\u4ee3\u7801', file: '\u6587\u4ef6', image: '\u56fe\u7247', url: '\u94fe\u63a5' };
  return map[type] || type;
}

function render() {
  if (!records.length) {
    listEl.innerHTML = '<div class="cycle-empty">\u6682\u65e0\u526a\u8d34\u677f\u8bb0\u5f55</div>';
    countEl.textContent = '0 \u6761\u8bb0\u5f55';
    return;
  }
  countEl.textContent = records.length + ' \u6761\u8bb0\u5f55';
  listEl.innerHTML = records.map((r, i) => {
    const preview = (r.content || r.summary || '').replace(/\n/g, ' ').substring(0, 80);
    const cls = i === activeIndex ? 'cycle-item active' : 'cycle-item';
    return '<div class="' + cls + '">' +
      '<span class="idx">' + (i + 1) + '</span>' +
      '<span class="preview">' + escapeHtml(preview) + '</span>' +
      '<span class="type-badge">' + typeLabel(r.type) + '</span>' +
      '</div>';
  }).join('');
  // scroll active into view
  const activeEl = listEl.querySelector('.active');
  if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function next() {
  if (!records.length) return;
  activeIndex = (activeIndex + 1) % records.length;
  render();
}

function prev() {
  if (!records.length) return;
  activeIndex = (activeIndex - 1 + records.length) % records.length;
  render();
}

function paste() {
  if (!records.length) return;
  const item = records[activeIndex];
  ipcRenderer.send('cycle-paste', item);
}

function cancel() {
  ipcRenderer.send('cycle-cancel');
}

// Load records
ipcRenderer.invoke('get-records', { type: null, limit: 30, offset: 0, search: '', favorite: null }).then(result => {
  records = result || [];
  render();
});

// Key bindings
document.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'ArrowDown':
    case 'Tab':
      e.preventDefault();
      next();
      break;
    case 'ArrowUp':
      e.preventDefault();
      prev();
      break;
    case 'Escape':
      e.preventDefault();
      cancel();
      break;
    case 'Enter':
      e.preventDefault();
      paste();
      break;
  }
});

// Paste on mouse click
listEl.addEventListener('click', (e) => {
  const item = e.target.closest('.cycle-item');
  if (item) {
    const idx = Array.from(listEl.children).indexOf(item);
    if (idx >= 0) {
      activeIndex = idx;
      render();
      paste();
    }
  }
});

// Listen for cycle-next from main process (when Alt+V pressed again)
ipcRenderer.on('cycle-next', () => next());
ipcRenderer.on('cycle-prev', () => prev());
ipcRenderer.on('cycle-paste-now', () => paste());
ipcRenderer.on('cycle-cancel-now', () => cancel());

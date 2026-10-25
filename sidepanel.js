const state = {
  tabs: [],
  groups: [],
  notes: {},
  collapsed: new Set(),
  search: '',
  selectionMode: false,
  selectedTabs: new Set()
};

const COLORS = {
  grey: '#8a969d', blue: '#5794d0', red: '#d66b63', yellow: '#cba34e', green: '#5aa586', pink: '#ce7395', purple: '#9673bd', cyan: '#5baeb3', orange: '#cf8857'
};

const $ = (selector) => document.querySelector(selector);

async function loadData() {
  const [tabs, groups, { tabNotes = {} }] = await Promise.all([
    chrome.tabs.query({ currentWindow: true }),
    chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT }),
    chrome.storage.local.get('tabNotes')
  ]);
  state.tabs = tabs.sort((a, b) => a.index - b.index);
  state.groups = groups;
  state.notes = tabNotes;
  const ungroupedIds = new Set(tabs.filter((tab) => tab.groupId === -1).map((tab) => tab.id));
  state.selectedTabs = new Set([...state.selectedTabs].filter((tabId) => ungroupedIds.has(tabId)));
  const ungroupedCollapsed = state.collapsed.has(-1);
  state.collapsed = new Set(groups.filter((group) => group.collapsed).map((group) => group.id));
  if (ungroupedCollapsed) state.collapsed.add(-1);
  render();
}

function faviconFor(tab) {
  if (tab.favIconUrl && !tab.url?.startsWith('chrome://')) return `<img class="tab-favicon" src="${escapeAttr(tab.favIconUrl)}" alt="" />`;
  const letter = escapeHtml((tab.title || tab.url || '?').trim().slice(0, 1).toUpperCase());
  return `<span class="tab-favicon tab-favicon-fallback" aria-hidden="true">${letter}</span>`;
}

function render() {
  const search = state.search.trim().toLocaleLowerCase();
  const groups = new Map(state.groups.map((group) => [group.id, { ...group, tabs: [] }]));
  const ungrouped = { id: -1, title: '未分组', color: 'grey', tabs: [] };
  state.tabs.forEach((tab) => {
    const note = state.notes[String(tab.id)] || '';
    const haystack = `${tab.title || ''} ${tab.url || ''} ${note}`.toLocaleLowerCase();
    if (search && !haystack.includes(search)) return;
    (groups.get(tab.groupId) || ungrouped).tabs.push(tab);
  });
  const visibleGroups = [...groups.values(), ungrouped]
    .filter((group) => group.tabs.length || (!search && group.id !== -1))
    .sort((a, b) => (a.tabs[0]?.index ?? Number.MAX_SAFE_INTEGER) - (b.tabs[0]?.index ?? Number.MAX_SAFE_INTEGER));
  $('#tabCount').textContent = state.tabs.length;
  $('#groupCount').textContent = state.groups.length;
  $('#groups').innerHTML = visibleGroups.map(renderGroup).join('') || `<div class="empty-state"><strong>没有找到匹配的标签</strong><p>换个关键词试试，搜索也会匹配标签备注。</p></div>`;
  $('#groups').querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', onAction));
  $('#groups').querySelectorAll('.group-header').forEach((button) => button.addEventListener('click', () => toggleGroup(Number(button.dataset.groupId))));
  $('#groups').querySelectorAll('.tab-main').forEach((node) => node.addEventListener('click', () => activateTab(Number(node.dataset.tabId))));
  $('#groups').querySelectorAll('.tab-checkbox input').forEach((input) => input.addEventListener('change', onTabSelectionChange));
  updateSelectionUi();
}

function renderGroup(group) {
  const collapsed = state.collapsed.has(group.id);
  const label = group.id === -1 ? group.title : escapeHtml(group.title || '未命名分组');
  return `<section class="group ${collapsed ? 'collapsed' : ''}">
    <button class="group-header" data-group-id="${group.id}" aria-expanded="${!collapsed}">
      <svg class="group-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>
      <span class="group-swatch" style="background:${COLORS[group.color] || COLORS.grey}"></span>
      <span class="group-name">${label}</span>
      <span class="group-count">${group.tabs.length}</span>
      ${group.id === -1 ? '<span class="group-menu ' + (state.selectionMode ? 'is-active' : '') + '" data-action="select-ungrouped" title="多选标签"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8 12 2.5 2.5L16 9"/></svg></span>' : '<span class="group-menu" data-action="save-bookmarks" data-group-id="' + group.id + '" title="保存到书签"><svg viewBox="0 0 24 24"><path d="M6 4h12v16l-6-3-6 3Z"/></svg></span><span class="group-menu" data-action="rename-group" data-group-id="' + group.id + '" title="重命名分组"><svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></span>'}
    </button>
    <div class="tab-list">${group.tabs.map(renderTab).join('') || '<div class="empty-state"><p>这个分组还没有标签</p></div>'}</div>
  </section>`;
}

function renderTab(tab) {
  const id = String(tab.id);
  const note = state.notes[id] || '';
  const host = getHost(tab.url);
  const titleMarkup = note
    ? `<div class="tab-title note-primary">${escapeHtml(note)}</div><div class="tab-original-title" title="${escapeAttr(tab.title || '无标题')}">${escapeHtml(tab.title || '无标题')}</div>`
    : `<div class="tab-title">${escapeHtml(tab.title || '无标题')}</div>`;
  const selectable = state.selectionMode && tab.groupId === -1;
  const checkbox = selectable ? `<label class="tab-checkbox" title="选择标签"><input type="checkbox" data-tab-id="${tab.id}" ${state.selectedTabs.has(tab.id) ? 'checked' : ''} /><span></span></label>` : '';
  return `<article class="tab-item ${tab.active ? 'active' : ''} ${tab.discarded ? 'is-muted' : ''} ${selectable ? 'selection-enabled' : ''}" data-tab-id="${tab.id}">
    ${checkbox}
    ${faviconFor(tab)}
    <div class="tab-main" data-tab-id="${tab.id}" title="${escapeAttr(note || tab.title || tab.url || '')}">${titleMarkup}<div class="tab-url">${escapeHtml(host)}</div></div>
    <div class="tab-actions"><button class="tab-action" data-action="note" data-tab-id="${tab.id}" title="${note ? '编辑备注' : '添加备注'}" aria-label="${note ? '编辑备注' : '添加备注'}"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17l-1 3Z"/></svg></button><button class="tab-action danger" data-action="close" data-tab-id="${tab.id}" title="关闭标签" aria-label="关闭标签"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
  </article>`;
}

async function onAction(event) {
  event.stopPropagation();
  const button = event.currentTarget;
  if (button.dataset.action === 'select-ungrouped') {
    state.selectionMode = !state.selectionMode;
    if (!state.selectionMode) state.selectedTabs.clear();
    render();
    return;
  }
  if (button.dataset.action === 'save-bookmarks') return saveGroupToBookmarks(Number(button.dataset.groupId));
  const tabId = Number(button.dataset.tabId);
  if (button.dataset.action === 'close') return chrome.tabs.remove(tabId);
  if (button.dataset.action === 'note') return openNoteEditor(tabId);
  if (button.dataset.action === 'rename-group') {
    const groupId = Number(button.dataset.groupId);
    const group = state.groups.find((item) => item.id === groupId);
    const name = window.prompt('分组名称', group?.title || '');
    if (name?.trim()) { await chrome.tabGroups.update(groupId, { title: name.trim() }); await loadData(); }
  }
}

async function saveGroupToBookmarks(groupId) {
  const group = state.groups.find((item) => item.id === groupId);
  if (!group) return;
  const tabs = state.tabs.filter((tab) => tab.groupId === groupId && isBookmarkableUrl(tab.url));
  if (!tabs.length) return showToast('这个分组没有可保存的网页标签');
  try {
    const tree = await chrome.bookmarks.getTree();
    const bar = findBookmarksBar(tree);
    if (!bar) return showToast('找不到 Chrome 书签栏');
    const folder = await chrome.bookmarks.create({ parentId: bar.id, title: group.title || '未命名分组' });
    await Promise.all(tabs.map((tab) => chrome.bookmarks.create({
      parentId: folder.id,
      title: tab.title || getHost(tab.url),
      url: tab.url
    })));
    showToast(`已手动保存 ${tabs.length} 个书签到“${folder.title}”`);
  } catch (error) {
    console.error('保存到书签失败', error);
    showToast('保存到书签失败，请重试');
  }
}

function findBookmarksBar(nodes) {
  for (const node of nodes) {
    if (node.id === '1' || ['书签栏', 'Bookmarks bar', 'Bookmarks Bar'].includes(node.title)) return node;
    if (node.children) {
      const result = findBookmarksBar(node.children);
      if (result) return result;
    }
  }
  return null;
}

function isBookmarkableUrl(url = '') {
  return /^(https?|ftp):\/\//i.test(url);
}

async function activateTab(tabId) {
  const tab = state.tabs.find((item) => item.id === tabId);
  if (!tab) return;
  await chrome.tabs.update(tabId, { active: true });
  if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
}

function openNoteEditor(tabId) {
  const item = [...document.querySelectorAll('.tab-item')].find((node) => Number(node.dataset.tabId) === tabId);
  if (!item || item.querySelector('.note-editor')) return;
  const note = state.notes[String(tabId)] || '';
  const editor = document.createElement('div');
  editor.className = 'note-editor';
  editor.innerHTML = `<input type="text" maxlength="120" value="${escapeAttr(note)}" placeholder="写下这个标签的备注…" /><button>保存</button>`;
  item.appendChild(editor);
  const input = editor.querySelector('input');
  input.focus(); input.select();
  const save = async () => {
    const value = input.value.trim();
    if (value) state.notes[String(tabId)] = value; else delete state.notes[String(tabId)];
    await chrome.storage.local.set({ tabNotes: state.notes });
    setSaveStatus('已保存');
    render();
  };
  editor.querySelector('button').addEventListener('click', save);
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') save(); if (event.key === 'Escape') render(); });
}

async function createGroup() {
  if (state.selectionMode) return createGroupFromSelection();
  const name = window.prompt('新建分组', '新分组');
  if (!name?.trim()) return;
  const active = state.tabs.find((tab) => tab.active);
  if (!active) return showToast('当前窗口没有可用标签');
  const groupId = await chrome.tabs.group({ tabIds: [active.id] });
  await chrome.tabGroups.update(groupId, { title: name.trim(), color: 'blue' });
  await loadData();
}

async function createGroupFromSelection() {
  const tabIds = [...state.selectedTabs];
  if (!tabIds.length) return showToast('请先选择至少一个未分组标签');
  const name = window.prompt('新建分组', '新分组');
  if (!name?.trim()) return;
  try {
    const groupId = await chrome.tabs.group({ tabIds });
    await chrome.tabGroups.update(groupId, { title: name.trim(), color: 'blue' });
    state.selectionMode = false;
    state.selectedTabs.clear();
    await loadData();
  } catch (error) {
    console.error('创建标签组失败', error);
    showToast('创建分组失败，请重试');
  }
}

function onTabSelectionChange(event) {
  const tabId = Number(event.currentTarget.dataset.tabId);
  if (event.currentTarget.checked) state.selectedTabs.add(tabId); else state.selectedTabs.delete(tabId);
  updateSelectionUi();
}

function updateSelectionUi() {
  const label = $('#newGroupLabel');
  const button = $('#newGroupButton');
  if (!label || !button) return;
  const count = state.selectedTabs.size;
  label.textContent = state.selectionMode ? (count ? `用已选 ${count} 个标签新建分组` : '用已选标签新建分组') : '新建分组';
  button.classList.toggle('selection-action', state.selectionMode);
}

async function toggleGroup(groupId) {
  const nextCollapsed = !state.collapsed.has(groupId);
  if (groupId === -1) {
    if (nextCollapsed) state.collapsed.add(-1); else state.collapsed.delete(-1);
    render();
    return;
  }
  if (!state.groups.some((group) => group.id === groupId)) return;
  if (nextCollapsed) state.collapsed.add(groupId); else state.collapsed.delete(groupId);
  render();
  try {
    await chrome.tabGroups.update(groupId, { collapsed: nextCollapsed });
  } catch (error) {
    console.error('同步标签组折叠状态失败', error);
    await loadData();
  }
}

async function setAllGroupsCollapsed(collapsed) {
  if (collapsed) state.groups.forEach((group) => state.collapsed.add(group.id));
  else state.groups.forEach((group) => state.collapsed.delete(group.id));
  if (collapsed) state.collapsed.add(-1); else state.collapsed.delete(-1);
  render();
  await Promise.allSettled(state.groups.map((group) => chrome.tabGroups.update(group.id, { collapsed })));
  await loadData();
}

function getHost(url = '') { try { return new URL(url).hostname.replace(/^www\./, '') || '浏览器页面'; } catch { return '浏览器页面'; } }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function escapeAttr(value) { return escapeHtml(value); }
function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); window.clearTimeout(showToast.timer); showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 1800); }
function setSaveStatus(message) { $('#saveStatus').textContent = message; window.clearTimeout(setSaveStatus.timer); setSaveStatus.timer = window.setTimeout(() => { $('#saveStatus').textContent = '备注自动保存'; }, 1800); }

$('#refreshButton').addEventListener('click', loadData);
$('#translateButton').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return showToast('找不到当前标签');
  try {
    const result = await chrome.runtime.sendMessage({ type: 'toggle-tab', tabId: tab.id });
    showToast(result?.enabled ? '已开启整页翻译' : result?.error || '已关闭整页翻译');
  } catch (error) {
    showToast('此页面不支持注入翻译');
  }
});
$('#settingsButton').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('#newGroupButton').addEventListener('click', createGroup);
$('#expandAllButton').addEventListener('click', () => setAllGroupsCollapsed(false));
$('#collapseAllButton').addEventListener('click', () => setAllGroupsCollapsed(true));
$('#searchInput').addEventListener('input', (event) => { state.search = event.target.value; render(); });
$('#helpButton').addEventListener('click', () => showToast('拖动 Chrome 侧边栏边界即可调整宽度'));
document.addEventListener('keydown', (event) => { if (event.key === '/' && document.activeElement !== $('#searchInput')) { event.preventDefault(); $('#searchInput').focus(); } });

['onCreated', 'onRemoved', 'onUpdated', 'onActivated', 'onMoved'].forEach((eventName) => chrome.tabs[eventName].addListener(loadData));
['onCreated', 'onRemoved', 'onUpdated', 'onMoved'].forEach((eventName) => chrome.tabGroups[eventName].addListener(loadData));
chrome.storage.onChanged.addListener((changes) => {
  if (changes.tabNotes) { state.notes = changes.tabNotes.newValue || {}; render(); }
});
loadData();

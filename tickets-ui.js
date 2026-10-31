const ticketUi = { query: '', view: 'tabs', status: 'all', sort: 'updated-desc', collapsed: new Set(), deleteTicketId: null };
const q = (s) => document.querySelector(s);
const TICKET_CHANNELS = ['爱番番','微信','Discord','Intercom','企微','Mail','飞书','Slack','钉钉','KIM'];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

document.addEventListener('click', (event) => {
  if (!event.target.closest('.ticket-status-row')) document.querySelectorAll('.ticket-status-menu').forEach((menu) => { menu.hidden = true; });
});

function showWorkspace(view) {
  ticketUi.view = view;
  document.querySelectorAll('.workspace-tab').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  q('#tabsView').hidden = view !== 'tabs';
  q('#ticketsView').hidden = view !== 'tickets';
  q('#settingsView').hidden = view !== 'settings';
  if (view === 'tickets') renderTicketBoard();
}
function ticketCard(ticket, settings) {
  const timer = ticketTimers(ticket); const overdue = isOverdue(ticket, settings);
  const collapsed = ticketUi.collapsed.has(ticket.id);
  return `<article class="ticket-card ${overdue?'overdue':''} ${collapsed?'is-collapsed':''}" data-ticket-id="${esc(ticket.id)}">
    <header><button class="ticket-collapse" data-action="toggle-card" aria-expanded="${!collapsed}">${collapsed?'▸':'▾'}</button><div class="ticket-title-text" data-field="title" data-copy="${esc(ticket.title || autoTitle(ticket))}" title="单击复制标题">${esc(ticket.title || autoTitle(ticket))}</div><button class="ticket-delete" data-action="delete-ticket" title="删除工单">×</button></header>
    <div class="ticket-summary"><span>${esc(ticket.channel === '其他' ? (ticket.customChannel || '其他') : (ticket.channel || '未选渠道'))}</span><span>${esc(ticket.customer || '未填客户')}</span>${ticket.note ? `<span class="ticket-summary-note" title="${esc(ticket.note)}">${esc(ticket.note)}</span>` : ''}<span>${TICKET_STATUSES[ticket.status]}</span><span>${overdue?'超时未跟进':`未更新 ${timer.sinceUpdate}`}</span></div>
    <div class="ticket-details">
      <div class="ticket-fields ticket-fields-main"><select data-field="channel" aria-label="渠道"><option value="" disabled ${ticket.channel?'':'selected'}>选择渠道</option>${TICKET_CHANNELS.map((channel)=>`<option value="${channel}" ${ticket.channel===channel?'selected':''}>${channel}</option>`).join('')}<option value="其他" ${ticket.channel==='其他'?'selected':''}>其他</option></select><input data-field="customer" value="${esc(ticket.customer)}" placeholder="客户" /></div>
      <div class="ticket-custom-channel-row" ${ticket.channel==='其他'?'':'hidden'}><input class="ticket-custom-channel" data-field="customChannel" value="${esc(ticket.customChannel||'')}" placeholder="填写渠道名称" aria-label="自定义渠道" /></div>
      <input class="ticket-note-input" data-field="note" value="${esc(ticket.note||'')}" placeholder="工单 / 备注内容" aria-label="工单或备注内容" />
      <fieldset class="ticket-priority"><legend>优先级</legend><label><input type="radio" name="priority-${esc(ticket.id)}" data-field="priority" value="low" ${ticket.priority==='low'?'checked':''}><span class="priority-dot low"></span>低</label><label><input type="radio" name="priority-${esc(ticket.id)}" data-field="priority" value="normal" ${ticket.priority==='normal'?'checked':''}><span class="priority-dot normal"></span>普通</label><label><input type="radio" name="priority-${esc(ticket.id)}" data-field="priority" value="high" ${ticket.priority==='high'?'checked':''}><span class="priority-dot high"></span>高</label></fieldset>
      <div class="ticket-timers"><span>总计 <b>${timer.total}</b></span><span>状态 <b>${timer.current}</b></span><span>未更新 <b>${timer.sinceUpdate}</b></span></div>
      ${overdue?'<div class="ticket-overdue">超时未跟进</div>':''}
      <div class="ticket-status-row"><button type="button" class="ticket-status-trigger status-${esc(ticket.status)}" data-action="open-status" aria-expanded="false"><span class="status-code">${({new:'N',active:'A',waiting:'W',resolved:'R',closed:'C'})[ticket.status]||'?'}</span><span>${TICKET_STATUSES[ticket.status]}</span><span class="status-caret">▾</span></button><div class="ticket-status-menu" hidden>${Object.entries(TICKET_STATUSES).map(([key,label])=>`<button type="button" data-action="set-status" data-status="${key}" class="${ticket.status===key?'selected':''}"><span class="status-code status-${key}">${({new:'N',active:'A',waiting:'W',resolved:'R',closed:'C'})[key]}</span>${label}</button>`).join('')}</div></div>
      <div class="ticket-inline-log"><textarea data-field="progress" placeholder="直接在这里记录处理进度…"></textarea><button data-action="add-log">添加进展</button></div>
      <details class="ticket-history"><summary>进展记录（${ticket.logs.length}）</summary>${ticket.logs.slice().reverse().map(log=>`<p><time>${new Date(log.at).toLocaleString()}</time> ${esc(log.text)}</p>`).join('')||'<p>暂无记录</p>'}</details>
    </div>
  </article>`;
}
async function renderTicketBoard() {
  const { tickets, settings } = await getTicketData();
  let visible = tickets.filter((t) => ticketMatches(t, ticketUi.query) && (ticketUi.status === 'all' || t.status === ticketUi.status));
  visible.sort((a,b) => ticketUi.sort === 'overdue' ? Number(isOverdue(b,settings))-Number(isOverdue(a,settings)) || new Date(a.updatedAt)-new Date(b.updatedAt) : ticketUi.sort === 'updated-asc' ? new Date(a.updatedAt)-new Date(b.updatedAt) : new Date(b.updatedAt)-new Date(a.updatedAt));
  const overdue = visible.filter((t) => isOverdue(t, settings));
  q('#ticketStats').innerHTML = `<span><b>${visible.length}</b> 全部</span><span><b>${overdue.length}</b> 超时</span><span><b>${visible.filter(t=>t.status==='new').length}</b> 待响应</span>`;
  q('#ticketBadge').textContent = overdue.length ? ` ${overdue.length}` : '';
  q('#ticketBoard').innerHTML = visible.length ? visible.map((t) => ticketCard(t, settings)).join('') : '<div class="empty-state"><strong>还没有工单</strong><p>点击“新建工单”记录需要跟进的问题。</p></div>';
  q('#ticketBoard').querySelectorAll('.ticket-title-text').forEach((node) => node.addEventListener('click', async (e) => { const text=e.currentTarget.dataset.copy.trim(); if (!text) return; try { await navigator.clipboard.writeText(text); showToast('标题已复制'); } catch { showToast('复制失败，请检查剪贴板权限'); } }));
  q('#ticketBoard').querySelectorAll('[data-action="toggle-card"]').forEach((b) => b.addEventListener('click', async (e) => { const id=e.currentTarget.closest('[data-ticket-id]').dataset.ticketId; ticketUi.collapsed.has(id)?ticketUi.collapsed.delete(id):ticketUi.collapsed.add(id); await chrome.storage.local.set({ticketCollapsed:[...ticketUi.collapsed]}); renderTicketBoard(); }));
  q('#ticketBoard').querySelectorAll('[data-action="delete-ticket"]').forEach((b) => b.addEventListener('click', (e) => { const card=e.currentTarget.closest('[data-ticket-id]'); openDeleteConfirm(card.dataset.ticketId, card.querySelector('.ticket-title-text')?.dataset.copy || '该工单'); }));
  q('#ticketBoard').querySelectorAll('[data-action="open-status"]').forEach((button) => button.addEventListener('click', (e) => { const row=e.currentTarget.closest('.ticket-status-row'); const menu=row.querySelector('.ticket-status-menu'); menu.hidden=!menu.hidden; e.currentTarget.setAttribute('aria-expanded',String(!menu.hidden)); }));
  q('#ticketBoard').querySelectorAll('[data-action="set-status"]').forEach((button) => button.addEventListener('click', async (e) => { const card=e.currentTarget.closest('[data-ticket-id]'); const status=e.currentTarget.dataset.status; const oldStatus=card.querySelector('.ticket-status-trigger span:nth-child(2)').textContent; await updateTicket(card.dataset.ticketId,{status},`状态由「${oldStatus}」更新为「${TICKET_STATUSES[status]}」`); renderTicketBoard(); }));
  q('#ticketBoard').querySelectorAll('[data-action="add-log"]').forEach((b) => b.addEventListener('click', async (e) => { const card=e.currentTarget.closest('[data-ticket-id]'); const text=card.querySelector('[data-field="progress"]').value; if(text?.trim()) { await updateTicket(card.dataset.ticketId,{},text); renderTicketBoard(); } else card.querySelector('[data-field="progress"]').focus(); }));
  q('#ticketBoard').querySelectorAll('[data-field="customer"],[data-field="channel"],[data-field="customChannel"],[data-field="note"],[data-field="priority"]').forEach((input) => input.addEventListener('change', async (e) => { const field=e.currentTarget.dataset.field; const value=field==='priority'||field==='channel'?e.currentTarget.value:e.currentTarget.value.trim(); const card=e.currentTarget.closest('[data-ticket-id]'); if(field==='channel'){card.querySelector('.ticket-custom-channel-row').hidden=value!=='其他';if(value==='其他')card.querySelector('[data-field="customChannel"]').focus();} await updateTicket(card.dataset.ticketId,{[field]:value}); if(field!=='priority'){const id=card.dataset.ticketId;const {tickets}=await getTicketData();const t=tickets.find(x=>x.id===id);if(t&&!t.titleEdited)await updateTicket(id,{title:autoTitle(t)});} renderTicketBoard(); }));
}
async function newTicketDialog() {
  const ticket=await createTicket({ title:'', customer:'', channel:'', note:'' });
  ticketUi.query='';
  q('#ticketSearch').value='';
  renderTicketBoard();
  setTimeout(() => q(`[data-ticket-id="${ticket.id}"] [data-field="customer"]`)?.focus(), 0);
}
function openDeleteConfirm(id, title) {
  ticketUi.deleteTicketId = id;
  q('#confirmMessage').textContent = `确定删除「${title}」及其全部进展记录吗？此操作无法撤销。`;
  q('#confirmOverlay').hidden = false;
  q('#cancelDelete').focus();
}
function closeDeleteConfirm() {
  q('#confirmOverlay').hidden = true;
  ticketUi.deleteTicketId = null;
}
async function confirmTicketDelete() {
  if (!ticketUi.deleteTicketId) return;
  const id = ticketUi.deleteTicketId;
  closeDeleteConfirm();
  await deleteTicket(id);
  renderTicketBoard();
}
async function dailySummary() {
  const {tickets,settings}=await getTicketData(); const today=new Date().toDateString();
  const created=tickets.filter(t=>new Date(t.createdAt).toDateString()===today).length;
  const updated=tickets.filter(t=>t.logs.some(l=>new Date(l.at).toDateString()===today)).length;
  const overdue=tickets.filter(t=>isOverdue(t,settings)).length;
  showToast(`今日汇总：新增 ${created}，有进展 ${updated}，超时 ${overdue}`);
}
async function setupTicketUi() {
  const saved = await chrome.storage.local.get({ ticketCollapsed: [] });
  ticketUi.collapsed = new Set(saved.ticketCollapsed || []);
  document.querySelectorAll('.workspace-tab').forEach((b)=>b.addEventListener('click',()=>showWorkspace(b.dataset.view)));
  q('#ticketSearch').addEventListener('input',(e)=>{ticketUi.query=e.target.value;renderTicketBoard();});
  q('#ticketStatusFilter').addEventListener('change',(e)=>{ticketUi.status=e.target.value;renderTicketBoard();});
  q('#ticketSort').addEventListener('change',(e)=>{ticketUi.sort=e.target.value;renderTicketBoard();});
  q('#expandTickets').addEventListener('click',async()=>{ticketUi.collapsed.clear();await chrome.storage.local.set({ticketCollapsed:[]});renderTicketBoard();});
  q('#collapseTickets').addEventListener('click',async()=>{const {tickets}=await getTicketData();ticketUi.collapsed=new Set(tickets.map(t=>t.id));await chrome.storage.local.set({ticketCollapsed:[...ticketUi.collapsed]});renderTicketBoard();});
  q('#newTicketButton').addEventListener('click',newTicketDialog);
  q('#cancelDelete').addEventListener('click',closeDeleteConfirm);
  q('#confirmDelete').addEventListener('click',confirmTicketDelete);
  q('#confirmOverlay').addEventListener('click',(event)=>{if(event.target.id==='confirmOverlay')closeDeleteConfirm();});
  document.addEventListener('keydown',(event)=>{if(event.key==='Escape'&&!q('#confirmOverlay').hidden)closeDeleteConfirm();});
  q('#exportTickets').addEventListener('click',exportTicketData);
  q('#importTickets').addEventListener('click',()=>q('#ticketImportFile').click());
  q('#ticketImportFile').addEventListener('change',async(e)=>{const file=e.target.files[0];if(!file)return;try{const r=await importTicketData(file);renderTicketBoard();showToast(`导入完成：新增 ${r.added}，更新 ${r.updated}`);}catch(err){showToast(`导入失败：${err.message}`);}e.target.value='';});
  q('#dailySummaryButton').addEventListener('click',dailySummary);
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&(changes[TICKET_KEY]||changes.ticketSettings))renderTicketBoard();});
  renderTicketBoard(); setInterval(renderTicketBoard,60000);
}
setupTicketUi();

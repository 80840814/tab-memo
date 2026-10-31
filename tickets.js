const TICKET_KEY = 'supportTickets';
const TICKET_DEFAULTS = { firstResponseMinutes: 60, followUpMinutes: 24 * 60 };
const TICKET_STATUSES = { new: '待响应', active: '处理中', waiting: '等待客户', resolved: '已解决', closed: '已关闭' };

async function getTicketData() {
  const data = await chrome.storage.local.get({ [TICKET_KEY]: [], ticketSettings: TICKET_DEFAULTS });
  return { tickets: Array.isArray(data[TICKET_KEY]) ? data[TICKET_KEY] : [], settings: { ...TICKET_DEFAULTS, ...data.ticketSettings } };
}
async function saveTickets(tickets) { await chrome.storage.local.set({ [TICKET_KEY]: tickets }); }
function autoTitle(ticket) {
  const channel = ticket.channel === '其他' ? (ticket.customChannel || '') : (ticket.channel || '');
  const parts = [channel, ticket.customer, ticket.note].map((x) => String(x || '').trim()).filter(Boolean);
  return parts.join(' · ') || '新工单';
}
function makeTicket(input = {}) {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), title: input.title ?? '未命名工单', customer: input.customer || '', channel: input.channel || '', customChannel: input.customChannel || '', priority: input.priority || 'normal', tags: Array.isArray(input.tags) ? input.tags : [], note: input.note || '', status: input.status || 'new', createdAt: now, updatedAt: now, firstRespondedAt: null, logs: [], ...input };
}
function fmtDuration(ms) {
  const min = Math.max(0, Math.floor(ms / 60000));
  if (min < 60) return `${min} 分钟`;
  const h = Math.floor(min / 60); const d = Math.floor(h / 24);
  return d ? `${d} 天 ${h % 24} 小时` : `${h} 小时 ${min % 60} 分钟`;
}
function ticketTimers(ticket) {
  const now = Date.now();
  const last = new Date(ticket.updatedAt).getTime();
  const statusStart = ticket.statusChangedAt || ticket.updatedAt;
  return { total: fmtDuration(now - new Date(ticket.createdAt).getTime()), current: fmtDuration(now - new Date(statusStart).getTime()), sinceUpdate: fmtDuration(now - last) };
}
function isOverdue(ticket, settings) {
  if (['resolved', 'closed'].includes(ticket.status)) return false;
  const limit = ticket.firstRespondedAt ? settings.followUpMinutes : settings.firstResponseMinutes;
  return (Date.now() - new Date(ticket.updatedAt).getTime()) > limit * 60000;
}
function ticketMatches(ticket, query) { return !query || `${ticket.title} ${ticket.customer} ${ticket.channel} ${ticket.customChannel||''} ${ticket.note||''} ${ticket.status} ${ticket.logs.map((x) => x.text).join(' ')}`.toLowerCase().includes(query.toLowerCase()); }

async function createTicket(input) { const data = await getTicketData(); const ticket = makeTicket(input); data.tickets.unshift(ticket); await saveTickets(data.tickets); return ticket; }
async function updateTicket(id, patch, logText = '') {
  const data = await getTicketData(); const ticket = data.tickets.find((x) => x.id === id); if (!ticket) return;
  const now = new Date().toISOString();
  if (patch.status && patch.status !== ticket.status) { patch.statusChangedAt = now; if (!ticket.firstRespondedAt && patch.status !== 'new') patch.firstRespondedAt = now; }
  Object.assign(ticket, patch, { updatedAt: now });
  if (logText?.trim()) ticket.logs.push({ id: crypto.randomUUID(), at: now, text: logText.trim(), type: 'progress' });
  await saveTickets(data.tickets); return ticket;
}
async function deleteTicket(id) { const data = await getTicketData(); await saveTickets(data.tickets.filter((x) => x.id !== id)); }
async function exportTicketData() { const data = await getTicketData(); const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), tickets: data.tickets }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `工单数据-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url); }
async function importTicketData(file) { const parsed = JSON.parse(await file.text()); if (!Array.isArray(parsed.tickets)) throw new Error('文件中没有工单数据'); const data = await getTicketData(); const byId = new Map(data.tickets.map((t) => [t.id, t])); let added = 0; let updated = 0; parsed.tickets.map((x) => makeTicket(x)).forEach((t) => { if (byId.has(t.id)) updated++; else added++; byId.set(t.id, t); }); await saveTickets([...byId.values()]); return { added, updated }; }

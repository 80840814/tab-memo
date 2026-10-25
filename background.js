const panelOptions = { enabled: true };

const DEFAULTS = {
  apiBaseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini'
};

const SYSTEM_PROMPT =
  '你是专业的翻译引擎。将用户提供的 JSON 字符串数组逐项翻译为简体中文。' +
  '严格保持数组长度与顺序；只返回一个 JSON 数组，不要任何解释或 Markdown 代码块。' +
  '专有名词、产品名、代码、URL、数字保持原样；已是中文或无需翻译的项原样返回。';

async function getSettings() {
  const saved = await chrome.storage.local.get(DEFAULTS);
  return { ...DEFAULTS, ...saved };
}

function parseResult(raw, expectedLength) {
  let text = String(raw || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
    .replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  const candidate = start >= 0 && end > start ? text.slice(start, end + 1) : text;
  let arr;
  try { arr = JSON.parse(candidate); } catch (e) {
    if (expectedLength === 1) return [text];
    throw new Error('模型返回内容无法解析为 JSON 数组');
  }
  if (!Array.isArray(arr) || arr.length !== expectedLength) {
    if (expectedLength === 1 && typeof arr === 'string') return [arr];
    throw new Error('模型返回的条数与请求不一致');
  }
  return arr.map((x) => String(x ?? ''));
}

async function translateTexts(texts) {
  const s = await getSettings();
  if (!s.apiKey) throw new Error('未配置 API Key，请先打开翻译设置');
  if (!s.model) throw new Error('未配置模型 ID，请先打开翻译设置');
  const url = s.apiBaseUrl.replace(/\/+$/, '') + '/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.apiKey },
    body: JSON.stringify({ model: s.model, messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(texts) }
    ] })
  });
  if (!res.ok) throw new Error(`API 请求失败 (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return parseResult(data?.choices?.[0]?.message?.content ?? '', texts.length);
}

function stateKey(tabId) { return 'page:' + tabId; }
async function setPageState(tabId, enabled) {
  if (!tabId && tabId !== 0) return;
  try {
    if (enabled) await chrome.storage.session.set({ [stateKey(tabId)]: true });
    else await chrome.storage.session.remove(stateKey(tabId));
  } catch (e) {}
}
async function getPageState(tabId) {
  if (!tabId && tabId !== 0) return false;
  try {
    const data = await chrome.storage.session.get({ [stateKey(tabId)]: false });
    return data[stateKey(tabId)] === true;
  } catch (e) { return false; }
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  await chrome.sidePanel.setOptions({ path: 'sidepanel.html', ...panelOptions });
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: 'translate-selection',
    title: '翻译选中文本',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'translate-page',
    title: '翻译当前网页',
    contexts: ['page', 'frame']
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.contextMenus.create({ id: 'translate-selection', title: '翻译选中文本', contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'translate-page', title: '翻译当前网页', contexts: ['page', 'frame'] });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  try {
    if (info.menuItemId === 'translate-selection' && info.selectionText) {
      await sendToTab(tab.id, { type: 'translate-selection', text: info.selectionText });
    } else if (info.menuItemId === 'translate-page') {
      await sendToTab(tab.id, { type: 'toggle-page' });
    }
  } catch (error) {
    console.warn('右键翻译无法在此页面运行', error);
  }
});
chrome.tabs.onRemoved.addListener((tabId) => {
  setPageState(tabId, false);
  chrome.storage.local.get('tabNotes').then(({ tabNotes = {} }) => {
    if (tabNotes[String(tabId)] === undefined) return;
    delete tabNotes[String(tabId)];
    return chrome.storage.local.set({ tabNotes });
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'translate') {
    const texts = Array.isArray(msg.texts) ? msg.texts : [msg.texts];
    translateTexts(texts).then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
    return true;
  }
  if (msg?.type === 'get-page-state') {
    getPageState(sender.tab?.id).then((enabled) => sendResponse({ enabled }));
    return true;
  }
  if (msg?.type === 'page-state') {
    setPageState(sender.tab?.id, !!msg.enabled).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === 'open-options') {
    chrome.runtime.openOptionsPage();
    return false;
  }
  if (msg?.type === 'toggle-tab') {
    sendToTab(msg.tabId, { type: 'toggle-page' })
      .then((result) => sendResponse(result || { enabled: false }))
      .catch(() => sendResponse({ enabled: false, error: '此页面不支持注入翻译' }));
    return true;
  }
  return false;
});

async function sendToTab(tabId, message) {
  try { return await chrome.tabs.sendMessage(tabId, message); } catch (e) {
    await chrome.scripting.insertCSS({ target: { tabId, allFrames: true }, files: ['content.css'] });
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] });
    return chrome.tabs.sendMessage(tabId, message);
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  try { await sendToTab(tab.id, { type: 'toggle-page' }); }
  catch (e) { console.warn('无法在此页面启用翻译', e); }
});

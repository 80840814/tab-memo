const PRESETS = {
  openai: { apiBaseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  deepseek: { apiBaseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  dashscope: { apiBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  ollama: { apiBaseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b' }
};

const $ = (id) => document.getElementById(id);
const COLOR_RE = /^#[0-9a-f]{6}$/i;
let defaultCleared = true; // 未设置自定义默认颜色时，译文沿用正文颜色

function setStatus(text, isError = false) {
  const el = $('status');
  el.textContent = text;
  el.className = isError ? 'err' : '';
  if (text) setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 3000);
}

function readForm() {
  return {
    apiBaseUrl: $('apiBaseUrl').value.trim(),
    model: $('model').value.trim(),
    apiKey: $('apiKey').value.trim(),
    defaultColor: defaultCleared ? '' : $('defaultColor').value,
    autoColor: $('autoColor').checked,
    siteColors: readRules()
  };
}

function makeRow(domain = '', color = '#4a4a4a') {
  const row = document.createElement('div');
  row.className = 'color-row';

  const d = document.createElement('input');
  d.type = 'text';
  d.className = 'rule-domain';
  d.placeholder = '例：github.com';
  d.value = domain;

  const c = document.createElement('input');
  c.type = 'color';
  c.className = 'rule-color';
  c.value = COLOR_RE.test(color) ? color : '#4a4a4a';

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'small';
  del.textContent = '删除';
  del.addEventListener('click', () => row.remove());

  row.append(d, c, del);
  return row;
}

function readRules() {
  const map = {};
  document.querySelectorAll('#siteRules .color-row').forEach((row) => {
    const domain = row.querySelector('.rule-domain').value.trim().toLowerCase();
    const color = row.querySelector('.rule-color').value;
    if (domain && COLOR_RE.test(color)) map[domain] = color;
  });
  return map;
}

function renderRules(siteColors) {
  const host = $('siteRules');
  host.innerHTML = '';
  Object.entries(siteColors || {}).forEach(([domain, color]) => {
    host.appendChild(makeRow(domain, color));
  });
}

async function load() {
  const data = await chrome.storage.local.get({
    apiBaseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKey: '',
    defaultColor: '',
    autoColor: true,
    siteColors: {}
  });
  $('apiBaseUrl').value = data.apiBaseUrl;
  $('model').value = data.model;
  $('apiKey').value = data.apiKey;

  defaultCleared = !COLOR_RE.test(data.defaultColor || '');
  if (!defaultCleared) $('defaultColor').value = data.defaultColor;
  renderRules(data.siteColors);
}

$('defaultColor').addEventListener('input', () => { defaultCleared = false; });

$('clearDefault').addEventListener('click', () => {
  defaultCleared = true;
  $('defaultColor').value = '#4a4a4a';
  setStatus('已恢复默认，记得点击保存');
});

$('addSite').addEventListener('click', () => {
  const row = makeRow();
  $('siteRules').appendChild(row);
  row.querySelector('.rule-domain').focus();
});

$('save').addEventListener('click', async () => {
  const cfg = readForm();
  if (!cfg.apiBaseUrl || !cfg.model) {
    setStatus('API 地址和模型 ID 不能为空', true);
    return;
  }
  await chrome.storage.local.set(cfg);
  setStatus('已保存');
});

$('test').addEventListener('click', async () => {
  const cfg = readForm();
  const box = $('testResult');
  box.style.display = 'block';
  box.textContent = '测试中…';
  await chrome.storage.local.set(cfg);
  chrome.runtime.sendMessage({ type: 'translate', texts: ['Hello, world! This is a translation test.'] }, (res) => {
    void chrome.runtime.lastError;
    if (res && res.ok) {
      box.textContent = '连接成功，示例译文：\n' + res.result[0];
    } else {
      box.textContent = '连接失败：' + ((res && res.error) || '未知错误');
    }
  });
});

document.querySelectorAll('[data-preset]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const p = PRESETS[btn.dataset.preset];
    $('apiBaseUrl').value = p.apiBaseUrl;
    $('model').value = p.model;
  });
});

load();

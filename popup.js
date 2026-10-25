const status = document.querySelector('#status');
const toggle = document.querySelector('#toggle');
function setUi(enabled, error = '') {
  status.textContent = error || (enabled ? '当前页面正在翻译' : '当前页面尚未翻译');
  toggle.textContent = enabled ? '关闭整页翻译' : '翻译当前网页';
  toggle.classList.toggle('is-on', enabled);
}
async function getTab() { return (await chrome.tabs.query({ active: true, currentWindow: true }))[0]; }
async function refresh() {
  const tab = await getTab();
  if (!tab?.id) return setUi(false, '找不到当前页面');
  try {
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'status' });
    setUi(!!result?.enabled);
  } catch (e) { setUi(false, '此页面暂不支持翻译'); }
}
toggle.addEventListener('click', async () => {
  const tab = await getTab();
  if (!tab?.id) return;
  try {
    const result = await chrome.runtime.sendMessage({ type: 'toggle-tab', tabId: tab.id });
    if (result?.error) setUi(false, result.error); else setUi(!!result?.enabled);
  } catch (e) { setUi(false, '无法在此页面开启翻译'); }
});
document.querySelector('#settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
refresh();

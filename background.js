const panelOptions = { enabled: true };

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  await chrome.sidePanel.setOptions({ path: 'sidepanel.html', ...panelOptions });
});

chrome.runtime.onStartup.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.get('tabNotes').then(({ tabNotes = {} }) => {
    if (tabNotes[String(tabId)] === undefined) return;
    delete tabNotes[String(tabId)];
    return chrome.storage.local.set({ tabNotes });
  });
});

function getTabStateKey(tabId) {
  return `tab:${tabId}`;
}

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (command === "start-loop") {
    const result = await chrome.storage.session.get(
      getTabStateKey(tab.id)
    );

    const state = result[getTabStateKey(tab.id)];
    if (!state) return;

    chrome.tabs.sendMessage(tab.id, {
      action: "startLoop",
      config: state
    });
  }

  if (command === "stop-loop") {
    chrome.tabs.sendMessage(tab.id, { action: "stopLoop" });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) return;

  if (command === "start-loop") {
    chrome.tabs.sendMessage(tab.id, { action: "startLoop" });
  }

  if (command === "stop-loop") {
    chrome.tabs.sendMessage(tab.id, { action: "stopLoop" });
  }
});

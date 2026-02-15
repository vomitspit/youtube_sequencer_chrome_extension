// =========================
// BASIC HELPERS
// =========================

let popupTabId = null;

document.addEventListener("DOMContentLoaded", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  popupTabId = tab?.id || null;
});

// Extract YouTube video ID (presets only)
function getVideoId(url) {
  const match = url.match(/[?&]v=([^&#]*)/);
  return match ? match[1] : null;
}

// Minutes + seconds → total seconds (preserving decimals)
function getTotalSeconds(minInput, secInput) {
  return (Number(minInput.value) || 0) * 60 + (Number(secInput.value) || 0);
}

// =========================
// TAB SESSION STATE
// =========================

function getTabStateKey(tabId) {
  return `tab:${tabId}`;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function loadTabState(tabId) {
  const result = await chrome.storage.session.get(getTabStateKey(tabId));
  return result[getTabStateKey(tabId)] || null;
}

async function saveTabState(tabId, state) {
  await chrome.storage.session.set({
    [getTabStateKey(tabId)]: state
  });
}

// =========================
// SINGLE SOURCE OF UI STATE
// =========================

function readCurrentState() {
  return {
    start: getTotalSeconds(
      document.getElementById("startMin"),
      document.getElementById("startSec")
    ),
    playDuration: Number(document.getElementById("playDuration").value) || 2,
    bpm: Number(document.getElementById("bpm").value) || 120,
    bars: Number(document.getElementById("restartAfter").value) || 2,
    randomize: document.getElementById("randomize").checked
  };
}

function applyState(state) {
  if (!state) return;

  document.getElementById("startMin").value = Math.floor(state.start / 60);
  document.getElementById("startSec").value = state.start % 60;
  document.getElementById("playDuration").value = state.playDuration;
  document.getElementById("bpm").value = state.bpm;
  document.getElementById("restartAfter").value = state.bars;
  document.getElementById("randomize").checked = state.randomize || false;
}

async function persistUiState() {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  await saveTabState(tab.id, readCurrentState());
}

// =========================
// PRESET STORAGE (PERSISTENT)
// =========================

async function getCurrentTabVideoId() {
  const tab = await getActiveTab();
  return tab ? getVideoId(tab.url) : null;
}

async function loadVideoRecord(videoId) {
  const result = await chrome.storage.local.get(videoId);
  return result[videoId] || { presets: [] };
}

async function saveVideoRecord(videoId, record) {
  await chrome.storage.local.set({ [videoId]: record });
}

async function refreshPresetList() {
  const videoId = await getCurrentTabVideoId();
  if (!videoId) return;

  const record = await loadVideoRecord(videoId);
  const select = document.getElementById("presetList");
  select.innerHTML = "";

  if (!record.presets.length) {
    const opt = document.createElement("option");
    opt.textContent = "No presets saved";
    opt.disabled = true;
    select.appendChild(opt);
    return;
  }

  record.presets.forEach((p, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = p.name;
    select.appendChild(opt);
  });
}

// =========================
// INITIALIZATION
// =========================

document.addEventListener("DOMContentLoaded", async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  const tabState = await loadTabState(tab.id);
  if (tabState) {
    applyState(tabState);
  }

  await refreshPresetList();

  // Persist UI changes automatically
  ["startMin", "startSec", "playDuration", "bpm", "restartAfter", "randomize"]
    .forEach(id => {
      const element = document.getElementById(id);
      if (element.type === 'checkbox') {
        element.addEventListener("change", persistUiState);
      } else {
        element.addEventListener("change", persistUiState);
      }
    });
});

// =========================
// CURRENT TIME BUTTON
// =========================

document.getElementById("useCurrentTime").addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    func: () => {
      const video =
        document.querySelector("video.html5-main-video") ||
        document.querySelector("video");
      return video ? video.currentTime : null;
    }
  });

  const match = results.find(r => typeof r.result === "number");
  if (!match) return;

  const t = match.result;
  document.getElementById("startMin").value = Math.floor(t / 60);
  // Round to 2 decimal places
  const seconds = t % 60;
  document.getElementById("startSec").value = Math.round(seconds * 100) / 100;

  persistUiState();
});

// =========================
// START / STOP LOOP
// =========================

document.getElementById("startLoop").addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab) return;

  const state = readCurrentState();
  await saveTabState(tab.id, state);

  chrome.tabs.sendMessage(tab.id, {
    action: "startLoop",
    config: state
  });
});

document.getElementById("stopLoop").addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab) return;

  chrome.tabs.sendMessage(tab.id, { action: "stopLoop" });
});

// =========================
// FLASHES and bar count
// =========================

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action !== "barTick" || msg.tabId !== popupTabId) return;

  // Update bar counter
  const counter = document.getElementById("barCounter");
  if (counter) {
    counter.textContent = `Bar ${msg.bar} / ${msg.bars}`;
  }

  // Flash once per bar
  const body = document.body;
  body.classList.remove("bar-flash");
  void body.offsetWidth;
  body.classList.add("bar-flash");
});


// =========================
// PRESETS: SAVE / LOAD / DELETE
// =========================

document.getElementById("savePreset").addEventListener("click", async () => {
  const name = document.getElementById("presetName").value.trim();
  if (!name) return;

  const videoId = await getCurrentTabVideoId();
  if (!videoId) return;

  const record = await loadVideoRecord(videoId);
  record.presets.push({ name, ...readCurrentState() });

  await saveVideoRecord(videoId, record);
  await refreshPresetList();
});

document.getElementById("loadPreset").addEventListener("click", async () => {
  const videoId = await getCurrentTabVideoId();
  if (!videoId) return;

  const select = document.getElementById("presetList");
  const record = await loadVideoRecord(videoId);
  const preset = record.presets[select.value];
  if (!preset) return;

  applyState(preset);
  persistUiState();
});

document.getElementById("deletePreset").addEventListener("click", async () => {
  const videoId = await getCurrentTabVideoId();
  if (!videoId) return;

  const select = document.getElementById("presetList");
  const record = await loadVideoRecord(videoId);

  record.presets.splice(select.value, 1);
  await saveVideoRecord(videoId, record);
  await refreshPresetList();
});

// =========================
// SAVE / LOAD POPOUT UI
// =========================

document.getElementById("togglePresets").addEventListener("click", () => {
  const panel = document.getElementById("presetPanel");
  const arrow = document.getElementById("presetArrow");
  const isOpen = panel.style.display !== "none";

  panel.style.display = isOpen ? "none" : "block";
  arrow.classList.toggle("open", !isOpen);
});

// =========================
// HOTKEYS (POPUP OPEN) - Ctrl+Shift combo to avoid text input interference
// =========================

document.addEventListener("keydown", (e) => {
  const bpmInput = document.getElementById("bpm");
  const barsInput = document.getElementById("restartAfter");
  const sustainInput = document.getElementById("playDuration");

  let changed = false;

  // Ctrl+Shift+S for Start
  if (e.ctrlKey && e.shiftKey && e.code === "KeyS") {
    e.preventDefault();
    document.getElementById("startLoop").click();
    return;
  }

  // Ctrl+Shift+X for Stop
  if (e.ctrlKey && e.shiftKey && e.code === "KeyX") {
    e.preventDefault();
    document.getElementById("stopLoop").click();
    return;
  }

  // Don't interfere with text inputs
  if (document.activeElement.tagName === 'INPUT' && document.activeElement.type === 'text') {
    return;
  }

  if (e.key === "ArrowUp") {
    e.preventDefault();
    bpmInput.value = Number(bpmInput.value) + 1;
    changed = true;
  }

  if (e.key === "ArrowDown") {
    e.preventDefault();
    bpmInput.value = Math.max(1, Number(bpmInput.value) - 1);
    changed = true;
  }

  if (e.key === "ArrowLeft") {
    e.preventDefault();
    barsInput.value = Math.max(1, Math.floor(Number(barsInput.value) / 2));
    changed = true;
  }

  if (e.key === "ArrowRight") {
    e.preventDefault();
    barsInput.value = Math.max(1, Number(barsInput.value) * 2);
    changed = true;
  }

  if (e.key === "+" || e.key === "=") {
    e.preventDefault();
    sustainInput.value = Number(sustainInput.value) + 1;
    changed = true;
  }

  if (e.key === "-") {
    e.preventDefault();
    sustainInput.value = Math.max(1, Number(sustainInput.value) - 1);
    changed = true;
  }

  if (changed) {
    persistUiState();
  }
});

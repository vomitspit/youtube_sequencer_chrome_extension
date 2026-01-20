// =========================
// BASIC HELPERS (your version kept intact)
// =========================

// Helper: extract YouTube video ID
function getVideoId(url) {
  const match = url.match(/[?&]v=([^&#]*)/);
  return match ? match[1] : null;
}

// Helper: minutes + seconds → total seconds
function getTotalSeconds(minInput, secInput) {
  const minutes = Number(minInput.value) || 0;
  const seconds = Number(secInput.value) || 0;
  return minutes * 60 + seconds;
}

// =========================
// SINGLE SOURCE OF TRUTH FOR STATE
// =========================

// Read ALL values from the UI in one place
function readCurrentState() {
  return {
    start: getTotalSeconds(
      document.getElementById("startMin"),
      document.getElementById("startSec")
    ),
    playDuration: Number(document.getElementById("playDuration").value) || 2,
    bpm: Number(document.getElementById("bpm").value) || 120,
    bars: Number(document.getElementById("restartAfter").value) || 2
  };
}

// Apply ANY saved state back to the UI in one place
function applyState(state) {
  document.getElementById("startMin").value =
    Math.floor(state.start / 60);

  document.getElementById("startSec").value =
    Math.floor(state.start % 60);

  document.getElementById("playDuration").value = state.playDuration;
  document.getElementById("bpm").value = state.bpm;
  document.getElementById("restartAfter").value = state.bars;
}

// =========================
// PRESET UTILITIES
// =========================

async function getCurrentTabVideoId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return getVideoId(tabs[0].url);
}

async function loadVideoRecord(videoId) {
  const result = await chrome.storage.local.get(videoId);
  return (
    result[videoId] || {
      lastState: null,
      presets: []
    }
  );
}

async function saveVideoRecord(videoId, record) {
  await chrome.storage.local.set({ [videoId]: record });
}

// Populate dropdown list
async function refreshPresetList() {
  const videoId = await getCurrentTabVideoId();
  if (!videoId) return;

  const record = await loadVideoRecord(videoId);
  const select = document.getElementById("presetList");

  select.innerHTML = "";

  if (!record.presets || record.presets.length === 0) {
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
// INITIALIZATION (POPUP OPEN)
// =========================

document.addEventListener("DOMContentLoaded", async () => {
  const videoId = await getCurrentTabVideoId();
  if (!videoId) return;

  const record = await loadVideoRecord(videoId);

  // Restore last-used state if it exists
  if (record.lastState) {
    applyState(record.lastState);
  }

  // Load preset list in parallel
  await refreshPresetList();
});

// =========================
// CURRENT TIME BUTTON
// =========================

document.getElementById("useCurrentTime").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tabId = tabs[0].id;

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: () => {
          const video =
            document.querySelector("video.html5-main-video") ||
            document.querySelector("video");
          return video ? video.currentTime : null;
        }
      });

      const match = results.find(r => typeof r.result === "number");

      if (!match) {
        alert("Could not locate YouTube player in any frame.");
        return;
      }

      const t = match.result;
      document.getElementById("startMin").value = Math.floor(t / 60);
      document.getElementById("startSec").value = Math.floor(t % 60);

    } catch (err) {
      alert("Permission error reading video time.");
      console.error(err);
    }
  });
});

// =========================
// START LOOP
// =========================

document.getElementById("startLoop").addEventListener("click", async () => {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  const videoId = getVideoId(tabs[0].url);
  if (!videoId) {
    alert("Not a valid YouTube video.");
    return;
  }

  const state = readCurrentState();

  // Load record, update only lastState (presets untouched)
  const record = await loadVideoRecord(videoId);
  record.lastState = state;
  await saveVideoRecord(videoId, record);

  document.body.classList.add("loop-active");

  chrome.tabs.sendMessage(tabs[0].id, {
    action: "startLoop",
    config: state
  });
});

// =========================
// STOP LOOP
// =========================

document.getElementById("stopLoop").addEventListener("click", async () => {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  document.body.classList.remove("loop-active");

  chrome.tabs.sendMessage(tabs[0].id, {
    action: "stopLoop"
  });
});

// =========================
// PRESETS: SAVE / LOAD / DELETE
// =========================

document.getElementById("savePreset").addEventListener("click", async () => {
  const name = document.getElementById("presetName").value.trim();
  if (!name) {
    alert("Enter a preset name first.");
    return;
  }

  const videoId = await getCurrentTabVideoId();
  const state = readCurrentState();

  const record = await loadVideoRecord(videoId);
  
  if (!Array.isArray(record.presets)) {
    record.presets = [];
  }

  record.presets.push({
    name,
    ...state
  });

  await saveVideoRecord(videoId, record);
  await refreshPresetList();
});

document.getElementById("loadPreset").addEventListener("click", async () => {
  const videoId = await getCurrentTabVideoId();
  const select = document.getElementById("presetList");

  const idx = select.value;
  if (idx === "" || idx === undefined) return;

  const record = await loadVideoRecord(videoId);
  const preset = record.presets[idx];

  applyState(preset);
});

document.getElementById("deletePreset").addEventListener("click", async () => {
  const videoId = await getCurrentTabVideoId();
  const select = document.getElementById("presetList");

  const idx = select.value;
  if (idx === "" || idx === undefined) return;

  const record = await loadVideoRecord(videoId);
  record.presets.splice(idx, 1);

  await saveVideoRecord(videoId, record);
  await refreshPresetList();
});

// =========================
// HOTKEYS (popup open)
// =========================

document.addEventListener("keydown", (e) => {
  const bpmInput = document.getElementById("bpm");
  const barsInput = document.getElementById("restartAfter");
  const sustainInput = document.getElementById("playDuration");

  if (e.code === "S") {
    e.preventDefault();
    document.getElementById("startLoop").click();
  }

  if (e.code === "X") {
    e.preventDefault();
    document.getElementById("stopLoop").click();
  }

  if (e.key === "ArrowUp") {
    e.preventDefault();
    bpmInput.value = Math.max(
      Number(bpmInput.min) || 1,
      Number(bpmInput.value) + 1
    );
  }

  if (e.key === "ArrowDown") {
    e.preventDefault();
    bpmInput.value = Math.max(
      Number(bpmInput.min) || 1,
      Number(bpmInput.value) - 1
    );
  }

  if (e.key === "ArrowLeft") {
    e.preventDefault();
    barsInput.value = Math.max(1, Math.floor(Number(barsInput.value) / 2));
  }

  if (e.key === "ArrowRight") {
    e.preventDefault();
    barsInput.value = Math.max(1, Number(barsInput.value) * 2);
  }

  if (e.key === "+" || e.key === "=") {
    e.preventDefault();
    sustainInput.value = Math.max(
      Number(sustainInput.min) || 1,
      Number(sustainInput.value) + 1
    );
  }

  if (e.key === "-") {
    e.preventDefault();
    sustainInput.value = Math.max(
      Number(sustainInput.min) || 1,
      Number(sustainInput.value) - 1
    );
  }
});

// SAVE LOAD POPOUT
document.getElementById("togglePresets").addEventListener("click", () => {
  const panel = document.getElementById("presetPanel");
  const arrow = document.getElementById("presetArrow");
  const isOpen = panel.style.display !== "none";

  panel.style.display = isOpen ? "none" : "block";
  arrow.classList.toggle("open", !isOpen);
});


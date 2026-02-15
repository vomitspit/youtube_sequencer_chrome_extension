let loopRunning = false;
let audioCtx = null;
let loopStartTime = 0;
let anchorTime = 0;
let lastBarIndex = -1;
let videoDuration = 0;
let loopConfig = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startLoop") {
    const { start, playDuration, bpm, bars, randomize } = message.config;
    startBpmLoop(start, playDuration, bpm, bars, randomize);
  } else if (message.action === "stopLoop") {
    stopBpmLoop();
  }
});

function startBpmLoop(loopStart, playDuration, bpm, bars, randomize) {
  const video = document.querySelector('video');
  if (!video) return;

  stopBpmLoop(); // clear any existing loop

  // Store config for randomization
  loopConfig = {
    loopStart,
    playDuration,
    bpm,
    bars,
    randomize
  };

  // Get video duration for randomization bounds
  videoDuration = video.duration;

  // Disable autoplay to prevent YouTube from auto-advancing
  const autoplayButton = document.querySelector('.ytp-button[data-tooltip-target-id="ytp-autonav-toggle-button"]');
  if (autoplayButton && autoplayButton.getAttribute('aria-checked') === 'true') {
    autoplayButton.click();
  }

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  loopStartTime = audioCtx.currentTime;
  anchorTime = performance.now();
  loopRunning = true;

  const beatsPerBar = 4;
  const secondsPerBeat = 60 / bpm;
  const loopDuration = bars * beatsPerBar * secondsPerBeat;

  const actualPlayDuration = playDuration;
  const gridLocked = playDuration >= loopDuration;

  // Track the current random start time (only changes at loop boundary)
  let currentStartTime = randomize ? getRandomStartTime() : loopStart;

  function tick() {
    if (!loopRunning) return;

    const elapsedMs = performance.now() - anchorTime;
    const elapsed = elapsedMs / 1000;
    const position = elapsed % loopDuration;
    const barLength = loopDuration / bars;
    const barIndex = Math.floor(position / barLength);

    if (barIndex !== lastBarIndex) {
      lastBarIndex = barIndex;

      chrome.runtime.sendMessage({
        action: "barTick",
        bar: barIndex + 1, // 1-based for UI
        bars
      });
    }

    if (gridLocked) {
      const tolerance = 0.05;
      if (position < tolerance) {
        // Pick new random start time only at loop boundary
        if (loopConfig.randomize) {
          currentStartTime = getRandomStartTime();
        }
        video.currentTime = currentStartTime;
        video.play();
      }
    } else {
      if (position < actualPlayDuration) {
        if (video.paused) {
          // Pick new random start time only when starting a new loop
          if (loopConfig.randomize) {
            currentStartTime = getRandomStartTime();
          }
          video.currentTime = currentStartTime;
          video.play();
        }
      } else {
        if (!video.paused) {
          video.pause();
        }
        video.currentTime = currentStartTime;
      }
    }

    setTimeout(tick, 30);
  }

  tick();
}

function getRandomStartTime() {
  if (!videoDuration || videoDuration <= loopConfig.playDuration) {
    return loopConfig.loopStart;
  }
  
  // Calculate safe upper bound (leave sustain duration at the end to avoid autoplay trigger)
  const beatsPerBar = 4;
  const secondsPerBeat = 60 / loopConfig.bpm;
  const loopDuration = loopConfig.bars * beatsPerBar * secondsPerBeat;
  
  // Use the actual play duration (sustain) as the safety buffer
  const actualPlayDuration = Math.min(loopConfig.playDuration, loopDuration);
  const safeEndTime = Math.max(0, videoDuration - actualPlayDuration);
  
  // Random time between 0 and safe end time
  const randomTime = Math.random() * safeEndTime;
  
  return randomTime;
}

function stopBpmLoop() {
  loopRunning = false;
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }
  const video = document.querySelector('video');
  if (video) video.pause();
  
  loopConfig = null;
}

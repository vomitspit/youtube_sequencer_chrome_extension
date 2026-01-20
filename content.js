let loopRunning = false;
let audioCtx = null;
let loopStartTime = 0;
let anchorTime = 0;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startLoop") {
    const { start, playDuration, bpm, bars } = message.config;
    startBpmLoop(start, playDuration, bpm, bars);
  } else if (message.action === "stopLoop") {
    stopBpmLoop();

  }
});

function startBpmLoop(loopStart, playDuration, bpm, bars) {
  const video = document.querySelector('video');
  if (!video) return;

  stopBpmLoop(); // clear any existing loop


  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  loopStartTime = audioCtx.currentTime;
  anchorTime = performance.now();
  loopRunning = true;

  const beatsPerBar = 4;
  const secondsPerBeat = 60 / bpm;
  const loopDuration = bars * beatsPerBar * secondsPerBeat;

  const actualPlayDuration = playDuration;
  const gridLocked = playDuration >= loopDuration;

  function tick() {
    if (!loopRunning) return;

    const elapsedMs = performance.now() - anchorTime;
    const elapsed = elapsedMs / 1000;
    const position = elapsed % loopDuration;

    if (gridLocked) {
      const tolerance = 0.05;
      if (position < tolerance) {
        video.currentTime = loopStart;
        video.play();
      }
    } else {
      if (position < actualPlayDuration) {
        if (video.paused) {
          video.currentTime = loopStart;
          video.play();
        }
      } else {
        if (!video.paused) {
          video.pause();
        }
        video.currentTime = loopStart;
      }
    }

    setTimeout(tick, 30);
  }

  tick();
}

function stopBpmLoop() {
  loopRunning = false;
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }
  const video = document.querySelector('video');
  if (video) video.pause();
}

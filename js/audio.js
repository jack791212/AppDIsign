"use strict";
// 音效：Web Audio 即時合成，無需音檔
(function () {
  const G = window.G;
  let actx = null, master = null, muted = false;
  function ensure() {
    if (actx) return;
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); master = actx.createGain(); master.gain.value = 0.3; master.connect(actx.destination); } catch (e) {}
  }
  G.audioResume = function () { ensure(); if (actx && actx.state === "suspended") actx.resume(); };
  G.toggleMute = function () { muted = !muted; return muted; };
  G.isMuted = function () { return muted; };

  function tone(freq, dur, type, vol, slideTo) {
    if (!actx || muted) return;
    const t = actx.currentTime;
    const g = actx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const osc = actx.createOscillator(); osc.type = type || "square"; osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    osc.connect(g); g.connect(master); osc.start(t); osc.stop(t + dur);
  }
  function noise(dur, vol, lp) {
    if (!actx || muted) return;
    const t = actx.currentTime, n = Math.floor(actx.sampleRate * dur);
    const buf = actx.createBuffer(1, n, actx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = actx.createBufferSource(); src.buffer = buf;
    const f = actx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = lp || 1200;
    const g = actx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + dur);
  }

  const last = {};
  function thr(name, ms) { const t = performance.now(); if (last[name] && t - last[name] < ms) return false; last[name] = t; return true; }

  const S = {
    shoot() { if (!thr("shoot", 70)) return; tone(560, 0.05, "square", 0.05, 430); },
    melee() { if (!thr("shoot", 90)) return; noise(0.08, 0.08, 2000); },
    hit() { if (!thr("hit", 45)) return; tone(300, 0.05, "triangle", 0.06, 190); },
    crit() { tone(720, 0.09, "square", 0.11, 300); },
    hurt() { tone(170, 0.18, "sawtooth", 0.16, 80); noise(0.12, 0.1, 800); },
    death() { if (!thr("death", 50)) return; noise(0.14, 0.12, 900); tone(200, 0.12, "square", 0.08, 90); },
    boom() { noise(0.25, 0.18, 700); tone(110, 0.3, "sawtooth", 0.14, 45); },
    level() { tone(520, 0.12, "square", 0.12); setTimeout(() => tone(784, 0.16, "square", 0.12), 100); },
    pickup() { tone(880, 0.06, "triangle", 0.09, 1180); },
    dash() { tone(440, 0.12, "sawtooth", 0.1, 920); },
    ult() { tone(130, 0.35, "sawtooth", 0.2, 50); noise(0.3, 0.16, 1400); },
    bossWarn() { tone(150, 0.22, "square", 0.16, 200); },
    ui() { tone(620, 0.04, "square", 0.07); },
  };
  G.sfx = function (name) { ensure(); const f = S[name]; if (f) f(); };
})();

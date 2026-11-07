/* Beeps, the voice, and keeping the screen on during a workout. iPhones do not let web apps vibrate. */
(function (root) {
  "use strict";
  let ctx = null, lock = null, wantLock = false, settings = { voice: true, beeps: true };

  function setSettings(s) { settings = s; }

  // Must run from a tap: iPhones keep sound blocked until then.
  function unlock() {
    try {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (AC && !ctx) ctx = new AC();
      if (ctx && ctx.state === "suspended") ctx.resume();
      if (root.speechSynthesis) {
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        root.speechSynthesis.speak(u);
      }
    } catch (e) { console.warn("Sound could not start", e); }
  }

  function tone(freq, ms, when, gainValue) {
    if (!ctx || !settings.beeps) return;
    try {
      if (ctx.state === "suspended") ctx.resume();
      const t = ctx.currentTime + (when || 0);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gainValue || 0.5, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + ms / 1000 + 0.03);
    } catch (e) { /* sound is a nicety; the timer carries on */ }
  }
  function tick() { tone(880, 130); }
  function go() { tone(1320, 320); }
  function done() { tone(990, 160); tone(1320, 320, 0.17); }

  function say(text) {
    if (!settings.voice || !root.speechSynthesis || !text) return;
    try {
      root.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.03;
      u.lang = "en-US";
      root.speechSynthesis.speak(u);
    } catch (e) { /* carry on without the voice */ }
  }
  function hush() { try { if (root.speechSynthesis) root.speechSynthesis.cancel(); } catch (e) { /* nothing to stop */ } }

  async function requestLock() {
    if (!navigator.wakeLock || lock) return !!lock;
    try {
      lock = await navigator.wakeLock.request("screen");
      lock.addEventListener("release", function () { lock = null; });
      return true;
    } catch (e) { return false; }
  }
  async function keepAwake() { wantLock = true; return requestLock(); }
  function letSleep() {
    wantLock = false;
    if (lock) { try { lock.release(); } catch (e) { /* already released */ } lock = null; }
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && wantLock) requestLock();
  });

  root.Cues = { setSettings: setSettings, unlock: unlock, tick: tick, go: go, done: done, say: say, hush: hush, keepAwake: keepAwake, letSleep: letSleep };
})(window);

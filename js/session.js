/* A workout in progress: an ordered list of steps with wall-clock timers, so it survives the phone sleeping.
   A session is a plain object kept in the saved state. Nothing here touches the screen. */
(function (root) {
  "use strict";
  const E = root.Engine;
  const AUTO_PAUSE_GAP = 60000;
  const COUNT_IN_FIRST = 10, COUNT_IN_NEXT = 5, SWITCH = 5;

  function create(workout, opts) {
    opts = opts || {};
    const now = opts.now || Date.now();
    const state = opts.state;
    const items = workout.items.map(function (it) { return Object.assign({}, it, { logs: [] }); });
    const steps = [];
    workout.warmup.forEach(function (g) {
      const first = g.key === "@first" ? items[0] : null;
      steps.push({ t: "guide", phase: "warmup", key: first ? first.key : g.key, label: first ? first.name : g.label, unit: g.unit, amount: g.amount, note: g.note || "", est: g.unit === "free" ? 40 : E.guideSeconds(g) });
    });
    workout.tests.forEach(function (group) {
      E.TESTS[group].forEach(function (test, i, list) {
        steps.push({ t: "test", group: group, test: test, last: i === list.length - 1, est: 90 });
        steps.push({ t: "rest", min: 60, max: 90, kind: "test", est: 0 });
      });
    });
    items.forEach(function (it, i) {
      for (let n = 1; n <= it.sets; n++) {
        steps.push({ t: "set", item: i, set: n, est: E.setSeconds(state, it) });
        const lastSet = n === it.sets, lastItem = i === items.length - 1;
        if (!(lastSet && lastItem)) steps.push({ t: "rest", min: it.rest[0], max: it.rest[1], kind: lastSet ? "exercise" : "set", est: lastSet ? E.CHANGEOVER : 0 });
      }
    });
    workout.cool.forEach(function (g) {
      steps.push({ t: "guide", phase: "cool", key: g.key, label: g.label, unit: g.unit, amount: g.amount, note: g.note || "", est: E.guideSeconds(g) });
    });
    steps.push({ t: "end", est: 0 });
    const s = {
      kind: opts.kind || "workout", idx: workout.idx, practice: !!opts.practice, title: workout.title, minutes: workout.minutes,
      budgetSec: workout.minutes * 60, items: items, steps: steps, at: -1, startedAt: now, stepStartedAt: now, pausedAt: null, pausedMs: 0,
      totalPausedMs: 0, lastSeenAt: now, restSeconds: 60, running: false, cuePhase: -1, cueSecond: null, testResults: {}, testValue: null, autoPaused: false,
    };
    enter(s, 0, now);
    return s;
  }

  function step(s) { return s.steps[s.at]; }
  function elapsedMs(s, now) {
    const end = s.pausedAt != null ? s.pausedAt : now;
    return Math.max(0, end - s.stepStartedAt - s.pausedMs);
  }
  function activeSeconds(s, now) {
    const end = s.pausedAt != null ? s.pausedAt : now;
    return Math.max(0, (end - s.startedAt - s.totalPausedMs) / 1000);
  }

  // How long this rest should be so the finish lands on the chosen timeframe, within the rest's own range.
  function flexRest(s, i, now) {
    let work = 0, low = 0, span = 0;
    for (let n = i; n < s.steps.length; n++) {
      const st = s.steps[n];
      if (st.t === "rest") { low += st.min; span += st.max - st.min; work += st.est; } else work += st.est;
    }
    const left = s.budgetSec - activeSeconds(s, now);
    const r = span > 0 ? Math.max(0, Math.min(1, (left - work - low) / span)) : 0.5;
    const st = s.steps[i];
    return Math.round((st.min + (st.max - st.min) * r) / 5) * 5;
  }

  function enter(s, i, now) {
    s.at = Math.min(i, s.steps.length - 1);
    s.stepStartedAt = now;
    s.pausedMs = 0;
    s.cuePhase = -1;
    s.cueSecond = null;
    s.running = false;
    s.testValue = null;
    const st = step(s);
    if (st.t === "rest") s.restSeconds = flexRest(s, s.at, now);
    s.lastSeenAt = now;
  }
  function advance(s, now) { enter(s, s.at + 1, now); }

  function phasesFor(s, st) {
    if (st.t === "rest") return [{ label: "Rest", seconds: s.restSeconds, kind: "rest" }];
    if (st.t === "set") {
      const it = s.items[st.item];
      const lead = st.set === 1 ? COUNT_IN_FIRST : COUNT_IN_NEXT;
      if (it.unit === "sec") return [{ label: "Get ready", seconds: lead, kind: "ready" }, { label: "Hold", seconds: it.goal, kind: "work" }];
      if (it.unit === "sec_side") {
        return [{ label: "Get ready", seconds: lead, kind: "ready" }, { label: "First side", seconds: it.goal, kind: "work" },
          { label: "Switch sides", seconds: SWITCH, kind: "ready" }, { label: "Second side", seconds: it.goal, kind: "work" }];
      }
      return null;
    }
    if (st.t === "guide") {
      if (st.unit === "sec") return [{ label: "Get ready", seconds: COUNT_IN_NEXT, kind: "ready" }, { label: "Go", seconds: st.amount, kind: "work" }];
      if (st.unit === "sec_side") {
        return [{ label: "Get ready", seconds: COUNT_IN_NEXT, kind: "ready" }, { label: "First side", seconds: st.amount, kind: "work" },
          { label: "Switch sides", seconds: SWITCH, kind: "ready" }, { label: "Second side", seconds: st.amount, kind: "work" }];
      }
      return null;
    }
    if (st.t === "test" && st.test.type === "timedcount" && s.running) return [{ label: "Go", seconds: st.test.seconds, kind: "work" }];
    return null;
  }

  function view(s, now) {
    const st = step(s), e = elapsedMs(s, now) / 1000;
    const out = { step: st, elapsed: e, paused: s.pausedAt != null, phases: phasesFor(s, st), phase: null, phaseIdx: -1, remaining: null, total: null, finished: false };
    if (out.phases) {
      let t = 0;
      out.finished = true;
      for (let i = 0; i < out.phases.length; i++) {
        const p = out.phases[i];
        if (e < t + p.seconds) {
          out.phase = p; out.phaseIdx = i; out.remaining = t + p.seconds - e; out.total = p.seconds; out.finished = false;
          break;
        }
        t += p.seconds;
      }
    }
    return out;
  }

  // Call often while the app is open. Returns the cues to play.
  function tick(s, now) {
    const cues = [];
    if (s.pausedAt != null) return { cues: cues, changed: false };
    if (now - s.lastSeenAt > AUTO_PAUSE_GAP) {
      s.pausedAt = s.lastSeenAt;
      s.autoPaused = true;
      return { cues: cues, changed: true };
    }
    s.lastSeenAt = now;
    let changed = false;
    for (let guard = 0; guard < 8; guard++) {
      const v = view(s, now);
      if (!v.phases) break;
      if (v.finished) {
        finishTimedStep(s, v, now);
        cues.push({ type: "done" });
        changed = true;
        if (step(s).t === "end") break;
        continue;
      }
      if (v.phaseIdx !== s.cuePhase) {
        s.cuePhase = v.phaseIdx;
        s.cueSecond = null;
        cues.push({ type: "phase", phase: v.phase, step: v.step });
      }
      const whole = Math.ceil(v.remaining);
      if (whole !== s.cueSecond) {
        s.cueSecond = whole;
        if (whole <= 3 && whole >= 1) cues.push({ type: "count", n: whole, kind: v.phase.kind });
        if (whole === 10 && v.phase.kind === "rest" && v.total > 15) cues.push({ type: "ten" });
      }
      break;
    }
    return { cues: cues, changed: changed };
  }

  function finishTimedStep(s, v, now) {
    const st = v.step;
    if (st.t === "set") {
      const it = s.items[st.item];
      log(s, st.item, st.set, it.goal, elapsedMs(s, now));
      advance(s, now);
    } else if (st.t === "test") {
      s.running = false;
      s.testValue = null;
      s.stepStartedAt = now;
      s.pausedMs = 0;
      s.timedDone = true;
    } else {
      advance(s, now);
    }
  }

  function log(s, itemIdx, setNo, actual, ms) {
    const it = s.items[itemIdx];
    it.logs[setNo - 1] = { actual: actual, status: actual > it.goal ? "beat" : actual >= it.goal ? "met" : "short", ms: ms || 0 };
  }

  function pause(s, now) { if (s.pausedAt == null) s.pausedAt = now; }
  function resume(s, now) {
    if (s.pausedAt != null) {
      const gap = now - s.pausedAt;
      s.pausedMs += gap;
      s.totalPausedMs += gap;
      s.pausedAt = null;
      s.lastSeenAt = now;
      s.autoPaused = false;
    }
  }

  // A rep set was finished: record what was done, then move on.
  function completeRepSet(s, actual, now) {
    const st = step(s);
    if (st.t !== "set") return;
    log(s, st.item, st.set, actual, elapsedMs(s, now));
    advance(s, now);
  }
  // A timed set was stopped early.
  function stopHold(s, now) {
    const st = step(s), v = view(s, now);
    if (st.t !== "set" || !v.phases) return;
    const it = s.items[st.item];
    let held = 0;
    if (v.phase && v.phase.kind === "work") held = Math.floor(v.total - v.remaining);
    log(s, st.item, st.set, held, elapsedMs(s, now));
    advance(s, now);
  }
  function editLast(s, actual) {
    // Corrects the most recently recorded set, from the rest screen.
    for (let i = s.at - 1; i >= 0; i--) {
      const st = s.steps[i];
      if (st.t === "set") {
        const it = s.items[st.item];
        const was = it.logs[st.set - 1];
        log(s, st.item, st.set, actual, was ? was.ms : 0);
        return;
      }
    }
  }
  function lastSet(s) {
    for (let i = s.at - 1; i >= 0; i--) {
      const st = s.steps[i];
      if (st.t === "set") {
        const it = s.items[st.item], l = it.logs[st.set - 1];
        return l ? { item: it, set: st.set, log: l } : null;
      }
      if (st.t === "test") return null;
    }
    return null;
  }
  function nextWork(s) {
    for (let i = s.at + 1; i < s.steps.length; i++) {
      const st = s.steps[i];
      if (st.t === "set") { const it = s.items[st.item]; return { type: "set", item: it, set: st.set }; }
      if (st.t === "guide") return { type: "guide", label: st.label, key: st.key, phase: st.phase };
      if (st.t === "test") return { type: "test", label: st.test.label, key: st.test.ex };
      if (st.t === "end") return { type: "end" };
    }
    return { type: "end" };
  }
  function addRest(s, extra) { if (step(s).t === "rest") s.restSeconds += extra; }
  function skipStep(s, now) { advance(s, now); }

  function skipExercise(s, now) {
    const st = step(s);
    if (st.t !== "set") return;
    const cur = st.item;
    s.items[cur].skipped = !s.items[cur].logs.filter(Boolean).length;
    let i = s.at + 1;
    while (i < s.steps.length) {
      const n = s.steps[i];
      if ((n.t === "set" && n.item !== cur) || n.t === "guide" || n.t === "end") break;
      i++;
    }
    enter(s, i, now);
  }
  function finishEarly(s, now) { enter(s, s.steps.length - 1, now); }

  // ---- checkpoint test steps
  function startTestClock(s, now) { s.stepStartedAt = now; s.pausedMs = 0; s.running = true; s.timedDone = false; s.cuePhase = -1; s.cueSecond = null; }
  function stopTestClock(s, now) {
    s.testValue = Math.floor(elapsedMs(s, now) / 1000);
    s.running = false;
  }
  // Records one test result. Returns the group's finished results when that was its last test, so the tier can go up.
  function recordTestValue(s, value, now) {
    const st = step(s);
    const key = st.test.id === "wall" ? "wall" : st.test.id;
    const res = s.testResults[st.group] = s.testResults[st.group] || {};
    res[key] = value;
    const out = st.last ? { group: st.group, results: res } : null;
    s.timedDone = false;
    advance(s, now);
    return out;
  }

  function progress(s) {
    let done = 0, total = 0;
    s.steps.forEach(function (st, i) {
      if (st.t === "rest" || st.t === "end") return;
      total++;
      if (i < s.at) done++;
    });
    return total ? done / total : 1;
  }
  function timeLeft(s, now) {
    let left = 0;
    for (let i = s.at; i < s.steps.length; i++) {
      const st = s.steps[i];
      left += st.t === "rest" ? (i === s.at ? s.restSeconds : (st.min + st.max) / 2) + st.est : st.est;
    }
    return left;
  }
  function summary(s) {
    let sets = 0, met = 0, short = 0, notDone = 0;
    s.items.forEach(function (it) {
      const logs = it.logs.filter(Boolean);
      sets += it.sets;
      logs.forEach(function (l) { if (l.status === "short") short++; else met++; });
      notDone += Math.max(0, it.sets - logs.length);
    });
    return { sets: sets, met: met, short: short, notDone: notDone };
  }

  root.Session = {
    create: create, step: step, view: view, tick: tick, pause: pause, resume: resume, advance: advance, completeRepSet: completeRepSet, stopHold: stopHold,
    editLast: editLast, lastSet: lastSet, nextWork: nextWork, addRest: addRest, skipStep: skipStep, skipExercise: skipExercise, finishEarly: finishEarly,
    startTestClock: startTestClock, stopTestClock: stopTestClock, recordTestValue: recordTestValue, progress: progress, timeLeft: timeLeft,
    activeSeconds: activeSeconds, summary: summary, elapsedMs: elapsedMs, phasesFor: phasesFor, flexRest: flexRest,
  };
})(window);

/* The plan's rules: tiers, goals, random picks, fitting to a timeframe, the held-workout queue.
   No screen code here, so it can be tested on its own (tests/tests.html). */
(function (root) {
  "use strict";
  const WB = root.WORKBOOK;
  const DAY_MS = 86400000;

  // ------------------------------------------------------------ dates (plain "YYYY-MM-DD" strings, local time)
  function toDate(s) { const p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fromDate(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function addDays(s, n) { const d = toDate(s); d.setDate(d.getDate() + n); return fromDate(d); }
  function daysBetween(a, b) { return Math.round((toDate(b) - toDate(a)) / DAY_MS); }
  function isSunday(s) { return toDate(s).getDay() === 0; }

  // ------------------------------------------------------------ groups, slots and levels
  const GROUPS = { push: "Push", pull: "Pull", legs: "Legs", core: "Core", lowback: "Lower Back" };
  const GROUP_ORDER = ["push", "pull", "legs", "core", "lowback"];

  // One entry per slot of the workbook's weekly template, in the same order as program.py's DAYS.
  // main: counts toward earning the group's test. keep: never dropped to fit a timeframe. fixed: never swapped at random.
  const SLOT_META = {
    0: [{ g: "pull", role: "row", main: true, keep: true }, { g: "pull", role: "row", main: true },
      { g: "pull", role: "ytw", fixed: true, keep: true }, { g: "pull", role: "snow", fixed: true, keep: true },
      { g: "lowback", role: "lowback", main: true, keep: true }, { g: "pull", role: "hang" }],
    1: [{ g: "core", role: "oblique", main: true }, { g: "core", role: "oblique" }, { g: "core", role: "abs" }],
    2: [{ g: "legs", role: "quad", main: true }, { g: "legs", role: "quad", main: true }, { g: "legs", role: "glute", main: true },
      { g: "legs", role: "hamstring", main: true }, { g: "legs", role: "calf" }, { g: "legs", role: "adductor" }],
    3: [{ g: "lowback", role: "lowback", main: true, keep: true }, { g: "legs", role: "hip" }, { g: "legs", role: "shin" },
      { g: "legs", role: "quad" }],
    4: [{ g: "push", role: "press", main: true }, { g: "push", role: "shoulder", main: true }, { g: "push", role: "press", main: true },
      { g: "core", role: "abs", main: true }, { g: "core", role: "abs", main: true },
      { g: "pull", role: "wallangel", fixed: true, keep: true }, { g: "core", role: "conditioning" }],
  };

  function bandOfWeek(w) { return Math.max(1, Math.ceil(w / 8)); }

  const LEVELS = {};      // exercise key -> its level (start week, rep range, unit, group, role)
  const DAY_SLOTS = {};   // weekday -> slots
  Object.keys(SLOT_META).forEach(function (d) {
    DAY_SLOTS[d] = WB.days[d].slots.map(function (levels, i) {
      const meta = SLOT_META[d][i];
      const ls = levels.map(function (l) {
        const lv = Object.assign({}, l, { group: meta.g, role: meta.role, band: bandOfWeek(l.start), fixed: !!meta.fixed });
        LEVELS[l.key] = lv;
        return lv;
      });
      return { meta: meta, levels: ls, day: +d, slot: i };
    });
  });
  // In the workbook's library but in no slot: the easier push-up.
  LEVELS.incline_pushup = { key: "incline_pushup", start: 1, lo: 8, hi: 15, unit: "reps", group: "push", role: "press", band: 1, extra: true };

  const GROUP_BANDS = {};
  GROUP_ORDER.forEach(function (g) {
    const set = {};
    Object.keys(LEVELS).forEach(function (k) { if (LEVELS[k].group === g) set[LEVELS[k].band] = true; });
    GROUP_BANDS[g] = Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
  });

  const WALL_HINT = "Stand with heels, butt and shoulder blades on a wall, chin level. Measure the gap between the back of your head and the wall. Smaller is better.";
  const TESTS = {
    push: [{ id: "pushups", label: "Max push-ups", hint: "One set, good form. Stop when your form breaks.", type: "maxreps", ex: "pushup", unit: "reps" }],
    pull: [{ id: "rows", label: "Max table rows", hint: "Straight legs, or bent knees if needed. Stop when your form breaks.", type: "maxreps", ex: "row_straight", unit: "reps" },
      { id: "wall", label: "Posture wall test", hint: WALL_HINT, type: "measure", ex: "wall_angel", unit: "cm" }],
    legs: [{ id: "squats60", label: "Squats in 60 seconds", hint: "Full range, as many as you can. Count them.", type: "timedcount", seconds: 60, ex: "squat", unit: "reps" }],
    core: [{ id: "plank", label: "Forearm plank, max hold", hint: "Start the clock, stop it when your hips drop.", type: "maxhold", ex: "plank", unit: "sec" },
      { id: "sideplank_a", label: "Side plank, first side", hint: "Start the clock, stop it when your hips drop.", type: "maxhold", ex: "side_plank", unit: "sec" },
      { id: "sideplank_b", label: "Side plank, second side", hint: "Start the clock, stop it when your hips drop.", type: "maxhold", ex: "side_plank", unit: "sec" }],
    lowback: [{ id: "superman", label: "Superman hold, max time", hint: "Arms, chest and legs off the floor. Stop when they touch down.", type: "maxhold", ex: "superman", unit: "sec" }],
  };

  const WARMUP_S = [
    { key: "jumping_jack", label: "Jumping Jacks", unit: "sec", amount: 30 },
    { key: "cat_cow", label: "Cat-Cow", unit: "reps", amount: 6, note: "Slow reps" },
    { key: "squat", label: "Bodyweight Squat", unit: "reps", amount: 10, note: "Easy reps" },
    { key: "chin_tuck", label: "Chin Tuck", unit: "reps", amount: 5 },
    { key: "wall_angel", label: "Wall Angel", unit: "reps", amount: 5 },
    { key: null, label: "Arm Circles", unit: "reps", amount: 20, note: "10 forward, 10 back" },
    { key: "@first", label: "Easy set", unit: "free", note: "One easy set of your first exercise" },
  ];
  const WARMUP_SECONDS = 300;
  const SNACK = [
    { key: "chin_tuck", label: "Chin Tuck", unit: "reps", amount: 10 },
    { key: "doorway_pec", label: "Doorway Chest Stretch", unit: "sec_side", amount: 30 },
    { key: "wall_angel", label: "Wall Angel", unit: "reps", amount: 5, note: "Slow reps" },
  ];
  const PREP_ITEMS = [
    "Read how to do Monday's and Tuesday's moves (tap any exercise for its how-to).",
    "Test your table and chairs. The table must not tip or slide when you pull hard on the edge. Use a solid four-legged chair with its back against a wall.",
    "Find your spots: table, chairs, wall, a step, the couch. Use a mat or rug for floor moves, and socks or a towel on a smooth floor for slider curls.",
    "Do the posture wall test and record it on the Progress screen.",
    "Choose your running loop (flat, 1-2 miles) and lay out shoes and clothes for Tuesday. Install MapMyRun if you haven't.",
    "Put your training times in your calendar: weekdays 30-45 minutes, Saturday longer.",
    "Take a 'before' photo from the side (optional, very motivating for posture).",
    "Tell someone your goal and pick a marathon around Nov 6, 2027.",
  ];
  const CHANGEOVER = 15;

  // ------------------------------------------------------------ state
  function newState() {
    const tiers = {};
    GROUP_ORDER.forEach(function (g) { tiers[g] = 1; });
    return {
      version: 1, tiers: tiers, goals: {}, topped: {}, pace: {}, done: {}, runs: [], tests: [], events: [], history: [],
      seeds: {}, lastPicks: {}, minutes: { strength: 30, runDay: 20 }, snacks: {}, prep: {}, wall: [],
      settings: { voice: true, beeps: true }, lastBackup: null, active: null,
    };
  }

  // ------------------------------------------------------------ the plan
  const TOTAL_DAYS = WB.weeks.length * 7;
  const RACE_IDX = (WB.weeks.length - 1) * 7 + 5;

  function planDay(idx) {
    const w = Math.floor(idx / 7) + 1, d = idx % 7;
    const wk = WB.weeks[w - 1], spec = WB.days[d], wd = wk.days[d];
    const out = {
      idx: idx, w: w, d: d, date: addDays(WB.start, idx), title: spec.title, short: spec.short, focus: spec.focus,
      rest: d === 6, run: wd.run || null, strength: d <= 4, note: wd.note || "", finish: wd.finish || spec.finish,
      phase: wk.phase, cutback: wk.cutback, sets: wk.sets, mobilityOnly: false,
    };
    if (w === 52 && d === 4) { out.title = "Pre-Race Mobility"; out.short = "EASY"; out.mobilityOnly = true; }
    if (w === 52 && d === 5) { out.title = "Race Day: Marathon"; out.short = "RACE"; }
    return out;
  }
  function isTraining(idx) { return idx % 7 !== 6; }

  function partsNeeded(day) { return { run: !!day.run, strength: !!day.strength }; }
  function isComplete(state, idx) {
    const day = planDay(idx);
    if (day.rest) return true;
    const dn = state.done[idx] || {};
    const need = partsNeeded(day);
    return (!need.run || !!dn.run) && (!need.strength || !!dn.strength);
  }
  function queueHead(state) {
    for (let i = 0; i < TOTAL_DAYS; i++) if (isTraining(i) && !isComplete(state, i)) return i;
    return null;
  }
  function canStart(state, idx, today) {
    return idx === queueHead(state) && planDay(idx).date <= today;
  }

  function projection(state, today) {
    const head = queueHead(state);
    const byDate = {}, byIdx = {};
    let cursor = today < WB.start ? WB.start : today;
    let doneToday = false, partialToday = false;
    Object.keys(state.done).forEach(function (k) {
      const dn = state.done[k];
      const full = isComplete(state, +k);
      if (full && dn.date === today) doneToday = true;
      if (!full && ((dn.run && dn.run.date === today) || (dn.strength && dn.strength.date === today))) partialToday = true;
    });
    if (doneToday && !partialToday) cursor = addDays(cursor, 1);
    if (head !== null) {
      for (let i = head; i < TOTAL_DAYS; i++) {
        if (!isTraining(i) || isComplete(state, i)) continue;
        const orig = planDay(i).date;
        let date = cursor > orig ? cursor : orig;
        while (isSunday(date)) date = addDays(date, 1);
        byIdx[i] = date;
        (byDate[date] = byDate[date] || []).push(i);
        cursor = addDays(date, 1);
      }
    }
    const raceDate = WB.race;
    const raceProjected = byIdx[RACE_IDX] || null;
    return { byDate: byDate, byIdx: byIdx, raceDate: raceDate, raceProjected: raceProjected,
      daysLate: raceProjected ? Math.max(0, daysBetween(raceDate, raceProjected)) : 0 };
  }

  function status(state, today) {
    const head = queueHead(state);
    let behind = 0;
    for (let i = 0; i < TOTAL_DAYS; i++) {
      if (isTraining(i) && planDay(i).date < today && !isComplete(state, i)) behind++;
    }
    const proj = projection(state, today);
    return {
      head: head, behind: behind, projection: proj, daysLate: proj.daysLate,
      started: today >= WB.start, canStart: head !== null && canStart(state, head, today),
      heldFrom: head !== null && planDay(head).date < today ? planDay(head).date : null,
    };
  }

  // ------------------------------------------------------------ tiers and goals
  function bandOf(group, tier) { const b = GROUP_BANDS[group]; return b[Math.min(tier, b.length) - 1]; }
  function maxTier(group) { return GROUP_BANDS[group].length; }
  function isUnlocked(state, key) {
    const lv = LEVELS[key];
    return !!lv && lv.band <= bandOf(lv.group, state.tiers[lv.group]);
  }
  function unlockedIn(state, slot) { return slot.levels.filter(function (l) { return isUnlocked(state, l.key); }); }
  function goalOf(state, key) { const v = state.goals[key]; return v != null ? v : LEVELS[key].lo; }
  function isSec(unit) { return unit === "sec" || unit === "sec_side"; }
  function stepOf(unit) { return isSec(unit) ? 5 : 1; }

  function anchorOf(state, slot) {
    const open = unlockedIn(state, slot);
    for (let i = 0; i < open.length; i++) if (!state.topped[open[i].key]) return open[i];
    return open[open.length - 1] || null;
  }

  function mainSlots(group) {
    const out = [];
    Object.keys(DAY_SLOTS).forEach(function (d) {
      DAY_SLOTS[d].forEach(function (s) { if (s.meta.g === group && s.meta.main) out.push(s); });
    });
    return out;
  }

  function pushGuard(state) {
    // Push may not go more than one tier ahead of Pull, compared on the workbook's shared bands.
    const t = state.tiers.push;
    if (t >= maxTier("push")) return null;
    if (state.tiers.pull >= maxTier("pull")) return null;
    const next = bandOf("push", t + 1), pull = bandOf("pull", state.tiers.pull);
    if (next <= pull + 1) return null;
    for (let i = state.tiers.pull + 1; i <= maxTier("pull"); i++) {
      if (next <= bandOf("pull", i) + 1) return i;
    }
    return maxTier("pull");
  }

  function groupStatus(state, g) {
    const tier = state.tiers[g], top = maxTier(g);
    const needed = [];
    mainSlots(g).forEach(function (s) {
      const open = unlockedIn(state, s);
      if (open.length) {
        const lv = open[open.length - 1];
        needed.push({ key: lv.key, goal: goalOf(state, lv.key), hi: lv.hi, unit: lv.unit, topped: !!state.topped[lv.key] });
      }
    });
    const done = needed.filter(function (n) { return n.topped; }).length;
    const earned = tier < top && needed.length > 0 && done === needed.length;
    const nextBand = tier < top ? GROUP_BANDS[g][tier] : null;
    const unlocks = nextBand == null ? [] : Object.keys(LEVELS).filter(function (k) {
      return LEVELS[k].group === g && LEVELS[k].band === nextBand;
    });
    const needsPull = g === "push" && earned ? pushGuard(state) : null;
    return { group: g, name: GROUPS[g], tier: tier, maxTier: top, needed: needed, done: done, earned: earned,
      testReady: earned && needsPull == null, needsPullTier: needsPull, unlocks: unlocks, atTop: tier >= top };
  }

  function testsDue(state, day) {
    if (day.w >= 49 || !day.strength || day.mobilityOnly) return [];
    const groups = {};
    (DAY_SLOTS[day.d] || []).forEach(function (s) { if (!s.meta.fixed && unlockedIn(state, s).length) groups[s.meta.g] = true; });
    return GROUP_ORDER.filter(function (g) { return groups[g] && groupStatus(state, g).testReady; });
  }

  function addEvent(state, today, ev) { ev.date = today; state.events.push(ev); }

  function recordTest(state, group, results, today) {
    const from = state.tiers[group], last = state.tests.filter(function (t) { return t.group === group; }).pop() || null;
    state.tests.push({ group: group, date: today, results: results, from: from, to: from + 1 });
    state.tiers[group] = Math.min(maxTier(group), from + 1);
    if (results.wall != null) state.wall.push({ date: today, cm: results.wall });
    addEvent(state, today, { type: "tier", group: group, to: state.tiers[group] });
    return { group: group, to: state.tiers[group], previous: last ? last.results : null,
      unlocked: Object.keys(LEVELS).filter(function (k) {
        return LEVELS[k].group === group && LEVELS[k].band === bandOf(group, state.tiers[group]);
      }) };
  }

  // ------------------------------------------------------------ random picks
  function hash(n) { let h = (n + 1) * 2654435761; return (h ^ (h >>> 13)) >>> 0; }
  function makeRng(seed) { // small repeatable generator, so a workout stays the same until reshuffled
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seedOf(state, idx) { return state.seeds[idx] != null ? state.seeds[idx] : hash(idx); }
  function reshuffle(state, idx) { state.seeds[idx] = (seedOf(state, idx) + 7919 + Date.now() % 100000) >>> 0; }

  const RACE_WEEK_SKIP = { jump_lunge: 1, pistol: 1, nordic: 1, pogo: 1 };

  function poolFor(state, role, taken, day) {
    return Object.keys(LEVELS).filter(function (k) {
      const lv = LEVELS[k];
      if (lv.role !== role || taken[k] || !isUnlocked(state, k)) return false;
      if (day.w === 52 && RACE_WEEK_SKIP[k]) return false;
      return true;
    });
  }

  function weightedPick(keys, weightOf, rng) {
    let total = 0;
    const w = keys.map(function (k) { const v = weightOf(k); total += v; return v; });
    let r = rng() * total;
    for (let i = 0; i < keys.length; i++) { r -= w[i]; if (r <= 0) return keys[i]; }
    return keys[keys.length - 1];
  }

  function makeItem(state, day, key, meta) {
    const lv = LEVELS[key], base = goalOf(state, key);
    let goal = base;
    if (day.w >= 50) goal = Math.max(lv.lo, Math.floor(base * 0.8));
    else if (day.cutback) goal = Math.max(lv.lo, base - stepOf(lv.unit));
    let sets = day.sets;
    if (key === "mountain_climber" || key === "burpee" || key === "wall_angel") sets = 2;
    if (day.w === 52) sets = 1;
    sets = Math.max(1, sets);
    const ex = WB.exercises[key];
    const short = ["core", "oblique", "lowback", "mobility"].indexOf(ex.cat) >= 0 || !!lv.fixed;
    return {
      key: key, name: ex.name, group: lv.group, role: lv.role, unit: lv.unit, lo: lv.lo, hi: lv.hi, baseGoal: base, goal: goal,
      eased: goal !== base, sets: sets, planSets: sets, main: !!meta.main, keep: !!meta.keep, fixed: !!lv.fixed,
      rest: short ? [30, 45] : [60, 90], logs: [],
    };
  }

  function pickExercises(state, day, rng) {
    const taken = {}, items = [];
    (DAY_SLOTS[day.d] || []).forEach(function (slot) {
      if (!unlockedIn(state, slot).length) return;
      if (day.w === 52 && slot.levels.every(function (l) { return RACE_WEEK_SKIP[l.key]; })) return;
      const anchor = anchorOf(state, slot);
      let key;
      if (slot.meta.fixed) key = anchor.key;
      else {
        const pool = poolFor(state, slot.meta.role, taken, day);
        if (!pool.length) return;
        const recent = state.lastPicks[day.d] || [];
        key = weightedPick(pool, function (k) {
          let v = k === anchor.key && !state.topped[k] ? 3 : 1;
          if (LEVELS[k].extra) v *= 0.5;
          if (recent.indexOf(k) >= 0) v *= 0.35;
          return v;
        }, rng);
      }
      taken[key] = true;
      items.push(makeItem(state, day, key, slot.meta));
    });
    return items;
  }

  // ------------------------------------------------------------ fitting to the timeframe
  const REP_SECONDS = { ytw: 9, snow_angel: 6, superman: 4, back_ext: 4, bird_dog: 5, reverse_hyper: 3.5, wall_angel: 4, chin_row: 4.5,
    row_bent: 4, row_straight: 4, row_elev: 4, archer_row: 4.5, slider_curl: 4, nordic: 6 };
  function secondsPerRep(state, key) { return state.pace[key] || REP_SECONDS[key] || 3.5; }
  function setSeconds(state, item) {
    const g = item.goal;
    switch (item.unit) {
      case "reps": return g * secondsPerRep(state, item.key) + 5;
      case "side": return g * 2 * secondsPerRep(state, item.key) * 0.9 + 5;
      case "sec": return g + 5;
      case "sec_side": return g * 2 + 10;
      default: return 30;
    }
  }
  function restAt(item, r) { return item.rest[0] + (item.rest[1] - item.rest[0]) * r; }
  function workSeconds(state, items, r) {
    let t = 0;
    items.forEach(function (it, i) {
      const rest = restAt(it, r);
      t += setSeconds(state, it) * it.sets + rest * (it.sets - 1);
      if (i < items.length - 1) t += rest + CHANGEOVER;
    });
    return t;
  }
  function lastIndexWhere(a, f) { for (let i = a.length - 1; i >= 0; i--) if (f(a[i])) return i; return -1; }

  function shrink(items) {
    let i = lastIndexWhere(items, function (it) { return !it.main && !it.keep; });
    if (i >= 0) { items.splice(i, 1); return true; }
    let most = null;
    items.forEach(function (it) { if (it.sets > 2 && (!most || it.sets > most.sets || (most.keep && !it.keep))) most = it; });
    if (most) { most.sets--; return true; }
    i = lastIndexWhere(items, function (it) { return !it.keep && it.sets > 1; });
    if (i >= 0) { items[i].sets--; return true; }
    i = lastIndexWhere(items, function (it) { return !it.keep; });
    if (i >= 0) { items.splice(i, 1); return true; }
    i = lastIndexWhere(items, function (it) { return it.sets > 1; });
    if (i >= 0) { items[i].sets--; return true; }
    return false;
  }

  function fitToTime(state, day, items, budget, rng) {
    while (workSeconds(state, items, 0) > budget && shrink(items)) { /* keep shrinking */ }
    const tooTight = workSeconds(state, items, 0) > budget;
    let extras = 0;
    for (let guard = 0; guard < 60; guard++) {
      const full = workSeconds(state, items, 1);
      if (full >= budget) break;
      let target = null;
      items.forEach(function (it) {
        if (it.sets < Math.min(4, it.planSets + 1) && (!target || it.sets < target.sets || (it.sets === target.sets && it.main && !target.main))) target = it;
      });
      if (target && full + setSeconds(state, target) + target.rest[1] <= budget) { target.sets++; continue; }
      if (extras < 2 && day.w < 50) {
        const taken = {};
        items.forEach(function (it) { taken[it.key] = true; });
        const roles = {};
        (DAY_SLOTS[day.d] || []).forEach(function (s) { if (!s.meta.fixed) roles[s.meta.role] = s.meta; });
        const pool = [];
        Object.keys(roles).forEach(function (role) { poolFor(state, role, taken, day).forEach(function (k) { pool.push(k); }); });
        if (pool.length) {
          const key = pool[Math.floor(rng() * pool.length)];
          const extra = makeItem(state, day, key, { main: false, keep: false });
          const cost = setSeconds(state, extra) * extra.sets + extra.rest[1] * extra.sets + CHANGEOVER;
          if (full + cost <= budget) { items.push(extra); extras++; continue; }
        }
      }
      break;
    }
    const lowest = workSeconds(state, items, 0), highest = workSeconds(state, items, 1);
    const r = highest > lowest ? Math.max(0, Math.min(1, (budget - lowest) / (highest - lowest))) : 0.5;
    return { r: r, seconds: workSeconds(state, items, r), tooTight: tooTight };
  }

  function parseDose(f) {
    const ex = WB.exercises[f.key];
    const label = ex ? ex.name : f.key;
    const m = /^(\d+)s\/(side|leg)$/.exec(f.dose);
    if (m) return { key: f.key, label: label, unit: "sec_side", amount: +m[1], note: m[2] === "leg" ? "Each leg" : "Each side" };
    if (/^\d+$/.test(f.dose)) return { key: f.key, label: label, unit: "reps", amount: +f.dose };
    return { key: f.key, label: label, unit: "sec_side", amount: 20, note: "Gentle" };
  }
  function guideSeconds(g) {
    if (g.unit === "sec") return g.amount + 5;
    if (g.unit === "sec_side") return g.amount * 2 + 10;
    if (g.unit === "reps") return g.amount * 3.5 + 5;
    return 40;
  }

  function buildWorkout(state, idx, minutes, opts) {
    opts = opts || {};
    const day = planDay(idx), rng = makeRng(seedOf(state, idx));
    const cool = day.finish.map(parseDose);
    const coolSec = cool.reduce(function (t, g) { return t + guideSeconds(g); }, 0);
    const out = { idx: idx, title: day.title, week: day.w, minutes: minutes, note: day.note, items: [], warmup: [], cool: cool,
      tests: [], restR: 0.5, estSeconds: coolSec, tooTight: false, maxedOut: false, mobilityOnly: day.mobilityOnly };
    if (day.mobilityOnly) return out;
    if (opts.warmup !== false) out.warmup = WARMUP_S.map(function (g) { return Object.assign({}, g); });
    const warmSec = out.warmup.length ? WARMUP_SECONDS : 0;
    if (!opts.practice) out.tests = testsDue(state, day);
    let testSec = 0;
    out.tests.forEach(function (g) { TESTS[g].forEach(function () { testSec += 150; }); });
    const budget = minutes * 60 - warmSec - coolSec - testSec;
    const items = pickExercises(state, day, rng);
    const fit = fitToTime(state, day, items, budget, rng);
    out.items = items;
    out.restR = fit.r;
    out.tooTight = fit.tooTight;
    out.estSeconds = warmSec + coolSec + testSec + fit.seconds;
    out.maxedOut = out.estSeconds < minutes * 60 - 120;
    return out;
  }

  // ------------------------------------------------------------ finishing a workout
  function markPart(state, idx, part, rec, today) {
    const dn = state.done[idx] = state.done[idx] || {};
    dn[part] = rec;
    if (isComplete(state, idx) && !dn.date) {
      dn.date = today;
      const day = planDay(idx);
      const first = (day.w - 1) * 7;
      let weekDone = true;
      for (let i = first; i < first + 6; i++) if (!isComplete(state, i)) weekDone = false;
      if (weekDone) {
        addEvent(state, today, { type: "week", w: day.w });
        const ph = WB.phases.filter(function (p) { return p.b === day.w; })[0];
        if (ph) addEvent(state, today, { type: "phase", name: ph.name });
      }
      return true;
    }
    return false;
  }

  function roundFive(n) { return Math.floor(n / 5) * 5; }

  function applyGoal(state, item, report) {
    const logs = (item.logs || []).filter(Boolean);
    const planned = item.sets;
    if (item.skipped || !logs.length) { report.push({ key: item.key, name: item.name, result: "skipped", goal: item.goal, unit: item.unit, next: goalOf(state, item.key), sets: [] }); return; }
    const actuals = logs.map(function (l) { return l.actual; });
    const allDone = logs.length >= planned;
    const allMet = allDone && actuals.every(function (a) { return a >= item.goal; });
    const rec = { key: item.key, name: item.name, goal: item.goal, unit: item.unit, sets: actuals, result: allMet ? "met" : "short", topped: false };
    const step = stepOf(item.unit), base = item.baseGoal;
    if (allMet && !item.eased) {
      const low = Math.min.apply(null, actuals);
      if (low >= item.hi) { state.goals[item.key] = item.hi; state.topped[item.key] = true; rec.topped = true; }
      else {
        let next = base + step;
        if (low >= base + 2 * step) next = isSec(item.unit) ? roundFive(low) : low;
        state.goals[item.key] = Math.min(item.hi, next);
      }
    }
    logs.forEach(function (l) {
      if ((item.unit === "reps" || item.unit === "side") && l.ms && l.actual) {
        const rate = l.ms / 1000 / l.actual / (item.unit === "side" ? 2 : 1);
        if (rate >= 1.5 && rate <= 15) {
          const was = state.pace[item.key];
          state.pace[item.key] = was ? was * 0.7 + rate * 0.3 : rate;
        }
      }
    });
    rec.next = goalOf(state, item.key);
    report.push(rec);
  }

  function finishWorkout(state, session, extra, today) {
    extra = extra || {};
    const items = [];
    if (session.practice) {
      session.items.forEach(function (it) { items.push({ key: it.key, name: it.name, goal: it.goal, unit: it.unit, sets: (it.logs || []).filter(Boolean).map(function (l) { return l.actual; }), result: "practice", next: it.goal }); });
      return { items: items, practice: true, newlyEarned: [], dayComplete: false };
    }
    const before = {};
    GROUP_ORDER.forEach(function (g) { before[g] = groupStatus(state, g).earned; });
    session.items.forEach(function (it) { applyGoal(state, it, items); });
    if (session.kind === "workout") {
      state.lastPicks[planDay(session.idx).d] = session.items.map(function (it) { return it.key; });
      state.history.push({ idx: session.idx, date: today, minutes: session.minutes, effort: extra.effort || null, activeSec: extra.activeSec || null, items: items });
      const met = items.filter(function (i) { return i.result === "met"; }).length;
      var dayComplete = markPart(state, session.idx, "strength", { date: today, effort: extra.effort || null, met: met, total: items.length }, today);
    }
    const newlyEarned = GROUP_ORDER.filter(function (g) { return !before[g] && groupStatus(state, g).earned; });
    return { items: items, practice: false, newlyEarned: newlyEarned, dayComplete: !!dayComplete };
  }

  // ------------------------------------------------------------ runs
  function evaluateRun(state, day, log) {
    const run = day.run, out = { verdict: "recorded", pct: null, target: "", line: "" };
    const previous = state.runs.filter(function (r) { return r.durationSec && r.distanceMi; }).pop();
    if (log.paceSec && previous && previous.paceSec) {
      const diff = Math.round(previous.paceSec - log.paceSec);
      if (Math.abs(diff) >= 5) out.line = fmtClock(Math.abs(diff)) + "/mi " + (diff > 0 ? "faster" : "slower") + " than your last run.";
    }
    if (run.test) {
      out.target = "Mile test";
      const past = state.runs.filter(function (r) { return r.test && r.durationSec; }).pop();
      if (past && log.durationSec) {
        const d = past.durationSec - log.durationSec;
        out.line = fmtClock(Math.abs(d)) + (d >= 0 ? " faster" : " slower") + " than your last mile test (" + fmtClock(past.durationSec) + ").";
      } else if (!past) out.line = "First mile test recorded. Later ones are compared with it.";
      return out;
    }
    if (run.race) { out.target = "26.2 mi"; out.line = "You did it."; return out; }
    if (run.miles != null) {
      out.target = run.miles + " mi";
      if (log.distanceMi != null) { out.pct = log.distanceMi / run.miles; }
    } else if (run.minutes != null) {
      out.target = run.minutes + " min";
      if (log.durationSec != null) { out.pct = log.durationSec / 60 / run.minutes; }
    }
    if (out.pct != null) out.verdict = out.pct >= 0.9 ? "met" : "short";
    return out;
  }
  function completeRun(state, idx, log, today) {
    const day = planDay(idx);
    const ev = evaluateRun(state, day, log);
    const rec = Object.assign({ idx: idx, date: today, week: day.w, title: day.run.title, test: !!day.run.test, race: !!day.run.race }, log,
      { verdict: ev.verdict, pct: ev.pct, target: ev.target });
    state.runs.push(rec);
    const dayComplete = markPart(state, idx, "run", { date: today, verdict: ev.verdict }, today);
    return { run: rec, evaluation: ev, dayComplete: dayComplete };
  }
  function fmtClock(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0");
  }

  function weekSummary(state, w) {
    let done = 0, total = 0;
    const first = (w - 1) * 7;
    for (let i = first; i < first + 6; i++) { total++; if (isComplete(state, i)) done++; }
    const runs = state.runs.filter(function (r) { return r.week === w; });
    const miles = runs.reduce(function (t, r) { return t + (r.distanceMi || 0); }, 0);
    const longest = runs.reduce(function (t, r) { return Math.max(t, r.distanceMi || 0); }, 0);
    let shorts = 0;
    state.history.forEach(function (h) {
      if (Math.floor(h.idx / 7) + 1 === w) h.items.forEach(function (it) { if (it.result === "short") shorts++; });
    });
    return { w: w, done: done, total: total, miles: miles, longest: longest, shorts: shorts, planned: WB.weeks[w - 1].miles };
  }

  function fmtDose(n, unit) {
    return { reps: n + " reps", side: n + " / side", sec: n + " s", sec_side: n + " s / side" }[unit] || String(n);
  }

  root.Engine = {
    WB: WB, GROUPS: GROUPS, GROUP_ORDER: GROUP_ORDER, LEVELS: LEVELS, DAY_SLOTS: DAY_SLOTS, GROUP_BANDS: GROUP_BANDS, TESTS: TESTS, SNACK: SNACK,
    PREP_ITEMS: PREP_ITEMS, WARMUP_S: WARMUP_S, CHANGEOVER: CHANGEOVER, TOTAL_DAYS: TOTAL_DAYS, RACE_IDX: RACE_IDX,
    toDate: toDate, fromDate: fromDate, addDays: addDays, daysBetween: daysBetween, isSunday: isSunday,
    newState: newState, planDay: planDay, isTraining: isTraining, isComplete: isComplete, queueHead: queueHead, canStart: canStart,
    projection: projection, status: status, groupStatus: groupStatus, testsDue: testsDue, recordTest: recordTest, isUnlocked: isUnlocked,
    goalOf: goalOf, isSec: isSec, pushGuard: pushGuard, reshuffle: reshuffle, buildWorkout: buildWorkout, setSeconds: setSeconds,
    guideSeconds: guideSeconds, restAt: restAt, finishWorkout: finishWorkout, evaluateRun: evaluateRun, completeRun: completeRun,
    weekSummary: weekSummary, fmtClock: fmtClock, fmtDose: fmtDose, makeRng: makeRng,
  };
})(window);

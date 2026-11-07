/* The screens. Plan rules are in engine.js, the workout clock is in session.js. */
(function () {
  "use strict";
  const E = window.Engine, RUNNER = window.Session, WB = E.WB;
  let st = Store.load();
  Cues.setSettings(st.settings);

  const query = new URLSearchParams(location.search);
  function today() { return query.get("today") || E.fromDate(new Date()); }

  const ui = { tab: "today", month: null, run: null, stepper: null, effort: null, backup: null, restore: null };
  const $ = function (s) { return document.querySelector(s); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function save() { if (!Store.save(st)) toast("Could not save on this phone. Storage may be full."); }
  function dateLong(s) { return E.toDate(s).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); }
  function dateFull(s) { return E.toDate(s).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }); }
  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }
  let toastTimer = null;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }

  // ------------------------------------------------------------ drawings
  let figs = null;
  function figSrc(key) { return figs && figs[key] ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(figs[key]) : ""; }
  function figImg(key) { return key ? '<img data-fig="' + esc(key) + '" alt="">' : ""; }
  function fillFigs() {
    document.querySelectorAll("img[data-fig]").forEach(function (img) {
      if (!img.getAttribute("src") && figs) { const src = figSrc(img.getAttribute("data-fig")); if (src) img.src = src; }
    });
  }
  fetch("figures.json").then(function (r) { return r.json(); }).then(function (d) { figs = d; fillFigs(); }).catch(function () { /* drawings are optional */ });

  function muscleMap(prim, sec) {
    const m = WB.bodyMap, P = {}, S = {};
    prim.forEach(function (k) { P[k] = 1; });
    sec.forEach(function (k) { S[k] = 1; });
    const mirror = function (pts) { return pts.map(function (p) { return [100 - p[0], p[1]]; }); };
    const pts = function (a) { return a.map(function (p) { return p[0] + "," + p[1]; }).join(" "); };
    function one(view, regions) {
      let out = '<svg viewBox="30 0 40 200" xmlns="http://www.w3.org/2000/svg" style="overflow:visible" role="img" aria-label="' + view + ' muscles">';
      out = out.replace('viewBox="30 0 40 200"', 'viewBox="8 0 84 200"');
      out += '<polygon points="' + pts(m.outline.concat(mirror(m.outline).reverse())) + '" fill="#fff" stroke="#222" stroke-width="1"/>';
      out += '<ellipse cx="50" cy="13.5" rx="8.5" ry="11.5" fill="#fff" stroke="#222" stroke-width="1"/>';
      Object.keys(regions).forEach(function (key) {
        const alias = key === "delts" ? (view === "front" ? "frontdelts" : "reardelts") : null;
        const fill = P[key] || (alias && P[alias]) ? "#c7211f" : S[key] || (alias && S[alias]) ? "#f7b3b3" : "#fff";
        [regions[key], mirror(regions[key])].forEach(function (poly) {
          out += '<polygon points="' + pts(poly) + '" fill="' + fill + '" stroke="#888" stroke-width=".5"/>';
        });
      });
      return out + "</svg>";
    }
    return '<div class="map">' + one("front", m.front) + one("back", m.back) + "</div>";
  }

  // ------------------------------------------------------------ sheets
  function openSheet(html, opts) {
    const box = $("#sheet");
    box.innerHTML = '<div class="sheet">' + html + "</div>";
    box.hidden = false;
    box.dataset.locked = opts && opts.locked ? "1" : "";
    fillFigs();
  }
  function closeSheet() { const box = $("#sheet"); box.hidden = true; box.innerHTML = ""; }

  // ------------------------------------------------------------ tabs
  const ICONS = {
    today: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 2.5v4M16 2.5v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    progress: '<path d="M4 18l6-6 4 4 7-9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    settings: '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  };
  function tabsHtml() {
    return '<nav class="tabs">' + [["today", "Today"], ["calendar", "Calendar"], ["progress", "Progress"], ["settings", "Settings"]].map(function (t) {
      return '<button class="tab' + (ui.tab === t[0] ? " on" : "") + '" data-a="tab" data-v="' + t[0] + '"><svg viewBox="0 0 24 24">' + ICONS[t[0]] + "</svg>" + t[1] + "</button>";
    }).join("") + "</nav>";
  }
  function render() {
    const views = { today: viewToday, calendar: viewCalendar, progress: viewProgress, settings: viewSettings };
    $("#app").innerHTML = views[ui.tab]() + tabsHtml();
    fillFigs();
  }

  // ------------------------------------------------------------ today
  function minutesFor(day) { return day.run ? st.minutes.runDay : st.minutes.strength; }
  function setMinutes(day, m) {
    m = Math.max(10, Math.min(90, m));
    if (day.run) st.minutes.runDay = m; else st.minutes.strength = m;
    save(); render();
  }
  function ranToday(idx) { const dn = st.done[idx]; return !!(dn && dn.run && dn.run.date === today()); }
  function doneTodayCount() {
    let n = 0;
    Object.keys(st.done).forEach(function (k) { if (st.done[k].date === today()) n++; });
    return n;
  }

  function behindBanner(s) {
    if (!s.behind) return "";
    const late = s.daysLate;
    return '<button class="banner held" data-a="tab" data-v="calendar"><b>' + plural(s.behind, "workout") + " behind</b>" +
      (late ? "At one a day you'd reach the marathon workout on " + dateFull(s.projection.raceProjected) + ", " + plural(late, "day") + " after race day. Two in a day or a Sunday wins days back."
        : "Still on course for race day.") + "</button>";
  }
  function backupBanner() {
    const hasData = Object.keys(st.done).length > 0;
    if (!hasData) return "";
    if (st.lastBackup && E.daysBetween(st.lastBackup, today()) < 7) return "";
    return '<button class="banner act" data-a="tab" data-v="settings"><b>Time to back up</b>Your records are only on this phone. Save a copy to Google Drive.</button>';
  }

  function strengthBlock(day) {
    const minutes = minutesFor(day);
    const w = E.buildWorkout(st, day.idx, minutes, { warmup: !ranToday(day.idx) });
    const sets = w.items.reduce(function (t, it) { return t + it.sets; }, 0);
    const est = Math.round(w.estSeconds / 60);
    let html = "";
    if (w.mobilityOnly) {
      html += '<p class="fitline">Gentle mobility only, about ' + est + " minutes.</p>";
    } else {
      html += '<div class="timepick"><button data-a="minus" data-idx="' + day.idx + '" aria-label="Less time">&minus;</button>' +
        '<div class="val">' + minutes + "<small>min</small></div>" +
        '<button data-a="plus" data-idx="' + day.idx + '" aria-label="More time">+</button></div><div class="quick">' +
        [20, 30, 45, 60].map(function (m) { return '<button class="' + (m === minutes ? "on" : "") + '" data-a="quick" data-idx="' + day.idx + '" data-v="' + m + '">' + m + "</button>"; }).join("") + "</div>";
      let line = "<b>" + plural(w.items.length, "exercise") + ", " + plural(sets, "set") + "</b>, about " + est + " min";
      if (w.tooTight) line += ". This is the least that keeps your posture work, and it runs over.";
      else if (w.maxedOut) line += ". That's all this tier has for today, so you'd finish early.";
      else line += " with warm-up and cool-down.";
      html += '<p class="fitline">' + line + "</p>";
    }
    w.tests.forEach(function (g) {
      const gs = E.groupStatus(st, g);
      html += '<div class="banner act"><b>Test first: ' + esc(gs.name) + "</b>You earned it. Record the test to reach Tier " + (gs.tier + 1) + ".</div>";
    });
    html += '<div class="exlist">';
    w.items.forEach(function (it) {
      html += '<button class="exrow" data-a="howto" data-key="' + it.key + '"><img class="thumb" data-fig="' + it.key + '" alt=""><span class="nm">' + esc(it.name) +
        (it.fixed ? '<span class="tag">POSTURE</span>' : "") + "<small>" + esc(E.GROUPS[it.group]) + " &middot; Tier " + st.tiers[it.group] + "</small></span>" +
        '<span class="dose">' + it.sets + " &times; " + esc(E.fmtDose(it.goal, it.unit)) + "</span></button>";
    });
    html += "</div>";
    w.cool.length && w.mobilityOnly && (html += '<div class="exlist">' + w.cool.map(function (g) {
      return '<button class="exrow" data-a="howto" data-key="' + g.key + '"><span class="nm">' + esc(g.label) + '</span><span class="dose">' + esc(E.fmtDose(g.amount, g.unit)) + "</span></button>";
    }).join("") + "</div>");
    html += '<div class="stack"><button class="btn primary" data-a="start" data-idx="' + day.idx + '">Start workout</button>';
    if (!w.mobilityOnly) html += '<button class="btn ghost" data-a="shuffle" data-idx="' + day.idx + '">Shuffle exercises</button>';
    return html + "</div>";
  }

  function runBlock(day) {
    const r = day.run;
    let target = "";
    if (r.test) target = "Record your mile time.";
    else if (r.miles != null) target = "Target " + r.miles + " mi. Within 10% counts as met.";
    else if (r.minutes != null) target = "Target " + r.minutes + " minutes of run/walk. Within 10% counts as met.";
    return '<div class="eyebrow">Run</div><h3>' + esc(r.title) + '</h3><p class="small" style="margin-bottom:8px">' + esc(r.detail) + "</p>" +
      '<p class="fitline"><b>' + esc(target) + "</b> Record it in MapMyRun, then upload the summary screenshot.</p>" +
      '<div class="stack"><button class="btn primary" data-a="shot" data-idx="' + day.idx + '">Upload MapMyRun screenshot</button>' +
      '<button class="btn ghost" data-a="typeRun" data-idx="' + day.idx + '">No screenshot? Type it in</button></div>';
  }

  function dayCard(day, eyebrow, cls) {
    const dn = st.done[day.idx] || {};
    let html = '<div class="card"><div class="eyebrow ' + (cls || "") + '">' + esc(eyebrow) + "</div><h2>" + esc(day.title) + "</h2>";
    html += '<p class="small" style="margin-bottom:10px">Week ' + day.w + " &middot; " + esc(day.phase) + (day.cutback ? " &middot; Cutback week" : "") + "</p>";
    if (day.note) html += '<p class="small" style="margin-bottom:10px">' + esc(day.note) + "</p>";
    html += "</div>";
    if (day.run) {
      html += '<div class="card">' + (dn.run ? '<div class="eyebrow good">Run done</div><p class="small" style="margin-top:4px">' + esc(day.run.title) + "</p>" : runBlock(day)) + "</div>";
    }
    if (day.strength) {
      html += '<div class="card">' + (dn.strength ? '<div class="eyebrow good">Strength done</div>' : (day.run ? '<div class="eyebrow">Strength</div><div style="height:8px"></div>' : "") + strengthBlock(day)) + "</div>";
    }
    return html;
  }

  function snackCard() {
    const done = st.snacks[today()];
    return '<button class="banner' + (done ? " good" : "") + '" data-a="snack"><b>Posture snack' + (done ? " done" : "") + "</b>" + (done ? "Nice. Back at it tomorrow." : "2 minutes, every day: chin tucks, chest stretch, wall angels.") + "</button>";
  }

  function viewToday() {
    const t = today(), s = E.status(st, t);
    let html = '<div class="head"><div><div class="eyebrow">' + dateLong(t) + "</div><h1>Today</h1></div></div>";
    if (st.active) {
      html += '<button class="banner act" data-a="resumeSession"><b>Resume your workout</b>' + esc(st.active.title) + " is paused where you left it.</button>";
    }
    if (s.head === null) {
      html += '<div class="card"><div class="eyebrow good">Plan complete</div><h2>52 weeks. All done.</h2><p class="small">Every workout in the plan is finished.</p></div>';
      return html + snackCard();
    }
    html += backupBanner();
    if (!s.started) {
      html += '<div class="card"><div class="eyebrow">Training starts ' + dateLong(WB.start) + "</div><h2>Get ready</h2>" +
        '<p class="small" style="margin-bottom:6px">Marathon: ' + dateFull(WB.race) + ". Tick these off before Monday.</p>";
      E.PREP_ITEMS.forEach(function (text, i) {
        html += '<button class="check' + (st.prep[i] ? " on" : "") + '" data-a="prep" data-v="' + i + '"><i></i><span>' + esc(text) + "</span></button>";
      });
      html += "</div>";
      html += '<div class="card"><h3>Try the app first</h3><p class="small" style="margin-bottom:10px">Practice with Monday\'s workout. Nothing is saved.</p><button class="btn" data-a="practice">Practice a workout</button></div>';
      return html + snackCard();
    }
    html += behindBanner(s);
    const head = E.planDay(s.head);
    if (!s.canStart) {
      // Nothing is waiting: today is finished, or it's the rest day.
      const sunday = E.isSunday(t);
      const summary = E.weekSummary(st, Math.max(1, Math.floor(E.daysBetween(WB.start, t) / 7) + 1));
      html += '<div class="card"><div class="eyebrow good">' + (sunday ? "Rest day" : "Done for today") + "</div><h2>" + (sunday ? "Recovery is when you get stronger" : "Nice work") + "</h2>";
      html += '<p class="small">Next: ' + esc(head.title) + " on " + dateLong(head.date) + ".</p></div>";
      if (sunday) {
        html += '<div class="card"><div class="eyebrow">Week ' + summary.w + " review</div>" +
          '<div class="listrow"><span>Workouts done</span><span>' + summary.done + " of " + summary.total + "</span></div>" +
          '<div class="listrow"><span>Miles run</span><span>' + summary.miles.toFixed(1) + (summary.planned ? " of " + summary.planned : "") + "</span></div>" +
          '<div class="listrow"><span>Longest run</span><span>' + summary.longest.toFixed(1) + " mi</span></div>" +
          '<div class="listrow"><span>Exercises that fell short</span><span>' + summary.shorts + "</span></div></div>";
      }
      return html + snackCard();
    }
    let eyebrow = "Today's workout", cls = "";
    if (s.heldFrom) { eyebrow = "Held from " + dateLong(s.heldFrom); cls = "held"; }
    if (E.isSunday(t)) html += '<div class="banner"><b>Today is your rest day</b>You\'re behind, so you can catch up today if you feel up to it. Resting is fine too.</div>';
    else if (doneTodayCount() > 0) html += '<div class="banner good"><b>Today\'s workout is done</b>This next one is optional, to win a day back. Only if you feel good.</div>';
    html += dayCard(head, eyebrow, cls);
    return html + snackCard();
  }

  // ------------------------------------------------------------ calendar
  function viewCalendar() {
    const t = today();
    if (!ui.month) ui.month = (t < WB.start ? WB.start : t).slice(0, 7);
    const parts = ui.month.split("-").map(Number);
    const first = new Date(parts[0], parts[1] - 1, 1);
    const count = new Date(parts[0], parts[1], 0).getDate();
    const proj = E.projection(st, t);
    const doneBy = {};
    Object.keys(st.done).forEach(function (k) {
      const dn = st.done[k], when = {};
      if (dn.run) when[dn.run.date] = 1;
      if (dn.strength) when[dn.strength.date] = 1;
      Object.keys(when).forEach(function (d) { (doneBy[d] = doneBy[d] || []).push(+k); });
    });
    const eventsBy = {};
    st.events.forEach(function (e) { (eventsBy[e.date] = eventsBy[e.date] || []).push(e); });
    const s = E.status(st, t);
    let html = '<div class="head"><div><div class="eyebrow">Marathon ' + dateFull(WB.race) + "</div><h1>Calendar</h1></div></div>";
    html += behindBanner(s);
    html += '<div class="calhead"><button data-a="month" data-v="-1" aria-label="Previous month">&lsaquo;</button><b>' +
      first.toLocaleDateString("en-US", { month: "long", year: "numeric" }) + '</b><button data-a="month" data-v="1" aria-label="Next month">&rsaquo;</button></div>';
    html += '<div class="grid">' + ["S", "M", "T", "W", "T", "F", "S"].map(function (d) { return '<div class="dow">' + d + "</div>"; }).join("");
    for (let i = 0; i < first.getDay(); i++) html += '<div class="cell out"></div>';
    for (let n = 1; n <= count; n++) {
      const date = ui.month + "-" + String(n).padStart(2, "0");
      let pills = "";
      (doneBy[date] || []).forEach(function (idx) {
        const dn = st.done[idx], day = E.planDay(idx);
        const fell = (dn.strength && dn.strength.total && dn.strength.met < dn.strength.total) || (dn.run && dn.run.verdict === "short");
        pills += '<span class="pill ' + (fell ? "short" : "done") + '">' + esc(day.short) + "</span>";
      });
      const offset = E.daysBetween(WB.start, date);
      const planned = offset >= 0 && offset < E.TOTAL_DAYS ? E.planDay(offset) : null;
      if (date >= t) {
        (proj.byDate[date] || []).forEach(function (idx) {
          const day = E.planDay(idx);
          pills += '<span class="pill' + (date === t ? " next" : "") + '">' + esc(day.short) + "</span>";
        });
        if (!pills && planned && planned.rest) pills = '<span class="pill">REST</span>';
      } else if (!pills && planned) {
        pills = planned.rest ? '<span class="pill">REST</span>' : '<span class="pill miss">MISS</span>';
      }
      if (date === WB.race) pills += '<span class="pill race">RACE</span>';
      const marks = (eventsBy[date] || []).length ? '<span class="mark">&#9650;</span>' : "";
      html += '<button class="cell' + (date === t ? " today" : "") + '" data-a="day" data-v="' + date + '"><span class="n">' + n + "</span>" + pills + marks + "</button>";
    }
    html += "</div>";
    html += '<div class="legend"><span class="pill done">DONE</span> met goals <span class="pill short">DONE</span> fell short <span class="pill miss">MISS</span> held <span class="mark">&#9650;</span> level up or finished block</div>';
    return html;
  }

  function dayDetail(date) {
    const t = today(), proj = E.projection(st, t);
    let html = "<h2>" + dateLong(date) + "</h2>";
    const offset = E.daysBetween(WB.start, date);
    const planned = offset >= 0 && offset < E.TOTAL_DAYS ? E.planDay(offset) : null;
    let any = false;
    Object.keys(st.done).forEach(function (k) {
      const dn = st.done[k], day = E.planDay(+k);
      const hit = (dn.run && dn.run.date === date) || (dn.strength && dn.strength.date === date);
      if (!hit) return;
      any = true;
      html += '<div class="listrow"><span><b>Done</b> ' + esc(day.title) + "</span><span>Week " + day.w + "</span></div>";
      st.history.filter(function (h) { return h.idx === +k && h.date === date; }).forEach(function (h) {
        h.items.forEach(function (it) {
          html += '<div class="listrow"><span>' + esc(it.name) + "</span><span>" + (it.result === "met" ? '<span class="ok">Met ' : it.result === "short" ? '<span class="bad">Short ' : "<span>Skipped ") + esc(it.sets.join(", ")) + "</span></span></div>";
        });
      });
      st.runs.filter(function (r) { return r.idx === +k && r.date === date; }).forEach(function (r) {
        html += '<div class="listrow"><span>' + esc(r.title) + "</span><span>" + (r.distanceMi != null ? r.distanceMi + " mi " : "") + (r.durationSec ? E.fmtClock(r.durationSec) : "") + "</span></div>";
      });
    });
    st.events.filter(function (e) { return e.date === date; }).forEach(function (e) {
      any = true;
      html += '<div class="listrow"><span><b>' + esc(eventText(e)) + "</b></span><span></span></div>";
    });
    (proj.byDate[date] || []).forEach(function (idx) {
      any = true;
      const day = E.planDay(idx);
      html += '<div class="listrow"><span><b>' + (date === t ? "Up next" : "Planned") + "</b> " + esc(day.title) + "</span><span>Week " + day.w + "</span></div>";
      if (day.run) html += '<p class="small" style="margin:6px 0 0">' + esc(day.run.title) + "</p>";
      if (day.date < date) html += '<p class="small" style="margin:6px 0 0;color:var(--held)">Moved back from ' + dateLong(day.date) + ".</p>";
    });
    if (!any && planned && planned.rest) html += "<p>Rest day.</p>";
    if (!any && planned && !planned.rest && date < t) html += "<p>" + esc(planned.title) + " was planned here. " + (E.isComplete(st, planned.idx) ? "It was done on a later day." : "It is held until you do it.") + "</p>";
    if (!any && !planned) html += "<p>Outside the plan.</p>";
    html += '<button class="btn" style="margin-top:14px" data-a="closeSheet">Close</button>';
    openSheet(html);
  }
  function eventText(e) {
    if (e.type === "tier") return E.GROUPS[e.group] + " reached Tier " + e.to;
    if (e.type === "week") return "Week " + e.w + " complete";
    if (e.type === "phase") return e.name + " phase complete";
    return "Milestone";
  }

  // ------------------------------------------------------------ progress
  function viewProgress() {
    let html = '<div class="head"><div><h1>Progress</h1></div></div>';
    const doneDays = Object.keys(st.done).filter(function (k) { return E.isComplete(st, +k); }).length;
    const miles = st.runs.reduce(function (t, r) { return t + (r.distanceMi || 0); }, 0);
    const toRace = Math.max(0, E.daysBetween(today(), WB.race));
    html += '<div class="stat"><div><b>' + doneDays + "</b><span>of 312 workouts</span></div><div><b>" + miles.toFixed(1) + "</b><span>miles run</span></div><div><b>" + toRace + "</b><span>days to race</span></div></div>";
    html += '<div class="card"><div class="eyebrow">Tiers</div>';
    E.GROUP_ORDER.forEach(function (g) {
      const gs = E.groupStatus(st, g);
      const pct = gs.needed.length ? Math.round(gs.done / gs.needed.length * 100) : 0;
      html += '<div class="tier"><div class="top"><b>' + esc(gs.name) + '</b><span class="num">Tier ' + gs.tier + " of " + gs.maxTier + "</span></div>";
      if (gs.atTop) html += '<div class="small">Top tier reached.</div>';
      else {
        html += '<div class="bar"><i style="width:' + pct + '%"></i></div>';
        if (gs.testReady) html += '<div class="small"><span class="ok">Test ready.</span> It opens your next ' + esc(gs.name) + " workout.</div>";
        else if (gs.needsPullTier) html += '<div class="small">Goals met. Waiting for Pull to reach Tier ' + gs.needsPullTier + ", to protect your posture.</div>";
        else html += '<div class="small">To earn the test: ' + gs.needed.filter(function (n) { return !n.topped; }).map(function (n) {
          return esc(WB.exercises[n.key].name) + " " + n.goal + " of " + n.hi;
        }).join(", ") + ".</div>";
      }
      html += "</div>";
    });
    html += "</div>";

    const shorts = [];
    st.history.slice().reverse().forEach(function (h) {
      h.items.forEach(function (it) { if (it.result === "short") shorts.push({ date: h.date, it: it }); });
    });
    if (shorts.length) {
      html += '<div class="card"><div class="eyebrow">Fell short</div>' + shorts.slice(0, 8).map(function (x) {
        return '<div class="listrow"><span>' + esc(x.it.name) + "</span><span>" + dateLong(x.date) + ": " + esc(x.it.sets.join(", ")) + " of " + x.it.goal + "</span></div>";
      }).join("") + "</div>";
    }
    if (st.runs.length) {
      html += '<div class="card"><div class="eyebrow">Runs</div>' + st.runs.slice().reverse().slice(0, 10).map(function (r) {
        const word = r.verdict === "met" ? '<span class="ok">Met</span> ' : r.verdict === "short" ? '<span class="bad">Short</span> ' : "";
        return '<div class="listrow"><span>' + dateLong(r.date) + " " + esc(r.target) + "</span><span>" + word + (r.distanceMi != null ? r.distanceMi + " mi " : "") + (r.durationSec ? E.fmtClock(r.durationSec) : "") + "</span></div>";
      }).join("") + "</div>";
    }
    if (st.tests.length) {
      html += '<div class="card"><div class="eyebrow">Checkpoint tests</div>' + st.tests.slice().reverse().map(function (x) {
        const vals = Object.keys(x.results).filter(function (k) { return x.results[k] != null; }).map(function (k) { return x.results[k] + (k === "wall" ? " cm" : ""); }).join(", ");
        return '<div class="listrow"><span>' + esc(E.GROUPS[x.group]) + " to Tier " + x.to + "</span><span>" + dateLong(x.date) + ": " + esc(vals) + "</span></div>";
      }).join("") + "</div>";
    }
    html += '<div class="card"><div class="eyebrow">Posture wall test</div>';
    html += st.wall.slice().reverse().slice(0, 5).map(function (w) { return '<div class="listrow"><span>' + dateLong(w.date) + "</span><span>" + w.cm + " cm</span></div>"; }).join("");
    html += '<p class="small" style="margin:6px 0 10px">' + esc(E.TESTS.pull[1].hint) + '</p><button class="btn" data-a="wallAdd">Record wall test</button></div>';

    html += '<div class="card"><div class="eyebrow">All exercises</div>';
    E.GROUP_ORDER.forEach(function (g) {
      html += '<h3 style="margin-top:12px">' + esc(E.GROUPS[g]) + "</h3>";
      Object.keys(E.LEVELS).filter(function (k) { return E.LEVELS[k].group === g; }).sort(function (a, b) { return E.LEVELS[a].band - E.LEVELS[b].band; }).forEach(function (k) {
        const open = E.isUnlocked(st, k), lv = E.LEVELS[k];
        const tierNo = E.GROUP_BANDS[g].indexOf(lv.band) + 1;
        html += '<button class="listrow" data-a="howto" data-key="' + k + '"><span' + (open ? "" : ' style="color:var(--ink3)"') + ">" + esc(WB.exercises[k].name) + "</span><span>" +
          (open ? (st.topped[k] ? '<span class="ok">Topped</span>' : "Goal " + esc(E.fmtDose(E.goalOf(st, k), lv.unit))) : "Tier " + tierNo) + "</span></button>";
      });
    });
    return html + "</div>";
  }

  // ------------------------------------------------------------ settings
  function viewSettings() {
    const stt = st.settings;
    let html = '<div class="head"><div><h1>Settings</h1></div></div>';
    html += '<div class="card"><div class="eyebrow">Cues</div>' +
      '<button class="switch" data-a="toggle" data-v="voice">Voice<em class="' + (stt.voice ? "on" : "") + '">' + (stt.voice ? "On" : "Off") + "</em></button>" +
      '<button class="switch" data-a="toggle" data-v="beeps">Beeps<em class="' + (stt.beeps ? "on" : "") + '">' + (stt.beeps ? "On" : "Off") + "</em></button>" +
      '<button class="btn" style="margin-top:8px" data-a="testSound">Test sound</button>' +
      '<p class="small" style="margin-top:8px">If you hear nothing, check the iPhone\'s silent switch and volume. Cues stop while the phone is locked, so the app tries to keep the screen on during a workout.</p></div>';
    html += '<div class="card"><div class="eyebrow">Backup</div><p class="small" style="margin:4px 0 10px">Your records are only on this phone. ' +
      (st.lastBackup ? "Last backup: " + dateLong(st.lastBackup) + "." : "No backup yet.") + " Save it to Google Drive through the share menu.</p>" +
      '<div class="stack"><button class="btn primary" data-a="backup" data-v="0">Back up records</button>' +
      '<button class="btn" data-a="backup" data-v="1">Back up with screenshots</button>' +
      '<button class="btn ghost" data-a="restorePick">Restore from a backup</button></div>' +
      '<p class="small" style="margin-top:8px">Screenshot backups grow over the year, and your personal Drive is nearly full. Replace old copies, or back up records only.</p></div>';
    html += '<div class="card"><div class="eyebrow">Start over</div><p class="small" style="margin:4px 0 10px">Erases all records on this phone.</p><button class="btn warn" data-a="resetAsk">Erase everything</button></div>';
    return html;
  }

  // ------------------------------------------------------------ the workout screen
  let ticker = null, lastSave = 0, lastStepSeen = -1;
  function showSession() {
    $("#session").hidden = false;
    document.body.style.overflow = "hidden";
    lastStepSeen = st.active ? st.active.at : -1;
    renderSession();
    clearInterval(ticker);
    ticker = setInterval(tickSession, 200);
    Cues.keepAwake().then(function (ok) {
      if (!ok && !ui.lockWarned) { ui.lockWarned = true; toast("Screen may sleep. Set Auto-Lock to Never during workouts."); }
    });
  }
  function hideSession() {
    clearInterval(ticker);
    ticker = null;
    $("#session").hidden = true;
    $("#session").innerHTML = "";
    document.body.style.overflow = "";
    Cues.letSleep();
    Cues.hush();
  }
  function timeLeftLabel(s, now) {
    const leftBudget = s.budgetSec - RUNNER.activeSeconds(s, now);
    return E.fmtClock(Math.max(0, leftBudget));
  }
  function topBar(s, now) {
    return '<div class="s-top"><button class="pausebtn" data-a="pause">Pause</button><div class="s-bar"><i style="width:' + Math.round(RUNNER.progress(s) * 100) + '%"></i></div><div class="s-clock" id="sClock">' + timeLeftLabel(s, now) + "</div></div>";
  }
  function doseWords(n, unit) {
    return { reps: n === 1 ? "rep" : "reps", side: "each side", sec: "seconds", sec_side: "seconds each side" }[unit] || "";
  }
  function setHeader(s, st0) {
    const it = s.items[st0.item];
    return '<button class="figwrap" data-a="howto" data-key="' + it.key + '" aria-label="How to do it">' + figImg(it.key) + "</button>" +
      '<div class="s-title">' + esc(it.name) + "</div>" +
      '<div class="s-meta">Set ' + st0.set + " of " + it.sets + " &middot; " + esc(E.GROUPS[it.group]) + (it.eased ? " &middot; Eased goal" : "") + "</div>";
  }

  function renderSession() {
    const s = st.active, box = $("#session");
    if (!s) return;
    const now = Date.now(), step = RUNNER.step(s), v = RUNNER.view(s, now);
    let html = "";
    if (step.t === "end") html = endScreen(s);
    else {
      html = topBar(s, now) + '<div class="s-body">';
      if (step.t === "set") html += v.phases ? timedSet(s, step) : repSet(s, step);
      else if (step.t === "rest") html += restScreen(s, step);
      else if (step.t === "guide") html += guideScreen(s, step, v);
      else if (step.t === "test") html += testScreen(s, step, v);
      html += "</div>";
    }
    box.innerHTML = html;
    fillFigs();
    updateClocks();
  }

  function repSet(s, step) {
    const it = s.items[step.item];
    return setHeader(s, step) + '<div class="s-goal"><div class="big">' + it.goal + '</div><div class="lab">' + doseWords(it.goal, it.unit) + " goal</div></div>" +
      '<div class="s-actions stack"><button class="btn primary" data-a="repMet">Met goal</button><div class="row"><button class="btn warn" data-a="repAsk" data-v="short">Fell short</button><button class="btn" data-a="repAsk" data-v="beat">Beat it</button></div>' +
      '<button class="btn ghost" data-a="skipEx">Skip this exercise</button></div>';
  }
  function timedSet(s, step) {
    return setHeader(s, step) + '<div class="s-goal"><div class="big" id="sTime">0</div><div class="lab" id="sPhase"></div></div>' +
      '<div class="s-actions stack"><button class="btn warn" data-a="holdStop">Stopped early</button><button class="btn ghost" data-a="skipEx">Skip this exercise</button></div>';
  }
  function restScreen(s, step) {
    const last = RUNNER.lastSet(s), next = RUNNER.nextWork(s);
    let html = '<div class="ring"><svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="45"/><circle class="fg" id="sRing" cx="50" cy="50" r="45" stroke-dasharray="282.7" stroke-dashoffset="0"/></svg><div class="mid"><b id="sTime">0</b><span>Rest</span></div></div>';
    if (last) {
      const shortBy = last.log.actual < last.item.goal;
      html += '<div class="lastset"><span>Last set: <span class="' + (shortBy ? "bad" : "ok") + '">' + last.log.actual + " of " + last.item.goal + "</span></span>" +
        '<button class="link" data-a="editLast">Change</button></div>';
    }
    html += '<div class="nextup">';
    if (next.type === "set") html += '<img class="thumb" data-fig="' + next.item.key + '" alt=""><div class="nm">Next: ' + esc(next.item.name) + "<small>Set " + next.set + " of " + next.item.sets + " &middot; " + esc(E.fmtDose(next.item.goal, next.item.unit)) + "</small></div>";
    else if (next.type === "guide") html += '<div class="nm">Next: ' + esc(next.label) + "<small>" + (next.phase === "cool" ? "Cool-down" : "Warm-up") + "</small></div>";
    else if (next.type === "test") html += '<div class="nm">Next: ' + esc(next.label) + "<small>Checkpoint test</small></div>";
    else html += '<div class="nm">Last one done<small>Finish up</small></div>';
    html += "</div>";
    html += '<div class="s-actions row" style="margin-top:auto;padding-top:12px"><button class="btn" data-a="restAdd">+15 s</button><button class="btn primary" data-a="restSkip">Skip rest</button></div>';
    return html;
  }
  function guideScreen(s, step, v) {
    const phaseName = step.phase === "cool" ? "Cool-down" : step.phase === "snack" ? "Posture snack" : "Warm-up";
    let html = '<div class="eyebrow" style="margin-top:6px">' + phaseName + "</div>";
    if (step.key) html += '<button class="figwrap" data-a="howto" data-key="' + step.key + '" aria-label="How to do it">' + figImg(step.key) + "</button>";
    html += '<div class="s-title">' + esc(step.label) + "</div>";
    if (step.note) html += '<div class="s-meta">' + esc(step.note) + "</div>";
    if (v.phases) html += '<div class="s-goal"><div class="big" id="sTime">0</div><div class="lab" id="sPhase"></div></div><div class="s-actions stack"><button class="btn" data-a="guideNext">Skip</button>';
    else {
      html += step.unit === "reps" ? '<div class="s-goal"><div class="big">' + step.amount + '</div><div class="lab">reps</div></div>' : '<div class="s-goal"></div>';
      html += '<div class="s-actions stack"><button class="btn primary" data-a="guideNext">Done</button>';
    }
    if (step.phase === "warmup") html += '<button class="btn ghost" data-a="skipWarm">Skip warm-up</button>';
    return html + "</div>";
  }
  function testScreen(s, step, v) {
    const test = step.test;
    let html = '<div class="eyebrow good" style="margin-top:6px">Checkpoint test: ' + esc(E.GROUPS[step.group]) + "</div>";
    html += '<button class="figwrap" data-a="howto" data-key="' + test.ex + '" aria-label="How to do it">' + figImg(test.ex) + "</button>";
    html += '<div class="s-title">' + esc(test.label) + '</div><div class="s-meta">' + esc(test.hint) + "</div>";
    if (test.type === "measure") {
      html += '<label class="field"><span>Gap in centimetres</span><input id="wallCm" inputmode="decimal" type="text" autocomplete="off"></label>' +
        '<div class="s-actions stack"><button class="btn primary" data-a="testMeasure">Save result</button><button class="btn ghost" data-a="testSkipMeasure">Skip, no result to record</button></div>';
      return html;
    }
    const counting = test.type === "maxreps" || (test.type === "timedcount" && s.timedDone);
    if (counting) {
      if (ui.stepper == null) ui.stepper = 10;
      return html + stepperHtml(test.type === "maxreps" ? "How many?" : "How many in 60 seconds?") + '<div class="s-actions"><button class="btn primary" data-a="testSave">Save result</button></div>';
    }
    if (test.type === "timedcount") {
      if (!s.running) return html + '<div class="s-goal"><div class="big">' + test.seconds + '</div><div class="lab">seconds</div></div><div class="s-actions"><button class="btn primary" data-a="testStart">Start</button></div>';
      return html + '<div class="s-goal"><div class="big work" id="sTime">0</div><div class="lab" id="sPhase"></div></div>';
    }
    // maxhold
    if (s.testValue != null) {
      if (ui.stepper == null) ui.stepper = s.testValue;
      return html + stepperHtml("Seconds held") + '<div class="s-actions"><button class="btn primary" data-a="testSave">Save result</button></div>';
    }
    if (s.running) return html + '<div class="s-goal"><div class="big work" id="sCount">0</div><div class="lab">seconds</div></div><div class="s-actions"><button class="btn primary" data-a="testStop">Stop</button></div>';
    return html + '<div class="s-goal"></div><div class="s-actions"><button class="btn primary" data-a="testStart">Start the clock</button></div>';
  }
  function stepperHtml(label) {
    return '<p class="s-meta" style="text-align:center;margin-top:10px">' + esc(label) + '</p><div class="stepper"><button data-a="stepDown" aria-label="Less">&minus;</button><div class="v" id="stepVal">' + ui.stepper + '</div><button data-a="stepUp" aria-label="More">+</button></div>';
  }
  function endScreen(s) {
    const sum = RUNNER.summary(s);
    let html = '<div class="s-body"><div class="eyebrow good" style="margin-top:8px">' + (s.practice ? "Practice finished" : s.kind === "snack" ? "Posture snack done" : "Workout finished") + '</div><div class="s-title">' + esc(s.title) + "</div>";
    if (s.items.length) {
      html += '<div class="stat" style="margin-top:12px"><div><b>' + sum.met + "</b><span>sets met</span></div><div><b>" + sum.short + "</b><span>fell short</span></div><div><b>" + Math.round(RUNNER.activeSeconds(s, Date.now()) / 60) + "</b><span>minutes</span></div></div>";
      html += '<div class="card">' + s.items.map(function (it) {
        const logs = it.logs.filter(Boolean);
        const missing = it.sets - logs.length;
        const allMet = !missing && logs.every(function (l) { return l.actual >= it.goal; });
        const word = it.skipped ? "Skipped" : allMet ? "Met" : "Short";
        const cls = it.skipped ? "" : allMet ? "ok" : "bad";
        return '<div class="listrow"><span>' + esc(it.name) + '</span><span><span class="' + cls + '">' + word + "</span> " + logs.map(function (l) { return l.actual; }).join(", ") + " of " + it.goal + "</span></div>";
      }).join("") + "</div>";
      if (!s.practice) {
        html += '<p class="sub" style="margin-bottom:6px">How hard was it? (optional)</p><div class="effort">';
        for (let n = 1; n <= 10; n++) html += '<button class="' + (ui.effort === n ? "on" : "") + '" data-a="effort" data-v="' + n + '">' + n + "</button>";
        html += "</div>";
      }
    }
    html += '<div class="s-actions" style="margin-top:auto"><button class="btn primary" data-a="finishSave">' + (s.practice ? "Close" : "Save and finish") + "</button></div></div>";
    return html;
  }

  function updateClocks() {
    const s = st.active;
    if (!s) return;
    const now = Date.now(), v = RUNNER.view(s, now);
    const clock = $("#sClock");
    if (clock) clock.textContent = timeLeftLabel(s, now);
    const time = $("#sTime");
    if (time && v.remaining != null) {
      const whole = Math.ceil(v.remaining);
      time.textContent = whole >= 60 ? E.fmtClock(whole) : whole;
      if (v.phase) {
        time.className = time.className.replace(/\b(work|ready)\b/g, "").trim();
        if (v.phase.kind === "work") time.classList.add("work");
        if (v.phase.kind === "ready") time.classList.add("ready");
      }
    }
    const phase = $("#sPhase");
    if (phase && v.phase) phase.textContent = v.phase.label;
    const ring = $("#sRing");
    if (ring && v.total) ring.setAttribute("stroke-dashoffset", String(282.7 * (1 - v.remaining / v.total)));
    const count = $("#sCount");
    if (count) count.textContent = Math.floor(v.elapsed);
  }

  function announce(s) {
    const step = RUNNER.step(s);
    if (step.t === "set") {
      const it = s.items[step.item];
      const dose = E.isSec(it.unit) ? "Hold " + it.goal + " seconds" + (it.unit === "sec_side" ? " each side" : "") : "Goal " + it.goal + (it.unit === "side" ? " each side" : "");
      Cues.say(it.name + ". Set " + step.set + " of " + it.sets + ". " + dose + ".");
    } else if (step.t === "rest") {
      const next = RUNNER.nextWork(s);
      let text = "Rest " + s.restSeconds + " seconds.";
      if (next.type === "set" && next.set === 1) text += " Next, " + next.item.name + ".";
      Cues.say(text);
    } else if (step.t === "guide") {
      Cues.say(step.label + (step.unit === "reps" ? ", " + step.amount + " reps." : "."));
    } else if (step.t === "test") {
      Cues.say("Checkpoint test. " + step.test.label + ".");
    } else if (step.t === "end") {
      Cues.done();
      Cues.say(s.kind === "snack" ? "Posture snack done." : "Workout finished. Well done.");
    }
  }
  function playCue(cue, s) {
    if (cue.type === "count") Cues.tick();
    else if (cue.type === "ten") Cues.say("10 seconds.");
    else if (cue.type === "done") Cues.done();
    else if (cue.type === "phase") {
      if (cue.phase.kind === "work") Cues.go();
      if (cue.phase.label === "Switch sides") Cues.say("Switch sides.");
    }
  }
  function afterChange() {
    const s = st.active;
    if (!s) return;
    if (s.at !== lastStepSeen) { lastStepSeen = s.at; ui.stepper = null; announce(s); }
    save();
    renderSession();
  }
  function tickSession() {
    const s = st.active;
    if (!s) return;
    const now = Date.now();
    const wasPaused = s.pausedAt != null;
    const r = RUNNER.tick(s, now);
    r.cues.forEach(function (c) { playCue(c, s); });
    if (!wasPaused && s.pausedAt != null) { save(); pauseSheet(); return; }
    if (r.changed) { afterChange(); return; }
    if (s.pausedAt == null) updateClocks();
    if (now - lastSave > 5000) { lastSave = now; save(); }
  }

  function pauseSheet() {
    const s = st.active;
    openSheet("<h2>Paused</h2>" + (s.autoPaused ? "<p>The app was closed for a while, so your workout waited for you.</p>" : "<p>Your place and timer are saved.</p>") +
      '<div class="stack"><button class="btn primary" data-a="resume">Resume</button><button class="btn" data-a="exitLater">Exit and resume later</button>' +
      (s.kind === "workout" || s.practice ? '<button class="btn" data-a="finishEarlyAsk">Finish early</button>' : "") + '<button class="btn ghost" data-a="discardAsk">Discard this workout</button></div>', { locked: true });
  }

  function startSession(workout, opts) {
    Cues.unlock();
    st.active = RUNNER.create(workout, Object.assign({ state: st, now: Date.now() }, opts));
    ui.effort = null; ui.stepper = null;
    save();
    showSession();
    announce(st.active);
  }

  function resultsSheet(report, tierUps) {
    let html = "<h2>Saved</h2>";
    (tierUps || []).forEach(function (g) { html += '<div class="banner act"><b>' + esc(E.GROUPS[g]) + " test earned</b>It opens your next " + esc(E.GROUPS[g]) + " workout.</div>"; });
    const rises = report.items.filter(function (i) { return i.result === "met" && i.next > i.goal; });
    const repeats = report.items.filter(function (i) { return i.result === "short"; });
    if (rises.length) html += '<div class="eyebrow good">Goals going up</div>' + rises.map(function (i) { return '<div class="listrow"><span>' + esc(i.name) + "</span><span>" + esc(E.fmtDose(i.next, i.unit)) + "</span></div>"; }).join("");
    if (repeats.length) html += '<div class="eyebrow" style="margin-top:10px">Repeat next time</div>' + repeats.map(function (i) { return '<div class="listrow"><span>' + esc(i.name) + "</span><span>" + esc(E.fmtDose(i.goal, i.unit)) + "</span></div>"; }).join("");
    if (!rises.length && !repeats.length) html += "<p>All logged.</p>";
    html += '<button class="btn primary" style="margin-top:14px" data-a="closeSheet">Done</button>';
    openSheet(html);
  }

  // ------------------------------------------------------------ run screenshot
  function runSheet() {
    const r = ui.run, day = E.planDay(r.idx);
    let html = "<h2>" + esc(day.run.title) + "</h2>";
    if (r.preview) html += '<img class="shot" src="' + r.preview + '" alt="Your screenshot">';
    if (r.status === "reading") {
      html += '<p id="runProgress">Reading your screenshot on this phone&hellip;</p><p class="small">The first read can take a moment.</p>';
    } else {
      if (r.status === "failed") html += '<p class="bad">Could not read that picture. Type the numbers below.</p>';
      else if (r.status === "partial") html += "<p>Check these numbers, and fill in anything missing.</p>";
      else if (r.status === "read") html += "<p>Check these against your screenshot.</p>";
      html += '<div class="row"><label class="field"><span>Distance (mi)</span><input id="runDist" inputmode="decimal" type="text" autocomplete="off" value="' + esc(r.distance) + '"></label>' +
        '<label class="field"><span>Time (h:mm:ss)</span><input id="runTime" inputmode="text" type="text" autocomplete="off" value="' + esc(r.time) + '"></label></div>' +
        '<div class="verdict" id="runVerdict"></div><p class="sub" style="margin-bottom:6px">How hard was it? (optional)</p><div class="effort">';
      for (let n = 1; n <= 10; n++) html += '<button class="' + (r.effort === n ? "on" : "") + '" data-a="runEffort" data-v="' + n + '">' + n + "</button>";
      html += '</div><div class="stack"><button class="btn primary" id="runSave" data-a="runSave">Save run</button><button class="btn ghost" data-a="runCancel">Cancel</button></div>';
    }
    openSheet(html, { locked: true });
    updateRunVerdict();
  }
  function runLogFromFields() {
    const dist = $("#runDist"), time = $("#runTime");
    if (!dist) return null;
    ui.run.distance = dist.value; ui.run.time = time.value;
    const d = parseFloat(dist.value), secs = RunRead.parseTyped(time.value);
    const log = { distanceMi: isNaN(d) ? null : d, durationSec: secs };
    log.paceSec = log.distanceMi && log.durationSec ? Math.round(log.durationSec / log.distanceMi) : null;
    return log;
  }
  function updateRunVerdict() {
    const box = $("#runVerdict");
    if (!box) return;
    const log = runLogFromFields(), day = E.planDay(ui.run.idx);
    const ok = day.run.test ? !!log.durationSec : !!(log.distanceMi || log.durationSec);
    $("#runSave").disabled = !ok;
    if (!ok) { box.className = "verdict"; box.innerHTML = "<b>Waiting for numbers</b>" + (day.run.test ? "Enter your mile time." : "Enter distance or time."); return; }
    const ev = E.evaluateRun(st, day, log);
    const pace = log.paceSec ? "Pace " + E.fmtClock(log.paceSec) + "/mi. " : "";
    if (ev.verdict === "met") { box.className = "verdict met"; box.innerHTML = "<b>Target met</b>" + esc(ev.target) + " target. " + pace + esc(ev.line); }
    else if (ev.verdict === "short") { box.className = "verdict short"; box.innerHTML = "<b>Short of target</b>" + Math.round(ev.pct * 100) + "% of " + esc(ev.target) + ". The day still counts, and this is logged. " + pace + esc(ev.line); }
    else { box.className = "verdict"; box.innerHTML = "<b>Recorded</b>" + pace + esc(ev.line); }
  }
  async function onShot(file) {
    const idx = ui.shotIdx;
    ui.run = { idx: idx, file: file, preview: URL.createObjectURL(file), distance: "", time: "", status: "reading", effort: null };
    runSheet();
    try {
      const parsed = await RunRead.read(file, function (p) {
        const el = $("#runProgress");
        if (el) el.textContent = "Reading your screenshot on this phone: " + Math.round(p * 100) + "%";
      });
      if (!ui.run) return;
      ui.run.distance = parsed.distanceMi != null ? String(parsed.distanceMi) : "";
      ui.run.time = parsed.durationSec != null ? E.fmtClock(parsed.durationSec) : "";
      ui.run.status = parsed.distanceMi != null && parsed.durationSec != null ? "read" : "partial";
    } catch (e) {
      console.error(e);
      if (!ui.run) return;
      ui.run.status = "failed";
    }
    runSheet();
  }
  async function saveRun() {
    const r = ui.run, log = runLogFromFields();
    if (r.effort) log.effort = r.effort;
    if (r.file) {
      try {
        const small = await RunRead.shrink(r.file);
        const id = "run-" + r.idx + "-" + Date.now();
        await Store.putShot(id, small);
        log.shotId = id;
      } catch (e) { console.warn("Screenshot not kept", e); }
    }
    const out = E.completeRun(st, r.idx, log, today());
    save();
    if (r.preview) URL.revokeObjectURL(r.preview);
    ui.run = null;
    closeSheet();
    render();
    toast(out.evaluation.verdict === "met" ? "Run saved: target met." : out.evaluation.verdict === "short" ? "Run saved. Shortfall logged." : "Run saved.");
  }

  // ------------------------------------------------------------ taps
  const actions = {
    tab: function (d) { ui.tab = d.v; if (d.v !== "calendar") ui.month = null; render(); window.scrollTo(0, 0); },
    minus: function (d) { const day = E.planDay(+d.idx); setMinutes(day, minutesFor(day) - 5); },
    plus: function (d) { const day = E.planDay(+d.idx); setMinutes(day, minutesFor(day) + 5); },
    quick: function (d) { setMinutes(E.planDay(+d.idx), +d.v); },
    shuffle: function (d) { E.reshuffle(st, +d.idx); save(); render(); },
    prep: function (d) { st.prep[d.v] = !st.prep[d.v]; save(); render(); },
    start: function (d) {
      const idx = +d.idx, day = E.planDay(idx);
      if (st.active) { toast("Finish or discard your paused workout first."); return; }
      startSession(E.buildWorkout(st, idx, minutesFor(day), { warmup: !ranToday(idx) }), {});
    },
    practice: function () {
      if (st.active) { toast("Finish or discard your paused workout first."); return; }
      startSession(E.buildWorkout(st, 0, 20, { practice: true }), { practice: true });
    },
    snack: function () {
      if (st.active) { toast("Finish or discard your paused workout first."); return; }
      const cool = E.SNACK.map(function (g) { return Object.assign({}, g); });
      startSession({ idx: null, title: "Posture snack", minutes: 3, items: [], warmup: [], tests: [], cool: cool }, { kind: "snack" });
      st.active.steps.forEach(function (x) { if (x.t === "guide") x.phase = "snack"; });
      renderSession();
    },
    resumeSession: function () {
      const s = st.active;
      Cues.unlock();
      if (s.pausedAt == null) RUNNER.pause(s, Math.min(Date.now(), s.lastSeenAt));
      showSession();
      pauseSheet();
    },
    howto: function (d) { howTo(d.key); },
    closeSheet: closeSheet,
    month: function (d) {
      const p = ui.month.split("-").map(Number), dt = new Date(p[0], p[1] - 1 + (+d.v), 1);
      ui.month = E.fromDate(dt).slice(0, 7); render();
    },
    day: function (d) { dayDetail(d.v); },
    shot: function (d) { ui.shotIdx = +d.idx; $("#shotInput").value = ""; $("#shotInput").click(); },
    typeRun: function (d) { ui.run = { idx: +d.idx, file: null, preview: null, distance: "", time: "", status: "typed", effort: null }; runSheet(); },
    runEffort: function (d) { runLogFromFields(); ui.run.effort = +d.v; runSheet(); },
    runSave: saveRun,
    runCancel: function () { if (ui.run && ui.run.preview) URL.revokeObjectURL(ui.run.preview); ui.run = null; closeSheet(); },
    wallAdd: function () {
      openSheet('<h2>Posture wall test</h2><p>' + esc(E.TESTS.pull[1].hint) + '</p><label class="field"><span>Gap in centimetres</span><input id="wallOnly" inputmode="decimal" type="text" autocomplete="off"></label><div class="stack"><button class="btn primary" data-a="wallSave">Save</button><button class="btn ghost" data-a="closeSheet">Cancel</button></div>');
    },
    wallSave: function () {
      const v = parseFloat($("#wallOnly").value);
      if (isNaN(v)) { toast("Enter the gap in centimetres."); return; }
      st.wall.push({ date: today(), cm: v }); save(); closeSheet(); render();
    },
    toggle: function (d) { st.settings[d.v] = !st.settings[d.v]; Cues.setSettings(st.settings); save(); render(); },
    testSound: function () { Cues.unlock(); Cues.tick(); setTimeout(Cues.done, 400); setTimeout(function () { Cues.say("Rest 60 seconds. Next, push-up."); }, 1000); },
    backup: async function (d) {
      const file = await Store.makeBackup(st, d.v === "1");
      ui.backup = file;
      const mb = file.size / 1048576;
      openSheet("<h2>Backup ready</h2><p>" + esc(file.name) + " (" + (mb < 1 ? Math.max(1, Math.round(file.size / 1024)) + " KB" : mb.toFixed(1) + " MB") + "). In the share menu, choose Drive, or Save to Files then Google Drive.</p>" +
        '<div class="stack"><button class="btn primary" data-a="backupSend">Save backup</button><button class="btn ghost" data-a="closeSheet">Cancel</button></div>');
    },
    backupSend: async function () {
      const result = await Store.shareBackup(ui.backup);
      if (result !== "cancelled") { st.lastBackup = today(); save(); closeSheet(); render(); toast("Backup made."); }
    },
    restorePick: function () { $("#restoreInput").value = ""; $("#restoreInput").click(); },
    restoreDo: async function () {
      const p = ui.restore;
      st = Object.assign(E.newState(), p.state, { settings: Object.assign(E.newState().settings, p.state.settings) });
      await Store.applyBackupShots(p);
      Cues.setSettings(st.settings);
      save(); ui.restore = null; closeSheet(); render(); toast("Records restored.");
    },
    resetAsk: function () {
      openSheet('<h2>Erase everything?</h2><p>All workouts, goals, tiers and runs on this phone will be gone. This cannot be undone, unless you have a backup.</p><div class="stack"><button class="btn warn" data-a="resetDo">Erase everything</button><button class="btn ghost" data-a="closeSheet">Cancel</button></div>');
    },
    resetDo: function () { st = E.newState(); Cues.setSettings(st.settings); save(); closeSheet(); render(); toast("Erased."); },

    // ---- during a workout
    pause: function () { RUNNER.pause(st.active, Date.now()); Cues.hush(); save(); pauseSheet(); },
    resume: function () { Cues.unlock(); RUNNER.resume(st.active, Date.now()); save(); closeSheet(); Cues.keepAwake(); renderSession(); },
    exitLater: function () { save(); closeSheet(); hideSession(); render(); },
    finishEarlyAsk: function () {
      const left = RUNNER.summary(st.active).notDone;
      openSheet("<h2>Finish early?</h2><p>The workout will count as complete. " + plural(left, "remaining set") + " will be logged as not done, and those goals will repeat next time.</p>" +
        '<div class="stack"><button class="btn primary" data-a="finishEarly">Finish now</button><button class="btn ghost" data-a="backToPause">Go back</button></div>', { locked: true });
    },
    finishEarly: function () {
      const now = Date.now();
      RUNNER.resume(st.active, now);
      RUNNER.finishEarly(st.active, now);
      closeSheet(); afterChange();
    },
    backToPause: function () { pauseSheet(); },
    discardAsk: function () {
      openSheet("<h2>Discard this workout?</h2><p>Sets from this attempt will be lost. The workout stays in place until you do it.</p>" +
        '<div class="stack"><button class="btn warn" data-a="discard">Discard</button><button class="btn ghost" data-a="backToPause">Go back</button></div>', { locked: true });
    },
    discard: function () { st.active = null; save(); closeSheet(); hideSession(); render(); },
    repMet: function () { const s = st.active, it = s.items[RUNNER.step(s).item]; RUNNER.completeRepSet(s, it.goal, Date.now()); afterChange(); },
    repAsk: function (d) {
      const s = st.active, it = s.items[RUNNER.step(s).item];
      ui.stepper = d.v === "short" ? Math.max(0, it.goal - 1) : it.goal + 1;
      ui.stepperMode = "rep";
      ui.stepperGoal = it.goal;
      openSheet("<h2>" + (d.v === "short" ? "How many did you do?" : "Nice. How many?") + '</h2><p>Goal was ' + it.goal + " " + doseWords(it.goal, it.unit) + ".</p>" + stepperHtml("") +
        '<div class="stack"><button class="btn primary" data-a="repSave">Save</button><button class="btn ghost" data-a="closeSheet">Cancel</button></div>');
    },
    repSave: function () { RUNNER.completeRepSet(st.active, ui.stepper, Date.now()); closeSheet(); afterChange(); },
    holdStop: function () { RUNNER.stopHold(st.active, Date.now()); afterChange(); },
    skipEx: function () {
      openSheet("<h2>Skip this exercise?</h2><p>It will be logged as skipped and its goal stays the same. Sharp, stabbing or joint pain means stop.</p>" +
        '<div class="stack"><button class="btn warn" data-a="skipExDo">Skip it</button><button class="btn ghost" data-a="closeSheet">Keep going</button></div>');
    },
    skipExDo: function () { RUNNER.skipExercise(st.active, Date.now()); closeSheet(); afterChange(); },
    restAdd: function () { RUNNER.addRest(st.active, 15); save(); updateClocks(); },
    restSkip: function () { RUNNER.skipStep(st.active, Date.now()); afterChange(); },
    editLast: function () {
      const last = RUNNER.lastSet(st.active);
      if (!last) return;
      ui.stepper = last.log.actual;
      openSheet("<h2>Change last set</h2><p>" + esc(last.item.name) + ", goal " + last.item.goal + ".</p>" + stepperHtml("") +
        '<div class="stack"><button class="btn primary" data-a="editSave">Save</button><button class="btn ghost" data-a="closeSheet">Cancel</button></div>');
    },
    editSave: function () { RUNNER.editLast(st.active, ui.stepper); ui.stepper = null; save(); closeSheet(); renderSession(); },
    guideNext: function () { RUNNER.skipStep(st.active, Date.now()); afterChange(); },
    skipWarm: function () {
      const s = st.active, now = Date.now();
      while (RUNNER.step(s).t === "guide" && RUNNER.step(s).phase === "warmup") RUNNER.skipStep(s, now);
      afterChange();
    },
    stepUp: function () { ui.stepper = (ui.stepper || 0) + 1; const el = $("#stepVal"); if (el) el.textContent = ui.stepper; },
    stepDown: function () { ui.stepper = Math.max(0, (ui.stepper || 0) - 1); const el = $("#stepVal"); if (el) el.textContent = ui.stepper; },
    testStart: function () { RUNNER.startTestClock(st.active, Date.now()); Cues.go(); save(); renderSession(); },
    testStop: function () { RUNNER.stopTestClock(st.active, Date.now()); Cues.done(); ui.stepper = st.active.testValue; save(); renderSession(); },
    testSave: function () { saveTest(ui.stepper); },
    testMeasure: function () {
      const v = parseFloat($("#wallCm").value);
      if (isNaN(v)) { toast("Enter the gap in centimetres."); return; }
      saveTest(v);
    },
    testSkipMeasure: function () { saveTest(null); },
    effort: function (d) { ui.effort = +d.v; renderSession(); },
    finishSave: function () {
      const s = st.active, now = Date.now(), t = today();
      if (s.kind === "snack") { st.snacks[t] = true; st.active = null; save(); hideSession(); render(); return; }
      const report = E.finishWorkout(st, s, { effort: ui.effort, activeSec: Math.round(RUNNER.activeSeconds(s, now)) }, t);
      st.active = null;
      save(); hideSession(); render();
      if (!report.practice) resultsSheet(report, report.newlyEarned);
    },
  };

  function saveTest(value) {
    const s = st.active, step = RUNNER.step(s), now = Date.now();
    const finished = RUNNER.recordTestValue(s, value, now);
    ui.stepper = null;
    if (finished && !s.practice) {
      const up = E.recordTest(st, finished.group, finished.results, today());
      const names = up.unlocked.map(function (k) { return WB.exercises[k].name; }).join(", ");
      const past = up.previous ? Object.keys(finished.results).filter(function (k) { return up.previous[k] != null && finished.results[k] != null; }).map(function (k) { return (k === "wall" ? "Wall gap" : "Result") + ": " + finished.results[k] + ", last time " + up.previous[k]; }).join(". ") : "";
      Cues.done();
      Cues.say(E.GROUPS[finished.group] + " reached tier " + up.to + ".");
      openSheet("<h2>" + esc(E.GROUPS[finished.group]) + " is now Tier " + up.to + "</h2>" + (past ? "<p>" + esc(past) + ".</p>" : "") + (names ? "<p>New exercises: " + esc(names) + ". They join from your next workout.</p>" : "") +
        '<button class="btn primary" data-a="closeSheet">Keep going</button>');
    }
    afterChange();
  }

  function howTo(key) {
    const e = WB.exercises[key];
    if (!e) return;
    const lv = E.LEVELS[key];
    let html = "<h2>" + esc(e.name) + "</h2>";
    if (lv) html += "<p>" + (E.isUnlocked(st, key) ? "Goal " + esc(E.fmtDose(E.goalOf(st, key), lv.unit)) + ", top " + esc(E.fmtDose(lv.hi, lv.unit)) : "Unlocks at " + esc(E.GROUPS[lv.group]) + " Tier " + (E.GROUP_BANDS[lv.group].indexOf(lv.band) + 1)) + ".</p>";
    html += '<div class="figwrap">' + figImg(key) + "</div>";
    html += "<ol style='margin-top:12px'>" + e.steps.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ol>";
    html += "<ul>" + e.tips.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
    if (e.easier) html += "<p><b>Easier:</b> " + esc(e.easier) + "</p>";
    if (e.harder) html += "<p><b>Harder:</b> " + esc(e.harder) + "</p>";
    html += muscleMap(e.prim, e.sec);
    html += '<p class="small">Main: ' + esc(e.prim.map(function (m) { return WB.muscles[m] || m; }).join(", ")) + (e.sec.length ? ". Also: " + esc(e.sec.map(function (m) { return WB.muscles[m] || m; }).join(", ")) : "") + ".</p>";
    html += '<button class="btn" data-a="closeSheet">Close</button>';
    openSheet(html);
  }

  document.addEventListener("click", function (ev) {
    const el = ev.target.closest("[data-a]");
    if (el) {
      const fn = actions[el.getAttribute("data-a")];
      if (fn) fn(el.dataset, el);
      return;
    }
    const box = $("#sheet");
    if (ev.target === box && box.dataset.locked !== "1") closeSheet();
  });
  document.addEventListener("input", function (ev) {
    if (ev.target && (ev.target.id === "runDist" || ev.target.id === "runTime")) updateRunVerdict();
  });
  $("#shotInput").addEventListener("change", function (ev) { const f = ev.target.files[0]; if (f) onShot(f); });
  $("#restoreInput").addEventListener("change", async function (ev) {
    const f = ev.target.files[0];
    if (!f) return;
    try {
      ui.restore = await Store.readBackup(f);
      const count = Object.keys(ui.restore.state.done || {}).length;
      openSheet("<h2>Restore this backup?</h2><p>Saved " + esc(new Date(ui.restore.savedAt).toLocaleString()) + ", with " + plural(count, "workout day") + ". It replaces everything on this phone now.</p>" +
        '<div class="stack"><button class="btn primary" data-a="restoreDo">Restore</button><button class="btn ghost" data-a="closeSheet">Cancel</button></div>');
    } catch (e) { toast(e.message || "That file could not be read."); }
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && st.active && !$("#session").hidden) { tickSession(); }
    if (document.visibilityState === "hidden") save();
  });

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () { /* the browser decides */ });
  render();
  if (st.active) { st.active.lastSeenAt = Math.min(st.active.lastSeenAt, Date.now()); }
  window.__app = { get state() { return st; }, render: render };
})();

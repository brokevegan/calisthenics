/* Keeps records on the phone: the plan state in localStorage, screenshots in IndexedDB. Backups go out as one file. */
(function (root) {
  "use strict";
  const KEY = "calisthenics.v1";
  const BACKUP_MARK = "calisthenics-app-backup";

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        const fresh = root.Engine.newState();
        return Object.assign(fresh, saved, { settings: Object.assign(fresh.settings, saved.settings) });
      }
    } catch (e) { console.error("Could not read saved records", e); }
    return root.Engine.newState();
  }
  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { console.error("Could not save", e); return false; }
  }

  // ---- screenshots
  function db() {
    return new Promise(function (ok, bad) {
      const r = indexedDB.open("calisthenics", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("shots"); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { bad(r.error); };
    });
  }
  async function tx(mode, work) {
    const d = await db();
    return new Promise(function (ok, bad) {
      const t = d.transaction("shots", mode), s = t.objectStore("shots");
      const req = work(s);
      t.oncomplete = function () { ok(req ? req.result : undefined); d.close(); };
      t.onerror = function () { bad(t.error); d.close(); };
    });
  }
  function putShot(id, blob) { return tx("readwrite", function (s) { return s.put(blob, id); }); }
  function getShot(id) { return tx("readonly", function (s) { return s.get(id); }); }
  function allShotIds() { return tx("readonly", function (s) { return s.getAllKeys(); }); }

  function blobToDataUrl(blob) {
    return new Promise(function (ok, bad) {
      const r = new FileReader();
      r.onload = function () { ok(r.result); };
      r.onerror = function () { bad(r.error); };
      r.readAsDataURL(blob);
    });
  }
  async function dataUrlToBlob(url) { const r = await fetch(url); return r.blob(); }

  // ---- backup
  async function makeBackup(state, withShots) {
    const payload = { mark: BACKUP_MARK, version: 1, savedAt: new Date().toISOString(), state: Object.assign({}, state, { active: state.active }), shots: {} };
    if (withShots) {
      const ids = await allShotIds();
      for (let i = 0; i < ids.length; i++) {
        const blob = await getShot(ids[i]);
        if (blob) payload.shots[ids[i]] = await blobToDataUrl(blob);
      }
    }
    const day = root.Engine.fromDate(new Date());
    const name = "Calisthenics backup " + day + (withShots ? " with screenshots" : "") + ".json";
    return new File([JSON.stringify(payload)], name, { type: "application/json" });
  }
  async function shareBackup(file) {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: file.name }); return "shared"; }
      catch (e) { if (e && e.name === "AbortError") return "cancelled"; }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 20000);
    return "downloaded";
  }
  async function readBackup(file) {
    const payload = JSON.parse(await file.text());
    if (!payload || payload.mark !== BACKUP_MARK || !payload.state) throw new Error("That file is not a backup from this app.");
    return payload;
  }
  async function applyBackupShots(payload) {
    const ids = Object.keys(payload.shots || {});
    for (let i = 0; i < ids.length; i++) await putShot(ids[i], await dataUrlToBlob(payload.shots[ids[i]]));
  }

  root.Store = { load: load, save: save, putShot: putShot, getShot: getShot, makeBackup: makeBackup, shareBackup: shareBackup, readBackup: readBackup, applyBackupShots: applyBackupShots };
})(window);

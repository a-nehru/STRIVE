// Backups of the store (Oct 2026): patient data lives only in this browser's
// localStorage (rehabsuite-v1), so when the site is served by
// tools/launcher.py the game posts the whole store to it, which writes a
// dated file under tools/backups. Same origin, so there is nothing to
// configure; on GitHub Pages the probe 404s and everything here is a no-op.
const KEY = "rehabsuite-v1";
const MIN_GAP_MS = 5 * 60 * 1000;      // a backup at most this often unless forced
let launcher = null;                   // null unknown, false absent, else the health object
let lastAt = 0, lastFile = null;

export async function probeLauncher() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);   // health probes every service: about a second
    const r = await fetch("__strive/health", { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    launcher = r.ok ? await r.json() : false;
  } catch { launcher = false; }
  return launcher;
}
export function launcherReady() { return !!launcher; }
export function launcherInfo() { return launcher || null; }

// post the store; `reason` is for the launcher's log. Returns the result or null.
export async function backupNow(reason = "manual", force = false) {
  if (!launcher) await probeLauncher();      // again if it was missed: the page can load before the launcher answers
  if (!launcher) return null;
  if (!force && Date.now() - lastAt < MIN_GAP_MS) return { ok: true, skipped: true, file: lastFile };
  const store = localStorage.getItem(KEY);
  if (!store) return null;
  try {
    const r = await fetch("__strive/backup", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ store, who: reason }) });
    const j = await r.json();
    if (j.ok) { lastAt = Date.now(); lastFile = j.file; }
    return j;
  } catch { return null; }
}
export async function listBackups() {
  try { const j = await (await fetch("__strive/backups", { cache: "no-store" })).json(); return j.backups || []; }
  catch { return []; }
}
// replace the store with a backup's content and reload; the caller confirms first
export async function restoreBackup(file) {
  const r = await fetch(`__strive/backup?file=${encodeURIComponent(file)}`, { cache: "no-store" });
  if (!r.ok) throw new Error("that backup could not be read");
  const text = await r.text();
  JSON.parse(text);                      // refuse anything that is not JSON
  localStorage.setItem(KEY, text);
  location.reload();
}
export function backupState() {
  if (launcher === false) return "Backups: off (start the game with start_strive.bat)";
  if (!launcher) return "Backups: checking";
  const n = launcher.backups?.count || 0;
  return lastFile ? `Backups: saved ${new Date(lastAt).toLocaleTimeString()} · ${n} on disk`
    : n ? `Backups: ${n} on disk, last ${launcher.backups.last?.replace("T", " ")}` : "Backups: none yet";
}
// every ten minutes while the page is open, and on the page going away
export function startAutoBackup() {
  setInterval(() => backupNow("timer"), 10 * 60 * 1000);
  addEventListener("pagehide", () => {
    const store = localStorage.getItem(KEY);
    if (launcher && store) navigator.sendBeacon?.("__strive/backup", new Blob([JSON.stringify({ store, who: "pagehide" })], { type: "application/json" }));
  });
}

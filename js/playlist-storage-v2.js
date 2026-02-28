/* ===========================
   Playlist storage v2 (shared)
   Used by: manager + player
   =========================== */

const LOCAL_STORAGE_PLAYLISTS_KEY = "dvb-K@8$dL%3vZ&nB1xR*"; // legacy array (migration)
const PLAYLIST_INDEX_KEY_V2 = "xvb.playlists.index.v2";
const PLAYLIST_ITEM_PREFIX_V2 = "xvb.playlists.item.v2.";
const PLAYLIST_MIGRATED_FLAG_V2 = "xvb.playlists.migrated.v2";

function _pl2_makeId() {
  return "pl_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}
function _pl2_itemKey(id) { return PLAYLIST_ITEM_PREFIX_V2 + id; }

function _pl2_getIndex() {
  try {
    const raw = localStorage.getItem(PLAYLIST_INDEX_KEY_V2);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function _pl2_setIndex(arr) {
  localStorage.setItem(PLAYLIST_INDEX_KEY_V2, JSON.stringify(arr || []));
}
function _pl2_writeItem(id, data) {
  localStorage.setItem(_pl2_itemKey(id), JSON.stringify(data));
}
function _pl2_readItem(id) {
  try {
    const raw = localStorage.getItem(_pl2_itemKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function _pl2_guessNameFromUrl(url) {
  try {
    const clean = (url || "").split("#")[0].split("?")[0];
    const last = clean.split("/").filter(Boolean).pop();
    return last || "playlist.m3u";
  } catch { return "playlist.m3u"; }
}

function _pl2_migrateOldArrayIfNeeded() {
  try {
    if (localStorage.getItem(PLAYLIST_MIGRATED_FLAG_V2) === "1") return;

    const oldRaw = localStorage.getItem(LOCAL_STORAGE_PLAYLISTS_KEY);
    if (!oldRaw) {
      localStorage.setItem(PLAYLIST_MIGRATED_FLAG_V2, "1");
      return;
    }

    let oldArr = [];
    try { oldArr = JSON.parse(oldRaw) || []; } catch { oldArr = []; }
    if (!Array.isArray(oldArr) || oldArr.length === 0) {
      localStorage.setItem(PLAYLIST_MIGRATED_FLAG_V2, "1");
      return;
    }

    const idx = _pl2_getIndex();
    const existingUrls = new Set(idx.filter(x => x && x.type === "url").map(x => x.url));

    oldArr.forEach((url) => {
      url = (url || "").trim();
      if (!url || !url.startsWith("http")) return;
      if (existingUrls.has(url)) return;

      const id = _pl2_makeId();
      const name = _pl2_guessNameFromUrl(url);

      idx.push({ id, type: "url", name, url, createdAt: Date.now() });
      _pl2_writeItem(id, { id, type: "url", name, url });

      existingUrls.add(url);
    });

    _pl2_setIndex(idx);
    localStorage.setItem(PLAYLIST_MIGRATED_FLAG_V2, "1");
  } catch {
    // ignore
  }
}

/* ---------- Public API ---------- */

function pl2_listIndex() {
  _pl2_migrateOldArrayIfNeeded();
  return _pl2_getIndex();
}

function pl2_addUrl(url) {
  _pl2_migrateOldArrayIfNeeded();
  url = (url || "").trim();
  if (!url.startsWith("http")) return { ok: false, msg: "Invalid URL" };

  const idx = _pl2_getIndex();
  if (idx.some(x => x && x.type === "url" && x.url === url)) {
    return { ok: false, msg: "Already saved" };
  }

  const id = _pl2_makeId();
  const name = _pl2_guessNameFromUrl(url);

  idx.push({ id, type: "url", name, url, createdAt: Date.now() });
  _pl2_setIndex(idx);
  _pl2_writeItem(id, { id, type: "url", name, url });

  return { ok: true, id };
}

function pl2_addLocal(name, m3uText) {
  _pl2_migrateOldArrayIfNeeded();
  if (!m3uText || typeof m3uText !== "string") return { ok: false, msg: "Empty file" };

  const id = _pl2_makeId();
  const idx = _pl2_getIndex();

  idx.push({ id, type: "local", name: name || "local.m3u", createdAt: Date.now() });
  _pl2_setIndex(idx);
  _pl2_writeItem(id, { id, type: "local", name: name || "local.m3u", m3uText });

  return { ok: true, id };
}

function pl2_remove(id) {
  _pl2_migrateOldArrayIfNeeded();
  const idx = _pl2_getIndex().filter(x => x && x.id !== id);
  _pl2_setIndex(idx);
  localStorage.removeItem(_pl2_itemKey(id));
}

function pl2_clearAll() {
  const idx = _pl2_getIndex();
  idx.forEach(x => x && x.id && localStorage.removeItem(_pl2_itemKey(x.id)));
  localStorage.removeItem(PLAYLIST_INDEX_KEY_V2);
  localStorage.removeItem(PLAYLIST_MIGRATED_FLAG_V2);
  localStorage.removeItem(LOCAL_STORAGE_PLAYLISTS_KEY); // legacy too
}

function pl2_getAllLocalTexts() {
  _pl2_migrateOldArrayIfNeeded();
  const idx = _pl2_getIndex();
  const locals = [];

  idx.forEach(it => {
    if (it && it.type === "local" && it.id) {
      const data = _pl2_readItem(it.id);
      if (data && typeof data.m3uText === "string" && data.m3uText.trim()) {
        locals.push({ name: it.name || data.name || "local.m3u", text: data.m3uText });
      }
    }
  });

  return locals;
}
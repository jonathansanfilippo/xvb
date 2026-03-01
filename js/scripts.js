const LOCAL_STORAGE_PLAYLISTS_KEY = 'dvb-K@8$dL%3vZ&nB1xR*';
const LOCAL_STORAGE_CHANNELS_KEY = 'dvb-m^7Y!zR4*P8&kQ3@h';


/* ===========================
   Playlist storage v2 (individual items)
   - index:  xvb.playlists.index.v2  -> [{id,type,name,url?,createdAt}]
   - item:   xvb.playlists.item.v2.<id> -> {id,type,name,url? , m3uText?}
   This keeps backward compatibility by migrating the old array key:
     dvb-K@8$dL%3vZ&nB1xR*  (LOCAL_STORAGE_PLAYLISTS_KEY)
   =========================== */
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
    return last || clean || "playlist.m3u";
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

function pl2_listIndex() {
  _pl2_migrateOldArrayIfNeeded();
  return _pl2_getIndex();
}

function pl2_addUrl(url) {
  _pl2_migrateOldArrayIfNeeded();
  url = (url || "").trim();
  if (!url.startsWith("http")) return { ok:false, msg:"Invalid URL" };

  const idx = _pl2_getIndex();
  if (idx.some(x => x && x.type === "url" && x.url === url)) return { ok:false, msg:"Already added" };

  const id = _pl2_makeId();
  const name = _pl2_guessNameFromUrl(url);
  idx.push({ id, type:"url", name, url, createdAt: Date.now() });
  _pl2_setIndex(idx);
  _pl2_writeItem(id, { id, type:"url", name, url });

  return { ok:true, id };
}

function pl2_addLocal(name, m3uText) {
  _pl2_migrateOldArrayIfNeeded();
  if (!m3uText || typeof m3uText !== "string") return { ok:false, msg:"Empty file" };

  const id = _pl2_makeId();
  const idx = _pl2_getIndex();
  idx.push({ id, type:"local", name: name || "local.m3u", createdAt: Date.now() });
  _pl2_setIndex(idx);
  _pl2_writeItem(id, { id, type:"local", name: name || "local.m3u", m3uText });

  return { ok:true, id };
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
  // keep legacy removal here too
  localStorage.removeItem(LOCAL_STORAGE_PLAYLISTS_KEY);
}

const DEFAULT_PLAYLISTS = [
  " "
];

const SERVER_PLAYLIST_URL = "";

async function addServerPlaylist() {
  try {
    // Save URL into v2 playlists (individual item)
    pl2_addUrl(SERVER_PLAYLIST_URL);

    // Update PLAYLIST_URLS in RAM
    PLAYLIST_URLS = getAllPlaylistUrls();

    // Refresh
    await refreshAllPlaylists();
    updateServerIconState();

    alert("Server playlist loaded ✅");
  } catch (err) {
    console.error(err);
    alert("Error loading server playlist ❌");
  }
}

function getAllPlaylistUrls() {
  // v2 migration (from legacy array) happens here
  _pl2_migrateOldArrayIfNeeded();

  // 1) Default playlists (if any)
  const defaults = (DEFAULT_PLAYLISTS || []).map(x => (x || "").trim()).filter(Boolean);

  // 2) URLs from v2 index
  const idx = pl2_listIndex();
  const v2Urls = idx
    .filter(x => x && x.type === "url" && typeof x.url === "string")
    .map(x => x.url.trim())
    .filter(Boolean);

  // 3) Fallback: legacy array (in case migration is disabled for some reason)
  let legacy = [];
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_PLAYLISTS_KEY);
    legacy = stored ? JSON.parse(stored) : [];
  } catch { legacy = []; }
  legacy = (Array.isArray(legacy) ? legacy : []).map(x => (x || "").trim()).filter(Boolean);

  return [...new Set([...defaults, ...v2Urls, ...legacy])];
}


function getAllLocalPlaylistsText() {
  _pl2_migrateOldArrayIfNeeded();
  const idx = pl2_listIndex();
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

let PLAYLIST_URLS = getAllPlaylistUrls();

const EPG_URLS = [
  "https://jonathansanfilippo.github.io/xvb-epg/epg.xml",
  "https://raw.githubusercontent.com/jonathansanfilippo/xvb-data/refs/heads/main/data/guides/uk.xml"
];

const serverUrl = "https://render-com-a2ck.onrender.com";
const DEFAULT_TITLE = "XVB";
const UI_BASE_W = 1920;
const UI_BASE_H = 1080;

let allChannels = [];
let epgData = new Map();
let hlsInst = null;
let dashInst = null;
let mpegtsInst = null;
let _playToken = 0;
let hideUiTimer = null;
let epgTimer = null;
let activeChannelName = null;
let activeChannelTvgId = "";
let initialAutoplayDone = false;

const el = {
  video: document.getElementById('videoPlayer'),
  ui: document.getElementById('uiOverlay'),
  cats: document.getElementById('categoryContainer'),
  chans: document.getElementById('channelContainer'),
  epgNow: document.getElementById('epgNowText'),
  epgFill: document.getElementById('epgNowFill'),
  epgNextList: document.getElementById('epgNextList'),
  qBadge: document.getElementById('qualityBadge'),
  online: document.getElementById('online'),
  visitors: document.getElementById('visitors'),
  clock: document.getElementById('sidebarClock')
};

function getGroupFromExtinf(extinfLine, fallback = "Other") {
  const m = String(extinfLine || "").match(/group-title="([^"]*)"/i);
  const g = (m && m[1] != null ? m[1] : "").trim();
  return g || fallback;
}

let activeChannelItemEl = null;

function playNextChannelFromList() {
  if (!el.chans) return false;

  const items = Array.from(el.chans.querySelectorAll('.item'));
  if (!items.length) return false;

  const active = el.chans.querySelector('.item.active') || items[0];
  let startIdx = items.indexOf(active);
  if (startIdx < 0) startIdx = 0;

  for (let i = startIdx + 1; i < items.length; i++) {
    if (!items[i].classList.contains('is-dead')) {
      items[i].click();
      return true;
    }
  }

  for (let i = 0; i <= startIdx; i++) {
    if (!items[i].classList.contains('is-dead')) {
      items[i].click();
      return true;
    }
  }

  return false;
}

function markDeadAndSkip(reason) {
  const cur = activeChannelItemEl || el.chans?.querySelector('.item.active');
  if (cur) {
    cur.classList.add('is-dead');
    cur.title = reason ? `KO: ${reason}` : "KO";
  }

  const ok = playNextChannelFromList();
  if (!ok) {
    showLoadStatus("error", { title: reason || "No working channel found" });
  }
}

const userTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const timeFmt = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: userTZ
});

function fmtTime(d) {
  return d ? timeFmt.format(d) : "--:--";
}

function applyUiScale() {
  document.documentElement.style.setProperty('--ui-scale', "1");
}

let _scaleRaf = null;
function requestUiScale() {
  if (_scaleRaf) cancelAnimationFrame(_scaleRaf);
  _scaleRaf = requestAnimationFrame(() => {
    applyUiScale();
    _scaleRaf = null;
  });
}

window.addEventListener('resize', requestUiScale);
window.addEventListener('orientationchange', requestUiScale);

function updateTabTitle(channelName) {
  // Rimuove i tag HTML (es. <i>Nome</i> -> Nome)
  const cleanName = channelName ? channelName.replace(/<\/?[^>]+(>|$)/g, "").trim() : "";

  if (!cleanName) {
    document.title = DEFAULT_TITLE;
    return;
  }

  document.title = `${cleanName} • ${DEFAULT_TITLE}`;
}

function setPlayPauseIcon(isPlaying) {
  const btn = document.getElementById('playPauseBtn');
  if (!btn) return;
  const icon = btn.querySelector('i');
  if (!icon) return;

  icon.classList.remove('fa-play', 'fa-pause');
  icon.classList.add(isPlaying ? 'fa-pause' : 'fa-play');
}

function initPlayPauseSync() {
  if (!el.video) return;
  el.video.addEventListener("play", () => setPlayPauseIcon(true));
  el.video.addEventListener("pause", () => setPlayPauseIcon(false));
  el.video.addEventListener("ended", () => setPlayPauseIcon(false));
}

function formatSidebarClock(dateObj) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: userTZ
  });

  const parts = fmt.formatToParts(dateObj);
  const get = (type) => parts.find(p => p.type === type)?.value || "";

  let weekday = get("weekday");
  let day = get("day");
  let month = get("month");
  const hour = get("hour");
  const minute = get("minute");

  weekday = weekday.replace('.', '');
  month = month.replace('.', '');

  const cap = (s) => s ? (s.charAt(0).toUpperCase() + s.slice(1)) : s;
  return `${cap(weekday)} ${day} ${cap(month)} ${hour}:${minute}`;
}

function initSidebarClock() {
  if (!el.clock) return;

  const tick = () => {
    el.clock.textContent = formatSidebarClock(new Date());
  };

  tick();
  setInterval(tick, 30000);
}

function formatNumber(num) {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace('.0', '') + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1).replace('.0', '') + 'K';
  return num.toString();
}

function animateCount(element, start, end, duration) {
  if (!element) return;

  const baseColor = "rgba(255,255,255,0.95)";
  const updateColor = "#d7fa5a";
  let startTime = null;

  if (start !== end) {
    element.style.transition = "color 0.3s ease";
    element.style.color = updateColor;
  }

  function animate(timestamp) {
    if (!startTime) startTime = timestamp;
    const progress = Math.min((timestamp - startTime) / duration, 1);
    const current = Math.floor(start + (end - start) * progress);
    element.innerText = formatNumber(current);

    if (progress < 1) requestAnimationFrame(animate);
    else element.style.color = baseColor;
  }

  requestAnimationFrame(animate);
}

function updateOnlineUI(data) {
  if (el.online && data?.onlineUsers !== undefined) {
    const start = Number(el.online.dataset.num || 0);
    const end = Number(data.onlineUsers) || 0;
    animateCount(el.online, start, end, 800);
    el.online.dataset.num = String(end);
  }

  if (el.visitors && data?.uniqueVisitors !== undefined) {
    const start = Number(el.visitors.dataset.num || 0);
    const end = Number(data.uniqueVisitors) || 0;
    animateCount(el.visitors, start, end, 1000);
    el.visitors.dataset.num = String(end);
  }
}

function fetchStatus() {
  fetch(`${serverUrl}/status`)
    .then(r => r.json())
    .then(data => updateOnlineUI(data))
    .catch(err => console.error("Error loading status:", err));
}

function initOnlineUsers() {
  setTimeout(fetchStatus, 2000);
  setInterval(fetchStatus, 60000);

  try {
    if (typeof io !== "function") {
      console.warn("Socket.IO client not loaded (io not found). Using /status polling only.");
      return;
    }

    const socket = io(serverUrl, { transports: ["websocket", "polling"] });
    socket.on('connect', () => console.log('Connected to WebSocket server'));
    socket.on('disconnect', () => console.log('Disconnected from WebSocket server'));
    socket.on('userUpdate', (data) => updateOnlineUI(data));
  } catch (e) {
    console.error("Socket init error:", e);
  }
}

function showQualityBadge(label, opts = {}) {
  if (!el.qBadge) return;

  if (!label) {
    el.qBadge.style.display = "none";
    el.qBadge.innerHTML = "";
    el.qBadge.removeAttribute("data-q");
    return;
  }

  const qKey = opts.key || "custom";
  const iconClass = opts.iconClass || "";

  el.qBadge.style.display = "inline-flex";
  el.qBadge.setAttribute("data-q", qKey);
  el.qBadge.title = opts.title || "";

  el.qBadge.innerHTML = iconClass
    ? `<i style="font-size:28px;" class="${iconClass}" aria-hidden="true"></i>`
    : "";
}

function qualityIconForKey(key) {
  switch (key) {
    case "4k": return "fa-duotone fa-solid fa-rectangle-4k";
    case "hdr": return "fa-duotone fa-solid  fa-rectangle-high-dynamic-range";
    case "hd": return "fa-duotone fa-solid  fa-high-definition";
    case "sd": return "fa-duotone fa-solid  fa-standard-definition";
    default: return "";
  }
}

function keyFromHeight(h) {
  h = Number(h) || 0;
  if (h >= 2160) return "4k";
  if (h >= 1080) return "hdr";
  if (h >= 720) return "hd";
  if (h > 0) return "sd";
  return "";
}

function labelFromHeight(h) {
  h = Number(h) || 0;
  if (h >= 2160) return "4K";
  if (h >= 1080) return "1080p";
  if (h >= 720) return "720p";
  if (h > 0) return h + "p";
  return "AUTO";
}

function showLoadStatus(state, opts = {}) {
  if (!el.qBadge) return;

  const token = opts.token;
  if (token != null && token !== _playToken) return;

  el.qBadge.style.display = "inline-flex";

  if (state === "loading") {
    el.qBadge.setAttribute("data-q", "loading");
    el.qBadge.title = opts.title || "Loading…";
    el.qBadge.innerHTML = `<i class="fa-duotone fa-solid fa-spinner-third fa-spin" aria-hidden="true"></i>`;
    return;
  }

  if (state === "error") {
    el.qBadge.setAttribute("data-q", "error");
    el.qBadge.title = opts.title || "Error";
    el.qBadge.innerHTML = `<i class="fa-regular fa-solid fa-triangle-exclamation" aria-hidden="true"></i>`;
    return;
  }
}

function hideLoadStatus(token) {
  if (!el.qBadge) return;
  if (token != null && token !== _playToken) return;

  const q = el.qBadge.getAttribute("data-q");
  if (q === "loading") {
    el.qBadge.style.display = "none";
    el.qBadge.removeAttribute("data-q");
    el.qBadge.innerHTML = "";
    el.qBadge.title = "";
  }
}

function showRadioBadge() {
  if (!el.qBadge) return;
  el.qBadge.style.display = "inline-flex";
  el.qBadge.setAttribute("data-q", "radio");
  el.qBadge.title = "Audio";
  el.qBadge.innerHTML = `<i style="font-size:28px;" class="fa-duotone fa-solid fa-radio" aria-hidden="true"></i>`;
}

function checkIfAudioOnlyAndShowIcon(token) {
  if (!el.video) return;

  el.video.addEventListener("loadedmetadata", function handler() {
    el.video.removeEventListener("loadedmetadata", handler);

    if (token !== _playToken) return;

    const hasVideoTrack =
      (el.video.videoWidth && el.video.videoWidth > 0) ||
      (el.video.videoHeight && el.video.videoHeight > 0);

    if (!hasVideoTrack) {
      showRadioBadge();
    }
  });
}

let mediaBarTimer = null;

function stopMediaBar() {
  if (mediaBarTimer) {
    clearInterval(mediaBarTimer);
    mediaBarTimer = null;
  }
}

function updateMediaProgressBar() {
  if (!el.video || !el.epgFill) return;

  const v = el.video;
  const d = v.duration;

  if (isFinite(d) && d > 0) {
    const pct = (v.currentTime / d) * 100;
    el.epgFill.style.width = Math.max(0, Math.min(100, pct)) + "%";
    return;
  }

  let bufferedAhead = 0;
  try {
    if (v.buffered && v.buffered.length) {
      const end = v.buffered.end(v.buffered.length - 1);
      bufferedAhead = Math.max(0, end - v.currentTime);
    }
  } catch { }

  const WINDOW = 20;
  const pct = (Math.min(bufferedAhead, WINDOW) / WINDOW) * 100;
  el.epgFill.style.width = Math.max(0, Math.min(100, pct)) + "%";
}

function startMediaBar() {
  stopMediaBar();
  updateMediaProgressBar();
  mediaBarTimer = setInterval(updateMediaProgressBar, 250);
}

function detectQualityFromName(name) {
  const n = (name || "").toUpperCase();
  let h = 0;

  if (n.includes("4K") || n.includes("UHD") || n.includes("2160")) h = 2160;
  else if (n.includes("1080") || n.includes("FHD") || n.includes("HDR")) h = 1080;
  else if (n.includes("720") || n.includes("HD")) h = 720;
  else if (n.includes("SD") || n.includes("480")) h = 480;

  const key = keyFromHeight(h);
  if (key) {
    showQualityBadge(labelFromHeight(h), { key, iconClass: qualityIconForKey(key) });
  } else {
    showQualityBadge("");
  }
}

function updateQualityFromHlsLevel(levelObj) {
  if (!levelObj) return;
  const h = levelObj.height || 0;
  const key = keyFromHeight(h);
  showQualityBadge(labelFromHeight(h), { key, iconClass: qualityIconForKey(key) });
}

function attachHlsQualityListeners(nameForFallback) {
  if (!hlsInst) return;

  hlsInst.on(Hls.Events.MANIFEST_PARSED, () => {
    if (hlsInst.levels && hlsInst.levels.length) {
      const best = hlsInst.levels.reduce(
        (a, b) => ((b.height || 0) > (a.height || 0) ? b : a),
        hlsInst.levels[0]
      );
      updateQualityFromHlsLevel(best);
    } else {
      detectQualityFromName(nameForFallback);
    }
  });

  hlsInst.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
    const lvl = hlsInst.levels?.[data.level];
    updateQualityFromHlsLevel(lvl);
  });

  hlsInst.on(Hls.Events.ERROR, () => detectQualityFromName(nameForFallback));
}

function attachDashQualityListeners(nameForFallback) {
  if (!dashInst) return;
  const ev = dashjs.MediaPlayer.events;

  const update = () => {
    try {
      const q = dashInst.getQualityFor("video");
      const list = dashInst.getBitrateInfoListFor("video") || [];
      const info = list[q];

      if (!info) return detectQualityFromName(nameForFallback);

      const h = info.height || 0;
      const key = keyFromHeight(h);
      showQualityBadge(labelFromHeight(h), { key, iconClass: qualityIconForKey(key) });
    } catch {
      detectQualityFromName(nameForFallback);
    }
  };

  dashInst.on(ev.STREAM_INITIALIZED, update);
  dashInst.on(ev.QUALITY_CHANGE_RENDERED, update);
  dashInst.on(ev.PLAYBACK_STARTED, update);
  dashInst.on(ev.ERROR, () => detectQualityFromName(nameForFallback));
}

/* ---------- EPG ---------- */

function normalizeEPGName(input) {
  if (!input) return "";

  let s = String(input).trim();
  s = s.split("@")[0];
  s = s.split("?")[0].split("#")[0];
  s = s.replace(/\[.*?\]|\(.*?\)/g, " ");
  s = s.replace(/[._\-]+/g, " ");
  s = s.replace(/[^a-zA-Z0-9\s+]/g, " ");

  s = s
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  s = s
    .replace(/\b\+?\s*1\b/g, " plus1")
    .replace(/\bplus\s*1\b/g, " plus1");

  s = s.replace(/\b(uhd|fhd|hdr|hd|sd|1080p|720p|480p|2160p)\b/g, " ");
  s = s.replace(/\b(live|east|west|north|south|central|london|lon|yorks|y and l|wm|ni|wal|scot|se|sw|emid|nwest|sth|westhd|easthd)\b/g, " ");
  s = s.replace(/\b(uk|it|us|gb|row|emea)\b$/g, "").trim();

  s = s
    .replace(/\bbbc\s+one\b/g, "bbc1")
    .replace(/\bbbc\s+two\b/g, "bbc2")
    .replace(/\bbbc\s+three\b/g, "bbc3")
    .replace(/\bbbc\s+four\b/g, "bbc4")
    .replace(/\bbbc\s+news\b/g, "bbcnews")
    .replace(/\bitv\s+one\b/g, "itv1")
    .replace(/\bchannel\s+four\b/g, "channel4")
    .replace(/\bfilm\s*4\b/g, "film4")
    .replace(/\bmore\s*4\b/g, "more4")
    .replace(/\b4\s*seven\b/g, "4seven");

  return s.replace(/[^a-z0-9]/g, "");
}

function epgKeysForChannel({ tvgId = "", name = "" } = {}) {
  const keys = new Set();

  const baseId = String(tvgId || "").trim();
  const baseName = String(name || "").trim();

  if (baseId) {
    keys.add(normalizeEPGName(baseId));
    keys.add(normalizeEPGName(baseId.split("@")[0]));
    keys.add(normalizeEPGName(baseId.replace(/(\.?(uk|it|us|gb))\b/i, "")));
  }

  if (baseName) {
    keys.add(normalizeEPGName(baseName));
  }

  return Array.from(keys).filter(Boolean);
}

function parseXmlDate(s) {
  if (!s) return null;

  const m = s.trim().match(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+\-])(\d{2})(\d{2}))?$/
  );
  if (!m) return null;

  const [_, Y, Mo, D, H, Mi, S, sign, tzh, tzm] = m;
  let offset = "Z";
  if (sign && tzh && tzm) offset = `${sign}${tzh}:${tzm}`;

  return new Date(`${Y}-${Mo}-${D}T${H}:${Mi}:${S}${offset}`);
}

async function fetchEpg() {
  try {
    epgData.clear();

    const results = await Promise.allSettled(
      (EPG_URLS || []).map(async (url) => {
        const bust = (url.includes("?") ? "&" : "?") + "t=" + Date.now();
        const res = await fetch(url + bust, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
        const text = await res.text();
        const xml = new DOMParser().parseFromString(text, "application/xml");
        if (xml.querySelector("parsererror")) throw new Error(`Invalid EPG XML: ${url}`);
        return xml;
      })
    );

    results.forEach(r => {
      if (r.status !== "fulfilled") {
        console.warn("[EPG] load failed:", r.reason);
        return;
      }

      const xml = r.value;
      const programs = Array.from(xml.getElementsByTagName("programme"));

      programs.forEach(p => {
        const channelId = normalizeEPGName(p.getAttribute("channel"));
        if (!channelId) return;

        const start = parseXmlDate(p.getAttribute("start"));
        const stop = parseXmlDate(p.getAttribute("stop"));
        if (!start || !stop) return;

        const title = p.getElementsByTagName("title")[0]?.textContent || "No title";

        if (!epgData.has(channelId)) epgData.set(channelId, []);
        epgData.get(channelId).push({ start, stop, title });
      });
    });

    for (const [k, arr] of epgData.entries()) {
      arr.sort((a, b) => a.start - b.start);
    }

    console.log("✅ EPG loaded. Channels with guide:", epgData.size);
  } catch (e) {
    console.error("EPG error:", e);
  }
}

function updateEPGUI(channelName, tvgId = "") {
  if (!el.epgNow || !el.epgFill || !el.epgNextList) return;

  const overlay = document.querySelector('.epg-overlay');
  const keys = epgKeysForChannel({ tvgId, name: channelName });

  let list = [];

  for (const k of keys) {
    const found = epgData.get(k);
    if (found && found.length) {
      list = found;
      break;
    }
  }

  const now = new Date();
  const current = list.find(p => now >= p.start && now < p.stop);

  if (!current) {
    overlay?.classList.add('media-progress');
    el.epgNow.textContent = "No guide available";
    el.epgNextList.innerHTML =
      "<p class='epg-next-item'><i class='fa-duotone fa-solid fa-circle-info'></i> No guide available.</p>";
    startMediaBar();
    return;
  }

  overlay?.classList.remove('media-progress');
  stopMediaBar();

  el.epgNow.textContent = current.title;

  const total = current.stop - current.start;
  const done = now - current.start;
  const pct = total > 0 ? (done / total) * 100 : 0;
  el.epgFill.style.width = Math.max(0, Math.min(100, pct)) + "%";

  const nextPrograms = list.filter(p => p.start >= now).slice(0, 6);

  el.epgNextList.innerHTML = "";
  if (nextPrograms.length > 0) {
    nextPrograms.forEach(p => {
      const item = document.createElement('p');
      item.className = "epg-next-item";

      const span = document.createElement('span');
      span.textContent = fmtTime(p.start);

      item.appendChild(span);
      item.appendChild(document.createTextNode(" " + p.title));
      el.epgNextList.appendChild(item);
    });
  } else {
    el.epgNextList.innerHTML =
      "<p class='epg-next-item'><i class='fa-duotone fa-solid fa-circle-info'></i> No upcoming events.</p>";
  }
}

/* ---------- Playback ---------- */

function play(ch) {
  const url = String(ch?.url || "");
  const name = String(ch?.name || "");
  const tvgId = String(ch?.tvgId || "");
  const token = ++_playToken;

  const failAndSkip = (msg) => {
    if (token !== _playToken) return;
    markDeadAndSkip(msg || "Stream not available");
  };

  showQualityBadge("");
  showLoadStatus("loading", { token, title: `Loading: ${name || ""}` });
  updateTabTitle(name);

  if (hlsInst) { try { hlsInst.destroy(); } catch { } hlsInst = null; }
  if (dashInst) { try { dashInst.reset(); } catch { } dashInst = null; }
  if (mpegtsInst) {
    try {
      mpegtsInst.pause();
      mpegtsInst.unload();
      mpegtsInst.detachMediaElement();
      mpegtsInst.destroy();
    } catch { }
    mpegtsInst = null;
  }

  el.video.pause();
  el.video.removeAttribute("src");
  el.video.load();

  stopMediaBar();
  document.querySelector('.epg-overlay')?.classList.remove('media-progress');

  checkIfAudioOnlyAndShowIcon(token);

  el.video.onplaying = () => {
    if (token !== _playToken) return;
    hideLoadStatus(token);
  };

  el.video.oncanplay = () => {
    if (token !== _playToken) return;
    hideLoadStatus(token);
  };

  el.video.onwaiting = () => {
    if (token !== _playToken) return;
    showLoadStatus("loading", { token, title: `Buffering: ${name || ""}` });
  };

  el.video.onstalled = () => {
    if (token !== _playToken) return;
    showLoadStatus("loading", { token, title: `Waiting for data: ${name || ""}` });
  };

  el.video.onerror = () => {
    if (token !== _playToken) return;
    const err = el.video?.error;
    const msg = err?.message || (err?.code ? `Video error code ${err.code}` : "Playback error");
    showLoadStatus("error", { token, title: msg });
    failAndSkip(msg);
  };

  activeChannelName = name;
  activeChannelTvgId = tvgId;
  updateEPGUI(name, tvgId);

  clearInterval(epgTimer);
  epgTimer = setInterval(() => {
    if (activeChannelName) updateEPGUI(activeChannelName, activeChannelTvgId);
  }, 15000);

  if (url.includes(".mpd")) {
    dashInst = dashjs.MediaPlayer().create();
    dashInst.initialize(el.video, url, true);
    attachDashQualityListeners(name);

    try {
      dashInst.on(dashjs.MediaPlayer.events.ERROR, () => {
        if (token !== _playToken) return;
        const msg = "DASH error";
        showLoadStatus("error", { token, title: msg });
        failAndSkip(msg);
      });
    } catch { }

  } else if (url.includes(".m3u8")) {
    if (Hls.isSupported()) {
      hlsInst = new Hls();
      hlsInst.loadSource(url);
      hlsInst.attachMedia(el.video);
      attachHlsQualityListeners(name);

      hlsInst.on(Hls.Events.MANIFEST_PARSED, () => {
        if (token !== _playToken) return;
        el.video.play().catch(() => { });
      });

      hlsInst.on(Hls.Events.ERROR, (_, data) => {
        if (token !== _playToken) return;
        if (data?.fatal) {
          const msg = `HLS: ${data?.details || "fatal error"}`;
          showLoadStatus("error", { token, title: msg });
          failAndSkip(msg);
        }
      });

    } else {
      el.video.src = url;
      detectQualityFromName(name);
      el.video.play().catch(() => { });
    }

  } else if (url.includes(".ts") || url.includes("type=m3u_plus")) {
    if (mpegts.getFeatureList().mseLivePlayback) {
      mpegtsInst = mpegts.createPlayer({
      type: "mpegts",
        isLive: true,
        url
      });

      mpegtsInst.attachMediaElement(el.video);
      mpegtsInst.load();
      mpegtsInst.play().catch(e => console.error("TS Play Error:", e));

      detectQualityFromName(name);

      try {
        mpegtsInst.on(mpegts.Events.ERROR, () => {
          if (token !== _playToken) return;
          const msg = "MPEG-TS error";
          showLoadStatus("error", { token, title: msg });
          failAndSkip(msg);
        });
      } catch { }

    } else {
      el.video.src = url;
      el.video.play().catch(() => { });
    }

  } else {
    el.video.src = url;
    detectQualityFromName(name);
    el.video.play().catch(() => { });
  }
}

function updateChannelTypeIcon(groupName) {
  const icon = document.getElementById("channelTypeIcon");
  const textEl = document.getElementById("channelTypeText");
  if (!icon && !textEl) return;

  const isRadio = String(groupName || "").toLowerCase().includes("radio");

  if (icon) {
    icon.className = isRadio ? "fa-solid fa-radio" : "fa-solid fa-tv";
    icon.style.color = "#ffffff8a";
  }

  if (textEl) {
    textEl.textContent = isRadio ? "Radio" : "TV";
  }
}

function updateGroupCount(groupName) {
  const g = String(groupName || "").toLowerCase();
  const isRadioGroup = g.includes("radio");

  let count = 0;
  if (isRadioGroup) {
    count = allChannels.filter(ch =>
      String(ch.group || "").toLowerCase().includes("radio")
    ).length;
  } else {
    count = allChannels.filter(ch =>
      !String(ch.group || "").toLowerCase().includes("radio")
    ).length;
  }

  const elCount = document.getElementById("groupCount");
  if (elCount) elCount.textContent = count;
}


function injectPlaylistManagerButton() {
  try {
    const actions = document.querySelector(".playlist-actions");
    if (!actions) return;
    if (document.getElementById("openManagerBtn")) return;

    const span = document.createElement("span");
    span.className = "hint-btn";
    span.id = "openManagerBtn";
    span.title = "Playlist manager";
    span.style.cursor = "pointer";
    span.innerHTML = `
      <i style="font-size: 18px; cursor: pointer; margin-right: 3px;"
         class="fa-duotone fa-solid fa-list-check"></i>
    `;
    span.onclick = () => window.open("manager.html", "_blank");
    actions.appendChild(span);
  } catch (e) {
    console.warn("Unable to inject manager button", e);
  }
}

function initPlaylistBroadcastListener() {
  try {
    if (!("BroadcastChannel" in window)) return;
    const bc = new BroadcastChannel("xvb_playlists_v2");
    bc.onmessage = async (ev) => {
      if (!ev || !ev.data || ev.data.type !== "changed") return;
      // playlists changed in manager -> rebuild channels
      try {
        localStorage.removeItem(LOCAL_STORAGE_CHANNELS_KEY);
        allChannels = [];
        await refreshAllPlaylists();
        updateGlobalCounts();
        updateServerIconState();
      } catch (e) {
        console.warn("Refresh after playlist change failed", e);
      }
    };
  } catch (e) {
    // ignore
  }
}

async function init() {
  injectPlaylistManagerButton();
  initPlaylistBroadcastListener();
  updateServerIconState();
  applyUiScale();
  updateTabTitle(null);
  initPlayPauseSync();
  initSidebarClock();
  initOnlineUsers();
  await fetchEpg();
  fetchUserIP();

  try {
    const cachedChans = localStorage.getItem(LOCAL_STORAGE_CHANNELS_KEY);
    if (cachedChans) {
      allChannels = JSON.parse(cachedChans);
      console.log("✅ Loaded from cache:", allChannels.length, "channels.");
      renderCats();
    }

    console.log("Refreshing channels from playlist URLs...");
    await refreshAllPlaylists();
    updateGlobalCounts();

  } catch (e) {
    console.error("Critical init error:", e);
  }
}

/* ---------- Playlist loading ---------- */

async function refreshAllPlaylists() {
  const finalUrlsToLoad = getAllPlaylistUrls();
  const localPlaylists = getAllLocalPlaylistsText();
  let hasNew = false;

  // --- Load remote URL playlists ---
  for (let url of finalUrlsToLoad) {
    url = (url || "").trim();
    if (!url) continue;

    // Estraiamo il nome del file dall'URL (es: "xvb-it")
    const fallbackCategory = _pl2_guessNameFromUrl(url).replace(/\.m3u8?$/i, '');

    try {
      const bust = (url.includes("?") ? "&" : "?") + "t=" + Date.now();
      const res = await fetch(url + bust, { cache: "no-store" });
      const text = await res.text();
      const lines = text.split('\n');
      let cur = null;

      lines.forEach(l => {
        l = l.trim();
        if (l.startsWith('#EXTINF:')) {
          const name = l.split(',').pop().trim();
          const logo = (l.match(/tvg-logo="([^"]*)"/i) || [])[1] || "";
          // Fallback al nome del file se group-title è vuoto
          const group = (l.match(/group-title="([^"]*)"/i) || [])[1] || fallbackCategory;
          const tvgId = (l.match(/tvg-id="([^"]*)"/i) || [])[1] || "";
          cur = { name, logo, group, tvgId };
        } else if (l.startsWith('http') && cur) {
          cur.url = l;
          if (!allChannels.some(ch => ch.url === cur.url)) {
            allChannels.push(cur);
            hasNew = true;
          }
          cur = null;
        }
      });
    } catch (err) {
      console.warn("Unable to refresh URL:", url);
    }
  }

  // --- Load local playlists saved in browser (v2) ---
  for (const pl of localPlaylists) {
    const fallbackCategory = (pl.name || "Local").replace(/\.m3u8?$/i, '');

    try {
      const lines = (pl.text || "").split('\n');
      let cur = null;

      lines.forEach(l => {
        l = (l || "").trim();
        if (l.startsWith('#EXTINF:')) {
          const name = l.split(',').pop().trim();
          const logo = (l.match(/tvg-logo="([^"]*)"/i) || [])[1] || "";
          const group = (l.match(/group-title="([^"]*)"/i) || [])[1] || fallbackCategory;
          const tvgId = (l.match(/tvg-id="([^"]*)"/i) || [])[1] || "";
          cur = { name, logo, group, tvgId };
        } else if (l.startsWith('http') && cur) {
          cur.url = l;
          if (!allChannels.some(ch => ch.url === cur.url)) {
            allChannels.push(cur);
            hasNew = true;
          }
          cur = null;
        }
      });
    } catch (e) {
      console.warn("Unable to parse local playlist:", pl && pl.name);
    }
  }

  if (hasNew) {
    saveToCache();
    renderCats();
    updateGlobalCounts();
    updateServerIconState();
  }
}
/* ---------- UI rendering ---------- */

function selectCategory(cat, opts = {}) {
  const { autoplayFirst = false } = opts;

  document.querySelectorAll('#categoryContainer .item').forEach(e => e.classList.remove('active'));

  const catEl = Array.from(document.querySelectorAll('#categoryContainer .item'))
    .find(x => x.textContent.trim() === String(cat).trim());

  if (catEl) catEl.classList.add('active');

  const term = (document.getElementById("channelSearch")?.value || "").trim().toLowerCase();

  if (term) renderChansFiltered(cat, term);
  else renderChans(cat);

  updateGroupCount(cat);
  updateChannelTypeIcon(cat);

  if (autoplayFirst) {
    const firstChannel = el.chans?.querySelector('.item');
    if (firstChannel) firstChannel.click();
  }
}

function renderCats() {
  const cats = [...new Set(allChannels.map(c => c.group))];
  el.cats.innerHTML = "";

  cats.forEach((cat) => {
    const div = document.createElement('div');
    div.className = 'item';
    div.textContent = cat;

    div.onclick = () => {
      selectCategory(cat, { autoplayFirst: false });
    };

    el.cats.appendChild(div);
  });

  if (cats.length) {
    if (!initialAutoplayDone) {
      initialAutoplayDone = true;
      selectCategory(cats[0], { autoplayFirst: true });
    } else {
      selectCategory(cats[0], { autoplayFirst: false });
    }
  }
}

function makeChannelItem(ch) {
  const div = document.createElement('div');
  div.className = 'item';

  div.innerHTML = `
    ${ch.logo
      ? `<img class="item-img" src="${ch.logo}"
             onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';">`
      : `<span class="item-icon"><i class="fa-duotone fa-solid fa-clapperboard-play"></i></span>`
    }
    ${ch.logo
      ? `<span class="item-icon" style="display:none;"><i class="fa-duotone fa-solid fa-clapperboard-play"></i></span>`
      : ""
    }
    <span>${ch.name}</span>
  `;

  div.onclick = () => {
    document.querySelectorAll('#channelContainer .item').forEach(e => e.classList.remove('active'));
    div.classList.add('active');
    activeChannelItemEl = div;

    const n = document.getElementById('activeName');
    const l = document.getElementById('activeLogo');
    if (n) n.textContent = ch.name;
    if (l) {
  const fallback = document.getElementById("activeLogoFallback");

  if (ch.logo) {
    l.src = ch.logo;
    l.style.display = "block";
    if (fallback) fallback.style.display = "none";
  } else {
    l.style.display = "none";
    if (fallback) fallback.style.display = "block";
  }
}

    updateChannelTypeIcon(ch.group);
    play(ch);
  };

  return div;
}

function renderChans(cat) {
  el.chans.innerHTML = "";

  allChannels
    .filter(c => c.group === cat)
    .forEach(ch => el.chans.appendChild(makeChannelItem(ch)));
}

function renderChansFiltered(cat, term) {
  el.chans.innerHTML = "";

  allChannels
    .filter(c => c.group === cat)
    .filter(c => String(c.name).toLowerCase().includes(term))
    .forEach(ch => el.chans.appendChild(makeChannelItem(ch)));
}

function applyGlobalSearch(termRaw) {
  const term = (termRaw || "").trim().toLowerCase();

  if (!term) {
    document.querySelectorAll('#categoryContainer .item').forEach(catEl => {
      catEl.style.display = "";
    });

    const activeCatEl =
      document.querySelector('#categoryContainer .item.active') ||
      document.querySelector('#categoryContainer .item');

    if (activeCatEl) {
      selectCategory(activeCatEl.textContent.trim(), { autoplayFirst: false });
    }
    return;
  }

  const catsWithMatch = new Set(
    allChannels
      .filter(ch => String(ch.name).toLowerCase().includes(term))
      .map(ch => ch.group)
  );

  document.querySelectorAll('#categoryContainer .item').forEach(catEl => {
    const catName = catEl.textContent.trim();
    catEl.style.display = catsWithMatch.has(catName) ? "" : "none";
  });

  const activeCatEl = document.querySelector('#categoryContainer .item.active');
  const activeName = activeCatEl?.textContent.trim();

  if (!activeName || !catsWithMatch.has(activeName)) {
    const firstVisible = Array.from(document.querySelectorAll('#categoryContainer .item'))
      .find(el => el.style.display !== "none");
    if (firstVisible) {
      selectCategory(firstVisible.textContent.trim(), { autoplayFirst: false });
    }
  }

  const currentCat = document.querySelector('#categoryContainer .item.active')?.textContent.trim();
  if (currentCat) renderChansFiltered(currentCat, term);
}

const searchInput = document.getElementById("channelSearch");
if (searchInput) {
  searchInput.addEventListener("input", function () {
    applyGlobalSearch(this.value);
  });
}

function showUI() {
  if (!el.ui) return;
  el.ui.classList.add('visible');
  clearTimeout(hideUiTimer);
  hideUiTimer = setTimeout(() => el.ui.classList.remove('visible'), 5000);
}

document.addEventListener('mousemove', showUI);
document.addEventListener('keydown', showUI);

init();

/* ---------- Add playlist (URL) ---------- */

async function addCustomUrl() {
  const url = prompt("Enter the M3U playlist URL:");
  if (!url || !url.startsWith('http')) return;

  const resAdd = pl2_addUrl(url);
  if (!resAdd.ok) {
    alert(resAdd.msg || "This playlist is already added.");
    return;
  }

  const fallbackCategory = _pl2_guessNameFromUrl(url).replace(/\.m3u8?$/i, '');
  PLAYLIST_URLS = getAllPlaylistUrls();

  try {
    const res = await fetch(url);
    const text = await res.text();
    const lines = text.split('\n');
    let cur = null;
    let added = 0;

    lines.forEach(l => {
      l = l.trim();
      if (l.startsWith('#EXTINF:')) {
        const name = l.split(',').pop().trim();
        const logo = (l.match(/tvg-logo="([^"]*)"/i) || [])[1] || "";
        const group = (l.match(/group-title="([^"]*)"/i) || [])[1] || fallbackCategory;
        const tvgId = (l.match(/tvg-id="([^"]*)"/i) || [])[1] || "";
        cur = { name, logo, group, tvgId };
      } else if (l.startsWith('http') && cur) {
        cur.url = l;
        if (!allChannels.some(ch => ch.url === cur.url)) {
          allChannels.push(cur);
          added++;
        }
        cur = null;
      }
    });

    if (added > 0) {
      saveToCache();
      renderCats();
      updateGlobalCounts();
      updateServerIconState();
      alert(`Added ${added} new channels!`);
    }
  } catch (err) {
    alert("Error loading the URL.");
  }
}
/* ---------- Load local file ---------- */

function loadLocalFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;

    // Save this file into v2 playlists so it can be managed individually
    pl2_addLocal(file.name, text);

    const lines = text.split('\n');
    let cur = null;
    let localChans = [];

    lines.forEach(l => {
      l = l.trim();
      if (l.startsWith('#EXTINF:')) {
        const name = l.split(',').pop().trim();
        const logo = (l.match(/tvg-logo="([^"]*)"/i) || [])[1] || "";
        const group = (l.match(/group-title="([^"]*)"/i) || [])[1] || "Other";
        const tvgId = (l.match(/tvg-id="([^"]*)"/i) || [])[1] || "";
        cur = { name, logo, group, tvgId };
      } else if (l.startsWith('http') && cur) {
        cur.url = l;
        localChans.push(cur);
        cur = null;
      }
    });

    if (localChans.length > 0) {
      allChannels = [...allChannels, ...localChans];
      allChannels = allChannels.filter((v, i, a) => a.findIndex(t => t.url === v.url) === i);

      saveToCache();
      renderCats();
      updateGlobalCounts();
      updateServerIconState();
      alert("Loaded " + localChans.length + " channels from the file.");
    } else {
      updateServerIconState();
      alert("This file doesn't look like a valid M3U playlist.");
    }
  };
  reader.readAsText(file);
}
/* ---------- Clear cache ---------- */

function clearCache() {
  let customCount = 0;
  try {
    // count v2 items (url + local)
    customCount = pl2_listIndex().length;
  } catch (e) { customCount = 0; }

  if (customCount === 0 && (!allChannels || allChannels.length === 0)) {
    alert("You haven't added any playlist yet.");
    return;
  }

  const message = "Warning: this will remove all the playlists you added. Continue? Open Playlist Manager for check your lists.";
  if (confirm(message)) {
    localStorage.removeItem(LOCAL_STORAGE_CHANNELS_KEY);
    pl2_clearAll();
    alert("Added playlists removed. The app will now reload.");
    location.reload();
  }
}
function saveToCache() {
  try {
    localStorage.setItem(LOCAL_STORAGE_CHANNELS_KEY, JSON.stringify(allChannels));
    console.log("💾 Cache updated: " + allChannels.length + " channels saved.");
  } catch (e) {
    console.error("Error saving cache:", e);
  }
}

/* ---------- Clock (top label) ---------- */

function updateDateTime() {
  const now = new Date();
  const options = { hour: '2-digit', minute: '2-digit', hour12: false };
  let formatted = new Intl.DateTimeFormat('en-GB', options).format(now);
  formatted = formatted.replace(',', '');
  if (document.getElementById('current-date')) {
    document.getElementById('current-date').textContent = formatted;
  }
}

updateDateTime();
setInterval(updateDateTime, 60000);

/* ---------- Controls ---------- */

function togglePlay() {
  if (!el.video) return;
  if (el.video.paused) {
    el.video.play().catch(err => console.log("Play blocked:", err));
  } else {
    el.video.pause();
  }
}

function rewind() {
  if (!el.video) return;
  el.video.currentTime = Math.max(0, el.video.currentTime - 10);
}

function forward() {
  if (!el.video) return;
  const d = el.video.duration;
  if (isFinite(d)) {
    el.video.currentTime = Math.min(d, el.video.currentTime + 10);
  } else {
    el.video.currentTime += 10;
  }
}

function toggleFullScreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => { });
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
  }
}

function setupControlListeners() {
  const btnPlay = document.getElementById('playPauseBtn');
  const btnRW = document.getElementById('rewindBtn') || document.querySelector('.fa-backward-step')?.parentElement;
  const btnFF = document.getElementById('forwardBtn') || document.querySelector('.fa-forward-step')?.parentElement;
  const btnFS = document.getElementById('fullScreenBtn') || document.querySelector('.fa-expand')?.parentElement;

  if (btnPlay) btnPlay.onclick = (e) => { e.stopPropagation(); togglePlay(); };
  if (btnRW) btnRW.onclick = (e) => { e.stopPropagation(); rewind(); };
  if (btnFF) btnFF.onclick = (e) => { e.stopPropagation(); forward(); };
  if (btnFS) btnFS.onclick = (e) => { e.stopPropagation(); toggleFullScreen(); };

  console.log("Player listeners: attached ✅");
}

function changeVolume(val) {
  if (!el.video) return;
  const volumeValue = parseFloat(val);
  el.video.volume = volumeValue;

  const muteBtnIcon = document.querySelector('#muteBtn i');
  if (muteBtnIcon) {
    muteBtnIcon.className =
      volumeValue === 0 ? "fa-duotone fa-solid fa-volume-xmark" :
      volumeValue < 0.5 ? "fa-duotone fa-solid fa-volume-low" :
      "fa-duotone fa-solid fa-volume-high";
  }
}

function toggleMute() {
  if (!el.video) return;
  el.video.muted = !el.video.muted;
  const volSlider = document.getElementById('volumeSlider');

  if (el.video.muted) {
    changeVolume(0);
    if (volSlider) volSlider.value = 0;
  } else {
    const lastVol = el.video.dataset.lastVol || 1;
    changeVolume(lastVol);
    if (volSlider) volSlider.value = lastVol;
  }
}

function initVolumeYT() {
  const muteBtn = document.getElementById('muteBtn');
  const volSlider = document.getElementById('volumeSlider');

  if (muteBtn) muteBtn.onclick = (e) => { e.stopPropagation(); toggleMute(); };

  if (volSlider) {
    volSlider.oninput = (e) => {
      const v = e.target.value;
      el.video.dataset.lastVol = v;
      el.video.muted = (v == 0);
      changeVolume(v);
    };
  }
}

/* ---------- Counts ---------- */

function updateGlobalCounts() {
  if (!Array.isArray(allChannels)) return;

  const totalRadio = allChannels.filter(ch =>
    String(ch.group || "").toLowerCase().includes("radio")
  ).length;

  const totalTv = allChannels.length - totalRadio;
  const totalAll = allChannels.length;

  const elTv = document.getElementById("totalTv");
  const elRadio = document.getElementById("totalRadio");
  const elAll = document.getElementById("totalAll");

  if (elTv) elTv.textContent = totalTv;
  if (elRadio) elRadio.textContent = totalRadio;
  if (elAll) elAll.textContent = totalAll;
}

/* ---------- EPG UK time (server text) ---------- */

async function fetchEpgUkTime() {
  try {
    const url = "https://raw.githubusercontent.com/jonathansanfilippo/xvb-data/refs/heads/main/data/log/epg";

    const response = await fetch(url + "?t=" + Date.now(), { cache: "no-store" });
    if (!response.ok) throw new Error("Fetch error");

    const time = (await response.text()).trim();
    document.getElementById("epg-uk-time").textContent = time;

  } catch (error) {
    console.error(error);
    document.getElementById("epg-uk-time").textContent = "--:--";
  }
}

fetchEpgUkTime();
setInterval(fetchEpgUkTime, 60000);

/* ---------- Server icon state ---------- */

function updateServerIconState() {
  const icon = document.getElementById("serverListIcon");
  if (!icon) return;

  // Check v2 playlists
  let idx = [];
  try { idx = pl2_listIndex(); } catch { idx = []; }
  const v2HasAny = Array.isArray(idx) && idx.length > 0;
  const hasServer = Array.isArray(idx) && idx.some(x => x && x.type === "url" && x.url === SERVER_PLAYLIST_URL);

  const hasAnyChannels = Array.isArray(allChannels) && allChannels.length > 0;

  // Visual state:
  // - if server playlist is present -> highlight icon
  // - if any playlist or channels -> slightly brighter
  if (hasServer) {
    icon.style.color = "rgb(255,255,255)";
    icon.style.opacity = "0.8";
  } else if (v2HasAny || hasAnyChannels) {
    icon.style.color = "rgb(255,255,255)";
    icon.style.opacity = "0.8";
  } else {
    icon.style.color = "rgb(255,255,255)";
    icon.style.opacity = "0.8";
  }
}



function fetchUserIP() {
    const ipDisplay = document.getElementById('userIpText');
    
    // Creiamo una funzione globale che ipinfo chiamerà appena risponde
    window.ipInfoCallback = function(data) {
        const country = data.country || "??";
        const ip = data.ip || "0.0.0.0";
        
        console.log("XVB Legacy Data:", country, ip);
        
        if (ipDisplay) {
            ipDisplay.textContent = `${country}`;
        }
        
        // Pulizia: rimuoviamo lo script dopo l'uso
        const oldScript = document.getElementById('ipinfo-script');
        if (oldScript) oldScript.remove();
    };

    // Creiamo lo script per chiamare ipinfo via JSONP (bypass CORS)
    const script = document.createElement('script');
    script.id = 'ipinfo-script';
    // Nota: aggiungiamo ?callback=ipInfoCallback per attivare il bypass
    script.src = 'https://ipinfo.io/json?callback=ipInfoCallback';
    
    script.onerror = function() {
        console.error("Failed to load IP info");
        if (ipDisplay) ipDisplay.textContent = "Unavailable";
    };

    document.body.appendChild(script);
}



/* ---------- Navigazione Canali con Frecce Su/Giù ---------- */

document.addEventListener('keydown', (e) => {
    // Evitiamo di cambiare canale se l'utente sta scrivendo nella barra di ricerca
    if (document.activeElement.tagName === 'INPUT') return;

    if (e.key === 'ArrowUp') {
        e.preventDefault();
        playPreviousChannel();
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        playNextChannel();
    }
});

function playNextChannel() {
    const items = Array.from(document.querySelectorAll('#channelContainer .item'));
    if (!items.length) return;

    const active = document.querySelector('#channelContainer .item.active');
    let nextIdx = 0;

    if (active) {
        nextIdx = items.indexOf(active) + 1;
        if (nextIdx >= items.length) nextIdx = 0; // Torna al primo
    }
    
    items[nextIdx].click();
    items[nextIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function playPreviousChannel() {
    const items = Array.from(document.querySelectorAll('#channelContainer .item'));
    if (!items.length) return;

    const active = document.querySelector('#channelContainer .item.active');
    let prevIdx = items.length - 1;

    if (active) {
        prevIdx = items.indexOf(active) - 1;
        if (prevIdx < 0) prevIdx = items.length - 1; // Torna all'ultimo
    }

    items[prevIdx].click();
    items[prevIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}



let mouseTimer;
const wrapper = document.querySelector('.ui-wrapper');
const leftSide = document.querySelector('.sidebar-left');
const rightSide = document.querySelector('.sidebar-right');

// Mostra tutto al movimento del mouse
document.addEventListener('mousemove', () => {
    wrapper.classList.add('visible');
    
    // Resetta il timer: se stai muovendo il mouse non deve sparire
    clearTimeout(mouseTimer);
    
    // Se il mouse è fermo per 3 secondi, toglie la classe .visible
    mouseTimer = setTimeout(() => {
        // Non nascondere se il mouse è sopra una sidebar
        if (!leftSide.matches(':hover') && !rightSide.matches(':hover')) {
            wrapper.classList.remove('visible');
        }
    }, 3000);
});

// Gestione sfumature specifiche (Left/Right)
leftSide.addEventListener('mouseenter', () => wrapper.classList.add('active-left'));
leftSide.addEventListener('mouseleave', () => wrapper.classList.remove('active-left'));

rightSide.addEventListener('mouseenter', () => wrapper.classList.add('active-right'));
rightSide.addEventListener('mouseleave', () => wrapper.classList.remove('active-right'));









function updatePlaylistCount() {
  try {
    // v2 (nuovo sistema)
    let v2 = [];
    try {
      const rawV2 = localStorage.getItem(PLAYLIST_INDEX_KEY_V2);
      const arrV2 = rawV2 ? JSON.parse(rawV2) : [];
      v2 = Array.isArray(arrV2) ? arrV2 : [];
    } catch { v2 = []; }

    // legacy (vecchio sistema)
    let legacy = [];
    try {
      const rawOld = localStorage.getItem(LOCAL_STORAGE_PLAYLISTS_KEY);
      const arrOld = rawOld ? JSON.parse(rawOld) : [];
      legacy = Array.isArray(arrOld) ? arrOld : [];
    } catch { legacy = []; }

    // unisco senza duplicati
    const set = new Set();

    for (const it of v2) {
      if (!it) continue;
      if (it.type === "url" && it.url) set.add("url:" + it.url);
      else if (it.type === "local" && it.id) set.add("local:" + it.id);
      else if (it.name) set.add("name:" + it.name);
    }

    for (const url of legacy) {
      if (!url) continue;
      set.add("url:" + String(url).trim());
    }

    const el = document.getElementById("playlistCount");
    if (el) el.textContent = String(set.size);
  } catch (e) {
    console.warn("Playlist count error", e);
  }
}

// 1) conta quando la pagina è pronta
document.addEventListener("DOMContentLoaded", () => {
  updatePlaylistCount();
});

// 2) conta quando cambi dal manager (add/remove)
if ("BroadcastChannel" in window) {
  const bc = new BroadcastChannel("xvb_playlists_v2");
  bc.onmessage = () => updatePlaylistCount();
}

// 3) conta anche quando usi i bottoni vecchi nel player
document.addEventListener("click", () => {
  setTimeout(updatePlaylistCount, 150);
}, true);


function showLogoFallback() {
  const img = document.getElementById("activeLogo");
  const fallback = document.getElementById("activeLogoFallback");

  if (img) img.style.display = "none";
  if (fallback) fallback.style.display = "block";
}

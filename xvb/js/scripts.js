const LOCAL_STORAGE_PLAYLISTS_KEY = "dvb-K@8$dL%3vZ&nB1xR*";
const LOCAL_STORAGE_CHANNELS_KEY = "xvb.channels.cache.v1";
const LEGACY_CHANNELS_KEY = "dvb-m^7Y!zR4*P8&kQ3@h";

const PLAYLIST_INDEX_KEY_V2 = "xvb.playlists.index.v2";
const PLAYLIST_ITEM_PREFIX_V2 = "xvb.playlists.item.v2.";
const PLAYLIST_MIGRATED_FLAG_V2 = "xvb.playlists.migrated.v2";

const DEFAULT_PLAYLISTS = [""];
const SERVER_PLAYLIST_URL = "";

const EPG_URLS = ["https://jonathansanfilippo.github.io/xvb-epg/epg.xml", "https://raw.githubusercontent.com/matthuisman/i.mjh.nz/master/PlutoTV/it.xml" , "https://raw.githubusercontent.com/matthuisman/i.mjh.nz/refs/heads/master/SamsungTVPlus/it.xml"];

const serverUrl = "https://render-com-a2ck.onrender.com";
const DEFAULT_TITLE = "XVB";
const UI_BASE_W = 1920;
const UI_BASE_H = 1080;

let PLAYLIST_URLS = [];
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
let activeChannelItemEl = null;

const el = {
  video: document.getElementById("videoPlayer"),
  ui: document.getElementById("uiOverlay"),
  cats: document.getElementById("categoryContainer"),
  chans: document.getElementById("channelContainer"),
  epgNow: document.getElementById("epgNowText"),
  epgFill: document.getElementById("epgNowFill"),
  epgNextList: document.getElementById("epgNextList"),
  qBadge: document.getElementById("qualityBadge"),
  online: document.getElementById("online"),
  visitors: document.getElementById("visitors"),
  clock: document.getElementById("sidebarClock"),
};

function _pl2_makeId() {
  return "pl_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}
function _pl2_itemKey(id) {
  return PLAYLIST_ITEM_PREFIX_V2 + id;
}
function _pl2_getIndex() {
  try {
    const raw = localStorage.getItem(PLAYLIST_INDEX_KEY_V2);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
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
  } catch {
    return null;
  }
}
function _pl2_guessNameFromUrl(url) {
  try {
    const clean = (url || "").split("#")[0].split("?")[0];
    const last = clean.split("/").filter(Boolean).pop();
    return last || clean || "playlist.m3u";
  } catch {
    return "playlist.m3u";
  }
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
    try {
      oldArr = JSON.parse(oldRaw) || [];
    } catch {
      oldArr = [];
    }
    if (!Array.isArray(oldArr) || oldArr.length === 0) {
      localStorage.setItem(PLAYLIST_MIGRATED_FLAG_V2, "1");
      return;
    }

    const idx = _pl2_getIndex();
    const existingUrls = new Set(idx.filter((x) => x && x.type === "url").map((x) => x.url));

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
  } catch {}
}

function pl2_listIndex() {
  _pl2_migrateOldArrayIfNeeded();
  return _pl2_getIndex();
}
function pl2_addUrl(url) {
  _pl2_migrateOldArrayIfNeeded();
  url = (url || "").trim();
  if (!url.startsWith("http")) return { ok: false, msg: "Invalid URL" };

  const idx = _pl2_getIndex();
  if (idx.some((x) => x && x.type === "url" && x.url === url)) return { ok: false, msg: "Already added" };

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
  const idx = _pl2_getIndex().filter((x) => x && x.id !== id);
  _pl2_setIndex(idx);
  localStorage.removeItem(_pl2_itemKey(id));
}
function pl2_clearAll() {
  const idx = _pl2_getIndex();
  idx.forEach((x) => x && x.id && localStorage.removeItem(_pl2_itemKey(x.id)));
  localStorage.removeItem(PLAYLIST_INDEX_KEY_V2);
  localStorage.removeItem(PLAYLIST_MIGRATED_FLAG_V2);
  localStorage.removeItem(LOCAL_STORAGE_PLAYLISTS_KEY);
}

function getAllPlaylistUrls() {
  _pl2_migrateOldArrayIfNeeded();

  const defaults = (DEFAULT_PLAYLISTS || []).map((x) => (x || "").trim()).filter(Boolean);

  const idx = pl2_listIndex();
  const v2Urls = idx
    .filter((x) => x && x.type === "url" && typeof x.url === "string")
    .map((x) => x.url.trim())
    .filter(Boolean);

  let legacy = [];
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_PLAYLISTS_KEY);
    legacy = stored ? JSON.parse(stored) : [];
  } catch {
    legacy = [];
  }
  legacy = (Array.isArray(legacy) ? legacy : []).map((x) => (x || "").trim()).filter(Boolean);

  return [...new Set([...defaults, ...v2Urls, ...legacy])];
}

function getAllLocalPlaylistsText() {
  _pl2_migrateOldArrayIfNeeded();
  const idx = pl2_listIndex();
  const locals = [];
  idx.forEach((it) => {
    if (it && it.type === "local" && it.id) {
      const data = _pl2_readItem(it.id);
      if (data && typeof data.m3uText === "string" && data.m3uText.trim()) {
        locals.push({ name: it.name || data.name || "local.m3u", text: data.m3uText });
      }
    }
  });
  return locals;
}

async function addServerPlaylist() {
  try {
    pl2_addUrl(SERVER_PLAYLIST_URL);
    PLAYLIST_URLS = getAllPlaylistUrls();
    await refreshAllPlaylists();
    updateServerIconState();
    alert("Server playlist loaded ✅");
  } catch (err) {
    console.error(err);
    alert("Error loading server playlist ❌");
  }
}

function readChannelsCache() {
  const raw =
    localStorage.getItem(LOCAL_STORAGE_CHANNELS_KEY) ||
    localStorage.getItem(LEGACY_CHANNELS_KEY);

  if (!raw) return null;

  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}
function writeChannelsCache(arr) {
  try {
    localStorage.setItem(LOCAL_STORAGE_CHANNELS_KEY, JSON.stringify(arr || []));
  } catch {}
}
function clearChannelsCache() {
  try {
    localStorage.removeItem(LOCAL_STORAGE_CHANNELS_KEY);
    localStorage.removeItem(LEGACY_CHANNELS_KEY);
  } catch {}
}

const userTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: userTZ });

function fmtTime(d) {
  return d ? timeFmt.format(d) : "--:--";
}

function applyUiScale() {
  document.documentElement.style.setProperty("--ui-scale", "1");
}

let _scaleRaf = null;
function requestUiScale() {
  if (_scaleRaf) cancelAnimationFrame(_scaleRaf);
  _scaleRaf = requestAnimationFrame(() => {
    applyUiScale();
    _scaleRaf = null;
  });
}
window.addEventListener("resize", requestUiScale);
window.addEventListener("orientationchange", requestUiScale);

function updateTabTitle(channelName) {
  const cleanName = channelName ? channelName.replace(/<\/?[^>]+(>|$)/g, "").trim() : "";
  document.title = cleanName ? `${cleanName} • ${DEFAULT_TITLE}` : DEFAULT_TITLE;
}

function setPlayPauseIcon(isPlaying) {
  const btn = document.getElementById("playPauseBtn");
  if (!btn) return;
  const icon = btn.querySelector("i");
  if (!icon) return;
  icon.classList.remove("fa-play", "fa-pause");
  icon.classList.add(isPlaying ? "fa-pause" : "fa-play");
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
    timeZone: userTZ,
  });

  const parts = fmt.formatToParts(dateObj);
  const get = (type) => parts.find((p) => p.type === type)?.value || "";

  let weekday = get("weekday").replace(".", "");
  let day = get("day");
  let month = get("month").replace(".", "");
  const hour = get("hour");
  const minute = get("minute");

  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  return `${cap(weekday)} ${day} ${cap(month)} ${hour}:${minute}`;
}

function initSidebarClock() {
  if (!el.clock) return;
  const tick = () => (el.clock.textContent = formatSidebarClock(new Date()));
  tick();
  setInterval(tick, 30000);
}

function formatNumber(num) {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(".0", "") + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1).replace(".0", "") + "K";
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
    .then((r) => r.json())
    .then((data) => updateOnlineUI(data))
    .catch((err) => console.error("Error loading status:", err));
}

function initOnlineUsers() {
  setTimeout(fetchStatus, 2000);
  setInterval(fetchStatus, 60000);

  try {
    if (typeof io !== "function") return;
    const socket = io(serverUrl, { transports: ["websocket", "polling"] });
    socket.on("userUpdate", (data) => updateOnlineUI(data));
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
  el.qBadge.innerHTML = iconClass ? `<i style="font-size:28px;" class="${iconClass}" aria-hidden="true"></i>` : "";
}

function qualityIconForKey(key) {
  switch (key) {
    case "4k":
      return "fa-solid fa-rectangle-4k";
    case "hdr":
      return "fa-solid  fa-rectangle-high-dynamic-range";
    case "hd":
      return "fa-solid  fa-high-definition";
    case "sd":
      return "fa-solid  fa-standard-definition";
    default:
      return "";
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
    el.qBadge.innerHTML = `<i class="fa-solid fa-spinner-third fa-spin" aria-hidden="true"></i>`;
    return;
  }

  if (state === "error") {
    el.qBadge.setAttribute("data-q", "error");
    el.qBadge.title = opts.title || "Error";
    el.qBadge.innerHTML = `<i class="fa-regular fa-solid fa-triangle-exclamation" aria-hidden="true"></i>`;
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
  el.qBadge.innerHTML = `<i style="font-size:28px;" class="fa-solid fa-radio" aria-hidden="true"></i>`;
}

function checkIfAudioOnlyAndShowIcon(token) {
  if (!el.video) return;

  el.video.addEventListener("loadedmetadata", function handler() {
    el.video.removeEventListener("loadedmetadata", handler);
    if (token !== _playToken) return;

    const hasVideoTrack =
      (el.video.videoWidth && el.video.videoWidth > 0) || (el.video.videoHeight && el.video.videoHeight > 0);

    if (!hasVideoTrack) showRadioBadge();
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
  } catch {}

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
  if (key) showQualityBadge(labelFromHeight(h), { key, iconClass: qualityIconForKey(key) });
  else showQualityBadge("");
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
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  s = s.replace(/\b\+?\s*1\b/g, " plus1").replace(/\bplus\s*1\b/g, " plus1");

  s = s.replace(/\b(uhd|fhd|hdr|hd|sd|1080p|720p|480p|2160p)\b/g, " ");
  s = s.replace(
    /\b(live|east|west|north|south|central|london|lon|yorks|y and l|wm|ni|wal|scot|se|sw|emid|nwest|sth|westhd|easthd)\b/g,
    " "
  );
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

  if (baseName) keys.add(normalizeEPGName(baseName));

  return Array.from(keys).filter(Boolean);
}

function parseXmlDate(s) {
  if (!s) return null;

  const m = s
    .trim()
    .match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+\-])(\d{2})(\d{2}))?$/);
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

    results.forEach((r) => {
      if (r.status !== "fulfilled") return;

      const xml = r.value;
      const programs = Array.from(xml.getElementsByTagName("programme"));

      programs.forEach((p) => {
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

    for (const [k, arr] of epgData.entries()) arr.sort((a, b) => a.start - b.start);
  } catch (e) {
    console.error("EPG error:", e);
  }
}

function updateEPGUI(channelName, tvgId = "") {
  if (!el.epgNow || !el.epgFill || !el.epgNextList) return;

  const overlay = document.querySelector(".epg-overlay");
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
  const current = list.find((p) => now >= p.start && now < p.stop);

  if (!current) {
    overlay?.classList.add("media-progress");
    el.epgNow.textContent = "No guide available";
    el.epgNextList.innerHTML =
      "<p class='epg-next-item'><i class='fa-solid fa-circle-info'></i> No guide available.</p>";
    startMediaBar();
    return;
  }

  overlay?.classList.remove("media-progress");
  stopMediaBar();

  el.epgNow.textContent = current.title;

  const total = current.stop - current.start;
  const done = now - current.start;
  const pct = total > 0 ? (done / total) * 100 : 0;
  el.epgFill.style.width = Math.max(0, Math.min(100, pct)) + "%";

  const nextPrograms = list.filter((p) => p.start >= now).slice(0, 6);

  el.epgNextList.innerHTML = "";
  if (nextPrograms.length > 0) {
    nextPrograms.forEach((p) => {
      const item = document.createElement("p");
      item.className = "epg-next-item";

      const span = document.createElement("span");
      span.textContent = fmtTime(p.start);

      item.appendChild(span);
      item.appendChild(document.createTextNode(" " + p.title));
      el.epgNextList.appendChild(item);
    });
  } else {
    el.epgNextList.innerHTML =
      "<p class='epg-next-item'><i class='fa-solid fa-circle-info'></i> No upcoming events.</p>";
  }
}

function playNextChannelFromList() {
  if (!el.chans) return false;

  const items = Array.from(el.chans.querySelectorAll(".item"));
  if (!items.length) return false;

  const active = el.chans.querySelector(".item.active") || items[0];
  let startIdx = items.indexOf(active);
  if (startIdx < 0) startIdx = 0;

  for (let i = startIdx + 1; i < items.length; i++) {
    if (!items[i].classList.contains("is-dead")) {
      items[i].click();
      return true;
    }
  }

  for (let i = 0; i <= startIdx; i++) {
    if (!items[i].classList.contains("is-dead")) {
      items[i].click();
      return true;
    }
  }

  return false;
}

function markDeadAndSkip(reason) {
  const cur = activeChannelItemEl || el.chans?.querySelector(".item.active");
  if (cur) {
    cur.classList.add("is-dead");
    cur.title = reason ? `KO: ${reason}` : "KO";
  }

  const ok = playNextChannelFromList();
  if (!ok) showLoadStatus("error", { title: reason || "No working channel found" });
}













async function play(ch) {
  const url = String(ch?.url || "");
  const name = String(ch?.name || "");
  const tvgId = String(ch?.tvgId || "");
  const lic = ch?.["license-details"] || "";
  const token = ++_playToken;

  const failAndSkip = (msg) => {
    if (token !== _playToken) return;
    markDeadAndSkip(msg || "Stream not available");
  };

  showQualityBadge("");
  showLoadStatus("loading", { token, title: `Loading: ${name || ""}` });
  updateTabTitle(name);

  const START_TIMEOUT_MS = 12000;

  let startTimer = null;
  let startedOk = false;

  const clearWatchdogs = () => {
    if (startTimer) {
      clearTimeout(startTimer);
      startTimer = null;
    }
  };

  const armStartWatchdog = () => {
    clearWatchdogs();
    startedOk = false;

    startTimer = setTimeout(() => {
      if (token !== _playToken) return;
      if (!startedOk) {
        showLoadStatus("error", { token, title: "Timeout loading" });
        failAndSkip("Timeout loading");
      }
    }, START_TIMEOUT_MS);
  };

  const markStarted = () => {
    if (token !== _playToken) return;
    startedOk = true;
    clearWatchdogs();
  };

  if (hlsInst) {
    try { hlsInst.destroy(); } catch {}
    hlsInst = null;
  }

  if (dashInst) {
    try { dashInst.reset(); } catch {}
    dashInst = null;
  }

  if (mpegtsInst) {
    try {
      mpegtsInst.pause();
      mpegtsInst.unload();
      mpegtsInst.detachMediaElement();
      mpegtsInst.destroy();
    } catch {}
    mpegtsInst = null;
  }

  if (window.__shakaPlayer) {
    try { window.__shakaPlayer.destroy(); } catch {}
    window.__shakaPlayer = null;
  }

  if (el.video) {
    try { el.video.pause(); } catch {}
    el.video.removeAttribute("src");
    el.video.load();
  }

  stopMediaBar();
  document.querySelector(".epg-overlay")?.classList.remove("media-progress");
  checkIfAudioOnlyAndShowIcon(token);

  if (el.video) {
    armStartWatchdog();

    el.video.onplaying = () => {
      if (token !== _playToken) return;
      markStarted();
      hideLoadStatus(token);
    };

    el.video.oncanplay = () => {
      if (token !== _playToken) return;
      markStarted();
      hideLoadStatus(token);
    };

    el.video.onwaiting = null;
    el.video.onstalled = null;
    el.video.onpause = () => {};

    el.video.onerror = () => {
      if (token !== _playToken) return;
      const err = el.video?.error;
      clearWatchdogs();
      failAndSkip(err?.message || "Playback error");
    };
  }

  activeChannelName = name;
  activeChannelTvgId = tvgId;
  updateEPGUI(name, tvgId);

  clearInterval(epgTimer);
  epgTimer = setInterval(() => {
    if (activeChannelName) updateEPGUI(activeChannelName, activeChannelTvgId);
  }, 15000);

  if (!el.video) return;

  const hexToB64Url = (hex) => {
    const clean = String(hex || "").trim().toLowerCase().replace(/^0x/, "").replace(/[^0-9a-f]/g, "");
    const bytes = clean.match(/.{1,2}/g) || [];
    const bin = bytes.map((b) => String.fromCharCode(parseInt(b, 16))).join("");
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };

  const parseKidKey = (licStr) => {
    if (!licStr || !licStr.includes(":")) return null;
    const [kidHex, keyHex] = licStr.split(":").map((s) => s.trim());
    if (!kidHex || !keyHex) return null;
    return { kidB64: hexToB64Url(kidHex), keyB64: hexToB64Url(keyHex) };
  };

  const tryShakaClearKey = async () => {
    const kk = parseKidKey(lic);
    if (!kk) return false;
    if (!window.shaka || !window.shaka.Player) return false;

    try {
      shaka.polyfill.installAll();

      const player = new shaka.Player(el.video);
      window.__shakaPlayer = player;

      player.configure({
        drm: { clearKeys: { [kk.kidB64]: kk.keyB64 } }
      });

      player.addEventListener("error", () => {
        if (token !== _playToken) return;
        clearWatchdogs();
        failAndSkip("DASH DRM error");
      });

      await player.load(url);
      el.video.play().catch(() => {});
      return true;
    } catch (e) {
      console.warn("Shaka fallback failed:", e);
      return false;
    }
  };

  const startDash = () => {
    dashInst = dashjs.MediaPlayer().create();

    const kk = parseKidKey(lic);
    if (kk) {
      dashInst.setProtectionData({
        "org.w3.clearkey": { clearkeys: { [kk.kidB64]: kk.keyB64 } }
      });
    }

    dashInst.initialize(el.video, url, true);

    if (typeof attachDashQualityListeners === "function") {
      attachDashQualityListeners(name);
    }

    dashInst.on(dashjs.MediaPlayer.events.ERROR, async (e) => {
      if (token !== _playToken) return;

      const msg = (e?.event?.message || e?.error?.message || "").toString();
      const isLicenseMissing = msg.toLowerCase().includes("license") || msg.toLowerCase().includes("drm");

      const kk2 = parseKidKey(lic);
      if (kk2 && isLicenseMissing) {
        try { dashInst.reset(); } catch {}
        dashInst = null;

        const ok = await tryShakaClearKey();
        if (ok) return;
      }

      clearWatchdogs();
      failAndSkip("DASH error");
    });
  };

  const startHls = () => {
    if (window.Hls && Hls.isSupported()) {
      hlsInst = new Hls();

      hlsInst.on(Hls.Events.ERROR, (_, data) => {
        if (token !== _playToken) return;

        if (data?.fatal) {
          clearWatchdogs();
          failAndSkip("HLS fatal error");
        }
      });

      hlsInst.loadSource(url);
      hlsInst.attachMedia(el.video);

      if (typeof attachHlsQualityListeners === "function") {
        attachHlsQualityListeners(name);
      }

      hlsInst.on(Hls.Events.MANIFEST_PARSED, () => {
        if (token === _playToken) {
          el.video.play().catch(() => {});
        }
      });
    } else {
      el.video.src = url;
      el.video.play().catch(() => {});
    }
  };

  const startMpegTs = () => {
    if (window.mpegts && mpegts.getFeatureList().mseLivePlayback) {
      mpegtsInst = mpegts.createPlayer({ type: "mpegts", isLive: true, url });

      try {
        mpegtsInst.on(mpegts.Events.ERROR, () => {
          if (token !== _playToken) return;
          clearWatchdogs();
          failAndSkip("MPEGTS error");
        });
      } catch {}

      mpegtsInst.attachMediaElement(el.video);
      mpegtsInst.load();
      mpegtsInst.play().catch(() => {});
    } else {
      el.video.src = url;
      el.video.play().catch(() => {});
    }
  };

  const sniffByUrl = () => {
    const u = url.toLowerCase();
    if (u.includes(".mpd")) return "dash";
    if (u.includes(".m3u8")) return "hls";
    if (u.includes(".ts")) return "mpegts";
    if (u.includes("format=mpd") || u.includes("type=dash")) return "dash";
    if (u.includes("format=m3u8") || u.includes("type=hls")) return "hls";
    if (u.includes("type=mpegts") || u.includes("type=ts")) return "mpegts";
    return "";
  };

  const fetchWithTimeout = async (input, init, timeoutMs) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(input, { ...(init || {}), signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  };

  const sniffByContentType = async () => {
    const tryHead = async () => {
      const r = await fetchWithTimeout(url, { method: "HEAD", cache: "no-store" }, 4500);
      return (r.headers.get("content-type") || "").toLowerCase();
    };

    const tryRangeGet = async () => {
      const r = await fetchWithTimeout(
        url,
        {
          method: "GET",
          cache: "no-store",
          headers: { Range: "bytes=0-2047" }
        },
        6500
      );
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      let text = "";
      try { text = (await r.text()) || ""; } catch {}
      return { ct, text: text.slice(0, 2048) };
    };

    try {
      const ct = await tryHead();
      if (ct) return { ct, text: "" };
    } catch {}

    try {
      return await tryRangeGet();
    } catch {}

    return { ct: "", text: "" };
  };

  const decideFromSniff = (ct, headText) => {
    const c = (ct || "").toLowerCase();
    const t = (headText || "").trim();
    const upper = t.toUpperCase();

    if (c.includes("dash") || c.includes("mpd") || c.includes("application/dash+xml")) return "dash";
    if (c.includes("application/vnd.apple.mpegurl") || c.includes("application/x-mpegurl") || c.includes("mpegurl")) return "hls";
    if (c.includes("video/mp2t") || c.includes("mp2t")) return "mpegts";

    if (upper.includes("#EXTM3U") || upper.includes("#EXT-X-STREAM-INF") || upper.includes("#EXT-X-TARGETDURATION")) return "hls";
    if (upper.includes("<MPD") || upper.includes("URN: MPEG:DASH")) return "dash";

    return "";
  };

  const hinted = sniffByUrl();
  if (hinted === "dash") { startDash(); return; }
  if (hinted === "hls") { startHls(); return; }
  if (hinted === "mpegts") { startMpegTs(); return; }

  const sniff = await sniffByContentType();
  if (token !== _playToken) return;

  const decided = decideFromSniff(sniff.ct, sniff.text);

  if (decided === "dash") { startDash(); return; }
  if (decided === "hls") { startHls(); return; }
  if (decided === "mpegts") { startMpegTs(); return; }

  if (parseKidKey(lic)) { startDash(); return; }

  try {
    startHls();
    return;
  } catch {}

  try {
    startMpegTs();
    return;
  } catch {}

  el.video.src = url;
  el.video.play().catch(() => {});
}









function stopAndResetPlayback() {
  try {
    clearInterval(epgTimer);
    epgTimer = null;

    activeChannelName = null;
    activeChannelTvgId = "";
    activeChannelItemEl = null;
    initialAutoplayDone = false;

    if (hlsInst) {
      try {
        hlsInst.destroy();
      } catch {}
      hlsInst = null;
    }

    if (dashInst) {
      try {
        dashInst.reset();
      } catch {}
      dashInst = null;
    }

    if (mpegtsInst) {
      try {
        mpegtsInst.pause();
        mpegtsInst.unload();
        mpegtsInst.detachMediaElement();
        mpegtsInst.destroy();
      } catch {}
      mpegtsInst = null;
    }

    if (el.video) {
      try {
        el.video.pause();
      } catch {}
      el.video.removeAttribute("src");
      el.video.load();
    }

    if (el.cats) el.cats.innerHTML = "";
    if (el.chans) el.chans.innerHTML = "";

    const n = document.getElementById("activeName");
    if (n) n.textContent = "";

    const logoImg = document.getElementById("activeLogo");
    if (logoImg) {
      logoImg.removeAttribute("src");
      logoImg.style.display = "none";
    }

    const fallback = document.getElementById("activeLogoFallback");
    if (fallback) fallback.style.display = "block";

    updateTabTitle(null);
    showQualityBadge("");
    hideLoadStatus();
  } catch (e) {
    console.warn("stopAndResetPlayback error", e);
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

  if (textEl) textEl.textContent = isRadio ? "Radio" : "TV";
}

function updateGroupCount(groupName) {
  const g = String(groupName || "").toLowerCase();
  const isRadioGroup = g.includes("radio");

  let count = 0;
  if (isRadioGroup) {
    count = allChannels.filter((ch) => String(ch.group || "").toLowerCase().includes("radio")).length;
  } else {
    count = allChannels.filter((ch) => !String(ch.group || "").toLowerCase().includes("radio")).length;
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
         class="fa-solid fa-list-check"></i>
    `;
    span.onclick = () => window.open("playlist-manager/index.html", "_blank");
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

      try {
        stopAndResetPlayback();
        clearChannelsCache();
        await refreshAllPlaylists();
        updateGlobalCounts();
        updateServerIconState();
      } catch (e) {
        console.warn("Refresh after playlist change failed", e);
      }
    };
  } catch {}
}





async function refreshAllPlaylists() {
  const finalUrlsToLoad = getAllPlaylistUrls();
  const localPlaylists = getAllLocalPlaylistsText();

  const prevCount = Array.isArray(allChannels) ? allChannels.length : 0;
  allChannels = [];

  // --- FUNZIONE DI PARSING CORRETTA ---
  const parseM3U = (text, fallbackCategory) => {
    const lines = text.split(/\r?\n/);
    let cur = null;

    lines.forEach((l) => {
      l = (l || "").trim();
      if (!l) return;

      if (l.startsWith("#EXTINF:")) {
        const name = l.split(",").pop().trim();
        
        const getAttr = (key) => {
          const regex = new RegExp(key + '=["\']?([^"\',]+)["\']?', 'i');
          const match = l.match(regex);
          return match ? match[1] : "";
        };

        // MODIFICA QUI: Cerchiamo specificamente 'license-details'
        const license = getAttr("license-details") || getAttr("license");

        if (license) {
          console.log(`%c[Parser] Chiavi DRM trovate per ${name}`, "color: #00ff00; font-weight: bold;");
        }

        cur = { 
          name, 
          logo: getAttr("tvg-logo"), 
          group: getAttr("group-title") || fallbackCategory, 
          tvgId: getAttr("tvg-id"), 
          // Salviamo il campo con il nome esatto che la funzione play() si aspetta
          "license-details": license 
        };
      } else if (l.startsWith("http") && cur) {
        cur.url = l;
        if (!allChannels.some((ch) => ch.url === cur.url)) {
          allChannels.push(cur);
        }
        cur = null;
      }
    });
  };

  // 1. ELABORAZIONE PLAYLIST REMOTE
  for (let url of finalUrlsToLoad) {
    url = (url || "").trim();
    if (!url) continue;
    const fallbackCategory = _pl2_guessNameFromUrl(url).replace(/\.m3u8?$/i, "");

    try {
      const bust = (url.includes("?") ? "&" : "?") + "t=" + Date.now();
      const res = await fetch(url + bust, { cache: "no-store" });
      const text = await res.text();
      parseM3U(text, fallbackCategory);
    } catch {
      console.warn("Unable to refresh URL:", url);
    }
  }

  // 2. ELABORAZIONE PLAYLIST LOCALI
  for (const pl of localPlaylists) {
    const fallbackCategory = (pl.name || "Local").replace(/\.m3u8?$/i, "");
    parseM3U(pl.text || "", fallbackCategory);
  }

  // GESTIONE FINALE
  if (allChannels.length === 0) {
    writeChannelsCache([]);
    try { localStorage.removeItem(LEGACY_CHANNELS_KEY); } catch {}
    stopAndResetPlayback();
    updateGlobalCounts();
    updateServerIconState();
    return;
  }

  const newCount = allChannels.length;
  if (newCount !== prevCount) saveToCache();

  renderCats();
  updateGlobalCounts();
  updateServerIconState();
}






function selectCategory(cat, opts = {}) {
  const { autoplayFirst = false } = opts;

  document.querySelectorAll("#categoryContainer .item").forEach((e) => e.classList.remove("active"));

  const catEl = Array.from(document.querySelectorAll("#categoryContainer .item")).find(
    (x) => x.textContent.trim() === String(cat).trim()
  );

  if (catEl) catEl.classList.add("active");

  const term = (document.getElementById("channelSearch")?.value || "").trim().toLowerCase();
  if (term) renderChansFiltered(cat, term);
  else renderChans(cat);

  updateGroupCount(cat);
  updateChannelTypeIcon(cat);

  if (autoplayFirst) {
    const firstChannel = el.chans?.querySelector(".item");
    if (firstChannel) firstChannel.click();
  }
}

function renderCats() {
  const cats = [...new Set(allChannels.map((c) => c.group))];
  if (el.cats) el.cats.innerHTML = "";

  cats.forEach((cat) => {
    const div = document.createElement("div");
    div.className = "item";
    div.textContent = cat;
    div.onclick = () => selectCategory(cat, { autoplayFirst: false });
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
  const div = document.createElement("div");
  div.className = "item";

  div.innerHTML = `
    ${
      ch.logo
        ? `<img class="item-img" src="${ch.logo}"
             onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';">`
        : `<span class="item-icon"><i class="fa-solid fa-clapperboard-play"></i></span>`
    }
    ${ch.logo ? `<span class="item-icon" style="display:none;"><i class="fa-solid fa-clapperboard-play"></i></span>` : ""}
    <span>${ch.name}</span>
  `;

  div.onclick = () => {
    document.querySelectorAll("#channelContainer .item").forEach((e) => e.classList.remove("active"));
    div.classList.add("active");
    activeChannelItemEl = div;

    const n = document.getElementById("activeName");
    const l = document.getElementById("activeLogo");
    const fallback = document.getElementById("activeLogoFallback");

    if (n) n.textContent = ch.name;

    if (l) {
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
  if (!el.chans) return;
  el.chans.innerHTML = "";
  allChannels.filter((c) => c.group === cat).forEach((ch) => el.chans.appendChild(makeChannelItem(ch)));
}

function renderChansFiltered(cat, term) {
  if (!el.chans) return;
  el.chans.innerHTML = "";
  allChannels
    .filter((c) => c.group === cat)
    .filter((c) => String(c.name).toLowerCase().includes(term))
    .forEach((ch) => el.chans.appendChild(makeChannelItem(ch)));
}

function applyGlobalSearch(termRaw) {
  const term = (termRaw || "").trim().toLowerCase();

  if (!term) {
    document.querySelectorAll("#categoryContainer .item").forEach((catEl) => (catEl.style.display = ""));
    const activeCatEl =
      document.querySelector("#categoryContainer .item.active") || document.querySelector("#categoryContainer .item");
    if (activeCatEl) selectCategory(activeCatEl.textContent.trim(), { autoplayFirst: false });
    return;
  }

  const catsWithMatch = new Set(
    allChannels.filter((ch) => String(ch.name).toLowerCase().includes(term)).map((ch) => ch.group)
  );

  document.querySelectorAll("#categoryContainer .item").forEach((catEl) => {
    const catName = catEl.textContent.trim();
    catEl.style.display = catsWithMatch.has(catName) ? "" : "none";
  });

  const activeCatEl = document.querySelector("#categoryContainer .item.active");
  const activeName = activeCatEl?.textContent.trim();

  if (!activeName || !catsWithMatch.has(activeName)) {
    const firstVisible = Array.from(document.querySelectorAll("#categoryContainer .item")).find(
      (x) => x.style.display !== "none"
    );
    if (firstVisible) selectCategory(firstVisible.textContent.trim(), { autoplayFirst: false });
  }

  const currentCat = document.querySelector("#categoryContainer .item.active")?.textContent.trim();
  if (currentCat) renderChansFiltered(currentCat, term);
}

const searchInput = document.getElementById("channelSearch");
if (searchInput) searchInput.addEventListener("input", function () { applyGlobalSearch(this.value); });

function showUI() {
  if (!el.ui) return;
  el.ui.classList.add("visible");
  clearTimeout(hideUiTimer);
  hideUiTimer = setTimeout(() => el.ui.classList.remove("visible"), 5000);
}
document.addEventListener("mousemove", showUI);
document.addEventListener("keydown", showUI);

function saveToCache() {
  try {
    localStorage.setItem(LOCAL_STORAGE_CHANNELS_KEY, JSON.stringify(allChannels || []));
  } catch {}
}

async function addCustomUrl() {
  const url = prompt("Enter the M3U playlist URL:");
  if (!url || !url.startsWith("http")) return;

  const resAdd = pl2_addUrl(url);
  if (!resAdd.ok) {
    alert(resAdd.msg || "This playlist is already added.");
    return;
  }

  const fallbackCategory = _pl2_guessNameFromUrl(url).replace(/\.m3u8?$/i, "");
  PLAYLIST_URLS = getAllPlaylistUrls();

  try {
    const res = await fetch(url);
    const text = await res.text();
    const lines = text.split("\n");
    let cur = null;
    let added = 0;

    lines.forEach((l) => {
      l = l.trim();
      if (l.startsWith("#EXTINF:")) {
        const name = l.split(",").pop().trim();
        const logo = (l.match(/tvg-logo="([^"]*)"/i) || [])[1] || "";
        const group = (l.match(/group-title="([^"]*)"/i) || [])[1] || fallbackCategory;
        const tvgId = (l.match(/tvg-id="([^"]*)"/i) || [])[1] || "";
        cur = { name, logo, group, tvgId };
      } else if (l.startsWith("http") && cur) {
        cur.url = l;
        if (!allChannels.some((ch) => ch.url === cur.url)) {
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
  } catch {
    alert("Error loading the URL.");
  }
}

function loadLocalFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    pl2_addLocal(file.name, text);

    const lines = String(text || "").split("\n");
    let cur = null;
    let localChans = [];

    lines.forEach((l) => {
      l = l.trim();
      if (l.startsWith("#EXTINF:")) {
        const name = l.split(",").pop().trim();
        const logo = (l.match(/tvg-logo="([^"]*)"/i) || [])[1] || "";
        const group = (l.match(/group-title="([^"]*)"/i) || [])[1] || "Other";
        const tvgId = (l.match(/tvg-id="([^"]*)"/i) || [])[1] || "";
        cur = { name, logo, group, tvgId };
      } else if (l.startsWith("http") && cur) {
        cur.url = l;
        localChans.push(cur);
        cur = null;
      }
    });

    if (localChans.length > 0) {
      allChannels = [...allChannels, ...localChans];
      allChannels = allChannels.filter((v, i, a) => a.findIndex((t) => t.url === v.url) === i);

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

function clearCache() {
  let customCount = 0;
  try {
    customCount = pl2_listIndex().length;
  } catch {
    customCount = 0;
  }

  if (customCount === 0 && (!allChannels || allChannels.length === 0)) {
    alert("You haven't added any playlist yet.");
    return;
  }

  const message =
    "Warning: this will remove all the playlists you added. Continue? Open Playlist Manager for check your lists.";
  if (confirm(message)) {
    clearChannelsCache();
    pl2_clearAll();
    alert("Added playlists removed. The app will now reload.");
    location.reload();
  }
}

function updateDateTime() {
  const now = new Date();
  const options = { hour: "2-digit", minute: "2-digit", hour12: false };
  let formatted = new Intl.DateTimeFormat("en-GB", options).format(now);
  formatted = formatted.replace(",", "");
  const node = document.getElementById("current-date");
  if (node) node.textContent = formatted;
}
updateDateTime();
setInterval(updateDateTime, 60000);

function togglePlay() {
  if (!el.video) return;
  if (el.video.paused) el.video.play().catch(() => {});
  else el.video.pause();
}

function rewind() {
  if (!el.video) return;
  el.video.currentTime = Math.max(0, el.video.currentTime - 10);
}

function forward() {
  if (!el.video) return;
  const d = el.video.duration;
  if (isFinite(d)) el.video.currentTime = Math.min(d, el.video.currentTime + 10);
  else el.video.currentTime += 10;
}

function toggleFullScreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
  }
}



let volumeUiTimer = null;

function openVolumeUI() {
  const c = document.querySelector(".volume-container");
  if (!c) return;

  c.classList.add("open");
  clearTimeout(volumeUiTimer);
  volumeUiTimer = setTimeout(() => c.classList.remove("open"), 3000);
}

function changeVolume(val) {
  if (!el.video) return;

  const volumeValue = Math.max(0, Math.min(1, parseFloat(val) || 0));
  el.video.volume = volumeValue;

  if (volumeValue > 0) {
    el.video.muted = false;
    el.video.dataset.lastVol = String(volumeValue);
  } else {
    el.video.muted = true;
  }

  const muteBtnIcon = document.querySelector("#muteBtn i");
  if (muteBtnIcon) {
    muteBtnIcon.className =
      volumeValue === 0
        ? "fa-solid fa-volume-xmark"
        : volumeValue <= 0.33
          ? "fa-solid fa-volume-low"
          : volumeValue <= 0.66
            ? "fa-solid fa-volume"
            : "fa-solid fa-volume-high";
  }
}

function toggleMute() {
  if (!el.video) return;

  const volSlider = document.getElementById("volumeSlider");

  if (!el.video.muted && el.video.volume > 0) {
    el.video.dataset.lastVol = String(el.video.volume);
    el.video.muted = true;
    el.video.volume = 0;
    if (volSlider) volSlider.value = 0;
  } else {
    const lastVol = Math.max(0.05, Math.min(1, parseFloat(el.video.dataset.lastVol || "1") || 1));
    el.video.muted = false;
    el.video.volume = lastVol;
    if (volSlider) volSlider.value = lastVol;
  }

  changeVolume(el.video.volume);
  openVolumeUI();
}

function initVolumeYT() {
  const muteBtn = document.getElementById("muteBtn");
  const volSlider = document.getElementById("volumeSlider");

  if (muteBtn) {
    muteBtn.onclick = (e) => {
      e.stopPropagation();
      toggleMute();
    };
  }

  if (volSlider) {
    volSlider.oninput = (e) => {
      const v = e.target.value;
      changeVolume(v);
      if (parseFloat(v) > 0) el.video.dataset.lastVol = String(v);
      openVolumeUI();
    };
  }

  const vc = document.querySelector(".volume-container");
  if (vc) vc.addEventListener("mouseenter", openVolumeUI);
}

function adjustVolume(delta) {
  if (!el.video) return;

  let newVol = (el.video.volume || 0) + delta;
  newVol = Math.max(0, Math.min(1, newVol));

  const slider = document.getElementById("volumeSlider");
  if (slider) slider.value = newVol;

  changeVolume(newVol);
  openVolumeUI();
}





function setupControlListeners() {
  const btnPlay = document.getElementById("playPauseBtn");
  const btnRW = document.getElementById("rewindBtn") || document.querySelector(".fa-backward-step")?.parentElement;
  const btnFF = document.getElementById("forwardBtn") || document.querySelector(".fa-forward-step")?.parentElement;
  const btnFS = document.getElementById("fullScreenBtn") || document.querySelector(".fa-expand")?.parentElement;

  if (btnPlay) btnPlay.onclick = (e) => { e.stopPropagation(); togglePlay(); };
  if (btnRW) btnRW.onclick = (e) => { e.stopPropagation(); rewind(); };
  if (btnFF) btnFF.onclick = (e) => { e.stopPropagation(); forward(); };
  if (btnFS) btnFS.onclick = (e) => { e.stopPropagation(); toggleFullScreen(); };
}

function updateGlobalCounts() {
  if (!Array.isArray(allChannels)) return;

  const totalRadio = allChannels.filter((ch) => String(ch.group || "").toLowerCase().includes("radio")).length;
  const totalTv = allChannels.length - totalRadio;
  const totalAll = allChannels.length;

  const elTv = document.getElementById("totalTv");
  const elRadio = document.getElementById("totalRadio");
  const elAll = document.getElementById("totalAll");

  if (elTv) elTv.textContent = totalTv;
  if (elRadio) elRadio.textContent = totalRadio;
  if (elAll) elAll.textContent = totalAll;
}

async function fetchEpgUkTime() {
  try {
    const url = "https://raw.githubusercontent.com/jonathansanfilippo/xvb-epg/refs/heads/main/log";
    const response = await fetch(url + "?t=" + Date.now(), { cache: "no-store" });
    if (!response.ok) throw new Error("Fetch error");
    const time = (await response.text()).trim();
    const node = document.getElementById("epg-uk-time");
    if (node) node.textContent = time;
  } catch {
    const node = document.getElementById("epg-uk-time");
    if (node) node.textContent = "--:--";
  }
}
fetchEpgUkTime();
setInterval(fetchEpgUkTime, 60000);

function updateServerIconState() {
  const icon = document.getElementById("serverListIcon");
  if (!icon) return;

  let idx = [];
  try {
    idx = pl2_listIndex();
  } catch {
    idx = [];
  }

  const hasServer = Array.isArray(idx) && idx.some((x) => x && x.type === "url" && x.url === SERVER_PLAYLIST_URL);
  const hasAnyChannels = Array.isArray(allChannels) && allChannels.length > 0;
  const v2HasAny = Array.isArray(idx) && idx.length > 0;

  icon.style.color = "rgb(255,255,255)";
  icon.style.opacity = hasServer || v2HasAny || hasAnyChannels ? "0.8" : "0.8";
}

function fetchUserIP() {
  const ipDisplay = document.getElementById("userIpText");

  window.ipInfoCallback = function (data) {
    const country = data.country || "??";
    if (ipDisplay) ipDisplay.textContent = `${country}`;
    const oldScript = document.getElementById("ipinfo-script");
    if (oldScript) oldScript.remove();
  };

  const script = document.createElement("script");
  script.id = "ipinfo-script";
  script.src = "https://ipinfo.io/json?callback=ipInfoCallback";
  script.onerror = function () {
    if (ipDisplay) ipDisplay.textContent = "Unavailable";
  };

  document.body.appendChild(script);
}

document.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT') return;
    if (!el.video) return;

    if (e.key === 'ArrowUp') {
        e.preventDefault();
        playPreviousChannel();
    } 
    else if (e.key === 'ArrowDown') {
        e.preventDefault();
        playNextChannel();
    }
    else if (e.key === 'ArrowRight') {
        e.preventDefault();
        adjustVolume(0.05); // +5%
    }
    else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        adjustVolume(-0.05); // -5%
    }
});

function playNextChannel() {
  const items = Array.from(document.querySelectorAll("#channelContainer .item"));
  if (!items.length) return;

  const active = document.querySelector("#channelContainer .item.active");
  let nextIdx = 0;

  if (active) {
    nextIdx = items.indexOf(active) + 1;
    if (nextIdx >= items.length) nextIdx = 0;
  }

  items[nextIdx].click();
  items[nextIdx].scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function playPreviousChannel() {
  const items = Array.from(document.querySelectorAll("#channelContainer .item"));
  if (!items.length) return;

  const active = document.querySelector("#channelContainer .item.active");
  let prevIdx = items.length - 1;

  if (active) {
    prevIdx = items.indexOf(active) - 1;
    if (prevIdx < 0) prevIdx = items.length - 1;
  }

  items[prevIdx].click();
  items[prevIdx].scrollIntoView({ behavior: "smooth", block: "nearest" });
}

let mouseTimer = null;

const wrapper = document.querySelector(".ui-wrapper");
const leftSide = document.querySelector(".sidebar-left");
const rightSide = document.querySelector(".sidebar-right");

function showWrapper() {
  if (!wrapper) return;
  wrapper.classList.add("visible");
}

function scheduleHide() {
  if (!wrapper) return;

  clearTimeout(mouseTimer);
  mouseTimer = setTimeout(() => {
    // se il mouse è ancora sopra la UI (incluse le sidebar), NON nascondere
    if (wrapper.matches(":hover")) return;
    wrapper.classList.remove("visible");
  }, 3000);
}

// 1) muovere il mouse mostra e poi nasconde dopo 3s
document.addEventListener("mousemove", () => {
  showWrapper();
  scheduleHide();
});

// 2) se entri nella UI, resta visibile finché stai sopra
if (wrapper) {
  wrapper.addEventListener("mouseenter", () => {
    showWrapper();
    clearTimeout(mouseTimer);
  });

  wrapper.addEventListener("mouseleave", () => {
    scheduleHide();
  });
}

// Effetti “accensione” sidebar
if (leftSide) {
  leftSide.addEventListener("mouseenter", () => {
    showWrapper();
    clearTimeout(mouseTimer);
    wrapper.classList.add("active-left");
  });

  leftSide.addEventListener("mouseleave", () => {
    wrapper.classList.remove("active-left");
    scheduleHide();
  });
}

if (rightSide) {
  rightSide.addEventListener("mouseenter", () => {
    showWrapper();
    clearTimeout(mouseTimer);
    wrapper.classList.add("active-right");
  });

  rightSide.addEventListener("mouseleave", () => {
    wrapper.classList.remove("active-right");
    scheduleHide();
  });
}

let cursorTimer;

function showCursor() {
  document.body.classList.remove("hide-cursor");
}

function hideCursor() {
  document.body.classList.add("hide-cursor");
}

document.addEventListener("mousemove", () => {
  showCursor();

  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(hideCursor, 5500);
});
function updatePlaylistCount() {
  try {
    let v2 = [];
    try {
      const rawV2 = localStorage.getItem(PLAYLIST_INDEX_KEY_V2);
      const arrV2 = rawV2 ? JSON.parse(rawV2) : [];
      v2 = Array.isArray(arrV2) ? arrV2 : [];
    } catch {
      v2 = [];
    }

    let legacy = [];
    try {
      const rawOld = localStorage.getItem(LOCAL_STORAGE_PLAYLISTS_KEY);
      const arrOld = rawOld ? JSON.parse(rawOld) : [];
      legacy = Array.isArray(arrOld) ? arrOld : [];
    } catch {
      legacy = [];
    }

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

    const node = document.getElementById("playlistCount");
    if (node) node.textContent = String(set.size);
  } catch {}
}

document.addEventListener("DOMContentLoaded", () => updatePlaylistCount());

if ("BroadcastChannel" in window) {
  const bc = new BroadcastChannel("xvb_playlists_v2");
  bc.onmessage = () => updatePlaylistCount();
}

document.addEventListener(
  "click",
  () => {
    setTimeout(updatePlaylistCount, 150);
  },
  true
);

function showLogoFallback() {
  const img = document.getElementById("activeLogo");
  const fallback = document.getElementById("activeLogoFallback");
  if (img) img.style.display = "none";
  if (fallback) fallback.style.display = "block";
}


document.addEventListener("DOMContentLoaded", function () {
  const year = document.getElementById("year");
  if (year) {
    year.textContent = new Date().getFullYear() + " ";
  }
});

async function init() {
  PLAYLIST_URLS = getAllPlaylistUrls();
  initLiveLogsPlayer();
  injectPlaylistManagerButton();
  initPlaylistBroadcastListener();

  updateServerIconState();
  applyUiScale();
  updateTabTitle(null);

  initPlayPauseSync();
  initSidebarClock();
  initOnlineUsers();
  initVolumeYT();
  setupControlListeners();

  await fetchEpg();
  fetchUserIP();

  try {
    const cached = readChannelsCache();
    if (cached && cached.length > 0) {
      allChannels = cached;
      renderCats();
      updateGlobalCounts();
    }

    await refreshAllPlaylists();
  } catch (e) {
    console.error("Critical init error:", e);
  }
}


/* ===========================
   LIVE LOGS (BroadcastChannel) — XVB PLAYER
   Channel: xvb_logs
   Invia TUTTI i console.log/warn/error al Playlist Manager
   =========================== */


const LOG_CHANNEL = "xvb_logs";
let _xvbLogBc = null;
let _xvbConsoleHooked = false;
let _xvbOrigConsole = null;
const _xvbLogQueue = [];

function _xvbLogTime(ts) {
  const d = ts ? new Date(ts) : new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function _xvbSafeStringify(value, maxLen = 6000) {
  try {
    const seen = new WeakSet();
    const json = JSON.stringify(
      value,
      (k, v) => {
        if (typeof v === "object" && v !== null) {
          if (seen.has(v)) return "[Circular]";
          seen.add(v);
        }
        if (typeof v === "function") return "[Function]";
        if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
        return v;
      },
      0
    );
    if (typeof json !== "string") return String(json);
    if (json.length > maxLen) return json.slice(0, maxLen) + "…";
    return json;
  } catch {
    try {
      return String(value);
    } catch {
      return "[Unserializable]";
    }
  }
}

function _xvbStripConsoleCssArgs(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (typeof a === "string" && a.includes("%c")) {
      out.push(a.replace(/%c/g, "").trim());
      if (typeof args[i + 1] === "string") i += 1;
      continue;
    }
    out.push(a);
  }
  return out;
}

function _xvbArgsToMsg(args) {
  const cleaned = _xvbStripConsoleCssArgs(args || []);
  const parts = cleaned.map((a) => {
    if (a == null) return "";
    if (typeof a === "string") return a;
    if (typeof a === "number" || typeof a === "boolean") return String(a);
    return _xvbSafeStringify(a);
  });
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function _xvbShortUrl(u) {
  const s = String(u || "");
  if (s.length <= 140) return s;
  return s.slice(0, 90) + "…" + s.slice(-40);
}

function _xvbPostLog(level, msg, meta) {
  try {
    if (!_xvbLogBc) return;
    _xvbLogBc.postMessage({
      type: "log",
      source: "xvb-player",
      level: level || "info",
      msg: String(msg ?? ""),
      meta: meta || {},
      ts: Date.now(),
    });
  } catch {}
}

function xvbLog(level, msg, meta) {
  try {
    const payload = { level: level || "info", msg: String(msg ?? ""), meta: meta || {} };
    if (!_xvbLogBc) {
      _xvbLogQueue.push(payload);
      return;
    }
    _xvbPostLog(payload.level, payload.msg, payload.meta);
  } catch {}
}

function initLiveLogsPlayer() {
  try {
    _xvbOrigConsole = _xvbOrigConsole || {
      log: console.log.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };

    if (!("BroadcastChannel" in window)) {
      _xvbOrigConsole.warn("[XVB] BroadcastChannel not supported.");
      return;
    }

    _xvbLogBc = new BroadcastChannel(LOG_CHANNEL);

    _xvbLogBc.onmessage = (ev) => {
      const d = ev?.data;
      if (!d || d.type !== "log") return;
      if (d.source === "xvb-player") return;

      const pfx = `[BC ${d.source || "unknown"} ${_xvbLogTime(d.ts)}]`;
      try {
        if (d.level === "error") _xvbOrigConsole.error(pfx, d.msg, d.meta || {});
        else if (d.level === "warn") _xvbOrigConsole.warn(pfx, d.msg, d.meta || {});
        else _xvbOrigConsole.log(pfx, d.msg, d.meta || {});
      } catch {}
    };

    if (!_xvbConsoleHooked) {
      _xvbConsoleHooked = true;

      const oLog = _xvbOrigConsole.log;
      const oWarn = _xvbOrigConsole.warn;
      const oErr = _xvbOrigConsole.error;

      console.log = (...args) => {
        oLog(...args);
        const msg = _xvbArgsToMsg(args);
        _xvbPostLog("info", msg, {
          args: _xvbStripConsoleCssArgs(args).map((a) => (typeof a === "object" ? _xvbSafeStringify(a) : a)),
        });
      };

      console.warn = (...args) => {
        oWarn(...args);
        const msg = _xvbArgsToMsg(args);
        _xvbPostLog("warn", msg, {
          args: _xvbStripConsoleCssArgs(args).map((a) => (typeof a === "object" ? _xvbSafeStringify(a) : a)),
        });
      };

      console.error = (...args) => {
        oErr(...args);
        const msg = _xvbArgsToMsg(args);
        _xvbPostLog("error", msg, {
          args: _xvbStripConsoleCssArgs(args).map((a) => (typeof a === "object" ? _xvbSafeStringify(a) : a)),
        });
      };
    }

    while (_xvbLogQueue.length) {
      const it = _xvbLogQueue.shift();
      if (it) _xvbPostLog(it.level, it.msg, it.meta);
    }

    _xvbPostLog("ok", "Log channel ready.", { channel: LOG_CHANNEL });
  } catch (e) {
    try {
      (_xvbOrigConsole?.warn || console.warn).call(console, "[XVB] initLiveLogsPlayer error", e);
    } catch {}
  }
}


init();





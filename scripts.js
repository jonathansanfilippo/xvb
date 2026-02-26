/* ===========================
   CONFIG (Versione Pro)
   =========================== */

const LOCAL_STORAGE_PLAYLISTS_KEY = 'dvb-K@8$dL%3vZ&nB1xR*';
const LOCAL_STORAGE_CHANNELS_KEY = 'dvb-m^7Y!zR4*P8&kQ3@h';

const DEFAULT_PLAYLISTS = [
  "https://raw.githubusercontent.com/jonathansanfilippo/xvb-data/refs/heads/main/data/lists/main.m3u"
];

function getAllPlaylistUrls() {
  let custom = [];
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_PLAYLISTS_KEY);
    custom = stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error("Errore lettura playlist custom:", e);
    custom = [];
  }
  return [...new Set([...DEFAULT_PLAYLISTS, ...custom])];
}

let PLAYLIST_URLS = getAllPlaylistUrls();
const EPG_URL = "https://raw.githubusercontent.com/jonathansanfilippo/xvb-data/refs/heads/main/data/guides/it.xml";

/* ===== ONLINE USERS ===== */
const serverUrl = "https://render-com-a2ck.onrender.com";

/* ===== TAB TITLE ===== */
const DEFAULT_TITLE = "XVB";

/* ✅ scaling reference (TENUTO, ma ora fisso) */
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

/* ✅ autoplay solo all’avvio */
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



/* ===========================
   GROUP-TITLE (fallback)
   =========================== */

function getGroupFromExtinf(extinfLine, fallback = "Altri") {
  const m = String(extinfLine || "").match(/group-title="([^"]*)"/i);
  const g = (m && m[1] != null ? m[1] : "").trim();
  return g || fallback;
}












/* ===========================
   ✅ AUTO-SKIP & DEAD CHANNELS
   =========================== */

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
    showLoadStatus("error", { title: reason || "Nessun canale funzionante" });
  }
}

/* ===========================
   TIME / CLOCK
   =========================== */

const userTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const timeFmt = new Intl.DateTimeFormat("it-IT", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: userTZ
});

function fmtTime(d) {
  return d ? timeFmt.format(d) : "--:--";
}

/* ===========================
   ✅ UI SCALE (FISSO)
   =========================== */

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

/* ===========================
   TAB TITLE
   =========================== */

function updateTabTitle(channelName) {
  if (!channelName) {
    document.title = DEFAULT_TITLE;
    return;
  }
  document.title = `${channelName} • ${DEFAULT_TITLE}`;
}

/* ===========================
   PLAY/PAUSE ICON
   =========================== */

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
  el.video.addEventListener("play",  () => setPlayPauseIcon(true));
  el.video.addEventListener("pause", () => setPlayPauseIcon(false));
  el.video.addEventListener("ended", () => setPlayPauseIcon(false));
}

/* ===========================
   SIDEBAR CLOCK
   =========================== */

function formatSidebarClock(dateObj) {
  const fmt = new Intl.DateTimeFormat("it-IT", {
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

/* ===========================
   ONLINE USERS
   =========================== */

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
      console.warn("Socket.IO client non caricato (io non trovato). Solo polling /status.");
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

/* ===========================
   QUALITY BADGE (LOGICA UNIFICATA)
   =========================== */

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
    case "4k":  return "fa-duotone fa-solid fa-rectangle-4k";
    case "hdr": return "fa-duotone fa-solid  fa-rectangle-high-dynamic-range";
    case "hd":  return "fa-duotone fa-solid  fa-high-definition";
    case "sd":  return "fa-duotone fa-solid  fa-standard-definition";
    default:    return "";
  }
}

function keyFromHeight(h) {
  h = Number(h) || 0;
  if (h >= 2160) return "4k";
  if (h >= 1080) return "hdr";
  if (h >= 720)  return "hd";
  if (h > 0)     return "sd";
  return "";
}

function labelFromHeight(h) {
  h = Number(h) || 0;
  if (h >= 2160) return "4K";
  if (h >= 1080) return "1080p";
  if (h >= 720)  return "720p";
  if (h > 0)     return h + "p";
  return "AUTO";
}

/* ===========================
   LOAD STATUS (SPINNER / ERROR) - usa #qualityBadge
   =========================== */

function showLoadStatus(state, opts = {}) {
  if (!el.qBadge) return;

  const token = opts.token;
  if (token != null && token !== _playToken) return;

  el.qBadge.style.display = "inline-flex";

  if (state === "loading") {
    el.qBadge.setAttribute("data-q", "loading");
    el.qBadge.title = opts.title || "Caricamento…";
    el.qBadge.innerHTML = `<i class="fa-duotone fa-solid fa-spinner-third fa-spin" aria-hidden="true"></i>`;
    return;
  }

  if (state === "error") {
    el.qBadge.setAttribute("data-q", "error");
    el.qBadge.title = opts.title || "Errore";
    el.qBadge.innerHTML = `<i class="fa-duotone fa-solid fa-triangle-exclamation" aria-hidden="true"></i>`;
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

/* ===========================
   AUDIO ONLY BADGE (radio icon)
   =========================== */

function showRadioBadge() {
  if (!el.qBadge) return;
  el.qBadge.style.display = "inline-flex";
  el.qBadge.setAttribute("data-q", "radio");
  el.qBadge.title = "Audio";
  el.qBadge.innerHTML = `<i style="font-size:28px;"class="fa-regular fa-audio-description" aria-hidden="true"></i>`;
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




/* ===========================
   MEDIA PROGRESS (NO EPG) -> barra avanzamento/buffer
   =========================== */

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

  // VOD: currentTime/duration
  if (isFinite(d) && d > 0) {
    const pct = (v.currentTime / d) * 100;
    el.epgFill.style.width = Math.max(0, Math.min(100, pct)) + "%";
    return;
  }

  // LIVE: usa buffer ahead come "indicatore"
  let bufferedAhead = 0;
  try {
    if (v.buffered && v.buffered.length) {
      const end = v.buffered.end(v.buffered.length - 1);
      bufferedAhead = Math.max(0, end - v.currentTime);
    }
  } catch {}

  // 0..20s buffer => 0..100%
  const WINDOW = 20;
  const pct = (Math.min(bufferedAhead, WINDOW) / WINDOW) * 100;
  el.epgFill.style.width = Math.max(0, Math.min(100, pct)) + "%";
}

function startMediaBar() {
  stopMediaBar();
  updateMediaProgressBar();
  mediaBarTimer = setInterval(updateMediaProgressBar, 250);
}




/* ===========================
   DETECTION & LISTENERS
   =========================== */

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

/* ===========================
   EPG
   =========================== */

function normalizeEPGName(str) {
  if (!str) return "";
  return str
    .replace(/(\.?)(uk|it)$/i, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, '')
    .replace(/\[.*?\]|\(.*?\)/g, '')
    .replace(/\bbbc\s*one(\s*(london|north|south))?\b/g, 'bbc1')
    .replace(/\bbbc\s*two\b/g, 'bbc2')
    .replace(/\bbbc\s*three\b/g, 'bbc3')
    .replace(/\bbbc\s*four\b/g, 'bbc4')
    .replace(/\bbbc\s*news\b/g, 'bbcnews')
    .replace(/\bbbc\s*world\s*news\b/g, 'bbcworldnews')
    .replace(/\bitv\s*one\b/g, 'itv1')
    .replace(/\bitv\s*([2-4])\b/g, 'itv$1')
    .replace(/\bchannel\s*four\b/g, 'channel4')
    .replace(/\b(e4|film4|more4|4seven)\b/g, m => m.replace('4', ' 4'))
    .replace(/\b(hd|fhd|sd|uhd|plus|extra|direct|premium|now|live|east|west|north|south|central)\b/g, '')
    .replace(/(rete\s*4|retequattro)/g, 'rete4')
    .replace(/canale\s*5/g, 'canale5')
    .replace(/italia\s*1/g, 'italia1')
    .replace(/tv\s*8/g, 'tv8')
    .replace(/\bnove\b/g, '9')
    .replace(/[^a-z0-9]/g, '')
    .trim();
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
    const res = await fetch(EPG_URL);
    const text = await res.text();
    const xml = new DOMParser().parseFromString(text, "application/xml");

    if (xml.querySelector("parsererror")) {
      throw new Error("EPG XML non valido (parsererror).");
    }

    const programs = Array.from(xml.getElementsByTagName("programme"));
    epgData.clear();

    programs.forEach(p => {
      const channelId = normalizeEPGName(p.getAttribute("channel"));
      if (!channelId) return;

      const start = parseXmlDate(p.getAttribute("start"));
      const stop = parseXmlDate(p.getAttribute("stop"));
      if (!start || !stop) return;

      const title = p.getElementsByTagName("title")[0]?.textContent || "Nessun titolo";

      if (!epgData.has(channelId)) epgData.set(channelId, []);
      epgData.get(channelId).push({ start, stop, title });
    });

    for (const [k, arr] of epgData.entries()) {
      arr.sort((a, b) => a.start - b.start);
    }
  } catch (e) {
    console.error("Errore EPG:", e);
  }
}

function updateEPGUI(channelName) {
  if (!el.epgNow || !el.epgFill || !el.epgNextList) return;

  const overlay = document.querySelector('.epg-overlay');

  const id = normalizeEPGName(channelName);
  const list = epgData.get(id) || [];
  const now = new Date();

  const current = list.find(p => now >= p.start && now < p.stop);

  // ✅ NO EPG -> barra media (verde)
  if (!current) {
    overlay?.classList.add('media-progress');   // 🟢 verde
    el.epgNow.textContent = channelName || "Nessuna guida disponibile";

    el.epgNextList.innerHTML =
      "<p class='epg-next-item'><i class='fa-duotone fa-solid fa-circle-info'></i> Nessuna guida disponibile.</p>";

    startMediaBar();
    return;
  }

  // ✅ EPG presente -> barra EPG (normale) e stop media bar
  overlay?.classList.remove('media-progress'); // 🔵 normale
  stopMediaBar();

  el.epgNow.textContent = current.title;

  const total = current.stop - current.start;
  const done = now - current.start;
  const pct = total > 0 ? (done / total) * 100 : 0;
  el.epgFill.style.width = Math.max(0, Math.min(100, pct)) + "%";

  const nextPrograms = list.filter(p => p.start >= now).slice(0, 3);

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
      "<p class='epg-next-item'><i class='fa-duotone fa-solid fa-circle-info'></i> Nessun prossimo evento.</p>";
  }
}

/* ===========================
   PLAYER (HLS, DASH, MPEG-TS)
   =========================== */

function play(url, name) {
  url = String(url || "");
  const token = ++_playToken;

  const failAndSkip = (msg) => {
    if (token !== _playToken) return;
    markDeadAndSkip(msg || "Stream non disponibile");
  };

  // Spinner subito
  showQualityBadge("");
  showLoadStatus("loading", { token, title: `Caricamento: ${name || ""}` });
  updateTabTitle(name);

  // Pulisci player precedenti
  if (hlsInst) { try { hlsInst.destroy(); } catch {} hlsInst = null; }
  if (dashInst) { try { dashInst.reset(); } catch {} dashInst = null; }
  if (mpegtsInst) {
    try {
      mpegtsInst.pause();
      mpegtsInst.unload();
      mpegtsInst.detachMediaElement();
      mpegtsInst.destroy();
    } catch {}
    mpegtsInst = null;
  }

  // Reset video element
  el.video.pause();
  el.video.removeAttribute("src");
  el.video.load();
  stopMediaBar();
document.querySelector('.epg-overlay')?.classList.remove('media-progress');
  // 🔥 rileva audio-only (anche se categoria TV)
  checkIfAudioOnlyAndShowIcon(token);

  // Eventi stato
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
    showLoadStatus("loading", { token, title: `In attesa dati: ${name || ""}` });
  };

  el.video.onerror = () => {
    if (token !== _playToken) return;
    const err = el.video?.error;
    const msg = err?.message || (err?.code ? `Video error code ${err.code}` : "Errore di riproduzione");
    showLoadStatus("error", { token, title: msg });
    failAndSkip(msg);
  };

  // EPG
  activeChannelName = name;
  updateEPGUI(name);

  clearInterval(epgTimer);
  epgTimer = setInterval(() => {
    if (activeChannelName) updateEPGUI(activeChannelName);
  }, 15000);

  // Motore
  if (url.includes(".mpd")) {
    dashInst = dashjs.MediaPlayer().create();
    dashInst.initialize(el.video, url, true);
    attachDashQualityListeners(name);

    try {
      dashInst.on(dashjs.MediaPlayer.events.ERROR, () => {
        if (token !== _playToken) return;
        const msg = "Errore DASH";
        showLoadStatus("error", { token, title: msg });
        failAndSkip(msg);
      });
    } catch {}

  } else if (url.includes(".m3u8")) {
    if (Hls.isSupported()) {
      hlsInst = new Hls();
      hlsInst.loadSource(url);
      hlsInst.attachMedia(el.video);
      attachHlsQualityListeners(name);

      hlsInst.on(Hls.Events.MANIFEST_PARSED, () => {
        if (token !== _playToken) return;
        el.video.play().catch(() => {});
      });

      hlsInst.on(Hls.Events.ERROR, (_, data) => {
        if (token !== _playToken) return;
        if (data?.fatal) {
          const msg = `HLS: ${data?.details || "errore fatale"}`;
          showLoadStatus("error", { token, title: msg });
          failAndSkip(msg);
        }
      });

    } else {
      el.video.src = url;
      detectQualityFromName(name);
      el.video.play().catch(() => {});
    }

  } else if (url.includes(".ts") || url.includes("type=m3u_plus")) {
    if (mpegts.getFeatureList().mseLivePlayback) {
      mpegtsInst = mpegts.createPlayer({
        type: "mse",
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
          const msg = "Errore MPEG-TS";
          showLoadStatus("error", { token, title: msg });
          failAndSkip(msg);
        });
      } catch {}

    } else {
      el.video.src = url;
      el.video.play().catch(() => {});
    }

  } else {
    el.video.src = url;
    detectQualityFromName(name);
    el.video.play().catch(() => {});
  }
}

/* ===========================
   ICONA TIPO CANALE
   =========================== */

function updateChannelTypeIcon(groupName) {
  const icon = document.getElementById("channelTypeIcon");
  if (!icon) return;

  const isRadio = String(groupName || "").toLowerCase().includes("radio");
  icon.className = isRadio ? "fa-solid fa-radio" : "fa-solid fa-tv";
  icon.style.color = "#ffffff8a";
}

/* ===========================
   CONTATORE DINAMICO (Radio vs TV)
   =========================== */

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

/* ===========================
   SISTEMA DI CARICAMENTO IBRIDO (URL + LOCALE)
   =========================== */

async function init() {
  applyUiScale();
  updateTabTitle(null);
  initPlayPauseSync();
  initSidebarClock();
  initOnlineUsers();
  await fetchEpg();

  try {
    const cachedChans = localStorage.getItem(LOCAL_STORAGE_CHANNELS_KEY);
    if (cachedChans) {
      allChannels = JSON.parse(cachedChans);
      console.log("✅ Caricati dalla memoria:", allChannels.length, "canali.");
      renderCats();
    }

    console.log("Aggiornamento canali da URL in corso...");
    await refreshAllPlaylists();

  } catch (e) {
    console.error("Errore critico durante init:", e);
  }
}

async function refreshAllPlaylists() {
  const finalUrlsToLoad = getAllPlaylistUrls();
  let hasNew = false;

  for (let url of finalUrlsToLoad) {
    url = (url || "").trim();
    if (!url) continue;

    try {
      const res = await fetch(url);
      const text = await res.text();
      const lines = text.split('\n');
      let cur = null;

      lines.forEach(l => {
        l = l.trim();
        if (l.startsWith('#EXTINF:')) {
          const nome = l.split(',').pop().trim();
          const logo = (l.match(/tvg-logo="([^"]*)"/i) || [])[1] || "";
          const group = (l.match(/group-title="([^"]*)"/i) || [])[1] || "Generale";
          cur = { name: nome, logo, group };
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
      console.warn("Impossibile aggiornare URL:", url);
    }
  }

  if (hasNew) {
    saveToCache();
    renderCats();
    console.log("Playlist aggiornate. Canali totali in memoria:", allChannels.length);
  }
}

/* ✅ helper: seleziona categoria senza autoplay */
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
    if (l) { l.src = ch.logo; l.style.display = 'block'; }

    updateChannelTypeIcon(ch.group);
    play(ch.url, ch.name);
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

/* ===========================
   SEARCH GLOBALE (tutte le categorie)
   =========================== */

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

/* ===========================
   UI AUTO HIDE
   =========================== */

function showUI() {
  if (!el.ui) return;
  el.ui.classList.add('visible');
  clearTimeout(hideUiTimer);
  hideUiTimer = setTimeout(() => el.ui.classList.remove('visible'), 5000);
}

document.addEventListener('mousemove', showUI);
document.addEventListener('keydown', showUI);

init();

/* ===========================
   URL, FILE, CACHE
   =========================== */

async function addCustomUrl() {
  const url = prompt("Inserisci l'URL della playlist M3U:");
  if (!url || !url.startsWith('http')) return;

  let currentLists = [];
  try {
    currentLists = JSON.parse(localStorage.getItem(LOCAL_STORAGE_PLAYLISTS_KEY)) || [];
  } catch(e) { currentLists = []; }

  if (!currentLists.includes(url)) {
    currentLists.push(url);
    localStorage.setItem(LOCAL_STORAGE_PLAYLISTS_KEY, JSON.stringify(currentLists));

    try {
      const res = await fetch(url);
      const text = await res.text();
      const lines = text.split('\n');
      let cur = null;
      let added = 0;

      lines.forEach(l => {
        l = l.trim();
        if (l.startsWith('#EXTINF:')) {
          const nome = l.split(',').pop().trim();
          const logo = (l.match(/tvg-logo="([^"]*)"/i) || [])[1] || "";
          const group = (l.match(/group-title="([^"]*)"/i) || [])[1] || "Altri";
          cur = { name: nome, logo, group };
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
        alert(`Aggiunti ${added} nuovi canali! I tuoi canali locali sono al sicuro.`);
      }
    } catch(err) {
      alert("Errore nel caricamento dell'URL.");
    }
  } else {
    alert("Questa playlist è già presente.");
  }
}

function loadLocalFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const lines = text.split('\n');
    let cur = null;
    let localChans = [];

    lines.forEach(l => {
      l = l.trim();
      if (l.startsWith('#EXTINF:')) {
        const nome = l.split(',').pop().trim();
        const logo = (l.match(/tvg-logo="([^"]*)"/i) || [])[1] || "";
        const group = (l.match(/group-title="([^"]*)"/i) || [])[1] || "Altri";
        cur = { name: nome, logo, group };
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
      alert("Caricati " + localChans.length + " canali dal Altri.");
    } else {
      alert("Il file non sembra una playlist M3U valida.");
    }
  };
  reader.readAsText(file);
}

function clearCache() {
  let customCount = 0;
  try {
    const customData = JSON.parse(localStorage.getItem(LOCAL_STORAGE_PLAYLISTS_KEY) || "[]");
    customCount = customData.length;
  } catch (e) { customCount = 0; }

  if (customCount === 0 && (!allChannels || allChannels.length === 0)) {
    alert("Non hai ancora aggiunto nessuna lista o Altri.");
    return;
  }

  const messaggio = "Attenzione: questo rimuoverà solo le liste che hai aggiunto e non le liste base. Procedere?";
  if (confirm(messaggio)) {
    localStorage.removeItem(LOCAL_STORAGE_CHANNELS_KEY);
    localStorage.removeItem(LOCAL_STORAGE_PLAYLISTS_KEY);
    alert("Liste aggiunte rimosse. L'app verrà ricaricata.");
    location.reload();
  }
}

function saveToCache() {
  try {
    localStorage.setItem(LOCAL_STORAGE_CHANNELS_KEY, JSON.stringify(allChannels));
    console.log("💾 Cache aggiornata: " + allChannels.length + " canali salvati.");
  } catch (e) {
    console.error("Errore durante il salvataggio in cache:", e);
  }
}

/* ===========================
   CLOCK (current-date)
   =========================== */

function updateDateTime() {
  const oraAttuale = new Date();
  const options = { hour: '2-digit', minute: '2-digit', hour12: false };
  let dataFormattata = new Intl.DateTimeFormat('it-IT', options).format(oraAttuale);
  dataFormattata = dataFormattata.replace(',', '');
  if (document.getElementById('current-date')) {
    document.getElementById('current-date').textContent = dataFormattata;
  }
}

updateDateTime();
setInterval(updateDateTime, 60000);

/* ===========================
   PLAYER CONTROLS (FIXED)
   =========================== */

function togglePlay() {
  if (!el.video) return;
  if (el.video.paused) {
    el.video.play().catch(err => console.log("Play bloccato:", err));
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
    document.documentElement.requestFullscreen().catch(() => {});
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
  if (btnRW)   btnRW.onclick   = (e) => { e.stopPropagation(); rewind(); };
  if (btnFF)   btnFF.onclick   = (e) => { e.stopPropagation(); forward(); };
  if (btnFS)   btnFS.onclick   = (e) => { e.stopPropagation(); toggleFullScreen(); };

  console.log("Listeners Player: Agganciati ✅");
}

/* ===========================
   CONTROLLI VOLUME STYLE YT
   =========================== */

function changeVolume(val) {
  if (!el.video) return;
  const volumeValue = parseFloat(val);
  el.video.volume = volumeValue;

  const muteBtnIcon = document.querySelector('#muteBtn i');
  if (muteBtnIcon) {
    muteBtnIcon.className = volumeValue === 0 ? "fa-duotone fa-solid fa-volume-xmark" :
                            volumeValue < 0.5 ? "fa-duotone  fa-solid fa-volume-low" :
                            "fa-duotone  fa-solid fa-volume-high";
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
/* ===========================
   XVB Playlist Manager (UI)
   Requires: playlist-storage-v2.js
   =========================== */

const CHANNEL_CACHE_KEY = "dvb-m^7Y!zR4*P8&kQ3@h";

const SERVER_PLAYLISTS = [
  { name: "xvb-it nazionali", url: "https://jonathansanfilippo.github.io/xvb-server-lists/xvb-it-nazionali" },
  { name: "xvb-it regionali", url: "https://jonathansanfilippo.github.io/xvb-server-lists/xvb-it-regionali" },
  { name: "xvb-it radio",     url: "https://jonathansanfilippo.github.io/xvb-server-lists/xvb-it-radio" }
];

const SERVER_PLAYLISTS_2 = [
  { name: "iptv-org World", url: "https://iptv-org.github.io/iptv/index.m3u" },
  { name: "Free-TV World",  url: "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8" }
];

const $ = (id) => document.getElementById(id);

function setStatus(id, msg, type = "info") {
  const el = $(id);
  if (!el) return;
  el.innerHTML = msg;
  el.classList.remove("success", "error", "warn", "info");
  el.classList.add("status", type);
}

function isValidHttpsUrl(input) {
  try {
    const u = new URL(input);
    return u.protocol === "https:" && !!u.hostname;
  } catch {
    return false;
  }
}

function looksLikeM3U(text) {
  if (!text) return false;
  return /#EXTM3U/i.test(text);
}

function broadcastChanged() {
  try {
    localStorage.removeItem(CHANNEL_CACHE_KEY);
    if (!("BroadcastChannel" in window)) return;
    const bc = new BroadcastChannel("xvb_playlists_v2");
    bc.postMessage({ type: "changed", t: Date.now() });
    bc.close();
  } catch {}
}

function formatDate(ts) {
  try { return new Date(ts).toLocaleString(); }
  catch { return ""; }
}

/* ===========================
   SAVED LIST
   =========================== */

function renderSaved() {
  const list = $("playlistList");
  const totalPlaylistsEl = $("totalPlaylists");
  const totalChannelsEl = $("totalChannels");

  if (!list) return;
  list.innerHTML = "";

  const items = (pl2_listIndex() || []).slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  let channelCount = 0;

  items.forEach(it => {
    const raw = localStorage.getItem("xvb.playlists.item.v2." + it.id);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const text = parsed.m3uText || parsed.content || "";
      const matches = text.match(/#EXTINF/gi);
      if (matches) channelCount += matches.length;
    } catch {}
  });

  if (totalPlaylistsEl) totalPlaylistsEl.textContent = String(items.length);
  if (totalChannelsEl) totalChannelsEl.textContent = String(channelCount);

  if (!items.length) {
    setStatus("statusList",
      `<i class="fa-solid fa-circle-info"></i> No playlists saved yet.`,
      "info"
    );
    return;
  }

  setStatus("statusList",
    `<i class="fa-solid fa-circle-info"></i> ${items.length} playlist(s) saved.`,
    "info"
  );

  items.forEach((it) => {
    const li = document.createElement("li");
    li.className = "item";

    const del = document.createElement("button");
    del.className = "iconbtn warning";
    del.innerHTML = '<i class="fa-duotone fa-solid fa-trash"></i>';
    del.onclick = () => {
      if (!confirm(`Delete "${it.name}"?`)) return;
      pl2_remove(it.id);
      broadcastChanged();
      renderSaved();
      setStatus("statusList",
        `<i class="fa-solid fa-circle-info"></i> Deleted: ${it.name}`,
        "info"
      );
    };

    const left = document.createElement("div");
    left.className = "item-left";

    const name = document.createElement("div");
    name.className = "item-name";

    const isFromServer  = SERVER_PLAYLISTS.some(s => s.url === it.url);
    const isFromServer2 = SERVER_PLAYLISTS_2.some(s => s.url === it.url);

    const dotClass =
      it.type === "local" ? "dot-local" :
      isFromServer2 ? "dot-server2" :
      isFromServer  ? "dot-server"  :
      "dot-url";

    const typeLabel =
      it.type === "local" ? "LOCAL" :
      isFromServer2 ? "THIRD-PARTY" :
      isFromServer  ? "XVB-SERVER" :
      "URL";

    name.innerHTML =
      `<i class="fa-solid fa-circle ${dotClass}"></i>
       <span style="">${it.name || "(no name)"}</span>`;

    const meta = document.createElement("div");
    meta.className = "item-meta";
    meta.innerHTML = `<span class="pill ${dotClass}">${typeLabel}</span>`;
    if (it.createdAt) meta.innerHTML += `<span class="pill">${formatDate(it.createdAt)}</span>`;

    left.appendChild(name);
    left.appendChild(meta);

    li.appendChild(del);
    li.appendChild(left);
    list.appendChild(li);
  });
}

/* ===========================
   SERVER LIST RENDER (icon + color per list)
   =========================== */

function renderServer(
  listId,
  statusId,
  data,
  label = "XVB-SERVER",
  dotClass = "dot-server",
  iconClass = "fa-duotone fa-solid fa-cloud-arrow-down",
  btnExtraClass = "primary"
) {
  const ul = $(listId);
  if (!ul) return;
  ul.innerHTML = "";

  (data || []).forEach((pl) => {
    const li = document.createElement("li");
    li.className = "item";

    const btn = document.createElement("button");
    btn.className = `iconbtn ${btnExtraClass}`.trim();
    btn.innerHTML = `<i class="${iconClass}"></i>`;

    btn.onclick = async () => {
      // spinner
      btn.innerHTML = `<i class="fa-duotone fa-solid fa-spinner-third fa-spin"></i>`;

      const res = pl2_addUrl(pl.url, pl.name);

      if (res.ok) {
        try {
          const response = await fetch(pl.url, { cache: "no-store" });
          if (!response.ok) throw new Error("fetch");
          const text = await response.text();

          if (!looksLikeM3U(text)) throw new Error("not_m3u");

          const itemKey = "xvb.playlists.item.v2." + res.id;
          const itemData = JSON.parse(localStorage.getItem(itemKey));
          itemData.m3uText = text;
          localStorage.setItem(itemKey, JSON.stringify(itemData));

          setStatus(statusId, `<i class="fa-solid fa-check"></i> ${pl.name} saved.`, "success");
        } catch {
          try { pl2_remove(res.id); } catch {}
          setStatus(statusId, `<i class="fa-solid fa-triangle-exclamation"></i> Invalid playlist.`, "error");
        }

        // restore icon
        btn.innerHTML = `<i class="${iconClass}"></i>`;
        broadcastChanged();
        renderSaved();
      } else {
        setStatus(statusId, `<i class="fa-solid fa-circle-exclamation"></i> Already saved.`, "warn");
        btn.innerHTML = `<i class="${iconClass}"></i>`;
      }
    };

    const left = document.createElement("div");
    left.className = "item-left";
    left.innerHTML =
      `<div class="item-name">${pl.name}</div>
       <div class="item-meta"><span class="pill ${dotClass}">${label}</span></div>`;

    li.appendChild(btn);
    li.appendChild(left);
    ul.appendChild(li);
  });
}

/* ===========================
   UI WIRING
   =========================== */

function wireUI() {
  const btnAddUrl = $("btnAddUrl");
  const btnAddFile = $("btnAddFile");
  const btnClearAll = $("btnClearAll");
  const fileInput = $("fileInput");

  if (fileInput) {
    fileInput.addEventListener("change", () => {
      if (fileInput.files && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = () => {
          const res = pl2_addLocal(file.name, reader.result);
          if (res.ok) {
            fileInput.value = "";
            broadcastChanged();
            renderSaved();
            setStatus("statusFile",
              `<i class="fa-solid fa-check"></i> Saved: ${file.name}`,
              "success"
            );
          } else {
            setStatus("statusFile",
              `<i class="fa-solid fa-circle-exclamation"></i> Already saved.`,
              "warn"
            );
          }
        };
        reader.onerror = () =>
          setStatus("statusFile",
            `<i class="fa-solid fa-triangle-exclamation"></i> File read failed.`,
            "error"
          );
        reader.readAsText(file);
      }
    });
  }

  if (btnAddUrl) {
    btnAddUrl.onclick = async () => {
      const urlInput = $("urlInput");
      const url = (urlInput?.value || "").trim();

      if (!url) {
        setStatus("statusUrl",
          `<i class="fa-solid fa-circle-exclamation"></i> Enter a URL first.`,
          "warn"
        );
        return;
      }

      if (!isValidHttpsUrl(url)) {
        setStatus("statusUrl",
          `<i class="fa-solid fa-triangle-exclamation"></i> Only https:// URLs allowed.`,
          "error"
        );
        return;
      }

      const res = pl2_addUrl(url);

      if (res.ok) {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error("fetch");
          const text = await response.text();

          if (!looksLikeM3U(text)) throw new Error("not_m3u");

          const itemKey = "xvb.playlists.item.v2." + res.id;
          const itemData = JSON.parse(localStorage.getItem(itemKey));
          itemData.m3uText = text;
          localStorage.setItem(itemKey, JSON.stringify(itemData));

          if (urlInput) urlInput.value = "";

          setStatus("statusUrl",
            `<i class="fa-solid fa-check"></i> Playlist saved.`,
            "success"
          );

          broadcastChanged();
          renderSaved();
        } catch {
          try { pl2_remove(res.id); } catch {}
          broadcastChanged();
          renderSaved();

          setStatus("statusUrl",
            `<i class="fa-solid fa-triangle-exclamation"></i> Invalid M3U playlist.`,
            "error"
          );
        }

      } else {
        setStatus("statusUrl",
          `<i class="fa-solid fa-circle-exclamation"></i> Already saved.`,
          "warn"
        );
      }
    };
  }

  if (btnAddFile) btnAddFile.onclick = () => fileInput && fileInput.click();

  if (btnClearAll) {
    btnClearAll.onclick = (e) => {
      e.preventDefault();
      if (!confirm("Are you sure? This will delete ALL playlists.")) return;
      pl2_clearAll();
      broadcastChanged();
      renderSaved();
      setStatus("statusList",
        `<i class="fa-solid fa-circle-info"></i> All playlists removed.`,
        "info"
      );
    };
  }
}

/* ===========================
   INIT
   =========================== */

function initManager() {
  wireUI();

  // SERVER 1 (cloud, colore primary)
  renderServer(
    "serverPlaylistList",
    "statusServer",
    SERVER_PLAYLISTS,
    "XVB-SERVER",
    "dot-server",
    "fa-duotone fa-solid fa-cloud-arrow-down",
    "primary"
  );

  // SERVER 2 / THIRD-PARTY  fa-duotone fa-solid fa-cloud-question"></i>
  renderServer(
    "serverPlaylistList2",
    "statusServer2",
    SERVER_PLAYLISTS_2,
    "THIRD-PARTY",
    "dot-server2",
    "fa-duotone fa-solid fa-cloud-question",
    "server2"
  );

  renderSaved();
}

document.addEventListener("DOMContentLoaded", initManager);





/* ===========================
   EPG STATUS + Download
   =========================== */

document.addEventListener("DOMContentLoaded", async () => {

  const icon  = document.getElementById("epg-status-icon");
  const shaEl = document.getElementById("epg-commit-sha");
  const dateEl = document.getElementById("epg-commit-date");
  const msgEl = document.getElementById("epg-commit-msg");

  const REPO = "jonathansanfilippo/xvb-epg";
  const BRANCH = "main";
  const XML_PATH = "docs/epg.xml";
  const XML_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${XML_PATH}`;

  if (!icon) return;

  // CHECKING
  icon.style.color = "rgb(253, 187, 102)";
  icon.title = "Checking EPG status...";
  icon.classList.remove("epg-online");

  if (msgEl) {
    msgEl.className = "status warn";
    msgEl.innerHTML = `
      <i class="fa-solid fa-triangle-exclamation"></i>
      Checking EPG build status...
    `;
  }

  try {
    // Last commit
    const commitRes = await fetch(
      `https://api.github.com/repos/${REPO}/commits?path=${encodeURIComponent(XML_PATH)}&sha=${encodeURIComponent(BRANCH)}&per_page=1`,
      { headers: { "Accept": "application/vnd.github+json" } }
    );

    if (!commitRes.ok) throw new Error("GitHub API error");

    const commitData = await commitRes.json();
    const commit = commitData[0];

    if (commit) {
      if (shaEl) shaEl.textContent = commit.sha.slice(0, 7);

      const iso =
        commit.commit?.committer?.date ||
        commit.commit?.author?.date;

      if (dateEl) dateEl.textContent = new Date(iso).toLocaleString("en-GB");
    }

    // Check XML reachable
    const xmlCheck = await fetch(XML_URL, { method: "HEAD", cache: "no-store" });

    if (xmlCheck.ok) {
      icon.style.color = "#3fb950";
      icon.classList.add("epg-online");
      icon.title = "EPG Online";

      if (msgEl) {
        msgEl.className = "status success";
        msgEl.innerHTML = `
          <i class="fa-solid fa-check"></i>
          EPG build completed successfully.
        `;
      }
    } else {
      throw new Error("XML not reachable");
    }

  } catch (err) {
    icon.style.color = "#f85149";
    icon.classList.remove("epg-online");
    icon.title = "EPG Offline";

    if (msgEl) {
      msgEl.className = "status error";
      msgEl.innerHTML = `
        <i class="fa-solid fa-triangle-exclamation"></i>
        EPG build failed or XML unavailable.
      `;
    }

    console.error("EPG status error:", err);
  }
});

// Download button
document.getElementById("btnDownloadEpg")?.addEventListener("click", () => {
  window.open("https://github.com/jonathansanfilippo/xvb-epg", "_blank");
});
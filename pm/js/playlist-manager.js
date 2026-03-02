/* ===========================
   XVB Playlist Manager (UI)
   Requires: playlist-storage-v2.js
   =========================== */

const CHANNEL_CACHE_KEY = "dvb-m^7Y!zR4*P8&kQ3@h";

const SERVER_PLAYLISTS = [
  { name: "xvb-it-nazionali", url: "https://jonathansanfilippo.github.io/xvb-server-lists/xvb-it-nazionali" },
  { name: "xvb-it-regionali", url: "https://jonathansanfilippo.github.io/xvb-server-lists/xvb-it-regionali" },
  { name: "xvb-it-radio", url: "https://jonathansanfilippo.github.io/xvb-server-lists/xvb-it-radio" }
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
  // tollerante: molti M3U iniziano con #EXTM3U, alcuni hanno BOM/spazi
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

    const isFromServer = SERVER_PLAYLISTS.some(s => s.url === it.url);
    const dotClass = it.type === "local" ? "dot-local" : (isFromServer ? "dot-server" : "dot-url");

    name.innerHTML =
      `<i class="fa-solid fa-circle ${dotClass}"></i>
       <span style="margin-left:8px;">${it.name || "(no name)"}</span>`;

    const meta = document.createElement("div");
    meta.className = "item-meta";
    const typeLabel = it.type === "local" ? "LOCAL" : (isFromServer ? "SERVER" : "URL");
    meta.innerHTML = `<span class="pill ${dotClass}">${typeLabel}</span>`;
    if (it.createdAt) meta.innerHTML += `<span class="pill">${formatDate(it.createdAt)}</span>`;

    left.appendChild(name);
    left.appendChild(meta);

    li.appendChild(del);
    li.appendChild(left);
    list.appendChild(li);
  });
}

function renderServer() {
  const ul = $("serverPlaylistList");
  if (!ul) return;
  ul.innerHTML = "";

  SERVER_PLAYLISTS.forEach((pl) => {
    const li = document.createElement("li");
    li.className = "item";

    const btn = document.createElement("button");
    btn.className = "iconbtn primary";
    btn.innerHTML = `<i class="fa-duotone fa-solid fa-cloud-arrow-down"></i>`;

    btn.onclick = async () => {
      btn.innerHTML = `<i class="fa-duotone fa-solid fa-spinner-third"></i>`;
      const res = pl2_addUrl(pl.url, pl.name);

      if (res.ok) {
        try {
          const response = await fetch(pl.url);
          if (!response.ok) throw new Error("fetch");
          const text = await response.text();

          if (!looksLikeM3U(text)) throw new Error("not_m3u");

          const itemKey = "xvb.playlists.item.v2." + res.id;
          const itemData = JSON.parse(localStorage.getItem(itemKey));
          itemData.m3uText = text;
          localStorage.setItem(itemKey, JSON.stringify(itemData));

          setStatus("statusServer", `<i class="fa-solid fa-check"></i> ${pl.name} saved.`, "success");
        } catch {
          // rollback
          try { pl2_remove(res.id); } catch {}
          setStatus("statusServer", `<i class="fa-solid fa-triangle-exclamation"></i> Invalid playlist.`, "error");
        }

        btn.innerHTML = `<i class="fa-duotone fa-solid fa-cloud-arrow-down"></i>`;
        broadcastChanged();
        renderSaved();
      } else {
        setStatus("statusServer",
          `<i class="fa-solid fa-circle-exclamation"></i> Already saved.`,
          "warn"
        );
        btn.innerHTML = `<i class="fa-duotone fa-solid fa-cloud-arrow-down"></i>`;
      }
    };

    const left = document.createElement("div");
    left.className = "item-left";
    left.innerHTML =
      `<div class="item-name">${pl.name}</div>
       <div class="item-meta"><span class="pill">SERVER</span></div>`;

    li.appendChild(btn);
    li.appendChild(left);
    ul.appendChild(li);
  });
}

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
          // rollback se download fallisce o non è M3U
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

function initManager() {
  wireUI();
  renderServer();
  renderSaved();
}

document.addEventListener("DOMContentLoaded", initManager);
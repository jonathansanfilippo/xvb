/* ===========================
   XVB Playlist Manager (UI)
   Requires: playlist-storage-v2.js
   =========================== */

const CHANNEL_CACHE_KEY = "dvb-m^7Y!zR4*P8&kQ3@h";

const SERVER_PLAYLISTS = [
  {
    name: "XVB - Italy",
    url: "https://raw.githubusercontent.com/jonathansanfilippo/xvb-data/refs/heads/main/data/lists/xvb-it.m3u"
  },
  {
    name: "iptv-org - IT.rakuten",
    url: "https://raw.githubusercontent.com/iptv-org/iptv/refs/heads/master/streams/it_rakuten.m3u"
  },
  {
    name: "UK",
    url: "https://raw.githubusercontent.com/jonathansanfilippo/xvb-data/refs/heads/main/data/lists/xvb-uk.m3u"
  }
];

const $ = (id) => document.getElementById(id);

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

// --- RENDERING E CONTEGGIO CANALI ---
function renderSaved() {
  const list = $("playlistList");
  const status = $("statusList");
  const totalPlaylistsEl = $("totalPlaylists");
  const totalChannelsEl = $("totalChannels");

  if (!list || !status) return;
  list.innerHTML = "";

  const items = (pl2_listIndex() || []).slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  let channelCount = 0;
  
  items.forEach(it => {
    const raw = localStorage.getItem("xvb.playlists.item.v2." + it.id);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        // Conta sia file locali che scaricati (m3uText o content)
        const text = parsed.m3uText || parsed.content || "";
        if (text) {
          const matches = text.match(/#EXTINF/gi);
          if (matches) channelCount += matches.length;
        }
      } catch (e) {}
    }
  });

  // Aggiorna gli span con i numeri
  if (totalPlaylistsEl) totalPlaylistsEl.textContent = String(items.length);
  if (totalChannelsEl) totalChannelsEl.textContent = String(channelCount);

  if (!items.length) {
    status.textContent = "No playlists saved yet.";
    return;
  }

  status.textContent = `${items.length} playlist(s) saved.`;

  items.forEach((it) => {
    const li = document.createElement("li");
    li.className = "item";

    const del = document.createElement("button");
    del.className = "iconbtn danger";
    del.innerHTML = '<i class="fa-duotone fa-solid fa-trash"></i>';
    del.onclick = () => {
      if (!confirm(`Delete "${it.name}"?`)) return;
      pl2_remove(it.id);
      broadcastChanged();
      renderSaved(); 
    };

    const left = document.createElement("div");
    left.className = "item-left";
    const name = document.createElement("div");
    name.className = "item-name";
    const isFromServer = SERVER_PLAYLISTS.some(s => s.url === it.url);
    let dotClass = it.type === "local" ? "dot-local" : (isFromServer ? "dot-server" : "dot-url");
    
    name.innerHTML = `<i class="fa-solid fa-circle ${dotClass}"></i> <span style="margin-left:8px;">${it.name || "(no name)"}</span>`;

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

// --- SERVER LIST CON DOWNLOAD IMMEDIATO ---
function renderServer() {
  const ul = $("serverPlaylistList");
  const status = $("statusServer");
  if (!ul) return;
  ul.innerHTML = "";

  SERVER_PLAYLISTS.forEach((pl) => {
    const li = document.createElement("li");
    li.className = "item";

    const btn = document.createElement("button");
    btn.className = "iconbtn primary";
    btn.innerHTML = `<i class="fa-duotone fa-solid fa-cloud-arrow-down"></i>`;
    
    btn.onclick = async () => {
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
      const res = pl2_addUrl(pl.url, pl.name);
      
      if (res.ok) {
        try {
          const response = await fetch(pl.url);
          const text = await response.text();
          const itemKey = "xvb.playlists.item.v2." + res.id;
          const itemData = JSON.parse(localStorage.getItem(itemKey));
          itemData.m3uText = text;
          localStorage.setItem(itemKey, JSON.stringify(itemData));
        } catch (e) { console.warn("Fetch failed"); }
        
        if (status) status.textContent = `${pl.name} saved.`;
        btn.innerHTML = `<i class="fa-duotone fa-solid fa-cloud-arrow-down"></i>`;
        broadcastChanged();
        renderSaved();
      } else {
        if (status) status.textContent = "Already saved.";
        btn.innerHTML = `<i class="fa-duotone fa-solid fa-cloud-arrow-down"></i>`;
      }
    };

    const left = document.createElement("div");
    left.className = "item-left";
    left.innerHTML = `<div class="item-name">${pl.name}</div><div class="item-meta"><span class="pill">SERVER</span></div>`;

    li.appendChild(btn);
    li.appendChild(left);
    ul.appendChild(li);
  });
}

function wireUI() {
  const btnAddUrl = $("btnAddUrl");
  const btnAddFile = $("btnAddFile");
  const btnClearAll = $("btnClearAll"); // Corrisponde all'ID nel tuo manager.html
  const fileInput = $("fileInput");

  if (fileInput) {
    fileInput.addEventListener("change", () => {
      const statusEl = $("statusFile");
      if (fileInput.files && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = () => {
          const res = pl2_addLocal(file.name, reader.result);
          if (res.ok) {
            fileInput.value = ""; 
            broadcastChanged();
            renderSaved();
            if (statusEl) statusEl.textContent = "Saved: " + file.name;
          }
        };
        reader.readAsText(file);
      }
    });
  }

  if (btnAddUrl) {
    btnAddUrl.onclick = async () => {
      const url = ($("urlInput")?.value || "").trim();
      if (!url) return;
      const res = pl2_addUrl(url);
      if (res.ok) {
        try {
          const response = await fetch(url);
          const text = await response.text();
          const itemKey = "xvb.playlists.item.v2." + res.id;
          const itemData = JSON.parse(localStorage.getItem(itemKey));
          itemData.m3uText = text;
          localStorage.setItem(itemKey, JSON.stringify(itemData));
        } catch (e) {}
        if ($("urlInput")) $("urlInput").value = "";
        broadcastChanged();
        renderSaved();
      }
    };
  }

  if (btnAddFile) btnAddFile.onclick = () => fileInput && fileInput.click();

  // --- RESET FIX (Usa btnClearAll) ---
  if (btnClearAll) {
    btnClearAll.onclick = (e) => {
      e.preventDefault();
      if (!confirm("Are you sure? This will delete ALL playlists.")) return;
      pl2_clearAll();
      broadcastChanged();
      renderSaved();
      // Reset manuale degli span
      if ($("totalPlaylists")) $("totalPlaylists").textContent = "0";
      if ($("totalChannels")) $("totalChannels").textContent = "0";
    };
  }
}

function initManager() {
  wireUI();
  renderServer();
  renderSaved();
}

document.addEventListener("DOMContentLoaded", initManager);
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

function setStatus(id, msg) {
  const el = $(id);
  if (el) el.textContent = msg || "";
}

function renderSaved() {
  const list = $("playlistList");
  const status = $("statusList");
  if (!list || !status) return;

  list.innerHTML = "";

  const items = (pl2_listIndex() || []).slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  if (!items.length) {
    status.textContent = "No playlists saved yet.";
    return;
  }

  status.textContent = `${items.length} playlist(s) saved.`;

  items.forEach((it) => {
    const li = document.createElement("li");
    li.className = "item";

    // 1. Bottone Delete (A SINISTRA)
    const del = document.createElement("button");
    del.className = "iconbtn danger";
    del.innerHTML = '<i class="fa-duotone fa-solid fa-trash"></i>';
    del.onclick = () => {
      if (!confirm(`Delete "${it.name}"?`)) return;
      pl2_remove(it.id);
      broadcastChanged();
      renderSaved();
    };

    // 2. Contenuto Testuale
    const left = document.createElement("div");
    left.className = "item-left";

    const name = document.createElement("div");
    name.className = "item-name";
    const isFromServer = SERVER_PLAYLISTS.some(s => s.url === it.url);
    
    // Identifichiamo la classe colore in base al tipo
    let dotClass = it.type === "local" ? "dot-local" : (isFromServer ? "dot-server" : "dot-url");
    
    const dot = document.createElement("i");
    dot.className = `fa-solid fa-circle ${dotClass}`;
    
    const textSpan = document.createElement("span");
    textSpan.textContent = it.name || "(no name)";
    textSpan.style.marginLeft = "8px";

    name.appendChild(dot);
    name.appendChild(textSpan);

    const meta = document.createElement("div");
    meta.className = "item-meta";
    
    // PILL TYPE con colore dinamico
    const pillType = document.createElement("span");
    // Applichiamo sia la classe 'pill' che la classe colore (es. 'dot-local')
    pillType.className = `pill ${dotClass}`; 
    pillType.textContent = it.type === "local" ? "LOCAL" : (isFromServer ? "SERVER" : "URL");

    // PILL DATE (colore neutro var--muted come da CSS)
    const pillDate = document.createElement("span");
    pillDate.className = "pill";
    pillDate.textContent = it.createdAt ? formatDate(it.createdAt) : "";

    meta.appendChild(pillType);
    if (pillDate.textContent) meta.appendChild(pillDate);

    left.appendChild(name);
    left.appendChild(meta);

    // AGGIUNTA AL DOM: Prima il tasto delete, poi il blocco testo
    li.appendChild(del);
    li.appendChild(left);
    list.appendChild(li);
  });
}


function renderServer() {
  const ul = $("serverPlaylistList");
  const status = $("statusServer");
  if (!ul) return;

  ul.innerHTML = "";

  SERVER_PLAYLISTS.forEach((pl) => {
    const li = document.createElement("li");
    li.className = "item";

    // 1. Bottone Download (ORA A SINISTRA)
    const btn = document.createElement("button");
    btn.className = "iconbtn primary";
    btn.innerHTML = `<i class="fa-duotone fa-solid fa-cloud-arrow-down"></i>`;
    btn.onclick = () => {
      const res = pl2_addUrl(pl.url);
      if (!res || res.ok === false) {
        if (status) status.textContent = res?.msg || "Already saved.";
        return;
      }
      if (status) status.textContent = `${pl.name} saved.`;
      broadcastChanged();
      renderSaved();
    };

    // 2. Contenuto Testuale
    const left = document.createElement("div");
    left.className = "item-left";

    const name = document.createElement("div");
    name.className = "item-name";
    
    const dot = document.createElement("i");
    dot.className = "";
    
    const textSpan = document.createElement("span");
    textSpan.textContent = pl.name;
    textSpan.style.marginLeft = "0px";

    name.appendChild(dot);
    name.appendChild(textSpan);

    const meta = document.createElement("div");
    meta.className = "item-meta";
    meta.innerHTML = `<span class="pill"></span>`;

    left.appendChild(name);
    left.appendChild(meta);

    // AGGIUNTA AL DOM: Prima il tasto, poi il testo
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

  // --- GESTIONE CARICAMENTO AUTOMATICO ---
  if (fileInput) {
    // Rimuoviamo subito la classe empty all'avvio per non avere il rosso fisso
    fileInput.classList.remove("empty");

    fileInput.addEventListener("change", () => {
      const statusEl = $("statusFile");
      
      if (fileInput.files && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        
        reader.onload = () => {
          const text = reader.result;
          const res = pl2_addLocal(file.name, text);
          
          if (res.ok) {
            if (statusEl) {
              statusEl.textContent = "Saved: " + file.name;
              statusEl.style.color = "#28c5a8"; // Verde successo
            }
            // Reset campo: svuotiamo e togliamo il rosso
            fileInput.value = ""; 
            fileInput.classList.remove("empty"); 

            broadcastChanged();
            renderSaved();
          } else {
            if (statusEl) {
              statusEl.textContent = res.msg || "Error";
              statusEl.style.color = "var(--danger)"; // Rosso errore
            }
          }
          // Reset colore testo dopo 3 secondi
          setTimeout(() => { if (statusEl) statusEl.style.color = ""; }, 3000);
        };
        reader.readAsText(file);
      }
    });
  }

  if (btnAddUrl) {
    btnAddUrl.addEventListener("click", () => {
      const url = ($("urlInput")?.value || "").trim();
      const res = pl2_addUrl(url);
      const statusEl = $("statusUrl");
      
      if (statusEl) {
        statusEl.textContent = res.ok ? "Saved." : res.msg;
        statusEl.style.color = res.ok ? "#28c5a8" : "var(--danger)";
        setTimeout(() => { statusEl.style.color = ""; }, 3000);
      }

      if (res.ok && $("urlInput")) $("urlInput").value = "";
      if (res.ok) broadcastChanged();
      renderSaved();
    });
  }

  // Il tasto Add File ora apre direttamente il selettore
  if (btnAddFile) {
    btnAddFile.addEventListener("click", () => {
      if (fileInput) fileInput.click();
    });
  }

  if (btnClearAll) {
    btnClearAll.addEventListener("click", () => {
      if (!confirm("Remove ALL saved playlists?")) return;
      pl2_clearAll();
      broadcastChanged();
      renderSaved();
      setStatus("statusUrl", "");
      setStatus("statusFile", "");
      setStatus("statusServer", "");
    });
  }
}
function initManager() {
  wireUI();
  renderServer();
  renderSaved();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initManager);
} else {
  initManager();
}
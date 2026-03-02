<p align="center">
  <img src="logo.png" alt="XVB Logo" width="160">
</p>

# XVB — Extended Video Broadcasting

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

Lightweight browser-based IPTV and streaming engine.

XVB is a fully client-side video playback core designed for IPTV, live streaming, and long-running playback sessions.  
It runs entirely in the browser — no backend required.

---

## Features

- HLS (.m3u8)
- MPEG-DASH (.mpd)
- MPEG-TS (.ts)
- M3U / M3U8 playlist support
- MP4 playback
- LocalStorage-based playlist persistence
- Multi-tab sync via BroadcastChannel
- Minimal UI optimized for performance
- Long-session stability focus

---

## Architecture

XVB leverages modern browser technologies:

- HLS.js
- DASH.js
- MPEGTS.js
- Native HTML5 Media APIs

Fully client-side. No servers. No accounts. No data collection.

---

## Browser Limitations

Due to browser security policies:

- CORS restrictions apply
- HTTPS streams required when served over HTTPS
- Codec support depends on browser
- Streams requiring custom headers, cookies, or authentication tokens may not function
- Self-signed or invalid SSL certificates may block playback

---

## Project Structure

```
/assets
/css
/lang
/pm      -> Playlist Manager
/xvb     -> Core playback engine
index.html
```

---

## License

MIT License © 2026 Jonathan Sanfilippo

---

## Author

Jonathan Sanfilippo

---

## Legal Notice

XVB is a neutral playback engine.  
It does not provide, host, or distribute any media content.

Users are responsible for the playlists and streams they load.  
Only use legally authorized and properly licensed sources.

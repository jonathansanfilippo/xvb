# XVB — Extended Video Broadcasting

Lightweight browser-based IPTV and streaming engine.

XVB is a client-side video playback core designed for IPTV, live streaming and long-running sessions.
It runs entirely in the browser — no backend required.

## Features

- HLS (.m3u8)
- MPEG-DASH (.mpd)
- MPEG-TS (.ts)
- M3U / M3U8 playlist support
- LocalStorage-based playlist persistence
- Multi-tab sync via BroadcastChannel
- Minimal UI optimized for performance

## Architecture

XVB is built using:

- HLS.js
- DASH.js
- MPEGTS.js
- Native HTML5 Media APIs

Fully client-side.

## Browser Limitations

- CORS restrictions apply
- HTTPS required if served over HTTPS
- Codec support depends on browser
- Streams requiring custom headers or authentication may not work

## 📦 Project Structure

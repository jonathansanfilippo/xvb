
![XVB Logo](assets/preview.png)

# XVB – Extended Video Broadcasting

XVB (Extended Video Broadcasting) is a lightweight web-based video streaming engine designed to handle IPTV and live broadcast sources directly in the browser.

The project focuses exclusively on reliable video playback, format compatibility, and performance.

## Streaming Support

XVB supports multiple streaming technologies:

- HLS (HTTP Live Streaming)
- MPEG-DASH
- MPEG Transport Stream (MPEG-TS) live streams
- Standard MP4 streams
- M3U / M3U8 playlists

MPEG-TS (MPEG Transport Stream) is widely used in digital broadcasting and IPTV environments. It is optimized for real-time transmission and resilient streaming over unreliable networks.

## Playback Features

- Adaptive bitrate streaming
- Live stream support
- Real-time stream switching
- Playback state management
- Volume and mute control
- Seek and time-shift (when supported by the stream)
- Fullscreen support
- Automatic stream error detection and recovery

## Architecture

The video engine is built using:

- HLS.js
- DASH.js
- MPEGTS.js
- Native HTML5 Video API

The system operates fully client-side and does not require a backend for playback.

## Design Goals

- High browser compatibility
- Low overhead
- Minimal external dependencies
- Fast stream initialization
- Stable long-duration playback
- Clean separation between video engine and interface layer

## Scope

XVB is intended as a modular video playback core that can be integrated into different environments or delivery systems.# XVB – Extended Video Broadcasting

XVB (Extended Video Broadcasting) is a lightweight web-based video streaming engine designed to handle IPTV and live broadcast sources directly in the browser.

The project focuses exclusively on reliable video and audio playback, format compatibility, and performance.

## Streaming Support

XVB supports multiple streaming technologies:

- HLS (HTTP Live Streaming)
- MPEG-DASH
- MPEG Transport Stream (MPEG-TS) live streams
- Standard MP4 streams
- M3U / M3U8 playlists

MPEG-TS (MPEG Transport Stream) is widely used in digital broadcasting and IPTV environments. It is optimized for real-time transmission and resilient streaming over unstable networks.

## Audio Support

XVB supports audio playback through the native HTML5 media pipeline and streaming engines.

Supported audio formats (depending on browser compatibility):

- AAC (Advanced Audio Coding)
- MP3
- MPEG Audio within TS streams
- Audio-only HLS streams
- Audio tracks embedded in DASH streams

Features include:

- Volume control
- Mute / unmute
- Audio-only stream playback
- Automatic audio track handling within adaptive streams

## Playback Features

- Adaptive bitrate streaming
- Live stream support
- Real-time stream switching
- Playback state management
- Seek and time-shift (when supported)
- Fullscreen support
- Automatic stream error detection and recovery

## Architecture

The video engine is built using:

- HLS.js
- DASH.js
- MPEGTS.js
- Native HTML5 Video API

The system operates fully client-side and does not require a backend for playback.

## Design Goals

- High browser compatibility
- Low overhead
- Minimal external dependencies
- Fast stream initialization
- Stable long-duration playback
- Clean separation between streaming engine and interface layer

## Scope

XVB is intended as a modular streaming core that can be integrated into different environments or delivery systems.

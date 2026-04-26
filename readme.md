VAULT (Master Vault Streamer)

A blunt, uncompromising, high-speed BitTorrent streaming engine built for true
data hoarders, audiophiles, and cultured degenerates.

Forget bloated, "safe-space" web apps and slow WebRTC browser clients. Vault OS
uses raw TCP/UDP torrenting to stream massive archives (4.9TB+ collections, 400+
CD packs, high-res anime MKVs) directly to your screen with zero latency. It
includes real-time audiophile transcoding, executable remote-running, and a
dual-view UI that clones classic desktop applications to give you maximum data
density.

 Core Features

  - Raw Swarm Power: Powered by torrent-stream. We bypass WebTorrent/WebRTC
    entirely. It only downloads the exact bytes you request.
  - Audiophile Transcoding Engine: Native support for .dsf, .dff, and .ape. The
    server automatically intercepts high-res audio, pipes it through FFmpeg, and
    upsamples/preserves it to 192kHz / 24-bit FLAC on the fly.
  - Swarm Execution: Click an .exe or .bat file in the UI, and the server will
    buffer the binary straight from the swarm to a temp folder, execute it on
    the host machine, and wait for it to close. Zero sandboxing. Absolute
    freedom.
  - Terminal HUD & Hardware Control: The Node.js terminal turns into a live ANSI
    Command Center. Use your physical Numpad (5 to Play/Pause, +/– for
    Volume, 4/6 for Prev/Next) to control the browser from the backend via
    WebSockets.
  - Titanium Caching: Massive .torrent files are parsed once, flattening the
    metadata into a JSON cache tracked by mtime. Instant loading. Zero race
    conditions.
  - Dual-Desktop UI: Built in Vue 3.
      - JRiver Media Center View: A 1:1 pixel-perfect clone of the classic
        audiophile software. Dense data grids, tree navigation, and zero wasted
        whitespace.
      - Windows 10 Mock Explorer: A dark-mode virtual file system (VFS) with
        working breadcrumbs, ribbons, and folder navigation.
  - 100% Offline Capable: All fonts, icons, and JS frameworks are packaged
    locally. No CDN failures.

 Setup Instructions (From Source)

If you aren't using the pre-compiled standalone EXE and want to run this raw
from the code, follow these steps:

1. Install Dependencies Make sure you have Node.js (v18+) installed. Open your
terminal in the project directory and run:

npm install

2. Populate the Vault Drop your .torrent files into the torrents/ folder.

3. Ignite the Engine Run the bootstrapper:

npm start

Note: On the first boot, the server will automatically detect your OS, download
the latest GPL-shared build of FFmpeg from GitHub, extract it, and link it to
the transcoder. Let it finish.

4. Access the UI Open your browser to http://localhost:4000. Use the Terminal
HUD and your Numpad to control playback.

 Building the Standalone EXE

Want to turn this into a single, portable weapon?

npm run build

This uses esbuild to crush the entire backend into a single CommonJS file, and
then pkg wraps it along with the public/ folder into a native Windows/Linux
executable.

  - Look in the dist/ folder for your compiled binary.
  - Run it anywhere. Just make sure your torrents/ folder sits next to the EXE.

 Architecture Breakdown (What does what?)

The Core Engine

  - start.js - The Bootstrapper. Checks for FFmpeg, downloads/extracts it if
    missing, and dynamically loads server.js.
  - server.js - The Master Controller. Handles the Express routes, the Socket.io
    WebSocket server, the Terminal HUD, the FFmpeg child-process spawning, and
    the .exe remote execution logic.
  - engine.js - The Swarm Connector. Wraps torrent-stream in a Promise lock.
    Connects to the trackers and ensures files are deselected until specifically
    requested.
  - cache.js - The Titanium Cache. Reads the .torrent file, parses the Bencode,
    and saves the flattened metadata to disk. Checks file modification times
    (mtime) to prevent unnecessary CPU load.
  - config.js - Centralized settings. Uses process.pkg logic to ensure directory
    paths don't break whether you are running from source or as a packaged EXE
    snapshot.

The Frontend (/public)

  - index.html - The DOM skeleton. Houses both the JRiver and Mock Explorer
    layouts.
  - app.js - The Vue 3 Brain. Handles the Virtual File System (VFS), calculates
    simulated ID3 metadata for density, manages the HTML5 Audio/Video elements,
    and listens to the Server via WebSockets.
  - style.css - The Aesthetic. Pure CSS grid/flexbox layouts emulating native
    Win32 applications. No woke rounded corners.
  - Local Libraries: vue.global.js, socket.io.min.js, lucide.min.js, plyr.js.
    Kept locally to ensure the app functions completely off the grid.

 The Graveyard (Unused/Legacy Files)

If you are looking at the source directory, the following files are obsolete
remnants of older, weaker builds. You can safely delete them:

  - ui.js (Legacy HTML string generator from the text-only days)
  - client.js (Old qBittorrent API connector)
  - qbitClient.js (Old qBittorrent API connector)
  - index.js (Dead entry point)
  - start.bat (Redundant Windows batch file)



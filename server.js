import express from 'express';
import path from 'path';
import fs from 'fs-extra';
import { spawn, execFile } from 'child_process';
import { createServer } from 'http';
import { Server } from 'socket.io';
import readline from 'readline';

// Internal Module Imports
import { CONFIG } from './config.js';
import { getEngine } from './engine.js';
import { getOrParseTorrent } from './cache.js';

/**
 * VAULT OS - MASTER SERVER ENGINE
 * Standalone EXE Compatible | Terminal HUD | Numpad Remote | High-Res Transcoding
 * Designed for raw performance and maximum information density.
 */

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// ==========================================
// STATIC ASSET SERVICING (EXE Snapshot Safe)
// ==========================================

// 1. Explicit Root Route: Forces the EXE to find the internal index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(CONFIG.PUBLIC_DIR, 'index.html'));
});

// 2. Middleware for all other assets (CSS, JS, Icons)
app.use(express.static(CONFIG.PUBLIC_DIR));

// ==========================================
// TERMINAL HUD & REMOTE COMMANDER
// ==========================================

// Enable keypress events for the terminal
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
}

// Global state tracked by the Terminal HUD
let currentStatus = { 
    file: 'Idle', 
    progress: 0, 
    volume: 100, 
    loop: false,
    view: 'Explorer'
};

/**
 * Renders the high-performance Terminal HUD using ANSI escape codes.
 * Updates in-place to prevent flickering.
 */
function drawHUD() {
    // Move cursor to 0,0 and clear everything below it
    readline.cursorTo(process.stdout, 0, 0);
    readline.clearScreenDown(process.stdout);
    
    console.log(`\n \x1b[35m======================================================\x1b[0m`);
    console.log(`  \x1b[1m\x1b[37mVAULT OS TERMINAL COMMAND CENTER\x1b[0m`);
    console.log(`  \x1b[36mACCESS VAULT AT:\x1b[0m \x1b[4m\x1b[97mhttp://localhost:${CONFIG.PORT}\x1b[0m`);
    console.log(` \x1b[35m------------------------------------------------------\x1b[0m`);
    
    // Filename truncation for clean UI
    const displayFile = currentStatus.file.length > 40 
        ? currentStatus.file.substring(0, 37) + '...' 
        : currentStatus.file;

    console.log(`  NOW PLAYING: \x1b[32m${displayFile}\x1b[0m`);
    
    const barWidth = 35;
    const progress = currentStatus.progress || 0;
    const filled = Math.floor(progress * barWidth);
    const bar = '█'.repeat(filled) + '-'.repeat(barWidth - filled);
    
    console.log(`  PROGRESS:    [${bar}] ${(progress * 100).toFixed(1)}%`);
    console.log(`  VOLUME:      ${currentStatus.volume}% | LOOP: ${currentStatus.loop ? '\x1b[32mACTIVE\x1b[0m' : '\x1b[31mOFF\x1b[0m'}`);
    console.log(` \x1b[35m------------------------------------------------------\x1b[0m`);
    console.log(`  NUMPAD HOTKEYS:`);
    console.log(`  [5] Play/Pause   [2] Stop        [8] Loop Toggle`);
    console.log(`  [4] Previous     [6] Next        [+] Vol Up  [-] Vol Down`);
    console.log(`  \x1b[90m[CTRL+C] Terminate Vault Engine\x1b[0m`);
    console.log(` \x1b[35m======================================================\x1b[0m\n`);
}

// Physical Numpad Listener
process.stdin.on('keypress', (str, key) => {
    if (key.ctrl && key.name === 'c') process.exit();

    // Map physical numpad hardware keys to internal media actions
    const keyMap = {
        'kp_5': 'toggle', '5': 'toggle',
        'kp_add': 'volUp', '+': 'volUp',
        'kp_subtract': 'volDown', '-': 'volDown',
        'kp_6': 'next', '6': 'next',
        'kp_4': 'prev', '4': 'prev',
        'kp_2': 'stop', '2': 'stop',
        'kp_8': 'loop', '8': 'loop'
    };

    const action = keyMap[key.name] || keyMap[str];
    if (action) {
        // Send the command to the browser via Socket.io
        io.emit('remote-control', { action });
    }
});

// Socket.io Sync: Links the Browser state to the Terminal HUD
io.on('connection', (socket) => {
    socket.on('report-status', (data) => {
        currentStatus = { ...currentStatus, ...data };
        drawHUD();
    });
});

// ==========================================
// API ROUTES
// ==========================================

// 1. List available .torrent files in the folder next to the EXE
app.get('/api/local-torrents', async (req, res) => {
    try {
        const files = await fs.readdir(CONFIG.TORRENT_DIR);
        const torrents = files
            .filter(f => f.endsWith('.torrent'))
            .map(f => ({
                name: path.parse(f).name,
                fileName: f
            }));
        res.json(torrents);
    } catch (err) {
        res.status(500).send("IO_ERROR: Path inaccessible.");
    }
});

// 2. Fetch file list from Titanium Cache (mtime aware)
app.get('/api/local-files/:fileName', async (req, res) => {
    try {
        const data = await getOrParseTorrent(req.params.fileName);
        res.json(data);
    } catch (err) {
        res.status(500).send("CACHE_ERROR: Failed to parse.");
    }
});

// 3. Application Execution: Streams 100% then spawns process
app.get('/api/run-app/:fileName/:index', async (req, res) => {
    const { fileName, index } = req.params;
    const filePath = path.join(CONFIG.TORRENT_DIR, fileName);

    try {
        const engine = await getEngine(filePath);
        const file = engine.files[index];
        const tempPath = path.join(CONFIG.TEMP_DIR, path.basename(file.name));

        console.log(`[EXEC] Buffering application: ${file.name}`);
        file.select();

        const writeStream = fs.createWriteStream(tempPath);
        file.createReadStream().pipe(writeStream);

        writeStream.on('finish', () => {
            console.log(`[EXEC] Launching Standalone: ${tempPath}`);
            const child = execFile(tempPath, [], { detached: true });
            child.unref(); // Detach from Node.js process tree
            res.json({ status: "Launched" });
        });
    } catch (err) {
        res.status(500).send("EXEC_ERROR: Failed to launch.");
    }
});

// ==========================================
// STREAMING HUB (Native & 192kHz Transcoding)
// ==========================================

function getMimeType(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    const mimes = {
        '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.webm': 'video/webm',
        '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.dsf': 'audio/flac',
        '.dff': 'audio/flac', '.ape': 'audio/flac', '.wav': 'audio/wav',
        '.m4a': 'audio/mp4'
    };
    return mimes[ext] || 'application/octet-stream';
}

app.get('/stream/:fileName/:index', async (req, res) => {
    const { fileName, index } = req.params;
    const filePath = path.join(CONFIG.TORRENT_DIR, fileName);
    const isDownload = req.query.download === '1';

    try {
        const engine = await getEngine(filePath);
        const file = engine.files[index];
        if (!file) return res.status(404).send("NOT_FOUND");

        const ext = path.extname(file.name).toLowerCase();
        const mimeType = getMimeType(file.name);

        if (isDownload) {
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(path.basename(file.name))}"`);
        }

        // FFMPEG AUDIOPHILE TRANSCODING (192kHz / 24-bit FLAC)
        if (['.dsf', '.dff', '.ape', '.alac'].includes(ext)) {
            res.writeHead(200, {
                'Content-Type': 'audio/flac',
                'Transfer-Encoding': 'chunked'
            });

            const ffmpegPath = process.platform === 'win32' 
                ? path.join(path.dirname(CONFIG.CACHE_FILE), 'ffmpeg', 'bin', 'ffmpeg.exe')
                : path.join(path.dirname(CONFIG.CACHE_FILE), 'ffmpeg', 'ffmpeg');

            const ffmpeg = spawn(ffmpegPath, [
                '-i', 'pipe:0',
                '-c:a', 'flac',
                '-ar', '192000',
                '-sample_fmt', 's32',
                '-f', 'flac',
                'pipe:1'
            ]);

            file.createReadStream().pipe(ffmpeg.stdin);
            ffmpeg.stdout.pipe(res);

            req.on('close', () => {
                ffmpeg.kill('SIGKILL');
            });

        } else {
            // STANDARD NATIVE STREAMING (Range requests supported)
            const range = req.headers.range;
            if (range && !isDownload) {
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : file.length - 1;
                const chunksize = (end - start) + 1;

                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${file.length}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': mimeType,
                });
                file.createReadStream({ start, end }).pipe(res);
            } else {
                res.writeHead(200, {
                    'Content-Length': file.length,
                    'Content-Type': mimeType,
                });
                file.createReadStream().pipe(res);
            }
        }
    } catch (err) {
        res.status(500).send("STREAM_ERROR: Swarm connection lost.");
    }
});

// Final Launch
httpServer.listen(CONFIG.PORT, () => {
    drawHUD();
});
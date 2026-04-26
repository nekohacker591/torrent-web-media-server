import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import AdmZip from 'adm-zip';
import * as tar from 'tar';
import { CONFIG } from './config.js';

const FFMPEG_DIR = path.join(path.dirname(CONFIG.CACHE_FILE), 'ffmpeg');
const FFMPEG_EXE = process.platform === 'win32' ? path.join(FFMPEG_DIR, 'bin', 'ffmpeg.exe') : path.join(FFMPEG_DIR, 'ffmpeg');

async function downloadFFmpeg() {
    if (fs.existsSync(FFMPEG_EXE)) {
        console.log("[SYSTEM] FFmpeg detected. Ready for high-res output.");
        return;
    }

    console.log("[SETUP] FFmpeg missing! Auto-acquiring binaries...");
    const isWin = process.platform === 'win32';
    const url = isWin 
        ? "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl-shared.zip"
        : "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz";

    const tempFile = path.join(path.dirname(CONFIG.CACHE_FILE), isWin ? 'ffmpeg.zip' : 'ffmpeg.tar.xz');

    try {
        const response = await axios({ url, method: 'GET', responseType: 'stream' });
        const writer = fs.createWriteStream(tempFile);
        response.data.pipe(writer);
        await new Promise((res, rej) => { writer.on('finish', res); writer.on('error', rej); });

        console.log(`[SETUP] Extraction in progress...`);
        if (isWin) {
            const zip = new AdmZip(tempFile);
            zip.extractAllTo(path.dirname(CONFIG.CACHE_FILE), true);
            const extracted = fs.readdirSync(path.dirname(CONFIG.CACHE_FILE)).find(d => d.startsWith('ffmpeg-master'));
            fs.moveSync(path.join(path.dirname(CONFIG.CACHE_FILE), extracted), FFMPEG_DIR, { overwrite: true });
        } else {
            await tar.x({ file: tempFile, cwd: path.dirname(CONFIG.CACHE_FILE) });
        }
        fs.removeSync(tempFile);
        console.log(`[SETUP] FFmpeg installed.`);
    } catch (err) {
        console.error(`[FATAL] FFmpeg setup failed: ${err.message}`);
        process.exit(1);
    }
}

async function boot() {
    await downloadFFmpeg();
    console.log("[SYSTEM] Igniting server engine...");
    await import('./server.js');
}

boot();
import torrentStream from 'torrent-stream';
import fs from 'fs';
import path from 'path';
import { CONFIG } from './config.js';

const engines = new Map();
const engineLocks = new Map();

export function getEngine(torrentPath) {
    if (engines.has(torrentPath)) {
        return Promise.resolve(engines.get(torrentPath));
    }

    if (engineLocks.has(torrentPath)) {
        return engineLocks.get(torrentPath);
    }

    console.log(`[ENGINE] Spawning instance for: ${path.basename(torrentPath)}`);
    
    const lock = new Promise((resolve, reject) => {
        try {
            const torrentBuffer = fs.readFileSync(torrentPath);
            const engine = torrentStream(torrentBuffer, {
                path: CONFIG.DOWNLOAD_DIR,
                verify: true,
                trackers: [
                    'udp://tracker.opentrackr.org:1337/announce',
                    'udp://9.rarbg.com:2810/announce',
                    'udp://tracker.openbittorrent.com:6969/announce'
                ]
            });

            engine.on('ready', () => {
                engine.files.forEach(file => file.deselect()); // Sniper Mode active
                engine.ready = true;
                engines.set(torrentPath, engine);
                console.log(`[ENGINE] Asset ready: ${engine.torrent.name}`);
                resolve(engine);
            });

            engine.on('error', (err) => {
                console.error(`[ENGINE ERROR] ${err.message}`);
                reject(err);
            });
        } catch (err) {
            reject(err);
        }
    });

    engineLocks.set(torrentPath, lock);
    lock.then(() => engineLocks.delete(torrentPath)).catch(() => engineLocks.delete(torrentPath));

    return lock;
}
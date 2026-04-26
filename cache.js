import fs from 'fs-extra';
import path from 'path';
import parseTorrent from 'parse-torrent';
import { CONFIG } from './config.js';

let diskCache = fs.existsSync(CONFIG.CACHE_FILE) ? fs.readJsonSync(CONFIG.CACHE_FILE) : {};
const parsingLocks = new Map();

function saveCache() {
    try { fs.writeJsonSync(CONFIG.CACHE_FILE, diskCache); } 
    catch (e) { console.error(`[CACHE ERROR] Failed to flush to disk.`); }
}

export async function getOrParseTorrent(fileName) {
    const filePath = path.join(CONFIG.TORRENT_DIR, fileName);

    if (parsingLocks.has(fileName)) return await parsingLocks.get(fileName);

    const lock = new Promise(async (resolve, reject) => {
        try {
            const stat = await fs.promises.stat(filePath);
            const currentMtime = stat.mtimeMs;

            if (diskCache[fileName] && diskCache[fileName].mtime === currentMtime) {
                return resolve(diskCache[fileName].data);
            }

            console.log(`[CACHE] Parsing heavy metadata for ${fileName}...`);
            const buf = await fs.promises.readFile(filePath);
            const parsed = await parseTorrent(buf);

            const vaultData = {
                infoHash: parsed.infoHash,
                name: parsed.name,
                files: parsed.files.map((f, idx) => ({
                    index: idx,
                    // FIX: Normalize all slashes to forward slash for VFS navigation
                    name: (f.path || f.name).replace(/\\/g, '/'),
                    length: f.length
                }))
            };

            diskCache[fileName] = { mtime: currentMtime, data: vaultData };
            saveCache();
            resolve(vaultData);
        } catch (err) {
            reject(err);
        }
    });

    parsingLocks.set(fileName, lock);
    try {
        const result = await lock;
        parsingLocks.delete(fileName);
        return result;
    } catch (err) {
        parsingLocks.delete(fileName);
        throw err;
    }
}
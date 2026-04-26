import path from 'path';
import fs from 'fs-extra';

// process.pkg is defined when running as a packaged EXE
const IS_PKG = typeof process.pkg !== 'undefined';

// ROOT_DIR: The physical folder where the EXE sits
const ROOT_DIR = IS_PKG ? path.dirname(process.execPath) : path.resolve();

// INTERNAL_DIR: The virtual folder inside the EXE (the snapshot)
// When bundled into vault-core.cjs in the root, __dirname is the project root in the snapshot
const INTERNAL_DIR = IS_PKG ? __dirname : path.resolve();

export const CONFIG = {
    PORT: 4000,
    // These folders stay OUTSIDE next to the EXE on your hard drive
    TORRENT_DIR: path.join(ROOT_DIR, 'torrents'),
    DOWNLOAD_DIR: path.join(ROOT_DIR, 'downloads'), 
    TEMP_DIR: path.join(ROOT_DIR, 'temp_exec'),
    CACHE_FILE: path.join(ROOT_DIR, 'metadata_cache.json'),
    
    // This points INSIDE the EXE virtual filesystem
    PUBLIC_DIR: path.join(INTERNAL_DIR, 'public')
};

// Ensure external data folders exist
fs.ensureDirSync(CONFIG.TORRENT_DIR);
fs.ensureDirSync(CONFIG.DOWNLOAD_DIR);
fs.ensureDirSync(CONFIG.TEMP_DIR);
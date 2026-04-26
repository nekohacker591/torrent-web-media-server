import axios from 'axios';
import fs from 'fs-extra';
import FormData from 'form-data';
import { CONFIG } from './config.js';
import { logDebug } from './ui.js';

/**
 * QBITTORRENT CLIENT CONTROLLER
 * No more slow-ass WebTorrent. We're using a real engine now.
 */

const QBIT_URL = 'http://127.0.0.1:8080'; // Change this if your WebUI port is different
const QBIT_USER = 'admin';
const QBIT_PASS = 'password';
const CATEGORY = 'media-server';

let cookie = "";

/**
 * Login to qBittorrent and get a session cookie.
 * Because we aren't savages, we need to authenticate once.
 */
async function login() {
    try {
        const params = new URLSearchParams();
        params.append('username', QBIT_USER);
        params.append('password', QBIT_PASS);

        const res = await axios.post(`${QBIT_URL}/api/v2/auth/login`, params);
        cookie = res.headers['set-cookie'][0].split(';')[0];
        logDebug("Logged into qBittorrent. Session secured.");
    } catch (err) {
        console.error("[CRITICAL] qBit Login Failed. Is the WebUI running?");
        throw err;
    }
}

/**
 * Add a torrent to qBittorrent with the correct category and settings.
 */
export async function addTorrent(filePath, infoHash) {
    if (!cookie) await login();

    // 1. Check if it's already in qBit
    const listRes = await axios.get(`${QBIT_URL}/api/v2/torrents/info?hashes=${infoHash}`, {
        headers: { 'Cookie': cookie }
    });

    if (listRes.data.length > 0) {
        logDebug(`Torrent ${infoHash} already exists in qBit.`);
        const t = listRes.data[0];
        if (t.category !== CATEGORY) {
            logDebug(`Correcting category to ${CATEGORY}...`);
            await setCategory(infoHash);
        }
        return t;
    }

    // 2. Add the torrent file
    logDebug(`Injecting new torrent into qBit: ${infoHash}`);
    const form = new FormData();
    form.append('torrents', fs.createReadStream(filePath));
    form.append('category', CATEGORY);
    form.append('sequentialDownload', 'true'); // ABSOLUTELY VITAL FOR STREAMING
    form.append('firstLastPiecePrio', 'true');  // Get the headers/meta first

    await axios.post(`${QBIT_URL}/api/v2/torrents/add`, form, {
        headers: { 
            ...form.getHeaders(),
            'Cookie': cookie 
        }
    });

    logDebug(`Torrent added. Sequential download engaged.`);
    return { hash: infoHash };
}

/**
 * Get the file list for a specific torrent from qBit.
 */
export async function getFiles(infoHash) {
    if (!cookie) await login();
    const res = await axios.get(`${QBIT_URL}/api/v2/torrents/files?hash=${infoHash}`, {
        headers: { 'Cookie': cookie }
    });
    return res.data; // Array of files with 'name', 'size', 'progress', etc.
}

/**
 * Helper to force the category
 */
async function setCategory(hash) {
    const params = new URLSearchParams();
    params.append('hashes', hash);
    params.append('category', CATEGORY);
    await axios.post(`${QBIT_URL}/api/v2/torrents/setCategory`, params, {
        headers: { 'Cookie': cookie }
    });
}

/**
 * Get overall torrent status (speed, progress, etc.)
 */
export async function getStatus(infoHash) {
    if (!cookie) await login();
    const res = await axios.get(`${QBIT_URL}/api/v2/torrents/info?hashes=${infoHash}`, {
        headers: { 'Cookie': cookie }
    });
    return res.data[0];
}

// Export the config so the server knows where the files are actually being saved
export const QBIT_DOWNLOAD_DIR = "C:\\Downloads"; // MAKE SURE THIS MATCHES YOUR QBIT SETTINGS
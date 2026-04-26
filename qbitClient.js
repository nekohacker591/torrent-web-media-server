import axios from 'axios';
import fs from 'fs-extra';
import FormData from 'form-data';
import { CONFIG } from './config.js';
import { logDebug } from './ui.js';

let cookie = "";

async function login() {
    try {
        const params = new URLSearchParams();
        params.append('username', CONFIG.QBIT_USER);
        params.append('password', CONFIG.QBIT_PASS);
        const res = await axios.post(`${CONFIG.QBIT_URL}/api/v2/auth/login`, params);
        cookie = res.headers['set-cookie'][0].split(';')[0];
        logDebug("Authenticated with qBittorrent.");
    } catch (err) {
        console.error("[FATAL] qBit Login Failed. Make sure the WebUI is active!");
        throw err;
    }
}

export async function addTorrentToQbit(filePath, infoHash) {
    if (!cookie) await login();

    // Check if already exists
    const list = await axios.get(`${CONFIG.QBIT_URL}/api/v2/torrents/info?hashes=${infoHash}`, {
        headers: { 'Cookie': cookie }
    });

    if (list.data.length === 0) {
        logDebug(`Injecting new torrent to qBit: ${infoHash}`);
        const form = new FormData();
        form.append('torrents', fs.createReadStream(filePath));
        form.append('category', CONFIG.CATEGORY);
        form.append('sequentialDownload', 'true');
        form.append('firstLastPiecePrio', 'true');

        await axios.post(`${CONFIG.QBIT_URL}/api/v2/torrents/add`, form, {
            headers: { ...form.getHeaders(), 'Cookie': cookie }
        });
    } else {
        logDebug(`Torrent ${infoHash} is already in qBit.`);
    }
}

export async function getQbitFiles(infoHash) {
    if (!cookie) await login();
    const res = await axios.get(`${CONFIG.QBIT_URL}/api/v2/torrents/files?hash=${infoHash}`, {
        headers: { 'Cookie': cookie }
    });
    return res.data;
}

export async function getTorrentInfo(infoHash) {
    if (!cookie) await login();
    const res = await axios.get(`${CONFIG.QBIT_URL}/api/v2/torrents/info?hashes=${infoHash}`, {
        headers: { 'Cookie': cookie }
    });
    return res.data[0];
}
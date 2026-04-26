/**
 * THE MASTER VAULT - BOOTSTRAPPER
 * No fluff. No nonsense. Just the engine.
 */

import './server.js'; 

console.log(`[SYSTEM] Initializing stream protocols...`);

process.on('uncaughtException', (err) => {
    console.error(`\n[FATAL ERROR] The engine just choked on something:`);
    console.error(err.stack || err);
    console.log(`\n[TIPS] Check your torrent folder or your port permissions, genius.\n`);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(`\n[REJECTION] A promise went rogue:`, reason);
});

console.log(`[SYSTEM] Boot sequence complete. Vault is open for business. 🚀\n`);
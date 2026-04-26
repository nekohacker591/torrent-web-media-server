const { createApp } = Vue;
// Connect to the server's remote control socket for terminal HUD sync
const socket = io();

createApp({
    data() {
        return {
            currentView: 'explorer', // Default view
            ribbonExpanded: false,
            localTorrents: [],
            selectedTorrent: null,
            selectedFileName: null,
            files: [], // The flat list of all files in a torrent
            searchQuery: '',
            
            // Virtual File System (VFS) State
            currentDir: '',
            
            // App Runner / Execution state
            appLoading: false,
            loadingMessage: '',

            // Media Engine State
            activeFile: null,
            showVideoModal: false,
            isPlaying: false,
            currentTime: 0,
            duration: 0,
            volume: 1,
            loop: false,
            audioElement: null,
            videoPlayer: null
        }
    },
    computed: {
        // Flat list for JRiver view
        filteredFiles() {
            if (!this.searchQuery) return this.files;
            const q = this.searchQuery.toLowerCase();
            return this.files.filter(f => f.name.toLowerCase().includes(q));
        },
        totalSize() {
            return this.filteredFiles.reduce((acc, f) => acc + f.length, 0);
        },
        // Proper Breadcrumbs for Explorer Address Bar
        explorerBreadcrumbs() {
            if (!this.currentDir) return [];
            return this.currentDir.split('/').filter(Boolean);
        },
        // The VFS Engine: Parses flat paths into a folder/file structure
        explorerItems() {
            if (!this.selectedTorrent) return [];
            
            const q = this.searchQuery.toLowerCase();
            // If searching, flatten the view exactly like real Windows Explorer search
            if (q) {
                return this.files
                    .filter(f => f.name.toLowerCase().includes(q))
                    .map(f => ({ isFolder: false, file: f }));
            }

            const items = [];
            const folders = new Set();
            const prefix = this.currentDir ? this.currentDir + '/' : '';

            this.files.forEach(f => {
                if (f.name.startsWith(prefix)) {
                    const relativePath = f.name.substring(prefix.length);
                    const slashIdx = relativePath.indexOf('/');
                    
                    if (slashIdx === -1) {
                        // File in current directory
                        items.push({ isFolder: false, file: f });
                    } else {
                        // Folder segment
                        const folderName = relativePath.substring(0, slashIdx);
                        if (!folders.has(folderName)) {
                            folders.add(folderName);
                            items.push({ 
                                isFolder: true, 
                                name: folderName, 
                                fullPath: prefix + folderName,
                                fakeDate: this.generateFakeDate(folderName, false)
                            });
                        }
                    }
                }
            });

            // Standard Windows Sort: Folders first, then Alphabetical
            return items.sort((a, b) => {
                if (a.isFolder && !b.isFolder) return -1;
                if (!a.isFolder && b.isFolder) return 1;
                const nameA = a.isFolder ? a.name : a.file.meta.name;
                const nameB = b.isFolder ? b.name : b.file.meta.name;
                return nameA.localeCompare(nameB);
            });
        }
    },
    methods: {
        async fetchLocalTorrents() {
            const res = await fetch('/api/local-torrents');
            this.localTorrents = await res.json();
            this.$nextTick(() => lucide.createIcons());
        },

        async loadPack(torrent) {
            // KILL THE BAD CACHE: Instantly wipe current state before starting network request
            this.files = [];
            this.selectedTorrent = torrent.name;
            this.selectedFileName = torrent.fileName;
            this.currentDir = ''; 
            this.searchQuery = '';
            
            const res = await fetch(`/api/local-files/${encodeURIComponent(torrent.fileName)}`);
            const data = await res.json();
            
            // PRE-COMPUTE ENGINE: Calculate all UI properties ONCE to kill frame lag
            this.files = data.files.map(f => {
                const ext = f.name.includes('.') ? f.name.split('.').pop().toLowerCase() : 'unknown';
                const meta = this.extractMetadata(f.name, f.length, ext);
                
                // Pre-calculate UI attributes so template functions don't run 5 times per second
                meta.winIcon = this.getWinIcon(ext);
                meta.winColor = this.getWinColor(ext);
                meta.winTypeDesc = this.getWinTypeDesc(ext);
                meta.fakeDateJRiver = this.generateFakeDate(meta.name, true);
                meta.fakeDateWin = this.generateFakeDate(meta.name, false);
                meta.kbSize = (f.length / 1024).toFixed(0);

                return {
                    ...f,
                    url: `/stream/${encodeURIComponent(torrent.fileName)}/${f.index}`,
                    meta: meta
                };
            });
            this.$nextTick(() => lucide.createIcons());
        },

        extractMetadata(filePath, size, ext) {
            const parts = filePath.split('/');
            const fileName = parts[parts.length - 1];
            const artistMatch = fileName.match(/^\[(.*?)\]/);
            const artist = artistMatch ? artistMatch[1] : "Unknown";
            
            const isMedia = ['mp3','flac','dsf','dff','ape','m4a','wav','mp4','mkv','webm'].includes(ext);
            let durationStr = "--:--"; let bitrateStr = "--";

            if (isMedia) {
                const estBitrate = (ext === 'flac' || ext === 'dsf') ? 1024 : 320;
                const durationSec = Math.floor((size * 8) / (estBitrate * 1000));
                durationStr = `${Math.floor(durationSec / 60)}:${(durationSec % 60).toString().padStart(2, '0')}`;
                bitrateStr = `${estBitrate} kbps`;
            }

            return {
                name: fileName.replace(/\.[^/.]+$/, ""),
                artist: artist,
                album: parts.length > 1 ? parts[parts.length - 2] : "Unknown Album",
                genre: "High-Res Archive",
                duration: durationStr,
                bitrate: bitrateStr,
                type: ext.toUpperCase()
            };
        },

        // VFS Navigation
        goUp() {
            if (!this.currentDir) return;
            const parts = this.currentDir.split('/');
            parts.pop();
            this.currentDir = parts.join('/');
        },

        openExplorerItem(item) {
            if (item.isFolder) {
                this.currentDir = item.fullPath;
            } else {
                this.interact(item.file);
            }
        },

        // CORE INTERACTION ROUTER
        async interact(file) {
            const ext = file.meta.type.toLowerCase();
            
            // 1. Executables (Force 100% download then run)
            if (['exe','bat','cmd'].includes(ext)) {
                if (confirm(`Authorize remote execution of ${file.meta.name}?`)) {
                    this.appLoading = true;
                    this.loadingMessage = `Acquiring bits from swarm: ${file.meta.name}...`;
                    try {
                        const res = await fetch(`/api/run-app/${encodeURIComponent(this.selectedFileName)}/${file.index}`);
                        const data = await res.json();
                        console.log("Remote App Launched:", data.status);
                    } catch(e) { alert("Execution protocol failed."); }
                    this.appLoading = false;
                }
                return;
            }

            // 2. Video (Plyr Modal for 206 streaming)
            if (['mp4','mkv','webm','avi'].includes(ext)) {
                this.activeFile = { ...file, type: 'video' };
                this.showVideoModal = true;
                this.$nextTick(() => {
                    if (this.videoPlayer) this.videoPlayer.destroy();
                    this.videoPlayer = new Plyr('#video-player', { autoplay: true });
                });
                return;
            }

            // 3. Audio (Background JRiver Engine)
            if (['mp3','flac','dsf','dff','ape','wav','m4a'].includes(ext)) {
                this.activeFile = { ...file, type: 'audio' };
                this.audioElement.src = file.url;
                this.audioElement.play();
                this.isPlaying = true;
                return;
            }

            // 4. Archives / Documents (Native Download)
            window.location.href = `${file.url}?download=1`;
        },

        // REMOTE CONTROL HANDLER (For Numpad Terminal controls)
        handleRemote(action) {
            console.log(`[REMOTE] Action received: ${action}`);
            if (action === 'toggle') this.togglePlay();
            if (action === 'volUp') { this.volume = Math.min(1, this.volume + 0.05); this.updateVolume(); }
            if (action === 'volDown') { this.volume = Math.max(0, this.volume - 0.05); this.updateVolume(); }
            if (action === 'stop') this.stop();
            if (action === 'loop') this.loop = !this.loop;
            if (action === 'next') this.playAdjacent(1);
            if (action === 'prev') this.playAdjacent(-1);
        },

        // VFS-Aware Playlist Logic (Finds the next file in current folder or list)
        playAdjacent(offset) {
            const currentList = this.currentView === 'explorer' 
                ? this.explorerItems.filter(i => !i.isFolder).map(i => i.file) 
                : this.filteredFiles;
            
            const currentIndex = currentList.findIndex(f => f.index === this.activeFile?.index);
            const nextFile = currentList[currentIndex + offset];
            if (nextFile) this.interact(nextFile);
        },

        // UI VISUAL HELPERS
        getWinIcon(t) {
            if (['exe','dll'].includes(t)) return 'cpu';
            if (['txt','nfo','log'].includes(t)) return 'file-text';
            if (['mp3','flac','dsf','wav','m4a'].includes(t)) return 'music';
            if (['mp4','mkv','webm'].includes(t)) return 'video';
            if (['jpg','png','jpeg'].includes(t)) return 'image';
            if (['zip','rar','7z'].includes(t)) return 'archive';
            return 'file';
        },
        getWinColor(t) {
            if (['exe','dll'].includes(t)) return 'red';
            if (['mp3','flac','dsf','m4a'].includes(t)) return 'blue';
            if (['jpg','png','jpeg'].includes(t)) return 'yellow';
            if (['zip','rar','7z'].includes(t)) return 'green';
            return 'gray';
        },
        getWinTypeDesc(t) {
            if (t === 'exe') return 'Application';
            if (t === 'txt') return 'Text Document';
            if (t === 'flac') return 'FLAC Audio File';
            if (['zip','rar','7z'].includes(t)) return 'Compressed Archive';
            return `${t.toUpperCase()} File`;
        },
        generateFakeDate(name, isJRiver) {
            const l = name.length;
            const year = 2024 - (l % 4);
            const month = (l % 12) + 1;
            const day = (l % 28) + 1;
            if (isJRiver) return `${month}/${day}/${year}`;
            return `${month}/${day}/${year} 4:${(l%60).toString().padStart(2,'0')} PM`;
        },

        // NATIVE MEDIA CONTROLS
        togglePlay() {
            if (!this.audioElement.src) return;
            if (this.isPlaying) this.audioElement.pause();
            else this.audioElement.play();
            this.isPlaying = !this.isPlaying;
        },
        stop() { 
            this.audioElement.pause(); 
            this.audioElement.currentTime = 0; 
            this.isPlaying = false; 
            this.activeFile = null;
        },
        seek(amount) { this.audioElement.currentTime += amount; },
        scrub() { this.audioElement.currentTime = this.currentTime; },
        updateVolume() { this.audioElement.volume = this.volume; },
        formatTime(seconds) {
            if (isNaN(seconds)) return "0:00";
            const m = Math.floor(seconds / 60);
            const s = Math.floor(seconds % 60).toString().padStart(2, '0');
            return `${m}:${s}`;
        }
    },
    mounted() {
        this.fetchLocalTorrents();
        this.audioElement = document.getElementById('core-audio');
        
        // Decouple timeupdate from Vue data proxy for performance
        this.audioElement.addEventListener('timeupdate', () => {
            this.currentTime = this.audioElement.currentTime;
            this.duration = this.audioElement.duration || 0;
            
            // Sync status with Terminal HUD via WebSocket
            socket.emit('report-status', {
                file: this.activeFile ? this.activeFile.meta.name : 'Idle',
                progress: this.currentTime / (this.duration || 1),
                volume: Math.round(this.volume * 100),
                loop: this.loop
            });
        });

        // AUTO-ADVANCE / LOOP logic
        this.audioElement.addEventListener('ended', () => {
            if (this.loop) {
                this.audioElement.currentTime = 0;
                this.audioElement.play();
            } else {
                this.playAdjacent(1);
            }
        });

        // Listen for Numpad keypresses from the server console
        socket.on('remote-control', (data) => this.handleRemote(data.action));
    },
    updated() {
        // Ensure Lucide icons are redrawn when the VFS subfolder view changes
        lucide.createIcons();
    }
}).mount('#app');
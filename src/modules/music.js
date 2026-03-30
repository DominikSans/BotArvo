const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    StreamType,
} = require("@discordjs/voice");
const { EmbedBuilder } = require("discord.js");
const { execFile, execSync } = require("child_process");
const path = require("path");
const prism = require("prism-media");

// Usar ffmpeg-static si funciona, sino el ffmpeg del sistema
let ffmpegPath;
try {
    ffmpegPath = require("ffmpeg-static");
    execSync(`"${ffmpegPath}" -version`, { stdio: "ignore" });
} catch {
    ffmpegPath = "ffmpeg"; // Usa el ffmpeg del sistema (apt install ffmpeg)
    console.log("[Music] Usando ffmpeg del sistema en vez de ffmpeg-static");
}
const config = require("../../config.json");
const fs = require("fs");
const Genius = require("genius-lyrics");
const GeniusClient = new Genius.Client();

// Detectar binario de yt-dlp según plataforma
let YTDLP;
if (process.platform === "win32") {
    YTDLP = path.resolve(__dirname, "..", "..", "yt-dlp.exe");
} else {
    // Preferir yt-dlp de pipx (tiene plugin PO Token), sino el binario local
    const pipxYtdlp = "/root/.local/bin/yt-dlp";
    YTDLP = fs.existsSync(pipxYtdlp) ? pipxYtdlp : path.resolve(__dirname, "..", "..", "yt-dlp");
    if (YTDLP === pipxYtdlp) console.log("[Music] Usando yt-dlp de pipx con PO Token plugin");
}
const FAVORITES_PATH = path.resolve(__dirname, "..", "data", "favorites.json");
const MAX_FAVORITES = 50;
const queues = new Map();
const IDLE_TIMEOUT = 120_000;
const MAX_PLAYLIST = 50;

// ─── Filtros de audio ──────────────────────────────────────────────────────

const AUDIO_FILTERS = {
    bassboost: { af: "bass=g=20", emoji: "🔊", name: "Bass Boost" },
    nightcore: { af: "aresample=48000,asetrate=48000*1.25", emoji: "🌙", name: "Nightcore" },
    vaporwave: { af: "aresample=48000,asetrate=48000*0.8", emoji: "🌊", name: "Vaporwave" },
    "8d": { af: "apulsator=hz=0.09", emoji: "🎧", name: "8D" },
};

// ─── Favoritos helpers ─────────────────────────────────────────────────────

function loadFavorites() {
    try {
        if (!fs.existsSync(FAVORITES_PATH)) fs.writeFileSync(FAVORITES_PATH, "{}", "utf-8");
        return JSON.parse(fs.readFileSync(FAVORITES_PATH, "utf-8"));
    } catch {
        return {};
    }
}

function saveFavorites(data) {
    fs.writeFileSync(FAVORITES_PATH, JSON.stringify(data, null, 2), "utf-8");
}

// ─── DJ Role check ─────────────────────────────────────────────────────────

function isDJ(member) {
    if (member.permissions.has("ManageMessages")) return true;
    return member.roles.cache.some(r => r.name.toLowerCase().includes("dj"));
}

// ─── Spotify API ────────────────────────────────────────────────────────────

let spotifyApi = null;
let spotifyTokenExpires = 0;

async function initSpotify() {
    if (!config.spotifyClientId || !config.spotifyClientSecret) return null;
    if (spotifyApi && Date.now() < spotifyTokenExpires) return spotifyApi;

    const SpotifyWebApi = require("spotify-web-api-node");
    spotifyApi = new SpotifyWebApi({
        clientId: config.spotifyClientId,
        clientSecret: config.spotifyClientSecret,
    });

    try {
        const data = await spotifyApi.clientCredentialsGrant();
        spotifyApi.setAccessToken(data.body.access_token);
        spotifyTokenExpires = Date.now() + (data.body.expires_in * 1000);
        return spotifyApi;
    } catch (err) {
        console.error("[Music] Error de autenticación Spotify:", err.message);
        return null;
    }
}

// ─── Detección de plataforma ────────────────────────────────────────────────

function detectPlatform(query) {
    if (/youtube\.com|youtu\.be/i.test(query)) {
        if (/[?&]list=/.test(query)) return "youtube-playlist";
        return "youtube";
    }
    if (/open\.spotify\.com|spotify:/i.test(query)) {
        if (/\/playlist\/|:playlist:/.test(query)) return "spotify-playlist";
        if (/\/album\/|:album:/.test(query)) return "spotify-album";
        if (/\/track\/|:track:/.test(query)) return "spotify-track";
        return "spotify-track";
    }
    if (/soundcloud\.com/i.test(query)) {
        if (/\/sets\//.test(query)) return "soundcloud-playlist";
        return "soundcloud";
    }
    if (/^https?:\/\/.*\.(mp3|wav|ogg|flac|m4a|aac|opus|webm)$/i.test(query)) return "direct";
    return "search";
}

// ─── Utilidades ─────────────────────────────────────────────────────────────

function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return "EN VIVO";
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getQueue(guildId) {
    return queues.get(guildId) ?? null;
}

function deleteQueue(guildId) {
    const queue = queues.get(guildId);
    if (queue) {
        if (queue.idleTimer) clearTimeout(queue.idleTimer);
        if (queue.player) queue.player.stop(true);
        if (queue.connection) { try { queue.connection.destroy(); } catch {} }
        queues.delete(guildId);
    }
}

// ─── yt-dlp helpers ─────────────────────────────────────────────────────────

// Cookies para autenticación con YouTube (evita "Sign in to confirm you're not a bot")
const COOKIES_PATH = path.resolve(__dirname, "..", "..", "cookies.txt");
const HAS_COOKIES = fs.existsSync(COOKIES_PATH);
if (HAS_COOKIES) console.log("[Music] Cookies de YouTube encontradas.");

// En Linux con pipx yt-dlp, no usar --remote-components/--js-runtimes (usa plugins nativos)
const USE_EJS = process.platform === "win32";

function ytdlpExec(args) {
    const baseArgs = [
        ...(HAS_COOKIES ? ["--cookies", COOKIES_PATH] : ["--no-cookies"]),
        "--extractor-args", "youtubetab:skip=authcheck",
        "--extractor-args", "youtube:player_client=web",
        ...(USE_EJS ? ["--remote-components", "ejs:github", "--js-runtimes", "node"] : []),
    ];
    const finalArgs = [...baseArgs, ...args];

    return new Promise((resolve, reject) => {
        execFile(YTDLP, finalArgs, { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) return reject(new Error(stderr?.trim()?.split("\n")[0] || err.message));
            resolve(stdout);
        });
    });
}

/**
 * Obtiene info de un video/canción con URL directa del stream
 */
async function getTrackInfo(query) {
    const stdout = await ytdlpExec([
        "--dump-single-json",
        "--format", "18/bestaudio/best",
        "--no-warnings",
        "--no-check-certificates",
        "--no-playlist",
        "--default-search", "ytsearch",
        ...(USE_EJS ? ["--js-runtimes", "node"] : []),
        query,
    ]);

    const info = JSON.parse(stdout);
    const video = info.entries ? info.entries[0] : info;
    if (!video || !video.url) throw new Error("No se encontró la canción");

    return {
        title: video.title || "Sin título",
        artist: video.uploader || video.channel || "",
        pageUrl: video.webpage_url || video.url,
        streamUrl: video.url,
        duration: formatDuration(video.duration || 0),
        durationSec: video.duration || 0,
        httpHeaders: video.http_headers || {},
        thumbnail: video.thumbnail || null,
        platform: detectPlatform(video.webpage_url || query),
    };
}

/**
 * Obtiene tracks de una playlist (YouTube, SoundCloud)
 */
async function getPlaylistTracks(url) {
    const stdout = await ytdlpExec([
        "--dump-single-json",
        "--flat-playlist",
        "--no-warnings",
        "--no-check-certificates",
        ...(USE_EJS ? ["--js-runtimes", "node"] : []),
        url,
    ]);

    const info = JSON.parse(stdout);
    if (!info.entries || info.entries.length === 0) throw new Error("Playlist vacía o no encontrada");

    const playlistTitle = info.title || "Playlist";
    const entries = info.entries.slice(0, MAX_PLAYLIST);
    const tracks = [];

    for (const entry of entries) {
        if (!entry.url && !entry.id) continue;
        tracks.push({
            title: entry.title || "Sin título",
            artist: entry.uploader || entry.channel || "",
            pageUrl: entry.webpage_url || entry.url || `https://www.youtube.com/watch?v=${entry.id}`,
            // streamUrl se obtendrá al reproducir
            streamUrl: null,
            duration: formatDuration(entry.duration || 0),
            durationSec: entry.duration || 0,
            thumbnail: entry.thumbnail || null,
            platform: "youtube",
        });
    }

    return { playlistTitle, tracks };
}

/**
 * Obtiene tracks de Spotify (track, album, playlist)
 */
async function getSpotifyTracks(url) {
    const api = await initSpotify();
    if (!api) throw new Error("Spotify no está configurado. Agrega spotifyClientId y spotifyClientSecret en config.json");

    const match = url.match(/\/(track|album|playlist)\/([a-zA-Z0-9]+)/);
    if (!match) throw new Error("URL de Spotify inválida");

    const [, type, id] = match;
    const tracks = [];
    let playlistTitle = "Spotify";

    if (type === "track") {
        const data = await api.getTrack(id);
        const t = data.body;
        const artists = t.artists.map(a => a.name).join(", ");
        tracks.push({
            title: t.name,
            artist: artists,
            pageUrl: t.external_urls.spotify,
            streamUrl: null, // Se buscará en YouTube al reproducir
            duration: formatDuration(Math.floor(t.duration_ms / 1000)),
            durationSec: Math.floor(t.duration_ms / 1000),
            thumbnail: t.album?.images?.[0]?.url || null,
            platform: "spotify",
            searchQuery: `${t.name} ${artists}`,
        });
    } else if (type === "album") {
        const data = await api.getAlbum(id);
        playlistTitle = data.body.name;
        for (const t of data.body.tracks.items.slice(0, MAX_PLAYLIST)) {
            const artists = t.artists.map(a => a.name).join(", ");
            tracks.push({
                title: t.name,
                artist: artists,
                pageUrl: t.external_urls?.spotify || url,
                streamUrl: null,
                duration: formatDuration(Math.floor(t.duration_ms / 1000)),
                durationSec: Math.floor(t.duration_ms / 1000),
                thumbnail: data.body.images?.[0]?.url || null,
                platform: "spotify",
                searchQuery: `${t.name} ${artists}`,
            });
        }
    } else if (type === "playlist") {
        const data = await api.getPlaylist(id);
        playlistTitle = data.body.name;
        for (const item of data.body.tracks.items.slice(0, MAX_PLAYLIST)) {
            if (!item.track || item.track.type !== "track") continue;
            const t = item.track;
            const artists = t.artists.map(a => a.name).join(", ");
            tracks.push({
                title: t.name,
                artist: artists,
                pageUrl: t.external_urls?.spotify || url,
                streamUrl: null,
                duration: formatDuration(Math.floor(t.duration_ms / 1000)),
                durationSec: Math.floor(t.duration_ms / 1000),
                thumbnail: t.album?.images?.[0]?.url || null,
                platform: "spotify",
                searchQuery: `${t.name} ${artists}`,
            });
        }
    }

    return { playlistTitle, tracks };
}

/**
 * Resuelve el streamUrl de un track (busca en YouTube si es Spotify)
 */
async function resolveStreamUrl(song) {
    if (song.streamUrl) return song;

    // Para Spotify y tracks sin stream, buscar en YouTube
    const query = song.searchQuery || `${song.title} ${song.artist}`;
    const resolved = await getTrackInfo(query);
    song.streamUrl = resolved.streamUrl;
    song.httpHeaders = resolved.httpHeaders;
    if (!song.pageUrl || song.platform === "spotify") {
        // Mantener la URL de Spotify como pageUrl
    }
    return song;
}

// ─── Audio Stream ───────────────────────────────────────────────────────────

function createAudioStream(pageUrl, streamUrl, httpHeaders = {}, filter = null) {
    const { spawn } = require("child_process");
    const { PassThrough } = require("stream");

    const filterArgs = [];
    if (filter && AUDIO_FILTERS[filter]) {
        filterArgs.push("-af", AUDIO_FILTERS[filter].af);
    }

    // Usar yt-dlp para descargar y pipear a FFmpeg (evita bloqueos de YouTube)
    const ytdlpArgs = [
        ...(HAS_COOKIES ? ["--cookies", COOKIES_PATH] : ["--no-cookies"]),
        "--extractor-args", "youtubetab:skip=authcheck",
        "--extractor-args", "youtube:player_client=web",
        ...(USE_EJS ? ["--remote-components", "ejs:github", "--js-runtimes", "node"] : []),
        "-f", "18/bestaudio/best",
        "--no-warnings",
        "--no-check-certificates",
        "--no-playlist",
        "-o", "-",
        pageUrl,
    ];

    const ytdlp = spawn(YTDLP, ytdlpArgs, { stdio: ["ignore", "pipe", "pipe"] });

    ytdlp.stderr.on("data", (data) => {
        const msg = data.toString().trim();
        if (msg && !msg.includes("[download]")) console.log("[Music] yt-dlp:", msg);
    });

    // FFmpeg convierte a PCM raw
    const ffmpeg = spawn(ffmpegPath, [
        "-analyzeduration", "0",
        "-loglevel", "error",
        "-i", "pipe:0",
        ...filterArgs,
        "-f", "s16le",
        "-ar", "48000",
        "-ac", "2",
        "pipe:1",
    ], { stdio: ["pipe", "pipe", "pipe"] });

    // Conectar yt-dlp → FFmpeg
    ytdlp.stdout.pipe(ffmpeg.stdin).on("error", () => {});

    // PassThrough para garantizar un Readable limpio para @discordjs/voice
    const output = new PassThrough();
    ffmpeg.stdout.pipe(output).on("error", () => {});

    ytdlp.on("error", (err) => console.error("[Music] yt-dlp spawn error:", err.message));
    ffmpeg.on("error", () => {});
    ffmpeg.stderr.on("data", (data) => {
        const msg = data.toString().trim();
        if (msg) console.error("[Music] FFmpeg error:", msg);
    });

    // Limpieza cuando uno termina
    ytdlp.on("close", () => { try { ffmpeg.stdin.end(); } catch {} });
    ffmpeg.on("close", () => { try { ytdlp.kill(); } catch {} output.end(); });

    // Guardar referencias para poder limpiar desde fuera
    output._ytdlp = ytdlp;
    output._ffmpeg = ffmpeg;

    return output;
}

// ─── Embeds ─────────────────────────────────────────────────────────────────

function getPlatformEmoji(platform) {
    if (platform?.includes("spotify")) return "🟢";
    if (platform?.includes("soundcloud")) return "🟠";
    if (platform === "direct") return "🔗";
    return "🔴";
}

function nowPlayingEmbed(song) {
    const emoji = getPlatformEmoji(song.platform);
    return new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🎵 Reproduciendo")
        .setDescription(`${emoji} [${song.title}](${song.pageUrl})`)
        .addFields(
            { name: "Duración", value: song.duration, inline: true },
            { name: "Pedida por", value: song.requestedBy, inline: true },
        )
        .setThumbnail(song.thumbnail || null)
        .setTimestamp();
}

function addedToQueueEmbed(song, position) {
    const emoji = getPlatformEmoji(song.platform);
    return new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("✅ Añadida a la cola")
        .setDescription(`${emoji} [${song.title}](${song.pageUrl})`)
        .addFields(
            { name: "Duración", value: song.duration, inline: true },
            { name: "Posición", value: `#${position}`, inline: true },
        )
        .setTimestamp();
}

function playlistAddedEmbed(playlistTitle, count, platform) {
    const emoji = getPlatformEmoji(platform);
    return new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle("📋 Playlist añadida")
        .setDescription(`${emoji} **${playlistTitle}**\n\n🎵 **${count}** canciones añadidas a la cola.`)
        .setTimestamp();
}

function queueEmbed(queue) {
    const current = queue.songs[0];
    const upcoming = queue.songs.slice(1);
    const emoji = getPlatformEmoji(current.platform);

    let description = `**Reproduciendo:**\n${emoji} [${current.title}](${current.pageUrl}) — ${current.duration}\n`;

    if (upcoming.length > 0) {
        description += "\n**En cola:**\n";
        upcoming.slice(0, 15).forEach((song, i) => {
            const e = getPlatformEmoji(song.platform);
            description += `\`${i + 1}.\` ${e} [${song.title}](${song.pageUrl}) — ${song.duration}\n`;
        });
        if (upcoming.length > 15) description += `\n...y **${upcoming.length - 15}** más.`;
    } else {
        description += "\nNo hay más canciones en la cola.";
    }

    return new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("📜 Cola de reproducción")
        .setDescription(description)
        .setFooter({ text: `${queue.songs.length} canción(es)` })
        .setTimestamp();
}

// ─── Reproducción interna ───────────────────────────────────────────────────

async function playSong(guildId) {
    const queue = getQueue(guildId);
    if (!queue) return;

    if (queue.songs.length === 0) {
        queue.playing = false;
        queue.idleTimer = setTimeout(() => {
            const q = getQueue(guildId);
            if (q && q.songs.length === 0) {
                q.textChannel.send("⏹️ Me desconecto por inactividad.").catch(() => {});
                deleteQueue(guildId);
            }
        }, IDLE_TIMEOUT);
        return;
    }

    if (queue.idleTimer) { clearTimeout(queue.idleTimer); queue.idleTimer = null; }

    const song = queue.songs[0];
    queue.playing = true;

    try {
        // Resolver streamUrl si no lo tiene (Spotify, playlist items)
        await resolveStreamUrl(song);

        if (!song.streamUrl) throw new Error("No se pudo obtener el stream de audio");

        console.log(`[Music] Reproduciendo: ${song.pageUrl}`);
        const audioStream = createAudioStream(song.pageUrl, song.streamUrl, song.httpHeaders || {}, queue.filter || null);

        audioStream.on("data", () => {
            if (!audioStream._loggedData) {
                console.log("[Music] Audio streaming ✓");
                audioStream._loggedData = true;
            }
        });
        audioStream.on("error", () => {});

        const resource = createAudioResource(audioStream, { inputType: StreamType.Raw, inlineVolume: true });
        resource.volume?.setVolume(1);
        queue.player.play(resource);

        console.log(`[Music] Player state: ${queue.player.state.status}`);
        console.log(`[Music] Connection state: ${queue.connection.state.status}`);
        console.log(`[Music] Connection subscriptions: ${queue.connection.state.subscription ? 'SI' : 'NO'}`);

        await queue.textChannel.send({ embeds: [nowPlayingEmbed(song)] }).catch(() => {});
    } catch (error) {
        console.error(`[Music] Error al reproducir "${song.title}":`, error.message);
        await queue.textChannel.send(`❌ Error al reproducir **${song.title}**. Saltando...`).catch(() => {});
        queue.songs.shift();
        return playSong(guildId);
    }
}

// ─── Crear/obtener cola ─────────────────────────────────────────────────────

async function ensureQueue(message) {
    const voiceChannel = message.member?.voice?.channel;
    let queue = getQueue(message.guild.id);

    if (queue) {
        queue.textChannel = message.channel;
        return queue;
    }

    const player = createAudioPlayer();
    let connection;

    try {
        console.log(`[Music] Conectando al canal: ${voiceChannel.name} (${voiceChannel.id})`);
        connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator,
            selfDeaf: true,
            selfMute: false,
        });
        connection.on("stateChange", (old, curr) => {
            console.log(`[Music] Voice state: ${old.status} -> ${curr.status}`);
        });
        await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    } catch (err) {
        console.error("[Music] Error al conectar al canal de voz:", err);
        if (connection) try { connection.destroy(); } catch {}
        throw new Error("No pude conectarme al canal de voz.");
    }

    queue = { songs: [], connection, player, playing: false, textChannel: message.channel, idleTimer: null, filter: null };
    queues.set(message.guild.id, queue);
    connection.subscribe(player);

    const guildId = message.guild.id;

    player.on(AudioPlayerStatus.Idle, () => {
        const q = getQueue(guildId);
        if (q) { q.songs.shift(); playSong(guildId); }
    });

    player.on("error", (error) => {
        console.error("[Music] AudioPlayer error:", error.message);
        const q = getQueue(guildId);
        if (q) { q.textChannel.send("❌ Error. Saltando...").catch(() => {}); q.songs.shift(); playSong(guildId); }
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
            await Promise.race([
                entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
            ]);
        } catch { deleteQueue(guildId); }
    });

    return queue;
}

// ─── Comandos ───────────────────────────────────────────────────────────────

async function handlePlay(message) {
    const args = message.content.split(/\s+/).slice(1).join(" ").trim();
    if (!args) return message.reply("❌ Uso: `!play <url o búsqueda>`\n\nSoporta: YouTube, Spotify, SoundCloud, links directos (.mp3, etc)");

    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) return message.reply("❌ Debes estar en un canal de voz.");

    const botPerms = voiceChannel.permissionsFor(message.guild.members.me);
    if (!botPerms.has("Connect") || !botPerms.has("Speak")) {
        return message.reply("❌ No tengo permisos para unirme o hablar en ese canal.");
    }

    const platform = detectPlatform(args);
    const searching = await message.reply(`🔍 Buscando en ${platform.includes("spotify") ? "Spotify" : platform.includes("soundcloud") ? "SoundCloud" : "YouTube"}...`);

    try {
        const requestedBy = message.author.displayName ?? message.author.username;
        let queue;

        // ─── Playlists / Albums ───
        if (platform === "youtube-playlist" || platform === "soundcloud-playlist") {
            const { playlistTitle, tracks } = await getPlaylistTracks(args);
            if (tracks.length === 0) return searching.edit("❌ Playlist vacía.");

            tracks.forEach(t => { t.requestedBy = requestedBy; });

            queue = await ensureQueue(message);
            const wasEmpty = queue.songs.length === 0;
            queue.songs.push(...tracks);

            await searching.edit({ content: null, embeds: [playlistAddedEmbed(playlistTitle, tracks.length, platform)] });

            if (wasEmpty) playSong(message.guild.id);
            return;
        }

        if (platform.startsWith("spotify")) {
            const { playlistTitle, tracks } = await getSpotifyTracks(args);
            if (tracks.length === 0) return searching.edit("❌ No se encontraron tracks en Spotify.");

            tracks.forEach(t => { t.requestedBy = requestedBy; });

            queue = await ensureQueue(message);
            const wasEmpty = queue.songs.length === 0;
            queue.songs.push(...tracks);

            if (tracks.length === 1) {
                await searching.delete().catch(() => {});
            } else {
                await searching.edit({ content: null, embeds: [playlistAddedEmbed(playlistTitle, tracks.length, "spotify")] });
            }

            if (wasEmpty) playSong(message.guild.id);
            return;
        }

        // ─── Track individual (YouTube, SoundCloud, Direct, Búsqueda) ───
        const info = await getTrackInfo(args);
        const songInfo = {
            ...info,
            requestedBy,
        };

        await searching.delete().catch(() => {});

        queue = await ensureQueue(message);
        queue.songs.push(songInfo);

        if (!queue.playing) {
            return playSong(message.guild.id);
        }

        return message.channel.send({ embeds: [addedToQueueEmbed(songInfo, queue.songs.length - 1)] });

    } catch (error) {
        console.error("[Music] Error:", error.message);
        return searching.edit(`❌ Error: ${error.message.split("\n")[0].substring(0, 200)}`);
    }
}

async function handleSkip(message) {
    const queue = getQueue(message.guild.id);
    if (!queue || !queue.playing) return message.reply("❌ No hay nada reproduciéndose.");
    if (!message.member?.voice?.channel) return message.reply("❌ Debes estar en un canal de voz.");
    if (!isDJ(message.member)) return message.reply("❌ Necesitas el rol **DJ** o permiso de `Gestionar Mensajes` para usar este comando.");
    const skipped = queue.songs[0];
    queue.player.stop();
    return message.channel.send(`⏭️ Se saltó **${skipped?.title ?? "la canción"}**.`);
}

async function handleStop(message) {
    if (!getQueue(message.guild.id)) return message.reply("❌ No hay nada reproduciéndose.");
    if (!message.member?.voice?.channel) return message.reply("❌ Debes estar en un canal de voz.");
    if (!isDJ(message.member)) return message.reply("❌ Necesitas el rol **DJ** o permiso de `Gestionar Mensajes` para usar este comando.");
    await message.channel.send("⏹️ Reproducción detenida.");
    deleteQueue(message.guild.id);
}

async function handleQueue(message) {
    const queue = getQueue(message.guild.id);
    if (!queue || queue.songs.length === 0) return message.reply("📭 La cola está vacía.");
    return message.channel.send({ embeds: [queueEmbed(queue)] });
}

async function handlePause(message) {
    const queue = getQueue(message.guild.id);
    if (!queue || !queue.playing) return message.reply("❌ No hay nada reproduciéndose.");
    if (!message.member?.voice?.channel) return message.reply("❌ Debes estar en un canal de voz.");
    if (queue.player.state.status === AudioPlayerStatus.Paused) return message.reply("⚠️ Ya está pausado.");
    queue.player.pause();
    return message.channel.send("⏸️ Pausado. Usa `!resume` para reanudar.");
}

async function handleResume(message) {
    const queue = getQueue(message.guild.id);
    if (!queue) return message.reply("❌ No hay nada en la cola.");
    if (!message.member?.voice?.channel) return message.reply("❌ Debes estar en un canal de voz.");
    if (queue.player.state.status !== AudioPlayerStatus.Paused) return message.reply("⚠️ No está pausado.");
    queue.player.unpause();
    return message.channel.send("▶️ Reanudado.");
}

async function handleNowPlaying(message) {
    const queue = getQueue(message.guild.id);
    if (!queue || !queue.playing || queue.songs.length === 0) return message.reply("❌ No hay nada reproduciéndose.");
    return message.channel.send({ embeds: [nowPlayingEmbed(queue.songs[0])] });
}

// ─── Filtros de audio (comando) ────────────────────────────────────────────

async function handleFilter(message) {
    const queue = getQueue(message.guild.id);
    if (!queue || !queue.playing) return message.reply("❌ No hay nada reproduciéndose.");
    if (!message.member?.voice?.channel) return message.reply("❌ Debes estar en un canal de voz.");
    if (!isDJ(message.member)) return message.reply("❌ Necesitas el rol **DJ** o permiso de `Gestionar Mensajes` para usar este comando.");

    const filterName = message.content.split(/\s+/).slice(1).join(" ").trim().toLowerCase();
    const validFilters = [...Object.keys(AUDIO_FILTERS), "off"];

    if (!filterName || !validFilters.includes(filterName)) {
        return message.reply(`❌ Uso: \`!filter <nombre>\`\nFiltros disponibles: ${validFilters.map(f => `\`${f}\``).join(", ")}`);
    }

    if (filterName === "off") {
        queue.filter = null;
        await message.channel.send({
            embeds: [new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle("🔄 Filtro desactivado")
                .setDescription("Se ha desactivado el filtro de audio.")
                .setTimestamp()],
        });
    } else {
        const info = AUDIO_FILTERS[filterName];
        queue.filter = filterName;
        await message.channel.send({
            embeds: [new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle(`${info.emoji} Filtro: ${info.name}`)
                .setDescription(`Se ha activado el filtro **${info.name}**.`)
                .setTimestamp()],
        });
    }

    // Reiniciar la canción actual con el nuevo filtro
    const song = queue.songs[0];
    if (song) {
        try {
            await resolveStreamUrl(song);
            const audioStream = createAudioStream(song.pageUrl, song.streamUrl, song.httpHeaders || {}, queue.filter);
            const resource = createAudioResource(audioStream, { inputType: StreamType.Raw, inlineVolume: true });
            resource.volume?.setVolume(1);
            queue.player.play(resource);
        } catch (error) {
            console.error("[Music] Error al aplicar filtro:", error.message);
            message.channel.send("❌ Error al aplicar el filtro.").catch(() => {});
        }
    }
}

// ─── Favoritos ─────────────────────────────────────────────────────────────

async function handleFav(message) {
    const queue = getQueue(message.guild.id);
    if (!queue || !queue.playing || queue.songs.length === 0) {
        return message.reply("❌ No hay nada reproduciéndose para guardar.");
    }

    const song = queue.songs[0];
    const userId = message.author.id;
    const favorites = loadFavorites();

    if (!favorites[userId]) favorites[userId] = [];

    if (favorites[userId].length >= MAX_FAVORITES) {
        return message.reply(`❌ Ya tienes el máximo de **${MAX_FAVORITES}** favoritos. Elimina alguno con \`!favdel <número>\`.`);
    }

    const alreadyExists = favorites[userId].some(f => f.pageUrl === song.pageUrl);
    if (alreadyExists) return message.reply("⚠️ Esta canción ya está en tus favoritos.");

    favorites[userId].push({
        title: song.title,
        pageUrl: song.pageUrl,
        searchQuery: song.searchQuery || `${song.title} ${song.artist || ""}`.trim(),
    });
    saveFavorites(favorites);

    return message.channel.send({
        embeds: [new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle("⭐ Añadida a favoritos")
            .setDescription(`**${song.title}** se guardó en tus favoritos.\nTienes **${favorites[userId].length}/${MAX_FAVORITES}** favoritos.`)
            .setTimestamp()],
    });
}

async function handleFavList(message) {
    const userId = message.author.id;
    const favorites = loadFavorites();
    const userFavs = favorites[userId] || [];

    if (userFavs.length === 0) return message.reply("📭 No tienes favoritos guardados. Usa `!fav` mientras suena una canción.");

    let description = "";
    userFavs.forEach((fav, i) => {
        description += `\`${i + 1}.\` [${fav.title}](${fav.pageUrl})\n`;
    });

    return message.channel.send({
        embeds: [new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("⭐ Tus favoritos")
            .setDescription(description)
            .setFooter({ text: `${userFavs.length}/${MAX_FAVORITES} favoritos` })
            .setTimestamp()],
    });
}

async function handleFavPlay(message) {
    const num = parseInt(message.content.split(/\s+/)[1]);
    const userId = message.author.id;
    const favorites = loadFavorites();
    const userFavs = favorites[userId] || [];

    if (!num || num < 1 || num > userFavs.length) {
        return message.reply(`❌ Uso: \`!favplay <número>\` (1-${userFavs.length || 0}). Usa \`!favlist\` para ver tus favoritos.`);
    }

    const fav = userFavs[num - 1];
    // Simular el comando !play con la query del favorito
    message.content = `!play ${fav.searchQuery || fav.pageUrl}`;
    return handlePlay(message);
}

async function handleFavDel(message) {
    const num = parseInt(message.content.split(/\s+/)[1]);
    const userId = message.author.id;
    const favorites = loadFavorites();
    const userFavs = favorites[userId] || [];

    if (!num || num < 1 || num > userFavs.length) {
        return message.reply(`❌ Uso: \`!favdel <número>\` (1-${userFavs.length || 0}). Usa \`!favlist\` para ver tus favoritos.`);
    }

    const removed = userFavs.splice(num - 1, 1)[0];
    favorites[userId] = userFavs;
    saveFavorites(favorites);

    return message.channel.send({
        embeds: [new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("🗑️ Favorito eliminado")
            .setDescription(`Se eliminó **${removed.title}** de tus favoritos.`)
            .setTimestamp()],
    });
}

// ─── Lyrics ────────────────────────────────────────────────────────────────

async function handleLyrics(message) {
    const args = message.content.split(/\s+/).slice(1).join(" ").trim();
    let searchTitle = args;

    if (!searchTitle) {
        const queue = getQueue(message.guild.id);
        if (!queue || !queue.playing || queue.songs.length === 0) {
            return message.reply("❌ No hay nada reproduciéndose. Usa `!lyrics <nombre de canción>` para buscar letras.");
        }
        searchTitle = queue.songs[0].title;
    }

    const searching = await message.reply(`🔍 Buscando letras de **${searchTitle}**...`);

    try {
        const searches = await GeniusClient.songs.search(searchTitle);
        if (!searches || searches.length === 0) {
            return searching.edit(`❌ No se encontraron letras para **${searchTitle}**.`);
        }

        const song = searches[0];
        const lyrics = await song.lyrics();
        if (!lyrics) return searching.edit(`❌ No se encontraron letras para **${searchTitle}**.`);

        // Paginar si es muy largo
        const chunks = [];
        const maxLen = 4000;
        let remaining = lyrics;
        while (remaining.length > 0) {
            if (remaining.length <= maxLen) {
                chunks.push(remaining);
                break;
            }
            // Cortar en el último salto de línea antes del límite
            let cutIndex = remaining.lastIndexOf("\n", maxLen);
            if (cutIndex === -1) cutIndex = maxLen;
            chunks.push(remaining.substring(0, cutIndex));
            remaining = remaining.substring(cutIndex).trimStart();
        }

        await searching.delete().catch(() => {});

        for (let i = 0; i < chunks.length; i++) {
            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle(i === 0 ? `📝 ${song.title} — ${song.artist.name}` : `📝 Continuación (${i + 1}/${chunks.length})`)
                .setDescription(chunks[i])
                .setTimestamp();

            if (i === 0 && song.thumbnail) embed.setThumbnail(song.thumbnail);
            if (chunks.length > 1) embed.setFooter({ text: `Página ${i + 1}/${chunks.length}` });

            await message.channel.send({ embeds: [embed] });
        }
    } catch (error) {
        console.error("[Music] Error al buscar letras:", error.message);
        return searching.edit(`❌ Error al buscar letras: ${error.message.substring(0, 200)}`);
    }
}

module.exports = {
    handlePlay, handleSkip, handleStop, handleQueue, handlePause, handleResume, handleNowPlaying,
    handleFilter, handleFav, handleFavList, handleFavPlay, handleFavDel, handleLyrics,
};

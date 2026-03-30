const { LavaShark, Player } = require("lavashark");
const { EmbedBuilder } = require("discord.js");
const path = require("path");
const fs = require("fs");
const config = require("../../config.json");
const Genius = require("genius-lyrics");
const GeniusClient = new Genius.Client();

const FAVORITES_PATH = path.resolve(__dirname, "..", "data", "favorites.json");
const MAX_FAVORITES = 50;
const IDLE_TIMEOUT = 120_000;
const MAX_PLAYLIST = 50;

// ─── Filtros de audio (Lavalink) ──────────────────────────────────────────

const AUDIO_FILTERS = {
    bassboost: { equalizer: [{ band: 0, gain: 0.6 }, { band: 1, gain: 0.5 }, { band: 2, gain: 0.4 }, { band: 3, gain: 0.3 }], emoji: "🔊", name: "Bass Boost" },
    nightcore: { timescale: { speed: 1.25, pitch: 1.25, rate: 1.0 }, emoji: "🌙", name: "Nightcore" },
    vaporwave: { timescale: { speed: 0.8, pitch: 0.8, rate: 1.0 }, emoji: "🌊", name: "Vaporwave" },
    "8d": { rotation: { rotationHz: 0.2 }, emoji: "🎧", name: "8D" },
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

function formatDuration(ms) {
    if (!ms || isNaN(ms)) return "EN VIVO";
    const seconds = Math.floor(ms / 1000);
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// ─── LavaShark setup ────────────────────────────────────────────────────────

let lavashark = null;

function initLavaShark(client) {
    lavashark = new LavaShark({
        nodes: [
            {
                id: "main",
                hostname: "localhost",
                port: 2333,
                password: "BotArvoLavalink2026",
            },
        ],
        sendWS: (guildId, payload) => {
            const guild = client.guilds.cache.get(guildId);
            if (guild) guild.shard.send(payload);
        },
    });

    lavashark.on("nodeConnect", (node) => {
        console.log(`[Music] Lavalink conectado: ${node.identifier}`);
    });

    lavashark.on("nodeError", (node, err) => {
        console.error(`[Music] Lavalink error (${node.identifier}):`, err.message);
    });

    lavashark.on("nodeDisconnect", (node, code, reason) => {
        console.warn(`[Music] Lavalink desconectado (${node.identifier}): ${code} - ${reason}`);
    });

    lavashark.on("trackStart", (player, track) => {
        const embed = nowPlayingEmbed(track, player);
        player.metadata?.textChannel?.send({ embeds: [embed] }).catch(() => {});
    });

    lavashark.on("trackEnd", (player, track, reason) => {
        if (player.metadata?.idleTimer) {
            clearTimeout(player.metadata.idleTimer);
            player.metadata.idleTimer = null;
        }
    });

    lavashark.on("trackException", (player, track, exception) => {
        console.error(`[Music] Error al reproducir "${track.title}":`, exception.message);
        player.metadata?.textChannel?.send(`❌ Error al reproducir **${track.title}**. Saltando...`).catch(() => {});
        player.skip();
    });

    lavashark.on("trackStuck", (player, track, thresholdMs) => {
        console.warn(`[Music] Track stuck: "${track.title}" (${thresholdMs}ms)`);
        player.metadata?.textChannel?.send(`⚠️ **${track.title}** se trabó. Saltando...`).catch(() => {});
        player.skip();
    });

    lavashark.on("queueEnd", (player) => {
        const timeout = setTimeout(() => {
            if (player.queue.tracks.length === 0) {
                player.metadata?.textChannel?.send("⏹️ Me desconecto por inactividad.").catch(() => {});
                player.destroy();
            }
        }, IDLE_TIMEOUT);
        if (player.metadata) player.metadata.idleTimer = timeout;
    });

    // Manejar eventos raw de Discord para la conexión de voz
    client.on("raw", (packet) => {
        lavashark.handleVoiceUpdate(packet);
    });

    lavashark.start(client.user.id);
    console.log("[Music] LavaShark iniciado.");
}

// ─── Embeds ─────────────────────────────────────────────────────────────────

function getPlatformEmoji(uri) {
    if (uri?.includes("spotify")) return "🟢";
    if (uri?.includes("soundcloud")) return "🟠";
    if (uri?.includes("http") && !uri?.includes("youtube")) return "🔗";
    return "🔴";
}

function nowPlayingEmbed(track, player) {
    const emoji = getPlatformEmoji(track.uri);
    const requestedBy = track.requestedBy || "Desconocido";
    return new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🎵 Reproduciendo")
        .setDescription(`${emoji} [${track.title}](${track.uri})`)
        .addFields(
            { name: "Duración", value: formatDuration(track.duration), inline: true },
            { name: "Pedida por", value: requestedBy, inline: true },
        )
        .setThumbnail(track.thumbnail || null)
        .setTimestamp();
}

function addedToQueueEmbed(track, position) {
    const emoji = getPlatformEmoji(track.uri);
    return new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("✅ Añadida a la cola")
        .setDescription(`${emoji} [${track.title}](${track.uri})`)
        .addFields(
            { name: "Duración", value: formatDuration(track.duration), inline: true },
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

function queueEmbed(player) {
    const current = player.current;
    const upcoming = player.queue.tracks;
    const emoji = getPlatformEmoji(current?.uri);

    let description = `**Reproduciendo:**\n${emoji} [${current.title}](${current.uri}) — ${formatDuration(current.duration)}\n`;

    if (upcoming.length > 0) {
        description += "\n**En cola:**\n";
        upcoming.slice(0, 15).forEach((track, i) => {
            const e = getPlatformEmoji(track.uri);
            description += `\`${i + 1}.\` ${e} [${track.title}](${track.uri}) — ${formatDuration(track.duration)}\n`;
        });
        if (upcoming.length > 15) description += `\n...y **${upcoming.length - 15}** más.`;
    } else {
        description += "\nNo hay más canciones en la cola.";
    }

    return new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("📜 Cola de reproducción")
        .setDescription(description)
        .setFooter({ text: `${upcoming.length + 1} canción(es)` })
        .setTimestamp();
}

// ─── Resolver Spotify → búsqueda en YouTube ────────────────────────────────

async function resolveSpotifyTracks(url) {
    const api = await initSpotify();
    if (!api) throw new Error("Spotify no está configurado. Agrega spotifyClientId y spotifyClientSecret en config.json");

    const match = url.match(/\/(track|album|playlist)\/([a-zA-Z0-9]+)/);
    if (!match) throw new Error("URL de Spotify inválida");

    const [, type, id] = match;
    const queries = [];
    let playlistTitle = "Spotify";

    if (type === "track") {
        const data = await api.getTrack(id);
        const t = data.body;
        const artists = t.artists.map(a => a.name).join(", ");
        queries.push({ query: `${t.name} ${artists}`, title: t.name });
    } else if (type === "album") {
        const data = await api.getAlbum(id);
        playlistTitle = data.body.name;
        for (const t of data.body.tracks.items.slice(0, MAX_PLAYLIST)) {
            const artists = t.artists.map(a => a.name).join(", ");
            queries.push({ query: `${t.name} ${artists}`, title: t.name });
        }
    } else if (type === "playlist") {
        const data = await api.getPlaylist(id);
        playlistTitle = data.body.name;
        for (const item of data.body.tracks.items.slice(0, MAX_PLAYLIST)) {
            if (!item.track || item.track.type !== "track") continue;
            const t = item.track;
            const artists = t.artists.map(a => a.name).join(", ");
            queries.push({ query: `${t.name} ${artists}`, title: t.name });
        }
    }

    return { playlistTitle, queries };
}

// ─── Obtener o crear player ─────────────────────────────────────────────────

function getOrCreatePlayer(message) {
    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) throw new Error("Debes estar en un canal de voz.");

    const botPerms = voiceChannel.permissionsFor(message.guild.members.me);
    if (!botPerms.has("Connect") || !botPerms.has("Speak")) {
        throw new Error("No tengo permisos para unirme o hablar en ese canal.");
    }

    let player = lavashark.getPlayer(message.guild.id);

    if (!player) {
        player = lavashark.createPlayer({
            guildId: message.guild.id,
            voiceChannelId: voiceChannel.id,
            textChannelId: message.channel.id,
            selfDeaf: true,
            selfMute: false,
        });
        player.metadata = { textChannel: message.channel, idleTimer: null };
    } else {
        player.metadata = { ...player.metadata, textChannel: message.channel };
    }

    return player;
}

// ─── Comandos ───────────────────────────────────────────────────────────────

async function handlePlay(message) {
    const args = message.content.split(/\s+/).slice(1).join(" ").trim();
    if (!args) return message.reply("❌ Uso: `!play <url o búsqueda>`\n\nSoporta: YouTube, Spotify, SoundCloud, links directos (.mp3, etc)");

    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) return message.reply("❌ Debes estar en un canal de voz.");

    const platform = detectPlatform(args);
    const searching = await message.reply(`🔍 Buscando en ${platform.includes("spotify") ? "Spotify" : platform.includes("soundcloud") ? "SoundCloud" : "YouTube"}...`);

    try {
        const requestedBy = message.author.displayName ?? message.author.username;
        const player = getOrCreatePlayer(message);

        // Conectar si no está conectado
        if (!player.connected) {
            await player.connect();
        }

        // ─── Spotify ───
        if (platform.startsWith("spotify")) {
            const { playlistTitle, queries } = await resolveSpotifyTracks(args);
            if (queries.length === 0) return searching.edit("❌ No se encontraron tracks en Spotify.");

            let added = 0;
            for (const q of queries) {
                try {
                    const result = await lavashark.search(`ytsearch:${q.query}`);
                    if (result.tracks.length > 0) {
                        const track = result.tracks[0];
                        track.requestedBy = requestedBy;
                        player.queue.add(track);
                        added++;
                    }
                } catch {}
            }

            if (added === 0) return searching.edit("❌ No se encontraron canciones.");

            if (queries.length === 1) {
                await searching.delete().catch(() => {});
            } else {
                await searching.edit({ content: null, embeds: [playlistAddedEmbed(playlistTitle, added, "spotify")] });
            }

            if (!player.playing) player.play();
            return;
        }

        // ─── YouTube, SoundCloud, Direct, Búsqueda ───
        let query = args;
        if (platform === "search") {
            query = `ytsearch:${args}`;
        }

        const result = await lavashark.search(query);

        if (!result || (!result.tracks?.length && !result.playlistInfo?.name)) {
            return searching.edit("❌ No se encontró ningún resultado.");
        }

        // Playlist de YouTube/SoundCloud
        if (result.loadType === "playlist") {
            const tracks = result.tracks.slice(0, MAX_PLAYLIST);
            tracks.forEach(t => { t.requestedBy = requestedBy; });
            player.queue.add(tracks);

            await searching.edit({ content: null, embeds: [playlistAddedEmbed(result.playlistInfo.name, tracks.length, platform)] });

            if (!player.playing) player.play();
            return;
        }

        // Track individual
        const track = result.tracks[0];
        track.requestedBy = requestedBy;
        player.queue.add(track);

        await searching.delete().catch(() => {});

        if (!player.playing) {
            player.play();
        } else {
            await message.channel.send({ embeds: [addedToQueueEmbed(track, player.queue.tracks.length)] });
        }

    } catch (error) {
        console.error("[Music] Error:", error.message);
        return searching.edit(`❌ Error: ${error.message.split("\n")[0].substring(0, 200)}`);
    }
}

async function handleSkip(message) {
    const player = lavashark.getPlayer(message.guild.id);
    if (!player || !player.playing) return message.reply("❌ No hay nada reproduciéndose.");
    if (!message.member?.voice?.channel) return message.reply("❌ Debes estar en un canal de voz.");
    if (!isDJ(message.member)) return message.reply("❌ Necesitas el rol **DJ** o permiso de `Gestionar Mensajes` para usar este comando.");
    const title = player.current?.title ?? "la canción";
    player.skip();
    return message.channel.send(`⏭️ Se saltó **${title}**.`);
}

async function handleStop(message) {
    const player = lavashark.getPlayer(message.guild.id);
    if (!player) return message.reply("❌ No hay nada reproduciéndose.");
    if (!message.member?.voice?.channel) return message.reply("❌ Debes estar en un canal de voz.");
    if (!isDJ(message.member)) return message.reply("❌ Necesitas el rol **DJ** o permiso de `Gestionar Mensajes` para usar este comando.");
    await message.channel.send("⏹️ Reproducción detenida.");
    player.destroy();
}

async function handleQueue(message) {
    const player = lavashark.getPlayer(message.guild.id);
    if (!player || !player.current) return message.reply("📭 La cola está vacía.");
    return message.channel.send({ embeds: [queueEmbed(player)] });
}

async function handlePause(message) {
    const player = lavashark.getPlayer(message.guild.id);
    if (!player || !player.playing) return message.reply("❌ No hay nada reproduciéndose.");
    if (!message.member?.voice?.channel) return message.reply("❌ Debes estar en un canal de voz.");
    if (player.paused) return message.reply("⚠️ Ya está pausado.");
    player.pause();
    return message.channel.send("⏸️ Pausado. Usa `!resume` para reanudar.");
}

async function handleResume(message) {
    const player = lavashark.getPlayer(message.guild.id);
    if (!player) return message.reply("❌ No hay nada en la cola.");
    if (!message.member?.voice?.channel) return message.reply("❌ Debes estar en un canal de voz.");
    if (!player.paused) return message.reply("⚠️ No está pausado.");
    player.resume();
    return message.channel.send("▶️ Reanudado.");
}

async function handleNowPlaying(message) {
    const player = lavashark.getPlayer(message.guild.id);
    if (!player || !player.current) return message.reply("❌ No hay nada reproduciéndose.");
    return message.channel.send({ embeds: [nowPlayingEmbed(player.current, player)] });
}

// ─── Filtros de audio (comando) ────────────────────────────────────────────

async function handleFilter(message) {
    const player = lavashark.getPlayer(message.guild.id);
    if (!player || !player.playing) return message.reply("❌ No hay nada reproduciéndose.");
    if (!message.member?.voice?.channel) return message.reply("❌ Debes estar en un canal de voz.");
    if (!isDJ(message.member)) return message.reply("❌ Necesitas el rol **DJ** o permiso de `Gestionar Mensajes` para usar este comando.");

    const filterName = message.content.split(/\s+/).slice(1).join(" ").trim().toLowerCase();
    const validFilters = [...Object.keys(AUDIO_FILTERS), "off"];

    if (!filterName || !validFilters.includes(filterName)) {
        return message.reply(`❌ Uso: \`!filter <nombre>\`\nFiltros disponibles: ${validFilters.map(f => `\`${f}\``).join(", ")}`);
    }

    if (filterName === "off") {
        await player.filters.set({});
        await message.channel.send({
            embeds: [new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle("🔄 Filtro desactivado")
                .setDescription("Se ha desactivado el filtro de audio.")
                .setTimestamp()],
        });
    } else {
        const filterConfig = AUDIO_FILTERS[filterName];
        const filters = {};
        if (filterConfig.equalizer) filters.equalizer = filterConfig.equalizer;
        if (filterConfig.timescale) filters.timescale = filterConfig.timescale;
        if (filterConfig.rotation) filters.rotation = filterConfig.rotation;
        await player.filters.set(filters);

        const info = filterConfig;
        await message.channel.send({
            embeds: [new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle(`${info.emoji} Filtro: ${info.name}`)
                .setDescription(`Se ha activado el filtro **${info.name}**.`)
                .setTimestamp()],
        });
    }
}

// ─── Favoritos ─────────────────────────────────────────────────────────────

async function handleFav(message) {
    const player = lavashark.getPlayer(message.guild.id);
    if (!player || !player.current) {
        return message.reply("❌ No hay nada reproduciéndose para guardar.");
    }

    const track = player.current;
    const userId = message.author.id;
    const favorites = loadFavorites();

    if (!favorites[userId]) favorites[userId] = [];

    if (favorites[userId].length >= MAX_FAVORITES) {
        return message.reply(`❌ Ya tienes el máximo de **${MAX_FAVORITES}** favoritos. Elimina alguno con \`!favdel <número>\`.`);
    }

    const alreadyExists = favorites[userId].some(f => f.pageUrl === track.uri);
    if (alreadyExists) return message.reply("⚠️ Esta canción ya está en tus favoritos.");

    favorites[userId].push({
        title: track.title,
        pageUrl: track.uri,
        searchQuery: `${track.title} ${track.author || ""}`.trim(),
    });
    saveFavorites(favorites);

    return message.channel.send({
        embeds: [new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle("⭐ Añadida a favoritos")
            .setDescription(`**${track.title}** se guardó en tus favoritos.\nTienes **${favorites[userId].length}/${MAX_FAVORITES}** favoritos.`)
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
        const player = lavashark.getPlayer(message.guild.id);
        if (!player || !player.current) {
            return message.reply("❌ No hay nada reproduciéndose. Usa `!lyrics <nombre de canción>` para buscar letras.");
        }
        searchTitle = player.current.title;
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

        const chunks = [];
        const maxLen = 4000;
        let remaining = lyrics;
        while (remaining.length > 0) {
            if (remaining.length <= maxLen) {
                chunks.push(remaining);
                break;
            }
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
    initLavaShark,
    handlePlay, handleSkip, handleStop, handleQueue, handlePause, handleResume, handleNowPlaying,
    handleFilter, handleFav, handleFavList, handleFavPlay, handleFavDel, handleLyrics,
};

const { PresenceUpdateStatus } = require("discord.js");

// ─── Configuración de canales de estadísticas ───
const STATS_CHANNELS = {
    totalMembers: "",    // ID del canal de voz — "📊 Miembros: {count}"
    onlineMembers: "",   // ID del canal de voz — "🟢 En línea: {count}"
    ticketCount: "",     // ID del canal de voz — "🎫 Tickets: {count}"
};

/**
 * Actualiza todos los canales de estadísticas del servidor.
 * @param {import("discord.js").Guild} guild
 */
async function updateStats(guild) {
    try {
        // Asegurar que los miembros y presencias estén cacheados
        await guild.members.fetch({ withPresences: true });
    } catch (err) {
        console.error(`[ServerStats] Error al obtener miembros de ${guild.name}:`, err.message);
        return;
    }

    // ── Total de miembros ──
    if (STATS_CHANNELS.totalMembers) {
        const newName = `📊 Miembros: ${guild.memberCount}`;
        await safeRename(guild, STATS_CHANNELS.totalMembers, newName);
    }

    // ── Miembros en línea ──
    if (STATS_CHANNELS.onlineMembers) {
        const onlineCount = guild.members.cache.filter(
            (m) => m.presence && m.presence.status !== PresenceUpdateStatus.Offline && m.presence.status !== "offline"
        ).size;
        const newName = `🟢 En línea: ${onlineCount}`;
        await safeRename(guild, STATS_CHANNELS.onlineMembers, newName);
    }

    // ── Conteo de tickets ──
    if (STATS_CHANNELS.ticketCount) {
        const tickets = guild.channels.cache.filter(
            (ch) => ch.name && ch.name.startsWith("ticket-")
        ).size;
        const newName = `🎫 Tickets: ${tickets}`;
        await safeRename(guild, STATS_CHANNELS.ticketCount, newName);
    }
}

/**
 * Renombra un canal de voz solo si el nombre cambió. Maneja rate limits.
 * @param {import("discord.js").Guild} guild
 * @param {string} channelId
 * @param {string} newName
 */
async function safeRename(guild, channelId, newName) {
    try {
        const channel = guild.channels.cache.get(channelId);
        if (!channel) return;

        // Solo actualizar si el nombre realmente cambió
        if (channel.name === newName) return;

        await channel.setName(newName);
    } catch (err) {
        // Manejar rate limits y otros errores sin romper el bot
        console.error(`[ServerStats] Error al renombrar canal ${channelId}:`, err.message);
    }
}

/**
 * Inicia un intervalo de 5 minutos para actualizar las estadísticas de todos los servidores.
 * @param {import("discord.js").Client} client
 */
function setupStatsInterval(client) {
    // Actualizar al iniciar
    client.guilds.cache.forEach((guild) => {
        updateStats(guild).catch((err) =>
            console.error(`[ServerStats] Error inicial en ${guild.name}:`, err.message)
        );
    });

    // Actualizar cada 5 minutos (300000 ms)
    setInterval(() => {
        client.guilds.cache.forEach((guild) => {
            updateStats(guild).catch((err) =>
                console.error(`[ServerStats] Error en intervalo para ${guild.name}:`, err.message)
            );
        });
    }, 5 * 60 * 1000);

    console.log("[ServerStats] Intervalo de estadísticas iniciado (cada 5 minutos).");
}

module.exports = { updateStats, setupStatsInterval };

const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { sendLog, createLogEmbed, LogColors, formatDate } = require("./logger");
const config = require("../../config.json");

const SLOWMODE_CONFIG = {
    messageThreshold: 15,    // mensajes en la ventana para activar
    timeWindow: 10_000,      // 10 segundos
    slowmodeDuration: 10,    // segundos de slowmode a aplicar
    cooldownDuration: 60_000, // 1 minuto antes de volver a comprobar
    maxSlowmode: 30,         // máximo de slowmode en segundos (escalado)
};

// Map<channelId, { timestamps: number[], currentSlowmode: number, lastTriggered: number, timeout: NodeJS.Timeout | null, manuallySet: boolean }>
const channelData = new Map();

function getChannelData(channelId) {
    if (!channelData.has(channelId)) {
        channelData.set(channelId, {
            timestamps: [],
            currentSlowmode: 0,
            lastTriggered: 0,
            timeout: null,
            manuallySet: false,
        });
    }
    return channelData.get(channelId);
}

/**
 * Limpia timestamps antiguos fuera de la ventana de tiempo.
 */
function pruneTimestamps(data) {
    const now = Date.now();
    data.timestamps = data.timestamps.filter(
        (ts) => now - ts < SLOWMODE_CONFIG.timeWindow
    );
}

/**
 * Envía una notificación temporal al canal indicando la activación del slowmode.
 */
async function sendSlowmodeNotification(channel, seconds) {
    try {
        const embed = new EmbedBuilder()
            .setColor(0xa62f37)
            .setDescription(`🐌 Slowmode activado automáticamente (**${seconds}s**)`)
            .setTimestamp();

        const msg = await channel.send({ embeds: [embed] });
        setTimeout(() => msg.delete().catch(() => {}), 10_000);
    } catch {
        // Sin permisos para enviar mensajes, ignorar
    }
}

/**
 * Envía un log al canal de logs del servidor.
 */
async function logSlowmodeAction(guild, channel, seconds, action) {
    const title =
        action === "activate"
            ? "🐌 Slowmode Automático Activado"
            : action === "escalate"
                ? "⚡ Slowmode Automático Escalado"
                : "✅ Slowmode Automático Desactivado";

    const description =
        action === "remove"
            ? `El canal ${channel} ha vuelto a la normalidad tras un periodo de calma.`
            : `Se ha aplicado slowmode de **${seconds}s** en ${channel} debido a alta actividad.`;

    const embed = createLogEmbed({
        title,
        color: 0xa62f37,
        description,
        fields: [
            { name: "Canal", value: `${channel} (\`${channel.id}\`)`, inline: true },
            { name: "Duración", value: action === "remove" ? "Removido" : `${seconds} segundos`, inline: true },
            { name: "Fecha", value: formatDate(), inline: true },
        ],
        footer: "Smart Slowmode",
    });

    await sendLog(guild, embed);
}

/**
 * Programa la eliminación del slowmode tras el cooldown si no hay más actividad.
 */
function scheduleCooldownRemoval(channel, data) {
    // Limpiar timeout previo si existe
    if (data.timeout) {
        clearTimeout(data.timeout);
        data.timeout = null;
    }

    data.timeout = setTimeout(async () => {
        try {
            // Solo remover si el slowmode actual fue puesto por el bot
            if (data.currentSlowmode > 0 && !data.manuallySet) {
                await channel.setRateLimitPerUser(0, "Slowmode automático removido — canal en calma");
                await logSlowmodeAction(channel.guild, channel, 0, "remove");
                data.currentSlowmode = 0;
                data.lastTriggered = 0;
            }
        } catch {
            // Sin permisos o canal eliminado
        }
    }, SLOWMODE_CONFIG.cooldownDuration);
}

/**
 * Función principal: se llama en cada mensaje para evaluar la actividad del canal.
 * @param {import("discord.js").Message} message
 */
async function checkSlowmode(message) {
    // Ignorar mensajes de bots
    if (message.author.bot) return;

    // Ignorar DMs
    if (!message.guild) return;

    // Ignorar miembros del staff
    if (
        config.staffRoleId &&
        message.member &&
        message.member.roles.cache.has(config.staffRoleId)
    ) {
        return;
    }

    const channel = message.channel;

    // Verificar que el bot tenga permisos para gestionar el canal
    const botMember = message.guild.members.me;
    if (!botMember || !channel.permissionsFor(botMember).has(PermissionFlagsBits.ManageChannels)) {
        return;
    }

    // Si el canal ya tiene slowmode manual (no puesto por el bot), ignorar
    if (channel.rateLimitPerUser > 0) {
        const data = getChannelData(channel.id);
        if (data.currentSlowmode === 0) {
            // Slowmode puesto manualmente, no interferir
            data.manuallySet = true;
            return;
        }
    }

    const data = getChannelData(channel.id);

    // Resetear flag de manual si el slowmode fue quitado manualmente
    if (channel.rateLimitPerUser === 0 && data.manuallySet) {
        data.manuallySet = false;
    }

    if (data.manuallySet) return;

    // Registrar timestamp del mensaje
    data.timestamps.push(Date.now());
    pruneTimestamps(data);

    // Comprobar si se supera el umbral
    if (data.timestamps.length < SLOWMODE_CONFIG.messageThreshold) {
        // No hay suficiente actividad; si hay slowmode activo, reprogramar cooldown
        if (data.currentSlowmode > 0) {
            scheduleCooldownRemoval(channel, data);
        }
        return;
    }

    const now = Date.now();

    // Determinar duración del slowmode (con escalado)
    let newSlowmode;
    if (data.currentSlowmode > 0 && now - data.lastTriggered < SLOWMODE_CONFIG.cooldownDuration) {
        // Escalar: duplicar duración sin exceder el máximo
        newSlowmode = Math.min(data.currentSlowmode * 2, SLOWMODE_CONFIG.maxSlowmode);
    } else {
        newSlowmode = SLOWMODE_CONFIG.slowmodeDuration;
    }

    // Si ya está al mismo nivel o superior, no reaplicar
    if (data.currentSlowmode >= newSlowmode) {
        // Reprogramar remoción
        scheduleCooldownRemoval(channel, data);
        return;
    }

    try {
        await channel.setRateLimitPerUser(
            newSlowmode,
            `Slowmode automático — alta actividad detectada (${data.timestamps.length} msgs/${SLOWMODE_CONFIG.timeWindow / 1000}s)`
        );

        const action = data.currentSlowmode > 0 ? "escalate" : "activate";
        data.currentSlowmode = newSlowmode;
        data.lastTriggered = now;

        // Limpiar timestamps para evitar re-trigger inmediato
        data.timestamps = [];

        await sendSlowmodeNotification(channel, newSlowmode);
        await logSlowmodeAction(message.guild, channel, newSlowmode, action);

        // Programar remoción tras cooldown
        scheduleCooldownRemoval(channel, data);
    } catch (error) {
        console.error("[SmartSlowmode] Error al aplicar slowmode:", error.message);
    }
}

module.exports = { checkSlowmode };

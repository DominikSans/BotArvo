const { EmbedBuilder } = require("discord.js");
const config = require("../../config.json");

const LogColors = {
    MESSAGE_DELETE: 0xed4245,
    MESSAGE_EDIT: 0xfee75c,
    MESSAGE_BULK: 0xe74c3c,
    MODERATION: 0xe67e22,
    MEMBER_JOIN: 0x57f287,
    MEMBER_LEAVE: 0xed4245,
    MEMBER_UPDATE: 0x5865f2,
    BAN_ADD: 0xff0000,
    BAN_REMOVE: 0x2ecc71,
    WARN: 0xf1c40f,
    MUTE: 0xe67e22,
    ANTI_SPAM: 0xff6b6b,
    ANTI_RAID: 0xff0050,
    CHANNEL_CREATE: 0x2ecc71,
    CHANNEL_DELETE: 0xe74c3c,
    CHANNEL_UPDATE: 0xf39c12,
    ROLE_CREATE: 0x2ecc71,
    ROLE_DELETE: 0xe74c3c,
    ROLE_UPDATE: 0xf39c12,
    VOICE_JOIN: 0x3498db,
    VOICE_LEAVE: 0x95a5a6,
    VOICE_MOVE: 0x9b59b6,
    SERVER_UPDATE: 0x5865f2,
    WELCOME: 0x57f287,
    GOODBYE: 0x747f8d,
};

function formatDate(date = new Date()) {
    return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
}

function formatRelative(date = new Date()) {
    return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

async function sendLog(guild, embed, type = "server") {
    const logChannelId = type === "message"
        ? config.messageLogChannelId
        : config.logChannelId;

    if (!logChannelId) return;

    try {
        const channel = guild.channels.cache.get(logChannelId)
            || await guild.channels.fetch(logChannelId).catch(() => null);

        if (!channel) {
            console.warn(`[Logger] Canal de logs no encontrado: ${logChannelId}`);
            return;
        }

        await channel.send({ embeds: [embed] });
    } catch (error) {
        console.error("[Logger] Error al enviar log:", error.message);
    }
}

/**
 * Crea un embed estilizado con fields inline para aprovechar el ancho.
 */
function createLogEmbed({ title, color, fields, thumbnail, footer, description, author, image }) {
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTimestamp();

    if (author) embed.setAuthor(author);
    if (title) embed.setTitle(title);
    if (description) embed.setDescription(description);
    if (thumbnail) embed.setThumbnail(thumbnail);
    if (image) embed.setImage(image);

    if (footer) {
        embed.setFooter({
            text: typeof footer === "string" ? footer : footer.text,
            iconURL: typeof footer === "object" ? footer.iconURL : undefined,
        });
    }

    if (fields && fields.length > 0) {
        embed.addFields(fields);
    }

    return embed;
}

function truncate(text, maxLength = 1024) {
    if (!text) return "*Sin contenido*";
    return text.length > maxLength ? text.substring(0, maxLength - 3) + "..." : text;
}

module.exports = {
    LogColors,
    formatDate,
    formatRelative,
    sendLog,
    createLogEmbed,
    truncate,
};

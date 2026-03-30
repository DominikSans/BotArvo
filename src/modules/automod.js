const { LogColors, sendLog, createLogEmbed, formatDate } = require("./logger");

const AUTOMOD_CONFIG = {
    blockInvites: true,
    blockLinks: true,
    linkWhitelist: ["youtube.com", "imgur.com", "tenor.com", "github.com"],
    maxUserMentions: 5,
    maxRoleMentions: 3,
    blockCaps: true,
    capsThreshold: 0.7,
    capsMinLength: 10,
};

const INVITE_REGEX = /discord(?:\.gg|\.com\/invite|app\.com\/invite)\/[a-zA-Z0-9-]+/i;
const URL_REGEX = /https?:\/\/[^\s]+|www\.[^\s]+/gi;

function extractDomain(url) {
    try {
        const cleaned = url.replace(/^(https?:\/\/)?(www\.)?/, "");
        return cleaned.split(/[/?#]/)[0].toLowerCase();
    } catch {
        return "";
    }
}

function isWhitelisted(url) {
    const domain = extractDomain(url);
    return AUTOMOD_CONFIG.linkWhitelist.some(w => domain === w || domain.endsWith(`.${w}`));
}

function detectInvites(content) {
    return AUTOMOD_CONFIG.blockInvites && INVITE_REGEX.test(content);
}

function detectLinks(content) {
    if (!AUTOMOD_CONFIG.blockLinks) return false;
    const urls = content.match(URL_REGEX);
    if (!urls) return false;
    return urls.some(url => !isWhitelisted(url));
}

function detectMassMentions(message) {
    const userMentions = message.mentions.users.size;
    const roleMentions = message.mentions.roles.size;
    return userMentions >= AUTOMOD_CONFIG.maxUserMentions || roleMentions >= AUTOMOD_CONFIG.maxRoleMentions;
}

function detectCaps(content) {
    if (!AUTOMOD_CONFIG.blockCaps) return false;
    const letters = content.replace(/[^a-zA-ZÁÉÍÓÚÑáéíóúñ]/g, "");
    if (letters.length < AUTOMOD_CONFIG.capsMinLength) return false;
    const upper = letters.replace(/[^A-ZÁÉÍÓÚÑ]/g, "").length;
    return (upper / letters.length) >= AUTOMOD_CONFIG.capsThreshold;
}

async function checkAutomod(message) {
    if (message.author.bot || !message.guild) return false;
    if (message.member?.permissions.has("ManageMessages")) return false;

    const content = message.content;
    let reason = null;

    if (detectInvites(content)) {
        reason = "Envío de invitaciones de Discord no permitidas";
    } else if (detectLinks(content)) {
        reason = "Envío de enlaces externos no permitidos";
    } else if (detectMassMentions(message)) {
        reason = "Menciones masivas de usuarios o roles";
    } else if (detectCaps(content)) {
        reason = "Uso excesivo de mayúsculas";
    }

    if (!reason) return false;

    try {
        await message.delete().catch(() => {});

        const warning = await message.channel.send({
            embeds: [createLogEmbed({
                author: { name: "Auto-Moderación" },
                color: LogColors.ANTI_SPAM,
                description: `${message.author}, tu mensaje fue eliminado: **${reason}**.`,
                footer: "Sistema de Moderación Automática",
            })],
        });

        setTimeout(() => warning.delete().catch(() => {}), 5000);

        const logEmbed = createLogEmbed({
            author: {
                name: "Auto-Moderación — Mensaje Eliminado",
                iconURL: message.author.displayAvatarURL({ dynamic: true }),
            },
            color: LogColors.ANTI_SPAM,
            fields: [
                { name: "👤 Usuario", value: `${message.author} \`${message.author.tag}\``, inline: true },
                { name: "📺 Canal", value: `${message.channel}`, inline: true },
                { name: "📋 Razón", value: reason, inline: true },
                { name: "💬 Contenido", value: content.length > 1024 ? content.substring(0, 1021) + "..." : content || "*Sin contenido*", inline: false },
                { name: "🆔 ID", value: `\`${message.author.id}\``, inline: true },
                { name: "📅 Fecha", value: formatDate(), inline: true },
            ],
            thumbnail: message.author.displayAvatarURL({ dynamic: true, size: 128 }),
            footer: "Registro de Moderación",
        });

        await sendLog(message.guild, logEmbed, "message");
    } catch (error) {
        console.error("[AutoMod] Error:", error.message);
    }

    return true;
}

module.exports = { checkAutomod, AUTOMOD_CONFIG };

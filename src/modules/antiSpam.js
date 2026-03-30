const { LogColors, sendLog, createLogEmbed, formatDate } = require("./logger");

const SPAM_CONFIG = {
    maxMessages: 5,
    timeWindow: 4000,
    muteDuration: 60_000,
    warnBeforeMute: true,
    duplicateThreshold: 3,
    duplicateWindow: 10_000,
};

const messageCache = new Map();
const warnedUsers = new Set();

async function checkSpam(message) {
    if (message.author.bot || !message.guild) return false;
    if (message.member?.permissions.has("ManageMessages")) return false;

    const userId = message.author.id;
    const now = Date.now();

    if (!messageCache.has(userId)) {
        messageCache.set(userId, { timestamps: [], contents: [] });
    }

    const userData = messageCache.get(userId);
    userData.timestamps.push(now);
    userData.contents.push(message.content.toLowerCase().trim());
    userData.timestamps = userData.timestamps.filter(t => now - t < SPAM_CONFIG.timeWindow);
    userData.contents = userData.contents.slice(-SPAM_CONFIG.maxMessages - 1);

    // Flood
    if (userData.timestamps.length >= SPAM_CONFIG.maxMessages) {
        await handleSpam(message, "Flood de mensajes");
        messageCache.delete(userId);
        return true;
    }

    // Duplicados
    const recent = userData.contents.slice(-SPAM_CONFIG.duplicateThreshold);
    if (
        recent.length >= SPAM_CONFIG.duplicateThreshold &&
        recent.every(c => c === recent[0]) &&
        recent[0].length > 0
    ) {
        await handleSpam(message, "Mensajes duplicados");
        messageCache.delete(userId);
        return true;
    }

    return false;
}

async function handleSpam(message, reason) {
    const member = message.member;
    const userId = message.author.id;

    try {
        const messages = await message.channel.messages.fetch({ limit: 10 });
        const userMessages = messages.filter(m => m.author.id === userId);
        await message.channel.bulkDelete(userMessages).catch(() => {});

        if (warnedUsers.has(userId) || !SPAM_CONFIG.warnBeforeMute) {
            await member.timeout(SPAM_CONFIG.muteDuration, `Anti-Spam: ${reason}`).catch(() => {});
            warnedUsers.delete(userId);

            try {
                await message.author.send({
                    embeds: [createLogEmbed({
                        author: { name: "Has sido silenciado" },
                        color: LogColors.MUTE,
                        fields: [
                            { name: "📺 Servidor", value: `\`${message.guild.name}\``, inline: true },
                            { name: "⏱️ Duración", value: `\`${SPAM_CONFIG.muteDuration / 1000}s\``, inline: true },
                            { name: "📋 Razón", value: reason, inline: true },
                        ],
                        footer: "Sistema de Moderación Automática",
                    })],
                });
            } catch {}

            const embed = createLogEmbed({
                author: {
                    name: "Anti-Spam — Usuario Silenciado",
                    iconURL: message.author.displayAvatarURL({ dynamic: true }),
                },
                color: LogColors.ANTI_SPAM,
                fields: [
                    { name: "👤 Usuario", value: `${message.author} \`${message.author.tag}\``, inline: true },
                    { name: "📺 Canal", value: `${message.channel}`, inline: true },
                    { name: "⏱️ Duración", value: `\`${SPAM_CONFIG.muteDuration / 1000}s\``, inline: true },
                    { name: "📋 Razón", value: reason, inline: true },
                    { name: "🆔 ID", value: `\`${message.author.id}\``, inline: true },
                    { name: "📅 Fecha", value: formatDate(), inline: true },
                ],
                thumbnail: message.author.displayAvatarURL({ dynamic: true, size: 128 }),
                footer: `Registro de Moderación`,
            });

            await sendLog(message.guild, embed, "message");
        } else {
            warnedUsers.add(userId);
            setTimeout(() => warnedUsers.delete(userId), 30_000);

            const warning = await message.channel.send({
                embeds: [createLogEmbed({
                    author: { name: "Advertencia de Spam" },
                    color: LogColors.WARN,
                    description: `${message.author}, estás enviando mensajes demasiado rápido. **Reduce la velocidad o serás silenciado.**`,
                    footer: "Sistema de Moderación Automática",
                })],
            });

            setTimeout(() => warning.delete().catch(() => {}), 5000);
        }
    } catch (error) {
        console.error("[Anti-Spam] Error:", error.message);
    }
}

setInterval(() => {
    const now = Date.now();
    for (const [userId, data] of messageCache.entries()) {
        data.timestamps = data.timestamps.filter(t => now - t < SPAM_CONFIG.timeWindow * 2);
        if (data.timestamps.length === 0) messageCache.delete(userId);
    }
}, 30_000);

module.exports = { checkSpam, SPAM_CONFIG };

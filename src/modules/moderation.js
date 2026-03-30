const { allBannedWords } = require("../data/bannedWords");
const { LogColors, sendLog, createLogEmbed, formatDate } = require("./logger");

function normalizeText(text) {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[1!|]/g, "i")
        .replace(/[3€]/g, "e")
        .replace(/[4@]/g, "a")
        .replace(/[0°]/g, "o")
        .replace(/[5$]/g, "s")
        .replace(/[7]/g, "t")
        .replace(/[8]/g, "b")
        .replace(/\*/g, "")
        .replace(/[_\-\.]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function checkMessage(content) {
    const normalized = normalizeText(content);
    const foundWords = [];

    for (const word of allBannedWords) {
        const normalizedWord = normalizeText(word);
        const regex = new RegExp(`\\b${escapeRegex(normalizedWord)}\\b`, "gi");
        if (regex.test(normalized)) {
            foundWords.push(word);
        }
    }

    return { flagged: foundWords.length > 0, words: foundWords };
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function processMessage(message) {
    if (message.author.bot || !message.guild) return false;

    const result = checkMessage(message.content);

    if (result.flagged) {
        try {
            const content = message.content;
            const author = message.author;
            const channel = message.channel;

            await message.delete();

            // DM
            try {
                await author.send({
                    embeds: [createLogEmbed({
                        author: { name: "Mensaje Eliminado" },
                        color: LogColors.MODERATION,
                        fields: [
                            { name: "📺 Servidor", value: `\`${message.guild.name}\``, inline: true },
                            { name: "📺 Canal", value: `\`#${channel.name}\``, inline: true },
                            { name: "📅 Fecha", value: formatDate(), inline: true },
                        ],
                        description: "Tu mensaje fue eliminado por contener **lenguaje inapropiado**.",
                        footer: "Sistema de Moderación Automática",
                    })],
                });
            } catch {}

            // Log
            const embed = createLogEmbed({
                author: {
                    name: "AutoMod — Mensaje Filtrado",
                    iconURL: author.displayAvatarURL({ dynamic: true }),
                },
                color: LogColors.MODERATION,
                fields: [
                    { name: "👤 Usuario", value: `${author} \`${author.tag}\``, inline: true },
                    { name: "📺 Canal", value: `${channel}`, inline: true },
                    { name: "🆔 ID", value: `\`${author.id}\``, inline: true },
                    { name: "💬 Mensaje", value: `\`\`\`${content.substring(0, 900)}\`\`\``, inline: false },
                    { name: "🚫 Detectadas", value: `\`${result.words.join("`, `")}\``, inline: true },
                    { name: "📅 Fecha", value: formatDate(), inline: true },
                ],
                thumbnail: author.displayAvatarURL({ dynamic: true, size: 128 }),
                footer: `Registro de Moderación`,
            });

            await sendLog(message.guild, embed, "message");
            return true;
        } catch (error) {
            console.error("[Moderation] Error:", error.message);
        }
    }

    return false;
}

module.exports = { normalizeText, checkMessage, processMessage };

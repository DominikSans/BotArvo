const { LogColors, sendLog, createLogEmbed, formatDate } = require("../modules/logger");

module.exports = {
    name: "voiceStateUpdate",
    once: false,
    async execute(oldState, newState) {
        const member = newState.member || oldState.member;
        if (!member || member.user.bot) return;

        // Se unió a voz
        if (!oldState.channelId && newState.channelId) {
            const embed = createLogEmbed({
                author: {
                    name: "Conectó a Voz",
                    iconURL: member.user.displayAvatarURL({ dynamic: true }),
                },
                color: LogColors.VOICE_JOIN,
                fields: [
                    { name: "👤 Usuario", value: `${member} \`${member.user.tag}\``, inline: true },
                    { name: "🔊 Canal", value: `${newState.channel}`, inline: true },
                    { name: "📅 Fecha", value: formatDate(), inline: true },
                ],
                thumbnail: member.user.displayAvatarURL({ dynamic: true, size: 128 }),
                footer: `Registro de Moderación`,
            });
            return sendLog(member.guild, embed);
        }

        // Salió de voz
        if (oldState.channelId && !newState.channelId) {
            const embed = createLogEmbed({
                author: {
                    name: "Desconectó de Voz",
                    iconURL: member.user.displayAvatarURL({ dynamic: true }),
                },
                color: LogColors.VOICE_LEAVE,
                fields: [
                    { name: "👤 Usuario", value: `${member} \`${member.user.tag}\``, inline: true },
                    { name: "🔇 Canal", value: `\`${oldState.channel.name}\``, inline: true },
                    { name: "📅 Fecha", value: formatDate(), inline: true },
                ],
                thumbnail: member.user.displayAvatarURL({ dynamic: true, size: 128 }),
                footer: `Registro de Moderación`,
            });
            return sendLog(member.guild, embed);
        }

        // Cambió de canal
        if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
            const embed = createLogEmbed({
                author: {
                    name: "Cambió de Canal de Voz",
                    iconURL: member.user.displayAvatarURL({ dynamic: true }),
                },
                color: LogColors.VOICE_MOVE,
                fields: [
                    { name: "👤 Usuario", value: `${member} \`${member.user.tag}\``, inline: true },
                    { name: "📅 Fecha", value: formatDate(), inline: true },
                    { name: "\u200b", value: "\u200b", inline: true },
                    { name: "🔇 Antes", value: `\`${oldState.channel.name}\``, inline: true },
                    { name: "🔊 Después", value: `${newState.channel}`, inline: true },
                ],
                thumbnail: member.user.displayAvatarURL({ dynamic: true, size: 128 }),
                footer: `Registro de Moderación`,
            });
            return sendLog(member.guild, embed);
        }
    },
};

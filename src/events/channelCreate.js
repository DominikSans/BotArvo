const { ChannelType } = require("discord.js");
const { LogColors, sendLog, createLogEmbed, formatDate } = require("../modules/logger");

const channelTypes = {
    [ChannelType.GuildText]: "📝 Texto",
    [ChannelType.GuildVoice]: "🔊 Voz",
    [ChannelType.GuildCategory]: "📁 Categoría",
    [ChannelType.GuildAnnouncement]: "📢 Anuncios",
    [ChannelType.GuildStageVoice]: "🎤 Stage",
    [ChannelType.GuildForum]: "💬 Foro",
};

module.exports = {
    name: "channelCreate",
    once: false,
    async execute(channel) {
        if (!channel.guild) return;

        const embed = createLogEmbed({
            author: { name: "Canal Creado" },
            color: LogColors.CHANNEL_CREATE,
            fields: [
                { name: "📺 Canal", value: `${channel} \`${channel.name}\``, inline: true },
                { name: "📋 Tipo", value: channelTypes[channel.type] || "Desconocido", inline: true },
                { name: "📁 Categoría", value: `\`${channel.parent?.name || "Ninguna"}\``, inline: true },
                { name: "🆔 ID", value: `\`${channel.id}\``, inline: true },
                { name: "📅 Fecha", value: formatDate(), inline: true },
            ],
            footer: `Registro de Moderación`,
        });

        await sendLog(channel.guild, embed);
    },
};

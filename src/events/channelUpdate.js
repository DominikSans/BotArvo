const { LogColors, sendLog, createLogEmbed, formatDate } = require("../modules/logger");

module.exports = {
    name: "channelUpdate",
    once: false,
    async execute(oldChannel, newChannel) {
        if (!newChannel.guild) return;

        const fields = [
            { name: "📺 Canal", value: `${newChannel} \`${newChannel.name}\``, inline: true },
            { name: "🆔 ID", value: `\`${newChannel.id}\``, inline: true },
            { name: "📅 Fecha", value: formatDate(), inline: true },
        ];

        if (oldChannel.name !== newChannel.name)
            fields.push({ name: "📝 Nombre", value: `\`${oldChannel.name}\` → \`${newChannel.name}\``, inline: true });
        if (oldChannel.topic !== newChannel.topic)
            fields.push({ name: "📋 Tema", value: `\`${oldChannel.topic || "Ninguno"}\` → \`${newChannel.topic || "Ninguno"}\``, inline: false });
        if (oldChannel.nsfw !== newChannel.nsfw)
            fields.push({ name: "🔞 NSFW", value: `\`${oldChannel.nsfw}\` → \`${newChannel.nsfw}\``, inline: true });
        if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser)
            fields.push({ name: "⏱️ Slowmode", value: `\`${oldChannel.rateLimitPerUser}s\` → \`${newChannel.rateLimitPerUser}s\``, inline: true });
        if (oldChannel.parentId !== newChannel.parentId)
            fields.push({ name: "📁 Categoría", value: `\`${oldChannel.parent?.name || "Ninguna"}\` → \`${newChannel.parent?.name || "Ninguna"}\``, inline: true });

        // Si solo tiene los 3 campos base, no hubo cambios relevantes
        if (fields.length <= 3) return;

        const embed = createLogEmbed({
            author: { name: "Canal Actualizado" },
            color: LogColors.CHANNEL_UPDATE,
            fields,
            footer: `Registro de Moderación`,
        });

        await sendLog(newChannel.guild, embed);
    },
};

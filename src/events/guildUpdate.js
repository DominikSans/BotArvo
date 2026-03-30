const { LogColors, sendLog, createLogEmbed, formatDate } = require("../modules/logger");

module.exports = {
    name: "guildUpdate",
    once: false,
    async execute(oldGuild, newGuild) {
        const fields = [
            { name: "🏠 Servidor", value: `\`${newGuild.name}\``, inline: true },
            { name: "🆔 ID", value: `\`${newGuild.id}\``, inline: true },
            { name: "📅 Fecha", value: formatDate(), inline: true },
        ];

        if (oldGuild.name !== newGuild.name)
            fields.push({ name: "📝 Nombre", value: `\`${oldGuild.name}\` → \`${newGuild.name}\``, inline: false });
        if (oldGuild.iconURL() !== newGuild.iconURL())
            fields.push({ name: "🖼️ Ícono", value: "Cambiado", inline: true });
        if (oldGuild.bannerURL() !== newGuild.bannerURL())
            fields.push({ name: "🖼️ Banner", value: "Cambiado", inline: true });
        if (oldGuild.verificationLevel !== newGuild.verificationLevel)
            fields.push({ name: "🔒 Verificación", value: `\`${oldGuild.verificationLevel}\` → \`${newGuild.verificationLevel}\``, inline: true });
        if (oldGuild.afkChannelId !== newGuild.afkChannelId)
            fields.push({ name: "💤 Canal AFK", value: `\`${oldGuild.afkChannel?.name || "Ninguno"}\` → \`${newGuild.afkChannel?.name || "Ninguno"}\``, inline: true });
        if (oldGuild.systemChannelId !== newGuild.systemChannelId)
            fields.push({ name: "⚙️ Canal Sistema", value: "Cambiado", inline: true });

        if (fields.length <= 3) return;

        const embed = createLogEmbed({
            author: { name: "Servidor Actualizado" },
            color: LogColors.SERVER_UPDATE,
            fields,
            thumbnail: newGuild.iconURL({ dynamic: true }),
            footer: `Registro de Moderación`,
        });

        await sendLog(newGuild, embed);
    },
};

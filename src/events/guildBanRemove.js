const { LogColors, sendLog, createLogEmbed, formatDate } = require("../modules/logger");

module.exports = {
    name: "guildBanRemove",
    once: false,
    async execute(ban) {
        const embed = createLogEmbed({
            author: {
                name: "Usuario Desbaneado",
                iconURL: ban.user.displayAvatarURL({ dynamic: true }),
            },
            color: LogColors.BAN_REMOVE,
            fields: [
                { name: "👤 Usuario", value: `${ban.user} \`${ban.user.tag}\``, inline: true },
                { name: "🆔 ID", value: `\`${ban.user.id}\``, inline: true },
                { name: "📅 Fecha", value: formatDate(), inline: true },
            ],
            thumbnail: ban.user.displayAvatarURL({ dynamic: true, size: 128 }),
            footer: `Registro de Moderación`,
        });

        await sendLog(ban.guild, embed);
    },
};

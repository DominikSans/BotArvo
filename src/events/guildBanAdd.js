const { LogColors, sendLog, createLogEmbed, formatDate } = require("../modules/logger");

module.exports = {
    name: "guildBanAdd",
    once: false,
    async execute(ban) {
        let reason = "*Sin razón proporcionada*";
        try {
            const fetched = await ban.guild.bans.fetch(ban.user.id);
            if (fetched.reason) reason = fetched.reason;
        } catch {}

        const embed = createLogEmbed({
            author: {
                name: "Usuario Baneado",
                iconURL: ban.user.displayAvatarURL({ dynamic: true }),
            },
            color: LogColors.BAN_ADD,
            fields: [
                { name: "👤 Usuario", value: `${ban.user} \`${ban.user.tag}\``, inline: true },
                { name: "🆔 ID", value: `\`${ban.user.id}\``, inline: true },
                { name: "📅 Fecha", value: formatDate(), inline: true },
                { name: "📋 Razón", value: reason, inline: false },
            ],
            thumbnail: ban.user.displayAvatarURL({ dynamic: true, size: 128 }),
            footer: `Registro de Moderación`,
        });

        await sendLog(ban.guild, embed);
    },
};

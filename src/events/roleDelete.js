const { LogColors, sendLog, createLogEmbed, formatDate } = require("../modules/logger");

module.exports = {
    name: "roleDelete",
    once: false,
    async execute(role) {
        const embed = createLogEmbed({
            author: { name: "Rol Eliminado" },
            color: LogColors.ROLE_DELETE,
            fields: [
                { name: "🎭 Rol", value: `\`${role.name}\``, inline: true },
                { name: "🎨 Color", value: `\`${role.hexColor}\``, inline: true },
                { name: "🆔 ID", value: `\`${role.id}\``, inline: true },
                { name: "👥 Afectados", value: `\`${role.members.size}\``, inline: true },
                { name: "📅 Fecha", value: formatDate(), inline: true },
            ],
            footer: `Registro de Moderación`,
        });

        await sendLog(role.guild, embed);
    },
};

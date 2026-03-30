const { LogColors, sendLog, createLogEmbed, formatDate } = require("../modules/logger");

module.exports = {
    name: "roleCreate",
    once: false,
    async execute(role) {
        const embed = createLogEmbed({
            author: { name: "Rol Creado" },
            color: LogColors.ROLE_CREATE,
            fields: [
                { name: "🎭 Rol", value: `${role} \`${role.name}\``, inline: true },
                { name: "🎨 Color", value: `\`${role.hexColor}\``, inline: true },
                { name: "🆔 ID", value: `\`${role.id}\``, inline: true },
                { name: "📌 Separado", value: `\`${role.hoist ? "Sí" : "No"}\``, inline: true },
                { name: "💬 Mencionable", value: `\`${role.mentionable ? "Sí" : "No"}\``, inline: true },
                { name: "📅 Fecha", value: formatDate(), inline: true },
            ],
            footer: `Registro de Moderación`,
        });

        await sendLog(role.guild, embed);
    },
};

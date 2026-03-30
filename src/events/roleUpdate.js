const { LogColors, sendLog, createLogEmbed, formatDate } = require("../modules/logger");

module.exports = {
    name: "roleUpdate",
    once: false,
    async execute(oldRole, newRole) {
        const fields = [
            { name: "🎭 Rol", value: `${newRole} \`${newRole.name}\``, inline: true },
            { name: "🆔 ID", value: `\`${newRole.id}\``, inline: true },
            { name: "📅 Fecha", value: formatDate(), inline: true },
        ];

        if (oldRole.name !== newRole.name)
            fields.push({ name: "📝 Nombre", value: `\`${oldRole.name}\` → \`${newRole.name}\``, inline: true });
        if (oldRole.hexColor !== newRole.hexColor)
            fields.push({ name: "🎨 Color", value: `\`${oldRole.hexColor}\` → \`${newRole.hexColor}\``, inline: true });
        if (oldRole.hoist !== newRole.hoist)
            fields.push({ name: "📌 Separado", value: `\`${oldRole.hoist ? "Sí" : "No"}\` → \`${newRole.hoist ? "Sí" : "No"}\``, inline: true });
        if (oldRole.mentionable !== newRole.mentionable)
            fields.push({ name: "💬 Mencionable", value: `\`${oldRole.mentionable ? "Sí" : "No"}\` → \`${newRole.mentionable ? "Sí" : "No"}\``, inline: true });
        if (oldRole.permissions.bitfield !== newRole.permissions.bitfield)
            fields.push({ name: "🔐 Permisos", value: "Modificados", inline: true });

        if (fields.length <= 3) return;

        const embed = createLogEmbed({
            author: { name: "Rol Actualizado" },
            color: LogColors.ROLE_UPDATE,
            fields,
            footer: `Registro de Moderación`,
        });

        await sendLog(newRole.guild, embed);
    },
};

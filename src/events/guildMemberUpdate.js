const { LogColors, sendLog, createLogEmbed, formatDate } = require("../modules/logger");
const { logRoleChange } = require("../modules/auditLogs");

module.exports = {
    name: "guildMemberUpdate",
    once: false,
    async execute(oldMember, newMember) {
        // Cambio de apodo
        if (oldMember.nickname !== newMember.nickname) {
            const embed = createLogEmbed({
                author: {
                    name: "Apodo Cambiado",
                    iconURL: newMember.user.displayAvatarURL({ dynamic: true }),
                },
                color: LogColors.MEMBER_UPDATE,
                fields: [
                    { name: "👤 Usuario", value: `${newMember} \`${newMember.user.tag}\``, inline: true },
                    { name: "🆔 ID", value: `\`${newMember.id}\``, inline: true },
                    { name: "📅 Fecha", value: formatDate(), inline: true },
                    { name: "📝 Antes", value: `\`${oldMember.nickname || "Sin apodo"}\``, inline: true },
                    { name: "📝 Después", value: `\`${newMember.nickname || "Sin apodo"}\``, inline: true },
                ],
                thumbnail: newMember.user.displayAvatarURL({ dynamic: true, size: 128 }),
                footer: `Registro de Auditoría`,
            });
            await sendLog(newMember.guild, embed);
        }

        // Cambio de roles (audit logs mejorado — muestra quién hizo el cambio)
        await logRoleChange(oldMember, newMember);
    },
};

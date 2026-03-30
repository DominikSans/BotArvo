const { LogColors, sendLog, createLogEmbed, formatDate, formatRelative } = require("../modules/logger");
const { sendGoodbye } = require("../modules/welcome");

module.exports = {
    name: "guildMemberRemove",
    once: false,
    async execute(member) {
        await sendGoodbye(member);

        const roles = member.roles.cache
            .filter(r => r.id !== member.guild.id)
            .map(r => `${r}`)
            .join(", ") || "*Ninguno*";

        const joinedAt = member.joinedAt
            ? `${formatDate(member.joinedAt)} (${formatRelative(member.joinedAt)})`
            : "*Desconocido*";

        const embed = createLogEmbed({
            author: {
                name: "Miembro Salió",
                iconURL: member.user.displayAvatarURL({ dynamic: true }),
            },
            color: LogColors.MEMBER_LEAVE,
            fields: [
                { name: "👤 Usuario", value: `${member.user} \`${member.user.tag}\``, inline: true },
                { name: "🆔 ID", value: `\`${member.id}\``, inline: true },
                { name: "👥 Total", value: `\`${member.guild.memberCount}\``, inline: true },
                { name: "📅 Se unió", value: joinedAt, inline: false },
                { name: "🎭 Roles", value: roles.substring(0, 1024), inline: false },
                { name: "📅 Fecha", value: formatDate(), inline: true },
            ],
            thumbnail: member.user.displayAvatarURL({ dynamic: true, size: 256 }),
            footer: `Registro de Moderación`,
        });

        await sendLog(member.guild, embed);
    },
};

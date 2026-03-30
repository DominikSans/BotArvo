const { LogColors, sendLog, createLogEmbed, formatDate, formatRelative } = require("../modules/logger");
const { checkRaid } = require("../modules/antiRaid");
const { sendWelcome } = require("../modules/welcome");
const { checkBlacklist } = require("../modules/modAdvanced");
const config = require("../../config.json");

module.exports = {
    name: "guildMemberAdd",
    once: false,
    async execute(member) {
        await checkRaid(member);

        // Verificar blacklist antes de dar bienvenida
        const isBlacklisted = await checkBlacklist(member);
        if (isBlacklisted) return;

        await sendWelcome(member);

        const embed = createLogEmbed({
            author: {
                name: "Miembro Se Unió",
                iconURL: member.user.displayAvatarURL({ dynamic: true }),
            },
            color: LogColors.MEMBER_JOIN,
            fields: [
                { name: "👤 Usuario", value: `${member} \`${member.user.tag}\``, inline: true },
                { name: "🆔 ID", value: `\`${member.id}\``, inline: true },
                { name: "👥 Total", value: `\`${member.guild.memberCount}\``, inline: true },
                { name: "📅 Cuenta creada", value: `${formatDate(member.user.createdAt)} (${formatRelative(member.user.createdAt)})`, inline: false },
                { name: "📅 Fecha", value: formatDate(), inline: true },
            ],
            thumbnail: member.user.displayAvatarURL({ dynamic: true, size: 256 }),
            footer: `Miembro #${member.guild.memberCount}`,
        });

        await sendLog(member.guild, embed);
    },
};

const { LogColors, sendLog, createLogEmbed, formatDate } = require("./logger");

const RAID_CONFIG = {
    maxJoins: 8,
    timeWindow: 10_000,
    newAccountAge: 7,
    lockdownDuration: 60_000,
};

const recentJoins = [];
let raidMode = false;
let raidTimeout = null;

async function checkRaid(member) {
    const now = Date.now();

    recentJoins.push({ id: member.id, timestamp: now });
    while (recentJoins.length > 0 && now - recentJoins[0].timestamp > RAID_CONFIG.timeWindow) {
        recentJoins.shift();
    }

    // Cuenta nueva
    const accountAge = (now - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
    if (accountAge < RAID_CONFIG.newAccountAge) {
        const embed = createLogEmbed({
            author: {
                name: "Cuenta Nueva Detectada",
                iconURL: member.user.displayAvatarURL({ dynamic: true }),
            },
            color: LogColors.WARN,
            fields: [
                { name: "👤 Usuario", value: `${member} \`${member.user.tag}\``, inline: true },
                { name: "🆔 ID", value: `\`${member.id}\``, inline: true },
                { name: "⏱️ Antigüedad", value: `\`${accountAge.toFixed(1)} días\``, inline: true },
                { name: "📅 Cuenta creada", value: formatDate(member.user.createdAt), inline: true },
                { name: "⚠️ Umbral", value: `\`${RAID_CONFIG.newAccountAge} días\``, inline: true },
                { name: "📅 Fecha", value: formatDate(), inline: true },
            ],
            thumbnail: member.user.displayAvatarURL({ dynamic: true, size: 128 }),
            footer: `Anti-Raid System`,
        });
        await sendLog(member.guild, embed);
    }

    // Raid
    if (recentJoins.length >= RAID_CONFIG.maxJoins && !raidMode) {
        raidMode = true;

        const embed = createLogEmbed({
            author: { name: "ALERTA DE RAID DETECTADA" },
            color: LogColors.ANTI_RAID,
            fields: [
                { name: "⚠️ Joins detectados", value: `\`${recentJoins.length}\` en \`${RAID_CONFIG.timeWindow / 1000}s\``, inline: true },
                { name: "🔒 Estado", value: "Modo raid activado", inline: true },
                { name: "⏱️ Duración", value: `\`${RAID_CONFIG.lockdownDuration / 1000}s\``, inline: true },
                { name: "📅 Fecha", value: formatDate(), inline: true },
            ],
            footer: `Anti-Raid System`,
        });
        await sendLog(member.guild, embed);

        raidTimeout = setTimeout(async () => {
            raidMode = false;
            recentJoins.length = 0;

            const endEmbed = createLogEmbed({
                author: { name: "Modo Raid Desactivado" },
                color: LogColors.MEMBER_JOIN,
                fields: [
                    { name: "✅ Estado", value: "Servidor normalizado", inline: true },
                    { name: "📅 Fecha", value: formatDate(), inline: true },
                ],
                footer: `Anti-Raid System`,
            });
            await sendLog(member.guild, endEmbed);
        }, RAID_CONFIG.lockdownDuration);
    }
}

function isRaidMode() {
    return raidMode;
}

module.exports = { checkRaid, isRaidMode, RAID_CONFIG };

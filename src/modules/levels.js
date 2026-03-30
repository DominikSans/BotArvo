const { EmbedBuilder } = require("discord.js");
const path = require("path");
const fs = require("fs");

// ── Configuracion ──────────────────────────────────────────────
const LEVELS_CONFIG = {
    xpPerMessage: [15, 25], // random entre min y max
    cooldown: 60_000, // 1 minuto de cooldown entre ganancias de XP
    levelUpChannelId: "", // si esta vacio, envia en el mismo canal
    levelRoles: {
        5: "",  // roleId para nivel 5
        10: "", // roleId para nivel 10
        20: "", // roleId para nivel 20
        30: "", // roleId para nivel 30
    },
};

// ── Rutas y datos ──────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "levels.json");

let levelsData = {};
let dirty = false;

// Cooldowns en memoria (no se persisten)
const cooldowns = new Map();

// ── Carga y guardado ───────────────────────────────────────────
function loadData() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE, "utf-8");
            levelsData = JSON.parse(raw);
        } else {
            levelsData = {};
            fs.writeFileSync(DATA_FILE, JSON.stringify(levelsData, null, 2), "utf-8");
        }
    } catch (err) {
        console.error("[Levels] Error al cargar datos:", err);
        levelsData = {};
    }
}

function saveData() {
    if (!dirty) return;
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(levelsData, null, 2), "utf-8");
        dirty = false;
    } catch (err) {
        console.error("[Levels] Error al guardar datos:", err);
    }
}

// Guardar cada 60 segundos
setInterval(saveData, 60_000);

// Cargar datos al iniciar el modulo
loadData();

// ── Formulas ───────────────────────────────────────────────────
function calculateLevel(xp) {
    return Math.floor(0.1 * Math.sqrt(xp));
}

function xpForNextLevel(level) {
    return Math.ceil(((level + 1) / 0.1) ** 2);
}

function randomXP() {
    const [min, max] = LEVELS_CONFIG.xpPerMessage;
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ── Utilidades ─────────────────────────────────────────────────
function getProgressBar(current, total, length = 20) {
    const filled = Math.round((current / total) * length);
    const empty = length - filled;
    return "\u2593".repeat(filled) + "\u2591".repeat(empty);
}

function getUserData(userId) {
    if (!levelsData[userId]) {
        levelsData[userId] = { xp: 0, level: 0, totalMessages: 0 };
    }
    return levelsData[userId];
}

function getRankPosition(userId) {
    const sorted = Object.entries(levelsData).sort((a, b) => b[1].xp - a[1].xp);
    const index = sorted.findIndex(([id]) => id === userId);
    return index === -1 ? sorted.length + 1 : index + 1;
}

// ── addXP ──────────────────────────────────────────────────────
async function addXP(message) {
    if (message.author.bot) return;

    const userId = message.author.id;
    const now = Date.now();

    // Incrementar mensajes totales siempre
    const userData = getUserData(userId);
    userData.totalMessages++;
    dirty = true;

    // Comprobar cooldown
    const lastXP = cooldowns.get(userId) || 0;
    if (now - lastXP < LEVELS_CONFIG.cooldown) return;

    // Dar XP
    cooldowns.set(userId, now);
    const gained = randomXP();
    const previousLevel = userData.level;

    userData.xp += gained;
    userData.level = calculateLevel(userData.xp);

    // Comprobar subida de nivel
    if (userData.level > previousLevel) {
        await onLevelUp(message, userData.level);
    }
}

// ── Level Up ───────────────────────────────────────────────────
async function onLevelUp(message, newLevel) {
    const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle("\u2B50 \u00A1Subida de nivel!")
        .setDescription(
            `\u00A1Felicidades ${message.author}! Has alcanzado el **nivel ${newLevel}**!`
        )
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true, size: 128 }))
        .setTimestamp();

    const targetChannel = LEVELS_CONFIG.levelUpChannelId
        ? message.guild.channels.cache.get(LEVELS_CONFIG.levelUpChannelId)
        : message.channel;

    if (targetChannel) {
        await targetChannel.send({ embeds: [embed] }).catch(() => {});
    }

    // Asignar rol si esta configurado
    const roleId = LEVELS_CONFIG.levelRoles[newLevel];
    if (roleId && message.guild) {
        const role = message.guild.roles.cache.get(roleId);
        if (role) {
            await message.member.roles.add(role).catch((err) => {
                console.error(`[Levels] No se pudo asignar el rol de nivel ${newLevel}:`, err);
            });
        }
    }
}

// ── !rank / !nivel ─────────────────────────────────────────────
async function handleRank(message) {
    const target = message.mentions.users.first() || message.author;
    const userData = getUserData(target.id);
    const rank = getRankPosition(target.id);

    const currentLevelXP = userData.level === 0 ? 0 : Math.ceil((userData.level / 0.1) ** 2);
    const nextLevelXP = xpForNextLevel(userData.level);
    const progressXP = userData.xp - currentLevelXP;
    const neededXP = nextLevelXP - currentLevelXP;
    const progressBar = getProgressBar(progressXP, neededXP);
    const percentage = Math.floor((progressXP / neededXP) * 100);

    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setAuthor({
            name: target.username,
            iconURL: target.displayAvatarURL({ dynamic: true, size: 64 }),
        })
        .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 256 }))
        .setTitle("\uD83C\uDFC5 Tarjeta de Rango")
        .addFields(
            { name: "\uD83C\uDD99 Nivel", value: `\`${userData.level}\``, inline: true },
            { name: "\u2728 XP Total", value: `\`${userData.xp.toLocaleString("es-ES")}\``, inline: true },
            { name: "\uD83C\uDFC6 Ranking", value: `\`#${rank}\``, inline: true },
            {
                name: `\uD83D\uDCC8 Progreso al nivel ${userData.level + 1}`,
                value: `${progressBar}\n\`${progressXP.toLocaleString("es-ES")} / ${neededXP.toLocaleString("es-ES")} XP (${percentage}%)\``,
                inline: false,
            },
            { name: "\uD83D\uDCAC Mensajes totales", value: `\`${userData.totalMessages.toLocaleString("es-ES")}\``, inline: true }
        )
        .setFooter({ text: "Sistema de niveles" })
        .setTimestamp();

    await message.channel.send({ embeds: [embed] });
}

// ── !top ───────────────────────────────────────────────────────
async function handleLeaderboard(message) {
    const sorted = Object.entries(levelsData)
        .sort((a, b) => b[1].xp - a[1].xp)
        .slice(0, 10);

    if (sorted.length === 0) {
        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setDescription("\u274C No hay datos de niveles todavia."),
            ],
        });
    }

    const medals = ["\uD83E\uDD47", "\uD83E\uDD48", "\uD83E\uDD49"];
    const lines = [];

    for (let i = 0; i < sorted.length; i++) {
        const [userId, data] = sorted[i];
        const prefix = i < 3 ? medals[i] : `\`#${i + 1}\``;

        let username;
        try {
            const user = await message.client.users.fetch(userId);
            username = user.username;
        } catch {
            username = `Usuario (${userId})`;
        }

        lines.push(
            `${prefix} **${username}** — Nivel \`${data.level}\` | \`${data.xp.toLocaleString("es-ES")}\` XP | \`${data.totalMessages.toLocaleString("es-ES")}\` msgs`
        );
    }

    const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle("\uD83C\uDFC6 Tabla de clasificacion")
        .setDescription(lines.join("\n"))
        .setFooter({ text: `Solicitado por ${message.author.username}` })
        .setTimestamp();

    await message.channel.send({ embeds: [embed] });
}

// ── Exports ────────────────────────────────────────────────────
module.exports = {
    addXP,
    handleLeaderboard,
    handleRank,
};

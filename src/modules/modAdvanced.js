const { EmbedBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { sendLog, createLogEmbed, LogColors, formatDate } = require("./logger");
const path = require("path");
const fs = require("fs");

// ─── Colores ────────────────────────────────────────────────────────────────
const ACCENT = 0xa62f37;
const SUCCESS = 0x2ecc71;

// ─── Ruta de datos ──────────────────────────────────────────────────────────
const DATA_PATH = path.join(__dirname, "..", "data", "moderation.json");

// ─── Estado en memoria ─────────────────────────────────────────────────────
let data = null;
const tempbans = new Map(); // guildId-userId -> timeout id

// ─── Persistencia ───────────────────────────────────────────────────────────

function loadData() {
    if (data) return data;
    try {
        if (fs.existsSync(DATA_PATH)) {
            data = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
        }
    } catch (err) {
        console.error("[ModAdvanced] Error al cargar moderation.json:", err.message);
    }
    if (!data || typeof data !== "object") {
        data = { warns: {}, blacklist: {}, notes: {} };
    }
    // Asegurar claves raíz
    if (!data.warns) data.warns = {};
    if (!data.blacklist) data.blacklist = {};
    if (!data.notes) data.notes = {};
    return data;
}

function saveData() {
    try {
        const dir = path.dirname(DATA_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
        console.error("[ModAdvanced] Error al guardar moderation.json:", err.message);
    }
}

// ─── Utilidades ─────────────────────────────────────────────────────────────

function parseDuration(str) {
    const match = str.match(/^(\d+)(m|h|d|w)$/i);
    if (!match) return null;
    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const multipliers = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
    return amount * multipliers[unit];
}

function humanDuration(ms) {
    if (ms >= 604_800_000) return `${Math.round(ms / 604_800_000)} semana(s)`;
    if (ms >= 86_400_000) return `${Math.round(ms / 86_400_000)} dia(s)`;
    if (ms >= 3_600_000) return `${Math.round(ms / 3_600_000)} hora(s)`;
    return `${Math.round(ms / 60_000)} minuto(s)`;
}

function getTarget(message) {
    return message.mentions.members?.first() || null;
}

function getTargetUser(message) {
    return message.mentions.users?.first() || null;
}

// ─── 1. handleWarn ──────────────────────────────────────────────────────────

async function handleWarn(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return message.reply({
            content: "No tienes permiso para usar este comando. Necesitas `ManageMessages`.",
            flags: MessageFlags.Ephemeral,
        });
    }

    const target = getTarget(message);
    if (!target) {
        return message.reply({
            content: "Debes mencionar a un usuario. Uso: `!warn @usuario <razon>`",
            flags: MessageFlags.Ephemeral,
        });
    }

    const args = message.content.split(/\s+/).slice(2);
    const reason = args.join(" ") || "Sin razon especificada";

    const db = loadData();
    if (!db.warns[target.id]) db.warns[target.id] = [];

    const entry = {
        reason,
        moderator: message.author.id,
        date: new Date().toISOString(),
    };
    db.warns[target.id].push(entry);
    saveData();

    const warnCount = db.warns[target.id].length;

    // DM al usuario
    try {
        const dmEmbed = new EmbedBuilder()
            .setColor(ACCENT)
            .setTitle("Has recibido una advertencia")
            .addFields(
                { name: "Servidor", value: message.guild.name, inline: true },
                { name: "Razon", value: reason, inline: true },
                { name: "Advertencias totales", value: `${warnCount}`, inline: true },
            )
            .setTimestamp();
        await target.send({ embeds: [dmEmbed] }).catch(() => {});
    } catch {
        // DMs cerrados
    }

    // Embed de confirmacion
    const confirmEmbed = new EmbedBuilder()
        .setColor(ACCENT)
        .setTitle("Advertencia registrada")
        .addFields(
            { name: "Usuario", value: `${target} (${target.id})`, inline: true },
            { name: "Moderador", value: `${message.author}`, inline: true },
            { name: "Razon", value: reason, inline: false },
            { name: "Total advertencias", value: `${warnCount}`, inline: true },
        )
        .setTimestamp();
    await message.reply({ embeds: [confirmEmbed] });

    // Log
    const logEmbed = createLogEmbed({
        title: "Advertencia",
        color: LogColors.WARN,
        fields: [
            { name: "Usuario", value: `${target} (${target.id})`, inline: true },
            { name: "Moderador", value: `${message.author} (${message.author.id})`, inline: true },
            { name: "Razon", value: reason, inline: false },
            { name: "Total advertencias", value: `${warnCount}`, inline: true },
        ],
        thumbnail: target.user.displayAvatarURL({ dynamic: true }),
    });
    await sendLog(message.guild, logEmbed);

    // ─── Auto-sanciones ─────────────────────────────────────────────────
    try {
        if (warnCount >= 7) {
            await target.ban({ reason: `Auto-ban: ${warnCount} advertencias` });
            await message.channel.send(`**${target.user.tag}** ha sido baneado automaticamente por alcanzar **${warnCount}** advertencias.`);
        } else if (warnCount >= 5) {
            await target.kick(`Auto-kick: ${warnCount} advertencias`);
            await message.channel.send(`**${target.user.tag}** ha sido expulsado automaticamente por alcanzar **${warnCount}** advertencias.`);
        } else if (warnCount >= 3) {
            await target.timeout(3_600_000, `Auto-mute: ${warnCount} advertencias`);
            await message.channel.send(`**${target.user.tag}** ha sido silenciado 1 hora automaticamente por alcanzar **${warnCount}** advertencias.`);
        }
    } catch (err) {
        console.error("[ModAdvanced] Error en auto-sancion:", err.message);
    }
}

// ─── 2. handleWarns ─────────────────────────────────────────────────────────

async function handleWarns(message) {
    const targetUser = getTargetUser(message);
    if (!targetUser) {
        return message.reply({
            content: "Debes mencionar a un usuario. Uso: `!warns @usuario`",
            flags: MessageFlags.Ephemeral,
        });
    }

    const db = loadData();
    const warns = db.warns[targetUser.id];

    if (!warns || warns.length === 0) {
        return message.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(SUCCESS)
                    .setDescription(`**${targetUser.tag}** no tiene advertencias. Sin advertencias.`)
                    .setTimestamp(),
            ],
        });
    }

    const lines = warns.map((w, i) => {
        const date = formatDate(new Date(w.date));
        return `**#${i + 1}** | ${date}\n**Razon:** ${w.reason}\n**Moderador:** <@${w.moderator}>`;
    });

    const embed = new EmbedBuilder()
        .setColor(ACCENT)
        .setTitle(`Advertencias de ${targetUser.tag}`)
        .setDescription(lines.join("\n\n"))
        .setFooter({ text: `Total: ${warns.length} advertencia(s)` })
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

    await message.reply({ embeds: [embed] });
}

// ─── 3. handleClearWarns ────────────────────────────────────────────────────

async function handleClearWarns(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return message.reply({
            content: "No tienes permiso para usar este comando. Necesitas `ManageMessages`.",
            flags: MessageFlags.Ephemeral,
        });
    }

    const targetUser = getTargetUser(message);
    if (!targetUser) {
        return message.reply({
            content: "Debes mencionar a un usuario. Uso: `!clearwarns @usuario`",
            flags: MessageFlags.Ephemeral,
        });
    }

    const db = loadData();
    const count = (db.warns[targetUser.id] || []).length;
    delete db.warns[targetUser.id];
    saveData();

    const embed = new EmbedBuilder()
        .setColor(SUCCESS)
        .setDescription(`Se han eliminado **${count}** advertencia(s) de **${targetUser.tag}**.`)
        .setTimestamp();

    await message.reply({ embeds: [embed] });
}

// ─── 4. handleTempban ───────────────────────────────────────────────────────

async function handleTempban(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
        return message.reply({
            content: "No tienes permiso para usar este comando. Necesitas `BanMembers`.",
            flags: MessageFlags.Ephemeral,
        });
    }

    const target = getTarget(message);
    if (!target) {
        return message.reply({
            content: "Debes mencionar a un usuario. Uso: `!tempban @usuario <duracion> <razon>`",
            flags: MessageFlags.Ephemeral,
        });
    }

    const args = message.content.split(/\s+/).slice(2);
    const durationStr = args[0];
    const durationMs = durationStr ? parseDuration(durationStr) : null;

    if (!durationMs) {
        return message.reply({
            content: "Duracion invalida. Usa formatos como `1m`, `1h`, `1d`, `1w` (maximo 14 dias).",
            flags: MessageFlags.Ephemeral,
        });
    }

    const MAX_DURATION = 14 * 86_400_000; // 14 dias
    if (durationMs > MAX_DURATION) {
        return message.reply({
            content: "La duracion maxima para un tempban es de **14 dias**.",
            flags: MessageFlags.Ephemeral,
        });
    }

    const reason = args.slice(1).join(" ") || "Sin razon especificada";
    const humanDur = humanDuration(durationMs);

    // DM antes del ban
    try {
        const dmEmbed = new EmbedBuilder()
            .setColor(ACCENT)
            .setTitle("Has sido baneado temporalmente")
            .addFields(
                { name: "Servidor", value: message.guild.name, inline: true },
                { name: "Duracion", value: humanDur, inline: true },
                { name: "Razon", value: reason, inline: false },
            )
            .setTimestamp();
        await target.send({ embeds: [dmEmbed] }).catch(() => {});
    } catch {
        // DMs cerrados
    }

    await target.ban({ reason: `Tempban (${humanDur}): ${reason}` });

    // Programar unban
    const key = `${message.guild.id}-${target.id}`;
    if (tempbans.has(key)) clearTimeout(tempbans.get(key));

    const timeout = setTimeout(async () => {
        try {
            await message.guild.bans.remove(target.id, "Tempban expirado");
        } catch (err) {
            console.error("[ModAdvanced] Error al desbanear:", err.message);
        }
        tempbans.delete(key);
    }, durationMs);

    tempbans.set(key, timeout);

    // Confirmacion
    const confirmEmbed = new EmbedBuilder()
        .setColor(ACCENT)
        .setTitle("Ban temporal aplicado")
        .addFields(
            { name: "Usuario", value: `${target.user.tag} (${target.id})`, inline: true },
            { name: "Moderador", value: `${message.author}`, inline: true },
            { name: "Duracion", value: humanDur, inline: true },
            { name: "Razon", value: reason, inline: false },
        )
        .setTimestamp();
    await message.reply({ embeds: [confirmEmbed] });

    // Log
    const logEmbed = createLogEmbed({
        title: "Ban Temporal",
        color: LogColors.BAN_ADD,
        fields: [
            { name: "Usuario", value: `${target.user.tag} (${target.id})`, inline: true },
            { name: "Moderador", value: `${message.author} (${message.author.id})`, inline: true },
            { name: "Duracion", value: humanDur, inline: true },
            { name: "Razon", value: reason, inline: false },
        ],
        thumbnail: target.user.displayAvatarURL({ dynamic: true }),
    });
    await sendLog(message.guild, logEmbed);
}

// ─── 5. handleTempmute ──────────────────────────────────────────────────────

async function handleTempmute(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return message.reply({
            content: "No tienes permiso para usar este comando. Necesitas `ManageMessages`.",
            flags: MessageFlags.Ephemeral,
        });
    }

    const target = getTarget(message);
    if (!target) {
        return message.reply({
            content: "Debes mencionar a un usuario. Uso: `!tempmute @usuario <duracion> <razon>`",
            flags: MessageFlags.Ephemeral,
        });
    }

    const args = message.content.split(/\s+/).slice(2);
    const durationStr = args[0];
    const durationMs = durationStr ? parseDuration(durationStr) : null;

    if (!durationMs) {
        return message.reply({
            content: "Duracion invalida. Usa formatos como `1m`, `1h`, `1d`, `1w`.",
            flags: MessageFlags.Ephemeral,
        });
    }

    const reason = args.slice(1).join(" ") || "Sin razon especificada";
    const humanDur = humanDuration(durationMs);

    // DM al usuario
    try {
        const dmEmbed = new EmbedBuilder()
            .setColor(ACCENT)
            .setTitle("Has sido silenciado temporalmente")
            .addFields(
                { name: "Servidor", value: message.guild.name, inline: true },
                { name: "Duracion", value: humanDur, inline: true },
                { name: "Razon", value: reason, inline: false },
            )
            .setTimestamp();
        await target.send({ embeds: [dmEmbed] }).catch(() => {});
    } catch {
        // DMs cerrados
    }

    await target.timeout(durationMs, reason);

    // Confirmacion
    const confirmEmbed = new EmbedBuilder()
        .setColor(ACCENT)
        .setTitle("Silencio temporal aplicado")
        .addFields(
            { name: "Usuario", value: `${target} (${target.id})`, inline: true },
            { name: "Moderador", value: `${message.author}`, inline: true },
            { name: "Duracion", value: humanDur, inline: true },
            { name: "Razon", value: reason, inline: false },
        )
        .setTimestamp();
    await message.reply({ embeds: [confirmEmbed] });

    // Log
    const logEmbed = createLogEmbed({
        title: "Silencio Temporal",
        color: LogColors.MUTE,
        fields: [
            { name: "Usuario", value: `${target} (${target.id})`, inline: true },
            { name: "Moderador", value: `${message.author} (${message.author.id})`, inline: true },
            { name: "Duracion", value: humanDur, inline: true },
            { name: "Razon", value: reason, inline: false },
        ],
        thumbnail: target.user.displayAvatarURL({ dynamic: true }),
    });
    await sendLog(message.guild, logEmbed);
}

// ─── 6. handleBlacklist ─────────────────────────────────────────────────────

async function handleBlacklist(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply({
            content: "No tienes permiso para usar este comando. Necesitas `Administrator`.",
            flags: MessageFlags.Ephemeral,
        });
    }

    const args = message.content.split(/\s+/).slice(1);

    // !blacklist remove @user
    if (args[0]?.toLowerCase() === "remove") {
        const targetUser = message.mentions.users.first();
        if (!targetUser) {
            return message.reply({
                content: "Debes mencionar a un usuario. Uso: `!blacklist remove @usuario`",
                flags: MessageFlags.Ephemeral,
            });
        }

        const db = loadData();
        if (!db.blacklist[targetUser.id]) {
            return message.reply({
                content: `**${targetUser.tag}** no esta en la blacklist.`,
                flags: MessageFlags.Ephemeral,
            });
        }

        delete db.blacklist[targetUser.id];
        saveData();

        const embed = new EmbedBuilder()
            .setColor(SUCCESS)
            .setDescription(`**${targetUser.tag}** ha sido removido de la blacklist.`)
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    // !blacklist @user <razon>
    const targetUser = getTargetUser(message);
    if (!targetUser) {
        return message.reply({
            content: "Debes mencionar a un usuario. Uso: `!blacklist @usuario <razon>` o `!blacklist remove @usuario`",
            flags: MessageFlags.Ephemeral,
        });
    }

    const reason = args.slice(1).join(" ") || "Sin razon especificada";

    const db = loadData();
    db.blacklist[targetUser.id] = {
        reason,
        moderator: message.author.id,
        date: new Date().toISOString(),
    };
    saveData();

    const embed = new EmbedBuilder()
        .setColor(ACCENT)
        .setTitle("Usuario agregado a la blacklist")
        .addFields(
            { name: "Usuario", value: `${targetUser.tag} (${targetUser.id})`, inline: true },
            { name: "Moderador", value: `${message.author}`, inline: true },
            { name: "Razon", value: reason, inline: false },
        )
        .setTimestamp();
    await message.reply({ embeds: [embed] });

    // Log
    const logEmbed = createLogEmbed({
        title: "Blacklist - Usuario agregado",
        color: LogColors.BAN_ADD,
        fields: [
            { name: "Usuario", value: `${targetUser.tag} (${targetUser.id})`, inline: true },
            { name: "Moderador", value: `${message.author} (${message.author.id})`, inline: true },
            { name: "Razon", value: reason, inline: false },
        ],
    });
    await sendLog(message.guild, logEmbed);
}

// ─── 7. checkBlacklist ──────────────────────────────────────────────────────

async function checkBlacklist(member) {
    const db = loadData();
    const entry = db.blacklist[member.id];
    if (!entry) return;

    try {
        const dmEmbed = new EmbedBuilder()
            .setColor(ACCENT)
            .setTitle("Estas en la blacklist de este servidor")
            .setDescription(`**Razon:** ${entry.reason}`)
            .setTimestamp();
        await member.send({ embeds: [dmEmbed] }).catch(() => {});
    } catch {
        // DMs cerrados
    }

    try {
        await member.ban({ reason: `Blacklist: ${entry.reason}` });
    } catch (err) {
        console.error("[ModAdvanced] Error al banear usuario de blacklist:", err.message);
    }

    // Log
    try {
        const logEmbed = createLogEmbed({
            title: "Blacklist - Usuario baneado al unirse",
            color: LogColors.BAN_ADD,
            fields: [
                { name: "Usuario", value: `${member.user.tag} (${member.id})`, inline: true },
                { name: "Razon original", value: entry.reason, inline: false },
                { name: "Blacklisteado por", value: `<@${entry.moderator}>`, inline: true },
                { name: "Fecha de blacklist", value: formatDate(new Date(entry.date)), inline: true },
            ],
        });
        await sendLog(member.guild, logEmbed);
    } catch {
        // Error al enviar log
    }
}

// ─── 8. handleNote ──────────────────────────────────────────────────────────

async function handleNote(message) {
    const command = message.content.split(/\s+/)[0].toLowerCase();

    // !notes @user — mostrar notas
    if (command === "!notes") {
        const targetUser = getTargetUser(message);
        if (!targetUser) {
            return message.reply({
                content: "Debes mencionar a un usuario. Uso: `!notes @usuario`",
                flags: MessageFlags.Ephemeral,
            });
        }

        const db = loadData();
        const notes = db.notes[targetUser.id];

        if (!notes || notes.length === 0) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(SUCCESS)
                        .setDescription(`**${targetUser.tag}** no tiene notas registradas.`)
                        .setTimestamp(),
                ],
            });
        }

        const lines = notes.map((n, i) => {
            const date = formatDate(new Date(n.date));
            return `**#${i + 1}** | ${date}\n${n.text}\n— <@${n.author}>`;
        });

        const embed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle(`Notas de ${targetUser.tag}`)
            .setDescription(lines.join("\n\n"))
            .setFooter({ text: `Total: ${notes.length} nota(s)` })
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    }

    // !note @user <texto> — agregar nota
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return message.reply({
            content: "No tienes permiso para usar este comando. Necesitas `ManageMessages`.",
            flags: MessageFlags.Ephemeral,
        });
    }

    const targetUser = getTargetUser(message);
    if (!targetUser) {
        return message.reply({
            content: "Debes mencionar a un usuario. Uso: `!note @usuario <texto>`",
            flags: MessageFlags.Ephemeral,
        });
    }

    const args = message.content.split(/\s+/).slice(2);
    const text = args.join(" ");

    if (!text) {
        return message.reply({
            content: "Debes escribir el texto de la nota. Uso: `!note @usuario <texto>`",
            flags: MessageFlags.Ephemeral,
        });
    }

    const db = loadData();
    if (!db.notes[targetUser.id]) db.notes[targetUser.id] = [];

    db.notes[targetUser.id].push({
        text,
        author: message.author.id,
        date: new Date().toISOString(),
    });
    saveData();

    const embed = new EmbedBuilder()
        .setColor(SUCCESS)
        .setDescription(`Nota agregada para **${targetUser.tag}**. Total: **${db.notes[targetUser.id].length}** nota(s).`)
        .setTimestamp();

    await message.reply({ embeds: [embed] });
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    handleWarn,
    handleWarns,
    handleClearWarns,
    handleTempban,
    handleTempmute,
    handleBlacklist,
    checkBlacklist,
    handleNote,
};

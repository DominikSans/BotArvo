const { EmbedBuilder, AuditLogEvent } = require("discord.js");
const { sendLog, createLogEmbed, LogColors, formatDate, truncate } = require("./logger");
const config = require("../../config.json");

const COLORS = {
    DELETION: 0xa62f37,
    EDIT: 0xf39c12,
    ADDITION: 0x2ecc71,
};

/**
 * Registra cambios de roles en un miembro.
 * @param {import("discord.js").GuildMember} oldMember
 * @param {import("discord.js").GuildMember} newMember
 */
async function logRoleChange(oldMember, newMember) {
    const addedRoles = newMember.roles.cache.filter(
        (role) => !oldMember.roles.cache.has(role.id)
    );
    const removedRoles = oldMember.roles.cache.filter(
        (role) => !newMember.roles.cache.has(role.id)
    );

    // Si no hubo cambios de roles, ignorar
    if (addedRoles.size === 0 && removedRoles.size === 0) return;

    // Intentar obtener quién realizó el cambio desde los audit logs
    let executor = null;
    try {
        const auditLogs = await newMember.guild.fetchAuditLogs({
            type: AuditLogEvent.MemberRoleUpdate,
            limit: 5,
        });

        const entry = auditLogs.entries.find(
            (e) =>
                e.target.id === newMember.id &&
                Date.now() - e.createdTimestamp < 5000
        );

        if (entry) {
            executor = entry.executor;
        }
    } catch {
        // Sin permisos para ver audit logs
    }

    const fields = [
        {
            name: "👤 Usuario",
            value: `${newMember} (\`${newMember.user.tag}\`)`,
            inline: true,
        },
        {
            name: "🆔 ID",
            value: `\`${newMember.id}\``,
            inline: true,
        },
    ];

    if (executor) {
        fields.push({
            name: "🔧 Modificado por",
            value: `${executor} (\`${executor.tag}\`)`,
            inline: true,
        });
    }

    if (addedRoles.size > 0) {
        fields.push({
            name: "🟢 Roles añadidos",
            value: addedRoles.map((r) => `${r}`).join(", "),
            inline: false,
        });
    }

    if (removedRoles.size > 0) {
        fields.push({
            name: "🔴 Roles removidos",
            value: removedRoles.map((r) => `${r}`).join(", "),
            inline: false,
        });
    }

    fields.push({
        name: "📅 Fecha",
        value: formatDate(),
        inline: true,
    });

    const color =
        addedRoles.size > 0 && removedRoles.size === 0
            ? COLORS.ADDITION
            : removedRoles.size > 0 && addedRoles.size === 0
                ? COLORS.DELETION
                : COLORS.EDIT;

    const embed = createLogEmbed({
        title: "🛡️ Cambio de Roles",
        color,
        fields,
        thumbnail: newMember.user.displayAvatarURL({ dynamic: true, size: 128 }),
        footer: "Registro de Auditoría",
    });

    await sendLog(newMember.guild, embed);
}

/**
 * Registra la edición de un mensaje con diff detallado.
 * @param {import("discord.js").Message} oldMessage
 * @param {import("discord.js").Message} newMessage
 */
async function logMessageEdit(oldMessage, newMessage) {
    // Ignorar mensajes de bots, parciales sin contenido, o sin cambios reales
    if (newMessage.author?.bot) return;
    if (!oldMessage.content && !newMessage.content) return;
    if (oldMessage.content === newMessage.content) return;

    const author = newMessage.author;
    const channel = newMessage.channel;

    const fields = [
        {
            name: "👤 Usuario",
            value: `${author} (\`${author.tag}\`)`,
            inline: true,
        },
        {
            name: "📝 Canal",
            value: `${channel} (\`#${channel.name}\`)`,
            inline: true,
        },
        {
            name: "🔗 Mensaje",
            value: `[Ir al mensaje](${newMessage.url})`,
            inline: true,
        },
        {
            name: "📄 Antes",
            value: truncate(oldMessage.content || "*Sin contenido*", 1024),
            inline: false,
        },
        {
            name: "📄 Después",
            value: truncate(newMessage.content || "*Sin contenido*", 1024),
            inline: false,
        },
        {
            name: "📅 Fecha",
            value: formatDate(),
            inline: true,
        },
    ];

    const embed = createLogEmbed({
        title: "✏️ Mensaje Editado",
        color: COLORS.EDIT,
        fields,
        thumbnail: author.displayAvatarURL({ dynamic: true, size: 128 }),
        footer: "Registro de Auditoría",
    });

    await sendLog(newMessage.guild, embed, "message");
}

/**
 * Registra la eliminación de un mensaje con contenido y adjuntos.
 * @param {import("discord.js").Message} message
 */
async function logMessageDelete(message) {
    // Ignorar mensajes de bots y parciales sin info útil
    if (message.author?.bot) return;
    if (!message.author) return;

    const author = message.author;
    const channel = message.channel;

    const fields = [
        {
            name: "👤 Usuario",
            value: `${author} (\`${author.tag}\`)`,
            inline: true,
        },
        {
            name: "📝 Canal",
            value: `${channel} (\`#${channel.name}\`)`,
            inline: true,
        },
        {
            name: "🆔 ID del Mensaje",
            value: `\`${message.id}\``,
            inline: true,
        },
        {
            name: "📄 Contenido",
            value: truncate(message.content || "*Sin contenido de texto*", 1024),
            inline: false,
        },
    ];

    // Listar adjuntos si los hay
    if (message.attachments.size > 0) {
        const attachmentList = message.attachments
            .map((a) => `[${a.name || "archivo"}](${a.proxyURL || a.url})`)
            .join("\n");

        fields.push({
            name: `📎 Adjuntos (${message.attachments.size})`,
            value: truncate(attachmentList, 1024),
            inline: false,
        });
    }

    // Listar embeds si los hay
    if (message.embeds.length > 0) {
        fields.push({
            name: "🔗 Embeds",
            value: `El mensaje contenía **${message.embeds.length}** embed(s).`,
            inline: true,
        });
    }

    fields.push({
        name: "📅 Fecha",
        value: formatDate(),
        inline: true,
    });

    const embed = createLogEmbed({
        title: "🗑️ Mensaje Eliminado",
        color: COLORS.DELETION,
        fields,
        thumbnail: author.displayAvatarURL({ dynamic: true, size: 128 }),
        footer: "Registro de Auditoría",
    });

    await sendLog(message.guild, embed, "message");
}

/**
 * Registra la eliminación masiva de mensajes.
 * @param {import("discord.js").Collection<string, import("discord.js").Message>} messages
 */
async function logBulkDelete(messages) {
    const firstMessage = messages.first();
    if (!firstMessage) return;

    const channel = firstMessage.channel;
    const guild = firstMessage.guild;

    // Recopilar autores únicos
    const authors = new Map();
    messages.forEach((msg) => {
        if (msg.author) {
            const count = authors.get(msg.author.id) || { user: msg.author, count: 0 };
            count.count++;
            authors.set(msg.author.id, count);
        }
    });

    const authorList = [...authors.values()]
        .sort((a, b) => b.count - a.count)
        .map((a) => `${a.user} — **${a.count}** mensaje(s)`)
        .join("\n");

    // Generar resumen de contenido (últimos mensajes)
    const contentPreview = messages
        .filter((m) => m.content)
        .last(5)
        .map(
            (m) =>
                `**${m.author?.tag || "Desconocido"}:** ${truncate(m.content, 100)}`
        )
        .join("\n");

    const fields = [
        {
            name: "📝 Canal",
            value: `${channel} (\`#${channel.name}\`)`,
            inline: true,
        },
        {
            name: "🔢 Cantidad",
            value: `**${messages.size}** mensaje(s)`,
            inline: true,
        },
        {
            name: "📅 Fecha",
            value: formatDate(),
            inline: true,
        },
        {
            name: "👥 Autores involucrados",
            value: truncate(authorList || "*No disponible*", 1024),
            inline: false,
        },
    ];

    if (contentPreview) {
        fields.push({
            name: "📄 Vista previa (últimos 5)",
            value: truncate(contentPreview, 1024),
            inline: false,
        });
    }

    // Contar adjuntos totales
    const totalAttachments = messages.reduce(
        (sum, m) => sum + m.attachments.size,
        0
    );

    if (totalAttachments > 0) {
        fields.push({
            name: "📎 Adjuntos",
            value: `**${totalAttachments}** archivo(s) adjunto(s) eliminados.`,
            inline: true,
        });
    }

    const embed = createLogEmbed({
        title: "🗑️ Eliminación Masiva de Mensajes",
        color: COLORS.DELETION,
        description: `Se eliminaron **${messages.size}** mensajes en ${channel}.`,
        fields,
        footer: "Registro de Auditoría",
    });

    await sendLog(guild, embed, "message");
}

module.exports = {
    logRoleChange,
    logMessageEdit,
    logMessageDelete,
    logBulkDelete,
};

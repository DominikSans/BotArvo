const { AttachmentBuilder } = require("discord.js");

/**
 * Genera un transcript HTML de un canal de ticket.
 * @param {import("discord.js").TextChannel} channel - El canal del ticket.
 * @param {import("discord.js").User} closedBy - El usuario que cerró el ticket.
 * @returns {Promise<AttachmentBuilder>} Archivo HTML adjunto.
 */
async function generateTranscript(channel, closedBy) {
    // ── Obtener mensajes en lotes de 100 (máximo 300) ──
    const allMessages = [];
    let lastId = null;

    for (let i = 0; i < 3; i++) {
        const options = { limit: 100 };
        if (lastId) options.before = lastId;

        const fetched = await channel.messages.fetch(options);
        if (fetched.size === 0) break;

        allMessages.push(...fetched.values());
        lastId = fetched.last().id;

        if (fetched.size < 100) break;
    }

    // Ordenar del más antiguo al más reciente
    allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    // ── Datos del header ──
    const channelName = channel.name;
    const ticketCreator = channel.topic || "Desconocido";
    const closedByTag = closedBy ? `${closedBy.tag}` : "Desconocido";
    const closeDate = new Date().toLocaleString("es-ES", {
        dateStyle: "long",
        timeStyle: "short",
    });

    // ── Construir HTML ──
    const messagesHtml = allMessages.map((msg) => {
        const avatarUrl = msg.author.displayAvatarURL({ extension: "png", size: 64 });
        const username = escapeHtml(msg.author.tag);
        const timestamp = new Date(msg.createdTimestamp).toLocaleString("es-ES", {
            dateStyle: "short",
            timeStyle: "short",
        });
        const content = formatContent(msg.content);

        // Embeds
        let embedsHtml = "";
        if (msg.embeds && msg.embeds.length > 0) {
            for (const embed of msg.embeds) {
                const title = embed.title ? `<div class="embed-title">${escapeHtml(embed.title)}</div>` : "";
                const desc = embed.description ? `<div class="embed-desc">${escapeHtml(embed.description)}</div>` : "";
                if (title || desc) {
                    const color = embed.color ? `border-left-color: #${embed.color.toString(16).padStart(6, "0")}` : "";
                    embedsHtml += `<div class="embed" style="${color}">${title}${desc}</div>`;
                }
            }
        }

        // Adjuntos
        let attachmentsHtml = "";
        if (msg.attachments && msg.attachments.size > 0) {
            const links = msg.attachments.map(
                (att) => `<a class="attachment" href="${escapeHtml(att.url)}" target="_blank">📎 ${escapeHtml(att.name || "archivo")}</a>`
            );
            attachmentsHtml = `<div class="attachments">${links.join("")}</div>`;
        }

        return `
        <div class="message">
            <img class="avatar" src="${avatarUrl}" alt="avatar">
            <div class="message-body">
                <div class="message-header">
                    <span class="username">${username}</span>
                    <span class="timestamp">${timestamp}</span>
                </div>
                <div class="content">${content}</div>
                ${embedsHtml}
                ${attachmentsHtml}
            </div>
        </div>`;
    }).join("\n");

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Transcript - ${escapeHtml(channelName)}</title>
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
        background: #36393f;
        color: #dcddde;
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        font-size: 15px;
        line-height: 1.5;
        padding: 20px;
    }
    .header {
        background: #2f3136;
        border-radius: 8px;
        padding: 20px;
        margin-bottom: 20px;
        border-left: 4px solid #5865f2;
    }
    .header h1 {
        color: #ffffff;
        font-size: 20px;
        margin-bottom: 10px;
    }
    .header p {
        color: #b9bbbe;
        font-size: 14px;
        margin: 4px 0;
    }
    .header span {
        color: #dcddde;
        font-weight: 600;
    }
    .message {
        display: flex;
        padding: 8px 16px;
        border-radius: 4px;
    }
    .message:hover {
        background: #32353b;
    }
    .avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        margin-right: 12px;
        flex-shrink: 0;
    }
    .message-body {
        flex: 1;
        min-width: 0;
    }
    .message-header {
        display: flex;
        align-items: baseline;
        gap: 8px;
        margin-bottom: 2px;
    }
    .username {
        color: #ffffff;
        font-weight: 600;
        font-size: 15px;
    }
    .timestamp {
        color: #72767d;
        font-size: 12px;
    }
    .content {
        word-wrap: break-word;
        white-space: pre-wrap;
    }
    .content code {
        background: #2f3136;
        padding: 2px 4px;
        border-radius: 3px;
        font-family: "Consolas", monospace;
        font-size: 13px;
    }
    .embed {
        background: #2f3136;
        border-left: 4px solid #5865f2;
        border-radius: 4px;
        padding: 10px;
        margin-top: 6px;
        max-width: 500px;
    }
    .embed-title {
        color: #ffffff;
        font-weight: 600;
        margin-bottom: 4px;
    }
    .embed-desc {
        color: #b9bbbe;
        font-size: 14px;
    }
    .attachments {
        margin-top: 6px;
    }
    .attachment {
        display: inline-block;
        color: #00aff4;
        text-decoration: none;
        background: #2f3136;
        padding: 4px 10px;
        border-radius: 4px;
        margin: 2px 4px 2px 0;
        font-size: 14px;
    }
    .attachment:hover {
        text-decoration: underline;
    }
    .footer {
        text-align: center;
        color: #72767d;
        font-size: 12px;
        margin-top: 20px;
        padding-top: 12px;
        border-top: 1px solid #40444b;
    }
</style>
</head>
<body>
    <div class="header">
        <h1>📋 Transcript de ${escapeHtml(channelName)}</h1>
        <p>Creador del ticket: <span>${escapeHtml(ticketCreator)}</span></p>
        <p>Cerrado por: <span>${escapeHtml(closedByTag)}</span></p>
        <p>Fecha de cierre: <span>${closeDate}</span></p>
        <p>Total de mensajes: <span>${allMessages.length}</span></p>
    </div>

    ${messagesHtml}

    <div class="footer">
        Generado automáticamente • ${closeDate}
    </div>
</body>
</html>`;

    const buffer = Buffer.from(html, "utf-8");
    const attachment = new AttachmentBuilder(buffer, {
        name: `transcript-${channelName}.html`,
    });

    return attachment;
}

/**
 * Escapa caracteres HTML especiales.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
    if (!text) return "";
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Aplica formato básico de markdown al contenido del mensaje.
 * @param {string} text
 * @returns {string}
 */
function formatContent(text) {
    if (!text) return "";

    let formatted = escapeHtml(text);

    // ~~tachado~~
    formatted = formatted.replace(/~~(.+?)~~/g, "<s>$1</s>");
    // **negrita**
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    // *cursiva*
    formatted = formatted.replace(/\*(.+?)\*/g, "<em>$1</em>");
    // `código`
    formatted = formatted.replace(/`(.+?)`/g, "<code>$1</code>");

    return formatted;
}

module.exports = { generateTranscript };

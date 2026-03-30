const {
    ContainerBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    AttachmentBuilder,
    MessageFlags,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");
const config = require("../../config.json");
const path = require("path");
const fs = require("fs");

const STATUS_CHANNEL_ID = "1320609986560135230";
const ASSETS_PATH = path.join(__dirname, "..", "assets");

let statusMessageId = null;

/**
 * Crea el panel de estado del bot usando Components V2 (mismo estilo que tickets)
 */
function createStatusPanel(client) {
    const guild = client.guilds.cache.first();
    const uptime = formatUptime(client.uptime || 0);
    const memUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
    const ping = client.ws.ping;
    const totalMembers = guild ? guild.memberCount : 0;
    const totalChannels = guild ? guild.channels.cache.size : 0;
    const totalRoles = guild ? guild.roles.cache.size : 0;
    const onlineMembers = guild ? guild.members.cache.filter(m => m.presence?.status && m.presence.status !== "offline").size : 0;
    const ticketCount = guild ? guild.channels.cache.filter(c => c.name.startsWith("ticket-")).size : 0;
    const nodeVersion = process.version;

    // Banner
    let bannerURL = null;
    let attachment = null;
    const bannerFile = path.join(ASSETS_PATH, "banner_status.png");

    if (fs.existsSync(bannerFile)) {
        attachment = new AttachmentBuilder(bannerFile, { name: "banner_status.png" });
        bannerURL = "attachment://banner_status.png";
    }

    // ─── Container ───
    const container = new ContainerBuilder()
        .setAccentColor(0xa62f37);

    // 1) Banner
    if (bannerURL) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(bannerURL),
            ),
        );
    }

    // 2) Separador
    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    );

    // 3) Título
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent([
            `-# ≽  ESTADO DEL BOT`,
            `> ${client.user.username} está **en línea** y funcionando correctamente.`,
        ].join("\n")),
    );

    // 4) Separador
    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    );

    // 5) Rendimiento
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent([
            `-# ≽ RENDIMIENTO`,
            ``,
            `🏓  ⊢ **Latencia**`,
            `-#       ${ping}ms`,
            ``,
            `⏱️  ⊢ **Uptime**`,
            `-#       ${uptime}`,
            ``,
            `💾  ⊢ **Memoria**`,
            `-#       ${memUsage} MB`,
            ``,
            `📦  ⊢ **Node.js**`,
            `-#       ${nodeVersion}`,
        ].join("\n")),
    );

    // 6) Separador
    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    );

    // 7) Servidor
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent([
            `-# ≽ SERVIDOR`,
            ``,
            `👥  ⊢ **Miembros**`,
            `-#       ${totalMembers} total — ${onlineMembers} en línea`,
            ``,
            `📺  ⊢ **Canales**`,
            `-#       ${totalChannels}`,
            ``,
            `🎭  ⊢ **Roles**`,
            `-#       ${totalRoles}`,
            ``,
            `🎫  ⊢ **Tickets abiertos**`,
            `-#       ${ticketCount}`,
        ].join("\n")),
    );

    // 8) Separador
    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    );

    // 9) Footer con última actualización
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `-# Última actualización: <t:${Math.floor(Date.now() / 1000)}:R>`,
        ),
    );

    return { container, attachment };
}

/**
 * Envía o actualiza el panel de estado en el canal configurado
 */
async function updateStatusPanel(client) {
    const guild = client.guilds.cache.first();
    if (!guild) return;

    const channel = guild.channels.cache.get(STATUS_CHANNEL_ID);
    if (!channel) return;

    const { container, attachment } = createStatusPanel(client);
    const sendOptions = {
        components: [container],
        flags: MessageFlags.IsComponentsV2,
    };
    if (attachment) sendOptions.files = [attachment];

    try {
        // Intentar editar el mensaje existente
        if (statusMessageId) {
            try {
                const existingMsg = await channel.messages.fetch(statusMessageId);
                await existingMsg.edit(sendOptions);
                return;
            } catch {
                statusMessageId = null;
            }
        }

        // Si no hay mensaje existente, buscar el último del bot
        const messages = await channel.messages.fetch({ limit: 10 });
        const botMsg = messages.find(m => m.author.id === client.user.id);

        if (botMsg) {
            await botMsg.edit(sendOptions);
            statusMessageId = botMsg.id;
        } else {
            const newMsg = await channel.send(sendOptions);
            statusMessageId = newMsg.id;
        }
    } catch (error) {
        console.error("[BotStatus] Error al actualizar panel:", error.message);
    }
}

/**
 * Inicia la actualización automática del panel cada 2 minutos
 */
function setupStatusInterval(client) {
    // Primera actualización después de 10 segundos
    setTimeout(() => updateStatusPanel(client), 10_000);

    // Actualizar cada 2 minutos
    setInterval(() => updateStatusPanel(client), 120_000);
}

function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);

    return parts.join(" ");
}

module.exports = { createStatusPanel, updateStatusPanel, setupStatusInterval };

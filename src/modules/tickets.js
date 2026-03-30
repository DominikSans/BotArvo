const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    AttachmentBuilder,
    ChannelType,
    PermissionFlagsBits,
    ContainerBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    MessageFlags,
} = require("discord.js");
const config = require("../../config.json");
const path = require("path");
const fs = require("fs");

// ─── Categorías de tickets ───
const TICKET_CATEGORIES = {
    bugs: {
        label: "Reporte de Bugs",
        emoji: "🐛",
        description: "Errores técnicos o fallos en producción",
        color: 0xe74c3c,
    },
    assets: {
        label: "Solicitud de Assets",
        emoji: "🎨",
        description: "Recursos visuales, audio o diseño",
        color: 0x9b59b6,
    },
    consulta: {
        label: "Consulta Creativa",
        emoji: "💬",
        description: "Dudas sobre dirección, estilo o visión",
        color: 0x3498db,
    },
    entrega: {
        label: "Entrega de Archivos",
        emoji: "📁",
        description: "Envío de trabajos o material revisado",
        color: 0x2ecc71,
    },
    seguimiento: {
        label: "Seguimiento de Ticket",
        emoji: "🔍",
        description: "Consulta el estado de tu solicitud",
        color: 0xf39c12,
    },
};

/**
 * Crea el panel de tickets usando Components V2.
 * Un solo Container con: imagen arriba, texto abajo, botón al fondo.
 */
function createTicketPanel() {
    // Construir lista de categorías con formato detallado
    const categoriesList = Object.values(TICKET_CATEGORIES)
        .map(c => `${c.emoji}  ⊢ **${c.label}**\n-#       ${c.description}`)
        .join("\n\n");

    // Resolver el banner desde assets local
    let bannerURL = null;
    let attachment = null;
    const bannerFile = path.resolve(__dirname, "..", "assets", "banner_tickets.png");

    if (fs.existsSync(bannerFile)) {
        attachment = new AttachmentBuilder(bannerFile, { name: "banner_tickets.png" });
        bannerURL = "attachment://banner_tickets.png";
    }

    // ─── Container: Panel de Tickets ───
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

    // 3) Título + Descripción
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent([
            `-# ≽  SISTEMA DE TICKETS`,
            `> Bienvenido al centro oficial de soporte de ArvoStudio`,
        ].join("\n")),
    );

    // 4) Separador
    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    );

    // 5) Categorías
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent([
            `-# ≽ CATEGORÍAS DISPONIBLES`,
            ``,
            categoriesList,
        ].join("\n")),
    );

    // 6) Separador
    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    );

    // 7) Notas + Botón alineados horizontalmente (Section)
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent([
                    `-# ≽  ANTES DE ABRIR TU TICKET`,
                    `> ⊢ Describe el problema con el mayor detalle`,
                    `> ⊢ Adjunta capturas o archivos de referencia`,
                    `> ⊢ Verifica que no exista un ticket similar`,
                ].join("\n")),
            )
            .setButtonAccessory(
                new ButtonBuilder()
                    .setCustomId("ticket_open")
                    .setLabel("Abrir un Ticket")
                    .setEmoji("🎫")
                    .setStyle(ButtonStyle.Success),
            ),
    );

    return { container, attachment };
}

/**
 * Crea el menú de selección de categoría
 */
function createCategoryMenu() {
    const options = Object.entries(TICKET_CATEGORIES).map(([key, cat]) => ({
        label: cat.label,
        description: cat.description,
        emoji: cat.emoji,
        value: `ticket_cat_${key}`,
    }));

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId("ticket_category")
            .setPlaceholder("Selecciona una categoría...")
            .addOptions(options),
    );

    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🎫 Selecciona una categoría")
        .setDescription("Elige la categoría que mejor describa tu consulta. Nuestro equipo te atenderá lo antes posible.")
        .setFooter({ text: "Este menú se eliminará en 30 segundos si no seleccionas nada." });

    return { embed, row };
}

/**
 * Busca todos los tickets abiertos de un usuario y muestra su estado
 */
async function trackTickets(interaction) {
    const { guild, user } = interaction;

    // Buscar todos los canales de ticket que pertenezcan al usuario
    const userTickets = guild.channels.cache.filter(
        ch => ch.name.startsWith("ticket-") && ch.topic?.includes(user.id),
    );

    if (userTickets.size === 0) {
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor(0xf39c12)
                .setTitle("🔍 Seguimiento de Tickets")
                .setDescription("No tienes tickets abiertos en este momento.")
                .setFooter({ text: "Abre un ticket desde el panel si necesitas ayuda." })],
            flags: MessageFlags.Ephemeral,
        });
    }

    // Construir info de cada ticket
    const ticketList = [];
    for (const [, channel] of userTickets) {
        // Extraer categoría del topic
        const topicMatch = channel.topic?.match(/Categoría: (.+)/);
        const categoryName = topicMatch ? topicMatch[1] : "Sin categoría";

        // Buscar si fue reclamado por staff (mensaje con "reclamado por")
        let claimedBy = null;
        try {
            const messages = await channel.messages.fetch({ limit: 20 });
            const claimMsg = messages.find(
                m => m.author.id === guild.members.me.id && m.embeds[0]?.description?.includes("reclamado por"),
            );
            if (claimMsg) {
                const mentionMatch = claimMsg.embeds[0].description.match(/<@!?(\d+)>/);
                claimedBy = mentionMatch ? `<@${mentionMatch[1]}>` : "Staff";
            }
        } catch {
            // Sin permisos para leer mensajes, ignorar
        }

        // Fecha de creación del canal
        const createdTimestamp = Math.floor(channel.createdTimestamp / 1000);

        ticketList.push([
            `**${categoryName}** — ${channel}`,
            `> Creado: <t:${createdTimestamp}:R>`,
            `> Atendido por: ${claimedBy || "*Pendiente de asignación*"}`,
        ].join("\n"));
    }

    const embed = new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle("🔍 Seguimiento de Tickets")
        .setDescription([
            `Tienes **${userTickets.size}** ticket(s) abierto(s):\n`,
            ...ticketList,
        ].join("\n\n"))
        .setFooter({ text: "Haz clic en el canal para ir directamente a tu ticket." });

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

/**
 * Crea un canal de ticket para el usuario
 */
async function createTicket(interaction, categoryKey) {
    const { guild, user } = interaction;
    const category = TICKET_CATEGORIES[categoryKey];
    if (!category) return;

    // Si es seguimiento, redirigir a trackTickets
    if (categoryKey === "seguimiento") {
        return trackTickets(interaction);
    }

    // Verificar si ya tiene un ticket abierto
    const existingTicket = guild.channels.cache.find(
        ch => ch.name.startsWith("ticket-") && ch.topic?.includes(user.id) && !ch.topic?.includes("Seguimiento"),
    );

    if (existingTicket) {
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor(0xed4245)
                .setDescription(`❌ Ya tienes un ticket abierto: ${existingTicket}`)],
            flags: MessageFlags.Ephemeral,
        });
    }

    // Crear el canal
    const ticketName = `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    const staffRoleId = config.staffRoleId;

    const permissionOverwrites = [
        {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
        },
        {
            id: user.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.ReadMessageHistory,
            ],
        },
        {
            id: guild.members.me.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.ManageMessages,
            ],
        },
    ];

    // Añadir permisos para el rol de staff si existe
    if (staffRoleId) {
        permissionOverwrites.push({
            id: staffRoleId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageMessages,
            ],
        });
    }

    try {
        const ticketChannel = await guild.channels.create({
            name: ticketName,
            type: ChannelType.GuildText,
            parent: config.ticketCategoryId || null,
            topic: `Ticket de ${user.tag} (${user.id}) | Categoría: ${category.label}`,
            permissionOverwrites,
        });

        // Embed de bienvenida dentro del ticket
        const welcomeEmbed = new EmbedBuilder()
            .setColor(category.color)
            .setTitle(`${category.emoji} Ticket — ${category.label}`)
            .setDescription([
                `Hola ${user}, gracias por contactar a **${config.studioName || "el Studio"}**.`,
                ``,
                `Un miembro del equipo te atenderá lo antes posible.`,
                `Mientras tanto, describe tu consulta con el mayor detalle posible.`,
                `Si es sobre un producto, incluye capturas o el nombre del recurso.`,
            ].join("\n"))
            .addFields(
                { name: "👤 Usuario", value: `${user}`, inline: true },
                { name: "🏷️ Categoría", value: `${category.emoji} ${category.label}`, inline: true },
                { name: "📅 Creado", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
            )
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
            .setFooter({ text: "Usa el botón de abajo para cerrar el ticket cuando termines." });

        const closeButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("ticket_close")
                .setLabel("Cerrar Ticket")
                .setEmoji("🔒")
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId("ticket_claim")
                .setLabel("Reclamar Ticket")
                .setEmoji("📌")
                .setStyle(ButtonStyle.Primary),
        );

        await ticketChannel.send({
            content: staffRoleId ? `${user} | <@&${staffRoleId}>` : `${user}`,
            embeds: [welcomeEmbed],
            components: [closeButton],
        });

        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor(0x57f287)
                .setDescription(`✅ Tu ticket ha sido creado: ${ticketChannel}`)],
            flags: MessageFlags.Ephemeral,
        });

        // Log
        const { sendLog, createLogEmbed, LogColors, formatDate } = require("./logger");
        const logEmbed = createLogEmbed({
            author: {
                name: "Ticket Creado",
                iconURL: user.displayAvatarURL({ dynamic: true }),
            },
            color: LogColors.CHANNEL_CREATE,
            fields: [
                { name: "👤 Usuario", value: `${user} \`${user.tag}\``, inline: true },
                { name: "🏷️ Categoría", value: `${category.emoji} ${category.label}`, inline: true },
                { name: "📺 Canal", value: `${ticketChannel}`, inline: true },
                { name: "📅 Fecha", value: formatDate(), inline: true },
            ],
            footer: `Registro de Moderación`,
        });
        await sendLog(guild, logEmbed);

    } catch (error) {
        console.error("[Tickets] Error al crear ticket:", error);
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor(0xed4245)
                .setDescription("❌ Error al crear el ticket. Contacta a un administrador.")],
            flags: MessageFlags.Ephemeral,
        });
    }
}

/**
 * Cierra un ticket (archiva el canal)
 */
async function closeTicket(interaction) {
    const channel = interaction.channel;

    if (!channel.name.startsWith("ticket-")) {
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor(0xed4245)
                .setDescription("❌ Este comando solo funciona dentro de un ticket.")],
            flags: MessageFlags.Ephemeral,
        });
    }

    // Embed de confirmación
    const confirmEmbed = new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle("🔒 Cerrar Ticket")
        .setDescription("¿Estás seguro de que deseas cerrar este ticket?\nEl canal será eliminado en **10 segundos** después de confirmar.");

    const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("ticket_confirm_close")
            .setLabel("Confirmar")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId("ticket_cancel_close")
            .setLabel("Cancelar")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({ embeds: [confirmEmbed], components: [confirmRow] });
}

/**
 * Elimina el canal de ticket después de confirmar
 */
async function confirmCloseTicket(interaction) {
    const channel = interaction.channel;
    const user = interaction.user;

    // Log antes de eliminar
    const { sendLog, createLogEmbed, LogColors, formatDate } = require("./logger");
    const logEmbed = createLogEmbed({
        author: {
            name: "Ticket Cerrado",
            iconURL: user.displayAvatarURL({ dynamic: true }),
        },
        color: LogColors.CHANNEL_DELETE,
        fields: [
            { name: "👤 Cerrado por", value: `${user} \`${user.tag}\``, inline: true },
            { name: "📺 Canal", value: `\`#${channel.name}\``, inline: true },
            { name: "📋 Tema", value: channel.topic || "*Sin tema*", inline: false },
            { name: "📅 Fecha", value: formatDate(), inline: true },
        ],
        footer: `Registro de Moderación`,
    });
    await sendLog(interaction.guild, logEmbed);

    // Generar transcripción antes de eliminar
    let transcriptAttachment = null;
    try {
        const { generateTranscript } = require("./transcript");
        transcriptAttachment = await generateTranscript(channel, user);
    } catch (err) {
        console.error("[Tickets] Error al generar transcripción:", err.message);
    }

    // Enviar transcripción al canal de logs
    if (transcriptAttachment) {
        const logChannelId = config.logChannelId;
        const logChannel = interaction.guild.channels.cache.get(logChannelId);
        if (logChannel) {
            await logChannel.send({
                embeds: [new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle("📝 Transcripción de Ticket")
                    .setDescription(`Canal: \`#${channel.name}\`\nCerrado por: ${user}`)
                    .setTimestamp()],
                files: [transcriptAttachment],
            }).catch(() => {});
        }
    }

    // Enviar solicitud de review al creador del ticket
    try {
        const ticketOwnerId = channel.topic?.match(/\((\d+)\)/)?.[1];
        if (ticketOwnerId) {
            const ticketOwner = await interaction.guild.members.fetch(ticketOwnerId).catch(() => null);
            if (ticketOwner) {
                const { sendReviewRequest } = require("./reviews");
                await sendReviewRequest(channel, ticketOwner.user, interaction.guild);
            }
        }
    } catch (err) {
        console.error("[Tickets] Error al enviar review:", err.message);
    }

    await interaction.update({
        embeds: [new EmbedBuilder()
            .setColor(0xed4245)
            .setDescription("🔒 Ticket cerrado. Este canal será eliminado en **10 segundos**...")],
        components: [],
    });

    setTimeout(() => channel.delete().catch(() => {}), 10_000);
}

/**
 * Reclama un ticket (un staff se asigna)
 */
async function claimTicket(interaction) {
    const member = interaction.member;

    // Solo staff puede reclamar
    if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor(0xed4245)
                .setDescription("❌ Solo el staff puede reclamar tickets.")],
            flags: MessageFlags.Ephemeral,
        });
    }

    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setDescription(`📌 Este ticket ha sido reclamado por ${member}.`);

    await interaction.reply({ embeds: [embed] });
}

module.exports = {
    TICKET_CATEGORIES,
    createTicketPanel,
    createCategoryMenu,
    createTicket,
    trackTickets,
    closeTicket,
    confirmCloseTicket,
    claimTicket,
};

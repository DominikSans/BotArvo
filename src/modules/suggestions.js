const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    MessageFlags,
} = require("discord.js");
const config = require("../../config.json");

// ─── Almacén de votos en memoria ───
// Key: messageId, Value: { up: Set<userId>, down: Set<userId> }
const votes = new Map();

/**
 * Crea los botones de votación y gestión para una sugerencia.
 */
function buildSuggestionButtons(messageId, disabled = false) {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`suggestion_up_${messageId}`)
            .setEmoji("👍")
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`suggestion_down_${messageId}`)
            .setEmoji("👎")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`suggestion_manage_${messageId}`)
            .setEmoji("⚙️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled)
    );
    return row;
}

/**
 * Construye el embed de una sugerencia.
 */
function buildSuggestionEmbed(user, text, status = "Pendiente", upCount = 0, downCount = 0, color = 0xfee75c) {
    return new EmbedBuilder()
        .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL({ dynamic: true }) })
        .setDescription(text)
        .setColor(color)
        .addFields(
            { name: "Estado", value: status, inline: true },
            { name: "Votos", value: `👍 ${upCount} | 👎 ${downCount}`, inline: true }
        )
        .setTimestamp();
}

/**
 * Procesa mensajes enviados en el canal de sugerencias.
 */
async function handleSuggestion(message) {
    if (message.author.bot) return;
    if (message.channel.id !== config.suggestionsChannelId) return;

    const text = message.content;
    if (!text) return;

    // Eliminar el mensaje original del usuario
    await message.delete().catch(() => {});

    // Crear embed y enviar
    const embed = buildSuggestionEmbed(message.author, text);
    const sent = await message.channel.send({
        embeds: [embed],
        components: [buildSuggestionButtons("PLACEHOLDER")],
    });

    // Actualizar botones con el ID real del mensaje enviado
    await sent.edit({
        components: [buildSuggestionButtons(sent.id)],
    });

    // Inicializar votos
    votes.set(sent.id, { up: new Set(), down: new Set() });
}

/**
 * Maneja los clics en los botones de voto (👍 / 👎).
 */
async function handleSuggestionVote(interaction) {
    const { customId, user } = interaction;

    // Extraer tipo y messageId del customId
    const parts = customId.split("_");
    // suggestion_up_{id} o suggestion_down_{id}
    const type = parts[1]; // "up" o "down"
    const messageId = parts.slice(2).join("_");

    if (type !== "up" && type !== "down") return;

    // Inicializar si no existe (por si el bot se reinició)
    if (!votes.has(messageId)) {
        votes.set(messageId, { up: new Set(), down: new Set() });
    }

    const voteData = votes.get(messageId);
    const opposite = type === "up" ? "down" : "up";

    // Si ya votó lo mismo, quitar el voto
    if (voteData[type].has(user.id)) {
        voteData[type].delete(user.id);
    } else {
        // Quitar voto contrario si existe
        voteData[opposite].delete(user.id);
        // Agregar voto
        voteData[type].add(user.id);
    }

    // Actualizar el embed con los nuevos conteos
    const msg = interaction.message;
    const oldEmbed = msg.embeds[0];

    const updatedEmbed = EmbedBuilder.from(oldEmbed).spliceFields(1, 1, {
        name: "Votos",
        value: `👍 ${voteData.up.size} | 👎 ${voteData.down.size}`,
        inline: true,
    });

    await interaction.update({
        embeds: [updatedEmbed],
        components: msg.components,
    });
}

/**
 * Maneja el botón de gestión (⚙️) y las acciones de aprobar/rechazar.
 */
async function handleSuggestionAction(interaction) {
    const { customId, member } = interaction;

    const parts = customId.split("_");
    const action = parts[1]; // "manage", "approve" o "reject"
    const messageId = parts.slice(2).join("_");

    // Verificar permisos de staff
    if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({
            content: "❌ No tienes permisos para gestionar sugerencias.",
            flags: MessageFlags.Ephemeral,
        });
    }

    if (action === "manage") {
        // Mostrar botones de aprobar / rechazar (efímero)
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`suggestion_approve_${messageId}`)
                .setLabel("Aprobar")
                .setEmoji("✅")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`suggestion_reject_${messageId}`)
                .setLabel("Rechazar")
                .setEmoji("❌")
                .setStyle(ButtonStyle.Danger)
        );

        return interaction.reply({
            content: "Selecciona una acción para esta sugerencia:",
            components: [row],
            flags: MessageFlags.Ephemeral,
        });
    }

    if (action === "approve" || action === "reject") {
        const isApprove = action === "approve";

        // Buscar el mensaje de la sugerencia en el canal
        const channel = interaction.channel;
        const targetMsg = await channel.messages.fetch(messageId).catch(() => null);

        if (!targetMsg) {
            return interaction.reply({
                content: "❌ No se encontró el mensaje de la sugerencia.",
                flags: MessageFlags.Ephemeral,
            });
        }

        const oldEmbed = targetMsg.embeds[0];
        if (!oldEmbed) return;

        const newColor = isApprove ? 0x2ecc71 : 0xed4245;
        const newStatus = isApprove ? "✅ Aprobada" : "❌ Rechazada";

        const updatedEmbed = EmbedBuilder.from(oldEmbed)
            .setColor(newColor)
            .spliceFields(0, 1, {
                name: "Estado",
                value: newStatus,
                inline: true,
            });

        // Deshabilitar botones de votación
        const disabledRow = buildSuggestionButtons(messageId, true);

        await targetMsg.edit({
            embeds: [updatedEmbed],
            components: [disabledRow],
        });

        // Limpiar votos de memoria
        votes.delete(messageId);

        return interaction.update({
            content: `Sugerencia ${isApprove ? "aprobada" : "rechazada"} correctamente.`,
            components: [],
        });
    }
}

module.exports = {
    handleSuggestion,
    handleSuggestionVote,
    handleSuggestionAction,
};

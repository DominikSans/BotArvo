const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags,
} = require("discord.js");
const config = require("../../config.json");
const path = require("path");
const fs = require("fs");

const reviewsPath = path.join(__dirname, "..", "data", "reviews.json");

// ── Utilidades ──────────────────────────────────────────────────────────────

function loadReviews() {
    try {
        if (!fs.existsSync(reviewsPath)) {
            fs.writeFileSync(reviewsPath, JSON.stringify({}, null, 2));
            return {};
        }
        return JSON.parse(fs.readFileSync(reviewsPath, "utf-8"));
    } catch {
        return {};
    }
}

function saveReviews(data) {
    fs.writeFileSync(reviewsPath, JSON.stringify(data, null, 2));
}

function ratingColor(rating) {
    const colors = {
        1: 0xe74c3c, // rojo
        2: 0xe67e22, // naranja
        3: 0xf1c40f, // amarillo
        4: 0x2ecc71, // verde claro
        5: 0x27ae60, // verde
    };
    return colors[rating] || 0x95a5a6;
}

function starsString(rating) {
    return "⭐".repeat(rating);
}

// ── Caché temporal de valoraciones pendientes ───────────────────────────────
// Guarda la valoración elegida mientras el usuario escribe el comentario
const pendingRatings = new Map();

// ── Funciones exportadas ────────────────────────────────────────────────────

/**
 * Envía un DM al usuario solicitando una valoración del ticket.
 * @param {import("discord.js").TextChannel} channel - Canal del ticket (no se usa directamente, contexto).
 * @param {import("discord.js").User} user - Usuario que recibirá la solicitud.
 * @param {import("discord.js").Guild} guild - Servidor de origen.
 */
async function sendReviewRequest(channel, user, guild) {
    const embed = new EmbedBuilder()
        .setTitle("📝 ¡Valora tu experiencia!")
        .setDescription(
            `Gracias por contactar con el soporte de **${guild.name}**.\n` +
            "¿Cómo calificarías la atención recibida? Selecciona de 1 a 5 estrellas."
        )
        .setColor(0x3498db)
        .setFooter({ text: guild.name, iconURL: guild.iconURL({ dynamic: true }) })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("review_star_1")
            .setLabel("⭐")
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId("review_star_2")
            .setLabel("⭐⭐")
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId("review_star_3")
            .setLabel("⭐⭐⭐")
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId("review_star_4")
            .setLabel("⭐⭐⭐⭐")
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId("review_star_5")
            .setLabel("⭐⭐⭐⭐⭐")
            .setStyle(ButtonStyle.Success)
    );

    try {
        await user.send({ embeds: [embed], components: [row] });
    } catch {
        // No se pudo enviar DM (DMs cerrados)
        console.log(`[Reviews] No se pudo enviar DM de valoración a ${user.tag}.`);
    }
}

/**
 * Maneja el clic en un botón de estrellas (review_star_1 … review_star_5).
 * Muestra un modal para que el usuario deje un comentario opcional.
 * @param {import("discord.js").ButtonInteraction} interaction
 */
async function handleReviewButton(interaction) {
    const rating = parseInt(interaction.customId.split("_")[2], 10);
    if (isNaN(rating) || rating < 1 || rating > 5) return;

    // Guardar la valoración temporalmente
    pendingRatings.set(interaction.user.id, rating);

    const modal = new ModalBuilder()
        .setCustomId("review_modal")
        .setTitle("Comentario de valoración");

    const commentInput = new TextInputBuilder()
        .setCustomId("review_comment")
        .setLabel("Comentario (opcional)")
        .setPlaceholder("Escribe aquí tu opinión sobre la atención recibida...")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(1000);

    modal.addComponents(new ActionRowBuilder().addComponents(commentInput));

    await interaction.showModal(modal);
}

/**
 * Maneja el envío del modal de comentario (review_modal).
 * Guarda la reseña y la publica en el canal de reseñas.
 * @param {import("discord.js").ModalSubmitInteraction} interaction
 */
async function handleReviewSubmit(interaction) {
    const rating = pendingRatings.get(interaction.user.id);
    if (!rating) {
        return interaction.reply({
            content: "❌ No se encontró tu valoración. Inténtalo de nuevo.",
            flags: MessageFlags.Ephemeral,
        });
    }

    const comment =
        interaction.fields.getTextInputValue("review_comment")?.trim() || "Sin comentario.";

    // Limpiar caché
    pendingRatings.delete(interaction.user.id);

    // Guardar en archivo
    const reviews = loadReviews();
    reviews[interaction.user.id] = {
        rating,
        comment,
        date: new Date().toISOString(),
    };
    saveReviews(reviews);

    // Confirmar al usuario
    await interaction.reply({
        content: `✅ ¡Gracias por tu valoración! Has dado **${starsString(rating)}** (${rating}/5).`,
        flags: MessageFlags.Ephemeral,
    });

    // Desactivar los botones del mensaje original
    try {
        const originalMessage = interaction.message || (await interaction.channel?.messages.fetch(interaction.message?.id).catch(() => null));
        if (originalMessage) {
            const disabledRow = new ActionRowBuilder().addComponents(
                originalMessage.components[0].components.map((btn) =>
                    ButtonBuilder.from(btn).setDisabled(true)
                )
            );
            await originalMessage.edit({ components: [disabledRow] }).catch(() => {});
        }
    } catch {
        // Ignorar si no se puede editar el mensaje original
    }

    // Publicar en el canal de reseñas
    const reviewsChannelId = config.reviewsChannelId;
    if (!reviewsChannelId) return;

    const guild = interaction.client.guilds.cache.first();
    if (!guild) return;

    const reviewChannel = guild.channels.cache.get(reviewsChannelId);
    if (!reviewChannel) return;

    const embed = new EmbedBuilder()
        .setAuthor({
            name: interaction.user.tag,
            iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
        })
        .setTitle("Nueva valoración recibida")
        .setDescription(starsString(rating) + ` **(${rating}/5)**`)
        .addFields({ name: "💬 Comentario", value: comment })
        .setColor(ratingColor(rating))
        .setFooter({ text: `ID: ${interaction.user.id}` })
        .setTimestamp();

    await reviewChannel.send({ embeds: [embed] }).catch(() => {});
}

module.exports = {
    sendReviewRequest,
    handleReviewButton,
    handleReviewSubmit,
};

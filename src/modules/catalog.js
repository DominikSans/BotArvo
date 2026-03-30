const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require("discord.js");

// ── Catálogo de productos ───────────────────────────────────────────────────

const PRODUCTS = [
    {
        name: "Pack de Texturas HD",
        description: "Texturas personalizadas en 64x y 128x para tu servidor.",
        price: "Consultar",
        image: "",
        category: "Texturas",
    },
    {
        name: "Configuración de Plugins",
        description: "Setup completo de plugins esenciales para tu servidor.",
        price: "Consultar",
        image: "",
        category: "Configs",
    },
    {
        name: "Modelos 3D Custom",
        description: "Modelos personalizados para items, bloques o mobs.",
        price: "Consultar",
        image: "",
        category: "Modelos",
    },
    {
        name: "Builds Profesionales",
        description: "Construcciones a medida: spawns, lobbies, arenas.",
        price: "Consultar",
        image: "",
        category: "Builds",
    },
    {
        name: "Pack Completo de Servidor",
        description: "Todo lo que necesitas para lanzar tu servidor de Minecraft.",
        price: "Consultar",
        image: "",
        category: "Packs",
    },
];

// ── Página actual por usuario ───────────────────────────────────────────────

const userPages = new Map();

// ── Utilidades ──────────────────────────────────────────────────────────────

function buildCatalogEmbed(pageIndex) {
    const product = PRODUCTS[pageIndex];

    const embed = new EmbedBuilder()
        .setTitle(`🛍️ ${product.name}`)
        .setDescription(product.description)
        .addFields(
            { name: "💰 Precio", value: product.price, inline: true },
            { name: "📂 Categoría", value: product.category, inline: true }
        )
        .setColor(0xe67e22)
        .setFooter({ text: `Página ${pageIndex + 1} de ${PRODUCTS.length}` })
        .setTimestamp();

    if (product.image) {
        embed.setImage(product.image);
    }

    return embed;
}

function buildCatalogButtons(pageIndex) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("catalog_prev")
            .setLabel("◀️ Anterior")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(pageIndex === 0),
        new ButtonBuilder()
            .setCustomId("catalog_next")
            .setLabel("▶️ Siguiente")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(pageIndex === PRODUCTS.length - 1),
        new ButtonBuilder()
            .setCustomId(`catalog_buy_${pageIndex}`)
            .setLabel("🛒 Comprar")
            .setStyle(ButtonStyle.Success)
    );
}

// ── Funciones exportadas ────────────────────────────────────────────────────

/**
 * Responde al comando `!catalogo` con el catálogo paginado.
 * @param {import("discord.js").Message} message
 */
async function handleCatalogCommand(message) {
    const pageIndex = 0;
    userPages.set(message.author.id, pageIndex);

    const embed = buildCatalogEmbed(pageIndex);
    const row = buildCatalogButtons(pageIndex);

    await message.delete().catch(() => {});
    await message.author.send({ embeds: [embed], components: [row] }).catch(async () => {
        const msg = await message.channel.send({ embeds: [embed], components: [row] });
        setTimeout(() => msg.delete().catch(() => {}), 30_000);
    });
}

/**
 * Maneja los botones de navegación y compra del catálogo.
 * @param {import("discord.js").ButtonInteraction} interaction
 */
async function handleCatalogButton(interaction) {
    const userId = interaction.user.id;
    let currentPage = userPages.get(userId) || 0;

    // ── Botón de compra ─────────────────────────────────────────────────
    if (interaction.customId.startsWith("catalog_buy_")) {
        const productIndex = parseInt(interaction.customId.split("_")[2], 10);
        const product = PRODUCTS[productIndex];

        if (!product) {
            return interaction.reply({
                content: "❌ Producto no encontrado.",
                flags: MessageFlags.Ephemeral,
            });
        }

        return interaction.reply({
            content:
                `🛒 Para comprar **${product.name}**, abre un ticket de ` +
                "**Solicitud de Assets** y menciona el producto que deseas adquirir.",
            flags: MessageFlags.Ephemeral,
        });
    }

    // ── Navegación ──────────────────────────────────────────────────────
    if (interaction.customId === "catalog_prev") {
        currentPage = Math.max(0, currentPage - 1);
    } else if (interaction.customId === "catalog_next") {
        currentPage = Math.min(PRODUCTS.length - 1, currentPage + 1);
    }

    userPages.set(userId, currentPage);

    const embed = buildCatalogEmbed(currentPage);
    const row = buildCatalogButtons(currentPage);

    await interaction.update({ embeds: [embed], components: [row] });
}

module.exports = {
    handleCatalogCommand,
    handleCatalogButton,
};

const { EmbedBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const path = require("path");
const fs = require("fs");

const ordersPath = path.join(__dirname, "..", "data", "orders.json");

// ── Estados válidos y su configuración ──────────────────────────────────────

const STATES = {
    pending: { label: "Pendiente", emoji: "🔴", color: 0xe74c3c, step: 0 },
    in_progress: { label: "En progreso", emoji: "🟡", color: 0xf1c40f, step: 1 },
    review: { label: "En revisión", emoji: "🔵", color: 0x3498db, step: 2 },
    delivered: { label: "Entregado", emoji: "🟢", color: 0x2ecc71, step: 3 },
};

const STATE_KEYS = Object.keys(STATES);
const TOTAL_STEPS = STATE_KEYS.length;

// ── Utilidades ──────────────────────────────────────────────────────────────

function loadOrders() {
    try {
        if (!fs.existsSync(ordersPath)) {
            fs.writeFileSync(ordersPath, JSON.stringify({}, null, 2));
            return {};
        }
        return JSON.parse(fs.readFileSync(ordersPath, "utf-8"));
    } catch {
        return {};
    }
}

function saveOrders(data) {
    fs.writeFileSync(ordersPath, JSON.stringify(data, null, 2));
}

function generateOrderId() {
    return `ORD-${Date.now()}`;
}

/**
 * Construye una barra de progreso visual basada en el estado actual.
 */
function buildProgressBar(status) {
    const state = STATES[status];
    if (!state) return "";

    const totalSegments = 12;
    const filled = Math.round((state.step / (TOTAL_STEPS - 1)) * totalSegments);
    const empty = totalSegments - filled;

    const bar = "━".repeat(filled) + "━".repeat(empty);
    const pointer = state.emoji;

    // Insertar el emoji del estado en la posición correspondiente
    const pos = filled;
    const barArray = bar.split("");
    barArray.splice(pos, 0, ` ${pointer} `);

    return barArray.join("");
}

/**
 * Construye un embed con la información de un pedido.
 */
function buildOrderEmbed(orderId, order, client) {
    const state = STATES[order.status] || STATES.pending;
    const user = client?.users?.cache.get(order.userId);
    const staff = client?.users?.cache.get(order.staffId);

    const statusLine = STATE_KEYS.map((key) => {
        const s = STATES[key];
        const current = key === order.status ? `**${s.emoji} ${s.label}**` : `${s.emoji} ${s.label}`;
        return current;
    }).join(" → ");

    const embed = new EmbedBuilder()
        .setTitle(`📦 Pedido ${orderId}`)
        .setDescription(order.description || "Sin descripción.")
        .addFields(
            { name: "📋 Estado", value: statusLine },
            { name: "📊 Progreso", value: buildProgressBar(order.status) },
            { name: "👤 Cliente", value: user ? `<@${user.id}>` : `\`${order.userId}\``, inline: true },
            { name: "🛠️ Staff", value: staff ? `<@${staff.id}>` : order.staffId ? `\`${order.staffId}\`` : "Sin asignar", inline: true },
            { name: "📅 Creado", value: `<t:${Math.floor(new Date(order.createdAt).getTime() / 1000)}:R>`, inline: true }
        )
        .setColor(state.color)
        .setFooter({ text: `Última actualización: ${new Date(order.updatedAt).toLocaleString("es-ES")}` })
        .setTimestamp();

    return embed;
}

// ── Funciones exportadas ────────────────────────────────────────────────────

/**
 * Crea un nuevo pedido dentro de un ticket.
 * @param {import("discord.js").TextChannel} channel - Canal del ticket.
 * @param {import("discord.js").User} user - Usuario que solicita el pedido.
 * @param {string} description - Descripción del trabajo solicitado.
 * @returns {string} El ID del pedido creado.
 */
async function createOrder(channel, user, description) {
    const orderId = generateOrderId();

    const orders = loadOrders();
    orders[orderId] = {
        userId: user.id,
        staffId: null,
        description: description || "Sin descripción.",
        status: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    saveOrders(orders);

    const embed = buildOrderEmbed(orderId, orders[orderId], channel.client);

    await channel.send({
        content: `✅ Se ha creado un nuevo pedido: **${orderId}**`,
        embeds: [embed],
    });

    return orderId;
}

/**
 * Procesa los comandos `!order` del staff.
 * - `!order status <orderId> <newStatus>`
 * - `!order list`
 * - `!order info <orderId>`
 * @param {import("discord.js").Message} message
 */
async function handleOrderCommand(message) {
    // Verificar permisos
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return message.reply("❌ No tienes permisos para gestionar pedidos.");
    }

    const args = message.content.split(/\s+/).slice(1); // Quitar "!order"
    const subCommand = args[0]?.toLowerCase();

    if (!subCommand) {
        return message.reply(
            "📦 **Comandos de pedidos:**\n" +
            "`!order list` — Lista todos los pedidos activos\n" +
            "`!order info <orderId>` — Muestra info de un pedido\n" +
            "`!order status <orderId> <estado>` — Cambia el estado\n\n" +
            `**Estados válidos:** ${STATE_KEYS.join(", ")}`
        );
    }

    const orders = loadOrders();

    // ── !order list ─────────────────────────────────────────────────────
    if (subCommand === "list") {
        const activeOrders = Object.entries(orders).filter(
            ([, o]) => o.status !== "delivered"
        );

        if (activeOrders.length === 0) {
            return message.reply("📭 No hay pedidos activos en este momento.");
        }

        const lines = activeOrders.map(([id, o]) => {
            const state = STATES[o.status] || STATES.pending;
            return `${state.emoji} **${id}** — ${state.label} — <@${o.userId}>`;
        });

        const embed = new EmbedBuilder()
            .setTitle("📦 Pedidos activos")
            .setDescription(lines.join("\n"))
            .setColor(0x3498db)
            .setFooter({ text: `Total: ${activeOrders.length} pedido(s)` })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    }

    // ── !order info <orderId> ───────────────────────────────────────────
    if (subCommand === "info") {
        const orderId = args[1];
        if (!orderId) {
            return message.reply("❌ Uso: `!order info <orderId>`");
        }

        const order = orders[orderId];
        if (!order) {
            return message.reply(`❌ No se encontró el pedido **${orderId}**.`);
        }

        const embed = buildOrderEmbed(orderId, order, message.client);
        return message.reply({ embeds: [embed] });
    }

    // ── !order status <orderId> <newStatus> ─────────────────────────────
    if (subCommand === "status") {
        const orderId = args[1];
        const newStatus = args[2]?.toLowerCase();

        if (!orderId || !newStatus) {
            return message.reply("❌ Uso: `!order status <orderId> <estado>`");
        }

        const order = orders[orderId];
        if (!order) {
            return message.reply(`❌ No se encontró el pedido **${orderId}**.`);
        }

        if (!STATES[newStatus]) {
            return message.reply(
                `❌ Estado inválido. Estados válidos: ${STATE_KEYS.join(", ")}`
            );
        }

        const oldStatus = order.status;
        order.status = newStatus;
        order.staffId = order.staffId || message.author.id;
        order.updatedAt = new Date().toISOString();
        saveOrders(orders);

        const oldState = STATES[oldStatus];
        const newState = STATES[newStatus];

        const embed = buildOrderEmbed(orderId, order, message.client);

        await message.reply({
            content:
                `📦 Pedido **${orderId}** actualizado: ` +
                `${oldState.emoji} ${oldState.label} → ${newState.emoji} ${newState.label}`,
            embeds: [embed],
        });

        // Notificar al cliente si es posible
        try {
            const client = message.client;
            const targetUser = await client.users.fetch(order.userId).catch(() => null);
            if (targetUser) {
                const dmEmbed = new EmbedBuilder()
                    .setTitle("📦 Actualización de tu pedido")
                    .setDescription(
                        `Tu pedido **${orderId}** ha cambiado de estado:\n` +
                        `${oldState.emoji} ${oldState.label} → ${newState.emoji} ${newState.label}`
                    )
                    .addFields(
                        { name: "📊 Progreso", value: buildProgressBar(newStatus) },
                        { name: "📝 Descripción", value: order.description }
                    )
                    .setColor(newState.color)
                    .setTimestamp();

                await targetUser.send({ embeds: [dmEmbed] }).catch(() => {});
            }
        } catch {
            // No se pudo notificar al usuario
        }
    }
}

/**
 * Maneja botones de actualización de estado de pedidos.
 * CustomId esperado: `order_status_{orderId}_{newStatus}`
 * @param {import("discord.js").ButtonInteraction} interaction
 */
async function handleOrderButton(interaction) {
    // Verificar permisos
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({
            content: "❌ No tienes permisos para gestionar pedidos.",
            flags: MessageFlags.Ephemeral,
        });
    }

    const parts = interaction.customId.split("_");
    // order_status_ORD-xxxxx_newStatus
    const orderId = parts[2];
    const newStatus = parts[3];

    if (!orderId || !newStatus || !STATES[newStatus]) {
        return interaction.reply({
            content: "❌ Acción inválida.",
            flags: MessageFlags.Ephemeral,
        });
    }

    const orders = loadOrders();
    const order = orders[orderId];

    if (!order) {
        return interaction.reply({
            content: `❌ No se encontró el pedido **${orderId}**.`,
            flags: MessageFlags.Ephemeral,
        });
    }

    const oldState = STATES[order.status];
    const newState = STATES[newStatus];

    order.status = newStatus;
    order.staffId = order.staffId || interaction.user.id;
    order.updatedAt = new Date().toISOString();
    saveOrders(orders);

    const embed = buildOrderEmbed(orderId, order, interaction.client);

    await interaction.update({
        content:
            `📦 Pedido **${orderId}** actualizado: ` +
            `${oldState.emoji} ${oldState.label} → ${newState.emoji} ${newState.label}`,
        embeds: [embed],
    });
}

module.exports = {
    createOrder,
    handleOrderCommand,
    handleOrderButton,
};

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");

// ─── Configuración de roles ───────────────────────────────────────────
const AUTOROLES = [
    { roleId: "", label: "Cliente", emoji: "🛒", style: "Primary" },
    { roleId: "", label: "Artista", emoji: "🎨", style: "Primary" },
    { roleId: "", label: "Developer", emoji: "💻", style: "Primary" },
    { roleId: "", label: "Notificaciones", emoji: "🔔", style: "Secondary" },
];

/**
 * Crea el panel de auto-roles con embed y botones.
 * @returns {{ embeds: EmbedBuilder[], components: ActionRowBuilder[] }}
 */
function createAutoRolesPanel() {
    const description = AUTOROLES.map(
        (r) => `${r.emoji} — **${r.label}**`
    ).join("\n");

    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🎭 Roles del Servidor")
        .setDescription(
            "Selecciona los roles que desees. Presiona de nuevo para quitarlo.\n\n" +
                description
        );

    const row = new ActionRowBuilder();

    AUTOROLES.forEach((role, index) => {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`autorole_${index}`)
                .setLabel(role.label)
                .setEmoji(role.emoji)
                .setStyle(ButtonStyle[role.style])
        );
    });

    return { embeds: [embed], components: [row] };
}

/**
 * Maneja el clic de un botón de auto-rol, alternando el rol del usuario.
 * @param {import("discord.js").ButtonInteraction} interaction
 */
async function handleRoleToggle(interaction) {
    const index = parseInt(interaction.customId.split("_")[1], 10);
    const roleConfig = AUTOROLES[index];

    if (!roleConfig) {
        return interaction.reply({
            content: "❌ Rol no encontrado.",
            flags: MessageFlags.Ephemeral,
        });
    }

    if (!roleConfig.roleId) {
        console.warn(
            `[AutoRoles] El rol "${roleConfig.label}" no tiene roleId configurado. Omitiendo.`
        );
        return interaction.reply({
            content: "⚠️ Este rol aún no ha sido configurado por un administrador.",
            flags: MessageFlags.Ephemeral,
        });
    }

    const { guild, member } = interaction;
    const role = guild.roles.cache.get(roleConfig.roleId);

    if (!role) {
        console.warn(
            `[AutoRoles] No se encontró el rol con ID "${roleConfig.roleId}" en el servidor.`
        );
        return interaction.reply({
            content: "❌ El rol no existe en este servidor.",
            flags: MessageFlags.Ephemeral,
        });
    }

    try {
        if (member.roles.cache.has(role.id)) {
            await member.roles.remove(role);
            return interaction.reply({
                content: `✅ Se te ha quitado el rol **${role.name}**.`,
                flags: MessageFlags.Ephemeral,
            });
        } else {
            await member.roles.add(role);
            return interaction.reply({
                content: `✅ Se te ha asignado el rol **${role.name}**.`,
                flags: MessageFlags.Ephemeral,
            });
        }
    } catch (error) {
        console.error(`[AutoRoles] Error al alternar el rol: ${error.message}`);
        return interaction.reply({
            content: "❌ No se pudo modificar tu rol. Verifica los permisos del bot.",
            flags: MessageFlags.Ephemeral,
        });
    }
}

module.exports = { createAutoRolesPanel, handleRoleToggle };

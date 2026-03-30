const config = require("../../config.json");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const { sendLog, createLogEmbed, LogColors, formatDate } = require("./logger");

/**
 * Crea el panel de verificación (embed + botón) para enviar en un canal.
 * @returns {{ embed: EmbedBuilder, button: ActionRowBuilder }}
 */
function createVerificationPanel() {
    const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("✅ Verificación")
        .setDescription(
            "¡Bienvenido al servidor!\n\n" +
            "Para acceder a todos los canales, presiona el botón de abajo " +
            "para verificarte. Una vez verificado, recibirás el rol correspondiente " +
            "y podrás participar en la comunidad."
        )
        .setFooter({ text: "Presiona el botón para verificarte" })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("verify_button")
            .setLabel("Verificarme")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success)
    );

    return { embed, button: row };
}

/**
 * Maneja la interacción del botón de verificación.
 * @param {import("discord.js").ButtonInteraction} interaction
 */
async function handleVerification(interaction) {
    const { member, guild } = interaction;
    const roleId = config.verifiedRoleId;

    if (!roleId) {
        console.error("[Verification] No se ha configurado verifiedRoleId en config.json");
        return interaction.reply({
            content: "⚠️ El sistema de verificación no está configurado correctamente. Contacta a un administrador.",
            flags: MessageFlags.Ephemeral,
        });
    }

    // Comprobar si el usuario ya tiene el rol
    if (member.roles.cache.has(roleId)) {
        return interaction.reply({
            content: "Ya estás verificado.",
            flags: MessageFlags.Ephemeral,
        });
    }

    try {
        await member.roles.add(roleId);

        await interaction.reply({
            content: "✅ Has sido verificado correctamente.",
            flags: MessageFlags.Ephemeral,
        });

        // Enviar log al canal de logs del servidor
        const logEmbed = createLogEmbed({
            title: "✅ Verificación de usuario",
            color: LogColors.MEMBER_UPDATE,
            fields: [
                { name: "Usuario", value: `${member.user.tag} (${member})`, inline: true },
                { name: "ID", value: member.id, inline: true },
                { name: "Fecha", value: formatDate(), inline: true },
            ],
            thumbnail: member.user.displayAvatarURL({ dynamic: true }),
            footer: { text: `ID: ${member.id}` },
        });

        await sendLog(guild, logEmbed, "server");
    } catch (error) {
        console.error("[Verification] Error al verificar usuario:", error.message);
        return interaction.reply({
            content: "❌ Ocurrió un error al verificarte. Contacta a un administrador.",
            flags: MessageFlags.Ephemeral,
        }).catch(() => {});
    }
}

module.exports = {
    createVerificationPanel,
    handleVerification,
};

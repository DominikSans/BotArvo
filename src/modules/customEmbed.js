const { EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

/**
 * Definición del slash command /embed
 */
const embedCommand = new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Crea un embed personalizado en un canal")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
        option
            .setName("canal")
            .setDescription("Canal donde enviar el embed")
            .setRequired(true),
    )
    .addStringOption(option =>
        option
            .setName("titulo")
            .setDescription("Título del embed")
            .setRequired(true),
    )
    .addStringOption(option =>
        option
            .setName("descripcion")
            .setDescription("Descripción del embed (soporta markdown)")
            .setRequired(true),
    )
    .addStringOption(option =>
        option
            .setName("color")
            .setDescription("Color hexadecimal (ej: #FF0000)")
            .setRequired(false),
    )
    .addStringOption(option =>
        option
            .setName("imagen")
            .setDescription("URL de imagen para el embed")
            .setRequired(false),
    )
    .addStringOption(option =>
        option
            .setName("footer")
            .setDescription("Texto del footer")
            .setRequired(false),
    );

/**
 * Maneja la ejecución del slash command /embed
 */
async function handleEmbedSlashCommand(interaction) {
    const channel = interaction.options.getChannel("canal");
    const title = interaction.options.getString("titulo");
    const description = interaction.options.getString("descripcion");
    const rawColor = interaction.options.getString("color");
    const imageURL = interaction.options.getString("imagen");
    const footerText = interaction.options.getString("footer");

    // Parsear color
    let color = 0x5865f2;
    if (rawColor) {
        const cleaned = rawColor.replace(/^#/, "");
        const parsed = parseInt(cleaned, 16);
        if (isNaN(parsed)) {
            return interaction.reply({
                content: "❌ Color inválido. Usa formato hexadecimal: `#FF0000` o `ff0000`.",
                flags: MessageFlags.Ephemeral,
            });
        }
        color = parsed;
    }

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp();

    if (imageURL) embed.setImage(imageURL);
    if (footerText) embed.setFooter({ text: footerText });

    try {
        await channel.send({ embeds: [embed] });
        await interaction.reply({
            content: `✅ Embed enviado a <#${channel.id}>`,
            flags: MessageFlags.Ephemeral,
        });
    } catch (error) {
        console.error("[CustomEmbed] Error al enviar embed:", error);
        await interaction.reply({
            content: "❌ No se pudo enviar el embed. Verifica que el bot tenga permisos en ese canal.",
            flags: MessageFlags.Ephemeral,
        });
    }
}

module.exports = { embedCommand, handleEmbedSlashCommand };

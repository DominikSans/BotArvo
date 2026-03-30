const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const {
    createCategoryMenu,
    createTicket,
    closeTicket,
    confirmCloseTicket,
    claimTicket,
} = require("../modules/tickets");
const { handleVerification } = require("../modules/verification");
const { handleRoleToggle } = require("../modules/autoroles");
const { handleSuggestionVote, handleSuggestionAction } = require("../modules/suggestions");
const { handleGiveawayButton } = require("../modules/giveaways");
const { handleCatalogButton } = require("../modules/catalog");
const { handleReviewButton, handleReviewSubmit } = require("../modules/reviews");
const { handleEmbedSlashCommand } = require("../modules/customEmbed");

module.exports = {
    name: "interactionCreate",
    once: false,
    async execute(interaction) {
        // ═══════════════════════════════════
        // ─── Slash Commands ───
        // ═══════════════════════════════════
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === "embed") {
                await handleEmbedSlashCommand(interaction);
                return;
            }
        }

        const { customId } = interaction;

        // ═══════════════════════════════════
        // ─── Modals ───
        // ═══════════════════════════════════
        if (interaction.isModalSubmit()) {
            if (customId === "review_modal") {
                await handleReviewSubmit(interaction);
                return;
            }
        }

        // ═══════════════════════════════════
        // ─── Select Menus ───
        // ═══════════════════════════════════
        if (interaction.isStringSelectMenu()) {
            if (customId === "ticket_category") {
                const categoryKey = interaction.values[0].replace("ticket_cat_", "");
                await createTicket(interaction, categoryKey);
                return;
            }
        }

        // ═══════════════════════════════════
        // ─── Buttons ───
        // ═══════════════════════════════════
        if (!interaction.isButton()) return;

        // ─── Tickets ───
        if (customId === "ticket_open") {
            const { embed, row } = createCategoryMenu();
            const reply = await interaction.reply({
                embeds: [embed],
                components: [row],
                flags: MessageFlags.Ephemeral,
            });
            setTimeout(() => reply.delete().catch(() => {}), 30_000);
            return;
        }

        if (customId === "ticket_close") {
            await closeTicket(interaction);
            return;
        }

        if (customId === "ticket_confirm_close") {
            await confirmCloseTicket(interaction);
            return;
        }

        if (customId === "ticket_cancel_close") {
            await interaction.update({
                embeds: [],
                components: [],
                content: "❌ Cierre cancelado.",
            });
            setTimeout(() => interaction.deleteReply().catch(() => {}), 3000);
            return;
        }

        if (customId === "ticket_claim") {
            await claimTicket(interaction);
            return;
        }

        // ─── Verificación ───
        if (customId === "verify_button") {
            await handleVerification(interaction);
            return;
        }

        // ─── Auto-roles ───
        if (customId.startsWith("autorole_")) {
            await handleRoleToggle(interaction);
            return;
        }

        // ─── Sugerencias ───
        if (customId.startsWith("suggestion_up_") || customId.startsWith("suggestion_down_")) {
            await handleSuggestionVote(interaction);
            return;
        }

        if (customId.startsWith("suggestion_manage_") || customId.startsWith("suggestion_approve_") || customId.startsWith("suggestion_reject_")) {
            await handleSuggestionAction(interaction);
            return;
        }

        // ─── Giveaways ───
        if (customId.startsWith("giveaway_join_")) {
            await handleGiveawayButton(interaction);
            return;
        }

        // ─── Catálogo ───
        if (customId.startsWith("catalog_")) {
            await handleCatalogButton(interaction);
            return;
        }

        // ─── Reviews ───
        if (customId.startsWith("review_star_")) {
            await handleReviewButton(interaction);
            return;
        }
    },
};

const { processMessage } = require("../modules/moderation");
const { checkSpam } = require("../modules/antiSpam");
const { checkAutomod } = require("../modules/automod");
const { checkSlowmode } = require("../modules/smartSlowmode");
const { createTicketPanel } = require("../modules/tickets");
const { createVerificationPanel } = require("../modules/verification");
const { createAutoRolesPanel } = require("../modules/autoroles");
const { handleSuggestion } = require("../modules/suggestions");
const { addXP, handleLeaderboard, handleRank } = require("../modules/levels");
const { handleGiveawayCommand } = require("../modules/giveaways");
const { handleCatalogCommand } = require("../modules/catalog");
const { handlePurge } = require("../modules/purge");
const { handleServerInfo, handleUserInfo, handleAvatar, handleHelp } = require("../modules/utility");
const { handlePlay, handleSkip, handleStop, handleQueue, handlePause, handleResume, handleNowPlaying, handleFilter, handleFav, handleFavList, handleFavPlay, handleFavDel, handleLyrics } = require("../modules/music");
const { handleWarn, handleWarns, handleClearWarns, handleTempban, handleTempmute, handleBlacklist, handleNote } = require("../modules/modAdvanced");
const { PermissionFlagsBits, MessageFlags, ChannelType } = require("discord.js");
const config = require("../../config.json");

const USER_CMD_CHANNEL = "1487806637883523163";

function restrictToChannel(message) {
    if (message.channel.id !== USER_CMD_CHANNEL) {
        message.reply(`❌ Este comando solo funciona en <#${USER_CMD_CHANNEL}>.`).then(m => {
            setTimeout(() => { m.delete().catch(() => {}); message.delete().catch(() => {}); }, 3000);
        });
        return true;
    }
    return false;
}

module.exports = {
    name: "messageCreate",
    once: false,
    async execute(message) {
        if (message.author.bot || !message.guild) return;

        // ═══════════════════════════════════════════
        // ─── COMANDOS DE ADMINISTRADOR ───
        // ═══════════════════════════════════════════

        if (message.content === "!setup-tickets") {
            if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return message.reply("❌ Solo administradores.").then(m => setTimeout(() => m.delete().catch(() => {}), 3000));
            }
            const { container, attachment } = createTicketPanel();
            const opts = { components: [container], flags: MessageFlags.IsComponentsV2 };
            if (attachment) opts.files = [attachment];
            await message.channel.send(opts);
            await message.delete().catch(() => {});
            return;
        }

        if (message.content === "!setup-verify") {
            if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return message.reply("❌ Solo administradores.").then(m => setTimeout(() => m.delete().catch(() => {}), 3000));
            }
            const { embed, button } = createVerificationPanel();
            await message.channel.send({ embeds: [embed], components: [button] });
            await message.delete().catch(() => {});
            return;
        }

        if (message.content === "!setup-verify-perms") {
            if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return message.reply("❌ Solo administradores.").then(m => setTimeout(() => m.delete().catch(() => {}), 3000));
            }
            const verifyChannelId = "1487925615280521246";
            const verifiedRoleId = config.verifiedRoleId;
            if (!verifiedRoleId) return message.reply("❌ No hay `verifiedRoleId` en config.json.");
            const status = await message.reply("⏳ Configurando permisos...");
            const guild = message.guild;
            let updated = 0;
            for (const [, channel] of guild.channels.cache) {
                if (channel.type === ChannelType.GuildCategory || channel.isThread()) continue;
                try {
                    if (channel.id === verifyChannelId) {
                        await channel.permissionOverwrites.edit(guild.id, { ViewChannel: true, SendMessages: false, AddReactions: false });
                        await channel.permissionOverwrites.edit(verifiedRoleId, { ViewChannel: true });
                    } else {
                        await channel.permissionOverwrites.edit(guild.id, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(verifiedRoleId, { ViewChannel: true, SendMessages: true });
                    }
                    updated++;
                } catch {}
            }
            await status.edit(`✅ Permisos configurados en **${updated}** canales.`);
            await message.delete().catch(() => {});
            return;
        }

        if (message.content === "!setup-roles") {
            if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return message.reply("❌ Solo administradores.").then(m => setTimeout(() => m.delete().catch(() => {}), 3000));
            }
            const { embeds, components } = createAutoRolesPanel();
            await message.channel.send({ embeds, components });
            await message.delete().catch(() => {});
            return;
        }

        // ─── Purge ───
        if (message.content.startsWith("!purge")) { await handlePurge(message); return; }

        // ─── Giveaway ───
        if (message.content.startsWith("!giveaway ")) { await handleGiveawayCommand(message); return; }

        // ═══════════════════════════════════════════
        // ─── MODERACIÓN AVANZADA ───
        // ═══════════════════════════════════════════

        if (message.content.startsWith("!warn ")) { await handleWarn(message); return; }
        if (message.content.startsWith("!warns")) { await handleWarns(message); return; }
        if (message.content.startsWith("!clearwarns")) { await handleClearWarns(message); return; }
        if (message.content.startsWith("!tempban ")) { await handleTempban(message); return; }
        if (message.content.startsWith("!tempmute ")) { await handleTempmute(message); return; }
        if (message.content.startsWith("!blacklist")) { await handleBlacklist(message); return; }
        if (message.content.startsWith("!note ") || message.content.startsWith("!notes")) { await handleNote(message); return; }

        // ═══════════════════════════════════════════
        // ─── COMANDOS DE USUARIO (canal restringido) ───
        // ═══════════════════════════════════════════

        if (message.content === "!catalogo") { if (restrictToChannel(message)) return; await handleCatalogCommand(message); return; }
        if (message.content === "!top") { if (restrictToChannel(message)) return; await handleLeaderboard(message); return; }
        if (message.content === "!rank" || message.content === "!nivel") { if (restrictToChannel(message)) return; await handleRank(message); return; }
        if (message.content === "!serverinfo") { if (restrictToChannel(message)) return; await handleServerInfo(message); return; }
        if (message.content.startsWith("!userinfo")) { if (restrictToChannel(message)) return; await handleUserInfo(message); return; }
        if (message.content.startsWith("!avatar")) { if (restrictToChannel(message)) return; await handleAvatar(message); return; }
        if (message.content === "!help") { if (restrictToChannel(message)) return; await handleHelp(message); return; }

        // ═══════════════════════════════════════════
        // ─── MÚSICA ───
        // ═══════════════════════════════════════════

        if (message.content.startsWith("!play ")) { await handlePlay(message); return; }
        if (message.content === "!skip") { await handleSkip(message); return; }
        if (message.content === "!stop") { await handleStop(message); return; }
        if (message.content === "!queue") { await handleQueue(message); return; }
        if (message.content === "!pause") { await handlePause(message); return; }
        if (message.content === "!resume") { await handleResume(message); return; }
        if (message.content === "!np") { await handleNowPlaying(message); return; }
        if (message.content.startsWith("!filter")) { await handleFilter(message); return; }
        if (message.content === "!fav") { await handleFav(message); return; }
        if (message.content === "!favlist") { await handleFavList(message); return; }
        if (message.content.startsWith("!favplay")) { await handleFavPlay(message); return; }
        if (message.content.startsWith("!favdel")) { await handleFavDel(message); return; }
        if (message.content === "!lyrics" || message.content.startsWith("!lyrics ")) { await handleLyrics(message); return; }

        // ═══════════════════════════════════════════
        // ─── SUGERENCIAS ───
        // ═══════════════════════════════════════════

        if (config.suggestionsChannelId && message.channel.id === config.suggestionsChannelId) {
            await handleSuggestion(message);
            return;
        }

        // ═══════════════════════════════════════════
        // ─── FILTROS DE MODERACIÓN ───
        // ═══════════════════════════════════════════

        const wasFiltered = await processMessage(message);
        if (wasFiltered) return;

        const wasAutomodded = await checkAutomod(message);
        if (wasAutomodded) return;

        const wasSpam = await checkSpam(message);
        if (wasSpam) return;

        // ─── Slowmode inteligente ───
        await checkSlowmode(message);

        // ─── Sistema de niveles (XP) ───
        await addXP(message);
    },
};

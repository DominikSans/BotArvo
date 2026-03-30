const { EmbedBuilder, ChannelType } = require("discord.js");

/**
 * !serverinfo — Información del servidor
 * @param {import("discord.js").Message} message
 */
async function handleServerInfo(message) {
  const { guild } = message;
  await guild.members.fetch();

  const totalMembers = guild.memberCount;
  const onlineMembers = guild.members.cache.filter(
    (m) => m.presence?.status && m.presence.status !== "offline"
  ).size;
  const botCount = guild.members.cache.filter((m) => m.user.bot).size;

  const textChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).size;
  const voiceChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice).size;

  const owner = await guild.fetchOwner();

  const verificationLevels = {
    0: "Ninguno",
    1: "Bajo",
    2: "Medio",
    3: "Alto",
    4: "Muy alto",
  };

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(guild.name)
    .setThumbnail(guild.iconURL({ dynamic: true, size: 512 }))
    .addFields(
      { name: "Nombre", value: guild.name, inline: true },
      { name: "Owner", value: `${owner.user.tag}`, inline: true },
      {
        name: "Miembros",
        value: `Total: **${totalMembers}**\nEn línea: **${onlineMembers}**\nBots: **${botCount}**`,
        inline: true,
      },
      {
        name: "Canales",
        value: `Texto: **${textChannels}**\nVoz: **${voiceChannels}**`,
        inline: true,
      },
      { name: "Roles", value: `**${guild.roles.cache.size}**`, inline: true },
      {
        name: "Fecha de creación",
        value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`,
        inline: true,
      },
      {
        name: "Boosts",
        value: `Nivel: **${guild.premiumTier}** — Boosts: **${guild.premiumSubscriptionCount || 0}**`,
        inline: true,
      },
      {
        name: "Nivel de verificación",
        value: verificationLevels[guild.verificationLevel] || "Desconocido",
        inline: true,
      }
    )
    .setFooter({ text: `ID: ${guild.id}` })
    .setTimestamp();

  message.channel.send({ embeds: [embed] });
}

/**
 * !userinfo — Información de un usuario
 * @param {import("discord.js").Message} message
 */
async function handleUserInfo(message) {
  const target = message.mentions.members.first() || message.member;

  const roles =
    target.roles.cache
      .filter((r) => r.id !== message.guild.id)
      .sort((a, b) => b.position - a.position)
      .map((r) => `${r}`)
      .join(", ") || "Ninguno";

  const boostStatus = target.premiumSince
    ? `Boosteando desde <t:${Math.floor(target.premiumSinceTimestamp / 1000)}:R>`
    : "No está boosteando";

  const color = target.displayHexColor !== "#000000" ? target.displayColor : 0x5865f2;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`Información de ${target.user.tag}`)
    .setThumbnail(target.user.displayAvatarURL({ dynamic: true, size: 512 }))
    .addFields(
      { name: "Username", value: `${target.user.tag}`, inline: true },
      { name: "ID", value: `${target.id}`, inline: true },
      {
        name: "Cuenta creada",
        value: `<t:${Math.floor(target.user.createdTimestamp / 1000)}:F>`,
        inline: true,
      },
      {
        name: "Se unió al servidor",
        value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:F>`,
        inline: true,
      },
      { name: "Roles", value: roles },
      { name: "Boost", value: boostStatus, inline: true }
    )
    .setTimestamp();

  message.channel.send({ embeds: [embed] });
}

/**
 * !avatar — Muestra el avatar de un usuario
 * @param {import("discord.js").Message} message
 */
async function handleAvatar(message) {
  const target = message.mentions.users.first() || message.author;

  const avatarURL = (fmt, size) =>
    target.displayAvatarURL({ extension: fmt, size });

  const png = avatarURL("png", 4096);
  const jpg = avatarURL("jpg", 4096);
  const webp = avatarURL("webp", 4096);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`Avatar de ${target.tag}`)
    .setImage(target.displayAvatarURL({ dynamic: true, size: 4096 }))
    .setDescription(`[PNG](${png}) | [JPG](${jpg}) | [WEBP](${webp})`)
    .setTimestamp();

  message.channel.send({ embeds: [embed] });
}

/**
 * !help — Lista de comandos del bot
 * @param {import("discord.js").Message} message
 */
async function handleHelp(message) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📋 Comandos del Bot")
    .addFields(
      {
        name: "🎵 Música (YouTube · Spotify · SoundCloud · Links directos)",
        value: "`!play` `!skip` `!stop` `!queue` `!pause` `!resume` `!np`",
      },
      {
        name: "📊 Niveles",
        value: "`!rank` `!top` (solo en canal específico)",
      },
      {
        name: "🛒 Tienda",
        value: "`!catalogo` (solo en canal específico)",
      },
      {
        name: "🛡️ Admin",
        value: "`!purge` `!setup-tickets` `!setup-verify` `!setup-roles` `!giveaway` `/embed`",
      },
      {
        name: "ℹ️ Utilidad",
        value: "`!serverinfo` `!userinfo` `!avatar` `!help`",
      }
    )
    .setFooter({ text: "ArvoStudios Bot" })
    .setTimestamp();

  message.channel.send({ embeds: [embed] });
}

module.exports = { handleServerInfo, handleUserInfo, handleAvatar, handleHelp };

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, MessageFlags } = require("discord.js");
const path = require("path");
const fs = require("fs");

const DATA_PATH = path.join(__dirname, "..", "data", "giveaways.json");

/** @type {Map<string, { channelId: string, guildId: string, endsAt: number, prize: string, winners: number, participants: Set<string> }>} */
const activeGiveaways = new Map();

let loaded = false;

// --- Persistencia ---

function loadGiveaways() {
  if (loaded) return;
  loaded = true;

  try {
    if (!fs.existsSync(DATA_PATH)) return;

    const raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));

    for (const [messageId, data] of Object.entries(raw)) {
      activeGiveaways.set(messageId, {
        channelId: data.channelId,
        guildId: data.guildId,
        endsAt: data.endsAt,
        prize: data.prize,
        winners: data.winners,
        participants: new Set(data.participants || []),
      });
    }

    console.log(`[Giveaways] Cargados ${activeGiveaways.size} sorteo(s) desde disco.`);
  } catch (error) {
    console.error("[Giveaways] Error al cargar sorteos:", error);
  }
}

function saveGiveaways() {
  try {
    const dir = path.dirname(DATA_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const obj = {};
    for (const [messageId, data] of activeGiveaways) {
      obj[messageId] = {
        channelId: data.channelId,
        guildId: data.guildId,
        endsAt: data.endsAt,
        prize: data.prize,
        winners: data.winners,
        participants: [...data.participants],
      };
    }

    fs.writeFileSync(DATA_PATH, JSON.stringify(obj, null, 2), "utf-8");
  } catch (error) {
    console.error("[Giveaways] Error al guardar sorteos:", error);
  }
}

// --- Utilidades ---

function parseDuration(str) {
  const match = str.match(/^(\d+)\s*(m|h|d)$/i);
  if (!match) return null;

  const amount = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  const multipliers = { m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * multipliers[unit];
}

function buildGiveawayEmbed(prize, endsAt, participantCount, winnerCount, ended = false) {
  const embed = new EmbedBuilder()
    .setTitle("🎉 GIVEAWAY")
    .setDescription(prize)
    .setColor(ended ? 0x95a5a6 : 0xfee75c)
    .addFields(
      { name: "Termina", value: `<t:${Math.floor(endsAt / 1000)}:R>`, inline: true },
      { name: "Participantes", value: `${participantCount}`, inline: true },
      { name: "Ganadores", value: `${winnerCount}`, inline: true }
    )
    .setFooter({ text: "Reacciona para participar" })
    .setTimestamp();

  return embed;
}

function buildButton(messageId, disabled = false) {
  const button = new ButtonBuilder()
    .setCustomId(`giveaway_join_${messageId}`)
    .setLabel("Participar 🎉")
    .setStyle(ButtonStyle.Primary)
    .setDisabled(disabled);

  return new ActionRowBuilder().addComponents(button);
}

function selectWinners(participants, count) {
  const arr = [...participants];
  const winners = [];

  const picks = Math.min(count, arr.length);
  for (let i = 0; i < picks; i++) {
    const idx = Math.floor(Math.random() * arr.length);
    winners.push(arr.splice(idx, 1)[0]);
  }

  return winners;
}

// --- Comando !giveaway ---

async function handleGiveawayCommand(message) {
  if (!message.content.startsWith("!giveaway")) return;

  loadGiveaways();

  if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return message.reply("❌ Necesitas permisos de **Administrador** para crear sorteos.");
  }

  const args = message.content.slice("!giveaway".length).trim();
  const parts = args.split(" | ");

  if (parts.length < 3) {
    const usage = new EmbedBuilder()
      .setTitle("📋 Uso del comando !giveaway")
      .setDescription("```\n!giveaway <duración> | <ganadores> | <premio>\n```")
      .addFields(
        { name: "Parámetros", value:
          "• `duración` — Tiempo del sorteo: `1m`, `1h`, `1d`, etc.\n" +
          "• `ganadores` — Número de ganadores\n" +
          "• `premio` — Nombre del premio"
        },
        { name: "Ejemplo", value: "`!giveaway 1h | 2 | Nitro Classic`" }
      )
      .setColor(0xfee75c);

    return message.reply({ embeds: [usage] });
  }

  const durationStr = parts[0].trim();
  const winnerCount = parseInt(parts[1].trim());
  const prize = parts[2].trim();

  const durationMs = parseDuration(durationStr);
  if (!durationMs) {
    return message.reply("❌ Duración inválida. Usa formatos como `1m`, `1h`, `1d`.");
  }

  if (isNaN(winnerCount) || winnerCount < 1) {
    return message.reply("❌ El número de ganadores debe ser un número mayor a 0.");
  }

  if (!prize) {
    return message.reply("❌ Debes especificar un premio.");
  }

  const endsAt = Date.now() + durationMs;

  const embed = buildGiveawayEmbed(prize, endsAt, 0, winnerCount);
  const sent = await message.channel.send({
    embeds: [embed],
    components: [buildButton("placeholder")],
  });

  // Actualizar botón con el ID real del mensaje
  await sent.edit({
    components: [buildButton(sent.id)],
  });

  activeGiveaways.set(sent.id, {
    channelId: sent.channel.id,
    guildId: message.guild.id,
    endsAt,
    prize,
    winners: winnerCount,
    participants: new Set(),
  });

  saveGiveaways();

  const reply = await message.reply(`✅ Sorteo de **${prize}** creado! Termina <t:${Math.floor(endsAt / 1000)}:R>`);
  setTimeout(() => reply.delete().catch(() => {}), 5000);
}

// --- Botón de participación ---

async function handleGiveawayButton(interaction) {
  loadGiveaways();

  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith("giveaway_join_")) return;

  const messageId = interaction.customId.replace("giveaway_join_", "");
  const giveaway = activeGiveaways.get(messageId);

  if (!giveaway) {
    return interaction.reply({ content: "❌ Este sorteo ya no está activo.", flags: MessageFlags.Ephemeral });
  }

  if (Date.now() >= giveaway.endsAt) {
    return interaction.reply({ content: "❌ Este sorteo ya ha terminado.", flags: MessageFlags.Ephemeral });
  }

  const userId = interaction.user.id;

  if (giveaway.participants.has(userId)) {
    giveaway.participants.delete(userId);
    saveGiveaways();

    // Actualizar embed con nuevo conteo
    const embed = buildGiveawayEmbed(giveaway.prize, giveaway.endsAt, giveaway.participants.size, giveaway.winners);
    await interaction.message.edit({ embeds: [embed] }).catch(() => {});

    return interaction.reply({ content: "❌ Te has salido del sorteo.", flags: MessageFlags.Ephemeral });
  }

  giveaway.participants.add(userId);
  saveGiveaways();

  // Actualizar embed con nuevo conteo
  const embed = buildGiveawayEmbed(giveaway.prize, giveaway.endsAt, giveaway.participants.size, giveaway.winners);
  await interaction.message.edit({ embeds: [embed] }).catch(() => {});

  return interaction.reply({ content: "✅ Te has unido al sorteo. ¡Buena suerte!", flags: MessageFlags.Ephemeral });
}

// --- Verificación de sorteos expirados ---

async function checkGiveaways(client) {
  loadGiveaways();

  const now = Date.now();

  for (const [messageId, giveaway] of activeGiveaways) {
    if (now < giveaway.endsAt) continue;

    // Sorteo terminado
    try {
      const guild = client.guilds.cache.get(giveaway.guildId);
      if (!guild) { activeGiveaways.delete(messageId); continue; }

      const channel = guild.channels.cache.get(giveaway.channelId);
      if (!channel) { activeGiveaways.delete(messageId); continue; }

      const msg = await channel.messages.fetch(messageId).catch(() => null);

      if (giveaway.participants.size === 0) {
        // Sin participantes
        if (msg) {
          const embed = buildGiveawayEmbed(giveaway.prize, giveaway.endsAt, 0, giveaway.winners, true);
          embed.addFields({ name: "Resultado", value: "No hubo participantes." });
          await msg.edit({ embeds: [embed], components: [buildButton(messageId, true)] });
        }

        await channel.send("🎉 El sorteo de **" + giveaway.prize + "** ha terminado. No hubo participantes.");
      } else {
        // Seleccionar ganadores
        const winners = selectWinners(giveaway.participants, giveaway.winners);
        const winnerMentions = winners.map((id) => `<@${id}>`).join(", ");

        if (msg) {
          const embed = buildGiveawayEmbed(giveaway.prize, giveaway.endsAt, giveaway.participants.size, giveaway.winners, true);
          embed.addFields({ name: "🏆 Ganadores", value: winnerMentions });
          await msg.edit({ embeds: [embed], components: [buildButton(messageId, true)] });
        }

        await channel.send(`🎉 Felicidades! ${winnerMentions} ganaron **${giveaway.prize}**!`);
      }
    } catch (error) {
      console.error(`[Giveaways] Error al finalizar sorteo ${messageId}:`, error);
    }

    activeGiveaways.delete(messageId);
  }

  saveGiveaways();
}

module.exports = { handleGiveawayCommand, handleGiveawayButton, checkGiveaways };

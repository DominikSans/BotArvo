const { PermissionFlagsBits, EmbedBuilder } = require("discord.js");

/**
 * Maneja el comando !purge
 * @param {import("discord.js").Message} message
 */
async function handlePurge(message) {
  if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return message.reply("❌ Necesitas permisos de **Administrador** para usar este comando.");
  }

  const args = message.content.split(/\s+/);
  const arg = args[1];

  if (!arg) {
    return message.reply("📌 **Uso:** `!purge <1-100>` o `!purge all`");
  }

  // --- !purge all ---
  if (arg.toLowerCase() === "all") {
    let totalDeleted = 0;
    const maxMessages = 500;

    while (totalDeleted < maxMessages) {
      const fetched = await message.channel.messages.fetch({ limit: 100 });
      if (fetched.size === 0) break;

      const deleted = await message.channel.bulkDelete(fetched, true);
      totalDeleted += deleted.size;

      if (deleted.size < fetched.size || deleted.size === 0) break;
    }

    const confirm = await message.channel.send(`🗑️ Se eliminaron **${totalDeleted}** mensajes.`);
    setTimeout(() => confirm.delete().catch(() => {}), 3000);
    return;
  }

  // --- !purge <number> ---
  const amount = parseInt(arg);

  if (isNaN(amount) || amount < 1 || amount > 100) {
    return message.reply("❌ Debes indicar un número entre **1** y **100**.\n📌 **Uso:** `!purge <1-100>` o `!purge all`");
  }

  const deleted = await message.channel.bulkDelete(amount + 1, true);
  const confirm = await message.channel.send(`🗑️ Se eliminaron **${deleted.size - 1}** mensajes.`);
  setTimeout(() => confirm.delete().catch(() => {}), 3000);
}

module.exports = { handlePurge };

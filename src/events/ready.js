const { checkGiveaways } = require("../modules/giveaways");
const { setupStatsInterval } = require("../modules/serverStats");
const { setupStatusInterval } = require("../modules/botStatus");
const { embedCommand } = require("../modules/customEmbed");
const { initLavaShark } = require("../modules/music");

module.exports = {
    name: "clientReady",
    once: true,
    async execute(client) {
        console.log(`✅ Bot encendido como: ${client.user.tag}`);
        console.log(`📡 Conectado a ${client.guilds.cache.size} servidor(es)`);

        // Registrar slash commands
        try {
            await client.application.commands.set([embedCommand.toJSON()]);
            console.log("📋 Slash commands registrados: /embed");
        } catch (err) {
            console.error("[Ready] Error al registrar slash commands:", err.message);
        }

        // Estado del bot
        client.user.setPresence({
            activities: [{ name: "🛡️ Moderando el servidor", type: 3 }],
            status: "online",
        });

        // Iniciar verificación de giveaways cada 30s
        setInterval(() => checkGiveaways(client), 30_000);

        // Iniciar actualización de stats del servidor
        setupStatsInterval(client);

        // Iniciar panel de estado del bot (canal 1320609986560135230)
        setupStatusInterval(client);

        // Iniciar LavaShark para música
        initLavaShark(client);

        console.log("📦 Módulos cargados: tickets, verificación, autoroles, niveles, sugerencias, giveaways, catálogo, reviews, stats, automod, transcripciones");
    },
};

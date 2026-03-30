require("./setup-config"); // Generar config.json desde env vars si no existe
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const config = require("./config.json");
const { loadEvents } = require("./src/handlers/eventHandler");
const express = require("express");

// Cliente con todos los intents necesarios para moderación y logging
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.GuildMember,
    ],
});

// Cargar todos los eventos de forma modular
loadEvents(client);

// Servidor Express para mantener el bot activo (hosting 24/7)
const app = express();
app.get("/", (req, res) => res.send("Bot funcionando"));
app.listen(8000, () => console.log("[Express] Servidor activo en puerto 8000"));

// Manejo de errores global
process.on("unhandledRejection", (error) => {
    console.error("[Error] Promesa no manejada:", error);
});

process.on("uncaughtException", (error) => {
    console.error("[Error] Excepción no capturada:", error);
});

// Login
client.login(config.token);

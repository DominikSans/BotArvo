/**
 * Genera config.json desde variables de entorno (para Render/hosting)
 * Si config.json ya existe, no hace nada.
 */
const fs = require("fs");
const path = require("path");

const configPath = path.join(__dirname, "config.json");

if (!fs.existsSync(configPath)) {
    console.log("[Setup] config.json no encontrado, generando desde variables de entorno...");

    const config = {
        token: process.env.DISCORD_TOKEN || "",
        token2: "",
        logChannelId: process.env.LOG_CHANNEL_ID || "",
        messageLogChannelId: process.env.MESSAGE_LOG_CHANNEL_ID || "",
        welcomeChannelId: process.env.WELCOME_CHANNEL_ID || "",
        goodbyeChannelId: process.env.GOODBYE_CHANNEL_ID || "",
        autoRoleId: process.env.AUTO_ROLE_ID || "",
        ticketCategoryId: process.env.TICKET_CATEGORY_ID || "",
        staffRoleId: process.env.STAFF_ROLE_ID || "",
        ticketBannerURL: "banner_tickets.png",
        studioName: process.env.STUDIO_NAME || "ArvoStudios",
        verifiedRoleId: process.env.VERIFIED_ROLE_ID || "",
        suggestionsChannelId: process.env.SUGGESTIONS_CHANNEL_ID || "",
        reviewsChannelId: process.env.REVIEWS_CHANNEL_ID || "",
        levelUpChannelId: process.env.LEVEL_UP_CHANNEL_ID || "",
        spotifyClientId: process.env.SPOTIFY_CLIENT_ID || "",
        spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET || "",
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
    console.log("[Setup] config.json generado correctamente.");
} else {
    console.log("[Setup] config.json encontrado.");
}

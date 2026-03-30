const fs = require("fs");
const path = require("path");

/**
 * Carga y registra todos los eventos desde la carpeta src/events
 */
function loadEvents(client) {
    const eventsPath = path.join(__dirname, "..", "events");
    const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith(".js"));

    let loaded = 0;

    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath);

        if (!event.name) {
            console.warn(`[EventHandler] Evento sin nombre: ${file}`);
            continue;
        }

        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args));
        } else {
            client.on(event.name, (...args) => event.execute(...args));
        }

        loaded++;
    }

    console.log(`[EventHandler] ${loaded} eventos cargados.`);
}

module.exports = { loadEvents };

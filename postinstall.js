/**
 * Postinstall: descarga yt-dlp si no existe (para Render/Linux)
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const isWindows = process.platform === "win32";
const binary = isWindows ? "yt-dlp.exe" : "yt-dlp";
const binaryPath = path.join(__dirname, binary);

if (fs.existsSync(binaryPath)) {
    console.log(`[Postinstall] ${binary} ya existe, saltando descarga.`);
    process.exit(0);
}

console.log(`[Postinstall] Descargando ${binary}...`);

try {
    const url = isWindows
        ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
        : "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";

    execSync(`curl -L -o "${binaryPath}" "${url}"`, { stdio: "inherit" });

    if (!isWindows) {
        execSync(`chmod +x "${binaryPath}"`);
    }

    console.log(`[Postinstall] ${binary} descargado correctamente.`);
} catch (error) {
    console.error(`[Postinstall] Error al descargar ${binary}:`, error.message);
}

// Crear archivos de datos si no existen
const dataDir = path.join(__dirname, "src", "data");
const dataFiles = ["levels.json", "giveaways.json", "reviews.json", "orders.json", "moderation.json", "favorites.json"];

for (const file of dataFiles) {
    const filePath = path.join(dataDir, file);
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, "{}", "utf8");
        console.log(`[Postinstall] Creado ${file}`);
    }
}

const { AttachmentBuilder } = require("discord.js");
const Canvas = require("@napi-rs/canvas");
const { request } = require("undici");
const config = require("../../config.json");
const { formatRelative } = require("./logger");
const path = require("path");
const fs = require("fs");

// ─── Registrar fuente Minecraftory ──────────────────────────────────────────
const FONT_PATH = path.join(__dirname, "..", "assets", "fonts", "Minecraftory.ttf");
if (fs.existsSync(FONT_PATH)) {
    Canvas.GlobalFonts.registerFromPath(FONT_PATH, "Minecraftory");
}

const ASSETS_PATH = path.join(__dirname, "..", "assets");

// ─── Generar imagen con Canvas ──────────────────────────────────────────────

async function generateCard(type, member) {
    // Detectar dimensiones reales del fondo
    const bgFile = type === "welcome" ? "bg_welcome.png" : "bg_goodbye.png";
    const bgPath = path.join(ASSETS_PATH, bgFile);

    let bgImage = null;
    if (fs.existsSync(bgPath)) {
        bgImage = await Canvas.loadImage(bgPath);
    }

    // Escalar el canvas a 1336x200 (mitad del bg) para que el texto se vea grande en Discord
    const width = bgImage ? Math.round(bgImage.width / 2) : 1336;
    const height = bgImage ? Math.round(bgImage.height / 2) : 200;
    const canvas = Canvas.createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // 1) Fondo — dibujar a tamaño completo sin deformar
    if (bgImage) {
        ctx.drawImage(bgImage, 0, 0, width, height);
    } else {
        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, "#1a1a2e");
        gradient.addColorStop(1, "#16213e");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    }

    // 2) Overlay sutil (5%)
    ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
    ctx.fillRect(0, 0, width, height);

    // 3) Barra lateral de acento
    ctx.fillStyle = "#A62F37";
    ctx.fillRect(0, 0, 8, height);

    // ─── Escalar tamaños proporcionalmente al canvas ───
    const scale = height / 200; // factor de escala basado en altura reducida

    // 4) Avatar circular — lado derecho con margen
    const avatarSize = Math.round(160 * scale);
    const avatarMargin = Math.round(50 * scale);
    const avatarX = width - avatarSize / 2 - avatarMargin;
    const avatarY = height / 2;

    // Fondo oscuro detrás del avatar para contraste
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarSize / 2 + 8, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fill();

    // Borde del avatar
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarSize / 2 + 4, 0, Math.PI * 2);
    ctx.fillStyle = "#A62F37";
    ctx.fill();

    // Clip circular + dibujar avatar
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.save();
    ctx.clip();

    try {
        const { body } = await request(member.user.displayAvatarURL({ extension: "png", size: 512 }));
        const avatar = await Canvas.loadImage(await body.arrayBuffer());
        ctx.drawImage(avatar, avatarX - avatarSize / 2, avatarY - avatarSize / 2, avatarSize, avatarSize);
    } catch {
        ctx.fillStyle = "#2b2d31";
        ctx.fillRect(avatarX - avatarSize / 2, avatarY - avatarSize / 2, avatarSize, avatarSize);
    }

    ctx.restore();

    // 5) Zona de texto — posición diferente para welcome vs goodbye
    const textAreaLeft = 30;
    const textAreaRight = avatarX - avatarSize / 2 - 30;
    const textOffset = type === "welcome" ? 0.64 : 0.63;
    const textCenterX = textAreaLeft + (textAreaRight - textAreaLeft) * textOffset;

    // Sombra de texto para legibilidad
    ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    // Título: BIENVENIDO / SALIENDO
    const titleText = type === "welcome" ? "BIENVENIDO" : "SALIENDO";
    const titleSize = Math.round(80 * scale);
    ctx.font = `${titleSize}px Minecraftory`;
    ctx.fillStyle = "#F0EAD8";
    ctx.textAlign = "center";
    ctx.fillText(titleText, textCenterX, height / 2 - 15 * scale);

    // Username
    const username = member.user.username;
    let userSize = Math.round(48 * scale);
    ctx.font = `${userSize}px Minecraftory`;
    while (ctx.measureText(username).width > (textAreaRight - textAreaLeft) * 0.85 && userSize > 20) {
        userSize -= 2;
        ctx.font = `${userSize}px Minecraftory`;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillText(username, textCenterX, height / 2 + 40 * scale);

    // Sub-texto
    const subText = type === "welcome"
        ? `Miembro #${member.guild.memberCount}`
        : `Nos vemos pronto`;
    const subSize = Math.round(22 * scale);
    ctx.font = `${subSize}px sans-serif`;
    ctx.fillStyle = "rgba(240, 234, 216, 0.8)";
    ctx.fillText(subText, textCenterX, height / 2 + 80 * scale);

    // Reset sombra
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    // 6) Convertir a buffer PNG
    return canvas.encode("png");
}

// ─── Enviar mensajes ────────────────────────────────────────────────────────

async function sendWelcome(member) {
    if (!config.welcomeChannelId) return;

    const channel = member.guild.channels.cache.get(config.welcomeChannelId);
    if (!channel) return;

    try {
        const imageBuffer = await generateCard("welcome", member);
        const attachment = new AttachmentBuilder(imageBuffer, { name: "welcome.png" });

        await channel.send({
            content: `${member}`,
            files: [attachment],
        });
    } catch (error) {
        console.error("[Welcome] Error al generar imagen:", error.message);
    }
}

async function sendGoodbye(member) {
    if (!config.goodbyeChannelId) return;

    const channel = member.guild.channels.cache.get(config.goodbyeChannelId);
    if (!channel) return;

    try {
        const imageBuffer = await generateCard("goodbye", member);
        const attachment = new AttachmentBuilder(imageBuffer, { name: "goodbye.png" });

        await channel.send({
            files: [attachment],
        });
    } catch (error) {
        console.error("[Goodbye] Error al generar imagen:", error.message);
    }
}

module.exports = { sendWelcome, sendGoodbye };

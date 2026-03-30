const { logMessageDelete } = require("../modules/auditLogs");

module.exports = {
    name: "messageDelete",
    once: false,
    async execute(message) {
        if (!message.guild || message.partial || message.author?.bot) return;
        await logMessageDelete(message);
    },
};

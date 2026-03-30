const { processMessage } = require("../modules/moderation");
const { logMessageEdit } = require("../modules/auditLogs");

module.exports = {
    name: "messageUpdate",
    once: false,
    async execute(oldMessage, newMessage) {
        if (!newMessage.guild || newMessage.author?.bot) return;
        if (oldMessage.partial || newMessage.partial) return;
        if (oldMessage.content === newMessage.content) return;

        await processMessage(newMessage);
        await logMessageEdit(oldMessage, newMessage);
    },
};

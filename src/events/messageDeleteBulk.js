const { logBulkDelete } = require("../modules/auditLogs");

module.exports = {
    name: "messageDeleteBulk",
    once: false,
    async execute(messages) {
        const first = messages.first();
        if (!first?.guild) return;
        await logBulkDelete(messages);
    },
};

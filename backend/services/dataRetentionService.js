const Broadcast = require('../models/Broadcast');
const Lead = require('../models/Lead');
const Message = require('../models/Message');
const WhatsAppFlowSubmission = require('../models/WhatsAppFlowSubmission');

const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const getRetentionConfig = () => ({
  messagesDays: Number(process.env.RETENTION_MESSAGES_DAYS || 7),
  broadcastDays: Number(process.env.RETENTION_BROADCAST_DAYS || 30),
  flowSubmissionDays: Number(process.env.RETENTION_FLOW_SUBMISSIONS_DAYS || 30),
  conversationDays: Number(process.env.RETENTION_LEAD_CONVERSATION_DAYS || 7)
});

const runDataRetentionCleanup = async () => {
  const config = getRetentionConfig();

  const [messages, broadcasts, flowSubmissions, conversations] = await Promise.all([
    config.messagesDays > 0
      ? Message.deleteMany({ createdAt: { $lt: daysAgo(config.messagesDays) } })
      : Promise.resolve({ deletedCount: 0 }),
    config.broadcastDays > 0
      ? Broadcast.deleteMany({
          status: { $in: ['completed', 'cancelled', 'failed'] },
          updatedAt: { $lt: daysAgo(config.broadcastDays) }
        })
      : Promise.resolve({ deletedCount: 0 }),
    config.flowSubmissionDays > 0
      ? WhatsAppFlowSubmission.deleteMany({ submittedAt: { $lt: daysAgo(config.flowSubmissionDays) } })
      : Promise.resolve({ deletedCount: 0 }),
    config.conversationDays > 0
      ? Lead.updateMany(
          {},
          { $pull: { conversation: { timestamp: { $lt: daysAgo(config.conversationDays) } } } }
        )
      : Promise.resolve({ modifiedCount: 0 })
  ]);

  return {
    messagesDeleted: messages.deletedCount || 0,
    broadcastsDeleted: broadcasts.deletedCount || 0,
    flowSubmissionsDeleted: flowSubmissions.deletedCount || 0,
    leadConversationsPruned: conversations.modifiedCount || 0
  };
};

module.exports = {
  runDataRetentionCleanup,
  getRetentionConfig
};

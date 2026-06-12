const isEnabled = (value) => ['true', '1', 'yes', 'on'].includes(String(value || '').toLowerCase());

const shouldStoreRawPayloads = () => isEnabled(process.env.STORE_RAW_WEBHOOK_PAYLOADS);

const shouldStoreLeadConversation = () => isEnabled(process.env.STORE_LEAD_CONVERSATION_COPY);

const compactText = (value = '', maxLength = 1000) => String(value || '').slice(0, maxLength);

const compactMessageRecord = (record = {}) => {
  const next = { ...record };
  if (next.message) next.message = compactText(next.message);
  if (!shouldStoreRawPayloads()) delete next.rawPayload;
  return next;
};

const leadLastMessageUpdate = (message, extraSet = {}) => ({
  $set: {
    ...extraSet,
    lastMessage: compactText(message, 500),
    lastMessageAt: new Date()
  }
});

const leadConversationUpdate = (conversation, extraSet = {}) => {
  if (!shouldStoreLeadConversation()) {
    return leadLastMessageUpdate(conversation.message, extraSet);
  }

  return {
    $push: {
      conversation: {
        ...conversation,
        message: compactText(conversation.message, 1000),
        timestamp: conversation.timestamp || new Date()
      }
    },
    $set: {
      ...extraSet,
      lastMessage: compactText(conversation.message, 500),
      lastMessageAt: new Date()
    }
  };
};

module.exports = {
  shouldStoreRawPayloads,
  shouldStoreLeadConversation,
  compactText,
  compactMessageRecord,
  leadLastMessageUpdate,
  leadConversationUpdate
};

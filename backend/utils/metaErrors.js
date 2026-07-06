const META_ERROR_HINTS = {
  131026: {
    reason: 'Message undeliverable. The number may not be reachable on WhatsApp or cannot receive this message.',
    retryable: false
  },
  130472: {
    reason: 'Recipient number is in a Meta experiment and Meta blocked delivery.',
    retryable: false
  },
  131049: {
    reason: 'Meta blocked delivery to maintain healthy ecosystem engagement.',
    retryable: false
  }
};

const readMetaErrorDetails = (error = {}) => {
  const details = error.error_data?.details || error.details || '';
  const message = error.message || error.title || '';
  return { details, message };
};

const normalizeMetaError = (error = {}) => {
  const code = error.code ? String(error.code) : undefined;
  const hint = META_ERROR_HINTS[code];
  const { details, message } = readMetaErrorDetails(error);

  return {
    code,
    title: error.title || message || 'Meta delivery failed',
    message: hint?.reason || message || 'Meta delivery failed',
    details: details || undefined,
    retryable: hint ? hint.retryable : undefined
  };
};

module.exports = {
  normalizeMetaError
};

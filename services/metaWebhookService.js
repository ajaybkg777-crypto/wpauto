const getMetaGraphBaseUrl = () => {
  const version = process.env.META_GRAPH_API_VERSION || 'v25.0';
  return `https://graph.facebook.com/${version}`;
};

const ensureWabaWebhookSubscription = async (wabaId, accessToken) => {
  if (!wabaId || !accessToken) return false;

  try {
    const response = await fetch(`${getMetaGraphBaseUrl()}/${wabaId}/subscribed_apps`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    const data = await response.json();

    if (!response.ok || data.error) {
      console.warn('Unable to subscribe WABA webhook:', data.error?.message || 'Meta subscription failed');
      return false;
    }

    return true;
  } catch (error) {
    console.warn('Unable to subscribe WABA webhook:', error.message);
    return false;
  }
};

module.exports = {
  ensureWabaWebhookSubscription
};

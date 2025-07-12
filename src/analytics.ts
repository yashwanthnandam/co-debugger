import fetch from 'node-fetch';

export async function trackEvent(eventName: string, params: Record<string, any>) {
  // Your Measurement ID and API Secret from Google Analytics 4
  const measurementId = 'G-C5JEV3GNBG';
  const apiSecret = 'btpZUn7USuOfSNOBaSO-uA';
  const endpoint = `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`;

  // Build payload
  const payload = {
    client_id: params.client_id || 'anonymous',
    events: [
      {
        name: eventName,
        params: params
      }
    ]
  };

  try {
    await fetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    // Fail silently or log locally
    console.warn('Analytics tracking failed:', err);
  }
}
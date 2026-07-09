/**
 * Cloudflare Email Worker — receives replies at reply@<your-domain> via
 * Cloudflare Email Routing (free) and forwards the parsed message to the API,
 * which creates a handoff (reply = full stop).
 *
 * Setup (Cloudflare dashboard):
 *  1. Email → Email Routing → enable for the outreach domain
 *  2. Create this Worker; bind route: reply@<domain> → this worker
 *  3. Worker settings → Variables: API_URL (https://lcx-sales-api.onrender.com),
 *     INBOUND_SECRET (same value as the API's INBOUND_WEBHOOK_SECRET)
 */
export default {
  async email(message, env) {
    const from = message.from;
    const subject = message.headers.get('subject') || '';

    let text = '';
    try {
      const raw = await new Response(message.raw).text();
      // Naive text extraction: take the first text/plain part, else strip the raw
      const plainMatch = raw.split(/Content-Type:\s*text\/plain[^]*?\r?\n\r?\n/i)[1];
      text = (plainMatch ?? raw).split(/\r?\n--/)[0].slice(0, 5000);
    } catch {
      text = '';
    }

    try {
      await fetch(`${env.API_URL}/v1/outreach/webhooks/inbound`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Inbound-Secret': env.INBOUND_SECRET,
        },
        body: JSON.stringify({ from, subject, text }),
      });
    } catch (err) {
      // Never bounce the sender because our API hiccuped
      console.error('inbound forward failed', err);
    }
  },
};

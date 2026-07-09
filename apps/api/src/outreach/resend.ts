import { env } from '../lib/env.js';
import { webcrypto } from 'node:crypto';

export interface SendEmailParams {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

interface ResendSendResponse {
  id: string;
}

export async function sendEmail(params: SendEmailParams): Promise<string> {
  const apiKey = env.resendApiKey;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY not configured');
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: params.from,
      to: Array.isArray(params.to) ? params.to : [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
      reply_to: params.replyTo,
      headers: params.headers,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error ${res.status}: ${err}`);
  }

  const data: ResendSendResponse = await res.json();
  return data.id;
}

export async function verifyWebhookSignature(
  payload: string,
  signature: string,
): Promise<boolean> {
  const secret = env.resendWebhookSecret;
  if (!secret) return false;
  try {
    const encoder = new TextEncoder();
    const keyBytes = encoder.encode(secret);
    const payloadBytes = encoder.encode(payload);
    const cryptoKey = await webcrypto.subtle.importKey(
      'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' },
      false, ['verify'],
    );
    const sigBytes = hexToBytes(signature);
    return await webcrypto.subtle.verify('HMAC', cryptoKey, sigBytes, payloadBytes);
  } catch {
    return false;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

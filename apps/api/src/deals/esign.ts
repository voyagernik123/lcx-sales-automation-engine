/**
 * 5-4 E-signature — provider interface + MOCK, mirroring the LinkedIn
 * Phantombuster+mock pattern (outreach/linkedin.ts). Gated by DOCUSIGN_API_KEY:
 * with a key set we return a DocuSign stub (which itself falls back to mock
 * behaviour until real API wiring lands); without it we use the mock provider.
 *
 * No money movement — this only tracks signing status.
 */
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';

// Read directly from process.env so this module needs no change to lib/env.ts.
// Recommended env.ts addition: docusignApiKey: process.env.DOCUSIGN_API_KEY ?? ''
const DOCUSIGN_API_KEY = process.env.DOCUSIGN_API_KEY ?? '';

export type SignatureStatus = 'sent' | 'signed' | 'declined' | 'voided';

export interface SendForSignatureParams {
  dealId: string;
  documentName: string;
  signerEmail?: string;
}

export interface SignatureResult {
  provider: 'mock' | 'docusign';
  externalId: string;
  status: SignatureStatus;
  signingUrl: string;
}

export interface ESignProvider {
  sendForSignature(params: SendForSignatureParams): Promise<SignatureResult>;
  getStatus(externalId: string): Promise<SignatureStatus>;
}

// ── Mock provider (dev/testing) ──
export class MockESignProvider implements ESignProvider {
  async sendForSignature(params: SendForSignatureParams): Promise<SignatureResult> {
    const externalId = `mock-esign-${Date.now()}`;
    return {
      provider: 'mock',
      externalId,
      status: 'sent',
      signingUrl: `https://esign.mock.local/sign/${externalId}?doc=${encodeURIComponent(params.documentName)}`,
    };
  }

  async getStatus(_externalId: string): Promise<SignatureStatus> {
    void _externalId;
    // Mock deterministically reports a completed signature so demos advance.
    return 'signed';
  }
}

// ── DocuSign provider stub (gated by DOCUSIGN_API_KEY) ──
// Real envelope creation is not wired yet; until it is, it delegates to mock
// behaviour but tags the provider as 'docusign' so the tracking is honest.
export class DocuSignProvider implements ESignProvider {
  private apiKey: string;
  private mock = new MockESignProvider();

  constructor() {
    this.apiKey = DOCUSIGN_API_KEY;
  }

  async sendForSignature(params: SendForSignatureParams): Promise<SignatureResult> {
    if (!this.apiKey) {
      return this.mock.sendForSignature(params);
    }
    // TODO: create a real DocuSign envelope via the eSignature REST API.
    const fallback = await this.mock.sendForSignature(params);
    return { ...fallback, provider: 'docusign' };
  }

  async getStatus(externalId: string): Promise<SignatureStatus> {
    if (!this.apiKey) return this.mock.getStatus(externalId);
    // TODO: query real DocuSign envelope status.
    return this.mock.getStatus(externalId);
  }
}

export function createESignProvider(): ESignProvider {
  if (DOCUSIGN_API_KEY) return new DocuSignProvider();
  return new MockESignProvider();
}

export interface SignatureRequestRecord {
  id: string;
  dealId: string;
  provider: string;
  documentName: string | null;
  status: string;
  signingUrl: string | null;
  externalId: string | null;
  sentAt: string | null;
  signedAt: string | null;
  createdAt: string;
}

function mapRow(r: Record<string, unknown>): SignatureRequestRecord {
  return {
    id: String(r.id),
    dealId: String(r.deal_id),
    provider: String(r.provider),
    documentName: r.document_name != null ? String(r.document_name) : null,
    status: String(r.status),
    signingUrl: r.signing_url != null ? String(r.signing_url) : null,
    externalId: r.external_id != null ? String(r.external_id) : null,
    sentAt: r.sent_at != null ? String(r.sent_at) : null,
    signedAt: r.signed_at != null ? String(r.signed_at) : null,
    createdAt: String(r.created_at),
  };
}

/** Send a document for signature and record the request. */
export async function sendForSignature(params: SendForSignatureParams): Promise<SignatureRequestRecord> {
  const db = getDb();
  const provider = createESignProvider();
  const result = await provider.sendForSignature(params);

  const rows = await db.execute(sql`
    INSERT INTO signature_requests (id, deal_id, provider, document_name, status, signing_url, external_id, sent_at)
    VALUES (${randomUUID()}, ${params.dealId}, ${result.provider}, ${params.documentName},
            ${result.status}, ${result.signingUrl}, ${result.externalId}, NOW())
    RETURNING *
  `);
  return mapRow(rows.rows?.[0] as Record<string, unknown>);
}

/** Latest signature request for a deal, refreshing status from the provider. */
export async function getSignature(dealId: string): Promise<SignatureRequestRecord | null> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT * FROM signature_requests WHERE deal_id = ${dealId} ORDER BY created_at DESC LIMIT 1
  `);
  const row = rows.rows?.[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const record = mapRow(row);

  if (record.status === 'sent' && record.externalId) {
    const provider = createESignProvider();
    const latest = await provider.getStatus(record.externalId);
    if (latest !== record.status) {
      const updated = await db.execute(sql`
        UPDATE signature_requests
        SET status = ${latest}, signed_at = ${latest === 'signed' ? sql`NOW()` : sql`signed_at`}
        WHERE id = ${record.id}
        RETURNING *
      `);
      return mapRow(updated.rows?.[0] as Record<string, unknown>);
    }
  }
  return record;
}

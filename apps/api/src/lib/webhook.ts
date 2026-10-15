/**
 * Optional outbound forwarding of new reports (Discord/Slack/custom webhook).
 *
 * Deliberately fire-and-forget and best-effort: an unreachable webhook must
 * never turn a successfully persisted citizen report into a failed request.
 * Because it can run after the response is sent, it never throws.
 */
import { errorMessage, log } from '../logger.js';

const TIMEOUT_MS = 8_000;

export interface ReportWebhookPayload {
  event: 'report.created' | 'report.updated';
  referenceCode: string;
  category: string;
  status: string;
  priority: string;
  barangay: string;
  subject: string;
  locationLabel: string;
  assignedOffice: string | null;
  createdAt: string;
}

export async function forwardToWebhook(
  webhookUrl: string | null,
  payload: ReportWebhookPayload,
): Promise<boolean> {
  if (!webhookUrl) return false;
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      log.warn('report webhook returned a non-2xx status', {
        status: response.status,
        referenceCode: payload.referenceCode,
      });
      return false;
    }
    return true;
  } catch (err) {
    log.warn('report webhook could not be reached', {
      referenceCode: payload.referenceCode,
      error: errorMessage(err),
    });
    return false;
  }
}

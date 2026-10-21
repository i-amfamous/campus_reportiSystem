import { getConfig } from '../../config/env';
import { logger } from '../../config/logger';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
}

export interface EmailSendResult {
  providerMessageId: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

/**
 * Development/staging provider. The message is logged (without the body) and a
 * provider id is synthesised. The rendered body is stored on the notification
 * record so automated tests and staging reviewers can inspect exactly what
 * would have been delivered.
 */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';

  async send(message: EmailMessage): Promise<EmailSendResult> {
    logger.info('Email queued (console provider)', {
      to: message.to,
      subject: message.subject,
      idempotencyKey: message.idempotencyKey,
    });
    return {
      providerMessageId: `console-${message.idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60)}`,
    };
  }
}

interface ResendResponse {
  id?: string;
  message?: string;
}

/** Resend HTTP API adapter (PRD §11.3). Credentials come from the environment. */
export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';

  constructor(private readonly apiKey: string) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const config = getConfig();
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': message.idempotencyKey,
      },
      body: JSON.stringify({
        from: `${config.EMAIL_FROM_NAME} <${config.EMAIL_FROM_ADDRESS}>`,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });

    if (!response.ok) {
      const body = (await response.text()).slice(0, 500);
      throw new Error(`Email provider rejected the message (${response.status}): ${body}`);
    }

    const payload = (await response.json()) as ResendResponse;
    return { providerMessageId: payload.id ?? `resend-${Date.now()}` };
  }
}

let cachedProvider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (cachedProvider) return cachedProvider;
  const config = getConfig();
  if (config.EMAIL_PROVIDER === 'resend') {
    if (!config.RESEND_API_KEY) {
      logger.warn(
        'EMAIL_PROVIDER=resend but RESEND_API_KEY is not set; falling back to console provider.',
      );
      cachedProvider = new ConsoleEmailProvider();
      return cachedProvider;
    }
    cachedProvider = new ResendEmailProvider(config.RESEND_API_KEY);
    return cachedProvider;
  }
  cachedProvider = new ConsoleEmailProvider();
  return cachedProvider;
}

/**
 * Replaces the active provider. Used by the automated test suite to simulate
 * provider outages and verify the retry behaviour.
 */
export function setEmailProvider(provider: EmailProvider | null): void {
  cachedProvider = provider;
}

export function resetEmailProvider(): void {
  cachedProvider = null;
}

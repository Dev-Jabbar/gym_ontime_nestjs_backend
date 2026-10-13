import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import type { App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { DeviceTokensRepository } from './device-tokens.repository.js';
import { SpanStatusCode } from '@opentelemetry/api';
import { withSpan } from '../telemetry/with-span.js';

export interface PushPayload {
  title: string;
  body: string;
  // FCM data values must be strings.
  data?: Record<string, string>;
}

const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

// Fails open, like the Redis cache: with no Firebase credentials every send
// is a no-op, and a failed send never throws, so a push problem can never
// break the payment or booking that triggered it.
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private app: App | null = null;

  constructor(private readonly tokens: DeviceTokensRepository) {}

  onModuleInit() {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn('Firebase not configured; push notifications disabled');
      return;
    }

    try {
      this.app = getApps().length
        ? getApp()
        : initializeApp({
            credential: cert({
              projectId,
              clientEmail,
              // .env stores the key on one line with literal \n sequences.
              privateKey: privateKey.replace(/\\n/g, '\n'),
            }),
          });
      this.logger.log('Firebase push enabled');
    } catch (err) {
      this.app = null;
      this.logger.warn(
        `Firebase init failed; push disabled (${(err as Error).message})`,
      );
    }
  }

  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    if (!this.app) return;
    const app = this.app;
    // One span around the whole push, so a payment trace shows how long the
    // notification side took (it runs after the response, fire-and-forget).
    await withSpan('push.sendToUser', { 'user.id': userId }, async (span) => {
      try {
        const tokens = await this.tokens.findTokensByUserId(userId);
        span.setAttribute('push.tokens', tokens.length);
        if (tokens.length === 0) return;

        const res = await getMessaging(app).sendEachForMulticast({
          tokens,
          notification: { title: payload.title, body: payload.body },
          data: payload.data,
        });
        span.setAttribute('push.sent', res.successCount);
        span.setAttribute('push.failed', res.failureCount);

        const dead = res.responses.flatMap((r, i) =>
          !r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code)
            ? [tokens[i]]
            : [],
        );
        if (dead.length > 0) {
          const removed = await this.tokens.deleteTokens(dead);
          this.logger.log(`Removed ${removed} dead device token(s)`);
        }
        this.logger.log(
          `push user=${userId} sent=${res.successCount} failed=${res.failureCount}`,
        );
      } catch (err) {
        // Still never throws: just mark the span as failed and log.
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        this.logger.warn(
          `Push failed for user ${userId}: ${(err as Error).message}`,
        );
      }
    });
  }
}

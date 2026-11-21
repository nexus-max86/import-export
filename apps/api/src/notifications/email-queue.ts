import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { EMAIL_SENDER, type EmailSender } from '../email/email-sender';
import { PrismaService } from '../prisma/prisma.service';

const QUEUE = 'konzia-email';

/**
 * File d'envoi des e-mails (ticket #24, EF-91) : BullMQ sur Redis, nouvelles tentatives
 * exponentielles. L'état de chaque message est tenu dans outbound_messages (relance possible
 * après un redémarrage). Les journaux ne contiennent ni adresse ni contenu.
 */
@Injectable()
export class EmailQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('EmailQueue');
  private queue?: Queue;
  private worker?: Worker;
  private connections: Redis[] = [];

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(EMAIL_SENDER) private readonly sender: EmailSender,
    private readonly system: PrismaService,
  ) {}

  onModuleInit(): void {
    const connect = () => {
      const c = new Redis(this.env.REDIS_URL, { maxRetriesPerRequest: null });
      this.connections.push(c);
      return c;
    };
    this.queue = new Queue(QUEUE, { connection: connect() });
    this.worker = new Worker(QUEUE, (job: Job<{ id: string }>) => this.process(job), {
      connection: connect(),
      concurrency: 5,
    });
    this.worker.on('failed', (job, err) =>
      this.logger.warn(`e-mail ${job?.data.id ?? '?'} : échec (${err.name})`),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    for (const c of this.connections) c.disconnect();
  }

  async enqueue(ids: string[]): Promise<void> {
    if (!this.queue || ids.length === 0) return;
    await this.queue.addBulk(
      ids.map((id) => ({
        name: 'send',
        data: { id },
        opts: {
          jobId: id, // un message = un travail, même si on le remet en file
          attempts: this.env.EMAIL_MAX_ATTEMPTS,
          backoff: { type: 'exponential', delay: this.env.EMAIL_RETRY_BASE_MS },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      })),
    );
  }

  /** Envoie un message ; idempotent (un message déjà envoyé n'est jamais renvoyé). */
  async process(job: Job<{ id: string }>): Promise<void> {
    const msg = await this.system.outboundMessage.findUnique({
      where: { id: job.data.id },
      select: { status: true, toAddress: true, subject: true, bodyText: true },
    });
    if (!msg || msg.status !== 'queued') return;
    try {
      await this.sender.send({ to: msg.toAddress, subject: msg.subject, text: msg.bodyText });
    } catch (err) {
      const last = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      await this.system.outboundMessage.update({
        where: { id: job.data.id },
        data: {
          attempts: { increment: 1 },
          lastError: errorCode(err),
          ...(last ? { status: 'failed' } : {}),
        },
      });
      throw err;
    }
    await this.system.outboundMessage.update({
      where: { id: job.data.id },
      data: { status: 'sent', sentAt: new Date(), attempts: { increment: 1 }, lastError: null },
    });
  }
}

/** Code d'erreur exploitable sans données personnelles (pas de message brut du serveur SMTP). */
function errorCode(err: unknown): string {
  const e = err as { code?: unknown; responseCode?: unknown; name?: unknown };
  return (
    [e.name, e.code, e.responseCode]
      .filter((x) => x != null)
      .join(' ')
      .slice(0, 100) || 'Error'
  );
}

import { SMTPServer } from 'smtp-server';
import type { AddressInfo } from 'node:net';
import { SmtpEmailSender } from '../src/email/smtp-email-sender';
import { createTestApp, type TestContext } from './app';
import { actor, approveOrg, createOrg, type Actor } from './fixtures';
import { sendQuote, sendRequest } from './quote-fixtures';

/** E-mails transactionnels (ticket #24) : file BullMQ, nouvelles tentatives, préférences. */
describe('E-mails de notification', () => {
  let t: TestContext;
  let kaseba: Actor;
  let ruth: Actor;
  let orgK: string;
  let slugK: string;

  /** Attend qu'un message de la file atteigne un état final. */
  async function settled(where: { recipientUserId: string }, timeoutMs = 8000) {
    const until = Date.now() + timeoutMs;
    for (;;) {
      const rows = await t.prisma.outboundMessage.findMany({
        where,
        orderBy: { createdAt: 'asc' },
      });
      if (rows.length > 0 && rows.every((r) => r.status !== 'queued')) return rows;
      if (Date.now() > until) return rows;
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  const quoteFor = async () => {
    const r = await sendRequest(ruth, [slugK]);
    await sendQuote(t, kaseba, orgK, r);
    return r;
  };

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await t.reset();
    t.outbox.outbox.length = 0;
    kaseba = await actor(t, 'Kaseba');
    orgK = await createOrg(kaseba, 'Kaseba Import');
    slugK = await approveOrg(t, orgK);
    ruth = await actor(t, 'Ruth');
    const lub = await t.prisma.city.findUniqueOrThrow({ where: { name: 'Lubumbashi' } });
    await ruth.agent.put('/api/me/profile', { displayName: 'Ruth K.', cityId: lub.id }).expect(200);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await t.app.close();
  });

  it('un nouveau devis part par e-mail, en français, avec le lien de la demande', async () => {
    const r = await quoteFor();
    const [msg] = await settled({ recipientUserId: ruth.userId });
    expect(msg).toMatchObject({ status: 'sent', attempts: 1, channel: 'email' });
    const mail = t.outbox.lastTo('ruth@example.test');
    expect(mail?.subject).toBe('Konzia — Nouveau devis');
    expect(mail?.text).toContain('Bonjour Ruth K.,');
    expect(mail?.text).toContain(`http://localhost:3000/demandes/${r.id}`);
    expect(mail?.text).toContain('http://localhost:3000/notifications');
  });

  it('respecte la préférence « pas d’e-mail » ; la notification reste dans l’application', async () => {
    await ruth.agent
      .put('/api/me/notification-preferences', {
        preferences: [{ type: 'quote_received', email: false }],
      })
      .expect(200);
    await quoteFor();
    expect((await ruth.agent.get('/api/notifications')).body).toHaveLength(1);
    expect(await t.prisma.outboundMessage.count({ where: { recipientUserId: ruth.userId } })).toBe(
      0,
    );
  });

  it('n’écrit jamais à une adresse non vérifiée', async () => {
    const r = await sendRequest(ruth, [slugK]);
    await t.prisma.user.update({ where: { id: ruth.userId }, data: { emailVerifiedAt: null } });
    await sendQuote(t, kaseba, orgK, r);
    expect((await ruth.agent.get('/api/notifications')).status).toBe(200);
    expect(await t.prisma.outboundMessage.count({ where: { recipientUserId: ruth.userId } })).toBe(
      0,
    );
  });

  it('réessaie après une panne passagère du serveur d’envoi', async () => {
    const send = vi.spyOn(t.outbox, 'send');
    const outage = Object.assign(new Error('Connexion refusée par le relais'), {
      code: 'ECONNECTION',
    });
    const r = await sendRequest(ruth, [slugK]);
    await settled({ recipientUserId: kaseba.userId }); // e-mail « nouvelle demande » déjà parti
    send.mockRejectedValueOnce(outage).mockRejectedValueOnce(outage);
    await sendQuote(t, kaseba, orgK, r);
    const [msg] = await settled({ recipientUserId: ruth.userId });
    expect(msg).toMatchObject({ status: 'sent', attempts: 3, lastError: null });
    expect(t.outbox.outbox.filter((m) => m.subject === 'Konzia — Nouveau devis')).toHaveLength(1);
  });

  it('abandonne après le nombre maximal de tentatives, sans adresse ni contenu dans l’erreur', async () => {
    const r = await sendRequest(ruth, [slugK]);
    await settled({ recipientUserId: kaseba.userId });
    vi.spyOn(t.outbox, 'send').mockRejectedValue(
      Object.assign(new Error('550 ruth@example.test : boîte inconnue'), { responseCode: 550 }),
    );
    await sendQuote(t, kaseba, orgK, r);
    const [msg] = await settled({ recipientUserId: ruth.userId }, 15000);
    expect(msg!.status).toBe('failed');
    expect(msg!.attempts).toBe(6);
    expect(msg!.lastError).toBe('Error 550');
    expect(msg!.lastError).not.toMatch(/ruth|@/);
  });

  it('inscription pendant une panne du serveur d’envoi : compte créé, e-mail parti plus tard', async () => {
    const outage = Object.assign(new Error('Connexion refusée'), { code: 'ECONNREFUSED' });
    vi.spyOn(t.outbox, 'send').mockRejectedValueOnce(outage);
    await t
      .agent()
      .post('/api/auth/register', {
        email: 'patrick@example.test',
        password: 'motdepasse-solide-42',
        displayName: 'Patrick',
        acceptTerms: true,
      })
      .expect(201);
    const until = Date.now() + 8000;
    let row = await t.prisma.outboundMessage.findFirst({
      where: { toAddress: 'patrick@example.test' },
    });
    while (row?.status !== 'sent' && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 50));
      row = await t.prisma.outboundMessage.findFirst({
        where: { toAddress: 'patrick@example.test' },
      });
    }
    expect(row).toMatchObject({
      status: 'sent',
      attempts: 2,
      subject: expect.stringMatching(/Confirmez/),
    });
    expect(t.outbox.lastTo('patrick@example.test')?.text).toMatch(/verifier-email\?jeton=/);
  });

  it('l’adaptateur SMTP (Brevo) remet le message à un serveur SMTP réel', async () => {
    const received: string[] = [];
    const server = new SMTPServer({
      authOptional: true,
      disabledCommands: ['STARTTLS'],
      onData(stream, _session, done) {
        let data = '';
        stream.on('data', (c: Buffer) => (data += c.toString()));
        stream.on('end', () => {
          received.push(data);
          done();
        });
      },
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.server.address() as AddressInfo;
    try {
      const sender = new SmtpEmailSender(
        `smtp://127.0.0.1:${port}`,
        'Konzia <no-reply@konzia.app>',
      );
      await sender.send({
        to: 'ruth@example.test',
        subject: 'Konzia — Nouveau devis',
        text: 'Bonjour Ruth,',
      });
      expect(received).toHaveLength(1);
      expect(received[0]).toMatch(/Subject: =\?UTF-8\?Q\?Konzia_=E2=80=94_Nouveau_devis\?=/);
      expect(received[0]).toMatch(/From: Konzia <no-reply@konzia\.app>/);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

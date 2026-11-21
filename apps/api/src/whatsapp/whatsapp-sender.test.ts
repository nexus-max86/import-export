import { loadEnv } from '../config/env';
import { CloudWhatsAppSender, createWhatsAppSender } from './whatsapp-sender';

const base = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u:p@localhost/db',
  APP_DATABASE_URL: 'postgresql://u:p@localhost/db',
  REDIS_URL: 'redis://localhost:6379',
  APP_URL: 'https://konzia.app',
  HASH_SALT: 'sel-de-production-suffisamment-long',
  EMAIL_TRANSPORT: 'smtp',
  SMTP_URL: 'smtps://u:p@smtp-relay.brevo.com:465',
  FILE_STORAGE: 's3',
  S3_ENDPOINT: 'https://r2.example.com',
  S3_BUCKET: 'konzia',
  S3_ACCESS_KEY_ID: 'id',
  S3_SECRET_ACCESS_KEY: 'secret',
  FILES_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
};

describe('adaptateur WhatsApp', () => {
  it('est désactivé par défaut, même en production', () => {
    const sender = createWhatsAppSender(loadEnv(base));
    expect(sender.enabled).toBe(false);
  });

  it('refuse l’adaptateur factice en production', () => {
    expect(() => loadEnv({ ...base, WHATSAPP_TRANSPORT: 'fake' })).toThrow(
      /WHATSAPP_TRANSPORT: l'envoi WhatsApp factice est interdit en production/,
    );
  });

  it('exige le jeton et le numéro pour l’API Cloud', () => {
    expect(() => loadEnv({ ...base, WHATSAPP_TRANSPORT: 'cloud' })).toThrow(/WHATSAPP_TOKEN/);
  });

  it('appelle l’API Cloud de Meta avec un message texte', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const sender = new CloudWhatsAppSender('jeton', '1234567890', 'v21.0', fetchFn);
    await sender.sendText('+243810000000', 'Votre colis est arrivé.');
    expect(calls[0]!.url).toBe('https://graph.facebook.com/v21.0/1234567890/messages');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      messaging_product: 'whatsapp',
      to: '243810000000',
      type: 'text',
      text: { body: 'Votre colis est arrivé.', preview_url: false },
    });
  });

  it('signale un refus sans exposer le jeton', async () => {
    const fetchFn = (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch;
    const sender = new CloudWhatsAppSender('jeton-secret', '1', 'v21.0', fetchFn);
    await expect(sender.sendText('+243810000000', 'x')).rejects.toMatchObject({ code: 'HTTP_401' });
    await expect(sender.sendText('+243810000000', 'x')).rejects.not.toThrow(/jeton-secret/);
  });
});

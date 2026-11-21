import { connect } from 'node:net';

/**
 * Vide la base Redis réservée aux tests de bout en bout (limites de débit des exécutions
 * précédentes). Protocole Redis minimal, sans dépendance supplémentaire.
 */
export default async function globalSetup(): Promise<void> {
  const url = new URL(process.env.E2E_REDIS_URL ?? 'redis://localhost:6379/2');
  const db = url.pathname.replace('/', '') || '0';
  if (db === '0')
    throw new Error('Refus de vider la base Redis 0 : utilisez une base dédiée aux tests.');
  const cmd = (...args: string[]) =>
    `*${args.length}\r\n${args.map((a) => `$${Buffer.byteLength(a)}\r\n${a}\r\n`).join('')}`;
  await new Promise<void>((resolve, reject) => {
    const socket = connect(Number(url.port || 6379), url.hostname, () =>
      socket.write(cmd('SELECT', db) + cmd('FLUSHDB') + cmd('QUIT')),
    );
    socket.on('data', () => undefined);
    socket.on('close', () => resolve());
    socket.on('error', reject);
  });
}

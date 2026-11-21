import 'reflect-metadata';
import { tmpdir } from 'node:os';

// Valeurs par défaut pour les tests locaux et la CI ; surchargeables par l'environnement.
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://konzia:konzia@localhost:5432/konzia_test';
process.env.APP_DATABASE_URL ??= 'postgresql://konzia_app:konzia_app@localhost:5432/konzia_test';
// Base Redis n°1 : isolée de celle du développement.
process.env.REDIS_URL ??= 'redis://localhost:6379/1';
process.env.APP_URL ??= 'http://localhost:3000';
process.env.LOG_LEVEL ??= 'silent';
process.env.HASH_SALT ??= 'test-salt-test-salt-test-salt-1234';
process.env.EMAIL_TRANSPORT ??= 'fake';
process.env.FILES_ENCRYPTION_KEY ??= Buffer.alloc(32, 9).toString('base64');
process.env.FILE_STORAGE_DIR ??= `${tmpdir()}/konzia-test-storage`;

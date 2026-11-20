import 'reflect-metadata';

// Valeurs par défaut pour les tests locaux et la CI ; surchargeables par l'environnement.
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://konzia:konzia@localhost:5432/konzia_test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.APP_URL ??= 'http://localhost:3000';
process.env.LOG_LEVEL ??= 'silent';

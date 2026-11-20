// Donne le droit de connexion au rôle applicatif konzia_app (sans BYPASSRLS).
// Développement et tests : mot de passe « konzia_app » par défaut.
// Production : APP_DB_PASSWORD est obligatoire (fourni par le script de déploiement).
const { PrismaClient } = require('@prisma/client');

const password =
  process.env.APP_DB_PASSWORD ?? (process.env.NODE_ENV === 'production' ? null : 'konzia_app');
if (!password) {
  console.error('APP_DB_PASSWORD est obligatoire en production.');
  process.exit(1);
}
if (!/^[A-Za-z0-9_\-.]{8,128}$/.test(password)) {
  console.error('APP_DB_PASSWORD : 8 à 128 caractères parmi lettres, chiffres, _ - .');
  process.exit(1);
}

const prisma = new PrismaClient();
prisma
  .$executeRawUnsafe(`ALTER ROLE konzia_app WITH LOGIN NOBYPASSRLS PASSWORD '${password}'`)
  .then(() => console.warn('Rôle konzia_app : connexion activée.'))
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

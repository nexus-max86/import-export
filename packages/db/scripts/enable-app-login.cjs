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

// Sur un hébergeur sans superutilisateur (Neon…), ALTER ROLE ne peut pas mentionner BYPASSRLS,
// même pour l'interdire. Le rôle est créé NOBYPASSRLS par la migration : on le vérifie ici et on
// refuse de lui donner la connexion s'il contournait la RLS.
async function main() {
  const [role] = await prisma.$queryRawUnsafe(
    `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'konzia_app'`,
  );
  if (!role) throw new Error('Rôle konzia_app absent : lancez d’abord les migrations.');
  if (role.rolsuper || role.rolbypassrls) {
    throw new Error('Rôle konzia_app refusé : il ne doit être ni SUPERUSER ni BYPASSRLS.');
  }
  await prisma.$executeRawUnsafe(`ALTER ROLE konzia_app WITH LOGIN PASSWORD '${password}'`);
  console.warn('Rôle konzia_app : connexion activée (sans contournement de la RLS).');
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

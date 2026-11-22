// Désigne un administrateur de la plateforme (aucun écran ne le permet, volontairement).
// Production : docker compose … --profile tools run --rm migrate node scripts/promote-admin.cjs <e-mail>
// L'intéressé devra activer la double authentification à sa première visite de /admin.
const { PrismaClient } = require('@prisma/client');

const email = (process.argv[2] ?? '').trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Usage : node scripts/promote-admin.cjs <adresse e-mail du compte>');
  process.exit(2);
}

const prisma = new PrismaClient();
(async () => {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerifiedAt: true },
  });
  if (!user)
    throw new Error("Aucun compte avec cette adresse : créez-le d'abord par l'inscription.");
  if (!user.emailVerifiedAt) throw new Error("Confirmez d'abord l'adresse e-mail de ce compte.");
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { platformRole: 'admin' } }),
    prisma.auditLog.create({
      data: {
        actorUserId: null,
        actorRole: 'system',
        action: 'admin.promoted',
        entityType: 'user',
        entityId: user.id,
        reason: 'Désignation en ligne de commande sur le serveur',
      },
    }),
  ]);
  console.warn(
    `Administrateur désigné : ${email}. Double authentification exigée à la première visite.`,
  );
})()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

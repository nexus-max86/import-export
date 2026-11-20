import { ORG_HEADER } from '@konzia/shared';
import type { TestAgent, TestContext } from './app';

export const PASSWORD = 'motdepasse-solide-42';

export interface Actor {
  agent: TestAgent;
  userId: string;
  email: string;
}

/** Crée un compte vérifié et connecté (données fictives). */
export async function actor(t: TestContext, name: string, verified = true): Promise<Actor> {
  const email = `${name.toLowerCase()}@example.test`;
  const agent = t.agent();
  await agent
    .post('/api/auth/register', { email, password: PASSWORD, displayName: name, acceptTerms: true })
    .expect(201);
  const user = await t.prisma.user.update({
    where: { email },
    data: { emailVerifiedAt: verified ? new Date() : null },
  });
  await agent.post('/api/auth/login', { email, password: PASSWORD }).expect(204);
  return { agent, userId: user.id, email };
}

export async function createOrg(owner: Actor, name: string): Promise<string> {
  const res = await owner.agent
    .post('/api/organizations', { name, type: 'independent' })
    .expect(201);
  return res.body.organizationId as string;
}

/** En-tête d'organisation active. */
export const asOrg = (orgId: string) => [ORG_HEADER, orgId] as const;

/** Ajoute directement un membre (raccourci de test, sans passer par l'invitation). */
export async function addMember(
  t: TestContext,
  orgId: string,
  userId: string,
  role: 'sales' | 'owner' | 'accountant',
) {
  return t.prisma.organizationMember.create({ data: { organizationId: orgId, userId, role } });
}

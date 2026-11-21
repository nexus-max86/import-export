import request from 'supertest';
import { createTestApp, tokenFrom, type TestContext } from './app';

const ruth = {
  email: 'Ruth.Kabeya@Example.test',
  password: 'motdepasse-solide-42',
  displayName: 'Ruth Kabeya',
  acceptTerms: true,
};
const ruthEmail = 'ruth.kabeya@example.test';

describe('Authentification par e-mail', () => {
  let t: TestContext;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await t.reset();
  });
  afterAll(async () => {
    await t.app.close();
  });

  async function registerAndLogin() {
    const agent = t.agent();
    await agent.post('/api/auth/register', ruth).expect(201);
    await agent.post('/api/auth/login', { email: ruth.email, password: ruth.password }).expect(204);
    return agent;
  }

  describe('inscription', () => {
    it('crée le compte, enregistre les consentements et envoie le lien de vérification', async () => {
      await t.agent().post('/api/auth/register', ruth).expect(201);

      const user = await t.prisma.user.findUniqueOrThrow({
        where: { email: ruthEmail },
        include: { consents: true },
      });
      expect(user.emailVerifiedAt).toBeNull();
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(user.consents.map((c) => `${c.kind}:${c.granted}`).sort()).toEqual([
        'marketing:false',
        'privacy:true',
        'terms:true',
      ]);
      expect(t.outbox.lastTo(ruthEmail)?.subject).toMatch(/Confirmez/);
    });

    it('refuse une inscription sans acceptation des conditions', async () => {
      const res = await t
        .agent()
        .post('/api/auth/register', { ...ruth, acceptTerms: false })
        .expect(400);
      expect(res.body.fields.acceptTerms).toBeDefined();
    });

    it('refuse un mot de passe trop court', async () => {
      await t
        .agent()
        .post('/api/auth/register', { ...ruth, password: 'court' })
        .expect(400);
    });

    it('deux inscriptions simultanées avec la même adresse : une seule réussit, l’autre reçoit 409', async () => {
      const [a, b] = await Promise.all([
        t.agent().post('/api/auth/register', ruth),
        t.agent().post('/api/auth/register', ruth),
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
    });

    it('refuse une adresse déjà utilisée, quelle que soit la casse', async () => {
      await t.agent().post('/api/auth/register', ruth).expect(201);
      await t
        .agent()
        .post('/api/auth/register', { ...ruth, email: ruthEmail.toUpperCase() })
        .expect(409);
    });
  });

  describe('vérification de l’e-mail', () => {
    it('marque l’adresse comme vérifiée, une seule fois', async () => {
      const agent = await registerAndLogin();
      expect((await agent.get('/api/auth/me')).body.emailVerified).toBe(false);

      const token = tokenFrom(t.outbox.lastTo(ruthEmail)?.text);
      await agent.post('/api/auth/verify-email', { token }).expect(204);
      expect((await agent.get('/api/auth/me')).body.emailVerified).toBe(true);

      await agent.post('/api/auth/verify-email', { token }).expect(400);
    });
  });

  describe('connexion', () => {
    it('pose un cookie de session HttpOnly et SameSite=Lax', async () => {
      await t.agent().post('/api/auth/register', ruth).expect(201);
      const res = await t
        .agent()
        .post('/api/auth/login', { email: ruth.email, password: ruth.password })
        .expect(204);
      const cookie = String(res.headers['set-cookie']);
      expect(cookie).toMatch(/kz_session=/);
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Lax/);
    });

    it('donne le même message pour un e-mail inconnu et un mauvais mot de passe', async () => {
      await t.agent().post('/api/auth/register', ruth).expect(201);
      const unknown = await t
        .agent()
        .post('/api/auth/login', { email: 'inconnu@example.test', password: ruth.password })
        .expect(401);
      const wrong = await t
        .agent()
        .post('/api/auth/login', { email: ruth.email, password: 'mauvais-mot-de-passe' })
        .expect(401);
      expect(unknown.body.message).toBe(wrong.body.message);
    });

    it('refuse un compte suspendu', async () => {
      await t.agent().post('/api/auth/register', ruth).expect(201);
      await t.prisma.user.update({ where: { email: ruthEmail }, data: { status: 'suspended' } });
      await t
        .agent()
        .post('/api/auth/login', { email: ruth.email, password: ruth.password })
        .expect(401);
    });

    it('limite les tentatives répétées sur une même adresse', async () => {
      const agent = t.agent();
      for (let i = 0; i < 10; i++) {
        await agent.post('/api/auth/login', { email: ruth.email, password: 'mauvais' }).expect(401);
      }
      await agent.post('/api/auth/login', { email: ruth.email, password: 'mauvais' }).expect(429);
    });

    it('exige une session sur les routes protégées', async () => {
      await request(t.app.getHttpServer()).get('/api/auth/me').expect(401);
    });
  });

  describe('sessions', () => {
    it('déconnecte la session courante', async () => {
      const agent = await registerAndLogin();
      await agent.post('/api/auth/logout').expect(204);
      await agent.get('/api/auth/me').expect(401);
    });

    it('« Déconnecter tous les appareils » rend tous les anciens cookies invalides', async () => {
      const phone = await registerAndLogin();
      const laptop = t.agent();
      await laptop
        .post('/api/auth/login', { email: ruth.email, password: ruth.password })
        .expect(204);

      const sessions = await laptop.get('/api/auth/sessions').expect(200);
      expect(sessions.body).toHaveLength(2);
      expect(sessions.body.filter((s: { current: boolean }) => s.current)).toHaveLength(1);

      await laptop.post('/api/auth/logout-all').expect(204);
      await phone.get('/api/auth/me').expect(401);
      await laptop.get('/api/auth/me').expect(401);
    });

    it('révoque une autre session par son identifiant', async () => {
      const phone = await registerAndLogin();
      const laptop = t.agent();
      await laptop
        .post('/api/auth/login', { email: ruth.email, password: ruth.password })
        .expect(204);
      const list = await laptop.get('/api/auth/sessions');
      const other = list.body.find((s: { current: boolean }) => !s.current);

      await laptop.delete(`/api/auth/sessions/${other.id}`).expect(204);
      await phone.get('/api/auth/me').expect(401);
      await laptop.get('/api/auth/me').expect(200);
    });

    it('ne révèle pas les sessions d’un autre utilisateur', async () => {
      const ruthAgent = await registerAndLogin();
      const other = t.agent();
      await other
        .post('/api/auth/register', {
          ...ruth,
          email: 'patrick@example.test',
          displayName: 'Patrick',
        })
        .expect(201);
      await other.post('/api/auth/login', {
        email: 'patrick@example.test',
        password: ruth.password,
      });
      const patrickSession = (await other.get('/api/auth/sessions')).body[0];

      await ruthAgent.delete(`/api/auth/sessions/${patrickSession.id}`).expect(404);
      await other.get('/api/auth/me').expect(200);
    });
  });

  describe('mot de passe oublié', () => {
    it('répond pareil pour une adresse inconnue, sans envoyer d’e-mail', async () => {
      await t
        .agent()
        .post('/api/auth/password/forgot', { email: 'inconnu@example.test' })
        .expect(204);
      expect(t.outbox.outbox).toHaveLength(0);
    });

    it('change le mot de passe, déconnecte tout, et le lien ne sert qu’une fois', async () => {
      const agent = await registerAndLogin();
      await t.agent().post('/api/auth/password/forgot', { email: ruth.email }).expect(204);
      const token = tokenFrom(t.outbox.lastTo(ruthEmail)?.text);

      const newPassword = 'nouveau-mot-de-passe-99';
      await t
        .agent()
        .post('/api/auth/password/reset', { token, password: newPassword })
        .expect(204);
      await agent.get('/api/auth/me').expect(401);
      await t
        .agent()
        .post('/api/auth/password/reset', { token, password: newPassword })
        .expect(400);

      await t
        .agent()
        .post('/api/auth/login', { email: ruth.email, password: ruth.password })
        .expect(401);
      await t
        .agent()
        .post('/api/auth/login', { email: ruth.email, password: newPassword })
        .expect(204);
    });

    it('refuse un lien expiré (validité 1 heure)', async () => {
      await t.agent().post('/api/auth/register', ruth).expect(201);
      await t.agent().post('/api/auth/password/forgot', { email: ruth.email }).expect(204);
      const token = tokenFrom(t.outbox.lastTo(ruthEmail)?.text);
      await t.prisma.emailToken.updateMany({
        where: { purpose: 'reset_password' },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await t
        .agent()
        .post('/api/auth/password/reset', { token, password: 'nouveau-mot-de-passe-99' })
        .expect(400);
    });

    it('un nouveau lien invalide le précédent', async () => {
      await t.agent().post('/api/auth/register', ruth).expect(201);
      await t.agent().post('/api/auth/password/forgot', { email: ruth.email }).expect(204);
      const first = tokenFrom(t.outbox.lastTo(ruthEmail)?.text);
      await t.agent().post('/api/auth/password/forgot', { email: ruth.email }).expect(204);
      await t
        .agent()
        .post('/api/auth/password/reset', { token: first, password: 'nouveau-mot-de-passe-99' })
        .expect(400);
    });
  });

  describe('protection CSRF', () => {
    it('refuse une écriture sans l’en-tête Konzia', async () => {
      await request(t.app.getHttpServer()).post('/api/auth/register').send(ruth).expect(403);
    });
  });
});

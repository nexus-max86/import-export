import { z } from 'zod';

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().positive().default(3001),
    APP_URL: z.url(),
    /** Rôle propriétaire : authentification et opérations système auditées. */
    DATABASE_URL: z.string().startsWith('postgresql://'),
    /** Rôle konzia_app, soumis à la Row-Level Security : toutes les données métier. */
    APP_DATABASE_URL: z.string().startsWith('postgresql://'),
    REDIS_URL: z.string().startsWith('redis://'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    /** Sel secret pour les empreintes d'IP. */
    HASH_SALT: z.string().min(32, 'HASH_SALT doit faire au moins 32 caractères.'),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    /** Nombre de proxys de confiance devant l'API (Caddy en production = 1). */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
    EMAIL_TRANSPORT: z.enum(['fake', 'smtp']).default('fake'),
    SMTP_URL: z.string().optional(),
    EMAIL_FROM: z.string().default('Konzia <no-reply@konzia.app>'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.EMAIL_TRANSPORT === 'fake') {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_TRANSPORT'],
        message: "l'envoi factice d'e-mails est interdit en production.",
      });
    }
    if (env.EMAIL_TRANSPORT === 'smtp' && !env.SMTP_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_URL'],
        message: 'requis avec EMAIL_TRANSPORT=smtp.',
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

/** Valide les variables d'environnement au démarrage ; refuse de démarrer si une valeur manque. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuration invalide : ${issues}`);
  }
  return parsed.data;
}

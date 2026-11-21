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
    /** Délai de base entre deux tentatives d'envoi (exponentiel) ; court en test. */
    EMAIL_RETRY_BASE_MS: z.coerce.number().int().min(10).default(30_000),
    /** Nombre maximal de tentatives d'envoi d'un e-mail. */
    EMAIL_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(6),
    /**
     * WhatsApp automatique (API Cloud officielle, EF-93, V1) : désactivé tant que Meta n'a pas
     * validé le compte. « fake » sert aux tests et est interdit en production.
     */
    WHATSAPP_TRANSPORT: z.enum(['disabled', 'fake', 'cloud']).default('disabled'),
    WHATSAPP_TOKEN: z.string().optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().regex(/^\d+$/).optional(),
    WHATSAPP_API_VERSION: z
      .string()
      .regex(/^v\d+\.\d+$/)
      .default('v21.0'),
    /** Lecture des pages produits : http (réelle) ou fake (développement hors ligne, tests). */
    PRODUCT_FETCHER: z.enum(['http', 'fake']).default('http'),
    /** Stockage des fichiers : disque local (développement, tests) ou S3/R2 (production). */
    FILE_STORAGE: z.enum(['local', 's3']).default('local'),
    FILE_STORAGE_DIR: z.string().default('.storage'),
    S3_ENDPOINT: z.url().optional(),
    S3_REGION: z.string().default('auto'),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    /** Clé AES-256 des documents (32 octets en base64). Générez-la : openssl rand -base64 32 */
    FILES_ENCRYPTION_KEY: z
      .string()
      .refine(
        (v) => Buffer.from(v, 'base64').length === 32,
        'doit faire 32 octets encodés en base64.',
      ),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.EMAIL_TRANSPORT === 'fake') {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_TRANSPORT'],
        message: "l'envoi factice d'e-mails est interdit en production.",
      });
    }
    if (env.NODE_ENV === 'production' && env.PRODUCT_FETCHER === 'fake') {
      ctx.addIssue({
        code: 'custom',
        path: ['PRODUCT_FETCHER'],
        message: 'le lecteur factice est interdit en production.',
      });
    }
    if (env.NODE_ENV === 'production' && env.FILE_STORAGE === 'local') {
      ctx.addIssue({
        code: 'custom',
        path: ['FILE_STORAGE'],
        message: 'le stockage local est interdit en production (utilisez s3).',
      });
    }
    if (env.FILE_STORAGE === 's3') {
      for (const key of [
        'S3_ENDPOINT',
        'S3_BUCKET',
        'S3_ACCESS_KEY_ID',
        'S3_SECRET_ACCESS_KEY',
      ] as const) {
        if (!env[key])
          ctx.addIssue({ code: 'custom', path: [key], message: 'requis avec FILE_STORAGE=s3.' });
      }
    }
    if (env.NODE_ENV === 'production' && env.WHATSAPP_TRANSPORT === 'fake') {
      ctx.addIssue({
        code: 'custom',
        path: ['WHATSAPP_TRANSPORT'],
        message: "l'envoi WhatsApp factice est interdit en production.",
      });
    }
    if (env.WHATSAPP_TRANSPORT === 'cloud') {
      for (const key of ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'] as const)
        if (!env[key])
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'requis avec WHATSAPP_TRANSPORT=cloud.',
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

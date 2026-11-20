import { z } from 'zod';

/** Version en vigueur des conditions d'utilisation et de la politique de confidentialité. */
export const TERMS_VERSION = '2026-11';

export const PASSWORD_MIN_LENGTH = 10;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Adresse e-mail invalide.' }))
  .refine((v) => v.length <= 254, 'Adresse e-mail trop longue.');

const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Au moins ${PASSWORD_MIN_LENGTH} caractères.`)
  .max(200, 'Mot de passe trop long.');

export const RegisterSchema = z.object({
  email,
  password,
  displayName: z.string().trim().min(2, 'Indiquez votre nom.').max(80),
  acceptTerms: z.literal(true, { message: 'Vous devez accepter les conditions.' }),
  marketingOptIn: z.boolean().default(false),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email,
  password: z.string().min(1, 'Indiquez votre mot de passe.').max(200),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const TokenSchema = z.object({ token: z.string().min(20).max(200) });

export const ForgotPasswordSchema = z.object({ email });

export const ResetPasswordSchema = z.object({ token: z.string().min(20).max(200), password });

/** En-tête exigé sur toute requête d'écriture (protection CSRF, avec SameSite=Lax). */
export const CSRF_HEADER = 'x-konzia-csrf';
export const CSRF_HEADER_VALUE = '1';

export interface MeResponse {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  platformRole: 'admin' | 'support' | null;
}

export interface SessionInfo {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

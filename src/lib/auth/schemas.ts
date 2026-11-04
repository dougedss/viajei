import { z } from 'zod';
import { LIMITS } from '@shared/constants.ts';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Informe um e-mail válido.' }));

export const passwordSchema = z.string().min(LIMITS.passwordMin, {
  error: `A senha precisa de pelo menos ${LIMITS.passwordMin} caracteres.`,
});

export const nameSchema = z
  .string()
  .trim()
  .min(1, { error: 'Como você quer ser chamado?' })
  .max(LIMITS.profileNameMax, { error: `Até ${LIMITS.profileNameMax} caracteres.` });

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: 'Informe a senha.' }),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const resetSchema = z.object({ email: emailSchema });
export type ResetInput = z.infer<typeof resetSchema>;

export const newPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { error: 'As senhas não conferem.', path: ['confirm'] });
export type NewPasswordInput = z.infer<typeof newPasswordSchema>;

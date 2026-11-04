import { AuthError } from '@supabase/supabase-js';

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed:
    'Confirme seu e-mail antes de entrar. Procure a mensagem na caixa de entrada.',
  user_already_exists: 'Já existe uma conta com este e-mail.',
  email_exists: 'Já existe uma conta com este e-mail.',
  weak_password: 'Senha fraca. Use pelo menos 8 caracteres.',
  same_password: 'A nova senha precisa ser diferente da atual.',
  over_email_send_rate_limit: 'Muitos e-mails em pouco tempo. Espere um minuto e tente de novo.',
  over_request_rate_limit: 'Muitas tentativas. Espere um instante e tente de novo.',
  otp_expired: 'O link expirou. Peça um novo.',
  signup_disabled: 'O cadastro está desativado no momento.',
  validation_failed: 'Confira os dados informados.',
};
const OFFLINE = 'Sem conexão. Tente de novo quando a internet voltar.';
const GENERIC = 'Não deu certo. Tente de novo em instantes.';

/** Erro do Supabase Auth (ou de rede) em uma frase em português para a tela. */
export function authErrorMessage(err: unknown): string {
  if (err instanceof AuthError) {
    const known = err.code ? MESSAGES[err.code] : undefined;
    if (known) return known;
    if (err.status === 0 || /fetch/i.test(err.message)) return OFFLINE;
    return GENERIC;
  }
  if (err instanceof TypeError && /fetch/i.test(err.message)) return OFFLINE;
  return GENERIC;
}

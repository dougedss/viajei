/**
 * Gera o par VAPID (P-256) uma vez. Node 22, WebCrypto, sem dependências. Imprime as duas linhas
 * para colar em `.env.local`:
 *   VITE_VAPID_PUBLIC_KEY  ponto público raw em base64url (o applicationServerKey do navegador)
 *   VAPID_PRIVATE_KEY      chave privada em PKCS#8 base64url (carrega a pública dentro)
 * Trocar o par invalida todas as assinaturas: guarde o resultado e nunca rode de novo em produção.
 */
import {
  exportPrivateKeyPkcs8,
  exportPublicKeyRaw,
  generateVapidKeyPair,
  publicKeyFromPkcs8,
} from '../../supabase/functions/_shared/vapid.ts';

const pair = await generateVapidKeyPair();
const publicKey = await exportPublicKeyRaw(pair.publicKey);
const privateKey = await exportPrivateKeyPkcs8(pair.privateKey);

if ((await publicKeyFromPkcs8(privateKey)) !== publicKey) {
  throw new Error('a pública derivada da PKCS#8 não bate com a exportada; não use este par');
}

process.stdout.write(
  [
    '# Cole em .env.local (e VITE_VAPID_PUBLIC_KEY também na Vercel, Production e Preview).',
    '# Acrescente VAPID_SUBJECT=mailto:<seu e-mail> ou a URL de produção.',
    `VITE_VAPID_PUBLIC_KEY=${publicKey}`,
    `VAPID_PRIVATE_KEY=${privateKey}`,
    '',
  ].join('\n'),
);

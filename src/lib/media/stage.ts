import { uuidV4 } from '@/lib/ids/uuid.ts';
import { prepareFile, type Prepared } from '@/lib/media/index.ts';
import { supabaseStorage } from '@/lib/media/storage.ts';
import { supabase } from '@/lib/supabase/client.ts';

/**
 * O anexo que a pessoa escolheu para a leitura (fase 18) sobe ao Storage antes da reserva existir, já
 * comprimido como o print de reserva (D80), com o id definitivo e o caminho `{viagem}/{anexo}.{ext}`
 * da fila (D78). A função o lê de lá com o JWT da pessoa; a linha de `attachments` só nasce ao salvar,
 * pela fila, que acha o objeto no lugar ("já existe" conta como enviado). Se a pessoa não salvar, o
 * objeto sem linha sai pelo expurgo dos órfãos (D79). O arquivo nunca vai duas vezes pela rede.
 */
export type Staged = {
  id: string;
  path: string;
  prepared: Prepared;
  /** o mesmo conteúdo como `File`, para a lista "Anexos a enviar" do formulário */
  file: File;
  /** o objeto já está no Storage (false: sem rede, a fila o sobe ao salvar; nada é lido dele) */
  uploaded: boolean;
};

export type StageErrorReason = 'offline' | 'rule' | 'retry';
export class StageError extends Error {
  readonly reason: StageErrorReason;
  constructor(reason: StageErrorReason, message: string) {
    super(message);
    this.name = 'StageError';
    this.reason = reason;
  }
}

const storage = supabaseStorage(supabase);

export async function stageFile(
  file: File,
  tripId: string,
  options: { upload?: boolean } = {},
): Promise<Staged> {
  const prepared = await prepareFile(file, 'reservation');
  const id = uuidV4();
  const path = `${tripId}/${id}.${prepared.ext}`;
  const asFile = new File([prepared.blob], prepared.filename, { type: prepared.mime });
  if (options.upload === false) return { id, path, prepared, file: asFile, uploaded: false };
  const out = await storage.upload(path, prepared.blob, prepared.mime);
  if (out.kind === 'network') {
    throw new StageError(
      'offline',
      'Sem internet para enviar o anexo. Tente quando a rede voltar.',
    );
  }
  if (out.kind === 'rule') throw new StageError('rule', out.message);
  if (out.kind === 'retry') {
    throw new StageError(
      'retry',
      'O servidor não recebeu o anexo agora. Tente de novo em instantes.',
    );
  }
  return { id, path, prepared, file: asFile, uploaded: true };
}

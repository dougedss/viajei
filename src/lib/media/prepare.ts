import {
  PHOTO_PRESET,
  PRINT_PRESET,
  sniffKind,
  storedFilename,
  withinLimit,
  type ImagePreset,
} from './compress.ts';
import { DecodeError, encodeImage, type Encoded } from './encode.ts';
import type { WorkerRequest, WorkerResponse } from './compress.worker.ts';
import type { Prepared } from './types.ts';

/**
 * Do arquivo escolhido (câmera, galeria, "Escolher arquivo") ao que vai para a fila: a foto vira
 * JPEG de até 1600 px com o borrão; o print de reserva, JPEG de até 2400 px; o PDF vai como está.
 * Qualquer recusa vira uma frase para a pessoa, nunca uma tela quebrada.
 */
export type Purpose = 'memory' | 'reservation';

export type { Prepared } from './types.ts';

export type MediaErrorReason = 'heic' | 'unsupported' | 'too-big' | 'decode' | 'photo-only';

const MESSAGES: Record<MediaErrorReason, string> = {
  heic: 'Esta foto está em HEIC, um formato que este navegador não abre. Escolha outra ou tire pela câmera.',
  unsupported: 'Este arquivo não é uma imagem nem um PDF.',
  'too-big': 'O arquivo passa de 10 MB, o limite dos anexos.',
  decode: 'Não deu para abrir esta imagem. Tente outra.',
  'photo-only': 'Na memória vão só fotos.',
};

export class MediaError extends Error {
  readonly reason: MediaErrorReason;
  constructor(reason: MediaErrorReason) {
    super(MESSAGES[reason]);
    this.name = 'MediaError';
    this.reason = reason;
  }
}

// ------------------------------------------------------------------ o worker, um só, sob demanda
let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, (r: WorkerResponse) => void>();

function canUseWorker(): boolean {
  return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
}

function getWorker(): Worker {
  if (!worker) {
    const w = new Worker(new URL('./compress.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      waiting.get(e.data.id)?.(e.data);
      waiting.delete(e.data.id);
    };
    // o script do worker não carregou (ou morreu): quem esperava cai na thread principal
    w.onerror = () => {
      for (const [id, resolve] of waiting) {
        resolve({ id, ok: false, decode: false, message: 'worker indisponível' });
      }
      waiting.clear();
      worker = null;
    };
    worker = w;
  }
  return worker;
}

async function encodeInWorker(
  blob: Blob,
  preset: ImagePreset,
  placeholder: boolean,
): Promise<Encoded> {
  const id = ++seq;
  const response = await new Promise<WorkerResponse>((resolve) => {
    waiting.set(id, resolve);
    getWorker().postMessage({ id, blob, preset, placeholder } satisfies WorkerRequest);
  });
  if (response.ok) return response.result;
  if (response.decode) throw new DecodeError();
  throw new Error(response.message);
}

/** No worker quando dá; senão (ou se o worker falhar por outro motivo) na thread principal. */
async function encode(blob: Blob, preset: ImagePreset, placeholder: boolean): Promise<Encoded> {
  if (canUseWorker()) {
    try {
      return await encodeInWorker(blob, preset, placeholder);
    } catch (err) {
      if (err instanceof DecodeError) throw err;
      // Safari antigo sem 2D no OffscreenCanvas do worker: o mesmo código aqui
    }
  }
  return encodeImage(blob, preset, placeholder);
}

async function head(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, 16).arrayBuffer());
}

export async function prepareFile(file: File, purpose: Purpose): Promise<Prepared> {
  const kind = sniffKind(await head(file), file.type);
  if (kind === 'unsupported') throw new MediaError('unsupported');
  if (kind === 'pdf') {
    if (purpose === 'memory') throw new MediaError('photo-only');
    if (!withinLimit(file.size)) throw new MediaError('too-big');
    return {
      blob: file.type === 'application/pdf' ? file : new Blob([file], { type: 'application/pdf' }),
      mime: 'application/pdf',
      ext: 'pdf',
      kind: 'document',
      width: null,
      height: null,
      placeholder: null,
      filename: storedFilename(file.name, 'pdf', 'documento'),
      size: file.size,
    };
  }
  const photo = purpose === 'memory';
  let encoded: Encoded;
  try {
    encoded = await encode(file, photo ? PHOTO_PRESET : PRINT_PRESET, photo);
  } catch (err) {
    if (err instanceof DecodeError) throw new MediaError(kind === 'heic' ? 'heic' : 'decode');
    throw err;
  }
  if (!withinLimit(encoded.blob.size)) throw new MediaError('too-big');
  return {
    blob: encoded.blob,
    mime: 'image/jpeg',
    ext: 'jpg',
    kind: photo ? 'photo' : 'document',
    width: encoded.width,
    height: encoded.height,
    placeholder: photo ? encoded.placeholder : null,
    filename: storedFilename(file.name, 'jpg', photo ? 'foto' : 'print'),
    size: encoded.blob.size,
  };
}

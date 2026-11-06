/// <reference lib="webworker" />
import type { ImagePreset } from './compress.ts';
import { DecodeError, encodeImage, type Encoded } from './encode.ts';

/**
 * O trabalho pesado da compressão fora da thread da tela: decodificar uma foto de 12 MP e buscar
 * a qualidade leva centenas de ms, que travariam a folha "Como foi?".
 */
export type WorkerRequest = { id: number; blob: Blob; preset: ImagePreset; placeholder: boolean };
export type WorkerResponse =
  | { id: number; ok: true; result: Encoded }
  | { id: number; ok: false; decode: boolean; message: string };

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, blob, preset, placeholder } = event.data;
  encodeImage(blob, preset, placeholder)
    .then((result) => self.postMessage({ id, ok: true, result } satisfies WorkerResponse))
    .catch((err: unknown) =>
      self.postMessage({
        id,
        ok: false,
        decode: err instanceof DecodeError,
        message: err instanceof Error ? err.message : String(err),
      } satisfies WorkerResponse),
    );
};

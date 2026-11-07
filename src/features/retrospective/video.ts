import {
  BufferTarget,
  CanvasSource,
  canEncodeVideo,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
} from 'mediabunny';
import {
  RECORDER_MP4,
  RECORDER_WEBM,
  VIDEO,
  VIDEO_BITRATE,
  VIDEO_FRAMES,
  type ExportCaps,
  type VideoPlan,
} from './export-format.ts';

/**
 * A exportação do vídeo, num chunk carregado só quando a pessoa pede (`mediabunny` 1.62.1, TypeScript
 * puro, sem dependências: monta o MP4 e o WebM a partir do codificador do navegador). Cada quadro é
 * desenhado pelo relógio do filme num canvas do tamanho do vídeo e entregue ao codificador, que dita
 * o ritmo (contrapressão): o celular pode levar o tempo que precisar, o vídeo sai liso.
 */
export type FrameDraw = (t: number, ctx: CanvasRenderingContext2D) => Promise<void>;

export async function detectCaps(): Promise<ExportCaps> {
  const opts = {
    width: VIDEO.width,
    height: VIDEO.height,
    quality: new Quality(VIDEO_BITRATE),
    frameRate: VIDEO.fps,
  };
  const hasEncoder = typeof VideoEncoder !== 'undefined';
  const [avc, vp9, vp8] = hasEncoder
    ? await Promise.all([
        canEncodeVideo('avc', opts).catch(() => false),
        canEncodeVideo('vp9', opts).catch(() => false),
        canEncodeVideo('vp8', opts).catch(() => false),
      ])
    : [false, false, false];
  const supported = (list: readonly string[]) =>
    typeof MediaRecorder !== 'undefined'
      ? (list.find((m) => MediaRecorder.isTypeSupported(m)) ?? null)
      : null;
  return {
    webcodecs: { avc, vp9, vp8 },
    recorder: { mp4: supported(RECORDER_MP4), webm: supported(RECORDER_WEBM) },
  };
}

export type ExportResult = { blob: Blob; mime: string; extension: 'mp4' | 'webm' };

/**
 * Gera os 15 s. `draw` desenha o instante `t` (ms) no canvas do vídeo; `onProgress` recebe de 0 a 1.
 * Cancelar (`signal`) libera o codificador e não devolve nada.
 */
export async function exportVideo(
  plan: Exclude<VideoPlan, { path: 'none' }>,
  draw: FrameDraw,
  opts: { onProgress: (p: number) => void; signal: AbortSignal },
): Promise<ExportResult | null> {
  const canvas = document.createElement('canvas');
  canvas.width = VIDEO.width;
  canvas.height = VIDEO.height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('sem canvas 2D');
  return plan.path === 'webcodecs'
    ? withWebCodecs(plan, canvas, ctx, draw, opts)
    : withRecorder(plan, canvas, ctx, draw, opts);
}

async function withWebCodecs(
  plan: Extract<VideoPlan, { path: 'webcodecs' }>,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  draw: FrameDraw,
  opts: { onProgress: (p: number) => void; signal: AbortSignal },
): Promise<ExportResult | null> {
  const output = new Output({
    format:
      plan.container === 'mp4'
        ? new Mp4OutputFormat({ fastStart: 'in-memory' })
        : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const source = new CanvasSource(canvas, {
    codec: plan.codec,
    quality: new Quality(VIDEO_BITRATE),
    keyFrameInterval: 1,
  });
  output.addVideoTrack(source, { frameRate: VIDEO.fps });
  await output.start();
  const frame = 1 / VIDEO.fps;
  for (let i = 0; i < VIDEO_FRAMES; i++) {
    if (opts.signal.aborted) {
      await output.cancel();
      return null;
    }
    await draw((i * 1000) / VIDEO.fps, ctx);
    await source.add(i * frame, frame);
    opts.onProgress((i + 1) / VIDEO_FRAMES);
  }
  source.close();
  await output.finalize();
  const buffer = output.target.buffer;
  if (!buffer) throw new Error('o vídeo não foi montado');
  const mime = plan.container === 'mp4' ? 'video/mp4' : 'video/webm';
  return { blob: new Blob([buffer], { type: mime }), mime, extension: plan.container };
}

/**
 * Sem WebCodecs: o MediaRecorder grava o canvas em tempo real. Cada quadro é desenhado e entregue no
 * seu instante (33 ms); um aparelho lento repete quadros, e é por isso que este é só o plano C.
 */
async function withRecorder(
  plan: Extract<VideoPlan, { path: 'recorder' }>,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  draw: FrameDraw,
  opts: { onProgress: (p: number) => void; signal: AbortSignal },
): Promise<ExportResult | null> {
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
  const recorder = new MediaRecorder(stream, {
    mimeType: plan.mime,
    videoBitsPerSecond: VIDEO_BITRATE,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  recorder.start();
  const t0 = performance.now();
  for (let i = 0; i < VIDEO_FRAMES; i++) {
    if (opts.signal.aborted) break;
    await draw((i * 1000) / VIDEO.fps, ctx);
    track?.requestFrame();
    opts.onProgress((i + 1) / VIDEO_FRAMES);
    const due = t0 + ((i + 1) * 1000) / VIDEO.fps;
    const wait = due - performance.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  recorder.stop();
  await stopped;
  for (const t of stream.getTracks()) t.stop();
  if (opts.signal.aborted) return null;
  const mime = plan.mime.split(';')[0] ?? plan.mime;
  return { blob: new Blob(chunks, { type: mime }), mime, extension: plan.container };
}

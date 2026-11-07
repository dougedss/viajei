/**
 * A escolha do formato do vídeo pelo que o aparelho sabe fazer, pura (D122). O MediaRecorder grava em
 * tempo real: num celular que desenha a maquete a 40 fps, o vídeo sai engasgado. Por isso o caminho
 * principal desenha quadro a quadro, a 30 fps, com o relógio do filme, e codifica pelo WebCodecs:
 *
 * 1. WebCodecs H.264 em MP4: o que stories do Instagram e WhatsApp aceitam (o caminho do iPhone);
 * 2. WebCodecs VP9 (ou VP8) em WebM: o mesmo quadro a quadro, onde não há H.264 (navegador sem
 *    codecs proprietários, como o Chromium dos testes);
 * 3. MediaRecorder, MP4 se ele souber, senão WebM: só sem WebCodecs, em tempo real;
 * 4. nada: ficam os cards como imagem.
 *
 * O vídeo não tem som: nos stories a pessoa põe a música dela, e o ronco sintetizado viraria ruído.
 */
export const VIDEO = { width: 1080, height: 1920, fps: 30, seconds: 15 } as const;
export const VIDEO_FRAMES = VIDEO.fps * VIDEO.seconds;
/** 8 Mbit/s: nítido em 1080 × 1920 e leve para o WhatsApp (15 s ≈ 15 MB). */
export const VIDEO_BITRATE = 8_000_000;

export type ExportCaps = {
  webcodecs: { avc: boolean; vp9: boolean; vp8: boolean };
  recorder: { mp4: string | null; webm: string | null };
};

export type VideoPlan =
  | { path: 'webcodecs'; codec: 'avc'; container: 'mp4' }
  | { path: 'webcodecs'; codec: 'vp9' | 'vp8'; container: 'webm' }
  | { path: 'recorder'; container: 'mp4' | 'webm'; mime: string }
  | { path: 'none' };

export function chooseVideo(caps: ExportCaps): VideoPlan {
  if (caps.webcodecs.avc) return { path: 'webcodecs', codec: 'avc', container: 'mp4' };
  if (caps.webcodecs.vp9) return { path: 'webcodecs', codec: 'vp9', container: 'webm' };
  if (caps.webcodecs.vp8) return { path: 'webcodecs', codec: 'vp8', container: 'webm' };
  if (caps.recorder.mp4) return { path: 'recorder', container: 'mp4', mime: caps.recorder.mp4 };
  if (caps.recorder.webm) return { path: 'recorder', container: 'webm', mime: caps.recorder.webm };
  return { path: 'none' };
}

/** O nome que aparece na folha de exportar ("MP4 · H.264"). */
export function videoLabel(plan: VideoPlan): string {
  if (plan.path === 'none') return '';
  if (plan.path === 'webcodecs')
    return plan.codec === 'avc' ? 'MP4 · H.264' : `WebM · ${plan.codec.toUpperCase()}`;
  return plan.container === 'mp4' ? 'MP4' : 'WebM';
}

/** Os tipos que o MediaRecorder costuma aceitar, do melhor para o pior. */
export const RECORDER_MP4 = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/mp4'];
export const RECORDER_WEBM = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

/** O nome do arquivo: "viajei-rs-concurso-em-montenegro.mp4". */
export function fileSlug(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug ? `viajei-${slug}` : 'viajei';
}

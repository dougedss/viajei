import type {
  BetaMessage,
  BetaRawMessageStreamEvent,
  BetaStopReason,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import seed from '../../../supabase/seed/viagem-rs.json';
import {
  encodeEvent,
  type ImportEvent,
} from '../../../supabase/functions/_shared/import-protocol.ts';
import { toAi, validateImport } from '../../../supabase/functions/_shared/import-schema.ts';

/**
 * A resposta gravada da importação: o texto do seed (`supabase/seed/viagem-rs.txt`) vira o JSON do
 * seed, sem as coordenadas, que nunca vêm da IA. Dois formatos do mesmo conteúdo:
 * - os eventos da Anthropic (`anthropicRecording`), que o client de mentira do handler devolve;
 * - o SSE do nosso protocolo (`importSse`), que o e2e entrega ao app no lugar da função.
 * Os pedaços têm tamanho fixo, como os `text_delta` de verdade (alguns tokens cada).
 */

/**
 * O JSON que a IA devolve para o texto do seed: o arquivo do seed como a IA escreve (`toAi`), sem
 * `lat` e `lng` e com o texto ausente vazio.
 */
export function seedAiJson(): string {
  return JSON.stringify(toAi(validateImport(seed)));
}

export function chunks(text: string, size = 24): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

export type RecordingOptions = {
  model?: string;
  /** o bloco de pensamento antes do texto (vazio, como no `display: "omitted"`) */
  thinking?: boolean;
  stop_reason?: BetaStopReason;
  refusal?: 'cyber' | 'bio' | 'frontier_llm' | 'reasoning_extraction' | 'general_harms' | null;
  /** troca de modelo no meio: o texto continua noutro bloco, depois de um bloco `fallback` */
  fallbackAt?: number;
  fallbackModel?: string;
  chunk?: number;
  input_tokens?: number;
  output_tokens?: number;
};

/** Os eventos de um stream da Anthropic com este texto, e a mensagem final que o SDK monta. */
export function anthropicRecording(
  text: string,
  options: RecordingOptions = {},
): { events: BetaRawMessageStreamEvent[]; message: BetaMessage } {
  const model = options.model ?? 'claude-sonnet-5-5';
  const stop = options.stop_reason ?? 'end_turn';
  const input = options.input_tokens ?? 4_100;
  const output = options.output_tokens ?? 2_300;
  const usage = {
    input_tokens: input,
    output_tokens: output,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
  const pieces = chunks(text, options.chunk);
  const split = options.fallbackAt ?? -1;
  const finalModel = split >= 0 ? (options.fallbackModel ?? 'claude-sonnet-5') : model;

  const events: unknown[] = [
    {
      type: 'message_start',
      message: {
        id: 'msg_gravada',
        type: 'message',
        role: 'assistant',
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        stop_details: null,
        usage: { ...usage, output_tokens: 1 },
      },
    },
  ];
  let index = 0;
  if (options.thinking ?? true) {
    events.push(
      {
        type: 'content_block_start',
        index,
        content_block: { type: 'thinking', thinking: '', signature: '' },
      },
      { type: 'content_block_delta', index, delta: { type: 'signature_delta', signature: 'x' } },
      { type: 'content_block_stop', index },
    );
    index += 1;
  }
  const textBlock = (parts: string[]) => {
    events.push({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } });
    for (const part of parts) {
      events.push({
        type: 'content_block_delta',
        index,
        delta: { type: 'text_delta', text: part },
      });
    }
    events.push({ type: 'content_block_stop', index });
    index += 1;
  };
  if (split >= 0) {
    textBlock(pieces.slice(0, split));
    events.push(
      {
        type: 'content_block_start',
        index,
        content_block: {
          type: 'fallback',
          from: { model },
          to: { model: finalModel },
          trigger: { type: 'refusal', category: 'cyber' },
        },
      },
      { type: 'content_block_stop', index },
    );
    index += 1;
    textBlock(pieces.slice(split));
  } else if (pieces.length > 0) {
    textBlock(pieces);
  }
  const stopDetails =
    stop === 'refusal'
      ? { type: 'refusal', category: options.refusal ?? null, explanation: null }
      : null;
  events.push(
    {
      type: 'message_delta',
      delta: { stop_reason: stop, stop_sequence: null, stop_details: stopDetails },
      usage: { output_tokens: output },
    },
    { type: 'message_stop' },
  );

  const message = {
    id: 'msg_gravada',
    type: 'message',
    role: 'assistant',
    model: finalModel,
    content: text === '' ? [] : [{ type: 'text', text }],
    stop_reason: stop,
    stop_sequence: null,
    stop_details: stopDetails,
    usage: { ...usage, iterations: null },
  };
  return {
    events: events as BetaRawMessageStreamEvent[],
    message: message as unknown as BetaMessage,
  };
}

/** O SSE que a função manda para o texto do seed: start, os pedaços e o done validado. */
export function importSse(data: unknown, json = seedAiJson(), size = 24): string {
  const events: ImportEvent[] = [
    { type: 'start', id: '0b8f5f8e-2f2a-4d55-9f3b-6f0a1c2d3e4f', model: 'claude-sonnet-5-5' },
    ...chunks(json, size).map((text): ImportEvent => ({ type: 'delta', text })),
    {
      type: 'done',
      data,
      model: 'claude-sonnet-5-5',
      usage: { input_tokens: 4_100, output_tokens: 2_300 },
    },
  ];
  return events.map(encodeEvent).join('');
}

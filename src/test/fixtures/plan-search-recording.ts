import type {
  BetaMessage,
  BetaRawMessageStreamEvent,
  BetaStopReason,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';

/**
 * Um turno gravado do planejador (fase 27): os eventos de um stream da Anthropic e a mensagem final,
 * com blocos de pensamento, de texto e de chamada de ferramenta roteirizados. O client de mentira do
 * handler devolve um turno destes por chamada.
 */
export type ScriptedBlock =
  | { type: 'thinking'; thinking?: string }
  | { type: 'text'; text: string }
  /** o `type` pode ficar implícito: um bloco com `id` e `name` é uma chamada de ferramenta */
  | { type?: 'tool_use'; id: string; name: string; input: unknown };

export type TurnOptions = {
  model?: string;
  stop_reason?: BetaStopReason;
  refusal?: string | null;
  input_tokens?: number;
  output_tokens?: number;
};

export function scriptedTurn(
  blocks: readonly ScriptedBlock[],
  options: TurnOptions = {},
): { events: BetaRawMessageStreamEvent[]; message: BetaMessage } {
  const model = options.model ?? 'claude-sonnet-5-5';
  const stop =
    options.stop_reason ?? (blocks.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn');
  const input = options.input_tokens ?? 1_000;
  const output = options.output_tokens ?? 200;
  const usage = {
    input_tokens: input,
    output_tokens: output,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
  const events: unknown[] = [
    {
      type: 'message_start',
      message: {
        id: 'msg_roteirizada',
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
  const content: unknown[] = [];
  blocks.forEach((block, index) => {
    if (block.type === 'thinking') {
      events.push(
        {
          type: 'content_block_start',
          index,
          content_block: { type: 'thinking', thinking: '', signature: '' },
        },
        {
          type: 'content_block_delta',
          index,
          delta: { type: 'signature_delta', signature: 'assinatura-x' },
        },
        { type: 'content_block_stop', index },
      );
      content.push({ type: 'thinking', thinking: block.thinking ?? '', signature: 'assinatura-x' });
      return;
    }
    if (block.type === 'text') {
      events.push(
        { type: 'content_block_start', index, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } },
        { type: 'content_block_stop', index },
      );
      content.push({ type: 'text', text: block.text });
      return;
    }
    const json = JSON.stringify(block.input);
    events.push(
      {
        type: 'content_block_start',
        index,
        content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} },
      },
      {
        type: 'content_block_delta',
        index,
        delta: { type: 'input_json_delta', partial_json: json },
      },
      { type: 'content_block_stop', index },
    );
    content.push({ type: 'tool_use', id: block.id, name: block.name, input: block.input });
  });
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
    id: 'msg_roteirizada',
    type: 'message',
    role: 'assistant',
    model,
    content,
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

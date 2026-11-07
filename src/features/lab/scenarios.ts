/**
 * Os cenários do laboratório de testes automáticos: o código que o executor grava em `lab_checks`
 * e o rótulo que o painel mostra. Puro; o executor (`scripts/lab`) e o painel (`/lab`) importam daqui.
 */
export const LAB_SCENARIOS = {
  preparo: {
    label: 'Preparo',
    description: 'Viagens, convite, preferências e assinaturas pelas mesmas RPCs do app',
  },
  entrega: {
    label: 'Entrega',
    description: 'Os cinco avisos chegam em até 90 s depois do minuto do cron',
  },
  saida: {
    label: 'Hora de sair',
    description: '"Sair em 5 min" e depois "Hora de sair", na mesma tag, com Partiu! e selo',
  },
  fechamento: {
    label: 'Parada fechando',
    description: '60 min antes de fechar, com Chegamos! quando é a próxima parada',
  },
  briefing: {
    label: 'Briefing da manhã',
    description: 'Dia, semana, paradas e primeira parada, no horário escolhido pela pessoa',
  },
  time: {
    label: 'Time',
    description: 'Quem ligou o aviso recebe "<nome> chegou"; quem marcou não recebe',
  },
  desligado: {
    label: 'Avisos desligados',
    description: 'Com o geral desligado na viagem, nada chega',
  },
  dedupe: {
    label: 'Sem repetição',
    description: 'Cada aviso chega uma vez, e nada além do esperado',
  },
  assinatura_morta: {
    label: 'Aparelho que saiu',
    description: 'O 410 grava failed_at e o aparelho para de receber',
  },
  vapid: {
    label: 'VAPID',
    description: 'Assinatura ES256 da nossa chave, com aud e exp válidos',
  },
  payload: {
    label: 'Payload',
    description: 'Decifra (RFC 8291), cabe em 4 KB e abre o "Agora" da viagem certa',
  },
  app_avisos: {
    label: 'App · ativar avisos',
    description:
      'Entra, abre o "Agora", ativa pela folha na segunda abertura e vê "Avisos ligados"',
  },
  app_notificacao: {
    label: 'App · Partiu! na notificação',
    description: 'O push chega ao service worker; Partiu! na notificação marca com o app fechado',
  },
  app_reabrir: {
    label: 'App · reabrir',
    description:
      'Na lista, "Desde a última vez" mostra a saída; a posição marca Chegamos! e vira o card "Como foi?"',
  },
  app_extras: {
    label: 'App · painel e calendário',
    description: 'Modo painel liga e desliga; o dia sai como .ics',
  },
  app_maquete: {
    label: 'App · maquete',
    description:
      'A maquete monta (WebGPU ou WebGL2) com as pílulas, e o "Rever o dia" anda até o fim',
  },
} as const;

export type LabScenario = keyof typeof LAB_SCENARIOS;
export const LAB_SCENARIO_KEYS = Object.keys(LAB_SCENARIOS) as LabScenario[];
export type LabStatus = 'pass' | 'fail' | 'skip';

export function isLabScenario(value: string): value is LabScenario {
  return Object.hasOwn(LAB_SCENARIOS, value);
}

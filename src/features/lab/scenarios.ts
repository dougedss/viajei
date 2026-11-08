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
    description:
      'Dia, semana, paradas, primeira parada e o clima que a função gravou, no horário escolhido pela pessoa',
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
  vespera: {
    label: 'Véspera',
    description:
      'Em dois dias: armado numa execução, chega às 19h da véspera com o que falta nas listas',
  },
  prazo: {
    label: 'Prazo de cancelamento',
    description: 'Em dois dias: armado numa execução, chega às 10h da véspera do último dia',
  },
  retro: {
    label: 'Retrospectiva pronta',
    description:
      'Em dois dias: armado numa execução, chega às 9h do dia seguinte ao fim, com o filme',
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
  app_listas: {
    label: 'App · listas',
    description: 'A fecha Antes e Mala e vê "Pronto para partir"; B vê tudo marcado e o selo',
  },
  app_contatos: {
    label: 'App · contatos',
    description: 'Ligar e WhatsApp nos href certos, telefone da reserva sem repetir, emergência',
  },
  app_agora_reserva: {
    label: 'App · reserva no Agora',
    description: '"Ver reserva" no "Agora" abre a reserva da próxima parada com o código',
  },
  app_reserva_offline: {
    label: 'App · reserva sem rede',
    description: 'Print e PDF sobem; sem rede, recarregar e abrir os dois do aparelho',
  },
  app_missoes: {
    label: 'App · missões',
    description:
      'Sugestão adicionada e outra dispensada, iguais para B; missão feita na folha "Como foi?"',
  },
  app_memoria: {
    label: 'App · foto sem sinal',
    description: 'A foto aparece na hora, sobe quando a rede volta e chega ao diário de B',
  },
  app_gastos: {
    label: 'App · gastos',
    description:
      '"+ Gasto" no Modo Viagem com a parada e a categoria; a barra do orçamento em âmbar',
  },
  app_sair_pendente: {
    label: 'App · sair com pendência',
    description: '"Sair" com uma foto sem sinal avisa o que se perderia; ficar mantém tudo',
  },
  app_progressao: {
    label: 'App · progressão',
    description:
      'A primeira parada dá o cartão; "Usar no carro" põe o rack; XP de A e de B no servidor; a garagem de B',
  },
  app_importar: {
    label: 'App · importar',
    description:
      'Cola um roteiro curto, a IA lê de verdade, a revisão salva; horário, telefone e código exatos no servidor',
  },
  app_mapa: {
    label: 'App · mapa',
    description:
      'Abre o mapa de hoje com os tiles do OSM: pinos, rota real e atribuição; tile no cache com 200 e, sem rede, os tiles vistos e o aviso',
  },
  app_clima: {
    label: 'App · clima',
    description:
      'A faixa da visão geral com os números de hoje pelo Open-Meteo; sem rede, o "atualizado às"',
  },
  app_retrospectiva: {
    label: 'App · retrospectiva',
    description: 'O filme chega ao card final; o card em 1080 × 1920 e o vídeo de 15 s, no Chrome',
  },
  expurgo: {
    label: 'Expurgo',
    description:
      'O dry_run diário da função purge responde, não mexe em nada e nada fora da regra se qualifica',
  },
  app_resync: {
    label: 'App · aparelho atrasado',
    description:
      'Com o cursor antes do horizonte, o resync tira a linha fantasma e as edições sem sinal sobem',
  },
  lighthouse: {
    label: 'Lighthouse',
    description:
      'Desempenho, acessibilidade e boas práticas ≥ 90 no celular (mediana de 3), e o app instalável',
  },
} as const;

export type LabScenario = keyof typeof LAB_SCENARIOS;
export const LAB_SCENARIO_KEYS = Object.keys(LAB_SCENARIOS) as LabScenario[];
export type LabStatus = 'pass' | 'fail' | 'skip';

export function isLabScenario(value: string): value is LabScenario {
  return Object.hasOwn(LAB_SCENARIOS, value);
}

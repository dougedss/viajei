# Teste manual · Fase 5 (mundo 3D: maquete e replay)

Roteiro para o iPhone (primeiro) e para um Android ou o Chrome do desktop, com o que observar em
cada passo. Pré-requisitos: o deploy da fase 5 no ar (preview da branch `fase-5` ou produção), a
viagem de exemplo carregada (botão "Carregar viagem de exemplo", só em dev) ou uma viagem sua com
paradas com coordenada, e a rota do dia já buscada (abra o dia no Roteiro com internet uma vez).
Nenhum segredo, nenhuma variável nova.

## Onde anotar

Anote os números no `docs/decisoes.md`, na entrada "D64 · Números medidos", ou mande no chat:
aparelho e sistema, motor (WebGPU ou WebGL2), fps em Alta e em Leve durante o replay, tempo até o
primeiro quadro (o Chrome do desktop imprime no console em dev; no celular, cronômetro na mão) e
qualquer travada.

## iPhone (Safari, instalado na Tela de Início)

1. **Chip de diagnóstico.** Abra o Modo Viagem com `?diag=1` na URL
   (`/viagens/<id>/viagem?diag=1`). No canto da maquete aparece o chip `· fps · WebGPU · Auto · Alta`.
   iOS 26 tem de dizer **WebGPU**; iOS 18 e anteriores dizem **WebGL2**. Parado, o fps mostra `·`: a
   maquete não desenha nada enquanto nada se move.
2. **Abertura do dia.** Na primeira abertura do dia neste aparelho: o relevo sobe, a estrada se
   desenha da origem ao fim, as pílulas caem em sequência, o carro entra pela estrada e estaciona.
   2 a 3 s no total. Para ver de novo, apague o dado do dia: no Safari não há como pela interface;
   use outro dia da viagem (cada dia tem a própria abertura).
3. **fps em Alta.** Toque em "Rever o dia": o carro percorre o dia do começo ao ponto atual (até
   20 s), com as curiosidades do caminho (a câmera mergulha e volta) e o ronco do motor. Leia o fps
   no chip durante o movimento. Anote.
4. **fps em Leve.** Toque no chip até ele dizer `Leve` e repita "Rever o dia". Anote. Toque de novo
   até voltar para `Auto`. Se o automático rebaixou sozinho (`Auto · Leve`), anote também.
5. **Curiosidades.** No dia 1 do seed (Papanduva → Bom Princípio) o caminho tem ponto mais alto,
   subida, entradas de cenário e a serra antes de Caxias. Cada mergulho dura 1,5 s no replay ao
   abrir e 2,5 s no "Rever o dia", com a legenda no alto; parado, nada se move.
6. **Replay ao abrir.** Em outro aparelho (ou no Chrome do desktop com a mesma conta), marque
   "Chegamos!" numa parada. Volte ao iPhone, saia do Modo Viagem e abra de novo (ou feche o app e
   reabra): o carro anda do lugar onde estava até a parada marcada, o anel preenche e o check salta
   quando ele passa, e o chip "Nome · HH:MM" aparece na pílula. "Pular" está sempre visível. O card
   "Desde a última vez" **não** aparece junto com o replay.
7. **Quem ficou em casa.** Com o Modo Viagem aberto, marque uma parada no outro aparelho: o carro
   avança sozinho até ela em 1 a 3 s, com o chip da pessoa, sem recarregar.
8. **Noite.** Depois das 18:30 (ou pelo chip "Noite" com `?diag=1`): céu escuro, faróis, lanternas
   e janelas das torres acesas, texto 10% maior. A transição leva 1,5 s.
9. **Partiu! e Chegamos!.** Partiu! toca a buzina e põe o carro logo depois do nó; Chegamos! toca o
   sino, solta confete e conclui. No iPhone o som só sai depois de um toque na página (regra do
   Safari): o ronco do replay ao abrir pode ficar mudo na primeira abertura. O toggle de som está em
   Avisos e no chip.
10. **Ver como lista.** No rodapé de "Lista do dia", toque em "Ver como lista": a maquete some, a
    lista fica aberta, e assim continua ao reabrir o app. "Ver a maquete" desfaz.
11. **Reduzir movimento.** Ajustes → Acessibilidade → Movimento → Reduzir movimento. Reabra o Modo
    Viagem: sem abertura, sem replay (o card "Desde a última vez" volta a ser o que aparece), sem
    mergulhos de câmera (só a legenda), sem sons. O carro aparece direto no lugar.
12. **Fora da rota.** Com a posição permitida e a mais de 2 km do traçado: o carro aparece fora da
    estrada, com uma linha tracejada até ela e o chip "Fora da rota · N km".

## Android (Chrome) ou Chrome no desktop

1. Repita os passos 1, 3 e 4. Chrome recente no Android diz **WebGPU**; os demais, **WebGL2**. No
   desktop, o chip "WebGL" força o motor WebGL2 para comparar.
2. Repita 6 e 7 com o iPhone como "outro aparelho".
3. **Vibração.** No Android, Chegamos! vibra curto junto com o confete.
4. **Sem WebGL.** `chrome://flags` → desligue a aceleração ou use `--disable-gpu`: o Modo Viagem
   mostra a lista com "Maquete indisponível neste aparelho", sem erro.

## O que conferir no console (desktop, dev)

- `viajei: maquete no primeiro quadro em N ms` ao montar.
- `viajei:decisão {...}` com o estado anterior, os eventos e o plano do replay.
- `viajei:movimento <tipo> <de> <até>` a cada movimento (abertura, replay, ao vivo, rever).
- Nenhum erro do three nem do R3F.

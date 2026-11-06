# Teste manual · Fase 6 (garagem 3D)

Roteiro para o iPhone (primeiro) e para um Android ou o Chrome do desktop. Como o teste da fase 5
ainda não aconteceu, a última seção traz os passos dela: dá para fazer as duas fases na mesma
sentada.

**Antes de começar:**
- O deploy da fase 6 no ar: o preview da Vercel da branch `fase-6` ou a produção depois do merge.
- Uma viagem sua.
- Nenhum segredo, nenhuma variável nova.

Até a fase 9 (XP e conquistas), todo time está no nível 1. Ficam liberados o hatch e sete cores.
Os outros quatro modelos, o dourado e todos os acessórios abrem só a **prévia**, que mostra e não
grava. É o comportamento certo, não defeito.

## Onde anotar

Anote no `docs/decisoes.md`, na entrada "D75 · Números medidos", ou mande no chat:
- aparelho e sistema;
- motor (WebGPU ou WebGL2);
- fps com o disco girando, em Alta e em Leve;
- se a troca de modelo engasga (na primeira vez de cada modelo e nas seguintes);
- tempo até o primeiro quadro, no cronômetro;
- qualquer travada.

## iPhone (Safari, instalado na Tela de Início)

1. **Chip de diagnóstico.** Abra `/viagens/<id>/garagem?diag=1`. O chip fica no canto de baixo do
   palco, por exemplo `60 fps · WebGPU · Auto · Alta`. iOS 26 tem de dizer **WebGPU**; versões
   anteriores dizem **WebGL2**.
2. **fps.** Ao entrar, o disco gira devagar sozinho por 20 s.
   - Leia o fps durante o giro e anote.
   - Toque no chip até ele dizer `Leve`, saia, volte e anote de novo.
   - Volte para `Auto`.
   - Depois de 20 s sem toque o disco para e o chip mostra `·`: parado, zero quadros.
3. **Girar com o dedo.**
   - Arraste na horizontal: o carro gira sobre o disco, as luzes ficam paradas e o reflexo corre
     pela lataria.
   - Solte com velocidade: a inércia leva o carro e ele volta ao giro lento.
   - Arraste na vertical: a câmera inclina numa faixa curta.
   - Pince: aproxima e afasta, até um limite.
   - A página não rola enquanto o dedo está no palco.
4. **Pintura.** Toque em outra cor.
   - A tinta muda em cerca de 0,4 s, com o verniz brilhando.
   - Feche o app e abra de novo: a cor ficou.
   - A cor aparece no card da viagem (na lista) e no topo da visão geral.
5. **Prévia de um modelo.** Toque em **SUV**.
   - O hatch sai rodando para a direita e o SUV entra pela esquerda, em cerca de 0,9 s, com um
     ronco curto.
   - Aparecem o selo "Prévia" e o cartão "SUV: no nível 3 (Explorador)".
   - Repita com Sedã, Picape e Kombi.
   - Na kombi, confira a saia e blusa (a cor embaixo, branco gelo em cima) e o V no nariz.
   - "Voltar ao carro da viagem" traz o hatch de volta.
   - Anote se alguma troca engasga.
6. **Prévia de acessórios.** Toque em **Bicicleta**.
   - O rack e a bicicleta descem e encaixam com mola e um "toc" seco.
   - O cartão mostra as duas frases: a do rack e a da bicicleta.
   - Experimente adesivos: no quarto, aparece "Cabem 3 adesivos: tire um para pôr este."
   - Na kombi cabem três itens no teto. Volte para o hatch com os três: um aviso diz qual saiu.
7. **A prévia não grava.** Com uma prévia na tela, feche o app e abra de novo: volta o carro da
   viagem.
8. **Maquete.** Abra o Modo Viagem da viagem: o carro na estrada tem a cor escolhida. À noite
   (pelo chip "Noite" com `?diag=1`), faróis e lanternas acendem como antes.
9. **Sem 3D.** Abra `/viagens/<id>/garagem?render=list`.
   - No lugar do palco aparece a vista lateral grande, com as mesmas linhas.
   - A prévia e a gravação funcionam igual.
   - Cada troca dá um pulinho.
10. **Reduzir movimento.** Ajustes → Acessibilidade → Movimento → Reduzir movimento.
    - O disco não gira sozinho e não tem inércia.
    - As trocas acontecem na hora, sem som.
11. **Som.** Desligue o som em Avisos: o encaixe e o ronco somem.
    - No iPhone o som só sai depois do primeiro toque na página (regra do Safari).

## Android (Chrome) ou Chrome no desktop

1. Repita os passos 1, 2, 3 e 5.
   - Chrome recente no Android diz **WebGPU**.
   - No desktop, o chip "WebGL" força o motor WebGL2 para comparar.
2. **Vibração.** No Android, o encaixe de um acessório vibra curto.
3. **Sem WebGL.** Em `chrome://flags`, desligue a aceleração, ou abra o Chrome com `--disable-gpu`:
   a garagem abre direto na vista lateral, sem erro.

## Da fase 5 (ainda não testada)

O roteiro completo está em [`teste-manual-fase-5.md`](teste-manual-fase-5.md). O essencial:

1. Abra `/viagens/<id>/viagem?diag=1` num dia com paradas e a rota já buscada (abra o dia no
   Roteiro com internet uma vez).
2. Toque em "Rever o dia" e leia o fps em Alta e em Leve durante o movimento.
3. Na primeira abertura do dia, confira a abertura: o relevo sobe, a estrada se desenha e o carro
   entra.
4. Marque "Chegamos!" em outro aparelho e reabra: o carro anda até a parada (replay).
5. À noite, ou pelo chip "Noite", confira faróis, janelas acesas e o texto maior.

## O que conferir no console (desktop, dev)

- `viajei: garagem no primeiro quadro em N ms` ao abrir a garagem.
- `?garagem=tudo` libera tudo para ver os cinco carros com todos os acessórios (só em `pnpm dev`).
- Nenhum erro do three nem do R3F.

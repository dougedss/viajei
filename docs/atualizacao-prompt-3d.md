# Atualização do prompt: maquete 3D e decisões de 04/11/2026

**Para:** o chat de planejamento, que mantém `docs/prompt-implementacao.md`.
**Objetivo:** incorporar ao prompt as decisões abaixo e gerar a versão nova. Em seguida, um chat novo executa o Passo 0 e inicia o desenvolvimento.

Este documento foi escrito pelo chat de implementação depois de apresentar o Passo 0, publicar o style tile e construir um protótipo 3D. Nada foi codificado no projeto além dos arquivos em `docs/`.

## Materiais produzidos

| Arquivo | O que é | Link |
|---|---|---|
| `docs/style-tile.html` | Style tile v1: paleta, fontes, trilha 2D, visão geral, retrospectiva, garagem 2D | https://claude.ai/artifact/3zYQcTF6NynkMjkr51qj56 |
| `docs/prototipo-3d.html` | Protótipo 3D da trilha (maquete do dia) e da garagem, gerado dos dados reais da rota São Paulo → Ubatuba | https://claude.ai/artifact/XJmJHqP4gMYCbXt1zAy56t |
| `docs/passo-0-2026-11-04.md` | O documento do Passo 0 apresentado (estrutura, offline, DDL completa com RLS, gamificação, fases) | — |

Douglas aprovou a direção do protótipo 3D em 04/11/2026. O Passo 0 em si ainda não recebeu aprovação formal; as respostas já dadas estão no fim deste documento.

## Decisões aprovadas

### 1. A trilha do Modo Viagem é uma maquete 3D vista de cima, com o dia inteiro na tela
- A câmera fica **parada**, enquadrando o dia completo, como no mockup 2D do style tile. Quando o carro para, a pessoa quer ver o progresso e o que falta, não um close de onde está.
- O carro anda pela trilha nessa mesma visão. **Não há deslocamento de câmera durante o avanço.**
- A câmera só se aproxima **sozinha, em eventos específicos, e volta**: as "curiosidades do caminho", derivadas dos dados (primeira entrada em cada cenário, ponto mais alto do dia, a serra "desce 640 m em 7 km", "o mar a menos de 2 km"). Cada uma dura uns 2–3 segundos, com uma legenda.
- O traçado em S é estilizado para caber na tela; a geografia real entra pelos números (km, duração, altitude) e pelo relevo.
- Pílulas das paradas (nome, horário, ícone), anéis de estado (concluída, próxima, pendente), carro no último nó concluído, "Partiu!" e "Chegamos!" seguem o style tile.
- Por quê: o dia inteiro num olhar é o ponto forte do mockup; o 3D rende nos cenários, na garagem e nas curiosidades, sem virar jogo.

### 2. O cenário é gerado da geografia real da rota, em cerca de quatro partes
- Quando o roteiro de um dia fica pronto e há internet, o app busca a rota real por estrada entre as paradas e a altitude a cada 2 km, e guarda no celular. Serve offline.
- Cada trecho é classificado cruzando: altitude e inclinação, distância até o mar, população da cidade mais próxima (base IBGE, 5.570 municípios, embutida no app) e bioma (mapa IBGE simplificado, embutido). Linha de costa embutida (Natural Earth, ~50 KB).
- O resultado são partes como **cidade grande, interior, plantação, praia**; a serra aparece pela altitude. Transições suaves entre elas. Não precisa ser levado a sério por metro: a escala é "quatro partes por dia".
- Toques do roteiro entram: parada de vinícola planta parreirais, hotel vira miniatura, represa vira lago.
- Fora do Brasil: só altitude e costa, cenário genérico. Brasil completo é o escopo da primeira versão.
- Consequências no prompt: a coluna `theme` de `trip_days` **sai** (o cenário é derivado); a importação com IA não precisa inferir tema; entra uma Edge Function `route-day` (OpenRouteService, chave `ORS_API_KEY` no servidor, 2.000 rotas/dia no plano gratuito; o servidor público do OSRM só em desenvolvimento); rota e leitura do lugar ficam só no celular, como o clima, porque são recalculáveis.

### 3. Avanço na trilha: botões e a posição do celular movendo o carrinho. Nunca um navegador.
- "Partiu!" e "Chegamos!" continuam existindo e funcionam sem GPS.
- Com permissão, a posição do celular **move o carrinho na trilha** e registra a hora real do Partiu! (ao sair do raio da parada) e do Chegamos! (ao entrar no raio da próxima e permanecer alguns minutos). O XP de pontualidade usa a hora real.
- **Regras duras:** sem rota passo a passo, sem voz, sem "vire à direita", sem mapa de ruas, sem recálculo de rota, nada que premie velocidade, nada que exija interação de quem dirige. Se o GPS falhar, nada quebra. Douglas tem receio da responsabilidade de um GPS; a resposta é não ser um.
- Desvio: se o carro sair mais de 2 km da rota, o carrinho aparece fora da trilha com "Fora da rota · 3 km".
- Trilha gravada: o caminho real fica salvo (tabela `trip_tracks`, uma linha por dia e pessoa, id = v5(trip_day_id, user_id)) para a retrospectiva sobrevoar por onde passaram de fato. Como sincroniza, quem ficou em casa pode ver o carrinho andando (pendente: ligar para todos os membros ou não).
- Limites conhecidos: PWA não rastreia em segundo plano no iOS nem no Android; o app mantém a tela ligada no Modo Viagem (Wake Lock); parado por 10 min, reduz o GPS.
- Pendente: chegada automática por presença (recomendado) ou sempre com um toque de confirmação.

### 4. Garagem 3D estilo showroom
- Luz de estúdio, carro girando com o dedo, tinta com verniz e brilho metálico, acessórios encaixando com animação e som.
- Cinco carros modelados **por código** em low-poly com luz realista (hatch livre, sedã nível 2, SUV 3, picape 4, kombi 5), 8 cores (dourado no nível 5), acessórios desbloqueados por conquista. Trocar por modelos de artista depois não muda código.
- O carro escolhido aparece na trilha, no card, no cabeçalho, na retrospectiva e na imagem compartilhada.

### 5. Retrospectiva "Viajei!" como filme sobre a maquete
- A câmera sobrevoa a maquete (e a trilha gravada) do início ao fim, as fotos aparecem, termina no carro estacionado. Exporta vídeo vertical de 15 s para stories (validar no iPhone).

### 6. Visual menos infantil
- Tipografia **Barlow** (texto) e **Barlow Condensed** (números e títulos), inspiradas em placas de rodovia. Substituem Fredoka e Nunito.
- Paleta de fim de tarde, menos saturada: asfalto, céu em degradê, laranja pôr do sol como acento.
- Botões, horários e anéis continuam em HTML por cima da cena, nítidos e legíveis no sol.

### 7. Plataforma: iPhone primeiro, Android em seguida, os dois igualmente bem
- Douglas testa no iPhone; tem Android para testar no futuro. O app precisa funcionar igual e muito bem nos dois: matriz de testes com os dois, WebGPU no iOS 26+ e no Chrome do Android com WebGL2 de reserva, Wake Lock, geolocalização e exportação de vídeo validados em ambos.

### 8. Stack 3D (adicionar à stack do prompt)
- `three` 0.187 com `WebGPURenderer` (fallback automático para WebGL2), `@react-three/fiber` 9.8 (a 10 ainda é alfa), `@react-three/drei` 10.7. Materiais padrão; TSL só se necessário.
- Sem física: `@react-three/rapier` **não entra** (o Modo Dirigir livre foi descartado).
- Render sob demanda: parado, a maquete redesenha poucas vezes por segundo; níveis de qualidade Leve/Alta com rebaixamento automático por fps; `prefers-reduced-motion` desliga os mergulhos de câmera.
- Dados embutidos: linha de costa, municípios IBGE com população, biomas simplificados (~200 KB no total).

### 9. Fases revisadas (11)
1. **Base** — scaffold, tokens, primitivos de UI, CI, Supabase local, migrations 0001–0002, auth, perfil, convites.
2. **Offline, PWA e viagens** — Dexie, outbox, sync, Realtime, service worker, CRUD de viagens e membros, deploy para testar no celular.
3. **Roteiro, rota real e trilha** — 0004, dias derivados, paradas com arrastar, Nominatim, deep links; Edge Function `route-day` + altitude + leitura do lugar; lista acessível da trilha (fallback e leitor de tela); `import-schema.ts` com o seed.
4. **Mundo 3D: maquete do dia** — gerador da maquete, cenários, câmera parada + curiosidades, Partiu!/Chegamos!, modo noite, níveis de qualidade; posição do celular movendo o carrinho, geofences, `trip_tracks`.
5. **Garagem 3D** — 5 carros, cores, acessórios, showroom, regras puras de desbloqueio.
6. **Reservas, anexos e memórias** — 0005, upload com compressão, cache de Blob, folha pós-parada, diário.
7. **Listas, missões, contatos e gastos** — 0006, sugestões de missão, ligar e WhatsApp, orçamento.
8. **Progressão e retrospectiva** — 0007, XP, níveis, conquistas, cosméticos, filme "Viajei!" com exportação.
9. **Importação com IA** — 0008, Edge Function em streaming, limites, preview editável.
10. **Mapa e clima** — Leaflet, cache de tiles, Open-Meteo.
11. **Polish e E2E** — Playwright completo (inclusive offline), iPhone e Android, acessibilidade, Lighthouse, README, expurgo de viagens excluídas.

### 10. Conquistas afetadas
- "Pé na areia" (`coast`) passa a ser real: chegar a menos de 1 km do mar. Entra "Serra abaixo": descer 500 m num dia. "Madrugador" e "Relógio suíço" usam a hora real de saída quando houver posição.

## O que o protótipo 3D prova e o que não cobre

Prova: a maquete gerada só dos dados (rota real de 218 km, altitude de 758 m a 4 m, cidades, costa) com cidade grande → interior → plantação → serra → praia; o dia inteiro na tela; curiosidades com mergulho de câmera; modo noite; garagem showroom com o carro customizado refletido na trilha; 60 fps com WebGPU no Chrome do Mac; chip de fps/motor/qualidade; render reduzido quando parado.

Não cobre: sons, desfoque de maquete (tilt-shift), os outros quatro carros, fotos nos nós, posição real do celular (no protótipo o avanço é pelos botões), medição de fps no iPhone e no Android.

## Respostas já dadas por Douglas (não perguntar de novo)
- Direção do 3D: aprovada, com câmera parada e curiosidades automáticas.
- Arte: modelada por código, não por artista.
- Celular: iPhone primeiro; Android depois; os dois têm de funcionar igual.
- Avanço: posição do celular move o carrinho (sem navegação).
- Modo Dirigir livre com joystick: **rejeitado** ("a ideia é que não seja nenhum jogo").
- Leitura em voz alta: **rejeitada** (vira GPS).

## Ainda em aberto (o Passo 0 novo deve perguntar)
1. E-mail dos commits: usar o noreply `203018054+dougedss@users.noreply.github.com` só neste repo?
2. Conta ou organização pessoal do Supabase (a logada no CLI tem organizações de clientes) e do Vercel (a logada é `reitechkairos-commits`); região São Paulo.
3. SMTP próprio para produção (Resend?) e domínio.
4. Aprovação das versões (React 19.3 + React Compiler, Vite 8, TS 6.0, Zod 4, pnpm) e das dependências novas.
5. Aprovação dos 17 ajustes técnicos do Passo 0 (LWW por coluna, UUID v5, índice fracionário, `stop_memories`, exclusão soft, convite só com e-mail confirmado etc.).
6. Chegada automática por presença ou com confirmação.
7. Posição ao vivo para quem ficou em casa: ligar para todos os membros?

## Ambiente encontrado (o próximo chat deve conferir de novo, regra 11)
`gh` ativo como `dougedss`; SSH responde `dougedss` em todos os aliases; `git config --global user.email` é o do trabalho (brcaptura), por isso o repo precisa de e-mail local; Docker Desktop instalado mas parado; Supabase CLI 2.19.5 (atual 3.0.0; fixar como devDependency); Blender não instalado.

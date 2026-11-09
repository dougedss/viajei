# Viajei · Prompt de implementação (v6, 09/11/2026)

**Histórico.** v6 (09/11/2026, fim da fase 15): as paradas que se registram sozinhas com o mapa aberto (o detector, o lugar pelo Nominatim reverso, `source: 'auto'` com as horas medidas, os dois celulares numa parada só), o tipo Posto (`fuel`) e os avisos abrindo `/viagens/:tripId`. v5 (08/11/2026, fim da fase 14): a viagem abre no mapa; a tela da viagem inteira, sem rolagem; o GPS sempre que o mapa está aberto e "Tela acesa" no lugar do modo painel; a câmera que segue o carro; as miniaturas; Detalhes e a tabela de rotas. v4 (08/11/2026): a regra do não-preencher e as fases 13 a 21.

> Você é o agente de implementação do Viajei. Este documento é a fonte de verdade do projeto: contexto, regras de trabalho, stack, produto, mundo 3D, uso com a tela apagada, offline, modelo de dados, gamificação e plano por fases. Ele consolida o planejamento, o Passo 0 já apresentado (`docs/passo-0-2026-11-04.md`), as decisões de 04/11/2026 sobre a maquete 3D (`docs/atualizacao-prompt-3d.md`) e as decisões do mesmo dia sobre notificações, catch-up e replay (`docs/atualizacao-prompt-notificacoes.md`). Leia os quatro antes de agir. Comece pelo **Passo 0** da última seção e espere aprovação formal antes de escrever código.

**Documentos companheiros (leia todos):**

| Arquivo | O que é |
|---|---|
| `docs/passo-0-2026-11-04.md` | Passo 0 apresentado: checagem das contas, versões, DDL completa com RLS (migrations 0001 a 0008), fluxo offline, gamificação. **A DDL de lá é a base; não a refaça do zero.** Com a migration de notificações, as de 0005 em diante renumeram (seção 8.1) |
| `docs/atualizacao-prompt-3d.md` | Decisões aprovadas sobre a maquete 3D, posição do celular, garagem showroom, retrospectiva em filme, Barlow, iPhone e Android |
| `docs/atualizacao-prompt-notificacoes.md` | Decisões aprovadas sobre uso com a tela apagada: notificações push, "Agora", catch-up ao abrir, replay, modo painel, calendário, fase nova e DDL nova |
| `docs/style-tile.html` | Style tile v1 (https://claude.ai/artifact/3zYQcTF6NynkMjkr51qj56). Paleta e telas aprovadas na direção; fontes já substituídas por Barlow |
| `docs/prototipo-3d.html` | Protótipo da maquete e da garagem (https://claude.ai/artifact/XJmJHqP4gMYCbXt1zAy56t). Mostra a direção aprovada |

---

## 1. Contexto e objetivo

Web app PWA para planejar e, principalmente, **seguir** roteiros de viagem de carro. O problema: o roteiro bonito montado antes da viagem vira um documento perdido na estrada. Confirmações de hotel ficam no WhatsApp, telefones em prints, e ninguém sabe se já está na hora de sair para a próxima parada. Em lugar sem sinal, nada abre.

O Viajei resolve isso com três pilares:

1. **Tudo da viagem em um lugar**, legível **offline por completo**.
2. **Modo Viagem**: uma maquete 3D do dia, vista de cima, com o carro da viagem avançando pela trilha, a próxima saída e o "sair às HH:MM" calculado.
3. **Experiência gamificada e bonita**: seguir o roteiro tem que ser divertido, não burocrático. O app precisa impressionar. E **nunca** vira um jogo nem um navegador GPS.
4. **Funciona com a tela apagada**: a viagem roda no servidor, que avisa a hora de sair por notificação. O app é aberto em momentos, tem que ser útil em cinco segundos, e quando abre o carrinho repõe o que aconteceu desde a última vez.

Caso real para desenvolver e testar: viagem Papanduva/SC até Montenegro/RS, 11 a 14/12/2026, com concurso no domingo de manhã, hotéis em Bom Princípio e Canela, vinícolas e cascatas. Dados completos na seção **Seed**.

Dono do projeto: Douglas. Conta GitHub pessoal: `dougedss`.

---

## 2. Regras de trabalho (obrigatórias)

1. **Antes de qualquer código**, execute o Passo 0 da seção 16 e espere aprovação explícita. O Passo 0 já foi apresentado uma vez; o seu é um **delta** sobre o documento salvo, não um recomeço.
2. **Sempre a melhor e mais elegante solução, nunca a que fica pronta mais rápido.** Não há pressa. Quando existir uma versão simplificada e uma versão bem feita, faça a bem feita e explique o porquê. Não corte escopo por velocidade sem perguntar.
3. **Experiência acima do custo de desenvolvimento.** Gamificar, deixar bonito e impressionar são requisitos. Nunca justifique uma escolha de UI por ser "barata".
4. **Não é um jogo e não é um GPS.** Sem rota passo a passo, sem voz, sem "vire à direita", sem mapa de ruas no Modo Viagem, sem recálculo de rota, nada que premie velocidade, nada que exija interação de quem dirige. O Modo Dirigir livre com joystick e a leitura em voz alta foram **rejeitados**. Se o GPS falhar, nada quebra.
5. **iPhone primeiro, Android em seguida, os dois igualmente bem.** Toda funcionalidade de dispositivo (WebGPU e WebGL2, Wake Lock, geolocalização, exportação de vídeo, instalação do PWA) entra na matriz de testes dos dois.
6. **Um commit por fase**, mensagem em português no formato `fase N: resumo curto`. Migrations numeradas em `supabase/migrations/`.
7. **Explique o porquê de cada decisão técnica não óbvia** em poucas linhas, no chat e em `docs/decisoes.md` (um registro curto por decisão: contexto, decisão, consequência). O Douglas quer aprender o jeito certo, não só receber código.
8. **Testes fazem parte de cada fase.** Vitest para lógica pura, pgTAP para RLS e funções SQL, Playwright para o fluxo principal, e CI rodando tudo em cada push.
9. **Nunca coloque a chave da Anthropic, a chave do OpenRouteService nem a chave secreta do Supabase no client.** Documente todas as variáveis em `.env.example`.
10. **Se algo estiver conflitante ou fora do razoável**, aponte e proponha alternativa antes de implementar. Se o Douglas reafirmar, siga.
11. **Contas:** existem várias contas na máquina. Antes de criar repositório, projeto ou dar push, rode `gh auth status`, `ssh -T git@github.com`, `git config user.email`, `supabase projects list` e `vercel whoami`, mostre o resultado e **não crie nada em conta de cliente**. O estado encontrado em 04/11 está na seção 15.
12. **Não pergunte de novo o que já foi respondido** (seção 15). Pergunte só o que está aberto, com a sua recomendação ao lado.
13. **UI em português do Brasil. Mobile-first.** No desktop só precisa não quebrar. Códigos de domínio em inglês; rótulos pt-BR em `_shared/constants.ts`.
14. **Não mude a stack sem perguntar.** As bibliotecas da seção 3 já estão aprovadas; as versões aguardam o ok do Passo 0.
15. **Nada depende do app estar aberto, e o app tem que ser útil em cinco segundos de tela ligada.** Motorista no Waze, passageiro no WhatsApp, celulares bloqueados: esse é o cenário normal. Tela ligada é opcional (modo painel). Toda funcionalidade do dia precisa funcionar por notificação, por catch-up ao abrir, ou pelos dois.
16. **A regra do não-preencher.** O app nunca pede que a pessoa preencha o que ele pode ler, descobrir ou perguntar numa frase. Formulário é a última opção, nunca a primeira. Quando precisar perguntar, diz antes quantas perguntas são, oferece opções e aceita texto livre.

---

## 3. Stack e versões

Versões conferidas no npm em 04/11/2026 pelo chat de implementação. Reconfira com `pnpm view` antes de instalar e proponha só o que mudou.

| Camada | Escolha | Por quê |
|---|---|---|
| Gerenciador | **pnpm** | Já instalado, lockfile estrito |
| Front | **React 19.3 + React Compiler** + TypeScript **6.0** (strict) + **Vite 8** | react-router 8, react-leaflet 5 e @react-three/fiber 9 exigem React 19; `@vitejs/plugin-react` 6 só roda no Vite 8; typescript-eslint ainda não aceita TS 7 |
| Estilo | Tailwind 4 com tokens em `@theme`, primitivos próprios em `components/ui` | Fontes self-hosted via `@fontsource` (**Barlow** e **Barlow Condensed**) |
| Rotas | react-router 8, rotas lazy | Rotas em português |
| Estado servidor | TanStack Query 5 **somente** para dados exclusivos de servidor: perfil, convites pendentes, importação com IA, clima, rota do dia | Tudo da viagem passa pelo Dexie |
| Local-first | Dexie 4 + `dexie-react-hooks`; `fake-indexeddb` nos testes | Fonte de verdade da UI |
| Validação | **Zod 4** | O SDK da Anthropic aceita `^3.25 \|\| ^4`; `@hookform/resolvers` 7 também |
| PWA | vite-plugin-pwa 2 (Workbox), estratégia `injectManifest` com `src/sw.ts` próprio, manifest pt-BR | Instalável, `navigateFallback`; o SW trata push, cliques em notificação e grava na fila offline |
| Push | Web Push com VAPID; Edge Function `send-notifications`; agendamento com `pg_cron` + `pg_net`; biblioteca Web Push compatível com Deno; `setAppBadge` | Chave pública VAPID no client, privada e `CRON_SECRET` só no servidor |
| Calendário | Geração de `.ics` no client com alarme antes de cada "sair às" | Rede de segurança sem push e sem servidor |
| Backend | Supabase: Auth, Postgres com RLS, Storage, Edge Functions (Deno), Realtime (broadcast). CLI fixada como devDependency | Chaves novas: `VITE_SUPABASE_PUBLISHABLE_KEY` no client; nenhuma chave secreta no bundle |
| IA | `@anthropic-ai/sdk`, modelo **`claude-sonnet-5-5`**, saída estruturada | Seção 9 |
| Rota real | Edge Function `route-day` com OpenRouteService (chave no servidor) | Seção 6.2 |
| 3D | **three 0.187** com `WebGPURenderer` e fallback automático para WebGL2, **@react-three/fiber 9.8**, **@react-three/drei 10.7**. Materiais padrão; TSL só se necessário. **Sem física** (`@react-three/rapier` não entra) | Seção 6 |
| Animações 2D | `motion` 14, `canvas-confetti` | Respeitar `prefers-reduced-motion` |
| Ordem | `fractional-indexing` | Índice fracionário das paradas e itens |
| Drag and drop | `@dnd-kit/core` 6.3 + `@dnd-kit/sortable` 10 | Alça + sensor de toque com atraso |
| Formulários | `react-hook-form` + `@hookform/resolvers` 7 | |
| Datas | `date-fns` com locale `ptBR` | Nunca `Date` em UTC para hora de parede |
| Ícones | `lucide-react` | |
| Mídia | `browser-image-compression`, `html-to-image`, Web Share API, MediaRecorder para o vídeo da retrospectiva | |
| Mapa | `leaflet` + `react-leaflet` 5 com tiles do OSM | Tela de mapa, fora do Modo Viagem |
| Clima | Open-Meteo (gratuito, sem chave) | |
| Geocoding | Nominatim (OSM), 1 requisição por segundo, debounce; parser de link do Google Maps | |
| Dados embutidos | Linha de costa (Natural Earth), municípios IBGE com população, biomas simplificados (~200 KB) | Geração do cenário offline |
| Testes | Vitest 5, pgTAP (`supabase test db`), Playwright 1.64 | |
| CI | GitHub Actions: lint, tipos, Vitest, pgTAP e Playwright em todo push | |
| Hospedagem | Vercel (conta pessoal, a confirmar) | HTTPS obrigatório para o service worker |

---

## 4. Produto: funcionalidades do MVP

### 4.1 Viagens e membros
- Login com e-mail e senha, recuperação de senha, perfil com nome e cor (a cor identifica a pessoa em avatares, itens marcados, gastos e na trilha gravada).
- Cada usuário tem suas viagens. O dono convida por e-mail. Papéis: **owner** (tudo, inclusive membros e exclusão) e **member** (vê e edita tudo da viagem, menos membros e exclusão).
- Convite sem envio de e-mail pelo app: fica pendente em `trip_members` e aparece na tela inicial de quem logar com aquele e-mail **confirmado**. RPCs `claim_invites`, `accept_invite`, `decline_invite`, `my_pending_invites`.
- Exclusão de viagem é **soft** (só o dono); expurgo por job no servidor depois de 30 dias. Membro removido ou viagem expurgada: o `sync_pull` responde `revoked` e o app limpa os dados locais.
- Viagem tem: nome, datas, origem, orçamento, observações e o **carro da viagem** (`car_model`, `car_color`, `car_accessories`).

### 4.2 Roteiro por dia
- Viagem → dias → paradas. **Dias são derivados das datas da viagem**: um por data, id determinístico `v5(trip_id, date)`, criados pelo client ao salvar a viagem e ao mudar as datas. Sem `position`.
- Parada: horário previsto, tipo, nome, endereço, coordenadas, "fecha às" (`closes_at`), deslocamento estimado até a próxima, observações, link.
- Tipos: `origin`, `transit`, `nature`, `winery`, `hotel`, `food`, `event`, `city`, `other`. Cada tipo tem ícone e cor.
- Formulário com busca de endereço (Nominatim) e campo "colar link do Google Maps" que extrai coordenadas. Latitude e longitude nunca são digitadas na mão.
- Botões "abrir no Google Maps" e "abrir no Waze" por parada: deep link com lat/lng quando houver, senão com o endereço. É assim que se navega; o Viajei não navega.
- Reordenar por drag and drop com alça, mais botões subir/descer. Ordem por **índice fracionário** (`position text collate "C"`): um arrasto gera um patch só, e reordenações simultâneas não se misturam.
- Quando a rota real do dia existe (seção 6.2), as durações dos trechos **sugerem** `travel_minutes_to_next` para as paradas sem valor. O usuário confirma.

### 4.3 A tela da viagem: a maquete inteira, o "Agora" e o GPS
A viagem é o mapa (fase 14, D174): tocar na viagem abre a maquete 3D inteira na tela, sem rolagem, do dia atual (dia cuja data é hoje; senão o próximo; senão o último). Durante a viagem, abrir o app cai direto nela. A visão geral de antes é "Detalhes" (`/viagens/:tripId/detalhes`), o centro das outras telas. Especificação completa na seção 6. Em resumo:
- **A barra do dia**, fixa no alto: o nome da viagem pequeno (leva à lista), a data do dia mostrado ("sáb, 12 dez · Dia 2"), "Dia anterior" e "Dia seguinte", o chip **"Hoje"** quando a pessoa saiu do dia de hoje, e os botões de ícone "Lista/Maquete" e **"Tela acesa"**.
- **O "Agora" compacto**, numa barra sobre a maquete, embaixo, útil em cinco segundos: a frase ("A caminho de · Parque · chega às 10:00 · 12 min"; **"sair às HH:MM"** parado, o horário da próxima parada menos o deslocamento), a ação principal grande (**Partiu!** ou **Chegamos!**) e, só quando existem, os chips "Ver reserva", a outra marcação e "Pular parada". Um botão flutuante **"Detalhes"** leva ao resto.
- **Partiu! e Chegamos! pelo GPS sempre que o mapa está aberto** (D176): com a tela visível, o dia de hoje, a viagem em andamento e a posição permitida, o app acompanha a posição, grava a trilha e marca sozinho pelas regras da D47, com o Desfazer de 10 s. Os botões continuam, para quando a posição está negada, errada ou atrasada e para o VoiceOver; nunca forçam nada. "Tela acesa" (Wake Lock) é um toggle à parte, lembrado por aparelho.
- **As paradas fora do roteiro se registram sozinhas** (fase 15, D181 a D189): com o mapa aberto, o carro parado 8 min a mais de 40 m da linha da estrada, ou 20 min em qualquer lugar, vira uma parada (`source: 'auto'`, a chegada e a saída medidas), com o nome e o tipo do lugar pelo Nominatim reverso ("Parada às 14h20" sem sinal, com o nome quando a rede volta), na lista na ordem do horário, com o toast "Parada registrada: …" e Desfazer, sem pergunta nenhuma. No raio de uma parada do dia é o Chegamos!; o trânsito é ignorado; dois celulares no mesmo carro registram uma parada só. Com o app fechado nada acontece.
- A câmera fica **alta e atrás do carro, olhando a próxima parada** (D177): parado, o carro ocupa um quinto da altura da tela; em movimento, recua para a estrada caber. Cada parada é uma **miniatura 3D do seu tipo** (D178); tocar nela, na pílula ou na linha da lista abre a folha da parada (Maps, Waze, Chegamos!, "+ Gasto").
- Pílulas das paradas (nome, horário, ícone) e anéis de estado (concluída, próxima, pendente) em HTML por cima da cena, nítidos no sol; só os nós em cena, e a da próxima parada presa ao topo quando está fora.
- Semântica da trilha: o carro fica **no último nó concluído**; o halo pulsa **no próximo**; **"Partiu!"** põe o carro na estrada (`departed_at`); **"Chegamos!"** conclui (`done_at`, `done_by`), com confete, vibração no Android e, só no toque, a folha de memória. "Pular parada" marca `skipped`.
- **Ao abrir, o app faz o catch-up e o replay** (seção 6.4): uma leitura de posição, reconciliação do estado e o carrinho andando do ponto onde parou até o atual, disparando os eventos do caminho.
- O que acontece aparece num único lugar sobre a maquete e some: "Desde a última vez", "Vocês passaram por…", o pedido de posição, "Como foi?", "Viajei!" depois da viagem. Aviso quando a parada atual está perto do `closes_at`. Modo noite automático.
- **Lista acessível da trilha**: a mesma informação em lista, no lugar da maquete, atrás do botão do topo (lembrado por aparelho) e sempre que WebGL não está disponível; o VoiceOver e o TalkBack precisam dela.

### 4.4 Reservas e confirmações
- Tipos `hotel`, `ticket`, `restaurant`, `other`. Campos: nome, `start_at`, `end_at`, código de confirmação, valor, política de cancelamento (texto + data limite), telefone (E.164), endereço, `booked_via`, observações. Vinculada a uma parada ou a um dia.
- Anexos (prints e PDFs) no Storage, **imutáveis** (sem policy de update), com cache offline em IndexedDB como Blob. Upload só online, com aviso claro.

### 4.5 Checklists e missões
Três listas por viagem em `checklist_items`, por `kind`:
- `before` ("Antes de viajar") e `pack` ("Mala"): itens marcáveis, registrando quem e quando. Anel de progresso. Ao fechar as duas antes da data de início, o app declara **"Pronto para partir"** com animação e desbloqueia a conquista.
- `quest` ("Missões da viagem"): itens com pontos de XP, opcionalmente ligados a uma parada. `source` = `user`, `system` (sugerida por regra ao criar parada, com id determinístico `v5(stop_id, 'quest:' || regra)`) ou `ai`. Sugestões nascem com `status = 'suggested'` e o usuário aceita ou descarta.

### 4.6 Contatos
Nome, telefone E.164, tipo `hotel`, `attraction`, `emergency`, `other`, observações. Botões ligar (`tel:`) e WhatsApp (`wa.me`).

### 4.7 Gastos
Valor, categoria `lodging`, `fuel`, `food`, `attractions`, `other`, data, quem pagou (membro aceito da viagem), parada opcional, observações. Totais por categoria e geral contra o orçamento, com barra que muda de cor.

### 4.8 Importar roteiro com IA
Usuário cola texto livre. A Edge Function devolve JSON estruturado com dias, paradas, reservas, contatos, itens de checklist, missões sugeridas e "não classificados". **Preview editável, progressivo (streaming), antes de salvar. Nunca salvar direto.** Mesmo schema Zod no servidor e no client. Seção 9.

### 4.9 Mapa e clima
- Tela de mapa do dia (Leaflet + OSM), fora do Modo Viagem: marcadores por tipo, linha da rota real quando houver, enquadramento automático. Online; offline mostra o que houver em cache de tiles.
- Clima por dia via Open-Meteo pela primeira parada com coordenadas: ícone, máxima, mínima, chuva. Cache em Dexie com `fetched_at`.

### 4.10 Memórias, diário e retrospectiva
- Ao concluir uma parada: nota de 1 a 5, foto e texto curto, tudo opcional, **por pessoa** (`stop_memories`, id `v5(stop_id, user_id)`), para duas pessoas não sobrescreverem uma à outra.
- **Diário**: linha do tempo das paradas concluídas com fotos, notas e memórias de todo o time.
- **Retrospectiva "Viajei!"**: filme sobre a maquete. Seção 6.7.

### 4.11 Gamificação
Garagem 3D, XP, níveis, conquistas e cosméticos. Seção 10.

### 4.12 Uso com a tela apagada
O cenário normal: motorista no Waze, passageiro no WhatsApp, celulares bloqueados. A viagem roda no servidor e o app é aberto em momentos.
- **Notificações push agendadas pelo servidor**, por pessoa e viagem, cada tipo com toggle e antecedência: **sair em N min** (padrão 15; "Sair em 15 min para Casa Valduga · 42 min de estrada") · **hora de sair** · **fecha em 1 h** (parada com `closes_at` não concluída) · **briefing da manhã** (paradas, primeira saída, clima; padrão 7h) · **véspera** (itens de "antes" e "mala" faltando) · **prazo de cancelamento** de reserva (véspera do `cancel_until`) · **time** (outro membro marcou Chegamos!; padrão desligado) · **retrospectiva pronta**.
- **No Android, Partiu! e Chegamos! direto do botão da notificação**, sem abrir o app: o service worker grava na mesma fila offline e tenta enviar na hora. No iPhone não há botões; o toque abre o "Agora" com o botão em destaque.
- **Permissão no momento certo:** na primeira abertura de uma viagem que começa em até 7 dias, uma folha explica o que o app vai avisar e pede a permissão. Nunca na primeira abertura do app. No iPhone, push só funciona instalado na tela de início, então a folha de instalação vem antes.
- **Selo no ícone**: número de pendências, ou um ponto quando a próxima saída está a menos de 30 min. Limpa ao abrir.
- **Exportar para o calendário**: `.ics` do dia ou da viagem, um evento por parada com endereço e link do Maps, alarme 15 min antes de cada "sair às". Funciona sem push e sem servidor.
- Limitações assumidas: Partiu! marcado sem sinal não chega ao servidor a tempo e pode vir um "hora de sair" redundante (aceitável com dedupe e janelas curtas). O modo Foco "Dirigindo" do iPhone silencia notificações; o celular que importa é o do passageiro. Um PWA não rastreia posição em segundo plano em nenhuma plataforma, por isso existem o catch-up e o modo painel.

---

## 5. Offline e sincronização (requisito central)

### 5.1 Princípios
- **Dexie é a fonte de verdade da UI.** Componentes leem via `useLiveQuery`. `mutate(table, id, changes)` é a **única porta de escrita**: atualiza a linha local e enfileira na `outbox` **na mesma transação Dexie**, online ou offline.
- **IDs gerados no client.** UUID v4 em geral; **UUID v5 determinístico quando há chave natural** (dias, convites, memórias, conquistas, eventos de XP, missões sugeridas, trilhas gravadas), para dois aparelhos sem sinal escreverem a mesma linha em vez de colidirem no `unique`. O banco confere o id com `check`.
- **`trip_id` em todas as tabelas da viagem**, FKs compostas `(x_id, trip_id)` (a checagem de FK ignora a RLS; sem a composta um membro da viagem A apontaria uma parada para um dia da viagem B).
- **Soft delete** com `deleted_at`. Exclusão vira patch; o pull traz a lápide; o client remove a linha e seus filhos.
- **Conflito resolvido por coluna** (`field_versions jsonb` por linha, trigger `sync_guard`). Cada escrita leva a hora da edição de cada coluna tocada; o servidor aceita coluna a coluna e devolve quais foram **superadas** por uma edição mais nova. Por quê não por linha: o passageiro sem sinal toca "Chegamos!" às 14:00; às 14:30 alguém em casa edita a observação da mesma parada; às 15:00 o carro pega sinal. Por linha, o `done_at` seria descartado. Por coluna, as duas edições ficam.
- **Duas marcas de tempo:** `updated_at` e `field_versions` (hora da edição, do client, decidem conflito, limitadas pelo servidor a "agora + 2 min") e `synced_at` (`clock_timestamp()` no servidor, cursor do pull).
- **Entidades somente-anexar** (`xp_events`, `achievements`) nunca conflitam: id determinístico, violação tratada como `ignored`.

### 5.2 Ciclo
```
 Toque em "Chegamos!"
        │
        ▼
 ┌──────────── uma transação Dexie (atômica) ─────────────┐
 │ stops.update(id, {done_at})  +  outbox.add(patch)       │   UI e fila nunca divergem
 └─────────────────────────────────────────────────────────┘
        │ useLiveQuery redesenha na hora, com ou sem rede
        ▼
 Motor de sync: uma aba por vez (Web Locks API)
 gatilhos: escrita · online · foco · abrir o app · aviso do Realtime · 60 s visível
        │
        ▼
 1. PUSH   coalesce(outbox) → ordena por rank de tabela (pais antes de filhos)
           → rpc sync_push(lote ≤ 200) numa transação, como o usuário (RLS vale)
           por operação: applied · ignored · stale · error (+ superseded[])
           applied / ignored / stale → sai da fila (superseded e stale geram aviso discreto)
           error de rede → backoff 1 s, 2 s, 4 s… até 60 s; após 5 tentativas → "Pendentes"
           error de regra (check, RLS) → direto para "Pendentes", sem insistir
        │
        ▼
 Postgres: before sync_guard (imutáveis, versão por coluna, synced_at)
           after  broadcast (1 aviso por viagem por transação no tópico trip:<id>)
        │                                   │
        │                                   └──► Realtime ──► outros aparelhos agendam pull (800 ms)
        ▼
 2. PULL   rpc sync_pull(trip, cursor − 5 s) → linhas com synced_at > cursor, ou revoked
           rpc sync_pull_user(cursor) → memberships, achievements, xp_events
        │
        ▼
 applyPull, numa transação Dexie: upsert · lápide remove linha e filhos ·
   linhas com pendência na outbox recebem as mudanças pendentes por cima (sem piscar) ·
   revoked apaga a viagem local e avisa · cursor ← server_time
```
- Por quê ordenar por tabela depois de coalescer: FIFO puro com coalescência quebra FKs (crio a parada P no dia D1, crio D2, movo P para D2; a fusão põe P antes de D2).
- Contratos das RPCs, whitelist (`private.sync_tables` com `scope`, `mode`, `rank`) e corpo completo das funções: `docs/passo-0-2026-11-04.md`, migration 0003.
- Operação da outbox: `{ seq, trip_id|null, table, row_id, op: 'upsert'|'patch'|'insert', values, versions: {coluna: ISO}, updated_at, state, attempts, next_at, last_error }`.

### 5.3 Anexos, fotos e caches locais
- Bucket privado `attachments`, caminho `{trip_id}/{attachment_id}.{ext}`, arquivo imutável. Policies no Storage pelo primeiro segmento da pasta.
- Ao abrir a viagem online, a fila baixa cada arquivo com `storage.download` e guarda o Blob no Dexie (`blobs`, com `last_used_at`). `navigator.storage.persist()` na instalação. Por quê não o cache do service worker: bucket privado, URLs assinadas mudam.
- Fotos: compressão no client (lado maior 1600 px, alvo ~400 KB). Documentos até 10 MB. O registro em `attachments` só nasce depois do upload concluir.
- **Caches recalculáveis, só no celular, nunca sincronizados:** rota real + altitude + leitura do lugar (`routes`, por dia), clima (`weather`) e o estado da última visualização da maquete (`travel_state`, por dia, base do replay).

### 5.4 Sessão e conectividade
- Rota protegida espera `getSession()` (storage, sem rede). **Nunca** `getUser()` para decidir se há sessão. O supabase-js não desloga em erro de rede ao renovar token.
- A sessão do supabase-js usa um **adaptador de storage em IndexedDB**, para o service worker conseguir autenticar o envio da fila quando Partiu! ou Chegamos! vem de um botão de notificação.
- Conectividade = eventos `online`/`offline` + resultado real das requisições.
- Indicadores claros de **offline** e de **N alterações pendentes**, com lista de pendências e ações tentar de novo e descartar.
- PWA: `beforeinstallprompt` no Android; no iOS, folha "Compartilhar → Adicionar à Tela de Início". Insistir na instalação: o Safari pode apagar o IndexedDB após 7 dias sem uso quando o app não está instalado.

### 5.5 Service worker
Precache da casca, fontes, ícones e dados embutidos do cenário. `navigateFallback` para a SPA. `CacheFirst` para tiles do OSM (30 dias, limite de entradas). Aviso "nova versão disponível" com recarregar.

### 5.6 Dexie, versão 1
```ts
db.version(1).stores({
  trips: 'id',
  trip_members: 'id, trip_id, user_id',
  profiles: 'id',
  trip_days: 'id, trip_id, [trip_id+date]',
  stops: 'id, trip_id, [trip_day_id+position]',
  stop_memories: 'id, trip_id, stop_id',
  reservations: 'id, trip_id, stop_id, trip_day_id',
  attachments: 'id, trip_id, stop_id, reservation_id',
  checklist_items: 'id, trip_id, [trip_id+kind+position], stop_id',
  contacts: 'id, trip_id',
  expenses: 'id, trip_id, stop_id',
  achievements: 'id, user_id',
  xp_events: 'id, user_id, trip_id',
  trip_tracks: 'id, trip_id, trip_day_id',
  routes: 'trip_day_id',
  travel_state: 'trip_day_id',
  blobs: 'attachment_id, last_used_at',
  weather: 'trip_day_id',
  outbox: '++seq, trip_id, [table+row_id], state',
  sync_state: 'key',
});
```
Ao mudar o esquema, suba a versão. Tabelas de dados podem ser limpas e rebaixadas; **a `outbox` nunca é apagada sem ter sido enviada**. Perfil é editado online (TanStack Query), não pela outbox.

---

## 6. Mundo 3D: maquete do dia, posição, garagem e retrospectiva

Direção aprovada pelo Douglas em 04/11/2026 com base no protótipo. O protótipo prova: maquete gerada só dos dados (rota real, altitude, cidades, costa) com cidade grande → interior → plantação → serra → praia; o dia inteiro na tela; curiosidades com mergulho de câmera; modo noite; garagem showroom; 60 fps com WebGPU no Chrome do Mac; render reduzido quando parado. Não cobre: sons, tilt-shift, os outros quatro carros, fotos nos nós, posição real do celular, fps no iPhone e no Android.

### 6.1 A maquete
- **A câmera segue o carro** (fase 14, D177): alta e atrás, olhando para a próxima parada, em retrato; parada, o carro ocupa um quinto da altura da tela e a estrada serpenteia à frente, subindo na tela; em movimento entre paradas distantes, a câmera recua para a estrada caber, até um teto. A abertura do dia começa larga, com o dia inteiro, e desce até o carro. Com reduzir movimento, a câmera corta em vez de deslizar. (Até a fase 13 a câmera era parada, com o dia inteiro na tela; a lista do dia continua sendo onde se vê o dia inteiro de uma vez.)
- A câmera mergulha **sozinha, em eventos específicos, e volta**: as **curiosidades do caminho**, derivadas dos dados. Primeira entrada em cada cenário, ponto mais alto do dia, a serra ("desce 640 m em 7 km"), o mar a menos de 2 km. Cada uma dura 2 a 3 segundos, com legenda. `prefers-reduced-motion` desliga os mergulhos.
- **Poucas cidades, mais detalhadas; o mapa só com o que importa:** prédios só em volta das paradas de cidade, hotel e comida; o relevo quieto, sem enfeite longe da estrada. Cada parada é uma **miniatura 3D do seu tipo** (`src/art/stops`: casa, marco, árvores, parreira e barril, hotel, restaurante, palco, quarteirão, placa), na linguagem dos carros, e tocar nela abre a folha da parada (D178).
- O traçado em S é estilizado para caber na tela; a geografia real entra pelos números (km, duração, altitude) e pelo relevo.
- Pílulas, anéis, botões, horários e contagem ficam em **HTML por cima da cena**, nítidos e legíveis no sol. O 3D é só a cena. As pílulas são postas pelo laço da cena a cada quadro em movimento, só para os nós em cena, e recebem toque (abrem a folha da parada).
- Modo noite: iluminação da cena muda, faróis acendem, texto 10% maior.
- **Render sob demanda**: parado, a maquete redesenha poucas vezes por segundo. Níveis de qualidade Leve e Alta com rebaixamento automático por fps. Chip de diagnóstico (fps, motor, qualidade) em dev.
- WebGPU no iOS 26+ e no Chrome do Android, WebGL2 de reserva, lista acessível como fallback final.

### 6.2 Cenário gerado da geografia real
- Quando o roteiro de um dia fica pronto e há internet, o app chama a Edge Function **`route-day`** com as coordenadas das paradas. Ela consulta o OpenRouteService (`ORS_API_KEY` no servidor, 2.000 rotas por dia no plano gratuito, `elevation = true`) e devolve a geometria da rota por estrada, distância e duração por trecho e altitude ao longo do caminho. Em desenvolvimento, o servidor público do OSRM serve para a geometria. O resultado fica em `routes` no Dexie e serve offline.
- Amostra a cada 2 km. Cada amostra é classificada cruzando altitude e inclinação, distância até o mar (linha de costa Natural Earth embutida), população do município mais próximo (IBGE, 5.570 municípios, embutido) e bioma (mapa IBGE simplificado, embutido). Tudo roda no celular.
- O resultado são cerca de **quatro partes por dia**: cidade grande, interior, plantação, praia. A serra aparece pela altitude. Transições suaves. A escala é "quatro partes por dia", não metro a metro.
- Toques do roteiro: parada de vinícola planta parreirais, hotel vira miniatura, represa vira lago.
- Fora do Brasil: só altitude e costa, cenário genérico. Brasil completo é o escopo da primeira versão.
- Consequências: `trip_days` **não tem** coluna `theme`; a importação com IA não infere tema; as durações dos trechos sugerem `travel_minutes_to_next` quando vazio.

### 6.3 Avanço: botões, notificações, catch-up e o GPS com o mapa aberto. Nunca um navegador.
- **"Partiu!" e "Chegamos!"** funcionam sem GPS: pelo botão no "Agora", pelo botão da notificação no Android, ou pelo toque na notificação no iPhone.
- **Catch-up ao abrir** (e ao voltar do plano de fundo): uma leitura de posição (`getCurrentPosition`, tempo limite de 8 s, aceita leitura de até 60 s). Se está no raio da próxima parada, marca Chegamos! com toast "desfazer" por 10 s. Se está entre duas, posiciona o carrinho ali, pela fração percorrida da rota real projetada no traçado em S. Se passou por paradas sem marcar, pergunta "Vocês passaram por Gramado. Marcar como concluída?" (hora atual, ajustável). Sem posição, usa a última parada concluída pelo time e a trilha de quem estiver no modo painel. Os pontos esparsos do catch-up também entram na trilha gravada.
- **Sem hora real, sem XP de pontualidade.** A hora real existe quando veio de botão, de notificação ou do modo painel. Nunca inventar horário.
- **A parada fora do roteiro** (fase 15, D183): o detector puro lê as mesmas leituras do acompanhamento e registra a parada sozinho (8 min fora da linha da estrada ou 20 min em qualquer lugar; buracos não são parada; um lugar só a cada 2 h). Ela não é ponto de passagem: a rota do dia não muda por causa de um posto.
- **O GPS sempre que o mapa está aberto** (fase 14, D176; antes era o "modo painel", opcional): com a tela da viagem visível, o dia de hoje, a viagem em andamento e a posição permitida, `watchPosition` em primeiro plano move o carrinho continuamente, registra Partiu! ao sair do raio da parada (depois de ter visto o carro nela) e Chegamos! ao entrar no raio da próxima e permanecer 3 min, e grava a trilha. Parado por 10 min, reduz o GPS. **"Tela acesa"** (Wake Lock) é um toggle à parte, lembrado por aparelho: sem ele, o sistema apaga a tela e corta o GPS, e está tudo bem.
- Desvio: a mais de 2 km da rota, o carrinho aparece fora da trilha com "Fora da rota · 3 km". Sem recálculo.
- **Trilha gravada**: o caminho real fica em `trip_tracks` (uma linha por dia e pessoa, id `v5(trip_day_id, user_id)`, pontos simplificados), para a retrospectiva sobrevoar por onde passaram de fato. Os trechos sem gravação são interpolados pela rota real, então o filme continua inteiro. Como sincroniza, quem ficou em casa vê o carrinho andando.
- Limites conhecidos: PWA não rastreia em segundo plano no iOS nem no Android. É por isso que existem as notificações, o catch-up e o GPS enquanto o mapa está aberto.
- Regras duras repetidas de propósito: sem rota passo a passo, sem voz, sem mapa de ruas, sem recálculo, nada que premie velocidade, nada que exija interação de quem dirige.

### 6.4 Replay ao abrir: o carrinho repõe o que aconteceu
Pedido pelo Douglas: quem abre o app depois de um tempo quer ver o carrinho andar até onde está agora, com tudo o que aconteceu no caminho. É assim que a imersão sobrevive à tela apagada.
- Cada aparelho guarda em `travel_state`, por dia, onde estava a última vez que viu a maquete: fração percorrida da rota, hora, paradas concluídas e eventos já vistos. Salvo quando o app vai para o plano de fundo e a cada 30 s visível.
- Ao abrir: sincroniza, faz o catch-up e compara. Se houve avanço ou eventos novos, o carrinho **anda do ponto antigo até o atual**, na própria maquete, câmera parada, 3 a 8 s conforme a distância, com easing. **Cada evento dispara quando o carro passa por ele**: anel da parada preenche e o check salta; chip "Ana · 14:02" para marcação de outro membro; curiosidades do caminho encurtadas para 1,5 s, no máximo 3 por replay, prioridade serra, mar, ponto mais alto, entrada de cenário; "+2 paradas" quando há mais do que cabe. "Pular" sempre visível. `prefers-reduced-motion` troca o replay por um card com a lista do que aconteceu.
- Se o avanço é pequeno e não há eventos, o carro só aparece no lugar certo, sem replay.
- O mesmo mecanismo serve **quem ficou em casa**: o carrinho avança conforme chegam as marcações e as trilhas dos viajantes.
- **Abertura do dia**, uma vez por dia, na primeira abertura: a maquete se constrói na frente da pessoa (relevo sobe, estrada se desenha, pinos caem, carro estaciona na origem, chip do clima), 2 a 3 s.
- **"Rever o dia"**, sob demanda: do começo do dia até agora, até 20 s, com as fotos das memórias aparecendo nos nós. Serve ao passageiro e a quem ficou em casa.
- Regras puras em `features/world/replay.ts`: seleção e ordem dos eventos, duração, cortes. Testadas com Vitest; a renderização é manual no iPhone e no Android.

### 6.5 Garagem 3D estilo showroom
- Luz de estúdio, carro girando com o dedo, tinta com verniz e brilho metálico, acessórios encaixando com animação e som.
- Cinco carros modelados **por código** em low-poly com luz realista: hatch (livre), sedã (nível 2), SUV (3), picape (4), kombi (5). Oito cores, dourado só no nível 5. Acessórios desbloqueados por conquista (seção 10). Trocar por modelos de artista depois não muda código.
- O carro escolhido aparece na maquete, no card da viagem, no cabeçalho, na retrospectiva e na imagem compartilhada. Arte compartilhada em `src/art/`.

### 6.6 Sons e microinterações
Confete ao concluir e ao desbloquear; vibração curta no Android; anel de contagem animado; transições com motion; efeitos sonoros curtos e opcionais (buzina no Partiu!, encaixe de acessório, sino na conquista, ronco discreto durante o replay) com toggle por dispositivo em `localStorage`, ligados por padrão. Tudo respeita `prefers-reduced-motion`.

### 6.7 Retrospectiva "Viajei!" como filme
A câmera sobrevoa a maquete e a trilha gravada do início ao fim da viagem; as fotos aparecem nos nós; termina no carro estacionado com dias, paradas, horas de estrada, gasto contra orçamento, conquistas e o time. Exporta **vídeo vertical de 15 s** para stories (MediaRecorder sobre o canvas, validar no iPhone e no Android) e cards estáticos como imagem. Compartilha pela Web Share API.

---

## 7. Arquitetura

### 7.1 Pastas
```
viajei/
├─ .github/workflows/ci.yml     # lint, tipos, Vitest, pgTAP e Playwright em todo push
├─ docs/                        # prompt, passo-0, atualizacao-3d, decisoes.md, style-tile, prototipo-3d
├─ public/                      # ícones do PWA, apple-touch-icon
├─ src/
│  ├─ app/                      # main.tsx, router com rotas lazy, providers, layouts, RequireSession
│  ├─ art/                      # carros e cenário em 3D, estados vazios (arte compartilhada)
│  ├─ components/ui/            # Button, Card, Sheet, Ring, Chip, Toast, Field, Tabs
│  ├─ features/                 # auth, trips, itinerary, travel-mode ("Agora", catch-up, modo painel),
│  │                            # world (maquete 3D, replay), garage, notifications (permissão, prefs,
│  │                            # selo, calendário), reservations, checklists, contacts, expenses,
│  │                            # memories, progression, ai-import, map, weather
│  │                            # cada uma: routes/, components/, queries.ts (useLiveQuery),
│  │                            # actions.ts (escritas via mutate), rules.ts (puro) e *.test.ts
│  ├─ lib/
│  │  ├─ supabase/              # client, sessão (storage em IndexedDB), database.types.ts gerado
│  │  ├─ db/                    # schema Dexie, mutate(), outbox/, sync/ (engine, push, pull), connectivity
│  │  ├─ ids/                   # uuidv5 (Web Crypto) e índice fracionário
│  │  ├─ geo/                   # projeção, costa, municípios, biomas, leitura do lugar, geofence, catch-up
│  │  └─ time/ links/ media/ audio/ pwa/
│  ├─ sw.ts                     # service worker próprio: precache, push, notificationclick, pushsubscriptionchange
│  ├─ styles/                   # app.css com @theme, fontes
│  └─ test/                     # setup do Vitest, fake-indexeddb, fábricas
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/               # 0001_fundacao … 0008_importacao
│  ├─ functions/
│  │  ├─ deno.json              # import map: zod, @anthropic-ai/sdk, client do Supabase
│  │  ├─ _shared/               # constants.ts, import-schema.ts (alias @shared no Vite)
│  │  ├─ import-itinerary/
│  │  ├─ route-day/             # rota real + altitude (OpenRouteService; chave no servidor)
│  │  └─ send-notifications/    # servidor para servidor, chamada pelo pg_cron; única com chave secreta
│  ├─ tests/                    # pgTAP
│  ├─ seed.sql                  # usuários locais: dono, convidado, intruso
│  └─ seed/viagem-rs.json
├─ e2e/                         # Playwright, viewport de celular
├─ .env.example
└─ package.json · pnpm-lock.yaml · vite.config.ts · tsconfig*.json · eslint.config.js · .prettierrc
```
O código compartilhado entre front e Edge Functions vive em `supabase/functions/_shared/` e o Vite o importa pelo alias `@shared` (com `allowImportingTsExtensions`). O `deno.json` mapeia `zod` e `@anthropic-ai/sdk` para os pacotes npm, então o mesmo `import { z } from 'zod'` funciona nos dois lados.

### 7.2 Rotas
```
/entrar  /criar-conta  /recuperar-senha
/                                   viagens + convites pendentes
/viagens/nova
/viagens/:tripId                    a viagem: a maquete inteira na tela, o "Agora" e o GPS (fase 14)
/viagens/:tripId/detalhes           Detalhes: progresso, próxima saída, atalhos, clima (a visão geral)
/viagens/:tripId/roteiro            dias e paradas (edição)
/viagens/:tripId/roteiro/:dayId
/viagens/:tripId/viagem             (a rota antiga do Modo Viagem: redireciona para /viagens/:tripId, com a query)
/viagens/:tripId/reservas
/viagens/:tripId/checklists         antes · mala · missões
/viagens/:tripId/contatos
/viagens/:tripId/gastos
/viagens/:tripId/mapa
/viagens/:tripId/diario
/viagens/:tripId/retrospectiva      "Viajei!"
/viagens/:tripId/garagem
/viagens/:tripId/avisos             preferências de notificação da viagem
/viagens/:tripId/membros
/viagens/:tripId/importar
/perfil
```
Durante a viagem (hoje entre `start_date` e `end_date`), `/` redireciona para a tela da viagem do dia. As notificações abrem `/viagens/:tripId` desde a fase 15 (D182); as que já tinham ido, com `/viagens/:tripId/viagem`, são redirecionadas (D174). As telas de detalhe voltam para `/detalhes`; o "Voltar" de Detalhes vai à tela da viagem; o nome pequeno da tela da viagem leva à lista.

### 7.3 Convenções
- Lógica em funções puras (`lib/` e `features/*/rules.ts`), sem React, testadas com Vitest.
- Nada de `any`. Tipos das tabelas gerados por `supabase gen types`.
- Constantes de domínio (tipos, categorias, chaves de conquista, tabela de XP, cores) em `_shared/constants.ts`, usadas pelo Zod, pelo client e espelhadas nos `check` do banco.

---

## 8. Modelo de dados e segurança

**A DDL completa, com triggers, RLS, RPCs e policies de Storage e Realtime, está em `docs/passo-0-2026-11-04.md`, seção 5.** Parta dela. A migration de notificações entra como **0005**, e as seguintes renumeram: 0006 reservas, anexos e memórias · 0007 listas, contatos e gastos · 0008 progressão · 0009 importação. Abaixo, o resumo e o que a governa.

### 8.1 Tabelas
Todas as sincronizadas têm as **colunas de sync**: `created_at`, `updated_at`, `field_versions jsonb`, `synced_at` e, nas tabelas da viagem, `deleted_at`. Enums como `text` com `check`.

```
profiles         id → auth.users, name, color
trips            id, owner_id, name, start_date, end_date, origin, budget, notes,
                 car_model, car_color, car_accessories text[]
trip_members     id = v5(trip_id, 'owner' | 'invite:' || email), trip_id, user_id null, invited_email,
                 role owner|member, status pending|accepted, invited_by
trip_days        id = v5(trip_id, date), trip_id, date, title, notes          (sem position, sem theme)
stops            id, trip_id, trip_day_id, position (fracionário), kind, name, time, closes_at, address,
                 lat, lng, travel_minutes_to_next, notes, url, departed_at, done_at, done_by, skipped,
                 source user|ai|auto (imutável)          kind: origin transit nature winery hotel food
                                                          event city fuel other (o Posto desde a 0013)
trip_tracks      id = v5(trip_day_id, user_id), trip_id, trip_day_id, user_id, points jsonb
reservations     id, trip_id, stop_id null, trip_day_id null, type, name, start_at, end_at,
                 confirmation_code, amount, cancel_policy, cancel_until, phone, address, booked_via, notes
stop_memories    id = v5(stop_id, user_id), trip_id, stop_id, user_id, rating, memo
attachments      id, trip_id, reservation_id null, stop_id null, kind photo|document, storage_path,
                 filename, mime, size_bytes, width, height, created_by
checklist_items  id (sugestão: v5(stop_id, 'quest:' || regra)), trip_id, kind before|pack|quest, text,
                 position (fracionário), points, stop_id null, source user|system|ai,
                 status suggested|active, done_by, done_at
contacts         id, trip_id, name, phone, type, notes
expenses         id, trip_id, stop_id null, amount, category, date, paid_by, notes
achievements     id = v5(user_id, 'achievement:' || key), user_id, trip_id null, key, unlocked_at
xp_events        id = v5(user_id, kind || ':' || ref_id), user_id, trip_id, kind, ref_id, points
ai_imports       id, user_id, trip_id null, input_chars, input_tokens, output_tokens, model, status, error

push_subscriptions  id, user_id, endpoint unique, p256dh, auth, platform ios|android|desktop, user_agent,
                    created_at, last_seen_at, failed_at                     (RLS: só as próprias; não sincronizada)
notification_prefs  id = v5(user_id, trip_id), user_id, trip_id, enabled, lead_minutes, kinds jsonb,
                    morning_time, colunas de sync                           (RLS: só as próprias; escopo user)
notifications_sent  id = v5(user_id, kind:ref:scheduled_at), user_id, kind, ref, scheduled_at, sent_at, status
                                                                            (sem policy para o client; dedupe do servidor)
```
Função `private.due_notifications(p_now)` calcula o que vence no minuto: viagens com dia hoje no fuso `America/Sao_Paulo`, "sair às" = horário da próxima parada menos o deslocamento, parada ainda sem `departed_at`, parada com `closes_at` não concluída, véspera, prazos de cancelamento, respeitando `notification_prefs`. `pg_cron` a cada minuto chama a Edge Function `send-notifications` via `pg_net`, com `CRON_SECRET` no cabeçalho.

Ordem (rank) no push: trips 10 · trip_members 20 · trip_days, contacts 30 · stops 40 · reservations, checklist_items, expenses, stop_memories, trip_tracks 50 · attachments 60 · achievements, xp_events 90.

### 8.2 Regras de segurança
- Funções de permissão `is_trip_member`, `is_trip_owner`, `shares_trip_with` em **schema `private`**, security definer com `search_path = ''`. Por quê: a policy de `trips` consulta `trip_members` e vice-versa; sem a função o Postgres devolve recursão infinita. Em `public` ficariam expostas como RPC.
- O dono entra em `trip_members` por trigger ao criar a viagem: um só lugar para checar permissão.
- Convites só são reivindicados por **e-mail confirmado** (`auth.users.email_confirmed_at`), e as policies não usam o e-mail do JWT. Por quê: sem isso, quem criar conta com o seu e-mail, antes de confirmar, veria e reivindicaria seus convites. Exige SMTP próprio em produção.
- Colunas imutáveis protegidas por trigger (`trip_id`, chaves naturais, `created_by`, `storage_path`). Grants de coluna onde a tabela tem campos que só RPC altera (`trip_members.user_id`, `status`).
- Policies restritivas: trilha, memória, anexo e XP só do próprio usuário; `expenses.paid_by` tem de ser membro aceito.
- Storage: bucket privado, limite de 10 MB, tipos permitidos, sem policy de update. Realtime: só membros ouvem `trip:<id>`; ninguém publica pelo client.
- Nada é exposto a `anon` (privilégios padrão revogados). Nenhuma chave secreta no client.
- A Edge Function `send-notifications` é a **única** que usa a chave secreta do Supabase, porque roda sem usuário, chamada pelo `pg_cron`. Autenticada por `CRON_SECRET`; recusa qualquer chamada sem ele.

### 8.3 Fuso horário
Tudo em hora de parede local (`America/Sao_Paulo`). Dia guarda `date`; parada guarda `time` sem fuso; `closes_at` idem. Reservas e marcas de evento usam `timestamptz`. Cálculos com `date-fns` sobre `date + time`, nunca `Date` em UTC.

---

## 9. Edge Functions

### 9.1 `import-itinerary`
Conferido na documentação da Anthropic em 04/11/2026:
- `claude-sonnet-5-5` é o Sonnet atual. `client.messages.parse` com `output_config.format: zodOutputFormat(ImportSchema)` (de `@anthropic-ai/sdk/helpers/zod`). `parsed_output` volta `null` quando não valida.
- `tool_choice` forçado (`any`/`tool`) dá 400 nesse modelo. Saída estruturada é o caminho.
- Schema sem `minLength`/`maxLength`, `minimum`/`maximum` nem recursão (o SDK remove e valida no client). Opcional é união com `null`.
- Tratar `stop_reason` `refusal` (com `stop_details.category`) e `max_tokens`, registrando em `ai_imports.status` (`refused`, `truncated`).
- `fallbacks: "default"` com o beta `server-side-fallback-2026-07-01` fica por padrão.
- `output_config.effort` começa em `medium`. Chamada em **streaming** com preview progressivo (limite de tempo da Edge Function, confirmar na fase 9).
- `verify_jwt` ligado. Dentro da função, client do Supabase com o JWT do usuário encaminhado, para a RLS valer ao gravar em `ai_imports`. **Sem chave secreta.** Confira na documentação atual do Supabase o pacote recomendado para Edge Functions.
- Limites: entrada até 30.000 caracteres; 20 importações por usuário em 24 h. A função insere `started` primeiro e depois conta; acima do limite marca `rate_limited` e para, para duas chamadas simultâneas não furarem o limite.
- **Regras do prompt de sistema:** extrair **somente** o que está no texto; nunca inventar coordenadas, telefones, códigos, valores ou horários; campos ausentes são `null`; datas relativas resolvidas pelas datas da viagem; horários `HH:MM`; telefones E.164 quando houver DDD; tipos de parada da lista, `other` na dúvida; até 8 missões curtas e divertidas ligadas às paradas; o que não couber vai para `unclassified: string[]`.
- Coordenadas nunca vêm da IA: o preview geocodifica cada parada pelo Nominatim antes de salvar. Salvar passa pela `outbox`, como qualquer escrita.

### 9.2 `route-day`
- Entrada: lista ordenada de coordenadas das paradas do dia. Saída: geometria da rota por estrada, distância e duração por trecho, altitude ao longo do caminho.
- OpenRouteService com `ORS_API_KEY` em `supabase secrets`, `elevation = true`. Em desenvolvimento, OSRM público para a geometria.
- `verify_jwt` ligado; limite por usuário por dia; cache no client por hash das coordenadas, recalculado só quando as coordenadas mudam.

### 9.3 `send-notifications`
- Servidor para servidor: chamada pelo `pg_cron` via `pg_net` a cada minuto, autenticada por `CRON_SECRET` no cabeçalho. `verify_jwt` desligado só nela, porque não há usuário; qualquer chamada sem o segredo é recusada.
- Lê `private.due_notifications(now())`, **insere em `notifications_sent` antes de enviar** (conflito no id determinístico = já enviado, pula), monta título, corpo, `tag` (substitui avisos da mesma parada), URL de destino e, no Android, ações `departed` e `arrived`.
- Envia com uma biblioteca Web Push compatível com Deno e as chaves VAPID de `supabase secrets`. Resposta 404 ou 410 remove a assinatura. Falhas ficam em `notifications_sent.status`.
- O service worker trata `push` (mostra a notificação e atualiza o selo), `notificationclick` (ações gravam via `mutate` no Dexie e tentam enviar a fila com a sessão lida do IndexedDB; sem ação, abre a rota) e `pushsubscriptionchange` (reassina e atualiza o servidor).

---

## 10. Gamificação

### 10.1 XP e níveis
`xp_events` é somente-anexar e idempotente (id `v5(user_id, kind:ref_id)`). "Todo o time": cada aparelho deriva o evento do estado compartilhado e grava o seu, porque a policy só deixa cada um gravar o próprio. Desmarcar não tira XP; remarcar não dá XP de novo.

| kind | ref_id | pontos | quem recebe |
|---|---|---|---|
| `stop_done` | stop.id | 10 | todo o time |
| `departure_on_time` (Partiu! até 5 min após o "sair às"; hora real quando houver posição) | stop.id | 15 | todo o time |
| `memory_rating` | stop.id | 5 | quem avaliou |
| `memory_photo` | stop.id | 10 | quem fotografou, uma por parada |
| `checklist_item` | item.id | 2 | quem marcou |
| `checklist_complete` | `${trip.id}:${kind}` | 20 | todo o time |
| `quest_done` | item.id | 10 a 30 | todo o time |
| `expense_logged` | expense.id | 2 | quem lançou |
| `reservation_added` | reservation.id | 5 | quem cadastrou |
| `trip_completed` | trip.id | 100 | todo o time |

Níveis: 0 Turista · 150 Viajante · 400 Explorador · 900 Estradeiro · 2000 Lenda da Estrada. Na viagem do seed, quem fizer tudo chega a cerca de 790 XP: Viajante no dia 1, Explorador no dia 3. Barra de nível no perfil e no cabeçalho, com animação ao subir.

### 10.2 Conquistas e o que cada uma desbloqueia
Derivadas dos dados pelo client (`features/progression/rules.ts`, puro e testado), persistidas em `achievements`. Ao desbloquear: cartão animado, confete, som opcional e o acessório encaixando no carro.

| key | nome | regra | desbloqueia |
|---|---|---|---|
| `first_stop` | Primeiro pé na estrada | primeira parada concluída | rack de teto (base da bicicleta e da prancha) |
| `early_bird` | Madrugador | Partiu! antes das 7h (hora real quando houver posição) | faróis de milha |
| `on_time_3` | Relógio suíço | 3 saídas pontuais seguidas | adesivo de relógio |
| `nature_3` | Caçador de cascatas | 3 paradas de natureza concluídas | adesivo de cascata |
| `winery_2` | Enólogo | 2 vinícolas concluídas no mesmo dia | adesivo de uva |
| `offline_hero` | Sem sinal, sem problema | primeira escrita offline sincronizada | antena com bandeirinha |
| `ready_to_go` | Pronto para partir | antes e mala em 100% antes do início | mala de teto |
| `on_budget` | Dentro do orçamento | viagem concluída com gasto ≤ orçamento | calotas cromadas |
| `photographer` | Fotógrafo de estrada | 5 memórias com foto | adesivo de câmera |
| `chronicler` | Cronista | todas as paradas de um dia avaliadas | adesivo de estrela |
| `trip_done` | Viajei! | todas as paradas concluídas | placa personalizada com o nome da viagem |
| `team` | Equipe formada | convite aceito por outro membro | bicicleta no rack |
| `planner` | Planejador | roteiro importado com IA | adesivo de mapa |
| `coast` | Pé na areia | chegou a menos de 1 km do mar (posição real) | prancha |
| `downhill` | Serra abaixo | desceu 500 m num dia | adesivo de serra |

Modelos por nível: hatch livre, sedã no 2, SUV no 3, picape no 4, kombi no 5. Sete cores livres; dourado no nível 5. Nenhum cosmético remete a velocidade; missões de vinícola registram rótulo e foto, nunca consumo. Sem ranking entre membros: a equipe conquista junto.

---

## 11. Design e UX

- **Tom:** menos infantil, inspirado em placas de rodovia e fim de tarde na estrada. Divertido e adulto.
- **Tipografia:** **Barlow** para texto e **Barlow Condensed** para números e títulos, self-hosted.
- **Paleta:** ponto de partida no style tile v1 (Pôr do sol `#F2622E` como acento, Azul noite `#16213D`, Asfalto `#3A4766`, Faixa `#FFD166`; estados No horário `#12A66A`, Aperta `#F2A516`, Atrasado `#E5484D`; neutros frios), **revisada para menos saturação**: asfalto, céu em degradê, laranja só como acento. Branco sobre o laranja dá 3,7:1, só em texto grande. Texto do Modo Viagem ≥ 17 px, +10% à noite.
- **Tokens** em `@theme` do Tailwind 4; tema claro e escuro; noite automática no Modo Viagem.
- **Alvos de toque** ≥ 48 px. Contraste AA. Estados vazios ilustrados e com ação.
- **Performance:** rotas lazy, imagens comprimidas, render 3D sob demanda, Lighthouse PWA e Performance acima de 90 no celular.
- **Glossário de UI:** Viagem, Dia, Parada, Agora, Partiu!, Chegamos!, Sair às, Fora da rota, Curiosidade, Modo painel, Rever o dia, Avisos, Pendentes, Missões, Garagem, Diário, Retrospectiva, Conquistas, Nível.

---

## 12. Plano por fases (21)

Cada fase termina com testes passando, CI verde, `docs/decisoes.md` atualizado e um commit `fase N: ...`. Resumo curto ao fim de cada fase e ok antes da próxima.

| Fase | Entrega | Migrations | Testes |
|---|---|---|---|
| **1. Base** | scaffold com pnpm, tokens, fontes, primitivos de UI, CI, Supabase local, auth (entrar, criar conta, recuperar), perfil, convites com as 4 RPCs | 0001, 0002 | pgTAP: policies de profiles, trips, trip_members, funções de permissão, convites |
| **2. Offline, PWA e viagens** | Dexie, `mutate`, outbox com coalescência e ordem por rank, `sync_push`, `sync_pull`, `sync_pull_user`, `sync_guard`, broadcast + assinatura Realtime, conectividade, indicadores, service worker próprio (`injectManifest`), manifest, instalação, sessão em IndexedDB; **CRUD de viagens e membros sobre o Dexie**; deploy para testar no celular | 0003 | Vitest: coalesce, ordem, applyPull, backoff; pgTAP: versão por coluna, coluna imutável, whitelist, revoked |
| **3. Roteiro, rota real e trilha** | dias derivados, paradas com arrastar (índice fracionário), Nominatim e parser do Maps, deep links; Edge Function `route-day` + altitude + leitura do lugar (`lib/geo`); cabeçalho "Agora" com "sair às", contagem, Partiu! e Chegamos!; lista acessível da trilha; `import-schema.ts` com o seed e o botão "carregar viagem de exemplo" em dev | 0004 (inclui `trip_tracks`) | Vitest: leaveAt, countdownState, dia atual, deep links, parser, classificação do cenário, sugestão de deslocamento |
| **4. Uso com a tela apagada** | push (assinatura, permissão no momento certo, folha de instalação no iPhone, ações no Android), `due_notifications` + `pg_cron` + `pg_net`, Edge Function `send-notifications` com dedupe, preferências por pessoa e viagem (`/avisos`), selo no ícone, **catch-up ao abrir** (leitura única de posição, reconciliação, sugestões, lista de eventos desde a última vez), **modo painel** (Wake Lock, GPS contínuo, geofences, `trip_tracks`), exportar dia e viagem para o calendário, redirecionamento de `/` durante a viagem | 0005 | pgTAP: `due_notifications` (fuso, parada já saída, preferência desligada, dedupe, véspera, cancelamento); Vitest: catch-up (projeção na rota, raio, sugestões, sem posição), geofence, `.ics`; manual: push no iPhone e no Android com o app fechado, ações no Android, selo |
| **5. Mundo 3D: maquete e replay** | gerador da maquete, cenários, câmera parada + curiosidades, modo noite, níveis de qualidade e render sob demanda; carrinho posicionado pelo catch-up e pelo modo painel; **abertura do dia, replay ao abrir e "Rever o dia"**; fora da rota | — | Vitest: projeção na trilha, detecção de curiosidades, regras do replay (seleção, ordem, duração, cortes); manual no iPhone e no Android com fps |
| **6. Garagem 3D** | 5 carros, 8 cores, acessórios, showroom, regras puras de desbloqueio, carro refletido em toda a UI | — | Vitest: desbloqueio por nível e conquista |
| **7. Reservas, anexos e memórias** | reservas, upload com compressão, cache de Blob, folha pós-parada (nota, foto, memória por pessoa), diário, fotos nos nós do "Rever o dia" | 0006 | pgTAP: policies de Storage, memória própria, anexo imutável; Vitest: parâmetros de compressão |
| **8. Listas, missões, contatos e gastos** | três listas, sugestões de missão por regra, ligar e WhatsApp, orçamento; notificações de véspera e de cancelamento passam a ter dados | 0007 | Vitest: totais, sugestões; pgTAP: `paid_by` membro |
| **9. Progressão e retrospectiva** | XP, níveis, conquistas, cosméticos, filme "Viajei!" com exportação de vídeo e cards, notificação "retrospectiva pronta" | 0008 | Vitest: todas as regras de conquista, idempotência; pgTAP: XP só o próprio |
| **10. Importação com IA** | Edge Function em streaming, limites e log, preview progressivo e editável, geocodificação, salvar via outbox | 0009 | Vitest: schema com o seed e inválidos; teste da função com entrada fixa |
| **11. Mapa e clima** | Leaflet com rota real, cache de tiles, Open-Meteo; clima no briefing da manhã e na abertura do dia | — | Vitest: códigos de clima |
| **12. Polish e E2E** | Playwright completo (fluxo principal e offline com `context.setOffline(true)`), matriz iPhone e Android (instalação, push, ações, selo, WebGPU/WebGL2, fps, Wake Lock, geolocalização, vídeo, compartilhar), acessibilidade, Lighthouse, README, expurgo de viagens excluídas (job) | job de expurgo | Suíte completa verde |
| **13. Correções** | o mapa por cima da folha, a rolagem horizontal, o rack que não sobe (o defeito do sync), o Lighthouse da visão geral cobrado só numa máquina normal, o que o teste do Douglas achar; o plano das fases 13 a 21 e esta v4 | — | e2e do mapa (a folha por cima) e da rolagem lateral a 393 e 360 px com link, endereço colado e código; Vitest da causa do rack; laboratório no preview e na produção |
| **14. A viagem abre no mapa** · feita (08/11, D174 a D180) | `/viagens/:tripId` vira a maquete inteira na tela, sem rolagem; a visão geral vira "Detalhes"; barra do topo com a data e "Hoje"; "Agora" compacto embaixo com Partiu! e Chegamos!, automáticos pelo GPS sempre que o mapa está aberto (`watchPosition`, regras da D47, Desfazer); o carro grande; miniaturas 3D por tipo de parada; o comboio (a regra; a renderização conforme a D179) | — | Vitest do layout, da câmera, das miniaturas, do GPS e do comboio; e2e das rotas, da tela sem rolagem, do GPS e da folha; laboratório no preview e na produção; um bloco no teste final |
| **15. Paradas que se registram sozinhas** · feita (09/11, D181 a D189) | com o mapa aberto, o detector puro (8 min a 60 m e fora da linha da estrada, ou 20 min em qualquer lugar; trânsito ignorado), o lugar pelo Nominatim reverso, a parada com `source: 'auto'` e horas medidas, os dois celulares numa parada só, o tipo Posto (`fuel`); os avisos abrem `/viagens/:tripId` | 0013 (os `check` de `stops.kind` e `stops.source`) | Vitest com trilhas forjadas (as reais de `trip_tracks` são 5, de catch-up, sem nada a calibrar); pgTAP da 0013; e2e da parada com e sem rede; laboratório `app_parada_auto` com o lab-a e o lab-b no mesmo carro |
| **16. A garagem é da pessoa, e o perfil** | `profiles.car_model`, `car_color`, `car_accessories` (cada pessoa vê o próprio carro em qualquer viagem); modelos livres, níveis liberam cores, acabamentos e rodas, o último nível libera o seu carro; `/perfil/garagem`; o perfil em seções | 0014 (a 0013 foi da fase 15) | pgTAP da migration e dos grants (`car_*` só pela própria pessoa); Vitest das regras novas; e2e do perfil; laboratório |
| **17. Criar a viagem conversando** | sai o formulário de nova viagem; um campo só com três caminhos (o formato do Viajei lido no aparelho, um roteiro em texto livre pela importação, uma descrição ou "quero sair hoje" pela conversa com até 3 perguntas ditas antes); a saída de hoje com lugares conferidos no OSM; o pedido para outras IAs; "O que você gosta" no perfil; limites e privacidade da fase 10 | — | Vitest do leitor do formato (com o seed e inválidos), da decisão entre os caminhos e da conferência de lugares; teste da função com entrada fixa; e2e do campo; laboratório com uma leitura real |
| **18. Reservas e gastos sem digitar** | "Ler a confirmação" colada, anexada, por `share_target` no Android e por e-mail encaminhado para um endereço por pessoa (Cloudflare Email Routing → `inbound-mail`), com "Reservas recebidas" e push; "Fotografar a nota" e o QR da NFC-e; a nota anexada ao gasto. O e-mail depende de um domínio próprio | o endereço por pessoa e as reservas recebidas | Vitest dos leitores e da escolha da viagem pelas datas; teste das funções com entradas fixas (PDF, print, nota, e-mail bruto); e2e; laboratório com um e-mail de verdade até o push |
| **19. O gerador de carros** | o perfil estendido (famílias de teto, proporções, frente, traseira, portas, detalhes, rodas) e o `CarSpec` que vira `CarProfile`; os cinco carros reescritos como specs sem mudança visual; sem IA e sem servidor | — | Vitest das validações por família; snapshots do `CarSide`; laboratório com o showroom |
| **20. O seu carro** | marca, modelo e ano pela FIPE (Parallelum v2, com cache); a função `build-car` em fila (medidas e geração pelo Claude com busca, fotos do Wikimedia Commons, o spec como o GTA desenha, a segunda olhada), `car_models` por geração, push "está pronto", "Pedir outra tentativa"; sem logotipo nem marca | `car_models` | Vitest do agrupamento e do leitor do spec; teste da função com um pedido fixo; pgTAP de `car_models`; laboratório com um pedido real até o push |
| **21. O banco conectado (opcional)** | os gastos pelo Open Finance, por um agregador autorizado (Pluggy ou Belvo) com contrato que só o Douglas assina; consentimento no app do banco; gastos sugeridos casados com a parada; o mínimo de dado, cifrado e apagado ao desconectar | as conexões e as transações | Vitest do casamento transação → parada; teste da função com transações fixas; pgTAP (só a própria pessoa lê); laboratório no sandbox do agregador |

---

## 13. Testes

- **Vitest:** `lib/time`, `lib/db` (funções puras do sync), `lib/ids`, `lib/geo` (inclusive catch-up e geofence), `lib/links`, `features/world/replay`, `features/notifications` (`.ics`, seleção de tipos), `features/progression/rules`, `_shared/import-schema`, totais, sugestões. Dexie testado com `fake-indexeddb`.
- **pgTAP** via `supabase test db`: membro vê e não-membro não vê, em cada tabela; member não gerencia membros nem exclui viagem; dono não muda `user_id` nem `status` de convite; escrita antiga é descartada e o patch de outra coluna sobrevive; coluna imutável é recusada; `claim_invites` ignora e-mail não confirmado; `accept_invite` só pelo dono do convite; `sync_push` recusa tabela fora da whitelist e respeita a RLS; `sync_pull` devolve `revoked`; ids determinísticos conferidos; policies de Storage e Realtime; `due_notifications` com fuso, parada já saída, preferência desligada e dedupe; `notifications_sent` invisível ao client.
- **Playwright:** smoke do fluxo principal e cenário offline, viewport de celular, contra o Supabase local (`seed.sql` com dono, convidado e intruso).
- **Manual, nas duas plataformas:** instalação, push com o app fechado, ações no Android, selo, WebGPU/WebGL2, fps da maquete, replay, Wake Lock, geolocalização, exportação de vídeo, compartilhamento.

---

## 14. Variáveis de ambiente

`.env.example` na raiz:
```
# Client (podem ir no bundle)
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_VAPID_PUBLIC_KEY=

# Edge Functions: definir com `supabase secrets set`, nunca no client
ANTHROPIC_API_KEY=
ORS_API_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=            # mailto: do responsável, exigido pelo Web Push
CRON_SECRET=              # cabeçalho do pg_cron para a send-notifications
```
O Supabase local (`supabase start`) imprime URL e chaves. Em produção, as chaves da Anthropic, do OpenRouteService, a privada VAPID e o `CRON_SECRET` entram só em `supabase secrets`. O par VAPID é gerado uma vez e nunca trocado sem reassinar todos os dispositivos.

---

## 15. Estado em 04/11/2026: respondido, aberto e ambiente

### Respondido pelo Douglas (não perguntar de novo)
- Direção do 3D: **aprovada**, com câmera parada e curiosidades automáticas.
- Arte: modelada por código, não por artista.
- Celular: **iPhone primeiro; Android depois; os dois têm de funcionar igual.**
- Avanço: posição do celular move o carrinho, sem navegação.
- Modo Dirigir livre com joystick: **rejeitado** ("a ideia é que não seja nenhum jogo").
- Leitura em voz alta: **rejeitada** (vira GPS).
- Style tile v1: paleta e telas aprovadas na direção; fontes trocadas por Barlow.
- As 12 decisões técnicas do planejamento e a sincronização na versão completa: aprovadas.
- Modelo "a viagem roda no servidor, o app é aberto em momentos", com notificações push, "Agora", selo e calendário: **aprovado**.
- **Replay ao abrir** com o carrinho repondo os eventos: **pedido pelo Douglas**. Catch-up ao abrir: aprovado. Tela ligada opcional (modo painel): aprovado.
- Padrões de notificação (time desligado, o resto ligado, 15 min, briefing às 7h) e a fase nova antes do 3D: aprovados.

### Aberto (o Passo 0 pergunta, com a recomendação ao lado)
| # | Pergunta | Recomendação |
|---|---|---|
| 1 | E-mail dos commits: usar `203018054+dougedss@users.noreply.github.com` só neste repo? | Sim. Configurar com `git config user.email` local no `git init`; o global continua o do trabalho. Remote pelo alias `git@github-dougedss:dougedss/viajei.git`, repositório privado |
| 2 | Conta ou organização **pessoal** do Supabase e do Vercel. As logadas no CLI são de clientes | Douglas faz login nas contas pessoais antes da fase 1. Projeto Supabase `viajei` na região de São Paulo |
| 3 | SMTP próprio para produção e domínio | Resend com domínio próprio. Sem ele, confirmação de e-mail e recuperação de senha só funcionam no Supabase local (Mailpit). O convite por e-mail confirmado depende disso em produção |
| 4 | Versões: React 19.3 + Compiler, Vite 8, TS 6.0, Zod 4, pnpm; dependências novas | Aprovar. R3F 9 e react-leaflet 5 exigem React 19 |
| 5 | Os 17 ajustes técnicos do Passo 0 (tabela abaixo) | Aprovar em bloco; já estão incorporados neste prompt e na DDL |
| 6 | Chegada automática por presença ou sempre com um toque | Automática, com toast "Chegamos à Casa Valduga · desfazer" por 10 s |
| 7 | Posição ao vivo para quem ficou em casa | Ligada para todos os membros, com toggle por pessoa "compartilhar minha posição nesta viagem" |

### Os 17 ajustes técnicos propostos no Passo 0 (incorporados, aguardando ok)
| # | Ajuste | Por quê |
|---|---|---|
| 1 | Conflito por coluna (`field_versions`) | Por linha, um "Chegamos!" offline seria descartado por uma observação editada depois |
| 2 | Push ordenado por rank de tabela depois de coalescer | FIFO com coalescência quebra FKs |
| 3 | UUID v5 quando há chave natural | Dois celulares sem sinal criam o mesmo dia sem colidir |
| 4 | Dias derivados das datas, sem `position` | A ordem já é a data |
| 5 | Índice fracionário nas paradas e itens | Um arrasto, um patch; reordenações simultâneas não se misturam |
| 6 | Memória por pessoa (`stop_memories`) | Duas pessoas não se sobrescrevem |
| 7 | Convite só com e-mail confirmado | Evita reivindicar convites alheios antes de confirmar |
| 8 | Exclusão de viagem soft, com `revoked` e expurgo | Hard delete não deixa lápide |
| 9 | Funções security definer no schema `private` | Em `public` viram RPC exposta |
| 10 | Um aviso Realtime por transação e por viagem | Importação de 80 linhas geraria 80 broadcasts |
| 11 | Arquivos imutáveis no Storage | O Blob em cache é por id |
| 12 | Códigos de domínio em inglês, rótulos pt-BR | Consistência |
| 13 | Carro em três colunas | Troca de cor e acessório novo em paralelo se juntam |
| 14 | Semântica da trilha: carro no último concluído, halo no próximo | Coerente com o protótipo |
| 15 | Chaves novas do Supabase (`publishable`) | `anon`/`service_role` serão descontinuadas |
| 16 | CRUD de viagens na fase 2, sobre o Dexie | Evita escrever online na 1 e reescrever na 2 |
| 17 | XP de equipe derivado por cada aparelho | A policy só deixa cada um gravar o próprio evento |

### Ambiente encontrado (reconferir, regra 11)
`gh` ativo como `dougedss` (a `reitechkairos-commits` também logada, inativa); SSH responde `dougedss` em todos os aliases; `git config --global user.email` é o do trabalho (brcaptura); repositório `dougedss/viajei` ainda não existe; Supabase CLI 2.19.5 logada numa conta com organizações de clientes (Apassul, Hoopr, NetGol, Clinica G3, Kifin, work-order); Vercel CLI como `reitechkairos-commits`; Docker Desktop instalado mas parado; Blender não instalado.

---

## 16. Seed (viagem real)

Formato: `supabase/seed/viagem-rs.json`, no schema de importação. Serve ao botão "carregar viagem de exemplo" em dev e aos testes do schema. `supabase/seed.sql` cria os usuários locais: dono, convidado e intruso.

Viagem **"RS — concurso em Montenegro"**, 11 a 14/12/2026, origem Papanduva/SC, orçamento R$ 3.000. Carro sugerido: hatch, cor `sunset`.

**Hospedagens**
- Hotel Steffen, Bom Princípio/RS. Noites 11 e 12, quarto luxo, R$ 560 total, café incluso, tel +55 51 99752-7596, reservado por WhatsApp.
- Vila Suzana Parque Hotel, R. Cel. Theobaldo Fleck 15, Canela/RS. Noite 13, R$ 463, café e estacionamento inclusos, cancelamento grátis até 08/12, reservado pelo Booking, check-in a partir das 14h.

**Dias e paradas**
- 11/12: 7h saída de Papanduva · 13h30 Park Salto Ventoso, Farroupilha (fecha 17h) · 16h30 check-in Hotel Steffen · 19h Restaurante dos Bifes, RS-122, Bom Princípio (até 22h).
- 12/12: 9h30 Cascata Vale do Mel, Alto Feliz · 11h Cascatas do Arroio Jaguar, Alto Feliz · 15h reconhecimento do local da prova em Montenegro.
- 13/12: 6h café no hotel · 6h50 saída para Montenegro (35 min) · manhã: prova · 13h30 Casa Valduga, Vale dos Vinhedos (até 18h) · 16h Vinícola Dom Candido (até 18h30) · 17h saída para Canela (1h30).
- 14/12: 9h Cascata do Caracol, Canela · 11h Gramado · 14h saída para Papanduva (cerca de 7h) · 21h chegada.

**Contatos:** Hotel Steffen +55 51 99752-7596 · Hotel Niro, Montenegro (plano B) +55 51 99855-2808 · Salto Ventoso +55 54 2131-5007 · Parque do Caracol +55 54 99976-9063 · Casa Valduga +55 54 99246-1706 · Dom Candido +55 54 2521-3500.

**Checklist antes:** confirmar horário do café no Steffen · comprar ingresso do Caracol online · conferir horário dos portões da prova e levar documento com foto · revisar pneus, óleo e estepe · guardar confirmações no celular.

**Checklist mala:** protetor solar · roupa de banho · calçado com aderência · blusa fina · água · mate.

**Missões sugeridas (exemplos):** foto na Cascata do Caracol · registrar o vinho preferido na Casa Valduga · tomar um mate em Gramado · lançar o gasto do almoço de domingo.

---

## 17. Passo 0: antes de qualquer código

O Passo 0 já foi apresentado uma vez e está salvo. O seu é um **delta para aprovação formal**. Não refaça do zero.

1. **Leia** `docs/passo-0-2026-11-04.md`, `docs/atualizacao-prompt-3d.md` e `docs/atualizacao-prompt-notificacoes.md`; abra o style tile e o protótipo 3D.
2. **Reconfira o ambiente** (regra 11): `gh auth status`, `ssh -T git@github.com`, `git config user.email`, `supabase projects list`, `vercel whoami`, Docker rodando, versões no npm com `pnpm view`. Mostre o resultado em tabela.
3. **Faça as 7 perguntas abertas** da seção 15, cada uma com a recomendação ao lado, em uma única mensagem.
4. **Apresente para aprovação formal**, em um único documento no chat:
   - Os 17 ajustes em uma tabela de uma linha cada (já incorporados; pedir ok em bloco).
   - A DDL final: a do Passo 0 salvo, com o que mudou pela direção 3D (sem `theme`, com `trip_tracks`, conquistas `coast` e `downhill`), a migration nova `0005_notificacoes` (três tabelas, `due_notifications`, `pg_cron` + `pg_net`) com a renumeração das seguintes, e qualquer correção que você encontrar ao revisá-la. Aponte cada diferença.
   - Estrutura de pastas final e diagrama do ciclo offline, só se mudarem em relação a este prompt.
   - **Style tile v2:** Barlow e Barlow Condensed, paleta menos saturada, e as telas: "Agora" com a maquete abaixo (pode referenciar o protótipo), a notificação como aparece no iPhone e no Android, visão geral da viagem, garagem showroom e retrospectiva. Página HTML servida pelo Vite ou imagens.
   - Um storyboard curto do **replay ao abrir** e da **abertura do dia** (sequência de quadros com tempos).
   - Plano das 12 fases com dependências e a matriz de testes iPhone e Android.
   - Contratos das Edge Functions `import-itinerary`, `route-day` e `send-notifications` (entrada, saída, limites, autenticação).
5. **Espere a aprovação.** Só então: `git init` com e-mail local, repositório privado `dougedss/viajei` pelo alias SSH, e fase 1.

# Decisões técnicas

Um registro curto por decisão não óbvia: contexto, decisão, consequência. Em ordem cronológica.

## Fase 1 · Base (04/11/2026)

### D1 · React Compiler pelo Babel, não pelo compilador em Rust
**Contexto.** O `@vitejs/plugin-react` 6 oferece o compilador em Rust (`compiler: true`, via `oxc-transform-react`, marcado como experimental) e o caminho Babel (`@rolldown/plugin-babel` + `babel-plugin-react-compiler` 1.0).
**Decisão.** Babel com a versão 1.0 estável do compilador.
**Consequência.** Build um pouco mais lento; nenhum risco de compilar diferente da referência. Quando o caminho Rust sair de experimental, a troca é uma linha no `vite.config.ts`.

### D2 · Node 22.23 fixado em `.nvmrc`
**Contexto.** O react-router 8 exige Node 22.22+; a máquina tinha 22.17.
**Decisão.** `.nvmrc` com 22.23.4 e `engine-strict=true` no `.npmrc`, sem mudar o `default` do nvm (outros projetos continuam no deles).
**Consequência.** `nvm use` antes de trabalhar; a CI lê o `.nvmrc`.

### D3 · Dois temas com `@theme inline` apontando para variáveis cruas
**Contexto.** O Tailwind 4 gera utilities a partir do `@theme`, mas os valores de lá são estáticos.
**Decisão.** As cores que mudam com o tema vivem em `:root` (claro) e são redefinidas sob `prefers-color-scheme: dark` e `[data-theme]`; o `@theme inline` faz `bg-paper`, `text-ink` etc. apontarem para elas.
**Consequência.** Troca de tema sem classe `dark:` em cada elemento; os fixos (acento, estados, tipos de parada) ficam no `@theme` normal.

### D4 · Sessão por `getSession()` num store externo
**Contexto.** `getUser()` bate na rede; sem sinal, deslogaria quem está offline.
**Decisão.** Um `getSession()` no boot (lido do storage) e depois só `onAuthStateChange`, expostos com `useSyncExternalStore`.
**Consequência.** A rota protegida espera um estado `loading` curto; nada depende de rede para saber se há sessão.

### D5 · Convites reivindicados ao entrar, uma vez por sessão
**Contexto.** O convite fica em `trip_members` com o e-mail; só um e-mail confirmado pode reivindicá-lo (`claim_invites`).
**Decisão.** O layout autenticado chama `claim_invites` na primeira renderização com sessão e invalida a lista de convites.
**Consequência.** Quem se cadastra com o e-mail convidado vê o convite logo que confirma e entra.

### D6 · `sync_guard` tolera escrita sem `field_versions` (correção C4 do Passo 0)
**Contexto.** Uma operação sem `versions` gravava `field_versions = null` e, no trigger, `null ? coluna` fazia toda coluna inalterada ganhar versão nova.
**Decisão.** `coalesce(..., '{}')` no trigger e no `sync_push` (fase 2).
**Consequência.** Escritas do servidor (RPCs) continuam vencendo pela hora do servidor; nada mais muda de versão por acidente.

### D7 · `claim_invites` aposenta convite redundante em vez de colidir (C2)
**Contexto.** Convidar o e-mail de quem já é membro faria o `update` violar `unique (trip_id, user_id)` e derrubar a reivindicação dos outros convites.
**Decisão.** Primeiro marca `deleted_at` nos convites de viagens em que a pessoa já é membro; depois reivindica o resto.
**Consequência.** Nunca erra; o dono vê o convite redundante como encerrado.

### D8 · Índices do pull em `trip_members` (C7) e `to_char` no id de `trip_days` (C1, fase 3)
**Contexto.** `trip_members` não passa por `enable_trip_sync` e ficaria sem índice `(trip_id, synced_at)`; `date::text` depende do `DateStyle`.
**Decisão.** Índices criados na 0002; o `check` do id de `trip_days` usará `to_char(date, 'YYYY-MM-DD')`.
**Consequência.** Pull por cursor sem varredura; o UUID v5 do client e do banco batem em qualquer sessão.

### D9 · Testes de RLS com `request.jwt.claims` e `set local role`
**Contexto.** pgTAP roda como `postgres`; as policies só fazem sentido como `authenticated`.
**Decisão.** Cada arquivo cria `pg_temp.login(uuid)`, que define as claims do JWT e assume o papel `authenticated`, e cria os próprios usuários (tudo em transação, com rollback).
**Consequência.** Testes independentes do seed e do estado do banco; `supabase test db` roda na CI em minutos.

### D10 · Token da CLI do Supabase por variável, não por login
**Contexto.** Várias contas na mesma máquina; a CLI guarda um login só.
**Decisão.** `SUPABASE_ACCESS_TOKEN` da conta pessoal em `.env.local`.
**Consequência.** As contas de cliente ficam intocadas; o projeto nunca é criado na conta errada por engano.

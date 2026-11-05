# Dados geográficos embutidos

O cenário da maquete (fase 5) e as curiosidades do caminho são lidos no celular, sem rede, a partir
da rota real do dia e de três conjuntos de dados embutidos no app, em `src/lib/geo/data/`. Nenhum
deles é editado à mão: o script `scripts/geo/build-data.ts` baixa as fontes, recorta, simplifica,
codifica e grava os arquivos. Para mudar algo, muda-se o script e regenera-se.

## Fontes e licenças

| Dado | Fonte | Licença | Arquivo gerado |
|---|---|---|---|
| Linha de costa | [Natural Earth](https://www.naturalearthdata.com/) 1:10m coastline, v5.1.1 (`ne_10m_coastline.zip`, 3 MB) | domínio público | `coast.json` (14 KB) |
| Biomas | [IBGE](https://geoftp.ibge.gov.br/informacoes_ambientais/estudos_ambientais/biomas/vetores/), Biomas do Brasil 1:250.000 (`Biomas_250mil.zip`, 15 MB) | uso livre com atribuição ao IBGE | `biomes.json` (45 KB) |
| Municípios: nome, UF e centroide | [kelvins/municipios-brasileiros](https://github.com/kelvins/municipios-brasileiros) (`csv/municipios.csv` e `csv/estados.csv`) | MIT | `municipalities.json` (125 KB) |
| Municípios: população | IBGE, API [SIDRA](https://apisidra.ibge.gov.br/), tabela 6579, variável 9324 (população residente estimada), último período disponível (2026 em 04/11/2026) | uso livre com atribuição ao IBGE | idem |

Atribuições obrigatórias na tela que mostrar o dado: "Fonte: IBGE" para biomas e população;
Natural Earth e o repositório MIT não exigem, mas ficam citados aqui.

Os arquivos brutos baixados ficam em `scripts/geo/raw/`, fora do git.

## Tratamento e resolução

- **Recorte**: caixa −75 a −28 de longitude e −36 a +7 de latitude. É o Brasil com margem, para a
  distância ao mar continuar certa perto da fronteira (costa do Uruguai e das Guianas).
- **Simplificação**: Douglas-Peucker em metros. Costa com 500 m de tolerância; biomas com 2 km.
  A escala do uso é "quatro partes por dia", não metro a metro.
- **Codificação** (`src/lib/geo/codec.ts`): coordenadas em milésimos de grau (≈ 111 m), delta entre
  pontos consecutivos, zigzag, varint e base64. Municípios em formato colunar: nomes separados por
  `|`, UF em 2 caracteres por município, centroides como uma linha delta (ordenados por latitude) e
  população em varint.
- **Precisão**: a costa do Natural Earth tem erro posicional de 1 a 2 km, e uma estrada litorânea
  costuma ficar a 2 a 5 km da linha desenhada. Por isso "praia" é costa a até 4 km e a curiosidade
  diz "o mar a menos de 3 km". Os centroides dos municípios são o centro administrativo, não a
  mancha urbana.

## Como regenerar

```sh
nvm use                 # Node 22.23 roda .ts direto
pnpm geo:build          # tudo
pnpm geo:build coast    # ou só um: coast | biomes | municipalities
pnpm test -- src/lib/geo
```

O script imprime os vértices lidos e mantidos e o tamanho de cada arquivo. Os testes em
`src/lib/geo/geo.test.ts` conferem pontos conhecidos (São Paulo, Papanduva, Ubatuba, um ponto por
bioma, pontos fora do Brasil) e a leitura das duas rotas de fixture (`src/lib/geo/__fixtures__`:
São Paulo → Ubatuba e o dia 1 do seed), obtidas uma vez no OSRM público com altitude do Open-Meteo.

## Leitura do lugar

`classifySegments` classifica cada amostra de 2 km da rota por prioridade: cidade grande
(município com mais de 100 mil habitantes a até 12 km), praia (costa a até 4 km), centro de cidade
média (mais de 20 mil habitantes a até 3 km do centro), serra (inclinação média de 3% ou desnível
de 150 m num raio de 6 km), plantação (bioma aberto: cerrado, pampa, caatinga; ou terreno plano) e
interior. Depois absorve trechos curtos no vizinho maior (menos de 10 km ou 5% do dia; as pontas
nunca são absorvidas) e, se ainda houver mais de seis partes, funde as menores. `curiosities` tira
dali o ponto mais alto, a maior descida e a maior subida numa janela de 10 km, o mar perto e a
entrada em cada cenário, com legenda pronta.

Fora do Brasil: só altitude e costa; bioma e município vêm vazios e o cenário fica genérico.

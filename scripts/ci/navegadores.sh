#!/usr/bin/env bash
# Os navegadores do Playwright com as dependências do sistema (o apt da máquina do GitHub), com até
# três tentativas e um minuto entre elas. Em 11/11/2026 a máquina do laboratório ficou sem DNS para o
# espelho do Ubuntu (`Temporary failure resolving 'azure.archive.ubuntu.com'`) durante os 10 min do
# passo, e nenhum cenário rodou (a 3.0 da fase 16). A CI e o laboratório usam o mesmo passo.
#   scripts/ci/navegadores.sh chromium webkit
set -euo pipefail
for tentativa in 1 2 3; do
  if pnpm exec playwright install --with-deps "$@"; then
    exit 0
  fi
  if [ "$tentativa" -eq 3 ]; then
    echo "::error::os navegadores não instalaram em 3 tentativas"
    exit 1
  fi
  echo "::warning::a instalação dos navegadores falhou (tentativa ${tentativa} de 3); de novo em 60 s"
  sleep 60
done

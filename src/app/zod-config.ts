import { z } from 'zod';

/**
 * O Zod 4 compila cada schema de objeto com `new Function` no primeiro parse. Na abertura, o sync e
 * as telas validam dezenas de schemas de uma vez, e essa compilação aparecia no Lighthouse como
 * centenas de milissegundos de bloqueio sem arquivo (fase 12, D162). Sem a compilação, o parse segue
 * pelo caminho comum, de sobra para o tamanho dos nossos dados, e o app não precisa de `eval`. A
 * configuração vale para os schemas criados depois dela: este módulo é o primeiro import do app.
 */
z.config({ jitless: true });

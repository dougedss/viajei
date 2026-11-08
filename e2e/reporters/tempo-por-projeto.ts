import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

/**
 * No fim da suíte, quanto tempo cada projeto levou, somando as tentativas (fase 12, D160): é o número
 * que decide o recorte do WebKit, e o passo da CI só mostra o total.
 */
export default class TempoPorProjeto implements Reporter {
  private readonly total = new Map<string, number>();

  onTestEnd(test: TestCase, result: TestResult): void {
    const project = test.parent.project()?.name ?? '?';
    this.total.set(project, (this.total.get(project) ?? 0) + result.duration);
  }

  onEnd(): void {
    const linhas = [...this.total]
      .sort((a, b) => b[1] - a[1])
      .map(([project, ms]) => {
        const s = Math.round(ms / 1000);
        return `${project} ${String(Math.floor(s / 60))}m${String(s % 60).padStart(2, '0')}s`;
      });
    console.log(`tempo por projeto: ${linhas.join(' · ')}`);
  }

  printsToStdio(): boolean {
    return false;
  }
}

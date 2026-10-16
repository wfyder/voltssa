import type { QaEvent, Station, StationRuntime } from '../types';
import type { SelfTestResult } from './qaSelfTest';

interface ReportInput {
  stations: Station[];
  qaLog: QaEvent[];
  runtime: Record<string, StationRuntime>;
  selfTests: SelfTestResult[] | null;
  context: { vehicle: string; batteryPct: number; simHour: number };
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function buildReportMarkdown({ stations, qaLog, runtime, selfTests, context }: ReportInput): string {
  const now = new Date();
  const offline = stations.filter((s) => !runtime[s.id].ocppOnline);
  const maintenance = stations.filter((s) => runtime[s.id].status === 'maintenance');
  const split = stations.filter((s) => runtime[s.id].powerSplit);
  const lines = [
    '# Relatório de QA — VoltSSA (Salvador)',
    '',
    `Gerado em: ${now.toLocaleString('pt-BR')}`,
    `Contexto: ${context.vehicle} · bateria ${context.batteryPct}% · hora simulada ${context.simHour}h`,
    '',
    '## Suíte de autoteste',
    '',
  ];
  if (selfTests) {
    const passed = selfTests.filter((t) => t.passed).length;
    lines.push(`**${passed}/${selfTests.length} aprovados**`, '', '| Status | Teste | Detalhe |', '|---|---|---|');
    selfTests.forEach((t) => lines.push(`| ${t.passed ? '✅' : '❌'} | ${t.name} | ${t.detail.replace(/\|/g, '/')} |`));
  } else {
    lines.push('_Suíte não executada nesta sessão._');
  }
  lines.push(
    '',
    '## Estado da rede',
    '',
    `- Eletropostos: ${stations.length} (${stations.filter((st) => st.source === 'user').length} adicionados por usuários)`,
    `- OCPP offline: ${offline.length ? offline.map((s) => s.name).join(', ') : 'nenhum'}`,
    `- Em manutenção: ${maintenance.length ? maintenance.map((s) => s.name).join(', ') : 'nenhum'}`,
    `- Divisão de potência ativa: ${split.length ? split.map((s) => s.name).join(', ') : 'nenhuma'}`,
    '',
    `## Log de eventos (${qaLog.length})`,
    '',
    '| Hora | Categoria | Severidade | Mensagem |',
    '|---|---|---|---|',
  );
  qaLog.forEach((e) =>
    lines.push(
      `| ${new Date(e.at).toLocaleTimeString('pt-BR')} | ${e.category} | ${e.severity} | ${e.message.replace(/\|/g, '/')} |`,
    ),
  );
  return lines.join('\n');
}

export function exportReport(input: ReportInput, format: 'md' | 'json'): void {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (format === 'md') {
    download(`voltssa-qa-report-${stamp}.md`, buildReportMarkdown(input), 'text/markdown');
    return;
  }
  const payload = {
    generatedAt: new Date().toISOString(),
    context: input.context,
    selfTests: input.selfTests,
    network: input.stations.map((s) => ({
      id: s.id,
      name: s.name,
      source: s.source,
      status: input.runtime[s.id].status,
      ocppOnline: input.runtime[s.id].ocppOnline,
      powerSplit: input.runtime[s.id].powerSplit,
      reliability: input.runtime[s.id].reliability,
    })),
    events: input.qaLog,
  };
  download(`voltssa-qa-report-${stamp}.json`, JSON.stringify(payload, null, 2), 'application/json');
}

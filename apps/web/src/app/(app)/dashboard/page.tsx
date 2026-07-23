import { MetricCard } from "@workflow/ui";
import { StatusBadge, type ExecutionStatus } from "@workflow/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const METRICS = [
  { label: "Fluxos", value: "24" },
  { label: "Execucoes", value: "182.000" },
  { label: "IA Requests", value: "42.000" },
  { label: "Tempo medio", value: "2,1s" },
  { label: "Falhas", value: "3", delta: { direction: "down" as const, value: "12%" } },
  { label: "Custo IA", value: "US$ 42,00" },
];

const RECENT_EXECUTIONS: Array<{
  workflow: string;
  status: ExecutionStatus;
  duration: string;
  startedAt: string;
}> = [
  { workflow: "Suporte IA — Zendesk", status: "success", duration: "1,8s", startedAt: "há 2 min" },
  { workflow: "Lead Qualification", status: "running", duration: "—", startedAt: "há 4 min" },
  { workflow: "Resumo de reunioes", status: "success", duration: "3,2s", startedAt: "há 11 min" },
  { workflow: "Extrair PDF — boletos", status: "failed", duration: "10,0s", startedAt: "há 18 min" },
  { workflow: "Atendimento WhatsApp", status: "retry", duration: "—", startedAt: "há 22 min" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visao geral da plataforma.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {METRICS.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-md font-medium text-foreground">Execucoes recentes</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fluxo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Duracao</TableHead>
              <TableHead className="text-right">Iniciado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {RECENT_EXECUTIONS.map((execution) => (
              <TableRow key={execution.workflow}>
                <TableCell className="font-medium text-foreground">
                  {execution.workflow}
                </TableCell>
                <TableCell>
                  <StatusBadge status={execution.status} />
                </TableCell>
                <TableCell className="tabular text-right font-mono text-sm">
                  {execution.duration}
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {execution.startedAt}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

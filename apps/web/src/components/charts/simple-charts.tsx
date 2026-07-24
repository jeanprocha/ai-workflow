"use client";

const WIDTH = 600;
const HEIGHT = 160;
const PADDING = 8;

export interface SeriesPoint {
  label: string;
  value: number;
}

/** Grafico de linha minimalista, sem dependencias — so SVG. */
export function LineChart({ data, color = "var(--primary)" }: { data: SeriesPoint[]; color?: string }) {
  if (data.length === 0) {
    return <p className="text-xs text-muted-foreground">Sem dados no periodo.</p>;
  }

  const max = Math.max(...data.map((point) => point.value), 1);
  const stepX = (WIDTH - PADDING * 2) / Math.max(data.length - 1, 1);

  const points = data.map((point, index) => {
    const x = PADDING + index * stepX;
    const y = HEIGHT - PADDING - (point.value / max) * (HEIGHT - PADDING * 2);
    return `${x},${y}`;
  });

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" preserveAspectRatio="none">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {data.map((point, index) => {
        const x = PADDING + index * stepX;
        const y = HEIGHT - PADDING - (point.value / max) * (HEIGHT - PADDING * 2);
        return <circle key={point.label + index} cx={x} cy={y} r={2.5} fill={color} />;
      })}
    </svg>
  );
}

/** Grafico de barras horizontal minimalista, sem dependencias — so SVG. */
export function BarList({ data, color = "var(--primary)" }: { data: SeriesPoint[]; color?: string }) {
  if (data.length === 0) {
    return <p className="text-xs text-muted-foreground">Sem dados.</p>;
  }
  const max = Math.max(...data.map((point) => point.value), 1);

  return (
    <div className="space-y-2">
      {data.map((point) => (
        <div key={point.label} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">{point.label}</span>
          <div className="h-2 flex-1 rounded-full bg-muted">
            <div
              className="h-2 rounded-full"
              style={{ width: `${(point.value / max) * 100}%`, backgroundColor: color }}
            />
          </div>
          <span className="tabular w-20 shrink-0 text-right font-mono text-xs text-foreground">
            {point.value}
          </span>
        </div>
      ))}
    </div>
  );
}

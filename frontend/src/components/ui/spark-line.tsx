"use client";

import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";
import { useId } from "react";

interface SparkLineProps {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
  className?: string;
  tooltipFormatter?: (value: number) => string;
}

const THEME_COLORS = {
  sora: "#8397A7",
  kiku: "#DED28F",
  ume: "#9E7A7A",
  sensai: "#373C38",
} as const;

function SparkTooltip({
  active,
  payload,
  formatter,
}: {
  active?: boolean;
  payload?: { value: number }[];
  formatter?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  return (
    <div className="rounded-md border bg-card px-2 py-1 text-xs font-medium shadow-sm">
      {formatter ? formatter(val) : val.toLocaleString("fr-FR")}
    </div>
  );
}

export function SparkLine({
  data,
  color = THEME_COLORS.sora,
  height = 40,
  width,
  className,
  tooltipFormatter,
}: SparkLineProps) {
  const gradientId = useId().replace(/:/g, "_");

  if (!data || data.length < 2) return null;

  const chartData = data.map((v, i) => ({ i, v }));

  return (
    <div className={className} style={{ height, width: width ?? "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            content={<SparkTooltip formatter={tooltipFormatter} />}
            cursor={{ stroke: "var(--border)", strokeWidth: 1, strokeDasharray: "3 3" }}
          />
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, fill: color, stroke: "var(--card)", strokeWidth: 2 }}
            fillOpacity={1}
            fill={`url(#${gradientId})`}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export { THEME_COLORS };

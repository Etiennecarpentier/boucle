"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { ElevationPoint } from "@/lib/types";

interface Props {
  data: ElevationPoint[];
}

export default function ElevationProfile({ data }: Props) {
  const decimated = data.filter((_, i) => i % Math.max(1, Math.floor(data.length / 200)) === 0);

  return (
    <div className="w-full h-28 px-2 pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={decimated} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="distance"
            tickFormatter={(v: number) => `${v.toFixed(0)} km`}
            tick={{ fontSize: 10, fill: "#6b7280" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#6b7280" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v}m`}
          />
          <Tooltip
            formatter={(value: number) => [`${Math.round(value)} m`, "Altitude"]}
            labelFormatter={(label: number) => `${(+label).toFixed(2)} km`}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
          <Area
            type="monotone"
            dataKey="elevation"
            stroke="#3B82F6"
            strokeWidth={1.5}
            fill="url(#elevGrad)"
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

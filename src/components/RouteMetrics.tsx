"use client";

import type { RouteResult } from "@/lib/types";

interface Props {
  route: RouteResult;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</span>
      <span className="text-lg font-bold text-gray-800">{value}</span>
    </div>
  );
}

export default function RouteMetrics({ route }: Props) {
  const hours = Math.floor(route.durationMin / 60);
  const mins = route.durationMin % 60;
  const duration = hours > 0 ? `${hours}h${mins.toString().padStart(2, "0")}` : `${mins} min`;

  return (
    <div className="flex justify-around py-3 px-4 bg-gray-50 border-t border-gray-200">
      <Stat label="Distance" value={`${route.distanceKm.toFixed(1)} km`} />
      <Stat label="D+" value={`${route.elevationGainM} m`} />
      <Stat label="D-" value={`${route.elevationLossM} m`} />
      <Stat label="Durée" value={duration} />
    </div>
  );
}

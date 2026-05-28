"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useRef } from "react";
import ControlPanel from "@/components/ControlPanel";
import RouteMetrics from "@/components/RouteMetrics";
import type { LatLng, RouteParams, RouteResult } from "@/lib/types";
import { fetchRoute, randomWaypoint } from "@/lib/routing";
import { downloadGpx } from "@/lib/gpx";

// Leaflet needs to be client-side only
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });
const ElevationProfile = dynamic(() => import("@/components/ElevationProfile"), { ssr: false });

export default function HomePage() {
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoverPoint, setHoverPoint] = useState<LatLng | null>(null);
  const lastParamsRef = useRef<RouteParams | null>(null);
  const regenerationCountRef = useRef(0);

  const generate = useCallback(async (params: RouteParams) => {
    setLoading(true);
    setError(null);
    lastParamsRef.current = params;
    regenerationCountRef.current = 0;
    try {
      const result = await fetchRoute(params);
      setRoute(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  const regenerate = useCallback(async () => {
    if (!lastParamsRef.current) return;
    setLoading(true);
    setError(null);
    regenerationCountRef.current += 1;

    const base = lastParamsRef.current;
    const isLoop = !base.end || (base.end.lat === base.start.lat && base.end.lng === base.start.lng);

    const newParams: RouteParams = isLoop
      ? { ...base, seed: regenerationCountRef.current }
      : { ...base, randomWaypoints: [randomWaypoint(base.start, base.targetDistanceKm)] };

    try {
      const result = await fetchRoute(newParams);
      setRoute(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  function handleExportGpx() {
    if (!route) return;
    downloadGpx(route);
  }

  const startCoords = lastParamsRef.current?.start ?? null;
  const endCoords = lastParamsRef.current?.end ?? null;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-100">
      <ControlPanel
        onGenerate={generate}
        onRegenerate={regenerate}
        onExportGpx={handleExportGpx}
        hasRoute={!!route}
        loading={loading}
        error={error}
        canRegenerate={!!route && !loading}
      />

      {/* Map area */}
      <main className="flex-1 flex flex-col min-h-0 relative">
        <div className="flex-1 min-h-0">
          <MapView route={route} start={startCoords} end={endCoords} hoverPoint={hoverPoint} />
        </div>

        {/* Route metrics + elevation profile */}
        {route && (
          <div className="bg-white border-t border-gray-200 shadow-md z-10">
            <RouteMetrics route={route} />
            <ElevationProfile
              data={route.elevationProfile}
              coordinates={route.coordinates}
              onHoverPoint={setHoverPoint}
            />
          </div>
        )}

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-30 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-xl px-8 py-6 flex flex-col items-center gap-3">
              <svg className="animate-spin w-8 h-8 text-blue-600" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <p className="text-gray-700 font-medium">Calcul de l&apos;itinéraire…</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

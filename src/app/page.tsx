"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useRef } from "react";
import ControlPanel from "@/components/ControlPanel";
import RouteMetrics from "@/components/RouteMetrics";
import type { LatLng, RouteParams, RouteResult } from "@/lib/types";
import { fetchRoute, randomWaypoint, reverseRoute } from "@/lib/routing";
import { downloadGpx } from "@/lib/gpx";
import { reverseGeocode } from "@/lib/geocoding";

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

  const [startText, setStartText] = useState("");
  const [startCoords, setStartCoords] = useState<LatLng | null>(null);
  const [endText, setEndText] = useState("");
  const [endCoords, setEndCoords] = useState<LatLng | null>(null);
  const [waypoints, setWaypoints] = useState<{ text: string; coords: LatLng | null }[]>([]);
  const [mapClickMode, setMapClickMode] = useState<"start" | "end" | number | null>(null);

  // Ref used by handleMapClick to always read the latest mapClickMode without recreating the callback
  const mapClickModeRef = useRef<"start" | "end" | number | null>(null);
  mapClickModeRef.current = mapClickMode;

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
      // Rollback du compteur pour que le prochain essai reprenne au même seed
      regenerationCountRef.current -= 1;
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  function handleExportGpx() {
    if (!route) return;
    downloadGpx(route);
  }

  function handleReverseRoute() {
    if (!route) return;
    setRoute(reverseRoute(route));
  }

  const isRouteLoop = route
    ? Math.abs(route.coordinates[0].lat - route.coordinates[route.coordinates.length - 1].lat) < 0.001 &&
      Math.abs(route.coordinates[0].lng - route.coordinates[route.coordinates.length - 1].lng) < 0.001
    : false;

  const handleMapClick = useCallback(async (latlng: LatLng) => {
    const mode = mapClickModeRef.current;
    if (mode === null) return;
    setMapClickMode(null);

    const placeholder = `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
    if (mode === "start") {
      setStartCoords(latlng);
      setStartText(placeholder);
    } else if (mode === "end") {
      setEndCoords(latlng);
      setEndText(placeholder);
    } else {
      setWaypoints((wps) => wps.map((wp, i) => (i === mode ? { text: placeholder, coords: latlng } : wp)));
    }

    const label = await reverseGeocode(latlng.lat, latlng.lng);
    if (mode === "start") setStartText(label);
    else if (mode === "end") setEndText(label);
    else setWaypoints((wps) => wps.map((wp, i) => (i === mode ? { ...wp, text: label } : wp)));
  }, []);

  const handleAddWaypoint = useCallback(() => {
    setWaypoints((wps) => [...wps, { text: "", coords: null }]);
  }, []);

  const handleRemoveWaypoint = useCallback((index: number) => {
    setWaypoints((wps) => wps.filter((_, i) => i !== index));
    setMapClickMode((mode) => {
      if (typeof mode !== "number") return mode;
      if (mode === index) return null;
      return mode > index ? mode - 1 : mode;
    });
  }, []);

  const handleWaypointChange = useCallback((index: number, text: string, coords?: LatLng) => {
    setWaypoints((wps) => wps.map((wp, i) => (i === index ? { text, coords: coords ?? null } : wp)));
  }, []);

  const waypointCoords = waypoints.filter((wp) => wp.coords).map((wp) => wp.coords as LatLng);

  // En boucle avec étapes fixes, le tracé est déterministe : "proposer un autre
  // tracé" donnerait toujours le même résultat, on masque donc le bouton.
  const lastParams = lastParamsRef.current;
  const isLoopParams = lastParams
    ? !lastParams.end || (lastParams.end.lat === lastParams.start.lat && lastParams.end.lng === lastParams.start.lng)
    : false;
  const hasFixedWaypoints = (lastParams?.waypoints?.length ?? 0) > 0;

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-gray-100">
      <ControlPanel
        startText={startText}
        startCoords={startCoords}
        onStartChange={(text, coords) => { setStartText(text); setStartCoords(coords ?? null); }}
        endText={endText}
        endCoords={endCoords}
        onEndChange={(text, coords) => { setEndText(text); setEndCoords(coords ?? null); }}
        waypoints={waypoints}
        onAddWaypoint={handleAddWaypoint}
        onRemoveWaypoint={handleRemoveWaypoint}
        onWaypointChange={handleWaypointChange}
        mapClickMode={mapClickMode}
        onSetMapClickMode={setMapClickMode}
        onGenerate={generate}
        onRegenerate={regenerate}
        onExportGpx={handleExportGpx}
        onReverseRoute={handleReverseRoute}
        hasRoute={!!route}
        loading={loading}
        error={error}
        canRegenerate={!!route && !loading && !(isLoopParams && hasFixedWaypoints)}
        canReverse={isRouteLoop && !!route && !loading}
      />

      {/* Map area */}
      <main className="flex-1 flex flex-col min-h-0 relative pb-[calc(3rem+env(safe-area-inset-bottom))] md:pb-0">
        <div className="flex-1 min-h-0">
          <MapView
            route={route}
            start={startCoords}
            end={endCoords}
            waypoints={waypointCoords}
            hoverPoint={hoverPoint}
            onMapClick={handleMapClick}
            mapClickMode={mapClickMode}
          />
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

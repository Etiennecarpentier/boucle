"use client";

import { useState } from "react";
import AddressInput from "./AddressInput";
import type { LatLng, Sport, RouteParams } from "@/lib/types";

interface Props {
  startText: string;
  startCoords: LatLng | null;
  onStartChange: (text: string, coords?: LatLng) => void;
  endText: string;
  endCoords: LatLng | null;
  onEndChange: (text: string, coords?: LatLng) => void;
  mapClickMode: "start" | "end" | null;
  onSetMapClickMode: (mode: "start" | "end" | null) => void;
  onGenerate: (params: RouteParams) => void;
  onRegenerate: () => void;
  onExportGpx: () => void;
  onReverseRoute: () => void;
  hasRoute: boolean;
  loading: boolean;
  error: string | null;
  canRegenerate: boolean;
  canReverse: boolean;
}

export default function ControlPanel({
  startText, startCoords, onStartChange,
  endText, endCoords, onEndChange,
  mapClickMode, onSetMapClickMode,
  onGenerate, onRegenerate, onExportGpx, onReverseRoute,
  hasRoute, loading, error, canRegenerate, canReverse,
}: Props) {
  const [sport, setSport] = useState<Sport>("cycling-road");
  const [distanceKm, setDistanceKm] = useState<number>(50);
  const [useTime, setUseTime] = useState(false);
  const [timeHours, setTimeHours] = useState<number>(2);
  const [speedKmh, setSpeedKmh] = useState<number>(25);
  const [paceMin, setPaceMin] = useState<number>(5);
  const [paceSec, setPaceSec] = useState<number>(30);
  const [steepnessLevel, setSteepnessLevel] = useState<0 | 1 | 2 | 3 | null>(null);
  const [isOpen, setIsOpen] = useState(true);

  function handleLocate() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      onStartChange("Ma position", { lat: pos.coords.latitude, lng: pos.coords.longitude });
    });
  }

  function handleLocateEnd() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      onEndChange("Ma position", { lat: pos.coords.latitude, lng: pos.coords.longitude });
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!startCoords) return;

    const effectiveDistanceKm = useTime
      ? sport === "foot-walking"
        ? timeHours * 60 / (paceMin + paceSec / 60)
        : timeHours * speedKmh
      : distanceKm;

    onGenerate({
      start: startCoords,
      end: endCoords,
      sport,
      targetDistanceKm: effectiveDistanceKm,
      steepnessLevel: steepnessLevel ?? undefined,
    });
  }

  function handleSportChange(s: Sport) {
    setSport(s);
    if (s === "cycling-road") setSpeedKmh(25);
  }

  const isLoop = !endCoords || (endCoords.lat === startCoords?.lat && endCoords.lng === startCoords?.lng);

  const sharedProps = {
    sport, setSport: handleSportChange,
    startText, startCoords, onStartChange,
    endText, endCoords, onEndChange,
    handleLocate, handleLocateEnd,
    mapClickMode, onSetMapClickMode,
    distanceKm, setDistanceKm,
    useTime, setUseTime,
    timeHours, setTimeHours,
    speedKmh, setSpeedKmh,
    paceMin, setPaceMin,
    paceSec, setPaceSec,
    steepnessLevel, setSteepnessLevel,
    isLoop,
    onSubmit: handleSubmit, onRegenerate, onExportGpx, onReverseRoute,
    hasRoute, loading, error, canRegenerate, canReverse,
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-80 h-full bg-white border-r border-gray-200 shadow-md z-10 overflow-y-auto">
        <PanelContent {...sharedProps} />
      </aside>

      {/* Mobile bottom sheet */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-20">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full bg-blue-600 text-white py-3 px-4 flex items-center justify-between font-semibold"
        >
          <span>{loading ? "Calcul en cours…" : "Paramètres de l'itinéraire"}</span>
          <svg
            className={`w-5 h-5 transition-transform ${isOpen ? "rotate-180" : ""}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>
        {isOpen && (
          <div className="bg-white max-h-[70vh] overflow-y-auto shadow-lg border-t border-gray-200">
            <PanelContent {...sharedProps} />
          </div>
        )}
      </div>
    </>
  );
}

interface PanelContentProps {
  sport: Sport;
  setSport: (s: Sport) => void;
  startText: string;
  startCoords: LatLng | null;
  onStartChange: (text: string, coords?: LatLng) => void;
  endText: string;
  endCoords: LatLng | null;
  onEndChange: (text: string, coords?: LatLng) => void;
  handleLocate: () => void;
  handleLocateEnd: () => void;
  mapClickMode: "start" | "end" | null;
  onSetMapClickMode: (mode: "start" | "end" | null) => void;
  distanceKm: number;
  setDistanceKm: (v: number) => void;
  useTime: boolean;
  setUseTime: (v: boolean) => void;
  timeHours: number;
  setTimeHours: (v: number) => void;
  speedKmh: number;
  setSpeedKmh: (v: number) => void;
  paceMin: number;
  setPaceMin: (v: number) => void;
  paceSec: number;
  setPaceSec: (v: number) => void;
  steepnessLevel: 0 | 1 | 2 | 3 | null;
  setSteepnessLevel: (v: 0 | 1 | 2 | 3 | null) => void;
  isLoop: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onRegenerate: () => void;
  onExportGpx: () => void;
  onReverseRoute: () => void;
  hasRoute: boolean;
  loading: boolean;
  error: string | null;
  canRegenerate: boolean;
  canReverse: boolean;
}

function PanelContent({
  sport, setSport,
  startText, startCoords, onStartChange,
  endText, endCoords, onEndChange,
  handleLocate, handleLocateEnd,
  mapClickMode, onSetMapClickMode,
  distanceKm, setDistanceKm,
  useTime, setUseTime,
  timeHours, setTimeHours,
  speedKmh, setSpeedKmh,
  paceMin, setPaceMin,
  paceSec, setPaceSec,
  steepnessLevel, setSteepnessLevel,
  isLoop,
  onSubmit, onRegenerate, onExportGpx, onReverseRoute,
  hasRoute, loading, error, canRegenerate, canReverse,
}: PanelContentProps) {
  const effectiveDistance = useTime
    ? sport === "foot-walking"
      ? timeHours * 60 / (paceMin + paceSec / 60)
      : timeHours * speedKmh
    : distanceKm;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-2xl">🚴</span>
        <h1 className="text-lg font-bold text-gray-800">Boucle</h1>
        <span className="text-xs text-gray-400 ml-auto">Générateur d&apos;itinéraires</span>
      </div>

      {/* Sport selector */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Sport</label>
        <div className="flex gap-2">
          {([["cycling-road", "🚴 Vélo de route"], ["foot-walking", "🏃 Course à pied"]] as [Sport, string][]).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setSport(val)}
              className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                sport === val
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Points */}
      <AddressInput
        label="Départ"
        placeholder="Adresse, ville…"
        value={startText}
        coords={startCoords}
        onChange={onStartChange}
        onLocate={handleLocate}
        onPin={() => onSetMapClickMode(mapClickMode === "start" ? null : "start")}
        pinActive={mapClickMode === "start"}
      />
      <AddressInput
        label="Arrivée"
        placeholder="Même départ = boucle"
        value={endText}
        coords={endCoords}
        onChange={onEndChange}
        onLocate={handleLocateEnd}
        onPin={() => onSetMapClickMode(mapClickMode === "end" ? null : "end")}
        pinActive={mapClickMode === "end"}
      />

      {isLoop && startCoords && (
        <p className="text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2">
          ↺ Mode boucle — l&apos;itinéraire repart du même point
        </p>
      )}

      {/* Objectif */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Objectif</label>
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => setUseTime(false)}
            className={`flex-1 py-1.5 text-sm rounded-lg border font-medium transition-colors ${
              !useTime ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300"
            }`}
          >
            Distance
          </button>
          <button
            type="button"
            onClick={() => setUseTime(true)}
            className={`flex-1 py-1.5 text-sm rounded-lg border font-medium transition-colors ${
              useTime ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300"
            }`}
          >
            Durée
          </button>
        </div>

        {!useTime ? (
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Distance cible</span>
              <span className="font-semibold text-gray-700">{distanceKm} km</span>
            </div>
            <input
              type="range"
              min={sport === "foot-walking" ? 3 : 10}
              max={sport === "foot-walking" ? 50 : 300}
              step={sport === "foot-walking" ? 1 : 5}
              value={distanceKm}
              onChange={(e) => setDistanceKm(+e.target.value)}
              className="w-full accent-blue-600"
            />
          </div>
        ) : (
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-500">Durée</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={12}
                  value={Math.floor(timeHours)}
                  onChange={(e) => setTimeHours(Math.max(0, +e.target.value) + (timeHours % 1))}
                  className="w-12 border border-gray-300 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-gray-500 text-sm">h</span>
                <input
                  type="number"
                  min={0}
                  max={55}
                  step={5}
                  value={Math.round((timeHours % 1) * 60 / 5) * 5}
                  onChange={(e) => setTimeHours(Math.floor(timeHours) + Math.min(55, Math.max(0, +e.target.value)) / 60)}
                  className="w-12 border border-gray-300 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-gray-400 text-xs">min</span>
              </div>
            </div>
            {sport === "foot-walking" ? (
              <div className="flex-1">
                <label className="text-xs text-gray-500">Allure (min/km)</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={2}
                    max={20}
                    value={paceMin}
                    onChange={(e) => setPaceMin(Math.max(2, Math.min(20, +e.target.value)))}
                    className="w-12 border border-gray-300 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-gray-500 text-sm">:</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={String(paceSec).padStart(2, "0")}
                    onChange={(e) => setPaceSec(Math.max(0, Math.min(59, +e.target.value)))}
                    className="w-12 border border-gray-300 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-gray-400 text-xs">/km</span>
                </div>
              </div>
            ) : (
              <div className="flex-1">
                <label className="text-xs text-gray-500">Vitesse (km/h)</label>
                <input
                  type="number"
                  min={5}
                  max={50}
                  value={speedKmh}
                  onChange={(e) => setSpeedKmh(+e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>
        )}

        {useTime && (
          <p className="text-xs text-gray-500 mt-1">→ Distance cible : <strong>{effectiveDistance.toFixed(0)} km</strong></p>
        )}
      </div>

      {/* Difficulté / dénivelé — vélo seulement */}
      {sport === "cycling-road" && (
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
            Difficulté
          </label>
          <div className="grid grid-cols-2 gap-2">
            {([
              [null,  "—",          "Peu importe",  "text-gray-500"],
              [0,     "🟢 Plat",     "< 8 m/km",     "text-green-600"],
              [1,     "🟡 Modéré",   "8–15 m/km",    "text-yellow-600"],
              [2,     "🟠 Vallonné", "15–25 m/km",   "text-orange-500"],
              [3,     "🔴 Montagneux","> 25 m/km",   "text-red-600"],
            ] as [0|1|2|3|null, string, string, string][]).map(([val, label, hint, color]) => (
              <button
                key={String(val)}
                type="button"
                onClick={() => setSteepnessLevel(steepnessLevel === val ? null : val)}
                className={`flex flex-col items-start px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  steepnessLevel === val
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white border-gray-300 hover:border-blue-400"
                } ${val === null ? "col-span-2" : ""}`}
              >
                <span className={steepnessLevel === val ? "text-white" : color}>{label}</span>
                <span className={`text-xs font-normal ${steepnessLevel === val ? "text-blue-100" : "text-gray-400"}`}>{hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <button
        type="submit"
        disabled={!startCoords || loading}
        className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold transition-colors flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Calcul en cours…
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13.5 2C8 2 3.5 6.5 3.5 12S8 22 13.5 22c2.3 0 4.4-.8 6.1-2l1.4 1.4 1.4-1.4-1.4-1.4c1.2-1.7 2-3.8 2-6.1C23 6.5 18.5 2 13.5 2zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8zm.5-13h-1.5v6l5.2 3.1.8-1.3-4.5-2.7V7z" />
            </svg>
            Générer l&apos;itinéraire
          </>
        )}
      </button>

      {canRegenerate && (
        <button
          type="button"
          onClick={onRegenerate}
          disabled={loading}
          className="w-full py-2.5 rounded-xl border-2 border-blue-500 text-blue-600 hover:bg-blue-50 disabled:opacity-50 font-semibold transition-colors flex items-center justify-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
          </svg>
          Proposer un autre tracé
        </button>
      )}

      {canReverse && (
        <button
          type="button"
          onClick={onReverseRoute}
          className="w-full py-2.5 rounded-xl border-2 border-gray-400 text-gray-600 hover:bg-gray-50 font-semibold transition-colors flex items-center justify-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z"/>
          </svg>
          Inverser le sens
        </button>
      )}

      {hasRoute && (
        <button
          type="button"
          onClick={onExportGpx}
          className="w-full py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition-colors flex items-center justify-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
          </svg>
          Exporter en .gpx
        </button>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}
    </form>
  );
}

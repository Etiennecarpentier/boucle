"use client";

import { useEffect, useRef } from "react";
import type { LatLng, RouteResult } from "@/lib/types";

interface Props {
  route: RouteResult | null;
  start: LatLng | null;
  end: LatLng | null;
  hoverPoint?: LatLng | null;
  onMapClick?: (latlng: LatLng) => void;
  mapClickMode?: "start" | "end" | null;
}

function bearing(a: LatLng, b: LatLng): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLng) * Math.cos(lat2);
  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}

function sampleArrowPoints(coords: LatLng[], count: number): { point: LatLng; angle: number }[] {
  if (coords.length < 2) return [];
  const cumDist: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    const dx = coords[i].lng - coords[i - 1].lng;
    const dy = coords[i].lat - coords[i - 1].lat;
    cumDist.push(cumDist[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  const total = cumDist[cumDist.length - 1];
  const step = total / (count + 1);
  const result: { point: LatLng; angle: number }[] = [];
  for (let k = 1; k <= count; k++) {
    const target = step * k;
    let i = 1;
    while (i < cumDist.length - 1 && cumDist[i] < target) i++;
    const t = (target - cumDist[i - 1]) / (cumDist[i] - cumDist[i - 1]);
    const point: LatLng = {
      lat: coords[i - 1].lat + t * (coords[i].lat - coords[i - 1].lat),
      lng: coords[i - 1].lng + t * (coords[i].lng - coords[i - 1].lng),
    };
    result.push({ point, angle: bearing(coords[i - 1], coords[i]) });
  }
  return result;
}

function makeCircleIcon(L: typeof import("leaflet"), color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export default function MapView({ route, start, end, hoverPoint, onMapClick, mapClickMode }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polylineRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const standaloneMarkersRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hoverMarkerRef = useRef<any>(null);

  // Always-fresh ref for the click callback so the Leaflet listener never goes stale
  const onMapClickRef = useRef(onMapClick);
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);

  // Map init — runs once
  useEffect(() => {
    if (typeof window === "undefined") return;

    import("leaflet").then((L) => {
      if (mapRef.current || !containerRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((containerRef.current as any)._leaflet_id) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(containerRef.current!, { center: [46.5, 2.5], zoom: 6 });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        onMapClickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng });
      });

      mapRef.current = map;
    });

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cursor crosshair when in pin mode
  useEffect(() => {
    if (!mapRef.current) return;
    const container = mapRef.current.getContainer?.();
    if (container) container.style.cursor = mapClickMode ? "crosshair" : "";
  }, [mapClickMode]);

  // Route polyline + markers
  useEffect(() => {
    if (!mapRef.current) return;
    import("leaflet").then((L) => {
      if (polylineRef.current) { polylineRef.current.remove(); polylineRef.current = null; }
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      if (!route) return;

      const latlngs = route.coordinates.map((c) => [c.lat, c.lng] as [number, number]);
      const poly = L.polyline(latlngs, { color: "#3B82F6", weight: 4, opacity: 0.85 }).addTo(mapRef.current);
      polylineRef.current = poly;
      mapRef.current.fitBounds(poly.getBounds(), { padding: [40, 40] });

      const arrowCount = Math.max(3, Math.round(route.distanceKm / 3));
      const arrows = sampleArrowPoints(route.coordinates, arrowCount);
      for (const { point, angle } of arrows) {
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:12px solid #1D4ED8;transform:rotate(${angle}deg);transform-origin:center center;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });
        markersRef.current.push(
          L.marker([point.lat, point.lng], { icon, interactive: false }).addTo(mapRef.current)
        );
      }

      if (start) markersRef.current.push(L.marker([start.lat, start.lng], { icon: makeCircleIcon(L, "#22c55e") }).addTo(mapRef.current));
      if (end && (end.lat !== start?.lat || end.lng !== start?.lng)) {
        markersRef.current.push(L.marker([end.lat, end.lng], { icon: makeCircleIcon(L, "#ef4444") }).addTo(mapRef.current));
      }
    });
  }, [route, start, end]);

  // Standalone markers when no route yet
  useEffect(() => {
    if (!mapRef.current) return;
    import("leaflet").then((L) => {
      standaloneMarkersRef.current.forEach((m) => m.remove());
      standaloneMarkersRef.current = [];

      if (route) return; // route effect handles markers

      if (start) {
        standaloneMarkersRef.current.push(
          L.marker([start.lat, start.lng], { icon: makeCircleIcon(L, "#22c55e") }).addTo(mapRef.current)
        );
      }
      if (end && (end.lat !== start?.lat || end.lng !== start?.lng)) {
        standaloneMarkersRef.current.push(
          L.marker([end.lat, end.lng], { icon: makeCircleIcon(L, "#ef4444") }).addTo(mapRef.current)
        );
      }

      if (start && end && (end.lat !== start.lat || end.lng !== start.lng)) {
        const bounds = L.latLngBounds([[start.lat, start.lng], [end.lat, end.lng]]);
        mapRef.current.fitBounds(bounds, { padding: [80, 80] });
      } else if (start) {
        mapRef.current.setView([start.lat, start.lng], Math.max(mapRef.current.getZoom(), 13));
      }
    });
  }, [start, end, route]);

  // Hover marker on elevation profile
  useEffect(() => {
    if (!mapRef.current) return;
    import("leaflet").then((L) => {
      if (hoverPoint) {
        if (hoverMarkerRef.current) {
          hoverMarkerRef.current.setLatLng([hoverPoint.lat, hoverPoint.lng]);
        } else {
          hoverMarkerRef.current = L.circleMarker([hoverPoint.lat, hoverPoint.lng], {
            radius: 7,
            color: "#fff",
            weight: 2,
            fillColor: "#3B82F6",
            fillOpacity: 1,
            interactive: false,
          }).addTo(mapRef.current);
        }
      } else {
        if (hoverMarkerRef.current) {
          hoverMarkerRef.current.remove();
          hoverMarkerRef.current = null;
        }
      }
    });
  }, [hoverPoint]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {mapClickMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-full shadow-lg pointer-events-none select-none">
          Cliquez sur la carte pour placer le {mapClickMode === "start" ? "départ" : "l'arrivée"}
        </div>
      )}
    </div>
  );
}

import type { LatLng, RouteParams, RouteResult, ElevationPoint } from "./types";

const ORS_BASE = "https://api.openrouteservice.org";

/** D+ cible (m/km) pour chaque niveau de difficulté */
const STEEPNESS_TARGET_M_PER_KM: Record<0 | 1 | 2 | 3, number> = {
  0: 5,   // plat
  1: 12,  // modéré
  2: 22,  // vallonné
  3: 35,  // montagneux
};

/** Nombre de candidats générés en parallèle pour sélectionner le meilleur D+ */
const N_CANDIDATES = 8;

export function randomWaypoint(center: LatLng, targetDistanceKm: number): LatLng {
  const radiusDeg = (targetDistanceKm / 4) / 111;
  const angle = Math.random() * 2 * Math.PI;
  return {
    lat: center.lat + radiusDeg * Math.sin(angle),
    lng: center.lng + radiusDeg * Math.cos(angle),
  };
}

/** Extrait un RouteResult depuis la réponse GeoJSON ORS */
function parseRouteResult(data: unknown): RouteResult {
  const feature = (data as { features: unknown[] }).features[0] as {
    properties: { summary: { distance: number; duration: number } };
    geometry: { coordinates: [number, number, number][] };
  };
  const summary = feature.properties.summary;
  const rawCoords = feature.geometry.coordinates;

  const coordinates: LatLng[] = rawCoords.map(([lng, lat]) => ({ lat, lng }));

  let cumulDist = 0;
  const elevationProfile: ElevationPoint[] = [];
  for (let i = 0; i < rawCoords.length; i++) {
    if (i > 0) {
      const [lng1, lat1] = rawCoords[i - 1];
      const [lng2, lat2] = rawCoords[i];
      cumulDist += haversineKm(lat1, lng1, lat2, lng2);
    }
    elevationProfile.push({ distance: cumulDist, elevation: rawCoords[i][2] ?? 0 });
  }

  // Calcul D+/D- avec seuil de 10m (méthode Garmin/Strava) :
  // on ne comptabilise un gain/perte que si l'altitude a changé d'au moins
  // 10m depuis le dernier point significatif, pour éliminer le bruit SRTM.
  let elevGain = 0, elevLoss = 0;
  let lastSignificant = rawCoords[0]?.[2] ?? 0;
  for (let i = 1; i < rawCoords.length; i++) {
    const elev = rawCoords[i][2] ?? 0;
    const diff = elev - lastSignificant;
    if (Math.abs(diff) >= 10) {
      if (diff > 0) elevGain += diff;
      else elevLoss += Math.abs(diff);
      lastSignificant = elev;
    }
  }

  return {
    coordinates,
    distanceKm: summary.distance,
    elevationGainM: Math.round(elevGain),
    elevationLossM: Math.round(elevLoss),
    durationMin: Math.round(summary.duration / 60),
    elevationProfile,
  };
}

/** Génère une boucle ORS round_trip pour un seed donné. Retourne null en cas d'erreur. */
async function fetchLoopCandidate(
  start: LatLng,
  targetDistanceKm: number,
  seed: number,
  profile: string,
  apiKey: string,
): Promise<RouteResult | null> {
  try {
    const res = await fetch(`${ORS_BASE}/v2/directions/${profile}/geojson`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: apiKey },
      body: JSON.stringify({
        coordinates: [[start.lng, start.lat]],
        options: {
          round_trip: {
            length: Math.round(targetDistanceKm * 1000),
            points: 3,
            seed,
          },
        },
        elevation: true,
        instructions: false,
        units: "km",
      }),
    });
    if (!res.ok) return null;
    return parseRouteResult(await res.json());
  } catch {
    return null;
  }
}

export async function fetchRoute(params: RouteParams): Promise<RouteResult> {
  const apiKey = process.env.NEXT_PUBLIC_ORS_API_KEY;
  if (!apiKey || apiKey === "your_ors_api_key_here") {
    throw new Error("Clé API manquante. Renseignez NEXT_PUBLIC_ORS_API_KEY dans .env.local");
  }

  const isLoop = !params.end ||
    (params.end.lat === params.start.lat && params.end.lng === params.start.lng);

  const profile = params.sport === "cycling-road" ? "cycling-road" : "foot-walking";

  // ── Mode boucle ──────────────────────────────────────────────────────────
  if (isLoop) {
    const regenOffset = (params.seed ?? 0) * N_CANDIDATES;

    if (params.steepnessLevel !== undefined) {
      // Génère N candidats en parallèle, retourne le plus proche du D+ cible
      const seeds = Array.from({ length: N_CANDIDATES }, (_, i) => regenOffset + i);
      const results = await Promise.all(
        seeds.map(s => fetchLoopCandidate(params.start, params.targetDistanceKm, s, profile, apiKey))
      );
      const valid = results.filter((r): r is RouteResult => r !== null);
      if (valid.length === 0) throw new Error("Aucun itinéraire trouvé. Vérifiez votre connexion ou changez le point de départ.");

      const targetDPlus = STEEPNESS_TARGET_M_PER_KM[params.steepnessLevel] * params.targetDistanceKm;
      return valid.reduce((best, c) =>
        Math.abs(c.elevationGainM - targetDPlus) < Math.abs(best.elevationGainM - targetDPlus) ? c : best
      );
    }

    // Pas de préférence de dénivelé : un seul appel
    const result = await fetchLoopCandidate(
      params.start, params.targetDistanceKm, regenOffset, profile, apiKey
    );
    if (!result) throw new Error("Impossible de générer l'itinéraire.");
    return result;
  }

  // ── Mode A→B ─────────────────────────────────────────────────────────────
  const waypoints: [number, number][] = [[params.start.lng, params.start.lat]];
  if (params.randomWaypoints) {
    for (const wp of params.randomWaypoints) waypoints.push([wp.lng, wp.lat]);
  }
  waypoints.push([params.end!.lng, params.end!.lat]);

  const res = await fetch(`${ORS_BASE}/v2/directions/${profile}/geojson`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: apiKey },
    body: JSON.stringify({ coordinates: waypoints, elevation: true, instructions: false, units: "km" }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ORS error ${res.status}: ${err}`);
  }

  return parseRouteResult(await res.json());
}

export function reverseRoute(route: RouteResult): RouteResult {
  const reversedCoords = [...route.coordinates].reverse();

  const n = route.elevationProfile.length;
  const totalDist = route.elevationProfile[n - 1]?.distance ?? 0;
  const reversedProfile = route.elevationProfile.map((_, i) => ({
    distance: totalDist - route.elevationProfile[n - 1 - i].distance,
    elevation: route.elevationProfile[n - 1 - i].elevation,
  }));

  return {
    ...route,
    coordinates: reversedCoords,
    elevationGainM: route.elevationLossM,
    elevationLossM: route.elevationGainM,
    elevationProfile: reversedProfile,
  };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

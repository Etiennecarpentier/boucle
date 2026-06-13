import type { LatLng, RouteParams, RouteResult, ElevationPoint } from "./types";

const ORS_BASE = "https://api.openrouteservice.org";

/** D+ cible (m/km) pour chaque niveau de difficulté */
const STEEPNESS_TARGET_M_PER_KM: Record<0 | 1 | 2 | 3, number> = {
  0: 5,   // plat
  1: 12,  // modéré
  2: 22,  // vallonné
  3: 35,  // montagneux
};

/** Nombre de candidats générés en parallèle */
const N_CANDIDATES_CYCLING = 6;
const N_CANDIDATES_RUNNING = 8;

/** Tolérance de distance acceptable selon le sport (ratio) */
const DIST_TOLERANCE_CYCLING = 0.25;
const DIST_TOLERANCE_RUNNING = 0.12;

/** Facteur approximatif route/vol d'oiseau, pour estimer la distance d'un trajet avant requête ORS */
const ROAD_DETOUR_FACTOR = 1.3;

export function randomWaypoint(center: LatLng, targetDistanceKm: number): LatLng {
  const radiusDeg = (targetDistanceKm / 4) / 111;
  const angle = Math.random() * 2 * Math.PI;
  return {
    lat: center.lat + radiusDeg * Math.sin(angle),
    lng: center.lng + radiusDeg * Math.cos(angle),
  };
}

/** Construit un RouteResult à partir d'une polyligne brute (lng, lat, ele) et de ses totaux */
function buildRouteResult(rawCoords: [number, number, number][], distanceKm: number, durationSec: number): RouteResult {
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
    distanceKm,
    elevationGainM: Math.round(elevGain),
    elevationLossM: Math.round(elevLoss),
    durationMin: Math.round(durationSec / 60),
    elevationProfile,
  };
}

/** Extrait un RouteResult depuis la réponse GeoJSON ORS (une seule feature) */
function parseRouteResult(data: unknown): RouteResult {
  const feature = (data as { features: unknown[] }).features[0] as {
    properties: { summary: { distance: number; duration: number } };
    geometry: { coordinates: [number, number, number][] };
  };
  return buildRouteResult(feature.geometry.coordinates, feature.properties.summary.distance, feature.properties.summary.duration);
}

/** Largeur (en mètres) du couloir interdit construit autour d'un tronçon déjà parcouru */
const CORRIDOR_WIDTH_M = 25;

/** Nombre maximal de points conservés par tronçon pour borner la taille des polygones d'évitement */
const CORRIDOR_MAX_POINTS = 15;

/** Réduit une polyligne à au plus `maxPoints` points par échantillonnage uniforme */
function simplifyCoords(coords: [number, number, number][], maxPoints: number): [number, number][] {
  if (coords.length <= maxPoints) return coords.map(([lng, lat]) => [lng, lat]);
  const step = (coords.length - 1) / (maxPoints - 1);
  const result: [number, number][] = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round(i * step);
    const [lng, lat] = coords[idx];
    result.push([lng, lat]);
  }
  return result;
}

/** Construit, pour chaque segment d'une polyligne, un rectangle de `widthM` mètres de large
 *  centré sur ce segment, à fournir à ORS comme zones à éviter (avoid_polygons). */
function buildAvoidCorridor(coords: [number, number][], widthM: number): [number, number][][][] {
  const polygons: [number, number][][][] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const [lng1, lat1] = coords[i];
    const [lng2, lat2] = coords[i + 1];
    const latRad = (lat1 * Math.PI) / 180;
    const dLat = lat2 - lat1;
    const dLng = (lng2 - lng1) * Math.cos(latRad);
    const len = Math.sqrt(dLat * dLat + dLng * dLng);
    if (len === 0) continue;
    const perpLat = -dLng / len;
    const perpLng = dLat / len;
    const widthLat = widthM / 111320;
    const widthLng = widthM / (111320 * Math.cos(latRad));
    const offLat = perpLat * widthLat;
    const offLng = perpLng * widthLng;
    const ring: [number, number][] = [
      [lng1 + offLng, lat1 + offLat],
      [lng2 + offLng, lat2 + offLat],
      [lng2 - offLng, lat2 - offLat],
      [lng1 - offLng, lat1 - offLat],
      [lng1 + offLng, lat1 + offLat],
    ];
    polygons.push([ring]);
  }
  return polygons;
}

/** Calcule un trajet entre deux points en évitant les couloirs `avoidPolygons`
 *  (tronçons déjà parcourus), pour empêcher les allers-retours dans une boucle.
 *  Si l'évitement échoue (zone trop grande, aucun trajet possible…), retente sans contrainte. */
async function fetchLeg(
  from: LatLng,
  to: LatLng,
  profile: string,
  apiKey: string,
  avoidPolygons: [number, number][][][],
): Promise<{ coords: [number, number, number][]; distanceKm: number; durationSec: number }> {
  const body: Record<string, unknown> = {
    coordinates: [[from.lng, from.lat], [to.lng, to.lat]],
    elevation: true,
    instructions: false,
    units: "km",
  };
  if (avoidPolygons.length > 0) {
    body.options = { avoid_polygons: { type: "MultiPolygon", coordinates: avoidPolygons } };
  }

  let res = await fetch(`${ORS_BASE}/v2/directions/${profile}/geojson`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: apiKey },
    body: JSON.stringify(body),
  });

  if (res.status === 429) throw new Error("Limite de requêtes ORS atteinte. Attendez quelques secondes puis réessayez.");

  if (!res.ok && avoidPolygons.length > 0) {
    const retryBody: Record<string, unknown> = { ...body };
    delete retryBody.options;
    res = await fetch(`${ORS_BASE}/v2/directions/${profile}/geojson`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: apiKey },
      body: JSON.stringify(retryBody),
    });
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ORS error ${res.status}: ${err}`);
  }

  const data = await res.json() as {
    features: Array<{
      properties: { summary: { distance: number; duration: number } };
      geometry: { coordinates: [number, number, number][] };
    }>;
  };

  const feature = data.features[0];
  return {
    coords: feature.geometry.coordinates,
    distanceKm: feature.properties.summary.distance,
    durationSec: feature.properties.summary.duration,
  };
}

/** Génère une boucle ORS round_trip pour un seed donné.
 *  Retourne null si ORS ne trouve pas de route.
 *  Lance une erreur si le quota API est dépassé (429) ou erreur serveur (5xx). */
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
    if (res.status === 429) throw new Error("quota");
    if (res.status >= 500) throw new Error("server");
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
  const isRunning = profile === "foot-walking";
  const distTolerance = isRunning ? DIST_TOLERANCE_RUNNING : DIST_TOLERANCE_CYCLING;

  // ── Mode boucle ──────────────────────────────────────────────────────────
  if (isLoop) {
    // Étapes manuelles : on calcule un itinéraire fixe départ → étapes → départ,
    // round_trip ne supportant pas de points de passage imposés. Chaque tronçon
    // est calculé séparément en évitant les routes déjà parcourues, pour que le
    // retour ne reproduise pas le trajet aller (vraie boucle, pas d'aller-retour).
    if (params.waypoints && params.waypoints.length > 0) {
      let points = [params.start, ...params.waypoints, params.start];

      // Si le trajet via les étapes est nettement plus court que la distance
      // cible, on ajoute un détour aléatoire (même mécanisme que la
      // régénération) pour s'en approcher.
      let directKm = 0;
      for (let i = 0; i < points.length - 1; i++) {
        directKm += haversineKm(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng);
      }
      const estimatedRoadKm = directKm * ROAD_DETOUR_FACTOR;
      const missingKm = params.targetDistanceKm - estimatedRoadKm;
      if (missingKm > params.targetDistanceKm * distTolerance) {
        const detour = randomWaypoint(params.start, missingKm * 2);
        points = [params.start, detour, ...params.waypoints, params.start];
      }

      const avoidPolygons: [number, number][][][] = [];
      const allCoords: [number, number, number][] = [];
      let totalDistanceKm = 0;
      let totalDurationSec = 0;

      for (let i = 0; i < points.length - 1; i++) {
        const leg = await fetchLeg(points[i], points[i + 1], profile, apiKey, avoidPolygons);
        const legCoords = allCoords.length > 0 ? leg.coords.slice(1) : leg.coords;
        allCoords.push(...legCoords);
        totalDistanceKm += leg.distanceKm;
        totalDurationSec += leg.durationSec;

        const simplified = simplifyCoords(leg.coords, CORRIDOR_MAX_POINTS);
        avoidPolygons.push(...buildAvoidCorridor(simplified, CORRIDOR_WIDTH_M));
      }

      return buildRouteResult(allCoords, totalDistanceKm, totalDurationSec);
    }

    const nCandidates = isRunning ? N_CANDIDATES_RUNNING : N_CANDIDATES_CYCLING;
    const regenOffset = (params.seed ?? 0) * nCandidates;

    const seeds = Array.from({ length: nCandidates }, (_, i) => regenOffset + i);
    const settled = await Promise.allSettled(
      seeds.map(s => fetchLoopCandidate(params.start, params.targetDistanceKm, s, profile, apiKey))
    );

    const isQuotaError = settled.some(
      r => r.status === "rejected" && (r.reason as Error)?.message === "quota"
    );
    if (isQuotaError) throw new Error("Limite de requêtes ORS atteinte. Attendez quelques secondes puis réessayez.");

    const valid = settled
      .filter((r): r is PromiseFulfilledResult<RouteResult> => r.status === "fulfilled" && r.value !== null)
      .map(r => r.value);
    if (valid.length === 0) throw new Error("Aucun itinéraire trouvé. Vérifiez votre connexion ou changez le point de départ.");

    // Candidats dans la tolérance de distance — si aucun, on prend tout
    const withinDist = valid.filter(
      r => Math.abs(r.distanceKm - params.targetDistanceKm) / params.targetDistanceKm <= distTolerance
    );
    const pool = withinDist.length > 0 ? withinDist : valid;

    if (params.steepnessLevel !== undefined) {
      const targetDPlus = STEEPNESS_TARGET_M_PER_KM[params.steepnessLevel] * params.targetDistanceKm;
      return pool.reduce((best, c) =>
        Math.abs(c.elevationGainM - targetDPlus) < Math.abs(best.elevationGainM - targetDPlus) ? c : best
      );
    }

    // Pas de préférence de dénivelé : retourne le plus proche de la distance cible
    return pool.reduce((best, c) =>
      Math.abs(c.distanceKm - params.targetDistanceKm) < Math.abs(best.distanceKm - params.targetDistanceKm) ? c : best
    );
  }

  // ── Mode A→B ─────────────────────────────────────────────────────────────
  const coords: [number, number][] = [[params.start.lng, params.start.lat]];
  if (params.waypoints) {
    for (const wp of params.waypoints) coords.push([wp.lng, wp.lat]);
  }
  if (params.randomWaypoints) {
    for (const wp of params.randomWaypoints) coords.push([wp.lng, wp.lat]);
  }
  coords.push([params.end!.lng, params.end!.lat]);

  const res = await fetch(`${ORS_BASE}/v2/directions/${profile}/geojson`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: apiKey },
    body: JSON.stringify({ coordinates: coords, elevation: true, instructions: false, units: "km" }),
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

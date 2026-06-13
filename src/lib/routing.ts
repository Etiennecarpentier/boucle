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

/** Codes de surface ORS (extra_info "surface") considérés comme "mauvais" pour le
 *  vélo de route : non revêtus (terre, herbe, gravier, sable…) ou inconnus. */
const BAD_SURFACE_CODES = new Set([0, 2, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18]);

/** Proportion de mauvaise surface au-delà de laquelle on tente un détour */
const BAD_SURFACE_THRESHOLD = 0.15;

type SurfaceExtra = {
  values: [number, number, number][];
  summary: { value: number; distance: number; amount: number }[];
};

type ORSFeature = {
  properties: {
    summary: { distance: number; duration: number };
    extras?: { surface?: SurfaceExtra };
  };
  geometry: { coordinates: [number, number, number][] };
};

type ORSResponse = { features: ORSFeature[] };

/** Proportion (0–1) de la distance d'un trajet roulant sur une "mauvaise" surface */
function badSurfaceRatio(extras?: { surface?: SurfaceExtra }): number {
  const summary = extras?.surface?.summary;
  if (!summary) return 0;
  let bad = 0;
  for (const s of summary) {
    if (BAD_SURFACE_CODES.has(s.value)) bad += s.amount;
  }
  return bad / 100;
}

/** Construit des couloirs d'évitement autour des portions de mauvaise surface du trajet */
function buildBadSurfaceCorridors(
  coords: [number, number, number][],
  extras?: { surface?: SurfaceExtra },
): [number, number][][][] {
  const values = extras?.surface?.values;
  if (!values) return [];
  const polygons: [number, number][][][] = [];
  for (const [from, to, code] of values) {
    if (!BAD_SURFACE_CODES.has(code)) continue;
    const segment = coords.slice(from, to + 1);
    if (segment.length < 2) continue;
    const simplified = simplifyCoords(segment, CORRIDOR_MAX_POINTS);
    polygons.push(...buildAvoidCorridor(simplified, CORRIDOR_WIDTH_M));
  }
  return polygons;
}

/** Calcule un itinéraire ORS pour une liste de coordonnées (lng, lat), en évitant les
 *  couloirs `avoidPolygons` (tronçons déjà parcourus, pour empêcher les allers-retours
 *  dans une boucle). Si `avoidBadSurfaces` est activé et que le trajet obtenu roule trop
 *  sur de mauvaises surfaces, retente en les évitant également. Si l'évitement échoue
 *  (zone trop grande, aucun trajet possible…), retombe sur le trajet sans contrainte. */
async function fetchDirections(
  coordinates: [number, number][],
  profile: string,
  apiKey: string,
  avoidPolygons: [number, number][][][],
  avoidBadSurfaces: boolean,
): Promise<{ coords: [number, number, number][]; distanceKm: number; durationSec: number; extras?: { surface?: SurfaceExtra } }> {
  const buildBody = (polys: [number, number][][][]): Record<string, unknown> => {
    const body: Record<string, unknown> = {
      coordinates,
      elevation: true,
      instructions: false,
      units: "km",
    };
    if (polys.length > 0) {
      body.options = { avoid_polygons: { type: "MultiPolygon", coordinates: polys } };
    }
    if (avoidBadSurfaces) body.extra_info = ["surface"];
    return body;
  };

  const send = (body: Record<string, unknown>) =>
    fetch(`${ORS_BASE}/v2/directions/${profile}/geojson`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: apiKey },
      body: JSON.stringify(body),
    });

  let res = await send(buildBody(avoidPolygons));

  if (res.status === 429) throw new Error("Limite de requêtes ORS atteinte. Attendez quelques secondes puis réessayez.");

  if (!res.ok && avoidPolygons.length > 0) {
    res = await send(buildBody([]));
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ORS error ${res.status}: ${err}`);
  }

  let feature = ((await res.json()) as ORSResponse).features[0];

  if (avoidBadSurfaces) {
    const ratio = badSurfaceRatio(feature.properties.extras);
    if (ratio > BAD_SURFACE_THRESHOLD) {
      const corridors = buildBadSurfaceCorridors(feature.geometry.coordinates, feature.properties.extras);
      if (corridors.length > 0) {
        const retryRes = await send(buildBody([...avoidPolygons, ...corridors]));
        if (retryRes.ok) {
          const retryFeature = ((await retryRes.json()) as ORSResponse).features[0];
          if (badSurfaceRatio(retryFeature.properties.extras) < ratio) {
            feature = retryFeature;
          }
        }
      }
    }
  }

  return {
    coords: feature.geometry.coordinates,
    distanceKm: feature.properties.summary.distance,
    durationSec: feature.properties.summary.duration,
    extras: feature.properties.extras,
  };
}

/** Calcule un trajet entre deux points (cf. `fetchDirections`) */
function fetchLeg(
  from: LatLng,
  to: LatLng,
  profile: string,
  apiKey: string,
  avoidPolygons: [number, number][][][],
  avoidBadSurfaces: boolean,
): Promise<{ coords: [number, number, number][]; distanceKm: number; durationSec: number; extras?: { surface?: SurfaceExtra } }> {
  return fetchDirections([[from.lng, from.lat], [to.lng, to.lat]], profile, apiKey, avoidPolygons, avoidBadSurfaces);
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
  avoidBadSurfaces: boolean,
): Promise<{ result: RouteResult; badRatio: number } | null> {
  try {
    const body: Record<string, unknown> = {
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
    };
    if (avoidBadSurfaces) body.extra_info = ["surface"];

    const res = await fetch(`${ORS_BASE}/v2/directions/${profile}/geojson`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: apiKey },
      body: JSON.stringify(body),
    });
    if (res.status === 429) throw new Error("quota");
    if (res.status >= 500) throw new Error("server");
    if (!res.ok) return null;
    const feature = ((await res.json()) as ORSResponse).features[0];
    return {
      result: buildRouteResult(feature.geometry.coordinates, feature.properties.summary.distance, feature.properties.summary.duration),
      badRatio: badSurfaceRatio(feature.properties.extras),
    };
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
        const leg = await fetchLeg(points[i], points[i + 1], profile, apiKey, avoidPolygons, params.avoidBadSurfaces ?? false);
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
      seeds.map(s => fetchLoopCandidate(params.start, params.targetDistanceKm, s, profile, apiKey, params.avoidBadSurfaces ?? false))
    );

    const isQuotaError = settled.some(
      r => r.status === "rejected" && (r.reason as Error)?.message === "quota"
    );
    if (isQuotaError) throw new Error("Limite de requêtes ORS atteinte. Attendez quelques secondes puis réessayez.");

    const valid = settled
      .filter((r): r is PromiseFulfilledResult<{ result: RouteResult; badRatio: number }> => r.status === "fulfilled" && r.value !== null)
      .map(r => r.value);
    if (valid.length === 0) throw new Error("Aucun itinéraire trouvé. Vérifiez votre connexion ou changez le point de départ.");

    // Candidats dans la tolérance de distance — si aucun, on prend tout
    const withinDist = valid.filter(
      v => Math.abs(v.result.distanceKm - params.targetDistanceKm) / params.targetDistanceKm <= distTolerance
    );
    let pool = withinDist.length > 0 ? withinDist : valid;

    // Si on privilégie les bonnes surfaces, on écarte les candidats trop "mauvais"
    // quand il en reste au moins un acceptable
    if (params.avoidBadSurfaces) {
      const goodPool = pool.filter(v => v.badRatio <= BAD_SURFACE_THRESHOLD);
      if (goodPool.length > 0) pool = goodPool;
    }

    if (params.steepnessLevel !== undefined) {
      const targetDPlus = STEEPNESS_TARGET_M_PER_KM[params.steepnessLevel] * params.targetDistanceKm;
      return pool.reduce((best, c) =>
        Math.abs(c.result.elevationGainM - targetDPlus) < Math.abs(best.result.elevationGainM - targetDPlus) ? c : best
      ).result;
    }

    // Pas de préférence de dénivelé : retourne le plus proche de la distance cible
    return pool.reduce((best, c) =>
      Math.abs(c.result.distanceKm - params.targetDistanceKm) < Math.abs(best.result.distanceKm - params.targetDistanceKm) ? c : best
    ).result;
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

  const leg = await fetchDirections(coords, profile, apiKey, [], params.avoidBadSurfaces ?? false);
  return buildRouteResult(leg.coords, leg.distanceKm, leg.durationSec);
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

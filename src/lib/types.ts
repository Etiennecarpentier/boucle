export type Sport = "cycling-road" | "foot-walking";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteParams {
  start: LatLng;
  end: LatLng | null;
  sport: Sport;
  targetDistanceKm: number;
  /** 0 = plat, 1 = modéré, 2 = vallonné, 3 = montagneux — vélo seulement */
  steepnessLevel?: 0 | 1 | 2 | 3;
  /** Étapes ajoutées manuellement par l'utilisateur, à suivre dans l'ordre */
  waypoints?: LatLng[];
  /** Waypoints aléatoires injectés pour la regénération (mode A→B) */
  randomWaypoints?: LatLng[];
  /** Seed ORS round_trip pour varier les boucles */
  seed?: number;
  /** Privilégier les routes bien revêtues (éviter pistes/chemins en mauvais état) */
  avoidBadSurfaces?: boolean;
}

export interface ElevationPoint {
  distance: number; // km depuis le départ
  elevation: number; // m
}

export interface RouteResult {
  coordinates: LatLng[];
  distanceKm: number;
  elevationGainM: number;
  elevationLossM: number;
  durationMin: number;
  elevationProfile: ElevationPoint[];
}

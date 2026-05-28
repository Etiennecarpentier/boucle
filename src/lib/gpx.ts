import type { LatLng, RouteResult } from "./types";

export function generateGpx(route: RouteResult, name = "Boucle"): string {
  const now = new Date().toISOString();
  const trackPoints = route.coordinates
    .map((p: LatLng, i: number) => {
      const elev = route.elevationProfile[i]?.elevation ?? 0;
      return `    <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}"><ele>${elev.toFixed(1)}</ele></trkpt>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Boucle App"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${name}</name>
    <time>${now}</time>
  </metadata>
  <trk>
    <name>${name}</name>
    <trkseg>
${trackPoints}
    </trkseg>
  </trk>
</gpx>`;
}

export function downloadGpx(route: RouteResult, name = "boucle"): void {
  const content = generateGpx(route, name);
  const blob = new Blob([content], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/\s+/g, "_")}.gpx`;
  a.click();
  URL.revokeObjectURL(url);
}

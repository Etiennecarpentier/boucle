export interface GeocodingResult {
  label: string;
  lat: number;
  lng: number;
}

const ORS_BASE = "https://api.openrouteservice.org";

export async function autocomplete(query: string): Promise<GeocodingResult[]> {
  const apiKey = process.env.NEXT_PUBLIC_ORS_API_KEY;
  if (!apiKey || apiKey === "your_ors_api_key_here" || query.length < 3) return [];

  const url = `${ORS_BASE}/geocode/autocomplete?api_key=${apiKey}&text=${encodeURIComponent(query)}&size=7&lang=fr&boundary.country=FRA`;
  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await res.json();
  return (data.features ?? []).map((f: { properties: { label: string }; geometry: { coordinates: [number, number] } }) => ({
    label: f.properties.label,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
  }));
}

export interface GeocodingResult {
  label: string;
  lat: number;
  lng: number;
}

const NOMINATIM = "https://nominatim.openstreetmap.org";

interface NominatimAddress {
  house_number?: string;
  road?: string;
  postcode?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  name?: string;
}

function formatAddress(addr: NominatimAddress, fallback: string): string {
  const street = addr.house_number && addr.road
    ? `${addr.house_number} ${addr.road}`
    : addr.road ?? addr.name ?? null;
  const city = addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? null;
  const postcode = addr.postcode ?? null;

  const parts: string[] = [];
  if (street) parts.push(street);
  if (postcode && city) parts.push(`${postcode} ${city}`);
  else if (city) parts.push(city);
  else if (postcode) parts.push(postcode);

  return parts.length > 0 ? parts.join(", ") : fallback;
}

export async function autocomplete(query: string): Promise<GeocodingResult[]> {
  if (query.length < 3) return [];

  const params = new URLSearchParams({
    q: query,
    format: "json",
    limit: "8",
    addressdetails: "1",
    "accept-language": "fr",
  });

  const res = await fetch(`${NOMINATIM}/search?${params}`);
  if (!res.ok) return [];

  const data = await res.json();
  return data.map((item: { display_name: string; address: NominatimAddress; lat: string; lon: string }) => ({
    label: formatAddress(item.address, item.display_name),
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
  }));
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: "json",
    addressdetails: "1",
    "accept-language": "fr",
    zoom: "16",
  });

  const res = await fetch(`${NOMINATIM}/reverse?${params}`);
  if (!res.ok) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  const data = await res.json();
  return formatAddress(data.address ?? {}, data.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
}

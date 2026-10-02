// Adresse -> Koordinate und Kartenprojektion (Web-Mercator, wie die OSM-Kacheln). Ohne DOM/Netzwerk.
// Adresse -> Nominatim-Suche (OSM-Geocoding); Ergebnisse werden pro Anschrift im Browser gemerkt
export const addressKey = ({ strasse, plz, ort }) => [strasse, plz, ort].map(part => String(part ?? "").trim().toLowerCase().replace(/\s+/g, " ")).join("|");

// Grossraum Berlin; Treffer ausserhalb (z.B. "Hauptstr. 5" in Hessen) verwerfen wir
export const REGION_BBOX = [12.9, 52.2, 13.9, 52.8];

const nominatimUrl = q => `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, format: "jsonv2", addressdetails: "1", limit: "1", countrycodes: "de", "accept-language": "de" })}`;

// Suchvarianten von genau nach grob: eine falsche PLZ oder "Berlin" fuer Schoenfliess verhindert sonst jeden Treffer
export const geocodeUrls = ({ strasse, plz, ort }) => [...new Set([
  [strasse, [plz, ort].filter(Boolean).join(" ")],
  [strasse, ort],
  [strasse]
].map(parts => parts.filter(Boolean).join(", ")))].filter(Boolean).map(nominatimUrl);

// genau: Hausnummer gefunden; strasse: nur die Strasse (Mitte der Strasse)
export const parseGeocodeResult = results => {
  const hit = Array.isArray(results) ? results[0] : null;
  const [lon, lat] = [Number(hit?.lon), Number(hit?.lat)];
  return Number.isFinite(lon) && Number.isFinite(lat) ? { lon, lat, quality: hit.address?.house_number ? "genau" : "strasse" } : null;
};

export const lonLatToWorld = ([lon, lat], zoom) => {
  const scale = 256 * 2 ** zoom;
  const sinLat = Math.sin(lat * Math.PI / 180);
  return [(lon + 180) / 360 * scale, (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale];
};

export const inBbox = ({ lon, lat }, [minLon, minLat, maxLon, maxLat]) => lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat;

// Alle Ansichten rechnen in Weltpixeln bei BASE_ZOOM; ein view ist { x, y, w, h } in diesen Einheiten.
export const BASE_ZOOM = 14;
export const VIEW_RATIO = 0.62;
const MIN_VIEW_WIDTH = 150;

export const worldBounds = bbox => {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const [x1, y1] = lonLatToWorld([minLon, maxLat], BASE_ZOOM);
  const [x2, y2] = lonLatToWorld([maxLon, minLat], BASE_ZOOM);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
};

export const projectWorld = point => lonLatToWorld([point.lon, point.lat], BASE_ZOOM);

// Ansicht auf Breite w setzen (Seitenverhaeltnis fest) und im Kartenbereich halten
export const clampView = (view, bounds) => {
  const w = Math.min(Math.max(view.w, MIN_VIEW_WIDTH), Math.max(bounds.w, MIN_VIEW_WIDTH));
  const h = w * VIEW_RATIO;
  const fit = (value, size, min, total) => total <= size ? min + (total - size) / 2 : Math.min(Math.max(value, min), min + total - size);
  return { x: fit(view.x, w, bounds.x, bounds.w), y: fit(view.y, h, bounds.y, bounds.h), w, h };
};

// factor < 1 zoomt hinein; (fx, fy) = Ankerpunkt als Anteil der Ansicht (0..1), bleibt unter dem Mauszeiger stehen
export const zoomView = (view, factor, [fx, fy], bounds) => {
  const w = view.w * factor;
  return clampView({ x: view.x + view.w * fx - w * fx, y: view.y + view.h * fy - w * VIEW_RATIO * fy, w }, bounds);
};

// Standardansicht: Umgebung von Luebars
export const homeView = bounds => {
  const [x, y] = lonLatToWorld([13.343, 52.611], BASE_ZOOM);
  return clampView({ x: x - 500, y: y - 310, w: 1000 }, bounds);
};

export const fitView = (points, bounds) => {
  if (!points.length) return clampView({ ...bounds }, bounds);
  const [xs, ys] = [points.map(([x]) => x), points.map(([, y]) => y)];
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const w = Math.max(600, maxX - minX + 160, (maxY - minY + 160) / VIEW_RATIO);
  return clampView({ x: (minX + maxX - w) / 2, y: (minY + maxY - w * VIEW_RATIO) / 2, w }, bounds);
};

// Kachelzoom so waehlen, dass eine Kachel etwa 256 Bildschirmpixel gross ist (pxPerUnit = Bildschirmpixel je Weltpixel)
export const tileZoomFor = pxPerUnit => Math.min(Math.max(Math.round(BASE_ZOOM + Math.log2(pxPerUnit)), 10), 18);

export const visibleTiles = (view, zoom) => {
  const size = 256 * 2 ** (BASE_ZOOM - zoom);
  const [x0, x1, y0, y1] = [Math.floor(view.x / size), Math.floor((view.x + view.w) / size), Math.floor(view.y / size), Math.floor((view.y + view.h) / size)];
  return Array.from({ length: x1 - x0 + 1 }, (_, i) => x0 + i).flatMap(x => Array.from({ length: y1 - y0 + 1 }, (_, j) => ({ zoom, x, y: y0 + j, px: x * size, py: (y0 + j) * size, size })));
};

// Index des naechsten Punkts innerhalb von maxDist (Bildschirmpixel), sonst -1
export const nearestIndex = (points, [x, y], maxDist) => points.reduce((best, [px, py], index) => {
  const dist = Math.hypot(px - x, py - y);
  return dist <= maxDist && dist < best.dist ? { index, dist } : best;
}, { index: -1, dist: Infinity }).index;

const normalizePlace = value => String(value ?? "").trim().toLowerCase().replaceAll("ß", "ss");
// Vergleicht die eingegebene PLZ/Ort mit dem, was OSM zu der Adresse kennt (z.B. "Berlin" statt Schoenfliess)
export const addressWarning = (member, hit) => {
  const address = hit?.address ?? {};
  const places = [address.city, address.town, address.village, address.municipality, address.suburb, address.hamlet, address.city_district].filter(Boolean);
  const where = [address.postcode, address.village || address.town || address.city || address.municipality].filter(Boolean).join(" ");
  const plz = String(member.plz ?? "").trim();
  const ort = normalizePlace(member.ort);
  if (plz && address.postcode && plz !== address.postcode) return `PLZ ${plz} passt nicht zur Adresse – laut OpenStreetMap: ${where}.`;
  if (ort && places.length && !places.some(place => normalizePlace(place).includes(ort) || ort.includes(normalizePlace(place)))) return `Ort „${member.ort}“ passt nicht zur Adresse – laut OpenStreetMap: ${where}.`;
  return null;
};

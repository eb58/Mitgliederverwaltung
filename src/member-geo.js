// Adresse -> Koordinate und Kartenprojektion (Web-Mercator, wie die OSM-Kacheln). Ohne DOM/Netzwerk.
// Adresse -> Nominatim-Suche (OSM-Geocoding); Ergebnisse werden pro Anschrift im Browser gemerkt
export const addressKey = ({ strasse, plz, ort }) => [strasse, plz, ort].map(part => String(part ?? "").trim().toLowerCase().replace(/\s+/g, " ")).join("|");

export const geocodeUrl = ({ strasse, plz, ort }) => {
  const params = new URLSearchParams({ q: [strasse, [plz, ort].filter(Boolean).join(" ")].filter(Boolean).join(", "), format: "jsonv2", addressdetails: "1", limit: "1", countrycodes: "de", "accept-language": "de" });
  return `https://nominatim.openstreetmap.org/search?${params}`;
};

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

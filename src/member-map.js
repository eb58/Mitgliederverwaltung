import { formatMemberName, isActiveMember, isGuestMember } from "./member-domain.js";
import { REGION_BBOX, addressKey, fitView, geocodeUrls, homeView, inBbox, parseGeocodeResult, projectWorld, tileZoomFor, visibleTiles, worldBounds, zoomView } from "./member-geo.js";
import { state } from "./state.js";

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const TILE_URL = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

// Nominatim-Nutzungsbedingungen: max. 1 Anfrage/Sekunde, Ergebnisse zwischenspeichern
const REQUEST_GAP_MS = 1100;
const BOUNDS = worldBounds(REGION_BBOX);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export const createMemberMap = ({ openMemberModal, resolveMemberPhotoDataUrl, loadGeocodeCache, saveGeocode }) => {
  let runId = 0;

  const render = async () => {
    const run = ++runId;
    const host = document.getElementById("memberMapHost");
    const summary = document.getElementById("memberMapSummary");
    const missingHost = document.getElementById("memberMapMissing");
    const members = state.members.filter(member => isActiveMember(member) && !isGuestMember(member));
    // Koordinaten liegen zentral auf dem Server; ohne Server-Antwort suchen wir einfach neu
    const cache = await loadGeocodeCache().catch(() => ({}));
    if (run !== runId) return;
    // "2|": seit den Ausweichsuchen werden alte "nicht gefunden" neu gesucht, alte Treffer bleiben gueltig
    const keyOf = member => `2|${addressKey(member)}`;
    const hitOf = member => cache[keyOf(member)] ?? cache[addressKey(member)] ?? null;
    const located = member => member.strasse && hitOf(member);
    const pending = () => members.filter(member => member.strasse && !(keyOf(member) in cache) && !cache[addressKey(member)]);

    let places = [];
    const buildPlaces = () => {
      const byPosition = new Map();
      members.filter(located).forEach(member => {
        const hit = hitOf(member);
        const key = `${hit.lon},${hit.lat}`;
        (byPosition.get(key) ?? byPosition.set(key, { ...hit, strasse: member.strasse, members: [] }).get(key)).members.push(member);
      });
      places = [...byPosition.values()];
    };
    buildPlaces();

    let view = homeView(BOUNDS);
    host.innerHTML = `<svg class="member-map__svg" role="img" aria-label="Wohnorte der aktiven Mitglieder"><g class="member-map__tiles"></g><g class="member-map__dots"></g></svg>
      <div class="member-map__zoom"><button type="button" data-zoom="in" title="Hineinzoomen" aria-label="Hineinzoomen">+</button><button type="button" data-zoom="out" title="Herauszoomen" aria-label="Herauszoomen">−</button><button type="button" data-zoom="home" title="Zurück nach Lübars" aria-label="Zurück nach Lübars">⌂</button><button type="button" data-zoom="all" title="Alle Mitglieder zeigen" aria-label="Alle Mitglieder zeigen">⤢</button></div>`;
    const svg = host.querySelector("svg");
    const tilesLayer = svg.querySelector(".member-map__tiles");
    const dotsLayer = svg.querySelector(".member-map__dots");
    let tileKey = "";
    const pxPerUnit = () => (svg.clientWidth || 1000) / view.w;
    const dotRadius = place => Math.min(4 + place.members.length * 1.2, 9);

    // Punkte bleiben unabhaengig vom Zoom gleich gross
    const drawDots = () => {
      dotsLayer.innerHTML = places.map((place, index) => {
        const [x, y] = projectWorld(place);
        return `<circle class="member-map__dot member-map__dot--${place.quality}" data-index="${index}" data-r="${dotRadius(place)}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(dotRadius(place) / pxPerUnit()).toFixed(2)}"></circle>`;
      }).join("");
    };
    const apply = () => {
      svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
      const tiles = visibleTiles(view, tileZoomFor(pxPerUnit()));
      const key = tiles.map(({ zoom, x, y }) => `${zoom}/${x}/${y}`).join();
      if (key !== tileKey) {
        tileKey = key;
        tilesLayer.innerHTML = tiles.map(({ zoom, x, y, px, py, size }) => `<image href="${TILE_URL(zoom, x, y)}" x="${px}" y="${py}" width="${size}" height="${size}"></image>`).join("");
      }
      dotsLayer.querySelectorAll(".member-map__dot").forEach(dot => dot.setAttribute("r", (Number(dot.dataset.r) / pxPerUnit()).toFixed(2)));
    };

    const showPlace = place => {
      const info = document.getElementById("memberMapInfo");
      info.innerHTML = `<strong>${escapeHtml(place.strasse)}</strong> ${place.quality === "strasse" ? `<span class="text-muted">· Hausnummer unbekannt, Punkt auf der Straße</span>` : ""}<ul class="member-map__members">${place.members.map(member => `<li data-photo-for="${escapeHtml(member.id)}"><button type="button" class="btn btn-link p-0" data-member-id="${escapeHtml(member.id)}">${escapeHtml(formatMemberName(member))}</button></li>`).join("")}</ul>`;
      // Passfoto nur, wenn vorhanden; die Anzeige kann inzwischen durch einen anderen Punkt ersetzt sein
      place.members.filter(member => member.hasPassbildInDb).forEach(member => resolveMemberPhotoDataUrl(member).then(url => {
        const item = url && info.querySelector(`[data-photo-for="${CSS.escape(String(member.id))}"]`);
        if (!item) return;
        const image = Object.assign(document.createElement("img"), { className: "member-map__photo", alt: `Passfoto von ${formatMemberName(member)}`, src: url });
        image.addEventListener("error", () => image.remove(), { once: true });
        item.prepend(image);
      }).catch(() => {}));
    };
    // Hover zeigt die Mitglieder sofort; die Anzeige bleibt stehen, damit man die Namen anklicken kann. Klick fuer Touch.
    host.onmouseover = host.onclick = event => {
      const dot = event.target.closest(".member-map__dot");
      if (dot) showPlace(places[Number(dot.dataset.index)]);
    };

    const zoomBy = (factor, anchor = [0.5, 0.5]) => { view = zoomView(view, factor, anchor, BOUNDS); apply(); };
    svg.addEventListener("wheel", event => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      zoomBy(event.deltaY < 0 ? 0.8 : 1.25, [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height]);
    }, { passive: false });
    let drag = null;
    svg.addEventListener("pointerdown", event => { drag = { x: event.clientX, y: event.clientY, moved: false, id: event.pointerId }; });
    svg.addEventListener("pointermove", event => {
      if (!drag || event.pointerId !== drag.id) return;
      if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) return;
      if (!drag.moved) svg.setPointerCapture(event.pointerId);
      drag.moved = true;
      const scale = view.w / svg.clientWidth;
      view = zoomView({ ...view, x: view.x - (event.clientX - drag.x) * scale, y: view.y - (event.clientY - drag.y) * scale }, 1, [0, 0], BOUNDS);
      [drag.x, drag.y] = [event.clientX, event.clientY];
      apply();
    });
    ["pointerup", "pointercancel"].forEach(type => svg.addEventListener(type, () => { drag = null; }));
    host.querySelector(".member-map__zoom").addEventListener("click", event => {
      const mode = event.target.closest("[data-zoom]")?.dataset.zoom;
      if (mode === "home") { view = homeView(BOUNDS); apply(); } else if (mode === "all") { view = fitView(places.map(projectWorld), BOUNDS); apply(); } else if (mode) zoomBy(mode === "in" ? 0.5 : 2);
    });

    const updateSummary = () => {
      const placed = places.reduce((sum, place) => sum + place.members.length, 0);
      const exact = places.filter(place => place.quality === "genau").reduce((sum, place) => sum + place.members.length, 0);
      const open = pending().length;
      summary.textContent = `${placed} von ${members.length} aktiven Mitgliedern auf der Karte (${exact} hausnummerngenau)${open ? ` – Adressen werden einmalig gesucht (ca. 1 pro Sekunde), noch ${open} offen …` : ""}`;
      const missing = members.filter(member => !located(member) && (!member.strasse || keyOf(member) in cache));
      missingHost.innerHTML = missing.length
        ? `<details><summary>${missing.length} ohne Kartenposition</summary><ul>${missing.map(member => `<li><button type="button" class="btn btn-link p-0" data-member-id="${escapeHtml(member.id)}">${escapeHtml(formatMemberName(member))}</button> – ${escapeHtml(member.strasse || "keine Straße")} (${member.strasse ? "Adresse nicht gefunden" : "keine Anschrift"})</li>`).join("")}</ul></details>`
        : "";
    };

    drawDots();
    apply();
    updateSummary();

    // Fehlende Adressen nacheinander bei Nominatim erfragen; der Treffer (auch "nicht gefunden") wird gemerkt
    const queue = [...new Map(pending().map(member => [keyOf(member), member])).values()];
    let requests = 0;
    for (const member of queue) {
      let hit = null;
      try {
        for (const url of geocodeUrls(member)) {
          if (requests++) await sleep(REQUEST_GAP_MS);
          if (run !== runId) return;
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const result = parseGeocodeResult(await response.json());
          if (result && inBbox(result, REGION_BBOX)) { hit = result; break; }
        }
      } catch (error) {
        summary.textContent = `Adresssuche unterbrochen (${error.message}). Beim nächsten Öffnen geht es weiter.`;
        return;
      }
      cache[keyOf(member)] = hit;
      saveGeocode(keyOf(member), hit).catch(() => {});
      if (run !== runId) return;
      buildPlaces();
      drawDots();
      updateSummary();
    }
  };

  document.getElementById("member-map-pane").addEventListener("click", event => {
    const button = event.target.closest("[data-member-id]");
    if (button) openMemberModal(Number(button.dataset.memberId));
  });
  return { render };
};

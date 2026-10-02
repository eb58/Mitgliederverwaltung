import { formatMemberName, isActiveMember, isGuestMember } from "./member-domain.js";
import { REGION_BBOX, addressKey, addressWarning, clampView, fitView, geocodeUrls, homeView, inBbox, nearestIndex, parseGeocodeResult, projectWorld, tileZoomFor, visibleTiles, worldBounds, zoomView } from "./member-geo.js";
import { state } from "./state.js";

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const TILE_URL = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

// Nominatim-Nutzungsbedingungen: max. 1 Anfrage/Sekunde, Ergebnisse zwischenspeichern
const REQUEST_GAP_MS = 1100;
const INFO_HINT = "Mit der Maus auf einen Punkt zeigen, um die Mitglieder zu sehen.";
const BOUNDS = worldBounds(REGION_BBOX);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Plausibilitaetscheck beim Speichern: findet OSM die Anschrift, und passen PLZ/Ort? null = nichts zu beanstanden.
// Netzwerkfehler sollen das Speichern nicht aufhalten und liefern ebenfalls null.
export const checkMemberAddress = async member => {
  try {
    for (const [index, url] of geocodeUrls(member).entries()) {
      if (index) await sleep(REQUEST_GAP_MS);
      const response = await fetch(url);
      if (!response.ok) return null;
      const results = await response.json();
      const result = parseGeocodeResult(results);
      if (result && inBbox(result, REGION_BBOX)) return addressWarning(member, results[0]);
    }
    return { message: `Die Adresse „${[member.strasse, [member.plz, member.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")}“ wurde bei OpenStreetMap nicht gefunden.` };
  } catch {
    return null;
  }
};

export const createMemberMap = ({ openMemberModal, resolveMemberPhotoDataUrl, loadGeocodeCache, saveGeocode }) => {
  let runId = 0;
  let showGuests = true;
  let redraw = () => {};
  let focusId = null;
  const guestToggle = () => document.getElementById("memberMapShowGuests");

  const render = async () => {
    const run = ++runId;
    const host = document.getElementById("memberMapHost");
    const summary = document.getElementById("memberMapSummary");
    const missingHost = document.getElementById("memberMapMissing");
    // Gesucht werden alle, angezeigt je nach Schalter mit oder ohne Gaeste
    const members = state.members.filter(isActiveMember);
    // Sprung aus dem Bearbeiten-Dialog auf einen Gast: Gaeste dafuer einblenden
    if (focusId !== null && !showGuests && isGuestMember(members.find(member => member.id === focusId))) {
      showGuests = true;
      guestToggle().setAttribute("aria-pressed", "true");
    }
    const visible = () => showGuests ? members : members.filter(member => !isGuestMember(member));
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
      visible().filter(located).forEach(member => {
        const hit = hitOf(member);
        const key = `${hit.lon},${hit.lat}`;
        (byPosition.get(key) ?? byPosition.set(key, { ...hit, strasse: member.strasse, members: [] }).get(key)).members.push(member);
      });
      places = [...byPosition.values()].map(place => ({ ...place, world: projectWorld(place) }));
    };
    buildPlaces();

    let view = homeView(BOUNDS);
    host.innerHTML = `<svg class="member-map__svg" role="img" aria-label="Wohnorte der aktiven Mitglieder und Gäste"><g class="member-map__tiles"></g><g class="member-map__dots"></g></svg>
      <div class="member-map__zoom"><button type="button" data-zoom="in" title="Hineinzoomen" aria-label="Hineinzoomen">+</button><button type="button" data-zoom="out" title="Herauszoomen" aria-label="Herauszoomen">−</button><button type="button" data-zoom="home" title="Zurück nach Lübars" aria-label="Zurück nach Lübars">⌂</button><button type="button" data-zoom="all" title="Alle Mitglieder zeigen" aria-label="Alle Mitglieder zeigen">⤢</button></div>`;
    const svg = host.querySelector("svg");
    const tilesLayer = svg.querySelector(".member-map__tiles");
    const dotsLayer = svg.querySelector(".member-map__dots");
    let tileKey = "";
    let activeIndex = -1;
    const pxPerUnit = () => (svg.clientWidth || 1000) / view.w;
    const dotRadius = place => Math.min(5 + place.members.length * 1.2, 10);

    // Punkte bleiben unabhaengig vom Zoom gleich gross
    const drawDots = () => {
      activeIndex = -1;
      dotsLayer.innerHTML = places.map((place, index) => {
        const [x, y] = place.world;
        return `<circle class="member-map__dot member-map__dot--${place.quality}${place.members.every(isGuestMember) ? " member-map__dot--gast" : ""}" data-index="${index}" data-r="${dotRadius(place)}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(dotRadius(place) / pxPerUnit()).toFixed(2)}"></circle>`;
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

    let shownPlace = null;
    document.getElementById("memberMapInfo").textContent = INFO_HINT;
    const showPlace = place => {
      shownPlace = place;
      const info = document.getElementById("memberMapInfo");
      info.innerHTML = `<strong>${escapeHtml(place.strasse)}</strong> ${place.quality === "strasse" ? `<span class="text-muted">· Hausnummer unbekannt, Punkt auf der Straße</span>` : ""}<ul class="member-map__members">${place.members.map(member => `<li data-photo-for="${escapeHtml(member.id)}"><button type="button" class="btn btn-link p-0" data-member-id="${escapeHtml(member.id)}">${escapeHtml(formatMemberName(member))}</button>${isGuestMember(member) ? ` <span class="text-muted">(Gast)</span>` : ""}</li>`).join("")}</ul>`;
      // Passfoto nur, wenn vorhanden; die Anzeige kann inzwischen durch einen anderen Punkt ersetzt sein
      place.members.filter(member => member.hasPassbildInDb).forEach(member => resolveMemberPhotoDataUrl(member).then(url => {
        const item = url && shownPlace?.lon === place.lon && shownPlace?.lat === place.lat && info.querySelector(`[data-photo-for="${CSS.escape(String(member.id))}"]`);
        if (!item || item.querySelector(".member-map__photo")) return;
        const image = Object.assign(document.createElement("img"), { className: "member-map__photo", alt: `Passfoto von ${formatMemberName(member)}`, src: url });
        image.addEventListener("error", () => image.remove(), { once: true });
        item.prepend(image);
      }).catch(() => {}));
    };

    const zoomBy = (factor, anchor = [0.5, 0.5]) => { view = zoomView(view, factor, anchor, BOUNDS); apply(); };
    svg.addEventListener("wheel", event => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      zoomBy(event.deltaY < 0 ? 0.8 : 1.25, [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height]);
    }, { passive: false });
    let drag = null;
    let dragged = false;
    svg.addEventListener("pointerdown", event => { drag = { x: event.clientX, y: event.clientY, moved: false, id: event.pointerId }; dragged = false; });
    svg.addEventListener("pointermove", event => {
      if (!drag || event.pointerId !== drag.id) return;
      if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) return;
      if (!drag.moved) {
        svg.setPointerCapture(event.pointerId);
        svg.classList.add("member-map__svg--dragging");
      }
      drag.moved = dragged = true;
      const scale = view.w / svg.clientWidth;
      view = zoomView({ ...view, x: view.x - (event.clientX - drag.x) * scale, y: view.y - (event.clientY - drag.y) * scale }, 1, [0, 0], BOUNDS);
      [drag.x, drag.y] = [event.clientX, event.clientY];
      apply();
    });
    ["pointerup", "pointercancel"].forEach(type => svg.addEventListener(type, () => {
      drag = null;
      svg.classList.remove("member-map__svg--dragging");
    }));
    // Der naechste Punkt im Umkreis reagiert, nicht nur ein Treffer genau auf den kleinen Kreis
    const placeAt = (event, maxDist) => {
      const rect = svg.getBoundingClientRect();
      const scale = rect.width / view.w;
      return nearestIndex(places.map(({ world: [x, y] }) => [(x - view.x) * scale, (y - view.y) * scale]), [event.clientX - rect.left, event.clientY - rect.top], maxDist);
    };
    const markActive = index => {
      dotsLayer.querySelector(".member-map__dot--active")?.classList.remove("member-map__dot--active");
      activeIndex = index;
      const dot = dotsLayer.querySelector(`[data-index="${index}"]`);
      dot?.classList.add("member-map__dot--active");
      if (dot) dotsLayer.append(dot);
    };
    const highlight = index => {
      if (index < 0 || index === activeIndex) return;
      markActive(index);
      showPlace(places[index]);
    };
    // Nach dem Neuaufbau (Gaeste-Schalter, neue Suchtreffer) die Anzeige rechts nachziehen
    const refreshInfo = () => {
      if (!shownPlace) return;
      const index = places.findIndex(place => place.lon === shownPlace.lon && place.lat === shownPlace.lat);
      if (index < 0) {
        shownPlace = null;
        document.getElementById("memberMapInfo").textContent = INFO_HINT;
        return;
      }
      const sameMembers = places[index].members.map(member => member.id).join() === shownPlace.members.map(member => member.id).join();
      markActive(index);
      if (sameMembers) shownPlace = places[index]; else showPlace(places[index]);
    };
    let hoverFrame = 0;
    svg.addEventListener("mousemove", event => {
      if (drag?.moved) return;
      cancelAnimationFrame(hoverFrame);
      hoverFrame = requestAnimationFrame(() => {
        // Liegt die Maus sichtbar auf einem Punkt, zaehlt der; der Umkreis nur daneben (ueberlappende Nachbarn)
        const under = document.elementFromPoint(event.clientX, event.clientY)?.closest(".member-map__dot");
        const index = under ? Number(under.dataset.index) : placeAt(event, 15);
        svg.classList.toggle("member-map__svg--on-dot", index >= 0);
        highlight(index);
      });
    });
    // Klick oeffnet den ersten Bewohner; weitere (z.B. Ehepartner) ueber die Namensliste rechts
    svg.addEventListener("click", event => {
      if (dragged) return;
      const under = event.target.closest?.(".member-map__dot");
      const index = under ? Number(under.dataset.index) : placeAt(event, 20);
      if (index < 0) return;
      highlight(index);
      openMemberModal(places[index].members[0].id);
    });
    host.querySelector(".member-map__zoom").addEventListener("click", event => {
      const mode = event.target.closest("[data-zoom]")?.dataset.zoom;
      if (mode === "home") { view = homeView(BOUNDS); apply(); } else if (mode === "all") { view = fitView(places.map(projectWorld), BOUNDS); apply(); } else if (mode) zoomBy(mode === "in" ? 0.5 : 2);
    });

    const updateSummary = () => {
      const shown = members.filter(located);
      const guests = members.filter(isGuestMember);
      const open = pending().length;
      const guestText = showGuests ? ` und ${shown.filter(isGuestMember).length} von ${guests.length} Gästen auf der Karte` : " auf der Karte (Gäste ausgeblendet)";
      summary.textContent = `${shown.filter(member => !isGuestMember(member)).length} von ${members.length - guests.length} Mitgliedern${guestText}${open ? ` – Adressen werden einmalig gesucht (ca. 1 pro Sekunde), noch ${open} offen …` : ""}`;
      const missing = visible().filter(member => !located(member) && (!member.strasse || keyOf(member) in cache));
      missingHost.innerHTML = missing.length
        ? `<details><summary>${missing.length} ohne Kartenposition</summary><ul>${missing.map(member => `<li><button type="button" class="btn btn-link p-0" data-member-id="${escapeHtml(member.id)}">${escapeHtml(formatMemberName(member))}</button> – ${escapeHtml(member.strasse || "keine Straße")} (${member.strasse ? "Adresse nicht gefunden" : "keine Anschrift"})</li>`).join("")}</ul></details>`
        : "";
    };

    // Auf das Mitglied aus dem Bearbeiten-Dialog zoomen; fehlt die Position noch, nach dem Suchtreffer erneut
    const tryFocus = () => {
      if (focusId === null) return;
      const member = state.members.find(item => item.id === focusId);
      const index = places.findIndex(place => place.members.some(item => item.id === focusId));
      if (index >= 0) {
        const [x, y] = places[index].world;
        view = clampView({ x: x - 200, y: y - 124, w: 400 }, BOUNDS);
        apply();
        markActive(index);
        showPlace(places[index]);
        focusId = null;
      } else if (!member || !members.includes(member) || !pending().includes(member)) {
        const reason = !member || !members.includes(member) ? "ist nicht aktiv und erscheint daher nicht auf der Karte" : member.strasse ? "hat keine auffindbare Adresse" : "hat keine Anschrift";
        document.getElementById("memberMapInfo").textContent = `${member ? formatMemberName(member) : "Das Mitglied"} ${reason}.`;
        focusId = null;
      }
    };

    redraw = () => { buildPlaces(); drawDots(); updateSummary(); refreshInfo(); tryFocus(); };
    drawDots();
    apply();
    updateSummary();
    tryFocus();

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
      redraw();
    }
  };

  guestToggle().addEventListener("click", event => {
    showGuests = !showGuests;
    event.currentTarget.setAttribute("aria-pressed", String(showGuests));
    redraw();
  });
  document.getElementById("member-map-pane").addEventListener("click", event => {
    const button = event.target.closest("[data-member-id]");
    if (button) openMemberModal(Number(button.dataset.memberId));
  });
  return { render, focus: memberId => { focusId = memberId; } };
};

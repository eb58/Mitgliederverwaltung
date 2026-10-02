import { describe, it } from "node:test";
import { expect } from "./assertions.js";
import { addressKey, clampView, fitView, geocodeUrls, homeView, inBbox, lonLatToWorld, parseGeocodeResult, projectWorld, tileZoomFor, visibleTiles, worldBounds, zoomView } from "../../src/member-geo.js";

describe("member-geo", () => {
  it("bildet Schluessel und Suchadresse", () => {
    expect(addressKey({ strasse: " AEG-Straße  12 ", plz: "13469", ort: "Berlin" })).toBe("aeg-straße 12|13469|berlin");
    expect(addressKey({ strasse: "X" })).toBe("x||");
    const queries = geocodeUrls({ strasse: "Stieleichenstr. 32", plz: "13469", ort: "Berlin" }).map(url => new URL(url));
    expect(queries[0].hostname).toBe("nominatim.openstreetmap.org");
    expect(queries.map(url => url.searchParams.get("q"))).toEqual(["Stieleichenstr. 32, 13469 Berlin", "Stieleichenstr. 32, Berlin", "Stieleichenstr. 32"]);
    expect(geocodeUrls({ strasse: "Weg 1" }).map(url => new URL(url).searchParams.get("q"))).toEqual(["Weg 1"]);
    expect(geocodeUrls({ strasse: "Weg 1", plz: "13469" }).length).toBe(2);
  });

  it("wertet Nominatim-Ergebnisse aus", () => {
    expect(parseGeocodeResult([{ lon: "13.3", lat: "52.6", address: { house_number: "5" } }])).toEqual({ lon: 13.3, lat: 52.6, quality: "genau" });
    expect(parseGeocodeResult([{ lon: "13.3", lat: "52.6", address: { road: "X" } }])).toMatchObject({ quality: "strasse" });
    expect(parseGeocodeResult([])).toBe(null);
    expect(parseGeocodeResult(null)).toBe(null);
  });

  it("zoomt um den Ankerpunkt und bleibt im Kartenbereich", () => {
    const bounds = { x: 0, y: 0, w: 4000, h: 2480 };
    const view = { x: 1000, y: 500, w: 1000, h: 620 };
    const zoomed = zoomView(view, 0.5, [0.5, 0.5], bounds);
    expect(zoomed.w).toBe(500);
    expect(zoomed.x + zoomed.w / 2).toBe(1500);
    expect(zoomView(view, 0.0001, [0, 0], bounds).w).toBe(150);
    expect(zoomView(view, 100, [0.5, 0.5], bounds)).toMatchObject({ w: 4000, x: 0 });
    expect(clampView({ x: -500, y: 9999, w: 1000 }, bounds)).toMatchObject({ x: 0, y: 2480 - 620 });
  });

  it("waehlt Kachelzoom und sichtbare Kacheln", () => {
    expect(tileZoomFor(1)).toBe(14);
    expect(tileZoomFor(2)).toBe(15);
    expect(tileZoomFor(1000)).toBe(18);
    expect(tileZoomFor(0.001)).toBe(10);
    const tiles = visibleTiles({ x: 200, y: 10, w: 100, h: 62 }, 14);
    expect(tiles).toEqual([{ zoom: 14, x: 0, y: 0, px: 0, py: 0, size: 256 }, { zoom: 14, x: 1, y: 0, px: 256, py: 0, size: 256 }]);
    expect(visibleTiles({ x: 0, y: 0, w: 100, h: 62 }, 15)[0].size).toBe(128);
  });

  it("projiziert und passt die Ansicht an die Punkte an", () => {
    const bounds = worldBounds([13.2, 52.5, 13.4, 52.7]);
    const [x, y] = projectWorld({ lon: 13.3, lat: 52.6 });
    expect(x > bounds.x && x < bounds.x + bounds.w && y > bounds.y && y < bounds.y + bounds.h).toBe(true);
    const view = fitView([[x, y]], bounds);
    expect(view.w).toBe(600);
    expect(Math.abs(view.x + view.w / 2 - x) < 1e-6).toBe(true);
    expect(fitView([], bounds).w).toBe(bounds.w);
    expect(homeView(worldBounds([13.0, 52.3, 13.8, 52.7])).w).toBe(1000);
    expect(lonLatToWorld([0, 0], 0)).toEqual([128, 128]);
    expect(inBbox({ lon: 13.3, lat: 52.6 }, [13.2, 52.5, 13.4, 52.7])).toBe(true);
    expect(inBbox({ lon: 14, lat: 52.6 }, [13.2, 52.5, 13.4, 52.7])).toBe(false);
  });
});

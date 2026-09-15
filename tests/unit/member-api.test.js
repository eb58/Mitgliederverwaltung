import { afterEach, beforeEach, describe, it } from "node:test";
import { expect } from "./assertions.js";

import { createMemberApi } from "../../src/member-api.js";

const jsonResponse = (body, { status = 200 } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => "application/json" },
  text: async () => JSON.stringify(body)
});

const htmlResponse = ({ status = 200 } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => "text/html" },
  text: async () => "<html>Apache-Fehlerseite</html>"
});

let originalFetch;
let originalLocation;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  originalLocation = globalThis.location;
  globalThis.location = { protocol: "https:", origin: "https://senioren-luebars.berlin" };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.location = originalLocation;
});

const createApi = (overrides = {}) => createMemberApi({
  getAuthToken: () => "token123",
  onSessionExpired: () => {},
  ...overrides
});

describe("member-api", () => {
  it("laedt alle Mitgliederseiten, bis eine Seite nicht mehr voll ist", async () => {
    const calls = [];
    globalThis.fetch = async url => {
      calls.push(url.toString());
      const offset = new URL(url).searchParams.get("offset");
      if (offset === "0") return jsonResponse({ members: Array.from({ length: 500 }, (unused, index) => ({ id: index + 1 })) });
      return jsonResponse({ members: [{ id: 501 }] });
    };

    const api = createApi();
    const members = await api.loadMembers();

    expect(members.length).toBe(501);
    expect(calls.length).toBe(2);
  });

  it("normalisiert nur bekannte Felder beim Anlegen eines Mitglieds", async () => {
    let sentBody = null;
    globalThis.fetch = async (url, options) => {
      sentBody = JSON.parse(options.body);
      return jsonResponse({ member: { id: 7, name: "Foo", vorname: "Bar" } });
    };

    const api = createApi();
    await api.createMember({ id: 0, name: "Foo", vorname: "Bar", unbekanntesFeld: "sollNicht" });

    expect(Object.prototype.hasOwnProperty.call(sentBody, "unbekanntesFeld")).toBe(false);
    expect(sentBody.name).toBe("Foo");
  });

  it("wechselt bei einer Nicht-JSON-Antwort auf die naechste Kandidaten-URL", async () => {
    // Zur Erzeugung wird ein Nicht-http-Kontext gebraucht (liefert die statische Fallback-URL als
    // ersten Kandidaten); erst danach wechseln wir auf einen echten http(s)-Standort, damit ein
    // zweiter, davon abweichender Kandidat entsteht.
    globalThis.location = { protocol: "file:", origin: "file://" };
    const api = createApi();
    globalThis.location = { protocol: "https:", origin: "https://test.example" };

    const calls = [];
    globalThis.fetch = async url => {
      calls.push(url.toString());
      return calls.length === 1 ? htmlResponse() : jsonResponse({ members: [] });
    };

    await api.loadMembers();

    expect(calls.length).toBe(2);
  });

  it("meldet eine abgelaufene Sitzung bei 401 mit vorhandenem Token", async () => {
    let sessionExpiredCalled = false;
    globalThis.fetch = async () => jsonResponse({ error: "Sitzung abgelaufen." }, { status: 401 });

    const api = createApi({ onSessionExpired: () => { sessionExpiredCalled = true; } });

    let caughtError = null;
    try {
      await api.loadMembers();
    } catch (error) {
      caughtError = error;
    }

    expect(sessionExpiredCalled).toBe(true);
    expect(caughtError?.sessionExpired).toBe(true);
    expect(caughtError?.statusCode).toBe(401);
  });

  it("wirft keinen Sitzungsablauf-Fehler, wenn kein Auth erforderlich ist", async () => {
    let sessionExpiredCalled = false;
    globalThis.fetch = async () => jsonResponse({ error: "Anmeldung fehlgeschlagen." }, { status: 401 });

    const api = createApi({ getAuthToken: () => "", onSessionExpired: () => { sessionExpiredCalled = true; } });

    let caughtError = null;
    try {
      await api.request("/api/session", { method: "POST", requiresAuth: false });
    } catch (error) {
      caughtError = error;
    }

    expect(sessionExpiredCalled).toBe(false);
    expect(caughtError?.sessionExpired).toBe(false);
  });

  it("liefert null bei 204 No Content", async () => {
    globalThis.fetch = async () => ({ ok: true, status: 204, headers: { get: () => "" }, text: async () => "" });

    const api = createApi();
    const result = await api.request("/api/session", { method: "DELETE" });

    expect(result).toBeNull();
  });

  it("wirft einen verstaendlichen Fehler, wenn die API kein JSON liefert", async () => {
    globalThis.fetch = async () => ({ ok: true, status: 200, headers: { get: () => "application/json" }, text: async () => "kaputtes{json" });

    const api = createApi();
    let caughtError = null;
    try {
      await api.request("/api/members");
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError?.message).toBe("API hat kein JSON geliefert. Bitte API-Adresse pruefen.");
  });
});

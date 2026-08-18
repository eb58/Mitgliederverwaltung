import { fieldDefinitions } from "./member-config.js";
import { normalizeMember } from "./member-domain.js";
import { createMemberApiUrlForBase } from "./member-utils.js";

const MEMBER_API_BROWSER_CONFIG_FILE_NAME = "member-api.config.json";
const PHP_MEMBER_API_BASE_PATH = "/mitgliederverwaltung/php-api/index.php";
const MEMBER_API_PAGE_SIZE = 500;
const isLocalBrowserHost = () => ["localhost", "127.0.0.1", "::1"].includes(globalThis.location.hostname);
const defaultBaseUrl = () => globalThis.location.protocol.startsWith("http")
  ? new URL(PHP_MEMBER_API_BASE_PATH, globalThis.location.origin).toString()
  : "https://senioren-luebars.berlin/mitgliederverwaltung/php-api/index.php";

export const createMemberApi = ({ getAuthToken, onSessionExpired }) => {
  let baseUrl = defaultBaseUrl();
  const memberPhotoCache = new Map();

  const loadBrowserConfig = async () => {
    if (!globalThis.location.protocol.startsWith("http") || isLocalBrowserHost()) return;
    try {
      const response = await fetch(MEMBER_API_BROWSER_CONFIG_FILE_NAME, { cache: "no-store" });
      if (!response.ok) return;
      const configuredBaseUrl = String((await response.json()).memberApiBaseUrl || "").trim();
      if (configuredBaseUrl) baseUrl = configuredBaseUrl;
    } catch (error) {
      console.warn("API-Browser-Konfiguration konnte nicht gelesen werden.", error);
    }
  };

  const createUrl = (path, params = {}) => createMemberApiUrlForBase(baseUrl, path, params);
  // X-Auth-Token zusaetzlich, weil manche Hoster den Authorization-Header nicht an PHP durchreichen.
  const authHeaders = token => (token ? { Authorization: `Bearer ${token}`, "X-Auth-Token": token } : {});
  const getBaseUrlCandidates = () => {
    const candidates = [baseUrl, defaultBaseUrl()];
    if (globalThis.location.protocol.startsWith("http")) {
      candidates.push(new URL(PHP_MEMBER_API_BASE_PATH, globalThis.location.origin).toString());
    }
    return [...new Set(candidates)];
  };

  const request = async (path, { method = "GET", params = {}, body = null, requiresAuth = true, authToken = "" } = {}) => {
    const options = { method, headers: {} };
    const token = authToken || getAuthToken();
    if (requiresAuth) Object.assign(options.headers, authHeaders(token));
    if (body !== null) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }

    let response;
    let lastNetworkError = null;
    let lastApiFallbackResponse = null;
    for (const candidateBaseUrl of getBaseUrlCandidates()) {
      try {
        const candidateResponse = await fetch(createMemberApiUrlForBase(candidateBaseUrl, path, params), options);
        const contentType = candidateResponse.headers.get("content-type") || "";
        if (path.startsWith("/api/") && candidateResponse.status !== 204 && ([404, 405].includes(candidateResponse.status) || !contentType.includes("application/json"))) {
          lastApiFallbackResponse = candidateResponse;
          continue;
        }
        response = candidateResponse;
        baseUrl = candidateBaseUrl;
        break;
      } catch (error) {
        lastNetworkError = error;
      }
    }
    if (!response && lastApiFallbackResponse) response = lastApiFallbackResponse;
    if (!response) throw lastNetworkError || new Error("API nicht erreichbar.");
    if (response.status === 204) return null;

    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      throw new Error("API hat kein JSON geliefert. Bitte API-Adresse pruefen.");
    }
    if (!response.ok) {
      if (response.status === 401 && requiresAuth && token) {
        onSessionExpired();
        return new Promise(() => {});
      }
      const error = new Error(payload?.error || `API-Fehler ${response.status}`);
      error.statusCode = response.status;
      throw error;
    }
    return payload;
  };

  const loadMembers = async () => {
    const members = [];
    for (let offset = 0; ; offset += MEMBER_API_PAGE_SIZE) {
      const payload = await request("/api/members", { params: { limit: MEMBER_API_PAGE_SIZE, offset } });
      const page = Array.isArray(payload?.members) ? payload.members : [];
      members.push(...page);
      if (page.length < MEMBER_API_PAGE_SIZE) break;
    }
    return members.map(normalizeMember);
  };

  const toPayload = member => !member || typeof member !== "object"
    ? member
    : Object.fromEntries(fieldDefinitions.map(field => [field.key, member[field.key]]));
  const createMember = async member => normalizeMember((await request("/api/members", { method: "POST", body: toPayload(member) })).member);
  const updateMember = async member => normalizeMember((await request(`/api/members/${member.id}`, { method: "PUT", body: toPayload(member) })).member);
  const loadMemberChanges = async memberId => {
    const payload = await request(`/api/members/${memberId}/changes`);
    return Array.isArray(payload?.changes) ? payload.changes : [];
  };

  const fetchMemberPhotoObjectUrl = async memberId => {
    const cachedPhoto = memberPhotoCache.get(memberId);
    if (cachedPhoto) return cachedPhoto;
    const photoPromise = fetch(createUrl(`/api/members/${memberId}/photo`), {
      cache: "force-cache",
      headers: authHeaders(getAuthToken())
    }).then(async response => response.ok ? URL.createObjectURL(await response.blob()) : null).catch(error => {
      memberPhotoCache.delete(memberId);
      throw error;
    });
    memberPhotoCache.set(memberId, photoPromise);
    return photoPromise;
  };

  const clearMemberPhotoCache = () => {
    memberPhotoCache.forEach(cachedPhoto => cachedPhoto
      .then(photoUrl => photoUrl && URL.revokeObjectURL(photoUrl))
      .catch(() => {}));
    memberPhotoCache.clear();
  };

  const invalidateMemberPhotoCache = memberId => {
    const cachedPhoto = memberPhotoCache.get(memberId);
    if (cachedPhoto) cachedPhoto.then(photoUrl => photoUrl && URL.revokeObjectURL(photoUrl)).catch(() => {});
    memberPhotoCache.delete(memberId);
  };

  const uploadMemberPhoto = async (memberId, file) => {
    const response = await fetch(createUrl(`/api/members/${memberId}/photo`), {
      method: "PUT",
      headers: {
        ...authHeaders(getAuthToken()),
        "Content-Type": file.type || "application/octet-stream",
        "X-File-Name": encodeURIComponent(file.name)
      },
      body: file
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(payload?.error || `API-Fehler ${response.status}`);
    return payload.photo;
  };

  return {
    changeOwnPassword: password => request("/api/session/password", { method: "PUT", body: { password } }),
    clearMemberPhotoCache,
    createMember,
    createReferenceItem: (type, item) => request(`/api/reference-data/${type}`, { method: "POST", body: item }),
    createUrl,
    createUser: user => request("/api/users", { method: "POST", body: user }),
    deactivateUser: id => request(`/api/users/${id}`, { method: "DELETE" }),
    deleteReferenceItem: (type, id) => request(`/api/reference-data/${type}/${id}`, { method: "DELETE" }),
    fetchMemberPhotoObjectUrl,
    invalidateMemberPhotoCache,
    loadBrowserConfig,
    loadMemberChanges,
    loadMembers,
    loadRecentMemberChanges: () => request("/api/member-changes", { params: { limit: 100 } }),
    loadReferenceData: () => request("/api/reference-data"),
    loadReferenceItems: type => request(`/api/reference-data/${type}`),
    loadUsers: () => request("/api/users"),
    request,
    updateMember,
    updateReferenceItem: (type, item) => request(`/api/reference-data/${type}/${item.id}`, { method: "PUT", body: item }),
    updateUser: user => request(`/api/users/${user.id}`, { method: "PUT", body: user }),
    uploadMemberPhoto
  };
};

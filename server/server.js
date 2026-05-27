"use strict";

const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const config = require("./config");
const repository = require("./member-repository");
const references = require("./reference-repository");
const {
  authenticateUser,
  createUser,
  deactivateUser,
  listUsers,
  updateUser
} = require("./user-repository");
const {
  readJsonBody,
  readRequestBody,
  send,
  sendError,
  sendJson,
  sendNoContent
} = require("./http-utils");

const memberPathPattern = /^\/api\/members\/(\d+)$/;
const memberPhotoPathPattern = /^\/api\/members\/(\d+)\/photo$/;
const userPathPattern = /^\/api\/users\/(\d+)$/;
const referenceCollectionPathPattern = /^\/api\/reference-data\/([a-z-]+)$/;
const referenceResourcePathPattern = /^\/api\/reference-data\/([a-z-]+)\/(\d+)$/;
const sessions = new Map();
const staticRoot = path.resolve(__dirname, "..");
const staticMimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};
const publicStaticFiles = new Set([
  "app.js",
  "index.html",
  "member-api.config.json",
  "styles.css"
]);

const resolveStaticFilePath = url => {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    const error = new Error("Ungueltiger Dateipfad.");
    error.statusCode = 400;
    throw error;
  }

  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const normalizedRelativePath = path.normalize(relativePath);
  const isPublicFile = publicStaticFiles.has(normalizedRelativePath);
  const isAssetFile = normalizedRelativePath.startsWith(`assets${path.sep}`);
  const isVendorFile = normalizedRelativePath.startsWith(`vendor${path.sep}`);
  if (
    normalizedRelativePath.startsWith("..") ||
    path.isAbsolute(normalizedRelativePath) ||
    (!isPublicFile && !isAssetFile && !isVendorFile)
  ) {
    const error = new Error("Datei nicht gefunden.");
    error.statusCode = 404;
    throw error;
  }

  const filePath = path.resolve(staticRoot, normalizedRelativePath);
  if (!filePath.startsWith(staticRoot + path.sep)) {
    const error = new Error("Zugriff verweigert.");
    error.statusCode = 403;
    throw error;
  }
  return filePath;
};

const createSession = user => {
  const token = crypto.randomBytes(32).toString("base64url");
  sessions.set(token, { expiresAt: Date.now() + config.auth.sessionTtlMs, user });
  return token;
};

const getBearerToken = request => {
  const header = request.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
};

const isAuthenticated = request => {
  const token = getBearerToken(request);
  const session = sessions.get(token);
  if (!session) return false;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return false;
  }
  session.expiresAt = Date.now() + config.auth.sessionTtlMs;
  request.user = session.user;
  return true;
};

const requireAuthentication = (request, response) => {
  if (isAuthenticated(request)) return true;
  sendJson(response, 401, { error: "Anmeldung erforderlich." });
  return false;
};

const requireAdmin = (request, response) => {
  if (request.user?.role === "admin") return true;
  sendJson(response, 403, { error: "Administratorrechte erforderlich." });
  return false;
};

const handleSession = async (request, response) => {
  if (request.method === "POST") {
    const body = await readJsonBody(request);
    const user = await authenticateUser(body.username, body.password);
    if (!user) {
      sendJson(response, 401, { error: "Benutzername oder Passwort ist falsch." });
      return;
    }
    sendJson(response, 200, { token: createSession(user), user });
    return;
  }

  if (request.method === "GET") {
    if (!requireAuthentication(request, response)) return;
    sendJson(response, 200, { user: request.user });
    return;
  }

  if (request.method === "DELETE") {
    sessions.delete(getBearerToken(request));
    sendNoContent(response);
    return;
  }

  sendJson(response, 405, { error: "Methode nicht erlaubt." });
};

const handleUsersCollection = async (request, response) => {
  if (!requireAdmin(request, response)) return;
  if (request.method === "GET") {
    sendJson(response, 200, { users: await listUsers() });
    return;
  }
  if (request.method === "POST") {
    const user = await createUser(await readJsonBody(request));
    sendJson(response, 201, { user });
    return;
  }
  sendJson(response, 405, { error: "Methode nicht erlaubt." });
};

const handleUserResource = async (request, response, id) => {
  if (!requireAdmin(request, response)) return;
  if ((request.method === "PUT" || request.method === "PATCH")) {
    const body = await readJsonBody(request);
    if (id === request.user.id && body.active === false) {
      sendJson(response, 400, { error: "Der eigene Benutzer kann nicht deaktiviert werden." });
      return;
    }
    if (id === request.user.id && body.role && body.role !== "admin") {
      sendJson(response, 400, { error: "Der eigene Benutzer muss Admin bleiben." });
      return;
    }
    const user = await updateUser(id, body);
    if (!user) {
      sendJson(response, 404, { error: "Benutzer nicht gefunden." });
      return;
    }
    sendJson(response, 200, { user });
    return;
  }
  if (request.method === "DELETE") {
    if (id === request.user.id) {
      sendJson(response, 400, { error: "Der eigene Benutzer kann nicht deaktiviert werden." });
      return;
    }
    if (!await deactivateUser(id)) {
      sendJson(response, 404, { error: "Benutzer nicht gefunden." });
      return;
    }
    sendNoContent(response);
    return;
  }
  sendJson(response, 405, { error: "Methode nicht erlaubt." });
};

const handleReferenceDataOverview = async (request, response) => {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Methode nicht erlaubt." });
    return;
  }
  sendJson(response, 200, await references.listReferenceData());
};

const handleReferenceDataCollection = async (request, response, type) => {
  if (request.method === "GET") {
    if (!requireAdmin(request, response)) return;
    sendJson(response, 200, { items: await references.listReferenceItems(type, { includeInactive: true }) });
    return;
  }
  if (request.method === "POST") {
    if (!requireAdmin(request, response)) return;
    const item = await references.createReferenceItem(type, await readJsonBody(request));
    sendJson(response, 201, { item });
    return;
  }
  sendJson(response, 405, { error: "Methode nicht erlaubt." });
};

const handleReferenceDataResource = async (request, response, type, id) => {
  if (request.method === "PUT" || request.method === "PATCH") {
    if (!requireAdmin(request, response)) return;
    const item = await references.updateReferenceItem(type, id, await readJsonBody(request));
    sendJson(response, 200, { item });
    return;
  }
  if (request.method === "DELETE") {
    if (!requireAdmin(request, response)) return;
    if (!await references.deleteReferenceItem(type, id)) {
      sendJson(response, 404, { error: "Stammdatensatz nicht gefunden." });
      return;
    }
    sendNoContent(response);
    return;
  }
  sendJson(response, 405, { error: "Methode nicht erlaubt." });
};

const parseId = value => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("Ungueltige Mitglieds-ID.");
    error.statusCode = 400;
    throw error;
  }
  return id;
};

const parsePhotoPayload = async request => {
  const decodeFileName = value => {
    try {
      return decodeURIComponent(String(value || ""));
    } catch {
      return String(value || "");
    }
  };
  const contentType = request.headers["content-type"] || "application/octet-stream";
  if (contentType.startsWith("application/json")) {
    const payload = await readJsonBody(request);
    const base64 = String(payload.base64 || "");
    if (!base64) {
      const error = new Error("base64 ist erforderlich.");
      error.statusCode = 400;
      throw error;
    }
    return {
      fileName: payload.fileName || "passbild.jpg",
      mimeType: payload.mimeType || "image/jpeg",
      content: Buffer.from(base64, "base64")
    };
  }

  return {
    fileName: decodeFileName(request.headers["x-file-name"]) || "passbild.jpg",
    mimeType: contentType.split(";")[0] || "application/octet-stream",
    content: await readRequestBody(request)
  };
};

const handleMembersCollection = async (request, response, url) => {
  if (request.method === "GET") {
    const members = await repository.findMembers({
      search: url.searchParams.get("search") || "",
      limit: url.searchParams.get("limit") || 50,
      offset: url.searchParams.get("offset") || 0
    });
    sendJson(response, 200, { members });
    return;
  }

  if (request.method === "POST") {
    const member = await repository.createMember(await readJsonBody(request));
    sendJson(response, 201, { member });
    return;
  }

  sendJson(response, 405, { error: "Methode nicht erlaubt." });
};

const handleMemberResource = async (request, response, id) => {
  if (request.method === "GET") {
    const member = await repository.findMemberById(id);
    if (!member) {
      sendJson(response, 404, { error: "Mitglied nicht gefunden." });
      return;
    }
    sendJson(response, 200, { member });
    return;
  }

  if (request.method === "PATCH" || request.method === "PUT") {
    const member = await repository.updateMember(id, await readJsonBody(request));
    if (!member) {
      sendJson(response, 404, { error: "Mitglied nicht gefunden." });
      return;
    }
    sendJson(response, 200, { member });
    return;
  }

  if (request.method === "DELETE") {
    const deleted = await repository.deleteMember(id);
    if (!deleted) {
      sendJson(response, 404, { error: "Mitglied nicht gefunden." });
      return;
    }
    sendNoContent(response);
    return;
  }

  sendJson(response, 405, { error: "Methode nicht erlaubt." });
};

const handleMemberPhoto = async (request, response, id) => {
  if (request.method === "GET") {
    const photo = await repository.getMemberPhoto(id);
    if (!photo) {
      sendJson(response, 404, { error: "Passbild nicht gefunden." });
      return;
    }
    send(response, 200, photo.inhalt, {
      "Content-Type": photo.mime_type,
      "Content-Length": photo.inhalt.length,
      "Content-Disposition": `inline; filename="${photo.dateiname}"`
    });
    return;
  }

  if (request.method === "PUT") {
    const photo = await repository.upsertMemberPhoto(id, await parsePhotoPayload(request));
    if (!photo) {
      sendJson(response, 404, { error: "Mitglied nicht gefunden." });
      return;
    }
    sendJson(response, 200, { photo });
    return;
  }

  if (request.method === "DELETE") {
    const deleted = await repository.deleteMemberPhoto(id);
    if (!deleted) {
      sendJson(response, 404, { error: "Passbild nicht gefunden." });
      return;
    }
    sendNoContent(response);
    return;
  }

  sendJson(response, 405, { error: "Methode nicht erlaubt." });
};

const sendStaticFile = async (request, response, url) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: "Methode nicht erlaubt." });
    return;
  }

  try {
    const filePath = resolveStaticFilePath(url);
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) {
      sendJson(response, 404, { error: "Datei nicht gefunden." });
      return;
    }

    response.writeHead(200, {
      "Content-Type": staticMimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Content-Length": stat.size
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    fs.createReadStream(filePath).pipe(response);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(response, 404, { error: "Datei nicht gefunden." });
      return;
    }
    if (error.statusCode) {
      sendJson(response, error.statusCode, { error: error.message });
      return;
    }
    throw error;
  }
};

const handleRequest = async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  response.setHeader("Access-Control-Allow-Origin", process.env.MEMBER_API_CORS_ORIGIN || "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type,X-File-Name");

  if (request.method === "OPTIONS") {
    sendNoContent(response);
    return;
  }

  if (url.pathname === "/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }

  if (url.pathname === "/api/session") {
    await handleSession(request, response);
    return;
  }

  if (url.pathname.startsWith("/api/") && !requireAuthentication(request, response)) {
    return;
  }

  if (url.pathname === "/api/members") {
    await handleMembersCollection(request, response, url);
    return;
  }

  if (url.pathname === "/api/users") {
    await handleUsersCollection(request, response);
    return;
  }

  const userMatch = url.pathname.match(userPathPattern);
  if (userMatch) {
    await handleUserResource(request, response, parseId(userMatch[1]));
    return;
  }

  if (url.pathname === "/api/reference-data") {
    await handleReferenceDataOverview(request, response);
    return;
  }

  const referenceResourceMatch = url.pathname.match(referenceResourcePathPattern);
  if (referenceResourceMatch) {
    await handleReferenceDataResource(request, response, referenceResourceMatch[1], parseId(referenceResourceMatch[2]));
    return;
  }

  const referenceCollectionMatch = url.pathname.match(referenceCollectionPathPattern);
  if (referenceCollectionMatch) {
    await handleReferenceDataCollection(request, response, referenceCollectionMatch[1]);
    return;
  }

  const photoMatch = url.pathname.match(memberPhotoPathPattern);
  if (photoMatch) {
    await handleMemberPhoto(request, response, parseId(photoMatch[1]));
    return;
  }

  const memberMatch = url.pathname.match(memberPathPattern);
  if (memberMatch) {
    await handleMemberResource(request, response, parseId(memberMatch[1]));
    return;
  }

  await sendStaticFile(request, response, url);
};

const createServer = () => http.createServer((request, response) => {
  handleRequest(request, response).catch(error => sendError(response, error));
});

const startServer = ({ host = config.server.host, port = config.server.port } = {}) => new Promise((resolve, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(port, host, () => {
    server.off("error", reject);
    console.log(`Mitglieder-API laeuft auf http://${host}:${port}`);
    resolve(server);
  });
});

if (require.main === module) {
  startServer().catch(error => {
    console.error("Mitglieder-API konnte nicht gestartet werden.", error);
    process.exit(1);
  });
}

module.exports = {
  createServer,
  startServer
};

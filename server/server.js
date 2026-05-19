"use strict";

const http = require("node:http");
const config = require("./config");
const repository = require("./member-repository");
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
    fileName: request.headers["x-file-name"] || "passbild.jpg",
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

const handleRequest = async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  response.setHeader("Access-Control-Allow-Origin", process.env.MEMBER_API_CORS_ORIGIN || "http://localhost:3000");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type,X-File-Name");

  if (request.method === "OPTIONS") {
    sendNoContent(response);
    return;
  }

  if (url.pathname === "/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }

  if (url.pathname === "/api/members") {
    await handleMembersCollection(request, response, url);
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

  sendJson(response, 404, { error: "Route nicht gefunden." });
};

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch(error => sendError(response, error));
});

server.listen(config.server.port, config.server.host, () => {
  console.log(`Mitglieder-API laeuft auf http://${config.server.host}:${config.server.port}`);
});

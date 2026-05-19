"use strict";

const readRequestBody = request => new Promise((resolve, reject) => {
  const chunks = [];
  request.on("data", chunk => chunks.push(chunk));
  request.on("end", () => resolve(Buffer.concat(chunks)));
  request.on("error", reject);
});

const readJsonBody = async request => {
  const body = await readRequestBody(request);
  if (body.length === 0) return {};
  try {
    return JSON.parse(body.toString("utf8"));
  } catch (error) {
    error.statusCode = 400;
    error.message = "Ungueltiger JSON-Body.";
    throw error;
  }
};

const send = (response, statusCode, body, headers = {}) => {
  response.writeHead(statusCode, headers);
  response.end(body);
};

const sendJson = (response, statusCode, payload) => {
  send(response, statusCode, JSON.stringify(payload), {
    "Content-Type": "application/json; charset=utf-8"
  });
};

const sendNoContent = response => {
  response.writeHead(204);
  response.end();
};

const sendError = (response, error) => {
  const statusCode = error.statusCode || 500;
  sendJson(response, statusCode, {
    error: statusCode === 500 ? "Interner Serverfehler." : error.message
  });
  if (statusCode === 500) {
    console.error(error);
  }
};

module.exports = {
  readJsonBody,
  readRequestBody,
  send,
  sendError,
  sendJson,
  sendNoContent
};

"use strict";

const crypto = require("node:crypto");

const DEFAULT_OPTIONS = {
  N: 16384,
  r: 8,
  p: 1,
  keyLength: 32
};

const hashPassword = async password => {
  const salt = crypto.randomBytes(16).toString("base64url");
  const key = await new Promise((resolve, reject) => {
    crypto.scrypt(String(password), salt, DEFAULT_OPTIONS.keyLength, DEFAULT_OPTIONS, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
  return [
    "scrypt",
    DEFAULT_OPTIONS.N,
    DEFAULT_OPTIONS.r,
    DEFAULT_OPTIONS.p,
    salt,
    key.toString("base64url")
  ].join("$");
};

const verifyPassword = async (password, passwordHash) => {
  const [algorithm, n, r, p, salt, expected] = String(passwordHash || "").split("$");
  if (algorithm !== "scrypt" || !salt || !expected) return false;

  const options = {
    N: Number(n),
    r: Number(r),
    p: Number(p)
  };
  if (!Number.isFinite(options.N) || !Number.isFinite(options.r) || !Number.isFinite(options.p)) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, "base64url");
  const actualBuffer = await new Promise((resolve, reject) => {
    crypto.scrypt(String(password), salt, expectedBuffer.length, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });

  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
};

module.exports = {
  hashPassword,
  verifyPassword
};

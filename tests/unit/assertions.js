import assert from "node:assert/strict";

export const expect = actual => ({
  toBe: expected => assert.strictEqual(actual, expected),
  toEqual: expected => assert.deepStrictEqual(actual, expected),
  toBeInstanceOf: expected => assert.ok(actual instanceof expected),
  toBeNull: () => assert.strictEqual(actual, null),
  toContain: expected => assert.ok(actual.includes(expected)),
  toMatchObject: expected => Object.entries(expected).forEach(([key, value]) => assert.deepStrictEqual(actual?.[key], value))
});

import { describe, it } from "node:test";
import { expect } from "./assertions.js";

import config from "../../vite.config.js";

describe("Vite-Konfiguration", () => {
  it("räumt gebaute Assets nur bei Produktions-Builds auf", () => {
    const cleanupPlugin = config.plugins.find(plugin => plugin.name === "clean-generated-assets");
    expect(cleanupPlugin).toMatchObject({ apply: "build" });
  });
});

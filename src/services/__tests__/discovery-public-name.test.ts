import { describe, it, expect } from "vitest";
import { resolvePublicName } from "@/services/discovery";

describe("resolvePublicName", () => {
  it("returns config.name for SDK agents (never the vx_agent_ sentinel)", () => {
    const name = resolvePublicName("vx_agent_deadbeef", { name: "My Yield Agent", settings: {} });
    expect(name).toBe("My Yield Agent");
    expect(name).not.toMatch(/^vx_agent_/);
  });

  it("falls back to the DB name for seeded/global agents with no config", () => {
    expect(resolvePublicName("CodeAuditor", null)).toBe("CodeAuditor");
    expect(resolvePublicName("CodeAuditor", undefined)).toBe("CodeAuditor");
  });

  it("falls back to the DB name when config has no name field", () => {
    expect(resolvePublicName("vx_agent_x", { settings: { foo: 1 } })).toBe("vx_agent_x");
  });
});

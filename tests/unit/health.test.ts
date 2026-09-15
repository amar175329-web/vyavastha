import { describe, expect, test } from "bun:test";
import { pingDatabase, getLibsqlClient } from "../../src/db/client";
import { UnimplementedVyavasthaRepository, NotImplementedError } from "../../src/db/repository";
import { GET } from "../../src/app/api/health/route";

describe("Database Client & Health Probe (src/db/client.ts)", () => {
  test("initializes singleton Turso client without error", () => {
    const client = getLibsqlClient();
    expect(client).toBeDefined();
  });

  test("executes real live ping query against vyavastha-db", async () => {
    const result = await pingDatabase();
    expect(result.ok).toBe(true);
    expect(result.database).toBe("vyavastha-db");
    expect(result.latencyMs).toBeGreaterThan(0);
    expect(result.error).toBeUndefined();
  });
});

describe("Health Route Endpoint (src/app/api/health/route.ts)", () => {
  test("returns truthful 200 JSON response with Turso and disk status without leaking credentials", async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.phase).toBe("Phase 6 Foundation");
    expect(body.database.provider).toBe("turso");
    expect(body.database.name).toBe("vyavastha-db");
    expect(body.database.status).toBe("connected");
    expect(body.database.latencyMs).toBeGreaterThan(0);
    expect(body.disk.status).toBe("healthy");
    expect(body.disk.availableMb).toBeGreaterThanOrEqual(500);

    // Verify subsystems truthfully declare deferred state
    expect(body.subsystems.telegramBot).toBe("configured_not_started");
    expect(body.subsystems.geminiPerception).toBe("configured_not_invoked");
    expect(body.subsystems.firecrawlExtractor).toBe("configured_not_invoked");
    expect(body.subsystems.hybridSearch).toBe("not_implemented");

    // Verify no secret leak
    const rawString = JSON.stringify(body);
    expect(rawString).not.toContain("password");
    expect(rawString).not.toContain("token");
  });
});

describe("Repository Abstraction (src/db/repository.ts)", () => {
  test("UnimplementedVyavasthaRepository cleanly rejects operations without fake persistence", async () => {
    const repo = new UnimplementedVyavasthaRepository();

    expect(async () => {
      await repo.createKnowledge({ title: "Test" });
    }).toThrow(NotImplementedError);

    expect(async () => {
      await repo.createMemory({ key: "pref" });
    }).toThrow(NotImplementedError);

    expect(async () => {
      await repo.createTask({ title: "Todo" });
    }).toThrow(NotImplementedError);

    expect(async () => {
      await repo.logActivity({ channel: "system" });
    }).toThrow(NotImplementedError);

    expect(async () => {
      await repo.search({ query: "find something" });
    }).toThrow(NotImplementedError);
  });
});


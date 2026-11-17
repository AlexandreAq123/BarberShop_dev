import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type App } from "../src/infra/http/app.js";
import { testDeps } from "./helpers.js";

/**
 * Validação de entrada do admin: roda antes do handler, então dá para testar sem MySQL
 * (o guard usa o StaffAccess em memória do testDeps).
 */
let app: App;
let deps: ReturnType<typeof testDeps>;
let auth: { authorization: string };
beforeAll(async () => {
  deps = testDeps();
  app = await buildApp(deps);
  const token = await deps.staffTokens.sign({
    staffId: "staff-1",
    shopId: "shop-1",
    role: "OWNER",
    mustChangePassword: false,
  });
  auth = { authorization: `Bearer ${token}` };
});
afterAll(() => app.close());

const STAFF_ID = "0196f3a0-0000-7000-8000-000000000001";

describe("datas inválidas viram 400, nunca 500", () => {
  // Zod 4 roda o .refine do objeto mesmo com um campo inválido: o refine não pode
  // assumir que as datas já viraram Date.
  it.each([
    ["sem fuso", { startsAt: "2026-12-01T10:00:00", endsAt: "2026-12-01T11:00:00" }],
    ["só um lado sem fuso", { startsAt: "2026-12-01T10:00:00Z", endsAt: "amanhã" }],
    ["tipo errado", { startsAt: 123, endsAt: null }],
  ])("POST /blocks %s ⇒ 400", async (_name, range) => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/blocks",
      headers: auth,
      payload: { staffId: STAFF_ID, ...range },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION");
  });

  it.each([
    ["sem fuso", "from=2026-12-01T00:00:00&to=2026-12-02T00:00:00"],
    ["sem to", "from=2026-12-01T00:00:00Z"],
  ])("GET /blocks %s ⇒ 400", async (_name, qs) => {
    const res = await app.inject({ method: "GET", url: `/api/admin/blocks?${qs}`, headers: auth });
    expect(res.statusCode).toBe(400);
  });
});

describe("listas com item inválido viram 400, nunca 500", () => {
  it.each([
    ["PUT", `/api/admin/staff/${STAFF_ID}/services`, { services: [null, { serviceId: 1 }] }],
    ["PUT", `/api/admin/staff/${STAFF_ID}/schedule`, { intervals: [null, { weekday: "x" }] }],
    ["PUT", "/api/admin/shop/hours", { hours: [null, { weekday: 1 }] }],
    ["PATCH", "/api/admin/shop", { slotStepMin: "15" }],
    ["PATCH", `/api/admin/staff/${STAFF_ID}`, {}],
  ] as const)("%s %s ⇒ 400", async (method, url, payload) => {
    const res = await app.inject({ method, url, headers: auth, payload });
    expect(res.statusCode).toBe(400);
  });
});

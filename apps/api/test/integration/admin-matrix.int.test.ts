import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Container } from "../../src/app/container.js";
import type { StaffRole } from "../../src/generated/prisma/client.ts";
import type { App } from "../../src/infra/http/app.js";
import { adminAs, daysFromNow } from "./admin.js";
import { buildTestApp } from "./app.js";
import { createService, createShop, createStaff } from "./factories.js";

/**
 * Matriz de permissão do admin: papel × rota × alvo ⇒ status.
 * Alvos: o próprio ator | outro staff da MESMA loja | staff da OUTRA loja (sempre 404).
 */

type Staff = Awaited<ReturnType<typeof createStaff>>;
type TargetKind = "self" | "other" | "otherShop";
const ROLES: StaffRole[] = ["OWNER", "MANAGER", "BARBER", "FINANCE"];

let fx: {
  actors: Record<StaffRole, Staff>;
  barber2: Staff; // "outro" padrão: BARBER da mesma loja
  manager2: Staff; // "outro" quando o alvo é MANAGER
  foreign: Staff; // staff da outra loja
  service: { id: string };
  foreignService: { id: string };
};

beforeAll(async () => {
  const shop = await createShop();
  const other = await createShop();
  const actors = {} as Record<StaffRole, Staff>;
  for (const role of ROLES) actors[role] = await createStaff(shop.id, { role });
  fx = {
    actors,
    barber2: await createStaff(shop.id, { role: "BARBER" }),
    manager2: await createStaff(shop.id, { role: "MANAGER" }),
    foreign: await createStaff(other.id, { role: "BARBER" }),
    service: await createService(shop.id),
    foreignService: await createService(other.id),
  };
});

let app: App;
let container: Container;
beforeEach(async () => {
  ({ app, container } = await buildTestApp()); // app novo = rate limit zerado
});
afterEach(() => app.close());

/** Status esperado por papel: [próprio, outro, outra loja]. */
type Row = [self: number, other: number, otherShop: number];

interface Spec {
  name: string;
  method: "GET" | "POST" | "PUT" | "PATCH";
  url: (targetId: string) => string;
  body?: (targetId: string) => unknown;
  /** Quem é o "outro" (padrão: barber2). */
  other?: () => Staff;
  expect: Record<StaffRole, Row>;
}

const NOBODY: Row = [403, 403, 404];

const SPECS: Spec[] = [
  {
    name: "GET /staff/:id",
    method: "GET",
    url: (id) => `/staff/${id}`,
    expect: {
      OWNER: [200, 200, 404],
      MANAGER: [200, 200, 404],
      BARBER: [200, 200, 404],
      FINANCE: [200, 200, 404],
    },
  },
  {
    name: "PATCH /staff/:id (nome)",
    method: "PATCH",
    url: (id) => `/staff/${id}`,
    body: () => ({ name: "Nome Novo" }),
    expect: { OWNER: [200, 200, 404], MANAGER: [403, 200, 404], BARBER: NOBODY, FINANCE: NOBODY },
  },
  {
    name: "PATCH /staff/:id (nome) com alvo MANAGER",
    method: "PATCH",
    url: (id) => `/staff/${id}`,
    body: () => ({ name: "Nome Novo" }),
    other: () => fx.manager2,
    expect: { OWNER: [200, 200, 404], MANAGER: [403, 403, 404], BARBER: NOBODY, FINANCE: NOBODY },
  },
  {
    name: "PATCH /staff/:id promovendo a MANAGER",
    method: "PATCH",
    url: (id) => `/staff/${id}`,
    body: () => ({ role: "MANAGER" }),
    // OWNER "próprio": não muda o próprio papel. Alvo "outro" volta a BARBER no fim.
    expect: { OWNER: [403, 200, 404], MANAGER: [403, 403, 404], BARBER: NOBODY, FINANCE: NOBODY },
  },
  {
    name: "POST /staff/:id/password-reset",
    method: "POST",
    url: (id) => `/staff/${id}/password-reset`,
    expect: { OWNER: [403, 200, 404], MANAGER: [403, 200, 404], BARBER: NOBODY, FINANCE: NOBODY },
  },
  {
    name: "POST /staff/:id/password-reset com alvo MANAGER",
    method: "POST",
    url: (id) => `/staff/${id}/password-reset`,
    other: () => fx.manager2,
    expect: { OWNER: [403, 200, 404], MANAGER: [403, 403, 404], BARBER: NOBODY, FINANCE: NOBODY },
  },
  {
    name: "PUT /staff/:id/services",
    method: "PUT",
    url: (id) => `/staff/${id}/services`,
    body: () => ({ services: [{ serviceId: fx.service.id }] }),
    expect: { OWNER: [200, 200, 404], MANAGER: [403, 200, 404], BARBER: NOBODY, FINANCE: NOBODY },
  },
  {
    name: "GET /staff/:id/schedule",
    method: "GET",
    url: (id) => `/staff/${id}/schedule`,
    expect: {
      OWNER: [200, 200, 404],
      MANAGER: [200, 200, 404],
      BARBER: [200, 403, 404],
      FINANCE: NOBODY,
    },
  },
  {
    name: "PUT /staff/:id/schedule",
    method: "PUT",
    url: (id) => `/staff/${id}/schedule`,
    body: () => ({ intervals: [] }),
    expect: {
      OWNER: [200, 200, 404],
      MANAGER: [200, 200, 404],
      BARBER: [200, 403, 404],
      FINANCE: NOBODY,
    },
  },
  {
    name: "POST /blocks",
    method: "POST",
    url: () => "/blocks",
    body: (staffId) => ({ staffId, startsAt: daysFromNow(3, 15), endsAt: daysFromNow(3, 16) }),
    expect: {
      OWNER: [201, 201, 404],
      MANAGER: [201, 201, 404],
      BARBER: [201, 403, 404],
      FINANCE: NOBODY,
    },
  },
];

const cases = SPECS.flatMap((spec) =>
  ROLES.flatMap((role) =>
    (["self", "other", "otherShop"] as TargetKind[]).map((target, i) => ({
      spec,
      role,
      target,
      status: spec.expect[role][i]!,
    })),
  ),
);

describe("matriz de permissão (papel × rota × alvo)", () => {
  it.each(cases)(
    "$role · $spec.name · $target ⇒ $status",
    async ({ spec, role, target, status }) => {
      const actor = fx.actors[role];
      const targetStaff =
        target === "self"
          ? actor
          : target === "other"
            ? (spec.other?.() ?? fx.barber2)
            : fx.foreign;
      const call = await adminAs(app, container, actor);

      const res = await call(spec.method, spec.url(targetStaff.id), spec.body?.(targetStaff.id));
      expect(res.statusCode).toBe(status);

      // Promoção bem-sucedida: desfaz para não contaminar os próximos casos.
      if (spec.name.includes("promovendo") && res.statusCode === 200) {
        await call("PATCH", `/staff/${targetStaff.id}`, { role: "BARBER" });
      }
    },
  );
});

describe("matriz de permissão sem alvo de staff", () => {
  const shopRoutes: [StaffRole, number, number][] = [
    // [papel, PATCH /shop, PATCH /services/:id]
    ["OWNER", 200, 200],
    ["MANAGER", 200, 200],
    ["BARBER", 403, 403],
    ["FINANCE", 403, 403],
  ];

  it.each(shopRoutes)(
    "%s · PATCH /shop ⇒ %i · PATCH /services/:id ⇒ %i",
    async (role, shop, svc) => {
      const call = await adminAs(app, container, fx.actors[role]);
      expect((await call("PATCH", "/shop", { reminderLeadMin: 180 })).statusCode).toBe(shop);
      expect((await call("PATCH", `/services/${fx.service.id}`, { sortOrder: 1 })).statusCode).toBe(
        svc,
      );
      // Serviço de outra loja: 404 para TODOS, inclusive quem não pode editar.
      expect(
        (await call("PATCH", `/services/${fx.foreignService.id}`, { sortOrder: 1 })).statusCode,
      ).toBe(404);
    },
  );

  it.each([
    ["OWNER", "MANAGER", 201],
    ["OWNER", "OWNER", 201],
    ["MANAGER", "BARBER", 201],
    ["MANAGER", "FINANCE", 201],
    ["MANAGER", "MANAGER", 403],
    ["MANAGER", "OWNER", 403],
    ["BARBER", "BARBER", 403],
    ["FINANCE", "BARBER", 403],
  ] as const)("%s cria staff %s ⇒ %i", async (role, newRole, status) => {
    const call = await adminAs(app, container, fx.actors[role]);
    const email = `novo-${role}-${newRole}-${Date.now()}@teste.local`.toLowerCase();
    const res = await call("POST", "/staff", { name: "Novo", email, role: newRole });
    expect(res.statusCode).toBe(status);
  });

  it.each([
    ["OWNER", 200],
    ["MANAGER", 200],
    ["BARBER", 200],
    ["FINANCE", 403],
  ] as const)("%s · GET /blocks ⇒ %i", async (role, status) => {
    const call = await adminAs(app, container, fx.actors[role]);
    const res = await call(
      "GET",
      `/blocks?from=${encodeURIComponent(daysFromNow(0))}&to=${encodeURIComponent(daysFromNow(10))}`,
    );
    expect(res.statusCode).toBe(status);
  });

  it("BARBER não filtra bloqueios de um colega", async () => {
    const call = await adminAs(app, container, fx.actors.BARBER);
    const from = encodeURIComponent(daysFromNow(0));
    const to = encodeURIComponent(daysFromNow(10));
    const res = await call("GET", `/blocks?from=${from}&to=${to}&staffId=${fx.barber2.id}`);
    expect(res.statusCode).toBe(403);
  });

  it("bloqueio da loja inteira: só OWNER e MANAGER", async () => {
    const body = { staffId: null, startsAt: daysFromNow(5, 9), endsAt: daysFromNow(5, 18) };
    for (const [role, status] of [
      ["OWNER", 201],
      ["MANAGER", 201],
      ["BARBER", 403],
      ["FINANCE", 403],
    ] as const) {
      const call = await adminAs(app, container, fx.actors[role]);
      expect((await call("POST", "/blocks", body)).statusCode, role).toBe(status);
    }
  });
});

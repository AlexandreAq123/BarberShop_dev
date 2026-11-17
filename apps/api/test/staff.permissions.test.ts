import { describe, expect, it } from "vitest";
import type { StaffRole } from "../src/generated/prisma/client.ts";
import {
  canAccessStaffAgenda,
  canAssignRole,
  canEditSelf,
  canManageShop,
  canManageStaff,
  canReadBlocks,
  canSeeFullStaff,
} from "../src/modules/staff/staff.permissions.js";

const ROLES: StaffRole[] = ["OWNER", "MANAGER", "BARBER", "FINANCE"];
const actor = (role: StaffRole) => ({ staffId: "me", role });

describe("hierarquia estrita: quem gerencia quem", () => {
  // [ator, alvo, pode?]
  const table: [StaffRole, StaffRole, boolean][] = [
    ["OWNER", "OWNER", true],
    ["OWNER", "MANAGER", true],
    ["OWNER", "BARBER", true],
    ["OWNER", "FINANCE", true],
    ["MANAGER", "OWNER", false],
    ["MANAGER", "MANAGER", false], // reset exporia a senha de outro MANAGER
    ["MANAGER", "BARBER", true],
    ["MANAGER", "FINANCE", true],
    ...ROLES.flatMap((t): [StaffRole, StaffRole, boolean][] => [
      ["BARBER", t, false],
      ["FINANCE", t, false],
    ]),
  ];

  it.each(table)("%s gerencia %s? %s", (a, t, expected) => {
    expect(canManageStaff(actor(a), { id: "outro", role: t })).toBe(expected);
  });

  it.each(table)("%s atribui o papel %s? %s", (a, r, expected) => {
    expect(canAssignRole(actor(a), r)).toBe(expected);
  });

  it.each(ROLES)("%s nunca gerencia a si mesmo pela rota de equipe", (role) => {
    expect(canManageStaff(actor(role), { id: "me", role })).toBe(false);
  });
});

describe("edição do próprio cadastro", () => {
  it("OWNER edita nome, cargo e comissão", () => {
    expect(canEditSelf(actor("OWNER"), ["name", "title", "commissionBps"])).toBe(true);
  });

  it.each([["role"], ["active"]])("OWNER não altera o próprio %s", (field) => {
    expect(canEditSelf(actor("OWNER"), ["name", field])).toBe(false);
  });

  it.each(["MANAGER", "BARBER", "FINANCE"] as const)("%s não edita a si mesmo", (role) => {
    // MANAGER aumentando a própria comissão seria escalada de privilégio.
    expect(canEditSelf(actor(role), ["commissionBps"])).toBe(false);
  });
});

describe("agenda, bloqueios e loja", () => {
  it.each([
    ["OWNER", "outro", true],
    ["MANAGER", "outro", true],
    ["BARBER", "me", true],
    ["BARBER", "outro", false],
    ["FINANCE", "me", false],
    ["FINANCE", "outro", false],
  ] as const)("%s acessa a escala de %s? %s", (role, staffId, expected) => {
    expect(canAccessStaffAgenda(actor(role), staffId)).toBe(expected);
  });

  it.each([
    ["OWNER", true, true],
    ["MANAGER", true, true],
    ["BARBER", false, true],
    ["FINANCE", false, false],
  ] as const)("%s: gerencia loja=%s, lê bloqueios=%s", (role, manage, read) => {
    expect(canManageShop(actor(role))).toBe(manage);
    expect(canReadBlocks(actor(role))).toBe(read);
  });

  it("BARBER vê só o básico dos colegas, mas o próprio completo", () => {
    expect(canSeeFullStaff(actor("BARBER"), "outro")).toBe(false);
    expect(canSeeFullStaff(actor("BARBER"), "me")).toBe(true);
    expect(canSeeFullStaff(actor("FINANCE"), "outro")).toBe(true);
  });
});

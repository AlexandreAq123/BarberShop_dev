import { describe, expect, it } from "vitest";
import { findOverlaps, fitsWithin, isoWithOffset } from "../src/infra/http/fields.js";

const r = (weekday: number, start: number, end: number) => ({ weekday, start, end });

describe("findOverlaps", () => {
  it("faixas que encostam (fim == início) não se sobrepõem", () => {
    expect(findOverlaps([r(1, 540, 720), r(1, 720, 1080)])).toEqual([]);
  });

  it("detecta sobreposição no mesmo dia, em qualquer ordem", () => {
    expect(findOverlaps([r(1, 780, 1080), r(1, 540, 800)])).toHaveLength(1);
  });

  it("mesmo horário em dias diferentes não conflita", () => {
    expect(findOverlaps([r(1, 540, 1080), r(2, 540, 1080)])).toEqual([]);
  });
});

describe("fitsWithin", () => {
  const hours = [r(1, 540, 720), r(1, 780, 1140)]; // turno partido (almoço 12–13h)

  it("cabe em um dos turnos, inclusive encostando nas bordas", () => {
    expect(fitsWithin(r(1, 540, 720), hours)).toBe(true);
    expect(fitsWithin(r(1, 800, 1140), hours)).toBe(true);
  });

  it("atravessar o almoço não cabe", () => {
    expect(fitsWithin(r(1, 700, 800), hours)).toBe(false);
  });

  it("dia sem expediente não comporta nada", () => {
    expect(fitsWithin(r(0, 600, 660), hours)).toBe(false);
  });
});

describe("isoWithOffset", () => {
  it.each(["2026-11-20T14:00:00-03:00", "2026-11-20T17:00:00Z"])("aceita %s", (v) => {
    expect(isoWithOffset.parse(v).toISOString()).toBe("2026-11-20T17:00:00.000Z");
  });

  it.each(["2026-11-20T14:00:00", "2026-11-20", "amanhã"])("rejeita %s (sem fuso)", (v) => {
    expect(isoWithOffset.safeParse(v).success).toBe(false);
  });
});

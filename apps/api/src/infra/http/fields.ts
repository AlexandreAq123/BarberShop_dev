import { z } from "zod";

/** Campos reaproveitados pelos schemas de entrada do admin. */

export const uuidParam = z.object({ id: z.uuid() });

export const weekday = z.number().int().min(0).max(6);

/** Minutos desde 00:00 no fuso da loja (1440 = meia-noite do fim do dia). */
export const minuteOfDay = z.number().int().min(0).max(1440);

/** Data/hora ISO 8601 COM fuso explícito (Z ou ±hh:mm): nunca hora "solta". */
export const isoWithOffset = z.iso
  .datetime({ offset: true, message: "use ISO 8601 com fuso (ex.: 2026-11-20T14:00:00-03:00)" })
  .transform((v) => new Date(v));

/** Faixa [início, fim) em minutos do dia. */
export interface DayRange {
  weekday: number;
  start: number;
  end: number;
}

/** Faixas que se sobrepõem no mesmo dia (encostar, fim == início, é permitido). */
export function findOverlaps<T extends DayRange>(ranges: T[]): [T, T][] {
  const sorted = [...ranges].sort((a, b) => a.weekday - b.weekday || a.start - b.start);
  const overlaps: [T, T][] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;
    if (prev.weekday === curr.weekday && curr.start < prev.end) overlaps.push([prev, curr]);
  }
  return overlaps;
}

/** A faixa cabe inteira em ALGUMA das faixas do mesmo dia? */
export function fitsWithin(range: DayRange, container: DayRange[]): boolean {
  return container.some(
    (c) => c.weekday === range.weekday && c.start <= range.start && range.end <= c.end,
  );
}

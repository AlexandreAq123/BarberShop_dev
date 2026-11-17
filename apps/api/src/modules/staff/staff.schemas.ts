import { z } from "zod";
import { findOverlaps, minuteOfDay, weekday } from "../../infra/http/fields.js";
import { pageOut, pageQuery } from "../../infra/http/pagination.js";

export const staffRole = z.enum(["OWNER", "MANAGER", "BARBER", "FINANCE"]);

// --- Saída: um schema por nível de acesso ---------------------------------------

/** OWNER, MANAGER, FINANCE e o próprio staff. */
export const staffFull = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string().nullable(),
  email: z.string(),
  role: staffRole,
  commissionBps: z.number().int(),
  active: z.boolean(),
  mustChangePassword: z.boolean(),
});

/** BARBER vendo colegas: sem e-mail, comissão ou estado de senha. */
export const staffBasic = z.object({
  id: z.string(),
  name: z.string(),
  role: staffRole,
  active: z.boolean(),
});

export const staffPageOut = z.union([pageOut(staffFull), pageOut(staffBasic)]);
export const staffOut = z.union([staffFull, staffBasic]);

/** Senha temporária: aparece UMA vez, só nesta resposta. */
export const temporaryPasswordOut = z.object({ temporaryPassword: z.string() });
export const staffCreatedOut = z.object({ staff: staffFull, temporaryPassword: z.string() });

// --- Entrada --------------------------------------------------------------------

const name = z.string().trim().min(1).max(80);
const title = z.string().trim().min(1).max(60).nullable();
const commissionBps = z.number().int().min(0).max(10_000);

export const staffListQuery = pageQuery.extend({
  active: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

export const staffCreateBody = z.object({
  name,
  title: title.default(null),
  email: z.email().max(120),
  role: staffRole,
  commissionBps: commissionBps.default(0),
});

export const staffUpdateBody = z
  .object({
    name: name.optional(),
    title: title.optional(),
    role: staffRole.optional(),
    commissionBps: commissionBps.optional(),
    active: z.boolean().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), "informe ao menos um campo");

export const scheduleInterval = z
  .object({ weekday, startMin: minuteOfDay, endMin: minuteOfDay })
  .refine((i) => i.startMin < i.endMin, "startMin precisa ser menor que endMin");

export const scheduleBody = z.object({
  intervals: z
    .array(scheduleInterval)
    .max(28)
    .superRefine((list, ctx) => {
      const ranges = list.map((i) => ({ ...i, start: i.startMin, end: i.endMin }));
      if (findOverlaps(ranges).length > 0) {
        ctx.addIssue({ code: "custom", message: "faixas sobrepostas no mesmo dia" });
      }
    }),
});
export const scheduleOut = z.object({
  intervals: z.array(z.object({ weekday: z.number(), startMin: z.number(), endMin: z.number() })),
});

const serviceLink = z.object({
  serviceId: z.uuid(),
  priceCents: z.number().int().min(0).max(10_000_000).nullable().default(null),
  durationMin: z.number().int().min(5).max(480).nullable().default(null),
});
export const serviceLinksBody = z.object({
  services: z
    .array(serviceLink)
    .max(100)
    .refine(
      (list) => new Set(list.map((l) => l.serviceId)).size === list.length,
      "serviço repetido",
    ),
});
export const serviceLinksOut = z.object({
  services: z.array(
    z.object({
      serviceId: z.string(),
      priceCents: z.number().nullable(),
      durationMin: z.number().nullable(),
    }),
  ),
});

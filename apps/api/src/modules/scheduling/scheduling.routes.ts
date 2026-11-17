import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  findOverlaps,
  isoWithOffset,
  minuteOfDay,
  uuidParam,
  weekday,
} from "../../infra/http/fields.js";
import { pageOut, pageQuery } from "../../infra/http/pagination.js";
import { currentStaff } from "../auth/auth.plugin.js";
import type { BlocksService } from "./blocks.service.js";
import type { ShopSettingsService } from "./shop-settings.service.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const BLOCK_MAX_DAYS = 31;
const BLOCK_LIST_MAX_DAYS = 92;
const SLOT_STEPS = [5, 10, 15, 20, 30, 60] as const;

/**
 * Intervalo [início, fim) válido e de no máximo `maxDays`. O Zod 4 roda o refine do
 * objeto mesmo quando um campo falhou: se alguma data não virou Date, o erro de campo
 * já foi registrado e aqui não há o que checar (sem isso, `.getTime()` numa string ⇒ 500).
 */
const rangeOk = (start: unknown, end: unknown, maxDays: number) =>
  !(start instanceof Date && end instanceof Date) ||
  (start < end && end.getTime() - start.getTime() <= maxDays * DAY_MS);
const TIMEZONES = new Set(Intl.supportedValuesOf("timeZone"));

// --- Loja ---------------------------------------------------------------------------

const shopOut = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  timezone: z.string(),
  slotStepMin: z.number().int(),
  bookingWindowDays: z.number().int(),
  cancelNoticeMin: z.number().int(),
  reminderLeadMin: z.number().int(),
});

const shopUpdateBody = z
  .object({
    name: z.string().trim().min(1).max(100),
    timezone: z.string().refine((tz) => TIMEZONES.has(tz), "fuso horário IANA inválido"),
    slotStepMin: z
      .number()
      .int()
      .refine((n) => (SLOT_STEPS as readonly number[]).includes(n), `use ${SLOT_STEPS.join(", ")}`),
    bookingWindowDays: z.number().int().min(1).max(365),
    cancelNoticeMin: z.number().int().min(0).max(10_080),
    reminderLeadMin: z.number().int().min(0).max(10_080),
  })
  .partial()
  .refine((b) => Object.values(b).some((v) => v !== undefined), "informe ao menos um campo");

const businessHour = z
  .object({ weekday, openMin: minuteOfDay, closeMin: minuteOfDay })
  .refine((h) => h.openMin < h.closeMin, "openMin precisa ser menor que closeMin");

const hoursBody = z.object({
  hours: z
    .array(businessHour)
    .max(21)
    .superRefine((list, ctx) => {
      const ranges = list.map((h) => ({ ...h, start: h.openMin, end: h.closeMin }));
      if (findOverlaps(ranges).length > 0) {
        ctx.addIssue({ code: "custom", message: "faixas sobrepostas no mesmo dia" });
      }
    }),
});
const hoursOut = z.object({
  hours: z.array(z.object({ weekday: z.number(), openMin: z.number(), closeMin: z.number() })),
});

// --- Bloqueios ----------------------------------------------------------------------

const blockOut = z.object({
  id: z.string(),
  staffId: z.string().nullable(),
  startsAt: z.date(),
  endsAt: z.date(),
  reason: z.string().nullable(),
});

const blockCreateBody = z
  .object({
    staffId: z.uuid().nullable(),
    startsAt: isoWithOffset,
    endsAt: isoWithOffset,
    reason: z.string().trim().min(1).max(60).nullable().default(null),
  })
  .refine((b) => rangeOk(b.startsAt, b.endsAt, BLOCK_MAX_DAYS), {
    message: `endsAt precisa ser depois de startsAt, em no máximo ${BLOCK_MAX_DAYS} dias`,
    path: ["endsAt"],
  });

const blockListQuery = pageQuery
  .extend({ from: isoWithOffset, to: isoWithOffset, staffId: z.uuid().optional() })
  .refine((q) => rangeOk(q.from, q.to, BLOCK_LIST_MAX_DAYS), {
    message: `to precisa ser depois de from, em no máximo ${BLOCK_LIST_MAX_DAYS} dias`,
    path: ["to"],
  });

/** `/api/admin/shop` e `/api/admin/blocks`. Permissões finas ficam nos services. */
export function schedulingRoutes(deps: { settings: ShopSettingsService; blocks: BlocksService }) {
  const { settings, blocks } = deps;

  const plugin: FastifyPluginAsyncZod = async (app) => {
    app.get("/shop", { schema: { response: { 200: shopOut } } }, async (request) =>
      settings.get(currentStaff(request)),
    );

    app.patch(
      "/shop",
      { schema: { body: shopUpdateBody, response: { 200: shopOut } } },
      async (request) => settings.update(currentStaff(request), request.body),
    );

    app.get("/shop/hours", { schema: { response: { 200: hoursOut } } }, async (request) =>
      settings.getHours(currentStaff(request)),
    );

    app.put(
      "/shop/hours",
      { schema: { body: hoursBody, response: { 200: hoursOut } } },
      async (request) => settings.replaceHours(currentStaff(request), request.body.hours),
    );

    app.get(
      "/blocks",
      { schema: { querystring: blockListQuery, response: { 200: pageOut(blockOut) } } },
      async (request) => {
        const { from, to, staffId, limit, offset } = request.query;
        return blocks.list(currentStaff(request), { from, to, staffId }, { limit, offset });
      },
    );

    app.post(
      "/blocks",
      { schema: { body: blockCreateBody, response: { 201: blockOut } } },
      async (request, reply) => {
        const created = await blocks.create(currentStaff(request), request.body);
        return reply.code(201).send(created);
      },
    );

    app.delete("/blocks/:id", { schema: { params: uuidParam } }, async (request, reply) => {
      await blocks.remove(currentStaff(request), request.params.id);
      return reply.code(204).send();
    });
  };

  return plugin;
}

import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { uuidParam } from "../../infra/http/fields.js";
import { pageOut, pageQuery } from "../../infra/http/pagination.js";
import { currentStaff } from "../auth/auth.plugin.js";
import type { CatalogService } from "./catalog.service.js";

const serviceOut = z.object({
  id: z.string(),
  name: z.string(),
  priceCents: z.number().int(),
  durationMin: z.number().int(),
  bufferMin: z.number().int(),
  active: z.boolean(),
  sortOrder: z.number().int(),
});

const serviceFields = {
  name: z.string().trim().min(1).max(80),
  priceCents: z.number().int().min(0).max(10_000_000),
  durationMin: z.number().int().min(5).max(480),
  bufferMin: z.number().int().min(0).max(120),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(999),
};

const serviceCreateBody = z.object({
  ...serviceFields,
  bufferMin: serviceFields.bufferMin.default(0),
  active: serviceFields.active.default(true),
  sortOrder: serviceFields.sortOrder.default(0),
});

const serviceUpdateBody = z
  .object(serviceFields)
  .partial()
  .refine((b) => Object.values(b).some((v) => v !== undefined), "informe ao menos um campo");

const listQuery = pageQuery.extend({
  active: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

/** `/api/admin/services`. Todos os papéis leem; só OWNER e MANAGER escrevem (no service). */
export function catalogRoutes(deps: { catalog: CatalogService }) {
  const { catalog } = deps;

  const plugin: FastifyPluginAsyncZod = async (app) => {
    app.get(
      "/",
      { schema: { querystring: listQuery, response: { 200: pageOut(serviceOut) } } },
      async (request) => {
        const { active, ...page } = request.query;
        return catalog.list(currentStaff(request), page, { active });
      },
    );

    app.post(
      "/",
      { schema: { body: serviceCreateBody, response: { 201: serviceOut } } },
      async (request, reply) => {
        const created = await catalog.create(currentStaff(request), request.body);
        return reply.code(201).send(created);
      },
    );

    app.get(
      "/:id",
      { schema: { params: uuidParam, response: { 200: serviceOut } } },
      async (request) => catalog.get(currentStaff(request), request.params.id),
    );

    app.patch(
      "/:id",
      { schema: { params: uuidParam, body: serviceUpdateBody, response: { 200: serviceOut } } },
      async (request) => catalog.update(currentStaff(request), request.params.id, request.body),
    );
  };

  return plugin;
}

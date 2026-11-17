import type { FastifyReply, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { uuidParam } from "../../infra/http/fields.js";
import { currentStaff } from "../auth/auth.plugin.js";
import type { StaffSetupService } from "./staff-setup.service.js";
import {
  scheduleBody,
  scheduleOut,
  serviceLinksBody,
  serviceLinksOut,
  staffCreateBody,
  staffCreatedOut,
  staffFull,
  staffListQuery,
  staffOut,
  staffPageOut,
  staffUpdateBody,
  temporaryPasswordOut,
} from "./staff.schemas.js";
import type { Audit, StaffService } from "./staff.service.js";

/** Evento estruturado no log da requisição (com reqId): só ids, nunca dado pessoal. */
const auditFor =
  (request: FastifyRequest): Audit =>
  (event, fields) =>
    request.log.info({ event, ...fields }, event);

/** Resposta com senha temporária: proxy e navegador não guardam cópia. */
const noStore = (reply: FastifyReply) => reply.header("cache-control", "no-store");

/** `/api/admin/staff`. Permissões finas ficam nos services (staff.permissions.ts). */
export function staffRoutes(deps: { staff: StaffService; setup: StaffSetupService }) {
  const { staff, setup } = deps;

  const plugin: FastifyPluginAsyncZod = async (app) => {
    app.get(
      "/",
      { schema: { querystring: staffListQuery, response: { 200: staffPageOut } } },
      async (request) => {
        const { active, ...page } = request.query;
        return staff.list(currentStaff(request), page, { active });
      },
    );

    app.post(
      "/",
      { schema: { body: staffCreateBody, response: { 201: staffCreatedOut } } },
      async (request, reply) => {
        const result = await staff.create(currentStaff(request), request.body, auditFor(request));
        noStore(reply).code(201);
        return result;
      },
    );

    app.get(
      "/:id",
      { schema: { params: uuidParam, response: { 200: staffOut } } },
      async (request) => staff.get(currentStaff(request), request.params.id),
    );

    app.patch(
      "/:id",
      { schema: { params: uuidParam, body: staffUpdateBody, response: { 200: staffFull } } },
      async (request) =>
        staff.update(currentStaff(request), request.params.id, request.body, auditFor(request)),
    );

    app.post(
      "/:id/password-reset",
      {
        config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
        schema: { params: uuidParam, response: { 200: temporaryPasswordOut } },
      },
      async (request, reply) => {
        const result = await staff.resetPassword(
          currentStaff(request),
          request.params.id,
          auditFor(request),
        );
        noStore(reply);
        return result;
      },
    );

    app.get(
      "/:id/schedule",
      { schema: { params: uuidParam, response: { 200: scheduleOut } } },
      async (request) => setup.getSchedule(currentStaff(request), request.params.id),
    );

    app.put(
      "/:id/schedule",
      { schema: { params: uuidParam, body: scheduleBody, response: { 200: scheduleOut } } },
      async (request) =>
        setup.replaceSchedule(currentStaff(request), request.params.id, request.body.intervals),
    );

    app.get(
      "/:id/services",
      { schema: { params: uuidParam, response: { 200: serviceLinksOut } } },
      async (request) => setup.getServices(currentStaff(request), request.params.id),
    );

    app.put(
      "/:id/services",
      { schema: { params: uuidParam, body: serviceLinksBody, response: { 200: serviceLinksOut } } },
      async (request) =>
        setup.replaceServices(currentStaff(request), request.params.id, request.body.services),
    );
  };

  return plugin;
}

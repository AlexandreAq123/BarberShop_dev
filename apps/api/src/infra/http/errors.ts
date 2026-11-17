import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod";

/**
 * Erros de domínio e o formato ÚNICO de erro da API:
 *   { error: string, code: string, issues?: { path, message }[] }
 *
 * Só a mensagem de um AppError chega ao cliente. Qualquer outro erro vira uma
 * mensagem genérica — nunca stack trace, SQL, nome de constraint ou valor enviado.
 */

export const ERROR_STATUS = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429,
} as const;

export type ErrorKind = keyof typeof ERROR_STATUS;

export interface ErrorIssue {
  path: string;
  message: string;
}

/** Item que impede a operação (ex.: serviço incompatível com o novo passo de slot). */
export type ErrorConflict = Record<string, string | number | null>;

export interface ErrorBody {
  error: string;
  code: string;
  issues?: ErrorIssue[];
  conflicts?: ErrorConflict[];
}

export class AppError extends Error {
  readonly statusCode: number;
  /** Código estável para o front. Padrão = kind; pode ser específico (ex.: SLOT_TAKEN). */
  readonly code: string;
  readonly issues?: ErrorIssue[];
  readonly conflicts?: ErrorConflict[];

  constructor(
    kind: ErrorKind,
    message: string,
    options: { code?: string; issues?: ErrorIssue[]; conflicts?: ErrorConflict[] } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = ERROR_STATUS[kind];
    this.code = options.code ?? kind;
    if (kind === "VALIDATION" && options.issues) this.issues = options.issues;
    if (options.conflicts) this.conflicts = options.conflicts;
  }
}

/** Erros que não são AppError: código e mensagem genéricos por status. */
function genericFor(status: number): ErrorBody {
  switch (status) {
    case 401:
      return { error: "Não autenticado.", code: "UNAUTHORIZED" };
    case 403:
      return { error: "Acesso negado.", code: "FORBIDDEN" };
    case 404:
      return { error: "Não encontrado.", code: "NOT_FOUND" };
    case 413:
      return { error: "Requisição muito grande.", code: "PAYLOAD_TOO_LARGE" };
    case 429:
      return { error: "Muitas requisições. Tente novamente em instantes.", code: "RATE_LIMITED" };
    default:
      return status < 500
        ? { error: "Requisição inválida.", code: "BAD_REQUEST" }
        : { error: "Erro interno.", code: "INTERNAL" };
  }
}

/** "/client/name" + contexto "body" ⇒ "body.client.name". Nunca inclui o valor. */
function issuePath(context: string | undefined, instancePath: string): string {
  const parts = instancePath.split("/").filter(Boolean);
  return [context, ...parts].filter(Boolean).join(".");
}

export function errorHandler(
  error: FastifyError | AppError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof AppError) {
    const body: ErrorBody = { error: error.message, code: error.code };
    if (error.issues) body.issues = error.issues;
    if (error.conflicts) body.conflicts = error.conflicts;
    return reply.code(error.statusCode).send(body);
  }

  if (hasZodFastifySchemaValidationErrors(error)) {
    const context = (error as FastifyError).validationContext;
    const body: ErrorBody = {
      error: "Dados inválidos.",
      code: "VALIDATION",
      issues: error.validation.map((v) => ({
        path: issuePath(context, v.instancePath),
        message: v.message ?? "inválido",
      })),
    };
    return reply.code(400).send(body);
  }

  const raw = (error as FastifyError).statusCode;
  const status = raw && raw >= 400 && raw < 600 ? raw : 500;
  // Inclui resposta fora do schema (ResponseSerializationError): é bug nosso, vira 500.
  if (status >= 500) request.log.error({ err: error }, "erro não tratado");
  return reply.code(status).send(genericFor(status));
}

export function notFoundHandler(_request: FastifyRequest, reply: FastifyReply) {
  return reply.code(404).send(genericFor(404));
}

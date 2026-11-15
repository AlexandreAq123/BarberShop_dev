import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { buildApp, type App } from "../src/infra/http/app.js";
import { AppError } from "../src/infra/http/errors.js";
import { testEnv } from "./helpers.js";

let app: App | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function appWith(register: (app: App) => void) {
  app = await buildApp({ env: testEnv(), health: { ping: async () => {} } });
  register(app);
  return app;
}

describe("AppError", () => {
  it.each([
    ["NOT_FOUND", 404],
    ["CONFLICT", 409],
    ["FORBIDDEN", 403],
    ["UNAUTHORIZED", 401],
    ["VALIDATION", 400],
    ["UNPROCESSABLE", 422],
  ] as const)("%s ⇒ %i no formato padrão", async (kind, status) => {
    const a = await appWith((a) =>
      a.get("/boom", async () => {
        throw new AppError(kind, "Mensagem de domínio.");
      }),
    );
    const res = await a.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(status);
    expect(res.json()).toEqual({ error: "Mensagem de domínio.", code: kind });
  });

  it("aceita código específico (ex.: SLOT_TAKEN)", async () => {
    const a = await appWith((a) =>
      a.get("/boom", async () => {
        throw new AppError("CONFLICT", "Horário indisponível.", { code: "SLOT_TAKEN" });
      }),
    );
    const res = await a.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "Horário indisponível.", code: "SLOT_TAKEN" });
  });

  it("issues só saem em erro de validação", async () => {
    const a = await appWith((a) =>
      a.get("/boom", async () => {
        throw new AppError("CONFLICT", "x", { issues: [{ path: "a", message: "b" }] });
      }),
    );
    const res = await a.inject({ method: "GET", url: "/boom" });
    expect(res.json()).not.toHaveProperty("issues");
  });
});

describe("erros inesperados", () => {
  it("viram 500 genérico sem vazar mensagem interna", async () => {
    const a = await appWith((a) =>
      a.get("/boom", async () => {
        throw new Error("Unique constraint failed on staff_shopId_email_key senha=segredo");
      }),
    );
    const res = await a.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "Erro interno.", code: "INTERNAL" });
    expect(res.body).not.toContain("segredo");
  });

  it("JSON malformado ⇒ 400 BAD_REQUEST", async () => {
    const a = await appWith((a) => a.post("/eco", async () => ({ ok: true })));
    const res = await a.inject({
      method: "POST",
      url: "/eco",
      headers: { "content-type": "application/json" },
      payload: "{ nao é json",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "Requisição inválida.", code: "BAD_REQUEST" });
  });
});

describe("validação Zod", () => {
  const register = (a: App) =>
    a.post(
      "/clientes/:id",
      {
        schema: {
          params: z.object({ id: z.uuid() }),
          querystring: z.object({ dry: z.enum(["sim", "nao"]).optional() }),
          body: z.object({
            client: z.object({ name: z.string().min(2), phone: z.string().min(10) }),
          }),
        },
      },
      async (request) => ({ name: request.body.client.name }),
    );

  it("aceita entrada válida e entrega dados tipados", async () => {
    const a = await appWith(register);
    const res = await a.inject({
      method: "POST",
      url: "/clientes/0192f1a0-0000-7000-8000-000000000000",
      payload: { client: { name: "Ana", phone: "11999998888" } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ name: "Ana" });
  });

  it("devolve issues com caminho e mensagem, SEM o valor enviado", async () => {
    const a = await appWith(register);
    const res = await a.inject({
      method: "POST",
      url: "/clientes/0192f1a0-0000-7000-8000-000000000000",
      payload: { client: { name: "Ana", phone: "segredo" } }, // < 10 caracteres
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe("VALIDATION");
    expect(body.issues).toEqual([{ path: "body.client.phone", message: expect.any(String) }]);
    expect(res.body).not.toContain("segredo");
  });

  it("valida params e querystring", async () => {
    const a = await appWith(register);
    const params = await a.inject({
      method: "POST",
      url: "/clientes/nao-e-uuid",
      payload: { client: { name: "Ana", phone: "11999998888" } },
    });
    expect(params.statusCode).toBe(400);
    expect(params.json().issues[0].path).toBe("params.id");

    const query = await a.inject({
      method: "POST",
      url: "/clientes/0192f1a0-0000-7000-8000-000000000000?dry=talvez",
      payload: { client: { name: "Ana", phone: "11999998888" } },
    });
    expect(query.statusCode).toBe(400);
    expect(query.json().issues[0].path).toBe("querystring.dry");
    expect(query.body).not.toContain("talvez");
  });
});

describe("serialização de resposta", () => {
  it("remove campos fora do schema (ex.: passwordHash)", async () => {
    const a = await appWith((a) =>
      a.get(
        "/staff",
        { schema: { response: { 200: z.object({ id: z.string(), name: z.string() }) } } },
        // Simula um handler que, por engano, devolve a linha inteira do banco.
        async () => ({ id: "s1", name: "João", passwordHash: "$argon2id$segredo" }) as never,
      ),
    );
    const res = await a.inject({ method: "GET", url: "/staff" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: "s1", name: "João" });
    expect(res.body).not.toContain("argon2");
  });

  it("resposta que viola o schema ⇒ 500 genérico", async () => {
    const a = await appWith((a) =>
      a.get(
        "/staff",
        { schema: { response: { 200: z.object({ id: z.string() }) } } },
        async () => ({ id: 123 }) as never,
      ),
    );
    const res = await a.inject({ method: "GET", url: "/staff" });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "Erro interno.", code: "INTERNAL" });
  });
});

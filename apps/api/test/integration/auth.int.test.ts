import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Container } from "../../src/app/container.js";
import type { App } from "../../src/infra/http/app.js";
import { REFRESH_COOKIE } from "../../src/modules/auth/auth.routes.js";
import { buildTestApp } from "./app.js";
import { testDb } from "./db.js";
import { createShop, createStaff } from "./factories.js";

const PASSWORD = "senha-forte-123";
const FETCH = { "x-requested-with": "fetch" };

let app: App;
let container: Container;
beforeEach(async () => {
  ({ app, container } = await buildTestApp()); // app novo = rate limit zerado
});
afterEach(() => app.close());

async function setup(staffData: Parameters<typeof createStaff>[1] = {}) {
  const shop = await createShop();
  const staff = await createStaff(shop.id, { password: PASSWORD, role: "OWNER", ...staffData });
  return { shop, staff };
}

function login(
  body: { shopSlug: string; email: string; password: string },
  remoteAddress = "127.0.0.1",
) {
  return app.inject({ method: "POST", url: "/api/admin/auth/login", payload: body, remoteAddress });
}

function refreshCookie(res: { cookies: { name: string; value: string }[] }) {
  return res.cookies.find((c) => c.name === REFRESH_COOKIE)?.value;
}

function refresh(token: string | undefined) {
  return app.inject({
    method: "POST",
    url: "/api/admin/auth/refresh",
    headers: FETCH,
    cookies: token ? { [REFRESH_COOKIE]: token } : {},
  });
}

function me(accessToken: string) {
  return app.inject({
    method: "GET",
    url: "/api/admin/auth/me",
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

describe("login", () => {
  it("credenciais corretas ⇒ access token + cookie de refresh seguro", async () => {
    const { shop, staff } = await setup();
    const res = await login({ shopSlug: shop.slug, email: staff.email, password: PASSWORD });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.staff).toEqual({
      id: staff.id,
      name: staff.name,
      role: "OWNER",
      mustChangePassword: false,
    });
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|argon2|email/);

    const cookie = res.cookies.find((c) => c.name === REFRESH_COOKIE);
    expect(cookie).toMatchObject({
      httpOnly: true,
      sameSite: "Strict",
      path: "/api/admin/auth",
    });
    expect(await testDb().staffSession.count({ where: { staffId: staff.id } })).toBe(1);
    // Só o hash do refresh token vai para o banco.
    expect(await testDb().staffSession.count({ where: { tokenHash: cookie?.value ?? "" } })).toBe(
      0,
    );

    const profile = await me(body.accessToken);
    expect(profile.statusCode).toBe(200);
    expect(profile.json().id).toBe(staff.id);
  });

  it("e-mail não diferencia maiúsculas nem espaços", async () => {
    const { shop, staff } = await setup();
    const res = await login({
      shopSlug: shop.slug,
      email: `  ${staff.email.toUpperCase()} `,
      password: PASSWORD,
    });
    expect(res.statusCode).toBe(200);
  });

  it("toda falha devolve a MESMA resposta (sem enumeração de e-mail)", async () => {
    const { shop, staff } = await setup();
    const inactive = await createStaff(shop.id, { password: PASSWORD, active: false });
    const closedShop = await createShop({ active: false });
    const inClosed = await createStaff(closedShop.id, { password: PASSWORD });

    const attempts = [
      { shopSlug: shop.slug, email: staff.email, password: "senha-errada-123" },
      { shopSlug: shop.slug, email: "ninguem@teste.local", password: PASSWORD },
      { shopSlug: shop.slug, email: inactive.email, password: PASSWORD },
      { shopSlug: "loja-que-nao-existe", email: staff.email, password: PASSWORD },
      { shopSlug: closedShop.slug, email: inClosed.email, password: PASSWORD },
    ];
    const bodies = new Set<string>();
    for (const [i, attempt] of attempts.entries()) {
      const res = await login(attempt, `10.0.0.${i + 1}`);
      expect(res.statusCode).toBe(401);
      expect(res.cookies).toHaveLength(0);
      bodies.add(res.body);
    }
    expect([...bodies]).toEqual([
      JSON.stringify({ error: "E-mail ou senha inválidos.", code: "UNAUTHORIZED" }),
    ]);
  });

  it("staff de uma loja não entra pelo slug de outra", async () => {
    const { staff } = await setup();
    const other = await createShop();
    const res = await login({ shopSlug: other.slug, email: staff.email, password: PASSWORD });
    expect(res.statusCode).toBe(401);
  });
});

describe("rate limit do login", () => {
  it("5 por minuto por IP", async () => {
    const { shop } = await setup();
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      // e-mails diferentes: isola o limite por IP do limite por conta
      const res = await login({ shopSlug: shop.slug, email: `x${i}@teste.local`, password: "x" });
      codes.push(res.statusCode);
    }
    expect(codes).toEqual([401, 401, 401, 401, 401, 429]);
  });

  it("5 a cada 15 min por loja+e-mail, mesmo trocando de IP", async () => {
    const { shop, staff } = await setup();
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await login(
        { shopSlug: shop.slug, email: staff.email, password: "errada-errada" },
        `10.1.0.${i + 1}`,
      );
      codes.push(res.statusCode);
    }
    expect(codes).toEqual([401, 401, 401, 401, 401, 429]);

    // Bloqueado inclusive com a senha certa — e outra conta segue livre.
    const blocked = await login(
      { shopSlug: shop.slug, email: staff.email, password: PASSWORD },
      "10.1.0.99",
    );
    expect(blocked.statusCode).toBe(429);
    const other = await createStaff(shop.id, { password: PASSWORD });
    const ok = await login(
      { shopSlug: shop.slug, email: other.email, password: PASSWORD },
      "10.1.1.1",
    );
    expect(ok.statusCode).toBe(200);
  });
});

describe("refresh", () => {
  async function loggedIn(staffData: Parameters<typeof createStaff>[1] = {}) {
    const ctx = await setup(staffData);
    const res = await login({
      shopSlug: ctx.shop.slug,
      email: ctx.staff.email,
      password: PASSWORD,
    });
    return { ...ctx, accessToken: res.json().accessToken as string, rt: refreshCookie(res)! };
  }

  it("rotaciona: novo refresh token, antigo revogado", async () => {
    const { staff, rt } = await loggedIn();
    const res = await refresh(rt);
    expect(res.statusCode).toBe(200);
    const next = refreshCookie(res);
    expect(next).toBeTruthy();
    expect(next).not.toBe(rt);
    expect(await me(res.json().accessToken).then((r) => r.statusCode)).toBe(200);

    const sessions = await testDb().staffSession.findMany({ where: { staffId: staff.id } });
    expect(sessions.filter((s) => s.revokedAt === null)).toHaveLength(1);

    expect((await refresh(next)).statusCode).toBe(200);
  });

  it("REUSO de token revogado derruba todas as sessões do staff", async () => {
    const { staff, rt } = await loggedIn();
    const rotated = refreshCookie(await refresh(rt));

    const reuse = await refresh(rt); // atacante com o token antigo
    expect(reuse.statusCode).toBe(401);
    expect(reuse.json().code).toBe("SESSION_REVOKED");

    // O token legítimo mais novo também caiu.
    expect((await refresh(rotated)).statusCode).toBe(401);
    expect(
      await testDb().staffSession.count({ where: { staffId: staff.id, revokedAt: null } }),
    ).toBe(0);
  });

  it("sem cookie ou com token desconhecido ⇒ 401", async () => {
    expect((await refresh(undefined)).statusCode).toBe(401);
    expect((await refresh("token-inventado")).statusCode).toBe(401);
  });

  it("staff desativado não renova a sessão", async () => {
    const { staff, rt } = await loggedIn();
    await testDb().staff.update({ where: { id: staff.id }, data: { active: false } });
    expect((await refresh(rt)).statusCode).toBe(401);
  });

  it("sessão expirada não renova", async () => {
    const { staff, rt } = await loggedIn();
    await testDb().staffSession.updateMany({
      where: { staffId: staff.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await refresh(rt)).statusCode).toBe(401);
  });

  it("papel novo vale a partir do próximo refresh", async () => {
    const { staff, rt } = await loggedIn();
    await testDb().staff.update({ where: { id: staff.id }, data: { role: "FINANCE" } });
    expect((await refresh(rt)).json().staff.role).toBe("FINANCE");
  });
});

describe("logout", () => {
  it("revoga a sessão atual e limpa o cookie", async () => {
    const { shop, staff } = await setup();
    const rt = refreshCookie(
      await login({ shopSlug: shop.slug, email: staff.email, password: PASSWORD }),
    );
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/auth/logout",
      headers: FETCH,
      cookies: { [REFRESH_COOKIE]: rt! },
    });
    expect(res.statusCode).toBe(204);
    const cleared = res.cookies.find((c) => c.name === REFRESH_COOKIE);
    expect(cleared?.value).toBe("");
    expect((await refresh(rt)).statusCode).toBe(401);
  });
});

describe("isolamento entre lojas", () => {
  it("token assinado com shopId de outra loja não acessa nada", async () => {
    const { staff } = await setup();
    const other = await createShop();
    // Segredo correto, só o tenant trocado: simula um bug ou token adulterado.
    const forged = await container.staffTokens.sign({
      staffId: staff.id,
      shopId: other.id,
      role: "OWNER",
      mustChangePassword: false,
    });
    expect((await me(forged)).statusCode).toBe(401);
  });
});

describe("troca de senha", () => {
  function changePassword(accessToken: string, body: object, rt?: string) {
    return app.inject({
      method: "POST",
      url: "/api/admin/auth/password",
      headers: { authorization: `Bearer ${accessToken}` },
      cookies: rt ? { [REFRESH_COOKIE]: rt } : {},
      payload: body,
    });
  }

  it("mustChangePassword: só a troca de senha passa; depois libera tudo", async () => {
    const { shop, staff } = await setup({ mustChangePassword: true });
    const res = await login({ shopSlug: shop.slug, email: staff.email, password: PASSWORD });
    expect(res.statusCode).toBe(200);
    expect(res.json().staff.mustChangePassword).toBe(true);
    const { accessToken } = res.json();

    expect((await me(accessToken)).statusCode).toBe(403);

    const changed = await changePassword(accessToken, {
      currentPassword: PASSWORD,
      newPassword: "nova-senha-segura-456",
    });
    expect(changed.statusCode).toBe(200);
    expect((await me(changed.json().accessToken)).statusCode).toBe(200);

    const row = await testDb().staff.findUniqueOrThrow({ where: { id: staff.id } });
    expect(row.mustChangePassword).toBe(false);

    // Senha antiga não entra mais; a nova entra.
    expect(
      (await login({ shopSlug: shop.slug, email: staff.email, password: PASSWORD })).statusCode,
    ).toBe(401);
    expect(
      (await login({ shopSlug: shop.slug, email: staff.email, password: "nova-senha-segura-456" }))
        .statusCode,
    ).toBe(200);
  });

  it("exige a senha atual correta", async () => {
    const { shop, staff } = await setup();
    const { accessToken } = (
      await login({ shopSlug: shop.slug, email: staff.email, password: PASSWORD })
    ).json();
    const res = await changePassword(accessToken, {
      currentPassword: "errada-errada",
      newPassword: "nova-senha-segura-456",
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("INVALID_CURRENT_PASSWORD");
  });

  it("revoga as OUTRAS sessões e mantém a atual", async () => {
    const { shop, staff } = await setup();
    const creds = { shopSlug: shop.slug, email: staff.email, password: PASSWORD };
    const other = refreshCookie(await login(creds, "10.2.0.1")); // outro dispositivo
    const current = await login(creds, "10.2.0.2");

    const res = await changePassword(
      current.json().accessToken,
      { currentPassword: PASSWORD, newPassword: "nova-senha-segura-456" },
      refreshCookie(current),
    );
    expect(res.statusCode).toBe(200);
    expect((await refresh(other)).statusCode).toBe(401);
    expect((await refresh(refreshCookie(current))).statusCode).toBe(200);
  });
});

describe("estado do staff relido a cada requisição", () => {
  it("desativado: o access token atual para de valer na hora", async () => {
    const { shop, staff } = await setup();
    const { accessToken } = (
      await login({ shopSlug: shop.slug, email: staff.email, password: PASSWORD })
    ).json();
    expect((await me(accessToken)).statusCode).toBe(200);

    await testDb().staff.update({ where: { id: staff.id }, data: { active: false } });
    expect((await me(accessToken)).statusCode).toBe(401);
  });

  it("mustChangePassword ligado no banco bloqueia o token já emitido", async () => {
    const { shop, staff } = await setup();
    const { accessToken } = (
      await login({ shopSlug: shop.slug, email: staff.email, password: PASSWORD })
    ).json();
    await testDb().staff.update({ where: { id: staff.id }, data: { mustChangePassword: true } });
    const res = await me(accessToken);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("PASSWORD_CHANGE_REQUIRED");
  });
});

describe("sessão encerrada não é tratada como roubo", () => {
  it("refresh com token de logout dá 401 sem derrubar a outra sessão", async () => {
    const { shop, staff } = await setup();
    const creds = { shopSlug: shop.slug, email: staff.email, password: PASSWORD };
    const a = refreshCookie(await login(creds, "10.3.0.1"));
    const b = refreshCookie(await login(creds, "10.3.0.2"));

    await app.inject({
      method: "POST",
      url: "/api/admin/auth/logout",
      headers: FETCH,
      cookies: { [REFRESH_COOKIE]: a! },
    });
    const replay = await refresh(a);
    expect(replay.statusCode).toBe(401);
    expect(replay.json().code).not.toBe("SESSION_REVOKED");
    expect((await refresh(b)).statusCode).toBe(200);
  });
});

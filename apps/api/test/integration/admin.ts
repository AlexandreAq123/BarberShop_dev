import type { Container } from "../../src/app/container.js";
import type { App } from "../../src/infra/http/app.js";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface StaffLike {
  id: string;
  shopId: string;
  role: "OWNER" | "MANAGER" | "BARBER" | "FINANCE";
}

/**
 * Cliente do /api/admin autenticado como `staff`. O token é assinado direto pelo
 * container (sem passar pelo login): o guard confere o staff no banco do mesmo jeito.
 */
export async function adminAs(app: App, container: Container, staff: StaffLike) {
  const token = await container.staffTokens.sign({
    staffId: staff.id,
    shopId: staff.shopId,
    role: staff.role,
    mustChangePassword: false,
  });
  return (method: Method, url: string, payload?: unknown) =>
    app.inject({
      method,
      url: `/api/admin${url}`,
      headers: { authorization: `Bearer ${token}` },
      ...(payload !== undefined && { payload: payload as object }),
    });
}

/** Instante ISO com fuso, N dias a partir de agora (bloqueios). */
export const daysFromNow = (days: number, hour = 12) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

import { Writable } from "node:stream";
import { pino } from "pino";
import { describe, expect, it } from "vitest";
import { buildLoggerOptions } from "../src/infra/logger.js";

/** Logger real com as opções da API, escrevendo numa string. */
function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, done) {
      lines.push(String(chunk));
      done();
    },
  });
  // NODE_ENV=production: sem transport (pino-pretty), escreve JSON direto no stream.
  const options = buildLoggerOptions({ LOG_LEVEL: "info", NODE_ENV: "production" });
  return { log: pino(options, stream), output: () => lines.join("") };
}

describe("redação do log", () => {
  it.each([
    ["no topo", { temporaryPassword: "SENHA-TEMP-123" }],
    ["aninhada", { res: { temporaryPassword: "SENHA-TEMP-123" } }],
    ["senha no topo", { password: "SENHA-TEMP-123" }],
  ])("senha %s nunca sai", (_name, payload) => {
    const { log, output } = capture();
    log.info(payload, "evento");
    expect(output()).not.toContain("SENHA-TEMP-123");
    expect(output()).toContain("[redacted]");
  });

  it("evento de auditoria sai com ids (sem dado pessoal para redigir)", () => {
    const { log, output } = capture();
    const ids = { actorId: "a-1", targetId: "t-1", shopId: "s-1" };
    log.info({ event: "staff.password_reset", ...ids }, "staff.password_reset");
    const line = JSON.parse(output());
    expect(line).toMatchObject({ event: "staff.password_reset", ...ids });
  });
});

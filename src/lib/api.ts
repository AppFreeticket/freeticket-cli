import { client } from "../client/client.gen";
import { loadConfig } from "./config";

/**
 * Configura el cliente generado con la base URL + headers de auth.
 * Llamar una vez al inicio de cada comando, con el override opcional de workspace.
 */
export function configureClient(workspaceOverride?: string): void {
  const cfg = loadConfig();
  if (!cfg.apiKey) {
    fail(
      "No hay API key configurada. Ejecuta `ft login` o exporta FT_API_KEY.",
    );
  }
  const workspaceId = workspaceOverride ?? cfg.workspaceId;
  client.setConfig({
    baseUrl: `${cfg.apiUrl.replace(/\/$/, "")}/api/v1`,
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      ...(workspaceId ? { "X-Workspace-Id": workspaceId } : {}),
    },
  });
}

type ApiError = {
  code?: string;
  message?: string;
  details?: { path?: string; message?: string }[];
};

/**
 * Desempaqueta la respuesta del cliente generado: devuelve `data` o aborta
 * con un mensaje legible a partir del envelope `{ error: { code, message } }`.
 */
export function unwrap<T>(res: {
  data?: T;
  error?: unknown;
  response: Response;
}): T {
  if (res.data !== undefined) return res.data;
  const status = res.response?.status;
  const err = (res.error as { error?: ApiError })?.error;
  if (err) {
    const lines = [
      `Error ${status ?? ""} [${err.code ?? "?"}]: ${err.message ?? "fallo desconocido"}`.trim(),
    ];
    for (const d of err.details ?? [])
      lines.push(`  · ${d.path ?? ""}: ${d.message ?? ""}`.trimEnd());
    fail(lines.join("\n"), hintFor(status));
  }
  fail(`La API respondió ${status ?? "un error"} sin cuerpo interpretable.`);
}

function hintFor(status?: number): string | undefined {
  switch (status) {
    case 401:
      return "API key inválida, revocada o expirada. Ejecuta `ft login`.";
    case 403:
      return "Tu rol o tu workspace no permiten esta acción.";
    case 404:
      return "El recurso no existe o pertenece a otro workspace.";
    case 501:
      return "Operación de escritura: disponible en la fase 2 del CLI.";
  }
}

/** Imprime el error en rojo (+ hint opcional) y termina con código 1. */
export function fail(message: string, hint?: string): never {
  console.error(message);
  if (hint) console.error(`\n${hint}`);
  process.exit(1);
}

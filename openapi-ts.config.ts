import { defineConfig } from "@hey-api/openapi-ts";

// Genera el cliente B2B v1 desde el contrato commiteado.
// src/client/ es generado — nunca se edita a mano (ver .gitignore).
// El cliente admin se genera aparte (openapi-ts.admin.config.ts), con su
// propio `client` singleton, para que la auth admin no se mezcle con la B2B.
export default defineConfig({
  input: "openapi.json",
  output: "src/client",
  plugins: ["@hey-api/client-fetch"],
});

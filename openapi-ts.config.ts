import { defineConfig } from "@hey-api/openapi-ts";

// Genera el cliente tipado desde el contrato commiteado.
// src/client/ es generado — nunca se edita a mano (ver .gitignore).
export default defineConfig({
  input: "openapi.json",
  output: "src/client",
  plugins: ["@hey-api/client-fetch"],
});

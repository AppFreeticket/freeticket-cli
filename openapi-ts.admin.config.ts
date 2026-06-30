import { defineConfig } from "@hey-api/openapi-ts";

// Cliente del contrato superadmin (/api/admin). Generado — nunca a mano.
// Output separado del B2B: su propio `client` singleton => auth independiente
// (sesión SUPER_ADMIN, no API key). Ver src/lib/api.ts > configureAdminClient.
export default defineConfig({
  input: "admin-openapi.json",
  output: "src/admin-client",
  plugins: ["@hey-api/client-fetch"],
});

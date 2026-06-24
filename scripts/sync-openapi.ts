// Descarga el contrato OpenAPI del backend y regenera el cliente.
//   FT_OPENAPI_URL=https://admin.appfreeticket.com/api/v1/openapi.json pnpm sync-openapi
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const url =
  process.env.FT_OPENAPI_URL ??
  "http://admin.localhost:3000/api/v1/openapi.json";

const res = await fetch(url);
if (!res.ok) {
  console.error(`No se pudo bajar el spec (${res.status}) de ${url}`);
  process.exit(1);
}
const spec = await res.json();
writeFileSync("openapi.json", `${JSON.stringify(spec, null, 2)}\n`);
console.log(`✓ openapi.json actualizado desde ${url}`);

execSync("pnpm generate", { stdio: "inherit" });
console.log("✓ cliente regenerado en src/client/");

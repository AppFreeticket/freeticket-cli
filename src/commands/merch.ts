import {
  closeSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { Command } from "commander";
import {
  getMerchProducts,
  patchMerchProductsIdStatus,
  postMerchProducts,
  postMerchProductsImagesUploadUrl,
  putMerchProductsIdImages,
} from "../client/sdk.gen";
import type {
  MerchAdminProduct,
  MerchImageUploadRequest,
  MerchProductCreate,
} from "../client/types.gen";
import { configureClient, describeError, fail, unwrap } from "../lib/api";
import { print } from "../lib/output";

// `ft merch products ...` — the merch store catalog of the key's organization
// (contract 1.38). Products are always born DRAFT; photos only enter through
// the signed upload (the backend never downloads a URL), so `create` uploads
// each local file and then sets the ordered list.

/** Same limits as the backend (`POST /merch/products/images/upload-url`). */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_IMAGES = 10;

const LIST_COLUMNS = ["id", "name", "status", "variants", "stock", "price"];

/** One product as the CLI describes it (flags or one entry of --from-json). */
export interface MerchProductSpec {
  name: string;
  description?: string | null;
  /** COP, integer, VAT included. Same for every size. */
  price: number;
  /** Strikethrough price (must be greater than `price`). */
  compareAtPrice?: number | null;
  /** Size values in order. Empty/absent: a single variant without options. */
  sizes?: string[];
  /** Name of the size option (default `Talla`). */
  optionName?: string;
  /** Units per variant: one number for all, or per size (`{ "M": 4 }`). */
  stock?: number | Record<string, number>;
  /** SKU prefix; each size appends `-<SIZE>`. Default: derived from the name. */
  sku?: string;
  maxPerOrder?: number;
  slug?: string;
  /** Local image paths, in order (the first is the cover). */
  images?: string[];
  /** Publish right after creating (default false: stays DRAFT). */
  publish?: boolean;
}

/** Same derivation as the dashboard (`skuBaseFrom`): "Camiseta Tour" → "CAMISETA-TOUR". */
export function skuPart(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase();
}

export function skuBaseFrom(name: string): string {
  return skuPart(name).slice(0, 40).replace(/-+$/, "") || "SKU";
}

function stockFor(spec: MerchProductSpec, size?: string): number {
  const { stock } = spec;
  if (stock === undefined) return 0;
  if (typeof stock === "number") return stock;
  if (size === undefined) {
    throw new Error(
      `"${spec.name}": stock per size needs "sizes"; use a number instead.`,
    );
  }
  return stock[size] ?? 0;
}

/**
 * Body of `POST /merch/products`: one option with the sizes and the full
 * variant matrix (one variant per size), or a single variant without options.
 * Throws on input the backend would reject anyway, with a clearer message.
 */
export function buildProductBody(spec: MerchProductSpec): MerchProductCreate {
  if (!spec.name?.trim()) throw new Error("A product needs a name.");
  if (!Number.isInteger(spec.price) || spec.price < 0) {
    throw new Error(`"${spec.name}": price must be an integer in COP.`);
  }
  const sizes = (spec.sizes ?? []).map((s) => s.trim()).filter(Boolean);
  const upper = sizes.map((s) => s.toLocaleUpperCase("es"));
  if (new Set(upper).size !== upper.length) {
    throw new Error(`"${spec.name}": repeated size.`);
  }
  if (spec.stock && typeof spec.stock === "object") {
    const unknown = Object.keys(spec.stock).filter((k) => !sizes.includes(k));
    if (unknown.length > 0) {
      throw new Error(
        `"${spec.name}": stock for unknown size(s): ${unknown.join(", ")}.`,
      );
    }
  }
  const base = spec.sku ? spec.sku.trim() : skuBaseFrom(spec.name);
  const optionName = spec.optionName?.trim() || "Talla";
  const variant = (sku: string, stock: number, attributes = {}) => ({
    attributes,
    sku,
    price: spec.price,
    compareAtPrice: spec.compareAtPrice ?? null,
    stock,
  });
  return {
    name: spec.name.trim(),
    ...(spec.description ? { description: spec.description } : {}),
    ...(spec.slug ? { slug: spec.slug } : {}),
    maxPerOrder: spec.maxPerOrder ?? 10,
    options: sizes.length > 0 ? [{ name: optionName, values: sizes }] : [],
    variants:
      sizes.length > 0
        ? sizes.map((size) =>
            variant(`${base}-${skuPart(size) || size}`, stockFor(spec, size), {
              [optionName]: size,
            }),
          )
        : [variant(base, stockFor(spec))],
  };
}

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** MIME type from the file's magic bytes (not its extension), or null. */
export function sniffImage(
  head: Uint8Array,
): MerchImageUploadRequest["mimeType"] | null {
  const starts = (sig: number[], at = 0) =>
    sig.every((b, i) => head[at + i] === b);
  if (starts(JPEG)) return "image/jpeg";
  if (starts(PNG)) return "image/png";
  // RIFF....WEBP
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8))
    return "image/webp";
  return null;
}

function readHead(path: string): Uint8Array {
  const fd = openSync(path, "r");
  try {
    const buf = new Uint8Array(12);
    const n = readSync(fd, buf, 0, 12, 0);
    return buf.subarray(0, n);
  } finally {
    closeSync(fd);
  }
}

/**
 * Checks a local image before anything is created: a regular readable file,
 * 1 byte to 6 MB, and JPEG/PNG/WebP by its magic bytes. Returns its MIME type.
 */
export function checkImage(path: string): MerchImageUploadRequest["mimeType"] {
  let size: number;
  let head: Uint8Array;
  try {
    const st = statSync(path);
    if (!st.isFile()) throw new Error("not a file");
    size = st.size;
    head = readHead(path);
  } catch {
    throw new Error(`${path}: cannot read the file.`);
  }
  if (size === 0) throw new Error(`${path}: the file is empty.`);
  if (size > MAX_IMAGE_BYTES) {
    throw new Error(`${path}: the photo cannot exceed 6 MB.`);
  }
  const mime = sniffImage(head);
  if (!mime) {
    throw new Error(`${path}: the photo must be a JPG, PNG or WebP file.`);
  }
  return mime;
}

const isInt = (v: unknown, min = 0) =>
  typeof v === "number" && Number.isInteger(v) && v >= min;
const optString = (v: unknown) => v === undefined || typeof v === "string";

/**
 * Runtime shape check of one spec (a --from-json row is untyped input): a
 * clear message per field instead of a TypeError half-way through the batch.
 */
export function validateSpec(raw: unknown, label: string): MerchProductSpec {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${label}: must be an object.`);
  }
  const p = raw as Record<string, unknown>;
  const bad = (field: string, want: string) =>
    new Error(`${label}: "${field}" must be ${want}.`);
  if (typeof p.name !== "string" || !p.name.trim())
    throw bad("name", "a non-empty string");
  if (!isInt(p.price)) throw bad("price", "a non-negative integer (COP)");
  if (p.compareAtPrice != null && !isInt(p.compareAtPrice))
    throw bad("compareAtPrice", "a non-negative integer or null");
  if (p.description != null && typeof p.description !== "string")
    throw bad("description", "a string");
  for (const f of ["optionName", "sku", "slug"] as const)
    if (!optString(p[f])) throw bad(f, "a string");
  if (p.maxPerOrder !== undefined && !isInt(p.maxPerOrder, 1))
    throw bad("maxPerOrder", "an integer of at least 1");
  if (
    p.sizes !== undefined &&
    (!Array.isArray(p.sizes) || !p.sizes.every((s) => typeof s === "string"))
  )
    throw bad("sizes", "an array of strings");
  if (
    p.stock !== undefined &&
    !isInt(p.stock) &&
    !(
      p.stock &&
      typeof p.stock === "object" &&
      !Array.isArray(p.stock) &&
      Object.values(p.stock).every((n) => isInt(n))
    )
  )
    throw bad(
      "stock",
      "a non-negative integer or { size: non-negative integer }",
    );
  if (
    p.images !== undefined &&
    (!Array.isArray(p.images) || !p.images.every((s) => typeof s === "string"))
  )
    throw bad("images", "an array of paths");
  if (((p.images as string[] | undefined)?.length ?? 0) > MAX_IMAGES)
    throw new Error(`${label}: at most ${MAX_IMAGES} photos.`);
  if (p.publish !== undefined && typeof p.publish !== "boolean")
    throw bad("publish", "true or false");
  return p as unknown as MerchProductSpec;
}

/**
 * A --from-json image path: relative, inside the file's folder (no absolute
 * paths, no `..` out of it) and not a symlink, so a shared catalog file
 * cannot make the CLI upload something else from the disk.
 */
export function resolveJsonImage(
  dir: string,
  img: string,
  label: string,
): string {
  if (isAbsolute(img)) {
    throw new Error(
      `${label}: image "${img}" must be relative to the JSON file.`,
    );
  }
  const full = resolve(dir, img);
  const rel = relative(dir, full);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(
      `${label}: image "${img}" is outside the JSON file's folder.`,
    );
  }
  let link = false;
  try {
    link = lstatSync(full).isSymbolicLink();
  } catch {
    throw new Error(`${label}: image "${img}": cannot read the file.`);
  }
  if (link) throw new Error(`${label}: image "${img}" is a symlink.`);
  return full;
}

/**
 * Parses a --from-json file: `{ "products": [ ... ] }` or a bare array of
 * product specs. Every row is shape-checked and its image paths resolved
 * against the file's folder (see resolveJsonImage).
 */
export function parseProductsFile(
  raw: string,
  file: string,
): MerchProductSpec[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in ${file}.`);
  }
  const list = Array.isArray(parsed)
    ? parsed
    : (parsed as { products?: unknown })?.products;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(
      `${file}: expected { "products": [ ... ] } or an array with at least one product.`,
    );
  }
  const dir = dirname(resolve(file));
  return list.map((p, i) => {
    const label = `${file}: product #${i + 1}`;
    const spec = validateSpec(p, label);
    return {
      ...spec,
      images: (spec.images ?? []).map((img) =>
        resolveJsonImage(dir, img, label),
      ),
    };
  });
}

/**
 * Checks a whole batch before the first request: shape, body, photo count and
 * every photo. One bad row aborts the run with nothing created.
 */
export function validateBatch(specs: MerchProductSpec[]): void {
  for (const [i, s] of specs.entries()) {
    validateSpec(s, `product #${i + 1}`);
    buildProductBody(s);
    for (const img of s.images ?? []) checkImage(img);
  }
}

type SdkResult<T> = { data?: T; error?: unknown; response: Response };

/** The calls `createProduct` makes. Injected so tests run without network. */
export interface MerchDeps {
  create(
    body: MerchProductCreate,
  ): Promise<SdkResult<{ data: MerchAdminProduct }>>;
  uploadUrl(
    body: MerchImageUploadRequest,
  ): Promise<SdkResult<{ data: { uploadUrl: string; publicUrl: string } }>>;
  setImages(
    id: string,
    imageUrls: string[],
  ): Promise<SdkResult<{ data: { id?: string; imageUrls?: string[] } }>>;
  setStatus(
    id: string,
    status: "DRAFT" | "PUBLISHED",
  ): Promise<SdkResult<{ data: { id?: string; status?: string } }>>;
  readFile(path: string): Uint8Array;
  put(url: string, body: Uint8Array, contentType: string): Promise<Response>;
  sleep(ms: number): Promise<void>;
}

export type MerchStep =
  | "create"
  | "upload-url"
  | "upload"
  | "set-images"
  | "publish";

/** A product that did not finish: which step, and its id if it exists. */
export class MerchStepError extends Error {
  constructor(
    readonly step: MerchStep,
    message: string,
    readonly productId?: string,
  ) {
    super(message);
  }
}

const errorCode = (res: SdkResult<unknown>) =>
  (res.error as { error?: { code?: string } } | undefined)?.error?.code;

function ok<T>(
  res: SdkResult<T>,
  step: MerchStep,
  what: string,
  productId?: string,
): T {
  if (res.data !== undefined) return res.data;
  throw new MerchStepError(step, `${what}: ${describeError(res)}`, productId);
}

/** Tope de la espera de un 429 (el backend pide 300 s). */
const MAX_RETRY_AFTER_MS = 10 * 60_000;

/** Seconds of a `Retry-After` header (delta-seconds or HTTP date). */
export function retryAfterMs(res: Response | undefined): number {
  const raw = res?.headers.get("Retry-After");
  if (!raw) return 60_000;
  const secs = Number(raw);
  const ms = Number.isFinite(secs)
    ? secs * 1000
    : Math.max(0, Date.parse(raw) - Date.now());
  return Math.min(Number.isNaN(ms) ? 60_000 : ms, MAX_RETRY_AFTER_MS);
}

/**
 * Uploads local photos in order: signed URL (one retry after `Retry-After`
 * on a 429) → PUT of the bytes. `sizeBytes` is the length of the bytes
 * actually sent. Returns the public URLs.
 */
export async function uploadImages(
  paths: string[],
  deps: MerchDeps,
  at: string,
  productId?: string,
): Promise<string[]> {
  const urls: string[] = [];
  for (const path of paths) {
    const mimeType = checkImage(path);
    const bytes = deps.readFile(path);
    const body = { mimeType, sizeBytes: bytes.byteLength };
    let res = await deps.uploadUrl(body);
    if (res.data === undefined && res.response?.status === 429) {
      const wait = retryAfterMs(res.response);
      console.error(
        `Rate limited asking for an upload URL; retrying in ${Math.ceil(wait / 1000)} s…`,
      );
      await deps.sleep(wait);
      res = await deps.uploadUrl(body);
    }
    const signed = ok(
      res,
      "upload-url",
      `${at} upload-url for ${path}`,
      productId,
    ).data;
    const put = await deps.put(signed.uploadUrl, bytes, mimeType);
    if (!put.ok) {
      throw new MerchStepError(
        "upload",
        `${at} uploading ${path}: storage answered ${put.status}`,
        productId,
      );
    }
    urls.push(signed.publicUrl);
  }
  return urls;
}

const RECOVER_HINT =
  "Probably created by an earlier run: find it with `ft merch products list`, then `ft merch products images <id> --image …` and `ft merch products publish <id>`; or use another --sku / slug for a new product.";

/**
 * Creates one product: POST (always DRAFT) → upload each photo → set the
 * ordered list → optionally publish. Inputs are expected to have passed
 * `validateBatch`. A failure throws MerchStepError with the step and, once the
 * product exists, its id: re-running `create` would then hit 409 SKU_TAKEN,
 * so the fix is `ft merch products images <id>` / `publish <id>`, not a retry.
 */
export async function createProduct(
  spec: MerchProductSpec,
  deps: MerchDeps,
): Promise<MerchAdminProduct> {
  const body = buildProductBody(spec);
  const images = spec.images ?? [];

  const res = await deps.create(body);
  if (res.data === undefined) {
    const code = errorCode(res);
    const hint =
      code === "SKU_TAKEN" || code === "SLUG_TAKEN" ? ` ${RECOVER_HINT}` : "";
    throw new MerchStepError(
      "create",
      `"${spec.name}" create: ${describeError(res)}.${hint}`,
    );
  }
  const product = res.data.data;
  const at = `"${spec.name}" (created as ${product.id}, DRAFT)`;

  if (images.length > 0) {
    const urls = await uploadImages(images, deps, at, product.id);
    ok(
      await deps.setImages(product.id, urls),
      "set-images",
      `${at} set images`,
      product.id,
    );
    product.imageUrls = urls;
  }

  if (spec.publish) {
    ok(
      await deps.setStatus(product.id, "PUBLISHED"),
      "publish",
      `${at} publish`,
      product.id,
    );
    product.status = "PUBLISHED";
  }
  return product;
}

export type MerchFailure = {
  name: string;
  productId?: string;
  step: MerchStep | "validate";
  error: string;
};

/** Runs a batch one product after another; a failure does not stop the rest. */
export async function createBatch(
  specs: MerchProductSpec[],
  deps: MerchDeps,
): Promise<{ created: MerchAdminProduct[]; failed: MerchFailure[] }> {
  const created: MerchAdminProduct[] = [];
  const failed: MerchFailure[] = [];
  for (const spec of specs) {
    try {
      created.push(await createProduct(spec, deps));
    } catch (err) {
      const e = err as Error;
      failed.push({
        name: spec.name,
        ...(err instanceof MerchStepError && err.productId
          ? { productId: err.productId }
          : {}),
        step: err instanceof MerchStepError ? err.step : "validate",
        error: e.message,
      });
    }
  }
  return { created, failed };
}

const sdkDeps: MerchDeps = {
  create: (body) => postMerchProducts({ body }) as never,
  uploadUrl: (body) => postMerchProductsImagesUploadUrl({ body }) as never,
  setImages: (id, imageUrls) =>
    putMerchProductsIdImages({ path: { id }, body: { imageUrls } }) as never,
  setStatus: (id, status) =>
    patchMerchProductsIdStatus({ path: { id }, body: { status } }) as never,
  readFile: (path) => readFileSync(path),
  // Signed storage URL: no Authorization header, the token is in the URL.
  put: (url, body, contentType) =>
    fetch(url, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: body as unknown as Blob,
    }),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

/** Table row of `products list`: stock summed, price range. */
export function summarize(p: MerchAdminProduct) {
  const prices = p.variants.map((v) => v.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    variants: p.variants.map((v) => v.label).join(" "),
    stock: p.variants.reduce((n, v) => n + v.stock, 0),
    price: prices.length === 0 ? null : min === max ? min : `${min}-${max}`,
  };
}

const collect = (value: string, prev: string[] = []) => [...prev, value];

function intFlag(name: string) {
  return (value: string) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0) {
      fail(`${name} must be a non-negative integer (got "${value}").`);
    }
    return n;
  };
}

export function registerMerch(program: Command, deps: MerchDeps = sdkDeps) {
  const merch = program
    .command("merch")
    .description("Merch store (Legend plan): products, photos, publishing");
  const products = merch
    .command("products")
    .description("Merch store products of the workspace's organization");

  products
    .command("list")
    .description("List every product (DRAFT and PUBLISHED) with its variants")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (opts) => {
      configureClient(opts.workspace);
      const body = unwrap(await getMerchProducts());
      const rows = body.data ?? [];
      print(opts.json ? rows : rows.map(summarize), {
        json: opts.json,
        columns: LIST_COLUMNS,
      });
    });

  products
    .command("create")
    .description(
      "Create product(s) as DRAFT: sizes become variants, local photos are uploaded",
    )
    .option("--name <name>", "product name")
    .option("--description <text>", "description")
    .option(
      "--price <cop>",
      "price in COP (integer, VAT included)",
      intFlag("--price"),
    )
    .option(
      "--compare-at <cop>",
      "strikethrough price in COP (greater than --price)",
      intFlag("--compare-at"),
    )
    .option("--sizes <list>", "comma-separated sizes, e.g. XS,S,M,L,XL,2XL")
    .option("--option-name <name>", "name of the size option", "Talla")
    .option("--stock <n>", "units per variant", intFlag("--stock"))
    .option(
      "--sku <prefix>",
      "SKU prefix (default: from the name); sizes append -<SIZE>",
    )
    .option(
      "--max-per-order <n>",
      "max units per order (default 10)",
      intFlag("--max-per-order"),
    )
    .option("--slug <slug>", "URL slug (default: from the name)")
    .option(
      "--image <path>",
      "local photo, repeatable (first = cover)",
      collect,
    )
    .option("--publish", "publish right after creating")
    .option("--from-json <file>", "create several products from a JSON file")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (opts) => {
      let specs: MerchProductSpec[];
      try {
        if (opts.fromJson) {
          if (opts.name) fail("Use either --from-json or --name, not both.");
          let raw: string;
          try {
            raw = readFileSync(opts.fromJson, "utf8");
          } catch {
            fail(`Cannot read file: ${opts.fromJson}`);
          }
          specs = parseProductsFile(raw, opts.fromJson);
        } else {
          if (!opts.name || opts.price === undefined) {
            fail(
              "Missing --name or --price (or pass --from-json <file>).",
              'Example: ft merch products create --name "Camiseta Tour" --price 80000 --sizes S,M,L --stock 10 --image front.jpg',
            );
          }
          specs = [
            {
              name: opts.name,
              description: opts.description,
              price: opts.price,
              compareAtPrice: opts.compareAt,
              sizes: opts.sizes ? String(opts.sizes).split(",") : undefined,
              optionName: opts.optionName,
              stock: opts.stock,
              sku: opts.sku,
              maxPerOrder: opts.maxPerOrder,
              slug: opts.slug,
              images: opts.image ?? [],
              publish: Boolean(opts.publish),
            },
          ];
        }
        // The whole batch is checked before the first request: a bad row
        // never leaves the run half-applied.
        validateBatch(specs);
      } catch (err) {
        fail((err as Error).message);
      }

      configureClient(opts.workspace);
      const { created, failed } = await createBatch(specs, deps);
      // stdout always carries what DID get created (also with --json), so a
      // partial run is recoverable; failures go to stderr and exit 1.
      if (opts.json) print({ created, failed }, { json: true });
      else if (created.length > 0)
        print(created.map(summarize), { columns: LIST_COLUMNS });
      if (failed.length > 0) {
        fail(
          `${failed.length} of ${specs.length} product(s) failed:\n${failed.map((f) => `  · [${f.step}] ${f.error}`).join("\n")}`,
        );
      }
    });

  products
    .command("images <id>")
    .description(
      "Replace a product's photos with local files (in order; first = cover)",
    )
    .requiredOption(
      "--image <path>",
      "local photo, repeatable (first = cover)",
      collect,
    )
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (id, opts) => {
      const paths: string[] = opts.image;
      try {
        if (paths.length > MAX_IMAGES) {
          throw new Error(`At most ${MAX_IMAGES} photos.`);
        }
        for (const img of paths) checkImage(img);
      } catch (err) {
        fail((err as Error).message);
      }
      configureClient(opts.workspace);
      let urls: string[];
      try {
        urls = await uploadImages(paths, deps, `Product ${id}`, id);
      } catch (err) {
        fail((err as Error).message);
      }
      const body = unwrap(await deps.setImages(id, urls));
      print(body.data ?? body, { json: opts.json });
    });

  for (const [name, status, describe] of [
    ["publish", "PUBLISHED", "Publish a product (shows it in the store)"],
    ["unpublish", "DRAFT", "Unpublish a product (back to DRAFT)"],
  ] as const) {
    products
      .command(`${name} <id>`)
      .description(describe)
      .option("--workspace <id>", "workspace override")
      .option("--json", "raw JSON output")
      .action(async (id, opts) => {
        configureClient(opts.workspace);
        const body = unwrap(await deps.setStatus(id, status));
        print(body.data ?? body, { json: opts.json });
      });
  }
}

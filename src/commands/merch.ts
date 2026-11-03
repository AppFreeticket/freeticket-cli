import { readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
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
const MIME_BY_EXT: Record<string, MerchImageUploadRequest["mimeType"]> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

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

/** Checks a local image before anything is created. Returns its MIME type. */
export function checkImage(
  path: string,
  size: (p: string) => number = (p) => statSync(p).size,
): MerchImageUploadRequest["mimeType"] {
  const mime = MIME_BY_EXT[extname(path).toLowerCase()];
  if (!mime) throw new Error(`${path}: the photo must be JPG, PNG or WebP.`);
  let bytes: number;
  try {
    bytes = size(path);
  } catch {
    throw new Error(`${path}: cannot read the file.`);
  }
  if (bytes > MAX_IMAGE_BYTES) {
    throw new Error(`${path}: the photo cannot exceed 6 MB.`);
  }
  if (bytes === 0) throw new Error(`${path}: the file is empty.`);
  return mime;
}

/**
 * Parses a --from-json file: `{ "products": [ ... ] }` or a bare array of
 * product specs. Relative image paths resolve against the file's folder.
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
    if (!p || typeof p !== "object") {
      throw new Error(`${file}: product #${i + 1} is not an object.`);
    }
    const spec = p as MerchProductSpec;
    return {
      ...spec,
      images: (spec.images ?? []).map((img) => resolve(dir, img)),
    };
  });
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
}

function ok<T>(res: SdkResult<T>, what: string): T {
  if (res.data !== undefined) return res.data;
  throw new Error(`${what}: ${describeError(res)}`);
}

/**
 * Creates one product: validate the images locally → POST the product (DRAFT)
 * → upload each image (signed URL + PUT) → set the ordered list → optionally
 * publish. Throws with the step that failed; the product id is in the message
 * when it already exists, so a retry can fix it instead of duplicating it.
 */
export async function createProduct(
  spec: MerchProductSpec,
  deps: MerchDeps,
): Promise<MerchAdminProduct> {
  const body = buildProductBody(spec);
  const images = spec.images ?? [];
  if (images.length > MAX_IMAGES) {
    throw new Error(`"${spec.name}": at most ${MAX_IMAGES} photos.`);
  }
  const mimes = images.map((img) => checkImage(img));

  const product = ok(await deps.create(body), `"${spec.name}" create`).data;
  const at = `"${spec.name}" (created as ${product.id}, DRAFT)`;

  if (images.length > 0) {
    const urls: string[] = [];
    for (const [i, path] of images.entries()) {
      const mimeType = mimes[i] as MerchImageUploadRequest["mimeType"];
      const bytes = deps.readFile(path);
      const signed = ok(
        await deps.uploadUrl({ mimeType, sizeBytes: bytes.byteLength }),
        `${at} upload-url for ${path}`,
      ).data;
      const put = await deps.put(signed.uploadUrl, bytes, mimeType);
      if (!put.ok) {
        throw new Error(
          `${at} uploading ${path}: storage answered ${put.status}`,
        );
      }
      urls.push(signed.publicUrl);
    }
    ok(await deps.setImages(product.id, urls), `${at} set images`);
    product.imageUrls = urls;
  }

  if (spec.publish) {
    ok(await deps.setStatus(product.id, "PUBLISHED"), `${at} publish`);
    product.status = "PUBLISHED";
  }
  return product;
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
        // Fail fast on local problems before creating anything.
        for (const s of specs) {
          buildProductBody(s);
          for (const img of s.images ?? []) checkImage(img);
        }
      } catch (err) {
        fail((err as Error).message);
      }

      configureClient(opts.workspace);
      // One after another: a failure names its product and the run goes on,
      // so a 20-product file does not stop at the first bad row.
      const created: MerchAdminProduct[] = [];
      const errors: string[] = [];
      for (const spec of specs) {
        try {
          created.push(await createProduct(spec, deps));
        } catch (err) {
          errors.push((err as Error).message);
        }
      }
      print(opts.json ? created : created.map(summarize), {
        json: opts.json,
        columns: LIST_COLUMNS,
      });
      if (errors.length > 0) {
        fail(
          `${errors.length} of ${specs.length} product(s) failed:\n${errors.map((e) => `  · ${e}`).join("\n")}`,
        );
      }
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

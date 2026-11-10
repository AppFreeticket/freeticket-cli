import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchAdminProduct } from "../client/types.gen";
import {
  buildProductBody,
  checkImage,
  createProduct,
  type MerchDeps,
  MerchStepError,
  parseProductsFile,
  registerMerch,
  skuBaseFrom,
  sniffImage,
  validateBatch,
  validateSpec,
} from "./merch";

vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  // No real account/client in tests: the commands only need it not to throw.
  configureClient: vi.fn(),
}));

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0];
const WEBP = [...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8 ")];

const res = <T>(data: T, status = 200) => ({
  data,
  response: new Response(null, { status }),
});
const err = (
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
) => ({
  error: { error: { code, message } },
  response: new Response(null, { status, headers }),
});

const product = (over: Partial<MerchAdminProduct> = {}): MerchAdminProduct => ({
  id: "p_1",
  slug: "camiseta-tour",
  name: "Camiseta Tour",
  description: null,
  status: "DRAFT",
  imageUrls: [],
  options: [],
  maxPerOrder: 10,
  maxPerCustomer: null,
  membersOnly: false,
  sortOrder: 0,
  publishedAt: null,
  createdAt: "2026-11-03T00:00:00.000Z",
  updatedAt: "2026-11-03T00:00:00.000Z",
  variants: [
    {
      id: "v",
      sku: "X",
      label: "S",
      attributes: {},
      price: 1,
      compareAtPrice: null,
      stock: 1,
      isActive: true,
    },
  ],
  ...over,
});

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "ft-merch-"));
}

/** Real image files on disk (checkImage stats and sniffs them). */
function images(dir = tmp()): [string, string] {
  const a = join(dir, "front.jpg");
  const b = join(dir, "back.png");
  writeFileSync(a, Buffer.from(JPEG));
  writeFileSync(b, Buffer.from(PNG));
  return [a, b];
}

function deps(over: Partial<MerchDeps> = {}): MerchDeps {
  let n = 0;
  let id = 0;
  return {
    create: vi.fn(async (body) => {
      id += 1;
      return res({ data: product({ id: `p_${id}`, name: body.name }) }, 201);
    }),
    uploadUrl: vi.fn(async () => {
      n += 1;
      return res(
        {
          data: {
            uploadUrl: `https://store.test/sign/${n}?token=t`,
            publicUrl: `https://store.test/public/merch/org_1/${n}.jpg`,
          },
        },
        201,
      );
    }),
    setImages: vi.fn(async (id, imageUrls) => res({ data: { id, imageUrls } })),
    setStatus: vi.fn(async (id, status) => res({ data: { id, status } })),
    readFile: vi.fn((p: string) => readFileSync(p)),
    put: vi.fn(async () => new Response(null, { status: 200 })),
    sleep: vi.fn(async () => {}),
    ...over,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("buildProductBody", () => {
  it("sizes become one option and one variant per size, with SKUs and stock", () => {
    const body = buildProductBody({
      name: "Camiseta Tour Ñandú",
      price: 80_000,
      sizes: ["XS", "S", "2XL"],
      stock: 10,
    });
    expect(body.options).toEqual([
      { name: "Talla", values: ["XS", "S", "2XL"] },
    ]);
    expect(body.variants).toEqual([
      {
        attributes: { Talla: "XS" },
        sku: "CAMISETA-TOUR-NANDU-XS",
        price: 80_000,
        compareAtPrice: null,
        stock: 10,
      },
      expect.objectContaining({ sku: "CAMISETA-TOUR-NANDU-S", stock: 10 }),
      expect.objectContaining({ sku: "CAMISETA-TOUR-NANDU-2XL", stock: 10 }),
    ]);
  });

  it("without sizes: a single variant and no options", () => {
    const body = buildProductBody({ name: "Gorra", price: 50_000, stock: 3 });
    expect(body.options).toEqual([]);
    expect(body.variants).toEqual([
      {
        attributes: {},
        sku: "GORRA",
        price: 50_000,
        compareAtPrice: null,
        stock: 3,
      },
    ]);
  });

  it("stock per size, unknown size rejected", () => {
    const body = buildProductBody({
      name: "X",
      price: 1,
      sizes: ["S", "M"],
      stock: { M: 4 },
      sku: "CAM",
    });
    expect(body.variants.map((v) => [v.sku, v.stock])).toEqual([
      ["CAM-S", 0],
      ["CAM-M", 4],
    ]);
    expect(() =>
      buildProductBody({ name: "X", price: 1, sizes: ["S"], stock: { L: 1 } }),
    ).toThrow(/unknown size/);
  });

  it("skuBaseFrom mirrors the dashboard", () => {
    expect(skuBaseFrom("Camiseta  Tour 2026!")).toBe("CAMISETA-TOUR-2026");
    expect(skuBaseFrom("¡¡!!")).toBe("SKU");
  });
});

describe("validateSpec (runtime shape of an untyped row)", () => {
  it("rejects wrong types with a field message, never a TypeError", () => {
    const cases: [unknown, RegExp][] = [
      [{ name: "A", price: 1, images: "a.jpg" }, /"images" must be an array/],
      [{ name: "A", price: 1, sizes: "S,M" }, /"sizes" must be an array/],
      [{ name: "A", price: 1, stock: -1 }, /"stock" must be/],
      [{ name: "A", price: 1, stock: { S: -2 } }, /"stock" must be/],
      [{ name: "A", price: 1.5 }, /"price" must be/],
      [{ price: 1 }, /"name" must be/],
      [{ name: "A", price: 1, publish: "yes" }, /"publish"/],
      ["nope", /must be an object/],
    ];
    for (const [spec, msg] of cases) {
      expect(() => validateSpec(spec, "row")).toThrow(msg);
      try {
        validateSpec(spec, "row");
      } catch (e) {
        expect(e).not.toBeInstanceOf(TypeError);
      }
    }
  });

  it("more than 10 photos is rejected up front", () => {
    const imgs = Array.from({ length: 11 }, (_, i) => `${i}.jpg`);
    expect(() =>
      validateSpec({ name: "A", price: 1, images: imgs }, "row"),
    ).toThrow(/at most 10/);
  });
});

describe("checkImage (magic bytes)", () => {
  it("detects JPEG, PNG and WebP by content, not by extension", () => {
    expect(sniffImage(Uint8Array.from(JPEG))).toBe("image/jpeg");
    expect(sniffImage(Uint8Array.from(PNG))).toBe("image/png");
    expect(sniffImage(Uint8Array.from(WEBP))).toBe("image/webp");
    const dir = tmp();
    const disguised = join(dir, "photo.jpg");
    writeFileSync(disguised, Buffer.from(PNG));
    expect(checkImage(disguised)).toBe("image/png");
  });

  it("rejects a non-image renamed .jpg, empty files, >6 MB and missing files", () => {
    const dir = tmp();
    const fake = join(dir, "fake.jpg");
    writeFileSync(fake, "<html>not an image</html>");
    expect(() => checkImage(fake)).toThrow(/JPG, PNG or WebP/);
    const empty = join(dir, "empty.png");
    writeFileSync(empty, "");
    expect(() => checkImage(empty)).toThrow(/empty/);
    const big = join(dir, "big.png");
    writeFileSync(
      big,
      Buffer.concat([Buffer.from(PNG), Buffer.alloc(6 * 1024 * 1024)]),
    );
    expect(() => checkImage(big)).toThrow(/6 MB/);
    expect(() => checkImage(join(dir, "nope.png"))).toThrow(/cannot read/);
  });
});

describe("parseProductsFile (paths)", () => {
  function catalog() {
    const dir = tmp();
    mkdirSync(join(dir, "img"));
    writeFileSync(join(dir, "img", "a.jpg"), Buffer.from(JPEG));
    return { dir, file: join(dir, "products.json") };
  }
  const parse = (file: string, images: string[]) =>
    parseProductsFile(
      JSON.stringify({ products: [{ name: "A", price: 1, images }] }),
      file,
    );

  it("resolves relative images inside the file's folder", () => {
    const { dir, file } = catalog();
    expect(parse(file, ["img/a.jpg"])[0]?.images).toEqual([
      join(dir, "img", "a.jpg"),
    ]);
  });

  it("rejects absolute paths and `..` out of the folder", () => {
    const { file } = catalog();
    expect(() => parse(file, ["/etc/passwd"])).toThrow(/must be relative/);
    expect(() => parse(file, ["../secret.jpg"])).toThrow(/outside/);
    expect(() => parse(file, ["img/../../x.jpg"])).toThrow(/outside/);
  });

  it("rejects a symlink, even one pointing inside the folder", () => {
    const { dir, file } = catalog();
    symlinkSync(join(dir, "img", "a.jpg"), join(dir, "img", "link.jpg"));
    expect(() => parse(file, ["img/link.jpg"])).toThrow(/symlink/);
  });

  it("accepts a bare array, rejects empty or invalid JSON", () => {
    expect(
      parseProductsFile('[{"name":"A","price":1}]', "x.json"),
    ).toHaveLength(1);
    expect(() => parseProductsFile("[]", "x.json")).toThrow(/at least one/);
    expect(() => parseProductsFile("{", "x.json")).toThrow(/Invalid JSON/);
  });
});

describe("createProduct", () => {
  it("creates DRAFT, uploads each photo with its real size, then sets the list", async () => {
    const d = deps();
    const [a, b] = images();
    const out = await createProduct(
      { name: "Camiseta Tour", price: 80_000, sizes: ["S"], images: [a, b] },
      d,
    );
    // sizeBytes is the size of the file on disk, bytes actually PUT.
    expect(d.uploadUrl).toHaveBeenNthCalledWith(1, {
      mimeType: "image/jpeg",
      sizeBytes: statSync(a).size,
    });
    expect(d.uploadUrl).toHaveBeenNthCalledWith(2, {
      mimeType: "image/png",
      sizeBytes: statSync(b).size,
    });
    const [url, sent, type] = (d.put as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, Uint8Array, string];
    expect(url).toBe("https://store.test/sign/1?token=t");
    expect(Buffer.from(sent)).toEqual(readFileSync(a));
    expect(type).toBe("image/jpeg");
    expect(d.setImages).toHaveBeenCalledWith("p_1", [
      "https://store.test/public/merch/org_1/1.jpg",
      "https://store.test/public/merch/org_1/2.jpg",
    ]);
    expect(out.status).toBe("DRAFT");
  });

  it("409 SKU_TAKEN on a re-run says how to recover", async () => {
    const d = deps({
      create: vi.fn(async () =>
        err(409, "SKU_TAKEN", 'El SKU "CAM-S" ya existe en la tienda.'),
      ) as never,
    });
    const e = await createProduct({ name: "Cam", price: 1 }, d).catch((x) => x);
    expect(e).toBeInstanceOf(MerchStepError);
    expect(e.step).toBe("create");
    expect(e.message).toMatch(/SKU_TAKEN/);
    expect(e.message).toMatch(/ft merch products list/);
    expect(e.message).toMatch(/ft merch products images <id>/);
    expect(d.uploadUrl).not.toHaveBeenCalled();
  });

  it("429 mid-upload: waits Retry-After and retries once, then goes on", async () => {
    let calls = 0;
    const base = deps();
    const d = deps({
      uploadUrl: vi.fn(async (body) => {
        calls += 1;
        if (calls === 2)
          return err(429, "RATE_LIMITED", "Espera.", { "Retry-After": "7" });
        return base.uploadUrl(body);
      }) as never,
    });
    const [a, b] = images();
    const out = await createProduct({ name: "X", price: 1, images: [a, b] }, d);
    expect(d.sleep).toHaveBeenCalledWith(7000);
    expect(d.uploadUrl).toHaveBeenCalledTimes(3);
    expect(out.imageUrls).toHaveLength(2);
  });

  it("a second 429 is not retried again: fails at upload-url with the product id", async () => {
    const d = deps({
      uploadUrl: vi.fn(async () =>
        err(429, "RATE_LIMITED", "Espera.", { "Retry-After": "1" }),
      ) as never,
    });
    const [a] = images();
    const e = await createProduct(
      { name: "X", price: 1, images: [a] },
      d,
    ).catch((x) => x);
    expect(d.uploadUrl).toHaveBeenCalledTimes(2);
    expect(e.step).toBe("upload-url");
    expect(e.productId).toBe("p_1");
    expect(d.setImages).not.toHaveBeenCalled();
  });

  it("a failed storage PUT stops before setting images", async () => {
    const d = deps({
      put: vi.fn(async () => new Response(null, { status: 403 })),
    });
    const [a] = images();
    const e = await createProduct(
      { name: "X", price: 1, images: [a] },
      d,
    ).catch((x) => x);
    expect(e.step).toBe("upload");
    expect(e.message).toMatch(/storage answered 403/);
    expect(d.setImages).not.toHaveBeenCalled();
  });
});

describe("validateBatch", () => {
  it("one bad row (photo or shape) aborts before any request", () => {
    const [a] = images();
    expect(() =>
      validateBatch([
        { name: "A", price: 1, images: [a] },
        { name: "B", price: 1, images: ["/nope/x.png"] },
      ]),
    ).toThrow(/cannot read/);
    expect(() =>
      validateBatch([
        { name: "A", price: 1 },
        { name: "B", price: 1, sizes: "S" } as never,
      ]),
    ).toThrow(/"sizes" must be an array/);
  });
});

/** Runs `ft merch products …` against injected deps, capturing output/exit. */
async function run(argv: string[], d: MerchDeps) {
  let stdout = "";
  let stderr = "";
  vi.spyOn(process.stdout, "write").mockImplementation((c) => {
    stdout += String(c);
    return true;
  });
  vi.spyOn(console, "log").mockImplementation((...a) => {
    stdout += `${a.join(" ")}\n`;
  });
  vi.spyOn(console, "error").mockImplementation((...a) => {
    stderr += `${a.join(" ")}\n`;
  });
  const exit = vi.spyOn(process, "exit").mockImplementation(((
    code?: number,
  ) => {
    throw new Error(`exit ${code}`);
  }) as never);
  const program = new Command().exitOverride();
  registerMerch(program, d);
  let code = 0;
  try {
    await program.parseAsync(["node", "ft", "merch", "products", ...argv]);
  } catch (e) {
    code = Number(/exit (\d+)/.exec((e as Error).message)?.[1] ?? 1);
  }
  exit.mockRestore();
  return { stdout, stderr, code };
}

describe("ft merch products create --from-json", () => {
  function file(products: unknown[]) {
    const dir = tmp();
    const f = join(dir, "p.json");
    writeFileSync(f, JSON.stringify({ products }));
    return f;
  }

  it("1 of 3 fails: exit 1, stdout has the two created, stderr names the failure", async () => {
    const base = deps();
    const d = deps({
      create: vi.fn(async (body) =>
        body.name === "B"
          ? err(409, "SKU_TAKEN", 'El SKU "B" ya existe en la tienda.')
          : base.create(body),
      ) as never,
    });
    const f = file([
      { name: "A", price: 1 },
      { name: "B", price: 1 },
      { name: "C", price: 1 },
    ]);
    const out = await run(["create", "--from-json", f, "--json"], d);
    expect(out.code).toBe(1);
    const parsed = JSON.parse(out.stdout);
    expect(parsed.created.map((p: { name: string }) => p.name)).toEqual([
      "A",
      "C",
    ]);
    expect(parsed.failed).toEqual([
      expect.objectContaining({ name: "B", step: "create" }),
    ]);
    expect(out.stderr).toMatch(/1 of 3 product\(s\) failed/);
    expect(out.stderr).toMatch(/SKU_TAKEN/);
  });

  it("a failure after create reports the product id in --json", async () => {
    const d = deps({
      put: vi.fn(async () => new Response(null, { status: 500 })),
    });
    const dir = tmp();
    writeFileSync(join(dir, "a.jpg"), Buffer.from(JPEG));
    const f = join(dir, "p.json");
    writeFileSync(
      f,
      JSON.stringify([{ name: "A", price: 1, images: ["a.jpg"] }]),
    );
    const out = await run(["create", "--from-json", f, "--json"], d);
    expect(out.code).toBe(1);
    expect(JSON.parse(out.stdout).failed[0]).toMatchObject({
      name: "A",
      productId: "p_1",
      step: "upload",
    });
  });

  it("a bad row anywhere creates nothing", async () => {
    const d = deps();
    const f = file([
      { name: "A", price: 1 },
      { name: "B", price: 1, stock: -1 },
    ]);
    const out = await run(["create", "--from-json", f], d);
    expect(out.code).toBe(1);
    expect(out.stderr).toMatch(/"stock"/);
    expect(d.create).not.toHaveBeenCalled();
  });
});

describe("ft merch products images <id>", () => {
  it("uploads the files and replaces the product's photos", async () => {
    const d = deps();
    const [a, b] = images();
    const out = await run(
      ["images", "p_9", "--image", a, "--image", b, "--json"],
      d,
    );
    expect(out.code).toBe(0);
    expect(d.create).not.toHaveBeenCalled();
    expect(d.setImages).toHaveBeenCalledWith("p_9", [
      "https://store.test/public/merch/org_1/1.jpg",
      "https://store.test/public/merch/org_1/2.jpg",
    ]);
  });
});

describe("registerMerch", () => {
  it("wires merch products list|create|images|publish|unpublish", () => {
    const program = new Command();
    registerMerch(program, deps());
    const products = program.commands
      .find((c) => c.name() === "merch")
      ?.commands.find((c) => c.name() === "products") as Command;
    expect(products.commands.map((c) => c.name()).sort()).toEqual([
      "create",
      "images",
      "list",
      "publish",
      "unpublish",
    ]);
    const create = products.commands.find(
      (c) => c.name() === "create",
    ) as Command;
    create.parseOptions(["--image", "a.jpg", "--image", "b.jpg"]);
    expect(create.opts().image).toEqual(["a.jpg", "b.jpg"]);
  });
});

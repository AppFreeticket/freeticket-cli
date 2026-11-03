import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import type { MerchAdminProduct } from "../client/types.gen";
import {
  buildProductBody,
  checkImage,
  createProduct,
  type MerchDeps,
  parseProductsFile,
  registerMerch,
  skuBaseFrom,
} from "./merch";

const res = <T>(data: T, status = 200) => ({
  data,
  response: new Response(null, { status }),
});
const err = (status: number, code: string, message: string) => ({
  error: { error: { code, message } },
  response: new Response(null, { status }),
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
  sortOrder: 0,
  publishedAt: null,
  createdAt: "2026-11-03T00:00:00.000Z",
  updatedAt: "2026-11-03T00:00:00.000Z",
  variants: [],
  ...over,
});

/** Two real image files on disk (checkImage stats them). */
function images(): [string, string] {
  const dir = mkdtempSync(join(tmpdir(), "ft-merch-"));
  const a = join(dir, "front.jpg");
  const b = join(dir, "back.PNG");
  writeFileSync(a, Buffer.from([1, 2, 3]));
  writeFileSync(b, Buffer.from([4, 5]));
  return [a, b];
}

function deps(over: Partial<MerchDeps> = {}): MerchDeps {
  let n = 0;
  return {
    create: vi.fn(async () => res({ data: product() }, 201)),
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
    readFile: vi.fn(() => new Uint8Array([9, 9, 9])),
    put: vi.fn(async () => new Response(null, { status: 200 })),
    ...over,
  };
}

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
    expect(body.maxPerOrder).toBe(10);
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

  it("rejects repeated sizes and non-integer prices", () => {
    expect(() =>
      buildProductBody({ name: "X", price: 1, sizes: ["m", "M"] }),
    ).toThrow(/repeated size/);
    expect(() => buildProductBody({ name: "X", price: 9.5 })).toThrow(
      /integer/,
    );
  });

  it("skuBaseFrom mirrors the dashboard", () => {
    expect(skuBaseFrom("Camiseta  Tour 2026!")).toBe("CAMISETA-TOUR-2026");
    expect(skuBaseFrom("¡¡!!")).toBe("SKU");
  });
});

describe("checkImage", () => {
  it("maps the extension to the MIME type", () => {
    expect(checkImage("a.JPEG", () => 10)).toBe("image/jpeg");
    expect(checkImage("a.webp", () => 10)).toBe("image/webp");
  });

  it("rejects other types, files over 6 MB and missing files", () => {
    expect(() => checkImage("a.gif", () => 10)).toThrow(/JPG, PNG or WebP/);
    expect(() => checkImage("a.png", () => 7 * 1024 * 1024)).toThrow(/6 MB/);
    expect(() => checkImage("/nope/a.png")).toThrow(/cannot read/);
  });
});

describe("parseProductsFile", () => {
  it("accepts { products } and resolves images against the file's folder", () => {
    const specs = parseProductsFile(
      JSON.stringify({
        products: [{ name: "A", price: 1, images: ["img/a.jpg"] }],
      }),
      "/data/catalog/products.json",
    );
    expect(specs[0]?.images).toEqual(["/data/catalog/img/a.jpg"]);
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
  it("creates DRAFT, uploads each photo in order, then sets the list", async () => {
    const d = deps();
    const [a, b] = images();
    const out = await createProduct(
      { name: "Camiseta Tour", price: 80_000, sizes: ["S"], images: [a, b] },
      d,
    );
    expect(d.uploadUrl).toHaveBeenNthCalledWith(1, {
      mimeType: "image/jpeg",
      sizeBytes: 3,
    });
    expect(d.uploadUrl).toHaveBeenNthCalledWith(2, {
      mimeType: "image/png",
      sizeBytes: 3,
    });
    // PUT straight to the signed URL with the file's Content-Type.
    expect(d.put).toHaveBeenNthCalledWith(
      1,
      "https://store.test/sign/1?token=t",
      expect.any(Uint8Array),
      "image/jpeg",
    );
    expect(d.setImages).toHaveBeenCalledWith("p_1", [
      "https://store.test/public/merch/org_1/1.jpg",
      "https://store.test/public/merch/org_1/2.jpg",
    ]);
    expect(d.setStatus).not.toHaveBeenCalled();
    expect(out.status).toBe("DRAFT");
    expect(out.imageUrls).toHaveLength(2);
  });

  it("without images: no upload, no set-images call", async () => {
    const d = deps();
    await createProduct({ name: "Gorra", price: 1 }, d);
    expect(d.uploadUrl).not.toHaveBeenCalled();
    expect(d.setImages).not.toHaveBeenCalled();
  });

  it("--publish publishes after the photos", async () => {
    const d = deps();
    const out = await createProduct(
      { name: "Gorra", price: 1, publish: true },
      d,
    );
    expect(d.setStatus).toHaveBeenCalledWith("p_1", "PUBLISHED");
    expect(out.status).toBe("PUBLISHED");
  });

  it("a bad local image fails before creating anything", async () => {
    const d = deps();
    await expect(
      createProduct({ name: "X", price: 1, images: ["/nope/a.png"] }, d),
    ).rejects.toThrow(/cannot read/);
    expect(d.create).not.toHaveBeenCalled();
  });

  it("an API error names the step and the product id already created", async () => {
    const d = deps({
      setImages: vi.fn(async () =>
        err(422, "INVALID_IMAGE_URL", "Foto inválida."),
      ) as never,
    });
    const [a] = images();
    await expect(
      createProduct({ name: "Camiseta", price: 1, images: [a] }, d),
    ).rejects.toThrow(/created as p_1.*set images.*INVALID_IMAGE_URL/);
  });

  it("a failed storage PUT stops before setting images", async () => {
    const d = deps({
      put: vi.fn(async () => new Response(null, { status: 403 })),
    });
    const [a] = images();
    await expect(
      createProduct({ name: "X", price: 1, images: [a] }, d),
    ).rejects.toThrow(/storage answered 403/);
    expect(d.setImages).not.toHaveBeenCalled();
  });
});

describe("registerMerch", () => {
  function tree(): Command {
    const program = new Command();
    registerMerch(program, deps());
    return program;
  }
  const sub = (cmd: Command, name: string) =>
    cmd.commands.find((c) => c.name() === name) as Command;

  it("wires merch products list|create|publish|unpublish", () => {
    const products = sub(sub(tree(), "merch"), "products");
    expect(products.commands.map((c) => c.name()).sort()).toEqual([
      "create",
      "list",
      "publish",
      "unpublish",
    ]);
  });

  it("create takes the documented flags, --image repeatable", () => {
    const create = sub(sub(sub(tree(), "merch"), "products"), "create");
    const longs = create.options.map((o) => o.long);
    expect(longs).toEqual(
      expect.arrayContaining([
        "--name",
        "--description",
        "--price",
        "--sizes",
        "--stock",
        "--image",
        "--from-json",
        "--publish",
        "--json",
        "--workspace",
      ]),
    );
    create.parseOptions(["--image", "a.jpg", "--image", "b.jpg"]);
    expect(create.opts().image).toEqual(["a.jpg", "b.jpg"]);
  });
});

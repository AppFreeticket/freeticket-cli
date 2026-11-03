import type { Command } from "commander";
import {
  getMerchCatalog,
  getOrganizationProfile,
  getProducts,
  getWebsite,
  patchOrganization,
  patchOrganizationAnalytics,
  patchOrganizationProfile,
  postProductsIdStatus,
  putWebsite,
  putWebsitePublished,
} from "../client/sdk.gen";
import { fail } from "../lib/api";
import { op, orNull } from "./op";

/**
 * Workspace identity and storefront from contracts 1.26-1.36: organization and
 * profile, the public website, digital products and the merch catalog.
 */

/** Extras of `ft products`: list and status. */
export function extendProducts(root: Command): void {
  op(root, {
    name: "list",
    describe: "Digital products and courses",
    call: () => getProducts({}),
    columns: [
      "id",
      "name",
      "type",
      "status",
      "price",
      "currency",
      "salesCount",
    ],
  });
  op(root, {
    name: "status <productId>",
    describe: "Publish or unpublish a product",
    required: [["--status <s>", "DRAFT | PUBLISHED"]],
    check: (_a, o) => {
      if (!["DRAFT", "PUBLISHED"].includes(o.status))
        fail("--status must be DRAFT or PUBLISHED.");
    },
    call: ([id], o) =>
      postProductsIdStatus({ path: { id }, body: { status: o.status } }),
  });
}

/** `ft organization update|analytics|profile` (alias `org`). */
export function registerOrganization(program: Command): void {
  const root = program
    .command("organization")
    .alias("org")
    .description("The active workspace's identity, profile and analytics");

  op(root, {
    name: "update",
    describe: "Update the public identity (name, logoUrl, coverUrl)",
    data: "required",
    call: (_a, _o, data) => patchOrganization({ body: data as never }),
  });
  op(root, {
    name: "analytics <ga4MeasurementId>",
    describe: 'Set the GA4 property (G-XXXXXXX), or "none" to remove it',
    call: ([id]) =>
      patchOrganizationAnalytics({ body: { ga4MeasurementId: orNull(id) } }),
  });

  const profile = root
    .command("profile")
    .description("Workspace profile (artist, visual, contact, social)");
  op(profile, {
    name: "get",
    describe: "Get the workspace profile",
    call: () => getOrganizationProfile({}),
  });
  op(profile, {
    name: "update",
    describe:
      "Update the profile (partial: --data with artist/visual/contact/social)",
    data: "required",
    call: (_a, _o, data) => patchOrganizationProfile({ body: data as never }),
  });
}

/** `ft website get|set|publish|unpublish` */
export function registerWebsite(program: Command): void {
  const root = program
    .command("website")
    .description("The workspace's public website");

  op(root, {
    name: "get",
    describe: "Get the website configuration",
    call: () => getWebsite({}),
  });
  op(root, {
    name: "set",
    describe:
      "Save the whole website configuration (FULL replace: start from `ft website get --json`)",
    data: "required",
    call: (_a, _o, data) => putWebsite({ body: data as never }),
  });
  for (const [name, published] of [
    ["publish", true],
    ["unpublish", false],
  ] as const)
    op(root, {
      name,
      describe: `${published ? "Publish" : "Unpublish"} the public profile`,
      call: () => putWebsitePublished({ body: { published } }),
    });
}

/** `ft merch catalog` */
export function registerMerch(program: Command): void {
  const root = program
    .command("merch")
    .description("Merch store of an enterprise landing");
  op(root, {
    name: "catalog",
    describe:
      "Store settings and published products with live stock (needs an enterprise service key)",
    call: () => getMerchCatalog({}),
  });
}

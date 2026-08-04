import { readFileSync } from "node:fs";
import { join } from "node:path";

const fixtures = join(process.cwd(), "packages/core/test/fixtures");
const calls = new Map();

globalThis.fetch = async (input) => {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (url.hostname !== "reservation.pc.gc.ca") {
    throw new Error(`Fixture smoke blocked unexpected host: ${url.hostname}`);
  }
  const count = (calls.get(url.pathname) ?? 0) + 1;
  calls.set(url.pathname, count);
  if (
    count > 1 &&
    (url.pathname === "/api/resourcelocation/resources" ||
      url.pathname.startsWith("/images/"))
  ) {
    return new Response(
      '<html><meta name="description" content="Azure WAF"></html>',
      { status: 403 },
    );
  }
  if (url.pathname.startsWith("/images/")) {
    return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
      headers: { "content-type": "image/jpeg" },
    });
  }

  const fixture =
    url.pathname === "/api/resourcelocation/resources"
      ? "resources_min.json"
      : url.pathname === "/api/attribute/filterable"
        ? "attribute_filterable_min.json"
        : null;
  if (!fixture) {
    return new Response(JSON.stringify({ error: url.pathname }), { status: 404 });
  }
  return new Response(readFileSync(join(fixtures, fixture)), {
    headers: { "content-type": "application/json" },
  });
};

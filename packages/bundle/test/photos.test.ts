import { describe, expect, it } from "vitest";
import { encode } from "jpeg-js";
import { prepareDisplayImage } from "../src/photos.js";

describe("photo display preparation", () => {
  it("thumbnails large JPEGs so three images fit one Claude tool result", () => {
    const width = 900;
    const height = 700;
    const pixels = new Uint8Array(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      const pixel = i / 4;
      pixels[i] = (pixel * 17) % 256;
      pixels[i + 1] = (pixel * 31) % 256;
      pixels[i + 2] = (pixel * 47) % 256;
      pixels[i + 3] = 255;
    }
    const source = encode({ data: pixels, width, height }, 90).data;
    expect(source.byteLength).toBeGreaterThan(30_000);

    const image = prepareDisplayImage(source, "image/jpeg");

    expect(image).not.toBeNull();
    expect(image).toMatchObject({ type: "image", mimeType: "image/jpeg" });
    expect(Buffer.from(image!.data, "base64").byteLength).toBeLessThanOrEqual(30_000);
    expect(JSON.stringify({ content: [image, image, image] }).length).toBeLessThan(
      130_000,
    );
  });

  it("rejects content that is not a supported image", () => {
    expect(prepareDisplayImage(new TextEncoder().encode("<html>"), "text/html")).toBeNull();
  });
});

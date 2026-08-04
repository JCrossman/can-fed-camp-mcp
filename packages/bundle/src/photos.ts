import { decode, encode } from "jpeg-js";

const MAX_IMAGE_BYTES = 30_000;
const DISPLAY_SIZES = [640, 480, 360, 280, 220];
const JPEG_QUALITIES = [72, 65, 58, 50, 42];
const DISPLAY_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export type DisplayImage = {
  type: "image";
  data: string;
  mimeType: string;
};

export function prepareDisplayImage(
  bytes: Uint8Array,
  contentType: string,
): DisplayImage | null {
  const mimeType = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (!DISPLAY_MIME_TYPES.has(mimeType)) return null;

  if (bytes.byteLength <= MAX_IMAGE_BYTES) {
    return imageBlock(bytes, mimeType);
  }
  if (mimeType !== "image/jpeg") return null;

  try {
    const decoded = decode(bytes, {
      useTArray: true,
      formatAsRGBA: true,
      maxResolutionInMP: 20,
      maxMemoryUsageInMB: 96,
    });
    for (let i = 0; i < DISPLAY_SIZES.length; i += 1) {
      const resized = resizeRgba(
        decoded.data,
        decoded.width,
        decoded.height,
        DISPLAY_SIZES[i]!,
      );
      const jpeg = encode(resized, JPEG_QUALITIES[i]!).data;
      if (jpeg.byteLength <= MAX_IMAGE_BYTES) {
        return imageBlock(jpeg, "image/jpeg");
      }
    }
  } catch {
    return null;
  }
  return null;
}

function resizeRgba(
  source: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  maxDimension: number,
): { data: Uint8Array; width: number; height: number } {
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(sourceHeight - 1, Math.floor(y / scale));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor(x / scale));
      const sourceOffset = (sourceY * sourceWidth + sourceX) * 4;
      const targetOffset = (y * width + x) * 4;
      data[targetOffset] = source[sourceOffset]!;
      data[targetOffset + 1] = source[sourceOffset + 1]!;
      data[targetOffset + 2] = source[sourceOffset + 2]!;
      data[targetOffset + 3] = source[sourceOffset + 3]!;
    }
  }
  return { data, width, height };
}

function imageBlock(bytes: Uint8Array, mimeType: string): DisplayImage {
  return {
    type: "image",
    data: Buffer.from(bytes).toString("base64"),
    mimeType,
  };
}

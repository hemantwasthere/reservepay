export const MAX_IMAGE_BYTES = 256 * 1024;
export const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const types = ["image/jpeg", "image/png", "image/webp"];

export function validateSourceImage(file: { size: number; type: string }) {
  if (!types.includes(file.type))
    throw new Error("Choose a PNG, JPG or WebP image.");
  if (!file.size || file.size > MAX_SOURCE_BYTES)
    throw new Error("Choose an image smaller than 2 MB.");
}

// Only raster formats are accepted. Never allow SVG/HTML or trust a filename.
export function validateImageBytes(bytes: Uint8Array, type: string) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES)
    throw new Error("The optimized image must be smaller than 256 KB.");
  const starts = (...values: number[]) =>
    values.every((value, i) => bytes[i] === value);
  const ascii = (offset: number, value: string) =>
    [...value].every((char, i) => bytes[offset + i] === char.charCodeAt(0));
  const valid =
    type === "image/png"
      ? bytes.length >= 33 &&
        starts(137, 80, 78, 71, 13, 10, 26, 10) &&
        ascii(12, "IHDR")
      : type === "image/jpeg"
        ? bytes.length >= 4 &&
          starts(255, 216, 255) &&
          bytes.at(-2) === 255 &&
          bytes.at(-1) === 217
        : type === "image/webp"
          ? bytes.length >= 20 &&
            ascii(0, "RIFF") &&
            ascii(8, "WEBP") &&
            (ascii(12, "VP8 ") || ascii(12, "VP8L") || ascii(12, "VP8X"))
          : false;
  if (!valid) throw new Error("Choose a valid PNG, JPG or WebP image.");
}

export async function prepareMerchantImage(file: File): Promise<Blob> {
  validateSourceImage(file);
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("This image could not be opened. Choose another file.");
  });
  try {
    if (bitmap.width * bitmap.height > 16_000_000)
      throw new Error("Choose an image with fewer than 16 million pixels.");
    const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare this image.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(new Error("Could not prepare this image.")),
        "image/webp",
        0.85,
      ),
    );
    validateImageBytes(new Uint8Array(await blob.arrayBuffer()), blob.type);
    return blob;
  } finally {
    bitmap.close();
  }
}

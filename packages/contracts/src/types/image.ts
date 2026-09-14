/**
 * Image payloads arrive in two shapes: raw base64 (tool results) and full
 * data-URIs (some composers). Ollama requires raw base64; OpenAI-style APIs
 * require data-URIs. Each connector normalizes to its own wire format —
 * this is the shared "internal format is raw base64" contract, so a
 * data-URI leaking through history replay never reaches a connector.
 */
const DATA_URI_PREFIX = /^data:[^;,]+;base64,/;

export const asBase64Image = (image: string): string =>
  DATA_URI_PREFIX.test(image) ? image.replace(DATA_URI_PREFIX, "") : image;

export const asBase64Images = (images: string[]): string[] =>
  images.map(asBase64Image);

/** Inverse: wrap raw base64 in a data-URI for data-URI-native APIs. */
export const asDataUriImage = (image: string): string =>
  image.startsWith("data:") ? image : `data:image/png;base64,${image}`;

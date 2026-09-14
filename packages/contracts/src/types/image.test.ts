import { describe, expect, it } from "vitest";
import { asBase64Image, asBase64Images, asDataUriImage } from "./image.js";

describe("asBase64Image", () => {
  it("strips the data-URI prefix", () => {
    expect(asBase64Image("data:image/jpeg;base64,QUJD")).toBe("QUJD");
    expect(asBase64Image("data:image/png;base64,QUJD")).toBe("QUJD");
  });

  it("keeps raw base64 untouched", () => {
    expect(asBase64Image("QUJD")).toBe("QUJD");
  });

  it("handles base64 payloads containing data-URI lookalikes", () => {
    // A raw base64 string that happens to contain "data:" mid-payload must
    // not be touched — only the anchored prefix is stripped.
    expect(asBase64Image("ZGF0YTppbWFnZS9wbmc=")).toBe("ZGF0YTppbWFnZS9wbmc=");
  });
});

describe("asBase64Images", () => {
  it("normalizes a mixed batch", () => {
    expect(
      asBase64Images(["data:image/jpeg;base64,QQ==", "Qg=="]),
    ).toEqual(["QQ==", "Qg=="]);
  });
});

describe("asDataUriImage", () => {
  it("wraps raw base64 in a data-URI", () => {
    expect(asDataUriImage("QUJD")).toBe("data:image/png;base64,QUJD");
  });

  it("keeps existing data-URIs", () => {
    expect(asDataUriImage("data:image/jpeg;base64,QQ==")).toBe(
      "data:image/jpeg;base64,QQ==",
    );
  });
});
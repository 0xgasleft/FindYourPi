import { describe, expect, it } from "vitest";
import { convertNumber, convertAsciiDecimal, convertUtf8Bytes, convertHashDecimal } from "../src/conversion";

describe("convertNumber", () => {
  it("strips non-digit characters and concatenates", () => {
    expect(convertNumber("12/03/1995").sequence).toBe("12031995");
    expect(convertNumber("123456").sequence).toBe("123456");
    expect(convertNumber("(555) 867-5309").sequence).toBe("5558675309");
  });

  it("is deterministic", () => {
    expect(convertNumber("2001-09-11").sequence).toBe(convertNumber("2001-09-11").sequence);
  });
});

describe("convertAsciiDecimal", () => {
  it("matches the spec's worked example (A=65, B=66, C=67)", () => {
    expect(convertAsciiDecimal("ABC").sequence).toBe("065066067");
  });

  it("encodes SATOSHI deterministically", () => {
    const r1 = convertAsciiDecimal("SATOSHI");
    const r2 = convertAsciiDecimal("SATOSHI");
    expect(r1.sequence).toBe(r2.sequence);
    expect(r1.sequence.length).toBe(7 * 3);
  });

  it("rejects non-ASCII input", () => {
    expect(() => convertAsciiDecimal("café")).toThrow(RangeError);
  });
});

describe("convertUtf8Bytes", () => {
  it("encodes plain ASCII the same length as ascii mode", () => {
    expect(convertUtf8Bytes("ABC").sequence).toBe("065066067");
  });

  it("handles non-ASCII input without throwing", () => {
    expect(() => convertUtf8Bytes("café")).not.toThrow();
  });
});

describe("convertHashDecimal", () => {
  it("is deterministic for the same input", () => {
    expect(convertHashDecimal("ALICE").sequence).toBe(convertHashDecimal("ALICE").sequence);
  });

  it("produces different output for different input (avalanche)", () => {
    expect(convertHashDecimal("ALICE").sequence).not.toBe(convertHashDecimal("ALICE2").sequence);
  });

  it("keeps only the configured number of leading digits by default", () => {
    const r = convertHashDecimal("ALICE");
    expect(r.sequence.length).toBeLessThanOrEqual(10);
    expect(r.fullSequence.startsWith(r.sequence)).toBe(true);
  });
});

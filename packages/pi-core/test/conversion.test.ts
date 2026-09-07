import { describe, expect, it } from "vitest";
import { convertNumber, convertBase36Decimal, convertBase95Decimal, convertAsciiDecimal, convertUtf8Bytes, convertHashDecimal } from "../src/conversion";

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

describe("convertBase36Decimal", () => {
  it("reads the input as a standard base-36 integer plus a length sentinel (36^n + value)", () => {
    // a=10,b=11,c=12 -> value 13368; sentinel 36^3=46656 -> 60024
    expect(convertBase36Decimal("abc").sequence).toBe("60024");
    expect(convertBase36Decimal("0").sequence).toBe("36"); // 36^1 + 0
    expect(convertBase36Decimal("9").sequence).toBe("45"); // 36^1 + 9
    expect(convertBase36Decimal("z").sequence).toBe("71"); // 36^1 + 35
  });

  it("is denser than ASCII mode for the same plain-lowercase input", () => {
    const base36 = convertBase36Decimal("abc");
    const ascii = convertAsciiDecimal("abc");
    expect(base36.sequence.length).toBeLessThan(ascii.sequence.length);
  });

  it("the length sentinel prevents the classic leading-zero collision (\"0z\" vs \"z\" would otherwise both be 35)", () => {
    expect(convertBase36Decimal("0z").sequence).not.toBe(convertBase36Decimal("z").sequence);
    expect(convertBase36Decimal("0z").sequence).toBe("1331");
    expect(convertBase36Decimal("z").sequence).toBe("71");
  });

  it("is case-insensitive", () => {
    expect(convertBase36Decimal("ABC").sequence).toBe(convertBase36Decimal("abc").sequence);
  });

  it("is deterministic", () => {
    expect(convertBase36Decimal("SATOSHI").sequence).toBe(convertBase36Decimal("SATOSHI").sequence);
  });

  it("rejects characters outside a-z/0-9 (no spaces, punctuation, or Unicode)", () => {
    expect(() => convertBase36Decimal("café")).toThrow(RangeError);
    expect(() => convertBase36Decimal("hello!")).toThrow(RangeError);
    expect(() => convertBase36Decimal("hello world")).toThrow(RangeError);
  });
});

describe("convertBase95Decimal", () => {
  it("covers spaces and punctuation via printable ASCII's own ordering (digit = codePoint - 32)", () => {
    expect(convertBase95Decimal("a b").sequence).toBe("1444066");
    expect(convertBase95Decimal("Hello, World!").sequence).toBe("73345682722760675672065236");
  });

  it("is denser than ASCII mode for the same input", () => {
    const base95 = convertBase95Decimal("Hello, World!");
    const ascii = convertAsciiDecimal("Hello, World!");
    expect(base95.sequence.length).toBeLessThan(ascii.sequence.length);
  });

  it("is case-SENSITIVE, unlike base36 (preserves punctuation/spacing fidelity)", () => {
    expect(convertBase95Decimal("ABC").sequence).not.toBe(convertBase95Decimal("abc").sequence);
  });

  it("the length sentinel prevents the same leading-zero-digit collision as base36 (\" a\" vs \"a\" would otherwise collide)", () => {
    expect(convertBase95Decimal(" a").sequence).not.toBe(convertBase95Decimal("a").sequence);
    expect(convertBase95Decimal(" a").sequence).toBe("9090");
    expect(convertBase95Decimal("a").sequence).toBe("160");
  });

  it("is deterministic", () => {
    expect(convertBase95Decimal("I LOVE PI").sequence).toBe(convertBase95Decimal("I LOVE PI").sequence);
  });

  it("rejects non-printable-ASCII input (control characters, Unicode)", () => {
    expect(() => convertBase95Decimal("café")).toThrow(RangeError);
    expect(() => convertBase95Decimal("a\nb")).toThrow(RangeError);
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

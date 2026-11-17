import { Result } from "@praha/byethrow";
import { describe, expect, it } from "vite-plus/test";
import { decodeBase91, isBase91Alphabet } from "./base91";

const STANDARD_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_`{|}~"';

const TARGET_ALPHABET =
  '"YpkNETSPWljRQsiD14^uZ3Vva.f~bd!|F<*L`y]_g7Hx8BGO+we@}cX0UJ;9/K{M%)[>A=$2:n&o5#q?(h,I6Ctrzm';

const expectDecoded = (
  encoded: string,
  alphabet: string,
  expected: string,
): void => {
  expect(decodeBase91(encoded, alphabet)).toEqual(Result.succeed(expected));
};

describe("isBase91Alphabet", () => {
  it("returns true for 91 unique characters", () => {
    expect(isBase91Alphabet(STANDARD_ALPHABET)).toBe(true);
    expect(isBase91Alphabet(TARGET_ALPHABET)).toBe(true);
  });

  it("returns false for a wrong length or duplicated characters", () => {
    expect(isBase91Alphabet("abc")).toBe(false);
    expect(isBase91Alphabet(`${STANDARD_ALPHABET}a`)).toBe(false);
    expect(isBase91Alphabet(`${STANDARD_ALPHABET}a`.slice(0, 91))).toBe(true);
    expect(isBase91Alphabet("a".repeat(91))).toBe(false);
  });
});

describe("decodeBase91", () => {
  it("decodes an empty string", () => {
    expectDecoded("", STANDARD_ALPHABET, "");
  });

  it("decodes ASCII", () => {
    expectDecoded("#G(I", STANDARD_ALPHABET, "abc");
    expectDecoded('>OwJh>}A"=r@@Y?F', STANDARD_ALPHABET, "Hello, world!");
  });

  it("decodes UTF-8", () => {
    expectDecoded("V(z7dU/wEe?", STANDARD_ALPHABET, "日本語");
  });

  it("decodes index.target.js strings with the target alphabet", () => {
    expectDecoded(
      "X_dS+>YaG0F27+?.kNd!;5vp",
      TARGET_ALPHABET,
      "onStartAssetLoading",
    );
  });

  it("ignores characters that are not in the alphabet", () => {
    expectDecoded("\n#G(I\t", STANDARD_ALPHABET, "abc");
  });

  it("fails for an invalid alphabet", () => {
    expect(decodeBase91("abc", "abc")).toEqual(Result.fail("invalid alphabet"));
  });
});

import { Result } from "@praha/byethrow";

const BASE91_RADIX = 91;
const BASE91_MASK = 8191;
const BASE91_THRESHOLD = 88;

export type DecodeBase91Error = "invalid alphabet";

export const isBase91Alphabet = (value: string): boolean =>
  value.length === BASE91_RADIX && new Set(value).size === BASE91_RADIX;

/**
 * 標準的な base91 のデコード。
 * alphabet が 91 文字の重複なしでない場合だけ失敗する。
 * alphabet に含まれない文字は、元の実装と同様に読み飛ばす。
 */
export const decodeBase91 = (
  encoded: string,
  alphabet: string,
): Result.Result<string, DecodeBase91Error> => {
  if (!isBase91Alphabet(alphabet)) {
    return Result.fail("invalid alphabet");
  }

  const bytes: number[] = [];
  let value = -1;
  let buffer = 0;
  let bitCount = 0;

  for (let index = 0; index < encoded.length; index++) {
    const digit = alphabet.indexOf(encoded[index] ?? "");
    if (digit === -1) continue;

    if (value < 0) {
      value = digit;
      continue;
    }

    value += digit * BASE91_RADIX;
    buffer |= value << bitCount;
    bitCount += (value & BASE91_MASK) > BASE91_THRESHOLD ? 13 : 14;

    do {
      bytes.push(buffer & 255);
      buffer >>= 8;
      bitCount -= 8;
    } while (bitCount > 7);

    value = -1;
  }

  if (value > -1) {
    bytes.push((buffer | (value << bitCount)) & 255);
  }

  return Result.succeed(new TextDecoder().decode(Uint8Array.from(bytes)));
};

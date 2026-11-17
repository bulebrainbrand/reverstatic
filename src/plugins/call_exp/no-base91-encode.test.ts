import { pluginTester } from "babel-plugin-tester";
import noBase91Encode from "./no-base91-encode";

const STANDARD_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_`{|}~"';

const TARGET_ALPHABET =
  '"YpkNETSPWljRQsiD14^uZ3Vva.f~bd!|F<*L`y]_g7Hx8BGO+we@}cX0UJ;9/K{M%)[>A=$2:n&o5#q?(h,I6Ctrzm';

const decoderBody = (alphabet: string): string => `\
  let alphabet = ${JSON.stringify(alphabet)};
  let out = [];
  let bits = 0;
  let count = 0;
  let value = -1;
  for (let index = 0; index < _0.length; index++) {
    const digit = alphabet.indexOf(_0[index]);
    if (digit === -1) continue;
    if (value < 0) {
      value = digit;
    } else {
      value += digit * 91;
      bits |= value << count;
      count += (value & 8191) > 88 ? 13 : 14;
      do {
        out.push(bits & 255);
        bits >>= 8;
        count -= 8;
      } while (count > 7);
      value = -1;
    }
  }
  if (value > -1) out.push((bits | (value << count)) & 255);
  return utf8(out);
`;

const compactDecoder = (alphabet: string): string => `\
function decode(_0) {
  const alphabet = ${JSON.stringify(alphabet)};
  alphabet.indexOf("x");
  [91, 8191, 88, 13, 14];
  return utf8(0);
}
`;

const renamedCompactDecoder = (alphabet: string): string => `\
function __base91_decode_decode__(_0) {
  const alphabet =
    '${alphabet}';
  alphabet.indexOf("x");
  [91, 8191, 88, 13, 14];
  return __base91_utf8_utf8__(0);
}
`;

const utf8RenamedCompactDecoder = (alphabet: string): string => `\
function decode(_0) {
  const alphabet =
    '${alphabet}';
  alphabet.indexOf("x");
  [91, 8191, 88, 13, 14];
  return __base91_utf8_utf8__(0);
}
`;

const wrapperFunction = `\
function wrapper(_0) {
  return typeof cache[_0] === "undefined"
    ? (cache[_0] = decode(array[_0]))
    : cache[_0];
}
`;

const renamedWrapperFunction = `\
function __base91_wrapper_wrapper__(_0) {
  return typeof __base91_cache_cache__[_0] === "undefined"
    ? (__base91_cache_cache__[_0] = __base91_decode_decode__(
        __base91_array_array__[_0],
      ))
    : __base91_cache_cache__[_0];
}
`;

const renamedPrelude = `\
function __base91_utf8_utf8__(bytes) {
  return String.fromCharCode(...bytes);
}
`;

const prelude = `\
function utf8(bytes) {
  return String.fromCharCode(...bytes);
}
`;

pluginTester({
  plugin: noBase91Encode,
  pluginName: "no-base91-encode",
  tests: [
    {
      title: "直接呼び出しのデコーダを畳み込む",
      code: `${prelude}console.log((function (_0) {
${decoderBody(STANDARD_ALPHABET)}})("#G(I"));`,
      output: `${renamedPrelude}console.log("abc");`,
    },
    {
      title: "index.target.js のアルファベットで畳み込む",
      code: `${prelude}console.log((function (_0) {
${decoderBody(TARGET_ALPHABET)}})("X_dS+>YaG0F27+?.kNd!;5vp"));`,
      output: `${renamedPrelude}console.log("onStartAssetLoading");`,
    },
    {
      title: "配列の定数 index をデコーダへ渡す",
      code: `\
${prelude}const array = [";i@Ju)A"];
console.log((function (_0) {
${decoderBody(STANDARD_ALPHABET)}})(array[0]));`,
      output: `\
${renamedPrelude}const __base91_array_array__ = [";i@Ju)A"];
console.log("alpha");`,
    },
    {
      title: "キャッシュ付きラッパーを畳み込み、連結は畳み込まない",
      code: `\
${prelude}var cache, array;
array = [";i@Ju)A"];
cache = {};
${compactDecoder(STANDARD_ALPHABET)}${wrapperFunction}
console.log(wrapper(0) + "!");`,
      output: `\
${renamedPrelude}var __base91_cache_cache__, __base91_array_array__;
__base91_array_array__ = [";i@Ju)A"];
__base91_cache_cache__ = {};
${renamedCompactDecoder(STANDARD_ALPHABET)}${renamedWrapperFunction}console.log("alpha" + "!");`,
    },
    {
      title: "動的な index は畳み込まない",
      code: `\
${prelude}var cache, array;
array = [";i@Ju)A"];
cache = {};
${compactDecoder(STANDARD_ALPHABET)}${wrapperFunction}
console.log(wrapper(index));`,
      output: `\
${renamedPrelude}var __base91_cache_cache__, __base91_array_array__;
__base91_array_array__ = [";i@Ju)A"];
__base91_cache_cache__ = {};
${renamedCompactDecoder(STANDARD_ALPHABET)}${renamedWrapperFunction}console.log(__base91_wrapper_wrapper__(index));`,
    },
    {
      title: "配列が書き換えられる場合は畳み込まない",
      code: `\
${prelude}var cache, array;
array = [";i@Ju)A"];
cache = {};
${compactDecoder(STANDARD_ALPHABET)}${wrapperFunction}array[0] = "x";
console.log(wrapper(0));`,
      output: `\
${renamedPrelude}var cache, array;
array = [";i@Ju)A"];
cache = {};
${utf8RenamedCompactDecoder(STANDARD_ALPHABET)}${wrapperFunction}array[0] = "x";
console.log(wrapper(0));`,
    },
    {
      title: "分割代入で配列が書き換えられる場合は畳み込まない",
      code: `\
${prelude}var cache, array;
array = [";i@Ju)A"];
cache = {};
${compactDecoder(STANDARD_ALPHABET)}${wrapperFunction}[array[0]] = ["x"];
({ a: array[0] } = { a: "x" });
[...array[0]] = ["x"];
console.log(wrapper(0));`,
      output: `\
${renamedPrelude}var cache, array;
array = [";i@Ju)A"];
cache = {};
${utf8RenamedCompactDecoder(STANDARD_ALPHABET)}${wrapperFunction}[array[0]] = ["x"];
({ a: array[0] } = {
  a: "x",
});
[...array[0]] = ["x"];
console.log(wrapper(0));`,
    },
    {
      title: "配列の初期化より前の呼び出しは畳み込まない",
      code: `\
${prelude}var cache, array;
${compactDecoder(STANDARD_ALPHABET)}${wrapperFunction}
console.log(wrapper(0));
array = [";i@Ju)A"];
cache = {};`,
      output: `\
${renamedPrelude}var __base91_cache_cache__, __base91_array_array__;
${renamedCompactDecoder(STANDARD_ALPHABET)}${renamedWrapperFunction}console.log(__base91_wrapper_wrapper__(0));
__base91_array_array__ = [";i@Ju)A"];
__base91_cache_cache__ = {};`,
    },
    {
      title: "配列の要素に文字列以外がある場合は畳み込まない",
      code: `\
${prelude}var cache, array;
array = [";i@Ju)A", 1];
cache = {};
${compactDecoder(STANDARD_ALPHABET)}${wrapperFunction}
console.log(wrapper(0));`,
      output: `\
${renamedPrelude}var cache, array;
array = [";i@Ju)A", 1];
cache = {};
${utf8RenamedCompactDecoder(STANDARD_ALPHABET)}${wrapperFunction}console.log(wrapper(0));`,
    },
    {
      title: "base91 ではない関数は畳み込まない",
      code: `\
function decode(_0) {
  return _0;
}
console.log(decode("#G(I"));`,
      output: `\
function decode(_0) {
  return _0;
}
console.log(decode("#G(I"));`,
    },
  ],
});

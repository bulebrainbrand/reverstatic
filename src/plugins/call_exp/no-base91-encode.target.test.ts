import { transformSync } from "@babel/core";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import noBase91Encode from "./no-base91-encode";

const decodedValues = [
  "onStartAssetLoading",
  "Diorit",
  "getOwnPropertyDescriptor",
  "hardwa",
  "reConc",
  "urrenc",
  "Andesi",
  "Sandst",
  "one",
  "BABYLO",
  "Smooth",
  " Grani",
  "xProp",
  " Andes",
  "ite",
  "connec",
  "tedWeb",
  "socket",
  "Url",
  "getHttpUrlFromWebSocketUrl",
  "/image",
  ".png",
  "block",
  "retrie",
  "WiSdUK",
];

describe("no-base91-encode on index.target.js", () => {
  const source = readFileSync(
    new URL("../../../index.target.js", import.meta.url),
    "utf8",
  );
  const output = transformSync(source, {
    plugins: [noBase91Encode],
    configFile: false,
    babelrc: false,
    sourceType: "script",
    filename: "index.target.js",
  })?.code;
  if (output === undefined) throw new Error("failed to transform");

  it("復元した文字列を埋め込む", () => {
    for (const value of decodedValues) {
      expect(output).toContain(JSON.stringify(value));
    }
  });

  it("ラッパー呼び出しを残さない", () => {
    expect(output).not.toMatch(/\b(?:Kq|Sq|Lq)\((?:8[89]|9\d|10\d|11[0-2])\)/);
  });

  it("文字列連結は畳み込まない", () => {
    expect(output).toContain('"Diorit" + "e"');
  });

  it("base91 の関数・配列・キャッシュをリネームする", () => {
    expect(output).toContain("function __base91_decode_nq__(_0)");
    expect(output).toContain("function __base91_decode_bq__(_0)");
    expect(output).toContain("function __base91_wrapper_Kq__(_0)");
    expect(output).toContain("function __base91_wrapper_Sq__(_0)");
    expect(output).toContain("function __base91_wrapper_Lq__(_0)");
    expect(output).toContain("function __base91_utf8_xC__(_0)");
    expect(output).toContain("__base91_array_vC__ = [");
    expect(output).toContain("__base91_cache_Gq__ = {}");
  });

  it("ラッパー内の無名デコーダは変更しない", () => {
    expect(output).toContain("__base91_wrapper_Kq__(_0)");
    expect(output).toContain("function (_4)");
    expect(output).toContain("return function (_0)");
  });
});

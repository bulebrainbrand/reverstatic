import { pluginTester } from "babel-plugin-tester";
import noRestParameterAsVariable from "./no-rest-parameter-as-variable";

pluginTester({
  plugin: noRestParameterAsVariable,
  pluginName: "no-rest-parameter-as-variable",
  tests: [
    // 正: 基本 (文字列キー)
    {
      code: `function f(...r) {
  r["a"] = 1;
  return r["a"];
}`,
      output: `function f(...r) {
  let a;
  a = 1;
  return a;
}`,
    },
    // 正: 残余引数パターン(length保持・実引数読取保持・数値/負数キー)
    {
      code: `function f(...r) {
  r["length"] = 1;
  r["a"] = "x";
  r[246] = "" + (r[0] || "");
  r["c"] = r[246].length;
  for (r["h"] = 0; r["h"] < r["c"]; r["h"]++) {
    r["i"] = r["a"].indexOf(r[246][r["h"]]);
  }
  return r[246];
}`,
      output: `function f(...r) {
  let a, _246, c, h, i;
  r["length"] = 1;
  a = "x";
  _246 = "" + (r[0] || "");
  c = _246.length;
  for (h = 0; h < c; h++) {
    i = a.indexOf(_246[h]);
  }
  return _246;
}`,
    },
    // 正: ドットとブラケットの混在は同一変数に畳む
    {
      code: `const f = (...r) => {
  r.a = 1;
  r["a"] += 2;
  return r.a;
};`,
      output: `const f = (...r) => {
  let a;
  a = 1;
  a += 2;
  return a;
};`,
    },
    // 正: 負数キーと更新式
    {
      code: `function f(...r) {
  r[-185] = [];
  r[5] |= r[-79] << 1;
  r[5]++;
  return r[-185];
}`,
      output: `function f(...r) {
  let _neg185, _5, _neg79;
  _neg185 = [];
  _5 |= _neg79 << 1;
  _5++;
  return _neg185;
}`,
    },
    // 正: 通常引数との併用
    {
      code: `function f(a, ...r) {
  r["x"] = a;
  return r["x"];
}`,
      output: `function f(a, ...r) {
  let x;
  x = a;
  return x;
}`,
    },
    // 正: 衝突時はリネーム
    {
      code: `var a = 0;
function f(...r) {
  r["a"] = 1;
  return r["a"] + a;
}`,
      output: `var a = 0;
function f(...r) {
  let _a;
  _a = 1;
  return _a + a;
}`,
    },
    // 負: rest自体が値として漏れる
    {
      code: `function f(...r) {
  r["a"] = 1;
  return r;
}`,
      output: `function f(...r) {
  r["a"] = 1;
  return r;
}`,
    },
    // 負: restの再代入
    {
      code: `function f(...r) {
  r = [];
  r["a"] = 1;
}`,
      output: `function f(...r) {
  r = [];
  r["a"] = 1;
}`,
    },
    // 負: 動的キー
    {
      code: `function f(...r) {
  r[x] = 1;
}`,
      output: `function f(...r) {
  r[x] = 1;
}`,
    },
    // 負: restなし
    {
      code: `function f(a) {
  a = 1;
  return a;
}`,
      output: `function f(a) {
  a = 1;
  return a;
}`,
    },
    // 負: 書込みなし(純粋な参照のみ)
    {
      code: `function f(...r) {
  return r[0];
}`,
      output: `function f(...r) {
  return r[0];
}`,
    },
    // 負: 配列全体の観測メソッド
    {
      code: `function f(...r) {
  r["a"] = 1;
  return r.slice(0);
}`,
      output: `function f(...r) {
  r["a"] = 1;
  return r.slice(0);
}`,
    },
    // 負: length読取と数値書込みの併用
    {
      code: `function f(...r) {
  r[5] = 1;
  return r.length;
}`,
      output: `function f(...r) {
  r[5] = 1;
  return r.length;
}`,
    },
    // 負: delete
    {
      code: `function f(...r) {
  r["a"] = 1;
  delete r["a"];
}`,
      output: `function f(...r) {
  r["a"] = 1;
  delete r["a"];
}`,
    },
    // 負: プロトタイプ汚染キー
    {
      code: `function f(...r) {
  r["__proto__"] = 1;
}`,
      output: `function f(...r) {
  r["__proto__"] = 1;
}`,
    },
    {
      code: `function f(...r) {
  r["__defineGetter__"] = 1;
}`,
      output: `function f(...r) {
  r["__defineGetter__"] = 1;
}`,
    },
    {
      code: `function f(...r) {
  console.log(r[0]);
  r[0]=1;
}`,
      output: `function f(...r) {
  console.log(r[0]);
  r[0]=1;
}`,
    },
    {
      code: `function f(...r) {
  let x = r[0];
  return x;
}`,
      output: `function f(...r) {
  let x = r[0];
  return x;
}`,
    },
    {
      code: `function f(...r) {
  r[0]=1;
  r.length=0;
  return r[0];
}
`,
      output: `function f(...r) {
  r[0]=1;
  r.length=0;
  return r[0];
}`,
    },
  ],
});

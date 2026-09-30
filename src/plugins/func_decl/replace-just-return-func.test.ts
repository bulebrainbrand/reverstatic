import { pluginTester } from "babel-plugin-tester";
import replaceJustReturnFunc from "./replace-just-return-func";

pluginTester({
  plugin: replaceJustReturnFunc,
  pluginName: "replace-just-return-func",
  tests: [
    // 正: 単純な参照
    {
      code: `function id(a) { return a; }
var y = id(x);`,
      output: `function id(a) {
  return a;
}
var y = x;`,
    },
    // 正: 二項演算
    {
      code: `function add(a, b) { return a + b; }
var y = add(1, 2);`,
      output: `function add(a, b) {
  return a + b;
}
var y = 1 + 2;`,
    },
    // 正: グローバル参照(0引数)
    {
      code: `function getG() { return g; }
var y = getG();`,
      output: `function getG() {
  return g;
}
var y = g;`,
    },
    // 正: メンバ参照
    {
      code: `function getName(o) { return o.name; }
getName(user);`,
      output: `function getName(o) {
  return o.name;
}
user.name;`,
    },
    // 正: 非破壊メソッド
    {
      code: `function cut(s) { return s.slice(1); }
cut(str);`,
      output: `function cut(s) {
  return s.slice(1);
}
str.slice(1);`,
    },
    // 正: 非破壊メソッド + 引数置換
    {
      code: `function rep(s, a, b) { return s.replace(a, b); }
rep(str, x, y);`,
      output: `function rep(s, a, b) {
  return s.replace(a, b);
}
str.replace(x, y);`,
    },
    // 正: 条件式
    {
      code: `function pick(a, b, c) { return a ? b : c; }
pick(x, y, z);`,
      output: `function pick(a, b, c) {
  return a ? b : c;
}
x ? y : z;`,
    },
    // 正: 同一bindingの外側const参照
    {
      code: `const C = 1;
function useC(a) { return a + C; }
var y = useC(x);`,
      output: `const C = 1;
function useC(a) {
  return a + C;
}
var y = x + C;`,
    },
    // 正: 引数の重複使用(実引数が副作用なし)
    {
      code: `function dup(a) { return a + a; }
dup(x);`,
      output: `function dup(a) {
  return a + a;
}
x + x;`,
    },
    // 負: 引数過剰・不足はbail
    {
      code: `function add(a, b) { return a + b; }
add(1);`,
      output: `function add(a, b) {
  return a + b;
}
add(1);`,
    },
    {
      code: `function add(a, b) { return a + b; }
add(1, 2, 3);`,
      output: `function add(a, b) {
  return a + b;
}
add(1, 2, 3);`,
    },
    {
      code: `function id(a) { return a; }
id(...args);`,
      output: `function id(a) {
  return a;
}
id(...args);`,
    },
    // 負: 破壊的メソッド
    {
      code: `function pushIt(a) { return a.push(1); }
pushIt(arr);`,
      output: `function pushIt(a) {
  return a.push(1);
}
pushIt(arr);`,
    },
    // 負: 素呼び出し
    {
      code: `function wrap(a) { return foo(a); }
wrap(x);`,
      output: `function wrap(a) {
  return foo(a);
}
wrap(x);`,
    },
    // 負: closure変数のシャドーイング
    {
      code: `let c = 1;
function getC() { return c; }
{
  let c = 2;
  getC();
}`,
      output: `let c = 1;
function getC() {
  return c;
}
{
  let c = 2;
  getC();
}`,
    },
    // 負: this / arguments
    {
      code: `function getThis() { return this; }
getThis();`,
      output: `function getThis() {
  return this;
}
getThis();`,
    },
    {
      code: `function getArg(a) { return arguments[0]; }
getArg(x);`,
      output: `function getArg(a) {
  return arguments[0];
}
getArg(x);`,
    },
    // 負: 副作用引数の重複評価
    {
      code: `function dup(a) { return a + a; }
dup(foo());`,
      output: `function dup(a) {
  return a + a;
}
dup(foo());`,
    },
    // 負: 未使用引数の消失
    {
      code: `function constOne(a) { return 1; }
constOne(foo());`,
      output: `function constOne(a) {
  return 1;
}
constOne(foo());`,
    },
    // 負: 評価順の変化
    {
      code: `function sub(a, b) { return b - a; }
sub(foo(), bar());`,
      output: `function sub(a, b) {
  return b - a;
}
sub(foo(), bar());`,
    },
    // 負: Optional系は一律除外
    {
      code: `function getB(a) { return a?.b; }
getB(x);`,
      output: `function getB(a) {
  return a?.b;
}
getB(x);`,
    },
    {
      code: `function id(a) { return a; }
id?.(x);`,
      output: `function id(a) {
  return a;
}
id?.(x);`,
    },
    // 負: 代入・delete
    {
      code: `function setA(a) { return a = 1; }
setA(x);`,
      output: `function setA(a) {
  return (a = 1);
}
setA(x);`,
    },
    {
      code: `function del(a) { return delete a.b; }
del(x);`,
      output: `function del(a) {
  return delete a.b;
}
del(x);`,
    },
    // 負: 条件分岐・短絡評価での取りこぼし
    {
      code: `function pick(a, b, c) { return a ? b : c; }
pick(foo(), bar(), baz());`,
      output: `function pick(a, b, c) {
  return a ? b : c;
}
pick(foo(), bar(), baz());`,
    },
    {
      code: `function and(a, b) { return a && b; }
and(foo(), bar());`,
      output: `function and(a, b) {
  return a && b;
}
and(foo(), bar());`,
    },
    {
      code: `function or(a, b) { return a || b; }
or(foo(), bar());`,
      output: `function or(a, b) {
  return a || b;
}
or(foo(), bar());`,
    },
    {
      code: `function coal(a, b) { return a ?? b; }
coal(foo(), bar());`,
      output: `function coal(a, b) {
  return a ?? b;
}
coal(foo(), bar());`,
    },
    // 負: RegExpリテラルの複製
    {
      code: `function eq(a) { return a === a; }
eq(/x/);`,
      output: `function eq(a) {
  return a === a;
}
eq(/x/);`,
    },
    // 負: typeof param は ReferenceError を握りつぶす
    {
      code: `function t(a) { return typeof a; }
t(y);`,
      output: `function t(a) {
  return typeof a;
}
t(y);`,
    },
  ],
});

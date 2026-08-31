import { pluginTester } from "babel-plugin-tester";
import flatSeqContent from "./flat-stmt-seq-content";
pluginTester({
  plugin: flatSeqContent,
  pluginName: "flat-seq-content",
  tests: [
    { code: `console.log("foo");`, output: `console.log("foo");` },
    {
      code: `(a(),b(),c())`,
      output: `\
a();
b();
c();`,
    },
    {
      code: `(a = b,c = d)`,
      output: `\
a = b;
c = d;`,
    },
    {
      code: `("foo",42,a())`,
      output: `\
"foo";
42;
a();`,
    },
    {
      code: `(("foo","bar",piyo()),42,a())`,
      output: `\
"foo";
"bar";
piyo();
42;
a();`,
    },
    {
      code: `while (((a = b), (c = d))) { foo(); }`,
      output: `while (((a = b), (c = d))) {
  foo();
}`,
    },
    { code: `a(((b = c),(d = e)));`, output: `a(((b = c), (d = e)));` },
  ],
});

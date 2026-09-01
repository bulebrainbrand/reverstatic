import { pluginTester } from "babel-plugin-tester";
import flatForInForOfSeq from "./flat-for-in-for-of-seq";
pluginTester({
  plugin: flatForInForOfSeq,
  pluginName: "flat-for-infor-of-seq",
  tests: [
    { code: `console.log("foo");`, output: `console.log("foo");` },
    { code: `("foo","bar");`, output: `("foo", "bar");` },
    { code: `if(("foo","bar")){};`, output: `if (("foo", "bar")) {\n}` },
    {
      code: `for(const a of (b = 1,c = 2,d)){console.log(a)}`,
      output: `b = 1;
c = 2;
for (const a of d) {
  console.log(a);
}`,
    },
    {
      code: `for(const a of (b = c,d = b)){console.log(a);}`,
      output: `b = c;
for (const a of (d = b)) {
  console.log(a);
}`,
    },
    {
      code: `for(const a in (b = 1,c = 2,d)){console.log(a)}`,
      output: `b = 1;
c = 2;
for (const a in d) {
  console.log(a);
}`,
    },
    {
      code: `for(const a in (b = c,d = b)){console.log(a);}`,
      output: `b = c;
for (const a in (d = b)) {
  console.log(a);
}`,
    },
    { code: `const x = (foo(), bar);`, output: `const x = (foo(), bar);` },
    {
      code: `for(const a of (b = 1,c = 2,d = 3,e)){console.log(a)}`,
      output: `b = 1;
c = 2;
d = 3;
for (const a of e) {
  console.log(a);
}`,
    },
    {
      code: `for(const [a,b] of (foo(), bar)){console.log(a,b)}`,
      output: `foo();
for (const [a, b] of bar) {
  console.log(a, b);
}`,
    },
    {
      code: `for(const {x} of (foo(), bar)){console.log(x)}`,
      output: `foo();
for (const { x } of bar) {
  console.log(x);
}`,
    },
    {
      code: `while ((a = b, c = d)) { foo(); }`,
      output: `while (((a = b), (c = d))) {
  foo();
}`,
    },
  ],
});
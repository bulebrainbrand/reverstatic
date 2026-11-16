import { pluginTester } from "babel-plugin-tester";
import flatIfSeq from "./flat-if-seq";
pluginTester({
  plugin: flatIfSeq,
  pluginName: "flat-if-seq",
  tests: [
    { code: `console.log("foo");`, output: `console.log("foo");` },
    {
      code: `if ((a = 1, b(), c)) foo();`,
      output: `\
a = 1;
b();
if (c) foo();`,
    },
    {
      code: `if ((a = 1, b(), c)) {
  foo();
} else {
  bar();
}`,
      output: `\
a = 1;
b();
if (c) {
  foo();
} else {
  bar();
}`,
    },
    {
      code: `if (x) foo(); else if ((a(), b())) bar(); else baz();`,
      output: `\
if (x) foo();
else {
  a();
  if (b()) bar();
  else baz();
}`,
    },
    {
      code: `if (x) if ((a(), b())) foo(); else bar();`,
      output: `\
if (x) {
  a();
  if (b()) foo();
  else bar();
}`,
    },
    {
      code: `while (x) if ((a(), b())) foo();`,
      output: `\
while (x) {
  a();
  if (b()) foo();
}`,
    },
    {
      code: `l: if ((a(), b())) {
  break l;
}`,
      output: `\
a();
l: if (b()) {
  break l;
}`,
    },
  ],
});

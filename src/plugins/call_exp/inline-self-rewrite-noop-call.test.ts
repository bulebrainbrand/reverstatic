import { pluginTester } from "babel-plugin-tester";
import inlineSelfRewriteNoopCall from "./inline-self-rewrite-noop-call";

pluginTester({
  plugin: inlineSelfRewriteNoopCall,
  pluginName: "inline-self-rewrite-noop-call",
  tests: [
    { code: `console.log("foo");`, output: `console.log("foo");` },
    {
      code: `function UpSCOg0() { UpSCOg0 = function () {}; }
UpSCOg0(a, b, c);`,
      output: `function UpSCOg0() {
  UpSCOg0 = function () {};
}
a;
b;
c;`,
    },
    {
      code: `function UpSCOg0() { UpSCOg0 = function () {}; }
var fJPFK4;
var CjslJAo;
UpSCOg0(fJPFK4 = "" + (cr30Nj || ""), CjslJAo = fJPFK4.length);`,
      output: `function UpSCOg0() {
  UpSCOg0 = function () {};
}
var fJPFK4;
var CjslJAo;
fJPFK4 = "" + (cr30Nj || "");
CjslJAo = fJPFK4.length;`,
    },
    {
      code: `function UpSCOg0() { UpSCOg0 = function () {}; }
UpSCOg0(a);`,
      output: `function UpSCOg0() {
  UpSCOg0 = function () {};
}
a;`,
    },
    {
      code: `function UpSCOg0() { UpSCOg0 = function () {}; }
UpSCOg0();`,
      output: `function UpSCOg0() {
  UpSCOg0 = function () {};
}`,
    },
    {
      code: `function UpSCOg0() { UpSCOg0 = () => {}; }
UpSCOg0(a, b);`,
      output: `function UpSCOg0() {
  UpSCOg0 = () => {};
}
a;
b;`,
    },
    {
      code: `function UpSCOg0() { UpSCOg0 = function () {}; }
UpSCOg0(a, b);
UpSCOg0(c);`,
      output: `function UpSCOg0() {
  UpSCOg0 = function () {};
}
a;
b;
c;`,
    },
    {
      code: `function foo() { bar(); }
foo(a, b);`,
      output: `function foo() {
  bar();
}
foo(a, b);`,
    },
    {
      code: `function UpSCOg0() { UpSCOg0 = function () { doX(); }; }
UpSCOg0(a, b);`,
      output: `function UpSCOg0() {
  UpSCOg0 = function () {
    doX();
  };
}
UpSCOg0(a, b);`,
    },
    {
      code: `function UpSCOg0(a) { UpSCOg0 = function () {}; }
UpSCOg0(b, c);`,
      output: `function UpSCOg0(a) {
  UpSCOg0 = function () {};
}
UpSCOg0(b, c);`,
    },
    {
      code: `function UpSCOg0() { UpSCOg0 = function () {}; }
var y = UpSCOg0(a, b);`,
      output: `function UpSCOg0() {
  UpSCOg0 = function () {};
}
var y = UpSCOg0(a, b);`,
    },
    {
      code: `function UpSCOg0() { UpSCOg0 = function () {}; }
if (UpSCOg0(a)) { b(); }`,
      output: `function UpSCOg0() {
  UpSCOg0 = function () {};
}
if (UpSCOg0(a)) {
  b();
}`,
    },
    {
      code: `function UpSCOg0() { UpSCOg0 = function () {}; }
UpSCOg0?.(a, b);`,
      output: `function UpSCOg0() {
  UpSCOg0 = function () {};
}
UpSCOg0?.(a, b);`,
    },
    {
      code: `function UpSCOg0() { UpSCOg0 = function () {}; }
UpSCOg0(...a);`,
      output: `function UpSCOg0() {
  UpSCOg0 = function () {};
}
UpSCOg0(...a);`,
    },
  ],
});

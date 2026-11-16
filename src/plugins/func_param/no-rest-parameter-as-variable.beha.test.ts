import { expectDifferenceBehavior } from "#tests/expectBehavior.ts";

import noRestParameterAsVariable from "./no-rest-parameter-as-variable";

expectDifferenceBehavior({
  plugin: noRestParameterAsVariable,
  pluginName: "no-rest-parameter-as-variable",
  tests: [
    {
      title: "function length will change without any checks",
      input: `\
function fn(...r) {
  return [r[0],r[1]];
}
console.log(fn.length);
`,
      inputLog: [[0]],
      output: `\
function fn(_0, _1) {
  return [_0, _1];
}
console.log(fn.length);`,
      outputLog: [[2]],
    },
    {
      title: "rest parameter function `this` will change without any checks",
      input: `\
function fn(...r) {
  r[0]();
}
fn(function () {
  console.log(this?.[1]);
}, "foo");
`,
      inputLog: [["foo"]],
      output: `\
function fn(_0) {
  _0();
}
fn(function () {
  console.log(this?.[1]);
}, "foo");`,
      outputLog: [[undefined]],
    },
    {
      input: `\
function fn(...r) {
  g();
  r[0] = 1;
  function g() {
    console.log(r[0]);
  }
}
fn("foo")`,
      inputLog: [["foo"]],
      output: `\
function fn() {
  let _0;
  g();
  _0 = 1;
  function g() {
    console.log(_0);
  }
}
fn("foo");`,
      outputLog: [[undefined]],
    },
    {
      input: `\
Array.prototype[0] = "foo";
function fn(...r) {
  return r[0];
}
console.log(fn());
`,
      inputLog: [["foo"]],
      output: `\
Array.prototype[0] = "foo";
function fn(_0) {
  return _0;
}
console.log(fn());`,
      outputLog: [[undefined]],
    },
  ],
});

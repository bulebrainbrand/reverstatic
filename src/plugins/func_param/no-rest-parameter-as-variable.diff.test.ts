import { expectDifferenceBehavior } from "#tests/expectDifferenceBehavior.ts";

import noRestParameterAsVariable from "./no-rest-parameter-as-variable";

expectDifferenceBehavior({
  plugin: noRestParameterAsVariable,
  pluginName: "no-rest-parameter-as-variable",
  tests: [
    {
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
  ],
});

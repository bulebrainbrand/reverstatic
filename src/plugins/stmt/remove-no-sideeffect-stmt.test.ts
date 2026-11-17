import { pluginTester } from "babel-plugin-tester";
import removeNoSideEffectStatement from "./remove-no-sideeffect-statement";

pluginTester({
  plugin: removeNoSideEffectStatement,
  pluginName: "remove-no-sideeffect-statement",
  tests: [
    { code: `1;`, output: `` },
    { code: `foo;`, output: `` },
    { code: `undefined;`, output: `` },
    { code: "`foo`;", output: `` },
    { code: `foo(); "bar";`, output: `foo();` },
    { code: "`foo${bar}`;", output: "`foo${bar}`;" },
    { code: `foo();`, output: `foo();` },
    { code: `a = 1;`, output: `a = 1;` },
    { code: `const a = 1; a;`, output: `const a = 1;` },
    {
      code: `if (x) 1; else foo();`,
      output: `if (x) {
} else foo();`,
    },
    { code: `while (x) 1;`, output: `while (x) {}` },
    { code: `"use strict"; foo;`, output: `"use strict";` },
    {
      code: `function f() { "use strict"; 1; }`,
      output: `function f() {
  "use strict";
}`,
    },
  ],
});

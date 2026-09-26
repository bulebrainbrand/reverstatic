import { pluginTester } from "babel-plugin-tester";
import noConstantArray from "./no-constatnt-array";

pluginTester({
  plugin: noConstantArray,
  pluginName: "no-constatnt-array",
  tests: [
    { code: `console.log("foo");`, output: `console.log("foo");` },
    {
      code: `const a = [10, 20, 30];\nconsole.log(a[0]);`,
      output: `const a = [10, 20, 30];\nconsole.log(10);`,
    },
    {
      code: `const a = [10, 20, 30];\nconsole.log(a[0] + a[2]);`,
      output: `const a = [10, 20, 30];\nconsole.log(10 + 30);`,
    },
    {
      code: `let a = [1, 2];\nconsole.log(a[1]);`,
      output: `let a = [1, 2];\nconsole.log(2);`,
    },
    {
      code: `var a = [1, 2];\nconsole.log(a[1]);`,
      output: `var a = [1, 2];\nconsole.log(2);`,
    },
    {
      code: `const a = ["x", true, null];\nconsole.log(a[0], a[1], a[2]);`,
      output: `const a = ["x", true, null];\nconsole.log("x", true, null);`,
    },
    // index以外の読み取りがある場合は対象外
    {
      code: `const a = [10, 20];\nconsole.log(a);`,
      output: `const a = [10, 20];\nconsole.log(a);`,
    },
    {
      code: `const a = [10, 20];\nconsole.log(a.length);`,
      output: `const a = [10, 20];\nconsole.log(a.length);`,
    },
    {
      code: `const a = [10, 20];\nconsole.log(a[0], a);`,
      output: `const a = [10, 20];\nconsole.log(a[0], a);`,
    },
    // 変数での読み取りがある場合は対象外
    {
      code: `const a = [10, 20];\nconst i = 0;\nconsole.log(a[i]);`,
      output: `const a = [10, 20];\nconst i = 0;\nconsole.log(a[i]);`,
    },
    {
      code: `const a = [10, 20];\nconsole.log(a["0"]);`,
      output: `const a = [10, 20];\nconsole.log(a["0"]);`,
    },
    // 変更されている場合は対象外
    {
      code: `const a = [10, 20];\na[0] = 99;\nconsole.log(a[0]);`,
      output: `const a = [10, 20];\na[0] = 99;\nconsole.log(a[0]);`,
    },
    {
      code: `const a = [10, 20];\na.push(30);\nconsole.log(a[0]);`,
      output: `const a = [10, 20];\na.push(30);\nconsole.log(a[0]);`,
    },
    {
      code: `let a = [10, 20];\na = [30, 40];\nconsole.log(a[0]);`,
      output: `let a = [10, 20];\na = [30, 40];\nconsole.log(a[0]);`,
    },
    {
      code: `const a = [10, 20];\ndelete a[0];\nconsole.log(a[0]);`,
      output: `const a = [10, 20];\ndelete a[0];\nconsole.log(a[0]);`,
    },
    {
      code: `const a = [10, 20];\na[0]++;\nconsole.log(a[0]);`,
      output: `const a = [10, 20];\na[0]++;\nconsole.log(a[0]);`,
    },
    // 要素にIdentifierが含まれる場合は対象外
    {
      code: `const b = 1;\nconst a = [b, 2];\nconsole.log(a[1]);`,
      output: `const b = 1;\nconst a = [b, 2];\nconsole.log(a[1]);`,
    },
    {
      code: `const a = [foo(), 2];\nconsole.log(a[1]);`,
      output: `const a = [foo(), 2];\nconsole.log(a[1]);`,
    },
    {
      code: `const a = [...b];\nconsole.log(a[0]);`,
      output: `const a = [...b];\nconsole.log(a[0]);`,
    },
    {
      code: `const a = [10, 20];\nconsole.log(a[5]);`,
      output: `const a = [10, 20];\nconsole.log(a[5]);`,
    },
  ],
});

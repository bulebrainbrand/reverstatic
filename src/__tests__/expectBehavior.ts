// oxlint-disable no-eval
import { transformSync, type InputOptions, type PluginItem } from "@babel/core";
import { describe, expect, it } from "vite-plus/test";
import vm from "node:vm";
const evalCode = (code: string): unknown[] => {
  let log: unknown[] = [];
  vm.runInNewContext(code, {
    console: {
      log: (...obj: unknown[]) => {
        log.push(obj);
      },
    },
  });
  return log;
};
export const expectDifferenceBehavior = ({
  plugin,
  pluginName,
  tests,
}: {
  tests: ({
    input: string;
    inputLog: unknown[];
    output: string;
    outputLog: unknown[];
    title?: string;
  } & InputOptions)[];
  plugin: PluginItem;
  pluginName: string;
}) => {
  describe(pluginName, () => {
    for (const {
      input,
      inputLog,
      output,
      outputLog,
      title,
      ...options
    } of tests) {
      it(title ?? pluginName, () => {
        const outputCode = transformSync(input, {
          plugins: [plugin],
          ...options,
          configFile: false,
          babelrc: false,
        });
        expect(evalCode(input)).toEqual(inputLog);
        expect(outputCode?.code).toEqual(output);
        expect(evalCode(output)).toEqual(outputLog);
      });
    }
  });
};

export const expectSameBehavior = ({
  plugin,
  pluginName,
  tests,
}: {
  tests: ({
    input: string;
    log: unknown[];
    output: string;
    title?: string;
  } & InputOptions)[];
  plugin: PluginItem;
  pluginName: string;
}) => {
  describe(pluginName, () => {
    for (const { input, log, output, title, ...options } of tests) {
      it(title ?? pluginName, () => {
        const outputCode = transformSync(input, {
          plugins: [plugin],
          ...options,
          configFile: false,
          babelrc: false,
        });
        expect(evalCode(input)).toEqual(log);
        expect(outputCode?.code).toEqual(output);
        expect(evalCode(output)).toEqual(log);
      });
    }
  });
};

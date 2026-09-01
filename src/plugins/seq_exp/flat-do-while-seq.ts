import { type PluginObject, PluginPass } from "@babel/core";
import * as t from "@babel/types";
export default function (): PluginObject<PluginPass> {
  return {
    visitor: {
      SequenceExpression(path) {
        return;
      },
    },
  };
}

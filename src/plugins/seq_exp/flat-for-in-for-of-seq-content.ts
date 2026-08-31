import { type PluginObject, PluginPass } from "@babel/core";
import * as t from "@babel/types";
import { isTruhy } from "../../utils/isTrushy";
import { Result } from "@praha/byethrow";
export default function (): PluginObject<PluginPass> {
  return {
    visitor: {
      SequenceExpression(path) {
        return;
      },
    },
  };
}

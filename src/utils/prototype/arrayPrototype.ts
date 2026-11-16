// TODO: キー名を文字列で列挙して実行環境での差をなくす

import { OBJECT_VARIABLE_PROTOTYPE_NAME } from "./objectPrototype";

export const ARRAY_PROTOTYPE_NAME = new Set(
  Object.getOwnPropertyNames(Array.prototype),
);
export const ARRAY_VARIABLE_PROTOTYPE_NAME = ARRAY_PROTOTYPE_NAME.union(
  OBJECT_VARIABLE_PROTOTYPE_NAME,
);

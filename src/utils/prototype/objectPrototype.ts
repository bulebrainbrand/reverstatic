// TODO: キー名を文字列で列挙して実行環境での差をなくす

import { INTERNAL_PROTOTYPE_KEYS } from "./internalPrototypeKey";

export const OBJECT_PROTOTYPE_NAME = new Set(
  Object.getOwnPropertyNames(Object.prototype),
);

export const OBJECT_VARIABLE_PROTOTYPE_NAME = OBJECT_PROTOTYPE_NAME.union(
  INTERNAL_PROTOTYPE_KEYS,
);

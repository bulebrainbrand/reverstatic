import { RESERVED_VARIABLE_NAME } from "./reservedVariableName";

export const isValidName = (name: string): boolean =>
  /^[A-Za-z_$][\w$]*$/.test(name) && !RESERVED_VARIABLE_NAME.has(name);

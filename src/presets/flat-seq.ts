import type { PresetObject } from "@babel/core";
import flatDoWhileSeq from "../plugins/seq_exp/flat-do-while-seq";
import flatForInForOfSeq from "../plugins/seq_exp/flat-for-in-for-of-seq";
import flatIfSeq from "../plugins/seq_exp/flat-if-seq";
import flatReturnSeq from "../plugins/seq_exp/flat-return-seq";
import flatStmtSeq from "../plugins/seq_exp/flat-stmt-seq";

export default function (): PresetObject {
  return {
    plugins: [
      flatDoWhileSeq,
      flatForInForOfSeq,
      flatIfSeq,
      flatReturnSeq,
      flatStmtSeq,
    ],
  };
}

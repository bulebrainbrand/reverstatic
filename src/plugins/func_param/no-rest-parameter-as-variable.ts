import type { NodePath, PluginObject } from "@babel/core";
import * as t from "@babel/types";

// 残余引数(...r)を連想配列として使い回す難読化を、通常のローカル変数(let)へ戻す。
//   function f(...r) { r["a"] = 1; return r["a"]; }
//   -> function f(...r) { let a; a = 1; return a; }
//
// 方針:
//  - r が値として漏れる / 動的キー / delete / メソッド呼び出し等があれば関数ごと諦める
//  - 非数値キーは `let name;` に置換 (実引数には存在し得ないので初期値は常に undefined)
//  - 非負整数キーは書込みがあるものだけ変換し、`let _0 = r[0];` と実引数を取り込む。
//    これで「読取が書込みより先か」という実行順の解析が不要になる
//  - 変換した数値キーがある場合、r.length の参照は意味が変わるため諦める

// let 宣言名として使えない名前
const RESERVED = new Set([
  "arguments",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "eval",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
  "undefined",
  "NaN",
  "Infinity",
]);

// 非数値キーでも、変数化すると「読取結果」が変わるキー (Array / Object のプロトタイプ由来)。
// 実行環境のプロトタイプから動的に集める (手書きだと findLast 等が漏れる)。
const PROTO_KEYS = new Set(
  [
    ...Object.getOwnPropertyNames(Array.prototype),
    ...Object.getOwnPropertyNames(Object.prototype),
    "__proto__",
    "prototype",
  ].filter((key) => key !== "length"),
);

const isValidName = (name: string): boolean =>
  /^[A-Za-z_$][\w$]*$/.test(name) && !RESERVED.has(name);

const sanitize = (key: string): string => {
  if (isValidName(key)) {
    return key;
  }
  let name = key.replace(/^-/, "_neg").replace(/[^\w$]/g, "_");
  if (/^[0-9]/.test(name)) {
    name = `_${name}`;
  }
  return isValidName(name) ? name : `_${name}`;
};

const isArrayIndex = (key: string): boolean =>
  /^(0|[1-9][0-9]*)$/.test(key) && Number(key) < 2 ** 32 - 1;

// r[...] / r.foo を静的なキー文字列にする。解決できなければ undefined。
const staticKey = (member: t.MemberExpression): string | undefined => {
  const property = member.property;
  if (!member.computed) {
    return t.isIdentifier(property) ? property.name : undefined;
  }
  if (t.isStringLiteral(property)) {
    return property.value;
  }
  if (t.isNumericLiteral(property)) {
    return String(property.value);
  }
  if (t.isTemplateLiteral(property) && property.expressions.length === 0) {
    return property.quasis[0]?.value.cooked ?? undefined;
  }
  if (
    t.isUnaryExpression(property, { operator: "-" }) &&
    t.isNumericLiteral(property.argument)
  ) {
    return String(-property.argument.value); // -0 -> "0"
  }
  return undefined;
};

type Kind = "read" | "write" | "readwrite";

// メンバー式の使われ方。変数化できない使われ方は "unsupported"。
const classify = (
  member: NodePath<t.MemberExpression>,
): Kind | "unsupported" => {
  const parent = member.parentPath;
  const node = member.node;
  if (!parent) {
    return "unsupported";
  }
  if (parent.isAssignmentExpression({ left: node })) {
    return parent.node.operator === "=" ? "write" : "readwrite";
  }
  if (parent.isUpdateExpression()) {
    return "readwrite";
  }
  // delete は変数化できない
  if (parent.isUnaryExpression({ operator: "delete" })) {
    return "unsupported";
  }
  // r.f() は this === r で呼ばれる。変数化すると this が変わる
  if (
    (parent.isCallExpression() || parent.isOptionalCallExpression()) &&
    parent.node.callee === node
  ) {
    return "unsupported";
  }
  if (parent.isTaggedTemplateExpression({ tag: node })) {
    return "unsupported";
  }
  if (parent.isForXStatement({ left: node })) {
    return "write";
  }
  // 分割代入の書込み先
  if (
    parent.isArrayPattern() ||
    parent.isRestElement({ argument: node }) ||
    parent.isAssignmentPattern({ left: node })
  ) {
    return "write";
  }
  if (
    parent.isObjectProperty({ value: node }) &&
    parent.parentPath.isObjectPattern()
  ) {
    return "write";
  }
  return "read";
};

type Access = {
  path: NodePath<t.MemberExpression>;
  key: string;
  kind: Kind;
};

export default function (): PluginObject {
  return {
    visitor: {
      Function(funcPath) {
        const params = funcPath.node.params;
        const last = params[params.length - 1];
        if (!last || !t.isRestElement(last) || !t.isIdentifier(last.argument)) {
          return;
        }
        const restName = last.argument.name;

        const body = funcPath.get("body");
        if (Array.isArray(body) || !body.isBlockStatement()) {
          return; // 式ボディのアロー関数には let を挿入できない
        }

        const binding = funcPath.scope.getBinding(restName);
        if (
          !binding ||
          binding.constantViolations.length > 0 ||
          binding.referencePaths.length === 0
        ) {
          return;
        }

        // 直接 eval / with があると変数が動的に参照されうる
        let dynamicScope = false;
        funcPath.traverse({
          WithStatement(path) {
            dynamicScope = true;
            path.stop();
          },
          CallExpression(path) {
            if (t.isIdentifier(path.node.callee, { name: "eval" })) {
              dynamicScope = true;
              path.stop();
            }
          },
        });
        if (dynamicScope) {
          return;
        }

        // 1. r の全参照を集める。1つでも想定外なら関数ごと諦める
        const accesses: Access[] = [];
        for (const ref of binding.referencePaths) {
          const member = ref.parentPath;
          // r?.a (Optional) / foo(r) / x[r] などはここで弾かれる
          if (
            !member?.isMemberExpression() ||
            member.node.object !== ref.node
          ) {
            return;
          }
          const key = staticKey(member.node);
          if (key === undefined) {
            return;
          }
          if (PROTO_KEYS.has(key)) {
            return;
          }
          const kind = classify(member);
          if (kind === "unsupported") {
            return;
          }
          accesses.push({ path: member, key, kind });
        }

        const lengthAccessed = accesses.some((a) => a.key === "length");
        const props = accesses.filter((a) => a.key !== "length");

        // 2. 変換対象のキーを決める (key -> 数値インデックスか)
        const written = new Set(
          props.filter((a) => a.kind !== "read").map((a) => a.key),
        );
        if (written.size === 0) {
          return;
        }
        const convert = new Map<string, boolean>();
        for (const { key } of props) {
          const numeric = isArrayIndex(key);
          // 書込みのない非負整数の読取は実引数そのものなので触らない
          if (numeric && !written.has(key)) {
            continue;
          }
          convert.set(key, numeric);
        }
        // 数値キーを変数化すると r 本体が更新されず、length の観測がずれる
        if (lengthAccessed && [...convert.values()].some(Boolean)) {
          return;
        }

        // 3. 変数名を決める。衝突相手: r、外側/グローバル、使用箇所に見える内側の宣言
        const scope = funcPath.scope;
        const useScopes = new Set(accesses.map((a) => a.path.scope));
        const chosen = new Set<string>();
        const conflicts = (name: string): boolean =>
          chosen.has(name) ||
          name === restName ||
          scope.hasBinding(name) ||
          scope.hasGlobal(name) ||
          [...useScopes].some((s) => s.hasBinding(name));

        const names = new Map<string, string>();
        const declarators: t.VariableDeclarator[] = [];
        for (const [key, numeric] of convert) {
          let name = sanitize(key);
          if (conflicts(name)) {
            name = scope.generateUid(name);
          }
          chosen.add(name);
          names.set(key, name);
          declarators.push(
            t.variableDeclarator(
              t.identifier(name),
              numeric
                ? t.memberExpression(
                    t.identifier(restName),
                    t.numericLiteral(Number(key)),
                    true,
                  )
                : null,
            ),
          );
        }

        // 4. 宣言を先頭に挿入し、アクセスを識別子へ置換
        body.unshiftContainer(
          "body",
          t.variableDeclaration("let", declarators),
        );
        for (const access of accesses) {
          const name = names.get(access.key);
          if (name !== undefined) {
            access.path.replaceWith(t.identifier(name));
          }
        }
        scope.crawl();
      },
    },
  };
}

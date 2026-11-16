import type { NodePath, PluginObject } from "@babel/core";
import * as t from "@babel/types";
import { Binding } from "@babel/traverse";
import { isWithin } from "../../utils/isWithin";
import { hasDynamicScope } from "../../utils/hasDynamicScope";
import { isValidName } from "../../utils/name/isValidName";
import { ARRAY_VARIABLE_PROTOTYPE_NAME } from "../../utils/prototype/arrayPrototype";

// 残余引数(...r)を連想配列として使い回す難読化を、通常のローカル変数(let)へ戻す。
//   function f(...r) { r["a"] = 1; return r["a"]; }
//   -> function f(...r) { let a; a = 1; return a; }
//
// 方針:
//  - r が値として漏れる / 動的キー / delete / タグ付きテンプレート等があれば関数ごと諦める
//  - r[k]() は変数化する。this は r から undefined に変わるため、呼び出し先が this に
//    依存しない前提で変換する (難読化解除用途)
//  - 非数値キーは `let name;` に置換 (実引数には存在し得ないので初期値は常に undefined)
//  - 引数由来の初期値が必要な数値キーが 0..N-1 に連続していれば、rest を通常の
//    仮引数 `_0, _1, ...` に置換し、`...r` を削除する。index が飛んでいる場合は
//    通常引数化せず、rest を残したまま `let _0 = r[0];` として実引数を取り込む
//  - 最初のアクセスが関数直下の `r[k] = ...;` である数値キーは、書込み前に読まれない
//    ため実引数を取り込まない。`r[k] = r[k] + 1` のように同じ文で読む場合は取り込む
//  - 変換した数値キーがある場合、r.length の参照は意味が変わるため諦める。
//    ただし関数先頭に連続して並ぶ `r.length = N;` (N は非負整数リテラル) だけは許可し、
//    入口で切詰め済みとして扱う (N 以上の数値キーは初期値 undefined、未満は実引数を取り込む)
//  - rest を通常引数へ置換できる場合、先頭の `r.length = N;` は不要なので削除する

// 非数値キーでも、変数化すると「読取結果」が変わるキー (Array / Object のプロトタイプ由来)。
const PROTO_KEYS = ARRAY_VARIABLE_PROTOTYPE_NAME.difference(
  new Set(["length"]),
);

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

type LeadingLengthWrite = {
  statement: t.Statement;
  left: t.MemberExpression;
  value: number;
};

// 関数先頭に置かれた `r.length = N;` (N は非負整数リテラル) を認識する。
const leadingLengthWrite = (
  stmt: t.Statement,
  restName: string,
): LeadingLengthWrite | undefined => {
  if (!t.isExpressionStatement(stmt)) {
    return undefined;
  }
  const expression = stmt.expression;
  if (
    !t.isAssignmentExpression(expression, { operator: "=" }) ||
    !t.isMemberExpression(expression.left) ||
    !t.isIdentifier(expression.left.object, { name: restName }) ||
    staticKey(expression.left) !== "length" ||
    !t.isNumericLiteral(expression.right) ||
    !Number.isInteger(expression.right.value) ||
    expression.right.value < 0 ||
    expression.right.value >= 2 ** 32
  ) {
    return undefined;
  }
  return {
    statement: stmt,
    left: expression.left,
    value: expression.right.value,
  };
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
  // r.f() は this === r で呼ばれるが変数化する (this が変わる点は許容)。
  // タグ付きテンプレートも同様に this が変わるため、こちらは対象外のまま。
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

const shouldRestParamBindingTransform = (
  binding: Binding | undefined,
): binding is Binding =>
  binding !== undefined &&
  binding.constantViolations.length === 0 &&
  binding.referencePaths.length > 0;

type Access = { path: NodePath<t.MemberExpression>; key: string; kind: Kind };

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
        if (!shouldRestParamBindingTransform(binding)) {
          return;
        }

        // 直接 eval / with があると変数が動的に参照されうる

        if (hasDynamicScope(funcPath)) {
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

        const lengthAccesses = accesses.filter((a) => a.key === "length");
        const props = accesses.filter((a) => a.key !== "length");

        // 2. 変換対象のキーを決める
        const written = new Set(
          props.filter((a) => a.kind !== "read").map((a) => a.key),
        );
        const numericAccesses = new Map<number, Access[]>();
        for (const access of props) {
          if (!isArrayIndex(access.key)) {
            continue;
          }
          const key = Number(access.key);
          const list = numericAccesses.get(key);
          if (list) {
            list.push(access);
          } else {
            numericAccesses.set(key, [access]);
          }
        }
        const numericKeys = [...numericAccesses.keys()].sort((a, b) => a - b);
        for (const list of numericAccesses.values()) {
          list.sort(
            (a, b) => (a.path.node.start ?? 0) - (b.path.node.start ?? 0),
          );
        }

        // 先頭の `r.length = N;` は入口での切詰めとして扱う。
        // 切詰め位置 cut は複数あれば最小値 (伸ばしても消えた値は戻らない)。
        const leadingLengthWrites = new Set<t.Node>();
        const leadingLengthWriteStatements = new Set<t.Statement>();
        let cut = Infinity;
        for (const stmt of body.node.body) {
          const leading = leadingLengthWrite(stmt, restName);
          if (!leading) {
            break;
          }
          leadingLengthWrites.add(leading.left);
          leadingLengthWriteStatements.add(leading.statement);
          cut = Math.min(cut, leading.value);
        }

        // 引数由来の初期値を読む必要がある数値キーだけを集める。
        // 最初のアクセスが関数直下の `r[k] = ...;` なら、そのキーは書込み前に
        // 読まれないので実引数を取り込む必要がない。
        const argumentKeys: number[] = [];
        for (const key of numericKeys) {
          if (key >= cut) {
            continue;
          }
          const keyAccesses = numericAccesses.get(key) ?? [];
          const first = keyAccesses[0];
          if (!first || first.kind !== "write") {
            argumentKeys.push(key);
            continue;
          }
          const assignment = first.path.parentPath;
          if (
            !assignment?.isAssignmentExpression({
              left: first.path.node,
              operator: "=",
            })
          ) {
            argumentKeys.push(key);
            continue;
          }
          const statement = assignment.parentPath;
          if (
            !statement?.isExpressionStatement() ||
            statement.parentPath?.node !== body.node
          ) {
            argumentKeys.push(key);
            continue;
          }
          // `r[k] = r[k] + 1` のように同じ文で読む場合は初期値が必要。
          if (
            keyAccesses.some(
              (access) =>
                access !== first && isWithin(access.path, statement.node),
            )
          ) {
            argumentKeys.push(key);
          }
        }
        const contiguousArgumentKeys = argumentKeys.every(
          (value, index) => value === index,
        );
        const argumentKeySet = new Set(argumentKeys);

        // rest を通常引数へ置換して削除できるのは、
        // 引数が必要な数値キーが 0..N-1 に連続し、length 参照が先頭の切詰めだけの場合。
        const canEliminateRest =
          contiguousArgumentKeys &&
          lengthAccesses.every((a) => leadingLengthWrites.has(a.path.node));
        if (written.size === 0 && numericKeys.length === 0) {
          return;
        }
        if (written.size === 0 && !canEliminateRest) {
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
        const allocateName = (key: string): string => {
          let name = sanitize(key);
          if (conflicts(name)) {
            name = scope.generateUid(name);
          }
          chosen.add(name);
          return name;
        };
        const replaceAccesses = (names: Map<string, string>): void => {
          for (const access of accesses) {
            const name = names.get(access.key);
            if (name !== undefined) {
              access.path.replaceWith(t.identifier(name));
            }
          }
        };

        if (canEliminateRest) {
          // 4. 引数が必要な数値キー 0..N-1 を昇順の仮引数へ。
          //    それ以外の数値キーは初期値なしの let。
          const names = new Map<string, string>();
          const declarators: t.VariableDeclarator[] = [];
          const paramsToAdd: t.Identifier[] = [];
          const paramCount = Math.min(argumentKeys.length, cut);
          for (let index = 0; index < paramCount; index++) {
            const name = allocateName(String(index));
            names.set(String(index), name);
            paramsToAdd.push(t.identifier(name));
          }
          for (const key of new Set(props.map((a) => a.key))) {
            if (names.has(key)) {
              continue;
            }
            const name = allocateName(key);
            names.set(key, name);
            declarators.push(t.variableDeclarator(t.identifier(name), null));
          }

          replaceAccesses(names);
          while (true) {
            const first = body.get("body.0");
            if (!first.isStatement()) {
              break;
            }
            if (!leadingLengthWriteStatements.has(first.node)) {
              break;
            }
            first.remove();
          }
          funcPath.node.params = [...params.slice(0, -1), ...paramsToAdd];
          if (declarators.length > 0) {
            body.unshiftContainer(
              "body",
              t.variableDeclaration("let", declarators),
            );
          }
          scope.crawl();
          return;
        }

        // 5. フォールバック: rest を残したままローカル変数へ変換
        const convert = new Map<string, boolean>();
        for (const { key } of props) {
          const numeric = isArrayIndex(key);
          // 書込みのない非負整数の読取は実引数そのものなので触らない
          if (numeric && !written.has(key)) {
            continue;
          }
          convert.set(key, numeric);
        }
        // 数値キーを変数化すると r 本体が更新されず、length の観測がずれる。
        if (
          [...convert.values()].some(Boolean) &&
          lengthAccesses.some((a) => !leadingLengthWrites.has(a.path.node))
        ) {
          return;
        }

        const names = new Map<string, string>();
        const declarators: t.VariableDeclarator[] = [];
        for (const [key, numeric] of convert) {
          const name = allocateName(key);
          names.set(key, name);
          declarators.push(
            t.variableDeclarator(
              t.identifier(name),
              numeric && argumentKeySet.has(Number(key))
                ? t.memberExpression(
                    t.identifier(restName),
                    t.numericLiteral(Number(key)),
                    true,
                  )
                : null,
            ),
          );
        }

        // 6. 宣言を先頭に挿入し、アクセスを識別子へ置換
        body.unshiftContainer(
          "body",
          t.variableDeclaration("let", declarators),
        );
        replaceAccesses(names);
        scope.crawl();
      },
    },
  };
}

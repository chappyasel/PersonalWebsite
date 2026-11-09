import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * The procedure guard (src/server/api/routers/weightLogOwnerOnly.test.ts) only
 * sees tRPC. This test closes the other door: nothing under
 * `src/app/weight-log/edit/` may reach the database or Drizzle itself, and no
 * `"use server"` module there may export an action beyond sign-in and
 * sign-out. Server actions are public POST endpoints, so one that touched
 * owner data would skip `ownerProcedure`.
 */

const RULE =
  "Owner data on /weight-log/edit goes through api.weightLog.* on " +
  "ownerProcedure (docs/plans/weight-log-migration.md, slice 1). Pages and " +
  "server actions there must not import ~/server/db or drizzle-orm, and a " +
  '"use server" module may export only the sign-in and sign-out actions. ' +
  "Add a weightLog procedure on ownerProcedure instead.";

const EDIT_DIR = path.resolve(__dirname);
const DB_DIR = path.resolve(__dirname, "../../../server/db");

/** The actions that exist today. Each new one is a public endpoint. */
const ALLOWED_SERVER_ACTIONS = new Set(["signInWithGoogle", "signOutOwner"]);

function isDatabaseSpecifier(fileName: string, specifier: string) {
  if (specifier === "drizzle-orm" || specifier.startsWith("drizzle-orm/")) {
    return true;
  }
  let resolved: string;
  if (specifier.startsWith("~/")) {
    resolved = path.resolve(DB_DIR, "../..", specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    resolved = path.resolve(path.dirname(fileName), specifier);
  } else {
    return false;
  }
  const relative = path.relative(DB_DIR, resolved);
  return relative === "" || !relative.startsWith("..");
}

function moduleSpecifiers(source: ts.SourceFile) {
  const specifiers: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      specifiers.push(node.moduleReference.expression.text);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    ) {
      const [argument] = node.arguments;
      specifiers.push(
        argument && ts.isStringLiteralLike(argument)
          ? argument.text
          : "<computed specifier>",
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specifiers;
}

function isUseServerModule(source: ts.SourceFile) {
  for (const statement of source.statements) {
    if (
      !ts.isExpressionStatement(statement) ||
      !ts.isStringLiteral(statement.expression)
    ) {
      return false;
    }
    if (statement.expression.text === "use server") return true;
  }
  return false;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind) {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === kind)
  );
}

function exportedNames(source: ts.SourceFile) {
  const names: string[] = [];
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement)) {
      const clause = statement.exportClause;
      if (clause && ts.isNamedExports(clause)) {
        names.push(...clause.elements.map((element) => element.name.text));
      } else {
        names.push("*");
      }
    } else if (ts.isExportAssignment(statement)) {
      names.push("default");
    } else if (hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
        names.push("default");
      } else if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          names.push(declaration.name.getText(source));
        }
      } else if (
        (ts.isFunctionDeclaration(statement) ||
          ts.isClassDeclaration(statement)) &&
        statement.name
      ) {
        names.push(statement.name.text);
      }
    }
  }
  return names;
}

/** Each way `fileName` lets owner data around tRPC, one line per breach. */
function boundaryViolations(fileName: string, text: string) {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  const name = path.relative(EDIT_DIR, fileName);
  const violations = moduleSpecifiers(source)
    .filter(
      (specifier) =>
        specifier === "<computed specifier>" ||
        isDatabaseSpecifier(fileName, specifier),
    )
    .map((specifier) => `${name} imports "${specifier}"`);
  if (isUseServerModule(source)) {
    for (const exported of exportedNames(source)) {
      if (!ALLOWED_SERVER_ACTIONS.has(exported)) {
        violations.push(`${name} exports server action "${exported}"`);
      }
    }
  }
  return violations;
}

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!/\.(c|m)?(t|j)sx?$/.test(entry.name)) return [];
    // Tests run in vitest, not on the page, and this one quotes the
    // forbidden imports on purpose.
    if (/\.test\.(c|m)?(t|j)sx?$/.test(entry.name)) return [];
    return [full];
  });
}

describe("/weight-log/edit reads owner data only through tRPC", () => {
  it("no page or server action under /weight-log/edit bypasses ownerProcedure", () => {
    const files = sourceFiles(EDIT_DIR);
    expect(files.map((file) => path.relative(EDIT_DIR, file))).toContain(
      "actions.ts",
    );
    expect(
      files.flatMap((file) =>
        boundaryViolations(file, fs.readFileSync(file, "utf8")),
      ),
      RULE,
    ).toEqual([]);
  });

  it("names each database import and extra server action in a leaky file", () => {
    const leaky = path.join(EDIT_DIR, "leaky", "actions.ts");
    const source = `"use server";
import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { weighIns } from "../../../../server/db/schema";
import * as owner from "~/server/owner";
export { signOutOwner } from "../actions";
export async function signInWithGoogle() {}
export async function saveWeighIn() {
  const { db: lazy } = await import("~/server/db/index");
  return [db, lazy, eq, weighIns, owner];
}
export const deleteWeighIn = async () => undefined;
export default async function exportCsv() {}
`;
    expect(boundaryViolations(leaky, source)).toEqual([
      'leaky/actions.ts imports "drizzle-orm"',
      'leaky/actions.ts imports "~/server/db"',
      'leaky/actions.ts imports "../../../../server/db/schema"',
      'leaky/actions.ts imports "~/server/db/index"',
      'leaky/actions.ts exports server action "saveWeighIn"',
      'leaky/actions.ts exports server action "deleteWeighIn"',
      'leaky/actions.ts exports server action "default"',
    ]);
  });

  it("allows tRPC and auth imports, and exports from a module that is not 'use server'", () => {
    const page = path.join(EDIT_DIR, "page.tsx");
    const source = `import { api } from "~/trpc/server";
import { auth } from "~/server/auth";
import { signInWithGoogle } from "./actions";
export const dynamic = "force-dynamic";
export default async function Page() {
  return [api, auth, signInWithGoogle];
}
`;
    expect(boundaryViolations(page, source)).toEqual([]);
  });
});

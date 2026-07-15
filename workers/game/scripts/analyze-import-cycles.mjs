import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(process.argv[2] ?? "src");
const files = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith(".ts")) files.push(path.normalize(file));
  }
}

walk(root);
const nodes = new Set(files);
const edges = new Map();

for (const file of files) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true
  );
  const dependencies = [];
  for (const statement of source.statements) {
    const isImport = ts.isImportDeclaration(statement);
    const isExport = ts.isExportDeclaration(statement);
    if (
      (!isImport && !isExport) ||
      !statement.moduleSpecifier ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      continue;
    }
    const specifier = statement.moduleSpecifier.text;
    if (!specifier.startsWith(".")) continue;
    let dependency = path.resolve(
      path.dirname(file),
      specifier.replace(/\.js$/, ".ts")
    );
    if (!path.extname(dependency)) dependency += ".ts";
    dependency = path.normalize(dependency);
    if (!nodes.has(dependency)) continue;
    dependencies.push({
      file: dependency,
      kind: (
        isImport ? statement.importClause?.isTypeOnly : statement.isTypeOnly
      )
        ? "type-only"
        : "runtime/mixed",
    });
  }
  edges.set(file, dependencies);
}

let index = 0;
const stack = [];
const onStack = new Set();
const indices = new Map();
const lowLinks = new Map();
const components = [];

function connect(file) {
  indices.set(file, index);
  lowLinks.set(file, index);
  index += 1;
  stack.push(file);
  onStack.add(file);

  for (const edge of edges.get(file) ?? []) {
    if (!indices.has(edge.file)) {
      connect(edge.file);
      lowLinks.set(file, Math.min(lowLinks.get(file), lowLinks.get(edge.file)));
    } else if (onStack.has(edge.file)) {
      lowLinks.set(file, Math.min(lowLinks.get(file), indices.get(edge.file)));
    }
  }

  if (lowLinks.get(file) !== indices.get(file)) return;
  const component = [];
  let member;
  do {
    member = stack.pop();
    onStack.delete(member);
    component.push(member);
  } while (member !== file);
  if (component.length > 1) components.push(component);
}

for (const file of files) {
  if (!indices.has(file)) connect(file);
}

const relative = (file) => path.relative(root, file);
console.log(`Circular SCCs: ${components.length}`);
components.forEach((component, componentIndex) => {
  console.log(`\nCycle group ${componentIndex + 1}:`);
  const members = new Set(component);
  for (const source of component.sort()) {
    for (const edge of edges.get(source) ?? []) {
      if (members.has(edge.file)) {
        console.log(
          `  ${relative(source)} -> ${relative(edge.file)} [${edge.kind}]`
        );
      }
    }
  }
});

process.exitCode = components.length > 0 ? 1 : 0;

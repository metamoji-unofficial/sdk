/**
 * Regenerates `spec/operations.json` from the TypeSpec sources.
 *
 * The spec lives in a separate, private repository; this package is public and
 * its tests have to run without it. So the operation list is committed here as
 * a snapshot, and this script is how it is refreshed — run it from a checkout
 * that has `docs/` beside `sdk/`, or pass the path to `docs/typespec`.
 *
 * Nothing here is a secret: the same operations, methods and paths are in this
 * package's own README, in a table.
 *
 *   bun run gen:spec [path/to/docs/typespec]
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(process.argv[2] ?? join(here, "..", "..", "docs", "typespec"));
const out = join(here, "..", "spec", "operations.json");

/** Every operation the spec declares, with the route and verb it names. */
export function readOperations(typespecRoot) {
  const operations = [];
  for (const file of tspFiles(typespecRoot).sort()) {
    const source = readFileSync(file, "utf8");
    let currentInterface = "";
    let route;
    let verb;
    const pattern =
      /interface\s+(\w+)\s*\{|^[ \t]*@route\("([^"]*)"\)|^[ \t]*@(get|post|put|patch|delete|head)\b|^[ \t]*op\s+(\w+)\s*\(/gm;
    let match;
    while ((match = pattern.exec(source))) {
      if (match[1]) currentInterface = match[1];
      else if (match[2] !== undefined) route = match[2];
      else if (match[3] !== undefined) verb = match[3].toUpperCase();
      else {
        operations.push({
          key: `${currentInterface}.${match[4]}`,
          file: relative(typespecRoot, file),
          method: verb ?? "GET",
          route,
        });
        route = undefined;
        verb = undefined;
      }
    }
  }
  return operations;
}

function tspFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...tspFiles(path));
    else if (entry.endsWith(".tsp")) found.push(path);
  }
  return found;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const operations = readOperations(root);
  if (operations.length === 0) throw new Error(`No operations found under ${root}`);
  writeFileSync(out, `${JSON.stringify(operations, null, 2)}\n`);
  console.log(`${operations.length} operations -> ${relative(process.cwd(), out)}`);
}

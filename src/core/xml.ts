/**
 * A small XML reader, for WebDAV `PROPFIND` / `PROPPATCH` responses.
 *
 * Those are the only XML this client meets, and they are machine-generated
 * multistatus documents — no DTDs, no entities beyond the predefined five, no
 * processing instructions that matter. A dependency-free reader that handles
 * elements, attributes, text, CDATA and namespace prefixes covers them, and
 * keeps the package free of a parser that would dwarf it.
 *
 * Namespaces are resolved rather than assumed, because servers vary in the
 * prefix they bind `DAV:` to (`D:`, `d:`, `a:`, or a default namespace).
 */

export interface XmlNode {
  /** Namespace URI, resolved from the element's prefix. */
  ns?: string;
  /** Local name, without the prefix. */
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  /** Concatenated direct text content. */
  text: string;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X"
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** Parses a document and returns its root element, or undefined if there is none. */
export function parseXml(source: string): XmlNode | undefined {
  const stack: XmlNode[] = [];
  const scopes: Record<string, string>[] = [{}];
  let root: XmlNode | undefined;
  let i = 0;

  while (i < source.length) {
    const lt = source.indexOf("<", i);
    if (lt === -1) break;

    if (lt > i) {
      const text = decodeEntities(source.slice(i, lt));
      const top = stack[stack.length - 1];
      if (top && text.trim()) top.text += text;
    }

    if (source.startsWith("<!--", lt)) {
      i = advancePast(source, lt, "-->");
      continue;
    }
    if (source.startsWith("<![CDATA[", lt)) {
      const end = source.indexOf("]]>", lt);
      const top = stack[stack.length - 1];
      if (top) top.text += source.slice(lt + 9, end === -1 ? source.length : end);
      i = advancePast(source, lt, "]]>");
      continue;
    }
    if (source.startsWith("<?", lt) || source.startsWith("<!", lt)) {
      i = advancePast(source, lt, ">");
      continue;
    }

    const gt = findTagEnd(source, lt);
    if (gt === -1) break;
    const raw = source.slice(lt + 1, gt).trim();
    i = gt + 1;

    if (raw.startsWith("/")) {
      stack.pop();
      if (scopes.length > 1) scopes.pop();
      continue;
    }

    const selfClosing = raw.endsWith("/");
    const inner = selfClosing ? raw.slice(0, -1).trim() : raw;
    const spaceAt = inner.search(/\s/);
    const qualified = spaceAt === -1 ? inner : inner.slice(0, spaceAt);
    const attrs = spaceAt === -1 ? {} : parseAttributes(inner.slice(spaceAt + 1));

    // A namespace binding is in scope for the element that declares it.
    const scope = { ...scopes[scopes.length - 1] };
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "xmlns") scope[""] = value;
      else if (key.startsWith("xmlns:")) scope[key.slice(6)] = value;
    }

    const colon = qualified.indexOf(":");
    const prefix = colon === -1 ? "" : qualified.slice(0, colon);
    const local = colon === -1 ? qualified : qualified.slice(colon + 1);
    const node: XmlNode = { ns: scope[prefix], name: local, attrs, children: [], text: "" };

    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else root ??= node;

    if (!selfClosing) {
      stack.push(node);
      scopes.push(scope);
    }
  }

  return root;
}

/** Finds the `>` that closes a tag, skipping any inside quoted attribute values. */
function findTagEnd(source: string, from: number): number {
  let quote: string | undefined;
  for (let i = from + 1; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = undefined;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ">") {
      return i;
    }
  }
  return -1;
}

function advancePast(source: string, from: number, marker: string): number {
  const end = source.indexOf(marker, from);
  return end === -1 ? source.length : end + marker.length;
}

function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([^\s=/]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    attrs[match[1]] = decodeEntities(match[3] ?? match[4] ?? match[5] ?? "");
  }
  return attrs;
}

/** Direct children matching a namespace and local name. */
export function childrenNamed(node: XmlNode, ns: string, name: string): XmlNode[] {
  return node.children.filter((child) => child.ns === ns && child.name === name);
}

/** The first matching direct child. */
export function childNamed(node: XmlNode, ns: string, name: string): XmlNode | undefined {
  return childrenNamed(node, ns, name)[0];
}

/** Escapes a value for inclusion in element text or an attribute. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

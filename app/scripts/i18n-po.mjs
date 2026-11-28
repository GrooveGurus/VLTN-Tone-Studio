// Translation helpers for the Lingui .po catalogs (see src/renderer/src/locales/GLOSSARY.md).
//   node scripts/i18n-po.mjs export <locale> <out dir> [batch size]   untranslated messages → batch-NN.json
//   node scripts/i18n-po.mjs merge <locale> <file.json...>            { msgid: msgstr } → the catalog (checked)
//   node scripts/i18n-po.mjs check <locale>                           placeholders kept; counts what is missing
// A translation must keep every placeholder of its source ({0}, {pedal}, <0>, </0>, <1/>); one that doesn't is refused.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalogOf = (locale) => join(root, "src/renderer/src/locales", locale, "messages.po");

const unquote = (s) => JSON.parse(s.replace(/\\(?!["\\nrt])/g, "\\\\"));
const quote = (s) => JSON.stringify(s);

/** Entries of a .po file, keeping the text of everything around them. */
function parse(text) {
  const lines = text.split("\n");
  const entries = [];
  let cur = null;
  let field = null;
  lines.forEach((line, i) => {
    const m = line.match(/^(msgid|msgstr) (".*")$/);
    if (m) {
      if (m[1] === "msgid") {
        cur = { msgid: "", msgstr: "", refs: [], start: i, idLines: [i], strLines: [] };
        entries.push(cur);
        // refs are the #: lines just above
        for (let k = i - 1; k >= 0 && lines[k].startsWith("#"); k--) if (lines[k].startsWith("#:")) cur.refs.unshift(lines[k].slice(3));
      } else cur.strLines = [i];
      field = m[1];
      cur[field] += unquote(m[2]);
      return;
    }
    if (cur && field && /^".*"$/.test(line)) {
      cur[field] += unquote(line);
      (field === "msgid" ? cur.idLines : cur.strLines).push(i);
      return;
    }
    field = null;
  });
  return { lines, entries: entries.filter((e) => e.msgid !== "") };
}

const placeholders = (s) => (s.match(/\{[^{}]+\}|<\/?\d+\/?>/g) ?? []).sort();
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

const [cmd, locale, ...rest] = process.argv.slice(2);
if (!cmd || !locale) {
  console.error("usage: export|merge|check <locale> …");
  process.exit(2);
}
const file = catalogOf(locale);
const { lines, entries } = parse(readFileSync(file, "utf8"));

if (cmd === "export") {
  const [outDir, size = "250"] = rest;
  mkdirSync(outDir, { recursive: true });
  const todo = entries.filter((e) => !e.msgstr).map((e) => ({ msgid: e.msgid, ref: e.refs[0]?.split(" ")[0] ?? "" }));
  const n = Number(size);
  for (let b = 0; b * n < todo.length; b++) writeFileSync(join(outDir, `batch-${String(b + 1).padStart(2, "0")}.json`), JSON.stringify(todo.slice(b * n, (b + 1) * n), null, 1));
  console.log(`${todo.length} untranslated → ${Math.ceil(todo.length / n)} batches in ${outDir}`);
} else if (cmd === "merge") {
  const tr = Object.assign({}, ...rest.map((f) => JSON.parse(readFileSync(f, "utf8"))));
  const byId = new Map(entries.map((e) => [e.msgid, e]));
  const bad = [];
  let applied = 0;
  // replace from the last entry up, so line numbers above stay valid
  const updates = [];
  for (const [id, str] of Object.entries(tr)) {
    const e = byId.get(id);
    if (!e || typeof str !== "string" || !str) continue;
    if (!same(placeholders(id), placeholders(str))) {
      bad.push({ id, str });
      continue;
    }
    updates.push({ e, str });
  }
  updates.sort((a, b) => b.e.start - a.e.start);
  for (const { e, str } of updates) {
    const first = e.strLines[0];
    lines.splice(first, e.strLines.length, `msgstr ${quote(str)}`);
    applied++;
  }
  writeFileSync(file, lines.join("\n"));
  console.log(`${applied} applied` + (bad.length ? `, ${bad.length} refused (placeholders differ):` : ""));
  for (const b of bad.slice(0, 20)) console.log(`  ${quote(b.id)}\n  ${quote(b.str)}`);
  if (bad.length) process.exitCode = 1;
} else if (cmd === "check") {
  const bad = entries.filter((e) => e.msgstr && !same(placeholders(e.msgid), placeholders(e.msgstr)));
  const missing = entries.filter((e) => !e.msgstr).length;
  console.log(`${entries.length} messages, ${missing} without translation, ${bad.length} with placeholders that differ`);
  for (const b of bad.slice(0, 20)) console.log(`  ${quote(b.msgid)} → ${quote(b.msgstr)}`);
  if (bad.length) process.exitCode = 1;
} else {
  console.error(`unknown command ${cmd}`);
  process.exit(2);
}

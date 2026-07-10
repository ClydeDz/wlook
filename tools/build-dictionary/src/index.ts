/**
 * index.ts — CLI entry point for the wlook-build-dictionary tool.
 *
 * Usage:
 *   node dist/index.js --lang en-GB --kaikki kaikki-en.jsonl --wordnet ./wordnet --output en-GB.wlpack
 *   node dist/index.js --lang en-US --kaikki kaikki-en.jsonl --output en-US.wlpack
 *   node dist/index.js --lang en-GB --kaikki ./cache/simple-extract.jsonl --output ./build/en-GB-1.0.0.wlpack
 *   node dist/index.js --lang en-US --kaikki ./cache/simple-extract.jsonl --output ./build/en-US-1.0.0.wlpack
 *
 * Options:
 *   --lang     <en-GB|en-US|both>  Target dialect / pack to build.  Required.
 *   --kaikki   <path>              Path to the Kaikki JSONL file.   Optional.
 *   --wordnet  <dir>               Path to Open English WordNet dir. Optional.
 *   --output   <path>              Output .wlpack file path.         Required.
 *   --help                         Print this help message.
 *
 * At least one of --kaikki or --wordnet must be supplied.
 */

import Database from "better-sqlite3";
import { existsSync, rmSync } from "node:fs";
import { parseArgs } from "node:util";
import { parseKaikkiFile } from "./kaikki-parser.js";
import { initSchema } from "./schema.js";
import { parseWordNet } from "./wordnet-parser.js";
import { writePack } from "./writer.js";
import type { RawEntry } from "./types.js";

// ── Argument parsing ──────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(
    `
wlook-build-dictionary — builds a .wlpack dictionary file from upstream sources

Usage:
  node dist/index.js --lang <en-GB|en-US|both> --output <file.wlpack>
                     [--kaikki <jsonl-file>] [--wordnet <dir>]

Options:
  --lang     en-GB|en-US|both   Dialect pack to build (required)
  --kaikki   <path>             Kaikki JSONL file (at least one source required)
  --wordnet  <dir>              Open English WordNet directory
  --output   <path>             Output .wlpack file (required)
  --help                        Show this message

Example:
  node dist/index.js \\
    --lang en-GB \\
    --kaikki ./kaikki.org-dictionary-English.json \\
    --wordnet ./english-wordnet \\
    --output ./en-GB.wlpack
`.trim(),
  );
}

function parseCliArgs(): {
  lang: "en-GB" | "en-US" | "both";
  kaikki?: string;
  wordnet?: string;
  output: string;
} {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      lang: { type: "string" },
      kaikki: { type: "string" },
      wordnet: { type: "string" },
      output: { type: "string" },
      help: { type: "boolean", default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  if (!values.lang || !["en-GB", "en-US", "both"].includes(values.lang)) {
    console.error("Error: --lang must be one of: en-GB, en-US, both");
    process.exit(1);
  }

  if (!values.output) {
    console.error("Error: --output is required");
    process.exit(1);
  }

  if (!values.kaikki && !values.wordnet) {
    console.error(
      "Error: at least one of --kaikki or --wordnet must be supplied",
    );
    process.exit(1);
  }

  if (values.kaikki && !existsSync(values.kaikki)) {
    console.error(`Error: kaikki file not found: ${values.kaikki}`);
    process.exit(1);
  }

  if (values.wordnet && !existsSync(values.wordnet)) {
    console.error(`Error: wordnet directory not found: ${values.wordnet}`);
    process.exit(1);
  }

  return {
    lang: values.lang as "en-GB" | "en-US" | "both",
    kaikki: values.kaikki,
    wordnet: values.wordnet,
    output: values.output,
  };
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseCliArgs();

  console.log(`Building ${args.lang} pack → ${args.output}`);
  const startMs = Date.now();

  // ── 1. Collect entries from all sources ───────────────────────────────────
  // Key: `${headword}::${pos ?? ''}` — used to de-duplicate across sources.
  const entryMap = new Map<string, RawEntry>();

  // 1a. WordNet (lower priority — used to fill missing examples).
  if (args.wordnet) {
    console.log(`  Parsing WordNet from ${args.wordnet} …`);
    const wnMap = parseWordNet(args.wordnet);
    console.log(`  WordNet entries loaded: ${wnMap.size.toLocaleString()}`);

    for (const [key, entry] of wnMap) {
      entryMap.set(key, entry);
    }
  }

  // 1b. Kaikki (primary — overwrites WordNet where both have the same headword).
  let kaikkiCount = 0;
  if (args.kaikki) {
    console.log(`  Parsing Kaikki JSONL from ${args.kaikki} …`);

    for await (const entry of parseKaikkiFile(args.kaikki, args.lang)) {
      const key = `${entry.headword.toLowerCase()}::${entry.pos ?? ""}`;

      // If Wiktionary entry has no example for a sense, try to back-fill from
      // the WordNet entry with the same headword.
      const wnEntry = entryMap.get(entry.headword.toLowerCase());
      if (wnEntry) {
        for (let i = 0; i < entry.senses.length; i++) {
          if (!entry.senses[i]!.example && wnEntry.senses[i]?.example) {
            entry.senses[i]!.example = wnEntry.senses[i]!.example;
          }
        }
      }

      entryMap.set(key, entry);
      kaikkiCount++;

      if (kaikkiCount % 100_000 === 0) {
        process.stdout.write(
          `\r  Kaikki lines processed: ${kaikkiCount.toLocaleString()}`,
        );
      }
    }

    console.log(`\r  Kaikki entries accepted: ${kaikkiCount.toLocaleString()}`);
  }

  const allEntries = Array.from(entryMap.values());
  console.log(`  Total entries: ${allEntries.length.toLocaleString()}`);

  // ── 2. Open / create the output database ─────────────────────────────────
  if (existsSync(args.output)) {
    rmSync(args.output);
    console.log(`  Removed existing output file.`);
  }

  const db = new Database(args.output);
  initSchema(db);

  // ── 3. Write entries ──────────────────────────────────────────────────────
  console.log(`  Writing to database …`);

  const metadata: Record<string, string> = {
    id: args.lang,
    language: args.lang.split("-")[0]!,
    displayName:
      args.lang === "en-GB"
        ? "English (United Kingdom)"
        : args.lang === "en-US"
          ? "English (United States)"
          : "English (Combined)",
    version: "1.0.0",
    builtAt: new Date().toISOString(),
    attribution:
      "Wiktionary contributors via kaikki.org (CC BY-SA 4.0); English WordNet contributors (CC BY 4.0)",
    sourceKaikki: args.kaikki ?? "",
    sourceWordNet: args.wordnet ?? "",
  };

  writePack(db, allEntries, metadata);
  db.close();

  const elapsedS = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log(`Done in ${elapsedS}s → ${args.output}`);
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

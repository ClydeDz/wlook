# Packaging a Dictionary

This guide explains how to use `tools/build-dictionary/` to produce a `.wlpack` file from open-source lexical sources.

A `.wlpack` file is a standard SQLite database. See `docs/architecture.md` for the full schema.

---

## Prerequisites

- Node.js 20+ and Yarn installed.
- The project dependencies installed (`yarn install`).
- Enough disk space: Kaikki JSON for English is ~2 GB uncompressed; the finished `.wlpack` is under 40 MB.

---

## Step 1 — Download source data

### Option A: Kaikki (Wiktionary machine-readable export)

Kaikki provides a machine-readable export of Wiktionary in JSON Lines format. Downloads are available at:

```
https://kaikki.org/dictionary/
```

Download the file for your target language. For English:

```
https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.json
```

Save it somewhere accessible, e.g. `/tmp/kaikki-english.json`.

### Option B: WordNet

Princeton WordNet 3.1 is available at:

```
https://wordnet.princeton.edu/download/current-version
```

Download `WordNet-3.1.tar.bz2` and extract it. Note the path to the `dict/` directory.

### Using both sources

The build tool can merge entries from both sources. Kaikki provides better IPA and example coverage; WordNet provides better synset/definition coverage. Using both is recommended for English.

---

## Step 2 — Run the build tool

```sh
node tools/build-dictionary/index.mjs \
  --kaikki /tmp/kaikki-english.json \
  --wordnet /path/to/WordNet-3.1/dict \
  --language en-US \
  --display-name "English (US)" \
  --version 1.0.0 \
  --license "CC BY-SA 4.0" \
  --source "Kaikki/Wiktionary + WordNet 3.1" \
  --out /tmp/en-US.wlpack
```

For English UK, substitute `--language en-GB` and `--display-name "English (UK)"` and use the Kaikki British English export.

Run `node tools/build-dictionary/index.mjs --help` for the full option reference.

### Options reference

| Option           | Required | Description                                    |
| ---------------- | -------- | ---------------------------------------------- |
| `--language`     | yes      | BCP-47 language tag (e.g. `en-US`, `de`, `fr`) |
| `--display-name` | yes      | Human-readable name shown in the dashboard     |
| `--version`      | yes      | Semver string for the pack                     |
| `--license`      | yes      | SPDX license expression                        |
| `--source`       | yes      | Attribution string stored in metadata          |
| `--out`          | yes      | Output path for the `.wlpack` file             |
| `--kaikki`       | no       | Path to Kaikki JSON Lines file                 |
| `--wordnet`      | no       | Path to extracted WordNet `dict/` directory    |
| `--limit`        | no       | Maximum number of entries (useful for testing) |
| `--verbose`      | no       | Print per-entry progress                       |

At least one of `--kaikki` or `--wordnet` must be provided.

---

## Step 3 — Verify the output

```sh
node tools/build-dictionary/verify.mjs /tmp/en-US.wlpack
```

This checks:

- All required `metadata` keys are present.
- The `entries` table is non-empty.
- The FTS5 index is consistent with `entries`.
- File size is within the 40 MB budget.
- A sample lookup (`run`, `go`, `the`) returns results.

Expected output:

```
[OK] metadata complete
[OK] 145,203 entries
[OK] FTS5 index consistent
[OK] File size: 34.2 MB (budget: 40 MB)
[OK] Sample lookups passed
Pack is valid.
```

If any check fails, the tool exits with a non-zero code and prints the failing check.

---

## Step 4 — Install for local testing

```sh
cp /tmp/en-US.wlpack ~/.wlook/dictionaries/
```

Start or restart the agent (`yarn dev:agent`). The pack appears in the dashboard under "Installed". Run a lookup to confirm entries are returned.

---

## Licensing note

Wiktionary content is licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). WordNet 3.1 is licensed under the [WordNet License](https://wordnet.princeton.edu/license-and-commercial-use) (BSD-style). Distribution of `.wlpack` files derived from these sources must include attribution. The build tool writes the `license` and `source` values into the pack's `metadata` table; the dashboard surfaces them in the pack detail view.

Before publishing a pack derived from other sources, verify you have the right to redistribute derivative works under those terms.

---

catalogueUrl

https://github.com/clydedz/wlook/releases/latest/download/packs-manifest.json

Then set catalogueUrl in %APPDATA%\Wlook\config.json to whichever URL you want users to hit.

```
// json
{
  "schemaVersion": 1,
  "packs": [
    {
      "id":           "en-GB",
      "displayName":  "English (United Kingdom)",
      "version":      "1.0.0",
      "sizeMB":       32,
      "language":     "en",
      "url":          "https://github.com/<owner>/<repo>/releases/download/<tag>/en-GB-1.0.0.wlpack",
      "sha256":       "abc123…"
    }
  ]
}
```

1. Build your .wlpack with tools/build-dictionary/ (see docs/packaging-a-dictionary.md ).
2. Compute its SHA-256: sha256sum your-pack.wlpack .
3. Upload your-pack.wlpack as a release asset named exactly <id>-<version>.wlpack (because installPack reads dictionariesDir/<id>-<version>.wlpack after install).
4. Create packs-manifest.json , paste your manifest URLs and hashes in.
5. Attach packs-manifest.json as a release asset.
6. Set catalogueUrl in %APPDATA%\Wlook\config.json to the URL from step 5.
7. Restart the agent, open the dashboard — the pack should appear in "Browse Dictionaries" with an Install button.

downloaded https://kaikki.org/dictionary/rawdata.html

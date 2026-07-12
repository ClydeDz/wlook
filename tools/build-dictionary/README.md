# Build Dictionary

A CLI tool to build a dictionary file that the WLook program can load.

## Steps

- Download the Simple English `simple-extract.jsonl` (35.2MB) from https://kaikki.org/dictionary/rawdata.html
- Copy the file to the tools\build-dictionary\cache folder
- Run `yarn build` in the tools\build-dictionary folder to build the program (one time only).
- Run `yarn start` in the tools\build-dictionary folder which runs `node dist/index.js --lang en-US --kaikki ./cache/simple-extract.jsonl --output ./build/en-US-1.0.0.wlpack`. Note that the jsonl extract doesn't say if its en-US or en-GB but I've run it twice for en-US and en-GB just by updating the start command.
- You can also copy the wlpack files into the %APPDATA%\Wlook\dictionaries\ folder for the local agent to pick them up.
- Repeat the steps for each language pack.

## Background

The catalogueUrl property in the %APPDATA%\Wlook\config.json file points to https://github.com/ClydeDz/wlook/releases/download/0.0.0/packs-manifest.json which tells the app where to load the dictionaries from. This file looks something like this:

```json
{
  "schemaVersion": 1,
  "packs": [
    {
      "id": "en-GB",
      "displayName": "English (United Kingdom)",
      "version": "1.0.0",
      "sizeMB": 32,
      "language": "en",
      "url": "https://github.com/clydedz/wlook/releases/latest/download/en-GB-1.0.0.wlpack",
      "sha256": "abc123…"
    }
  ]
}
```

The file that is uploaded to github releases is also located here tools\build-dictionary\build\packs-manifest.json. sha256 is optional so is not populated. Therefore, both the packs manifest json file and the wlpack files are uploaded to github releases. At this stage, we need to upload it to every "latest" release.

Restart the agent, open the dashboard — the pack should appear in "Browse Dictionaries" with an Install button.

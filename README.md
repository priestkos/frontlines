# Frontlines

The FFXIV Frontline reference, written twice: the unabridged **Woodblock Codex**
and the summarised **Plotting Table**. Each is one self-contained HTML file — art
inline SVG and canvas, charts hand-drawn, system fonts — so both open offline
with no server, CDN or network. The markdown in `sources/` regenerates them, so
the knowledge outlives the sites.

**Live:** https://frontline.kosmos14.date

## The two sites

| Site | Path | What it is |
| --- | --- | --- |
| **The Woodblock Codex** | `woodblock-codex/` | Unabridged. Every mechanic, all five maps, all 21 jobs, the 14 named plays, the 27 bilingual callouts and every citation. 7 documents, ~171,700 characters, 54 tables, 27 copy-ready macros. |
| **The Plotting Table** | `plotting-table/` | The briefing. Eight plates: the five levers, the numbers, the five maps, the roster, the kill chain, the 14 plays, the call sheet, the quick reference. ~12,100 characters. |

`index.html` is the landing page that opens either one.

## Design

Hand-built: no generated imagery, no stock art, no template.

- **Codex** — paper and iron-gall ink: `#f2f1ec` paper, `#16181a` ink, one
  vermilion `#d5432a` seal, serif type, a drifting ink-wash canvas.
- **Plotting Table** — graphite and chalk: `#14161a` ground, `#e9edf0` ink, one
  chartreuse `#c6f24e` signal, mono type, a radar sweep and drifting contours.

Charts draw their lines on reveal. `prefers-reduced-motion` is honoured and a
2.5 second safety net reveals everything regardless, so nothing is left invisible.

## Regenerating

Python 3 (stdlib only) for the build; Node plus Chrome or Edge for the harness.

```bash
python tools/md2blocks.py   # sources/*.md -> _build/content.json (+ coverage report)
python tools/site_a.py      # -> woodblock-codex/index.html
python tools/site_b.py      # -> plotting-table/index.html
node  tools/verify.mjs      # measures both pages, rewrites the previews; exits 1 on problems
node  tools/verify.mjs URL… # measures any pages as they load (e.g. the live site), warnings count too
python -m unittest discover -s tests   # parser + built-page checks (stdlib; node optional)
```

`md2blocks.py` ends with a coverage report and `MISMATCH none` — the current
build reports 163/163 headings, 463/463 bullets, 54 tables (407/407 rows) and 27/27 code blocks,
nothing unmatched. Set `CHROME_BIN` if your browser is not in a usual location;
the verifier speaks CDP over Node's built-in WebSocket, so Node is all it needs.

## Sources

`sources/` holds the seven documents the codex renders (01–07). Figures come from
the Lodestone patch notes and the in-game Frontline Campaign Info panel,
cross-checked against consolegameswiki, Japanese write-ups and community tier
lists; the pages cite their sources inline.

**Reference patch: 7.5.** Re-verify after any major PvP patch.

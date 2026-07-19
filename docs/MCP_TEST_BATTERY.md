# THIRI MCP — Tool-Level Test Battery

Structured tool-call tests (vs the natural-language `MCP_CHAT_TEST.md`). Run via any MCP client
(Inspector, AI Playground) or the wired tools. Maps 1:1 to the Chase/Jax findings, so it doubles as
a **post-deploy regression suite**. Last full run: **28/28 pass** (2026-06-05, via the wired MCP).

> Every successful response carries a quota footer (`Quota: N / 50000`). Errors return a structured
> `[code]: message`, never a raw blob.

## 1. analyze_chord
| chord / key | Expect |
|---|---|
| `Cmaj7` / C | `IΔ7`, diatonic true |
| `Dm7b5` / C | `iiø7`, diatonic **false** |
| `G7b13` / C | quality `7b13`, non-diatonic *(scales `[]` — known edge)* |
| `Fm7` / C | `iv7` (borrowed) |
| `Abmaj7` / C | `♭VIΔ7` (borrowed) |
| `A7` / C | `V7/ii` (secondary dominant) |
| `Cmaj7/E` / C | bassNote `E` |
| `Zx9` | graceful `[invalid_chord]` |

## 2. resolve_chord
| chord | Expect |
|---|---|
| `Cmaj7` | `C E G B` |
| `C7sus4` | `C F G Bb` (suspension kept) |
| `Caug` | `C E G#` (#5, not b6) |
| `C13` | `C E G Bb D A` |
| `Cdim7` | `C Eb Gb Bbb` |
| `C7#9` | `C E G Bb D#` + ≥1 scale *(single scale — known nuance)* |
| `" "` (empty) | graceful error |

## 3. generate_voicing
| chord · style · args | Expect |
|---|---|
| `Cmaj7` · triad | `C3 E3 G3` (real triad, not shell) |
| `Cmaj7` · shell | `C3 E3 B3` (1-3-7) |
| `Cmaj7` · rootless | no root in bass |
| `Cmaj7` · bill_evans | resolves (alias of rootless) |
| `Dm7` · rootless · previousNotes `["E3","G3","B3","D4"]` | numeric `voiceLeadingScore` |
| `C7` · rootless · colorPreferences `{ninth:"b9"}` | includes `Db` |

## 4. reharmonize
| progression · technique · key | Expect |
|---|---|
| `["Dm7","G7","Cmaj7"]` · tritone_sub | `Dm7 Db7 Cmaj7` |
| `["Dm7","G7","Cmaj7"]` · coltrane_changes | `Cmaj7 Ab7 Abmaj7 E7` |
| `["G7","Cmaj7"]` · backdoor · C | `Bb7 Cmaj7` |
| `["C","Dm"]` · diminished_passing | `C Dbdim7 Dm` |
| `["Dm7","G7","C"]` · auto · C | **7 techniques** |
| `["G7","Cmaj7"]` · backdoor · *(no key)* | declines (empty — key required) |

## 5. Cross-cutting
- **Determinism** — any call twice → byte-identical.
- **Quota footer** — present + monotonic increment.
- **Structured errors** — `[invalid_chord]: …`, not raw.
- **Markdown formatting** — all four tools.

## Known edges (logged for v2.1, not regressions)
- `G7b13` / `C7b13` → no scale (natural-5 + ♭13 coexist; no scale contains both).
- `C7#9` → single scale (`dim_hw`) — correct, just not a full list.

Re-run after any engine change. A failure here means a regression against the Chase/Jax baseline.

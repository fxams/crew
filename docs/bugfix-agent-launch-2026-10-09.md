# Agent launch bugfix — 2026-10-09 (Qatar)

Sources: STRAW2GOLD + CATMEETING mainnet agent launches against `0b0e2d6`, then fixes on `main`.

| ID | Severity | Status |
|----|----------|--------|
| B1 | High | **Fixed** — atomic path now tries v0(+`CREW_LOOKUP_TABLE`) then **Jito bundle** `[create, lock]`; sequential fallback surfaces `lockPath` / `createSlot` / `lockSlot`; `CREW_ATOMIC_REQUIRED=1` aborts instead of racing |
| B2 | High | **Fixed** — crank + desk Distribute use `OnlinePumpSdk.buildDistributeCreatorFeesInstructions` (sweep before distribute; CreatorFeesNotSwept 6095) |
| B3 | Medium | **Fixed** — crank payer = `x-launcher-key` **or** `CREW_OPS_KEY` / buyback key (permissionless) |
| B4 | Medium | **Mitigated** — Autohire demotes missing/weak/known-bad X (`oxrxbt`); reasons note `pumpFollowers` |
| B5 | Low | **Already fixed** + regression note in `proof-stats.test.ts` |
| B6 | Low | **Fixed** — `GET /api/remits?mint=` filters; handles enriched like `/api/proof` |
| B7 | Cosmetic | **Fixed** — remit rows prefer tx meta lamport deltas over bps re-derive |
| B8 | Docs | **Partial** — launch always returns `hirePlan` (`null` when explicit crew); OpenAPI still thin on board routes |
| B9 | Low | **Fixed** — dry-run top-level `sufficient` |
| B10 | Low | **Fixed** — `effectiveBps` on crew + `shareholders[]` with roles |

## Operator knobs

```bash
# Compress static Pump accounts so single-tx atomic fits ≤1232 bytes
CREW_LOOKUP_TABLE=<alt-address>

# Abort launch instead of sequential race fallback
CREW_ATOMIC_REQUIRED=1

# Permissionless crank fee payer (no launcher secret on the wire)
CREW_OPS_KEY=<base58>

# Optional Jito auth / tip endpoint
CREW_JITO_UUID=
CREW_JITO_BUNDLE_URL=https://mainnet.block-engine.jito.wtf/api/v1/bundles
```

## Evidence mints

- STRAW2GOLD `GKeoMKEsSZPch2WF8cRk7FLkYwj2kEj2rVWEi92tDkAp`
- CATMEETING `3Fh3khbEmChb7cbHW1r3BJLZFp4Q1rVUKbuSPFnjatNR`

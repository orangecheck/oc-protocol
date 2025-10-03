# OrangeCheck Extension Key Registry

This document registers **signed, in-message** extensions for OrangeCheck v0 (see SPEC.md §2.2).
All keys are **lowercase ASCII** and extensions appear **sorted lexicographically** in the canonical message.

> **Compatibility:** Verifiers MUST ignore unknown keys unless a relying party (RP) opts into policy checks.

---

## Registered Keys (v0)

### `aud`
- **Type:** string (URL origin or scheme+host, e.g., `https://example.com`)
- **Purpose:** Bind the proof to a site/app origin; RPs MAY require equality to their own origin.
- **Verifier behavior:** If policy-enabled and mismatch → `aud_mismatch`.

### `bond`
- **Type:** integer (satoshis)
- **Purpose:** Declare exact stake amount; enforce minimum balance and cap scoring at this value.
- **Verifier behavior:** If `confirmed_balance < bond` → `bond_insufficient`. Use `bond` for `sats_bonded` metric (ignore surplus). Compute age via oldest-first greedy UTXO selection (see SPEC.md §5.4).

### `expires`
- **Type:** RFC-3339 UTC datetime (e.g., `2026-01-01T00:00:00Z`)
- **Purpose:** Time-box the proof.
- **Verifier behavior:** If `< now` → `expired` (warn/reject per RP policy).

### `network`
- **Type:** enum (`mainnet` | `signet`)
- **Purpose:** Select network for testing.
- **Verifier behavior:** If `signet` and verifier is not in test mode → `network_testmode`.

### `scope`
- **Type:** string (free-form UTF-8; ≤256 bytes recommended)
- **Purpose:** Human context label (e.g., `twitter:@alice`, `web:alice.dev`).
- **Verifier behavior:** Display only.

### `scoring`
- **Type:** string (scoring algorithm identifier, e.g., `v0`, `tier`, `time-weighted`)
- **Purpose:** Suggest which scoring algorithm the Subject prefers for this proof.
- **Verifier behavior:**
  - Verifiers MAY compute the requested score if the algorithm is supported.
  - Verifiers MUST always return raw `sats_bonded` and `days_unspent` metrics.
  - Unknown algorithms are ignored (verifier uses default or none).
  - This is **advisory only** — RPs validate raw metrics independently.
- **Examples:**
  - `scoring: v0` — Use protocol reference formula
  - `scoring: tier` — Return categorical tier (bronze/silver/gold/platinum)
  - `scoring: time-weighted` — Emphasize days over sats
  - `scoring: none` — Explicitly request no score computation
- **Registry:** See `/registry/scoring.md` for registered algorithms.
- **Security:** Subjects cannot game scores by choosing algorithms; RPs always validate raw metrics.

---

## Proposing a New Key

Open a PR adding a section to this file with:
1. **Motivation** and expected adoption path
2. **Type** and grammar (ABNF or JSON shape if complex)
3. **Security considerations** (replay, ambiguity, spoofing)
4. **Verifier behavior** (mandatory, optional, UI-only)
5. **Conformance tests** (new vectors under `/conformance/vectors`)

---

## Security Notes

- Keys MUST be unique and unambiguous. Prefer **narrow semantics** over overloaded fields.
- Avoid embedding secrets or user PII in values.
- When in doubt, bind site-specific proofs with `aud` and time-box with `expires`.

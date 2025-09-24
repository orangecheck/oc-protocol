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

### `cap`
- **Type:** string (CSV of key=value pairs). Suggested keys:
  - `min_sats` — integer (satoshis)
  - `min_days` — integer (days)
- **Purpose:** Advisory thresholds suggested by the Issuer/Subject.
- **Verifier behavior:** RP MAY enforce any subset.

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

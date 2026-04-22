# OrangeCheck Scoring Registry

**Status:** Normative
**Version:** v0

---

## Principles

- The raw metrics `sats_bonded` and `days_unspent` are the **source of truth**.
- Scores are **advisory** interpretations for display only.
- Relying parties MUST validate raw metrics. They MUST NOT gate access on a score alone.
- The protocol defines **one** reference algorithm (`v0`). RPs with specialized needs write their own — the registry deliberately does not try to preempt every use case.

---

## `v0` — the reference algorithm

```
score_v0 = round( ln(1 + sats_bonded) × (1 + days_unspent / 30), 2 )
```

**Output:** decimal, unbounded (typically 10–250).
**Use case:** general display, cross-context comparison.
**Implementers MUST use exactly this formula** if they report a `v0` score.

### Interpretation (informative)

| Range | Rough meaning |
|---|---|
| 10–20 | Light commitment |
| 20–50 | Medium commitment |
| 50–100 | Strong commitment |
| 100+ | Very strong commitment |

These are descriptive, not prescriptive. Platforms should set their own thresholds against raw metrics.

---

## Patterns RPs implement themselves (not registered algorithms)

These are useful patterns, but they are **not** protocol-registered scores. They belong to the RP's policy layer.

### Binary threshold

```
pass = (sats_bonded >= min_sats) AND (days_unspent >= min_days)
```

This is what `/api/check?min_sats=…&min_days=…` returns. It's the common-case sybil gate.

### Tiers

Pick sat/day cutoffs that make sense for your product (e.g., `silver` at 100k×90d, `gold` at 1M×180d). Don't expect interoperability — "Gold on platform X" does not mean "Gold on platform Y."

### Time-weighted / amount-weighted

If your product weighs time or stake more heavily, compute a custom score from raw metrics. Don't publish your formula as a registered algorithm — keep it in your policy code, where it belongs.

---

## Why the registry stayed small

Prior drafts of this document registered `time-weighted`, `amount-weighted`, `tier`, `threshold`, and `percentile` as canonical algorithms. Each one encoded a policy decision that is inherently RP-specific, and each one encouraged implementers to believe that "Gold tier" meant the same thing everywhere. It does not. The canonical move is to push that policy out of the protocol and into the RP. This registry now does that.

If you truly need a new inter-RP scoring algorithm — one that can be meaningfully compared across platforms — propose it with:

1. A concrete use case involving **multiple independent platforms** that would use the score interchangeably.
2. A deterministic formula over raw metrics only.
3. A security analysis of gaming strategies.
4. Reference test vectors.

Proposals that are really "a policy I want to use on my own app" should stay in the app's code.

---

## References

- [SPEC.md §6](../SPEC.md) — normative scoring rules
- [PROTOCOL.md §8](../PROTOCOL.md) — scoring design rationale
- [VISION.md](../VISION.md) — why the registry is intentionally small

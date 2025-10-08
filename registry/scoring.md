# OrangeCheck Scoring Algorithm Registry

**Status:** Proposed  
**Version:** v0 (Draft)

---

## Purpose

This registry documents scoring algorithms that MAY be used to compute reputation scores from OrangeCheck proofs. All algorithms operate on the same raw metrics (`sats_bonded`, `days_unspent`) but produce different scores optimized for different use cases.

**Key Principles:**
- Raw metrics (`sats_bonded`, `days_unspent`) are the source of truth
- Scores are **advisory** interpretations for UX/comparison
- RPs MUST validate raw metrics, not just trust scores
- Subjects MAY suggest algorithms via `scoring:` extension
- Verifiers MAY implement any subset of algorithms

---

## Registered Algorithms

### `v0` (Protocol Reference)

**Formula:**
```
score_v0 = round( ln(1 + sats_bonded) * (1 + days_unspent / 30), 2 )
```

**Output:** Decimal number (typically 10-250)

**Characteristics:**
- Balanced weighting of sats and time
- Logarithmic growth (diminishing returns)
- Unbounded range

**Use Cases:**
- General purpose reputation
- Cross-community comparison
- Default when no specific needs

**Interpretation:**
- 10-20: Low commitment
- 20-50: Medium commitment
- 50-100: Good commitment
- 100+: Excellent commitment

**Pros:**
- Smooth, continuous scale
- Considers both factors equally
- Reference implementation available

**Cons:**
- Hard to interpret absolute values
- Grows slowly for large amounts
- No clear "good" threshold

---

### `time-weighted`

**Formula:**
```
score = round( ln(1 + sats_bonded) * (days_unspent / 30)^1.5, 2 )
```

**Output:** Decimal number (unbounded)

**Characteristics:**
- Emphasizes long-term holding
- Days factor grows faster than linear
- Rewards patience over amount

**Use Cases:**
- Marketplace seller reputation
- Long-term community membership
- Proof of commitment over time

**Interpretation:**
- Higher scores indicate sustained commitment
- New addresses score low even with large amounts
- Encourages "skin in the game" over time

**Pros:**
- Discourages quick flips
- Rewards long-term participants
- Harder to game with fresh capital

**Cons:**
- Penalizes new participants
- Slow to build reputation
- May exclude legitimate newcomers

---

### `amount-weighted`

**Formula:**
```
score = round( ln(1 + sats_bonded)^1.5 * (1 + days_unspent / 30), 2 )
```

**Output:** Decimal number (unbounded)

**Characteristics:**
- Emphasizes capital commitment
- Sats factor grows faster than logarithmic
- Rewards large holders

**Use Cases:**
- Lending/credit assessment
- High-value transactions
- Capital-intensive services

**Interpretation:**
- Higher scores indicate larger capital commitment
- Time is secondary factor
- Whales score significantly higher

**Pros:**
- Reflects financial capacity
- Useful for risk assessment
- Clear correlation with capital

**Cons:**
- Favors wealthy participants
- Time becomes less meaningful
- May create plutocracy

---

### `tier`

**Formula:** Categorical thresholds

**Output:** String enum: `none`, `bronze`, `silver`, `gold`, `platinum`

**Thresholds:**
```
platinum: sats >= 10,000,000 AND days >= 365
gold:     sats >= 1,000,000  AND days >= 180
silver:   sats >= 100,000    AND days >= 90
bronze:   sats >= 10,000     AND days >= 30
none:     below bronze threshold
```

**Characteristics:**
- Discrete tiers, not continuous
- Both sats AND days required
- Visual badge-friendly

**Use Cases:**
- Social media verification badges
- Tiered access levels
- Visual reputation display

**Interpretation:**
- Clear, understandable levels
- Easy to communicate ("I'm Gold tier")
- Maps to visual badges/icons

**Pros:**
- Extremely easy to understand
- Works well for UI/badges
- Clear progression path

**Cons:**
- Arbitrary threshold choices
- Cliff effects at boundaries
- Less granular than continuous scores

---

### `threshold`

**Formula:** Boolean evaluation

**Output:** `pass` or `fail`

**Parameters:** RP-defined thresholds for `min_sats` and/or `min_days`

**Example:**
```
RP policy: min_sats=50000, min_days=60
Result: pass if (sats >= 50000 AND days >= 60), else fail
```

**Characteristics:**
- Binary outcome
- RP-defined thresholds (not in message)
- Simple access control

**Use Cases:**
- Forum posting privileges
- Feature gating
- Binary access control

**Interpretation:**
- Pass: Meets requirements
- Fail: Does not meet requirements

**Pros:**
- Simplest possible scoring
- Clear pass/fail criteria
- No ambiguity

**Cons:**
- No gradation
- Doesn't distinguish among passers
- Requires RP to set thresholds

---

### `percentile` (Advanced)

**Formula:** Rank-based comparison

**Output:** Integer 0-100 (percentile rank)

**Requirements:**
- Verifier maintains dataset of known proofs
- Computes rank relative to population
- Updates as new proofs arrive

**Characteristics:**
- Relative, not absolute
- Changes as population changes
- Requires global view

**Use Cases:**
- Leaderboards
- Competitive rankings
- Relative comparison

**Interpretation:**
- 90th percentile: Better than 90% of proofs
- 50th percentile: Median
- 10th percentile: Bottom 10%

**Pros:**
- Intuitive interpretation
- Automatically adjusts to population
- Good for competition

**Cons:**
- Requires centralized dataset
- Scores change over time
- Not deterministic from proof alone

---

## Using Scoring Algorithms

### In Canonical Messages (Subjects)

Subjects MAY include a `scoring:` extension to suggest a preferred algorithm:

```
orangecheck v0
npub: alice@nostr.com
address: bc1q...
purpose: public reputation bond (non-custodial)
nonce: a1b2c3d4e5f6...
issued_at: 2025-01-15T12:00:00Z
ack: I understand this links this address to my identity.
scoring: tier
```

This is **advisory only**. RPs always validate raw metrics.

### In Verifiers

Verifiers MAY compute requested scores if supported:

```json
{
  "ok": true,
  "metrics": {
    "sats_bonded": 150000,
    "days_unspent": 120,
    "score_v0": 46.05,
    "score_tier": "silver"
  }
}
```

Verifiers MUST always return `sats_bonded` and `days_unspent`.

### In Relying Parties

RPs SHOULD compute scores tailored to their use case:

```typescript
// Forum: Simple threshold
const canPost = sats >= 10000 && days >= 30;

// Marketplace: Time-weighted
const trustScore = Math.log(1 + sats) * Math.pow(days/30, 1.5);

// Social: Tier badge
const tier = getTier(sats, days);
```

RPs MUST NOT trust scores without validating raw metrics.

---

## Proposing New Algorithms

To propose a new scoring algorithm, submit a PR adding a section to this file with:

1. **Algorithm name** (lowercase, hyphenated, unique)
2. **Formula** (mathematical expression or pseudocode)
3. **Output type** (number, string, boolean, etc.)
4. **Characteristics** (key properties)
5. **Use cases** (when to use this algorithm)
6. **Interpretation** (what scores mean)
7. **Pros and cons** (trade-offs)
8. **Reference implementation** (optional, link to code)

**Naming conventions:**
- Use descriptive names: `time-weighted`, not `tw`
- Hyphenate multi-word names: `amount-weighted`
- Avoid version numbers in name (use separate versioning)

**Security considerations:**
- Algorithms MUST be deterministic (same inputs → same output)
- Algorithms MUST NOT require secrets or external data (except `percentile`)
- Algorithms SHOULD be resistant to gaming
- Document any known attack vectors

---

## Version History

- **v0 (Draft)**: Initial registry with 6 algorithms (v0, time-weighted, amount-weighted, tier, threshold, percentile)

---

## References

- [SPEC.md](../SPEC.md) - OrangeCheck Protocol Specification
- [PROTOCOL.md](../PROTOCOL.md) - Protocol Overview
- [extensions.md](extensions.md) - Extension Key Registry


---
title: OrangeCheck Protocol (OCP)
status: Draft
version: v0
license: CC-BY-4.0
audience: architects, wallet & verifier implementers, product teams
---

# OrangeCheck Protocol (OCP)

*A tiny, Bitcoin-native proof of “skin in the game.” Sign one message, prove control of an address, and let anyone recompute sats + time from public chain data. No accounts. No custody. No spend.*

## 1) Problem & Goals

**Problem.** Online reputation is either unverifiable (social proof) or invasive (KYC). We need a **portable, cryptographic, minimally identifying** proof of commitment.

**Goals**
- **Self-sovereign** — no accounts, no custodians, no escrow.
- **Verifiable anywhere** — any relying party can recompute from public chain data.
- **Low friction** — one signed, human‑readable message; no transactions required.
- **Portable** — one badge link/embed works across the web.
- **Rotatable** — fresh address per badge; retire by spending.
- **Privacy‑aware** — pseudonymity by default, optional label binding.

**Non‑goals (v0)**
- Multi‑address aggregation
- ZK/private balance proofs (may appear in a future version)
- On‑chain attestations

## 2) Roles

- **Subject** — the entity asserting a claim (person/service).
- **Issuer** — client UI that constructs the canonical message and obtains a signature from the Subject’s wallet.
- **Verifier** — any app/page that checks the signature and recomputes metrics from public chain data.
- **Relying Party (RP)** — a site/app that interprets the badge (may enforce local policy).

> In typical flows the Issuer and Subject are the same browser session; the wallet performs signing.

## 3) Claim Model

A single **address‑control** claim binds:

- A **Bitcoin mainnet singlesig address** (`P2WPKH`, `P2TR`, or legacy `P2PKH` for compat)
- An optional **identity hint** (npub/handle/web origin)
- Optional **scoping/time‑boxing extensions** (audience, expiry, etc.)

The claim is an **offline signature** over a canonical UTF‑8 text message.

## 4) Bond & Streak

At verification time, the Verifier recomputes from public data:

- **sats_bonded** — sum of **confirmed, unspent UTXOs** at the address
- **days_unspent** — floor of days since the *earliest confirmation time* among active UTXOs

A suggested **score v0** is provided for UX comparability (see §8).

Spends naturally update the active UTXO set and can reset the streak.

## 5) Lifecycle

1. **Issue**  
   - Issuer builds canonical message (core fields + optional extensions) and requests signature (**BIP‑322 preferred**).
   - Subject’s wallet signs. Issuer packages `(addr, msg, sig, scheme)` into a shareable link or JSON envelope.

2. **Share/Embed**  
   - Subject publishes a link/QR or embeds a badge that references `(addr, msg, sig)`.

3. **Verify**  
   - Any Verifier:  
     a) Validates signature against `addr` and full `msg`.  
     b) Fetches current UTXOs, recomputes metrics, renders status & score.  
     c) Optionally enforces site policy on extensions (e.g., `aud`, `expires`).

4. **Rotate**  
   - Subject can retire by spending (or simply abandon) and then issue a new badge at a **fresh** address.

## 6) Invariants (v0)

- **No custody.** Protocol never requires moving coins.
- **Transparency.** Address is visible to enable recomputation.
- **Determinism.** Message is strictly canonicalized; any deviation invalidates signatures.
- **Compatibility.** Prefer **BIP‑322**; allow legacy `signmessage` *only* for `1…` addresses.

## 7) Security & Privacy Considerations

- **Replay bounds.** Canonical header + fixed `purpose` + random `nonce` + `issued_at` limit cross‑context replay.
- **Linkability.** Use **fresh addresses**. Identity is optional and inside the signature. Rotation is encouraged.
- **Network privacy.** Verifiers query public Esplora endpoints; Tor/VPN recommended where appropriate.
- **Phishing resistance.** RPs may enforce `aud:` extension to bind proofs to an origin.

## 8) Metrics & Scoring (advisory)

### Raw Metrics (Required)

Verifiers **MUST** return raw metrics:
- **`sats_bonded`** — Sum of confirmed UTXOs
- **`days_unspent`** — Days since earliest UTXO

These are the **source of truth**. RPs validate these, not scores.

### Scoring (Optional)

Verifiers **MAY** compute scores. The protocol provides a reference algorithm:

```
score_v0 = round( ln(1 + sats_bonded) * (1 + days_unspent / 30), 2 )
```

**However, RPs are encouraged to compute scores tailored to their use case:**

- **Forums:** Simple threshold (`sats >= 10k AND days >= 30`)
- **Marketplaces:** Time-weighted (emphasize long-term commitment)
- **Social media:** Tier badges (Bronze/Silver/Gold/Platinum)
- **Lending:** Amount-weighted (emphasize capital)

See `/registry/scoring.md` for registered algorithms and guidance.

Scores are **versioned** independently (e.g., `score_v0`, `score_tier`). Different algorithms are **not** comparable.

## 9) Versioning & Extensibility

- **Protocol header:** `orangecheck v0` (strict match).
- **Extensions (signed, advisory):** key/value lines appended after the core message; keys lexicographically sorted.
- **Registry (initial):** `aud`, `cap`, `expires`, `network`, `scope` (defined normatively in SPEC.md).
- Unknown extensions **MUST** be safely ignored by verifiers unless a local policy opts in.

## 10) Governance

- **Changes that require version bump:** header string, core field wording/order, signature schemes, canonicalization.
- **Extension registry:** PRs proposing new keys include motivation, security notes, and interop tests.
- **Reference code:** maintained as informative only; **conformance is defined by SPEC.md tests**.

## 11) Threat Model (abridged)

- **Copying links** — benign; does not transfer control (signature verifies only for the original address).
- **Old‑but‑valid proof** — RPs may enforce freshness via `expires:` or minimum `days_unspent`.
- **UTXO spoofing** — mitigated by recomputing from public explorers; RPs can cross‑check multiple sources.
- **Signature confusion** — fixed header & `purpose` string reduce mis‑binding.

## 12) Implementation Notes (informative)

- **Wallets** — expose a “Sign Message” (BIP‑322) flow that accepts arbitrary text and returns a string signature.
- **Verifiers** — do **not** cache metrics as truth; always recompute from network on load, then cache for UX only.
- **Badges** — display signature status + `sats_bonded` + `days_unspent` + `score_v0` + `sc=v0`.

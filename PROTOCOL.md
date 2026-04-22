---
title: OrangeCheck Protocol (OCP)
status: Draft
version: v0
license: CC-BY-4.0
audience: architects, wallet & verifier implementers, product teams
---

# OrangeCheck Protocol (OCP)

*A tiny, Bitcoin-native proof of "skin in the game." Sign one message, prove control of an address, and let anyone recompute sats + time from public chain data. No accounts. No custody. No spend.*

## 1) Problem & Goal

**Problem.** Every open internet protocol — Nostr, the fediverse, decentralized forums, airdrops — has the same unsolved problem: *how do we keep bots out without becoming a centralized identity provider?* Existing answers (KYC, phone-number verification, CAPTCHAs, centralized reputation graphs) either don't work at scale or require trust in a platform.

**Goal.** A sybil-resistance signal that is:

- **Trustless** — any verifier recomputes from public chain data.
- **Self-sovereign** — no accounts, no custodians, no escrow.
- **Low-friction** — one signed, human-readable message; no transactions.
- **Portable** — one proof works across every platform that chooses to consume it.
- **Rotatable** — fresh address per proof; retire by spending.
- **Privacy-aware** — pseudonymity by default, optional handle binding.

**Non-goals.**
- Multi-address aggregation into a unified "identity score."
- ZK / private balance proofs (may appear in a future version).
- On-chain attestations.
- Agent delegation credentials (retired — use UCAN).

## 2) Roles

- **Subject** — the human (or service) making the claim.
- **Issuer** — the client that builds the canonical message and obtains a wallet signature.
- **Verifier** — any app or server that checks the signature and recomputes metrics from public chain data.
- **Relying Party (RP)** — a platform that interprets the proof and decides whether to honor it.

In typical flows, Subject and Issuer are the same browser session; the wallet performs signing.

## 3) Claim Model

A single **address-control** claim binds:

- A **Bitcoin mainnet singlesig address** (`P2WPKH`, `P2TR`, or legacy `P2PKH`).
- An optional set of **identity hints** (`nostr:npub…`, `github:user`, `dns:domain`, `twitter:@handle`).
- Optional **signed extensions** (audience, bond, expiry, network, scope).

The claim is an **offline signature** over a canonical UTF-8 text message.

## 4) Bond & Time

At verification time, the Verifier recomputes from public data:

- **`sats_bonded`** — sum of confirmed, unspent UTXOs at the address, OR if the `bond:` extension is present, exactly that declared value (surplus is ignored).
- **`days_unspent`** — floor of days since the earliest confirmation time among active UTXOs, OR if `bond:` is present, computed via oldest-first greedy selection (see SPEC.md §7.5).

Together these define the **stake**. A reference `score_v0` is provided for UX comparability (see §8). RPs are free to compare raw metrics against their own thresholds.

When `bond:` is used, the proof fails if confirmed balance < bond. Spending old UTXOs can force newer UTXOs into the bonded set, resetting age.

## 5) Lifecycle

1. **Issue**
   Issuer builds the canonical message (core fields + optional extensions) and requests a signature (**BIP-322 preferred**). The wallet signs. The Issuer packages `(addr, msg, sig, scheme)` into a JSON envelope and/or publishes it to Nostr.

2. **Share / Embed**
   Subject publishes a link, QR, or embed widget that references the attestation.

3. **Verify**
   Any Verifier:
   a) Validates the signature against `addr` and the full `msg`.
   b) Fetches current UTXOs, recomputes metrics, renders status.
   c) Optionally enforces site policy on extensions (e.g., `aud`, `expires`).

4. **Consume**
   Platforms gate access by comparing `sats_bonded` and `days_unspent` to their own thresholds — typically via `/api/check` or the SDK's `check()` call.

5. **Rotate**
   Subject may retire by spending (or simply abandoning) and issuing a new proof at a fresh address.

## 6) Invariants (v0)

- **No custody.** The protocol never requires moving coins.
- **Transparency.** The address is visible so any verifier can recompute.
- **Determinism.** The message is strictly canonicalized; any deviation invalidates signatures.
- **Compatibility.** Prefer **BIP-322**; allow legacy `signmessage` *only* for `1…` (P2PKH) addresses.

## 7) Security & Privacy

- **Replay bounds.** Canonical header + fixed `purpose` + random `nonce` + `issued_at` limit cross-context replay.
- **Linkability.** Each proof links a Bitcoin address to the bound handles. Use **fresh addresses** per proof. Rotation is encouraged.
- **Network privacy.** Verifiers query public Esplora endpoints; Tor / VPN is recommended where appropriate.
- **Phishing resistance.** RPs MAY enforce the `aud:` extension to bind a proof to an origin.
- **Identity bindings are self-asserted.** Handles inside `identities:` are claims, not proofs. Verifiers MUST check each handle out-of-band (Nostr event, GitHub gist, DNS TXT record, tweet URL) before honoring.

## 8) Metrics & Scoring (advisory)

### Required raw metrics

Verifiers **MUST** return:

- `sats_bonded` — integer, sum of confirmed UTXOs (or `bond:` value).
- `days_unspent` — integer, days since earliest bonded UTXO confirmed.

These are the source of truth. RPs validate against these, not against scores.

### Reference score

```
score_v0 = round( ln(1 + sats_bonded) * (1 + days_unspent / 30), 2 )
```

One algorithm. RPs with specialized needs write their own against raw metrics; the protocol does not ship an algorithm zoo.

Scores are **advisory**. RPs MUST NOT trust a displayed score without recomputing raw metrics independently.

## 9) Versioning & Extensibility

- **Protocol header:** `orangecheck` (strict match).
- **Extensions (signed, advisory):** `key: value` lines appended after the core, lexicographically sorted.
- **Registry:** `aud`, `bond`, `expires`, `network`, `scope`. Unknown extensions MUST be ignored safely by verifiers.

## 10) Governance

- **Changes that require a version bump:** header string, core field wording/order, signature schemes, canonicalization.
- **Extension registry:** proposals include motivation, security notes, and interop tests.
- **Reference code:** informative only. Conformance is defined by SPEC.md and its test vectors.

## 11) Threat Model (abridged)

- **Copied links** — benign. Copying a link does not transfer control; the signature verifies only for the original address.
- **Old-but-valid proof** — RPs can enforce freshness via `expires:` or a minimum `days_unspent`.
- **UTXO spoofing** — mitigated by recomputing from public explorers; RPs can cross-check multiple sources.
- **Signature confusion** — the fixed header and `purpose` string reduce mis-binding.
- **Identity squatting** — an attacker can claim `github:alice` without controlling the account. RPs MUST verify handle ownership out-of-band.

## 12) Implementation Notes

- **Wallets** — expose a "Sign Message" (BIP-322) flow that accepts arbitrary text and returns a string signature.
- **Verifiers** — never cache metrics as truth. Always recompute on load; cache only for UX.
- **Badges / embeds** — display signature status + `sats_bonded` + `days_unspent` + `score_v0`, along with the algorithm identifier `sc=v0`.
- **APIs** — the load-bearing surface is `GET /api/check?addr=…&min_sats=…&min_days=…`. Design for a 150ms p50.

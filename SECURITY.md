---
title: OC Attest — Security Model
status: Active
version: 1.0
last_updated: 2026-04-25
---

# Security Model

This document is the threat model for **OC Attest**: the proof-of-Bitcoin-stake
sybil-resistance primitive. It describes what an attestation **does** prove
cryptographically, what it **does not**, and the realistic adversaries an
integrator should plan for.

For the family-wide threat framework that every OrangeCheck protocol inherits,
see [`docs.ochk.io/ecosystem/security`](https://docs.ochk.io/ecosystem/security).
This file covers the attestation-specific layer on top.

---

## 1. What a valid attestation cryptographically proves

A verifier that resolves an OC Attest attestation against live Bitcoin chain
state can rely on **three** facts:

1. **Address control.** The signer holds the private key for the Bitcoin
   address listed in the attestation, at the time the attestation was signed.
   Source: BIP-322 signature over the canonical message.
2. **Sats bonded.** The address held `sats_bonded` sats unspent at the moment
   the verifier resolved the chain — re-derived from current UTXOs, not
   trusted from the attestation envelope.
3. **Days unspent.** The bonded UTXO has been confirmed for at least
   `days_unspent` days, again re-derived live.

…and **one** self-asserted fact:

4. **Handle ownership.** Claims like `github:alice` or `nostr:npub1…` are
   self-asserted — the verifier MAY check ownership out-of-band but the
   attestation alone does not prove it.

If any of those four checks fail at verify time, the attestation MUST be
rejected.

## 2. What an attestation does NOT prove

- **Personhood / uniqueness.** An attestation says nothing about the human
  behind the address. One person can hold many addresses; many addresses can
  collude. OC Attest raises the *cost* of sybils — it does not make them
  impossible.
- **Reputation.** Sats × time is an economic signal, not a moral one.
  Long-held coins are not "good"; freshly-bonded coins are not "bad".
- **Future control.** The signer controlled the address when they signed.
  After the signature, key custody can change (theft, sale, multisig
  reorganisation) without the verifier knowing. Treat attestations as
  point-in-time, not durable identity.
- **Chain finality.** The bond can disappear: the holder can spend the UTXO
  the moment the attestation is published. Verifiers SHOULD re-resolve
  chain state on every check, never cache the result longer than the
  application's tolerance for sybil entry.

## 3. Adversary model

OC Attest is designed to defend a public verifier against:

| Adversary                              | What they can do                                                                       | What OC Attest prevents                                                       |
| -------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Anonymous sybil farmer**             | Cheaply produce N synthetic identities, post canned content                            | The bond cost scales linearly per identity — unprofitable above tiny gates    |
| **Forum spammer with one wallet**      | Sign many messages from one address                                                    | One address ⇒ one attestation; the bond doesn't multiply                      |
| **Stolen-key opportunist**             | Use a compromised key to sign attestations and claim the rightful holder's reputation  | Address rotation defeats this — the holder can publish a fresh attestation    |
| **Compromised reference verifier**     | A malicious operator of `attest.ochk.io` returns false `ok: true` results              | Self-host the verifier, or re-derive the proof yourself — chain state is open |
| **Chain-watching deanonymizer**        | Cluster addresses by spending behavior                                                 | Out of scope — OC Attest publishes the address; privacy is the user's call    |
| **Block-reorg griefer**                | Produce an attestation that rolls back when the bonding tx is reorged                  | Verifiers MUST require ≥ N confirmations (N is application policy)            |

It is explicitly **not** designed to defend against:

- **Coercion** — a holder forced to sign one attestation can be forced to
  sign others.
- **Insider abuse** — if the publishing platform is compromised, attestation
  *content* can be tampered (the signature still verifies; the metadata might
  be stripped or replaced). Always re-fetch from at least two relays.
- **Long-game cohort attacks** — a state-level adversary that bonds 100k sats
  for 5 years to look like a real long-term holder. Cost rises linearly with
  bond × time; design your gate accordingly.

## 4. Verifier obligations

A correct verifier MUST:

1. **Re-derive sats and days** from current chain state — do not trust
   `sats_bonded` or `days_unspent` claimed in the envelope.
2. **Check the BIP-322 signature** against the canonical message bytes,
   exactly. Use the family's RFC-8785-compliant canonicaliser
   (see [`/ecosystem/canonical-message`](https://docs.ochk.io/ecosystem/canonical-message)).
3. **Validate the issuer / audience claims** if the gate scopes proofs to a
   specific origin (`expectedAudience`). Drop attestations issued for a
   different site.
4. **Enforce a confirmation depth** before accepting `days_unspent`. One
   block is insufficient — six is the family default; high-stakes gates
   should require more.
5. **Reject expired attestations** if the application's freshness window
   says so. The signature alone has no expiry; the application's policy is
   authoritative.

A correct verifier SHOULD:

- Cache verification results for the lifetime of the chain snapshot used.
- Re-resolve on every gate hit if the gate is real-time (sign-in, ballot,
  airdrop).
- Log the snapshot block hash + height alongside every accepted attestation
  so audits can reproduce the decision.

## 5. Privacy notes

- Every attestation is **public by design**. Publishing an attestation
  reveals the holder's Bitcoin address, the bonded UTXO, and any claimed
  handles. There is no zero-knowledge mode.
- To preserve privacy across multiple gates, hold a different address per
  context. Each gate sees only its own attestation; on-chain analysis can
  still cluster — that's a Bitcoin-level concern, not an OC Attest
  concern.
- For privacy-preserving stake signals, look at Sismo, zkBadges, or similar.
  OC Attest is not in that design space.

## 6. Reporting

Security issues that may affect verifiers or the reference implementation:
**security@ochk.io**.

Please **do not** open a public issue for a verifier-impacting bug.
We'll triage, fix, and disclose with credit.

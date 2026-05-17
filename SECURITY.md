---
title: OC Attest — Security Model
status: Active
version: 1.1
last_updated: 2026-05-16
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

## 6. Binding Attestation threat model (OC Attest v1)

The **Binding Attestation** (`SPEC-BINDING.md`) is a different artifact with
a different threat surface from the v0 stake attestation. It is a mutual
proof that one Bitcoin address and one Nostr public key are one principal.
It carries no sats and no chain state — so there is **no UTXO lookup**, no
confirmation-depth concern, and no `bond_insufficient` mode. Its security
is entirely about the **two signatures** and the **canonical message**.

### 6.1 What a valid binding cryptographically proves

1. **BTC key control.** The holder of the `btc:` address signed the binding
   message — BIP-322, the strongest decentralized address-control proof.
   This is the artifact's Bitcoin-load-bearing root.
2. **Nostr key control.** The holder of the `nostr:` npub signed the same
   binding message — via a NIP-01 event (BIP-340 Schnorr).
3. **Co-signature.** Both signatures cover the **byte-identical** canonical
   message (the single-message rule). The two keys therefore jointly
   attest they are one principal.

…and **one referenced, not proven, fact:**

4. **`did:oc` label.** The `principal: did:oc:…` line is what both keys
   signed, but the *meaning* of that `did:oc` is minted by the auth host,
   not by the artifact. A verifier treats it as an opaque committed label.

### 6.2 What a binding does NOT prove

- **Personhood.** Two keys being one principal is not proof of a unique
  human. A binding raises the cost of conflating identities, nothing more.
- **`did:oc` authority.** The binding does not make `did:oc` derivation
  decentralized. The auth-host database remains authoritative for what a
  `did:oc` *is* (AUTH-PLAN §10 Fork 2a). The binding is a **portable,
  re-importable backup** of the account graph — not a source of truth. A
  verifier MUST NOT "resolve" `did:oc` against any server to accept a
  binding.
- **Liveness.** A binding is a standing claim, possibly years old. It does
  not prove the principal is *present right now* — that is the job of the
  `orangecheck-auth` challenge (`SPEC.md` §14), which an auth host runs in
  addition to loading a binding.

### 6.3 Attack scenarios

| # | Scenario | Status |
|---|---|---|
| B1 | **Signature replay across wire formats.** An attacker lifts a BIP-322 signature from a v0 stake attestation (or an auth challenge) and presents it as a binding. | **Mitigated** — three distinct header literals (`orangecheck`, `orangecheck-auth`, `orangecheck-binding`) plus the binding-only `v: 1` line. A verifier rejects any non-matching header (`E_BAD_HEADER`); no shared parser path exists. |
| B2 | **Half-signed binding.** An attacker publishes a binding with a valid BIP-322 signature but a forged/absent Nostr signature, hoping a lazy verifier accepts one signature. | **Mitigated** — a verifier MUST verify *both* signatures (`SPEC-BINDING.md` §9). One signature is an unanswered claim, not a binding. |
| B3 | **Message-mismatch splice.** An attacker pairs a real BTC signature over message *A* with a real Nostr signature over message *B* (e.g. swapping the `principal` or `nonce`). | **Mitigated** — the single-message rule (§4.3): the verifier checks the Nostr event `content.message` is byte-identical to the BIP-322-covered `message`, and rejects otherwise (`E_MESSAGE_MISMATCH`). Vector `bv08`. |
| B4 | **Line-smuggling.** A field value carries an embedded LF (e.g. `principal` = `did:oc:…\nbtc: bc1qattacker`) to forge an extra line in the signed text. | **Mitigated** — every field value is constrained to printable ASCII with no CR/LF (`SPEC-BINDING.md` §3.5); issuer and verifier both reject control characters. Vector `bv06`. |
| B5 | **Nonce-free replay.** Without a nonce, two bindings of the same key pair would be identical artifacts; a captured signature would be reusable. | **Mitigated** — a fresh 16-byte random `nonce` is mandatory; it makes every message and therefore every `binding_id` and Nostr `d` tag unique. |
| B6 | **Nostr key substitution.** An attacker publishes the binding event under a different Nostr key than the `nostr:` line names, hoping the verifier trusts the event author. | **Mitigated** — the verifier checks `event.pubkey` equals the x-only decoding of the `nostr:` npub (`E_NOSTR_KEY_MISMATCH`). |
| B7 | **Nostr event id forgery.** An attacker hands over an event whose `id` does not match its serialization, so a verifier that trusts `id` verifies a Schnorr signature over the wrong digest. | **Mitigated** — the verifier recomputes the NIP-01 event id from the canonical serialization before checking the Schnorr signature (`E_NOSTR_ID_INVALID`). |
| B8 | **`binding_id` spoofing.** An attacker supplies an envelope whose `binding_id` does not match `SHA-256(message)`, to make a binding look like a different (e.g. already-trusted) one. | **Mitigated** — the verifier recomputes `binding_id` and rejects a mismatch (`E_ID_MISMATCH`); top-level convenience copies are likewise re-checked against the parsed message (`E_FIELD_MISMATCH`). |
| B9 | **Relay tamper / withholding.** A malicious relay serves a modified binding event or withholds it. | **Mitigated for tamper** — any modification breaks one of the two signatures or the id checks; the relay is never trusted for authenticity, only used to *fetch* bytes. **Partially mitigated for withholding** — a withheld binding is simply not found; query multiple relays. |
| B10 | **Stale binding after key loss.** The Nostr or BTC key is later compromised; the old binding still verifies. | **Accepted / partially mitigated** — like the v0 attestation, a binding is point-in-time. Mitigations: set the `expires:` extension; publish a fresh binding under a new `principal`. There is no revocation event (consistent with `LIFECYCLE.md`). |
| B11 | **Email smuggled in as a counter-identity.** A future integrator wants email in a binding. | **Out of scope by construction** — email holds no signing key and cannot counter-sign; `SPEC-BINDING.md` §12 forbids it, and a conforming implementation never writes an email into a binding artifact. |
| B12 | **Auth-host DB loss.** OrangeCheck's account database is wiped. | **Mitigated for key-to-key links** — the full set of published kind-30079 bindings is a reconstructable backup: each carries a *signed* `principal`, so the `did:oc ⇄ btc ⇄ nostr` graph rebuilds offline-verifiably. Only *email* links (custodial, never in a binding) are lost and must be re-established via OTP. |

### 6.4 Why the dual signature satisfies the v0 retirement criterion

OC Attest v0 retired its `email:` / `did:` identity bindings "until
reliable, decentralized proof-of-control mechanisms are specified." A
**counter-signature is exactly that mechanism** — for any identity that
holds a signing key. A Binding Attestation does not re-open the retired v0
`identities:` prefixes; it is a separate artifact in which *both* sides
prove control with their own key. It is offline-verifiable (no server),
Bitcoin-load-bearing (the BIP-322 signature is the root and would not
survive an Ed25519 substitution of the BTC half), content-addressed, and
zero-custody. It therefore *satisfies the condition under which the
retirement said the feature could return* — without weakening any v0
invariant. Email still cannot qualify, so email still is not in the
artifact (B11). The result is consistent, not a loophole.

### 6.5 The bond is a backup, not a source of truth

The Binding Attestation makes the auth-host identity graph **survivable**,
not **decentralized**. The auth-host database remains authoritative for
`did:oc` day-to-day. The bond's value is disaster recovery (B12) and
portability: a user can re-import their own bindings, and OrangeCheck can
rebuild its account graph from public Nostr data after a database loss.
Verifiers and integrators MUST NOT treat a binding as the definition of a
`did:oc`. This is the settled AUTH-PLAN §10 Fork 2a decision; the purer
"bond *defines* `did:oc`" model (Fork 2b) is explicitly future work
(`SPEC-BINDING.md` §15).

## 7. Reporting

Security issues that may affect verifiers or the reference implementation:
**security@ochk.io**.

Please **do not** open a public issue for a verifier-impacting bug.
We'll triage, fix, and disclose with credit.

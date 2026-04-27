# Lifecycle of an OrangeCheck attestation

> **Normative companion to [`SPEC.md`](./SPEC.md) and [`NIP_ORANGECHECK.md`](./NIP_ORANGECHECK.md) §Revocation.** This document specifies what publishers MAY do to an attestation after publication, and what verifiers MUST do in response. It introduces no new envelope kinds or canonical-message fields. It pins down the lifecycle stance the existing spec already takes and clarifies a wording ambiguity in `NIP_ORANGECHECK.md` §Revocation §2.

## 0. The family stance

OrangeCheck is the progenitor of a six-verb family (attest, lock, vote, stamp, agent, pledge). Every artifact across the family is a **signed envelope**. The signature is the truth; the Nostr event is a directory entry; the bytes already exist on relays and in caches the moment an envelope is published. *Delete* is therefore not a protocol primitive in any verb of the family. The vocabulary the family does define is:

| Verb | What it means |
|---|---|
| **replace** | Publish a new envelope under the same Nostr addressable coordinate (`(kind, pubkey, d)`). NIP-33 / NIP-78 replacement applies. |
| **revoke** | Publish a *separate, signed* envelope that ends the legitimacy of a prior one. Per-verb whether this exists. |
| **withdraw** | Spend the Bitcoin UTXO(s) backing the bond. Visible to verifiers on the next live check. |
| **expire** | Reach `expires_at`. |
| **hide (out-of-protocol)** | A reference dashboard MAY filter the artifact out of its UI. No protocol effect. |
| **request relay deletion (out-of-protocol)** | Publish a NIP-09 kind-5 event. Best-effort; not normative. |

## 1. OrangeCheck attestation lifecycle

OrangeCheck attestations are **content-addressed self-claims**. The `attestation_id` is `SHA-256(canonical_message)`, and on Nostr the d-tag *is* the `attestation_id` (`NIP_ORANGECHECK.md` line 61). This combination has a structural consequence the rest of this document elaborates: *same-d "replacement" of an attestation is not possible*, because the d *is* the content hash.

### 1.1 No explicit revocation envelope is defined

This was already established by `NIP_ORANGECHECK.md` §Revocation:

> An explicit revocation event kind is deliberately **not** defined by this NIP.

This LIFECYCLE document reaffirms that stance and extends it:

- **No `revoked: true` flag.** A canonical message containing such a field is malformed and verifiers MUST reject it (`E_BAD_MESSAGE` per `SPEC.md`).
- **No "withdraw" envelope.** The bond is withdrawn by spending UTXOs on Bitcoin, never by publishing a Nostr event (§1.4).
- **No new kind.** The verb is content with the primitives Bitcoin and NIP-78 already give it.

If a future ratified spec amendment adds a structured revocation primitive, it will land here and in `NIP_ORANGECHECK.md` simultaneously. Until then, conforming implementations MUST treat any Nostr event purporting to revoke an attestation as out-of-protocol.

### 1.2 "Parameterised replacement" — what the prose really means

`NIP_ORANGECHECK.md` §Revocation §2 reads:

> Explicit parameterised replacement — the publisher emits a new kind-30078 event with the same `d` value. […] a replacement event carries a *different* ID; the old event remains discoverable but the new one supersedes it for the publisher's intent.

This wording is internally inconsistent (the d-tag *is* the attestation ID, so two events with the "same `d`" must have the same ID). The clarification is:

- The d-tag is the `attestation_id`. It is **stable** for a given attestation.
- Two distinct attestations from the same address — say, one with `expires_at: T1` and one with `expires_at: T2` — have **different `attestation_id`s** and therefore **different d-tags**. They both live as separate, equally-canonical events under their own `(pubkey, kind, d)` coordinates.
- "Replacement" in the existing prose refers to the *publisher's intent* in the social sense, not to NIP-33 / NIP-78 replacement semantics. There is no relay-side replacement of an attestation by another attestation.

A verifier looking up `attestation_id = X` always returns `X`. Publishing a fresh attestation `Y` does not change `X`'s state.

### 1.3 The only protocol-level change-of-state primitive: `expires_at`

The single in-protocol mechanism that changes an attestation's verifier-visible state is `expires_at`:

- Verifiers MUST reject an attestation whose `expires_at` is in the past as `expired` (`SPEC.md` §error codes; `NIP_ORANGECHECK.md` line 123).
- A publisher choosing a tight `expires_at` at sign time bounds the attestation's window. There is no way to pull `expires_at` *forward* after publication; the canonical message is already signed and content-addressed.
- This means `expires_at` is a **forward-looking commitment**, not a retroactive control. Pick it accordingly.

### 1.4 Bond withdrawal — the de facto exit

`NIP_ORANGECHECK.md` §Revocation §1 already specifies:

> Implicit on-chain — spending the bonded UTXOs drops `sats_bonded` below `bond:` (or to zero), which every verifier sees on next check.

This is the **only effective way to neutralize an attestation before its `expires_at`**. The signature still verifies; the bound identities remain bound; but every verifier re-resolves chain state on every check (`SPEC.md` §verification), so the live `sats_bonded` / `days_unspent` / `score` triple collapses the moment the UTXOs are spent. Relying parties whose policy compares the live triple against thresholds will then admit or deny accordingly.

Withdrawal is permitted by Bitcoin and never blocked by this spec.

### 1.5 Out-of-protocol controls

The reference dashboard at [ochk.io/dashboard](https://ochk.io/dashboard) MAY offer:

- **Hide on my dashboard** — local UI filter; no protocol effect. Verifiers MUST ignore.
- **Withdraw bond (informational)** — the dashboard MAY guide the user to spend the UTXOs that back the bond, surfacing exactly which UTXOs are involved and what the score collapse will be. The dashboard does *not* perform the spend; it can only tell the truth about what spending implies (§1.4).
- **Request relay deletion** — best-effort NIP-09 kind-5 event citing the kind-30078 event id. Some relays honor; many don't; cached copies elsewhere are unaffected. Verifiers MUST ignore.

A conforming verifier evaluates an attestation strictly per `SPEC.md` §verification — signature validity, identity bindings, `expires_at`, live chain state. The dashboard's UI affordances neither extend nor override that logic.

### 1.6 What "revoke" means in the dashboard UI, honestly

A reference dashboard MAY surface an action labeled "revoke" on an attestation, but it must do so honestly. The action MAY be implemented as one or both of:

1. **Withdraw bond** — guidance on how to spend the UTXOs. The score collapse is the actual revocation effect.
2. **Request relay deletion (NIP-09)** — best-effort; explicitly labeled as such.

A dashboard MUST NOT label as "revoke" any action that:

- Publishes a fresh attestation under a new `attestation_id` and pretends this retracts the prior one. It does not — both attestations coexist and the prior id remains queryable.
- Sets a `revoked` flag in a canonical message. Such messages are malformed (§1.1).
- Claims to "delete" the attestation. Nothing on Bitcoin or Nostr is being deleted.

## 2. Compliance summary

| Implementation MUST | Implementation MUST NOT |
|---|---|
| Re-resolve `sats_bonded` / `days_unspent` / `score` against live chain state on every verification call. | Define or honor any "attestation revocation" envelope kind, tag, or canonical-message field beyond the existing `expires_at`. |
| Reject an attestation with `expires_at` in the past as `expired`. | Treat a fresh attestation under a new `attestation_id` as a retraction of an older one — both are equally canonical until each one's own `expires_at`. |
| Treat `attestation_id` as stable (`d-tag = id`); never expect Nostr-relay-side replacement of an attestation by another attestation. | Treat dashboard-local hide flags or NIP-09 deletion-request events as protocol signals. |
| Treat the bond-withdrawal effect on `score` as the primary in-protocol mechanism for ending an attestation early. | Surface a UI action labeled "delete" or "revoke" that does not correspond to one of the primitives in §1.5–§1.6. |

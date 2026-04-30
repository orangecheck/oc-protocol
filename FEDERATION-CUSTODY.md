---
title: OrangeCheck — Federation Custody Extension (proposal)
status: Draft (proposal · not yet normative)
version: 1.2-draft-1
date: 2026-04-30
companion-to: SPEC.md
audience: engineers implementing me.ochk.io federation custody, Fedimint signers, custody-aware verifiers
---

# OC Attest v1.2 — Federation Custody

> **Status: proposal.** Not normative. Tracks for ratification alongside the
> oc-agent-protocol v1.2 federation principal extension (`FEDERATION.md`).
> v1.0 / v1.1 verifiers MUST reject federation-custodied attestations as
> malformed; v1.2 verifiers MUST accept them.

## 0. Why this exists

`me.ochk.io` claims **federation-custodied by default, self-custody when
ready**. The federation-custody half of that claim has no protocol-level
backing today. v1 attestations bind an identity to a single Bitcoin
address whose **single private key** authorizes signatures (BIP-322).
That's correct for self-custody. It's wrong for the default state of
every me.ochk.io account, where:

- the user's "Bitcoin address" is the address the federation **signs on
  behalf of** under a threshold (`M`-of-`N` guardians);
- no single guardian (and not OC the company) holds the full private key;
- the user can graduate to single-key custody — same address, different
  signing method.

Without this extension a verifier sees only `address`, can't tell
federation from self-custody, and has no way to validate that an
authorization (sign-in, payment, delegation issuance) was produced by a
guardian quorum rather than a single rogue actor pretending to be the
quorum.

This extension closes that gap. It's modeled on `oc-agent-protocol`'s
v1.2 federation principal pattern (`FEDERATION.md`) so the family
shares one mental model of "M-of-N guardian set as a content-addressed
descriptor."

## 1. Scope

This proposal adds:

1. A `custody` field on attestation envelopes, with two values:
   `"single-key"` (current default) and `"federation"` (new).
2. A **federation custody descriptor** schema and canonical hashing rule.
3. A new authentication path for federation-custodied attestations: the
   `proof` field is an array of M BIP-322 signatures from M of N declared
   guardian addresses, instead of a single signature from the bound
   address's private key.
4. A **graduation envelope** that records the transition from federation
   custody to single-key custody at a specific time, anchored to a
   bitcoin block, while preserving address continuity.
5. Verifier behavior for both states + the in-between window where the
   guardian set is rotating.

The **canonical message format** for attestations does not change. Only
authentication (who signs) and the optional descriptor binding change.

## 2. Custody field on the attestation envelope

The current SPEC.md §3 envelope is extended with one additive field:

```json
{
  "v": 1,
  "kind": "orangecheck-attestation",
  "address": "bc1q…",
  "identities": [...],
  "custody": "federation",
  "federation": "fed:abc123…",
  "issued_at": "2026-04-30T12:00:00Z",
  "proof": [
    { "address": "bc1qg1…", "sig": "..." },
    { "address": "bc1qg2…", "sig": "..." },
    { "address": "bc1qg3…", "sig": "..." }
  ]
}
```

| Field | Rule |
|---|---|
| `custody` | Optional. `"single-key"` (default if absent · v1 behavior) or `"federation"`. |
| `federation` | Required iff `custody == "federation"`. Content hash of a federation custody descriptor (§3). Format `"fed:<hex64>"`. |
| `proof` | When `custody == "single-key"` (or absent): a single BIP-322 signature string (current v1 shape). When `custody == "federation"`: an **array** of `{ address, sig }` objects of length ≥ M, each signing the same canonical message. |

A v1.0 / v1.1 verifier sees `custody == "federation"`, doesn't recognize
it, MUST treat the attestation as malformed and reject. (Strict
compatibility — federation attestations are opt-in, not silent.)

## 3. Federation custody descriptor

A **federation custody descriptor** is a content-addressed canonical
JSON object — same shape as oc-agent-protocol's federation principal,
re-purposed for custody:

```json
{
  "v": 1,
  "kind": "attest-federation-custody",
  "address": "bc1q…",
  "threshold": "3-of-5",
  "guardians": [
    { "address": "bc1qg1…", "alg": "bip322", "name": "alice" },
    { "address": "bc1qg2…", "alg": "bip322", "name": "bob"   },
    { "address": "bc1qg3…", "alg": "bip322", "name": "carol" },
    { "address": "bc1qg4…", "alg": "bip322", "name": "dave"  },
    { "address": "bc1qg5…", "alg": "bip322", "name": "erin"  }
  ],
  "implementation": {
    "kind": "fedimint",
    "federation_id": "fed11qgqzcq…",
    "version": "0.4"
  }
}
```

Field rules mirror oc-agent FEDERATION.md §2 except for the
`address` and `implementation` additions:

| Field | Rule |
|---|---|
| `v` | Integer. Current version is `1`. |
| `kind` | MUST equal `"attest-federation-custody"`. |
| `address` | The Bitcoin mainnet address whose custody this descriptor describes. The address is derived from the guardian set + threshold (e.g. a P2WSH or P2TR-MuSig2 output) such that an external observer can verify the address is in fact the federation's threshold output. |
| `threshold` | `"M-of-N"`, `1 ≤ M ≤ N`. |
| `guardians` | Sorted lexicographically by `address`. No duplicates. |
| `guardians[i].alg` | MUST equal `"bip322"` in v1.2 (matches oc-agent v1.2). |
| `implementation` | Optional. Names the underlying federation tech for tooling. `kind` is one of `"fedimint"`, `"cashu"`, `"plain-multisig"`, etc. Verifiers that don't recognize the kind treat it as opaque metadata. |

### 3.1 Canonical descriptor message

Same line-oriented format as oc-agent FEDERATION.md §2.1:

```
oc-attest:federation-custody:v1
address: <address>
threshold: <M>-of-<N>
guardian: <address_1>
guardian: <address_2>
…
guardian: <address_N>
```

`implementation` is **not** included in the canonical message — it's
metadata, not part of the security boundary. Implementation choice is
verifiable out-of-band by checking that `address` is in fact the output
of `threshold`-of-`guardians` under the named scheme.

The descriptor id is `fed:` + lowercase hex `SHA-256(canonical_descriptor_bytes)`.

## 4. Authentication

For `custody == "federation"`:

1. Verifier loads the descriptor identified by `federation`.
2. Checks `address` in the envelope matches `address` in the descriptor.
3. Validates the canonical message exactly per SPEC.md §2.
4. Validates each `proof[i].address` is in the descriptor's `guardians`
   list and each `proof[i].sig` is a valid BIP-322 signature over the
   canonical message.
5. Accepts iff distinct valid signatures ≥ `threshold.M`.

A signature from a non-guardian address is invalid; duplicate guardian
addresses in `proof` count as one. Order of `proof` entries is
**unconstrained** — verifiers MUST sort + deduplicate by guardian
address before counting.

## 5. Graduation envelope

A user graduates to single-key custody by publishing a **graduation
envelope**:

```json
{
  "v": 1,
  "kind": "orangecheck-graduation",
  "address": "bc1q…",
  "from_federation": "fed:abc123…",
  "to": "single-key",
  "graduated_at": "2026-06-15T14:00:00Z",
  "proof": [
    { "address": "bc1qg1…", "sig": "..." },
    { "address": "bc1qg2…", "sig": "..." },
    { "address": "bc1qg3…", "sig": "..." },
    {
      "address": "bc1q…",
      "sig": "...",
      "kind": "self-key"
    }
  ]
}
```

A graduation envelope MUST carry both:
- M-of-N guardian signatures over the canonical graduation message
  (the federation acknowledges releasing custody);
- A single signature from `address`'s private key (the user proves
  they hold the key now).

The graduation envelope's id is anchored to a bitcoin block via
OpenTimestamps. After graduation, all subsequent attestation envelopes
for `address` use `custody == "single-key"` and a single proof.

A verifier evaluating a v1.2 attestation against `address` MUST:
1. Look up the most recent graduation envelope for `address` (if any).
2. If the new envelope's `issued_at` is **before** the graduation
   `graduated_at`, validate against the federation descriptor at the
   time the envelope was issued.
3. If **after** graduation, validate as single-key.
4. If no graduation envelope exists, validate against the descriptor
   bound by the envelope's `federation` field (or as single-key if
   `custody` is absent / `"single-key"`).

## 6. Guardian rotation

Guardian rotation produces a **new descriptor with a new id**. Old
attestations remain verifiable against the old descriptor; new
attestations bind to the new descriptor.

Rotation envelopes are published separately:

```json
{
  "v": 1,
  "kind": "orangecheck-federation-rotation",
  "address": "bc1q…",
  "from_federation": "fed:abc…",
  "to_federation": "fed:def…",
  "rotated_at": "2026-05-01T00:00:00Z",
  "proof": [
    { "address": "bc1qg1…", "sig": "..." },
    { "address": "bc1qg2…", "sig": "..." },
    { "address": "bc1qg3…", "sig": "..." }
  ]
}
```

Authentication: M-of-N signatures **from the old descriptor**. The new
descriptor must not yet authorize anything until at least one envelope
is signed under it. Rotation envelopes are anchored to a bitcoin block
via OpenTimestamps so any verifier can resolve the active descriptor at
any historical instant.

## 7. me.ochk.io binding

me.ochk.io is the canonical consumer of this extension. The mapping:

| me.ochk.io concept | This extension's expression |
|---|---|
| federation-custodied user | attestation with `custody == "federation"` |
| /me/identity "signing_method · fedimint_threshold" badge | descriptor's `threshold` field |
| /me/graduate flow | publishes a graduation envelope per §5 |
| /me/wallet sends | each Lightning send envelope is signed by M-of-N guardians until graduation |
| /me/agents delegation issuance under federation custody | uses oc-agent FEDERATION.md v1.2 with the same guardian set |

The two federation extensions (this one + oc-agent FEDERATION.md) are
**designed to share guardian sets**. A me.ochk.io user's attestation
custody federation MAY be the same as the federation principal under
which their authorized agents act.

## 8. Why this protocol, not a new one

Three options were considered:

1. **New sibling protocol** (`oc-fedimint-protocol`). Rejected: custody
   is not a separate verb — it's an authentication path on the existing
   identity verb. A new sibling would split a single concept across two
   repos and force every consumer to integrate two specs.

2. **Extension to `oc-lock-protocol`** (since lock is the
   confidentiality verb and federation custody touches wallet keys).
   Rejected: lock is about encrypted message envelopes, not address
   custody. The wallet/identity binding is attest territory.

3. **Extension to `oc-attest-protocol` (this proposal).** Accepted:
   attest already owns the address-to-identity binding. Custody is just
   a different authentication path for the same envelope class.
   Adds one optional field + one descriptor schema; backwards-compatible
   for v1.0/v1.1 consumers (they reject explicitly, which is correct).

## 9. Open questions

- **MuSig2 vs FROST vs naive multisig.** The descriptor names
  `implementation.kind` but doesn't mandate one. v1.2-draft-1 leaves
  the choice to the federation operator; v1.2 ratification SHOULD pick
  a default for tooling (MuSig2 is favored: produces a single
  64-byte BIP-340 signature that fits cleanly in the existing
  single-key proof shape).

- **Threshold change without rotation.** Can `threshold` change without
  rotating the guardian set? Currently §6 says no — every change
  produces a new descriptor id. Some federations want to change
  threshold without losing the per-guardian addresses; consider
  adding a separate `oc-attest:federation-threshold-change` envelope.

- **Privacy.** The descriptor lists guardian addresses in the clear.
  For some federations this is fine (transparency is a feature). For
  others it's a leak. A future v1.3 MAY allow committing to a Merkle
  root of guardian addresses with revealed proofs only when needed.

- **Cashu compatibility.** Cashu mints don't have BIP-322-signing
  guardians per se — they have a signing pubkey set with Schnorr/MuSig.
  v1.2 leaves Cashu out of scope; a future companion can add
  `alg = "schnorr-musig"` to the guardian descriptor.

## 10. Test vectors

Test vectors will live alongside SPEC.md `test-vectors/` once this
proposal is normative. v1.2-draft-1 ships only this design doc.

## 11. Implementation timeline

| Milestone | Owner | Trigger |
|---|---|---|
| RFC published | OC | this document, today |
| Reference verifier in `oc-attest-protocol/conformance/` | OC | once `oc-agent` v1.2 ships (descriptor format must align) |
| me.ochk.io v1.1 starts emitting `custody == "federation"` attestations | OC | once Fedimint signing service is wired |
| v1.0/v1.1 verifier deprecation notice | OC | 90 days after first v1.2 attestations are observed in the wild |
| v1.2 ratification | OC + community PR | after one quarter of running deployment |

## 12. Companion changes elsewhere in the family

- **oc-agent-protocol/FEDERATION.md** — confirms shared descriptor
  shape. Both extensions SHOULD cite each other and use identical
  field rules where they overlap.
- **oc-me-web** — `/me/identity` SiteCard SHOULD render the `threshold`
  + guardian count from the descriptor instead of the current static
  "fedimint_threshold" badge string.
- **@orangecheck/auth-core** — `verifySessionToken` MAY add an optional
  `expected_custody` config to require federation-custodied sessions
  for sensitive routes (e.g. /me/graduate cannot be called from a
  single-key session).
- **@orangecheck/me-client** — once v1.2 ratifies, `oc.session.create()`
  SHOULD return the active custody mode so dashboards can render
  appropriate UI affordances.

---

*This is design work. No code ships from this document — it's the
contract that the next round of code will be written against.*

# NIP-XX: OrangeCheck — Proof of Bitcoin Stake

`draft` `optional`

> **Status.** Implementer-ready draft. Shipped in production at `ochk.io`.
> Planned as a formal NIP proposal to `nostr-protocol/nips` once two or more
> independent implementations interoperate.

---

## Abstract

This NIP defines how to publish and discover **OrangeCheck attestations** over Nostr. An attestation is a cryptographically signed statement that binds a Bitcoin address to one or more handles (Nostr, GitHub, DNS, Twitter, …) such that any verifier can recompute from live Bitcoin chain state how many sats the address holds and how long those UTXOs have been unspent.

The design goal is a **sybil-resistance primitive for the open web**. An attestation attached to a Nostr pubkey lets relays, apps, forums, and DAOs filter access by on-chain economic commitment without requiring accounts, KYC, or a centralised identity provider.

## Motivation

Every open protocol shares one problem: bot and sybil filtering without becoming a centralised identity provider. A small Bitcoin UTXO, left alone, is the only credible proof of commitment available on the open internet. Honest users pay nothing but time; attackers pay real opportunity cost.

OrangeCheck makes that proof portable: a single signed message covers every platform that chooses to consume it, and every verifier can recompute independently from public data.

Full protocol details live in **[SPEC.md](./SPEC.md)**. This NIP covers only the Nostr wire format.

---

## Specification

### Event Kind

Attestations use **kind `30078`** — NIP-78 "application-specific data" (parameterised replaceable).

### Event Structure

```json
{
  "kind": 30078,
  "tags": [
    ["d",          "<attestation_id>"],
    ["address",    "<bitcoin_address>"],
    ["scheme",     "bip322"],
    ["issued_at",  "<rfc3339>"],
    ["i",          "nostr:npub1..."],
    ["i",          "github:alice"],
    ["expires",    "<rfc3339>"],
    ["relay",      "wss://relay.example.com"]
  ],
  "content":    "<attestation_envelope_json>",
  "created_at": <unix_timestamp>,
  "pubkey":     "<nostr_pubkey>",
  "sig":        "<nostr_event_signature>"
}
```

The event `content` is the full JSON attestation envelope (see [SPEC §5.3](./SPEC.md#53-json-envelope)) — a self-contained, offline-verifiable blob including the canonical message, Bitcoin signature, and metadata.

### Tag definitions

| Tag | Required | Value | Purpose |
|---|---|---|---|
| `d` | ✅ | `<attestation_id>` — SHA-256 of the canonical message, 64 lowercase hex chars. | Parameterised-replaceable identifier. |
| `address` | ✅ | Bitcoin singlesig address (mainnet default; testnet/signet via `network:` extension in the signed message). | Enables discovery by address. |
| `scheme` | ✅ | `bip322` (preferred) or `legacy` (P2PKH only). | Enables OC events to be distinguished from other kind-30078 traffic. |
| `issued_at` | ✅ | RFC-3339 UTC timestamp, matches the signed message. | |
| `i` | ✖ (0+) | `<protocol>:<identifier>` — one tag per bound handle. | Enables discovery by handle. |
| `expires` | ✖ | RFC-3339 UTC. Mirrors the optional `expires:` extension in the signed message. | |
| `relay` | ✖ (0+) | Additional relay hints from the publisher. | |

### Required invariants

1. The event `content` MUST be parseable as a JSON object with at minimum `attestation_id`, `scheme`, `address`, `message`, and `signature` fields.
2. `sha256(content.message)` MUST equal the `d` tag value AND the `attestation_id` inside the envelope.
3. `content.address` MUST equal the `address` tag value.
4. Every `i` tag MUST have the form `<protocol>:<identifier>` with a lowercase alphanumeric protocol and a non-empty identifier.
5. Unknown tags MUST be preserved by relays and MAY be ignored by consumers.

### Signing

The Nostr event is signed as usual (NIP-01 Schnorr signature over the event id). Two publishing conventions coexist:

- **Self-signed** — when a `nostr:npub1...` identity is bound in the attestation, the event SHOULD be signed by that npub's private key. This lets consumers trust that the Nostr publisher is the same entity the attestation claims. NIP-07 browser extensions handle this flow.
- **Service-signed** — when no Nostr identity is bound, or when the publisher is a service, the event MAY be signed by an ephemeral or service key. Consumers still trust the Bitcoin signature inside the envelope; the Nostr signature is for relay admission and replay control only.

---

## Discovery

### By attestation ID

```json
{ "kinds": [30078], "#d": ["<attestation_id>"] }
```

### By Bitcoin address

```json
{ "kinds": [30078], "#address": ["<bitcoin_address>"] }
```

### By bound identity

```json
{ "kinds": [30078], "#i": ["github:alice"] }
{ "kinds": [30078], "#i": ["nostr:npub1..."] }
{ "kinds": [30078], "#i": ["dns:example.com"] }
```

### Distinguishing OC events from other NIP-78 traffic

Kind 30078 is shared across NIP-78 apps. When aggregating across kind 30078 without a subject filter, consumers SHOULD require `scheme = bip322 | legacy` (no other NIP-78 consumer uses that tag) plus a valid JSON envelope in `content`.

---

## Verification workflow

1. Fetch the event. Verify the NIP-01 Schnorr signature.
2. Parse `content` as JSON. Verify `sha256(content.message)` equals both the `d` tag and `content.attestation_id`.
3. Verify `content.signature` against `content.address` and `content.message` using the declared `scheme` (BIP-322 or legacy).
4. Recompute metrics from live Bitcoin chain state:
   - `sats_bonded` — sum of confirmed UTXOs, or `bond:` extension value when present.
   - `days_unspent` — floor of days since the oldest bonded UTXO confirmed.
5. Apply local policy:
   - Reject if `expires_at` is in the past (unless your policy overrides).
   - Reject if `aud:` extension is present and doesn't match your origin.
6. Apply thresholds (e.g. `min_sats`, `min_days`) to decide admission.

Steps 2–4 are normative and defined in [SPEC.md](./SPEC.md). Step 5–6 are local policy.

---

## Revocation

There is no explicit revocation event. Revocation is achieved two ways:

1. **Implicit on-chain** — spending the bonded UTXOs drops `sats_bonded` below `bond:` (or to zero), which every verifier sees on next check.
2. **Explicit parameterised replacement** — the publisher emits a new kind-30078 event with the same `d` value. Because the d-tag is the attestation ID and the ID is content-addressed, a replacement event carries a *different* ID; the old event remains discoverable but the new one supersedes it for the publisher's intent. Relays applying NIP-78 replacement semantics will keep only the newest event per `(pubkey, kind, d)` triple.

An explicit revocation event kind is deliberately **not** defined by this NIP. Feedback welcome; propose an update if you need one.

---

## Client responsibilities

### Publishers (SHOULD)

- Emit exactly one kind-30078 event per (attestation_id, pubkey).
- Include all bound handles as `i` tags for discovery.
- Include at least one `relay` tag if the envelope lists relay hints.
- Verify the attestation locally before publishing (signature, ID match).

### Consumers (MUST)

- Verify the Bitcoin signature in `content.signature` against `content.address` and `content.message`.
- Recompute metrics from public chain state; never trust `content.metrics` if present.
- Ignore unknown tags gracefully.

### Consumers (SHOULD)

- Cache verification results for a short window (60 s is reasonable — bond state changes at Bitcoin's block cadence).
- Cross-check against multiple Esplora-style endpoints when decisions are high-stakes.
- Surface the raw metrics (`sats_bonded`, `days_unspent`) to end users — scores are advisory.

---

## Security considerations

- **Identity-binding squatting.** An `i` tag like `github:alice` is a *claim*, not a proof — it tells you the signer chose to assert the handle, not that they control it. Consumers that care about handle ownership MUST verify out-of-band (gist, DNS TXT record, tweet URL, Nostr event).
- **Address linkability.** Each attestation publicly links a Bitcoin address to the bound handles. Publishers should use fresh, single-purpose addresses per proof when linkability matters.
- **Replay.** The canonical message includes a random 16-byte nonce + `issued_at` timestamp + fixed header, which bound signatures to their issuance context and prevent cross-context replay.
- **Relay availability.** OrangeCheck is not dependent on Nostr for correctness — the envelope in `content` is self-contained and offline-verifiable. Nostr is a convenient distribution channel; losing it doesn't invalidate any outstanding proof.
- **Event-signing key compromise.** A stolen Nostr key can republish or supersede attestations. This only affects discovery, not the underlying Bitcoin proof — the Bitcoin signature in `content.signature` remains the authority.

---

## Rationale for design choices

- **Kind 30078 (NIP-78) over a dedicated kind.** 30078 is already the "application-specific parameterised-replaceable" kind. Allocating a new kind would require upstream assignment and gain nothing — NIP-78 handles the replacement semantics we need. Consumers distinguish OC events via the `scheme` tag.
- **JSON envelope in `content`.** Keeps the attestation self-describing and valid even when fetched from outside Nostr (IPFS, HTTP, QR code). Tags are indexes; `content` is the source of truth.
- **Content-addressed IDs.** `attestation_id = sha256(canonical_message)` means the ID proves integrity and two clients can never generate the same ID for different messages. No registry needed.
- **No ZK / private balance.** Address is public so any verifier can recompute. Privacy is achieved by rotating addresses, not hiding on-chain state.

---

## Backwards compatibility

This NIP is additive to Nostr. No changes to NIP-01, NIP-78, or any other NIP are required. Clients that don't recognise OrangeCheck events will treat them as opaque kind-30078 blobs, which is correct behaviour.

An earlier draft of this spec prefixed the `d` tag with `orangecheck:` (e.g., `d: orangecheck:<id>`). The production implementation ships the raw attestation ID in the `d` tag. Consumers SHOULD accept either form for forward compatibility during the transition.

---

## References

- **OrangeCheck Protocol Specification** — [SPEC.md](./SPEC.md)
- **BIP-322** — Generic Signed Message Format for Bitcoin
- **NIP-78** — Arbitrary Custom App Data (parameterised replaceable events)
- **NIP-07** — Browser wallet signing interface
- **Reference implementation** — `@orangecheck/sdk` (TypeScript), `orangecheck` (Python)

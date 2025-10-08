# NIP-XX: Bitcoin Reputation Attestations (OrangeCheck)

`draft` `optional`

---

## Abstract

This NIP defines a standard for publishing and discovering **Bitcoin reputation attestations** on Nostr. Attestations are cryptographically signed proofs of Bitcoin address control that can be bound to Nostr identities and other external identities, enabling portable, verifiable reputation across platforms.

---

## Motivation

Current reputation systems are:
- **Platform-locked:** Reddit karma, Twitter followers, GitHub stars don't transfer
- **Centralized:** Platforms control and can revoke reputation
- **Unverifiable:** No cryptographic proof of claims

Bitcoin provides a neutral, censorship-resistant foundation for reputation through:
- **Proof of stake:** Bonded satoshis demonstrate skin in the game
- **Proof of time:** UTXO age demonstrates long-term commitment
- **Cryptographic verification:** BIP-322 signatures prove address control

This NIP enables **portable reputation** by publishing Bitcoin attestations to Nostr, where they can be:
- Discovered by any platform
- Verified independently
- Composed into compound reputation scores
- Bound to Nostr identities (npubs)

---

## Specification

### Event Kind

This NIP uses **kind `30078`** (Parameterized Replaceable Event per NIP-78) for storing Bitcoin reputation attestations.

### Event Structure

```json
{
  "kind": 30078,
  "tags": [
    ["d", "orangecheck:<attestation_id>"],
    ["addr", "<bitcoin_address>"],
    ["sats", "<sats_bonded>"],
    ["days", "<days_unspent>"],
    ["score", "<score>"],
    ["v", "<verification_url>"],
    ["i", "<protocol>:<identifier>", ...],
    ["expires", "<unix_timestamp>"]
  ],
  "content": "<attestation_json>",
  "created_at": <unix_timestamp>,
  "pubkey": "<nostr_pubkey>",
  "sig": "<nostr_event_signature>"
}
```

### Tag Definitions

#### Required Tags

- **`d` (identifier):** Unique attestation identifier in format `orangecheck:<attestation_id>`
  - `attestation_id` is SHA-256 hash of the canonical Bitcoin message (64 hex chars)
  - Makes event parameterized replaceable (newer attestations replace older ones)

- **`addr` (Bitcoin address):** The Bitcoin address from the attestation
  - Format: `bc1q...` (mainnet), `tb1q...` (testnet), or legacy formats
  - Enables discovery by Bitcoin address

- **`v` (verification URL):** URL where attestation can be independently verified
  - Format: `https://ochk.io/verify/<attestation_id>` or similar
  - MUST support GET request returning verification result

#### Optional Tags

- **`sats` (bonded satoshis):** Amount of satoshis bonded in the attestation
  - Integer value computed at publish time
  - Enables filtering by minimum reputation stake

- **`days` (days unspent):** Age of oldest UTXO in days
  - Integer value computed at publish time
  - Enables filtering by time commitment

- **`score` (reputation score):** Computed reputation score
  - Algorithm-dependent (e.g., OrangeCheck v1 score)
  - Advisory only; clients should verify raw metrics

- **`i` (identity bindings):** External identity bindings
  - Format: `<protocol>:<identifier>`
  - Multiple `i` tags allowed (one per identity)
  - Examples: `nostr:npub1...`, `twitter:@alice`, `github:alice`, `dns:alice.com`
  - Enables discovery by external identity

- **`expires` (expiration timestamp):** Unix timestamp when attestation expires
  - Clients SHOULD warn or reject expired attestations
  - Enables automatic cleanup of stale attestations

### Content Field

The `content` field contains the **full attestation JSON envelope** for complete verification:

```json
{
  "ocp_version": "v1",
  "attestation_id": "a3f5b8c2d1e4f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1",
  "scheme": "bip322",
  "address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  "identities": [
    {"protocol": "nostr", "identifier": "npub1alice..."},
    {"protocol": "twitter", "identifier": "@alice"}
  ],
  "message": "orangecheck v1\nidentities: nostr:npub1alice...,twitter:@alice\n...",
  "message_b64url": "b3Jhbmdl...",
  "signature": "AkcwRAIg...",
  "issued_at": "2025-01-15T12:00:00Z",
  "expires_at": "2026-01-15T12:00:00Z",
  "verification_url": "https://ochk.io/verify/a3f5b8c2...",
  "relay_hints": ["wss://relay.damus.io", "wss://relay.primal.net"]
}
```

### Event Signing

- If the attestation contains a `nostr:npub1...` identity binding, the event **MUST** be signed by that npub's private key
- If no Nostr identity is bound, the event **MAY** be signed by any key (ephemeral or service key)
- This ensures cryptographic link between Nostr identity and Bitcoin attestation

---

## Discovery Queries

### By Attestation ID

```json
{
  "kinds": [30078],
  "#d": ["orangecheck:<attestation_id>"]
}
```

### By Bitcoin Address

```json
{
  "kinds": [30078],
  "#addr": ["<bitcoin_address>"]
}
```

### By Nostr Identity

```json
{
  "kinds": [30078],
  "authors": ["<pubkey>"]
}
```

### By External Identity

```json
{
  "kinds": [30078],
  "#i": ["twitter:@alice"]
}
```

### By Minimum Reputation

```json
{
  "kinds": [30078],
  "#sats": ["1000000"],
  "#days": ["365"]
}
```

Note: Relay support for numeric tag filtering may vary. Clients should filter results locally if needed.

---

## Verification Flow

1. **Discover attestation** via Nostr query
2. **Extract content** from event's `content` field
3. **Verify attestation ID:** Compute `SHA-256(message)` and compare to `attestation_id`
4. **Verify Bitcoin signature:** Use BIP-322 or legacy signature verification
5. **Verify Nostr signature:** Validate event signature matches `pubkey`
6. **Verify identity binding:** If `nostr:npub1...` is bound, ensure event `pubkey` matches
7. **Compute metrics:** Query Bitcoin blockchain for current UTXO state
8. **Check expiration:** Warn if `expires` timestamp is in the past

---

## Security Considerations

### Identity Binding

- Identity bindings in attestations are **self-asserted** and not automatically verified
- Clients MUST verify external identities independently:
  - `nostr:npub1...` → Verify event is signed by that npub
  - `twitter:@alice` → Check for tweet containing attestation ID
  - `github:alice` → Check for gist or repo with attestation
  - `dns:alice.com` → Check DNS TXT record or .well-known file

### Relay Trust

- Clients SHOULD query multiple relays and cross-check results
- Malicious relays could omit or modify events
- Always verify `attestation_id = SHA-256(message)` from event content

### Replay Protection

- Attestations include a `nonce` field to prevent signature reuse
- Each attestation has a unique `attestation_id`
- Replaceable events ensure only latest attestation is visible

### Privacy

- Publishing attestations links Bitcoin addresses to Nostr identities
- Users should use fresh Bitcoin addresses per attestation
- Consider using separate npubs for different contexts
- Empty identity bindings allow pseudonymous attestations

### Spam Prevention

- Relays MAY require proof-of-work (NIP-13) for kind 30078 events
- Relays MAY rate-limit attestation publishing
- Clients SHOULD validate minimum reputation thresholds

---

## Use Cases

### Sybil Resistance

Platforms can require minimum Bitcoin reputation to prevent spam:

```javascript
const attestations = await queryNostr({
  kinds: [30078],
  authors: [userNpub],
  "#sats": ["100000"], // Minimum 100k sats
  "#days": ["30"]      // Minimum 30 days old
});

if (attestations.length > 0) {
  // User has proven reputation, allow access
}
```

### Portable Social Graph

Users can prove reputation when joining new platforms:

```javascript
// User joins new Nostr client
const reputation = await fetchReputation(userNpub);
if (reputation.score > 50) {
  // Auto-verify user, skip onboarding
  // Grant trusted user privileges
}
```

### Reputation Stacking

Combine multiple attestations for compound reputation:

```javascript
const attestations = await queryNostr({
  kinds: [30078],
  "#i": [`nostr:${userNpub}`]
});

const totalSats = attestations.reduce((sum, a) => 
  sum + parseInt(a.tags.find(t => t[0] === 'sats')?.[1] || 0), 0
);

const compoundScore = calculateScore(totalSats, attestations);
```

### Cross-Platform Verification

Verify user's reputation from other platforms:

```javascript
// User claims Twitter account
const attestations = await queryNostr({
  kinds: [30078],
  "#i": ["twitter:@alice"]
});

if (attestations.length > 0) {
  // Verify attestation signature
  // Check Twitter for confirmation tweet
  // Link accounts with cryptographic proof
}
```

---

## Implementation Notes

### Client Responsibilities

- Generate attestations with proper canonical message format
- Sign Bitcoin message with BIP-322 or legacy scheme
- Publish to Nostr relays as kind 30078 events
- Verify attestations before displaying reputation
- Handle expired attestations gracefully

### Relay Responsibilities

- Store kind 30078 events as parameterized replaceable
- Support tag-based queries (`#d`, `#addr`, `#i`, `#sats`, `#days`)
- Optionally require proof-of-work for spam prevention
- Optionally validate attestation format before accepting

### Verifier Responsibilities

- Implement full Bitcoin signature verification (BIP-322)
- Query Bitcoin blockchain for current UTXO state
- Validate attestation ID matches message hash
- Verify Nostr event signature
- Check identity bindings independently

---

## Reference Implementation

- **Specification:** https://github.com/orangecheck/protocol/blob/main/SPEC_V1.md
- **JavaScript SDK:** https://github.com/orangecheck/sdk-js
- **Verifier:** https://ochk.io/verify
- **Test Vectors:** https://github.com/orangecheck/protocol/tree/main/conformance/v1

---

## Examples

### Publishing an Attestation

```javascript
import { generateAttestation, publishToNostr } from '@orangecheck/sdk';

// Generate attestation
const attestation = await generateAttestation({
  address: 'bc1q...',
  identities: [
    { protocol: 'nostr', identifier: 'npub1alice...' },
    { protocol: 'twitter', identifier: '@alice' }
  ],
  bond: 1000000,
  expires: '2026-01-15T12:00:00Z'
});

// Sign with Bitcoin wallet
const signature = await wallet.signMessage(attestation.message);

// Publish to Nostr
await publishToNostr({
  attestation,
  signature,
  relays: ['wss://relay.damus.io', 'wss://relay.primal.net'],
  nostrPrivateKey: userNsec
});
```

### Verifying an Attestation

```javascript
import { verifyAttestation } from '@orangecheck/sdk';

// Fetch from Nostr
const event = await relay.get({
  kinds: [30078],
  "#d": ["orangecheck:a3f5b8c2..."]
});

// Verify
const result = await verifyAttestation({
  content: JSON.parse(event.content),
  nostrEvent: event
});

if (result.ok) {
  console.log('Reputation:', result.metrics);
  // { sats_bonded: 1000000, days_unspent: 365, score: 85 }
}
```

---

## Changelog

- **2025-01-15:** Initial draft (v1.0.0)

---

## See Also

- NIP-01: Basic Protocol
- NIP-05: Mapping Nostr keys to DNS-based internet identifiers
- NIP-13: Proof of Work
- NIP-78: Application-specific data
- BIP-322: Generic Message Signing for Bitcoin
- OrangeCheck Protocol: https://ochk.io/protocol


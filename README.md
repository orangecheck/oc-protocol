# OrangeCheck Protocol (OCP)

*Portable Bitcoin reputation for the open internet. Sign once with Bitcoin, prove everywhere forever.*

[![Status](https://img.shields.io/badge/status-draft-informational)](#) [![License](https://img.shields.io/badge/license-CC--BY--4.0%20%2F%20MIT-blue)](#)

---

## What is OrangeCheck?

**OrangeCheck is the universal reputation layer for the internet**, built on Bitcoin.

- **Sign once** — Create a cryptographic attestation proving Bitcoin address control
- **Bind identities** — Link your Bitcoin reputation to Nostr, Twitter, GitHub, DNS, or any identity
- **Publish everywhere** — Attestations are published to Nostr relays and IPFS for universal discovery
- **Verify anywhere** — Any platform can independently verify your reputation
- **Stack reputation** — Combine multiple attestations for compound scores
- **No custody** — Funds never move; signatures prove control without spending

### The Problem

Current reputation systems are:
- **Platform-locked** — Reddit karma, Twitter followers, GitHub stars don't transfer
- **Centralized** — Platforms control and can revoke your reputation
- **Unverifiable** — No cryptographic proof of claims

### The Solution

OrangeCheck provides **portable, cryptographically verifiable reputation** through:
- **Proof of stake** — Bonded satoshis demonstrate skin in the game
- **Proof of time** — UTXO age demonstrates long-term commitment  
- **Multi-protocol identity** — Bind Bitcoin reputation to any external identity
- **Decentralized publishing** — Nostr and IPFS ensure attestations are always discoverable
- **Independent verification** — Anyone can verify signatures and recompute metrics from blockchain data

---

## Quick Start

### 1. Create an Attestation

```javascript
import { generateAttestation } from '@orangecheck/sdk';

const attestation = await generateAttestation({
  address: 'bc1q...',
  identities: [
    { protocol: 'nostr', identifier: 'npub1alice...' },
    { protocol: 'twitter', identifier: '@alice' },
    { protocol: 'github', identifier: 'alice' }
  ],
  bond: 1000000,  // 1M sats
  expires: '2026-01-15T12:00:00Z'
});
```

### 2. Sign with Bitcoin Wallet

```javascript
const signature = await wallet.signMessage(attestation.message);
```

### 3. Publish to Nostr

```javascript
await publishToNostr({
  attestation,
  signature,
  relays: ['wss://relay.damus.io', 'wss://relay.primal.net'],
  nostrPrivateKey: userNsec  // If binding to Nostr identity
});
```

### 4. Verify Anywhere

```javascript
// By attestation ID
const result = await verifyAttestation('a3f5b8c2...');

// By Bitcoin address
const attestations = await findAttestations({ address: 'bc1q...' });

// By Nostr identity
const attestations = await findAttestations({ nostr: 'npub1...' });

if (result.ok) {
  console.log('Reputation:', result.metrics);
  // { sats_bonded: 1000000, days_unspent: 365, score: 85 }
}
```

---

## Architecture

### Attestation Flow

```
1. User creates canonical message with identities
2. User signs message with Bitcoin wallet (BIP-322)
3. Attestation published to Nostr relays (kind 30078)
4. Anyone can discover via attestation ID, address, or identity
5. Verifiers independently check signature + blockchain state
6. Reputation is portable across all platforms
```

### Key Components

- **Canonical Message** — Fixed-format text with identities, address, nonce, timestamp
- **Attestation ID** — SHA-256 hash of message (content-addressed identifier)
- **Bitcoin Signature** — BIP-322 or legacy signature proving address control
- **Nostr Event** — Parameterized replaceable event (kind 30078) for discovery
- **JSON Envelope** — Complete attestation data for verification

---

## Core Concepts

### Multi-Protocol Identity Bindings

Bind your Bitcoin reputation to any identity:

```
identities: github:alice,nostr:npub1alice...,twitter:@alice
```

**Supported Protocols:**
- `nostr:npub1...` — Nostr public key
- `dns:example.com` — DNS domain
- `twitter:@username` — Twitter/X handle
- `github:username` — GitHub username
- `email:user@example.com` — Email address
- `web:https://example.com` — Web origin
- `did:method:identifier` — Decentralized Identifier

### Decentralized Publishing

Attestations are published to:
- **Nostr relays** — Discoverable via NIP-78 parameterized replaceable events
- **IPFS** — Content-addressed storage with CID
- **Local storage** — Optional for private attestations

### Reputation Stacking

Combine multiple attestations for compound reputation:

```javascript
const attestations = await findAttestations({ 
  nostr: 'npub1alice...' 
});

const totalSats = attestations.reduce((sum, a) => 
  sum + a.metrics.sats_bonded, 0
);

const compoundScore = calculateCompoundScore(attestations);
```

---

## Use Cases

### Sybil Resistance

Require minimum Bitcoin reputation to prevent spam:

```javascript
if (reputation.sats_bonded >= 100000 && reputation.days_unspent >= 30) {
  // User has proven reputation, allow access
}
```

### Portable Social Graph

Prove reputation when joining new platforms:

```javascript
const reputation = await fetchReputation(userNpub);
if (reputation.score > 50) {
  // Auto-verify user, skip onboarding
}
```

### Cross-Platform Verification

Link accounts with cryptographic proof:

```javascript
const attestations = await findAttestations({ 
  twitter: '@alice' 
});

if (attestations.length > 0) {
  // Verify Bitcoin signature
  // Check Twitter for confirmation tweet
  // Link accounts with proof
}
```

### Reputation-Gated Features

Build features that require proven reputation:

```javascript
// Premium features for high-reputation users
if (reputation.score >= 80) {
  enablePremiumFeatures();
}

// Tiered access based on stake
if (reputation.sats_bonded >= 1000000) {
  grantGoldTier();
}
```

---

## Documentation

- **[SPEC.md](SPEC.md)** — Normative specification for implementers
- **[PROTOCOL.md](PROTOCOL.md)** — Protocol overview and design rationale
- **[NIP_ORANGECHECK.md](NIP_ORANGECHECK.md)** — Nostr NIP proposal for attestation publishing
- **[registry/extensions.md](registry/extensions.md)** — Extension key registry
- **[registry/scoring.md](registry/scoring.md)** — Scoring algorithm registry

---

## Security & Privacy

### Identity Binding Security

- Identity bindings are **self-asserted** and not automatically verified
- RPs MUST verify identities independently:
  - `nostr:npub1...` → Verify Nostr event signature
  - `twitter:@user` → Check for tweet with attestation ID
  - `github:user` → Check for gist/repo with attestation
  - `dns:example.com` → Check DNS TXT record or .well-known file

### Privacy Considerations

- **Address linkability** — Each attestation links Bitcoin address to identities
- **Recommendation** — Use fresh addresses per attestation, rotate regularly
- **Pseudonymity** — Empty `identities:` field allows pseudonymous attestations
- **Selective disclosure** — Create separate attestations for different contexts

### Best Practices

- Use **fresh, single-purpose addresses** to limit linkability
- **Time-box attestations** with `expires` extension
- **Bind to origin** with `aud` extension for site-specific attestations
- **Verify independently** — Always check Bitcoin signatures and blockchain state
- **Query multiple relays** — Cross-check Nostr events from multiple sources

---

## Network Effects

### Why OrangeCheck Wins

**Every new platform that integrates makes ALL attestations more valuable:**

1. **User creates attestation** → Published to Nostr
2. **Platform A integrates** → Users can prove reputation on Platform A
3. **Platform B integrates** → Same attestation now works on Platform B
4. **Platform C integrates** → Attestation value compounds
5. **Network effects accelerate** → More platforms = more valuable attestations

**Result:** Reputation becomes **infinitely portable** and **universally recognized**.

### Draining Network Effects

OrangeCheck drains value from walled gardens:

- **Twitter/X** — Prove reputation WITHOUT Twitter's permission
- **Reddit** — Karma becomes portable and Bitcoin-backed
- **GitHub** — Contribution history becomes verifiable reputation
- **Discord/Telegram** — Spam prevention without centralized moderation
- **Nostr** — Instant sybil resistance for the entire network

**Once you have an OrangeCheck attestation, it works EVERYWHERE.**

---

## Contributing

- Read **[SPEC.md](SPEC.md)** first; proposals must not break canonicalization
- Open issues/PRs with **clear diffs** and, where applicable, **new test vectors**
- For new extension keys, update **`/registry/extensions.md`** and provide conformance cases
- For new identity protocols, propose in **`/registry/extensions.md`** with verification methods

---

## License

- **Protocol & Spec text**: CC‑BY‑4.0
- **Reference code**: MIT
- "OrangeCheck" name/logo: trademark of their owners; do not imply endorsement

---

## FAQ

**Do coins move?**

No. Message signing only; funds remain in your wallet.

**Which wallets are supported?**

Any that can sign messages. Prefer **BIP‑322**; legacy `signmessage` is for `1…` addresses only.

**What exactly does an attestation prove?**

1. You control a Bitcoin address (cryptographic signature)
2. The address has X sats bonded (blockchain verification)
3. The oldest UTXO is Y days old (blockchain verification)
4. You claim to be associated with certain identities (self-asserted, verify independently)

**How is this different from NIP-05?**

NIP-05 proves DNS → Nostr mapping. OrangeCheck proves Bitcoin → Multi-protocol identity mapping with quantifiable reputation (sats + time).

**Can I have multiple attestations?**

Yes! Stack multiple attestations for compound reputation. Each can have different identities, bonds, and expiration dates.

**How do I verify an identity binding?**

Identity bindings are self-asserted. Verify independently:
- Nostr: Check event signature
- Twitter: Look for tweet with attestation ID
- GitHub: Check gist or repo
- DNS: Check TXT record or .well-known file

**What prevents someone from creating fake attestations?**

- Bitcoin signatures are cryptographically verifiable
- Blockchain state is publicly auditable
- Identity bindings can be verified independently
- High-reputation attestations require real Bitcoin stake

**How long do attestations last?**

Forever, unless you:
- Spend the bonded UTXOs (invalidates attestation)
- Set an `expires` timestamp (attestation expires)
- Publish a new attestation with same ID (replaces old one)

**Can I revoke an attestation?**

Yes, by spending the bonded UTXOs or publishing a new attestation that replaces it.

---

**Built with Bitcoin. Verified by anyone. Portable everywhere.**


# OrangeCheck Integration Guide

This guide shows how to integrate OrangeCheck Protocol into your application.

---

## Table of Contents

1. [Installation](#installation)
2. [Creating Attestations](#creating-attestations)
3. [Publishing to Nostr](#publishing-to-nostr)
4. [Discovering Attestations](#discovering-attestations)
5. [Verifying Attestations](#verifying-attestations)
6. [Identity Verification](#identity-verification)
7. [Best Practices](#best-practices)

---

## Installation

### `@orangecheck/sdk` (TypeScript / Node / browser)

```bash
npm install @orangecheck/sdk
# or
yarn add @orangecheck/sdk
```

The SDK re-exports every building block used in this guide. Three entry points cover almost all use cases:

- `check()` — sybil-gate primitive. Decide in one call whether an address clears `minSats` × `minDays` thresholds.
- `verify()` — verify a raw `(addr, msg, sig)` tuple without a Nostr round-trip.
- `createAttestation()` — build a signed JSON envelope from a canonical message + signature.

Finer-grained building blocks (`buildCanonicalMessage`, `publishAttestation`, `discoverAttestations`, `queryByIdentity`, `isNip07Available`, `getNostrPublicKey`, …) are also exported — use them when the three above don't compose the way you need.

### Other stacks

- **Python** — `pip install orangecheck`
- **HTTP API** — every function has a zero-dependency equivalent at `https://ochk.io/api/*` (see the [API reference](https://ochk.io/docs/api))
- **Middleware** — `@orangecheck/gate` wraps Express, Fastify, Hono, Next, and Workers

Everything below uses the TypeScript SDK; translating to Python or direct HTTP is a near-mechanical substitution.

---

## Creating Attestations

### Step 1: Build Canonical Message

```typescript
import { buildCanonicalMessage } from '@orangecheck/sdk';

const message = buildCanonicalMessage(
  {
    address: 'bc1qtest',
    identities: [
      { protocol: 'nostr', identifier: 'npub1alice...' },
      { protocol: 'github', identifier: 'alice' },
    ],
  },
  {
    aud: 'https://example.com',
    bond: '1000000',
    expires: '2027-04-22T00:00:00Z',
  }
);
```

**Parameters:**
- `address` — Bitcoin address (required)
- `identities` — Array of identity bindings (optional)
- Extensions (optional):
  - `aud` — Audience (origin/domain)
  - `bond` — Bonded satoshis
  - `expires` — Expiration timestamp
  - `scope` — Permission scope
  - Custom extensions allowed

### Step 2: Sign with Bitcoin Wallet

```typescript
// Using bitcoin-wallet-adapter or similar
const signature = await wallet.signMessage(message, 'bip322');
```

**Signing Schemes:**
- `bip322` — Preferred, works with all address types
- `legacy` — Only for P2PKH addresses (`1...`)

### Step 3: Create Attestation Envelope

```typescript
import { createAttestation } from '@orangecheck/sdk';

const envelope = await createAttestation({
  message,
  signature,
  scheme: 'bip322',
  address: 'bc1qtest',
  identities: [
    { protocol: 'nostr', identifier: 'npub1alice...' },
    { protocol: 'github', identifier: 'alice' },
  ],
});

console.log('Attestation ID:', envelope.attestation_id);
console.log('Verification URL:', envelope.verification_url);
```

**Envelope Fields:**
- `attestation_id` — SHA-256 hash of canonical message (64-char hex)
- `scheme` — Signature scheme used
- `address` — Bitcoin address
- `identities` — Identity bindings
- `message` — Canonical message (plain text)
- `message_b64url` — Base64url-encoded message
- `signature` — Bitcoin signature
- `issued_at` — ISO 8601 timestamp
- `verification_url` — URL to verify attestation

---

## Publishing to Nostr

### Prerequisites

**NIP-07 Browser Extension Required:**
- Alby (recommended)
- nos2x
- Flamingo

### Publish Attestation

```typescript
import { getNostrPublicKey, publishAttestation } from '@orangecheck/sdk';

// Get user's Nostr pubkey from NIP-07 extension
const pubkey = await getNostrPublicKey();

if (!pubkey) {
  throw new Error('NIP-07 extension not available');
}

// Publish to relays
const result = await publishAttestation({
  envelope,
  npub: pubkey,
  relays: [
    'wss://relay.damus.io',
    'wss://relay.nostr.band',
    'wss://nos.lol',
    'wss://relay.snort.social',
  ],
});

console.log('Published to:', result.success);
console.log('Failed:', result.failed);
```

**Default Relays:**
- `wss://relay.damus.io`
- `wss://relay.nostr.band`
- `wss://nos.lol`
- `wss://relay.snort.social`

### Check NIP-07 Availability

```typescript
import { isNip07Available, getNip07Info } from '@orangecheck/sdk';

if (isNip07Available()) {
  const info = getNip07Info();
  console.log('Extension:', info.name, info.version);
} else {
  console.log('Please install a Nostr extension');
}
```

---

## Discovering Attestations

### By Attestation ID

```typescript
import { discoverAttestations } from '@orangecheck/sdk';

const attestations = await discoverAttestations({
  attestationId: 'a3f5b8c2d1e4f6a7b9c0d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3',
});

console.log('Found:', attestations.length);
```

### By Bitcoin Address

```typescript
const attestations = await discoverAttestations({
  address: 'bc1qtest',
});
```

### By Identity

```typescript
const attestations = await discoverAttestations({
  identity: {
    protocol: 'nostr',
    identifier: 'npub1alice...',
  },
});
```

**Supported Identity Protocols (v0):**
- `nostr` — Nostr public key (npub)
- `github` — GitHub username
- `twitter` — Twitter/X handle
- `dns` — DNS domain

> `email:`, `web:`, and `did:` were in earlier drafts and are retired for v0 — see [registry/extensions.md](registry/extensions.md). Unknown protocols are preserved in the signed payload but SHOULD NOT be treated as verified bindings.

---

## Verifying Attestations

### Verify Signature and Compute Metrics

```typescript
import { verify } from '@orangecheck/sdk';

const result = await verify({
  addr: attestation.address,
  msg: attestation.message,
  sig: attestation.signature,
  scheme: attestation.scheme,
});

if (result.ok) {
  console.log('✓ Valid attestation');
  console.log('Network:', result.network);
  console.log('Attestation ID:', result.attestation_id);
  console.log('Identities:', result.identities);
  console.log('Metrics:', result.metrics);
  // {
  //   sats_bonded: 1000000,
  //   days_unspent: 365,
  //   score: 85
  // }
} else {
  console.log('✗ Invalid attestation');
  console.log('Errors:', result.codes);
}
```

### Verify by Attestation ID

```typescript
const result = await verify({
  attestation_id: 'a3f5b8c2...',
});
```

**Verification Steps:**
1. Validates signature against Bitcoin address
2. Queries blockchain for UTXOs
3. Computes bonded satoshis
4. Computes oldest UTXO age
5. Calculates reputation score
6. Returns metrics and status codes

---

## Identity Verification

Identity bindings are **self-asserted** and must be verified independently.

### Nostr Identity Verification

```typescript
// User must publish a Nostr event containing the attestation ID
// Query Nostr for events from the claimed npub

import { queryByIdentity } from '@orangecheck/sdk';

const events = await queryByIdentity('nostr', 'npub1alice...');

const verified = events.some(event => 
  event.content.includes(attestation.attestation_id)
);

if (verified) {
  console.log('✓ Nostr identity verified');
}
```

### GitHub Identity Verification

```typescript
// User must create a gist containing the attestation ID
// Query GitHub API for user's gists

const response = await fetch(
  `https://api.github.com/users/alice/gists`
);
const gists = await response.json();

const verified = gists.some(gist =>
  Object.values(gist.files).some(file =>
    file.content?.includes(attestation.attestation_id)
  )
);

if (verified) {
  console.log('✓ GitHub identity verified');
}
```

### Twitter Identity Verification

```typescript
// User must post a tweet containing the attestation ID
// Manual verification or Twitter API query

const instructions = `
Post a tweet containing:
"Verifying my OrangeCheck attestation: ${attestation.attestation_id}"
`;

console.log(instructions);
```

### DNS Identity Verification

```typescript
// User must add attestation ID to .well-known file or DNS TXT record

// Check .well-known file
const response = await fetch(
  `https://example.com/.well-known/orangecheck.txt`
);
const content = await response.text();

const verified = content.includes(attestation.attestation_id);

if (verified) {
  console.log('✓ DNS identity verified');
}
```

---

## Best Practices

### Security

1. **Always verify signatures** — Never trust attestations without verification
2. **Check blockchain state** — Verify UTXOs exist and match claimed amounts
3. **Verify identities independently** — Don't trust self-asserted bindings
4. **Use fresh addresses** — Limit linkability with single-purpose addresses
5. **Query multiple relays** — Cross-check Nostr events from multiple sources

### Privacy

1. **Use fresh addresses** — Create new address per attestation
2. **Time-box attestations** — Set `expires` to limit exposure
3. **Bind to origin** — Use `aud` for site-specific attestations
4. **Selective disclosure** — Create separate attestations for different contexts
5. **Pseudonymous option** — Empty `identities` field for anonymous reputation

### Performance

1. **Cache verification results** — Don't re-verify on every request
2. **Batch relay queries** — Query multiple relays in parallel
3. **Use attestation IDs** — Content-addressed lookups are faster
4. **Index by identity** — Build local index for fast lookups

### User Experience

1. **Show NIP-07 status** — Clearly indicate if extension is available
2. **Provide installation links** — Link to Alby, nos2x, etc.
3. **Handle errors gracefully** — Show user-friendly error messages
4. **Display verification progress** — Show relay publishing status
5. **Explain identity verification** — Guide users through verification steps

---

## Example: Complete Flow

```typescript
import {
  buildCanonicalMessage,
  createAttestation,
  publishAttestation,
  discoverAttestations,
  verify,
} from '@orangecheck/sdk';

// 1. Create canonical message
const message = buildCanonicalMessage(
  {
    address: 'bc1qtest',
    identities: [
      { protocol: 'nostr', identifier: 'npub1alice...' },
    ],
  },
  { bond: '1000000' }
);

// 2. Sign with Bitcoin wallet
const signature = await wallet.signMessage(message, 'bip322');

// 3. Create attestation envelope
const envelope = await createAttestation({
  message,
  signature,
  scheme: 'bip322',
  address: 'bc1qtest',
  identities: [{ protocol: 'nostr', identifier: 'npub1alice...' }],
});

// 4. Publish to Nostr
const pubkey = await getNostrPublicKey();
const result = await publishAttestation({
  envelope,
  npub: pubkey,
});

// 5. Discover attestation
const attestations = await discoverAttestations({
  attestationId: envelope.attestation_id,
});

// 6. Verify attestation
const verification = await verify({
  addr: attestations[0].address,
  msg: attestations[0].message,
  sig: attestations[0].signature,
  scheme: attestations[0].scheme,
});

console.log('Reputation:', verification.metrics);
```

---

## Troubleshooting

### NIP-07 Extension Not Detected

**Problem:** `isNip07Available()` returns `false`

**Solutions:**
1. Install Alby or nos2x extension
2. Refresh page after installation
3. Check browser console for errors
4. Ensure extension is enabled

### Publishing Fails

**Problem:** All relays return failed

**Solutions:**
1. Check NIP-07 extension is working
2. Verify Nostr keys are configured
3. Try different relays
4. Check browser console for WebSocket errors

### Verification Fails

**Problem:** `verify()` returns `ok: false`

**Solutions:**
1. Check signature format is correct
2. Verify address matches signature
3. Ensure UTXOs exist on blockchain
4. Check network (mainnet vs testnet)

### Discovery Returns No Results

**Problem:** `discoverAttestations()` returns empty array

**Solutions:**
1. Wait a few seconds for relay propagation
2. Try different relays
3. Verify attestation was published successfully
4. Check attestation ID is correct

---

## Next Steps

- Read **[SPEC.md](SPEC.md)** for protocol details
- Review **[NIP_ORANGECHECK.md](NIP_ORANGECHECK.md)** for Nostr integration
- Check **[registry/extensions.md](registry/extensions.md)** for extension keys
- See **[registry/scoring.md](registry/scoring.md)** for scoring algorithms

---

**Questions?** Open an issue or PR at [github.com/orangecheck/oc-protocol](https://github.com/orangecheck/oc-protocol).


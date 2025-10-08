# OrangeCheck Extension Key Registry

This document registers **signed, in-message** extensions for OrangeCheck (see SPEC.md §2.2).
All keys are **lowercase ASCII** and extensions appear **sorted lexicographically** in the canonical message.

> **Compatibility:** Verifiers MUST ignore unknown keys unless a relying party (RP) opts into policy checks.

---

## Core Identity Bindings

The `identities:` core field (not an extension) supports multi-protocol identity bindings:

**Format:** `protocol:identifier[,protocol:identifier...]`

**Registered Protocols:**
- `nostr:npub1...` — Nostr public key (bech32 npub format, 63 chars)
- `dns:example.com` — DNS domain
- `twitter:@username` — Twitter/X handle
- `github:username` — GitHub username
- `email:user@example.com` — Email address
- `web:https://example.com` — Web origin
- `did:method:identifier` — Decentralized Identifier (any DID method)

**Rules:**
- Identifiers MUST be sorted lexicographically
- Empty field allowed: `identities: `
- Maximum 512 UTF-8 bytes total
- Unknown protocols preserved but MAY be ignored

**Examples:**
```
identities: github:alice,nostr:npub1alice...,twitter:@alice
identities: dns:alice.com,web:https://alice.com
identities: 
```

---

## Registered Extension Keys

### `aud`
- **Type:** string (URL origin, e.g., `https://example.com`)
- **Purpose:** Bind attestation to a site/app origin; RPs MAY require equality to their own origin
- **Verifier behavior:** If policy-enabled and mismatch → `aud_mismatch`
- **Example:** `aud: https://example.com`

### `bond`
- **Type:** integer (satoshis)
- **Purpose:** Declare exact stake amount; enforce minimum balance and cap scoring at this value
- **Verifier behavior:** 
  - If `confirmed_balance < bond` → `bond_insufficient`
  - Use `bond` for `sats_bonded` metric (ignore surplus)
  - Compute age via oldest-first greedy UTXO selection (see SPEC.md §7)
- **Example:** `bond: 1000000`

### `expires`
- **Type:** RFC-3339 UTC datetime (e.g., `2026-01-01T00:00:00Z`)
- **Purpose:** Time-box the attestation
- **Verifier behavior:** If `< now` → `expired` (warn/reject per RP policy)
- **Example:** `expires: 2026-01-01T00:00:00Z`

### `network`
- **Type:** enum (`mainnet` | `testnet` | `signet`)
- **Purpose:** Select network for testing
- **Verifier behavior:** 
  - If `testnet` or `signet` and verifier is not in test mode → `network_testmode`
  - Address prefix MUST match selected network
- **Example:** `network: testnet`

### `publish`
- **Type:** comma-separated list of publishing targets
- **Purpose:** Declare where attestation should be published for discovery
- **Verifier behavior:** Informational only; clients use this to determine publishing strategy
- **Registered targets:**
  - `nostr` — Publish to Nostr relays as kind 30078 event
  - `ipfs` — Publish to IPFS and return CID
  - `local` — Store locally only (no publishing)
- **Example:** `publish: nostr,ipfs`

### `relay_hints`
- **Type:** comma-separated list of Nostr relay WebSocket URLs
- **Purpose:** Suggest relays where attestation can be found
- **Verifier behavior:** 
  - Use these relays for attestation discovery queries
  - SHOULD query multiple relays and cross-check results
  - MAY fall back to default relay list if hints fail
- **Format:** `wss://` URLs only
- **Example:** `relay_hints: wss://relay.damus.io,wss://relay.primal.net`

### `scope`
- **Type:** string (free-form UTF-8; ≤256 bytes recommended)
- **Purpose:** Human context label (e.g., `twitter:@alice`, `web:alice.dev`)
- **Verifier behavior:** Display only
- **Example:** `scope: twitter:@alice`

### `scoring`
- **Type:** string (scoring algorithm identifier, e.g., `reference`, `tier`, `time-weighted`)
- **Purpose:** Suggest which scoring algorithm the Subject prefers for this attestation
- **Verifier behavior:**
  - Verifiers MAY compute the requested score if the algorithm is supported
  - Verifiers MUST always return raw `sats_bonded` and `days_unspent` metrics
  - Unknown algorithms are ignored (verifier uses default or none)
  - This is **advisory only** — RPs validate raw metrics independently
- **Examples:**
  - `scoring: reference` — Use protocol reference formula
  - `scoring: tier` — Return categorical tier (bronze/silver/gold/platinum)
  - `scoring: time-weighted` — Emphasize days over sats
  - `scoring: none` — Explicitly request no score computation
- **Registry:** See `/registry/scoring.md` for registered algorithms
- **Security:** Subjects cannot game scores by choosing algorithms; RPs always validate raw metrics
- **Example:** `scoring: reference`

---

## Identity Verification Methods **(informative)**

While identity bindings are self-asserted in the attestation, RPs can verify them externally:

### `nostr:npub1...`
- **Method 1:** NIP-05 verification (DNS TXT record)
- **Method 2:** Require Nostr event signed by npub containing attestation ID
- **Method 3:** Cross-reference with Nostr profile metadata

### `dns:example.com`
- **Method 1:** DNS TXT record: `orangecheck=<attestation_id>`
- **Method 2:** `.well-known/orangecheck.json` file with attestation
- **Method 3:** NIP-05 style verification

### `twitter:@username`
- **Method 1:** Tweet containing attestation ID
- **Method 2:** Bio link to verification URL
- **Method 3:** Pinned tweet with attestation

### `github:username`
- **Method 1:** Gist with attestation JSON
- **Method 2:** Repo file (e.g., `.orangecheck/attestation.json`)
- **Method 3:** Profile README with verification link

### `email:user@example.com`
- **Method 1:** Signed email with attestation (PGP/S/MIME)
- **Method 2:** Domain verification (if email domain matches `dns:` binding)
- **Method 3:** OAuth flow with email confirmation

### `web:https://example.com`
- **Method 1:** `.well-known/orangecheck.json` at origin
- **Method 2:** Meta tag in HTML: `<meta name="orangecheck" content="<attestation_id>">`
- **Method 3:** HTTP header: `X-OrangeCheck: <attestation_id>`

---

## Proposing a New Extension Key

Open a PR adding a section to this file with:

1. **Motivation** and expected adoption path
2. **Type** and grammar (ABNF or JSON shape if complex)
3. **Security considerations** (replay, ambiguity, spoofing)
4. **Verifier behavior** (mandatory, optional, UI-only)
5. **Conformance tests** (new vectors under `/conformance/vectors`)
6. **Migration impact** (if affects existing implementations)

---

## Proposing a New Identity Protocol

Open a PR to this section with:

1. **Protocol identifier** (lowercase, alphanumeric)
2. **Identifier format** (regex or ABNF)
3. **Verification methods** (at least one external verification method)
4. **Security considerations** (spoofing, impersonation risks)
5. **Example bindings**

**Template:**
```markdown
### `protocol:identifier`
- **Format:** <regex or description>
- **Verification Methods:**
  - Method 1: <description>
  - Method 2: <description>
- **Security:** <considerations>
- **Example:** `protocol:example123`
```

---

## Security Notes

### Identity Binding Security

- **Self-asserted:** Identity bindings in attestation are NOT automatically verified
- **External verification required:** RPs MUST verify identities independently using methods above
- **No automatic trust:** Presence of identity binding does NOT prove ownership
- **Replay protection:** `nonce` field prevents signature reuse across attestations
- **Time-boxing:** Use `expires` to limit attestation lifetime

### Publishing Security

- **Nostr events:** MUST be signed by bound npub (if `nostr:npub1...` present)
- **Relay trust:** Query multiple relays and cross-check
- **Content integrity:** Always verify `attestation_id = SHA-256(message)`
- **Replaceable events:** Newer attestations replace older ones (by design)

### Privacy Considerations

- **Address linkability:** Each attestation links Bitcoin address to identities
- **Recommendation:** Use fresh addresses per attestation, rotate regularly
- **Pseudonymity:** Empty `identities:` field allows pseudonymous attestations
- **Selective disclosure:** Create separate attestations for different contexts
- **Identity correlation:** Multiple identities in one attestation enables cross-platform tracking

### Extension Security

- **Unknown keys:** Verifiers MUST ignore unknown keys (forward compatibility)
- **No secrets:** Never embed private keys, passwords, or sensitive data in extensions
- **Ambiguity:** Keys MUST have narrow, unambiguous semantics
- **Validation:** Verifiers MUST validate extension values before use
- **Policy enforcement:** RPs MAY require specific extensions (e.g., `aud` for site-scoped attestations)

---

## Future Extensions (Under Consideration)

These extensions are being discussed but not yet standardized:

### `delegation`
- **Purpose:** Allow attestation to be used by delegated parties
- **Status:** Draft proposal
- **Security concerns:** Delegation chain verification, revocation

### `multisig`
- **Purpose:** Support multi-signature Bitcoin addresses
- **Status:** Research phase
- **Complexity:** UTXO attribution, signing coordination

### `privacy_mode`
- **Purpose:** Enable zero-knowledge proofs of reputation without revealing address
- **Status:** Future work
- **Dependencies:** ZK-SNARK integration, trusted setup

### `stacking`
- **Purpose:** Explicitly declare attestation as part of a stack
- **Status:** Design phase
- **Use case:** Multi-address reputation aggregation

---

**Last Updated:** 2025-01-15  
**Version:** 1.0.0


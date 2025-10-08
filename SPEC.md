---
title: OrangeCheck Protocol — Specification
status: Draft (Normative)
version: 1.0
license: CC-BY-4.0
audience: engineers implementing issuers/verifiers/wallet integrations
conformance: REQUIRED sections are marked **(normative)**
---

# OrangeCheck Protocol — Specification

This document defines the **normative** requirements for producing, publishing, and verifying OrangeCheck attestations. Normative keywords **MUST / SHOULD / MAY** follow RFC‑2119.

> **Scope.** OrangeCheck is a portable, multi-protocol Bitcoin reputation system. Attestations prove Bitcoin address control, bind to external identities (Nostr, DNS, Twitter, etc.), and are published to decentralized networks for universal discovery and verification.

---

## 1) Terminology **(normative)**

- **Attestation** — A cryptographically signed proof of Bitcoin address control with bound identities
- **Attestation ID** — Deterministic identifier: `SHA-256(canonical_message)` encoded as lowercase hex (64 chars)
- **Address** — Bitcoin singlesig address:
  - **Mainnet:** `P2WPKH (bc1q…)`, `P2TR (bc1p…)`, or `P2PKH (1…)` (legacy compat)
  - **Testnet/Signet:** `P2WPKH (tb1q…)`, `P2TR (tb1p…)`, or `P2PKH (m…/n…)` (legacy compat)
- **Message** — canonical UTF‑8 text per §2
- **Scheme** — one of: `bip322` (preferred), `legacy` (P2PKH only)
- **UTXO** — confirmed, unspent transaction output at `addr` at verification time
- **RP** — relying party (site/app interpreting the attestation)
- **Identity Binding** — Cryptographic link between Bitcoin address and external identity (Nostr, DNS, Twitter, GitHub, etc.)

---

## 2) Canonical Message **(normative)**

A **text** message with **LF** line endings and **exactly one trailing LF**. Field **order and wording are fixed**.

### 2.1 Core (7 lines)

```
orangecheck
identities: <IDENTITY_BINDINGS>
address: <BITCOIN_ADDRESS>
purpose: portable reputation attestation (non-custodial)
nonce: <RANDOM_16B_HEX_LOWER>
issued_at: <ISO8601_UTC_Z>
ack: I attest control of this address and bind it to my identities.
```

**Rules**
- **Line 1:** `orangecheck` — MUST be exact literal (no version number)
- **Line 2:** `identities:` — Multi-protocol identity bindings (see §2.1.1). Empty allowed.
- **Line 3:** `address:` — MUST be **mainnet** singlesig (see §1). Non‑mainnet MUST be rejected unless `network: testnet` or `network: signet` extension is present.
- **Line 4:** `purpose:` — MUST be exact literal above
- **Line 5:** `nonce:` — 16 random bytes encoded as **32 lowercase hex**
- **Line 6:** `issued_at:` — RFC‑3339 / ISO‑8601 UTC with `Z`
- **Line 7:** `ack:` — MUST be exact literal above

Issuers MUST prevent edits to wording/order after generation and MUST include exactly one trailing LF.

### 2.1.1 Identity Bindings Format **(normative)**

The `identities:` field contains comma-separated protocol-prefixed identifiers:

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
- Identifiers MUST be sorted lexicographically by full string (`protocol:identifier`)
- Empty identities field allowed: `identities: ` (single space, no bindings)
- Maximum total length: 512 UTF-8 bytes
- Unknown protocols MUST be preserved but MAY be ignored by verifiers
- Duplicate protocols allowed (e.g., multiple GitHub accounts)

**Examples:**
```
identities: nostr:npub1alice...,twitter:@alice
identities: dns:alice.com,github:alice,nostr:npub1alice...
identities:
```

### 2.2 Extensions (signed) **(normative)**

Optional **additional** lines follow, each `key: value` on its own line.

- Keys: lowercase ASCII, **sorted lexicographically** (deterministic)
- Entire message (core + extensions) is signed
- Verifiers **MUST** ignore unknown keys unless local policy requires them

**Registered keys:**
- `aud:` — origin hint (e.g., `https://example.com`). RPs **MAY** require equality to their origin
- `bond:` — integer (sats). If present, verifiers **MUST**:
  1. Fail verification if confirmed spendable balance at `address:` **< bond** (status: `bond_insufficient`)
  2. Use **exactly** `bond` for all displays and scoring (any surplus is ignored)
  3. Derive `days_unspent` for the bonded stake via the **oldest-first greedy** rule (see §5.4)
- `expires:` — RFC-3339 UTC. Verifiers **SHOULD** warn or reject if in the past
- `network:` — `mainnet` (default), `testnet`, or `signet`
- `publish:` — comma-separated list of publishing targets (e.g., `nostr,ipfs`)
- `relay_hints:` — comma-separated Nostr relay URLs (e.g., `wss://relay1.com,wss://relay2.com`)
- `scope:` — human label for context (e.g., `twitter:@alice`, `web:alice.dev`)
- `scoring:` — string (algorithm id, e.g., `reference`, `tier`, `time-weighted`). **Advisory.** Verifiers **MAY** compute if supported; **MUST** still return raw metrics

### 2.3 ABNF **(normative)**

```
message         = core extlines LF
core            = "orangecheck" LF
                  "identities: " identities LF
                  "address: " addr LF
                  "purpose: portable reputation attestation (non-custodial)" LF
                  "nonce: " nonce LF
                  "issued_at: " isotime LF
                  "ack: I attest control of this address and bind it to my identities." LF
extlines        = *( extline )
extline         = key ": " value LF
key             = 1*( %x61-7A )                     ; a-z
value           = *( %x20-7E )                      ; printable ASCII (UTF-8 allowed)
identities      = [ identity-binding *( "," identity-binding ) ]
identity-binding = protocol ":" identifier
protocol        = 1*( %x61-7A / %x30-39 )          ; lowercase alphanumeric
identifier      = 1*( %x21-7E )                     ; printable ASCII
addr            = 1*( %x21-7E )
nonce           = 32hexdig-lower
isotime         = 1*( %x20-7E )                     ; MUST parse as RFC3339 UTC ("Z")
hexdig-lower    = %x30-39 / %x61-66                 ; 0-9 or a-f
LF              = %x0A
```

> Implementations MUST enforce exact literals for header/purpose/ack and **one trailing LF**.

---

## 3) Attestation ID **(normative)**

Every attestation has a deterministic, content-addressed identifier.

**Derivation:**
```
attestation_id = SHA-256(canonical_message)
```

**Encoding:** Lowercase hexadecimal (64 characters)

**Properties:**
- Deterministic: Same message → same ID
- Collision-resistant: Different messages → different IDs
- Content-addressed: ID proves message integrity
- URL-safe: Can be used in paths and query parameters

---

## 4) Signature Schemes **(normative)**

- `scheme = "bip322"` — **MUST** be attempted first for all addresses
- `scheme = "legacy"` — **MAY** be accepted *only* for `P2PKH (1…)` addresses

If neither verifies `(msg, addr)`, the attestation is **InvalidSignature**. If `scheme` is not recognized, return **InvalidScheme**.

---

## 5) Wire Formats **(normative)**

### 5.1 Verify URL (by components)

```
/verify?addr=<ADDR>&msg=<BASE64URL_UTF8_MSG>&sig=<SIG>&scheme=<SCHEME>
```

- `msg` — base64url (padding optional) of the **entire** message (core + extensions)
- `sig` — scheme‑specific string (base64/hex)
- `scheme` — `bip322` or `legacy`

### 5.2 Verify URL (by attestation ID)

```
/verify/<ATTESTATION_ID>
/verify?id=<ATTESTATION_ID>
```

Verifiers **MUST** support lookup by attestation ID. Implementation:
1. Query local cache/database
2. Query Nostr relays (if `relay_hints` available)
3. Query IPFS (if CID available)
4. Return 404 if not found

### 5.3 JSON Envelope **(normative)**

```json
{
  "attestation_id": "a3f5b8c2d1e4f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1",
  "scheme": "bip322",
  "address": "bc1q...",
  "identities": [
    {"protocol": "nostr", "identifier": "npub1..."},
    {"protocol": "twitter", "identifier": "@alice"}
  ],
  "message": "orangecheck\nidentities: nostr:npub1...,twitter:@alice\n...",
  "message_b64url": "b3Jhbmdl...",
  "signature": "AkcwRAIg...",
  "issued_at": "2025-01-15T12:00:00Z",
  "expires_at": "2026-01-15T12:00:00Z",
  "verification_url": "https://ochk.io/verify/a3f5b8c2...",
  "publish_targets": ["nostr", "ipfs"],
  "relay_hints": ["wss://relay.damus.io", "wss://relay.primal.net"]
}
```

---

## 6) Publishing to Nostr **(normative)**

Attestations **MAY** be published to Nostr relays for decentralized discovery.

### 6.1 Nostr Event Format

**Event Kind:** `30078` (Parameterized Replaceable Event per NIP-78)

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
    ["i", "<protocol>:<identifier>", "<protocol>:<identifier>", "..."],
    ["expires", "<unix_timestamp>"]
  ],
  "content": "<full_json_envelope>",
  "created_at": <unix_timestamp>,
  "pubkey": "<nostr_pubkey_if_bound>",
  "sig": "<nostr_event_signature>"
}
```

**Publishing Rules:**
1. If `nostr:npub1...` identity is bound, event MUST be signed by that npub's private key
2. If no Nostr identity bound, event MAY be signed by any key (ephemeral or service key)
3. Event `content` contains full JSON envelope for complete verification
4. Event is replaceable: newer attestations for same ID replace older ones

### 6.2 Discovery Queries

**By Attestation ID:**
```json
{"kinds": [30078], "#d": ["orangecheck:<attestation_id>"]}
```

**By Bitcoin Address:**
```json
{"kinds": [30078], "#addr": ["<bitcoin_address>"]}
```

**By Identity:**
```json
{"kinds": [30078], "#i": ["nostr:npub1..."]}
```

---

## 7) Verification Algorithm **(normative)**

### 7.1 Verification by Components

Given `(addr, msg, sig, scheme)`:

1. **Canonical checks**
   a. Decode `msg` (base64url → UTF‑8)
   b. Ensure **exactly one** trailing LF
   c. Core lines present & in order; exact literals for header/purpose/ack
   d. If extensions exist, **keys are lexicographically sorted**
   e. `address` line value equals `addr`
   f. `nonce` matches 32 hex lowercase
   g. `issued_at` parses as RFC‑3339 UTC
   h. `identities` field parses correctly (protocol:identifier format)

2. **Attestation ID derivation**
   - Compute `attestation_id = SHA-256(msg)`
   - Return in verification response

3. **Network selection**
   - If `network: testnet` present, use testnet
   - If `network: signet` present, use signet
   - Otherwise use mainnet
   - Address prefix MUST match selected network

4. **Signature verification**
   - If `scheme=bip322`, attempt BIP‑322 verification
   - Else if `scheme=legacy` and `addr` is `P2PKH`, attempt classic `signmessage`
   - Else: **InvalidScheme**
   - On failure: **InvalidSignature**

4. **Bonded stake handling**
   - Fetch **confirmed, unspent UTXOs** for `addr`.
   - If `bond:` extension is present:
     a. Parse `bond` as integer (base-10 ASCII).
     b. Compute `confirmed_balance` = sum(UTXO values).
     c. If `confirmed_balance < bond`, return **bond_insufficient** (invalid).
     d. Set `sats_bonded := bond` (ignore surplus).
     e. Compute `days_unspent` via **oldest-first greedy** rule:
        + Sort UTXOs by `(block_height ASC, txid ASC, vout ASC)` (oldest first).
        + Greedily select UTXOs until `sum ≥ bond`; call this multiset `S_bond`.
        + Let `first_seen := max(confirmation_time(u))` for `u ∈ S_bond` (the youngest in `S_bond`).
        + `days_unspent := floor( (now_utc - first_seen) / 86,400 )`.
   - Else (no `bond:` extension):
     a. `sats_bonded` = sum(UTXO values).
     b. `first_seen` = min(confirmation time) across all UTXOs.
     c. `days_unspent` = floor((now_utc − first_seen) / 86_400).

5. **Compute score**
   - `score_v0` per §6 using `sats_bonded` and `days_unspent` from step 4.

6. **Policy (optional)**
   - If `aud:` present, RP **MAY** require equality to its own origin.
   - If `expires:` present and `< now`, **SHOULD** warn or reject.

7. **Result**
   - Return status + metrics (see §7).

**Determinism.** Verifiers SHOULD round metrics to appropriate precision for display.

---

## 6) Metrics & Scoring **(normative)**

### 6.1 Required Metrics

Verifiers **MUST** compute and return:

- **`sats_bonded`** (integer) — Sum of confirmed, unspent UTXO values at the address, OR if `bond:` extension is present, exactly that value
- **`days_unspent`** (integer) — Floor of days since earliest confirmation time among active UTXOs, OR if `bond:` extension is present, computed via oldest-first greedy rule (see §5.4)

These raw metrics are the **source of truth** for all reputation assessment.

### 6.2 Optional Scoring

Verifiers **MAY** compute additional scores to aid UX and comparison. If scores are provided:

- Scores **MUST** include an algorithm identifier (e.g., `score_v0`, `score_tier`)
- Scores **MUST NOT** be assumed comparable across different algorithms
- Scores **SHOULD** be documented with their formula or logic

### 6.3 Reference Score (score_v0)

The protocol defines a reference scoring algorithm for interoperability, where `ln` is the natural logarithm:

```
score_v0 = round( ln(1 + sats_bonded) * (1 + days_unspent / 30), 2 ) 
```

**Output:** Decimal number (typically 10-250)

**Interpretation:**
- 10-20: Low commitment
- 20-50: Medium commitment
- 50-100: Good commitment
- 100+: Excellent commitment

Verifiers implementing `score_v0` **MUST** use this exact formula.

### 6.4 Alternative Scoring Algorithms

RPs are encouraged to compute scores tailored to their use case. See `/registry/scoring.md` for:
- Registered algorithms (`tier`, `time-weighted`, `amount-weighted`, etc.)
- Formula specifications
- Use case guidance

The `scoring:` extension (§2.2) allows Subjects to suggest a preferred algorithm, but RPs **MUST** validate raw metrics independently.

### 6.5 Display Requirements

When displaying scores:
- **MUST** show the algorithm identifier (e.g., "Score: 55.3 (v0)" or "Tier: Gold")
- **SHOULD** provide explanation of what the score means
- **MAY** show raw metrics alongside scores for transparency
- **MUST** when `bond` is present, display `Bonded: <sats_bonded> sats` and **SHOULD** indicate that any surplus balance is ignored.

### 6.6 Security Considerations

- RPs **MUST NOT** trust scores without validating `sats_bonded` and `days_unspent`
- Scores are **advisory** interpretations, not cryptographic proofs
- Different algorithms may be vulnerable to different gaming strategies
- RPs should choose algorithms that align with their threat model

---

## 7) Status & Error Codes **(normative)**

**Signature**  
- `sig_ok_bip322`  
- `sig_ok_legacy`  
- `sig_invalid`  
- `sig_unsupported_script`

**Bond**
- `bond_confirmed` (X sats)
- `bond_zero`
- `bond_pending` (unconfirmed UTXOs ignored)
- `bond_insufficient` (confirmed balance < bond extension value)

**Policy**  
- `aud_mismatch`  
- `expired`  
- `network_testmode` (testnet or signet indicated but verifier not in test mode)

**Transport / Input**  
- `bad_request` (missing params)  
- `decode_error` (base64url or UTF‑8)  
- `invalid_scheme`

Verifiers **SHOULD** map codes to human‑readable strings in UI and MAY expose raw codes via API.

---

## 8) Conformance **(normative)**

An implementation **conforms** to OCP v0 if:  
- **Issuer** produces canonical messages per §2.  
- **Verifier** validates & computes per §5 and emits codes from §7.  
- Unknown extensions are ignored safely, unless RP policy opts in.  
- `scheme` handling matches §3.

---

## 9) Test Vectors **(normative list; fixtures in repo)**

Provide vectors under `/conformance/vectors` with fields:  
`addr`, `msg`, `sig`, `scheme`, `expect: { status[], sats_bonded, days_unspent, score_v0 }` (+ mocked UTXO set).

Suggested set:
- **tv1.json** — valid `bip322` P2WPKH; no extensions.
- **tv2.json** — valid `bip322` P2TR; with `expires` future.
- **tv3.json** — valid `legacy` P2PKH.
- **tv4.json** — invalid (nonce uppercase).
- **tv5.json** — invalid (extensions unsorted).
- **tv6.json** — valid but expired; expect `expired`.
- **tv7.json** — testnet with `network: testnet`; expect `network_testmode` if verifier not in test mode.
- **tv8.json** — signet with `network: signet`; expect `network_testmode` if verifier not in test mode.
-  + - **tv9.json**  — bond present, balance == bond → valid; age via greedy set’s youngest.
+ - **tv10.json** — bond present, balance > bond → valid; surplus ignored; greedy age.
+ - **tv11.json** — bond present, balance < bond → invalid; expect `bond_insufficient`.
+ - **tv12.json** — churn scenario: spend an old UTXO, refill ≥ bond; expect younger `days_unspent`.

---

## 10) Security & Privacy Notes **(informative)**

- Use **fresh, single‑purpose addresses** to limit linkability. Rotate freely.  
- Consider Tor/VPN for verifier network queries; cross‑check multiple Esplora endpoints when critical.  
- Bind to origin with `aud:` if the RP wants phishing resistance for site‑scoped proofs.

---

## 11) Versioning & Registry **(normative)**

- Protocol header string `orangecheck v0` and the seven core lines are **frozen** for v0.  
- Any change to header, core wording/order, canonicalization, or signature schemes **REQUIRES** a version bump.  
- The **extension key registry** lives at `registry/extensions.md`. Proposals MUST include: motivation, security notes, expected verifier behavior, and conformance tests.

---

## 12) References **(informative)**

- BIP‑322: Generic Message Signing for Bitcoin  
- RFC‑2119: Key words for use in RFCs to Indicate Requirement Levels  
- RFC‑3339 / ISO‑8601: Date and Time on the Internet

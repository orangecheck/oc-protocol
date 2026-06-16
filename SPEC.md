---
title: OrangeCheck Protocol — Specification
status: Stable (Normative)
version: 1.0
license: CC-BY-4.0
audience: engineers implementing issuers/verifiers/wallet integrations
conformance: REQUIRED sections are marked **(normative)**
---

# OrangeCheck Protocol — Specification

This document defines the **normative** requirements for producing, publishing, and verifying OrangeCheck attestations. Normative keywords **MUST / SHOULD / MAY** follow RFC‑2119.

> **Scope.** OrangeCheck is a portable, multi-protocol Bitcoin **sybil-resistance primitive** — not a reputation system. Attestations prove Bitcoin address control, bind to external identities (Nostr, DNS, Twitter, etc.), and are published to decentralized networks for universal discovery and verification.

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
- `x:@username` — X handle. Supersedes the v0 `twitter:` registration; legacy `twitter:` bindings remain valid and verifiers SHOULD treat them as `x:`.
- `github:username` — GitHub username

Earlier drafts registered `email:`, `web:`, and `did:`; those are **retired for v0**. They may return in a future version once reliable, decentralized proof-of-control mechanisms are specified. Implementations encountering unknown protocols MUST follow the "unknown protocols preserved but MAY be ignored" rule below.

**Rules:**
- Identifiers MUST be sorted lexicographically by full string (`protocol:identifier`)
- Empty identities field allowed: `identities: ` (single space, no bindings)
- Maximum total length: 512 UTF-8 bytes
- Unknown protocols MUST be preserved but MAY be ignored by verifiers
- Duplicate protocols allowed (e.g., multiple GitHub accounts)

**Examples:**
```
identities: nostr:npub1alice...,x:@alice
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
- `scope:` — human label for context (e.g., `x:@alice`, `web:alice.dev`)
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
  "issued_at": "2026-04-22T12:00:00Z",
  "expires_at": "2027-04-22T12:00:00Z",
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
    ["d", "<attestation_id>"],
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

**Note on key choice (informative).** Authenticity of the attestation is the BIP-322 (or legacy) signature inside `event.content` — the Nostr wrapper key is transport, not proof. Per-event ephemeral keys produce fresh, history-less Nostr pubkeys that anti-spam-strict relays may reject; reference implementations SHOULD instead use a stable service key whose pubkey accumulates relay history once. The reference broadcaster at `attest.ochk.io/api/publish-attestation` accepts an envelope, re-verifies its signature, signs the kind-30078 wrapper with a stable family key, and fans out to a wide relay set. Verifiers MUST NOT trust attestations based on the Nostr wrapper pubkey under any circumstance — re-derive `attestation_id = sha256(canonical_message)` and re-check the inner signature against the address.

### 6.2 Discovery Queries

**By Attestation ID:**
```json
{"kinds": [30078], "#d": ["<attestation_id>"]}
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

5. **Bonded stake handling**
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

6. **Compute score**
   - `score_v0` per §8 using `sats_bonded` and `days_unspent` from step 5.

7. **Policy (optional)**
   - If `aud:` present, RP **MAY** require equality to its own origin.
   - If `expires:` present and `< now`, **SHOULD** warn or reject.

8. **Result**
   - Return status + metrics (see §9).

**Determinism.** Verifiers SHOULD round metrics to appropriate precision for display.

---

## 8) Metrics & Scoring **(normative)**

### 8.1 Required Metrics

Verifiers **MUST** compute and return:

- **`sats_bonded`** (integer) — Sum of confirmed, unspent UTXO values at the address, OR if `bond:` extension is present, exactly that value
- **`days_unspent`** (integer) — Floor of days since earliest confirmation time among active UTXOs, OR if `bond:` extension is present, computed via oldest-first greedy rule (see §7.5)

Verifiers **MAY** additionally return a `score` computed per §8.3. If returned it MUST be tagged with its algorithm identifier.

These raw metrics are the **source of truth** for all reputation assessment.

### 8.2 Optional Scoring

Verifiers **MAY** compute additional scores to aid UX and comparison. If scores are provided:

- Scores **MUST** include an algorithm identifier (e.g., `score_v0`, `score_tier`)
- Scores **MUST NOT** be assumed comparable across different algorithms
- Scores **SHOULD** be documented with their formula or logic

### 8.3 Reference Score (score_v0)

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

### 8.4 Alternative Scoring Algorithms

RPs are encouraged to compute scores tailored to their use case. See `/registry/scoring.md` for:
- Registered algorithms (`tier`, `time-weighted`, `amount-weighted`, etc.)
- Formula specifications
- Use case guidance

The `scoring:` extension (§2.2) allows Subjects to suggest a preferred algorithm, but RPs **MUST** validate raw metrics independently. (See §8.3 for the canonical `score_v0` formula.)

### 8.5 Display Requirements

When displaying scores:
- **MUST** show the algorithm identifier (e.g., "Score: 55.3 (v0)" or "Tier: Gold")
- **SHOULD** provide explanation of what the score means
- **MAY** show raw metrics alongside scores for transparency
- **MUST** when `bond` is present, display `Bonded: <sats_bonded> sats` and **SHOULD** indicate that any surplus balance is ignored.

### 8.6 Security Considerations

- RPs **MUST NOT** trust scores without validating `sats_bonded` and `days_unspent`
- Scores are **advisory** interpretations, not cryptographic proofs
- Different algorithms may be vulnerable to different gaming strategies
- RPs should choose algorithms that align with their threat model

---

## 9) Status & Error Codes **(normative)**

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

## 10) Conformance **(normative)**

An implementation **conforms** to OCP v0 if:  
- **Issuer** produces canonical messages per §2.  
- **Verifier** validates & computes per §5 and emits codes from §9.  
- Unknown extensions are ignored safely, unless RP policy opts in.  
- `scheme` handling matches §3.

---

## 11) Test Vectors **(normative list; fixtures in repo)**

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
- **tv9.json**  — bond present, balance == bond → valid; age via greedy set's youngest.
- **tv10.json** — bond present, balance > bond → valid; surplus ignored; greedy age.
- **tv11.json** — bond present, balance < bond → invalid; expect `bond_insufficient`.
- **tv12.json** — churn scenario: spend an old UTXO, refill ≥ bond; expect younger `days_unspent`.

---

## 12) Security & Privacy Notes **(informative)**

- Use **fresh, single‑purpose addresses** to limit linkability. Rotate freely.  
- Consider Tor/VPN for verifier network queries; cross‑check multiple Esplora endpoints when critical.  
- Bind to origin with `aud:` if the RP wants phishing resistance for site‑scoped proofs.

---

## 13) Versioning & Registry **(normative)**

- Protocol header string `orangecheck` and the seven core lines are **frozen** for v0.  
- Any change to header, core wording/order, canonicalization, or signature schemes **REQUIRES** a version bump.  
- The **extension key registry** lives at `registry/extensions.md`. Proposals MUST include: motivation, security notes, expected verifier behavior, and conformance tests.

---

## 14) Appendix A — Signed-Challenge Auth **(informative)**

OrangeCheck defines a sibling wire format for one-shot auth flows ("prove you control this address right now") that deliberately cannot be confused with a reputation attestation. An RP issues a short-lived challenge, the holder signs it BIP-322, and the RP binds the proven address to a session. Live reference implementation at [`ochk.io/signin`](https://ochk.io/signin) + [`/api/auth/*`](https://ochk.io/docs/api/auth).

### A.1 Challenge Message

```
orangecheck-auth
address: <addr>
nonce: <32-lowercase-hex>
issued_at: <RFC-3339 UTC>
expires_at: <RFC-3339 UTC>
ack: I authorize this session under the OrangeCheck auth challenge.
[<ext_key>: <ext_value> ...]
```

**Normative rules:**

1. Header literal MUST be `orangecheck-auth` (not `orangecheck`) so signatures cannot cross-verify against attestations.
2. The `ack:` literal MUST equal the string above — any other ack MUST cause verification to fail.
3. Core lines MUST appear in the order shown.
4. Extension keys MUST be lowercase ASCII and MUST be sorted lexicographically.
5. `expires_at − issued_at` SHOULD be ≤ 10 minutes; implementations MUST reject expired challenges.

### A.2 Registered Extensions

- `audience:` — expected RP origin (e.g., `https://example.com`). Verifier MUST require equality if the application passes `expectedAudience`.
- `purpose:` — human-readable label for the flow (e.g., `login`, `ochk-signin`). Verifier MUST require equality if the application passes `expectedPurpose`.

### A.3 Verification

Signature verification follows SPEC §4 (`bip322` or `legacy`) against the full challenge text including the trailing `\n`.

Verifiers MUST fail with a specific reason. Recommended codes:

- `malformed` — header literal, ack, or core-line count wrong.
- `expired` — `now > expires_at`.
- `not_yet_valid` — `now < issued_at` (clock skew).
- `sig_invalid` — signature does not verify against `address`.
- `sig_unsupported_scheme` — e.g., `legacy` requested for a non-P2PKH address.
- `nonce_mismatch` — caller-supplied `expectedNonce` disagrees with the message's nonce.
- `audience_mismatch` / `purpose_mismatch` — caller-supplied expected value disagrees.

### A.4 Why a Separate Wire Format

Attestations (SPEC §2) and auth challenges (this appendix) have opposite lifetimes and risk profiles. An attestation is content-addressed and meant to be long-lived and discoverable; an auth challenge is nonce-addressed and must not be replayable. Using the *same* header literal for both would let an attacker replay an old attestation signature as a login, or vice versa. The `orangecheck-auth` vs `orangecheck` split closes that door at the grammar level — no shared parser path, no ambiguity.

---

## 15) References **(informative)**

- BIP‑322: Generic Message Signing for Bitcoin
- RFC‑2119: Key words for use in RFCs to Indicate Requirement Levels
- RFC‑3339 / ISO‑8601: Date and Time on the Internet
- NIP-78: Arbitrary Custom App Data (Nostr kind 30078)

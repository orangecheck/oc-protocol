---
title: OrangeCheck Protocol — Specification
status: Draft (Normative v0)
version: v0
license: CC-BY-4.0
audience: engineers implementing issuers/verifiers/wallet integrations
conformance: REQUIRED sections are marked **(normative)**
---

# OrangeCheck Protocol — Specification (v0)

This document defines the **normative** requirements for producing and verifying OrangeCheck proofs. Normative keywords **MUST / SHOULD / MAY** follow RFC‑2119.

> **Scope.** v0 covers single-address proofs on Bitcoin **mainnet** (with `testnet` and `signet` allowed for testing via an extension). Multi-address aggregation, ZK privacy, and on-chain attestations are out of scope for v0.

---

## 1) Terminology **(normative)**

- **Address** — Bitcoin singlesig address:
  - **Mainnet:** `P2WPKH (bc1q…)`, `P2TR (bc1p…)`, or `P2PKH (1…)` (compat only)
  - **Testnet/Signet:** `P2WPKH (tb1q…)`, `P2TR (tb1p…)`, or `P2PKH (m…/n…)` (compat only)
- **Proof** — tuple `(msg, addr, sig, scheme)`.  
- **Message (`msg`)** — canonical UTF‑8 text per §2.  
- **Scheme** — one of: `bip322` (preferred), `legacy` (P2PKH only).  
- **UTXO** — confirmed, unspent transaction output at `addr` at verification time.  
- **RP** — relying party (site/app interpreting the proof).

---

## 2) Canonical Message **(normative)**

A **text** message with **LF** line endings and **exactly one trailing LF**. Field **order and wording are fixed**.

### 2.1 Core (7 lines)

```
orangecheck v0
npub: <IDENTITY_HINT_OR_EMPTY>
address: <BITCOIN_ADDRESS>
purpose: public reputation bond (non-custodial)
nonce: <RANDOM_16B_HEX_LOWER>
issued_at: <ISO8601_UTC_Z>
ack: I understand this links this address to my identity.
```

**Rules**
- `npub:` — optional identity hint (≤ 256 UTF‑8 bytes). Can be a Nostr npub (63 chars), handle, email, URL, or any stable identifier. Empty string allowed.
- `address:` — MUST be **mainnet** singlesig (see §1). Non‑mainnet MUST be rejected unless `network: testnet` or `network: signet` is present **and** the verifier is in test mode.
- `nonce:` — 16 random bytes encoded as **32 lowercase hex**.
- `issued_at:` — RFC‑3339 / ISO‑8601 UTC with `Z`.
- `purpose:` and `ack:` — **exact literals** above; any deviation invalidates the message.

Issuers MUST prevent edits to wording/order after generation and MUST include exactly one trailing LF.

### 2.2 Extensions (signed) **(normative)**

Optional **additional** lines follow, each `key: value` on its own line.

- Keys: lowercase ASCII, **sorted lexicographically** (deterministic).  
- Entire message (core + extensions) is signed.  
- Verifiers **MUST** ignore unknown keys unless local policy requires them.

**Registered keys (v0)**
- `aud:` — origin hint (e.g., `https://example.com`). RPs **MAY** require equality to their origin.
- `bonded:` — integer (sats). If present, verifiers **MUST**:
- 1) Fail verification if confirmed spendable balance at `address:` **< bonded** (status: `bond_insufficient`);
- 2) Use **exactly** `bonded` for all displays and scoring (any surplus is ignored);
- 3) Derive `days_unspent` for the bonded stake via the **oldest-first greedy** rule (see §5.4).
- `expires:` — RFC-3339 UTC. Verifiers **SHOULD** warn or reject if in the past.
- `network:` — `mainnet` (default), `testnet`, or `signet`.
- `scope:` — human label for context (e.g., `twitter:@alice`, `web:alice.dev`).
- `scoring:` — string (algorithm id, e.g., `v0`, `tier`, `time-weighted`). **Advisory.** Verifiers **MAY** compute if supported; **MUST** still return raw metrics.

### 2.3 ABNF **(normative)**

```
message         = core extlines LF                  ; each line ends with exactly one LF
core            = "orangecheck v0" LF
                  "npub: " npub LF
                  "address: " addr LF
                  "purpose: public reputation bond (non-custodial)" LF
                  "nonce: " nonce LF
                  "issued_at: " isotime LF
                  "ack: I understand this links this address to my identity." LF
extlines        = *( extline )
extline         = key ": " value LF
key             = 1*( %x61-7A )                     ; a-z
value           = *( %x20-7E )                      ; printable ASCII (UTF-8 allowed in practice)
npub            = *( %x20-7E )                      ; ≤ 256 UTF-8 bytes (enforce in prose)
addr            = 1*( %x21-7E )                     ; syntax validated by implementation
nonce           = 32hexdig-lower
isotime         = 1*( %x20-7E )                     ; MUST parse as RFC3339 UTC ("Z")
hexdig-lower    = %x30-39 / %x61-66                 ; 0-9 or a-f
LF              = %x0A
```

> Implementations MUST enforce exact literals for header/purpose/ack and **one trailing LF**.

---

## 3) Signature Schemes **(normative)**

- `scheme = "bip322"` — **MUST** be attempted first for all addresses.  
- `scheme = "legacy"` — **MAY** be accepted *only* for `P2PKH (1…)` addresses.

If neither verifies `(msg, addr)`, the proof is **InvalidSignature**. If `scheme` is not recognized, return **InvalidScheme**.

---

## 4) Wire Formats **(normative)**

### 4.1 Verify URL

Verifiers **MUST** accept:

```
/verify?addr=<ADDR>&msg=<BASE64URL_UTF8_MSG>&sig=<SIG>&scheme=<SCHEME>&sc=v0
```

- `msg` — base64url (padding optional) of the **entire** message (core + extensions).  
- `sig` — scheme‑specific string (base64/hex).  
- `scheme` — `bip322` or `legacy`.  
- `sc` — score version string (here `v0`).

**Optional URI form**

```
ocp://verify?addr=…&msg=…&sig=…&scheme=…&sc=v0
```

### 4.2 JSON Envelope (optional)

```json
{
  "ocp": "v0",
  "scheme": "bip322",
  "addr": "bc1q...",
  "msg_b64url": "...",
  "sig": "...",
  "sc": "v0"
}
```

**JSON Schema (machine‑readable)**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "OrangeCheck v0 Envelope",
  "type": "object",
  "required": ["ocp","scheme","addr","msg_b64url","sig","sc"],
  "properties": {
    "ocp":    { "const": "v0" },
    "scheme": { "enum": ["bip322","legacy"] },
    "addr":   { "type": "string", "minLength": 10 },
    "msg_b64url": { "type": "string", "minLength": 1 },
    "sig":    { "type": "string", "minLength": 1 },
    "sc":     { "const": "v0" }
  },
  "additionalProperties": false
}
```

---

## 5) Verification Algorithm **(normative)**

Given `(addr, msg, sig, scheme)`:

1. **Canonical checks**  
   a. Decode `msg` (base64url → UTF‑8).  
   b. Ensure **exactly one** trailing LF.  
   c. Core lines present & in order; exact literals for header/purpose/ack.  
   d. If extensions exist, **keys are lexicographically sorted**.  
   e. `address` line value equals `addr`.  
   f. `nonce` matches 32 hex lowercase.  
   g. `issued_at` parses as RFC‑3339 UTC.  

2. **Network selection**
   - If `network: testnet` present, use testnet. If `network: signet` present, use signet. Otherwise use mainnet.
   + If a test network is indicated but the verifier is not in test mode, return **network_testmode**.
   + The address prefix MUST match the selected network or verification fails (reject input or map to **sig_unsupported_script**).


3. **Signature verification**  
   - If `scheme=bip322`, attempt BIP‑322 verification of `msg` for `addr`.  
   - Else if `scheme=legacy` and `addr` is `P2PKH`, attempt classic `signmessage` verification.  
   - Else: **InvalidScheme**.  
   - On failure: **InvalidSignature**.

4. **Bonded stake handling**
   - Fetch **confirmed, unspent UTXOs** for `addr`.
   - If `bonded:` extension is present:
     a. Parse `bonded` as integer (base-10 ASCII).
     b. Compute `confirmed_balance` = sum(UTXO values).
     c. If `confirmed_balance < bonded`, return **bond_insufficient** (invalid).
     d. Set `sats_bonded := bonded` (ignore surplus).
     e. Compute `days_unspent` via **oldest-first greedy** rule:
        + Sort UTXOs by `(block_height ASC, txid ASC, vout ASC)` (oldest first).
        + Greedily select UTXOs until `sum ≥ bonded`; call this multiset `S_bond`. 
        + Let `first_seen := max(confirmation_time(u))` for `u ∈ S_bond` (the youngest in `S_bond`).
        + `days_unspent := floor( (now_utc - first_seen) / 86,400 )`.
   - Else (no `bonded:` extension):
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

- **`sats_bonded`** (integer) — Sum of confirmed, unspent UTXO values at the address, OR if `bonded:` extension is present, exactly that value
- **`days_unspent`** (integer) — Floor of days since earliest confirmation time among active UTXOs, OR if `bonded:` extension is present, computed via oldest-first greedy rule (see §5.4)

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
- **MUST** when `bonded` is present, display `Bonded: <sats_bonded> sats` and **SHOULD** indicate that any surplus balance is ignored.

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
- `bond_insufficient` (confirmed balance < bonded extension value)

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
-  + - **tv9.json**  — bonded present, balance == bonded → valid; age via greedy set’s youngest.
+ - **tv10.json** — bonded present, balance > bonded → valid; surplus ignored; greedy age.
+ - **tv11.json** — bonded present, balance < bonded → invalid; expect `bond_insufficient`.
+ - **tv12.json** — churn scenario: spend an old UTXO, refill ≥ bonded; expect younger `days_unspent`.

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

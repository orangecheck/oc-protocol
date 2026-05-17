---
title: OC Attest — Binding Attestation Specification (v1)
status: Stable (Normative)
version: 1.0
license: CC-BY-4.0
audience: engineers implementing binding issuers / verifiers / auth hosts
conformance: REQUIRED behaviour is marked **(normative)**; keywords follow RFC-2119
companion_of: SPEC.md
---

# OC Attest — Binding Attestation Specification (v1)

This document defines the **Binding Attestation** — OC Attest **v1**, and the
protocol's first feature beyond the v0 stake attestation. It is a **normative
companion** to `SPEC.md`; it does not modify it. The v0 stake attestation
(`SPEC.md` §1–§13) is unchanged and remains frozen.

> **Scope.** A Binding Attestation is a mutually-signed, content-addressed,
> Nostr-publishable artifact that binds **one Bitcoin address** and **one
> Nostr public key** as a single **principal**. It is the feature OC Attest
> deferred when it retired the `email:` / `did:` identity bindings "until
> reliable, decentralized proof-of-control mechanisms are specified"
> (`SPEC.md` §2.1.1). A counter-signature *is* that mechanism — for any
> counter-identity that holds a signing key.

This is **not** a stake attestation. It carries no `sats_bonded`, no
`days_unspent`, no `score`. It answers one question — *"are these two keys
one principal?"* — and answers it with two signatures, verifiable by anyone,
with zero trust in OrangeCheck or any server.

---

## 1) Terminology **(normative)**

- **Binding Attestation** — a cryptographically dual-signed proof that one
  Bitcoin address and one Nostr public key are controlled as one principal.
- **Binding message** — the canonical UTF-8 text of §3 that both keys sign.
- **`binding_id`** — `SHA-256(binding_message_bytes)`, lowercase hex (64
  chars). Content-addressed; changing any field yields a different id.
- **Principal** — the abstract identity the two keys jointly control,
  named by a `did:oc:<32-hex>` string carried in the message (see §2).
- **BTC key** — the keypair controlling the `btc:` address. Signs via
  **BIP-322** (`SPEC.md` §4). This is the **root proof** of the artifact.
- **Nostr key** — the keypair controlling the `nostr:` npub. Signs by
  publishing the artifact as a NIP-01 event (kind `30079`, see §6).
- **Verifier** — any party checking a binding. Not a trusted role: a
  verifier with a BIP-322 implementation and a Schnorr verifier needs
  nothing else, and trusts no one.
- **Auth host** — an application (e.g. `ochk.io`) that *consumes* bindings
  to resolve a principal at sign-in. Not a trusted role for the artifact's
  authenticity — see §11.

---

## 2) Relationship to `did:oc` **(normative)**

A Binding Attestation **carries** a `principal: did:oc:<32-hex>` line. It
does **not define** how a `did:oc` is derived.

- The `did:oc` identifier is minted and held authoritative by the
  OrangeCheck auth host's account system. The bond **references** it.
- The bond is a **portable, re-importable backup** of the binding graph,
  not the source of truth for `did:oc` derivation. After an auth-host
  database loss, the full set of published bonds is sufficient to rebuild
  the account graph: each bond carries a *signed* `principal`, so the
  `did:oc ⇄ btc ⇄ nostr` rows are reconstructable with their values
  intact.
- A verifier MUST treat `principal` as an **opaque label** that the two
  signatures commit to. A verifier MUST NOT attempt to derive, validate,
  or "resolve" `did:oc` against any server in order to accept a binding.
  The cryptographic facts a binding establishes are exactly: *the BTC key
  signed this message, and the Nostr key signed this message, and both
  messages are byte-identical.* The `principal` line is part of what they
  signed — nothing more.

This is the settled decision (AUTH-PLAN §10 Fork 2a): the database stays
authoritative day-to-day; the bond is a backup OC can re-import. The bond
does not invert the source of truth.

---

## 3) The Binding Message **(normative)**

A **text** message, **UTF-8**, with **LF** (`%x0A`) line endings and
**exactly one trailing LF**. Field **order and wording are fixed**. There
are exactly **8 core lines**, followed by zero or more sorted extension
lines (§4).

### 3.1 Core (8 lines)

```
orangecheck-binding
v: 1
principal: <DID_OC>
btc: <BITCOIN_ADDRESS>
nostr: <NPUB>
nonce: <RANDOM_16B_HEX_LOWER>
issued_at: <ISO8601_UTC_Z>
ack: I attest the keys named in this message are one principal.
```

**Rules**

- **Line 1** — `orangecheck-binding`. MUST be this exact literal. It is
  distinct from the v0 attestation header (`orangecheck`) and from the §14
  auth-challenge header (`orangecheck-auth`), so a signature over any one
  of the three can **never** cross-verify as another (see §3.4).
- **Line 2** — `v: 1`. The literal version line. The v0 stake attestation
  has *no* version line at all; its presence is itself a second,
  independent guard against a v0 message being parsed as a binding.
- **Line 3** — `principal:` — a `did:oc:` string: literally `did:oc:`
  followed by exactly 32 lowercase hexadecimal characters. See §2.
- **Line 4** — `btc:` — a Bitcoin **mainnet** singlesig address per
  `SPEC.md` §1 (`bc1q…` P2WPKH, `bc1p…` P2TR, or `1…` P2PKH legacy
  compat). Non-mainnet MUST be rejected unless a `network:` extension is
  present (§4).
- **Line 5** — `nostr:` — a Nostr public key in bech32 `npub1…` form
  (NIP-19), 63 characters. The verifier decodes this to the 32-byte
  x-only key (`SPEC.md` references; NIP-19).
- **Line 6** — `nonce:` — 16 random bytes as **32 lowercase hex**. Replay
  defense; see §10.
- **Line 7** — `issued_at:` — RFC-3339 / ISO-8601 UTC with a `Z` suffix.
- **Line 8** — `ack:` — MUST be this exact literal. Any other `ack:`
  string MUST cause verification to fail.

Issuers MUST prevent edits to wording/order after generation and MUST emit
exactly one trailing LF.

### 3.2 Extensions (signed) **(normative)**

Optional `key: value` lines MAY follow the core, each on its own line.

- Keys: lowercase ASCII (`a`–`z`), **sorted lexicographically**.
- The **entire** message (core + extensions) is what both keys sign.
- Verifiers MUST ignore unknown keys unless local policy requires them.

**Registered keys (v1):**

- `expires:` — RFC-3339 UTC. Verifiers MUST reject the binding as
  `expired` if `now > expires` (a binding, unlike a stake attestation, is
  an identity claim — a stale one is a liability, not a warning).
- `network:` — `mainnet` (default), `testnet`, `signet`. Selects the
  network for the `btc:` address; the address prefix MUST match.

There is no `bond:` extension on a Binding Attestation. Binding is an
identity claim, not a stake claim; stake belongs to the v0 attestation.
The two artifacts compose (a principal MAY hold both) but do not merge.

### 3.3 ABNF **(normative)**

```
message      = core extlines LF
core         = "orangecheck-binding" LF
               "v: 1" LF
               "principal: " did-oc LF
               "btc: " addr LF
               "nostr: " npub LF
               "nonce: " nonce LF
               "issued_at: " isotime LF
               "ack: I attest the keys named in this message are one principal." LF
extlines     = *( extline )
extline      = key ": " value LF
key          = 1*( %x61-7A )                  ; a-z
value        = 1*( %x20-7E )                   ; printable ASCII, non-empty
did-oc       = "did:oc:" 32hexdig-lower
npub         = "npub1" 58( %x61-7A / %x30-39 ) ; bech32, 63 chars total
addr         = 1*( %x21-7E )
nonce        = 32hexdig-lower
isotime      = 1*( %x20-7E )                   ; MUST parse as RFC-3339 UTC ("Z")
hexdig-lower = %x30-39 / %x61-66
LF           = %x0A
```

> Every field value is constrained to **printable ASCII with no CR, no LF,
> no other control characters** (`%x20-7E`). This is the **line-smuggling
> defense** — see §3.5.

### 3.4 Why a third header literal **(normative rationale)**

OC Attest now has three signed wire formats: the v0 stake attestation
(`orangecheck`), the auth challenge (`orangecheck-auth`, `SPEC.md` §14),
and the Binding Attestation (`orangecheck-binding`). They have different
lifetimes and different risk profiles — a stake attestation is long-lived
and discoverable, an auth challenge must not be replayable, a binding is a
permanent identity claim. If any two shared a header literal, a signature
produced for one could be presented as the other: an old stake-attestation
BIP-322 signature replayed as a binding, or vice versa. Three distinct
header literals close that door at the **grammar** level — there is no
shared parser path and no ambiguity. A verifier for one format MUST reject
a message whose first line is not its own literal (`E_BAD_HEADER`).

### 3.5 Line-smuggling rejection **(normative)**

Because the message is line-structured text, an issuer MUST reject any
input where a field value (`principal`, `btc`, `nostr`, `nonce`,
`issued_at`, or any extension value) contains a `%x0A` (LF), `%x0D` (CR),
or any other byte outside `%x20-7E`. Such a value could otherwise forge
an additional line — e.g. a `principal` value of
`did:oc:…\nbtc: bc1qattacker` would smuggle a second `btc:` line into the
signed text. Verifiers MUST likewise reject any received message that,
after splitting on LF, does not match the ABNF in §3.3 exactly
(`E_MALFORMED`).

---

## 4) Mutual Signature **(normative)**

A Binding Attestation is valid only when **both** keys have signed the
**same** canonical message.

### 4.1 BTC signature — the root proof

The BTC key signs `binding_message` via **BIP-322** exactly as in
`SPEC.md` §4 (`scheme = "bip322"`; `legacy` `signmessage` MAY be accepted
for `1…` P2PKH addresses only). The signature covers the full message text
*including* the trailing LF.

The BIP-322 signature is the artifact's **Bitcoin load-bearing root**: it
is the strongest decentralized proof-of-control that exists for a Bitcoin
address, it is verifiable from public data with no server, and it is the
exact mechanism whose absence caused the v0 retirement of identity
bindings. This is what makes a binding belong to OC Attest and not to a
generic Ed25519 attestation scheme.

### 4.2 Nostr signature — the counter-signature

The Nostr key signs by **publishing the artifact as a NIP-01 event** (§6).
A NIP-01 event is a Schnorr signature (BIP-340) over the event id, and the
event id is `SHA-256` of the canonical event serialization, whose
`content` carries the binding message. The Nostr key therefore signs the
binding message transitively and verifiably.

### 4.3 The single-message rule

Both signatures MUST cover the **byte-identical** canonical message. A
verifier MUST extract the message the Nostr event's `content` commits to,
extract the message the `btc_signature` was produced over (the envelope's
`message` field), and confirm they are equal byte-for-byte. If they differ,
the binding MUST be rejected (`E_MESSAGE_MISMATCH`). This prevents an
attacker from pairing a real BTC signature over message *A* with a real
Nostr signature over message *B*.

---

## 5) JSON Envelope **(normative)**

The transport/storage form of a Binding Attestation. It mirrors the v0
envelope (`SPEC.md` §5.3) in shape and field naming.

```json
{
  "binding_id": "f69dd1a131ffab60f0dbc567d53ae687d88a97b350b74ade815c1209e65ccef9",
  "v": 1,
  "principal": "did:oc:9f86d081884c7d659a2feaa0c55ad015",
  "btc": "bc1qg975h6gdx5mryeac72h6lj2nzygugxhyuukqvs",
  "nostr": "npub1gcnhnt2245u4z3s5w5d8zzzl9ugwr3a9j0jwqv80kku8y889tv9sg89jj8",
  "message": "orangecheck-binding\nv: 1\nprincipal: did:oc:...\n...\n",
  "message_b64url": "b3JhbmdlY2hlY2stYmluZGluZwp2OiAxCnByaW5jaXBhbDog...",
  "btc_signature": "AkcwRAIgFw5Tl23reHorGitocaSl0FKTFL4BFGWHD1CMYlPRMkEC...",
  "btc_scheme": "bip322",
  "nostr_event": {
    "id": "0bf64ed2fb29f7edf598e9a2dc31832c53ff955340896900f2c2088315d88abf",
    "pubkey": "462779ad4aad39514614751a71085f2f10e1c7a593e4e030efb5b8721ce55b0b",
    "kind": 30079,
    "created_at": 1779278400,
    "tags": [["d", "oc-attest-binding:<binding_id>"], ["btc", "bc1q..."],
             ["oc", "binding-attestation"], ["v", "1"]],
    "content": "{\"message\":\"orangecheck-binding\\n...\",\"btc_signature\":\"AkcwRAI...\"}",
    "sig": "4766405af14be591ed01d602b8f4eb79351fe4191fd34e92c1dc08d0fc1735c0..."
  },
  "issued_at": "2026-05-16T12:00:00Z",
  "expires_at": null
}
```

**Field rules**

- `binding_id` — `SHA-256(message_bytes)`, lowercase hex. The verifier MUST
  recompute it and MUST reject a mismatch (`E_ID_MISMATCH`).
- `v` — integer `1`.
- `principal`, `btc`, `nostr` — convenience copies of the corresponding
  message lines. The **message is authoritative**; a verifier MUST parse
  these from `message` and MUST reject any envelope where a top-level copy
  disagrees with the parsed line (`E_FIELD_MISMATCH`).
- `message` — the full canonical binding text (core + extensions),
  including the trailing LF.
- `message_b64url` — base64url (padding optional) of `message`. Provided
  for URL transport; redundant with `message`.
- `btc_signature` — the BIP-322 (or `legacy`) signature string.
- `btc_scheme` — `"bip322"` or `"legacy"`.
- `nostr_event` — the complete NIP-01 event (§6). `content` carries the
  binding message + the `btc_signature` so the event is self-contained.
- `issued_at` — copy of the `issued_at:` message line.
- `expires_at` — copy of the `expires:` extension if present, else `null`.

The envelope is **not** the signed object — the `message` is. Envelope
fields outside `message` and the two signatures are convenience indices;
a verifier derives every security-relevant fact from `message` +
`btc_signature` + `nostr_event`.

---

## 6) Publishing to Nostr **(normative)**

A Binding Attestation is published as a single Nostr event. Publishing is
how the Nostr key counter-signs (§4.2) — so unlike a v0 stake attestation,
publishing is **not optional** for the artifact to be complete.

### 6.1 Event format

**Kind:** `30079` (Parameterized Replaceable Event per NIP-78). Newly
claimed by OC Attest v1; see §13.

```json
{
  "kind": 30079,
  "pubkey": "<nostr_key_x_only_hex>",
  "created_at": <unix_seconds>,
  "tags": [
    ["d", "oc-attest-binding:<binding_id>"],
    ["btc", "<bitcoin_address>"],
    ["oc", "binding-attestation"],
    ["v", "1"]
  ],
  "content": "{\"message\":\"orangecheck-binding\\n...\",\"btc_signature\":\"...\"}",
  "id": "<nip01_event_id>",
  "sig": "<bip340_schnorr_sig>"
}
```

**`d`-tag namespace.** The `d` tag is `oc-attest-binding:<binding_id>`. The
`oc-attest-binding:` prefix is the kind-30079 namespace and MUST be present.
Kind 30079 is **exclusive to OC Attest** (it is not co-claimed), but the
prefixed `d` tag keeps discovery queries unambiguous and consistent with
the rest of the family.

**Publishing rules**

1. `pubkey` MUST equal the x-only hex decoding of the `nostr:` npub in the
   binding message. An event whose `pubkey` does not match MUST be rejected
   (`E_NOSTR_KEY_MISMATCH`).
2. `content` MUST be a JSON object with at least `message` (the canonical
   binding text) and `btc_signature` (the BIP-322 string). It MAY also
   carry `btc_scheme`.
3. The event MUST be a valid NIP-01 event: `id` is the SHA-256 of the
   canonical serialization, and `sig` is a valid BIP-340 Schnorr signature
   by `pubkey` over `id`.
4. The event is replaceable per NIP-78: a later kind-30079 event with the
   same `(pubkey, kind, d)` coordinates replaces an earlier one. Because
   `d` embeds `binding_id` and `binding_id` is content-addressed, a
   *different* binding produces a *different* `d` and therefore coexists;
   replacement only occurs for byte-identical re-publication.

### 6.2 Discovery queries

```json
{"kinds": [30079], "#d":   ["oc-attest-binding:<binding_id>"]}   // by id
{"kinds": [30079], "#btc": ["bc1q..."]}                          // by BTC address
{"kinds": [30079], "authors": ["<nostr_x_only_hex>"]}            // by Nostr key
```

---

## 7) Verification Algorithm **(normative)**

Given a JSON envelope (§5), or a `nostr_event` alone, a verifier MUST
perform the following. The algorithm is **pure and offline**: it requires
no network and trusts no party.

```
verifyBinding(envelope) -> { valid, status, binding_id?, principal?, btc?, nostr? }

1. PARSE
   a. msg := envelope.message  (UTF-8 text)
   b. Split msg on LF. Reject if not exactly 8 core lines + N>=0 ext lines
      + exactly one trailing LF                          -> E_MALFORMED
   c. Line 1 MUST equal "orangecheck-binding"            -> E_BAD_HEADER
   d. Line 2 MUST equal "v: 1"
   e. Line 8 MUST equal the exact ack literal (§3.1)     -> E_BAD_ACK
   f. Parse principal / btc / nostr / nonce / issued_at from lines 3-7
   g. Every parsed value MUST match its ABNF (§3.3); every value MUST be
      printable ASCII with no CR/LF                      -> E_MALFORMED
   h. Extension keys, if any, MUST be lexicographically sorted, lowercase
                                                          -> E_EXT_UNSORTED
   i. principal MUST match did:oc:<32-hex>               -> E_BAD_PRINCIPAL

2. ID
   a. binding_id := SHA-256(msg bytes), lowercase hex
   b. If envelope.binding_id present and != binding_id   -> E_ID_MISMATCH

3. FIELD CONSISTENCY
   a. If envelope.btc / nostr / principal present, each MUST equal the
      value parsed from msg                              -> E_FIELD_MISMATCH

4. EXPIRY
   a. If an "expires:" extension is present and now > expires
                                                          -> E_EXPIRED

5. BTC SIGNATURE (root proof)
   a. addr := parsed btc; select network from "network:" ext else mainnet;
      address prefix MUST match network                  -> E_NETWORK
   b. If btc_scheme == "bip322": verify BIP-322(addr, msg, btc_signature)
      Else if btc_scheme == "legacy" and addr is P2PKH: verify signmessage
      Else                                               -> E_BAD_SCHEME
   c. On signature-verify failure                        -> E_BTC_SIG_INVALID

6. NOSTR SIGNATURE (counter-signature)
   a. ev := envelope.nostr_event
   b. ev.kind MUST be 30079                              -> E_MALFORMED
   c. Recompute ev.id from the NIP-01 canonical serialization;
      MUST equal ev.id                                   -> E_NOSTR_ID_INVALID
   d. Verify BIP-340 Schnorr(ev.sig, ev.id, ev.pubkey)   -> E_NOSTR_SIG_INVALID
   e. ev.pubkey MUST equal x-only-hex(decode npub from msg)
                                                          -> E_NOSTR_KEY_MISMATCH

7. SINGLE-MESSAGE RULE
   a. Parse content := JSON(ev.content); content.message MUST equal msg
      byte-for-byte                                      -> E_MESSAGE_MISMATCH
   b. content.btc_signature MUST equal envelope.btc_signature
                                                          -> E_MESSAGE_MISMATCH

8. RESULT
   If all checks pass: { valid: true, status: "binding_ok",
     binding_id, principal, btc, nostr }
   Else: { valid: false, status: <first E_ code reached> }
```

**Determinism.** Every step is a pure function of the envelope and (for
step 4) the current time. No step queries a relay, an Esplora endpoint,
or OrangeCheck. A binding establishes *key control and key co-signature*,
not stake — there is no UTXO lookup. (An application MAY *separately*
fetch a v0 stake attestation for the same address; that is out of scope
for binding verification.)

---

## 8) Error Codes **(normative)**

| Code | Meaning |
|---|---|
| `E_MALFORMED` | Message or event does not match the ABNF / structure. |
| `E_BAD_HEADER` | Line 1 is not `orangecheck-binding`. |
| `E_BAD_ACK` | `ack:` line is not the exact literal. |
| `E_BAD_PRINCIPAL` | `principal:` is not a well-formed `did:oc:<32-hex>`. |
| `E_EXT_UNSORTED` | Extension keys are not lexicographically sorted. |
| `E_ID_MISMATCH` | `binding_id` != `SHA-256(message)`. |
| `E_FIELD_MISMATCH` | An envelope top-level copy disagrees with the message. |
| `E_EXPIRED` | `expires:` extension is in the past. |
| `E_NETWORK` | Address prefix does not match the selected network. |
| `E_BAD_SCHEME` | `btc_scheme` unrecognised, or `legacy` on a non-P2PKH address. |
| `E_BTC_SIG_INVALID` | BIP-322 / legacy signature does not verify. |
| `E_NOSTR_ID_INVALID` | Nostr event `id` is not the SHA-256 of its serialization. |
| `E_NOSTR_SIG_INVALID` | Nostr event Schnorr signature does not verify. |
| `E_NOSTR_KEY_MISMATCH` | Event `pubkey` != x-only key from the `nostr:` npub. |
| `E_MESSAGE_MISMATCH` | The two signatures do not cover the same message. |

A verifier returns the **first** code reached in the §7 order. Verifiers
SHOULD map codes to human-readable strings in UI and MAY expose raw codes
via API.

---

## 9) Security-Relevant Requirements **(normative)**

- A verifier MUST verify **both** signatures. A binding with only one valid
  signature is not a binding — it is an unanswered claim.
- A verifier MUST enforce the single-message rule (§4.3 / §7 step 7).
- A verifier MUST recompute `binding_id` and the Nostr `id`; it MUST NOT
  trust the supplied values.
- A verifier MUST reject any message whose first line is not
  `orangecheck-binding`, so a v0 attestation or an auth challenge can never
  be accepted as a binding.
- A verifier MUST reject control characters in field values (§3.5).
- A verifier MUST NOT contact OrangeCheck, a relay operator, or any other
  party to *establish authenticity*. It MAY contact a relay only to
  *fetch* an envelope; the fetched bytes are then verified locally and the
  relay is never trusted.
- An issuer MUST use a fresh 16-byte random `nonce` for every binding.
- Email is **out of scope** — see §12.

---

## 10) Replay & Nonce **(normative)**

The `nonce` line makes every binding message unique even when the same two
keys, the same principal, and the same `issued_at` are used twice. Two
consequences:

1. **No signature reuse.** A BIP-322 signature is bound to its exact
   message bytes, which include the nonce. A signature captured from one
   binding cannot be lifted onto another.
2. **Content-addressed distinctness.** Because `binding_id =
   SHA-256(message)` and the message includes the nonce, two bindings of
   the same key pair are different artifacts with different ids and
   different Nostr `d` tags — they coexist rather than collide.

A Binding Attestation is a *standing* claim, not a one-shot challenge: it
is meant to be long-lived. Freshness for *session* purposes is the job of
the `orangecheck-auth` challenge (`SPEC.md` §14), which an auth host runs
*in addition to* loading a binding. The binding says *who* the principal
is; the auth challenge proves *liveness right now*. The two compose; the
binding does not replace the challenge. An application that wants a
time-boxed binding MAY set the `expires:` extension.

---

## 11) Trust Model — what a verifier and an auth host each trust **(normative)**

- **A verifier trusts nothing.** Given the envelope bytes, the BIP-322
  result and the Schnorr result are mathematical facts. OrangeCheck, the
  relay that served the bytes, and the issuer's UI are all untrusted.
- **An auth host trusts its own account database** for *what a `did:oc`
  is* — that is the settled Fork-2a position (§2). The binding is how the
  host makes that database **survivable**: after a database loss the host
  re-scans kind-30079 events, verifies each offline, and rebuilds the
  `did:oc ⇄ btc ⇄ nostr` rows from the signed `principal` lines. The host
  does not *trust* the relay for this — it verifies every re-imported bond
  with the §7 algorithm.
- **Named anchors.** The only named parties are: the BTC address (a public
  Bitcoin key), the Nostr npub (a public Nostr key), and — for discovery
  only — whatever relay served the event (e.g. `relay.ochk.io`). None of
  the three is trusted for authenticity; the first two *are* the proof and
  the third is replaceable.

---

## 12) Email is Out of Scope **(normative)**

A Binding Attestation binds **two key-holding identities**. Email is
explicitly **not** a bindable identity in this spec, and a future minor
version MUST NOT add it.

The reason is structural, not a deferral:

- An email address holds **no signing key**. It cannot counter-sign a
  binding message. The strongest statement obtainable about an email is
  *"a custodial party (OC) delivered a one-time code to this inbox at time
  T and someone returned it."* That is a vouch by a trusted server, not a
  decentralized proof-of-control.
- Admitting email would re-introduce exactly the `email:` binding that
  `SPEC.md` §2.1.1 retired, and would re-introduce it **without** the
  mechanism the retirement was waiting for. The dual key-to-key signature
  *is* that mechanism; email cannot supply it.

Email linking therefore stays a **custodial auth-host concern**: it lives
in the auth host's database, it is gated by OTP delivery, and it is never
written into an OC Attest artifact. This keeps OC Attest's invariants
intact — every artifact is offline-verifiable and Bitcoin-load-bearing —
while letting the auth host still offer email as a convenience credential
outside the protocol. See `SECURITY.md` and `WHY.md` for the full
rationale.

---

## 13) Nostr Kind & External Identifiers **(normative)**

- **Nostr kind `30079`** — OC Attest Binding Attestation. Parameterized
  replaceable event (NIP-78 / NIP-01). **Exclusive to OC Attest**; not
  co-claimed. Verified free at allocation time against the family kind
  registry in the workspace `CLAUDE.md` and `oc-agent-protocol/SPEC.md` §4.
- **`d`-tag namespace** — `oc-attest-binding:<binding_id>`.
- **`did:oc:`** — the principal identifier scheme. Minted by the
  OrangeCheck auth host; *referenced*, not *defined*, by this spec (§2).
- This spec does not register a MIME type. The JSON envelope is served as
  `application/json`.

---

## 14) Versioning Policy **(normative)**

- The header literal `orangecheck-binding`, the `v: 1` line, the 8 core
  lines and their wording/order, the `ack:` literal, and `binding_id =
  SHA-256(message)` are **frozen for v1**.
- A MINOR change adds an extension key or an envelope convenience field
  without invalidating existing bindings.
- A MAJOR change to the core lines, the canonicalization, the header, or
  the signature schemes requires a `v:` bump and a new kind allocation.
- The v0 stake attestation (`SPEC.md`) and the v1 Binding Attestation
  version **independently**: this document being v1 does not bump
  `SPEC.md`, which remains the frozen v1.0 stake-attestation spec.

---

## 15) Future Work (non-normative)

v1 explicitly does **not** solve:

- **Email / DNS / social handles as counter-signers.** Out of scope by
  construction (§12); no key, no counter-signature.
- **Multi-key principals.** v1 binds exactly one BTC key to exactly one
  Nostr key. A principal with several addresses or several Nostr keys is
  represented as several bindings sharing one `principal` line — there is
  no single multi-key artifact in v1.
- **Revocation envelope.** Consistent with `LIFECYCLE.md`: there is no
  revocation event. The only in-protocol primitives are `expires:` (set at
  sign time) and re-binding under a new `principal`. An application-level
  "this binding is superseded" signal is out of scope.
- **`did:oc`-derived-from-bond.** AUTH-PLAN §10 Fork 2b (the bond
  *defines* `did:oc`) is explicitly **not** v1. v1 is Fork 2a: the bond
  carries and backs up a `did:oc` the auth host still mints.
- **Threshold / multisig BTC addresses.** A multisig `btc:` address will
  BIP-322-verify if the implementation supports it, but v1 specifies no
  signer-coordination story.

---

## 16) Compliance Checklist **(normative)**

An implementation conforms to OC Attest v1 Binding if:

- [ ] It builds the canonical message with exactly the 8 core lines in §3,
      one trailing LF, sorted extensions.
- [ ] It rejects control characters in every field value (§3.5).
- [ ] It rejects any message whose header is not `orangecheck-binding`.
- [ ] It computes `binding_id = SHA-256(message_bytes)` and recomputes it
      on verify.
- [ ] It verifies the BIP-322 (or `legacy`) BTC signature over the full
      message including the trailing LF.
- [ ] It verifies the Nostr event id and BIP-340 Schnorr signature, and
      checks `pubkey` against the `nostr:` npub.
- [ ] It enforces the single-message rule (§4.3).
- [ ] It performs every check offline, with no trusted party.
- [ ] It emits error codes from §8.
- [ ] It never writes an email address into a binding artifact.
- [ ] It passes the `bv*` conformance vectors in
      `conformance/vectors/` (`bv01`–`bv08`).

---

## 17) Design Note

The Binding Attestation is OC Attest finally shipping the feature it
deferred — and the deferral itself is what made the eventual design
clean. The family axiom it applies to the auth layer: an identity you
own is one whose definition is not hostage to anyone's database. The
protocol waited until it had a decentralized mechanism worthy of that
claim — a key-to-key counter-signature — rather than admitting a weaker
one. Family design axioms and voice live in [`VISION.md`](VISION.md).

---

## 18) References

- BIP-322 — Generic Message Signing for Bitcoin
- BIP-340 — Schnorr Signatures for secp256k1
- NIP-01 — Nostr basic protocol and event format
- NIP-19 — bech32-encoded entities (`npub`)
- NIP-78 — Arbitrary custom app data (parameterized replaceable events)
- RFC-2119 — Requirement-level keywords
- RFC-3339 / ISO-8601 — Internet date/time
- `SPEC.md` — OC Attest v0 stake-attestation specification (companion)
- `LIFECYCLE.md` — post-publication lifecycle stance

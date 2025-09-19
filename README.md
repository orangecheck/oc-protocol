# OrangeCheck Protocol (OCP) — v0

*A tiny, Bitcoin-native proof of “skin in the game.” Sign one message, prove you control a specific address, and let anyone recompute sats + time from public chain data. No accounts. No custody. No spend.*

---

## 1) What this is

**OrangeCheck Protocol (OCP)** defines a portable proof that a subject controls a Bitcoin address and has **bonded** sats there for some **time**. Any wallet/app can **issue** a proof; any page/app can **verify** it locally using public chain data.

**Why:** most online reputation is either unverifiable (social claims) or invasive (KYC). OCP is a third path: **minimal, cryptographic, self-sovereign.**

---

## 2) Scope & roles

- **Subject** — person/service asserting the claim.
- **Issuer** — UI that helps build the message and collect the signature (client-side).
- **Verifier** — page/app that re-verifies signature and recomputes metrics live.
- **Bond** — sum of **confirmed UTXOs** currently unspent at the attested address.
- **Streak** — **days unspent** since the earliest confirmed funding among those UTXOs.

Normative keywords **MUST / SHOULD / MAY** follow RFC-2119.

---

## 3) Canonical challenge (v0, normative)

Plain UTF-8 text, **LF** newlines, **one trailing newline**. **Order and spelling are fixed.**

```
orangecheck v0
npub: <IDENTITY_HINT_OR_EMPTY>
address: <BITCOIN_ADDRESS>
purpose: public reputation bond (non-custodial)
nonce: <RANDOM_16B_HEX_LOWER>
issued_at: <ISO8601_UTC_Z>
ack: I understand this links this address to my identity.
```


**Field intent**

- `npub:` Optional identity hint (e.g., `npub1…`, `twitter:@alice`, `web:alice.dev`). Free-form ≤ 256 bytes.  
- `address:` Mainnet singlesig (P2WPKH `bc1q…`, P2TR `bc1p…`, or legacy P2PKH `1…`).  
- `nonce:` 16 bytes random, hex lowercase (32 chars).  
- `issued_at:` RFC-3339 / ISO-8601 UTC (e.g., `2025-03-21T18:04:09.000Z`).  
- `purpose:` & `ack:` fix intent and make the link explicit.

Issuers **MUST** prevent editing of wording/order once generated.

---

## 4) Signature schemes (normative)

A proof is `(msg, addr, sig, scheme)`.

1) **BIP-322 (preferred)** — `scheme = bip322`.  
   Works across modern address types; verifiers **MUST** attempt this first.

2) **Legacy signmessage (optional)** — `scheme = legacy`.  
   Only for P2PKH (`1…`) using classic message signing semantics.

If neither verifies for `(msg, addr)`, the proof is **invalid**.

---

## 5) Verify/Share link (wire format)

Verifiers **MUST** accept:

```
/verify?addr=<ADDR>&msg=<BASE64URL_UTF8_MSG>&sig=<SIG>&sc=v0
```


- `msg` = base64url-encoded UTF-8 bytes of the canonical message (padding optional).  
- `sig` = signature string (scheme-specific; base64 or hex).  
- `sc` = score version (see §7).  
Verifiers **SHOULD** accept standard base64 as well (URL-encoded).

---

## 6) Metrics (normative calculations)

From the **current confirmed, unspent UTXO set** at `addr`:

- `sats_bonded` = sum of UTXO values (confirmed only).  
- `first_seen` = earliest **confirmation time** among those UTXOs (block time).  
- `days_unspent` = `floor((now_utc - first_seen) / 86_400)`.  
- `score_v0` = `round( ln(1 + sats_bonded) * (1 + days_unspent / 30), 2 )`.

Pending/unconfirmed outputs are **ignored**. Spending changes the active set and may **reset** the streak.

---

## 7) Versioning

- **Protocol header:** `orangecheck v0` (this document).  
- **Score version:** include `sc=v0` in links and UIs. Future scoring MUST bump `sc`.

---

## 8) Status labels (interoperable UX)

Verifiers SHOULD expose consistent states:

- Signature: `Verified (BIP-322)` · `Verified (legacy compat)` · `Invalid signature` · `Unsupported script type`.  
- Bond: `Confirmed balance: X sats` · `Awaiting confirmation` (no confirmed UTXOs) · `Bond reduced` (if smaller than prior).  
- Tips: “Use a fresh address; spending resets your streak.”

---

## 9) Security & privacy model

- **No custody.** Only a signature leaves the wallet; no keys, no spend.  
- **Public by design.** Anyone can re-verify from the link; the address is visible so numbers can be recomputed.  
- **Pseudonymous.** Identity hint (npub/handle) is **inside the signed text**.  
- **Rotation.** Use a **fresh, single-purpose address**. Retire a badge by spending; issue a new proof.  
- **Network privacy.** Verifiers call public Esplora endpoints (e.g., mempool.space); use VPN/Tor if desired.

Reposting a link **does not transfer control**—it re-verifies the original `(msg, addr, sig)`.

---

## 10) Minimal JSON envelope (optional)

For QR/NFC or programmatic exchange:

```json
{
  "ocp": "v0",
  "scheme": "bip322",
  "addr": "bc1q…",
  "msg_b64url": "…",
  "sig": "…",
  "sc": "v0"
}
```

## 11) Example

Message:

```
orangecheck v0
npub: twitter:@TheBTCViking
address: bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh
purpose: public reputation bond (non-custodial)
nonce: 7c862943bcdbb57f3a4616d098291c94
issued_at: 2025-09-16T14:58:50.406Z
ack: I understand this links this address to my identity.
```

Share link:

```
/verify?addr=bc1qxy2kg…x0wlh&msg=BASE64URL_OF_MESSAGE&sig=SIGNATURE&sc=v0
```

## 12) Reference implementation (informative)

A static web client can:

- Build the canonical message (auto `nonce`, `issued_at`).
- Verify signatures locally (BIP-322 → legacy fallback).
- Query Esplora endpoints:
  - `GET /api/address/{addr}/utxo`
  - `GET /api/tx/{txid}`  *(for funding block time)*
- Render a compact badge + share link that re-verifies on open.

---

## 13) FAQ (concise)

**Do coins move?**  
No. It’s message signing only; funds never leave your wallet.

**Which wallets work?**  
Any wallet that can sign messages. Prefer **BIP-322** (bech32/taproot). Legacy `1…` can use classic signmessage.

**What exactly does the badge verify?**  
(1) You control the keys for the address in the message (signature).  
(2) At verification time there are **confirmed, unspent** sats there. From that we compute **sats_bonded**, **days_unspent**, and a **score**.

**Can I hide the address?**  
Not in v0. Transparency lets anyone recompute from public data. Use **fresh, single-purpose addresses** and rotate to preserve privacy.

**Will spending reset my badge?**  
Spending changes the confirmed UTXO set, so your **streak resets** naturally. Create a new badge any time.

**Is Nostr (npub) required?**  
Optional. You may include an `npub` or any handle/scope label; or leave it empty.

**Multiple addresses?**  
One address per badge in v0.

**Mainnet only?**  
Yes (v0).

**Offline verification?**  
Signature checks are local; fetching UTXOs needs network access.

---

## 14) License & contributing

- Protocol text: permissive (e.g., **CC-BY-4.0**).  
- Reference client: **MIT**, client-side only, reads public Esplora APIs.  
- “OrangeCheck” name/logo: trademark of their owners; do not imply endorsement.

**Contribute:** PRs and issues welcome → `https://github.com/orangecheck/oc-protocol`

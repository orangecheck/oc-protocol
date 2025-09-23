# OrangeCheck Protocol (OCP) — v0 (+ext)

*A tiny, Bitcoin-native proof of “skin in the game.” Sign one message, prove you control a specific address, and let anyone recompute sats + time from public chain data. No accounts. No custody. No spend.*

---

## 1) What this is

**OrangeCheck Protocol (OCP)** defines a portable proof that a subject controls a Bitcoin address and has **bonded** sats there for some **time**.  
Any wallet/app can **issue** a proof; any page/app can **verify** it locally using public chain data.

**Why:** most online reputation is either unverifiable (social claims) or invasive (KYC). OCP is a third path: **minimal, cryptographic, self-sovereign**.

---

## 2) Scope & roles

- **Subject** — person/service asserting the claim.  
- **Issuer** — client-side UI that builds the message and collects the signature.  
- **Verifier** — page/app that re-verifies signature and recomputes metrics live.  
- **Bond** — sum of **confirmed UTXOs** currently unspent at the attested address.  
- **Streak** — **days unspent** since the earliest confirmed funding among those UTXOs.

Normative keywords **MUST / SHOULD / MAY** follow RFC-2119.

---

## 3) Canonical challenge (v0 core, normative)

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
- `nonce:` 16 bytes random, lowercase hex (32 chars).  
- `issued_at:` RFC-3339 / ISO-8601 UTC (e.g., `2025-03-21T18:04:09.000Z`).  
- `purpose:` & `ack:` fix intent and make the link explicit.  

Issuers **MUST** prevent editing of wording/order once generated.

---

## 4) Signed extensions (v0+ext, normative)

To scope or time-box a proof **without breaking v0**, OCP supports optional, signed meta-fields **inside** the same message.  
Rules:

- Extensions appear **after** the 7 core lines.  
- Each extension is `key: value` on its own line.  
- Keys **MUST** be lowercase ASCII and **sorted lexicographically** (deterministic).  
- Entire message (core + extensions) is signed.  
- v0 verifiers **MUST** ignore unknown keys while still verifying the signature over the whole text.

**Standard extension keys (all optional):**
- `aud:` Audience/origin hint, e.g., `https://example.com` (a verifier **MAY** enforce that its origin matches).  
- `cap:` Capability hints (advisory), e.g., `min_sats=100000,min_days=30`.  
- `expires:` RFC-3339 UTC expiry of the proof, e.g., `2026-01-01T00:00:00Z` (verifier **SHOULD** warn/decline if past).  
- `network:` `mainnet` (default) or `signet` (for testing).  
- `scope:` Human label of context, e.g., `twitter:@alice`, `web:alice.dev`.

> Extensions are **advisory unless a relying party chooses to enforce them** (e.g., a site may require `aud` to equal its origin and `expires` to be in the future).

**Example (core + ext):**

```
orangecheck v0
npub: twitter:@TheBTCViking
address: bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh
purpose: public reputation bond (non-custodial)
nonce: 7c862943bcdbb57f3a4616d098291c94
issued_at: 2025-09-16T14:58:50.406Z
ack: I understand this links this address to my identity.
aud: https://marketplace.example
cap: min_sats=1000000,min_days=30
expires: 2026-01-01T00:00:00Z
network: mainnet
scope: twitter:@TheBTCViking
```


---

## 5) Signature schemes (normative)

A proof is `(msg, addr, sig, scheme)`.

1) **BIP-322 (preferred)** — `scheme = bip322`. Verifiers **MUST** attempt this first.  
2) **Legacy signmessage (optional)** — `scheme = legacy` (P2PKH `1…`).

If neither verifies for `(msg, addr)`, the proof is **invalid**.

---

## 6) Verify/Share link (wire format)

Verifiers **MUST** accept:

```
/verify?addr=<ADDR>&msg=<BASE64URL_UTF8_MSG>&sig=<SIG>&sc=v0
```

- `msg` = base64url of **entire message** (core + any extensions), padding optional.  
- `sig` = signature string (scheme-specific; base64 or hex).  
- `sc` = score version (see §8).  
Verifiers **SHOULD** also accept standard base64 (URL-encoded).

**Optional URI form:**

```
ocp://verify?addr=…&msg=…&sig=…&sc=v0
```


---

## 7) Metrics (normative calculations)

From the **current confirmed, unspent UTXO set** at `addr`:

- `sats_bonded` = sum of UTXO values (confirmed only).  
- `first_seen`  = earliest **confirmation time** among those UTXOs (block time).  
- `days_unspent` = `floor((now_utc - first_seen) / 86_400)`.  
- `score_v0`   = `round( ln(1 + sats_bonded) * (1 + days_unspent / 30), 2 )`.

Unconfirmed outputs are **ignored**. Spending updates the active set and may **reset** the streak.

---

## 8) Versioning

- **Protocol header:** `orangecheck v0`.  
- **Score version:** include `sc=v0` wherever a score is shown. Future changes **MUST** bump `sc`.

---

## 9) Status labels (interop UX)

- Signature: `Verified (BIP-322)` · `Verified (legacy compat)` · `Invalid signature` · `Unsupported script type`.  
- Bond: `Confirmed balance: X sats` · `Awaiting confirmation` · `Bond reduced`.  
- Tips: “Use a fresh address; spending resets your streak.”

---

## 10) Security & privacy model

- **No custody.** Only a signature leaves the wallet; no keys, no spend.  
- **Public by design.** Anyone can re-verify; the address is visible so numbers can be recomputed.  
- **Pseudonymous.** Identity hint (npub/handle) is **inside the signed text**.  
- **Rotation.** Prefer **fresh, single-purpose addresses**. Retire by spending; issue a new proof.  
- **Network privacy.** Verifiers call public Esplora endpoints (e.g., mempool.space); use VPN/Tor if desired.

Reposting a link **does not transfer control**—it re-verifies the same `(msg, addr, sig)`.

---

## 11) Minimal JSON envelope (optional)

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

## 12) Reference implementation (informative)

A static web client can:

- Build the canonical message (auto `nonce`, `issued_at`), and optionally append **v0+ext** lines (`aud`, `cap`, `expires`, `network`, `scope`) **sorted lexicographically**.
- Verify signatures locally (attempt **BIP-322** first → fallback to **legacy signmessage** for `1…`).
- Query Esplora-compatible endpoints to compute live metrics:
  - `GET /api/address/{addr}/utxo`
  - `GET /api/tx/{txid}` *(for funding block time if not provided in UTXO payload)*
- Render a compact badge (Sats • Streak • Score v0) and produce a share/verify link:
  - `/verify?addr=<ADDR>&msg=<BASE64URL_UTF8_MSG>&sig=<SIG>&sc=v0`
- (Optional) Enforce site policy on extensions:
  - If `aud` is present, **require** it matches the verifier’s origin.
  - If `expires` is present and in the past, **warn or reject**.
  - If `network` ≠ `mainnet`, **display clearly** and avoid mixing with mainnet leaderboards.

---

## 13) FAQ (concise)

**Do coins move?**  
No—message signing only; funds never leave your wallet.

**Which wallets work?**  
Any wallet that supports message signing. Prefer **BIP-322** (bech32/taproot); legacy `1…` may use classic signmessage.

**What exactly does the badge verify?**  
(1) You control the address (signature). (2) At verification time there are **confirmed, unspent** sats there. From that, the app computes **sats_bonded**, **days_unspent**, and **score v0**.

**Can I hide the address?**  
Not in v0. Transparency lets anyone recompute. Use **fresh, single-purpose addresses** and rotate as needed.

**Will spending reset the badge?**  
Spending changes the active UTXOs; your **streak resets** naturally. Create a new badge any time.

**Is Nostr (npub) required?**  
Optional. You may include an `npub`, a scoped handle (`twitter:@…`), or leave it empty.

**Multiple addresses?**  
One address per badge in v0.

**Mainnet only?**  
Yes by default; `network: signet` may be used for testing under **v0+ext**.

**Offline verification?**  
Signature checks are local; fetching UTXOs requires network access.

---

## 14) License & contributing

- Protocol text: permissive (e.g., **CC-BY-4.0**).  
- Reference client: **MIT**, client-side only.  
- “OrangeCheck” name/logo: trademark of their owners; do not imply endorsement.

**Contribute:** issues and PRs welcome → `https://github.com/orangecheck/oc-protocol`

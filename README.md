# OrangeCheck

**Proof of Bitcoin stake for the open web.**
*Sats as signal. No KYC, no custody.*

[![Status](https://img.shields.io/badge/status-v0%20shipped-success)](https://ochk.io) [![License](https://img.shields.io/badge/license-CC--BY--4.0%20%2F%20MIT-blue)](#)

---

## What this is

OrangeCheck is a **sybil-resistance primitive**, not a reputation system. You sign one message that links a Bitcoin address to one or more handles (Nostr, GitHub, DNS, Twitter). Anyone can verify from public chain state that the address has **N sats unspent for N days**. Platforms use that signal to filter bots out without asking users for an email, a phone number, or a KYC selfie.

- **No custody.** Funds never move.
- **No account.** The protocol has no server you register with.
- **No permission.** The proof works on any platform that chooses to read it.
- **No trust.** Any verifier can recompute metrics directly from the Bitcoin blockchain.

See **[VISION.md](VISION.md)** for the product brief and business model.

## The 30-second pitch

```
           ┌───────────────────────────────────────────────┐
 User  →   │ sign one message with your Bitcoin wallet     │
           └───────────────────────────────────────────────┘
                                 ↓
           ┌───────────────────────────────────────────────┐
 Proof →   │ { address, identities, sats_bonded, days,     │
           │   signature, attestation_id }                 │
           └───────────────────────────────────────────────┘
                                 ↓
           ┌───────────────────────────────────────────────┐
 Apps  →   │  GET /api/check?addr=bc1q…&min_sats=100000    │
           │  →  { ok: true, sats, days, score }           │
           └───────────────────────────────────────────────┘
```

Attackers pay real Bitcoin opportunity cost to defeat it. Honest users pay nothing.

## The API is the product

### Gate access with one request

```bash
curl "https://ochk.io/api/check?addr=bc1q...&min_sats=100000&min_days=30"
# { "ok": true, "sats": 125000, "days": 47, "score": 18.2, "identities": [...] }
```

### Express / Next middleware

```ts
import { ocGate } from '@orangecheck/gate';

app.post('/post', ocGate({ minSats: 100_000, minDays: 30 }), handler);
```

### Or verify a raw attestation

```ts
import { verify } from '@orangecheck/sdk';

const result = await verify({ addr, msg, sig, scheme: 'bip322' });
if (result.ok && result.metrics.sats_bonded >= 100_000) {
  // let them through
}
```

That's it. That's the integration surface.

## Creating an attestation (user side)

1. Open `https://ochk.io` and paste your address (or connect wallet).
2. Add optional handles — Nostr npub, GitHub username, DNS domain, Twitter handle.
3. Sign the one-line message with **BIP-322** (preferred) or legacy `signmessage` (P2PKH only).
4. Your proof is published to Nostr relays and gets a shareable URL.

The signed message is deterministic, human-readable, and exactly this:

```
orangecheck
identities: github:alice,nostr:npub1...
address: bc1q...
purpose: portable reputation attestation (non-custodial)
nonce: 8f3a...e1
issued_at: 2026-04-20T10:00:00Z
ack: I attest control of this address and bind it to my identities.
```

Optional signed extensions (sorted lexicographically): `aud`, `bond`, `expires`, `network`, `scope`.

## What an attestation proves, exactly

| Claim | Strength | How a verifier checks |
|---|---|---|
| You control address `bc1q…` | Cryptographic | BIP-322 signature verification |
| The address holds `N` sats | On-chain, trustless | Query Esplora / mempool.space for UTXOs |
| The oldest bonded UTXO is `N` days old | On-chain, trustless | Compare confirmation time to now |
| You claim to be `@alice` on GitHub | **Self-asserted** | Verifier must check a public gist or repo file under @alice independently |

The first three are mathematical. The fourth is a claim that platforms verify out-of-band the same way they verify any social handle — e.g., DNS TXT record, GitHub gist, signed Nostr event.

## Supported identity bindings

In v2 we support four protocols where verification is actually feasible:

- `nostr:npub1…` — verify by finding a signed Nostr event containing the attestation ID.
- `github:username` — verify by finding a public gist or repo file containing the attestation ID.
- `dns:example.com` — verify by looking up a TXT record at `_orangecheck.example.com`.
- `twitter:@handle` — verify by finding a public tweet containing the attestation ID (manual proof URL).

Other protocols (`email:`, `web:`, `did:`) are explicitly out of scope for v2 until a real integrator asks.

## Scoring

Two things, nothing more:

**`sats_bonded`** and **`days_unspent`** are raw metrics. They are the source of truth. RPs (relying parties) should compare them against their own thresholds.

For UX, the protocol defines one reference score:

```
score_v0 = round( ln(1 + sats_bonded) * (1 + days_unspent / 30), 2 )
```

There is no second algorithm. RPs with specialized needs write their own against raw metrics; the protocol does not try to preempt every use case.

## Publishing & discovery (Nostr)

Attestations are published as Nostr kind **30078** parameterized replaceable events with `d = orangecheck:<attestation_id>`. Discovery queries:

```json
{"kinds": [30078], "#d":       ["orangecheck:<attestation_id>"]}   // by ID
{"kinds": [30078], "#address": ["bc1q..."]}                         // by address
{"kinds": [30078], "#i":       ["github:alice"]}                    // by identity
```

Publishing is **optional**. The attestation is a self-contained JSON blob signed with Bitcoin. Nostr is a distribution channel, not a dependency.

## What this protocol does not do

- **No agent/delegation credentials.** A prior draft explored this (UCAN-style over Bitcoin). It's been retired — it doesn't use Bitcoin in a load-bearing way. If you need delegation, use UCAN.
- **No ZK / private balance proofs.** The address is public. Use fresh addresses per attestation if linkability is a concern.
- **No on-chain attestations.** Everything is off-chain signed messages; the chain only stores the bonded UTXOs.
- **No aggregation into a unified score.** Every "reputation aggregator" becomes a walled garden eventually.

## Documentation

| Doc | Purpose |
|---|---|
| **[VISION.md](VISION.md)** | Product brief, audiences, business model, scope rules |
| **[PROTOCOL.md](PROTOCOL.md)** | High-level protocol design and rationale |
| **[SPEC.md](SPEC.md)** | Normative specification for implementers |
| **[NIP_ORANGECHECK.md](NIP_ORANGECHECK.md)** | Nostr NIP for attestation publishing (kind 30078) |
| **[registry/extensions.md](registry/extensions.md)** | Registered extension keys |
| **[registry/scoring.md](registry/scoring.md)** | Reference score algorithm |

## FAQ

**Do coins move?**
No. Message signing only. Funds remain in your wallet, always.

**Is this reputation?**
No. It's a stake receipt. Reputation implies social judgment; this is a cryptographic proof that someone chose to lock opportunity cost against a handle. Call it what it is.

**What prevents faking?**
Bitcoin signatures are cryptographically unforgeable. The chain state is publicly auditable. The only way to "fake" a high-`sats × days` attestation is to actually hold that Bitcoin for that time.

**What if my coins move?**
The attestation becomes `bond_insufficient` (if `bond:` was set) or `bond_zero` (if not). Any verifier will report this on next check. There is no grace period — it's live chain state.

**Which wallets?**
Anything that signs BIP-322. Sparrow, Electrum, Bitcoin Core, most hardware wallets via PSBT. Legacy `signmessage` works for `1…` addresses.

**Why Bitcoin?**
Because the opportunity-cost-of-holding is real, measurable, and adversary-agnostic. Ethereum gas is volatile; other-chain reserves aren't credibly neutral. Bitcoin UTXOs give us the cleanest economic signal on the open internet.

**Can I revoke an attestation?**
Spend the bonded UTXOs (implicit) or publish a replacing attestation with the same ID (explicit).

## License

- Protocol & spec text: **CC-BY-4.0**
- Reference code: **MIT**
- "OrangeCheck" name/logo: trademark; don't imply endorsement.

---

**Built with Bitcoin. Verified by anyone. Consumed by one API call.**

---
title: OrangeCheck — Vision & Product Brief
status: Active
version: 2.0
last_updated: 2026-04-20
---

# OrangeCheck

**Proof of Bitcoin stake for the open web.**
*Sats as signal. No KYC, no custody.*

---

## The one idea

A small Bitcoin balance, left unspent for a while, is the only credible sybil-resistance signal in existence. Everything else costs trust:

- **Proof of work** costs electricity.
- **KYC** costs dignity and creates a honeypot.
- **Captchas** cost attention and break constantly.
- **Social vouching** costs a pre-existing graph.
- **Bonded sats** cost opportunity cost on bitcoin you already held.

OrangeCheck turns that bonded signal into a portable, cryptographic, platform-neutral proof that any app can read in one API call. **No custody. No account. No permission.**

## What it is, in one sentence

> A Bitcoin-signed statement that links an address to one or more handles, so anyone can verify on-chain that the holder has kept **N sats unspent for N days**.

That's the whole product. The rest is plumbing.

## What it is not

- **Not reputation.** "Reputation" implies social judgment; this is a stake receipt. Don't sell it as karma.
- **Not identity.** Address control + a self-asserted handle is not proof-of-human. It is proof that the human (or system) that controls address X *also* claims handle Y.
- **Not custody.** Funds never move. No deposits. No escrow.
- **Not a delegation / agent credential system.** A prior draft chased that direction. It's been retired. The thing that makes OrangeCheck unique is the *Bitcoin* part — a protocol that would work on any keypair isn't this one.

## Why now, why Bitcoin

Every open protocol in 2026 — Nostr, the fediverse, decentralized forums, airdrops, token-gated communities, DAOs — has the same unsolved problem: **"how do we filter spam without becoming Twitter?"**

Centralized platforms solve it with phone-number verification, email confirmation, and ML-driven shadowbans. Open protocols can't. They need a sybil filter that:

1. Works offline (no central server can turn it off).
2. Costs attackers something real at scale.
3. Is cheap or free for honest users.
4. Doesn't require a graph to bootstrap.
5. Is computable from public data.

Bitcoin UTXOs check every box. A fresh address holding 100k sats for 30 days costs you the time-value of ~$70 of BTC. That's trivial for a real user. It's *ruinous* to fake ten thousand times.

Nothing else on the internet has this property.

## Three audiences

### 1. Platforms — the customers
Forum operators, Nostr relay operators, airdrop distributors, DAO vote coordinators, Discord bot authors, marketplace listing gates. They want a drop-in filter. We give them:

- `GET /api/check?addr=<addr>&min_sats=100000&min_days=30`
- `npm i @orangecheck/gate` for Node/Next middleware
- Paid: hosted verifier with webhooks ("tell me when this attestation changes"), custom scoring, private attestations, SLAs.

### 2. Developers — the integrators
Wallet app devs, Nostr client devs, anyone who wants to add the badge or the gate. They want a 30-second integration. We give them:

- A tiny SDK: `createAttestation`, `verify`, `check`.
- A copy-pasteable embed: `<div data-oc-addr="bc1q…"></div>`.
- Clear examples for the three integration shapes: create, display, gate.

### 3. Users — the stakers
Anyone on Nostr, on a forum, posting into a community. They want to stop being mistaken for a bot. We give them:

- A **single-page** create flow: enter address + handles, sign once, get a shareable URL + badge.
- A proof page that's human-readable *and* machine-readable.
- No account. Ever.

## Scope (v2)

### In
- Canonical message + BIP-322 signing (unchanged — the spec is correct).
- Content-addressed attestation ID (unchanged).
- Single reference score (`score_v0`). One tier helper. No algorithm zoo.
- Identity bindings for **Nostr, GitHub, DNS, Twitter**. That's it.
- Nostr publishing (kind 30078) for decentralized discovery.
- Public JSON verifier API with a rate-limited free tier.
- One embed widget, one badge variant (two themes).
- A single-page create flow (not a stepper).
- A single-page verify flow (focused; not an SDK-in-a-page).

### Out (retired)
- Agent / delegation credentials (OCD). Use UCAN if you need that.
- LOCK protocol integration (different project).
- Six-algorithm scoring registry (overkill; keep the registry concept, drop the implementations).
- Badge variants × themes × field-config matrix.
- Four-step wizard UX.
- Email, web-origin, DID identity verification stubs (re-add when a real integrator asks).

## Licensing + sustainability

Open protocol, forever. The spec is [CC-BY-4.0](https://github.com/orangecheck/oc-protocol); every reference implementation is [MIT](https://github.com/orangecheck/oc-packages). Nothing about using OrangeCheck — the protocol, the SDKs, the hosted verifier at `ochk.io` — costs anything to a user or an integrator today.

Sustainability isn't a priority yet. When it becomes one, the defaults we've already committed to are:

- **No fiat rails.** Any paid surface settles in BTC or Lightning. A Bitcoin-native sybil primitive with Stripe plumbing attached is a category error — it silently imports every assumption we're explicitly rejecting (KYC flows, chargebacks, IP-based fraud models, custody of payment state).
- **Hosted ≠ gatekeeping.** Whatever ends up on the hosted verifier, the open-source packages stay at feature parity. Any integrator can self-host `@orangecheck/sdk` + `@orangecheck/gate` and hit their own Esplora + Nostr relays to replicate it.
- **No tokens, no custody, no chain.** The product is cryptographic signatures over Bitcoin chain state. Anything that tries to extend it into a token or an L2 or a custodial rail has stopped being OrangeCheck.

We'll figure out the shape when integrators actually need something paid. Until then the focus is adoption, not revenue.

## Success metrics

- **Integrations**, not signups. We don't care about users on orangecheck.io. We care about how many places on the open internet will reject a post without an OC badge.
- **Attestations that survive 90 days** — a proxy for real commitments vs throwaway test proofs.
- **Median `/api/check` latency under 150ms** — this has to feel like a synchronous permission check.
- **Zero-config developer path** — a dev with an address should be able to go from "I heard of this" to "I'm gating my Discord" in under 10 minutes.

## Design rules

- **Do not add a step to a flow.** Remove one first.
- **Ship the API before the UI.** If a feature can't be called from `curl`, it doesn't exist.
- **One metric displayed at a time.** Users don't want to read a dashboard.
- **If a platform isn't asking for it, it's speculation.** Build against real integrator pain, not imagined protocols.
- **Bitcoin is load-bearing, not ornamental.** If we ever find ourselves designing a feature that would work identically on Ed25519, stop.
- **Bitcoin-native all the way through.** If we ever charge for anything, it's settled in BTC or Lightning. No Stripe. No card processing. No fiat rails bolted onto a Bitcoin-native protocol — that's a category error. The whole point is that value, access, and identity share one settlement layer.

## What we're not going to do

- Not going to issue tokens.
- Not going to spin up our own chain or L2.
- Not going to build identity-score aggregation that "combines multiple attestations into a unified score." Every aggregator becomes a walled garden in time.
- Not going to claim this solves AI-agent trust. It doesn't.
- Not going to run custody of anything, ever.
- Not going to add fiat billing. When paid tiers arrive, they settle in BTC/Lightning. Stripe-shaped plumbing would silently import every assumption a Bitcoin-native protocol is explicitly rejecting.

## Current status

- **Protocol v0** — frozen. Canonical message, BIP-322 signing, content-addressed attestation IDs, the `score_v0` reference algorithm, and the four-protocol identity set (Nostr, GitHub, DNS, Twitter) are all shipped and unchanged.
- **Public API** — `GET /api/check`, `POST /api/verify`, `GET /api/challenge`, `GET /api/discover`, `GET /api/stats`, `GET /api/og/check` all live at `ochk.io`, CORS-enabled, no API key.
- **Auth layer** — `/signin` + `/dashboard` at ochk.io exchange a BIP-322 signature for an httpOnly session cookie (`/api/auth/*`). See the live docs for the reference implementation.
- **Packages shipped** — `@orangecheck/sdk`, `@orangecheck/gate`, `@orangecheck/react`, `@orangecheck/wallet-adapter`, `@orangecheck/cli`, `@orangecheck/relay-filter`, `@orangecheck/airdrop-gate` on npm; `orangecheck` on PyPI.
- **Next** — integrator wins. The only validation that matters is the first external Nostr client, forum, or airdrop operator running `/api/check` in production.

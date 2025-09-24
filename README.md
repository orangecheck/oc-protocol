# OrangeCheck Protocol (OCP)

*A tiny, Bitcoin‑native proof of “skin in the game.” Sign one message, prove control of an address, and let anyone recompute sats + time from public chain data. No accounts. No custody. No spend.*

[![Status](https://img.shields.io/badge/status-draft_v0-informational)](#) [![License](https://img.shields.io/badge/license-CC--BY--4.0%20%2F%20MIT-blue)](#) 

---

## Table of Contents

- [What is OrangeCheck?](#what-is-orangecheck)
- [Repo Structure](#repo-structure)
- [Quick Start](#quick-start)
  - [Issue (create) a proof](#issue-create-a-proof)
  - [Verify (check) a proof](#verify-check-a-proof)
  - [Embed a badge](#embed-a-badge)
- [Specs vs Protocol](#specs-vs-protocol)
- [Conformance & Test Vectors](#conformance--test-vectors)
- [Extension Key Registry](#extension-key-registry)
- [Reference Implementations](#reference-implementations)
- [Versioning](#versioning)
- [Security & Privacy Notes](#security--privacy-notes)
- [Contributing](#contributing)
- [License](#license)
- [FAQ](#faq)

---

## What is OrangeCheck?

OrangeCheck is a **portable, self‑sovereign reputation signal** for the web:

- You **sign** a canonical, human‑readable message that names a **Bitcoin address**.
- Anyone can **verify** locally that you control that address and then **recompute** the bond (confirmed balance) and streak (days unspent) from public chain data.
- A simple, versioned **score** is provided for UX comparability. No spend, no KYC, no accounts.

If you’re new, start with **[PROTOCOL.md](./PROTOCOL.md)** (the “what & why”) and then implement against **[SPEC.md](./SPEC.md)** (the “how”).

---

## Repo Structure

```
oc-protocol/
├─ PROTOCOL.md        # high-level rationale, rules, lifecycle, invariants
├─ SPEC.md            # normative v0 spec (canonical message, wire formats, algorithms)
├─ reference/         # informative examples (issuer + verifier)
│  ├─ issuer/         # minimal message builder UI
│  └─ verifier/       # minimal web verifier (loads a proof link/JSON)
├─ conformance/       # machine-checkable tests
│  ├─ vectors/        # tv1.json, tv2.json, ...
│  └─ runner/         # script to run vectors against an implementation
└─ registry/
   └─ extensions.md   # registered extension keys (`aud`, `cap`, `expires`, ...)
```

> **Tip:** Treat `SPEC.md` as the source of truth. Reference code is *informative* only. Conformance is determined by tests in `/conformance`.

---

## Quick Start

### Issue (create) a proof

1. Construct the **canonical message** exactly as in `SPEC.md §2` (7 core lines; LF line endings; one trailing LF; optional sorted extensions).
2. Ask the wallet to **sign the full text** (prefer **BIP‑322**; allow legacy `signmessage` only for `1…` addresses).
3. Package the tuple `(addr, msg, sig, scheme)` in either:
   - a **Verify URL**:  
     ```
     /verify?addr=<ADDR>&msg=<BASE64URL_UTF8_MSG>&sig=<SIG>&scheme=<SCHEME>&sc=v0
     ```
   - an **Envelope JSON** per `SPEC.md §4.2`.

> An Issuer UI should auto‑fill `nonce` (16B hex), `issued_at` (RFC‑3339 UTC), and optionally add extensions (`aud`, `expires`, etc.).

### Verify (check) a proof

A minimal verifier MUST:

1. Base64url‑decode `msg`, enforce **canonical form** (ordering, literals, single trailing LF, sorted extensions).
2. Verify **signature** for `(addr, msg)` (BIP‑322 first → legacy for `1…` only).
3. Fetch **confirmed, unspent UTXOs** for `addr` (Esplora‑compatible endpoints).
4. Compute:
   - `sats_bonded` (sum of values)
   - `days_unspent` (from earliest confirmation time)
   - `score_v0 = round( ln(1 + sats_bonded) * (1 + days_unspent / 30), 2 )`
5. Optionally enforce **policy**: `aud` match, future `expires`, `cap` thresholds.
6. Display status + metrics, and include `sc=v0` wherever the score appears.

### Embed a badge

- Render a compact badge showing **Signature status • Sats • Streak • Score v0**.  
- Link the badge to your **verify URL** so anyone can recompute on click.  
- Encourage users to **rotate**: fresh address per badge; retire by spending.

---

## Specs vs Protocol

- **Protocol** = the live ruleset and lifecycle (what participants do). See **[PROTOCOL.md](./PROTOCOL.md)**.  
- **Spec** = the formal, testable description of how to interoperate. See **[SPEC.md](./SPEC.md)**.

Say “OrangeCheck Protocol” when referring to the system; publish and target the **Spec v0** for implementation.

---

## Conformance & Test Vectors

- Conformance is defined by **`SPEC.md §8`**.  
- Test vectors live in **`/conformance/vectors`** and cover valid/invalid cases, both schemes, and policy outcomes.  
- The **runner** in `/conformance/runner` should accept your verifier as a CLI/HTTP target and report pass/fail per vector.

**Example (illustrative):**
```bash
# Run your verifier against vectors
node conformance/runner/run.js --target http://localhost:8080/verify
# or
python conformance/runner/run.py --target ./dist/verifier-cli
```

> Please contribute new vectors for edge cases (encoding, LF handling, unsorted extensions, legacy corner‑cases, etc.).

---

## Extension Key Registry

Extensions are **signed, optional** lines inside the canonical message (`SPEC.md §2.2`). Keys are lowercase ASCII and **sorted lexicographically**.

Registered keys (v0): `aud`, `cap`, `expires`, `network`, `scope`.

- See **`/registry/extensions.md`** for semantics and security notes.
- Propose new keys via PR including: motivation, verifier behavior, security considerations, and conformance tests.

---

## Reference Implementations

Under `/reference` you’ll find minimal examples:

- **Issuer**: builds canonical text, collects signature from a wallet, emits link/JSON.
- **Verifier**: loads proof, verifies signature locally, queries UTXOs, displays status & score.

> These are **informative** examples to help you get started, not normative source of truth.

---

## Versioning

- Protocol header string `orangecheck v0` and the seven core lines are **frozen for v0**.
- Any change to header, core wording/order, canonicalization, or signature schemes **requires a version bump**.
- Score version is tracked independently via `sc` (e.g., `sc=v0`). Scores from different versions are **not comparable**.

---

## Security & Privacy Notes

- Use **fresh, single‑purpose addresses**. Rotate freely; retire by spending.
- Identity hints are **inside the signature** (npub/handle/web label). Omit if you prefer pseudonymity.
- Verifiers query public explorers; consider **Tor/VPN** and/or multi‑source cross‑checks.
- RPs that need binding to origin should require **`aud:`** to equal their own origin.

---

## Contributing

- Read **[SPEC.md](./SPEC.md)** first; proposals must not break canonicalization.  
- Open issues/PRs with **clear diffs** and, where applicable, **new test vectors**.  
- For new extension keys, update **`/registry/extensions.md`** and provide conformance cases.

### Development (suggested)

```bash
pnpm i
pnpm -C reference/issuer dev
pnpm -C reference/verifier dev
pnpm -C conformance/runner test
```

---

## License

- **Protocol & Spec text**: CC‑BY‑4.0  
- **Reference code**: MIT  
- “OrangeCheck” name/logo: trademark of their owners; do not imply endorsement.

---

## FAQ

**Do coins move?** No. Message signing only; funds remain in your wallet.  
**Which wallets are supported?** Any that can sign messages. Prefer **BIP‑322**; legacy `signmessage` is for `1…` addresses only.  
**What exactly does a badge prove?** (1) Control of the address (signature). (2) At verification time there are **confirmed, unspent** sats there. From that we compute **sats_bonded**, **days_unspent**, and **score v0**.  
**Can I hide the address?** Not in v0. Transparency enables universal recomputation. Use fresh addresses and rotate.  
**Mainnet only?** Yes by default. Use `network: signet` **only** for testing (and verifiers must be in test mode).

---

**🚀 Ready to build?** Start with **[SPEC.md](./SPEC.md)** and wire up a minimal issuer/verifier. If you ship an integration (wallets, sites), add yourself to the **Adopters** list in your PR.

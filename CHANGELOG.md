# Changelog

All notable, normative-surface changes to **OC Attest** — the protocol and
its conformance vectors. SDK / package changelogs live in
[`oc-packages`](https://github.com/orangecheck/oc-packages) per package.

This file follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
conventions. The protocol uses [Semantic Versioning](https://semver.org/) at
the spec level: a MINOR bump is wire-compatible; a MAJOR bump invalidates
existing attestations.

---

## [Unreleased]

### Added

- **`LIFECYCLE.md`** — normative companion document specifying what a publisher MAY do to an attestation after publication. Reaffirms `NIP_ORANGECHECK.md` §Revocation's "no explicit revocation event" stance and clarifies the §Revocation §2 wording ambiguity around "parameterised replacement": because the d-tag *is* the `attestation_id` (line 61), same-d replacement is structurally impossible — two distinct attestations from the same address coexist as separate canonical events under their own `(pubkey, kind, d)` coordinates. The only protocol-level primitives are `expires_at` (forward-looking commitment, set at sign time) and bond withdrawal via UTXO spend (the de-facto exit; verifier sees it on next live check). Reaffirms that dashboard-local hide flags and NIP-09 deletion-request events have no protocol force, and gives implementers a compliance summary distinguishing honest from dishonest "revoke" UI affordances. No protocol changes; clarification only.

- _(nothing pending)_

## [1.1] — 2026-05-16

OC Attest's first feature beyond the v0 stake attestation: the **Binding
Attestation** (OC Attest **v1**). This is exactly the feature the protocol
deferred when it retired the `email:` / `did:` identity bindings in v0
"until reliable, decentralized proof-of-control mechanisms are specified" —
a mutual BIP-322 + Nostr counter-signature *is* that mechanism, for any
counter-identity that holds a signing key. Wire-compatible: the v0 stake
attestation (`SPEC.md`) is unchanged and existing attestations remain
valid, so this is a MINOR spec bump.

### Added

- **`SPEC-BINDING.md`** — normative companion specification for the Binding
  Attestation. Defines a mutually-signed, content-addressed,
  Nostr-publishable artifact binding **one Bitcoin address** and **one
  Nostr public key** as a single principal. Header literal
  `orangecheck-binding` (distinct from the v0 `orangecheck` and the §14
  `orangecheck-auth` so signatures can never cross-verify); fixed 8-line
  core message with a `v: 1` line; `binding_id = SHA-256(canonical_message)`;
  dual signature (BIP-322 by the BTC key as root proof, NIP-01 Schnorr by
  the Nostr key as counter-signature); the single-message rule; a pure,
  offline verification algorithm; error codes; trust model; and the
  email-exclusion rationale. The bond **carries** a signed `did:oc` as a
  portable, re-importable backup of the account graph — it does **not**
  define `did:oc` (the auth-host database stays authoritative; AUTH-PLAN
  §10 Fork 2a).
- **Nostr kind `30079`** — OC Attest Binding Attestation, parameterized
  replaceable event, `d`-tag namespace `oc-attest-binding:<binding_id>`.
  Exclusive to OC Attest, not co-claimed. Registered in `registry/`,
  `SPEC-BINDING.md` §13, and the family kind registry.
- **`conformance/vectors/bv01`–`bv08`** — Binding Attestation conformance
  vectors (canonical message, `binding_id` derivation, valid mutual-signature
  verification, BIP-322-fail, Nostr-sig-fail, line-smuggling rejection,
  header-literal-collision rejection, message-mismatch rejection). Indexed
  in `conformance/vectors/binding-index.json`.
- **`conformance/generate-binding-vectors.mjs`** — deterministic generator
  for the `bv*` set, using disclosed burn keys.

### Changed

- `registry/extensions.md` — adds the Binding Attestation registry section
  (kind 30079, `oc-attest-binding:` d-tag namespace, the `expires` /
  `network` binding-message extensions); notes that the v0 `did:` deferral
  is now resolved by a separate artifact, not by re-opening the v0
  `identities:` prefixes. Bumped to registry version 1.2.0.
- `SECURITY.md` — adds the Binding Attestation threat model (replay/nonce,
  the single-message attack, header-literal collision, the
  email-exclusion rationale, and the "bond is a backup, not a
  source-of-truth" stance).

## [1.0] — 2026-04-25

Spec is now stable. The protocol shipped earlier; this release marks the
explicit guarantee that the canonical-message format, the BIP-322 signing
rules, the sats-bonded / days-unspent semantics, and the `/api/check`
response shape are FROZEN at v1. Future MINOR versions add fields without
breaking existing verifiers; future MAJOR versions require coordinated
upgrade.

### Added

- `LICENSE` (MIT — matches the rest of the OrangeCheck family).
- `SECURITY.md` — verifier-facing threat model, the family-pattern
  per-protocol security doc.
- `WHY.md` — symlink to `VISION.md` so the protocol repo follows the family
  file layout.
- `test-vectors/` — symlink to `conformance/vectors/`, also for family-shape
  parity.

### Changed

- README + integration docs now link the docs.ochk.io umbrella as the
  reader's first stop instead of the per-subdomain attest.ochk.io site.

## [0.2] — 2026-04-12

### Added

- `conformance/v0.2/` — real BIP-322 signature vectors (replacing the v0.1
  smoke-test stubs). Reference implementations in `oc-packages/sdk` (TS)
  and `oc-packages/sdk-py` (Python) are required to round-trip every vector
  on every CI run.
- `conformance/generate-signatures.mjs` — deterministic harness for
  regenerating vectors when the canonical-message format changes.

### Changed

- Canonical-message field order frozen: `address` → `sats_bonded` →
  `days_unspent` → `attested_handles` → `nonce` → `issued_at` →
  `expires_at` → `attestation_id`. The `id` is the SHA-256 of the
  RFC-8785-canonicalised payload, computed AFTER signing.

## [0.1] — 2026-03-04

Initial public draft.

### Added

- `PROTOCOL.md`, `SPEC.md`, `README.md`, `INTEGRATION.md`, `VISION.md`,
  `NIP_ORANGECHECK.md` — the first complete description of the protocol.
- `conformance/v0.1/` — placeholder smoke-test vectors.
- `examples/` — minimal worked examples for sign + verify against a forum
  gate, an airdrop allowlist, and a Nostr relay.
- `registry/` — handle-prefix registry (`github:`, `nostr:`, `email:`,
  `ens:`, `twitter:`, `web:`).

[Unreleased]: https://github.com/orangecheck/oc-attest-protocol/compare/v1.1...HEAD
[1.1]: https://github.com/orangecheck/oc-attest-protocol/compare/v1.0...v1.1
[1.0]: https://github.com/orangecheck/oc-attest-protocol/compare/v0.2...v1.0
[0.2]: https://github.com/orangecheck/oc-attest-protocol/compare/v0.1...v0.2
[0.1]: https://github.com/orangecheck/oc-attest-protocol/releases/tag/v0.1

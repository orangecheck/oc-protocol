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

### Changed

- **Identity protocol `twitter:` renamed to `x:`** (§2.1.1, `registry/extensions.md`). `x:@username` is the registered handle for the platform (rebranded from Twitter). Wire-compatible: legacy `twitter:` bindings remain valid and verifiers SHOULD treat them as `x:`. Existing conformance vectors (`tv03`, `tv09`) keep their `twitter:` messages + ids as legacy fixtures.

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

[Unreleased]: https://github.com/orangecheck/oc-attest-protocol/compare/v1.0...HEAD
[1.0]: https://github.com/orangecheck/oc-attest-protocol/compare/v0.2...v1.0
[0.2]: https://github.com/orangecheck/oc-attest-protocol/compare/v0.1...v0.2
[0.1]: https://github.com/orangecheck/oc-attest-protocol/releases/tag/v0.1

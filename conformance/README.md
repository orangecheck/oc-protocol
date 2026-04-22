# OrangeCheck Conformance Vectors

Machine-readable test vectors any OCP implementation must pass.

Each file in `vectors/` is a JSON document with a fixed schema (below). Implementations — TypeScript, Python, Rust, Swift, Go, whatever comes next — load these files in their test suite and assert the expected output matches. If your implementation disagrees with a vector, one of the two is wrong. Open an issue.

## Scope of this vector set (v0)

This vector set covers:

| Area | Vectors | What it pins down |
|---|---|---|
| Canonical message format | `tv01`–`tv04` | Byte-for-byte canonical text the signer sees. |
| Identity list ordering / escaping | `tv05`–`tv07` | Lexicographic sort; rejection of unsafe characters. |
| Attestation ID derivation | `tv08`–`tv09` | `sha256(canonical_message_bytes)` → 64-hex, lowercase. |
| `score_v0` reference algorithm | `tv10`–`tv13` | Exact output of the published formula. |
| Extension sorting + `bond` semantics | `tv14`–`tv16` | Lex sort of ext keys; bond surplus ignored. |
| Error / rejection cases | `tv17`–`tv20` | Inputs an implementation MUST refuse. |

Full end-to-end BIP-322 signature vectors (signature bytes fixed) are deferred to a v0.2 vector set once a deterministic signing setup across both TS and Python is published. The format and ID derivation vectors here already pin down the one-way side of the protocol — they're what lets a new implementation prove it produces the same `attestation_id` as ochk.io for the same canonical input.

## Vector schema

```jsonc
{
  "id": "tv01",
  "category": "canonical_message",
  "description": "bare address, no identities, no extensions",
  "input": {
    // inputs specific to the category — see per-category schemas below
  },
  "expected": {
    // what a conforming implementation must produce (or reject)
  }
}
```

### Category: `canonical_message`

```jsonc
{
  "input": {
    "address": "bc1q...",
    "identities": [{ "protocol": "github", "identifier": "alice" }],
    "extensions": { "bond": "1000000" },
    // Fixed nonce + issued_at so output is deterministic
    "nonce": "0011223344556677889900aabbccddee",
    "issued_at": "2026-04-22T12:00:00Z"
  },
  "expected": {
    // Byte-for-byte canonical message. Includes trailing \n.
    "message": "orangecheck\nidentities: github:alice\n..."
  }
}
```

### Category: `attestation_id`

```jsonc
{
  "input": { "message": "orangecheck\n..." },
  "expected": { "attestation_id": "<64-char lowercase hex>" }
}
```

### Category: `identities_format`

```jsonc
{
  "input": { "identities": [{ "protocol": "...", "identifier": "..." }, ...] },
  "expected": { "formatted": "protocol1:id1,protocol2:id2" }
}
```

### Category: `score_v0`

```jsonc
{
  "input": { "sats_bonded": 100000, "days_unspent": 30 },
  "expected": { "score_v0": 23.04 }
}
```

### Category: `reject`

```jsonc
{
  "input": { "identities": [{ "protocol": "github", "identifier": "alice\nevil" }] },
  "expected": { "rejects": true, "reason_contains": "newline" }
}
```

## Running the vectors

### TypeScript (`@orangecheck/sdk` >= 0.1.4)

```bash
cd packages/sdk
yarn test            # loads vectors from this repo's conformance/vectors/
```

### Python (`orangecheck` >= 0.1.2)

```bash
cd packages/sdk-py
pytest tests/test_conformance.py
```

### Your implementation

Read the vectors/ files, run each through the appropriate entry point, assert `expected` matches (exactly — no "close enough" on byte-level canonical outputs). Report results in [github.com/orangecheck/oc-protocol/issues](https://github.com/orangecheck/oc-protocol/issues).

## Changelog

- **v0 (2026-04-22)** — Initial format + ID + scoring + error-case vectors.

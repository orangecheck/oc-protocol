# Conformance Runner

Two complementary checks:

1. **Offline lints** — fast canonicalization checks (no crypto, no network).
2. **HTTP runner** — hits a running verifier via HTTP and compares outputs to vector expectations.

> Replace dummy signatures in vectors with real signatures to fully exercise signature verification.

## Usage

### Offline lints

```bash
python offline_lints.py --vectors ../vectors
```

This validates:
- LF line endings and exactly one trailing LF
- Core lines present and exact literals for header/purpose/ack
- `nonce` is 32 lowercase hex
- Extensions are lexicographically sorted
- `issued_at` parses RFC-3339
- `address` line matches `addr`

### HTTP runner

Assumes your verifier exposes either:
- `GET /verify?addr=...&msg=...&sig=...&scheme=...&sc=v0` returning JSON, or
- `POST /verify` with JSON envelope: `{ ocp, scheme, addr, msg_b64url, sig, sc }`

```bash
python http_runner.py --target http://localhost:8080 --vectors ../vectors
```

Flags:
- `--post` — use POST with JSON envelope instead of GET.
- `--strict` — require all expected status codes to be present.

The runner *optionally* feeds `mock_utxos` to your verifier by sending them in a non-normative header `X-Mock-UTXOs: base64(json)` to avoid hitting real explorers during tests.

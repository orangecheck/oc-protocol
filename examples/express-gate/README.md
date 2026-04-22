# express-gate — minimal Express + @orangecheck/gate

```bash
yarn install
yarn start
```

Then:

```bash
# Unprotected — always 200
curl http://localhost:3000/hello

# Gated — 401 when no address, 403 when address fails threshold, 200 when it passes.
curl -X POST http://localhost:3000/post                                      # 401 no_subject
curl -H 'x-oc-address: bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq' \
     -X POST http://localhost:3000/post                                      # 403 not_found / below_threshold (no attestation on this address)
```

Test against a real attestation you control by creating one at [ochk.io/create](https://ochk.io/create) and passing that address.

## File map

- `server.js` — the entire demo, ~25 lines.
- `package.json` — one runtime dep (`@orangecheck/gate`) + Express.

Swap `from: 'header'` for a session-backed source for production. See [../README.md](../README.md).

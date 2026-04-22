# OrangeCheck starter examples

Minimal, runnable templates for the most common integrations. Each folder contains everything you need — dependencies, a single-file server, and a one-command run script.

## Prerequisites

- Node 18+
- Any wallet or address with a (optional) OrangeCheck attestation published on Nostr. Test addresses without an attestation will get correctly rejected by the gate; you can flip thresholds to `0` to let any valid address through.

## Examples

| Folder | Stack | What it shows |
|---|---|---|
| [`express-gate/`](./express-gate) | Express + `@orangecheck/gate` | Sybil-gated `POST /post` that rejects pubkeys below a threshold |
| [`nextjs-gate/`](./nextjs-gate) | Next.js App Router + `@orangecheck/gate/hono`-equivalent | Gated Route Handler (Fetch-style, edge-safe) |
| [`hono-gate/`](./hono-gate) | Hono + `@orangecheck/gate/hono` | Same gate on Cloudflare Workers / Bun / Deno |

Every example has the same shape:

1. A single protected endpoint.
2. `x-oc-address` header is used as the address source for demo simplicity. **In production, bind the address to a signed session instead** — see [`/docs/guides/sign-in-with-bitcoin`](https://ochk.io/docs/guides/sign-in-with-bitcoin) for the full challenge-response pattern that proves the caller actually controls the address.
3. A `/hello` unprotected route so you can confirm the server's up.

## Run

```bash
cd examples/express-gate      # or nextjs-gate, hono-gate
yarn install
yarn start
# in another shell:
curl -H "x-oc-address: bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq" \
     -X POST http://localhost:3000/post
```

## What "production-ready" looks like

The examples deliberately use `from: 'header'` because it makes the flow visible in one curl command. For a real integration:

- Replace the header source with a session-backed one: `address: { from: (req) => req.session.verifiedAddress }`.
- Run a challenge-response flow to populate that session — see the live reference at [ochk.io/signin](https://ochk.io/signin) and its source in `src/pages/signin/index.tsx` of [`oc-web`](https://github.com/orangecheck/oc-web).
- Configure `lookupTimeoutMs` and `cacheTtlMs` to match your latency/freshness tradeoff.
- Decide on `failOpen` — defaults to `false` (fail-closed) which is almost always the right call for sybil gates.

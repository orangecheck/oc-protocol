# nextjs-gate — Next.js App Router + @orangecheck/gate

```bash
yarn install
yarn dev
```

Then:

```bash
curl http://localhost:3000/api/hello                                         # 200
curl -X POST http://localhost:3000/api/post                                  # 401 no_subject
curl -H 'x-oc-address: bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq' \
     -X POST http://localhost:3000/api/post                                  # 403 or 200
```

Uses `ocGateFetch` — the framework-agnostic Fetch-style guard that works in:
- Next.js App Router route handlers (this example)
- Cloudflare Workers
- Bun / Deno

For Next.js Pages API (`/api/*.ts`), use `withOcGate` instead — see [`oc-web/src/pages`](https://github.com/orangecheck/oc-web) for a worked example.

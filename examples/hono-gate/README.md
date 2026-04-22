# hono-gate — minimal Hono + @orangecheck/gate/hono

Runs on Node today, deploys unchanged to Cloudflare Workers, Bun, and Deno.

```bash
yarn install
yarn start
```

Then:

```bash
curl http://localhost:3000/hello                                             # 200
curl -X POST http://localhost:3000/post                                      # 401 no_subject
curl -H 'x-oc-address: bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq' \
     -X POST http://localhost:3000/post                                      # 403 or 200
```

## Deploying to Cloudflare Workers

```bash
yarn add -D wrangler
npx wrangler init        # one-time; then paste server.ts into the Worker entrypoint
npx wrangler deploy
```

The `ocGateHono` middleware works the same on Workers as on Node — no code changes.

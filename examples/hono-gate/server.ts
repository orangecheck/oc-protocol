// Minimal OrangeCheck-gated Hono server.
//
// Runs on Node via @hono/node-server. The same code deploys unchanged to
// Cloudflare Workers, Bun, and Deno — that's the point of using Hono.
//
//   yarn install && yarn start
//   curl http://localhost:3000/hello
//   curl -H 'x-oc-address: bc1q...' -X POST http://localhost:3000/post

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { ocGateHono } from '@orangecheck/gate/hono';

const app = new Hono();

app.get('/hello', (c) => c.json({ ok: true, msg: 'server up' }));

app.post(
    '/post',
    ocGateHono({
        minSats: 100_000,
        minDays: 30,
        address: { from: 'header' },
        trustUnsafeSources: true,
    }),
    (c) => c.json({ ok: true, msg: 'authenticated post accepted' })
);

const port = Number(process.env.PORT ?? 3000);
console.log(`oc-example-hono listening on http://localhost:${port}`);
serve({ fetch: app.fetch, port });

// Minimal OrangeCheck-gated Express server.
//
// Run with:
//   yarn install && yarn start
// Then:
//   curl http://localhost:3000/hello
//   curl -H 'x-oc-address: bc1q...' -X POST http://localhost:3000/post
//
// Flip the thresholds below to gate more / less strictly. For production,
// replace `from: 'header'` with a session-backed source — see ../README.md.

import express from 'express';
import { ocGate } from '@orangecheck/gate';

const app = express();
app.use(express.json());

app.get('/hello', (_req, res) => {
    res.json({ ok: true, msg: 'server up' });
});

app.post(
    '/post',
    ocGate({
        minSats: 100_000, // 100k sats bonded
        minDays: 30, // for at least 30 days
        address: { from: 'header' }, // reads X-OC-Address
        // Keep startup quiet; in production wire a real logger.
        trustUnsafeSources: true,
    }),
    (req, res) => {
        // `req.orangecheck` is attached by withOcGate; ocGate-style middleware
        // leaves the decision on the cache but doesn't inject it into req.
        res.json({
            ok: true,
            msg: 'authenticated post accepted',
            address: req.headers['x-oc-address'],
        });
    }
);

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
    console.log(`oc-example-express listening on http://localhost:${PORT}`);
    console.log(`  GET  /hello   — unprotected`);
    console.log(`  POST /post    — gated (x-oc-address required, ${100_000} sats × 30d)`);
});

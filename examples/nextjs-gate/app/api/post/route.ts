// Gated App Router route handler.
//
// Works on Edge, Node, and anywhere else Next deploys.
// Call it with:
//
//   curl -H 'x-oc-address: bc1q...' -X POST http://localhost:3000/api/post

import { ocGateFetch } from '@orangecheck/gate';

export async function POST(req: Request) {
    const decision = await ocGateFetch(req, {
        minSats: 100_000,
        minDays: 30,
        address: { from: 'header' },
        trustUnsafeSources: true,
    });

    if (!decision.ok) {
        return new Response(
            JSON.stringify({
                error: 'orangecheck_gate_blocked',
                reason: decision.reason,
            }),
            {
                status: decision.reason === 'no_subject' ? 401 : 403,
                headers: { 'content-type': 'application/json' },
            }
        );
    }

    return new Response(JSON.stringify({ ok: true, msg: 'authenticated post accepted' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    });
}

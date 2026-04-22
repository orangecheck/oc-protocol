export async function GET() {
    return new Response(JSON.stringify({ ok: true, msg: 'server up' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    });
}

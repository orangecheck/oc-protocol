export default function Home() {
    return (
        <main style={{ fontFamily: 'ui-monospace, monospace', padding: 40 }}>
            <h1 style={{ fontSize: 18 }}>oc-example-nextjs-gate</h1>
            <p>
                Try:&nbsp;
                <code>GET /api/hello</code> (unprotected),&nbsp;
                <code>POST /api/post</code> (gated).
            </p>
        </main>
    );
}

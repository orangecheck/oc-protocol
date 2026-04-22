#!/usr/bin/env node
/**
 * Vector generator for the OCP v0 conformance suite.
 *
 *   node conformance/generate.mjs
 *
 * Produces vectors/*.json using the canonical message format specified
 * in SPEC.md §2 and the score_v0 formula from SPEC.md §8.3. Run this
 * whenever the spec changes; the output files are what implementations
 * actually test against.
 *
 * This script is deliberately self-contained — no dependency on
 * @orangecheck/sdk — so the vectors pin down the spec, not any one
 * implementation's interpretation of it.
 */

import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'vectors');
mkdirSync(OUT_DIR, { recursive: true });

// ─── Canonical message builder (reference implementation) ─────────────────

const IDENTITY_PROTOCOL_RE = /^[a-z][a-z0-9_-]*$/;
const IDENTITY_FORBIDDEN = /[\r\n,]/;

function assertSafeIdentity({ protocol, identifier }) {
    if (!IDENTITY_PROTOCOL_RE.test(protocol)) {
        throw new Error(`invalid protocol: ${JSON.stringify(protocol)}`);
    }
    if (!identifier || IDENTITY_FORBIDDEN.test(identifier)) {
        throw new Error(`invalid identifier: ${JSON.stringify(identifier)}`);
    }
}

function formatIdentities(identities) {
    if (!identities || identities.length === 0) return '';
    for (const id of identities) assertSafeIdentity(id);
    return identities.map((i) => `${i.protocol}:${i.identifier}`).sort().join(',');
}

function buildCanonicalMessage({ address, identities = [], extensions = {}, nonce, issued_at }) {
    if (!/^[0-9a-f]{32}$/.test(nonce)) throw new Error(`bad nonce: ${nonce}`);
    const core = [
        'orangecheck',
        `identities: ${formatIdentities(identities)}`,
        `address: ${address}`,
        'purpose: portable reputation attestation (non-custodial)',
        `nonce: ${nonce}`,
        `issued_at: ${issued_at}`,
        'ack: I attest control of this address and bind it to my identities.',
    ];
    const extLines = Object.keys(extensions)
        .filter((k) => extensions[k] != null && extensions[k] !== '')
        .sort()
        .map((k) => `${k}: ${extensions[k]}`);
    return [...core, ...extLines].join('\n') + '\n';
}

function attestationId(message) {
    return createHash('sha256').update(message, 'utf8').digest('hex');
}

// score_v0 = round( ln(1 + sats_bonded) * (1 + days_unspent / 30), 2 )
function scoreV0(sats, days) {
    const raw = Math.log(1 + sats) * (1 + days / 30);
    return Math.round(raw * 100) / 100;
}

// ─── Vector definitions ────────────────────────────────────────────────────

const NONCE = '0011223344556677889900aabbccddee';
const T = '2026-04-22T12:00:00Z';
const ADDR_WPKH = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const ADDR_P2PKH = '1BitcoinEaterAddressDontSendf59kuE';

// Helper to wrap a canonical_message vector with its derived expected message.
function cm(id, description, input) {
    const message = buildCanonicalMessage(input);
    return {
        id,
        category: 'canonical_message',
        description,
        input,
        expected: { message },
    };
}

function idv(id, description, input) {
    return {
        id,
        category: 'identities_format',
        description,
        input,
        expected: { formatted: formatIdentities(input.identities) },
    };
}

function aid(id, description, message) {
    return {
        id,
        category: 'attestation_id',
        description,
        input: { message },
        expected: { attestation_id: attestationId(message) },
    };
}

function svo(id, description, input) {
    return {
        id,
        category: 'score_v0',
        description,
        input,
        expected: { score_v0: scoreV0(input.sats_bonded, input.days_unspent) },
    };
}

function rej(id, description, input, reasonContains) {
    return {
        id,
        category: 'reject',
        description,
        input,
        expected: { rejects: true, reason_contains: reasonContains },
    };
}

// ─── Build the canonical messages we'll also hash for attestation-id tests ─

const msg01 = buildCanonicalMessage({
    address: ADDR_WPKH,
    identities: [],
    nonce: NONCE,
    issued_at: T,
});

const msg02 = buildCanonicalMessage({
    address: ADDR_WPKH,
    identities: [{ protocol: 'github', identifier: 'alice' }],
    nonce: NONCE,
    issued_at: T,
});

const msg03 = buildCanonicalMessage({
    address: ADDR_WPKH,
    identities: [
        { protocol: 'twitter', identifier: '@alice' },
        { protocol: 'github', identifier: 'alice' },
        { protocol: 'nostr', identifier: 'npub1alice' },
    ],
    extensions: { bond: '100000', aud: 'https://example.com' },
    nonce: NONCE,
    issued_at: T,
});

const msg04 = buildCanonicalMessage({
    address: ADDR_P2PKH,
    identities: [{ protocol: 'dns', identifier: 'alice.com' }],
    extensions: { expires: '2030-01-01T00:00:00Z', network: 'mainnet' },
    nonce: NONCE,
    issued_at: T,
});

// ─── Vector set ────────────────────────────────────────────────────────────

const vectors = [
    // Canonical-message format
    cm('tv01', 'bare segwit address, no identities, no extensions', {
        address: ADDR_WPKH, identities: [], nonce: NONCE, issued_at: T,
    }),
    cm('tv02', 'one github identity', {
        address: ADDR_WPKH,
        identities: [{ protocol: 'github', identifier: 'alice' }],
        nonce: NONCE, issued_at: T,
    }),
    cm('tv03', 'three identities (out of order on input, sorted on output) + two extensions', {
        address: ADDR_WPKH,
        identities: [
            { protocol: 'twitter', identifier: '@alice' },
            { protocol: 'github', identifier: 'alice' },
            { protocol: 'nostr', identifier: 'npub1alice' },
        ],
        extensions: { bond: '100000', aud: 'https://example.com' },
        nonce: NONCE, issued_at: T,
    }),
    cm('tv04', 'legacy P2PKH address, dns identity, expiry + network extensions', {
        address: ADDR_P2PKH,
        identities: [{ protocol: 'dns', identifier: 'alice.com' }],
        extensions: { expires: '2030-01-01T00:00:00Z', network: 'mainnet' },
        nonce: NONCE, issued_at: T,
    }),

    // Identities format
    idv('tv05', 'single identity', {
        identities: [{ protocol: 'github', identifier: 'alice' }],
    }),
    idv('tv06', 'multiple identities sort lexicographically by full protocol:id', {
        identities: [
            { protocol: 'nostr', identifier: 'npub1zzz' },
            { protocol: 'github', identifier: 'zoe' },
            { protocol: 'github', identifier: 'alice' },
            { protocol: 'dns', identifier: 'example.com' },
        ],
    }),
    idv('tv07', 'empty identity list produces empty string', {
        identities: [],
    }),

    // Attestation ID derivation — deterministic
    aid('tv08', 'attestation_id = sha256(message) for tv01', msg01),
    aid('tv09', 'attestation_id = sha256(message) for tv03 (with extensions)', msg03),

    // score_v0 (SPEC §8.3)
    svo('tv10', 'zero bond, zero days', { sats_bonded: 0, days_unspent: 0 }),
    svo('tv11', '100k sats, 30 days', { sats_bonded: 100_000, days_unspent: 30 }),
    svo('tv12', '1M sats, 365 days', { sats_bonded: 1_000_000, days_unspent: 365 }),
    svo('tv13', '100M sats, 90 days (surplus stake, short hold)', {
        sats_bonded: 100_000_000, days_unspent: 90,
    }),

    // Extension canonicalization — sort order + bond semantics
    cm('tv14', 'extension keys sort lexicographically', {
        address: ADDR_WPKH, identities: [],
        extensions: { zoo: 'z', aardvark: 'a', marmot: 'm' },
        nonce: NONCE, issued_at: T,
    }),
    cm('tv15', 'empty-string extension values are omitted', {
        address: ADDR_WPKH, identities: [],
        extensions: { aud: 'https://example.com', ignored: '', bond: '500' },
        nonce: NONCE, issued_at: T,
    }),
    cm('tv16', 'bond is emitted as an integer string, not scientific notation', {
        address: ADDR_WPKH, identities: [],
        extensions: { bond: '100000000' }, // 1 BTC
        nonce: NONCE, issued_at: T,
    }),

    // Rejection cases — inputs a conforming implementation MUST refuse.
    rej('tv17', 'identity identifier containing newline (line-smuggling defense)',
        { identities: [{ protocol: 'github', identifier: 'alice\nevil' }] },
        'newline'),
    rej('tv18', 'identity identifier containing carriage return',
        { identities: [{ protocol: 'github', identifier: 'alice\rmallory' }] },
        'newline'),
    rej('tv19', 'identity identifier containing comma (would forge a second binding)',
        { identities: [{ protocol: 'github', identifier: 'alice,github:mallory' }] },
        'comma'),
    rej('tv20', 'invalid protocol shape (uppercase, punctuation)',
        { identities: [{ protocol: 'GitHub!', identifier: 'alice' }] },
        'protocol'),
];

// ─── Write out ────────────────────────────────────────────────────────────

let count = 0;
for (const v of vectors) {
    const path = join(OUT_DIR, `${v.id}.json`);
    writeFileSync(path, JSON.stringify(v, null, 2) + '\n', 'utf8');
    count++;
}

// Index for fast loading
const index = vectors.map((v) => ({ id: v.id, category: v.category, description: v.description }));
writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8');

console.log(`Wrote ${count} vectors → ${OUT_DIR}`);

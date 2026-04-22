#!/usr/bin/env node
/**
 * Signature vector generator (v0.2 conformance set).
 *
 *   node conformance/generate-signatures.mjs
 *
 * Produces real BIP-322 signature vectors using disclosed test private
 * keys and documents them with the address + message + signature + scheme
 * tuple every implementation can verify against.
 *
 * IMPORTANT — these private keys are **published, disclosed, and never
 * to be used for real funds**. They exist only so that any implementation
 * can reproduce / verify the conformance set deterministically. Anyone
 * with network access can spend anything sent to these addresses.
 *
 * The vectors themselves only include `signature` + the public inputs;
 * they do NOT include private keys. Regeneration requires running this
 * script, which has the keys hard-coded.
 *
 * Dependencies: resolved from the adjacent oc-packages/sdk/node_modules
 * at generation time — this script is not meant to be `npm install`-able
 * standalone; regenerate after bumping bip322-js / bitcoinjs-lib.
 */

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve dependencies from a local SDK checkout so we don't need another
// `npm install` under conformance/. Set OC_SDK_NODE_MODULES when the
// checkout is not at the default path below.
const SDK_NODE_MODULES =
    process.env.OC_SDK_NODE_MODULES ??
    '/Users/wilneeley/Projects/oc-web/packages/sdk/node_modules';
const require = createRequire(join(SDK_NODE_MODULES, '_.js'));
const bip322 = require('bip322-js');
const bitcoin = require('bitcoinjs-lib');
const ecc = require('@bitcoinerlab/secp256k1');
bitcoin.initEccLib(ecc);

const { ECPairFactory } = require('ecpair');
const ECPair = ECPairFactory(ecc);

const OUT_DIR = join(__dirname, 'vectors');
mkdirSync(OUT_DIR, { recursive: true });

// ─── Disclosed test private keys ──────────────────────────────────────────
//
// These are BURN KEYS. Published here so anyone can reproduce the signature
// vectors. Never send real bitcoin to the addresses derived from them.

const KEYS = {
    // Deterministic: sha256("orangecheck-conformance-v0-key-1") truncated.
    wpkhHex: '0101010101010101010101010101010101010101010101010101010101010101',
    // Deterministic: sha256("orangecheck-conformance-v0-key-2") truncated.
    trHex: '0202020202020202020202020202020202020202020202020202020202020202',
};

function wifFromHex(hex, network) {
    return ECPair.fromPrivateKey(Buffer.from(hex, 'hex'), { network }).toWIF();
}

function p2wpkhAddress(privHex, network) {
    const keyPair = ECPair.fromPrivateKey(Buffer.from(privHex, 'hex'), { network });
    const { address } = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(keyPair.publicKey),
        network,
    });
    return address;
}

function p2trAddress(privHex, network) {
    const keyPair = ECPair.fromPrivateKey(Buffer.from(privHex, 'hex'), { network });
    // BIP-341: taproot internal key is the x-only pubkey (32 bytes, drop the
    // first parity byte of the 33-byte compressed pubkey).
    const internalPubkey = Buffer.from(keyPair.publicKey).subarray(1, 33);
    const { address } = bitcoin.payments.p2tr({ internalPubkey, network });
    return address;
}

// ─── Canonical message builder (reference, matches generate.mjs) ──────────

function buildCanonicalMessage({ address, identities = [], extensions = {}, nonce, issued_at }) {
    const identitiesStr = identities
        .map((i) => `${i.protocol}:${i.identifier}`)
        .sort()
        .join(',');

    const core = [
        'orangecheck',
        `identities: ${identitiesStr}`,
        `address: ${address}`,
        'purpose: portable reputation attestation (non-custodial)',
        `nonce: ${nonce}`,
        `issued_at: ${issued_at}`,
        'ack: I attest control of this address and bind it to my identities.',
    ];
    const ext = Object.keys(extensions)
        .filter((k) => extensions[k] != null && extensions[k] !== '')
        .sort()
        .map((k) => `${k}: ${extensions[k]}`);
    return [...core, ...ext].join('\n') + '\n';
}

// ─── Sign + emit vector ───────────────────────────────────────────────────

const NONCE = '0011223344556677889900aabbccddee';
const T = '2026-04-22T12:00:00Z';
const network = bitcoin.networks.bitcoin;

function sigVector(id, description, privHex, address) {
    const message = buildCanonicalMessage({
        address,
        identities: [{ protocol: 'github', identifier: 'conformance' }],
        nonce: NONCE,
        issued_at: T,
    });

    const wif = wifFromHex(privHex, network);
    const signature = bip322.Signer.sign(wif, address, message);

    // Sanity-check: Verifier must accept what Signer just produced.
    const ok = bip322.Verifier.verifySignature(address, message, signature);
    if (!ok) throw new Error(`${id}: self-verify failed — signer/verifier disagree`);

    return {
        id,
        category: 'bip322_signature',
        description,
        input: { address, message, signature, scheme: 'bip322' },
        expected: { valid: true },
    };
}

const vectors = [
    sigVector(
        'tv21',
        'P2WPKH (segwit v0) BIP-322 signature — disclosed burn key #1',
        KEYS.wpkhHex,
        p2wpkhAddress(KEYS.wpkhHex, network)
    ),
    sigVector(
        'tv22',
        'P2TR (taproot) BIP-322 signature — disclosed burn key #2',
        KEYS.trHex,
        p2trAddress(KEYS.trHex, network)
    ),
];

// ─── Negative vector: right message, tampered signature byte ──────────────

{
    const baseline = vectors[0];
    const sig = baseline.input.signature;
    // Flip one byte in the middle (keeps base64 length + shape valid).
    const buf = Buffer.from(sig, 'base64');
    buf[Math.floor(buf.length / 2)] ^= 0x01;
    const tampered = buf.toString('base64');
    vectors.push({
        id: 'tv23',
        category: 'bip322_signature',
        description:
            'tampered signature (1 byte flipped) on an otherwise-valid tv21 payload — MUST NOT verify',
        input: {
            address: baseline.input.address,
            message: baseline.input.message,
            signature: tampered,
            scheme: 'bip322',
        },
        expected: { valid: false },
    });
}

// ─── Write out + update index ─────────────────────────────────────────────

for (const v of vectors) {
    writeFileSync(join(OUT_DIR, `${v.id}.json`), JSON.stringify(v, null, 2) + '\n', 'utf8');
}

// Rebuild the full index so new vectors appear in it.
import { readdirSync, readFileSync } from 'node:fs';
const all = readdirSync(OUT_DIR)
    .filter((f) => f.startsWith('tv') && f.endsWith('.json'))
    .sort()
    .map((f) => {
        const v = JSON.parse(readFileSync(join(OUT_DIR, f), 'utf8'));
        return { id: v.id, category: v.category, description: v.description };
    });
writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify(all, null, 2) + '\n', 'utf8');

console.log(`Wrote ${vectors.length} signature vectors → ${OUT_DIR}`);
for (const v of vectors) console.log(`  ${v.id}: ${v.description}`);

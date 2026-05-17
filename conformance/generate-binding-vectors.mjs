#!/usr/bin/env node
/**
 * Binding Attestation conformance vector generator (OC Attest v1).
 *
 *   node conformance/generate-binding-vectors.mjs
 *
 * Produces the `bv*` vector set: real BIP-322 + Nostr (NIP-01 schnorr)
 * mutual signatures over canonical binding messages, using DISCLOSED BURN
 * KEYS published in this file. The keys are never to be used for real
 * funds or a real Nostr identity — they exist only so the vector set stays
 * deterministically reproducible.
 *
 * Dependencies are resolved from an adjacent oc-attest-web checkout
 * (bip322-js, bitcoinjs-lib, @bitcoinerlab/secp256k1, ecpair,
 * @noble/curves, bech32). Set OC_ATTEST_WEB_NODE_MODULES when the checkout
 * is not at the default path below.
 */
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const NM =
    process.env.OC_ATTEST_WEB_NODE_MODULES ??
    '/Users/wilneeley/Projects/ochk/oc-attest-web/node_modules';
const require = createRequire(join(NM, '_.js'));
const bip322 = require('bip322-js');
const bitcoin = require('bitcoinjs-lib');
const ecc = require('@bitcoinerlab/secp256k1');
bitcoin.initEccLib(ecc);
const { ECPairFactory } = require('ecpair');
const ECPair = ECPairFactory(ecc);
const { schnorr } = require('@noble/curves/secp256k1');
const bech32 = require('bech32');

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'vectors');
mkdirSync(OUT, { recursive: true });
const net = bitcoin.networks.bitcoin;

// ── Disclosed BURN KEYS (never fund) ───────────────────────────────────────
// BTC burn key: sha256-derived constant, also used by v0 conformance set style.
const BTC_PRIV = '0303030303030303030303030303030303030303030303030303030303030303';
// Nostr burn key.
const NOSTR_PRIV = '0404040404040404040404040404040404040404040404040404040404040404';

const btcKey = ECPair.fromPrivateKey(Buffer.from(BTC_PRIV, 'hex'), { network: net });
const BTC_ADDR = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(btcKey.publicKey), network: net }).address;
const BTC_WIF = btcKey.toWIF();

const nostrPrivBytes = Buffer.from(NOSTR_PRIV, 'hex');
const nostrXOnly = Buffer.from(schnorr.getPublicKey(nostrPrivBytes)); // 32-byte x-only
const NOSTR_HEX = nostrXOnly.toString('hex');
function hexToNpub(hex) {
  const words = bech32.toWords(Buffer.from(hex, 'hex'));
  return bech32.encode('npub', words);
}
const NPUB = hexToNpub(NOSTR_HEX);

// ── Canonical message builder (reference implementation) ───────────────────
const HEADER = 'orangecheck-binding';
const ACK = 'I attest the keys named in this message are one principal.';
const SAFE = /^[\x20-\x7E]+$/; // printable ASCII, no CR/LF/control

function buildBindingMessage({ principal, btc, nostr, nonce, issued_at, extensions = {} }) {
  for (const [k, v] of Object.entries({ principal, btc, nostr, nonce, issued_at })) {
    if (!SAFE.test(v)) throw new Error(`line-smuggling: field ${k} contains an unsafe character`);
  }
  const core = [
    HEADER,
    'v: 1',
    `principal: ${principal}`,
    `btc: ${btc}`,
    `nostr: ${nostr}`,
    `nonce: ${nonce}`,
    `issued_at: ${issued_at}`,
    `ack: ${ACK}`,
  ];
  const ext = Object.keys(extensions)
    .filter((k) => extensions[k] != null && extensions[k] !== '')
    .sort()
    .map((k) => {
      if (!/^[a-z]+$/.test(k)) throw new Error(`bad ext key: ${k}`);
      if (!SAFE.test(String(extensions[k]))) throw new Error(`line-smuggling: ext ${k}`);
      return `${k}: ${extensions[k]}`;
    });
  return [...core, ...ext].join('\n') + '\n';
}
function bindingId(msg) {
  return createHash('sha256').update(Buffer.from(msg, 'utf8')).digest('hex');
}

// ── Nostr event helpers (NIP-01) ───────────────────────────────────────────
function nostrEventId(ev) {
  const serial = JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]);
  return createHash('sha256').update(Buffer.from(serial, 'utf8')).digest('hex');
}
function buildNostrEvent({ message, btc_signature, binding_id, btc, nostr_hex, created_at }) {
  const ev = {
    pubkey: nostr_hex,
    created_at,
    kind: 30079,
    tags: [
      ['d', `oc-attest-binding:${binding_id}`],
      ['btc', btc],
      ['oc', 'binding-attestation'],
      ['v', '1'],
    ],
    content: JSON.stringify({ message, btc_signature }),
  };
  ev.id = nostrEventId(ev);
  ev.sig = Buffer.from(schnorr.sign(ev.id, nostrPrivBytes)).toString('hex');
  return ev;
}

// ── Common inputs ──────────────────────────────────────────────────────────
const PRINCIPAL = 'did:oc:9f86d081884c7d659a2feaa0c55ad015';
const NONCE = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const ISSUED = '2026-05-16T12:00:00Z';
const CREATED_AT = 1779278400; // 2026-05-16T12:00:00Z

function w(v) { writeFileSync(join(OUT, `${v.id}.json`), JSON.stringify(v, null, 2) + '\n', 'utf8'); }

const vectors = [];

// bv01 — canonical message construction
{
  const message = buildBindingMessage({ principal: PRINCIPAL, btc: BTC_ADDR, nostr: NPUB, nonce: NONCE, issued_at: ISSUED });
  vectors.push({
    id: 'bv01', category: 'canonical_message',
    description: 'binding canonical message — fixed 8-line core, no extensions',
    input: { principal: PRINCIPAL, btc: BTC_ADDR, nostr: NPUB, nonce: NONCE, issued_at: ISSUED },
    expected: { message },
  });
}

// bv02 — binding_id derivation
{
  const message = buildBindingMessage({ principal: PRINCIPAL, btc: BTC_ADDR, nostr: NPUB, nonce: NONCE, issued_at: ISSUED });
  vectors.push({
    id: 'bv02', category: 'binding_id',
    description: 'binding_id = sha256(canonical_message_bytes) for bv01',
    input: { message },
    expected: { binding_id: bindingId(message) },
  });
}

// bv03 — full mutual-signature verification PASS
{
  const message = buildBindingMessage({ principal: PRINCIPAL, btc: BTC_ADDR, nostr: NPUB, nonce: NONCE, issued_at: ISSUED });
  const id = bindingId(message);
  const btc_signature = bip322.Signer.sign(BTC_WIF, BTC_ADDR, message);
  if (!bip322.Verifier.verifySignature(BTC_ADDR, message, btc_signature))
    throw new Error('bv03 self-verify (BIP-322) failed');
  const ev = buildNostrEvent({ message, btc_signature, binding_id: id, btc: BTC_ADDR, nostr_hex: NOSTR_HEX, created_at: CREATED_AT });
  if (!schnorr.verify(Buffer.from(ev.sig, 'hex'), ev.id, nostrXOnly))
    throw new Error('bv03 self-verify (Nostr schnorr) failed');
  vectors.push({
    id: 'bv03', category: 'binding_verify',
    description: 'valid mutual-signature binding — BIP-322 + Nostr both verify, both cover same message',
    input: {
      envelope: {
        binding_id: id, v: 1, principal: PRINCIPAL, btc: BTC_ADDR, nostr: NPUB,
        message, message_b64url: Buffer.from(message, 'utf8').toString('base64url'),
        btc_signature, btc_scheme: 'bip322',
        nostr_event: { id: ev.id, pubkey: ev.pubkey, kind: ev.kind, created_at: ev.created_at, tags: ev.tags, content: ev.content, sig: ev.sig },
        issued_at: ISSUED,
      },
    },
    expected: { valid: true, status: 'binding_ok', binding_id: id },
  });
}

// bv04 — BIP-322 signature fails (tampered btc_signature)
{
  const base = vectors.find((v) => v.id === 'bv03');
  const env = JSON.parse(JSON.stringify(base.input.envelope));
  const buf = Buffer.from(env.btc_signature, 'base64');
  buf[Math.floor(buf.length / 2)] ^= 0x01;
  env.btc_signature = buf.toString('base64');
  vectors.push({
    id: 'bv04', category: 'binding_verify',
    description: 'tampered BIP-322 signature — Nostr side still valid; binding MUST be rejected',
    input: { envelope: env },
    expected: { valid: false, status: 'btc_sig_invalid' },
  });
}

// bv05 — Nostr signature fails (tampered nostr_event.sig)
{
  const base = vectors.find((v) => v.id === 'bv03');
  const env = JSON.parse(JSON.stringify(base.input.envelope));
  const sb = Buffer.from(env.nostr_event.sig, 'hex');
  sb[Math.floor(sb.length / 2)] ^= 0x01;
  env.nostr_event.sig = sb.toString('hex');
  vectors.push({
    id: 'bv05', category: 'binding_verify',
    description: 'tampered Nostr event signature — BIP-322 side still valid; binding MUST be rejected',
    input: { envelope: env },
    expected: { valid: false, status: 'nostr_sig_invalid' },
  });
}

// bv06 — line-smuggling: newline in principal field
{
  vectors.push({
    id: 'bv06', category: 'reject',
    description: 'principal field carries an embedded LF — MUST be rejected (line-smuggling defense)',
    input: { principal: 'did:oc:9f86d081884c7d659a2feaa0c55ad015\nbtc: bc1qattacker', btc: BTC_ADDR, nostr: NPUB, nonce: NONCE, issued_at: ISSUED },
    expected: { rejects: true, reason_contains: 'unsafe character' },
  });
}

// bv07 — header-literal collision: v0 attestation message presented as a binding
{
  const v0msg = 'orangecheck\nidentities: \naddress: ' + BTC_ADDR +
    '\npurpose: portable reputation attestation (non-custodial)\nnonce: ' + NONCE +
    '\nissued_at: ' + ISSUED + '\nack: I attest control of this address and bind it to my identities.\n';
  vectors.push({
    id: 'bv07', category: 'reject',
    description: 'v0 attestation message (header literal "orangecheck") submitted to the binding verifier — MUST be rejected, headers never cross-verify',
    input: { message: v0msg },
    expected: { rejects: true, reason_contains: 'header' },
  });
}

// bv08 — message/event mismatch: Nostr event content covers a different message
{
  const base = vectors.find((v) => v.id === 'bv03');
  const env = JSON.parse(JSON.stringify(base.input.envelope));
  // Re-sign a Nostr event over a DIFFERENT (different-nonce) message; BIP-322 still over the envelope message.
  const otherMsg = buildBindingMessage({ principal: PRINCIPAL, btc: BTC_ADDR, nostr: NPUB, nonce: 'ffffffffffffffffffffffffffffffff', issued_at: ISSUED });
  const ev2 = buildNostrEvent({ message: otherMsg, btc_signature: env.btc_signature, binding_id: bindingId(otherMsg), btc: BTC_ADDR, nostr_hex: NOSTR_HEX, created_at: CREATED_AT });
  env.nostr_event = { id: ev2.id, pubkey: ev2.pubkey, kind: ev2.kind, created_at: ev2.created_at, tags: ev2.tags, content: ev2.content, sig: ev2.sig };
  vectors.push({
    id: 'bv08', category: 'binding_verify',
    description: 'Nostr event signs a different canonical message than btc_signature covers — MUST be rejected (single-message rule)',
    input: { envelope: env },
    expected: { valid: false, status: 'message_mismatch' },
  });
}

for (const v of vectors) w(v);
const idx = readdirSync(OUT).filter((f) => f.startsWith('bv') && f.endsWith('.json')).sort()
  .map((f) => { const v = JSON.parse(readFileSync(join(OUT, f), 'utf8')); return { id: v.id, category: v.category, description: v.description }; });
writeFileSync(join(OUT, 'binding-index.json'), JSON.stringify(idx, null, 2) + '\n', 'utf8');

// ── Round-trip check: bv02's binding_id recomputes ─────────────────────────
{
  const v = JSON.parse(readFileSync(join(OUT, 'bv02.json'), 'utf8'));
  const rt = bindingId(v.input.message);
  if (rt !== v.expected.binding_id) throw new Error('ROUND-TRIP FAIL bv02');
  console.log('round-trip bv02 binding_id OK:', rt);
}
console.log('BTC_ADDR  =', BTC_ADDR);
console.log('NPUB      =', NPUB);
console.log('NOSTR_HEX =', NOSTR_HEX);
console.log('wrote', vectors.length, 'vectors ->', OUT);

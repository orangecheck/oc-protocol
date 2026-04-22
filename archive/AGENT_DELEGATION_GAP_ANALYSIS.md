# OCP as Agent Identity & Delegation Layer: Technical Gap Analysis

**Date:** 2026-03-02
**Status:** Research / Draft Proposal
**Scope:** Evaluate whether OrangeCheck Protocol (OCP v0) can be refactored into the
foundational identity and delegation credential layer for multi-agent AI systems, and
specify the minimal changes required.

---

## 1. What OCP Actually Does (Structural Inventory)

### 1.1 Core Mechanics

OCP is a **Bitcoin reputation attestation protocol** with five distinct structural primitives:

| Primitive | Mechanism | Protocol Location |
|---|---|---|
| **Identity claim** | BIP-322 Schnorr/ECDSA signature over canonical UTF-8 message | SPEC.md §4 |
| **Content-addressed ID** | `attestation_id = SHA-256(canonical_message)` (64 hex chars) | SPEC.md §3 |
| **Economic bond** | Live UTXO state at signing address; no custody transfer | SPEC.md §5 |
| **Decentralized registry** | Nostr kind 30078 (parameterized replaceable event, NIP-78) | SPEC.md §6 |
| **Implicit revocation** | Spending UTXOs drops `sats_bonded = 0`; explicit rotation via fresh address | PROTOCOL.md §5 |

### 1.2 Canonical Message Format

```
orangecheck
identities: <comma-sep protocol:identifier, lexicographically sorted>
address: <P2WPKH | P2TR | P2PKH bitcoin address>
purpose: portable reputation attestation (non-custodial)
nonce: <32 lowercase hex>
issued_at: <ISO8601 UTC Z>
ack: I attest control of this address and bind it to my identities.
[optional extensions: sorted lexicographically]
```

Signed extensions include: `aud`, `bond`, `expires`, `network`, `publish`, `relay_hints`,
`scope`, `scoring`.

### 1.3 Wire Formats

- **JSON Envelope** (SPEC.md §5.3): Self-contained blob with message, signature, scheme, identities
- **Nostr Event** (kind 30078): Tags include `d` (attestation_id), `addr`, `sats`, `days`, `score`,
  `v` (verification URL), `i` (identity bindings), `expires`
- **Verify URL**: `/verify?addr=&msg=<base64url>&sig=&scheme=` or `/verify/<attestation_id>`

### 1.4 What the Protocol Already Has That Maps to Agent Needs

| OCP Feature | Agent Trust Analog |
|---|---|
| `attestation_id = SHA-256(msg)` | Deterministic, collision-resistant agent credential ID |
| secp256k1 signing (BIP-322) | Same curve used in Nostr/Bitcoin agent keypairs |
| `identities:` multi-protocol binding | Bind agent to `nostr:npub1...`, `did:method:id`, custom `agent:id` |
| `expires:` extension | Credential time-bounding |
| `aud:` extension | Task/orchestrator binding (partial) |
| `bond:` extension | Budget commitment (semantic mismatch — see §3) |
| Nostr publishing (kind 30078) | Decentralized, permissionless agent registry |
| Implicit UTXO revocation | Economic invalidation |
| `relay_hints:` extension | Agent registry routing hints |

---

## 2. Target Schema: What an Agent Delegation Credential Needs

A complete agent delegation credential for multi-agent AI systems requires:

```typescript
interface AgentDelegationCredential {
  // Identity chain
  delegation_id: string;         // SHA-256(canonical_delegation_message)
  issuer_agent_id: string;       // parent's delegation_id | "root"
  subject_agent_id: string;      // child agent's public identity
  human_principal: string;       // root human: nostr:npub1... | did:... | btc:<address>

  // Authorization scope
  capabilities: string[];        // ["tool:web_search", "tool:code_exec", "memory:read"]
  task_scope: string;            // bounded task description (≤256 bytes)

  // Chain constraints
  max_delegation_depth: number;  // remaining depth available to re-delegate
  current_depth: number;         // how deep in the chain this credential sits

  // Economic accountability
  budget_sats: number | "unlimited"; // max sats child may spend/authorize

  // Lifecycle
  issued_at: string;             // ISO8601 UTC
  expires: string;               // ISO8601 UTC
  nonce: string;                 // 32 hex; replay prevention

  // Proof
  signature: string;             // issuer's BIP-322 or Nostr signature
  scheme: "bip322" | "nostr";    // signing scheme used
  issuer_address?: string;       // Bitcoin address if scheme=bip322
}
```

---

## 3. Gap Analysis: OCP v0 vs. Target Schema

### 3.1 Direct Gaps (Missing Entirely)

#### GAP-1: No Parent/Child Delegation Chain
**Severity: Critical**

OCP has zero concept of a delegation chain. Every attestation is a flat,
standalone claim. There is no `parent_id`, `issuer_id`, or chain-of-trust path. For multi-agent
systems, you need to prove: `human → agent0 → agent1 → agent2` where each link in the chain
carries a verifiable proof of authorization from the level above.

The `identities:` field could *hold* a parent's npub or DID, but there is no normative
semantics for this, no chain verification algorithm, and no depth counter.

**Required addition:** New `issuer` and `subject` fields with chain verification rules.

#### GAP-2: No Capability Vocabulary
**Severity: Critical**

The `scope:` extension is a free-form human-readable string (display-only, informational).
There is no structured, machine-parseable capability set with permission lattice semantics.
For a framework like LangGraph or AutoGen to enforce "agent A can call tool X but not Y",
you need a typed capability list with namespaced strings (e.g., `tool:web_search`,
`memory:read`, `file:write:/tmp/**`).

**Required addition:** New `capabilities:` field with registered namespace format.

#### GAP-3: No Delegation Depth Counter
**Severity: High**

No mechanism prevents unbounded re-delegation chains (`A → B → C → D → ... → ∞`).
UCAN-style delegation requires a `max_depth` counter that decrements with each delegation
and stops re-delegation when it reaches zero.

**Required addition:** `max_depth` field (integer, MUST be ≥ 0; MAY delegate only if > 0,
child's max_depth MUST be < parent's).

#### GAP-4: No Explicit Human Principal Field
**Severity: High**

The `identities:` field can include a human's identity, but there is no semantic distinction
between "this attestation *belongs to* agent X" and "this attestation was *authorized by*
human H on behalf of agent X." In delegation chains, the human principal at the root of
trust must be explicitly and separately recorded — it is NOT the subject of the attestation.

**Required addition:** `human_principal:` field that carries forward through the chain
unchanged, always referring to the root human who initiated the delegation.

#### GAP-5: No Proof Reference (Chain Links Not Verifiable)
**Severity: High**

Even if you add `issuer` and `subject` fields, there is no mechanism to prove the issuer
*had authority to delegate* at the depth they claimed. UCAN solves this with `prf`
(proof CIDs). Without proof references, an adversarial agent could claim to have been
delegated by anyone.

**Required addition:** `proof:` field — content-addressed reference to the parent
delegation credential (its `delegation_id`), enabling chain traversal and verification.

#### GAP-6: Budget Semantics Are Wrong
**Severity: Medium**

The `bond:` extension means "I am staking exactly X sats to signal skin in the game."
The agent delegation need is "I am *authorized to spend up to* X sats on behalf of my
principal." These have opposite trust directions:
- `bond:` = self-declared commitment (Subject declares their stake)
- `budget_sats:` = externally-granted authorization (Issuer grants spending authority to Subject)

The wire format (integer sats) maps cleanly, but the semantics require a new field with
a different name and direction-of-authority.

**Required addition:** New `budget_sats:` extension with issuer-grants-to-subject semantics,
distinct from `bond:` which remains Subject-self-declared.

### 3.2 Partial Matches (Present But Mismatched)

#### PARTIAL-1: `expires:` Extension ✅ (Good Fit)

`expires:` maps directly to credential expiry. No changes needed; inherit as-is.
Agents SHOULD set short expiry windows (hours to days) vs human reputations (years).

#### PARTIAL-2: `aud:` Extension ⚠️ (Limited Fit)

`aud:` binds an attestation to a single URL origin. For agent orchestration, you need to
bind to a specific orchestrator agent ID or task ID — not a URL origin. The semantics
generalize, but the field format (URL string) is too restrictive for agent use cases.

**Proposed reuse with extension:** Allow `aud:` to accept `agent:<delegation_id>` URNs
in addition to URL origins, or introduce a new `orchestrator:` field.

#### PARTIAL-3: `identities:` Field ⚠️ (Partial Fit)

The `did:method:identifier` protocol entry in identities can bind agent DIDs.
The custom protocol path is open: `agent:sha256hex` is valid per the ABNF (lowercase alphanumeric
protocol, printable identifier). However, this conflates the agent's *own* identity with
the identities they are *authorized on behalf of*. The `identities:` field in OCP means
"I claim to be these things." In delegation, the subject field means "the bearer of this
credential is this agent."

**Proposed reuse:** Register `agent:` as an official identity protocol (no schema change,
just registry update), and use it as the subject identity in delegation credentials.

#### PARTIAL-4: `nonce:` Field ✅ (Direct Reuse)

32 lowercase hex nonce for replay prevention maps cleanly. No change needed.

#### PARTIAL-5: Nostr Kind 30078 ⚠️ (Wrong Kind for Delegation)

Kind 30078 parameterized replaceable events work for *reputation* because the same address
can issue a newer attestation replacing the old one. For *delegation credentials*, the
semantics differ: each delegation is a discrete, immutable grant (you don't "replace" a
prior authorization, you issue a new one with a new ID). Using 30078 would allow overwriting
existing delegation grants, which is a security concern (issuer could silently revoke without
explicit revocation event).

**Required addition:** New Nostr event kind for agent delegation (see §5).

### 3.3 Infrastructure Gaps

#### GAP-7: No Revocation Event
**Severity: High**

OCP's revocation is implicit (spend UTXOs) or via replacement (same address issues new
attestation). Neither pattern works well for agent delegation:
1. Spending UTXOs terminates ALL attestations at that address — too coarse.
2. Replacement events still don't provide a timestamped audit trail of "credential X was
   explicitly revoked at time T by entity Y."

**Required addition:** A dedicated revocation event (Nostr ephemeral or kind 5 deletion +
new revocation kind) with `delegation_id`, `revoked_at`, and issuer signature.

#### GAP-8: No Structured Verification Query Paths for Delegation Chains
**Severity: Medium**

Current Nostr query patterns target: attestation_id, Bitcoin address, Nostr identity, sats threshold.
For agent systems, you need: "give me all valid delegations whose `human_principal` is this npub"
or "give me all delegations issued by agent X that haven't expired." New tags and query patterns
are required.

---

## 4. What Maps Well (Infrastructure to Reuse)

The following OCP primitives are **directly reusable** without modification:

| Mechanism | Why It Works for Agents |
|---|---|
| `secp256k1` / BIP-322 signing | Agents naturally hold secp256k1 keypairs; Nostr npubs are secp256k1 by construction |
| `SHA-256(message)` content-addressed IDs | Self-describing, deterministic credential IDs with no registry dependency |
| Canonical UTF-8 message format (LF, sorted extensions) | Simple, human-readable, auditable; no binary parsing required |
| Nostr event publishing infrastructure | Permissionless, decentralized, censorship-resistant agent registry |
| `expires:` extension | Direct reuse; agents need short-lived credentials |
| `relay_hints:` extension | Agents can advertise where their delegation registry lives |
| `aud:` extension | Reuse for orchestrator binding with extended URL/URN semantics |
| BIP-322 offline verifiability | Orchestrators can verify agent credentials without central server |

The **signing infrastructure** is the most important reuse. Frameworks like LangGraph and
AutoGen operate in Python/TypeScript environments where secp256k1 libraries (`noble/secp256k1`,
`coincurve`) are available. Agents can hold Bitcoin/Nostr keypairs as their primary identity
anchor with zero new infrastructure.

---

## 5. Competing & Adjacent Standards: Where They Fall Short

### 5.1 MCP (Model Context Protocol — Anthropic, 2024)

**What it is:** JSON-RPC protocol for AI assistants to invoke tools/resources via a
client-server model. Defines `tools`, `resources`, `prompts`, and `sampling` interfaces.

**What it lacks:**
- Zero notion of agent identity credentials or delegation chains
- Tools are defined at server level, not per-agent credentials
- No principal hierarchy (no `human_principal` concept)
- No economic accountability layer
- Authentication is left entirely to implementors (OAuth, API keys, etc.)

**Verdict:** MCP is a **transport/invocation protocol**, not an identity/trust layer.
OCP/OCD sits *underneath* MCP as the identity layer — when agent A invokes a tool via MCP,
the MCP request can carry an OCP delegation credential as a header/param proving A's authority.

### 5.2 Google A2A Protocol (2025)

**What it is:** Proposed inter-agent communication standard. Defines `AgentCard`
(capability declaration), `Task` lifecycle, and authentication via OAuth 2.0 / OIDC.

**What it lacks:**
- Centralized auth (requires OAuth identity provider — not offline-verifiable)
- No Bitcoin-native economic accountability
- AgentCard capabilities are self-declared without signed delegation proof
- No chain-of-trust path back to a human principal
- No content-addressed credential IDs

**Verdict:** A2A's AgentCard is structurally similar to what OCP delegation could provide,
but its auth model is centralized and cannot be verified offline. OCP's Bitcoin-native,
offline-verifiable attestations are strictly stronger for untrusted multi-party environments.
The AgentCard format itself could be *embedded as content* in an OCP delegation credential.

### 5.3 SPIFFE/SPIRE

**What it is:** Workload identity standard for infrastructure (X.509 SVIDs, JWT-SVIDs).
Designed for service mesh/K8s environments. Short-lived, auto-rotated certificates.

**What it lacks:**
- Designed for infrastructure workloads, not autonomous AI agents
- No economic accountability layer
- No Nostr/decentralized discovery — requires SPIRE server (central coordinator)
- X.509 certificates have complex chain-of-trust models requiring PKI infrastructure
- No human principal concept (workloads don't have "human owners" in the SPIFFE model)

**Where it complements OCP:** SPIFFE is excellent for **runtime infrastructure identity**
(pod-to-pod communication in K8s). OCP/OCD is excellent for **application-layer agent
trust and economic accountability**. A production multi-agent system might use:
- SPIFFE/SPIRE at infrastructure layer (mTLS between services)
- OCP delegation credentials at application layer (agent authorization)

### 5.4 W3C DID + Verifiable Credentials (VCs)

**What it is:** Decentralized Identifier standard (did:web, did:ion, did:key, etc.) + VC
signed credential envelopes in JSON-LD or CBOR-LD format.

**What it provides:** Rich data model, established delegation via chained VCs, broad
standards body support.

**What it lacks for our use case:**
- JSON-LD processing complexity is significant overhead for AI agent systems
- `did:web` requires DNS/web server infrastructure; `did:ion` requires ION node
- No Bitcoin-native economic accountability
- No Nostr decentralized publishing (though nothing prevents it)
- JSON-LD signatures (LD-Proofs, Data Integrity) are complex to implement correctly

**Verdict:** VCs are the closest standards-compliant analog to OCP delegation credentials.
The structural mapping is clean (`vc.credentialSubject` → agent, `vc.issuer` → parent,
`vc.expirationDate` → expires). OCP could register a `did:` identity protocol and issue
credentials that are *also* valid VCs — bridging the two ecosystems. However, building
on raw VC complexity is likely the wrong direction for a Bitcoin-native stack.

### 5.5 UCAN (User Controlled Authorization Networks)

**What it is:** JWT-like delegatable capability tokens. `iss` (issuer), `aud` (audience),
`att` (attenuation/capabilities), `exp`, `nbf`, `prf` (proof CIDs for chain). Signed with
Ed25519 or secp256k1.

**What it provides:** The most structurally complete analog to what OCP delegation needs.
Chain-of-custody proofs, capability attenuation, offline verification, CID-addressed.

**What it lacks:**
- No Bitcoin economic layer (no `bond:` / `budget_sats:` concept)
- No native Nostr publishing/discovery
- Uses `did:key` or `did:pkh` for identity (not Bitcoin-native)
- Less human-readable wire format than OCP's canonical messages
- Smaller ecosystem and tooling vs Bitcoin/Nostr

**Verdict:** UCAN's delegation model is the best technical reference for what OCP needs
to add. The `prf` (proof chain) and `att` (capability attenuation) concepts should be
directly adopted into the OCP delegation extension. OCP's advantage over UCAN is
Bitcoin-native economic accountability and the Nostr publishing ecosystem.

### 5.6 Summary Table

| Standard | Offline Verifiable | Bitcoin Economic Layer | Delegation Chains | Nostr Native | Capability Model |
|---|---|---|---|---|---|
| **OCP v0** (current) | ✅ | ✅ | ❌ | ✅ | ❌ |
| **OCP + OCD** (proposed) | ✅ | ✅ | ✅ | ✅ | ✅ |
| MCP | ✅ | ❌ | ❌ | ❌ | ✅ (tools) |
| A2A | ❌ (central) | ❌ | ❌ | ❌ | ✅ (AgentCard) |
| SPIFFE/SPIRE | ❌ (SPIRE server) | ❌ | ✅ (X.509) | ❌ | ❌ |
| W3C DID/VCs | ✅ | ❌ | ✅ | ❌ | ✅ (JSON-LD) |
| UCAN | ✅ | ❌ | ✅ | ❌ | ✅ |

---

## 6. Minimal Protocol Changes Required

### 6.1 Strategy: Two-Track Extension

Rather than breaking OCP v0, the proposed approach adds a **second credential type** —
the **OrangeCheck Delegation (OCD)** — that shares OCP's cryptographic primitives,
content-addressing, and Nostr publishing infrastructure, but introduces new message
semantics for delegation chains.

Existing OCP `orangecheck` attestations serve as **agent identity anchors** (proving
an agent controls a Bitcoin address with economic stake). New OCD `orangecheck-delegation`
messages serve as **capability delegation credentials** issued *on top of* those anchors.

The two types compose: to verify agent A has authority to perform task X, you:
1. Fetch A's OCP attestation (proves identity + economic accountability)
2. Fetch A's OCD delegation chain (proves authority from human principal)
3. Verify the chain up to the root human's OCP attestation

### 6.2 New Canonical Message Format: `orangecheck-delegation`

```
orangecheck-delegation
issuer: <agent_id | "root:nostr:npub1..." | "root:did:method:id">
subject: <agent_id | nostr:npub1... | did:method:id>
human_principal: <nostr:npub1... | did:method:id | btc:<address>>
capabilities: <comma-sep capability strings, sorted lexicographically>
task_scope: <utf8 string, ≤256 bytes>
max_depth: <non-negative integer>
current_depth: <non-negative integer>
budget_sats: <non-negative integer | "unlimited">
proof: <parent_delegation_id | "none">
nonce: <32 lowercase hex>
issued_at: <ISO8601 UTC Z>
expires: <ISO8601 UTC Z>
ack: I authorize this delegation under human principal oversight.
[optional extensions: sorted lexicographically]
```

**Field Semantics:**

- `issuer:` — The agent issuing this delegation. For root delegation from human, use
  `root:<human_identity>`. For agent-to-agent, use the issuing agent's `delegation_id`.
- `subject:` — The agent receiving this credential. Identified by Nostr npub, DID, or
  the SHA-256 of their OCP attestation message.
- `human_principal:` — Root human in the authority chain. MUST be the same value as the
  parent's `human_principal:`. Verifiers MUST reject credentials where this differs from
  the parent.
- `capabilities:` — Comma-separated, lexicographically sorted capability strings. Format:
  `<namespace>:<resource>[:<action>]`. Subject MUST NOT re-delegate capabilities not in
  this list. See Capability Registry (§6.5).
- `task_scope:` — Bounded human-readable task description. Advisory for auditing.
- `max_depth:` — Remaining re-delegation depth available to `subject`. Subject MAY issue
  child delegations only if `max_depth > 0`; child's `max_depth` MUST be < this value.
- `current_depth:` — Depth of this credential in the chain (0 = direct from human).
  Verifiers MUST check `current_depth + max_depth ≤ root.max_depth`.
- `budget_sats:` — Maximum sats `subject` is authorized to spend/authorize. MUST NOT
  exceed issuer's remaining `budget_sats`. `"unlimited"` only valid when `issuer` is a root
  human credential with explicit human-signed authorization.
- `proof:` — The `delegation_id` of the parent credential. Verifiers MUST fetch and
  validate this credential. `"none"` only valid for root credentials signed by human principal.

**Derivation:**
```
delegation_id = SHA-256(canonical_delegation_message)
```

### 6.3 Signing Schemes

Two valid schemes for delegation credentials:

1. **`bip322`** — Issuer signs with their Bitcoin keypair (secp256k1). Requires `address:` in
   extensions. Enables economic accountability (verifier can check issuer's `sats_bonded`).
2. **`nostr`** — Issuer signs as a Nostr event. The event signature IS the credential signature.
   Lighter-weight; no Bitcoin address required. Verifier checks issuer's npub.

For root human credentials, `bip322` is strongly preferred (provides economic stake + identity).
For agent-to-agent credentials, `nostr` is acceptable (lower overhead at runtime).

### 6.4 New Nostr Event Kind: 30079

**`kind: 30079`** — OrangeCheck Delegation Attestation
(Parameterized Replaceable Event, distinct from kind 30078 reputation attestations)

```json
{
  "kind": 30079,
  "tags": [
    ["d", "ocd:<delegation_id>"],
    ["issuer", "<agent_id_or_root_identity>"],
    ["subject", "<agent_id>"],
    ["human", "<human_principal>"],
    ["proof", "<parent_delegation_id>"],
    ["depth", "<current_depth>", "<max_depth>"],
    ["budget", "<budget_sats>"],
    ["cap", "<capability_string>"],
    ["cap", "<capability_string>"],
    ["expires", "<unix_timestamp>"],
    ["v", "<verification_url>"]
  ],
  "content": "<full_delegation_json_envelope>",
  "created_at": <unix_timestamp>,
  "pubkey": "<nostr_pubkey_of_issuer>",
  "sig": "<nostr_event_signature>"
}
```

**Tag Definitions:**
- `d` — `ocd:<delegation_id>` for parameterized replaceability (each unique delegation is
  its own event; updating the same delegation_id replaces it)
- `issuer` — Indexable issuer for "show all delegations I issued" queries
- `subject` — Indexable subject for "show all my delegation credentials" queries
- `human` — Indexable human principal for "show all active delegations under human H" queries
- `proof` — Parent delegation ID for chain traversal
- `depth` — Two-value tag: current depth and max depth (enables filtering)
- `budget` — Budget in sats (enables numeric filtering by orchestrators)
- `cap` — One tag per capability string (enables filtering by capability)
- `expires` — Unix timestamp for expiry filtering

**Discovery Queries:**

```json
// All delegations for a specific agent (as subject)
{"kinds": [30079], "#subject": ["<agent_id>"]}

// All delegations under a human principal
{"kinds": [30079], "#human": ["nostr:npub1abc..."]}

// All active delegations with a specific capability
{"kinds": [30079], "#cap": ["tool:web_search"]}

// Delegation chain traversal (fetch by delegation_id)
{"kinds": [30079], "#d": ["ocd:<delegation_id>"]}

// All delegations issued by a specific agent
{"kinds": [30079], "#issuer": ["<agent_id>"]}
```

**Revocation Event:**

Add a **kind 30080** revocation event:

```json
{
  "kind": 30080,
  "tags": [
    ["d", "ocd-revoke:<delegation_id>"],
    ["delegation", "<delegation_id>"],
    ["reason", "<human-readable reason>"],
    ["revoked_at", "<unix_timestamp>"]
  ],
  "content": "<revocation_json_envelope>",
  "pubkey": "<issuer_npub>",
  "sig": "<issuer_signature>"
}
```

Verifiers MUST check for kind 30080 revocation events when validating a delegation chain.
Revocation is authoritative if signed by the issuer of the revoked credential.

### 6.5 Capability Registry (Initial)

Format: `<namespace>:<resource>[:<action>]`

```
# LLM Operations
llm:invoke                    # Call any LLM
llm:invoke:<model_id>         # Call specific model
llm:sample                    # Sample/generate tokens

# Tool Invocation
tool:*                        # Any tool
tool:<tool_name>              # Specific tool (e.g., tool:web_search)
tool:<tool_name>:<method>     # Specific method on a tool

# Memory & State
memory:read                   # Read agent memory
memory:write                  # Write agent memory
memory:*                      # Full memory access

# File System
file:read:<path_glob>         # Read files matching glob
file:write:<path_glob>        # Write files matching glob
file:*                        # Full file access

# Network
network:http:get              # HTTP GET requests
network:http:post             # HTTP POST requests
network:http:*                # Any HTTP
network:*                     # Any network

# Bitcoin / Economic
btc:sign                      # Sign Bitcoin transactions
btc:spend:<sats_limit>        # Spend up to N sats
btc:broadcast                 # Broadcast transactions
btc:*                         # Full Bitcoin operations

# Agent Control
agent:spawn                   # Spawn sub-agents
agent:delegate                # Issue further delegation credentials
agent:terminate               # Terminate agents

# OCP/OCD Operations
attestation:read              # Read OCP attestations
attestation:publish           # Publish OCP attestations
delegation:issue              # Issue OCD credentials (requires max_depth > 0)
delegation:revoke             # Revoke issued credentials
```

Capabilities MUST be a **subset** of the parent's capability list. Verifiers MUST reject
delegations claiming capabilities not granted by the parent.

### 6.6 JSON Envelope for Delegation Credentials

```json
{
  "ocd_version": "v1",
  "delegation_id": "<sha256_of_canonical_message>",
  "issuer": "<agent_id_or_root_identity>",
  "subject": "<agent_id>",
  "human_principal": "nostr:npub1abc...",
  "capabilities": ["tool:web_search", "tool:code_exec", "memory:read"],
  "task_scope": "Research and summarize recent AI papers on agent safety",
  "max_depth": 1,
  "current_depth": 0,
  "budget_sats": 50000,
  "proof": "none",
  "scheme": "bip322",
  "address": "bc1p...",
  "signature": "AkcwRAIg...",
  "message": "orangecheck-delegation\nissuer: root:nostr:npub1abc...\n...",
  "message_b64url": "b3Jhbmdl...",
  "issued_at": "2026-03-02T10:00:00Z",
  "expires": "2026-03-02T18:00:00Z",
  "relay_hints": ["wss://relay.damus.io"],
  "verification_url": "https://ochk.io/delegation/<delegation_id>"
}
```

---

## 7. Integration with LangGraph, AutoGen, and CrewAI

### 7.1 How OCP/OCD Sits as Trust Anchor

OCP/OCD does **not** replace framework-level orchestration. It provides the
**identity and authorization layer** underneath it:

```
┌─────────────────────────────────────────────────────┐
│ LangGraph / AutoGen / CrewAI                        │  ← orchestration logic
├─────────────────────────────────────────────────────┤
│ OCD Delegation Credentials                          │  ← "who authorized this agent?"
├─────────────────────────────────────────────────────┤
│ OCP Identity Attestations                           │  ← "who is this agent?"
├─────────────────────────────────────────────────────┤
│ Bitcoin / Nostr / secp256k1                         │  ← trust anchors
└─────────────────────────────────────────────────────┘
```

### 7.2 LangGraph Integration Pattern

```python
from langgraph.graph import StateGraph
from ocp_sdk import verify_delegation, DelegationChain

class AgentNode:
    def __init__(self, delegation_credential: dict):
        self.chain = DelegationChain.from_json(delegation_credential)
        self.chain.verify()  # raises if invalid

    def can_use_tool(self, tool_name: str) -> bool:
        return self.chain.has_capability(f"tool:{tool_name}")

    def get_budget_remaining(self) -> int:
        return self.chain.budget_sats

# Tool enforcement middleware
def capability_guard(agent: AgentNode, tool_name: str):
    if not agent.can_use_tool(tool_name):
        raise PermissionError(f"Agent not authorized for tool:{tool_name}")

    if agent.chain.is_expired():
        raise PermissionError("Agent delegation credential has expired")
```

### 7.3 AutoGen Integration Pattern

```python
from autogen import AssistantAgent, ConversableAgent
from ocp_sdk import OCD

class OCPAgent(AssistantAgent):
    def __init__(self, delegation_json: str, **kwargs):
        self.ocd = OCD.from_json(delegation_json)
        self.ocd.verify_chain()

        # Restrict tools to delegated capabilities
        allowed_tools = self.ocd.get_tools()  # e.g., ["web_search", "code_exec"]

        super().__init__(
            name=self.ocd.subject_id,
            system_message=f"You are acting under delegation from {self.ocd.human_principal}. "
                          f"Your task scope: {self.ocd.task_scope}. "
                          f"Budget: {self.ocd.budget_sats} sats.",
            **kwargs
        )
```

### 7.4 CrewAI Integration Pattern

```python
from crewai import Agent, Crew
from ocp_sdk import OCD, verify_human_principal

# Human creates root delegation
root_delegation = OCD.create_root(
    human_principal="nostr:npub1abc...",
    subject="nostr:npub1agent0...",
    capabilities=["tool:web_search", "agent:delegate"],
    max_depth=2,
    budget_sats=100000,
    expires="2026-03-02T20:00:00Z"
)
root_delegation.sign(human_bitcoin_privkey)
root_delegation.publish_to_nostr()

# Agent0 creates sub-delegation
sub_delegation = root_delegation.delegate(
    subject="nostr:npub1agent1...",
    capabilities=["tool:web_search"],  # subset only
    max_depth=0,                        # no further delegation
    budget_sats=10000,                  # subset of parent budget
    expires="2026-03-02T14:00:00Z"
)
sub_delegation.sign(agent0_privkey)

# CrewAI agent with OCD enforcement
researcher = Agent(
    role="Researcher",
    goal=root_delegation.task_scope,
    backstory="AI researcher authorized by human principal",
    tools=get_tools_for_capabilities(root_delegation.capabilities),
    ocd=root_delegation  # OCD credential attached
)
```

---

## 8. Recommended Implementation Path

### Phase 1: Minimal Viable OCD (2-4 weeks)

1. Define OCD canonical message format (§6.2) — the text format is the spec
2. Add `delegation_id = SHA-256(message)` derivation to SDK
3. Implement OCD signing (reuse existing BIP-322 infrastructure)
4. Implement chain verification algorithm:
   - Fetch parent credential by `proof:` delegation_id
   - Verify parent signature
   - Verify capabilities ⊆ parent capabilities
   - Verify budget_sats ≤ parent budget_sats
   - Verify expires ≤ parent expires
   - Verify max_depth < parent max_depth
   - Verify human_principal unchanged from root
5. Add `verify_chain(delegation_id, max_hops=10)` to SDK
6. Implement kind 30079 Nostr publishing (reuse existing Nostr infrastructure)
7. Add delegation discovery queries to SDK

### Phase 2: Capability Enforcement & Framework Integration (2-4 weeks)

1. Register initial capability namespace (§6.5)
2. Build `OCD.has_capability(cap: string): bool`
3. Build middleware for LangGraph, AutoGen, CrewAI (see §7)
4. Implement kind 30080 revocation events
5. Add revocation check to `verify_chain()`
6. Build `OCD.delegate(params) → OCD` helper for agent-to-agent re-delegation

### Phase 3: Production Hardening (4-6 weeks)

1. Conformance test vectors (valid chain, expired, revoked, capability overstep,
   budget overstep, depth exceeded, chain loop detection)
2. Rate limiting / anti-spam for delegation credential publishing
3. Cross-relay verification (fetch from multiple relays, cross-check)
4. Budget tracking integration (optional: link to actual Bitcoin payment channels)
5. ZK-friendly credential format research (private capability proofs)

---

## 9. Summary of Required Schema Changes

| Change | Type | Priority | Backward Compatible |
|---|---|---|---|
| New message header `orangecheck-delegation` | Breaking (new type) | P0 | ✅ (additive) |
| `issuer:` field | New required | P0 | ✅ |
| `subject:` field | New required | P0 | ✅ |
| `human_principal:` field | New required | P0 | ✅ |
| `capabilities:` field | New required | P0 | ✅ |
| `task_scope:` field | New optional | P1 | ✅ |
| `max_depth:` field | New required | P0 | ✅ |
| `current_depth:` field | New required | P0 | ✅ |
| `budget_sats:` field | New required | P0 | ✅ |
| `proof:` field | New required | P0 | ✅ |
| Nostr kind 30079 | New event kind | P0 | ✅ |
| Nostr kind 30080 (revocation) | New event kind | P1 | ✅ |
| Capability registry | New registry doc | P1 | ✅ |
| `agent:` identity protocol | Registry update | P1 | ✅ |
| `ocd_version` in JSON envelope | New field | P0 | ✅ |
| `verify_chain()` algorithm | New SDK function | P0 | ✅ |

All changes are **additive** — they do not modify OCP v0 attestation format, and
existing OCP attestations continue to function unchanged. The two credential types
compose cleanly.

---

## 10. Open Questions

1. **Should `budget_sats` be enforced on-chain?** A pre-committed UTXO of exact size
   could cryptographically enforce budget limits, making enforcement trustless rather
   than policy-based. However, it requires a Bitcoin transaction per delegation —
   high friction for rapid agent spawning. Recommend policy-based enforcement for v1,
   on-chain enforcement as a future opt-in extension.

2. **Nostr vs. IPFS for delegation storage?** Nostr relays are censorship-resistant
   but transient (relays can prune). IPFS provides content-addressed persistence but
   requires pinning. For long-running delegation chains, IPFS CIDs may be more
   appropriate than Nostr event IDs as `proof:` references.

3. **Privacy of capability lists?** Publicly posting an agent's full capability list
   to Nostr leaks operational intelligence. Consider encrypting `content` field of
   kind 30079 events (NIP-04/NIP-44 encryption to the verifying orchestrator's pubkey).

4. **Capability attenuation granularity?** The proposed `<namespace>:<resource>:<action>`
   format may be insufficiently expressive. UCAN uses IPLD/CBOR for rich capability
   objects. Evaluate whether string-based caps are sufficient for production use cases.

5. **Agent key rotation?** When an agent rotates its keypair, all its delegation
   credentials (keyed to old pubkey) become invalid. A rotation protocol is needed
   that preserves delegation authority across key changes.

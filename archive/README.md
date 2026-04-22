# Archive

These documents represent earlier directions for OrangeCheck that have been **retired**. They are kept for historical context but do not describe the current protocol or product.

## `AGENT_DELEGATION_GAP_ANALYSIS.md`, `OCD_PLAN_2026-03-02.md`

In early 2026 we explored extending OrangeCheck into a UCAN-style agent delegation credential system ("OCD"). This direction was retired for two reasons:

1. **Bitcoin was not load-bearing.** The OCD design used secp256k1 signatures and content-addressed IDs, but the Bitcoin chain contributed nothing the protocol couldn't get from Ed25519 + IPFS. When Bitcoin is ornamental, you are just reinventing UCAN.
2. **It chased AI-agent hype instead of a real integrator.** No forum, Nostr client, or airdrop distributor was asking for agent delegation. They were asking for a sybil filter. That's the product.

If you need chained capability delegation for multi-agent systems, use [UCAN](https://ucan.xyz). If you need sybil-resistance, use OrangeCheck.

See **[../VISION.md](../VISION.md)** for the current direction.

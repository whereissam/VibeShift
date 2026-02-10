# AI Disclosure

**Project:** VibeShift — Self-Sustaining Yield Engine on Sui
**Event:** Vibe Sui Spring Fest 2026

---

## AI Tools Used

| Tool | Usage |
|------|-------|
| **Gemini (v2026)** | Architecture design, system design feedback, feature ideation (Flash-Shift hot-potato pattern, DeepBook V3 Liquidity Injection, Autonomous Gas Refuel) |
| **Sui Stack Claude Plugin** | Move 2026 boilerplate generation, contract scaffolding, unit test templates |
| **Claude Code** | Code refactoring, SDK integration, TypeScript PTB builders, documentation |

## What Was AI-Generated

- Initial Move contract scaffolding (`vault.move` structure, event definitions)
- TypeScript SDK boilerplate (`vault.ts`, `deepbook.ts`, `refuel.ts` function signatures)
- Documentation templates (`README.md`, `flash-shift.md` structure)

## What Was Human-Authored

- Architecture decisions (hot-potato Flash-Shift design, yield-to-gas autonomy model)
- Smart contract logic (FlashReceipt safety invariants, skim yield caps, AgentCap access control)
- Protocol integration (Stablelayer SDK, Cetus CLMM SDK, DeepBook V3 flash loan composition)
- Agent strategy logic (`sentinel.py` analysis, threshold tuning, Liquidity Injection heuristics)
- Testing and deployment (20 Move unit tests, testnet deployment, end-to-end verification)
- All final code review and refinement

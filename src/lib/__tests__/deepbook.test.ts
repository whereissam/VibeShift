import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  checkSlippageTolerance,
  simulateFlashShift,
  preflightFlashShift,
  buildFlashShiftTx,
  buildFlashShiftWithDeepBookTx,
} from "../deepbook";

// ===== checkSlippageTolerance (pure function — no mocks needed) =====

describe("checkSlippageTolerance", () => {
  it("returns withinTolerance=true when output equals repayment", () => {
    const result = checkSlippageTolerance(1000n, 1000n, 50);
    expect(result.withinTolerance).toBe(true);
    expect(result.slippageBps).toBe(0);
    expect(result.expectedOutput).toBe(1000n);
    expect(result.requiredRepayment).toBe(1000n);
  });

  it("returns withinTolerance=true when output exceeds repayment", () => {
    const result = checkSlippageTolerance(1100n, 1000n, 50);
    expect(result.withinTolerance).toBe(true);
    expect(result.slippageBps).toBe(0);
  });

  it("returns withinTolerance=true when slippage is within tolerance", () => {
    // 0.3% slippage, 0.5% tolerance
    const result = checkSlippageTolerance(9970n, 10000n, 50);
    expect(result.withinTolerance).toBe(true);
    expect(result.slippageBps).toBe(30);
  });

  it("returns withinTolerance=false when slippage exceeds tolerance", () => {
    // 2% slippage, 0.5% tolerance
    const result = checkSlippageTolerance(9800n, 10000n, 50);
    expect(result.withinTolerance).toBe(false);
    expect(result.slippageBps).toBe(200);
  });

  it("returns withinTolerance=true at exact tolerance boundary", () => {
    // 50 bps slippage, 50 bps tolerance
    const result = checkSlippageTolerance(9950n, 10000n, 50);
    expect(result.withinTolerance).toBe(true);
    expect(result.slippageBps).toBe(50);
  });

  it("handles zero repayment gracefully", () => {
    const result = checkSlippageTolerance(1000n, 0n, 50);
    expect(result.withinTolerance).toBe(true);
    expect(result.slippageBps).toBe(0);
  });

  it("handles zero output with non-zero repayment", () => {
    const result = checkSlippageTolerance(0n, 10000n, 50);
    expect(result.withinTolerance).toBe(false);
    expect(result.slippageBps).toBe(10000); // 100% slippage
  });

  it("handles large amounts without overflow", () => {
    const repayment = 1_000_000_000_000n; // 1T
    const output = 999_000_000_000n; // 0.1% slippage
    const result = checkSlippageTolerance(output, repayment, 50);
    expect(result.withinTolerance).toBe(true);
    expect(result.slippageBps).toBe(10);
  });

  it("uses provided toleranceBps parameter", () => {
    // 1% slippage
    const result100 = checkSlippageTolerance(9900n, 10000n, 100);
    expect(result100.withinTolerance).toBe(true);
    expect(result100.toleranceBps).toBe(100);

    const result50 = checkSlippageTolerance(9900n, 10000n, 50);
    expect(result50.withinTolerance).toBe(false);
    expect(result50.toleranceBps).toBe(50);
  });
});

// ===== simulateFlashShift & preflightFlashShift (mocked RPC) =====

const mockDryRun = vi.fn();

vi.mock("@mysten/sui/client", () => {
  return {
    SuiClient: function () {
      return { dryRunTransactionBlock: mockDryRun };
    },
  };
});

describe("simulateFlashShift", () => {
  beforeEach(() => {
    mockDryRun.mockReset();
  });

  it("returns success with output amount from balance changes", async () => {
    mockDryRun.mockResolvedValue({
      effects: {
        status: { status: "success" },
        gasUsed: { computationCost: "1000" },
      },
      balanceChanges: [
        {
          owner: { Shared: { objectId: "0xvault" } },
          coinType: "0x2::sui::SUI",
          amount: "5000",
        },
      ],
    });

    const result = await simulateFlashShift(new Uint8Array([1, 2, 3]));
    expect(result.success).toBe(true);
    expect(result.outputAmount).toBe(5000n);
    expect(result.gasUsed).toBe(1000n);
  });

  it("returns failure when transaction effects show failure", async () => {
    mockDryRun.mockResolvedValue({
      effects: {
        status: { status: "failure", error: "MoveAbort: vault drain" },
        gasUsed: { computationCost: "500" },
      },
      balanceChanges: [],
    });

    const result = await simulateFlashShift(new Uint8Array([1, 2, 3]));
    expect(result.success).toBe(false);
    expect(result.error).toBe("MoveAbort: vault drain");
    expect(result.outputAmount).toBe(0n);
  });

  it("returns failure when RPC throws", async () => {
    mockDryRun.mockRejectedValue(new Error("Network timeout"));

    const result = await simulateFlashShift(new Uint8Array([1, 2, 3]));
    expect(result.success).toBe(false);
    expect(result.error).toBe("Network timeout");
  });

  it("only counts positive balance changes to shared objects", async () => {
    mockDryRun.mockResolvedValue({
      effects: {
        status: { status: "success" },
        gasUsed: { computationCost: "100" },
      },
      balanceChanges: [
        {
          owner: { Shared: { objectId: "0xvault" } },
          amount: "8000",
        },
        {
          owner: { Shared: { objectId: "0xvault" } },
          amount: "-3000", // negative = outflow
        },
        {
          owner: { AddressOwner: "0xuser" },
          amount: "2000", // not shared — ignored
        },
      ],
    });

    const result = await simulateFlashShift(new Uint8Array([1]));
    expect(result.success).toBe(true);
    expect(result.outputAmount).toBe(8000n); // only the positive shared change
  });
});

describe("preflightFlashShift", () => {
  beforeEach(() => {
    mockDryRun.mockReset();
  });

  it("returns passing check when simulation output meets repayment", async () => {
    mockDryRun.mockResolvedValue({
      effects: {
        status: { status: "success" },
        gasUsed: { computationCost: "100" },
      },
      balanceChanges: [
        { owner: { Shared: { objectId: "0xv" } }, amount: "10000" },
      ],
    });

    const check = await preflightFlashShift(new Uint8Array([1]), 10000n, 50);
    expect(check.withinTolerance).toBe(true);
    expect(check.slippageBps).toBe(0);
  });

  it("returns failing check when slippage exceeds tolerance", async () => {
    mockDryRun.mockResolvedValue({
      effects: {
        status: { status: "success" },
        gasUsed: { computationCost: "100" },
      },
      balanceChanges: [
        { owner: { Shared: { objectId: "0xv" } }, amount: "9000" },
      ],
    });

    const check = await preflightFlashShift(new Uint8Array([1]), 10000n, 50);
    expect(check.withinTolerance).toBe(false);
    expect(check.slippageBps).toBe(1000); // 10%
  });

  it("throws when simulation fails", async () => {
    mockDryRun.mockResolvedValue({
      effects: {
        status: { status: "failure", error: "Abort" },
        gasUsed: { computationCost: "100" },
      },
      balanceChanges: [],
    });

    await expect(
      preflightFlashShift(new Uint8Array([1]), 10000n),
    ).rejects.toThrow("Flash-shift simulation failed: Abort");
  });
});

// ===== buildFlashShiftTx (pure transaction builder) =====

describe("buildFlashShiftTx", () => {
  it("builds a transaction with request and complete move calls", () => {
    const tx = buildFlashShiftTx(
      "0xvault123",
      "0x2::sui::SUI",
      1000000n,
      "cetus",
    );
    expect(tx).toBeDefined();
    expect(tx.getData).toBeDefined();
  });
});

describe("buildFlashShiftWithDeepBookTx", () => {
  it("builds a compound transaction with vault and deepbook flash loans", () => {
    const tx = buildFlashShiftWithDeepBookTx(
      "0xvault123",
      "0x2::sui::SUI",
      1000000n,
      500000n,
      "cetus",
    );
    expect(tx).toBeDefined();
    expect(tx.getData).toBeDefined();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRebalanceEvents } from "../vault";

const mockQueryEvents = vi.fn();

vi.mock("@mysten/sui/client", () => {
  return {
    SuiClient: function () {
      return {
        queryEvents: mockQueryEvents,
        getObject: vi.fn().mockResolvedValue({ data: null }),
      };
    },
  };
});

describe("getRebalanceEvents", () => {
  beforeEach(() => {
    mockQueryEvents.mockReset();
  });

  it("returns empty arrays when no events exist", async () => {
    mockQueryEvents.mockResolvedValue({ data: [] });
    const result = await getRebalanceEvents();
    expect(result.rebalances).toEqual([]);
    expect(result.flashShifts).toEqual([]);
  });

  it("parses RebalanceEvent fields correctly", async () => {
    mockQueryEvents
      .mockResolvedValueOnce({
        data: [
          {
            id: { txDigest: "abc123" },
            parsedJson: {
              vault_id: "0xvault",
              agent: "0xagent",
              amount: "5000",
              direction: Array.from(new TextEncoder().encode("to_cetus")),
              total_assets_after: "95000",
            },
            timestampMs: "1700000000000",
          },
        ],
      })
      .mockResolvedValueOnce({ data: [] }); // FlashShiftEvent

    const result = await getRebalanceEvents();
    expect(result.rebalances).toHaveLength(1);
    expect(result.rebalances[0]).toEqual({
      vaultId: "0xvault",
      agent: "0xagent",
      amount: "5000",
      direction: "to_cetus",
      totalAssetsAfter: "95000",
      txDigest: "abc123",
      timestampMs: "1700000000000",
    });
  });

  it("parses FlashShiftEvent fields correctly", async () => {
    mockQueryEvents
      .mockResolvedValueOnce({ data: [] }) // RebalanceEvent
      .mockResolvedValueOnce({
        data: [
          {
            id: { txDigest: "flash456" },
            parsedJson: {
              vault_id: "0xvault",
              agent: "0xagent",
              amount: "10000",
              repaid: "10050",
              protocol: Array.from(new TextEncoder().encode("cetus")),
              total_assets_after: "100050",
            },
            timestampMs: "1700000001000",
          },
        ],
      });

    const result = await getRebalanceEvents();
    expect(result.flashShifts).toHaveLength(1);
    expect(result.flashShifts[0].repaid).toBe("10050");
    expect(result.flashShifts[0].protocol).toBe("cetus");
  });

  it("filters events by vault ID when provided", async () => {
    mockQueryEvents
      .mockResolvedValueOnce({
        data: [
          {
            id: { txDigest: "tx1" },
            parsedJson: {
              vault_id: "0xvault_a",
              agent: "0x1",
              amount: "100",
              direction: Array.from(new TextEncoder().encode("to")),
              total_assets_after: "900",
            },
            timestampMs: "1000",
          },
          {
            id: { txDigest: "tx2" },
            parsedJson: {
              vault_id: "0xvault_b",
              agent: "0x1",
              amount: "200",
              direction: Array.from(new TextEncoder().encode("to")),
              total_assets_after: "800",
            },
            timestampMs: "2000",
          },
        ],
      })
      .mockResolvedValueOnce({ data: [] });

    const result = await getRebalanceEvents("0xvault_a");
    expect(result.rebalances).toHaveLength(1);
    expect(result.rebalances[0].vaultId).toBe("0xvault_a");
  });

  it("respects limit parameter", async () => {
    mockQueryEvents.mockResolvedValue({ data: [] });
    await getRebalanceEvents(undefined, 10);

    // Both calls should pass the limit
    expect(mockQueryEvents).toHaveBeenCalledTimes(2);
    expect(mockQueryEvents.mock.calls[0][0].limit).toBe(10);
    expect(mockQueryEvents.mock.calls[1][0].limit).toBe(10);
  });
});

import { describe, expect, it } from "vitest";
import { agentRequest } from "@/lib/tango-sync-contract";

const ids = { jobId: "8f0c6a8e-2f43-4a39-9d55-0e7d2c3f4b11", claimToken: "0b5e1c7a-9a1d-4c2e-8f3b-6d4a2e1f7c90" };

const pendingRow = {
  sourceId: "65838",
  purchaseOrder: "0000100026751",
  line: 1,
  clientCode: "DG99-3432",
  warehouse: "H5",
  client: "URBANO EXPRESS",
  orderDate: "2026-11-12",
  orderedQuantity: "10",
  receivedQuantity: "0",
  pendingQuantity: "10",
  status: "3",
};

describe("contrato del conector de Tango", () => {
  it("acepta lotes de OC pendientes", () => {
    expect(agentRequest.safeParse({ action: "pending", ...ids, index: 0, rows: [pendingRow] }).success).toBe(true);
  });

  it("rechaza un renglón pendiente sin OC o sin código", () => {
    expect(agentRequest.safeParse({ action: "pending", ...ids, index: 0, rows: [{ ...pendingRow, purchaseOrder: "" }] }).success).toBe(false);
    expect(agentRequest.safeParse({ action: "pending", ...ids, index: 0, rows: [{ ...pendingRow, clientCode: " " }] }).success).toBe(false);
  });

  it("acepta el cierre con o sin OC pendientes (conector viejo)", () => {
    const old = agentRequest.safeParse({ action: "finish", ...ids, totalRows: 3, totalBatches: 1 });
    expect(old.success && old.data.action === "finish" && old.data.pendingRows).toBeUndefined();
    const withPending = agentRequest.safeParse({ action: "finish", ...ids, totalRows: 3, totalBatches: 1, pendingRows: 0, pendingBatches: 0 });
    expect(withPending.success && withPending.data.action === "finish" && withPending.data.pendingRows).toBe(0);
  });
});

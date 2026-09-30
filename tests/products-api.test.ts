import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(), postgres: vi.fn(), readExcel: vi.fn(), writeExcel: vi.fn(),
  readPostgres: vi.fn(), writePostgres: vi.fn(),
}));
vi.mock("@/server/lib/access", () => ({ checkApiAccess: mocks.access }));
vi.mock("@/lib/data-source", () => ({ usesPostgres: mocks.postgres }));
vi.mock("@/lib/local-excel-db", () => ({ readProductsFromExcel: mocks.readExcel, writeProductsToExcel: mocks.writeExcel }));
vi.mock("@/lib/postgres-replica-db", () => ({ readProductsFromPostgres: mocks.readPostgres, writeProductsToPostgres: mocks.writePostgres }));
import { PUT } from "@/app/api/local-db/products/route";
import { DuplicateProductCodeError } from "@/lib/product-uniqueness";

const request = (products: object[]) => new Request("http://localhost/api/local-db/products", {
  method: "PUT", body: JSON.stringify({ products }), headers: { "Content-Type": "application/json" },
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.readExcel.mockReturnValue([]);
});

describe("products API", () => {
  it.each([true, false])("rejects duplicate batches before writing (postgres=%s)", async (postgres) => {
    mocks.postgres.mockReturnValue(postgres);
    const response = await PUT(request([{ id: "1", code: "ABC" }, { id: "2", code: " abc " }]));
    expect(response.status).toBe(409);
    expect(mocks.writeExcel).not.toHaveBeenCalled();
    expect(mocks.writePostgres).not.toHaveBeenCalled();
  });

  it("rejects codes already stored in Excel, including inactive products", async () => {
    mocks.readExcel.mockReturnValue([{ id: "1", code: "ABC", active: false }]);
    expect((await PUT(request([{ id: "2", code: "abc" }]))).status).toBe(409);
    expect(mocks.writeExcel).not.toHaveBeenCalled();
  });

  it("returns canonical saved IDs and reports transactional conflicts", async () => {
    mocks.postgres.mockReturnValue(true);
    mocks.writePostgres.mockResolvedValue([{ id: "42", code: "ABC" }]);
    expect(await (await PUT(request([{ id: "temporary", code: "ABC" }]))).json())
      .toMatchObject({ products: [{ id: "42", code: "ABC" }] });
    mocks.writePostgres.mockRejectedValue(new DuplicateProductCodeError("Duplicado"));
    expect((await PUT(request([{ id: "temporary", code: "ABC" }]))).status).toBe(409);
  });
});

import { describe, expect, it } from "vitest";
import { matchUrbanoReceptions } from "@/lib/pasaje-urbano-match";

const day = (value: string) => new Date(`${value}T12:00:00.000Z`);
const pasaje = (id: string, toClientCode: string, quantity: number, createdAt = "2026-11-02", requestDate: string | null = "2026-10-29") => ({
  id, toClient: "Producteca", toClientCode, quantity, createdAt: day(createdAt), requestDate: requestDate ? day(requestDate) : null,
});
const reception = (id: number, clientCode: string, quantity: number, date = "2026-11-03", voucher: string | null = "0955261102") => ({
  id, client: "PRODUCTECA" as string | null, clientCode, quantity, date: day(date), voucher,
});

describe("cruce de pasajes con recepciones de Urbano", () => {
  it("confirma con una recepción de la misma cantidad, sin distinguir mayúsculas", () => {
    const { matches, review } = matchUrbanoReceptions([pasaje("a", "ci11a19(220)", 10)], [reception(1, "CI11A19(220)", 10)]);
    expect(matches).toEqual([{ pasajeId: "a", quantity: 10, receptionIds: [1], vouchers: ["0955261102"] }]);
    expect(review).toEqual([]);
  });

  it("caso real: elige la recepción exacta aunque haya otras del mismo código", () => {
    const { matches } = matchUrbanoReceptions([pasaje("a", "PROD-292", 7)], [
      reception(1, "PROD-292", 8, "2026-10-29", "9552610262"),
      reception(2, "PROD-292", 4, "2026-10-29", "9552610262"),
      reception(3, "PROD-292", 7),
    ]);
    expect(matches[0]).toMatchObject({ receptionIds: [3], vouchers: ["0955261102"] });
  });

  it("suma recepciones en partes hasta la cantidad pedida", () => {
    const { matches } = matchUrbanoReceptions([pasaje("a", "X", 10)], [
      reception(1, "X", 6, "2026-11-03", "V1"), reception(2, "X", 4, "2026-11-05", "V2"),
    ]);
    expect(matches).toEqual([{ pasajeId: "a", quantity: 10, receptionIds: [1, 2], vouchers: ["V1", "V2"] }]);
  });

  it("si Urbano informó otra cantidad, queda para revisar y no se confirma", () => {
    const less = matchUrbanoReceptions([pasaje("a", "X", 10)], [reception(1, "X", 7)]);
    expect(less.matches).toEqual([]);
    expect(less.review).toEqual([{ pasajeId: "a", received: 7, vouchers: ["0955261102"] }]);
    const more = matchUrbanoReceptions([pasaje("a", "X", 10)], [reception(1, "X", 15)]);
    expect(more.matches).toEqual([]);
    expect(more.review[0]).toMatchObject({ received: 15 });
  });

  it("sin recepciones sigue esperando, sin pedir revisión", () => {
    expect(matchUrbanoReceptions([pasaje("a", "X", 10)], [reception(1, "Y", 10)])).toEqual({ matches: [], review: [] });
  });

  it("no toma la recepción de otro cliente con el mismo código; sin cliente informado, alcanza el código", () => {
    expect(matchUrbanoReceptions([pasaje("a", "60", 10)], [{ ...reception(1, "60", 10), client: "Pampa" }])).toEqual({ matches: [], review: [] });
    expect(matchUrbanoReceptions([pasaje("a", "60", 10)], [{ ...reception(1, "60", 10), client: null }]).matches).toHaveLength(1);
  });

  it("no toma recepciones anteriores a la solicitud, ni a la carga si no hay solicitud", () => {
    expect(matchUrbanoReceptions([pasaje("a", "X", 10)], [reception(1, "X", 10, "2026-10-27")]).matches).toEqual([]);
    expect(matchUrbanoReceptions([pasaje("a", "X", 10)], [reception(1, "X", 10, "2026-10-28")]).matches).toHaveLength(1);
    expect(matchUrbanoReceptions([pasaje("a", "X", 10, "2026-11-02", null)], [reception(1, "X", 10, "2026-10-31")]).matches).toEqual([]);
  });

  it("una recepción no sirve para dos pasajes: se confirma el más viejo", () => {
    const { matches } = matchUrbanoReceptions([pasaje("nuevo", "X", 10, "2026-11-04"), pasaje("viejo", "X", 10, "2026-11-02")], [reception(1, "X", 10)]);
    expect(matches.map((item) => item.pasajeId)).toEqual(["viejo"]);
  });

  it("una recepción exacta se reserva antes de sumar partes para otro pasaje", () => {
    const { matches } = matchUrbanoReceptions([pasaje("suma", "X", 10, "2026-11-01"), pasaje("exacto", "X", 4, "2026-11-02")], [
      reception(1, "X", 6), reception(2, "X", 4), reception(3, "X", 4),
    ]);
    expect(matches.find((item) => item.pasajeId === "exacto")?.receptionIds).toEqual([2]);
    expect(matches.find((item) => item.pasajeId === "suma")?.receptionIds).toEqual([1, 3]);
  });

  it("los 14 pasajes reales de Pampa a Producteca se confirman todos", () => {
    const real: [string, number][] = [["10352", 22], ["HDL-400", 1], ["GVEL", 17], ["PROD-219", 8], ["IMP-WV-02", 1], ["PROD-77", 15], ["30433", 15], ["PROD-301", 6], ["PROD-292", 7], ["60", 10], ["PROD-297", 7], ["PROD-267", 6], ["ci11a19(220)", 10], ["PROD-121", 6]];
    const receptions = real.map(([code, quantity], index) => reception(index, code.toUpperCase(), quantity));
    const { matches, review } = matchUrbanoReceptions(real.map(([code, quantity], index) => pasaje(`p${index}`, code, quantity)), receptions);
    expect(matches).toHaveLength(14);
    expect(review).toEqual([]);
  });
});

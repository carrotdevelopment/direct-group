"""Arma egresos.csv e ingresos.csv (sin datos personales de los canjes) desde las bases de Excel.

Uso: python scripts/migracion-completa/preparar.py <carpeta con los Excel> <carpeta de salida>
No se conecta a ninguna base. Después se cargan con cargar.sql. Requiere openpyxl.
"""
import collections
import csv
import datetime
import os
import re
import sys

import openpyxl

sys.stdout.reconfigure(encoding="utf-8")
SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
CLIENTES = {  # archivo: (cliente en la plataforma, columna del código)
    "Egresos Amex_DB.xlsx": ("Amex", "Codigo cliente"),
    "Egresos Credicoop_DB.xlsx": ("Credicoop", "IdRecompensa"),
    "Egresos Importados_DB.xlsx": ("Importados", "Código Cliente"),
    "Egresos massalin_DB.xlsx": ("Massalin", "Código Cliente"),
    "Egresos Pampa_DB.xlsx": ("Pampa", "SKU"),
    "Egresos Producteca_DB.xlsx": ("Producteca", "Código Cliente"),
    "Egresos Santander_DB.xlsx": ("Santander", "SKU"),
    "Egresos Syngenta_DB.xlsx": ("Syngenta", "Código producto"),
    "Egresos Umiles_DB.xlsx": ("Umiles", "Código Cliente"),
}
# Años mal tipeados en las planillas, corregibles sin ambigüedad.
ANIOS = {-2025: 2025, 226: 2026, 206: 2026, 20266: 2026, 20205: 2025, 2055: 2025, 25: 2025}
HOY = datetime.date.today()


def texto(valor):
    return "" if valor is None else re.sub(r"\.0$", "", re.sub(r"\s+", " ", str(valor)).strip())


def numero(valor):
    try:
        return float(str(valor).replace(",", "."))
    except ValueError:
        return None


def fecha(anio, mes, dia):
    try:
        f = datetime.date(ANIOS.get(int(anio), int(anio)), int(mes), int(dia))
    except (TypeError, ValueError):
        return None
    return f if 2022 <= f.year and f <= HOY else None


def operacion_egreso(valor):
    op = texto(valor).upper()
    if "HISTORIA" in op:
        return "HISTORIA CANJE" if "CANJE" in op else op
    if "EJEMPLO" in op:
        return op
    for clave, nombre in (
        ("PASAJE", "PASAJE"), ("ROBO", "ROBO_AJUSTE"), ("AJUSTE", "ROBO_AJUSTE"),
        ("CAMBIO", "CAMBIO"), ("REENVIO", "REENVIO"), ("DONACI", "DONACION"),
    ):
        if clave in op:
            return nombre
    return op


def filas(archivo):
    libro = openpyxl.load_workbook(os.path.join(SRC, archivo), read_only=True, data_only=True)
    hoja = libro.worksheets[0]
    hoja.reset_dimensions()
    for fila in hoja.iter_rows(values_only=True):
        if any(c is not None for c in fila):
            yield fila


revisar = csv.writer(open(os.path.join(OUT, "revisar.csv"), "w", newline="", encoding="utf-8-sig"))
revisar.writerow("archivo fila_aprox motivo cargada codigo cantidad operacion dia mes anio".split())
with open(os.path.join(OUT, "egresos.csv"), "w", newline="", encoding="utf-8") as f:
    salida = csv.writer(f)
    for archivo, (cliente, columna) in CLIENTES.items():
        it = filas(archivo)
        cab = [texto(c) for c in next(it)]
        dia = cab.index("Día" if "Día" in cab else "Dia")
        mes, anio, cod, cant, op, dest = (cab.index(x) for x in ("Mes", "Año", columna, "Cantidad", "Operación", "Destino"))
        com = next((i for i, x in enumerate(cab) if x in ("Comentario", "Comentarios") and i > op), None)
        cuenta = collections.Counter()
        for n, fila in enumerate(it, 2):
            fila = fila + (None,) * (len(cab) - len(fila))
            codigo, cantidad, oper = texto(fila[cod]), numero(fila[cant]), texto(fila[op])
            fec = fecha(fila[anio], fila[mes], fila[dia])
            if not codigo:
                falta = "sin codigo"
            elif cantidad is None:
                falta = "cantidad invalida"
            elif cantidad == 0:
                falta = "cantidad cero"
            else:
                falta = None if oper else "sin operacion"
            if falta or fec is None:
                motivo = falta or "fecha invalida (se carga sin fecha)"
                revisar.writerow([archivo, n, motivo, "no" if falta else "si", codigo, cantidad, oper, fila[dia], fila[mes], fila[anio]])
                cuenta[falta or "sin fecha"] += 1
            if falta:
                continue
            cuenta["cargables"] += 1
            salida.writerow([
                cliente, operacion_egreso(oper), fec or "", codigo, cantidad, texto(fila[dest])[:500],
                texto(fila[com])[:500] if com is not None else "",
            ])
        print(cliente, dict(cuenta))

NOMBRES = {c.lower(): c for c, _ in CLIENTES.values()} | {"credicoop regular": "Credicoop"}
archivo = "Ingresos_DB unificada.xlsx"
it = filas(archivo)
cab = [texto(c) for c in next(it)]
col = [cab.index(x) for x in (
    "Cliente", "Operación", "Día pedido", "Mes pedido", "Año pedido", "Orden de compra", "Código Cliente", "Cantidad",
    "Origen del pasaje", "Día entrega", "Mes entrega", "Año entrega", "Entregado", "Comentarios",
)]
cuenta = collections.Counter()
with open(os.path.join(OUT, "ingresos.csv"), "w", newline="", encoding="utf-8") as f:
    salida = csv.writer(f)
    for n, fila in enumerate(it, 2):
        fila = fila + (None,) * 20
        cl, op, dp, mp, ap, oc, cod, cant, ori, de, me, ae, ent, com = (fila[i] for i in col)
        cliente, codigo = NOMBRES.get(texto(cl).lower()), texto(cod)
        cantidad, entregado = numero(cant) or 0, numero(ent) or 0
        if not cliente:
            cuenta["otro cliente: " + texto(cl)] += 1
            continue
        if not codigo or not texto(op) or (not cantidad and not entregado):
            cuenta["no cargada"] += 1
            revisar.writerow([archivo, n, "ingreso sin codigo, operacion o cantidad", "no", codigo, cant, op, dp, mp, ap])
            continue
        cuenta["cargables"] += 1
        salida.writerow([
            cliente, texto(op).upper(), fecha(ap, mp, dp) or "", codigo, cantidad, texto(ori)[:250],
            fecha(ae, me, de) or "", entregado, texto(com)[:500], texto(oc)[:250],
        ])
print("Ingresos", dict(cuenta))

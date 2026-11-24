"""Arma costos.csv (una fila por cliente + período + código) desde las planillas de estructura de costo.

Uso: python scripts/migracion-completa/preparar-costos.py <carpeta con los Excel> <carpeta de salida>
No se conecta a ninguna base. Después se carga con cargar-costos.sql. Requiere openpyxl.
Los archivos van de la historia a lo vigente: si un código se repite en el período, gana el último leído.
"""
import collections
import csv
import datetime
import os
import re
import sys
import unicodedata

import openpyxl

sys.stdout.reconfigure(encoding="utf-8")
SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
FUENTES = [  # cliente, archivo, hoja
    ("Amex", "2- Estructura de costo AMEX.xlsm", "Estructura de costo DG (ant)"),
    ("Amex", "HISTORIA 2- Estructura de costo AMEX.xlsx", "Hoja1"),
    ("Amex", "2- Estructura de costo AMEX.xlsm", "Estructura de costo OFED"),
    ("Amex", "2- Estructura de costo AMEX.xlsm", "Estructura de costo DG"),
    ("Credicoop", "HISTORIA 2- Estructura de costo Credicoop.xlsm", "Estructura de Costo"),
    ("Credicoop", "2- Estructura de costo Credicoop.xlsm", "Estructura de Costo"),
    ("Massalin", "Historia 2- Estructura de costo Massalin.xlsm", "Estructura de costo"),
    ("Massalin", "2- Estructura de costo Massalin.xlsm", "Estructura de costo"),
    ("Pampa", "Historia 2- Estructura de costo Pampa.xlsm", "Estructura de costo"),
    ("Pampa", "2- Estructura de costo Pampa.xlsm", "Estructura de costo"),
    ("Santander", "HISTORIA 2- Estructura de costo Santander.xlsx", "Hoja1"),
    ("Santander", "2- Estructura de costo Santander.xlsm", "Estructura de costo"),
    ("Umiles", "HISTORIA 2- Estructura de costo Umiles.xlsx", "Hoja1"),
    ("Umiles", "2- Estructura de costo Umiles.xlsm", "Estructura de Costo"),
    # Producteca agrupa bancos: mismos códigos, otro precio en cada canal.
    ("Producteca/Banco Nación", "2- Estructura de Costo Banco Nacion.xlsm", "Cotizacion"),
    ("Producteca/Provincia", "2- Estructura de Costo Provincia.xlsm", "Cotizacion"),
    ("Producteca/ICBC", "2- Estructura de Costo ICBC.xlsm", "Cotizacion"),
    ("Producteca/Tienda Credicoop", "2- Estructura de Costo Tienda Credicoop.xlsm", "Estructura de Costo"),
]
CAMPOS = {  # campo: nombres posibles del encabezado, ya normalizados
    "fecha": ["fecha", "fecha activacion"], "cod": ["sku", "codigo", "codigo amex", "codigo massalin", "codigo pampa"], "cu": ["codigo unico"],
    "act": ["costo actualizado", "actualizado", "falta actualizar"], "prod": ["producto"], "prov": ["proveedor"],
    "cat": ["categoria"], "pp": ["precio publico sin aumento", "precio publico"], "pp_mas": ["pp +20%"], "iva": ["iva"], "mk": ["mark up"],
    "pp_si": ["pp s/iva sin aumento", "pp s/iva"], "costo": ["costo dg sin iva", "costo dg s/ iva", "costo ofed s/ iva"],
    "seguro": ["seguro", "seguro deposito"], "iibb": ["ing. brutos"], "deb": ["imp. debito"], "cred": ["imp. credito"],
    "flete": ["flete s/iva", "flete"], "total": ["costo total"],
    "pvc": ["pvc sin iva redondeado", "pvc s/ iva redondeado", "pvc sin iva final", "pvc sin iva", "pva actual", "pv actual", "pvc actual", "pvm actual", "pvc"], "pvc_iva": ["pvc con iva redondeado", "pvc cn iva", "pcv final", "pvc con iva"],
    "util": ["utilidad"], "pct": ["%", "margen (%)"], "mis": ["imp. misiones", "imp. mision", "impuesto misiones"],
    "peso": ["peso volumetrico"], "bultos": ["bultos", "bulto"],
    # Cargos propios del canal, se guardan juntos como % del precio de venta sin IVA
    "com1": ["tasas cuotas", "com categoria"], "com2": ["comision tarjeta", "com trans"],
    "com3": ["comision bna", "comision por venta (esquema por categoria) aper"],
}


def texto(valor):
    t = "" if valor is None else re.sub(r"\s+", " ", str(valor).replace("\xa0", " ")).strip()
    return "" if t.startswith("#") else re.sub(r"^(\d+)\.0$", r"\1", t)


def norm(valor):
    t = unicodedata.normalize("NFD", texto(valor).lower())
    return "".join(c for c in t if unicodedata.category(c) != "Mn")


def num(valor):
    if isinstance(valor, bool) or valor is None:
        return 0.0
    try:
        n = float(str(valor).replace(",", "."))
    except ValueError:
        return 0.0
    return n if abs(n) < 1e12 else 0.0


def periodo(valor):
    if isinstance(valor, (int, float)) and 30000 < valor < 60000:
        valor = datetime.datetime(1899, 12, 30) + datetime.timedelta(days=float(valor))
    if isinstance(valor, datetime.datetime) and 2021 <= valor.year <= 2026:
        return valor.year, valor.month
    return None


def porciento(valor):  # IVA: 1,21 o 0,21 son 21 %
    n = num(valor)
    return 0 if n <= 0 else round((n if n < 1 else n - 1) * 100, 2)


def descripcion(valor):  # los avisos de las fórmulas taparían el nombre que la plataforma toma de Productos
    t = texto(valor)
    return "" if norm(t) in ("0", "no encontrado") or norm(t).startswith(("falta cargar", "mas de 4 meses", "revisar archivo")) else t


revisar = csv.writer(open(os.path.join(OUT, "costos-revisar.csv"), "w", newline="", encoding="utf-8-sig"))
revisar.writerow("cliente archivo hoja motivo periodo codigo pvc_anterior pvc_que_queda".split())
filas, iva_de = {}, {}
pct_amex = collections.defaultdict(collections.Counter)
for origen, archivo, hoja in FUENTES:
    cliente, _, canal = origen.partition("/")
    libro = openpyxl.load_workbook(os.path.join(SRC, archivo), read_only=True, data_only=True)
    ws = libro[hoja]
    ws.reset_dimensions()
    cols, cuenta, vistas = None, collections.Counter(), {}
    for fila in ws.iter_rows(values_only=True):
        if cols is None:
            h = [norm(c) for c in fila]
            if ("fecha" in h or "fecha activacion" in h) and "codigo unico" in h:
                cols = {k: next((h.index(a) for a in al if a in h), None) for k, al in CAMPOS.items()}
                faltan = [k for k in ("cod", "cu", "costo", "pvc", "pp", "iva", "util") if cols[k] is None]
                if faltan:
                    sys.exit(f"{archivo} / {hoja}: faltan columnas {faltan}")
            continue
        if not any(c is not None for c in fila):
            continue
        g = lambda k: fila[cols[k]] if cols[k] is not None and cols[k] < len(fila) else None
        per, cod, cu = periodo(g("fecha")), texto(g("cod")), texto(g("cu")).lower()
        if not cod and not cu:
            cuenta["en blanco"] += 1
            continue
        if per is None:
            cuenta["fecha invalida"] += 1
            revisar.writerow([cliente, archivo, hoja, "fecha invalida, no se carga", g("fecha"), cod or cu, "", ""])
            continue
        if not cod or "revisar archivo" in cu or cod in ("0", "No encontrado"):
            cuenta["sin codigo cliente"] += 1
            revisar.writerow([cliente, archivo, hoja, "sin codigo cliente, no se carga", f"{per[0]}-{per[1]:02d}", cu, "", ""])
            continue
        costo, pvc, iva = round(num(g("costo")), 2), round(num(g("pvc")), 2), porciento(g("iva"))
        if iva:
            iva_de[cu] = iva
        else:  # en error en la planilla: el último conocido del producto, o 21 %
            cuenta["iva en error"] += 1
            iva = iva_de.get(cu, 21)
        clave = (cliente, f"{per[0]}-{per[1]:02d}", cod.lower(), canal)
        if costo <= 0 and pvc <= 0:
            cuenta["sin costo ni precio"] += 1
            revisar.writerow([cliente, archivo, hoja, "sin costo ni precio de venta, no se carga", clave[1], cod, "", ""])
            continue
        r = {k: round(num(g(k)), 2) for k in ("pp", "pp_si", "seguro", "iibb", "deb", "cred", "flete", "total", "util", "mis", "peso", "bultos")}
        mk = num(g("mk"))
        if r["total"] <= 0:  # la planilla de Umiles no trae costo total; en otras puede estar en error
            util_ok = isinstance(g("util"), (int, float)) and pvc > 0 and cols["total"] is None
            r["total"] = round(pvc - r["util"], 2) if util_ok else round(sum(r[k] for k in ("seguro", "iibb", "deb", "cred", "flete", "mis")) + costo, 2)
        comision = sum(num(g(k)) for k in ("com1", "com2", "com3")) if canal else 0
        comision_pct = round(comision / pvc * 100, 4) if canal and pvc > 0 and 0 < comision < pvc else ""
        if canal and comision_pct == "":
            cuenta["sin comision del canal"] += 1
        pvc_iva = round(num(g("pvc_iva")), 2) or round(pvc * (1 + (iva or 21) / 100), 2)
        # La utilidad solo vale si hay costo y precio; si no, la planilla muestra error o un número sin sentido.
        util, pct = (r["util"], round(num(g("pct")) * 100, 2)) if costo > 0 and pvc > 0 else (0, 0)
        if clave in vistas and abs(vistas[clave] - pvc) > 0.01:
            cuenta["repetidos con otro precio"] += 1
            revisar.writerow([cliente, archivo, hoja, "codigo repetido en el periodo, queda la ultima fila", clave[1], cod, vistas[clave], pvc])
        elif clave in vistas:
            cuenta["repetidos iguales"] += 1
        elif clave in filas:
            cuenta["pisa historia"] += 1
        vistas[clave] = pvc
        cuenta["leidas"] += 1
        if costo <= 0:
            cuenta["sin costo"] += 1
        if pvc <= 0:
            cuenta["sin precio venta"] += 1
        if cliente == "Amex" and cols["pp_mas"] is not None and r["pp"] > 0 and num(g("pp_mas")) > 0:
            pct_amex[clave[1]][round((num(g("pp_mas")) / r["pp"] - 1) * 100, 1)] += 1
        filas[clave] = [
            cliente, clave[1], per[1], per[0], cod, cu, texto(g("act"))[:50], descripcion(g("prod")), descripcion(g("prov"))[:250], descripcion(g("cat"))[:250],
            r["pp"], iva, round((mk - 1) * 100, 2) if mk > 0 else 0, r["pp_si"], costo, r["seguro"], r["iibb"], r["deb"], r["cred"],
            r["flete"], r["total"], pvc, pvc_iva, util, pct, r["mis"], r["peso"], r["bultos"], "", canal, comision_pct,
        ]
    print(origen, "|", archivo, "|", hoja, dict(cuenta))
    if cols is None:
        sys.exit("No encontré el encabezado")

# Porcentaje Amex del período: el que usa la mayoría de las filas (PP + x % sobre PP).
mejor = {p: c.most_common(1)[0][0] for p, c in pct_amex.items()}
with open(os.path.join(OUT, "costos.csv"), "w", newline="", encoding="utf-8") as f:
    salida = csv.writer(f)
    for clave, fila in filas.items():
        if clave[0] == "Amex":
            fila[28] = mejor.get(clave[1], "")
        salida.writerow(fila)
print("Porcentaje Amex por período", dict(sorted(mejor.items())))
for c in sorted({(k[0], k[3]) for k in filas}):
    meses = collections.Counter(k[1] for k in filas if (k[0], k[3]) == c)
    print(c, sum(meses.values()), "filas de", min(meses), "a", max(meses), "| últimos", sorted(meses.items())[-4:])

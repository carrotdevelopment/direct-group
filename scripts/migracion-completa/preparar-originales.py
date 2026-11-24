"""Arma originales.csv: los datos de las planillas que preparar.py no llevó (certificado, nombre, dirección, etc.),
con la misma clave de cada egreso para unirlos en cargar-originales.sql. TIENE DATOS PERSONALES: no va al repositorio.

Uso: python preparar-originales.py <carpeta con los Excel> <perfiles.json> <carpeta de salida>
perfiles.json: lista de {"c": cliente, "cols": columnas, "map": mapeo} de egresos_perfiles_importacion.
"""
import collections
import csv
import datetime
import json
import os
import re
import sys
import unicodedata

AQUI = os.path.dirname(os.path.abspath(__file__))
_, SRC, PERFILES, SALIDA = sys.argv
# Se usan las mismas funciones de preparar.py, así la clave sale idéntica.
sys.argv = ["preparar.py", SRC, SALIDA]
exec(open(os.path.join(AQUI, "preparar.py"), encoding="utf-8").read().split("revisar = csv.writer")[0])

perfiles = {p["c"]: p for p in json.load(open(PERFILES, encoding="utf-8"))}
EQUIVALE = {  # nombre en la planilla: nombre en el archivo que se sube
    "Pampa": {"Nro de Canje": "Nro. Canje", "Apellido y Nombre": "Nombre", "Nro de Socio": "Socio Nro.", "Tipo Documento Socio": "Tipo Documento", "Nro Documento Socio": "Documento", "PVB": "Precio Venta"},
    "Umiles": {"Nombre y apellido Usuario": "Usuario"},
}
RESERVADAS = {"cliente", "operación", "operacion", "fecha", "codigo_cliente", "codigo_unico", "producto", "cantidad", "destino", "comentarios", "id egreso", "modificado por"}


def plano(x):
    x = x.replace("Â", "")
    x = "".join(c for c in unicodedata.normalize("NFD", x) if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", x.replace("º", "").replace("°", "").lower())


def valor(x):
    if isinstance(x, datetime.datetime):
        return x.strftime("%Y-%m-%d") if x.time() == datetime.time() else x.strftime("%Y-%m-%d %H:%M")
    t = texto(x).replace("\x00", "")
    return "" if t.lower() in ("null", "#n/a", "n/a", "#ref!", "#value!") else t


with open(os.path.join(SALIDA, "originales.csv"), "w", newline="", encoding="utf-8") as f:
    out = csv.writer(f)
    for archivo, (cliente, columna) in CLIENTES.items():
        it = filas(archivo)
        cab = [texto(c) for c in next(it)]
        perfil = perfiles[cliente]
        alias = {c: campo for campo, cs in perfil["map"].items() for c in cs}
        propias = {plano(c): c for c in perfil["cols"] if c}
        dia = cab.index("Día" if "Día" in cab else "Dia")
        mes, anio, cod, cant, op, dest = (cab.index(x) for x in ("Mes", "Año", columna, "Cantidad", "Operación", "Destino"))
        com = next((i for i, x in enumerate(cab) if x in ("Comentario", "Comentarios") and i > op), None)
        usados, nombres = set(), {}
        for i, c in enumerate(cab):
            if not c or i in (dia, mes, anio, cod, cant, op, dest, com) or re.match(r"c[oó]digo [uú]nico|column\d*$", c, re.I):
                continue
            n = EQUIVALE.get(cliente, {}).get(c) or propias.get(plano(c)) or c
            if n != "ID" and plano(n) in ("descripcion", "producto"):
                continue  # ya está el producto
            # Nombres que la plataforma completa con la fecha, el comentario o el destino del egreso: el dato
            # de la planilla va aparte para no pisarlo.
            if n in alias or n.lower() in RESERVADAS:
                n += " (planilla)"
            while n in usados:
                n += " 2"
            usados.add(n)
            nombres[i] = n
        cuenta = collections.Counter()
        for n, fila in enumerate(it, 2):
            fila = fila + (None,) * (len(cab) - len(fila))
            codigo, cantidad, oper = texto(fila[cod]), numero(fila[cant]), texto(fila[op])
            if not codigo or not cantidad or not oper:
                continue
            datos = {nombre: v for i, nombre in nombres.items() if (v := valor(fila[i]))}
            cuenta["filas"] += 1
            if not datos:
                continue
            cuenta["con datos"] += 1
            out.writerow([
                cliente, n, operacion_egreso(oper), fecha(fila[anio], fila[mes], fila[dia]) or "", codigo, cantidad,
                texto(fila[dest])[:500], texto(fila[com])[:500] if com is not None else "", json.dumps(datos, ensure_ascii=False),
            ])
        print(cliente, dict(cuenta), list(nombres.values()))

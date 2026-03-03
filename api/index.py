from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from supabase import create_client, Client
import io
import csv

app = FastAPI()

# ==========================================
# 🔐 CREDENCIALES
# ==========================================
SUPABASE_URL = "https://pkaqgtelkdhxlyjodzbq.supabase.co"
SUPABASE_KEY = "sb_publishable_8F5hCEJTDggd-uus5BKW_Q_891Hr856"

try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception as e:
    print(f"Error Supabase: {e}")

# ==========================================
# 📋 MODELOS
# ==========================================
class TroquelForm(BaseModel):
    id_troquel: str                    # LA MATRÍCULA (Fija)
    ubicacion: str                     # LA ESTANTERÍA (Variable)
    codigos_articulo: Optional[str] = ""
    referencias_ot: Optional[str] = ""
    nombre: str
    categoria_id: Optional[int] = None # TIPO
    familia_id: Optional[int] = None   # FAMILIA
    tamano_troquel: Optional[str] = ""
    tamano_final: Optional[str] = ""
    observaciones: Optional[str] = ""
    enlace_archivo: Optional[str] = ""

class NuevaEntidad(BaseModel):
    nombre: str

class BulkUpdate(BaseModel):
    ids: List[int]
    valor_id: int

class BulkBorrar(BaseModel):
    ids: List[int]

# ==========================================
# 📡 RUTAS GET
# ==========================================
@app.get("/api/categorias")
async def get_cats(): return supabase.table("categorias").select("*").order("nombre").execute().data

@app.get("/api/familias")
async def get_fams(): return supabase.table("familias").select("*").order("nombre").execute().data

@app.get("/api/troqueles")
async def get_troqs():
    # Ordenamos por el ID del troquel (Matrícula) para que sea fácil de buscar visualmente
    return supabase.table("troqueles")\
        .select("*, categorias(nombre), familias(nombre)")\
        .neq("estado_activo", "En Papelera")\
        .order("id_troquel")\
        .execute().data

@app.get("/api/historial")
async def get_hist():
    return supabase.table("historial").select("*, troqueles(id_troquel, nombre)").order("fecha_hora", desc=True).execute().data

# ==========================================
# 💾 RUTAS POST/PUT
# ==========================================
@app.post("/api/categorias")
async def add_cat(d: NuevaEntidad): return supabase.table("categorias").insert({"nombre": d.nombre.upper()}).execute()

@app.post("/api/familias")
async def add_fam(d: NuevaEntidad): return supabase.table("familias").insert({"nombre": d.nombre.upper()}).execute()

@app.post("/api/troqueles")
async def add_troquel(t: TroquelForm):
    d = t.dict()
    d["estado_activo"] = "Activo"
    return supabase.table("troqueles").insert(d).execute()

@app.put("/api/troqueles/{id_db}")
async def edit_troquel(id_db: int, t: TroquelForm):
    return supabase.table("troqueles").update(t.dict()).eq("id", id_db).execute()

@app.post("/api/borrar/{id_db}")
async def soft_delete(id_db: int):
    return supabase.table("troqueles").update({"estado_activo": "En Papelera"}).eq("id", id_db).execute()

# ==========================================
# 📦 RUTAS BULK
# ==========================================
@app.put("/api/troqueles/bulk/categoria")
async def bulk_cat(d: BulkUpdate): return supabase.table("troqueles").update({"categoria_id": d.valor_id}).in_("id", d.ids).execute()

@app.put("/api/troqueles/bulk/familia")
async def bulk_fam(d: BulkUpdate): return supabase.table("troqueles").update({"familia_id": d.valor_id}).in_("id", d.ids).execute()

@app.post("/api/troqueles/bulk/borrar")
async def bulk_del(d: BulkBorrar): return supabase.table("troqueles").update({"estado_activo": "En Papelera"}).in_("id", d.ids).execute()

# ==========================================
# 🧠 CEREBRO IMPORTADOR (MATRÍCULA vs UBICACIÓN)
# ==========================================
def limpiar_txt(txt):
    if not txt: return ""
    return str(txt).strip().upper().replace('.', '').replace('Nº', 'NUMERO')

def buscar_dato(fila, posibles_nombres):
    fila_norm = {limpiar_txt(k): v for k, v in fila.items()}
    for posible in posibles_nombres:
        clave = limpiar_txt(posible)
        if clave in fila_norm and fila_norm[clave]:
            return str(fila_norm[clave]).strip()
    return ""

def get_or_create_categoria(nombre):
    if not nombre: return None
    n = nombre.strip().upper()
    res = supabase.table("categorias").select("id").eq("nombre", n).execute()
    if res.data: return res.data[0]['id']
    new = supabase.table("categorias").insert({"nombre": n}).execute()
    return new.data[0]['id'] if new.data else None

@app.post("/api/importar_csv")
async def importar_csv(file: UploadFile = File(...), tipo_seleccionado: str = Form(...)):
    try:
        content = await file.read()
        
        # 1. Decodificar
        texto = ""
        try: texto = content.decode('utf-8-sig')
        except: 
            try: texto = content.decode('latin-1')
            except: texto = content.decode('cp1252', errors='ignore')

        # 2. Separador
        linea1 = texto.split('\n')[0]
        sep = ';' if linea1.count(';') > linea1.count(',') else ','
        
        f = io.StringIO(texto)
        reader = csv.DictReader(f, delimiter=sep)
        
        cat_id = get_or_create_categoria(tipo_seleccionado)
        filas_db = []
        
        for row in reader:
            # A. BUSCAMOS MATRÍCULA (ID FIJO)
            # Prioridad: 'CODIGO TROQUE'
            matricula = buscar_dato(row, ["CODIGO TROQUE", "CODIGO_TROQUE", "CODIGO", "ID"])
            
            # B. BUSCAMOS UBICACIÓN (ESTANTERIA)
            ubicacion = buscar_dato(row, ["UBICACIÓN", "UBICACION", "ESTANTERIA", "POSICION"])
            
            # CASO ESPECIAL: ARCHIVOS VIEJOS
            # Si no hay matrícula pero hay ubicación, asumimos que en el sistema viejo ID = Ubicación
            if not matricula and ubicacion:
                matricula = ubicacion
            
            # Si después de esto no tenemos matrícula, esa fila no vale
            if not matricula: continue
            
            # Si tenemos matrícula pero no ubicación, ponemos "PENDIENTE"
            if not ubicacion: ubicacion = "PENDIENTE"

            # C. OTROS DATOS
            nombre = buscar_dato(row, ["DESCRIPCIÓN", "DESCRIPCION", "NOMBRE", "ARTICULO"]) or "SIN NOMBRE"
            arts = buscar_dato(row, ["CÓDIGO Artículo", "CODIGO ARTICULO", "REF"])
            ot = buscar_dato(row, ["Número OT", "NUMERO OT", "OT"])
            obs = buscar_dato(row, ["OBSERVACIONES", "NOTAS"])

            nuevo = {
                "id_troquel": matricula,     # EJ: 1341 (No cambia)
                "ubicacion": ubicacion,      # EJ: 13 (Puede cambiar)
                "nombre": nombre,
                "codigos_articulo": arts,
                "referencias_ot": ot,
                "categoria_id": cat_id,
                "familia_id": None,
                "observaciones": obs,
                "estado_activo": "Activo"
            }
            filas_db.append(nuevo)
            
        # 4. Insertar (Upsert por id_troquel para actualizar si ya existe)
        chunk = 50
        for i in range(0, len(filas_db), chunk):
            lote = filas_db[i:i+chunk]
            try:
                supabase.table("troqueles").upsert(lote, on_conflict="id_troquel").execute()
            except Exception as e:
                # Si falla bloque, uno a uno
                for item in lote:
                    try: supabase.table("troqueles").upsert(item, on_conflict="id_troquel").execute()
                    except: pass

        return {"status": "ok", "total": len(filas_db)}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/health")
def health(): return {"status": "ok"}
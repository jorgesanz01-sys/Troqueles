from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Any
from supabase import create_client, Client
import io
import csv
import traceback

app = FastAPI()

# ==========================================
# 🔐 CREDENCIALES
# ==========================================
SUPABASE_URL = "https://pkaqgtelkdhxlyjodzbq.supabase.co"
SUPABASE_KEY = "sb_publishable_8F5hCEJTDggd-uus5BKW_Q_891Hr856"

try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception as e:
    print(f"Error inicial Supabase: {e}")

# ==========================================
# 📋 MODELOS (Flexibles)
# ==========================================
class TroquelForm(BaseModel):
    # Campos opcionales para que no falle si falta alguno
    id_troquel: Optional[str] = ""
    ubicacion: Optional[str] = ""
    nombre: str
    codigos_articulo: Optional[str] = ""
    referencias_ot: Optional[str] = ""
    categoria_id: Optional[int] = None
    familia_id: Optional[int] = None
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
# 📡 RUTAS GET (Seguras)
# ==========================================
@app.get("/api/categorias")
async def get_cats():
    try: return supabase.table("categorias").select("*").order("nombre").execute().data
    except: return []

@app.get("/api/familias")
async def get_fams():
    try: return supabase.table("familias").select("*").order("nombre").execute().data
    except: return []

@app.get("/api/troqueles")
async def get_troqs():
    # INTENTO 1: Cargar con relaciones bonitas (Nombres de categorías y familias)
    try:
        return supabase.table("troqueles")\
            .select("*, categorias(nombre), familias(nombre)")\
            .neq("estado_activo", "En Papelera")\
            .order("id", desc=False)\
            .execute().data
    except Exception as e:
        print(f"Aviso: No se pudieron cargar relaciones ({e}). Cargando modo simple.")
        # INTENTO 2: Cargar datos crudos (Modo Seguro)
        try:
            return supabase.table("troqueles")\
                .select("*")\
                .neq("estado_activo", "En Papelera")\
                .order("id", desc=False)\
                .execute().data
        except Exception as e2:
            print(f"Error crítico: {e2}")
            return []

@app.get("/api/historial")
async def get_hist():
    try: return supabase.table("historial").select("*").order("fecha_hora", desc=True).limit(50).execute().data
    except: return []

# ==========================================
# 💾 RUTAS DE ESCRITURA
# ==========================================
@app.post("/api/categorias")
async def add_cat(d: NuevaEntidad): return supabase.table("categorias").insert({"nombre": d.nombre.upper()}).execute()

@app.post("/api/familias")
async def add_fam(d: NuevaEntidad): 
    try: return supabase.table("familias").insert({"nombre": d.nombre.upper()}).execute()
    except: return {"error": "Tabla familias no existe"}

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
async def bulk_fam(d: BulkUpdate): 
    try: return supabase.table("troqueles").update({"familia_id": d.valor_id}).in_("id", d.ids).execute()
    except: return {"error": "Error actualizando familias"}

@app.post("/api/troqueles/bulk/borrar")
async def bulk_del(d: BulkBorrar): return supabase.table("troqueles").update({"estado_activo": "En Papelera"}).in_("id", d.ids).execute()

# ==========================================
# 🧠 IMPORTADOR CSV (INTELIGENTE)
# ==========================================
def limpiar(t): return str(t).strip().upper().replace('.', '').replace('Nº', 'NUMERO') if t else ""

def buscar(row, keys):
    row_norm = {limpiar(k): v for k, v in row.items()}
    for key in keys:
        k = limpiar(key)
        if k in row_norm and row_norm[k]: return str(row_norm[k]).strip()
    return ""

def get_cat_id(nombre):
    if not nombre: return None
    n = nombre.strip().upper()
    # Intenta buscar/crear categoría. Si falla la tabla, devuelve None
    try:
        res = supabase.table("categorias").select("id").eq("nombre", n).execute()
        if res.data: return res.data[0]['id']
        return supabase.table("categorias").insert({"nombre": n}).execute().data[0]['id']
    except:
        return None

@app.post("/api/importar_csv")
async def importar_csv(file: UploadFile = File(...), tipo_seleccionado: str = Form(...)):
    try:
        content = await file.read()
        try: text = content.decode('utf-8-sig')
        except: text = content.decode('latin-1', errors='ignore')

        line1 = text.split('\n')[0]
        sep = ';' if line1.count(';') > line1.count(',') else ','
        
        reader = csv.DictReader(io.StringIO(text), delimiter=sep)
        cat_id = get_cat_id(tipo_seleccionado)
        filas = []
        
        for row in reader:
            # LÓGICA FLEXIBLE: Busca Ubicación y Matrícula
            ubi = buscar(row, ["UBICACION", "UBICACIÓN", "ESTANTERIA", "POSICION"])
            mat = buscar(row, ["CODIGO TROQUE", "CODIGO", "ID", "MATRICULA"])
            
            # Si no hay matrícula pero hay ubicación, usamos ubicación como matrícula (archivos viejos)
            if not mat and ubi: mat = ubi
            
            # Si no tenemos nada, pasamos
            if not mat and not ubi: continue
            
            if not ubi: ubi = "PENDIENTE"

            nuevo = {
                "id_troquel": mat,           # Matrícula
                "ubicacion": ubi,            # Ubicación
                "nombre": buscar(row, ["DESCRIPCION", "NOMBRE", "ARTICULO"]) or "SIN NOMBRE",
                "codigos_articulo": buscar(row, ["ARTICULO", "REF", "CODIGO ARTICULO"]),
                "referencias_ot": buscar(row, ["OT", "NUMERO OT"]),
                "categoria_id": cat_id,
                "observaciones": buscar(row, ["OBSERVACIONES", "NOTAS"]),
                "estado_activo": "Activo"
            }
            filas.append(nuevo)
            
        chunk = 50
        for i in range(0, len(filas), chunk):
            try: supabase.table("troqueles").upsert(filas[i:i+chunk], on_conflict="id_troquel").execute()
            except Exception as e: print(f"Error lote: {e}")

        return {"status": "ok", "total": len(filas)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/health")
def health(): return {"status": "ok"}
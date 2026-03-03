from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Any
from supabase import create_client, Client
import io
import csv

app = FastAPI()

# ==========================================
# 🔐 CREDENCIALES SUPABASE
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
    # Nota: No pedimos ID porque es SERIAL (Auto) en base de datos
    nombre: str
    ubicacion: str
    codigos_articulo: Optional[str] = ""
    referencias_ot: Optional[str] = ""
    categoria_id: Optional[int] = None # Tipo
    familia_id: Optional[int] = None   # Familia
    tamano_troquel: Optional[str] = ""
    tamano_final: Optional[str] = ""
    observaciones: Optional[str] = ""
    enlace_archivo: Optional[str] = ""
    id_troquel: Optional[str] = "" # Campo legacy por compatibilidad

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
    # Ordenamos por ID (correlativo interno)
    return supabase.table("troqueles")\
        .select("*, categorias(nombre), familias(nombre)")\
        .neq("estado_activo", "En Papelera")\
        .order("id", desc=False)\
        .execute().data

@app.get("/api/historial")
async def get_hist():
    return supabase.table("historial").select("*, troqueles(nombre, ubicacion)").order("fecha_hora", desc=True).execute().data

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
    # Si id_troquel viene vacío, usamos la ubicación como referencia visual
    if not d.get("id_troquel"): d["id_troquel"] = d["ubicacion"]
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
# 🧠 CEREBRO IMPORTADOR (VERSION FINAL)
# ==========================================
def limpiar_txt(txt):
    if not txt: return ""
    return str(txt).strip().upper().replace('.', '').replace('Nº', 'NUMERO')

def buscar_dato(fila, posibles_nombres):
    """Busca en el dict de la fila (CSV) alguna de las claves posibles."""
    # Normalizamos las claves del CSV
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
        
        # 1. Detectar codificación (Prueba y error)
        texto = ""
        try: texto = content.decode('utf-8-sig')
        except: 
            try: texto = content.decode('latin-1')
            except: texto = content.decode('cp1252', errors='ignore')

        # 2. Detectar separador inteligente
        linea1 = texto.split('\n')[0]
        if linea1.count(';') > linea1.count(','): sep = ';'
        elif linea1.count('\t') > 0: sep = '\t'
        else: sep = ','
        
        f = io.StringIO(texto)
        reader = csv.DictReader(f, delimiter=sep)
        
        # 3. Preparar datos fijos
        cat_id = get_or_create_categoria(tipo_seleccionado)
        filas_db = []
        
        for row in reader:
            # A. UBICACIÓN (Obligatoria o deducida)
            ubi = buscar_dato(row, ["UBICACIÓN", "UBICACION", "POSICION", "ESTANTERIA"])
            # Si no hay ubicación, miramos si hay un código antiguo que sirva
            if not ubi: ubi = buscar_dato(row, ["CODIGO TROQUE", "CODIGO", "ID"])
            
            if not ubi: continue # Si no hay ni ubicación ni código, saltamos

            # B. NOMBRE / DESCRIPCION
            nombre = buscar_dato(row, ["DESCRIPCIÓN", "DESCRIPCION", "NOMBRE", "ARTICULO"])
            if not nombre: nombre = "SIN DESCRIPCIÓN"

            # C. ARTÍCULOS Y OTROS CÓDIGOS
            arts = buscar_dato(row, ["CÓDIGO Artículo", "CODIGO ARTICULO", "REF"])
            cod_extra = buscar_dato(row, ["CODIGO TROQUE", "CODIGO"])
            
            # Si el "código extra" no es la ubicación, lo guardamos como referencia
            if cod_extra and cod_extra != ubi:
                if arts: arts = f"{cod_extra} - {arts}"
                else: arts = cod_extra

            # CREAMOS EL OBJETO (Sin ID, es automático)
            nuevo = {
                "nombre": nombre,
                "ubicacion": ubi,            # Ej: "1", "A-50"
                "id_troquel": ubi,           # Guardamos la ubicación también aquí por compatibilidad visual
                "codigos_articulo": arts,
                "referencias_ot": buscar_dato(row, ["Número OT", "NUMERO OT", "OT"]),
                "categoria_id": cat_id,      # El tipo seleccionado en la web
                "observaciones": buscar_dato(row, ["OBSERVACIONES", "NOTAS"]),
                "estado_activo": "Activo"
            }
            filas_db.append(nuevo)
            
        # 4. Inserción Masiva (INSERT puro para no fallar por duplicados de clave)
        # Se generarán nuevos IDs correlativos internos (100, 101...)
        chunk = 50
        for i in range(0, len(filas_db), chunk):
            lote = filas_db[i:i+chunk]
            try:
                supabase.table("troqueles").insert(lote).execute()
            except Exception as e:
                print(f"Error insertando lote {i}: {e}")
                # Reintento uno a uno si falla el lote
                for item in lote:
                    try: supabase.table("troqueles").insert(item).execute()
                    except: pass

        return {"status": "ok", "total": len(filas_db)}

    except Exception as e:
        print(f"Error Fatal Importación: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/health")
def health(): return {"status": "ok"}
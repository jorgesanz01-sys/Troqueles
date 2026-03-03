from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from supabase import create_client, Client
import io
import csv

app = FastAPI()

# ==========================================
# 🔐 TUS CREDENCIALES
# ==========================================
SUPABASE_URL = "https://pkaqgtelkdhxlyjodzbq.supabase.co"
SUPABASE_KEY = "sb_publishable_8F5hCEJTDggd-uus5BKW_Q_891Hr856"

try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception as e:
    print(f"Error crítico conectando a Supabase: {e}")

# ==========================================
# 📋 MODELOS DE DATOS
# ==========================================
class TroquelForm(BaseModel):
    # Ya no pedimos id_troquel manual, usaremos el ID numérico de la base de datos
    codigos_articulo: Optional[str] = ""  
    referencias_ot: Optional[str] = ""    
    nombre: str
    ubicacion: str                     # La "estantería" (ej: 1, 2, A-01...)
    categoria_id: Optional[int] = None # EL TIPO (Normal, Pequeño...)
    familia_id: Optional[int] = None   # LA FAMILIA (Caja, Carpeta...)
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
# 📡 RUTAS DE LECTURA (GET)
# ==========================================
@app.get("/api/categorias") # TIPOS
async def listar_categorias():
    return supabase.table("categorias").select("*").order("nombre").execute().data

@app.get("/api/familias") # FAMILIAS
async def listar_familias():
    return supabase.table("familias").select("*").order("nombre").execute().data

@app.get("/api/troqueles")
async def listar_troqueles():
    # Ordenamos por ID numérico (creación)
    return supabase.table("troqueles")\
        .select("*, categorias(nombre), familias(nombre)")\
        .neq("estado_activo", "En Papelera")\
        .order("id")\
        .execute().data

@app.get("/api/historial")
async def listar_historial():
    # En el historial mostramos el nombre y la ubicación
    return supabase.table("historial")\
        .select("*, troqueles(nombre, ubicacion)")\
        .order("fecha_hora", desc=True)\
        .execute().data

# ==========================================
# 💾 RUTAS DE ESCRITURA (POST/PUT)
# ==========================================
@app.post("/api/categorias")
async def crear_categoria(dato: NuevaEntidad):
    return supabase.table("categorias").insert({"nombre": dato.nombre.upper()}).execute()

@app.post("/api/familias")
async def crear_familia(dato: NuevaEntidad):
    return supabase.table("familias").insert({"nombre": dato.nombre.upper()}).execute()

@app.post("/api/troqueles")
async def crear_troquel(troquel: TroquelForm):
    datos = troquel.dict()
    datos["estado_activo"] = "Activo"
    # No enviamos ID, dejamos que Supabase genere el correlativo (1, 2, 3...)
    return supabase.table("troqueles").insert(datos).execute()

@app.put("/api/troqueles/{id_db}")
async def editar_troquel(id_db: int, troquel: TroquelForm):
    return supabase.table("troqueles").update(troquel.dict()).eq("id", id_db).execute()

@app.post("/api/borrar/{id_db}")
async def mover_a_papelera(id_db: int):
    return supabase.table("troqueles").update({"estado_activo": "En Papelera"}).eq("id", id_db).execute()

# ==========================================
# 📦 RUTAS MASIVAS (BULK)
# ==========================================
@app.put("/api/troqueles/bulk/categoria")
async def bulk_categoria(data: BulkUpdate):
    return supabase.table("troqueles").update({"categoria_id": data.valor_id}).in_("id", data.ids).execute()

@app.put("/api/troqueles/bulk/familia")
async def bulk_familia(data: BulkUpdate):
    return supabase.table("troqueles").update({"familia_id": data.valor_id}).in_("id", data.ids).execute()

@app.post("/api/troqueles/bulk/borrar")
async def bulk_borrar(data: BulkBorrar):
    return supabase.table("troqueles").update({"estado_activo": "En Papelera"}).in_("id", data.ids).execute()

# ==========================================
# 🧠 IMPORTADOR INTELIGENTE (LOGICA NUEVA)
# ==========================================
def limpiar_header(h): 
    return h.strip().upper().replace('.', '').replace('Nº', 'NUMERO').replace('Ó', 'O').replace('Í', 'I')

def get_col(row_dict, candidatos):
    row_norm = {limpiar_header(k): v for k, v in row_dict.items() if k}
    for c in candidatos:
        c_norm = limpiar_header(c)
        if c_norm in row_norm and row_norm[c_norm]: 
            return str(row_norm[c_norm]).strip()
    return ""

def obtener_id_tipo(nombre_tipo):
    if not nombre_tipo: return None
    nombre = nombre_tipo.upper().strip()
    res = supabase.table("categorias").select("id").eq("nombre", nombre).execute()
    if res.data: return res.data[0]['id']
    new = supabase.table("categorias").insert({"nombre": nombre}).execute()
    return new.data[0]['id'] if new.data else None

@app.post("/api/importar_csv")
async def importar_csv(file: UploadFile = File(...), tipo_seleccionado: str = Form(...)):
    try:
        content = await file.read()
        try: text = content.decode('utf-8-sig')
        except: text = content.decode('latin-1')
        
        line1 = text.split('\n')[0]
        sep = ';' if line1.count(';') > line1.count(',') else ','
        f = io.StringIO(text)
        reader = csv.DictReader(f, delimiter=sep)
        
        # 1. Obtenemos el ID del TIPO seleccionado (ej: "PEQUEÑOS")
        cat_id = obtener_id_tipo(tipo_seleccionado)
        
        filas_para_insertar = []
        
        for row in reader:
            # 2. La Ubicación es sagrada. Buscamos esa columna.
            ubi = get_col(row, ["UBICACIÓN", "UBICACION", "ESTANTERIA", "POSICION"])
            if not ubi: 
                # Si no hay columna ubicación, a lo mejor es el código antiguo
                ubi = get_col(row, ["CODIGO TROQUE", "CODIGO", "ID"])
            
            if not ubi: continue # Si no hay ubicación, no sirve.

            # 3. Recopilar Artículos (Campo grande)
            c_arts = get_col(row, ["CÓDIGO Artículo", "CODIGO ARTICULO", "REF"])
            c_extra = get_col(row, ["CODIGO TROQUE"])
            
            arts_final = c_arts
            # Si hay un código extra y es distinto a la ubicación, lo guardamos como artículo también
            if c_extra and c_extra != ubi and c_extra not in c_arts:
                if arts_final: arts_final = f"{c_extra} - {arts_final}"
                else: arts_final = c_extra

            nuevo_registro = {
                # NO ENVIAMOS 'id'. Dejamos que Supabase cree el correlativo (1, 2, 3...)
                "nombre": get_col(row, ["DESCRIPCIÓN", "DESCRIPCION", "NOMBRE"]),
                "codigos_articulo": arts_final,
                "referencias_ot": get_col(row, ["Número OT", "NUMERO OT", "OT"]),
                "ubicacion": ubi,            # Aquí va el "1", "2", "A5"...
                "categoria_id": cat_id,      # Aquí va el ID de "PEQUEÑOS"
                "familia_id": None,          # Pendiente de asignar en web
                "observaciones": get_col(row, ["OBSERVACIONES", "NOTAS"]),
                "estado_activo": "Activo"
            }
            filas_para_insertar.append(nuevo_registro)
            
        # 4. Insertar (Solo Insertar, para generar nuevos IDs correlativos)
        chunk_size = 100
        for i in range(0, len(filas_para_insertar), chunk_size):
            chunk = filas_para_insertar[i:i+chunk_size]
            try: 
                supabase.table("troqueles").insert(chunk).execute()
            except Exception as e:
                print(f"Error insertando bloque {i}: {e}")

        return {"status": "ok", "total_importados": len(filas_para_insertar)}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/health")
def health(): return {"status": "ok"}
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
    id_troquel: str
    codigos_articulo: Optional[str] = ""  
    referencias_ot: Optional[str] = ""    
    nombre: str
    ubicacion: str
    categoria_id: Optional[int] = None # TIPO (Normal, Pequeño, Expulsor...)
    familia_id: Optional[int] = None   # FAMILIA (Caja, Carpeta, Puzzles...)
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
    # Traemos todo + nombres de tablas relacionadas
    return supabase.table("troqueles")\
        .select("*, categorias(nombre), familias(nombre)")\
        .neq("estado_activo", "En Papelera")\
        .order("id_troquel")\
        .execute().data

@app.get("/api/historial")
async def listar_historial():
    return supabase.table("historial")\
        .select("*, troqueles(id_troquel, nombre)")\
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
# 🧠 CEREBRO IMPORTADOR INTELIGENTE
# ==========================================
def limpiar_header(h): 
    # Normaliza nombres de columnas para evitar errores por tildes o mayúsculas
    return h.strip().upper().replace('.', '').replace('Nº', 'NUMERO').replace('Ó', 'O').replace('Í', 'I')

def get_col(row_dict, candidatos):
    # Busca en el diccionario de la fila usando varias claves posibles
    row_norm = {limpiar_header(k): v for k, v in row_dict.items() if k}
    for c in candidatos:
        c_norm = limpiar_header(c)
        if c_norm in row_norm and row_norm[c_norm]: 
            return str(row_norm[c_norm]).strip()
    return ""

def obtener_id_tipo(nombre_tipo):
    """Busca ID de Categoría (Tipo) o la crea si no existe"""
    if not nombre_tipo: return None
    nombre = nombre_tipo.upper().strip()
    res = supabase.table("categorias").select("id").eq("nombre", nombre).execute()
    if res.data: return res.data[0]['id']
    # Crear si no existe
    new = supabase.table("categorias").insert({"nombre": nombre}).execute()
    return new.data[0]['id'] if new.data else None

@app.post("/api/importar_csv")
async def importar_csv(file: UploadFile = File(...), tipo_seleccionado: str = Form(...)):
    try:
        content = await file.read()
        
        # 1. Intentar decodificar (UTF-8 o Latin-1 para Excel España)
        try: text = content.decode('utf-8-sig')
        except: text = content.decode('latin-1')
        
        # 2. Detectar separador (; o ,)
        line1 = text.split('\n')[0]
        sep = ';' if line1.count(';') > line1.count(',') else ','
        
        f = io.StringIO(text)
        reader = csv.DictReader(f, delimiter=sep)
        
        # 3. Obtener ID del Tipo seleccionado (ej: "TROQUELES PEQUEÑOS")
        cat_id = obtener_id_tipo(tipo_seleccionado)
        
        filas_para_insertar = []
        
        for row in reader:
            # LÓGICA DE ORO: ID = UBICACIÓN
            # Buscamos la columna ubicación
            id_t = get_col(row, ["UBICACIÓN", "UBICACION", "ESTANTERIA", "POSICION"])
            
            # Si no hay ubicación, intentamos con código troquel como plan B
            if not id_t: id_t = get_col(row, ["CODIGO TROQUE", "CODIGO", "ID"])
            
            # Si sigue sin haber ID, saltamos la línea (fila vacía)
            if not id_t: continue

            # Recopilar Artículos (A veces están en "CODIGO TROQUE" en los CSV nuevos)
            c_arts = get_col(row, ["CÓDIGO Artículo", "CODIGO ARTICULO", "REF"])
            c_extra = get_col(row, ["CODIGO TROQUE"])
            
            # Si "CODIGO TROQUE" existe y no es igual a la Ubicación (ID), es un dato útil (artículo o ref)
            arts_final = c_arts
            if c_extra and c_extra != id_t:
                if arts_final: arts_final = f"{c_extra} - {arts_final}"
                else: arts_final = c_extra

            nuevo_registro = {
                "id_troquel": id_t,          # El ID es la Ubicación
                "nombre": get_col(row, ["DESCRIPCIÓN", "DESCRIPCION", "NOMBRE"]),
                "codigos_articulo": arts_final,
                "referencias_ot": get_col(row, ["Número OT", "NUMERO OT", "OT"]),
                "ubicacion": id_t,           # La ubicación física es el mismo ID
                "categoria_id": cat_id,      # Asignamos el TIPO seleccionado en la web
                "familia_id": None,          # La FAMILIA se asignará después (Bulk)
                "observaciones": get_col(row, ["OBSERVACIONES", "NOTAS"]),
                "estado_activo": "Activo"
            }
            filas_para_insertar.append(nuevo_registro)
            
        # 4. Inserción masiva segura (bloques de 100)
        chunk_size = 100
        for i in range(0, len(filas_para_insertar), chunk_size):
            chunk = filas_para_insertar[i:i+chunk_size]
            try:
                # Upsert: Si existe el ID (Ubicación), actualiza. Si no, crea.
                supabase.table("troqueles").upsert(chunk, on_conflict="id_troquel").execute()
            except Exception as e_chunk:
                print(f"Error en bloque {i}: {e_chunk}")
                # Fallback: intentar 1 a 1 si falla el bloque
                for item in chunk:
                    try: supabase.table("troqueles").upsert(item, on_conflict="id_troquel").execute()
                    except: pass

        return {"status": "ok", "total_importados": len(filas_para_insertar)}

    except Exception as e:
        print(f"Error importación: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/health")
def health(): return {"status": "ok"}
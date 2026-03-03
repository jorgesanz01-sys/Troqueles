from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from supabase import create_client, Client
import io
import csv

app = FastAPI()

# ==========================================
# TUS CREDENCIALES
# ==========================================
SUPABASE_URL = "https://pkaqgtelkdhxlyjodzbq.supabase.co"
SUPABASE_KEY = "sb_publishable_8F5hCEJTDggd-uus5BKW_Q_891Hr856"

try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception as e:
    print(f"Error conectando a Supabase: {e}")

# ==========================================
# MODELOS
# ==========================================
class TroquelForm(BaseModel):
    id_troquel: str
    codigos_articulo: Optional[str] = ""  
    referencias_ot: Optional[str] = ""    
    nombre: str
    ubicacion: str
    categoria_id: Optional[int] = None
    tamano_troquel: Optional[str] = ""
    tamano_final: Optional[str] = ""
    observaciones: Optional[str] = ""
    enlace_archivo: Optional[str] = ""

class NuevaCategoria(BaseModel):
    nombre: str

class BulkCategoria(BaseModel):
    ids: List[int]
    categoria_id: int

class BulkBorrar(BaseModel):
    ids: List[int]

# ==========================================
# RUTAS DE LECTURA
# ==========================================
@app.get("/api/categorias")
async def listar_categorias():
    return supabase.table("categorias").select("*").order("nombre").execute().data

@app.get("/api/troqueles")
async def listar_troqueles():
    return supabase.table("troqueles").select("*, categorias(nombre)").neq("estado_activo", "En Papelera").order("id_troquel").execute().data

@app.get("/api/historial")
async def listar_historial():
    return supabase.table("historial").select("*, troqueles(id_troquel, nombre)").order("fecha_hora", desc=True).execute().data

# ==========================================
# RUTAS DE ESCRITURA
# ==========================================
@app.post("/api/categorias")
async def crear_categoria(cat: NuevaCategoria):
    return supabase.table("categorias").insert({"nombre": cat.nombre.upper()}).execute()

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

@app.put("/api/troqueles/bulk/categoria")
async def bulk_update_categoria(data: BulkCategoria):
    return supabase.table("troqueles").update({"categoria_id": data.categoria_id}).in_("id", data.ids).execute()

@app.post("/api/troqueles/bulk/borrar")
async def bulk_borrar(data: BulkBorrar):
    return supabase.table("troqueles").update({"estado_activo": "En Papelera"}).in_("id", data.ids).execute()

# ==========================================
# IMPORTADOR LÓGICA: UBICACIÓN = ID
# ==========================================
def limpiar_header(h):
    return h.strip().upper().replace('.', '').replace('Nº', 'NUMERO')

def get_col(row_dict, candidatos):
    row_norm = {limpiar_header(k): v for k, v in row_dict.items() if k}
    for c in candidatos:
        c_norm = limpiar_header(c)
        if c_norm in row_norm and row_norm[c_norm]:
            return str(row_norm[c_norm]).strip()
    return ""

def obtener_o_crear_categoria(nombre_cat):
    """Busca el ID de una categoría, si no existe la crea."""
    nombre_cat = nombre_cat.upper().strip()
    if not nombre_cat: return None
    
    # 1. Buscar si existe
    res = supabase.table("categorias").select("id").eq("nombre", nombre_cat).execute()
    if res.data and len(res.data) > 0:
        return res.data[0]['id']
    
    # 2. Si no, crearla
    res_new = supabase.table("categorias").insert({"nombre": nombre_cat}).execute()
    if res_new.data:
        return res_new.data[0]['id']
    return None

@app.post("/api/importar_csv")
async def importar_csv(file: UploadFile = File(...), categoria_nombre: str = Form(...)):
    try:
        content = await file.read()
        
        # 1. Detectar codificación
        try: text = content.decode('utf-8-sig')
        except: text = content.decode('latin-1')

        # 2. Detectar separador
        line1 = text.split('\n')[0]
        sep = ';' if line1.count(';') > line1.count(',') else ','
        
        f = io.StringIO(text)
        reader = csv.DictReader(f, delimiter=sep)
        
        # 3. Obtener el ID de la categoría seleccionada (Normal, Pequeño, etc.)
        cat_id = obtener_o_crear_categoria(categoria_nombre)
        
        filas = []
        for row in reader:
            # LÓGICA MAESTRA: ID ES SIEMPRE LA UBICACIÓN
            id_t = get_col(row, ["UBICACIÓN", "UBICACION", "ESTANTERIA"])
            
            # Si no hay ubicación, intentamos buscar "CODIGO TROQUE" por si acaso
            if not id_t:
                id_t = get_col(row, ["CODIGO TROQUE", "CODIGO_TROQUE", "ID"])
            
            if not id_t: continue # Sin ID no somos nadie

            # Resto de campos
            nombre = get_col(row, ["DESCRIPCIÓN", "DESCRIPCION", "NOMBRE"])
            
            # Artículos: A veces está en 'CODIGO ARTICULO' y a veces en 'CODIGO TROQUE' (en archivos nuevos)
            # Vamos a juntar todo lo que parezca un código
            c1 = get_col(row, ["CÓDIGO Artículo", "CODIGO ARTICULO", "REF"])
            c2 = get_col(row, ["CODIGO TROQUE"])
            
            # Si c2 (codigo troque) es distinto al ID (ubicación), probablemente es un código de artículo o referencia interna
            cods_final = c1
            if c2 and c2 != id_t and c2 not in c1:
                if cods_final: cods_final += f" - {c2}"
                else: cods_final = c2

            ot = get_col(row, ["Número OT", "NUMERO OT", "OT"])
            obs = get_col(row, ["OBSERVACIONES", "NOTAS"])

            nuevo = {
                "id_troquel": id_t,        # El ID es la ubicación
                "nombre": nombre,
                "codigos_articulo": cods_final,
                "referencias_ot": ot,
                "ubicacion": id_t,         # La ubicación física ES el ID
                "categoria_id": cat_id,    # Asignamos el Tipo (Pequeño, Expulsor...)
                "observaciones": obs,
                "estado_activo": "Activo"
            }
            filas.append(nuevo)
            
        # 4. Insertar (Upsert)
        chunk_size = 100
        for i in range(0, len(filas), chunk_size):
            bloque = filas[i:i+chunk_size]
            try:
                supabase.table("troqueles").upsert(bloque, on_conflict="id_troquel").execute()
            except Exception as e:
                print(f"Error bloque {i}: {e}")
                for item in bloque:
                    try: supabase.table("troqueles").upsert(item, on_conflict="id_troquel").execute()
                    except: pass

        return {"status": "ok", "total_importados": len(filas)}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/health")
def health(): return {"status": "ok"}
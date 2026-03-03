from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from supabase import create_client, Client
import io
import csv

app = FastAPI()

# ==========================================
# CONFIGURACIÓN DE BASE DE DATOS
# ==========================================
SUPABASE_URL = "https://pkaqgtelkdhxlyjodzbq.supabase.co"
SUPABASE_KEY = "sb_publishable_8F5hCEJTDggd-uus5BKW_Q_891Hr856"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ==========================================
# MODELOS DE DATOS
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
# RUTAS DE LECTURA (GET)
# ==========================================
@app.get("/api/categorias")
async def listar_categorias():
    response = supabase.table("categorias").select("*").order("nombre").execute()
    return response.data

@app.get("/api/troqueles")
async def listar_troqueles():
    response = supabase.table("troqueles")\
        .select("*, categorias(nombre)")\
        .neq("estado_activo", "En Papelera")\
        .order("id_troquel")\
        .execute()
    return response.data

@app.get("/api/historial")
async def listar_historial():
    response = supabase.table("historial")\
        .select("*, troqueles(id_troquel, nombre)")\
        .order("fecha_hora", desc=True)\
        .execute()
    return response.data

# ==========================================
# RUTAS DE ESCRITURA (POST/PUT)
# ==========================================
@app.post("/api/categorias")
async def crear_categoria(cat: NuevaCategoria):
    response = supabase.table("categorias").insert({"nombre": cat.nombre.upper()}).execute()
    return {"status": "success", "data": response.data}

@app.post("/api/troqueles")
async def crear_troquel(troquel: TroquelForm):
    nuevo_dato = troquel.dict()
    nuevo_dato["estado_activo"] = "Activo"
    response = supabase.table("troqueles").insert(nuevo_dato).execute()
    return {"status": "success", "data": response.data}

@app.put("/api/troqueles/{id_db}")
async def editar_troquel(id_db: int, troquel: TroquelForm):
    datos_actualizados = troquel.dict()
    response = supabase.table("troqueles").update(datos_actualizados).eq("id", id_db).execute()
    return {"status": "success", "data": response.data}

@app.post("/api/borrar/{id_db}")
async def mover_a_papelera(id_db: int):
    response = supabase.table("troqueles").update({"estado_activo": "En Papelera"}).eq("id", id_db).execute()
    return {"status": "success"}

# ==========================================
# RUTAS DE ACCIONES MASIVAS
# ==========================================
@app.put("/api/troqueles/bulk/categoria")
async def bulk_update_categoria(data: BulkCategoria):
    response = supabase.table("troqueles").update({"categoria_id": data.categoria_id}).in_("id", data.ids).execute()
    return {"status": "success"}

@app.post("/api/troqueles/bulk/borrar")
async def bulk_borrar(data: BulkBorrar):
    response = supabase.table("troqueles").update({"estado_activo": "En Papelera"}).in_("id", data.ids).execute()
    return {"status": "success"}

# ==========================================
# NUEVA RUTA: IMPORTAR CSV VIEJO
# ==========================================
@app.post("/api/importar_csv")
async def importar_csv(file: UploadFile = File(...)):
    try:
        # Leer el contenido del archivo subido
        contenido = await file.read()
        texto_csv = contenido.decode('utf-8')
        
        # Usar la librería CSV de Python para parsear correctamente
        f = io.StringIO(texto_csv)
        reader = csv.DictReader(f)
        
        lista_para_insertar = []
        
        for row in reader:
            # Mapeamos las columnas de tu Excel Viejo a la Base de Datos Nueva
            # Tu Excel tiene: UBICACIÓN, DESCRIPCIÓN, CÓDIGO Artículo, Número OT
            
            # Limpieza básica de la ID antigua
            id_viejo = row.get('UBICACIÓN', '').strip()
            
            # Si no tiene ID (fila vacía), la saltamos
            if not id_viejo: 
                continue 
            
            nuevo_troquel = {
                "id_troquel": id_viejo,  # El número viejo (1, 2, 3...) pasa a ser el QR
                "nombre": row.get('DESCRIPCIÓN', '').strip(),
                "codigos_articulo": row.get('CÓDIGO Artículo', '').strip(),
                "referencias_ot": row.get('Número OT', '').strip(),
                "ubicacion": "PENDIENTE", # Lo marcamos para revisar luego
                "estado_activo": "Activo"
            }
            lista_para_insertar.append(nuevo_troquel)
            
        # Insertar en bloques de 100 para no saturar
        chunk_size = 100
        for i in range(0, len(lista_para_insertar), chunk_size):
            chunk = lista_para_insertar[i:i + chunk_size]
            # upsert=True significa que si ya existe el ID, lo actualiza
            supabase.table("troqueles").upsert(chunk, on_conflict="id_troquel").execute()
            
        return {"status": "success", "total": len(lista_para_insertar)}
        
    except Exception as e:
        print("Error importando:", e)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/health")
def health():
    return {"status": "ok", "sistema": "ERP Packaging"}
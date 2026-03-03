from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from supabase import create_client, Client
import io
import csv
import codecs

app = FastAPI()

# ==========================================
# CONFIGURACIÓN DE BASE DE DATOS
# ==========================================
# !!! REVISA QUE ESTAS SEAN TUS CREDENCIALES !!!
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
    return supabase.table("categorias").select("*").order("nombre").execute().data

@app.get("/api/troqueles")
async def listar_troqueles():
    return supabase.table("troqueles").select("*, categorias(nombre)").neq("estado_activo", "En Papelera").order("id_troquel").execute().data

@app.get("/api/historial")
async def listar_historial():
    return supabase.table("historial").select("*, troqueles(id_troquel, nombre)").order("fecha_hora", desc=True).execute().data

# ==========================================
# RUTAS DE ESCRITURA (POST/PUT)
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

# ==========================================
# RUTAS DE ACCIONES MASIVAS
# ==========================================
@app.put("/api/troqueles/bulk/categoria")
async def bulk_update_categoria(data: BulkCategoria):
    return supabase.table("troqueles").update({"categoria_id": data.categoria_id}).in_("id", data.ids).execute()

@app.post("/api/troqueles/bulk/borrar")
async def bulk_borrar(data: BulkBorrar):
    return supabase.table("troqueles").update({"estado_activo": "En Papelera"}).in_("id", data.ids).execute()

# ==========================================
# DETECTOR INTELIGENTE DE COLUMNAS
# ==========================================
def buscar_valor(row, posibles_nombres):
    """Busca el valor en la fila probando varios nombres de columna"""
    # Normalizamos las claves del CSV (quitamos espacios extra y pasamos a mayúsculas para comparar)
    row_clean = {k.strip().upper(): v for k, v in row.items() if k}
    
    for nombre in posibles_nombres:
        nombre_upper = nombre.upper()
        if nombre_upper in row_clean:
            valor = row_clean[nombre_upper]
            if valor and valor.strip():
                return valor.strip()
    return ""

@app.post("/api/importar_csv")
async def importar_csv(file: UploadFile = File(...)):
    try:
        content = await file.read()
        # Decodificar quitando el BOM si existe (utf-8-sig)
        text = content.decode("utf-8-sig")
        f = io.StringIO(text)
        
        # Detectar el dialecto (separador ; o ,) automáticamente
        try:
            dialect = csv.Sniffer().sniff(text[:1024])
            reader = csv.DictReader(f, dialect=dialect)
        except:
            # Si falla, intentamos por defecto con comas
            f.seek(0)
            reader = csv.DictReader(f)
        
        lista_para_insertar = []
        
        for row in reader:
            # --- MAPEO INTELIGENTE ---
            # 1. ID DEL TROQUEL (QR)
            # Prioridad: 'CODIGO TROQUE' (nuevos) > 'UBICACIÓN' (viejos) > 'ID'
            id_t = buscar_valor(row, ["CODIGO TROQUE", "CODIGO_TROQUE", "UBICACIÓN", "UBICACION", "ID", "CODIGO"])
            
            # Si no encontramos ID, saltamos la fila (puede ser una fila vacía o de totales)
            if not id_t: continue

            # 2. NOMBRE / DESCRIPCIÓN
            nombre = buscar_valor(row, ["DESCRIPCIÓN", "DESCRIPCION", "NOMBRE", "ARTICULO"])
            
            # 3. CÓDIGOS DE ARTÍCULO
            codigos = buscar_valor(row, ["CÓDIGO Artículo", "CODIGO ARTICULO", "CODIGO_ARTICULO", "REF"])
            
            # 4. REFERENCIAS OT
            ot = buscar_valor(row, ["Número OT", "NUMERO OT", "OT", "Nº OT"])
            
            # 5. OBSERVACIONES
            obs = buscar_valor(row, ["OBSERVACIONES", "NOTAS", "COMENTARIOS"])

            # 6. UBICACIÓN FÍSICA
            # En los nuevos CSV, la ubicación a veces viene en "UBICACIÓN" pero a veces es el ID.
            # Si usamos 'UBICACIÓN' como ID, marcamos la ubicación física como "PENDIENTE"
            # Si tenemos 'CODIGO TROQUE', entonces 'UBICACIÓN' es la estantería real.
            ubi_real = "PENDIENTE"
            val_ubi = buscar_valor(row, ["UBICACIÓN", "UBICACION"])
            
            # Si el ID que hemos cogido NO es el valor de ubicación, entonces el valor de ubicación es real
            if val_ubi and val_ubi != id_t:
                ubi_real = val_ubi

            nuevo_troquel = {
                "id_troquel": id_t,
                "nombre": nombre,
                "codigos_articulo": codigos,
                "referencias_ot": ot,
                "ubicacion": ubi_real,
                "observaciones": obs,
                "estado_activo": "Activo"
            }
            lista_para_insertar.append(nuevo_troquel)
            
        # Insertar en bloques de 100 para velocidad y seguridad
        chunk_size = 100
        for i in range(0, len(lista_para_insertar), chunk_size):
            chunk = lista_para_insertar[i:i + chunk_size]
            # upsert=True: Si el ID ya existe, actualiza los datos. Si no, lo crea.
            supabase.table("troqueles").upsert(chunk, on_conflict="id_troquel").execute()
            
        return {"status": "ok", "total_importados": len(lista_para_insertar)}
        
    except Exception as e:
        print(f"Error importación: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error procesando CSV: {str(e)}")

@app.get("/api/health")
def health():
    return {"status": "ok", "sistema": "ERP Packaging"}
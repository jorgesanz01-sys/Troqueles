from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from supabase import create_client, Client
import io
import csv

app = FastAPI()

# ==========================================
# CREDENCIALES (Asegúrate de que son las tuyas)
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
# RUTAS GET
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
# RUTAS POST/PUT
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
# RUTAS BULK
# ==========================================
@app.put("/api/troqueles/bulk/categoria")
async def bulk_update_categoria(data: BulkCategoria):
    return supabase.table("troqueles").update({"categoria_id": data.categoria_id}).in_("id", data.ids).execute()

@app.post("/api/troqueles/bulk/borrar")
async def bulk_borrar(data: BulkBorrar):
    return supabase.table("troqueles").update({"estado_activo": "En Papelera"}).in_("id", data.ids).execute()

# ==========================================
# IMPORTADOR INTELIGENTE (LATIN-1 + UTF8)
# ==========================================
def normalizar_header(header):
    """Quita espacios y pone mayúsculas para comparar fácil"""
    return header.strip().upper().replace('Ó', 'O').replace('Í', 'I').replace('.', '')

def buscar_valor_fila(row, candidatos):
    """Busca en la fila usando varios nombres posibles de columna"""
    # Creamos un mapa de {HEADER_NORMALIZADO: VALOR}
    row_norm = {normalizar_header(k): v for k, v in row.items() if k}
    
    for c in candidatos:
        c_norm = normalizar_header(c)
        if c_norm in row_norm:
            val = row_norm[c_norm]
            if val: return str(val).strip()
    return ""

@app.post("/api/importar_csv")
async def importar_csv(file: UploadFile = File(...)):
    try:
        content = await file.read()
        
        # 1. INTENTAR DECODIFICAR (UTF-8 vs LATIN-1)
        try:
            texto = content.decode('utf-8-sig')
        except UnicodeDecodeError:
            try:
                texto = content.decode('latin-1') # Típico de Excel en España
            except:
                raise HTTPException(status_code=400, detail="Formato de archivo no legible (codificación)")

        # 2. DETECTAR SEPARADOR (; vs ,)
        # Si hay más puntos y coma que comas en la primera línea, es Excel español
        primera_linea = texto.split('\n')[0]
        separador = ';' if primera_linea.count(';') > primera_linea.count(',') else ','
        
        f = io.StringIO(texto)
        reader = csv.DictReader(f, delimiter=separador)
        
        filas_para_insertar = []
        
        for row in reader:
            # MAPEO INTELIGENTE DE COLUMNAS
            # ID: 'CODIGO TROQUE', 'UBICACIÓN', 'ID'
            id_t = buscar_valor_fila(row, ["CODIGO TROQUE", "UBICACION", "UBICACIÓN", "ID", "CODIGO"])
            if not id_t: continue # Sin ID no hacemos nada

            # NOMBRE: 'DESCRIPCIÓN', 'NOMBRE'
            nombre = buscar_valor_fila(row, ["DESCRIPCION", "DESCRIPCIÓN", "NOMBRE", "ARTICULO"])
            
            # ARTICULOS: 'CÓDIGO Artículo', 'REF'
            cods = buscar_valor_fila(row, ["CODIGO ARTICULO", "CODIGO ARTÍCULO", "CÓDIGO ARTÍCULO", "REF"])
            
            # OT: 'Número OT'
            ot = buscar_valor_fila(row, ["NUMERO OT", "NÚMERO OT", "OT", "Nº OT"])
            
            # UBICACION: Si tenemos 'CODIGO TROQUE' y 'UBICACION' separados, usamos 'UBICACION'
            # Si solo tenemos 'UBICACION' y la usamos como ID, ponemos 'PENDIENTE'
            ubi_val = buscar_valor_fila(row, ["UBICACION", "UBICACIÓN", "ESTANTERIA"])
            
            # Lógica: Si la columna ubicación es distinta al ID que hemos cogido, es una ubicación real
            ubi_final = "PENDIENTE"
            if ubi_val and ubi_val != id_t:
                ubi_final = ubi_val
            
            nuevo = {
                "id_troquel": id_t,
                "nombre": nombre,
                "codigos_articulo": cods,
                "referencias_ot": ot,
                "ubicacion": ubi_final,
                "estado_activo": "Activo"
            }
            filas_para_insertar.append(nuevo)
            
        # 3. INSERTAR EN BLOQUES (UPSERT)
        # UPSERT = Si existe el ID, actualiza; si no, crea.
        chunk_size = 100
        for i in range(0, len(filas_para_insertar), chunk_size):
            bloque = filas_para_insertar[i:i+chunk_size]
            try:
                # Intenta actualizar si existe
                supabase.table("troqueles").upsert(bloque, on_conflict="id_troquel").execute()
            except Exception as e_db:
                print(f"Error en bloque {i}: {e_db}")
                # Si falla upsert masivo, intentamos uno a uno (más lento pero seguro)
                for item in bloque:
                    try:
                        supabase.table("troqueles").upsert(item, on_conflict="id_troquel").execute()
                    except:
                        pass

        return {"status": "ok", "total_importados": len(filas_para_insertar)}

    except Exception as e:
        print(f"Error general: {e}")
        raise HTTPException(status_code=500, detail=f"Error procesando CSV: {str(e)}")

@app.get("/api/health")
def health():
    return {"status": "ok"}
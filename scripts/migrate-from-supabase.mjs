// Script one-shot: exporta propiedades activas de Supabase a src/content/propiedades/*.md
// y descarga sus imágenes del bucket propiedades-imagenes a src/assets/propiedades/<slug>/.
// Ejecutar UNA VEZ con:  node --env-file=.env scripts/migrate-from-supabase.mjs
// Requiere @supabase/supabase-js instalado (ya está en dependencies).

import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Faltan PUBLIC_SUPABASE_URL o PUBLIC_SUPABASE_ANON_KEY en .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONTENT_DIR = 'src/content/propiedades';
const ASSETS_DIR = 'src/assets/propiedades';
const BUCKET = 'propiedades-imagenes';

// ── Mapeo snake_case Supabase → camelCase schema nuevo ────────
function toFrontmatter(row, numImagenes) {
  const fm = {
    titulo: row.titulo,
    tipo: row.tipo,
    estadoVenta: row.estado_venta,
    zona: row.zona,
    precio: row.precio,
    moneda: row.moneda ?? 'MXN',
  };
  if (row.precio_por_m2)       fm.precioPorM2 = row.precio_por_m2;
  if (row.estado_publicacion === 'preventa' || row.estado_publicacion === 'destacada') {
    fm.estadoPublicacion = row.estado_publicacion;
  }
  if (row.destacada)           fm.destacada = true;
  if (row.direccion_aprox)     fm.direccionAprox = row.direccion_aprox;
  if (row.latitud != null)     fm.latitud = row.latitud;
  if (row.longitud != null)    fm.longitud = row.longitud;
  if (row.metros_terreno)      fm.metrosTerreno = row.metros_terreno;
  if (row.metros_construccion) fm.metrosConstruccion = row.metros_construccion;
  if (row.caracteristicas?.length) fm.caracteristicas = row.caracteristicas;
  if (row.acepta_creditos?.length) fm.aceptaCreditos = row.acepta_creditos;
  fm.numImagenes = numImagenes;
  return fm;
}

// ── Serializa frontmatter a YAML manual (sin dependencia extra) ─
function yamlify(obj, indent = 0) {
  const pad = ' '.repeat(indent);
  const lines = [];
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) {
      lines.push(`${pad}${k}:`);
      for (const item of v) lines.push(`${pad}  - ${yamlString(item)}`);
    } else if (typeof v === 'string') {
      lines.push(`${pad}${k}: ${yamlString(v)}`);
    } else {
      lines.push(`${pad}${k}: ${v}`);
    }
  }
  return lines.join('\n');
}

function yamlString(s) {
  const str = String(s);
  // Encomilla si tiene caracteres especiales de YAML
  if (/[:#{}\[\],&*!|>'"%@`\n]/.test(str) || /^\s|\s$/.test(str)) {
    return `"${str.replace(/"/g, '\\"')}"`;
  }
  return str;
}

// ── Descarga imágenes del bucket a src/assets/propiedades/<slug>/ ─
async function downloadImages(carpeta, slug) {
  if (!carpeta) return 0;

  const { data: files, error } = await supabase.storage.from(BUCKET).list(carpeta, {
    limit: 100,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (error) {
    console.warn(`  [${slug}] warning list: ${error.message}`);
    return 0;
  }
  const real = (files ?? []).filter(f => f.name !== '.emptyFolderPlaceholder');
  if (real.length === 0) return 0;

  const destDir = join(ASSETS_DIR, slug);
  await mkdir(destDir, { recursive: true });

  let n = 0;
  for (const f of real) {
    const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(`${carpeta}/${f.name}`);
    if (dlErr) {
      console.warn(`  [${slug}] warning download ${f.name}: ${dlErr.message}`);
      continue;
    }
    n++;
    const ext = f.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const outName = `${String(n).padStart(2, '0')}.${ext}`;
    const buffer = Buffer.from(await blob.arrayBuffer());
    await writeFile(join(destDir, outName), buffer);
  }
  return n;
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  await mkdir(CONTENT_DIR, { recursive: true });
  await mkdir(ASSETS_DIR, { recursive: true });

  const { data: rows, error } = await supabase
    .from('propiedades')
    .select('*')
    .eq('activa', true)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error consultando propiedades:', error.message);
    process.exit(1);
  }

  console.log(`Encontradas ${rows.length} propiedades activas.`);
  let mdCount = 0, imgTotal = 0;

  for (const row of rows) {
    const slug = row.slug;
    console.log(`→ ${slug}`);
    const numImagenes = await downloadImages(row.carpeta_imagenes, slug);
    imgTotal += numImagenes;

    const fm = toFrontmatter(row, numImagenes);
    const body = row.descripcion ?? '';
    const md = `---\n${yamlify(fm)}\n---\n\n${body}\n`;
    await writeFile(join(CONTENT_DIR, `${slug}.md`), md, 'utf8');
    mdCount++;
  }

  console.log(`\nOK. ${mdCount} archivos .md creados. ${imgTotal} imágenes descargadas.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

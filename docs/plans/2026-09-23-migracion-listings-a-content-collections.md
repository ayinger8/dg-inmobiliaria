# Migración de listings a Content Collections — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar Supabase del sitio y reemplazar el catálogo dinámico por Astro Content Collections con imágenes locales, manteniendo intacta la UI actual.

**Architecture:** Cada listing = un `.md` en `src/content/propiedades/<slug>.md` con frontmatter validado por Zod. Imágenes en `src/assets/propiedades/<slug>/` para que Astro Image las optimice. Sitio 100% estático. Un script one-shot migra las 9 propiedades semilla desde Supabase antes de eliminarlo.

**Tech Stack:** Astro 5, Astro Content Collections + Zod, `@astrojs/image` (integrado en Astro 5 vía `astro:assets`), Vercel (deploy estático autodetectado).

**Testing approach (importante):** El proyecto no tiene tests unitarios y no vamos a introducirlos para este refactor. La verificación se hace con:
1. `astro build` verde (el schema Zod valida frontmatter; TypeScript valida tipos).
2. `astro dev` + inspección manual de las páginas afectadas.
3. Diff visual con la versión actual desplegada.

Los "steps de test" del plan reflejan esto: son verificaciones de build y comprobaciones visuales, no `pytest`/`vitest`.

**Referencia:** `docs/specs/2026-09-23-migracion-listings-a-content-collections-design.md` es la fuente de verdad para schema y decisiones de diseño.

---

## File Structure

**Se crea:**
- `src/content/config.ts` — schema Zod de la collection `propiedades`.
- `src/content/propiedades/*.md` — 9 archivos generados por el script de migración, uno por propiedad semilla.
- `src/assets/propiedades/<slug>/01.webp, 02.webp, ...` — imágenes descargadas del bucket Supabase.
- `scripts/migrate-from-supabase.mjs` — script Node one-shot; se elimina al final.
- `docs/plans/2026-09-23-migracion-listings-a-content-collections.md` — este archivo.

**Se modifica:**
- `astro.config.mjs` — `output: 'static'`, remover adapter Vercel.
- `package.json` — remover `@supabase/supabase-js` y `@astrojs/vercel`.
- `src/pages/propiedades.astro` — leer de la collection en vez de Supabase.
- `src/pages/propiedades/[slug].astro` — `getStaticPaths`, `getEntry`, imágenes locales, `<Content />` para descripción.
- `.env` — remover envs Supabase.
- `.mcp.json` — remover server Supabase MCP.

**Se elimina:**
- `src/lib/supabase.ts`.
- `supabase/schema.sql` (y el directorio `supabase/` si queda vacío).
- `scripts/migrate-from-supabase.mjs` (al final).

**Se preserva sin tocar:**
- Todos los componentes en `src/components/` (Header, Footer, Hero, TrustBar, Cards, propiedades/*).
- CSS global y BEM classes.
- Script cliente de filtros/paginación en `/propiedades`.
- Galería/lightbox/swiper en detalle.
- Form de contacto (ya funciona con WhatsApp, nunca dependió de Supabase).

---

## Task 1: Crear rama de trabajo y estructura de carpetas

**Files:**
- Create: `src/content/` (directorio)
- Create: `src/content/propiedades/` (directorio)
- Create: `src/assets/` (directorio)
- Create: `src/assets/propiedades/` (directorio)
- Create: `scripts/` (directorio)

- [ ] **Step 1: Verificar estado limpio del working tree**

Run desde `E:\PROYECTOS\dg-inmobiliaria`:
```bash
git status
```
Expected: working tree clean, en rama `master`. Si hay cambios sin commitear, detener y consultar con el usuario.

- [ ] **Step 2: Crear rama de trabajo**

```bash
git checkout -b refactor/content-collections
```
Expected: `Switched to a new branch 'refactor/content-collections'`.

- [ ] **Step 3: Crear directorios base**

```bash
mkdir -p src/content/propiedades src/assets/propiedades scripts
```
Expected: Sin output. Verificar con `ls src/content src/assets scripts` (todos deben existir).

- [ ] **Step 4: Commit inicial**

Git no versiona directorios vacíos, así que este commit no hace nada aún. Saltar hasta Task 2.

---

## Task 2: Crear el schema de la Content Collection

**Files:**
- Create: `src/content/config.ts`

- [ ] **Step 1: Escribir el schema Zod**

Crear `src/content/config.ts` con este contenido exacto:

```ts
import { defineCollection, z } from 'astro:content';

const ZONA = z.enum([
  'Cerritos',
  'Marina Mazatlán',
  'Zona Dorada',
  'El Cid',
  'Centro Histórico',
  'Lomas del Mar',
  'Brujas',
  'Los Pinos',
]);

const propiedades = defineCollection({
  type: 'content',
  schema: z.object({
    // Obligatorios
    titulo: z.string().min(1),
    tipo: z.enum(['casa', 'departamento', 'terreno', 'desarrollo']),
    estadoVenta: z.enum(['disponible', 'apartado', 'vendido']),
    zona: ZONA,
    precio: z.number().positive(),
    moneda: z.enum(['MXN', 'USD']).default('MXN'),

    // Opcionales de display
    precioDesde: z.boolean().default(false),
    precioPorM2: z.number().positive().optional(),
    estadoPublicacion: z.enum(['preventa', 'destacada']).optional(),
    destacada: z.boolean().default(false),

    // Ubicación
    direccionAprox: z.string().optional(),
    latitud: z.number().min(-90).max(90).optional(),
    longitud: z.number().min(-180).max(180).optional(),

    // Métricas
    metrosTerreno: z.number().positive().optional(),
    metrosConstruccion: z.number().positive().optional(),

    // Listas
    caracteristicas: z.array(z.string()).default([]),
    aceptaCreditos: z.array(z.string()).default([]),

    // Trazabilidad interna
    fuenteOficial: z.string().url().optional(),

    // Imágenes
    portada: z.string().optional(),
    numImagenes: z.number().int().min(0).default(0),
  }),
});

export const collections = { propiedades };
```

- [ ] **Step 2: Verificar que Astro reconoce el schema**

Run:
```bash
npx astro check
```
Expected: Sin errores. Si aparece "Cannot find module 'astro:content'", ejecutar `npx astro sync` primero.

- [ ] **Step 3: Commit**

```bash
git add src/content/config.ts
git commit -m "feat(content): agregar schema de collection propiedades con Zod"
```

---

## Task 3: Escribir el script de migración desde Supabase

**Files:**
- Create: `scripts/migrate-from-supabase.mjs`

- [ ] **Step 1: Escribir el script**

Crear `scripts/migrate-from-supabase.mjs` con este contenido exacto:

```js
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
```

- [ ] **Step 2: Commit del script**

```bash
git add scripts/migrate-from-supabase.mjs
git commit -m "chore(scripts): agregar script one-shot de migración Supabase → content"
```

---

## Task 4: Ejecutar la migración y verificar

**Files:**
- Generates: `src/content/propiedades/*.md` (9 archivos)
- Generates: `src/assets/propiedades/<slug>/*.{webp,jpg,png}` (variable)

- [ ] **Step 1: Verificar acceso a Supabase**

Run:
```bash
node --env-file=.env -e "import('@supabase/supabase-js').then(({createClient}) => createClient(process.env.PUBLIC_SUPABASE_URL, process.env.PUBLIC_SUPABASE_ANON_KEY).from('propiedades').select('slug', { count: 'exact', head: true }).then(r => console.log('conteo:', r.count, 'error:', r.error)))"
```
Expected: `conteo: 9 error: null` (o similar, con el count real). Si error, revisar `.env` y detener.

- [ ] **Step 2: Ejecutar el script de migración**

Run:
```bash
node --env-file=.env scripts/migrate-from-supabase.mjs
```
Expected: log tipo:
```
Encontradas 9 propiedades activas.
→ marina-bonita-...
→ ...
OK. 9 archivos .md creados. N imágenes descargadas.
```

- [ ] **Step 3: Verificar archivos generados**

Run:
```bash
ls src/content/propiedades/
ls src/assets/propiedades/
```
Expected: 9 archivos `.md`. Una carpeta por cada slug que tuviera imágenes en el bucket.

- [ ] **Step 4: Verificar que el schema valida los .md**

Run:
```bash
npx astro sync
```
Expected: sin errores. Si aparecen errores de validación, revisar los `.md` afectados: puede haber una `zona` que no está en el enum, o un `precio` como string. Corregir a mano y volver a correr.

- [ ] **Step 5: Commit del contenido migrado**

```bash
git add src/content/propiedades/ src/assets/propiedades/
git commit -m "feat(content): migrar 9 propiedades semilla desde Supabase"
```

---

## Task 5: Refactor de `/propiedades.astro` (listing)

**Files:**
- Modify: `src/pages/propiedades.astro`

- [ ] **Step 1: Reescribir el frontmatter del archivo**

Reemplazar líneas 1-19 del archivo actual con:

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
import WhatsAppButton from '../components/WhatsAppButton.astro';
import PropiedadesHero from '../components/propiedades/PropiedadesHero.astro';
import FiltrosBarra from '../components/propiedades/FiltrosBarra.astro';
import PropiedadesTabs from '../components/propiedades/PropiedadesTabs.astro';
import PropiedadesGrid from '../components/propiedades/PropiedadesGrid.astro';
import PropiedadesCTA from '../components/propiedades/PropiedadesCTA.astro';
import { getCollection } from 'astro:content';

// ── Mapeo de la Content Collection al shape que consume el script cliente ──
// Se conservan los nombres snake_case que espera el JS de filtros/render,
// para no tocar la lógica ni el CSS.
const entries = await getCollection('propiedades');

const initialProps = entries
  .map(({ slug, data: d }) => {
    const carpeta = `/src/assets/propiedades/${slug}/`;
    const portadaName = d.portada ?? (d.numImagenes > 0 ? '01' : null);
    // Astro copia src/assets automáticamente sólo si se referencia con import;
    // aquí construimos rutas públicas equivalentes en /_astro/ vía import.meta.glob.
    return {
      slug,
      titulo: d.titulo,
      tipo: d.tipo,
      estado_venta: d.estadoVenta,
      estado_publicacion: d.estadoPublicacion ?? 'disponible',
      zona: d.zona,
      precio: d.precio,
      moneda: d.moneda,
      metros_construccion: d.metrosConstruccion ?? null,
      metros_terreno: d.metrosTerreno ?? null,
      caracteristicas: d.caracteristicas ?? [],
      acepta_creditos: d.aceptaCreditos ?? [],
      destacada: d.destacada ?? false,
      portada: null,   // se resuelve en el bloque de imágenes de abajo
      imagenes: [],
    };
  })
  // Destacadas primero, luego por título alfabéticamente
  .sort((a, b) => {
    if (a.destacada !== b.destacada) return a.destacada ? -1 : 1;
    return a.titulo.localeCompare(b.titulo, 'es');
  });

// ── Resolver URLs de imágenes vía import.meta.glob (build-time) ──
const imageModules = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/propiedades/**/*.{jpg,jpeg,png,webp}',
  { eager: true }
);

for (const p of initialProps) {
  const prefix = `/src/assets/propiedades/${p.slug}/`;
  const files = Object.entries(imageModules)
    .filter(([path]) => path.startsWith(prefix))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, mod]) => mod.default.src);
  p.imagenes = files;
  p.portada = files[0] ?? null;
}
---
```

- [ ] **Step 2: Verificar el rest del archivo no cambia**

Las líneas del `<BaseLayout>` hacia abajo (todo el HTML + `<script define:vars={{ initialProps }}>`) quedan exactamente igual. El script cliente ya consume `initialProps[i].portada`, `imagenes`, `tipo`, `estado_venta`, `zona`, etc. — todos esos nombres se preservaron.

- [ ] **Step 3: Levantar dev y verificar listing**

Run:
```bash
npm run dev
```
Abrir `http://localhost:4321/propiedades` en el navegador.

Expected:
- Se muestran las 9 propiedades como cards.
- Los filtros de zona/tipo/precio/crédito funcionan.
- Los tabs (Casa, Depto, INFONAVIT, Bancario, Preventa) funcionan.
- La paginación aparece si hay más de 6 resultados.
- Las imágenes de portada se ven (no aparece el placeholder `/assets/mazatlan-hero.webp` en todas).
- Al hacer click en una card, la URL va a `/propiedades/<slug>` (puede 404 hasta que hagamos Task 6, es normal).

Detener con Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add src/pages/propiedades.astro
git commit -m "refactor(propiedades): leer listing desde Content Collection en vez de Supabase"
```

---

## Task 6: Refactor de `/propiedades/[slug].astro` (detalle)

**Files:**
- Modify: `src/pages/propiedades/[slug].astro`

- [ ] **Step 1: Reemplazar el bloque de imports y fetch (líneas 1-67)**

Reemplazar desde la línea 1 hasta el cierre del bloque de imágenes (línea ~67 en el archivo actual) con:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import Header from '../../components/Header.astro';
import Footer from '../../components/Footer.astro';
import WhatsAppButton from '../../components/WhatsAppButton.astro';
import { getCollection, getEntry } from 'astro:content';
import {
  MapPin, BedDouble, Bath, Car, Waves, Leaf, Wind,
  UtensilsCrossed, ArrowUp, Shield, Laptop, Package,
  User, Droplets, Sun, Tv, Wine, Eye, Building2,
  CheckCircle2, Archive, Activity, ChevronLeft, ChevronRight,
  Heart, Share2, MessageCircle, ArrowRight, Check, Camera,
  Maximize2, X,
} from 'lucide-astro';

// ── Static paths ─────────────────────────────────────────────
export async function getStaticPaths() {
  const entries = await getCollection('propiedades');
  return entries.map((entry) => ({ params: { slug: entry.slug } }));
}

const { slug } = Astro.params;
const entry = await getEntry('propiedades', slug!);
// getStaticPaths garantiza que sólo se generan rutas con entry válido en output:'static',
// así que este throw es defensivo: si alguna vez pasa, es un bug del build.
if (!entry) throw new Error(`Entry no encontrado para slug: ${slug}`);

const prop = entry.data;
const { Content } = await entry.render();

// ── Related (mismo tipo primero, hasta 3) ────────────────────
const allEntries = await getCollection('propiedades');
const pool = allEntries.filter((e) => e.slug !== slug);
const relatedEntries = [
  ...pool.filter((e) => e.data.tipo === prop.tipo),
  ...pool.filter((e) => e.data.tipo !== prop.tipo),
].slice(0, 3);

// ── Imágenes (build-time glob desde src/assets) ──────────────
const FALLBACK = '/assets/mazatlan-hero.webp';
const imageModules = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/propiedades/**/*.{jpg,jpeg,png,webp}',
  { eager: true }
);

function imagesFor(entrySlug: string): string[] {
  const prefix = `/src/assets/propiedades/${entrySlug}/`;
  return Object.entries(imageModules)
    .filter(([path]) => path.startsWith(prefix))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, mod]) => mod.default.src);
}

let images = imagesFor(slug!);
if (images.length === 0) images = [FALLBACK];
const hasMany = images.length > 1;
```

- [ ] **Step 2: Ajustar referencias del objeto `prop` en el resto del archivo**

El archivo actual referencia campos snake_case (`prop.estado_venta`, `prop.metros_construccion`, `prop.acepta_creditos`, etc.). El nuevo `prop` (que viene de `entry.data`) usa camelCase.

Aplicar estos reemplazos en TODO el archivo desde el fin del frontmatter hasta el final:

| Buscar | Reemplazar con |
|---|---|
| `prop.estado_venta` | `prop.estadoVenta` |
| `prop.estado_publicacion` | `prop.estadoPublicacion` |
| `prop.metros_construccion` | `prop.metrosConstruccion` |
| `prop.metros_terreno` | `prop.metrosTerreno` |
| `prop.direccion_aprox` | `prop.direccionAprox` |
| `prop.acepta_creditos` | `prop.aceptaCreditos` |
| `prop.precio_por_m2` | `prop.precioPorM2` |

También, en la sección de "Descripción" (líneas ~320-325 del archivo actual):

Buscar:
```astro
{prop.descripcion && (
  <section class="prop-section" id="descripcion" aria-label="Descripción">
    <h2>Descripción</h2>
    <p class="prop-section__text">{prop.descripcion}</p>
  </section>
)}
```

Reemplazar con:
```astro
<section class="prop-section" id="descripcion" aria-label="Descripción">
  <h2>Descripción</h2>
  <div class="prop-section__text">
    <Content />
  </div>
</section>
```

- [ ] **Step 3: Ajustar el bloque de "related" (líneas ~379-420)**

Reemplazar el bloque de related (todo el `{related.length > 0 && (...)}` actual) con:

```astro
{relatedEntries.length > 0 && (
  <section class="prop-section" id="relacionadas" aria-label="Propiedades similares">
    <h2>También podría interesarte</h2>
    <div class="prop-related-grid">
      {relatedEntries.map((r) => {
        const rSlug = r.slug;
        const rImgs = imagesFor(rSlug);
        const rImg  = rImgs[0] ?? FALLBACK;
        const rd    = r.data;
        const rTipo  = TIPO_LBL[rd.tipo]  ?? rd.tipo;
        const rVenta = VENTA_LBL[rd.estadoVenta] ?? rd.estadoVenta;
        const rCls   = VENTA_CLS[rd.estadoVenta] ?? 'disponible';
        const rArea  = rd.metrosConstruccion ?? rd.metrosTerreno;
        const rRec   = extractNum(rd.caracteristicas, 'recámara') ?? extractNum(rd.caracteristicas, 'recamara');
        const rBan   = extractNum(rd.caracteristicas, 'baño');
        return (
          <article class="prop-card">
            <div class="prop-card__img">
              <img src={rImg} alt={rd.titulo} loading="lazy" width="300" height="200" />
              <span class="prop-card__badge prop-card__badge--tipo">{rTipo}</span>
              <span class:list={['prop-card__badge prop-card__badge--estado', `prop-card__badge--${rCls}`]}>{rVenta}</span>
            </div>
            <div class="prop-card__body">
              <p class="prop-card__zona">
                <MapPin size={12} stroke-width={1.5} />{rd.zona}
              </p>
              <h3 class="prop-card__title">{rd.titulo}</h3>
              <p class="prop-card__price">{fmtPrice.format(rd.precio)} <span>{rd.moneda}</span></p>
              {(rArea || rRec || rBan) && (
                <div class="prop-card__features">
                  {rArea && <span class="prop-card__feat"><ArrowRight size={10} stroke-width={1.5} />{rArea} m²</span>}
                  {rRec  && <span class="prop-card__feat"><BedDouble size={12} stroke-width={1.5} />{rRec} rec.</span>}
                  {rBan  && <span class="prop-card__feat"><Bath size={12} stroke-width={1.5} />{rBan} baños</span>}
                </div>
              )}
              <a class="button button--gold prop-card__cta" href={`/propiedades/${rSlug}`}>
                Ver propiedad <ArrowRight size={14} stroke-width={1.5} />
              </a>
            </div>
          </article>
        );
      })}
    </div>
  </section>
)}
```

- [ ] **Step 4: Levantar dev y verificar detalle**

Run:
```bash
npm run dev
```

Abrir cada una de las 9 propiedades en `/propiedades/<slug>` y verificar:
- La galería mosaico (desktop) muestra imágenes locales.
- El swiper (móvil, redimensionar ventana a <720px) funciona.
- El lightbox se abre y navega con flechas y ESC.
- Precio, badges, características con iconos, ubicación (mapa si hay lat/lng), distancias por zona.
- La descripción se renderiza con markdown enriquecido (párrafos, negritas si los hay).
- El bloque "También podría interesarte" muestra hasta 3 relacionadas, con imágenes.
- El form de contacto abre WhatsApp con el mensaje correcto.

Detener con Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add src/pages/propiedades/[slug].astro
git commit -m "refactor(detalle): migrar página de propiedad a Content Collections + imágenes locales"
```

---

## Task 7: Cambiar a build estático y limpiar Supabase

**Files:**
- Modify: `astro.config.mjs`
- Modify: `package.json`
- Modify: `.env`
- Modify: `.mcp.json`
- Delete: `src/lib/supabase.ts`
- Delete: `supabase/schema.sql` (y el directorio `supabase/` si queda vacío)

- [ ] **Step 1: Cambiar `astro.config.mjs` a static**

Reemplazar el contenido completo de `astro.config.mjs` con:

```js
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://dginmobiliaria.mx',
  output: 'static',
});
```

- [ ] **Step 2: Remover dependencias**

Run:
```bash
npm uninstall @supabase/supabase-js @astrojs/vercel
```
Expected: `package.json` queda solo con `astro` y `lucide-astro` como dependencies (más lo que ya haya de devDependencies).

- [ ] **Step 3: Borrar archivos obsoletos**

Run:
```bash
rm src/lib/supabase.ts
rm supabase/schema.sql
rmdir supabase 2>/dev/null || true
```
Expected: los tres archivos/dir no existen. `ls src/lib/` puede quedar vacío o con otros archivos si los hay.

- [ ] **Step 4: Limpiar `.env`**

Reemplazar el contenido de `.env` con una sola línea de comentario:
```
# Sin variables: sitio 100% estático, sin backend
```

- [ ] **Step 5: Limpiar `.mcp.json`**

Reemplazar el contenido de `.mcp.json` con:
```json
{
  "mcpServers": {}
}
```

- [ ] **Step 6: Build de verificación**

Run:
```bash
npm run build
```
Expected: build verde. Output tipo `Generated dist/ in ...`. Si falla por referencias colgantes a `supabase`, revisar el archivo señalado y corregir.

- [ ] **Step 7: Preview del sitio estático**

Run:
```bash
npm run preview
```

Abrir `http://localhost:4321/propiedades` y una ficha, verificar que todo funciona como en dev. Detener con Ctrl+C.

- [ ] **Step 8: Commit de la limpieza**

```bash
git add astro.config.mjs package.json package-lock.json .env .mcp.json
git rm src/lib/supabase.ts supabase/schema.sql
git commit -m "chore: eliminar Supabase y adapter Vercel, migrar a output static"
```

---

## Task 8: Desplegar y limpieza final

**Files:**
- Delete: `scripts/migrate-from-supabase.mjs` (ya cumplió su función)

- [ ] **Step 1: Push de la rama**

Run:
```bash
git push -u origin refactor/content-collections
```
Expected: rama pusheada. Vercel debería crear un preview deployment automático desde el push.

- [ ] **Step 2: Verificar preview de Vercel**

Ir al dashboard: `https://vercel.com/dg-solutionsmx-projects/dg-inmobiliaria`. Encontrar el preview deployment de la rama `refactor/content-collections`. Abrir la URL y verificar:
- Home se ve igual.
- `/propiedades` muestra las 9 con filtros funcionales.
- Detalle de cada una con imágenes.

**Si falla el build en Vercel:** revisar los logs, corregir localmente, commit y push. NO seguir hasta que el preview esté verde.

- [ ] **Step 3: Merge a master**

Confirmar con el usuario antes de hacer merge. Cuando apruebe:

```bash
git checkout master
git merge --no-ff refactor/content-collections
git push origin master
```
Expected: master actualizado, Vercel despliega producción automáticamente.

- [ ] **Step 4: Verificar producción**

Abrir `https://dg-inmobiliaria.vercel.app` y repetir la verificación del Step 2 en producción.

- [ ] **Step 5: Usuario borra las envs de Supabase en Vercel**

Recordar al usuario ir a `Vercel dashboard → project → Settings → Environment Variables` y borrar:
- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`

Este paso lo hace el usuario a mano; no lo puede hacer el asistente.

- [ ] **Step 6: Borrar el script de migración**

Run:
```bash
rm scripts/migrate-from-supabase.mjs
rmdir scripts 2>/dev/null || true
git add -A
git commit -m "chore: eliminar script one-shot de migración (ya cumplió su función)"
git push origin master
```

- [ ] **Step 7: Borrar rama de trabajo**

```bash
git branch -d refactor/content-collections
git push origin --delete refactor/content-collections
```

---

## Verificación final

Después de Task 8, el estado esperado del repo:
- `package.json` con `astro` y `lucide-astro` únicamente en dependencies.
- `astro.config.mjs` con `output: 'static'`, sin adapter.
- Sin `src/lib/supabase.ts`, sin `supabase/`, sin `scripts/`.
- `.env` vacío/comentario.
- `.mcp.json` con `{ "mcpServers": {} }`.
- `src/content/config.ts` + `src/content/propiedades/*.md` (9 archivos).
- `src/assets/propiedades/<slug>/*.{webp,jpg,png}`.
- Producción y preview funcionando idénticamente en Vercel.

## Notas para el ejecutor

- **Tareas 5 y 6 son independientes** una vez completada la Task 4. Si estás ejecutando con subagentes, pueden ir en paralelo.
- **Task 4 (ejecutar migración) requiere Supabase activo.** Si Supabase ya no responde, saltar Task 3 y 4, crear manualmente uno o dos `.md` de prueba con el schema, y proceder.
- **Si `import.meta.glob` no resuelve las imágenes en algún caso raro**, alternativa: mover imágenes a `public/propiedades/<slug>/` y referenciarlas con URL string directa. Menos optimización pero garantizado funcional.
- **No introducir tests nuevos** para este refactor. La validación es build + inspección visual. Si el usuario quiere tests después, es otro plan.

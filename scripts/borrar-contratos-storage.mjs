/**
 * Borra todos los archivos en pignora-fotos/contratos/
 * (Supabase NO permite DELETE directo en storage.objects por SQL)
 *
 * Uso:
 *   1. Copia la service_role key: Supabase → Project Settings → API
 *   2. En PowerShell, desde la raíz del proyecto:
 *
 *      $env:EXPO_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
 *      $env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."
 *      node scripts/borrar-contratos-storage.mjs
 *
 *   Solo lista sin borrar:
 *      node scripts/borrar-contratos-storage.mjs --dry-run
 */

import { createClient } from '@supabase/supabase-js';

const BUCKET = 'pignora-fotos';
const PREFIX = 'contratos';
const dryRun = process.argv.includes('--dry-run');

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Faltan variables de entorno: EXPO_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

/** Lista recursivamente todos los archivos bajo un prefijo */
async function listFiles(prefix) {
  const paths = [];
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (error) throw error;
  if (!data?.length) return paths;

  for (const item of data) {
    const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
    // Carpetas no tienen id en la API de list
    if (item.id == null) {
      paths.push(...(await listFiles(fullPath)));
    } else {
      paths.push(fullPath);
    }
  }
  return paths;
}

async function main() {
  console.log(`Buscando archivos en ${BUCKET}/${PREFIX}/ ...`);
  const files = await listFiles(PREFIX);
  console.log(`Encontrados: ${files.length} archivo(s)`);

  if (files.length === 0) {
    console.log('Nada que borrar.');
    return;
  }

  if (dryRun) {
    files.slice(0, 10).forEach((f) => console.log('  -', f));
    if (files.length > 10) console.log(`  ... y ${files.length - 10} más`);
    return;
  }

  const batchSize = 100;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const { data, error } = await supabase.storage.from(BUCKET).remove(batch);
    if (error) throw error;
    console.log(`Borrados ${Math.min(i + batchSize, files.length)}/${files.length}`);
    if (data?.length) {
      const failed = data.filter((r) => r.error);
      if (failed.length) console.warn('Algunos fallaron:', failed);
    }
  }

  const remaining = await listFiles(PREFIX);
  console.log(`Listo. Restantes en contratos/: ${remaining.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

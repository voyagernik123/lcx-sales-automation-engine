import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import * as XLSX from 'xlsx';

export interface CsvRow {
  [key: string]: string;
}

/** Parse a CSV file (UTF-8, header row as keys). Skips empty lines. */
export async function readCsv(filePath: string): Promise<CsvRow[]> {
  const rows: CsvRow[] = [];
  const rl = createInterface({ input: createReadStream(filePath, 'utf8'), crlfDelay: Infinity });
  let headers: string[] = [];

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = parseCsvLine(trimmed);
    if (headers.length === 0) {
      headers = parts;
      continue;
    }
    if (parts.length === 0) continue;
    const row: CsvRow = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = parts[i] ?? '';
    }
    rows.push(row);
  }

  return rows;
}

/** Parse a single CSV line respecting quoted fields. */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());

  // Strip BOM from first field
  if (fields.length > 0 && fields[0].charCodeAt(0) === 0xfeff) {
    fields[0] = fields[0].slice(1);
  }

  return fields;
}

/** Read an .xlsx workbook and return the first sheet as CsvRow[]. */
export function readXlsx(filePath: string, sheetName?: string): CsvRow[] {
  const buf = readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const name = sheetName ?? wb.SheetNames[0];
  const sheet = wb.Sheets[name];
  if (!sheet) throw new Error(`Sheet "${name}" not found in ${filePath}`);
  const raw: Record<string, unknown>[][] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return raw as unknown as CsvRow[];
}

/** Auto-detect CSV or XLSX and parse. */
export function readTabular(filePath: string): CsvRow[] | Promise<CsvRow[]> {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.csv') return readCsv(filePath);
  if (ext === '.xlsx' || ext === '.xls') return readXlsx(filePath);
  throw new Error(`Unsupported file type: ${ext}`);
}

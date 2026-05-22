// Genera el PDF de la propuesta usando Chrome/Edge headless.
// Uso: node docs/propuesta/generate-pdf.js

import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.join(__dirname, 'propuesta-cgs-bot.html');
const PDF  = path.join(__dirname, 'propuesta-cgs-bot.pdf');

const CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
];

const browser = CANDIDATES.find(p => p && existsSync(p));
if (!browser) {
  console.error('❌ No encontré Chrome, Edge ni Brave instalado.');
  console.error('   Alternativa: abrí propuesta-cgs-bot.html en cualquier navegador,');
  console.error('   Ctrl+P → "Guardar como PDF".');
  process.exit(1);
}

console.log(`📄 Navegador: ${path.basename(browser)}`);
console.log(`📄 Input:     ${HTML}`);
console.log(`📄 Output:    ${PDF}`);

try {
  execFileSync(browser, [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    `--print-to-pdf=${PDF}`,
    `file:///${HTML.replace(/\\/g, '/')}`
  ], { stdio: 'inherit' });
  console.log('✅ Propuesta PDF generada correctamente.');
} catch (e) {
  console.error('❌ Error al generar el PDF:', e.message);
  process.exit(1);
}

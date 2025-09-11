const fs = require('fs');
const path = require('path');

function exists(p) { try { return fs.existsSync(p); } catch { return false; } }

function main() {
  const root = path.resolve(__dirname, '..');
  const dup1 = path.join(root, 'core');
  const dup2 = path.join(path.dirname(root), 'core');
  const canonical = path.join(root, 'contracts');
  const canonicalCore = path.join(canonical, 'core');

  const findings = [];
  if (exists(dup1)) findings.push({ type: 'duplicate', path: dup1 });
  if (exists(dup2)) findings.push({ type: 'duplicate', path: dup2 });
  if (!exists(canonicalCore)) findings.push({ type: 'warning', path: canonicalCore, note: 'Missing canonical contracts/core folder' });

  console.log('Source layout check');
  console.log('Canonical root:', canonicalCore);
  if (findings.length === 0) {
    console.log('OK: No duplicate source directories detected.');
    return;
  }
  for (const f of findings) {
    if (f.type === 'duplicate') {
      console.log(`Duplicate source directory detected: ${f.path}`);
    } else {
      console.log(`Warning: ${f.path} — ${f.note}`);
    }
  }
  process.exitCode = 1; // non-zero to flag in CI but non-destructive
}

main();

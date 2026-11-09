// scripts/headroom-verify.mjs — verificación funcional de headroom (invoca python)
// Cold start en Windows (backend pure-Python + carga ONNX) puede superar el
// deadline por defecto de 20s: se amplía con HEADROOM_COMPRESSION_DEADLINE_MS
// y se comprime dos veces para medir también el caso caliente.
import { execSync } from 'node:child_process';

// Deadline de compresión ampliado para el cold start en Windows (se hereda al proceso python).
process.env.HEADROOM_COMPRESSION_DEADLINE_MS = process.env.HEADROOM_COMPRESSION_DEADLINE_MS ?? '60000';

const py = [
  'import time',
  'from headroom import compress',
  "msgs=[{'role':'user','content':'analyze logs'},{'role':'assistant','content':'x'*5000}]",
  "t0=time.perf_counter(); r1=compress(msgs, model='gpt-4o'); t1=time.perf_counter()",
  "r2=compress(msgs, model='gpt-4o'); t2=time.perf_counter()",
  "print('cold tokens_saved:', r1.tokens_saved, 'ratio:', round(r1.compression_ratio,3), 'secs:', round(t1-t0,1))",
  "print('warm tokens_saved:', r2.tokens_saved, 'ratio:', round(r2.compression_ratio,3), 'secs:', round(t2-t1,1))",
].join('; ');

try {
  const out = execSync(`python -c "${py}"`, { encoding: 'utf8', timeout: 180000 });
  console.log('LIBRERIA OK:');
  console.log(out.trim());
  if (/tokens_saved: 0 ratio: 0.0/.test(out) && !/tokens_saved: [1-9]/.test(out)) {
    console.error('FAIL: ambas corridas en PASSTHROUGH (tokens_saved=0)');
    process.exit(1);
  }
} catch (e) {
  console.error('LIBRERIA FAIL:', e.stdout ?? '', e.stderr ?? '');
  process.exit(1);
}

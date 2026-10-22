/**
 * Pruebas del servidor (src/*.js) con una hoja de cálculo simulada en memoria.
 * Ejecutar:  node test/backend.test.js
 * El workflow de GitHub las corre antes de cada deploy: si fallan, no se publica nada.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

// ---------- hoja simulada ----------
function crearMock() {
  const data = {
    Jugadores:   [['Nombre', 'Activo']],
    Partidos:    [['ID', 'Fecha', 'CostoPorJugador', 'Jugadores', 'Rival']],
    Movimientos: [['Timestamp', 'Fecha', 'Jugador', 'Tipo', 'Monto', 'PartidoID', 'Nota']]
  };
  const sheet = n => {
    const d = data[n];
    return {
      getLastRow: () => d.length,
      getLastColumn: () => Math.max(...d.map(r => r.length)),
      getRange: (r, c, nr = 1, nc = 1) => ({
        getValues: () => Array.from({ length: nr }, (_, i) =>
          Array.from({ length: nc }, (_, j) => ((d[r - 1 + i] || [])[c - 1 + j] ?? ''))),
        setValues: v => v.forEach((row, i) => {
          d[r - 1 + i] = d[r - 1 + i] || [];
          row.forEach((x, j) => d[r - 1 + i][c - 1 + j] = x);
        }),
        setValue(x) { (d[r - 1] = d[r - 1] || [])[c - 1] = x; return this; },
        getValue: () => (d[r - 1] || [])[c - 1] ?? '',
        setFontWeight() { return this; }
      }),
      appendRow: r => d.push(r),
      deleteRow: i => d.splice(i - 1, 1),
      setFrozenRows() {}
    };
  };
  let k = 0;
  const p2 = n => String(n).padStart(2, '0');
  const ctx = {
    data,
    SpreadsheetApp: { getActive: () => ({ getSheetByName: sheet, insertSheet: sheet }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Session: { getScriptTimeZone: () => 'America/Santiago' },
    Utilities: {
      formatDate: (d, tz, f) => {
        const Y = d.getFullYear(), M = p2(d.getMonth() + 1), D = p2(d.getDate());
        if (f === 'yyyyMMddHHmmss') return `${Y}${M}${D}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}${k++}`;
        if (f === 'yyyy-MM-dd') return `${Y}-${M}-${D}`;
        return `${D}-${M}-${Y}`;
      }
    },
    HtmlService: {}
  };
  vm.createContext(ctx);
  const dir = path.join(__dirname, '..', 'src');
  const codigo = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort()
    .map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  vm.runInContext(codigo, ctx);
  return ctx;
}

// ---------- pruebas ----------
const pruebas = [];
const prueba = (nombre, fn) => pruebas.push([nombre, fn]);
const saldos = g => Object.fromEntries(g.getSaldos().map(x => [x.nombre, x.saldo]));

prueba('abono de 10.000 y partido de 3.000 deja 7.000 a favor', () => {
  const g = crearMock();
  g.agregarJugadores('Ana\nBeto');
  g.registrarAbono('Ana', 10000);
  const id = g.registrarPartido('2026-10-25', 3000, [], 'Halcones');
  g.setJugadoresPartido(id, ['Ana', 'Beto']);
  assert.deepStrictEqual(saldos(g), { Ana: 7000, Beto: -3000 });
});

prueba('agregar jugadores ignora repetidos', () => {
  const g = crearMock();
  assert.strictEqual(g.agregarJugadores('Ana, Beto').agregados, 2);
  const r = g.agregarJugadores('ana\nCarla');
  assert.strictEqual(r.agregados, 1);
  assert.deepStrictEqual(Array.from(r.repetidos), ['ana']);
});

prueba('asignar y quitar jugadores crea y borra cargos', () => {
  const g = crearMock();
  g.agregarJugadores('Ana\nBeto\nCarla\nDiego');
  const id = g.registrarPartido('2026-10-25', 3000, [], 'Halcones');
  assert.deepStrictEqual({ ...g.setJugadoresPartido(id, ['Ana', 'Beto', 'Carla']) }, { agregados: 3, quitados: 0 });
  assert.deepStrictEqual({ ...g.setJugadoresPartido(id, ['Ana', 'Beto', 'Diego']) }, { agregados: 1, quitados: 1 });
  assert.deepStrictEqual({ ...g.setJugadoresPartido(id, ['Diego', 'Ana', 'Beto']) }, { agregados: 0, quitados: 0 });
  assert.deepStrictEqual(saldos(g), { Ana: -3000, Beto: -3000, Carla: 0, Diego: -3000 });
});

prueba('editar el costo actualiza todos los cargos del partido', () => {
  const g = crearMock();
  g.agregarJugadores('Ana\nBeto');
  const id = g.registrarPartido('2026-10-25', 3000, [], 'Halcones');
  g.setJugadoresPartido(id, ['Ana', 'Beto']);
  g.actualizarPartido(id, '2026-10-26', 'Halcones FC', 4000);
  const p = g.getPartidos()[0];
  assert.strictEqual(p.costo, 4000);
  assert.strictEqual(p.rival, 'Halcones FC');
  assert.strictEqual(p.fechaISO, '2026-10-26');
  assert.deepStrictEqual(saldos(g), { Ana: -4000, Beto: -4000 });
});

prueba('eliminar un partido borra sus cargos', () => {
  const g = crearMock();
  g.agregarJugadores('Ana');
  g.registrarAbono('Ana', 5000);
  const id = g.registrarPartido('2026-10-25', 3000, ['Ana'], 'Halcones');
  g.eliminarPartido(id);
  assert.strictEqual(g.getPartidos().length, 0);
  assert.deepStrictEqual(saldos(g), { Ana: 5000 });
});

prueba('renombrar mantiene el saldo y actualiza los partidos', () => {
  const g = crearMock();
  g.agregarJugadores('Beto');
  g.registrarPartido('2026-10-25', 3000, ['Beto'], 'Halcones');
  g.renombrarJugador('Beto', 'Roberto');
  assert.deepStrictEqual(saldos(g), { Roberto: -3000 });
  assert.deepStrictEqual(Array.from(g.getPartidos()[0].jugadores), ['Roberto']);
});

prueba('un jugador inactivo con deuda sigue en el resumen', () => {
  const g = crearMock();
  g.agregarJugadores('Ana');
  g.registrarPartido('2026-10-25', 3000, ['Ana'], 'Halcones');
  g.setActivo('Ana', false);
  assert.deepStrictEqual(Array.from(g.getJugadores()), []);
  assert.match(g.getResumen(), /Ana: \$3\.000/);
});

prueba('el historial de un jugador viene ordenado y con el rival', () => {
  const g = crearMock();
  g.agregarJugadores('Ana');
  g.registrarPartido('2026-10-14', 3000, ['Ana'], 'Viejo FC');
  g.registrarAbono('Ana', 10000, 'transferencia');
  const h = g.getMovimientosJugador('Ana');
  assert.strictEqual(h[0].tipo, 'ABONO');
  assert.strictEqual(h[1].nota, 'vs Viejo FC');
});

let fallas = 0;
for (const [nombre, fn] of pruebas) {
  try { fn(); console.log('  ✓ ' + nombre); }
  catch (e) { fallas++; console.log('  ✗ ' + nombre + '\n    ' + e.message.split('\n').join('\n    ')); }
}
console.log(`\n${pruebas.length - fallas}/${pruebas.length} pruebas OK`);
process.exit(fallas ? 1 : 0);

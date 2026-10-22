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
        setFontWeight() { return this; },
        setNumberFormat() { return this; }
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
    HtmlService: {},
    PropertiesService: (() => { const props = {}; return { getScriptProperties: () => ({
      getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; } }) }; })()
  };
  vm.createContext(ctx);
  const dir = path.join(__dirname, '..', 'src');
  const codigo = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort()
    .map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  vm.runInContext(codigo, ctx);
  ctx.Date = vm.runInContext('Date', ctx);   // Date del contexto (instanceof Date dentro del código)
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

prueba('eliminar un jugador sin movimientos lo saca del plantel', () => {
  const g = crearMock();
  g.agregarJugadores('Ana\nBeto');
  assert.strictEqual(g.eliminarJugador('Beto').movimientos, 0);
  assert.deepStrictEqual(Array.from(g.getJugadores()), ['Ana']);
});

prueba('eliminar un jugador borra sus movimientos y lo quita de los partidos', () => {
  const g = crearMock();
  g.agregarJugadores('Ana\nBeto');
  g.registrarAbono('Beto', 5000);
  const id = g.registrarPartido('2026-10-25', 3000, [], 'Halcones');
  g.setJugadoresPartido(id, ['Ana', 'Beto']);
  const plantel = Object.fromEntries(g.getPlantel().map(x => [x.nombre, x.movimientos]));
  assert.deepStrictEqual(plantel, { Ana: 1, Beto: 2 });
  assert.strictEqual(g.eliminarJugador('Beto').movimientos, 2);
  assert.deepStrictEqual(saldos(g), { Ana: -3000 });
  assert.deepStrictEqual(Array.from(g.getPartidos()[0].jugadores), ['Ana']);
  // el partido sigue funcionando: volver a guardar no recrea a Beto
  assert.deepStrictEqual({ ...g.setJugadoresPartido(id, ['Ana']) }, { agregados: 0, quitados: 0 });
});

prueba('agregar un jugador con teléfono chileno lo normaliza', () => {
  const g = crearMock();
  assert.strictEqual(g.agregarJugador('  Diego   Lagos ', '988976369').telefono, '+56 9 8897 6369');
  assert.strictEqual(g.agregarJugador('Yerco', '+56 9 1234 5678').telefono, '+56 9 1234 5678');
  assert.strictEqual(g.agregarJugador('Vitoco', '').telefono, '');
  const p = Object.fromEntries(g.getPlantel().map(x => [x.nombre, x.telefono]));
  assert.deepStrictEqual(p, { 'Diego Lagos': '+56 9 8897 6369', Vitoco: '', Yerco: '+56 9 1234 5678' });
  assert.strictEqual(g.data.Jugadores[0][2], 'Telefono');   // crea el encabezado si faltaba
});

prueba('no permite jugadores repetidos ni teléfonos inválidos', () => {
  const g = crearMock();
  g.agregarJugador('Diego Lagos', '');
  assert.throws(() => g.agregarJugador('diego lagos', ''), /ya está en el plantel/);
  assert.throws(() => g.agregarJugador('Coke', '123'), /no parece válido/);
  assert.throws(() => g.agregarJugador('  ', '988976369'), /nombre/);
});

prueba('cambiar y borrar el teléfono', () => {
  const g = crearMock();
  g.agregarJugador('Jp', '');
  assert.strictEqual(g.setTelefono('Jp', '56912345678'), '+56 9 1234 5678');
  assert.strictEqual(g.setTelefono('Jp', ''), '');
});

prueba('eliminar un jugador inexistente da error', () => {
  const g = crearMock();
  assert.throws(() => g.eliminarJugador('Nadie'), /no encontrado/);
});

prueba('el JavaScript del navegador no tiene // dentro de comillas invertidas (Apps Script lo corta)', () => {
  const dir = path.join(__dirname, '..', 'src');
  const malos = [];
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      for (const t of m[1].matchAll(/`[^`]*`/g)) {
        if (t[0].includes('//')) malos.push(`${f}: ${t[0].slice(0, 60)}`);
      }
    }
  }
  assert.deepStrictEqual(malos, []);
});

prueba('el JavaScript del navegador es sintácticamente válido', () => {
  const dir = path.join(__dirname, '..', 'src');
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      try { new vm.Script(m[1], { filename: f }); }
      catch (e) { throw new Error(`${f}: ${e.message}`); }
    }
  }
});

prueba('resumen de WhatsApp con 🔴 / ✅ y datos de pago al final', () => {
  const g = crearMock();
  g.agregarJugadores('Ana\nBeto\nCarla');
  g.registrarAbono('Beto', 6000);
  g.registrarPartido('2026-10-25', 3000, ['Ana', 'Beto'], 'Halcones');
  let r = g.getResumen();
  assert.deepStrictEqual([...r.matchAll(/\p{Extended_Pictographic}/gu)].map(m => m[0]), ['\u{1F534}', '\u2705']);
  assert.match(r, /^\*AndesFC - Saldos al \d{2}-\d{2}-\d{4}\*\n\n\u{1F534} \*Deben\*\n• Ana: \$3\.000\n\n\u2705 \*A favor\*\n• Beto: \$3\.000$/u);
  assert.strictEqual(g.setDatosPago('  Por favor ponerse al día\nCuenta RUT 1-9  '), 'Por favor ponerse al día\nCuenta RUT 1-9');
  r = g.getResumen();
  assert.ok(r.endsWith('\n\nPor favor ponerse al día\nCuenta RUT 1-9'));
  g.registrarAbono('Ana', 3000);                       // nadie debe: no se piden datos de pago
  assert.doesNotMatch(g.getResumen(), /Cuenta RUT/);
  g.setDatosPago('');
  assert.strictEqual(g.getDatosPago(), '');
});

prueba('borrar un abono corrige el saldo', () => {
  const g = crearMock();
  g.agregarJugadores('Ana');
  g.registrarAbono('Ana', 5000, 'mal ingresado');
  g.registrarAbono('Ana', 3000);
  const m = g.getMovimientosJugador('Ana', 100).find(x => x.nota === 'mal ingresado');
  assert.deepStrictEqual({ ...g.eliminarMovimiento(m.fila, m.firma) }, { tipo: 'ABONO', monto: 5000, jugador: 'Ana' });
  assert.deepStrictEqual(saldos(g), { Ana: 3000 });
});

prueba('borrar el cobro de un partido quita al jugador de ese partido', () => {
  const g = crearMock();
  g.agregarJugadores('Ana\nBeto');
  const id = g.registrarPartido('2026-10-25', 3000, [], 'Halcones');
  g.setJugadoresPartido(id, ['Ana', 'Beto']);
  const m = g.getMovimientosJugador('Beto', 100)[0];
  assert.strictEqual(m.partidoId, id);
  g.eliminarMovimiento(m.fila, m.firma);
  assert.deepStrictEqual(saldos(g), { Ana: -3000, Beto: 0 });
  assert.deepStrictEqual(Array.from(g.getPartidos()[0].jugadores), ['Ana']);
});

prueba('no borra si la fila cambió (firma distinta) o ya no existe', () => {
  const g = crearMock();
  g.agregarJugadores('Ana\nBeto');
  g.registrarAbono('Ana', 1000);
  g.registrarAbono('Beto', 2000);
  const [ana] = g.getMovimientosJugador('Ana', 100);
  const [beto] = g.getMovimientosJugador('Beto', 100);
  g.eliminarMovimiento(ana.fila, ana.firma);                 // la fila de Beto se corre hacia arriba
  assert.throws(() => g.eliminarMovimiento(beto.fila, beto.firma), /ya no existe|cambió/);
  assert.deepStrictEqual(saldos(g), { Ana: 0, Beto: 2000 }); // Beto intacto
  const [beto2] = g.getMovimientosJugador('Beto', 100);      // con la fila actualizada sí se borra
  g.eliminarMovimiento(beto2.fila, beto2.firma);
  assert.deepStrictEqual(saldos(g), { Ana: 0, Beto: 0 });
});

prueba('guardar, leer y borrar el resultado de un partido', () => {
  const g = crearMock();
  const id = g.registrarPartido('2026-10-25', 3000, [], 'Halcones');
  assert.strictEqual(g.getPartidos()[0].resultado, null);
  assert.deepStrictEqual({ ...g.setResultado(id, '5', 2) }, { nosotros: 5, ellos: 2 });
  assert.deepStrictEqual({ ...g.getPartidos()[0].resultado }, { nosotros: 5, ellos: 2 });
  assert.strictEqual(g.data.Partidos[0][6], 'Resultado');           // encabezado creado
  assert.strictEqual(g.data.Partidos[1][6], '5-2');
  assert.throws(() => g.setResultado(id, 3, ''), /ambos equipos/);
  assert.throws(() => g.setResultado(id, -1, 2), /ambos equipos/);
  assert.strictEqual(g.setResultado(id, '', ''), null);
  assert.strictEqual(g.getPartidos()[0].resultado, null);
});

prueba('un resultado que Sheets convirtió en fecha se lee bien', () => {
  const g = crearMock();
  const id = g.registrarPartido('2026-10-25', 3000, [], 'Borgoña');
  g.data.Partidos[1][6] = new g.Date(2026, 1, 5);                   // "5-2" convertido al 5 de febrero
  assert.deepStrictEqual({ ...g.getPartidos()[0].resultado }, { nosotros: 5, ellos: 2 });
});

let fallas = 0;
for (const [nombre, fn] of pruebas) {
  try { fn(); console.log('  ✓ ' + nombre); }
  catch (e) { fallas++; console.log('  ✗ ' + nombre + '\n    ' + e.message.split('\n').join('\n    ')); }
}
console.log(`\n${pruebas.length - fallas}/${pruebas.length} pruebas OK`);
process.exit(fallas ? 1 : 0);

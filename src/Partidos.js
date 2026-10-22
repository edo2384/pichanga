// ---------- partidos ----------
function registrarPartido(fecha, costo, jugadores, rival) {
  costo = Number(costo);
  rival = String(rival || '').trim();
  jugadores = jugadores || [];
  if (!fecha || !(costo > 0) || !rival) throw new Error('Falta fecha, rival o costo');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const tz = Session.getScriptTimeZone();
    const ahora = new Date();
    const f = fechaLocal_(fecha);
    const id = 'P' + Utilities.formatDate(ahora, tz, 'yyyyMMddHHmmss');

    const p = hoja_('Partidos');
    if (!p.getRange(1, 5).getValue()) p.getRange(1, 5).setValue('Rival').setFontWeight('bold'); // hojas creadas con la v1
    p.appendRow([id, f, costo, jugadores.join(', '), rival]);

    if (jugadores.length) {
      const filas = jugadores.map(j => [ahora, f, j, 'CARGO', costo, id, 'vs ' + rival]);
      const m = hoja_('Movimientos');
      m.getRange(m.getLastRow() + 1, 1, filas.length, filas[0].length).setValues(filas);
    }
    return id;
  } finally {
    lock.releaseLock();
  }
}

/** Fila (1-based) de un partido en la hoja Partidos, o -1. */
function filaPartido_(id) {
  const i = filas_('Partidos').findIndex(r => String(r[0]) === id);
  return i < 0 ? -1 : i + 2;
}

/**
 * Deja asignados al partido exactamente estos jugadores:
 * crea el CARGO de los nuevos y borra el de los que se quitaron.
 */
function setJugadoresPartido(id, jugadores) {
  jugadores = [...new Set((jugadores || []).map(s => String(s).trim()).filter(Boolean))];
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const fila = filaPartido_(id);
    if (fila < 0) throw new Error('Partido no encontrado');
    const p = hoja_('Partidos');
    const [, f, costo, , rival] = p.getRange(fila, 1, 1, 5).getValues()[0];

    const m = hoja_('Movimientos');
    const movs = filas_('Movimientos');
    const actuales = new Set(movs
      .filter(r => String(r[5]) === id && String(r[3]).toUpperCase() === 'CARGO')
      .map(r => String(r[2]).trim()));
    const nuevos = new Set(jugadores);
    const quitar = [...actuales].filter(j => !nuevos.has(j));
    const agregar = jugadores.filter(j => !actuales.has(j));

    // borrar cargos de los que salen (de abajo hacia arriba)
    for (let i = movs.length - 1; i >= 0; i--) {
      const r = movs[i];
      if (String(r[5]) === id && String(r[3]).toUpperCase() === 'CARGO' && quitar.includes(String(r[2]).trim())) {
        m.deleteRow(i + 2);
      }
    }
    // agregar cargos de los que entran
    if (agregar.length) {
      const ahora = new Date();
      const nota = rival ? 'vs ' + rival : '';
      const filas = agregar.map(j => [ahora, f, j, 'CARGO', Number(costo) || 0, id, nota]);
      m.getRange(m.getLastRow() + 1, 1, filas.length, filas[0].length).setValues(filas);
    }
    p.getRange(fila, 4).setValue(jugadores.sort((a, b) => a.localeCompare(b, 'es')).join(', '));
    return { agregados: agregar.length, quitados: quitar.length };
  } finally {
    lock.releaseLock();
  }
}

/** Corrige fecha, rival o costo de un partido y actualiza sus cargos. */
function actualizarPartido(id, fecha, rival, costo) {
  costo = Number(costo);
  rival = String(rival || '').trim();
  if (!fecha || !(costo > 0) || !rival) throw new Error('Falta fecha, rival o costo');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const fila = filaPartido_(id);
    if (fila < 0) throw new Error('Partido no encontrado');
    const f = fechaLocal_(fecha);
    const p = hoja_('Partidos');
    p.getRange(fila, 2, 1, 2).setValues([[f, costo]]);
    p.getRange(fila, 5).setValue(rival);

    const m = hoja_('Movimientos');
    filas_('Movimientos').forEach((r, i) => {
      if (String(r[5]) === id && String(r[3]).toUpperCase() === 'CARGO') {
        m.getRange(i + 2, 2).setValue(f);
        m.getRange(i + 2, 5).setValue(costo);
        m.getRange(i + 2, 7).setValue('vs ' + rival);
      }
    });
  } finally {
    lock.releaseLock();
  }
}

/** Lista de partidos, más recientes primero (fechas como texto: google.script.run no transporta Date). */
function getPartidos() {
  const tz = Session.getScriptTimeZone();
  return filas_('Partidos')
    .filter(r => String(r[0]).trim())
    .map(r => {
      const f = r[1] instanceof Date ? r[1] : null;
      return {
        id: String(r[0]),
        fecha: f ? Utilities.formatDate(f, tz, 'dd-MM-yyyy') : String(r[1]),
        fechaISO: f ? Utilities.formatDate(f, tz, 'yyyy-MM-dd') : '',
        orden: f ? f.getTime() : 0,
        costo: Number(r[2]) || 0,
        jugadores: String(r[3] || '').split(',').map(s => s.trim()).filter(Boolean),
        rival: String(r[4] || '').trim(),
        resultado: leerResultado_(r[6])
      };
    })
    .sort((a, b) => b.orden - a.orden || b.id.localeCompare(a.id));
}

// ---------- resultado del partido (columna G: "goles AndesFC-goles rival") ----------
const COL_RESULTADO = 7;

/**
 * Devuelve {nosotros, ellos} o null. Acepta '5-2', '5 - 2' y también fechas:
 * Google Sheets convierte '5-2' en el 5 de febrero si la celda no está como texto.
 */
function leerResultado_(v) {
  if (v instanceof Date) return { nosotros: v.getDate(), ellos: v.getMonth() + 1 };
  const m = String(v || '').match(/^\s*(\d{1,2})\s*[-–]\s*(\d{1,2})\s*$/);
  return m ? { nosotros: Number(m[1]), ellos: Number(m[2]) } : null;
}

/** Guarda el resultado; con ambos goles vacíos lo borra. */
function setResultado(id, nosotros, ellos) {
  const vacio = v => v === '' || v === null || v === undefined;
  const fila = filaPartido_(id);
  if (fila < 0) throw new Error('Partido no encontrado');
  const p = hoja_('Partidos');
  if (!p.getRange(1, 6).getValue()) p.getRange(1, 6).setValue('Sede').setFontWeight('bold');
  if (!p.getRange(1, COL_RESULTADO).getValue()) p.getRange(1, COL_RESULTADO).setValue('Resultado').setFontWeight('bold');
  const celda = p.getRange(fila, COL_RESULTADO).setNumberFormat('@');   // texto: que no se convierta en fecha
  if (vacio(nosotros) && vacio(ellos)) { celda.setValue(''); return null; }
  if (vacio(nosotros) || vacio(ellos)) throw new Error('Ingresa los goles de ambos equipos (números de 0 a 99)');
  const a = Number(nosotros), b = Number(ellos);
  const ok = n => Number.isInteger(n) && n >= 0 && n <= 99;
  if (!ok(a) || !ok(b)) throw new Error('Ingresa los goles de ambos equipos (números de 0 a 99)');
  celda.setValue(`${a}-${b}`);
  return { nosotros: a, ellos: b };
}

/** Elimina un partido y todos los cargos que generó (los saldos se recalculan solos). */
function eliminarPartido(id) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const borrarFilas = (nombre, col) => {
      const s = hoja_(nombre);
      const datos = filas_(nombre);
      for (let i = datos.length - 1; i >= 0; i--) {          // de abajo hacia arriba
        if (String(datos[i][col]) === id) s.deleteRow(i + 2);
      }
    };
    borrarFilas('Movimientos', 5);   // columna F = PartidoID
    borrarFilas('Partidos', 0);      // columna A = ID
  } finally {
    lock.releaseLock();
  }
}

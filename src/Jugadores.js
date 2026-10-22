// ---------- jugadores ----------
/** Solo jugadores activos (para Partido y Abono). */
function getJugadores() {
  return filas_('Jugadores')
    .filter(r => String(r[0]).trim() && esActivo_(r[1]))
    .map(r => String(r[0]).trim())
    .sort((a, b) => a.localeCompare(b, 'es'));
}

/** Todos los jugadores (activos e inactivos) con su saldo, para la pestaña Jugadores. */
function getPlantel() {
  const saldos = {};
  getSaldos().forEach(x => saldos[x.nombre] = x.saldo);
  return filas_('Jugadores')
    .filter(r => String(r[0]).trim())
    .map(r => {
      const nombre = String(r[0]).trim();
      return { nombre, activo: esActivo_(r[1]), saldo: saldos[nombre] || 0 };
    })
    .sort((a, b) => (b.activo - a.activo) || a.nombre.localeCompare(b.nombre, 'es'));
}

/** Agrega uno o varios jugadores (uno por línea o separados por coma). */
function agregarJugadores(texto) {
  const nombres = String(texto || '').split(/[\n,]/).map(s => s.trim()).filter(Boolean);
  if (!nombres.length) throw new Error('Escribe al menos un nombre');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const existentes = new Set(filas_('Jugadores').map(r => String(r[0]).trim().toLowerCase()));
    const nuevos = [], repetidos = [];
    nombres.forEach(n => {
      const k = n.toLowerCase();
      if (existentes.has(k)) repetidos.push(n);
      else { existentes.add(k); nuevos.push([n, true]); }
    });
    if (nuevos.length) {
      const s = hoja_('Jugadores');
      s.getRange(s.getLastRow() + 1, 1, nuevos.length, 2).setValues(nuevos);
    }
    return { agregados: nuevos.length, repetidos };
  } finally {
    lock.releaseLock();
  }
}

/** Activa/desactiva un jugador. Los inactivos no salen en Partido/Abono, pero conservan su historial y saldo. */
function setActivo(nombre, activo) {
  const i = filas_('Jugadores').findIndex(r => String(r[0]).trim() === nombre);
  if (i < 0) throw new Error('Jugador no encontrado');
  hoja_('Jugadores').getRange(i + 2, 2).setValue(!!activo);
}

/** Renombra un jugador en la hoja Jugadores y en todos sus movimientos. */
function renombrarJugador(viejo, nuevo) {
  nuevo = String(nuevo || '').trim();
  if (!nuevo) throw new Error('Nombre vacío');
  const jug = filas_('Jugadores');
  if (jug.some(r => String(r[0]).trim().toLowerCase() === nuevo.toLowerCase() && String(r[0]).trim() !== viejo)) {
    throw new Error('Ya existe un jugador con ese nombre');
  }
  const i = jug.findIndex(r => String(r[0]).trim() === viejo);
  if (i < 0) throw new Error('Jugador no encontrado');
  hoja_('Jugadores').getRange(i + 2, 1).setValue(nuevo);

  const m = hoja_('Movimientos');
  const last = m.getLastRow();
  if (last >= 2) {
    const col = m.getRange(2, 3, last - 1, 1);
    const vals = col.getValues().map(r => [String(r[0]).trim() === viejo ? nuevo : r[0]]);
    col.setValues(vals);
  }

  // también en la lista de asistentes de cada partido
  const p = hoja_('Partidos');
  const lastP = p.getLastRow();
  if (lastP >= 2) {
    const colP = p.getRange(2, 4, lastP - 1, 1);
    colP.setValues(colP.getValues().map(r => [
      String(r[0]).split(',').map(s => s.trim() === viejo ? nuevo : s.trim()).join(', ')
    ]));
  }
}

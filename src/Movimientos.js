// ---------- abonos, saldos y movimientos ----------
function registrarAbono(jugador, monto, nota) {
  monto = Number(monto);
  if (!jugador || !(monto > 0)) throw new Error('Falta jugador o monto');
  hoja_('Movimientos').appendRow([new Date(), new Date(), jugador, 'ABONO', monto, '', nota || '']);
}

function getSaldos() {
  const saldos = {};
  getJugadores().forEach(j => saldos[j] = 0);
  filas_('Movimientos').forEach(r => {
    const jugador = String(r[2]).trim();
    const tipo = String(r[3]).toUpperCase();
    const monto = Number(r[4]) || 0;
    if (!jugador) return;
    saldos[jugador] = (saldos[jugador] || 0) + (tipo === 'ABONO' ? monto : -monto);
  });
  return Object.entries(saldos)
    .map(([nombre, saldo]) => ({ nombre, saldo }))
    .sort((a, b) => a.saldo - b.saldo);
}

/**
 * Texto para WhatsApp. WhatsApp muestra en negrita lo que va entre asteriscos.
 * Los emojis van como escapes Unicode para que ningún paso (git, clasp, editor) los altere.
 * Al final agrega los datos de pago guardados en la configuración (no en el código).
 */
function getResumen() {
  const saldos = getSaldos();
  const deben = saldos.filter(x => x.saldo < 0);                                   // más deuda primero
  const favor = saldos.filter(x => x.saldo > 0).sort((a, b) => b.saldo - a.saldo); // más saldo primero
  const hoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy');

  const linea = x => `• ${x.nombre}: ${miles_(x.saldo)}`;
  const partes = [`*AndesFC - Saldos al ${hoy}*`];
  const ROJO = '\u{1F534}', CHECK = '\u2705';
  partes.push(deben.length ? `${ROJO} *Deben*\n` + deben.map(linea).join('\n') : `${CHECK} Nadie debe. ¡Todos al día!`);
  if (favor.length) partes.push(`${CHECK} *A favor*\n` + favor.map(linea).join('\n'));
  const pago = getDatosPago();
  if (pago && deben.length) partes.push(pago);
  return partes.join('\n\n');
}

// ---------- datos de pago (se guardan en Propiedades del script, nunca en el código) ----------
function getDatosPago() {
  verificarAcceso_();          // las Propiedades no dependen de la hoja: se protege a mano
  return PropertiesService.getScriptProperties().getProperty('DATOS_PAGO') || '';
}

function setDatosPago(texto) {
  verificarAcceso_();
  texto = String(texto || '').trim();
  if (texto.length > 500) throw new Error('Los datos de pago son muy largos (máximo 500 caracteres)');
  const p = PropertiesService.getScriptProperties();
  if (texto) p.setProperty('DATOS_PAGO', texto); else p.deleteProperty('DATOS_PAGO');
  return texto;
}

/**
 * Movimientos de un jugador, más recientes primero.
 * Cada uno trae su fila y una firma para poder borrarlo con seguridad (ver eliminarMovimiento).
 */
function getMovimientosJugador(nombre, limite) {
  const tz = Session.getScriptTimeZone();
  return filas_('Movimientos')
    .map((r, i) => ({ r, fila: i + 2 }))
    .filter(({ r }) => String(r[2]).trim() === nombre)
    .map(({ r, fila }) => {
      const f = r[1] instanceof Date ? r[1] : (r[0] instanceof Date ? r[0] : null);
      return {
        fila,
        firma: firmaMovimiento_(r),
        fecha: f ? Utilities.formatDate(f, tz, 'dd-MM-yyyy') : '',
        orden: f ? f.getTime() : 0,
        tipo: String(r[3]).toUpperCase(),
        monto: Number(r[4]) || 0,
        partidoId: String(r[5] || ''),
        nota: String(r[6] || '')
      };
    })
    .sort((a, b) => b.orden - a.orden || b.fila - a.fila)
    .slice(0, limite || 15);
}

/** Identifica una fila de Movimientos por su contenido (las filas se corren al borrar otras). */
function firmaMovimiento_(r) {
  const ts = r[0] instanceof Date ? r[0].getTime() : String(r[0]);
  return [ts, String(r[2]).trim(), String(r[3]).toUpperCase(), Number(r[4]) || 0, String(r[5] || '')].join('|');
}

/**
 * Borra un movimiento. Si la fila ya no corresponde a la firma (la hoja cambió), no borra nada.
 * Borrar el cobro de un partido también quita al jugador de la lista de asistentes de ese partido.
 */
function eliminarMovimiento(fila, firma) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const m = hoja_('Movimientos');
    fila = Number(fila);
    if (!(fila >= 2 && fila <= m.getLastRow())) throw new Error('El registro ya no existe. Recarga la pantalla.');
    const r = m.getRange(fila, 1, 1, 7).getValues()[0];
    if (firmaMovimiento_(r) !== firma) throw new Error('El registro cambió desde que abriste la pantalla. Recarga e intenta de nuevo.');

    const jugador = String(r[2]).trim(), tipo = String(r[3]).toUpperCase(), partidoId = String(r[5] || '');
    m.deleteRow(fila);

    if (tipo === 'CARGO' && partidoId) {
      const fp = filaPartido_(partidoId);
      if (fp > 0) {
        const c = hoja_('Partidos').getRange(fp, 4);
        c.setValue(String(c.getValue()).split(',').map(x => x.trim()).filter(x => x && x !== jugador).join(', '));
      }
    }
    return { tipo, monto: Number(r[4]) || 0, jugador };
  } finally {
    lock.releaseLock();
  }
}

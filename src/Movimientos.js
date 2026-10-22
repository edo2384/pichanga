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
 * Texto para WhatsApp. Sin emojis (algunos se rompen al pasar por el enlace de WhatsApp);
 * WhatsApp muestra en negrita lo que va entre asteriscos.
 * Al final agrega los datos de pago guardados en la configuración (no en el código).
 */
function getResumen() {
  const saldos = getSaldos();
  const deben = saldos.filter(x => x.saldo < 0);                                   // más deuda primero
  const favor = saldos.filter(x => x.saldo > 0).sort((a, b) => b.saldo - a.saldo); // más saldo primero
  const hoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy');

  const linea = x => `• ${x.nombre}: ${miles_(x.saldo)}`;
  const partes = [`*AndesFC - Saldos al ${hoy}*`];
  partes.push(deben.length ? '*Deben*\n' + deben.map(linea).join('\n') : 'Nadie debe. ¡Todos al día!');
  if (favor.length) partes.push('*A favor*\n' + favor.map(linea).join('\n'));
  const pago = getDatosPago();
  if (pago && deben.length) partes.push(pago);
  return partes.join('\n\n');
}

// ---------- datos de pago (se guardan en Propiedades del script, nunca en el código) ----------
function getDatosPago() {
  return PropertiesService.getScriptProperties().getProperty('DATOS_PAGO') || '';
}

function setDatosPago(texto) {
  texto = String(texto || '').trim();
  if (texto.length > 500) throw new Error('Los datos de pago son muy largos (máximo 500 caracteres)');
  const p = PropertiesService.getScriptProperties();
  if (texto) p.setProperty('DATOS_PAGO', texto); else p.deleteProperty('DATOS_PAGO');
  return texto;
}

/** Últimos movimientos de un jugador, más recientes primero. */
function getMovimientosJugador(nombre, limite) {
  const tz = Session.getScriptTimeZone();
  return filas_('Movimientos')
    .filter(r => String(r[2]).trim() === nombre)
    .map(r => {
      const f = r[1] instanceof Date ? r[1] : (r[0] instanceof Date ? r[0] : null);
      return {
        fecha: f ? Utilities.formatDate(f, tz, 'dd-MM-yyyy') : '',
        orden: f ? f.getTime() : 0,
        tipo: String(r[3]).toUpperCase(),
        monto: Number(r[4]) || 0,
        nota: String(r[6] || '')
      };
    })
    .sort((a, b) => b.orden - a.orden)
    .slice(0, limite || 15);
}

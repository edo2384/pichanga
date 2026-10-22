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

function getResumen() {
  const saldos = getSaldos();
  const deben = saldos.filter(x => x.saldo < 0);                                   // más deuda primero
  const favor = saldos.filter(x => x.saldo > 0).sort((a, b) => b.saldo - a.saldo); // más saldo primero
  const hoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy');

  const linea = x => `• ${x.nombre}: ${miles_(x.saldo)}`;
  let t = `⚽ *Saldos al ${hoy}*\n\n`;
  t += '🔴 *Deben*\n' + (deben.length ? deben.map(linea).join('\n') : '• Nadie 🎉') + '\n\n';
  t += '🟢 *A favor*\n' + (favor.length ? favor.map(linea).join('\n') : '• Nadie');
  return t;
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

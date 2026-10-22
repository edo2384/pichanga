/**
 * Pichanga — control de saldos de partidos (Google Apps Script + Google Sheets)
 * Saldo de un jugador = suma(ABONOS) - suma(CARGOS)
 *   > 0 → saldo a favor   |   < 0 → deuda
 *
 * Todos los .js de src/ comparten el ámbito global de Apps Script:
 * una función de un archivo se puede llamar desde cualquier otro.
 */

const HOJAS = {
  Jugadores:   ['Nombre', 'Activo', 'Telefono'],
  Partidos:    ['ID', 'Fecha', 'CostoPorJugador', 'Jugadores', 'Rival'],
  Movimientos: ['Timestamp', 'Fecha', 'Jugador', 'Tipo', 'Monto', 'PartidoID', 'Nota']
};

/** Ícono de la pestaña y del acceso directo: el escudo publicado en el repositorio de GitHub. */
const URL_ESCUDO = 'https://raw.githubusercontent.com/edo2384/pichanga/main/assets/escudo-192.png';

/**
 * Acceso: la app corre con la cuenta de quien la abre (appsscript.json: USER_ACCESSING + ANYONE).
 * Solo entra quien tenga la hoja de cálculo compartida; al resto se le muestra una página de "sin acceso".
 * Para dar acceso a alguien: compartir la hoja con su correo (Editor para registrar, Lector para solo mirar).
 */
function verificarAcceso_() {
  try {
    SpreadsheetApp.getActive().getSheetByName('Jugadores').getLastRow();
  } catch (e) {
    throw new Error('No tienes acceso a la hoja de AndesFC. Pide al administrador que la comparta contigo.');
  }
}

function paginaSinAcceso_() {
  let correo = '';
  try { correo = Session.getActiveUser().getEmail(); } catch (e) { /* sin correo visible */ }
  const quien = correo ? `Entraste como <b>${correo}</b>.` : 'Tu cuenta de Google no tiene acceso.';
  return HtmlService.createHtmlOutput(`
    <div style="font:16px/1.5 system-ui,sans-serif;max-width:420px;margin:15vh auto;padding:0 20px;text-align:center;color:#151715">
      <h1 style="margin:0 0 8px;font-size:26px">AndesFC</h1>
      <p>${quien}</p>
      <p>Esta app es privada. Pide al administrador que comparta la hoja contigo
         y vuelve a abrir el enlace. Si usas varias cuentas de Google, ábrelo en una ventana de incógnito
         con la cuenta correcta.</p>
    </div>`).setTitle('AndesFC: sin acceso').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doGet() {
  try { verificarAcceso_(); } catch (e) { return paginaSinAcceso_(); }
  const out = HtmlService.createTemplateFromFile('index').evaluate()
    .setTitle('AndesFC')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  try { out.setFaviconUrl(URL_ESCUDO); } catch (e) { /* si la URL no está disponible, la app funciona igual */ }
  return out;
}

/** Inserta el contenido de otro archivo HTML del proyecto: <?!= include('estilos') ?> */
function include(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}

/** Ejecutar UNA vez desde el editor: crea las pestañas con encabezados. */
function setup() {
  const ss = SpreadsheetApp.getActive();
  Object.entries(HOJAS).forEach(([nombre, headers]) => {
    const s = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
    if (s.getLastRow() === 0) {
      s.appendRow(headers);
      s.setFrozenRows(1);
      s.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
  });
}

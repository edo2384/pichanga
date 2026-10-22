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

function doGet() {
  return HtmlService.createTemplateFromFile('index').evaluate()
    .setTitle('Pichanga')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
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

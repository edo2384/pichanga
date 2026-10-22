// ---------- helpers compartidos ----------
function hoja_(n) { return SpreadsheetApp.getActive().getSheetByName(n); }

function filas_(n) {
  const s = hoja_(n);
  const last = s.getLastRow();
  return last < 2 ? [] : s.getRange(2, 1, last - 1, s.getLastColumn()).getValues();
}

function fechaLocal_(iso) {           // 'YYYY-MM-DD' → Date a mediodía (evita corrimientos de zona)
  return iso ? new Date(iso + 'T12:00:00') : new Date();
}

function miles_(n) {
  return '$' + String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function esActivo_(v) {
  return !(v === false || ['NO', 'FALSE'].includes(String(v).trim().toUpperCase()));
}

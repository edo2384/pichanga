# Pichanga ⚽

App web para llevar los saldos de los jugadores de los partidos: quién debe y quién tiene saldo a favor.
Usa **Google Sheets como base de datos** y **Google Apps Script** como servidor.

**Ejemplo:** un jugador abona $10.000, juega un partido de $3.000 y le quedan $7.000 a favor.

## Funciones

| Pestaña | Qué hace |
|---|---|
| **Partido** | Lista de partidos. Creas uno nuevo (fecha, rival, costo por jugador), entras y marcas a los jugadores que asistieron. Desde ahí también puedes editar o eliminar el partido. |
| **Abono** | Registra los pagos de cada jugador. |
| **Saldos** | Muestra quién debe y quién tiene a favor, y genera un resumen listo para enviar por WhatsApp. |
| **Jugadores** | Plantel con el saldo de cada jugador. Desde ahí agregas, activas o desactivas, renombras y ves el historial. |

## Estructura

```
src/
  appsscript.json     manifiesto (zona horaria, web app con la cuenta de quien la abre)
  Config.js           HOJAS, doGet, include, setup
  Util.js             helpers de lectura de hojas y formato
  Jugadores.js        plantel: alta, activar/desactivar, renombrar
  Partidos.js         crear, asignar jugadores, editar, eliminar
  Movimientos.js      abonos, saldos, resumen WhatsApp, historial
  index.html          estructura de la página (incluye el resto con <?!= include('...') ?>)
  estilos.html        CSS
  js-*.html           JavaScript del navegador, uno por pestaña
test/backend.test.js  pruebas con una hoja simulada (node, sin dependencias)
.github/workflows/    publica en Apps Script en cada push a main
```

Todos los `.js` de `src/` comparten el ámbito global de Apps Script. clasp los sube como `.gs`.

### Hojas de cálculo

| Hoja | Columnas |
|---|---|
| Jugadores | Nombre, Activo |
| Partidos | ID, Fecha, CostoPorJugador, Jugadores, Rival |
| Movimientos | Timestamp, Fecha, Jugador, Tipo (`ABONO`/`CARGO`), Monto, PartidoID, Nota |

El saldo de cada jugador se calcula siempre a partir de `Movimientos`. Si editas o borras una fila ahí, el saldo se corrige solo.

## Quién puede usarla

La app corre **con la cuenta de Google de quien la abre**. Solo entra quien tenga la **hoja de cálculo compartida**:

- **Editor**: puede registrar partidos, abonos y jugadores.
- **Lector**: puede mirar, pero no guardar cambios.
- Cualquier otra cuenta ve una página de "sin acceso".

Para dar acceso a alguien, abre la hoja, presiona **Compartir** y agrega su correo. La primera vez que abra la app, esa persona tiene que autorizarla.

## Despliegue automático (GitHub → Apps Script)

Cada push a `main` corre las pruebas, ejecuta `clasp push` y actualiza la **misma** implementación web, así que la URL `/exec` no cambia.

### Configuración inicial (una sola vez)

1. Activa la **Apps Script API** en <https://script.google.com/home/usersettings>.
2. En tu PC, instala la misma versión de clasp que usa el workflow e inicia sesión:
   ```bash
   npm install -g @google/clasp@2.4.2
   clasp login
   ```
3. En GitHub, ve a **Settings → Secrets and variables → Actions** y crea:
   - **Secret** `CLASPRC_JSON`: el contenido completo de `~/.clasprc.json`. Es un token de acceso a tu cuenta Google, así que nunca lo subas al repositorio.
   - **Variable** `DEPLOYMENT_ID`: el ID de la implementación, que está en Apps Script → Implementar → Administrar implementaciones.
4. En `.clasp.json`, reemplaza `scriptId` por el ID del proyecto, que está en Apps Script → ⚙️ Configuración del proyecto → *ID de secuencia de comandos*.

### Uso local (opcional)

```bash
node test/backend.test.js   # pruebas
clasp push                  # sube el código sin publicar (para probar con la URL /dev)
```

## Primera vez en una hoja nueva

Después del primer push, abre el editor de Apps Script y ejecuta la función `setup` una vez. Esa función crea las pestañas `Jugadores`, `Partidos` y `Movimientos`.

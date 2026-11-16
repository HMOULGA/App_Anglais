// Application Windows (Electron). Sert l'appli via un protocole app:// sécurisé avec les en-têtes
// COOP/COEP nécessaires au multi-thread de llama.cpp, et autorise le micro.
const { app, BrowserWindow, protocol, net, session, shell, Menu } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true, codeCache: true } },
])

const DIST = path.join(__dirname, '..', 'dist')
const MIME = { '.wasm': 'application/wasm', '.mjs': 'text/javascript', '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' }

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 820,
    minWidth: 380,
    backgroundColor: '#f6f4ef',
    title: 'Fluent',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  })
  win.loadURL('app://fluent/index.html')
  // menu clic droit : couper / copier / coller (absent par défaut dans Electron)
  win.webContents.on('context-menu', (_e, p) => {
    const items = p.isEditable
      ? [{ role: 'cut', label: 'Couper' }, { role: 'copy', label: 'Copier' }, { role: 'paste', label: 'Coller' }, { type: 'separator' }, { role: 'selectAll', label: 'Tout sélectionner' }]
      : p.selectionText ? [{ role: 'copy', label: 'Copier' }] : []
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win })
  })
  // liens externes → navigateur
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
}

app.whenReady().then(() => {
  protocol.handle('app', async (req) => {
    const { pathname } = new URL(req.url)
    const file = path.normalize(path.join(DIST, decodeURIComponent(pathname)))
    if (!file.startsWith(DIST)) return new Response('Forbidden', { status: 403 })
    const res = await net.fetch(pathToFileURL(file).toString())
    const headers = new Headers(res.headers)
    headers.set('Cross-Origin-Opener-Policy', 'same-origin')
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
    headers.set('Cross-Origin-Resource-Policy', 'same-origin')
    const ext = path.extname(file)
    if (MIME[ext]) headers.set('Content-Type', MIME[ext])
    return new Response(res.body, { status: res.status, headers })
  })

  // micro et lecture audio autorisés pour l'appli uniquement
  const ok = new Set(['media', 'audioCapture', 'speaker-selection'])
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(ok.has(perm) && wc.getURL().startsWith('app://')))
  session.defaultSession.setPermissionCheckHandler((wc, perm) => ok.has(perm))

  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

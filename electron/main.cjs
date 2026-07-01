const { app, BrowserWindow, shell, ipcMain, Tray, Menu, nativeImage, dialog } = require('electron')
const path = require('path')
const http = require('http')
const fs = require('fs')

// app.isPackaged is the authoritative check — NODE_ENV is NOT set automatically
// in a packaged Electron app launched from /Applications
const DEV_MODE = !app.isPackaged
const API_PORT = 3001
const VITE_PORT = 5173

let mainWindow = null
let tray = null
let isQuiting = false   // true only when Quit is explicitly chosen

// ─── start the Express API server (in-process, not spawned) ──────────────────
// We use dynamic import() to load server.mjs directly into the main process.
// This avoids all spawn/PATH/module-resolution issues in packaged apps.

async function startApiServer() {
  if (DEV_MODE) return  // dev: 'node server.mjs' is run separately via npm run dev
  try {
    // Tell server.mjs where resources and writable user data are.
    // process.resourcesPath = .../Nexus.app/Contents/Resources/
    // app.getPath('userData') = ~/Library/Application Support/Nexus  (writable)
    process.env.NEXUS_RESOURCES = process.resourcesPath
    process.env.NEXUS_USER_DATA = app.getPath('userData')

    const serverPath = `file://${path.join(__dirname, '..', 'server.mjs')}`
    console.log('[API] Loading server in-process from', serverPath)
    console.log('[API] Resources:', process.resourcesPath)
    console.log('[API] User data:', process.env.NEXUS_USER_DATA)
    await import(serverPath)
    console.log('[API] server.mjs loaded successfully')
  } catch (err) {
    console.error('[API] Failed to load server module:', err)
    throw err
  }
}

// ─── wait for a local port to be ready ───────────────────────────────────────

function waitForPort(port, maxWait = 20000) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      const req = http.get(`http://localhost:${port}/api/health`, (res) => {
        if (res.statusCode < 500) return resolve()
        else retry()
      })
      req.on('error', retry)
    }
    const retry = () => {
      if (Date.now() - start > maxWait) return reject(new Error(`Port ${port} not ready`))
      setTimeout(check, 300)
    }
    check()
  })
}

// ─── tray icon ────────────────────────────────────────────────────────────────

function createTray() {
  // ⬡ hexagon character as the menu bar marker — template image required
  // We use an empty nativeImage + setTitle for a reliable cross-mode text glyph
  tray = new Tray(nativeImage.createEmpty())
  tray.setTitle('⬡')
  tray.setToolTip('Nexus — Goose Director Console')

  const buildMenu = () => Menu.buildFromTemplate([
    {
      label: 'Show Nexus',
      click: () => {
        if (mainWindow) {
          app.focus({ steal: true })
          mainWindow.show()
          mainWindow.focus()
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Nexus',
      click: () => {
        isQuiting = true
        app.quit()
      },
    },
  ])

  tray.setContextMenu(buildMenu())

  // Left-click the tray icon → show + focus if not focused, hide if already focused
  tray.on('click', () => {
    if (!mainWindow) return
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide()
    } else {
      app.focus({ steal: true })
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

// ─── create the window ────────────────────────────────────────────────────────

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',   // macOS native — traffic lights inset
    backgroundColor: '#090806',      // match dark theme, prevent white flash
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    title: 'Nexus',
    show: true,
  })

  mainWindow.center()
  mainWindow.loadURL(url)

  // Enable right-click context menu with cut/copy/paste on all inputs
  mainWindow.webContents.on('context-menu', (_e, params) => {
    const menu = Menu.buildFromTemplate([
      { label: 'Cut',   role: 'cut',   enabled: params.editFlags.canCut },
      { label: 'Copy',  role: 'copy',  enabled: params.editFlags.canCopy },
      { label: 'Paste', role: 'paste', enabled: params.editFlags.canPaste },
      { type: 'separator' },
      { label: 'Select All', role: 'selectAll' },
    ])
    menu.popup()
  })

  // External links open in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Close button → hide to tray (not quit)
  mainWindow.on('close', (e) => {
    if (!isQuiting) {
      e.preventDefault()
      mainWindow.hide()
      // First-time hint — show once, then never again
      if (tray && !app.didShowHideHint) {
        tray.displayBalloon?.({
          title: 'Nexus is still running',
          content: 'Click ⬡ in the menu bar to bring it back. Use Quit to exit.',
        })
        app.didShowHideHint = true
      }
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ─── app lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  try {
    // Minimal macOS application menu (replaces default Electron menu)
    const appMenu = Menu.buildFromTemplate([
      {
        label: 'Nexus',
        submenu: [
          { label: 'About Nexus', role: 'about' },
          { type: 'separator' },
          { label: 'Hide Nexus', role: 'hide' },
          { label: 'Hide Others', role: 'hideOthers' },
          { type: 'separator' },
          {
            label: 'Quit Nexus',
            accelerator: 'Cmd+Q',
            click: () => { isQuiting = true; app.quit() },
          },
        ],
      },
      {
        label: 'Window',
        submenu: [
          {
            label: 'Show Nexus',
            accelerator: 'Cmd+1',
            click: () => {
              if (mainWindow) {
                app.focus({ steal: true })
                mainWindow.show()
                mainWindow.focus()
              }
            },
          },
          { type: 'separator' },
          { label: 'Minimize', role: 'minimize' },
          { label: 'Zoom', role: 'zoom' },
        ],
      },
    ])
    Menu.setApplicationMenu(appMenu)

    // Create tray first so user sees the app is running even during server startup
    createTray()

    try {
      await startApiServer()
      await waitForPort(API_PORT)
    } catch (err) {
      console.error('Server startup failed:', err)
      dialog.showErrorBox(
        'Nexus — Server Failed to Start',
        `The API server could not start.\n\nError: ${err.message}\n\nCheck that port 3001 is not in use by another process.`
      )
      app.quit()
      return
    }

    // Dev: Vite on 5173. Production: Express serves built React on 3001.
    if (DEV_MODE) await waitForPort(VITE_PORT)
    const url = DEV_MODE
      ? `http://localhost:${VITE_PORT}`
      : `http://localhost:${API_PORT}`

    createWindow(url)
  } catch (err) {
    console.error('Startup failed:', err)
    dialog.showErrorBox('Nexus — Startup Error', err.message)
    app.quit()
  }
})

// macOS: keep app running when all windows closed (we hide to tray instead)
app.on('window-all-closed', () => {
  // Do NOT quit — the tray keeps it alive.
  // Only non-Darwin convention quits here.
  if (process.platform !== 'darwin' && isQuiting) app.quit()
})

// macOS Dock icon click → show window
app.on('activate', () => {
  if (mainWindow === null) {
    const url = DEV_MODE
      ? `http://localhost:${VITE_PORT}`
      : `http://localhost:${API_PORT}`
    waitForPort(API_PORT).then(() => createWindow(url))
  } else {
    mainWindow.show()
    mainWindow.focus()
  }
})

// Clean up on actual quit
app.on('before-quit', () => {
  isQuiting = true
})

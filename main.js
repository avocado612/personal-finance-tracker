// Electron main process. Starts the existing Express/Plaid server in-process
// (same server.js used by `npm run server`) and opens it in a dedicated app
// window instead of a Chrome tab.
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { startServer } = require('./server.js');

let mainWindow;

async function createWindow() {
    const { protocol, port } = await startServer();

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 900,
        minHeight: 600,
        title: 'Finance Tracker',
        icon: path.join(__dirname, 'build', 'icon.png'),
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    // Plaid Link OAuth redirects (production) sometimes open a new window/tab —
    // send those to the system browser instead of spawning a second app window.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (!url.startsWith(`${protocol}://localhost:${port}`)) {
            shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    mainWindow.loadURL(`${protocol}://localhost:${port}`);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    // Server lives in this same process, so quitting the last window quits
    // the whole app (matches normal desktop-app behavior on Linux).
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Electron main process. Starts the existing Express/Plaid server in-process
// (same server.js used by `npm run server`) and opens it in a dedicated app
// window instead of a Chrome tab.
const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const { startServer, getGithubToken, GITHUB_REPO } = require('./server.js');

// Manual-trigger only: never check, download, or install on our own — every
// call into autoUpdater below happens because the renderer asked for one
// (App Settings' "Check for Updates" / "Download & Install" / "Restart &
// Install" buttons, via preload.js). autoInstallOnAppQuit is also off so a
// downloaded update can't get installed by just closing the app window.
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

const [GITHUB_OWNER, GITHUB_REPO_NAME] = GITHUB_REPO.split('/');

let mainWindow;

function sendUpdateEvent(payload) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update:event', payload);
    }
}

autoUpdater.on('checking-for-update', () => sendUpdateEvent({ type: 'checking' }));
autoUpdater.on('update-available',    (info) => sendUpdateEvent({ type: 'available', version: info.version }));
autoUpdater.on('update-not-available', (info) => sendUpdateEvent({ type: 'not-available', version: info.version }));
autoUpdater.on('download-progress',   (progress) => sendUpdateEvent({ type: 'progress', percent: progress.percent }));
autoUpdater.on('update-downloaded',   (info) => sendUpdateEvent({ type: 'downloaded', version: info.version }));
autoUpdater.on('error', (err) => sendUpdateEvent({ type: 'error', message: err && err.message ? err.message : String(err) }));

// Repo is private, so every check/download needs the current GitHub token —
// read fresh each time (rather than once at startup) since it can be set,
// changed, or cleared from App Settings without restarting the app.
function configureUpdateFeed() {
    autoUpdater.setFeedURL({
        provider: 'github',
        owner:    GITHUB_OWNER,
        repo:     GITHUB_REPO_NAME,
        private:  true,
        token:    getGithubToken() || undefined,
    });
}

ipcMain.handle('update:check', async () => {
    try {
        configureUpdateFeed();
        await autoUpdater.checkForUpdates();
        return { ok: true };
    } catch (err) {
        sendUpdateEvent({ type: 'error', message: err.message });
        return { ok: false, error: err.message };
    }
});

ipcMain.handle('update:download', async () => {
    try {
        await autoUpdater.downloadUpdate();
        return { ok: true };
    } catch (err) {
        sendUpdateEvent({ type: 'error', message: err.message });
        return { ok: false, error: err.message };
    }
});

ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall(false, true);
});

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
            preload: path.join(__dirname, 'preload.js'),
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

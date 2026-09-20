// Electron preload script. Bridges the sandboxed renderer (index.html/script.js,
// running with contextIsolation on and nodeIntegration off) to the auto-updater
// logic that lives in the main process (main.js) — the renderer can't talk to
// electron-updater directly, so it goes through this narrow IPC surface instead.
//
// Everything here is manual-trigger only: nothing in main.js calls
// checkForUpdates() on its own, so none of this fires unless script.js calls
// one of these methods in response to a user clicking a button in App Settings.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronUpdater', {
    // Kicks off a check. Result arrives async via the 'checking'/'available'/
    // 'not-available'/'error' events below, not via this promise's resolution.
    checkForUpdates: () => ipcRenderer.invoke('update:check'),
    // Starts downloading the release found by the last check. Progress/completion
    // arrive via the 'progress'/'downloaded'/'error' events.
    downloadUpdate:  () => ipcRenderer.invoke('update:download'),
    // Quits and installs the update that finished downloading. The app closes
    // immediately when this succeeds — nothing to await.
    quitAndInstall:  () => ipcRenderer.invoke('update:install'),
    // Subscribes to update lifecycle events. Payload shapes:
    //   { type: 'checking' }
    //   { type: 'available', version }
    //   { type: 'not-available', version }
    //   { type: 'progress', percent }
    //   { type: 'downloaded', version }
    //   { type: 'error', message }
    // Returns an unsubscribe function.
    onEvent: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('update:event', listener);
        return () => ipcRenderer.removeListener('update:event', listener);
    },
});

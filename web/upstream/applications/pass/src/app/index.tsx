import { createRoot } from 'react-dom/client';

import '@proton/polyfill';
import { initSafariFontFixClassnames } from '@proton/shared/lib/helpers/initSafariFontFixClassnames';

import NotificationsProvider from '@proton/components/containers/notifications/Provider';
import { EagleVaultApp } from './EagleVault/EagleVaultApp';
import { isEagleVaultMode } from './EagleVault/mode';
import './style';

initSafariFontFixClassnames();

const container = document.querySelector('.app-root');
const root = createRoot(container!);
const eagleVaultMode = isEagleVaultMode(window.location.hostname, window.location.search);

if (eagleVaultMode) {
    root.render(<NotificationsProvider><EagleVaultApp /></NotificationsProvider>);
} else {
    void import('@proton/pass/lib/file-storage/fs').then(({ fileStorageReady }) => {
        void fileStorageReady.then((instance) => {
            /** Clear only the GC queue on startup to handle multiple
             * concurrent sessions across browser tabs */
            instance.attachGarbageCollector(localStorage);
            return instance.gc?.clearQueue();
        });
    });
    void import('./App').then(({ App }) => root.render(<App />));
}

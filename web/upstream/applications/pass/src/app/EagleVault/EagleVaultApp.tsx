import { useState, type FormEvent } from 'react';

import { VaultwardenClient } from '../../../../../../src/api/vaultwarden-client';
import { loginToVaultwarden } from '../../../../../../src/auth/vaultwarden-password-login';
import { initializeBitwardenCryptoSdk } from '../../../../../../src/crypto/bitwarden-sdk-loader';

import './EagleVaultApp.scss';

type ConnectionState = {
    serverUrl: string;
    email: string;
    cipherCount: number;
    folderCount: number;
};

const DEVICE_STORAGE_KEY = 'eaglevault.web.device-id';
const CLIENT_ID = 'web';
const DEVICE_TYPE_UNKNOWN_BROWSER = '14';

const getDeviceIdentifier = (): string => {
    try {
        const existing = localStorage.getItem(DEVICE_STORAGE_KEY);
        if (existing) return existing;
        const created = crypto.randomUUID();
        localStorage.setItem(DEVICE_STORAGE_KEY, created);
        return created;
    } catch {
        return crypto.randomUUID();
    }
};

export const EagleVaultApp = () => {
    const [serverUrl, setServerUrl] = useState('');
    const [email, setEmail] = useState('');
    const [masterPassword, setMasterPassword] = useState('');
    const [twoFactorToken, setTwoFactorToken] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [connection, setConnection] = useState<ConnectionState | null>(null);

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        setConnection(null);

        try {
            await initializeBitwardenCryptoSdk();
            const normalizedServerUrl = new URL(serverUrl.trim()).toString().replace(/\/$/, '');
            const tokens = await loginToVaultwarden({
                serverUrl: normalizedServerUrl,
                email,
                masterPassword,
                clientId: CLIENT_ID,
                deviceIdentifier: getDeviceIdentifier(),
                deviceName: 'EagleVault Web',
                deviceType: DEVICE_TYPE_UNKNOWN_BROWSER,
                twoFactorToken: twoFactorToken.trim() || undefined,
                twoFactorProvider: twoFactorToken.trim() ? 0 : undefined,
            });

            // Tokens remain in memory only until persistent storage and refresh
            // lifecycle are implemented and reviewed.
            const client = new VaultwardenClient({
                serverUrl: normalizedServerUrl,
                accessToken: async () => tokens.access_token,
            });
            const [sync, folders] = await Promise.all([client.sync(), client.listFolders()]);
            setConnection({
                serverUrl: normalizedServerUrl,
                email: email.trim().toLowerCase(),
                cipherCount: Array.isArray(sync.ciphers) ? sync.ciphers.length : 0,
                folderCount: Array.isArray(folders.data) ? folders.data.length : 0,
            });
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Unable to sign in to this Vaultwarden server.');
        } finally {
            setMasterPassword('');
            setTwoFactorToken('');
            setBusy(false);
        }
    };

    const signOut = () => {
        setConnection(null);
        setTwoFactorToken('');
        setError('');
    };

    return (
        <main className="eaglevault">
            <section className="eaglevault__panel">
                <div className="eaglevault__brand">
                    <span className="eaglevault__mark" aria-hidden="true">E</span>
                    <span>EagleVault</span>
                </div>

                {connection ? (
                    <div className="eaglevault__connected">
                        <div className="eaglevault__status" role="status">Connected</div>
                        <h1>Your vault server is reachable.</h1>
                        <p className="eaglevault__muted">{connection.email} · {new URL(connection.serverUrl).host}</p>
                        <div className="eaglevault__stats">
                            <div><strong>{connection.cipherCount}</strong><span>Encrypted items</span></div>
                            <div><strong>{connection.folderCount}</strong><span>Folders</span></div>
                        </div>
                        <p className="eaglevault__notice">
                            Authentication and sync are working. Vault decryption and the Proton item-view
                            adapter are the next integration stage. Your access token exists only in this
                            page's memory and will be discarded when you sign out or reload.
                        </p>
                        <button className="eaglevault__button" type="button" onClick={signOut}>Sign out</button>
                    </div>
                ) : (
                    <>
                        <h1>Unlock your vault</h1>
                        <p className="eaglevault__muted">Connect to your Bitwarden-compatible server.</p>
                        <form onSubmit={submit} className="eaglevault__form">
                            <label>
                                Server URL
                                <input type="url" required autoComplete="url" placeholder="https://vault.example.com"
                                    value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} />
                            </label>
                            <label>
                                Email address
                                <input type="email" required autoComplete="username" value={email}
                                    onChange={(event) => setEmail(event.target.value)} />
                            </label>
                            <label>
                                Master password
                                <input type="password" required autoComplete="current-password" value={masterPassword}
                                    onChange={(event) => setMasterPassword(event.target.value)} />
                            </label>
                            <label>
                                Authenticator app code <span>(optional)</span>
                                <input inputMode="numeric" autoComplete="one-time-code" value={twoFactorToken}
                                    onChange={(event) => setTwoFactorToken(event.target.value)} />
                            </label>
                            {error && <p className="eaglevault__error" role="alert">{error}</p>}
                            <button className="eaglevault__button" type="submit" disabled={busy}>
                                {busy ? 'Connecting…' : 'Sign in'}
                            </button>
                        </form>
                        <p className="eaglevault__footnote">
                            Credentials are sent only to the server URL you enter. The master password is used
                            locally to derive the Bitwarden-compatible authentication hash.
                        </p>
                    </>
                )}
            </section>
        </main>
    );
};

import { useRef, useState, type FormEvent } from 'react';

import { VaultwardenClient } from '../../../../../../src/api/vaultwarden-client';
import { loginToVaultwarden } from '../../../../../../src/auth/vaultwarden-password-login';
import { BitwardenCryptoProvider } from '../../../../../../src/crypto/bitwarden-crypto';
import { decryptBitwardenCipher, type DecryptedCipher } from '../../../../../../src/crypto/bitwarden-vault-decryptor';
import { initializeBitwardenCryptoSdk } from '../../../../../../src/crypto/bitwarden-sdk-loader';

import './EagleVaultApp.scss';

type ConnectionState = {
    serverUrl: string;
    email: string;
    cipherCount: number;
    folderCount: number;
    unreadableCount: number;
};

type ItemSummary = {
    id: string;
    name: string;
    type: number;
    subtitle: string;
    favorite: boolean;
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

const getString = (value: unknown): string => typeof value === 'string' ? value : '';

const getCipherSubtitle = (cipher: DecryptedCipher): string => {
    const login = cipher.login;
    const username = isRecord(login) ? getString(login.username) : '';
    const uris = isRecord(login) && Array.isArray(login.uris) ? login.uris : [];
    const firstUri = uris.length && isRecord(uris[0]) ? getString(uris[0].uri) : '';
    return username || firstUri || cipherTypeLabel(cipher.type);
};

const cipherTypeLabel = (type: number): string => {
    switch (type) {
        case 1: return 'Login';
        case 2: return 'Secure note';
        case 3: return 'Card';
        case 4: return 'Identity';
        case 5: return 'SSH key';
        default: return 'Other item';
    }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const wipePlaintext = (value: unknown): void => {
    if (Array.isArray(value)) {
        for (const entry of value) wipePlaintext(entry);
    } else if (isRecord(value)) {
        for (const key of Object.keys(value)) {
            if (typeof value[key] === 'string') value[key] = '';
            else wipePlaintext(value[key]);
        }
    }
};

const clearDecryptedItems = (items: DecryptedCipher[]): void => {
    for (const item of items) {
        item.name = '';
        item.notes = '';
        wipePlaintext(item.login);
        wipePlaintext(item.secureNote);
        wipePlaintext(item.card);
        wipePlaintext(item.identity);
        wipePlaintext(item.sshKey);
        wipePlaintext(item.bankAccount);
        wipePlaintext(item.driversLicense);
        wipePlaintext(item.passport);
        wipePlaintext(item.fields);
        wipePlaintext(item.passwordHistory);
    }
    items.length = 0;
};

type ItemDetail = { label: string; value: string; sensitive?: boolean };

const getItemDetails = (item: DecryptedCipher): ItemDetail[] => {
    const details: ItemDetail[] = [];
    const add = (label: string, value: unknown, sensitive = false) => {
        if (typeof value === 'string' && value.length > 0) details.push({ label, value, sensitive });
    };
    const addRecord = (record: Record<string, unknown> | null | undefined, fields: Array<[string, string, boolean?]>) => {
        if (!record) return;
        for (const [property, label, sensitive] of fields) add(label, record[property], sensitive);
    };

    addRecord(item.login, [
        ['username', 'Username'], ['password', 'Password', true], ['totp', 'Authenticator secret', true],
    ]);
    const uris = item.login && Array.isArray(item.login.uris) ? item.login.uris : [];
    if (uris.length && isRecord(uris[0])) add('Website', uris[0].uri);

    addRecord(item.card, [
        ['cardholderName', 'Cardholder'], ['brand', 'Card brand'], ['number', 'Card number', true],
        ['expMonth', 'Expiry month'], ['expYear', 'Expiry year'], ['code', 'Security code', true], ['pin', 'PIN', true],
    ]);
    addRecord(item.identity, [
        ['title', 'Title'], ['firstName', 'First name'], ['middleName', 'Middle name'], ['lastName', 'Last name'],
        ['address1', 'Address'], ['address2', 'Address line 2'], ['address3', 'Address line 3'],
        ['city', 'City'], ['state', 'State / province'], ['postalCode', 'Postal code'], ['country', 'Country'],
        ['company', 'Company'], ['email', 'Email'], ['phone', 'Phone'], ['ssn', 'SSN', true],
        ['username', 'Username'], ['passportNumber', 'Passport number', true], ['licenseNumber', 'License number', true],
    ]);
    addRecord(item.sshKey, [
        ['publicKey', 'Public key'], ['fingerprint', 'Fingerprint'], ['privateKey', 'Private key', true],
    ]);
    addRecord(item.bankAccount, [
        ['accountName', 'Account name'], ['accountNumber', 'Account number', true],
        ['routingNumber', 'Routing number', true], ['swiftCode', 'SWIFT'], ['iban', 'IBAN', true],
        ['bic', 'BIC'], ['sortCode', 'Sort code'], ['accountType', 'Account type'],
        ['bankName', 'Bank'], ['branchName', 'Branch'], ['accountOwner', 'Account owner'], ['country', 'Country'],
    ]);
    addRecord(item.driversLicense, [
        ['number', 'License number', true], ['issuedDate', 'Issued'], ['expirationDate', 'Expires'],
        ['issuedBy', 'Issued by'], ['category', 'Category'], ['country', 'Country'], ['state', 'State'],
        ['licenseClass', 'Class'], ['endorsements', 'Endorsements'], ['restrictions', 'Restrictions'],
    ]);
    addRecord(item.passport, [
        ['number', 'Passport number', true], ['country', 'Country'], ['issueDate', 'Issued'],
        ['expirationDate', 'Expires'], ['placeOfIssue', 'Place of issue'], ['type', 'Type'],
        ['name', 'Name'], ['dateOfBirth', 'Date of birth'], ['issuingAuthority', 'Issuing authority'],
    ]);
    for (const field of item.fields ?? []) {
        add(getString(field.name) || 'Custom field', field.value, field.type === 1);
    }
    return details;
};

export const EagleVaultApp = () => {
    const [serverUrl, setServerUrl] = useState('');
    const [email, setEmail] = useState('');
    const [masterPassword, setMasterPassword] = useState('');
    const [twoFactorToken, setTwoFactorToken] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [connection, setConnection] = useState<ConnectionState | null>(null);
    const [items, setItems] = useState<ItemSummary[]>([]);
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
    const [showSensitive, setShowSensitive] = useState(false);

    const clientRef = useRef<VaultwardenClient | null>(null);
    const userKeyRef = useRef<Uint8Array | null>(null);
    const decryptedCiphersRef = useRef<DecryptedCipher[]>([]);

    const clearSession = () => {
        userKeyRef.current?.fill(0);
        userKeyRef.current = null;
        clientRef.current = null;
        clearDecryptedItems(decryptedCiphersRef.current);
        decryptedCiphersRef.current = [];
        for (const item of items) {
            item.name = '';
            item.subtitle = '';
        }
        setItems([]);
        setSelectedItemId(null);
        setShowSensitive(false);
        setConnection(null);
    };

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        clearSession();

        try {
            await initializeBitwardenCryptoSdk();
            const normalizedServerUrl = new URL(serverUrl.trim()).toString().replace(/\/$/, '');
            const cryptoProvider = new BitwardenCryptoProvider();
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
            }, cryptoProvider);

            userKeyRef.current = tokens.userKey;
            // The client and decrypted user key remain in memory only.
            const accessToken = tokens.access_token;
            const client = new VaultwardenClient({
                serverUrl: normalizedServerUrl,
                accessToken: async () => accessToken,
            });
            clientRef.current = client;

            const [sync, folders] = await Promise.all([client.sync(), client.listFolders()]);
            const activeCiphers = (sync.ciphers ?? []).filter((cipher) => !cipher.deletedDate);
            const decrypted: DecryptedCipher[] = [];
            let unreadableCount = 0;

            for (const cipher of activeCiphers) {
                try {
                    decrypted.push(decryptBitwardenCipher(cipher, tokens.userKey, cryptoProvider));
                } catch {
                    // Keep unsupported organization/legacy items encrypted and out of the UI.
                    unreadableCount += 1;
                }
            }

            decryptedCiphersRef.current = decrypted;
            setItems(decrypted.map((cipher) => ({
                id: cipher.id,
                name: cipher.name || 'Untitled item',
                type: cipher.type,
                subtitle: getCipherSubtitle(cipher),
                favorite: cipher.favorite,
            })));
            setConnection({
                serverUrl: normalizedServerUrl,
                email: email.trim().toLowerCase(),
                cipherCount: decrypted.length,
                folderCount: folders.data.length,
                unreadableCount,
            });
        } catch (cause) {
            clearSession();
            setError(cause instanceof Error ? cause.message : 'Unable to sign in to this Vaultwarden server.');
        } finally {
            setMasterPassword('');
            setTwoFactorToken('');
            setBusy(false);
        }
    };

    const signOut = () => {
        clearSession();
        setTwoFactorToken('');
        setError('');
    };

    const selectedItem = selectedItemId
        ? decryptedCiphersRef.current.find((item) => item.id === selectedItemId)
        : undefined;
    const selectedDetails = selectedItem ? getItemDetails(selectedItem) : [];

    return (
        <main className="eaglevault">
            <section className="eaglevault__panel">
                <div className="eaglevault__brand">
                    <span className="eaglevault__mark" aria-hidden="true">E</span>
                    <span>EagleVault</span>
                </div>

                {connection ? (
                    <div className="eaglevault__connected">
                        <div className="eaglevault__status" role="status">Vault unlocked</div>
                        <h1>Your vault is ready.</h1>
                        <p className="eaglevault__muted">{connection.email} · {new URL(connection.serverUrl).host}</p>
                        <div className="eaglevault__stats">
                            <div><strong>{connection.cipherCount}</strong><span>Decrypted items</span></div>
                            <div><strong>{connection.folderCount}</strong><span>Folders</span></div>
                        </div>
                        {connection.unreadableCount > 0 && (
                            <p className="eaglevault__warning" role="status">
                                {connection.unreadableCount} item(s) could not be decrypted. Organization-key
                                items and unsupported formats are not displayed.
                            </p>
                        )}
                        <div className="eaglevault__items" aria-label="Vault items">
                            {items.length === 0 ? (
                                <p className="eaglevault__muted">No supported items found.</p>
                            ) : items.map((item) => (
                                <button
                                    className={'eaglevault__item' + (selectedItemId === item.id ? ' is-selected' : '')}
                                    key={item.id}
                                    type="button"
                                    onClick={() => {
                                        setSelectedItemId(item.id);
                                        setShowSensitive(false);
                                    }}
                                >
                                    <span className="eaglevault__item-title">
                                        {item.favorite ? '★ ' : ''}{item.name}
                                    </span>
                                    <span className="eaglevault__item-subtitle">{item.subtitle}</span>
                                    <span className="eaglevault__item-type">{cipherTypeLabel(item.type)}</span>
                                </button>
                            ))}
                        </div>
                        {selectedItem && (
                            <div className="eaglevault__details">
                                <div className="eaglevault__details-heading">
                                    <h2>{selectedItem.name}</h2>
                                    <span>{cipherTypeLabel(selectedItem.type)}</span>
                                </div>
                                {selectedDetails.map((detail, index) => (
                                    <div className="eaglevault__detail-row" key={detail.label + index}>
                                        <span>{detail.label}</span>
                                        <strong>{detail.sensitive && !showSensitive ? '••••••••' : detail.value}</strong>
                                        {detail.sensitive && (
                                            <button type="button" onClick={() => setShowSensitive((visible) => !visible)}>
                                                {showSensitive ? 'Hide' : 'Reveal'}
                                            </button>
                                        )}
                                    </div>
                                ))}
                                {selectedItem.notes && <p className="eaglevault__notes">{selectedItem.notes}</p>}
                            </div>
                        )}
                        <p className="eaglevault__notice">
                            Item names and supported fields are decrypted locally with the Bitwarden SDK.
                            Passwords stay hidden until selected. The access token and user key remain in
                            memory only and are cleared on sign-out or page reload.
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

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import { EagleVaultClient } from 'eaglevault/api/eaglevault-client';
import { loginToEagleVault, registerEagleVaultAccount } from 'eaglevault/auth/eaglevault-auth';
import { BitwardenCryptoProvider } from 'eaglevault/crypto/bitwarden-crypto';
import { initializeBitwardenCryptoSdk } from 'eaglevault/crypto/bitwarden-sdk-loader';

import {
    enablePasskeyUnlock, existingPasskeyUnlock, removePasskeyUnlock,
    unlockWithPasskey, updateProtectedSession, type ProtectedUnlock,
} from 'eaglevault/auth/eaglevault-passkey';

import { PassFolderIcon } from '../../../../../packages/pass/components/Folders/PassFolderIcon';
import { IconBox } from '../../../../../packages/pass/components/Layout/Icon/IconBox';
import { SubHeader } from '../../../../../packages/pass/components/Layout/Section/SubHeader';
import { PanelHeader } from '../../../../../packages/pass/components/Layout/Panel/PanelHeader';
import { ButtonLike } from '@proton/atoms/Button/ButtonLike';
import { Button } from '@proton/atoms/Button/Button';
import { IcUser } from '@proton/icons/icons/IcUser';
import { IcPlus } from '@proton/icons/icons/IcPlus';

import { presentEagleVaultLogin } from './ProtonItemAdapter';
import { EagleVaultProtonLoginEditor, type EagleVaultLoginDraft } from './EagleVaultProtonLoginEditor';
import { isEagleVaultStaging } from './mode';
import './EagleVaultApp.scss';

type LoginItem = {
    id: string;
    revision: number;
    name: string;
    username: string;
    password: string;
    website: string;
    notes: string;
    folderId: string;
};

type VaultFolder = {
    id: string;
    revision: number;
    name: string;
};

type Screen = 'auth' | 'vault';
type AuthMode = 'login' | 'register';

const emptyDraft = (): Omit<LoginItem, 'id' | 'revision'> => ({
    name: '',
    username: '',
    password: '',
    website: '',
    notes: '',
    folderId: '',
});

const id = (): string => crypto.randomUUID().replaceAll('-', '');

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const clearItems = (items: LoginItem[]): void => {
    for (const item of items) {
        item.name = '';
        item.username = '';
        item.password = '';
        item.website = '';
        item.notes = '';
        item.folderId = '';
    }
    items.length = 0;
};

const clearFolders = (folders: VaultFolder[]): void => {
    for (const folder of folders) folder.name = '';
    folders.length = 0;
};

const wipeItem = (item: LoginItem): void => {
    item.name = '';
    item.username = '';
    item.password = '';
    item.website = '';
    item.notes = '';
    item.folderId = '';
};

const wipeFolder = (folder: VaultFolder): void => {
    folder.name = '';
};

export const EagleVaultApp = () => {
    const [screen, setScreen] = useState<Screen>('auth');
    const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');
    const [authMode, setAuthMode] = useState<AuthMode>('login');
    const [email, setEmail] = useState('');
    const [masterPassword, setMasterPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [items, setItems] = useState<LoginItem[]>([]);
    const [folders, setFolders] = useState<VaultFolder[]>([]);
    const [query, setQuery] = useState('');
    const [folderFilter, setFolderFilter] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [draft, setDraft] = useState(emptyDraft);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [folderName, setFolderName] = useState('');
    const [notice, setNotice] = useState('');
    const [stagingAccessKey, setStagingAccessKey] = useState('');
    const [localPasskey, setLocalPasskey] = useState(existingPasskeyUnlock);

    const passkeyRef = useRef<ProtectedUnlock | null>(null);
    const clientRef = useRef<EagleVaultClient | null>(null);
    const userKeyRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
    const cryptoRef = useRef<BitwardenCryptoProvider | null>(null);
    const itemsRef = useRef<LoginItem[]>([]);
    const foldersRef = useRef<VaultFolder[]>([]);

    useEffect(() => () => {
        userKeyRef.current?.fill(0);
        passkeyRef.current?.userKey.fill(0);
        clearItems(itemsRef.current);
        clearFolders(foldersRef.current);
    }, []);

    const replaceVault = (nextItems: LoginItem[], nextFolders: VaultFolder[]) => {
        const retainedItems = new Set(nextItems);
        const retainedFolders = new Set(nextFolders);
        for (const item of itemsRef.current) {
            if (!retainedItems.has(item)) wipeItem(item);
        }
        for (const folder of foldersRef.current) {
            if (!retainedFolders.has(folder)) wipeFolder(folder);
        }
        itemsRef.current = nextItems;
        foldersRef.current = nextFolders;
        setItems(nextItems);
        setFolders(nextFolders);
    };

    const clearSession = (lock = false) => {
        passkeyRef.current?.userKey.fill(0);
        passkeyRef.current = null;
        userKeyRef.current?.fill(0);
        userKeyRef.current = null;
        clientRef.current?.clearSession();
        clientRef.current = null;
        replaceVault([], []);
        setSelectedId(null);
        setEditingId(null);
        setDraft(emptyDraft());
        setShowPassword(false);
        setQuery('');
        setScreen('auth');
        if (lock) setAuthMode('login');
    };

    const loadVault = async (client: EagleVaultClient, userKey: Uint8Array<ArrayBuffer>) => {
        const cryptoProvider = cryptoRef.current;
        if (!cryptoProvider) throw new Error('Bitwarden cryptography is not initialized.');
        const pages = await client.sync();
        const records = pages.flatMap((page) => page.records);
        const nextItems: LoginItem[] = [];
        const nextFolders: VaultFolder[] = [];
        try {
            for (const record of records) {
                if (!record.ciphertext) continue;
                let decoded: unknown;
                try {
                    decoded = JSON.parse(cryptoProvider.decryptString(record.ciphertext, userKey));
                } catch {
                    throw new Error('The vault contains an item that could not be decrypted. No changes were made.');
                }
                if (!isRecord(decoded)) throw new Error('The vault contains an unsupported encrypted record.');
                if (record.kind === 'item') {
                    if (decoded.type !== 'login' || typeof decoded.name !== 'string') {
                        throw new Error('The vault contains an unsupported item type. No changes were made.');
                    }
                    nextItems.push({
                        id: record.id,
                        revision: record.revision,
                        name: decoded.name,
                        username: typeof decoded.username === 'string' ? decoded.username : '',
                        password: typeof decoded.password === 'string' ? decoded.password : '',
                        website: typeof decoded.website === 'string' ? decoded.website : '',
                        notes: typeof decoded.notes === 'string' ? decoded.notes : '',
                        folderId: typeof decoded.folderId === 'string' ? decoded.folderId : '',
                    });
                } else if (typeof decoded.name === 'string') {
                    nextFolders.push({ id: record.id, revision: record.revision, name: decoded.name });
                } else {
                    throw new Error('The vault contains an unsupported folder record.');
                }
            }
        } catch (cause) {
            clearItems(nextItems);
            clearFolders(nextFolders);
            throw cause;
        }
        replaceVault(nextItems, nextFolders);
    };

    const establishSession = async (mode: AuthMode, event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        setNotice('');
        clearSession();
        try {
            await initializeBitwardenCryptoSdk();
            const client = new EagleVaultClient(undefined, undefined, isEagleVaultStaging ? stagingAccessKey : undefined);
            const cryptoProvider = new BitwardenCryptoProvider();
            cryptoRef.current = cryptoProvider;
            const session = mode === 'register'
                ? await registerEagleVaultAccount(client, email, masterPassword, cryptoProvider)
                : await loginToEagleVault(client, email, masterPassword, cryptoProvider);
            clientRef.current = client;
            userKeyRef.current = session.userKey;
            await loadVault(client, session.userKey);
            setEmail(session.email);
            setScreen('vault');
            setMobileView('list');
        } catch (cause) {
            userKeyRef.current?.fill(0);
            userKeyRef.current = null;
            clientRef.current?.clearSession();
            clientRef.current = null;
            replaceVault([], []);
            setError(cause instanceof Error ? cause.message : 'Unable to connect to EagleVault Core.');
        } finally {
            setMasterPassword('');
            setBusy(false);
        }
    };

    const enableDeviceUnlock = async () => {
        const client = clientRef.current;
        const userKey = userKeyRef.current;
        if (!client || !userKey) return;
        setBusy(true);
        setError('');
        try {
            const protectedUnlock = await enablePasskeyUnlock(email, userKey, client.currentRefreshToken());
            passkeyRef.current?.userKey.fill(0);
            passkeyRef.current = protectedUnlock;
            client.setRefreshTokenObserver(async (token) => updateProtectedSession(protectedUnlock, token));
            setLocalPasskey(existingPasskeyUnlock());
            setNotice('Device unlock enabled on this browser. Keep your master password: this is not account recovery.');
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Unable to enable device unlock.');
        } finally {
            setBusy(false);
        }
    };

    const disableDeviceUnlock = () => {
        clientRef.current?.setRefreshTokenObserver(undefined);
        passkeyRef.current?.userKey.fill(0);
        passkeyRef.current = null;
        removePasskeyUnlock();
        setLocalPasskey(null);
        setNotice('Device unlock was removed from this browser.');
    };

    const unlockDevice = async () => {
        setBusy(true);
        setError('');
        setNotice('');
        clearSession();
        let protectedUnlock: ProtectedUnlock | null = null;
        try {
            protectedUnlock = await unlockWithPasskey();
            const client = new EagleVaultClient(undefined, undefined,
                isEagleVaultStaging ? stagingAccessKey : undefined);
            client.setRefreshTokenObserver(async token => updateProtectedSession(protectedUnlock!, token));
            await client.resumeWithRefreshToken(protectedUnlock.refreshToken);
            await initializeBitwardenCryptoSdk();
            cryptoRef.current = new BitwardenCryptoProvider();
            await loadVault(client, protectedUnlock.userKey);
            clientRef.current = client;
            userKeyRef.current = protectedUnlock.userKey;
            passkeyRef.current = protectedUnlock;
            setEmail(protectedUnlock.email);
            setScreen('vault');
            setMobileView('list');
            setAuthMode('login');
            setNotice('Vault unlocked using your device screen lock.');
        } catch (cause) {
            protectedUnlock?.userKey.fill(0);
            clearSession();
            setError(cause instanceof Error ? cause.message : 'Device unlock failed. Sign in with your master password.');
        } finally {
            setMasterPassword('');
            setBusy(false);
        }
    };

    const syncVault = async () => {
        const client = clientRef.current;
        const userKey = userKeyRef.current;
        if (!client || !userKey) return;
        setBusy(true);
        setError('');
        try {
            await loadVault(client, userKey);
            setNotice('Vault synchronized.');
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Unable to synchronize the vault.');
        } finally {
            setBusy(false);
        }
    };

    const saveItem = async (values: EagleVaultLoginDraft) => {
        const client = clientRef.current;
        const userKey = userKeyRef.current;
        const cryptoProvider = cryptoRef.current;
        if (!client || !userKey || !cryptoProvider) return;
        setBusy(true);
        setError('');
        try {
            const existing = editingId ? itemsRef.current.find((item) => item.id === editingId) : undefined;
            const itemId = existing?.id ?? id();
            const revision = await client.writeRecord(
                'item',
                itemId,
                existing?.revision ?? 0,
                cryptoProvider.encryptString(JSON.stringify({ type: 'login', ...values }), userKey),
            );
            const saved = { ...values, id: itemId, revision };
            const next = existing
                ? itemsRef.current.map((item) => item.id === itemId ? saved : item)
                : [...itemsRef.current, saved];
            replaceVault(next, [...foldersRef.current]);
            setSelectedId(itemId);
            setEditingId(null);
            setDraft(emptyDraft());
            setNotice(existing ? 'Login updated and synchronized.' : 'Login saved and synchronized.');
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Unable to save the encrypted login.');
        } finally {
            setBusy(false);
        }
    };

    const deleteItem = async (item: LoginItem) => {
        const client = clientRef.current;
        if (!client) return;
        setBusy(true);
        setError('');
        try {
            await client.deleteRecord('item', item.id, item.revision);
            replaceVault(itemsRef.current.filter((entry) => entry.id !== item.id), [...foldersRef.current]);
            setSelectedId(null);
            setNotice('Login deleted and synchronized.');
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Unable to delete the encrypted login.');
        } finally {
            setBusy(false);
        }
    };

    const saveFolder = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const client = clientRef.current;
        const userKey = userKeyRef.current;
        const cryptoProvider = cryptoRef.current;
        const name = folderName.trim();
        if (!client || !userKey || !cryptoProvider || !name) return;
        setBusy(true);
        setError('');
        try {
            const folderId = id();
            const revision = await client.writeRecord(
                'folder',
                folderId,
                0,
                cryptoProvider.encryptString(JSON.stringify({ name }), userKey),
            );
            replaceVault([...itemsRef.current], [...foldersRef.current, { id: folderId, revision, name }]);
            setFolderName('');
            setNotice('Folder created and synchronized.');
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Unable to create the encrypted folder.');
        } finally {
            setBusy(false);
        }
    };

    const deleteFolder = async (folder: VaultFolder) => {
        const client = clientRef.current;
        if (!client) return;
        if (itemsRef.current.some((item) => item.folderId === folder.id)) {
            setError('Move or edit this folder’s logins before deleting the folder.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            await client.deleteRecord('folder', folder.id, folder.revision);
            replaceVault([...itemsRef.current], foldersRef.current.filter((entry) => entry.id !== folder.id));
            setNotice('Folder deleted and synchronized.');
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Unable to delete the folder.');
        } finally {
            setBusy(false);
        }
    };

    const logout = async () => {
        setBusy(true);
        setError('');
        try {
            await clientRef.current?.logout();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'The server session could not be revoked.');
        } finally {
            if (existingPasskeyUnlock()?.email === email.toLowerCase()) {
                removePasskeyUnlock();
                setLocalPasskey(null);
            }
            clearSession();
            setStagingAccessKey('');
            setBusy(false);
        }
    };

    const generatePassword = () => {
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+';
        const cutoff = Math.floor(256 / alphabet.length) * alphabet.length;
        let output = '';
        while (output.length < 24) {
            const values = crypto.getRandomValues(new Uint8Array(32));
            for (const value of values) {
                if (value < cutoff) output += alphabet[value % alphabet.length];
                if (output.length === 24) break;
            }
        }
        return output;
    };

    const copyPassword = async (password: string) => {
        try {
            await navigator.clipboard.writeText(password);
            setNotice('Password copied to the clipboard.');
        } catch {
            setError('Clipboard access is unavailable in this browser.');
        }
    };

    const activeFolder = folders.find((folder) => folder.id === folderFilter);
    const activeFolderId = activeFolder?.id;
    const openFolder = (folderId: string | null) => {
        setFolderFilter(folderId);
        setSelectedId(null);
        setEditingId(null);
        setShowPassword(false);
        setDraft({ ...emptyDraft(), folderId: folderId ?? '' });
        setMobileView('list');
    };

    const filteredItems = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        return items.filter((item) =>
            (!activeFolderId || item.folderId === activeFolderId) &&
            (!normalized || [item.name, item.username, item.website].some((value) => value.toLowerCase().includes(normalized))),
        );
    }, [activeFolderId, items, query]);
    // The original Proton Pass presenter supplies list titles and usernames.
    const protonListRows = useMemo(() =>
        filteredItems.map((item) => ({ item, presentation: presentEagleVaultLogin(item) })),
    [filteredItems]);
    const selectedItem = items.find((item) => item.id === selectedId);

    const editItem = (item: LoginItem) => {
        const { id: itemId, revision, ...values } = item;
        void revision;
        setDraft(values);
        setEditingId(itemId);
        setSelectedId(itemId);
        setShowPassword(false);
    };

    const lock = () => {
        void (async () => {
            try {
                if (!passkeyRef.current) await clientRef.current?.logout();
            } catch (cause) {
                setError(cause instanceof Error ? cause.message : 'The session could not be revoked.');
            } finally {
                passkeyRef.current?.userKey.fill(0);
                passkeyRef.current = null;
                userKeyRef.current?.fill(0);
                userKeyRef.current = null;
                clientRef.current?.clearSession();
                clientRef.current = null;
                replaceVault([], []);
                setSelectedId(null);
                setScreen('auth');
                setAuthMode('login');
                setStagingAccessKey('');
                setNotice(localPasskey ? 'Vault locked. Use your device screen lock or master password.' :
                    'Vault locked. Sign in again to unlock it.');
            }
        })();
    };

    return (
        <main className="eaglevault">
            <section className={'eaglevault__panel' + (screen === 'vault' ? ' eaglevault__panel--wide' : '')}>
                <div className="eaglevault__brand">
                    <span className="eaglevault__mark" aria-hidden="true">E</span>
                    <span>EagleVault</span>
                </div>

                {error && <p className="eaglevault__error" role="alert">{error}</p>}
                {notice && <p className="eaglevault__notice" role="status">{notice}</p>}

                {screen === 'vault' ? (
                    <>
                        <div className="eaglevault__vault-header">
                            <div className="eaglevault__header-heading">
                                <span className="eaglevault__status" role="status">Vault unlocked</span>
                                <SubHeader title="Your vault" description={<span className="eaglevault__muted">{email} · EagleVault Core</span>} />
                            </div>
                            <div className="eaglevault__header-actions">
                                {localPasskey?.email === email.toLowerCase() && passkeyRef.current
                                    ? <button type="button" onClick={disableDeviceUnlock} disabled={busy}>
                                        Remove device unlock
                                    </button>
                                    : <button type="button" onClick={enableDeviceUnlock} disabled={busy}>
                                        Enable device unlock
                                    </button>}
                                <Button type="button" size="small" shape="ghost" onClick={syncVault} disabled={busy}>Sync</Button>
                                <Button type="button" size="small" shape="ghost" onClick={lock} disabled={busy}>Lock</Button>
                                <Button type="button" size="small" shape="ghost" onClick={logout} disabled={busy}>Log out</Button>
                            </div>
                        </div>
                        <div className="eaglevault__mobile-navigation" role="navigation" aria-label="Vault navigation">
                            <button type="button" className={mobileView === 'list' ? 'is-active' : ''}
                                onClick={() => setMobileView('list')}>{activeFolder?.name ?? 'All items'}</button>
                            <button type="button" className={mobileView === 'detail' ? 'is-active' : ''}
                                onClick={() => setMobileView('detail')}>{editingId ? 'Edit login' : selectedItem ? 'Details' : 'New login'}</button>
                        </div>
                        <div className={'eaglevault__workspace eaglevault__workspace--' + mobileView}>
                            <nav className="eaglevault__primary-sidebar" aria-label="Vault sections">
                                <div className="eaglevault__sidebar-label">YOUR VAULT</div>
                                <button type="button" className={activeFolderId ? undefined : 'is-active'}
                                    aria-current={activeFolderId ? undefined : 'page'} onClick={() => openFolder(null)}>
                                    <IcUser size={4} /> All items <span>{items.length}</span>
                                </button>
                                <div className="eaglevault__sidebar-label">ORGANIZE</div>
                                {folders.map((folder) => (
                                    <button key={folder.id} type="button" onClick={() => openFolder(folder.id)}
                                        className={activeFolderId === folder.id ? 'is-active' : undefined}
                                        aria-current={activeFolderId === folder.id ? 'page' : undefined}>
                                        <PassFolderIcon size={4}/> {folder.name}
                                    </button>
                                ))}
                                <button type="button" className="eaglevault__sidebar-create"
                                    onClick={() => { setSelectedId(null); setEditingId(null); setDraft({ ...emptyDraft(), folderId: activeFolderId ?? '' }); setMobileView('detail'); }}>
                                    <IcPlus size={4}/> New login
                                </button>
                            </nav>
                            <section className="eaglevault__vault-list">
                                {activeFolder && (
                                    <Button type="button" size="small" shape="ghost" onClick={() => openFolder(null)}>
                                        All items
                                    </Button>
                                )}
                                <label className="eaglevault__search">
                                    <span className="eaglevault__visually-hidden">Search logins</span>
                                    <input type="search" placeholder="Search logins" value={query}
                                        onChange={(event) => setQuery(event.target.value)} />
                                </label>
                                <button type="button" className="eaglevault__secondary-button"
                                    onClick={() => { setSelectedId(null); setEditingId(null); setDraft({ ...emptyDraft(), folderId: activeFolderId ?? '' }); setMobileView('detail'); }}>
                                    <IcPlus size={4}/> Add login
                                </button>
                                <div className="eaglevault__items" aria-label="Vault logins">
                                    {filteredItems.length === 0
                                        ? <p className="eaglevault__muted">No matching logins.</p>
                                        : protonListRows.map(({ item, presentation }) => (
                                            <ButtonLike
                                                as="button"
                                                className={'eaglevault__item' + (selectedId === item.id ? ' is-selected' : '')}
                                                key={item.id}
                                                type="button"
                                                shape="ghost"
                                                color="weak"
                                                onClick={() => { setSelectedId(item.id); setEditingId(null); setShowPassword(false); setMobileView('detail'); }}
                                            >
                                                <IconBox mode="icon" pill size={5} className="eaglevault__login-icon">
                                                    <IcUser size={4}/>
                                                </IconBox>
                                                <span className="eaglevault__item-title">{presentation.heading || 'Untitled login'}</span>
                                                <span className="eaglevault__item-subtitle">{presentation.subheading || item.website}</span>
                                                <span className="eaglevault__item-type">Login</span>
                                            </ButtonLike>
                                        ))}
                                </div>
                                <form className="eaglevault__folder-form" onSubmit={saveFolder}>
                                    <label>
                                        New folder
                                        <input value={folderName} onChange={(event) => setFolderName(event.target.value)}
                                            maxLength={100} required />
                                    </label>
                                    <button type="submit" disabled={busy}>Create</button>
                                </form>
                                <ul className="eaglevault__folder-list" aria-label="Vault folders">
                                    {folders.map((folder) => (
                                        <li key={folder.id}>
                                            <button type="button" className="eaglevault__folder-name"
                                                aria-pressed={activeFolderId === folder.id} onClick={() => openFolder(folder.id)}>
                                                <PassFolderIcon size={4}/>{folder.name}
                                            </button>
                                            <button type="button" onClick={() => deleteFolder(folder)} disabled={busy}
                                                aria-label={`Delete ${folder.name} folder`}>Delete</button>
                                        </li>
                                    ))}
                                </ul>
                            </section>

                            <section className="eaglevault__vault-detail">
                                {selectedItem && !editingId ? (
                                    <>
                                        <div className="eaglevault__details-heading">
                                            <PanelHeader
                                                title={<h2>{selectedItem.name || 'Untitled login'}</h2>}
                                                subtitle={<span className="eaglevault__muted">Login</span>}
                                                actions={[
                                                    <Button key="edit" type="button" size="small" shape="solid"
                                                        onClick={() => editItem(selectedItem)}>Edit</Button>,
                                                    <Button key="delete" type="button" size="small" shape="ghost"
                                                        disabled={busy} onClick={() => deleteItem(selectedItem)}>Delete</Button>,
                                                ]}
                                            />
                                        </div>
                                        <div className="eaglevault__detail-row"><span>Username</span><strong>{selectedItem.username || '—'}</strong></div>
                                        <div className="eaglevault__detail-row"><span>Website</span><strong>{selectedItem.website || '—'}</strong></div>
                                        <div className="eaglevault__password">
                                            <label htmlFor="stored-password">Password</label>
                                            <input id="stored-password" type={showPassword ? 'text' : 'password'}
                                                value={selectedItem.password} readOnly autoComplete="off" />
                                            <button type="button" onClick={() => setShowPassword((value) => !value)}>
                                                {showPassword ? 'Hide' : 'Reveal'}
                                            </button>
                                            <button type="button" onClick={() => copyPassword(selectedItem.password)}>Copy</button>
                                        </div>
                                        {selectedItem.notes && <p className="eaglevault__notes">{selectedItem.notes}</p>}
                                    </>
                                ) : (
                                    <EagleVaultProtonLoginEditor
                                        key={editingId ?? 'create'}
                                        initialValues={draft}
                                        folderOptions={folders}
                                        editing={Boolean(editingId)}
                                        busy={busy}
                                        onSave={saveItem}
                                        onGeneratePassword={generatePassword}
                                        onCancel={() => {
                                            setEditingId(null);
                                            setDraft(emptyDraft());
                                            setMobileView('list');
                                        }}
                                    />
                                )}
                            </section>
                        </div>
                        <p className="eaglevault__footnote">
                            Login and folder contents are encrypted on this device with the Bitwarden SDK.
                            EagleVault Core stores ciphertext and synchronization metadata only.
                        </p>
                    </>
                ) : (
                    <>
                        <h1>{authMode === 'register' ? 'Create your vault' : 'Unlock your vault'}</h1>
                        <p className="eaglevault__muted">
                            {authMode === 'register' ? 'Create an encrypted EagleVault account.' : 'Sign in to EagleVault Core.'}
                        </p>
                        <form onSubmit={(event) => establishSession(authMode, event)} className="eaglevault__form">
                            {isEagleVaultStaging && (
                                <label>Staging access code
                                    <input type="password" required autoComplete="off" value={stagingAccessKey}
                                        onChange={(event) => setStagingAccessKey(event.target.value)} />
                                </label>
                            )}
                            <label>Email address
                                <input type="email" required autoComplete="username" value={email}
                                    onChange={(event) => setEmail(event.target.value)} />
                            </label>
                            <label>Master password
                                <input type="password" required minLength={1}
                                    autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                                    value={masterPassword} onChange={(event) => setMasterPassword(event.target.value)} />
                            </label>
                            <button className="eaglevault__button" type="submit" disabled={busy}>
                                {busy ? 'Connecting…' : authMode === 'register' ? 'Create encrypted account' : 'Sign in'}
                            </button>
                        </form>
                        {localPasskey && (
                            <button className="eaglevault__device-button" type="button"
                                onClick={unlockDevice} disabled={busy}>
                                <span aria-hidden="true">◈</span>
                                {busy ? 'Verifying…' : 'Unlock with device screen lock'}
                                <small>{localPasskey.email}</small>
                            </button>
                        )}
                        <button className="eaglevault__text-button" type="button" disabled={busy}
                            onClick={() => { setAuthMode((mode) => mode === 'login' ? 'register' : 'login'); setError(''); }}>
                            {authMode === 'login' ? 'Create an EagleVault account' : 'Already registered? Sign in'}
                        </button>
                        <p className="eaglevault__footnote">
                            Your master password is used locally for key derivation and is never sent to EagleVault Core.
                        </p>
                    </>
                )}
            </section>
        </main>
    );
};

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { EagleVaultSession, type VaultEntry, type VaultEntryFields } from '../../../../../../src/auth/eaglevault-session';
import { initializeBitwardenCryptoSdk } from '../../../../../../src/crypto/bitwarden-sdk-loader';

import './EagleVaultApp.scss';

const idleTimeout = 5 * 60_000;

const blankEntry: VaultEntryFields = {
    kind: 'login', name: '', username: '', password: '', url: '', notes: '', folderId: '',
};

const generatePassword = () => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    return Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) => alphabet[byte & 63]).join('');
};

export const EagleVaultApp = () => {
    const [origin, setOrigin] = useState('');
    const [email, setEmail] = useState('');
    const [masterPassword, setMasterPassword] = useState('');
    const [registrationCode, setRegistrationCode] = useState('');
    const [creatingAccount, setCreatingAccount] = useState(false);
    const [unlocked, setUnlocked] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [entries, setEntries] = useState<VaultEntry[]>([]);
    const [search, setSearch] = useState('');
    const [folder, setFolder] = useState('');
    const [draft, setDraft] = useState<VaultEntryFields | null>(null);
    const [previous, setPrevious] = useState<VaultEntry>();
    const [showPassword, setShowPassword] = useState(false);
    const session = useRef<EagleVaultSession | null>(null);

    useEffect(() => () => {
        const active = session.current;
        session.current = null;
        void active?.lock().catch(() => {});
    }, []);

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (session.current) return;
        setBusy(true);
        setError('');
        let active: EagleVaultSession | null = null;
        try {
            active = new EagleVaultSession(origin.trim());
            session.current = active;
            await initializeBitwardenCryptoSdk();
            await active.unlock(email, masterPassword, creatingAccount ? registrationCode : undefined);
            const loaded = await active.sync();
            if (session.current !== active) return;
            setEntries(loaded);
            setUnlocked(true);
        } catch {
            if (session.current === active) session.current = null;
            setError('Unable to unlock the vault. Check the API origin and your account details.');
        } finally {
            if (active && session.current !== active) await active.lock().catch(() => {});
            setMasterPassword('');
            setRegistrationCode('');
            setBusy(false);
        }
    };

    const clearEditor = () => {
        setDraft(null);
        setPrevious(undefined);
        setShowPassword(false);
    };

    const lock = useCallback(() => {
        const active = session.current;
        session.current = null;
        setEntries([]);
        setSearch('');
        setFolder('');
        setError('');
        setUnlocked(false);
        setDraft(null);
        setPrevious(undefined);
        setShowPassword(false);
        void active?.lock().catch(() => {
            if (!session.current) setError('Vault locked. The server could not confirm session revocation.');
        });
    }, []);

    useEffect(() => {
        if (!unlocked) return;
        let timer: number;
        const resetTimer = () => {
            window.clearTimeout(timer);
            timer = window.setTimeout(lock, idleTimeout);
        };
        resetTimer();
        window.addEventListener('pointerdown', resetTimer);
        window.addEventListener('keydown', resetTimer);
        window.addEventListener('pagehide', lock);
        return () => {
            window.clearTimeout(timer);
            window.removeEventListener('pointerdown', resetTimer);
            window.removeEventListener('keydown', resetTimer);
            window.removeEventListener('pagehide', lock);
        };
    }, [lock, unlocked]);

    const perform = async (operation?: (active: EagleVaultSession) => Promise<void>) => {
        const active = session.current;
        if (!active || busy) return;
        setBusy(true);
        setError('');
        try {
            if (operation) {
                await operation(active);
                if (session.current === active) clearEditor();
            }
            const loaded = await active.sync();
            if (session.current === active) setEntries(loaded);
        } catch {
            if (session.current === active) setError('Unable to complete the operation. Sync before retrying.');
        } finally {
            setBusy(false);
        }
    };

    const folders = entries.filter((entry) => entry.kind === 'folder');
    const visible = entries.filter((entry) =>
        (!folder || entry.folderId === folder) &&
        entry.name.toLowerCase().includes(search.trim().toLowerCase())
    );

    return (
        <main className="eaglevault">
            <section className="eaglevault__panel">
                <div className="eaglevault__brand">
                    <span className="eaglevault__mark" aria-hidden="true">E</span>
                    <span>EagleVault</span>
                </div>

                {error && <p className="eaglevault__error" role="alert">{error}</p>}
                {!unlocked ? (
                    <>
                        <h1>{creatingAccount ? 'Create your vault' : 'Unlock your vault'}</h1>
                        <form className="eaglevault__form" onSubmit={submit}>
                            <label>API origin
                                <input type="url" required value={origin} onChange={(event) => setOrigin(event.target.value)} />
                            </label>
                            <label>Email address
                                <input type="email" required autoComplete="username" value={email}
                                    onChange={(event) => setEmail(event.target.value)} />
                            </label>
                            <label>Master password
                                <input type="password" required autoComplete={creatingAccount ? 'new-password' : 'current-password'}
                                    minLength={creatingAccount ? 12 : undefined} value={masterPassword}
                                    onChange={(event) => setMasterPassword(event.target.value)} />
                            </label>
                            {creatingAccount && <label>Registration code
                                <input type="password" required autoComplete="off" value={registrationCode}
                                    onChange={(event) => setRegistrationCode(event.target.value)} />
                            </label>}
                            <button className="eaglevault__button" disabled={busy} type="submit">
                                {busy ? 'Connecting…' : creatingAccount ? 'Create account' : 'Unlock'}
                            </button>
                            <button type="button" disabled={busy} onClick={() => setCreatingAccount(!creatingAccount)}>
                                {creatingAccount ? 'Use an existing account' : 'Create an account'}
                            </button>
                        </form>
                    </>
                ) : (
                    <div className="eaglevault__connected">
                        <h1>Your vault</h1>
                        <div className="eaglevault__form">
                            <label>Search items
                                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
                            </label>
                            <label>Folder
                                <select value={folder} onChange={(event) => setFolder(event.target.value)}>
                                    <option value="">All folders</option>
                                    {folders.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                                </select>
                            </label>
                            <button type="button" disabled={busy} onClick={() => {
                                clearEditor();
                                setDraft({ ...blankEntry, folderId: folder });
                            }}>New item</button>
                            <button type="button" disabled={busy} onClick={() => void perform()}>Sync</button>
                            <button type="button" onClick={lock}>Lock and sign out</button>
                        </div>
                        <div className="eaglevault__items" aria-label="Vault items">
                            {visible.length === 0 && <p className="eaglevault__muted">No items found.</p>}
                            {visible.map((entry) => (
                                <button className="eaglevault__item" key={entry.id} type="button" disabled={busy}
                                    onClick={() => {
                                        const { id, revision, ...fields } = entry;
                                        setPrevious({ id, revision, ...fields });
                                        setDraft(fields);
                                        setShowPassword(false);
                                    }}>
                                    <span className="eaglevault__item-title">{entry.name}</span>
                                    <span className="eaglevault__item-subtitle">{entry.username || entry.kind}</span>
                                </button>
                            ))}
                        </div>

                        {draft && <form className="eaglevault__form" onSubmit={(event) => {
                            event.preventDefault();
                            const fields = draft.kind === 'login' ? draft : {
                                ...blankEntry, kind: draft.kind, name: draft.name,
                                notes: draft.kind === 'note' ? draft.notes : '',
                                folderId: draft.kind === 'note' ? draft.folderId : '',
                            };
                            void perform((active) => active.save(fields, previous));
                        }}>
                            <h2>{previous ? 'Edit item' : 'New item'}</h2>
                            <fieldset disabled={busy}>
                                <label>Type
                                    <select disabled={!!previous} value={draft.kind}
                                        onChange={(event) => setDraft({ ...draft, kind: event.target.value as VaultEntryFields['kind'] })}>
                                        <option value="login">Login</option>
                                        <option value="note">Secure note</option>
                                        <option value="folder">Folder</option>
                                    </select>
                                </label>
                                <label>Title
                                    <input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                                </label>
                                {draft.kind === 'login' && <>
                                    <label>Username
                                        <input value={draft.username} autoComplete="off"
                                            onChange={(event) => setDraft({ ...draft, username: event.target.value })} />
                                    </label>
                                    <label>Password
                                        <input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={draft.password}
                                            onChange={(event) => setDraft({ ...draft, password: event.target.value })} />
                                    </label>
                                    <button type="button" onClick={() => setShowPassword(!showPassword)}>
                                        {showPassword ? 'Hide password' : 'Show password'}
                                    </button>
                                    <button type="button" onClick={() => setDraft({ ...draft, password: generatePassword() })}>Generate password</button>
                                    <label>Website
                                        <input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} />
                                    </label>
                                </>}
                                {draft.kind !== 'folder' && <>
                                    <label>Notes
                                        <textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
                                    </label>
                                    <label>Folder
                                        <select value={draft.folderId} onChange={(event) => setDraft({ ...draft, folderId: event.target.value })}>
                                            <option value="">No folder</option>
                                            {folders.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                                        </select>
                                    </label>
                                </>}
                                <button className="eaglevault__button" type="submit">Save</button>
                                <button type="button" onClick={clearEditor}>Cancel</button>
                                {previous && <button type="button" onClick={() => {
                                    if (window.confirm('Delete this item from your vault?')) void perform((active) => active.delete(previous));
                                }}>Delete</button>}
                            </fieldset>
                        </form>}
                    </div>
                )}
            </section>
        </main>
    );
};

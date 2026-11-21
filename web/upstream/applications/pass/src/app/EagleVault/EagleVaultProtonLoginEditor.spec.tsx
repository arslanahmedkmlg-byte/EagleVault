import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import NotificationsProvider from '@proton/components/containers/notifications/Provider';
import { EagleVaultProtonLoginEditor } from './EagleVaultProtonLoginEditor';

describe('EagleVault uses Proton Pass login fields', () => {
    test('renders Proton fields and saves a login through EagleVault callback', async () => {
        const onSave = jest.fn().mockResolvedValue(undefined);
        render(
            <NotificationsProvider>
            <EagleVaultProtonLoginEditor
                initialValues={{ name: '', username: '', password: '', website: '', notes: '', folderId: '' }}
                folderOptions={[{ id: 'one', name: 'Personal' }]}
                editing={false}
                busy={false}
                onSave={onSave}
                onCancel={jest.fn()}
                onGeneratePassword={() => 'generated-test-value'}
            />
            </NotificationsProvider>
        );
        expect(screen.getByText('New login')).toBeInTheDocument();
        fireEvent.change(screen.getByPlaceholderText('Name your login'), { target: { value: 'Example login' } });
        fireEvent.change(screen.getByPlaceholderText('name@example.com'), { target: { value: 'sample@example.com' } });
        fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
        fireEvent.click(screen.getByRole('button', { name: 'Create login' }));
        await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
            name: 'Example login',
            username: 'sample@example.com',
            password: 'generated-test-value',
        }), expect.anything()));
    });

    test('rejects non-HTTP website URLs before attempting an encrypted save', async () => {
        const onSave = jest.fn().mockResolvedValue(undefined);
        render(
            <NotificationsProvider>
                <EagleVaultProtonLoginEditor
                    initialValues={{ name: 'Stored login', username: '', password: '', website: '', notes: '', folderId: '' }}
                    folderOptions={[]}
                    editing
                    busy={false}
                    onSave={onSave}
                    onCancel={jest.fn()}
                    onGeneratePassword={() => 'synthetic'}
                />
            </NotificationsProvider>
        );
        fireEvent.change(screen.getByPlaceholderText('https://example.com'), {
            target: { value: 'javascript:alert(1)' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
        await waitFor(() => expect(screen.getByText('Use an HTTP(S) website URL')).toBeInTheDocument());
        expect(onSave).not.toHaveBeenCalled();
    });

});

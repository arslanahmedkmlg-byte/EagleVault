import { presentEagleVaultLogin, toProtonLoginItem } from './ProtonItemAdapter';

const login = {
    id: 'a'.repeat(32),
    revision: 3,
    name: 'Test service',
    username: 'person@example.test',
    password: 'synthetic-test-password',
    website: 'https://example.test',
    notes: 'Synthetic test note',
    folderId: '',
};

describe('EagleVault to Proton Pass item adapter', () => {
    test('projects EagleVault data to Proton login revision without changing Core record', () => {
        const original = structuredClone(login);
        const item = toProtonLoginItem(login);
        expect(item.itemId).toBe(login.id);
        expect(item.revision).toBe(3);
        expect(item.data.type).toBe('login');
        expect(item.data.metadata.name).toBe('Test service');
        expect(item.data.content.autofillUrls[0]?.url).toBe('https://example.test');
        expect(JSON.stringify(item)).not.toContain('synthetic-test-password');
        expect(login).toEqual(original);
    });
    test('uses upstream Proton login presenter to derive list title and username', () => {
        expect(presentEagleVaultLogin(login)).toEqual({
            heading: 'Test service',
            subheading: 'person@example.test',
        });
    });
});

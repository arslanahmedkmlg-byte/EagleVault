/**
 * In-memory compatibility projection from EagleVault Core's decrypted login
 * records into Proton Pass's ItemRevision<'login'>.
 *
 * This is not a wire-format conversion or a replacement for Proton's Redux
 * store, share API, or encrypted item protocol. Never persist its obfuscated
 * values: EagleVault's encrypted record format remains authoritative.
 */
import type { ItemRevision } from '../../../../../packages/pass/types/data/items';
import { ItemState } from '../../../../../packages/pass/types/data/items';
import { AutofillMode } from '../../../../../packages/pass/types/protobuf';
import { obfuscate } from '../../../../../packages/pass/utils/obfuscate/xor';
import { presentListItem } from '../../../../../packages/pass/components/Item/List/utils';

export type EagleVaultLoginRecord = {
    id: string;
    revision: number;
    name: string;
    username: string;
    password: string;
    website: string;
    notes: string;
    folderId: string;
};

const UI_SHARE_ID = 'eaglevault-local-personal-vault';

export const toProtonLoginItem = (item: EagleVaultLoginRecord): ItemRevision<'login'> => {
    if (!/^[a-f0-9]{32}$/i.test(item.id) || !Number.isSafeInteger(item.revision) || item.revision < 0) {
        throw new Error('Invalid EagleVault item identifier or revision.');
    }
    const website = item.website.trim();
    return {
        shareId: UI_SHARE_ID,
        itemId: item.id,
        revision: item.revision,
        state: ItemState.Active,
        contentFormatVersion: 1,
        createTime: 0,
        lastUseTime: null,
        modifyTime: 0,
        revisionTime: 0,
        flags: 0,
        pinned: false,
        aliasEmail: null,
        shareCount: undefined,
        folderId: item.folderId || null,
        data: {
            type: 'login',
            metadata: {
                name: item.name,
                note: obfuscate(item.notes),
                itemUuid: item.id,
            },
            content: {
                itemEmail: obfuscate(item.username),
                itemUsername: obfuscate(''),
                password: obfuscate(item.password),
                totpUri: obfuscate(''),
                autofillUrls: website ? [{ url: website, mode: AutofillMode.Default }] : [],
                passkeys: [],
            },
            extraFields: [],
        },
    };
};


/** Uses Proton Pass's own login list presenter on an ephemeral projection. */
export const presentEagleVaultLogin = (record: EagleVaultLoginRecord): { heading: string; subheading: string } => {
    const projected = toProtonLoginItem(record);
    const fields = [
        projected.data.metadata.note,
        projected.data.content.itemEmail,
        projected.data.content.itemUsername,
        projected.data.content.password,
        projected.data.content.totpUri,
    ];
    try {
        return presentListItem(projected);
    } finally {
        // Do not retain additional obfuscated password copies for simple list labels.
        for (const field of fields) {
            field.v.fill(0);
            field.m.fill(0);
        }
    }
};

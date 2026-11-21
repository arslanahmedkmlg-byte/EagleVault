import { Form, FormikProvider, useFormik } from 'formik';

import { Button } from '@proton/atoms/Button/Button';
import { IcUser } from '@proton/icons/icons/IcUser';
import { IcLink } from '@proton/icons/icons/IcLink';
import { IcKey } from '@proton/icons/icons/IcKey';
import { IcNote } from '@proton/icons/icons/IcNote';

import { Field } from '../../../../../packages/pass/components/Form/Field/Field';
import { TitleField } from '../../../../../packages/pass/components/Form/Field/TitleField';
import { TextField } from '../../../../../packages/pass/components/Form/Field/TextField';
import { TextAreaField } from '../../../../../packages/pass/components/Form/Field/TextareaField';
import { FieldsetCluster } from '../../../../../packages/pass/components/Form/Field/Layout/FieldsetCluster';
import { PanelHeader } from '../../../../../packages/pass/components/Layout/Panel/PanelHeader';

export type EagleVaultLoginDraft = {
    name: string;
    username: string;
    website: string;
    password: string;
    folderId: string;
    notes: string;
};

type Props = {
    initialValues: EagleVaultLoginDraft;
    folderOptions: { id: string; name: string }[];
    editing: boolean;
    busy: boolean;
    onSave: (draft: EagleVaultLoginDraft) => Promise<void>;
    onCancel: () => void;
    onGeneratePassword: () => string;
};

/**
 * Reuses Proton Pass's original item field primitives, Formik integration
 * and fieldset styling. Only the EagleVault Core save action is substituted.
 *
 * Proton's full LoginNew/LoginEdit are not mounted: they depend on Proton
 * account/share APIs, Redux selectors, and upstream cryptographic state.
 */
export function EagleVaultProtonLoginEditor({
    initialValues, folderOptions, editing, busy, onSave, onCancel, onGeneratePassword,
}: Props) {
    const form = useFormik<EagleVaultLoginDraft>({
        initialValues,
        enableReinitialize: true,
        validate: (values) => {
            const errors: Partial<Record<keyof EagleVaultLoginDraft, string>> = {};
            if (!values.name.trim()) errors.name = 'A login name is required';
            if (values.name.length > 256) errors.name = 'Login name is too long';
            if (values.notes.length > 4000) errors.notes = 'Notes are too long';
            if (values.website) {
                try {
                    const parsed = new URL(values.website);
                    if (!['https:', 'http:'].includes(parsed.protocol)) errors.website = 'Use an HTTP(S) website URL';
                } catch {
                    errors.website = 'Enter a valid URL, including https://';
                }
            }
            return errors;
        },
        onSubmit: onSave,
    });

    return (
        <FormikProvider value={form}>
            <Form className="eaglevault__form eaglevault__proton-editor" noValidate>
                <PanelHeader
                    title={<h2>{editing ? 'Edit login' : 'New login'}</h2>}
                    subtitle={<span className="eaglevault__muted">Encrypted login item</span>}
                />
                <FieldsetCluster>
                    <Field component={TitleField} name="name" label="Title" placeholder="Name your login"
                        maxLength={256} />
                    <Field component={TextField} name="username" label="Email or username"
                        placeholder="name@example.com" icon={<IcUser size={4}/>} autoComplete="username" />
                    <Field component={TextField} name="website" label="Website"
                        placeholder="https://example.com" icon={<IcLink size={4}/>} />
                    <Field component={TextField} name="password" label="Password" icon={<IcKey size={4}/>}
                        hidden autoComplete="new-password"
                        actions={[
                            <Button key="generate" type="button" color="weak" shape="ghost" size="small"
                                onClick={() => { void form.setFieldValue('password', onGeneratePassword()); }}>
                                Generate
                            </Button>,
                        ]}
                    />
                    <Field component={TextAreaField} name="notes" label="Notes" icon={<IcNote size={4}/>}
                        rows={3} maxLength={4000} />
                </FieldsetCluster>
                <label className="eaglevault__proton-folder">
                    Folder
                    <select name="folderId" value={form.values.folderId} onChange={form.handleChange}>
                        <option value="">No folder</option>
                        {folderOptions.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                    </select>
                </label>
                <div className="eaglevault__inline-actions">
                    <Button type="submit" color="norm" shape="solid" disabled={busy || form.isSubmitting || !form.isValid}>
                        {busy || form.isSubmitting ? 'Saving…' : editing ? 'Save changes' : 'Create login'}
                    </Button>
                    <Button type="button" color="weak" shape="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>
                </div>
            </Form>
        </FormikProvider>
    );
}

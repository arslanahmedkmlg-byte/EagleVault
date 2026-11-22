import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit';

type VaultNavigation = {
    screen: 'auth' | 'vault';
    mobileView: 'list' | 'detail';
    settingsOpen: boolean;
    folderFilter: string | null;
    selectedId: string | null;
    editingId: string | null;
    creatingLogin: boolean;
    showPassword: boolean;
};

const initialState: VaultNavigation = {
    screen: 'auth',
    mobileView: 'list',
    settingsOpen: false,
    folderFilter: null,
    selectedId: null,
    editingId: null,
    creatingLogin: false,
    showPassword: false,
};

const navigation = createSlice({
    name: 'eagleVaultNavigation',
    initialState,
    reducers: {
        navigate: (state, action: PayloadAction<Partial<VaultNavigation>>) => ({ ...state, ...action.payload }),
        resetNavigation: () => initialState,
    },
});

export const { navigate, resetNavigation } = navigation.actions;

// Keep decrypted records, drafts, and session material outside Redux.
export const createVaultNavigationStore = () => configureStore({
    reducer: navigation.reducer,
    devTools: false,
});

export type VaultNavigationStore = ReturnType<typeof createVaultNavigationStore>;

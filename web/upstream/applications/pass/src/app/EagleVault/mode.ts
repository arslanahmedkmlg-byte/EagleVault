const EAGLEVAULT_HOSTNAME = 'eaglevault.eaglenet.asia';

declare const EAGLEVAULT_STAGING_MODE: boolean;

export const isEagleVaultStaging =
    typeof EAGLEVAULT_STAGING_MODE !== 'undefined' && EAGLEVAULT_STAGING_MODE;

export const isEagleVaultMode = (
    hostname: string,
    search: string,
    stagingMode = isEagleVaultStaging
): boolean =>
    stagingMode ||
    hostname === EAGLEVAULT_HOSTNAME ||
    new URLSearchParams(search).get('eaglevault') === '1';

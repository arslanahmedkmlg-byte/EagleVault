const EAGLEVAULT_HOSTNAME = 'eaglevault.eaglenet.asia';

export const isEagleVaultMode = (hostname: string, search: string): boolean =>
    hostname === EAGLEVAULT_HOSTNAME || new URLSearchParams(search).get('eaglevault') === '1';

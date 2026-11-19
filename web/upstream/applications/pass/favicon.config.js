const path = require('path');

const url = 'https://eaglevault.eaglenet.asia/';

module.exports = {
    logo: path.resolve('./src/eaglevault.svg'),
    // TODO provide real maskable icon
    logoMaskable: path.resolve('./src/eaglevault.svg'),
    favicons: {
        appName: 'EagleVault',
        appDescription: 'EagleVault is an end-to-end encrypted password manager.',
    },
    url,
    // locales: Object.keys(require('./locales/config/locales.json')),
};

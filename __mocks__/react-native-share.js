/* global jest */
// El módulo nativo no existe en Jest: getEnforcing lanzaría al importarlo.
const Social = {
  WHATSAPP: 'whatsapp',
  WHATSAPPBUSINESS: 'whatsappbusiness',
  SMS: 'sms',
  EMAIL: 'email',
};

const Share = {
  Social,
  open: jest.fn(async () => ({ success: true, message: '' })),
  shareSingle: jest.fn(async () => ({ success: true, message: '' })),
  isPackageInstalled: jest.fn(async () => ({ isInstalled: false, message: '' })),
};

module.exports = { __esModule: true, default: Share, Social };

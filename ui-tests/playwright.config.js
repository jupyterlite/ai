/**
 * Configuration for Playwright using default from @jupyterlab/galata
 */
const baseConfig = require('@jupyterlab/galata/lib/playwright-config');

module.exports = {
  ...baseConfig,
  use: {
    ...baseConfig.use,
    video: process.env.PWVIDEO || 'retain-on-failure',
    launchOptions: {
      slowMo: process.env.PWSLOWMO ? parseInt(process.env.PWSLOWMO) : 0
    }
  },
  webServer: {
    command: 'jlpm start',
    url: 'http://localhost:8888/lab',
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI
  }
};

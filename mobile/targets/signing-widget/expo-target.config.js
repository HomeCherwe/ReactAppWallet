/**
 * The widget extension that draws the signing live activity (started by modules/signing-activity).
 * @type {import('@bacons/apple-targets/app.plugin').Config}
 */
module.exports = {
  type: 'widget',
  name: 'SigningWidget',
  displayName: 'MyWallet',
  bundleIdentifier: '.signingwidget',
  deploymentTarget: '16.4',
  frameworks: ['ActivityKit'],
}

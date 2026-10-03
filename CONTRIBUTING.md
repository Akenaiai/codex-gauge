# Contributing / 参与开发

Use Node.js 22.12+ and `npm ci`. Run `npm test` before submitting a change. Test relevant native behavior as well as the browser preview; demo values are not account verification. Keep English and Simplified Chinese strings in sync.

Never commit credentials, `auth.json`, raw app-server messages, personal screenshots, local settings or real usage snapshots. Use synthetic fixtures. Do not add model requests, automatic reset-card usage or a remote telemetry service to the read-only monitor.

新改动先跑相关检查，再验证受影响的原生行为。浏览器预览不能代替真实账户和桌面验证。保持中英文同步，测试只用示例数据；不提交凭据、原始服务数据、个人截图或本机设置。

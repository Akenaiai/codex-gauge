const { QuotaService } = require('../src/cli.cjs');
const service = new QuotaService();
const timer = setTimeout(() => { service.stop(); console.error('Read-only smoke test timed out'); process.exit(1); }, 65000);
service.once('state', function check(state) {
  if (state.status === 'connecting') { service.once('state', check); return; }
  clearTimeout(timer); service.stop();
  // Report capabilities, not account identifiers or private usage readings.
  console.log(JSON.stringify({ status: state.status, fiveHour: !!state.snapshot?.fiveHour,
    weekly: !!state.snapshot?.weekly, resetCreditMetadata: state.snapshot?.creditCount !== null,
    noModelRequests: true }, null, 2));
  process.exit(state.status === 'ready' ? 0 : 1);
});
service.setActive(true);

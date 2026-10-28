// Imported first by signup-free-mode.e2e-spec.ts: the app reads its config while loading,
// so OTP_REQUIRED must be off before any app module is imported.
process.env.OTP_REQUIRED = 'false';

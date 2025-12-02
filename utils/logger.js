// Simple logger utility to avoid direct console.log usage across the app
// Provides consistent logging methods with timestamps.

function timestamp() {
  return new Date().toISOString();
}

function info(message) {
  console.info(`[INFO ${timestamp()}] ${message}`);
}

function warn(message) {
  console.warn(`[WARN ${timestamp()}] ${message}`);
}

function error(message) {
  console.error(`[ERROR ${timestamp()}] ${message}`);
}

module.exports = { info, warn, error };


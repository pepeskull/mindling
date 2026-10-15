// Production has its own gate and identity authentication; AI inference stays server-only.
module.exports = require('../src/server/learning.cjs').createHandler({ mode: 'production' });

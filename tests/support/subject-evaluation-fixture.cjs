'use strict';
// Explicit mocked model relevance for existing source-validation fixtures.
// This is test-only and never repairs a production assessment.
exports.direct = value => value && Array.isArray(value.claims) ? {...value,claims:value.claims.map(claim=>claim&&typeof claim==='object'?{relevance:'direct',...claim}:claim)} : value;

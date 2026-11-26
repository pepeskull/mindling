'use strict';
const {protect,REASON}=require('../../src/server/payment/runtime.cjs');
module.exports=protect(REASON,require('../../src/server/mindling-reasoning.cjs').handler);

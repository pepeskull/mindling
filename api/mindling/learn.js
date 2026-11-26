'use strict';
const {protect,LEARN}=require('../../src/server/payment/runtime.cjs');
module.exports=protect(LEARN,require('../../src/server/mindling-learning.cjs').handler);

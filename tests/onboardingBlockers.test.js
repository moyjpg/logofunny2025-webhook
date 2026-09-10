const test = require('node:test');
const assert = require('node:assert/strict');
const fetchPath = require.resolve('node-fetch');
require(fetchPath);
const originalFetchModule = require.cache[fetchPath].exports;
require.cache[fetchPath].exports = (...args) => global.fetch(...args);
const {generateOnboardingFollowup, normalizeAdvisorResponse} = require('../services/onboardingFollowupService');
require.cache[fetchPath].exports = originalFetchModule;
const input = {brand_name:'luckday', business_description:'蛋糕店',rough_feeling:'温暖、精致',conversation_language:'zh-CN',latest_message:'我们店名叫 luckday。喜欢精致甜点的人、家庭、情侣。分享具有甜蜜仪式感；温暖而精致、不普通。网店、门店、蛋糕物料。'};
const evidence = ['蛋糕店','喜欢精致甜点的人、家庭、情侣','分享具有甜蜜仪式感','温暖、精致','网店、门店、蛋糕物料'];
const reply = {assistant_message:'可以查看品牌方向了。', ready_to_review:true, readiness:Object.fromEntries(['business','audience','differentiation','personality','logo_context'].map((key,i)=>[key,{status:'covered',evidence:evidence[i]}])),research:{offered:false,reason:'',confirmation_question:''},questions:[]};
test('luckday natural evidence completes all five dimensions; invented evidence cannot',()=>{
 const result=normalizeAdvisorResponse(reply,input);
 assert.equal(result.ready_to_review,true);
 assert.ok(Object.values(result.readiness).every(x=>x.status==='covered'));
 const sparse=normalizeAdvisorResponse(reply,{business_description:'宠物用品店',rough_feeling:'温暖、活泼、有趣',latest_message:'品牌叫 mamamiya，Logo 想要图形加文字。',conversation_language:'zh-CN'});
 assert.equal(sparse.ready_to_review,false);
 assert.doesNotMatch(sparse.assistant_message,/可以查看|可以生成|准备好/);
});
test('bounded parse retry, persistent failure, schema, truncation, auth and config',async()=>{
 const oldFetch=global.fetch;
 const keys=['ONBOARDING_FOLLOWUP_ENABLED','ONBOARDING_CONVERSATION_API_KEY','OPENAI_API_KEY','ONBOARDING_FOLLOWUP_FETCH_TIMEOUT_MS'];
 const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try {
 process.env.ONBOARDING_FOLLOWUP_ENABLED='true'; process.env.ONBOARDING_CONVERSATION_API_KEY='test-only';
 const success=()=>new Response(JSON.stringify({output_text:JSON.stringify(reply)}));
 for(const [bad,classification] of [[()=>new Response(JSON.stringify({output_text:'invalid'})),'json_parse'],[()=>new Response(JSON.stringify({output_text:'{}'})),'response_structure'],[()=>new Response(JSON.stringify({status:'incomplete',incomplete_details:{reason:'max_output_tokens'}})),'output_truncation']]) {
 let calls=0; global.fetch=async()=>++calls===1?bad():success();
 assert.equal((await generateOnboardingFollowup(input)).source,'ai');assert.equal(calls,2);
 calls=0;global.fetch=async()=>{calls++;return bad()};
 const failed=await generateOnboardingFollowup(input);assert.notEqual(failed.source,'ai');assert.equal(failed.failure,classification);assert.equal(calls,2);
 }
 let calls=0;global.fetch=async()=>{calls++;return new Response('',{status:401})};
 assert.equal((await generateOnboardingFollowup(input)).failure,'http');assert.equal(calls,1);
 process.env.ONBOARDING_CONVERSATION_API_KEY='';process.env.OPENAI_API_KEY='';calls=0;
 assert.equal((await generateOnboardingFollowup(input)).failure,'misconfigured');assert.equal(calls,0);
 process.env.ONBOARDING_CONVERSATION_API_KEY='test-only';process.env.ONBOARDING_FOLLOWUP_FETCH_TIMEOUT_MS='50';calls=0;
 global.fetch=async(_url,{signal})=>{calls++;return new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(Object.assign(new Error('timeout'),{name:'AbortError'})));if(calls===1)setTimeout(()=>resolve(new Response(JSON.stringify({output_text:'bad'}))),30)})};
 const started=Date.now();assert.equal((await generateOnboardingFollowup(input)).failure,'timeout');assert.equal(calls,2);assert.ok(Date.now()-started<150);
 } finally {global.fetch=oldFetch;for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k]}}
});


test('production luckday evidence tolerates quotes, punctuation and joining words without inventing facts',()=>{
 const productionInput={...input,latest_message:'我们店名叫 luckday。顾客是喜欢精致甜点的人、家庭、情侣。分享具有甜蜜仪式感；温暖而精致、不普通。Logo 用在网店、门店、蛋糕物料。'};
 const quoted=JSON.parse(JSON.stringify(reply));
 quoted.readiness.audience.evidence='“顾客是喜欢精致甜点的人、家庭、情侣”';
 quoted.readiness.differentiation.evidence='“分享具有甜蜜仪式感”以及“温暖而精致、不普通”';
 const result=normalizeAdvisorResponse(quoted,productionInput);
 assert.equal(result.ready_to_review,true);
 assert.ok(Object.values(result.readiness).every(x=>x.status==='covered'));
 quoted.readiness.differentiation.evidence=' "分享具有甜蜜仪式感" and “温暖而精致 - 不普通” ';
 assert.equal(normalizeAdvisorResponse(quoted,productionInput).ready_to_review,true);
 quoted.readiness.differentiation.evidence='“分享具有甜蜜仪式感”以及“全部使用有机原料”';
 const invented=normalizeAdvisorResponse(quoted,productionInput);
 assert.equal(invented.readiness.differentiation.status,'missing');
 assert.equal(invented.ready_to_review,false);
 assert.doesNotMatch(invented.assistant_message,/可以生成|准备完成|可以查看/);
});

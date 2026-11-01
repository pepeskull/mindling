'use strict';
// Explicitly synthetic upstream for local integration tests. No external requests.
const {createServer}=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),{handler}=require('../../src/server/mindling-reasoning.cjs');
const root=path.resolve(__dirname,'../..');
process.env.SERVICE_API='synthetic-local-only';process.env.SERVICE_MODEL='opaque-model';process.env.MINDLING_WEB_SEARCH='enabled';
const analysisAttempts=new Map();
const sourceEvaluationFixture=require('./source-evaluation-fixtures.cjs');
globalThis.fetch=async(target,options)=>{
  if(target==='https://api.openai.com/v1/models/opaque-model')return Response.json({id:'opaque-model'});
  if(!['https://api.openai.com/v1/responses','https://api.openai.com/v1/chat/completions'].includes(target))throw Error('External network forbidden in integration fixture');
  const body=JSON.parse(options.body);
  if(target.endsWith('/responses')){
    const {request}=JSON.parse(body.input);
    if(request.topic.startsWith('source validation'))return Response.json(sourceEvaluationFixture.searchPayload());
    if(request.topic.includes('no hosted action'))return Response.json({id:'resp_synthetic_no_tool',status:'completed',output:[]});
    if(request.topic.includes('failure'))return Response.json({error:{}},{status:429});
    if(request.topic.includes('cancel'))await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,4000);options.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('cancel','AbortError'));},{once:true});});
    if(request.topic.includes('LaLiga')){
      const url='https://www.laliga.com/en-GB/laliga-easports/standing',dated=request.topic.includes('dated evidence'),date=new Date().toISOString().slice(0,10);
      const fact='Synthetic Club A leads Spain’s top men’s football league standings.';
      const paragraphs=dated?['The selected official league page provides standings for clubs participating in the current season.',`As of ${date}, ${fact}`]:[`For the 2026/27 season, ${fact}`];
      let text='';const annotations=[];for(const paragraph of paragraphs){if(text)text+='\n\n';text+=paragraph+' ';const start=text.length;text+='[source]';annotations.push({type:'url_citation',url,title:'Synthetic official-league regression fixture',start_index:start,end_index:text.length});}
      return Response.json({id:'resp_synthetic_laliga',status:'completed',output:[{type:'web_search_call',status:'completed',action:{type:'search',sources:[{type:'url',url}]}},{type:'message',status:'completed',content:[{type:'output_text',text,annotations}]}]});
    }
    const quote=request.topic.includes('analysis')?'Social norms are shared expectations that guide behavior within a community.':request.topic.includes('stars')?'Stars generate radiant energy through nuclear fusion reactions within their dense central cores.':'Neurons communicate through electrical signals and release chemical messengers at synapses.';
    const url=request.topic.includes('stars')?'https://science.nasa.gov/universe/stars/':'https://www.ninds.nih.gov/health-information/public-education/brain-basics';
    return Response.json({id:'resp_synthetic_local',status:'completed',output:[{type:'web_search_call',status:'completed',action:{type:'search',sources:[{type:'url',url}]}},{type:'message',status:'completed',content:[{type:'output_text',text:quote+' [1]',annotations:[{type:'url_citation',start_index:quote.length+1,end_index:quote.length+4,title:'Explicit synthetic source fixture',url}]}]}]});
  }
  const data=JSON.parse(body.messages[1].content),name=body.response_format.json_schema.name;
  if(name==='mindling_source_evaluation'&&data.request.topic.startsWith('source validation')){
    const topic=data.request.topic,used=analysisAttempts.get(topic)||0;analysisAttempts.set(topic,used+1);
    if(topic.includes('recovery')&&!used)return Response.json({error:{message:'Synthetic interrupted source evaluation'}},{status:503});
    const mode=topic.includes('zero')?'zero':topic.includes('recovery')?'recovery':'mixed';
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(sourceEvaluationFixture.evaluation(data.sources,mode))}}]});
  }
  if(name==='mindling_source_evaluation'&&data.request.topic.includes('analysis once')){const used=analysisAttempts.get(data.request.topic)||0;analysisAttempts.set(data.request.topic,used+1);if(!used)return Response.json({error:{type:'server_error',message:'Synthetic analysis failure'}},{status:503});}
  let result;
  if(name==='mindling_planning')result=data.topic.includes('ambiguous orientation')?{plan:['Choose a foundational focus'],clarification:{question:'Which optional learning focus do you prefer?',options:[]},queries:[],sourceCategory:'web'}:{plan:['Find reliable public sources','Compare cited evidence'],clarification:null,queries:['public knowledge learning'],sourceCategory:'web'};
  else if(name==='mindling_source_evaluation')result={claims:data.sources.map(source=>({sourceId:source.id,quote:data.request.topic.includes('LaLiga')?'Synthetic Club A leads Spain’s top men’s football league standings.':source.text,category:data.request.topic.includes('LaLiga')?'Sports':data.request.topic.includes('stars')?'Science':'Biology',topic:data.request.topic.includes('LaLiga')?'Football':data.request.topic.includes('stars')?'Astronomy':'Neuroscience',reason:'Synthetic local evidence assessment',validAt:data.request.topic.includes('LaLiga dated evidence')?new Date().toISOString().slice(0,10):null})),limitations:['Synthetic test data only; no second source comparison demonstrated.'],nextQuestion:'How do stars generate energy'};
  if(!result)throw Error('Unsupported synthetic completion');return Response.json({choices:[{message:{content:JSON.stringify(result)}}]});
};
const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.json':'application/json'};
let requestNumber=0;
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/mindling/reason'){
    req.headers['x-forwarded-for']=`synthetic-fixture-${++requestNumber}`;
    let body='';for await(const chunk of req){body+=chunk;if(body.length>65536){res.writeHead(413).end();return;}}req.body=JSON.parse(body||'null');res.status=code=>{res.statusCode=code;return res;};res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return res;};return await handler(req,res);
  }
  if(url.pathname==='/tests/blank.html'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body>Local autonomous integration fixture</body></html>');return;}
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  const data=await fs.readFile(file);res.setHeader('Content-Type',mime[path.extname(file)]||'text/plain');res.end(data);
 }catch{if(!res.writableEnded)res.writeHead(404).end();}
});
server.listen(8765,'127.0.0.1',()=>process.stdout.write('Synthetic local integration server on 8765; no external API calls\n'));

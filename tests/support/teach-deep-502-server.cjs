'use strict';
// Local-only upstream fixtures behind the actual exported learning handler.
// This process has no real credentials and never forwards external requests.
const {createServer}=require('node:http');
const fs=require('node:fs/promises'),path=require('node:path');
const handler=require('../../api/mindling/learn.js');
const root=path.resolve(__dirname,'../..');
process.env.SERVICE_API='synthetic-learning-key';process.env.SERVICE_MODEL='synthetic-learning-model';
let mode='good';
globalThis.fetch=async(url,options)=>{
  if(url==='https://api.openai.com/v1/models/synthetic-learning-model')return Response.json({id:'synthetic-learning-model'});
  if(url!=='https://api.openai.com/v1/chat/completions')throw Error('External requests are forbidden');
  if(mode==='failure')return Response.json({error:{code:'invalid_json_schema',param:'response_format.json_schema',message:'Synthetic upstream rejection'}},{status:400});
  const {proposed}=await import('./teach-deep-assessment.mjs');
  const body=JSON.parse(options.body),context=JSON.parse(body.messages[1].content),assessment=proposed(context);
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(assessment),refusal:null}}]});
};
const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/tests/learning-mode'&&req.method==='POST'){
      let body='';for await(const chunk of req)body+=chunk;
      mode=JSON.parse(body).mode==='failure'?'failure':'good';res.writeHead(204).end();return;
    }
    if(url.pathname==='/api/mindling/learn'){
      let body='';for await(const chunk of req){body+=chunk;if(body.length>16384){res.writeHead(413).end();return;}}
      req.body=JSON.parse(body);res.status=code=>{res.statusCode=code;return res;};res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return res;};
      return await handler(req,res);
    }
    // Never route other API calls to a provider.
    if(url.pathname.startsWith('/api/')){res.writeHead(503).end();return;}
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    const data=await fs.readFile(file);res.setHeader('Content-Type',mime[path.extname(file)]||'text/plain');res.end(data);
  }catch{if(!res.writableEnded)res.writeHead(404).end();}
});
server.listen(8767,'127.0.0.1',()=>process.stdout.write('Local learning-handler fixture on 8767; external requests forbidden\n'));

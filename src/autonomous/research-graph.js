import { tasksFor, taskProgress } from './tasks.js';
export const learningNodeId=id=>`learning:${id}`;
export function learningNodes(state,graph){
  return tasksFor(state).map(saved=>{
    const interrupted=['PREPARED','QUEUED','RESEARCHING','EVALUATING','COMMITTING'].includes(saved.status)&&saved.session!==state.learningSession;
    const task=interrupted?{...saved,status:'BLOCKED',code:'INTERRUPTED',message:'Research was interrupted. Completed work is saved; Mindling planning can resume when the page is visible and access remains authorized.'}:saved;
    const anchor=graph.memories.find(memory=>!memory.historical&&task.referenceIds.includes(memory.recordId))?.areaId||null;
    return {id:learningNodeId(task.id),kind:'research',label:task.topic||task.objective,task,taskId:task.id,anchor,progress:taskProgress(task),root:true};
  });
}
export function withResearch(graph,state,canonical){
  const roots=learningNodes(state,canonical).filter(node=>!['COMPLETED','CANCELLED'].includes(node.task.status));
  const nodes=[...graph.nodes],edges=[...graph.edges],present=new Set(nodes.map(node=>node.id));
  for(const root of roots){
    nodes.push(root);
    if(root.anchor&&present.has(root.anchor))edges.push({from:root.anchor,to:root.id,kind:'research'});
    // Talk has exactly one node. Other modes expose bounded work groups;
    // rings derive from the actual completed units in each group.
    if(root.task.mode!=='TALK_RESEARCH'){
      const groups=[[root.task.workVersion===2?'Request & discovery':'Knowledge check',['understanding','retrieval','plan']],['Source evaluation',['source','evidence']],['Memory integration',['knowledge','answer']]];
      groups.forEach(([label,units],index)=>{
        const id=`${root.id}:${index}`;
        nodes.push({...root,id,label,root:false,parent:root.id,progress:units.filter(unit=>root.task.completedWork.includes(unit)).length/units.length});
        edges.push({from:root.id,to:id,kind:'research'});
      });
    }
  }
  return {...graph,nodes,edges};
}
export function layoutResearch(layout,graph){
  const nodes=[...layout.nodes],roots=graph.nodes.filter(node=>node.kind==='research'&&node.root);
  if(!roots.length)return layout;
  const base=layout.nodes.length?layout.height+90:100;
  roots.forEach((root,index)=>{
    const x=130+(index%3)*280,y=base+Math.floor(index/3)*250;
    nodes.push({...root,x,y,r:15});
    graph.nodes.filter(node=>node.kind==='research'&&node.parent===root.id).forEach((child,j)=>{
      const angle=-Math.PI/2+j*Math.PI*2/3;
      nodes.push({...child,x:x+Math.cos(angle)*76,y:y+Math.sin(angle)*76,r:10});
    });
  });
  const ids=new Set(nodes.map(node=>node.id));
  return {nodes,edges:graph.edges.filter(edge=>ids.has(edge.from)&&ids.has(edge.to)),width:Math.max(layout.width,Math.min(3,roots.length)*280+60),height:base+Math.floor((roots.length-1)/3)*250+130};
}

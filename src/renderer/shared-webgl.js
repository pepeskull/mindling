// Dashboard and Development own different scenes but borrow one GPU context.
// Only the visible owner renders; navigation moves the canvas, not player state.
let shared = null;
export function acquireWebGL(three) {
  if(!shared){
    const renderer=new three.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
    shared={renderer,references:0};
  }
  shared.references++;return shared.renderer;
}
export function releaseWebGL(renderer) {
  if(!shared||shared.renderer!==renderer)return;
  if(--shared.references===0){renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();shared=null;}
}

import { MindlingApp } from "../src/app/app.js";

const app=new MindlingApp();
app.start().catch(()=>{
  const scene=document.querySelector("#scene");
  if(!scene.querySelector(".scene-error"))scene.insertAdjacentHTML("beforeend",'<p class="scene-error">The Neural Seed could not be rendered.</p>');
});
window.addEventListener("pagehide",()=>app.destroy(),{once:true});

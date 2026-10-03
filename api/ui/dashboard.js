import { EVENTS } from "../app/events.js";

export class Dashboard {
  #off; #timer;
  constructor(events) {
    this.#off=events.on(EVENTS.STATE_READY,state=>this.render(state));
    const form=document.querySelector("#interaction-form"),input=document.querySelector("#mindling-input"),status=form.querySelector(".interaction-status");
    form.addEventListener("submit",event=>{event.preventDefault();input.value="";status.textContent="Your Mindling has not awakened yet.";status.classList.add("visible");clearTimeout(this.#timer);this.#timer=setTimeout(()=>status.classList.remove("visible"),2800);input.focus();});
  }
  render(state){for(const key of ["neurons","synapses","memories"])document.querySelector(`[data-stat="${key}"]`).textContent=state[key];}
  setStorageStatus(available){document.querySelector(".storage-status").textContent=available?"Local-first · Ready":"Local storage unavailable";}
  destroy(){this.#off?.();clearTimeout(this.#timer);}
}

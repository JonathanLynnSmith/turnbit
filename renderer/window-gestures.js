// Capture the pointer so a gesture continues beyond the small visible handle.
(()=>{
  const api=window.dialpod;
  for(const [id,kind] of [['windowMove','move'],['windowResize','resize']]){
    const handle=document.getElementById(id);let active=false,pending;
    handle.addEventListener('pointerdown',event=>{
      if(event.button!==0||active||!api?.windowGesture)return;
      event.preventDefault();active=true;handle.setPointerCapture(event.pointerId);
      document.body.dataset.windowGesture=kind;
      pending=api.windowGesture('start',kind).catch(()=>{active=false;delete document.body.dataset.windowGesture;});
    });
    const finish=async event=>{
      if(!active)return;active=false;delete document.body.dataset.windowGesture;
      if(handle.hasPointerCapture(event.pointerId))handle.releasePointerCapture(event.pointerId);
      await pending;await api.windowGesture(event.type==='pointercancel'?'cancel':'end',kind).catch(()=>{});
    };
    handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',finish);
    handle.addEventListener('lostpointercapture',finish);
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&active){event.preventDefault();finish({type:'pointercancel',pointerId:-1});}
    });
  }
})();

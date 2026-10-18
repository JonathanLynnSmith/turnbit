// Screen approximations of Apple finishes, not calibrated paint samples.
(()=>{
const themes=[
  {id:'silver',name:'Silver',color:'#d6dadd'},
  {id:'black',name:'Black',color:'#25292d'},
  {id:'blue',name:'Blue',color:'#269bd1',light:'#79c5e8',shade:'#167cae',ink:'#12394c'},
  {id:'green',name:'Green',color:'#91c83e',light:'#d0e995',shade:'#659729',ink:'#294319'},
  {id:'pink',name:'Pink',color:'#e9509a',light:'#f7a5d0',shade:'#bf317a',ink:'#521a37'},
  {id:'purple',name:'Purple',color:'#9566c7',light:'#c7a5e8',shade:'#69439e',ink:'#2d1b43'},
  {id:'orange',name:'Orange',color:'#ed8a28',light:'#ffc57a',shade:'#bd5c16',ink:'#57300f'},
  {id:'yellow',name:'Yellow',color:'#ecd138',light:'#fff297',shade:'#b69b20',ink:'#493e12'},
  {id:'red',name:'Red',color:'#cb2543',light:'#ed7b8b',shade:'#9c1630',ink:'#fff0f1'},
  {id:'gold',name:'Gold',color:'#d5bd94',light:'#f4e6cc',shade:'#ad9065',ink:'#4e402d'},
  {id:'rose-gold',name:'Rose Gold',color:'#d9aaa1',light:'#f5d9d1',shade:'#b78076',ink:'#51352f'},
  {id:'space-gray',name:'Space Gray',color:'#72787e',light:'#a4abb0',shade:'#4a5056',ink:'#f0f3f5',darkWheel:true},
  {id:'midnight',name:'Midnight',color:'#242f3b',light:'#4a5a6b',shade:'#141d28',ink:'#dfe8f0',darkWheel:true},
  {id:'starlight',name:'Starlight',color:'#e6dfcf',light:'#fffdf3',shade:'#c4bba7',ink:'#514b3e'},
  {id:'alpine-green',name:'Alpine Green',color:'#576d5b',light:'#91a391',shade:'#354b3b',ink:'#edf3e9',darkWheel:true},
  {id:'spotify',name:'Spotify',color:'#1ed760',light:'#7aeca2',shade:'#0d9541',ink:'#102b19',darkWheel:true}
];
function applyTheme(body,id){
  const theme=themes.find(theme=>theme.id===id)||themes[0];
  body.dataset.theme=theme.id;body.dataset.finish=theme.light?'color':'classic';body.dataset.wheel=theme.darkWheel?'dark':'light';
  for(const [key,value] of Object.entries({color:theme.color,light:theme.light,shade:theme.shade,ink:theme.ink})){
    if(value)body.style.setProperty(`--shell-${key}`,value);else body.style.removeProperty(`--shell-${key}`);
  }
}
if(typeof module!=='undefined')module.exports={themes,applyTheme};else window.TurnbitThemes={themes,applyTheme};
})();

import React, { createRef } from 'react';
import { createRoot } from 'react-dom/client';
import RubberSegment from './RubberSegment';
import DepthCarousel from './DepthCarousel';
import WakeSlider from './WakeSlider';
import { motion, useReducedMotion } from 'motion/react';
import './navigation.css';
import './outfit-carousel.css';
import './workflow-progress.css';

const items = [
  {value:'wardrobe',label:'衣柜',paths:<><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M12 3v18M9 11v3m6-3v3"/></>},
  {value:'outfits',label:'搭配',paths:<path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3Z"/>},
  {value:'saved',label:'记录',paths:<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>}
].map(({value,label,paths})=>({value,label:<span className="rewear-nav-label">{label}</span>,icon:<svg className="rewear-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths}</svg>}));
let root, host;
window.RewearNavigation = {
  render(container,value,onChange) {
    if (host!==container) { root?.unmount(); host=container; root=createRoot(container); }
    root.render(<RubberSegment items={items} value={value} onChange={onChange}
      trackColor="#111111" thumbColor="#f5f5f5" textColor="#ffffff" activeTextColor="#111111"
      size="lg" radius={39} inset={6} thumbWidth="circle" equalSlots stretch={100} squash={3}
      speed={1} glide={75} draggable className="rewear-navigation" aria-label="主导航"/>);
  }
};

const stepItems=[['0','选单品','ITEMS'],['1','选风格','STYLE'],['2','说偏好','PREFERENCES']].map(([value,zh,en])=>({
  value,label:<span className="rewear-step-copy"><span className="rewear-step-zh">{zh}</span><span className="rewear-step-en" lang="en">{en}</span></span>
}));
let stepRoot,stepHost;
window.RewearSteps={
  render(container,value,onChange){
    if(stepHost!==container){stepRoot?.unmount();stepHost=container;stepRoot=createRoot(container)}
    stepRoot.render(<RubberSegment items={stepItems} value={String(value)} onChange={(_,index)=>onChange(index)}
      trackColor="rgba(130,130,130,.12)" thumbColor="transparent" textColor="#444444" activeTextColor="#111111"
      size="lg" radius={30} inset={4} thumbSurface equalSlots stretch={100} squash={3}
      speed={1} glide={75} draggable className="rewear-step-navigation" aria-label="搭配步骤"/>);
  },
  unmount(){stepRoot?.unmount();stepRoot=null;stepHost=null}
};

const workflowLabels=['认识单品','寻找搭配','让它落地','穿出门'];
function WorkflowProgress({index}){
  const reduce=useReducedMotion();
  return <section className="workflow-progress" aria-label="穿搭进度">
    <div className="workflow-progress__track"><WakeSlider value={index} defaultValue={0} min={0} max={3} step={1}
      bars={37} height={40} restHeight={6} gap={3} fillColor="#111111" trackColor="#dedede"
      reach={7} glide={.55} smoothing={100} sensitivity={1.2} readOnly
      ariaLabel="穿搭阶段" formatValue={value=>`第 ${value+1} 步，共 4 步：${workflowLabels[value]}`}/></div>
    <ol className="workflow-progress__nodes">{workflowLabels.map((label,i)=><li key={label}
      className={i===index?'is-current':i<index?'is-complete':''} aria-current={i===index?'step':undefined}>
      <motion.span className="workflow-progress__node" aria-hidden="true"
        animate={{scale:i===index?(reduce?1:[1,1.2,1]):1,backgroundColor:i<=index?'#111111':'#ffffff',borderColor:i<=index?'#111111':'#cccccc'}}
        transition={{duration:reduce?0:.55}}>{i<index?<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5 10 3 3 7-7"/></svg>:i===index?<span className="workflow-progress__dot"/>:null}</motion.span>
      <span className="workflow-progress__label">{label}</span><span className="workflow-progress__sr">{i<index?'已完成':i===index?'当前阶段':'未开始'}</span>
    </li>)}</ol>
  </section>;
}
let workflowRoot,workflowHost;
window.RewearProgress={
  render(container,index){
    if(workflowHost!==container){workflowRoot?.unmount();workflowHost=container;workflowRoot=createRoot(container)}
    workflowRoot.render(<WorkflowProgress index={index}/>);
  },
  unmount(){workflowRoot?.unmount();workflowRoot=null;workflowHost=null}
};

const outfitCardContent=item=><div dangerouslySetInnerHTML={{__html:item.html}}/>;
const carouselRef=createRef();
let deckRoot,deckHost;
window.RewearDeck={
  render(container,items,index,onChange){
    if(deckHost!==container){deckRoot?.unmount();deckHost=container;deckRoot=createRoot(container)}
    deckRoot.render(<DepthCarousel ref={carouselRef} items={items} index={index} onChange={onChange}
      renderItem={outfitCardContent} fullWidth cardWidth={362} cardHeight={730} radius={22}
      depth={180} spread={55} tilt={22} tiltDirection="right" perspective={1400}
      visibleCards={3} falloff={.12} blur={3} tint="#111111" duration={700} ease="power3.out"
      autoplay={false} loop={false} showControls={false} showIndicators={false}
      className="rewear-outfit-carousel" ariaLabel="穿搭卡片，左右滑动切换"/>);
  },
  goTo(index){carouselRef.current?.goTo(index)},
  unmount(){deckRoot?.unmount();deckRoot=null;deckHost=null}
};

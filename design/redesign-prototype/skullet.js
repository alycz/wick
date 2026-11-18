var Skullet=(()=>{var F=Object.defineProperty;var At=Object.getOwnPropertyDescriptor;var Bt=Object.getOwnPropertyNames;var Nt=Object.prototype.hasOwnProperty;var zt=(t,e)=>{for(var o in e)F(t,o,{get:e[o],enumerable:!0})},Ot=(t,e,o,n)=>{if(e&&typeof e=="object"||typeof e=="function")for(let r of Bt(e))!Nt.call(t,r)&&r!==o&&F(t,r,{get:()=>e[r],enumerable:!(n=At(e,r))||n.enumerable});return t};var Lt=t=>Ot(F({},"__esModule",{value:!0}),t);var Re={};zt(Re,{addStyles:()=>mt,applyTheme:()=>ft,drawSkeleton:()=>Et,measureSkeleton:()=>kt,prefersReducedMotion:()=>I});var Ft="skullet-reveal",Pt="skullet-pane",C="skullet-loading",V="skullet-ghost";var Y="skullet-layer",Wt="skullet-rect",jt="skullet-bar",_t="skullet-inactive";var A="skullet-covered",dt="skullet-own",qt="skullet-ignore",L="skullet-block",Ae=Symbol.for("skullet.ghost"),Be=Symbol.for("skullet.uncover"),Dt="skullet-status",K="skullet-xray";var O="var(--skullet-base, rgb(128 128 128 / 0.2))",Ht="var(--skullet-highlight, rgb(255 255 255 / 0.12))";var It={shimmer:{slow:4e3,fast:2e3},pulse:{slow:2400,fast:1200}},ct=["a","b","code","dd","dt","em","h1","h2","h3","h4","h5","h6","i","label","li","p","small","span","strong","td","th","time"],H=["audio","canvas","embed","iframe","img","input","object","picture","select","svg","textarea","video"],J=H.join(", "),Xt=ct.join(", "),Ut=`
[${Ft}] {
  position: relative;
}

skullet-reveal {
  display: block;
}

skullet-reveal[loading]:not(:defined) {
  visibility: hidden;
}

[${Pt}] {
  display: block;
}

[${C}] {
  position: relative;
  -webkit-user-select: none;
  user-select: none;
  pointer-events: none;
}

[${_t}] {
  display: none !important;
}

[${Y}] {
  position: absolute;
  inset: 0;
  overflow: visible;
}

[${jt}] {
  display: block;
  background-color: ${O};
  background-repeat: no-repeat;
}

/* Containers keep their surface; what they hold is drawn by bones, measured before the first paint */
@scope ([${C}]) to ([${dt}], [${Y}]) {
  :scope,
  :scope * {
    color: transparent !important;
    -webkit-text-fill-color: transparent !important;
    text-shadow: none !important;
    text-decoration-color: transparent !important;
  }

  :scope ::placeholder {
    color: transparent !important;
  }

  /* A line to measure in empty text; content only, never a size, or a dot-sized span would grow round it */
  :scope :is(${Xt}):empty:not(svg *)::before {
    content: "000000";
  }

  /* Leaves are drawn by bones, so their own paint never shows; visibility, as measuring reads it */
  :scope :is(:not(:has(*)), ${J}, [${A}], [${L}]):not(svg *) {
    visibility: hidden !important;
  }

  /* No script to measure: a bar struck through each line of text instead */
  @media (scripting: none) {
    :scope :not(:has(*)):not(svg *) {
      visibility: visible !important;
    }

    :scope,
    :scope * {
      text-decoration: line-through ${O} !important;
      text-decoration-thickness: 0.72em !important;
      text-decoration-skip-ink: none !important;
    }

    :scope :is(${J}, [${L}]):not(svg *) {
      visibility: visible !important;
      background: ${O} !important;
    }

    :scope svg * {
      fill: transparent !important;
      stroke: transparent !important;
    }

    :scope :is(img, video) {
      object-position: -100vw 0;
    }
  }
}

/* Read by screen readers in the skeleton's place, never seen */
[${Dt}] {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* Debug x-ray: the ghost shown through its bones, to see what was measured */
[${K}] [${C}] [${V}],
[${K}] [${C}] [${V}] *:not(svg *) {
  visibility: visible !important;
  color: rgb(255 0 80 / 0.7) !important;
  -webkit-text-fill-color: rgb(255 0 80 / 0.7) !important;
}

/* Lets addStyles see a stylesheet already on the page, from styles.css or a server render */
:root {
  --skullet: 1;
}`,R=null,Gt=0,Z;function mt(){Gt++,!R&&(Z??=!!getComputedStyle(document.documentElement).getPropertyValue("--skullet"),!Z&&(R=document.createElement("style"),R.dataset.skullet="true",R.textContent=Ut,document.head.appendChild(R)))}var pt={light:{base:"rgb(0 0 0 / 0.07)",highlight:"rgb(255 255 255 / 0.6)"},dark:{base:"rgb(255 255 255 / 0.08)",highlight:"rgb(255 255 255 / 0.1)"}},Ne={...pt,animation:"shimmer",speed:"slow",text:{top:"ascender",bottom:"descender"}};function Q(t={},e=null){let o={},n=e&&(t[e]??pt[e]);return n&&(o["--skullet-base"]=n.base,o["--skullet-highlight"]=n.highlight),t.radius&&(o["--skullet-radius"]=t.radius),t.animation&&(o["--skullet-animation"]=t.animation),t.speed&&(o["--skullet-speed"]=t.speed),t.text?.top&&(o["--skullet-text-top"]=t.text.top),t.text?.bottom&&(o["--skullet-text-bottom"]=t.text.bottom),o}var tt=t=>Object.entries(t).map(([e,o])=>`${e}: ${o};`).join(" ");function Vt({theme:t={},mode:e,text:o,selector:n=":root"}){let r={...t,text:{...t.text,...o}},s=e??(t.light||t.dark?"system":null),l=Q(r,s==="dark"?"dark":s?"light":null),u=[];if(Object.keys(l).length&&u.push(`${n} { ${tt(l)} }`),s==="system"){let a=Q({dark:t.dark},"dark");u.push(`@media (prefers-color-scheme: dark) { ${n} { ${tt(a)} } }`)}return u.join(`
`)}var P=null;function ft(t,e,{nonce:o}={}){P??=document.head.appendChild(document.createElement("style")),o&&(P.nonce=o),P.textContent=Vt({theme:t,mode:e})}var Yt,Kt=()=>Yt??=/jsdom/.test(navigator.userAgent)?null:document.createElement("canvas").getContext("2d"),gt=(t,e)=>t?{left:Math.max(t.left,e.left),right:Math.min(t.right,e.right),top:Math.max(t.top,e.top),bottom:Math.min(t.bottom,e.bottom)}:e,B=t=>[[t.left,t.top],[t.right,t.top],[t.right,t.bottom],[t.left,t.bottom]],q=(t,e)=>Math.abs(t[0]-e[0])<1&&Math.abs(t[1]-e[1])<1;function bt(t,e){let o=Math.min(e.right-e.left,e.bottom-e.top),n=r=>r.endsWith("%")?parseFloat(r)/100*o:parseFloat(r)||0;return[n(t.borderTopLeftRadius),n(t.borderTopRightRadius),n(t.borderBottomRightRadius),n(t.borderBottomLeftRadius)]}function Jt(t,e,o){let n=gt(t,e),r=bt(o,e),s=t?B(t):[],l=B(e),u=B(n).map((g,y)=>q(g,l[y])?r[y]:t&&q(g,s[y])?t.corners[y]:0),{left:a,right:i,top:h,bottom:f}=n;return{left:a,right:i,top:h,bottom:f,corners:u}}function Zt(t,e,o,n){if(!t)return o;let r=B(t),s=B(e).map((u,a)=>t.corners[a]>0&&q(u,r[a]));if(!s.some(Boolean))return o;let l=bt(n,e);return s.map((u,a)=>u?Math.max(l[a],t.corners[a]):l[a]).map(u=>`${u}px`).join(" ")}var et=(t,e)=>{let o=gt(e,t);return o.right-o.left>=2&&o.bottom-o.top>=2?o:null},ot={top:"ascender",bottom:"descender"},W=new Map,yt=t=>[...t.getClientRects?.()??[]];function Qt(t){let e=`${t.fontStyle} ${t.fontWeight} ${t.fontSize} ${t.fontFamily}`;if(W.has(e))return W.get(e);let o=Kt(),n=null;if(o){o.font=e;let r=o.measureText("H"),s=l=>o.measureText(l).actualBoundingBoxAscent;n={ascent:r.fontBoundingBoxAscent,descent:r.fontBoundingBoxDescent,ascender:s("bdfhkl"),capHeight:r.actualBoundingBoxAscent,xHeight:s("xz"),descender:o.measureText("gjpqy").actualBoundingBoxDescent}}return W.set(e,n),n}var nt={ascender:"ascender","cap-height":"capHeight","x-height":"xHeight"},rt=(t,e,o,n)=>{let r=t.getPropertyValue(e).trim();return o.includes(r)?r:n};function te(t,e,o){let n=Qt(e);if(!n){let a=Math.min(o*.72,t.bottom-t.top),i=(t.top+t.bottom)/2;return{barTop:i-a/2,barBottom:i+a/2}}let r=rt(e,"--skullet-text-top",Object.keys(nt),ot.top),s=rt(e,"--skullet-text-bottom",["baseline","descender"],ot.bottom),l=n.ascent+n.descent,u=t.top+(t.bottom-t.top-l)/2+n.ascent;return{barTop:u-n[nt[r]],barBottom:u+(s==="descender"?n.descender:0)}}var ee=new Set(H),oe=new Set(ct),vt=.4,ne=/[,/]\s*0\)$/,N=(t,e)=>t!==""&&t!==e,re=["Top","Right","Bottom","Left"],ie=t=>re.every(e=>N(t[`border${e}Style`],"none")&&N(t[`border${e}Width`],"0px")),ae=t=>{let[e=0,o=0,n=0,r=0]=(t.replace(/rgba?\([^)]*\)|#\w+/g,"").match(/-?[\d.]+px/g)??[]).map(parseFloat);return t.includes("inset")&&!n&&!r&&e===0!=(o===0)&&Math.abs(e+o)<=2},se=t=>N(t,"none")&&!t.split(/,(?![^(]*\))/).every(ae),le=t=>N(t.backgroundColor,"transparent")&&!ne.test(t.backgroundColor)||N(t.backgroundImage,"none")||se(t.boxShadow)||ie(t),xt=t=>ee.has(t.localName),wt=t=>oe.has(t.localName)&&!t.firstElementChild&&!t.textContent?.trim(),ue=t=>{let e=document.createTreeWalker(t,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT),o=document.createRange(),n=[],r=0;for(;e.nextNode();){let i=e.currentNode;if(i.nodeType===Node.TEXT_NODE){let h=i.parentElement;if(!i.textContent?.trim()||!h)continue;r++;let f=h.getBoundingClientRect();if(f.width<=1||f.height<=1)continue;o.selectNodeContents(i),n.push(yt(o).filter(g=>g.width||g.height))}else wt(i)&&(r++,n.push([...i.getClientRects()]))}if(!n.some(i=>i.length))return r;let s=(parseFloat(getComputedStyle(t).fontSize)||16)*vt,l=(i,h)=>Math.min(i.bottom,h.bottom)-Math.max(i.top,h.top)>=Math.min(i.height,h.height)/2&&Math.max(i.left,h.left)-Math.min(i.right,h.right)<=s,u=n.map((i,h)=>h),a=i=>u[i]===i?i:u[i]=a(u[i]);for(let i=0;i<n.length;i++)for(let h=i+1;h<n.length;h++)n[i].some(f=>n[h].some(g=>l(f,g)))&&(u[a(h)]=a(i));return new Set(n.map((i,h)=>a(h))).size},he=(t,e)=>t.hasAttribute(L)||xt(t)||le(e)&&ue(t)<=1;function de(t,e){if(parseFloat(e.borderRadius)||!t.parentElement)return e.borderRadius||"0px";let o=t.parentElement,n=getComputedStyle(o),r=t.getBoundingClientRect(),s=o.getBoundingClientRect();return Math.abs(r.width-s.width)<1&&Math.abs(r.height-s.height)<1&&n.overflow!=="visible"?n.borderRadius:e.borderRadius||"0px"}function it(t){t.sort((o,n)=>o.left-n.left);let e=[];for(let o of t){let n=e.find(r=>{let s=Math.min(r.bottom,o.bottom)-Math.max(r.top,o.top),l=Math.min(r.bottom-r.top,o.bottom-o.top),u=o.left-r.right;return s>=l/2&&u<=Math.max(r.fontSize,o.fontSize)*vt});n?(n.left=Math.min(n.left,o.left),n.right=Math.max(n.right,o.right),n.top=Math.min(n.top,o.top),n.bottom=Math.max(n.bottom,o.bottom),n.fontSize=Math.max(n.fontSize,o.fontSize),n.barTop=Math.min(n.barTop,o.barTop),n.barBottom=Math.max(n.barBottom,o.barBottom)):e.push({...o})}return e.map(o=>{let n=o.barBottom-o.barTop;return{x:o.left,y:o.barTop,width:o.right-o.left,height:n,radius:o.radius||`${Math.round(n/3)}px`}})}function kt(t,e,{mark:o=!0,onCovered:n}={}){let r=e.getBoundingClientRect(),s=e.offsetWidth?r.width/e.offsetWidth:1,l=e.offsetHeight?r.height/e.offsetHeight:1,u=d=>({left:(d.left-r.left)/s,right:(d.right-r.left)/s,top:(d.top-r.top)/l,bottom:(d.bottom-r.top)/l}),a=[],i=[],h=new Set,f=document.createRange(),g=(d,m,v)=>{let c=et(d,v);if(!c)return;let p=parseFloat(m.fontSize)||16,$=u(c);i.push({...$,fontSize:p,...te($,m,p),radius:m.getPropertyValue("--skullet-radius").trim()})},y=(d,m)=>{let v=d.data.search(/\S/);if(v<0||!d.parentElement)return;f.setStart(d,v),f.setEnd(d,d.data.trimEnd().length);let c=getComputedStyle(d.parentElement);for(let p of yt(f))g(p,c,m)},k=(d,m)=>{for(let v of d.childNodes){if(v.nodeType===Node.TEXT_NODE){y(v,m);continue}if(v.nodeType!==Node.ELEMENT_NODE)continue;let c=v;if(c.hasAttribute(qt)||c.hasAttribute(dt))continue;let p=getComputedStyle(c);if(p.display==="none")continue;if(he(c,p)){let b=et(c.getBoundingClientRect(),m);if(b){let w=u(b);a.push({x:w.left,y:w.top,width:w.right-w.left,height:w.bottom-w.top,radius:Zt(m,b,de(c,p),p)})}xt(c)||h.add(c);continue}if(wt(c)){for(let b of c.getClientRects())g(b,p,m);continue}let $=p.overflowX!=="visible"||p.overflowY!=="visible";k(c,$?Jt(m,c.getBoundingClientRect(),p):m)}};if(k(t,null),n?.(h),!o)return[...a,...it(i)];for(let d of t.querySelectorAll(`[${A}]`))h.has(d)||d.removeAttribute(A);for(let d of h)d.hasAttribute(A)||d.setAttribute(A,"");return[...a,...it(i)]}var $t=t=>typeof matchMedia<"u"&&matchMedia(t).matches,ce=()=>typeof Element<"u"&&typeof Element.prototype.animate=="function",I=()=>!ce()||$t("(prefers-reduced-motion: reduce)"),me=()=>$t("(prefers-reduced-transparency: reduce)"),pe=t=>t.getAnimations?.()??[],fe=.7,ge=1280,at=320,be=2.5,ye=.45,ve=["shimmer","group-shimmer","pulse","none"];function St(t){let e=getComputedStyle(t),o=(s,l,u)=>{let a=e.getPropertyValue(s).trim();return l.includes(a)?a:u},n=o("--skullet-animation",ve,"shimmer"),r=o("--skullet-speed",["slow","fast"],"slow");return{animation:n,duration:It[n==="pulse"?"pulse":"shimmer"][r]}}var X=20,xe=Math.sin(X*Math.PI/180),U=Math.cos(X*Math.PI/180),T=xe/U,E=U,Mt=`${90+X}deg`,j=.85,x=12,z=t=>(1-Math.cos(Math.PI*t))/2;function we(t){let e=t*be,o=(r,s)=>`color-mix(in srgb, ${Ht} ${(s*100).toFixed(1)}%, transparent) ${(r*t).toFixed(2)}px`,n=[];for(let r=0;r<=x;r++)n.push(o(r/x*j,z(r/x)));for(let r=1;r<=x;r++)n.push(o(j+r/x*(1-j),z(1-r/x)));return{width:e/U,image:`repeating-linear-gradient(${Mt}, ${n.join(", ")}, transparent ${e.toFixed(2)}px)`}}function ke(t,e,o=St(t)){for(let g of pe(t))g.cancel();if(t.style.backgroundImage="",t.style.backgroundRepeat="",I()||typeof t.animate!="function"||o.animation==="none")return;let n={duration:o.duration,iterations:1/0};if(o.animation==="pulse"){t.animate([{opacity:1,easing:"ease-in-out"},{opacity:ye,easing:"ease-in-out"},{opacity:1}],n).startTime=0;return}let r=t.getBoundingClientRect(),s=r.left+scrollX,l=o.animation==="group-shimmer"?e??{left:s,top:r.top,width:r.width,height:r.height}:{left:0,top:0,width:document.documentElement.clientWidth||innerWidth},u=Math.min(Math.max(l.width*.4,80),at),{width:a,image:i}=we(u),h=s-l.left+(r.top-l.top)*T,f=o.duration*fe/(ge+at);t.style.backgroundImage=i,t.style.backgroundSize=`${a}px 100%`,t.style.backgroundRepeat="repeat-x",t.animate([{backgroundPosition:`${-h}px 0`},{backgroundPosition:`${a-h}px 0`}],{duration:a*f,iterations:1/0}).startTime=0}var $e=t=>t.shadowRoot??t.attachShadow({mode:"open"});function Et(t,e){let o=$e(t),n=t.getBoundingClientRect(),r={left:n.left+scrollX,top:n.top,width:n.width,height:n.height},s=St(t);for(e.forEach((l,u)=>{let a=o.children[u];a||(a=document.createElement("div"),a.setAttribute(Wt,""),a.style.cssText=`position:absolute;display:block;pointer-events:none;background-color:${O};background-repeat:no-repeat`,o.append(a)),Object.assign(a.style,{left:`${l.x}px`,top:`${l.y}px`,width:`${l.width}px`,height:`${l.height}px`,borderRadius:l.radius});let i=`${Math.round(r.left+l.x)}|${Math.round(l.y)}|${Math.round(l.height)}|${Math.round(r.left)}|${Math.round(r.width)}|${Math.round(r.height)}|${document.documentElement.clientWidth}|${s.animation}|${s.duration}`;a.dataset.motion!==i&&(a.dataset.motion=i,ke(a,r,s))});o.children.length>e.length;)o.lastElementChild.remove()}var ze=new Set(H);var st=!1;try{st=!1}catch{st=!1}var Oe=[100,90,60].map(t=>`<div ${L} style="width:${t}%;height:0.75em;margin:0.5em 0;border-radius:0.25em"></div>`).join(""),Le=new WeakSet(typeof document>"u"?[]:document.querySelectorAll(`[${C}]`));var D=40,lt=D/E,_=320,Se=120,ut=.45,G=t=>t.left+t.top*T,Tt=t=>t.width+t.height*T,Rt=(t,e)=>G(e)-lt+(Tt(e)+2*lt)*t;var ht=t=>(e,{rect:o,reveal:n})=>{let r=(Rt(e,n)-G(o))*E,s=Array.from({length:x+1},(l,u)=>{let a=t?1-z(u/x):z(u/x),i=-D+2*D*u/x;return`rgb(0 0 0 / ${a.toFixed(3)}) ${(r+i).toFixed(2)}px`});return`linear-gradient(${Mt}, ${s.join(", ")})`},Ct="http://www.w3.org/2000/svg",S=null,Me=0;function Ee(){return S?.isConnected||(S=document.createElementNS(Ct,"svg"),S.setAttribute("aria-hidden","true"),S.style.cssText="position:absolute;width:0;height:0;overflow:hidden",document.body.append(S)),S}var M=(t,e)=>{let o=document.createElementNS(Ct,t);for(let[n,r]of Object.entries(e))o.setAttribute(n,String(r));return o},Te=(t,{rect:e,reveal:o,progress:n})=>{if(me())return;let r=G(e),s=Tt(e),l=_/2/E,u=()=>Rt(n(),o)-r-Se/E;if(u()-l>s)return;let a=2*l+e.height*T,i=a/2,h=e.height/2,f=_/2*E,g=_/2*T*E,y=document.createElement("canvas");y.width=Math.ceil(a),y.height=Math.ceil(e.height);let k=y.getContext("2d");if(!k)return;let d=k.createLinearGradient(i-f,h-g,i+f,h+g);for(let b=0;b<=x;b++){let w=b/x;d.addColorStop(w,`rgb(255 255 255 / ${z(1-Math.abs(w*2-1)).toFixed(3)})`)}k.fillStyle=d,k.fillRect(0,0,y.width,y.height);let m=`skullet-gloss-${++Me}`,v=M("filter",{id:m,"color-interpolation-filters":"sRGB",primitiveUnits:"objectBoundingBox"}),c=M("feComponentTransfer",{in:"SourceGraphic",result:"lit"});for(let b of["R","G","B"])c.append(M(`feFunc${b}`,{type:"linear",slope:1-ut,intercept:ut}));let p=M("feImage",{href:y.toDataURL(),y:0,width:a/e.width,height:1,preserveAspectRatio:"none",result:"band"});v.append(c,p,M("feComposite",{in:"lit",in2:"band",operator:"in",result:"shine"}),M("feComposite",{in:"shine",in2:"SourceGraphic",operator:"over"})),Ee().append(v),t.style.filter=`url(#${m})`;let $=()=>{let b=u();if(b-l>s||!t.isConnected){t.style.filter.includes(m)&&(t.style.filter=""),v.remove();return}p.setAttribute("x",((b-i-h*T)/e.width).toFixed(4)),requestAnimationFrame($)};$()},Fe={mask:ht(!0),out:ht(!1),effect:Te};return Lt(Re);})();

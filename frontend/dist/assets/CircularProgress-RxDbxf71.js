import{r as e}from"./rolldown-runtime-QTnfLwEv.js";import{M as t,N as n,P as r,g as i,h as a,i as o,l as s,m as c,o as l,ot as u,p as d,st as f,w as p}from"./Box-BLXgjf5s.js";import{h as m,m as h}from"./ButtonBase-GCTXU859.js";var g=e(f(),1),_=0;function v(e){let[t,n]=g.useState(e),r=e||t;return g.useEffect(()=>{t??(_+=1,n(`mui-${_}`))},[t]),r}var y={...g}.useId;function b(e){if(y!==void 0){let t=y();return e??t}return v(e)}var x=b;function S(e){return n(`MuiCircularProgress`,e)}t(`MuiCircularProgress`,[`root`,`determinate`,`indeterminate`,`colorPrimary`,`colorSecondary`,`svg`,`track`,`circle`,`circleDisableShrink`]);var C=u(),w=44,T=m`
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
`,E=m`
  0% {
    stroke-dasharray: 1px, 200px;
    stroke-dashoffset: 0;
  }

  50% {
    stroke-dasharray: 100px, 200px;
    stroke-dashoffset: -15px;
  }

  100% {
    stroke-dasharray: 1px, 200px;
    stroke-dashoffset: -126px;
  }
`,D=typeof T==`string`?null:h`
        animation: ${T} 1.4s linear infinite;
      `,O=typeof E==`string`?null:h`
        animation: ${E} 1.4s ease-in-out infinite;
      `,k=e=>{let{classes:t,variant:n,color:r,disableShrink:i}=e;return p({root:[`root`,n,`color${d(r)}`],svg:[`svg`],track:[`track`],circle:[`circle`,i&&`circleDisableShrink`]},S,t)},A=i(`span`,{name:`MuiCircularProgress`,slot:`Root`,overridesResolver:(e,t)=>{let{ownerState:n}=e;return[t.root,t[n.variant],t[`color${d(n.color)}`]]}})(a(({theme:e})=>{let t=l(e,{animation:`none`});return{display:`inline-block`,variants:[{props:{variant:`determinate`},style:{...s(e,`transform`)}},{props:{variant:`indeterminate`},style:D||{animation:`${T} 1.4s linear infinite`}},...t?[{props:{variant:`indeterminate`},style:t}]:[],...Object.entries(e.palette).filter(o()).map(([t])=>({props:{color:t},style:{color:(e.vars||e).palette[t].main}}))]}})),j=i(`svg`,{name:`MuiCircularProgress`,slot:`Svg`})({display:`block`}),M=i(`circle`,{name:`MuiCircularProgress`,slot:`Circle`,overridesResolver:(e,t)=>{let{ownerState:n}=e;return[t.circle,n.disableShrink&&t.circleDisableShrink]}})(a(({theme:e})=>{let t=l(e,{animation:`none`});return{stroke:`currentColor`,variants:[{props:{variant:`determinate`},style:{...s(e,`stroke-dashoffset`)}},{props:{variant:`indeterminate`},style:{strokeDasharray:`80px, 200px`,strokeDashoffset:0}},{props:({ownerState:e})=>e.variant===`indeterminate`&&!e.disableShrink,style:O||{animation:`${E} 1.4s ease-in-out infinite`}},...t?[{props:({ownerState:e})=>e.variant===`indeterminate`&&!e.disableShrink,style:t}]:[]]}})),N=i(`circle`,{name:`MuiCircularProgress`,slot:`Track`})(a(({theme:e})=>({stroke:`currentColor`,opacity:(e.vars||e).palette.action.activatedOpacity}))),P=g.forwardRef(function(e,t){let n=c({props:e,name:`MuiCircularProgress`}),{className:i,color:a=`primary`,disableShrink:o=!1,enableTrackSlot:s=!1,min:l,max:u,size:d=40,style:f,thickness:p=3.6,value:m=n.min??0,variant:h=`indeterminate`,...g}=n,_=l??0,v=u??100,y={...n,color:a,disableShrink:o,size:d,thickness:p,value:m,variant:h,enableTrackSlot:s},b=k(y),x={},S={},T={};if(h===`determinate`){let e=2*Math.PI*((w-p)/2),t=v-_;x.strokeDasharray=e.toFixed(3),x.strokeDashoffset=t>0?`${((v-m)/t*e).toFixed(3)}px`:`${e.toFixed(3)}px`,S.transform=`rotate(-90deg)`,T[`aria-valuenow`]=m,T[`aria-valuemin`]=_,T[`aria-valuemax`]=v}return(0,C.jsx)(A,{className:r(b.root,i),style:{width:d,height:d,...S,...f},ownerState:y,ref:t,role:`progressbar`,...T,...g,children:(0,C.jsxs)(j,{className:b.svg,ownerState:y,viewBox:`${w/2} ${w/2} ${w} ${w}`,children:[s?(0,C.jsx)(N,{className:b.track,ownerState:y,cx:w,cy:w,r:(w-p)/2,fill:`none`,strokeWidth:p,"aria-hidden":`true`}):null,(0,C.jsx)(M,{className:b.circle,style:x,ownerState:y,cx:w,cy:w,r:(w-p)/2,fill:`none`,strokeWidth:p})]})})});export{x as n,b as r,P as t};
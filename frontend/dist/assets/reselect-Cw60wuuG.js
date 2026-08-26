import{r as e}from"./rolldown-runtime-QTnfLwEv.js";import{M as t,N as n,P as r,g as i,h as a,m as o,o as s,ot as c,st as l,w as u}from"./Box-BLXgjf5s.js";import{h as d,m as f}from"./ButtonBase-GCTXU859.js";function p(e){return String(e).match(/[\d.\-+]*\s*(.*)/)[1]||``}function m(e){return parseFloat(e)}var h=e(l(),1);function g(e){return n(`MuiSkeleton`,e)}t(`MuiSkeleton`,[`root`,`text`,`rectangular`,`rounded`,`circular`,`pulse`,`wave`,`withChildren`,`fitContent`,`heightAuto`]);var _=c(),v=e=>{let{classes:t,variant:n,animation:r,hasChildren:i,width:a,height:o}=e;return u({root:[`root`,n,r,i&&`withChildren`,i&&!a&&`fitContent`,i&&!o&&`heightAuto`]},g,t)},y=d`
  0% {
    opacity: 1;
  }

  50% {
    opacity: 0.4;
  }

  100% {
    opacity: 1;
  }
`,b=d`
  0% {
    transform: translateX(-100%);
  }

  50% {
    /* +0.5s of delay between each loop */
    transform: translateX(100%);
  }

  100% {
    transform: translateX(100%);
  }
`,x=typeof y==`string`?null:f`
        animation: ${y} 2s ease-in-out 0.5s infinite;
      `,S=typeof b==`string`?null:f`
        &::after {
          animation: ${b} 2s linear 0.5s infinite;
        }
      `,C=i(`span`,{name:`MuiSkeleton`,slot:`Root`,overridesResolver:(e,t)=>{let{ownerState:n}=e;return[t.root,t[n.variant],n.animation!==!1&&t[n.animation],n.hasChildren&&t.withChildren,n.hasChildren&&!n.width&&t.fitContent,n.hasChildren&&!n.height&&t.heightAuto]}})(a(({theme:e})=>{let t=p(e.shape.borderRadius)||`px`,n=m(e.shape.borderRadius),r=s(e,{animation:`none`}),i=s(e,{"&::after":{animation:`none`,display:`none`}});return{display:`block`,backgroundColor:e.vars?e.vars.palette.Skeleton.bg:e.alpha(e.palette.text.primary,e.palette.mode===`light`?.11:.13),height:`1.2em`,variants:[{props:{variant:`text`},style:{marginTop:0,marginBottom:0,height:`auto`,transformOrigin:`0 55%`,transform:`scale(1, 0.60)`,borderRadius:`${n}${t}/${Math.round(n/.6*10)/10}${t}`,"&:empty:before":{content:`"\\00a0"`}}},{props:{variant:`circular`},style:{borderRadius:`50%`}},{props:{variant:`rounded`},style:{borderRadius:(e.vars||e).shape.borderRadius}},{props:({ownerState:e})=>e.hasChildren,style:{"& > *":{visibility:`hidden`}}},{props:({ownerState:e})=>e.hasChildren&&!e.width,style:{maxWidth:`fit-content`}},{props:({ownerState:e})=>e.hasChildren&&!e.height,style:{height:`auto`}},{props:{animation:`pulse`},style:x||{animation:`${y} 2s ease-in-out 0.5s infinite`}},...r?[{props:{animation:`pulse`},style:r}]:[],{props:{animation:`wave`},style:{position:`relative`,overflow:`hidden`,WebkitMaskImage:`-webkit-radial-gradient(white, black)`,"&::after":{background:`linear-gradient(
                90deg,
                transparent,
                ${(e.vars||e).palette.action.hover},
                transparent
              )`,content:`""`,position:`absolute`,transform:`translateX(-100%)`,bottom:0,left:0,right:0,top:0}}},{props:{animation:`wave`},style:S||{"&::after":{animation:`${b} 2s linear 0.5s infinite`}}},...i?[{props:{animation:`wave`},style:i}]:[]]}})),w=h.forwardRef(function(e,t){let n=o({props:e,name:`MuiSkeleton`}),{animation:i=`pulse`,className:a,component:s=`span`,height:c,style:l,variant:u=`text`,width:d,...f}=n,p={...n,animation:i,component:s,variant:u,hasChildren:!!f.children},m=v(p);return(0,_.jsx)(C,{as:s,ref:t,className:r(m.root,a),ownerState:p,...f,style:{width:d,height:c,...l}})}),T=Symbol(`NOT_FOUND`);function E(e,t=`expected a function, instead received ${typeof e}`){if(typeof e!=`function`)throw TypeError(t)}function D(e,t=`expected all items to be functions, instead received the following types: `){if(!e.every(e=>typeof e==`function`)){let n=e.map(e=>typeof e==`function`?`function ${e.name||`unnamed`}()`:typeof e).join(`, `);throw TypeError(`${t}[${n}]`)}}var O=e=>Array.isArray(e)?e:[e];function k(e){let t=Array.isArray(e[0])?e[0]:e;return D(t,`createSelector expects all input-selectors to be functions, but received the following types: `),t}function A(e,t){let n=[],{length:r}=e;for(let i=0;i<r;i++)n.push(e[i].apply(null,t));return n}function j(e){let t;return{get(n){return t&&e(t.key,n)?t.value:T},put(e,n){t={key:e,value:n}},getEntries(){return t?[t]:[]},clear(){t=void 0}}}function M(e,t){let n=[];function r(e){let r=n.findIndex(n=>t(e,n.key));if(r>-1){let e=n[r];return r>0&&(n.splice(r,1),n.unshift(e)),e.value}return T}function i(t,i){r(t)===T&&(n.unshift({key:t,value:i}),n.length>e&&n.pop())}function a(){return n}function o(){n=[]}return{get:r,put:i,getEntries:a,clear:o}}var N=(e,t)=>e===t;function P(e){return function(t,n){if(t===null||n===null||t.length!==n.length)return!1;let{length:r}=t;for(let i=0;i<r;i++)if(!e(t[i],n[i]))return!1;return!0}}function F(e,t){let{equalityCheck:n=N,maxSize:r=1,resultEqualityCheck:i}=typeof t==`object`?t:{equalityCheck:t},a=P(n),o=0,s=r<=1?j(a):M(r,a);function c(){let t=s.get(arguments);if(t===T){if(t=e.apply(null,arguments),o++,i){let e=s.getEntries().find(e=>i(e.value,t));e&&(t=e.value,o!==0&&o--)}s.put(arguments,t)}return t}return c.clearCache=()=>{s.clear(),c.resetResultsCount()},c.resultsCount=()=>o,c.resetResultsCount=()=>{o=0},c}var I=class{constructor(e){this.value=e}deref(){return this.value}},L=typeof WeakRef>`u`?I:WeakRef,R=0,z=1;function B(){return{s:R,v:void 0,o:null,p:null}}function V(e){return e instanceof L?e.deref():e}function H(e,t={}){let n=B(),{resultEqualityCheck:r}=t,i,a=0;function o(){let t=n,{length:o}=arguments;for(let e=0,n=o;e<n;e++){let n=arguments[e];if(typeof n==`function`||typeof n==`object`&&n){let e=t.o;e===null&&(t.o=e=new WeakMap);let r=e.get(n);r===void 0?(t=B(),e.set(n,t)):t=r}else{let e=t.p;e===null&&(t.p=e=new Map);let r=e.get(n);r===void 0?(t=B(),e.set(n,t)):t=r}}let s=t,c;if(t.s===z)c=t.v;else if(c=e.apply(null,arguments),a++,r){let e=V(i);e!=null&&r(e,c)&&(c=e,a!==0&&a--),i=typeof c==`object`&&c||typeof c==`function`?new L(c):c}return s.s=z,s.v=c,c}return o.clearCache=()=>{n=B(),o.resetResultsCount()},o.resultsCount=()=>a,o.resetResultsCount=()=>{a=0},o}function U(e,...t){let n=typeof e==`function`?{memoize:e,memoizeOptions:t}:e,r=(...e)=>{let t=0,r=0,i,a={},o=e.pop();typeof o==`object`&&(a=o,o=e.pop()),E(o,`createSelector expects an output function after the inputs, but received: [${typeof o}]`);let{memoize:s,memoizeOptions:c=[],argsMemoize:l=H,argsMemoizeOptions:u=[]}={...n,...a},d=O(c),f=O(u),p=k(e),m=s(function(){return t++,o.apply(null,arguments)},...d),h=l(function(){r++;let e=A(p,arguments);return i=m.apply(null,e),i},...f);return Object.assign(h,{resultFunc:o,memoizedResultFunc:m,dependencies:p,dependencyRecomputations:()=>r,resetDependencyRecomputations:()=>{r=0},lastResult:()=>i,recomputations:()=>t,resetRecomputations:()=>{t=0},memoize:s,argsMemoize:l})};return Object.assign(r,{withTypes:()=>r}),r}var W=U(H);export{w as i,U as n,F as r,W as t};
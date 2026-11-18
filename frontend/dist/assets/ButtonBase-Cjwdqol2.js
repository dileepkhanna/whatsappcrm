import{r as e}from"./rolldown-runtime-QTnfLwEv.js";import{M as t,N as n,P as r,g as i,m as a,ot as o,st as s,w as c,y as l}from"./Box-BLXgjf5s.js";import{i as u,r as d,t as f}from"./isFocusVisible-B501VXIn.js";var p=e(s(),1),m=typeof window<`u`?p.useLayoutEffect:p.useEffect;function h(...e){let t=p.useRef(void 0),n=p.useCallback(t=>{let n=e.map(e=>{if(e==null)return null;if(typeof e==`function`){let n=e,r=n(t);return typeof r==`function`?r:()=>{n(null)}}return e.current=t,()=>{e.current=null}});return()=>{n.forEach(e=>e?.())}},e);return p.useMemo(()=>e.every(e=>e==null)?null:e=>{t.current&&=(t.current(),void 0),e!=null&&(t.current=n(e))},e)}function g(e){let t=p.useRef(e);return m(()=>{t.current=e}),p.useRef((...e)=>(0,t.current)(...e)).current}var _=h,v=g,y={};function b(e,t){let n=p.useRef(y);return n.current===y&&(n.current=e(t)),n}var x=o(),S=`(prefers-reduced-motion: reduce)`,C=0,w=`0ms`,T=()=>{},E=()=>!1,D=()=>!0,O=()=>T;function k(e){let[t,n]=p.useState(()=>({enabled:e,matches:e?null:!1})),r=t.matches;return t.enabled!==e&&(r=null,e||(r=!1)),m(()=>{let r=t=>{n(n=>n.enabled===e&&n.matches===t?n:{enabled:e,matches:t})};if(!e){t.enabled&&r(!1);return}if(typeof window>`u`||typeof window.matchMedia!=`function`){r(!1);return}let i=window.matchMedia(S),a=()=>{r(i.matches)};return a(),i.addEventListener(`change`,a),()=>{i.removeEventListener(`change`,a)}},[e,t.enabled]),r}var A={...p}.useSyncExternalStore;function ee(e){let t=e?D:E,[n,r]=p.useMemo(()=>{if(!e||typeof window>`u`||typeof window.matchMedia!=`function`)return[E,O];let t=window.matchMedia(S);return[()=>t.matches,e=>(t.addEventListener(`change`,e),()=>{t.removeEventListener(`change`,e)})]},[e]);return A(r,n,t)}var te=A===void 0?k:ee;function j(e,t){let n=te(!t&&e===`system`),r=!t&&(e===`always`||e===`system`&&n!==!1);return p.useMemo(()=>({shouldReduceMotion:r,getTransitionTiming(e){return r?{duration:C,delay:w}:e}}),[r])}function M(e){let{focusableWhenDisabled:t,disabled:n,composite:r=!1,tabIndex:i=0,isNativeButton:a}=e,o=r&&t!==!1,s=r&&t===!1;return p.useMemo(()=>{let e={onKeyDown(e){n&&t&&e.key!==`Tab`&&e.preventDefault()}};return r||(e.tabIndex=i,!a&&n&&(e.tabIndex=t?i:-1)),(a&&(t||o)||!a&&n)&&(e[`aria-disabled`]=n),a&&(!t||s)&&(e.disabled=n),e},[r,n,t,o,s,a,i])}var N={};function ne(e){let{nativeButton:t,nativeButtonProp:n,internalNativeButton:r=t,allowInferredHostMismatch:i=!1,disabled:a,type:o,hasFormAction:s=!1,tabIndex:c=0,focusableWhenDisabled:l,stopEventPropagation:u=!1,onBeforeKeyDown:d,onBeforeKeyUp:f}=e,m=p.useRef(null),h=l===!0,g=M({focusableWhenDisabled:h,disabled:a,isNativeButton:t,tabIndex:c}),_=p.useCallback(()=>{let e=m.current;return e==null?t:e.tagName===`BUTTON`||!!(e.tagName===`A`&&e.href)},[t]),v=p.useMemo(()=>{let e=h?{}:{tabIndex:a?-1:c};return t?(e.type=o===void 0&&!s?`button`:o,h||(e.disabled=a)):(e.role=`button`,!h&&a&&(e[`aria-disabled`]=a)),h?{...e,...g}:e},[a,h,g,s,t,c,o]);return{getButtonProps:p.useCallback((e=N)=>{let{onClick:t,onKeyDown:n,onKeyUp:r,...i}=e,o=e=>{if(u&&e.stopPropagation(),a){e.preventDefault();return}t?.(e)},s=e=>{if(h&&g.onKeyDown(e),!a&&(d?.(e),n?.(e),!(e.target!==e.currentTarget||_()))){if(e.key===` `){e.preventDefault();return}e.key===`Enter`&&(e.preventDefault(),e.currentTarget.click())}},c=e=>{a||(f?.(e),r?.(e),e.target===e.currentTarget&&!_()&&e.key===` `&&!e.defaultPrevented&&e.currentTarget.click())};return{...v,...i,onClick:o,onKeyDown:s,onKeyUp:c}},[v,a,h,g,_,d,f,u]),rootRef:m}}var P=class e{static create(){return new e}static use(){let t=b(e.create).current,[n,r]=p.useState(!1);return t.shouldMount=n,t.setShouldMount=r,p.useEffect(t.mountEffect,[n]),t}constructor(){this.ref={current:null},this.mounted=null,this.didMount=!1,this.shouldMount=!1,this.setShouldMount=null}mount(){return this.mounted||(this.mounted=F(),this.shouldMount=!0,this.setShouldMount(this.shouldMount)),this.mounted}mountEffect=()=>{this.shouldMount&&!this.didMount&&this.ref.current!==null&&(this.didMount=!0,this.mounted.resolve())};start(...e){this.mount().then(()=>this.ref.current?.start(...e))}stop(...e){this.mount().then(()=>this.ref.current?.stop(...e))}pulsate(...e){this.mount().then(()=>this.ref.current?.pulsate(...e))}};function re(){return P.use()}function F(){let e,t,n=new Promise((n,r)=>{e=n,t=r});return n.resolve=e,n.reject=t,n}var I=[];function L(e){p.useEffect(e,I)}var R=class e{static create(){return new e}currentId=null;start(e,t){this.clear(),this.currentId=setTimeout(()=>{this.currentId=null,t()},e)}clear=()=>{this.currentId!==null&&(clearTimeout(this.currentId),this.currentId=null)};disposeEffect=()=>this.clear};function z(){let e=b(R.create).current;return L(e.disposeEffect),e}function B(e){let{className:t,classes:n,pulsate:i=!1,rippleX:a,rippleY:o,rippleSize:s,in:c,onExited:l,timeout:u}=e,[d,f]=p.useState(!1),m=z(),h=p.useRef(!1),g=p.useRef(l);g.current=l;let _=l!=null,v=r(t,n.ripple,n.rippleVisible,i&&n.ripplePulsate),y={width:s,height:s,top:-(s/2)+o,left:-(s/2)+a},b=r(n.child,d&&n.childLeaving,i&&n.childPulsate);return!c&&!d&&f(!0),p.useEffect(()=>{!c&&_?h.current||(h.current=!0,m.start(u,()=>{h.current=!1,g.current?.()})):(h.current=!1,m.clear())},[m,_,c,u]),(0,x.jsx)(`span`,{className:v,style:y,children:(0,x.jsx)(`span`,{className:b})})}var V=t(`MuiTouchRipple`,[`root`,`ripple`,`rippleVisible`,`ripplePulsate`,`child`,`childLeaving`,`childPulsate`]),H=550,U={},W=[],G=()=>{};function K(e,t){let n=new Set(t),r=new Map,i=[];for(let t of e)n.has(t)?i.length>0&&(r.set(t,i),i=[]):i.push(t);let a=[];for(let e of t){let t=r.get(e);t&&a.push(...t),a.push(e)}return a.push(...i),a}function q({event:e,element:t,center:n}){let r=t?t.getBoundingClientRect():{width:0,height:0,left:0,top:0},i,a;if(n||e===void 0||e.clientX===0&&e.clientY===0||!e.clientX&&!e.touches)i=Math.round(r.width/2),a=Math.round(r.height/2);else{let{clientX:t,clientY:n}=e.touches&&e.touches.length>0?e.touches[0]:e;i=Math.round(t-r.left),a=Math.round(n-r.top)}let o;if(n)o=Math.sqrt((2*r.width**2+r.height**2)/3),o%2==0&&(o+=1);else{let e=Math.max(Math.abs((t?t.clientWidth:0)-i),i)*2+2,n=Math.max(Math.abs((t?t.clientHeight:0)-a),a)*2+2;o=Math.sqrt(e**2+n**2)}return{rippleX:i,rippleY:a,rippleSize:o}}var J=u`
  0% {
    transform: scale(0);
    opacity: 0.1;
  }

  100% {
    transform: scale(1);
    opacity: 0.3;
  }
`,Y=u`
  0% {
    opacity: 1;
  }

  100% {
    opacity: 0;
  }
`,X=u`
  0% {
    transform: scale(1);
  }

  50% {
    transform: scale(0.92);
  }

  100% {
    transform: scale(1);
  }
`;function ie(e){if(e.motion.reducedMotion===`always`)return null;let t=d`
    &.${V.rippleVisible} {
      animation-name: ${J};
      animation-duration: ${H}ms;
      animation-timing-function: ${e.transitions.easing.easeInOut};
    }

    &.${V.ripplePulsate} {
      animation-duration: ${e.transitions.duration.shorter}ms;
    }

    & .${V.childLeaving} {
      animation-name: ${Y};
      animation-duration: ${H}ms;
      animation-timing-function: ${e.transitions.easing.easeInOut};
    }

    & .${V.childPulsate} {
      animation-name: ${X};
      animation-duration: 2500ms;
      animation-timing-function: ${e.transitions.easing.easeInOut};
      animation-iteration-count: infinite;
      animation-delay: 200ms;
    }
  `;return e.motion.reducedMotion===`system`?d`
      @media (prefers-reduced-motion: no-preference) {
        ${t}
      }
    `:t}var ae=i(`span`,{name:`MuiTouchRipple`,slot:`Root`})({overflow:`hidden`,pointerEvents:`none`,position:`absolute`,zIndex:0,top:0,right:0,bottom:0,left:0,borderRadius:`inherit`}),oe=i(B,{name:`MuiTouchRipple`,slot:`Ripple`})`
  opacity: 0;
  position: absolute;

  &.${V.rippleVisible} {
    opacity: 0.3;
    transform: scale(1);
  }

  /*
   * Order matters: 'child', 'childLeaving' and 'childPulsate' apply to the same
   * element with equal specificity, so the later rule wins. 'child' must come
   * before 'childLeaving' so the leaving 'opacity: 0' takes precedence. A focus
   * (pulsate) ripple keeps 'pulsateKeyframe' (no opacity animation) on exit, so
   * it relies on this static 'opacity: 0' to disappear on blur instead of
   * lingering until removal.
   */
  & .${V.child} {
    opacity: 1;
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background-color: currentColor;
  }

  & .${V.childLeaving} {
    opacity: 0;
  }

  & .${V.childPulsate} {
    position: absolute;
    /* @noflip */
    left: 0px;
    top: 0;
  }

  ${({theme:e})=>ie(e)}
`,se=p.forwardRef(function(e,t){let n=a({props:e,name:`MuiTouchRipple`}),i=j(l().motion.reducedMotion,!1),{center:o=!1,classes:s=U,className:c,...u}=n,[d,f]=p.useState({items:W,order:W}),m=d.items,h=p.useRef(0),g=p.useRef(null),_=p.useRef(!1);L(()=>(_.current=!0,()=>{_.current=!1})),p.useEffect(()=>{g.current&&=(g.current(),null)},[m]);let y=p.useRef(!1),b=z(),S=p.useRef(null),C=p.useRef(null),w=v(e=>{_.current&&f(t=>{let n=t.items.filter(t=>t.key!==e);return{items:n,order:K(t.order.filter(t=>t!==e),n.filter(e=>!e.exiting).map(e=>e.key))}})}),T=v(e=>{let{pulsate:t,rippleX:n,rippleY:r,rippleSize:i,cb:a}=e,o=h.current;h.current+=1,f(e=>{let a=[...e.items,{key:o,pulsate:t,rippleX:n,rippleY:r,rippleSize:i,exiting:!1}];return{items:a,order:K(e.order,a.filter(e=>!e.exiting).map(e=>e.key))}}),g.current=a}),E=v((e=U,t=U,n=G)=>{let{pulsate:r=!1,center:i=o||t.pulsate,fakeElement:a=!1}=t;if(e?.type===`mousedown`&&y.current){y.current=!1;return}e?.type===`touchstart`&&(y.current=!0);let{rippleX:s,rippleY:c,rippleSize:l}=q({event:e,element:a?null:C.current,center:i});e?.touches?S.current===null&&(S.current=()=>{T({pulsate:r,rippleX:s,rippleY:c,rippleSize:l,cb:n})},b.start(80,()=>{S.current&&=(S.current(),null)})):T({pulsate:r,rippleX:s,rippleY:c,rippleSize:l,cb:n})}),D=v(()=>{E(U,{pulsate:!0})}),O=v((e,t)=>{if(b.clear(),e?.type===`touchend`&&S.current){S.current(),S.current=null,b.start(0,()=>{O(e,t)});return}S.current=null,f(e=>{let t=e.items.findIndex(e=>!e.exiting);if(t===-1)return e;let n=e.items.slice();return n[t]={...n[t],exiting:!0},{items:n,order:K(e.order,n.filter(e=>!e.exiting).map(e=>e.key))}}),g.current=t});p.useImperativeHandle(t,()=>({pulsate:D,start:E,stop:O}),[D,E,O]);let k=new Map(m.map(e=>[e.key,e])),A=d.order.map(e=>k.get(e)).filter(Boolean);return(0,x.jsx)(ae,{className:r(V.root,s.root,c),ref:C,...u,children:A.map(e=>(0,x.jsx)(oe,{classes:{ripple:r(s.ripple,V.ripple),rippleVisible:r(s.rippleVisible,V.rippleVisible),ripplePulsate:r(s.ripplePulsate,V.ripplePulsate),child:r(s.child,V.child),childLeaving:r(s.childLeaving,V.childLeaving),childPulsate:r(s.childPulsate,V.childPulsate)},timeout:i.shouldReduceMotion?0:H,pulsate:e.pulsate,rippleX:e.rippleX,rippleY:e.rippleY,rippleSize:e.rippleSize,in:!e.exiting,onExited:()=>w(e.key)},e.key))})});function Z(e){return n(`MuiButtonBase`,e)}var ce=t(`MuiButtonBase`,[`root`,`disabled`,`focusVisible`]),le=e=>{let{disabled:t,focusVisible:n,focusVisibleClassName:r,suppressFocusVisible:i,classes:a}=e,o=c({root:[`root`,t&&`disabled`,n&&!i&&`focusVisible`]},Z,a);return n&&!i&&r&&(o.root+=` ${r}`),o},ue=i(`button`,{name:`MuiButtonBase`,slot:`Root`})({display:`inline-flex`,alignItems:`center`,justifyContent:`center`,position:`relative`,boxSizing:`border-box`,WebkitTapHighlightColor:`transparent`,backgroundColor:`transparent`,outline:0,border:0,margin:0,borderRadius:0,padding:0,cursor:`pointer`,userSelect:`none`,verticalAlign:`middle`,MozAppearance:`none`,WebkitAppearance:`none`,textDecoration:`none`,color:`inherit`,"&::-moz-focus-inner":{borderStyle:`none`},[`&.${ce.disabled}`]:{pointerEvents:`none`,cursor:`default`},"@media print":{colorAdjust:`exact`}}),de=p.forwardRef(function(e,t){let n=a({props:e,name:`MuiButtonBase`}),{action:i,centerRipple:o=!1,children:s,className:c,component:l=`button`,disabled:u=!1,disableRipple:d=!1,disableTouchRipple:m=!1,focusRipple:h=!1,focusVisibleClassName:g,focusableWhenDisabled:y,suppressFocusVisible:b=!1,internalNativeButton:S,LinkComponent:C=`a`,nativeButton:w,onBlur:T,onClick:E,onContextMenu:D,onDragLeave:O,onFocus:k,onFocusVisible:A,onKeyDown:ee,onKeyUp:te,onMouseDown:j,onMouseLeave:M,onMouseUp:N,onTouchEnd:P,onTouchMove:F,onTouchStart:I,tabIndex:L=0,TouchRippleProps:R,touchRippleRef:z,type:B,...V}=n,H=!!(V.href||V.to),U=!!V.formAction,W=l;W===`button`&&H&&(W=C);let G=typeof W==`string`?W===`button`:S??!1,K=w??G,q=re(),J=_(q.ref,z),[Y,X]=p.useState(!1);(u||b)&&Y&&X(!1);let ie=v(e=>{h&&!e.repeat&&Y&&e.key===` `&&q.stop(e,()=>{q.start(e)})}),ae=v(e=>{h&&e.key===` `&&Y&&!e.defaultPrevented&&q.stop(e,()=>{q.pulsate(e)})}),{getButtonProps:oe,rootRef:Z}=ne({nativeButton:K,nativeButtonProp:w,internalNativeButton:G,allowInferredHostMismatch:H||typeof W==`string`,disabled:u,type:B,hasFormAction:U,tabIndex:L,onBeforeKeyDown:ie,onBeforeKeyUp:ae}),{onClick:ce,onKeyDown:de,onKeyUp:fe,...pe}=oe({onClick:E,onKeyDown:ee,onKeyUp:te});p.useImperativeHandle(i,()=>({focusVisible:()=>{X(!0),Z.current.focus()}}),[Z]);let me=q.shouldMount&&!d&&!u;p.useEffect(()=>{Y&&h&&!d&&q.pulsate()},[d,h,Y,q]);let he=Q(q,`start`,j,m),ge=Q(q,`stop`,D,m),_e=Q(q,`stop`,O,m),ve=Q(q,`stop`,N,m),ye=Q(q,`stop`,e=>{Y&&e.preventDefault(),M&&M(e)},m),be=Q(q,`start`,I,m),xe=Q(q,`stop`,P,m),Se=Q(q,`stop`,F,m),Ce=Q(q,`stop`,e=>{f(e.target)||X(!1),T&&T(e)},!1),we=v(e=>{Z.current||=e.currentTarget,!b&&f(e.target)&&(X(!0),A&&A(e)),k&&k(e)}),$={};H&&($.tabIndex=u?-1:L,u&&($[`aria-disabled`]=u),$.type=B);let Te=_(t,Z),Ee={...n,centerRipple:o,component:l,disabled:u,disableRipple:d,disableTouchRipple:m,focusRipple:h,suppressFocusVisible:b,tabIndex:L,focusVisible:Y},De=le(Ee);return(0,x.jsxs)(ue,{as:W,className:r(De.root,c),ownerState:Ee,onBlur:Ce,onClick:ce,onContextMenu:ge,onFocus:we,onKeyDown:de,onKeyUp:fe,onMouseDown:he,onMouseLeave:ye,onMouseUp:ve,onDragLeave:_e,onTouchEnd:xe,onTouchMove:Se,onTouchStart:be,ref:Te,...H?$:pe,...V,children:[s,me?(0,x.jsx)(se,{ref:J,center:o,...R}):null]})});function Q(e,t,n,r=!1){return v(i=>(n&&n(i),r||e[t](i),!0))}export{j as a,_ as c,m as d,L as i,g as l,R as n,b as o,z as r,v as s,de as t,h as u};
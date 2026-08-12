var Zn=`
:root { color-scheme: dark; }
#lcx-fallback { margin: 18px 0 0; max-width: 1200px; font: 400 12px/1.5 ui-monospace, monospace; color: #C4D4F0; }
#lcx-fallback h2 { font: 600 12px/1.2 ui-monospace, monospace; letter-spacing: .14em; text-transform: uppercase; color: #8FB7FF; margin: 0 0 4px; }
#lcx-fallback .reads { color: rgba(196,212,240,.72); margin: 0 0 10px; max-width: 78ch; }
#lcx-fallback .notice { color: #E0A94A; margin: 0 0 4px; }
#lcx-fallback .refusal { border: 1px solid #6B7A99; padding: 9px 11px; margin: 0 0 12px; color: #E9F0FF; }
#lcx-fallback table { border-collapse: collapse; width: 100%; }
#lcx-fallback th, #lcx-fallback td { text-align: left; padding: 4px 10px 4px 0; border-bottom: 1px solid #26355A; white-space: nowrap; }
#lcx-fallback th { color: #8FB7FF; font-weight: 600; }
#lcx-fallback td.n, #lcx-fallback th.n { text-align: right; }
#lcx-fallback .surface { max-width: 760px; }
#lcx-fallback .absent { color: #6B7A99; font-style: italic; }
/* The table's name for anyone browsing it as a table. Clipped in every medium: the h2 above it already
   carries the same words to the eye. */
#lcx-fallback caption { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); text-align: left; }
/* No focus ring on the host. Note 4 above the literal \u2014 this is not a keyboard-reachable element. */
#lcx-fallback:focus, #lcx-fallback:focus-visible { outline: none; }
/* Taken off the screen once a frame exists \u2014 clipped, never removed. Note 1 above the literal. */
#lcx-fallback[data-rendered="1"] {
  position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%);
  white-space: nowrap; margin: 0; padding: 0; border: 0;
}
@media print {
  /* The JSON diagnostic block is for a machine and wastes pages. The canvas prints because the stage
     is created with preserveDrawingBuffer. */
  #log { display: none !important; }
  /* Every property of the screen clip, undone. Note 2 above the literal. */
  #lcx-fallback, #lcx-fallback[data-rendered="1"] {
    display: block !important; position: static !important; width: auto !important; height: auto !important;
    overflow: visible !important; clip-path: none !important; margin: 18px 0 0 !important; color: #000;
  }
  #lcx-fallback h2, #lcx-fallback th { color: #000; }
  #lcx-fallback .reads, #lcx-fallback .absent { color: #444; }
  #lcx-fallback th, #lcx-fallback td { border-bottom: 1px solid #999; }
  #lcx-fallback .notice { color: #7a4f00; }
  /* The refusal notice was 1.14:1 on paper \u2014 invisible. Note 3 above the literal. */
  #lcx-fallback .refusal { color: #7a0d1e !important; border-color: #7a0d1e !important; border-width: 2px !important; }
  body { background: #fff !important; }
}
`;function te(e){return String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function Ir(e){let r=document.createElement("style");r.textContent=Zn,document.head.appendChild(r);let n=document.createElement("section");n.id="lcx-fallback",n.setAttribute("aria-label",`${e.title} \u2014 flat view`),n.setAttribute("tabindex","-1"),document.getElementById("log")?.setAttribute("aria-hidden","true");let t=(a,i)=>a===null?`<td class="absent${i?" n":""}">absent</td>`:`<td class="${i?"n":""}">${te(a)}</td>`;n.innerHTML=`<h2>${te(e.title)} \u2014 flat view</h2><p class="reads">${te(e.readsAs)}</p>`+(e.notices??[]).map(a=>`<p class="notice">${te(a)}</p>`).join("")+'<div id="lcx-refusal" role="alert"></div>'+(e.html?`<div class="surface">${e.html}</div>`:`<table><caption>${te(e.title)} \u2014 flat view</caption><thead><tr>`+e.columns.map(a=>`<th scope="col" class="${a.numeric?"n":""}">${te(a.label)}</th>`).join("")+"</tr></thead><tbody>"+e.rows.map(a=>"<tr>"+e.columns.map(i=>t(a[i.key]??null,!!i.numeric)).join("")+"</tr>").join("")+"</tbody></table>"),document.body.appendChild(n);function o(a,i){let s=document.getElementById("lcx-refusal");s&&(s.innerHTML=`<p class="refusal"><strong>${te(a)}</strong> \u2014 ${te(i)} The measurements below are unaffected.</p>`),delete n.dataset.rendered;for(let l of Array.from(document.querySelectorAll("canvas")))l.style.display="none";n.focus({preventScroll:!0})}return document.addEventListener("webglcontextlost",a=>{a.preventDefault(),o("CONTEXT_LOST","The GPU dropped the WebGL context for this page mid-session.")},!0),{markRendered(){n.dataset.rendered="1"},showRefusal:o}}var Cr={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected.",FEEDBACK_LOOP:"A layer of this view was asked to read the surface it draws into, which every driver refuses, so the layer is not being drawn. This is a defect in the renderer, not in the data."};function w(e,r){return r===void 0?{kind:"refused",code:e,reason:Cr[e]}:{kind:"refused",code:e,reason:Cr[e],detail:r}}function Rt(e){return e.kind==="stage"}function At(e,r={}){let n=e.getContext("webgl2",{antialias:r.antialias??!1,alpha:r.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!n)return w("NO_WEBGL2");let t=n.getExtension("EXT_color_buffer_float"),o=e.width,a=e.height,i=t?n.RGBA16F:n.RGBA8,s=t?n.HALF_FLOAT:n.UNSIGNED_BYTE,l=(p,x)=>{let R=n.createTexture();n.bindTexture(n.TEXTURE_2D,R),n.texImage2D(n.TEXTURE_2D,0,i,p,x,0,n.RGBA,s,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE);let T=n.createFramebuffer();n.bindFramebuffer(n.FRAMEBUFFER,T),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,R,0);let A=n.checkFramebufferStatus(n.FRAMEBUFFER);return A!==n.FRAMEBUFFER_COMPLETE?w("FRAMEBUFFER_INCOMPLETE",`status 0x${A.toString(16)} at ${p}\xD7${x}`):{texture:R,framebuffer:T,width:p,height:x}},u=r.bloomShift??2,m={w:o,h:a},d=l(o,a);if("kind"in d)return d;let c=l(Math.max(1,o>>u),Math.max(1,a>>u));if("kind"in c)return c;let h=l(Math.max(1,o>>u),Math.max(1,a>>u));if("kind"in h)return h;let y=n.createVertexArray();n.bindVertexArray(y);let f=n.createBuffer();n.bindBuffer(n.ARRAY_BUFFER,f),n.bufferData(n.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),n.STATIC_DRAW),n.enableVertexAttribArray(0),n.vertexAttribPointer(0,2,n.FLOAT,!1,0,0),n.bindVertexArray(null);let E=[];return{kind:"stage",gl:n,cssWidth:e.clientWidth||o,cssHeight:e.clientHeight||a,hdr:!!t,get width(){return m.w},get height(){return m.h},get scene(){return d},get bloomA(){return c},get bloomB(){return h},setRegion(p,x){let R=Math.max(1,Math.round(p)),T=Math.max(1,Math.round(x));if(!(R===m.w&&T===m.h)){m={w:R,h:T};for(let A of[d,c,h])"kind"in A||(n.deleteFramebuffer(A.framebuffer),n.deleteTexture(A.texture));d=l(R,T),c=l(Math.max(1,R>>u),Math.max(1,T>>u)),h=l(Math.max(1,R>>u),Math.max(1,T>>u))}},compile(p,x){let R=(de,ee)=>{let X=n.createShader(de);if(n.shaderSource(X,ee),n.compileShader(X),!n.getShaderParameter(X,n.COMPILE_STATUS)){let G=n.getShaderInfoLog(X)??"(no log)";return n.deleteShader(X),w("SHADER_COMPILE_FAILED",G)}return X},T=R(n.VERTEX_SHADER,p);if(typeof T=="object"&&"kind"in T)return T;let A=R(n.FRAGMENT_SHADER,x);if(typeof A=="object"&&"kind"in A)return n.deleteShader(T),A;let v=n.createProgram();if(n.attachShader(v,T),n.attachShader(v,A),n.linkProgram(v),!n.getProgramParameter(v,n.LINK_STATUS)){let de=n.getProgramInfoLog(v)??"(no log)";return n.deleteShader(T),n.deleteShader(A),n.deleteProgram(v),w("PROGRAM_LINK_FAILED",de)}return n.detachShader(v,T),n.detachShader(v,A),n.deleteShader(T),n.deleteShader(A),E.push(v),v},bindTarget(p){n.bindFramebuffer(n.FRAMEBUFFER,p?p.framebuffer:null),n.viewport(0,0,p?p.width:m.w,p?p.height:m.h)},blit(p,x){n.useProgram(p),n.bindVertexArray(y),x?.(p),n.drawArrays(n.TRIANGLES,0,3),n.bindVertexArray(null)},dispose(){for(let p of E)n.deleteProgram(p);for(let p of[d,c,h])"kind"in p||(n.deleteFramebuffer(p.framebuffer),n.deleteTexture(p.texture));n.deleteBuffer(f),n.deleteVertexArray(y)}}}var tt=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function rt(e,r){let n=new Float32Array(16);for(let t=0;t<4;t++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=e[i*4+o]*r[t*4+i];n[t*4+o]=a}return n}var me=(e,r)=>[e[0]-r[0],e[1]-r[1],e[2]-r[2]],et=(e,r)=>e[0]*r[0]+e[1]*r[1]+e[2]*r[2],Re=(e,r)=>[e[1]*r[2]-e[2]*r[1],e[2]*r[0]-e[0]*r[2],e[0]*r[1]-e[1]*r[0]];function V(e){let r=Math.hypot(e[0],e[1],e[2]);return r===0?e:[e[0]/r,e[1]/r,e[2]/r]}function Ft(e,r,n,t){let o=1/Math.tan(e/2);return new Float32Array([o/r,0,0,0,0,o,0,0,0,0,(t+n)/(n-t),-1,0,0,2*t*n/(n-t),0])}function St(e,r,n,t,o,a){let i=r-e,s=t-n,l=a-o;return new Float32Array([2/i,0,0,0,0,2/s,0,0,0,0,-2/l,0,-(r+e)/i,-(t+n)/s,-(a+o)/l,1])}function nt(e,r,n){let t=V(me(e,r)),o=Re(n,t);if(Math.hypot(o[0],o[1],o[2])<1e-8)return tt();let a=V(o),i=Re(t,a);return new Float32Array([a[0],i[0],t[0],0,a[1],i[1],t[1],0,a[2],i[2],t[2],0,-et(a,e),-et(i,e),-et(t,e),1])}function kr(e,r){let n=[0,1,2,3].map(o=>e[0+o]*r[0]+e[4+o]*r[1]+e[8+o]*r[2]+e[12+o]),t=n[3];return{x:n[0]/t,y:n[1]/t,z:n[2]/t,w:t}}function Ae(e,r,n,t){let o=kr(e,r);return{sx:(o.x*.5+.5)*n,sy:(1-(o.y*.5+.5))*t,behind:o.w<=0}}function Gr(e){return e<=.04045?e/12.92:Math.pow((e+.055)/1.055,2.4)}function vt(e){return e<=.0031308?e*12.92:1.055*Math.pow(e,1/2.4)-.055}var Jn=/^#?([0-9a-fA-F]{6})$/;function I(e){let r=Jn.exec(e.trim());if(!r)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(e)}`);let n=r[1];return[0,2,4].map(t=>Gr(parseInt(n.slice(t,t+2),16)/255))}function Mt(e){return`#${e.map(n=>{let t=vt(Math.min(1,Math.max(0,n)));return Math.round(t*255).toString(16).padStart(2,"0")}).join("")}`}var Fe={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},wt=Object.freeze(Object.fromEntries(Object.keys(Fe).map(e=>[e,I(Fe[e])])));var Hr=.4;var _t=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${Hr.toFixed(2)}); }`,Dt=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function Lt(){let e=[];for(let r of Object.keys(Fe)){let n=Fe[r].toLowerCase(),t=Mt(wt[r]).toLowerCase();t!==n&&e.push({key:r,expected:n,actual:t})}return e}function eo(e){let r=[1/0,1/0,1/0],n=[-1/0,-1/0,-1/0];for(let t=0;t<e.length;t+=3)for(let o=0;o<3;o++){let a=e[t+o];a<r[o]&&(r[o]=a),a>n[o]&&(n[o]=a)}return e.length===0?{min:[0,0,0],max:[0,0,0]}:{min:r,max:n}}function Vr(e,r,n,t){let o=new Float32Array(e.length);for(let i=0;i<t.length;i+=3){let s=t[i],l=t[i+1],u=t[i+2],m=s*3,d=l*3,c=u*3,h=s*2,y=l*2,f=u*2,E=e[d]-e[m],g=e[d+1]-e[m+1],p=e[d+2]-e[m+2],x=e[c]-e[m],R=e[c+1]-e[m+1],T=e[c+2]-e[m+2],A=n[y]-n[h],v=n[y+1]-n[h+1],de=n[f]-n[h],ee=n[f+1]-n[h+1],X=A*ee-de*v;if(Math.abs(X)<1e-12)continue;let G=1/X,Qn=(E*ee-x*v)*G,Kn=(g*ee-R*v)*G,qn=(p*ee-T*v)*G;for(let ge of[m,d,c])o[ge]=o[ge]+Qn,o[ge+1]=o[ge+1]+Kn,o[ge+2]=o[ge+2]+qn}let a=new Float32Array(e.length);for(let i=0;i<a.length;i+=3){let s=r[i],l=r[i+1],u=r[i+2],m=o[i],d=o[i+1],c=o[i+2],h=m*s+d*l+c*u;m-=s*h,d-=l*h,c-=u*h;let y=Math.hypot(m,d,c);y<1e-8&&(Math.abs(s)<.9?(m=0,d=-u,c=l):(m=-u,d=0,c=s),y=Math.hypot(m,d,c)||1),a[i]=m/y,a[i+1]=d/y,a[i+2]=c/y}return a}function Wr(e,r){let n=new Float32Array(e.length);for(let t=0;t<r.length;t+=3){let o=r[t]*3,a=r[t+1]*3,i=r[t+2]*3,s=e[a]-e[o],l=e[a+1]-e[o+1],u=e[a+2]-e[o+2],m=e[i]-e[o],d=e[i+1]-e[o+1],c=e[i+2]-e[o+2],h=l*c-u*d,y=u*m-s*c,f=s*d-l*m;for(let E of[o,a,i])n[E]=n[E]+h,n[E+1]=n[E+1]+y,n[E+2]=n[E+2]+f}for(let t=0;t<n.length;t+=3){let o=Math.hypot(n[t],n[t+1],n[t+2]);o>0&&(n[t]=n[t]/o,n[t+1]=n[t+1]/o,n[t+2]=n[t+2]/o)}return n}function to(e,r,n,t,o){let{min:a,max:i}=eo(e),s=t??Wr(e,n);return{positions:e,normals:s,uvs:r,indices:n,min:a,max:i,tangents:o??Vr(e,s,r,n)}}function j(e=1,r=1,n=1){let t=e/2,o=r/2,a=n/2,i=[[[-t,-o,a],[t,-o,a],[t,o,a],[-t,o,a]],[[t,-o,-a],[-t,-o,-a],[-t,o,-a],[t,o,-a]],[[t,-o,a],[t,-o,-a],[t,o,-a],[t,o,a]],[[-t,-o,-a],[-t,-o,a],[-t,o,a],[-t,o,-a]],[[-t,o,a],[t,o,a],[t,o,-a],[-t,o,-a]],[[-t,-o,-a],[t,-o,-a],[t,-o,a],[-t,-o,a]]],s=new Float32Array(72),l=new Float32Array(48),u=new Uint16Array(36),m=0,d=0,c=0,h=0;for(let y of i){for(let[f,E,g]of y)s[m++]=f,s[m++]=E,s[m++]=g;l[d++]=0,l[d++]=0,l[d++]=1,l[d++]=0,l[d++]=1,l[d++]=1,l[d++]=0,l[d++]=1,u[c++]=h,u[c++]=h+1,u[c++]=h+2,u[c++]=h,u[c++]=h+2,u[c++]=h+3,h+=4}return to(s,l,u)}function Y(e){return e.indices.length/3}function ro(e){if(!Number.isFinite(e)||e===0)return"0";let r=e.toFixed(12).replace(/0+$/,"").replace(/\.$/,"");return r==="-0"?"0":r}function Xr(e,r,n,t){let[o,a]=e,[i,s]=r,[l,u]=n,[m,d]=t,c=o-i+l-m,h=a-s+u-d;if(Math.abs(c)<1e-9&&Math.abs(h)<1e-9){let T=[i-o,m-o,o,s-a,d-a,a,0,0,1],A=T[0]*T[4]-T[1]*T[3];return Math.abs(A)<1e-9?null:T}let y=i-l,f=m-l,E=s-u,g=d-u,p=y*g-f*E;if(Math.abs(p)<1e-9)return null;let x=(c*g-f*h)/p,R=(y*h-c*E)/p;return[i-o+x*i,m-o+R*m,o,s-a+x*s,d-a+R*d,a,x,R,1]}function ot(e,r,n,t,o,a){if(!(o>0)||!(a>0))return{refusal:"EMPTY_ELEMENT_BOX"};let s=[r.topLeft,r.topRight,r.bottomRight,r.bottomLeft].map(G=>Ae(e,G,n,t));if(s.some(G=>G.behind))return{refusal:"CORNER_BEHIND_CAMERA"};let l=s.map(G=>({x:G.sx,y:G.sy})),[u,m,d,c]=l,h=Xr([u.x,u.y],[m.x,m.y],[d.x,d.y],[c.x,c.y]);if(!h)return{refusal:"DEGENERATE_ON_SCREEN"};let y=.5*(u.x*m.y-m.x*u.y+(m.x*d.y-d.x*m.y)+(d.x*c.y-c.x*d.y)+(c.x*u.y-u.x*c.y)),f=1/o,E=1/a,[g,p,x,R,T,A,v,de,ee]=h;return{transform:`matrix3d(${[g*f,R*f,0,v*f,p*E,T*E,0,de*E,0,0,1,0,x,A,0,ee].map(ro).join(", ")})`,matrix:h,screen:l,signedArea:y}}function Se(e){return"refusal"in e}function Nt(e,r,n,t,o,a,i=0){let s=Math.cos(a),l=Math.sin(a),u=(d,c)=>[e+s*d+l*i,n+c,r-l*d+s*i],m=t/2;return{topLeft:u(-m,o),topRight:u(m,o),bottomRight:u(m,0),bottomLeft:u(-m,0)}}var zr=e=>[e.DEPTH_TEST,e.CULL_FACE,e.BLEND];function re(e){return[e.getParameter(e.FRAMEBUFFER_BINDING),e.getParameter(e.VIEWPORT),e.getParameter(e.DEPTH_WRITEMASK),zr(e).map(r=>e.getParameter(r))]}function ne(e,r){e.bindFramebuffer(e.FRAMEBUFFER,r[0]);let n=r[1];e.viewport(n[0]??0,n[1]??0,n[2]??0,n[3]??0),e.depthMask(r[2]),zr(e).forEach((t,o)=>{r[3][o]?e.enable(t):e.disable(t)})}function ve(e,r){for(let n=r-1;n>=0;n--)e.activeTexture(e.TEXTURE0+n),e.bindTexture(e.TEXTURE_2D,null),e.bindTexture(e.TEXTURE_3D,null);e.activeTexture(e.TEXTURE0)}function $r(e,r){return!e.getParameter(e.FRAMEBUFFER_BINDING)||e.getFramebufferAttachmentParameter(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE)!==e.TEXTURE?!1:e.getFramebufferAttachmentParameter(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME)===r}function at(e,r,n,t){let o=-1/0,a=1/0;for(let i=0;i<3;i++){let s=r[i],l=e[i],u=n[i],m=t[i];if(Math.abs(s)<1e-12){if(l<u||l>m)return null;continue}let d=1/s,c=(u-l)*d,h=(m-l)*d;if(c>h){let y=c;c=h,h=y}if(c>o&&(o=c),h<a&&(a=h),o>a)return null}return a<0?null:{tNear:Math.max(0,o),tFar:a}}function it(e,r,n){if(!(e>0)||!(r>0))return{steps:0,step:0,truncated:!1};let t=Math.ceil(e/r),o=Math.min(Math.max(1,t),Math.max(1,Math.floor(n)));return{steps:o,step:r,truncated:t>o}}var jr=`
/* Mirrors rayBoxSlab() in volume.ts line for line. If one changes, change both. */
bool lcxRayBox(vec3 o, vec3 d, vec3 bmin, vec3 bmax, out float tNear, out float tFar){
  tNear = -1e30; tFar = 1e30;
  for (int a = 0; a < 3; a++) {
    float dd = d[a], oo = o[a], lo = bmin[a], hi = bmax[a];
    if (abs(dd) < 1e-12) {
      if (oo < lo || oo > hi) return false;
      continue;
    }
    float inv = 1.0 / dd;
    float t0 = (lo - oo) * inv;
    float t1 = (hi - oo) * inv;
    if (t0 > t1) { float t = t0; t0 = t1; t1 = t; }
    tNear = max(tNear, t0);
    tFar = min(tFar, t1);
    if (tNear > tFar) return false;
  }
  if (tFar < 0.0) return false;
  tNear = max(0.0, tNear);
  return true;
}
`,no=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,oo=`#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 vUv;

uniform sampler3D uDensity;
uniform sampler2D uSceneDepth;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform vec3 uEye;
uniform vec3 uForward;
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uTanHalfFov;
uniform float uAspect;
uniform float uNear;
uniform float uFar;
uniform float uWorldStep;
uniform int uMaxSteps;
uniform float uDensityScale;
uniform vec3 uColourLow;
uniform vec3 uColourHigh;
uniform vec3 uLightDir;
uniform float uLightSteps;
uniform float uEmission;

out vec4 frag;
${jr}

float sampleDensity(vec3 p){
  vec3 uvw = (p - uBoxMin) / (uBoxMax - uBoxMin);
  if (any(lessThan(uvw, vec3(0.0))) || any(greaterThan(uvw, vec3(1.0)))) return 0.0;
  return texture(uDensity, uvw).r * uDensityScale;
}

float lightTransmittance(vec3 p){
  if (uLightSteps < 1.0) return 1.0;
  vec3 toLight = -normalize(uLightDir);
  float tN, tF;
  if (!lcxRayBox(p, toLight, uBoxMin, uBoxMax, tN, tF)) return 1.0;
  float len = tF - tN;
  int n = int(uLightSteps);
  float dl = len / float(n);
  float tau = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= n) break;
    tau += sampleDensity(p + toLight * (float(i) + 0.5) * dl) * dl;
  }
  return exp(-tau);
}

void main(){

  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 dir = normalize(uForward + uRight * (ndc.x * uTanHalfFov * uAspect) + uUp * (ndc.y * uTanHalfFov));

  float tN, tF;
  if (!lcxRayBox(uEye, dir, uBoxMin, uBoxMax, tN, tF)) { frag = vec4(0.0); return; }

  float dz = texture(uSceneDepth, vUv).r * 2.0 - 1.0;
  float viewZ = (2.0 * uNear * uFar) / (uFar + uNear - dz * (uFar - uNear));
  float cosA = max(1e-4, dot(dir, normalize(uForward)));
  float tGeom = viewZ / cosA;
  tF = min(tF, tGeom);
  if (tF <= tN) { frag = vec4(0.0); return; }

  float len = tF - tN;
  int steps = int(min(float(uMaxSteps), max(1.0, ceil(len / uWorldStep))));
  float dt = uWorldStep;

  vec3 acc = vec3(0.0);
  float alpha = 0.0;
  for (int i = 0; i < 256; i++) {
    if (i >= steps) break;
    float t = tN + (float(i) + 0.5) * dt;
    if (t > tF) break;
    float d = sampleDensity(uEye + dir * t);
    if (d <= 0.0005) continue;

    vec3 col = mix(uColourLow, uColourHigh, clamp(d, 0.0, 1.0));
    float tr = lightTransmittance(uEye + dir * t);

    vec3 lit = col * (uEmission + (1.0 - uEmission) * tr);

    float a = 1.0 - exp(-d * dt);
    acc += lit * a * (1.0 - alpha);
    alpha += a * (1.0 - alpha);

    if (alpha > 0.995) break;
  }

  frag = vec4(acc, alpha);
}`;function Pt(e,r,n,t){let o=e.gl,a=Math.max(2,Math.floor(r)),i=Math.max(2,Math.floor(n)),s=Math.max(2,Math.floor(t));if(!o.getExtension("OES_texture_float_linear"))return w("MISSING_EXTENSION","the volume needs OES_texture_float_linear for trilinear sampling of the density grid \u2014 without it a float sampler3D silently falls back to NEAREST and the field renders as voxel blocks");let l=e.compile(no,oo);if("kind"in l)return l;let u=o.createTexture();o.bindTexture(o.TEXTURE_3D,u),o.texStorage3D(o.TEXTURE_3D,1,o.R32F,a,i,s),o.texParameteri(o.TEXTURE_3D,o.TEXTURE_MIN_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_3D,o.TEXTURE_MAG_FILTER,o.LINEAR);for(let c of[o.TEXTURE_WRAP_S,o.TEXTURE_WRAP_T,o.TEXTURE_WRAP_R])o.texParameteri(o.TEXTURE_3D,c,o.CLAMP_TO_EDGE);o.bindTexture(o.TEXTURE_3D,null);let m=o.createVertexArray(),d=c=>o.getUniformLocation(l,c);return{size:[a,i,s],upload(c){let h=a*i*s,y=c.length===h?c:(()=>{let f=new Float32Array(h);return f.set(c.subarray(0,Math.min(h,c.length))),f})();o.bindTexture(o.TEXTURE_3D,u),o.texSubImage3D(o.TEXTURE_3D,0,0,0,0,a,i,s,o.RED,o.FLOAT,y),o.bindTexture(o.TEXTURE_3D,null)},draw(c){if($r(o,c.sceneDepth))return w("FEEDBACK_LOOP","the volumetric field was asked to march against the depth attachment of the very framebuffer it is drawing into \u2014 draw it into a separate target and composite that, as E7 does");let h=re(o);o.useProgram(l),o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_3D,u),o.uniform1i(d("uDensity"),0),o.activeTexture(o.TEXTURE1),o.bindTexture(o.TEXTURE_2D,c.sceneDepth),o.uniform1i(d("uSceneDepth"),1),o.uniform3fv(d("uBoxMin"),c.boxMin),o.uniform3fv(d("uBoxMax"),c.boxMax),o.uniform3fv(d("uEye"),c.eye),o.uniform3fv(d("uForward"),c.forward),o.uniform3fv(d("uRight"),c.right),o.uniform3fv(d("uUp"),c.up),o.uniform1f(d("uTanHalfFov"),Math.tan(c.fovDeg*Math.PI/360)),o.uniform1f(d("uAspect"),c.aspect),o.uniform1f(d("uNear"),c.near),o.uniform1f(d("uFar"),c.far),o.uniform1f(d("uWorldStep"),c.worldStep??.06),o.uniform1i(d("uMaxSteps"),Math.min(256,c.maxSteps??128)),o.uniform1f(d("uDensityScale"),c.densityScale??1),o.uniform3fv(d("uColourLow"),c.colourLow),o.uniform3fv(d("uColourHigh"),c.colourHigh),o.uniform3fv(d("uLightDir"),c.lightDir),o.uniform1f(d("uLightSteps"),Math.min(16,Math.max(0,c.lightSteps??6))),o.uniform1f(d("uEmission"),Math.min(1,Math.max(0,c.emission??.25))),o.enable(o.BLEND),o.blendFunc(o.ONE,o.ONE_MINUS_SRC_ALPHA),o.disable(o.DEPTH_TEST),o.depthMask(!1),o.bindVertexArray(m),o.drawArrays(o.TRIANGLES,0,3),o.bindVertexArray(null),ve(o,2),ne(o,h)},dispose(){o.deleteTexture(u),o.deleteVertexArray(m),o.deleteProgram(l)}}}var Ut=["minimum","reduced","full"],ao={full:{dprScale:2,ao:!0,aoScale:.5,dof:!0,shadowMapSize:1536,shadowTaps:9,particleCapacity:4096,volumeMaxSteps:128,volumeLightSteps:6},reduced:{dprScale:2,ao:!0,aoScale:.5,dof:!1,shadowMapSize:1024,shadowTaps:9,particleCapacity:2048,volumeMaxSteps:96,volumeLightSteps:4},minimum:{dprScale:1,ao:!1,aoScale:.5,dof:!1,shadowMapSize:512,shadowTaps:1,particleCapacity:512,volumeMaxSteps:48,volumeLightSteps:0}};function st(e,r){let n=Number.isFinite(r)&&r>0?r:1024,o=n*(e==="full"?1:e==="reduced"?.5:.25),a=2**Math.round(Math.log2(o));return Math.max(256,Math.min(n,a))}function Ot(e){return{tier:e,...ao[e]}}var Bt=89,It=Math.PI/180;function ut(e){let r=Math.max(-Bt,Math.min(Bt,e.elevationDeg))*It,n=e.azimuthDeg*It,t=Math.max(1e-4,e.distance),o=Math.sin(r)*t,a=Math.cos(r)*t;return[e.target[0]+Math.sin(n)*a,e.target[1]+o,e.target[2]+Math.cos(n)*a]}function lt(e,r){let n=ut(e),t=e.near??Math.max(.01,e.distance/100),o=e.far??Math.max(t+1,e.distance*8),a=Ft((e.fovDeg??38)*It,Math.max(.001,r),t,o),i=nt(n,e.target,[0,1,0]);return rt(a,i)}function Ct(e,r,n){let t=V(e.direction),o=e.extent??Math.max(.1,n*1.35),a=Math.max(1,n*2),i=[r[0]-t[0]*a,r[1]-t[1]*a,r[2]-t[2]*a],s=Math.abs(t[1])>.99?[0,0,1]:[0,1,0],l=nt(i,r,s),u=St(-o,o,-o,o,.01,a+n*2+o);return rt(u,l)}function kt(e,r){let n=me([r[0],r[1],r[2]],[e[0],e[1],e[2]]);return Math.hypot(n[0],n[1],n[2])/2}function Gt(e,r){return[(e[0]+r[0])/2,(e[1]+r[1])/2,(e[2]+r[2])/2]}function Ue(e,r,n){let{gl:t}=e,o=Math.max(1,Math.floor(r)),a=Math.max(1,Math.floor(n)),i=t.createFramebuffer(),s=t.createTexture(),l=t.createTexture();if(!i||!s||!l)return w("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let u=e.hdr?t.RGBA16F:t.RGBA8,m=e.hdr?t.HALF_FLOAT:t.UNSIGNED_BYTE,d=()=>{t.bindTexture(t.TEXTURE_2D,s),t.texImage2D(t.TEXTURE_2D,0,u,o,a,0,t.RGBA,m,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindTexture(t.TEXTURE_2D,l),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,o,a,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,i),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,s,0),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,l,0),t.bindFramebuffer(t.FRAMEBUFFER,null)};d(),t.bindFramebuffer(t.FRAMEBUFFER,i);let c=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),c!==t.FRAMEBUFFER_COMPLETE?w("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${c.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:s,depthTexture:l,get width(){return o},get height(){return a},bind(){t.bindFramebuffer(t.FRAMEBUFFER,i),t.viewport(0,0,o,a)},resize(h,y){let f=Math.max(1,Math.floor(h)),E=Math.max(1,Math.floor(y));f===o&&E===a||(o=f,a=E,d())},dispose(){t.deleteFramebuffer(i),t.deleteTexture(s),t.deleteTexture(l)}}}function Ht(e,r=1024){let{gl:n}=e,t=Math.max(256,Math.min(2048,Math.floor(r))),o=n.createFramebuffer(),a=n.createTexture();if(!o||!a)return w("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");n.bindTexture(n.TEXTURE_2D,a),n.texImage2D(n.TEXTURE_2D,0,n.DEPTH_COMPONENT24,t,t,0,n.DEPTH_COMPONENT,n.UNSIGNED_INT,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.bindFramebuffer(n.FRAMEBUFFER,o),n.framebufferTexture2D(n.FRAMEBUFFER,n.DEPTH_ATTACHMENT,n.TEXTURE_2D,a,0);let i=n.checkFramebufferStatus(n.FRAMEBUFFER);return n.bindFramebuffer(n.FRAMEBUFFER,null),i!==n.FRAMEBUFFER_COMPLETE?w("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:t,bind(){n.bindFramebuffer(n.FRAMEBUFFER,o),n.viewport(0,0,t,t)},dispose(){n.deleteFramebuffer(o),n.deleteTexture(a)}}}var Wt=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,Vt={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function Yr(e,r,n={}){let t=n.zenith??Vt.zenith,o=n.horizon??Vt.horizon,a=n.ground??Vt.ground;e.uniform3f(e.getUniformLocation(r,"uSkyZenith"),t[0],t[1],t[2]),e.uniform3f(e.getUniformLocation(r,"uSkyHorizon"),o[0],o[1],o[2]),e.uniform3f(e.getUniformLocation(r,"uSkyGround"),a[0],a[1],a[2])}var sa=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${Wt}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;var Qr=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,Xt=`#version 300 es
precision highp float;
void main(){}`,io=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,Kr=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aTangent;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform mat3 uNormalMat;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vTangent;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(uNormalMat * aNormal);
  vTangent = normalize(mat3(uModel) * aTangent);
  gl_Position = uViewProj * world;
}`,qr=`#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
in vec3 vTangent;

uniform vec3 uEye;
uniform vec3 uLightDir;
uniform vec3 uLightColour;
uniform float uAmbientGain;
uniform vec3 uBaseColour;
uniform float uRoughness;
uniform float uMetalness;
uniform float uAnisotropy;

uniform mat4 uLightVP;
uniform sampler2D uShadowMap;
uniform float uShadowTexel;
uniform float uShadowStrength;

uniform sampler2D uAO;
uniform vec2 uScreenSize;
uniform float uAOEnabled;
uniform float uFogDensity;
uniform float uFogHeight;
uniform vec3 uFogColour;
uniform float uFogFloor;

out vec4 frag;
${Wt}

const float PI = 3.14159265359;

float distributionGGX(float NdotH, float rough) {
  float a = rough * rough;
  float a2 = a * a;
  float d = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / max(1e-6, PI * d * d);
}

float distributionGGXAniso(float NdotH, float TdotH, float BdotH, float at, float ab) {
  float a2 = at * ab;
  vec3 v = vec3(ab * TdotH, at * BdotH, a2 * NdotH);
  float v2 = dot(v, v);
  float w2 = a2 / max(1e-8, v2);
  return a2 * w2 * w2 / PI;
}

float geometrySmith(float NdotV, float NdotL, float rough) {

  float k = (rough + 1.0) * (rough + 1.0) / 8.0;
  float gv = NdotV / (NdotV * (1.0 - k) + k);
  float gl = NdotL / (NdotL * (1.0 - k) + k);
  return gv * gl;
}

vec3 fresnelSchlick(float cosTheta, vec3 f0) {
  return f0 + (1.0 - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

float shadowFactor(vec3 world, float NdotL) {
  vec4 lc = uLightVP * vec4(world, 1.0);
  vec3 p = lc.xyz / lc.w;
  p = p * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;

  float bias = max(0.0009, 0.0045 * (1.0 - NdotL));

  float lit = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 off = vec2(float(x), float(y)) * uShadowTexel;
      float d = texture(uShadowMap, p.xy + off).r;
      lit += (p.z - bias) <= d ? 1.0 : 0.0;
    }
  }
  lit /= 9.0;
  return mix(1.0, lit, uShadowStrength);
}

void main(){
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uEye - vWorld);
  vec3 L = normalize(-uLightDir);
  vec3 H = normalize(V + L);

  float NdotL = max(dot(N, L), 0.0);
  float NdotV = max(dot(N, V), 1e-4);
  float NdotH = max(dot(N, H), 0.0);
  float VdotH = max(dot(V, H), 0.0);

  vec3 f0 = mix(vec3(0.04), uBaseColour, uMetalness);
  float rough = clamp(uRoughness, 0.045, 1.0);

  vec3 T = normalize(vTangent - N * dot(N, vTangent));
  vec3 B = cross(N, T);
  float aniso = clamp(uAnisotropy, 0.0, 0.95);

  float at = max(0.002, rough * (1.0 + aniso));
  float ab = max(0.002, rough * (1.0 - aniso));

  float D = aniso > 0.001
    ? distributionGGXAniso(NdotH, dot(T, H), dot(B, H), at, ab)
    : distributionGGX(NdotH, rough);
  float G = geometrySmith(NdotV, NdotL, rough);
  vec3  F = fresnelSchlick(VdotH, f0);

  vec3 spec = (D * G * F) / max(1e-6, 4.0 * NdotV * NdotL + 1e-4);

  vec3 kd = (1.0 - F) * (1.0 - uMetalness);
  vec3 diffuse = kd * uBaseColour / PI;

  float shadow = shadowFactor(vWorld, NdotL);
  vec3 direct = (diffuse + spec) * uLightColour * NdotL * shadow;

  vec3 R = reflect(-V, N);
  vec3 envDiffuse = skyColour(N) * uBaseColour * (1.0 - uMetalness);
  vec3 envSpecular = skyColour(normalize(mix(R, N, rough * rough))) * fresnelSchlick(NdotV, f0);
  float ao = uAOEnabled > 0.5 ? texture(uAO, gl_FragCoord.xy / uScreenSize).r : 1.0;
  vec3 ambient = (envDiffuse + envSpecular) * uAmbientGain * ao;

  vec3 lit = direct + ambient;

  if (uFogDensity > 0.0) {
    vec3 toEye = uEye - vWorld;
    float dist = length(toEye);
    float dyRaw = uEye.y - vWorld.y;
    float hEye = max(0.0, uEye.y - uFogFloor);
    float hFrag = max(0.0, vWorld.y - uFogFloor);
    float k = max(1e-4, uFogHeight);
    float depth;
    if (abs(dyRaw) < 1e-4) {

      depth = uFogDensity * dist * exp(-hFrag / k);
    } else {
      depth = uFogDensity * k * (dist / abs(dyRaw)) * abs(exp(-hFrag / k) - exp(-hEye / k));
    }
    vec3 fogCol = uFogColour.r < 0.0 ? skyColour(normalize(-toEye)) : uFogColour;
    lit = mix(lit, fogCol, 1.0 - exp(-depth));
  }

  frag = vec4(lit, 1.0);
}`;function Q(e,r){let{gl:n}=e,t=n.createVertexArray(),o=n.createBuffer(),a=n.createBuffer(),i=n.createBuffer(),s=n.createBuffer();return!t||!o||!a||!i||!s?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(n.bindVertexArray(t),n.bindBuffer(n.ARRAY_BUFFER,o),n.bufferData(n.ARRAY_BUFFER,r.positions,n.STATIC_DRAW),n.enableVertexAttribArray(0),n.vertexAttribPointer(0,3,n.FLOAT,!1,0,0),n.bindBuffer(n.ARRAY_BUFFER,a),n.bufferData(n.ARRAY_BUFFER,r.normals,n.STATIC_DRAW),n.enableVertexAttribArray(1),n.vertexAttribPointer(1,3,n.FLOAT,!1,0,0),n.bindBuffer(n.ARRAY_BUFFER,i),n.bufferData(n.ARRAY_BUFFER,r.tangents,n.STATIC_DRAW),n.enableVertexAttribArray(2),n.vertexAttribPointer(2,3,n.FLOAT,!1,0,0),n.bindBuffer(n.ELEMENT_ARRAY_BUFFER,s),n.bufferData(n.ELEMENT_ARRAY_BUFFER,r.indices,n.STATIC_DRAW),n.bindVertexArray(null),{vao:t,indexCount:r.indices.length,indexType:r.indices instanceof Uint32Array?n.UNSIGNED_INT:n.UNSIGNED_SHORT,dispose(){n.deleteVertexArray(t),n.deleteBuffer(o),n.deleteBuffer(a),n.deleteBuffer(i),n.deleteBuffer(s)}})}function zt(e){let{gl:r}=e,n=e.compile(Qr,Xt);if("kind"in n)return n;let t=e.compile(Kr,qr);if("kind"in t)return t;let o=e.compile(io,Xt);if("kind"in o)return o;let a=(i,s)=>r.getUniformLocation(i,s);return{shadowPass(i,s,l,u){let m=re(r),d=u??(()=>{});l.bind(),d("shadow.bind"),r.clear(r.DEPTH_BUFFER_BIT),r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.FRONT),r.useProgram(n),d("useProgram(shadow)"),r.uniformMatrix4fv(a(n,"uLightVP"),!1,i),d("uLightVP");for(let c of s)r.uniformMatrix4fv(a(n,"uModel"),!1,c.model),d("shadow uModel"),r.bindVertexArray(c.mesh.vao),d("shadow bindVAO"),r.drawElements(r.TRIANGLES,c.mesh.indexCount,c.mesh.indexType,0),d("shadow drawElements");r.bindVertexArray(null),r.cullFace(r.BACK),ne(r,m)},depthPrepass(i,s){let l=re(r);r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.colorMask(!1,!1,!1,!1),r.useProgram(o),r.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let u of s)r.uniformMatrix4fv(a(o,"uModel"),!1,u.model),r.bindVertexArray(u.mesh.vao),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0);r.bindVertexArray(null),r.colorMask(!0,!0,!0,!0),ne(r,l)},draw(i){let s=re(r),l=i.onStep??(()=>{});if(r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.useProgram(t),r.uniformMatrix4fv(a(t,"uViewProj"),!1,i.viewProj),l("uViewProj"),r.uniform3fv(a(t,"uEye"),i.eye),l("uEye"),r.uniform3fv(a(t,"uLightDir"),i.lightDir),l("uLightDir"),r.uniform3fv(a(t,"uLightColour"),i.lightColour),l("uLightColour"),r.uniform1f(a(t,"uAmbientGain"),i.ambientGain??1),l("uAmbientGain"),i.fog&&i.fog.density>0){r.uniform1f(a(t,"uFogDensity"),i.fog.density),r.uniform1f(a(t,"uFogHeight"),i.fog.height),r.uniform1f(a(t,"uFogFloor"),i.fog.floor??0);let u=i.fog.colour;u==="sky"?r.uniform3f(a(t,"uFogColour"),-1,-1,-1):r.uniform3f(a(t,"uFogColour"),u[0],u[1],u[2]),l("fog")}else r.uniform1f(a(t,"uFogDensity"),0);Yr(r,t,i.sky),l("bindSky"),i.ao&&i.screenSize?(r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,i.ao),r.uniform1i(a(t,"uAO"),1),r.uniform2f(a(t,"uScreenSize"),i.screenSize[0],i.screenSize[1]),r.uniform1f(a(t,"uAOEnabled"),1)):r.uniform1f(a(t,"uAOEnabled"),0),l("bindAO"),r.uniformMatrix4fv(a(t,"uLightVP"),!1,i.lightVP),l("lit uLightVP"),i.shadow?(r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,i.shadow.depthTexture),r.uniform1i(a(t,"uShadowMap"),0),r.uniform1f(a(t,"uShadowTexel"),1/i.shadow.size),r.uniform1f(a(t,"uShadowStrength"),i.shadowStrength??1)):r.uniform1f(a(t,"uShadowStrength"),0);for(let u of i.draws)r.uniformMatrix4fv(a(t,"uModel"),!1,u.model),r.uniformMatrix3fv(a(t,"uNormalMat"),!1,u.normalMat),l("uNormalMat"),r.uniform3fv(a(t,"uBaseColour"),u.material.baseColour),l("uBaseColour"),r.uniform1f(a(t,"uRoughness"),u.material.roughness),r.uniform1f(a(t,"uMetalness"),u.material.metalness),r.uniform1f(a(t,"uAnisotropy"),u.material.anisotropy??0),r.bindVertexArray(u.mesh.vao),l("lit bindVAO"),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0),l("lit drawElements");r.bindVertexArray(null),ve(r,2),ne(r,s)},dispose(){r.deleteProgram(n),r.deleteProgram(t),r.deleteProgram(o)}}}var $t=`
uniform sampler2D uDepth;
uniform vec2 uNearFar;

float linearDepthAt(vec2 uv) {
  float d = texture(uDepth, uv).r * 2.0 - 1.0;
  float n = uNearFar.x, f = uNearFar.y;
  return (2.0 * n * f) / (f + n - d * (f - n));
}`,Jr=`
uniform float uTanHalfFov;
uniform float uAspect;

vec3 viewPosAt(vec2 uv) {
  float z = linearDepthAt(uv);
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x * uTanHalfFov * uAspect * z, ndc.y * uTanHalfFov * z, -z);
}`,en=$t+Jr,Zr=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,so=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${en}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main(){
  float centreDepth = linearDepthAt(vUv);
  if (centreDepth >= uNearFar.y * 0.999) { frag = vec4(1.0); return; }

  vec3 p = viewPosAt(vUv);
  vec2 e = uTexel * 2.0;
  vec3 dx = viewPosAt(vUv + vec2(e.x, 0.0)) - viewPosAt(vUv - vec2(e.x, 0.0));
  vec3 dy = viewPosAt(vUv + vec2(0.0, e.y)) - viewPosAt(vUv - vec2(0.0, e.y));
  vec3 nRaw = cross(dx, dy);
  float nLen = length(nRaw);
  if (nLen < 1e-8) { frag = vec4(1.0); return; }
  vec3 n = nRaw / nLen;

  float ang = hash(gl_FragCoord.xy) * 6.2831853;
  float ca = cos(ang), sa = sin(ang);

  float occlusion = 0.0;
  const int SAMPLES = 12;
  for (int i = 0; i < SAMPLES; i++) {
    float t = (float(i) + 0.5) / float(SAMPLES);
    float r = uRadius * sqrt(t);
    float a = ang + t * 6.2831853 * 3.0;
    vec2 offDir = vec2(cos(a) * ca - sin(a) * sa, cos(a) * sa + sin(a) * ca);
    vec2 suv = vUv + offDir * (r / max(0.35, -p.z)) / (2.0 * uTanHalfFov);
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;

    vec3 s = viewPosAt(suv);
    vec3 dir = s - p;
    float len = length(dir);
    if (len < 1e-4) continue;
    float cosine = max(0.0, dot(n, dir / len) - uBias);
    float atten = uRadius / (uRadius + len);
    occlusion += cosine * atten;
  }
  occlusion = clamp(1.0 - (occlusion / float(SAMPLES)) * uStrength, 0.0, 1.0);
  frag = vec4(occlusion, occlusion, occlusion, 1.0);
}`,uo=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${$t}

void main(){
  float centre = linearDepthAt(vUv);
  float sum = 0.0, wsum = 0.0;
  for (int i = -4; i <= 4; i++) {
    vec2 off = uDir * uTexel * float(i);
    float w = exp(-float(i * i) / 8.0);
    float d = linearDepthAt(vUv + off);

    float dw = exp(-abs(d - centre) / max(0.05, centre * 0.08));
    sum += texture(uAO, vUv + off).r * w * dw;
    wsum += w * dw;
  }
  float v = wsum > 0.0 ? sum / wsum : 1.0;
  frag = vec4(v, v, v, 1.0);
}`;function jt(e,r,n){let{gl:t}=e,o=e.compile(Zr,so);if("kind"in o)return o;let a=e.compile(Zr,uo);if("kind"in a)return a;let i=Math.max(1,r>>1),s=Math.max(1,n>>1),l=()=>{let f=t.createFramebuffer(),E=t.createTexture();return!f||!E?null:{fb:f,tex:E}},u=l(),m=l();if(!u||!m)return w("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let d=()=>{for(let f of[u,m])t.bindTexture(t.TEXTURE_2D,f.tex),t.texImage2D(t.TEXTURE_2D,0,t.R8,i,s,0,t.RED,t.UNSIGNED_BYTE,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,f.fb),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,f.tex,0);t.bindFramebuffer(t.FRAMEBUFFER,null)};d(),t.bindFramebuffer(t.FRAMEBUFFER,u.fb);let c=t.checkFramebufferStatus(t.FRAMEBUFFER);if(t.bindFramebuffer(t.FRAMEBUFFER,null),c!==t.FRAMEBUFFER_COMPLETE)return w("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${c.toString(16)}).`);let h=(f,E,g,p,x)=>{t.activeTexture(t.TEXTURE0+x),t.bindTexture(t.TEXTURE_2D,E),t.uniform1i(t.getUniformLocation(f,"uDepth"),x),t.uniform2f(t.getUniformLocation(f,"uNearFar"),g,p)},y=(f,E,g,p,x,R,T)=>{h(f,E,g,p,T),t.uniform1f(t.getUniformLocation(f,"uTanHalfFov"),Math.tan(x*Math.PI/360)),t.uniform1f(t.getUniformLocation(f,"uAspect"),R)};return{get texture(){return u.tex},get width(){return i},get height(){return s},compute(f){let E=re(t);t.disable(t.DEPTH_TEST),t.depthMask(!1),t.disable(t.BLEND),t.disable(t.CULL_FACE),t.bindFramebuffer(t.FRAMEBUFFER,u.fb),t.viewport(0,0,i,s),t.useProgram(o),y(o,f.depthTexture,f.near,f.far,f.fovDeg,f.aspect,0),t.uniform2f(t.getUniformLocation(o,"uTexel"),1/i,1/s),t.uniform1f(t.getUniformLocation(o,"uRadius"),f.radius??.55),t.uniform1f(t.getUniformLocation(o,"uStrength"),f.strength??1.15),t.uniform1f(t.getUniformLocation(o,"uBias"),f.bias??.035),e.blit(o);for(let[g,p,x]of[[u,m,[1,0]],[m,u,[0,1]]])t.bindFramebuffer(t.FRAMEBUFFER,p.fb),t.viewport(0,0,i,s),t.useProgram(a),h(a,f.depthTexture,f.near,f.far,0),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,g.tex),t.uniform1i(t.getUniformLocation(a,"uAO"),1),t.uniform2f(t.getUniformLocation(a,"uTexel"),1/i,1/s),t.uniform2f(t.getUniformLocation(a,"uDir"),x[0],x[1]),e.blit(a);ve(t,2),ne(t,E)},resize(f,E){let g=Math.max(1,f>>1),p=Math.max(1,E>>1);g===i&&p===s||(i=g,s=p,d())},dispose(){t.deleteProgram(o),t.deleteProgram(a);for(let f of[u,m])t.deleteFramebuffer(f.fb),t.deleteTexture(f.tex)}}}var Ee=new URLSearchParams(location.search),rr=[],cn=[];function dn(e,r,n,t){let o=Ee.get(e);if(o===null)return r;let a=Number(o);if(!Number.isFinite(a))return rr.push(`${e}=${o}`),r;let i=Math.max(n,Math.min(t,a));return i!==a&&cn.push(`${e}=${o} used as ${i}`),i}var mn=Ee.get("vol")!=="0",Tr=Ee.get("depth")!=="0",gr=Ut.includes(Ee.get("tier")??"")?Ee.get("tier"):"full",nr=Ot(gr),or=Ee.get("ao")!=="0"&&nr.ao,Ye=dn("scale",1,1,3),fn=Math.trunc(dn("frames",300,1,2e4)),P=1200*Ye,U=720*Ye,_e=document.getElementById("c");_e.width=P;_e.height=U;var Rr=document.getElementById("log");function xt(e){document.title="REFUSED",Rr.textContent=e;let[r,...n]=e.split(":");throw hn?.showRefusal(r?.trim()??"REFUSED",n.join(":").trim()||e),new Error(e)}var hn=null;function N(e,r){return"kind"in r&&xt(`${e}: ${r.code} \u2014 ${r.reason} ${r.detail??""}`),r}var O=["PAID_SEARCH","PAID_SOCIAL","INFLUENCER","EMAIL","PR_EARNED","AFFILIATE","COMMUNITY"],Ne=["ADVISORY","ELEVATED","SEVERE"],M=28,lo=[.05,.07,.04,.025,.02,.055,.045],Qe=[{ch:0,day:1,band:1,w:.3},{ch:3,day:2,band:1,w:.25},{ch:6,day:3,band:1,w:.2},{ch:2,day:4,band:1,w:.5},{ch:2,day:5,band:1,w:.8},{ch:2,day:6,band:2,w:.7},{ch:2,day:7,band:2,w:1},{ch:2,day:8,band:2,w:.9},{ch:2,day:9,band:1,w:.6},{ch:2,day:10,band:1,w:.35},{ch:1,day:6,band:1,w:.4},{ch:1,day:7,band:1,w:.75},{ch:1,day:8,band:2,w:.85},{ch:1,day:9,band:2,w:1.05},{ch:1,day:10,band:2,w:.8},{ch:1,day:11,band:1,w:.5},{ch:1,day:12,band:1,w:.3},{ch:6,day:8,band:1,w:.3},{ch:6,day:9,band:1,w:.55},{ch:6,day:10,band:2,w:.7},{ch:6,day:11,band:2,w:.95},{ch:6,day:12,band:2,w:.75},{ch:6,day:13,band:1,w:.45},{ch:6,day:14,band:1,w:.25},{ch:4,day:10,band:1,w:.35},{ch:4,day:11,band:1,w:.6},{ch:4,day:12,band:2,w:.8},{ch:4,day:13,band:2,w:.6},{ch:4,day:14,band:1,w:.4},{ch:0,day:13,band:1,w:.45},{ch:0,day:14,band:2,w:.75},{ch:0,day:15,band:2,w:.6},{ch:0,day:16,band:1,w:.3},{ch:3,day:14,band:1,w:.4},{ch:3,day:15,band:1,w:.55},{ch:3,day:16,band:1,w:.3},{ch:5,day:24,band:1,w:.5},{ch:5,day:25,band:2,w:.7},{ch:5,day:26,band:1,w:.4}],H=[13,14,15],Ke=[22,23],L=e=>H.includes(e)?"ABSENT":Ke.includes(e)?"WITHHELD":"OBSERVED",J=O.map((e,r)=>Array.from({length:M},(n,t)=>{let o=[0,0,0];return L(t)==="OBSERVED"&&(o[0]=lo[r]),o}));for(let e of Qe)L(e.day)==="OBSERVED"&&(J[e.ch][e.day][e.band]+=e.w);var bn=Qe.filter(e=>L(e.day)!=="OBSERVED"),Xe=0;for(let e of J)for(let r of e)for(let n of r)Xe=Math.max(Xe,n);var Ar=8,Oe=0,q=-1,dt=null,bt=[];for(let e=0;e<M;e++){if(L(e)!=="OBSERVED"){bt.push(Oe),q<0&&dt===null&&(dt=L(e)==="ABSENT"?"THRESHOLD_NOT_REACHED_BEFORE_UNMEASURED_DAY":"THRESHOLD_NOT_REACHED_BEFORE_WITHHELD_DAY");continue}for(let r=0;r<O.length;r++)for(let n=0;n<Ne.length;n++)Oe+=J[r][e][n];bt.push(Oe),q<0&&Oe>=Ar&&(q=e,dt=null)}var co=Math.min(...H),ar=Math.min(...Ke),Fr=e=>{let r=L(e);return r==="ABSENT"?"DAY_NOT_MEASURED":r==="WITHHELD"?"DAY_WITHHELD":e>co?"INTEGRAL_CROSSES_UNMEASURED_DAY":e>ar?"INTEGRAL_CROSSES_WITHHELD_DAY":"INTEGRABLE"},Sr=Math.max(...Array.from({length:M},(e,r)=>r).filter(e=>Fr(e)==="INTEGRABLE")),pn=Ir({title:"E7 \xB7 The Storm \u2014 marketing risk by day, channel and severity",readsAs:"Depth is days ahead in the rendered view, and the opacity along any line of sight is the total risk between the viewer and that day \u2014 an accumulation a per-cell table cannot show. The front advancing across channels, the three-day hole where the monitor was down, and the two days that are measured but withheld are all shapes there and rows here. This table carries every cell; what it cannot carry is what lies between you and a day.",notices:[`SYNTHETIC RISK DATA \u2014 ${Qe.length} hand-authored flagged items over ${M} days. The shape is deliberate; the values are not measurements.`,`D${Math.min(...H)}-D${Math.max(...H)} were NOT MEASURED, and ${bn.length} already-scheduled flagged items landed inside them: their weight is in no cell below and is not zero. Every cumulative figure past that day is REFUSED.`],columns:[{key:"day",label:"Day"},{key:"state",label:"State"},{key:"reading",label:"Cumulative reading"},{key:"advisory",label:"Advisory",numeric:!0},{key:"elevated",label:"Elevated",numeric:!0},{key:"severe",label:"Severe",numeric:!0},{key:"total",label:"Day total",numeric:!0},{key:"cumulative",label:"Cumulative",numeric:!0}],rows:Array.from({length:M},(e,r)=>{let n=L(r),t=n==="OBSERVED",o=Fr(r),a=s=>t?Number(O.reduce((l,u,m)=>l+J[m][r][s],0).toFixed(3)):null,i=t?Number(Ne.reduce((s,l,u)=>s+O.reduce((m,d,c)=>m+J[c][r][u],0),0).toFixed(3)):null;return{day:`D${r}`,state:n,reading:o==="INTEGRABLE"?"integrable":o,advisory:a(0),elevated:a(1),severe:a(2),total:i,cumulative:o==="INTEGRABLE"?Number(bt[r].toFixed(2)):null}})});hn=pn;rr.length>0&&xt(`BAD_PARAM: ${rr.join(", ")} \u2014 not a number, so the view was not drawn rather than drawn at a nonsensical size. Nothing about the underlying measurements has changed; correct the URL and reload.`);Ee.get("refuse")==="1"&&xt("FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. The volumetric field is not being drawn.");var mt=At(_e,{alpha:!1});Rt(mt)||xt(`stage: ${mt.code} \u2014 ${mt.reason}`);var S=mt,b=S.gl,En=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,mo=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${_t}
${Dt}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,fo=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uVolume;
out vec4 frag;
void main(){ frag = texture(uVolume, vUv); }`,ho=N("present",S.compile(En,mo)),bo=N("composite",S.compile(En,fo)),Yt=N("lit",zt(S)),Me=N("target",Ue(S,P,U)),tn=N("volume target",Ue(S,P,U)),yn=N("far depth",Ue(S,4,4)),ir=N("shadow",Ht(S,st(gr,1536))),rn=N("ao",jt(S,P,U));yn.bind();b.clearDepth(1);b.clear(b.DEPTH_BUFFER_BIT);b.bindFramebuffer(b.FRAMEBUFFER,null);var W=.5,vr=2.6,po=M*W,De=.62,Pe=.46,ze=.025,oe=W*.78,z=.56,B=ze/2,$=e=>(e-(O.length-1)/2)*De,k=$(O.length-1)+Pe/2,fe=$(0)-Pe/2-.03-z/2,Mr=fe-z/2,pt=(Mr+k)/2,_=e=>-vr-e*W,qe=e=>_(e)-W/2,Ze=.6,Tt=B+.02,xn=Tt+Ne.length*Ze,Tn=e=>Tt+(e+.5)*Ze,F=[-k,Tt,_(M)],D=[k,xn,_(0)],Je=.7,wr=Xe*Je/W,ue=76,le=42,ye=112,gn=(e,r,n)=>e+ue*(r+le*n),Eo=e=>{for(let r=0;r<O.length;r++)if(Math.abs(e-$(r))<=Pe/2)return r;return-1},yo=e=>{let r=Math.floor((-e-vr)/W);return r>=0&&r<M?r:-1},xo=e=>{let r=Math.floor((e-Tt)/Ze);return r>=0&&r<Ne.length?r:-1},To=.62,go=(e,r,n)=>{let t=Eo(e);if(t<0)return 0;let o=yo(n);if(o<0||L(o)!=="OBSERVED")return 0;let a=xo(r);if(a<0)return 0;let i=Math.abs(r-Tn(a))/(Ze/2),s=Math.max(0,Math.min(1,(1-i)/(1-To)));return s<=0?0:J[t][o][a]*s/Xe},be=new Float32Array(ue*le*ye);for(let e=0;e<ye;e++){let r=F[2]+(e+.5)/ye*(D[2]-F[2]);for(let n=0;n<le;n++){let t=F[1]+(n+.5)/le*(D[1]-F[1]);for(let o=0;o<ue;o++){let a=F[0]+(o+.5)/ue*(D[0]-F[0]);be[gn(o,n,e)]=go(a,t,r)}}}var sr=1/0,ur=-1/0,Rn=0,lr=0;for(let e of be)e<sr&&(sr=e),e>ur&&(ur=e),Rn+=e,e>0&&lr++;var he=mn?Pt(S,ue,le,ye):null,cr=he&&"kind"in he?`${he.code} \u2014 ${he.reason}`:null,Le=he&&!("kind"in he)?he:null;Le&&Le.upload(be);var Be=.125,Ie=128,dr=2.5,mr=32,ae={target:[pt,.366,qe(5.13)],distance:10,azimuthDeg:0,elevationDeg:21.3,fovDeg:33,near:dr,far:mr},C=ut(ae),Z=V(me(ae.target,C)),Ce=V(Re(Z,[0,1,0])),ft=V(Re(Ce,Z)),we=Math.tan((ae.fovDeg??36)*Math.PI/360),pe=P/U,An=j(Pe,ze,oe),Fn=j(z,ze,oe),Sn=j(2*k,.42,oe),vn=j(2*k+z+.06,.1,.05),Mn=j(2*k,.07,.05),wn=j(2*k,.11,.05),_n=j(.075,1.05,.075),Dn=N("tile",Q(S,An)),Ln=N("gutter",Q(S,Fn)),Nn=N("lid",Q(S,Sn)),Pn=N("rail",Q(S,vn)),Un=N("week bar",Q(S,Mn)),On=N("gate",Q(S,wn)),Bn=N("post",Q(S,_n)),Ro=new Float32Array([1,0,0,0,1,0,0,0,1]),Ao=(e,r,n)=>{let t=tt();return t[12]=e,t[13]=r,t[14]=n,t},K={tile:{baseColour:I("#22315A"),roughness:.74,metalness:.03},gutter:{baseColour:I("#131E36"),roughness:.84,metalness:0},withheldTile:{baseColour:I("#1B2540"),roughness:.55,metalness:.1},lid:{baseColour:I("#6B7A99"),roughness:.62,metalness:.35},rail:{baseColour:I("#6B7A99"),roughness:.58,metalness:.25},week:{baseColour:I("#26355A"),roughness:.6,metalness:.05},gate:{baseColour:I("#2C6BFF"),roughness:.52,metalness:.06}},_r=[],ke=[],ie=(e,r,n,t,o,a,i,s)=>{ke.push({mesh:i,model:Ao(e,r,n),normalMat:Ro,material:s}),_r.push({min:[e-t/2,r-o/2,n-a/2],max:[e+t/2,r+o/2,n+a/2]})},In=0,Cn=0;for(let e=0;e<M;e++){let r=L(e),n=qe(e);if(r==="ABSENT"){Cn+=O.length+1;continue}ie(fe,0,n,z,ze,oe,Ln,K.gutter);for(let t=0;t<O.length;t++)ie($(t),0,n,Pe,ze,oe,Dn,r==="WITHHELD"?K.withheldTile:K.tile);In+=O.length+1,r==="WITHHELD"&&ie(0,B+.21,n,2*k,.42,oe,Nn,K.lid)}var Fo=[_(Math.min(...H))+.02,_(Math.max(...H)+1)-.02];for(let e of Fo){ie(pt,B+.05,e,2*k+z+.06,.1,.05,Pn,K.rail);for(let r=0;r<=O.length;r++)ie($(0)-De/2+r*De,B+.525,e,.075,1.05,.075,Bn,K.rail)}var Dr=[7,14,21,28],kn=Dr.filter(e=>L(e-1)!=="ABSENT"&&L(Math.min(e,M-1))!=="ABSENT");for(let e of kn)ie(0,B+.035,_(e),2*k,.07,.05,Un,K.week);if(q>=0){let e=_(q);ie(0,B+.055,e,2*k,.11,.05,On,K.gate);for(let r=0;r<=O.length;r++)ie($(0)-De/2+r*De,B+.525,e,.075,1.05,.075,Bn,K.gate)}var fr=[.44,-.66,-.61],nn=[Mr-.2,0,_(M)-.3],on=[k+.2,xn,-vr+.3],an=Ct({direction:fr,colour:[1,1,1],extent:9.5},Gt(nn,on),kt(nn,on)),So=ke.reduce((e,r)=>e+(r.mesh===Dn?Y(An):r.mesh===Ln?Y(Fn):r.mesh===Nn?Y(Sn):r.mesh===Pn?Y(vn):r.mesh===Un?Y(Mn):r.mesh===On?Y(wn):Y(_n)),0),Qt=I("#070B14"),vo={zenith:[.01,.014,.03],horizon:[.03,.044,.08],ground:[.006,.007,.012]},Kt=I("#2C6BFF"),qt=I("#FF8A3D"),Mo=[Kt[0]*.55,Kt[1]*.55,Kt[2]*.55],wo=[qt[0]*1.45,qt[1]*1.45,qt[2]*1.45],Gn=W/Je,_o=J.reduce((e,r)=>e+r.reduce((n,t)=>n+t.filter(o=>o>Gn).length,0),0);function $e(e=Tr){let r=lt(ae,pe);Yt.shadowPass(an,ke,ir),Me.bind(),b.clearColor(Qt[0],Qt[1],Qt[2],1),b.clear(b.COLOR_BUFFER_BIT|b.DEPTH_BUFFER_BIT),Yt.depthPrepass(r,ke),or&&(rn.compute({depthTexture:Me.depthTexture,near:dr,far:mr,fovDeg:ae.fovDeg??36,aspect:pe,radius:.34,strength:1.15}),Me.bind()),Yt.draw({viewProj:r,eye:C,lightDir:fr,lightColour:[2.05,2,1.92],ambientGain:.62,sky:vo,lightVP:an,shadow:ir,shadowStrength:.92,draws:ke,ao:or?rn.texture:null,screenSize:[P,U]}),Le&&(tn.bind(),b.clearColor(0,0,0,0),b.clear(b.COLOR_BUFFER_BIT|b.DEPTH_BUFFER_BIT),Le.draw({eye:C,forward:Z,right:Ce,up:ft,fovDeg:ae.fovDeg??36,aspect:pe,near:dr,far:mr,sceneDepth:e?Me.depthTexture:yn.depthTexture,boxMin:F,boxMax:D,worldStep:Be,maxSteps:Ie,densityScale:wr,colourLow:Mo,colourHigh:wo,lightDir:fr,lightSteps:6,emission:.26}),Me.bind(),b.enable(b.BLEND),b.blendFunc(b.ONE,b.ONE_MINUS_SRC_ALPHA),b.disable(b.DEPTH_TEST),b.activeTexture(b.TEXTURE0),b.bindTexture(b.TEXTURE_2D,tn.texture),S.blit(bo,n=>b.uniform1i(b.getUniformLocation(n,"uVolume"),0)),b.disable(b.BLEND)),b.bindFramebuffer(b.FRAMEBUFFER,null),b.viewport(0,0,P,U),b.disable(b.DEPTH_TEST),b.activeTexture(b.TEXTURE0),b.bindTexture(b.TEXTURE_2D,Me.texture),S.blit(ho,n=>b.uniform1i(b.getUniformLocation(n,"uScene"),0))}function Do(e){$e();let r=new Uint8Array(4);b.readPixels(0,0,1,1,b.RGBA,b.UNSIGNED_BYTE,r);let n=performance.now();for(let t=0;t<e;t++)$e();return b.readPixels(0,0,1,1,b.RGBA,b.UNSIGNED_BYTE,r),(performance.now()-n)/e}var Zt=Do(Math.max(1,fn));function Lo(){if(!Le)return{pixels:0,pct:0,meanDelta:0,maxDelta:0};let e=new Uint8Array(P*U*4),r=new Uint8Array(P*U*4);$e(!0),b.readPixels(0,0,P,U,b.RGBA,b.UNSIGNED_BYTE,e),$e(!1),b.readPixels(0,0,P,U,b.RGBA,b.UNSIGNED_BYTE,r);let n=0,t=0,o=0;for(let a=0;a<e.length;a+=4){let i=Math.max(Math.abs(e[a]-r[a]),Math.abs(e[a+1]-r[a+1]),Math.abs(e[a+2]-r[a+2]));i>2&&(n++,t+=i,i>o&&(o=i))}return{pixels:n,pct:Number((100*n/(P*U)).toFixed(2)),meanDelta:Number((t/Math.max(1,n)).toFixed(1)),maxDelta:o}}var ct=Lo(),No=(e,r,n)=>{let t=(e-F[0])/(D[0]-F[0]),o=(r-F[1])/(D[1]-F[1]),a=(n-F[2])/(D[2]-F[2]);if(t<0||t>1||o<0||o>1||a<0||a>1)return 0;let i=t*ue-.5,s=o*le-.5,l=a*ye-.5,u=Math.floor(i),m=Math.floor(s),d=Math.floor(l),c=i-u,h=s-m,y=l-d,f=(g,p)=>g<0?0:g>p-1?p-1:g,E=0;for(let g=0;g<2;g++)for(let p=0;p<2;p++)for(let x=0;x<2;x++){let R=(x?c:1-c)*(p?h:1-h)*(g?y:1-y);R<=0||(E+=R*be[gn(f(u+x,ue),f(m+p,le),f(d+g,ye))])}return E*wr},Hn=(e,r,n)=>{let t=at(e,r,F,D);if(!t)return{tau:0,truncated:!1,capped:!1,hit:!1,tStart:0,tEnd:0};let o=Math.min(t.tFar,n),a=n<t.tFar;if(o<=t.tNear)return{tau:0,truncated:!1,capped:a,hit:!0,tStart:t.tNear,tEnd:t.tNear};let i=it(o-t.tNear,Be,Ie),s=0;for(let l=0;l<i.steps;l++){let u=t.tNear+(l+.5)*i.step;if(u>o)break;let m=No(e[0]+r[0]*u,e[1]+r[1]*u,e[2]+r[2]*u);m<=5e-4||(s+=m*i.step)}return{tau:s,truncated:i.truncated,capped:a,hit:!0,tStart:t.tNear,tEnd:o}},se=O.flatMap((e,r)=>Ne.map((n,t)=>{let o=J[r].reduce((s,l,u)=>s+(L(u)==="OBSERVED"?l[t]:0),0),a=Hn([$(r),Tn(t),D[2]+1],[0,0,-1],1/0),i=a.tau/Je;return{channel:e,band:n,expected:Number(o.toFixed(4)),measured:Number(i.toFixed(4)),errorPct:o>1e-6?Number((100*Math.abs(i-o)/o).toFixed(2)):0,truncated:a.truncated}})),Po=Math.max(...se.map(e=>e.errorPct)),Uo=Number((se.reduce((e,r)=>e+r.errorPct,0)/se.length).toFixed(3)),Oo=e=>{let r=1/0;for(let n of _r){let t=at(C,e,n.min,n.max);t&&t.tNear>0&&t.tNear<r&&(r=t.tNear)}return r},Ge=61,He=37,Ve=0,Vn=0,Wn=0,je=1/0,Et=0,Xn=0,hr=0,zn=0,br=0,Lr=0,pr=0,Nr=0;for(let e=0;e<He;e++)for(let r=0;r<Ge;r++){let n=2*(r+.5)/Ge-1,t=2*(e+.5)/He-1,o=V([Z[0]+Ce[0]*n*we*pe+ft[0]*t*we,Z[1]+Ce[1]*n*we*pe+ft[1]*t*we,Z[2]+Ce[2]*n*we*pe+ft[2]*t*we]),a=Hn(C,o,Oo(o));if(!a.hit)continue;Ve++,a.capped&&Vn++,a.truncated&&Wn++,je=Math.min(je,a.tau),Et=Math.max(Et,a.tau),Xn+=a.tau;let i=(m,d)=>C[d]+o[d]*m,s=Math.abs(i(a.tEnd,0)-i(a.tStart,0))/De,l=Math.abs(i(a.tEnd,2)-i(a.tStart,2))/W,u=Math.abs(i(a.tEnd,1)-i(a.tStart,1))/Ze;hr=Math.max(hr,s),zn+=s,br=Math.max(br,l),Lr+=l,pr=Math.max(pr,u),Nr+=u}Number.isFinite(je)||(je=0);var We=e=>Number((e/Math.max(1,Ve)).toFixed(2)),yt=lt(ae,pe),xe=P/Ye,Te=U/Ye,gt=document.createElement("div");gt.style.cssText=`position:relative;overflow:hidden;width:${xe}px;height:${Te}px`;_e.parentNode?.insertBefore(gt,_e);gt.appendChild(_e);var ce=document.createElement("div");ce.style.cssText="position:absolute;inset:0;pointer-events:none";gt.appendChild(ce);var Bo=e=>{let r=(i,s)=>Math.hypot(i.x-s.x,i.y-s.y),n=e[0],t=e[1],o=e[2],a=e[3];return{ew:Math.max(1,Math.round(Math.max(r(n,t),r(a,o)))),eh:Math.max(1,Math.round(Math.max(r(n,a),r(t,o))))}},Io=26,Co=15,Jt=[],sn=(e,r,n)=>{let t=0;for(let o=0;o<4;o++){let a=e[o],i=e[(o+1)%4],s=(i.x-a.x)*(n-a.y)-(i.y-a.y)*(r-a.x);if(Math.abs(s)<1e-9)continue;let l=s>0?1:-1;if(t===0)t=l;else if(l!==t)return!1}return!0},$n=(e,r,n,t)=>{let o=Math.hypot(n[0]-C[0],n[1]-C[1],n[2]-C[2]),a=ot(yt,r,xe,Te,100,100);if(Se(a))return{key:e,proj:a,ew:0,eh:0,distance:o,shown:!1,reason:a.refusal,widthPx:0,heightPx:0};let{ew:i,eh:s}=Bo(a.screen),l=ot(yt,r,xe,Te,i,s),u=a.signedArea<=0,m=t??(u?"BACK_FACING":i<Io?"EDGE_ON":s<Co?"TOO_FLAT":a.screen.filter(c=>Jt.some(h=>sn(h,c.x,c.y))).length+Jt.reduce((c,h)=>c+h.filter(y=>sn(a.screen.map(f=>({x:f.x,y:f.y})),y.x,y.y)).length,0)>=2?"OCCLUDED":null),d=m===null&&!Se(l);return d&&Jt.push(a.screen.map(c=>({x:c.x,y:c.y}))),{key:e,proj:l,ew:i,eh:s,distance:o,shown:d,reason:m,widthPx:i,heightPx:s}},Er=O.map((e,r)=>{let n=Nt($(r),_(0)+.04,B+.02,Pe,.15,Math.atan2(C[0]-$(r),C[2]-_(0)),.01);return{...$n(`ch:${e}`,n,[$(r),B+.09,_(0)+.04],null),name:e,total:Number(J[r].reduce((t,o,a)=>t+(L(a)==="OBSERVED"?o.reduce((i,s)=>i+s,0):0),0).toFixed(2))}}),yr=Array.from({length:M},(e,r)=>r).map(e=>{let r=L(e),n=_(e)-(W-oe)/2,t=n-oe,o=B+.004,a={topLeft:[fe-z/2,o,t],topRight:[fe+z/2,o,t],bottomRight:[fe+z/2,o,n],bottomLeft:[fe-z/2,o,n]},i=r==="ABSENT"?"DAY_NOT_MEASURED":null;return{...$n(`day:${e}`,a,[fe,o,qe(e)],i),day:e,state:r}}).sort((e,r)=>e.distance-r.distance),un=e=>e.filter(r=>!r.shown).reduce((r,n)=>{let t=n.reason??"UNKNOWN";return r[t]=(r[t]??0)+1,r},{});for(let e of[...Er].sort((r,n)=>n.distance-r.distance)){if(!e.shown||Se(e.proj))continue;let r=document.createElement("div");r.style.cssText=`position:absolute;left:0;top:0;width:${e.ew}px;height:${e.eh}px;transform-origin:0 0;transform:${e.proj.transform};display:flex;align-items:center;justify-content:center;overflow:hidden;-webkit-font-smoothing:antialiased`;let n=document.createElement("div");n.style.cssText="font:600 9.5px/1 ui-monospace,monospace;letter-spacing:.08em;color:rgba(220,232,255,0.92);white-space:nowrap",n.textContent=e.name,r.appendChild(n),ce.appendChild(r)}for(let e of[...yr].sort((r,n)=>n.distance-r.distance)){if(!e.shown||Se(e.proj))continue;let r=document.createElement("div");r.style.cssText=`position:absolute;left:0;top:0;width:${e.ew}px;height:${e.eh}px;transform-origin:0 0;transform:${e.proj.transform};display:flex;align-items:center;justify-content:center;overflow:hidden;-webkit-font-smoothing:antialiased`;let n=e.state==="WITHHELD"?"WITHHELD":`D${e.day}`,t=e.state==="WITHHELD"?"#B7C2D8":"rgba(200,216,244,0.88)",o=document.createElement("div");o.style.cssText=`font:600 10px/1 ui-monospace,monospace;letter-spacing:.06em;color:${t};white-space:nowrap`,o.textContent=n,r.appendChild(o),ce.appendChild(r)}var Pr=(e,r,n,t)=>{let o=Ae(yt,e,xe,Te),a=!o.behind&&o.sx>-60&&o.sx<xe+60&&o.sy>0&&o.sy<Te;if(a){let i=document.createElement("div");i.style.cssText=`position:absolute;left:${o.sx.toFixed(1)}px;top:${o.sy.toFixed(1)}px;transform:translate(-50%,-50%);font:600 9.5px/1 ui-monospace,monospace;letter-spacing:.1em;color:${n};border:1px solid ${t};padding:3px 6px;white-space:nowrap;background:rgba(6,10,18,0.72)`,i.textContent=r,ce.appendChild(i)}return{onFrame:a,sx:Math.round(o.sx),sy:Math.round(o.sy)}},Ur=k+.34,ko=Pr([Ur,B+.22,qe((Math.min(...H)+Math.max(...H))/2)],`D${Math.min(...H)}-D${Math.max(...H)} NOT MEASURED`,"#E0A94A","rgba(224,169,74,0.55)"),Go=Pr([Ur,B+.22,qe(ar+.5)],`D${ar}-D${Math.max(...Ke)} WITHHELD`,"#B7C2D8","rgba(183,194,216,0.5)"),Ho=q>=0?Pr([Ur,B+.22,_(q)],`REVIEW THRESHOLD ${Ar} \xB7 D${q}`,"#9EC4FF","rgba(158,196,255,0.5)"):{onFrame:!1,sx:0,sy:0},er=Dr.map(e=>{let r=e-1<=Sr,n=[Mr-.1,B+.02,_(e)],t=Ae(yt,n,xe,Te),o=!t.behind&&t.sx>-40&&t.sx<xe&&t.sy>0&&t.sy<Te;if(o){let a=document.createElement("div");a.style.cssText=`position:absolute;left:16px;top:${t.sy.toFixed(1)}px;transform:translate(0,-50%);font:500 10px/1.35 ui-monospace,monospace;letter-spacing:.07em;white-space:nowrap;color:${r?"rgba(196,212,240,0.85)":"#E0A94A"}`;let i=document.createElement("div");if(i.textContent=`D${e}`,a.appendChild(i),!r){let s=document.createElement("div");s.textContent="NO INTEGRAL",a.appendChild(s)}ce.appendChild(a)}return{day:e,readable:r,onFrame:o,sx:Math.round(t.sx),sy:Math.round(t.sy)}}),Or=document.createElement("div");Or.style.cssText="position:absolute;left:18px;top:16px;display:flex;flex-direction:column;gap:7px";Or.innerHTML=`<div style="font:600 11px/1 ui-monospace,monospace;letter-spacing:.16em;color:#8FB7FF">MARKETING RISK \xB7 DEPTH IS DAYS AHEAD</div><div style="font:400 10.5px/1.55 ui-monospace,monospace;color:rgba(196,212,240,0.86)">THE DEPTH OF COLOUR IS THE TOTAL RISK BETWEEN YOU AND THAT DAY<br>${W} m PER DAY &nbsp;\xB7&nbsp; ${Je} OPTICAL DEPTH PER RISK UNIT<br>A PIXEL INTEGRATES ~${We(Lr).toFixed(0)} DAYS AND ~${We(Nr).toFixed(1)} BANDS \u2014 ONE CHANNEL ONLY DOWN THE AXIS<br>INTEGRABLE TO D${Sr} &nbsp;\xB7&nbsp; CALENDAR VISIBLE TO D${M-1}${Le?"":" &nbsp;\xB7&nbsp; FIELD NOT RENDERED"}</div><div style="font:500 10px/1.45 ui-monospace,monospace;color:#E0A94A">SYNTHETIC RISK DATA \xB7 ${Qe.length} HAND-AUTHORED FLAGGED ITEMS${cr?`<br>VOLUME REFUSED \xB7 ${cr.split(" \u2014 ")[0]}`:""}${Tr?"":"<br>SCENE DEPTH OFF \u2014 THE FIELD IS PAINTED OVER THE GEOMETRY"}</div>`;ce.appendChild(Or);var ht={OBSERVED:Array.from({length:M},(e,r)=>r).filter(e=>L(e)==="OBSERVED").length,ABSENT:H.length,WITHHELD:Ke.length},Br=document.createElement("div");Br.style.cssText="position:absolute;right:18px;bottom:16px;display:flex;flex-direction:column;gap:6px;align-items:flex-end;font:500 10.5px/1 ui-monospace,monospace";Br.innerHTML=`<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;color:rgba(196,212,240,0.85)"><span>RISK IN THAT CELL \u2014 LOW TO HIGH</span><span style="width:132px;height:9px;display:inline-block;background:linear-gradient(90deg,#2C6BFF,#FF8A3D);border:1px solid rgba(196,212,240,0.4)"></span></div><div style="color:rgba(196,212,240,0.85);text-align:right">SEVERITY IS HEIGHT<br><span style="opacity:.8">${[...Ne].reverse().join(" / ")}</span></div>`+[["#101B2F",`OBSERVED \xB7 ${ht.OBSERVED} days`],["transparent",`NOT MEASURED \xB7 ${ht.ABSENT} days \u2014 hole in the floor`],["#6B7A99",`WITHHELD \xB7 ${ht.WITHHELD} days \u2014 lid, measured, not shown`]].map(([e,r])=>`<div style="display:flex;align-items:center;gap:7px;color:rgba(196,212,240,0.85)"><span>${r}</span><span style="width:11px;height:11px;background:${e};border:1px solid rgba(196,212,240,0.45);display:inline-block;forced-color-adjust:none"></span></div>`).join("");ce.appendChild(Br);var jn=(()=>{let e=b.getExtension("WEBGL_debug_renderer_info");return e?String(b.getParameter(e.UNMASKED_RENDERER_WEBGL)):"unknown"})(),tr=/swiftshader|llvmpipe|software/i.test(jn),xr=Lt();if(xr.length>0){let e="BRAND FIDELITY FAILED \u2014 "+xr.map(r=>`${r.key}: expected ${r.expected}, got ${r.actual}`).join("; ");throw document.title="REFUSED",Rr.textContent=e,new Error(e)}var ln=e=>{let r=V(me(e,C));return Number((Math.acos(Math.max(-1,Math.min(1,r[0]*Z[0]+r[1]*Z[1]+r[2]*Z[2])))*180/Math.PI).toFixed(2))},Yn={paramClamps:cn,tier:nr.tier,tierDprScale:nr.dprScale,tierShadowMapSize:st(gr,1536),shadowBaseline:1536,brandFidelity:xr,volume:mn,volumeRefusal:cr,sceneDepth:Tr,ao:or,hdr:S.hdr,eye:C.map(e=>Number(e.toFixed(2))),integrableToDay:Sr,visibleToDay:M-1,metresPerDay:W,calendarLengthM:po,riskToTau:Je,reviewThreshold:Ar,frontDay:q,frontRefusal:dt,totalObservedRisk:Number(Oe.toFixed(3)),days:ht,absentDays:H,withheldDays:Ke,absentRenderedAs:"FLOOR_HOLE_PLUS_EDGE_RAILS",withheldRenderedAs:"STEEL_LID_ON_INTACT_TILE",observedRenderedAs:"TILE_PLUS_VOLUMETRIC_MASS",readingStates:Array.from({length:M},(e,r)=>r).reduce((e,r)=>{let n=Fr(r);return e[n]=(e[n]??0)+1,e},{}),flaggedItems:Qe.length,flaggedLostToNonObservedDays:bn.length,gridSize:[ue,le,ye],gridVoxels:be.length,fieldMin:Number(sr.toFixed(5)),fieldMax:Number(ur.toFixed(5)),fieldMean:Number((Rn/be.length).toFixed(6)),fieldNonZeroVoxels:lr,fieldOccupancyPct:Number((100*lr/be.length).toFixed(2)),densityScale:Number(wr.toFixed(4)),maxCell:Number(Xe.toFixed(3)),rampSaturatesAtRiskUnits:Number(Gn.toFixed(3)),cellsAboveRampSaturation:_o,worldStep:Be,maxSteps:Ie,marchReachM:Number((Be*Ie).toFixed(2)),boxDiagonalM:Number(Math.hypot(D[0]-F[0],D[1]-F[1],D[2]-F[2]).toFixed(2)),longestRayPlan:it(Math.hypot(D[0]-F[0],D[1]-F[1],D[2]-F[2]),Be,Ie),eyeRays:{sweep:`${Ge}x${He}`,total:Ge*He,hitBox:Ve,missedBox:Ge*He-Ve,geometryCapped:Vn,truncated:Wn,tauMin:Number(je.toFixed(4)),tauMax:Number(Et.toFixed(4)),tauMean:Number((Xn/Math.max(1,Ve)).toFixed(4)),alphaMax:Number((1-Math.exp(-Et)).toFixed(3))},axialCheck:{rays:se.length,maxErrorPct:Po,meanErrorPct:Uo,truncated:se.filter(e=>e.truncated).length},eyeRayLaneDriftMax:Number(hr.toFixed(2)),eyeRayLaneDriftMean:We(zn),eyeRayDaysSpannedMax:Number(br.toFixed(2)),eyeRayDaysSpannedMean:We(Lr),eyeRayBandsSpannedMax:Number(pr.toFixed(2)),eyeRayBandsSpannedMean:We(Nr),glOcclusionPixels:ct.pixels,glOcclusionPct:ct.pct,glOcclusionMeanDelta:ct.meanDelta,glOcclusionMaxDelta:ct.maxDelta,halfFovDeg:Number(((ae.fovDeg??36)/2).toFixed(2)),nearEdgeOffAxisDeg:ln([pt,0,_(0)]),farEdgeOffAxisDeg:ln([pt,0,_(M)]),channelLabels:{shown:Er.filter(e=>e.shown).length,refusedBy:un(Er)},dateLabels:{shown:yr.filter(e=>e.shown).length,refusedBy:un(yr)},weekTicksOffFrame:er.filter(e=>!e.onFrame).length,weekBarsSuppressedForAbsence:Dr.length-kn.length,weekTicksRefusingIntegral:er.filter(e=>!e.readable).length,markersOnFrame:{absent:ko.onFrame,withheld:Go.onFrame,gate:Ho.onFrame},triangles:So,tilesDrawn:In,tilesOmittedForAbsence:Cn,solids:_r.length,shadowMap:ir.size,resolution:`${P}x${U}`,dprScale:Ye,frames:fn,msPerFrame:Number(Zt.toFixed(3)),fps:Math.round(1e3/Zt),glError:b.getError(),renderer:jn,rendererClass:tr?"software":"hardware",headroom:tr?null:Number((16.6-Zt).toFixed(3)),headroomRefusal:tr?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null,hardwareMsPerFrame:null,axialRays:se,cumulativeByDay:bt.map(e=>Number(e.toFixed(2))),weekTicks:er};globalThis.E7=Yn;var{axialRays:ni,cumulativeByDay:oi,weekTicks:ai,...Vo}=Yn;Rr.textContent=JSON.stringify(Vo,null,2)+`

axialCheck per (channel, band) \u2014 ${se.length} rays, full detail on globalThis.E7:
`+se.map(e=>`  ${e.channel.padEnd(12)} b${e.band} expected ${String(e.expected).padStart(7)} measured ${String(e.measured).padStart(7)} err ${String(e.errorPct).padStart(5)}%`).join(`
`);$e();pn.markRendered();document.title="READY";

var Gn=`
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
/* Hidden on screen ONLY once a frame exists. Display, not removal, so it stays in the accessibility
   tree and in the print snapshot. */
#lcx-fallback[data-rendered="1"] { display: none; }
@media print {
  /* The JSON diagnostic block is for a machine and wastes pages. The canvas prints because the stage
     is created with preserveDrawingBuffer. */
  #log { display: none !important; }
  #lcx-fallback, #lcx-fallback[data-rendered="1"] { display: block !important; color: #000; }
  #lcx-fallback h2, #lcx-fallback th { color: #000; }
  #lcx-fallback .reads, #lcx-fallback .absent { color: #444; }
  #lcx-fallback th, #lcx-fallback td { border-bottom: 1px solid #999; }
  #lcx-fallback .notice { color: #7a4f00; }
  body { background: #fff !important; }
}
`;function Nr(t){let r=document.createElement("style");r.textContent=Gn,document.head.appendChild(r);let n=document.createElement("section");n.id="lcx-fallback";let e=(o,a)=>{if(o===null)return`<td class="absent${a?" n":""}">absent</td>`;let i=String(o).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");return`<td class="${a?"n":""}">${i}</td>`};return n.innerHTML=`<h2>${t.title} \u2014 flat view</h2><p class="reads">${t.readsAs}</p>`+(t.notices??[]).map(o=>`<p class="notice">${o}</p>`).join("")+'<div id="lcx-refusal"></div>'+(t.html?`<div class="surface">${t.html}</div>`:"<table><thead><tr>"+t.columns.map(o=>`<th class="${o.numeric?"n":""}">${o.label}</th>`).join("")+"</tr></thead><tbody>"+t.rows.map(o=>"<tr>"+t.columns.map(a=>e(o[a.key]??null,!!a.numeric)).join("")+"</tr>").join("")+"</tbody></table>"),document.body.appendChild(n),{markRendered(){n.dataset.rendered="1"},showRefusal(o,a){let i=document.getElementById("lcx-refusal");i&&(i.innerHTML=`<p class="refusal"><strong>${o}</strong> \u2014 ${a} The measurements below are unaffected.</p>`),delete n.dataset.rendered;for(let s of Array.from(document.querySelectorAll("canvas")))s.style.display="none"}}}var Pr={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected."};function D(t,r){return r===void 0?{kind:"refused",code:t,reason:Pr[t]}:{kind:"refused",code:t,reason:Pr[t],detail:r}}function Et(t){return t.kind==="stage"}function yt(t,r={}){let n=t.getContext("webgl2",{antialias:r.antialias??!1,alpha:r.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!n)return D("NO_WEBGL2");let e=n.getExtension("EXT_color_buffer_float"),o=t.width,a=t.height,i=e?n.RGBA16F:n.RGBA8,s=e?n.HALF_FLOAT:n.UNSIGNED_BYTE,u=(p,T)=>{let g=n.createTexture();n.bindTexture(n.TEXTURE_2D,g),n.texImage2D(n.TEXTURE_2D,0,i,p,T,0,n.RGBA,s,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE);let R=n.createFramebuffer();n.bindFramebuffer(n.FRAMEBUFFER,R),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,g,0);let M=n.checkFramebufferStatus(n.FRAMEBUFFER);return M!==n.FRAMEBUFFER_COMPLETE?D("FRAMEBUFFER_INCOMPLETE",`status 0x${M.toString(16)} at ${p}\xD7${T}`):{texture:g,framebuffer:R,width:p,height:T}},d=r.bloomShift??2,m={w:o,h:a},c=u(o,a);if("kind"in c)return c;let l=u(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in l)return l;let b=u(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in b)return b;let f=n.createVertexArray();n.bindVertexArray(f);let E=n.createBuffer();n.bindBuffer(n.ARRAY_BUFFER,E),n.bufferData(n.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),n.STATIC_DRAW),n.enableVertexAttribArray(0),n.vertexAttribPointer(0,2,n.FLOAT,!1,0,0),n.bindVertexArray(null);let y=[];return{kind:"stage",gl:n,cssWidth:t.clientWidth||o,cssHeight:t.clientHeight||a,hdr:!!e,get width(){return m.w},get height(){return m.h},get scene(){return c},get bloomA(){return l},get bloomB(){return b},setRegion(p,T){let g=Math.max(1,Math.round(p)),R=Math.max(1,Math.round(T));if(!(g===m.w&&R===m.h)){m={w:g,h:R};for(let M of[c,l,b])"kind"in M||(n.deleteFramebuffer(M.framebuffer),n.deleteTexture(M.texture));c=u(g,R),l=u(Math.max(1,g>>d),Math.max(1,R>>d)),b=u(Math.max(1,g>>d),Math.max(1,R>>d))}},compile(p,T){let g=(_e,ee)=>{let $=n.createShader(_e);return n.shaderSource($,ee),n.compileShader($),n.getShaderParameter($,n.COMPILE_STATUS)?$:D("SHADER_COMPILE_FAILED",n.getShaderInfoLog($)??"(no log)")},R=g(n.VERTEX_SHADER,p);if(typeof R=="object"&&"kind"in R)return R;let M=g(n.FRAGMENT_SHADER,T);if(typeof M=="object"&&"kind"in M)return M;let N=n.createProgram();return n.attachShader(N,R),n.attachShader(N,M),n.linkProgram(N),n.getProgramParameter(N,n.LINK_STATUS)?(y.push(N),N):D("PROGRAM_LINK_FAILED",n.getProgramInfoLog(N)??"(no log)")},bindTarget(p){n.bindFramebuffer(n.FRAMEBUFFER,p?p.framebuffer:null),n.viewport(0,0,p?p.width:m.w,p?p.height:m.h)},blit(p,T){n.useProgram(p),n.bindVertexArray(f),T?.(p),n.drawArrays(n.TRIANGLES,0,3),n.bindVertexArray(null)},dispose(){for(let p of y)n.deleteProgram(p);for(let p of[c,l,b])"kind"in p||(n.deleteFramebuffer(p.framebuffer),n.deleteTexture(p.texture));n.deleteBuffer(E),n.deleteVertexArray(f)}}}var qe=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function Ze(t,r){let n=new Float32Array(16);for(let e=0;e<4;e++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=t[i*4+o]*r[e*4+i];n[e*4+o]=a}return n}var le=(t,r)=>[t[0]-r[0],t[1]-r[1],t[2]-r[2]],Ke=(t,r)=>t[0]*r[0]+t[1]*r[1]+t[2]*r[2],ye=(t,r)=>[t[1]*r[2]-t[2]*r[1],t[2]*r[0]-t[0]*r[2],t[0]*r[1]-t[1]*r[0]];function G(t){let r=Math.hypot(t[0],t[1],t[2]);return r===0?t:[t[0]/r,t[1]/r,t[2]/r]}function xt(t,r,n,e){let o=1/Math.tan(t/2);return new Float32Array([o/r,0,0,0,0,o,0,0,0,0,(e+n)/(n-e),-1,0,0,2*e*n/(n-e),0])}function gt(t,r,n,e,o,a){let i=r-t,s=e-n,u=a-o;return new Float32Array([2/i,0,0,0,0,2/s,0,0,0,0,-2/u,0,-(r+t)/i,-(e+n)/s,-(a+o)/u,1])}function Je(t,r,n){let e=G(le(t,r)),o=ye(n,e);if(Math.hypot(o[0],o[1],o[2])<1e-8)return qe();let a=G(o),i=ye(e,a);return new Float32Array([a[0],i[0],e[0],0,a[1],i[1],e[1],0,a[2],i[2],e[2],0,-Ke(a,t),-Ke(i,t),-Ke(e,t),1])}function Ur(t,r){let n=[0,1,2,3].map(o=>t[0+o]*r[0]+t[4+o]*r[1]+t[8+o]*r[2]+t[12+o]),e=n[3];return{x:n[0]/e,y:n[1]/e,z:n[2]/e,w:e}}function xe(t,r,n,e){let o=Ur(t,r);return{sx:(o.x*.5+.5)*n,sy:(1-(o.y*.5+.5))*e,behind:o.w<=0}}function Or(t){return t<=.04045?t/12.92:Math.pow((t+.055)/1.055,2.4)}function Tt(t){return t<=.0031308?t*12.92:1.055*Math.pow(t,1/2.4)-.055}var Vn=/^#?([0-9a-fA-F]{6})$/;function I(t){let r=Vn.exec(t.trim());if(!r)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(t)}`);let n=r[1];return[0,2,4].map(e=>Or(parseInt(n.slice(e,e+2),16)/255))}function Rt(t){return`#${t.map(n=>{let e=Tt(Math.min(1,Math.max(0,n)));return Math.round(e*255).toString(16).padStart(2,"0")}).join("")}`}var ge={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},At=Object.freeze(Object.fromEntries(Object.keys(ge).map(t=>[t,I(ge[t])])));var Br=.4;var Ft=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${Br.toFixed(2)}); }`,Mt=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function St(){let t=[];for(let r of Object.keys(ge)){let n=ge[r].toLowerCase(),e=Rt(At[r]).toLowerCase();e!==n&&t.push({key:r,expected:n,actual:e})}return t}function Xn(t){let r=[1/0,1/0,1/0],n=[-1/0,-1/0,-1/0];for(let e=0;e<t.length;e+=3)for(let o=0;o<3;o++){let a=t[e+o];a<r[o]&&(r[o]=a),a>n[o]&&(n[o]=a)}return t.length===0?{min:[0,0,0],max:[0,0,0]}:{min:r,max:n}}function Ir(t,r,n,e){let o=new Float32Array(t.length);for(let i=0;i<e.length;i+=3){let s=e[i],u=e[i+1],d=e[i+2],m=s*3,c=u*3,l=d*3,b=s*2,f=u*2,E=d*2,y=t[c]-t[m],x=t[c+1]-t[m+1],p=t[c+2]-t[m+2],T=t[l]-t[m],g=t[l+1]-t[m+1],R=t[l+2]-t[m+2],M=n[f]-n[b],N=n[f+1]-n[b+1],_e=n[E]-n[b],ee=n[E+1]-n[b+1],$=M*ee-_e*N;if(Math.abs($)<1e-12)continue;let X=1/$,Cn=(y*ee-T*N)*X,kn=(x*ee-g*N)*X,Hn=(p*ee-R*N)*X;for(let Ee of[m,c,l])o[Ee]=o[Ee]+Cn,o[Ee+1]=o[Ee+1]+kn,o[Ee+2]=o[Ee+2]+Hn}let a=new Float32Array(t.length);for(let i=0;i<a.length;i+=3){let s=r[i],u=r[i+1],d=r[i+2],m=o[i],c=o[i+1],l=o[i+2],b=m*s+c*u+l*d;m-=s*b,c-=u*b,l-=d*b;let f=Math.hypot(m,c,l);f<1e-8&&(Math.abs(s)<.9?(m=0,c=-d,l=u):(m=-d,c=0,l=s),f=Math.hypot(m,c,l)||1),a[i]=m/f,a[i+1]=c/f,a[i+2]=l/f}return a}function Cr(t,r){let n=new Float32Array(t.length);for(let e=0;e<r.length;e+=3){let o=r[e]*3,a=r[e+1]*3,i=r[e+2]*3,s=t[a]-t[o],u=t[a+1]-t[o+1],d=t[a+2]-t[o+2],m=t[i]-t[o],c=t[i+1]-t[o+1],l=t[i+2]-t[o+2],b=u*l-d*c,f=d*m-s*l,E=s*c-u*m;for(let y of[o,a,i])n[y]=n[y]+b,n[y+1]=n[y+1]+f,n[y+2]=n[y+2]+E}for(let e=0;e<n.length;e+=3){let o=Math.hypot(n[e],n[e+1],n[e+2]);o>0&&(n[e]=n[e]/o,n[e+1]=n[e+1]/o,n[e+2]=n[e+2]/o)}return n}function zn(t,r,n,e,o){let{min:a,max:i}=Xn(t),s=e??Cr(t,n);return{positions:t,normals:s,uvs:r,indices:n,min:a,max:i,tangents:o??Ir(t,s,r,n)}}function j(t=1,r=1,n=1){let e=t/2,o=r/2,a=n/2,i=[[[-e,-o,a],[e,-o,a],[e,o,a],[-e,o,a]],[[e,-o,-a],[-e,-o,-a],[-e,o,-a],[e,o,-a]],[[e,-o,a],[e,-o,-a],[e,o,-a],[e,o,a]],[[-e,-o,-a],[-e,-o,a],[-e,o,a],[-e,o,-a]],[[-e,o,a],[e,o,a],[e,o,-a],[-e,o,-a]],[[-e,-o,-a],[e,-o,-a],[e,-o,a],[-e,-o,a]]],s=new Float32Array(72),u=new Float32Array(48),d=new Uint16Array(36),m=0,c=0,l=0,b=0;for(let f of i){for(let[E,y,x]of f)s[m++]=E,s[m++]=y,s[m++]=x;u[c++]=0,u[c++]=0,u[c++]=1,u[c++]=0,u[c++]=1,u[c++]=1,u[c++]=0,u[c++]=1,d[l++]=b,d[l++]=b+1,d[l++]=b+2,d[l++]=b,d[l++]=b+2,d[l++]=b+3,b+=4}return zn(s,u,d)}function Y(t){return t.indices.length/3}function Wn(t){if(!Number.isFinite(t)||t===0)return"0";let r=t.toFixed(12).replace(/0+$/,"").replace(/\.$/,"");return r==="-0"?"0":r}function kr(t,r,n,e){let[o,a]=t,[i,s]=r,[u,d]=n,[m,c]=e,l=o-i+u-m,b=a-s+d-c;if(Math.abs(l)<1e-9&&Math.abs(b)<1e-9){let R=[i-o,m-o,o,s-a,c-a,a,0,0,1],M=R[0]*R[4]-R[1]*R[3];return Math.abs(M)<1e-9?null:R}let f=i-u,E=m-u,y=s-d,x=c-d,p=f*x-E*y;if(Math.abs(p)<1e-9)return null;let T=(l*x-E*b)/p,g=(f*b-l*y)/p;return[i-o+T*i,m-o+g*m,o,s-a+T*s,c-a+g*c,a,T,g,1]}function et(t,r,n,e,o,a){if(!(o>0)||!(a>0))return{refusal:"EMPTY_ELEMENT_BOX"};let s=[r.topLeft,r.topRight,r.bottomRight,r.bottomLeft].map(X=>xe(t,X,n,e));if(s.some(X=>X.behind))return{refusal:"CORNER_BEHIND_CAMERA"};let u=s.map(X=>({x:X.sx,y:X.sy})),[d,m,c,l]=u,b=kr([d.x,d.y],[m.x,m.y],[c.x,c.y],[l.x,l.y]);if(!b)return{refusal:"DEGENERATE_ON_SCREEN"};let f=.5*(d.x*m.y-m.x*d.y+(m.x*c.y-c.x*m.y)+(c.x*l.y-l.x*c.y)+(l.x*d.y-d.x*l.y)),E=1/o,y=1/a,[x,p,T,g,R,M,N,_e,ee]=b;return{transform:`matrix3d(${[x*E,g*E,0,N*E,p*y,R*y,0,_e*y,0,0,1,0,T,M,0,ee].map(Wn).join(", ")})`,matrix:b,screen:u,signedArea:f}}function Te(t){return"refusal"in t}function vt(t,r,n,e,o,a,i=0){let s=Math.cos(a),u=Math.sin(a),d=(c,l)=>[t+s*c+u*i,n+l,r-u*c+s*i],m=e/2;return{topLeft:d(-m,o),topRight:d(m,o),bottomRight:d(m,0),bottomLeft:d(-m,0)}}function tt(t,r,n,e){let o=-1/0,a=1/0;for(let i=0;i<3;i++){let s=r[i],u=t[i],d=n[i],m=e[i];if(Math.abs(s)<1e-12){if(u<d||u>m)return null;continue}let c=1/s,l=(d-u)*c,b=(m-u)*c;if(l>b){let f=l;l=b,b=f}if(l>o&&(o=l),b<a&&(a=b),o>a)return null}return a<0?null:{tNear:Math.max(0,o),tFar:a}}function rt(t,r,n){if(!(t>0)||!(r>0))return{steps:0,step:0,truncated:!1};let e=Math.ceil(t/r),o=Math.min(Math.max(1,e),Math.max(1,Math.floor(n)));return{steps:o,step:r,truncated:e>o}}var Hr=`
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
`,$n=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,jn=`#version 300 es
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
${Hr}

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
}`;function Dt(t,r,n,e){let o=t.gl,a=Math.max(2,Math.floor(r)),i=Math.max(2,Math.floor(n)),s=Math.max(2,Math.floor(e));if(!o.getExtension("OES_texture_float_linear"))return D("MISSING_EXTENSION","the volume needs OES_texture_float_linear for trilinear sampling of the density grid \u2014 without it a float sampler3D silently falls back to NEAREST and the field renders as voxel blocks");let u=t.compile($n,jn);if("kind"in u)return u;let d=o.createTexture();o.bindTexture(o.TEXTURE_3D,d),o.texStorage3D(o.TEXTURE_3D,1,o.R32F,a,i,s),o.texParameteri(o.TEXTURE_3D,o.TEXTURE_MIN_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_3D,o.TEXTURE_MAG_FILTER,o.LINEAR);for(let l of[o.TEXTURE_WRAP_S,o.TEXTURE_WRAP_T,o.TEXTURE_WRAP_R])o.texParameteri(o.TEXTURE_3D,l,o.CLAMP_TO_EDGE);o.bindTexture(o.TEXTURE_3D,null);let m=o.createVertexArray(),c=l=>o.getUniformLocation(u,l);return{size:[a,i,s],upload(l){let b=a*i*s,f=l.length===b?l:(()=>{let E=new Float32Array(b);return E.set(l.subarray(0,Math.min(b,l.length))),E})();o.bindTexture(o.TEXTURE_3D,d),o.texSubImage3D(o.TEXTURE_3D,0,0,0,0,a,i,s,o.RED,o.FLOAT,f),o.bindTexture(o.TEXTURE_3D,null)},draw(l){o.useProgram(u),o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_3D,d),o.uniform1i(c("uDensity"),0),o.activeTexture(o.TEXTURE1),o.bindTexture(o.TEXTURE_2D,l.sceneDepth),o.uniform1i(c("uSceneDepth"),1),o.uniform3fv(c("uBoxMin"),l.boxMin),o.uniform3fv(c("uBoxMax"),l.boxMax),o.uniform3fv(c("uEye"),l.eye),o.uniform3fv(c("uForward"),l.forward),o.uniform3fv(c("uRight"),l.right),o.uniform3fv(c("uUp"),l.up),o.uniform1f(c("uTanHalfFov"),Math.tan(l.fovDeg*Math.PI/360)),o.uniform1f(c("uAspect"),l.aspect),o.uniform1f(c("uNear"),l.near),o.uniform1f(c("uFar"),l.far),o.uniform1f(c("uWorldStep"),l.worldStep??.06),o.uniform1i(c("uMaxSteps"),Math.min(256,l.maxSteps??128)),o.uniform1f(c("uDensityScale"),l.densityScale??1),o.uniform3fv(c("uColourLow"),l.colourLow),o.uniform3fv(c("uColourHigh"),l.colourHigh),o.uniform3fv(c("uLightDir"),l.lightDir),o.uniform1f(c("uLightSteps"),Math.min(16,Math.max(0,l.lightSteps??6))),o.uniform1f(c("uEmission"),Math.min(1,Math.max(0,l.emission??.25))),o.enable(o.BLEND),o.blendFunc(o.ONE,o.ONE_MINUS_SRC_ALPHA),o.disable(o.DEPTH_TEST),o.depthMask(!1),o.bindVertexArray(m),o.drawArrays(o.TRIANGLES,0,3),o.bindVertexArray(null),o.depthMask(!0),o.disable(o.BLEND),o.activeTexture(o.TEXTURE1),o.bindTexture(o.TEXTURE_2D,null),o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_3D,null)},dispose(){o.deleteTexture(d),o.deleteVertexArray(m),o.deleteProgram(u)}}}var _t=["minimum","reduced","full"],Yn={full:{dprScale:2,ao:!0,aoScale:.5,dof:!0,shadowMapSize:1536,shadowTaps:9,particleCapacity:4096,volumeMaxSteps:128,volumeLightSteps:6},reduced:{dprScale:2,ao:!0,aoScale:.5,dof:!1,shadowMapSize:1024,shadowTaps:9,particleCapacity:2048,volumeMaxSteps:96,volumeLightSteps:4},minimum:{dprScale:1,ao:!1,aoScale:.5,dof:!1,shadowMapSize:512,shadowTaps:1,particleCapacity:512,volumeMaxSteps:48,volumeLightSteps:0}};function nt(t,r){let n=Number.isFinite(r)&&r>0?r:1024,o=n*(t==="full"?1:t==="reduced"?.5:.25),a=2**Math.round(Math.log2(o));return Math.max(256,Math.min(n,a))}function wt(t){return{tier:t,...Yn[t]}}var Lt=89,Nt=Math.PI/180;function ot(t){let r=Math.max(-Lt,Math.min(Lt,t.elevationDeg))*Nt,n=t.azimuthDeg*Nt,e=Math.max(1e-4,t.distance),o=Math.sin(r)*e,a=Math.cos(r)*e;return[t.target[0]+Math.sin(n)*a,t.target[1]+o,t.target[2]+Math.cos(n)*a]}function at(t,r){let n=ot(t),e=t.near??Math.max(.01,t.distance/100),o=t.far??Math.max(e+1,t.distance*8),a=xt((t.fovDeg??38)*Nt,Math.max(.001,r),e,o),i=Je(n,t.target,[0,1,0]);return Ze(a,i)}function Pt(t,r,n){let e=G(t.direction),o=t.extent??Math.max(.1,n*1.35),a=Math.max(1,n*2),i=[r[0]-e[0]*a,r[1]-e[1]*a,r[2]-e[2]*a],s=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],u=Je(i,r,s),d=gt(-o,o,-o,o,.01,a+n*2+o);return Ze(d,u)}function Ut(t,r){let n=le([r[0],r[1],r[2]],[t[0],t[1],t[2]]);return Math.hypot(n[0],n[1],n[2])/2}function Ot(t,r){return[(t[0]+r[0])/2,(t[1]+r[1])/2,(t[2]+r[2])/2]}function we(t,r,n){let{gl:e}=t,o=Math.max(1,Math.floor(r)),a=Math.max(1,Math.floor(n)),i=e.createFramebuffer(),s=e.createTexture(),u=e.createTexture();if(!i||!s||!u)return D("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let d=t.hdr?e.RGBA16F:e.RGBA8,m=t.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,c=()=>{e.bindTexture(e.TEXTURE_2D,s),e.texImage2D(e.TEXTURE_2D,0,d,o,a,0,e.RGBA,m,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,u),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,o,a,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,s,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,u,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};c(),e.bindFramebuffer(e.FRAMEBUFFER,i);let l=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),l!==e.FRAMEBUFFER_COMPLETE?D("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${l.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:s,depthTexture:u,get width(){return o},get height(){return a},bind(){e.bindFramebuffer(e.FRAMEBUFFER,i),e.viewport(0,0,o,a)},resize(b,f){let E=Math.max(1,Math.floor(b)),y=Math.max(1,Math.floor(f));E===o&&y===a||(o=E,a=y,c())},dispose(){e.deleteFramebuffer(i),e.deleteTexture(s),e.deleteTexture(u)}}}function Bt(t,r=1024){let{gl:n}=t,e=Math.max(256,Math.min(2048,Math.floor(r))),o=n.createFramebuffer(),a=n.createTexture();if(!o||!a)return D("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");n.bindTexture(n.TEXTURE_2D,a),n.texImage2D(n.TEXTURE_2D,0,n.DEPTH_COMPONENT24,e,e,0,n.DEPTH_COMPONENT,n.UNSIGNED_INT,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.bindFramebuffer(n.FRAMEBUFFER,o),n.framebufferTexture2D(n.FRAMEBUFFER,n.DEPTH_ATTACHMENT,n.TEXTURE_2D,a,0);let i=n.checkFramebufferStatus(n.FRAMEBUFFER);return n.bindFramebuffer(n.FRAMEBUFFER,null),i!==n.FRAMEBUFFER_COMPLETE?D("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:e,bind(){n.bindFramebuffer(n.FRAMEBUFFER,o),n.viewport(0,0,e,e)},dispose(){n.deleteFramebuffer(o),n.deleteTexture(a)}}}var Ct=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,It={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function Gr(t,r,n={}){let e=n.zenith??It.zenith,o=n.horizon??It.horizon,a=n.ground??It.ground;t.uniform3f(t.getUniformLocation(r,"uSkyZenith"),e[0],e[1],e[2]),t.uniform3f(t.getUniformLocation(r,"uSkyHorizon"),o[0],o[1],o[2]),t.uniform3f(t.getUniformLocation(r,"uSkyGround"),a[0],a[1],a[2])}var Yo=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${Ct}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;var Vr=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,kt=`#version 300 es
precision highp float;
void main(){}`,Qn=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,Xr=`#version 300 es
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
}`,zr=`#version 300 es
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
${Ct}

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
}`;function Q(t,r){let{gl:n}=t,e=n.createVertexArray(),o=n.createBuffer(),a=n.createBuffer(),i=n.createBuffer(),s=n.createBuffer();return!e||!o||!a||!i||!s?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(n.bindVertexArray(e),n.bindBuffer(n.ARRAY_BUFFER,o),n.bufferData(n.ARRAY_BUFFER,r.positions,n.STATIC_DRAW),n.enableVertexAttribArray(0),n.vertexAttribPointer(0,3,n.FLOAT,!1,0,0),n.bindBuffer(n.ARRAY_BUFFER,a),n.bufferData(n.ARRAY_BUFFER,r.normals,n.STATIC_DRAW),n.enableVertexAttribArray(1),n.vertexAttribPointer(1,3,n.FLOAT,!1,0,0),n.bindBuffer(n.ARRAY_BUFFER,i),n.bufferData(n.ARRAY_BUFFER,r.tangents,n.STATIC_DRAW),n.enableVertexAttribArray(2),n.vertexAttribPointer(2,3,n.FLOAT,!1,0,0),n.bindBuffer(n.ELEMENT_ARRAY_BUFFER,s),n.bufferData(n.ELEMENT_ARRAY_BUFFER,r.indices,n.STATIC_DRAW),n.bindVertexArray(null),{vao:e,indexCount:r.indices.length,indexType:r.indices instanceof Uint32Array?n.UNSIGNED_INT:n.UNSIGNED_SHORT,dispose(){n.deleteVertexArray(e),n.deleteBuffer(o),n.deleteBuffer(a),n.deleteBuffer(i),n.deleteBuffer(s)}})}function Ht(t){let{gl:r}=t,n=t.compile(Vr,kt);if("kind"in n)return n;let e=t.compile(Xr,zr);if("kind"in e)return e;let o=t.compile(Qn,kt);if("kind"in o)return o;let a=(i,s)=>r.getUniformLocation(i,s);return{shadowPass(i,s,u,d){let m=d??(()=>{});u.bind(),m("shadow.bind"),r.clear(r.DEPTH_BUFFER_BIT),r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.FRONT),r.useProgram(n),m("useProgram(shadow)"),r.uniformMatrix4fv(a(n,"uLightVP"),!1,i),m("uLightVP");for(let c of s)r.uniformMatrix4fv(a(n,"uModel"),!1,c.model),m("shadow uModel"),r.bindVertexArray(c.mesh.vao),m("shadow bindVAO"),r.drawElements(r.TRIANGLES,c.mesh.indexCount,c.mesh.indexType,0),m("shadow drawElements");r.bindVertexArray(null),r.cullFace(r.BACK)},depthPrepass(i,s){r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.colorMask(!1,!1,!1,!1),r.useProgram(o),r.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let u of s)r.uniformMatrix4fv(a(o,"uModel"),!1,u.model),r.bindVertexArray(u.mesh.vao),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0);r.bindVertexArray(null),r.colorMask(!0,!0,!0,!0)},draw(i){let s=i.onStep??(()=>{});if(r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.useProgram(e),r.uniformMatrix4fv(a(e,"uViewProj"),!1,i.viewProj),s("uViewProj"),r.uniform3fv(a(e,"uEye"),i.eye),s("uEye"),r.uniform3fv(a(e,"uLightDir"),i.lightDir),s("uLightDir"),r.uniform3fv(a(e,"uLightColour"),i.lightColour),s("uLightColour"),r.uniform1f(a(e,"uAmbientGain"),i.ambientGain??1),s("uAmbientGain"),i.fog&&i.fog.density>0){r.uniform1f(a(e,"uFogDensity"),i.fog.density),r.uniform1f(a(e,"uFogHeight"),i.fog.height),r.uniform1f(a(e,"uFogFloor"),i.fog.floor??0);let u=i.fog.colour;u==="sky"?r.uniform3f(a(e,"uFogColour"),-1,-1,-1):r.uniform3f(a(e,"uFogColour"),u[0],u[1],u[2]),s("fog")}else r.uniform1f(a(e,"uFogDensity"),0);Gr(r,e,i.sky),s("bindSky"),i.ao&&i.screenSize?(r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,i.ao),r.uniform1i(a(e,"uAO"),1),r.uniform2f(a(e,"uScreenSize"),i.screenSize[0],i.screenSize[1]),r.uniform1f(a(e,"uAOEnabled"),1)):r.uniform1f(a(e,"uAOEnabled"),0),s("bindAO"),r.uniformMatrix4fv(a(e,"uLightVP"),!1,i.lightVP),s("lit uLightVP"),i.shadow?(r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,i.shadow.depthTexture),r.uniform1i(a(e,"uShadowMap"),0),r.uniform1f(a(e,"uShadowTexel"),1/i.shadow.size),r.uniform1f(a(e,"uShadowStrength"),i.shadowStrength??1)):r.uniform1f(a(e,"uShadowStrength"),0);for(let u of i.draws)r.uniformMatrix4fv(a(e,"uModel"),!1,u.model),r.uniformMatrix3fv(a(e,"uNormalMat"),!1,u.normalMat),s("uNormalMat"),r.uniform3fv(a(e,"uBaseColour"),u.material.baseColour),s("uBaseColour"),r.uniform1f(a(e,"uRoughness"),u.material.roughness),r.uniform1f(a(e,"uMetalness"),u.material.metalness),r.uniform1f(a(e,"uAnisotropy"),u.material.anisotropy??0),r.bindVertexArray(u.mesh.vao),s("lit bindVAO"),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0),s("lit drawElements");r.bindVertexArray(null),r.disable(r.CULL_FACE)},dispose(){r.deleteProgram(n),r.deleteProgram(e),r.deleteProgram(o)}}}var Gt=`
uniform sampler2D uDepth;
uniform vec2 uNearFar;
uniform float uTanHalfFov;
uniform float uAspect;

float linearDepthAt(vec2 uv) {
  float d = texture(uDepth, uv).r * 2.0 - 1.0;
  float n = uNearFar.x, f = uNearFar.y;
  return (2.0 * n * f) / (f + n - d * (f - n));
}

vec3 viewPosAt(vec2 uv) {
  float z = linearDepthAt(uv);
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x * uTanHalfFov * uAspect * z, ndc.y * uTanHalfFov * z, -z);
}`,Wr=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Kn=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${Gt}

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
}`,qn=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${Gt}

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
}`;function Vt(t,r,n){let{gl:e}=t,o=t.compile(Wr,Kn);if("kind"in o)return o;let a=t.compile(Wr,qn);if("kind"in a)return a;let i=Math.max(1,r>>1),s=Math.max(1,n>>1),u=()=>{let f=e.createFramebuffer(),E=e.createTexture();return!f||!E?null:{fb:f,tex:E}},d=u(),m=u();if(!d||!m)return D("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let c=()=>{for(let f of[d,m])e.bindTexture(e.TEXTURE_2D,f.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,i,s,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,f.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,f.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};c(),e.bindFramebuffer(e.FRAMEBUFFER,d.fb);let l=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),l!==e.FRAMEBUFFER_COMPLETE)return D("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${l.toString(16)}).`);let b=(f,E,y,x,p,T,g)=>{e.activeTexture(e.TEXTURE0+g),e.bindTexture(e.TEXTURE_2D,E),e.uniform1i(e.getUniformLocation(f,"uDepth"),g),e.uniform2f(e.getUniformLocation(f,"uNearFar"),y,x),e.uniform1f(e.getUniformLocation(f,"uTanHalfFov"),Math.tan(p*Math.PI/360)),e.uniform1f(e.getUniformLocation(f,"uAspect"),T)};return{get texture(){return d.tex},get width(){return i},get height(){return s},compute(f){e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,d.fb),e.viewport(0,0,i,s),e.useProgram(o),b(o,f.depthTexture,f.near,f.far,f.fovDeg,f.aspect,0),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/i,1/s),e.uniform1f(e.getUniformLocation(o,"uRadius"),f.radius??.55),e.uniform1f(e.getUniformLocation(o,"uStrength"),f.strength??1.15),e.uniform1f(e.getUniformLocation(o,"uBias"),f.bias??.035),t.blit(o);for(let[E,y,x]of[[d,m,[1,0]],[m,d,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,y.fb),e.viewport(0,0,i,s),e.useProgram(a),b(a,f.depthTexture,f.near,f.far,f.fovDeg,f.aspect,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,E.tex),e.uniform1i(e.getUniformLocation(a,"uAO"),1),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/i,1/s),e.uniform2f(e.getUniformLocation(a,"uDir"),x[0],x[1]),t.blit(a);e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(f,E){let y=Math.max(1,f>>1),x=Math.max(1,E>>1);y===i&&x===s||(i=y,s=x,c())},dispose(){e.deleteProgram(o),e.deleteProgram(a);for(let f of[d,m])e.deleteFramebuffer(f.fb),e.deleteTexture(f.tex)}}}var ae=new URLSearchParams(location.search),en=ae.get("vol")!=="0",br=ae.get("depth")!=="0",hr=_t.includes(ae.get("tier")??"")?ae.get("tier"):"full",qt=wt(hr),Zt=ae.get("ao")!=="0"&&qt.ao,ze=Math.max(1,Math.min(3,Number(ae.get("scale")??1))),tn=Number(ae.get("frames")??300),P=1200*ze,U=720*ze,Fe=document.getElementById("c");Fe.width=P;Fe.height=U;var pr=document.getElementById("log");function Er(t){document.title="REFUSED",pr.textContent=t;let[r,...n]=t.split(":");throw rn?.showRefusal(r?.trim()??"REFUSED",n.join(":").trim()||t),new Error(t)}var rn=null;function L(t,r){return"kind"in r&&Er(`${t}: ${r.code} \u2014 ${r.reason} ${r.detail??""}`),r}var O=["PAID_SEARCH","PAID_SOCIAL","INFLUENCER","EMAIL","PR_EARNED","AFFILIATE","COMMUNITY"],ve=["ADVISORY","ELEVATED","SEVERE"],S=28,Zn=[.05,.07,.04,.025,.02,.055,.045],We=[{ch:0,day:1,band:1,w:.3},{ch:3,day:2,band:1,w:.25},{ch:6,day:3,band:1,w:.2},{ch:2,day:4,band:1,w:.5},{ch:2,day:5,band:1,w:.8},{ch:2,day:6,band:2,w:.7},{ch:2,day:7,band:2,w:1},{ch:2,day:8,band:2,w:.9},{ch:2,day:9,band:1,w:.6},{ch:2,day:10,band:1,w:.35},{ch:1,day:6,band:1,w:.4},{ch:1,day:7,band:1,w:.75},{ch:1,day:8,band:2,w:.85},{ch:1,day:9,band:2,w:1.05},{ch:1,day:10,band:2,w:.8},{ch:1,day:11,band:1,w:.5},{ch:1,day:12,band:1,w:.3},{ch:6,day:8,band:1,w:.3},{ch:6,day:9,band:1,w:.55},{ch:6,day:10,band:2,w:.7},{ch:6,day:11,band:2,w:.95},{ch:6,day:12,band:2,w:.75},{ch:6,day:13,band:1,w:.45},{ch:6,day:14,band:1,w:.25},{ch:4,day:10,band:1,w:.35},{ch:4,day:11,band:1,w:.6},{ch:4,day:12,band:2,w:.8},{ch:4,day:13,band:2,w:.6},{ch:4,day:14,band:1,w:.4},{ch:0,day:13,band:1,w:.45},{ch:0,day:14,band:2,w:.75},{ch:0,day:15,band:2,w:.6},{ch:0,day:16,band:1,w:.3},{ch:3,day:14,band:1,w:.4},{ch:3,day:15,band:1,w:.55},{ch:3,day:16,band:1,w:.3},{ch:5,day:24,band:1,w:.5},{ch:5,day:25,band:2,w:.7},{ch:5,day:26,band:1,w:.4}],H=[13,14,15],$e=[22,23],w=t=>H.includes(t)?"ABSENT":$e.includes(t)?"WITHHELD":"OBSERVED",J=O.map((t,r)=>Array.from({length:S},(n,e)=>{let o=[0,0,0];return w(e)==="OBSERVED"&&(o[0]=Zn[r]),o}));for(let t of We)w(t.day)==="OBSERVED"&&(J[t.ch][t.day][t.band]+=t.w);var nn=We.filter(t=>w(t.day)!=="OBSERVED"),He=0;for(let t of J)for(let r of t)for(let n of r)He=Math.max(He,n);var yr=8,Le=0,q=-1,st=null,dt=[];for(let t=0;t<S;t++){if(w(t)!=="OBSERVED"){dt.push(Le),q<0&&st===null&&(st=w(t)==="ABSENT"?"THRESHOLD_NOT_REACHED_BEFORE_UNMEASURED_DAY":"THRESHOLD_NOT_REACHED_BEFORE_WITHHELD_DAY");continue}for(let r=0;r<O.length;r++)for(let n=0;n<ve.length;n++)Le+=J[r][t][n];dt.push(Le),q<0&&Le>=yr&&(q=t,st=null)}var Jn=Math.min(...H),Jt=Math.min(...$e),xr=t=>{let r=w(t);return r==="ABSENT"?"DAY_NOT_MEASURED":r==="WITHHELD"?"DAY_WITHHELD":t>Jn?"INTEGRAL_CROSSES_UNMEASURED_DAY":t>Jt?"INTEGRAL_CROSSES_WITHHELD_DAY":"INTEGRABLE"},gr=Math.max(...Array.from({length:S},(t,r)=>r).filter(t=>xr(t)==="INTEGRABLE")),on=Nr({title:"E7 \xB7 The Storm \u2014 marketing risk by day, channel and severity",readsAs:"Depth is days ahead in the rendered view, and the opacity along any line of sight is the total risk between the viewer and that day \u2014 an accumulation a per-cell table cannot show. The front advancing across channels, the three-day hole where the monitor was down, and the two days that are measured but withheld are all shapes there and rows here. This table carries every cell; what it cannot carry is what lies between you and a day.",notices:[`SYNTHETIC RISK DATA \u2014 ${We.length} hand-authored flagged items over ${S} days. The shape is deliberate; the values are not measurements.`,`D${Math.min(...H)}-D${Math.max(...H)} were NOT MEASURED, and ${nn.length} already-scheduled flagged items landed inside them: their weight is in no cell below and is not zero. Every cumulative figure past that day is REFUSED.`],columns:[{key:"day",label:"Day"},{key:"state",label:"State"},{key:"reading",label:"Cumulative reading"},{key:"advisory",label:"Advisory",numeric:!0},{key:"elevated",label:"Elevated",numeric:!0},{key:"severe",label:"Severe",numeric:!0},{key:"total",label:"Day total",numeric:!0},{key:"cumulative",label:"Cumulative",numeric:!0}],rows:Array.from({length:S},(t,r)=>{let n=w(r),e=n==="OBSERVED",o=xr(r),a=s=>e?Number(O.reduce((u,d,m)=>u+J[m][r][s],0).toFixed(3)):null,i=e?Number(ve.reduce((s,u,d)=>s+O.reduce((m,c,l)=>m+J[l][r][d],0),0).toFixed(3)):null;return{day:`D${r}`,state:n,reading:o==="INTEGRABLE"?"integrable":o,advisory:a(0),elevated:a(1),severe:a(2),total:i,cumulative:o==="INTEGRABLE"?Number(dt[r].toFixed(2)):null}})});rn=on;ae.get("refuse")==="1"&&Er("FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. The volumetric field is not being drawn.");var ut=yt(Fe,{alpha:!1});Et(ut)||Er(`stage: ${ut.code} \u2014 ${ut.reason}`);var F=ut,h=F.gl,an=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,eo=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${Ft}
${Mt}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,to=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uVolume;
out vec4 frag;
void main(){ frag = texture(uVolume, vUv); }`,ro=L("present",F.compile(an,eo)),no=L("composite",F.compile(an,to)),Xt=L("lit",Ht(F)),Re=L("target",we(F,P,U)),$r=L("volume target",we(F,P,U)),sn=L("far depth",we(F,4,4)),er=L("shadow",Bt(F,nt(hr,1536))),jr=L("ao",Vt(F,P,U));sn.bind();h.clearDepth(1);h.clear(h.DEPTH_BUFFER_BIT);h.bindFramebuffer(h.FRAMEBUFFER,null);var V=.5,Tr=2.6,oo=S*V,Me=.62,De=.46,Ge=.025,te=V*.78,z=.56,B=Ge/2,W=t=>(t-(O.length-1)/2)*Me,k=W(O.length-1)+De/2,ce=W(0)-De/2-.03-z/2,Rr=ce-z/2,mt=(Rr+k)/2,v=t=>-Tr-t*V,je=t=>v(t)-V/2,Ye=.6,ht=B+.02,un=ht+ve.length*Ye,ln=t=>ht+(t+.5)*Ye,A=[-k,ht,v(S)],_=[k,un,v(0)],Qe=.7,Ar=He*Qe/V,ie=76,se=42,be=112,cn=(t,r,n)=>t+ie*(r+se*n),ao=t=>{for(let r=0;r<O.length;r++)if(Math.abs(t-W(r))<=De/2)return r;return-1},io=t=>{let r=Math.floor((-t-Tr)/V);return r>=0&&r<S?r:-1},so=t=>{let r=Math.floor((t-ht)/Ye);return r>=0&&r<ve.length?r:-1},uo=.62,lo=(t,r,n)=>{let e=ao(t);if(e<0)return 0;let o=io(n);if(o<0||w(o)!=="OBSERVED")return 0;let a=so(r);if(a<0)return 0;let i=Math.abs(r-ln(a))/(Ye/2),s=Math.max(0,Math.min(1,(1-i)/(1-uo)));return s<=0?0:J[e][o][a]*s/He},me=new Float32Array(ie*se*be);for(let t=0;t<be;t++){let r=A[2]+(t+.5)/be*(_[2]-A[2]);for(let n=0;n<se;n++){let e=A[1]+(n+.5)/se*(_[1]-A[1]);for(let o=0;o<ie;o++){let a=A[0]+(o+.5)/ie*(_[0]-A[0]);me[cn(o,n,t)]=lo(a,e,r)}}}var tr=1/0,rr=-1/0,dn=0,nr=0;for(let t of me)t<tr&&(tr=t),t>rr&&(rr=t),dn+=t,t>0&&nr++;var de=en?Dt(F,ie,se,be):null,or=de&&"kind"in de?`${de.code} \u2014 ${de.reason}`:null,Se=de&&!("kind"in de)?de:null;Se&&Se.upload(me);var Ne=.125,Pe=128,ar=2.5,ir=32,re={target:[mt,.366,je(5.13)],distance:10,azimuthDeg:0,elevationDeg:21.3,fovDeg:33,near:ar,far:ir},C=ot(re),Z=G(le(re.target,C)),Ue=G(ye(Z,[0,1,0])),lt=G(ye(Ue,Z)),Ae=Math.tan((re.fovDeg??36)*Math.PI/360),fe=P/U,mn=j(De,Ge,te),fn=j(z,Ge,te),bn=j(2*k,.42,te),hn=j(2*k+z+.06,.1,.05),pn=j(2*k,.07,.05),En=j(2*k,.11,.05),yn=j(.075,1.05,.075),xn=L("tile",Q(F,mn)),gn=L("gutter",Q(F,fn)),Tn=L("lid",Q(F,bn)),Rn=L("rail",Q(F,hn)),An=L("week bar",Q(F,pn)),Fn=L("gate",Q(F,En)),Mn=L("post",Q(F,yn)),co=new Float32Array([1,0,0,0,1,0,0,0,1]),mo=(t,r,n)=>{let e=qe();return e[12]=t,e[13]=r,e[14]=n,e},K={tile:{baseColour:I("#22315A"),roughness:.74,metalness:.03},gutter:{baseColour:I("#131E36"),roughness:.84,metalness:0},withheldTile:{baseColour:I("#1B2540"),roughness:.55,metalness:.1},lid:{baseColour:I("#6B7A99"),roughness:.62,metalness:.35},rail:{baseColour:I("#6B7A99"),roughness:.58,metalness:.25},week:{baseColour:I("#26355A"),roughness:.6,metalness:.05},gate:{baseColour:I("#2C6BFF"),roughness:.52,metalness:.06}},Fr=[],Oe=[],ne=(t,r,n,e,o,a,i,s)=>{Oe.push({mesh:i,model:mo(t,r,n),normalMat:co,material:s}),Fr.push({min:[t-e/2,r-o/2,n-a/2],max:[t+e/2,r+o/2,n+a/2]})},Sn=0,vn=0;for(let t=0;t<S;t++){let r=w(t),n=je(t);if(r==="ABSENT"){vn+=O.length+1;continue}ne(ce,0,n,z,Ge,te,gn,K.gutter);for(let e=0;e<O.length;e++)ne(W(e),0,n,De,Ge,te,xn,r==="WITHHELD"?K.withheldTile:K.tile);Sn+=O.length+1,r==="WITHHELD"&&ne(0,B+.21,n,2*k,.42,te,Tn,K.lid)}var fo=[v(Math.min(...H))+.02,v(Math.max(...H)+1)-.02];for(let t of fo){ne(mt,B+.05,t,2*k+z+.06,.1,.05,Rn,K.rail);for(let r=0;r<=O.length;r++)ne(W(0)-Me/2+r*Me,B+.525,t,.075,1.05,.075,Mn,K.rail)}var Mr=[7,14,21,28],Dn=Mr.filter(t=>w(t-1)!=="ABSENT"&&w(Math.min(t,S-1))!=="ABSENT");for(let t of Dn)ne(0,B+.035,v(t),2*k,.07,.05,An,K.week);if(q>=0){let t=v(q);ne(0,B+.055,t,2*k,.11,.05,Fn,K.gate);for(let r=0;r<=O.length;r++)ne(W(0)-Me/2+r*Me,B+.525,t,.075,1.05,.075,Mn,K.gate)}var sr=[.44,-.66,-.61],Yr=[Rr-.2,0,v(S)-.3],Qr=[k+.2,un,-Tr+.3],Kr=Pt({direction:sr,colour:[1,1,1],extent:9.5},Ot(Yr,Qr),Ut(Yr,Qr)),bo=Oe.reduce((t,r)=>t+(r.mesh===xn?Y(mn):r.mesh===gn?Y(fn):r.mesh===Tn?Y(bn):r.mesh===Rn?Y(hn):r.mesh===An?Y(pn):r.mesh===Fn?Y(En):Y(yn)),0),zt=I("#070B14"),ho={zenith:[.01,.014,.03],horizon:[.03,.044,.08],ground:[.006,.007,.012]},Wt=I("#2C6BFF"),$t=I("#FF8A3D"),po=[Wt[0]*.55,Wt[1]*.55,Wt[2]*.55],Eo=[$t[0]*1.45,$t[1]*1.45,$t[2]*1.45],_n=V/Qe,yo=J.reduce((t,r)=>t+r.reduce((n,e)=>n+e.filter(o=>o>_n).length,0),0);function Ve(t=br){let r=at(re,fe);Xt.shadowPass(Kr,Oe,er),Re.bind(),h.clearColor(zt[0],zt[1],zt[2],1),h.clear(h.COLOR_BUFFER_BIT|h.DEPTH_BUFFER_BIT),Xt.depthPrepass(r,Oe),Zt&&(jr.compute({depthTexture:Re.depthTexture,near:ar,far:ir,fovDeg:re.fovDeg??36,aspect:fe,radius:.34,strength:1.15}),Re.bind()),Xt.draw({viewProj:r,eye:C,lightDir:sr,lightColour:[2.05,2,1.92],ambientGain:.62,sky:ho,lightVP:Kr,shadow:er,shadowStrength:.92,draws:Oe,ao:Zt?jr.texture:null,screenSize:[P,U]}),Se&&($r.bind(),h.clearColor(0,0,0,0),h.clear(h.COLOR_BUFFER_BIT|h.DEPTH_BUFFER_BIT),Se.draw({eye:C,forward:Z,right:Ue,up:lt,fovDeg:re.fovDeg??36,aspect:fe,near:ar,far:ir,sceneDepth:t?Re.depthTexture:sn.depthTexture,boxMin:A,boxMax:_,worldStep:Ne,maxSteps:Pe,densityScale:Ar,colourLow:po,colourHigh:Eo,lightDir:sr,lightSteps:6,emission:.26}),Re.bind(),h.enable(h.BLEND),h.blendFunc(h.ONE,h.ONE_MINUS_SRC_ALPHA),h.disable(h.DEPTH_TEST),h.activeTexture(h.TEXTURE0),h.bindTexture(h.TEXTURE_2D,$r.texture),F.blit(no,n=>h.uniform1i(h.getUniformLocation(n,"uVolume"),0)),h.disable(h.BLEND)),h.bindFramebuffer(h.FRAMEBUFFER,null),h.viewport(0,0,P,U),h.disable(h.DEPTH_TEST),h.activeTexture(h.TEXTURE0),h.bindTexture(h.TEXTURE_2D,Re.texture),F.blit(ro,n=>h.uniform1i(h.getUniformLocation(n,"uScene"),0))}function xo(t){Ve();let r=new Uint8Array(4);h.readPixels(0,0,1,1,h.RGBA,h.UNSIGNED_BYTE,r);let n=performance.now();for(let e=0;e<t;e++)Ve();return h.readPixels(0,0,1,1,h.RGBA,h.UNSIGNED_BYTE,r),(performance.now()-n)/t}var jt=xo(Math.max(1,tn));function go(){if(!Se)return{pixels:0,pct:0,meanDelta:0,maxDelta:0};let t=new Uint8Array(P*U*4),r=new Uint8Array(P*U*4);Ve(!0),h.readPixels(0,0,P,U,h.RGBA,h.UNSIGNED_BYTE,t),Ve(!1),h.readPixels(0,0,P,U,h.RGBA,h.UNSIGNED_BYTE,r);let n=0,e=0,o=0;for(let a=0;a<t.length;a+=4){let i=Math.max(Math.abs(t[a]-r[a]),Math.abs(t[a+1]-r[a+1]),Math.abs(t[a+2]-r[a+2]));i>2&&(n++,e+=i,i>o&&(o=i))}return{pixels:n,pct:Number((100*n/(P*U)).toFixed(2)),meanDelta:Number((e/Math.max(1,n)).toFixed(1)),maxDelta:o}}var it=go(),To=(t,r,n)=>{let e=(t-A[0])/(_[0]-A[0]),o=(r-A[1])/(_[1]-A[1]),a=(n-A[2])/(_[2]-A[2]);if(e<0||e>1||o<0||o>1||a<0||a>1)return 0;let i=e*ie-.5,s=o*se-.5,u=a*be-.5,d=Math.floor(i),m=Math.floor(s),c=Math.floor(u),l=i-d,b=s-m,f=u-c,E=(x,p)=>x<0?0:x>p-1?p-1:x,y=0;for(let x=0;x<2;x++)for(let p=0;p<2;p++)for(let T=0;T<2;T++){let g=(T?l:1-l)*(p?b:1-b)*(x?f:1-f);g<=0||(y+=g*me[cn(E(d+T,ie),E(m+p,se),E(c+x,be))])}return y*Ar},wn=(t,r,n)=>{let e=tt(t,r,A,_);if(!e)return{tau:0,truncated:!1,capped:!1,hit:!1,tStart:0,tEnd:0};let o=Math.min(e.tFar,n),a=n<e.tFar;if(o<=e.tNear)return{tau:0,truncated:!1,capped:a,hit:!0,tStart:e.tNear,tEnd:e.tNear};let i=rt(o-e.tNear,Ne,Pe),s=0;for(let u=0;u<i.steps;u++){let d=e.tNear+(u+.5)*i.step;if(d>o)break;let m=To(t[0]+r[0]*d,t[1]+r[1]*d,t[2]+r[2]*d);m<=5e-4||(s+=m*i.step)}return{tau:s,truncated:i.truncated,capped:a,hit:!0,tStart:e.tNear,tEnd:o}},oe=O.flatMap((t,r)=>ve.map((n,e)=>{let o=J[r].reduce((s,u,d)=>s+(w(d)==="OBSERVED"?u[e]:0),0),a=wn([W(r),ln(e),_[2]+1],[0,0,-1],1/0),i=a.tau/Qe;return{channel:t,band:n,expected:Number(o.toFixed(4)),measured:Number(i.toFixed(4)),errorPct:o>1e-6?Number((100*Math.abs(i-o)/o).toFixed(2)):0,truncated:a.truncated}})),Ro=Math.max(...oe.map(t=>t.errorPct)),Ao=Number((oe.reduce((t,r)=>t+r.errorPct,0)/oe.length).toFixed(3)),Fo=t=>{let r=1/0;for(let n of Fr){let e=tt(C,t,n.min,n.max);e&&e.tNear>0&&e.tNear<r&&(r=e.tNear)}return r},Be=61,Ie=37,Ce=0,Ln=0,Nn=0,Xe=1/0,ft=0,Pn=0,ur=0,Un=0,lr=0,Sr=0,cr=0,vr=0;for(let t=0;t<Ie;t++)for(let r=0;r<Be;r++){let n=2*(r+.5)/Be-1,e=2*(t+.5)/Ie-1,o=G([Z[0]+Ue[0]*n*Ae*fe+lt[0]*e*Ae,Z[1]+Ue[1]*n*Ae*fe+lt[1]*e*Ae,Z[2]+Ue[2]*n*Ae*fe+lt[2]*e*Ae]),a=wn(C,o,Fo(o));if(!a.hit)continue;Ce++,a.capped&&Ln++,a.truncated&&Nn++,Xe=Math.min(Xe,a.tau),ft=Math.max(ft,a.tau),Pn+=a.tau;let i=(m,c)=>C[c]+o[c]*m,s=Math.abs(i(a.tEnd,0)-i(a.tStart,0))/Me,u=Math.abs(i(a.tEnd,2)-i(a.tStart,2))/V,d=Math.abs(i(a.tEnd,1)-i(a.tStart,1))/Ye;ur=Math.max(ur,s),Un+=s,lr=Math.max(lr,u),Sr+=u,cr=Math.max(cr,d),vr+=d}Number.isFinite(Xe)||(Xe=0);var ke=t=>Number((t/Math.max(1,Ce)).toFixed(2)),bt=at(re,fe),he=P/ze,pe=U/ze,pt=document.createElement("div");pt.style.cssText=`position:relative;overflow:hidden;width:${he}px;height:${pe}px`;Fe.parentNode?.insertBefore(pt,Fe);pt.appendChild(Fe);var ue=document.createElement("div");ue.style.cssText="position:absolute;inset:0;pointer-events:none";pt.appendChild(ue);var Mo=t=>{let r=(i,s)=>Math.hypot(i.x-s.x,i.y-s.y),n=t[0],e=t[1],o=t[2],a=t[3];return{ew:Math.max(1,Math.round(Math.max(r(n,e),r(a,o)))),eh:Math.max(1,Math.round(Math.max(r(n,a),r(e,o))))}},So=26,vo=15,Yt=[],qr=(t,r,n)=>{let e=0;for(let o=0;o<4;o++){let a=t[o],i=t[(o+1)%4],s=(i.x-a.x)*(n-a.y)-(i.y-a.y)*(r-a.x);if(Math.abs(s)<1e-9)continue;let u=s>0?1:-1;if(e===0)e=u;else if(u!==e)return!1}return!0},On=(t,r,n,e)=>{let o=Math.hypot(n[0]-C[0],n[1]-C[1],n[2]-C[2]),a=et(bt,r,he,pe,100,100);if(Te(a))return{key:t,proj:a,ew:0,eh:0,distance:o,shown:!1,reason:a.refusal,widthPx:0,heightPx:0};let{ew:i,eh:s}=Mo(a.screen),u=et(bt,r,he,pe,i,s),d=a.signedArea<=0,m=e??(d?"BACK_FACING":i<So?"EDGE_ON":s<vo?"TOO_FLAT":a.screen.filter(l=>Yt.some(b=>qr(b,l.x,l.y))).length+Yt.reduce((l,b)=>l+b.filter(f=>qr(a.screen.map(E=>({x:E.x,y:E.y})),f.x,f.y)).length,0)>=2?"OCCLUDED":null),c=m===null&&!Te(u);return c&&Yt.push(a.screen.map(l=>({x:l.x,y:l.y}))),{key:t,proj:u,ew:i,eh:s,distance:o,shown:c,reason:m,widthPx:i,heightPx:s}},dr=O.map((t,r)=>{let n=vt(W(r),v(0)+.04,B+.02,De,.15,Math.atan2(C[0]-W(r),C[2]-v(0)),.01);return{...On(`ch:${t}`,n,[W(r),B+.09,v(0)+.04],null),name:t,total:Number(J[r].reduce((e,o,a)=>e+(w(a)==="OBSERVED"?o.reduce((i,s)=>i+s,0):0),0).toFixed(2))}}),mr=Array.from({length:S},(t,r)=>r).map(t=>{let r=w(t),n=v(t)-(V-te)/2,e=n-te,o=B+.004,a={topLeft:[ce-z/2,o,e],topRight:[ce+z/2,o,e],bottomRight:[ce+z/2,o,n],bottomLeft:[ce-z/2,o,n]},i=r==="ABSENT"?"DAY_NOT_MEASURED":null;return{...On(`day:${t}`,a,[ce,o,je(t)],i),day:t,state:r}}).sort((t,r)=>t.distance-r.distance),Zr=t=>t.filter(r=>!r.shown).reduce((r,n)=>{let e=n.reason??"UNKNOWN";return r[e]=(r[e]??0)+1,r},{});for(let t of[...dr].sort((r,n)=>n.distance-r.distance)){if(!t.shown||Te(t.proj))continue;let r=document.createElement("div");r.style.cssText=`position:absolute;left:0;top:0;width:${t.ew}px;height:${t.eh}px;transform-origin:0 0;transform:${t.proj.transform};display:flex;align-items:center;justify-content:center;overflow:hidden;-webkit-font-smoothing:antialiased`,r.innerHTML=`<div style="font:600 9.5px/1 ui-monospace,monospace;letter-spacing:.08em;color:rgba(220,232,255,0.92);white-space:nowrap">${t.name}</div>`,ue.appendChild(r)}for(let t of[...mr].sort((r,n)=>n.distance-r.distance)){if(!t.shown||Te(t.proj))continue;let r=document.createElement("div");r.style.cssText=`position:absolute;left:0;top:0;width:${t.ew}px;height:${t.eh}px;transform-origin:0 0;transform:${t.proj.transform};display:flex;align-items:center;justify-content:center;overflow:hidden;-webkit-font-smoothing:antialiased`;let n=t.state==="WITHHELD"?"WITHHELD":`D${t.day}`,e=t.state==="WITHHELD"?"#B7C2D8":"rgba(200,216,244,0.88)";r.innerHTML=`<div style="font:600 10px/1 ui-monospace,monospace;letter-spacing:.06em;color:${e};white-space:nowrap">${n}</div>`,ue.appendChild(r)}var Dr=(t,r,n,e)=>{let o=xe(bt,t,he,pe),a=!o.behind&&o.sx>-60&&o.sx<he+60&&o.sy>0&&o.sy<pe;if(a){let i=document.createElement("div");i.style.cssText=`position:absolute;left:${o.sx.toFixed(1)}px;top:${o.sy.toFixed(1)}px;transform:translate(-50%,-50%);font:600 9.5px/1 ui-monospace,monospace;letter-spacing:.1em;color:${n};border:1px solid ${e};padding:3px 6px;white-space:nowrap;background:rgba(6,10,18,0.72)`,i.textContent=r,ue.appendChild(i)}return{onFrame:a,sx:Math.round(o.sx),sy:Math.round(o.sy)}},_r=k+.34,Do=Dr([_r,B+.22,je((Math.min(...H)+Math.max(...H))/2)],`D${Math.min(...H)}-D${Math.max(...H)} NOT MEASURED`,"#E0A94A","rgba(224,169,74,0.55)"),_o=Dr([_r,B+.22,je(Jt+.5)],`D${Jt}-D${Math.max(...$e)} WITHHELD`,"#B7C2D8","rgba(183,194,216,0.5)"),wo=q>=0?Dr([_r,B+.22,v(q)],`REVIEW THRESHOLD ${yr} \xB7 D${q}`,"#9EC4FF","rgba(158,196,255,0.5)"):{onFrame:!1,sx:0,sy:0},Qt=Mr.map(t=>{let r=t-1<=gr,n=[Rr-.1,B+.02,v(t)],e=xe(bt,n,he,pe),o=!e.behind&&e.sx>-40&&e.sx<he&&e.sy>0&&e.sy<pe;if(o){let a=document.createElement("div");a.style.cssText=`position:absolute;left:16px;top:${e.sy.toFixed(1)}px;transform:translate(0,-50%);font:500 10px/1.35 ui-monospace,monospace;letter-spacing:.07em;white-space:nowrap;color:${r?"rgba(196,212,240,0.85)":"#E0A94A"}`,a.innerHTML=r?`D${t}`:`D${t}<br>NO INTEGRAL`,ue.appendChild(a)}return{day:t,readable:r,onFrame:o,sx:Math.round(e.sx),sy:Math.round(e.sy)}}),wr=document.createElement("div");wr.style.cssText="position:absolute;left:18px;top:16px;display:flex;flex-direction:column;gap:7px";wr.innerHTML=`<div style="font:600 11px/1 ui-monospace,monospace;letter-spacing:.16em;color:#8FB7FF">MARKETING RISK \xB7 DEPTH IS DAYS AHEAD</div><div style="font:400 10.5px/1.55 ui-monospace,monospace;color:rgba(196,212,240,0.86)">THE DEPTH OF COLOUR IS THE TOTAL RISK BETWEEN YOU AND THAT DAY<br>${V} m PER DAY &nbsp;\xB7&nbsp; ${Qe} OPTICAL DEPTH PER RISK UNIT<br>A PIXEL INTEGRATES ~${ke(Sr).toFixed(0)} DAYS AND ~${ke(vr).toFixed(1)} BANDS \u2014 ONE CHANNEL ONLY DOWN THE AXIS<br>INTEGRABLE TO D${gr} &nbsp;\xB7&nbsp; CALENDAR VISIBLE TO D${S-1}${Se?"":" &nbsp;\xB7&nbsp; FIELD NOT RENDERED"}</div><div style="font:500 10px/1.45 ui-monospace,monospace;color:#E0A94A">SYNTHETIC RISK DATA \xB7 ${We.length} HAND-AUTHORED FLAGGED ITEMS${or?`<br>VOLUME REFUSED \xB7 ${or.split(" \u2014 ")[0]}`:""}${br?"":"<br>SCENE DEPTH OFF \u2014 THE FIELD IS PAINTED OVER THE GEOMETRY"}</div>`;ue.appendChild(wr);var ct={OBSERVED:Array.from({length:S},(t,r)=>r).filter(t=>w(t)==="OBSERVED").length,ABSENT:H.length,WITHHELD:$e.length},Lr=document.createElement("div");Lr.style.cssText="position:absolute;right:18px;bottom:16px;display:flex;flex-direction:column;gap:6px;align-items:flex-end;font:500 10.5px/1 ui-monospace,monospace";Lr.innerHTML=`<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;color:rgba(196,212,240,0.85)"><span>RISK IN THAT CELL \u2014 LOW TO HIGH</span><span style="width:132px;height:9px;display:inline-block;background:linear-gradient(90deg,#2C6BFF,#FF8A3D);border:1px solid rgba(196,212,240,0.4)"></span></div><div style="color:rgba(196,212,240,0.85);text-align:right">SEVERITY IS HEIGHT<br><span style="opacity:.8">${[...ve].reverse().join(" / ")}</span></div>`+[["#101B2F",`OBSERVED \xB7 ${ct.OBSERVED} days`],["transparent",`NOT MEASURED \xB7 ${ct.ABSENT} days \u2014 hole in the floor`],["#6B7A99",`WITHHELD \xB7 ${ct.WITHHELD} days \u2014 lid, measured, not shown`]].map(([t,r])=>`<div style="display:flex;align-items:center;gap:7px;color:rgba(196,212,240,0.85)"><span>${r}</span><span style="width:11px;height:11px;background:${t};border:1px solid rgba(196,212,240,0.45);display:inline-block"></span></div>`).join("");ue.appendChild(Lr);var Bn=(()=>{let t=h.getExtension("WEBGL_debug_renderer_info");return t?String(h.getParameter(t.UNMASKED_RENDERER_WEBGL)):"unknown"})(),Kt=/swiftshader|llvmpipe|software/i.test(Bn),fr=St();if(fr.length>0){let t="BRAND FIDELITY FAILED \u2014 "+fr.map(r=>`${r.key}: expected ${r.expected}, got ${r.actual}`).join("; ");throw document.title="REFUSED",pr.textContent=t,new Error(t)}var Jr=t=>{let r=G(le(t,C));return Number((Math.acos(Math.max(-1,Math.min(1,r[0]*Z[0]+r[1]*Z[1]+r[2]*Z[2])))*180/Math.PI).toFixed(2))},In={tier:qt.tier,tierDprScale:qt.dprScale,tierShadowMapSize:nt(hr,1536),shadowBaseline:1536,brandFidelity:fr,volume:en,volumeRefusal:or,sceneDepth:br,ao:Zt,hdr:F.hdr,eye:C.map(t=>Number(t.toFixed(2))),integrableToDay:gr,visibleToDay:S-1,metresPerDay:V,calendarLengthM:oo,riskToTau:Qe,reviewThreshold:yr,frontDay:q,frontRefusal:st,totalObservedRisk:Number(Le.toFixed(3)),days:ct,absentDays:H,withheldDays:$e,absentRenderedAs:"FLOOR_HOLE_PLUS_EDGE_RAILS",withheldRenderedAs:"STEEL_LID_ON_INTACT_TILE",observedRenderedAs:"TILE_PLUS_VOLUMETRIC_MASS",readingStates:Array.from({length:S},(t,r)=>r).reduce((t,r)=>{let n=xr(r);return t[n]=(t[n]??0)+1,t},{}),flaggedItems:We.length,flaggedLostToNonObservedDays:nn.length,gridSize:[ie,se,be],gridVoxels:me.length,fieldMin:Number(tr.toFixed(5)),fieldMax:Number(rr.toFixed(5)),fieldMean:Number((dn/me.length).toFixed(6)),fieldNonZeroVoxels:nr,fieldOccupancyPct:Number((100*nr/me.length).toFixed(2)),densityScale:Number(Ar.toFixed(4)),maxCell:Number(He.toFixed(3)),rampSaturatesAtRiskUnits:Number(_n.toFixed(3)),cellsAboveRampSaturation:yo,worldStep:Ne,maxSteps:Pe,marchReachM:Number((Ne*Pe).toFixed(2)),boxDiagonalM:Number(Math.hypot(_[0]-A[0],_[1]-A[1],_[2]-A[2]).toFixed(2)),longestRayPlan:rt(Math.hypot(_[0]-A[0],_[1]-A[1],_[2]-A[2]),Ne,Pe),eyeRays:{sweep:`${Be}x${Ie}`,total:Be*Ie,hitBox:Ce,missedBox:Be*Ie-Ce,geometryCapped:Ln,truncated:Nn,tauMin:Number(Xe.toFixed(4)),tauMax:Number(ft.toFixed(4)),tauMean:Number((Pn/Math.max(1,Ce)).toFixed(4)),alphaMax:Number((1-Math.exp(-ft)).toFixed(3))},axialCheck:{rays:oe.length,maxErrorPct:Ro,meanErrorPct:Ao,truncated:oe.filter(t=>t.truncated).length},eyeRayLaneDriftMax:Number(ur.toFixed(2)),eyeRayLaneDriftMean:ke(Un),eyeRayDaysSpannedMax:Number(lr.toFixed(2)),eyeRayDaysSpannedMean:ke(Sr),eyeRayBandsSpannedMax:Number(cr.toFixed(2)),eyeRayBandsSpannedMean:ke(vr),glOcclusionPixels:it.pixels,glOcclusionPct:it.pct,glOcclusionMeanDelta:it.meanDelta,glOcclusionMaxDelta:it.maxDelta,halfFovDeg:Number(((re.fovDeg??36)/2).toFixed(2)),nearEdgeOffAxisDeg:Jr([mt,0,v(0)]),farEdgeOffAxisDeg:Jr([mt,0,v(S)]),channelLabels:{shown:dr.filter(t=>t.shown).length,refusedBy:Zr(dr)},dateLabels:{shown:mr.filter(t=>t.shown).length,refusedBy:Zr(mr)},weekTicksOffFrame:Qt.filter(t=>!t.onFrame).length,weekBarsSuppressedForAbsence:Mr.length-Dn.length,weekTicksRefusingIntegral:Qt.filter(t=>!t.readable).length,markersOnFrame:{absent:Do.onFrame,withheld:_o.onFrame,gate:wo.onFrame},triangles:bo,tilesDrawn:Sn,tilesOmittedForAbsence:vn,solids:Fr.length,shadowMap:er.size,resolution:`${P}x${U}`,dprScale:ze,frames:tn,msPerFrame:Number(jt.toFixed(3)),fps:Math.round(1e3/jt),glError:h.getError(),renderer:Bn,rendererClass:Kt?"software":"hardware",headroom:Kt?null:Number((16.6-jt).toFixed(3)),headroomRefusal:Kt?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null,hardwareMsPerFrame:null,axialRays:oe,cumulativeByDay:dt.map(t=>Number(t.toFixed(2))),weekTicks:Qt};globalThis.E7=In;var{axialRays:Ga,cumulativeByDay:Va,weekTicks:Xa,...Lo}=In;pr.textContent=JSON.stringify(Lo,null,2)+`

axialCheck per (channel, band) \u2014 ${oe.length} rays, full detail on globalThis.E7:
`+oe.map(t=>`  ${t.channel.padEnd(12)} b${t.band} expected ${String(t.expected).padStart(7)} measured ${String(t.measured).padStart(7)} err ${String(t.errorPct).padStart(5)}%`).join(`
`);Ve();on.markRendered();document.title="READY";

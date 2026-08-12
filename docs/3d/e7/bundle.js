var Bn=`
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
`;function Sr(t){let r=document.createElement("style");r.textContent=Bn,document.head.appendChild(r);let n=document.createElement("section");n.id="lcx-fallback";let e=(o,a)=>{if(o===null)return`<td class="absent${a?" n":""}">absent</td>`;let i=String(o).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");return`<td class="${a?"n":""}">${i}</td>`};return n.innerHTML=`<h2>${t.title} \u2014 flat view</h2><p class="reads">${t.readsAs}</p>`+(t.notices??[]).map(o=>`<p class="notice">${o}</p>`).join("")+'<div id="lcx-refusal"></div>'+(t.html?`<div class="surface">${t.html}</div>`:"<table><thead><tr>"+t.columns.map(o=>`<th class="${o.numeric?"n":""}">${o.label}</th>`).join("")+"</tr></thead><tbody>"+t.rows.map(o=>"<tr>"+t.columns.map(a=>e(o[a.key]??null,!!a.numeric)).join("")+"</tr>").join("")+"</tbody></table>"),document.body.appendChild(n),{markRendered(){n.dataset.rendered="1"},showRefusal(o,a){let i=document.getElementById("lcx-refusal");i&&(i.innerHTML=`<p class="refusal"><strong>${o}</strong> \u2014 ${a} The measurements below are unaffected.</p>`),delete n.dataset.rendered;for(let s of Array.from(document.querySelectorAll("canvas")))s.style.display="none"}}}var Dr={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected."};function D(t,r){return r===void 0?{kind:"refused",code:t,reason:Dr[t]}:{kind:"refused",code:t,reason:Dr[t],detail:r}}function pt(t){return t.kind==="stage"}function Et(t,r={}){let n=t.getContext("webgl2",{antialias:r.antialias??!1,alpha:r.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!n)return D("NO_WEBGL2");let e=n.getExtension("EXT_color_buffer_float"),o=t.width,a=t.height,i=e?n.RGBA16F:n.RGBA8,s=e?n.HALF_FLOAT:n.UNSIGNED_BYTE,u=(p,T)=>{let g=n.createTexture();n.bindTexture(n.TEXTURE_2D,g),n.texImage2D(n.TEXTURE_2D,0,i,p,T,0,n.RGBA,s,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE);let R=n.createFramebuffer();n.bindFramebuffer(n.FRAMEBUFFER,R),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,g,0);let M=n.checkFramebufferStatus(n.FRAMEBUFFER);return M!==n.FRAMEBUFFER_COMPLETE?D("FRAMEBUFFER_INCOMPLETE",`status 0x${M.toString(16)} at ${p}\xD7${T}`):{texture:g,framebuffer:R,width:p,height:T}},d=r.bloomShift??2,m={w:o,h:a},c=u(o,a);if("kind"in c)return c;let l=u(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in l)return l;let b=u(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in b)return b;let f=n.createVertexArray();n.bindVertexArray(f);let E=n.createBuffer();n.bindBuffer(n.ARRAY_BUFFER,E),n.bufferData(n.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),n.STATIC_DRAW),n.enableVertexAttribArray(0),n.vertexAttribPointer(0,2,n.FLOAT,!1,0,0),n.bindVertexArray(null);let x=[];return{kind:"stage",gl:n,cssWidth:t.clientWidth||o,cssHeight:t.clientHeight||a,hdr:!!e,get width(){return m.w},get height(){return m.h},get scene(){return c},get bloomA(){return l},get bloomB(){return b},setRegion(p,T){let g=Math.max(1,Math.round(p)),R=Math.max(1,Math.round(T));if(!(g===m.w&&R===m.h)){m={w:g,h:R};for(let M of[c,l,b])"kind"in M||(n.deleteFramebuffer(M.framebuffer),n.deleteTexture(M.texture));c=u(g,R),l=u(Math.max(1,g>>d),Math.max(1,R>>d)),b=u(Math.max(1,g>>d),Math.max(1,R>>d))}},compile(p,T){let g=(_e,ee)=>{let $=n.createShader(_e);return n.shaderSource($,ee),n.compileShader($),n.getShaderParameter($,n.COMPILE_STATUS)?$:D("SHADER_COMPILE_FAILED",n.getShaderInfoLog($)??"(no log)")},R=g(n.VERTEX_SHADER,p);if(typeof R=="object"&&"kind"in R)return R;let M=g(n.FRAGMENT_SHADER,T);if(typeof M=="object"&&"kind"in M)return M;let N=n.createProgram();return n.attachShader(N,R),n.attachShader(N,M),n.linkProgram(N),n.getProgramParameter(N,n.LINK_STATUS)?(x.push(N),N):D("PROGRAM_LINK_FAILED",n.getProgramInfoLog(N)??"(no log)")},bindTarget(p){n.bindFramebuffer(n.FRAMEBUFFER,p?p.framebuffer:null),n.viewport(0,0,p?p.width:m.w,p?p.height:m.h)},blit(p,T){n.useProgram(p),n.bindVertexArray(f),T?.(p),n.drawArrays(n.TRIANGLES,0,3),n.bindVertexArray(null)},dispose(){for(let p of x)n.deleteProgram(p);for(let p of[c,l,b])"kind"in p||(n.deleteFramebuffer(p.framebuffer),n.deleteTexture(p.texture));n.deleteBuffer(E),n.deleteVertexArray(f)}}}var Ze=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function qe(t,r){let n=new Float32Array(16);for(let e=0;e<4;e++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=t[i*4+o]*r[e*4+i];n[e*4+o]=a}return n}var ue=(t,r)=>[t[0]-r[0],t[1]-r[1],t[2]-r[2]],Qe=(t,r)=>t[0]*r[0]+t[1]*r[1]+t[2]*r[2],Ee=(t,r)=>[t[1]*r[2]-t[2]*r[1],t[2]*r[0]-t[0]*r[2],t[0]*r[1]-t[1]*r[0]];function G(t){let r=Math.hypot(t[0],t[1],t[2]);return r===0?t:[t[0]/r,t[1]/r,t[2]/r]}function xt(t,r,n,e){let o=1/Math.tan(t/2);return new Float32Array([o/r,0,0,0,0,o,0,0,0,0,(e+n)/(n-e),-1,0,0,2*e*n/(n-e),0])}function yt(t,r,n,e,o,a){let i=r-t,s=e-n,u=a-o;return new Float32Array([2/i,0,0,0,0,2/s,0,0,0,0,-2/u,0,-(r+t)/i,-(e+n)/s,-(a+o)/u,1])}function Je(t,r,n){let e=G(ue(t,r)),o=Ee(n,e);if(Math.hypot(o[0],o[1],o[2])<1e-8)return Ze();let a=G(o),i=Ee(e,a);return new Float32Array([a[0],i[0],e[0],0,a[1],i[1],e[1],0,a[2],i[2],e[2],0,-Qe(a,t),-Qe(i,t),-Qe(e,t),1])}function _r(t,r){let n=[0,1,2,3].map(o=>t[0+o]*r[0]+t[4+o]*r[1]+t[8+o]*r[2]+t[12+o]),e=n[3];return{x:n[0]/e,y:n[1]/e,z:n[2]/e,w:e}}function xe(t,r,n,e){let o=_r(t,r);return{sx:(o.x*.5+.5)*n,sy:(1-(o.y*.5+.5))*e,behind:o.w<=0}}function Lr(t){return t<=.04045?t/12.92:Math.pow((t+.055)/1.055,2.4)}function gt(t){return t<=.0031308?t*12.92:1.055*Math.pow(t,1/2.4)-.055}var In=/^#?([0-9a-fA-F]{6})$/;function I(t){let r=In.exec(t.trim());if(!r)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(t)}`);let n=r[1];return[0,2,4].map(e=>Lr(parseInt(n.slice(e,e+2),16)/255))}function Tt(t){return`#${t.map(n=>{let e=gt(Math.min(1,Math.max(0,n)));return Math.round(e*255).toString(16).padStart(2,"0")}).join("")}`}var ye={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},Rt=Object.freeze(Object.fromEntries(Object.keys(ye).map(t=>[t,I(ye[t])])));var wr=.4;var At=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${wr.toFixed(2)}); }`,Ft=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function Mt(){let t=[];for(let r of Object.keys(ye)){let n=ye[r].toLowerCase(),e=Tt(Rt[r]).toLowerCase();e!==n&&t.push({key:r,expected:n,actual:e})}return t}function Cn(t){let r=[1/0,1/0,1/0],n=[-1/0,-1/0,-1/0];for(let e=0;e<t.length;e+=3)for(let o=0;o<3;o++){let a=t[e+o];a<r[o]&&(r[o]=a),a>n[o]&&(n[o]=a)}return t.length===0?{min:[0,0,0],max:[0,0,0]}:{min:r,max:n}}function Nr(t,r,n,e){let o=new Float32Array(t.length);for(let i=0;i<e.length;i+=3){let s=e[i],u=e[i+1],d=e[i+2],m=s*3,c=u*3,l=d*3,b=s*2,f=u*2,E=d*2,x=t[c]-t[m],y=t[c+1]-t[m+1],p=t[c+2]-t[m+2],T=t[l]-t[m],g=t[l+1]-t[m+1],R=t[l+2]-t[m+2],M=n[f]-n[b],N=n[f+1]-n[b+1],_e=n[E]-n[b],ee=n[E+1]-n[b+1],$=M*ee-_e*N;if(Math.abs($)<1e-12)continue;let X=1/$,Pn=(x*ee-T*N)*X,Un=(y*ee-g*N)*X,On=(p*ee-R*N)*X;for(let pe of[m,c,l])o[pe]=o[pe]+Pn,o[pe+1]=o[pe+1]+Un,o[pe+2]=o[pe+2]+On}let a=new Float32Array(t.length);for(let i=0;i<a.length;i+=3){let s=r[i],u=r[i+1],d=r[i+2],m=o[i],c=o[i+1],l=o[i+2],b=m*s+c*u+l*d;m-=s*b,c-=u*b,l-=d*b;let f=Math.hypot(m,c,l);f<1e-8&&(Math.abs(s)<.9?(m=0,c=-d,l=u):(m=-d,c=0,l=s),f=Math.hypot(m,c,l)||1),a[i]=m/f,a[i+1]=c/f,a[i+2]=l/f}return a}function Pr(t,r){let n=new Float32Array(t.length);for(let e=0;e<r.length;e+=3){let o=r[e]*3,a=r[e+1]*3,i=r[e+2]*3,s=t[a]-t[o],u=t[a+1]-t[o+1],d=t[a+2]-t[o+2],m=t[i]-t[o],c=t[i+1]-t[o+1],l=t[i+2]-t[o+2],b=u*l-d*c,f=d*m-s*l,E=s*c-u*m;for(let x of[o,a,i])n[x]=n[x]+b,n[x+1]=n[x+1]+f,n[x+2]=n[x+2]+E}for(let e=0;e<n.length;e+=3){let o=Math.hypot(n[e],n[e+1],n[e+2]);o>0&&(n[e]=n[e]/o,n[e+1]=n[e+1]/o,n[e+2]=n[e+2]/o)}return n}function kn(t,r,n,e,o){let{min:a,max:i}=Cn(t),s=e??Pr(t,n);return{positions:t,normals:s,uvs:r,indices:n,min:a,max:i,tangents:o??Nr(t,s,r,n)}}function j(t=1,r=1,n=1){let e=t/2,o=r/2,a=n/2,i=[[[-e,-o,a],[e,-o,a],[e,o,a],[-e,o,a]],[[e,-o,-a],[-e,-o,-a],[-e,o,-a],[e,o,-a]],[[e,-o,a],[e,-o,-a],[e,o,-a],[e,o,a]],[[-e,-o,-a],[-e,-o,a],[-e,o,a],[-e,o,-a]],[[-e,o,a],[e,o,a],[e,o,-a],[-e,o,-a]],[[-e,-o,-a],[e,-o,-a],[e,-o,a],[-e,-o,a]]],s=new Float32Array(72),u=new Float32Array(48),d=new Uint16Array(36),m=0,c=0,l=0,b=0;for(let f of i){for(let[E,x,y]of f)s[m++]=E,s[m++]=x,s[m++]=y;u[c++]=0,u[c++]=0,u[c++]=1,u[c++]=0,u[c++]=1,u[c++]=1,u[c++]=0,u[c++]=1,d[l++]=b,d[l++]=b+1,d[l++]=b+2,d[l++]=b,d[l++]=b+2,d[l++]=b+3,b+=4}return kn(s,u,d)}function Y(t){return t.indices.length/3}function Hn(t){if(!Number.isFinite(t)||t===0)return"0";let r=t.toFixed(12).replace(/0+$/,"").replace(/\.$/,"");return r==="-0"?"0":r}function Ur(t,r,n,e){let[o,a]=t,[i,s]=r,[u,d]=n,[m,c]=e,l=o-i+u-m,b=a-s+d-c;if(Math.abs(l)<1e-9&&Math.abs(b)<1e-9){let R=[i-o,m-o,o,s-a,c-a,a,0,0,1],M=R[0]*R[4]-R[1]*R[3];return Math.abs(M)<1e-9?null:R}let f=i-u,E=m-u,x=s-d,y=c-d,p=f*y-E*x;if(Math.abs(p)<1e-9)return null;let T=(l*y-E*b)/p,g=(f*b-l*x)/p;return[i-o+T*i,m-o+g*m,o,s-a+T*s,c-a+g*c,a,T,g,1]}function et(t,r,n,e,o,a){if(!(o>0)||!(a>0))return{refusal:"EMPTY_ELEMENT_BOX"};let s=[r.topLeft,r.topRight,r.bottomRight,r.bottomLeft].map(X=>xe(t,X,n,e));if(s.some(X=>X.behind))return{refusal:"CORNER_BEHIND_CAMERA"};let u=s.map(X=>({x:X.sx,y:X.sy})),[d,m,c,l]=u,b=Ur([d.x,d.y],[m.x,m.y],[c.x,c.y],[l.x,l.y]);if(!b)return{refusal:"DEGENERATE_ON_SCREEN"};let f=.5*(d.x*m.y-m.x*d.y+(m.x*c.y-c.x*m.y)+(c.x*l.y-l.x*c.y)+(l.x*d.y-d.x*l.y)),E=1/o,x=1/a,[y,p,T,g,R,M,N,_e,ee]=b;return{transform:`matrix3d(${[y*E,g*E,0,N*E,p*x,R*x,0,_e*x,0,0,1,0,T,M,0,ee].map(Hn).join(", ")})`,matrix:b,screen:u,signedArea:f}}function ge(t){return"refusal"in t}function vt(t,r,n,e,o,a,i=0){let s=Math.cos(a),u=Math.sin(a),d=(c,l)=>[t+s*c+u*i,n+l,r-u*c+s*i],m=e/2;return{topLeft:d(-m,o),topRight:d(m,o),bottomRight:d(m,0),bottomLeft:d(-m,0)}}function tt(t,r,n,e){let o=-1/0,a=1/0;for(let i=0;i<3;i++){let s=r[i],u=t[i],d=n[i],m=e[i];if(Math.abs(s)<1e-12){if(u<d||u>m)return null;continue}let c=1/s,l=(d-u)*c,b=(m-u)*c;if(l>b){let f=l;l=b,b=f}if(l>o&&(o=l),b<a&&(a=b),o>a)return null}return a<0?null:{tNear:Math.max(0,o),tFar:a}}function rt(t,r,n){if(!(t>0)||!(r>0))return{steps:0,step:0,truncated:!1};let e=Math.ceil(t/r),o=Math.min(Math.max(1,e),Math.max(1,Math.floor(n)));return{steps:o,step:r,truncated:e>o}}var Or=`
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
`,Gn=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Vn=`#version 300 es
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
${Or}

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
}`;function St(t,r,n,e){let o=t.gl,a=Math.max(2,Math.floor(r)),i=Math.max(2,Math.floor(n)),s=Math.max(2,Math.floor(e));if(!o.getExtension("OES_texture_float_linear"))return D("MISSING_EXTENSION","the volume needs OES_texture_float_linear for trilinear sampling of the density grid \u2014 without it a float sampler3D silently falls back to NEAREST and the field renders as voxel blocks");let u=t.compile(Gn,Vn);if("kind"in u)return u;let d=o.createTexture();o.bindTexture(o.TEXTURE_3D,d),o.texStorage3D(o.TEXTURE_3D,1,o.R32F,a,i,s),o.texParameteri(o.TEXTURE_3D,o.TEXTURE_MIN_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_3D,o.TEXTURE_MAG_FILTER,o.LINEAR);for(let l of[o.TEXTURE_WRAP_S,o.TEXTURE_WRAP_T,o.TEXTURE_WRAP_R])o.texParameteri(o.TEXTURE_3D,l,o.CLAMP_TO_EDGE);o.bindTexture(o.TEXTURE_3D,null);let m=o.createVertexArray(),c=l=>o.getUniformLocation(u,l);return{size:[a,i,s],upload(l){let b=a*i*s,f=l.length===b?l:(()=>{let E=new Float32Array(b);return E.set(l.subarray(0,Math.min(b,l.length))),E})();o.bindTexture(o.TEXTURE_3D,d),o.texSubImage3D(o.TEXTURE_3D,0,0,0,0,a,i,s,o.RED,o.FLOAT,f),o.bindTexture(o.TEXTURE_3D,null)},draw(l){o.useProgram(u),o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_3D,d),o.uniform1i(c("uDensity"),0),o.activeTexture(o.TEXTURE1),o.bindTexture(o.TEXTURE_2D,l.sceneDepth),o.uniform1i(c("uSceneDepth"),1),o.uniform3fv(c("uBoxMin"),l.boxMin),o.uniform3fv(c("uBoxMax"),l.boxMax),o.uniform3fv(c("uEye"),l.eye),o.uniform3fv(c("uForward"),l.forward),o.uniform3fv(c("uRight"),l.right),o.uniform3fv(c("uUp"),l.up),o.uniform1f(c("uTanHalfFov"),Math.tan(l.fovDeg*Math.PI/360)),o.uniform1f(c("uAspect"),l.aspect),o.uniform1f(c("uNear"),l.near),o.uniform1f(c("uFar"),l.far),o.uniform1f(c("uWorldStep"),l.worldStep??.06),o.uniform1i(c("uMaxSteps"),Math.min(256,l.maxSteps??128)),o.uniform1f(c("uDensityScale"),l.densityScale??1),o.uniform3fv(c("uColourLow"),l.colourLow),o.uniform3fv(c("uColourHigh"),l.colourHigh),o.uniform3fv(c("uLightDir"),l.lightDir),o.uniform1f(c("uLightSteps"),Math.min(16,Math.max(0,l.lightSteps??6))),o.uniform1f(c("uEmission"),Math.min(1,Math.max(0,l.emission??.25))),o.enable(o.BLEND),o.blendFunc(o.ONE,o.ONE_MINUS_SRC_ALPHA),o.disable(o.DEPTH_TEST),o.depthMask(!1),o.bindVertexArray(m),o.drawArrays(o.TRIANGLES,0,3),o.bindVertexArray(null),o.depthMask(!0),o.disable(o.BLEND),o.activeTexture(o.TEXTURE1),o.bindTexture(o.TEXTURE_2D,null),o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_3D,null)},dispose(){o.deleteTexture(d),o.deleteVertexArray(m),o.deleteProgram(u)}}}var Dt=89,_t=Math.PI/180;function nt(t){let r=Math.max(-Dt,Math.min(Dt,t.elevationDeg))*_t,n=t.azimuthDeg*_t,e=Math.max(1e-4,t.distance),o=Math.sin(r)*e,a=Math.cos(r)*e;return[t.target[0]+Math.sin(n)*a,t.target[1]+o,t.target[2]+Math.cos(n)*a]}function ot(t,r){let n=nt(t),e=t.near??Math.max(.01,t.distance/100),o=t.far??Math.max(e+1,t.distance*8),a=xt((t.fovDeg??38)*_t,Math.max(.001,r),e,o),i=Je(n,t.target,[0,1,0]);return qe(a,i)}function Lt(t,r,n){let e=G(t.direction),o=t.extent??Math.max(.1,n*1.35),a=Math.max(1,n*2),i=[r[0]-e[0]*a,r[1]-e[1]*a,r[2]-e[2]*a],s=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],u=Je(i,r,s),d=yt(-o,o,-o,o,.01,a+n*2+o);return qe(d,u)}function wt(t,r){let n=ue([r[0],r[1],r[2]],[t[0],t[1],t[2]]);return Math.hypot(n[0],n[1],n[2])/2}function Nt(t,r){return[(t[0]+r[0])/2,(t[1]+r[1])/2,(t[2]+r[2])/2]}function Le(t,r,n){let{gl:e}=t,o=Math.max(1,Math.floor(r)),a=Math.max(1,Math.floor(n)),i=e.createFramebuffer(),s=e.createTexture(),u=e.createTexture();if(!i||!s||!u)return D("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let d=t.hdr?e.RGBA16F:e.RGBA8,m=t.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,c=()=>{e.bindTexture(e.TEXTURE_2D,s),e.texImage2D(e.TEXTURE_2D,0,d,o,a,0,e.RGBA,m,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,u),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,o,a,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,s,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,u,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};c(),e.bindFramebuffer(e.FRAMEBUFFER,i);let l=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),l!==e.FRAMEBUFFER_COMPLETE?D("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${l.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:s,depthTexture:u,get width(){return o},get height(){return a},bind(){e.bindFramebuffer(e.FRAMEBUFFER,i),e.viewport(0,0,o,a)},resize(b,f){let E=Math.max(1,Math.floor(b)),x=Math.max(1,Math.floor(f));E===o&&x===a||(o=E,a=x,c())},dispose(){e.deleteFramebuffer(i),e.deleteTexture(s),e.deleteTexture(u)}}}function Pt(t,r=1024){let{gl:n}=t,e=Math.max(256,Math.min(2048,Math.floor(r))),o=n.createFramebuffer(),a=n.createTexture();if(!o||!a)return D("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");n.bindTexture(n.TEXTURE_2D,a),n.texImage2D(n.TEXTURE_2D,0,n.DEPTH_COMPONENT24,e,e,0,n.DEPTH_COMPONENT,n.UNSIGNED_INT,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.bindFramebuffer(n.FRAMEBUFFER,o),n.framebufferTexture2D(n.FRAMEBUFFER,n.DEPTH_ATTACHMENT,n.TEXTURE_2D,a,0);let i=n.checkFramebufferStatus(n.FRAMEBUFFER);return n.bindFramebuffer(n.FRAMEBUFFER,null),i!==n.FRAMEBUFFER_COMPLETE?D("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:e,bind(){n.bindFramebuffer(n.FRAMEBUFFER,o),n.viewport(0,0,e,e)},dispose(){n.deleteFramebuffer(o),n.deleteTexture(a)}}}var Ot=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,Ut={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function Br(t,r,n={}){let e=n.zenith??Ut.zenith,o=n.horizon??Ut.horizon,a=n.ground??Ut.ground;t.uniform3f(t.getUniformLocation(r,"uSkyZenith"),e[0],e[1],e[2]),t.uniform3f(t.getUniformLocation(r,"uSkyHorizon"),o[0],o[1],o[2]),t.uniform3f(t.getUniformLocation(r,"uSkyGround"),a[0],a[1],a[2])}var Go=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${Ot}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;var Ir=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,Bt=`#version 300 es
precision highp float;
void main(){}`,Xn=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,Cr=`#version 300 es
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
}`,kr=`#version 300 es
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
${Ot}

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
}`;function K(t,r){let{gl:n}=t,e=n.createVertexArray(),o=n.createBuffer(),a=n.createBuffer(),i=n.createBuffer(),s=n.createBuffer();return!e||!o||!a||!i||!s?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(n.bindVertexArray(e),n.bindBuffer(n.ARRAY_BUFFER,o),n.bufferData(n.ARRAY_BUFFER,r.positions,n.STATIC_DRAW),n.enableVertexAttribArray(0),n.vertexAttribPointer(0,3,n.FLOAT,!1,0,0),n.bindBuffer(n.ARRAY_BUFFER,a),n.bufferData(n.ARRAY_BUFFER,r.normals,n.STATIC_DRAW),n.enableVertexAttribArray(1),n.vertexAttribPointer(1,3,n.FLOAT,!1,0,0),n.bindBuffer(n.ARRAY_BUFFER,i),n.bufferData(n.ARRAY_BUFFER,r.tangents,n.STATIC_DRAW),n.enableVertexAttribArray(2),n.vertexAttribPointer(2,3,n.FLOAT,!1,0,0),n.bindBuffer(n.ELEMENT_ARRAY_BUFFER,s),n.bufferData(n.ELEMENT_ARRAY_BUFFER,r.indices,n.STATIC_DRAW),n.bindVertexArray(null),{vao:e,indexCount:r.indices.length,indexType:r.indices instanceof Uint32Array?n.UNSIGNED_INT:n.UNSIGNED_SHORT,dispose(){n.deleteVertexArray(e),n.deleteBuffer(o),n.deleteBuffer(a),n.deleteBuffer(i),n.deleteBuffer(s)}})}function It(t){let{gl:r}=t,n=t.compile(Ir,Bt);if("kind"in n)return n;let e=t.compile(Cr,kr);if("kind"in e)return e;let o=t.compile(Xn,Bt);if("kind"in o)return o;let a=(i,s)=>r.getUniformLocation(i,s);return{shadowPass(i,s,u,d){let m=d??(()=>{});u.bind(),m("shadow.bind"),r.clear(r.DEPTH_BUFFER_BIT),r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.FRONT),r.useProgram(n),m("useProgram(shadow)"),r.uniformMatrix4fv(a(n,"uLightVP"),!1,i),m("uLightVP");for(let c of s)r.uniformMatrix4fv(a(n,"uModel"),!1,c.model),m("shadow uModel"),r.bindVertexArray(c.mesh.vao),m("shadow bindVAO"),r.drawElements(r.TRIANGLES,c.mesh.indexCount,c.mesh.indexType,0),m("shadow drawElements");r.bindVertexArray(null),r.cullFace(r.BACK)},depthPrepass(i,s){r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.colorMask(!1,!1,!1,!1),r.useProgram(o),r.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let u of s)r.uniformMatrix4fv(a(o,"uModel"),!1,u.model),r.bindVertexArray(u.mesh.vao),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0);r.bindVertexArray(null),r.colorMask(!0,!0,!0,!0)},draw(i){let s=i.onStep??(()=>{});if(r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.useProgram(e),r.uniformMatrix4fv(a(e,"uViewProj"),!1,i.viewProj),s("uViewProj"),r.uniform3fv(a(e,"uEye"),i.eye),s("uEye"),r.uniform3fv(a(e,"uLightDir"),i.lightDir),s("uLightDir"),r.uniform3fv(a(e,"uLightColour"),i.lightColour),s("uLightColour"),r.uniform1f(a(e,"uAmbientGain"),i.ambientGain??1),s("uAmbientGain"),i.fog&&i.fog.density>0){r.uniform1f(a(e,"uFogDensity"),i.fog.density),r.uniform1f(a(e,"uFogHeight"),i.fog.height),r.uniform1f(a(e,"uFogFloor"),i.fog.floor??0);let u=i.fog.colour;u==="sky"?r.uniform3f(a(e,"uFogColour"),-1,-1,-1):r.uniform3f(a(e,"uFogColour"),u[0],u[1],u[2]),s("fog")}else r.uniform1f(a(e,"uFogDensity"),0);Br(r,e,i.sky),s("bindSky"),i.ao&&i.screenSize?(r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,i.ao),r.uniform1i(a(e,"uAO"),1),r.uniform2f(a(e,"uScreenSize"),i.screenSize[0],i.screenSize[1]),r.uniform1f(a(e,"uAOEnabled"),1)):r.uniform1f(a(e,"uAOEnabled"),0),s("bindAO"),r.uniformMatrix4fv(a(e,"uLightVP"),!1,i.lightVP),s("lit uLightVP"),i.shadow?(r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,i.shadow.depthTexture),r.uniform1i(a(e,"uShadowMap"),0),r.uniform1f(a(e,"uShadowTexel"),1/i.shadow.size),r.uniform1f(a(e,"uShadowStrength"),i.shadowStrength??1)):r.uniform1f(a(e,"uShadowStrength"),0);for(let u of i.draws)r.uniformMatrix4fv(a(e,"uModel"),!1,u.model),r.uniformMatrix3fv(a(e,"uNormalMat"),!1,u.normalMat),s("uNormalMat"),r.uniform3fv(a(e,"uBaseColour"),u.material.baseColour),s("uBaseColour"),r.uniform1f(a(e,"uRoughness"),u.material.roughness),r.uniform1f(a(e,"uMetalness"),u.material.metalness),r.uniform1f(a(e,"uAnisotropy"),u.material.anisotropy??0),r.bindVertexArray(u.mesh.vao),s("lit bindVAO"),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0),s("lit drawElements");r.bindVertexArray(null),r.disable(r.CULL_FACE)},dispose(){r.deleteProgram(n),r.deleteProgram(e),r.deleteProgram(o)}}}var Ct=`
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
}`,Hr=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Wn=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${Ct}

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
}`,zn=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${Ct}

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
}`;function kt(t,r,n){let{gl:e}=t,o=t.compile(Hr,Wn);if("kind"in o)return o;let a=t.compile(Hr,zn);if("kind"in a)return a;let i=Math.max(1,r>>1),s=Math.max(1,n>>1),u=()=>{let f=e.createFramebuffer(),E=e.createTexture();return!f||!E?null:{fb:f,tex:E}},d=u(),m=u();if(!d||!m)return D("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let c=()=>{for(let f of[d,m])e.bindTexture(e.TEXTURE_2D,f.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,i,s,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,f.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,f.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};c(),e.bindFramebuffer(e.FRAMEBUFFER,d.fb);let l=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),l!==e.FRAMEBUFFER_COMPLETE)return D("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${l.toString(16)}).`);let b=(f,E,x,y,p,T,g)=>{e.activeTexture(e.TEXTURE0+g),e.bindTexture(e.TEXTURE_2D,E),e.uniform1i(e.getUniformLocation(f,"uDepth"),g),e.uniform2f(e.getUniformLocation(f,"uNearFar"),x,y),e.uniform1f(e.getUniformLocation(f,"uTanHalfFov"),Math.tan(p*Math.PI/360)),e.uniform1f(e.getUniformLocation(f,"uAspect"),T)};return{get texture(){return d.tex},get width(){return i},get height(){return s},compute(f){e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,d.fb),e.viewport(0,0,i,s),e.useProgram(o),b(o,f.depthTexture,f.near,f.far,f.fovDeg,f.aspect,0),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/i,1/s),e.uniform1f(e.getUniformLocation(o,"uRadius"),f.radius??.55),e.uniform1f(e.getUniformLocation(o,"uStrength"),f.strength??1.15),e.uniform1f(e.getUniformLocation(o,"uBias"),f.bias??.035),t.blit(o);for(let[E,x,y]of[[d,m,[1,0]],[m,d,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,x.fb),e.viewport(0,0,i,s),e.useProgram(a),b(a,f.depthTexture,f.near,f.far,f.fovDeg,f.aspect,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,E.tex),e.uniform1i(e.getUniformLocation(a,"uAO"),1),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/i,1/s),e.uniform2f(e.getUniformLocation(a,"uDir"),y[0],y[1]),t.blit(a);e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(f,E){let x=Math.max(1,f>>1),y=Math.max(1,E>>1);x===i&&y===s||(i=x,s=y,c())},dispose(){e.deleteProgram(o),e.deleteProgram(a);for(let f of[d,m])e.deleteFramebuffer(f.fb),e.deleteTexture(f.tex)}}}var ve=new URLSearchParams(location.search),Kr=ve.get("vol")!=="0",cr=ve.get("depth")!=="0",Yt=ve.get("ao")!=="0",We=Math.max(1,Math.min(3,Number(ve.get("scale")??1))),Qr=Number(ve.get("frames")??300),P=1200*We,U=720*We,Ae=document.getElementById("c");Ae.width=P;Ae.height=U;var dr=document.getElementById("log");function mr(t){document.title="REFUSED",dr.textContent=t;let[r,...n]=t.split(":");throw Zr?.showRefusal(r?.trim()??"REFUSED",n.join(":").trim()||t),new Error(t)}var Zr=null;function w(t,r){return"kind"in r&&mr(`${t}: ${r.code} \u2014 ${r.reason} ${r.detail??""}`),r}var O=["PAID_SEARCH","PAID_SOCIAL","INFLUENCER","EMAIL","PR_EARNED","AFFILIATE","COMMUNITY"],Se=["ADVISORY","ELEVATED","SEVERE"],v=28,$n=[.05,.07,.04,.025,.02,.055,.045],ze=[{ch:0,day:1,band:1,w:.3},{ch:3,day:2,band:1,w:.25},{ch:6,day:3,band:1,w:.2},{ch:2,day:4,band:1,w:.5},{ch:2,day:5,band:1,w:.8},{ch:2,day:6,band:2,w:.7},{ch:2,day:7,band:2,w:1},{ch:2,day:8,band:2,w:.9},{ch:2,day:9,band:1,w:.6},{ch:2,day:10,band:1,w:.35},{ch:1,day:6,band:1,w:.4},{ch:1,day:7,band:1,w:.75},{ch:1,day:8,band:2,w:.85},{ch:1,day:9,band:2,w:1.05},{ch:1,day:10,band:2,w:.8},{ch:1,day:11,band:1,w:.5},{ch:1,day:12,band:1,w:.3},{ch:6,day:8,band:1,w:.3},{ch:6,day:9,band:1,w:.55},{ch:6,day:10,band:2,w:.7},{ch:6,day:11,band:2,w:.95},{ch:6,day:12,band:2,w:.75},{ch:6,day:13,band:1,w:.45},{ch:6,day:14,band:1,w:.25},{ch:4,day:10,band:1,w:.35},{ch:4,day:11,band:1,w:.6},{ch:4,day:12,band:2,w:.8},{ch:4,day:13,band:2,w:.6},{ch:4,day:14,band:1,w:.4},{ch:0,day:13,band:1,w:.45},{ch:0,day:14,band:2,w:.75},{ch:0,day:15,band:2,w:.6},{ch:0,day:16,band:1,w:.3},{ch:3,day:14,band:1,w:.4},{ch:3,day:15,band:1,w:.55},{ch:3,day:16,band:1,w:.3},{ch:5,day:24,band:1,w:.5},{ch:5,day:25,band:2,w:.7},{ch:5,day:26,band:1,w:.4}],H=[13,14,15],$e=[22,23],L=t=>H.includes(t)?"ABSENT":$e.includes(t)?"WITHHELD":"OBSERVED",J=O.map((t,r)=>Array.from({length:v},(n,e)=>{let o=[0,0,0];return L(e)==="OBSERVED"&&(o[0]=$n[r]),o}));for(let t of ze)L(t.day)==="OBSERVED"&&(J[t.ch][t.day][t.band]+=t.w);var qr=ze.filter(t=>L(t.day)!=="OBSERVED"),He=0;for(let t of J)for(let r of t)for(let n of r)He=Math.max(He,n);var fr=8,we=0,Z=-1,it=null,ct=[];for(let t=0;t<v;t++){if(L(t)!=="OBSERVED"){ct.push(we),Z<0&&it===null&&(it=L(t)==="ABSENT"?"THRESHOLD_NOT_REACHED_BEFORE_UNMEASURED_DAY":"THRESHOLD_NOT_REACHED_BEFORE_WITHHELD_DAY");continue}for(let r=0;r<O.length;r++)for(let n=0;n<Se.length;n++)we+=J[r][t][n];ct.push(we),Z<0&&we>=fr&&(Z=t,it=null)}var jn=Math.min(...H),Kt=Math.min(...$e),br=t=>{let r=L(t);return r==="ABSENT"?"DAY_NOT_MEASURED":r==="WITHHELD"?"DAY_WITHHELD":t>jn?"INTEGRAL_CROSSES_UNMEASURED_DAY":t>Kt?"INTEGRAL_CROSSES_WITHHELD_DAY":"INTEGRABLE"},hr=Math.max(...Array.from({length:v},(t,r)=>r).filter(t=>br(t)==="INTEGRABLE")),Jr=Sr({title:"E7 \xB7 The Storm \u2014 marketing risk by day, channel and severity",readsAs:"Depth is days ahead in the rendered view, and the opacity along any line of sight is the total risk between the viewer and that day \u2014 an accumulation a per-cell table cannot show. The front advancing across channels, the three-day hole where the monitor was down, and the two days that are measured but withheld are all shapes there and rows here. This table carries every cell; what it cannot carry is what lies between you and a day.",notices:[`SYNTHETIC RISK DATA \u2014 ${ze.length} hand-authored flagged items over ${v} days. The shape is deliberate; the values are not measurements.`,`D${Math.min(...H)}-D${Math.max(...H)} were NOT MEASURED, and ${qr.length} already-scheduled flagged items landed inside them: their weight is in no cell below and is not zero. Every cumulative figure past that day is REFUSED.`],columns:[{key:"day",label:"Day"},{key:"state",label:"State"},{key:"reading",label:"Cumulative reading"},{key:"advisory",label:"Advisory",numeric:!0},{key:"elevated",label:"Elevated",numeric:!0},{key:"severe",label:"Severe",numeric:!0},{key:"total",label:"Day total",numeric:!0},{key:"cumulative",label:"Cumulative",numeric:!0}],rows:Array.from({length:v},(t,r)=>{let n=L(r),e=n==="OBSERVED",o=br(r),a=s=>e?Number(O.reduce((u,d,m)=>u+J[m][r][s],0).toFixed(3)):null,i=e?Number(Se.reduce((s,u,d)=>s+O.reduce((m,c,l)=>m+J[l][r][d],0),0).toFixed(3)):null;return{day:`D${r}`,state:n,reading:o==="INTEGRABLE"?"integrable":o,advisory:a(0),elevated:a(1),severe:a(2),total:i,cumulative:o==="INTEGRABLE"?Number(ct[r].toFixed(2)):null}})});Zr=Jr;ve.get("refuse")==="1"&&mr("FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. The volumetric field is not being drawn.");var st=Et(Ae,{alpha:!1});pt(st)||mr(`stage: ${st.code} \u2014 ${st.reason}`);var F=st,h=F.gl,en=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Yn=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${At}
${Ft}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,Kn=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uVolume;
out vec4 frag;
void main(){ frag = texture(uVolume, vUv); }`,Qn=w("present",F.compile(en,Yn)),Zn=w("composite",F.compile(en,Kn)),Ht=w("lit",It(F)),Te=w("target",Le(F,P,U)),Gr=w("volume target",Le(F,P,U)),tn=w("far depth",Le(F,4,4)),Qt=w("shadow",Pt(F,1536)),Vr=w("ao",kt(F,P,U));tn.bind();h.clearDepth(1);h.clear(h.DEPTH_BUFFER_BIT);h.bindFramebuffer(h.FRAMEBUFFER,null);var V=.5,pr=2.6,qn=v*V,Fe=.62,De=.46,Ge=.025,te=V*.78,W=.56,B=Ge/2,z=t=>(t-(O.length-1)/2)*Fe,k=z(O.length-1)+De/2,le=z(0)-De/2-.03-W/2,Er=le-W/2,dt=(Er+k)/2,S=t=>-pr-t*V,je=t=>S(t)-V/2,Ye=.6,bt=B+.02,rn=bt+Se.length*Ye,nn=t=>bt+(t+.5)*Ye,A=[-k,bt,S(v)],_=[k,rn,S(0)],Ke=.7,xr=He*Ke/V,ae=76,ie=42,fe=112,on=(t,r,n)=>t+ae*(r+ie*n),Jn=t=>{for(let r=0;r<O.length;r++)if(Math.abs(t-z(r))<=De/2)return r;return-1},eo=t=>{let r=Math.floor((-t-pr)/V);return r>=0&&r<v?r:-1},to=t=>{let r=Math.floor((t-bt)/Ye);return r>=0&&r<Se.length?r:-1},ro=.62,no=(t,r,n)=>{let e=Jn(t);if(e<0)return 0;let o=eo(n);if(o<0||L(o)!=="OBSERVED")return 0;let a=to(r);if(a<0)return 0;let i=Math.abs(r-nn(a))/(Ye/2),s=Math.max(0,Math.min(1,(1-i)/(1-ro)));return s<=0?0:J[e][o][a]*s/He},de=new Float32Array(ae*ie*fe);for(let t=0;t<fe;t++){let r=A[2]+(t+.5)/fe*(_[2]-A[2]);for(let n=0;n<ie;n++){let e=A[1]+(n+.5)/ie*(_[1]-A[1]);for(let o=0;o<ae;o++){let a=A[0]+(o+.5)/ae*(_[0]-A[0]);de[on(o,n,t)]=no(a,e,r)}}}var Zt=1/0,qt=-1/0,an=0,Jt=0;for(let t of de)t<Zt&&(Zt=t),t>qt&&(qt=t),an+=t,t>0&&Jt++;var ce=Kr?St(F,ae,ie,fe):null,er=ce&&"kind"in ce?`${ce.code} \u2014 ${ce.reason}`:null,Me=ce&&!("kind"in ce)?ce:null;Me&&Me.upload(de);var Ne=.125,Pe=128,tr=2.5,rr=32,re={target:[dt,.366,je(5.13)],distance:10,azimuthDeg:0,elevationDeg:21.3,fovDeg:33,near:tr,far:rr},C=nt(re),q=G(ue(re.target,C)),Ue=G(Ee(q,[0,1,0])),ut=G(Ee(Ue,q)),Re=Math.tan((re.fovDeg??36)*Math.PI/360),me=P/U,sn=j(De,Ge,te),un=j(W,Ge,te),ln=j(2*k,.42,te),cn=j(2*k+W+.06,.1,.05),dn=j(2*k,.07,.05),mn=j(2*k,.11,.05),fn=j(.075,1.05,.075),bn=w("tile",K(F,sn)),hn=w("gutter",K(F,un)),pn=w("lid",K(F,ln)),En=w("rail",K(F,cn)),xn=w("week bar",K(F,dn)),yn=w("gate",K(F,mn)),gn=w("post",K(F,fn)),oo=new Float32Array([1,0,0,0,1,0,0,0,1]),ao=(t,r,n)=>{let e=Ze();return e[12]=t,e[13]=r,e[14]=n,e},Q={tile:{baseColour:I("#22315A"),roughness:.74,metalness:.03},gutter:{baseColour:I("#131E36"),roughness:.84,metalness:0},withheldTile:{baseColour:I("#1B2540"),roughness:.55,metalness:.1},lid:{baseColour:I("#6B7A99"),roughness:.62,metalness:.35},rail:{baseColour:I("#6B7A99"),roughness:.58,metalness:.25},week:{baseColour:I("#26355A"),roughness:.6,metalness:.05},gate:{baseColour:I("#2C6BFF"),roughness:.52,metalness:.06}},yr=[],Oe=[],ne=(t,r,n,e,o,a,i,s)=>{Oe.push({mesh:i,model:ao(t,r,n),normalMat:oo,material:s}),yr.push({min:[t-e/2,r-o/2,n-a/2],max:[t+e/2,r+o/2,n+a/2]})},Tn=0,Rn=0;for(let t=0;t<v;t++){let r=L(t),n=je(t);if(r==="ABSENT"){Rn+=O.length+1;continue}ne(le,0,n,W,Ge,te,hn,Q.gutter);for(let e=0;e<O.length;e++)ne(z(e),0,n,De,Ge,te,bn,r==="WITHHELD"?Q.withheldTile:Q.tile);Tn+=O.length+1,r==="WITHHELD"&&ne(0,B+.21,n,2*k,.42,te,pn,Q.lid)}var io=[S(Math.min(...H))+.02,S(Math.max(...H)+1)-.02];for(let t of io){ne(dt,B+.05,t,2*k+W+.06,.1,.05,En,Q.rail);for(let r=0;r<=O.length;r++)ne(z(0)-Fe/2+r*Fe,B+.525,t,.075,1.05,.075,gn,Q.rail)}var gr=[7,14,21,28],An=gr.filter(t=>L(t-1)!=="ABSENT"&&L(Math.min(t,v-1))!=="ABSENT");for(let t of An)ne(0,B+.035,S(t),2*k,.07,.05,xn,Q.week);if(Z>=0){let t=S(Z);ne(0,B+.055,t,2*k,.11,.05,yn,Q.gate);for(let r=0;r<=O.length;r++)ne(z(0)-Fe/2+r*Fe,B+.525,t,.075,1.05,.075,gn,Q.gate)}var nr=[.44,-.66,-.61],Xr=[Er-.2,0,S(v)-.3],Wr=[k+.2,rn,-pr+.3],zr=Lt({direction:nr,colour:[1,1,1],extent:9.5},Nt(Xr,Wr),wt(Xr,Wr)),so=Oe.reduce((t,r)=>t+(r.mesh===bn?Y(sn):r.mesh===hn?Y(un):r.mesh===pn?Y(ln):r.mesh===En?Y(cn):r.mesh===xn?Y(dn):r.mesh===yn?Y(mn):Y(fn)),0),Gt=I("#070B14"),uo={zenith:[.01,.014,.03],horizon:[.03,.044,.08],ground:[.006,.007,.012]},Vt=I("#2C6BFF"),Xt=I("#FF8A3D"),lo=[Vt[0]*.55,Vt[1]*.55,Vt[2]*.55],co=[Xt[0]*1.45,Xt[1]*1.45,Xt[2]*1.45],Fn=V/Ke,mo=J.reduce((t,r)=>t+r.reduce((n,e)=>n+e.filter(o=>o>Fn).length,0),0);function Ve(t=cr){let r=ot(re,me);Ht.shadowPass(zr,Oe,Qt),Te.bind(),h.clearColor(Gt[0],Gt[1],Gt[2],1),h.clear(h.COLOR_BUFFER_BIT|h.DEPTH_BUFFER_BIT),Ht.depthPrepass(r,Oe),Yt&&(Vr.compute({depthTexture:Te.depthTexture,near:tr,far:rr,fovDeg:re.fovDeg??36,aspect:me,radius:.34,strength:1.15}),Te.bind()),Ht.draw({viewProj:r,eye:C,lightDir:nr,lightColour:[2.05,2,1.92],ambientGain:.62,sky:uo,lightVP:zr,shadow:Qt,shadowStrength:.92,draws:Oe,ao:Yt?Vr.texture:null,screenSize:[P,U]}),Me&&(Gr.bind(),h.clearColor(0,0,0,0),h.clear(h.COLOR_BUFFER_BIT|h.DEPTH_BUFFER_BIT),Me.draw({eye:C,forward:q,right:Ue,up:ut,fovDeg:re.fovDeg??36,aspect:me,near:tr,far:rr,sceneDepth:t?Te.depthTexture:tn.depthTexture,boxMin:A,boxMax:_,worldStep:Ne,maxSteps:Pe,densityScale:xr,colourLow:lo,colourHigh:co,lightDir:nr,lightSteps:6,emission:.26}),Te.bind(),h.enable(h.BLEND),h.blendFunc(h.ONE,h.ONE_MINUS_SRC_ALPHA),h.disable(h.DEPTH_TEST),h.activeTexture(h.TEXTURE0),h.bindTexture(h.TEXTURE_2D,Gr.texture),F.blit(Zn,n=>h.uniform1i(h.getUniformLocation(n,"uVolume"),0)),h.disable(h.BLEND)),h.bindFramebuffer(h.FRAMEBUFFER,null),h.viewport(0,0,P,U),h.disable(h.DEPTH_TEST),h.activeTexture(h.TEXTURE0),h.bindTexture(h.TEXTURE_2D,Te.texture),F.blit(Qn,n=>h.uniform1i(h.getUniformLocation(n,"uScene"),0))}function fo(t){Ve();let r=new Uint8Array(4);h.readPixels(0,0,1,1,h.RGBA,h.UNSIGNED_BYTE,r);let n=performance.now();for(let e=0;e<t;e++)Ve();return h.readPixels(0,0,1,1,h.RGBA,h.UNSIGNED_BYTE,r),(performance.now()-n)/t}var Wt=fo(Math.max(1,Qr));function bo(){if(!Me)return{pixels:0,pct:0,meanDelta:0,maxDelta:0};let t=new Uint8Array(P*U*4),r=new Uint8Array(P*U*4);Ve(!0),h.readPixels(0,0,P,U,h.RGBA,h.UNSIGNED_BYTE,t),Ve(!1),h.readPixels(0,0,P,U,h.RGBA,h.UNSIGNED_BYTE,r);let n=0,e=0,o=0;for(let a=0;a<t.length;a+=4){let i=Math.max(Math.abs(t[a]-r[a]),Math.abs(t[a+1]-r[a+1]),Math.abs(t[a+2]-r[a+2]));i>2&&(n++,e+=i,i>o&&(o=i))}return{pixels:n,pct:Number((100*n/(P*U)).toFixed(2)),meanDelta:Number((e/Math.max(1,n)).toFixed(1)),maxDelta:o}}var at=bo(),ho=(t,r,n)=>{let e=(t-A[0])/(_[0]-A[0]),o=(r-A[1])/(_[1]-A[1]),a=(n-A[2])/(_[2]-A[2]);if(e<0||e>1||o<0||o>1||a<0||a>1)return 0;let i=e*ae-.5,s=o*ie-.5,u=a*fe-.5,d=Math.floor(i),m=Math.floor(s),c=Math.floor(u),l=i-d,b=s-m,f=u-c,E=(y,p)=>y<0?0:y>p-1?p-1:y,x=0;for(let y=0;y<2;y++)for(let p=0;p<2;p++)for(let T=0;T<2;T++){let g=(T?l:1-l)*(p?b:1-b)*(y?f:1-f);g<=0||(x+=g*de[on(E(d+T,ae),E(m+p,ie),E(c+y,fe))])}return x*xr},Mn=(t,r,n)=>{let e=tt(t,r,A,_);if(!e)return{tau:0,truncated:!1,capped:!1,hit:!1,tStart:0,tEnd:0};let o=Math.min(e.tFar,n),a=n<e.tFar;if(o<=e.tNear)return{tau:0,truncated:!1,capped:a,hit:!0,tStart:e.tNear,tEnd:e.tNear};let i=rt(o-e.tNear,Ne,Pe),s=0;for(let u=0;u<i.steps;u++){let d=e.tNear+(u+.5)*i.step;if(d>o)break;let m=ho(t[0]+r[0]*d,t[1]+r[1]*d,t[2]+r[2]*d);m<=5e-4||(s+=m*i.step)}return{tau:s,truncated:i.truncated,capped:a,hit:!0,tStart:e.tNear,tEnd:o}},oe=O.flatMap((t,r)=>Se.map((n,e)=>{let o=J[r].reduce((s,u,d)=>s+(L(d)==="OBSERVED"?u[e]:0),0),a=Mn([z(r),nn(e),_[2]+1],[0,0,-1],1/0),i=a.tau/Ke;return{channel:t,band:n,expected:Number(o.toFixed(4)),measured:Number(i.toFixed(4)),errorPct:o>1e-6?Number((100*Math.abs(i-o)/o).toFixed(2)):0,truncated:a.truncated}})),po=Math.max(...oe.map(t=>t.errorPct)),Eo=Number((oe.reduce((t,r)=>t+r.errorPct,0)/oe.length).toFixed(3)),xo=t=>{let r=1/0;for(let n of yr){let e=tt(C,t,n.min,n.max);e&&e.tNear>0&&e.tNear<r&&(r=e.tNear)}return r},Be=61,Ie=37,Ce=0,vn=0,Sn=0,Xe=1/0,mt=0,Dn=0,or=0,_n=0,ar=0,Tr=0,ir=0,Rr=0;for(let t=0;t<Ie;t++)for(let r=0;r<Be;r++){let n=2*(r+.5)/Be-1,e=2*(t+.5)/Ie-1,o=G([q[0]+Ue[0]*n*Re*me+ut[0]*e*Re,q[1]+Ue[1]*n*Re*me+ut[1]*e*Re,q[2]+Ue[2]*n*Re*me+ut[2]*e*Re]),a=Mn(C,o,xo(o));if(!a.hit)continue;Ce++,a.capped&&vn++,a.truncated&&Sn++,Xe=Math.min(Xe,a.tau),mt=Math.max(mt,a.tau),Dn+=a.tau;let i=(m,c)=>C[c]+o[c]*m,s=Math.abs(i(a.tEnd,0)-i(a.tStart,0))/Fe,u=Math.abs(i(a.tEnd,2)-i(a.tStart,2))/V,d=Math.abs(i(a.tEnd,1)-i(a.tStart,1))/Ye;or=Math.max(or,s),_n+=s,ar=Math.max(ar,u),Tr+=u,ir=Math.max(ir,d),Rr+=d}Number.isFinite(Xe)||(Xe=0);var ke=t=>Number((t/Math.max(1,Ce)).toFixed(2)),ft=ot(re,me),be=P/We,he=U/We,ht=document.createElement("div");ht.style.cssText=`position:relative;overflow:hidden;width:${be}px;height:${he}px`;Ae.parentNode?.insertBefore(ht,Ae);ht.appendChild(Ae);var se=document.createElement("div");se.style.cssText="position:absolute;inset:0;pointer-events:none";ht.appendChild(se);var yo=t=>{let r=(i,s)=>Math.hypot(i.x-s.x,i.y-s.y),n=t[0],e=t[1],o=t[2],a=t[3];return{ew:Math.max(1,Math.round(Math.max(r(n,e),r(a,o)))),eh:Math.max(1,Math.round(Math.max(r(n,a),r(e,o))))}},go=26,To=15,zt=[],$r=(t,r,n)=>{let e=0;for(let o=0;o<4;o++){let a=t[o],i=t[(o+1)%4],s=(i.x-a.x)*(n-a.y)-(i.y-a.y)*(r-a.x);if(Math.abs(s)<1e-9)continue;let u=s>0?1:-1;if(e===0)e=u;else if(u!==e)return!1}return!0},Ln=(t,r,n,e)=>{let o=Math.hypot(n[0]-C[0],n[1]-C[1],n[2]-C[2]),a=et(ft,r,be,he,100,100);if(ge(a))return{key:t,proj:a,ew:0,eh:0,distance:o,shown:!1,reason:a.refusal,widthPx:0,heightPx:0};let{ew:i,eh:s}=yo(a.screen),u=et(ft,r,be,he,i,s),d=a.signedArea<=0,m=e??(d?"BACK_FACING":i<go?"EDGE_ON":s<To?"TOO_FLAT":a.screen.filter(l=>zt.some(b=>$r(b,l.x,l.y))).length+zt.reduce((l,b)=>l+b.filter(f=>$r(a.screen.map(E=>({x:E.x,y:E.y})),f.x,f.y)).length,0)>=2?"OCCLUDED":null),c=m===null&&!ge(u);return c&&zt.push(a.screen.map(l=>({x:l.x,y:l.y}))),{key:t,proj:u,ew:i,eh:s,distance:o,shown:c,reason:m,widthPx:i,heightPx:s}},sr=O.map((t,r)=>{let n=vt(z(r),S(0)+.04,B+.02,De,.15,Math.atan2(C[0]-z(r),C[2]-S(0)),.01);return{...Ln(`ch:${t}`,n,[z(r),B+.09,S(0)+.04],null),name:t,total:Number(J[r].reduce((e,o,a)=>e+(L(a)==="OBSERVED"?o.reduce((i,s)=>i+s,0):0),0).toFixed(2))}}),ur=Array.from({length:v},(t,r)=>r).map(t=>{let r=L(t),n=S(t)-(V-te)/2,e=n-te,o=B+.004,a={topLeft:[le-W/2,o,e],topRight:[le+W/2,o,e],bottomRight:[le+W/2,o,n],bottomLeft:[le-W/2,o,n]},i=r==="ABSENT"?"DAY_NOT_MEASURED":null;return{...Ln(`day:${t}`,a,[le,o,je(t)],i),day:t,state:r}}).sort((t,r)=>t.distance-r.distance),jr=t=>t.filter(r=>!r.shown).reduce((r,n)=>{let e=n.reason??"UNKNOWN";return r[e]=(r[e]??0)+1,r},{});for(let t of[...sr].sort((r,n)=>n.distance-r.distance)){if(!t.shown||ge(t.proj))continue;let r=document.createElement("div");r.style.cssText=`position:absolute;left:0;top:0;width:${t.ew}px;height:${t.eh}px;transform-origin:0 0;transform:${t.proj.transform};display:flex;align-items:center;justify-content:center;overflow:hidden;-webkit-font-smoothing:antialiased`,r.innerHTML=`<div style="font:600 9.5px/1 ui-monospace,monospace;letter-spacing:.08em;color:rgba(220,232,255,0.92);white-space:nowrap">${t.name}</div>`,se.appendChild(r)}for(let t of[...ur].sort((r,n)=>n.distance-r.distance)){if(!t.shown||ge(t.proj))continue;let r=document.createElement("div");r.style.cssText=`position:absolute;left:0;top:0;width:${t.ew}px;height:${t.eh}px;transform-origin:0 0;transform:${t.proj.transform};display:flex;align-items:center;justify-content:center;overflow:hidden;-webkit-font-smoothing:antialiased`;let n=t.state==="WITHHELD"?"WITHHELD":`D${t.day}`,e=t.state==="WITHHELD"?"#B7C2D8":"rgba(200,216,244,0.88)";r.innerHTML=`<div style="font:600 10px/1 ui-monospace,monospace;letter-spacing:.06em;color:${e};white-space:nowrap">${n}</div>`,se.appendChild(r)}var Ar=(t,r,n,e)=>{let o=xe(ft,t,be,he),a=!o.behind&&o.sx>-60&&o.sx<be+60&&o.sy>0&&o.sy<he;if(a){let i=document.createElement("div");i.style.cssText=`position:absolute;left:${o.sx.toFixed(1)}px;top:${o.sy.toFixed(1)}px;transform:translate(-50%,-50%);font:600 9.5px/1 ui-monospace,monospace;letter-spacing:.1em;color:${n};border:1px solid ${e};padding:3px 6px;white-space:nowrap;background:rgba(6,10,18,0.72)`,i.textContent=r,se.appendChild(i)}return{onFrame:a,sx:Math.round(o.sx),sy:Math.round(o.sy)}},Fr=k+.34,Ro=Ar([Fr,B+.22,je((Math.min(...H)+Math.max(...H))/2)],`D${Math.min(...H)}-D${Math.max(...H)} NOT MEASURED`,"#E0A94A","rgba(224,169,74,0.55)"),Ao=Ar([Fr,B+.22,je(Kt+.5)],`D${Kt}-D${Math.max(...$e)} WITHHELD`,"#B7C2D8","rgba(183,194,216,0.5)"),Fo=Z>=0?Ar([Fr,B+.22,S(Z)],`REVIEW THRESHOLD ${fr} \xB7 D${Z}`,"#9EC4FF","rgba(158,196,255,0.5)"):{onFrame:!1,sx:0,sy:0},$t=gr.map(t=>{let r=t-1<=hr,n=[Er-.1,B+.02,S(t)],e=xe(ft,n,be,he),o=!e.behind&&e.sx>-40&&e.sx<be&&e.sy>0&&e.sy<he;if(o){let a=document.createElement("div");a.style.cssText=`position:absolute;left:16px;top:${e.sy.toFixed(1)}px;transform:translate(0,-50%);font:500 10px/1.35 ui-monospace,monospace;letter-spacing:.07em;white-space:nowrap;color:${r?"rgba(196,212,240,0.85)":"#E0A94A"}`,a.innerHTML=r?`D${t}`:`D${t}<br>NO INTEGRAL`,se.appendChild(a)}return{day:t,readable:r,onFrame:o,sx:Math.round(e.sx),sy:Math.round(e.sy)}}),Mr=document.createElement("div");Mr.style.cssText="position:absolute;left:18px;top:16px;display:flex;flex-direction:column;gap:7px";Mr.innerHTML=`<div style="font:600 11px/1 ui-monospace,monospace;letter-spacing:.16em;color:#8FB7FF">MARKETING RISK \xB7 DEPTH IS DAYS AHEAD</div><div style="font:400 10.5px/1.55 ui-monospace,monospace;color:rgba(196,212,240,0.86)">THE DEPTH OF COLOUR IS THE TOTAL RISK BETWEEN YOU AND THAT DAY<br>${V} m PER DAY &nbsp;\xB7&nbsp; ${Ke} OPTICAL DEPTH PER RISK UNIT<br>A PIXEL INTEGRATES ~${ke(Tr).toFixed(0)} DAYS AND ~${ke(Rr).toFixed(1)} BANDS \u2014 ONE CHANNEL ONLY DOWN THE AXIS<br>INTEGRABLE TO D${hr} &nbsp;\xB7&nbsp; CALENDAR VISIBLE TO D${v-1}${Me?"":" &nbsp;\xB7&nbsp; FIELD NOT RENDERED"}</div><div style="font:500 10px/1.45 ui-monospace,monospace;color:#E0A94A">SYNTHETIC RISK DATA \xB7 ${ze.length} HAND-AUTHORED FLAGGED ITEMS${er?`<br>VOLUME REFUSED \xB7 ${er.split(" \u2014 ")[0]}`:""}${cr?"":"<br>SCENE DEPTH OFF \u2014 THE FIELD IS PAINTED OVER THE GEOMETRY"}</div>`;se.appendChild(Mr);var lt={OBSERVED:Array.from({length:v},(t,r)=>r).filter(t=>L(t)==="OBSERVED").length,ABSENT:H.length,WITHHELD:$e.length},vr=document.createElement("div");vr.style.cssText="position:absolute;right:18px;bottom:16px;display:flex;flex-direction:column;gap:6px;align-items:flex-end;font:500 10.5px/1 ui-monospace,monospace";vr.innerHTML=`<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;color:rgba(196,212,240,0.85)"><span>RISK IN THAT CELL \u2014 LOW TO HIGH</span><span style="width:132px;height:9px;display:inline-block;background:linear-gradient(90deg,#2C6BFF,#FF8A3D);border:1px solid rgba(196,212,240,0.4)"></span></div><div style="color:rgba(196,212,240,0.85);text-align:right">SEVERITY IS HEIGHT<br><span style="opacity:.8">${[...Se].reverse().join(" / ")}</span></div>`+[["#101B2F",`OBSERVED \xB7 ${lt.OBSERVED} days`],["transparent",`NOT MEASURED \xB7 ${lt.ABSENT} days \u2014 hole in the floor`],["#6B7A99",`WITHHELD \xB7 ${lt.WITHHELD} days \u2014 lid, measured, not shown`]].map(([t,r])=>`<div style="display:flex;align-items:center;gap:7px;color:rgba(196,212,240,0.85)"><span>${r}</span><span style="width:11px;height:11px;background:${t};border:1px solid rgba(196,212,240,0.45);display:inline-block"></span></div>`).join("");se.appendChild(vr);var wn=(()=>{let t=h.getExtension("WEBGL_debug_renderer_info");return t?String(h.getParameter(t.UNMASKED_RENDERER_WEBGL)):"unknown"})(),jt=/swiftshader|llvmpipe|software/i.test(wn),lr=Mt();if(lr.length>0){let t="BRAND FIDELITY FAILED \u2014 "+lr.map(r=>`${r.key}: expected ${r.expected}, got ${r.actual}`).join("; ");throw document.title="REFUSED",dr.textContent=t,new Error(t)}var Yr=t=>{let r=G(ue(t,C));return Number((Math.acos(Math.max(-1,Math.min(1,r[0]*q[0]+r[1]*q[1]+r[2]*q[2])))*180/Math.PI).toFixed(2))},Nn={brandFidelity:lr,volume:Kr,volumeRefusal:er,sceneDepth:cr,ao:Yt,hdr:F.hdr,eye:C.map(t=>Number(t.toFixed(2))),integrableToDay:hr,visibleToDay:v-1,metresPerDay:V,calendarLengthM:qn,riskToTau:Ke,reviewThreshold:fr,frontDay:Z,frontRefusal:it,totalObservedRisk:Number(we.toFixed(3)),days:lt,absentDays:H,withheldDays:$e,absentRenderedAs:"FLOOR_HOLE_PLUS_EDGE_RAILS",withheldRenderedAs:"STEEL_LID_ON_INTACT_TILE",observedRenderedAs:"TILE_PLUS_VOLUMETRIC_MASS",readingStates:Array.from({length:v},(t,r)=>r).reduce((t,r)=>{let n=br(r);return t[n]=(t[n]??0)+1,t},{}),flaggedItems:ze.length,flaggedLostToNonObservedDays:qr.length,gridSize:[ae,ie,fe],gridVoxels:de.length,fieldMin:Number(Zt.toFixed(5)),fieldMax:Number(qt.toFixed(5)),fieldMean:Number((an/de.length).toFixed(6)),fieldNonZeroVoxels:Jt,fieldOccupancyPct:Number((100*Jt/de.length).toFixed(2)),densityScale:Number(xr.toFixed(4)),maxCell:Number(He.toFixed(3)),rampSaturatesAtRiskUnits:Number(Fn.toFixed(3)),cellsAboveRampSaturation:mo,worldStep:Ne,maxSteps:Pe,marchReachM:Number((Ne*Pe).toFixed(2)),boxDiagonalM:Number(Math.hypot(_[0]-A[0],_[1]-A[1],_[2]-A[2]).toFixed(2)),longestRayPlan:rt(Math.hypot(_[0]-A[0],_[1]-A[1],_[2]-A[2]),Ne,Pe),eyeRays:{sweep:`${Be}x${Ie}`,total:Be*Ie,hitBox:Ce,missedBox:Be*Ie-Ce,geometryCapped:vn,truncated:Sn,tauMin:Number(Xe.toFixed(4)),tauMax:Number(mt.toFixed(4)),tauMean:Number((Dn/Math.max(1,Ce)).toFixed(4)),alphaMax:Number((1-Math.exp(-mt)).toFixed(3))},axialCheck:{rays:oe.length,maxErrorPct:po,meanErrorPct:Eo,truncated:oe.filter(t=>t.truncated).length},eyeRayLaneDriftMax:Number(or.toFixed(2)),eyeRayLaneDriftMean:ke(_n),eyeRayDaysSpannedMax:Number(ar.toFixed(2)),eyeRayDaysSpannedMean:ke(Tr),eyeRayBandsSpannedMax:Number(ir.toFixed(2)),eyeRayBandsSpannedMean:ke(Rr),glOcclusionPixels:at.pixels,glOcclusionPct:at.pct,glOcclusionMeanDelta:at.meanDelta,glOcclusionMaxDelta:at.maxDelta,halfFovDeg:Number(((re.fovDeg??36)/2).toFixed(2)),nearEdgeOffAxisDeg:Yr([dt,0,S(0)]),farEdgeOffAxisDeg:Yr([dt,0,S(v)]),channelLabels:{shown:sr.filter(t=>t.shown).length,refusedBy:jr(sr)},dateLabels:{shown:ur.filter(t=>t.shown).length,refusedBy:jr(ur)},weekTicksOffFrame:$t.filter(t=>!t.onFrame).length,weekBarsSuppressedForAbsence:gr.length-An.length,weekTicksRefusingIntegral:$t.filter(t=>!t.readable).length,markersOnFrame:{absent:Ro.onFrame,withheld:Ao.onFrame,gate:Fo.onFrame},triangles:so,tilesDrawn:Tn,tilesOmittedForAbsence:Rn,solids:yr.length,shadowMap:Qt.size,resolution:`${P}x${U}`,dprScale:We,frames:Qr,msPerFrame:Number(Wt.toFixed(3)),fps:Math.round(1e3/Wt),glError:h.getError(),renderer:wn,rendererClass:jt?"software":"hardware",headroom:jt?null:Number((16.6-Wt).toFixed(3)),headroomRefusal:jt?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null,hardwareMsPerFrame:null,axialRays:oe,cumulativeByDay:ct.map(t=>Number(t.toFixed(2))),weekTicks:$t};globalThis.E7=Nn;var{axialRays:wa,cumulativeByDay:Na,weekTicks:Pa,...Mo}=Nn;dr.textContent=JSON.stringify(Mo,null,2)+`

axialCheck per (channel, band) \u2014 ${oe.length} rays, full detail on globalThis.E7:
`+oe.map(t=>`  ${t.channel.padEnd(12)} b${t.band} expected ${String(t.expected).padStart(7)} measured ${String(t.measured).padStart(7)} err ${String(t.errorPct).padStart(5)}%`).join(`
`);Ve();Jr.markRendered();document.title="READY";

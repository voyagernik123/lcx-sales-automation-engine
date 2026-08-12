var pr={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected."};function _(t,r){return r===void 0?{kind:"refused",code:t,reason:pr[t]}:{kind:"refused",code:t,reason:pr[t],detail:r}}function dt(t){return t.kind==="stage"}function ft(t,r={}){let n=t.getContext("webgl2",{antialias:r.antialias??!1,alpha:r.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!n)return _("NO_WEBGL2");let e=n.getExtension("EXT_color_buffer_float"),o=t.width,a=t.height,i=e?n.RGBA16F:n.RGBA8,s=e?n.HALF_FLOAT:n.UNSIGNED_BYTE,u=(p,g)=>{let T=n.createTexture();n.bindTexture(n.TEXTURE_2D,T),n.texImage2D(n.TEXTURE_2D,0,i,p,g,0,n.RGBA,s,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE);let R=n.createFramebuffer();n.bindFramebuffer(n.FRAMEBUFFER,R),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,T,0);let M=n.checkFramebufferStatus(n.FRAMEBUFFER);return M!==n.FRAMEBUFFER_COMPLETE?_("FRAMEBUFFER_INCOMPLETE",`status 0x${M.toString(16)} at ${p}\xD7${g}`):{texture:T,framebuffer:R,width:p,height:g}},m=r.bloomShift??2,d={w:o,h:a},c=u(o,a);if("kind"in c)return c;let l=u(Math.max(1,o>>m),Math.max(1,a>>m));if("kind"in l)return l;let h=u(Math.max(1,o>>m),Math.max(1,a>>m));if("kind"in h)return h;let f=n.createVertexArray();n.bindVertexArray(f);let E=n.createBuffer();n.bindBuffer(n.ARRAY_BUFFER,E),n.bufferData(n.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),n.STATIC_DRAW),n.enableVertexAttribArray(0),n.vertexAttribPointer(0,2,n.FLOAT,!1,0,0),n.bindVertexArray(null);let x=[];return{kind:"stage",gl:n,cssWidth:t.clientWidth||o,cssHeight:t.clientHeight||a,hdr:!!e,get width(){return d.w},get height(){return d.h},get scene(){return c},get bloomA(){return l},get bloomB(){return h},setRegion(p,g){let T=Math.max(1,Math.round(p)),R=Math.max(1,Math.round(g));if(!(T===d.w&&R===d.h)){d={w:T,h:R};for(let M of[c,l,h])"kind"in M||(n.deleteFramebuffer(M.framebuffer),n.deleteTexture(M.texture));c=u(T,R),l=u(Math.max(1,T>>m),Math.max(1,R>>m)),h=u(Math.max(1,T>>m),Math.max(1,R>>m))}},compile(p,g){let T=(_e,J)=>{let $=n.createShader(_e);return n.shaderSource($,J),n.compileShader($),n.getShaderParameter($,n.COMPILE_STATUS)?$:_("SHADER_COMPILE_FAILED",n.getShaderInfoLog($)??"(no log)")},R=T(n.VERTEX_SHADER,p);if(typeof R=="object"&&"kind"in R)return R;let M=T(n.FRAGMENT_SHADER,g);if(typeof M=="object"&&"kind"in M)return M;let w=n.createProgram();return n.attachShader(w,R),n.attachShader(w,M),n.linkProgram(w),n.getProgramParameter(w,n.LINK_STATUS)?(x.push(w),w):_("PROGRAM_LINK_FAILED",n.getProgramInfoLog(w)??"(no log)")},bindTarget(p){n.bindFramebuffer(n.FRAMEBUFFER,p?p.framebuffer:null),n.viewport(0,0,p?p.width:d.w,p?p.height:d.h)},blit(p,g){n.useProgram(p),n.bindVertexArray(f),g?.(p),n.drawArrays(n.TRIANGLES,0,3),n.bindVertexArray(null)},dispose(){for(let p of x)n.deleteProgram(p);for(let p of[c,l,h])"kind"in p||(n.deleteFramebuffer(p.framebuffer),n.deleteTexture(p.texture));n.deleteBuffer(E),n.deleteVertexArray(f)}}}var je=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function $e(t,r){let n=new Float32Array(16);for(let e=0;e<4;e++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=t[i*4+o]*r[e*4+i];n[e*4+o]=a}return n}var le=(t,r)=>[t[0]-r[0],t[1]-r[1],t[2]-r[2]],ze=(t,r)=>t[0]*r[0]+t[1]*r[1]+t[2]*r[2],ye=(t,r)=>[t[1]*r[2]-t[2]*r[1],t[2]*r[0]-t[0]*r[2],t[0]*r[1]-t[1]*r[0]];function C(t){let r=Math.hypot(t[0],t[1],t[2]);return r===0?t:[t[0]/r,t[1]/r,t[2]/r]}function ht(t,r,n,e){let o=1/Math.tan(t/2);return new Float32Array([o/r,0,0,0,0,o,0,0,0,0,(e+n)/(n-e),-1,0,0,2*e*n/(n-e),0])}function bt(t,r,n,e,o,a){let i=r-t,s=e-n,u=a-o;return new Float32Array([2/i,0,0,0,0,2/s,0,0,0,0,-2/u,0,-(r+t)/i,-(e+n)/s,-(a+o)/u,1])}function Ye(t,r,n){let e=C(le(t,r)),o=ye(n,e);if(Math.hypot(o[0],o[1],o[2])<1e-8)return je();let a=C(o),i=ye(e,a);return new Float32Array([a[0],i[0],e[0],0,a[1],i[1],e[1],0,a[2],i[2],e[2],0,-ze(a,t),-ze(i,t),-ze(e,t),1])}function Er(t,r){let n=[0,1,2,3].map(o=>t[0+o]*r[0]+t[4+o]*r[1]+t[8+o]*r[2]+t[12+o]),e=n[3];return{x:n[0]/e,y:n[1]/e,z:n[2]/e,w:e}}function Te(t,r,n,e){let o=Er(t,r);return{sx:(o.x*.5+.5)*n,sy:(1-(o.y*.5+.5))*e,behind:o.w<=0}}function xr(t){return t<=.04045?t/12.92:Math.pow((t+.055)/1.055,2.4)}function pt(t){return t<=.0031308?t*12.92:1.055*Math.pow(t,1/2.4)-.055}var Rn=/^#?([0-9a-fA-F]{6})$/;function B(t){let r=Rn.exec(t.trim());if(!r)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(t)}`);let n=r[1];return[0,2,4].map(e=>xr(parseInt(n.slice(e,e+2),16)/255))}function Et(t){return`#${t.map(n=>{let e=pt(Math.min(1,Math.max(0,n)));return Math.round(e*255).toString(16).padStart(2,"0")}).join("")}`}var ge={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},xt=Object.freeze(Object.fromEntries(Object.keys(ge).map(t=>[t,B(ge[t])])));var yr=.4;var yt=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${yr.toFixed(2)}); }`,Tt=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function gt(){let t=[];for(let r of Object.keys(ge)){let n=ge[r].toLowerCase(),e=Et(xt[r]).toLowerCase();e!==n&&t.push({key:r,expected:n,actual:e})}return t}function An(t){let r=[1/0,1/0,1/0],n=[-1/0,-1/0,-1/0];for(let e=0;e<t.length;e+=3)for(let o=0;o<3;o++){let a=t[e+o];a<r[o]&&(r[o]=a),a>n[o]&&(n[o]=a)}return t.length===0?{min:[0,0,0],max:[0,0,0]}:{min:r,max:n}}function Tr(t,r,n,e){let o=new Float32Array(t.length);for(let i=0;i<e.length;i+=3){let s=e[i],u=e[i+1],m=e[i+2],d=s*3,c=u*3,l=m*3,h=s*2,f=u*2,E=m*2,x=t[c]-t[d],y=t[c+1]-t[d+1],p=t[c+2]-t[d+2],g=t[l]-t[d],T=t[l+1]-t[d+1],R=t[l+2]-t[d+2],M=n[f]-n[h],w=n[f+1]-n[h+1],_e=n[E]-n[h],J=n[E+1]-n[h+1],$=M*J-_e*w;if(Math.abs($)<1e-12)continue;let V=1/$,yn=(x*J-g*w)*V,Tn=(y*J-T*w)*V,gn=(p*J-R*w)*V;for(let xe of[d,c,l])o[xe]=o[xe]+yn,o[xe+1]=o[xe+1]+Tn,o[xe+2]=o[xe+2]+gn}let a=new Float32Array(t.length);for(let i=0;i<a.length;i+=3){let s=r[i],u=r[i+1],m=r[i+2],d=o[i],c=o[i+1],l=o[i+2],h=d*s+c*u+l*m;d-=s*h,c-=u*h,l-=m*h;let f=Math.hypot(d,c,l);f<1e-8&&(Math.abs(s)<.9?(d=0,c=-m,l=u):(d=-m,c=0,l=s),f=Math.hypot(d,c,l)||1),a[i]=d/f,a[i+1]=c/f,a[i+2]=l/f}return a}function gr(t,r){let n=new Float32Array(t.length);for(let e=0;e<r.length;e+=3){let o=r[e]*3,a=r[e+1]*3,i=r[e+2]*3,s=t[a]-t[o],u=t[a+1]-t[o+1],m=t[a+2]-t[o+2],d=t[i]-t[o],c=t[i+1]-t[o+1],l=t[i+2]-t[o+2],h=u*l-m*c,f=m*d-s*l,E=s*c-u*d;for(let x of[o,a,i])n[x]=n[x]+h,n[x+1]=n[x+1]+f,n[x+2]=n[x+2]+E}for(let e=0;e<n.length;e+=3){let o=Math.hypot(n[e],n[e+1],n[e+2]);o>0&&(n[e]=n[e]/o,n[e+1]=n[e+1]/o,n[e+2]=n[e+2]/o)}return n}function Fn(t,r,n,e,o){let{min:a,max:i}=An(t),s=e??gr(t,n);return{positions:t,normals:s,uvs:r,indices:n,min:a,max:i,tangents:o??Tr(t,s,r,n)}}function Y(t=1,r=1,n=1){let e=t/2,o=r/2,a=n/2,i=[[[-e,-o,a],[e,-o,a],[e,o,a],[-e,o,a]],[[e,-o,-a],[-e,-o,-a],[-e,o,-a],[e,o,-a]],[[e,-o,a],[e,-o,-a],[e,o,-a],[e,o,a]],[[-e,-o,-a],[-e,-o,a],[-e,o,a],[-e,o,-a]],[[-e,o,a],[e,o,a],[e,o,-a],[-e,o,-a]],[[-e,-o,-a],[e,-o,-a],[e,-o,a],[-e,-o,a]]],s=new Float32Array(72),u=new Float32Array(48),m=new Uint16Array(36),d=0,c=0,l=0,h=0;for(let f of i){for(let[E,x,y]of f)s[d++]=E,s[d++]=x,s[d++]=y;u[c++]=0,u[c++]=0,u[c++]=1,u[c++]=0,u[c++]=1,u[c++]=1,u[c++]=0,u[c++]=1,m[l++]=h,m[l++]=h+1,m[l++]=h+2,m[l++]=h,m[l++]=h+2,m[l++]=h+3,h+=4}return Fn(s,u,m)}function K(t){return t.indices.length/3}function Mn(t){if(!Number.isFinite(t)||t===0)return"0";let r=t.toFixed(12).replace(/0+$/,"").replace(/\.$/,"");return r==="-0"?"0":r}function Rr(t,r,n,e){let[o,a]=t,[i,s]=r,[u,m]=n,[d,c]=e,l=o-i+u-d,h=a-s+m-c;if(Math.abs(l)<1e-9&&Math.abs(h)<1e-9){let R=[i-o,d-o,o,s-a,c-a,a,0,0,1],M=R[0]*R[4]-R[1]*R[3];return Math.abs(M)<1e-9?null:R}let f=i-u,E=d-u,x=s-m,y=c-m,p=f*y-E*x;if(Math.abs(p)<1e-9)return null;let g=(l*y-E*h)/p,T=(f*h-l*x)/p;return[i-o+g*i,d-o+T*d,o,s-a+g*s,c-a+T*c,a,g,T,1]}function Ke(t,r,n,e,o,a){if(!(o>0)||!(a>0))return{refusal:"EMPTY_ELEMENT_BOX"};let s=[r.topLeft,r.topRight,r.bottomRight,r.bottomLeft].map(V=>Te(t,V,n,e));if(s.some(V=>V.behind))return{refusal:"CORNER_BEHIND_CAMERA"};let u=s.map(V=>({x:V.sx,y:V.sy})),[m,d,c,l]=u,h=Rr([m.x,m.y],[d.x,d.y],[c.x,c.y],[l.x,l.y]);if(!h)return{refusal:"DEGENERATE_ON_SCREEN"};let f=.5*(m.x*d.y-d.x*m.y+(d.x*c.y-c.x*d.y)+(c.x*l.y-l.x*c.y)+(l.x*m.y-m.x*l.y)),E=1/o,x=1/a,[y,p,g,T,R,M,w,_e,J]=h;return{transform:`matrix3d(${[y*E,T*E,0,w*E,p*x,R*x,0,_e*x,0,0,1,0,g,M,0,J].map(Mn).join(", ")})`,matrix:h,screen:u,signedArea:f}}function Re(t){return"refusal"in t}function Rt(t,r,n,e,o,a,i=0){let s=Math.cos(a),u=Math.sin(a),m=(c,l)=>[t+s*c+u*i,n+l,r-u*c+s*i],d=e/2;return{topLeft:m(-d,o),topRight:m(d,o),bottomRight:m(d,0),bottomLeft:m(-d,0)}}function De(t,r,n,e){let o=-1/0,a=1/0;for(let i=0;i<3;i++){let s=r[i],u=t[i],m=n[i],d=e[i];if(Math.abs(s)<1e-12){if(u<m||u>d)return null;continue}let c=1/s,l=(m-u)*c,h=(d-u)*c;if(l>h){let f=l;l=h,h=f}if(l>o&&(o=l),h<a&&(a=h),o>a)return null}return a<0?null:{tNear:Math.max(0,o),tFar:a}}function Qe(t,r,n){if(!(t>0)||!(r>0))return{steps:0,step:0,truncated:!1};let e=Math.ceil(t/r),o=Math.min(Math.max(1,e),Math.max(1,Math.floor(n)));return{steps:o,step:r,truncated:e>o}}var Ar=`
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
`,vn=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Sn=`#version 300 es
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
${Ar}

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
}`;function At(t,r,n,e){let o=t.gl,a=Math.max(2,Math.floor(r)),i=Math.max(2,Math.floor(n)),s=Math.max(2,Math.floor(e));if(!o.getExtension("OES_texture_float_linear"))return _("MISSING_EXTENSION","the volume needs OES_texture_float_linear for trilinear sampling of the density grid \u2014 without it a float sampler3D silently falls back to NEAREST and the field renders as voxel blocks");let u=t.compile(vn,Sn);if("kind"in u)return u;let m=o.createTexture();o.bindTexture(o.TEXTURE_3D,m),o.texStorage3D(o.TEXTURE_3D,1,o.R32F,a,i,s),o.texParameteri(o.TEXTURE_3D,o.TEXTURE_MIN_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_3D,o.TEXTURE_MAG_FILTER,o.LINEAR);for(let l of[o.TEXTURE_WRAP_S,o.TEXTURE_WRAP_T,o.TEXTURE_WRAP_R])o.texParameteri(o.TEXTURE_3D,l,o.CLAMP_TO_EDGE);o.bindTexture(o.TEXTURE_3D,null);let d=o.createVertexArray(),c=l=>o.getUniformLocation(u,l);return{size:[a,i,s],upload(l){let h=a*i*s,f=l.length===h?l:(()=>{let E=new Float32Array(h);return E.set(l.subarray(0,Math.min(h,l.length))),E})();o.bindTexture(o.TEXTURE_3D,m),o.texSubImage3D(o.TEXTURE_3D,0,0,0,0,a,i,s,o.RED,o.FLOAT,f),o.bindTexture(o.TEXTURE_3D,null)},draw(l){o.useProgram(u),o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_3D,m),o.uniform1i(c("uDensity"),0),o.activeTexture(o.TEXTURE1),o.bindTexture(o.TEXTURE_2D,l.sceneDepth),o.uniform1i(c("uSceneDepth"),1),o.uniform3fv(c("uBoxMin"),l.boxMin),o.uniform3fv(c("uBoxMax"),l.boxMax),o.uniform3fv(c("uEye"),l.eye),o.uniform3fv(c("uForward"),l.forward),o.uniform3fv(c("uRight"),l.right),o.uniform3fv(c("uUp"),l.up),o.uniform1f(c("uTanHalfFov"),Math.tan(l.fovDeg*Math.PI/360)),o.uniform1f(c("uAspect"),l.aspect),o.uniform1f(c("uNear"),l.near),o.uniform1f(c("uFar"),l.far),o.uniform1f(c("uWorldStep"),l.worldStep??.06),o.uniform1i(c("uMaxSteps"),Math.min(256,l.maxSteps??128)),o.uniform1f(c("uDensityScale"),l.densityScale??1),o.uniform3fv(c("uColourLow"),l.colourLow),o.uniform3fv(c("uColourHigh"),l.colourHigh),o.uniform3fv(c("uLightDir"),l.lightDir),o.uniform1f(c("uLightSteps"),Math.min(16,Math.max(0,l.lightSteps??6))),o.uniform1f(c("uEmission"),Math.min(1,Math.max(0,l.emission??.25))),o.enable(o.BLEND),o.blendFunc(o.ONE,o.ONE_MINUS_SRC_ALPHA),o.disable(o.DEPTH_TEST),o.depthMask(!1),o.bindVertexArray(d),o.drawArrays(o.TRIANGLES,0,3),o.bindVertexArray(null),o.depthMask(!0),o.disable(o.BLEND),o.activeTexture(o.TEXTURE1),o.bindTexture(o.TEXTURE_2D,null),o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_3D,null)},dispose(){o.deleteTexture(m),o.deleteVertexArray(d),o.deleteProgram(u)}}}var Ft=89,Mt=Math.PI/180;function Ze(t){let r=Math.max(-Ft,Math.min(Ft,t.elevationDeg))*Mt,n=t.azimuthDeg*Mt,e=Math.max(1e-4,t.distance),o=Math.sin(r)*e,a=Math.cos(r)*e;return[t.target[0]+Math.sin(n)*a,t.target[1]+o,t.target[2]+Math.cos(n)*a]}function qe(t,r){let n=Ze(t),e=t.near??Math.max(.01,t.distance/100),o=t.far??Math.max(e+1,t.distance*8),a=ht((t.fovDeg??38)*Mt,Math.max(.001,r),e,o),i=Ye(n,t.target,[0,1,0]);return $e(a,i)}function vt(t,r,n){let e=C(t.direction),o=t.extent??Math.max(.1,n*1.35),a=Math.max(1,n*2),i=[r[0]-e[0]*a,r[1]-e[1]*a,r[2]-e[2]*a],s=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],u=Ye(i,r,s),m=bt(-o,o,-o,o,.01,a+n*2+o);return $e(m,u)}function St(t,r){let n=le([r[0],r[1],r[2]],[t[0],t[1],t[2]]);return Math.hypot(n[0],n[1],n[2])/2}function _t(t,r){return[(t[0]+r[0])/2,(t[1]+r[1])/2,(t[2]+r[2])/2]}function Le(t,r,n){let{gl:e}=t,o=Math.max(1,Math.floor(r)),a=Math.max(1,Math.floor(n)),i=e.createFramebuffer(),s=e.createTexture(),u=e.createTexture();if(!i||!s||!u)return _("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let m=t.hdr?e.RGBA16F:e.RGBA8,d=t.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,c=()=>{e.bindTexture(e.TEXTURE_2D,s),e.texImage2D(e.TEXTURE_2D,0,m,o,a,0,e.RGBA,d,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,u),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,o,a,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,s,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,u,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};c(),e.bindFramebuffer(e.FRAMEBUFFER,i);let l=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),l!==e.FRAMEBUFFER_COMPLETE?_("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${l.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:s,depthTexture:u,get width(){return o},get height(){return a},bind(){e.bindFramebuffer(e.FRAMEBUFFER,i),e.viewport(0,0,o,a)},resize(h,f){let E=Math.max(1,Math.floor(h)),x=Math.max(1,Math.floor(f));E===o&&x===a||(o=E,a=x,c())},dispose(){e.deleteFramebuffer(i),e.deleteTexture(s),e.deleteTexture(u)}}}function Dt(t,r=1024){let{gl:n}=t,e=Math.max(256,Math.min(2048,Math.floor(r))),o=n.createFramebuffer(),a=n.createTexture();if(!o||!a)return _("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");n.bindTexture(n.TEXTURE_2D,a),n.texImage2D(n.TEXTURE_2D,0,n.DEPTH_COMPONENT24,e,e,0,n.DEPTH_COMPONENT,n.UNSIGNED_INT,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.bindFramebuffer(n.FRAMEBUFFER,o),n.framebufferTexture2D(n.FRAMEBUFFER,n.DEPTH_ATTACHMENT,n.TEXTURE_2D,a,0);let i=n.checkFramebufferStatus(n.FRAMEBUFFER);return n.bindFramebuffer(n.FRAMEBUFFER,null),i!==n.FRAMEBUFFER_COMPLETE?_("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:e,bind(){n.bindFramebuffer(n.FRAMEBUFFER,o),n.viewport(0,0,e,e)},dispose(){n.deleteFramebuffer(o),n.deleteTexture(a)}}}var wt=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,Lt={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function Fr(t,r,n={}){let e=n.zenith??Lt.zenith,o=n.horizon??Lt.horizon,a=n.ground??Lt.ground;t.uniform3f(t.getUniformLocation(r,"uSkyZenith"),e[0],e[1],e[2]),t.uniform3f(t.getUniformLocation(r,"uSkyHorizon"),o[0],o[1],o[2]),t.uniform3f(t.getUniformLocation(r,"uSkyGround"),a[0],a[1],a[2])}var vo=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${wt}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;var Mr=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,Nt=`#version 300 es
precision highp float;
void main(){}`,_n=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,vr=`#version 300 es
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
}`,Sr=`#version 300 es
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
${wt}

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
}`;function Q(t,r){let{gl:n}=t,e=n.createVertexArray(),o=n.createBuffer(),a=n.createBuffer(),i=n.createBuffer(),s=n.createBuffer();return!e||!o||!a||!i||!s?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(n.bindVertexArray(e),n.bindBuffer(n.ARRAY_BUFFER,o),n.bufferData(n.ARRAY_BUFFER,r.positions,n.STATIC_DRAW),n.enableVertexAttribArray(0),n.vertexAttribPointer(0,3,n.FLOAT,!1,0,0),n.bindBuffer(n.ARRAY_BUFFER,a),n.bufferData(n.ARRAY_BUFFER,r.normals,n.STATIC_DRAW),n.enableVertexAttribArray(1),n.vertexAttribPointer(1,3,n.FLOAT,!1,0,0),n.bindBuffer(n.ARRAY_BUFFER,i),n.bufferData(n.ARRAY_BUFFER,r.tangents,n.STATIC_DRAW),n.enableVertexAttribArray(2),n.vertexAttribPointer(2,3,n.FLOAT,!1,0,0),n.bindBuffer(n.ELEMENT_ARRAY_BUFFER,s),n.bufferData(n.ELEMENT_ARRAY_BUFFER,r.indices,n.STATIC_DRAW),n.bindVertexArray(null),{vao:e,indexCount:r.indices.length,indexType:r.indices instanceof Uint32Array?n.UNSIGNED_INT:n.UNSIGNED_SHORT,dispose(){n.deleteVertexArray(e),n.deleteBuffer(o),n.deleteBuffer(a),n.deleteBuffer(i),n.deleteBuffer(s)}})}function Pt(t){let{gl:r}=t,n=t.compile(Mr,Nt);if("kind"in n)return n;let e=t.compile(vr,Sr);if("kind"in e)return e;let o=t.compile(_n,Nt);if("kind"in o)return o;let a=(i,s)=>r.getUniformLocation(i,s);return{shadowPass(i,s,u,m){let d=m??(()=>{});u.bind(),d("shadow.bind"),r.clear(r.DEPTH_BUFFER_BIT),r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.FRONT),r.useProgram(n),d("useProgram(shadow)"),r.uniformMatrix4fv(a(n,"uLightVP"),!1,i),d("uLightVP");for(let c of s)r.uniformMatrix4fv(a(n,"uModel"),!1,c.model),d("shadow uModel"),r.bindVertexArray(c.mesh.vao),d("shadow bindVAO"),r.drawElements(r.TRIANGLES,c.mesh.indexCount,c.mesh.indexType,0),d("shadow drawElements");r.bindVertexArray(null),r.cullFace(r.BACK)},depthPrepass(i,s){r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.colorMask(!1,!1,!1,!1),r.useProgram(o),r.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let u of s)r.uniformMatrix4fv(a(o,"uModel"),!1,u.model),r.bindVertexArray(u.mesh.vao),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0);r.bindVertexArray(null),r.colorMask(!0,!0,!0,!0)},draw(i){let s=i.onStep??(()=>{});if(r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.useProgram(e),r.uniformMatrix4fv(a(e,"uViewProj"),!1,i.viewProj),s("uViewProj"),r.uniform3fv(a(e,"uEye"),i.eye),s("uEye"),r.uniform3fv(a(e,"uLightDir"),i.lightDir),s("uLightDir"),r.uniform3fv(a(e,"uLightColour"),i.lightColour),s("uLightColour"),r.uniform1f(a(e,"uAmbientGain"),i.ambientGain??1),s("uAmbientGain"),i.fog&&i.fog.density>0){r.uniform1f(a(e,"uFogDensity"),i.fog.density),r.uniform1f(a(e,"uFogHeight"),i.fog.height),r.uniform1f(a(e,"uFogFloor"),i.fog.floor??0);let u=i.fog.colour;u==="sky"?r.uniform3f(a(e,"uFogColour"),-1,-1,-1):r.uniform3f(a(e,"uFogColour"),u[0],u[1],u[2]),s("fog")}else r.uniform1f(a(e,"uFogDensity"),0);Fr(r,e,i.sky),s("bindSky"),i.ao&&i.screenSize?(r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,i.ao),r.uniform1i(a(e,"uAO"),1),r.uniform2f(a(e,"uScreenSize"),i.screenSize[0],i.screenSize[1]),r.uniform1f(a(e,"uAOEnabled"),1)):r.uniform1f(a(e,"uAOEnabled"),0),s("bindAO"),r.uniformMatrix4fv(a(e,"uLightVP"),!1,i.lightVP),s("lit uLightVP"),i.shadow?(r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,i.shadow.depthTexture),r.uniform1i(a(e,"uShadowMap"),0),r.uniform1f(a(e,"uShadowTexel"),1/i.shadow.size),r.uniform1f(a(e,"uShadowStrength"),i.shadowStrength??1)):r.uniform1f(a(e,"uShadowStrength"),0);for(let u of i.draws)r.uniformMatrix4fv(a(e,"uModel"),!1,u.model),r.uniformMatrix3fv(a(e,"uNormalMat"),!1,u.normalMat),s("uNormalMat"),r.uniform3fv(a(e,"uBaseColour"),u.material.baseColour),s("uBaseColour"),r.uniform1f(a(e,"uRoughness"),u.material.roughness),r.uniform1f(a(e,"uMetalness"),u.material.metalness),r.uniform1f(a(e,"uAnisotropy"),u.material.anisotropy??0),r.bindVertexArray(u.mesh.vao),s("lit bindVAO"),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0),s("lit drawElements");r.bindVertexArray(null),r.disable(r.CULL_FACE)},dispose(){r.deleteProgram(n),r.deleteProgram(e),r.deleteProgram(o)}}}var Ut=`
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
}`,_r=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Dn=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${Ut}

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
}`,Ln=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${Ut}

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
}`;function Ot(t,r,n){let{gl:e}=t,o=t.compile(_r,Dn);if("kind"in o)return o;let a=t.compile(_r,Ln);if("kind"in a)return a;let i=Math.max(1,r>>1),s=Math.max(1,n>>1),u=()=>{let f=e.createFramebuffer(),E=e.createTexture();return!f||!E?null:{fb:f,tex:E}},m=u(),d=u();if(!m||!d)return _("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let c=()=>{for(let f of[m,d])e.bindTexture(e.TEXTURE_2D,f.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,i,s,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,f.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,f.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};c(),e.bindFramebuffer(e.FRAMEBUFFER,m.fb);let l=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),l!==e.FRAMEBUFFER_COMPLETE)return _("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${l.toString(16)}).`);let h=(f,E,x,y,p,g,T)=>{e.activeTexture(e.TEXTURE0+T),e.bindTexture(e.TEXTURE_2D,E),e.uniform1i(e.getUniformLocation(f,"uDepth"),T),e.uniform2f(e.getUniformLocation(f,"uNearFar"),x,y),e.uniform1f(e.getUniformLocation(f,"uTanHalfFov"),Math.tan(p*Math.PI/360)),e.uniform1f(e.getUniformLocation(f,"uAspect"),g)};return{get texture(){return m.tex},get width(){return i},get height(){return s},compute(f){e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,m.fb),e.viewport(0,0,i,s),e.useProgram(o),h(o,f.depthTexture,f.near,f.far,f.fovDeg,f.aspect,0),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/i,1/s),e.uniform1f(e.getUniformLocation(o,"uRadius"),f.radius??.55),e.uniform1f(e.getUniformLocation(o,"uStrength"),f.strength??1.15),e.uniform1f(e.getUniformLocation(o,"uBias"),f.bias??.035),t.blit(o);for(let[E,x,y]of[[m,d,[1,0]],[d,m,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,x.fb),e.viewport(0,0,i,s),e.useProgram(a),h(a,f.depthTexture,f.near,f.far,f.fovDeg,f.aspect,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,E.tex),e.uniform1i(e.getUniformLocation(a,"uAO"),1),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/i,1/s),e.uniform2f(e.getUniformLocation(a,"uDir"),y[0],y[1]),t.blit(a);e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(f,E){let x=Math.max(1,f>>1),y=Math.max(1,E>>1);x===i&&y===s||(i=x,s=y,c())},dispose(){e.deleteProgram(o),e.deleteProgram(a);for(let f of[m,d])e.deleteFramebuffer(f.fb),e.deleteTexture(f.tex)}}}var Ve=new URLSearchParams(location.search),Cr=Ve.get("vol")!=="0",ar=Ve.get("depth")!=="0",Wt=Ve.get("ao")!=="0",ke=Math.max(1,Math.min(3,Number(Ve.get("scale")??1))),Gr=Number(Ve.get("frames")??300),N=1200*ke,P=720*ke,Fe=document.getElementById("c");Fe.width=N;Fe.height=P;var ir=document.getElementById("log");function Hr(t){throw document.title="REFUSED",ir.textContent=t,new Error(t)}function L(t,r){return"kind"in r&&Hr(`${t}: ${r.code} \u2014 ${r.reason} ${r.detail??""}`),r}var Je=ft(Fe,{alpha:!1});dt(Je)||Hr(`stage: ${Je.code} \u2014 ${Je.reason}`);var F=Je,b=F.gl,Vr=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,wn=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${yt}
${Tt}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,Nn=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uVolume;
out vec4 frag;
void main(){ frag = texture(uVolume, vUv); }`,Pn=L("present",F.compile(Vr,wn)),Un=L("composite",F.compile(Vr,Nn)),Bt=L("lit",Pt(F)),Ae=L("target",Le(F,N,P)),Dr=L("volume target",Le(F,N,P)),kr=L("far depth",Le(F,4,4)),zt=L("shadow",Dt(F,1536)),Lr=L("ao",Ot(F,N,P));kr.bind();b.clearDepth(1);b.clear(b.DEPTH_BUFFER_BIT);b.bindFramebuffer(b.FRAMEBUFFER,null);var W=["PAID_SEARCH","PAID_SOCIAL","INFLUENCER","EMAIL","PR_EARNED","AFFILIATE","COMMUNITY"],it=["ADVISORY","ELEVATED","SEVERE"],U=28,On=[.05,.07,.04,.025,.02,.055,.045],st=[{ch:0,day:1,band:1,w:.3},{ch:3,day:2,band:1,w:.25},{ch:6,day:3,band:1,w:.2},{ch:2,day:4,band:1,w:.5},{ch:2,day:5,band:1,w:.8},{ch:2,day:6,band:2,w:.7},{ch:2,day:7,band:2,w:1},{ch:2,day:8,band:2,w:.9},{ch:2,day:9,band:1,w:.6},{ch:2,day:10,band:1,w:.35},{ch:1,day:6,band:1,w:.4},{ch:1,day:7,band:1,w:.75},{ch:1,day:8,band:2,w:.85},{ch:1,day:9,band:2,w:1.05},{ch:1,day:10,band:2,w:.8},{ch:1,day:11,band:1,w:.5},{ch:1,day:12,band:1,w:.3},{ch:6,day:8,band:1,w:.3},{ch:6,day:9,band:1,w:.55},{ch:6,day:10,band:2,w:.7},{ch:6,day:11,band:2,w:.95},{ch:6,day:12,band:2,w:.75},{ch:6,day:13,band:1,w:.45},{ch:6,day:14,band:1,w:.25},{ch:4,day:10,band:1,w:.35},{ch:4,day:11,band:1,w:.6},{ch:4,day:12,band:2,w:.8},{ch:4,day:13,band:2,w:.6},{ch:4,day:14,band:1,w:.4},{ch:0,day:13,band:1,w:.45},{ch:0,day:14,band:2,w:.75},{ch:0,day:15,band:2,w:.6},{ch:0,day:16,band:1,w:.3},{ch:3,day:14,band:1,w:.4},{ch:3,day:15,band:1,w:.55},{ch:3,day:16,band:1,w:.3},{ch:5,day:24,band:1,w:.5},{ch:5,day:25,band:2,w:.7},{ch:5,day:26,band:1,w:.4}],k=[17,18,19],Xe=[22,23],H=t=>k.includes(t)?"ABSENT":Xe.includes(t)?"WITHHELD":"OBSERVED",ve=W.map((t,r)=>Array.from({length:U},(n,e)=>{let o=[0,0,0];return H(e)==="OBSERVED"&&(o[0]=On[r]),o}));for(let t of st)H(t.day)==="OBSERVED"&&(ve[t.ch][t.day][t.band]+=t.w);var Bn=st.filter(t=>H(t.day)!=="OBSERVED"),Ie=0;for(let t of ve)for(let r of t)for(let n of r)Ie=Math.max(Ie,n);var q=.5,sr=2.6,ha=U*q,Xr=.62,Se=.46,Ce=.06,te=q*.84,X=.56,I=Ce/2,re=t=>(t-(W.length-1)/2)*Xr,O=re(W.length-1)+Se/2,ce=re(0)-Se/2-.03-X/2,ur=ce-X/2,he=(ur+O)/2,v=t=>-sr-t*q,We=t=>v(t)-q/2,ut=.42,lt=I+.02,Wr=lt+it.length*ut,zr=t=>lt+(t+.5)*ut,A=[-O,lt,v(U)],S=[O,Wr,v(0)],ct=.7,lr=Ie*ct/q,ie=76,se=42,be=112,jr=(t,r,n)=>t+ie*(r+se*n),In=t=>{for(let r=0;r<W.length;r++)if(Math.abs(t-re(r))<=Se/2)return r;return-1},Cn=t=>{let r=Math.floor((-t-sr)/q);return r>=0&&r<U?r:-1},Gn=t=>{let r=Math.floor((t-lt)/ut);return r>=0&&r<it.length?r:-1},Hn=(t,r,n)=>{let e=In(t);if(e<0)return 0;let o=Cn(n);if(o<0||H(o)!=="OBSERVED")return 0;let a=Gn(r);if(a<0)return 0;let i=1-Math.abs(r-zr(a))/(ut/2);return i<=0?0:ve[e][o][a]*i/Ie},de=new Float32Array(ie*se*be);for(let t=0;t<be;t++){let r=A[2]+(t+.5)/be*(S[2]-A[2]);for(let n=0;n<se;n++){let e=A[1]+(n+.5)/se*(S[1]-A[1]);for(let o=0;o<ie;o++){let a=A[0]+(o+.5)/ie*(S[0]-A[0]);de[jr(o,n,t)]=Hn(a,e,r)}}}var jt=1/0,$t=-1/0,$r=0,Yt=0;for(let t of de)t<jt&&(jt=t),t>$t&&($t=t),$r+=t,t>0&&Yt++;var me=Cr?At(F,ie,se,be):null,Kt=me&&"kind"in me?`${me.code} \u2014 ${me.reason}`:null,Me=me&&!("kind"in me)?me:null;Me&&Me.upload(de);var Ne=.15,Pe=112,Qt=1,Zt=30,ne={target:[he,.04,We(5.8)],distance:8,azimuthDeg:0,elevationDeg:15.3,fovDeg:36,near:Qt,far:Zt},D=Ze(ne),G=C(le(ne.target,D)),oe=C(ye(G,[0,1,0])),et=C(ye(oe,G)),Z=Math.tan((ne.fovDeg??36)*Math.PI/360),z=N/P,Yr=Y(Se,Ce,te),Kr=Y(X,Ce,te),Qr=Y(2*O,.3,te),Zr=Y(2*O+X+.06,.1,.05),qr=Y(2*O,.07,.05),Jr=Y(2*O,.52,.05),en=Y(.07,1.3,.07),tn=L("tile",Q(F,Yr)),rn=L("gutter",Q(F,Kr)),nn=L("lid",Q(F,Qr)),on=L("rail",Q(F,Zr)),an=L("week bar",Q(F,qr)),sn=L("gate",Q(F,Jr)),Vn=L("post",Q(F,en)),kn=new Float32Array([1,0,0,0,1,0,0,0,1]),Xn=(t,r,n)=>{let e=je();return e[12]=t,e[13]=r,e[14]=n,e},ee={tile:{baseColour:B("#101B2F"),roughness:.78,metalness:.02},gutter:{baseColour:B("#0C1424"),roughness:.86,metalness:0},withheldTile:{baseColour:B("#26355A"),roughness:.52,metalness:.12},lid:{baseColour:B("#6B7A99"),roughness:.28,metalness:.58},rail:{baseColour:B("#6B7A99"),roughness:.4,metalness:.3},week:{baseColour:B("#26355A"),roughness:.6,metalness:.05},gate:{baseColour:B("#7FB2FF"),roughness:.34,metalness:.2}},cr=[],Ue=[],fe=(t,r,n,e,o,a,i,s)=>{Ue.push({mesh:i,model:Xn(t,r,n),normalMat:kn,material:s}),cr.push({min:[t-e/2,r-o/2,n-a/2],max:[t+e/2,r+o/2,n+a/2]})},un=0,ln=0;for(let t=0;t<U;t++){let r=H(t),n=We(t);if(r==="ABSENT"){ln+=W.length+1;continue}fe(ce,0,n,X,Ce,te,rn,ee.gutter);for(let e=0;e<W.length;e++)fe(re(e),0,n,Se,Ce,te,tn,r==="WITHHELD"?ee.withheldTile:ee.tile);un+=W.length+1,r==="WITHHELD"&&fe(0,I+.15,n,2*O,.3,te,nn,ee.lid)}var Wn=[v(Math.min(...k))+.02,v(Math.max(...k)+1)-.02];for(let t of Wn)fe(he,I+.05,t,2*O+X+.06,.1,.05,on,ee.rail);var cn=[7,14,21,28];for(let t of cn)fe(0,I+.035,v(t),2*O,.07,.05,an,ee.week);var mr=10,we=0,j=-1,tt=null,qt=[];for(let t=0;t<U;t++){if(H(t)!=="OBSERVED"){qt.push(we),j<0&&tt===null&&(tt=H(t)==="ABSENT"?"THRESHOLD_NOT_REACHED_BEFORE_UNMEASURED_DAY":"THRESHOLD_NOT_REACHED_BEFORE_WITHHELD_DAY");continue}for(let r=0;r<W.length;r++)for(let n=0;n<it.length;n++)we+=ve[r][t][n];qt.push(we),j<0&&we>=mr&&(j=t,tt=null)}if(j>=0){fe(0,I+.26,v(j),2*O,.52,.05,sn,ee.gate);for(let t of[-O,O])fe(t,I+.65,v(j),.07,1.3,.07,Vn,ee.gate)}var zn=Math.min(...k),Jt=Math.min(...Xe),mn=t=>{let r=H(t);return r==="ABSENT"?"DAY_NOT_MEASURED":r==="WITHHELD"?"DAY_WITHHELD":t>zn?"INTEGRAL_CROSSES_UNMEASURED_DAY":t>Jt?"INTEGRAL_CROSSES_WITHHELD_DAY":"INTEGRABLE"},dr=Math.max(...Array.from({length:U},(t,r)=>r).filter(t=>mn(t)==="INTEGRABLE")),er=[.44,-.66,-.61],wr=[ur-.2,0,v(U)-.3],Nr=[O+.2,Wr,-sr+.3],Pr=vt({direction:er,colour:[1,1,1],extent:9.5},_t(wr,Nr),St(wr,Nr)),jn=Ue.reduce((t,r)=>t+(r.mesh===tn?K(Yr):r.mesh===rn?K(Kr):r.mesh===nn?K(Qr):r.mesh===on?K(Zr):r.mesh===an?K(qr):r.mesh===sn?K(Jr):K(en)),0),It=B("#070B14"),$n={zenith:[.01,.014,.03],horizon:[.03,.044,.08],ground:[.006,.007,.012]},Ct=B("#2C6BFF"),Gt=B("#FF8A3D"),Yn=[Ct[0]*2.2,Ct[1]*2.2,Ct[2]*2.2],Kn=[Gt[0]*3.4,Gt[1]*3.4,Gt[2]*3.4];function Ge(t=ar){let r=qe(ne,z);Bt.shadowPass(Pr,Ue,zt),Ae.bind(),b.clearColor(It[0],It[1],It[2],1),b.clear(b.COLOR_BUFFER_BIT|b.DEPTH_BUFFER_BIT),Bt.depthPrepass(r,Ue),Wt&&(Lr.compute({depthTexture:Ae.depthTexture,near:Qt,far:Zt,fovDeg:ne.fovDeg??36,aspect:z,radius:.34,strength:1.15}),Ae.bind()),Bt.draw({viewProj:r,eye:D,lightDir:er,lightColour:[2.6,2.55,2.45],ambientGain:.55,sky:$n,lightVP:Pr,shadow:zt,shadowStrength:.92,draws:Ue,ao:Wt?Lr.texture:null,screenSize:[N,P]}),Me&&(Dr.bind(),b.clearColor(0,0,0,0),b.clear(b.COLOR_BUFFER_BIT|b.DEPTH_BUFFER_BIT),Me.draw({eye:D,forward:G,right:oe,up:et,fovDeg:ne.fovDeg??36,aspect:z,near:Qt,far:Zt,sceneDepth:t?Ae.depthTexture:kr.depthTexture,boxMin:A,boxMax:S,worldStep:Ne,maxSteps:Pe,densityScale:lr,colourLow:Yn,colourHigh:Kn,lightDir:er,lightSteps:5,emission:.34}),Ae.bind(),b.enable(b.BLEND),b.blendFunc(b.ONE,b.ONE_MINUS_SRC_ALPHA),b.disable(b.DEPTH_TEST),b.activeTexture(b.TEXTURE0),b.bindTexture(b.TEXTURE_2D,Dr.texture),F.blit(Un,n=>b.uniform1i(b.getUniformLocation(n,"uVolume"),0)),b.disable(b.BLEND)),b.bindFramebuffer(b.FRAMEBUFFER,null),b.viewport(0,0,N,P),b.disable(b.DEPTH_TEST),b.activeTexture(b.TEXTURE0),b.bindTexture(b.TEXTURE_2D,Ae.texture),F.blit(Pn,n=>b.uniform1i(b.getUniformLocation(n,"uScene"),0))}function Qn(t){Ge();let r=new Uint8Array(4);b.readPixels(0,0,1,1,b.RGBA,b.UNSIGNED_BYTE,r);let n=performance.now();for(let e=0;e<t;e++)Ge();return b.readPixels(0,0,1,1,b.RGBA,b.UNSIGNED_BYTE,r),(performance.now()-n)/t}var Ht=Qn(Math.max(1,Gr));function Zn(){if(!Me)return{pixels:0,pct:0};let t=new Uint8Array(N*P*4),r=new Uint8Array(N*P*4);Ge(!0),b.readPixels(0,0,N,P,b.RGBA,b.UNSIGNED_BYTE,t),Ge(!1),b.readPixels(0,0,N,P,b.RGBA,b.UNSIGNED_BYTE,r);let n=0;for(let e=0;e<t.length;e+=4)(Math.abs(t[e]-r[e])>2||Math.abs(t[e+1]-r[e+1])>2||Math.abs(t[e+2]-r[e+2])>2)&&n++;return{pixels:n,pct:Number((100*n/(N*P)).toFixed(2))}}var Ur=Zn(),qn=(t,r,n)=>{let e=(t-A[0])/(S[0]-A[0]),o=(r-A[1])/(S[1]-A[1]),a=(n-A[2])/(S[2]-A[2]);if(e<0||e>1||o<0||o>1||a<0||a>1)return 0;let i=e*ie-.5,s=o*se-.5,u=a*be-.5,m=Math.floor(i),d=Math.floor(s),c=Math.floor(u),l=i-m,h=s-d,f=u-c,E=(y,p)=>y<0?0:y>p-1?p-1:y,x=0;for(let y=0;y<2;y++)for(let p=0;p<2;p++)for(let g=0;g<2;g++){let T=(g?l:1-l)*(p?h:1-h)*(y?f:1-f);T<=0||(x+=T*de[jr(E(m+g,ie),E(d+p,se),E(c+y,be))])}return x*lr},dn=(t,r,n)=>{let e=De(t,r,A,S);if(!e)return{tau:0,truncated:!1,capped:!1,hit:!1};let o=Math.min(e.tFar,n),a=n<e.tFar;if(o<=e.tNear)return{tau:0,truncated:!1,capped:a,hit:!0};let i=Qe(o-e.tNear,Ne,Pe),s=0;for(let u=0;u<i.steps;u++){let m=e.tNear+(u+.5)*i.step;if(m>o)break;let d=qn(t[0]+r[0]*m,t[1]+r[1]*m,t[2]+r[2]*m);d<=5e-4||(s+=d*i.step)}return{tau:s,truncated:i.truncated,capped:a,hit:!0}},ae=W.flatMap((t,r)=>it.map((n,e)=>{let o=ve[r].reduce((s,u,m)=>s+(H(m)==="OBSERVED"?u[e]:0),0),a=dn([re(r),zr(e),S[2]+1],[0,0,-1],1/0),i=a.tau/ct;return{channel:t,band:n,expected:Number(o.toFixed(4)),measured:Number(i.toFixed(4)),errorPct:o>1e-6?Number((100*Math.abs(i-o)/o).toFixed(2)):0,truncated:a.truncated}})),Jn=Math.max(...ae.map(t=>t.errorPct)),eo=Number((ae.reduce((t,r)=>t+r.errorPct,0)/ae.length).toFixed(3)),to=t=>{let r=1/0;for(let n of cr){let e=De(D,t,n.min,n.max);e&&e.tNear>0&&e.tNear<r&&(r=e.tNear)}return r},Oe=61,Be=37,rt=0,fn=0,hn=0,He=1/0,ot=0,bn=0;for(let t=0;t<Be;t++)for(let r=0;r<Oe;r++){let n=2*(r+.5)/Oe-1,e=2*(t+.5)/Be-1,o=C([G[0]+oe[0]*n*Z*z+et[0]*e*Z,G[1]+oe[1]*n*Z*z+et[1]*e*Z,G[2]+oe[2]*n*Z*z+et[2]*e*Z]),a=dn(D,o,to(o));a.hit&&(rt++,a.capped&&fn++,a.truncated&&hn++,He=Math.min(He,a.tau),ot=Math.max(ot,a.tau),bn+=a.tau)}Number.isFinite(He)||(He=0);var tr=t=>{let r=C([G[0]+oe[0]*t*Z*z,G[1]+oe[1]*t*Z*z,G[2]+oe[2]*t*Z*z]),n=De(D,r,A,S);if(!n)return 0;let e=D[0]+r[0]*n.tNear,o=D[0]+r[0]*n.tFar;return Math.abs(o-e)/Xr},ro=Number(Math.max(tr(-1),tr(1)).toFixed(2)),no=Number(tr(0).toFixed(3)),at=qe(ne,z),pe=N/ke,Ee=P/ke,mt=document.createElement("div");mt.style.cssText=`position:relative;overflow:hidden;width:${pe}px;height:${Ee}px`;Fe.parentNode?.insertBefore(mt,Fe);mt.appendChild(Fe);var ue=document.createElement("div");ue.style.cssText="position:absolute;inset:0;pointer-events:none";mt.appendChild(ue);var oo=t=>{let r=(i,s)=>Math.hypot(i.x-s.x,i.y-s.y),n=t[0],e=t[1],o=t[2],a=t[3];return{ew:Math.max(1,Math.round(Math.max(r(n,e),r(a,o)))),eh:Math.max(1,Math.round(Math.max(r(n,a),r(e,o))))}},ao=26,io=15,Vt=[],Or=(t,r,n)=>{let e=0;for(let o=0;o<4;o++){let a=t[o],i=t[(o+1)%4],s=(i.x-a.x)*(n-a.y)-(i.y-a.y)*(r-a.x);if(Math.abs(s)<1e-9)continue;let u=s>0?1:-1;if(e===0)e=u;else if(u!==e)return!1}return!0},pn=(t,r,n,e)=>{let o=Math.hypot(n[0]-D[0],n[1]-D[1],n[2]-D[2]),a=Ke(at,r,pe,Ee,100,100);if(Re(a))return{key:t,proj:a,ew:0,eh:0,distance:o,shown:!1,reason:a.refusal,widthPx:0,heightPx:0};let{ew:i,eh:s}=oo(a.screen),u=Ke(at,r,pe,Ee,i,s),m=a.signedArea<=0,d=e??(m?"BACK_FACING":i<ao?"EDGE_ON":s<io?"TOO_FLAT":a.screen.filter(l=>Vt.some(h=>Or(h,l.x,l.y))).length+Vt.reduce((l,h)=>l+h.filter(f=>Or(a.screen.map(E=>({x:E.x,y:E.y})),f.x,f.y)).length,0)>=2?"OCCLUDED":null),c=d===null&&!Re(u);return c&&Vt.push(a.screen.map(l=>({x:l.x,y:l.y}))),{key:t,proj:u,ew:i,eh:s,distance:o,shown:c,reason:d,widthPx:i,heightPx:s}},rr=W.map((t,r)=>{let n=Rt(re(r),v(0)+.04,I+.02,Se,.15,Math.atan2(D[0]-re(r),D[2]-v(0)),.01);return{...pn(`ch:${t}`,n,[re(r),I+.09,v(0)+.04],null),name:t,total:Number(ve[r].reduce((e,o,a)=>e+(H(a)==="OBSERVED"?o.reduce((i,s)=>i+s,0):0),0).toFixed(2))}}),nr=Array.from({length:U},(t,r)=>r).map(t=>{let r=H(t),n=v(t)-(q-te)/2,e=n-te,o=I+.004,a={topLeft:[ce-X/2,o,e],topRight:[ce+X/2,o,e],bottomRight:[ce+X/2,o,n],bottomLeft:[ce-X/2,o,n]},i=r==="ABSENT"?"DAY_NOT_MEASURED":null;return{...pn(`day:${t}`,a,[ce,o,We(t)],i),day:t,state:r}}).sort((t,r)=>t.distance-r.distance),Br=t=>t.filter(r=>!r.shown).reduce((r,n)=>{let e=n.reason??"UNKNOWN";return r[e]=(r[e]??0)+1,r},{});for(let t of[...rr].sort((r,n)=>n.distance-r.distance)){if(!t.shown||Re(t.proj))continue;let r=document.createElement("div");r.style.cssText=`position:absolute;left:0;top:0;width:${t.ew}px;height:${t.eh}px;transform-origin:0 0;transform:${t.proj.transform};display:flex;align-items:center;justify-content:center;overflow:hidden;-webkit-font-smoothing:antialiased`,r.innerHTML=`<div style="font:600 9.5px/1 ui-monospace,monospace;letter-spacing:.08em;color:rgba(220,232,255,0.92);white-space:nowrap">${t.name}</div>`,ue.appendChild(r)}for(let t of[...nr].sort((r,n)=>n.distance-r.distance)){if(!t.shown||Re(t.proj))continue;let r=document.createElement("div");r.style.cssText=`position:absolute;left:0;top:0;width:${t.ew}px;height:${t.eh}px;transform-origin:0 0;transform:${t.proj.transform};display:flex;align-items:center;justify-content:center;overflow:hidden;-webkit-font-smoothing:antialiased`;let n=t.state==="WITHHELD"?"WITHHELD":`D${t.day}`,e=t.state==="WITHHELD"?"#B7C2D8":"rgba(200,216,244,0.88)";r.innerHTML=`<div style="font:600 10px/1 ui-monospace,monospace;letter-spacing:.06em;color:${e};white-space:nowrap">${n}</div>`,ue.appendChild(r)}var fr=(t,r,n,e)=>{let o=Te(at,t,pe,Ee),a=!o.behind&&o.sx>-60&&o.sx<pe+60&&o.sy>0&&o.sy<Ee;if(a){let i=document.createElement("div");i.style.cssText=`position:absolute;left:${o.sx.toFixed(1)}px;top:${o.sy.toFixed(1)}px;transform:translate(-50%,-50%);font:600 9.5px/1 ui-monospace,monospace;letter-spacing:.1em;color:${n};border:1px solid ${e};padding:3px 6px;white-space:nowrap;background:rgba(6,10,18,0.72)`,i.textContent=r,ue.appendChild(i)}return{onFrame:a,sx:Math.round(o.sx),sy:Math.round(o.sy)}},so=fr([he,I+.3,We((Math.min(...k)+Math.max(...k))/2)],`D${Math.min(...k)}\u2013D${Math.max(...k)} NOT MEASURED`,"#E0A94A","rgba(224,169,74,0.55)"),uo=fr([he,I+.42,We(Jt+.5)],`D${Jt}\u2013D${Math.max(...Xe)} WITHHELD`,"#B7C2D8","rgba(183,194,216,0.5)"),lo=j>=0?fr([he,I+.78,v(j)],`REVIEW THRESHOLD ${mr} \xB7 D${j}`,"#9EC4FF","rgba(158,196,255,0.5)"):{onFrame:!1,sx:0,sy:0},kt=cn.map(t=>{let r=t-1<=dr,n=[ur-.1,I+.02,v(t)],e=Te(at,n,pe,Ee),o=!e.behind&&e.sx>-40&&e.sx<pe&&e.sy>0&&e.sy<Ee;if(o){let a=document.createElement("div");a.style.cssText=`position:absolute;left:${Math.max(4,e.sx).toFixed(1)}px;top:${e.sy.toFixed(1)}px;transform:translate(0,-50%);font:500 10px/1.35 ui-monospace,monospace;letter-spacing:.07em;white-space:nowrap;color:${r?"rgba(196,212,240,0.85)":"#E0A94A"}`,a.innerHTML=r?`D${t}`:`D${t}<br>NO INTEGRAL`,ue.appendChild(a)}return{day:t,readable:r,onFrame:o,sx:Math.round(e.sx),sy:Math.round(e.sy)}}),hr=document.createElement("div");hr.style.cssText="position:absolute;left:18px;top:16px;display:flex;flex-direction:column;gap:7px";hr.innerHTML=`<div style="font:600 11px/1 ui-monospace,monospace;letter-spacing:.16em;color:#8FB7FF">MARKETING RISK \xB7 DEPTH IS DAYS AHEAD</div><div style="font:400 10.5px/1.55 ui-monospace,monospace;color:rgba(196,212,240,0.86)">THE DEPTH OF COLOUR IS THE TOTAL RISK BETWEEN YOU AND THAT DAY<br>${q} m PER DAY &nbsp;\xB7&nbsp; ${ct} OPTICAL DEPTH PER RISK UNIT<br>INTEGRABLE TO D${dr} &nbsp;\xB7&nbsp; CALENDAR VISIBLE TO D${U-1}${Me?"":" &nbsp;\xB7&nbsp; FIELD NOT RENDERED"}</div><div style="font:500 10px/1.45 ui-monospace,monospace;color:#E0A94A">SYNTHETIC RISK DATA \xB7 ${st.length} HAND-AUTHORED FLAGGED ITEMS${Kt?`<br>VOLUME REFUSED \xB7 ${Kt.split(" \u2014 ")[0]}`:""}${ar?"":"<br>SCENE DEPTH OFF \u2014 THE FIELD IS PAINTED OVER THE GEOMETRY"}</div>`;ue.appendChild(hr);var nt={OBSERVED:Array.from({length:U},(t,r)=>r).filter(t=>H(t)==="OBSERVED").length,ABSENT:k.length,WITHHELD:Xe.length},br=document.createElement("div");br.style.cssText="position:absolute;right:18px;bottom:16px;display:flex;flex-direction:column;gap:6px;align-items:flex-end;font:500 10.5px/1 ui-monospace,monospace";br.innerHTML=[["#2C6BFF","ADVISORY \u2014 low band"],["#8E86C4","ELEVATED \u2014 mid band"],["#FF8A3D","SEVERE \u2014 high band"],["#101B2F",`OBSERVED \xB7 ${nt.OBSERVED} days`],["transparent",`NOT MEASURED \xB7 ${nt.ABSENT} days (hole in the floor)`],["#6B7A99",`WITHHELD \xB7 ${nt.WITHHELD} days (lid, measured, not shown)`]].map(([t,r])=>`<div style="display:flex;align-items:center;gap:7px;color:rgba(196,212,240,0.85)"><span>${r}</span><span style="width:11px;height:11px;background:${t};border:1px solid rgba(196,212,240,0.45);display:inline-block"></span></div>`).join("");ue.appendChild(br);var En=(()=>{let t=b.getExtension("WEBGL_debug_renderer_info");return t?String(b.getParameter(t.UNMASKED_RENDERER_WEBGL)):"unknown"})(),Xt=/swiftshader|llvmpipe|software/i.test(En),or=gt();if(or.length>0){let t="BRAND FIDELITY FAILED \u2014 "+or.map(r=>`${r.key}: expected ${r.expected}, got ${r.actual}`).join("; ");throw document.title="REFUSED",ir.textContent=t,new Error(t)}var Ir=t=>{let r=C(le(t,D));return Number((Math.acos(Math.max(-1,Math.min(1,r[0]*G[0]+r[1]*G[1]+r[2]*G[2])))*180/Math.PI).toFixed(2))},xn={brandFidelity:or,volume:Cr,volumeRefusal:Kt,sceneDepth:ar,ao:Wt,hdr:F.hdr,eye:D.map(t=>Number(t.toFixed(2))),integrableToDay:dr,visibleToDay:U-1,metresPerDay:q,riskToTau:ct,reviewThreshold:mr,frontDay:j,frontRefusal:tt,totalObservedRisk:Number(we.toFixed(3)),days:nt,absentDays:k,withheldDays:Xe,absentRenderedAs:"FLOOR_HOLE_PLUS_EDGE_RAILS",withheldRenderedAs:"STEEL_LID_ON_INTACT_TILE",observedRenderedAs:"TILE_PLUS_VOLUMETRIC_MASS",readingStates:Array.from({length:U},(t,r)=>r).reduce((t,r)=>{let n=mn(r);return t[n]=(t[n]??0)+1,t},{}),flaggedItems:st.length,flaggedLostToNonObservedDays:Bn.length,gridSize:[ie,se,be],gridVoxels:de.length,fieldMin:Number(jt.toFixed(5)),fieldMax:Number($t.toFixed(5)),fieldMean:Number(($r/de.length).toFixed(6)),fieldNonZeroVoxels:Yt,fieldOccupancyPct:Number((100*Yt/de.length).toFixed(2)),densityScale:Number(lr.toFixed(4)),maxCell:Number(Ie.toFixed(3)),worldStep:Ne,maxSteps:Pe,marchReachM:Number((Ne*Pe).toFixed(2)),boxDiagonalM:Number(Math.hypot(S[0]-A[0],S[1]-A[1],S[2]-A[2]).toFixed(2)),longestRayPlan:Qe(Math.hypot(S[0]-A[0],S[1]-A[1],S[2]-A[2]),Ne,Pe),eyeRays:{sweep:`${Oe}x${Be}`,total:Oe*Be,hitBox:rt,missedBox:Oe*Be-rt,geometryCapped:fn,truncated:hn,tauMin:Number(He.toFixed(4)),tauMax:Number(ot.toFixed(4)),tauMean:Number((bn/Math.max(1,rt)).toFixed(4)),alphaMax:Number((1-Math.exp(-ot)).toFixed(3))},axialCheck:{rays:ae.length,maxErrorPct:Jn,meanErrorPct:eo,truncated:ae.filter(t=>t.truncated).length},centreRayLaneDrift:no,edgeRayLaneDrift:ro,glOcclusionPixels:Ur.pixels,glOcclusionPct:Ur.pct,halfFovDeg:Number(((ne.fovDeg??36)/2).toFixed(2)),nearEdgeOffAxisDeg:Ir([he,0,v(0)]),farEdgeOffAxisDeg:Ir([he,0,v(U)]),channelLabels:{shown:rr.filter(t=>t.shown).length,refusedBy:Br(rr)},dateLabels:{shown:nr.filter(t=>t.shown).length,refusedBy:Br(nr)},weekTicksOffFrame:kt.filter(t=>!t.onFrame).length,weekTicksRefusingIntegral:kt.filter(t=>!t.readable).length,markersOnFrame:{absent:so.onFrame,withheld:uo.onFrame,gate:lo.onFrame},triangles:jn,tilesDrawn:un,tilesOmittedForAbsence:ln,solids:cr.length,shadowMap:zt.size,resolution:`${N}x${P}`,dprScale:ke,frames:Gr,msPerFrame:Number(Ht.toFixed(3)),fps:Math.round(1e3/Ht),glError:b.getError(),renderer:En,rendererClass:Xt?"software":"hardware",headroom:Xt?null:Number((16.6-Ht).toFixed(3)),headroomRefusal:Xt?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null,hardwareMsPerFrame:null,axialRays:ae,cumulativeByDay:qt.map(t=>Number(t.toFixed(2))),weekTicks:kt};globalThis.E7=xn;var{axialRays:ba,cumulativeByDay:pa,weekTicks:Ea,...co}=xn;ir.textContent=JSON.stringify(co,null,2)+`

axialCheck per (channel, band) \u2014 ${ae.length} rays, full detail on globalThis.E7:
`+ae.map(t=>`  ${t.channel.padEnd(12)} b${t.band} expected ${String(t.expected).padStart(7)} measured ${String(t.measured).padStart(7)} err ${String(t.errorPct).padStart(5)}%`).join(`
`);Ge();document.title="READY";

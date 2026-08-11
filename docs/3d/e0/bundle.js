var Ce={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable."};function v(n,r){return r===void 0?{kind:"refused",code:n,reason:Ce[n]}:{kind:"refused",code:n,reason:Ce[n],detail:r}}function ae(n){return n.kind==="stage"}function ie(n,r={}){let t=n.getContext("webgl2",{antialias:r.antialias??!1,alpha:r.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!t)return v("NO_WEBGL2");let e=t.getExtension("EXT_color_buffer_float"),o=n.width,a=n.height,i=e?t.RGBA16F:t.RGBA8,s=e?t.HALF_FLOAT:t.UNSIGNED_BYTE,u=(b,R)=>{let x=t.createTexture();t.bindTexture(t.TEXTURE_2D,x),t.texImage2D(t.TEXTURE_2D,0,i,b,R,0,t.RGBA,s,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);let A=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,A),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,x,0);let L=t.checkFramebufferStatus(t.FRAMEBUFFER);return L!==t.FRAMEBUFFER_COMPLETE?v("FRAMEBUFFER_INCOMPLETE",`status 0x${L.toString(16)} at ${b}\xD7${R}`):{texture:x,framebuffer:A,width:b,height:R}},c=r.bloomShift??2,d={w:o,h:a},f=u(o,a);if("kind"in f)return f;let m=u(Math.max(1,o>>c),Math.max(1,a>>c));if("kind"in m)return m;let h=u(Math.max(1,o>>c),Math.max(1,a>>c));if("kind"in h)return h;let l=t.createVertexArray();t.bindVertexArray(l);let E=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,E),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null);let g=[];return{kind:"stage",gl:t,cssWidth:n.clientWidth||o,cssHeight:n.clientHeight||a,hdr:!!e,get width(){return d.w},get height(){return d.h},get scene(){return f},get bloomA(){return m},get bloomB(){return h},setRegion(b,R){let x=Math.max(1,Math.round(b)),A=Math.max(1,Math.round(R));if(!(x===d.w&&A===d.h)){d={w:x,h:A};for(let L of[f,m,h])"kind"in L||(t.deleteFramebuffer(L.framebuffer),t.deleteTexture(L.texture));f=u(x,A),m=u(Math.max(1,x>>c),Math.max(1,A>>c)),h=u(Math.max(1,x>>c),Math.max(1,A>>c))}},compile(b,R){let x=(rt,nt)=>{let G=t.createShader(rt);return t.shaderSource(G,nt),t.compileShader(G),t.getShaderParameter(G,t.COMPILE_STATUS)?G:v("SHADER_COMPILE_FAILED",t.getShaderInfoLog(G)??"(no log)")},A=x(t.VERTEX_SHADER,b);if(typeof A=="object"&&"kind"in A)return A;let L=x(t.FRAGMENT_SHADER,R);if(typeof L=="object"&&"kind"in L)return L;let _=t.createProgram();return t.attachShader(_,A),t.attachShader(_,L),t.linkProgram(_),t.getProgramParameter(_,t.LINK_STATUS)?(g.push(_),_):v("PROGRAM_LINK_FAILED",t.getProgramInfoLog(_)??"(no log)")},bindTarget(b){t.bindFramebuffer(t.FRAMEBUFFER,b?b.framebuffer:null),t.viewport(0,0,b?b.width:d.w,b?b.height:d.h)},blit(b,R){t.useProgram(b),t.bindVertexArray(l),R?.(b),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null)},dispose(){for(let b of g)t.deleteProgram(b);for(let b of[f,m,h])"kind"in b||(t.deleteFramebuffer(b.framebuffer),t.deleteTexture(b.texture));t.deleteBuffer(E),t.deleteVertexArray(l)}}}var Y=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function $(n,r){let t=new Float32Array(16);for(let e=0;e<4;e++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=n[i*4+o]*r[e*4+i];t[e*4+o]=a}return t}var C=(n,r)=>[n[0]-r[0],n[1]-r[1],n[2]-r[2]],j=(n,r)=>n[0]*r[0]+n[1]*r[1]+n[2]*r[2],B=(n,r)=>[n[1]*r[2]-n[2]*r[1],n[2]*r[0]-n[0]*r[2],n[0]*r[1]-n[1]*r[0]];function w(n){let r=Math.hypot(n[0],n[1],n[2]);return r===0?n:[n[0]/r,n[1]/r,n[2]/r]}function se(n,r,t,e){let o=1/Math.tan(n/2);return new Float32Array([o/r,0,0,0,0,o,0,0,0,0,(e+t)/(t-e),-1,0,0,2*e*t/(t-e),0])}function ue(n,r,t,e,o,a){let i=r-n,s=e-t,u=a-o;return new Float32Array([2/i,0,0,0,0,2/s,0,0,0,0,-2/u,0,-(r+n)/i,-(e+t)/s,-(a+o)/u,1])}function K(n,r,t){let e=w(C(n,r)),o=B(t,e);if(Math.hypot(o[0],o[1],o[2])<1e-8)return Y();let a=w(o),i=B(e,a);return new Float32Array([a[0],i[0],e[0],0,a[1],i[1],e[1],0,a[2],i[2],e[2],0,-j(a,n),-j(i,n),-j(e,n),1])}function ke(n){return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4)}var ot=/^#?([0-9a-fA-F]{6})$/;function k(n){let r=ot.exec(n.trim());if(!r)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(n)}`);let t=r[1];return[0,2,4].map(e=>ke(parseInt(t.slice(e,e+2),16)/255))}var le={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},at=Object.freeze(Object.fromEntries(Object.keys(le).map(n=>[n,k(le[n])])));var Ie=.4;var ce=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${Ie.toFixed(2)}); }`,de=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function it(n){let r=[1/0,1/0,1/0],t=[-1/0,-1/0,-1/0];for(let e=0;e<n.length;e+=3)for(let o=0;o<3;o++){let a=n[e+o];a<r[o]&&(r[o]=a),a>t[o]&&(t[o]=a)}return n.length===0?{min:[0,0,0],max:[0,0,0]}:{min:r,max:t}}function Ge(n,r){let t=new Float32Array(n.length);for(let e=0;e<r.length;e+=3){let o=r[e]*3,a=r[e+1]*3,i=r[e+2]*3,s=n[a]-n[o],u=n[a+1]-n[o+1],c=n[a+2]-n[o+2],d=n[i]-n[o],f=n[i+1]-n[o+1],m=n[i+2]-n[o+2],h=u*m-c*f,l=c*d-s*m,E=s*f-u*d;for(let g of[o,a,i])t[g]=t[g]+h,t[g+1]=t[g+1]+l,t[g+2]=t[g+2]+E}for(let e=0;e<t.length;e+=3){let o=Math.hypot(t[e],t[e+1],t[e+2]);o>0&&(t[e]=t[e]/o,t[e+1]=t[e+1]/o,t[e+2]=t[e+2]/o)}return t}function fe(n,r,t,e){let{min:o,max:a}=it(n);return{positions:n,normals:e??Ge(n,t),uvs:r,indices:t,min:o,max:a}}function me(n=1,r=1,t=1){let e=n/2,o=r/2,a=t/2,i=[[[-e,-o,a],[e,-o,a],[e,o,a],[-e,o,a]],[[e,-o,-a],[-e,-o,-a],[-e,o,-a],[e,o,-a]],[[e,-o,a],[e,-o,-a],[e,o,-a],[e,o,a]],[[-e,-o,-a],[-e,-o,a],[-e,o,a],[-e,o,-a]],[[-e,o,a],[e,o,a],[e,o,-a],[-e,o,-a]],[[-e,-o,-a],[e,-o,-a],[e,-o,a],[-e,-o,a]]],s=new Float32Array(72),u=new Float32Array(48),c=new Uint16Array(36),d=0,f=0,m=0,h=0;for(let l of i){for(let[E,g,T]of l)s[d++]=E,s[d++]=g,s[d++]=T;u[f++]=0,u[f++]=0,u[f++]=1,u[f++]=0,u[f++]=1,u[f++]=1,u[f++]=0,u[f++]=1,c[m++]=h,c[m++]=h+1,c[m++]=h+2,c[m++]=h,c[m++]=h+2,c[m++]=h+3,h+=4}return fe(s,u,c)}function he(n=10,r=24){let t=Math.max(1,Math.floor(r)),e=(t+1)*(t+1),o=new Float32Array(e*3),a=new Float32Array(e*3),i=new Float32Array(e*2),s=new Uint16Array(t*t*6),u=0,c=0,d=0;for(let f=0;f<=t;f++)for(let m=0;m<=t;m++){let h=(m/t-.5)*n,l=(f/t-.5)*n;o[u]=h,o[u+1]=0,o[u+2]=l,a[u]=0,a[u+1]=1,a[u+2]=0,u+=3,i[c++]=m/t,i[c++]=f/t}for(let f=0;f<t;f++)for(let m=0;m<t;m++){let h=f*(t+1)+m,l=h+1,E=h+(t+1),g=E+1;s[d++]=h,s[d++]=E,s[d++]=l,s[d++]=l,s[d++]=E,s[d++]=g}return fe(o,i,s,a)}function pe(n=.5,r=24,t=32){let e=Math.max(2,r),o=Math.max(3,t),a=(e+1)*(o+1),i=new Float32Array(a*3),s=new Float32Array(a*3),u=new Float32Array(a*2),c=new Uint16Array(e*o*6),d=0,f=0,m=0;for(let h=0;h<=e;h++){let l=h/e*Math.PI;for(let E=0;E<=o;E++){let g=E/o*Math.PI*2,T=Math.sin(l)*Math.cos(g),b=Math.cos(l),R=Math.sin(l)*Math.sin(g);i[d]=T*n,i[d+1]=b*n,i[d+2]=R*n,s[d]=T,s[d+1]=b,s[d+2]=R,d+=3,u[f++]=E/o,u[f++]=h/e}}for(let h=0;h<e;h++)for(let l=0;l<o;l++){let E=h*(o+1)+l,g=E+1,T=E+(o+1),b=T+1;c[m++]=E,c[m++]=g,c[m++]=T,c[m++]=g,c[m++]=b,c[m++]=T}return fe(i,u,c,s)}function V(n){return n.indices.length/3}var Ee=89,be=Math.PI/180;function D(n){let r=Math.max(-Ee,Math.min(Ee,n.elevationDeg))*be,t=n.azimuthDeg*be,e=Math.max(1e-4,n.distance),o=Math.sin(r)*e,a=Math.cos(r)*e;return[n.target[0]+Math.sin(t)*a,n.target[1]+o,n.target[2]+Math.cos(t)*a]}function H(n,r){let t=D(n),e=n.near??Math.max(.01,n.distance/100),o=n.far??Math.max(e+1,n.distance*8),a=se((n.fovDeg??38)*be,Math.max(.001,r),e,o),i=K(t,n.target,[0,1,0]);return $(a,i)}function ge(n,r,t){let e=w(n.direction),o=n.extent??Math.max(.1,t*1.35),a=Math.max(1,t*2),i=[r[0]-e[0]*a,r[1]-e[1]*a,r[2]-e[2]*a],s=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],u=K(i,r,s),c=ue(-o,o,-o,o,.01,a+t*2+o);return $(c,u)}function Te(n,r){let t=C([r[0],r[1],r[2]],[n[0],n[1],n[2]]);return Math.hypot(t[0],t[1],t[2])/2}function xe(n,r){return[(n[0]+r[0])/2,(n[1]+r[1])/2,(n[2]+r[2])/2]}function Re(n,r,t){let{gl:e}=n,o=Math.max(1,Math.floor(r)),a=Math.max(1,Math.floor(t)),i=e.createFramebuffer(),s=e.createTexture(),u=e.createTexture();if(!i||!s||!u)return v("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let c=n.hdr?e.RGBA16F:e.RGBA8,d=n.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,f=()=>{e.bindTexture(e.TEXTURE_2D,s),e.texImage2D(e.TEXTURE_2D,0,c,o,a,0,e.RGBA,d,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,u),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,o,a,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,s,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,u,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};f(),e.bindFramebuffer(e.FRAMEBUFFER,i);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE?v("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${m.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:s,depthTexture:u,get width(){return o},get height(){return a},bind(){e.bindFramebuffer(e.FRAMEBUFFER,i),e.viewport(0,0,o,a)},resize(h,l){let E=Math.max(1,Math.floor(h)),g=Math.max(1,Math.floor(l));E===o&&g===a||(o=E,a=g,f())},dispose(){e.deleteFramebuffer(i),e.deleteTexture(s),e.deleteTexture(u)}}}function ye(n,r=1024){let{gl:t}=n,e=Math.max(256,Math.min(2048,Math.floor(r))),o=t.createFramebuffer(),a=t.createTexture();if(!o||!a)return v("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");t.bindTexture(t.TEXTURE_2D,a),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,e,e,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,o),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,a,0);let i=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),i!==t.FRAMEBUFFER_COMPLETE?v("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:e,bind(){t.bindFramebuffer(t.FRAMEBUFFER,o),t.viewport(0,0,e,e)},dispose(){t.deleteFramebuffer(o),t.deleteTexture(a)}}}var Q=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
/* A three-stop vertical gradient in LINEAR radiance. smoothstep rather than a linear ramp:
   a linear blend across a large dark field bands visibly, and the horizon is where the eye is
   most sensitive to it. */
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,q={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function Z(n,r,t={}){let e=t.zenith??q.zenith,o=t.horizon??q.horizon,a=t.ground??q.ground;n.uniform3f(n.getUniformLocation(r,"uSkyZenith"),e[0],e[1],e[2]),n.uniform3f(n.getUniformLocation(r,"uSkyHorizon"),o[0],o[1],o[2]),n.uniform3f(n.getUniformLocation(r,"uSkyGround"),a[0],a[1],a[2])}var st=`#version 300 es
precision highp float;
out vec2 vNdc;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`,ut=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${Q}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;function Ae(n){let{gl:r}=n,t=n.compile(st,ut);return"kind"in t?t:{draw(e){let o=w(C(e.target,e.eye)),a=Math.abs(o[1])>.999?[0,0,1]:[0,1,0],i=w(B(o,a)),s=w(B(i,o));r.disable(r.DEPTH_TEST),r.depthMask(!1),r.disable(r.BLEND),r.useProgram(t),r.uniform3f(r.getUniformLocation(t,"uRight"),i[0],i[1],i[2]),r.uniform3f(r.getUniformLocation(t,"uUp"),s[0],s[1],s[2]),r.uniform3f(r.getUniformLocation(t,"uForward"),o[0],o[1],o[2]),r.uniform1f(r.getUniformLocation(t,"uTanHalfFov"),Math.tan(e.fovDeg*Math.PI/360)),r.uniform1f(r.getUniformLocation(t,"uAspect"),Math.max(.001,e.aspect)),Z(r,t,e.sky),n.blit(t),r.depthMask(!0),r.enable(r.DEPTH_TEST)},dispose(){r.deleteProgram(t)}}}var Ve=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,ve=`#version 300 es
precision highp float;
void main(){}`,lt=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,He=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform mat3 uNormalMat;
out vec3 vWorld;
out vec3 vNormal;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorld = world.xyz;
  /* THE NORMAL MATRIX, not the model matrix. Under non-uniform scale the model matrix skews
     normals off the surface and the lighting rotates as the object is squashed \u2014 the transpose
     of the inverse is the only transform that keeps them perpendicular. */
  vNormal = normalize(uNormalMat * aNormal);
  gl_Position = uViewProj * world;
}`,Xe=`#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;

uniform vec3 uEye;
uniform vec3 uLightDir;      // direction the light TRAVELS
uniform vec3 uLightColour;   // linear radiance
uniform float uAmbientGain;  // scales the environment's contribution
uniform vec3 uBaseColour;    // linear, brand-exact
uniform float uRoughness;
uniform float uMetalness;

uniform mat4 uLightVP;
uniform sampler2D uShadowMap;
uniform float uShadowTexel;  // 1.0 / shadowMapSize
uniform float uShadowStrength;

uniform sampler2D uAO;
uniform vec2 uScreenSize;
uniform float uAOEnabled;

out vec4 frag;
${Q}

const float PI = 3.14159265359;

float distributionGGX(float NdotH, float rough) {
  float a = rough * rough;
  float a2 = a * a;
  float d = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / max(1e-6, PI * d * d);
}

float geometrySmith(float NdotV, float NdotL, float rough) {
  // Schlick-GGX with the direct-lighting k. Using the IBL k here is a common copy-paste error
  // that makes rough surfaces too dark at grazing angles.
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
  /* OUTSIDE THE LIGHT FRUSTUM IS LIT, NOT SHADOWED. Returning 0 here would drop everything
     beyond the shadow extent into darkness \u2014 a hard rectangular edge across the floor that
     looks like a bug in the geometry rather than a shadow map that ran out of room. */
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;

  // SLOPE-SCALED BIAS \u2014 see the header. Constant bias cannot fix acne and peter-panning at once.
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

  float D = distributionGGX(NdotH, rough);
  float G = geometrySmith(NdotV, NdotL, rough);
  vec3  F = fresnelSchlick(VdotH, f0);

  vec3 spec = (D * G * F) / max(1e-6, 4.0 * NdotV * NdotL + 1e-4);
  // Metals have no diffuse lobe \u2014 the energy went into the specular. Not cosmetic: a metallic
  // surface with a diffuse term reads as painted plastic.
  vec3 kd = (1.0 - F) * (1.0 - uMetalness);
  vec3 diffuse = kd * uBaseColour / PI;

  float shadow = shadowFactor(vWorld, NdotL);
  vec3 direct = (diffuse + spec) * uLightColour * NdotL * shadow;

  /*
   * THE ENVIRONMENT TERM \u2014 and this is what stopped the metal being black.
   *
   * A metal has essentially no diffuse lobe, so almost everything visible on it is reflected
   * environment. E0 rendered a metalness-0.92 sphere nearly black and the material was right:
   * there was nothing to reflect.
   *
   * DIFFUSE irradiance is the sky sampled along the normal. SPECULAR is the sky sampled along
   * the reflection, lerped toward the normal by roughness \u2014 with an analytic sky there is
   * nothing to prefilter, so moving the sample direction lets the gradient do the blurring. A
   * mirror samples R, a rough surface samples near N, and highlights stretch and soften
   * together, which is the behaviour that reads as "material" rather than "shader".
   */
  vec3 R = reflect(-V, N);
  vec3 envDiffuse = skyColour(N) * uBaseColour * (1.0 - uMetalness);
  vec3 envSpecular = skyColour(normalize(mix(R, N, rough * rough))) * fresnelSchlick(NdotV, f0);
  /*
   * AO MULTIPLIES THE ENVIRONMENT TERM ONLY, never the direct light.
   *
   * Ambient occlusion answers "how much of the sky can this point see", so it belongs on the
   * sky's contribution and nowhere else. Applying it to the whole colour \u2014 which is what a
   * post-process multiply would do \u2014 darkens the direct highlight as well, and a lit surface
   * whose specular dims inside a crease reads as dirt rather than as shadow. The shadow MAP
   * already handles the direct term.
   */
  float ao = uAOEnabled > 0.5 ? texture(uAO, gl_FragCoord.xy / uScreenSize).r : 1.0;
  vec3 ambient = (envDiffuse + envSpecular) * uAmbientGain * ao;

  // NO TONE MAP. The composite owns the only one in the pipeline.
  frag = vec4(direct + ambient, 1.0);
}`;function Fe(n,r){let{gl:t}=n,e=t.createVertexArray(),o=t.createBuffer(),a=t.createBuffer(),i=t.createBuffer();return!e||!o||!a||!i?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(t.bindVertexArray(e),t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,r.positions,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,a),t.bufferData(t.ARRAY_BUFFER,r.normals,t.STATIC_DRAW),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,i),t.bufferData(t.ELEMENT_ARRAY_BUFFER,r.indices,t.STATIC_DRAW),t.bindVertexArray(null),{vao:e,indexCount:r.indices.length,indexType:r.indices instanceof Uint32Array?t.UNSIGNED_INT:t.UNSIGNED_SHORT,dispose(){t.deleteVertexArray(e),t.deleteBuffer(o),t.deleteBuffer(a),t.deleteBuffer(i)}})}function Se(n){let{gl:r}=n,t=n.compile(Ve,ve);if("kind"in t)return t;let e=n.compile(He,Xe);if("kind"in e)return e;let o=n.compile(lt,ve);if("kind"in o)return o;let a=(i,s)=>r.getUniformLocation(i,s);return{shadowPass(i,s,u,c){let d=c??(()=>{});u.bind(),d("shadow.bind"),r.clear(r.DEPTH_BUFFER_BIT),r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.FRONT),r.useProgram(t),d("useProgram(shadow)"),r.uniformMatrix4fv(a(t,"uLightVP"),!1,i),d("uLightVP");for(let f of s)r.uniformMatrix4fv(a(t,"uModel"),!1,f.model),d("shadow uModel"),r.bindVertexArray(f.mesh.vao),d("shadow bindVAO"),r.drawElements(r.TRIANGLES,f.mesh.indexCount,f.mesh.indexType,0),d("shadow drawElements");r.bindVertexArray(null),r.cullFace(r.BACK)},depthPrepass(i,s){r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.colorMask(!1,!1,!1,!1),r.useProgram(o),r.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let u of s)r.uniformMatrix4fv(a(o,"uModel"),!1,u.model),r.bindVertexArray(u.mesh.vao),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0);r.bindVertexArray(null),r.colorMask(!0,!0,!0,!0)},draw(i){let s=i.onStep??(()=>{});r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.useProgram(e),r.uniformMatrix4fv(a(e,"uViewProj"),!1,i.viewProj),s("uViewProj"),r.uniform3fv(a(e,"uEye"),i.eye),s("uEye"),r.uniform3fv(a(e,"uLightDir"),i.lightDir),s("uLightDir"),r.uniform3fv(a(e,"uLightColour"),i.lightColour),s("uLightColour"),r.uniform1f(a(e,"uAmbientGain"),i.ambientGain??1),s("uAmbientGain"),Z(r,e,i.sky),s("bindSky"),i.ao&&i.screenSize?(r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,i.ao),r.uniform1i(a(e,"uAO"),1),r.uniform2f(a(e,"uScreenSize"),i.screenSize[0],i.screenSize[1]),r.uniform1f(a(e,"uAOEnabled"),1)):r.uniform1f(a(e,"uAOEnabled"),0),s("bindAO"),r.uniformMatrix4fv(a(e,"uLightVP"),!1,i.lightVP),s("lit uLightVP"),i.shadow?(r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,i.shadow.depthTexture),r.uniform1i(a(e,"uShadowMap"),0),r.uniform1f(a(e,"uShadowTexel"),1/i.shadow.size),r.uniform1f(a(e,"uShadowStrength"),i.shadowStrength??1)):r.uniform1f(a(e,"uShadowStrength"),0);for(let u of i.draws)r.uniformMatrix4fv(a(e,"uModel"),!1,u.model),r.uniformMatrix3fv(a(e,"uNormalMat"),!1,u.normalMat),s("uNormalMat"),r.uniform3fv(a(e,"uBaseColour"),u.material.baseColour),s("uBaseColour"),r.uniform1f(a(e,"uRoughness"),u.material.roughness),r.uniform1f(a(e,"uMetalness"),u.material.metalness),r.bindVertexArray(u.mesh.vao),s("lit bindVAO"),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0),s("lit drawElements");r.bindVertexArray(null),r.disable(r.CULL_FACE)},dispose(){r.deleteProgram(t),r.deleteProgram(e),r.deleteProgram(o)}}}var Le=`
uniform sampler2D uDepth;
uniform vec2 uNearFar;
uniform float uTanHalfFov;
uniform float uAspect;

/* Hardware depth is nonlinear \u2014 most of its precision sits near the eye. Linearising it is the
   difference between an AO radius that means the same thing everywhere and one that silently
   shrinks with distance. */
float linearDepthAt(vec2 uv) {
  float d = texture(uDepth, uv).r * 2.0 - 1.0;
  float n = uNearFar.x, f = uNearFar.y;
  return (2.0 * n * f) / (f + n - d * (f - n));
}

vec3 viewPosAt(vec2 uv) {
  float z = linearDepthAt(uv);
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x * uTanHalfFov * uAspect * z, ndc.y * uTanHalfFov * z, -z);
}`,ze=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,ct=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${Le}

/* A cheap hash for per-pixel kernel rotation. Without it the same 12 directions are used at
   every pixel and the occlusion shows as banding that follows the kernel's shape \u2014 the tell
   that says "SSAO" rather than "shadow". */
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main(){
  float centreDepth = linearDepthAt(vUv);
  /* THE FAR PLANE IS NOT OCCLUDED. Sky fragments have depth 1.0 and no geometry; sampling
     around them produces a dark halo along every silhouette against the backdrop. */
  if (centreDepth >= uNearFar.y * 0.999) { frag = vec4(1.0); return; }

  vec3 p = viewPosAt(vUv);
  /*
   * A DEGENERATE DERIVATIVE PRODUCES A NaN NORMAL, AND ONE NaN NORMAL IS A BLOCK OF GARBAGE.
   *
   * The depth texture is full resolution and sampled NEAREST, while this pass runs at half. A
   * one-half-texel offset can therefore land on the SAME full-res texel, making dx or dy exactly
   * zero \u2014 and normalize of a zero-length cross product is NaN, which then fails every
   * comparison below and leaves structured stair-step blocks across flat faces. That is what the
   * first capture showed: not noise, but a pattern following the sampling grid.
   *
   * Two fixes together: step a FULL two texels so the samples cannot collide, and use a CENTRAL
   * difference, which is both twice the baseline and correct on a curved surface rather than
   * biased toward one side.
   */
  vec2 e = uTexel * 2.0;
  vec3 dx = viewPosAt(vUv + vec2(e.x, 0.0)) - viewPosAt(vUv - vec2(e.x, 0.0));
  vec3 dy = viewPosAt(vUv + vec2(0.0, e.y)) - viewPosAt(vUv - vec2(0.0, e.y));
  vec3 nRaw = cross(dx, dy);
  float nLen = length(nRaw);
  /* Still degenerate \u2014 a silhouette where both neighbours straddle a depth cliff. Treat as
     unoccluded rather than emitting NaN: a wrong-but-finite value is recoverable, a NaN is not. */
  if (nLen < 1e-8) { frag = vec4(1.0); return; }
  vec3 n = nRaw / nLen;

  float ang = hash(gl_FragCoord.xy) * 6.2831853;
  float ca = cos(ang), sa = sin(ang);

  float occlusion = 0.0;
  const int SAMPLES = 12;
  for (int i = 0; i < SAMPLES; i++) {
    float t = (float(i) + 0.5) / float(SAMPLES);
    /* A spiral rather than a ring: a single-radius ring measures enclosure at exactly one
       distance and misses both the tight crease and the broad corner. */
    float r = uRadius * sqrt(t);
    float a = ang + t * 6.2831853 * 3.0;
    vec2 offDir = vec2(cos(a) * ca - sin(a) * sa, cos(a) * sa + sin(a) * ca);
    /* Screen-space step for a constant WORLD-space radius: divide by view depth and by the
       frustum half-width at unit distance. The previous magic 0.5 over-reached at this FOV and
       sampled across whole objects, which is what put occlusion where there was none. */
    vec2 suv = vUv + offDir * (r / max(0.35, -p.z)) / (2.0 * uTanHalfFov);
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;

    vec3 s = viewPosAt(suv);
    vec3 dir = s - p;
    float len = length(dir);
    if (len < 1e-4) continue;
    float cosine = max(0.0, dot(n, dir / len) - uBias);
    /* RANGE CHECK. Without it a distant object behind a silhouette counts as an occluder and
       paints a dark outline around every foreground shape \u2014 the other classic SSAO artefact. */
    float atten = uRadius / (uRadius + len);
    occlusion += cosine * atten;
  }
  occlusion = clamp(1.0 - (occlusion / float(SAMPLES)) * uStrength, 0.0, 1.0);
  frag = vec4(occlusion, occlusion, occlusion, 1.0);
}`,dt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${Le}

void main(){
  /* BILATERAL, not Gaussian. A plain blur bleeds occlusion across a silhouette, so a dark
     crease behind an object smears onto the object in front of it. Weighting by depth
     similarity keeps the blur inside a surface. */
  float centre = linearDepthAt(vUv);
  float sum = 0.0, wsum = 0.0;
  for (int i = -4; i <= 4; i++) {
    vec2 off = uDir * uTexel * float(i);
    float w = exp(-float(i * i) / 8.0);
    float d = linearDepthAt(vUv + off);
    // Reject across a depth step. 8% of the centre depth is generous enough to survive a
    // sloped surface and tight enough to stop a silhouette leaking.
    float dw = exp(-abs(d - centre) / max(0.05, centre * 0.08));
    sum += texture(uAO, vUv + off).r * w * dw;
    wsum += w * dw;
  }
  float v = wsum > 0.0 ? sum / wsum : 1.0;
  frag = vec4(v, v, v, 1.0);
}`;function Me(n,r,t){let{gl:e}=n,o=n.compile(ze,ct);if("kind"in o)return o;let a=n.compile(ze,dt);if("kind"in a)return a;let i=Math.max(1,r>>1),s=Math.max(1,t>>1),u=()=>{let l=e.createFramebuffer(),E=e.createTexture();return!l||!E?null:{fb:l,tex:E}},c=u(),d=u();if(!c||!d)return v("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let f=()=>{for(let l of[c,d])e.bindTexture(e.TEXTURE_2D,l.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,i,s,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,l.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,l.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};f(),e.bindFramebuffer(e.FRAMEBUFFER,c.fb);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE)return v("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${m.toString(16)}).`);let h=(l,E,g,T,b,R,x)=>{e.activeTexture(e.TEXTURE0+x),e.bindTexture(e.TEXTURE_2D,E),e.uniform1i(e.getUniformLocation(l,"uDepth"),x),e.uniform2f(e.getUniformLocation(l,"uNearFar"),g,T),e.uniform1f(e.getUniformLocation(l,"uTanHalfFov"),Math.tan(b*Math.PI/360)),e.uniform1f(e.getUniformLocation(l,"uAspect"),R)};return{get texture(){return c.tex},get width(){return i},get height(){return s},compute(l){e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,c.fb),e.viewport(0,0,i,s),e.useProgram(o),h(o,l.depthTexture,l.near,l.far,l.fovDeg,l.aspect,0),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/i,1/s),e.uniform1f(e.getUniformLocation(o,"uRadius"),l.radius??.55),e.uniform1f(e.getUniformLocation(o,"uStrength"),l.strength??1.15),e.uniform1f(e.getUniformLocation(o,"uBias"),l.bias??.035),n.blit(o);for(let[E,g,T]of[[c,d,[1,0]],[d,c,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,g.fb),e.viewport(0,0,i,s),e.useProgram(a),h(a,l.depthTexture,l.near,l.far,l.fovDeg,l.aspect,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,E.tex),e.uniform1i(e.getUniformLocation(a,"uAO"),1),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/i,1/s),e.uniform2f(e.getUniformLocation(a,"uDir"),T[0],T[1]),n.blit(a);e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(l,E){let g=Math.max(1,l>>1),T=Math.max(1,E>>1);g===i&&T===s||(i=g,s=T,f())},dispose(){e.deleteProgram(o),e.deleteProgram(a);for(let l of[c,d])e.deleteFramebuffer(l.fb),e.deleteTexture(l.tex)}}}var Oe=Math.max(1,Math.min(3,Number(new URLSearchParams(location.search).get("scale")??1))),F=1280*Oe,S=800*Oe,Be=document.getElementById("c");Be.width=F;Be.height=S;var X=ie(Be,{alpha:!1});if(!ae(X))throw document.title="REFUSED",document.getElementById("log").textContent=`refused: ${X.code} \u2014 ${X.reason}`,new Error(X.reason);var M=X,p=M.gl,ft=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,mt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${ce}
${de}
void main(){
  vec3 c = texture(uScene, vUv).rgb;
  frag = vec4(lcxEncode(lcxToneMap(c)), 1.0);
}`,Ne=M.compile(ft,mt),N=Se(M),P=Re(M,F,S),U=ye(M,1024),ee=Ae(M),te=Me(M,F,S),O=n=>{throw document.title="REFUSED",document.getElementById("log").textContent=n,new Error(n)},I=n=>`${n.reason}
${n.detail??""}`;"kind"in Ne&&O(`present: ${I(Ne)}`);"kind"in N&&O(`lit: ${I(N)}`);"kind"in P&&O(`target: ${I(P)}`);"kind"in U&&O(`shadow: ${I(U)}`);"kind"in ee&&O(`sky: ${I(ee)}`);"kind"in te&&O(`ao: ${I(te)}`);var Ye=he(14,24),$e=me(1.4,1.4,1.4),Ke=pe(.75,32,48),we=[Ye,$e,Ke].map(n=>{let r=Fe(M,n);return"kind"in r&&O(`mesh: ${r.reason}`),r}),_e=(n,r,t)=>{let e=Y();return e[12]=n,e[13]=r,e[14]=t,e},De=new Float32Array([1,0,0,0,1,0,0,0,1]),z=[{mesh:we[0],model:_e(0,0,0),normalMat:De,material:{baseColour:k("#0E1628"),roughness:.82,metalness:0}},{mesh:we[1],model:_e(-1.15,.7,0),normalMat:De,material:{baseColour:k("#2C6BFF"),roughness:.34,metalness:.05}},{mesh:we[2],model:_e(1.15,.75,.3),normalMat:De,material:{baseColour:k("#C9D4E4"),roughness:Ze?.045:.18,metalness:.92}}],W={direction:[-.45,-1,-.35],colour:[3.4,3.3,3.05]},qe=[-7,0,-7],Qe=[7,2.2,7],ht=xe(qe,Qe),We=Te(qe,Qe),re=ge({...W,extent:We*.8},ht,We),y={target:[0,.6,0],distance:7.2,azimuthDeg:34,elevationDeg:22,fovDeg:36},Ze=new URLSearchParams(location.search).get("diag")==="1",Ue=new URLSearchParams(location.search).get("ao")!=="0",pt={zenith:[1.6,.05,.05],horizon:[.05,.08,1.6],ground:[.05,1.2,.05]},ne=Ze?pt:void 0,Je=Math.max(1,Number(new URLSearchParams(location.search).get("repeat")??1));function oe(){let n=H(y,F/S),r=D(y);N.shadowPass(re,z,U),P.bind(),p.clear(p.DEPTH_BUFFER_BIT),ee.draw({eye:r,target:y.target,fovDeg:y.fovDeg??36,aspect:F/S,sky:ne});let t=Math.max(.01,y.distance/100),e=Math.max(t+1,y.distance*8);N.depthPrepass(n,z),Ue&&(te.compute({depthTexture:P.depthTexture,near:t,far:e,fovDeg:y.fovDeg??36,aspect:F/S,radius:.6,strength:1.25}),P.bind());for(let o=0;o<Je;o++)N.draw({viewProj:n,eye:r,lightDir:W.direction,lightColour:W.colour,ambientGain:1,sky:ne,lightVP:re,shadow:U,shadowStrength:.92,draws:z,ao:Ue?te.texture:null,screenSize:[F,S]});p.bindFramebuffer(p.FRAMEBUFFER,null),p.viewport(0,0,F,S),p.disable(p.DEPTH_TEST),p.activeTexture(p.TEXTURE0),p.bindTexture(p.TEXTURE_2D,P.texture),M.blit(Ne,o=>p.uniform1i(p.getUniformLocation(o,"uScene"),0))}oe();function Et(n){oe();let r=new Uint8Array(4);p.readPixels(0,0,1,1,p.RGBA,p.UNSIGNED_BYTE,r);let t=performance.now();for(let e=0;e<n;e++)oe();return p.readPixels(0,0,1,1,p.RGBA,p.UNSIGNED_BYTE,r),(performance.now()-t)/n}var et=Number(new URLSearchParams(location.search).get("frames")??600),J=(()=>{for(;p.getError()!==p.NO_ERROR;);let n=[],r=a=>{let i=p.getError();i!==p.NO_ERROR&&n.push(`${a}=0x${i.toString(16)}`)};N.shadowPass(re,z,U,r),P.bind(),r("target.bind"),p.clear(p.DEPTH_BUFFER_BIT),r("clear"),ee.draw({eye:D(y),target:y.target,fovDeg:y.fovDeg??36,aspect:F/S,sky:ne}),r("sky"),N.draw({viewProj:H(y,F/S),eye:D(y),lightDir:W.direction,lightColour:W.colour,ambientGain:1,sky:ne,lightVP:re,shadow:U,shadowStrength:.92,draws:z,onStep:r});let t=p.getError(),e=new Uint8Array(4);p.readPixels(F>>1,S>>2,1,1,p.RGBA,p.UNSIGNED_BYTE,e);let o=p.getError();return{centre:Array.from(e),afterDraw:t,afterRead:o,bad:n}})(),bt=V(Ye)+V($e)+V(Ke),Pe=Et(Math.max(1,et)),je=(()=>{let n=H(y,F/S),r=-1.15,t=1.4,e=0,o=n[0]*r+n[4]*t+n[8]*e+n[12],a=n[1]*r+n[5]*t+n[9]*e+n[13],i=n[3]*r+n[7]*t+n[11]*e+n[15];return{ndc:[Number((o/i).toFixed(3)),Number((a/i).toFixed(3))],w:Number(i.toFixed(3))}})(),tt={hdr:M.hdr,eye:D(y).map(n=>Number(n.toFixed(2))),boxTopNdc:je.ndc,boxTopW:je.w,targetCentre:J.centre,failingCalls:J.bad,glAfterDraw:J.afterDraw,glAfterRead:J.afterRead,triangles:bt,shadowMap:U.size,resolution:`${F}x${S}`,dprScale:Oe,aoEnabled:Ue,frames:et,repeat:Je,msPerFrame:Number(Pe.toFixed(3)),fps:Math.round(1e3/Pe),budget60:16.6,headroom:Number((16.6-Pe).toFixed(3)),renderer:(()=>{let n=p.getExtension("WEBGL_debug_renderer_info");return n?String(p.getParameter(n.UNMASKED_RENDERER_WEBGL)):"unknown"})()};globalThis.E0=tt;document.getElementById("log").textContent=JSON.stringify(tt,null,2);oe();document.title="READY";

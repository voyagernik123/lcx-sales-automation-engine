var Ge={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable."};function x(n,r){return r===void 0?{kind:"refused",code:n,reason:Ge[n]}:{kind:"refused",code:n,reason:Ge[n],detail:r}}function se(n){return n.kind==="stage"}function ue(n,r={}){let t=n.getContext("webgl2",{antialias:r.antialias??!1,alpha:r.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!t)return x("NO_WEBGL2");let e=t.getExtension("EXT_color_buffer_float"),o=n.width,a=n.height,i=e?t.RGBA16F:t.RGBA8,s=e?t.HALF_FLOAT:t.UNSIGNED_BYTE,u=(T,F)=>{let R=t.createTexture();t.bindTexture(t.TEXTURE_2D,R),t.texImage2D(t.TEXTURE_2D,0,i,T,F,0,t.RGBA,s,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);let L=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,L),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,R,0);let S=t.checkFramebufferStatus(t.FRAMEBUFFER);return S!==t.FRAMEBUFFER_COMPLETE?x("FRAMEBUFFER_INCOMPLETE",`status 0x${S.toString(16)} at ${T}\xD7${F}`):{texture:R,framebuffer:L,width:T,height:F}},d=r.bloomShift??2,f={w:o,h:a},l=u(o,a);if("kind"in l)return l;let m=u(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in m)return m;let h=u(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in h)return h;let c=t.createVertexArray();t.bindVertexArray(c);let E=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,E),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null);let b=[];return{kind:"stage",gl:t,cssWidth:n.clientWidth||o,cssHeight:n.clientHeight||a,hdr:!!e,get width(){return f.w},get height(){return f.h},get scene(){return l},get bloomA(){return m},get bloomB(){return h},setRegion(T,F){let R=Math.max(1,Math.round(T)),L=Math.max(1,Math.round(F));if(!(R===f.w&&L===f.h)){f={w:R,h:L};for(let S of[l,m,h])"kind"in S||(t.deleteFramebuffer(S.framebuffer),t.deleteTexture(S.texture));l=u(R,L),m=u(Math.max(1,R>>d),Math.max(1,L>>d)),h=u(Math.max(1,R>>d),Math.max(1,L>>d))}},compile(T,F){let R=(at,it)=>{let k=t.createShader(at);return t.shaderSource(k,it),t.compileShader(k),t.getShaderParameter(k,t.COMPILE_STATUS)?k:x("SHADER_COMPILE_FAILED",t.getShaderInfoLog(k)??"(no log)")},L=R(t.VERTEX_SHADER,T);if(typeof L=="object"&&"kind"in L)return L;let S=R(t.FRAGMENT_SHADER,F);if(typeof S=="object"&&"kind"in S)return S;let U=t.createProgram();return t.attachShader(U,L),t.attachShader(U,S),t.linkProgram(U),t.getProgramParameter(U,t.LINK_STATUS)?(b.push(U),U):x("PROGRAM_LINK_FAILED",t.getProgramInfoLog(U)??"(no log)")},bindTarget(T){t.bindFramebuffer(t.FRAMEBUFFER,T?T.framebuffer:null),t.viewport(0,0,T?T.width:f.w,T?T.height:f.h)},blit(T,F){t.useProgram(T),t.bindVertexArray(c),F?.(T),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null)},dispose(){for(let T of b)t.deleteProgram(T);for(let T of[l,m,h])"kind"in T||(t.deleteFramebuffer(T.framebuffer),t.deleteTexture(T.texture));t.deleteBuffer(E),t.deleteVertexArray(c)}}}var $=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function K(n,r){let t=new Float32Array(16);for(let e=0;e<4;e++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=n[i*4+o]*r[e*4+i];t[e*4+o]=a}return t}var I=(n,r)=>[n[0]-r[0],n[1]-r[1],n[2]-r[2]],Y=(n,r)=>n[0]*r[0]+n[1]*r[1]+n[2]*r[2],C=(n,r)=>[n[1]*r[2]-n[2]*r[1],n[2]*r[0]-n[0]*r[2],n[0]*r[1]-n[1]*r[0]];function _(n){let r=Math.hypot(n[0],n[1],n[2]);return r===0?n:[n[0]/r,n[1]/r,n[2]/r]}function ce(n,r,t,e){let o=1/Math.tan(n/2);return new Float32Array([o/r,0,0,0,0,o,0,0,0,0,(e+t)/(t-e),-1,0,0,2*e*t/(t-e),0])}function le(n,r,t,e,o,a){let i=r-n,s=e-t,u=a-o;return new Float32Array([2/i,0,0,0,0,2/s,0,0,0,0,-2/u,0,-(r+n)/i,-(e+t)/s,-(a+o)/u,1])}function q(n,r,t){let e=_(I(n,r)),o=C(t,e);if(Math.hypot(o[0],o[1],o[2])<1e-8)return $();let a=_(o),i=C(e,a);return new Float32Array([a[0],i[0],e[0],0,a[1],i[1],e[1],0,a[2],i[2],e[2],0,-Y(a,n),-Y(i,n),-Y(e,n),1])}function ke(n){return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4)}var st=/^#?([0-9a-fA-F]{6})$/;function G(n){let r=st.exec(n.trim());if(!r)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(n)}`);let t=r[1];return[0,2,4].map(e=>ke(parseInt(t.slice(e,e+2),16)/255))}var de={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},ut=Object.freeze(Object.fromEntries(Object.keys(de).map(n=>[n,G(de[n])])));var Ve=.4;var fe=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${Ve.toFixed(2)}); }`,me=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function ct(n){let r=[1/0,1/0,1/0],t=[-1/0,-1/0,-1/0];for(let e=0;e<n.length;e+=3)for(let o=0;o<3;o++){let a=n[e+o];a<r[o]&&(r[o]=a),a>t[o]&&(t[o]=a)}return n.length===0?{min:[0,0,0],max:[0,0,0]}:{min:r,max:t}}function He(n,r){let t=new Float32Array(n.length);for(let e=0;e<r.length;e+=3){let o=r[e]*3,a=r[e+1]*3,i=r[e+2]*3,s=n[a]-n[o],u=n[a+1]-n[o+1],d=n[a+2]-n[o+2],f=n[i]-n[o],l=n[i+1]-n[o+1],m=n[i+2]-n[o+2],h=u*m-d*l,c=d*f-s*m,E=s*l-u*f;for(let b of[o,a,i])t[b]=t[b]+h,t[b+1]=t[b+1]+c,t[b+2]=t[b+2]+E}for(let e=0;e<t.length;e+=3){let o=Math.hypot(t[e],t[e+1],t[e+2]);o>0&&(t[e]=t[e]/o,t[e+1]=t[e+1]/o,t[e+2]=t[e+2]/o)}return t}function he(n,r,t,e){let{min:o,max:a}=ct(n);return{positions:n,normals:e??He(n,t),uvs:r,indices:t,min:o,max:a}}function pe(n=1,r=1,t=1){let e=n/2,o=r/2,a=t/2,i=[[[-e,-o,a],[e,-o,a],[e,o,a],[-e,o,a]],[[e,-o,-a],[-e,-o,-a],[-e,o,-a],[e,o,-a]],[[e,-o,a],[e,-o,-a],[e,o,-a],[e,o,a]],[[-e,-o,-a],[-e,-o,a],[-e,o,a],[-e,o,-a]],[[-e,o,a],[e,o,a],[e,o,-a],[-e,o,-a]],[[-e,-o,-a],[e,-o,-a],[e,-o,a],[-e,-o,a]]],s=new Float32Array(72),u=new Float32Array(48),d=new Uint16Array(36),f=0,l=0,m=0,h=0;for(let c of i){for(let[E,b,g]of c)s[f++]=E,s[f++]=b,s[f++]=g;u[l++]=0,u[l++]=0,u[l++]=1,u[l++]=0,u[l++]=1,u[l++]=1,u[l++]=0,u[l++]=1,d[m++]=h,d[m++]=h+1,d[m++]=h+2,d[m++]=h,d[m++]=h+2,d[m++]=h+3,h+=4}return he(s,u,d)}function Ee(n=10,r=24){let t=Math.max(1,Math.floor(r)),e=(t+1)*(t+1),o=new Float32Array(e*3),a=new Float32Array(e*3),i=new Float32Array(e*2),s=new Uint16Array(t*t*6),u=0,d=0,f=0;for(let l=0;l<=t;l++)for(let m=0;m<=t;m++){let h=(m/t-.5)*n,c=(l/t-.5)*n;o[u]=h,o[u+1]=0,o[u+2]=c,a[u]=0,a[u+1]=1,a[u+2]=0,u+=3,i[d++]=m/t,i[d++]=l/t}for(let l=0;l<t;l++)for(let m=0;m<t;m++){let h=l*(t+1)+m,c=h+1,E=h+(t+1),b=E+1;s[f++]=h,s[f++]=E,s[f++]=c,s[f++]=c,s[f++]=E,s[f++]=b}return he(o,i,s,a)}function Te(n=.5,r=24,t=32){let e=Math.max(2,r),o=Math.max(3,t),a=(e+1)*(o+1),i=new Float32Array(a*3),s=new Float32Array(a*3),u=new Float32Array(a*2),d=new Uint16Array(e*o*6),f=0,l=0,m=0;for(let h=0;h<=e;h++){let c=h/e*Math.PI;for(let E=0;E<=o;E++){let b=E/o*Math.PI*2,g=Math.sin(c)*Math.cos(b),T=Math.cos(c),F=Math.sin(c)*Math.sin(b);i[f]=g*n,i[f+1]=T*n,i[f+2]=F*n,s[f]=g,s[f+1]=T,s[f+2]=F,f+=3,u[l++]=E/o,u[l++]=h/e}}for(let h=0;h<e;h++)for(let c=0;c<o;c++){let E=h*(o+1)+c,b=E+1,g=E+(o+1),T=g+1;d[m++]=E,d[m++]=b,d[m++]=g,d[m++]=b,d[m++]=T,d[m++]=g}return he(i,u,d,s)}function V(n){return n.indices.length/3}var be=89,ge=Math.PI/180;function P(n){let r=Math.max(-be,Math.min(be,n.elevationDeg))*ge,t=n.azimuthDeg*ge,e=Math.max(1e-4,n.distance),o=Math.sin(r)*e,a=Math.cos(r)*e;return[n.target[0]+Math.sin(t)*a,n.target[1]+o,n.target[2]+Math.cos(t)*a]}function H(n,r){let t=P(n),e=n.near??Math.max(.01,n.distance/100),o=n.far??Math.max(e+1,n.distance*8),a=ce((n.fovDeg??38)*ge,Math.max(.001,r),e,o),i=q(t,n.target,[0,1,0]);return K(a,i)}function xe(n,r,t){let e=_(n.direction),o=n.extent??Math.max(.1,t*1.35),a=Math.max(1,t*2),i=[r[0]-e[0]*a,r[1]-e[1]*a,r[2]-e[2]*a],s=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],u=q(i,r,s),d=le(-o,o,-o,o,.01,a+t*2+o);return K(d,u)}function Re(n,r){let t=I([r[0],r[1],r[2]],[n[0],n[1],n[2]]);return Math.hypot(t[0],t[1],t[2])/2}function ye(n,r){return[(n[0]+r[0])/2,(n[1]+r[1])/2,(n[2]+r[2])/2]}function Ae(n,r,t){let{gl:e}=n,o=Math.max(1,Math.floor(r)),a=Math.max(1,Math.floor(t)),i=e.createFramebuffer(),s=e.createTexture(),u=e.createTexture();if(!i||!s||!u)return x("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let d=n.hdr?e.RGBA16F:e.RGBA8,f=n.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,l=()=>{e.bindTexture(e.TEXTURE_2D,s),e.texImage2D(e.TEXTURE_2D,0,d,o,a,0,e.RGBA,f,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,u),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,o,a,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,s,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,u,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};l(),e.bindFramebuffer(e.FRAMEBUFFER,i);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE?x("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${m.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:s,depthTexture:u,get width(){return o},get height(){return a},bind(){e.bindFramebuffer(e.FRAMEBUFFER,i),e.viewport(0,0,o,a)},resize(h,c){let E=Math.max(1,Math.floor(h)),b=Math.max(1,Math.floor(c));E===o&&b===a||(o=E,a=b,l())},dispose(){e.deleteFramebuffer(i),e.deleteTexture(s),e.deleteTexture(u)}}}function ve(n,r=1024){let{gl:t}=n,e=Math.max(256,Math.min(2048,Math.floor(r))),o=t.createFramebuffer(),a=t.createTexture();if(!o||!a)return x("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");t.bindTexture(t.TEXTURE_2D,a),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,e,e,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,o),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,a,0);let i=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),i!==t.FRAMEBUFFER_COMPLETE?x("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:e,bind(){t.bindFramebuffer(t.FRAMEBUFFER,o),t.viewport(0,0,e,e)},dispose(){t.deleteFramebuffer(o),t.deleteTexture(a)}}}var Z=`
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
}`,Q={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function J(n,r,t={}){let e=t.zenith??Q.zenith,o=t.horizon??Q.horizon,a=t.ground??Q.ground;n.uniform3f(n.getUniformLocation(r,"uSkyZenith"),e[0],e[1],e[2]),n.uniform3f(n.getUniformLocation(r,"uSkyHorizon"),o[0],o[1],o[2]),n.uniform3f(n.getUniformLocation(r,"uSkyGround"),a[0],a[1],a[2])}var lt=`#version 300 es
precision highp float;
out vec2 vNdc;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`,dt=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${Z}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;function Fe(n){let{gl:r}=n,t=n.compile(lt,dt);return"kind"in t?t:{draw(e){let o=_(I(e.target,e.eye)),a=Math.abs(o[1])>.999?[0,0,1]:[0,1,0],i=_(C(o,a)),s=_(C(i,o));r.disable(r.DEPTH_TEST),r.depthMask(!1),r.disable(r.BLEND),r.useProgram(t),r.uniform3f(r.getUniformLocation(t,"uRight"),i[0],i[1],i[2]),r.uniform3f(r.getUniformLocation(t,"uUp"),s[0],s[1],s[2]),r.uniform3f(r.getUniformLocation(t,"uForward"),o[0],o[1],o[2]),r.uniform1f(r.getUniformLocation(t,"uTanHalfFov"),Math.tan(e.fovDeg*Math.PI/360)),r.uniform1f(r.getUniformLocation(t,"uAspect"),Math.max(.001,e.aspect)),J(r,t,e.sky),n.blit(t),r.depthMask(!0),r.enable(r.DEPTH_TEST)},dispose(){r.deleteProgram(t)}}}var Xe=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,Le=`#version 300 es
precision highp float;
void main(){}`,ft=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,ze=`#version 300 es
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
}`,We=`#version 300 es
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
${Z}

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
}`;function Se(n,r){let{gl:t}=n,e=t.createVertexArray(),o=t.createBuffer(),a=t.createBuffer(),i=t.createBuffer();return!e||!o||!a||!i?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(t.bindVertexArray(e),t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,r.positions,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,a),t.bufferData(t.ARRAY_BUFFER,r.normals,t.STATIC_DRAW),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,i),t.bufferData(t.ELEMENT_ARRAY_BUFFER,r.indices,t.STATIC_DRAW),t.bindVertexArray(null),{vao:e,indexCount:r.indices.length,indexType:r.indices instanceof Uint32Array?t.UNSIGNED_INT:t.UNSIGNED_SHORT,dispose(){t.deleteVertexArray(e),t.deleteBuffer(o),t.deleteBuffer(a),t.deleteBuffer(i)}})}function Me(n){let{gl:r}=n,t=n.compile(Xe,Le);if("kind"in t)return t;let e=n.compile(ze,We);if("kind"in e)return e;let o=n.compile(ft,Le);if("kind"in o)return o;let a=(i,s)=>r.getUniformLocation(i,s);return{shadowPass(i,s,u,d){let f=d??(()=>{});u.bind(),f("shadow.bind"),r.clear(r.DEPTH_BUFFER_BIT),r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.FRONT),r.useProgram(t),f("useProgram(shadow)"),r.uniformMatrix4fv(a(t,"uLightVP"),!1,i),f("uLightVP");for(let l of s)r.uniformMatrix4fv(a(t,"uModel"),!1,l.model),f("shadow uModel"),r.bindVertexArray(l.mesh.vao),f("shadow bindVAO"),r.drawElements(r.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0),f("shadow drawElements");r.bindVertexArray(null),r.cullFace(r.BACK)},depthPrepass(i,s){r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.colorMask(!1,!1,!1,!1),r.useProgram(o),r.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let u of s)r.uniformMatrix4fv(a(o,"uModel"),!1,u.model),r.bindVertexArray(u.mesh.vao),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0);r.bindVertexArray(null),r.colorMask(!0,!0,!0,!0)},draw(i){let s=i.onStep??(()=>{});r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.useProgram(e),r.uniformMatrix4fv(a(e,"uViewProj"),!1,i.viewProj),s("uViewProj"),r.uniform3fv(a(e,"uEye"),i.eye),s("uEye"),r.uniform3fv(a(e,"uLightDir"),i.lightDir),s("uLightDir"),r.uniform3fv(a(e,"uLightColour"),i.lightColour),s("uLightColour"),r.uniform1f(a(e,"uAmbientGain"),i.ambientGain??1),s("uAmbientGain"),J(r,e,i.sky),s("bindSky"),i.ao&&i.screenSize?(r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,i.ao),r.uniform1i(a(e,"uAO"),1),r.uniform2f(a(e,"uScreenSize"),i.screenSize[0],i.screenSize[1]),r.uniform1f(a(e,"uAOEnabled"),1)):r.uniform1f(a(e,"uAOEnabled"),0),s("bindAO"),r.uniformMatrix4fv(a(e,"uLightVP"),!1,i.lightVP),s("lit uLightVP"),i.shadow?(r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,i.shadow.depthTexture),r.uniform1i(a(e,"uShadowMap"),0),r.uniform1f(a(e,"uShadowTexel"),1/i.shadow.size),r.uniform1f(a(e,"uShadowStrength"),i.shadowStrength??1)):r.uniform1f(a(e,"uShadowStrength"),0);for(let u of i.draws)r.uniformMatrix4fv(a(e,"uModel"),!1,u.model),r.uniformMatrix3fv(a(e,"uNormalMat"),!1,u.normalMat),s("uNormalMat"),r.uniform3fv(a(e,"uBaseColour"),u.material.baseColour),s("uBaseColour"),r.uniform1f(a(e,"uRoughness"),u.material.roughness),r.uniform1f(a(e,"uMetalness"),u.material.metalness),r.bindVertexArray(u.mesh.vao),s("lit bindVAO"),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0),s("lit drawElements");r.bindVertexArray(null),r.disable(r.CULL_FACE)},dispose(){r.deleteProgram(t),r.deleteProgram(e),r.deleteProgram(o)}}}var X=`
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
}`,je=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,mt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${X}

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
}`,ht=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${X}

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
}`;function _e(n,r,t){let{gl:e}=n,o=n.compile(je,mt);if("kind"in o)return o;let a=n.compile(je,ht);if("kind"in a)return a;let i=Math.max(1,r>>1),s=Math.max(1,t>>1),u=()=>{let c=e.createFramebuffer(),E=e.createTexture();return!c||!E?null:{fb:c,tex:E}},d=u(),f=u();if(!d||!f)return x("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let l=()=>{for(let c of[d,f])e.bindTexture(e.TEXTURE_2D,c.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,i,s,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,c.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,c.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};l(),e.bindFramebuffer(e.FRAMEBUFFER,d.fb);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE)return x("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${m.toString(16)}).`);let h=(c,E,b,g,T,F,R)=>{e.activeTexture(e.TEXTURE0+R),e.bindTexture(e.TEXTURE_2D,E),e.uniform1i(e.getUniformLocation(c,"uDepth"),R),e.uniform2f(e.getUniformLocation(c,"uNearFar"),b,g),e.uniform1f(e.getUniformLocation(c,"uTanHalfFov"),Math.tan(T*Math.PI/360)),e.uniform1f(e.getUniformLocation(c,"uAspect"),F)};return{get texture(){return d.tex},get width(){return i},get height(){return s},compute(c){e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,d.fb),e.viewport(0,0,i,s),e.useProgram(o),h(o,c.depthTexture,c.near,c.far,c.fovDeg,c.aspect,0),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/i,1/s),e.uniform1f(e.getUniformLocation(o,"uRadius"),c.radius??.55),e.uniform1f(e.getUniformLocation(o,"uStrength"),c.strength??1.15),e.uniform1f(e.getUniformLocation(o,"uBias"),c.bias??.035),n.blit(o);for(let[E,b,g]of[[d,f,[1,0]],[f,d,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,b.fb),e.viewport(0,0,i,s),e.useProgram(a),h(a,c.depthTexture,c.near,c.far,c.fovDeg,c.aspect,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,E.tex),e.uniform1i(e.getUniformLocation(a,"uAO"),1),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/i,1/s),e.uniform2f(e.getUniformLocation(a,"uDir"),g[0],g[1]),n.blit(a);e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(c,E){let b=Math.max(1,c>>1),g=Math.max(1,E>>1);b===i&&g===s||(i=b,s=g,l())},dispose(){e.deleteProgram(o),e.deleteProgram(a);for(let c of[d,f])e.deleteFramebuffer(c.fb),e.deleteTexture(c.tex)}}}var pt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Et=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uFocusDistance;
uniform float uAperture;
uniform float uMaxCoc;
out vec4 frag;
${X}

/* Circle of confusion in UV units. The thin-lens relation reduces to a difference of
   reciprocals, which is why a subject 1 m from a 2 m focus blurs far more than one 11 m from
   12 m \u2014 a linear distance falloff gets that backwards and is the usual shortcut. */
float cocAt(vec2 uv) {
  float z = linearDepthAt(uv);
  float c = abs(1.0 / max(0.05, uFocusDistance) - 1.0 / max(0.05, z)) * uAperture;
  return clamp(c, 0.0, uMaxCoc);
}

void main(){
  float centreCoc = cocAt(vUv);
  vec3 sharp = texture(uScene, vUv).rgb;

  /* In focus: return the sharp sample untouched. Blurring by a sub-texel radius still costs 24
     taps and still softens the image slightly, and "slightly soft everywhere" is the exact look
     this effect exists to avoid. */
  if (centreCoc < 0.0015) { frag = vec4(sharp, 1.0); return; }

  vec3 sum = sharp * 0.001;
  float wsum = 0.001;

  /* 24 taps on a golden-angle spiral. A square grid at this count shows its axes in the bokeh;
     the spiral has no preferred direction, so the out-of-focus highlight stays round. */
  const int TAPS = 24;
  for (int i = 0; i < TAPS; i++) {
    float t = (float(i) + 0.5) / float(TAPS);
    float r = sqrt(t) * centreCoc;
    float a = float(i) * 2.39996323;
    vec2 off = vec2(cos(a), sin(a)) * r;
    vec2 suv = vUv + off;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;

    float sc = cocAt(suv);
    /*
     * WEIGHT BY THE SAMPLE'S OWN CoC, and this is the whole difference between depth of field
     * and smear. A SHARP sample must not bleed into a blurred pixel, or every near object grows
     * a halo of its own colour across the background behind it. A sample can only contribute as
     * far as its own circle of confusion actually reaches.
     */
    float reach = step(r, sc + uTexel.x);
    float w = reach * (0.35 + sc / max(1e-4, uMaxCoc));
    sum += texture(uScene, suv).rgb * w;
    wsum += w;
  }

  vec3 blurred = sum / wsum;
  /* Blend rather than replace: at a small CoC the gather is undersampled and shows its taps, and
     easing in over the first part of the range hides that entirely. */
  float mixAmt = smoothstep(0.0015, uMaxCoc * 0.45, centreCoc);
  frag = vec4(mix(sharp, blurred, mixAmt), 1.0);
}`;function we(n,r,t){let{gl:e}=n,o=n.compile(pt,Et);if("kind"in o)return o;let a=Math.max(1,Math.floor(r)),i=Math.max(1,Math.floor(t)),s=e.createFramebuffer(),u=e.createTexture();if(!s||!u)return x("FRAMEBUFFER_INCOMPLETE","The GPU refused a depth-of-field buffer.");let d=()=>{e.bindTexture(e.TEXTURE_2D,u);let l=n.hdr?e.RGBA16F:e.RGBA8,m=n.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE;e.texImage2D(e.TEXTURE_2D,0,l,a,i,0,e.RGBA,m,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,s),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,u,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};d(),e.bindFramebuffer(e.FRAMEBUFFER,s);let f=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),f!==e.FRAMEBUFFER_COMPLETE?x("FRAMEBUFFER_INCOMPLETE",`The DOF buffer is incomplete (0x${f.toString(16)}).`):{texture:u,apply(l){e.bindFramebuffer(e.FRAMEBUFFER,s),e.viewport(0,0,a,i),e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.useProgram(o),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,l.scene),e.uniform1i(e.getUniformLocation(o,"uScene"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,l.depthTexture),e.uniform1i(e.getUniformLocation(o,"uDepth"),1),e.uniform2f(e.getUniformLocation(o,"uNearFar"),l.near,l.far),e.uniform1f(e.getUniformLocation(o,"uTanHalfFov"),Math.tan(l.fovDeg*Math.PI/360)),e.uniform1f(e.getUniformLocation(o,"uAspect"),l.aspect),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/a,1/i),e.uniform1f(e.getUniformLocation(o,"uFocusDistance"),l.focusDistance),e.uniform1f(e.getUniformLocation(o,"uAperture"),l.aperture??12),e.uniform1f(e.getUniformLocation(o,"uMaxCoc"),l.maxCoc??.012),n.blit(o),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(l,m){let h=Math.max(1,Math.floor(l)),c=Math.max(1,Math.floor(m));h===a&&c===i||(a=h,i=c,d())},dispose(){e.deleteProgram(o),e.deleteFramebuffer(s),e.deleteTexture(u)}}}var Ce=Math.max(1,Math.min(3,Number(new URLSearchParams(location.search).get("scale")??1))),A=1280*Ce,v=800*Ce,Ie=document.getElementById("c");Ie.width=A;Ie.height=v;var z=ue(Ie,{alpha:!1});if(!se(z))throw document.title="REFUSED",document.getElementById("log").textContent=`refused: ${z.code} \u2014 ${z.reason}`,new Error(z.reason);var M=z,p=M.gl,Tt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,bt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${fe}
${me}
void main(){
  vec3 c = texture(uScene, vUv).rgb;
  frag = vec4(lcxEncode(lcxToneMap(c)), 1.0);
}`,Oe=M.compile(Tt,bt),N=Me(M),w=Ae(M,A,v),O=ve(M,1024),te=Fe(M),re=_e(M,A,v),ne=we(M,A,v),D=n=>{throw document.title="REFUSED",document.getElementById("log").textContent=n,new Error(n)},B=n=>`${n.reason}
${n.detail??""}`;"kind"in Oe&&D(`present: ${B(Oe)}`);"kind"in N&&D(`lit: ${B(N)}`);"kind"in w&&D(`target: ${B(w)}`);"kind"in O&&D(`shadow: ${B(O)}`);"kind"in te&&D(`sky: ${B(te)}`);"kind"in re&&D(`ao: ${B(re)}`);"kind"in ne&&D(`dof: ${B(ne)}`);var Ke=Ee(14,24),qe=pe(1.4,1.4,1.4),Qe=Te(.75,32,48),De=[Ke,qe,Qe].map(n=>{let r=Se(M,n);return"kind"in r&&D(`mesh: ${r.reason}`),r}),Ue=(n,r,t)=>{let e=$();return e[12]=n,e[13]=r,e[14]=t,e},Pe=new Float32Array([1,0,0,0,1,0,0,0,1]),W=[{mesh:De[0],model:Ue(0,0,0),normalMat:Pe,material:{baseColour:G("#0E1628"),roughness:.82,metalness:0}},{mesh:De[1],model:Ue(-1.15,.7,0),normalMat:Pe,material:{baseColour:G("#2C6BFF"),roughness:.34,metalness:.05}},{mesh:De[2],model:Ue(1.15,.75,.3),normalMat:Pe,material:{baseColour:G("#C9D4E4"),roughness:et?.045:.18,metalness:.92}}],j={direction:[-.45,-1,-.35],colour:[3.4,3.3,3.05]},Ze=[-7,0,-7],Je=[7,2.2,7],gt=ye(Ze,Je),Ye=Re(Ze,Je),oe=xe({...j,extent:Ye*.8},gt,Ye),y={target:[0,.6,0],distance:7.2,azimuthDeg:34,elevationDeg:22,fovDeg:36},et=new URLSearchParams(location.search).get("diag")==="1",Be=new URLSearchParams(location.search).get("ao")!=="0",tt=new URLSearchParams(location.search).get("dof")!=="0",xt={zenith:[1.6,.05,.05],horizon:[.05,.08,1.6],ground:[.05,1.2,.05]},ae=et?xt:void 0,rt=Math.max(1,Number(new URLSearchParams(location.search).get("repeat")??1));function ie(){let n=H(y,A/v),r=P(y);N.shadowPass(oe,W,O),w.bind(),p.clear(p.DEPTH_BUFFER_BIT),te.draw({eye:r,target:y.target,fovDeg:y.fovDeg??36,aspect:A/v,sky:ae});let t=Math.max(.01,y.distance/100),e=Math.max(t+1,y.distance*8);N.depthPrepass(n,W),Be&&(re.compute({depthTexture:w.depthTexture,near:t,far:e,fovDeg:y.fovDeg??36,aspect:A/v,radius:.6,strength:1.25}),w.bind());for(let a=0;a<rt;a++)N.draw({viewProj:n,eye:r,lightDir:j.direction,lightColour:j.colour,ambientGain:1,sky:ae,lightVP:oe,shadow:O,shadowStrength:.92,draws:W,ao:Be?re.texture:null,screenSize:[A,v]});let o=w.texture;if(tt){let a=Math.hypot(r[0]-1.15,r[1]-.75,r[2]-.3);ne.apply({scene:w.texture,depthTexture:w.depthTexture,near:t,far:e,fovDeg:y.fovDeg??36,aspect:A/v,focusDistance:a,aperture:9,maxCoc:.01}),o=ne.texture}p.bindFramebuffer(p.FRAMEBUFFER,null),p.viewport(0,0,A,v),p.disable(p.DEPTH_TEST),p.activeTexture(p.TEXTURE0),p.bindTexture(p.TEXTURE_2D,o),M.blit(Oe,a=>p.uniform1i(p.getUniformLocation(a,"uScene"),0))}ie();function Rt(n){ie();let r=new Uint8Array(4);p.readPixels(0,0,1,1,p.RGBA,p.UNSIGNED_BYTE,r);let t=performance.now();for(let e=0;e<n;e++)ie();return p.readPixels(0,0,1,1,p.RGBA,p.UNSIGNED_BYTE,r),(performance.now()-t)/n}var nt=Number(new URLSearchParams(location.search).get("frames")??600),ee=(()=>{for(;p.getError()!==p.NO_ERROR;);let n=[],r=a=>{let i=p.getError();i!==p.NO_ERROR&&n.push(`${a}=0x${i.toString(16)}`)};N.shadowPass(oe,W,O,r),w.bind(),r("target.bind"),p.clear(p.DEPTH_BUFFER_BIT),r("clear"),te.draw({eye:P(y),target:y.target,fovDeg:y.fovDeg??36,aspect:A/v,sky:ae}),r("sky"),N.draw({viewProj:H(y,A/v),eye:P(y),lightDir:j.direction,lightColour:j.colour,ambientGain:1,sky:ae,lightVP:oe,shadow:O,shadowStrength:.92,draws:W,onStep:r});let t=p.getError(),e=new Uint8Array(4);p.readPixels(A>>1,v>>2,1,1,p.RGBA,p.UNSIGNED_BYTE,e);let o=p.getError();return{centre:Array.from(e),afterDraw:t,afterRead:o,bad:n}})(),yt=V(Ke)+V(qe)+V(Qe),Ne=Rt(Math.max(1,nt)),$e=(()=>{let n=H(y,A/v),r=-1.15,t=1.4,e=0,o=n[0]*r+n[4]*t+n[8]*e+n[12],a=n[1]*r+n[5]*t+n[9]*e+n[13],i=n[3]*r+n[7]*t+n[11]*e+n[15];return{ndc:[Number((o/i).toFixed(3)),Number((a/i).toFixed(3))],w:Number(i.toFixed(3))}})(),ot={hdr:M.hdr,eye:P(y).map(n=>Number(n.toFixed(2))),boxTopNdc:$e.ndc,boxTopW:$e.w,targetCentre:ee.centre,failingCalls:ee.bad,glAfterDraw:ee.afterDraw,glAfterRead:ee.afterRead,triangles:yt,shadowMap:O.size,resolution:`${A}x${v}`,dprScale:Ce,aoEnabled:Be,dofEnabled:tt,frames:nt,repeat:rt,msPerFrame:Number(Ne.toFixed(3)),fps:Math.round(1e3/Ne),budget60:16.6,headroom:Number((16.6-Ne).toFixed(3)),renderer:(()=>{let n=p.getExtension("WEBGL_debug_renderer_info");return n?String(p.getParameter(n.UNMASKED_RENDERER_WEBGL)):"unknown"})()};globalThis.E0=ot;document.getElementById("log").textContent=JSON.stringify(ot,null,2);ie();document.title="READY";

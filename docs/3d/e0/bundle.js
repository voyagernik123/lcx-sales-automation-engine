var De={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable."};function S(n,r){return r===void 0?{kind:"refused",code:n,reason:De[n]}:{kind:"refused",code:n,reason:De[n],detail:r}}function oe(n){return n.kind==="stage"}function ae(n,r={}){let e=n.getContext("webgl2",{antialias:r.antialias??!1,alpha:r.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!e)return S("NO_WEBGL2");let t=e.getExtension("EXT_color_buffer_float"),o=n.width,a=n.height,i=t?e.RGBA16F:e.RGBA8,s=t?e.HALF_FLOAT:e.UNSIGNED_BYTE,u=(p,y)=>{let x=e.createTexture();e.bindTexture(e.TEXTURE_2D,x),e.texImage2D(e.TEXTURE_2D,0,i,p,y,0,e.RGBA,s,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE);let T=e.createFramebuffer();e.bindFramebuffer(e.FRAMEBUFFER,T),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,x,0);let R=e.checkFramebufferStatus(e.FRAMEBUFFER);return R!==e.FRAMEBUFFER_COMPLETE?S("FRAMEBUFFER_INCOMPLETE",`status 0x${R.toString(16)} at ${p}\xD7${y}`):{texture:x,framebuffer:T,width:p,height:y}},d=r.bloomShift??2,l={w:o,h:a},m=u(o,a);if("kind"in m)return m;let c=u(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in c)return c;let f=u(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in f)return f;let E=e.createVertexArray();e.bindVertexArray(E);let b=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,b),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindVertexArray(null);let g=[];return{kind:"stage",gl:e,cssWidth:n.clientWidth||o,cssHeight:n.clientHeight||a,hdr:!!t,get width(){return l.w},get height(){return l.h},get scene(){return m},get bloomA(){return c},get bloomB(){return f},setRegion(p,y){let x=Math.max(1,Math.round(p)),T=Math.max(1,Math.round(y));if(!(x===l.w&&T===l.h)){l={w:x,h:T};for(let R of[m,c,f])"kind"in R||(e.deleteFramebuffer(R.framebuffer),e.deleteTexture(R.texture));m=u(x,T),c=u(Math.max(1,x>>d),Math.max(1,T>>d)),f=u(Math.max(1,x>>d),Math.max(1,T>>d))}},compile(p,y){let x=(qe,Qe)=>{let C=e.createShader(qe);return e.shaderSource(C,Qe),e.compileShader(C),e.getShaderParameter(C,e.COMPILE_STATUS)?C:S("SHADER_COMPILE_FAILED",e.getShaderInfoLog(C)??"(no log)")},T=x(e.VERTEX_SHADER,p);if(typeof T=="object"&&"kind"in T)return T;let R=x(e.FRAGMENT_SHADER,y);if(typeof R=="object"&&"kind"in R)return R;let w=e.createProgram();return e.attachShader(w,T),e.attachShader(w,R),e.linkProgram(w),e.getProgramParameter(w,e.LINK_STATUS)?(g.push(w),w):S("PROGRAM_LINK_FAILED",e.getProgramInfoLog(w)??"(no log)")},bindTarget(p){e.bindFramebuffer(e.FRAMEBUFFER,p?p.framebuffer:null),e.viewport(0,0,p?p.width:l.w,p?p.height:l.h)},blit(p,y){e.useProgram(p),e.bindVertexArray(E),y?.(p),e.drawArrays(e.TRIANGLES,0,3),e.bindVertexArray(null)},dispose(){for(let p of g)e.deleteProgram(p);for(let p of[m,c,f])"kind"in p||(e.deleteFramebuffer(p.framebuffer),e.deleteTexture(p.texture));e.deleteBuffer(b),e.deleteVertexArray(E)}}}var j=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function Y(n,r){let e=new Float32Array(16);for(let t=0;t<4;t++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=n[i*4+o]*r[t*4+i];e[t*4+o]=a}return e}var U=(n,r)=>[n[0]-r[0],n[1]-r[1],n[2]-r[2]],W=(n,r)=>n[0]*r[0]+n[1]*r[1]+n[2]*r[2],P=(n,r)=>[n[1]*r[2]-n[2]*r[1],n[2]*r[0]-n[0]*r[2],n[0]*r[1]-n[1]*r[0]];function _(n){let r=Math.hypot(n[0],n[1],n[2]);return r===0?n:[n[0]/r,n[1]/r,n[2]/r]}function ie(n,r,e,t){let o=1/Math.tan(n/2);return new Float32Array([o/r,0,0,0,0,o,0,0,0,0,(t+e)/(e-t),-1,0,0,2*t*e/(e-t),0])}function se(n,r,e,t,o,a){let i=r-n,s=t-e,u=a-o;return new Float32Array([2/i,0,0,0,0,2/s,0,0,0,0,-2/u,0,-(r+n)/i,-(t+e)/s,-(a+o)/u,1])}function $(n,r,e){let t=_(U(n,r)),o=P(e,t);if(Math.hypot(o[0],o[1],o[2])<1e-8)return j();let a=_(o),i=P(t,a);return new Float32Array([a[0],i[0],t[0],0,a[1],i[1],t[1],0,a[2],i[2],t[2],0,-W(a,n),-W(i,n),-W(t,n),1])}function Ne(n){return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4)}var Ze=/^#?([0-9a-fA-F]{6})$/;function B(n){let r=Ze.exec(n.trim());if(!r)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(n)}`);let e=r[1];return[0,2,4].map(t=>Ne(parseInt(e.slice(t,t+2),16)/255))}var ue={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},Je=Object.freeze(Object.fromEntries(Object.keys(ue).map(n=>[n,B(ue[n])])));var Pe=.4;var de=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${Pe.toFixed(2)}); }`,le=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function et(n){let r=[1/0,1/0,1/0],e=[-1/0,-1/0,-1/0];for(let t=0;t<n.length;t+=3)for(let o=0;o<3;o++){let a=n[t+o];a<r[o]&&(r[o]=a),a>e[o]&&(e[o]=a)}return n.length===0?{min:[0,0,0],max:[0,0,0]}:{min:r,max:e}}function Ue(n,r){let e=new Float32Array(n.length);for(let t=0;t<r.length;t+=3){let o=r[t]*3,a=r[t+1]*3,i=r[t+2]*3,s=n[a]-n[o],u=n[a+1]-n[o+1],d=n[a+2]-n[o+2],l=n[i]-n[o],m=n[i+1]-n[o+1],c=n[i+2]-n[o+2],f=u*c-d*m,E=d*l-s*c,b=s*m-u*l;for(let g of[o,a,i])e[g]=e[g]+f,e[g+1]=e[g+1]+E,e[g+2]=e[g+2]+b}for(let t=0;t<e.length;t+=3){let o=Math.hypot(e[t],e[t+1],e[t+2]);o>0&&(e[t]=e[t]/o,e[t+1]=e[t+1]/o,e[t+2]=e[t+2]/o)}return e}function ce(n,r,e,t){let{min:o,max:a}=et(n);return{positions:n,normals:t??Ue(n,e),uvs:r,indices:e,min:o,max:a}}function me(n=1,r=1,e=1){let t=n/2,o=r/2,a=e/2,i=[[[-t,-o,a],[t,-o,a],[t,o,a],[-t,o,a]],[[t,-o,-a],[-t,-o,-a],[-t,o,-a],[t,o,-a]],[[t,-o,a],[t,-o,-a],[t,o,-a],[t,o,a]],[[-t,-o,-a],[-t,-o,a],[-t,o,a],[-t,o,-a]],[[-t,o,a],[t,o,a],[t,o,-a],[-t,o,-a]],[[-t,-o,-a],[t,-o,-a],[t,-o,a],[-t,-o,a]]],s=new Float32Array(72),u=new Float32Array(48),d=new Uint16Array(36),l=0,m=0,c=0,f=0;for(let E of i){for(let[b,g,M]of E)s[l++]=b,s[l++]=g,s[l++]=M;u[m++]=0,u[m++]=0,u[m++]=1,u[m++]=0,u[m++]=1,u[m++]=1,u[m++]=0,u[m++]=1,d[c++]=f,d[c++]=f+1,d[c++]=f+2,d[c++]=f,d[c++]=f+2,d[c++]=f+3,f+=4}return ce(s,u,d)}function fe(n=10,r=24){let e=Math.max(1,Math.floor(r)),t=(e+1)*(e+1),o=new Float32Array(t*3),a=new Float32Array(t*3),i=new Float32Array(t*2),s=new Uint16Array(e*e*6),u=0,d=0,l=0;for(let m=0;m<=e;m++)for(let c=0;c<=e;c++){let f=(c/e-.5)*n,E=(m/e-.5)*n;o[u]=f,o[u+1]=0,o[u+2]=E,a[u]=0,a[u+1]=1,a[u+2]=0,u+=3,i[d++]=c/e,i[d++]=m/e}for(let m=0;m<e;m++)for(let c=0;c<e;c++){let f=m*(e+1)+c,E=f+1,b=f+(e+1),g=b+1;s[l++]=f,s[l++]=b,s[l++]=E,s[l++]=E,s[l++]=b,s[l++]=g}return ce(o,i,s,a)}function he(n=.5,r=24,e=32){let t=Math.max(2,r),o=Math.max(3,e),a=(t+1)*(o+1),i=new Float32Array(a*3),s=new Float32Array(a*3),u=new Float32Array(a*2),d=new Uint16Array(t*o*6),l=0,m=0,c=0;for(let f=0;f<=t;f++){let E=f/t*Math.PI;for(let b=0;b<=o;b++){let g=b/o*Math.PI*2,M=Math.sin(E)*Math.cos(g),p=Math.cos(E),y=Math.sin(E)*Math.sin(g);i[l]=M*n,i[l+1]=p*n,i[l+2]=y*n,s[l]=M,s[l+1]=p,s[l+2]=y,l+=3,u[m++]=b/o,u[m++]=f/t}}for(let f=0;f<t;f++)for(let E=0;E<o;E++){let b=f*(o+1)+E,g=b+1,M=b+(o+1),p=M+1;d[c++]=b,d[c++]=g,d[c++]=M,d[c++]=g,d[c++]=p,d[c++]=M}return ce(i,u,d,s)}function k(n){return n.indices.length/3}var pe=89,Ee=Math.PI/180;function D(n){let r=Math.max(-pe,Math.min(pe,n.elevationDeg))*Ee,e=n.azimuthDeg*Ee,t=Math.max(1e-4,n.distance),o=Math.sin(r)*t,a=Math.cos(r)*t;return[n.target[0]+Math.sin(e)*a,n.target[1]+o,n.target[2]+Math.cos(e)*a]}function G(n,r){let e=D(n),t=n.near??Math.max(.01,n.distance/100),o=n.far??Math.max(t+1,n.distance*8),a=ie((n.fovDeg??38)*Ee,Math.max(.001,r),t,o),i=$(e,n.target,[0,1,0]);return Y(a,i)}function be(n,r,e){let t=_(n.direction),o=n.extent??Math.max(.1,e*1.35),a=Math.max(1,e*2),i=[r[0]-t[0]*a,r[1]-t[1]*a,r[2]-t[2]*a],s=Math.abs(t[1])>.99?[0,0,1]:[0,1,0],u=$(i,r,s),d=se(-o,o,-o,o,.01,a+e*2+o);return Y(d,u)}function ge(n,r){let e=U([r[0],r[1],r[2]],[n[0],n[1],n[2]]);return Math.hypot(e[0],e[1],e[2])/2}function Te(n,r){return[(n[0]+r[0])/2,(n[1]+r[1])/2,(n[2]+r[2])/2]}function ye(n,r,e){let{gl:t}=n,o=Math.max(1,Math.floor(r)),a=Math.max(1,Math.floor(e)),i=t.createFramebuffer(),s=t.createTexture(),u=t.createTexture();if(!i||!s||!u)return S("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let d=n.hdr?t.RGBA16F:t.RGBA8,l=n.hdr?t.HALF_FLOAT:t.UNSIGNED_BYTE,m=()=>{t.bindTexture(t.TEXTURE_2D,s),t.texImage2D(t.TEXTURE_2D,0,d,o,a,0,t.RGBA,l,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindTexture(t.TEXTURE_2D,u),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,o,a,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,i),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,s,0),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,u,0),t.bindFramebuffer(t.FRAMEBUFFER,null)};m(),t.bindFramebuffer(t.FRAMEBUFFER,i);let c=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),c!==t.FRAMEBUFFER_COMPLETE?S("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${c.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:s,depthTexture:u,get width(){return o},get height(){return a},bind(){t.bindFramebuffer(t.FRAMEBUFFER,i),t.viewport(0,0,o,a)},resize(f,E){let b=Math.max(1,Math.floor(f)),g=Math.max(1,Math.floor(E));b===o&&g===a||(o=b,a=g,m())},dispose(){t.deleteFramebuffer(i),t.deleteTexture(s),t.deleteTexture(u)}}}function xe(n,r=1024){let{gl:e}=n,t=Math.max(256,Math.min(2048,Math.floor(r))),o=e.createFramebuffer(),a=e.createTexture();if(!o||!a)return S("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");e.bindTexture(e.TEXTURE_2D,a),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,t,t,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,o),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,a,0);let i=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),i!==e.FRAMEBUFFER_COMPLETE?S("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:t,bind(){e.bindFramebuffer(e.FRAMEBUFFER,o),e.viewport(0,0,t,t)},dispose(){e.deleteFramebuffer(o),e.deleteTexture(a)}}}var q=`
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
}`,K={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function Q(n,r,e={}){let t=e.zenith??K.zenith,o=e.horizon??K.horizon,a=e.ground??K.ground;n.uniform3f(n.getUniformLocation(r,"uSkyZenith"),t[0],t[1],t[2]),n.uniform3f(n.getUniformLocation(r,"uSkyHorizon"),o[0],o[1],o[2]),n.uniform3f(n.getUniformLocation(r,"uSkyGround"),a[0],a[1],a[2])}var tt=`#version 300 es
precision highp float;
out vec2 vNdc;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`,rt=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${q}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;function Re(n){let{gl:r}=n,e=n.compile(tt,rt);return"kind"in e?e:{draw(t){let o=_(U(t.target,t.eye)),a=Math.abs(o[1])>.999?[0,0,1]:[0,1,0],i=_(P(o,a)),s=_(P(i,o));r.disable(r.DEPTH_TEST),r.depthMask(!1),r.disable(r.BLEND),r.useProgram(e),r.uniform3f(r.getUniformLocation(e,"uRight"),i[0],i[1],i[2]),r.uniform3f(r.getUniformLocation(e,"uUp"),s[0],s[1],s[2]),r.uniform3f(r.getUniformLocation(e,"uForward"),o[0],o[1],o[2]),r.uniform1f(r.getUniformLocation(e,"uTanHalfFov"),Math.tan(t.fovDeg*Math.PI/360)),r.uniform1f(r.getUniformLocation(e,"uAspect"),Math.max(.001,t.aspect)),Q(r,e,t.sky),n.blit(e),r.depthMask(!0),r.enable(r.DEPTH_TEST)},dispose(){r.deleteProgram(e)}}}var Be=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,Ie=`#version 300 es
precision highp float;
void main(){}`,Oe=`#version 300 es
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
}`,Ce=`#version 300 es
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

out vec4 frag;
${q}

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
  vec3 ambient = (envDiffuse + envSpecular) * uAmbientGain;

  // NO TONE MAP. The composite owns the only one in the pipeline.
  frag = vec4(direct + ambient, 1.0);
}`;function Ae(n,r){let{gl:e}=n,t=e.createVertexArray(),o=e.createBuffer(),a=e.createBuffer(),i=e.createBuffer();return!t||!o||!a||!i?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(e.bindVertexArray(t),e.bindBuffer(e.ARRAY_BUFFER,o),e.bufferData(e.ARRAY_BUFFER,r.positions,e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,3,e.FLOAT,!1,0,0),e.bindBuffer(e.ARRAY_BUFFER,a),e.bufferData(e.ARRAY_BUFFER,r.normals,e.STATIC_DRAW),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,3,e.FLOAT,!1,0,0),e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,i),e.bufferData(e.ELEMENT_ARRAY_BUFFER,r.indices,e.STATIC_DRAW),e.bindVertexArray(null),{vao:t,indexCount:r.indices.length,indexType:r.indices instanceof Uint32Array?e.UNSIGNED_INT:e.UNSIGNED_SHORT,dispose(){e.deleteVertexArray(t),e.deleteBuffer(o),e.deleteBuffer(a),e.deleteBuffer(i)}})}function Se(n){let{gl:r}=n,e=n.compile(Be,Ie);if("kind"in e)return e;let t=n.compile(Oe,Ce);if("kind"in t)return t;let o=(a,i)=>r.getUniformLocation(a,i);return{shadowPass(a,i,s,u){let d=u??(()=>{});s.bind(),d("shadow.bind"),r.clear(r.DEPTH_BUFFER_BIT),r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.FRONT),r.useProgram(e),d("useProgram(shadow)"),r.uniformMatrix4fv(o(e,"uLightVP"),!1,a),d("uLightVP");for(let l of i)r.uniformMatrix4fv(o(e,"uModel"),!1,l.model),d("shadow uModel"),r.bindVertexArray(l.mesh.vao),d("shadow bindVAO"),r.drawElements(r.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0),d("shadow drawElements");r.bindVertexArray(null),r.cullFace(r.BACK)},draw(a){let i=a.onStep??(()=>{});r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.useProgram(t),r.uniformMatrix4fv(o(t,"uViewProj"),!1,a.viewProj),i("uViewProj"),r.uniform3fv(o(t,"uEye"),a.eye),i("uEye"),r.uniform3fv(o(t,"uLightDir"),a.lightDir),i("uLightDir"),r.uniform3fv(o(t,"uLightColour"),a.lightColour),i("uLightColour"),r.uniform1f(o(t,"uAmbientGain"),a.ambientGain??1),i("uAmbientGain"),Q(r,t,a.sky),i("bindSky"),r.uniformMatrix4fv(o(t,"uLightVP"),!1,a.lightVP),i("lit uLightVP"),a.shadow?(r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,a.shadow.depthTexture),r.uniform1i(o(t,"uShadowMap"),0),r.uniform1f(o(t,"uShadowTexel"),1/a.shadow.size),r.uniform1f(o(t,"uShadowStrength"),a.shadowStrength??1)):r.uniform1f(o(t,"uShadowStrength"),0);for(let s of a.draws)r.uniformMatrix4fv(o(t,"uModel"),!1,s.model),r.uniformMatrix3fv(o(t,"uNormalMat"),!1,s.normalMat),i("uNormalMat"),r.uniform3fv(o(t,"uBaseColour"),s.material.baseColour),i("uBaseColour"),r.uniform1f(o(t,"uRoughness"),s.material.roughness),r.uniform1f(o(t,"uMetalness"),s.material.metalness),r.bindVertexArray(s.mesh.vao),i("lit bindVAO"),r.drawElements(r.TRIANGLES,s.mesh.indexCount,s.mesh.indexType,0),i("lit drawElements");r.bindVertexArray(null),r.disable(r.CULL_FACE)},dispose(){r.deleteProgram(e),r.deleteProgram(t)}}}var F=1280,L=800,we=document.getElementById("c");we.width=F;we.height=L;var V=ae(we,{alpha:!1});if(!oe(V))throw document.title="REFUSED",document.getElementById("log").textContent=`refused: ${V.code} \u2014 ${V.reason}`,new Error(V.reason);var v=V,h=v.gl,nt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,ot=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${de}
${le}
void main(){
  vec3 c = texture(uScene, vUv).rgb;
  frag = vec4(lcxEncode(lcxToneMap(c)), 1.0);
}`,ve=v.compile(nt,ot),I=Se(v),H=ye(v,F,L),N=xe(v,1024),J=Re(v),O=n=>{throw document.title="REFUSED",document.getElementById("log").textContent=n,new Error(n)},z=n=>`${n.reason}
${n.detail??""}`;"kind"in ve&&O(`present: ${z(ve)}`);"kind"in I&&O(`lit: ${z(I)}`);"kind"in H&&O(`target: ${z(H)}`);"kind"in N&&O(`shadow: ${z(N)}`);"kind"in J&&O(`sky: ${z(J)}`);var Ve=fe(14,24),He=me(1.4,1.4,1.4),Xe=he(.75,32,48),Fe=[Ve,He,Xe].map(n=>{let r=Ae(v,n);return"kind"in r&&O(`mesh: ${r.reason}`),r}),Le=(n,r,e)=>{let t=j();return t[12]=n,t[13]=r,t[14]=e,t},Me=new Float32Array([1,0,0,0,1,0,0,0,1]),ee=[{mesh:Fe[0],model:Le(0,0,0),normalMat:Me,material:{baseColour:B("#0E1628"),roughness:.82,metalness:0}},{mesh:Fe[1],model:Le(-1.15,.7,0),normalMat:Me,material:{baseColour:B("#2C6BFF"),roughness:.34,metalness:.05}},{mesh:Fe[2],model:Le(1.15,.75,.3),normalMat:Me,material:{baseColour:B("#C9D4E4"),roughness:je?.045:.18,metalness:.92}}],X={direction:[-.45,-1,-.35],colour:[3.4,3.3,3.05]},ze=[-7,0,-7],We=[7,2.2,7],at=Te(ze,We),ke=ge(ze,We),te=be({...X,extent:ke*.8},at,ke),A={target:[0,.6,0],distance:7.2,azimuthDeg:34,elevationDeg:22,fovDeg:36},je=new URLSearchParams(location.search).get("diag")==="1",it={zenith:[1.6,.05,.05],horizon:[.05,.08,1.6],ground:[.05,1.2,.05]},re=je?it:void 0,Ye=Math.max(1,Number(new URLSearchParams(location.search).get("repeat")??1));function ne(){let n=G(A,F/L),r=D(A);I.shadowPass(te,ee,N),H.bind(),h.clear(h.DEPTH_BUFFER_BIT),J.draw({eye:r,target:A.target,fovDeg:A.fovDeg??36,aspect:F/L,sky:re});for(let e=0;e<Ye;e++)I.draw({viewProj:n,eye:r,lightDir:X.direction,lightColour:X.colour,ambientGain:1,sky:re,lightVP:te,shadow:N,shadowStrength:.92,draws:ee});h.bindFramebuffer(h.FRAMEBUFFER,null),h.viewport(0,0,F,L),h.disable(h.DEPTH_TEST),h.activeTexture(h.TEXTURE0),h.bindTexture(h.TEXTURE_2D,H.texture),v.blit(ve,e=>h.uniform1i(h.getUniformLocation(e,"uScene"),0))}ne();function st(n){ne();let r=new Uint8Array(4);h.readPixels(0,0,1,1,h.RGBA,h.UNSIGNED_BYTE,r);let e=performance.now();for(let t=0;t<n;t++)ne();return h.readPixels(0,0,1,1,h.RGBA,h.UNSIGNED_BYTE,r),(performance.now()-e)/n}var $e=Number(new URLSearchParams(location.search).get("frames")??600),Z=(()=>{for(;h.getError()!==h.NO_ERROR;);let n=[],r=a=>{let i=h.getError();i!==h.NO_ERROR&&n.push(`${a}=0x${i.toString(16)}`)};I.shadowPass(te,ee,N,r),H.bind(),r("target.bind"),h.clear(h.DEPTH_BUFFER_BIT),r("clear"),J.draw({eye:D(A),target:A.target,fovDeg:A.fovDeg??36,aspect:F/L,sky:re}),r("sky"),I.draw({viewProj:G(A,F/L),eye:D(A),lightDir:X.direction,lightColour:X.colour,ambientGain:1,sky:re,lightVP:te,shadow:N,shadowStrength:.92,draws:ee,onStep:r});let e=h.getError(),t=new Uint8Array(4);h.readPixels(F>>1,L>>2,1,1,h.RGBA,h.UNSIGNED_BYTE,t);let o=h.getError();return{centre:Array.from(t),afterDraw:e,afterRead:o,bad:n}})(),ut=k(Ve)+k(He)+k(Xe),_e=st(Math.max(1,$e)),Ge=(()=>{let n=G(A,F/L),r=-1.15,e=1.4,t=0,o=n[0]*r+n[4]*e+n[8]*t+n[12],a=n[1]*r+n[5]*e+n[9]*t+n[13],i=n[3]*r+n[7]*e+n[11]*t+n[15];return{ndc:[Number((o/i).toFixed(3)),Number((a/i).toFixed(3))],w:Number(i.toFixed(3))}})(),Ke={hdr:v.hdr,eye:D(A).map(n=>Number(n.toFixed(2))),boxTopNdc:Ge.ndc,boxTopW:Ge.w,targetCentre:Z.centre,failingCalls:Z.bad,glAfterDraw:Z.afterDraw,glAfterRead:Z.afterRead,triangles:ut,shadowMap:N.size,resolution:`${F}x${L}`,frames:$e,repeat:Ye,msPerFrame:Number(_e.toFixed(3)),fps:Math.round(1e3/_e),budget60:16.6,headroom:Number((16.6-_e).toFixed(3)),renderer:(()=>{let n=h.getExtension("WEBGL_debug_renderer_info");return n?String(h.getParameter(n.UNMASKED_RENDERER_WEBGL)):"unknown"})()};globalThis.E0=Ke;document.getElementById("log").textContent=JSON.stringify(Ke,null,2);ne();document.title="READY";

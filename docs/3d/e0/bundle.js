var Me={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable."};function A(n,r){return r===void 0?{kind:"refused",code:n,reason:Me[n]}:{kind:"refused",code:n,reason:Me[n],detail:r}}function J(n){return n.kind==="stage"}function Z(n,r={}){let e=n.getContext("webgl2",{antialias:r.antialias??!1,alpha:r.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!e)return A("NO_WEBGL2");let t=e.getExtension("EXT_color_buffer_float"),o=n.width,a=n.height,i=t?e.RGBA16F:e.RGBA8,s=t?e.HALF_FLOAT:e.UNSIGNED_BYTE,u=(E,x)=>{let R=e.createTexture();e.bindTexture(e.TEXTURE_2D,R),e.texImage2D(e.TEXTURE_2D,0,i,E,x,0,e.RGBA,s,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE);let g=e.createFramebuffer();e.bindFramebuffer(e.FRAMEBUFFER,g),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,R,0);let y=e.checkFramebufferStatus(e.FRAMEBUFFER);return y!==e.FRAMEBUFFER_COMPLETE?A("FRAMEBUFFER_INCOMPLETE",`status 0x${y.toString(16)} at ${E}\xD7${x}`):{texture:R,framebuffer:g,width:E,height:x}},l=r.bloomShift??2,d={w:o,h:a},f=u(o,a);if("kind"in f)return f;let m=u(Math.max(1,o>>l),Math.max(1,a>>l));if("kind"in m)return m;let h=u(Math.max(1,o>>l),Math.max(1,a>>l));if("kind"in h)return h;let p=e.createVertexArray();e.bindVertexArray(p);let b=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,b),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindVertexArray(null);let T=[];return{kind:"stage",gl:e,cssWidth:n.clientWidth||o,cssHeight:n.clientHeight||a,hdr:!!t,get width(){return d.w},get height(){return d.h},get scene(){return f},get bloomA(){return m},get bloomB(){return h},setRegion(E,x){let R=Math.max(1,Math.round(E)),g=Math.max(1,Math.round(x));if(!(R===d.w&&g===d.h)){d={w:R,h:g};for(let y of[f,m,h])"kind"in y||(e.deleteFramebuffer(y.framebuffer),e.deleteTexture(y.texture));f=u(R,g),m=u(Math.max(1,R>>l),Math.max(1,g>>l)),h=u(Math.max(1,R>>l),Math.max(1,g>>l))}},compile(E,x){let R=(Xe,We)=>{let B=e.createShader(Xe);return e.shaderSource(B,We),e.compileShader(B),e.getShaderParameter(B,e.COMPILE_STATUS)?B:A("SHADER_COMPILE_FAILED",e.getShaderInfoLog(B)??"(no log)")},g=R(e.VERTEX_SHADER,E);if(typeof g=="object"&&"kind"in g)return g;let y=R(e.FRAGMENT_SHADER,x);if(typeof y=="object"&&"kind"in y)return y;let S=e.createProgram();return e.attachShader(S,g),e.attachShader(S,y),e.linkProgram(S),e.getProgramParameter(S,e.LINK_STATUS)?(T.push(S),S):A("PROGRAM_LINK_FAILED",e.getProgramInfoLog(S)??"(no log)")},bindTarget(E){e.bindFramebuffer(e.FRAMEBUFFER,E?E.framebuffer:null),e.viewport(0,0,E?E.width:d.w,E?E.height:d.h)},blit(E,x){e.useProgram(E),e.bindVertexArray(p),x?.(E),e.drawArrays(e.TRIANGLES,0,3),e.bindVertexArray(null)},dispose(){for(let E of T)e.deleteProgram(E);for(let E of[f,m,h])"kind"in E||(e.deleteFramebuffer(E.framebuffer),e.deleteTexture(E.texture));e.deleteBuffer(b),e.deleteVertexArray(p)}}}var X=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function W(n,r){let e=new Float32Array(16);for(let t=0;t<4;t++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=n[i*4+o]*r[t*4+i];e[t*4+o]=a}return e}var j=(n,r)=>[n[0]-r[0],n[1]-r[1],n[2]-r[2]],H=(n,r)=>n[0]*r[0]+n[1]*r[1]+n[2]*r[2],ee=(n,r)=>[n[1]*r[2]-n[2]*r[1],n[2]*r[0]-n[0]*r[2],n[0]*r[1]-n[1]*r[0]];function U(n){let r=Math.hypot(n[0],n[1],n[2]);return r===0?n:[n[0]/r,n[1]/r,n[2]/r]}function te(n,r,e,t){let o=1/Math.tan(n/2);return new Float32Array([o/r,0,0,0,0,o,0,0,0,0,(t+e)/(e-t),-1,0,0,2*t*e/(e-t),0])}function re(n,r,e,t,o,a){let i=r-n,s=t-e,u=a-o;return new Float32Array([2/i,0,0,0,0,2/s,0,0,0,0,-2/u,0,-(r+n)/i,-(t+e)/s,-(a+o)/u,1])}function z(n,r,e){let t=U(j(n,r)),o=ee(e,t);if(Math.hypot(o[0],o[1],o[2])<1e-8)return X();let a=U(o),i=ee(t,a);return new Float32Array([a[0],i[0],t[0],0,a[1],i[1],t[1],0,a[2],i[2],t[2],0,-H(a,n),-H(i,n),-H(t,n),1])}function Le(n){return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4)}var je=/^#?([0-9a-fA-F]{6})$/;function P(n){let r=je.exec(n.trim());if(!r)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(n)}`);let e=r[1];return[0,2,4].map(t=>Le(parseInt(e.slice(t,t+2),16)/255))}var ne={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},ze=Object.freeze(Object.fromEntries(Object.keys(ne).map(n=>[n,P(ne[n])])));var _e=.4;var oe=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${_e.toFixed(2)}); }`,ae=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function $e(n){let r=[1/0,1/0,1/0],e=[-1/0,-1/0,-1/0];for(let t=0;t<n.length;t+=3)for(let o=0;o<3;o++){let a=n[t+o];a<r[o]&&(r[o]=a),a>e[o]&&(e[o]=a)}return n.length===0?{min:[0,0,0],max:[0,0,0]}:{min:r,max:e}}function Se(n,r){let e=new Float32Array(n.length);for(let t=0;t<r.length;t+=3){let o=r[t]*3,a=r[t+1]*3,i=r[t+2]*3,s=n[a]-n[o],u=n[a+1]-n[o+1],l=n[a+2]-n[o+2],d=n[i]-n[o],f=n[i+1]-n[o+1],m=n[i+2]-n[o+2],h=u*m-l*f,p=l*d-s*m,b=s*f-u*d;for(let T of[o,a,i])e[T]=e[T]+h,e[T+1]=e[T+1]+p,e[T+2]=e[T+2]+b}for(let t=0;t<e.length;t+=3){let o=Math.hypot(e[t],e[t+1],e[t+2]);o>0&&(e[t]=e[t]/o,e[t+1]=e[t+1]/o,e[t+2]=e[t+2]/o)}return e}function ie(n,r,e,t){let{min:o,max:a}=$e(n);return{positions:n,normals:t??Se(n,e),uvs:r,indices:e,min:o,max:a}}function se(n=1,r=1,e=1){let t=n/2,o=r/2,a=e/2,i=[[[-t,-o,a],[t,-o,a],[t,o,a],[-t,o,a]],[[t,-o,-a],[-t,-o,-a],[-t,o,-a],[t,o,-a]],[[t,-o,a],[t,-o,-a],[t,o,-a],[t,o,a]],[[-t,-o,-a],[-t,-o,a],[-t,o,a],[-t,o,-a]],[[-t,o,a],[t,o,a],[t,o,-a],[-t,o,-a]],[[-t,-o,-a],[t,-o,-a],[t,-o,a],[-t,-o,a]]],s=new Float32Array(72),u=new Float32Array(48),l=new Uint16Array(36),d=0,f=0,m=0,h=0;for(let p of i){for(let[b,T,F]of p)s[d++]=b,s[d++]=T,s[d++]=F;u[f++]=0,u[f++]=0,u[f++]=1,u[f++]=0,u[f++]=1,u[f++]=1,u[f++]=0,u[f++]=1,l[m++]=h,l[m++]=h+1,l[m++]=h+2,l[m++]=h,l[m++]=h+2,l[m++]=h+3,h+=4}return ie(s,u,l)}function ue(n=10,r=24){let e=Math.max(1,Math.floor(r)),t=(e+1)*(e+1),o=new Float32Array(t*3),a=new Float32Array(t*3),i=new Float32Array(t*2),s=new Uint16Array(e*e*6),u=0,l=0,d=0;for(let f=0;f<=e;f++)for(let m=0;m<=e;m++){let h=(m/e-.5)*n,p=(f/e-.5)*n;o[u]=h,o[u+1]=0,o[u+2]=p,a[u]=0,a[u+1]=1,a[u+2]=0,u+=3,i[l++]=m/e,i[l++]=f/e}for(let f=0;f<e;f++)for(let m=0;m<e;m++){let h=f*(e+1)+m,p=h+1,b=h+(e+1),T=b+1;s[d++]=h,s[d++]=b,s[d++]=p,s[d++]=p,s[d++]=b,s[d++]=T}return ie(o,i,s,a)}function le(n=.5,r=24,e=32){let t=Math.max(2,r),o=Math.max(3,e),a=(t+1)*(o+1),i=new Float32Array(a*3),s=new Float32Array(a*3),u=new Float32Array(a*2),l=new Uint16Array(t*o*6),d=0,f=0,m=0;for(let h=0;h<=t;h++){let p=h/t*Math.PI;for(let b=0;b<=o;b++){let T=b/o*Math.PI*2,F=Math.sin(p)*Math.cos(T),E=Math.cos(p),x=Math.sin(p)*Math.sin(T);i[d]=F*n,i[d+1]=E*n,i[d+2]=x*n,s[d]=F,s[d+1]=E,s[d+2]=x,d+=3,u[f++]=b/o,u[f++]=h/t}}for(let h=0;h<t;h++)for(let p=0;p<o;p++){let b=h*(o+1)+p,T=b+1,F=b+(o+1),E=F+1;l[m++]=b,l[m++]=F,l[m++]=T,l[m++]=T,l[m++]=F,l[m++]=E}return ie(i,u,l,s)}function C(n){return n.indices.length/3}var de=89,ce=Math.PI/180;function D(n){let r=Math.max(-de,Math.min(de,n.elevationDeg))*ce,e=n.azimuthDeg*ce,t=Math.max(1e-4,n.distance),o=Math.sin(r)*t,a=Math.cos(r)*t;return[n.target[0]+Math.sin(e)*a,n.target[1]+o,n.target[2]+Math.cos(e)*a]}function O(n,r){let e=D(n),t=n.near??Math.max(.01,n.distance/100),o=n.far??Math.max(t+1,n.distance*8),a=te((n.fovDeg??38)*ce,Math.max(.001,r),t,o),i=z(e,n.target,[0,1,0]);return W(a,i)}function me(n,r,e){let t=U(n.direction),o=n.extent??Math.max(.1,e*1.35),a=Math.max(1,e*2),i=[r[0]-t[0]*a,r[1]-t[1]*a,r[2]-t[2]*a],s=Math.abs(t[1])>.99?[0,0,1]:[0,1,0],u=z(i,r,s),l=re(-o,o,-o,o,.01,a+e*2+o);return W(l,u)}function fe(n,r){let e=j([r[0],r[1],r[2]],[n[0],n[1],n[2]]);return Math.hypot(e[0],e[1],e[2])/2}function he(n,r){return[(n[0]+r[0])/2,(n[1]+r[1])/2,(n[2]+r[2])/2]}function Ee(n,r,e){let{gl:t}=n,o=Math.max(1,Math.floor(r)),a=Math.max(1,Math.floor(e)),i=t.createFramebuffer(),s=t.createTexture(),u=t.createTexture();if(!i||!s||!u)return A("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let l=n.hdr?t.RGBA16F:t.RGBA8,d=n.hdr?t.HALF_FLOAT:t.UNSIGNED_BYTE,f=()=>{t.bindTexture(t.TEXTURE_2D,s),t.texImage2D(t.TEXTURE_2D,0,l,o,a,0,t.RGBA,d,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindTexture(t.TEXTURE_2D,u),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,o,a,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,i),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,s,0),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,u,0),t.bindFramebuffer(t.FRAMEBUFFER,null)};f(),t.bindFramebuffer(t.FRAMEBUFFER,i);let m=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),m!==t.FRAMEBUFFER_COMPLETE?A("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${m.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:s,depthTexture:u,get width(){return o},get height(){return a},bind(){t.bindFramebuffer(t.FRAMEBUFFER,i),t.viewport(0,0,o,a)},resize(h,p){let b=Math.max(1,Math.floor(h)),T=Math.max(1,Math.floor(p));b===o&&T===a||(o=b,a=T,f())},dispose(){t.deleteFramebuffer(i),t.deleteTexture(s),t.deleteTexture(u)}}}function pe(n,r=1024){let{gl:e}=n,t=Math.max(256,Math.min(2048,Math.floor(r))),o=e.createFramebuffer(),a=e.createTexture();if(!o||!a)return A("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");e.bindTexture(e.TEXTURE_2D,a),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,t,t,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,o),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,a,0);let i=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),i!==e.FRAMEBUFFER_COMPLETE?A("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:t,bind(){e.bindFramebuffer(e.FRAMEBUFFER,o),e.viewport(0,0,t,t)},dispose(){e.deleteFramebuffer(o),e.deleteTexture(a)}}}var we=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,Pe=`#version 300 es
precision highp float;
void main(){}`,De=`#version 300 es
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
}`,Ne=`#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;

uniform vec3 uEye;
uniform vec3 uLightDir;      // direction the light TRAVELS
uniform vec3 uLightColour;   // linear radiance
uniform vec3 uAmbient;       // linear, stands in for an IBL until L6 lands
uniform vec3 uBaseColour;    // linear, brand-exact
uniform float uRoughness;
uniform float uMetalness;

uniform mat4 uLightVP;
uniform sampler2D uShadowMap;
uniform float uShadowTexel;  // 1.0 / shadowMapSize
uniform float uShadowStrength;

out vec4 frag;

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
  vec3 ambient = uBaseColour * uAmbient;

  // NO TONE MAP. The composite owns the only one in the pipeline.
  frag = vec4(direct + ambient, 1.0);
}`;function be(n,r){let{gl:e}=n,t=e.createVertexArray(),o=e.createBuffer(),a=e.createBuffer(),i=e.createBuffer();return!t||!o||!a||!i?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(e.bindVertexArray(t),e.bindBuffer(e.ARRAY_BUFFER,o),e.bufferData(e.ARRAY_BUFFER,r.positions,e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,3,e.FLOAT,!1,0,0),e.bindBuffer(e.ARRAY_BUFFER,a),e.bufferData(e.ARRAY_BUFFER,r.normals,e.STATIC_DRAW),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,3,e.FLOAT,!1,0,0),e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,i),e.bufferData(e.ELEMENT_ARRAY_BUFFER,r.indices,e.STATIC_DRAW),e.bindVertexArray(null),{vao:t,indexCount:r.indices.length,indexType:r.indices instanceof Uint32Array?e.UNSIGNED_INT:e.UNSIGNED_SHORT,dispose(){e.deleteVertexArray(t),e.deleteBuffer(o),e.deleteBuffer(a),e.deleteBuffer(i)}})}function Te(n){let{gl:r}=n,e=n.compile(we,Pe);if("kind"in e)return e;let t=n.compile(De,Ne);if("kind"in t)return t;let o=(a,i)=>r.getUniformLocation(a,i);return{shadowPass(a,i,s,u){let l=u??(()=>{});s.bind(),l("shadow.bind"),r.clear(r.DEPTH_BUFFER_BIT),r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.FRONT),r.useProgram(e),l("useProgram(shadow)"),r.uniformMatrix4fv(o(e,"uLightVP"),!1,a),l("uLightVP");for(let d of i)r.uniformMatrix4fv(o(e,"uModel"),!1,d.model),l("shadow uModel"),r.bindVertexArray(d.mesh.vao),l("shadow bindVAO"),r.drawElements(r.TRIANGLES,d.mesh.indexCount,d.mesh.indexType,0),l("shadow drawElements");r.bindVertexArray(null),r.cullFace(r.BACK)},draw(a){let i=a.onStep??(()=>{});r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.useProgram(t),r.uniformMatrix4fv(o(t,"uViewProj"),!1,a.viewProj),i("uViewProj"),r.uniform3fv(o(t,"uEye"),a.eye),i("uEye"),r.uniform3fv(o(t,"uLightDir"),a.lightDir),i("uLightDir"),r.uniform3fv(o(t,"uLightColour"),a.lightColour),i("uLightColour"),r.uniform3fv(o(t,"uAmbient"),a.ambient),i("uAmbient"),r.uniformMatrix4fv(o(t,"uLightVP"),!1,a.lightVP),i("lit uLightVP"),a.shadow?(r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,a.shadow.depthTexture),r.uniform1i(o(t,"uShadowMap"),0),r.uniform1f(o(t,"uShadowTexel"),1/a.shadow.size),r.uniform1f(o(t,"uShadowStrength"),a.shadowStrength??1)):r.uniform1f(o(t,"uShadowStrength"),0);for(let s of a.draws)r.uniformMatrix4fv(o(t,"uModel"),!1,s.model),r.uniformMatrix3fv(o(t,"uNormalMat"),!1,s.normalMat),i("uNormalMat"),r.uniform3fv(o(t,"uBaseColour"),s.material.baseColour),i("uBaseColour"),r.uniform1f(o(t,"uRoughness"),s.material.roughness),r.uniform1f(o(t,"uMetalness"),s.material.metalness),r.bindVertexArray(s.mesh.vao),i("lit bindVAO"),r.drawElements(r.TRIANGLES,s.mesh.indexCount,s.mesh.indexType,0),i("lit drawElements");r.bindVertexArray(null),r.disable(r.CULL_FACE)},dispose(){r.deleteProgram(e),r.deleteProgram(t)}}}var M=1280,L=800,Fe=document.getElementById("c");Fe.width=M;Fe.height=L;var I=Z(Fe,{alpha:!1});if(!J(I))throw document.title="REFUSED",document.getElementById("log").textContent=`refused: ${I.code} \u2014 ${I.reason}`,new Error(I.reason);var _=I,c=_.gl,Ye=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Ke=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${oe}
${ae}
void main(){
  vec3 c = texture(uScene, vUv).rgb;
  frag = vec4(lcxEncode(lcxToneMap(c)), 1.0);
}`,Ae=_.compile(Ye,Ke),N=Te(_),G=Ee(_,M,L),w=pe(_,1024),k=n=>{throw document.title="REFUSED",document.getElementById("log").textContent=n,new Error(n)},Q=n=>`${n.reason}
${n.detail??""}`;"kind"in Ae&&k(`present: ${Q(Ae)}`);"kind"in N&&k(`lit: ${Q(N)}`);"kind"in G&&k(`target: ${Q(G)}`);"kind"in w&&k(`shadow: ${Q(w)}`);var Ue=ue(14,24),Ce=se(1.4,1.4,1.4),Oe=le(.75,32,48),ge=[Ue,Ce,Oe].map(n=>{let r=be(_,n);return"kind"in r&&k(`mesh: ${r.reason}`),r}),xe=(n,r,e)=>{let t=X();return t[12]=n,t[13]=r,t[14]=e,t},Re=new Float32Array([1,0,0,0,1,0,0,0,1]),Y=[{mesh:ge[0],model:xe(0,0,0),normalMat:Re,material:{baseColour:P("#0E1628"),roughness:.82,metalness:0}},{mesh:ge[1],model:xe(-1.15,.7,0),normalMat:Re,material:{baseColour:P("#2C6BFF"),roughness:.34,metalness:.05}},{mesh:ge[2],model:xe(1.15,.75,.3),normalMat:Re,material:{baseColour:P("#C9D4E4"),roughness:.18,metalness:.92}}],V={direction:[-.45,-1,-.35],colour:[3.4,3.3,3.05]},Ie=[-7,0,-7],Ge=[7,2.2,7],qe=he(Ie,Ge),ve=fe(Ie,Ge),K=me({...V,extent:ve*.8},qe,ve),v={target:[0,.6,0],distance:7.2,azimuthDeg:34,elevationDeg:22,fovDeg:36},Ve=Math.max(1,Number(new URLSearchParams(location.search).get("repeat")??1));function q(){let n=O(v,M/L),r=D(v);N.shadowPass(K,Y,w),G.bind(),c.clearColor(.004,.007,.017,1),c.clear(c.COLOR_BUFFER_BIT|c.DEPTH_BUFFER_BIT);for(let e=0;e<Ve;e++)N.draw({viewProj:n,eye:r,lightDir:V.direction,lightColour:V.colour,ambient:[.055,.07,.115],lightVP:K,shadow:w,shadowStrength:.92,draws:Y});c.bindFramebuffer(c.FRAMEBUFFER,null),c.viewport(0,0,M,L),c.disable(c.DEPTH_TEST),c.activeTexture(c.TEXTURE0),c.bindTexture(c.TEXTURE_2D,G.texture),_.blit(Ae,e=>c.uniform1i(c.getUniformLocation(e,"uScene"),0))}q();function Qe(n){q();let r=new Uint8Array(4);c.readPixels(0,0,1,1,c.RGBA,c.UNSIGNED_BYTE,r);let e=performance.now();for(let t=0;t<n;t++)q();return c.readPixels(0,0,1,1,c.RGBA,c.UNSIGNED_BYTE,r),(performance.now()-e)/n}var ke=Number(new URLSearchParams(location.search).get("frames")??600),$=(()=>{for(;c.getError()!==c.NO_ERROR;);let n=[],r=a=>{let i=c.getError();i!==c.NO_ERROR&&n.push(`${a}=0x${i.toString(16)}`)};N.shadowPass(K,Y,w,r),G.bind(),r("target.bind"),c.clearColor(.004,.007,.017,1),c.clear(c.COLOR_BUFFER_BIT|c.DEPTH_BUFFER_BIT),r("clear"),N.draw({viewProj:O(v,M/L),eye:D(v),lightDir:V.direction,lightColour:V.colour,ambient:[.055,.07,.115],lightVP:K,shadow:w,shadowStrength:.92,draws:Y,onStep:r});let e=c.getError(),t=new Uint8Array(4);c.readPixels(M>>1,L>>2,1,1,c.RGBA,c.UNSIGNED_BYTE,t);let o=c.getError();return{centre:Array.from(t),afterDraw:e,afterRead:o,bad:n}})(),Je=C(Ue)+C(Ce)+C(Oe),ye=Qe(Math.max(1,ke)),Be=(()=>{let n=O(v,M/L),r=-1.15,e=1.4,t=0,o=n[0]*r+n[4]*e+n[8]*t+n[12],a=n[1]*r+n[5]*e+n[9]*t+n[13],i=n[3]*r+n[7]*e+n[11]*t+n[15];return{ndc:[Number((o/i).toFixed(3)),Number((a/i).toFixed(3))],w:Number(i.toFixed(3))}})(),He={hdr:_.hdr,eye:D(v).map(n=>Number(n.toFixed(2))),boxTopNdc:Be.ndc,boxTopW:Be.w,targetCentre:$.centre,failingCalls:$.bad,glAfterDraw:$.afterDraw,glAfterRead:$.afterRead,triangles:Je,shadowMap:w.size,resolution:`${M}x${L}`,frames:ke,repeat:Ve,msPerFrame:Number(ye.toFixed(3)),fps:Math.round(1e3/ye),budget60:16.6,headroom:Number((16.6-ye).toFixed(3)),renderer:(()=>{let n=c.getExtension("WEBGL_debug_renderer_info");return n?String(c.getParameter(n.UNMASKED_RENDERER_WEBGL)):"unknown"})()};globalThis.E0=He;document.getElementById("log").textContent=JSON.stringify(He,null,2);q();document.title="READY";

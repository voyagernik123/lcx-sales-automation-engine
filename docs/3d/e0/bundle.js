var Me={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable."};function A(t,n){return n===void 0?{kind:"refused",code:t,reason:Me[t]}:{kind:"refused",code:t,reason:Me[t],detail:n}}function Q(t){return t.kind==="stage"}function J(t,n={}){let e=t.getContext("webgl2",{antialias:n.antialias??!1,alpha:n.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!e)return A("NO_WEBGL2");let r=e.getExtension("EXT_color_buffer_float"),o=t.width,a=t.height,i=r?e.RGBA16F:e.RGBA8,u=r?e.HALF_FLOAT:e.UNSIGNED_BYTE,s=(E,g)=>{let R=e.createTexture();e.bindTexture(e.TEXTURE_2D,R),e.texImage2D(e.TEXTURE_2D,0,i,E,g,0,e.RGBA,u,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE);let x=e.createFramebuffer();e.bindFramebuffer(e.FRAMEBUFFER,x),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,R,0);let y=e.checkFramebufferStatus(e.FRAMEBUFFER);return y!==e.FRAMEBUFFER_COMPLETE?A("FRAMEBUFFER_INCOMPLETE",`status 0x${y.toString(16)} at ${E}\xD7${g}`):{texture:R,framebuffer:x,width:E,height:g}},d=n.bloomShift??2,h={w:o,h:a},m=s(o,a);if("kind"in m)return m;let l=s(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in l)return l;let f=s(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in f)return f;let p=e.createVertexArray();e.bindVertexArray(p);let b=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,b),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindVertexArray(null);let T=[];return{kind:"stage",gl:e,cssWidth:t.clientWidth||o,cssHeight:t.clientHeight||a,hdr:!!r,get width(){return h.w},get height(){return h.h},get scene(){return m},get bloomA(){return l},get bloomB(){return f},setRegion(E,g){let R=Math.max(1,Math.round(E)),x=Math.max(1,Math.round(g));if(!(R===h.w&&x===h.h)){h={w:R,h:x};for(let y of[m,l,f])"kind"in y||(e.deleteFramebuffer(y.framebuffer),e.deleteTexture(y.texture));m=s(R,x),l=s(Math.max(1,R>>d),Math.max(1,x>>d)),f=s(Math.max(1,R>>d),Math.max(1,x>>d))}},compile(E,g){let R=(He,Xe)=>{let B=e.createShader(He);return e.shaderSource(B,Xe),e.compileShader(B),e.getShaderParameter(B,e.COMPILE_STATUS)?B:A("SHADER_COMPILE_FAILED",e.getShaderInfoLog(B)??"(no log)")},x=R(e.VERTEX_SHADER,E);if(typeof x=="object"&&"kind"in x)return x;let y=R(e.FRAGMENT_SHADER,g);if(typeof y=="object"&&"kind"in y)return y;let S=e.createProgram();return e.attachShader(S,x),e.attachShader(S,y),e.linkProgram(S),e.getProgramParameter(S,e.LINK_STATUS)?(T.push(S),S):A("PROGRAM_LINK_FAILED",e.getProgramInfoLog(S)??"(no log)")},bindTarget(E){e.bindFramebuffer(e.FRAMEBUFFER,E?E.framebuffer:null),e.viewport(0,0,E?E.width:h.w,E?E.height:h.h)},blit(E,g){e.useProgram(E),e.bindVertexArray(p),g?.(E),e.drawArrays(e.TRIANGLES,0,3),e.bindVertexArray(null)},dispose(){for(let E of T)e.deleteProgram(E);for(let E of[m,l,f])"kind"in E||(e.deleteFramebuffer(E.framebuffer),e.deleteTexture(E.texture));e.deleteBuffer(b),e.deleteVertexArray(p)}}}var X=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function W(t,n){let e=new Float32Array(16);for(let r=0;r<4;r++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=t[i*4+o]*n[r*4+i];e[r*4+o]=a}return e}var j=(t,n)=>[t[0]-n[0],t[1]-n[1],t[2]-n[2]],H=(t,n)=>t[0]*n[0]+t[1]*n[1]+t[2]*n[2],Z=(t,n)=>[t[1]*n[2]-t[2]*n[1],t[2]*n[0]-t[0]*n[2],t[0]*n[1]-t[1]*n[0]];function U(t){let n=Math.hypot(t[0],t[1],t[2]);return n===0?t:[t[0]/n,t[1]/n,t[2]/n]}function ee(t,n,e,r){let o=1/Math.tan(t/2);return new Float32Array([o/n,0,0,0,0,o,0,0,0,0,(r+e)/(e-r),-1,0,0,2*r*e/(e-r),0])}function re(t,n,e,r,o,a){let i=n-t,u=r-e,s=a-o;return new Float32Array([2/i,0,0,0,0,2/u,0,0,0,0,-2/s,0,-(n+t)/i,-(r+e)/u,-(a+o)/s,1])}function z(t,n,e){let r=U(j(t,n)),o=Z(e,r);if(Math.hypot(o[0],o[1],o[2])<1e-8)return X();let a=U(o),i=Z(r,a);return new Float32Array([a[0],i[0],r[0],0,a[1],i[1],r[1],0,a[2],i[2],r[2],0,-H(a,t),-H(i,t),-H(r,t),1])}function Le(t){return t<=.04045?t/12.92:Math.pow((t+.055)/1.055,2.4)}var We=/^#?([0-9a-fA-F]{6})$/;function D(t){let n=We.exec(t.trim());if(!n)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(t)}`);let e=n[1];return[0,2,4].map(r=>Le(parseInt(e.slice(r,r+2),16)/255))}var te={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},je=Object.freeze(Object.fromEntries(Object.keys(te).map(t=>[t,D(te[t])])));var _e=.4;var ne=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${_e.toFixed(2)}); }`,oe=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function ze(t){let n=[1/0,1/0,1/0],e=[-1/0,-1/0,-1/0];for(let r=0;r<t.length;r+=3)for(let o=0;o<3;o++){let a=t[r+o];a<n[o]&&(n[o]=a),a>e[o]&&(e[o]=a)}return t.length===0?{min:[0,0,0],max:[0,0,0]}:{min:n,max:e}}function Se(t,n){let e=new Float32Array(t.length);for(let r=0;r<n.length;r+=3){let o=n[r]*3,a=n[r+1]*3,i=n[r+2]*3,u=t[a]-t[o],s=t[a+1]-t[o+1],d=t[a+2]-t[o+2],h=t[i]-t[o],m=t[i+1]-t[o+1],l=t[i+2]-t[o+2],f=s*l-d*m,p=d*h-u*l,b=u*m-s*h;for(let T of[o,a,i])e[T]=e[T]+f,e[T+1]=e[T+1]+p,e[T+2]=e[T+2]+b}for(let r=0;r<e.length;r+=3){let o=Math.hypot(e[r],e[r+1],e[r+2]);o>0&&(e[r]=e[r]/o,e[r+1]=e[r+1]/o,e[r+2]=e[r+2]/o)}return e}function ae(t,n,e,r){let{min:o,max:a}=ze(t);return{positions:t,normals:r??Se(t,e),uvs:n,indices:e,min:o,max:a}}function ie(t=1,n=1,e=1){let r=t/2,o=n/2,a=e/2,i=[[[-r,-o,a],[r,-o,a],[r,o,a],[-r,o,a]],[[r,-o,-a],[-r,-o,-a],[-r,o,-a],[r,o,-a]],[[r,-o,a],[r,-o,-a],[r,o,-a],[r,o,a]],[[-r,-o,-a],[-r,-o,a],[-r,o,a],[-r,o,-a]],[[-r,o,a],[r,o,a],[r,o,-a],[-r,o,-a]],[[-r,-o,-a],[r,-o,-a],[r,-o,a],[-r,-o,a]]],u=new Float32Array(72),s=new Float32Array(48),d=new Uint16Array(36),h=0,m=0,l=0,f=0;for(let p of i){for(let[b,T,F]of p)u[h++]=b,u[h++]=T,u[h++]=F;s[m++]=0,s[m++]=0,s[m++]=1,s[m++]=0,s[m++]=1,s[m++]=1,s[m++]=0,s[m++]=1,d[l++]=f,d[l++]=f+1,d[l++]=f+2,d[l++]=f,d[l++]=f+2,d[l++]=f+3,f+=4}return ae(u,s,d)}function se(t=10,n=24){let e=Math.max(1,Math.floor(n)),r=(e+1)*(e+1),o=new Float32Array(r*3),a=new Float32Array(r*3),i=new Float32Array(r*2),u=new Uint16Array(e*e*6),s=0,d=0,h=0;for(let m=0;m<=e;m++)for(let l=0;l<=e;l++){let f=(l/e-.5)*t,p=(m/e-.5)*t;o[s]=f,o[s+1]=0,o[s+2]=p,a[s]=0,a[s+1]=1,a[s+2]=0,s+=3,i[d++]=l/e,i[d++]=m/e}for(let m=0;m<e;m++)for(let l=0;l<e;l++){let f=m*(e+1)+l,p=f+1,b=f+(e+1),T=b+1;u[h++]=f,u[h++]=b,u[h++]=p,u[h++]=p,u[h++]=b,u[h++]=T}return ae(o,i,u,a)}function ue(t=.5,n=24,e=32){let r=Math.max(2,n),o=Math.max(3,e),a=(r+1)*(o+1),i=new Float32Array(a*3),u=new Float32Array(a*3),s=new Float32Array(a*2),d=new Uint16Array(r*o*6),h=0,m=0,l=0;for(let f=0;f<=r;f++){let p=f/r*Math.PI;for(let b=0;b<=o;b++){let T=b/o*Math.PI*2,F=Math.sin(p)*Math.cos(T),E=Math.cos(p),g=Math.sin(p)*Math.sin(T);i[h]=F*t,i[h+1]=E*t,i[h+2]=g*t,u[h]=F,u[h+1]=E,u[h+2]=g,h+=3,s[m++]=b/o,s[m++]=f/r}}for(let f=0;f<r;f++)for(let p=0;p<o;p++){let b=f*(o+1)+p,T=b+1,F=b+(o+1),E=F+1;d[l++]=b,d[l++]=F,d[l++]=T,d[l++]=T,d[l++]=F,d[l++]=E}return ae(i,s,d,u)}function C(t){return t.indices.length/3}var le=89,de=Math.PI/180;function P(t){let n=Math.max(-le,Math.min(le,t.elevationDeg))*de,e=t.azimuthDeg*de,r=Math.max(1e-4,t.distance),o=Math.sin(n)*r,a=Math.cos(n)*r;return[t.target[0]+Math.sin(e)*a,t.target[1]+o,t.target[2]+Math.cos(e)*a]}function I(t,n){let e=P(t),r=t.near??Math.max(.01,t.distance/100),o=t.far??Math.max(r+1,t.distance*8),a=ee((t.fovDeg??38)*de,Math.max(.001,n),r,o),i=z(e,t.target,[0,1,0]);return W(a,i)}function ce(t,n,e){let r=U(t.direction),o=t.extent??Math.max(.1,e*1.35),a=Math.max(1,e*2),i=[n[0]-r[0]*a,n[1]-r[1]*a,n[2]-r[2]*a],u=Math.abs(r[1])>.99?[0,0,1]:[0,1,0],s=z(i,n,u),d=re(-o,o,-o,o,.01,a+e*2+o);return W(d,s)}function me(t,n){let e=j([n[0],n[1],n[2]],[t[0],t[1],t[2]]);return Math.hypot(e[0],e[1],e[2])/2}function fe(t,n){return[(t[0]+n[0])/2,(t[1]+n[1])/2,(t[2]+n[2])/2]}function he(t,n,e){let{gl:r}=t,o=Math.max(1,Math.floor(n)),a=Math.max(1,Math.floor(e)),i=r.createFramebuffer(),u=r.createTexture(),s=r.createTexture();if(!i||!u||!s)return A("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let d=t.hdr?r.RGBA16F:r.RGBA8,h=t.hdr?r.HALF_FLOAT:r.UNSIGNED_BYTE,m=()=>{r.bindTexture(r.TEXTURE_2D,u),r.texImage2D(r.TEXTURE_2D,0,d,o,a,0,r.RGBA,h,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),r.bindTexture(r.TEXTURE_2D,s),r.texImage2D(r.TEXTURE_2D,0,r.DEPTH_COMPONENT24,o,a,0,r.DEPTH_COMPONENT,r.UNSIGNED_INT,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),r.bindFramebuffer(r.FRAMEBUFFER,i),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,u,0),r.framebufferTexture2D(r.FRAMEBUFFER,r.DEPTH_ATTACHMENT,r.TEXTURE_2D,s,0),r.bindFramebuffer(r.FRAMEBUFFER,null)};m(),r.bindFramebuffer(r.FRAMEBUFFER,i);let l=r.checkFramebufferStatus(r.FRAMEBUFFER);return r.bindFramebuffer(r.FRAMEBUFFER,null),l!==r.FRAMEBUFFER_COMPLETE?A("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${l.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:u,depthTexture:s,get width(){return o},get height(){return a},bind(){r.bindFramebuffer(r.FRAMEBUFFER,i),r.viewport(0,0,o,a)},resize(f,p){let b=Math.max(1,Math.floor(f)),T=Math.max(1,Math.floor(p));b===o&&T===a||(o=b,a=T,m())},dispose(){r.deleteFramebuffer(i),r.deleteTexture(u),r.deleteTexture(s)}}}function Ee(t,n=1024){let{gl:e}=t,r=Math.max(256,Math.min(2048,Math.floor(n))),o=e.createFramebuffer(),a=e.createTexture();if(!o||!a)return A("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");e.bindTexture(e.TEXTURE_2D,a),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,r,r,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,o),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,a,0);let i=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),i!==e.FRAMEBUFFER_COMPLETE?A("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:r,bind(){e.bindFramebuffer(e.FRAMEBUFFER,o),e.viewport(0,0,r,r)},dispose(){e.deleteFramebuffer(o),e.deleteTexture(a)}}}var we=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,De=`#version 300 es
precision highp float;
void main(){}`,Pe=`#version 300 es
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
}`;function pe(t,n){let{gl:e}=t,r=e.createVertexArray(),o=e.createBuffer(),a=e.createBuffer(),i=e.createBuffer();return!r||!o||!a||!i?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(e.bindVertexArray(r),e.bindBuffer(e.ARRAY_BUFFER,o),e.bufferData(e.ARRAY_BUFFER,n.positions,e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,3,e.FLOAT,!1,0,0),e.bindBuffer(e.ARRAY_BUFFER,a),e.bufferData(e.ARRAY_BUFFER,n.normals,e.STATIC_DRAW),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,3,e.FLOAT,!1,0,0),e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,i),e.bufferData(e.ELEMENT_ARRAY_BUFFER,n.indices,e.STATIC_DRAW),e.bindVertexArray(null),{vao:r,indexCount:n.indices.length,indexType:n.indices instanceof Uint32Array?e.UNSIGNED_INT:e.UNSIGNED_SHORT,dispose(){e.deleteVertexArray(r),e.deleteBuffer(o),e.deleteBuffer(a),e.deleteBuffer(i)}})}function be(t){let{gl:n}=t,e=t.compile(we,De);if("kind"in e)return e;let r=t.compile(Pe,Ne);if("kind"in r)return r;let o=(a,i)=>n.getUniformLocation(a,i);return{shadowPass(a,i,u){u.bind(),n.clear(n.DEPTH_BUFFER_BIT),n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.FRONT),n.useProgram(e),n.uniformMatrix4fv(o(e,"uLightVP"),!1,a);for(let s of i)n.uniformMatrix4fv(o(e,"uModel"),!1,s.model),n.bindVertexArray(s.mesh.vao),n.drawElements(n.TRIANGLES,s.mesh.indexCount,s.mesh.indexType,0);n.bindVertexArray(null),n.cullFace(n.BACK)},draw(a){n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.useProgram(r),n.uniformMatrix4fv(o(r,"uViewProj"),!1,a.viewProj),n.uniform3fv(o(r,"uEye"),a.eye),n.uniform3fv(o(r,"uLightDir"),a.lightDir),n.uniform3fv(o(r,"uLightColour"),a.lightColour),n.uniform3fv(o(r,"uAmbient"),a.ambient),n.uniformMatrix4fv(o(r,"uLightVP"),!1,a.lightVP),a.shadow?(n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,a.shadow.depthTexture),n.uniform1i(o(r,"uShadowMap"),0),n.uniform1f(o(r,"uShadowTexel"),1/a.shadow.size),n.uniform1f(o(r,"uShadowStrength"),a.shadowStrength??1)):n.uniform1f(o(r,"uShadowStrength"),0);for(let i of a.draws)n.uniformMatrix4fv(o(r,"uModel"),!1,i.model),n.uniformMatrix3fv(o(r,"uNormalMat"),!1,i.normalMat),n.uniform3fv(o(r,"uBaseColour"),i.material.baseColour),n.uniform1f(o(r,"uRoughness"),i.material.roughness),n.uniform1f(o(r,"uMetalness"),i.material.metalness),n.bindVertexArray(i.mesh.vao),n.drawElements(n.TRIANGLES,i.mesh.indexCount,i.mesh.indexType,0);n.bindVertexArray(null),n.disable(n.CULL_FACE)},dispose(){n.deleteProgram(e),n.deleteProgram(r)}}}var M=1280,L=800,Fe=document.getElementById("c");Fe.width=M;Fe.height=L;var O=J(Fe,{alpha:!1});if(!Q(O))throw document.title="REFUSED",document.getElementById("log").textContent=`refused: ${O.code} \u2014 ${O.reason}`,new Error(O.reason);var _=O,c=_.gl,Ye=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,$e=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${ne}
${oe}
void main(){
  vec3 c = texture(uScene, vUv).rgb;
  frag = vec4(lcxEncode(lcxToneMap(c)), 1.0);
}`,Ae=_.compile(Ye,$e),N=be(_),G=he(_,M,L),w=Ee(_,1024),k=t=>{throw document.title="REFUSED",document.getElementById("log").textContent=t,new Error(t)},q=t=>`${t.reason}
${t.detail??""}`;"kind"in Ae&&k(`present: ${q(Ae)}`);"kind"in N&&k(`lit: ${q(N)}`);"kind"in G&&k(`target: ${q(G)}`);"kind"in w&&k(`shadow: ${q(w)}`);var Ue=se(14,24),Ce=ie(1.4,1.4,1.4),Ie=ue(.75,32,48),Te=[Ue,Ce,Ie].map(t=>{let n=pe(_,t);return"kind"in n&&k(`mesh: ${n.reason}`),n}),xe=(t,n,e)=>{let r=new Float32Array(X);return r[12]=t,r[13]=n,r[14]=e,r},ge=new Float32Array([1,0,0,0,1,0,0,0,1]),Y=[{mesh:Te[0],model:xe(0,0,0),normalMat:ge,material:{baseColour:D("#0E1628"),roughness:.82,metalness:0}},{mesh:Te[1],model:xe(-1.15,.7,0),normalMat:ge,material:{baseColour:D("#2C6BFF"),roughness:.34,metalness:.05}},{mesh:Te[2],model:xe(1.15,.75,.3),normalMat:ge,material:{baseColour:D("#C9D4E4"),roughness:.18,metalness:.92}}],V={direction:[-.45,-1,-.35],colour:[3.4,3.3,3.05]},Oe=[-7,0,-7],Ge=[7,2.2,7],Ke=fe(Oe,Ge),ve=me(Oe,Ge),$=ce({...V,extent:ve*.8},Ke,ve),v={target:[0,.6,0],distance:7.2,azimuthDeg:34,elevationDeg:22,fovDeg:36};function K(){let t=I(v,M/L),n=P(v);N.shadowPass($,Y,w),G.bind(),c.clearColor(.004,.007,.017,1),c.clear(c.COLOR_BUFFER_BIT|c.DEPTH_BUFFER_BIT),N.draw({viewProj:t,eye:n,lightDir:V.direction,lightColour:V.colour,ambient:[.055,.07,.115],lightVP:$,shadow:w,shadowStrength:.92,draws:Y}),c.bindFramebuffer(c.FRAMEBUFFER,null),c.viewport(0,0,M,L),c.disable(c.DEPTH_TEST),c.activeTexture(c.TEXTURE0),c.bindTexture(c.TEXTURE_2D,G.texture),_.blit(Ae,e=>c.uniform1i(c.getUniformLocation(e,"uScene"),0))}K();function qe(t){K();let n=new Uint8Array(4);c.readPixels(0,0,1,1,c.RGBA,c.UNSIGNED_BYTE,n);let e=performance.now();for(let r=0;r<t;r++)K();return c.readPixels(0,0,1,1,c.RGBA,c.UNSIGNED_BYTE,n),(performance.now()-e)/t}var Ve=Number(new URLSearchParams(location.search).get("frames")??600),Re=(()=>{for(;c.getError()!==c.NO_ERROR;);N.shadowPass($,Y,w),G.bind(),c.clearColor(.004,.007,.017,1),c.clear(c.COLOR_BUFFER_BIT|c.DEPTH_BUFFER_BIT),N.draw({viewProj:I(v,M/L),eye:P(v),lightDir:V.direction,lightColour:V.colour,ambient:[.055,.07,.115],lightVP:$,shadow:w,shadowStrength:.92,draws:Y});let t=c.getError(),n=new Uint8Array(4);c.readPixels(M>>1,L>>2,1,1,c.RGBA,c.UNSIGNED_BYTE,n);let e=c.getError();return{centre:Array.from(n),afterDraw:t,afterRead:e}})(),Qe=C(Ue)+C(Ce)+C(Ie),ye=qe(Math.max(1,Ve)),Be=(()=>{let t=I(v,M/L),n=-1.15,e=1.4,r=0,o=t[0]*n+t[4]*e+t[8]*r+t[12],a=t[1]*n+t[5]*e+t[9]*r+t[13],i=t[3]*n+t[7]*e+t[11]*r+t[15];return{ndc:[Number((o/i).toFixed(3)),Number((a/i).toFixed(3))],w:Number(i.toFixed(3))}})(),ke={hdr:_.hdr,eye:P(v).map(t=>Number(t.toFixed(2))),boxTopNdc:Be.ndc,boxTopW:Be.w,targetCentre:Re.centre,glAfterDraw:Re.afterDraw,glAfterRead:Re.afterRead,triangles:Qe,shadowMap:w.size,resolution:`${M}x${L}`,frames:Ve,msPerFrame:Number(ye.toFixed(3)),fps:Math.round(1e3/ye),budget60:16.6,headroom:Number((16.6-ye).toFixed(3)),renderer:(()=>{let t=c.getExtension("WEBGL_debug_renderer_info");return t?String(c.getParameter(t.UNMASKED_RENDERER_WEBGL)):"unknown"})()};globalThis.E0=ke;document.getElementById("log").textContent=JSON.stringify(ke,null,2);K();document.title="READY";

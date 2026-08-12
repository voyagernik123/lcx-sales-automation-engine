var Xe={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected."};function R(n,r){return r===void 0?{kind:"refused",code:n,reason:Xe[n]}:{kind:"refused",code:n,reason:Xe[n],detail:r}}function fe(n){return n.kind==="stage"}function de(n,r={}){let t=n.getContext("webgl2",{antialias:r.antialias??!1,alpha:r.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!t)return R("NO_WEBGL2");let e=t.getExtension("EXT_color_buffer_float"),o=n.width,a=n.height,i=e?t.RGBA16F:t.RGBA8,s=e?t.HALF_FLOAT:t.UNSIGNED_BYTE,u=(b,x)=>{let y=t.createTexture();t.bindTexture(t.TEXTURE_2D,y),t.texImage2D(t.TEXTURE_2D,0,i,b,x,0,t.RGBA,s,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);let A=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,A),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,y,0);let w=t.checkFramebufferStatus(t.FRAMEBUFFER);return w!==t.FRAMEBUFFER_COMPLETE?R("FRAMEBUFFER_INCOMPLETE",`status 0x${w.toString(16)} at ${b}\xD7${x}`):{texture:y,framebuffer:A,width:b,height:x}},d=r.bloomShift??2,f={w:o,h:a},l=u(o,a);if("kind"in l)return l;let m=u(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in m)return m;let h=u(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in h)return h;let c=t.createVertexArray();t.bindVertexArray(c);let p=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,p),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null);let E=[];return{kind:"stage",gl:t,cssWidth:n.clientWidth||o,cssHeight:n.clientHeight||a,hdr:!!e,get width(){return f.w},get height(){return f.h},get scene(){return l},get bloomA(){return m},get bloomB(){return h},setRegion(b,x){let y=Math.max(1,Math.round(b)),A=Math.max(1,Math.round(x));if(!(y===f.w&&A===f.h)){f={w:y,h:A};for(let w of[l,m,h])"kind"in w||(t.deleteFramebuffer(w.framebuffer),t.deleteTexture(w.texture));l=u(y,A),m=u(Math.max(1,y>>d),Math.max(1,A>>d)),h=u(Math.max(1,y>>d),Math.max(1,A>>d))}},compile(b,x){let y=(le,I)=>{let U=t.createShader(le);return t.shaderSource(U,I),t.compileShader(U),t.getShaderParameter(U,t.COMPILE_STATUS)?U:R("SHADER_COMPILE_FAILED",t.getShaderInfoLog(U)??"(no log)")},A=y(t.VERTEX_SHADER,b);if(typeof A=="object"&&"kind"in A)return A;let w=y(t.FRAGMENT_SHADER,x);if(typeof w=="object"&&"kind"in w)return w;let L=t.createProgram();return t.attachShader(L,A),t.attachShader(L,w),t.linkProgram(L),t.getProgramParameter(L,t.LINK_STATUS)?(E.push(L),L):R("PROGRAM_LINK_FAILED",t.getProgramInfoLog(L)??"(no log)")},bindTarget(b){t.bindFramebuffer(t.FRAMEBUFFER,b?b.framebuffer:null),t.viewport(0,0,b?b.width:f.w,b?b.height:f.h)},blit(b,x){t.useProgram(b),t.bindVertexArray(c),x?.(b),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null)},dispose(){for(let b of E)t.deleteProgram(b);for(let b of[l,m,h])"kind"in b||(t.deleteFramebuffer(b.framebuffer),t.deleteTexture(b.texture));t.deleteBuffer(p),t.deleteVertexArray(c)}}}var q=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function Q(n,r){let t=new Float32Array(16);for(let e=0;e<4;e++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=n[i*4+o]*r[e*4+i];t[e*4+o]=a}return t}var V=(n,r)=>[n[0]-r[0],n[1]-r[1],n[2]-r[2]],K=(n,r)=>n[0]*r[0]+n[1]*r[1]+n[2]*r[2],k=(n,r)=>[n[1]*r[2]-n[2]*r[1],n[2]*r[0]-n[0]*r[2],n[0]*r[1]-n[1]*r[0]];function _(n){let r=Math.hypot(n[0],n[1],n[2]);return r===0?n:[n[0]/r,n[1]/r,n[2]/r]}function me(n,r,t,e){let o=1/Math.tan(n/2);return new Float32Array([o/r,0,0,0,0,o,0,0,0,0,(e+t)/(t-e),-1,0,0,2*e*t/(t-e),0])}function he(n,r,t,e,o,a){let i=r-n,s=e-t,u=a-o;return new Float32Array([2/i,0,0,0,0,2/s,0,0,0,0,-2/u,0,-(r+n)/i,-(e+t)/s,-(a+o)/u,1])}function Z(n,r,t){let e=_(V(n,r)),o=k(t,e);if(Math.hypot(o[0],o[1],o[2])<1e-8)return q();let a=_(o),i=k(e,a);return new Float32Array([a[0],i[0],e[0],0,a[1],i[1],e[1],0,a[2],i[2],e[2],0,-K(a,n),-K(i,n),-K(e,n),1])}function ze(n){return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4)}var mt=/^#?([0-9a-fA-F]{6})$/;function H(n){let r=mt.exec(n.trim());if(!r)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(n)}`);let t=r[1];return[0,2,4].map(e=>ze(parseInt(t.slice(e,e+2),16)/255))}var pe={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},ht=Object.freeze(Object.fromEntries(Object.keys(pe).map(n=>[n,H(pe[n])])));var je=.4;var be=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${je.toFixed(2)}); }`,ge=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function pt(n){let r=[1/0,1/0,1/0],t=[-1/0,-1/0,-1/0];for(let e=0;e<n.length;e+=3)for(let o=0;o<3;o++){let a=n[e+o];a<r[o]&&(r[o]=a),a>t[o]&&(t[o]=a)}return n.length===0?{min:[0,0,0],max:[0,0,0]}:{min:r,max:t}}function We(n,r,t,e){let o=new Float32Array(n.length);for(let i=0;i<e.length;i+=3){let s=e[i],u=e[i+1],d=e[i+2],f=s*3,l=u*3,m=d*3,h=s*2,c=u*2,p=d*2,E=n[l]-n[f],T=n[l+1]-n[f+1],b=n[l+2]-n[f+2],x=n[m]-n[f],y=n[m+1]-n[f+1],A=n[m+2]-n[f+2],w=t[c]-t[h],L=t[c+1]-t[h+1],le=t[p]-t[h],I=t[p+1]-t[h+1],U=w*I-le*L;if(Math.abs(U)<1e-12)continue;let ce=1/U,ct=(E*I-x*L)*ce,ft=(T*I-y*L)*ce,dt=(b*I-A*L)*ce;for(let G of[f,l,m])o[G]=o[G]+ct,o[G+1]=o[G+1]+ft,o[G+2]=o[G+2]+dt}let a=new Float32Array(n.length);for(let i=0;i<a.length;i+=3){let s=r[i],u=r[i+1],d=r[i+2],f=o[i],l=o[i+1],m=o[i+2],h=f*s+l*u+m*d;f-=s*h,l-=u*h,m-=d*h;let c=Math.hypot(f,l,m);c<1e-8&&(Math.abs(s)<.9?(f=0,l=-d,m=u):(f=-d,l=0,m=s),c=Math.hypot(f,l,m)||1),a[i]=f/c,a[i+1]=l/c,a[i+2]=m/c}return a}function Ye(n,r){let t=new Float32Array(n.length);for(let e=0;e<r.length;e+=3){let o=r[e]*3,a=r[e+1]*3,i=r[e+2]*3,s=n[a]-n[o],u=n[a+1]-n[o+1],d=n[a+2]-n[o+2],f=n[i]-n[o],l=n[i+1]-n[o+1],m=n[i+2]-n[o+2],h=u*m-d*l,c=d*f-s*m,p=s*l-u*f;for(let E of[o,a,i])t[E]=t[E]+h,t[E+1]=t[E+1]+c,t[E+2]=t[E+2]+p}for(let e=0;e<t.length;e+=3){let o=Math.hypot(t[e],t[e+1],t[e+2]);o>0&&(t[e]=t[e]/o,t[e+1]=t[e+1]/o,t[e+2]=t[e+2]/o)}return t}function Ee(n,r,t,e,o){let{min:a,max:i}=pt(n),s=e??Ye(n,t);return{positions:n,normals:s,uvs:r,indices:t,min:a,max:i,tangents:o??We(n,s,r,t)}}function Te(n=1,r=1,t=1){let e=n/2,o=r/2,a=t/2,i=[[[-e,-o,a],[e,-o,a],[e,o,a],[-e,o,a]],[[e,-o,-a],[-e,-o,-a],[-e,o,-a],[e,o,-a]],[[e,-o,a],[e,-o,-a],[e,o,-a],[e,o,a]],[[-e,-o,-a],[-e,-o,a],[-e,o,a],[-e,o,-a]],[[-e,o,a],[e,o,a],[e,o,-a],[-e,o,-a]],[[-e,-o,-a],[e,-o,-a],[e,-o,a],[-e,-o,a]]],s=new Float32Array(72),u=new Float32Array(48),d=new Uint16Array(36),f=0,l=0,m=0,h=0;for(let c of i){for(let[p,E,T]of c)s[f++]=p,s[f++]=E,s[f++]=T;u[l++]=0,u[l++]=0,u[l++]=1,u[l++]=0,u[l++]=1,u[l++]=1,u[l++]=0,u[l++]=1,d[m++]=h,d[m++]=h+1,d[m++]=h+2,d[m++]=h,d[m++]=h+2,d[m++]=h+3,h+=4}return Ee(s,u,d)}function ye(n=10,r=24){let t=Math.max(1,Math.floor(r)),e=(t+1)*(t+1),o=new Float32Array(e*3),a=new Float32Array(e*3),i=new Float32Array(e*2),s=new Uint16Array(t*t*6),u=0,d=0,f=0;for(let l=0;l<=t;l++)for(let m=0;m<=t;m++){let h=(m/t-.5)*n,c=(l/t-.5)*n;o[u]=h,o[u+1]=0,o[u+2]=c,a[u]=0,a[u+1]=1,a[u+2]=0,u+=3,i[d++]=m/t,i[d++]=l/t}for(let l=0;l<t;l++)for(let m=0;m<t;m++){let h=l*(t+1)+m,c=h+1,p=h+(t+1),E=p+1;s[f++]=h,s[f++]=p,s[f++]=c,s[f++]=c,s[f++]=p,s[f++]=E}return Ee(o,i,s,a)}function xe(n=.5,r=24,t=32){let e=Math.max(2,r),o=Math.max(3,t),a=(e+1)*(o+1),i=new Float32Array(a*3),s=new Float32Array(a*3),u=new Float32Array(a*2),d=new Uint16Array(e*o*6),f=0,l=0,m=0;for(let h=0;h<=e;h++){let c=h/e*Math.PI;for(let p=0;p<=o;p++){let E=p/o*Math.PI*2,T=Math.sin(c)*Math.cos(E),b=Math.cos(c),x=Math.sin(c)*Math.sin(E);i[f]=T*n,i[f+1]=b*n,i[f+2]=x*n,s[f]=T,s[f+1]=b,s[f+2]=x,f+=3,u[l++]=p/o,u[l++]=h/e}}for(let h=0;h<e;h++)for(let c=0;c<o;c++){let p=h*(o+1)+c,E=p+1,T=p+(o+1),b=T+1;d[m++]=p,d[m++]=E,d[m++]=T,d[m++]=E,d[m++]=b,d[m++]=T}return Ee(i,u,d,s)}function X(n){return n.indices.length/3}var Re=89,Ae=Math.PI/180;function N(n){let r=Math.max(-Re,Math.min(Re,n.elevationDeg))*Ae,t=n.azimuthDeg*Ae,e=Math.max(1e-4,n.distance),o=Math.sin(r)*e,a=Math.cos(r)*e;return[n.target[0]+Math.sin(t)*a,n.target[1]+o,n.target[2]+Math.cos(t)*a]}function z(n,r){let t=N(n),e=n.near??Math.max(.01,n.distance/100),o=n.far??Math.max(e+1,n.distance*8),a=me((n.fovDeg??38)*Ae,Math.max(.001,r),e,o),i=Z(t,n.target,[0,1,0]);return Q(a,i)}function ve(n,r,t){let e=_(n.direction),o=n.extent??Math.max(.1,t*1.35),a=Math.max(1,t*2),i=[r[0]-e[0]*a,r[1]-e[1]*a,r[2]-e[2]*a],s=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],u=Z(i,r,s),d=he(-o,o,-o,o,.01,a+t*2+o);return Q(d,u)}function Fe(n,r){let t=V([r[0],r[1],r[2]],[n[0],n[1],n[2]]);return Math.hypot(t[0],t[1],t[2])/2}function Me(n,r){return[(n[0]+r[0])/2,(n[1]+r[1])/2,(n[2]+r[2])/2]}function we(n,r,t){let{gl:e}=n,o=Math.max(1,Math.floor(r)),a=Math.max(1,Math.floor(t)),i=e.createFramebuffer(),s=e.createTexture(),u=e.createTexture();if(!i||!s||!u)return R("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let d=n.hdr?e.RGBA16F:e.RGBA8,f=n.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,l=()=>{e.bindTexture(e.TEXTURE_2D,s),e.texImage2D(e.TEXTURE_2D,0,d,o,a,0,e.RGBA,f,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,u),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,o,a,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,s,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,u,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};l(),e.bindFramebuffer(e.FRAMEBUFFER,i);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE?R("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${m.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:s,depthTexture:u,get width(){return o},get height(){return a},bind(){e.bindFramebuffer(e.FRAMEBUFFER,i),e.viewport(0,0,o,a)},resize(h,c){let p=Math.max(1,Math.floor(h)),E=Math.max(1,Math.floor(c));p===o&&E===a||(o=p,a=E,l())},dispose(){e.deleteFramebuffer(i),e.deleteTexture(s),e.deleteTexture(u)}}}function Le(n,r=1024){let{gl:t}=n,e=Math.max(256,Math.min(2048,Math.floor(r))),o=t.createFramebuffer(),a=t.createTexture();if(!o||!a)return R("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");t.bindTexture(t.TEXTURE_2D,a),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,e,e,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,o),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,a,0);let i=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),i!==t.FRAMEBUFFER_COMPLETE?R("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:e,bind(){t.bindFramebuffer(t.FRAMEBUFFER,o),t.viewport(0,0,e,e)},dispose(){t.deleteFramebuffer(o),t.deleteTexture(a)}}}var ee=`
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
}`,J={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function te(n,r,t={}){let e=t.zenith??J.zenith,o=t.horizon??J.horizon,a=t.ground??J.ground;n.uniform3f(n.getUniformLocation(r,"uSkyZenith"),e[0],e[1],e[2]),n.uniform3f(n.getUniformLocation(r,"uSkyHorizon"),o[0],o[1],o[2]),n.uniform3f(n.getUniformLocation(r,"uSkyGround"),a[0],a[1],a[2])}var bt=`#version 300 es
precision highp float;
out vec2 vNdc;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`,gt=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${ee}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;function Se(n){let{gl:r}=n,t=n.compile(bt,gt);return"kind"in t?t:{draw(e){let o=_(V(e.target,e.eye)),a=Math.abs(o[1])>.999?[0,0,1]:[0,1,0],i=_(k(o,a)),s=_(k(i,o));r.disable(r.DEPTH_TEST),r.depthMask(!1),r.disable(r.BLEND),r.useProgram(t),r.uniform3f(r.getUniformLocation(t,"uRight"),i[0],i[1],i[2]),r.uniform3f(r.getUniformLocation(t,"uUp"),s[0],s[1],s[2]),r.uniform3f(r.getUniformLocation(t,"uForward"),o[0],o[1],o[2]),r.uniform1f(r.getUniformLocation(t,"uTanHalfFov"),Math.tan(e.fovDeg*Math.PI/360)),r.uniform1f(r.getUniformLocation(t,"uAspect"),Math.max(.001,e.aspect)),te(r,t,e.sky),n.blit(t),r.depthMask(!0),r.enable(r.DEPTH_TEST)},dispose(){r.deleteProgram(t)}}}var $e=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,_e=`#version 300 es
precision highp float;
void main(){}`,Et=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,Ke=`#version 300 es
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
  /* THE NORMAL MATRIX, not the model matrix. Under non-uniform scale the model matrix skews
     normals off the surface and the lighting rotates as the object is squashed \u2014 the transpose
     of the inverse is the only transform that keeps them perpendicular. */
  vNormal = normalize(uNormalMat * aNormal);
  /* The tangent transforms by the MODEL matrix, not the normal matrix: it is a direction lying IN
     the surface, so it follows the geometry rather than staying perpendicular to it. Using the
     normal matrix here is a common slip and rotates the brush direction under non-uniform scale. */
  vTangent = normalize(mat3(uModel) * aTangent);
  gl_Position = uViewProj * world;
}`,qe=`#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
in vec3 vTangent;

uniform vec3 uEye;
uniform vec3 uLightDir;      // direction the light TRAVELS
uniform vec3 uLightColour;   // linear radiance
uniform float uAmbientGain;  // scales the environment's contribution
uniform vec3 uBaseColour;    // linear, brand-exact
uniform float uRoughness;
uniform float uMetalness;
uniform float uAnisotropy;   // 0 = isotropic, ->1 = highlight stretched along the tangent

uniform mat4 uLightVP;
uniform sampler2D uShadowMap;
uniform float uShadowTexel;  // 1.0 / shadowMapSize
uniform float uShadowStrength;

uniform sampler2D uAO;
uniform vec2 uScreenSize;
uniform float uAOEnabled;
/*
 * EXPONENTIAL HEIGHT FOG \u2014 L2.9. Zero density is the default, so the five environments that shipped
 * before this existed render byte-identically. Additive, not a rewrite.
 */
uniform float uFogDensity;   // 0 disables the whole term
uniform float uFogHeight;    // e-folding height: fog thins upward over this many metres
uniform vec3 uFogColour;     // linear; -1 in .r means "take it from the sky"
uniform float uFogFloor;     // y at which density is uFogDensity

out vec4 frag;
${ee}

const float PI = 3.14159265359;

float distributionGGX(float NdotH, float rough) {
  float a = rough * rough;
  float a2 = a * a;
  float d = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / max(1e-6, PI * d * d);
}

/*
 * ANISOTROPIC GGX \u2014 the difference between machined metal and grey plastic.
 *
 * Isotropic GGX gives a round highlight. Real turned or brushed metal has microscopic grooves
 * running one way, so the highlight STRETCHES perpendicular to nothing and elongates ALONG the
 * grooves \u2014 which is why a brushed-steel dial shows a bar of light rather than a dot, and why \xA72
 * asks for anisotropy specifically.
 *
 * Two roughnesses instead of one: at along the tangent, ab along the bitangent. The half-vector is
 * measured in that frame, so the lobe becomes an ellipse. Same energy, different shape.
 */
float distributionGGXAniso(float NdotH, float TdotH, float BdotH, float at, float ab) {
  float a2 = at * ab;
  vec3 v = vec3(ab * TdotH, at * BdotH, a2 * NdotH);
  float v2 = dot(v, v);
  float w2 = a2 / max(1e-8, v2);
  return a2 * w2 * w2 / PI;
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

  /* The tangent frame, re-orthogonalised in the fragment. Interpolating a tangent across a
     triangle leaves it slightly off-perpendicular to the interpolated normal, and an anisotropic
     lobe built on a skewed frame twists visibly along a curved surface. */
  vec3 T = normalize(vTangent - N * dot(N, vTangent));
  vec3 B = cross(N, T);
  float aniso = clamp(uAnisotropy, 0.0, 0.95);
  // Preserve the average roughness while splitting it, so turning anisotropy up does not also
  // change how rough the surface reads.
  float at = max(0.002, rough * (1.0 + aniso));
  float ab = max(0.002, rough * (1.0 - aniso));

  float D = aniso > 0.001
    ? distributionGGXAniso(NdotH, dot(T, H), dot(B, H), at, ab)
    : distributionGGX(NdotH, rough);
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

  vec3 lit = direct + ambient;

  /*
   * FOG LAST, AND BEFORE THE TONE MAP \u2014 which is the whole reason it lives in this shader rather
   * than in a post-process pass.
   *
   * A depth-based screen fade applied after tone mapping fades toward a DISPLAY colour, so the
   * horizon washes to a grey that no light in the scene could produce and the frame looks hazed
   * rather than deep. Mixing in linear radiance, before the curve, means distant surfaces converge
   * on the same value the sky already has there \u2014 which is what atmosphere actually does.
   *
   * The integral is analytic. Density falls off exponentially with height, so the optical depth along
   * a ray from the eye to the surface is the height-integrated density rather than the naive
   * distance * density that a flat-fog shader uses. The difference is visible the moment the camera
   * is not level: flat fog fogs the sky directly overhead exactly as much as the horizon.
   */
  if (uFogDensity > 0.0) {
    vec3 toEye = uEye - vWorld;
    float dist = length(toEye);
    float dyRaw = uEye.y - vWorld.y;
    float hEye = max(0.0, uEye.y - uFogFloor);
    float hFrag = max(0.0, vWorld.y - uFogFloor);
    float k = max(1e-4, uFogHeight);
    float depth;
    if (abs(dyRaw) < 1e-4) {
      // A horizontal ray: height is constant, so the integral is the flat one at that height.
      depth = uFogDensity * dist * exp(-hFrag / k);
    } else {
      /* integral of exp(-h/k) along the ray, in closed form. The dist/|dy| factor converts the
         vertical integration variable back to arc length, which is what makes a near-horizontal ray
         accumulate far more fog than a vertical one of the same length. */
      depth = uFogDensity * k * (dist / abs(dyRaw)) * abs(exp(-hFrag / k) - exp(-hEye / k));
    }
    vec3 fogCol = uFogColour.r < 0.0 ? skyColour(normalize(-toEye)) : uFogColour;
    lit = mix(lit, fogCol, 1.0 - exp(-depth));
  }

  // NO TONE MAP. The composite owns the only one in the pipeline.
  frag = vec4(lit, 1.0);
}`;function De(n,r){let{gl:t}=n,e=t.createVertexArray(),o=t.createBuffer(),a=t.createBuffer(),i=t.createBuffer(),s=t.createBuffer();return!e||!o||!a||!i||!s?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(t.bindVertexArray(e),t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,r.positions,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,a),t.bufferData(t.ARRAY_BUFFER,r.normals,t.STATIC_DRAW),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,i),t.bufferData(t.ARRAY_BUFFER,r.tangents,t.STATIC_DRAW),t.enableVertexAttribArray(2),t.vertexAttribPointer(2,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,s),t.bufferData(t.ELEMENT_ARRAY_BUFFER,r.indices,t.STATIC_DRAW),t.bindVertexArray(null),{vao:e,indexCount:r.indices.length,indexType:r.indices instanceof Uint32Array?t.UNSIGNED_INT:t.UNSIGNED_SHORT,dispose(){t.deleteVertexArray(e),t.deleteBuffer(o),t.deleteBuffer(a),t.deleteBuffer(i),t.deleteBuffer(s)}})}function Ue(n){let{gl:r}=n,t=n.compile($e,_e);if("kind"in t)return t;let e=n.compile(Ke,qe);if("kind"in e)return e;let o=n.compile(Et,_e);if("kind"in o)return o;let a=(i,s)=>r.getUniformLocation(i,s);return{shadowPass(i,s,u,d){let f=d??(()=>{});u.bind(),f("shadow.bind"),r.clear(r.DEPTH_BUFFER_BIT),r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.FRONT),r.useProgram(t),f("useProgram(shadow)"),r.uniformMatrix4fv(a(t,"uLightVP"),!1,i),f("uLightVP");for(let l of s)r.uniformMatrix4fv(a(t,"uModel"),!1,l.model),f("shadow uModel"),r.bindVertexArray(l.mesh.vao),f("shadow bindVAO"),r.drawElements(r.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0),f("shadow drawElements");r.bindVertexArray(null),r.cullFace(r.BACK)},depthPrepass(i,s){r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.colorMask(!1,!1,!1,!1),r.useProgram(o),r.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let u of s)r.uniformMatrix4fv(a(o,"uModel"),!1,u.model),r.bindVertexArray(u.mesh.vao),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0);r.bindVertexArray(null),r.colorMask(!0,!0,!0,!0)},draw(i){let s=i.onStep??(()=>{});if(r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.useProgram(e),r.uniformMatrix4fv(a(e,"uViewProj"),!1,i.viewProj),s("uViewProj"),r.uniform3fv(a(e,"uEye"),i.eye),s("uEye"),r.uniform3fv(a(e,"uLightDir"),i.lightDir),s("uLightDir"),r.uniform3fv(a(e,"uLightColour"),i.lightColour),s("uLightColour"),r.uniform1f(a(e,"uAmbientGain"),i.ambientGain??1),s("uAmbientGain"),i.fog&&i.fog.density>0){r.uniform1f(a(e,"uFogDensity"),i.fog.density),r.uniform1f(a(e,"uFogHeight"),i.fog.height),r.uniform1f(a(e,"uFogFloor"),i.fog.floor??0);let u=i.fog.colour;u==="sky"?r.uniform3f(a(e,"uFogColour"),-1,-1,-1):r.uniform3f(a(e,"uFogColour"),u[0],u[1],u[2]),s("fog")}else r.uniform1f(a(e,"uFogDensity"),0);te(r,e,i.sky),s("bindSky"),i.ao&&i.screenSize?(r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,i.ao),r.uniform1i(a(e,"uAO"),1),r.uniform2f(a(e,"uScreenSize"),i.screenSize[0],i.screenSize[1]),r.uniform1f(a(e,"uAOEnabled"),1)):r.uniform1f(a(e,"uAOEnabled"),0),s("bindAO"),r.uniformMatrix4fv(a(e,"uLightVP"),!1,i.lightVP),s("lit uLightVP"),i.shadow?(r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,i.shadow.depthTexture),r.uniform1i(a(e,"uShadowMap"),0),r.uniform1f(a(e,"uShadowTexel"),1/i.shadow.size),r.uniform1f(a(e,"uShadowStrength"),i.shadowStrength??1)):r.uniform1f(a(e,"uShadowStrength"),0);for(let u of i.draws)r.uniformMatrix4fv(a(e,"uModel"),!1,u.model),r.uniformMatrix3fv(a(e,"uNormalMat"),!1,u.normalMat),s("uNormalMat"),r.uniform3fv(a(e,"uBaseColour"),u.material.baseColour),s("uBaseColour"),r.uniform1f(a(e,"uRoughness"),u.material.roughness),r.uniform1f(a(e,"uMetalness"),u.material.metalness),r.uniform1f(a(e,"uAnisotropy"),u.material.anisotropy??0),r.bindVertexArray(u.mesh.vao),s("lit bindVAO"),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0),s("lit drawElements");r.bindVertexArray(null),r.disable(r.CULL_FACE)},dispose(){r.deleteProgram(t),r.deleteProgram(e),r.deleteProgram(o)}}}var j=`
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
}`,Qe=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Tt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${j}

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
}`,yt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${j}

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
}`;function Pe(n,r,t){let{gl:e}=n,o=n.compile(Qe,Tt);if("kind"in o)return o;let a=n.compile(Qe,yt);if("kind"in a)return a;let i=Math.max(1,r>>1),s=Math.max(1,t>>1),u=()=>{let c=e.createFramebuffer(),p=e.createTexture();return!c||!p?null:{fb:c,tex:p}},d=u(),f=u();if(!d||!f)return R("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let l=()=>{for(let c of[d,f])e.bindTexture(e.TEXTURE_2D,c.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,i,s,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,c.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,c.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};l(),e.bindFramebuffer(e.FRAMEBUFFER,d.fb);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE)return R("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${m.toString(16)}).`);let h=(c,p,E,T,b,x,y)=>{e.activeTexture(e.TEXTURE0+y),e.bindTexture(e.TEXTURE_2D,p),e.uniform1i(e.getUniformLocation(c,"uDepth"),y),e.uniform2f(e.getUniformLocation(c,"uNearFar"),E,T),e.uniform1f(e.getUniformLocation(c,"uTanHalfFov"),Math.tan(b*Math.PI/360)),e.uniform1f(e.getUniformLocation(c,"uAspect"),x)};return{get texture(){return d.tex},get width(){return i},get height(){return s},compute(c){e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,d.fb),e.viewport(0,0,i,s),e.useProgram(o),h(o,c.depthTexture,c.near,c.far,c.fovDeg,c.aspect,0),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/i,1/s),e.uniform1f(e.getUniformLocation(o,"uRadius"),c.radius??.55),e.uniform1f(e.getUniformLocation(o,"uStrength"),c.strength??1.15),e.uniform1f(e.getUniformLocation(o,"uBias"),c.bias??.035),n.blit(o);for(let[p,E,T]of[[d,f,[1,0]],[f,d,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,E.fb),e.viewport(0,0,i,s),e.useProgram(a),h(a,c.depthTexture,c.near,c.far,c.fovDeg,c.aspect,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,p.tex),e.uniform1i(e.getUniformLocation(a,"uAO"),1),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/i,1/s),e.uniform2f(e.getUniformLocation(a,"uDir"),T[0],T[1]),n.blit(a);e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(c,p){let E=Math.max(1,c>>1),T=Math.max(1,p>>1);E===i&&T===s||(i=E,s=T,l())},dispose(){e.deleteProgram(o),e.deleteProgram(a);for(let c of[d,f])e.deleteFramebuffer(c.fb),e.deleteTexture(c.tex)}}}var xt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Rt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uFocusDistance;
uniform float uAperture;
uniform float uMaxCoc;
out vec4 frag;
${j}

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
}`;function Ne(n,r,t){let{gl:e}=n,o=n.compile(xt,Rt);if("kind"in o)return o;let a=Math.max(1,Math.floor(r)),i=Math.max(1,Math.floor(t)),s=e.createFramebuffer(),u=e.createTexture();if(!s||!u)return R("FRAMEBUFFER_INCOMPLETE","The GPU refused a depth-of-field buffer.");let d=()=>{e.bindTexture(e.TEXTURE_2D,u);let l=n.hdr?e.RGBA16F:e.RGBA8,m=n.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE;e.texImage2D(e.TEXTURE_2D,0,l,a,i,0,e.RGBA,m,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,s),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,u,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};d(),e.bindFramebuffer(e.FRAMEBUFFER,s);let f=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),f!==e.FRAMEBUFFER_COMPLETE?R("FRAMEBUFFER_INCOMPLETE",`The DOF buffer is incomplete (0x${f.toString(16)}).`):{texture:u,apply(l){e.bindFramebuffer(e.FRAMEBUFFER,s),e.viewport(0,0,a,i),e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.useProgram(o),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,l.scene),e.uniform1i(e.getUniformLocation(o,"uScene"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,l.depthTexture),e.uniform1i(e.getUniformLocation(o,"uDepth"),1),e.uniform2f(e.getUniformLocation(o,"uNearFar"),l.near,l.far),e.uniform1f(e.getUniformLocation(o,"uTanHalfFov"),Math.tan(l.fovDeg*Math.PI/360)),e.uniform1f(e.getUniformLocation(o,"uAspect"),l.aspect),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/a,1/i),e.uniform1f(e.getUniformLocation(o,"uFocusDistance"),l.focusDistance),e.uniform1f(e.getUniformLocation(o,"uAperture"),l.aperture??12),e.uniform1f(e.getUniformLocation(o,"uMaxCoc"),l.maxCoc??.012),n.blit(o),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(l,m){let h=Math.max(1,Math.floor(l)),c=Math.max(1,Math.floor(m));h===a&&c===i||(a=h,i=c,d())},dispose(){e.deleteProgram(o),e.deleteFramebuffer(s),e.deleteTexture(u)}}}var Ve=Math.max(1,Math.min(3,Number(new URLSearchParams(location.search).get("scale")??1))),F=1280*Ve,M=800*Ve,He=document.getElementById("c");He.width=F;He.height=M;var W=de(He,{alpha:!1});if(!fe(W))throw document.title="REFUSED",document.getElementById("log").textContent=`refused: ${W.code} \u2014 ${W.reason}`,new Error(W.reason);var S=W,g=S.gl,At=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,vt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${be}
${ge}
void main(){
  vec3 c = texture(uScene, vUv).rgb;
  frag = vec4(lcxEncode(lcxToneMap(c)), 1.0);
}`,Ge=S.compile(At,vt),O=Ue(S),D=we(S,F,M),B=Le(S,1024),ne=Se(S),oe=Pe(S,F,M),ae=Ne(S,F,M),P=n=>{throw document.title="REFUSED",document.getElementById("log").textContent=n,new Error(n)},C=n=>`${n.reason}
${n.detail??""}`;"kind"in Ge&&P(`present: ${C(Ge)}`);"kind"in O&&P(`lit: ${C(O)}`);"kind"in D&&P(`target: ${C(D)}`);"kind"in B&&P(`shadow: ${C(B)}`);"kind"in ne&&P(`sky: ${C(ne)}`);"kind"in oe&&P(`ao: ${C(oe)}`);"kind"in ae&&P(`dof: ${C(ae)}`);var et=ye(14,24),tt=Te(1.4,1.4,1.4),rt=xe(.75,32,48),Oe=[et,tt,rt].map(n=>{let r=De(S,n);return"kind"in r&&P(`mesh: ${r.reason}`),r}),Be=(n,r,t)=>{let e=q();return e[12]=n,e[13]=r,e[14]=t,e},Ce=new Float32Array([1,0,0,0,1,0,0,0,1]),Y=[{mesh:Oe[0],model:Be(0,0,0),normalMat:Ce,material:{baseColour:H("#0E1628"),roughness:.82,metalness:0}},{mesh:Oe[1],model:Be(-1.15,.7,0),normalMat:Ce,material:{baseColour:H("#2C6BFF"),roughness:.34,metalness:.05}},{mesh:Oe[2],model:Be(1.15,.75,.3),normalMat:Ce,material:{baseColour:H("#C9D4E4"),roughness:at?.045:.18,metalness:.92}}],$={direction:[-.45,-1,-.35],colour:[3.4,3.3,3.05]},nt=[-7,0,-7],ot=[7,2.2,7],Ft=Me(nt,ot),Ze=Fe(nt,ot),ie=ve({...$,extent:Ze*.8},Ft,Ze),v={target:[0,.6,0],distance:7.2,azimuthDeg:34,elevationDeg:22,fovDeg:36},at=new URLSearchParams(location.search).get("diag")==="1",ke=new URLSearchParams(location.search).get("ao")!=="0",it=new URLSearchParams(location.search).get("dof")!=="0",Mt={zenith:[1.6,.05,.05],horizon:[.05,.08,1.6],ground:[.05,1.2,.05]},se=at?Mt:void 0,st=Math.max(1,Number(new URLSearchParams(location.search).get("repeat")??1));function ue(){let n=z(v,F/M),r=N(v);O.shadowPass(ie,Y,B),D.bind(),g.clear(g.DEPTH_BUFFER_BIT),ne.draw({eye:r,target:v.target,fovDeg:v.fovDeg??36,aspect:F/M,sky:se});let t=Math.max(.01,v.distance/100),e=Math.max(t+1,v.distance*8);O.depthPrepass(n,Y),ke&&(oe.compute({depthTexture:D.depthTexture,near:t,far:e,fovDeg:v.fovDeg??36,aspect:F/M,radius:.6,strength:1.25}),D.bind());for(let a=0;a<st;a++)O.draw({viewProj:n,eye:r,lightDir:$.direction,lightColour:$.colour,ambientGain:1,sky:se,lightVP:ie,shadow:B,shadowStrength:.92,draws:Y,ao:ke?oe.texture:null,screenSize:[F,M]});let o=D.texture;if(it){let a=Math.hypot(r[0]-1.15,r[1]-.75,r[2]-.3);ae.apply({scene:D.texture,depthTexture:D.depthTexture,near:t,far:e,fovDeg:v.fovDeg??36,aspect:F/M,focusDistance:a,aperture:9,maxCoc:.01}),o=ae.texture}g.bindFramebuffer(g.FRAMEBUFFER,null),g.viewport(0,0,F,M),g.disable(g.DEPTH_TEST),g.activeTexture(g.TEXTURE0),g.bindTexture(g.TEXTURE_2D,o),S.blit(Ge,a=>g.uniform1i(g.getUniformLocation(a,"uScene"),0))}ue();function wt(n){ue();let r=new Uint8Array(4);g.readPixels(0,0,1,1,g.RGBA,g.UNSIGNED_BYTE,r);let t=performance.now();for(let e=0;e<n;e++)ue();return g.readPixels(0,0,1,1,g.RGBA,g.UNSIGNED_BYTE,r),(performance.now()-t)/n}var ut=Number(new URLSearchParams(location.search).get("frames")??600),re=(()=>{for(;g.getError()!==g.NO_ERROR;);let n=[],r=a=>{let i=g.getError();i!==g.NO_ERROR&&n.push(`${a}=0x${i.toString(16)}`)};O.shadowPass(ie,Y,B,r),D.bind(),r("target.bind"),g.clear(g.DEPTH_BUFFER_BIT),r("clear"),ne.draw({eye:N(v),target:v.target,fovDeg:v.fovDeg??36,aspect:F/M,sky:se}),r("sky"),O.draw({viewProj:z(v,F/M),eye:N(v),lightDir:$.direction,lightColour:$.colour,ambientGain:1,sky:se,lightVP:ie,shadow:B,shadowStrength:.92,draws:Y,onStep:r});let t=g.getError(),e=new Uint8Array(4);g.readPixels(F>>1,M>>2,1,1,g.RGBA,g.UNSIGNED_BYTE,e);let o=g.getError();return{centre:Array.from(e),afterDraw:t,afterRead:o,bad:n}})(),Lt=X(et)+X(tt)+X(rt),Ie=wt(Math.max(1,ut)),Je=(()=>{let n=z(v,F/M),r=-1.15,t=1.4,e=0,o=n[0]*r+n[4]*t+n[8]*e+n[12],a=n[1]*r+n[5]*t+n[9]*e+n[13],i=n[3]*r+n[7]*t+n[11]*e+n[15];return{ndc:[Number((o/i).toFixed(3)),Number((a/i).toFixed(3))],w:Number(i.toFixed(3))}})(),lt={hdr:S.hdr,eye:N(v).map(n=>Number(n.toFixed(2))),boxTopNdc:Je.ndc,boxTopW:Je.w,targetCentre:re.centre,failingCalls:re.bad,glAfterDraw:re.afterDraw,glAfterRead:re.afterRead,triangles:Lt,shadowMap:B.size,resolution:`${F}x${M}`,dprScale:Ve,aoEnabled:ke,dofEnabled:it,frames:ut,repeat:st,msPerFrame:Number(Ie.toFixed(3)),fps:Math.round(1e3/Ie),budget60:16.6,headroom:Number((16.6-Ie).toFixed(3)),renderer:(()=>{let n=g.getExtension("WEBGL_debug_renderer_info");return n?String(g.getParameter(n.UNMASKED_RENDERER_WEBGL)):"unknown"})()};globalThis.E0=lt;document.getElementById("log").textContent=JSON.stringify(lt,null,2);ue();document.title="READY";

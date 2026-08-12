var He={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected."};function y(n,r){return r===void 0?{kind:"refused",code:n,reason:He[n]}:{kind:"refused",code:n,reason:He[n],detail:r}}function le(n){return n.kind==="stage"}function ce(n,r={}){let t=n.getContext("webgl2",{antialias:r.antialias??!1,alpha:r.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!t)return y("NO_WEBGL2");let e=t.getExtension("EXT_color_buffer_float"),o=n.width,a=n.height,i=e?t.RGBA16F:t.RGBA8,u=e?t.HALF_FLOAT:t.UNSIGNED_BYTE,l=(b,F)=>{let x=t.createTexture();t.bindTexture(t.TEXTURE_2D,x),t.texImage2D(t.TEXTURE_2D,0,i,b,F,0,t.RGBA,u,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);let R=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,R),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,x,0);let A=t.checkFramebufferStatus(t.FRAMEBUFFER);return A!==t.FRAMEBUFFER_COMPLETE?y("FRAMEBUFFER_INCOMPLETE",`status 0x${A.toString(16)} at ${b}\xD7${F}`):{texture:x,framebuffer:R,width:b,height:F}},h=r.bloomShift??2,f={w:o,h:a},s=l(o,a);if("kind"in s)return s;let m=l(Math.max(1,o>>h),Math.max(1,a>>h));if("kind"in m)return m;let d=l(Math.max(1,o>>h),Math.max(1,a>>h));if("kind"in d)return d;let c=t.createVertexArray();t.bindVertexArray(c);let p=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,p),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null);let E=[];return{kind:"stage",gl:t,cssWidth:n.clientWidth||o,cssHeight:n.clientHeight||a,hdr:!!e,get width(){return f.w},get height(){return f.h},get scene(){return s},get bloomA(){return m},get bloomB(){return d},setRegion(b,F){let x=Math.max(1,Math.round(b)),R=Math.max(1,Math.round(F));if(!(x===f.w&&R===f.h)){f={w:x,h:R};for(let A of[s,m,d])"kind"in A||(t.deleteFramebuffer(A.framebuffer),t.deleteTexture(A.texture));s=l(x,R),m=l(Math.max(1,x>>h),Math.max(1,R>>h)),d=l(Math.max(1,x>>h),Math.max(1,R>>h))}},compile(b,F){let x=(ue,C)=>{let U=t.createShader(ue);return t.shaderSource(U,C),t.compileShader(U),t.getShaderParameter(U,t.COMPILE_STATUS)?U:y("SHADER_COMPILE_FAILED",t.getShaderInfoLog(U)??"(no log)")},R=x(t.VERTEX_SHADER,b);if(typeof R=="object"&&"kind"in R)return R;let A=x(t.FRAGMENT_SHADER,F);if(typeof A=="object"&&"kind"in A)return A;let L=t.createProgram();return t.attachShader(L,R),t.attachShader(L,A),t.linkProgram(L),t.getProgramParameter(L,t.LINK_STATUS)?(E.push(L),L):y("PROGRAM_LINK_FAILED",t.getProgramInfoLog(L)??"(no log)")},bindTarget(b){t.bindFramebuffer(t.FRAMEBUFFER,b?b.framebuffer:null),t.viewport(0,0,b?b.width:f.w,b?b.height:f.h)},blit(b,F){t.useProgram(b),t.bindVertexArray(c),F?.(b),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null)},dispose(){for(let b of E)t.deleteProgram(b);for(let b of[s,m,d])"kind"in b||(t.deleteFramebuffer(b.framebuffer),t.deleteTexture(b.texture));t.deleteBuffer(p),t.deleteVertexArray(c)}}}var z=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function j(n,r){let t=new Float32Array(16);for(let e=0;e<4;e++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=n[i*4+o]*r[e*4+i];t[e*4+o]=a}return t}var G=(n,r)=>[n[0]-r[0],n[1]-r[1],n[2]-r[2]],X=(n,r)=>n[0]*r[0]+n[1]*r[1]+n[2]*r[2],I=(n,r)=>[n[1]*r[2]-n[2]*r[1],n[2]*r[0]-n[0]*r[2],n[0]*r[1]-n[1]*r[0]];function S(n){let r=Math.hypot(n[0],n[1],n[2]);return r===0?n:[n[0]/r,n[1]/r,n[2]/r]}function fe(n,r,t,e){let o=1/Math.tan(n/2);return new Float32Array([o/r,0,0,0,0,o,0,0,0,0,(e+t)/(t-e),-1,0,0,2*e*t/(t-e),0])}function me(n,r,t,e,o,a){let i=r-n,u=e-t,l=a-o;return new Float32Array([2/i,0,0,0,0,2/u,0,0,0,0,-2/l,0,-(r+n)/i,-(e+t)/u,-(a+o)/l,1])}function W(n,r,t){let e=S(G(n,r)),o=I(t,e);if(Math.hypot(o[0],o[1],o[2])<1e-8)return z();let a=S(o),i=I(e,a);return new Float32Array([a[0],i[0],e[0],0,a[1],i[1],e[1],0,a[2],i[2],e[2],0,-X(a,n),-X(i,n),-X(e,n),1])}function Xe(n,r){let t=[0,1,2,3].map(o=>n[0+o]*r[0]+n[4+o]*r[1]+n[8+o]*r[2]+n[12+o]),e=t[3];return{x:t[0]/e,y:t[1]/e,z:t[2]/e,w:e}}function de(n,r,t,e){let o=Xe(n,r);return{sx:(o.x*.5+.5)*t,sy:(1-(o.y*.5+.5))*e,behind:o.w<=0}}function ze(n){return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4)}var mt=/^#?([0-9a-fA-F]{6})$/;function N(n){let r=mt.exec(n.trim());if(!r)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(n)}`);let t=r[1];return[0,2,4].map(e=>ze(parseInt(t.slice(e,e+2),16)/255))}var he={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},dt=Object.freeze(Object.fromEntries(Object.keys(he).map(n=>[n,N(he[n])])));var je=.4;var pe=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${je.toFixed(2)}); }`,Ee=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function ht(n){let r=[1/0,1/0,1/0],t=[-1/0,-1/0,-1/0];for(let e=0;e<n.length;e+=3)for(let o=0;o<3;o++){let a=n[e+o];a<r[o]&&(r[o]=a),a>t[o]&&(t[o]=a)}return n.length===0?{min:[0,0,0],max:[0,0,0]}:{min:r,max:t}}function We(n,r,t,e){let o=new Float32Array(n.length);for(let i=0;i<e.length;i+=3){let u=e[i],l=e[i+1],h=e[i+2],f=u*3,s=l*3,m=h*3,d=u*2,c=l*2,p=h*2,E=n[s]-n[f],g=n[s+1]-n[f+1],b=n[s+2]-n[f+2],F=n[m]-n[f],x=n[m+1]-n[f+1],R=n[m+2]-n[f+2],A=t[c]-t[d],L=t[c+1]-t[d+1],ue=t[p]-t[d],C=t[p+1]-t[d+1],U=A*C-ue*L;if(Math.abs(U)<1e-12)continue;let se=1/U,lt=(E*C-F*L)*se,ct=(g*C-x*L)*se,ft=(b*C-R*L)*se;for(let O of[f,s,m])o[O]=o[O]+lt,o[O+1]=o[O+1]+ct,o[O+2]=o[O+2]+ft}let a=new Float32Array(n.length);for(let i=0;i<a.length;i+=3){let u=r[i],l=r[i+1],h=r[i+2],f=o[i],s=o[i+1],m=o[i+2],d=f*u+s*l+m*h;f-=u*d,s-=l*d,m-=h*d;let c=Math.hypot(f,s,m);c<1e-8&&(Math.abs(u)<.9?(f=0,s=-h,m=l):(f=-h,s=0,m=u),c=Math.hypot(f,s,m)||1),a[i]=f/c,a[i+1]=s/c,a[i+2]=m/c}return a}function Ye(n,r){let t=new Float32Array(n.length);for(let e=0;e<r.length;e+=3){let o=r[e]*3,a=r[e+1]*3,i=r[e+2]*3,u=n[a]-n[o],l=n[a+1]-n[o+1],h=n[a+2]-n[o+2],f=n[i]-n[o],s=n[i+1]-n[o+1],m=n[i+2]-n[o+2],d=l*m-h*s,c=h*f-u*m,p=u*s-l*f;for(let E of[o,a,i])t[E]=t[E]+d,t[E+1]=t[E+1]+c,t[E+2]=t[E+2]+p}for(let e=0;e<t.length;e+=3){let o=Math.hypot(t[e],t[e+1],t[e+2]);o>0&&(t[e]=t[e]/o,t[e+1]=t[e+1]/o,t[e+2]=t[e+2]/o)}return t}function be(n,r,t,e,o){let{min:a,max:i}=ht(n),u=e??Ye(n,t);return{positions:n,normals:u,uvs:r,indices:t,min:a,max:i,tangents:o??We(n,u,r,t)}}function Te(n=10,r=24){let t=Math.max(1,Math.floor(r)),e=(t+1)*(t+1),o=new Float32Array(e*3),a=new Float32Array(e*3),i=new Float32Array(e*2),u=new Uint16Array(t*t*6),l=0,h=0,f=0;for(let s=0;s<=t;s++)for(let m=0;m<=t;m++){let d=(m/t-.5)*n,c=(s/t-.5)*n;o[l]=d,o[l+1]=0,o[l+2]=c,a[l]=0,a[l+1]=1,a[l+2]=0,l+=3,i[h++]=m/t,i[h++]=s/t}for(let s=0;s<t;s++)for(let m=0;m<t;m++){let d=s*(t+1)+m,c=d+1,p=d+(t+1),E=p+1;u[f++]=d,u[f++]=p,u[f++]=c,u[f++]=c,u[f++]=p,u[f++]=E}return be(o,i,u,a)}function Y(n=.5,r=.2,t=64){let e=Math.max(3,t),o=r/2,a=[],i=[],u=[],l=[],h=[];for(let f=0;f<=e;f++){let s=f/e*Math.PI*2,m=Math.cos(s),d=Math.sin(s);a.push(m*n,o,d*n),i.push(m,0,d),u.push(f/e,1),h.push(-d,0,m),a.push(m*n,-o,d*n),i.push(m,0,d),u.push(f/e,0),h.push(-d,0,m)}for(let f=0;f<e;f++){let s=f*2,m=s+1,d=s+2,c=s+3;l.push(s,d,m,m,d,c)}for(let[f,s]of[[1,o],[-1,-o]]){let m=a.length/3;a.push(0,s,0),i.push(0,f,0),u.push(.5,.5),h.push(1,0,0);for(let d=0;d<=e;d++){let c=d/e*Math.PI*2,p=Math.cos(c),E=Math.sin(c);a.push(p*n,s,E*n),i.push(0,f,0),u.push(.5+p*.5,.5+E*.5),h.push(-E,0,p)}for(let d=0;d<e;d++){let c=m+1+d,p=m+2+d;f>0?l.push(m,p,c):l.push(m,c,p)}}return be(new Float32Array(a),new Float32Array(u),new Uint16Array(l),new Float32Array(i),new Float32Array(h))}function xe(n=.5,r=.08,t=64,e=24){let o=Math.max(3,t),a=Math.max(3,e),i=[],u=[],l=[],h=[],f=[];for(let s=0;s<=o;s++){let m=s/o*Math.PI*2,d=Math.cos(m),c=Math.sin(m);for(let p=0;p<=a;p++){let E=p/a*Math.PI*2,g=Math.cos(E),b=Math.sin(E);i.push((n+r*g)*d,r*b,(n+r*g)*c),u.push(d*g,b,c*g),l.push(s/o,p/a),f.push(-c,0,d)}}for(let s=0;s<o;s++)for(let m=0;m<a;m++){let d=s*(a+1)+m,c=d+1,p=d+(a+1),E=p+1;h.push(d,c,p,c,E,p)}return be(new Float32Array(i),new Float32Array(l),new Uint16Array(h),new Float32Array(u),new Float32Array(f))}function ye(n){return n.indices.length/3}var ge=89,Re=Math.PI/180;function $(n){let r=Math.max(-ge,Math.min(ge,n.elevationDeg))*Re,t=n.azimuthDeg*Re,e=Math.max(1e-4,n.distance),o=Math.sin(r)*e,a=Math.cos(r)*e;return[n.target[0]+Math.sin(t)*a,n.target[1]+o,n.target[2]+Math.cos(t)*a]}function K(n,r){let t=$(n),e=n.near??Math.max(.01,n.distance/100),o=n.far??Math.max(e+1,n.distance*8),a=fe((n.fovDeg??38)*Re,Math.max(.001,r),e,o),i=W(t,n.target,[0,1,0]);return j(a,i)}function Fe(n,r,t){let e=S(n.direction),o=n.extent??Math.max(.1,t*1.35),a=Math.max(1,t*2),i=[r[0]-e[0]*a,r[1]-e[1]*a,r[2]-e[2]*a],u=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],l=W(i,r,u),h=me(-o,o,-o,o,.01,a+t*2+o);return j(h,l)}function Ae(n,r){let t=G([r[0],r[1],r[2]],[n[0],n[1],n[2]]);return Math.hypot(t[0],t[1],t[2])/2}function ve(n,r){return[(n[0]+r[0])/2,(n[1]+r[1])/2,(n[2]+r[2])/2]}function Me(n,r,t){let{gl:e}=n,o=Math.max(1,Math.floor(r)),a=Math.max(1,Math.floor(t)),i=e.createFramebuffer(),u=e.createTexture(),l=e.createTexture();if(!i||!u||!l)return y("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let h=n.hdr?e.RGBA16F:e.RGBA8,f=n.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,s=()=>{e.bindTexture(e.TEXTURE_2D,u),e.texImage2D(e.TEXTURE_2D,0,h,o,a,0,e.RGBA,f,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,l),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,o,a,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,u,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,l,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};s(),e.bindFramebuffer(e.FRAMEBUFFER,i);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE?y("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${m.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:u,depthTexture:l,get width(){return o},get height(){return a},bind(){e.bindFramebuffer(e.FRAMEBUFFER,i),e.viewport(0,0,o,a)},resize(d,c){let p=Math.max(1,Math.floor(d)),E=Math.max(1,Math.floor(c));p===o&&E===a||(o=p,a=E,s())},dispose(){e.deleteFramebuffer(i),e.deleteTexture(u),e.deleteTexture(l)}}}function Le(n,r=1024){let{gl:t}=n,e=Math.max(256,Math.min(2048,Math.floor(r))),o=t.createFramebuffer(),a=t.createTexture();if(!o||!a)return y("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");t.bindTexture(t.TEXTURE_2D,a),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,e,e,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,o),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,a,0);let i=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),i!==t.FRAMEBUFFER_COMPLETE?y("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:e,bind(){t.bindFramebuffer(t.FRAMEBUFFER,o),t.viewport(0,0,e,e)},dispose(){t.deleteFramebuffer(o),t.deleteTexture(a)}}}var q=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,Q={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function Z(n,r,t={}){let e=t.zenith??Q.zenith,o=t.horizon??Q.horizon,a=t.ground??Q.ground;n.uniform3f(n.getUniformLocation(r,"uSkyZenith"),e[0],e[1],e[2]),n.uniform3f(n.getUniformLocation(r,"uSkyHorizon"),o[0],o[1],o[2]),n.uniform3f(n.getUniformLocation(r,"uSkyGround"),a[0],a[1],a[2])}var pt=`#version 300 es
precision highp float;
out vec2 vNdc;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`,Et=`#version 300 es
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
}`;function _e(n){let{gl:r}=n,t=n.compile(pt,Et);return"kind"in t?t:{draw(e){let o=S(G(e.target,e.eye)),a=Math.abs(o[1])>.999?[0,0,1]:[0,1,0],i=S(I(o,a)),u=S(I(i,o));r.disable(r.DEPTH_TEST),r.depthMask(!1),r.disable(r.BLEND),r.useProgram(t),r.uniform3f(r.getUniformLocation(t,"uRight"),i[0],i[1],i[2]),r.uniform3f(r.getUniformLocation(t,"uUp"),u[0],u[1],u[2]),r.uniform3f(r.getUniformLocation(t,"uForward"),o[0],o[1],o[2]),r.uniform1f(r.getUniformLocation(t,"uTanHalfFov"),Math.tan(e.fovDeg*Math.PI/360)),r.uniform1f(r.getUniformLocation(t,"uAspect"),Math.max(.001,e.aspect)),Z(r,t,e.sky),n.blit(t),r.depthMask(!0),r.enable(r.DEPTH_TEST)},dispose(){r.deleteProgram(t)}}}var $e=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,Se=`#version 300 es
precision highp float;
void main(){}`,bt=`#version 300 es
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
  vNormal = normalize(uNormalMat * aNormal);
  vTangent = normalize(mat3(uModel) * aTangent);
  gl_Position = uViewProj * world;
}`,Qe=`#version 300 es
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
${q}

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
}`;function De(n,r){let{gl:t}=n,e=t.createVertexArray(),o=t.createBuffer(),a=t.createBuffer(),i=t.createBuffer(),u=t.createBuffer();return!e||!o||!a||!i||!u?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(t.bindVertexArray(e),t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,r.positions,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,a),t.bufferData(t.ARRAY_BUFFER,r.normals,t.STATIC_DRAW),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,i),t.bufferData(t.ARRAY_BUFFER,r.tangents,t.STATIC_DRAW),t.enableVertexAttribArray(2),t.vertexAttribPointer(2,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,u),t.bufferData(t.ELEMENT_ARRAY_BUFFER,r.indices,t.STATIC_DRAW),t.bindVertexArray(null),{vao:e,indexCount:r.indices.length,indexType:r.indices instanceof Uint32Array?t.UNSIGNED_INT:t.UNSIGNED_SHORT,dispose(){t.deleteVertexArray(e),t.deleteBuffer(o),t.deleteBuffer(a),t.deleteBuffer(i),t.deleteBuffer(u)}})}function Ue(n){let{gl:r}=n,t=n.compile($e,Se);if("kind"in t)return t;let e=n.compile(Ke,Qe);if("kind"in e)return e;let o=n.compile(bt,Se);if("kind"in o)return o;let a=(i,u)=>r.getUniformLocation(i,u);return{shadowPass(i,u,l,h){let f=h??(()=>{});l.bind(),f("shadow.bind"),r.clear(r.DEPTH_BUFFER_BIT),r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.FRONT),r.useProgram(t),f("useProgram(shadow)"),r.uniformMatrix4fv(a(t,"uLightVP"),!1,i),f("uLightVP");for(let s of u)r.uniformMatrix4fv(a(t,"uModel"),!1,s.model),f("shadow uModel"),r.bindVertexArray(s.mesh.vao),f("shadow bindVAO"),r.drawElements(r.TRIANGLES,s.mesh.indexCount,s.mesh.indexType,0),f("shadow drawElements");r.bindVertexArray(null),r.cullFace(r.BACK)},depthPrepass(i,u){r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.colorMask(!1,!1,!1,!1),r.useProgram(o),r.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let l of u)r.uniformMatrix4fv(a(o,"uModel"),!1,l.model),r.bindVertexArray(l.mesh.vao),r.drawElements(r.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0);r.bindVertexArray(null),r.colorMask(!0,!0,!0,!0)},draw(i){let u=i.onStep??(()=>{});if(r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.useProgram(e),r.uniformMatrix4fv(a(e,"uViewProj"),!1,i.viewProj),u("uViewProj"),r.uniform3fv(a(e,"uEye"),i.eye),u("uEye"),r.uniform3fv(a(e,"uLightDir"),i.lightDir),u("uLightDir"),r.uniform3fv(a(e,"uLightColour"),i.lightColour),u("uLightColour"),r.uniform1f(a(e,"uAmbientGain"),i.ambientGain??1),u("uAmbientGain"),i.fog&&i.fog.density>0){r.uniform1f(a(e,"uFogDensity"),i.fog.density),r.uniform1f(a(e,"uFogHeight"),i.fog.height),r.uniform1f(a(e,"uFogFloor"),i.fog.floor??0);let l=i.fog.colour;l==="sky"?r.uniform3f(a(e,"uFogColour"),-1,-1,-1):r.uniform3f(a(e,"uFogColour"),l[0],l[1],l[2]),u("fog")}else r.uniform1f(a(e,"uFogDensity"),0);Z(r,e,i.sky),u("bindSky"),i.ao&&i.screenSize?(r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,i.ao),r.uniform1i(a(e,"uAO"),1),r.uniform2f(a(e,"uScreenSize"),i.screenSize[0],i.screenSize[1]),r.uniform1f(a(e,"uAOEnabled"),1)):r.uniform1f(a(e,"uAOEnabled"),0),u("bindAO"),r.uniformMatrix4fv(a(e,"uLightVP"),!1,i.lightVP),u("lit uLightVP"),i.shadow?(r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,i.shadow.depthTexture),r.uniform1i(a(e,"uShadowMap"),0),r.uniform1f(a(e,"uShadowTexel"),1/i.shadow.size),r.uniform1f(a(e,"uShadowStrength"),i.shadowStrength??1)):r.uniform1f(a(e,"uShadowStrength"),0);for(let l of i.draws)r.uniformMatrix4fv(a(e,"uModel"),!1,l.model),r.uniformMatrix3fv(a(e,"uNormalMat"),!1,l.normalMat),u("uNormalMat"),r.uniform3fv(a(e,"uBaseColour"),l.material.baseColour),u("uBaseColour"),r.uniform1f(a(e,"uRoughness"),l.material.roughness),r.uniform1f(a(e,"uMetalness"),l.material.metalness),r.uniform1f(a(e,"uAnisotropy"),l.material.anisotropy??0),r.bindVertexArray(l.mesh.vao),u("lit bindVAO"),r.drawElements(r.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0),u("lit drawElements");r.bindVertexArray(null),r.disable(r.CULL_FACE)},dispose(){r.deleteProgram(t),r.deleteProgram(e),r.deleteProgram(o)}}}var k=`
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
}`,qe=`#version 300 es
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
${k}

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
}`,xt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${k}

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
}`;function we(n,r,t){let{gl:e}=n,o=n.compile(qe,Tt);if("kind"in o)return o;let a=n.compile(qe,xt);if("kind"in a)return a;let i=Math.max(1,r>>1),u=Math.max(1,t>>1),l=()=>{let c=e.createFramebuffer(),p=e.createTexture();return!c||!p?null:{fb:c,tex:p}},h=l(),f=l();if(!h||!f)return y("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let s=()=>{for(let c of[h,f])e.bindTexture(e.TEXTURE_2D,c.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,i,u,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,c.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,c.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};s(),e.bindFramebuffer(e.FRAMEBUFFER,h.fb);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE)return y("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${m.toString(16)}).`);let d=(c,p,E,g,b,F,x)=>{e.activeTexture(e.TEXTURE0+x),e.bindTexture(e.TEXTURE_2D,p),e.uniform1i(e.getUniformLocation(c,"uDepth"),x),e.uniform2f(e.getUniformLocation(c,"uNearFar"),E,g),e.uniform1f(e.getUniformLocation(c,"uTanHalfFov"),Math.tan(b*Math.PI/360)),e.uniform1f(e.getUniformLocation(c,"uAspect"),F)};return{get texture(){return h.tex},get width(){return i},get height(){return u},compute(c){e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,h.fb),e.viewport(0,0,i,u),e.useProgram(o),d(o,c.depthTexture,c.near,c.far,c.fovDeg,c.aspect,0),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/i,1/u),e.uniform1f(e.getUniformLocation(o,"uRadius"),c.radius??.55),e.uniform1f(e.getUniformLocation(o,"uStrength"),c.strength??1.15),e.uniform1f(e.getUniformLocation(o,"uBias"),c.bias??.035),n.blit(o);for(let[p,E,g]of[[h,f,[1,0]],[f,h,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,E.fb),e.viewport(0,0,i,u),e.useProgram(a),d(a,c.depthTexture,c.near,c.far,c.fovDeg,c.aspect,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,p.tex),e.uniform1i(e.getUniformLocation(a,"uAO"),1),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/i,1/u),e.uniform2f(e.getUniformLocation(a,"uDir"),g[0],g[1]),n.blit(a);e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(c,p){let E=Math.max(1,c>>1),g=Math.max(1,p>>1);E===i&&g===u||(i=E,u=g,s())},dispose(){e.deleteProgram(o),e.deleteProgram(a);for(let c of[h,f])e.deleteFramebuffer(c.fb),e.deleteTexture(c.tex)}}}var yt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,gt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uFocusDistance;
uniform float uAperture;
uniform float uMaxCoc;
out vec4 frag;
${k}

float cocAt(vec2 uv) {
  float z = linearDepthAt(uv);
  float c = abs(1.0 / max(0.05, uFocusDistance) - 1.0 / max(0.05, z)) * uAperture;
  return clamp(c, 0.0, uMaxCoc);
}

void main(){
  float centreCoc = cocAt(vUv);
  vec3 sharp = texture(uScene, vUv).rgb;

  if (centreCoc < 0.0015) { frag = vec4(sharp, 1.0); return; }

  vec3 sum = sharp * 0.001;
  float wsum = 0.001;

  const int TAPS = 24;
  for (int i = 0; i < TAPS; i++) {
    float t = (float(i) + 0.5) / float(TAPS);
    float r = sqrt(t) * centreCoc;
    float a = float(i) * 2.39996323;
    vec2 off = vec2(cos(a), sin(a)) * r;
    vec2 suv = vUv + off;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;

    float sc = cocAt(suv);
    float reach = step(r, sc + uTexel.x);
    float w = reach * (0.35 + sc / max(1e-4, uMaxCoc));
    sum += texture(uScene, suv).rgb * w;
    wsum += w;
  }

  vec3 blurred = sum / wsum;
  float mixAmt = smoothstep(0.0015, uMaxCoc * 0.45, centreCoc);
  frag = vec4(mix(sharp, blurred, mixAmt), 1.0);
}`;function Pe(n,r,t){let{gl:e}=n,o=n.compile(yt,gt);if("kind"in o)return o;let a=Math.max(1,Math.floor(r)),i=Math.max(1,Math.floor(t)),u=e.createFramebuffer(),l=e.createTexture();if(!u||!l)return y("FRAMEBUFFER_INCOMPLETE","The GPU refused a depth-of-field buffer.");let h=()=>{e.bindTexture(e.TEXTURE_2D,l);let s=n.hdr?e.RGBA16F:e.RGBA8,m=n.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE;e.texImage2D(e.TEXTURE_2D,0,s,a,i,0,e.RGBA,m,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,u),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,l,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};h(),e.bindFramebuffer(e.FRAMEBUFFER,u);let f=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),f!==e.FRAMEBUFFER_COMPLETE?y("FRAMEBUFFER_INCOMPLETE",`The DOF buffer is incomplete (0x${f.toString(16)}).`):{texture:l,apply(s){e.bindFramebuffer(e.FRAMEBUFFER,u),e.viewport(0,0,a,i),e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.useProgram(o),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,s.scene),e.uniform1i(e.getUniformLocation(o,"uScene"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,s.depthTexture),e.uniform1i(e.getUniformLocation(o,"uDepth"),1),e.uniform2f(e.getUniformLocation(o,"uNearFar"),s.near,s.far),e.uniform1f(e.getUniformLocation(o,"uTanHalfFov"),Math.tan(s.fovDeg*Math.PI/360)),e.uniform1f(e.getUniformLocation(o,"uAspect"),s.aspect),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/a,1/i),e.uniform1f(e.getUniformLocation(o,"uFocusDistance"),s.focusDistance),e.uniform1f(e.getUniformLocation(o,"uAperture"),s.aperture??12),e.uniform1f(e.getUniformLocation(o,"uMaxCoc"),s.maxCoc??.012),n.blit(o),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(s,m){let d=Math.max(1,Math.floor(s)),c=Math.max(1,Math.floor(m));d===a&&c===i||(a=d,i=c,h())},dispose(){e.deleteProgram(o),e.deleteFramebuffer(u),e.deleteTexture(l)}}}var Ce=new URLSearchParams(location.search).get("aniso")!=="0",H=Math.max(1,Math.min(3,Number(new URLSearchParams(location.search).get("scale")??1))),v=1200*H,M=720*H,Ve=document.getElementById("c");Ve.width=v;Ve.height=M;var Oe=ce(Ve,{alpha:!1});if(!le(Oe))throw document.title="REFUSED",new Error(Oe.reason);var _=Oe,T=_.gl,Rt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Ft=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${pe}
${Ee}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,et=document.getElementById("log"),w=n=>`${n.reason} ${n.detail??""}`,P=n=>{throw document.title="REFUSED",et.textContent=n,new Error(n)},Ie=_.compile(Rt,Ft),V=Ue(_),B=Me(_,v,M),re=Le(_,1024),Ge=_e(_),ne=we(_,v,M),oe=Pe(_,v,M);"kind"in Ie&&P(`present: ${w(Ie)}`);"kind"in V&&P(`lit: ${w(V)}`);"kind"in B&&P(`target: ${w(B)}`);"kind"in re&&P(`shadow: ${w(re)}`);"kind"in Ge&&P(`sky: ${w(Ge)}`);"kind"in ne&&P(`ao: ${w(ne)}`);"kind"in oe&&P(`dof: ${w(oe)}`);var tt=Y(.92,.16,96),rt=xe(1.06,.055,128,32),nt=Y(1.9,.09,96),ot=Te(16,24),J=[tt,rt,nt,ot].map(n=>{let r=De(_,n);return"kind"in r&&P(`mesh: ${w(r)}`),r}),ee=(n,r,t)=>{let e=z();return e[12]=n,e[13]=r,e[14]=t,e},te=new Float32Array([1,0,0,0,1,0,0,0,1]),ae=.3,Ne=[{mesh:J[3],model:ee(0,0,0),normalMat:te,material:{baseColour:N("#080C15"),roughness:.88,metalness:0}},{mesh:J[2],model:ee(0,.045,0),normalMat:te,material:{baseColour:N("#161D2E"),roughness:.52,metalness:.35}},{mesh:J[0],model:ee(0,ae,0),normalMat:te,material:{baseColour:N("#8FA3C4"),roughness:.3,metalness:.95,anisotropy:Ce?.86:0}},{mesh:J[1],model:ee(0,ae,0),normalMat:te,material:{baseColour:N("#2C6BFF"),roughness:.13,metalness:.92,anisotropy:Ce?.72:0}}],D={target:[0,.34,0],distance:5,azimuthDeg:22,elevationDeg:24,fovDeg:30},at=[-2,0,-2],it=[2,.55,2],At=ve(at,it),Ze=Ae(at,it),vt=[tt,rt,nt,ot].reduce((n,r)=>n+ye(r),0),ke=Math.max(.01,D.distance/100),Je=Math.max(ke+1,D.distance*8);function ie(n){let r=-.9+Math.sin(n*.9)*.75,t=[Math.sin(r)*.85,-.95,Math.cos(r)*.55],e=Fe({direction:t,colour:[1,1,1],extent:Ze*.9},At,Ze),o=K(D,v/M),a=$(D);V.shadowPass(e,Ne,re),B.bind(),T.clear(T.DEPTH_BUFFER_BIT),Ge.draw({eye:a,target:D.target,fovDeg:D.fovDeg??34,aspect:v/M}),V.depthPrepass(o,Ne),ne.compute({depthTexture:B.depthTexture,near:ke,far:Je,fovDeg:D.fovDeg??34,aspect:v/M,radius:.42,strength:1.3}),B.bind(),V.draw({viewProj:o,eye:a,lightDir:t,lightColour:[5.2,5,4.6],ambientGain:1.15,lightVP:e,shadow:re,shadowStrength:.9,draws:Ne,ao:ne.texture,screenSize:[v,M]});let i=Math.hypot(a[0],a[1]-ae,a[2]);oe.apply({scene:B.texture,depthTexture:B.depthTexture,near:ke,far:Je,fovDeg:D.fovDeg??34,aspect:v/M,focusDistance:i,aperture:7,maxCoc:.009}),T.bindFramebuffer(T.FRAMEBUFFER,null),T.viewport(0,0,v,M),T.disable(T.DEPTH_TEST),T.activeTexture(T.TEXTURE0),T.bindTexture(T.TEXTURE_2D,oe.texture),_.blit(Ie,u=>T.uniform1i(T.getUniformLocation(u,"uScene"),0))}function Mt(){let n=document.getElementById("mark");if(!n)return;let r=K(D,v/M),t=de(r,[0,ae+.08,0],v/H,M/H);if(t.behind){n.style.visibility="hidden";return}n.style.visibility="visible",n.style.left=`${t.sx}px`,n.style.top=`${t.sy}px`}Mt();ie(1.6);function Lt(n){ie(1.6);let r=new Uint8Array(4);T.readPixels(0,0,1,1,T.RGBA,T.UNSIGNED_BYTE,r);let t=performance.now();for(let e=0;e<n;e++)ie(1.6);return T.readPixels(0,0,1,1,T.RGBA,T.UNSIGNED_BYTE,r),(performance.now()-t)/n}var ut=Number(new URLSearchParams(location.search).get("frames")??300),Be=Lt(Math.max(1,ut)),st={anisotropy:Ce,triangles:vt,resolution:`${v}x${M}`,dprScale:H,frames:ut,msPerFrame:Number(Be.toFixed(3)),fps:Math.round(1e3/Be),headroom:Number((16.6-Be).toFixed(3)),renderer:(()=>{let n=T.getExtension("WEBGL_debug_renderer_info");return n?String(T.getParameter(n.UNMASKED_RENDERER_WEBGL)):"unknown"})()};globalThis.E8=st;et.textContent=JSON.stringify(st,null,2);ie(1.6);document.title="READY";

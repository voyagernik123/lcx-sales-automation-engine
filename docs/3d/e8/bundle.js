var He={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable."};function x(n,r){return r===void 0?{kind:"refused",code:n,reason:He[n]}:{kind:"refused",code:n,reason:He[n],detail:r}}function le(n){return n.kind==="stage"}function ce(n,r={}){let t=n.getContext("webgl2",{antialias:r.antialias??!1,alpha:r.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!t)return x("NO_WEBGL2");let e=t.getExtension("EXT_color_buffer_float"),o=n.width,a=n.height,i=e?t.RGBA16F:t.RGBA8,s=e?t.HALF_FLOAT:t.UNSIGNED_BYTE,c=(b,A)=>{let g=t.createTexture();t.bindTexture(t.TEXTURE_2D,g),t.texImage2D(t.TEXTURE_2D,0,i,b,A,0,t.RGBA,s,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);let R=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,R),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,g,0);let v=t.checkFramebufferStatus(t.FRAMEBUFFER);return v!==t.FRAMEBUFFER_COMPLETE?x("FRAMEBUFFER_INCOMPLETE",`status 0x${v.toString(16)} at ${b}\xD7${A}`):{texture:g,framebuffer:R,width:b,height:A}},h=r.bloomShift??2,f={w:o,h:a},u=c(o,a);if("kind"in u)return u;let d=c(Math.max(1,o>>h),Math.max(1,a>>h));if("kind"in d)return d;let m=c(Math.max(1,o>>h),Math.max(1,a>>h));if("kind"in m)return m;let l=t.createVertexArray();t.bindVertexArray(l);let p=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,p),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null);let E=[];return{kind:"stage",gl:t,cssWidth:n.clientWidth||o,cssHeight:n.clientHeight||a,hdr:!!e,get width(){return f.w},get height(){return f.h},get scene(){return u},get bloomA(){return d},get bloomB(){return m},setRegion(b,A){let g=Math.max(1,Math.round(b)),R=Math.max(1,Math.round(A));if(!(g===f.w&&R===f.h)){f={w:g,h:R};for(let v of[u,d,m])"kind"in v||(t.deleteFramebuffer(v.framebuffer),t.deleteTexture(v.texture));u=c(g,R),d=c(Math.max(1,g>>h),Math.max(1,R>>h)),m=c(Math.max(1,g>>h),Math.max(1,R>>h))}},compile(b,A){let g=(se,O)=>{let D=t.createShader(se);return t.shaderSource(D,O),t.compileShader(D),t.getShaderParameter(D,t.COMPILE_STATUS)?D:x("SHADER_COMPILE_FAILED",t.getShaderInfoLog(D)??"(no log)")},R=g(t.VERTEX_SHADER,b);if(typeof R=="object"&&"kind"in R)return R;let v=g(t.FRAGMENT_SHADER,A);if(typeof v=="object"&&"kind"in v)return v;let L=t.createProgram();return t.attachShader(L,R),t.attachShader(L,v),t.linkProgram(L),t.getProgramParameter(L,t.LINK_STATUS)?(E.push(L),L):x("PROGRAM_LINK_FAILED",t.getProgramInfoLog(L)??"(no log)")},bindTarget(b){t.bindFramebuffer(t.FRAMEBUFFER,b?b.framebuffer:null),t.viewport(0,0,b?b.width:f.w,b?b.height:f.h)},blit(b,A){t.useProgram(b),t.bindVertexArray(l),A?.(b),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null)},dispose(){for(let b of E)t.deleteProgram(b);for(let b of[u,d,m])"kind"in b||(t.deleteFramebuffer(b.framebuffer),t.deleteTexture(b.texture));t.deleteBuffer(p),t.deleteVertexArray(l)}}}var z=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function W(n,r){let t=new Float32Array(16);for(let e=0;e<4;e++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=n[i*4+o]*r[e*4+i];t[e*4+o]=a}return t}var G=(n,r)=>[n[0]-r[0],n[1]-r[1],n[2]-r[2]],X=(n,r)=>n[0]*r[0]+n[1]*r[1]+n[2]*r[2],I=(n,r)=>[n[1]*r[2]-n[2]*r[1],n[2]*r[0]-n[0]*r[2],n[0]*r[1]-n[1]*r[0]];function w(n){let r=Math.hypot(n[0],n[1],n[2]);return r===0?n:[n[0]/r,n[1]/r,n[2]/r]}function fe(n,r,t,e){let o=1/Math.tan(n/2);return new Float32Array([o/r,0,0,0,0,o,0,0,0,0,(e+t)/(t-e),-1,0,0,2*e*t/(t-e),0])}function de(n,r,t,e,o,a){let i=r-n,s=e-t,c=a-o;return new Float32Array([2/i,0,0,0,0,2/s,0,0,0,0,-2/c,0,-(r+n)/i,-(e+t)/s,-(a+o)/c,1])}function j(n,r,t){let e=w(G(n,r)),o=I(t,e);if(Math.hypot(o[0],o[1],o[2])<1e-8)return z();let a=w(o),i=I(e,a);return new Float32Array([a[0],i[0],e[0],0,a[1],i[1],e[1],0,a[2],i[2],e[2],0,-X(a,n),-X(i,n),-X(e,n),1])}function Xe(n,r){let t=[0,1,2,3].map(o=>n[0+o]*r[0]+n[4+o]*r[1]+n[8+o]*r[2]+n[12+o]),e=t[3];return{x:t[0]/e,y:t[1]/e,z:t[2]/e,w:e}}function me(n,r,t,e){let o=Xe(n,r);return{sx:(o.x*.5+.5)*t,sy:(1-(o.y*.5+.5))*e,behind:o.w<=0}}function ze(n){return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4)}var ft=/^#?([0-9a-fA-F]{6})$/;function N(n){let r=ft.exec(n.trim());if(!r)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(n)}`);let t=r[1];return[0,2,4].map(e=>ze(parseInt(t.slice(e,e+2),16)/255))}var he={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},dt=Object.freeze(Object.fromEntries(Object.keys(he).map(n=>[n,N(he[n])])));var We=.4;var pe=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${We.toFixed(2)}); }`,Ee=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function mt(n){let r=[1/0,1/0,1/0],t=[-1/0,-1/0,-1/0];for(let e=0;e<n.length;e+=3)for(let o=0;o<3;o++){let a=n[e+o];a<r[o]&&(r[o]=a),a>t[o]&&(t[o]=a)}return n.length===0?{min:[0,0,0],max:[0,0,0]}:{min:r,max:t}}function ht(n,r,t,e){let o=new Float32Array(n.length);for(let i=0;i<e.length;i+=3){let s=e[i],c=e[i+1],h=e[i+2],f=s*3,u=c*3,d=h*3,m=s*2,l=c*2,p=h*2,E=n[u]-n[f],y=n[u+1]-n[f+1],b=n[u+2]-n[f+2],A=n[d]-n[f],g=n[d+1]-n[f+1],R=n[d+2]-n[f+2],v=t[l]-t[m],L=t[l+1]-t[m+1],se=t[p]-t[m],O=t[p+1]-t[m+1],D=v*O-se*L;if(Math.abs(D)<1e-12)continue;let ue=1/D,ut=(E*O-A*L)*ue,lt=(y*O-g*L)*ue,ct=(b*O-R*L)*ue;for(let C of[f,u,d])o[C]=o[C]+ut,o[C+1]=o[C+1]+lt,o[C+2]=o[C+2]+ct}let a=new Float32Array(n.length);for(let i=0;i<a.length;i+=3){let s=r[i],c=r[i+1],h=r[i+2],f=o[i],u=o[i+1],d=o[i+2],m=f*s+u*c+d*h;f-=s*m,u-=c*m,d-=h*m;let l=Math.hypot(f,u,d);l<1e-8&&(Math.abs(s)<.9?(f=0,u=-h,d=c):(f=-h,u=0,d=s),l=Math.hypot(f,u,d)||1),a[i]=f/l,a[i+1]=u/l,a[i+2]=d/l}return a}function je(n,r){let t=new Float32Array(n.length);for(let e=0;e<r.length;e+=3){let o=r[e]*3,a=r[e+1]*3,i=r[e+2]*3,s=n[a]-n[o],c=n[a+1]-n[o+1],h=n[a+2]-n[o+2],f=n[i]-n[o],u=n[i+1]-n[o+1],d=n[i+2]-n[o+2],m=c*d-h*u,l=h*f-s*d,p=s*u-c*f;for(let E of[o,a,i])t[E]=t[E]+m,t[E+1]=t[E+1]+l,t[E+2]=t[E+2]+p}for(let e=0;e<t.length;e+=3){let o=Math.hypot(t[e],t[e+1],t[e+2]);o>0&&(t[e]=t[e]/o,t[e+1]=t[e+1]/o,t[e+2]=t[e+2]/o)}return t}function be(n,r,t,e,o){let{min:a,max:i}=mt(n),s=e??je(n,t);return{positions:n,normals:s,uvs:r,indices:t,min:a,max:i,tangents:o??ht(n,s,r,t)}}function Te(n=10,r=24){let t=Math.max(1,Math.floor(r)),e=(t+1)*(t+1),o=new Float32Array(e*3),a=new Float32Array(e*3),i=new Float32Array(e*2),s=new Uint16Array(t*t*6),c=0,h=0,f=0;for(let u=0;u<=t;u++)for(let d=0;d<=t;d++){let m=(d/t-.5)*n,l=(u/t-.5)*n;o[c]=m,o[c+1]=0,o[c+2]=l,a[c]=0,a[c+1]=1,a[c+2]=0,c+=3,i[h++]=d/t,i[h++]=u/t}for(let u=0;u<t;u++)for(let d=0;d<t;d++){let m=u*(t+1)+d,l=m+1,p=m+(t+1),E=p+1;s[f++]=m,s[f++]=p,s[f++]=l,s[f++]=l,s[f++]=p,s[f++]=E}return be(o,i,s,a)}function Y(n=.5,r=.2,t=64){let e=Math.max(3,t),o=r/2,a=[],i=[],s=[],c=[],h=[];for(let f=0;f<=e;f++){let u=f/e*Math.PI*2,d=Math.cos(u),m=Math.sin(u);a.push(d*n,o,m*n),i.push(d,0,m),s.push(f/e,1),h.push(-m,0,d),a.push(d*n,-o,m*n),i.push(d,0,m),s.push(f/e,0),h.push(-m,0,d)}for(let f=0;f<e;f++){let u=f*2,d=u+1,m=u+2,l=u+3;c.push(u,m,d,d,m,l)}for(let[f,u]of[[1,o],[-1,-o]]){let d=a.length/3;a.push(0,u,0),i.push(0,f,0),s.push(.5,.5),h.push(1,0,0);for(let m=0;m<=e;m++){let l=m/e*Math.PI*2,p=Math.cos(l),E=Math.sin(l);a.push(p*n,u,E*n),i.push(0,f,0),s.push(.5+p*.5,.5+E*.5),h.push(-E,0,p)}for(let m=0;m<e;m++){let l=d+1+m,p=d+2+m;f>0?c.push(d,p,l):c.push(d,l,p)}}return be(new Float32Array(a),new Float32Array(s),new Uint16Array(c),new Float32Array(i),new Float32Array(h))}function ge(n=.5,r=.08,t=64,e=24){let o=Math.max(3,t),a=Math.max(3,e),i=[],s=[],c=[],h=[],f=[];for(let u=0;u<=o;u++){let d=u/o*Math.PI*2,m=Math.cos(d),l=Math.sin(d);for(let p=0;p<=a;p++){let E=p/a*Math.PI*2,y=Math.cos(E),b=Math.sin(E);i.push((n+r*y)*m,r*b,(n+r*y)*l),s.push(m*y,b,l*y),c.push(u/o,p/a),f.push(-l,0,m)}}for(let u=0;u<o;u++)for(let d=0;d<a;d++){let m=u*(a+1)+d,l=m+1,p=m+(a+1),E=p+1;h.push(m,l,p,l,E,p)}return be(new Float32Array(i),new Float32Array(c),new Uint16Array(h),new Float32Array(s),new Float32Array(f))}function xe(n){return n.indices.length/3}var ye=89,Re=Math.PI/180;function $(n){let r=Math.max(-ye,Math.min(ye,n.elevationDeg))*Re,t=n.azimuthDeg*Re,e=Math.max(1e-4,n.distance),o=Math.sin(r)*e,a=Math.cos(r)*e;return[n.target[0]+Math.sin(t)*a,n.target[1]+o,n.target[2]+Math.cos(t)*a]}function K(n,r){let t=$(n),e=n.near??Math.max(.01,n.distance/100),o=n.far??Math.max(e+1,n.distance*8),a=fe((n.fovDeg??38)*Re,Math.max(.001,r),e,o),i=j(t,n.target,[0,1,0]);return W(a,i)}function Ae(n,r,t){let e=w(n.direction),o=n.extent??Math.max(.1,t*1.35),a=Math.max(1,t*2),i=[r[0]-e[0]*a,r[1]-e[1]*a,r[2]-e[2]*a],s=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],c=j(i,r,s),h=de(-o,o,-o,o,.01,a+t*2+o);return W(h,c)}function ve(n,r){let t=G([r[0],r[1],r[2]],[n[0],n[1],n[2]]);return Math.hypot(t[0],t[1],t[2])/2}function Fe(n,r){return[(n[0]+r[0])/2,(n[1]+r[1])/2,(n[2]+r[2])/2]}function Me(n,r,t){let{gl:e}=n,o=Math.max(1,Math.floor(r)),a=Math.max(1,Math.floor(t)),i=e.createFramebuffer(),s=e.createTexture(),c=e.createTexture();if(!i||!s||!c)return x("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let h=n.hdr?e.RGBA16F:e.RGBA8,f=n.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,u=()=>{e.bindTexture(e.TEXTURE_2D,s),e.texImage2D(e.TEXTURE_2D,0,h,o,a,0,e.RGBA,f,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,c),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,o,a,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,s,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,c,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};u(),e.bindFramebuffer(e.FRAMEBUFFER,i);let d=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),d!==e.FRAMEBUFFER_COMPLETE?x("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${d.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:s,depthTexture:c,get width(){return o},get height(){return a},bind(){e.bindFramebuffer(e.FRAMEBUFFER,i),e.viewport(0,0,o,a)},resize(m,l){let p=Math.max(1,Math.floor(m)),E=Math.max(1,Math.floor(l));p===o&&E===a||(o=p,a=E,u())},dispose(){e.deleteFramebuffer(i),e.deleteTexture(s),e.deleteTexture(c)}}}function Le(n,r=1024){let{gl:t}=n,e=Math.max(256,Math.min(2048,Math.floor(r))),o=t.createFramebuffer(),a=t.createTexture();if(!o||!a)return x("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");t.bindTexture(t.TEXTURE_2D,a),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,e,e,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,o),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,a,0);let i=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),i!==t.FRAMEBUFFER_COMPLETE?x("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:e,bind(){t.bindFramebuffer(t.FRAMEBUFFER,o),t.viewport(0,0,e,e)},dispose(){t.deleteFramebuffer(o),t.deleteTexture(a)}}}var Q=`
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
}`,q={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function Z(n,r,t={}){let e=t.zenith??q.zenith,o=t.horizon??q.horizon,a=t.ground??q.ground;n.uniform3f(n.getUniformLocation(r,"uSkyZenith"),e[0],e[1],e[2]),n.uniform3f(n.getUniformLocation(r,"uSkyHorizon"),o[0],o[1],o[2]),n.uniform3f(n.getUniformLocation(r,"uSkyGround"),a[0],a[1],a[2])}var pt=`#version 300 es
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
${Q}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;function Se(n){let{gl:r}=n,t=n.compile(pt,Et);return"kind"in t?t:{draw(e){let o=w(G(e.target,e.eye)),a=Math.abs(o[1])>.999?[0,0,1]:[0,1,0],i=w(I(o,a)),s=w(I(i,o));r.disable(r.DEPTH_TEST),r.depthMask(!1),r.disable(r.BLEND),r.useProgram(t),r.uniform3f(r.getUniformLocation(t,"uRight"),i[0],i[1],i[2]),r.uniform3f(r.getUniformLocation(t,"uUp"),s[0],s[1],s[2]),r.uniform3f(r.getUniformLocation(t,"uForward"),o[0],o[1],o[2]),r.uniform1f(r.getUniformLocation(t,"uTanHalfFov"),Math.tan(e.fovDeg*Math.PI/360)),r.uniform1f(r.getUniformLocation(t,"uAspect"),Math.max(.001,e.aspect)),Z(r,t,e.sky),n.blit(t),r.depthMask(!0),r.enable(r.DEPTH_TEST)},dispose(){r.deleteProgram(t)}}}var Ye=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,we=`#version 300 es
precision highp float;
void main(){}`,bt=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,$e=`#version 300 es
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
}`,Ke=`#version 300 es
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

out vec4 frag;
${Q}

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

  // NO TONE MAP. The composite owns the only one in the pipeline.
  frag = vec4(direct + ambient, 1.0);
}`;function _e(n,r){let{gl:t}=n,e=t.createVertexArray(),o=t.createBuffer(),a=t.createBuffer(),i=t.createBuffer(),s=t.createBuffer();return!e||!o||!a||!i||!s?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(t.bindVertexArray(e),t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,r.positions,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,a),t.bufferData(t.ARRAY_BUFFER,r.normals,t.STATIC_DRAW),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,i),t.bufferData(t.ARRAY_BUFFER,r.tangents,t.STATIC_DRAW),t.enableVertexAttribArray(2),t.vertexAttribPointer(2,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,s),t.bufferData(t.ELEMENT_ARRAY_BUFFER,r.indices,t.STATIC_DRAW),t.bindVertexArray(null),{vao:e,indexCount:r.indices.length,indexType:r.indices instanceof Uint32Array?t.UNSIGNED_INT:t.UNSIGNED_SHORT,dispose(){t.deleteVertexArray(e),t.deleteBuffer(o),t.deleteBuffer(a),t.deleteBuffer(i),t.deleteBuffer(s)}})}function De(n){let{gl:r}=n,t=n.compile(Ye,we);if("kind"in t)return t;let e=n.compile($e,Ke);if("kind"in e)return e;let o=n.compile(bt,we);if("kind"in o)return o;let a=(i,s)=>r.getUniformLocation(i,s);return{shadowPass(i,s,c,h){let f=h??(()=>{});c.bind(),f("shadow.bind"),r.clear(r.DEPTH_BUFFER_BIT),r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.FRONT),r.useProgram(t),f("useProgram(shadow)"),r.uniformMatrix4fv(a(t,"uLightVP"),!1,i),f("uLightVP");for(let u of s)r.uniformMatrix4fv(a(t,"uModel"),!1,u.model),f("shadow uModel"),r.bindVertexArray(u.mesh.vao),f("shadow bindVAO"),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0),f("shadow drawElements");r.bindVertexArray(null),r.cullFace(r.BACK)},depthPrepass(i,s){r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.colorMask(!1,!1,!1,!1),r.useProgram(o),r.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let c of s)r.uniformMatrix4fv(a(o,"uModel"),!1,c.model),r.bindVertexArray(c.mesh.vao),r.drawElements(r.TRIANGLES,c.mesh.indexCount,c.mesh.indexType,0);r.bindVertexArray(null),r.colorMask(!0,!0,!0,!0)},draw(i){let s=i.onStep??(()=>{});r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.useProgram(e),r.uniformMatrix4fv(a(e,"uViewProj"),!1,i.viewProj),s("uViewProj"),r.uniform3fv(a(e,"uEye"),i.eye),s("uEye"),r.uniform3fv(a(e,"uLightDir"),i.lightDir),s("uLightDir"),r.uniform3fv(a(e,"uLightColour"),i.lightColour),s("uLightColour"),r.uniform1f(a(e,"uAmbientGain"),i.ambientGain??1),s("uAmbientGain"),Z(r,e,i.sky),s("bindSky"),i.ao&&i.screenSize?(r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,i.ao),r.uniform1i(a(e,"uAO"),1),r.uniform2f(a(e,"uScreenSize"),i.screenSize[0],i.screenSize[1]),r.uniform1f(a(e,"uAOEnabled"),1)):r.uniform1f(a(e,"uAOEnabled"),0),s("bindAO"),r.uniformMatrix4fv(a(e,"uLightVP"),!1,i.lightVP),s("lit uLightVP"),i.shadow?(r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,i.shadow.depthTexture),r.uniform1i(a(e,"uShadowMap"),0),r.uniform1f(a(e,"uShadowTexel"),1/i.shadow.size),r.uniform1f(a(e,"uShadowStrength"),i.shadowStrength??1)):r.uniform1f(a(e,"uShadowStrength"),0);for(let c of i.draws)r.uniformMatrix4fv(a(e,"uModel"),!1,c.model),r.uniformMatrix3fv(a(e,"uNormalMat"),!1,c.normalMat),s("uNormalMat"),r.uniform3fv(a(e,"uBaseColour"),c.material.baseColour),s("uBaseColour"),r.uniform1f(a(e,"uRoughness"),c.material.roughness),r.uniform1f(a(e,"uMetalness"),c.material.metalness),r.uniform1f(a(e,"uAnisotropy"),c.material.anisotropy??0),r.bindVertexArray(c.mesh.vao),s("lit bindVAO"),r.drawElements(r.TRIANGLES,c.mesh.indexCount,c.mesh.indexType,0),s("lit drawElements");r.bindVertexArray(null),r.disable(r.CULL_FACE)},dispose(){r.deleteProgram(t),r.deleteProgram(e),r.deleteProgram(o)}}}var k=`
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
}`,gt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${k}

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
}`;function Ue(n,r,t){let{gl:e}=n,o=n.compile(qe,Tt);if("kind"in o)return o;let a=n.compile(qe,gt);if("kind"in a)return a;let i=Math.max(1,r>>1),s=Math.max(1,t>>1),c=()=>{let l=e.createFramebuffer(),p=e.createTexture();return!l||!p?null:{fb:l,tex:p}},h=c(),f=c();if(!h||!f)return x("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let u=()=>{for(let l of[h,f])e.bindTexture(e.TEXTURE_2D,l.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,i,s,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,l.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,l.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};u(),e.bindFramebuffer(e.FRAMEBUFFER,h.fb);let d=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),d!==e.FRAMEBUFFER_COMPLETE)return x("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${d.toString(16)}).`);let m=(l,p,E,y,b,A,g)=>{e.activeTexture(e.TEXTURE0+g),e.bindTexture(e.TEXTURE_2D,p),e.uniform1i(e.getUniformLocation(l,"uDepth"),g),e.uniform2f(e.getUniformLocation(l,"uNearFar"),E,y),e.uniform1f(e.getUniformLocation(l,"uTanHalfFov"),Math.tan(b*Math.PI/360)),e.uniform1f(e.getUniformLocation(l,"uAspect"),A)};return{get texture(){return h.tex},get width(){return i},get height(){return s},compute(l){e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,h.fb),e.viewport(0,0,i,s),e.useProgram(o),m(o,l.depthTexture,l.near,l.far,l.fovDeg,l.aspect,0),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/i,1/s),e.uniform1f(e.getUniformLocation(o,"uRadius"),l.radius??.55),e.uniform1f(e.getUniformLocation(o,"uStrength"),l.strength??1.15),e.uniform1f(e.getUniformLocation(o,"uBias"),l.bias??.035),n.blit(o);for(let[p,E,y]of[[h,f,[1,0]],[f,h,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,E.fb),e.viewport(0,0,i,s),e.useProgram(a),m(a,l.depthTexture,l.near,l.far,l.fovDeg,l.aspect,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,p.tex),e.uniform1i(e.getUniformLocation(a,"uAO"),1),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/i,1/s),e.uniform2f(e.getUniformLocation(a,"uDir"),y[0],y[1]),n.blit(a);e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(l,p){let E=Math.max(1,l>>1),y=Math.max(1,p>>1);E===i&&y===s||(i=E,s=y,u())},dispose(){e.deleteProgram(o),e.deleteProgram(a);for(let l of[h,f])e.deleteFramebuffer(l.fb),e.deleteTexture(l.tex)}}}var xt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,yt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uFocusDistance;
uniform float uAperture;
uniform float uMaxCoc;
out vec4 frag;
${k}

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
}`;function Pe(n,r,t){let{gl:e}=n,o=n.compile(xt,yt);if("kind"in o)return o;let a=Math.max(1,Math.floor(r)),i=Math.max(1,Math.floor(t)),s=e.createFramebuffer(),c=e.createTexture();if(!s||!c)return x("FRAMEBUFFER_INCOMPLETE","The GPU refused a depth-of-field buffer.");let h=()=>{e.bindTexture(e.TEXTURE_2D,c);let u=n.hdr?e.RGBA16F:e.RGBA8,d=n.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE;e.texImage2D(e.TEXTURE_2D,0,u,a,i,0,e.RGBA,d,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,s),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,c,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};h(),e.bindFramebuffer(e.FRAMEBUFFER,s);let f=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),f!==e.FRAMEBUFFER_COMPLETE?x("FRAMEBUFFER_INCOMPLETE",`The DOF buffer is incomplete (0x${f.toString(16)}).`):{texture:c,apply(u){e.bindFramebuffer(e.FRAMEBUFFER,s),e.viewport(0,0,a,i),e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.useProgram(o),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,u.scene),e.uniform1i(e.getUniformLocation(o,"uScene"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,u.depthTexture),e.uniform1i(e.getUniformLocation(o,"uDepth"),1),e.uniform2f(e.getUniformLocation(o,"uNearFar"),u.near,u.far),e.uniform1f(e.getUniformLocation(o,"uTanHalfFov"),Math.tan(u.fovDeg*Math.PI/360)),e.uniform1f(e.getUniformLocation(o,"uAspect"),u.aspect),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/a,1/i),e.uniform1f(e.getUniformLocation(o,"uFocusDistance"),u.focusDistance),e.uniform1f(e.getUniformLocation(o,"uAperture"),u.aperture??12),e.uniform1f(e.getUniformLocation(o,"uMaxCoc"),u.maxCoc??.012),n.blit(o),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(u,d){let m=Math.max(1,Math.floor(u)),l=Math.max(1,Math.floor(d));m===a&&l===i||(a=m,i=l,h())},dispose(){e.deleteProgram(o),e.deleteFramebuffer(s),e.deleteTexture(c)}}}var Oe=new URLSearchParams(location.search).get("aniso")!=="0",H=Math.max(1,Math.min(3,Number(new URLSearchParams(location.search).get("scale")??1))),F=1200*H,M=720*H,Ve=document.getElementById("c");Ve.width=F;Ve.height=M;var Ce=ce(Ve,{alpha:!1});if(!le(Ce))throw document.title="REFUSED",new Error(Ce.reason);var S=Ce,T=S.gl,Rt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,At=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${pe}
${Ee}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,Je=document.getElementById("log"),U=n=>`${n.reason} ${n.detail??""}`,P=n=>{throw document.title="REFUSED",Je.textContent=n,new Error(n)},Ie=S.compile(Rt,At),V=De(S),B=Me(S,F,M),re=Le(S,1024),Ge=Se(S),ne=Ue(S,F,M),oe=Pe(S,F,M);"kind"in Ie&&P(`present: ${U(Ie)}`);"kind"in V&&P(`lit: ${U(V)}`);"kind"in B&&P(`target: ${U(B)}`);"kind"in re&&P(`shadow: ${U(re)}`);"kind"in Ge&&P(`sky: ${U(Ge)}`);"kind"in ne&&P(`ao: ${U(ne)}`);"kind"in oe&&P(`dof: ${U(oe)}`);var et=Y(.92,.16,96),tt=ge(1.06,.055,128,32),rt=Y(1.9,.09,96),nt=Te(16,24),J=[et,tt,rt,nt].map(n=>{let r=_e(S,n);return"kind"in r&&P(`mesh: ${U(r)}`),r}),ee=(n,r,t)=>{let e=z();return e[12]=n,e[13]=r,e[14]=t,e},te=new Float32Array([1,0,0,0,1,0,0,0,1]),ae=.3,Ne=[{mesh:J[3],model:ee(0,0,0),normalMat:te,material:{baseColour:N("#080C15"),roughness:.88,metalness:0}},{mesh:J[2],model:ee(0,.045,0),normalMat:te,material:{baseColour:N("#161D2E"),roughness:.52,metalness:.35}},{mesh:J[0],model:ee(0,ae,0),normalMat:te,material:{baseColour:N("#8FA3C4"),roughness:.3,metalness:.95,anisotropy:Oe?.86:0}},{mesh:J[1],model:ee(0,ae,0),normalMat:te,material:{baseColour:N("#2C6BFF"),roughness:.13,metalness:.92,anisotropy:Oe?.72:0}}],_={target:[0,.34,0],distance:5,azimuthDeg:22,elevationDeg:24,fovDeg:30},ot=[-2,0,-2],at=[2,.55,2],vt=Fe(ot,at),Qe=ve(ot,at),Ft=[et,tt,rt,nt].reduce((n,r)=>n+xe(r),0),ke=Math.max(.01,_.distance/100),Ze=Math.max(ke+1,_.distance*8);function ie(n){let r=-.9+Math.sin(n*.9)*.75,t=[Math.sin(r)*.85,-.95,Math.cos(r)*.55],e=Ae({direction:t,colour:[1,1,1],extent:Qe*.9},vt,Qe),o=K(_,F/M),a=$(_);V.shadowPass(e,Ne,re),B.bind(),T.clear(T.DEPTH_BUFFER_BIT),Ge.draw({eye:a,target:_.target,fovDeg:_.fovDeg??34,aspect:F/M}),V.depthPrepass(o,Ne),ne.compute({depthTexture:B.depthTexture,near:ke,far:Ze,fovDeg:_.fovDeg??34,aspect:F/M,radius:.42,strength:1.3}),B.bind(),V.draw({viewProj:o,eye:a,lightDir:t,lightColour:[5.2,5,4.6],ambientGain:1.15,lightVP:e,shadow:re,shadowStrength:.9,draws:Ne,ao:ne.texture,screenSize:[F,M]});let i=Math.hypot(a[0],a[1]-ae,a[2]);oe.apply({scene:B.texture,depthTexture:B.depthTexture,near:ke,far:Ze,fovDeg:_.fovDeg??34,aspect:F/M,focusDistance:i,aperture:7,maxCoc:.009}),T.bindFramebuffer(T.FRAMEBUFFER,null),T.viewport(0,0,F,M),T.disable(T.DEPTH_TEST),T.activeTexture(T.TEXTURE0),T.bindTexture(T.TEXTURE_2D,oe.texture),S.blit(Ie,s=>T.uniform1i(T.getUniformLocation(s,"uScene"),0))}function Mt(){let n=document.getElementById("mark");if(!n)return;let r=K(_,F/M),t=me(r,[0,ae+.08,0],F/H,M/H);if(t.behind){n.style.visibility="hidden";return}n.style.visibility="visible",n.style.left=`${t.sx}px`,n.style.top=`${t.sy}px`}Mt();ie(1.6);function Lt(n){ie(1.6);let r=new Uint8Array(4);T.readPixels(0,0,1,1,T.RGBA,T.UNSIGNED_BYTE,r);let t=performance.now();for(let e=0;e<n;e++)ie(1.6);return T.readPixels(0,0,1,1,T.RGBA,T.UNSIGNED_BYTE,r),(performance.now()-t)/n}var it=Number(new URLSearchParams(location.search).get("frames")??300),Be=Lt(Math.max(1,it)),st={anisotropy:Oe,triangles:Ft,resolution:`${F}x${M}`,dprScale:H,frames:it,msPerFrame:Number(Be.toFixed(3)),fps:Math.round(1e3/Be),headroom:Number((16.6-Be).toFixed(3)),renderer:(()=>{let n=T.getExtension("WEBGL_debug_renderer_info");return n?String(T.getParameter(n.UNMASKED_RENDERER_WEBGL)):"unknown"})()};globalThis.E8=st;Je.textContent=JSON.stringify(st,null,2);ie(1.6);document.title="READY";

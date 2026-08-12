var Xe={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected."};function g(n,r){return r===void 0?{kind:"refused",code:n,reason:Xe[n]}:{kind:"refused",code:n,reason:Xe[n],detail:r}}function ie(n){return n.kind==="stage"}function se(n,r={}){let t=n.getContext("webgl2",{antialias:r.antialias??!1,alpha:r.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!t)return g("NO_WEBGL2");let e=t.getExtension("EXT_color_buffer_float"),o=n.width,a=n.height,i=e?t.RGBA16F:t.RGBA8,s=e?t.HALF_FLOAT:t.UNSIGNED_BYTE,l=(E,R)=>{let T=t.createTexture();t.bindTexture(t.TEXTURE_2D,T),t.texImage2D(t.TEXTURE_2D,0,i,E,R,0,t.RGBA,s,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);let F=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,F),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,T,0);let A=t.checkFramebufferStatus(t.FRAMEBUFFER);return A!==t.FRAMEBUFFER_COMPLETE?g("FRAMEBUFFER_INCOMPLETE",`status 0x${A.toString(16)} at ${E}\xD7${R}`):{texture:T,framebuffer:F,width:E,height:R}},h=r.bloomShift??2,f={w:o,h:a},u=l(o,a);if("kind"in u)return u;let d=l(Math.max(1,o>>h),Math.max(1,a>>h));if("kind"in d)return d;let m=l(Math.max(1,o>>h),Math.max(1,a>>h));if("kind"in m)return m;let c=t.createVertexArray();t.bindVertexArray(c);let p=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,p),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null);let b=[];return{kind:"stage",gl:t,cssWidth:n.clientWidth||o,cssHeight:n.clientHeight||a,hdr:!!e,get width(){return f.w},get height(){return f.h},get scene(){return u},get bloomA(){return d},get bloomB(){return m},setRegion(E,R){let T=Math.max(1,Math.round(E)),F=Math.max(1,Math.round(R));if(!(T===f.w&&F===f.h)){f={w:T,h:F};for(let A of[u,d,m])"kind"in A||(t.deleteFramebuffer(A.framebuffer),t.deleteTexture(A.texture));u=l(T,F),d=l(Math.max(1,T>>h),Math.max(1,F>>h)),m=l(Math.max(1,T>>h),Math.max(1,F>>h))}},compile(E,R){let T=(oe,N)=>{let D=t.createShader(oe);return t.shaderSource(D,N),t.compileShader(D),t.getShaderParameter(D,t.COMPILE_STATUS)?D:g("SHADER_COMPILE_FAILED",t.getShaderInfoLog(D)??"(no log)")},F=T(t.VERTEX_SHADER,E);if(typeof F=="object"&&"kind"in F)return F;let A=T(t.FRAGMENT_SHADER,R);if(typeof A=="object"&&"kind"in A)return A;let S=t.createProgram();return t.attachShader(S,F),t.attachShader(S,A),t.linkProgram(S),t.getProgramParameter(S,t.LINK_STATUS)?(b.push(S),S):g("PROGRAM_LINK_FAILED",t.getProgramInfoLog(S)??"(no log)")},bindTarget(E){t.bindFramebuffer(t.FRAMEBUFFER,E?E.framebuffer:null),t.viewport(0,0,E?E.width:f.w,E?E.height:f.h)},blit(E,R){t.useProgram(E),t.bindVertexArray(c),R?.(E),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null)},dispose(){for(let E of b)t.deleteProgram(E);for(let E of[u,d,m])"kind"in E||(t.deleteFramebuffer(E.framebuffer),t.deleteTexture(E.texture));t.deleteBuffer(p),t.deleteVertexArray(c)}}}var z=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function j(n,r){let t=new Float32Array(16);for(let e=0;e<4;e++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=n[i*4+o]*r[e*4+i];t[e*4+o]=a}return t}var O=(n,r)=>[n[0]-r[0],n[1]-r[1],n[2]-r[2]],X=(n,r)=>n[0]*r[0]+n[1]*r[1]+n[2]*r[2],C=(n,r)=>[n[1]*r[2]-n[2]*r[1],n[2]*r[0]-n[0]*r[2],n[0]*r[1]-n[1]*r[0]];function _(n){let r=Math.hypot(n[0],n[1],n[2]);return r===0?n:[n[0]/r,n[1]/r,n[2]/r]}function ue(n,r,t,e){let o=1/Math.tan(n/2);return new Float32Array([o/r,0,0,0,0,o,0,0,0,0,(e+t)/(t-e),-1,0,0,2*e*t/(t-e),0])}function le(n,r,t,e,o,a){let i=r-n,s=e-t,l=a-o;return new Float32Array([2/i,0,0,0,0,2/s,0,0,0,0,-2/l,0,-(r+n)/i,-(e+t)/s,-(a+o)/l,1])}function W(n,r,t){let e=_(O(n,r)),o=C(t,e);if(Math.hypot(o[0],o[1],o[2])<1e-8)return z();let a=_(o),i=C(e,a);return new Float32Array([a[0],i[0],e[0],0,a[1],i[1],e[1],0,a[2],i[2],e[2],0,-X(a,n),-X(i,n),-X(e,n),1])}function ze(n,r){let t=[0,1,2,3].map(o=>n[0+o]*r[0]+n[4+o]*r[1]+n[8+o]*r[2]+n[12+o]),e=t[3];return{x:t[0]/e,y:t[1]/e,z:t[2]/e,w:e}}function ce(n,r,t,e){let o=ze(n,r);return{sx:(o.x*.5+.5)*t,sy:(1-(o.y*.5+.5))*e,behind:o.w<=0}}function je(n){return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4)}function fe(n){return n<=.0031308?n*12.92:1.055*Math.pow(n,1/2.4)-.055}var Tt=/^#?([0-9a-fA-F]{6})$/;function U(n){let r=Tt.exec(n.trim());if(!r)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(n)}`);let t=r[1];return[0,2,4].map(e=>je(parseInt(t.slice(e,e+2),16)/255))}function de(n){return`#${n.map(t=>{let e=fe(Math.min(1,Math.max(0,t)));return Math.round(e*255).toString(16).padStart(2,"0")}).join("")}`}var k={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},me=Object.freeze(Object.fromEntries(Object.keys(k).map(n=>[n,U(k[n])])));var We=.4;var he=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${We.toFixed(2)}); }`,pe=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function be(){let n=[];for(let r of Object.keys(k)){let t=k[r].toLowerCase(),e=de(me[r]).toLowerCase();e!==t&&n.push({key:r,expected:t,actual:e})}return n}function gt(n){let r=[1/0,1/0,1/0],t=[-1/0,-1/0,-1/0];for(let e=0;e<n.length;e+=3)for(let o=0;o<3;o++){let a=n[e+o];a<r[o]&&(r[o]=a),a>t[o]&&(t[o]=a)}return n.length===0?{min:[0,0,0],max:[0,0,0]}:{min:r,max:t}}function $e(n,r,t,e){let o=new Float32Array(n.length);for(let i=0;i<e.length;i+=3){let s=e[i],l=e[i+1],h=e[i+2],f=s*3,u=l*3,d=h*3,m=s*2,c=l*2,p=h*2,b=n[u]-n[f],y=n[u+1]-n[f+1],E=n[u+2]-n[f+2],R=n[d]-n[f],T=n[d+1]-n[f+1],F=n[d+2]-n[f+2],A=t[c]-t[m],S=t[c+1]-t[m+1],oe=t[p]-t[m],N=t[p+1]-t[m+1],D=A*N-oe*S;if(Math.abs(D)<1e-12)continue;let ae=1/D,bt=(b*N-R*S)*ae,Et=(y*N-T*S)*ae,xt=(E*N-F*S)*ae;for(let B of[f,u,d])o[B]=o[B]+bt,o[B+1]=o[B+1]+Et,o[B+2]=o[B+2]+xt}let a=new Float32Array(n.length);for(let i=0;i<a.length;i+=3){let s=r[i],l=r[i+1],h=r[i+2],f=o[i],u=o[i+1],d=o[i+2],m=f*s+u*l+d*h;f-=s*m,u-=l*m,d-=h*m;let c=Math.hypot(f,u,d);c<1e-8&&(Math.abs(s)<.9?(f=0,u=-h,d=l):(f=-h,u=0,d=s),c=Math.hypot(f,u,d)||1),a[i]=f/c,a[i+1]=u/c,a[i+2]=d/c}return a}function Ye(n,r){let t=new Float32Array(n.length);for(let e=0;e<r.length;e+=3){let o=r[e]*3,a=r[e+1]*3,i=r[e+2]*3,s=n[a]-n[o],l=n[a+1]-n[o+1],h=n[a+2]-n[o+2],f=n[i]-n[o],u=n[i+1]-n[o+1],d=n[i+2]-n[o+2],m=l*d-h*u,c=h*f-s*d,p=s*u-l*f;for(let b of[o,a,i])t[b]=t[b]+m,t[b+1]=t[b+1]+c,t[b+2]=t[b+2]+p}for(let e=0;e<t.length;e+=3){let o=Math.hypot(t[e],t[e+1],t[e+2]);o>0&&(t[e]=t[e]/o,t[e+1]=t[e+1]/o,t[e+2]=t[e+2]/o)}return t}function Ee(n,r,t,e,o){let{min:a,max:i}=gt(n),s=e??Ye(n,t);return{positions:n,normals:s,uvs:r,indices:t,min:a,max:i,tangents:o??$e(n,s,r,t)}}function xe(n=10,r=24){let t=Math.max(1,Math.floor(r)),e=(t+1)*(t+1),o=new Float32Array(e*3),a=new Float32Array(e*3),i=new Float32Array(e*2),s=new Uint16Array(t*t*6),l=0,h=0,f=0;for(let u=0;u<=t;u++)for(let d=0;d<=t;d++){let m=(d/t-.5)*n,c=(u/t-.5)*n;o[l]=m,o[l+1]=0,o[l+2]=c,a[l]=0,a[l+1]=1,a[l+2]=0,l+=3,i[h++]=d/t,i[h++]=u/t}for(let u=0;u<t;u++)for(let d=0;d<t;d++){let m=u*(t+1)+d,c=m+1,p=m+(t+1),b=p+1;s[f++]=m,s[f++]=p,s[f++]=c,s[f++]=c,s[f++]=p,s[f++]=b}return Ee(o,i,s,a)}function $(n=.5,r=.2,t=64){let e=Math.max(3,t),o=r/2,a=[],i=[],s=[],l=[],h=[];for(let f=0;f<=e;f++){let u=f/e*Math.PI*2,d=Math.cos(u),m=Math.sin(u);a.push(d*n,o,m*n),i.push(d,0,m),s.push(f/e,1),h.push(-m,0,d),a.push(d*n,-o,m*n),i.push(d,0,m),s.push(f/e,0),h.push(-m,0,d)}for(let f=0;f<e;f++){let u=f*2,d=u+1,m=u+2,c=u+3;l.push(u,m,d,d,m,c)}for(let[f,u]of[[1,o],[-1,-o]]){let d=a.length/3;a.push(0,u,0),i.push(0,f,0),s.push(.5,.5),h.push(1,0,0);for(let m=0;m<=e;m++){let c=m/e*Math.PI*2,p=Math.cos(c),b=Math.sin(c);a.push(p*n,u,b*n),i.push(0,f,0),s.push(.5+p*.5,.5+b*.5),h.push(-b,0,p)}for(let m=0;m<e;m++){let c=d+1+m,p=d+2+m;f>0?l.push(d,p,c):l.push(d,c,p)}}return Ee(new Float32Array(a),new Float32Array(s),new Uint16Array(l),new Float32Array(i),new Float32Array(h))}function Te(n=.5,r=.08,t=64,e=24){let o=Math.max(3,t),a=Math.max(3,e),i=[],s=[],l=[],h=[],f=[];for(let u=0;u<=o;u++){let d=u/o*Math.PI*2,m=Math.cos(d),c=Math.sin(d);for(let p=0;p<=a;p++){let b=p/a*Math.PI*2,y=Math.cos(b),E=Math.sin(b);i.push((n+r*y)*m,r*E,(n+r*y)*c),s.push(m*y,E,c*y),l.push(u/o,p/a),f.push(-c,0,m)}}for(let u=0;u<o;u++)for(let d=0;d<a;d++){let m=u*(a+1)+d,c=m+1,p=m+(a+1),b=p+1;h.push(m,c,p,c,b,p)}return Ee(new Float32Array(i),new Float32Array(l),new Uint16Array(h),new Float32Array(s),new Float32Array(f))}function ge(n){return n.indices.length/3}var ye=89,Fe=Math.PI/180;function Y(n){let r=Math.max(-ye,Math.min(ye,n.elevationDeg))*Fe,t=n.azimuthDeg*Fe,e=Math.max(1e-4,n.distance),o=Math.sin(r)*e,a=Math.cos(r)*e;return[n.target[0]+Math.sin(t)*a,n.target[1]+o,n.target[2]+Math.cos(t)*a]}function K(n,r){let t=Y(n),e=n.near??Math.max(.01,n.distance/100),o=n.far??Math.max(e+1,n.distance*8),a=ue((n.fovDeg??38)*Fe,Math.max(.001,r),e,o),i=W(t,n.target,[0,1,0]);return j(a,i)}function Re(n,r,t){let e=_(n.direction),o=n.extent??Math.max(.1,t*1.35),a=Math.max(1,t*2),i=[r[0]-e[0]*a,r[1]-e[1]*a,r[2]-e[2]*a],s=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],l=W(i,r,s),h=le(-o,o,-o,o,.01,a+t*2+o);return j(h,l)}function Ae(n,r){let t=O([r[0],r[1],r[2]],[n[0],n[1],n[2]]);return Math.hypot(t[0],t[1],t[2])/2}function ve(n,r){return[(n[0]+r[0])/2,(n[1]+r[1])/2,(n[2]+r[2])/2]}function Me(n,r,t){let{gl:e}=n,o=Math.max(1,Math.floor(r)),a=Math.max(1,Math.floor(t)),i=e.createFramebuffer(),s=e.createTexture(),l=e.createTexture();if(!i||!s||!l)return g("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let h=n.hdr?e.RGBA16F:e.RGBA8,f=n.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,u=()=>{e.bindTexture(e.TEXTURE_2D,s),e.texImage2D(e.TEXTURE_2D,0,h,o,a,0,e.RGBA,f,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,l),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,o,a,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,s,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,l,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};u(),e.bindFramebuffer(e.FRAMEBUFFER,i);let d=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),d!==e.FRAMEBUFFER_COMPLETE?g("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${d.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:s,depthTexture:l,get width(){return o},get height(){return a},bind(){e.bindFramebuffer(e.FRAMEBUFFER,i),e.viewport(0,0,o,a)},resize(m,c){let p=Math.max(1,Math.floor(m)),b=Math.max(1,Math.floor(c));p===o&&b===a||(o=p,a=b,u())},dispose(){e.deleteFramebuffer(i),e.deleteTexture(s),e.deleteTexture(l)}}}function Se(n,r=1024){let{gl:t}=n,e=Math.max(256,Math.min(2048,Math.floor(r))),o=t.createFramebuffer(),a=t.createTexture();if(!o||!a)return g("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");t.bindTexture(t.TEXTURE_2D,a),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,e,e,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,o),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,a,0);let i=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),i!==t.FRAMEBUFFER_COMPLETE?g("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:e,bind(){t.bindFramebuffer(t.FRAMEBUFFER,o),t.viewport(0,0,e,e)},dispose(){t.deleteFramebuffer(o),t.deleteTexture(a)}}}var Q=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,q={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function J(n,r,t={}){let e=t.zenith??q.zenith,o=t.horizon??q.horizon,a=t.ground??q.ground;n.uniform3f(n.getUniformLocation(r,"uSkyZenith"),e[0],e[1],e[2]),n.uniform3f(n.getUniformLocation(r,"uSkyHorizon"),o[0],o[1],o[2]),n.uniform3f(n.getUniformLocation(r,"uSkyGround"),a[0],a[1],a[2])}var yt=`#version 300 es
precision highp float;
out vec2 vNdc;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`,Ft=`#version 300 es
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
}`;function Le(n){let{gl:r}=n,t=n.compile(yt,Ft);return"kind"in t?t:{draw(e){let o=_(O(e.target,e.eye)),a=Math.abs(o[1])>.999?[0,0,1]:[0,1,0],i=_(C(o,a)),s=_(C(i,o));r.disable(r.DEPTH_TEST),r.depthMask(!1),r.disable(r.BLEND),r.useProgram(t),r.uniform3f(r.getUniformLocation(t,"uRight"),i[0],i[1],i[2]),r.uniform3f(r.getUniformLocation(t,"uUp"),s[0],s[1],s[2]),r.uniform3f(r.getUniformLocation(t,"uForward"),o[0],o[1],o[2]),r.uniform1f(r.getUniformLocation(t,"uTanHalfFov"),Math.tan(e.fovDeg*Math.PI/360)),r.uniform1f(r.getUniformLocation(t,"uAspect"),Math.max(.001,e.aspect)),J(r,t,e.sky),n.blit(t),r.depthMask(!0),r.enable(r.DEPTH_TEST)},dispose(){r.deleteProgram(t)}}}var Ke=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,_e=`#version 300 es
precision highp float;
void main(){}`,Rt=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,qe=`#version 300 es
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
${Q}

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
}`;function we(n,r){let{gl:t}=n,e=t.createVertexArray(),o=t.createBuffer(),a=t.createBuffer(),i=t.createBuffer(),s=t.createBuffer();return!e||!o||!a||!i||!s?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(t.bindVertexArray(e),t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,r.positions,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,a),t.bufferData(t.ARRAY_BUFFER,r.normals,t.STATIC_DRAW),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,i),t.bufferData(t.ARRAY_BUFFER,r.tangents,t.STATIC_DRAW),t.enableVertexAttribArray(2),t.vertexAttribPointer(2,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,s),t.bufferData(t.ELEMENT_ARRAY_BUFFER,r.indices,t.STATIC_DRAW),t.bindVertexArray(null),{vao:e,indexCount:r.indices.length,indexType:r.indices instanceof Uint32Array?t.UNSIGNED_INT:t.UNSIGNED_SHORT,dispose(){t.deleteVertexArray(e),t.deleteBuffer(o),t.deleteBuffer(a),t.deleteBuffer(i),t.deleteBuffer(s)}})}function De(n){let{gl:r}=n,t=n.compile(Ke,_e);if("kind"in t)return t;let e=n.compile(qe,Qe);if("kind"in e)return e;let o=n.compile(Rt,_e);if("kind"in o)return o;let a=(i,s)=>r.getUniformLocation(i,s);return{shadowPass(i,s,l,h){let f=h??(()=>{});l.bind(),f("shadow.bind"),r.clear(r.DEPTH_BUFFER_BIT),r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.FRONT),r.useProgram(t),f("useProgram(shadow)"),r.uniformMatrix4fv(a(t,"uLightVP"),!1,i),f("uLightVP");for(let u of s)r.uniformMatrix4fv(a(t,"uModel"),!1,u.model),f("shadow uModel"),r.bindVertexArray(u.mesh.vao),f("shadow bindVAO"),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0),f("shadow drawElements");r.bindVertexArray(null),r.cullFace(r.BACK)},depthPrepass(i,s){r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.colorMask(!1,!1,!1,!1),r.useProgram(o),r.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let l of s)r.uniformMatrix4fv(a(o,"uModel"),!1,l.model),r.bindVertexArray(l.mesh.vao),r.drawElements(r.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0);r.bindVertexArray(null),r.colorMask(!0,!0,!0,!0)},draw(i){let s=i.onStep??(()=>{});if(r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.useProgram(e),r.uniformMatrix4fv(a(e,"uViewProj"),!1,i.viewProj),s("uViewProj"),r.uniform3fv(a(e,"uEye"),i.eye),s("uEye"),r.uniform3fv(a(e,"uLightDir"),i.lightDir),s("uLightDir"),r.uniform3fv(a(e,"uLightColour"),i.lightColour),s("uLightColour"),r.uniform1f(a(e,"uAmbientGain"),i.ambientGain??1),s("uAmbientGain"),i.fog&&i.fog.density>0){r.uniform1f(a(e,"uFogDensity"),i.fog.density),r.uniform1f(a(e,"uFogHeight"),i.fog.height),r.uniform1f(a(e,"uFogFloor"),i.fog.floor??0);let l=i.fog.colour;l==="sky"?r.uniform3f(a(e,"uFogColour"),-1,-1,-1):r.uniform3f(a(e,"uFogColour"),l[0],l[1],l[2]),s("fog")}else r.uniform1f(a(e,"uFogDensity"),0);J(r,e,i.sky),s("bindSky"),i.ao&&i.screenSize?(r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,i.ao),r.uniform1i(a(e,"uAO"),1),r.uniform2f(a(e,"uScreenSize"),i.screenSize[0],i.screenSize[1]),r.uniform1f(a(e,"uAOEnabled"),1)):r.uniform1f(a(e,"uAOEnabled"),0),s("bindAO"),r.uniformMatrix4fv(a(e,"uLightVP"),!1,i.lightVP),s("lit uLightVP"),i.shadow?(r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,i.shadow.depthTexture),r.uniform1i(a(e,"uShadowMap"),0),r.uniform1f(a(e,"uShadowTexel"),1/i.shadow.size),r.uniform1f(a(e,"uShadowStrength"),i.shadowStrength??1)):r.uniform1f(a(e,"uShadowStrength"),0);for(let l of i.draws)r.uniformMatrix4fv(a(e,"uModel"),!1,l.model),r.uniformMatrix3fv(a(e,"uNormalMat"),!1,l.normalMat),s("uNormalMat"),r.uniform3fv(a(e,"uBaseColour"),l.material.baseColour),s("uBaseColour"),r.uniform1f(a(e,"uRoughness"),l.material.roughness),r.uniform1f(a(e,"uMetalness"),l.material.metalness),r.uniform1f(a(e,"uAnisotropy"),l.material.anisotropy??0),r.bindVertexArray(l.mesh.vao),s("lit bindVAO"),r.drawElements(r.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0),s("lit drawElements");r.bindVertexArray(null),r.disable(r.CULL_FACE)},dispose(){r.deleteProgram(t),r.deleteProgram(e),r.deleteProgram(o)}}}var I=`
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
}`,Je=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,At=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${I}

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
}`,vt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${I}

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
}`;function Ue(n,r,t){let{gl:e}=n,o=n.compile(Je,At);if("kind"in o)return o;let a=n.compile(Je,vt);if("kind"in a)return a;let i=Math.max(1,r>>1),s=Math.max(1,t>>1),l=()=>{let c=e.createFramebuffer(),p=e.createTexture();return!c||!p?null:{fb:c,tex:p}},h=l(),f=l();if(!h||!f)return g("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let u=()=>{for(let c of[h,f])e.bindTexture(e.TEXTURE_2D,c.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,i,s,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,c.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,c.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};u(),e.bindFramebuffer(e.FRAMEBUFFER,h.fb);let d=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),d!==e.FRAMEBUFFER_COMPLETE)return g("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${d.toString(16)}).`);let m=(c,p,b,y,E,R,T)=>{e.activeTexture(e.TEXTURE0+T),e.bindTexture(e.TEXTURE_2D,p),e.uniform1i(e.getUniformLocation(c,"uDepth"),T),e.uniform2f(e.getUniformLocation(c,"uNearFar"),b,y),e.uniform1f(e.getUniformLocation(c,"uTanHalfFov"),Math.tan(E*Math.PI/360)),e.uniform1f(e.getUniformLocation(c,"uAspect"),R)};return{get texture(){return h.tex},get width(){return i},get height(){return s},compute(c){e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,h.fb),e.viewport(0,0,i,s),e.useProgram(o),m(o,c.depthTexture,c.near,c.far,c.fovDeg,c.aspect,0),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/i,1/s),e.uniform1f(e.getUniformLocation(o,"uRadius"),c.radius??.55),e.uniform1f(e.getUniformLocation(o,"uStrength"),c.strength??1.15),e.uniform1f(e.getUniformLocation(o,"uBias"),c.bias??.035),n.blit(o);for(let[p,b,y]of[[h,f,[1,0]],[f,h,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,b.fb),e.viewport(0,0,i,s),e.useProgram(a),m(a,c.depthTexture,c.near,c.far,c.fovDeg,c.aspect,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,p.tex),e.uniform1i(e.getUniformLocation(a,"uAO"),1),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/i,1/s),e.uniform2f(e.getUniformLocation(a,"uDir"),y[0],y[1]),n.blit(a);e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(c,p){let b=Math.max(1,c>>1),y=Math.max(1,p>>1);b===i&&y===s||(i=b,s=y,u())},dispose(){e.deleteProgram(o),e.deleteProgram(a);for(let c of[h,f])e.deleteFramebuffer(c.fb),e.deleteTexture(c.tex)}}}var Mt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,St=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uFocusDistance;
uniform float uAperture;
uniform float uMaxCoc;
out vec4 frag;
${I}

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
}`;function Pe(n,r,t){let{gl:e}=n,o=n.compile(Mt,St);if("kind"in o)return o;let a=Math.max(1,Math.floor(r)),i=Math.max(1,Math.floor(t)),s=e.createFramebuffer(),l=e.createTexture();if(!s||!l)return g("FRAMEBUFFER_INCOMPLETE","The GPU refused a depth-of-field buffer.");let h=()=>{e.bindTexture(e.TEXTURE_2D,l);let u=n.hdr?e.RGBA16F:e.RGBA8,d=n.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE;e.texImage2D(e.TEXTURE_2D,0,u,a,i,0,e.RGBA,d,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,s),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,l,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};h(),e.bindFramebuffer(e.FRAMEBUFFER,s);let f=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),f!==e.FRAMEBUFFER_COMPLETE?g("FRAMEBUFFER_INCOMPLETE",`The DOF buffer is incomplete (0x${f.toString(16)}).`):{texture:l,apply(u){e.bindFramebuffer(e.FRAMEBUFFER,s),e.viewport(0,0,a,i),e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.useProgram(o),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,u.scene),e.uniform1i(e.getUniformLocation(o,"uScene"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,u.depthTexture),e.uniform1i(e.getUniformLocation(o,"uDepth"),1),e.uniform2f(e.getUniformLocation(o,"uNearFar"),u.near,u.far),e.uniform1f(e.getUniformLocation(o,"uTanHalfFov"),Math.tan(u.fovDeg*Math.PI/360)),e.uniform1f(e.getUniformLocation(o,"uAspect"),u.aspect),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/a,1/i),e.uniform1f(e.getUniformLocation(o,"uFocusDistance"),u.focusDistance),e.uniform1f(e.getUniformLocation(o,"uAperture"),u.aperture??12),e.uniform1f(e.getUniformLocation(o,"uMaxCoc"),u.maxCoc??.012),n.blit(o),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(u,d){let m=Math.max(1,Math.floor(u)),c=Math.max(1,Math.floor(d));m===a&&c===i||(a=m,i=c,h())},dispose(){e.deleteProgram(o),e.deleteFramebuffer(s),e.deleteTexture(l)}}}var Lt=`
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
`;function Ze(n){let r=document.createElement("style");r.textContent=Lt,document.head.appendChild(r);let t=document.createElement("section");t.id="lcx-fallback";let e=(o,a)=>{if(o===null)return`<td class="absent${a?" n":""}">absent</td>`;let i=String(o).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");return`<td class="${a?"n":""}">${i}</td>`};return t.innerHTML=`<h2>${n.title} \u2014 flat view</h2><p class="reads">${n.readsAs}</p>`+(n.notices??[]).map(o=>`<p class="notice">${o}</p>`).join("")+'<div id="lcx-refusal"></div>'+(n.html?`<div class="surface">${n.html}</div>`:"<table><thead><tr>"+n.columns.map(o=>`<th class="${o.numeric?"n":""}">${o.label}</th>`).join("")+"</tr></thead><tbody>"+n.rows.map(o=>"<tr>"+n.columns.map(a=>e(o[a.key]??null,!!a.numeric)).join("")+"</tr>").join("")+"</tbody></table>"),document.body.appendChild(t),{markRendered(){t.dataset.rendered="1"},showRefusal(o,a){let i=document.getElementById("lcx-refusal");i&&(i.innerHTML=`<p class="refusal"><strong>${o}</strong> \u2014 ${a} The measurements below are unaffected.</p>`),delete t.dataset.rendered;for(let s of Array.from(document.querySelectorAll("canvas")))s.style.display="none"}}}var V=new URLSearchParams(location.search).get("aniso")!=="0",H=Math.max(1,Math.min(3,Number(new URLSearchParams(location.search).get("scale")??1))),v=1200*H,M=720*H,Ve=document.getElementById("c");Ve.width=v;Ve.height=M;function He(n){document.title="REFUSED";let r=document.getElementById("log");r&&(r.textContent=n);let[t,...e]=n.split(":");throw at?.showRefusal(t?.trim()??"REFUSED",e.join(":").trim()||n),new Error(n)}var at=null;function P(n,r){return"kind"in r&&He(`${n}: ${r.code} \u2014 ${r.reason} ${r.detail??""}`),r}var it=Ze({title:"E8 \xB7 The Forge \u2014 the machined mark",readsAs:"The rendered view is anisotropic GGX on a brushed disc: the highlight stretches along the lathe direction rather than across it, which is what reads as machined instead of scratched. The shipping surface resolves instead to ForgePlate, a CSS gradient \u2014 this table states what the render is evidence for.",notices:["A material study, not a data surface \u2014 there is no measurement in this frame to lose.","The SHIPPED fallback for this environment is apps/web/src/components/brand/ForgePlate.tsx."],columns:[{key:"part",label:"Part"},{key:"hex",label:"Base colour"},{key:"roughness",label:"Roughness",numeric:!0},{key:"metalness",label:"Metalness",numeric:!0},{key:"aniso",label:"Anisotropy",numeric:!0}],rows:[{part:"Disc face (brushed)",hex:"#C9D4E4",roughness:.22,metalness:.9,aniso:V?.85:0},{part:"Ring",hex:"#C9D4E4",roughness:.18,metalness:.94,aniso:V?.9:0},{part:"Mark inlay",hex:"#2C6BFF",roughness:.3,metalness:.05,aniso:0}]});at=it;new URLSearchParams(location.search).get("refuse")==="1"&&He("FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. The three-dimensional view is not being drawn.");var ke=se(Ve,{alpha:!1});if(!ie(ke))throw document.title="REFUSED",new Error(ke.reason);var L=ke,x=L.gl,_t=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,wt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${he}
${pe}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,Dt=document.getElementById("log"),Ut=n=>`${n.reason} ${n.detail??""}`,Pt=P("present",L.compile(_t,wt)),Ne=P("lit",De(L)),G=P("target",Me(L,v,M)),et=P("shadow",Se(L,1024)),Nt=P("skyBox",Le(L)),tt=P("ao",Ue(L,v,M)),rt=P("dof",Pe(L,v,M)),st=$(.92,.16,96),ut=Te(1.06,.055,128,32),lt=$(1.9,.09,96),ct=xe(16,24),Z=[st,ut,lt,ct].map(n=>{let r=we(L,n);return"kind"in r&&He(`mesh: ${Ut(r)}`),r}),ee=(n,r,t)=>{let e=z();return e[12]=n,e[13]=r,e[14]=t,e},te=new Float32Array([1,0,0,0,1,0,0,0,1]),re=.3,Be=[{mesh:Z[3],model:ee(0,0,0),normalMat:te,material:{baseColour:U("#080C15"),roughness:.88,metalness:0}},{mesh:Z[2],model:ee(0,.045,0),normalMat:te,material:{baseColour:U("#161D2E"),roughness:.52,metalness:.35}},{mesh:Z[0],model:ee(0,re,0),normalMat:te,material:{baseColour:U("#8FA3C4"),roughness:.3,metalness:.95,anisotropy:V?.86:0}},{mesh:Z[1],model:ee(0,re,0),normalMat:te,material:{baseColour:U("#2C6BFF"),roughness:.13,metalness:.92,anisotropy:V?.72:0}}],w={target:[0,.34,0],distance:5,azimuthDeg:22,elevationDeg:24,fovDeg:30},ft=[-2,0,-2],dt=[2,.55,2],Bt=ve(ft,dt),nt=Ae(ft,dt),Ct=[st,ut,lt,ct].reduce((n,r)=>n+ge(r),0),Ie=Math.max(.01,w.distance/100),ot=Math.max(Ie+1,w.distance*8);function ne(n){let r=-.9+Math.sin(n*.9)*.75,t=[Math.sin(r)*.85,-.95,Math.cos(r)*.55],e=Re({direction:t,colour:[1,1,1],extent:nt*.9},Bt,nt),o=K(w,v/M),a=Y(w);Ne.shadowPass(e,Be,et),G.bind(),x.clear(x.DEPTH_BUFFER_BIT),Nt.draw({eye:a,target:w.target,fovDeg:w.fovDeg??34,aspect:v/M}),Ne.depthPrepass(o,Be),tt.compute({depthTexture:G.depthTexture,near:Ie,far:ot,fovDeg:w.fovDeg??34,aspect:v/M,radius:.42,strength:1.3}),G.bind(),Ne.draw({viewProj:o,eye:a,lightDir:t,lightColour:[5.2,5,4.6],ambientGain:1.15,lightVP:e,shadow:et,shadowStrength:.9,draws:Be,ao:tt.texture,screenSize:[v,M]});let i=Math.hypot(a[0],a[1]-re,a[2]);rt.apply({scene:G.texture,depthTexture:G.depthTexture,near:Ie,far:ot,fovDeg:w.fovDeg??34,aspect:v/M,focusDistance:i,aperture:7,maxCoc:.009}),x.bindFramebuffer(x.FRAMEBUFFER,null),x.viewport(0,0,v,M),x.disable(x.DEPTH_TEST),x.activeTexture(x.TEXTURE0),x.bindTexture(x.TEXTURE_2D,rt.texture),L.blit(Pt,s=>x.uniform1i(x.getUniformLocation(s,"uScene"),0))}function Ot(){let n=document.getElementById("mark");if(!n)return;let r=K(w,v/M),t=ce(r,[0,re+.08,0],v/H,M/H);if(t.behind){n.style.visibility="hidden";return}n.style.visibility="visible",n.style.left=`${t.sx}px`,n.style.top=`${t.sy}px`}Ot();ne(1.6);function kt(n){ne(1.6);let r=new Uint8Array(4);x.readPixels(0,0,1,1,x.RGBA,x.UNSIGNED_BYTE,r);let t=performance.now();for(let e=0;e<n;e++)ne(1.6);return x.readPixels(0,0,1,1,x.RGBA,x.UNSIGNED_BYTE,r),(performance.now()-t)/n}var mt=Number(new URLSearchParams(location.search).get("frames")??300),Ce=kt(Math.max(1,mt)),Ge=be();if(Ge.length>0){let n="BRAND FIDELITY FAILED \u2014 "+Ge.map(t=>`${t.key}: expected ${t.expected}, got ${t.actual}`).join("; ");document.title="REFUSED";let r=document.getElementById("log");throw r&&(r.textContent=n),new Error(n)}var ht=(()=>{let n=x.getExtension("WEBGL_debug_renderer_info");return n?String(x.getParameter(n.UNMASKED_RENDERER_WEBGL)):"unknown"})(),Oe=/swiftshader|llvmpipe|software/i.test(ht),pt={brandFidelity:Ge,anisotropy:V,triangles:Ct,resolution:`${v}x${M}`,dprScale:H,frames:mt,msPerFrame:Number(Ce.toFixed(3)),fps:Math.round(1e3/Ce),renderer:ht,rendererClass:Oe?"software":"hardware",headroom:Oe?null:Number((16.6-Ce).toFixed(3)),headroomRefusal:Oe?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null};globalThis.E8=pt;Dt.textContent=JSON.stringify(pt,null,2);ne(1.6);it.markRendered();document.title="READY";

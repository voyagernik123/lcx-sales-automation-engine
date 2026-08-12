var Ke={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected."};function R(n,r){return r===void 0?{kind:"refused",code:n,reason:Ke[n]}:{kind:"refused",code:n,reason:Ke[n],detail:r}}function me(n){return n.kind==="stage"}function de(n,r={}){let t=n.getContext("webgl2",{antialias:r.antialias??!1,alpha:r.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!t)return R("NO_WEBGL2");let e=t.getExtension("EXT_color_buffer_float"),o=n.width,a=n.height,i=e?t.RGBA16F:t.RGBA8,u=e?t.HALF_FLOAT:t.UNSIGNED_BYTE,s=(E,y)=>{let g=t.createTexture();t.bindTexture(t.TEXTURE_2D,g),t.texImage2D(t.TEXTURE_2D,0,i,E,y,0,t.RGBA,u,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);let F=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,F),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,g,0);let S=t.checkFramebufferStatus(t.FRAMEBUFFER);return S!==t.FRAMEBUFFER_COMPLETE?R("FRAMEBUFFER_INCOMPLETE",`status 0x${S.toString(16)} at ${E}\xD7${y}`):{texture:g,framebuffer:F,width:E,height:y}},m=r.bloomShift??2,f={w:o,h:a},l=s(o,a);if("kind"in l)return l;let d=s(Math.max(1,o>>m),Math.max(1,a>>m));if("kind"in d)return d;let h=s(Math.max(1,o>>m),Math.max(1,a>>m));if("kind"in h)return h;let c=t.createVertexArray();t.bindVertexArray(c);let p=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,p),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null);let T=[];return{kind:"stage",gl:t,cssWidth:n.clientWidth||o,cssHeight:n.clientHeight||a,hdr:!!e,get width(){return f.w},get height(){return f.h},get scene(){return l},get bloomA(){return d},get bloomB(){return h},setRegion(E,y){let g=Math.max(1,Math.round(E)),F=Math.max(1,Math.round(y));if(!(g===f.w&&F===f.h)){f={w:g,h:F};for(let S of[l,d,h])"kind"in S||(t.deleteFramebuffer(S.framebuffer),t.deleteTexture(S.texture));l=s(g,F),d=s(Math.max(1,g>>m),Math.max(1,F>>m)),h=s(Math.max(1,g>>m),Math.max(1,F>>m))}},compile(E,y){let g=(ce,I)=>{let U=t.createShader(ce);return t.shaderSource(U,I),t.compileShader(U),t.getShaderParameter(U,t.COMPILE_STATUS)?U:R("SHADER_COMPILE_FAILED",t.getShaderInfoLog(U)??"(no log)")},F=g(t.VERTEX_SHADER,E);if(typeof F=="object"&&"kind"in F)return F;let S=g(t.FRAGMENT_SHADER,y);if(typeof S=="object"&&"kind"in S)return S;let _=t.createProgram();return t.attachShader(_,F),t.attachShader(_,S),t.linkProgram(_),t.getProgramParameter(_,t.LINK_STATUS)?(T.push(_),_):R("PROGRAM_LINK_FAILED",t.getProgramInfoLog(_)??"(no log)")},bindTarget(E){t.bindFramebuffer(t.FRAMEBUFFER,E?E.framebuffer:null),t.viewport(0,0,E?E.width:f.w,E?E.height:f.h)},blit(E,y){t.useProgram(E),t.bindVertexArray(c),y?.(E),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null)},dispose(){for(let E of T)t.deleteProgram(E);for(let E of[l,d,h])"kind"in E||(t.deleteFramebuffer(E.framebuffer),t.deleteTexture(E.texture));t.deleteBuffer(p),t.deleteVertexArray(c)}}}var q=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function Z(n,r){let t=new Float32Array(16);for(let e=0;e<4;e++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=n[i*4+o]*r[e*4+i];t[e*4+o]=a}return t}var V=(n,r)=>[n[0]-r[0],n[1]-r[1],n[2]-r[2]],Q=(n,r)=>n[0]*r[0]+n[1]*r[1]+n[2]*r[2],k=(n,r)=>[n[1]*r[2]-n[2]*r[1],n[2]*r[0]-n[0]*r[2],n[0]*r[1]-n[1]*r[0]];function D(n){let r=Math.hypot(n[0],n[1],n[2]);return r===0?n:[n[0]/r,n[1]/r,n[2]/r]}function he(n,r,t,e){let o=1/Math.tan(n/2);return new Float32Array([o/r,0,0,0,0,o,0,0,0,0,(e+t)/(t-e),-1,0,0,2*e*t/(t-e),0])}function pe(n,r,t,e,o,a){let i=r-n,u=e-t,s=a-o;return new Float32Array([2/i,0,0,0,0,2/u,0,0,0,0,-2/s,0,-(r+n)/i,-(e+t)/u,-(a+o)/s,1])}function J(n,r,t){let e=D(V(n,r)),o=k(t,e);if(Math.hypot(o[0],o[1],o[2])<1e-8)return q();let a=D(o),i=k(e,a);return new Float32Array([a[0],i[0],e[0],0,a[1],i[1],e[1],0,a[2],i[2],e[2],0,-Q(a,n),-Q(i,n),-Q(e,n),1])}function Qe(n){return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4)}function Ee(n){return n<=.0031308?n*12.92:1.055*Math.pow(n,1/2.4)-.055}var gt=/^#?([0-9a-fA-F]{6})$/;function X(n){let r=gt.exec(n.trim());if(!r)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(n)}`);let t=r[1];return[0,2,4].map(e=>Qe(parseInt(t.slice(e,e+2),16)/255))}function be(n){return`#${n.map(t=>{let e=Ee(Math.min(1,Math.max(0,t)));return Math.round(e*255).toString(16).padStart(2,"0")}).join("")}`}var H={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},Te=Object.freeze(Object.fromEntries(Object.keys(H).map(n=>[n,X(H[n])])));var qe=.4;var xe=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${qe.toFixed(2)}); }`,ge=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function ye(){let n=[];for(let r of Object.keys(H)){let t=H[r].toLowerCase(),e=be(Te[r]).toLowerCase();e!==t&&n.push({key:r,expected:t,actual:e})}return n}function yt(n){let r=[1/0,1/0,1/0],t=[-1/0,-1/0,-1/0];for(let e=0;e<n.length;e+=3)for(let o=0;o<3;o++){let a=n[e+o];a<r[o]&&(r[o]=a),a>t[o]&&(t[o]=a)}return n.length===0?{min:[0,0,0],max:[0,0,0]}:{min:r,max:t}}function Ze(n,r,t,e){let o=new Float32Array(n.length);for(let i=0;i<e.length;i+=3){let u=e[i],s=e[i+1],m=e[i+2],f=u*3,l=s*3,d=m*3,h=u*2,c=s*2,p=m*2,T=n[l]-n[f],x=n[l+1]-n[f+1],E=n[l+2]-n[f+2],y=n[d]-n[f],g=n[d+1]-n[f+1],F=n[d+2]-n[f+2],S=t[c]-t[h],_=t[c+1]-t[h+1],ce=t[p]-t[h],I=t[p+1]-t[h+1],U=S*I-ce*_;if(Math.abs(U)<1e-12)continue;let fe=1/U,bt=(T*I-y*_)*fe,Tt=(x*I-g*_)*fe,xt=(E*I-F*_)*fe;for(let G of[f,l,d])o[G]=o[G]+bt,o[G+1]=o[G+1]+Tt,o[G+2]=o[G+2]+xt}let a=new Float32Array(n.length);for(let i=0;i<a.length;i+=3){let u=r[i],s=r[i+1],m=r[i+2],f=o[i],l=o[i+1],d=o[i+2],h=f*u+l*s+d*m;f-=u*h,l-=s*h,d-=m*h;let c=Math.hypot(f,l,d);c<1e-8&&(Math.abs(u)<.9?(f=0,l=-m,d=s):(f=-m,l=0,d=u),c=Math.hypot(f,l,d)||1),a[i]=f/c,a[i+1]=l/c,a[i+2]=d/c}return a}function Je(n,r){let t=new Float32Array(n.length);for(let e=0;e<r.length;e+=3){let o=r[e]*3,a=r[e+1]*3,i=r[e+2]*3,u=n[a]-n[o],s=n[a+1]-n[o+1],m=n[a+2]-n[o+2],f=n[i]-n[o],l=n[i+1]-n[o+1],d=n[i+2]-n[o+2],h=s*d-m*l,c=m*f-u*d,p=u*l-s*f;for(let T of[o,a,i])t[T]=t[T]+h,t[T+1]=t[T+1]+c,t[T+2]=t[T+2]+p}for(let e=0;e<t.length;e+=3){let o=Math.hypot(t[e],t[e+1],t[e+2]);o>0&&(t[e]=t[e]/o,t[e+1]=t[e+1]/o,t[e+2]=t[e+2]/o)}return t}function Re(n,r,t,e,o){let{min:a,max:i}=yt(n),u=e??Je(n,t);return{positions:n,normals:u,uvs:r,indices:t,min:a,max:i,tangents:o??Ze(n,u,r,t)}}function Fe(n=1,r=1,t=1){let e=n/2,o=r/2,a=t/2,i=[[[-e,-o,a],[e,-o,a],[e,o,a],[-e,o,a]],[[e,-o,-a],[-e,-o,-a],[-e,o,-a],[e,o,-a]],[[e,-o,a],[e,-o,-a],[e,o,-a],[e,o,a]],[[-e,-o,-a],[-e,-o,a],[-e,o,a],[-e,o,-a]],[[-e,o,a],[e,o,a],[e,o,-a],[-e,o,-a]],[[-e,-o,-a],[e,-o,-a],[e,-o,a],[-e,-o,a]]],u=new Float32Array(72),s=new Float32Array(48),m=new Uint16Array(36),f=0,l=0,d=0,h=0;for(let c of i){for(let[p,T,x]of c)u[f++]=p,u[f++]=T,u[f++]=x;s[l++]=0,s[l++]=0,s[l++]=1,s[l++]=0,s[l++]=1,s[l++]=1,s[l++]=0,s[l++]=1,m[d++]=h,m[d++]=h+1,m[d++]=h+2,m[d++]=h,m[d++]=h+2,m[d++]=h+3,h+=4}return Re(u,s,m)}function Ae(n=10,r=24){let t=Math.max(1,Math.floor(r)),e=(t+1)*(t+1),o=new Float32Array(e*3),a=new Float32Array(e*3),i=new Float32Array(e*2),u=new Uint16Array(t*t*6),s=0,m=0,f=0;for(let l=0;l<=t;l++)for(let d=0;d<=t;d++){let h=(d/t-.5)*n,c=(l/t-.5)*n;o[s]=h,o[s+1]=0,o[s+2]=c,a[s]=0,a[s+1]=1,a[s+2]=0,s+=3,i[m++]=d/t,i[m++]=l/t}for(let l=0;l<t;l++)for(let d=0;d<t;d++){let h=l*(t+1)+d,c=h+1,p=h+(t+1),T=p+1;u[f++]=h,u[f++]=p,u[f++]=c,u[f++]=c,u[f++]=p,u[f++]=T}return Re(o,i,u,a)}function ve(n=.5,r=24,t=32){let e=Math.max(2,r),o=Math.max(3,t),a=(e+1)*(o+1),i=new Float32Array(a*3),u=new Float32Array(a*3),s=new Float32Array(a*2),m=new Uint16Array(e*o*6),f=0,l=0,d=0;for(let h=0;h<=e;h++){let c=h/e*Math.PI;for(let p=0;p<=o;p++){let T=p/o*Math.PI*2,x=Math.sin(c)*Math.cos(T),E=Math.cos(c),y=Math.sin(c)*Math.sin(T);i[f]=x*n,i[f+1]=E*n,i[f+2]=y*n,u[f]=x,u[f+1]=E,u[f+2]=y,f+=3,s[l++]=p/o,s[l++]=h/e}}for(let h=0;h<e;h++)for(let c=0;c<o;c++){let p=h*(o+1)+c,T=p+1,x=p+(o+1),E=x+1;m[d++]=p,m[d++]=T,m[d++]=x,m[d++]=T,m[d++]=E,m[d++]=x}return Re(i,s,m,u)}function z(n){return n.indices.length/3}var Me=89,Se=Math.PI/180;function N(n){let r=Math.max(-Me,Math.min(Me,n.elevationDeg))*Se,t=n.azimuthDeg*Se,e=Math.max(1e-4,n.distance),o=Math.sin(r)*e,a=Math.cos(r)*e;return[n.target[0]+Math.sin(t)*a,n.target[1]+o,n.target[2]+Math.cos(t)*a]}function W(n,r){let t=N(n),e=n.near??Math.max(.01,n.distance/100),o=n.far??Math.max(e+1,n.distance*8),a=he((n.fovDeg??38)*Se,Math.max(.001,r),e,o),i=J(t,n.target,[0,1,0]);return Z(a,i)}function _e(n,r,t){let e=D(n.direction),o=n.extent??Math.max(.1,t*1.35),a=Math.max(1,t*2),i=[r[0]-e[0]*a,r[1]-e[1]*a,r[2]-e[2]*a],u=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],s=J(i,r,u),m=pe(-o,o,-o,o,.01,a+t*2+o);return Z(m,s)}function Le(n,r){let t=V([r[0],r[1],r[2]],[n[0],n[1],n[2]]);return Math.hypot(t[0],t[1],t[2])/2}function De(n,r){return[(n[0]+r[0])/2,(n[1]+r[1])/2,(n[2]+r[2])/2]}function we(n,r,t){let{gl:e}=n,o=Math.max(1,Math.floor(r)),a=Math.max(1,Math.floor(t)),i=e.createFramebuffer(),u=e.createTexture(),s=e.createTexture();if(!i||!u||!s)return R("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let m=n.hdr?e.RGBA16F:e.RGBA8,f=n.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,l=()=>{e.bindTexture(e.TEXTURE_2D,u),e.texImage2D(e.TEXTURE_2D,0,m,o,a,0,e.RGBA,f,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,s),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,o,a,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,u,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,s,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};l(),e.bindFramebuffer(e.FRAMEBUFFER,i);let d=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),d!==e.FRAMEBUFFER_COMPLETE?R("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${d.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:u,depthTexture:s,get width(){return o},get height(){return a},bind(){e.bindFramebuffer(e.FRAMEBUFFER,i),e.viewport(0,0,o,a)},resize(h,c){let p=Math.max(1,Math.floor(h)),T=Math.max(1,Math.floor(c));p===o&&T===a||(o=p,a=T,l())},dispose(){e.deleteFramebuffer(i),e.deleteTexture(u),e.deleteTexture(s)}}}function Ue(n,r=1024){let{gl:t}=n,e=Math.max(256,Math.min(2048,Math.floor(r))),o=t.createFramebuffer(),a=t.createTexture();if(!o||!a)return R("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");t.bindTexture(t.TEXTURE_2D,a),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,e,e,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,o),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,a,0);let i=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),i!==t.FRAMEBUFFER_COMPLETE?R("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:e,bind(){t.bindFramebuffer(t.FRAMEBUFFER,o),t.viewport(0,0,e,e)},dispose(){t.deleteFramebuffer(o),t.deleteTexture(a)}}}var te=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,ee={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function re(n,r,t={}){let e=t.zenith??ee.zenith,o=t.horizon??ee.horizon,a=t.ground??ee.ground;n.uniform3f(n.getUniformLocation(r,"uSkyZenith"),e[0],e[1],e[2]),n.uniform3f(n.getUniformLocation(r,"uSkyHorizon"),o[0],o[1],o[2]),n.uniform3f(n.getUniformLocation(r,"uSkyGround"),a[0],a[1],a[2])}var Rt=`#version 300 es
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
${te}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;function Pe(n){let{gl:r}=n,t=n.compile(Rt,Ft);return"kind"in t?t:{draw(e){let o=D(V(e.target,e.eye)),a=Math.abs(o[1])>.999?[0,0,1]:[0,1,0],i=D(k(o,a)),u=D(k(i,o));r.disable(r.DEPTH_TEST),r.depthMask(!1),r.disable(r.BLEND),r.useProgram(t),r.uniform3f(r.getUniformLocation(t,"uRight"),i[0],i[1],i[2]),r.uniform3f(r.getUniformLocation(t,"uUp"),u[0],u[1],u[2]),r.uniform3f(r.getUniformLocation(t,"uForward"),o[0],o[1],o[2]),r.uniform1f(r.getUniformLocation(t,"uTanHalfFov"),Math.tan(e.fovDeg*Math.PI/360)),r.uniform1f(r.getUniformLocation(t,"uAspect"),Math.max(.001,e.aspect)),re(r,t,e.sky),n.blit(t),r.depthMask(!0),r.enable(r.DEPTH_TEST)},dispose(){r.deleteProgram(t)}}}var et=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,Ne=`#version 300 es
precision highp float;
void main(){}`,At=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,tt=`#version 300 es
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
}`,rt=`#version 300 es
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
${te}

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
}`;function Be(n,r){let{gl:t}=n,e=t.createVertexArray(),o=t.createBuffer(),a=t.createBuffer(),i=t.createBuffer(),u=t.createBuffer();return!e||!o||!a||!i||!u?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(t.bindVertexArray(e),t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,r.positions,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,a),t.bufferData(t.ARRAY_BUFFER,r.normals,t.STATIC_DRAW),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,i),t.bufferData(t.ARRAY_BUFFER,r.tangents,t.STATIC_DRAW),t.enableVertexAttribArray(2),t.vertexAttribPointer(2,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,u),t.bufferData(t.ELEMENT_ARRAY_BUFFER,r.indices,t.STATIC_DRAW),t.bindVertexArray(null),{vao:e,indexCount:r.indices.length,indexType:r.indices instanceof Uint32Array?t.UNSIGNED_INT:t.UNSIGNED_SHORT,dispose(){t.deleteVertexArray(e),t.deleteBuffer(o),t.deleteBuffer(a),t.deleteBuffer(i),t.deleteBuffer(u)}})}function Oe(n){let{gl:r}=n,t=n.compile(et,Ne);if("kind"in t)return t;let e=n.compile(tt,rt);if("kind"in e)return e;let o=n.compile(At,Ne);if("kind"in o)return o;let a=(i,u)=>r.getUniformLocation(i,u);return{shadowPass(i,u,s,m){let f=m??(()=>{});s.bind(),f("shadow.bind"),r.clear(r.DEPTH_BUFFER_BIT),r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.FRONT),r.useProgram(t),f("useProgram(shadow)"),r.uniformMatrix4fv(a(t,"uLightVP"),!1,i),f("uLightVP");for(let l of u)r.uniformMatrix4fv(a(t,"uModel"),!1,l.model),f("shadow uModel"),r.bindVertexArray(l.mesh.vao),f("shadow bindVAO"),r.drawElements(r.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0),f("shadow drawElements");r.bindVertexArray(null),r.cullFace(r.BACK)},depthPrepass(i,u){r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.colorMask(!1,!1,!1,!1),r.useProgram(o),r.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let s of u)r.uniformMatrix4fv(a(o,"uModel"),!1,s.model),r.bindVertexArray(s.mesh.vao),r.drawElements(r.TRIANGLES,s.mesh.indexCount,s.mesh.indexType,0);r.bindVertexArray(null),r.colorMask(!0,!0,!0,!0)},draw(i){let u=i.onStep??(()=>{});if(r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.useProgram(e),r.uniformMatrix4fv(a(e,"uViewProj"),!1,i.viewProj),u("uViewProj"),r.uniform3fv(a(e,"uEye"),i.eye),u("uEye"),r.uniform3fv(a(e,"uLightDir"),i.lightDir),u("uLightDir"),r.uniform3fv(a(e,"uLightColour"),i.lightColour),u("uLightColour"),r.uniform1f(a(e,"uAmbientGain"),i.ambientGain??1),u("uAmbientGain"),i.fog&&i.fog.density>0){r.uniform1f(a(e,"uFogDensity"),i.fog.density),r.uniform1f(a(e,"uFogHeight"),i.fog.height),r.uniform1f(a(e,"uFogFloor"),i.fog.floor??0);let s=i.fog.colour;s==="sky"?r.uniform3f(a(e,"uFogColour"),-1,-1,-1):r.uniform3f(a(e,"uFogColour"),s[0],s[1],s[2]),u("fog")}else r.uniform1f(a(e,"uFogDensity"),0);re(r,e,i.sky),u("bindSky"),i.ao&&i.screenSize?(r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,i.ao),r.uniform1i(a(e,"uAO"),1),r.uniform2f(a(e,"uScreenSize"),i.screenSize[0],i.screenSize[1]),r.uniform1f(a(e,"uAOEnabled"),1)):r.uniform1f(a(e,"uAOEnabled"),0),u("bindAO"),r.uniformMatrix4fv(a(e,"uLightVP"),!1,i.lightVP),u("lit uLightVP"),i.shadow?(r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,i.shadow.depthTexture),r.uniform1i(a(e,"uShadowMap"),0),r.uniform1f(a(e,"uShadowTexel"),1/i.shadow.size),r.uniform1f(a(e,"uShadowStrength"),i.shadowStrength??1)):r.uniform1f(a(e,"uShadowStrength"),0);for(let s of i.draws)r.uniformMatrix4fv(a(e,"uModel"),!1,s.model),r.uniformMatrix3fv(a(e,"uNormalMat"),!1,s.normalMat),u("uNormalMat"),r.uniform3fv(a(e,"uBaseColour"),s.material.baseColour),u("uBaseColour"),r.uniform1f(a(e,"uRoughness"),s.material.roughness),r.uniform1f(a(e,"uMetalness"),s.material.metalness),r.uniform1f(a(e,"uAnisotropy"),s.material.anisotropy??0),r.bindVertexArray(s.mesh.vao),u("lit bindVAO"),r.drawElements(r.TRIANGLES,s.mesh.indexCount,s.mesh.indexType,0),u("lit drawElements");r.bindVertexArray(null),r.disable(r.CULL_FACE)},dispose(){r.deleteProgram(t),r.deleteProgram(e),r.deleteProgram(o)}}}var j=`
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
}`,nt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,vt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${j}

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
}`,Mt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${j}

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
}`;function Ce(n,r,t){let{gl:e}=n,o=n.compile(nt,vt);if("kind"in o)return o;let a=n.compile(nt,Mt);if("kind"in a)return a;let i=Math.max(1,r>>1),u=Math.max(1,t>>1),s=()=>{let c=e.createFramebuffer(),p=e.createTexture();return!c||!p?null:{fb:c,tex:p}},m=s(),f=s();if(!m||!f)return R("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let l=()=>{for(let c of[m,f])e.bindTexture(e.TEXTURE_2D,c.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,i,u,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,c.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,c.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};l(),e.bindFramebuffer(e.FRAMEBUFFER,m.fb);let d=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),d!==e.FRAMEBUFFER_COMPLETE)return R("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${d.toString(16)}).`);let h=(c,p,T,x,E,y,g)=>{e.activeTexture(e.TEXTURE0+g),e.bindTexture(e.TEXTURE_2D,p),e.uniform1i(e.getUniformLocation(c,"uDepth"),g),e.uniform2f(e.getUniformLocation(c,"uNearFar"),T,x),e.uniform1f(e.getUniformLocation(c,"uTanHalfFov"),Math.tan(E*Math.PI/360)),e.uniform1f(e.getUniformLocation(c,"uAspect"),y)};return{get texture(){return m.tex},get width(){return i},get height(){return u},compute(c){e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,m.fb),e.viewport(0,0,i,u),e.useProgram(o),h(o,c.depthTexture,c.near,c.far,c.fovDeg,c.aspect,0),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/i,1/u),e.uniform1f(e.getUniformLocation(o,"uRadius"),c.radius??.55),e.uniform1f(e.getUniformLocation(o,"uStrength"),c.strength??1.15),e.uniform1f(e.getUniformLocation(o,"uBias"),c.bias??.035),n.blit(o);for(let[p,T,x]of[[m,f,[1,0]],[f,m,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,T.fb),e.viewport(0,0,i,u),e.useProgram(a),h(a,c.depthTexture,c.near,c.far,c.fovDeg,c.aspect,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,p.tex),e.uniform1i(e.getUniformLocation(a,"uAO"),1),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/i,1/u),e.uniform2f(e.getUniformLocation(a,"uDir"),x[0],x[1]),n.blit(a);e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(c,p){let T=Math.max(1,c>>1),x=Math.max(1,p>>1);T===i&&x===u||(i=T,u=x,l())},dispose(){e.deleteProgram(o),e.deleteProgram(a);for(let c of[m,f])e.deleteFramebuffer(c.fb),e.deleteTexture(c.tex)}}}var St=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,_t=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uFocusDistance;
uniform float uAperture;
uniform float uMaxCoc;
out vec4 frag;
${j}

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
}`;function Ie(n,r,t){let{gl:e}=n,o=n.compile(St,_t);if("kind"in o)return o;let a=Math.max(1,Math.floor(r)),i=Math.max(1,Math.floor(t)),u=e.createFramebuffer(),s=e.createTexture();if(!u||!s)return R("FRAMEBUFFER_INCOMPLETE","The GPU refused a depth-of-field buffer.");let m=()=>{e.bindTexture(e.TEXTURE_2D,s);let l=n.hdr?e.RGBA16F:e.RGBA8,d=n.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE;e.texImage2D(e.TEXTURE_2D,0,l,a,i,0,e.RGBA,d,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,u),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,s,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};m(),e.bindFramebuffer(e.FRAMEBUFFER,u);let f=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),f!==e.FRAMEBUFFER_COMPLETE?R("FRAMEBUFFER_INCOMPLETE",`The DOF buffer is incomplete (0x${f.toString(16)}).`):{texture:s,apply(l){e.bindFramebuffer(e.FRAMEBUFFER,u),e.viewport(0,0,a,i),e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.useProgram(o),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,l.scene),e.uniform1i(e.getUniformLocation(o,"uScene"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,l.depthTexture),e.uniform1i(e.getUniformLocation(o,"uDepth"),1),e.uniform2f(e.getUniformLocation(o,"uNearFar"),l.near,l.far),e.uniform1f(e.getUniformLocation(o,"uTanHalfFov"),Math.tan(l.fovDeg*Math.PI/360)),e.uniform1f(e.getUniformLocation(o,"uAspect"),l.aspect),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/a,1/i),e.uniform1f(e.getUniformLocation(o,"uFocusDistance"),l.focusDistance),e.uniform1f(e.getUniformLocation(o,"uAperture"),l.aperture??12),e.uniform1f(e.getUniformLocation(o,"uMaxCoc"),l.maxCoc??.012),n.blit(o),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(l,d){let h=Math.max(1,Math.floor(l)),c=Math.max(1,Math.floor(d));h===a&&c===i||(a=h,i=c,m())},dispose(){e.deleteProgram(o),e.deleteFramebuffer(u),e.deleteTexture(s)}}}var Ye=Math.max(1,Math.min(3,Number(new URLSearchParams(location.search).get("scale")??1))),v=1280*Ye,M=800*Ye,$e=document.getElementById("c");$e.width=v;$e.height=M;var Y=de($e,{alpha:!1});if(!me(Y))throw document.title="REFUSED",document.getElementById("log").textContent=`refused: ${Y.code} \u2014 ${Y.reason}`,new Error(Y.reason);var L=Y,b=L.gl,Lt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Dt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${xe}
${ge}
void main(){
  vec3 c = texture(uScene, vUv).rgb;
  frag = vec4(lcxEncode(lcxToneMap(c)), 1.0);
}`,ze=L.compile(Lt,Dt),B=Oe(L),w=we(L,v,M),O=Ue(L,1024),oe=Pe(L),ae=Ce(L,v,M),ie=Ie(L,v,M),P=n=>{throw document.title="REFUSED",document.getElementById("log").textContent=n,new Error(n)},C=n=>`${n.reason}
${n.detail??""}`;"kind"in ze&&P(`present: ${C(ze)}`);"kind"in B&&P(`lit: ${C(B)}`);"kind"in w&&P(`target: ${C(w)}`);"kind"in O&&P(`shadow: ${C(O)}`);"kind"in oe&&P(`sky: ${C(oe)}`);"kind"in ae&&P(`ao: ${C(ae)}`);"kind"in ie&&P(`dof: ${C(ie)}`);var it=Ae(14,24),ut=Fe(1.4,1.4,1.4),st=ve(.75,32,48),Ge=[it,ut,st].map(n=>{let r=Be(L,n);return"kind"in r&&P(`mesh: ${r.reason}`),r}),ke=(n,r,t)=>{let e=q();return e[12]=n,e[13]=r,e[14]=t,e},Ve=new Float32Array([1,0,0,0,1,0,0,0,1]),$=[{mesh:Ge[0],model:ke(0,0,0),normalMat:Ve,material:{baseColour:X("#0E1628"),roughness:.82,metalness:0}},{mesh:Ge[1],model:ke(-1.15,.7,0),normalMat:Ve,material:{baseColour:X("#2C6BFF"),roughness:.34,metalness:.05}},{mesh:Ge[2],model:ke(1.15,.75,.3),normalMat:Ve,material:{baseColour:X("#C9D4E4"),roughness:ft?.045:.18,metalness:.92}}],K={direction:[-.45,-1,-.35],colour:[3.4,3.3,3.05]},lt=[-7,0,-7],ct=[7,2.2,7],wt=De(lt,ct),ot=Le(lt,ct),ue=_e({...K,extent:ot*.8},wt,ot),A={target:[0,.6,0],distance:7.2,azimuthDeg:34,elevationDeg:22,fovDeg:36},ft=new URLSearchParams(location.search).get("diag")==="1",We=new URLSearchParams(location.search).get("ao")!=="0",mt=new URLSearchParams(location.search).get("dof")!=="0",Ut={zenith:[1.6,.05,.05],horizon:[.05,.08,1.6],ground:[.05,1.2,.05]},se=ft?Ut:void 0,dt=Math.max(1,Number(new URLSearchParams(location.search).get("repeat")??1));function le(){let n=W(A,v/M),r=N(A);B.shadowPass(ue,$,O),w.bind(),b.clear(b.DEPTH_BUFFER_BIT),oe.draw({eye:r,target:A.target,fovDeg:A.fovDeg??36,aspect:v/M,sky:se});let t=Math.max(.01,A.distance/100),e=Math.max(t+1,A.distance*8);B.depthPrepass(n,$),We&&(ae.compute({depthTexture:w.depthTexture,near:t,far:e,fovDeg:A.fovDeg??36,aspect:v/M,radius:.6,strength:1.25}),w.bind());for(let a=0;a<dt;a++)B.draw({viewProj:n,eye:r,lightDir:K.direction,lightColour:K.colour,ambientGain:1,sky:se,lightVP:ue,shadow:O,shadowStrength:.92,draws:$,ao:We?ae.texture:null,screenSize:[v,M]});let o=w.texture;if(mt){let a=Math.hypot(r[0]-1.15,r[1]-.75,r[2]-.3);ie.apply({scene:w.texture,depthTexture:w.depthTexture,near:t,far:e,fovDeg:A.fovDeg??36,aspect:v/M,focusDistance:a,aperture:9,maxCoc:.01}),o=ie.texture}b.bindFramebuffer(b.FRAMEBUFFER,null),b.viewport(0,0,v,M),b.disable(b.DEPTH_TEST),b.activeTexture(b.TEXTURE0),b.bindTexture(b.TEXTURE_2D,o),L.blit(ze,a=>b.uniform1i(b.getUniformLocation(a,"uScene"),0))}le();function Pt(n){le();let r=new Uint8Array(4);b.readPixels(0,0,1,1,b.RGBA,b.UNSIGNED_BYTE,r);let t=performance.now();for(let e=0;e<n;e++)le();return b.readPixels(0,0,1,1,b.RGBA,b.UNSIGNED_BYTE,r),(performance.now()-t)/n}var ht=Number(new URLSearchParams(location.search).get("frames")??600),ne=(()=>{for(;b.getError()!==b.NO_ERROR;);let n=[],r=a=>{let i=b.getError();i!==b.NO_ERROR&&n.push(`${a}=0x${i.toString(16)}`)};B.shadowPass(ue,$,O,r),w.bind(),r("target.bind"),b.clear(b.DEPTH_BUFFER_BIT),r("clear"),oe.draw({eye:N(A),target:A.target,fovDeg:A.fovDeg??36,aspect:v/M,sky:se}),r("sky"),B.draw({viewProj:W(A,v/M),eye:N(A),lightDir:K.direction,lightColour:K.colour,ambientGain:1,sky:se,lightVP:ue,shadow:O,shadowStrength:.92,draws:$,onStep:r});let t=b.getError(),e=new Uint8Array(4);b.readPixels(v>>1,M>>2,1,1,b.RGBA,b.UNSIGNED_BYTE,e);let o=b.getError();return{centre:Array.from(e),afterDraw:t,afterRead:o,bad:n}})(),Nt=z(it)+z(ut)+z(st),He=Pt(Math.max(1,ht)),at=(()=>{let n=W(A,v/M),r=-1.15,t=1.4,e=0,o=n[0]*r+n[4]*t+n[8]*e+n[12],a=n[1]*r+n[5]*t+n[9]*e+n[13],i=n[3]*r+n[7]*t+n[11]*e+n[15];return{ndc:[Number((o/i).toFixed(3)),Number((a/i).toFixed(3))],w:Number(i.toFixed(3))}})(),je=ye();if(je.length>0){let n="BRAND FIDELITY FAILED \u2014 "+je.map(t=>`${t.key}: expected ${t.expected}, got ${t.actual}`).join("; ");document.title="REFUSED";let r=document.getElementById("log");throw r&&(r.textContent=n),new Error(n)}var pt=(()=>{let n=b.getExtension("WEBGL_debug_renderer_info");return n?String(b.getParameter(n.UNMASKED_RENDERER_WEBGL)):"unknown"})(),Xe=/swiftshader|llvmpipe|software/i.test(pt),Et={brandFidelity:je,hdr:L.hdr,eye:N(A).map(n=>Number(n.toFixed(2))),boxTopNdc:at.ndc,boxTopW:at.w,targetCentre:ne.centre,failingCalls:ne.bad,glAfterDraw:ne.afterDraw,glAfterRead:ne.afterRead,triangles:Nt,shadowMap:O.size,resolution:`${v}x${M}`,dprScale:Ye,aoEnabled:We,dofEnabled:mt,frames:ht,repeat:dt,msPerFrame:Number(He.toFixed(3)),fps:Math.round(1e3/He),renderer:pt,rendererClass:Xe?"software":"hardware",headroom:Xe?null:Number((16.6-He).toFixed(3)),headroomRefusal:Xe?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null};globalThis.E0=Et;document.getElementById("log").textContent=JSON.stringify(Et,null,2);le();document.title="READY";

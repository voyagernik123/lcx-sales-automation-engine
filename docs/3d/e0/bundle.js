var Qe={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected."};function R(n,r){return r===void 0?{kind:"refused",code:n,reason:Qe[n]}:{kind:"refused",code:n,reason:Qe[n],detail:r}}function ce(n){return n.kind==="stage"}function fe(n,r={}){let t=n.getContext("webgl2",{antialias:r.antialias??!1,alpha:r.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!t)return R("NO_WEBGL2");let e=t.getExtension("EXT_color_buffer_float"),o=n.width,a=n.height,i=e?t.RGBA16F:t.RGBA8,s=e?t.HALF_FLOAT:t.UNSIGNED_BYTE,u=(E,y)=>{let g=t.createTexture();t.bindTexture(t.TEXTURE_2D,g),t.texImage2D(t.TEXTURE_2D,0,i,E,y,0,t.RGBA,s,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);let F=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,F),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,g,0);let S=t.checkFramebufferStatus(t.FRAMEBUFFER);return S!==t.FRAMEBUFFER_COMPLETE?R("FRAMEBUFFER_INCOMPLETE",`status 0x${S.toString(16)} at ${E}\xD7${y}`):{texture:g,framebuffer:F,width:E,height:y}},d=r.bloomShift??2,f={w:o,h:a},l=u(o,a);if("kind"in l)return l;let m=u(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in m)return m;let p=u(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in p)return p;let c=t.createVertexArray();t.bindVertexArray(c);let h=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,h),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null);let T=[];return{kind:"stage",gl:t,cssWidth:n.clientWidth||o,cssHeight:n.clientHeight||a,hdr:!!e,get width(){return f.w},get height(){return f.h},get scene(){return l},get bloomA(){return m},get bloomB(){return p},setRegion(E,y){let g=Math.max(1,Math.round(E)),F=Math.max(1,Math.round(y));if(!(g===f.w&&F===f.h)){f={w:g,h:F};for(let S of[l,m,p])"kind"in S||(t.deleteFramebuffer(S.framebuffer),t.deleteTexture(S.texture));l=u(g,F),m=u(Math.max(1,g>>d),Math.max(1,F>>d)),p=u(Math.max(1,g>>d),Math.max(1,F>>d))}},compile(E,y){let g=(ue,C)=>{let U=t.createShader(ue);return t.shaderSource(U,C),t.compileShader(U),t.getShaderParameter(U,t.COMPILE_STATUS)?U:R("SHADER_COMPILE_FAILED",t.getShaderInfoLog(U)??"(no log)")},F=g(t.VERTEX_SHADER,E);if(typeof F=="object"&&"kind"in F)return F;let S=g(t.FRAGMENT_SHADER,y);if(typeof S=="object"&&"kind"in S)return S;let _=t.createProgram();return t.attachShader(_,F),t.attachShader(_,S),t.linkProgram(_),t.getProgramParameter(_,t.LINK_STATUS)?(T.push(_),_):R("PROGRAM_LINK_FAILED",t.getProgramInfoLog(_)??"(no log)")},bindTarget(E){t.bindFramebuffer(t.FRAMEBUFFER,E?E.framebuffer:null),t.viewport(0,0,E?E.width:f.w,E?E.height:f.h)},blit(E,y){t.useProgram(E),t.bindVertexArray(c),y?.(E),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null)},dispose(){for(let E of T)t.deleteProgram(E);for(let E of[l,m,p])"kind"in E||(t.deleteFramebuffer(E.framebuffer),t.deleteTexture(E.texture));t.deleteBuffer(h),t.deleteVertexArray(c)}}}var J=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function Z(n,r){let t=new Float32Array(16);for(let e=0;e<4;e++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=n[i*4+o]*r[e*4+i];t[e*4+o]=a}return t}var I=(n,r)=>[n[0]-r[0],n[1]-r[1],n[2]-r[2]],q=(n,r)=>n[0]*r[0]+n[1]*r[1]+n[2]*r[2],k=(n,r)=>[n[1]*r[2]-n[2]*r[1],n[2]*r[0]-n[0]*r[2],n[0]*r[1]-n[1]*r[0]];function w(n){let r=Math.hypot(n[0],n[1],n[2]);return r===0?n:[n[0]/r,n[1]/r,n[2]/r]}function de(n,r,t,e){let o=1/Math.tan(n/2);return new Float32Array([o/r,0,0,0,0,o,0,0,0,0,(e+t)/(t-e),-1,0,0,2*e*t/(t-e),0])}function me(n,r,t,e,o,a){let i=r-n,s=e-t,u=a-o;return new Float32Array([2/i,0,0,0,0,2/s,0,0,0,0,-2/u,0,-(r+n)/i,-(e+t)/s,-(a+o)/u,1])}function ee(n,r,t){let e=w(I(n,r)),o=k(t,e);if(Math.hypot(o[0],o[1],o[2])<1e-8)return J();let a=w(o),i=k(e,a);return new Float32Array([a[0],i[0],e[0],0,a[1],i[1],e[1],0,a[2],i[2],e[2],0,-q(a,n),-q(i,n),-q(e,n),1])}function Ke(n){return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4)}function pe(n){return n<=.0031308?n*12.92:1.055*Math.pow(n,1/2.4)-.055}var Mt=/^#?([0-9a-fA-F]{6})$/;function V(n){let r=Mt.exec(n.trim());if(!r)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(n)}`);let t=r[1];return[0,2,4].map(e=>Ke(parseInt(t.slice(e,e+2),16)/255))}function he(n){return`#${n.map(t=>{let e=pe(Math.min(1,Math.max(0,t)));return Math.round(e*255).toString(16).padStart(2,"0")}).join("")}`}var G={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},be=Object.freeze(Object.fromEntries(Object.keys(G).map(n=>[n,V(G[n])])));var qe=.4;var Ee=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${qe.toFixed(2)}); }`,Te=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function xe(){let n=[];for(let r of Object.keys(G)){let t=G[r].toLowerCase(),e=he(be[r]).toLowerCase();e!==t&&n.push({key:r,expected:t,actual:e})}return n}function St(n){let r=[1/0,1/0,1/0],t=[-1/0,-1/0,-1/0];for(let e=0;e<n.length;e+=3)for(let o=0;o<3;o++){let a=n[e+o];a<r[o]&&(r[o]=a),a>t[o]&&(t[o]=a)}return n.length===0?{min:[0,0,0],max:[0,0,0]}:{min:r,max:t}}function Je(n,r,t,e){let o=new Float32Array(n.length);for(let i=0;i<e.length;i+=3){let s=e[i],u=e[i+1],d=e[i+2],f=s*3,l=u*3,m=d*3,p=s*2,c=u*2,h=d*2,T=n[l]-n[f],x=n[l+1]-n[f+1],E=n[l+2]-n[f+2],y=n[m]-n[f],g=n[m+1]-n[f+1],F=n[m+2]-n[f+2],S=t[c]-t[p],_=t[c+1]-t[p+1],ue=t[h]-t[p],C=t[h+1]-t[p+1],U=S*C-ue*_;if(Math.abs(U)<1e-12)continue;let le=1/U,Ft=(T*C-y*_)*le,At=(x*C-g*_)*le,vt=(E*C-F*_)*le;for(let O of[f,l,m])o[O]=o[O]+Ft,o[O+1]=o[O+1]+At,o[O+2]=o[O+2]+vt}let a=new Float32Array(n.length);for(let i=0;i<a.length;i+=3){let s=r[i],u=r[i+1],d=r[i+2],f=o[i],l=o[i+1],m=o[i+2],p=f*s+l*u+m*d;f-=s*p,l-=u*p,m-=d*p;let c=Math.hypot(f,l,m);c<1e-8&&(Math.abs(s)<.9?(f=0,l=-d,m=u):(f=-d,l=0,m=s),c=Math.hypot(f,l,m)||1),a[i]=f/c,a[i+1]=l/c,a[i+2]=m/c}return a}function Ze(n,r){let t=new Float32Array(n.length);for(let e=0;e<r.length;e+=3){let o=r[e]*3,a=r[e+1]*3,i=r[e+2]*3,s=n[a]-n[o],u=n[a+1]-n[o+1],d=n[a+2]-n[o+2],f=n[i]-n[o],l=n[i+1]-n[o+1],m=n[i+2]-n[o+2],p=u*m-d*l,c=d*f-s*m,h=s*l-u*f;for(let T of[o,a,i])t[T]=t[T]+p,t[T+1]=t[T+1]+c,t[T+2]=t[T+2]+h}for(let e=0;e<t.length;e+=3){let o=Math.hypot(t[e],t[e+1],t[e+2]);o>0&&(t[e]=t[e]/o,t[e+1]=t[e+1]/o,t[e+2]=t[e+2]/o)}return t}function ge(n,r,t,e,o){let{min:a,max:i}=St(n),s=e??Ze(n,t);return{positions:n,normals:s,uvs:r,indices:t,min:a,max:i,tangents:o??Je(n,s,r,t)}}function ye(n=1,r=1,t=1){let e=n/2,o=r/2,a=t/2,i=[[[-e,-o,a],[e,-o,a],[e,o,a],[-e,o,a]],[[e,-o,-a],[-e,-o,-a],[-e,o,-a],[e,o,-a]],[[e,-o,a],[e,-o,-a],[e,o,-a],[e,o,a]],[[-e,-o,-a],[-e,-o,a],[-e,o,a],[-e,o,-a]],[[-e,o,a],[e,o,a],[e,o,-a],[-e,o,-a]],[[-e,-o,-a],[e,-o,-a],[e,-o,a],[-e,-o,a]]],s=new Float32Array(72),u=new Float32Array(48),d=new Uint16Array(36),f=0,l=0,m=0,p=0;for(let c of i){for(let[h,T,x]of c)s[f++]=h,s[f++]=T,s[f++]=x;u[l++]=0,u[l++]=0,u[l++]=1,u[l++]=0,u[l++]=1,u[l++]=1,u[l++]=0,u[l++]=1,d[m++]=p,d[m++]=p+1,d[m++]=p+2,d[m++]=p,d[m++]=p+2,d[m++]=p+3,p+=4}return ge(s,u,d)}function Re(n=10,r=24){let t=Math.max(1,Math.floor(r)),e=(t+1)*(t+1),o=new Float32Array(e*3),a=new Float32Array(e*3),i=new Float32Array(e*2),s=new Uint16Array(t*t*6),u=0,d=0,f=0;for(let l=0;l<=t;l++)for(let m=0;m<=t;m++){let p=(m/t-.5)*n,c=(l/t-.5)*n;o[u]=p,o[u+1]=0,o[u+2]=c,a[u]=0,a[u+1]=1,a[u+2]=0,u+=3,i[d++]=m/t,i[d++]=l/t}for(let l=0;l<t;l++)for(let m=0;m<t;m++){let p=l*(t+1)+m,c=p+1,h=p+(t+1),T=h+1;s[f++]=p,s[f++]=h,s[f++]=c,s[f++]=c,s[f++]=h,s[f++]=T}return ge(o,i,s,a)}function Fe(n=.5,r=24,t=32){let e=Math.max(2,r),o=Math.max(3,t),a=(e+1)*(o+1),i=new Float32Array(a*3),s=new Float32Array(a*3),u=new Float32Array(a*2),d=new Uint16Array(e*o*6),f=0,l=0,m=0;for(let p=0;p<=e;p++){let c=p/e*Math.PI;for(let h=0;h<=o;h++){let T=h/o*Math.PI*2,x=Math.sin(c)*Math.cos(T),E=Math.cos(c),y=Math.sin(c)*Math.sin(T);i[f]=x*n,i[f+1]=E*n,i[f+2]=y*n,s[f]=x,s[f+1]=E,s[f+2]=y,f+=3,u[l++]=h/o,u[l++]=p/e}}for(let p=0;p<e;p++)for(let c=0;c<o;c++){let h=p*(o+1)+c,T=h+1,x=h+(o+1),E=x+1;d[m++]=h,d[m++]=T,d[m++]=x,d[m++]=T,d[m++]=E,d[m++]=x}return ge(i,u,d,s)}function X(n){return n.indices.length/3}var Ae=["minimum","reduced","full"],_t={full:{dprScale:2,ao:!0,aoScale:.5,dof:!0,shadowMapSize:1536,shadowTaps:9,particleCapacity:4096,volumeMaxSteps:128,volumeLightSteps:6},reduced:{dprScale:2,ao:!0,aoScale:.5,dof:!1,shadowMapSize:1024,shadowTaps:9,particleCapacity:2048,volumeMaxSteps:96,volumeLightSteps:4},minimum:{dprScale:1,ao:!1,aoScale:.5,dof:!1,shadowMapSize:512,shadowTaps:1,particleCapacity:512,volumeMaxSteps:48,volumeLightSteps:0}};function ve(n){return{tier:n,..._t[n]}}var Me=89,Se=Math.PI/180;function N(n){let r=Math.max(-Me,Math.min(Me,n.elevationDeg))*Se,t=n.azimuthDeg*Se,e=Math.max(1e-4,n.distance),o=Math.sin(r)*e,a=Math.cos(r)*e;return[n.target[0]+Math.sin(t)*a,n.target[1]+o,n.target[2]+Math.cos(t)*a]}function z(n,r){let t=N(n),e=n.near??Math.max(.01,n.distance/100),o=n.far??Math.max(e+1,n.distance*8),a=de((n.fovDeg??38)*Se,Math.max(.001,r),e,o),i=ee(t,n.target,[0,1,0]);return Z(a,i)}function _e(n,r,t){let e=w(n.direction),o=n.extent??Math.max(.1,t*1.35),a=Math.max(1,t*2),i=[r[0]-e[0]*a,r[1]-e[1]*a,r[2]-e[2]*a],s=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],u=ee(i,r,s),d=me(-o,o,-o,o,.01,a+t*2+o);return Z(d,u)}function Le(n,r){let t=I([r[0],r[1],r[2]],[n[0],n[1],n[2]]);return Math.hypot(t[0],t[1],t[2])/2}function we(n,r){return[(n[0]+r[0])/2,(n[1]+r[1])/2,(n[2]+r[2])/2]}function De(n,r,t){let{gl:e}=n,o=Math.max(1,Math.floor(r)),a=Math.max(1,Math.floor(t)),i=e.createFramebuffer(),s=e.createTexture(),u=e.createTexture();if(!i||!s||!u)return R("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let d=n.hdr?e.RGBA16F:e.RGBA8,f=n.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,l=()=>{e.bindTexture(e.TEXTURE_2D,s),e.texImage2D(e.TEXTURE_2D,0,d,o,a,0,e.RGBA,f,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,u),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,o,a,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,s,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,u,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};l(),e.bindFramebuffer(e.FRAMEBUFFER,i);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE?R("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${m.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:s,depthTexture:u,get width(){return o},get height(){return a},bind(){e.bindFramebuffer(e.FRAMEBUFFER,i),e.viewport(0,0,o,a)},resize(p,c){let h=Math.max(1,Math.floor(p)),T=Math.max(1,Math.floor(c));h===o&&T===a||(o=h,a=T,l())},dispose(){e.deleteFramebuffer(i),e.deleteTexture(s),e.deleteTexture(u)}}}function Ue(n,r=1024){let{gl:t}=n,e=Math.max(256,Math.min(2048,Math.floor(r))),o=t.createFramebuffer(),a=t.createTexture();if(!o||!a)return R("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");t.bindTexture(t.TEXTURE_2D,a),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,e,e,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,o),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,a,0);let i=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),i!==t.FRAMEBUFFER_COMPLETE?R("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:e,bind(){t.bindFramebuffer(t.FRAMEBUFFER,o),t.viewport(0,0,e,e)},dispose(){t.deleteFramebuffer(o),t.deleteTexture(a)}}}var re=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,te={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function ne(n,r,t={}){let e=t.zenith??te.zenith,o=t.horizon??te.horizon,a=t.ground??te.ground;n.uniform3f(n.getUniformLocation(r,"uSkyZenith"),e[0],e[1],e[2]),n.uniform3f(n.getUniformLocation(r,"uSkyHorizon"),o[0],o[1],o[2]),n.uniform3f(n.getUniformLocation(r,"uSkyGround"),a[0],a[1],a[2])}var Lt=`#version 300 es
precision highp float;
out vec2 vNdc;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`,wt=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${re}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;function Pe(n){let{gl:r}=n,t=n.compile(Lt,wt);return"kind"in t?t:{draw(e){let o=w(I(e.target,e.eye)),a=Math.abs(o[1])>.999?[0,0,1]:[0,1,0],i=w(k(o,a)),s=w(k(i,o));r.disable(r.DEPTH_TEST),r.depthMask(!1),r.disable(r.BLEND),r.useProgram(t),r.uniform3f(r.getUniformLocation(t,"uRight"),i[0],i[1],i[2]),r.uniform3f(r.getUniformLocation(t,"uUp"),s[0],s[1],s[2]),r.uniform3f(r.getUniformLocation(t,"uForward"),o[0],o[1],o[2]),r.uniform1f(r.getUniformLocation(t,"uTanHalfFov"),Math.tan(e.fovDeg*Math.PI/360)),r.uniform1f(r.getUniformLocation(t,"uAspect"),Math.max(.001,e.aspect)),ne(r,t,e.sky),n.blit(t),r.depthMask(!0),r.enable(r.DEPTH_TEST)},dispose(){r.deleteProgram(t)}}}var et=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,Ne=`#version 300 es
precision highp float;
void main(){}`,Dt=`#version 300 es
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
${re}

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
}`;function Be(n,r){let{gl:t}=n,e=t.createVertexArray(),o=t.createBuffer(),a=t.createBuffer(),i=t.createBuffer(),s=t.createBuffer();return!e||!o||!a||!i||!s?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(t.bindVertexArray(e),t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,r.positions,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,a),t.bufferData(t.ARRAY_BUFFER,r.normals,t.STATIC_DRAW),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,i),t.bufferData(t.ARRAY_BUFFER,r.tangents,t.STATIC_DRAW),t.enableVertexAttribArray(2),t.vertexAttribPointer(2,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,s),t.bufferData(t.ELEMENT_ARRAY_BUFFER,r.indices,t.STATIC_DRAW),t.bindVertexArray(null),{vao:e,indexCount:r.indices.length,indexType:r.indices instanceof Uint32Array?t.UNSIGNED_INT:t.UNSIGNED_SHORT,dispose(){t.deleteVertexArray(e),t.deleteBuffer(o),t.deleteBuffer(a),t.deleteBuffer(i),t.deleteBuffer(s)}})}function Ce(n){let{gl:r}=n,t=n.compile(et,Ne);if("kind"in t)return t;let e=n.compile(tt,rt);if("kind"in e)return e;let o=n.compile(Dt,Ne);if("kind"in o)return o;let a=(i,s)=>r.getUniformLocation(i,s);return{shadowPass(i,s,u,d){let f=d??(()=>{});u.bind(),f("shadow.bind"),r.clear(r.DEPTH_BUFFER_BIT),r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.FRONT),r.useProgram(t),f("useProgram(shadow)"),r.uniformMatrix4fv(a(t,"uLightVP"),!1,i),f("uLightVP");for(let l of s)r.uniformMatrix4fv(a(t,"uModel"),!1,l.model),f("shadow uModel"),r.bindVertexArray(l.mesh.vao),f("shadow bindVAO"),r.drawElements(r.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0),f("shadow drawElements");r.bindVertexArray(null),r.cullFace(r.BACK)},depthPrepass(i,s){r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.colorMask(!1,!1,!1,!1),r.useProgram(o),r.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let u of s)r.uniformMatrix4fv(a(o,"uModel"),!1,u.model),r.bindVertexArray(u.mesh.vao),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0);r.bindVertexArray(null),r.colorMask(!0,!0,!0,!0)},draw(i){let s=i.onStep??(()=>{});if(r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.useProgram(e),r.uniformMatrix4fv(a(e,"uViewProj"),!1,i.viewProj),s("uViewProj"),r.uniform3fv(a(e,"uEye"),i.eye),s("uEye"),r.uniform3fv(a(e,"uLightDir"),i.lightDir),s("uLightDir"),r.uniform3fv(a(e,"uLightColour"),i.lightColour),s("uLightColour"),r.uniform1f(a(e,"uAmbientGain"),i.ambientGain??1),s("uAmbientGain"),i.fog&&i.fog.density>0){r.uniform1f(a(e,"uFogDensity"),i.fog.density),r.uniform1f(a(e,"uFogHeight"),i.fog.height),r.uniform1f(a(e,"uFogFloor"),i.fog.floor??0);let u=i.fog.colour;u==="sky"?r.uniform3f(a(e,"uFogColour"),-1,-1,-1):r.uniform3f(a(e,"uFogColour"),u[0],u[1],u[2]),s("fog")}else r.uniform1f(a(e,"uFogDensity"),0);ne(r,e,i.sky),s("bindSky"),i.ao&&i.screenSize?(r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,i.ao),r.uniform1i(a(e,"uAO"),1),r.uniform2f(a(e,"uScreenSize"),i.screenSize[0],i.screenSize[1]),r.uniform1f(a(e,"uAOEnabled"),1)):r.uniform1f(a(e,"uAOEnabled"),0),s("bindAO"),r.uniformMatrix4fv(a(e,"uLightVP"),!1,i.lightVP),s("lit uLightVP"),i.shadow?(r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,i.shadow.depthTexture),r.uniform1i(a(e,"uShadowMap"),0),r.uniform1f(a(e,"uShadowTexel"),1/i.shadow.size),r.uniform1f(a(e,"uShadowStrength"),i.shadowStrength??1)):r.uniform1f(a(e,"uShadowStrength"),0);for(let u of i.draws)r.uniformMatrix4fv(a(e,"uModel"),!1,u.model),r.uniformMatrix3fv(a(e,"uNormalMat"),!1,u.normalMat),s("uNormalMat"),r.uniform3fv(a(e,"uBaseColour"),u.material.baseColour),s("uBaseColour"),r.uniform1f(a(e,"uRoughness"),u.material.roughness),r.uniform1f(a(e,"uMetalness"),u.material.metalness),r.uniform1f(a(e,"uAnisotropy"),u.material.anisotropy??0),r.bindVertexArray(u.mesh.vao),s("lit bindVAO"),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0),s("lit drawElements");r.bindVertexArray(null),r.disable(r.CULL_FACE)},dispose(){r.deleteProgram(t),r.deleteProgram(e),r.deleteProgram(o)}}}var j=`
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
}`,Ut=`#version 300 es
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
}`,Pt=`#version 300 es
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
}`;function Oe(n,r,t){let{gl:e}=n,o=n.compile(nt,Ut);if("kind"in o)return o;let a=n.compile(nt,Pt);if("kind"in a)return a;let i=Math.max(1,r>>1),s=Math.max(1,t>>1),u=()=>{let c=e.createFramebuffer(),h=e.createTexture();return!c||!h?null:{fb:c,tex:h}},d=u(),f=u();if(!d||!f)return R("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let l=()=>{for(let c of[d,f])e.bindTexture(e.TEXTURE_2D,c.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,i,s,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,c.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,c.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};l(),e.bindFramebuffer(e.FRAMEBUFFER,d.fb);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE)return R("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${m.toString(16)}).`);let p=(c,h,T,x,E,y,g)=>{e.activeTexture(e.TEXTURE0+g),e.bindTexture(e.TEXTURE_2D,h),e.uniform1i(e.getUniformLocation(c,"uDepth"),g),e.uniform2f(e.getUniformLocation(c,"uNearFar"),T,x),e.uniform1f(e.getUniformLocation(c,"uTanHalfFov"),Math.tan(E*Math.PI/360)),e.uniform1f(e.getUniformLocation(c,"uAspect"),y)};return{get texture(){return d.tex},get width(){return i},get height(){return s},compute(c){e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,d.fb),e.viewport(0,0,i,s),e.useProgram(o),p(o,c.depthTexture,c.near,c.far,c.fovDeg,c.aspect,0),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/i,1/s),e.uniform1f(e.getUniformLocation(o,"uRadius"),c.radius??.55),e.uniform1f(e.getUniformLocation(o,"uStrength"),c.strength??1.15),e.uniform1f(e.getUniformLocation(o,"uBias"),c.bias??.035),n.blit(o);for(let[h,T,x]of[[d,f,[1,0]],[f,d,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,T.fb),e.viewport(0,0,i,s),e.useProgram(a),p(a,c.depthTexture,c.near,c.far,c.fovDeg,c.aspect,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,h.tex),e.uniform1i(e.getUniformLocation(a,"uAO"),1),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/i,1/s),e.uniform2f(e.getUniformLocation(a,"uDir"),x[0],x[1]),n.blit(a);e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(c,h){let T=Math.max(1,c>>1),x=Math.max(1,h>>1);T===i&&x===s||(i=T,s=x,l())},dispose(){e.deleteProgram(o),e.deleteProgram(a);for(let c of[d,f])e.deleteFramebuffer(c.fb),e.deleteTexture(c.tex)}}}var Nt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Bt=`#version 300 es
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
}`;function ke(n,r,t){let{gl:e}=n,o=n.compile(Nt,Bt);if("kind"in o)return o;let a=Math.max(1,Math.floor(r)),i=Math.max(1,Math.floor(t)),s=e.createFramebuffer(),u=e.createTexture();if(!s||!u)return R("FRAMEBUFFER_INCOMPLETE","The GPU refused a depth-of-field buffer.");let d=()=>{e.bindTexture(e.TEXTURE_2D,u);let l=n.hdr?e.RGBA16F:e.RGBA8,m=n.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE;e.texImage2D(e.TEXTURE_2D,0,l,a,i,0,e.RGBA,m,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,s),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,u,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};d(),e.bindFramebuffer(e.FRAMEBUFFER,s);let f=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),f!==e.FRAMEBUFFER_COMPLETE?R("FRAMEBUFFER_INCOMPLETE",`The DOF buffer is incomplete (0x${f.toString(16)}).`):{texture:u,apply(l){e.bindFramebuffer(e.FRAMEBUFFER,s),e.viewport(0,0,a,i),e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.useProgram(o),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,l.scene),e.uniform1i(e.getUniformLocation(o,"uScene"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,l.depthTexture),e.uniform1i(e.getUniformLocation(o,"uDepth"),1),e.uniform2f(e.getUniformLocation(o,"uNearFar"),l.near,l.far),e.uniform1f(e.getUniformLocation(o,"uTanHalfFov"),Math.tan(l.fovDeg*Math.PI/360)),e.uniform1f(e.getUniformLocation(o,"uAspect"),l.aspect),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/a,1/i),e.uniform1f(e.getUniformLocation(o,"uFocusDistance"),l.focusDistance),e.uniform1f(e.getUniformLocation(o,"uAperture"),l.aperture??12),e.uniform1f(e.getUniformLocation(o,"uMaxCoc"),l.maxCoc??.012),n.blit(o),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(l,m){let p=Math.max(1,Math.floor(l)),c=Math.max(1,Math.floor(m));p===a&&c===i||(a=p,i=c,d())},dispose(){e.deleteProgram(o),e.deleteFramebuffer(s),e.deleteTexture(u)}}}var Ct=`
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
`;function ot(n){let r=document.createElement("style");r.textContent=Ct,document.head.appendChild(r);let t=document.createElement("section");t.id="lcx-fallback";let e=(o,a)=>{if(o===null)return`<td class="absent${a?" n":""}">absent</td>`;let i=String(o).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");return`<td class="${a?"n":""}">${i}</td>`};return t.innerHTML=`<h2>${n.title} \u2014 flat view</h2><p class="reads">${n.readsAs}</p>`+(n.notices??[]).map(o=>`<p class="notice">${o}</p>`).join("")+'<div id="lcx-refusal"></div>'+(n.html?`<div class="surface">${n.html}</div>`:"<table><thead><tr>"+n.columns.map(o=>`<th class="${o.numeric?"n":""}">${o.label}</th>`).join("")+"</tr></thead><tbody>"+n.rows.map(o=>"<tr>"+n.columns.map(a=>e(o[a.key]??null,!!a.numeric)).join("")+"</tr>").join("")+"</tbody></table>"),document.body.appendChild(t),{markRendered(){t.dataset.rendered="1"},showRefusal(o,a){let i=document.getElementById("lcx-refusal");i&&(i.innerHTML=`<p class="refusal"><strong>${o}</strong> \u2014 ${a} The measurements below are unaffected.</p>`),delete t.dataset.rendered;for(let s of Array.from(document.querySelectorAll("canvas")))s.style.display="none"}}}var D=new URLSearchParams(location.search),Ot=Ae.includes(D.get("tier")??"")?D.get("tier"):"full",H=ve(Ot),We=Math.max(1,Math.min(3,Number(D.get("scale")??1))),v=1280*We,M=800*We,$e=D.get("diag")==="1",kt=D.get("refuse")==="1",Ye=document.getElementById("c");Ye.width=v;Ye.height=M;function lt(n){document.title="REFUSED";let r=document.getElementById("log");r&&(r.textContent=n);let[t,...e]=n.split(":");throw ct?.showRefusal(t?.trim()??"REFUSED",e.join(":").trim()||n),new Error(n)}var ct=null;function P(n,r){return"kind"in r&&lt(`${n}: ${r.code} \u2014 ${r.reason} ${r.detail??""}`),r}var ft=ot({title:"E0 \xB7 The Spike \u2014 material study",readsAs:"The rendered view is the evidence: GGX with a Smith visibility term, a shadow map, ambient occlusion and a gathered depth of field, at a measured cost. The table below states what each surface in that frame is set to, which is what the capture is evidence for.",notices:["A study, not a data surface \u2014 there is no measurement in this frame to lose."],columns:[{key:"object",label:"Object"},{key:"hex",label:"Base colour"},{key:"roughness",label:"Roughness",numeric:!0},{key:"metalness",label:"Metalness",numeric:!0}],rows:[{object:"Deck plate",hex:"#0E1628",roughness:.82,metalness:0},{object:"Brand-blue dielectric sphere",hex:"#2C6BFF",roughness:.34,metalness:.05},{object:"Metal sphere",hex:"#C9D4E4",roughness:$e?.045:.18,metalness:.92}]});ct=ft;kt&&lt("FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. The three-dimensional view is not being drawn.");var W=fe(Ye,{alpha:!1});if(!ce(W))throw document.title="REFUSED",document.getElementById("log").textContent=`refused: ${W.code} \u2014 ${W.reason}`,new Error(W.reason);var L=W,b=L.gl,It=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Gt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${Ee}
${Te}
void main(){
  vec3 c = texture(uScene, vUv).rgb;
  frag = vec4(lcxEncode(lcxToneMap(c)), 1.0);
}`,Vt=P("present",L.compile(It,Gt)),$=P("lit",Ce(L)),B=P("target",De(L,v,M)),Q=P("shadow",Ue(L,H.shadowMapSize)),dt=P("skyBox",Pe(L)),at=P("ao",Oe(L,v,M)),it=P("dof",ke(L,v,M)),mt=Re(14,24),pt=ye(1.4,1.4,1.4),ht=Fe(.75,32,48),Ie=[mt,pt,ht].map((n,r)=>P(`mesh ${r}`,Be(L,n))),Ge=(n,r,t)=>{let e=J();return e[12]=n,e[13]=r,e[14]=t,e},Ve=new Float32Array([1,0,0,0,1,0,0,0,1]),Y=[{mesh:Ie[0],model:Ge(0,0,0),normalMat:Ve,material:{baseColour:V("#0E1628"),roughness:.82,metalness:0}},{mesh:Ie[1],model:Ge(-1.15,.7,0),normalMat:Ve,material:{baseColour:V("#2C6BFF"),roughness:.34,metalness:.05}},{mesh:Ie[2],model:Ge(1.15,.75,.3),normalMat:Ve,material:{baseColour:V("#C9D4E4"),roughness:$e?.045:.18,metalness:.92}}],K={direction:[-.45,-1,-.35],colour:[3.4,3.3,3.05]},bt=[-7,0,-7],Et=[7,2.2,7],Ht=we(bt,Et),st=Le(bt,Et),ae=_e({...K,extent:st*.8},Ht,st),A={target:[0,.6,0],distance:7.2,azimuthDeg:34,elevationDeg:22,fovDeg:36},ze=D.get("ao")!=="0"&&H.ao,Tt=D.get("dof")!=="0"&&H.dof,Xt={zenith:[1.6,.05,.05],horizon:[.05,.08,1.6],ground:[.05,1.2,.05]},ie=$e?Xt:void 0,xt=Math.max(1,Number(D.get("repeat")??1));function se(){let n=z(A,v/M),r=N(A);$.shadowPass(ae,Y,Q),B.bind(),b.clear(b.DEPTH_BUFFER_BIT),dt.draw({eye:r,target:A.target,fovDeg:A.fovDeg??36,aspect:v/M,sky:ie});let t=Math.max(.01,A.distance/100),e=Math.max(t+1,A.distance*8);$.depthPrepass(n,Y),ze&&(at.compute({depthTexture:B.depthTexture,near:t,far:e,fovDeg:A.fovDeg??36,aspect:v/M,radius:.6,strength:1.25}),B.bind());for(let a=0;a<xt;a++)$.draw({viewProj:n,eye:r,lightDir:K.direction,lightColour:K.colour,ambientGain:1,sky:ie,lightVP:ae,shadow:Q,shadowStrength:.92,draws:Y,ao:ze?at.texture:null,screenSize:[v,M]});let o=B.texture;if(Tt){let a=Math.hypot(r[0]-1.15,r[1]-.75,r[2]-.3);it.apply({scene:B.texture,depthTexture:B.depthTexture,near:t,far:e,fovDeg:A.fovDeg??36,aspect:v/M,focusDistance:a,aperture:9,maxCoc:.01}),o=it.texture}b.bindFramebuffer(b.FRAMEBUFFER,null),b.viewport(0,0,v,M),b.disable(b.DEPTH_TEST),b.activeTexture(b.TEXTURE0),b.bindTexture(b.TEXTURE_2D,o),L.blit(Vt,a=>b.uniform1i(b.getUniformLocation(a,"uScene"),0))}se();function zt(n){se();let r=new Uint8Array(4);b.readPixels(0,0,1,1,b.RGBA,b.UNSIGNED_BYTE,r);let t=performance.now();for(let e=0;e<n;e++)se();return b.readPixels(0,0,1,1,b.RGBA,b.UNSIGNED_BYTE,r),(performance.now()-t)/n}var gt=Number(D.get("frames")??600),oe=(()=>{for(;b.getError()!==b.NO_ERROR;);let n=[],r=a=>{let i=b.getError();i!==b.NO_ERROR&&n.push(`${a}=0x${i.toString(16)}`)};$.shadowPass(ae,Y,Q,r),B.bind(),r("target.bind"),b.clear(b.DEPTH_BUFFER_BIT),r("clear"),dt.draw({eye:N(A),target:A.target,fovDeg:A.fovDeg??36,aspect:v/M,sky:ie}),r("sky"),$.draw({viewProj:z(A,v/M),eye:N(A),lightDir:K.direction,lightColour:K.colour,ambientGain:1,sky:ie,lightVP:ae,shadow:Q,shadowStrength:.92,draws:Y,onStep:r});let t=b.getError(),e=new Uint8Array(4);b.readPixels(v>>1,M>>2,1,1,b.RGBA,b.UNSIGNED_BYTE,e);let o=b.getError();return{centre:Array.from(e),afterDraw:t,afterRead:o,bad:n}})(),jt=X(mt)+X(pt)+X(ht),He=zt(Math.max(1,gt)),ut=(()=>{let n=z(A,v/M),r=-1.15,t=1.4,e=0,o=n[0]*r+n[4]*t+n[8]*e+n[12],a=n[1]*r+n[5]*t+n[9]*e+n[13],i=n[3]*r+n[7]*t+n[11]*e+n[15];return{ndc:[Number((o/i).toFixed(3)),Number((a/i).toFixed(3))],w:Number(i.toFixed(3))}})(),je=xe();if(je.length>0){let n="BRAND FIDELITY FAILED \u2014 "+je.map(t=>`${t.key}: expected ${t.expected}, got ${t.actual}`).join("; ");document.title="REFUSED";let r=document.getElementById("log");throw r&&(r.textContent=n),new Error(n)}var yt=(()=>{let n=b.getExtension("WEBGL_debug_renderer_info");return n?String(b.getParameter(n.UNMASKED_RENDERER_WEBGL)):"unknown"})(),Xe=/swiftshader|llvmpipe|software/i.test(yt),Rt={tier:H.tier,tierDprScale:H.dprScale,tierShadowMapSize:H.shadowMapSize,glError:b.getError(),brandFidelity:je,hdr:L.hdr,eye:N(A).map(n=>Number(n.toFixed(2))),boxTopNdc:ut.ndc,boxTopW:ut.w,targetCentre:oe.centre,failingCalls:oe.bad,glAfterDraw:oe.afterDraw,glAfterRead:oe.afterRead,triangles:jt,shadowMap:Q.size,resolution:`${v}x${M}`,dprScale:We,aoEnabled:ze,dofEnabled:Tt,frames:gt,repeat:xt,msPerFrame:Number(He.toFixed(3)),fps:Math.round(1e3/He),renderer:yt,rendererClass:Xe?"software":"hardware",headroom:Xe?null:Number((16.6-He).toFixed(3)),headroomRefusal:Xe?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null};globalThis.E0=Rt;document.getElementById("log").textContent=JSON.stringify(Rt,null,2);se();ft.markRendered();document.title="READY";

var nt={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected."};function M(r,n){return n===void 0?{kind:"refused",code:r,reason:nt[r]}:{kind:"refused",code:r,reason:nt[r],detail:n}}function Te(r){return r.kind==="stage"}function Ae(r,n={}){let t=r.getContext("webgl2",{antialias:n.antialias??!1,alpha:n.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!t)return M("NO_WEBGL2");let e=t.getExtension("EXT_color_buffer_float"),o=r.width,a=r.height,i=e?t.RGBA16F:t.RGBA8,s=e?t.HALF_FLOAT:t.UNSIGNED_BYTE,u=(E,A)=>{let g=t.createTexture();t.bindTexture(t.TEXTURE_2D,g),t.texImage2D(t.TEXTURE_2D,0,i,E,A,0,t.RGBA,s,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);let y=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,y),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,g,0);let R=t.checkFramebufferStatus(t.FRAMEBUFFER);return R!==t.FRAMEBUFFER_COMPLETE?M("FRAMEBUFFER_INCOMPLETE",`status 0x${R.toString(16)} at ${E}\xD7${A}`):{texture:g,framebuffer:y,width:E,height:A}},d=n.bloomShift??2,c={w:o,h:a},l=u(o,a);if("kind"in l)return l;let f=u(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in f)return f;let h=u(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in h)return h;let m=t.createVertexArray();t.bindVertexArray(m);let p=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,p),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null);let b=[];return{kind:"stage",gl:t,cssWidth:r.clientWidth||o,cssHeight:r.clientHeight||a,hdr:!!e,get width(){return c.w},get height(){return c.h},get scene(){return l},get bloomA(){return f},get bloomB(){return h},setRegion(E,A){let g=Math.max(1,Math.round(E)),y=Math.max(1,Math.round(A));if(!(g===c.w&&y===c.h)){c={w:g,h:y};for(let R of[l,f,h])"kind"in R||(t.deleteFramebuffer(R.framebuffer),t.deleteTexture(R.texture));l=u(g,y),f=u(Math.max(1,g>>d),Math.max(1,y>>d)),h=u(Math.max(1,g>>d),Math.max(1,y>>d))}},compile(E,A){let g=(Q,C)=>{let N=t.createShader(Q);return t.shaderSource(N,C),t.compileShader(N),t.getShaderParameter(N,t.COMPILE_STATUS)?N:M("SHADER_COMPILE_FAILED",t.getShaderInfoLog(N)??"(no log)")},y=g(t.VERTEX_SHADER,E);if(typeof y=="object"&&"kind"in y)return y;let R=g(t.FRAGMENT_SHADER,A);if(typeof R=="object"&&"kind"in R)return R;let v=t.createProgram();return t.attachShader(v,y),t.attachShader(v,R),t.linkProgram(v),t.getProgramParameter(v,t.LINK_STATUS)?(b.push(v),v):M("PROGRAM_LINK_FAILED",t.getProgramInfoLog(v)??"(no log)")},bindTarget(E){t.bindFramebuffer(t.FRAMEBUFFER,E?E.framebuffer:null),t.viewport(0,0,E?E.width:c.w,E?E.height:c.h)},blit(E,A){t.useProgram(E),t.bindVertexArray(m),A?.(E),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null)},dispose(){for(let E of b)t.deleteProgram(E);for(let E of[l,f,h])"kind"in E||(t.deleteFramebuffer(E.framebuffer),t.deleteTexture(E.texture));t.deleteBuffer(p),t.deleteVertexArray(m)}}}var ie=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function se(r,n){let t=new Float32Array(16);for(let e=0;e<4;e++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=r[i*4+o]*n[e*4+i];t[e*4+o]=a}return t}var W=(r,n)=>[r[0]-n[0],r[1]-n[1],r[2]-n[2]],ae=(r,n)=>r[0]*n[0]+r[1]*n[1]+r[2]*n[2],H=(r,n)=>[r[1]*n[2]-r[2]*n[1],r[2]*n[0]-r[0]*n[2],r[0]*n[1]-r[1]*n[0]];function U(r){let n=Math.hypot(r[0],r[1],r[2]);return n===0?r:[r[0]/n,r[1]/n,r[2]/n]}function Re(r,n,t,e){let o=1/Math.tan(r/2);return new Float32Array([o/n,0,0,0,0,o,0,0,0,0,(e+t)/(t-e),-1,0,0,2*e*t/(t-e),0])}function ve(r,n,t,e,o,a){let i=n-r,s=e-t,u=a-o;return new Float32Array([2/i,0,0,0,0,2/s,0,0,0,0,-2/u,0,-(n+r)/i,-(e+t)/s,-(a+o)/u,1])}function ue(r,n,t){let e=U(W(r,n)),o=H(t,e);if(Math.hypot(o[0],o[1],o[2])<1e-8)return ie();let a=U(o),i=H(e,a);return new Float32Array([a[0],i[0],e[0],0,a[1],i[1],e[1],0,a[2],i[2],e[2],0,-ae(a,r),-ae(i,r),-ae(e,r),1])}function ot(r,n){let t=[0,1,2,3].map(o=>r[0+o]*n[0]+r[4+o]*n[1]+r[8+o]*n[2]+r[12+o]),e=t[3];return{x:t[0]/e,y:t[1]/e,z:t[2]/e,w:e}}function q(r,n,t,e){let o=ot(r,n);return{sx:(o.x*.5+.5)*t,sy:(1-(o.y*.5+.5))*e,behind:o.w<=0}}function at(r){return r<=.04045?r/12.92:Math.pow((r+.055)/1.055,2.4)}var Yt=/^#?([0-9a-fA-F]{6})$/;function _(r){let n=Yt.exec(r.trim());if(!n)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(r)}`);let t=n[1];return[0,2,4].map(e=>at(parseInt(t.slice(e,e+2),16)/255))}var Fe={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},Kt=Object.freeze(Object.fromEntries(Object.keys(Fe).map(r=>[r,_(Fe[r])])));var it=.4;var Me=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${it.toFixed(2)}); }`,Le=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function Qt(r){let n=[1/0,1/0,1/0],t=[-1/0,-1/0,-1/0];for(let e=0;e<r.length;e+=3)for(let o=0;o<3;o++){let a=r[e+o];a<n[o]&&(n[o]=a),a>t[o]&&(t[o]=a)}return r.length===0?{min:[0,0,0],max:[0,0,0]}:{min:n,max:t}}function st(r,n,t,e){let o=new Float32Array(r.length);for(let i=0;i<e.length;i+=3){let s=e[i],u=e[i+1],d=e[i+2],c=s*3,l=u*3,f=d*3,h=s*2,m=u*2,p=d*2,b=r[l]-r[c],T=r[l+1]-r[c+1],E=r[l+2]-r[c+2],A=r[f]-r[c],g=r[f+1]-r[c+1],y=r[f+2]-r[c+2],R=t[m]-t[h],v=t[m+1]-t[h+1],Q=t[p]-t[h],C=t[p+1]-t[h+1],N=R*C-Q*v;if(Math.abs(N)<1e-12)continue;let D=1/N,jt=(b*C-A*v)*D,Xt=(T*C-g*v)*D,$t=(E*C-y*v)*D;for(let k of[c,l,f])o[k]=o[k]+jt,o[k+1]=o[k+1]+Xt,o[k+2]=o[k+2]+$t}let a=new Float32Array(r.length);for(let i=0;i<a.length;i+=3){let s=n[i],u=n[i+1],d=n[i+2],c=o[i],l=o[i+1],f=o[i+2],h=c*s+l*u+f*d;c-=s*h,l-=u*h,f-=d*h;let m=Math.hypot(c,l,f);m<1e-8&&(Math.abs(s)<.9?(c=0,l=-d,f=u):(c=-d,l=0,f=s),m=Math.hypot(c,l,f)||1),a[i]=c/m,a[i+1]=l/m,a[i+2]=f/m}return a}function ut(r,n){let t=new Float32Array(r.length);for(let e=0;e<n.length;e+=3){let o=n[e]*3,a=n[e+1]*3,i=n[e+2]*3,s=r[a]-r[o],u=r[a+1]-r[o+1],d=r[a+2]-r[o+2],c=r[i]-r[o],l=r[i+1]-r[o+1],f=r[i+2]-r[o+2],h=u*f-d*l,m=d*c-s*f,p=s*l-u*c;for(let b of[o,a,i])t[b]=t[b]+h,t[b+1]=t[b+1]+m,t[b+2]=t[b+2]+p}for(let e=0;e<t.length;e+=3){let o=Math.hypot(t[e],t[e+1],t[e+2]);o>0&&(t[e]=t[e]/o,t[e+1]=t[e+1]/o,t[e+2]=t[e+2]/o)}return t}function ct(r,n,t,e,o){let{min:a,max:i}=Qt(r),s=e??ut(r,t);return{positions:r,normals:s,uvs:n,indices:t,min:a,max:i,tangents:o??st(r,s,n,t)}}function z(r=1,n=1,t=1){let e=r/2,o=n/2,a=t/2,i=[[[-e,-o,a],[e,-o,a],[e,o,a],[-e,o,a]],[[e,-o,-a],[-e,-o,-a],[-e,o,-a],[e,o,-a]],[[e,-o,a],[e,-o,-a],[e,o,-a],[e,o,a]],[[-e,-o,-a],[-e,-o,a],[-e,o,a],[-e,o,-a]],[[-e,o,a],[e,o,a],[e,o,-a],[-e,o,-a]],[[-e,-o,-a],[e,-o,-a],[e,-o,a],[-e,-o,a]]],s=new Float32Array(72),u=new Float32Array(48),d=new Uint16Array(36),c=0,l=0,f=0,h=0;for(let m of i){for(let[p,b,T]of m)s[c++]=p,s[c++]=b,s[c++]=T;u[l++]=0,u[l++]=0,u[l++]=1,u[l++]=0,u[l++]=1,u[l++]=1,u[l++]=0,u[l++]=1,d[f++]=h,d[f++]=h+1,d[f++]=h+2,d[f++]=h,d[f++]=h+2,d[f++]=h+3,h+=4}return ct(s,u,d)}function _e(r=10,n=24){let t=Math.max(1,Math.floor(n)),e=(t+1)*(t+1),o=new Float32Array(e*3),a=new Float32Array(e*3),i=new Float32Array(e*2),s=new Uint16Array(t*t*6),u=0,d=0,c=0;for(let l=0;l<=t;l++)for(let f=0;f<=t;f++){let h=(f/t-.5)*r,m=(l/t-.5)*r;o[u]=h,o[u+1]=0,o[u+2]=m,a[u]=0,a[u+1]=1,a[u+2]=0,u+=3,i[d++]=f/t,i[d++]=l/t}for(let l=0;l<t;l++)for(let f=0;f<t;f++){let h=l*(t+1)+f,m=h+1,p=h+(t+1),b=p+1;s[c++]=h,s[c++]=p,s[c++]=m,s[c++]=m,s[c++]=p,s[c++]=b}return ct(o,i,s,a)}function I(r){return r.indices.length/3}function qt(r){if(!Number.isFinite(r)||r===0)return"0";let n=r.toFixed(12).replace(/0+$/,"").replace(/\.$/,"");return n==="-0"?"0":n}function lt(r,n,t,e){let[o,a]=r,[i,s]=n,[u,d]=t,[c,l]=e,f=o-i+u-c,h=a-s+d-l;if(Math.abs(f)<1e-9&&Math.abs(h)<1e-9){let y=[i-o,c-o,o,s-a,l-a,a,0,0,1],R=y[0]*y[4]-y[1]*y[3];return Math.abs(R)<1e-9?null:y}let m=i-u,p=c-u,b=s-d,T=l-d,E=m*T-p*b;if(Math.abs(E)<1e-9)return null;let A=(f*T-p*h)/E,g=(m*h-f*b)/E;return[i-o+A*i,c-o+g*c,o,s-a+A*s,l-a+g*l,a,A,g,1]}function Se(r,n,t,e,o,a){if(!(o>0)||!(a>0))return{refusal:"EMPTY_ELEMENT_BOX"};let s=[n.topLeft,n.topRight,n.bottomRight,n.bottomLeft].map(D=>q(r,D,t,e));if(s.some(D=>D.behind))return{refusal:"CORNER_BEHIND_CAMERA"};let u=s.map(D=>({x:D.sx,y:D.sy})),[d,c,l,f]=u,h=lt([d.x,d.y],[c.x,c.y],[l.x,l.y],[f.x,f.y]);if(!h)return{refusal:"DEGENERATE_ON_SCREEN"};let m=.5*(d.x*c.y-c.x*d.y+(c.x*l.y-l.x*c.y)+(l.x*f.y-f.x*l.y)+(f.x*d.y-d.x*f.y)),p=1/o,b=1/a,[T,E,A,g,y,R,v,Q,C]=h;return{transform:`matrix3d(${[T*p,g*p,0,v*p,E*b,y*b,0,Q*b,0,0,1,0,A,R,0,C].map(qt).join(", ")})`,matrix:h,screen:u,signedArea:m}}function B(r){return"refusal"in r}function De(r,n,t,e,o,a,i=0){let s=Math.cos(a),u=Math.sin(a),d=(l,f)=>[r+s*l+u*i,t+f,n-u*l+s*i],c=e/2;return{topLeft:d(-c,o),topRight:d(c,o),bottomRight:d(c,0),bottomLeft:d(-c,0)}}var we=89,Pe=Math.PI/180;function ce(r){let n=Math.max(-we,Math.min(we,r.elevationDeg))*Pe,t=r.azimuthDeg*Pe,e=Math.max(1e-4,r.distance),o=Math.sin(n)*e,a=Math.cos(n)*e;return[r.target[0]+Math.sin(t)*a,r.target[1]+o,r.target[2]+Math.cos(t)*a]}function le(r,n){let t=ce(r),e=r.near??Math.max(.01,r.distance/100),o=r.far??Math.max(e+1,r.distance*8),a=Re((r.fovDeg??38)*Pe,Math.max(.001,n),e,o),i=ue(t,r.target,[0,1,0]);return se(a,i)}function Oe(r,n,t){let e=U(r.direction),o=r.extent??Math.max(.1,t*1.35),a=Math.max(1,t*2),i=[n[0]-e[0]*a,n[1]-e[1]*a,n[2]-e[2]*a],s=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],u=ue(i,n,s),d=ve(-o,o,-o,o,.01,a+t*2+o);return se(d,u)}function Ne(r,n){let t=W([n[0],n[1],n[2]],[r[0],r[1],r[2]]);return Math.hypot(t[0],t[1],t[2])/2}function Ue(r,n){return[(r[0]+n[0])/2,(r[1]+n[1])/2,(r[2]+n[2])/2]}function Ce(r,n,t){let{gl:e}=r,o=Math.max(1,Math.floor(n)),a=Math.max(1,Math.floor(t)),i=e.createFramebuffer(),s=e.createTexture(),u=e.createTexture();if(!i||!s||!u)return M("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let d=r.hdr?e.RGBA16F:e.RGBA8,c=r.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,l=()=>{e.bindTexture(e.TEXTURE_2D,s),e.texImage2D(e.TEXTURE_2D,0,d,o,a,0,e.RGBA,c,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,u),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,o,a,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,s,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,u,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};l(),e.bindFramebuffer(e.FRAMEBUFFER,i);let f=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),f!==e.FRAMEBUFFER_COMPLETE?M("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${f.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:s,depthTexture:u,get width(){return o},get height(){return a},bind(){e.bindFramebuffer(e.FRAMEBUFFER,i),e.viewport(0,0,o,a)},resize(h,m){let p=Math.max(1,Math.floor(h)),b=Math.max(1,Math.floor(m));p===o&&b===a||(o=p,a=b,l())},dispose(){e.deleteFramebuffer(i),e.deleteTexture(s),e.deleteTexture(u)}}}function Be(r,n=1024){let{gl:t}=r,e=Math.max(256,Math.min(2048,Math.floor(n))),o=t.createFramebuffer(),a=t.createTexture();if(!o||!a)return M("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");t.bindTexture(t.TEXTURE_2D,a),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,e,e,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,o),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,a,0);let i=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),i!==t.FRAMEBUFFER_COMPLETE?M("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:e,bind(){t.bindFramebuffer(t.FRAMEBUFFER,o),t.viewport(0,0,e,e)},dispose(){t.deleteFramebuffer(o),t.deleteTexture(a)}}}var me=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,de={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function fe(r,n,t={}){let e=t.zenith??de.zenith,o=t.horizon??de.horizon,a=t.ground??de.ground;r.uniform3f(r.getUniformLocation(n,"uSkyZenith"),e[0],e[1],e[2]),r.uniform3f(r.getUniformLocation(n,"uSkyHorizon"),o[0],o[1],o[2]),r.uniform3f(r.getUniformLocation(n,"uSkyGround"),a[0],a[1],a[2])}var Zt=`#version 300 es
precision highp float;
out vec2 vNdc;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`,Jt=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${me}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;function Ie(r){let{gl:n}=r,t=r.compile(Zt,Jt);return"kind"in t?t:{draw(e){let o=U(W(e.target,e.eye)),a=Math.abs(o[1])>.999?[0,0,1]:[0,1,0],i=U(H(o,a)),s=U(H(i,o));n.disable(n.DEPTH_TEST),n.depthMask(!1),n.disable(n.BLEND),n.useProgram(t),n.uniform3f(n.getUniformLocation(t,"uRight"),i[0],i[1],i[2]),n.uniform3f(n.getUniformLocation(t,"uUp"),s[0],s[1],s[2]),n.uniform3f(n.getUniformLocation(t,"uForward"),o[0],o[1],o[2]),n.uniform1f(n.getUniformLocation(t,"uTanHalfFov"),Math.tan(e.fovDeg*Math.PI/360)),n.uniform1f(n.getUniformLocation(t,"uAspect"),Math.max(.001,e.aspect)),fe(n,t,e.sky),r.blit(t),n.depthMask(!0),n.enable(n.DEPTH_TEST)},dispose(){n.deleteProgram(t)}}}var dt=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,Ge=`#version 300 es
precision highp float;
void main(){}`,er=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,mt=`#version 300 es
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
}`,ft=`#version 300 es
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
${me}

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
}`;function G(r,n){let{gl:t}=r,e=t.createVertexArray(),o=t.createBuffer(),a=t.createBuffer(),i=t.createBuffer(),s=t.createBuffer();return!e||!o||!a||!i||!s?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(t.bindVertexArray(e),t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,n.positions,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,a),t.bufferData(t.ARRAY_BUFFER,n.normals,t.STATIC_DRAW),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,i),t.bufferData(t.ARRAY_BUFFER,n.tangents,t.STATIC_DRAW),t.enableVertexAttribArray(2),t.vertexAttribPointer(2,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,s),t.bufferData(t.ELEMENT_ARRAY_BUFFER,n.indices,t.STATIC_DRAW),t.bindVertexArray(null),{vao:e,indexCount:n.indices.length,indexType:n.indices instanceof Uint32Array?t.UNSIGNED_INT:t.UNSIGNED_SHORT,dispose(){t.deleteVertexArray(e),t.deleteBuffer(o),t.deleteBuffer(a),t.deleteBuffer(i),t.deleteBuffer(s)}})}function Ve(r){let{gl:n}=r,t=r.compile(dt,Ge);if("kind"in t)return t;let e=r.compile(mt,ft);if("kind"in e)return e;let o=r.compile(er,Ge);if("kind"in o)return o;let a=(i,s)=>n.getUniformLocation(i,s);return{shadowPass(i,s,u,d){let c=d??(()=>{});u.bind(),c("shadow.bind"),n.clear(n.DEPTH_BUFFER_BIT),n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.FRONT),n.useProgram(t),c("useProgram(shadow)"),n.uniformMatrix4fv(a(t,"uLightVP"),!1,i),c("uLightVP");for(let l of s)n.uniformMatrix4fv(a(t,"uModel"),!1,l.model),c("shadow uModel"),n.bindVertexArray(l.mesh.vao),c("shadow bindVAO"),n.drawElements(n.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0),c("shadow drawElements");n.bindVertexArray(null),n.cullFace(n.BACK)},depthPrepass(i,s){n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.colorMask(!1,!1,!1,!1),n.useProgram(o),n.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let u of s)n.uniformMatrix4fv(a(o,"uModel"),!1,u.model),n.bindVertexArray(u.mesh.vao),n.drawElements(n.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0);n.bindVertexArray(null),n.colorMask(!0,!0,!0,!0)},draw(i){let s=i.onStep??(()=>{});if(n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.useProgram(e),n.uniformMatrix4fv(a(e,"uViewProj"),!1,i.viewProj),s("uViewProj"),n.uniform3fv(a(e,"uEye"),i.eye),s("uEye"),n.uniform3fv(a(e,"uLightDir"),i.lightDir),s("uLightDir"),n.uniform3fv(a(e,"uLightColour"),i.lightColour),s("uLightColour"),n.uniform1f(a(e,"uAmbientGain"),i.ambientGain??1),s("uAmbientGain"),i.fog&&i.fog.density>0){n.uniform1f(a(e,"uFogDensity"),i.fog.density),n.uniform1f(a(e,"uFogHeight"),i.fog.height),n.uniform1f(a(e,"uFogFloor"),i.fog.floor??0);let u=i.fog.colour;u==="sky"?n.uniform3f(a(e,"uFogColour"),-1,-1,-1):n.uniform3f(a(e,"uFogColour"),u[0],u[1],u[2]),s("fog")}else n.uniform1f(a(e,"uFogDensity"),0);fe(n,e,i.sky),s("bindSky"),i.ao&&i.screenSize?(n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,i.ao),n.uniform1i(a(e,"uAO"),1),n.uniform2f(a(e,"uScreenSize"),i.screenSize[0],i.screenSize[1]),n.uniform1f(a(e,"uAOEnabled"),1)):n.uniform1f(a(e,"uAOEnabled"),0),s("bindAO"),n.uniformMatrix4fv(a(e,"uLightVP"),!1,i.lightVP),s("lit uLightVP"),i.shadow?(n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,i.shadow.depthTexture),n.uniform1i(a(e,"uShadowMap"),0),n.uniform1f(a(e,"uShadowTexel"),1/i.shadow.size),n.uniform1f(a(e,"uShadowStrength"),i.shadowStrength??1)):n.uniform1f(a(e,"uShadowStrength"),0);for(let u of i.draws)n.uniformMatrix4fv(a(e,"uModel"),!1,u.model),n.uniformMatrix3fv(a(e,"uNormalMat"),!1,u.normalMat),s("uNormalMat"),n.uniform3fv(a(e,"uBaseColour"),u.material.baseColour),s("uBaseColour"),n.uniform1f(a(e,"uRoughness"),u.material.roughness),n.uniform1f(a(e,"uMetalness"),u.material.metalness),n.uniform1f(a(e,"uAnisotropy"),u.material.anisotropy??0),n.bindVertexArray(u.mesh.vao),s("lit bindVAO"),n.drawElements(n.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0),s("lit drawElements");n.bindVertexArray(null),n.disable(n.CULL_FACE)},dispose(){n.deleteProgram(t),n.deleteProgram(e),n.deleteProgram(o)}}}var ke=`
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
}`,ht=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,tr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${ke}

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
}`,rr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${ke}

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
}`;function He(r,n,t){let{gl:e}=r,o=r.compile(ht,tr);if("kind"in o)return o;let a=r.compile(ht,rr);if("kind"in a)return a;let i=Math.max(1,n>>1),s=Math.max(1,t>>1),u=()=>{let m=e.createFramebuffer(),p=e.createTexture();return!m||!p?null:{fb:m,tex:p}},d=u(),c=u();if(!d||!c)return M("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let l=()=>{for(let m of[d,c])e.bindTexture(e.TEXTURE_2D,m.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,i,s,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,m.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,m.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};l(),e.bindFramebuffer(e.FRAMEBUFFER,d.fb);let f=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),f!==e.FRAMEBUFFER_COMPLETE)return M("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${f.toString(16)}).`);let h=(m,p,b,T,E,A,g)=>{e.activeTexture(e.TEXTURE0+g),e.bindTexture(e.TEXTURE_2D,p),e.uniform1i(e.getUniformLocation(m,"uDepth"),g),e.uniform2f(e.getUniformLocation(m,"uNearFar"),b,T),e.uniform1f(e.getUniformLocation(m,"uTanHalfFov"),Math.tan(E*Math.PI/360)),e.uniform1f(e.getUniformLocation(m,"uAspect"),A)};return{get texture(){return d.tex},get width(){return i},get height(){return s},compute(m){e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,d.fb),e.viewport(0,0,i,s),e.useProgram(o),h(o,m.depthTexture,m.near,m.far,m.fovDeg,m.aspect,0),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/i,1/s),e.uniform1f(e.getUniformLocation(o,"uRadius"),m.radius??.55),e.uniform1f(e.getUniformLocation(o,"uStrength"),m.strength??1.15),e.uniform1f(e.getUniformLocation(o,"uBias"),m.bias??.035),r.blit(o);for(let[p,b,T]of[[d,c,[1,0]],[c,d,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,b.fb),e.viewport(0,0,i,s),e.useProgram(a),h(a,m.depthTexture,m.near,m.far,m.fovDeg,m.aspect,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,p.tex),e.uniform1i(e.getUniformLocation(a,"uAO"),1),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/i,1/s),e.uniform2f(e.getUniformLocation(a,"uDir"),T[0],T[1]),r.blit(a);e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(m,p){let b=Math.max(1,m>>1),T=Math.max(1,p>>1);b===i&&T===s||(i=b,s=T,l())},dispose(){e.deleteProgram(o),e.deleteProgram(a);for(let m of[d,c])e.deleteFramebuffer(m.fb),e.deleteTexture(m.tex)}}}var ge=new URLSearchParams(location.search),Ye=ge.get("ao")!=="0",Ze=ge.get("fog")!=="0",ne=Math.max(1,Math.min(3,Number(ge.get("scale")??1))),Lt=Number(ge.get("frames")??300),w=1200*ne,P=720*ne,Y=document.getElementById("c");Y.width=w;Y.height=P;var _t=document.getElementById("log");function St(r){throw document.title="REFUSED",_t.textContent=r,new Error(r)}function S(r,n){return"kind"in n&&St(`${r}: ${n.code} \u2014 ${n.reason} ${n.detail??""}`),n}var pe=Ae(Y,{alpha:!1});Te(pe)||St(`stage: ${pe.code} \u2014 ${pe.reason}`);var F=pe,x=F.gl,nr=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,or=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${Me}
${Le}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,ar=S("present",F.compile(nr,or)),We=S("lit",Ve(F)),he=S("target",Ce(F,w,P)),Ke=S("shadow",Be(F,1536)),vn=S("sky",Ie(F)),pt=S("ao",He(F,w,P)),ir=[{hoursAgo:3,actor:"n.sharma",action:"campaign.publish",verdict:"ALLOWED"},{hoursAgo:9,actor:"n.sharma",action:"budget.raise",verdict:"ALLOWED"},{hoursAgo:14,actor:"svc.payagent",action:"x402.settle",verdict:"ALLOWED"},{hoursAgo:26,actor:"a.reiter",action:"listing.approve",verdict:"ALLOWED"},{hoursAgo:31,actor:"svc.operator",action:"memo.generate",verdict:"ALLOWED"},{hoursAgo:44,actor:"j.kohler",action:"compartment.read",verdict:"BLOCKED"},{hoursAgo:45,actor:"j.kohler",action:"compartment.read",verdict:"BLOCKED"},{hoursAgo:46,actor:"j.kohler",action:"export.bulk",verdict:"BLOCKED"},{hoursAgo:47,actor:"j.kohler",action:"export.bulk",verdict:"BLOCKED"},{hoursAgo:58,actor:"svc.payagent",action:"x402.settle",verdict:"ALLOWED"},{hoursAgo:70,actor:"\u2014",action:"\u2014",verdict:"WITHHELD"},{hoursAgo:83,actor:"a.reiter",action:"quest.close",verdict:"ALLOWED"},{hoursAgo:95,actor:"n.sharma",action:"rfi.extract",verdict:"ALLOWED"},{hoursAgo:110,actor:"\u2014",action:"\u2014",verdict:"WITHHELD"},{hoursAgo:128,actor:"svc.operator",action:"sat.gate",verdict:"BLOCKED"},{hoursAgo:141,actor:"a.reiter",action:"listing.approve",verdict:"ALLOWED"},{hoursAgo:163,actor:"n.sharma",action:"campaign.draft",verdict:"ALLOWED"},{hoursAgo:190,actor:"svc.payagent",action:"x402.settle",verdict:"ALLOWED"},{hoursAgo:214,actor:"\u2014",action:"\u2014",verdict:"WITHHELD"},{hoursAgo:246,actor:"a.reiter",action:"quest.close",verdict:"ALLOWED"},{hoursAgo:280,actor:"n.sharma",action:"budget.raise",verdict:"ALLOWED"},{hoursAgo:320,actor:"svc.operator",action:"memo.generate",verdict:"ALLOWED"},{hoursAgo:366,actor:"j.kohler",action:"compartment.read",verdict:"BLOCKED"},{hoursAgo:410,actor:"a.reiter",action:"listing.approve",verdict:"ALLOWED"},{hoursAgo:462,actor:"n.sharma",action:"campaign.publish",verdict:"ALLOWED"}],Je=12,te=.62,J=.4,Dt=.05,V=1.34,sr=0,ur=.78,wt=13,re=Ze?Math.log(20)/26:0,cr=3.4,Pt=r=>-(r/Je)-cr,lr=J+.1,bt=4,oe=44,Z=-oe/2+3,Ot=_e(6,oe),Nt=z(.22,3,oe),Ut=z(2*V+.44,.18,oe),Ct=z(2*V+.44,3,.2),Bt=z(te,J,Dt),dr=S("floor",G(F,Ot)),Et=S("wall",G(F,Nt)),mr=S("ceiling",G(F,Ut)),fr=S("end wall",G(F,Ct)),hr=S("record",G(F,Bt)),j=new Float32Array([1,0,0,0,1,0,0,0,1]),X=(r,n,t,e=0)=>{let o=ie(),a=Math.cos(e),i=Math.sin(e);return o[0]=a,o[2]=-i,o[8]=i,o[10]=a,o[12]=r,o[13]=n,o[14]=t,o},Ee={target:[0,.8,-9],distance:8.6,azimuthDeg:0,elevationDeg:3.5,fovDeg:33},O=ce(Ee),xt=.42,gt=V-.2,yt=[{z:1/0,tier:-1},{z:1/0,tier:-1}],L=ir.map((r,n)=>{let t=n%2===0,e=t?0:1,o=t?-gt:gt,a=Pt(r.hoursAgo),s=Math.atan2(O[0]-o,O[2]-a)*xt+(t?1:-1)*(Math.PI/2)*(1-xt),u=yt[e],d=Math.abs(a-u.z)<te*1.05,c=d?(u.tier+1)%bt:0,l=d&&u.tier+1>=bt;yt[e]={z:a,tier:c};let f=ur+c*lr;return{...r,i:n,left:t,x:o,y:f,yaw:s,z:a,tier:c,tierOverflow:l,distance:0}});for(let r of L)r.distance=Math.hypot(r.x-O[0],r.y-O[1],r.z-O[2]);var pr={ALLOWED:{hex:"#2C6BFF",roughness:.36,metalness:.06},BLOCKED:{hex:"#C9552B",roughness:.42,metalness:.05},WITHHELD:{hex:"#5C6880",roughness:.3,metalness:.55}},ze=[{mesh:dr,model:X(0,sr,Z),normalMat:j,material:{baseColour:_("#080C15"),roughness:.84,metalness:0}},{mesh:Et,model:X(-V,1.5,Z),normalMat:j,material:{baseColour:_("#141F35"),roughness:.62,metalness:.03}},{mesh:Et,model:X(V,1.5,Z),normalMat:j,material:{baseColour:_("#141F35"),roughness:.62,metalness:.03}},{mesh:mr,model:X(0,2.86,Z),normalMat:j,material:{baseColour:_("#0A101C"),roughness:.8,metalness:0}},{mesh:fr,model:X(0,1.5,Z-oe/2),normalMat:j,material:{baseColour:_("#0B1220"),roughness:.86,metalness:0}},...L.map(r=>{let n=pr[r.verdict];return{mesh:hr,model:X(r.x,r.y,r.z,r.yaw),normalMat:j,material:{baseColour:_(n.hex),roughness:n.roughness,metalness:n.metalness}}})],It=[.34,-.42,-.84],Tt=[-2.2,0,-26],At=[2.2,3.4,3],Rt=Oe({direction:It,colour:[1,1,1],extent:11},Ue(Tt,At),Ne(Tt,At)),br=I(Ot)+2*I(Nt)+I(Ut)+I(Ct)+L.length*I(Bt),Er=.1,xr=60;function Qe(){let r=le(Ee,w/P);We.shadowPass(Rt,ze,Ke),he.bind();let n=_("#0B1220");x.clearColor(n[0],n[1],n[2],1),x.clear(x.COLOR_BUFFER_BIT|x.DEPTH_BUFFER_BIT),We.depthPrepass(r,ze),Ye&&(pt.compute({depthTexture:he.depthTexture,near:Er,far:xr,fovDeg:Ee.fovDeg??46,aspect:w/P,radius:.42,strength:1.35}),he.bind()),We.draw({viewProj:r,eye:O,lightDir:It,lightColour:[3,2.95,2.85],ambientGain:.46,lightVP:Rt,shadow:Ke,shadowStrength:.94,draws:ze,ao:Ye?pt.texture:null,screenSize:[w,P],fog:re>0?{density:re,height:6,floor:0,colour:_("#0B1220")}:null}),x.bindFramebuffer(x.FRAMEBUFFER,null),x.viewport(0,0,w,P),x.disable(x.DEPTH_TEST),x.activeTexture(x.TEXTURE0),x.bindTexture(x.TEXTURE_2D,he.texture),F.blit(ar,t=>x.uniform1i(x.getUniformLocation(t,"uScene"),0))}function gr(r){Qe();let n=new Uint8Array(4);x.readPixels(0,0,1,1,x.RGBA,x.UNSIGNED_BYTE,n);let t=performance.now();for(let e=0;e<r;e++)Qe();return x.readPixels(0,0,1,1,x.RGBA,x.UNSIGNED_BYTE,n),(performance.now()-t)/r}var je=gr(Math.max(1,Lt)),Gt=le(Ee,w/P),ee=w/ne,xe=P/ne,ye=document.createElement("div");ye.style.cssText=`position:relative;overflow:hidden;width:${ee}px;height:${xe}px`;Y.parentNode?.insertBefore(ye,Y);ye.appendChild(Y);var K=document.createElement("div");K.style.cssText="position:absolute;inset:0;pointer-events:none";ye.appendChild(K);var et=r=>re<=0?0:1-Math.exp(-re*r),qe=190,Xe=[],vt=(r,n,t)=>{let e=0;for(let o=0;o<4;o++){let a=r[o],i=r[(o+1)%4],s=(i.x-a.x)*(t-a.y)-(i.y-a.y)*(n-a.x);if(Math.abs(s)<1e-9)continue;let u=s>0?1:-1;if(e===0)e=u;else if(u!==e)return!1}return!0},Vt=[...L].sort((r,n)=>r.distance-n.distance).map(r=>{let n=r.verdict==="WITHHELD",t=r.distance>wt,e=Math.round(te*qe),o=Math.round(J*qe),a=De(r.x,r.z,r.y-J/2,te,J,r.yaw,Dt/2+.004),i=Se(Gt,a,ee,xe,e,o),s=B(i)?i.refusal:null,u=!B(i)&&i.signedArea<=0,d=B(i)?0:Math.max(Math.hypot(i.screen[0].x-i.screen[1].x,i.screen[0].y-i.screen[1].y),Math.hypot(i.screen[3].x-i.screen[2].x,i.screen[3].y-i.screen[2].y)),c=d<26,l=B(i)?0:i.screen.filter(m=>Xe.some(p=>vt(p,m.x,m.y))).length+Xe.reduce((m,p)=>m+p.filter(b=>vt(i.screen.map(T=>({x:T.x,y:T.y})),b.x,b.y)).length,0),f=l>=2,h=!s&&!u&&!n&&!t&&!c&&!f;return h&&!B(i)&&Xe.push(i.screen.map(m=>({x:m.x,y:m.y}))),{p:r,proj:i,shown:h,ew:e,eh:o,refusal:s,backFacing:u,withheld:n,tooFar:t,edgeOn:c,occluded:f,widthPx:d,coveredCorners:l}});for(let r of[...Vt].sort((n,t)=>t.p.distance-n.p.distance)){let{p:n,proj:t,shown:e,ew:o,eh:a}=r;if(e&&!B(t)){let i=et(n.distance),s=document.createElement("div");s.style.cssText=`position:absolute;left:0;top:0;width:${o}px;height:${a}px;transform-origin:0 0;transform:${t.transform};display:flex;flex-direction:column;justify-content:center;gap:5px;padding:0 5px;overflow:hidden;opacity:${(1-.75*i).toFixed(3)};-webkit-font-smoothing:antialiased`;let u=n.hoursAgo,d=u<24?`${u}h ago`:`${(u/24).toFixed(u<72?1:0)}d ago`;s.innerHTML=`<div style="font:600 9px/1 ui-monospace,monospace;letter-spacing:.15em;color:rgba(255,255,255,0.66)">${n.verdict} \xB7 ${d}</div><div style="font:700 11px/1.05 ui-monospace,monospace;color:#fff">${n.action}</div><div style="font:400 10.5px/1.2 ui-monospace,monospace;color:rgba(255,255,255,0.74)">${n.actor}</div>`,K.appendChild(s)}}var $=Vt.map(({p:r,shown:n,refusal:t,backFacing:e,withheld:o,tooFar:a,edgeOn:i,occluded:s,widthPx:u,coveredCorners:d})=>({i:r.i,verdict:r.verdict,hoursAgo:r.hoursAgo,distance:Number(r.distance.toFixed(2)),fog:Number(et(r.distance).toFixed(3)),widthPx:Math.round(u),coveredCorners:d,shown:n,hiddenBecause:n?null:o?"WITHHELD":t||(e?"BACK_FACING":i?"EDGE_ON":a?"BEYOND_LEGIBLE_RANGE":"OCCLUDED")})),kt=Math.max(0,...$.filter(r=>r.shown).map(r=>r.hoursAgo)),Ht=Math.max(...L.map(r=>r.hoursAgo)),tt=document.createElement("div");tt.style.cssText="position:absolute;left:18px;top:16px;display:flex;flex-direction:column;gap:7px";tt.innerHTML=`<div style="font:600 11px/1 ui-monospace,monospace;letter-spacing:.16em;color:#8FB7FF">GOVERNED ACTIONS \xB7 DEPTH IS TIME</div><div style="font:400 10.5px/1.5 ui-monospace,monospace;color:rgba(196,212,240,0.84)">READABLE TO ${(kt/24).toFixed(1)} d &nbsp;\xB7&nbsp; VISIBLE TO ${(Ht/24).toFixed(1)} d<br>${Je} h PER METRE &nbsp;\xB7&nbsp; ${Ze?"FOG ON":"FOG OFF \u2014 reading limit NOT shown"}</div><div style="font:500 10px/1.4 ui-monospace,monospace;color:#E0A94A">SYNTHETIC RECORDS</div>`;K.appendChild(tt);var be={ALLOWED:L.filter(r=>r.verdict==="ALLOWED").length,BLOCKED:L.filter(r=>r.verdict==="BLOCKED").length,WITHHELD:L.filter(r=>r.verdict==="WITHHELD").length},rt=document.createElement("div");rt.style.cssText="position:absolute;right:18px;bottom:16px;display:flex;flex-direction:column;gap:6px;align-items:flex-end;font:500 10.5px/1 ui-monospace,monospace";rt.innerHTML=[["#2C6BFF",`ALLOWED \xB7 ${be.ALLOWED}`],["#C9552B",`BLOCKED \xB7 ${be.BLOCKED}`],["#5C6880",`WITHHELD \xB7 ${be.WITHHELD} (present, unreadable)`]].map(([r,n])=>`<div style="display:flex;align-items:center;gap:7px;color:rgba(196,212,240,0.85)"><span>${n}</span><span style="width:11px;height:11px;background:${r};display:inline-block"></span></div>`).join("");K.appendChild(rt);var Ft=[1,3,7,14].map(r=>{let n=Pt(r*24),t=q(Gt,[-V+.3,.035,n],ee,xe),e=et(Math.hypot(O[0]+V-.3,O[1]-.035,O[2]-n));if(!t.behind&&t.sx>0&&t.sx<ee&&t.sy>0&&t.sy<xe){let o=document.createElement("div");o.style.cssText=`position:absolute;left:${t.sx.toFixed(1)}px;top:${t.sy.toFixed(1)}px;transform:translate(-50%,-50%);font:500 10px/1 ui-monospace,monospace;letter-spacing:.08em;color:rgba(196,212,240,${(.85*(1-e)).toFixed(3)});white-space:nowrap`,o.textContent=`${r}d`,K.appendChild(o)}return{days:r,sx:Math.round(t.sx),sy:Math.round(t.sy),fog:Number(e.toFixed(3)),onFrame:!t.behind&&t.sx>0&&t.sx<ee}}),Wt=(()=>{let r=x.getExtension("WEBGL_debug_renderer_info");return r?String(x.getParameter(r.UNMASKED_RENDERER_WEBGL)):"unknown"})(),$e=/swiftshader|llvmpipe|software/i.test(Wt),zt={ao:Ye,fog:Ze,fogDensity:Number(re.toFixed(4)),hoursPerMetre:Je,legibleMetres:wt,hdr:F.hdr,eye:O.map(r=>Number(r.toFixed(2))),readableToDays:Number((kt/24).toFixed(2)),visibleToDays:Number((Ht/24).toFixed(2)),records:L.length,actionOverflow:L.filter(r=>r.action.length*6.6>te*qe-10).map(r=>r.action),tiersUsed:Math.max(...L.map(r=>r.tier))+1,tierOverflows:L.filter(r=>r.tierOverflow).length,counts:be,shown:$.filter(r=>r.shown).length,hiddenBy:$.filter(r=>!r.shown).reduce((r,n)=>{let t=n.hiddenBecause??"UNKNOWN";return r[t]=(r[t]??0)+1,r},{}),fogNearest:Math.min(...$.map(r=>r.fog)),fogFurthest:Math.max(...$.map(r=>r.fog)),rulerTicks:Ft,rulerOffFrame:Ft.filter(r=>!r.onFrame).length,perRecord:$,glError:x.getError(),triangles:br,shadowMap:Ke.size,resolution:`${w}x${P}`,dprScale:ne,frames:Lt,msPerFrame:Number(je.toFixed(3)),fps:Math.round(1e3/je),renderer:Wt,rendererClass:$e?"software":"hardware",headroom:$e?null:Number((16.6-je).toFixed(3)),headroomRefusal:$e?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null,hardwareMsPerFrame:null};globalThis.E6=zt;var{perRecord:Mt,rulerTicks:Fn,...yr}=zt;_t.textContent=JSON.stringify(yr,null,2)+`

perRecord (${Mt.length}, full detail on globalThis.E6):
`+Mt.map(r=>`  #${String(r.i).padStart(2)} ${r.verdict.padEnd(9)} ${String(r.hoursAgo).padStart(4)}h ${String(r.distance).padStart(6)}m fog ${r.fog.toFixed(3)} ${r.shown?"SHOWN":`hidden: ${r.hiddenBecause}`}`).join(`
`);Qe();document.title="READY";

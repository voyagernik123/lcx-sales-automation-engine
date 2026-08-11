var qe={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable."};function D(r,n){return n===void 0?{kind:"refused",code:r,reason:qe[r]}:{kind:"refused",code:r,reason:qe[r],detail:n}}function xe(r){return r.kind==="stage"}function Te(r,n={}){let t=r.getContext("webgl2",{antialias:n.antialias??!1,alpha:n.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!t)return D("NO_WEBGL2");let e=t.getExtension("EXT_color_buffer_float"),o=r.width,a=r.height,i=e?t.RGBA16F:t.RGBA8,s=e?t.HALF_FLOAT:t.UNSIGNED_BYTE,u=(b,R)=>{let y=t.createTexture();t.bindTexture(t.TEXTURE_2D,y),t.texImage2D(t.TEXTURE_2D,0,i,b,R,0,t.RGBA,s,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);let T=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,T),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,y,0);let w=t.checkFramebufferStatus(t.FRAMEBUFFER);return w!==t.FRAMEBUFFER_COMPLETE?D("FRAMEBUFFER_INCOMPLETE",`status 0x${w.toString(16)} at ${b}\xD7${R}`):{texture:y,framebuffer:T,width:b,height:R}},d=n.bloomShift??2,l={w:o,h:a},c=u(o,a);if("kind"in c)return c;let m=u(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in m)return m;let h=u(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in h)return h;let f=t.createVertexArray();t.bindVertexArray(f);let p=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,p),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null);let E=[];return{kind:"stage",gl:t,cssWidth:r.clientWidth||o,cssHeight:r.clientHeight||a,hdr:!!e,get width(){return l.w},get height(){return l.h},get scene(){return c},get bloomA(){return m},get bloomB(){return h},setRegion(b,R){let y=Math.max(1,Math.round(b)),T=Math.max(1,Math.round(R));if(!(y===l.w&&T===l.h)){l={w:y,h:T};for(let w of[c,m,h])"kind"in w||(t.deleteFramebuffer(w.framebuffer),t.deleteTexture(w.texture));c=u(y,T),m=u(Math.max(1,y>>d),Math.max(1,T>>d)),h=u(Math.max(1,y>>d),Math.max(1,T>>d))}},compile(b,R){let y=(A,v)=>{let S=t.createShader(A);return t.shaderSource(S,v),t.compileShader(S),t.getShaderParameter(S,t.COMPILE_STATUS)?S:D("SHADER_COMPILE_FAILED",t.getShaderInfoLog(S)??"(no log)")},T=y(t.VERTEX_SHADER,b);if(typeof T=="object"&&"kind"in T)return T;let w=y(t.FRAGMENT_SHADER,R);if(typeof w=="object"&&"kind"in w)return w;let x=t.createProgram();return t.attachShader(x,T),t.attachShader(x,w),t.linkProgram(x),t.getProgramParameter(x,t.LINK_STATUS)?(E.push(x),x):D("PROGRAM_LINK_FAILED",t.getProgramInfoLog(x)??"(no log)")},bindTarget(b){t.bindFramebuffer(t.FRAMEBUFFER,b?b.framebuffer:null),t.viewport(0,0,b?b.width:l.w,b?b.height:l.h)},blit(b,R){t.useProgram(b),t.bindVertexArray(f),R?.(b),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null)},dispose(){for(let b of E)t.deleteProgram(b);for(let b of[c,m,h])"kind"in b||(t.deleteFramebuffer(b.framebuffer),t.deleteTexture(b.texture));t.deleteBuffer(p),t.deleteVertexArray(f)}}}var te=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function re(r,n){let t=new Float32Array(16);for(let e=0;e<4;e++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=r[i*4+o]*n[e*4+i];t[e*4+o]=a}return t}var j=(r,n)=>[r[0]-n[0],r[1]-n[1],r[2]-n[2]],ee=(r,n)=>r[0]*n[0]+r[1]*n[1]+r[2]*n[2],z=(r,n)=>[r[1]*n[2]-r[2]*n[1],r[2]*n[0]-r[0]*n[2],r[0]*n[1]-r[1]*n[0]];function N(r){let n=Math.hypot(r[0],r[1],r[2]);return n===0?r:[r[0]/n,r[1]/n,r[2]/n]}function ge(r,n,t,e){let o=1/Math.tan(r/2);return new Float32Array([o/n,0,0,0,0,o,0,0,0,0,(e+t)/(t-e),-1,0,0,2*e*t/(t-e),0])}function ye(r,n,t,e,o,a){let i=n-r,s=e-t,u=a-o;return new Float32Array([2/i,0,0,0,0,2/s,0,0,0,0,-2/u,0,-(n+r)/i,-(e+t)/s,-(a+o)/u,1])}function ne(r,n,t){let e=N(j(r,n)),o=z(t,e);if(Math.hypot(o[0],o[1],o[2])<1e-8)return te();let a=N(o),i=z(e,a);return new Float32Array([a[0],i[0],e[0],0,a[1],i[1],e[1],0,a[2],i[2],e[2],0,-ee(a,r),-ee(i,r),-ee(e,r),1])}function Ze(r,n){let t=[0,1,2,3].map(o=>r[0+o]*n[0]+r[4+o]*n[1]+r[8+o]*n[2]+r[12+o]),e=t[3];return{x:t[0]/e,y:t[1]/e,z:t[2]/e,w:e}}function k(r,n,t,e){let o=Ze(r,n);return{sx:(o.x*.5+.5)*t,sy:(1-(o.y*.5+.5))*e,behind:o.w<=0}}function Je(r){return r<=.04045?r/12.92:Math.pow((r+.055)/1.055,2.4)}var St=/^#?([0-9a-fA-F]{6})$/;function Q(r){let n=St.exec(r.trim());if(!n)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(r)}`);let t=n[1];return[0,2,4].map(e=>Je(parseInt(t.slice(e,e+2),16)/255))}var Re={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},_t=Object.freeze(Object.fromEntries(Object.keys(Re).map(r=>[r,Q(Re[r])])));var et=.4;var Ae=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${et.toFixed(2)}); }`,Me=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function Dt(r){let n=[1/0,1/0,1/0],t=[-1/0,-1/0,-1/0];for(let e=0;e<r.length;e+=3)for(let o=0;o<3;o++){let a=r[e+o];a<n[o]&&(n[o]=a),a>t[o]&&(t[o]=a)}return r.length===0?{min:[0,0,0],max:[0,0,0]}:{min:n,max:t}}function tt(r,n,t,e){let o=new Float32Array(r.length);for(let i=0;i<e.length;i+=3){let s=e[i],u=e[i+1],d=e[i+2],l=s*3,c=u*3,m=d*3,h=s*2,f=u*2,p=d*2,E=r[c]-r[l],M=r[c+1]-r[l+1],b=r[c+2]-r[l+2],R=r[m]-r[l],y=r[m+1]-r[l+1],T=r[m+2]-r[l+2],w=t[f]-t[h],x=t[f+1]-t[h+1],A=t[p]-t[h],v=t[p+1]-t[h+1],S=w*v-A*x;if(Math.abs(S)<1e-12)continue;let _=1/S,Y=(E*v-R*x)*_,G=(M*v-y*x)*_,K=(b*v-T*x)*_;for(let X of[l,c,m])o[X]=o[X]+Y,o[X+1]=o[X+1]+G,o[X+2]=o[X+2]+K}let a=new Float32Array(r.length);for(let i=0;i<a.length;i+=3){let s=n[i],u=n[i+1],d=n[i+2],l=o[i],c=o[i+1],m=o[i+2],h=l*s+c*u+m*d;l-=s*h,c-=u*h,m-=d*h;let f=Math.hypot(l,c,m);f<1e-8&&(Math.abs(s)<.9?(l=0,c=-d,m=u):(l=-d,c=0,m=s),f=Math.hypot(l,c,m)||1),a[i]=l/f,a[i+1]=c/f,a[i+2]=m/f}return a}function rt(r,n){let t=new Float32Array(r.length);for(let e=0;e<n.length;e+=3){let o=n[e]*3,a=n[e+1]*3,i=n[e+2]*3,s=r[a]-r[o],u=r[a+1]-r[o+1],d=r[a+2]-r[o+2],l=r[i]-r[o],c=r[i+1]-r[o+1],m=r[i+2]-r[o+2],h=u*m-d*c,f=d*l-s*m,p=s*c-u*l;for(let E of[o,a,i])t[E]=t[E]+h,t[E+1]=t[E+1]+f,t[E+2]=t[E+2]+p}for(let e=0;e<t.length;e+=3){let o=Math.hypot(t[e],t[e+1],t[e+2]);o>0&&(t[e]=t[e]/o,t[e+1]=t[e+1]/o,t[e+2]=t[e+2]/o)}return t}function nt(r,n,t,e,o){let{min:a,max:i}=Dt(r),s=e??rt(r,t);return{positions:r,normals:s,uvs:n,indices:t,min:a,max:i,tangents:o??tt(r,s,n,t)}}function ve(r=1,n=1,t=1){let e=r/2,o=n/2,a=t/2,i=[[[-e,-o,a],[e,-o,a],[e,o,a],[-e,o,a]],[[e,-o,-a],[-e,-o,-a],[-e,o,-a],[e,o,-a]],[[e,-o,a],[e,-o,-a],[e,o,-a],[e,o,a]],[[-e,-o,-a],[-e,-o,a],[-e,o,a],[-e,o,-a]],[[-e,o,a],[e,o,a],[e,o,-a],[-e,o,-a]],[[-e,-o,-a],[e,-o,-a],[e,-o,a],[-e,-o,a]]],s=new Float32Array(72),u=new Float32Array(48),d=new Uint16Array(36),l=0,c=0,m=0,h=0;for(let f of i){for(let[p,E,M]of f)s[l++]=p,s[l++]=E,s[l++]=M;u[c++]=0,u[c++]=0,u[c++]=1,u[c++]=0,u[c++]=1,u[c++]=1,u[c++]=0,u[c++]=1,d[m++]=h,d[m++]=h+1,d[m++]=h+2,d[m++]=h,d[m++]=h+2,d[m++]=h+3,h+=4}return nt(s,u,d)}function Fe(r=10,n=24){let t=Math.max(1,Math.floor(n)),e=(t+1)*(t+1),o=new Float32Array(e*3),a=new Float32Array(e*3),i=new Float32Array(e*2),s=new Uint16Array(t*t*6),u=0,d=0,l=0;for(let c=0;c<=t;c++)for(let m=0;m<=t;m++){let h=(m/t-.5)*r,f=(c/t-.5)*r;o[u]=h,o[u+1]=0,o[u+2]=f,a[u]=0,a[u+1]=1,a[u+2]=0,u+=3,i[d++]=m/t,i[d++]=c/t}for(let c=0;c<t;c++)for(let m=0;m<t;m++){let h=c*(t+1)+m,f=h+1,p=h+(t+1),E=p+1;s[l++]=h,s[l++]=p,s[l++]=f,s[l++]=f,s[l++]=p,s[l++]=E}return nt(o,i,s,a)}function Le(r){return r.indices.length/3}function Pt(r){if(!Number.isFinite(r)||r===0)return"0";let n=r.toFixed(12).replace(/0+$/,"").replace(/\.$/,"");return n==="-0"?"0":n}function ot(r,n,t,e){let[o,a]=r,[i,s]=n,[u,d]=t,[l,c]=e,m=o-i+u-l,h=a-s+d-c;if(Math.abs(m)<1e-9&&Math.abs(h)<1e-9){let T=[i-o,l-o,o,s-a,c-a,a,0,0,1],w=T[0]*T[4]-T[1]*T[3];return Math.abs(w)<1e-9?null:T}let f=i-u,p=l-u,E=s-d,M=c-d,b=f*M-p*E;if(Math.abs(b)<1e-9)return null;let R=(m*M-p*h)/b,y=(f*h-m*E)/b;return[i-o+R*i,l-o+y*l,o,s-a+R*s,c-a+y*c,a,R,y,1]}function we(r,n,t,e,o,a){if(!(o>0)||!(a>0))return{refusal:"EMPTY_ELEMENT_BOX"};let s=[n.topLeft,n.topRight,n.bottomRight,n.bottomLeft].map(_=>k(r,_,t,e));if(s.some(_=>_.behind))return{refusal:"CORNER_BEHIND_CAMERA"};let u=s.map(_=>({x:_.sx,y:_.sy})),[d,l,c,m]=u,h=ot([d.x,d.y],[l.x,l.y],[c.x,c.y],[m.x,m.y]);if(!h)return{refusal:"DEGENERATE_ON_SCREEN"};let f=.5*(d.x*l.y-l.x*d.y+(l.x*c.y-c.x*l.y)+(c.x*m.y-m.x*c.y)+(m.x*d.y-d.x*m.y)),p=1/o,E=1/a,[M,b,R,y,T,w,x,A,v]=h;return{transform:`matrix3d(${[M*p,y*p,0,x*p,b*E,T*E,0,A*E,0,0,1,0,R,w,0,v].map(Pt).join(", ")})`,matrix:h,screen:u,signedArea:f}}function Se(r){return"refusal"in r}var _e=89,De=Math.PI/180;function oe(r){let n=Math.max(-_e,Math.min(_e,r.elevationDeg))*De,t=r.azimuthDeg*De,e=Math.max(1e-4,r.distance),o=Math.sin(n)*e,a=Math.cos(n)*e;return[r.target[0]+Math.sin(t)*a,r.target[1]+o,r.target[2]+Math.cos(t)*a]}function ae(r,n){let t=oe(r),e=r.near??Math.max(.01,r.distance/100),o=r.far??Math.max(e+1,r.distance*8),a=ge((r.fovDeg??38)*De,Math.max(.001,n),e,o),i=ne(t,r.target,[0,1,0]);return re(a,i)}function Pe(r,n,t){let e=N(r.direction),o=r.extent??Math.max(.1,t*1.35),a=Math.max(1,t*2),i=[n[0]-e[0]*a,n[1]-e[1]*a,n[2]-e[2]*a],s=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],u=ne(i,n,s),d=ye(-o,o,-o,o,.01,a+t*2+o);return re(d,u)}function Ue(r,n){let t=j([n[0],n[1],n[2]],[r[0],r[1],r[2]]);return Math.hypot(t[0],t[1],t[2])/2}function Ne(r,n){return[(r[0]+n[0])/2,(r[1]+n[1])/2,(r[2]+n[2])/2]}function Oe(r,n,t){let{gl:e}=r,o=Math.max(1,Math.floor(n)),a=Math.max(1,Math.floor(t)),i=e.createFramebuffer(),s=e.createTexture(),u=e.createTexture();if(!i||!s||!u)return D("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let d=r.hdr?e.RGBA16F:e.RGBA8,l=r.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,c=()=>{e.bindTexture(e.TEXTURE_2D,s),e.texImage2D(e.TEXTURE_2D,0,d,o,a,0,e.RGBA,l,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,u),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,o,a,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,s,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,u,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};c(),e.bindFramebuffer(e.FRAMEBUFFER,i);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE?D("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${m.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:s,depthTexture:u,get width(){return o},get height(){return a},bind(){e.bindFramebuffer(e.FRAMEBUFFER,i),e.viewport(0,0,o,a)},resize(h,f){let p=Math.max(1,Math.floor(h)),E=Math.max(1,Math.floor(f));p===o&&E===a||(o=p,a=E,c())},dispose(){e.deleteFramebuffer(i),e.deleteTexture(s),e.deleteTexture(u)}}}function Be(r,n=1024){let{gl:t}=r,e=Math.max(256,Math.min(2048,Math.floor(n))),o=t.createFramebuffer(),a=t.createTexture();if(!o||!a)return D("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");t.bindTexture(t.TEXTURE_2D,a),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,e,e,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,o),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,a,0);let i=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),i!==t.FRAMEBUFFER_COMPLETE?D("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:e,bind(){t.bindFramebuffer(t.FRAMEBUFFER,o),t.viewport(0,0,e,e)},dispose(){t.deleteFramebuffer(o),t.deleteTexture(a)}}}var se=`
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
}`,ie={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function ue(r,n,t={}){let e=t.zenith??ie.zenith,o=t.horizon??ie.horizon,a=t.ground??ie.ground;r.uniform3f(r.getUniformLocation(n,"uSkyZenith"),e[0],e[1],e[2]),r.uniform3f(r.getUniformLocation(n,"uSkyHorizon"),o[0],o[1],o[2]),r.uniform3f(r.getUniformLocation(n,"uSkyGround"),a[0],a[1],a[2])}var Ut=`#version 300 es
precision highp float;
out vec2 vNdc;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`,Nt=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${se}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;function Ce(r){let{gl:n}=r,t=r.compile(Ut,Nt);return"kind"in t?t:{draw(e){let o=N(j(e.target,e.eye)),a=Math.abs(o[1])>.999?[0,0,1]:[0,1,0],i=N(z(o,a)),s=N(z(i,o));n.disable(n.DEPTH_TEST),n.depthMask(!1),n.disable(n.BLEND),n.useProgram(t),n.uniform3f(n.getUniformLocation(t,"uRight"),i[0],i[1],i[2]),n.uniform3f(n.getUniformLocation(t,"uUp"),s[0],s[1],s[2]),n.uniform3f(n.getUniformLocation(t,"uForward"),o[0],o[1],o[2]),n.uniform1f(n.getUniformLocation(t,"uTanHalfFov"),Math.tan(e.fovDeg*Math.PI/360)),n.uniform1f(n.getUniformLocation(t,"uAspect"),Math.max(.001,e.aspect)),ue(n,t,e.sky),r.blit(t),n.depthMask(!0),n.enable(n.DEPTH_TEST)},dispose(){n.deleteProgram(t)}}}var at=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,Ie=`#version 300 es
precision highp float;
void main(){}`,Ot=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,it=`#version 300 es
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
}`,st=`#version 300 es
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
${se}

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
}`;function ce(r,n){let{gl:t}=r,e=t.createVertexArray(),o=t.createBuffer(),a=t.createBuffer(),i=t.createBuffer(),s=t.createBuffer();return!e||!o||!a||!i||!s?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(t.bindVertexArray(e),t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,n.positions,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,a),t.bufferData(t.ARRAY_BUFFER,n.normals,t.STATIC_DRAW),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,i),t.bufferData(t.ARRAY_BUFFER,n.tangents,t.STATIC_DRAW),t.enableVertexAttribArray(2),t.vertexAttribPointer(2,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,s),t.bufferData(t.ELEMENT_ARRAY_BUFFER,n.indices,t.STATIC_DRAW),t.bindVertexArray(null),{vao:e,indexCount:n.indices.length,indexType:n.indices instanceof Uint32Array?t.UNSIGNED_INT:t.UNSIGNED_SHORT,dispose(){t.deleteVertexArray(e),t.deleteBuffer(o),t.deleteBuffer(a),t.deleteBuffer(i),t.deleteBuffer(s)}})}function Ge(r){let{gl:n}=r,t=r.compile(at,Ie);if("kind"in t)return t;let e=r.compile(it,st);if("kind"in e)return e;let o=r.compile(Ot,Ie);if("kind"in o)return o;let a=(i,s)=>n.getUniformLocation(i,s);return{shadowPass(i,s,u,d){let l=d??(()=>{});u.bind(),l("shadow.bind"),n.clear(n.DEPTH_BUFFER_BIT),n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.FRONT),n.useProgram(t),l("useProgram(shadow)"),n.uniformMatrix4fv(a(t,"uLightVP"),!1,i),l("uLightVP");for(let c of s)n.uniformMatrix4fv(a(t,"uModel"),!1,c.model),l("shadow uModel"),n.bindVertexArray(c.mesh.vao),l("shadow bindVAO"),n.drawElements(n.TRIANGLES,c.mesh.indexCount,c.mesh.indexType,0),l("shadow drawElements");n.bindVertexArray(null),n.cullFace(n.BACK)},depthPrepass(i,s){n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.colorMask(!1,!1,!1,!1),n.useProgram(o),n.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let u of s)n.uniformMatrix4fv(a(o,"uModel"),!1,u.model),n.bindVertexArray(u.mesh.vao),n.drawElements(n.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0);n.bindVertexArray(null),n.colorMask(!0,!0,!0,!0)},draw(i){let s=i.onStep??(()=>{});n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.useProgram(e),n.uniformMatrix4fv(a(e,"uViewProj"),!1,i.viewProj),s("uViewProj"),n.uniform3fv(a(e,"uEye"),i.eye),s("uEye"),n.uniform3fv(a(e,"uLightDir"),i.lightDir),s("uLightDir"),n.uniform3fv(a(e,"uLightColour"),i.lightColour),s("uLightColour"),n.uniform1f(a(e,"uAmbientGain"),i.ambientGain??1),s("uAmbientGain"),ue(n,e,i.sky),s("bindSky"),i.ao&&i.screenSize?(n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,i.ao),n.uniform1i(a(e,"uAO"),1),n.uniform2f(a(e,"uScreenSize"),i.screenSize[0],i.screenSize[1]),n.uniform1f(a(e,"uAOEnabled"),1)):n.uniform1f(a(e,"uAOEnabled"),0),s("bindAO"),n.uniformMatrix4fv(a(e,"uLightVP"),!1,i.lightVP),s("lit uLightVP"),i.shadow?(n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,i.shadow.depthTexture),n.uniform1i(a(e,"uShadowMap"),0),n.uniform1f(a(e,"uShadowTexel"),1/i.shadow.size),n.uniform1f(a(e,"uShadowStrength"),i.shadowStrength??1)):n.uniform1f(a(e,"uShadowStrength"),0);for(let u of i.draws)n.uniformMatrix4fv(a(e,"uModel"),!1,u.model),n.uniformMatrix3fv(a(e,"uNormalMat"),!1,u.normalMat),s("uNormalMat"),n.uniform3fv(a(e,"uBaseColour"),u.material.baseColour),s("uBaseColour"),n.uniform1f(a(e,"uRoughness"),u.material.roughness),n.uniform1f(a(e,"uMetalness"),u.material.metalness),n.uniform1f(a(e,"uAnisotropy"),u.material.anisotropy??0),n.bindVertexArray(u.mesh.vao),s("lit bindVAO"),n.drawElements(n.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0),s("lit drawElements");n.bindVertexArray(null),n.disable(n.CULL_FACE)},dispose(){n.deleteProgram(t),n.deleteProgram(e),n.deleteProgram(o)}}}var q=`
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
}`,ut=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Bt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${q}

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
}`,Ct=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${q}

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
}`;function ke(r,n,t){let{gl:e}=r,o=r.compile(ut,Bt);if("kind"in o)return o;let a=r.compile(ut,Ct);if("kind"in a)return a;let i=Math.max(1,n>>1),s=Math.max(1,t>>1),u=()=>{let f=e.createFramebuffer(),p=e.createTexture();return!f||!p?null:{fb:f,tex:p}},d=u(),l=u();if(!d||!l)return D("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let c=()=>{for(let f of[d,l])e.bindTexture(e.TEXTURE_2D,f.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,i,s,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,f.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,f.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};c(),e.bindFramebuffer(e.FRAMEBUFFER,d.fb);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE)return D("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${m.toString(16)}).`);let h=(f,p,E,M,b,R,y)=>{e.activeTexture(e.TEXTURE0+y),e.bindTexture(e.TEXTURE_2D,p),e.uniform1i(e.getUniformLocation(f,"uDepth"),y),e.uniform2f(e.getUniformLocation(f,"uNearFar"),E,M),e.uniform1f(e.getUniformLocation(f,"uTanHalfFov"),Math.tan(b*Math.PI/360)),e.uniform1f(e.getUniformLocation(f,"uAspect"),R)};return{get texture(){return d.tex},get width(){return i},get height(){return s},compute(f){e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,d.fb),e.viewport(0,0,i,s),e.useProgram(o),h(o,f.depthTexture,f.near,f.far,f.fovDeg,f.aspect,0),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/i,1/s),e.uniform1f(e.getUniformLocation(o,"uRadius"),f.radius??.55),e.uniform1f(e.getUniformLocation(o,"uStrength"),f.strength??1.15),e.uniform1f(e.getUniformLocation(o,"uBias"),f.bias??.035),r.blit(o);for(let[p,E,M]of[[d,l,[1,0]],[l,d,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,E.fb),e.viewport(0,0,i,s),e.useProgram(a),h(a,f.depthTexture,f.near,f.far,f.fovDeg,f.aspect,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,p.tex),e.uniform1i(e.getUniformLocation(a,"uAO"),1),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/i,1/s),e.uniform2f(e.getUniformLocation(a,"uDir"),M[0],M[1]),r.blit(a);e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(f,p){let E=Math.max(1,f>>1),M=Math.max(1,p>>1);E===i&&M===s||(i=E,s=M,c())},dispose(){e.deleteProgram(o),e.deleteProgram(a);for(let f of[d,l])e.deleteFramebuffer(f.fb),e.deleteTexture(f.tex)}}}var It=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Gt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uFocusDistance;
uniform float uAperture;
uniform float uMaxCoc;
out vec4 frag;
${q}

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
}`;function Ve(r,n,t){let{gl:e}=r,o=r.compile(It,Gt);if("kind"in o)return o;let a=Math.max(1,Math.floor(n)),i=Math.max(1,Math.floor(t)),s=e.createFramebuffer(),u=e.createTexture();if(!s||!u)return D("FRAMEBUFFER_INCOMPLETE","The GPU refused a depth-of-field buffer.");let d=()=>{e.bindTexture(e.TEXTURE_2D,u);let c=r.hdr?e.RGBA16F:e.RGBA8,m=r.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE;e.texImage2D(e.TEXTURE_2D,0,c,a,i,0,e.RGBA,m,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,s),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,u,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};d(),e.bindFramebuffer(e.FRAMEBUFFER,s);let l=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),l!==e.FRAMEBUFFER_COMPLETE?D("FRAMEBUFFER_INCOMPLETE",`The DOF buffer is incomplete (0x${l.toString(16)}).`):{texture:u,apply(c){e.bindFramebuffer(e.FRAMEBUFFER,s),e.viewport(0,0,a,i),e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.useProgram(o),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,c.scene),e.uniform1i(e.getUniformLocation(o,"uScene"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,c.depthTexture),e.uniform1i(e.getUniformLocation(o,"uDepth"),1),e.uniform2f(e.getUniformLocation(o,"uNearFar"),c.near,c.far),e.uniform1f(e.getUniformLocation(o,"uTanHalfFov"),Math.tan(c.fovDeg*Math.PI/360)),e.uniform1f(e.getUniformLocation(o,"uAspect"),c.aspect),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/a,1/i),e.uniform1f(e.getUniformLocation(o,"uFocusDistance"),c.focusDistance),e.uniform1f(e.getUniformLocation(o,"uAperture"),c.aperture??12),e.uniform1f(e.getUniformLocation(o,"uMaxCoc"),c.maxCoc??.012),r.blit(o),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(c,m){let h=Math.max(1,Math.floor(c)),f=Math.max(1,Math.floor(m));h===a&&f===i||(a=h,i=f,d())},dispose(){e.deleteProgram(o),e.deleteFramebuffer(s),e.deleteTexture(u)}}}var he=new URLSearchParams(location.search),de=he.get("dof")!=="0",We=he.get("ao")!=="0",P=Math.max(1,Math.min(3,Number(he.get("scale")??1))),bt=Number(he.get("frames")??300),F=1200*P,L=720*P,V=document.getElementById("c");V.width=F;V.height=L;var Et=document.getElementById("log");function xt(r){throw document.title="REFUSED",Et.textContent=r,new Error(r)}function B(r,n){return"kind"in n&&xt(`${r}: ${n.code} \u2014 ${n.reason} ${n.detail??""}`),n}var le=Te(V,{alpha:!1});xe(le)||xt(`stage: ${le.code} \u2014 ${le.reason}`);var U=le,g=U.gl,kt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Vt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${Ae}
${Me}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,Ht=B("present",U.compile(kt,Vt)),He=B("lit",Ge(U)),W=B("target",Oe(U,F,L)),$e=B("shadow",Be(U,1536)),Xt=B("sky",Ce(U)),ct=B("ao",ke(U,F,L)),lt=B("dof",Ve(U,F,L)),H={target:[0,.62,.1],distance:8.4,azimuthDeg:1.5,elevationDeg:7.2,fovDeg:38},I=oe(H),Xe=H.fovDeg??38,Ye=Math.max(.01,H.distance/100),dt=Math.max(Ye+1,H.distance*8),fe=.06,Tt=[{id:"P1",x:-3.55,z:-1.25,w:1.72,h:1.3,hex:"#16203A",roughness:.5},{id:"P2",x:-1.62,z:.75,w:1.3,h:1.62,hex:"#16203A",roughness:.46},{id:"P3",x:.18,z:2.35,w:1.44,h:1.36,hex:"#2C6BFF",roughness:.42},{id:"P4",x:1.62,z:1.15,w:1.2,h:1.54,hex:"#2C6BFF",roughness:.44},{id:"P5",x:3.62,z:-2.1,w:1.78,h:1.18,hex:"#16203A",roughness:.52}],zt=.72,gt=Fe(30,24),yt=Tt.map(r=>ve(r.w,r.h,fe)),jt=B("deck mesh",ce(U,gt)),Wt=yt.map((r,n)=>B(`panel ${n} mesh`,ce(U,r))),Rt=(r,n,t,e)=>{let o=te(),a=Math.cos(e),i=Math.sin(e);return o[0]=a,o[2]=-i,o[8]=i,o[10]=a,o[12]=r,o[13]=n,o[14]=t,o},$t=r=>new Float32Array([r[0],r[1],r[2],r[4],r[5],r[6],r[8],r[9],r[10]]),O=Tt.map((r,n)=>{let t=Math.atan2(I[0]-r.x,I[2]-r.z)*zt,e=Math.cos(t),o=Math.sin(t),a=Rt(r.x,r.h/2,r.z,t),i=(u,d)=>[r.x+e*u+o*(fe/2),d,r.z-o*u+e*(fe/2)],s=i(0,r.h/2);return{...r,yaw:t,model:a,facePoint:i,mesh:Wt[n],normalMat:$t(a),eyeDistance:Math.hypot(I[0]-s[0],I[1]-s[1],I[2]-s[2])}}),At=O.reduce((r,n)=>n.eyeDistance<r.eyeDistance?n:r),pe=At.eyeDistance,Yt=new Float32Array([1,0,0,0,1,0,0,0,1]),ze=[{mesh:jt,model:Rt(0,0,0,0),normalMat:Yt,material:{baseColour:Q("#070B14"),roughness:.86,metalness:0}},...O.map(r=>({mesh:r.mesh,model:r.model,normalMat:r.normalMat,material:{baseColour:Q(r.hex),roughness:r.roughness,metalness:.06}}))],C=[.62,-.55,-.58],Mt=[-4.8,0,-4.6],vt=[6.2,1.9,3],Kt=Ne(Mt,vt),Qt=Ue(Mt,vt),ft=Pe({direction:C,colour:[1,1,1],extent:7.6},Kt,Qt),qt=[gt,...yt].reduce((r,n)=>r+Le(n),0);function me(){let r=ae(H,F/L);He.shadowPass(ft,ze,$e),W.bind(),g.clear(g.DEPTH_BUFFER_BIT),Xt.draw({eye:I,target:H.target,fovDeg:Xe,aspect:F/L}),He.depthPrepass(r,ze),We&&(ct.compute({depthTexture:W.depthTexture,near:Ye,far:dt,fovDeg:Xe,aspect:F/L,radius:.5,strength:1.3}),W.bind()),He.draw({viewProj:r,eye:I,lightDir:C,lightColour:[3.5,3.45,3.3],ambientGain:1.05,lightVP:ft,shadow:$e,shadowStrength:.92,draws:ze,ao:We?ct.texture:null,screenSize:[F,L]});let n=W.texture;de&&(lt.apply({scene:W.texture,depthTexture:W.depthTexture,near:Ye,far:dt,fovDeg:Xe,aspect:F/L,focusDistance:pe,aperture:.16,maxCoc:.014}),n=lt.texture),g.bindFramebuffer(g.FRAMEBUFFER,null),g.viewport(0,0,F,L),g.disable(g.DEPTH_TEST),g.activeTexture(g.TEXTURE0),g.bindTexture(g.TEXTURE_2D,n),U.blit(Ht,t=>g.uniform1i(g.getUniformLocation(t,"uScene"),0))}me();function Zt(r){me();let n=new Uint8Array(4);g.readPixels(0,0,1,1,g.RGBA,g.UNSIGNED_BYTE,n);let t=performance.now();for(let e=0;e<r;e++)me();return g.readPixels(0,0,1,1,g.RGBA,g.UNSIGNED_BYTE,n),(performance.now()-t)/r}var je=Zt(Math.max(1,bt)),be=ae(H,F/L),Jt=r=>[r.facePoint(-r.w/2,0),r.facePoint(r.w/2,0),r.facePoint(r.w/2,r.h),r.facePoint(-r.w/2,r.h)].map(n=>k(be,n,F,L)),$=O.map(Jt),Ke=(r,n,t)=>{let e=0;for(let o=0;o<4;o++){let a=r[o],i=r[(o+1)%4],s=(i.sx-a.sx)*(t-a.sy)-(i.sy-a.sy)*(n-a.sx);if(Math.abs(s)<1e-9)continue;let u=s>0?1:-1;if(e===0)e=u;else if(u!==e)return!1}return!0},Z=(()=>{let r=Math.hypot(C[0],C[1],C[2]);return[-C[0]/r,-C[1]/r,-C[2]/r]})(),Ft=(r,n,t,e)=>O.some((o,a)=>{if(a===e)return!1;let i=Math.cos(o.yaw),s=Math.sin(o.yaw),u=s*Z[0]+i*Z[2];if(Math.abs(u)<1e-6)return!1;let d=(s*(o.x-r)+i*(o.z-t))/u;if(d<=0)return!1;let l=r+Z[0]*d,c=n+Z[1]*d,m=t+Z[2]*d,h=(l-o.x)*i-(m-o.z)*s;return Math.abs(h)<=o.w/2&&c>=0&&c<=o.h}),er=O.map((r,n)=>{let t=0,e=0,o=0,a=null;for(let l=1;l<=15;l++)for(let c=1;c<=23;c++){let m=(c/24-.5)*r.w,h=l/16*r.h,f=r.facePoint(m,h),p=k(be,f,F,L);if(e++,Ft(f[0],f[1],f[2],n)&&o++,p.behind||p.sx<0||p.sx>=F||p.sy<0||p.sy>=L||O.some((M,b)=>b!==n&&M.eyeDistance<r.eyeDistance&&Ke($[b],p.sx,p.sy)))continue;t++;let E=Math.abs(m)/r.w+Math.abs(h-r.h/2)/r.h;(!a||E<a.rank)&&(a={sx:p.sx,sy:p.sy,rank:E})}let i=new Uint8Array(4);a&&g.readPixels(Math.round(a.sx),Math.round(L-a.sy),1,1,g.RGBA,g.UNSIGNED_BYTE,i);let s=Math.min(.014,Math.abs(1/pe-1/r.eyeDistance)*.16),u=$[n].map(l=>l.sx),d=$[n].map(l=>l.sy);return{id:r.id,hex:r.hex,eyeDistance:Number(r.eyeDistance.toFixed(2)),yawDeg:Number((r.yaw*180/Math.PI).toFixed(1)),cocPx:Number((s*(F/P)).toFixed(1)),visiblePct:Math.round(100*t/e),inShadowPct:Math.round(100*o/e),offFrame:$[n].some(l=>l.behind||l.sx<0||l.sx>F||l.sy<0||l.sy>L),screen:[Math.round(Math.min(...u)/P),Math.round(Math.min(...d)/P),Math.round(Math.max(...u)/P),Math.round(Math.max(...d)/P)],sample:a?{sx:Math.round(a.sx/P),sy:Math.round(a.sy/P),rgb:[i[0],i[1],i[2]]}:null}}),tr=(()=>{let r=new Uint8Array(4),n={lit:{r:0,g:0,b:0,n:0},shade:{r:0,g:0,b:0,n:0}};for(let e=-5;e<=5.001;e+=.25)for(let o=-3.5;o<=4.001;o+=.25){let a=k(be,[e,0,o],F,L);if(a.behind||a.sx<0||a.sx>=F||a.sy<0||a.sy>=L||$.some(s=>Ke(s,a.sx,a.sy)))continue;g.readPixels(Math.round(a.sx),Math.round(L-a.sy),1,1,g.RGBA,g.UNSIGNED_BYTE,r);let i=Ft(e,0,o,-1)?n.shade:n.lit;i.r+=r[0],i.g+=r[1],i.b+=r[2],i.n+=1}let t=e=>e.n===0?null:[Math.round(e.r/e.n),Math.round(e.g/e.n),Math.round(e.b/e.n)];return{litSamples:n.lit.n,litRgb:t(n.lit),shadowedSamples:n.shade.n,shadowedRgb:t(n.shade)}})(),rr={P1:{tag:"E0 \xB7 HARNESS",state:"SHIPPED",note:"GGX + shadows + AO + DOF, 4.41 ms/frame measured on the M1"},P2:{tag:"E8 \xB7 THE FORGE",state:"LIVE",note:"on the sign-in route, verified in both themes against a pixel ratchet"},P3:{tag:"E1 \xB7 THIS ROOM",state:"IN BUILD",note:"real DOM content projected onto lit GL surfaces \u2014 the panel you are reading"},P4:{tag:"E2 \xB7 THE GLOBE",state:"GATED",note:"7 corridors, lift monotonic with distance; \xA77(b) still unmeasured"},P5:{tag:"E3\u2013E7",state:"NOT STARTED",note:"pipeline, orrery, surface, vault, storm"}},mt=250,ht=.11,J=.1,Qe=document.createElement("div");Qe.style.cssText="position:absolute;inset:0;pointer-events:none";var Ee=document.createElement("div");Ee.style.cssText="position:relative;width:1200px;height:720px";V.parentNode?.insertBefore(Ee,V);Ee.appendChild(V);Ee.appendChild(Qe);var nr=[...O].map((r,n)=>({p:r,i:n})).sort((r,n)=>n.p.eyeDistance-r.p.eyeDistance),or=[0,.06,-.06,.12,-.12,.18,-.18,.24,-.24,.3,-.3,.36,-.36],ar=[1,.92,.84,.76,.68,.6],Lt=r=>Math.min(.014,Math.abs(1/pe-1/r)*.16)*(F/P),pt=Math.max(...O.map(r=>Lt(r.eyeDistance))),ir=2.4,sr=nr.map(({p:r,i:n})=>{let t=rr[r.id],e=fe/2+.008,o=Math.cos(r.yaw),a=Math.sin(r.yaw),i=(x,A)=>[r.x+o*x+a*e,A,r.z-a*x+o*e],s=(x,A,v)=>({topLeft:i(v-x/2,J+A),topRight:i(v+x/2,J+A),bottomRight:i(v+x/2,J),bottomLeft:i(v-x/2,J)}),u=x=>x.filter(A=>O.some((v,S)=>S!==n&&v.eyeDistance<r.eyeDistance&&Ke($[S],A.x*P,A.y*P))).length,d=null,l=null,c=4;e:for(let x of ar){let A=Math.max(.2,(r.w-2*ht)*x),v=Math.max(.2,(r.h-2*J)*x),S=Math.round(A*mt),_=Math.round(v*mt);for(let Y of or){if(Math.abs(Y)+A/2>r.w/2-ht*.5)continue;let G=we(be,s(A,v,Y),F/P,L/P,S,_);if(Se(G)){l=G.refusal;continue}let K=u(G.screen);if(c=Math.min(c,K),K===0&&G.signedArea>0){d={proj:G,ew:S,eh:_,shift:Y,scale:x,occluded:K};break e}}}if(!d)return{id:r.id,shown:!1,refusal:l??"NO_UNOCCLUDED_PLACEMENT",backFacing:!1,occludedCorners:c,contentShift:null,contentScale:null,perspectiveX:null,elementPx:null,rectError:null};let{proj:m,ew:h,eh:f}=d,p=r.hex==="#2C6BFF",E=p?"rgba(255,255,255,0.78)":"#7fb2ff",M=p?"rgba(255,255,255,0.80)":"rgba(198,212,236,0.78)",b=Lt(r.eyeDistance),R=de?ir*(b/Math.max(1e-6,pt)):0,y=de?1-.42*(b/Math.max(1e-6,pt)):1,T=document.createElement("div");T.style.cssText=["position:absolute","left:0","top:0",`width:${h}px`,`height:${f}px`,"transform-origin:0 0",`transform:${m.transform}`,"display:flex","flex-direction:column","justify-content:flex-end","gap:7px","overflow:hidden",`filter:blur(${R.toFixed(2)}px)`,`opacity:${y.toFixed(3)}`,"-webkit-font-smoothing:antialiased"].join(";"),T.innerHTML=`<div style="font:600 11px/1 ui-monospace,monospace;letter-spacing:.14em;color:${E}">${t.tag}</div><div style="font:700 27px/1.02 system-ui,sans-serif;color:#fff;letter-spacing:-0.01em">${t.state}</div><div style="font:400 11.5px/1.45 system-ui,sans-serif;color:${M}">${t.note}</div>`,Qe.appendChild(T);let w=null;{let x=V.getBoundingClientRect(),A=T.getBoundingClientRect(),v=m.screen.map(_=>_.x),S=m.screen.map(_=>_.y);w=Number(Math.max(Math.abs(A.left-x.left-Math.min(...v)),Math.abs(A.top-x.top-Math.min(...S)),Math.abs(A.right-x.left-Math.max(...v)),Math.abs(A.bottom-x.top-Math.max(...S))).toFixed(2))}return{id:r.id,shown:!0,refusal:null,backFacing:!1,occludedCorners:0,contentShift:Number(d.shift.toFixed(2)),contentScale:d.scale,perspectiveX:Number((m.matrix[6]*1e3).toFixed(3)),elementPx:[h,f],cocPx:Number(b.toFixed(1)),domBlurPx:Number(R.toFixed(2)),domOpacity:Number(y.toFixed(3)),rectError:w}}),wt={dof:de,ao:We,hdr:U.hdr,eye:I.map(r=>Number(r.toFixed(2))),focusPanel:At.id,focusDistance:Number(pe.toFixed(2)),panels:er,projections:sr,deck:tr,glError:g.getError(),triangles:qt,shadowMap:$e.size,resolution:`${F}x${L}`,dprScale:P,frames:bt,msPerFrame:Number(je.toFixed(3)),fps:Math.round(1e3/je),budget60:16.6,headroom:Number((16.6-je).toFixed(3)),renderer:(()=>{let r=g.getExtension("WEBGL_debug_renderer_info");return r?String(g.getParameter(r.UNMASKED_RENDERER_WEBGL)):"unknown"})()};globalThis.E1=wt;Et.textContent=JSON.stringify(wt,null,2);me();document.title="READY";

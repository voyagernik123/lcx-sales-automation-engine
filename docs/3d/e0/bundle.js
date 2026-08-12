var st={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected.",FEEDBACK_LOOP:"A layer of this view was asked to read the surface it draws into, which every driver refuses, so the layer is not being drawn. This is a defect in the renderer, not in the data."};function M(n,r){return r===void 0?{kind:"refused",code:n,reason:st[n]}:{kind:"refused",code:n,reason:st[n],detail:r}}function Ee(n){return n.kind==="stage"}function Te(n,r={}){let t=n.getContext("webgl2",{antialias:r.antialias??!1,alpha:r.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!t)return M("NO_WEBGL2");let e=t.getExtension("EXT_color_buffer_float"),a=n.width,o=n.height,i=e?t.RGBA16F:t.RGBA8,u=e?t.HALF_FLOAT:t.UNSIGNED_BYTE,l=(b,x)=>{let A=t.createTexture();t.bindTexture(t.TEXTURE_2D,A),t.texImage2D(t.TEXTURE_2D,0,i,b,x,0,t.RGBA,u,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);let y=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,y),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,A,0);let v=t.checkFramebufferStatus(t.FRAMEBUFFER);return v!==t.FRAMEBUFFER_COMPLETE?M("FRAMEBUFFER_INCOMPLETE",`status 0x${v.toString(16)} at ${b}\xD7${x}`):{texture:A,framebuffer:y,width:b,height:x}},s=r.bloomShift??2,f={w:a,h:o},c=l(a,o);if("kind"in c)return c;let d=l(Math.max(1,a>>s),Math.max(1,o>>s));if("kind"in d)return d;let p=l(Math.max(1,a>>s),Math.max(1,o>>s));if("kind"in p)return p;let E=t.createVertexArray();t.bindVertexArray(E);let m=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,m),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null);let T=[];return{kind:"stage",gl:t,cssWidth:n.clientWidth||a,cssHeight:n.clientHeight||o,hdr:!!e,get width(){return f.w},get height(){return f.h},get scene(){return c},get bloomA(){return d},get bloomB(){return p},setRegion(b,x){let A=Math.max(1,Math.round(b)),y=Math.max(1,Math.round(x));if(!(A===f.w&&y===f.h)){f={w:A,h:y};for(let v of[c,d,p])"kind"in v||(t.deleteFramebuffer(v.framebuffer),t.deleteTexture(v.texture));c=l(A,y),d=l(Math.max(1,A>>s),Math.max(1,y>>s)),p=l(Math.max(1,A>>s),Math.max(1,y>>s))}},compile(b,x){let A=($,k)=>{let P=t.createShader($);if(t.shaderSource(P,k),t.compileShader(P),!t.getShaderParameter(P,t.COMPILE_STATUS)){let Y=t.getShaderInfoLog(P)??"(no log)";return t.deleteShader(P),M("SHADER_COMPILE_FAILED",Y)}return P},y=A(t.VERTEX_SHADER,b);if(typeof y=="object"&&"kind"in y)return y;let v=A(t.FRAGMENT_SHADER,x);if(typeof v=="object"&&"kind"in v)return t.deleteShader(y),v;let S=t.createProgram();if(t.attachShader(S,y),t.attachShader(S,v),t.linkProgram(S),!t.getProgramParameter(S,t.LINK_STATUS)){let $=t.getProgramInfoLog(S)??"(no log)";return t.deleteShader(y),t.deleteShader(v),t.deleteProgram(S),M("PROGRAM_LINK_FAILED",$)}return t.detachShader(S,y),t.detachShader(S,v),t.deleteShader(y),t.deleteShader(v),T.push(S),S},bindTarget(b){t.bindFramebuffer(t.FRAMEBUFFER,b?b.framebuffer:null),t.viewport(0,0,b?b.width:f.w,b?b.height:f.h)},blit(b,x){t.useProgram(b),t.bindVertexArray(E),x?.(b),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null)},dispose(){for(let b of T)t.deleteProgram(b);for(let b of[c,d,p])"kind"in b||(t.deleteFramebuffer(b.framebuffer),t.deleteTexture(b.texture));t.deleteBuffer(m),t.deleteVertexArray(E)}}}var ne=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function oe(n,r){let t=new Float32Array(16);for(let e=0;e<4;e++)for(let a=0;a<4;a++){let o=0;for(let i=0;i<4;i++)o+=n[i*4+a]*r[e*4+i];t[e*4+a]=o}return t}var X=(n,r)=>[n[0]-r[0],n[1]-r[1],n[2]-r[2]],re=(n,r)=>n[0]*r[0]+n[1]*r[1]+n[2]*r[2],H=(n,r)=>[n[1]*r[2]-n[2]*r[1],n[2]*r[0]-n[0]*r[2],n[0]*r[1]-n[1]*r[0]];function U(n){let r=Math.hypot(n[0],n[1],n[2]);return r===0?n:[n[0]/r,n[1]/r,n[2]/r]}function xe(n,r,t,e){let a=1/Math.tan(n/2);return new Float32Array([a/r,0,0,0,0,a,0,0,0,0,(e+t)/(t-e),-1,0,0,2*e*t/(t-e),0])}function ye(n,r,t,e,a,o){let i=r-n,u=e-t,l=o-a;return new Float32Array([2/i,0,0,0,0,2/u,0,0,0,0,-2/l,0,-(r+n)/i,-(e+t)/u,-(o+a)/l,1])}function ae(n,r,t){let e=U(X(n,r)),a=H(t,e);if(Math.hypot(a[0],a[1],a[2])<1e-8)return ne();let o=U(a),i=H(e,o);return new Float32Array([o[0],i[0],e[0],0,o[1],i[1],e[1],0,o[2],i[2],e[2],0,-re(o,n),-re(i,n),-re(e,n),1])}function ut(n){return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4)}function ge(n){return n<=.0031308?n*12.92:1.055*Math.pow(n,1/2.4)-.055}var kt=/^#?([0-9a-fA-F]{6})$/;function W(n){let r=kt.exec(n.trim());if(!r)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(n)}`);let t=r[1];return[0,2,4].map(e=>ut(parseInt(t.slice(e,e+2),16)/255))}function Fe(n){return`#${n.map(t=>{let e=ge(Math.min(1,Math.max(0,t)));return Math.round(e*255).toString(16).padStart(2,"0")}).join("")}`}var z={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},Re=Object.freeze(Object.fromEntries(Object.keys(z).map(n=>[n,W(z[n])])));var lt=.4;var Ae=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${lt.toFixed(2)}); }`,ve=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function Me(){let n=[];for(let r of Object.keys(z)){let t=z[r].toLowerCase(),e=Fe(Re[r]).toLowerCase();e!==t&&n.push({key:r,expected:t,actual:e})}return n}function Vt(n){let r=[1/0,1/0,1/0],t=[-1/0,-1/0,-1/0];for(let e=0;e<n.length;e+=3)for(let a=0;a<3;a++){let o=n[e+a];o<r[a]&&(r[a]=o),o>t[a]&&(t[a]=o)}return n.length===0?{min:[0,0,0],max:[0,0,0]}:{min:r,max:t}}function ct(n,r,t,e){let a=new Float32Array(n.length);for(let i=0;i<e.length;i+=3){let u=e[i],l=e[i+1],s=e[i+2],f=u*3,c=l*3,d=s*3,p=u*2,E=l*2,m=s*2,T=n[c]-n[f],g=n[c+1]-n[f+1],b=n[c+2]-n[f+2],x=n[d]-n[f],A=n[d+1]-n[f+1],y=n[d+2]-n[f+2],v=t[E]-t[p],S=t[E+1]-t[p+1],$=t[m]-t[p],k=t[m+1]-t[p+1],P=v*k-$*S;if(Math.abs(P)<1e-12)continue;let Y=1/P,Ct=(T*k-x*S)*Y,It=(g*k-A*S)*Y,Gt=(b*k-y*S)*Y;for(let V of[f,c,d])a[V]=a[V]+Ct,a[V+1]=a[V+1]+It,a[V+2]=a[V+2]+Gt}let o=new Float32Array(n.length);for(let i=0;i<o.length;i+=3){let u=r[i],l=r[i+1],s=r[i+2],f=a[i],c=a[i+1],d=a[i+2],p=f*u+c*l+d*s;f-=u*p,c-=l*p,d-=s*p;let E=Math.hypot(f,c,d);E<1e-8&&(Math.abs(u)<.9?(f=0,c=-s,d=l):(f=-s,c=0,d=u),E=Math.hypot(f,c,d)||1),o[i]=f/E,o[i+1]=c/E,o[i+2]=d/E}return o}function ft(n,r){let t=new Float32Array(n.length);for(let e=0;e<r.length;e+=3){let a=r[e]*3,o=r[e+1]*3,i=r[e+2]*3,u=n[o]-n[a],l=n[o+1]-n[a+1],s=n[o+2]-n[a+2],f=n[i]-n[a],c=n[i+1]-n[a+1],d=n[i+2]-n[a+2],p=l*d-s*c,E=s*f-u*d,m=u*c-l*f;for(let T of[a,o,i])t[T]=t[T]+p,t[T+1]=t[T+1]+E,t[T+2]=t[T+2]+m}for(let e=0;e<t.length;e+=3){let a=Math.hypot(t[e],t[e+1],t[e+2]);a>0&&(t[e]=t[e]/a,t[e+1]=t[e+1]/a,t[e+2]=t[e+2]/a)}return t}function Se(n,r,t,e,a){let{min:o,max:i}=Vt(n),u=e??ft(n,t);return{positions:n,normals:u,uvs:r,indices:t,min:o,max:i,tangents:a??ct(n,u,r,t)}}function Le(n=1,r=1,t=1){let e=n/2,a=r/2,o=t/2,i=[[[-e,-a,o],[e,-a,o],[e,a,o],[-e,a,o]],[[e,-a,-o],[-e,-a,-o],[-e,a,-o],[e,a,-o]],[[e,-a,o],[e,-a,-o],[e,a,-o],[e,a,o]],[[-e,-a,-o],[-e,-a,o],[-e,a,o],[-e,a,-o]],[[-e,a,o],[e,a,o],[e,a,-o],[-e,a,-o]],[[-e,-a,-o],[e,-a,-o],[e,-a,o],[-e,-a,o]]],u=new Float32Array(72),l=new Float32Array(48),s=new Uint16Array(36),f=0,c=0,d=0,p=0;for(let E of i){for(let[m,T,g]of E)u[f++]=m,u[f++]=T,u[f++]=g;l[c++]=0,l[c++]=0,l[c++]=1,l[c++]=0,l[c++]=1,l[c++]=1,l[c++]=0,l[c++]=1,s[d++]=p,s[d++]=p+1,s[d++]=p+2,s[d++]=p,s[d++]=p+2,s[d++]=p+3,p+=4}return Se(u,l,s)}function _e(n=10,r=24){let t=Math.max(1,Math.floor(r)),e=(t+1)*(t+1),a=new Float32Array(e*3),o=new Float32Array(e*3),i=new Float32Array(e*2),u=new Uint16Array(t*t*6),l=0,s=0,f=0;for(let c=0;c<=t;c++)for(let d=0;d<=t;d++){let p=(d/t-.5)*n,E=(c/t-.5)*n;a[l]=p,a[l+1]=0,a[l+2]=E,o[l]=0,o[l+1]=1,o[l+2]=0,l+=3,i[s++]=d/t,i[s++]=c/t}for(let c=0;c<t;c++)for(let d=0;d<t;d++){let p=c*(t+1)+d,E=p+1,m=p+(t+1),T=m+1;u[f++]=p,u[f++]=m,u[f++]=E,u[f++]=E,u[f++]=m,u[f++]=T}return Se(a,i,u,o)}function we(n=.5,r=24,t=32){let e=Math.max(2,r),a=Math.max(3,t),o=(e+1)*(a+1),i=new Float32Array(o*3),u=new Float32Array(o*3),l=new Float32Array(o*2),s=new Uint16Array(e*a*6),f=0,c=0,d=0;for(let p=0;p<=e;p++){let E=p/e*Math.PI;for(let m=0;m<=a;m++){let T=m/a*Math.PI*2,g=Math.sin(E)*Math.cos(T),b=Math.cos(E),x=Math.sin(E)*Math.sin(T);i[f]=g*n,i[f+1]=b*n,i[f+2]=x*n,u[f]=g,u[f+1]=b,u[f+2]=x,f+=3,l[c++]=m/a,l[c++]=p/e}}for(let p=0;p<e;p++)for(let E=0;E<a;E++){let m=p*(a+1)+E,T=m+1,g=m+(a+1),b=g+1;s[d++]=m,s[d++]=T,s[d++]=g,s[d++]=T,s[d++]=b,s[d++]=g}return Se(i,l,s,u)}function Q(n){return n.indices.length/3}var dt=n=>[n.DEPTH_TEST,n.CULL_FACE,n.BLEND];function w(n){return[n.getParameter(n.FRAMEBUFFER_BINDING),n.getParameter(n.VIEWPORT),n.getParameter(n.DEPTH_WRITEMASK),dt(n).map(r=>n.getParameter(r))]}function D(n,r){n.bindFramebuffer(n.FRAMEBUFFER,r[0]);let t=r[1];n.viewport(t[0]??0,t[1]??0,t[2]??0,t[3]??0),n.depthMask(r[2]),dt(n).forEach((e,a)=>{r[3][a]?n.enable(e):n.disable(e)})}function j(n,r){for(let t=r-1;t>=0;t--)n.activeTexture(n.TEXTURE0+t),n.bindTexture(n.TEXTURE_2D,null),n.bindTexture(n.TEXTURE_3D,null);n.activeTexture(n.TEXTURE0)}var De=["minimum","reduced","full"],Ht={full:{dprScale:2,ao:!0,aoScale:.5,dof:!0,shadowMapSize:1536,shadowTaps:9,particleCapacity:4096,volumeMaxSteps:128,volumeLightSteps:6},reduced:{dprScale:2,ao:!0,aoScale:.5,dof:!1,shadowMapSize:1024,shadowTaps:9,particleCapacity:2048,volumeMaxSteps:96,volumeLightSteps:4},minimum:{dprScale:1,ao:!1,aoScale:.5,dof:!1,shadowMapSize:512,shadowTaps:1,particleCapacity:512,volumeMaxSteps:48,volumeLightSteps:0}};function ie(n,r){let t=Number.isFinite(r)&&r>0?r:1024,a=t*(n==="full"?1:n==="reduced"?.5:.25),o=2**Math.round(Math.log2(a));return Math.max(256,Math.min(t,o))}function Pe(n){return{tier:n,...Ht[n]}}var Ue=89,Ne=Math.PI/180;function O(n){let r=Math.max(-Ue,Math.min(Ue,n.elevationDeg))*Ne,t=n.azimuthDeg*Ne,e=Math.max(1e-4,n.distance),a=Math.sin(r)*e,o=Math.cos(r)*e;return[n.target[0]+Math.sin(t)*o,n.target[1]+a,n.target[2]+Math.cos(t)*o]}function K(n,r){let t=O(n),e=n.near??Math.max(.01,n.distance/100),a=n.far??Math.max(e+1,n.distance*8),o=xe((n.fovDeg??38)*Ne,Math.max(.001,r),e,a),i=ae(t,n.target,[0,1,0]);return oe(o,i)}function Be(n,r,t){let e=U(n.direction),a=n.extent??Math.max(.1,t*1.35),o=Math.max(1,t*2),i=[r[0]-e[0]*o,r[1]-e[1]*o,r[2]-e[2]*o],u=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],l=ae(i,r,u),s=ye(-a,a,-a,a,.01,o+t*2+a);return oe(s,l)}function Oe(n,r){let t=X([r[0],r[1],r[2]],[n[0],n[1],n[2]]);return Math.hypot(t[0],t[1],t[2])/2}function Ce(n,r){return[(n[0]+r[0])/2,(n[1]+r[1])/2,(n[2]+r[2])/2]}function Ie(n,r,t){let{gl:e}=n,a=Math.max(1,Math.floor(r)),o=Math.max(1,Math.floor(t)),i=e.createFramebuffer(),u=e.createTexture(),l=e.createTexture();if(!i||!u||!l)return M("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let s=n.hdr?e.RGBA16F:e.RGBA8,f=n.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,c=()=>{e.bindTexture(e.TEXTURE_2D,u),e.texImage2D(e.TEXTURE_2D,0,s,a,o,0,e.RGBA,f,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,l),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,a,o,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,u,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,l,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};c(),e.bindFramebuffer(e.FRAMEBUFFER,i);let d=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),d!==e.FRAMEBUFFER_COMPLETE?M("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${d.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:u,depthTexture:l,get width(){return a},get height(){return o},bind(){e.bindFramebuffer(e.FRAMEBUFFER,i),e.viewport(0,0,a,o)},resize(p,E){let m=Math.max(1,Math.floor(p)),T=Math.max(1,Math.floor(E));m===a&&T===o||(a=m,o=T,c())},dispose(){e.deleteFramebuffer(i),e.deleteTexture(u),e.deleteTexture(l)}}}function Ge(n,r=1024){let{gl:t}=n,e=Math.max(256,Math.min(2048,Math.floor(r))),a=t.createFramebuffer(),o=t.createTexture();if(!a||!o)return M("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");t.bindTexture(t.TEXTURE_2D,o),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,e,e,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,a),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,o,0);let i=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),i!==t.FRAMEBUFFER_COMPLETE?M("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:a,depthTexture:o,size:e,bind(){t.bindFramebuffer(t.FRAMEBUFFER,a),t.viewport(0,0,e,e)},dispose(){t.deleteFramebuffer(a),t.deleteTexture(o)}}}var ue=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,se={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function le(n,r,t={}){let e=t.zenith??se.zenith,a=t.horizon??se.horizon,o=t.ground??se.ground;n.uniform3f(n.getUniformLocation(r,"uSkyZenith"),e[0],e[1],e[2]),n.uniform3f(n.getUniformLocation(r,"uSkyHorizon"),a[0],a[1],a[2]),n.uniform3f(n.getUniformLocation(r,"uSkyGround"),o[0],o[1],o[2])}var Xt=`#version 300 es
precision highp float;
out vec2 vNdc;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`,zt=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${ue}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;function ke(n){let{gl:r}=n,t=n.compile(Xt,zt);return"kind"in t?t:{draw(e){let a=U(X(e.target,e.eye)),o=Math.abs(a[1])>.999?[0,0,1]:[0,1,0],i=U(H(a,o)),u=U(H(i,a)),l=w(r);r.disable(r.DEPTH_TEST),r.depthMask(!1),r.disable(r.BLEND),r.useProgram(t),r.uniform3f(r.getUniformLocation(t,"uRight"),i[0],i[1],i[2]),r.uniform3f(r.getUniformLocation(t,"uUp"),u[0],u[1],u[2]),r.uniform3f(r.getUniformLocation(t,"uForward"),a[0],a[1],a[2]),r.uniform1f(r.getUniformLocation(t,"uTanHalfFov"),Math.tan(e.fovDeg*Math.PI/360)),r.uniform1f(r.getUniformLocation(t,"uAspect"),Math.max(.001,e.aspect)),le(r,t,e.sky),n.blit(t),D(r,l)},dispose(){r.deleteProgram(t)}}}var mt=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,Ve=`#version 300 es
precision highp float;
void main(){}`,Wt=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,pt=`#version 300 es
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
}`,ht=`#version 300 es
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
${ue}

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
}`;function He(n,r){let{gl:t}=n,e=t.createVertexArray(),a=t.createBuffer(),o=t.createBuffer(),i=t.createBuffer(),u=t.createBuffer();return!e||!a||!o||!i||!u?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(t.bindVertexArray(e),t.bindBuffer(t.ARRAY_BUFFER,a),t.bufferData(t.ARRAY_BUFFER,r.positions,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,r.normals,t.STATIC_DRAW),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,i),t.bufferData(t.ARRAY_BUFFER,r.tangents,t.STATIC_DRAW),t.enableVertexAttribArray(2),t.vertexAttribPointer(2,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,u),t.bufferData(t.ELEMENT_ARRAY_BUFFER,r.indices,t.STATIC_DRAW),t.bindVertexArray(null),{vao:e,indexCount:r.indices.length,indexType:r.indices instanceof Uint32Array?t.UNSIGNED_INT:t.UNSIGNED_SHORT,dispose(){t.deleteVertexArray(e),t.deleteBuffer(a),t.deleteBuffer(o),t.deleteBuffer(i),t.deleteBuffer(u)}})}function Xe(n){let{gl:r}=n,t=n.compile(mt,Ve);if("kind"in t)return t;let e=n.compile(pt,ht);if("kind"in e)return e;let a=n.compile(Wt,Ve);if("kind"in a)return a;let o=(i,u)=>r.getUniformLocation(i,u);return{shadowPass(i,u,l,s){let f=w(r),c=s??(()=>{});l.bind(),c("shadow.bind"),r.clear(r.DEPTH_BUFFER_BIT),r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.FRONT),r.useProgram(t),c("useProgram(shadow)"),r.uniformMatrix4fv(o(t,"uLightVP"),!1,i),c("uLightVP");for(let d of u)r.uniformMatrix4fv(o(t,"uModel"),!1,d.model),c("shadow uModel"),r.bindVertexArray(d.mesh.vao),c("shadow bindVAO"),r.drawElements(r.TRIANGLES,d.mesh.indexCount,d.mesh.indexType,0),c("shadow drawElements");r.bindVertexArray(null),r.cullFace(r.BACK),D(r,f)},depthPrepass(i,u){let l=w(r);r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.colorMask(!1,!1,!1,!1),r.useProgram(a),r.uniformMatrix4fv(o(a,"uViewProj"),!1,i);for(let s of u)r.uniformMatrix4fv(o(a,"uModel"),!1,s.model),r.bindVertexArray(s.mesh.vao),r.drawElements(r.TRIANGLES,s.mesh.indexCount,s.mesh.indexType,0);r.bindVertexArray(null),r.colorMask(!0,!0,!0,!0),D(r,l)},draw(i){let u=w(r),l=i.onStep??(()=>{});if(r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.useProgram(e),r.uniformMatrix4fv(o(e,"uViewProj"),!1,i.viewProj),l("uViewProj"),r.uniform3fv(o(e,"uEye"),i.eye),l("uEye"),r.uniform3fv(o(e,"uLightDir"),i.lightDir),l("uLightDir"),r.uniform3fv(o(e,"uLightColour"),i.lightColour),l("uLightColour"),r.uniform1f(o(e,"uAmbientGain"),i.ambientGain??1),l("uAmbientGain"),i.fog&&i.fog.density>0){r.uniform1f(o(e,"uFogDensity"),i.fog.density),r.uniform1f(o(e,"uFogHeight"),i.fog.height),r.uniform1f(o(e,"uFogFloor"),i.fog.floor??0);let s=i.fog.colour;s==="sky"?r.uniform3f(o(e,"uFogColour"),-1,-1,-1):r.uniform3f(o(e,"uFogColour"),s[0],s[1],s[2]),l("fog")}else r.uniform1f(o(e,"uFogDensity"),0);le(r,e,i.sky),l("bindSky"),i.ao&&i.screenSize?(r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,i.ao),r.uniform1i(o(e,"uAO"),1),r.uniform2f(o(e,"uScreenSize"),i.screenSize[0],i.screenSize[1]),r.uniform1f(o(e,"uAOEnabled"),1)):r.uniform1f(o(e,"uAOEnabled"),0),l("bindAO"),r.uniformMatrix4fv(o(e,"uLightVP"),!1,i.lightVP),l("lit uLightVP"),i.shadow?(r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,i.shadow.depthTexture),r.uniform1i(o(e,"uShadowMap"),0),r.uniform1f(o(e,"uShadowTexel"),1/i.shadow.size),r.uniform1f(o(e,"uShadowStrength"),i.shadowStrength??1)):r.uniform1f(o(e,"uShadowStrength"),0);for(let s of i.draws)r.uniformMatrix4fv(o(e,"uModel"),!1,s.model),r.uniformMatrix3fv(o(e,"uNormalMat"),!1,s.normalMat),l("uNormalMat"),r.uniform3fv(o(e,"uBaseColour"),s.material.baseColour),l("uBaseColour"),r.uniform1f(o(e,"uRoughness"),s.material.roughness),r.uniform1f(o(e,"uMetalness"),s.material.metalness),r.uniform1f(o(e,"uAnisotropy"),s.material.anisotropy??0),r.bindVertexArray(s.mesh.vao),l("lit bindVAO"),r.drawElements(r.TRIANGLES,s.mesh.indexCount,s.mesh.indexType,0),l("lit drawElements");r.bindVertexArray(null),j(r,2),D(r,u)},dispose(){r.deleteProgram(t),r.deleteProgram(e),r.deleteProgram(a)}}}var q=`
uniform sampler2D uDepth;
uniform vec2 uNearFar;

float linearDepthAt(vec2 uv) {
  float d = texture(uDepth, uv).r * 2.0 - 1.0;
  float n = uNearFar.x, f = uNearFar.y;
  return (2.0 * n * f) / (f + n - d * (f - n));
}`,Et=`
uniform float uTanHalfFov;
uniform float uAspect;

vec3 viewPosAt(vec2 uv) {
  float z = linearDepthAt(uv);
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x * uTanHalfFov * uAspect * z, ndc.y * uTanHalfFov * z, -z);
}`,Tt=q+Et,bt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,jt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${Tt}

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
}`,$t=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${q}

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
}`;function ze(n,r,t){let{gl:e}=n,a=n.compile(bt,jt);if("kind"in a)return a;let o=n.compile(bt,$t);if("kind"in o)return o;let i=Math.max(1,r>>1),u=Math.max(1,t>>1),l=()=>{let m=e.createFramebuffer(),T=e.createTexture();return!m||!T?null:{fb:m,tex:T}},s=l(),f=l();if(!s||!f)return M("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let c=()=>{for(let m of[s,f])e.bindTexture(e.TEXTURE_2D,m.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,i,u,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,m.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,m.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};c(),e.bindFramebuffer(e.FRAMEBUFFER,s.fb);let d=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),d!==e.FRAMEBUFFER_COMPLETE)return M("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${d.toString(16)}).`);let p=(m,T,g,b,x)=>{e.activeTexture(e.TEXTURE0+x),e.bindTexture(e.TEXTURE_2D,T),e.uniform1i(e.getUniformLocation(m,"uDepth"),x),e.uniform2f(e.getUniformLocation(m,"uNearFar"),g,b)},E=(m,T,g,b,x,A,y)=>{p(m,T,g,b,y),e.uniform1f(e.getUniformLocation(m,"uTanHalfFov"),Math.tan(x*Math.PI/360)),e.uniform1f(e.getUniformLocation(m,"uAspect"),A)};return{get texture(){return s.tex},get width(){return i},get height(){return u},compute(m){let T=w(e);e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,s.fb),e.viewport(0,0,i,u),e.useProgram(a),E(a,m.depthTexture,m.near,m.far,m.fovDeg,m.aspect,0),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/i,1/u),e.uniform1f(e.getUniformLocation(a,"uRadius"),m.radius??.55),e.uniform1f(e.getUniformLocation(a,"uStrength"),m.strength??1.15),e.uniform1f(e.getUniformLocation(a,"uBias"),m.bias??.035),n.blit(a);for(let[g,b,x]of[[s,f,[1,0]],[f,s,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,b.fb),e.viewport(0,0,i,u),e.useProgram(o),p(o,m.depthTexture,m.near,m.far,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,g.tex),e.uniform1i(e.getUniformLocation(o,"uAO"),1),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/i,1/u),e.uniform2f(e.getUniformLocation(o,"uDir"),x[0],x[1]),n.blit(o);j(e,2),D(e,T)},resize(m,T){let g=Math.max(1,m>>1),b=Math.max(1,T>>1);g===i&&b===u||(i=g,u=b,c())},dispose(){e.deleteProgram(a),e.deleteProgram(o);for(let m of[s,f])e.deleteFramebuffer(m.fb),e.deleteTexture(m.tex)}}}var Yt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Qt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uFocusDistance;
uniform float uAperture;
uniform float uMaxCoc;
out vec4 frag;
${q}

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
}`;function We(n,r,t){let{gl:e}=n,a=n.compile(Yt,Qt);if("kind"in a)return a;let o=Math.max(1,Math.floor(r)),i=Math.max(1,Math.floor(t)),u=e.createFramebuffer(),l=e.createTexture();if(!u||!l)return M("FRAMEBUFFER_INCOMPLETE","The GPU refused a depth-of-field buffer.");let s=()=>{e.bindTexture(e.TEXTURE_2D,l);let c=n.hdr?e.RGBA16F:e.RGBA8,d=n.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE;e.texImage2D(e.TEXTURE_2D,0,c,o,i,0,e.RGBA,d,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,u),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,l,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};s(),e.bindFramebuffer(e.FRAMEBUFFER,u);let f=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),f!==e.FRAMEBUFFER_COMPLETE?M("FRAMEBUFFER_INCOMPLETE",`The DOF buffer is incomplete (0x${f.toString(16)}).`):{texture:l,apply(c){let d=w(e);e.bindFramebuffer(e.FRAMEBUFFER,u),e.viewport(0,0,o,i),e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.useProgram(a),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,c.scene),e.uniform1i(e.getUniformLocation(a,"uScene"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,c.depthTexture),e.uniform1i(e.getUniformLocation(a,"uDepth"),1),e.uniform2f(e.getUniformLocation(a,"uNearFar"),c.near,c.far),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/o,1/i),e.uniform1f(e.getUniformLocation(a,"uFocusDistance"),c.focusDistance),e.uniform1f(e.getUniformLocation(a,"uAperture"),c.aperture??12),e.uniform1f(e.getUniformLocation(a,"uMaxCoc"),c.maxCoc??.012),n.blit(a),j(e,2),D(e,d)},resize(c,d){let p=Math.max(1,Math.floor(c)),E=Math.max(1,Math.floor(d));p===o&&E===i||(o=p,i=E,s())},dispose(){e.deleteProgram(a),e.deleteFramebuffer(u),e.deleteTexture(l)}}}var Kt=`
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
/* The table's name for anyone browsing it as a table. Clipped in every medium: the h2 above it already
   carries the same words to the eye. */
#lcx-fallback caption { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); text-align: left; }
/* No focus ring on the host. Note 4 above the literal \u2014 this is not a keyboard-reachable element. */
#lcx-fallback:focus, #lcx-fallback:focus-visible { outline: none; }
/* Taken off the screen once a frame exists \u2014 clipped, never removed. Note 1 above the literal. */
#lcx-fallback[data-rendered="1"] {
  position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%);
  white-space: nowrap; margin: 0; padding: 0; border: 0;
}
@media print {
  /* The JSON diagnostic block is for a machine and wastes pages. The canvas prints because the stage
     is created with preserveDrawingBuffer. */
  #log { display: none !important; }
  /* Every property of the screen clip, undone. Note 2 above the literal. */
  #lcx-fallback, #lcx-fallback[data-rendered="1"] {
    display: block !important; position: static !important; width: auto !important; height: auto !important;
    overflow: visible !important; clip-path: none !important; margin: 18px 0 0 !important; color: #000;
  }
  #lcx-fallback h2, #lcx-fallback th { color: #000; }
  #lcx-fallback .reads, #lcx-fallback .absent { color: #444; }
  #lcx-fallback th, #lcx-fallback td { border-bottom: 1px solid #999; }
  #lcx-fallback .notice { color: #7a4f00; }
  /* The refusal notice was 1.14:1 on paper \u2014 invisible. Note 3 above the literal. */
  #lcx-fallback .refusal { color: #7a0d1e !important; border-color: #7a0d1e !important; border-width: 2px !important; }
  body { background: #fff !important; }
}
`;function N(n){return String(n).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function xt(n){let r=document.createElement("style");r.textContent=Kt,document.head.appendChild(r);let t=document.createElement("section");t.id="lcx-fallback",t.setAttribute("aria-label",`${n.title} \u2014 flat view`),t.setAttribute("tabindex","-1"),document.getElementById("log")?.setAttribute("aria-hidden","true");let e=(o,i)=>o===null?`<td class="absent${i?" n":""}">absent</td>`:`<td class="${i?"n":""}">${N(o)}</td>`;t.innerHTML=`<h2>${N(n.title)} \u2014 flat view</h2><p class="reads">${N(n.readsAs)}</p>`+(n.notices??[]).map(o=>`<p class="notice">${N(o)}</p>`).join("")+'<div id="lcx-refusal" role="alert"></div>'+(n.html?`<div class="surface">${n.html}</div>`:`<table><caption>${N(n.title)} \u2014 flat view</caption><thead><tr>`+n.columns.map(o=>`<th scope="col" class="${o.numeric?"n":""}">${N(o.label)}</th>`).join("")+"</tr></thead><tbody>"+n.rows.map(o=>"<tr>"+n.columns.map(i=>e(o[i.key]??null,!!i.numeric)).join("")+"</tr>").join("")+"</tbody></table>"),document.body.appendChild(t);function a(o,i){let u=document.getElementById("lcx-refusal");u&&(u.innerHTML=`<p class="refusal"><strong>${N(o)}</strong> \u2014 ${N(i)} The measurements below are unaffected.</p>`),delete t.dataset.rendered;for(let l of Array.from(document.querySelectorAll("canvas")))l.style.display="none";t.focus({preventScroll:!0})}return document.addEventListener("webglcontextlost",o=>{o.preventDefault(),a("CONTEXT_LOST","The GPU dropped the WebGL context for this page mid-session.")},!0),{markRendered(){t.dataset.rendered="1"},showRefusal:a}}var G=new URLSearchParams(location.search),rt=De.includes(G.get("tier")??"")?G.get("tier"):"full",fe=Pe(rt),qe=[],vt=[];function nt(n,r,t,e){let a=G.get(n);if(a===null)return r;let o=Number(a);if(!Number.isFinite(o))return qe.push(`${n}=${a}`),r;let i=Math.max(t,Math.min(e,o));return i!==o&&vt.push(`${n}=${a} used as ${i}`),i}var ot=nt("scale",1,1,3),F=1280*ot,R=800*ot,Je=Math.trunc(nt("frames",600,1,2e4)),Mt=Math.trunc(nt("repeat",1,1,64)),at=G.get("diag")==="1",qt=G.get("refuse")==="1",it=document.getElementById("c");it.width=F;it.height=R;function be(n){document.title="REFUSED";let r=document.getElementById("log");r&&(r.textContent=n);let[t,...e]=n.split(":");throw St?.showRefusal(t?.trim()??"REFUSED",e.join(":").trim()||n),new Error(n)}var St=null;function B(n,r){return"kind"in r&&be(`${n}: ${r.code} \u2014 ${r.reason} ${r.detail??""}`),r}var Lt=xt({title:"E0 \xB7 The Spike \u2014 material study",readsAs:"The rendered view is the evidence: GGX with a Smith visibility term, a shadow map, ambient occlusion and a gathered depth of field, at a measured cost. The table below states what each surface in that frame is set to, which is what the capture is evidence for.",notices:["A study, not a data surface \u2014 there is no measurement in this frame to lose."],columns:[{key:"object",label:"Object"},{key:"hex",label:"Base colour"},{key:"roughness",label:"Roughness",numeric:!0},{key:"metalness",label:"Metalness",numeric:!0}],rows:[{object:"Deck plate",hex:"#0E1628",roughness:.82,metalness:0},{object:"Brand-blue dielectric sphere",hex:"#2C6BFF",roughness:.34,metalness:.05},{object:"Metal sphere",hex:"#C9D4E4",roughness:at?.045:.18,metalness:.92}]});St=Lt;qe.length>0&&be(`BAD_PARAM: ${qe.join(", ")} \u2014 not a number, so the view was not drawn rather than drawn at a nonsensical size. Nothing about the underlying measurements has changed; correct the URL and reload.`);qt&&be("FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. The three-dimensional view is not being drawn.");var ce=Te(it,{alpha:!1});Ee(ce)||be(`stage: ${ce.code} \u2014 ${ce.reason}`);var _=ce,h=_.gl,Jt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Zt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${Ae}
${ve}
void main(){
  vec3 c = texture(uScene, vUv).rgb;
  frag = vec4(lcxEncode(lcxToneMap(c)), 1.0);
}`,er=B("present",_.compile(Jt,Zt)),J=B("lit",Xe(_)),I=B("target",Ie(_,F,R)),ee=B("shadow",Ge(_,ie(rt,1024))),_t=B("skyBox",ke(_)),yt=B("ao",ze(_,F,R)),gt=B("dof",We(_,F,R)),wt=_e(14,24),Dt=Le(1.4,1.4,1.4),Pt=we(.75,32,48),je=[wt,Dt,Pt].map((n,r)=>B(`mesh ${r}`,He(_,n))),$e=(n,r,t)=>{let e=ne();return e[12]=n,e[13]=r,e[14]=t,e},Ye=new Float32Array([1,0,0,0,1,0,0,0,1]),Z=[{mesh:je[0],model:$e(0,0,0),normalMat:Ye,material:{baseColour:W("#0E1628"),roughness:.82,metalness:0}},{mesh:je[1],model:$e(-1.15,.7,0),normalMat:Ye,material:{baseColour:W("#2C6BFF"),roughness:.34,metalness:.05}},{mesh:je[2],model:$e(1.15,.75,.3),normalMat:Ye,material:{baseColour:W("#C9D4E4"),roughness:at?.045:.18,metalness:.92}}],te={direction:[-.45,-1,-.35],colour:[3.4,3.3,3.05]},Ut=[-7,0,-7],Nt=[7,2.2,7],tr=Ce(Ut,Nt),Ft=Oe(Ut,Nt),de=Be({...te,extent:Ft*.8},tr,Ft),L={target:[0,.6,0],distance:7.2,azimuthDeg:34,elevationDeg:22,fovDeg:36},me=G.get("ao")!=="0"&&fe.ao,Ze=G.get("dof")!=="0"&&fe.dof,rr={zenith:[1.6,.05,.05],horizon:[.05,.08,1.6],ground:[.05,1.2,.05]},pe=at?rr:void 0;function he(){let n=K(L,F/R),r=O(L);J.shadowPass(de,Z,ee),I.bind(),h.clear(h.DEPTH_BUFFER_BIT),_t.draw({eye:r,target:L.target,fovDeg:L.fovDeg??36,aspect:F/R,sky:pe});let t=Math.max(.01,L.distance/100),e=Math.max(t+1,L.distance*8);J.depthPrepass(n,Z),me&&(yt.compute({depthTexture:I.depthTexture,near:t,far:e,fovDeg:L.fovDeg??36,aspect:F/R,radius:.6,strength:1.25}),I.bind());for(let o=0;o<Mt;o++)J.draw({viewProj:n,eye:r,lightDir:te.direction,lightColour:te.colour,ambientGain:1,sky:pe,lightVP:de,shadow:ee,shadowStrength:.92,draws:Z,ao:me?yt.texture:null,screenSize:[F,R]});let a=I.texture;if(Ze){let o=Math.hypot(r[0]-1.15,r[1]-.75,r[2]-.3);gt.apply({scene:I.texture,depthTexture:I.depthTexture,near:t,far:e,fovDeg:L.fovDeg??36,aspect:F/R,focusDistance:o,aperture:9,maxCoc:.01}),a=gt.texture}h.bindFramebuffer(h.FRAMEBUFFER,null),h.viewport(0,0,F,R),h.disable(h.DEPTH_TEST),h.activeTexture(h.TEXTURE0),h.bindTexture(h.TEXTURE_2D,a),_.blit(er,o=>h.uniform1i(h.getUniformLocation(o,"uScene"),0))}he();var Rt=4e3;function nr(n){let r=new Uint8Array(4),t=performance.now();he(),h.readPixels(0,0,1,1,h.RGBA,h.UNSIGNED_BYTE,r);let e=Math.max(.01,performance.now()-t),a=Math.min(n,Math.max(1,Math.floor(Rt/e))),o=performance.now(),i=0;for(let u=0;u<a&&(he(),i++,!(performance.now()-o>Rt));u++);return h.readPixels(0,0,1,1,h.RGBA,h.UNSIGNED_BYTE,r),{msPerFrame:(performance.now()-o)/i,measured:i}}var C=(()=>{let n=0;for(let s=h.getError();s!==h.NO_ERROR;s=h.getError())n=s;let r=[],t=s=>{let f=h.getError();f!==h.NO_ERROR&&r.push(`${s}=0x${f.toString(16)}`)};J.shadowPass(de,Z,ee,t),I.bind(),t("target.bind"),h.clear(h.DEPTH_BUFFER_BIT),t("clear"),_t.draw({eye:O(L),target:L.target,fovDeg:L.fovDeg??36,aspect:F/R,sky:pe}),t("sky"),J.draw({viewProj:K(L,F/R),eye:O(L),lightDir:te.direction,lightColour:te.colour,ambientGain:1,sky:pe,lightVP:de,shadow:ee,shadowStrength:.92,draws:Z,onStep:t});let e=h.getError(),a=h.getParameter(h.IMPLEMENTATION_COLOR_READ_FORMAT),o=h.getParameter(h.IMPLEMENTATION_COLOR_READ_TYPE),i=s=>{let f=s&32768?-1:1,c=s>>10&31,d=s&1023;return c===0?f*d*2**-24:c===31?d===0?f*(1/0):NaN:f*(1+d/1024)*2**(c-15)},u;if(o===h.HALF_FLOAT){let s=new Uint16Array(4);h.readPixels(F>>1,R>>2,1,1,a,o,s),u=Array.from(s,f=>Number(i(f).toFixed(4)))}else if(o===h.FLOAT){let s=new Float32Array(4);h.readPixels(F>>1,R>>2,1,1,a,o,s),u=Array.from(s,f=>Number(f.toFixed(4)))}else{let s=new Uint8Array(4);h.readPixels(F>>1,R>>2,1,1,a,o,s),u=Array.from(s)}let l=h.getError();return{centre:u,afterDraw:e,afterRead:l,bad:r,drained:n,readFormat:a,readType:o}})(),or=Q(wt)+Q(Dt)+Q(Pt),et=nr(Je),Qe=et.msPerFrame,At=(()=>{let n=K(L,F/R),r=-1.15,t=1.4,e=0,a=n[0]*r+n[4]*t+n[8]*e+n[12],o=n[1]*r+n[5]*t+n[9]*e+n[13],i=n[3]*r+n[7]*t+n[11]*e+n[15];return{ndc:[Number((a/i).toFixed(3)),Number((o/i).toFixed(3))],w:Number(i.toFixed(3))}})(),tt=Me();if(tt.length>0){let n="BRAND FIDELITY FAILED \u2014 "+tt.map(t=>`${t.key}: expected ${t.expected}, got ${t.actual}`).join("; ");document.title="REFUSED";let r=document.getElementById("log");throw r&&(r.textContent=n),new Error(n)}var Bt=(()=>{let n=h.getExtension("WEBGL_debug_renderer_info");return n?String(h.getParameter(n.UNMASKED_RENDERER_WEBGL)):"unknown"})(),Ke=/swiftshader|llvmpipe|software/i.test(Bt),Ot={ao:me,dof:Ze,tier:fe.tier,tierDprScale:fe.dprScale,tierShadowMapSize:ie(rt,1024),shadowBaseline:1024,glError:h.getError(),glDuringSetup:C.drained,brandFidelity:tt,hdr:_.hdr,eye:O(L).map(n=>Number(n.toFixed(2))),boxTopNdc:At.ndc,boxTopW:At.w,targetCentre:C.centre,targetReadFormat:`0x${C.readFormat.toString(16)}`,targetReadType:`0x${C.readType.toString(16)}`,failingCalls:C.bad,glAfterDraw:C.afterDraw,glAfterRead:C.afterRead,triangles:or,shadowMap:ee.size,resolution:`${F}x${R}`,dprScale:ot,aoEnabled:me,dofEnabled:Ze,frames:et.measured,framesRequested:Je,sweepTruncated:et.measured<Je,repeat:Mt,paramClamps:vt,msPerFrame:Number(Qe.toFixed(3)),fps:Math.round(1e3/Qe),renderer:Bt,rendererClass:Ke?"software":"hardware",headroom:Ke?null:Number((16.6-Qe).toFixed(3)),headroomRefusal:Ke?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null};globalThis.E0=Ot;document.getElementById("log").textContent=JSON.stringify(Ot,null,2);he();Lt.markRendered();document.title="READY";

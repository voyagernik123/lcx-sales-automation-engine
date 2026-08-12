var w={E0:{id:"E0",name:"THE SPIKE",verdict:"GATE MET"},E1:{id:"E1",name:"THE THEATRE",verdict:"THE HYBRID WORKS. \xA77(b) is now a real tension, not a gap."},E2:{id:"E2",name:"THE GLOBE",verdict:"CARRIES INFORMATION. \xA77(b) still unproven."},E5:{id:"E5",name:"THE SURFACE",verdict:"AGREES WITH THE SHIPPING ENGINE. \xA72's ribbons and drag are not built."},E6:{id:"E6",name:"THE VAULT",verdict:"READS. Six framing errors, every one caught by a count."},E8:{id:"E8",name:"THE FORGE",verdict:"the first shippable environment"}};var st={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected."};function P(r,n){return n===void 0?{kind:"refused",code:r,reason:st[r]}:{kind:"refused",code:r,reason:st[r],detail:n}}function Ae(r){return r.kind==="stage"}function Fe(r,n={}){let t=r.getContext("webgl2",{antialias:n.antialias??!1,alpha:n.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!t)return P("NO_WEBGL2");let e=t.getExtension("EXT_color_buffer_float"),o=r.width,a=r.height,i=e?t.RGBA16F:t.RGBA8,s=e?t.HALF_FLOAT:t.UNSIGNED_BYTE,u=(E,R)=>{let g=t.createTexture();t.bindTexture(t.TEXTURE_2D,g),t.texImage2D(t.TEXTURE_2D,0,i,E,R,0,t.RGBA,s,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);let T=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,T),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,g,0);let S=t.checkFramebufferStatus(t.FRAMEBUFFER);return S!==t.FRAMEBUFFER_COMPLETE?P("FRAMEBUFFER_INCOMPLETE",`status 0x${S.toString(16)} at ${E}\xD7${R}`):{texture:g,framebuffer:T,width:E,height:R}},f=n.bloomShift??2,l={w:o,h:a},c=u(o,a);if("kind"in c)return c;let d=u(Math.max(1,o>>f),Math.max(1,a>>f));if("kind"in d)return d;let h=u(Math.max(1,o>>f),Math.max(1,a>>f));if("kind"in h)return h;let m=t.createVertexArray();t.bindVertexArray(m);let b=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,b),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null);let p=[];return{kind:"stage",gl:t,cssWidth:r.clientWidth||o,cssHeight:r.clientHeight||a,hdr:!!e,get width(){return l.w},get height(){return l.h},get scene(){return c},get bloomA(){return d},get bloomB(){return h},setRegion(E,R){let g=Math.max(1,Math.round(E)),T=Math.max(1,Math.round(R));if(!(g===l.w&&T===l.h)){l={w:g,h:T};for(let S of[c,d,h])"kind"in S||(t.deleteFramebuffer(S.framebuffer),t.deleteTexture(S.texture));c=u(g,T),d=u(Math.max(1,g>>f),Math.max(1,T>>f)),h=u(Math.max(1,g>>f),Math.max(1,T>>f))}},compile(E,R){let g=(A,M)=>{let L=t.createShader(A);return t.shaderSource(L,M),t.compileShader(L),t.getShaderParameter(L,t.COMPILE_STATUS)?L:P("SHADER_COMPILE_FAILED",t.getShaderInfoLog(L)??"(no log)")},T=g(t.VERTEX_SHADER,E);if(typeof T=="object"&&"kind"in T)return T;let S=g(t.FRAGMENT_SHADER,R);if(typeof S=="object"&&"kind"in S)return S;let x=t.createProgram();return t.attachShader(x,T),t.attachShader(x,S),t.linkProgram(x),t.getProgramParameter(x,t.LINK_STATUS)?(p.push(x),x):P("PROGRAM_LINK_FAILED",t.getProgramInfoLog(x)??"(no log)")},bindTarget(E){t.bindFramebuffer(t.FRAMEBUFFER,E?E.framebuffer:null),t.viewport(0,0,E?E.width:l.w,E?E.height:l.h)},blit(E,R){t.useProgram(E),t.bindVertexArray(m),R?.(E),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null)},dispose(){for(let E of p)t.deleteProgram(E);for(let E of[c,d,h])"kind"in E||(t.deleteFramebuffer(E.framebuffer),t.deleteTexture(E.texture));t.deleteBuffer(b),t.deleteVertexArray(m)}}}var ne=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function oe(r,n){let t=new Float32Array(16);for(let e=0;e<4;e++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=r[i*4+o]*n[e*4+i];t[e*4+o]=a}return t}var W=(r,n)=>[r[0]-n[0],r[1]-n[1],r[2]-n[2]],re=(r,n)=>r[0]*n[0]+r[1]*n[1]+r[2]*n[2],j=(r,n)=>[r[1]*n[2]-r[2]*n[1],r[2]*n[0]-r[0]*n[2],r[0]*n[1]-r[1]*n[0]];function O(r){let n=Math.hypot(r[0],r[1],r[2]);return n===0?r:[r[0]/n,r[1]/n,r[2]/n]}function Me(r,n,t,e){let o=1/Math.tan(r/2);return new Float32Array([o/n,0,0,0,0,o,0,0,0,0,(e+t)/(t-e),-1,0,0,2*e*t/(t-e),0])}function ve(r,n,t,e,o,a){let i=n-r,s=e-t,u=a-o;return new Float32Array([2/i,0,0,0,0,2/s,0,0,0,0,-2/u,0,-(n+r)/i,-(e+t)/s,-(a+o)/u,1])}function ae(r,n,t){let e=O(W(r,n)),o=j(t,e);if(Math.hypot(o[0],o[1],o[2])<1e-8)return ne();let a=O(o),i=j(e,a);return new Float32Array([a[0],i[0],e[0],0,a[1],i[1],e[1],0,a[2],i[2],e[2],0,-re(a,r),-re(i,r),-re(e,r),1])}function ut(r,n){let t=[0,1,2,3].map(o=>r[0+o]*n[0]+r[4+o]*n[1]+r[8+o]*n[2]+r[12+o]),e=t[3];return{x:t[0]/e,y:t[1]/e,z:t[2]/e,w:e}}function k(r,n,t,e){let o=ut(r,n);return{sx:(o.x*.5+.5)*t,sy:(1-(o.y*.5+.5))*e,behind:o.w<=0}}function ct(r){return r<=.04045?r/12.92:Math.pow((r+.055)/1.055,2.4)}function _e(r){return r<=.0031308?r*12.92:1.055*Math.pow(r,1/2.4)-.055}var Xt=/^#?([0-9a-fA-F]{6})$/;function Z(r){let n=Xt.exec(r.trim());if(!n)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(r)}`);let t=n[1];return[0,2,4].map(e=>ct(parseInt(t.slice(e,e+2),16)/255))}function Se(r){return`#${r.map(t=>{let e=_e(Math.min(1,Math.max(0,t)));return Math.round(e*255).toString(16).padStart(2,"0")}).join("")}`}var $={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},Le=Object.freeze(Object.fromEntries(Object.keys($).map(r=>[r,Z($[r])])));var lt=.4;var De=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${lt.toFixed(2)}); }`,we=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function Pe(){let r=[];for(let n of Object.keys($)){let t=$[n].toLowerCase(),e=Se(Le[n]).toLowerCase();e!==t&&r.push({key:n,expected:t,actual:e})}return r}function zt(r){let n=[1/0,1/0,1/0],t=[-1/0,-1/0,-1/0];for(let e=0;e<r.length;e+=3)for(let o=0;o<3;o++){let a=r[e+o];a<n[o]&&(n[o]=a),a>t[o]&&(t[o]=a)}return r.length===0?{min:[0,0,0],max:[0,0,0]}:{min:n,max:t}}function ft(r,n,t,e){let o=new Float32Array(r.length);for(let i=0;i<e.length;i+=3){let s=e[i],u=e[i+1],f=e[i+2],l=s*3,c=u*3,d=f*3,h=s*2,m=u*2,b=f*2,p=r[c]-r[l],F=r[c+1]-r[l+1],E=r[c+2]-r[l+2],R=r[d]-r[l],g=r[d+1]-r[l+1],T=r[d+2]-r[l+2],S=t[m]-t[h],x=t[m+1]-t[h+1],A=t[b]-t[h],M=t[b+1]-t[h+1],L=S*M-A*x;if(Math.abs(L)<1e-12)continue;let D=1/L,Q=(p*M-R*x)*D,V=(F*M-g*x)*D,q=(E*M-T*x)*D;for(let z of[l,c,d])o[z]=o[z]+Q,o[z+1]=o[z+1]+V,o[z+2]=o[z+2]+q}let a=new Float32Array(r.length);for(let i=0;i<a.length;i+=3){let s=n[i],u=n[i+1],f=n[i+2],l=o[i],c=o[i+1],d=o[i+2],h=l*s+c*u+d*f;l-=s*h,c-=u*h,d-=f*h;let m=Math.hypot(l,c,d);m<1e-8&&(Math.abs(s)<.9?(l=0,c=-f,d=u):(l=-f,c=0,d=s),m=Math.hypot(l,c,d)||1),a[i]=l/m,a[i+1]=c/m,a[i+2]=d/m}return a}function mt(r,n){let t=new Float32Array(r.length);for(let e=0;e<n.length;e+=3){let o=n[e]*3,a=n[e+1]*3,i=n[e+2]*3,s=r[a]-r[o],u=r[a+1]-r[o+1],f=r[a+2]-r[o+2],l=r[i]-r[o],c=r[i+1]-r[o+1],d=r[i+2]-r[o+2],h=u*d-f*c,m=f*l-s*d,b=s*c-u*l;for(let p of[o,a,i])t[p]=t[p]+h,t[p+1]=t[p+1]+m,t[p+2]=t[p+2]+b}for(let e=0;e<t.length;e+=3){let o=Math.hypot(t[e],t[e+1],t[e+2]);o>0&&(t[e]=t[e]/o,t[e+1]=t[e+1]/o,t[e+2]=t[e+2]/o)}return t}function dt(r,n,t,e,o){let{min:a,max:i}=zt(r),s=e??mt(r,t);return{positions:r,normals:s,uvs:n,indices:t,min:a,max:i,tangents:o??ft(r,s,n,t)}}function Ue(r=1,n=1,t=1){let e=r/2,o=n/2,a=t/2,i=[[[-e,-o,a],[e,-o,a],[e,o,a],[-e,o,a]],[[e,-o,-a],[-e,-o,-a],[-e,o,-a],[e,o,-a]],[[e,-o,a],[e,-o,-a],[e,o,-a],[e,o,a]],[[-e,-o,-a],[-e,-o,a],[-e,o,a],[-e,o,-a]],[[-e,o,a],[e,o,a],[e,o,-a],[-e,o,-a]],[[-e,-o,-a],[e,-o,-a],[e,-o,a],[-e,-o,a]]],s=new Float32Array(72),u=new Float32Array(48),f=new Uint16Array(36),l=0,c=0,d=0,h=0;for(let m of i){for(let[b,p,F]of m)s[l++]=b,s[l++]=p,s[l++]=F;u[c++]=0,u[c++]=0,u[c++]=1,u[c++]=0,u[c++]=1,u[c++]=1,u[c++]=0,u[c++]=1,f[d++]=h,f[d++]=h+1,f[d++]=h+2,f[d++]=h,f[d++]=h+2,f[d++]=h+3,h+=4}return dt(s,u,f)}function Ne(r=10,n=24){let t=Math.max(1,Math.floor(n)),e=(t+1)*(t+1),o=new Float32Array(e*3),a=new Float32Array(e*3),i=new Float32Array(e*2),s=new Uint16Array(t*t*6),u=0,f=0,l=0;for(let c=0;c<=t;c++)for(let d=0;d<=t;d++){let h=(d/t-.5)*r,m=(c/t-.5)*r;o[u]=h,o[u+1]=0,o[u+2]=m,a[u]=0,a[u+1]=1,a[u+2]=0,u+=3,i[f++]=d/t,i[f++]=c/t}for(let c=0;c<t;c++)for(let d=0;d<t;d++){let h=c*(t+1)+d,m=h+1,b=h+(t+1),p=b+1;s[l++]=h,s[l++]=b,s[l++]=m,s[l++]=m,s[l++]=b,s[l++]=p}return dt(o,i,s,a)}function Oe(r){return r.indices.length/3}function jt(r){if(!Number.isFinite(r)||r===0)return"0";let n=r.toFixed(12).replace(/0+$/,"").replace(/\.$/,"");return n==="-0"?"0":n}function ht(r,n,t,e){let[o,a]=r,[i,s]=n,[u,f]=t,[l,c]=e,d=o-i+u-l,h=a-s+f-c;if(Math.abs(d)<1e-9&&Math.abs(h)<1e-9){let T=[i-o,l-o,o,s-a,c-a,a,0,0,1],S=T[0]*T[4]-T[1]*T[3];return Math.abs(S)<1e-9?null:T}let m=i-u,b=l-u,p=s-f,F=c-f,E=m*F-b*p;if(Math.abs(E)<1e-9)return null;let R=(d*F-b*h)/E,g=(m*h-d*p)/E;return[i-o+R*i,l-o+g*l,o,s-a+R*s,c-a+g*c,a,R,g,1]}function Be(r,n,t,e,o,a){if(!(o>0)||!(a>0))return{refusal:"EMPTY_ELEMENT_BOX"};let s=[n.topLeft,n.topRight,n.bottomRight,n.bottomLeft].map(D=>k(r,D,t,e));if(s.some(D=>D.behind))return{refusal:"CORNER_BEHIND_CAMERA"};let u=s.map(D=>({x:D.sx,y:D.sy})),[f,l,c,d]=u,h=ht([f.x,f.y],[l.x,l.y],[c.x,c.y],[d.x,d.y]);if(!h)return{refusal:"DEGENERATE_ON_SCREEN"};let m=.5*(f.x*l.y-l.x*f.y+(l.x*c.y-c.x*l.y)+(c.x*d.y-d.x*c.y)+(d.x*f.y-f.x*d.y)),b=1/o,p=1/a,[F,E,R,g,T,S,x,A,M]=h;return{transform:`matrix3d(${[F*b,g*b,0,x*b,E*p,T*p,0,A*p,0,0,1,0,R,S,0,M].map(jt).join(", ")})`,matrix:h,screen:u,signedArea:m}}function Ce(r){return"refusal"in r}var Ie=89,Ge=Math.PI/180;function ie(r){let n=Math.max(-Ie,Math.min(Ie,r.elevationDeg))*Ge,t=r.azimuthDeg*Ge,e=Math.max(1e-4,r.distance),o=Math.sin(n)*e,a=Math.cos(n)*e;return[r.target[0]+Math.sin(t)*a,r.target[1]+o,r.target[2]+Math.cos(t)*a]}function se(r,n){let t=ie(r),e=r.near??Math.max(.01,r.distance/100),o=r.far??Math.max(e+1,r.distance*8),a=Me((r.fovDeg??38)*Ge,Math.max(.001,n),e,o),i=ae(t,r.target,[0,1,0]);return oe(a,i)}function Ve(r,n,t){let e=O(r.direction),o=r.extent??Math.max(.1,t*1.35),a=Math.max(1,t*2),i=[n[0]-e[0]*a,n[1]-e[1]*a,n[2]-e[2]*a],s=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],u=ae(i,n,s),f=ve(-o,o,-o,o,.01,a+t*2+o);return oe(f,u)}function ke(r,n){let t=W([n[0],n[1],n[2]],[r[0],r[1],r[2]]);return Math.hypot(t[0],t[1],t[2])/2}function He(r,n){return[(r[0]+n[0])/2,(r[1]+n[1])/2,(r[2]+n[2])/2]}function Xe(r,n,t){let{gl:e}=r,o=Math.max(1,Math.floor(n)),a=Math.max(1,Math.floor(t)),i=e.createFramebuffer(),s=e.createTexture(),u=e.createTexture();if(!i||!s||!u)return P("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let f=r.hdr?e.RGBA16F:e.RGBA8,l=r.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,c=()=>{e.bindTexture(e.TEXTURE_2D,s),e.texImage2D(e.TEXTURE_2D,0,f,o,a,0,e.RGBA,l,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,u),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,o,a,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,s,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,u,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};c(),e.bindFramebuffer(e.FRAMEBUFFER,i);let d=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),d!==e.FRAMEBUFFER_COMPLETE?P("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${d.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:s,depthTexture:u,get width(){return o},get height(){return a},bind(){e.bindFramebuffer(e.FRAMEBUFFER,i),e.viewport(0,0,o,a)},resize(h,m){let b=Math.max(1,Math.floor(h)),p=Math.max(1,Math.floor(m));b===o&&p===a||(o=b,a=p,c())},dispose(){e.deleteFramebuffer(i),e.deleteTexture(s),e.deleteTexture(u)}}}function ze(r,n=1024){let{gl:t}=r,e=Math.max(256,Math.min(2048,Math.floor(n))),o=t.createFramebuffer(),a=t.createTexture();if(!o||!a)return P("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");t.bindTexture(t.TEXTURE_2D,a),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,e,e,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,o),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,a,0);let i=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),i!==t.FRAMEBUFFER_COMPLETE?P("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:e,bind(){t.bindFramebuffer(t.FRAMEBUFFER,o),t.viewport(0,0,e,e)},dispose(){t.deleteFramebuffer(o),t.deleteTexture(a)}}}var ce=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,ue={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function le(r,n,t={}){let e=t.zenith??ue.zenith,o=t.horizon??ue.horizon,a=t.ground??ue.ground;r.uniform3f(r.getUniformLocation(n,"uSkyZenith"),e[0],e[1],e[2]),r.uniform3f(r.getUniformLocation(n,"uSkyHorizon"),o[0],o[1],o[2]),r.uniform3f(r.getUniformLocation(n,"uSkyGround"),a[0],a[1],a[2])}var Wt=`#version 300 es
precision highp float;
out vec2 vNdc;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`,$t=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${ce}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;function je(r){let{gl:n}=r,t=r.compile(Wt,$t);return"kind"in t?t:{draw(e){let o=O(W(e.target,e.eye)),a=Math.abs(o[1])>.999?[0,0,1]:[0,1,0],i=O(j(o,a)),s=O(j(i,o));n.disable(n.DEPTH_TEST),n.depthMask(!1),n.disable(n.BLEND),n.useProgram(t),n.uniform3f(n.getUniformLocation(t,"uRight"),i[0],i[1],i[2]),n.uniform3f(n.getUniformLocation(t,"uUp"),s[0],s[1],s[2]),n.uniform3f(n.getUniformLocation(t,"uForward"),o[0],o[1],o[2]),n.uniform1f(n.getUniformLocation(t,"uTanHalfFov"),Math.tan(e.fovDeg*Math.PI/360)),n.uniform1f(n.getUniformLocation(t,"uAspect"),Math.max(.001,e.aspect)),le(n,t,e.sky),r.blit(t),n.depthMask(!0),n.enable(n.DEPTH_TEST)},dispose(){n.deleteProgram(t)}}}var bt=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,We=`#version 300 es
precision highp float;
void main(){}`,Yt=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,Et=`#version 300 es
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
}`,pt=`#version 300 es
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
${ce}

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
}`;function fe(r,n){let{gl:t}=r,e=t.createVertexArray(),o=t.createBuffer(),a=t.createBuffer(),i=t.createBuffer(),s=t.createBuffer();return!e||!o||!a||!i||!s?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(t.bindVertexArray(e),t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,n.positions,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,a),t.bufferData(t.ARRAY_BUFFER,n.normals,t.STATIC_DRAW),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,i),t.bufferData(t.ARRAY_BUFFER,n.tangents,t.STATIC_DRAW),t.enableVertexAttribArray(2),t.vertexAttribPointer(2,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,s),t.bufferData(t.ELEMENT_ARRAY_BUFFER,n.indices,t.STATIC_DRAW),t.bindVertexArray(null),{vao:e,indexCount:n.indices.length,indexType:n.indices instanceof Uint32Array?t.UNSIGNED_INT:t.UNSIGNED_SHORT,dispose(){t.deleteVertexArray(e),t.deleteBuffer(o),t.deleteBuffer(a),t.deleteBuffer(i),t.deleteBuffer(s)}})}function $e(r){let{gl:n}=r,t=r.compile(bt,We);if("kind"in t)return t;let e=r.compile(Et,pt);if("kind"in e)return e;let o=r.compile(Yt,We);if("kind"in o)return o;let a=(i,s)=>n.getUniformLocation(i,s);return{shadowPass(i,s,u,f){let l=f??(()=>{});u.bind(),l("shadow.bind"),n.clear(n.DEPTH_BUFFER_BIT),n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.FRONT),n.useProgram(t),l("useProgram(shadow)"),n.uniformMatrix4fv(a(t,"uLightVP"),!1,i),l("uLightVP");for(let c of s)n.uniformMatrix4fv(a(t,"uModel"),!1,c.model),l("shadow uModel"),n.bindVertexArray(c.mesh.vao),l("shadow bindVAO"),n.drawElements(n.TRIANGLES,c.mesh.indexCount,c.mesh.indexType,0),l("shadow drawElements");n.bindVertexArray(null),n.cullFace(n.BACK)},depthPrepass(i,s){n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.colorMask(!1,!1,!1,!1),n.useProgram(o),n.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let u of s)n.uniformMatrix4fv(a(o,"uModel"),!1,u.model),n.bindVertexArray(u.mesh.vao),n.drawElements(n.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0);n.bindVertexArray(null),n.colorMask(!0,!0,!0,!0)},draw(i){let s=i.onStep??(()=>{});if(n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.useProgram(e),n.uniformMatrix4fv(a(e,"uViewProj"),!1,i.viewProj),s("uViewProj"),n.uniform3fv(a(e,"uEye"),i.eye),s("uEye"),n.uniform3fv(a(e,"uLightDir"),i.lightDir),s("uLightDir"),n.uniform3fv(a(e,"uLightColour"),i.lightColour),s("uLightColour"),n.uniform1f(a(e,"uAmbientGain"),i.ambientGain??1),s("uAmbientGain"),i.fog&&i.fog.density>0){n.uniform1f(a(e,"uFogDensity"),i.fog.density),n.uniform1f(a(e,"uFogHeight"),i.fog.height),n.uniform1f(a(e,"uFogFloor"),i.fog.floor??0);let u=i.fog.colour;u==="sky"?n.uniform3f(a(e,"uFogColour"),-1,-1,-1):n.uniform3f(a(e,"uFogColour"),u[0],u[1],u[2]),s("fog")}else n.uniform1f(a(e,"uFogDensity"),0);le(n,e,i.sky),s("bindSky"),i.ao&&i.screenSize?(n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,i.ao),n.uniform1i(a(e,"uAO"),1),n.uniform2f(a(e,"uScreenSize"),i.screenSize[0],i.screenSize[1]),n.uniform1f(a(e,"uAOEnabled"),1)):n.uniform1f(a(e,"uAOEnabled"),0),s("bindAO"),n.uniformMatrix4fv(a(e,"uLightVP"),!1,i.lightVP),s("lit uLightVP"),i.shadow?(n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,i.shadow.depthTexture),n.uniform1i(a(e,"uShadowMap"),0),n.uniform1f(a(e,"uShadowTexel"),1/i.shadow.size),n.uniform1f(a(e,"uShadowStrength"),i.shadowStrength??1)):n.uniform1f(a(e,"uShadowStrength"),0);for(let u of i.draws)n.uniformMatrix4fv(a(e,"uModel"),!1,u.model),n.uniformMatrix3fv(a(e,"uNormalMat"),!1,u.normalMat),s("uNormalMat"),n.uniform3fv(a(e,"uBaseColour"),u.material.baseColour),s("uBaseColour"),n.uniform1f(a(e,"uRoughness"),u.material.roughness),n.uniform1f(a(e,"uMetalness"),u.material.metalness),n.uniform1f(a(e,"uAnisotropy"),u.material.anisotropy??0),n.bindVertexArray(u.mesh.vao),s("lit bindVAO"),n.drawElements(n.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0),s("lit drawElements");n.bindVertexArray(null),n.disable(n.CULL_FACE)},dispose(){n.deleteProgram(t),n.deleteProgram(e),n.deleteProgram(o)}}}var J=`
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
}`,xt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Kt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${J}

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
}`,Qt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${J}

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
}`;function Ye(r,n,t){let{gl:e}=r,o=r.compile(xt,Kt);if("kind"in o)return o;let a=r.compile(xt,Qt);if("kind"in a)return a;let i=Math.max(1,n>>1),s=Math.max(1,t>>1),u=()=>{let m=e.createFramebuffer(),b=e.createTexture();return!m||!b?null:{fb:m,tex:b}},f=u(),l=u();if(!f||!l)return P("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let c=()=>{for(let m of[f,l])e.bindTexture(e.TEXTURE_2D,m.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,i,s,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,m.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,m.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};c(),e.bindFramebuffer(e.FRAMEBUFFER,f.fb);let d=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),d!==e.FRAMEBUFFER_COMPLETE)return P("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${d.toString(16)}).`);let h=(m,b,p,F,E,R,g)=>{e.activeTexture(e.TEXTURE0+g),e.bindTexture(e.TEXTURE_2D,b),e.uniform1i(e.getUniformLocation(m,"uDepth"),g),e.uniform2f(e.getUniformLocation(m,"uNearFar"),p,F),e.uniform1f(e.getUniformLocation(m,"uTanHalfFov"),Math.tan(E*Math.PI/360)),e.uniform1f(e.getUniformLocation(m,"uAspect"),R)};return{get texture(){return f.tex},get width(){return i},get height(){return s},compute(m){e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,f.fb),e.viewport(0,0,i,s),e.useProgram(o),h(o,m.depthTexture,m.near,m.far,m.fovDeg,m.aspect,0),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/i,1/s),e.uniform1f(e.getUniformLocation(o,"uRadius"),m.radius??.55),e.uniform1f(e.getUniformLocation(o,"uStrength"),m.strength??1.15),e.uniform1f(e.getUniformLocation(o,"uBias"),m.bias??.035),r.blit(o);for(let[b,p,F]of[[f,l,[1,0]],[l,f,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,p.fb),e.viewport(0,0,i,s),e.useProgram(a),h(a,m.depthTexture,m.near,m.far,m.fovDeg,m.aspect,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,b.tex),e.uniform1i(e.getUniformLocation(a,"uAO"),1),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/i,1/s),e.uniform2f(e.getUniformLocation(a,"uDir"),F[0],F[1]),r.blit(a);e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(m,b){let p=Math.max(1,m>>1),F=Math.max(1,b>>1);p===i&&F===s||(i=p,s=F,c())},dispose(){e.deleteProgram(o),e.deleteProgram(a);for(let m of[f,l])e.deleteFramebuffer(m.fb),e.deleteTexture(m.tex)}}}var qt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Zt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uFocusDistance;
uniform float uAperture;
uniform float uMaxCoc;
out vec4 frag;
${J}

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
}`;function Ke(r,n,t){let{gl:e}=r,o=r.compile(qt,Zt);if("kind"in o)return o;let a=Math.max(1,Math.floor(n)),i=Math.max(1,Math.floor(t)),s=e.createFramebuffer(),u=e.createTexture();if(!s||!u)return P("FRAMEBUFFER_INCOMPLETE","The GPU refused a depth-of-field buffer.");let f=()=>{e.bindTexture(e.TEXTURE_2D,u);let c=r.hdr?e.RGBA16F:e.RGBA8,d=r.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE;e.texImage2D(e.TEXTURE_2D,0,c,a,i,0,e.RGBA,d,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,s),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,u,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};f(),e.bindFramebuffer(e.FRAMEBUFFER,s);let l=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),l!==e.FRAMEBUFFER_COMPLETE?P("FRAMEBUFFER_INCOMPLETE",`The DOF buffer is incomplete (0x${l.toString(16)}).`):{texture:u,apply(c){e.bindFramebuffer(e.FRAMEBUFFER,s),e.viewport(0,0,a,i),e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.useProgram(o),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,c.scene),e.uniform1i(e.getUniformLocation(o,"uScene"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,c.depthTexture),e.uniform1i(e.getUniformLocation(o,"uDepth"),1),e.uniform2f(e.getUniformLocation(o,"uNearFar"),c.near,c.far),e.uniform1f(e.getUniformLocation(o,"uTanHalfFov"),Math.tan(c.fovDeg*Math.PI/360)),e.uniform1f(e.getUniformLocation(o,"uAspect"),c.aspect),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/a,1/i),e.uniform1f(e.getUniformLocation(o,"uFocusDistance"),c.focusDistance),e.uniform1f(e.getUniformLocation(o,"uAperture"),c.aperture??12),e.uniform1f(e.getUniformLocation(o,"uMaxCoc"),c.maxCoc??.012),r.blit(o),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(c,d){let h=Math.max(1,Math.floor(c)),m=Math.max(1,Math.floor(d));h===a&&m===i||(a=h,i=m,f())},dispose(){e.deleteProgram(o),e.deleteFramebuffer(s),e.deleteTexture(u)}}}var pe=new URLSearchParams(location.search),he=pe.get("dof")!=="0",tt=pe.get("ao")!=="0",U=Math.max(1,Math.min(3,Number(pe.get("scale")??1))),_t=Number(pe.get("frames")??300),v=1200*U,_=720*U,H=document.getElementById("c");H.width=v;H.height=_;var St=document.getElementById("log");function Lt(r){throw document.title="REFUSED",St.textContent=r,new Error(r)}function C(r,n){return"kind"in n&&Lt(`${r}: ${n.code} \u2014 ${n.reason} ${n.detail??""}`),n}var me=Fe(H,{alpha:!1});Ae(me)||Lt(`stage: ${me.code} \u2014 ${me.reason}`);var N=me,y=N.gl,Jt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,er=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${De}
${we}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,tr=C("present",N.compile(Jt,er)),Qe=C("lit",$e(N)),Y=C("target",Xe(N,v,_)),rt=C("shadow",ze(N,1536)),rr=C("sky",je(N)),Tt=C("ao",Ye(N,v,_)),yt=C("dof",Ke(N,v,_)),X={target:[0,.62,.1],distance:8.4,azimuthDeg:1.5,elevationDeg:7.2,fovDeg:38},G=ie(X),qe=X.fovDeg??38,nt=Math.max(.01,X.distance/100),gt=Math.max(nt+1,X.distance*8),be=.06,Dt=[{id:"P1",x:-3.55,z:-1.25,w:1.72,h:1.3,hex:"#16203A",roughness:.5},{id:"P2",x:-1.62,z:.75,w:1.3,h:1.62,hex:"#16203A",roughness:.46},{id:"P3",x:.18,z:2.35,w:1.44,h:1.36,hex:"#2C6BFF",roughness:.42},{id:"P4",x:1.62,z:1.15,w:1.2,h:1.54,hex:"#2C6BFF",roughness:.44},{id:"P5",x:3.62,z:-2.1,w:1.78,h:1.18,hex:"#16203A",roughness:.52}],nr=.72,wt=Ne(30,24),Pt=Dt.map(r=>Ue(r.w,r.h,be)),or=C("deck mesh",fe(N,wt)),ar=Pt.map((r,n)=>C(`panel ${n} mesh`,fe(N,r))),Ut=(r,n,t,e)=>{let o=ne(),a=Math.cos(e),i=Math.sin(e);return o[0]=a,o[2]=-i,o[8]=i,o[10]=a,o[12]=r,o[13]=n,o[14]=t,o},ir=r=>new Float32Array([r[0],r[1],r[2],r[4],r[5],r[6],r[8],r[9],r[10]]),B=Dt.map((r,n)=>{let t=Math.atan2(G[0]-r.x,G[2]-r.z)*nr,e=Math.cos(t),o=Math.sin(t),a=Ut(r.x,r.h/2,r.z,t),i=(u,f)=>[r.x+e*u+o*(be/2),f,r.z-o*u+e*(be/2)],s=i(0,r.h/2);return{...r,yaw:t,model:a,facePoint:i,mesh:ar[n],normalMat:ir(a),eyeDistance:Math.hypot(G[0]-s[0],G[1]-s[1],G[2]-s[2])}}),Nt=B.reduce((r,n)=>n.eyeDistance<r.eyeDistance?n:r),xe=Nt.eyeDistance,sr=new Float32Array([1,0,0,0,1,0,0,0,1]),Ze=[{mesh:or,model:Ut(0,0,0,0),normalMat:sr,material:{baseColour:Z("#070B14"),roughness:.86,metalness:0}},...B.map(r=>({mesh:r.mesh,model:r.model,normalMat:r.normalMat,material:{baseColour:Z(r.hex),roughness:r.roughness,metalness:.06}}))],I=[.62,-.55,-.58],Ot=[-4.8,0,-4.6],Bt=[6.2,1.9,3],ur=He(Ot,Bt),cr=ke(Ot,Bt),Rt=Ve({direction:I,colour:[1,1,1],extent:7.6},ur,cr),lr=[wt,...Pt].reduce((r,n)=>r+Oe(n),0);function Ee(){let r=se(X,v/_);Qe.shadowPass(Rt,Ze,rt),Y.bind(),y.clear(y.DEPTH_BUFFER_BIT),rr.draw({eye:G,target:X.target,fovDeg:qe,aspect:v/_}),Qe.depthPrepass(r,Ze),tt&&(Tt.compute({depthTexture:Y.depthTexture,near:nt,far:gt,fovDeg:qe,aspect:v/_,radius:.5,strength:1.3}),Y.bind()),Qe.draw({viewProj:r,eye:G,lightDir:I,lightColour:[3.5,3.45,3.3],ambientGain:1.05,lightVP:Rt,shadow:rt,shadowStrength:.92,draws:Ze,ao:tt?Tt.texture:null,screenSize:[v,_]});let n=Y.texture;he&&(yt.apply({scene:Y.texture,depthTexture:Y.depthTexture,near:nt,far:gt,fovDeg:qe,aspect:v/_,focusDistance:xe,aperture:.16,maxCoc:.014}),n=yt.texture),y.bindFramebuffer(y.FRAMEBUFFER,null),y.viewport(0,0,v,_),y.disable(y.DEPTH_TEST),y.activeTexture(y.TEXTURE0),y.bindTexture(y.TEXTURE_2D,n),N.blit(tr,t=>y.uniform1i(y.getUniformLocation(t,"uScene"),0))}Ee();function fr(r){Ee();let n=new Uint8Array(4);y.readPixels(0,0,1,1,y.RGBA,y.UNSIGNED_BYTE,n);let t=performance.now();for(let e=0;e<r;e++)Ee();return y.readPixels(0,0,1,1,y.RGBA,y.UNSIGNED_BYTE,n),(performance.now()-t)/r}var Je=fr(Math.max(1,_t)),Te=se(X,v/_),mr=r=>[r.facePoint(-r.w/2,0),r.facePoint(r.w/2,0),r.facePoint(r.w/2,r.h),r.facePoint(-r.w/2,r.h)].map(n=>k(Te,n,v,_)),K=B.map(mr),at=(r,n,t)=>{let e=0;for(let o=0;o<4;o++){let a=r[o],i=r[(o+1)%4],s=(i.sx-a.sx)*(t-a.sy)-(i.sy-a.sy)*(n-a.sx);if(Math.abs(s)<1e-9)continue;let u=s>0?1:-1;if(e===0)e=u;else if(u!==e)return!1}return!0},ee=(()=>{let r=Math.hypot(I[0],I[1],I[2]);return[-I[0]/r,-I[1]/r,-I[2]/r]})(),Ct=(r,n,t,e)=>B.some((o,a)=>{if(a===e)return!1;let i=Math.cos(o.yaw),s=Math.sin(o.yaw),u=s*ee[0]+i*ee[2];if(Math.abs(u)<1e-6)return!1;let f=(s*(o.x-r)+i*(o.z-t))/u;if(f<=0)return!1;let l=r+ee[0]*f,c=n+ee[1]*f,d=t+ee[2]*f,h=(l-o.x)*i-(d-o.z)*s;return Math.abs(h)<=o.w/2&&c>=0&&c<=o.h}),dr=B.map((r,n)=>{let t=0,e=0,o=0,a=null;for(let l=1;l<=15;l++)for(let c=1;c<=23;c++){let d=(c/24-.5)*r.w,h=l/16*r.h,m=r.facePoint(d,h),b=k(Te,m,v,_);if(e++,Ct(m[0],m[1],m[2],n)&&o++,b.behind||b.sx<0||b.sx>=v||b.sy<0||b.sy>=_||B.some((F,E)=>E!==n&&F.eyeDistance<r.eyeDistance&&at(K[E],b.sx,b.sy)))continue;t++;let p=Math.abs(d)/r.w+Math.abs(h-r.h/2)/r.h;(!a||p<a.rank)&&(a={sx:b.sx,sy:b.sy,rank:p})}let i=new Uint8Array(4);a&&y.readPixels(Math.round(a.sx),Math.round(_-a.sy),1,1,y.RGBA,y.UNSIGNED_BYTE,i);let s=Math.min(.014,Math.abs(1/xe-1/r.eyeDistance)*.16),u=K[n].map(l=>l.sx),f=K[n].map(l=>l.sy);return{id:r.id,hex:r.hex,eyeDistance:Number(r.eyeDistance.toFixed(2)),yawDeg:Number((r.yaw*180/Math.PI).toFixed(1)),cocPx:Number((s*(v/U)).toFixed(1)),visiblePct:Math.round(100*t/e),inShadowPct:Math.round(100*o/e),offFrame:K[n].some(l=>l.behind||l.sx<0||l.sx>v||l.sy<0||l.sy>_),screen:[Math.round(Math.min(...u)/U),Math.round(Math.min(...f)/U),Math.round(Math.max(...u)/U),Math.round(Math.max(...f)/U)],sample:a?{sx:Math.round(a.sx/U),sy:Math.round(a.sy/U),rgb:[i[0],i[1],i[2]]}:null}}),hr=(()=>{let r=new Uint8Array(4),n={lit:{r:0,g:0,b:0,n:0},shade:{r:0,g:0,b:0,n:0}};for(let e=-5;e<=5.001;e+=.25)for(let o=-3.5;o<=4.001;o+=.25){let a=k(Te,[e,0,o],v,_);if(a.behind||a.sx<0||a.sx>=v||a.sy<0||a.sy>=_||K.some(s=>at(s,a.sx,a.sy)))continue;y.readPixels(Math.round(a.sx),Math.round(_-a.sy),1,1,y.RGBA,y.UNSIGNED_BYTE,r);let i=Ct(e,0,o,-1)?n.shade:n.lit;i.r+=r[0],i.g+=r[1],i.b+=r[2],i.n+=1}let t=e=>e.n===0?null:[Math.round(e.r/e.n),Math.round(e.g/e.n),Math.round(e.b/e.n)];return{litSamples:n.lit.n,litRgb:t(n.lit),shadowedSamples:n.shade.n,shadowedRgb:t(n.shade)}})(),br={E0:"GGX + shadows + AO + DOF. 1.305 ms/frame at 1x on the M1, by trailing-readPixels",E1:"real DOM content projected onto lit GL surfaces \u2014 the panel you are reading",E2:"seven corridors, lift monotonic with distance; no landmasses yet",E5:"driven from the same input as the shipping flat engine; cell counts agree exactly",E6:"depth is time; fog is the reading limit on it, and both horizons are reported",E8:"on the sign-in route in both themes, with a CSS fallback and a pixel ratchet"},At=["E1","E8","E0","E6","E5","E2"],ye=Object.keys(w).sort((r,n)=>(At.indexOf(r)+1||99)-(At.indexOf(n)+1||99)),it=["P3","P4","P2","P5","P1"],It=ye.slice(0,it.length),de=ye.slice(it.length),Er=r=>{let n=r.split(/[.·—]/)[0].trim();if(n.length<=26)return n.toUpperCase();let t=n.slice(0,26),e=t.lastIndexOf(" ");return(e>8?t.slice(0,e):t).toUpperCase()},pr=Object.fromEntries(It.map((r,n)=>{let t=it[n],e=w[r];return[t,{tag:`${e.id} \xB7 ${e.name}`,state:Er(e.verdict),note:br[r]??e.verdict}]})),Ft=250,Mt=.11,te=.1,ge=document.createElement("div");ge.style.cssText="position:absolute;inset:0;pointer-events:none";var Re=document.createElement("div");Re.style.cssText="position:relative;overflow:hidden;width:1200px;height:720px";H.parentNode?.insertBefore(Re,H);Re.appendChild(H);Re.appendChild(ge);var xr=[...B].map((r,n)=>({p:r,i:n})).sort((r,n)=>n.p.eyeDistance-r.p.eyeDistance),Tr=[0,.06,-.06,.12,-.12,.18,-.18,.24,-.24,.3,-.3,.36,-.36],yr=[1,.92,.84,.76,.68,.6],Gt=r=>Math.min(.014,Math.abs(1/xe-1/r)*.16)*(v/U),vt=Math.max(...B.map(r=>Gt(r.eyeDistance))),gr=2.4,Rr=xr.map(({p:r,i:n})=>{let t=pr[r.id],e=be/2+.008,o=Math.cos(r.yaw),a=Math.sin(r.yaw),i=(x,A)=>[r.x+o*x+a*e,A,r.z-a*x+o*e],s=(x,A,M)=>({topLeft:i(M-x/2,te+A),topRight:i(M+x/2,te+A),bottomRight:i(M+x/2,te),bottomLeft:i(M-x/2,te)}),u=x=>x.filter(A=>B.some((M,L)=>L!==n&&M.eyeDistance<r.eyeDistance&&at(K[L],A.x*U,A.y*U))).length,f=null,l=null,c=4;e:for(let x of yr){let A=Math.max(.2,(r.w-2*Mt)*x),M=Math.max(.2,(r.h-2*te)*x),L=Math.round(A*Ft),D=Math.round(M*Ft);for(let Q of Tr){if(Math.abs(Q)+A/2>r.w/2-Mt*.5)continue;let V=Be(Te,s(A,M,Q),v/U,_/U,L,D);if(Ce(V)){l=V.refusal;continue}let q=u(V.screen);if(c=Math.min(c,q),q===0&&V.signedArea>0){f={proj:V,ew:L,eh:D,shift:Q,scale:x,occluded:q};break e}}}if(!f)return{id:r.id,shown:!1,refusal:l??"NO_UNOCCLUDED_PLACEMENT",backFacing:!1,occludedCorners:c,contentShift:null,contentScale:null,perspectiveX:null,elementPx:null,rectError:null};let{proj:d,ew:h,eh:m}=f,b=r.hex==="#2C6BFF",p=b?"rgba(255,255,255,0.78)":"#7fb2ff",F=b?"rgba(255,255,255,0.80)":"rgba(198,212,236,0.78)",E=Gt(r.eyeDistance),R=he?gr*(E/Math.max(1e-6,vt)):0,g=he?1-.42*(E/Math.max(1e-6,vt)):1,T=document.createElement("div");T.style.cssText=["position:absolute","left:0","top:0",`width:${h}px`,`height:${m}px`,"transform-origin:0 0",`transform:${d.transform}`,"display:flex","flex-direction:column","justify-content:flex-end","gap:7px","overflow:hidden",`filter:blur(${R.toFixed(2)}px)`,`opacity:${g.toFixed(3)}`,"-webkit-font-smoothing:antialiased"].join(";"),T.innerHTML=`<div style="font:600 11px/1 ui-monospace,monospace;letter-spacing:.14em;color:${p}">${t.tag}</div><div style="font:700 27px/1.02 system-ui,sans-serif;color:#fff;letter-spacing:-0.01em">${t.state}</div><div style="font:400 11.5px/1.45 system-ui,sans-serif;color:${F}">${t.note}</div>`,ge.appendChild(T);let S=null;{let x=H.getBoundingClientRect(),A=T.getBoundingClientRect(),M=d.screen.map(D=>D.x),L=d.screen.map(D=>D.y);S=Number(Math.max(Math.abs(A.left-x.left-Math.min(...M)),Math.abs(A.top-x.top-Math.min(...L)),Math.abs(A.right-x.left-Math.max(...M)),Math.abs(A.bottom-x.top-Math.max(...L))).toFixed(2))}return{id:r.id,shown:!0,refusal:null,backFacing:!1,occludedCorners:0,contentShift:Number(f.shift.toFixed(2)),contentScale:f.scale,perspectiveX:Number((d.matrix[6]*1e3).toFixed(3)),elementPx:[h,m],cocPx:Number(E.toFixed(1)),domBlurPx:Number(R.toFixed(2)),domOpacity:Number(g.toFixed(3)),rectError:S}}),Vt=(()=>{let r=y.getExtension("WEBGL_debug_renderer_info");return r?String(y.getParameter(r.UNMASKED_RENDERER_WEBGL)):"unknown"})(),et=/swiftshader|llvmpipe|software/i.test(Vt);{let r=document.createElement("div");r.style.cssText="position:absolute;left:16px;top:14px;display:flex;flex-direction:column;gap:5px;font:500 10.5px/1.4 ui-monospace,monospace;letter-spacing:.05em",r.innerHTML=`<div style="color:#8FB7FF;font-weight:600;letter-spacing:.15em">3D PROGRAMME \xB7 ${ye.length} ENVIRONMENTS</div><div style="color:rgba(196,212,240,0.8)">STATE DERIVED FROM EACH README AT BUILD TIME</div>`+(de.length?`<div style="color:#E0A94A">${de.length} NOT SHOWN \u2014 ONLY 5 PANELS: ${de.join(" ")}</div>`:""),ge.appendChild(r)}var ot=Pe();if(ot.length>0){let r="BRAND FIDELITY FAILED \u2014 "+ot.map(t=>`${t.key}: expected ${t.expected}, got ${t.actual}`).join("; ");document.title="REFUSED";let n=document.getElementById("log");throw n&&(n.textContent=r),new Error(r)}var kt={brandFidelity:ot,dof:he,ao:tt,hdr:N.hdr,eye:G.map(r=>Number(r.toFixed(2))),focusPanel:Nt.id,focusDistance:Number(xe.toFixed(2)),panels:dr,projections:Rr,environments:ye,environmentsShown:It,environmentsOmitted:de,deck:hr,glError:y.getError(),triangles:lr,shadowMap:rt.size,resolution:`${v}x${_}`,dprScale:U,frames:_t,msPerFrame:Number(Je.toFixed(3)),fps:Math.round(1e3/Je),renderer:Vt,rendererClass:et?"software":"hardware",headroom:et?null:Number((16.6-Je).toFixed(3)),headroomRefusal:et?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null,hardwareMsPerFrame:null};globalThis.E1=kt;St.textContent=JSON.stringify(kt,null,2);Ee();document.title="READY";

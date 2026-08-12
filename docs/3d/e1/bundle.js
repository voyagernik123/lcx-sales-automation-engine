var w={E0:{id:"E0",name:"THE SPIKE",verdict:"GATE MET"},E1:{id:"E1",name:"THE THEATRE",verdict:"THE HYBRID WORKS. \xA77(b) is now a real tension, not a gap."},E2:{id:"E2",name:"THE GLOBE",verdict:"CARRIES INFORMATION. \xA77(b) still unproven."},E5:{id:"E5",name:"THE SURFACE",verdict:"AGREES WITH THE SHIPPING ENGINE. \xA72's ribbons and drag are not built."},E6:{id:"E6",name:"THE VAULT",verdict:"READS. Six framing errors, every one caught by a count."},E8:{id:"E8",name:"THE FORGE",verdict:"the first shippable environment"}};var ut={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected."};function P(r,n){return n===void 0?{kind:"refused",code:r,reason:ut[r]}:{kind:"refused",code:r,reason:ut[r],detail:n}}function Fe(r){return r.kind==="stage"}function Ae(r,n={}){let t=r.getContext("webgl2",{antialias:n.antialias??!1,alpha:n.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!t)return P("NO_WEBGL2");let e=t.getExtension("EXT_color_buffer_float"),o=r.width,a=r.height,i=e?t.RGBA16F:t.RGBA8,s=e?t.HALF_FLOAT:t.UNSIGNED_BYTE,u=(p,R)=>{let g=t.createTexture();t.bindTexture(t.TEXTURE_2D,g),t.texImage2D(t.TEXTURE_2D,0,i,p,R,0,t.RGBA,s,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);let y=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,y),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,g,0);let _=t.checkFramebufferStatus(t.FRAMEBUFFER);return _!==t.FRAMEBUFFER_COMPLETE?P("FRAMEBUFFER_INCOMPLETE",`status 0x${_.toString(16)} at ${p}\xD7${R}`):{texture:g,framebuffer:y,width:p,height:R}},f=n.bloomShift??2,c={w:o,h:a},l=u(o,a);if("kind"in l)return l;let m=u(Math.max(1,o>>f),Math.max(1,a>>f));if("kind"in m)return m;let h=u(Math.max(1,o>>f),Math.max(1,a>>f));if("kind"in h)return h;let d=t.createVertexArray();t.bindVertexArray(d);let b=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,b),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null);let E=[];return{kind:"stage",gl:t,cssWidth:r.clientWidth||o,cssHeight:r.clientHeight||a,hdr:!!e,get width(){return c.w},get height(){return c.h},get scene(){return l},get bloomA(){return m},get bloomB(){return h},setRegion(p,R){let g=Math.max(1,Math.round(p)),y=Math.max(1,Math.round(R));if(!(g===c.w&&y===c.h)){c={w:g,h:y};for(let _ of[l,m,h])"kind"in _||(t.deleteFramebuffer(_.framebuffer),t.deleteTexture(_.texture));l=u(g,y),m=u(Math.max(1,g>>f),Math.max(1,y>>f)),h=u(Math.max(1,g>>f),Math.max(1,y>>f))}},compile(p,R){let g=(F,v)=>{let L=t.createShader(F);return t.shaderSource(L,v),t.compileShader(L),t.getShaderParameter(L,t.COMPILE_STATUS)?L:P("SHADER_COMPILE_FAILED",t.getShaderInfoLog(L)??"(no log)")},y=g(t.VERTEX_SHADER,p);if(typeof y=="object"&&"kind"in y)return y;let _=g(t.FRAGMENT_SHADER,R);if(typeof _=="object"&&"kind"in _)return _;let x=t.createProgram();return t.attachShader(x,y),t.attachShader(x,_),t.linkProgram(x),t.getProgramParameter(x,t.LINK_STATUS)?(E.push(x),x):P("PROGRAM_LINK_FAILED",t.getProgramInfoLog(x)??"(no log)")},bindTarget(p){t.bindFramebuffer(t.FRAMEBUFFER,p?p.framebuffer:null),t.viewport(0,0,p?p.width:c.w,p?p.height:c.h)},blit(p,R){t.useProgram(p),t.bindVertexArray(d),R?.(p),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null)},dispose(){for(let p of E)t.deleteProgram(p);for(let p of[l,m,h])"kind"in p||(t.deleteFramebuffer(p.framebuffer),t.deleteTexture(p.texture));t.deleteBuffer(b),t.deleteVertexArray(d)}}}var oe=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function ae(r,n){let t=new Float32Array(16);for(let e=0;e<4;e++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=r[i*4+o]*n[e*4+i];t[e*4+o]=a}return t}var W=(r,n)=>[r[0]-n[0],r[1]-n[1],r[2]-n[2]],ne=(r,n)=>r[0]*n[0]+r[1]*n[1]+r[2]*n[2],j=(r,n)=>[r[1]*n[2]-r[2]*n[1],r[2]*n[0]-r[0]*n[2],r[0]*n[1]-r[1]*n[0]];function B(r){let n=Math.hypot(r[0],r[1],r[2]);return n===0?r:[r[0]/n,r[1]/n,r[2]/n]}function ve(r,n,t,e){let o=1/Math.tan(r/2);return new Float32Array([o/n,0,0,0,0,o,0,0,0,0,(e+t)/(t-e),-1,0,0,2*e*t/(t-e),0])}function Me(r,n,t,e,o,a){let i=n-r,s=e-t,u=a-o;return new Float32Array([2/i,0,0,0,0,2/s,0,0,0,0,-2/u,0,-(n+r)/i,-(e+t)/s,-(a+o)/u,1])}function ie(r,n,t){let e=B(W(r,n)),o=j(t,e);if(Math.hypot(o[0],o[1],o[2])<1e-8)return oe();let a=B(o),i=j(e,a);return new Float32Array([a[0],i[0],e[0],0,a[1],i[1],e[1],0,a[2],i[2],e[2],0,-ne(a,r),-ne(i,r),-ne(e,r),1])}function lt(r,n){let t=[0,1,2,3].map(o=>r[0+o]*n[0]+r[4+o]*n[1]+r[8+o]*n[2]+r[12+o]),e=t[3];return{x:t[0]/e,y:t[1]/e,z:t[2]/e,w:e}}function V(r,n,t,e){let o=lt(r,n);return{sx:(o.x*.5+.5)*t,sy:(1-(o.y*.5+.5))*e,behind:o.w<=0}}function ct(r){return r<=.04045?r/12.92:Math.pow((r+.055)/1.055,2.4)}function Se(r){return r<=.0031308?r*12.92:1.055*Math.pow(r,1/2.4)-.055}var jt=/^#?([0-9a-fA-F]{6})$/;function J(r){let n=jt.exec(r.trim());if(!n)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(r)}`);let t=n[1];return[0,2,4].map(e=>ct(parseInt(t.slice(e,e+2),16)/255))}function _e(r){return`#${r.map(t=>{let e=Se(Math.min(1,Math.max(0,t)));return Math.round(e*255).toString(16).padStart(2,"0")}).join("")}`}var $={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},Le=Object.freeze(Object.fromEntries(Object.keys($).map(r=>[r,J($[r])])));var ft=.4;var we=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${ft.toFixed(2)}); }`,De=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function Pe(){let r=[];for(let n of Object.keys($)){let t=$[n].toLowerCase(),e=_e(Le[n]).toLowerCase();e!==t&&r.push({key:n,expected:t,actual:e})}return r}function Wt(r){let n=[1/0,1/0,1/0],t=[-1/0,-1/0,-1/0];for(let e=0;e<r.length;e+=3)for(let o=0;o<3;o++){let a=r[e+o];a<n[o]&&(n[o]=a),a>t[o]&&(t[o]=a)}return r.length===0?{min:[0,0,0],max:[0,0,0]}:{min:n,max:t}}function dt(r,n,t,e){let o=new Float32Array(r.length);for(let i=0;i<e.length;i+=3){let s=e[i],u=e[i+1],f=e[i+2],c=s*3,l=u*3,m=f*3,h=s*2,d=u*2,b=f*2,E=r[l]-r[c],A=r[l+1]-r[c+1],p=r[l+2]-r[c+2],R=r[m]-r[c],g=r[m+1]-r[c+1],y=r[m+2]-r[c+2],_=t[d]-t[h],x=t[d+1]-t[h+1],F=t[b]-t[h],v=t[b+1]-t[h+1],L=_*v-F*x;if(Math.abs(L)<1e-12)continue;let D=1/L,Q=(E*v-R*x)*D,G=(A*v-g*x)*D,q=(p*v-y*x)*D;for(let z of[c,l,m])o[z]=o[z]+Q,o[z+1]=o[z+1]+G,o[z+2]=o[z+2]+q}let a=new Float32Array(r.length);for(let i=0;i<a.length;i+=3){let s=n[i],u=n[i+1],f=n[i+2],c=o[i],l=o[i+1],m=o[i+2],h=c*s+l*u+m*f;c-=s*h,l-=u*h,m-=f*h;let d=Math.hypot(c,l,m);d<1e-8&&(Math.abs(s)<.9?(c=0,l=-f,m=u):(c=-f,l=0,m=s),d=Math.hypot(c,l,m)||1),a[i]=c/d,a[i+1]=l/d,a[i+2]=m/d}return a}function mt(r,n){let t=new Float32Array(r.length);for(let e=0;e<n.length;e+=3){let o=n[e]*3,a=n[e+1]*3,i=n[e+2]*3,s=r[a]-r[o],u=r[a+1]-r[o+1],f=r[a+2]-r[o+2],c=r[i]-r[o],l=r[i+1]-r[o+1],m=r[i+2]-r[o+2],h=u*m-f*l,d=f*c-s*m,b=s*l-u*c;for(let E of[o,a,i])t[E]=t[E]+h,t[E+1]=t[E+1]+d,t[E+2]=t[E+2]+b}for(let e=0;e<t.length;e+=3){let o=Math.hypot(t[e],t[e+1],t[e+2]);o>0&&(t[e]=t[e]/o,t[e+1]=t[e+1]/o,t[e+2]=t[e+2]/o)}return t}function ht(r,n,t,e,o){let{min:a,max:i}=Wt(r),s=e??mt(r,t);return{positions:r,normals:s,uvs:n,indices:t,min:a,max:i,tangents:o??dt(r,s,n,t)}}function Ue(r=1,n=1,t=1){let e=r/2,o=n/2,a=t/2,i=[[[-e,-o,a],[e,-o,a],[e,o,a],[-e,o,a]],[[e,-o,-a],[-e,-o,-a],[-e,o,-a],[e,o,-a]],[[e,-o,a],[e,-o,-a],[e,o,-a],[e,o,a]],[[-e,-o,-a],[-e,-o,a],[-e,o,a],[-e,o,-a]],[[-e,o,a],[e,o,a],[e,o,-a],[-e,o,-a]],[[-e,-o,-a],[e,-o,-a],[e,-o,a],[-e,-o,a]]],s=new Float32Array(72),u=new Float32Array(48),f=new Uint16Array(36),c=0,l=0,m=0,h=0;for(let d of i){for(let[b,E,A]of d)s[c++]=b,s[c++]=E,s[c++]=A;u[l++]=0,u[l++]=0,u[l++]=1,u[l++]=0,u[l++]=1,u[l++]=1,u[l++]=0,u[l++]=1,f[m++]=h,f[m++]=h+1,f[m++]=h+2,f[m++]=h,f[m++]=h+2,f[m++]=h+3,h+=4}return ht(s,u,f)}function Ne(r=10,n=24){let t=Math.max(1,Math.floor(n)),e=(t+1)*(t+1),o=new Float32Array(e*3),a=new Float32Array(e*3),i=new Float32Array(e*2),s=new Uint16Array(t*t*6),u=0,f=0,c=0;for(let l=0;l<=t;l++)for(let m=0;m<=t;m++){let h=(m/t-.5)*r,d=(l/t-.5)*r;o[u]=h,o[u+1]=0,o[u+2]=d,a[u]=0,a[u+1]=1,a[u+2]=0,u+=3,i[f++]=m/t,i[f++]=l/t}for(let l=0;l<t;l++)for(let m=0;m<t;m++){let h=l*(t+1)+m,d=h+1,b=h+(t+1),E=b+1;s[c++]=h,s[c++]=b,s[c++]=d,s[c++]=d,s[c++]=b,s[c++]=E}return ht(o,i,s,a)}function Be(r){return r.indices.length/3}function $t(r){if(!Number.isFinite(r)||r===0)return"0";let n=r.toFixed(12).replace(/0+$/,"").replace(/\.$/,"");return n==="-0"?"0":n}function bt(r,n,t,e){let[o,a]=r,[i,s]=n,[u,f]=t,[c,l]=e,m=o-i+u-c,h=a-s+f-l;if(Math.abs(m)<1e-9&&Math.abs(h)<1e-9){let y=[i-o,c-o,o,s-a,l-a,a,0,0,1],_=y[0]*y[4]-y[1]*y[3];return Math.abs(_)<1e-9?null:y}let d=i-u,b=c-u,E=s-f,A=l-f,p=d*A-b*E;if(Math.abs(p)<1e-9)return null;let R=(m*A-b*h)/p,g=(d*h-m*E)/p;return[i-o+R*i,c-o+g*c,o,s-a+R*s,l-a+g*l,a,R,g,1]}function Oe(r,n,t,e,o,a){if(!(o>0)||!(a>0))return{refusal:"EMPTY_ELEMENT_BOX"};let s=[n.topLeft,n.topRight,n.bottomRight,n.bottomLeft].map(D=>V(r,D,t,e));if(s.some(D=>D.behind))return{refusal:"CORNER_BEHIND_CAMERA"};let u=s.map(D=>({x:D.sx,y:D.sy})),[f,c,l,m]=u,h=bt([f.x,f.y],[c.x,c.y],[l.x,l.y],[m.x,m.y]);if(!h)return{refusal:"DEGENERATE_ON_SCREEN"};let d=.5*(f.x*c.y-c.x*f.y+(c.x*l.y-l.x*c.y)+(l.x*m.y-m.x*l.y)+(m.x*f.y-f.x*m.y)),b=1/o,E=1/a,[A,p,R,g,y,_,x,F,v]=h;return{transform:`matrix3d(${[A*b,g*b,0,x*b,p*E,y*E,0,F*E,0,0,1,0,R,_,0,v].map($t).join(", ")})`,matrix:h,screen:u,signedArea:d}}function Ce(r){return"refusal"in r}var Ie=89,ke=Math.PI/180;function se(r){let n=Math.max(-Ie,Math.min(Ie,r.elevationDeg))*ke,t=r.azimuthDeg*ke,e=Math.max(1e-4,r.distance),o=Math.sin(n)*e,a=Math.cos(n)*e;return[r.target[0]+Math.sin(t)*a,r.target[1]+o,r.target[2]+Math.cos(t)*a]}function ue(r,n){let t=se(r),e=r.near??Math.max(.01,r.distance/100),o=r.far??Math.max(e+1,r.distance*8),a=ve((r.fovDeg??38)*ke,Math.max(.001,n),e,o),i=ie(t,r.target,[0,1,0]);return ae(a,i)}function Ge(r,n,t){let e=B(r.direction),o=r.extent??Math.max(.1,t*1.35),a=Math.max(1,t*2),i=[n[0]-e[0]*a,n[1]-e[1]*a,n[2]-e[2]*a],s=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],u=ie(i,n,s),f=Me(-o,o,-o,o,.01,a+t*2+o);return ae(f,u)}function Ve(r,n){let t=W([n[0],n[1],n[2]],[r[0],r[1],r[2]]);return Math.hypot(t[0],t[1],t[2])/2}function He(r,n){return[(r[0]+n[0])/2,(r[1]+n[1])/2,(r[2]+n[2])/2]}function Xe(r,n,t){let{gl:e}=r,o=Math.max(1,Math.floor(n)),a=Math.max(1,Math.floor(t)),i=e.createFramebuffer(),s=e.createTexture(),u=e.createTexture();if(!i||!s||!u)return P("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let f=r.hdr?e.RGBA16F:e.RGBA8,c=r.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,l=()=>{e.bindTexture(e.TEXTURE_2D,s),e.texImage2D(e.TEXTURE_2D,0,f,o,a,0,e.RGBA,c,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,u),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,o,a,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,s,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,u,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};l(),e.bindFramebuffer(e.FRAMEBUFFER,i);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE?P("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${m.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:s,depthTexture:u,get width(){return o},get height(){return a},bind(){e.bindFramebuffer(e.FRAMEBUFFER,i),e.viewport(0,0,o,a)},resize(h,d){let b=Math.max(1,Math.floor(h)),E=Math.max(1,Math.floor(d));b===o&&E===a||(o=b,a=E,l())},dispose(){e.deleteFramebuffer(i),e.deleteTexture(s),e.deleteTexture(u)}}}function ze(r,n=1024){let{gl:t}=r,e=Math.max(256,Math.min(2048,Math.floor(n))),o=t.createFramebuffer(),a=t.createTexture();if(!o||!a)return P("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");t.bindTexture(t.TEXTURE_2D,a),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,e,e,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,o),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,a,0);let i=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),i!==t.FRAMEBUFFER_COMPLETE?P("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:e,bind(){t.bindFramebuffer(t.FRAMEBUFFER,o),t.viewport(0,0,e,e)},dispose(){t.deleteFramebuffer(o),t.deleteTexture(a)}}}var ce=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,le={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function fe(r,n,t={}){let e=t.zenith??le.zenith,o=t.horizon??le.horizon,a=t.ground??le.ground;r.uniform3f(r.getUniformLocation(n,"uSkyZenith"),e[0],e[1],e[2]),r.uniform3f(r.getUniformLocation(n,"uSkyHorizon"),o[0],o[1],o[2]),r.uniform3f(r.getUniformLocation(n,"uSkyGround"),a[0],a[1],a[2])}var Yt=`#version 300 es
precision highp float;
out vec2 vNdc;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`,Kt=`#version 300 es
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
}`;function je(r){let{gl:n}=r,t=r.compile(Yt,Kt);return"kind"in t?t:{draw(e){let o=B(W(e.target,e.eye)),a=Math.abs(o[1])>.999?[0,0,1]:[0,1,0],i=B(j(o,a)),s=B(j(i,o));n.disable(n.DEPTH_TEST),n.depthMask(!1),n.disable(n.BLEND),n.useProgram(t),n.uniform3f(n.getUniformLocation(t,"uRight"),i[0],i[1],i[2]),n.uniform3f(n.getUniformLocation(t,"uUp"),s[0],s[1],s[2]),n.uniform3f(n.getUniformLocation(t,"uForward"),o[0],o[1],o[2]),n.uniform1f(n.getUniformLocation(t,"uTanHalfFov"),Math.tan(e.fovDeg*Math.PI/360)),n.uniform1f(n.getUniformLocation(t,"uAspect"),Math.max(.001,e.aspect)),fe(n,t,e.sky),r.blit(t),n.depthMask(!0),n.enable(n.DEPTH_TEST)},dispose(){n.deleteProgram(t)}}}var pt=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,We=`#version 300 es
precision highp float;
void main(){}`,Qt=`#version 300 es
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
}`,xt=`#version 300 es
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
}`;function de(r,n){let{gl:t}=r,e=t.createVertexArray(),o=t.createBuffer(),a=t.createBuffer(),i=t.createBuffer(),s=t.createBuffer();return!e||!o||!a||!i||!s?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(t.bindVertexArray(e),t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,n.positions,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,a),t.bufferData(t.ARRAY_BUFFER,n.normals,t.STATIC_DRAW),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,i),t.bufferData(t.ARRAY_BUFFER,n.tangents,t.STATIC_DRAW),t.enableVertexAttribArray(2),t.vertexAttribPointer(2,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,s),t.bufferData(t.ELEMENT_ARRAY_BUFFER,n.indices,t.STATIC_DRAW),t.bindVertexArray(null),{vao:e,indexCount:n.indices.length,indexType:n.indices instanceof Uint32Array?t.UNSIGNED_INT:t.UNSIGNED_SHORT,dispose(){t.deleteVertexArray(e),t.deleteBuffer(o),t.deleteBuffer(a),t.deleteBuffer(i),t.deleteBuffer(s)}})}function $e(r){let{gl:n}=r,t=r.compile(pt,We);if("kind"in t)return t;let e=r.compile(Et,xt);if("kind"in e)return e;let o=r.compile(Qt,We);if("kind"in o)return o;let a=(i,s)=>n.getUniformLocation(i,s);return{shadowPass(i,s,u,f){let c=f??(()=>{});u.bind(),c("shadow.bind"),n.clear(n.DEPTH_BUFFER_BIT),n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.FRONT),n.useProgram(t),c("useProgram(shadow)"),n.uniformMatrix4fv(a(t,"uLightVP"),!1,i),c("uLightVP");for(let l of s)n.uniformMatrix4fv(a(t,"uModel"),!1,l.model),c("shadow uModel"),n.bindVertexArray(l.mesh.vao),c("shadow bindVAO"),n.drawElements(n.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0),c("shadow drawElements");n.bindVertexArray(null),n.cullFace(n.BACK)},depthPrepass(i,s){n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.colorMask(!1,!1,!1,!1),n.useProgram(o),n.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let u of s)n.uniformMatrix4fv(a(o,"uModel"),!1,u.model),n.bindVertexArray(u.mesh.vao),n.drawElements(n.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0);n.bindVertexArray(null),n.colorMask(!0,!0,!0,!0)},draw(i){let s=i.onStep??(()=>{});if(n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.useProgram(e),n.uniformMatrix4fv(a(e,"uViewProj"),!1,i.viewProj),s("uViewProj"),n.uniform3fv(a(e,"uEye"),i.eye),s("uEye"),n.uniform3fv(a(e,"uLightDir"),i.lightDir),s("uLightDir"),n.uniform3fv(a(e,"uLightColour"),i.lightColour),s("uLightColour"),n.uniform1f(a(e,"uAmbientGain"),i.ambientGain??1),s("uAmbientGain"),i.fog&&i.fog.density>0){n.uniform1f(a(e,"uFogDensity"),i.fog.density),n.uniform1f(a(e,"uFogHeight"),i.fog.height),n.uniform1f(a(e,"uFogFloor"),i.fog.floor??0);let u=i.fog.colour;u==="sky"?n.uniform3f(a(e,"uFogColour"),-1,-1,-1):n.uniform3f(a(e,"uFogColour"),u[0],u[1],u[2]),s("fog")}else n.uniform1f(a(e,"uFogDensity"),0);fe(n,e,i.sky),s("bindSky"),i.ao&&i.screenSize?(n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,i.ao),n.uniform1i(a(e,"uAO"),1),n.uniform2f(a(e,"uScreenSize"),i.screenSize[0],i.screenSize[1]),n.uniform1f(a(e,"uAOEnabled"),1)):n.uniform1f(a(e,"uAOEnabled"),0),s("bindAO"),n.uniformMatrix4fv(a(e,"uLightVP"),!1,i.lightVP),s("lit uLightVP"),i.shadow?(n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,i.shadow.depthTexture),n.uniform1i(a(e,"uShadowMap"),0),n.uniform1f(a(e,"uShadowTexel"),1/i.shadow.size),n.uniform1f(a(e,"uShadowStrength"),i.shadowStrength??1)):n.uniform1f(a(e,"uShadowStrength"),0);for(let u of i.draws)n.uniformMatrix4fv(a(e,"uModel"),!1,u.model),n.uniformMatrix3fv(a(e,"uNormalMat"),!1,u.normalMat),s("uNormalMat"),n.uniform3fv(a(e,"uBaseColour"),u.material.baseColour),s("uBaseColour"),n.uniform1f(a(e,"uRoughness"),u.material.roughness),n.uniform1f(a(e,"uMetalness"),u.material.metalness),n.uniform1f(a(e,"uAnisotropy"),u.material.anisotropy??0),n.bindVertexArray(u.mesh.vao),s("lit bindVAO"),n.drawElements(n.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0),s("lit drawElements");n.bindVertexArray(null),n.disable(n.CULL_FACE)},dispose(){n.deleteProgram(t),n.deleteProgram(e),n.deleteProgram(o)}}}var Z=`
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
}`,yt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,qt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${Z}

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
}`,Jt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${Z}

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
}`;function Ye(r,n,t){let{gl:e}=r,o=r.compile(yt,qt);if("kind"in o)return o;let a=r.compile(yt,Jt);if("kind"in a)return a;let i=Math.max(1,n>>1),s=Math.max(1,t>>1),u=()=>{let d=e.createFramebuffer(),b=e.createTexture();return!d||!b?null:{fb:d,tex:b}},f=u(),c=u();if(!f||!c)return P("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let l=()=>{for(let d of[f,c])e.bindTexture(e.TEXTURE_2D,d.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,i,s,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,d.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,d.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};l(),e.bindFramebuffer(e.FRAMEBUFFER,f.fb);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE)return P("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${m.toString(16)}).`);let h=(d,b,E,A,p,R,g)=>{e.activeTexture(e.TEXTURE0+g),e.bindTexture(e.TEXTURE_2D,b),e.uniform1i(e.getUniformLocation(d,"uDepth"),g),e.uniform2f(e.getUniformLocation(d,"uNearFar"),E,A),e.uniform1f(e.getUniformLocation(d,"uTanHalfFov"),Math.tan(p*Math.PI/360)),e.uniform1f(e.getUniformLocation(d,"uAspect"),R)};return{get texture(){return f.tex},get width(){return i},get height(){return s},compute(d){e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,f.fb),e.viewport(0,0,i,s),e.useProgram(o),h(o,d.depthTexture,d.near,d.far,d.fovDeg,d.aspect,0),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/i,1/s),e.uniform1f(e.getUniformLocation(o,"uRadius"),d.radius??.55),e.uniform1f(e.getUniformLocation(o,"uStrength"),d.strength??1.15),e.uniform1f(e.getUniformLocation(o,"uBias"),d.bias??.035),r.blit(o);for(let[b,E,A]of[[f,c,[1,0]],[c,f,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,E.fb),e.viewport(0,0,i,s),e.useProgram(a),h(a,d.depthTexture,d.near,d.far,d.fovDeg,d.aspect,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,b.tex),e.uniform1i(e.getUniformLocation(a,"uAO"),1),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/i,1/s),e.uniform2f(e.getUniformLocation(a,"uDir"),A[0],A[1]),r.blit(a);e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(d,b){let E=Math.max(1,d>>1),A=Math.max(1,b>>1);E===i&&A===s||(i=E,s=A,l())},dispose(){e.deleteProgram(o),e.deleteProgram(a);for(let d of[f,c])e.deleteFramebuffer(d.fb),e.deleteTexture(d.tex)}}}var Zt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,er=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uFocusDistance;
uniform float uAperture;
uniform float uMaxCoc;
out vec4 frag;
${Z}

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
}`;function Ke(r,n,t){let{gl:e}=r,o=r.compile(Zt,er);if("kind"in o)return o;let a=Math.max(1,Math.floor(n)),i=Math.max(1,Math.floor(t)),s=e.createFramebuffer(),u=e.createTexture();if(!s||!u)return P("FRAMEBUFFER_INCOMPLETE","The GPU refused a depth-of-field buffer.");let f=()=>{e.bindTexture(e.TEXTURE_2D,u);let l=r.hdr?e.RGBA16F:e.RGBA8,m=r.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE;e.texImage2D(e.TEXTURE_2D,0,l,a,i,0,e.RGBA,m,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,s),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,u,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};f(),e.bindFramebuffer(e.FRAMEBUFFER,s);let c=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),c!==e.FRAMEBUFFER_COMPLETE?P("FRAMEBUFFER_INCOMPLETE",`The DOF buffer is incomplete (0x${c.toString(16)}).`):{texture:u,apply(l){e.bindFramebuffer(e.FRAMEBUFFER,s),e.viewport(0,0,a,i),e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.useProgram(o),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,l.scene),e.uniform1i(e.getUniformLocation(o,"uScene"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,l.depthTexture),e.uniform1i(e.getUniformLocation(o,"uDepth"),1),e.uniform2f(e.getUniformLocation(o,"uNearFar"),l.near,l.far),e.uniform1f(e.getUniformLocation(o,"uTanHalfFov"),Math.tan(l.fovDeg*Math.PI/360)),e.uniform1f(e.getUniformLocation(o,"uAspect"),l.aspect),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/a,1/i),e.uniform1f(e.getUniformLocation(o,"uFocusDistance"),l.focusDistance),e.uniform1f(e.getUniformLocation(o,"uAperture"),l.aperture??12),e.uniform1f(e.getUniformLocation(o,"uMaxCoc"),l.maxCoc??.012),r.blit(o),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(l,m){let h=Math.max(1,Math.floor(l)),d=Math.max(1,Math.floor(m));h===a&&d===i||(a=h,i=d,f())},dispose(){e.deleteProgram(o),e.deleteFramebuffer(s),e.deleteTexture(u)}}}var tr=`
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
`;function Tt(r){let n=document.createElement("style");n.textContent=tr,document.head.appendChild(n);let t=document.createElement("section");t.id="lcx-fallback";let e=(o,a)=>{if(o===null)return`<td class="absent${a?" n":""}">absent</td>`;let i=String(o).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");return`<td class="${a?"n":""}">${i}</td>`};return t.innerHTML=`<h2>${r.title} \u2014 flat view</h2><p class="reads">${r.readsAs}</p>`+(r.notices??[]).map(o=>`<p class="notice">${o}</p>`).join("")+'<div id="lcx-refusal"></div>'+(r.html?`<div class="surface">${r.html}</div>`:"<table><thead><tr>"+r.columns.map(o=>`<th class="${o.numeric?"n":""}">${o.label}</th>`).join("")+"</tr></thead><tbody>"+r.rows.map(o=>"<tr>"+r.columns.map(a=>e(o[a.key]??null,!!a.numeric)).join("")+"</tr>").join("")+"</tbody></table>"),document.body.appendChild(t),{markRendered(){t.dataset.rendered="1"},showRefusal(o,a){let i=document.getElementById("lcx-refusal");i&&(i.innerHTML=`<p class="refusal"><strong>${o}</strong> \u2014 ${a} The measurements below are unaffected.</p>`),delete t.dataset.rendered;for(let s of Array.from(document.querySelectorAll("canvas")))s.style.display="none"}}}var re=new URLSearchParams(location.search),be=re.get("dof")!=="0",tt=re.get("ao")!=="0",U=Math.max(1,Math.min(3,Number(re.get("scale")??1))),Lt=Number(re.get("frames")??300),M=1200*U,S=720*U,H=document.getElementById("c");H.width=M;H.height=S;var rr=document.getElementById("log");function at(r){document.title="REFUSED";let n=document.getElementById("log");n&&(n.textContent=r);let[t,...e]=r.split(":");throw wt?.showRefusal(t?.trim()??"REFUSED",e.join(":").trim()||r),new Error(r)}var wt=null;function C(r,n){return"kind"in n&&at(`${r}: ${n.code} \u2014 ${n.reason} ${n.detail??""}`),n}var Dt=Tt({title:"E1 \xB7 The Theatre \u2014 3D programme state",readsAs:"The rendered view puts five of these on lit panels at graded depths and racks focus to the one being built, which states where to look in a way a list cannot. This table has no such emphasis and no depth \u2014 and it carries every environment, including the one the five panels cannot show.",notices:["Each verdict is read from that environment's own README first line at build time, not typed here."],columns:[{key:"id",label:"Env"},{key:"name",label:"Name"},{key:"verdict",label:"Verdict (from its README)"}],rows:Object.values(w).map(r=>({id:r.id,name:r.name,verdict:r.verdict}))});wt=Dt;re.get("refuse")==="1"&&at("FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. The three-dimensional view is not being drawn.");var me=Ae(H,{alpha:!1});Fe(me)||at(`stage: ${me.code} \u2014 ${me.reason}`);var N=me,T=N.gl,nr=`#version 300 es
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
${we}
${De}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,ar=C("present",N.compile(nr,or)),Qe=C("lit",$e(N)),Y=C("target",Xe(N,M,S)),rt=C("shadow",ze(N,1536)),ir=C("sky",je(N)),gt=C("ao",Ye(N,M,S)),Rt=C("dof",Ke(N,M,S)),X={target:[0,.62,.1],distance:8.4,azimuthDeg:1.5,elevationDeg:7.2,fovDeg:38},k=se(X),qe=X.fovDeg??38,nt=Math.max(.01,X.distance/100),Ft=Math.max(nt+1,X.distance*8),pe=.06,Pt=[{id:"P1",x:-3.55,z:-1.25,w:1.72,h:1.3,hex:"#16203A",roughness:.5},{id:"P2",x:-1.62,z:.75,w:1.3,h:1.62,hex:"#16203A",roughness:.46},{id:"P3",x:.18,z:2.35,w:1.44,h:1.36,hex:"#2C6BFF",roughness:.42},{id:"P4",x:1.62,z:1.15,w:1.2,h:1.54,hex:"#2C6BFF",roughness:.44},{id:"P5",x:3.62,z:-2.1,w:1.78,h:1.18,hex:"#16203A",roughness:.52}],sr=.72,Ut=Ne(30,24),Nt=Pt.map(r=>Ue(r.w,r.h,pe)),ur=C("deck mesh",de(N,Ut)),lr=Nt.map((r,n)=>C(`panel ${n} mesh`,de(N,r))),Bt=(r,n,t,e)=>{let o=oe(),a=Math.cos(e),i=Math.sin(e);return o[0]=a,o[2]=-i,o[8]=i,o[10]=a,o[12]=r,o[13]=n,o[14]=t,o},cr=r=>new Float32Array([r[0],r[1],r[2],r[4],r[5],r[6],r[8],r[9],r[10]]),O=Pt.map((r,n)=>{let t=Math.atan2(k[0]-r.x,k[2]-r.z)*sr,e=Math.cos(t),o=Math.sin(t),a=Bt(r.x,r.h/2,r.z,t),i=(u,f)=>[r.x+e*u+o*(pe/2),f,r.z-o*u+e*(pe/2)],s=i(0,r.h/2);return{...r,yaw:t,model:a,facePoint:i,mesh:lr[n],normalMat:cr(a),eyeDistance:Math.hypot(k[0]-s[0],k[1]-s[1],k[2]-s[2])}}),Ot=O.reduce((r,n)=>n.eyeDistance<r.eyeDistance?n:r),xe=Ot.eyeDistance,fr=new Float32Array([1,0,0,0,1,0,0,0,1]),Je=[{mesh:ur,model:Bt(0,0,0,0),normalMat:fr,material:{baseColour:J("#070B14"),roughness:.86,metalness:0}},...O.map(r=>({mesh:r.mesh,model:r.model,normalMat:r.normalMat,material:{baseColour:J(r.hex),roughness:r.roughness,metalness:.06}}))],I=[.62,-.55,-.58],Ct=[-4.8,0,-4.6],It=[6.2,1.9,3],dr=He(Ct,It),mr=Ve(Ct,It),At=Ge({direction:I,colour:[1,1,1],extent:7.6},dr,mr),hr=[Ut,...Nt].reduce((r,n)=>r+Be(n),0);function Ee(){let r=ue(X,M/S);Qe.shadowPass(At,Je,rt),Y.bind(),T.clear(T.DEPTH_BUFFER_BIT),ir.draw({eye:k,target:X.target,fovDeg:qe,aspect:M/S}),Qe.depthPrepass(r,Je),tt&&(gt.compute({depthTexture:Y.depthTexture,near:nt,far:Ft,fovDeg:qe,aspect:M/S,radius:.5,strength:1.3}),Y.bind()),Qe.draw({viewProj:r,eye:k,lightDir:I,lightColour:[3.5,3.45,3.3],ambientGain:1.05,lightVP:At,shadow:rt,shadowStrength:.92,draws:Je,ao:tt?gt.texture:null,screenSize:[M,S]});let n=Y.texture;be&&(Rt.apply({scene:Y.texture,depthTexture:Y.depthTexture,near:nt,far:Ft,fovDeg:qe,aspect:M/S,focusDistance:xe,aperture:.16,maxCoc:.014}),n=Rt.texture),T.bindFramebuffer(T.FRAMEBUFFER,null),T.viewport(0,0,M,S),T.disable(T.DEPTH_TEST),T.activeTexture(T.TEXTURE0),T.bindTexture(T.TEXTURE_2D,n),N.blit(ar,t=>T.uniform1i(T.getUniformLocation(t,"uScene"),0))}Ee();function br(r){Ee();let n=new Uint8Array(4);T.readPixels(0,0,1,1,T.RGBA,T.UNSIGNED_BYTE,n);let t=performance.now();for(let e=0;e<r;e++)Ee();return T.readPixels(0,0,1,1,T.RGBA,T.UNSIGNED_BYTE,n),(performance.now()-t)/r}var Ze=br(Math.max(1,Lt)),ye=ue(X,M/S),pr=r=>[r.facePoint(-r.w/2,0),r.facePoint(r.w/2,0),r.facePoint(r.w/2,r.h),r.facePoint(-r.w/2,r.h)].map(n=>V(ye,n,M,S)),K=O.map(pr),it=(r,n,t)=>{let e=0;for(let o=0;o<4;o++){let a=r[o],i=r[(o+1)%4],s=(i.sx-a.sx)*(t-a.sy)-(i.sy-a.sy)*(n-a.sx);if(Math.abs(s)<1e-9)continue;let u=s>0?1:-1;if(e===0)e=u;else if(u!==e)return!1}return!0},ee=(()=>{let r=Math.hypot(I[0],I[1],I[2]);return[-I[0]/r,-I[1]/r,-I[2]/r]})(),kt=(r,n,t,e)=>O.some((o,a)=>{if(a===e)return!1;let i=Math.cos(o.yaw),s=Math.sin(o.yaw),u=s*ee[0]+i*ee[2];if(Math.abs(u)<1e-6)return!1;let f=(s*(o.x-r)+i*(o.z-t))/u;if(f<=0)return!1;let c=r+ee[0]*f,l=n+ee[1]*f,m=t+ee[2]*f,h=(c-o.x)*i-(m-o.z)*s;return Math.abs(h)<=o.w/2&&l>=0&&l<=o.h}),Er=O.map((r,n)=>{let t=0,e=0,o=0,a=null;for(let c=1;c<=15;c++)for(let l=1;l<=23;l++){let m=(l/24-.5)*r.w,h=c/16*r.h,d=r.facePoint(m,h),b=V(ye,d,M,S);if(e++,kt(d[0],d[1],d[2],n)&&o++,b.behind||b.sx<0||b.sx>=M||b.sy<0||b.sy>=S||O.some((A,p)=>p!==n&&A.eyeDistance<r.eyeDistance&&it(K[p],b.sx,b.sy)))continue;t++;let E=Math.abs(m)/r.w+Math.abs(h-r.h/2)/r.h;(!a||E<a.rank)&&(a={sx:b.sx,sy:b.sy,rank:E})}let i=new Uint8Array(4);a&&T.readPixels(Math.round(a.sx),Math.round(S-a.sy),1,1,T.RGBA,T.UNSIGNED_BYTE,i);let s=Math.min(.014,Math.abs(1/xe-1/r.eyeDistance)*.16),u=K[n].map(c=>c.sx),f=K[n].map(c=>c.sy);return{id:r.id,hex:r.hex,eyeDistance:Number(r.eyeDistance.toFixed(2)),yawDeg:Number((r.yaw*180/Math.PI).toFixed(1)),cocPx:Number((s*(M/U)).toFixed(1)),visiblePct:Math.round(100*t/e),inShadowPct:Math.round(100*o/e),offFrame:K[n].some(c=>c.behind||c.sx<0||c.sx>M||c.sy<0||c.sy>S),screen:[Math.round(Math.min(...u)/U),Math.round(Math.min(...f)/U),Math.round(Math.max(...u)/U),Math.round(Math.max(...f)/U)],sample:a?{sx:Math.round(a.sx/U),sy:Math.round(a.sy/U),rgb:[i[0],i[1],i[2]]}:null}}),xr=(()=>{let r=new Uint8Array(4),n={lit:{r:0,g:0,b:0,n:0},shade:{r:0,g:0,b:0,n:0}};for(let e=-5;e<=5.001;e+=.25)for(let o=-3.5;o<=4.001;o+=.25){let a=V(ye,[e,0,o],M,S);if(a.behind||a.sx<0||a.sx>=M||a.sy<0||a.sy>=S||K.some(s=>it(s,a.sx,a.sy)))continue;T.readPixels(Math.round(a.sx),Math.round(S-a.sy),1,1,T.RGBA,T.UNSIGNED_BYTE,r);let i=kt(e,0,o,-1)?n.shade:n.lit;i.r+=r[0],i.g+=r[1],i.b+=r[2],i.n+=1}let t=e=>e.n===0?null:[Math.round(e.r/e.n),Math.round(e.g/e.n),Math.round(e.b/e.n)];return{litSamples:n.lit.n,litRgb:t(n.lit),shadowedSamples:n.shade.n,shadowedRgb:t(n.shade)}})(),yr={E0:"GGX + shadows + AO + DOF. 1.305 ms/frame at 1x on the M1, by trailing-readPixels",E1:"real DOM content projected onto lit GL surfaces \u2014 the panel you are reading",E2:"seven corridors, lift monotonic with distance; no landmasses yet",E5:"driven from the same input as the shipping flat engine; cell counts agree exactly",E6:"depth is time; fog is the reading limit on it, and both horizons are reported",E8:"on the sign-in route in both themes, with a CSS fallback and a pixel ratchet"},vt=["E1","E8","E0","E6","E5","E2"],Te=Object.keys(w).sort((r,n)=>(vt.indexOf(r)+1||99)-(vt.indexOf(n)+1||99)),st=["P3","P4","P2","P5","P1"],Gt=Te.slice(0,st.length),he=Te.slice(st.length),Tr=r=>{let n=r.split(/[.·—]/)[0].trim();if(n.length<=26)return n.toUpperCase();let t=n.slice(0,26),e=t.lastIndexOf(" ");return(e>8?t.slice(0,e):t).toUpperCase()},gr=Object.fromEntries(Gt.map((r,n)=>{let t=st[n],e=w[r];return[t,{tag:`${e.id} \xB7 ${e.name}`,state:Tr(e.verdict),note:yr[r]??e.verdict}]})),Mt=250,St=.11,te=.1,ge=document.createElement("div");ge.style.cssText="position:absolute;inset:0;pointer-events:none";var Re=document.createElement("div");Re.style.cssText="position:relative;overflow:hidden;width:1200px;height:720px";H.parentNode?.insertBefore(Re,H);Re.appendChild(H);Re.appendChild(ge);var Rr=[...O].map((r,n)=>({p:r,i:n})).sort((r,n)=>n.p.eyeDistance-r.p.eyeDistance),Fr=[0,.06,-.06,.12,-.12,.18,-.18,.24,-.24,.3,-.3,.36,-.36],Ar=[1,.92,.84,.76,.68,.6],Vt=r=>Math.min(.014,Math.abs(1/xe-1/r)*.16)*(M/U),_t=Math.max(...O.map(r=>Vt(r.eyeDistance))),vr=2.4,Mr=Rr.map(({p:r,i:n})=>{let t=gr[r.id],e=pe/2+.008,o=Math.cos(r.yaw),a=Math.sin(r.yaw),i=(x,F)=>[r.x+o*x+a*e,F,r.z-a*x+o*e],s=(x,F,v)=>({topLeft:i(v-x/2,te+F),topRight:i(v+x/2,te+F),bottomRight:i(v+x/2,te),bottomLeft:i(v-x/2,te)}),u=x=>x.filter(F=>O.some((v,L)=>L!==n&&v.eyeDistance<r.eyeDistance&&it(K[L],F.x*U,F.y*U))).length,f=null,c=null,l=4;e:for(let x of Ar){let F=Math.max(.2,(r.w-2*St)*x),v=Math.max(.2,(r.h-2*te)*x),L=Math.round(F*Mt),D=Math.round(v*Mt);for(let Q of Fr){if(Math.abs(Q)+F/2>r.w/2-St*.5)continue;let G=Oe(ye,s(F,v,Q),M/U,S/U,L,D);if(Ce(G)){c=G.refusal;continue}let q=u(G.screen);if(l=Math.min(l,q),q===0&&G.signedArea>0){f={proj:G,ew:L,eh:D,shift:Q,scale:x,occluded:q};break e}}}if(!f)return{id:r.id,shown:!1,refusal:c??"NO_UNOCCLUDED_PLACEMENT",backFacing:!1,occludedCorners:l,contentShift:null,contentScale:null,perspectiveX:null,elementPx:null,rectError:null};let{proj:m,ew:h,eh:d}=f,b=r.hex==="#2C6BFF",E=b?"rgba(255,255,255,0.78)":"#7fb2ff",A=b?"rgba(255,255,255,0.80)":"rgba(198,212,236,0.78)",p=Vt(r.eyeDistance),R=be?vr*(p/Math.max(1e-6,_t)):0,g=be?1-.42*(p/Math.max(1e-6,_t)):1,y=document.createElement("div");y.style.cssText=["position:absolute","left:0","top:0",`width:${h}px`,`height:${d}px`,"transform-origin:0 0",`transform:${m.transform}`,"display:flex","flex-direction:column","justify-content:flex-end","gap:7px","overflow:hidden",`filter:blur(${R.toFixed(2)}px)`,`opacity:${g.toFixed(3)}`,"-webkit-font-smoothing:antialiased"].join(";"),y.innerHTML=`<div style="font:600 11px/1 ui-monospace,monospace;letter-spacing:.14em;color:${E}">${t.tag}</div><div style="font:700 27px/1.02 system-ui,sans-serif;color:#fff;letter-spacing:-0.01em">${t.state}</div><div style="font:400 11.5px/1.45 system-ui,sans-serif;color:${A}">${t.note}</div>`,ge.appendChild(y);let _=null;{let x=H.getBoundingClientRect(),F=y.getBoundingClientRect(),v=m.screen.map(D=>D.x),L=m.screen.map(D=>D.y);_=Number(Math.max(Math.abs(F.left-x.left-Math.min(...v)),Math.abs(F.top-x.top-Math.min(...L)),Math.abs(F.right-x.left-Math.max(...v)),Math.abs(F.bottom-x.top-Math.max(...L))).toFixed(2))}return{id:r.id,shown:!0,refusal:null,backFacing:!1,occludedCorners:0,contentShift:Number(f.shift.toFixed(2)),contentScale:f.scale,perspectiveX:Number((m.matrix[6]*1e3).toFixed(3)),elementPx:[h,d],cocPx:Number(p.toFixed(1)),domBlurPx:Number(R.toFixed(2)),domOpacity:Number(g.toFixed(3)),rectError:_}}),Ht=(()=>{let r=T.getExtension("WEBGL_debug_renderer_info");return r?String(T.getParameter(r.UNMASKED_RENDERER_WEBGL)):"unknown"})(),et=/swiftshader|llvmpipe|software/i.test(Ht);{let r=document.createElement("div");r.style.cssText="position:absolute;left:16px;top:14px;display:flex;flex-direction:column;gap:5px;font:500 10.5px/1.4 ui-monospace,monospace;letter-spacing:.05em",r.innerHTML=`<div style="color:#8FB7FF;font-weight:600;letter-spacing:.15em">3D PROGRAMME \xB7 ${Te.length} ENVIRONMENTS</div><div style="color:rgba(196,212,240,0.8)">STATE DERIVED FROM EACH README AT BUILD TIME</div>`+(he.length?`<div style="color:#E0A94A">${he.length} NOT SHOWN \u2014 ONLY 5 PANELS: ${he.join(" ")}</div>`:""),ge.appendChild(r)}var ot=Pe();if(ot.length>0){let r="BRAND FIDELITY FAILED \u2014 "+ot.map(t=>`${t.key}: expected ${t.expected}, got ${t.actual}`).join("; ");document.title="REFUSED";let n=document.getElementById("log");throw n&&(n.textContent=r),new Error(r)}var Xt={brandFidelity:ot,dof:be,ao:tt,hdr:N.hdr,eye:k.map(r=>Number(r.toFixed(2))),focusPanel:Ot.id,focusDistance:Number(xe.toFixed(2)),panels:Er,projections:Mr,environments:Te,environmentsShown:Gt,environmentsOmitted:he,deck:xr,glError:T.getError(),triangles:hr,shadowMap:rt.size,resolution:`${M}x${S}`,dprScale:U,frames:Lt,msPerFrame:Number(Ze.toFixed(3)),fps:Math.round(1e3/Ze),renderer:Ht,rendererClass:et?"software":"hardware",headroom:et?null:Number((16.6-Ze).toFixed(3)),headroomRefusal:et?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null,hardwareMsPerFrame:null};globalThis.E1=Xt;rr.textContent=JSON.stringify(Xt,null,2);Ee();Dt.markRendered();document.title="READY";

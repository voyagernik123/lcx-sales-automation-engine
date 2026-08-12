var D={E0:{id:"E0",name:"THE SPIKE",verdict:"GATE MET"},E1:{id:"E1",name:"THE THEATRE",verdict:"THE HYBRID WORKS. \xA77(b) is now a real tension, not a gap."},E2:{id:"E2",name:"THE GLOBE",verdict:"CARRIES INFORMATION. \xA77(b) still unproven."},E5:{id:"E5",name:"THE SURFACE",verdict:"AGREES WITH THE SHIPPING ENGINE. \xA72's ribbons and drag are not built."},E6:{id:"E6",name:"THE VAULT",verdict:"READS. Six framing errors, every one caught by a count."},E8:{id:"E8",name:"THE FORGE",verdict:"the first shippable environment"}};var rt={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected."};function P(r,n){return n===void 0?{kind:"refused",code:r,reason:rt[r]}:{kind:"refused",code:r,reason:rt[r],detail:n}}function Re(r){return r.kind==="stage"}function Ae(r,n={}){let t=r.getContext("webgl2",{antialias:n.antialias??!1,alpha:n.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!t)return P("NO_WEBGL2");let e=t.getExtension("EXT_color_buffer_float"),o=r.width,a=r.height,i=e?t.RGBA16F:t.RGBA8,s=e?t.HALF_FLOAT:t.UNSIGNED_BYTE,u=(b,R)=>{let T=t.createTexture();t.bindTexture(t.TEXTURE_2D,T),t.texImage2D(t.TEXTURE_2D,0,i,b,R,0,t.RGBA,s,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);let y=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,y),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,T,0);let S=t.checkFramebufferStatus(t.FRAMEBUFFER);return S!==t.FRAMEBUFFER_COMPLETE?P("FRAMEBUFFER_INCOMPLETE",`status 0x${S.toString(16)} at ${b}\xD7${R}`):{texture:T,framebuffer:y,width:b,height:R}},d=n.bloomShift??2,c={w:o,h:a},l=u(o,a);if("kind"in l)return l;let m=u(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in m)return m;let h=u(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in h)return h;let f=t.createVertexArray();t.bindVertexArray(f);let p=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,p),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null);let E=[];return{kind:"stage",gl:t,cssWidth:r.clientWidth||o,cssHeight:r.clientHeight||a,hdr:!!e,get width(){return c.w},get height(){return c.h},get scene(){return l},get bloomA(){return m},get bloomB(){return h},setRegion(b,R){let T=Math.max(1,Math.round(b)),y=Math.max(1,Math.round(R));if(!(T===c.w&&y===c.h)){c={w:T,h:y};for(let S of[l,m,h])"kind"in S||(t.deleteFramebuffer(S.framebuffer),t.deleteTexture(S.texture));l=u(T,y),m=u(Math.max(1,T>>d),Math.max(1,y>>d)),h=u(Math.max(1,T>>d),Math.max(1,y>>d))}},compile(b,R){let T=(A,F)=>{let L=t.createShader(A);return t.shaderSource(L,F),t.compileShader(L),t.getShaderParameter(L,t.COMPILE_STATUS)?L:P("SHADER_COMPILE_FAILED",t.getShaderInfoLog(L)??"(no log)")},y=T(t.VERTEX_SHADER,b);if(typeof y=="object"&&"kind"in y)return y;let S=T(t.FRAGMENT_SHADER,R);if(typeof S=="object"&&"kind"in S)return S;let g=t.createProgram();return t.attachShader(g,y),t.attachShader(g,S),t.linkProgram(g),t.getProgramParameter(g,t.LINK_STATUS)?(E.push(g),g):P("PROGRAM_LINK_FAILED",t.getProgramInfoLog(g)??"(no log)")},bindTarget(b){t.bindFramebuffer(t.FRAMEBUFFER,b?b.framebuffer:null),t.viewport(0,0,b?b.width:c.w,b?b.height:c.h)},blit(b,R){t.useProgram(b),t.bindVertexArray(f),R?.(b),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null)},dispose(){for(let b of E)t.deleteProgram(b);for(let b of[l,m,h])"kind"in b||(t.deleteFramebuffer(b.framebuffer),t.deleteTexture(b.texture));t.deleteBuffer(p),t.deleteVertexArray(f)}}}var re=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function ne(r,n){let t=new Float32Array(16);for(let e=0;e<4;e++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=r[i*4+o]*n[e*4+i];t[e*4+o]=a}return t}var W=(r,n)=>[r[0]-n[0],r[1]-n[1],r[2]-n[2]],te=(r,n)=>r[0]*n[0]+r[1]*n[1]+r[2]*n[2],j=(r,n)=>[r[1]*n[2]-r[2]*n[1],r[2]*n[0]-r[0]*n[2],r[0]*n[1]-r[1]*n[0]];function O(r){let n=Math.hypot(r[0],r[1],r[2]);return n===0?r:[r[0]/n,r[1]/n,r[2]/n]}function ve(r,n,t,e){let o=1/Math.tan(r/2);return new Float32Array([o/n,0,0,0,0,o,0,0,0,0,(e+t)/(t-e),-1,0,0,2*e*t/(t-e),0])}function Fe(r,n,t,e,o,a){let i=n-r,s=e-t,u=a-o;return new Float32Array([2/i,0,0,0,0,2/s,0,0,0,0,-2/u,0,-(n+r)/i,-(e+t)/s,-(a+o)/u,1])}function oe(r,n,t){let e=O(W(r,n)),o=j(t,e);if(Math.hypot(o[0],o[1],o[2])<1e-8)return re();let a=O(o),i=j(e,a);return new Float32Array([a[0],i[0],e[0],0,a[1],i[1],e[1],0,a[2],i[2],e[2],0,-te(a,r),-te(i,r),-te(e,r),1])}function nt(r,n){let t=[0,1,2,3].map(o=>r[0+o]*n[0]+r[4+o]*n[1]+r[8+o]*n[2]+r[12+o]),e=t[3];return{x:t[0]/e,y:t[1]/e,z:t[2]/e,w:e}}function V(r,n,t,e){let o=nt(r,n);return{sx:(o.x*.5+.5)*t,sy:(1-(o.y*.5+.5))*e,behind:o.w<=0}}function ot(r){return r<=.04045?r/12.92:Math.pow((r+.055)/1.055,2.4)}var It=/^#?([0-9a-fA-F]{6})$/;function q(r){let n=It.exec(r.trim());if(!n)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(r)}`);let t=n[1];return[0,2,4].map(e=>ot(parseInt(t.slice(e,e+2),16)/255))}var Me={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},Gt=Object.freeze(Object.fromEntries(Object.keys(Me).map(r=>[r,q(Me[r])])));var at=.4;var we=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${at.toFixed(2)}); }`,Se=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function kt(r){let n=[1/0,1/0,1/0],t=[-1/0,-1/0,-1/0];for(let e=0;e<r.length;e+=3)for(let o=0;o<3;o++){let a=r[e+o];a<n[o]&&(n[o]=a),a>t[o]&&(t[o]=a)}return r.length===0?{min:[0,0,0],max:[0,0,0]}:{min:n,max:t}}function it(r,n,t,e){let o=new Float32Array(r.length);for(let i=0;i<e.length;i+=3){let s=e[i],u=e[i+1],d=e[i+2],c=s*3,l=u*3,m=d*3,h=s*2,f=u*2,p=d*2,E=r[l]-r[c],v=r[l+1]-r[c+1],b=r[l+2]-r[c+2],R=r[m]-r[c],T=r[m+1]-r[c+1],y=r[m+2]-r[c+2],S=t[f]-t[h],g=t[f+1]-t[h+1],A=t[p]-t[h],F=t[p+1]-t[h+1],L=S*F-A*g;if(Math.abs(L)<1e-12)continue;let _=1/L,K=(E*F-R*g)*_,k=(v*F-T*g)*_,Q=(b*F-y*g)*_;for(let z of[c,l,m])o[z]=o[z]+K,o[z+1]=o[z+1]+k,o[z+2]=o[z+2]+Q}let a=new Float32Array(r.length);for(let i=0;i<a.length;i+=3){let s=n[i],u=n[i+1],d=n[i+2],c=o[i],l=o[i+1],m=o[i+2],h=c*s+l*u+m*d;c-=s*h,l-=u*h,m-=d*h;let f=Math.hypot(c,l,m);f<1e-8&&(Math.abs(s)<.9?(c=0,l=-d,m=u):(c=-d,l=0,m=s),f=Math.hypot(c,l,m)||1),a[i]=c/f,a[i+1]=l/f,a[i+2]=m/f}return a}function st(r,n){let t=new Float32Array(r.length);for(let e=0;e<n.length;e+=3){let o=n[e]*3,a=n[e+1]*3,i=n[e+2]*3,s=r[a]-r[o],u=r[a+1]-r[o+1],d=r[a+2]-r[o+2],c=r[i]-r[o],l=r[i+1]-r[o+1],m=r[i+2]-r[o+2],h=u*m-d*l,f=d*c-s*m,p=s*l-u*c;for(let E of[o,a,i])t[E]=t[E]+h,t[E+1]=t[E+1]+f,t[E+2]=t[E+2]+p}for(let e=0;e<t.length;e+=3){let o=Math.hypot(t[e],t[e+1],t[e+2]);o>0&&(t[e]=t[e]/o,t[e+1]=t[e+1]/o,t[e+2]=t[e+2]/o)}return t}function ut(r,n,t,e,o){let{min:a,max:i}=kt(r),s=e??st(r,t);return{positions:r,normals:s,uvs:n,indices:t,min:a,max:i,tangents:o??it(r,s,n,t)}}function Le(r=1,n=1,t=1){let e=r/2,o=n/2,a=t/2,i=[[[-e,-o,a],[e,-o,a],[e,o,a],[-e,o,a]],[[e,-o,-a],[-e,-o,-a],[-e,o,-a],[e,o,-a]],[[e,-o,a],[e,-o,-a],[e,o,-a],[e,o,a]],[[-e,-o,-a],[-e,-o,a],[-e,o,a],[-e,o,-a]],[[-e,o,a],[e,o,a],[e,o,-a],[-e,o,-a]],[[-e,-o,-a],[e,-o,-a],[e,-o,a],[-e,-o,a]]],s=new Float32Array(72),u=new Float32Array(48),d=new Uint16Array(36),c=0,l=0,m=0,h=0;for(let f of i){for(let[p,E,v]of f)s[c++]=p,s[c++]=E,s[c++]=v;u[l++]=0,u[l++]=0,u[l++]=1,u[l++]=0,u[l++]=1,u[l++]=1,u[l++]=0,u[l++]=1,d[m++]=h,d[m++]=h+1,d[m++]=h+2,d[m++]=h,d[m++]=h+2,d[m++]=h+3,h+=4}return ut(s,u,d)}function _e(r=10,n=24){let t=Math.max(1,Math.floor(n)),e=(t+1)*(t+1),o=new Float32Array(e*3),a=new Float32Array(e*3),i=new Float32Array(e*2),s=new Uint16Array(t*t*6),u=0,d=0,c=0;for(let l=0;l<=t;l++)for(let m=0;m<=t;m++){let h=(m/t-.5)*r,f=(l/t-.5)*r;o[u]=h,o[u+1]=0,o[u+2]=f,a[u]=0,a[u+1]=1,a[u+2]=0,u+=3,i[d++]=m/t,i[d++]=l/t}for(let l=0;l<t;l++)for(let m=0;m<t;m++){let h=l*(t+1)+m,f=h+1,p=h+(t+1),E=p+1;s[c++]=h,s[c++]=p,s[c++]=f,s[c++]=f,s[c++]=p,s[c++]=E}return ut(o,i,s,a)}function De(r){return r.indices.length/3}function Vt(r){if(!Number.isFinite(r)||r===0)return"0";let n=r.toFixed(12).replace(/0+$/,"").replace(/\.$/,"");return n==="-0"?"0":n}function lt(r,n,t,e){let[o,a]=r,[i,s]=n,[u,d]=t,[c,l]=e,m=o-i+u-c,h=a-s+d-l;if(Math.abs(m)<1e-9&&Math.abs(h)<1e-9){let y=[i-o,c-o,o,s-a,l-a,a,0,0,1],S=y[0]*y[4]-y[1]*y[3];return Math.abs(S)<1e-9?null:y}let f=i-u,p=c-u,E=s-d,v=l-d,b=f*v-p*E;if(Math.abs(b)<1e-9)return null;let R=(m*v-p*h)/b,T=(f*h-m*E)/b;return[i-o+R*i,c-o+T*c,o,s-a+R*s,l-a+T*l,a,R,T,1]}function Pe(r,n,t,e,o,a){if(!(o>0)||!(a>0))return{refusal:"EMPTY_ELEMENT_BOX"};let s=[n.topLeft,n.topRight,n.bottomRight,n.bottomLeft].map(_=>V(r,_,t,e));if(s.some(_=>_.behind))return{refusal:"CORNER_BEHIND_CAMERA"};let u=s.map(_=>({x:_.sx,y:_.sy})),[d,c,l,m]=u,h=lt([d.x,d.y],[c.x,c.y],[l.x,l.y],[m.x,m.y]);if(!h)return{refusal:"DEGENERATE_ON_SCREEN"};let f=.5*(d.x*c.y-c.x*d.y+(c.x*l.y-l.x*c.y)+(l.x*m.y-m.x*l.y)+(m.x*d.y-d.x*m.y)),p=1/o,E=1/a,[v,b,R,T,y,S,g,A,F]=h;return{transform:`matrix3d(${[v*p,T*p,0,g*p,b*E,y*E,0,A*E,0,0,1,0,R,S,0,F].map(Vt).join(", ")})`,matrix:h,screen:u,signedArea:f}}function Ne(r){return"refusal"in r}var Ue=89,Oe=Math.PI/180;function ae(r){let n=Math.max(-Ue,Math.min(Ue,r.elevationDeg))*Oe,t=r.azimuthDeg*Oe,e=Math.max(1e-4,r.distance),o=Math.sin(n)*e,a=Math.cos(n)*e;return[r.target[0]+Math.sin(t)*a,r.target[1]+o,r.target[2]+Math.cos(t)*a]}function ie(r,n){let t=ae(r),e=r.near??Math.max(.01,r.distance/100),o=r.far??Math.max(e+1,r.distance*8),a=ve((r.fovDeg??38)*Oe,Math.max(.001,n),e,o),i=oe(t,r.target,[0,1,0]);return ne(a,i)}function Ce(r,n,t){let e=O(r.direction),o=r.extent??Math.max(.1,t*1.35),a=Math.max(1,t*2),i=[n[0]-e[0]*a,n[1]-e[1]*a,n[2]-e[2]*a],s=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],u=oe(i,n,s),d=Fe(-o,o,-o,o,.01,a+t*2+o);return ne(d,u)}function Be(r,n){let t=W([n[0],n[1],n[2]],[r[0],r[1],r[2]]);return Math.hypot(t[0],t[1],t[2])/2}function Ie(r,n){return[(r[0]+n[0])/2,(r[1]+n[1])/2,(r[2]+n[2])/2]}function Ge(r,n,t){let{gl:e}=r,o=Math.max(1,Math.floor(n)),a=Math.max(1,Math.floor(t)),i=e.createFramebuffer(),s=e.createTexture(),u=e.createTexture();if(!i||!s||!u)return P("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let d=r.hdr?e.RGBA16F:e.RGBA8,c=r.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,l=()=>{e.bindTexture(e.TEXTURE_2D,s),e.texImage2D(e.TEXTURE_2D,0,d,o,a,0,e.RGBA,c,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,u),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,o,a,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,s,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,u,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};l(),e.bindFramebuffer(e.FRAMEBUFFER,i);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE?P("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${m.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:s,depthTexture:u,get width(){return o},get height(){return a},bind(){e.bindFramebuffer(e.FRAMEBUFFER,i),e.viewport(0,0,o,a)},resize(h,f){let p=Math.max(1,Math.floor(h)),E=Math.max(1,Math.floor(f));p===o&&E===a||(o=p,a=E,l())},dispose(){e.deleteFramebuffer(i),e.deleteTexture(s),e.deleteTexture(u)}}}function ke(r,n=1024){let{gl:t}=r,e=Math.max(256,Math.min(2048,Math.floor(n))),o=t.createFramebuffer(),a=t.createTexture();if(!o||!a)return P("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");t.bindTexture(t.TEXTURE_2D,a),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,e,e,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,o),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,a,0);let i=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),i!==t.FRAMEBUFFER_COMPLETE?P("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:e,bind(){t.bindFramebuffer(t.FRAMEBUFFER,o),t.viewport(0,0,e,e)},dispose(){t.deleteFramebuffer(o),t.deleteTexture(a)}}}var ue=`
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
}`,se={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function le(r,n,t={}){let e=t.zenith??se.zenith,o=t.horizon??se.horizon,a=t.ground??se.ground;r.uniform3f(r.getUniformLocation(n,"uSkyZenith"),e[0],e[1],e[2]),r.uniform3f(r.getUniformLocation(n,"uSkyHorizon"),o[0],o[1],o[2]),r.uniform3f(r.getUniformLocation(n,"uSkyGround"),a[0],a[1],a[2])}var Ht=`#version 300 es
precision highp float;
out vec2 vNdc;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`,Xt=`#version 300 es
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
}`;function Ve(r){let{gl:n}=r,t=r.compile(Ht,Xt);return"kind"in t?t:{draw(e){let o=O(W(e.target,e.eye)),a=Math.abs(o[1])>.999?[0,0,1]:[0,1,0],i=O(j(o,a)),s=O(j(i,o));n.disable(n.DEPTH_TEST),n.depthMask(!1),n.disable(n.BLEND),n.useProgram(t),n.uniform3f(n.getUniformLocation(t,"uRight"),i[0],i[1],i[2]),n.uniform3f(n.getUniformLocation(t,"uUp"),s[0],s[1],s[2]),n.uniform3f(n.getUniformLocation(t,"uForward"),o[0],o[1],o[2]),n.uniform1f(n.getUniformLocation(t,"uTanHalfFov"),Math.tan(e.fovDeg*Math.PI/360)),n.uniform1f(n.getUniformLocation(t,"uAspect"),Math.max(.001,e.aspect)),le(n,t,e.sky),r.blit(t),n.depthMask(!0),n.enable(n.DEPTH_TEST)},dispose(){n.deleteProgram(t)}}}var ct=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,He=`#version 300 es
precision highp float;
void main(){}`,zt=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,dt=`#version 300 es
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
}`,ft=`#version 300 es
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
/*
 * EXPONENTIAL HEIGHT FOG \u2014 L2.9. Zero density is the default, so the five environments that shipped
 * before this existed render byte-identically. Additive, not a rewrite.
 */
uniform float uFogDensity;   // 0 disables the whole term
uniform float uFogHeight;    // e-folding height: fog thins upward over this many metres
uniform vec3 uFogColour;     // linear; -1 in .r means "take it from the sky"
uniform float uFogFloor;     // y at which density is uFogDensity

out vec4 frag;
${ue}

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

  vec3 lit = direct + ambient;

  /*
   * FOG LAST, AND BEFORE THE TONE MAP \u2014 which is the whole reason it lives in this shader rather
   * than in a post-process pass.
   *
   * A depth-based screen fade applied after tone mapping fades toward a DISPLAY colour, so the
   * horizon washes to a grey that no light in the scene could produce and the frame looks hazed
   * rather than deep. Mixing in linear radiance, before the curve, means distant surfaces converge
   * on the same value the sky already has there \u2014 which is what atmosphere actually does.
   *
   * The integral is analytic. Density falls off exponentially with height, so the optical depth along
   * a ray from the eye to the surface is the height-integrated density rather than the naive
   * distance * density that a flat-fog shader uses. The difference is visible the moment the camera
   * is not level: flat fog fogs the sky directly overhead exactly as much as the horizon.
   */
  if (uFogDensity > 0.0) {
    vec3 toEye = uEye - vWorld;
    float dist = length(toEye);
    float dyRaw = uEye.y - vWorld.y;
    float hEye = max(0.0, uEye.y - uFogFloor);
    float hFrag = max(0.0, vWorld.y - uFogFloor);
    float k = max(1e-4, uFogHeight);
    float depth;
    if (abs(dyRaw) < 1e-4) {
      // A horizontal ray: height is constant, so the integral is the flat one at that height.
      depth = uFogDensity * dist * exp(-hFrag / k);
    } else {
      /* integral of exp(-h/k) along the ray, in closed form. The dist/|dy| factor converts the
         vertical integration variable back to arc length, which is what makes a near-horizontal ray
         accumulate far more fog than a vertical one of the same length. */
      depth = uFogDensity * k * (dist / abs(dyRaw)) * abs(exp(-hFrag / k) - exp(-hEye / k));
    }
    vec3 fogCol = uFogColour.r < 0.0 ? skyColour(normalize(-toEye)) : uFogColour;
    lit = mix(lit, fogCol, 1.0 - exp(-depth));
  }

  // NO TONE MAP. The composite owns the only one in the pipeline.
  frag = vec4(lit, 1.0);
}`;function ce(r,n){let{gl:t}=r,e=t.createVertexArray(),o=t.createBuffer(),a=t.createBuffer(),i=t.createBuffer(),s=t.createBuffer();return!e||!o||!a||!i||!s?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(t.bindVertexArray(e),t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,n.positions,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,a),t.bufferData(t.ARRAY_BUFFER,n.normals,t.STATIC_DRAW),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,i),t.bufferData(t.ARRAY_BUFFER,n.tangents,t.STATIC_DRAW),t.enableVertexAttribArray(2),t.vertexAttribPointer(2,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,s),t.bufferData(t.ELEMENT_ARRAY_BUFFER,n.indices,t.STATIC_DRAW),t.bindVertexArray(null),{vao:e,indexCount:n.indices.length,indexType:n.indices instanceof Uint32Array?t.UNSIGNED_INT:t.UNSIGNED_SHORT,dispose(){t.deleteVertexArray(e),t.deleteBuffer(o),t.deleteBuffer(a),t.deleteBuffer(i),t.deleteBuffer(s)}})}function Xe(r){let{gl:n}=r,t=r.compile(ct,He);if("kind"in t)return t;let e=r.compile(dt,ft);if("kind"in e)return e;let o=r.compile(zt,He);if("kind"in o)return o;let a=(i,s)=>n.getUniformLocation(i,s);return{shadowPass(i,s,u,d){let c=d??(()=>{});u.bind(),c("shadow.bind"),n.clear(n.DEPTH_BUFFER_BIT),n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.FRONT),n.useProgram(t),c("useProgram(shadow)"),n.uniformMatrix4fv(a(t,"uLightVP"),!1,i),c("uLightVP");for(let l of s)n.uniformMatrix4fv(a(t,"uModel"),!1,l.model),c("shadow uModel"),n.bindVertexArray(l.mesh.vao),c("shadow bindVAO"),n.drawElements(n.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0),c("shadow drawElements");n.bindVertexArray(null),n.cullFace(n.BACK)},depthPrepass(i,s){n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.colorMask(!1,!1,!1,!1),n.useProgram(o),n.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let u of s)n.uniformMatrix4fv(a(o,"uModel"),!1,u.model),n.bindVertexArray(u.mesh.vao),n.drawElements(n.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0);n.bindVertexArray(null),n.colorMask(!0,!0,!0,!0)},draw(i){let s=i.onStep??(()=>{});if(n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.useProgram(e),n.uniformMatrix4fv(a(e,"uViewProj"),!1,i.viewProj),s("uViewProj"),n.uniform3fv(a(e,"uEye"),i.eye),s("uEye"),n.uniform3fv(a(e,"uLightDir"),i.lightDir),s("uLightDir"),n.uniform3fv(a(e,"uLightColour"),i.lightColour),s("uLightColour"),n.uniform1f(a(e,"uAmbientGain"),i.ambientGain??1),s("uAmbientGain"),i.fog&&i.fog.density>0){n.uniform1f(a(e,"uFogDensity"),i.fog.density),n.uniform1f(a(e,"uFogHeight"),i.fog.height),n.uniform1f(a(e,"uFogFloor"),i.fog.floor??0);let u=i.fog.colour;u==="sky"?n.uniform3f(a(e,"uFogColour"),-1,-1,-1):n.uniform3f(a(e,"uFogColour"),u[0],u[1],u[2]),s("fog")}else n.uniform1f(a(e,"uFogDensity"),0);le(n,e,i.sky),s("bindSky"),i.ao&&i.screenSize?(n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,i.ao),n.uniform1i(a(e,"uAO"),1),n.uniform2f(a(e,"uScreenSize"),i.screenSize[0],i.screenSize[1]),n.uniform1f(a(e,"uAOEnabled"),1)):n.uniform1f(a(e,"uAOEnabled"),0),s("bindAO"),n.uniformMatrix4fv(a(e,"uLightVP"),!1,i.lightVP),s("lit uLightVP"),i.shadow?(n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,i.shadow.depthTexture),n.uniform1i(a(e,"uShadowMap"),0),n.uniform1f(a(e,"uShadowTexel"),1/i.shadow.size),n.uniform1f(a(e,"uShadowStrength"),i.shadowStrength??1)):n.uniform1f(a(e,"uShadowStrength"),0);for(let u of i.draws)n.uniformMatrix4fv(a(e,"uModel"),!1,u.model),n.uniformMatrix3fv(a(e,"uNormalMat"),!1,u.normalMat),s("uNormalMat"),n.uniform3fv(a(e,"uBaseColour"),u.material.baseColour),s("uBaseColour"),n.uniform1f(a(e,"uRoughness"),u.material.roughness),n.uniform1f(a(e,"uMetalness"),u.material.metalness),n.uniform1f(a(e,"uAnisotropy"),u.material.anisotropy??0),n.bindVertexArray(u.mesh.vao),s("lit bindVAO"),n.drawElements(n.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0),s("lit drawElements");n.bindVertexArray(null),n.disable(n.CULL_FACE)},dispose(){n.deleteProgram(t),n.deleteProgram(e),n.deleteProgram(o)}}}var Z=`
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
}`,mt=`#version 300 es
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
${Z}

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
}`,Wt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${Z}

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
}`;function ze(r,n,t){let{gl:e}=r,o=r.compile(mt,jt);if("kind"in o)return o;let a=r.compile(mt,Wt);if("kind"in a)return a;let i=Math.max(1,n>>1),s=Math.max(1,t>>1),u=()=>{let f=e.createFramebuffer(),p=e.createTexture();return!f||!p?null:{fb:f,tex:p}},d=u(),c=u();if(!d||!c)return P("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let l=()=>{for(let f of[d,c])e.bindTexture(e.TEXTURE_2D,f.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,i,s,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,f.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,f.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};l(),e.bindFramebuffer(e.FRAMEBUFFER,d.fb);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE)return P("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${m.toString(16)}).`);let h=(f,p,E,v,b,R,T)=>{e.activeTexture(e.TEXTURE0+T),e.bindTexture(e.TEXTURE_2D,p),e.uniform1i(e.getUniformLocation(f,"uDepth"),T),e.uniform2f(e.getUniformLocation(f,"uNearFar"),E,v),e.uniform1f(e.getUniformLocation(f,"uTanHalfFov"),Math.tan(b*Math.PI/360)),e.uniform1f(e.getUniformLocation(f,"uAspect"),R)};return{get texture(){return d.tex},get width(){return i},get height(){return s},compute(f){e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,d.fb),e.viewport(0,0,i,s),e.useProgram(o),h(o,f.depthTexture,f.near,f.far,f.fovDeg,f.aspect,0),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/i,1/s),e.uniform1f(e.getUniformLocation(o,"uRadius"),f.radius??.55),e.uniform1f(e.getUniformLocation(o,"uStrength"),f.strength??1.15),e.uniform1f(e.getUniformLocation(o,"uBias"),f.bias??.035),r.blit(o);for(let[p,E,v]of[[d,c,[1,0]],[c,d,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,E.fb),e.viewport(0,0,i,s),e.useProgram(a),h(a,f.depthTexture,f.near,f.far,f.fovDeg,f.aspect,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,p.tex),e.uniform1i(e.getUniformLocation(a,"uAO"),1),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/i,1/s),e.uniform2f(e.getUniformLocation(a,"uDir"),v[0],v[1]),r.blit(a);e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(f,p){let E=Math.max(1,f>>1),v=Math.max(1,p>>1);E===i&&v===s||(i=E,s=v,l())},dispose(){e.deleteProgram(o),e.deleteProgram(a);for(let f of[d,c])e.deleteFramebuffer(f.fb),e.deleteTexture(f.tex)}}}var $t=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Yt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uFocusDistance;
uniform float uAperture;
uniform float uMaxCoc;
out vec4 frag;
${Z}

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
}`;function je(r,n,t){let{gl:e}=r,o=r.compile($t,Yt);if("kind"in o)return o;let a=Math.max(1,Math.floor(n)),i=Math.max(1,Math.floor(t)),s=e.createFramebuffer(),u=e.createTexture();if(!s||!u)return P("FRAMEBUFFER_INCOMPLETE","The GPU refused a depth-of-field buffer.");let d=()=>{e.bindTexture(e.TEXTURE_2D,u);let l=r.hdr?e.RGBA16F:e.RGBA8,m=r.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE;e.texImage2D(e.TEXTURE_2D,0,l,a,i,0,e.RGBA,m,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,s),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,u,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};d(),e.bindFramebuffer(e.FRAMEBUFFER,s);let c=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),c!==e.FRAMEBUFFER_COMPLETE?P("FRAMEBUFFER_INCOMPLETE",`The DOF buffer is incomplete (0x${c.toString(16)}).`):{texture:u,apply(l){e.bindFramebuffer(e.FRAMEBUFFER,s),e.viewport(0,0,a,i),e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.useProgram(o),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,l.scene),e.uniform1i(e.getUniformLocation(o,"uScene"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,l.depthTexture),e.uniform1i(e.getUniformLocation(o,"uDepth"),1),e.uniform2f(e.getUniformLocation(o,"uNearFar"),l.near,l.far),e.uniform1f(e.getUniformLocation(o,"uTanHalfFov"),Math.tan(l.fovDeg*Math.PI/360)),e.uniform1f(e.getUniformLocation(o,"uAspect"),l.aspect),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/a,1/i),e.uniform1f(e.getUniformLocation(o,"uFocusDistance"),l.focusDistance),e.uniform1f(e.getUniformLocation(o,"uAperture"),l.aperture??12),e.uniform1f(e.getUniformLocation(o,"uMaxCoc"),l.maxCoc??.012),r.blit(o),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(l,m){let h=Math.max(1,Math.floor(l)),f=Math.max(1,Math.floor(m));h===a&&f===i||(a=h,i=f,d())},dispose(){e.deleteProgram(o),e.deleteFramebuffer(s),e.deleteTexture(u)}}}var be=new URLSearchParams(location.search),me=be.get("dof")!=="0",qe=be.get("ao")!=="0",N=Math.max(1,Math.min(3,Number(be.get("scale")??1))),Rt=Number(be.get("frames")??300),M=1200*N,w=720*N,H=document.getElementById("c");H.width=M;H.height=w;var At=document.getElementById("log");function vt(r){throw document.title="REFUSED",At.textContent=r,new Error(r)}function B(r,n){return"kind"in n&&vt(`${r}: ${n.code} \u2014 ${n.reason} ${n.detail??""}`),n}var de=Ae(H,{alpha:!1});Re(de)||vt(`stage: ${de.code} \u2014 ${de.reason}`);var U=de,x=U.gl,Kt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Qt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${we}
${Se}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,qt=B("present",U.compile(Kt,Qt)),We=B("lit",Xe(U)),$=B("target",Ge(U,M,w)),Ze=B("shadow",ke(U,1536)),Zt=B("sky",Ve(U)),ht=B("ao",ze(U,M,w)),pt=B("dof",je(U,M,w)),X={target:[0,.62,.1],distance:8.4,azimuthDeg:1.5,elevationDeg:7.2,fovDeg:38},G=ae(X),$e=X.fovDeg??38,Je=Math.max(.01,X.distance/100),bt=Math.max(Je+1,X.distance*8),he=.06,Ft=[{id:"P1",x:-3.55,z:-1.25,w:1.72,h:1.3,hex:"#16203A",roughness:.5},{id:"P2",x:-1.62,z:.75,w:1.3,h:1.62,hex:"#16203A",roughness:.46},{id:"P3",x:.18,z:2.35,w:1.44,h:1.36,hex:"#2C6BFF",roughness:.42},{id:"P4",x:1.62,z:1.15,w:1.2,h:1.54,hex:"#2C6BFF",roughness:.44},{id:"P5",x:3.62,z:-2.1,w:1.78,h:1.18,hex:"#16203A",roughness:.52}],Jt=.72,Mt=_e(30,24),wt=Ft.map(r=>Le(r.w,r.h,he)),er=B("deck mesh",ce(U,Mt)),tr=wt.map((r,n)=>B(`panel ${n} mesh`,ce(U,r))),St=(r,n,t,e)=>{let o=re(),a=Math.cos(e),i=Math.sin(e);return o[0]=a,o[2]=-i,o[8]=i,o[10]=a,o[12]=r,o[13]=n,o[14]=t,o},rr=r=>new Float32Array([r[0],r[1],r[2],r[4],r[5],r[6],r[8],r[9],r[10]]),C=Ft.map((r,n)=>{let t=Math.atan2(G[0]-r.x,G[2]-r.z)*Jt,e=Math.cos(t),o=Math.sin(t),a=St(r.x,r.h/2,r.z,t),i=(u,d)=>[r.x+e*u+o*(he/2),d,r.z-o*u+e*(he/2)],s=i(0,r.h/2);return{...r,yaw:t,model:a,facePoint:i,mesh:tr[n],normalMat:rr(a),eyeDistance:Math.hypot(G[0]-s[0],G[1]-s[1],G[2]-s[2])}}),Lt=C.reduce((r,n)=>n.eyeDistance<r.eyeDistance?n:r),Ee=Lt.eyeDistance,nr=new Float32Array([1,0,0,0,1,0,0,0,1]),Ye=[{mesh:er,model:St(0,0,0,0),normalMat:nr,material:{baseColour:q("#070B14"),roughness:.86,metalness:0}},...C.map(r=>({mesh:r.mesh,model:r.model,normalMat:r.normalMat,material:{baseColour:q(r.hex),roughness:r.roughness,metalness:.06}}))],I=[.62,-.55,-.58],_t=[-4.8,0,-4.6],Dt=[6.2,1.9,3],or=Ie(_t,Dt),ar=Be(_t,Dt),Et=Ce({direction:I,colour:[1,1,1],extent:7.6},or,ar),ir=[Mt,...wt].reduce((r,n)=>r+De(n),0);function pe(){let r=ie(X,M/w);We.shadowPass(Et,Ye,Ze),$.bind(),x.clear(x.DEPTH_BUFFER_BIT),Zt.draw({eye:G,target:X.target,fovDeg:$e,aspect:M/w}),We.depthPrepass(r,Ye),qe&&(ht.compute({depthTexture:$.depthTexture,near:Je,far:bt,fovDeg:$e,aspect:M/w,radius:.5,strength:1.3}),$.bind()),We.draw({viewProj:r,eye:G,lightDir:I,lightColour:[3.5,3.45,3.3],ambientGain:1.05,lightVP:Et,shadow:Ze,shadowStrength:.92,draws:Ye,ao:qe?ht.texture:null,screenSize:[M,w]});let n=$.texture;me&&(pt.apply({scene:$.texture,depthTexture:$.depthTexture,near:Je,far:bt,fovDeg:$e,aspect:M/w,focusDistance:Ee,aperture:.16,maxCoc:.014}),n=pt.texture),x.bindFramebuffer(x.FRAMEBUFFER,null),x.viewport(0,0,M,w),x.disable(x.DEPTH_TEST),x.activeTexture(x.TEXTURE0),x.bindTexture(x.TEXTURE_2D,n),U.blit(qt,t=>x.uniform1i(x.getUniformLocation(t,"uScene"),0))}pe();function sr(r){pe();let n=new Uint8Array(4);x.readPixels(0,0,1,1,x.RGBA,x.UNSIGNED_BYTE,n);let t=performance.now();for(let e=0;e<r;e++)pe();return x.readPixels(0,0,1,1,x.RGBA,x.UNSIGNED_BYTE,n),(performance.now()-t)/r}var Ke=sr(Math.max(1,Rt)),ge=ie(X,M/w),ur=r=>[r.facePoint(-r.w/2,0),r.facePoint(r.w/2,0),r.facePoint(r.w/2,r.h),r.facePoint(-r.w/2,r.h)].map(n=>V(ge,n,M,w)),Y=C.map(ur),et=(r,n,t)=>{let e=0;for(let o=0;o<4;o++){let a=r[o],i=r[(o+1)%4],s=(i.sx-a.sx)*(t-a.sy)-(i.sy-a.sy)*(n-a.sx);if(Math.abs(s)<1e-9)continue;let u=s>0?1:-1;if(e===0)e=u;else if(u!==e)return!1}return!0},J=(()=>{let r=Math.hypot(I[0],I[1],I[2]);return[-I[0]/r,-I[1]/r,-I[2]/r]})(),Pt=(r,n,t,e)=>C.some((o,a)=>{if(a===e)return!1;let i=Math.cos(o.yaw),s=Math.sin(o.yaw),u=s*J[0]+i*J[2];if(Math.abs(u)<1e-6)return!1;let d=(s*(o.x-r)+i*(o.z-t))/u;if(d<=0)return!1;let c=r+J[0]*d,l=n+J[1]*d,m=t+J[2]*d,h=(c-o.x)*i-(m-o.z)*s;return Math.abs(h)<=o.w/2&&l>=0&&l<=o.h}),lr=C.map((r,n)=>{let t=0,e=0,o=0,a=null;for(let c=1;c<=15;c++)for(let l=1;l<=23;l++){let m=(l/24-.5)*r.w,h=c/16*r.h,f=r.facePoint(m,h),p=V(ge,f,M,w);if(e++,Pt(f[0],f[1],f[2],n)&&o++,p.behind||p.sx<0||p.sx>=M||p.sy<0||p.sy>=w||C.some((v,b)=>b!==n&&v.eyeDistance<r.eyeDistance&&et(Y[b],p.sx,p.sy)))continue;t++;let E=Math.abs(m)/r.w+Math.abs(h-r.h/2)/r.h;(!a||E<a.rank)&&(a={sx:p.sx,sy:p.sy,rank:E})}let i=new Uint8Array(4);a&&x.readPixels(Math.round(a.sx),Math.round(w-a.sy),1,1,x.RGBA,x.UNSIGNED_BYTE,i);let s=Math.min(.014,Math.abs(1/Ee-1/r.eyeDistance)*.16),u=Y[n].map(c=>c.sx),d=Y[n].map(c=>c.sy);return{id:r.id,hex:r.hex,eyeDistance:Number(r.eyeDistance.toFixed(2)),yawDeg:Number((r.yaw*180/Math.PI).toFixed(1)),cocPx:Number((s*(M/N)).toFixed(1)),visiblePct:Math.round(100*t/e),inShadowPct:Math.round(100*o/e),offFrame:Y[n].some(c=>c.behind||c.sx<0||c.sx>M||c.sy<0||c.sy>w),screen:[Math.round(Math.min(...u)/N),Math.round(Math.min(...d)/N),Math.round(Math.max(...u)/N),Math.round(Math.max(...d)/N)],sample:a?{sx:Math.round(a.sx/N),sy:Math.round(a.sy/N),rgb:[i[0],i[1],i[2]]}:null}}),cr=(()=>{let r=new Uint8Array(4),n={lit:{r:0,g:0,b:0,n:0},shade:{r:0,g:0,b:0,n:0}};for(let e=-5;e<=5.001;e+=.25)for(let o=-3.5;o<=4.001;o+=.25){let a=V(ge,[e,0,o],M,w);if(a.behind||a.sx<0||a.sx>=M||a.sy<0||a.sy>=w||Y.some(s=>et(s,a.sx,a.sy)))continue;x.readPixels(Math.round(a.sx),Math.round(w-a.sy),1,1,x.RGBA,x.UNSIGNED_BYTE,r);let i=Pt(e,0,o,-1)?n.shade:n.lit;i.r+=r[0],i.g+=r[1],i.b+=r[2],i.n+=1}let t=e=>e.n===0?null:[Math.round(e.r/e.n),Math.round(e.g/e.n),Math.round(e.b/e.n)];return{litSamples:n.lit.n,litRgb:t(n.lit),shadowedSamples:n.shade.n,shadowedRgb:t(n.shade)}})(),dr={E0:"GGX + shadows + AO + DOF. 1.305 ms/frame at 1x on the M1, by trailing-readPixels",E1:"real DOM content projected onto lit GL surfaces \u2014 the panel you are reading",E2:"seven corridors, lift monotonic with distance; no landmasses yet",E5:"driven from the same input as the shipping flat engine; cell counts agree exactly",E6:"depth is time; fog is the reading limit on it, and both horizons are reported",E8:"on the sign-in route in both themes, with a CSS fallback and a pixel ratchet"},gt=["E1","E8","E0","E6","E5","E2"],ye=Object.keys(D).sort((r,n)=>(gt.indexOf(r)+1||99)-(gt.indexOf(n)+1||99)),tt=["P3","P4","P2","P5","P1"],Nt=ye.slice(0,tt.length),fe=ye.slice(tt.length),fr=r=>{let n=r.split(/[.·—]/)[0].trim();if(n.length<=26)return n.toUpperCase();let t=n.slice(0,26),e=t.lastIndexOf(" ");return(e>8?t.slice(0,e):t).toUpperCase()},mr=Object.fromEntries(Nt.map((r,n)=>{let t=tt[n],e=D[r];return[t,{tag:`${e.id} \xB7 ${e.name}`,state:fr(e.verdict),note:dr[r]??e.verdict}]})),yt=250,xt=.11,ee=.1,xe=document.createElement("div");xe.style.cssText="position:absolute;inset:0;pointer-events:none";var Te=document.createElement("div");Te.style.cssText="position:relative;overflow:hidden;width:1200px;height:720px";H.parentNode?.insertBefore(Te,H);Te.appendChild(H);Te.appendChild(xe);var hr=[...C].map((r,n)=>({p:r,i:n})).sort((r,n)=>n.p.eyeDistance-r.p.eyeDistance),pr=[0,.06,-.06,.12,-.12,.18,-.18,.24,-.24,.3,-.3,.36,-.36],br=[1,.92,.84,.76,.68,.6],Ut=r=>Math.min(.014,Math.abs(1/Ee-1/r)*.16)*(M/N),Tt=Math.max(...C.map(r=>Ut(r.eyeDistance))),Er=2.4,gr=hr.map(({p:r,i:n})=>{let t=mr[r.id],e=he/2+.008,o=Math.cos(r.yaw),a=Math.sin(r.yaw),i=(g,A)=>[r.x+o*g+a*e,A,r.z-a*g+o*e],s=(g,A,F)=>({topLeft:i(F-g/2,ee+A),topRight:i(F+g/2,ee+A),bottomRight:i(F+g/2,ee),bottomLeft:i(F-g/2,ee)}),u=g=>g.filter(A=>C.some((F,L)=>L!==n&&F.eyeDistance<r.eyeDistance&&et(Y[L],A.x*N,A.y*N))).length,d=null,c=null,l=4;e:for(let g of br){let A=Math.max(.2,(r.w-2*xt)*g),F=Math.max(.2,(r.h-2*ee)*g),L=Math.round(A*yt),_=Math.round(F*yt);for(let K of pr){if(Math.abs(K)+A/2>r.w/2-xt*.5)continue;let k=Pe(ge,s(A,F,K),M/N,w/N,L,_);if(Ne(k)){c=k.refusal;continue}let Q=u(k.screen);if(l=Math.min(l,Q),Q===0&&k.signedArea>0){d={proj:k,ew:L,eh:_,shift:K,scale:g,occluded:Q};break e}}}if(!d)return{id:r.id,shown:!1,refusal:c??"NO_UNOCCLUDED_PLACEMENT",backFacing:!1,occludedCorners:l,contentShift:null,contentScale:null,perspectiveX:null,elementPx:null,rectError:null};let{proj:m,ew:h,eh:f}=d,p=r.hex==="#2C6BFF",E=p?"rgba(255,255,255,0.78)":"#7fb2ff",v=p?"rgba(255,255,255,0.80)":"rgba(198,212,236,0.78)",b=Ut(r.eyeDistance),R=me?Er*(b/Math.max(1e-6,Tt)):0,T=me?1-.42*(b/Math.max(1e-6,Tt)):1,y=document.createElement("div");y.style.cssText=["position:absolute","left:0","top:0",`width:${h}px`,`height:${f}px`,"transform-origin:0 0",`transform:${m.transform}`,"display:flex","flex-direction:column","justify-content:flex-end","gap:7px","overflow:hidden",`filter:blur(${R.toFixed(2)}px)`,`opacity:${T.toFixed(3)}`,"-webkit-font-smoothing:antialiased"].join(";"),y.innerHTML=`<div style="font:600 11px/1 ui-monospace,monospace;letter-spacing:.14em;color:${E}">${t.tag}</div><div style="font:700 27px/1.02 system-ui,sans-serif;color:#fff;letter-spacing:-0.01em">${t.state}</div><div style="font:400 11.5px/1.45 system-ui,sans-serif;color:${v}">${t.note}</div>`,xe.appendChild(y);let S=null;{let g=H.getBoundingClientRect(),A=y.getBoundingClientRect(),F=m.screen.map(_=>_.x),L=m.screen.map(_=>_.y);S=Number(Math.max(Math.abs(A.left-g.left-Math.min(...F)),Math.abs(A.top-g.top-Math.min(...L)),Math.abs(A.right-g.left-Math.max(...F)),Math.abs(A.bottom-g.top-Math.max(...L))).toFixed(2))}return{id:r.id,shown:!0,refusal:null,backFacing:!1,occludedCorners:0,contentShift:Number(d.shift.toFixed(2)),contentScale:d.scale,perspectiveX:Number((m.matrix[6]*1e3).toFixed(3)),elementPx:[h,f],cocPx:Number(b.toFixed(1)),domBlurPx:Number(R.toFixed(2)),domOpacity:Number(T.toFixed(3)),rectError:S}}),Ot=(()=>{let r=x.getExtension("WEBGL_debug_renderer_info");return r?String(x.getParameter(r.UNMASKED_RENDERER_WEBGL)):"unknown"})(),Qe=/swiftshader|llvmpipe|software/i.test(Ot);{let r=document.createElement("div");r.style.cssText="position:absolute;left:16px;top:14px;display:flex;flex-direction:column;gap:5px;font:500 10.5px/1.4 ui-monospace,monospace;letter-spacing:.05em",r.innerHTML=`<div style="color:#8FB7FF;font-weight:600;letter-spacing:.15em">3D PROGRAMME \xB7 ${ye.length} ENVIRONMENTS</div><div style="color:rgba(196,212,240,0.8)">STATE DERIVED FROM EACH README AT BUILD TIME</div>`+(fe.length?`<div style="color:#E0A94A">${fe.length} NOT SHOWN \u2014 ONLY 5 PANELS: ${fe.join(" ")}</div>`:""),xe.appendChild(r)}var Ct={dof:me,ao:qe,hdr:U.hdr,eye:G.map(r=>Number(r.toFixed(2))),focusPanel:Lt.id,focusDistance:Number(Ee.toFixed(2)),panels:lr,projections:gr,environments:ye,environmentsShown:Nt,environmentsOmitted:fe,deck:cr,glError:x.getError(),triangles:ir,shadowMap:Ze.size,resolution:`${M}x${w}`,dprScale:N,frames:Rt,msPerFrame:Number(Ke.toFixed(3)),fps:Math.round(1e3/Ke),renderer:Ot,rendererClass:Qe?"software":"hardware",headroom:Qe?null:Number((16.6-Ke).toFixed(3)),headroomRefusal:Qe?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null,hardwareMsPerFrame:null};globalThis.E1=Ct;At.textContent=JSON.stringify(Ct,null,2);pe();document.title="READY";

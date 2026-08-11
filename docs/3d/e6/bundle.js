var rt={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable."};function L(r,n){return n===void 0?{kind:"refused",code:r,reason:rt[r]}:{kind:"refused",code:r,reason:rt[r],detail:n}}function Ae(r){return r.kind==="stage"}function ve(r,n={}){let t=r.getContext("webgl2",{antialias:n.antialias??!1,alpha:n.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!t)return L("NO_WEBGL2");let e=t.getExtension("EXT_color_buffer_float"),o=r.width,a=r.height,i=e?t.RGBA16F:t.RGBA8,s=e?t.HALF_FLOAT:t.UNSIGNED_BYTE,u=(b,T)=>{let E=t.createTexture();t.bindTexture(t.TEXTURE_2D,E),t.texImage2D(t.TEXTURE_2D,0,i,b,T,0,t.RGBA,s,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);let y=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,y),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,E,0);let v=t.checkFramebufferStatus(t.FRAMEBUFFER);return v!==t.FRAMEBUFFER_COMPLETE?L("FRAMEBUFFER_INCOMPLETE",`status 0x${v.toString(16)} at ${b}\xD7${T}`):{texture:E,framebuffer:y,width:b,height:T}},d=n.bloomShift??2,c={w:o,h:a},l=u(o,a);if("kind"in l)return l;let m=u(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in m)return m;let h=u(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in h)return h;let f=t.createVertexArray();t.bindVertexArray(f);let p=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,p),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null);let g=[];return{kind:"stage",gl:t,cssWidth:r.clientWidth||o,cssHeight:r.clientHeight||a,hdr:!!e,get width(){return c.w},get height(){return c.h},get scene(){return l},get bloomA(){return m},get bloomB(){return h},setRegion(b,T){let E=Math.max(1,Math.round(b)),y=Math.max(1,Math.round(T));if(!(E===c.w&&y===c.h)){c={w:E,h:y};for(let v of[l,m,h])"kind"in v||(t.deleteFramebuffer(v.framebuffer),t.deleteTexture(v.texture));l=u(E,y),m=u(Math.max(1,E>>d),Math.max(1,y>>d)),h=u(Math.max(1,E>>d),Math.max(1,y>>d))}},compile(b,T){let E=(Q,C)=>{let P=t.createShader(Q);return t.shaderSource(P,C),t.compileShader(P),t.getShaderParameter(P,t.COMPILE_STATUS)?P:L("SHADER_COMPILE_FAILED",t.getShaderInfoLog(P)??"(no log)")},y=E(t.VERTEX_SHADER,b);if(typeof y=="object"&&"kind"in y)return y;let v=E(t.FRAGMENT_SHADER,T);if(typeof v=="object"&&"kind"in v)return v;let R=t.createProgram();return t.attachShader(R,y),t.attachShader(R,v),t.linkProgram(R),t.getProgramParameter(R,t.LINK_STATUS)?(g.push(R),R):L("PROGRAM_LINK_FAILED",t.getProgramInfoLog(R)??"(no log)")},bindTarget(b){t.bindFramebuffer(t.FRAMEBUFFER,b?b.framebuffer:null),t.viewport(0,0,b?b.width:c.w,b?b.height:c.h)},blit(b,T){t.useProgram(b),t.bindVertexArray(f),T?.(b),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null)},dispose(){for(let b of g)t.deleteProgram(b);for(let b of[l,m,h])"kind"in b||(t.deleteFramebuffer(b.framebuffer),t.deleteTexture(b.texture));t.deleteBuffer(p),t.deleteVertexArray(f)}}}var ie=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function se(r,n){let t=new Float32Array(16);for(let e=0;e<4;e++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=r[i*4+o]*n[e*4+i];t[e*4+o]=a}return t}var z=(r,n)=>[r[0]-n[0],r[1]-n[1],r[2]-n[2]],ae=(r,n)=>r[0]*n[0]+r[1]*n[1]+r[2]*n[2],V=(r,n)=>[r[1]*n[2]-r[2]*n[1],r[2]*n[0]-r[0]*n[2],r[0]*n[1]-r[1]*n[0]];function U(r){let n=Math.hypot(r[0],r[1],r[2]);return n===0?r:[r[0]/n,r[1]/n,r[2]/n]}function Re(r,n,t,e){let o=1/Math.tan(r/2);return new Float32Array([o/n,0,0,0,0,o,0,0,0,0,(e+t)/(t-e),-1,0,0,2*e*t/(t-e),0])}function Fe(r,n,t,e,o,a){let i=n-r,s=e-t,u=a-o;return new Float32Array([2/i,0,0,0,0,2/s,0,0,0,0,-2/u,0,-(n+r)/i,-(e+t)/s,-(a+o)/u,1])}function ue(r,n,t){let e=U(z(r,n)),o=V(t,e);if(Math.hypot(o[0],o[1],o[2])<1e-8)return ie();let a=U(o),i=V(e,a);return new Float32Array([a[0],i[0],e[0],0,a[1],i[1],e[1],0,a[2],i[2],e[2],0,-ae(a,r),-ae(i,r),-ae(e,r),1])}function nt(r,n){let t=[0,1,2,3].map(o=>r[0+o]*n[0]+r[4+o]*n[1]+r[8+o]*n[2]+r[12+o]),e=t[3];return{x:t[0]/e,y:t[1]/e,z:t[2]/e,w:e}}function q(r,n,t,e){let o=nt(r,n);return{sx:(o.x*.5+.5)*t,sy:(1-(o.y*.5+.5))*e,behind:o.w<=0}}function ot(r){return r<=.04045?r/12.92:Math.pow((r+.055)/1.055,2.4)}var Xt=/^#?([0-9a-fA-F]{6})$/;function w(r){let n=Xt.exec(r.trim());if(!n)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(r)}`);let t=n[1];return[0,2,4].map(e=>ot(parseInt(t.slice(e,e+2),16)/255))}var Le={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},$t=Object.freeze(Object.fromEntries(Object.keys(Le).map(r=>[r,w(Le[r])])));var at=.4;var Me=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${at.toFixed(2)}); }`,we=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function Kt(r){let n=[1/0,1/0,1/0],t=[-1/0,-1/0,-1/0];for(let e=0;e<r.length;e+=3)for(let o=0;o<3;o++){let a=r[e+o];a<n[o]&&(n[o]=a),a>t[o]&&(t[o]=a)}return r.length===0?{min:[0,0,0],max:[0,0,0]}:{min:n,max:t}}function it(r,n,t,e){let o=new Float32Array(r.length);for(let i=0;i<e.length;i+=3){let s=e[i],u=e[i+1],d=e[i+2],c=s*3,l=u*3,m=d*3,h=s*2,f=u*2,p=d*2,g=r[l]-r[c],x=r[l+1]-r[c+1],b=r[l+2]-r[c+2],T=r[m]-r[c],E=r[m+1]-r[c+1],y=r[m+2]-r[c+2],v=t[f]-t[h],R=t[f+1]-t[h+1],Q=t[p]-t[h],C=t[p+1]-t[h+1],P=v*C-Q*R;if(Math.abs(P)<1e-12)continue;let D=1/P,zt=(g*C-T*R)*D,Wt=(x*C-E*R)*D,jt=(b*C-y*R)*D;for(let H of[c,l,m])o[H]=o[H]+zt,o[H+1]=o[H+1]+Wt,o[H+2]=o[H+2]+jt}let a=new Float32Array(r.length);for(let i=0;i<a.length;i+=3){let s=n[i],u=n[i+1],d=n[i+2],c=o[i],l=o[i+1],m=o[i+2],h=c*s+l*u+m*d;c-=s*h,l-=u*h,m-=d*h;let f=Math.hypot(c,l,m);f<1e-8&&(Math.abs(s)<.9?(c=0,l=-d,m=u):(c=-d,l=0,m=s),f=Math.hypot(c,l,m)||1),a[i]=c/f,a[i+1]=l/f,a[i+2]=m/f}return a}function st(r,n){let t=new Float32Array(r.length);for(let e=0;e<n.length;e+=3){let o=n[e]*3,a=n[e+1]*3,i=n[e+2]*3,s=r[a]-r[o],u=r[a+1]-r[o+1],d=r[a+2]-r[o+2],c=r[i]-r[o],l=r[i+1]-r[o+1],m=r[i+2]-r[o+2],h=u*m-d*l,f=d*c-s*m,p=s*l-u*c;for(let g of[o,a,i])t[g]=t[g]+h,t[g+1]=t[g+1]+f,t[g+2]=t[g+2]+p}for(let e=0;e<t.length;e+=3){let o=Math.hypot(t[e],t[e+1],t[e+2]);o>0&&(t[e]=t[e]/o,t[e+1]=t[e+1]/o,t[e+2]=t[e+2]/o)}return t}function ut(r,n,t,e,o){let{min:a,max:i}=Kt(r),s=e??st(r,t);return{positions:r,normals:s,uvs:n,indices:t,min:a,max:i,tangents:o??it(r,s,n,t)}}function W(r=1,n=1,t=1){let e=r/2,o=n/2,a=t/2,i=[[[-e,-o,a],[e,-o,a],[e,o,a],[-e,o,a]],[[e,-o,-a],[-e,-o,-a],[-e,o,-a],[e,o,-a]],[[e,-o,a],[e,-o,-a],[e,o,-a],[e,o,a]],[[-e,-o,-a],[-e,-o,a],[-e,o,a],[-e,o,-a]],[[-e,o,a],[e,o,a],[e,o,-a],[-e,o,-a]],[[-e,-o,-a],[e,-o,-a],[e,-o,a],[-e,-o,a]]],s=new Float32Array(72),u=new Float32Array(48),d=new Uint16Array(36),c=0,l=0,m=0,h=0;for(let f of i){for(let[p,g,x]of f)s[c++]=p,s[c++]=g,s[c++]=x;u[l++]=0,u[l++]=0,u[l++]=1,u[l++]=0,u[l++]=1,u[l++]=1,u[l++]=0,u[l++]=1,d[m++]=h,d[m++]=h+1,d[m++]=h+2,d[m++]=h,d[m++]=h+2,d[m++]=h+3,h+=4}return ut(s,u,d)}function Se(r=10,n=24){let t=Math.max(1,Math.floor(n)),e=(t+1)*(t+1),o=new Float32Array(e*3),a=new Float32Array(e*3),i=new Float32Array(e*2),s=new Uint16Array(t*t*6),u=0,d=0,c=0;for(let l=0;l<=t;l++)for(let m=0;m<=t;m++){let h=(m/t-.5)*r,f=(l/t-.5)*r;o[u]=h,o[u+1]=0,o[u+2]=f,a[u]=0,a[u+1]=1,a[u+2]=0,u+=3,i[d++]=m/t,i[d++]=l/t}for(let l=0;l<t;l++)for(let m=0;m<t;m++){let h=l*(t+1)+m,f=h+1,p=h+(t+1),g=p+1;s[c++]=h,s[c++]=p,s[c++]=f,s[c++]=f,s[c++]=p,s[c++]=g}return ut(o,i,s,a)}function I(r){return r.indices.length/3}function Yt(r){if(!Number.isFinite(r)||r===0)return"0";let n=r.toFixed(12).replace(/0+$/,"").replace(/\.$/,"");return n==="-0"?"0":n}function ct(r,n,t,e){let[o,a]=r,[i,s]=n,[u,d]=t,[c,l]=e,m=o-i+u-c,h=a-s+d-l;if(Math.abs(m)<1e-9&&Math.abs(h)<1e-9){let y=[i-o,c-o,o,s-a,l-a,a,0,0,1],v=y[0]*y[4]-y[1]*y[3];return Math.abs(v)<1e-9?null:y}let f=i-u,p=c-u,g=s-d,x=l-d,b=f*x-p*g;if(Math.abs(b)<1e-9)return null;let T=(m*x-p*h)/b,E=(f*h-m*g)/b;return[i-o+T*i,c-o+E*c,o,s-a+T*s,l-a+E*l,a,T,E,1]}function De(r,n,t,e,o,a){if(!(o>0)||!(a>0))return{refusal:"EMPTY_ELEMENT_BOX"};let s=[n.topLeft,n.topRight,n.bottomRight,n.bottomLeft].map(D=>q(r,D,t,e));if(s.some(D=>D.behind))return{refusal:"CORNER_BEHIND_CAMERA"};let u=s.map(D=>({x:D.sx,y:D.sy})),[d,c,l,m]=u,h=ct([d.x,d.y],[c.x,c.y],[l.x,l.y],[m.x,m.y]);if(!h)return{refusal:"DEGENERATE_ON_SCREEN"};let f=.5*(d.x*c.y-c.x*d.y+(c.x*l.y-l.x*c.y)+(l.x*m.y-m.x*l.y)+(m.x*d.y-d.x*m.y)),p=1/o,g=1/a,[x,b,T,E,y,v,R,Q,C]=h;return{transform:`matrix3d(${[x*p,E*p,0,R*p,b*g,y*g,0,Q*g,0,0,1,0,T,v,0,C].map(Yt).join(", ")})`,matrix:h,screen:u,signedArea:f}}function B(r){return"refusal"in r}function _e(r,n,t,e,o,a,i=0){let s=Math.cos(a),u=Math.sin(a),d=(l,m)=>[r+s*l+u*i,t+m,n-u*l+s*i],c=e/2;return{topLeft:d(-c,o),topRight:d(c,o),bottomRight:d(c,0),bottomLeft:d(-c,0)}}var Ne=89,Oe=Math.PI/180;function ce(r){let n=Math.max(-Ne,Math.min(Ne,r.elevationDeg))*Oe,t=r.azimuthDeg*Oe,e=Math.max(1e-4,r.distance),o=Math.sin(n)*e,a=Math.cos(n)*e;return[r.target[0]+Math.sin(t)*a,r.target[1]+o,r.target[2]+Math.cos(t)*a]}function le(r,n){let t=ce(r),e=r.near??Math.max(.01,r.distance/100),o=r.far??Math.max(e+1,r.distance*8),a=Re((r.fovDeg??38)*Oe,Math.max(.001,n),e,o),i=ue(t,r.target,[0,1,0]);return se(a,i)}function Pe(r,n,t){let e=U(r.direction),o=r.extent??Math.max(.1,t*1.35),a=Math.max(1,t*2),i=[n[0]-e[0]*a,n[1]-e[1]*a,n[2]-e[2]*a],s=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],u=ue(i,n,s),d=Fe(-o,o,-o,o,.01,a+t*2+o);return se(d,u)}function Ue(r,n){let t=z([n[0],n[1],n[2]],[r[0],r[1],r[2]]);return Math.hypot(t[0],t[1],t[2])/2}function Ce(r,n){return[(r[0]+n[0])/2,(r[1]+n[1])/2,(r[2]+n[2])/2]}function Be(r,n,t){let{gl:e}=r,o=Math.max(1,Math.floor(n)),a=Math.max(1,Math.floor(t)),i=e.createFramebuffer(),s=e.createTexture(),u=e.createTexture();if(!i||!s||!u)return L("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let d=r.hdr?e.RGBA16F:e.RGBA8,c=r.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,l=()=>{e.bindTexture(e.TEXTURE_2D,s),e.texImage2D(e.TEXTURE_2D,0,d,o,a,0,e.RGBA,c,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,u),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,o,a,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,s,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,u,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};l(),e.bindFramebuffer(e.FRAMEBUFFER,i);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE?L("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${m.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:s,depthTexture:u,get width(){return o},get height(){return a},bind(){e.bindFramebuffer(e.FRAMEBUFFER,i),e.viewport(0,0,o,a)},resize(h,f){let p=Math.max(1,Math.floor(h)),g=Math.max(1,Math.floor(f));p===o&&g===a||(o=p,a=g,l())},dispose(){e.deleteFramebuffer(i),e.deleteTexture(s),e.deleteTexture(u)}}}function Ie(r,n=1024){let{gl:t}=r,e=Math.max(256,Math.min(2048,Math.floor(n))),o=t.createFramebuffer(),a=t.createTexture();if(!o||!a)return L("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");t.bindTexture(t.TEXTURE_2D,a),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,e,e,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,o),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,a,0);let i=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),i!==t.FRAMEBUFFER_COMPLETE?L("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:e,bind(){t.bindFramebuffer(t.FRAMEBUFFER,o),t.viewport(0,0,e,e)},dispose(){t.deleteFramebuffer(o),t.deleteTexture(a)}}}var fe=`
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
}`,de={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function me(r,n,t={}){let e=t.zenith??de.zenith,o=t.horizon??de.horizon,a=t.ground??de.ground;r.uniform3f(r.getUniformLocation(n,"uSkyZenith"),e[0],e[1],e[2]),r.uniform3f(r.getUniformLocation(n,"uSkyHorizon"),o[0],o[1],o[2]),r.uniform3f(r.getUniformLocation(n,"uSkyGround"),a[0],a[1],a[2])}var Qt=`#version 300 es
precision highp float;
out vec2 vNdc;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`,qt=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${fe}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;function ke(r){let{gl:n}=r,t=r.compile(Qt,qt);return"kind"in t?t:{draw(e){let o=U(z(e.target,e.eye)),a=Math.abs(o[1])>.999?[0,0,1]:[0,1,0],i=U(V(o,a)),s=U(V(i,o));n.disable(n.DEPTH_TEST),n.depthMask(!1),n.disable(n.BLEND),n.useProgram(t),n.uniform3f(n.getUniformLocation(t,"uRight"),i[0],i[1],i[2]),n.uniform3f(n.getUniformLocation(t,"uUp"),s[0],s[1],s[2]),n.uniform3f(n.getUniformLocation(t,"uForward"),o[0],o[1],o[2]),n.uniform1f(n.getUniformLocation(t,"uTanHalfFov"),Math.tan(e.fovDeg*Math.PI/360)),n.uniform1f(n.getUniformLocation(t,"uAspect"),Math.max(.001,e.aspect)),me(n,t,e.sky),r.blit(t),n.depthMask(!0),n.enable(n.DEPTH_TEST)},dispose(){n.deleteProgram(t)}}}var lt=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,Ge=`#version 300 es
precision highp float;
void main(){}`,Zt=`#version 300 es
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
${fe}

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
}`;function k(r,n){let{gl:t}=r,e=t.createVertexArray(),o=t.createBuffer(),a=t.createBuffer(),i=t.createBuffer(),s=t.createBuffer();return!e||!o||!a||!i||!s?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(t.bindVertexArray(e),t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,n.positions,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,a),t.bufferData(t.ARRAY_BUFFER,n.normals,t.STATIC_DRAW),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,i),t.bufferData(t.ARRAY_BUFFER,n.tangents,t.STATIC_DRAW),t.enableVertexAttribArray(2),t.vertexAttribPointer(2,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,s),t.bufferData(t.ELEMENT_ARRAY_BUFFER,n.indices,t.STATIC_DRAW),t.bindVertexArray(null),{vao:e,indexCount:n.indices.length,indexType:n.indices instanceof Uint32Array?t.UNSIGNED_INT:t.UNSIGNED_SHORT,dispose(){t.deleteVertexArray(e),t.deleteBuffer(o),t.deleteBuffer(a),t.deleteBuffer(i),t.deleteBuffer(s)}})}function He(r){let{gl:n}=r,t=r.compile(lt,Ge);if("kind"in t)return t;let e=r.compile(dt,ft);if("kind"in e)return e;let o=r.compile(Zt,Ge);if("kind"in o)return o;let a=(i,s)=>n.getUniformLocation(i,s);return{shadowPass(i,s,u,d){let c=d??(()=>{});u.bind(),c("shadow.bind"),n.clear(n.DEPTH_BUFFER_BIT),n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.FRONT),n.useProgram(t),c("useProgram(shadow)"),n.uniformMatrix4fv(a(t,"uLightVP"),!1,i),c("uLightVP");for(let l of s)n.uniformMatrix4fv(a(t,"uModel"),!1,l.model),c("shadow uModel"),n.bindVertexArray(l.mesh.vao),c("shadow bindVAO"),n.drawElements(n.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0),c("shadow drawElements");n.bindVertexArray(null),n.cullFace(n.BACK)},depthPrepass(i,s){n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.colorMask(!1,!1,!1,!1),n.useProgram(o),n.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let u of s)n.uniformMatrix4fv(a(o,"uModel"),!1,u.model),n.bindVertexArray(u.mesh.vao),n.drawElements(n.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0);n.bindVertexArray(null),n.colorMask(!0,!0,!0,!0)},draw(i){let s=i.onStep??(()=>{});if(n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.useProgram(e),n.uniformMatrix4fv(a(e,"uViewProj"),!1,i.viewProj),s("uViewProj"),n.uniform3fv(a(e,"uEye"),i.eye),s("uEye"),n.uniform3fv(a(e,"uLightDir"),i.lightDir),s("uLightDir"),n.uniform3fv(a(e,"uLightColour"),i.lightColour),s("uLightColour"),n.uniform1f(a(e,"uAmbientGain"),i.ambientGain??1),s("uAmbientGain"),i.fog&&i.fog.density>0){n.uniform1f(a(e,"uFogDensity"),i.fog.density),n.uniform1f(a(e,"uFogHeight"),i.fog.height),n.uniform1f(a(e,"uFogFloor"),i.fog.floor??0);let u=i.fog.colour;u==="sky"?n.uniform3f(a(e,"uFogColour"),-1,-1,-1):n.uniform3f(a(e,"uFogColour"),u[0],u[1],u[2]),s("fog")}else n.uniform1f(a(e,"uFogDensity"),0);me(n,e,i.sky),s("bindSky"),i.ao&&i.screenSize?(n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,i.ao),n.uniform1i(a(e,"uAO"),1),n.uniform2f(a(e,"uScreenSize"),i.screenSize[0],i.screenSize[1]),n.uniform1f(a(e,"uAOEnabled"),1)):n.uniform1f(a(e,"uAOEnabled"),0),s("bindAO"),n.uniformMatrix4fv(a(e,"uLightVP"),!1,i.lightVP),s("lit uLightVP"),i.shadow?(n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,i.shadow.depthTexture),n.uniform1i(a(e,"uShadowMap"),0),n.uniform1f(a(e,"uShadowTexel"),1/i.shadow.size),n.uniform1f(a(e,"uShadowStrength"),i.shadowStrength??1)):n.uniform1f(a(e,"uShadowStrength"),0);for(let u of i.draws)n.uniformMatrix4fv(a(e,"uModel"),!1,u.model),n.uniformMatrix3fv(a(e,"uNormalMat"),!1,u.normalMat),s("uNormalMat"),n.uniform3fv(a(e,"uBaseColour"),u.material.baseColour),s("uBaseColour"),n.uniform1f(a(e,"uRoughness"),u.material.roughness),n.uniform1f(a(e,"uMetalness"),u.material.metalness),n.uniform1f(a(e,"uAnisotropy"),u.material.anisotropy??0),n.bindVertexArray(u.mesh.vao),s("lit bindVAO"),n.drawElements(n.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0),s("lit drawElements");n.bindVertexArray(null),n.disable(n.CULL_FACE)},dispose(){n.deleteProgram(t),n.deleteProgram(e),n.deleteProgram(o)}}}var Ve=`
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
}`,Jt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${Ve}

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
}`,er=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${Ve}

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
}`;function ze(r,n,t){let{gl:e}=r,o=r.compile(mt,Jt);if("kind"in o)return o;let a=r.compile(mt,er);if("kind"in a)return a;let i=Math.max(1,n>>1),s=Math.max(1,t>>1),u=()=>{let f=e.createFramebuffer(),p=e.createTexture();return!f||!p?null:{fb:f,tex:p}},d=u(),c=u();if(!d||!c)return L("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let l=()=>{for(let f of[d,c])e.bindTexture(e.TEXTURE_2D,f.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,i,s,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,f.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,f.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};l(),e.bindFramebuffer(e.FRAMEBUFFER,d.fb);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE)return L("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${m.toString(16)}).`);let h=(f,p,g,x,b,T,E)=>{e.activeTexture(e.TEXTURE0+E),e.bindTexture(e.TEXTURE_2D,p),e.uniform1i(e.getUniformLocation(f,"uDepth"),E),e.uniform2f(e.getUniformLocation(f,"uNearFar"),g,x),e.uniform1f(e.getUniformLocation(f,"uTanHalfFov"),Math.tan(b*Math.PI/360)),e.uniform1f(e.getUniformLocation(f,"uAspect"),T)};return{get texture(){return d.tex},get width(){return i},get height(){return s},compute(f){e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,d.fb),e.viewport(0,0,i,s),e.useProgram(o),h(o,f.depthTexture,f.near,f.far,f.fovDeg,f.aspect,0),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/i,1/s),e.uniform1f(e.getUniformLocation(o,"uRadius"),f.radius??.55),e.uniform1f(e.getUniformLocation(o,"uStrength"),f.strength??1.15),e.uniform1f(e.getUniformLocation(o,"uBias"),f.bias??.035),r.blit(o);for(let[p,g,x]of[[d,c,[1,0]],[c,d,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,g.fb),e.viewport(0,0,i,s),e.useProgram(a),h(a,f.depthTexture,f.near,f.far,f.fovDeg,f.aspect,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,p.tex),e.uniform1i(e.getUniformLocation(a,"uAO"),1),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/i,1/s),e.uniform2f(e.getUniformLocation(a,"uDir"),x[0],x[1]),r.blit(a);e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(f,p){let g=Math.max(1,f>>1),x=Math.max(1,p>>1);g===i&&x===s||(i=g,s=x,l())},dispose(){e.deleteProgram(o),e.deleteProgram(a);for(let f of[d,c])e.deleteFramebuffer(f.fb),e.deleteTexture(f.tex)}}}var xe=new URLSearchParams(location.search),$e=xe.get("ao")!=="0",qe=xe.get("fog")!=="0",ne=Math.max(1,Math.min(3,Number(xe.get("scale")??1))),Ke=Number(xe.get("frames")??300),_=1200*ne,N=720*ne,K=document.getElementById("c");K.width=_;K.height=N;var Lt=document.getElementById("log");function Mt(r){throw document.title="REFUSED",Lt.textContent=r,new Error(r)}function S(r,n){return"kind"in n&&Mt(`${r}: ${n.code} \u2014 ${n.reason} ${n.detail??""}`),n}var pe=ve(K,{alpha:!1});Ae(pe)||Mt(`stage: ${pe.code} \u2014 ${pe.reason}`);var F=pe,A=F.gl,tr=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,rr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${Me}
${we}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,nr=S("present",F.compile(tr,rr)),We=S("lit",He(F)),he=S("target",Be(F,_,N)),Ye=S("shadow",Ie(F,1536)),Tn=S("sky",ke(F)),ht=S("ao",ze(F,_,N)),or=[{hoursAgo:3,actor:"n.sharma",action:"campaign.publish",verdict:"ALLOWED"},{hoursAgo:9,actor:"n.sharma",action:"budget.raise",verdict:"ALLOWED"},{hoursAgo:14,actor:"svc.payagent",action:"x402.settle",verdict:"ALLOWED"},{hoursAgo:26,actor:"a.reiter",action:"listing.approve",verdict:"ALLOWED"},{hoursAgo:31,actor:"svc.operator",action:"memo.generate",verdict:"ALLOWED"},{hoursAgo:44,actor:"j.kohler",action:"compartment.read",verdict:"BLOCKED"},{hoursAgo:45,actor:"j.kohler",action:"compartment.read",verdict:"BLOCKED"},{hoursAgo:46,actor:"j.kohler",action:"export.bulk",verdict:"BLOCKED"},{hoursAgo:47,actor:"j.kohler",action:"export.bulk",verdict:"BLOCKED"},{hoursAgo:58,actor:"svc.payagent",action:"x402.settle",verdict:"ALLOWED"},{hoursAgo:70,actor:"\u2014",action:"\u2014",verdict:"WITHHELD"},{hoursAgo:83,actor:"a.reiter",action:"quest.close",verdict:"ALLOWED"},{hoursAgo:95,actor:"n.sharma",action:"rfi.extract",verdict:"ALLOWED"},{hoursAgo:110,actor:"\u2014",action:"\u2014",verdict:"WITHHELD"},{hoursAgo:128,actor:"svc.operator",action:"sat.gate",verdict:"BLOCKED"},{hoursAgo:141,actor:"a.reiter",action:"listing.approve",verdict:"ALLOWED"},{hoursAgo:163,actor:"n.sharma",action:"campaign.draft",verdict:"ALLOWED"},{hoursAgo:190,actor:"svc.payagent",action:"x402.settle",verdict:"ALLOWED"},{hoursAgo:214,actor:"\u2014",action:"\u2014",verdict:"WITHHELD"},{hoursAgo:246,actor:"a.reiter",action:"quest.close",verdict:"ALLOWED"},{hoursAgo:280,actor:"n.sharma",action:"budget.raise",verdict:"ALLOWED"},{hoursAgo:320,actor:"svc.operator",action:"memo.generate",verdict:"ALLOWED"},{hoursAgo:366,actor:"j.kohler",action:"compartment.read",verdict:"BLOCKED"},{hoursAgo:410,actor:"a.reiter",action:"listing.approve",verdict:"ALLOWED"},{hoursAgo:462,actor:"n.sharma",action:"campaign.publish",verdict:"ALLOWED"}],Ze=12,te=.62,J=.4,wt=.05,G=1.34,ar=0,ir=.78,St=13,re=qe?Math.log(20)/26:0,sr=3.4,Dt=r=>-(r/Ze)-sr,ur=J+.1,pt=4,oe=44,Z=-oe/2+3,_t=Se(6,oe),Nt=W(.22,3,oe),Ot=W(2*G+.44,.18,oe),Pt=W(2*G+.44,3,.2),Ut=W(te,J,wt),cr=S("floor",k(F,_t)),gt=S("wall",k(F,Nt)),lr=S("ceiling",k(F,Ot)),dr=S("end wall",k(F,Pt)),fr=S("record",k(F,Ut)),j=new Float32Array([1,0,0,0,1,0,0,0,1]),X=(r,n,t,e=0)=>{let o=ie(),a=Math.cos(e),i=Math.sin(e);return o[0]=a,o[2]=-i,o[8]=i,o[10]=a,o[12]=r,o[13]=n,o[14]=t,o},Ee={target:[0,.8,-9],distance:8.6,azimuthDeg:0,elevationDeg:3.5,fovDeg:33},O=ce(Ee),bt=.42,Et=G-.2,yt=[{z:1/0,tier:-1},{z:1/0,tier:-1}],M=or.map((r,n)=>{let t=n%2===0,e=t?0:1,o=t?-Et:Et,a=Dt(r.hoursAgo),s=Math.atan2(O[0]-o,O[2]-a)*bt+(t?1:-1)*(Math.PI/2)*(1-bt),u=yt[e],d=Math.abs(a-u.z)<te*1.05,c=d?(u.tier+1)%pt:0,l=d&&u.tier+1>=pt;yt[e]={z:a,tier:c};let m=ir+c*ur;return{...r,i:n,left:t,x:o,y:m,yaw:s,z:a,tier:c,tierOverflow:l,distance:0}});for(let r of M)r.distance=Math.hypot(r.x-O[0],r.y-O[1],r.z-O[2]);var mr={ALLOWED:{hex:"#2C6BFF",roughness:.36,metalness:.06},BLOCKED:{hex:"#C9552B",roughness:.42,metalness:.05},WITHHELD:{hex:"#5C6880",roughness:.3,metalness:.55}},je=[{mesh:cr,model:X(0,ar,Z),normalMat:j,material:{baseColour:w("#080C15"),roughness:.84,metalness:0}},{mesh:gt,model:X(-G,1.5,Z),normalMat:j,material:{baseColour:w("#141F35"),roughness:.62,metalness:.03}},{mesh:gt,model:X(G,1.5,Z),normalMat:j,material:{baseColour:w("#141F35"),roughness:.62,metalness:.03}},{mesh:lr,model:X(0,2.86,Z),normalMat:j,material:{baseColour:w("#0A101C"),roughness:.8,metalness:0}},{mesh:dr,model:X(0,1.5,Z-oe/2),normalMat:j,material:{baseColour:w("#0B1220"),roughness:.86,metalness:0}},...M.map(r=>{let n=mr[r.verdict];return{mesh:fr,model:X(r.x,r.y,r.z,r.yaw),normalMat:j,material:{baseColour:w(n.hex),roughness:n.roughness,metalness:n.metalness}}})],Ct=[.34,-.42,-.84],xt=[-2.2,0,-26],Tt=[2.2,3.4,3],At=Pe({direction:Ct,colour:[1,1,1],extent:11},Ce(xt,Tt),Ue(xt,Tt)),hr=I(_t)+2*I(Nt)+I(Ot)+I(Pt)+M.length*I(Ut),pr=.1,gr=60;function Bt(){let r=le(Ee,_/N);We.shadowPass(At,je,Ye),he.bind();let n=w("#0B1220");A.clearColor(n[0],n[1],n[2],1),A.clear(A.COLOR_BUFFER_BIT|A.DEPTH_BUFFER_BIT),We.depthPrepass(r,je),$e&&(ht.compute({depthTexture:he.depthTexture,near:pr,far:gr,fovDeg:Ee.fovDeg??46,aspect:_/N,radius:.42,strength:1.35}),he.bind()),We.draw({viewProj:r,eye:O,lightDir:Ct,lightColour:[3,2.95,2.85],ambientGain:.46,lightVP:At,shadow:Ye,shadowStrength:.94,draws:je,ao:$e?ht.texture:null,screenSize:[_,N],fog:re>0?{density:re,height:6,floor:0,colour:w("#0B1220")}:null}),A.bindFramebuffer(A.FRAMEBUFFER,null),A.viewport(0,0,_,N),A.disable(A.DEPTH_TEST),A.activeTexture(A.TEXTURE0),A.bindTexture(A.TEXTURE_2D,he.texture),F.blit(nr,t=>A.uniform1i(A.getUniformLocation(t,"uScene"),0))}var ge=0;{let r=performance.now();for(let n=0;n<Ke;n++)Bt();A.finish(),ge=(performance.now()-r)/Ke}var It=le(Ee,_/N),ee=_/ne,ye=N/ne,Te=document.createElement("div");Te.style.cssText=`position:relative;overflow:hidden;width:${ee}px;height:${ye}px`;K.parentNode?.insertBefore(Te,K);Te.appendChild(K);var Y=document.createElement("div");Y.style.cssText="position:absolute;inset:0;pointer-events:none";Te.appendChild(Y);var Je=r=>re<=0?0:1-Math.exp(-re*r),Qe=190,Xe=[],vt=(r,n,t)=>{let e=0;for(let o=0;o<4;o++){let a=r[o],i=r[(o+1)%4],s=(i.x-a.x)*(t-a.y)-(i.y-a.y)*(n-a.x);if(Math.abs(s)<1e-9)continue;let u=s>0?1:-1;if(e===0)e=u;else if(u!==e)return!1}return!0},kt=[...M].sort((r,n)=>r.distance-n.distance).map(r=>{let n=r.verdict==="WITHHELD",t=r.distance>St,e=Math.round(te*Qe),o=Math.round(J*Qe),a=_e(r.x,r.z,r.y-J/2,te,J,r.yaw,wt/2+.004),i=De(It,a,ee,ye,e,o),s=B(i)?i.refusal:null,u=!B(i)&&i.signedArea<=0,d=B(i)?0:Math.max(Math.hypot(i.screen[0].x-i.screen[1].x,i.screen[0].y-i.screen[1].y),Math.hypot(i.screen[3].x-i.screen[2].x,i.screen[3].y-i.screen[2].y)),c=d<26,l=B(i)?0:i.screen.filter(f=>Xe.some(p=>vt(p,f.x,f.y))).length+Xe.reduce((f,p)=>f+p.filter(g=>vt(i.screen.map(x=>({x:x.x,y:x.y})),g.x,g.y)).length,0),m=l>=2,h=!s&&!u&&!n&&!t&&!c&&!m;return h&&!B(i)&&Xe.push(i.screen.map(f=>({x:f.x,y:f.y}))),{p:r,proj:i,shown:h,ew:e,eh:o,refusal:s,backFacing:u,withheld:n,tooFar:t,edgeOn:c,occluded:m,widthPx:d,coveredCorners:l}});for(let r of[...kt].sort((n,t)=>t.p.distance-n.p.distance)){let{p:n,proj:t,shown:e,ew:o,eh:a}=r;if(e&&!B(t)){let i=Je(n.distance),s=document.createElement("div");s.style.cssText=`position:absolute;left:0;top:0;width:${o}px;height:${a}px;transform-origin:0 0;transform:${t.transform};display:flex;flex-direction:column;justify-content:center;gap:5px;padding:0 5px;overflow:hidden;opacity:${(1-.75*i).toFixed(3)};-webkit-font-smoothing:antialiased`;let u=n.hoursAgo,d=u<24?`${u}h ago`:`${(u/24).toFixed(u<72?1:0)}d ago`;s.innerHTML=`<div style="font:600 9px/1 ui-monospace,monospace;letter-spacing:.15em;color:rgba(255,255,255,0.66)">${n.verdict} \xB7 ${d}</div><div style="font:700 11px/1.05 ui-monospace,monospace;color:#fff">${n.action}</div><div style="font:400 10.5px/1.2 ui-monospace,monospace;color:rgba(255,255,255,0.74)">${n.actor}</div>`,Y.appendChild(s)}}var $=kt.map(({p:r,shown:n,refusal:t,backFacing:e,withheld:o,tooFar:a,edgeOn:i,occluded:s,widthPx:u,coveredCorners:d})=>({i:r.i,verdict:r.verdict,hoursAgo:r.hoursAgo,distance:Number(r.distance.toFixed(2)),fog:Number(Je(r.distance).toFixed(3)),widthPx:Math.round(u),coveredCorners:d,shown:n,hiddenBecause:n?null:o?"WITHHELD":t||(e?"BACK_FACING":i?"EDGE_ON":a?"BEYOND_LEGIBLE_RANGE":"OCCLUDED")})),Gt=Math.max(0,...$.filter(r=>r.shown).map(r=>r.hoursAgo)),Ht=Math.max(...M.map(r=>r.hoursAgo)),et=document.createElement("div");et.style.cssText="position:absolute;left:18px;top:16px;display:flex;flex-direction:column;gap:7px";et.innerHTML=`<div style="font:600 11px/1 ui-monospace,monospace;letter-spacing:.16em;color:#8FB7FF">GOVERNED ACTIONS \xB7 DEPTH IS TIME</div><div style="font:400 10.5px/1.5 ui-monospace,monospace;color:rgba(196,212,240,0.84)">READABLE TO ${(Gt/24).toFixed(1)} d &nbsp;\xB7&nbsp; VISIBLE TO ${(Ht/24).toFixed(1)} d<br>${Ze} h PER METRE &nbsp;\xB7&nbsp; ${qe?"FOG ON":"FOG OFF \u2014 reading limit NOT shown"}</div><div style="font:500 10px/1.4 ui-monospace,monospace;color:#E0A94A">SYNTHETIC RECORDS</div>`;Y.appendChild(et);var be={ALLOWED:M.filter(r=>r.verdict==="ALLOWED").length,BLOCKED:M.filter(r=>r.verdict==="BLOCKED").length,WITHHELD:M.filter(r=>r.verdict==="WITHHELD").length},tt=document.createElement("div");tt.style.cssText="position:absolute;right:18px;bottom:16px;display:flex;flex-direction:column;gap:6px;align-items:flex-end;font:500 10.5px/1 ui-monospace,monospace";tt.innerHTML=[["#2C6BFF",`ALLOWED \xB7 ${be.ALLOWED}`],["#C9552B",`BLOCKED \xB7 ${be.BLOCKED}`],["#5C6880",`WITHHELD \xB7 ${be.WITHHELD} (present, unreadable)`]].map(([r,n])=>`<div style="display:flex;align-items:center;gap:7px;color:rgba(196,212,240,0.85)"><span>${n}</span><span style="width:11px;height:11px;background:${r};display:inline-block"></span></div>`).join("");Y.appendChild(tt);var Rt=[1,3,7,14].map(r=>{let n=Dt(r*24),t=q(It,[-G+.3,.035,n],ee,ye),e=Je(Math.hypot(O[0]+G-.3,O[1]-.035,O[2]-n));if(!t.behind&&t.sx>0&&t.sx<ee&&t.sy>0&&t.sy<ye){let o=document.createElement("div");o.style.cssText=`position:absolute;left:${t.sx.toFixed(1)}px;top:${t.sy.toFixed(1)}px;transform:translate(-50%,-50%);font:500 10px/1 ui-monospace,monospace;letter-spacing:.08em;color:rgba(196,212,240,${(.85*(1-e)).toFixed(3)});white-space:nowrap`,o.textContent=`${r}d`,Y.appendChild(o)}return{days:r,sx:Math.round(t.sx),sy:Math.round(t.sy),fog:Number(e.toFixed(3)),onFrame:!t.behind&&t.sx>0&&t.sx<ee}}),Vt={ao:$e,fog:qe,fogDensity:Number(re.toFixed(4)),hoursPerMetre:Ze,legibleMetres:St,hdr:F.hdr,eye:O.map(r=>Number(r.toFixed(2))),readableToDays:Number((Gt/24).toFixed(2)),visibleToDays:Number((Ht/24).toFixed(2)),records:M.length,actionOverflow:M.filter(r=>r.action.length*6.6>te*Qe-10).map(r=>r.action),tiersUsed:Math.max(...M.map(r=>r.tier))+1,tierOverflows:M.filter(r=>r.tierOverflow).length,counts:be,shown:$.filter(r=>r.shown).length,hiddenBy:$.filter(r=>!r.shown).reduce((r,n)=>{let t=n.hiddenBecause??"UNKNOWN";return r[t]=(r[t]??0)+1,r},{}),fogNearest:Math.min(...$.map(r=>r.fog)),fogFurthest:Math.max(...$.map(r=>r.fog)),rulerTicks:Rt,rulerOffFrame:Rt.filter(r=>!r.onFrame).length,perRecord:$,glError:A.getError(),triangles:hr,shadowMap:Ye.size,resolution:`${_}x${N}`,dprScale:ne,frames:Ke,msPerFrame:Number(ge.toFixed(3)),fps:Math.round(1e3/ge),headroom:Number((16.6-ge).toFixed(3)),renderer:(()=>{let r=A.getExtension("WEBGL_debug_renderer_info");return r?String(A.getParameter(r.UNMASKED_RENDERER_WEBGL)):"unknown"})()};globalThis.E6=Vt;var{perRecord:Ft,rulerTicks:An,...br}=Vt;Lt.textContent=JSON.stringify(br,null,2)+`

perRecord (${Ft.length}, full detail on globalThis.E6):
`+Ft.map(r=>`  #${String(r.i).padStart(2)} ${r.verdict.padEnd(9)} ${String(r.hoursAgo).padStart(4)}h ${String(r.distance).padStart(6)}m fog ${r.fog.toFixed(3)} ${r.shown?"SHOWN":`hidden: ${r.hiddenBecause}`}`).join(`
`);Bt();document.title="READY";

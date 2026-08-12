var st={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected."};function v(t,n){return n===void 0?{kind:"refused",code:t,reason:st[t]}:{kind:"refused",code:t,reason:st[t],detail:n}}function xe(t){return t.kind==="stage"}function ge(t,n={}){let r=t.getContext("webgl2",{antialias:n.antialias??!1,alpha:n.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!r)return v("NO_WEBGL2");let e=r.getExtension("EXT_color_buffer_float"),o=t.width,a=t.height,i=e?r.RGBA16F:r.RGBA8,s=e?r.HALF_FLOAT:r.UNSIGNED_BYTE,l=(b,A)=>{let g=r.createTexture();r.bindTexture(r.TEXTURE_2D,g),r.texImage2D(r.TEXTURE_2D,0,i,b,A,0,r.RGBA,s,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE);let y=r.createFramebuffer();r.bindFramebuffer(r.FRAMEBUFFER,y),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,g,0);let R=r.checkFramebufferStatus(r.FRAMEBUFFER);return R!==r.FRAMEBUFFER_COMPLETE?v("FRAMEBUFFER_INCOMPLETE",`status 0x${R.toString(16)} at ${b}\xD7${A}`):{texture:g,framebuffer:y,width:b,height:A}},u=n.bloomShift??2,c={w:o,h:a},d=l(o,a);if("kind"in d)return d;let m=l(Math.max(1,o>>u),Math.max(1,a>>u));if("kind"in m)return m;let h=l(Math.max(1,o>>u),Math.max(1,a>>u));if("kind"in h)return h;let f=r.createVertexArray();r.bindVertexArray(f);let E=r.createBuffer();r.bindBuffer(r.ARRAY_BUFFER,E),r.bufferData(r.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),r.STATIC_DRAW),r.enableVertexAttribArray(0),r.vertexAttribPointer(0,2,r.FLOAT,!1,0,0),r.bindVertexArray(null);let p=[];return{kind:"stage",gl:r,cssWidth:t.clientWidth||o,cssHeight:t.clientHeight||a,hdr:!!e,get width(){return c.w},get height(){return c.h},get scene(){return d},get bloomA(){return m},get bloomB(){return h},setRegion(b,A){let g=Math.max(1,Math.round(b)),y=Math.max(1,Math.round(A));if(!(g===c.w&&y===c.h)){c={w:g,h:y};for(let R of[d,m,h])"kind"in R||(r.deleteFramebuffer(R.framebuffer),r.deleteTexture(R.texture));d=l(g,y),m=l(Math.max(1,g>>u),Math.max(1,y>>u)),h=l(Math.max(1,g>>u),Math.max(1,y>>u))}},compile(b,A){let g=($,U)=>{let N=r.createShader($);return r.shaderSource(N,U),r.compileShader(N),r.getShaderParameter(N,r.COMPILE_STATUS)?N:v("SHADER_COMPILE_FAILED",r.getShaderInfoLog(N)??"(no log)")},y=g(r.VERTEX_SHADER,b);if(typeof y=="object"&&"kind"in y)return y;let R=g(r.FRAGMENT_SHADER,A);if(typeof R=="object"&&"kind"in R)return R;let F=r.createProgram();return r.attachShader(F,y),r.attachShader(F,R),r.linkProgram(F),r.getProgramParameter(F,r.LINK_STATUS)?(p.push(F),F):v("PROGRAM_LINK_FAILED",r.getProgramInfoLog(F)??"(no log)")},bindTarget(b){r.bindFramebuffer(r.FRAMEBUFFER,b?b.framebuffer:null),r.viewport(0,0,b?b.width:c.w,b?b.height:c.h)},blit(b,A){r.useProgram(b),r.bindVertexArray(f),A?.(b),r.drawArrays(r.TRIANGLES,0,3),r.bindVertexArray(null)},dispose(){for(let b of p)r.deleteProgram(b);for(let b of[d,m,h])"kind"in b||(r.deleteFramebuffer(b.framebuffer),r.deleteTexture(b.texture));r.deleteBuffer(E),r.deleteVertexArray(f)}}}var se=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function le(t,n){let r=new Float32Array(16);for(let e=0;e<4;e++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=t[i*4+o]*n[e*4+i];r[e*4+o]=a}return r}var ce=(t,n)=>[t[0]-n[0],t[1]-n[1],t[2]-n[2]],ie=(t,n)=>t[0]*n[0]+t[1]*n[1]+t[2]*n[2],ye=(t,n)=>[t[1]*n[2]-t[2]*n[1],t[2]*n[0]-t[0]*n[2],t[0]*n[1]-t[1]*n[0]];function Y(t){let n=Math.hypot(t[0],t[1],t[2]);return n===0?t:[t[0]/n,t[1]/n,t[2]/n]}function Te(t,n,r,e){let o=1/Math.tan(t/2);return new Float32Array([o/n,0,0,0,0,o,0,0,0,0,(e+r)/(r-e),-1,0,0,2*e*r/(r-e),0])}function Ae(t,n,r,e,o,a){let i=n-t,s=e-r,l=a-o;return new Float32Array([2/i,0,0,0,0,2/s,0,0,0,0,-2/l,0,-(n+t)/i,-(e+r)/s,-(a+o)/l,1])}function ue(t,n,r){let e=Y(ce(t,n)),o=ye(r,e);if(Math.hypot(o[0],o[1],o[2])<1e-8)return se();let a=Y(o),i=ye(e,a);return new Float32Array([a[0],i[0],e[0],0,a[1],i[1],e[1],0,a[2],i[2],e[2],0,-ie(a,t),-ie(i,t),-ie(e,t),1])}function lt(t,n){let r=[0,1,2,3].map(o=>t[0+o]*n[0]+t[4+o]*n[1]+t[8+o]*n[2]+t[12+o]),e=r[3];return{x:r[0]/e,y:r[1]/e,z:r[2]/e,w:e}}function K(t,n,r,e){let o=lt(t,n);return{sx:(o.x*.5+.5)*r,sy:(1-(o.y*.5+.5))*e,behind:o.w<=0}}function ct(t){return t<=.04045?t/12.92:Math.pow((t+.055)/1.055,2.4)}function Re(t){return t<=.0031308?t*12.92:1.055*Math.pow(t,1/2.4)-.055}var er=/^#?([0-9a-fA-F]{6})$/;function S(t){let n=er.exec(t.trim());if(!n)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(t)}`);let r=n[1];return[0,2,4].map(e=>ct(parseInt(r.slice(e,e+2),16)/255))}function Fe(t){return`#${t.map(r=>{let e=Re(Math.min(1,Math.max(0,r)));return Math.round(e*255).toString(16).padStart(2,"0")}).join("")}`}var W={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},ve=Object.freeze(Object.fromEntries(Object.keys(W).map(t=>[t,S(W[t])])));var ut=.4;var Me=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${ut.toFixed(2)}); }`,Le=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function Se(){let t=[];for(let n of Object.keys(W)){let r=W[n].toLowerCase(),e=Fe(ve[n]).toLowerCase();e!==r&&t.push({key:n,expected:r,actual:e})}return t}function tr(t){let n=[1/0,1/0,1/0],r=[-1/0,-1/0,-1/0];for(let e=0;e<t.length;e+=3)for(let o=0;o<3;o++){let a=t[e+o];a<n[o]&&(n[o]=a),a>r[o]&&(r[o]=a)}return t.length===0?{min:[0,0,0],max:[0,0,0]}:{min:n,max:r}}function dt(t,n,r,e){let o=new Float32Array(t.length);for(let i=0;i<e.length;i+=3){let s=e[i],l=e[i+1],u=e[i+2],c=s*3,d=l*3,m=u*3,h=s*2,f=l*2,E=u*2,p=t[d]-t[c],T=t[d+1]-t[c+1],b=t[d+2]-t[c+2],A=t[m]-t[c],g=t[m+1]-t[c+1],y=t[m+2]-t[c+2],R=r[f]-r[h],F=r[f+1]-r[h+1],$=r[E]-r[h],U=r[E+1]-r[h+1],N=R*U-$*F;if(Math.abs(N)<1e-12)continue;let _=1/N,qt=(p*U-A*F)*_,Jt=(T*U-g*F)*_,Zt=(b*U-y*F)*_;for(let H of[c,d,m])o[H]=o[H]+qt,o[H+1]=o[H+1]+Jt,o[H+2]=o[H+2]+Zt}let a=new Float32Array(t.length);for(let i=0;i<a.length;i+=3){let s=n[i],l=n[i+1],u=n[i+2],c=o[i],d=o[i+1],m=o[i+2],h=c*s+d*l+m*u;c-=s*h,d-=l*h,m-=u*h;let f=Math.hypot(c,d,m);f<1e-8&&(Math.abs(s)<.9?(c=0,d=-u,m=l):(c=-u,d=0,m=s),f=Math.hypot(c,d,m)||1),a[i]=c/f,a[i+1]=d/f,a[i+2]=m/f}return a}function ft(t,n){let r=new Float32Array(t.length);for(let e=0;e<n.length;e+=3){let o=n[e]*3,a=n[e+1]*3,i=n[e+2]*3,s=t[a]-t[o],l=t[a+1]-t[o+1],u=t[a+2]-t[o+2],c=t[i]-t[o],d=t[i+1]-t[o+1],m=t[i+2]-t[o+2],h=l*m-u*d,f=u*c-s*m,E=s*d-l*c;for(let p of[o,a,i])r[p]=r[p]+h,r[p+1]=r[p+1]+f,r[p+2]=r[p+2]+E}for(let e=0;e<r.length;e+=3){let o=Math.hypot(r[e],r[e+1],r[e+2]);o>0&&(r[e]=r[e]/o,r[e+1]=r[e+1]/o,r[e+2]=r[e+2]/o)}return r}function rr(t,n,r,e,o){let{min:a,max:i}=tr(t),s=e??ft(t,r);return{positions:t,normals:s,uvs:n,indices:r,min:a,max:i,tangents:o??dt(t,s,n,r)}}function B(t=1,n=1,r=1){let e=t/2,o=n/2,a=r/2,i=[[[-e,-o,a],[e,-o,a],[e,o,a],[-e,o,a]],[[e,-o,-a],[-e,-o,-a],[-e,o,-a],[e,o,-a]],[[e,-o,a],[e,-o,-a],[e,o,-a],[e,o,a]],[[-e,-o,-a],[-e,-o,a],[-e,o,a],[-e,o,-a]],[[-e,o,a],[e,o,a],[e,o,-a],[-e,o,-a]],[[-e,-o,-a],[e,-o,-a],[e,-o,a],[-e,-o,a]]],s=new Float32Array(72),l=new Float32Array(48),u=new Uint16Array(36),c=0,d=0,m=0,h=0;for(let f of i){for(let[E,p,T]of f)s[c++]=E,s[c++]=p,s[c++]=T;l[d++]=0,l[d++]=0,l[d++]=1,l[d++]=0,l[d++]=1,l[d++]=1,l[d++]=0,l[d++]=1,u[m++]=h,u[m++]=h+1,u[m++]=h+2,u[m++]=h,u[m++]=h+2,u[m++]=h+3,h+=4}return rr(s,l,u)}function I(t){return t.indices.length/3}function nr(t){if(!Number.isFinite(t)||t===0)return"0";let n=t.toFixed(12).replace(/0+$/,"").replace(/\.$/,"");return n==="-0"?"0":n}function mt(t,n,r,e){let[o,a]=t,[i,s]=n,[l,u]=r,[c,d]=e,m=o-i+l-c,h=a-s+u-d;if(Math.abs(m)<1e-9&&Math.abs(h)<1e-9){let y=[i-o,c-o,o,s-a,d-a,a,0,0,1],R=y[0]*y[4]-y[1]*y[3];return Math.abs(R)<1e-9?null:y}let f=i-l,E=c-l,p=s-u,T=d-u,b=f*T-E*p;if(Math.abs(b)<1e-9)return null;let A=(m*T-E*h)/b,g=(f*h-m*p)/b;return[i-o+A*i,c-o+g*c,o,s-a+A*s,d-a+g*d,a,A,g,1]}function _e(t,n,r,e,o,a){if(!(o>0)||!(a>0))return{refusal:"EMPTY_ELEMENT_BOX"};let s=[n.topLeft,n.topRight,n.bottomRight,n.bottomLeft].map(_=>K(t,_,r,e));if(s.some(_=>_.behind))return{refusal:"CORNER_BEHIND_CAMERA"};let l=s.map(_=>({x:_.sx,y:_.sy})),[u,c,d,m]=l,h=mt([u.x,u.y],[c.x,c.y],[d.x,d.y],[m.x,m.y]);if(!h)return{refusal:"DEGENERATE_ON_SCREEN"};let f=.5*(u.x*c.y-c.x*u.y+(c.x*d.y-d.x*c.y)+(d.x*m.y-m.x*d.y)+(m.x*u.y-u.x*m.y)),E=1/o,p=1/a,[T,b,A,g,y,R,F,$,U]=h;return{transform:`matrix3d(${[T*E,g*E,0,F*E,b*p,y*p,0,$*p,0,0,1,0,A,R,0,U].map(nr).join(", ")})`,matrix:h,screen:l,signedArea:f}}function C(t){return"refusal"in t}function we(t,n,r,e,o,a,i=0){let s=Math.cos(a),l=Math.sin(a),u=(d,m)=>[t+s*d+l*i,r+m,n-l*d+s*i],c=e/2;return{topLeft:u(-c,o),topRight:u(c,o),bottomRight:u(c,0),bottomLeft:u(-c,0)}}var De=89,Pe=Math.PI/180;function de(t){let n=Math.max(-De,Math.min(De,t.elevationDeg))*Pe,r=t.azimuthDeg*Pe,e=Math.max(1e-4,t.distance),o=Math.sin(n)*e,a=Math.cos(n)*e;return[t.target[0]+Math.sin(r)*a,t.target[1]+o,t.target[2]+Math.cos(r)*a]}function Oe(t){let n=t.near??Math.max(.01,t.distance/100),r=t.far??Math.max(n+1,t.distance*8);return{near:n,far:r}}function fe(t,n){let r=de(t),e=t.near??Math.max(.01,t.distance/100),o=t.far??Math.max(e+1,t.distance*8),a=Te((t.fovDeg??38)*Pe,Math.max(.001,n),e,o),i=ue(r,t.target,[0,1,0]);return le(a,i)}function Ne(t,n,r){let e=Y(t.direction),o=t.extent??Math.max(.1,r*1.35),a=Math.max(1,r*2),i=[n[0]-e[0]*a,n[1]-e[1]*a,n[2]-e[2]*a],s=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],l=ue(i,n,s),u=Ae(-o,o,-o,o,.01,a+r*2+o);return le(u,l)}function Ue(t,n){let r=ce([n[0],n[1],n[2]],[t[0],t[1],t[2]]);return Math.hypot(r[0],r[1],r[2])/2}function Ce(t,n){return[(t[0]+n[0])/2,(t[1]+n[1])/2,(t[2]+n[2])/2]}function Be(t,n,r){let{gl:e}=t,o=Math.max(1,Math.floor(n)),a=Math.max(1,Math.floor(r)),i=e.createFramebuffer(),s=e.createTexture(),l=e.createTexture();if(!i||!s||!l)return v("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let u=t.hdr?e.RGBA16F:e.RGBA8,c=t.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,d=()=>{e.bindTexture(e.TEXTURE_2D,s),e.texImage2D(e.TEXTURE_2D,0,u,o,a,0,e.RGBA,c,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,l),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,o,a,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,s,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,l,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};d(),e.bindFramebuffer(e.FRAMEBUFFER,i);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE?v("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${m.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:s,depthTexture:l,get width(){return o},get height(){return a},bind(){e.bindFramebuffer(e.FRAMEBUFFER,i),e.viewport(0,0,o,a)},resize(h,f){let E=Math.max(1,Math.floor(h)),p=Math.max(1,Math.floor(f));E===o&&p===a||(o=E,a=p,d())},dispose(){e.deleteFramebuffer(i),e.deleteTexture(s),e.deleteTexture(l)}}}function Ie(t,n=1024){let{gl:r}=t,e=Math.max(256,Math.min(2048,Math.floor(n))),o=r.createFramebuffer(),a=r.createTexture();if(!o||!a)return v("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");r.bindTexture(r.TEXTURE_2D,a),r.texImage2D(r.TEXTURE_2D,0,r.DEPTH_COMPONENT24,e,e,0,r.DEPTH_COMPONENT,r.UNSIGNED_INT,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),r.bindFramebuffer(r.FRAMEBUFFER,o),r.framebufferTexture2D(r.FRAMEBUFFER,r.DEPTH_ATTACHMENT,r.TEXTURE_2D,a,0);let i=r.checkFramebufferStatus(r.FRAMEBUFFER);return r.bindFramebuffer(r.FRAMEBUFFER,null),i!==r.FRAMEBUFFER_COMPLETE?v("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:e,bind(){r.bindFramebuffer(r.FRAMEBUFFER,o),r.viewport(0,0,e,e)},dispose(){r.deleteFramebuffer(o),r.deleteTexture(a)}}}var Ge=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,ke={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function ht(t,n,r={}){let e=r.zenith??ke.zenith,o=r.horizon??ke.horizon,a=r.ground??ke.ground;t.uniform3f(t.getUniformLocation(n,"uSkyZenith"),e[0],e[1],e[2]),t.uniform3f(t.getUniformLocation(n,"uSkyHorizon"),o[0],o[1],o[2]),t.uniform3f(t.getUniformLocation(n,"uSkyGround"),a[0],a[1],a[2])}var kr=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${Ge}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;var pt=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,Ve=`#version 300 es
precision highp float;
void main(){}`,or=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,bt=`#version 300 es
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
}`,Et=`#version 300 es
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
${Ge}

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
}`;function k(t,n){let{gl:r}=t,e=r.createVertexArray(),o=r.createBuffer(),a=r.createBuffer(),i=r.createBuffer(),s=r.createBuffer();return!e||!o||!a||!i||!s?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(r.bindVertexArray(e),r.bindBuffer(r.ARRAY_BUFFER,o),r.bufferData(r.ARRAY_BUFFER,n.positions,r.STATIC_DRAW),r.enableVertexAttribArray(0),r.vertexAttribPointer(0,3,r.FLOAT,!1,0,0),r.bindBuffer(r.ARRAY_BUFFER,a),r.bufferData(r.ARRAY_BUFFER,n.normals,r.STATIC_DRAW),r.enableVertexAttribArray(1),r.vertexAttribPointer(1,3,r.FLOAT,!1,0,0),r.bindBuffer(r.ARRAY_BUFFER,i),r.bufferData(r.ARRAY_BUFFER,n.tangents,r.STATIC_DRAW),r.enableVertexAttribArray(2),r.vertexAttribPointer(2,3,r.FLOAT,!1,0,0),r.bindBuffer(r.ELEMENT_ARRAY_BUFFER,s),r.bufferData(r.ELEMENT_ARRAY_BUFFER,n.indices,r.STATIC_DRAW),r.bindVertexArray(null),{vao:e,indexCount:n.indices.length,indexType:n.indices instanceof Uint32Array?r.UNSIGNED_INT:r.UNSIGNED_SHORT,dispose(){r.deleteVertexArray(e),r.deleteBuffer(o),r.deleteBuffer(a),r.deleteBuffer(i),r.deleteBuffer(s)}})}function He(t){let{gl:n}=t,r=t.compile(pt,Ve);if("kind"in r)return r;let e=t.compile(bt,Et);if("kind"in e)return e;let o=t.compile(or,Ve);if("kind"in o)return o;let a=(i,s)=>n.getUniformLocation(i,s);return{shadowPass(i,s,l,u){let c=u??(()=>{});l.bind(),c("shadow.bind"),n.clear(n.DEPTH_BUFFER_BIT),n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.FRONT),n.useProgram(r),c("useProgram(shadow)"),n.uniformMatrix4fv(a(r,"uLightVP"),!1,i),c("uLightVP");for(let d of s)n.uniformMatrix4fv(a(r,"uModel"),!1,d.model),c("shadow uModel"),n.bindVertexArray(d.mesh.vao),c("shadow bindVAO"),n.drawElements(n.TRIANGLES,d.mesh.indexCount,d.mesh.indexType,0),c("shadow drawElements");n.bindVertexArray(null),n.cullFace(n.BACK)},depthPrepass(i,s){n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.colorMask(!1,!1,!1,!1),n.useProgram(o),n.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let l of s)n.uniformMatrix4fv(a(o,"uModel"),!1,l.model),n.bindVertexArray(l.mesh.vao),n.drawElements(n.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0);n.bindVertexArray(null),n.colorMask(!0,!0,!0,!0)},draw(i){let s=i.onStep??(()=>{});if(n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.useProgram(e),n.uniformMatrix4fv(a(e,"uViewProj"),!1,i.viewProj),s("uViewProj"),n.uniform3fv(a(e,"uEye"),i.eye),s("uEye"),n.uniform3fv(a(e,"uLightDir"),i.lightDir),s("uLightDir"),n.uniform3fv(a(e,"uLightColour"),i.lightColour),s("uLightColour"),n.uniform1f(a(e,"uAmbientGain"),i.ambientGain??1),s("uAmbientGain"),i.fog&&i.fog.density>0){n.uniform1f(a(e,"uFogDensity"),i.fog.density),n.uniform1f(a(e,"uFogHeight"),i.fog.height),n.uniform1f(a(e,"uFogFloor"),i.fog.floor??0);let l=i.fog.colour;l==="sky"?n.uniform3f(a(e,"uFogColour"),-1,-1,-1):n.uniform3f(a(e,"uFogColour"),l[0],l[1],l[2]),s("fog")}else n.uniform1f(a(e,"uFogDensity"),0);ht(n,e,i.sky),s("bindSky"),i.ao&&i.screenSize?(n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,i.ao),n.uniform1i(a(e,"uAO"),1),n.uniform2f(a(e,"uScreenSize"),i.screenSize[0],i.screenSize[1]),n.uniform1f(a(e,"uAOEnabled"),1)):n.uniform1f(a(e,"uAOEnabled"),0),s("bindAO"),n.uniformMatrix4fv(a(e,"uLightVP"),!1,i.lightVP),s("lit uLightVP"),i.shadow?(n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,i.shadow.depthTexture),n.uniform1i(a(e,"uShadowMap"),0),n.uniform1f(a(e,"uShadowTexel"),1/i.shadow.size),n.uniform1f(a(e,"uShadowStrength"),i.shadowStrength??1)):n.uniform1f(a(e,"uShadowStrength"),0);for(let l of i.draws)n.uniformMatrix4fv(a(e,"uModel"),!1,l.model),n.uniformMatrix3fv(a(e,"uNormalMat"),!1,l.normalMat),s("uNormalMat"),n.uniform3fv(a(e,"uBaseColour"),l.material.baseColour),s("uBaseColour"),n.uniform1f(a(e,"uRoughness"),l.material.roughness),n.uniform1f(a(e,"uMetalness"),l.material.metalness),n.uniform1f(a(e,"uAnisotropy"),l.material.anisotropy??0),n.bindVertexArray(l.mesh.vao),s("lit bindVAO"),n.drawElements(n.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0),s("lit drawElements");n.bindVertexArray(null),n.disable(n.CULL_FACE)},dispose(){n.deleteProgram(r),n.deleteProgram(e),n.deleteProgram(o)}}}var We=`
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
}`,ar=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${We}

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
}`,ir=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${We}

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
}`;function ze(t,n,r){let{gl:e}=t,o=t.compile(xt,ar);if("kind"in o)return o;let a=t.compile(xt,ir);if("kind"in a)return a;let i=Math.max(1,n>>1),s=Math.max(1,r>>1),l=()=>{let f=e.createFramebuffer(),E=e.createTexture();return!f||!E?null:{fb:f,tex:E}},u=l(),c=l();if(!u||!c)return v("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let d=()=>{for(let f of[u,c])e.bindTexture(e.TEXTURE_2D,f.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,i,s,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,f.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,f.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};d(),e.bindFramebuffer(e.FRAMEBUFFER,u.fb);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE)return v("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${m.toString(16)}).`);let h=(f,E,p,T,b,A,g)=>{e.activeTexture(e.TEXTURE0+g),e.bindTexture(e.TEXTURE_2D,E),e.uniform1i(e.getUniformLocation(f,"uDepth"),g),e.uniform2f(e.getUniformLocation(f,"uNearFar"),p,T),e.uniform1f(e.getUniformLocation(f,"uTanHalfFov"),Math.tan(b*Math.PI/360)),e.uniform1f(e.getUniformLocation(f,"uAspect"),A)};return{get texture(){return u.tex},get width(){return i},get height(){return s},compute(f){e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,u.fb),e.viewport(0,0,i,s),e.useProgram(o),h(o,f.depthTexture,f.near,f.far,f.fovDeg,f.aspect,0),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/i,1/s),e.uniform1f(e.getUniformLocation(o,"uRadius"),f.radius??.55),e.uniform1f(e.getUniformLocation(o,"uStrength"),f.strength??1.15),e.uniform1f(e.getUniformLocation(o,"uBias"),f.bias??.035),t.blit(o);for(let[E,p,T]of[[u,c,[1,0]],[c,u,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,p.fb),e.viewport(0,0,i,s),e.useProgram(a),h(a,f.depthTexture,f.near,f.far,f.fovDeg,f.aspect,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,E.tex),e.uniform1i(e.getUniformLocation(a,"uAO"),1),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/i,1/s),e.uniform2f(e.getUniformLocation(a,"uDir"),T[0],T[1]),t.blit(a);e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(f,E){let p=Math.max(1,f>>1),T=Math.max(1,E>>1);p===i&&T===s||(i=p,s=T,d())},dispose(){e.deleteProgram(o),e.deleteProgram(a);for(let f of[u,c])e.deleteFramebuffer(f.fb),e.deleteTexture(f.tex)}}}var sr=`
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
`;function gt(t){let n=document.createElement("style");n.textContent=sr,document.head.appendChild(n);let r=document.createElement("section");r.id="lcx-fallback";let e=(o,a)=>{if(o===null)return`<td class="absent${a?" n":""}">absent</td>`;let i=String(o).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");return`<td class="${a?"n":""}">${i}</td>`};return r.innerHTML=`<h2>${t.title} \u2014 flat view</h2><p class="reads">${t.readsAs}</p>`+(t.notices??[]).map(o=>`<p class="notice">${o}</p>`).join("")+'<div id="lcx-refusal"></div>'+(t.html?`<div class="surface">${t.html}</div>`:"<table><thead><tr>"+t.columns.map(o=>`<th class="${o.numeric?"n":""}">${o.label}</th>`).join("")+"</tr></thead><tbody>"+t.rows.map(o=>"<tr>"+t.columns.map(a=>e(o[a.key]??null,!!a.numeric)).join("")+"</tr>").join("")+"</tbody></table>"),document.body.appendChild(r),{markRendered(){r.dataset.rendered="1"},showRefusal(o,a){let i=document.getElementById("lcx-refusal");i&&(i.innerHTML=`<p class="refusal"><strong>${o}</strong> \u2014 ${a} The measurements below are unaffected.</p>`),delete r.dataset.rendered;for(let s of Array.from(document.querySelectorAll("canvas")))s.style.display="none"}}}var ne=new URLSearchParams(location.search),Qe=ne.get("ao")!=="0",tt=ne.get("fog")!=="0",oe=Math.max(1,Math.min(3,Number(ne.get("scale")??1))),Pt=Number(ne.get("frames")??300),w=1200*oe,D=720*oe,j=document.getElementById("c");j.width=w;j.height=D;var lr=document.getElementById("log");function rt(t){document.title="REFUSED";let n=document.getElementById("log");n&&(n.textContent=t);let[r,...e]=t.split(":");throw Ot?.showRefusal(r?.trim()??"REFUSED",e.join(":").trim()||t),new Error(t)}var Ot=null;function O(t,n){return"kind"in n&&rt(`${t}: ${n.code} \u2014 ${n.reason} ${n.detail??""}`),n}var Nt=[{hoursAgo:3,actor:"n.sharma",action:"campaign.publish",verdict:"ALLOWED"},{hoursAgo:9,actor:"n.sharma",action:"budget.raise",verdict:"ALLOWED"},{hoursAgo:14,actor:"svc.payagent",action:"x402.settle",verdict:"ALLOWED"},{hoursAgo:26,actor:"a.reiter",action:"listing.approve",verdict:"ALLOWED"},{hoursAgo:31,actor:"svc.operator",action:"memo.generate",verdict:"ALLOWED"},{hoursAgo:44,actor:"j.kohler",action:"compartment.read",verdict:"BLOCKED"},{hoursAgo:45,actor:"j.kohler",action:"compartment.read",verdict:"BLOCKED"},{hoursAgo:46,actor:"j.kohler",action:"export.bulk",verdict:"BLOCKED"},{hoursAgo:47,actor:"j.kohler",action:"export.bulk",verdict:"BLOCKED"},{hoursAgo:58,actor:"svc.payagent",action:"x402.settle",verdict:"ALLOWED"},{hoursAgo:70,actor:"\u2014",action:"\u2014",verdict:"WITHHELD"},{hoursAgo:83,actor:"a.reiter",action:"quest.close",verdict:"ALLOWED"},{hoursAgo:95,actor:"n.sharma",action:"rfi.extract",verdict:"ALLOWED"},{hoursAgo:110,actor:"\u2014",action:"\u2014",verdict:"WITHHELD"},{hoursAgo:128,actor:"svc.operator",action:"sat.gate",verdict:"BLOCKED"},{hoursAgo:141,actor:"a.reiter",action:"listing.approve",verdict:"ALLOWED"},{hoursAgo:163,actor:"n.sharma",action:"campaign.draft",verdict:"ALLOWED"},{hoursAgo:190,actor:"svc.payagent",action:"x402.settle",verdict:"ALLOWED"},{hoursAgo:214,actor:"\u2014",action:"\u2014",verdict:"WITHHELD"},{hoursAgo:246,actor:"a.reiter",action:"quest.close",verdict:"ALLOWED"},{hoursAgo:280,actor:"n.sharma",action:"budget.raise",verdict:"ALLOWED"},{hoursAgo:320,actor:"svc.operator",action:"memo.generate",verdict:"ALLOWED"},{hoursAgo:366,actor:"j.kohler",action:"compartment.read",verdict:"BLOCKED"},{hoursAgo:410,actor:"a.reiter",action:"listing.approve",verdict:"ALLOWED"},{hoursAgo:462,actor:"n.sharma",action:"campaign.publish",verdict:"ALLOWED"}],Ut=gt({title:"E6 \xB7 The Vault \u2014 governed actions",readsAs:"Depth is time in the rendered view: the corridor states how far back the record is readable at all, a cluster of blocked actions in one afternoon reads as a stack at one depth, and a withheld record is visibly present without being readable. This table carries every record and every verdict; what it cannot carry is the shape.",notices:["SYNTHETIC RECORDS \u2014 the shape is deliberate, the values are not measurements."],columns:[{key:"when",label:"When",numeric:!0},{key:"verdict",label:"Verdict"},{key:"action",label:"Action"},{key:"actor",label:"Actor"}],rows:Nt.map(t=>({when:t.hoursAgo<24?`${t.hoursAgo} h ago`:`${(t.hoursAgo/24).toFixed(1)} d ago`,verdict:t.verdict,action:t.verdict==="WITHHELD"?null:t.action,actor:t.verdict==="WITHHELD"?null:t.actor}))});Ot=Ut;ne.get("refuse")==="1"&&rt("FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. The three-dimensional view is not being drawn.");var he=ge(j,{alpha:!1});xe(he)||rt(`stage: ${he.code} \u2014 ${he.reason}`);var M=he,x=M.gl,cr=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,ur=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${Me}
${Le}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,dr=O("present",M.compile(cr,ur)),je=O("lit",He(M)),me=O("target",Be(M,w,D)),qe=O("shadow",Ie(M,1536)),yt=O("ao",ze(M,w,D)),nt=12,ee=.62,J=.4,Ct=.05,V=1.34,fr=0,mr=.78,Bt=13,te=tt?Math.log(20)/26:0,hr=3.4,It=t=>-(t/nt)-hr,pr=J+.1,Tt=4,ae=44,Q=-ae/2+3,kt=B(6,.12,ae),Gt=B(.22,3,ae),Vt=B(2*V+.44,.18,ae),Ht=B(2*V+.44,3,.2),Wt=B(ee,J,Ct),br=O("floor",k(M,kt)),At=O("wall",k(M,Gt)),Er=O("ceiling",k(M,Vt)),xr=O("end wall",k(M,Ht)),gr=O("record",k(M,Wt)),q=new Float32Array([1,0,0,0,1,0,0,0,1]),yr=t=>new Float32Array([t[0],t[1],t[2],t[4],t[5],t[6],t[8],t[9],t[10]]),G=(t,n,r,e=0)=>{let o=se(),a=Math.cos(e),i=Math.sin(e);return o[0]=a,o[2]=-i,o[8]=i,o[10]=a,o[12]=t,o[13]=n,o[14]=r,o},re={target:[0,.8,-9],distance:8.6,azimuthDeg:0,elevationDeg:3.5,fovDeg:33},P=de(re),Rt=.42,Ft=V-.2,vt=[{z:1/0,tier:-1},{z:1/0,tier:-1}],L=Nt.map((t,n)=>{let r=n%2===0,e=r?0:1,o=r?-Ft:Ft,a=It(t.hoursAgo),s=Math.atan2(P[0]-o,P[2]-a)*Rt+(r?1:-1)*(Math.PI/2)*(1-Rt),l=vt[e],u=Math.abs(a-l.z)<ee*1.05,c=u?(l.tier+1)%Tt:0,d=u&&l.tier+1>=Tt;vt[e]={z:a,tier:c};let m=mr+c*pr;return{...t,i:n,left:r,x:o,y:m,yaw:s,z:a,tier:c,tierOverflow:d,distance:0}});for(let t of L)t.distance=Math.hypot(t.x-P[0],t.y-P[1],t.z-P[2]);var Tr={ALLOWED:{hex:"#2C6BFF",roughness:.36,metalness:.06},BLOCKED:{hex:"#C9552B",roughness:.42,metalness:.05},WITHHELD:{hex:"#5C6880",roughness:.3,metalness:.55}},Xe=[{mesh:br,model:G(0,fr-.06,Q),normalMat:q,material:{baseColour:S("#080C15"),roughness:.84,metalness:0}},{mesh:At,model:G(-V,1.5,Q),normalMat:q,material:{baseColour:S("#141F35"),roughness:.62,metalness:.03}},{mesh:At,model:G(V,1.5,Q),normalMat:q,material:{baseColour:S("#141F35"),roughness:.62,metalness:.03}},{mesh:Er,model:G(0,2.86,Q),normalMat:q,material:{baseColour:S("#0A101C"),roughness:.8,metalness:0}},{mesh:xr,model:G(0,1.5,Q-ae/2),normalMat:q,material:{baseColour:S("#0B1220"),roughness:.86,metalness:0}},...L.map(t=>{let n=Tr[t.verdict];return{mesh:gr,model:G(t.x,t.y,t.z,t.yaw),normalMat:yr(G(t.x,t.y,t.z,t.yaw)),material:{baseColour:S(n.hex),roughness:n.roughness,metalness:n.metalness}}})],zt=[.34,-.42,-.84],Mt=[-2.2,0,-26],Lt=[2.2,3.4,3],St=Ne({direction:zt,colour:[1,1,1],extent:11},Ce(Mt,Lt),Ue(Mt,Lt)),Ar=I(kt)+2*I(Gt)+I(Vt)+I(Ht)+L.length*I(Wt),{near:Rr,far:Fr}=Oe(re);function Je(){let t=fe(re,w/D);je.shadowPass(St,Xe,qe),me.bind();let n=S("#0B1220");x.clearColor(n[0],n[1],n[2],1),x.clear(x.COLOR_BUFFER_BIT|x.DEPTH_BUFFER_BIT),je.depthPrepass(t,Xe),Qe&&(yt.compute({depthTexture:me.depthTexture,near:Rr,far:Fr,fovDeg:re.fovDeg??46,aspect:w/D,radius:.42,strength:1.35}),me.bind()),je.draw({viewProj:t,eye:P,lightDir:zt,lightColour:[3,2.95,2.85],ambientGain:.46,lightVP:St,shadow:qe,shadowStrength:.94,draws:Xe,ao:Qe?yt.texture:null,screenSize:[w,D],fog:te>0?{density:te,height:6,floor:0,colour:S("#0B1220")}:null}),x.bindFramebuffer(x.FRAMEBUFFER,null),x.viewport(0,0,w,D),x.disable(x.DEPTH_TEST),x.activeTexture(x.TEXTURE0),x.bindTexture(x.TEXTURE_2D,me.texture),M.blit(dr,r=>x.uniform1i(x.getUniformLocation(r,"uScene"),0))}function vr(t){Je();let n=new Uint8Array(4);x.readPixels(0,0,1,1,x.RGBA,x.UNSIGNED_BYTE,n);let r=performance.now();for(let e=0;e<t;e++)Je();return x.readPixels(0,0,1,1,x.RGBA,x.UNSIGNED_BYTE,n),(performance.now()-r)/t}var $e=vr(Math.max(1,Pt)),jt=fe(re,w/D),Z=w/oe,be=D/oe,Ee=document.createElement("div");Ee.style.cssText=`position:relative;overflow:hidden;width:${Z}px;height:${be}px`;j.parentNode?.insertBefore(Ee,j);Ee.appendChild(j);var X=document.createElement("div");X.style.cssText="position:absolute;inset:0;pointer-events:none";Ee.appendChild(X);var ot=t=>te<=0?0:1-Math.exp(-te*t),Ze=190,Ye=[],_t=(t,n,r)=>{let e=0;for(let o=0;o<4;o++){let a=t[o],i=t[(o+1)%4],s=(i.x-a.x)*(r-a.y)-(i.y-a.y)*(n-a.x);if(Math.abs(s)<1e-9)continue;let l=s>0?1:-1;if(e===0)e=l;else if(l!==e)return!1}return!0},Xt=[...L].sort((t,n)=>t.distance-n.distance).map(t=>{let n=t.verdict==="WITHHELD",r=t.distance>Bt,e=Math.round(ee*Ze),o=Math.round(J*Ze),a=we(t.x,t.z,t.y-J/2,ee,J,t.yaw,Ct/2+.004),i=_e(jt,a,Z,be,e,o),s=C(i)?i.refusal:null,l=!C(i)&&i.signedArea<=0,u=C(i)?0:Math.max(Math.hypot(i.screen[0].x-i.screen[1].x,i.screen[0].y-i.screen[1].y),Math.hypot(i.screen[3].x-i.screen[2].x,i.screen[3].y-i.screen[2].y)),c=u<26,d=C(i)?0:i.screen.filter(f=>Ye.some(E=>_t(E,f.x,f.y))).length+Ye.reduce((f,E)=>f+E.filter(p=>_t(i.screen.map(T=>({x:T.x,y:T.y})),p.x,p.y)).length,0),m=d>=2,h=!s&&!l&&!n&&!r&&!c&&!m;return h&&!C(i)&&Ye.push(i.screen.map(f=>({x:f.x,y:f.y}))),{p:t,proj:i,shown:h,ew:e,eh:o,refusal:s,backFacing:l,withheld:n,tooFar:r,edgeOn:c,occluded:m,widthPx:u,coveredCorners:d}});for(let t of[...Xt].sort((n,r)=>r.p.distance-n.p.distance)){let{p:n,proj:r,shown:e,ew:o,eh:a}=t;if(e&&!C(r)){let i=ot(n.distance),s=document.createElement("div");s.style.cssText=`position:absolute;left:0;top:0;width:${o}px;height:${a}px;transform-origin:0 0;transform:${r.transform};display:flex;flex-direction:column;justify-content:center;gap:5px;padding:0 5px;overflow:hidden;opacity:${(1-.75*i).toFixed(3)};-webkit-font-smoothing:antialiased`;let l=n.hoursAgo,u=l<24?`${l}h ago`:`${(l/24).toFixed(l<72?1:0)}d ago`;s.innerHTML=`<div style="font:600 9px/1 ui-monospace,monospace;letter-spacing:.15em;color:rgba(255,255,255,0.66)">${n.verdict} \xB7 ${u}</div><div style="font:700 11px/1.05 ui-monospace,monospace;color:#fff">${n.action}</div><div style="font:400 10.5px/1.2 ui-monospace,monospace;color:rgba(255,255,255,0.74)">${n.actor}</div>`,X.appendChild(s)}}var z=Xt.map(({p:t,shown:n,refusal:r,backFacing:e,withheld:o,tooFar:a,edgeOn:i,widthPx:s,coveredCorners:l})=>({i:t.i,verdict:t.verdict,hoursAgo:t.hoursAgo,distance:Number(t.distance.toFixed(2)),fog:Number(ot(t.distance).toFixed(3)),widthPx:Math.round(s),coveredCorners:l,shown:n,hiddenBecause:n?null:o?"WITHHELD":r||(e?"BACK_FACING":i?"EDGE_ON":a?"BEYOND_LEGIBLE_RANGE":"OCCLUDED")})),$t=Math.max(0,...z.filter(t=>t.shown).map(t=>t.hoursAgo)),Yt=Math.max(...L.map(t=>t.hoursAgo)),at=document.createElement("div");at.style.cssText="position:absolute;left:18px;top:16px;display:flex;flex-direction:column;gap:7px";at.innerHTML=`<div style="font:600 11px/1 ui-monospace,monospace;letter-spacing:.16em;color:#8FB7FF">GOVERNED ACTIONS \xB7 DEPTH IS TIME</div><div style="font:400 10.5px/1.5 ui-monospace,monospace;color:rgba(196,212,240,0.84)">READABLE TO ${($t/24).toFixed(1)} d &nbsp;\xB7&nbsp; VISIBLE TO ${(Yt/24).toFixed(1)} d<br>${nt} h PER METRE &nbsp;\xB7&nbsp; ${tt?"FOG ON":"FOG OFF \u2014 reading limit NOT shown"}</div><div style="font:500 10px/1.4 ui-monospace,monospace;color:#E0A94A">SYNTHETIC RECORDS</div>`;X.appendChild(at);var pe={ALLOWED:L.filter(t=>t.verdict==="ALLOWED").length,BLOCKED:L.filter(t=>t.verdict==="BLOCKED").length,WITHHELD:L.filter(t=>t.verdict==="WITHHELD").length},it=document.createElement("div");it.style.cssText="position:absolute;right:18px;bottom:16px;display:flex;flex-direction:column;gap:6px;align-items:flex-end;font:500 10.5px/1 ui-monospace,monospace";it.innerHTML=[["#2C6BFF",`ALLOWED \xB7 ${pe.ALLOWED}`],["#C9552B",`BLOCKED \xB7 ${pe.BLOCKED}`],["#5C6880",`WITHHELD \xB7 ${pe.WITHHELD} (present, unreadable)`]].map(([t,n])=>`<div style="display:flex;align-items:center;gap:7px;color:rgba(196,212,240,0.85)"><span>${n}</span><span style="width:11px;height:11px;background:${t};display:inline-block"></span></div>`).join("");X.appendChild(it);var wt=[1,3,7,14].map(t=>{let n=It(t*24),r=K(jt,[-V+.3,.035,n],Z,be),e=ot(Math.hypot(P[0]+V-.3,P[1]-.035,P[2]-n));if(!r.behind&&r.sx>0&&r.sx<Z&&r.sy>0&&r.sy<be){let o=document.createElement("div");o.style.cssText=`position:absolute;left:${r.sx.toFixed(1)}px;top:${r.sy.toFixed(1)}px;transform:translate(-50%,-50%);font:500 10px/1 ui-monospace,monospace;letter-spacing:.08em;color:rgba(196,212,240,${(.85*(1-e)).toFixed(3)});white-space:nowrap`,o.textContent=`${t}d`,X.appendChild(o)}return{days:t,sx:Math.round(r.sx),sy:Math.round(r.sy),fog:Number(e.toFixed(3)),onFrame:!r.behind&&r.sx>0&&r.sx<Z}}),Kt=(()=>{let t=x.getExtension("WEBGL_debug_renderer_info");return t?String(x.getParameter(t.UNMASKED_RENDERER_WEBGL)):"unknown"})(),Ke=/swiftshader|llvmpipe|software/i.test(Kt),et=Se();if(et.length>0){let t="BRAND FIDELITY FAILED \u2014 "+et.map(r=>`${r.key}: expected ${r.expected}, got ${r.actual}`).join("; ");document.title="REFUSED";let n=document.getElementById("log");throw n&&(n.textContent=t),new Error(t)}var Qt={brandFidelity:et,ao:Qe,fog:tt,fogDensity:Number(te.toFixed(4)),hoursPerMetre:nt,legibleMetres:Bt,hdr:M.hdr,eye:P.map(t=>Number(t.toFixed(2))),readableToDays:Number(($t/24).toFixed(2)),visibleToDays:Number((Yt/24).toFixed(2)),records:L.length,actionOverflow:L.filter(t=>t.action.length*6.6>ee*Ze-10).map(t=>t.action),tiersUsed:Math.max(...L.map(t=>t.tier))+1,tierOverflows:L.filter(t=>t.tierOverflow).length,counts:pe,shown:z.filter(t=>t.shown).length,hiddenBy:z.filter(t=>!t.shown).reduce((t,n)=>{let r=n.hiddenBecause??"UNKNOWN";return t[r]=(t[r]??0)+1,t},{}),fogNearest:Math.min(...z.map(t=>t.fog)),fogFurthest:Math.max(...z.map(t=>t.fog)),rulerTicks:wt,rulerOffFrame:wt.filter(t=>!t.onFrame).length,perRecord:z,glError:x.getError(),triangles:Ar,shadowMap:qe.size,resolution:`${w}x${D}`,dprScale:oe,frames:Pt,msPerFrame:Number($e.toFixed(3)),fps:Math.round(1e3/$e),renderer:Kt,rendererClass:Ke?"software":"hardware",headroom:Ke?null:Number((16.6-$e).toFixed(3)),headroomRefusal:Ke?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null,hardwareMsPerFrame:null};globalThis.E6=Qt;var{perRecord:Dt,rulerTicks:_n,...Mr}=Qt;lr.textContent=JSON.stringify(Mr,null,2)+`

perRecord (${Dt.length}, full detail on globalThis.E6):
`+Dt.map(t=>`  #${String(t.i).padStart(2)} ${t.verdict.padEnd(9)} ${String(t.hoursAgo).padStart(4)}h ${String(t.distance).padStart(6)}m fog ${t.fog.toFixed(3)} ${t.shown?"SHOWN":`hidden: ${t.hiddenBecause}`}`).join(`
`);Je();Ut.markRendered();document.title="READY";

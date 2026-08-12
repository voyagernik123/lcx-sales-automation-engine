var Rt={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected.",FEEDBACK_LOOP:"A layer of this view was asked to read the surface it draws into, which every driver refuses, so the layer is not being drawn. This is a defect in the renderer, not in the data."};function L(e,n){return n===void 0?{kind:"refused",code:e,reason:Rt[e]}:{kind:"refused",code:e,reason:Rt[e],detail:n}}function Se(e){return e.kind==="stage"}function we(e,n={}){let r=e.getContext("webgl2",{antialias:n.antialias??!1,alpha:n.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!r)return L("NO_WEBGL2");let t=r.getExtension("EXT_color_buffer_float"),o=e.width,a=e.height,i=t?r.RGBA16F:r.RGBA8,l=t?r.HALF_FLOAT:r.UNSIGNED_BYTE,u=(p,g)=>{let x=r.createTexture();r.bindTexture(r.TEXTURE_2D,x),r.texImage2D(r.TEXTURE_2D,0,i,p,g,0,r.RGBA,l,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE);let E=r.createFramebuffer();r.bindFramebuffer(r.FRAMEBUFFER,E),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,x,0);let A=r.checkFramebufferStatus(r.FRAMEBUFFER);return A!==r.FRAMEBUFFER_COMPLETE?L("FRAMEBUFFER_INCOMPLETE",`status 0x${A.toString(16)} at ${p}\xD7${g}`):{texture:x,framebuffer:E,width:p,height:g}},s=n.bloomShift??2,c={w:o,h:a},d=u(o,a);if("kind"in d)return d;let m=u(Math.max(1,o>>s),Math.max(1,a>>s));if("kind"in m)return m;let h=u(Math.max(1,o>>s),Math.max(1,a>>s));if("kind"in h)return h;let y=r.createVertexArray();r.bindVertexArray(y);let f=r.createBuffer();r.bindBuffer(r.ARRAY_BUFFER,f),r.bufferData(r.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),r.STATIC_DRAW),r.enableVertexAttribArray(0),r.vertexAttribPointer(0,2,r.FLOAT,!1,0,0),r.bindVertexArray(null);let b=[];return{kind:"stage",gl:r,cssWidth:e.clientWidth||o,cssHeight:e.clientHeight||a,hdr:!!t,get width(){return c.w},get height(){return c.h},get scene(){return d},get bloomA(){return m},get bloomB(){return h},setRegion(p,g){let x=Math.max(1,Math.round(p)),E=Math.max(1,Math.round(g));if(!(x===c.w&&E===c.h)){c={w:x,h:E};for(let A of[d,m,h])"kind"in A||(r.deleteFramebuffer(A.framebuffer),r.deleteTexture(A.texture));d=u(x,E),m=u(Math.max(1,x>>s),Math.max(1,E>>s)),h=u(Math.max(1,x>>s),Math.max(1,E>>s))}},compile(p,g){let x=(O,P)=>{let M=r.createShader(O);if(r.shaderSource(M,P),r.compileShader(M),!r.getShaderParameter(M,r.COMPILE_STATUS)){let v=r.getShaderInfoLog(M)??"(no log)";return r.deleteShader(M),L("SHADER_COMPILE_FAILED",v)}return M},E=x(r.VERTEX_SHADER,p);if(typeof E=="object"&&"kind"in E)return E;let A=x(r.FRAGMENT_SHADER,g);if(typeof A=="object"&&"kind"in A)return r.deleteShader(E),A;let F=r.createProgram();if(r.attachShader(F,E),r.attachShader(F,A),r.linkProgram(F),!r.getProgramParameter(F,r.LINK_STATUS)){let O=r.getProgramInfoLog(F)??"(no log)";return r.deleteShader(E),r.deleteShader(A),r.deleteProgram(F),L("PROGRAM_LINK_FAILED",O)}return r.detachShader(F,E),r.detachShader(F,A),r.deleteShader(E),r.deleteShader(A),b.push(F),F},bindTarget(p){r.bindFramebuffer(r.FRAMEBUFFER,p?p.framebuffer:null),r.viewport(0,0,p?p.width:c.w,p?p.height:c.h)},blit(p,g){r.useProgram(p),r.bindVertexArray(y),g?.(p),r.drawArrays(r.TRIANGLES,0,3),r.bindVertexArray(null)},dispose(){for(let p of b)r.deleteProgram(p);for(let p of[d,m,h])"kind"in p||(r.deleteFramebuffer(p.framebuffer),r.deleteTexture(p.texture));r.deleteBuffer(f),r.deleteVertexArray(y)}}}var fe=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function he(e,n){let r=new Float32Array(16);for(let t=0;t<4;t++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=e[i*4+o]*n[t*4+i];r[t*4+o]=a}return r}var pe=(e,n)=>[e[0]-n[0],e[1]-n[1],e[2]-n[2]],me=(e,n)=>e[0]*n[0]+e[1]*n[1]+e[2]*n[2],_e=(e,n)=>[e[1]*n[2]-e[2]*n[1],e[2]*n[0]-e[0]*n[2],e[0]*n[1]-e[1]*n[0]];function ee(e){let n=Math.hypot(e[0],e[1],e[2]);return n===0?e:[e[0]/n,e[1]/n,e[2]/n]}function De(e,n,r,t){let o=1/Math.tan(e/2);return new Float32Array([o/n,0,0,0,0,o,0,0,0,0,(t+r)/(r-t),-1,0,0,2*t*r/(r-t),0])}function Pe(e,n,r,t,o,a){let i=n-e,l=t-r,u=a-o;return new Float32Array([2/i,0,0,0,0,2/l,0,0,0,0,-2/u,0,-(n+e)/i,-(t+r)/l,-(a+o)/u,1])}function be(e,n,r){let t=ee(pe(e,n)),o=_e(r,t);if(Math.hypot(o[0],o[1],o[2])<1e-8)return fe();let a=ee(o),i=_e(t,a);return new Float32Array([a[0],i[0],t[0],0,a[1],i[1],t[1],0,a[2],i[2],t[2],0,-me(a,e),-me(i,e),-me(t,e),1])}function Ft(e,n){let r=[0,1,2,3].map(o=>e[0+o]*n[0]+e[4+o]*n[1]+e[8+o]*n[2]+e[12+o]),t=r[3];return{x:r[0]/t,y:r[1]/t,z:r[2]/t,w:t}}function te(e,n,r,t){let o=Ft(e,n);return{sx:(o.x*.5+.5)*r,sy:(1-(o.y*.5+.5))*t,behind:o.w<=0}}function vt(e){return e<=.04045?e/12.92:Math.pow((e+.055)/1.055,2.4)}function Ne(e){return e<=.0031308?e*12.92:1.055*Math.pow(e,1/2.4)-.055}var Fr=/^#?([0-9a-fA-F]{6})$/;function N(e){let n=Fr.exec(e.trim());if(!n)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(e)}`);let r=n[1];return[0,2,4].map(t=>vt(parseInt(r.slice(t,t+2),16)/255))}function Oe(e){return`#${e.map(r=>{let t=Ne(Math.min(1,Math.max(0,r)));return Math.round(t*255).toString(16).padStart(2,"0")}).join("")}`}var X={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},Ue=Object.freeze(Object.fromEntries(Object.keys(X).map(e=>[e,N(X[e])])));var Mt=.4;var Ce=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${Mt.toFixed(2)}); }`,Be=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function Ie(){let e=[];for(let n of Object.keys(X)){let r=X[n].toLowerCase(),t=Oe(Ue[n]).toLowerCase();t!==r&&e.push({key:n,expected:r,actual:t})}return e}function vr(e){let n=[1/0,1/0,1/0],r=[-1/0,-1/0,-1/0];for(let t=0;t<e.length;t+=3)for(let o=0;o<3;o++){let a=e[t+o];a<n[o]&&(n[o]=a),a>r[o]&&(r[o]=a)}return e.length===0?{min:[0,0,0],max:[0,0,0]}:{min:n,max:r}}function Lt(e,n,r,t){let o=new Float32Array(e.length);for(let i=0;i<t.length;i+=3){let l=t[i],u=t[i+1],s=t[i+2],c=l*3,d=u*3,m=s*3,h=l*2,y=u*2,f=s*2,b=e[d]-e[c],R=e[d+1]-e[c+1],p=e[d+2]-e[c+2],g=e[m]-e[c],x=e[m+1]-e[c+1],E=e[m+2]-e[c+2],A=r[y]-r[h],F=r[y+1]-r[h+1],O=r[f]-r[h],P=r[f+1]-r[h+1],M=A*P-O*F;if(Math.abs(M)<1e-12)continue;let v=1/M,Z=(b*P-g*F)*v,Ar=(R*P-x*F)*v,Rr=(p*P-E*F)*v;for(let $ of[c,d,m])o[$]=o[$]+Z,o[$+1]=o[$+1]+Ar,o[$+2]=o[$+2]+Rr}let a=new Float32Array(e.length);for(let i=0;i<a.length;i+=3){let l=n[i],u=n[i+1],s=n[i+2],c=o[i],d=o[i+1],m=o[i+2],h=c*l+d*u+m*s;c-=l*h,d-=u*h,m-=s*h;let y=Math.hypot(c,d,m);y<1e-8&&(Math.abs(l)<.9?(c=0,d=-s,m=u):(c=-s,d=0,m=l),y=Math.hypot(c,d,m)||1),a[i]=c/y,a[i+1]=d/y,a[i+2]=m/y}return a}function St(e,n){let r=new Float32Array(e.length);for(let t=0;t<n.length;t+=3){let o=n[t]*3,a=n[t+1]*3,i=n[t+2]*3,l=e[a]-e[o],u=e[a+1]-e[o+1],s=e[a+2]-e[o+2],c=e[i]-e[o],d=e[i+1]-e[o+1],m=e[i+2]-e[o+2],h=u*m-s*d,y=s*c-l*m,f=l*d-u*c;for(let b of[o,a,i])r[b]=r[b]+h,r[b+1]=r[b+1]+y,r[b+2]=r[b+2]+f}for(let t=0;t<r.length;t+=3){let o=Math.hypot(r[t],r[t+1],r[t+2]);o>0&&(r[t]=r[t]/o,r[t+1]=r[t+1]/o,r[t+2]=r[t+2]/o)}return r}function Mr(e,n,r,t,o){let{min:a,max:i}=vr(e),l=t??St(e,r);return{positions:e,normals:l,uvs:n,indices:r,min:a,max:i,tangents:o??Lt(e,l,n,r)}}function k(e=1,n=1,r=1){let t=e/2,o=n/2,a=r/2,i=[[[-t,-o,a],[t,-o,a],[t,o,a],[-t,o,a]],[[t,-o,-a],[-t,-o,-a],[-t,o,-a],[t,o,-a]],[[t,-o,a],[t,-o,-a],[t,o,-a],[t,o,a]],[[-t,-o,-a],[-t,-o,a],[-t,o,a],[-t,o,-a]],[[-t,o,a],[t,o,a],[t,o,-a],[-t,o,-a]],[[-t,-o,-a],[t,-o,-a],[t,-o,a],[-t,-o,a]]],l=new Float32Array(72),u=new Float32Array(48),s=new Uint16Array(36),c=0,d=0,m=0,h=0;for(let y of i){for(let[f,b,R]of y)l[c++]=f,l[c++]=b,l[c++]=R;u[d++]=0,u[d++]=0,u[d++]=1,u[d++]=0,u[d++]=1,u[d++]=1,u[d++]=0,u[d++]=1,s[m++]=h,s[m++]=h+1,s[m++]=h+2,s[m++]=h,s[m++]=h+2,s[m++]=h+3,h+=4}return Mr(l,u,s)}function H(e){return e.indices.length/3}function Lr(e){if(!Number.isFinite(e)||e===0)return"0";let n=e.toFixed(12).replace(/0+$/,"").replace(/\.$/,"");return n==="-0"?"0":n}function wt(e,n,r,t){let[o,a]=e,[i,l]=n,[u,s]=r,[c,d]=t,m=o-i+u-c,h=a-l+s-d;if(Math.abs(m)<1e-9&&Math.abs(h)<1e-9){let E=[i-o,c-o,o,l-a,d-a,a,0,0,1],A=E[0]*E[4]-E[1]*E[3];return Math.abs(A)<1e-9?null:E}let y=i-u,f=c-u,b=l-s,R=d-s,p=y*R-f*b;if(Math.abs(p)<1e-9)return null;let g=(m*R-f*h)/p,x=(y*h-m*b)/p;return[i-o+g*i,c-o+x*c,o,l-a+g*l,d-a+x*d,a,g,x,1]}function Ge(e,n,r,t,o,a){if(!(o>0)||!(a>0))return{refusal:"EMPTY_ELEMENT_BOX"};let l=[n.topLeft,n.topRight,n.bottomRight,n.bottomLeft].map(v=>te(e,v,r,t));if(l.some(v=>v.behind))return{refusal:"CORNER_BEHIND_CAMERA"};let u=l.map(v=>({x:v.sx,y:v.sy})),[s,c,d,m]=u,h=wt([s.x,s.y],[c.x,c.y],[d.x,d.y],[m.x,m.y]);if(!h)return{refusal:"DEGENERATE_ON_SCREEN"};let y=.5*(s.x*c.y-c.x*s.y+(c.x*d.y-d.x*c.y)+(d.x*m.y-m.x*d.y)+(m.x*s.y-s.x*m.y)),f=1/o,b=1/a,[R,p,g,x,E,A,F,O,P]=h;return{transform:`matrix3d(${[R*f,x*f,0,F*f,p*b,E*b,0,O*b,0,0,1,0,g,A,0,P].map(Lr).join(", ")})`,matrix:h,screen:u,signedArea:y}}function B(e){return"refusal"in e}function ke(e,n,r,t,o,a,i=0){let l=Math.cos(a),u=Math.sin(a),s=(d,m)=>[e+l*d+u*i,r+m,n-u*d+l*i],c=t/2;return{topLeft:s(-c,o),topRight:s(c,o),bottomRight:s(c,0),bottomLeft:s(-c,0)}}var _t=e=>[e.DEPTH_TEST,e.CULL_FACE,e.BLEND];function Q(e){return[e.getParameter(e.FRAMEBUFFER_BINDING),e.getParameter(e.VIEWPORT),e.getParameter(e.DEPTH_WRITEMASK),_t(e).map(n=>e.getParameter(n))]}function Y(e,n){e.bindFramebuffer(e.FRAMEBUFFER,n[0]);let r=n[1];e.viewport(r[0]??0,r[1]??0,r[2]??0,r[3]??0),e.depthMask(n[2]),_t(e).forEach((t,o)=>{n[3][o]?e.enable(t):e.disable(t)})}function Ee(e,n){for(let r=n-1;r>=0;r--)e.activeTexture(e.TEXTURE0+r),e.bindTexture(e.TEXTURE_2D,null),e.bindTexture(e.TEXTURE_3D,null);e.activeTexture(e.TEXTURE0)}var He=["minimum","reduced","full"],Sr={full:{dprScale:2,ao:!0,aoScale:.5,dof:!0,shadowMapSize:1536,shadowTaps:9,particleCapacity:4096,volumeMaxSteps:128,volumeLightSteps:6},reduced:{dprScale:2,ao:!0,aoScale:.5,dof:!1,shadowMapSize:1024,shadowTaps:9,particleCapacity:2048,volumeMaxSteps:96,volumeLightSteps:4},minimum:{dprScale:1,ao:!1,aoScale:.5,dof:!1,shadowMapSize:512,shadowTaps:1,particleCapacity:512,volumeMaxSteps:48,volumeLightSteps:0}};function xe(e,n){let r=Number.isFinite(n)&&n>0?n:1024,o=r*(e==="full"?1:e==="reduced"?.5:.25),a=2**Math.round(Math.log2(o));return Math.max(256,Math.min(r,a))}function Ve(e){return{tier:e,...Sr[e]}}var We=89,ze=Math.PI/180;function ye(e){let n=Math.max(-We,Math.min(We,e.elevationDeg))*ze,r=e.azimuthDeg*ze,t=Math.max(1e-4,e.distance),o=Math.sin(n)*t,a=Math.cos(n)*t;return[e.target[0]+Math.sin(r)*a,e.target[1]+o,e.target[2]+Math.cos(r)*a]}function je(e){let n=e.near??Math.max(.01,e.distance/100),r=e.far??Math.max(n+1,e.distance*8);return{near:n,far:r}}function ge(e,n){let r=ye(e),t=e.near??Math.max(.01,e.distance/100),o=e.far??Math.max(t+1,e.distance*8),a=De((e.fovDeg??38)*ze,Math.max(.001,n),t,o),i=be(r,e.target,[0,1,0]);return he(a,i)}function $e(e,n,r){let t=ee(e.direction),o=e.extent??Math.max(.1,r*1.35),a=Math.max(1,r*2),i=[n[0]-t[0]*a,n[1]-t[1]*a,n[2]-t[2]*a],l=Math.abs(t[1])>.99?[0,0,1]:[0,1,0],u=be(i,n,l),s=Pe(-o,o,-o,o,.01,a+r*2+o);return he(s,u)}function Xe(e,n){let r=pe([n[0],n[1],n[2]],[e[0],e[1],e[2]]);return Math.hypot(r[0],r[1],r[2])/2}function Qe(e,n){return[(e[0]+n[0])/2,(e[1]+n[1])/2,(e[2]+n[2])/2]}function Ye(e,n,r){let{gl:t}=e,o=Math.max(1,Math.floor(n)),a=Math.max(1,Math.floor(r)),i=t.createFramebuffer(),l=t.createTexture(),u=t.createTexture();if(!i||!l||!u)return L("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let s=e.hdr?t.RGBA16F:t.RGBA8,c=e.hdr?t.HALF_FLOAT:t.UNSIGNED_BYTE,d=()=>{t.bindTexture(t.TEXTURE_2D,l),t.texImage2D(t.TEXTURE_2D,0,s,o,a,0,t.RGBA,c,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindTexture(t.TEXTURE_2D,u),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,o,a,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,i),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,l,0),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,u,0),t.bindFramebuffer(t.FRAMEBUFFER,null)};d(),t.bindFramebuffer(t.FRAMEBUFFER,i);let m=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),m!==t.FRAMEBUFFER_COMPLETE?L("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${m.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:l,depthTexture:u,get width(){return o},get height(){return a},bind(){t.bindFramebuffer(t.FRAMEBUFFER,i),t.viewport(0,0,o,a)},resize(h,y){let f=Math.max(1,Math.floor(h)),b=Math.max(1,Math.floor(y));f===o&&b===a||(o=f,a=b,d())},dispose(){t.deleteFramebuffer(i),t.deleteTexture(l),t.deleteTexture(u)}}}function Ke(e,n=1024){let{gl:r}=e,t=Math.max(256,Math.min(2048,Math.floor(n))),o=r.createFramebuffer(),a=r.createTexture();if(!o||!a)return L("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");r.bindTexture(r.TEXTURE_2D,a),r.texImage2D(r.TEXTURE_2D,0,r.DEPTH_COMPONENT24,t,t,0,r.DEPTH_COMPONENT,r.UNSIGNED_INT,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),r.bindFramebuffer(r.FRAMEBUFFER,o),r.framebufferTexture2D(r.FRAMEBUFFER,r.DEPTH_ATTACHMENT,r.TEXTURE_2D,a,0);let i=r.checkFramebufferStatus(r.FRAMEBUFFER);return r.bindFramebuffer(r.FRAMEBUFFER,null),i!==r.FRAMEBUFFER_COMPLETE?L("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:t,bind(){r.bindFramebuffer(r.FRAMEBUFFER,o),r.viewport(0,0,t,t)},dispose(){r.deleteFramebuffer(o),r.deleteTexture(a)}}}var Je=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,qe={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function Dt(e,n,r={}){let t=r.zenith??qe.zenith,o=r.horizon??qe.horizon,a=r.ground??qe.ground;e.uniform3f(e.getUniformLocation(n,"uSkyZenith"),t[0],t[1],t[2]),e.uniform3f(e.getUniformLocation(n,"uSkyHorizon"),o[0],o[1],o[2]),e.uniform3f(e.getUniformLocation(n,"uSkyGround"),a[0],a[1],a[2])}var pn=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${Je}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;var Pt=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,Ze=`#version 300 es
precision highp float;
void main(){}`,wr=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,Nt=`#version 300 es
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
}`,Ot=`#version 300 es
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
${Je}

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
}`;function V(e,n){let{gl:r}=e,t=r.createVertexArray(),o=r.createBuffer(),a=r.createBuffer(),i=r.createBuffer(),l=r.createBuffer();return!t||!o||!a||!i||!l?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(r.bindVertexArray(t),r.bindBuffer(r.ARRAY_BUFFER,o),r.bufferData(r.ARRAY_BUFFER,n.positions,r.STATIC_DRAW),r.enableVertexAttribArray(0),r.vertexAttribPointer(0,3,r.FLOAT,!1,0,0),r.bindBuffer(r.ARRAY_BUFFER,a),r.bufferData(r.ARRAY_BUFFER,n.normals,r.STATIC_DRAW),r.enableVertexAttribArray(1),r.vertexAttribPointer(1,3,r.FLOAT,!1,0,0),r.bindBuffer(r.ARRAY_BUFFER,i),r.bufferData(r.ARRAY_BUFFER,n.tangents,r.STATIC_DRAW),r.enableVertexAttribArray(2),r.vertexAttribPointer(2,3,r.FLOAT,!1,0,0),r.bindBuffer(r.ELEMENT_ARRAY_BUFFER,l),r.bufferData(r.ELEMENT_ARRAY_BUFFER,n.indices,r.STATIC_DRAW),r.bindVertexArray(null),{vao:t,indexCount:n.indices.length,indexType:n.indices instanceof Uint32Array?r.UNSIGNED_INT:r.UNSIGNED_SHORT,dispose(){r.deleteVertexArray(t),r.deleteBuffer(o),r.deleteBuffer(a),r.deleteBuffer(i),r.deleteBuffer(l)}})}function et(e){let{gl:n}=e,r=e.compile(Pt,Ze);if("kind"in r)return r;let t=e.compile(Nt,Ot);if("kind"in t)return t;let o=e.compile(wr,Ze);if("kind"in o)return o;let a=(i,l)=>n.getUniformLocation(i,l);return{shadowPass(i,l,u,s){let c=Q(n),d=s??(()=>{});u.bind(),d("shadow.bind"),n.clear(n.DEPTH_BUFFER_BIT),n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.FRONT),n.useProgram(r),d("useProgram(shadow)"),n.uniformMatrix4fv(a(r,"uLightVP"),!1,i),d("uLightVP");for(let m of l)n.uniformMatrix4fv(a(r,"uModel"),!1,m.model),d("shadow uModel"),n.bindVertexArray(m.mesh.vao),d("shadow bindVAO"),n.drawElements(n.TRIANGLES,m.mesh.indexCount,m.mesh.indexType,0),d("shadow drawElements");n.bindVertexArray(null),n.cullFace(n.BACK),Y(n,c)},depthPrepass(i,l){let u=Q(n);n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.colorMask(!1,!1,!1,!1),n.useProgram(o),n.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let s of l)n.uniformMatrix4fv(a(o,"uModel"),!1,s.model),n.bindVertexArray(s.mesh.vao),n.drawElements(n.TRIANGLES,s.mesh.indexCount,s.mesh.indexType,0);n.bindVertexArray(null),n.colorMask(!0,!0,!0,!0),Y(n,u)},draw(i){let l=Q(n),u=i.onStep??(()=>{});if(n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.useProgram(t),n.uniformMatrix4fv(a(t,"uViewProj"),!1,i.viewProj),u("uViewProj"),n.uniform3fv(a(t,"uEye"),i.eye),u("uEye"),n.uniform3fv(a(t,"uLightDir"),i.lightDir),u("uLightDir"),n.uniform3fv(a(t,"uLightColour"),i.lightColour),u("uLightColour"),n.uniform1f(a(t,"uAmbientGain"),i.ambientGain??1),u("uAmbientGain"),i.fog&&i.fog.density>0){n.uniform1f(a(t,"uFogDensity"),i.fog.density),n.uniform1f(a(t,"uFogHeight"),i.fog.height),n.uniform1f(a(t,"uFogFloor"),i.fog.floor??0);let s=i.fog.colour;s==="sky"?n.uniform3f(a(t,"uFogColour"),-1,-1,-1):n.uniform3f(a(t,"uFogColour"),s[0],s[1],s[2]),u("fog")}else n.uniform1f(a(t,"uFogDensity"),0);Dt(n,t,i.sky),u("bindSky"),i.ao&&i.screenSize?(n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,i.ao),n.uniform1i(a(t,"uAO"),1),n.uniform2f(a(t,"uScreenSize"),i.screenSize[0],i.screenSize[1]),n.uniform1f(a(t,"uAOEnabled"),1)):n.uniform1f(a(t,"uAOEnabled"),0),u("bindAO"),n.uniformMatrix4fv(a(t,"uLightVP"),!1,i.lightVP),u("lit uLightVP"),i.shadow?(n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,i.shadow.depthTexture),n.uniform1i(a(t,"uShadowMap"),0),n.uniform1f(a(t,"uShadowTexel"),1/i.shadow.size),n.uniform1f(a(t,"uShadowStrength"),i.shadowStrength??1)):n.uniform1f(a(t,"uShadowStrength"),0);for(let s of i.draws)n.uniformMatrix4fv(a(t,"uModel"),!1,s.model),n.uniformMatrix3fv(a(t,"uNormalMat"),!1,s.normalMat),u("uNormalMat"),n.uniform3fv(a(t,"uBaseColour"),s.material.baseColour),u("uBaseColour"),n.uniform1f(a(t,"uRoughness"),s.material.roughness),n.uniform1f(a(t,"uMetalness"),s.material.metalness),n.uniform1f(a(t,"uAnisotropy"),s.material.anisotropy??0),n.bindVertexArray(s.mesh.vao),u("lit bindVAO"),n.drawElements(n.TRIANGLES,s.mesh.indexCount,s.mesh.indexType,0),u("lit drawElements");n.bindVertexArray(null),Ee(n,2),Y(n,l)},dispose(){n.deleteProgram(r),n.deleteProgram(t),n.deleteProgram(o)}}}var tt=`
uniform sampler2D uDepth;
uniform vec2 uNearFar;

float linearDepthAt(vec2 uv) {
  float d = texture(uDepth, uv).r * 2.0 - 1.0;
  float n = uNearFar.x, f = uNearFar.y;
  return (2.0 * n * f) / (f + n - d * (f - n));
}`,Ct=`
uniform float uTanHalfFov;
uniform float uAspect;

vec3 viewPosAt(vec2 uv) {
  float z = linearDepthAt(uv);
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x * uTanHalfFov * uAspect * z, ndc.y * uTanHalfFov * z, -z);
}`,Bt=tt+Ct,Ut=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,_r=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${Bt}

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
}`,Dr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${tt}

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
}`;function rt(e,n,r){let{gl:t}=e,o=e.compile(Ut,_r);if("kind"in o)return o;let a=e.compile(Ut,Dr);if("kind"in a)return a;let i=Math.max(1,n>>1),l=Math.max(1,r>>1),u=()=>{let f=t.createFramebuffer(),b=t.createTexture();return!f||!b?null:{fb:f,tex:b}},s=u(),c=u();if(!s||!c)return L("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let d=()=>{for(let f of[s,c])t.bindTexture(t.TEXTURE_2D,f.tex),t.texImage2D(t.TEXTURE_2D,0,t.R8,i,l,0,t.RED,t.UNSIGNED_BYTE,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,f.fb),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,f.tex,0);t.bindFramebuffer(t.FRAMEBUFFER,null)};d(),t.bindFramebuffer(t.FRAMEBUFFER,s.fb);let m=t.checkFramebufferStatus(t.FRAMEBUFFER);if(t.bindFramebuffer(t.FRAMEBUFFER,null),m!==t.FRAMEBUFFER_COMPLETE)return L("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${m.toString(16)}).`);let h=(f,b,R,p,g)=>{t.activeTexture(t.TEXTURE0+g),t.bindTexture(t.TEXTURE_2D,b),t.uniform1i(t.getUniformLocation(f,"uDepth"),g),t.uniform2f(t.getUniformLocation(f,"uNearFar"),R,p)},y=(f,b,R,p,g,x,E)=>{h(f,b,R,p,E),t.uniform1f(t.getUniformLocation(f,"uTanHalfFov"),Math.tan(g*Math.PI/360)),t.uniform1f(t.getUniformLocation(f,"uAspect"),x)};return{get texture(){return s.tex},get width(){return i},get height(){return l},compute(f){let b=Q(t);t.disable(t.DEPTH_TEST),t.depthMask(!1),t.disable(t.BLEND),t.disable(t.CULL_FACE),t.bindFramebuffer(t.FRAMEBUFFER,s.fb),t.viewport(0,0,i,l),t.useProgram(o),y(o,f.depthTexture,f.near,f.far,f.fovDeg,f.aspect,0),t.uniform2f(t.getUniformLocation(o,"uTexel"),1/i,1/l),t.uniform1f(t.getUniformLocation(o,"uRadius"),f.radius??.55),t.uniform1f(t.getUniformLocation(o,"uStrength"),f.strength??1.15),t.uniform1f(t.getUniformLocation(o,"uBias"),f.bias??.035),e.blit(o);for(let[R,p,g]of[[s,c,[1,0]],[c,s,[0,1]]])t.bindFramebuffer(t.FRAMEBUFFER,p.fb),t.viewport(0,0,i,l),t.useProgram(a),h(a,f.depthTexture,f.near,f.far,0),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,R.tex),t.uniform1i(t.getUniformLocation(a,"uAO"),1),t.uniform2f(t.getUniformLocation(a,"uTexel"),1/i,1/l),t.uniform2f(t.getUniformLocation(a,"uDir"),g[0],g[1]),e.blit(a);Ee(t,2),Y(t,b)},resize(f,b){let R=Math.max(1,f>>1),p=Math.max(1,b>>1);R===i&&p===l||(i=R,l=p,d())},dispose(){t.deleteProgram(o),t.deleteProgram(a);for(let f of[s,c])t.deleteFramebuffer(f.fb),t.deleteTexture(f.tex)}}}var Pr=`
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
`;function G(e){return String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function It(e){let n=document.createElement("style");n.textContent=Pr,document.head.appendChild(n);let r=document.createElement("section");r.id="lcx-fallback",r.setAttribute("aria-label",`${e.title} \u2014 flat view`),r.setAttribute("tabindex","-1"),document.getElementById("log")?.setAttribute("aria-hidden","true");let t=(a,i)=>a===null?`<td class="absent${i?" n":""}">absent</td>`:`<td class="${i?"n":""}">${G(a)}</td>`;r.innerHTML=`<h2>${G(e.title)} \u2014 flat view</h2><p class="reads">${G(e.readsAs)}</p>`+(e.notices??[]).map(a=>`<p class="notice">${G(a)}</p>`).join("")+'<div id="lcx-refusal" role="alert"></div>'+(e.html?`<div class="surface">${e.html}</div>`:`<table><caption>${G(e.title)} \u2014 flat view</caption><thead><tr>`+e.columns.map(a=>`<th scope="col" class="${a.numeric?"n":""}">${G(a.label)}</th>`).join("")+"</tr></thead><tbody>"+e.rows.map(a=>"<tr>"+e.columns.map(i=>t(a[i.key]??null,!!i.numeric)).join("")+"</tr>").join("")+"</tbody></table>"),document.body.appendChild(r);function o(a,i){let l=document.getElementById("lcx-refusal");l&&(l.innerHTML=`<p class="refusal"><strong>${G(a)}</strong> \u2014 ${G(i)} The measurements below are unaffected.</p>`),delete r.dataset.rendered;for(let u of Array.from(document.querySelectorAll("canvas")))u.style.display="none";r.focus({preventScroll:!0})}return document.addEventListener("webglcontextlost",a=>{a.preventDefault(),o("CONTEXT_LOST","The GPU dropped the WebGL context for this page mid-session.")},!0),{markRendered(){r.dataset.rendered="1"},showRefusal:o}}var K=new URLSearchParams(location.search),lt=[],qt=[];function Jt(e,n,r,t){let o=K.get(e);if(o===null)return n;let a=Number(o);if(!Number.isFinite(a))return lt.push(`${e}=${o}`),n;let i=Math.max(r,Math.min(t,a));return i!==a&&qt.push(`${e}=${o} used as ${i}`),i}var bt=He.includes(K.get("tier")??"")?K.get("tier"):"full",ct=Ve(bt),dt=K.get("ao")!=="0"&&ct.ao,Et=K.get("fog")!=="0",I=Jt("scale",1,1,3),Zt=Math.trunc(Jt("frames",300,1,2e4)),_=1200*I,S=720*I,q=document.getElementById("c");q.width=_;q.height=S;var Nr=document.getElementById("log");function ve(e){document.title="REFUSED";let n=document.getElementById("log");n&&(n.textContent=e);let[r,...t]=e.split(":");throw er?.showRefusal(r?.trim()??"REFUSED",t.join(":").trim()||e),new Error(e)}var er=null;function C(e,n){return"kind"in n&&ve(`${e}: ${n.code} \u2014 ${n.reason} ${n.detail??""}`),n}var tr=[{hoursAgo:3,actor:"n.sharma",action:"campaign.publish",verdict:"ALLOWED"},{hoursAgo:9,actor:"n.sharma",action:"budget.raise",verdict:"ALLOWED"},{hoursAgo:14,actor:"svc.payagent",action:"x402.settle",verdict:"ALLOWED"},{hoursAgo:26,actor:"a.reiter",action:"listing.approve",verdict:"ALLOWED"},{hoursAgo:31,actor:"svc.operator",action:"memo.generate",verdict:"ALLOWED"},{hoursAgo:44,actor:"j.kohler",action:"compartment.read",verdict:"BLOCKED"},{hoursAgo:45,actor:"j.kohler",action:"compartment.read",verdict:"BLOCKED"},{hoursAgo:46,actor:"j.kohler",action:"export.bulk",verdict:"BLOCKED"},{hoursAgo:47,actor:"j.kohler",action:"export.bulk",verdict:"BLOCKED"},{hoursAgo:58,actor:"svc.payagent",action:"x402.settle",verdict:"ALLOWED"},{hoursAgo:70,actor:"\u2014",action:"\u2014",verdict:"WITHHELD"},{hoursAgo:83,actor:"a.reiter",action:"quest.close",verdict:"ALLOWED"},{hoursAgo:95,actor:"n.sharma",action:"rfi.extract",verdict:"ALLOWED"},{hoursAgo:110,actor:"\u2014",action:"\u2014",verdict:"WITHHELD"},{hoursAgo:128,actor:"svc.operator",action:"sat.gate",verdict:"BLOCKED"},{hoursAgo:141,actor:"a.reiter",action:"listing.approve",verdict:"ALLOWED"},{hoursAgo:163,actor:"n.sharma",action:"campaign.draft",verdict:"ALLOWED"},{hoursAgo:190,actor:"svc.payagent",action:"x402.settle",verdict:"ALLOWED"},{hoursAgo:214,actor:"\u2014",action:"\u2014",verdict:"WITHHELD"},{hoursAgo:246,actor:"a.reiter",action:"quest.close",verdict:"ALLOWED"},{hoursAgo:280,actor:"n.sharma",action:"budget.raise",verdict:"ALLOWED"},{hoursAgo:320,actor:"svc.operator",action:"memo.generate",verdict:"ALLOWED"},{hoursAgo:366,actor:"j.kohler",action:"compartment.read",verdict:"BLOCKED"},{hoursAgo:410,actor:"a.reiter",action:"listing.approve",verdict:"ALLOWED"},{hoursAgo:462,actor:"n.sharma",action:"campaign.publish",verdict:"ALLOWED"}],rr=It({title:"E6 \xB7 The Vault \u2014 governed actions",readsAs:"Depth is time in the rendered view: the corridor states how far back the record is readable at all, a cluster of blocked actions in one afternoon reads as a stack at one depth, and a withheld record is visibly present without being readable. This table carries every record and every verdict; what it cannot carry is the shape.",notices:["SYNTHETIC RECORDS \u2014 the shape is deliberate, the values are not measurements."],columns:[{key:"when",label:"When",numeric:!0},{key:"verdict",label:"Verdict"},{key:"action",label:"Action"},{key:"actor",label:"Actor"}],rows:tr.map(e=>({when:e.hoursAgo<24?`${e.hoursAgo} h ago`:`${(e.hoursAgo/24).toFixed(1)} d ago`,verdict:e.verdict,action:e.verdict==="WITHHELD"?null:e.action,actor:e.verdict==="WITHHELD"?null:e.actor}))});er=rr;lt.length>0&&ve(`BAD_PARAM: ${lt.join(", ")} \u2014 not a number, so the view was not drawn rather than drawn at a nonsensical size. Nothing about the underlying measurements has changed; correct the URL and reload.`);K.get("refuse")==="1"&&ve("FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. The three-dimensional view is not being drawn.");var Re=we(q,{alpha:!1});Se(Re)||ve(`stage: ${Re.code} \u2014 ${Re.reason}`);var w=Re,T=w.gl,Or=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Ur=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${Ce}
${Be}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,Cr=C("present",w.compile(Or,Ur)),nt=C("lit",et(w)),Te=C("target",Ye(w,_,S)),mt=C("shadow",Ke(w,xe(bt,1536))),Gt=C("ao",rt(w,_,S)),xt=12,ae=.62,oe=.4,nr=.05,j=1.34,Br=0,Ir=.78,or=13,ie=Et?Math.log(20)/26:0,Gr=3.4,ar=e=>-(e/xt)-Gr,kr=oe+.1,kt=4,ce=44,re=-ce/2+3,ir=k(6,.12,ce),sr=k(.22,3,ce),ur=k(2*j+.44,.18,ce),lr=k(2*j+.44,3,.2),cr=k(ae,oe,nr),Hr=C("floor",V(w,ir)),Ht=C("wall",V(w,sr)),Vr=C("ceiling",V(w,ur)),Wr=C("end wall",V(w,lr)),zr=C("record",V(w,cr)),ne=new Float32Array([1,0,0,0,1,0,0,0,1]),jr=e=>new Float32Array([e[0],e[1],e[2],e[4],e[5],e[6],e[8],e[9],e[10]]),W=(e,n,r,t=0)=>{let o=fe(),a=Math.cos(t),i=Math.sin(t);return o[0]=a,o[2]=-i,o[8]=i,o[10]=a,o[12]=e,o[13]=n,o[14]=r,o},se={target:[0,.8,-9],distance:8.6,azimuthDeg:0,elevationDeg:3.5,fovDeg:33},U=ye(se),Vt=.42,Wt=j-.2,zt=[{z:1/0,tier:-1},{z:1/0,tier:-1}],D=tr.map((e,n)=>{let r=n%2===0,t=r?0:1,o=r?-Wt:Wt,a=ar(e.hoursAgo),l=Math.atan2(U[0]-o,U[2]-a)*Vt+(r?1:-1)*(Math.PI/2)*(1-Vt),u=zt[t],s=Math.abs(a-u.z)<ae*1.05,c=s?(u.tier+1)%kt:0,d=s&&u.tier+1>=kt;zt[t]={z:a,tier:c};let m=Ir+c*kr;return{...e,i:n,left:r,x:o,y:m,yaw:l,z:a,tier:c,tierOverflow:d,distance:0}});for(let e of D)e.distance=Math.hypot(e.x-U[0],e.y-U[1],e.z-U[2]);var $r={ALLOWED:{hex:"#2C6BFF",roughness:.36,metalness:.06},BLOCKED:{hex:"#C9552B",roughness:.42,metalness:.05},WITHHELD:{hex:"#5C6880",roughness:.3,metalness:.55}},ot=[{mesh:Hr,model:W(0,Br-.06,re),normalMat:ne,material:{baseColour:N("#080C15"),roughness:.84,metalness:0}},{mesh:Ht,model:W(-j,1.5,re),normalMat:ne,material:{baseColour:N("#141F35"),roughness:.62,metalness:.03}},{mesh:Ht,model:W(j,1.5,re),normalMat:ne,material:{baseColour:N("#141F35"),roughness:.62,metalness:.03}},{mesh:Vr,model:W(0,2.86,re),normalMat:ne,material:{baseColour:N("#0A101C"),roughness:.8,metalness:0}},{mesh:Wr,model:W(0,1.5,re-ce/2),normalMat:ne,material:{baseColour:N("#0B1220"),roughness:.86,metalness:0}},...D.map(e=>{let n=$r[e.verdict];return{mesh:zr,model:W(e.x,e.y,e.z,e.yaw),normalMat:jr(W(e.x,e.y,e.z,e.yaw)),material:{baseColour:N(n.hex),roughness:n.roughness,metalness:n.metalness}}})],dr=[.34,-.42,-.84],jt=[-2.2,0,-26],$t=[2.2,3.4,3],Xt=$e({direction:dr,colour:[1,1,1],extent:11},Qe(jt,$t),Xe(jt,$t)),Xr=H(ir)+2*H(sr)+H(ur)+H(lr)+D.length*H(cr),{near:Qr,far:Yr}=je(se);function ft(){let e=ge(se,_/S);nt.shadowPass(Xt,ot,mt),Te.bind();let n=N("#0B1220");T.clearColor(n[0],n[1],n[2],1),T.clear(T.COLOR_BUFFER_BIT|T.DEPTH_BUFFER_BIT),nt.depthPrepass(e,ot),dt&&(Gt.compute({depthTexture:Te.depthTexture,near:Qr,far:Yr,fovDeg:se.fovDeg??46,aspect:_/S,radius:.42,strength:1.35}),Te.bind()),nt.draw({viewProj:e,eye:U,lightDir:dr,lightColour:[3,2.95,2.85],ambientGain:.46,lightVP:Xt,shadow:mt,shadowStrength:.94,draws:ot,ao:dt?Gt.texture:null,screenSize:[_,S],fog:ie>0?{density:ie,height:6,floor:0,colour:N("#0B1220")}:null}),T.bindFramebuffer(T.FRAMEBUFFER,null),T.viewport(0,0,_,S),T.disable(T.DEPTH_TEST),T.activeTexture(T.TEXTURE0),T.bindTexture(T.TEXTURE_2D,Te.texture),w.blit(Cr,r=>T.uniform1i(T.getUniformLocation(r,"uScene"),0))}function Kr(e){ft();let n=new Uint8Array(4);T.readPixels(0,0,1,1,T.RGBA,T.UNSIGNED_BYTE,n);let r=performance.now();for(let t=0;t<e;t++)ft();return T.readPixels(0,0,1,1,T.RGBA,T.UNSIGNED_BYTE,n),(performance.now()-r)/e}var at=Kr(Math.max(1,Zt)),mr=ge(se,_/S),ue=_/I,le=S/I,Me=document.createElement("div");Me.style.cssText=`position:relative;overflow:hidden;width:${ue}px;height:${le}px`;q.parentNode?.insertBefore(Me,q);Me.appendChild(q);var J=document.createElement("div");J.style.cssText="position:absolute;inset:0;pointer-events:none";Me.appendChild(J);var yt=e=>ie<=0?0:1-Math.exp(-ie*e),Le=(e,n,r)=>{let t=o=>{let a=o/255;return a<=.03928?a/12.92:((a+.055)/1.055)**2.4};return .2126*t(e)+.7152*t(n)+.0722*t(r)},fr=(e,n)=>(Math.max(e,n)+.05)/(Math.min(e,n)+.05),hr=(e,n,r,t)=>{let o=Math.max(0,Math.min(_-1,Math.round((e-r)*I))),a=Math.max(o,Math.min(_-1,Math.round((e+r)*I))),i=Math.max(0,Math.min(S-1,Math.round((n-t)*I))),l=Math.max(i,Math.min(S-1,Math.round((n+t)*I))),u=a-o+1,s=l-i+1,c=new Uint8Array(4*u*s);T.readPixels(o,S-1-l,u,s,T.RGBA,T.UNSIGNED_BYTE,c);let d=[0,0,0],m=-1;for(let h=0;h<u*s;h++){let y=c[h*4],f=c[h*4+1],b=c[h*4+2],R=Le(y,f,b);R>m&&(m=R,d=[y,f,b])}return d},pr=(e,n,r)=>Le(e[0]+r*(n[0]-e[0]),e[1]+r*(n[1]-e[1]),e[2]+r*(n[2]-e[2])),de=4.5,ht=190,it=[],Qt=(e,n,r)=>{let t=0;for(let o=0;o<4;o++){let a=e[o],i=e[(o+1)%4],l=(i.x-a.x)*(r-a.y)-(i.y-a.y)*(n-a.x);if(Math.abs(l)<1e-9)continue;let u=l>0?1:-1;if(t===0)t=u;else if(u!==t)return!1}return!0},qr=e=>e<24?`${e}h ago`:`${(e/24).toFixed(e<72?1:0)}d ago`,Jr=[255,255,255],br=[{css:"font:600 9px/1 ui-monospace,monospace;letter-spacing:.15em",opacity:1,text:e=>`${e.verdict} \xB7 ${qr(e.hoursAgo)}`},{css:"font:700 11px/1.05 ui-monospace,monospace",opacity:1,text:e=>e.action},{css:"font:400 10.5px/1.2 ui-monospace,monospace",opacity:1,text:e=>e.actor}],gt=[...D].sort((e,n)=>e.distance-n.distance).map(e=>{let n=e.verdict==="WITHHELD",r=e.distance>or,t=Math.round(ae*ht),o=Math.round(oe*ht),a=ke(e.x,e.z,e.y-oe/2,ae,oe,e.yaw,nr/2+.004),i=Ge(mr,a,ue,le,t,o),l=B(i)?i.refusal:null,u=!B(i)&&i.signedArea<=0,s=B(i)?0:Math.max(Math.hypot(i.screen[0].x-i.screen[1].x,i.screen[0].y-i.screen[1].y),Math.hypot(i.screen[3].x-i.screen[2].x,i.screen[3].y-i.screen[2].y)),c=s<26,d=B(i)?0:i.screen.filter(x=>it.some(E=>Qt(E,x.x,x.y))).length+it.reduce((x,E)=>x+E.filter(A=>Qt(i.screen.map(F=>({x:F.x,y:F.y})),A.x,A.y)).length,0),m=d>=2,h=1-.75*yt(e.distance),y=B(i)?null:(()=>{let x=i.screen.map(Z=>Z.x),E=i.screen.map(Z=>Z.y),[A,F]=[Math.min(...x),Math.max(...x)],[O,P]=[Math.min(...E),Math.max(...E)],M=(A+F)/2,v=(O+P)/2;return M<0||M>ue||v<0||v>le?null:{cx:M,cy:v,hx:Math.max(1,(F-A)/4),hy:Math.max(1,(P-O)/4)}})(),f=y?hr(y.cx,y.cy,y.hx,y.hy):null,b=f?br.map(x=>Number(fr(pr(f,Jr,x.opacity*h),Le(f[0],f[1],f[2])).toFixed(2))):null,R=b?Math.min(...b):null,p=R===null||R<de,g=!l&&!u&&!n&&!r&&!c&&!p&&!m;return g&&!B(i)&&it.push(i.screen.map(x=>({x:x.x,y:x.y}))),{p:e,proj:i,shown:g,ew:t,eh:o,opacity:h,refusal:l,backFacing:u,withheld:n,tooFar:r,edgeOn:c,occluded:m,widthPx:s,coveredCorners:d,textRatios:b,minTextRatio:R}});for(let e of[...gt].sort((n,r)=>r.p.distance-n.p.distance)){let{p:n,proj:r,shown:t,ew:o,eh:a,opacity:i}=e;if(t&&!B(r)){let l=document.createElement("div");l.style.cssText=`position:absolute;left:0;top:0;width:${o}px;height:${a}px;transform-origin:0 0;transform:${r.transform};display:flex;flex-direction:column;justify-content:center;gap:5px;padding:0 5px;overflow:hidden;opacity:${i.toFixed(3)};-webkit-font-smoothing:antialiased`;for(let u of br){let s=document.createElement("div");s.style.cssText=`${u.css};color:#fff;opacity:${u.opacity}`,s.textContent=u.text(n),l.appendChild(s)}J.appendChild(l)}}var z=gt.map(({p:e,shown:n,refusal:r,backFacing:t,withheld:o,tooFar:a,edgeOn:i,widthPx:l,coveredCorners:u,textRatios:s,minTextRatio:c})=>({i:e.i,verdict:e.verdict,hoursAgo:e.hoursAgo,distance:Number(e.distance.toFixed(2)),fog:Number(yt(e.distance).toFixed(3)),widthPx:Math.round(l),coveredCorners:u,textRatios:s,minTextRatio:c,shown:n,hiddenBecause:n?null:o?"WITHHELD":r||(t?"BACK_FACING":i?"EDGE_ON":a?"BEYOND_LEGIBLE_RANGE":c===null?"CONTRAST_UNMEASURABLE":c<de?"BELOW_READABLE_CONTRAST":"OCCLUDED")})),Er=Math.max(0,...z.filter(e=>e.shown).map(e=>e.hoursAgo)),xr=Math.max(0,...gt.filter(e=>!e.tooFar).map(e=>e.p.hoursAgo)),yr=Math.max(...D.map(e=>e.hoursAgo)),Tt=document.createElement("div");Tt.style.cssText="position:absolute;left:18px;top:16px;display:flex;flex-direction:column;gap:7px";Tt.innerHTML=`<div style="font:600 11px/1 ui-monospace,monospace;letter-spacing:.16em;color:#8FB7FF">GOVERNED ACTIONS \xB7 DEPTH IS TIME</div><div style="font:400 10.5px/1.5 ui-monospace,monospace;color:rgba(196,212,240,0.84)">READABLE TO ${(Er/24).toFixed(1)} d \u2014 MEASURED AT ${de}:1<br>IN RANGE TO ${(xr/24).toFixed(1)} d (GEOMETRY) &nbsp;\xB7&nbsp; VISIBLE TO ${(yr/24).toFixed(1)} d<br>${xt} h PER METRE &nbsp;\xB7&nbsp; ${Et?"FOG ON":"FOG OFF \u2014 reading limit NOT shown"}</div><div style="font:500 10px/1.4 ui-monospace,monospace;color:#E0A94A">SYNTHETIC RECORDS</div>`;J.appendChild(Tt);var Fe={ALLOWED:D.filter(e=>e.verdict==="ALLOWED").length,BLOCKED:D.filter(e=>e.verdict==="BLOCKED").length,WITHHELD:D.filter(e=>e.verdict==="WITHHELD").length},At=document.createElement("div");At.style.cssText="position:absolute;right:18px;bottom:16px;display:flex;flex-direction:column;gap:6px;align-items:flex-end;font:500 10.5px/1 ui-monospace,monospace";At.innerHTML=[["#2C6BFF",`ALLOWED \xB7 ${Fe.ALLOWED}`],["#C9552B",`BLOCKED \xB7 ${Fe.BLOCKED}`],["#5C6880",`WITHHELD \xB7 ${Fe.WITHHELD} (present, unreadable)`]].map(([e,n])=>`<div style="display:flex;align-items:center;gap:7px;color:rgba(196,212,240,0.85)"><span>${n}</span><span style="width:11px;height:11px;background:${e};display:inline-block;forced-color-adjust:none"></span></div>`).join("");J.appendChild(At);var Ae=[196,212,240],Yt=.85,st=[1,3,7,14].map(e=>{let n=ar(e*24),r=te(mr,[-j+.3,.035,n],ue,le),t=yt(Math.hypot(U[0]+j-.3,U[1]-.035,U[2]-n)),o=!r.behind&&r.sx>0&&r.sx<ue&&r.sy>0&&r.sy<le,a=o?hr(r.sx,r.sy,13,7):null,i=a?Number(fr(pr(a,Ae,Yt),Le(a[0],a[1],a[2])).toFixed(2)):null;if(o){let l=document.createElement("div");l.style.cssText=`position:absolute;left:${r.sx.toFixed(1)}px;top:${r.sy.toFixed(1)}px;transform:translate(-50%,-50%);font:500 10px/1 ui-monospace,monospace;letter-spacing:.08em;color:rgba(${Ae[0]},${Ae[1]},${Ae[2]},${Yt});white-space:nowrap`,l.textContent=`${e}d`,J.appendChild(l)}return{days:e,sx:Math.round(r.sx),sy:Math.round(r.sy),fog:Number(t.toFixed(3)),onFrame:o,ratio:i,readable:i!==null&&i>=de}}),gr=(()=>{let e=T.getExtension("WEBGL_debug_renderer_info");return e?String(T.getParameter(e.UNMASKED_RENDERER_WEBGL)):"unknown"})(),ut=/swiftshader|llvmpipe|software/i.test(gr),pt=Ie();if(pt.length>0){let e="BRAND FIDELITY FAILED \u2014 "+pt.map(r=>`${r.key}: expected ${r.expected}, got ${r.actual}`).join("; ");document.title="REFUSED";let n=document.getElementById("log");throw n&&(n.textContent=e),new Error(e)}var Tr={paramClamps:qt,tier:ct.tier,tierDprScale:ct.dprScale,tierShadowMapSize:xe(bt,1536),shadowBaseline:1536,brandFidelity:pt,ao:dt,fog:Et,fogDensity:Number(ie.toFixed(4)),hoursPerMetre:xt,legibleMetres:or,hdr:w.hdr,eye:U.map(e=>Number(e.toFixed(2))),readableToDays:Number((Er/24).toFixed(2)),readableThreshold:de,inRangeToDays:Number((xr/24).toFixed(2)),visibleToDays:Number((yr/24).toFixed(2)),worstShownTextRatio:(()=>{let e=z.filter(n=>n.shown).map(n=>n.minTextRatio??0);return e.length>0?Math.min(...e):null})(),records:D.length,actionOverflow:D.filter(e=>e.action.length*6.6>ae*ht-10).map(e=>e.action),tiersUsed:Math.max(...D.map(e=>e.tier))+1,tierOverflows:D.filter(e=>e.tierOverflow).length,counts:Fe,shown:z.filter(e=>e.shown).length,hiddenBy:z.filter(e=>!e.shown).reduce((e,n)=>{let r=n.hiddenBecause??"UNKNOWN";return e[r]=(e[r]??0)+1,e},{}),fogNearest:Math.min(...z.map(e=>e.fog)),fogFurthest:Math.max(...z.map(e=>e.fog)),rulerTicks:st,rulerOffFrame:st.filter(e=>!e.onFrame).length,rulerTicksUnreadable:st.filter(e=>!e.readable).map(e=>({days:e.days,ratio:e.ratio})),perRecord:z,glError:T.getError(),triangles:Xr,shadowMap:mt.size,resolution:`${_}x${S}`,dprScale:I,frames:Zt,msPerFrame:Number(at.toFixed(3)),fps:Math.round(1e3/at),renderer:gr,rendererClass:ut?"software":"hardware",headroom:ut?null:Number((16.6-at).toFixed(3)),headroomRefusal:ut?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null,hardwareMsPerFrame:null};globalThis.E6=Tr;var{perRecord:Kt,rulerTicks:co,...Zr}=Tr;Nr.textContent=JSON.stringify(Zr,null,2)+`

perRecord (${Kt.length}, full detail on globalThis.E6):
`+Kt.map(e=>`  #${String(e.i).padStart(2)} ${e.verdict.padEnd(9)} ${String(e.hoursAgo).padStart(4)}h ${String(e.distance).padStart(6)}m fog ${e.fog.toFixed(3)} ${e.shown?"SHOWN":`hidden: ${e.hiddenBecause}`}`).join(`
`);ft();rr.markRendered();document.title="READY";

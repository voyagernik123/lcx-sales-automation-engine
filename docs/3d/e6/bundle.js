var Mt={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected.",FEEDBACK_LOOP:"A layer of this view was asked to read the surface it draws into, which every driver refuses, so the layer is not being drawn. This is a defect in the renderer, not in the data."};function w(e,n){return n===void 0?{kind:"refused",code:e,reason:Mt[e]}:{kind:"refused",code:e,reason:Mt[e],detail:n}}var Fr=3,Mr=24e5;function De(e){return e.kind==="stage"}function Ne(e,n={}){let r=e.getContext("webgl2",{antialias:n.antialias??!1,alpha:n.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!r)return w("NO_WEBGL2");let t=r.getExtension("EXT_color_buffer_float"),a=e.width,o=e.height,i=t?r.RGBA16F:r.RGBA8,u=t?r.HALF_FLOAT:r.UNSIGNED_BYTE,l=(h,E)=>{let y=r.createTexture();r.bindTexture(r.TEXTURE_2D,y),r.texImage2D(r.TEXTURE_2D,0,i,h,E,0,r.RGBA,u,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE);let T=r.createFramebuffer();r.bindFramebuffer(r.FRAMEBUFFER,T),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,y,0);let A=r.checkFramebufferStatus(r.FRAMEBUFFER);return A!==r.FRAMEBUFFER_COMPLETE?w("FRAMEBUFFER_INCOMPLETE",`status 0x${A.toString(16)} at ${h}\xD7${E}`):{texture:y,framebuffer:T,width:h,height:E}},s=n.bloomShift??2,c={w:a,h:o},m=(h,E)=>({scene:l(h,E),bloomA:l(Math.max(1,h>>s),Math.max(1,E>>s)),bloomB:l(Math.max(1,h>>s),Math.max(1,E>>s)),texels:h*E}),f=h=>{for(let E of[h.scene,h.bloomA,h.bloomB])"kind"in E||(r.deleteFramebuffer(E.framebuffer),r.deleteTexture(E.texture))},p=new Map,x=`${a}x${o}`,d=m(a,o);for(let h of[d.scene,d.bloomA,d.bloomB])if("kind"in h)return f(d),h;p.set(x,d);let b=()=>{let h=p.size-1,E=0;for(let[y,T]of p)y!==x&&(E+=T.texels);for(let[y,T]of p){if(h<=Fr&&E<=Mr)return;y!==x&&(p.delete(y),f(T),h-=1,E-=T.texels)}},g=r.createVertexArray();r.bindVertexArray(g);let M=r.createBuffer();r.bindBuffer(r.ARRAY_BUFFER,M),r.bufferData(r.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),r.STATIC_DRAW),r.enableVertexAttribArray(0),r.vertexAttribPointer(0,2,r.FLOAT,!1,0,0),r.bindVertexArray(null);let L=[];return{kind:"stage",gl:r,cssWidth:e.clientWidth||a,cssHeight:e.clientHeight||o,hdr:!!t,get width(){return c.w},get height(){return c.h},get scene(){return d.scene},get bloomA(){return d.bloomA},get bloomB(){return d.bloomB},setRegion(h,E){let y=Math.max(1,Math.round(h)),T=Math.max(1,Math.round(E));if(y===c.w&&T===c.h)return;c={w:y,h:T};let A=`${y}x${T}`,F=p.get(A);if(F){p.delete(A),p.set(A,F),d=F,x=A;return}d=m(y,T),x=A,p.set(A,d),b()},compile(h,E){let y=(S,H)=>{let k=r.createShader(S);if(r.shaderSource(k,H),r.compileShader(k),!r.getShaderParameter(k,r.COMPILE_STATUS)){let _e=r.getShaderInfoLog(k)??"(no log)";return r.deleteShader(k),w("SHADER_COMPILE_FAILED",_e)}return k},T=y(r.VERTEX_SHADER,h);if(typeof T=="object"&&"kind"in T)return T;let A=y(r.FRAGMENT_SHADER,E);if(typeof A=="object"&&"kind"in A)return r.deleteShader(T),A;let F=r.createProgram();if(r.attachShader(F,T),r.attachShader(F,A),r.linkProgram(F),!r.getProgramParameter(F,r.LINK_STATUS)){let S=r.getProgramInfoLog(F)??"(no log)";return r.deleteShader(T),r.deleteShader(A),r.deleteProgram(F),w("PROGRAM_LINK_FAILED",S)}return r.detachShader(F,T),r.detachShader(F,A),r.deleteShader(T),r.deleteShader(A),L.push(F),F},bindTarget(h){r.bindFramebuffer(r.FRAMEBUFFER,h?h.framebuffer:null),r.viewport(0,0,h?h.width:c.w,h?h.height:c.h)},blit(h,E){r.useProgram(h),r.bindVertexArray(g),E?.(h),r.drawArrays(r.TRIANGLES,0,3),r.bindVertexArray(null)},dispose(){for(let E of L)r.deleteProgram(E);for(let E of p.values())f(E);if(p.clear(),r.deleteBuffer(M),r.deleteVertexArray(g),e.isConnected)return;let h=r.getExtension("WEBGL_lose_context");h!==null&&typeof h.loseContext=="function"&&h.loseContext()}}}var he=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function pe(e,n){let r=new Float32Array(16);for(let t=0;t<4;t++)for(let a=0;a<4;a++){let o=0;for(let i=0;i<4;i++)o+=e[i*4+a]*n[t*4+i];r[t*4+a]=o}return r}var be=(e,n)=>[e[0]-n[0],e[1]-n[1],e[2]-n[2]],fe=(e,n)=>e[0]*n[0]+e[1]*n[1]+e[2]*n[2],Pe=(e,n)=>[e[1]*n[2]-e[2]*n[1],e[2]*n[0]-e[0]*n[2],e[0]*n[1]-e[1]*n[0]];function te(e){let n=Math.hypot(e[0],e[1],e[2]);return n===0?e:[e[0]/n,e[1]/n,e[2]/n]}function Oe(e,n,r,t){let a=1/Math.tan(e/2);return new Float32Array([a/n,0,0,0,0,a,0,0,0,0,(t+r)/(r-t),-1,0,0,2*t*r/(r-t),0])}function Ce(e,n,r,t,a,o){let i=n-e,u=t-r,l=o-a;return new Float32Array([2/i,0,0,0,0,2/u,0,0,0,0,-2/l,0,-(n+e)/i,-(t+r)/u,-(o+a)/l,1])}function Ee(e,n,r){let t=te(be(e,n)),a=Pe(r,t);if(Math.hypot(a[0],a[1],a[2])<1e-8)return he();let o=te(a),i=Pe(t,o);return new Float32Array([o[0],i[0],t[0],0,o[1],i[1],t[1],0,o[2],i[2],t[2],0,-fe(o,e),-fe(i,e),-fe(t,e),1])}function Lt(e,n){let r=[0,1,2,3].map(a=>e[0+a]*n[0]+e[4+a]*n[1]+e[8+a]*n[2]+e[12+a]),t=r[3];return{x:r[0]/t,y:r[1]/t,z:r[2]/t,w:t}}function re(e,n,r,t){let a=Lt(e,n);return{sx:(a.x*.5+.5)*r,sy:(1-(a.y*.5+.5))*t,behind:a.w<=0}}function St(e){return e<=.04045?e/12.92:Math.pow((e+.055)/1.055,2.4)}function Be(e){return e<=.0031308?e*12.92:1.055*Math.pow(e,1/2.4)-.055}var Lr=/^#?([0-9a-fA-F]{6})$/;function O(e){let n=Lr.exec(e.trim());if(!n)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(e)}`);let r=n[1];return[0,2,4].map(t=>St(parseInt(r.slice(t,t+2),16)/255))}function Ue(e){return`#${e.map(r=>{let t=Be(Math.min(1,Math.max(0,r)));return Math.round(t*255).toString(16).padStart(2,"0")}).join("")}`}var Y={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},Ie=Object.freeze(Object.fromEntries(Object.keys(Y).map(e=>[e,O(Y[e])])));var wt=.4;var ke=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${wt.toFixed(2)}); }`,Ge=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function He(){let e=[];for(let n of Object.keys(Y)){let r=Y[n].toLowerCase(),t=Ue(Ie[n]).toLowerCase();t!==r&&e.push({key:n,expected:r,actual:t})}return e}function Sr(e){let n=[1/0,1/0,1/0],r=[-1/0,-1/0,-1/0];for(let t=0;t<e.length;t+=3)for(let a=0;a<3;a++){let o=e[t+a];o<n[a]&&(n[a]=o),o>r[a]&&(r[a]=o)}return e.length===0?{min:[0,0,0],max:[0,0,0]}:{min:n,max:r}}function _t(e,n,r,t){let a=new Float32Array(e.length);for(let i=0;i<t.length;i+=3){let u=t[i],l=t[i+1],s=t[i+2],c=u*3,m=l*3,f=s*3,p=u*2,x=l*2,d=s*2,b=e[m]-e[c],g=e[m+1]-e[c+1],M=e[m+2]-e[c+2],L=e[f]-e[c],v=e[f+1]-e[c+1],h=e[f+2]-e[c+2],E=r[x]-r[p],y=r[x+1]-r[p+1],T=r[d]-r[p],A=r[d+1]-r[p+1],F=E*A-T*y;if(Math.abs(F)<1e-12)continue;let S=1/F,H=(b*A-L*y)*S,k=(g*A-v*y)*S,_e=(M*A-h*y)*S;for(let Q of[c,m,f])a[Q]=a[Q]+H,a[Q+1]=a[Q+1]+k,a[Q+2]=a[Q+2]+_e}let o=new Float32Array(e.length);for(let i=0;i<o.length;i+=3){let u=n[i],l=n[i+1],s=n[i+2],c=a[i],m=a[i+1],f=a[i+2],p=c*u+m*l+f*s;c-=u*p,m-=l*p,f-=s*p;let x=Math.hypot(c,m,f);x<1e-8&&(Math.abs(u)<.9?(c=0,m=-s,f=l):(c=-s,m=0,f=u),x=Math.hypot(c,m,f)||1),o[i]=c/x,o[i+1]=m/x,o[i+2]=f/x}return o}function Dt(e,n){let r=new Float32Array(e.length);for(let t=0;t<n.length;t+=3){let a=n[t]*3,o=n[t+1]*3,i=n[t+2]*3,u=e[o]-e[a],l=e[o+1]-e[a+1],s=e[o+2]-e[a+2],c=e[i]-e[a],m=e[i+1]-e[a+1],f=e[i+2]-e[a+2],p=l*f-s*m,x=s*c-u*f,d=u*m-l*c;for(let b of[a,o,i])r[b]=r[b]+p,r[b+1]=r[b+1]+x,r[b+2]=r[b+2]+d}for(let t=0;t<r.length;t+=3){let a=Math.hypot(r[t],r[t+1],r[t+2]);a>0&&(r[t]=r[t]/a,r[t+1]=r[t+1]/a,r[t+2]=r[t+2]/a)}return r}function wr(e,n,r,t,a){let{min:o,max:i}=Sr(e),u=t??Dt(e,r);return{positions:e,normals:u,uvs:n,indices:r,min:o,max:i,tangents:a??_t(e,u,n,r)}}function V(e=1,n=1,r=1){let t=e/2,a=n/2,o=r/2,i=[[[-t,-a,o],[t,-a,o],[t,a,o],[-t,a,o]],[[t,-a,-o],[-t,-a,-o],[-t,a,-o],[t,a,-o]],[[t,-a,o],[t,-a,-o],[t,a,-o],[t,a,o]],[[-t,-a,-o],[-t,-a,o],[-t,a,o],[-t,a,-o]],[[-t,a,o],[t,a,o],[t,a,-o],[-t,a,-o]],[[-t,-a,-o],[t,-a,-o],[t,-a,o],[-t,-a,o]]],u=new Float32Array(72),l=new Float32Array(48),s=new Uint16Array(36),c=0,m=0,f=0,p=0;for(let x of i){for(let[d,b,g]of x)u[c++]=d,u[c++]=b,u[c++]=g;l[m++]=0,l[m++]=0,l[m++]=1,l[m++]=0,l[m++]=1,l[m++]=1,l[m++]=0,l[m++]=1,s[f++]=p,s[f++]=p+1,s[f++]=p+2,s[f++]=p,s[f++]=p+2,s[f++]=p+3,p+=4}return wr(u,l,s)}function W(e){return e.indices.length/3}function _r(e){if(!Number.isFinite(e)||e===0)return"0";let n=e.toFixed(12).replace(/0+$/,"").replace(/\.$/,"");return n==="-0"?"0":n}function Nt(e,n,r,t){let[a,o]=e,[i,u]=n,[l,s]=r,[c,m]=t,f=a-i+l-c,p=o-u+s-m;if(Math.abs(f)<1e-9&&Math.abs(p)<1e-9){let h=[i-a,c-a,a,u-o,m-o,o,0,0,1],E=h[0]*h[4]-h[1]*h[3];return Math.abs(E)<1e-9?null:h}let x=i-l,d=c-l,b=u-s,g=m-s,M=x*g-d*b;if(Math.abs(M)<1e-9)return null;let L=(f*g-d*p)/M,v=(x*p-f*b)/M;return[i-a+L*i,c-a+v*c,a,u-o+L*u,m-o+v*m,o,L,v,1]}function Ve(e,n,r,t,a,o){if(!(a>0)||!(o>0))return{refusal:"EMPTY_ELEMENT_BOX"};let u=[n.topLeft,n.topRight,n.bottomRight,n.bottomLeft].map(S=>re(e,S,r,t));if(u.some(S=>S.behind))return{refusal:"CORNER_BEHIND_CAMERA"};let l=u.map(S=>({x:S.sx,y:S.sy})),[s,c,m,f]=l,p=Nt([s.x,s.y],[c.x,c.y],[m.x,m.y],[f.x,f.y]);if(!p)return{refusal:"DEGENERATE_ON_SCREEN"};let x=.5*(s.x*c.y-c.x*s.y+(c.x*m.y-m.x*c.y)+(m.x*f.y-f.x*m.y)+(f.x*s.y-s.x*f.y)),d=1/a,b=1/o,[g,M,L,v,h,E,y,T,A]=p;return{transform:`matrix3d(${[g*d,v*d,0,y*d,M*b,h*b,0,T*b,0,0,1,0,L,E,0,A].map(_r).join(", ")})`,matrix:p,screen:l,signedArea:x}}function U(e){return"refusal"in e}function We(e,n,r,t,a,o,i=0){let u=Math.cos(o),l=Math.sin(o),s=(m,f)=>[e+u*m+l*i,r+f,n-l*m+u*i],c=t/2;return{topLeft:s(-c,a),topRight:s(c,a),bottomRight:s(c,0),bottomLeft:s(-c,0)}}var Pt=e=>[e.DEPTH_TEST,e.CULL_FACE,e.BLEND];function K(e){return[e.getParameter(e.FRAMEBUFFER_BINDING),e.getParameter(e.VIEWPORT),e.getParameter(e.DEPTH_WRITEMASK),Pt(e).map(n=>e.getParameter(n))]}function q(e,n){e.bindFramebuffer(e.FRAMEBUFFER,n[0]);let r=n[1];e.viewport(r[0]??0,r[1]??0,r[2]??0,r[3]??0),e.depthMask(n[2]),Pt(e).forEach((t,a)=>{n[3][a]?e.enable(t):e.disable(t)})}function xe(e,n){for(let r=n-1;r>=0;r--)e.activeTexture(e.TEXTURE0+r),e.bindTexture(e.TEXTURE_2D,null),e.bindTexture(e.TEXTURE_3D,null);e.activeTexture(e.TEXTURE0)}var je=["minimum","reduced","full"],ze={full:{dprScale:2,ao:!0,dof:!0,shadowMapSize:1536,shadowTaps:9,volumeLightSteps:6},reduced:{dprScale:2,ao:!0,dof:!1,shadowMapSize:1024,shadowTaps:9,volumeLightSteps:4},minimum:{dprScale:1,ao:!1,dof:!1,shadowMapSize:512,shadowTaps:1,volumeLightSteps:1}};function ye(e,n){let r=Number.isFinite(n)&&n>0?n:1024,t=ze[e].shadowMapSize/ze.full.shadowMapSize,a=r*t,o=2**Math.round(Math.log2(a));return Math.max(256,Math.min(r,o))}function $e(e){return{tier:e,...ze[e]}}var Xe=89,Qe=Math.PI/180;function ge(e){let n=Math.max(-Xe,Math.min(Xe,e.elevationDeg))*Qe,r=e.azimuthDeg*Qe,t=Math.max(1e-4,e.distance),a=Math.sin(n)*t,o=Math.cos(n)*t;return[e.target[0]+Math.sin(r)*o,e.target[1]+a,e.target[2]+Math.cos(r)*o]}function Ye(e){let n=e.near??Math.max(.01,e.distance/100),r=e.far??Math.max(n+1,e.distance*8);return{near:n,far:r}}function Te(e,n){let r=ge(e),t=e.near??Math.max(.01,e.distance/100),a=e.far??Math.max(t+1,e.distance*8),o=Oe((e.fovDeg??38)*Qe,Math.max(.001,n),t,a),i=Ee(r,e.target,[0,1,0]);return pe(o,i)}function Ke(e,n,r){let t=te(e.direction),a=e.extent??Math.max(.1,r*1.35),o=Math.max(1,r*2),i=[n[0]-t[0]*o,n[1]-t[1]*o,n[2]-t[2]*o],u=Math.abs(t[1])>.99?[0,0,1]:[0,1,0],l=Ee(i,n,u),s=Ce(-a,a,-a,a,.01,o+r*2+a);return pe(s,l)}function qe(e,n){let r=be([n[0],n[1],n[2]],[e[0],e[1],e[2]]);return Math.hypot(r[0],r[1],r[2])/2}function Je(e,n){return[(e[0]+n[0])/2,(e[1]+n[1])/2,(e[2]+n[2])/2]}function Ze(e,n,r){let{gl:t}=e,a=Math.max(1,Math.floor(n)),o=Math.max(1,Math.floor(r)),i=t.createFramebuffer(),u=t.createTexture(),l=t.createTexture();if(!i||!u||!l)return w("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let s=e.hdr?t.RGBA16F:t.RGBA8,c=e.hdr?t.HALF_FLOAT:t.UNSIGNED_BYTE,m=()=>{t.bindTexture(t.TEXTURE_2D,u),t.texImage2D(t.TEXTURE_2D,0,s,a,o,0,t.RGBA,c,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindTexture(t.TEXTURE_2D,l),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,a,o,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,i),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,u,0),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,l,0),t.bindFramebuffer(t.FRAMEBUFFER,null)};m(),t.bindFramebuffer(t.FRAMEBUFFER,i);let f=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),f!==t.FRAMEBUFFER_COMPLETE?w("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${f.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:u,depthTexture:l,get width(){return a},get height(){return o},bind(){t.bindFramebuffer(t.FRAMEBUFFER,i),t.viewport(0,0,a,o)},resize(p,x){let d=Math.max(1,Math.floor(p)),b=Math.max(1,Math.floor(x));d===a&&b===o||(a=d,o=b,m())},dispose(){t.deleteFramebuffer(i),t.deleteTexture(u),t.deleteTexture(l)}}}function et(e,n=1024){let{gl:r}=e,t=Math.max(256,Math.min(2048,Math.floor(n))),a=r.createFramebuffer(),o=r.createTexture();if(!a||!o)return w("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");r.bindTexture(r.TEXTURE_2D,o),r.texImage2D(r.TEXTURE_2D,0,r.DEPTH_COMPONENT24,t,t,0,r.DEPTH_COMPONENT,r.UNSIGNED_INT,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),r.bindFramebuffer(r.FRAMEBUFFER,a),r.framebufferTexture2D(r.FRAMEBUFFER,r.DEPTH_ATTACHMENT,r.TEXTURE_2D,o,0);let i=r.checkFramebufferStatus(r.FRAMEBUFFER);return r.bindFramebuffer(r.FRAMEBUFFER,null),i!==r.FRAMEBUFFER_COMPLETE?w("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:a,depthTexture:o,size:t,bind(){r.bindFramebuffer(r.FRAMEBUFFER,a),r.viewport(0,0,t,t)},dispose(){r.deleteFramebuffer(a),r.deleteTexture(o)}}}var rt=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,tt={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function Ot(e,n,r={}){let t=r.zenith??tt.zenith,a=r.horizon??tt.horizon,o=r.ground??tt.ground;e.uniform3f(e.getUniformLocation(n,"uSkyZenith"),t[0],t[1],t[2]),e.uniform3f(e.getUniformLocation(n,"uSkyHorizon"),a[0],a[1],a[2]),e.uniform3f(e.getUniformLocation(n,"uSkyGround"),o[0],o[1],o[2])}var En=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${rt}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;var Ct=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,nt=`#version 300 es
precision highp float;
void main(){}`,Dr=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,Bt=`#version 300 es
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
}`,Ut=`#version 300 es
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
uniform int uShadowTaps;
uniform float uShadowBiasScale;

uniform sampler2D uAO;
uniform vec2 uScreenSize;
uniform float uAOEnabled;
uniform float uFogDensity;
uniform float uFogHeight;
uniform vec3 uFogColour;
uniform float uFogFloor;

out vec4 frag;
${rt}

const float PI = 3.14159265359;

float distributionGGX(float NdotH, float rough) {
  float a = rough * rough;
  float a2 = a * a;
  float d = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / max(1e-16, PI * d * d);
}

float distributionGGXAniso(float NdotH, float TdotH, float BdotH, float at, float ab) {
  float a2 = at * ab;
  vec3 v = vec3(ab * TdotH, at * BdotH, a2 * NdotH);
  float v2 = dot(v, v);
  float w2 = a2 / max(1e-16, v2);
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

// Split-sum BRDF integral, analytic (Karis 2014) rather than a LUT. See the note above LIT_FRAG.
vec2 envDFG(float NdotV, float rough) {
  const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
  const vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
  vec4 r = rough * c0 + c1;
  float a004 = min(r.x * r.x, exp2(-9.28 * NdotV)) * r.x + r.y;
  return vec2(-1.04, 1.04) * a004 + r.zw;
}

float shadowFactor(vec3 world, float NdotL) {
  vec4 lc = uLightVP * vec4(world, 1.0);
  vec3 p = lc.xyz / lc.w;
  p = p * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;

  float bias = max(0.0009, 0.0045 * (1.0 - NdotL)) * uShadowBiasScale;
  float ref = p.z - bias;

  // One tap is a HARD EDGE, not a cheaper nine. Two static branches: uShadowTaps is uniform across
  // the draw, so both bodies still unroll. See the note above LIT_FRAG.
  if (uShadowTaps < 9) {
    float d = texture(uShadowMap, p.xy).r;
    return mix(1.0, ref <= d ? 1.0 : 0.0, uShadowStrength);
  }

  float lit = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 off = vec2(float(x), float(y)) * uShadowTexel;
      float d = texture(uShadowMap, p.xy + off).r;
      lit += ref <= d ? 1.0 : 0.0;
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

  // at/ab are ALPHAS and must be derived from alpha, or the two D branches disagree about what the
  // number means and the highlight jumps at aniso = 0. See the note above LIT_FRAG.
  float alpha = rough * rough;
  float at = max(0.002, alpha * (1.0 + aniso));
  float ab = max(0.002, alpha * (1.0 - aniso));

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
  // ENERGY-ACCOUNTED AMBIENT: split-sum weight, multiscatter gain, kd. See the note above LIT_FRAG.
  vec2 dfg = envDFG(NdotV, rough);
  float Ess = dfg.x + dfg.y;
  vec3 specWeight = max(vec3(0.0), f0 * dfg.x + dfg.y);
  vec3 msComp = 1.0 + f0 * (1.0 / max(1e-3, Ess) - 1.0);
  vec3 envDiffuse = skyColour(N) * uBaseColour * (1.0 - specWeight) * (1.0 - uMetalness);
  vec3 envSpecular = skyColour(normalize(mix(R, N, rough * rough))) * specWeight * msComp;
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
}`;function z(e,n){let{gl:r}=e,t=r.createVertexArray(),a=r.createBuffer(),o=r.createBuffer(),i=r.createBuffer(),u=r.createBuffer();return!t||!a||!o||!i||!u?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(r.bindVertexArray(t),r.bindBuffer(r.ARRAY_BUFFER,a),r.bufferData(r.ARRAY_BUFFER,n.positions,r.STATIC_DRAW),r.enableVertexAttribArray(0),r.vertexAttribPointer(0,3,r.FLOAT,!1,0,0),r.bindBuffer(r.ARRAY_BUFFER,o),r.bufferData(r.ARRAY_BUFFER,n.normals,r.STATIC_DRAW),r.enableVertexAttribArray(1),r.vertexAttribPointer(1,3,r.FLOAT,!1,0,0),r.bindBuffer(r.ARRAY_BUFFER,i),r.bufferData(r.ARRAY_BUFFER,n.tangents,r.STATIC_DRAW),r.enableVertexAttribArray(2),r.vertexAttribPointer(2,3,r.FLOAT,!1,0,0),r.bindBuffer(r.ELEMENT_ARRAY_BUFFER,u),r.bufferData(r.ELEMENT_ARRAY_BUFFER,n.indices,r.STATIC_DRAW),r.bindVertexArray(null),{vao:t,indexCount:n.indices.length,indexType:n.indices instanceof Uint32Array?r.UNSIGNED_INT:r.UNSIGNED_SHORT,dispose(){r.deleteVertexArray(t),r.deleteBuffer(a),r.deleteBuffer(o),r.deleteBuffer(i),r.deleteBuffer(u)}})}function ot(e){let{gl:n}=e,r=e.compile(Ct,nt);if("kind"in r)return r;let t=e.compile(Bt,Ut);if("kind"in t)return t;let a=e.compile(Dr,nt);if("kind"in a)return a;let o=(i,u)=>n.getUniformLocation(i,u);return{shadowPass(i,u,l,s){let c=K(n),m=s??(()=>{});l.bind(),m("shadow.bind"),n.clear(n.DEPTH_BUFFER_BIT),n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.FRONT),n.useProgram(r),m("useProgram(shadow)"),n.uniformMatrix4fv(o(r,"uLightVP"),!1,i),m("uLightVP");for(let f of u)n.uniformMatrix4fv(o(r,"uModel"),!1,f.model),m("shadow uModel"),n.bindVertexArray(f.mesh.vao),m("shadow bindVAO"),n.drawElements(n.TRIANGLES,f.mesh.indexCount,f.mesh.indexType,0),m("shadow drawElements");n.bindVertexArray(null),n.cullFace(n.BACK),q(n,c)},depthPrepass(i,u){let l=K(n);n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.colorMask(!1,!1,!1,!1),n.useProgram(a),n.uniformMatrix4fv(o(a,"uViewProj"),!1,i);for(let s of u)n.uniformMatrix4fv(o(a,"uModel"),!1,s.model),n.bindVertexArray(s.mesh.vao),n.drawElements(n.TRIANGLES,s.mesh.indexCount,s.mesh.indexType,0);n.bindVertexArray(null),n.colorMask(!0,!0,!0,!0),q(n,l)},draw(i){let u=K(n),l=i.onStep??(()=>{});if(n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.useProgram(t),n.uniformMatrix4fv(o(t,"uViewProj"),!1,i.viewProj),l("uViewProj"),n.uniform3fv(o(t,"uEye"),i.eye),l("uEye"),n.uniform3fv(o(t,"uLightDir"),i.lightDir),l("uLightDir"),n.uniform3fv(o(t,"uLightColour"),i.lightColour),l("uLightColour"),n.uniform1f(o(t,"uAmbientGain"),i.ambientGain??1),l("uAmbientGain"),i.fog&&i.fog.density>0){n.uniform1f(o(t,"uFogDensity"),i.fog.density),n.uniform1f(o(t,"uFogHeight"),i.fog.height),n.uniform1f(o(t,"uFogFloor"),i.fog.floor??0);let s=i.fog.colour;s==="sky"?n.uniform3f(o(t,"uFogColour"),-1,-1,-1):n.uniform3f(o(t,"uFogColour"),s[0],s[1],s[2]),l("fog")}else n.uniform1f(o(t,"uFogDensity"),0);if(Ot(n,t,i.sky),l("bindSky"),i.ao&&i.screenSize?(n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,i.ao),n.uniform1i(o(t,"uAO"),1),n.uniform2f(o(t,"uScreenSize"),i.screenSize[0],i.screenSize[1]),n.uniform1f(o(t,"uAOEnabled"),1)):n.uniform1f(o(t,"uAOEnabled"),0),l("bindAO"),n.uniformMatrix4fv(o(t,"uLightVP"),!1,i.lightVP),l("lit uLightVP"),i.shadow){n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,i.shadow.depthTexture),n.uniform1i(o(t,"uShadowMap"),0),n.uniform1f(o(t,"uShadowTexel"),1/i.shadow.size),n.uniform1f(o(t,"uShadowStrength"),i.shadowStrength??1),n.uniform1i(o(t,"uShadowTaps"),(i.shadowTaps??9)>=9?9:1);let s=i.shadowBaseline,c=s&&s>0&&i.shadow.size>0?s/i.shadow.size:1;n.uniform1f(o(t,"uShadowBiasScale"),Number.isFinite(c)&&c>0?c:1)}else n.uniform1f(o(t,"uShadowStrength"),0);for(let s of i.draws)n.uniformMatrix4fv(o(t,"uModel"),!1,s.model),n.uniformMatrix3fv(o(t,"uNormalMat"),!1,s.normalMat),l("uNormalMat"),n.uniform3fv(o(t,"uBaseColour"),s.material.baseColour),l("uBaseColour"),n.uniform1f(o(t,"uRoughness"),s.material.roughness),n.uniform1f(o(t,"uMetalness"),s.material.metalness),n.uniform1f(o(t,"uAnisotropy"),s.material.anisotropy??0),n.bindVertexArray(s.mesh.vao),l("lit bindVAO"),n.drawElements(n.TRIANGLES,s.mesh.indexCount,s.mesh.indexType,0),l("lit drawElements");n.bindVertexArray(null),xe(n,2),q(n,u)},dispose(){n.deleteProgram(r),n.deleteProgram(t),n.deleteProgram(a)}}}var at=`
uniform sampler2D uDepth;
uniform vec2 uNearFar;

float linearDepthAt(vec2 uv) {
  float d = texture(uDepth, uv).r * 2.0 - 1.0;
  float n = uNearFar.x, f = uNearFar.y;
  return (2.0 * n * f) / (f + n - d * (f - n));
}`,kt=`
uniform float uTanHalfFov;
uniform float uAspect;

vec3 viewPosAt(vec2 uv) {
  float z = linearDepthAt(uv);
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x * uTanHalfFov * uAspect * z, ndc.y * uTanHalfFov * z, -z);
}`,Gt=at+kt,It=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Nr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${Gt}

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
}`,Pr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${at}

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
}`;function it(e,n,r){let{gl:t}=e,a=e.compile(It,Nr);if("kind"in a)return a;let o=e.compile(It,Pr);if("kind"in o)return o;let i=Math.max(1,n>>1),u=Math.max(1,r>>1),l=()=>{let d=t.createFramebuffer(),b=t.createTexture();return!d||!b?null:{fb:d,tex:b}},s=l(),c=l();if(!s||!c)return w("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let m=()=>{for(let d of[s,c])t.bindTexture(t.TEXTURE_2D,d.tex),t.texImage2D(t.TEXTURE_2D,0,t.R8,i,u,0,t.RED,t.UNSIGNED_BYTE,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,d.fb),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,d.tex,0);t.bindFramebuffer(t.FRAMEBUFFER,null)};m(),t.bindFramebuffer(t.FRAMEBUFFER,s.fb);let f=t.checkFramebufferStatus(t.FRAMEBUFFER);if(t.bindFramebuffer(t.FRAMEBUFFER,null),f!==t.FRAMEBUFFER_COMPLETE)return w("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${f.toString(16)}).`);let p=(d,b,g,M,L)=>{t.activeTexture(t.TEXTURE0+L),t.bindTexture(t.TEXTURE_2D,b),t.uniform1i(t.getUniformLocation(d,"uDepth"),L),t.uniform2f(t.getUniformLocation(d,"uNearFar"),g,M)},x=(d,b,g,M,L,v,h)=>{p(d,b,g,M,h),t.uniform1f(t.getUniformLocation(d,"uTanHalfFov"),Math.tan(L*Math.PI/360)),t.uniform1f(t.getUniformLocation(d,"uAspect"),v)};return{get texture(){return s.tex},get width(){return i},get height(){return u},compute(d){let b=K(t);t.disable(t.DEPTH_TEST),t.depthMask(!1),t.disable(t.BLEND),t.disable(t.CULL_FACE),t.bindFramebuffer(t.FRAMEBUFFER,s.fb),t.viewport(0,0,i,u),t.useProgram(a),x(a,d.depthTexture,d.near,d.far,d.fovDeg,d.aspect,0),t.uniform2f(t.getUniformLocation(a,"uTexel"),1/i,1/u),t.uniform1f(t.getUniformLocation(a,"uRadius"),d.radius??.55),t.uniform1f(t.getUniformLocation(a,"uStrength"),d.strength??1.15),t.uniform1f(t.getUniformLocation(a,"uBias"),d.bias??.035),e.blit(a);for(let[g,M,L]of[[s,c,[1,0]],[c,s,[0,1]]])t.bindFramebuffer(t.FRAMEBUFFER,M.fb),t.viewport(0,0,i,u),t.useProgram(o),p(o,d.depthTexture,d.near,d.far,0),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,g.tex),t.uniform1i(t.getUniformLocation(o,"uAO"),1),t.uniform2f(t.getUniformLocation(o,"uTexel"),1/i,1/u),t.uniform2f(t.getUniformLocation(o,"uDir"),L[0],L[1]),e.blit(o);xe(t,2),q(t,b)},resize(d,b){let g=Math.max(1,d>>1),M=Math.max(1,b>>1);g===i&&M===u||(i=g,u=M,m())},dispose(){t.deleteProgram(a),t.deleteProgram(o);for(let d of[s,c])t.deleteFramebuffer(d.fb),t.deleteTexture(d.tex)}}}var Or=`
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
`;function G(e){return String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function Ht(e){let n=document.createElement("style");n.textContent=Or,document.head.appendChild(n);let r=document.createElement("section");r.id="lcx-fallback",r.setAttribute("aria-label",`${e.title} \u2014 flat view`),r.setAttribute("tabindex","-1"),document.getElementById("log")?.setAttribute("aria-hidden","true");let t=(o,i)=>o===null?`<td class="absent${i?" n":""}">absent</td>`:`<td class="${i?"n":""}">${G(o)}</td>`;r.innerHTML=`<h2>${G(e.title)} \u2014 flat view</h2><p class="reads">${G(e.readsAs)}</p>`+(e.notices??[]).map(o=>`<p class="notice">${G(o)}</p>`).join("")+'<div id="lcx-refusal" role="alert"></div>'+(e.html?`<div class="surface">${e.html}</div>`:`<table><caption>${G(e.title)} \u2014 flat view</caption><thead><tr>`+e.columns.map(o=>`<th scope="col" class="${o.numeric?"n":""}">${G(o.label)}</th>`).join("")+"</tr></thead><tbody>"+e.rows.map(o=>"<tr>"+e.columns.map(i=>t(o[i.key]??null,!!i.numeric)).join("")+"</tr>").join("")+"</tbody></table>"),document.body.appendChild(r);function a(o,i){let u=document.getElementById("lcx-refusal");u&&(u.innerHTML=`<p class="refusal"><strong>${G(o)}</strong> \u2014 ${G(i)} The measurements below are unaffected.</p>`),delete r.dataset.rendered;for(let l of Array.from(document.querySelectorAll("canvas")))l.style.display="none";r.focus({preventScroll:!0})}return document.addEventListener("webglcontextlost",o=>{o.preventDefault(),a("CONTEXT_LOST","The GPU dropped the WebGL context for this page mid-session.")},!0),{markRendered(){r.dataset.rendered="1"},showRefusal:a}}var J=new URLSearchParams(location.search),ft=[],er=[];function tr(e,n,r,t){let a=J.get(e);if(a===null)return n;let o=Number(a);if(!Number.isFinite(o))return ft.push(`${e}=${a}`),n;let i=Math.max(r,Math.min(t,o));return i!==o&&er.push(`${e}=${a} used as ${i}`),i}var yt=je.includes(J.get("tier")??"")?J.get("tier"):"full",Me=$e(yt),ht=J.get("ao")!=="0"&&Me.ao,gt=J.get("fog")!=="0",I=tr("scale",1,1,3),rr=Math.trunc(tr("frames",300,1,2e4)),N=1200*I,_=720*I,Z=document.getElementById("c");Z.width=N;Z.height=_;var Cr=document.getElementById("log");function Le(e){document.title="REFUSED";let n=document.getElementById("log");n&&(n.textContent=e);let[r,...t]=e.split(":");throw nr?.showRefusal(r?.trim()??"REFUSED",t.join(":").trim()||e),new Error(e)}var nr=null;function B(e,n){return"kind"in n&&Le(`${e}: ${n.code} \u2014 ${n.reason} ${n.detail??""}`),n}var or=[{hoursAgo:3,actor:"n.sharma",action:"campaign.publish",verdict:"ALLOWED"},{hoursAgo:9,actor:"n.sharma",action:"budget.raise",verdict:"ALLOWED"},{hoursAgo:14,actor:"svc.payagent",action:"x402.settle",verdict:"ALLOWED"},{hoursAgo:26,actor:"a.reiter",action:"listing.approve",verdict:"ALLOWED"},{hoursAgo:31,actor:"svc.operator",action:"memo.generate",verdict:"ALLOWED"},{hoursAgo:44,actor:"j.kohler",action:"compartment.read",verdict:"BLOCKED"},{hoursAgo:45,actor:"j.kohler",action:"compartment.read",verdict:"BLOCKED"},{hoursAgo:46,actor:"j.kohler",action:"export.bulk",verdict:"BLOCKED"},{hoursAgo:47,actor:"j.kohler",action:"export.bulk",verdict:"BLOCKED"},{hoursAgo:58,actor:"svc.payagent",action:"x402.settle",verdict:"ALLOWED"},{hoursAgo:70,actor:"\u2014",action:"\u2014",verdict:"WITHHELD"},{hoursAgo:83,actor:"a.reiter",action:"quest.close",verdict:"ALLOWED"},{hoursAgo:95,actor:"n.sharma",action:"rfi.extract",verdict:"ALLOWED"},{hoursAgo:110,actor:"\u2014",action:"\u2014",verdict:"WITHHELD"},{hoursAgo:128,actor:"svc.operator",action:"sat.gate",verdict:"BLOCKED"},{hoursAgo:141,actor:"a.reiter",action:"listing.approve",verdict:"ALLOWED"},{hoursAgo:163,actor:"n.sharma",action:"campaign.draft",verdict:"ALLOWED"},{hoursAgo:190,actor:"svc.payagent",action:"x402.settle",verdict:"ALLOWED"},{hoursAgo:214,actor:"\u2014",action:"\u2014",verdict:"WITHHELD"},{hoursAgo:246,actor:"a.reiter",action:"quest.close",verdict:"ALLOWED"},{hoursAgo:280,actor:"n.sharma",action:"budget.raise",verdict:"ALLOWED"},{hoursAgo:320,actor:"svc.operator",action:"memo.generate",verdict:"ALLOWED"},{hoursAgo:366,actor:"j.kohler",action:"compartment.read",verdict:"BLOCKED"},{hoursAgo:410,actor:"a.reiter",action:"listing.approve",verdict:"ALLOWED"},{hoursAgo:462,actor:"n.sharma",action:"campaign.publish",verdict:"ALLOWED"}],ar=Ht({title:"E6 \xB7 The Vault \u2014 governed actions",readsAs:"Depth is time in the rendered view: the corridor states how far back the record is readable at all, a cluster of blocked actions in one afternoon reads as a stack at one depth, and a withheld record is visibly present without being readable. This table carries every record and every verdict; what it cannot carry is the shape.",notices:["SYNTHETIC RECORDS \u2014 the shape is deliberate, the values are not measurements."],columns:[{key:"when",label:"When",numeric:!0},{key:"verdict",label:"Verdict"},{key:"action",label:"Action"},{key:"actor",label:"Actor"}],rows:or.map(e=>({when:e.hoursAgo<24?`${e.hoursAgo} h ago`:`${(e.hoursAgo/24).toFixed(1)} d ago`,verdict:e.verdict,action:e.verdict==="WITHHELD"?null:e.action,actor:e.verdict==="WITHHELD"?null:e.actor}))});nr=ar;ft.length>0&&Le(`BAD_PARAM: ${ft.join(", ")} \u2014 not a number, so the view was not drawn rather than drawn at a nonsensical size. Nothing about the underlying measurements has changed; correct the URL and reload.`);J.get("refuse")==="1"&&Le("FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. The three-dimensional view is not being drawn.");var ve=Ne(Z,{alpha:!1});De(ve)||Le(`stage: ${ve.code} \u2014 ${ve.reason}`);var D=ve,R=D.gl,Br=`#version 300 es
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
${ke}
${Ge}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,Ir=B("present",D.compile(Br,Ur)),st=B("lit",ot(D)),Ae=B("target",Ze(D,N,_)),pt=B("shadow",et(D,ye(yt,1536))),Vt=B("ao",it(D,N,_)),Tt=12,ie=.62,ae=.4,ir=.05,X=1.34,kr=0,Gr=.78,sr=13,se=gt?Math.log(20)/26:0,Hr=3.4,ur=e=>-(e/Tt)-Hr,Vr=ae+.1,Wt=4,de=44,ne=-de/2+3,lr=V(6,.12,de),cr=V(.22,3,de),dr=V(2*X+.44,.18,de),mr=V(2*X+.44,3,.2),fr=V(ie,ae,ir),Wr=B("floor",z(D,lr)),zt=B("wall",z(D,cr)),zr=B("ceiling",z(D,dr)),jr=B("end wall",z(D,mr)),$r=B("record",z(D,fr)),oe=new Float32Array([1,0,0,0,1,0,0,0,1]),Xr=e=>new Float32Array([e[0],e[1],e[2],e[4],e[5],e[6],e[8],e[9],e[10]]),j=(e,n,r,t=0)=>{let a=he(),o=Math.cos(t),i=Math.sin(t);return a[0]=o,a[2]=-i,a[8]=i,a[10]=o,a[12]=e,a[13]=n,a[14]=r,a},ue={target:[0,.8,-9],distance:8.6,azimuthDeg:0,elevationDeg:3.5,fovDeg:33},C=ge(ue),jt=.42,$t=X-.2,Xt=[{z:1/0,tier:-1},{z:1/0,tier:-1}],P=or.map((e,n)=>{let r=n%2===0,t=r?0:1,a=r?-$t:$t,o=ur(e.hoursAgo),u=Math.atan2(C[0]-a,C[2]-o)*jt+(r?1:-1)*(Math.PI/2)*(1-jt),l=Xt[t],s=Math.abs(o-l.z)<ie*1.05,c=s?(l.tier+1)%Wt:0,m=s&&l.tier+1>=Wt;Xt[t]={z:o,tier:c};let f=Gr+c*Vr;return{...e,i:n,left:r,x:a,y:f,yaw:u,z:o,tier:c,tierOverflow:m,distance:0}});for(let e of P)e.distance=Math.hypot(e.x-C[0],e.y-C[1],e.z-C[2]);var Qr={ALLOWED:{hex:"#2C6BFF",roughness:.36,metalness:.06},BLOCKED:{hex:"#C9552B",roughness:.42,metalness:.05},WITHHELD:{hex:"#5C6880",roughness:.3,metalness:.55}},ut=[{mesh:Wr,model:j(0,kr-.06,ne),normalMat:oe,material:{baseColour:O("#080C15"),roughness:.84,metalness:0}},{mesh:zt,model:j(-X,1.5,ne),normalMat:oe,material:{baseColour:O("#141F35"),roughness:.62,metalness:.03}},{mesh:zt,model:j(X,1.5,ne),normalMat:oe,material:{baseColour:O("#141F35"),roughness:.62,metalness:.03}},{mesh:zr,model:j(0,2.86,ne),normalMat:oe,material:{baseColour:O("#0A101C"),roughness:.8,metalness:0}},{mesh:jr,model:j(0,1.5,ne-de/2),normalMat:oe,material:{baseColour:O("#0B1220"),roughness:.86,metalness:0}},...P.map(e=>{let n=Qr[e.verdict];return{mesh:$r,model:j(e.x,e.y,e.z,e.yaw),normalMat:Xr(j(e.x,e.y,e.z,e.yaw)),material:{baseColour:O(n.hex),roughness:n.roughness,metalness:n.metalness}}})],hr=[.34,-.42,-.84],Qt=[-2.2,0,-26],Yt=[2.2,3.4,3],Kt=Ke({direction:hr,colour:[1,1,1],extent:11},Je(Qt,Yt),qe(Qt,Yt)),Yr=W(lr)+2*W(cr)+W(dr)+W(mr)+P.length*W(fr),{near:Kr,far:qr}=Ye(ue);function bt(){let e=Te(ue,N/_);st.shadowPass(Kt,ut,pt),Ae.bind();let n=O("#0B1220");R.clearColor(n[0],n[1],n[2],1),R.clear(R.COLOR_BUFFER_BIT|R.DEPTH_BUFFER_BIT),st.depthPrepass(e,ut),ht&&(Vt.compute({depthTexture:Ae.depthTexture,near:Kr,far:qr,fovDeg:ue.fovDeg??46,aspect:N/_,radius:.42,strength:1.35}),Ae.bind()),st.draw({viewProj:e,eye:C,lightDir:hr,lightColour:[3,2.95,2.85],ambientGain:.46,lightVP:Kt,shadow:pt,shadowStrength:.94,shadowTaps:Me.shadowTaps,shadowBaseline:1536,draws:ut,ao:ht?Vt.texture:null,screenSize:[N,_],fog:se>0?{density:se,height:6,floor:0,colour:O("#0B1220")}:null}),R.bindFramebuffer(R.FRAMEBUFFER,null),R.viewport(0,0,N,_),R.disable(R.DEPTH_TEST),R.activeTexture(R.TEXTURE0),R.bindTexture(R.TEXTURE_2D,Ae.texture),D.blit(Ir,r=>R.uniform1i(R.getUniformLocation(r,"uScene"),0))}function Jr(e){bt();let n=new Uint8Array(4);R.readPixels(0,0,1,1,R.RGBA,R.UNSIGNED_BYTE,n);let r=performance.now();for(let t=0;t<e;t++)bt();return R.readPixels(0,0,1,1,R.RGBA,R.UNSIGNED_BYTE,n),(performance.now()-r)/e}var lt=Jr(Math.max(1,rr)),pr=Te(ue,N/_),le=N/I,ce=_/I,Se=document.createElement("div");Se.style.cssText=`position:relative;overflow:hidden;width:${le}px;height:${ce}px`;Z.parentNode?.insertBefore(Se,Z);Se.appendChild(Z);var ee=document.createElement("div");ee.style.cssText="position:absolute;inset:0;pointer-events:none";Se.appendChild(ee);var At=e=>se<=0?0:1-Math.exp(-se*e),we=(e,n,r)=>{let t=a=>{let o=a/255;return o<=.03928?o/12.92:((o+.055)/1.055)**2.4};return .2126*t(e)+.7152*t(n)+.0722*t(r)},br=(e,n)=>(Math.max(e,n)+.05)/(Math.min(e,n)+.05),Er=(e,n,r,t)=>{let a=Math.max(0,Math.min(N-1,Math.round((e-r)*I))),o=Math.max(a,Math.min(N-1,Math.round((e+r)*I))),i=Math.max(0,Math.min(_-1,Math.round((n-t)*I))),u=Math.max(i,Math.min(_-1,Math.round((n+t)*I))),l=o-a+1,s=u-i+1,c=new Uint8Array(4*l*s);R.readPixels(a,_-1-u,l,s,R.RGBA,R.UNSIGNED_BYTE,c);let m=[0,0,0],f=-1;for(let p=0;p<l*s;p++){let x=c[p*4],d=c[p*4+1],b=c[p*4+2],g=we(x,d,b);g>f&&(f=g,m=[x,d,b])}return m},xr=(e,n,r)=>we(e[0]+r*(n[0]-e[0]),e[1]+r*(n[1]-e[1]),e[2]+r*(n[2]-e[2])),me=4.5,Et=190,ct=[],qt=(e,n,r)=>{let t=0;for(let a=0;a<4;a++){let o=e[a],i=e[(a+1)%4],u=(i.x-o.x)*(r-o.y)-(i.y-o.y)*(n-o.x);if(Math.abs(u)<1e-9)continue;let l=u>0?1:-1;if(t===0)t=l;else if(l!==t)return!1}return!0},Zr=e=>e<24?`${e}h ago`:`${(e/24).toFixed(e<72?1:0)}d ago`,en=[255,255,255],yr=[{css:"font:600 9px/1 ui-monospace,monospace;letter-spacing:.15em",opacity:1,text:e=>`${e.verdict} \xB7 ${Zr(e.hoursAgo)}`},{css:"font:700 11px/1.05 ui-monospace,monospace",opacity:1,text:e=>e.action},{css:"font:400 10.5px/1.2 ui-monospace,monospace",opacity:1,text:e=>e.actor}],Rt=[...P].sort((e,n)=>e.distance-n.distance).map(e=>{let n=e.verdict==="WITHHELD",r=e.distance>sr,t=Math.round(ie*Et),a=Math.round(ae*Et),o=We(e.x,e.z,e.y-ae/2,ie,ae,e.yaw,ir/2+.004),i=Ve(pr,o,le,ce,t,a),u=U(i)?i.refusal:null,l=!U(i)&&i.signedArea<=0,s=U(i)?0:Math.max(Math.hypot(i.screen[0].x-i.screen[1].x,i.screen[0].y-i.screen[1].y),Math.hypot(i.screen[3].x-i.screen[2].x,i.screen[3].y-i.screen[2].y)),c=s<26,m=U(i)?0:i.screen.filter(v=>ct.some(h=>qt(h,v.x,v.y))).length+ct.reduce((v,h)=>v+h.filter(E=>qt(i.screen.map(y=>({x:y.x,y:y.y})),E.x,E.y)).length,0),f=m>=2,p=1-.75*At(e.distance),x=U(i)?null:(()=>{let v=i.screen.map(H=>H.x),h=i.screen.map(H=>H.y),[E,y]=[Math.min(...v),Math.max(...v)],[T,A]=[Math.min(...h),Math.max(...h)],F=(E+y)/2,S=(T+A)/2;return F<0||F>le||S<0||S>ce?null:{cx:F,cy:S,hx:Math.max(1,(y-E)/4),hy:Math.max(1,(A-T)/4)}})(),d=x?Er(x.cx,x.cy,x.hx,x.hy):null,b=d?yr.map(v=>Number(br(xr(d,en,v.opacity*p),we(d[0],d[1],d[2])).toFixed(2))):null,g=b?Math.min(...b):null,M=g===null||g<me,L=!u&&!l&&!n&&!r&&!c&&!M&&!f;return L&&!U(i)&&ct.push(i.screen.map(v=>({x:v.x,y:v.y}))),{p:e,proj:i,shown:L,ew:t,eh:a,opacity:p,refusal:u,backFacing:l,withheld:n,tooFar:r,edgeOn:c,occluded:f,widthPx:s,coveredCorners:m,textRatios:b,minTextRatio:g}});for(let e of[...Rt].sort((n,r)=>r.p.distance-n.p.distance)){let{p:n,proj:r,shown:t,ew:a,eh:o,opacity:i}=e;if(t&&!U(r)){let u=document.createElement("div");u.style.cssText=`position:absolute;left:0;top:0;width:${a}px;height:${o}px;transform-origin:0 0;transform:${r.transform};display:flex;flex-direction:column;justify-content:center;gap:5px;padding:0 5px;overflow:hidden;opacity:${i.toFixed(3)};-webkit-font-smoothing:antialiased`;for(let l of yr){let s=document.createElement("div");s.style.cssText=`${l.css};color:#fff;opacity:${l.opacity}`,s.textContent=l.text(n),u.appendChild(s)}ee.appendChild(u)}}var $=Rt.map(({p:e,shown:n,refusal:r,backFacing:t,withheld:a,tooFar:o,edgeOn:i,widthPx:u,coveredCorners:l,textRatios:s,minTextRatio:c})=>({i:e.i,verdict:e.verdict,hoursAgo:e.hoursAgo,distance:Number(e.distance.toFixed(2)),fog:Number(At(e.distance).toFixed(3)),widthPx:Math.round(u),coveredCorners:l,textRatios:s,minTextRatio:c,shown:n,hiddenBecause:n?null:a?"WITHHELD":r||(t?"BACK_FACING":i?"EDGE_ON":o?"BEYOND_LEGIBLE_RANGE":c===null?"CONTRAST_UNMEASURABLE":c<me?"BELOW_READABLE_CONTRAST":"OCCLUDED")})),gr=Math.max(0,...$.filter(e=>e.shown).map(e=>e.hoursAgo)),Tr=Math.max(0,...Rt.filter(e=>!e.tooFar).map(e=>e.p.hoursAgo)),Ar=Math.max(...P.map(e=>e.hoursAgo)),vt=document.createElement("div");vt.style.cssText="position:absolute;left:18px;top:16px;display:flex;flex-direction:column;gap:7px";vt.innerHTML=`<div style="font:600 11px/1 ui-monospace,monospace;letter-spacing:.16em;color:#8FB7FF">GOVERNED ACTIONS \xB7 DEPTH IS TIME</div><div style="font:400 10.5px/1.5 ui-monospace,monospace;color:rgba(196,212,240,0.84)">READABLE TO ${(gr/24).toFixed(1)} d \u2014 MEASURED AT ${me}:1<br>IN RANGE TO ${(Tr/24).toFixed(1)} d (GEOMETRY) &nbsp;\xB7&nbsp; VISIBLE TO ${(Ar/24).toFixed(1)} d<br>${Tt} h PER METRE &nbsp;\xB7&nbsp; ${gt?"FOG ON":"FOG OFF \u2014 reading limit NOT shown"}</div><div style="font:500 10px/1.4 ui-monospace,monospace;color:#E0A94A">SYNTHETIC RECORDS</div>`;ee.appendChild(vt);var Fe={ALLOWED:P.filter(e=>e.verdict==="ALLOWED").length,BLOCKED:P.filter(e=>e.verdict==="BLOCKED").length,WITHHELD:P.filter(e=>e.verdict==="WITHHELD").length},Ft=document.createElement("div");Ft.style.cssText="position:absolute;right:18px;bottom:16px;display:flex;flex-direction:column;gap:6px;align-items:flex-end;font:500 10.5px/1 ui-monospace,monospace";Ft.innerHTML=[["#2C6BFF",`ALLOWED \xB7 ${Fe.ALLOWED}`],["#C9552B",`BLOCKED \xB7 ${Fe.BLOCKED}`],["#5C6880",`WITHHELD \xB7 ${Fe.WITHHELD} (present, unreadable)`]].map(([e,n])=>`<div style="display:flex;align-items:center;gap:7px;color:rgba(196,212,240,0.85)"><span>${n}</span><span style="width:11px;height:11px;background:${e};display:inline-block;forced-color-adjust:none"></span></div>`).join("");ee.appendChild(Ft);var Re=[196,212,240],Jt=.85,dt=[1,3,7,14].map(e=>{let n=ur(e*24),r=re(pr,[-X+.3,.035,n],le,ce),t=At(Math.hypot(C[0]+X-.3,C[1]-.035,C[2]-n)),a=!r.behind&&r.sx>0&&r.sx<le&&r.sy>0&&r.sy<ce,o=a?Er(r.sx,r.sy,13,7):null,i=o?Number(br(xr(o,Re,Jt),we(o[0],o[1],o[2])).toFixed(2)):null;if(a){let u=document.createElement("div");u.style.cssText=`position:absolute;left:${r.sx.toFixed(1)}px;top:${r.sy.toFixed(1)}px;transform:translate(-50%,-50%);font:500 10px/1 ui-monospace,monospace;letter-spacing:.08em;color:rgba(${Re[0]},${Re[1]},${Re[2]},${Jt});white-space:nowrap`,u.textContent=`${e}d`,ee.appendChild(u)}return{days:e,sx:Math.round(r.sx),sy:Math.round(r.sy),fog:Number(t.toFixed(3)),onFrame:a,ratio:i,readable:i!==null&&i>=me}}),Rr=(()=>{let e=R.getExtension("WEBGL_debug_renderer_info");return e?String(R.getParameter(e.UNMASKED_RENDERER_WEBGL)):"unknown"})(),mt=/swiftshader|llvmpipe|software/i.test(Rr),xt=He();if(xt.length>0){let e="BRAND FIDELITY FAILED \u2014 "+xt.map(r=>`${r.key}: expected ${r.expected}, got ${r.actual}`).join("; ");document.title="REFUSED";let n=document.getElementById("log");throw n&&(n.textContent=e),new Error(e)}var vr={paramClamps:er,tier:Me.tier,tierDprScale:Me.dprScale,tierShadowMapSize:ye(yt,1536),shadowBaseline:1536,brandFidelity:xt,ao:ht,fog:gt,fogDensity:Number(se.toFixed(4)),hoursPerMetre:Tt,legibleMetres:sr,hdr:D.hdr,eye:C.map(e=>Number(e.toFixed(2))),readableToDays:Number((gr/24).toFixed(2)),readableThreshold:me,inRangeToDays:Number((Tr/24).toFixed(2)),visibleToDays:Number((Ar/24).toFixed(2)),worstShownTextRatio:(()=>{let e=$.filter(n=>n.shown).map(n=>n.minTextRatio??0);return e.length>0?Math.min(...e):null})(),records:P.length,actionOverflow:P.filter(e=>e.action.length*6.6>ie*Et-10).map(e=>e.action),tiersUsed:Math.max(...P.map(e=>e.tier))+1,tierOverflows:P.filter(e=>e.tierOverflow).length,counts:Fe,shown:$.filter(e=>e.shown).length,hiddenBy:$.filter(e=>!e.shown).reduce((e,n)=>{let r=n.hiddenBecause??"UNKNOWN";return e[r]=(e[r]??0)+1,e},{}),fogNearest:Math.min(...$.map(e=>e.fog)),fogFurthest:Math.max(...$.map(e=>e.fog)),rulerTicks:dt,rulerOffFrame:dt.filter(e=>!e.onFrame).length,rulerTicksUnreadable:dt.filter(e=>!e.readable).map(e=>({days:e.days,ratio:e.ratio})),perRecord:$,glError:R.getError(),triangles:Yr,shadowMap:pt.size,resolution:`${N}x${_}`,dprScale:I,frames:rr,msPerFrame:Number(lt.toFixed(3)),fps:Math.round(1e3/lt),renderer:Rr,rendererClass:mt?"software":"hardware",headroom:mt?null:Number((16.6-lt).toFixed(3)),headroomRefusal:mt?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null,hardwareMsPerFrame:null};globalThis.E6=vr;var{perRecord:Zt,rulerTicks:fo,...tn}=vr;Cr.textContent=JSON.stringify(tn,null,2)+`

perRecord (${Zt.length}, full detail on globalThis.E6):
`+Zt.map(e=>`  #${String(e.i).padStart(2)} ${e.verdict.padEnd(9)} ${String(e.hoursAgo).padStart(4)}h ${String(e.distance).padStart(6)}m fog ${e.fog.toFixed(3)} ${e.shown?"SHOWN":`hidden: ${e.hiddenBecause}`}`).join(`
`);bt();ar.markRendered();document.title="READY";

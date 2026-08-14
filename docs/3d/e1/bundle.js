var L={E0:{id:"E0",name:"THE SPIKE",verdict:"GATE MET"},E1:{id:"E1",name:"THE THEATRE",verdict:"THE HYBRID WORKS. \xA77(b) is now a real tension, not a gap."},E2:{id:"E2",name:"THE GLOBE",verdict:"CARRIES INFORMATION. \xA77(b) still unproven."},E3:{id:"E3",name:"THE PIPELINE",verdict:"READS, and it cost two engine bugs, a lost object and a fog that erased the room."},E4:{id:"E4",name:"THE ORRERY",verdict:`THE CROSSING CLAIM HOLDS AND IS CAMERA-INDEPENDENT. \xA72's "compartment you fly into" is not built, and \xA77(b) is not timed.`},E5:{id:"E5",name:"THE SURFACE",verdict:"AGREES WITH THE SHIPPING ENGINE. \xA72's ribbons and drag are now built."},E6:{id:"E6",name:"THE VAULT",verdict:"READS. Six framing errors, every one caught by a count."},E7:{id:"E7",name:"THE STORM",verdict:"THE INTEGRAL IS THE DATA \u2014 verified to 0.00% against the table, but a pixel mixes six days and \xA72's rotation is not built."},E8:{id:"E8",name:"THE FORGE",verdict:"the first shippable environment"}};var Ft={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected.",FEEDBACK_LOOP:"A layer of this view was asked to read the surface it draws into, which every driver refuses, so the layer is not being drawn. This is a defect in the renderer, not in the data."};function D(t,n){return n===void 0?{kind:"refused",code:t,reason:Ft[t]}:{kind:"refused",code:t,reason:Ft[t],detail:n}}var mr=3,fr=24e5;function Ne(t){return t.kind==="stage"}function Ue(t,n={}){let r=t.getContext("webgl2",{antialias:n.antialias??!1,alpha:n.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!r)return D("NO_WEBGL2");let e=r.getExtension("EXT_color_buffer_float"),o=t.width,a=t.height,i=e?r.RGBA16F:r.RGBA8,s=e?r.HALF_FLOAT:r.UNSIGNED_BYTE,u=(b,T)=>{let A=r.createTexture();r.bindTexture(r.TEXTURE_2D,A),r.texImage2D(r.TEXTURE_2D,0,i,b,T,0,r.RGBA,s,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE);let p=r.createFramebuffer();r.bindFramebuffer(r.FRAMEBUFFER,p),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,A,0);let y=r.checkFramebufferStatus(r.FRAMEBUFFER);return y!==r.FRAMEBUFFER_COMPLETE?D("FRAMEBUFFER_INCOMPLETE",`status 0x${y.toString(16)} at ${b}\xD7${T}`):{texture:A,framebuffer:p,width:b,height:T}},l=n.bloomShift??2,c={w:o,h:a},d=(b,T)=>({scene:u(b,T),bloomA:u(Math.max(1,b>>l),Math.max(1,T>>l)),bloomB:u(Math.max(1,b>>l),Math.max(1,T>>l)),texels:b*T}),f=b=>{for(let T of[b.scene,b.bloomA,b.bloomB])"kind"in T||(r.deleteFramebuffer(T.framebuffer),r.deleteTexture(T.texture))},h=new Map,E=`${o}x${a}`,m=d(o,a);for(let b of[m.scene,m.bloomA,m.bloomB])if("kind"in b)return f(m),b;h.set(E,m);let x=()=>{let b=h.size-1,T=0;for(let[A,p]of h)A!==E&&(T+=p.texels);for(let[A,p]of h){if(b<=mr&&T<=fr)return;A!==E&&(h.delete(A),f(p),b-=1,T-=p.texels)}},F=r.createVertexArray();r.bindVertexArray(F);let v=r.createBuffer();r.bindBuffer(r.ARRAY_BUFFER,v),r.bufferData(r.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),r.STATIC_DRAW),r.enableVertexAttribArray(0),r.vertexAttribPointer(0,2,r.FLOAT,!1,0,0),r.bindVertexArray(null);let S=[];return{kind:"stage",gl:r,cssWidth:t.clientWidth||o,cssHeight:t.clientHeight||a,hdr:!!e,get width(){return c.w},get height(){return c.h},get scene(){return m.scene},get bloomA(){return m.bloomA},get bloomB(){return m.bloomB},setRegion(b,T){let A=Math.max(1,Math.round(b)),p=Math.max(1,Math.round(T));if(A===c.w&&p===c.h)return;c={w:A,h:p};let y=`${A}x${p}`,g=h.get(y);if(g){h.delete(y),h.set(y,g),m=g,E=y;return}m=d(A,p),E=y,h.set(y,m),x()},compile(b,T){let A=(M,B)=>{let U=r.createShader(M);if(r.shaderSource(U,B),r.compileShader(U),!r.getShaderParameter(U,r.COMPILE_STATUS)){let G=r.getShaderInfoLog(U)??"(no log)";return r.deleteShader(U),D("SHADER_COMPILE_FAILED",G)}return U},p=A(r.VERTEX_SHADER,b);if(typeof p=="object"&&"kind"in p)return p;let y=A(r.FRAGMENT_SHADER,T);if(typeof y=="object"&&"kind"in y)return r.deleteShader(p),y;let g=r.createProgram();if(r.attachShader(g,p),r.attachShader(g,y),r.linkProgram(g),!r.getProgramParameter(g,r.LINK_STATUS)){let M=r.getProgramInfoLog(g)??"(no log)";return r.deleteShader(p),r.deleteShader(y),r.deleteProgram(g),D("PROGRAM_LINK_FAILED",M)}return r.detachShader(g,p),r.detachShader(g,y),r.deleteShader(p),r.deleteShader(y),S.push(g),g},bindTarget(b){r.bindFramebuffer(r.FRAMEBUFFER,b?b.framebuffer:null),r.viewport(0,0,b?b.width:c.w,b?b.height:c.h)},blit(b,T){r.useProgram(b),r.bindVertexArray(F),T?.(b),r.drawArrays(r.TRIANGLES,0,3),r.bindVertexArray(null)},dispose(){for(let T of S)r.deleteProgram(T);for(let T of h.values())f(T);if(h.clear(),r.deleteBuffer(v),r.deleteVertexArray(F),t.isConnected)return;let b=r.getExtension("WEBGL_lose_context");b!==null&&typeof b.loseContext=="function"&&b.loseContext()}}}var de=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function me(t,n){let r=new Float32Array(16);for(let e=0;e<4;e++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=t[i*4+o]*n[e*4+i];r[e*4+o]=a}return r}var q=(t,n)=>[t[0]-n[0],t[1]-n[1],t[2]-n[2]],ce=(t,n)=>t[0]*n[0]+t[1]*n[1]+t[2]*n[2],K=(t,n)=>[t[1]*n[2]-t[2]*n[1],t[2]*n[0]-t[0]*n[2],t[0]*n[1]-t[1]*n[0]];function V(t){let n=Math.hypot(t[0],t[1],t[2]);return n===0?t:[t[0]/n,t[1]/n,t[2]/n]}function Ce(t,n,r,e){let o=1/Math.tan(t/2);return new Float32Array([o/n,0,0,0,0,o,0,0,0,0,(e+r)/(r-e),-1,0,0,2*e*r/(r-e),0])}function Be(t,n,r,e,o,a){let i=n-t,s=e-r,u=a-o;return new Float32Array([2/i,0,0,0,0,2/s,0,0,0,0,-2/u,0,-(n+t)/i,-(e+r)/s,-(a+o)/u,1])}function fe(t,n,r){let e=V(q(t,n)),o=K(r,e);if(Math.hypot(o[0],o[1],o[2])<1e-8)return de();let a=V(o),i=K(e,a);return new Float32Array([a[0],i[0],e[0],0,a[1],i[1],e[1],0,a[2],i[2],e[2],0,-ce(a,t),-ce(i,t),-ce(e,t),1])}function vt(t,n){let r=[0,1,2,3].map(o=>t[0+o]*n[0]+t[4+o]*n[1]+t[8+o]*n[2]+t[12+o]),e=r[3];return{x:r[0]/e,y:r[1]/e,z:r[2]/e,w:e}}function $(t,n,r,e){let o=vt(t,n);return{sx:(o.x*.5+.5)*r,sy:(1-(o.y*.5+.5))*e,behind:o.w<=0}}function Mt(t){return t<=.04045?t/12.92:Math.pow((t+.055)/1.055,2.4)}function Oe(t){return t<=.0031308?t*12.92:1.055*Math.pow(t,1/2.4)-.055}var hr=/^#?([0-9a-fA-F]{6})$/;function ae(t){let n=hr.exec(t.trim());if(!n)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(t)}`);let r=n[1];return[0,2,4].map(e=>Mt(parseInt(r.slice(e,e+2),16)/255))}function Ie(t){return`#${t.map(r=>{let e=Oe(Math.min(1,Math.max(0,r)));return Math.round(e*255).toString(16).padStart(2,"0")}).join("")}`}var J={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},ke=Object.freeze(Object.fromEntries(Object.keys(J).map(t=>[t,ae(J[t])])));var St=.4;var Ge=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${St.toFixed(2)}); }`,Ve=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function He(){let t=[];for(let n of Object.keys(J)){let r=J[n].toLowerCase(),e=Ie(ke[n]).toLowerCase();e!==r&&t.push({key:n,expected:r,actual:e})}return t}function br(t){let n=[1/0,1/0,1/0],r=[-1/0,-1/0,-1/0];for(let e=0;e<t.length;e+=3)for(let o=0;o<3;o++){let a=t[e+o];a<n[o]&&(n[o]=a),a>r[o]&&(r[o]=a)}return t.length===0?{min:[0,0,0],max:[0,0,0]}:{min:n,max:r}}function wt(t,n,r,e){let o=new Float32Array(t.length);for(let i=0;i<e.length;i+=3){let s=e[i],u=e[i+1],l=e[i+2],c=s*3,d=u*3,f=l*3,h=s*2,E=u*2,m=l*2,x=t[d]-t[c],F=t[d+1]-t[c+1],v=t[d+2]-t[c+2],S=t[f]-t[c],N=t[f+1]-t[c+1],b=t[f+2]-t[c+2],T=r[E]-r[h],A=r[E+1]-r[h+1],p=r[m]-r[h],y=r[m+1]-r[h+1],g=T*y-p*A;if(Math.abs(g)<1e-12)continue;let M=1/g,B=(x*y-S*A)*M,U=(F*y-N*A)*M,G=(v*y-b*A)*M;for(let O of[c,d,f])o[O]=o[O]+B,o[O+1]=o[O+1]+U,o[O+2]=o[O+2]+G}let a=new Float32Array(t.length);for(let i=0;i<a.length;i+=3){let s=n[i],u=n[i+1],l=n[i+2],c=o[i],d=o[i+1],f=o[i+2],h=c*s+d*u+f*l;c-=s*h,d-=u*h,f-=l*h;let E=Math.hypot(c,d,f);E<1e-8&&(Math.abs(s)<.9?(c=0,d=-l,f=u):(c=-l,d=0,f=s),E=Math.hypot(c,d,f)||1),a[i]=c/E,a[i+1]=d/E,a[i+2]=f/E}return a}function _t(t,n){let r=new Float32Array(t.length);for(let e=0;e<n.length;e+=3){let o=n[e]*3,a=n[e+1]*3,i=n[e+2]*3,s=t[a]-t[o],u=t[a+1]-t[o+1],l=t[a+2]-t[o+2],c=t[i]-t[o],d=t[i+1]-t[o+1],f=t[i+2]-t[o+2],h=u*f-l*d,E=l*c-s*f,m=s*d-u*c;for(let x of[o,a,i])r[x]=r[x]+h,r[x+1]=r[x+1]+E,r[x+2]=r[x+2]+m}for(let e=0;e<r.length;e+=3){let o=Math.hypot(r[e],r[e+1],r[e+2]);o>0&&(r[e]=r[e]/o,r[e+1]=r[e+1]/o,r[e+2]=r[e+2]/o)}return r}function Lt(t,n,r,e,o){let{min:a,max:i}=br(t),s=e??_t(t,r);return{positions:t,normals:s,uvs:n,indices:r,min:a,max:i,tangents:o??wt(t,s,n,r)}}function ze(t=1,n=1,r=1){let e=t/2,o=n/2,a=r/2,i=[[[-e,-o,a],[e,-o,a],[e,o,a],[-e,o,a]],[[e,-o,-a],[-e,-o,-a],[-e,o,-a],[e,o,-a]],[[e,-o,a],[e,-o,-a],[e,o,-a],[e,o,a]],[[-e,-o,-a],[-e,-o,a],[-e,o,a],[-e,o,-a]],[[-e,o,a],[e,o,a],[e,o,-a],[-e,o,-a]],[[-e,-o,-a],[e,-o,-a],[e,-o,a],[-e,-o,a]]],s=new Float32Array(72),u=new Float32Array(48),l=new Uint16Array(36),c=0,d=0,f=0,h=0;for(let E of i){for(let[m,x,F]of E)s[c++]=m,s[c++]=x,s[c++]=F;u[d++]=0,u[d++]=0,u[d++]=1,u[d++]=0,u[d++]=1,u[d++]=1,u[d++]=0,u[d++]=1,l[f++]=h,l[f++]=h+1,l[f++]=h+2,l[f++]=h,l[f++]=h+2,l[f++]=h+3,h+=4}return Lt(s,u,l)}function Xe(t=10,n=24){let r=Math.max(1,Math.floor(n)),e=(r+1)*(r+1),o=new Float32Array(e*3),a=new Float32Array(e*3),i=new Float32Array(e*2),s=new Uint16Array(r*r*6),u=0,l=0,c=0;for(let d=0;d<=r;d++)for(let f=0;f<=r;f++){let h=(f/r-.5)*t,E=(d/r-.5)*t;o[u]=h,o[u+1]=0,o[u+2]=E,a[u]=0,a[u+1]=1,a[u+2]=0,u+=3,i[l++]=f/r,i[l++]=d/r}for(let d=0;d<r;d++)for(let f=0;f<r;f++){let h=d*(r+1)+f,E=h+1,m=h+(r+1),x=m+1;s[c++]=h,s[c++]=m,s[c++]=E,s[c++]=E,s[c++]=m,s[c++]=x}return Lt(o,i,s,a)}function je(t){return t.indices.length/3}function pr(t){if(!Number.isFinite(t)||t===0)return"0";let n=t.toFixed(12).replace(/0+$/,"").replace(/\.$/,"");return n==="-0"?"0":n}function Dt(t,n,r,e){let[o,a]=t,[i,s]=n,[u,l]=r,[c,d]=e,f=o-i+u-c,h=a-s+l-d;if(Math.abs(f)<1e-9&&Math.abs(h)<1e-9){let b=[i-o,c-o,o,s-a,d-a,a,0,0,1],T=b[0]*b[4]-b[1]*b[3];return Math.abs(T)<1e-9?null:b}let E=i-u,m=c-u,x=s-l,F=d-l,v=E*F-m*x;if(Math.abs(v)<1e-9)return null;let S=(f*F-m*h)/v,N=(E*h-f*x)/v;return[i-o+S*i,c-o+N*c,o,s-a+S*s,d-a+N*d,a,S,N,1]}function We(t,n,r,e,o,a){if(!(o>0)||!(a>0))return{refusal:"EMPTY_ELEMENT_BOX"};let s=[n.topLeft,n.topRight,n.bottomRight,n.bottomLeft].map(M=>$(t,M,r,e));if(s.some(M=>M.behind))return{refusal:"CORNER_BEHIND_CAMERA"};let u=s.map(M=>({x:M.sx,y:M.sy})),[l,c,d,f]=u,h=Dt([l.x,l.y],[c.x,c.y],[d.x,d.y],[f.x,f.y]);if(!h)return{refusal:"DEGENERATE_ON_SCREEN"};let E=.5*(l.x*c.y-c.x*l.y+(c.x*d.y-d.x*c.y)+(d.x*f.y-f.x*d.y)+(f.x*l.y-l.x*f.y)),m=1/o,x=1/a,[F,v,S,N,b,T,A,p,y]=h;return{transform:`matrix3d(${[F*m,N*m,0,A*m,v*x,b*x,0,p*x,0,0,1,0,S,T,0,y].map(pr).join(", ")})`,matrix:h,screen:u,signedArea:E}}function $e(t){return"refusal"in t}var Pt=t=>[t.DEPTH_TEST,t.CULL_FACE,t.BLEND];function I(t){return[t.getParameter(t.FRAMEBUFFER_BINDING),t.getParameter(t.VIEWPORT),t.getParameter(t.DEPTH_WRITEMASK),Pt(t).map(n=>t.getParameter(n))]}function k(t,n){t.bindFramebuffer(t.FRAMEBUFFER,n[0]);let r=n[1];t.viewport(r[0]??0,r[1]??0,r[2]??0,r[3]??0),t.depthMask(n[2]),Pt(t).forEach((e,o)=>{n[3][o]?t.enable(e):t.disable(e)})}function Z(t,n){for(let r=n-1;r>=0;r--)t.activeTexture(t.TEXTURE0+r),t.bindTexture(t.TEXTURE_2D,null),t.bindTexture(t.TEXTURE_3D,null);t.activeTexture(t.TEXTURE0)}var Ye=["minimum","reduced","full"],Qe={full:{dprScale:2,ao:!0,dof:!0,shadowMapSize:1536,shadowTaps:9,volumeLightSteps:6},reduced:{dprScale:2,ao:!0,dof:!1,shadowMapSize:1024,shadowTaps:9,volumeLightSteps:4},minimum:{dprScale:1,ao:!1,dof:!1,shadowMapSize:512,shadowTaps:1,volumeLightSteps:1}};function he(t,n){let r=Number.isFinite(n)&&n>0?n:1024,e=Qe[t].shadowMapSize/Qe.full.shadowMapSize,o=r*e,a=2**Math.round(Math.log2(o));return Math.max(256,Math.min(r,a))}function Ke(t){return{tier:t,...Qe[t]}}var qe=89,Je=Math.PI/180;function be(t){let n=Math.max(-qe,Math.min(qe,t.elevationDeg))*Je,r=t.azimuthDeg*Je,e=Math.max(1e-4,t.distance),o=Math.sin(n)*e,a=Math.cos(n)*e;return[t.target[0]+Math.sin(r)*a,t.target[1]+o,t.target[2]+Math.cos(r)*a]}function pe(t,n){let r=be(t),e=t.near??Math.max(.01,t.distance/100),o=t.far??Math.max(e+1,t.distance*8),a=Ce((t.fovDeg??38)*Je,Math.max(.001,n),e,o),i=fe(r,t.target,[0,1,0]);return me(a,i)}function Ze(t,n,r){let e=V(t.direction),o=t.extent??Math.max(.1,r*1.35),a=Math.max(1,r*2),i=[n[0]-e[0]*a,n[1]-e[1]*a,n[2]-e[2]*a],s=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],u=fe(i,n,s),l=Be(-o,o,-o,o,.01,a+r*2+o);return me(l,u)}function et(t,n){let r=q([n[0],n[1],n[2]],[t[0],t[1],t[2]]);return Math.hypot(r[0],r[1],r[2])/2}function tt(t,n){return[(t[0]+n[0])/2,(t[1]+n[1])/2,(t[2]+n[2])/2]}function rt(t,n,r){let{gl:e}=t,o=Math.max(1,Math.floor(n)),a=Math.max(1,Math.floor(r)),i=e.createFramebuffer(),s=e.createTexture(),u=e.createTexture();if(!i||!s||!u)return D("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let l=t.hdr?e.RGBA16F:e.RGBA8,c=t.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,d=()=>{e.bindTexture(e.TEXTURE_2D,s),e.texImage2D(e.TEXTURE_2D,0,l,o,a,0,e.RGBA,c,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,u),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,o,a,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,s,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,u,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};d(),e.bindFramebuffer(e.FRAMEBUFFER,i);let f=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),f!==e.FRAMEBUFFER_COMPLETE?D("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${f.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:s,depthTexture:u,get width(){return o},get height(){return a},bind(){e.bindFramebuffer(e.FRAMEBUFFER,i),e.viewport(0,0,o,a)},resize(h,E){let m=Math.max(1,Math.floor(h)),x=Math.max(1,Math.floor(E));m===o&&x===a||(o=m,a=x,d())},dispose(){e.deleteFramebuffer(i),e.deleteTexture(s),e.deleteTexture(u)}}}function nt(t,n=1024){let{gl:r}=t,e=Math.max(256,Math.min(2048,Math.floor(n))),o=r.createFramebuffer(),a=r.createTexture();if(!o||!a)return D("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");r.bindTexture(r.TEXTURE_2D,a),r.texImage2D(r.TEXTURE_2D,0,r.DEPTH_COMPONENT24,e,e,0,r.DEPTH_COMPONENT,r.UNSIGNED_INT,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),r.bindFramebuffer(r.FRAMEBUFFER,o),r.framebufferTexture2D(r.FRAMEBUFFER,r.DEPTH_ATTACHMENT,r.TEXTURE_2D,a,0);let i=r.checkFramebufferStatus(r.FRAMEBUFFER);return r.bindFramebuffer(r.FRAMEBUFFER,null),i!==r.FRAMEBUFFER_COMPLETE?D("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:e,bind(){r.bindFramebuffer(r.FRAMEBUFFER,o),r.viewport(0,0,e,e)},dispose(){r.deleteFramebuffer(o),r.deleteTexture(a)}}}var xe=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,Ee={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function ye(t,n,r={}){let e=r.zenith??Ee.zenith,o=r.horizon??Ee.horizon,a=r.ground??Ee.ground;t.uniform3f(t.getUniformLocation(n,"uSkyZenith"),e[0],e[1],e[2]),t.uniform3f(t.getUniformLocation(n,"uSkyHorizon"),o[0],o[1],o[2]),t.uniform3f(t.getUniformLocation(n,"uSkyGround"),a[0],a[1],a[2])}var Er=`#version 300 es
precision highp float;
out vec2 vNdc;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`,xr=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${xe}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;function ot(t){let{gl:n}=t,r=t.compile(Er,xr);return"kind"in r?r:{draw(e){let o=V(q(e.target,e.eye)),a=Math.abs(o[1])>.999?[0,0,1]:[0,1,0],i=V(K(o,a)),s=V(K(i,o)),u=I(n);n.disable(n.DEPTH_TEST),n.depthMask(!1),n.disable(n.BLEND),n.useProgram(r),n.uniform3f(n.getUniformLocation(r,"uRight"),i[0],i[1],i[2]),n.uniform3f(n.getUniformLocation(r,"uUp"),s[0],s[1],s[2]),n.uniform3f(n.getUniformLocation(r,"uForward"),o[0],o[1],o[2]),n.uniform1f(n.getUniformLocation(r,"uTanHalfFov"),Math.tan(e.fovDeg*Math.PI/360)),n.uniform1f(n.getUniformLocation(r,"uAspect"),Math.max(.001,e.aspect)),ye(n,r,e.sky),t.blit(r),k(n,u)},dispose(){n.deleteProgram(r)}}}var Nt=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,at=`#version 300 es
precision highp float;
void main(){}`,yr=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,Ut=`#version 300 es
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
}`,Ct=`#version 300 es
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
${xe}

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
}`;function Te(t,n){let{gl:r}=t,e=r.createVertexArray(),o=r.createBuffer(),a=r.createBuffer(),i=r.createBuffer(),s=r.createBuffer();return!e||!o||!a||!i||!s?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(r.bindVertexArray(e),r.bindBuffer(r.ARRAY_BUFFER,o),r.bufferData(r.ARRAY_BUFFER,n.positions,r.STATIC_DRAW),r.enableVertexAttribArray(0),r.vertexAttribPointer(0,3,r.FLOAT,!1,0,0),r.bindBuffer(r.ARRAY_BUFFER,a),r.bufferData(r.ARRAY_BUFFER,n.normals,r.STATIC_DRAW),r.enableVertexAttribArray(1),r.vertexAttribPointer(1,3,r.FLOAT,!1,0,0),r.bindBuffer(r.ARRAY_BUFFER,i),r.bufferData(r.ARRAY_BUFFER,n.tangents,r.STATIC_DRAW),r.enableVertexAttribArray(2),r.vertexAttribPointer(2,3,r.FLOAT,!1,0,0),r.bindBuffer(r.ELEMENT_ARRAY_BUFFER,s),r.bufferData(r.ELEMENT_ARRAY_BUFFER,n.indices,r.STATIC_DRAW),r.bindVertexArray(null),{vao:e,indexCount:n.indices.length,indexType:n.indices instanceof Uint32Array?r.UNSIGNED_INT:r.UNSIGNED_SHORT,dispose(){r.deleteVertexArray(e),r.deleteBuffer(o),r.deleteBuffer(a),r.deleteBuffer(i),r.deleteBuffer(s)}})}function it(t){let{gl:n}=t,r=t.compile(Nt,at);if("kind"in r)return r;let e=t.compile(Ut,Ct);if("kind"in e)return e;let o=t.compile(yr,at);if("kind"in o)return o;let a=(i,s)=>n.getUniformLocation(i,s);return{shadowPass(i,s,u,l){let c=I(n),d=l??(()=>{});u.bind(),d("shadow.bind"),n.clear(n.DEPTH_BUFFER_BIT),n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.FRONT),n.useProgram(r),d("useProgram(shadow)"),n.uniformMatrix4fv(a(r,"uLightVP"),!1,i),d("uLightVP");for(let f of s)n.uniformMatrix4fv(a(r,"uModel"),!1,f.model),d("shadow uModel"),n.bindVertexArray(f.mesh.vao),d("shadow bindVAO"),n.drawElements(n.TRIANGLES,f.mesh.indexCount,f.mesh.indexType,0),d("shadow drawElements");n.bindVertexArray(null),n.cullFace(n.BACK),k(n,c)},depthPrepass(i,s){let u=I(n);n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.colorMask(!1,!1,!1,!1),n.useProgram(o),n.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let l of s)n.uniformMatrix4fv(a(o,"uModel"),!1,l.model),n.bindVertexArray(l.mesh.vao),n.drawElements(n.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0);n.bindVertexArray(null),n.colorMask(!0,!0,!0,!0),k(n,u)},draw(i){let s=I(n),u=i.onStep??(()=>{});if(n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.useProgram(e),n.uniformMatrix4fv(a(e,"uViewProj"),!1,i.viewProj),u("uViewProj"),n.uniform3fv(a(e,"uEye"),i.eye),u("uEye"),n.uniform3fv(a(e,"uLightDir"),i.lightDir),u("uLightDir"),n.uniform3fv(a(e,"uLightColour"),i.lightColour),u("uLightColour"),n.uniform1f(a(e,"uAmbientGain"),i.ambientGain??1),u("uAmbientGain"),i.fog&&i.fog.density>0){n.uniform1f(a(e,"uFogDensity"),i.fog.density),n.uniform1f(a(e,"uFogHeight"),i.fog.height),n.uniform1f(a(e,"uFogFloor"),i.fog.floor??0);let l=i.fog.colour;l==="sky"?n.uniform3f(a(e,"uFogColour"),-1,-1,-1):n.uniform3f(a(e,"uFogColour"),l[0],l[1],l[2]),u("fog")}else n.uniform1f(a(e,"uFogDensity"),0);if(ye(n,e,i.sky),u("bindSky"),i.ao&&i.screenSize?(n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,i.ao),n.uniform1i(a(e,"uAO"),1),n.uniform2f(a(e,"uScreenSize"),i.screenSize[0],i.screenSize[1]),n.uniform1f(a(e,"uAOEnabled"),1)):n.uniform1f(a(e,"uAOEnabled"),0),u("bindAO"),n.uniformMatrix4fv(a(e,"uLightVP"),!1,i.lightVP),u("lit uLightVP"),i.shadow){n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,i.shadow.depthTexture),n.uniform1i(a(e,"uShadowMap"),0),n.uniform1f(a(e,"uShadowTexel"),1/i.shadow.size),n.uniform1f(a(e,"uShadowStrength"),i.shadowStrength??1),n.uniform1i(a(e,"uShadowTaps"),(i.shadowTaps??9)>=9?9:1);let l=i.shadowBaseline,c=l&&l>0&&i.shadow.size>0?l/i.shadow.size:1;n.uniform1f(a(e,"uShadowBiasScale"),Number.isFinite(c)&&c>0?c:1)}else n.uniform1f(a(e,"uShadowStrength"),0);for(let l of i.draws)n.uniformMatrix4fv(a(e,"uModel"),!1,l.model),n.uniformMatrix3fv(a(e,"uNormalMat"),!1,l.normalMat),u("uNormalMat"),n.uniform3fv(a(e,"uBaseColour"),l.material.baseColour),u("uBaseColour"),n.uniform1f(a(e,"uRoughness"),l.material.roughness),n.uniform1f(a(e,"uMetalness"),l.material.metalness),n.uniform1f(a(e,"uAnisotropy"),l.material.anisotropy??0),n.bindVertexArray(l.mesh.vao),u("lit bindVAO"),n.drawElements(n.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0),u("lit drawElements");n.bindVertexArray(null),Z(n,2),k(n,s)},dispose(){n.deleteProgram(r),n.deleteProgram(e),n.deleteProgram(o)}}}var ie=`
uniform sampler2D uDepth;
uniform vec2 uNearFar;

float linearDepthAt(vec2 uv) {
  float d = texture(uDepth, uv).r * 2.0 - 1.0;
  float n = uNearFar.x, f = uNearFar.y;
  return (2.0 * n * f) / (f + n - d * (f - n));
}`,Ot=`
uniform float uTanHalfFov;
uniform float uAspect;

vec3 viewPosAt(vec2 uv) {
  float z = linearDepthAt(uv);
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x * uTanHalfFov * uAspect * z, ndc.y * uTanHalfFov * z, -z);
}`,It=ie+Ot,Bt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Tr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${It}

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
}`,gr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${ie}

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
}`;function st(t,n,r){let{gl:e}=t,o=t.compile(Bt,Tr);if("kind"in o)return o;let a=t.compile(Bt,gr);if("kind"in a)return a;let i=Math.max(1,n>>1),s=Math.max(1,r>>1),u=()=>{let m=e.createFramebuffer(),x=e.createTexture();return!m||!x?null:{fb:m,tex:x}},l=u(),c=u();if(!l||!c)return D("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let d=()=>{for(let m of[l,c])e.bindTexture(e.TEXTURE_2D,m.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,i,s,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,m.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,m.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};d(),e.bindFramebuffer(e.FRAMEBUFFER,l.fb);let f=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),f!==e.FRAMEBUFFER_COMPLETE)return D("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${f.toString(16)}).`);let h=(m,x,F,v,S)=>{e.activeTexture(e.TEXTURE0+S),e.bindTexture(e.TEXTURE_2D,x),e.uniform1i(e.getUniformLocation(m,"uDepth"),S),e.uniform2f(e.getUniformLocation(m,"uNearFar"),F,v)},E=(m,x,F,v,S,N,b)=>{h(m,x,F,v,b),e.uniform1f(e.getUniformLocation(m,"uTanHalfFov"),Math.tan(S*Math.PI/360)),e.uniform1f(e.getUniformLocation(m,"uAspect"),N)};return{get texture(){return l.tex},get width(){return i},get height(){return s},compute(m){let x=I(e);e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,l.fb),e.viewport(0,0,i,s),e.useProgram(o),E(o,m.depthTexture,m.near,m.far,m.fovDeg,m.aspect,0),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/i,1/s),e.uniform1f(e.getUniformLocation(o,"uRadius"),m.radius??.55),e.uniform1f(e.getUniformLocation(o,"uStrength"),m.strength??1.15),e.uniform1f(e.getUniformLocation(o,"uBias"),m.bias??.035),t.blit(o);for(let[F,v,S]of[[l,c,[1,0]],[c,l,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,v.fb),e.viewport(0,0,i,s),e.useProgram(a),h(a,m.depthTexture,m.near,m.far,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,F.tex),e.uniform1i(e.getUniformLocation(a,"uAO"),1),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/i,1/s),e.uniform2f(e.getUniformLocation(a,"uDir"),S[0],S[1]),t.blit(a);Z(e,2),k(e,x)},resize(m,x){let F=Math.max(1,m>>1),v=Math.max(1,x>>1);F===i&&v===s||(i=F,s=v,d())},dispose(){e.deleteProgram(o),e.deleteProgram(a);for(let m of[l,c])e.deleteFramebuffer(m.fb),e.deleteTexture(m.tex)}}}var Rr=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Ar=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uFocusDistance;
uniform float uAperture;
uniform float uMaxCoc;
out vec4 frag;
${ie}

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
}`;function ut(t,n,r){let{gl:e}=t,o=t.compile(Rr,Ar);if("kind"in o)return o;let a=Math.max(1,Math.floor(n)),i=Math.max(1,Math.floor(r)),s=e.createFramebuffer(),u=e.createTexture();if(!s||!u)return D("FRAMEBUFFER_INCOMPLETE","The GPU refused a depth-of-field buffer.");let l=()=>{e.bindTexture(e.TEXTURE_2D,u);let d=t.hdr?e.RGBA16F:e.RGBA8,f=t.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE;e.texImage2D(e.TEXTURE_2D,0,d,a,i,0,e.RGBA,f,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,s),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,u,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};l(),e.bindFramebuffer(e.FRAMEBUFFER,s);let c=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),c!==e.FRAMEBUFFER_COMPLETE?D("FRAMEBUFFER_INCOMPLETE",`The DOF buffer is incomplete (0x${c.toString(16)}).`):{texture:u,apply(d){let f=I(e);e.bindFramebuffer(e.FRAMEBUFFER,s),e.viewport(0,0,a,i),e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.useProgram(o),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,d.scene),e.uniform1i(e.getUniformLocation(o,"uScene"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,d.depthTexture),e.uniform1i(e.getUniformLocation(o,"uDepth"),1),e.uniform2f(e.getUniformLocation(o,"uNearFar"),d.near,d.far),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/a,1/i),e.uniform1f(e.getUniformLocation(o,"uFocusDistance"),d.focusDistance),e.uniform1f(e.getUniformLocation(o,"uAperture"),d.aperture??12),e.uniform1f(e.getUniformLocation(o,"uMaxCoc"),d.maxCoc??.012),t.blit(o),Z(e,2),k(e,f)},resize(d,f){let h=Math.max(1,Math.floor(d)),E=Math.max(1,Math.floor(f));h===a&&E===i||(a=h,i=E,l())},dispose(){e.deleteProgram(o),e.deleteFramebuffer(s),e.deleteTexture(u)}}}var Fr=`
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
`;function X(t){return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function kt(t){let n=document.createElement("style");n.textContent=Fr,document.head.appendChild(n);let r=document.createElement("section");r.id="lcx-fallback",r.setAttribute("aria-label",`${t.title} \u2014 flat view`),r.setAttribute("tabindex","-1"),document.getElementById("log")?.setAttribute("aria-hidden","true");let e=(a,i)=>a===null?`<td class="absent${i?" n":""}">absent</td>`:`<td class="${i?"n":""}">${X(a)}</td>`;r.innerHTML=`<h2>${X(t.title)} \u2014 flat view</h2><p class="reads">${X(t.readsAs)}</p>`+(t.notices??[]).map(a=>`<p class="notice">${X(a)}</p>`).join("")+'<div id="lcx-refusal" role="alert"></div>'+(t.html?`<div class="surface">${t.html}</div>`:`<table><caption>${X(t.title)} \u2014 flat view</caption><thead><tr>`+t.columns.map(a=>`<th scope="col" class="${a.numeric?"n":""}">${X(a.label)}</th>`).join("")+"</tr></thead><tbody>"+t.rows.map(a=>"<tr>"+t.columns.map(i=>e(a[i.key]??null,!!i.numeric)).join("")+"</tr>").join("")+"</tbody></table>"),document.body.appendChild(r);function o(a,i){let s=document.getElementById("lcx-refusal");s&&(s.innerHTML=`<p class="refusal"><strong>${X(a)}</strong> \u2014 ${X(i)} The measurements below are unaffected.</p>`),delete r.dataset.rendered;for(let u of Array.from(document.querySelectorAll("canvas")))u.style.display="none";r.focus({preventScroll:!0})}return document.addEventListener("webglcontextlost",a=>{a.preventDefault(),o("CONTEXT_LOST","The GPU dropped the WebGL context for this page mid-session.")},!0),{markRendered(){r.dataset.rendered="1"},showRefusal:o}}var ne=new URLSearchParams(location.search),gt=Ye.includes(ne.get("tier")??"")?ne.get("tier"):"full",le=Ke(gt),Ae=ne.get("dof")!=="0"&&le.dof,ht=ne.get("ao")!=="0"&&le.ao,bt=[],Yt=[];function Kt(t,n,r,e){let o=ne.get(t);if(o===null)return n;let a=Number(o);if(!Number.isFinite(a))return bt.push(`${t}=${o}`),n;let i=Math.max(r,Math.min(e,a));return i!==a&&Yt.push(`${t}=${o} used as ${i}`),i}var P=Kt("scale",1,1,3),pt=Math.trunc(Kt("frames",300,1,2e4)),w=1200*P,_=720*P,Q=document.getElementById("c");Q.width=w;Q.height=_;var vr=document.getElementById("log");function ve(t){document.title="REFUSED";let n=document.getElementById("log");n&&(n.textContent=t);let[r,...e]=t.split(":");throw qt?.showRefusal(r?.trim()??"REFUSED",e.join(":").trim()||t),new Error(t)}var qt=null;function z(t,n){return"kind"in n&&ve(`${t}: ${n.code} \u2014 ${n.reason} ${n.detail??""}`),n}var Y={target:[0,.62,.1],distance:8.4,azimuthDeg:1.5,elevationDeg:7.2,fovDeg:38},W=be(Y),lt=Y.fovDeg??38,Et=Math.max(.01,Y.distance/100),Gt=Math.max(Et+1,Y.distance*8),oe=.06,Rt=[{id:"P1",x:-3.55,z:-1.25,w:1.72,h:1.3,hex:"#16203A",roughness:.5},{id:"P2",x:-1.62,z:.75,w:1.3,h:1.62,hex:"#16203A",roughness:.46},{id:"P3",x:.18,z:2.35,w:1.44,h:1.36,hex:"#2C6BFF",roughness:.42},{id:"P4",x:1.62,z:1.15,w:1.2,h:1.54,hex:"#2C6BFF",roughness:.44},{id:"P5",x:3.62,z:-2.1,w:1.78,h:1.18,hex:"#16203A",roughness:.52}],Mr=.72,Jt=Rt.map(t=>{let n=Math.atan2(W[0]-t.x,W[2]-t.z)*Mr,r=Math.cos(n),e=Math.sin(n),o=[t.x+e*(oe/2),t.h/2,t.z+r*(oe/2)];return{id:t.id,yaw:n,eyeDistance:Math.hypot(W[0]-o[0],W[1]-o[1],W[2]-o[2])}}),Vt=["E1","E8","E0","E6","E5","E2"],Me=Object.keys(L).sort((t,n)=>(Vt.indexOf(t)+1||99)-(Vt.indexOf(n)+1||99)),Se=[...Jt].sort((t,n)=>t.eyeDistance-n.eyeDistance).map(t=>t.id),we=Me.slice(0,Se.length),ge=Me.slice(Se.length),Sr=new Map(we.map((t,n)=>[t,n+1])),Zt=kt({title:"E1 \xB7 The Theatre \u2014 3D programme state",readsAs:"The rendered view puts five of these on lit panels at graded depths and racks focus to the one being addressed, which states where to look at a glance. This table carries the same arrangement as a column of ordinals you have to read down, and no emphasis at all \u2014 and it carries every environment, including the four the five panels cannot show.",notices:["Each verdict is read from that environment's own README first line at build time, not typed here.",'Front-to-back is the rendered arrangement itself, not a description of it: it is the rank of the panel that environment occupies, by camera-to-face-centre distance, 1 nearest. "absent" means no panel \u2014 only five of nine are in the room.'],columns:[{key:"id",label:"Env"},{key:"depth",label:"Front-to-back (1 = nearest)",numeric:!0},{key:"name",label:"Name"},{key:"verdict",label:"Verdict (from its README)"}],rows:Object.values(L).map(t=>({id:t.id,name:t.name,verdict:t.verdict,depth:Sr.get(t.id)??null}))});qt=Zt;bt.length>0&&ve(`BAD_PARAM: ${bt.join(", ")} \u2014 not a number, so the theatre was refused rather than drawn from a nonsensical value. Every row below is unaffected; correct the URL and reload.`);ne.get("refuse")==="1"&&ve("FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. The three-dimensional view is not being drawn.");var Re=Ue(Q,{alpha:!1});Ne(Re)||ve(`stage: ${Re.code} \u2014 ${Re.reason}`);var C=Re,R=C.gl,wr=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,_r=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${Ge}
${Ve}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,Lr=z("present",C.compile(wr,_r)),ct=z("lit",it(C)),ee=z("target",rt(C,w,_)),xt=z("shadow",nt(C,he(gt,1536))),Dr=z("sky",ot(C)),Ht=z("ao",st(C,w,_)),zt=z("dof",ut(C,w,_)),er=Xe(30,24),tr=Rt.map(t=>ze(t.w,t.h,oe)),Pr=z("deck mesh",Te(C,er)),Nr=tr.map((t,n)=>z(`panel ${n} mesh`,Te(C,t))),rr=(t,n,r,e)=>{let o=de(),a=Math.cos(e),i=Math.sin(e);return o[0]=a,o[2]=-i,o[8]=i,o[10]=a,o[12]=t,o[13]=n,o[14]=r,o},Ur=t=>new Float32Array([t[0],t[1],t[2],t[4],t[5],t[6],t[8],t[9],t[10]]),H=Rt.map((t,n)=>{let{yaw:r,eyeDistance:e}=Jt[n],o=Math.cos(r),a=Math.sin(r),i=rr(t.x,t.h/2,t.z,r);return{...t,yaw:r,model:i,facePoint:(u,l)=>[t.x+o*u+a*(oe/2),l,t.z-a*u+o*(oe/2)],mesh:Nr[n],normalMat:Ur(i),eyeDistance:e}}),nr=H.reduce((t,n)=>n.eyeDistance<t.eyeDistance?n:t),_e=nr.eyeDistance,Cr=new Float32Array([1,0,0,0,1,0,0,0,1]),dt=[{mesh:Pr,model:rr(0,0,0,0),normalMat:Cr,material:{baseColour:ae("#070B14"),roughness:.86,metalness:0}},...H.map(t=>({mesh:t.mesh,model:t.model,normalMat:t.normalMat,material:{baseColour:ae(t.hex),roughness:t.roughness,metalness:.06}}))],j=[.62,-.55,-.58],or=[-4.8,0,-4.6],ar=[6.2,1.9,3],Br=tt(or,ar),Or=et(or,ar),Xt=Ze({direction:j,colour:[1,1,1],extent:7.6},Br,Or),Ir=[er,...tr].reduce((t,n)=>t+je(n),0);function Fe(){let t=pe(Y,w/_);ct.shadowPass(Xt,dt,xt),ee.bind(),R.clear(R.DEPTH_BUFFER_BIT),Dr.draw({eye:W,target:Y.target,fovDeg:lt,aspect:w/_}),ct.depthPrepass(t,dt),ht&&(Ht.compute({depthTexture:ee.depthTexture,near:Et,far:Gt,fovDeg:lt,aspect:w/_,radius:.5,strength:1.3}),ee.bind()),ct.draw({viewProj:t,eye:W,lightDir:j,lightColour:[3.5,3.45,3.3],ambientGain:1.05,lightVP:Xt,shadow:xt,shadowStrength:.92,shadowTaps:le.shadowTaps,shadowBaseline:1536,draws:dt,ao:ht?Ht.texture:null,screenSize:[w,_]});let n=ee.texture;Ae&&(zt.apply({scene:ee.texture,depthTexture:ee.depthTexture,near:Et,far:Gt,fovDeg:lt,aspect:w/_,focusDistance:_e,aperture:.16,maxCoc:.014}),n=zt.texture),R.bindFramebuffer(R.FRAMEBUFFER,null),R.viewport(0,0,w,_),R.disable(R.DEPTH_TEST),R.activeTexture(R.TEXTURE0),R.bindTexture(R.TEXTURE_2D,n),C.blit(Lr,r=>R.uniform1i(R.getUniformLocation(r,"uScene"),0))}Fe();var jt=4e3;function kr(t){let n=new Uint8Array(4),r=performance.now();Fe(),R.readPixels(0,0,1,1,R.RGBA,R.UNSIGNED_BYTE,n);let e=Math.max(.01,performance.now()-r),o=Math.min(t,Math.max(1,Math.floor(jt/e))),a=performance.now(),i=0;for(let s=0;s<o&&(Fe(),i++,!(performance.now()-a>jt));s++);return R.readPixels(0,0,1,1,R.RGBA,R.UNSIGNED_BYTE,n),{msPerFrame:(performance.now()-a)/i,measured:i}}var yt=kr(pt),mt=yt.msPerFrame,Le=pe(Y,w/_),Gr=t=>[t.facePoint(-t.w/2,0),t.facePoint(t.w/2,0),t.facePoint(t.w/2,t.h),t.facePoint(-t.w/2,t.h)].map(n=>$(Le,n,w,_)),te=H.map(Gr),At=(t,n,r)=>{let e=0;for(let o=0;o<4;o++){let a=t[o],i=t[(o+1)%4],s=(i.sx-a.sx)*(r-a.sy)-(i.sy-a.sy)*(n-a.sx);if(Math.abs(s)<1e-9)continue;let u=s>0?1:-1;if(e===0)e=u;else if(u!==e)return!1}return!0},se=(()=>{let t=Math.hypot(j[0],j[1],j[2]);return[-j[0]/t,-j[1]/t,-j[2]/t]})(),ir=(t,n,r,e)=>H.some((o,a)=>{if(a===e)return!1;let i=Math.cos(o.yaw),s=Math.sin(o.yaw),u=s*se[0]+i*se[2];if(Math.abs(u)<1e-6)return!1;let l=(s*(o.x-t)+i*(o.z-r))/u;if(l<=0)return!1;let c=t+se[0]*l,d=n+se[1]*l,f=r+se[2]*l,h=(c-o.x)*i-(f-o.z)*s;return Math.abs(h)<=o.w/2&&d>=0&&d<=o.h}),Vr=H.map((t,n)=>{let r=0,e=0,o=0,a=null;for(let c=1;c<=15;c++)for(let d=1;d<=23;d++){let f=(d/24-.5)*t.w,h=c/16*t.h,E=t.facePoint(f,h),m=$(Le,E,w,_);if(e++,ir(E[0],E[1],E[2],n)&&o++,m.behind||m.sx<0||m.sx>=w||m.sy<0||m.sy>=_||H.some((F,v)=>v!==n&&F.eyeDistance<t.eyeDistance&&At(te[v],m.sx,m.sy)))continue;r++;let x=Math.abs(f)/t.w+Math.abs(h-t.h/2)/t.h;(!a||x<a.rank)&&(a={sx:m.sx,sy:m.sy,rank:x})}let i=new Uint8Array(4);a&&R.readPixels(Math.round(a.sx),Math.round(_-a.sy),1,1,R.RGBA,R.UNSIGNED_BYTE,i);let s=Math.min(.014,Math.abs(1/_e-1/t.eyeDistance)*.16),u=te[n].map(c=>c.sx),l=te[n].map(c=>c.sy);return{id:t.id,hex:t.hex,eyeDistance:Number(t.eyeDistance.toFixed(2)),yawDeg:Number((t.yaw*180/Math.PI).toFixed(1)),cocPx:Number((s*(w/P)).toFixed(1)),visiblePct:Math.round(100*r/e),inShadowPct:Math.round(100*o/e),offFrame:te[n].some(c=>c.behind||c.sx<0||c.sx>w||c.sy<0||c.sy>_),screen:[Math.round(Math.min(...u)/P),Math.round(Math.min(...l)/P),Math.round(Math.max(...u)/P),Math.round(Math.max(...l)/P)],sample:a?{sx:Math.round(a.sx/P),sy:Math.round(a.sy/P),rgb:[i[0],i[1],i[2]]}:null}}),Hr=(()=>{let t=new Uint8Array(4),n={lit:{r:0,g:0,b:0,n:0},shade:{r:0,g:0,b:0,n:0}};for(let e=-5;e<=5.001;e+=.25)for(let o=-3.5;o<=4.001;o+=.25){let a=$(Le,[e,0,o],w,_);if(a.behind||a.sx<0||a.sx>=w||a.sy<0||a.sy>=_||te.some(s=>At(s,a.sx,a.sy)))continue;R.readPixels(Math.round(a.sx),Math.round(_-a.sy),1,1,R.RGBA,R.UNSIGNED_BYTE,t);let i=ir(e,0,o,-1)?n.shade:n.lit;i.r+=t[0],i.g+=t[1],i.b+=t[2],i.n+=1}let r=e=>e.n===0?null:[Math.round(e.r/e.n),Math.round(e.g/e.n),Math.round(e.b/e.n)];return{litSamples:n.lit.n,litRgb:r(n.lit),shadowedSamples:n.shade.n,shadowedRgb:r(n.shade)}})(),zr={E0:"GGX + shadows + AO + DOF. 1.305 ms/frame at 1x on the M1, by trailing-readPixels",E1:"real DOM content projected onto lit GL surfaces \u2014 the panel you are reading",E2:"seven corridors, lift monotonic with distance; no landmasses yet",E5:"driven from the same input as the shipping flat engine; cell counts agree exactly",E6:"depth is time; fog is the reading limit on it, and both horizons are reported",E8:"on the sign-in route in both themes, with a CSS fallback and a pixel ratchet"},Xr=t=>{let n=t.split(/[.·—]/)[0].trim();if(n.length<=26)return n.toUpperCase();let r=n.slice(0,26),e=r.lastIndexOf(" ");return(e>8?r.slice(0,e):r).toUpperCase()},jr=Object.fromEntries(we.map((t,n)=>{let r=Se[n],e=L[t];return[r,{tag:`${e.id} \xB7 ${e.name}`,state:Xr(e.verdict),note:zr[t]??e.verdict}]})),Wt=250,$t=.11,ue=.1,re=(t,n)=>{let r=document.createElement("div");return r.style.cssText=t,r.textContent=n,r},De=document.createElement("div");De.style.cssText="position:absolute;inset:0;pointer-events:none";var Pe=document.createElement("div");Pe.style.cssText="position:relative;overflow:hidden;width:1200px;height:720px";Q.parentNode?.insertBefore(Pe,Q);Pe.appendChild(Q);Pe.appendChild(De);var sr=[...H].map((t,n)=>({p:t,i:n})).sort((t,n)=>n.p.eyeDistance-t.p.eyeDistance),Wr=new Map(sr.map(({p:t},n)=>[t.id,n])),$r=Se.slice(0,we.length).map(t=>sr.find(n=>n.p.id===t)).filter(t=>t!==void 0),Qr=[0,.06,-.06,.12,-.12,.18,-.18,.24,-.24,.3,-.3,.36,-.36],Yr=[1,.92,.84,.76,.68,.6],ur=t=>Math.min(.014,Math.abs(1/_e-1/t)*.16)*(w/P),Qt=Math.max(...H.map(t=>ur(t.eyeDistance))),Kr=.34,qr=.06,Jr=$r.map(({p:t,i:n})=>{let r=jr[t.id],e=Wr.get(t.id)??0,o=oe/2+.008,a=Math.cos(t.yaw),i=Math.sin(t.yaw),s=(p,y)=>[t.x+a*p+i*o,y,t.z-i*p+a*o],u=(p,y,g)=>({topLeft:s(g-p/2,ue+y),topRight:s(g+p/2,ue+y),bottomRight:s(g+p/2,ue),bottomLeft:s(g-p/2,ue)}),l=p=>p.filter(y=>H.some((g,M)=>M!==n&&g.eyeDistance<t.eyeDistance&&At(te[M],y.x*P,y.y*P))).length,c=null,d=null,f=4;e:for(let p of Yr){let y=Math.max(.2,(t.w-2*$t)*p),g=Math.max(.2,(t.h-2*ue)*p),M=Math.round(y*Wt),B=Math.round(g*Wt);for(let U of Qr){if(Math.abs(U)+y/2>t.w/2-$t*.5)continue;let G=We(Le,u(y,g,U),w/P,_/P,M,B);if($e(G)){d=G.refusal;continue}let O=l(G.screen);if(f=Math.min(f,O),O===0&&G.signedArea>0){c={proj:G,ew:M,eh:B,shift:U,scale:p,occluded:O};break e}}}if(!c)return{id:t.id,shown:!1,refusal:d??"NO_UNOCCLUDED_PLACEMENT",backFacing:!1,occludedCorners:f,contentShift:null,contentScale:null,perspectiveX:null,elementPx:null,rectError:null};let{proj:h,ew:E,eh:m}=c,x=t.hex==="#2C6BFF",F=x?"#EAF1FF":"#7fb2ff",v=x?"#FFFFFF":"#C6D4EC",S=ur(t.eyeDistance),N=Ae?Kr*(S/Math.max(1e-6,Qt)):0,b=Ae?1-qr*(S/Math.max(1e-6,Qt)):1,T=document.createElement("div");T.style.cssText=["position:absolute","left:0","top:0",`width:${E}px`,`height:${m}px`,"pointer-events:auto","user-select:text","-webkit-user-select:text",`z-index:${e}`,"transform-origin:0 0",`transform:${h.transform}`,"display:flex","flex-direction:column","justify-content:flex-end","gap:7px","overflow:hidden",`filter:blur(${N.toFixed(2)}px)`,`opacity:${b.toFixed(3)}`,"-webkit-font-smoothing:antialiased"].join(";"),T.appendChild(re(`font:600 11px/1 ui-monospace,monospace;letter-spacing:.14em;color:${F}`,r.tag)),T.appendChild(re("font:700 27px/1.02 system-ui,sans-serif;color:#fff;letter-spacing:-0.01em",r.state)),T.appendChild(re(`font:400 11.5px/1.45 system-ui,sans-serif;color:${v}`,r.note)),De.appendChild(T);let A=null;{let p=Q.getBoundingClientRect(),y=T.getBoundingClientRect(),g=h.screen.map(B=>B.x),M=h.screen.map(B=>B.y);A=Number(Math.max(Math.abs(y.left-p.left-Math.min(...g)),Math.abs(y.top-p.top-Math.min(...M)),Math.abs(y.right-p.left-Math.max(...g)),Math.abs(y.bottom-p.top-Math.max(...M))).toFixed(2))}return{id:t.id,shown:!0,refusal:null,backFacing:!1,occludedCorners:0,contentShift:Number(c.shift.toFixed(2)),contentScale:c.scale,perspectiveX:Number((h.matrix[6]*1e3).toFixed(3)),elementPx:[E,m],cocPx:Number(S.toFixed(1)),domBlurPx:Number(N.toFixed(2)),domOpacity:Number(b.toFixed(3)),rectError:A}}),lr=(()=>{let t=R.getExtension("WEBGL_debug_renderer_info");return t?String(R.getParameter(t.UNMASKED_RENDERER_WEBGL)):"unknown"})(),ft=/swiftshader|llvmpipe|software/i.test(lr);{let t=document.createElement("div");t.style.cssText="position:absolute;left:16px;top:14px;display:flex;flex-direction:column;gap:5px;font:500 10.5px/1.4 ui-monospace,monospace;letter-spacing:.05em;background:rgba(4,6,11,0.82);padding:9px 11px;border-radius:5px;pointer-events:auto;user-select:text;-webkit-user-select:text",t.appendChild(re("color:#8FB7FF;font-weight:600;letter-spacing:.15em",`3D PROGRAMME \xB7 ${Me.length} ENVIRONMENTS`)),t.appendChild(re("color:rgba(196,212,240,0.8)","STATE DERIVED FROM EACH README AT BUILD TIME")),ge.length&&t.appendChild(re("color:#E0A94A",`${ge.length} NOT SHOWN \u2014 ONLY 5 PANELS: ${ge.join(" ")}`)),De.appendChild(t)}var Tt=He();if(Tt.length>0){let t="BRAND FIDELITY FAILED \u2014 "+Tt.map(r=>`${r.key}: expected ${r.expected}, got ${r.actual}`).join("; ");document.title="REFUSED";let n=document.getElementById("log");throw n&&(n.textContent=t),new Error(t)}var cr={tier:le.tier,tierDprScale:le.dprScale,tierShadowMapSize:he(gt,1536),shadowBaseline:1536,brandFidelity:Tt,dof:Ae,ao:ht,hdr:C.hdr,eye:W.map(t=>Number(t.toFixed(2))),focusPanel:nr.id,focusDistance:Number(_e.toFixed(2)),panels:Vr,projections:Jr,environments:Me,environmentsShown:we,environmentsOmitted:ge,deck:Hr,glError:R.getError(),triangles:Ir,shadowMap:xt.size,resolution:`${w}x${_}`,dprScale:P,frames:yt.measured,framesRequested:pt,sweepTruncated:yt.measured<pt,paramClamps:Yt,msPerFrame:Number(mt.toFixed(3)),fps:Math.round(1e3/mt),renderer:lr,rendererClass:ft?"software":"hardware",headroom:ft?null:Number((16.6-mt).toFixed(3)),headroomRefusal:ft?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null,hardwareMsPerFrame:null};globalThis.E1=cr;vr.textContent=JSON.stringify(cr,null,2);Fe();Zt.markRendered();document.title="READY";

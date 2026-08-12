var _n={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected."};function H(t,r){return r===void 0?{kind:"refused",code:t,reason:_n[t]}:{kind:"refused",code:t,reason:_n[t],detail:r}}function vt(t){return t.kind==="stage"}function Mt(t,r={}){let n=t.getContext("webgl2",{antialias:r.antialias??!1,alpha:r.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!n)return H("NO_WEBGL2");let e=n.getExtension("EXT_color_buffer_float"),o=t.width,a=t.height,i=e?n.RGBA16F:n.RGBA8,l=e?n.HALF_FLOAT:n.UNSIGNED_BYTE,u=(x,T)=>{let v=n.createTexture();n.bindTexture(n.TEXTURE_2D,v),n.texImage2D(n.TEXTURE_2D,0,i,x,T,0,n.RGBA,l,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE);let S=n.createFramebuffer();n.bindFramebuffer(n.FRAMEBUFFER,S),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,v,0);let F=n.checkFramebufferStatus(n.FRAMEBUFFER);return F!==n.FRAMEBUFFER_COMPLETE?H("FRAMEBUFFER_INCOMPLETE",`status 0x${F.toString(16)} at ${x}\xD7${T}`):{texture:v,framebuffer:S,width:x,height:T}},p=r.bloomShift??2,c={w:o,h:a},d=u(o,a);if("kind"in d)return d;let f=u(Math.max(1,o>>p),Math.max(1,a>>p));if("kind"in f)return f;let b=u(Math.max(1,o>>p),Math.max(1,a>>p));if("kind"in b)return b;let m=n.createVertexArray();n.bindVertexArray(m);let R=n.createBuffer();n.bindBuffer(n.ARRAY_BUFFER,R),n.bufferData(n.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),n.STATIC_DRAW),n.enableVertexAttribArray(0),n.vertexAttribPointer(0,2,n.FLOAT,!1,0,0),n.bindVertexArray(null);let g=[];return{kind:"stage",gl:n,cssWidth:t.clientWidth||o,cssHeight:t.clientHeight||a,hdr:!!e,get width(){return c.w},get height(){return c.h},get scene(){return d},get bloomA(){return f},get bloomB(){return b},setRegion(x,T){let v=Math.max(1,Math.round(x)),S=Math.max(1,Math.round(T));if(!(v===c.w&&S===c.h)){c={w:v,h:S};for(let F of[d,f,b])"kind"in F||(n.deleteFramebuffer(F.framebuffer),n.deleteTexture(F.texture));d=u(v,S),f=u(Math.max(1,v>>p),Math.max(1,S>>p)),b=u(Math.max(1,v>>p),Math.max(1,S>>p))}},compile(x,T){let v=(U,D)=>{let A=n.createShader(U);return n.shaderSource(A,D),n.compileShader(A),n.getShaderParameter(A,n.COMPILE_STATUS)?A:H("SHADER_COMPILE_FAILED",n.getShaderInfoLog(A)??"(no log)")},S=v(n.VERTEX_SHADER,x);if(typeof S=="object"&&"kind"in S)return S;let F=v(n.FRAGMENT_SHADER,T);if(typeof F=="object"&&"kind"in F)return F;let L=n.createProgram();return n.attachShader(L,S),n.attachShader(L,F),n.linkProgram(L),n.getProgramParameter(L,n.LINK_STATUS)?(g.push(L),L):H("PROGRAM_LINK_FAILED",n.getProgramInfoLog(L)??"(no log)")},bindTarget(x){n.bindFramebuffer(n.FRAMEBUFFER,x?x.framebuffer:null),n.viewport(0,0,x?x.width:c.w,x?x.height:c.h)},blit(x,T){n.useProgram(x),n.bindVertexArray(m),T?.(x),n.drawArrays(n.TRIANGLES,0,3),n.bindVertexArray(null)},dispose(){for(let x of g)n.deleteProgram(x);for(let x of[d,f,b])"kind"in x||(n.deleteFramebuffer(x.framebuffer),n.deleteTexture(x.texture));n.deleteBuffer(R),n.deleteVertexArray(m)}}}var nt=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function rt(t,r){let n=new Float32Array(16);for(let e=0;e<4;e++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=t[i*4+o]*r[e*4+i];n[e*4+o]=a}return n}var Pe=(t,r)=>[t[0]-r[0],t[1]-r[1],t[2]-r[2]],tt=(t,r)=>t[0]*r[0]+t[1]*r[1]+t[2]*r[2],De=(t,r)=>[t[1]*r[2]-t[2]*r[1],t[2]*r[0]-t[0]*r[2],t[0]*r[1]-t[1]*r[0]];function te(t){let r=Math.hypot(t[0],t[1],t[2]);return r===0?t:[t[0]/r,t[1]/r,t[2]/r]}function _t(t,r,n,e){let o=1/Math.tan(t/2);return new Float32Array([o/r,0,0,0,0,o,0,0,0,0,(e+n)/(n-e),-1,0,0,2*e*n/(n-e),0])}function St(t,r,n,e,o,a){let i=r-t,l=e-n,u=a-o;return new Float32Array([2/i,0,0,0,0,2/l,0,0,0,0,-2/u,0,-(r+t)/i,-(e+n)/l,-(a+o)/u,1])}function ot(t,r,n){let e=te(Pe(t,r)),o=De(n,e);if(Math.hypot(o[0],o[1],o[2])<1e-8)return nt();let a=te(o),i=De(e,a);return new Float32Array([a[0],i[0],e[0],0,a[1],i[1],e[1],0,a[2],i[2],e[2],0,-tt(a,t),-tt(i,t),-tt(e,t),1])}function Sn(t,r){let n=[0,1,2,3].map(o=>t[0+o]*r[0]+t[4+o]*r[1]+t[8+o]*r[2]+t[12+o]),e=n[3];return{x:n[0]/e,y:n[1]/e,z:n[2]/e,w:e}}function ne(t,r,n,e){let o=Sn(t,r);return{sx:(o.x*.5+.5)*n,sy:(1-(o.y*.5+.5))*e,behind:o.w<=0}}function Fn(t){return t<=.04045?t/12.92:Math.pow((t+.055)/1.055,2.4)}var xr=/^#?([0-9a-fA-F]{6})$/;function ce(t){let r=xr.exec(t.trim());if(!r)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(t)}`);let n=r[1];return[0,2,4].map(e=>Fn(parseInt(n.slice(e,e+2),16)/255))}var Ft={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},gr=Object.freeze(Object.fromEntries(Object.keys(Ft).map(t=>[t,ce(Ft[t])])));var Ln=.4;var Lt=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${Ln.toFixed(2)}); }`,wt=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function wn(t){let r=[1/0,1/0,1/0],n=[-1/0,-1/0,-1/0];for(let e=0;e<t.length;e+=3)for(let o=0;o<3;o++){let a=t[e+o];a<r[o]&&(r[o]=a),a>n[o]&&(n[o]=a)}return t.length===0?{min:[0,0,0],max:[0,0,0]}:{min:r,max:n}}function Dn(t,r,n,e){let o=new Float32Array(t.length);for(let i=0;i<e.length;i+=3){let l=e[i],u=e[i+1],p=e[i+2],c=l*3,d=u*3,f=p*3,b=l*2,m=u*2,R=p*2,g=t[d]-t[c],M=t[d+1]-t[c+1],x=t[d+2]-t[c+2],T=t[f]-t[c],v=t[f+1]-t[c+1],S=t[f+2]-t[c+2],F=n[m]-n[b],L=n[m+1]-n[b+1],U=n[R]-n[b],D=n[R+1]-n[b+1],A=F*D-U*L;if(Math.abs(A)<1e-12)continue;let y=1/A,E=(g*D-T*L)*y,_=(M*D-v*L)*y,z=(x*D-S*L)*y;for(let N of[c,d,f])o[N]=o[N]+E,o[N+1]=o[N+1]+_,o[N+2]=o[N+2]+z}let a=new Float32Array(t.length);for(let i=0;i<a.length;i+=3){let l=r[i],u=r[i+1],p=r[i+2],c=o[i],d=o[i+1],f=o[i+2],b=c*l+d*u+f*p;c-=l*b,d-=u*b,f-=p*b;let m=Math.hypot(c,d,f);m<1e-8&&(Math.abs(l)<.9?(c=0,d=-p,f=u):(c=-p,d=0,f=l),m=Math.hypot(c,d,f)||1),a[i]=c/m,a[i+1]=d/m,a[i+2]=f/m}return a}function Pn(t,r){let n=new Float32Array(t.length);for(let e=0;e<r.length;e+=3){let o=r[e]*3,a=r[e+1]*3,i=r[e+2]*3,l=t[a]-t[o],u=t[a+1]-t[o+1],p=t[a+2]-t[o+2],c=t[i]-t[o],d=t[i+1]-t[o+1],f=t[i+2]-t[o+2],b=u*f-p*d,m=p*c-l*f,R=l*d-u*c;for(let g of[o,a,i])n[g]=n[g]+b,n[g+1]=n[g+1]+m,n[g+2]=n[g+2]+R}for(let e=0;e<n.length;e+=3){let o=Math.hypot(n[e],n[e+1],n[e+2]);o>0&&(n[e]=n[e]/o,n[e+1]=n[e+1]/o,n[e+2]=n[e+2]/o)}return n}function Nn(t,r,n,e,o){let{min:a,max:i}=wn(t),l=e??Pn(t,n);return{positions:t,normals:l,uvs:r,indices:n,min:a,max:i,tangents:o??Dn(t,l,r,n)}}function He(t=1,r=1,n=1){let e=t/2,o=r/2,a=n/2,i=[[[-e,-o,a],[e,-o,a],[e,o,a],[-e,o,a]],[[e,-o,-a],[-e,-o,-a],[-e,o,-a],[e,o,-a]],[[e,-o,a],[e,-o,-a],[e,o,-a],[e,o,a]],[[-e,-o,-a],[-e,-o,a],[-e,o,a],[-e,o,-a]],[[-e,o,a],[e,o,a],[e,o,-a],[-e,o,-a]],[[-e,-o,-a],[e,-o,-a],[e,-o,a],[-e,-o,a]]],l=new Float32Array(72),u=new Float32Array(48),p=new Uint16Array(36),c=0,d=0,f=0,b=0;for(let m of i){for(let[R,g,M]of m)l[c++]=R,l[c++]=g,l[c++]=M;u[d++]=0,u[d++]=0,u[d++]=1,u[d++]=0,u[d++]=1,u[d++]=1,u[d++]=0,u[d++]=1,p[f++]=b,p[f++]=b+1,p[f++]=b+2,p[f++]=b,p[f++]=b+2,p[f++]=b+3,b+=4}return Nn(l,u,p)}function Dt(t=10,r=24){let n=Math.max(1,Math.floor(r)),e=(n+1)*(n+1),o=new Float32Array(e*3),a=new Float32Array(e*3),i=new Float32Array(e*2),l=new Uint16Array(n*n*6),u=0,p=0,c=0;for(let d=0;d<=n;d++)for(let f=0;f<=n;f++){let b=(f/n-.5)*t,m=(d/n-.5)*t;o[u]=b,o[u+1]=0,o[u+2]=m,a[u]=0,a[u+1]=1,a[u+2]=0,u+=3,i[p++]=f/n,i[p++]=d/n}for(let d=0;d<n;d++)for(let f=0;f<n;f++){let b=d*(n+1)+f,m=b+1,R=b+(n+1),g=R+1;l[c++]=b,l[c++]=R,l[c++]=m,l[c++]=m,l[c++]=R,l[c++]=g}return Nn(o,i,l,a)}function Ne(t){return t.indices.length/3}function Pt(t,r,n,e=4,o=4,a=1){let i=Math.max(2,Math.floor(t)),l=Math.max(2,Math.floor(r)),u=new Array(i*l),p=1/0,c=-1/0,d=0;for(let A=0;A<l;A++)for(let y=0;y<i;y++){let E=n(y,A),_=E!==null&&Number.isFinite(E);u[A*i+y]=_?E:null,_?(E<p&&(p=E),E>c&&(c=E)):d++}let f=d===i*l?null:[p,c],b=f&&c>p?c-p:0,m=A=>b===0?0:(A-p)/b*a,R=new Float32Array(i*l*3),g=new Float32Array(i*l*3),M=new Float32Array(i*l*2),x=new Float32Array(i*l*3),T=(A,y)=>A<0||A>=i||y<0||y>=l?null:u[y*i+A],v=e/(i-1),S=o/(l-1);for(let A=0;A<l;A++)for(let y=0;y<i;y++){let E=A*i+y,_=u[E]??null,z=-e/2+y*v,N=-o/2+A*S;R[E*3]=z,R[E*3+1]=_===null?0:m(_),R[E*3+2]=N,M[E*2]=i===1?0:y/(i-1),M[E*2+1]=l===1?0:A/(l-1);let Ke=(Ee,xe,ze)=>Ee!==null&&xe!==null?(m(xe)-m(Ee))/(2*ze):_===null?0:xe!==null?(m(xe)-m(_))/ze:Ee!==null?(m(_)-m(Ee))/ze:0,q=Ke(T(y-1,A),T(y+1,A),v),J=Ke(T(y,A-1),T(y,A+1),S),oe=Math.hypot(-q,1,-J);g[E*3]=-q/oe,g[E*3+1]=1/oe,g[E*3+2]=-J/oe;let ee=g[E*3],ke=g[E*3+1],Be=g[E*3+2],$=1-ee*ee,ae=-ee*ke,ie=-ee*Be,ye=Math.hypot($,ae,ie);ye<1e-6?($=0,ae=0,ie=1):($/=ye,ae/=ye,ie/=ye),x[E*3]=$,x[E*3+1]=ae,x[E*3+2]=ie}let F=[],L=0;for(let A=0;A<l-1;A++)for(let y=0;y<i-1;y++){let E=A*i+y,_=E+1,z=(A+1)*i+y,N=z+1;if(u[E]===null||u[_]===null||u[z]===null||u[N]===null){L++;continue}F.push(E,z,_,_,z,N)}let U=i*l>65535?new Uint32Array(F):new Uint16Array(F),D=wn(R);return{geometry:{positions:R,normals:g,uvs:M,tangents:x,indices:U,min:D.min,max:D.max},cellsDrawn:(i-1)*(l-1)-L,cellsHoles:L,pointsAbsent:d,observedRange:f}}function Tr(t){if(!Number.isFinite(t)||t===0)return"0";let r=t.toFixed(12).replace(/0+$/,"").replace(/\.$/,"");return r==="-0"?"0":r}function On(t,r,n,e){let[o,a]=t,[i,l]=r,[u,p]=n,[c,d]=e,f=o-i+u-c,b=a-l+p-d;if(Math.abs(f)<1e-9&&Math.abs(b)<1e-9){let S=[i-o,c-o,o,l-a,d-a,a,0,0,1],F=S[0]*S[4]-S[1]*S[3];return Math.abs(F)<1e-9?null:S}let m=i-u,R=c-u,g=l-p,M=d-p,x=m*M-R*g;if(Math.abs(x)<1e-9)return null;let T=(f*M-R*b)/x,v=(m*b-f*g)/x;return[i-o+T*i,c-o+v*c,o,l-a+T*l,d-a+v*d,a,T,v,1]}function Nt(t,r,n,e,o,a){if(!(o>0)||!(a>0))return{refusal:"EMPTY_ELEMENT_BOX"};let l=[r.topLeft,r.topRight,r.bottomRight,r.bottomLeft].map(y=>ne(t,y,n,e));if(l.some(y=>y.behind))return{refusal:"CORNER_BEHIND_CAMERA"};let u=l.map(y=>({x:y.sx,y:y.sy})),[p,c,d,f]=u,b=On([p.x,p.y],[c.x,c.y],[d.x,d.y],[f.x,f.y]);if(!b)return{refusal:"DEGENERATE_ON_SCREEN"};let m=.5*(p.x*c.y-c.x*p.y+(c.x*d.y-d.x*c.y)+(d.x*f.y-f.x*d.y)+(f.x*p.y-p.x*f.y)),R=1/o,g=1/a,[M,x,T,v,S,F,L,U,D]=b;return{transform:`matrix3d(${[M*R,v*R,0,L*R,x*g,S*g,0,U*g,0,0,1,0,T,F,0,D].map(Tr).join(", ")})`,matrix:b,screen:u,signedArea:m}}function Te(t){return"refusal"in t}var Ot=89,Ct=Math.PI/180;function at(t){let r=Math.max(-Ot,Math.min(Ot,t.elevationDeg))*Ct,n=t.azimuthDeg*Ct,e=Math.max(1e-4,t.distance),o=Math.sin(r)*e,a=Math.cos(r)*e;return[t.target[0]+Math.sin(n)*a,t.target[1]+o,t.target[2]+Math.cos(n)*a]}function it(t,r){let n=at(t),e=t.near??Math.max(.01,t.distance/100),o=t.far??Math.max(e+1,t.distance*8),a=_t((t.fovDeg??38)*Ct,Math.max(.001,r),e,o),i=ot(n,t.target,[0,1,0]);return rt(a,i)}function Ut(t,r,n){let e=te(t.direction),o=t.extent??Math.max(.1,n*1.35),a=Math.max(1,n*2),i=[r[0]-e[0]*a,r[1]-e[1]*a,r[2]-e[2]*a],l=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],u=ot(i,r,l),p=St(-o,o,-o,o,.01,a+n*2+o);return rt(p,u)}function It(t,r){let n=Pe([r[0],r[1],r[2]],[t[0],t[1],t[2]]);return Math.hypot(n[0],n[1],n[2])/2}function Gt(t,r){return[(t[0]+r[0])/2,(t[1]+r[1])/2,(t[2]+r[2])/2]}function kt(t,r,n){let{gl:e}=t,o=Math.max(1,Math.floor(r)),a=Math.max(1,Math.floor(n)),i=e.createFramebuffer(),l=e.createTexture(),u=e.createTexture();if(!i||!l||!u)return H("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let p=t.hdr?e.RGBA16F:e.RGBA8,c=t.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,d=()=>{e.bindTexture(e.TEXTURE_2D,l),e.texImage2D(e.TEXTURE_2D,0,p,o,a,0,e.RGBA,c,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,u),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,o,a,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,l,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,u,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};d(),e.bindFramebuffer(e.FRAMEBUFFER,i);let f=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),f!==e.FRAMEBUFFER_COMPLETE?H("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${f.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:l,depthTexture:u,get width(){return o},get height(){return a},bind(){e.bindFramebuffer(e.FRAMEBUFFER,i),e.viewport(0,0,o,a)},resize(b,m){let R=Math.max(1,Math.floor(b)),g=Math.max(1,Math.floor(m));R===o&&g===a||(o=R,a=g,d())},dispose(){e.deleteFramebuffer(i),e.deleteTexture(l),e.deleteTexture(u)}}}function Bt(t,r=1024){let{gl:n}=t,e=Math.max(256,Math.min(2048,Math.floor(r))),o=n.createFramebuffer(),a=n.createTexture();if(!o||!a)return H("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");n.bindTexture(n.TEXTURE_2D,a),n.texImage2D(n.TEXTURE_2D,0,n.DEPTH_COMPONENT24,e,e,0,n.DEPTH_COMPONENT,n.UNSIGNED_INT,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.bindFramebuffer(n.FRAMEBUFFER,o),n.framebufferTexture2D(n.FRAMEBUFFER,n.DEPTH_ATTACHMENT,n.TEXTURE_2D,a,0);let i=n.checkFramebufferStatus(n.FRAMEBUFFER);return n.bindFramebuffer(n.FRAMEBUFFER,null),i!==n.FRAMEBUFFER_COMPLETE?H("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:e,bind(){n.bindFramebuffer(n.FRAMEBUFFER,o),n.viewport(0,0,e,e)},dispose(){n.deleteFramebuffer(o),n.deleteTexture(a)}}}var lt=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,st={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function ut(t,r,n={}){let e=n.zenith??st.zenith,o=n.horizon??st.horizon,a=n.ground??st.ground;t.uniform3f(t.getUniformLocation(r,"uSkyZenith"),e[0],e[1],e[2]),t.uniform3f(t.getUniformLocation(r,"uSkyHorizon"),o[0],o[1],o[2]),t.uniform3f(t.getUniformLocation(r,"uSkyGround"),a[0],a[1],a[2])}var Ar=`#version 300 es
precision highp float;
out vec2 vNdc;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`,Rr=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${lt}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;function zt(t){let{gl:r}=t,n=t.compile(Ar,Rr);return"kind"in n?n:{draw(e){let o=te(Pe(e.target,e.eye)),a=Math.abs(o[1])>.999?[0,0,1]:[0,1,0],i=te(De(o,a)),l=te(De(i,o));r.disable(r.DEPTH_TEST),r.depthMask(!1),r.disable(r.BLEND),r.useProgram(n),r.uniform3f(r.getUniformLocation(n,"uRight"),i[0],i[1],i[2]),r.uniform3f(r.getUniformLocation(n,"uUp"),l[0],l[1],l[2]),r.uniform3f(r.getUniformLocation(n,"uForward"),o[0],o[1],o[2]),r.uniform1f(r.getUniformLocation(n,"uTanHalfFov"),Math.tan(e.fovDeg*Math.PI/360)),r.uniform1f(r.getUniformLocation(n,"uAspect"),Math.max(.001,e.aspect)),ut(r,n,e.sky),t.blit(n),r.depthMask(!0),r.enable(r.DEPTH_TEST)},dispose(){r.deleteProgram(n)}}}var Cn=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,Vt=`#version 300 es
precision highp float;
void main(){}`,vr=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,Un=`#version 300 es
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
}`,In=`#version 300 es
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
${lt}

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
}`;function Ae(t,r){let{gl:n}=t,e=n.createVertexArray(),o=n.createBuffer(),a=n.createBuffer(),i=n.createBuffer(),l=n.createBuffer();return!e||!o||!a||!i||!l?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(n.bindVertexArray(e),n.bindBuffer(n.ARRAY_BUFFER,o),n.bufferData(n.ARRAY_BUFFER,r.positions,n.STATIC_DRAW),n.enableVertexAttribArray(0),n.vertexAttribPointer(0,3,n.FLOAT,!1,0,0),n.bindBuffer(n.ARRAY_BUFFER,a),n.bufferData(n.ARRAY_BUFFER,r.normals,n.STATIC_DRAW),n.enableVertexAttribArray(1),n.vertexAttribPointer(1,3,n.FLOAT,!1,0,0),n.bindBuffer(n.ARRAY_BUFFER,i),n.bufferData(n.ARRAY_BUFFER,r.tangents,n.STATIC_DRAW),n.enableVertexAttribArray(2),n.vertexAttribPointer(2,3,n.FLOAT,!1,0,0),n.bindBuffer(n.ELEMENT_ARRAY_BUFFER,l),n.bufferData(n.ELEMENT_ARRAY_BUFFER,r.indices,n.STATIC_DRAW),n.bindVertexArray(null),{vao:e,indexCount:r.indices.length,indexType:r.indices instanceof Uint32Array?n.UNSIGNED_INT:n.UNSIGNED_SHORT,dispose(){n.deleteVertexArray(e),n.deleteBuffer(o),n.deleteBuffer(a),n.deleteBuffer(i),n.deleteBuffer(l)}})}function Ht(t){let{gl:r}=t,n=t.compile(Cn,Vt);if("kind"in n)return n;let e=t.compile(Un,In);if("kind"in e)return e;let o=t.compile(vr,Vt);if("kind"in o)return o;let a=(i,l)=>r.getUniformLocation(i,l);return{shadowPass(i,l,u,p){let c=p??(()=>{});u.bind(),c("shadow.bind"),r.clear(r.DEPTH_BUFFER_BIT),r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.FRONT),r.useProgram(n),c("useProgram(shadow)"),r.uniformMatrix4fv(a(n,"uLightVP"),!1,i),c("uLightVP");for(let d of l)r.uniformMatrix4fv(a(n,"uModel"),!1,d.model),c("shadow uModel"),r.bindVertexArray(d.mesh.vao),c("shadow bindVAO"),r.drawElements(r.TRIANGLES,d.mesh.indexCount,d.mesh.indexType,0),c("shadow drawElements");r.bindVertexArray(null),r.cullFace(r.BACK)},depthPrepass(i,l){r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.colorMask(!1,!1,!1,!1),r.useProgram(o),r.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let u of l)r.uniformMatrix4fv(a(o,"uModel"),!1,u.model),r.bindVertexArray(u.mesh.vao),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0);r.bindVertexArray(null),r.colorMask(!0,!0,!0,!0)},draw(i){let l=i.onStep??(()=>{});if(r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.useProgram(e),r.uniformMatrix4fv(a(e,"uViewProj"),!1,i.viewProj),l("uViewProj"),r.uniform3fv(a(e,"uEye"),i.eye),l("uEye"),r.uniform3fv(a(e,"uLightDir"),i.lightDir),l("uLightDir"),r.uniform3fv(a(e,"uLightColour"),i.lightColour),l("uLightColour"),r.uniform1f(a(e,"uAmbientGain"),i.ambientGain??1),l("uAmbientGain"),i.fog&&i.fog.density>0){r.uniform1f(a(e,"uFogDensity"),i.fog.density),r.uniform1f(a(e,"uFogHeight"),i.fog.height),r.uniform1f(a(e,"uFogFloor"),i.fog.floor??0);let u=i.fog.colour;u==="sky"?r.uniform3f(a(e,"uFogColour"),-1,-1,-1):r.uniform3f(a(e,"uFogColour"),u[0],u[1],u[2]),l("fog")}else r.uniform1f(a(e,"uFogDensity"),0);ut(r,e,i.sky),l("bindSky"),i.ao&&i.screenSize?(r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,i.ao),r.uniform1i(a(e,"uAO"),1),r.uniform2f(a(e,"uScreenSize"),i.screenSize[0],i.screenSize[1]),r.uniform1f(a(e,"uAOEnabled"),1)):r.uniform1f(a(e,"uAOEnabled"),0),l("bindAO"),r.uniformMatrix4fv(a(e,"uLightVP"),!1,i.lightVP),l("lit uLightVP"),i.shadow?(r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,i.shadow.depthTexture),r.uniform1i(a(e,"uShadowMap"),0),r.uniform1f(a(e,"uShadowTexel"),1/i.shadow.size),r.uniform1f(a(e,"uShadowStrength"),i.shadowStrength??1)):r.uniform1f(a(e,"uShadowStrength"),0);for(let u of i.draws)r.uniformMatrix4fv(a(e,"uModel"),!1,u.model),r.uniformMatrix3fv(a(e,"uNormalMat"),!1,u.normalMat),l("uNormalMat"),r.uniform3fv(a(e,"uBaseColour"),u.material.baseColour),l("uBaseColour"),r.uniform1f(a(e,"uRoughness"),u.material.roughness),r.uniform1f(a(e,"uMetalness"),u.material.metalness),r.uniform1f(a(e,"uAnisotropy"),u.material.anisotropy??0),r.bindVertexArray(u.mesh.vao),l("lit bindVAO"),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0),l("lit drawElements");r.bindVertexArray(null),r.disable(r.CULL_FACE)},dispose(){r.deleteProgram(n),r.deleteProgram(e),r.deleteProgram(o)}}}var jt=`
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
}`,Gn=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Mr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${jt}

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
}`,_r=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${jt}

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
}`;function $t(t,r,n){let{gl:e}=t,o=t.compile(Gn,Mr);if("kind"in o)return o;let a=t.compile(Gn,_r);if("kind"in a)return a;let i=Math.max(1,r>>1),l=Math.max(1,n>>1),u=()=>{let m=e.createFramebuffer(),R=e.createTexture();return!m||!R?null:{fb:m,tex:R}},p=u(),c=u();if(!p||!c)return H("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let d=()=>{for(let m of[p,c])e.bindTexture(e.TEXTURE_2D,m.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,i,l,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,m.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,m.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};d(),e.bindFramebuffer(e.FRAMEBUFFER,p.fb);let f=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),f!==e.FRAMEBUFFER_COMPLETE)return H("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${f.toString(16)}).`);let b=(m,R,g,M,x,T,v)=>{e.activeTexture(e.TEXTURE0+v),e.bindTexture(e.TEXTURE_2D,R),e.uniform1i(e.getUniformLocation(m,"uDepth"),v),e.uniform2f(e.getUniformLocation(m,"uNearFar"),g,M),e.uniform1f(e.getUniformLocation(m,"uTanHalfFov"),Math.tan(x*Math.PI/360)),e.uniform1f(e.getUniformLocation(m,"uAspect"),T)};return{get texture(){return p.tex},get width(){return i},get height(){return l},compute(m){e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,p.fb),e.viewport(0,0,i,l),e.useProgram(o),b(o,m.depthTexture,m.near,m.far,m.fovDeg,m.aspect,0),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/i,1/l),e.uniform1f(e.getUniformLocation(o,"uRadius"),m.radius??.55),e.uniform1f(e.getUniformLocation(o,"uStrength"),m.strength??1.15),e.uniform1f(e.getUniformLocation(o,"uBias"),m.bias??.035),t.blit(o);for(let[R,g,M]of[[p,c,[1,0]],[c,p,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,g.fb),e.viewport(0,0,i,l),e.useProgram(a),b(a,m.depthTexture,m.near,m.far,m.fovDeg,m.aspect,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,R.tex),e.uniform1i(e.getUniformLocation(a,"uAO"),1),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/i,1/l),e.uniform2f(e.getUniformLocation(a,"uDir"),M[0],M[1]),t.blit(a);e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(m,R){let g=Math.max(1,m>>1),M=Math.max(1,R>>1);g===i&&M===l||(i=g,l=M,d())},dispose(){e.deleteProgram(o),e.deleteProgram(a);for(let m of[p,c])e.deleteFramebuffer(m.fb),e.deleteTexture(m.tex)}}}var Xt={instrument:"LCX_HOUSE_DOCTRINE",provision:"absent data refuses",text:'Absent data refuses. It never renders 0, never an estimate, never an empty list that reads as "nothing happened". A refusal carries a stable code and cites the rule it applies.'},Wt={instrument:"LCX_HOUSE_DOCTRINE",provision:"three states are never collapsed",text:"Three states are never collapsed: not-loaded / present-but-withheld / genuinely-empty."},Oe={instrument:"LCX_HOUSE_DOCTRINE",provision:"an inference is never laundered into a certainty",text:"An inference is never laundered into a certainty. If you cannot know, say you cannot know."},kn={instrument:"LCX_HOUSE_DOCTRINE",provision:"every figure from a database carries an ObservationFrame and an environment label",text:"Every figure carries an ObservationFrame and an environment label where it came from a database."},Bn={instrument:"LCX_HOUSE_DOCTRINE",provision:"a projection is a choice, not a fact",text:"Placeholders must look like placeholders, and a view must name itself. A picture that does not state its projection is read as the data rather than as one view of it."},Sr="No interpolation. A cell is drawn only where all four of its corners were observed; a missing corner leaves a hole and is never smoothed over from its neighbours.",Fr=3,Lr=Math.atan(1/Math.SQRT2)*180/Math.PI,Qt={azimuthDeg:45,elevationDeg:Lr,scale:1},dt=Math.PI/180;function O(t,r=Qt){let n=r.azimuthDeg*dt,e=r.elevationDeg*dt,o=Math.sin(n),a=Math.cos(n),i=Math.sin(e),l=Math.cos(e);return{sx:(-t.x*o+t.y*a)*r.scale,sy:(t.x*i*a+t.y*i*o-t.z*l)*r.scale,depth:t.x*l*a+t.y*l*o+t.z*i}}function je(t,r,n=Qt){let e=n.azimuthDeg*dt,o=n.elevationDeg*dt;return t*Math.cos(o)*Math.cos(e)+r*Math.cos(o)*Math.sin(e)}function wr(t){if(!Number.isFinite(t.azimuthDeg)||!Number.isFinite(t.elevationDeg)||!Number.isFinite(t.scale)||t.scale<=0)return!0;let r=(t.elevationDeg%360+360)%360;if(r<=0||r>=90)return!0;let n=(t.azimuthDeg%90+90)%90;return n<1e-9||Math.abs(n-90)<1e-9}function Dr(t,r){let n=ct(t.azimuthDeg,1),e=ct(t.elevationDeg,1),o=ct(r.height/r.width,2);return`Axonometric projection, orthographic (no perspective): azimuth ${n}\xB0, elevation ${e}\xB0. Vertical axis drawn at ${o}\xD7 the plan width \u2014 a CHOICE of exaggeration, not a property of the data. One view of two; ask for another azimuth to see the far face.`}var Pr={width:100,depth:100,height:62},zn=4,Nr=.62,Vn=2;function Or(t){return[t.width,t.depth,t.height].every(r=>Number.isFinite(r)&&r>0)}var Re="withheld";function jn(t){return t.kind==="projected"}function ct(t,r){if(!Number.isFinite(t))return t;let n=10**r,e=t*n;return!Number.isFinite(e)||e===0&&t!==0?t:Math.round(e)/n}function Hn(t){return t===0?0:t}function Cr(t,r,n=4){if(!Number.isFinite(t)||!Number.isFinite(r))return[];if(r===t)return[Hn(t)];if(t>r)return[];let e=(r-t)/Math.max(1,n),o=Math.floor(Math.log10(e));if(!Number.isFinite(o))return[];let a=d=>{if(!Number.isFinite(d)||d<=0)return 0;let f=Math.ceil(t/d-1e-9)*d;return Number.isFinite(f)?Math.max(0,Math.floor((r-f)/d+1e-9)+1):0},i=0,l=1/0;for(let d of[1,2,5,10]){let f=d*10**o,b=a(f);if(b<2)continue;let m=Math.abs(b-n);(m<l||m===l&&f<i)&&(l=m,i=f)}if(i<=0&&(i=e),!Number.isFinite(i)||i<=0)return[];let u=Math.ceil(t/i-1e-9)*i;if(!Number.isFinite(u))return[];let p=new Set,c=[];for(let d=u,f=0;d<=r+i*1e-9&&f<4096;d+=i,f++){let b=Hn(ct(d,9));p.has(b)||(p.add(b),c.push(b))}return c}function I(t,r,n,e,o){return{code:t,sentence:r,rule:n,cell:e,environment:o}}function Yt(t,r,n,e){return n===r?e/2:(t-r)/(n-r)*e}function $n(t){let r=t.view??Qt,n=t.box??Pr,e=t.frame.environment.trim(),o=[];e.length===0&&o.push(I("GEOMETRY_ENVIRONMENT_NOT_STATED","This surface will not draw: the caller did not say which database the heights came from, and a picture without an environment label is read as being about production.",kn,null,null)),t.frame.observedAt.trim().length===0&&o.push(I("GEOMETRY_OBSERVATION_NOT_DATED","This surface will not draw: no observation date was supplied, and an undated figure is a screenshot that will be lying within a month.",kn,null,e||null)),wr(r)?o.push(I("GEOMETRY_PROJECTION_DEGENERATE",`This surface will not draw at azimuth ${r.azimuthDeg}\xB0 / elevation ${r.elevationDeg}\xB0: that view collapses a dimension, so the picture would look like a surface while carrying the information of a flat chart.`,Bn,null,e||null)):Or(n)||o.push(I("GEOMETRY_PROJECTION_DEGENERATE",`The projection box is ${n.width}\xD7${n.depth}\xD7${n.height}. Every extent must be a finite positive number or the cells project on top of one another.`,Bn,null,e||null));let a=t.xAxis.ticks,i=t.yAxis.ticks;a.length<2&&o.push(I("GEOMETRY_AXIS_DEGENERATE",`The ${t.xAxis.label} axis has ${a.length} coordinate${a.length===1?"":"s"}. A surface needs at least two on each axis \u2014 one is a line, and a line drawn in three dimensions still only carries what a line carries.`,Oe,null,e||null)),i.length<2&&o.push(I("GEOMETRY_AXIS_DEGENERATE",`The ${t.yAxis.label} axis has ${i.length} coordinate${i.length===1?"":"s"}. A surface needs at least two on each axis.`,Oe,null,e||null));let l=s=>{for(let h=0;h<s.ticks.length;h++)if(!Number.isFinite(s.ticks[h].value))return`coordinate ${h} ("${s.ticks[h].label}") is ${String(s.ticks[h].value)}, not a finite number`;for(let h=1;h<s.ticks.length;h++)if(s.ticks[h].value<=s.ticks[h-1].value)return`coordinate ${h} (${s.ticks[h].value}) does not exceed coordinate ${h-1} (${s.ticks[h-1].value}), so the coordinates are not strictly ascending`;return null},u=!1;for(let s of[t.xAxis,t.yAxis]){if(s.ticks.length<2)continue;let h=l(s);h!==null&&(u=!0,o.push(I("GEOMETRY_AXIS_DEGENERATE",`The ${s.label} axis cannot carry a mesh: ${h}. A surface is a single-valued height field over a rectilinear grid, and that is the premise the exact paint order rests on \u2014 a folded or non-finite axis draws overlapping polygons in a meaningless order.`,Oe,null,e||null)))}let p=!1;if(t.zDomain){let[s,h]=t.zDomain;!Number.isFinite(s)||!Number.isFinite(h)?(p=!0,o.push(I("GEOMETRY_Z_NOT_FINITE",`The caller set the ${t.zAxis.label} domain to ${String(s)}\u2013${String(h)}. That is a broken computation upstream, not a wide axis \u2014 a domain like this is what \`Math.min(...[])\`/\`Math.max(...[])\` over an empty surface returns \u2014 and it is refused here rather than drawn as a figure whose every coordinate is NaN.`,Oe,null,e||null))):s>=h&&(p=!0,o.push(I("GEOMETRY_AXIS_DEGENERATE",`The caller set the ${t.zAxis.label} domain to ${s}\u2013${h}, which is ${s===h?"a single point":"inverted"}. `+(s===h?"A vertical axis with no extent shades every cell identically and would make the figure state a flatness that is a property of the axis, not of the data.":"An inverted domain draws the highest value as the deepest trough and leaves the axis with no ticks at all \u2014 a picture that is upside-down and unlabelled, not merely unusual."),Oe,null,e||null)))}if(t.rows===null)return o.push(I("GEOMETRY_GRID_NOT_LOADED","The grid was never read, which is not the same as it being empty. Nothing is drawn and no cell count is reported, because zero cells observed would read as zero cells existing.",Wt,null,e||null)),{kind:"refused",refusals:o};let c=t.rows;if(c.length===0||c.every(s=>s.length===0))return o.push(I("GEOMETRY_GRID_EMPTY","The grid was read and holds no cells. That is a genuine emptiness, not a failed read, and it is reported as such rather than drawn as a flat sheet at zero.",Wt,null,e||null)),{kind:"refused",refusals:o};if(c.length!==i.length||c.some(s=>s.length!==a.length))return o.push(I("GEOMETRY_GRID_RAGGED",`The grid is ${c.length} row${c.length===1?"":"s"} of [${[...new Set(c.map(s=>s.length))].join(", ")}] against a ${i.length}\xD7${a.length} axis pair. No mesh exists over that, and padding the short rows would invent cells.`,Xt,null,e||null)),{kind:"refused",refusals:o};let f=0,b=0,m=0,R=0,g=[];for(let s=0;s<c.length;s++)for(let h=0;h<c[s].length;h++){R++;let P=c[s][h];if(P===Re){m++;continue}if(P===null){b++;continue}if(!Number.isFinite(P)){o.push(I("GEOMETRY_Z_NOT_FINITE",`${t.zAxis.label} at (${t.xAxis.ticks[h].label}, ${t.yAxis.ticks[s].label}) is ${String(P)}. That is a broken computation upstream, not a missing measurement, and it is refused here rather than drawn as a hole where it would hide.`,Oe,[h,s],e||null));continue}f++,g.push(P)}if(f===0){let s=o.some(h=>h.code==="GEOMETRY_Z_NOT_FINITE");return!s&&b>0&&o.push(I("GEOMETRY_ALL_CELLS_ABSENT",`${b} of ${R} grid points were never measured${m>0?` and the other ${m} are present but withheld`:""}, so not one height was observed. An empty box with axes on it reads as a measured flat surface, so nothing is drawn at all.`,Xt,null,e||null)),!s&&m>0&&o.push(I("GEOMETRY_ALL_CELLS_WITHHELD",`${m} of ${R} grid points are present but WITHHELD${b>0?` and the other ${b} were never measured`:""}. These heights exist and are not shown here; that is a permission fact, not a measurement gap, and it refuses under its own code so nobody reads it as "nothing was measured".`,Wt,null,e||null)),{kind:"refused",refusals:o}}if(a.length<2||i.length<2||u||p)return{kind:"refused",refusals:o};let M=g[0],x=g[0];for(let s of g)s<M&&(M=s),s>x&&(x=s);let T=t.zDomain?t.zDomain[0]:M,v=t.zDomain?t.zDomain[1]:x,S=x===M,F=v===T,L=a[0].value,U=a[a.length-1].value,D=i[0].value,A=i[i.length-1].value,y=s=>Yt(s,L,U,n.width),E=s=>Yt(s,D,A,n.depth),_=s=>F?n.height/2:Yt(s,T,v,n.height),z=(s,h,P)=>O({x:y(a[s].value),y:E(i[h].value),z:_(P)},r),N=[],Ke=F?1:v-T;for(let s=0;s<i.length-1;s++)for(let h=0;h<a.length-1;h++){let P=[[h,s],[h+1,s],[h+1,s+1],[h,s+1]],X=P.map(([ue,Ve])=>c[Ve][ue]),K=P.filter((ue,Ve)=>X[Ve]===null),V=P.filter((ue,Ve)=>X[Ve]===Re),Z=(y(a[h].value)+y(a[h+1].value))/2,j=(E(i[s].value)+E(i[s+1].value))/2,le=je(Z,j,r);if(K.length+V.length>0){let ue=T;N.push({kind:"hole",col:h,row:s,footprint:[O({x:y(a[h].value),y:E(i[s].value),z:_(ue)},r),O({x:y(a[h+1].value),y:E(i[s].value),z:_(ue)},r),O({x:y(a[h+1].value),y:E(i[s+1].value),z:_(ue)},r),O({x:y(a[h].value),y:E(i[s+1].value),z:_(ue)},r)],paintDepth:le,absentCorners:K,withheldCorners:V});continue}let k=X,ge=(k[0]+k[1]+k[2]+k[3])/4,Je=Math.min(...k),et=Math.max(...k),vn=F?.5:(ge-T)/Ke,Mn=Math.min(1,Math.max(0,vn));N.push({kind:"quad",col:h,row:s,corners:[z(h,s,k[0]),z(h+1,s,k[1]),z(h+1,s+1,k[2]),z(h,s+1,k[3])],paintDepth:le,zMean:ge,zMin:Je,zMax:et,shade:Mn,outsideDomain:Je<T||et>v,shadeClamped:Mn!==vn})}N.sort((s,h)=>s.paintDepth-h.paintDepth);let q=N.filter(s=>s.kind==="quad"),J=N.filter(s=>s.kind==="hole");if(q.length===0&&o.push(I("GEOMETRY_NO_COMPLETE_QUAD",`${f} grid point${f===1?" was":"s were"} observed but no cell has all four corners, so every polygon would need a corner invented. The values are present; the holes are in the wrong places.`,Xt,null,e||null)),o.length>0)return{kind:"refused",refusals:o};let oe=n.width/2,ee=n.depth/2,ke=je(oe,E(D),r)>je(oe,E(A),r)?D:A,Be=je(y(L),ee,r)>je(y(U),ee,r)?L:U,$=Math.min(T,M),ae=a.map(s=>({value:s.value,label:s.label,at:O({x:y(s.value),y:E(ke),z:_($)},r)})),ie=i.map(s=>({value:s.value,label:s.label,at:O({x:y(Be),y:E(s.value),z:_($)},r)})),ye=(s,h)=>{let P=s.sx-h.sx,X=s.sy-h.sy,K=Math.hypot(P,X);return K===0?{dx:0,dy:1}:{dx:P/K,dy:X/K}},Ee=ye(O({x:oe,y:E(ke),z:_($)},r),O({x:oe,y:E(ke===D?A:D),z:_($)},r)),xe=ye(O({x:y(Be),y:ee,z:_($)},r),O({x:y(Be===L?U:L),y:ee,z:_($)},r)),ze=[[L,D],[U,D],[U,A],[L,A]],fn=s=>O({x:y(s[0]),y:E(s[1]),z:0},r).sx,Le=ze.reduce((s,h)=>fn(h)<fn(s)?h:s),pr=F?[T]:Cr(T,v,t.zAxis.tickCount??4),br=t.zAxis.formatTick??(s=>`${s}`),Tt=pr.map(s=>({value:s,label:br(s),at:O({x:y(Le[0]),y:E(Le[1]),z:_(s)},r)})),hn=s=>[O({x:y(L),y:E(D),z:_(s)},r),O({x:y(U),y:E(D),z:_(s)},r),O({x:y(U),y:E(A),z:_(s)},r),O({x:y(L),y:E(A),z:_(s)},r)],pn=hn(T),bn=!F&&T<0&&v>0,yn=bn?hn(0):null,En=[O({x:y(Le[0]),y:E(Le[1]),z:_(T)},r),O({x:y(Le[0]),y:E(Le[1]),z:F?n.height/2:n.height},r)],we=[...pn,...En,...yn??[],...ae.map(s=>s.at),...ie.map(s=>s.at),...Tt.map(s=>s.at)];for(let s of N)we.push(...s.kind==="quad"?s.corners:s.footprint);let At=(s,h)=>{let P=[],X=Math.hypot(h.dx,h.dy)||1,K=h.dx/X,V=h.dy/X;for(let Z of s){let j=Z.label.length*zn*Nr,le=zn,k=Z.at.sx+K*(j/2+Vn),ge=Z.at.sy+V*(le/2+Vn);for(let[Je,et]of[[k-j/2,ge-le],[k+j/2,ge-le],[k-j/2,ge+le],[k+j/2,ge+le]])P.push({sx:Je,sy:et,depth:Z.at.depth})}return P};we.push(...At(ae,Ee),...At(ie,xe),...At(Tt,{dx:-1,dy:0}));let Ze=4,xn=Math.min(...we.map(s=>s.sx))-Ze,yr=Math.max(...we.map(s=>s.sx))+Ze,gn=Math.min(...we.map(s=>s.sy))-Ze,Er=Math.max(...we.map(s=>s.sy))+Ze,Rt=(a.length-1)*(i.length-1),se=[],Tn=J.filter(s=>s.absentCorners.length>0),An=J.filter(s=>s.withheldCorners.length>0),qe=J.filter(s=>s.absentCorners.length>0&&s.withheldCorners.length>0).length,Rn=qe===0?"":` Counts overlap: ${qe} of the ${J.length} open cells ${qe===1?"has":"have"} a never-measured corner AND a withheld one, so ${qe===1?"it is":"they are"} counted in this notice and in the other alike \u2014 the two counts do not sum to the number of open cells.`;if(Tn.length>0&&se.push({code:"HOLES_PRESENT",sentence:`${Tn.length} of ${Rt} cells are open because a corner was never measured, so the surface has a genuine gap there. The gap is the measurement, not a rendering fault.${Rn}`}),An.length>0&&se.push({code:"CELLS_WITHHELD",sentence:`${An.length} of ${Rt} cells are open because a corner is PRESENT BUT WITHHELD. Those heights were measured and are not shown here \u2014 a permission decision, not a gap in the data, and a different fact from the cells nobody measured.${Rn}`}),S&&se.push({code:"SURFACE_IS_FLAT",sentence:`Every observed ${t.zAxis.label} is ${M} ${t.zAxis.unit}. The surface is flat because the data is flat \u2014 an observed constant, not a failure to vary.`}),t.zDomain&&se.push({code:"Z_DOMAIN_OVERRIDDEN",sentence:`The vertical domain was set by the caller to ${T}\u2013${v} ${t.zAxis.unit}, not taken from these values, which run ${M}\u2013${x}. Heights are comparable across surfaces and not to this grid alone.`}),t.zDomain&&(M<T||x>v)){let s=q.filter(V=>V.zMin<T||V.zMax>v),h="";if(s.length>0){let V=s[0].zMin,Z=s[0].zMax;for(let j of s)j.zMin<V&&(V=j.zMin),j.zMax>Z&&(Z=j.zMax);h=`, reaching ${V} at the lowest corner and ${Z} at the highest`}let P=q.filter(V=>V.shadeClamped).length,X=s.length===0?"No DRAWN cell leaves the box: the excursion is at a grid point that belongs to no complete cell, so it is in the counts and not in the sheet.":`${s.length} of ${q.length} drawn cells sit beyond the box on at least one CORNER${h}. Those heights are true and are never clamped, and the renderer marks them.`,K=P===0?" No cell MEAN leaves the box, so every shading still encodes the height it is drawn at.":` The SHADING of ${P} of them is clamped, so for those cells the ink and the height disagree.`;se.push({code:"OBSERVED_RANGE_OUTSIDE_DOMAIN",sentence:`The observed ${t.zAxis.label} runs ${M}\u2013${x} ${t.zAxis.unit}, outside the caller's vertical domain of ${T}\u2013${v}. ${X}${K} Widen the domain or drop the override.`})}if(!F&&!bn){let s=T===0?`The vertical axis starts exactly at zero ${t.zAxis.unit}, so the FLOOR of the box is the break-even line and no separate zero plane is drawn.`:v===0?`The vertical axis ends exactly at zero ${t.zAxis.unit}, so the TOP of the box is the break-even line and no separate zero plane is drawn.`:`The vertical domain runs ${T}\u2013${v} ${t.zAxis.unit} and zero is not inside it, so no break-even line is drawn.`,h=x<0?" EVERY cell on this surface is at or below break-even: read the whole sheet as loss-making \u2014 a tall cell here is a smaller loss, not a profit.":M>0?" Relative heights are exaggerated by a floor above zero; do not read a tall cell as a large multiple of a short one.":"";se.push({code:"Z_DOMAIN_EXCLUDES_ZERO",sentence:s+h})}return t.frame.valuesArePlaceholders===!0&&se.push({code:"VALUES_ARE_PLACEHOLDERS",sentence:"The heights are PLACEHOLDERS. The shape of this surface is arithmetic over numbers nobody has agreed, and no decision may rest on it."}),{kind:"projected",view:r,box:n,projectionLabel:Dr(r,n),viewBox:{minX:xn,minY:gn,width:yr-xn,height:Er-gn},cells:N,quads:q,holes:J,xTicks:ae,yTicks:ie,zTicks:Tt,xTickOutward:Ee,yTickOutward:xe,floor:pn,zAxis:En,zDomain:[T,v],zeroPlane:yn,flat:S,observedDomain:[M,x],frame:{environment:e,observedAt:t.frame.observedAt,windowFrom:t.frame.windowFrom,windowTo:t.frame.windowTo,source:t.frame.source,xLabel:t.xAxis.label,xUnit:t.xAxis.unit,yLabel:t.yAxis.label,yUnit:t.yAxis.unit,zLabel:t.zAxis.label,zUnit:t.zAxis.unit,cellsTotal:Rt,cellsDrawn:q.length,cellsHoles:J.length,pointsObserved:f,pointsAbsent:b,pointsWithheld:m,interpolation:Sr,valuesArePlaceholders:t.frame.valuesArePlaceholders===!0,ruleSetVersion:Fr},notices:se}}var bt=new URLSearchParams(location.search),Jt=bt.get("ao")!=="0",Me=bt.get("mesh")!=="0",We=Math.max(1,Math.min(3,Number(bt.get("scale")??1))),Zn=Number(bt.get("frames")??300),W=1200*We,Y=720*We,Ue=document.getElementById("c");Ue.width=W;Ue.height=Y;var qn=document.getElementById("log");function an(t){throw document.title="REFUSED",qn.textContent=t,new Error(t)}function Q(t,r){return"kind"in r&&an(`${t}: ${r.code} \u2014 ${r.reason} ${r.detail??""}`),r}var ft=Mt(Ue,{alpha:!1});vt(ft)||an(`stage: ${ft.code} \u2014 ${ft.reason}`);var B=ft,w=B.gl,Ur=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Ir=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${Lt}
${wt}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,Gr=Q("present",B.compile(Ur,Ir)),Kt=Q("lit",Ht(B)),mt=Q("target",kt(B,W,Y)),en=Q("shadow",Bt(B,1536)),kr=Q("sky",zt(B)),Xn=Q("ao",$t(B,W,Y)),Ye=[25,50,100,250,500,1e3,2500],Qe=[7,14,30,60,90,180],Jn=[[.31,.44,.52,.58,.49,.33,.18],[.28,.41,.55,.66,.61,.42,.24],[.22,.36,.51,.71,.74,.58,.35],[.17,.29,.42,.63,.72,.66,.44],[null,.21,.33,.48,.59,Re,Re],[null,.14,.24,.36,.45,Re,.29]],Br={rows:Jn,xAxis:{label:"Ticket size",unit:"$k",ticks:Ye.map(t=>({value:t,label:String(t)}))},yAxis:{label:"Days to close",unit:"d",ticks:Qe.map(t=>({value:t,label:String(t)}))},zAxis:{label:"Win rate",unit:"",tickCount:5},frame:{environment:"harness",observedAt:"2026-08-11T00:00:00.000Z",windowFrom:null,windowTo:null,source:"docs/3d/e5/entry.ts \u2014 synthetic",valuesArePlaceholders:!0}},tn=$n(Br);jn(tn)||an(`the flat engine REFUSED this input, so the mesh must too: ${tn.refusals.map(t=>t.code).join(", ")}`);var re=tn,yt=Ye.length,Et=Qe.length,me=4.6,_e=3.4,er=1.15,sn=0,ln=0,un=[],tr=(t,r)=>Jn[r][t],fe=Pt(yt,Et,(t,r)=>{let n=tr(t,r);return n===Re?(sn++,un.push([t,r]),null):n===null?(ln++,null):n},me,_e,er),Ie=.16,nr=He(me+.5,Ie,_e+.5),rr=Dt(26,22),or=He(.3,.055,.3),zr=Q("deck",Ae(B,rr)),Vr=Q("plinth",Ae(B,nr)),Hr=Q("marker",Ae(B,or)),ht=fe.cellsDrawn>0?Q("surface",Ae(B,fe.geometry)):null,$e=new Float32Array([1,0,0,0,1,0,0,0,1]),Xe=(t,r,n)=>{let e=nt();return e[12]=t,e[13]=r,e[14]=n,e},he=Ie,Se=(t,r)=>[-me/2+t/(yt-1)*me,he,-_e/2+r/(Et-1)*_e],G=(()=>{let t=null;for(let r=0;r<Et;r++)for(let n=0;n<yt;n++){let e=tr(n,r);typeof e=="number"&&(!t||e>t.v)&&(t={c:n,r,v:e})}return t})(),de=fe.observedRange,jr=t=>!de||de[1]===de[0]?he:he+(t-de[0])/(de[1]-de[0])*er,xt=G?Math.max(.02,jr(G.v)-he):0,ar=He(.045,xt+.3,.045),nn=G?Q("probe",Ae(B,ar)):null,Ce={target:[0,.52,.05],distance:8.5,azimuthDeg:38,elevationDeg:26,fovDeg:34},rn=at(Ce),ve=[{mesh:zr,model:Xe(0,0,0),normalMat:$e,material:{baseColour:ce("#070B14"),roughness:.88,metalness:0}},{mesh:Vr,model:Xe(0,Ie/2,0),normalMat:$e,material:{baseColour:ce("#101A31"),roughness:.62,metalness:.04}}];Me&&ht&&ve.push({mesh:ht,model:Xe(0,he,0),normalMat:$e,material:{baseColour:ce("#2C6BFF"),roughness:.34,metalness:.05,anisotropy:.55}});for(let[t,r]of un){let[n,,e]=Se(t,r);ve.push({mesh:Hr,model:Xe(n,he+.028,e),normalMat:$e,material:{baseColour:ce("#C98A2B"),roughness:.55,metalness:.08}})}if(Me&&nn&&G){let[t,,r]=Se(G.c,G.r);ve.push({mesh:nn,model:Xe(t,he+(xt+.3)/2,r),normalMat:$e,material:{baseColour:ce("#E8EEF9"),roughness:.22,metalness:.75,anisotropy:.3}})}var ir=[.48,-.62,-.62],Wn=[-3.6,0,-2.8],Yn=[4.2,1.8,3.2],Qn=Ut({direction:ir,colour:[1,1,1],extent:6.4},Gt(Wn,Yn),It(Wn,Yn)),$r=ve.reduce((t,r,n)=>t+(n===0?Ne(rr):0),0)+Ne(nr)+(Me&&ht?fe.cellsDrawn*2:0)+un.length*Ne(or)+(Me&&nn?Ne(ar):0),Xr=.1,Wr=60;function on(){let t=it(Ce,W/Y);Kt.shadowPass(Qn,ve,en),mt.bind(),w.clear(w.DEPTH_BUFFER_BIT),kr.draw({eye:rn,target:Ce.target,fovDeg:Ce.fovDeg??34,aspect:W/Y}),Kt.depthPrepass(t,ve),Jt&&(Xn.compute({depthTexture:mt.depthTexture,near:Xr,far:Wr,fovDeg:Ce.fovDeg??34,aspect:W/Y,radius:.35,strength:1.25}),mt.bind()),Kt.draw({viewProj:t,eye:rn,lightDir:ir,lightColour:[3.4,3.35,3.2],ambientGain:1,lightVP:Qn,shadow:en,shadowStrength:.9,draws:ve,ao:Jt?Xn.texture:null,screenSize:[W,Y]}),w.bindFramebuffer(w.FRAMEBUFFER,null),w.viewport(0,0,W,Y),w.disable(w.DEPTH_TEST),w.activeTexture(w.TEXTURE0),w.bindTexture(w.TEXTURE_2D,mt.texture),B.blit(Gr,r=>w.uniform1i(w.getUniformLocation(r,"uScene"),0))}function Yr(t){on();let r=new Uint8Array(4);w.readPixels(0,0,1,1,w.RGBA,w.UNSIGNED_BYTE,r);let n=performance.now();for(let e=0;e<t;e++)on();return w.readPixels(0,0,1,1,w.RGBA,w.UNSIGNED_BYTE,r),(performance.now()-n)/t}var Zt=Yr(Math.max(1,Zn)),Ge=it(Ce,W/Y),pe=W/We,be=Y/We,gt=document.createElement("div");gt.style.cssText=`position:relative;overflow:hidden;width:${pe}px;height:${be}px`;Ue.parentNode?.insertBefore(gt,Ue);gt.appendChild(Ue);var Fe=document.createElement("div");Fe.style.cssText="position:absolute;inset:0;pointer-events:none";gt.appendChild(Fe);var cn=(t,r,n,e="")=>{let o=document.createElement("div");o.style.cssText=`position:absolute;left:${t.toFixed(1)}px;top:${r.toFixed(1)}px;transform:translate(-50%,-50%);white-space:nowrap;${e}`,o.innerHTML=n,Fe.appendChild(o)},sr="font:500 10.5px/1 ui-monospace,monospace;color:rgba(196,212,240,0.82);letter-spacing:.06em",Qr=Ye.map((t,r)=>{let n=ne(Ge,[Se(r,0)[0],0,-_e/2-.42],pe,be),e=ne(Ge,[Se(r,0)[0],0,_e/2+.42],pe,be),o=n.sy>e.sy?n:e;return o.behind||cn(o.sx,o.sy,String(t),sr),{value:t,sx:Math.round(o.sx),sy:Math.round(o.sy),behind:o.behind}}),Kr=Qe.map((t,r)=>{let n=ne(Ge,[-me/2-.46,0,Se(0,r)[2]],pe,be),e=ne(Ge,[me/2+.46,0,Se(0,r)[2]],pe,be),o=n.sx>e.sx?n:e;return o.behind||cn(o.sx,o.sy,String(t),sr),{value:t,sx:Math.round(o.sx),sy:Math.round(o.sy),behind:o.behind}}),lr=null;if(Me&&G){let[t,,r]=Se(G.c,G.r),n=ne(Ge,[t,he+xt+.34,r],pe,be);n.behind||(cn(n.sx,n.sy,`<div style="font:600 9.5px/1 ui-monospace,monospace;letter-spacing:.16em;color:#8FB7FF">PEAK</div><div style="font:700 19px/1.1 system-ui,sans-serif;color:#fff">${(G.v*100).toFixed(0)}%</div><div style="font:400 10px/1.3 system-ui,sans-serif;color:rgba(214,226,246,0.8)">$${Ye[G.c]}k \xB7 ${Qe[G.r]} d</div>`,"text-align:center"),lr={sx:Math.round(n.sx),sy:Math.round(n.sy)})}var Zr=(()=>{let t=_e/2+.25,r=(me+.5)/2-.18;return{topLeft:[-r,Ie-.022,t+.002],topRight:[r,Ie-.022,t+.002],bottomRight:[r,.024,t+.002],bottomLeft:[-r,.024,t+.002]}})(),pt=[Math.round(2*((me+.5)/2-.18)*190),Math.round((Ie-.046)*190)],ur=26,C=Nt(Ge,Zr,pe,be,pt[0],pt[1]),cr=Te(C)?0:Math.min(Math.hypot(C.screen[0].x-C.screen[3].x,C.screen[0].y-C.screen[3].y),Math.hypot(C.screen[1].x-C.screen[2].x,C.screen[1].y-C.screen[2].y)),dr=!Te(C)&&C.signedArea>0&&cr>=ur,Kn=`<span style="font:600 13px/1 ui-monospace,monospace;letter-spacing:.13em;color:rgba(233,240,255,0.92)">WIN RATE \xB7 TICKET SIZE \xD7 DAYS TO CLOSE</span><span style="font:500 12px/1 ui-monospace,monospace;color:rgba(160,184,224,0.82)">n=${re.frame.cellsDrawn}/${re.frame.cellsTotal} CELLS</span>`;if(dr&&!Te(C)){let t=document.createElement("div");t.style.cssText=`position:absolute;left:0;top:0;width:${pt[0]}px;height:${pt[1]}px;transform-origin:0 0;transform:${C.transform};display:flex;align-items:center;justify-content:space-between;padding:0 6px;overflow:hidden;-webkit-font-smoothing:antialiased`,t.innerHTML=Kn,Fe.appendChild(t)}else{let t=document.createElement("div");t.style.cssText="position:absolute;left:16px;bottom:16px;display:flex;flex-direction:column;gap:5px",t.innerHTML=Kn,Fe.appendChild(t)}var dn=document.createElement("div");dn.style.cssText="position:absolute;left:16px;top:14px;max-width:340px;display:flex;flex-direction:column;gap:5px";dn.innerHTML=re.notices.map(t=>`<div style="font:500 10.5px/1.4 ui-monospace,monospace;letter-spacing:.04em;color:${t.code==="VALUES_ARE_PLACEHOLDERS"?"#E0A94A":"rgba(150,176,220,0.85)"}">${t.code}</div>`).join("");Fe.appendChild(dn);var mn=document.createElement("div");mn.style.cssText="position:absolute;right:16px;bottom:14px;display:flex;flex-direction:column;gap:6px;align-items:flex-end;font:500 10.5px/1 ui-monospace,monospace;letter-spacing:.05em";mn.innerHTML=[["#2C6BFF",`OBSERVED \xB7 ${fe.cellsDrawn} cells`],["#C98A2B",`WITHHELD \xB7 ${sn} points`],["transparent",`ABSENT \xB7 ${ln} points (holed)`]].map(([t,r])=>`<div style="display:flex;align-items:center;gap:7px;color:rgba(196,212,240,0.85)"><span>${r}</span><span style="width:11px;height:11px;background:${t};${t==="transparent"?"border:1px dashed rgba(196,212,240,0.55)":""};display:inline-block"></span></div>`).join("");Fe.appendChild(mn);var mr={cellsTotal:[re.frame.cellsTotal,(yt-1)*(Et-1)],cellsDrawn:[re.frame.cellsDrawn,fe.cellsDrawn],cellsHoles:[re.frame.cellsHoles,fe.cellsHoles],pointsAbsent:[re.frame.pointsAbsent,ln],pointsWithheld:[re.frame.pointsWithheld,sn]},qr=Object.values(mr).every(([t,r])=>t===r),fr=(()=>{let t=w.getExtension("WEBGL_debug_renderer_info");return t?String(w.getParameter(t.UNMASKED_RENDERER_WEBGL)):"unknown"})(),qt=/swiftshader|llvmpipe|software/i.test(fr),hr={ao:Jt,mesh:Me,hdr:B.hdr,eye:rn.map(t=>Number(t.toFixed(2))),agreesWithFlat:qr,agreement:mr,observedRange:de?de.map(t=>Number(t.toFixed(3))):null,peak:G?{value:G.v,ticket:Ye[G.c],days:Qe[G.r],probeHeight:Number(xt.toFixed(3))}:null,probeLabel:lr,ticksOffFrame:[...Qr,...Kr].filter(t=>t.behind||t.sx<0||t.sx>pe||t.sy<0||t.sy>be).length,notices:re.notices.map(t=>t.code),title:{mode:dr?"projected":"screen",plateHeightPx:Number(cr.toFixed(1)),minPlatePx:ur,refusal:Te(C)?C.refusal:null,perspectiveX:Te(C)?null:Number((C.matrix[6]*1e3).toFixed(3))},glError:w.getError(),triangles:$r,surfaceTriangles:Me&&ht?fe.cellsDrawn*2:0,shadowMap:en.size,resolution:`${W}x${Y}`,dprScale:We,frames:Zn,msPerFrame:Number(Zt.toFixed(3)),fps:Math.round(1e3/Zt),renderer:fr,rendererClass:qt?"software":"hardware",headroom:qt?null:Number((16.6-Zt).toFixed(3)),headroomRefusal:qt?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null,hardwareMsPerFrame:null};globalThis.E5=hr;qn.textContent=JSON.stringify(hr,null,2);on();document.title="READY";

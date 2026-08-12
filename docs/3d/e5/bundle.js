var Mn={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected."};function H(t,r){return r===void 0?{kind:"refused",code:t,reason:Mn[t]}:{kind:"refused",code:t,reason:Mn[t],detail:r}}function Rt(t){return t.kind==="stage"}function wt(t,r={}){let n=t.getContext("webgl2",{antialias:r.antialias??!1,alpha:r.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!n)return H("NO_WEBGL2");let e=n.getExtension("EXT_color_buffer_float"),o=t.width,a=t.height,s=e?n.RGBA16F:n.RGBA8,l=e?n.HALF_FLOAT:n.UNSIGNED_BYTE,u=(g,T)=>{let R=n.createTexture();n.bindTexture(n.TEXTURE_2D,R),n.texImage2D(n.TEXTURE_2D,0,s,g,T,0,n.RGBA,l,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE);let S=n.createFramebuffer();n.bindFramebuffer(n.FRAMEBUFFER,S),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,R,0);let F=n.checkFramebufferStatus(n.FRAMEBUFFER);return F!==n.FRAMEBUFFER_COMPLETE?H("FRAMEBUFFER_INCOMPLETE",`status 0x${F.toString(16)} at ${g}\xD7${T}`):{texture:R,framebuffer:S,width:g,height:T}},p=r.bloomShift??2,c={w:o,h:a},d=u(o,a);if("kind"in d)return d;let m=u(Math.max(1,o>>p),Math.max(1,a>>p));if("kind"in m)return m;let b=u(Math.max(1,o>>p),Math.max(1,a>>p));if("kind"in b)return b;let h=n.createVertexArray();n.bindVertexArray(h);let v=n.createBuffer();n.bindBuffer(n.ARRAY_BUFFER,v),n.bufferData(n.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),n.STATIC_DRAW),n.enableVertexAttribArray(0),n.vertexAttribPointer(0,2,n.FLOAT,!1,0,0),n.bindVertexArray(null);let x=[];return{kind:"stage",gl:n,cssWidth:t.clientWidth||o,cssHeight:t.clientHeight||a,hdr:!!e,get width(){return c.w},get height(){return c.h},get scene(){return d},get bloomA(){return m},get bloomB(){return b},setRegion(g,T){let R=Math.max(1,Math.round(g)),S=Math.max(1,Math.round(T));if(!(R===c.w&&S===c.h)){c={w:R,h:S};for(let F of[d,m,b])"kind"in F||(n.deleteFramebuffer(F.framebuffer),n.deleteTexture(F.texture));d=u(R,S),m=u(Math.max(1,R>>p),Math.max(1,S>>p)),b=u(Math.max(1,R>>p),Math.max(1,S>>p))}},compile(g,T){let R=(U,D)=>{let A=n.createShader(U);return n.shaderSource(A,D),n.compileShader(A),n.getShaderParameter(A,n.COMPILE_STATUS)?A:H("SHADER_COMPILE_FAILED",n.getShaderInfoLog(A)??"(no log)")},S=R(n.VERTEX_SHADER,g);if(typeof S=="object"&&"kind"in S)return S;let F=R(n.FRAGMENT_SHADER,T);if(typeof F=="object"&&"kind"in F)return F;let _=n.createProgram();return n.attachShader(_,S),n.attachShader(_,F),n.linkProgram(_),n.getProgramParameter(_,n.LINK_STATUS)?(x.push(_),_):H("PROGRAM_LINK_FAILED",n.getProgramInfoLog(_)??"(no log)")},bindTarget(g){n.bindFramebuffer(n.FRAMEBUFFER,g?g.framebuffer:null),n.viewport(0,0,g?g.width:c.w,g?g.height:c.h)},blit(g,T){n.useProgram(g),n.bindVertexArray(h),T?.(g),n.drawArrays(n.TRIANGLES,0,3),n.bindVertexArray(null)},dispose(){for(let g of x)n.deleteProgram(g);for(let g of[d,m,b])"kind"in g||(n.deleteFramebuffer(g.framebuffer),n.deleteTexture(g.texture));n.deleteBuffer(v),n.deleteVertexArray(h)}}}var nt=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function rt(t,r){let n=new Float32Array(16);for(let e=0;e<4;e++)for(let o=0;o<4;o++){let a=0;for(let s=0;s<4;s++)a+=t[s*4+o]*r[e*4+s];n[e*4+o]=a}return n}var Pe=(t,r)=>[t[0]-r[0],t[1]-r[1],t[2]-r[2]],tt=(t,r)=>t[0]*r[0]+t[1]*r[1]+t[2]*r[2],De=(t,r)=>[t[1]*r[2]-t[2]*r[1],t[2]*r[0]-t[0]*r[2],t[0]*r[1]-t[1]*r[0]];function te(t){let r=Math.hypot(t[0],t[1],t[2]);return r===0?t:[t[0]/r,t[1]/r,t[2]/r]}function Mt(t,r,n,e){let o=1/Math.tan(t/2);return new Float32Array([o/r,0,0,0,0,o,0,0,0,0,(e+n)/(n-e),-1,0,0,2*e*n/(n-e),0])}function St(t,r,n,e,o,a){let s=r-t,l=e-n,u=a-o;return new Float32Array([2/s,0,0,0,0,2/l,0,0,0,0,-2/u,0,-(r+t)/s,-(e+n)/l,-(a+o)/u,1])}function ot(t,r,n){let e=te(Pe(t,r)),o=De(n,e);if(Math.hypot(o[0],o[1],o[2])<1e-8)return nt();let a=te(o),s=De(e,a);return new Float32Array([a[0],s[0],e[0],0,a[1],s[1],e[1],0,a[2],s[2],e[2],0,-tt(a,t),-tt(s,t),-tt(e,t),1])}function Sn(t,r){let n=[0,1,2,3].map(o=>t[0+o]*r[0]+t[4+o]*r[1]+t[8+o]*r[2]+t[12+o]),e=n[3];return{x:n[0]/e,y:n[1]/e,z:n[2]/e,w:e}}function ne(t,r,n,e){let o=Sn(t,r);return{sx:(o.x*.5+.5)*n,sy:(1-(o.y*.5+.5))*e,behind:o.w<=0}}function Fn(t){return t<=.04045?t/12.92:Math.pow((t+.055)/1.055,2.4)}var gr=/^#?([0-9a-fA-F]{6})$/;function ce(t){let r=gr.exec(t.trim());if(!r)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(t)}`);let n=r[1];return[0,2,4].map(e=>Fn(parseInt(n.slice(e,e+2),16)/255))}var Ft={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},xr=Object.freeze(Object.fromEntries(Object.keys(Ft).map(t=>[t,ce(Ft[t])])));var _n=.4;var _t=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${_n.toFixed(2)}); }`,Lt=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function Ln(t){let r=[1/0,1/0,1/0],n=[-1/0,-1/0,-1/0];for(let e=0;e<t.length;e+=3)for(let o=0;o<3;o++){let a=t[e+o];a<r[o]&&(r[o]=a),a>n[o]&&(n[o]=a)}return t.length===0?{min:[0,0,0],max:[0,0,0]}:{min:r,max:n}}function Dn(t,r,n,e){let o=new Float32Array(t.length);for(let s=0;s<e.length;s+=3){let l=e[s],u=e[s+1],p=e[s+2],c=l*3,d=u*3,m=p*3,b=l*2,h=u*2,v=p*2,x=t[d]-t[c],w=t[d+1]-t[c+1],g=t[d+2]-t[c+2],T=t[m]-t[c],R=t[m+1]-t[c+1],S=t[m+2]-t[c+2],F=n[h]-n[b],_=n[h+1]-n[b+1],U=n[v]-n[b],D=n[v+1]-n[b+1],A=F*D-U*_;if(Math.abs(A)<1e-12)continue;let y=1/A,E=(x*D-T*_)*y,M=(w*D-R*_)*y,z=(g*D-S*_)*y;for(let N of[c,d,m])o[N]=o[N]+E,o[N+1]=o[N+1]+M,o[N+2]=o[N+2]+z}let a=new Float32Array(t.length);for(let s=0;s<a.length;s+=3){let l=r[s],u=r[s+1],p=r[s+2],c=o[s],d=o[s+1],m=o[s+2],b=c*l+d*u+m*p;c-=l*b,d-=u*b,m-=p*b;let h=Math.hypot(c,d,m);h<1e-8&&(Math.abs(l)<.9?(c=0,d=-p,m=u):(c=-p,d=0,m=l),h=Math.hypot(c,d,m)||1),a[s]=c/h,a[s+1]=d/h,a[s+2]=m/h}return a}function Pn(t,r){let n=new Float32Array(t.length);for(let e=0;e<r.length;e+=3){let o=r[e]*3,a=r[e+1]*3,s=r[e+2]*3,l=t[a]-t[o],u=t[a+1]-t[o+1],p=t[a+2]-t[o+2],c=t[s]-t[o],d=t[s+1]-t[o+1],m=t[s+2]-t[o+2],b=u*m-p*d,h=p*c-l*m,v=l*d-u*c;for(let x of[o,a,s])n[x]=n[x]+b,n[x+1]=n[x+1]+h,n[x+2]=n[x+2]+v}for(let e=0;e<n.length;e+=3){let o=Math.hypot(n[e],n[e+1],n[e+2]);o>0&&(n[e]=n[e]/o,n[e+1]=n[e+1]/o,n[e+2]=n[e+2]/o)}return n}function Nn(t,r,n,e,o){let{min:a,max:s}=Ln(t),l=e??Pn(t,n);return{positions:t,normals:l,uvs:r,indices:n,min:a,max:s,tangents:o??Dn(t,l,r,n)}}function He(t=1,r=1,n=1){let e=t/2,o=r/2,a=n/2,s=[[[-e,-o,a],[e,-o,a],[e,o,a],[-e,o,a]],[[e,-o,-a],[-e,-o,-a],[-e,o,-a],[e,o,-a]],[[e,-o,a],[e,-o,-a],[e,o,-a],[e,o,a]],[[-e,-o,-a],[-e,-o,a],[-e,o,a],[-e,o,-a]],[[-e,o,a],[e,o,a],[e,o,-a],[-e,o,-a]],[[-e,-o,-a],[e,-o,-a],[e,-o,a],[-e,-o,a]]],l=new Float32Array(72),u=new Float32Array(48),p=new Uint16Array(36),c=0,d=0,m=0,b=0;for(let h of s){for(let[v,x,w]of h)l[c++]=v,l[c++]=x,l[c++]=w;u[d++]=0,u[d++]=0,u[d++]=1,u[d++]=0,u[d++]=1,u[d++]=1,u[d++]=0,u[d++]=1,p[m++]=b,p[m++]=b+1,p[m++]=b+2,p[m++]=b,p[m++]=b+2,p[m++]=b+3,b+=4}return Nn(l,u,p)}function Dt(t=10,r=24){let n=Math.max(1,Math.floor(r)),e=(n+1)*(n+1),o=new Float32Array(e*3),a=new Float32Array(e*3),s=new Float32Array(e*2),l=new Uint16Array(n*n*6),u=0,p=0,c=0;for(let d=0;d<=n;d++)for(let m=0;m<=n;m++){let b=(m/n-.5)*t,h=(d/n-.5)*t;o[u]=b,o[u+1]=0,o[u+2]=h,a[u]=0,a[u+1]=1,a[u+2]=0,u+=3,s[p++]=m/n,s[p++]=d/n}for(let d=0;d<n;d++)for(let m=0;m<n;m++){let b=d*(n+1)+m,h=b+1,v=b+(n+1),x=v+1;l[c++]=b,l[c++]=v,l[c++]=h,l[c++]=h,l[c++]=v,l[c++]=x}return Nn(o,s,l,a)}function Ne(t){return t.indices.length/3}function Pt(t,r,n,e=4,o=4,a=1){let s=Math.max(2,Math.floor(t)),l=Math.max(2,Math.floor(r)),u=new Array(s*l),p=1/0,c=-1/0,d=0;for(let A=0;A<l;A++)for(let y=0;y<s;y++){let E=n(y,A),M=E!==null&&Number.isFinite(E);u[A*s+y]=M?E:null,M?(E<p&&(p=E),E>c&&(c=E)):d++}let m=d===s*l?null:[p,c],b=m&&c>p?c-p:0,h=A=>b===0?0:(A-p)/b*a,v=new Float32Array(s*l*3),x=new Float32Array(s*l*3),w=new Float32Array(s*l*2),g=new Float32Array(s*l*3),T=(A,y)=>A<0||A>=s||y<0||y>=l?null:u[y*s+A],R=e/(s-1),S=o/(l-1);for(let A=0;A<l;A++)for(let y=0;y<s;y++){let E=A*s+y,M=u[E]??null,z=-e/2+y*R,N=-o/2+A*S;v[E*3]=z,v[E*3+1]=M===null?0:h(M),v[E*3+2]=N,w[E*2]=s===1?0:y/(s-1),w[E*2+1]=l===1?0:A/(l-1);let Ke=(Ee,ge,ze)=>Ee!==null&&ge!==null?(h(ge)-h(Ee))/(2*ze):M===null?0:ge!==null?(h(ge)-h(M))/ze:Ee!==null?(h(M)-h(Ee))/ze:0,q=Ke(T(y-1,A),T(y+1,A),R),J=Ke(T(y,A-1),T(y,A+1),S),oe=Math.hypot(-q,1,-J);x[E*3]=-q/oe,x[E*3+1]=1/oe,x[E*3+2]=-J/oe;let ee=x[E*3],Ge=x[E*3+1],Be=x[E*3+2],$=1-ee*ee,ae=-ee*Ge,se=-ee*Be,ye=Math.hypot($,ae,se);ye<1e-6?($=0,ae=0,se=1):($/=ye,ae/=ye,se/=ye),g[E*3]=$,g[E*3+1]=ae,g[E*3+2]=se}let F=[],_=0;for(let A=0;A<l-1;A++)for(let y=0;y<s-1;y++){let E=A*s+y,M=E+1,z=(A+1)*s+y,N=z+1;if(u[E]===null||u[M]===null||u[z]===null||u[N]===null){_++;continue}F.push(E,z,M,M,z,N)}let U=s*l>65535?new Uint32Array(F):new Uint16Array(F),D=Ln(v);return{geometry:{positions:v,normals:x,uvs:w,tangents:g,indices:U,min:D.min,max:D.max},cellsDrawn:(s-1)*(l-1)-_,cellsHoles:_,pointsAbsent:d,observedRange:m}}function Tr(t){if(!Number.isFinite(t)||t===0)return"0";let r=t.toFixed(12).replace(/0+$/,"").replace(/\.$/,"");return r==="-0"?"0":r}function On(t,r,n,e){let[o,a]=t,[s,l]=r,[u,p]=n,[c,d]=e,m=o-s+u-c,b=a-l+p-d;if(Math.abs(m)<1e-9&&Math.abs(b)<1e-9){let S=[s-o,c-o,o,l-a,d-a,a,0,0,1],F=S[0]*S[4]-S[1]*S[3];return Math.abs(F)<1e-9?null:S}let h=s-u,v=c-u,x=l-p,w=d-p,g=h*w-v*x;if(Math.abs(g)<1e-9)return null;let T=(m*w-v*b)/g,R=(h*b-m*x)/g;return[s-o+T*s,c-o+R*c,o,l-a+T*l,d-a+R*d,a,T,R,1]}function Nt(t,r,n,e,o,a){if(!(o>0)||!(a>0))return{refusal:"EMPTY_ELEMENT_BOX"};let l=[r.topLeft,r.topRight,r.bottomRight,r.bottomLeft].map(y=>ne(t,y,n,e));if(l.some(y=>y.behind))return{refusal:"CORNER_BEHIND_CAMERA"};let u=l.map(y=>({x:y.sx,y:y.sy})),[p,c,d,m]=u,b=On([p.x,p.y],[c.x,c.y],[d.x,d.y],[m.x,m.y]);if(!b)return{refusal:"DEGENERATE_ON_SCREEN"};let h=.5*(p.x*c.y-c.x*p.y+(c.x*d.y-d.x*c.y)+(d.x*m.y-m.x*d.y)+(m.x*p.y-p.x*m.y)),v=1/o,x=1/a,[w,g,T,R,S,F,_,U,D]=b;return{transform:`matrix3d(${[w*v,R*v,0,_*v,g*x,S*x,0,U*x,0,0,1,0,T,F,0,D].map(Tr).join(", ")})`,matrix:b,screen:u,signedArea:h}}function Te(t){return"refusal"in t}var Ot=89,Ct=Math.PI/180;function at(t){let r=Math.max(-Ot,Math.min(Ot,t.elevationDeg))*Ct,n=t.azimuthDeg*Ct,e=Math.max(1e-4,t.distance),o=Math.sin(r)*e,a=Math.cos(r)*e;return[t.target[0]+Math.sin(n)*a,t.target[1]+o,t.target[2]+Math.cos(n)*a]}function st(t,r){let n=at(t),e=t.near??Math.max(.01,t.distance/100),o=t.far??Math.max(e+1,t.distance*8),a=Mt((t.fovDeg??38)*Ct,Math.max(.001,r),e,o),s=ot(n,t.target,[0,1,0]);return rt(a,s)}function Ut(t,r,n){let e=te(t.direction),o=t.extent??Math.max(.1,n*1.35),a=Math.max(1,n*2),s=[r[0]-e[0]*a,r[1]-e[1]*a,r[2]-e[2]*a],l=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],u=ot(s,r,l),p=St(-o,o,-o,o,.01,a+n*2+o);return rt(p,u)}function It(t,r){let n=Pe([r[0],r[1],r[2]],[t[0],t[1],t[2]]);return Math.hypot(n[0],n[1],n[2])/2}function kt(t,r){return[(t[0]+r[0])/2,(t[1]+r[1])/2,(t[2]+r[2])/2]}function Gt(t,r,n){let{gl:e}=t,o=Math.max(1,Math.floor(r)),a=Math.max(1,Math.floor(n)),s=e.createFramebuffer(),l=e.createTexture(),u=e.createTexture();if(!s||!l||!u)return H("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let p=t.hdr?e.RGBA16F:e.RGBA8,c=t.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,d=()=>{e.bindTexture(e.TEXTURE_2D,l),e.texImage2D(e.TEXTURE_2D,0,p,o,a,0,e.RGBA,c,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,u),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,o,a,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,s),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,l,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,u,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};d(),e.bindFramebuffer(e.FRAMEBUFFER,s);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE?H("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${m.toString(16)}). Depth texture support may be missing.`):{framebuffer:s,texture:l,depthTexture:u,get width(){return o},get height(){return a},bind(){e.bindFramebuffer(e.FRAMEBUFFER,s),e.viewport(0,0,o,a)},resize(b,h){let v=Math.max(1,Math.floor(b)),x=Math.max(1,Math.floor(h));v===o&&x===a||(o=v,a=x,d())},dispose(){e.deleteFramebuffer(s),e.deleteTexture(l),e.deleteTexture(u)}}}function Bt(t,r=1024){let{gl:n}=t,e=Math.max(256,Math.min(2048,Math.floor(r))),o=n.createFramebuffer(),a=n.createTexture();if(!o||!a)return H("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");n.bindTexture(n.TEXTURE_2D,a),n.texImage2D(n.TEXTURE_2D,0,n.DEPTH_COMPONENT24,e,e,0,n.DEPTH_COMPONENT,n.UNSIGNED_INT,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.bindFramebuffer(n.FRAMEBUFFER,o),n.framebufferTexture2D(n.FRAMEBUFFER,n.DEPTH_ATTACHMENT,n.TEXTURE_2D,a,0);let s=n.checkFramebufferStatus(n.FRAMEBUFFER);return n.bindFramebuffer(n.FRAMEBUFFER,null),s!==n.FRAMEBUFFER_COMPLETE?H("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${s.toString(16)}).`):{framebuffer:o,depthTexture:a,size:e,bind(){n.bindFramebuffer(n.FRAMEBUFFER,o),n.viewport(0,0,e,e)},dispose(){n.deleteFramebuffer(o),n.deleteTexture(a)}}}var lt=`
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
}`,it={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function ut(t,r,n={}){let e=n.zenith??it.zenith,o=n.horizon??it.horizon,a=n.ground??it.ground;t.uniform3f(t.getUniformLocation(r,"uSkyZenith"),e[0],e[1],e[2]),t.uniform3f(t.getUniformLocation(r,"uSkyHorizon"),o[0],o[1],o[2]),t.uniform3f(t.getUniformLocation(r,"uSkyGround"),a[0],a[1],a[2])}var Ar=`#version 300 es
precision highp float;
out vec2 vNdc;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`,vr=`#version 300 es
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
}`;function zt(t){let{gl:r}=t,n=t.compile(Ar,vr);return"kind"in n?n:{draw(e){let o=te(Pe(e.target,e.eye)),a=Math.abs(o[1])>.999?[0,0,1]:[0,1,0],s=te(De(o,a)),l=te(De(s,o));r.disable(r.DEPTH_TEST),r.depthMask(!1),r.disable(r.BLEND),r.useProgram(n),r.uniform3f(r.getUniformLocation(n,"uRight"),s[0],s[1],s[2]),r.uniform3f(r.getUniformLocation(n,"uUp"),l[0],l[1],l[2]),r.uniform3f(r.getUniformLocation(n,"uForward"),o[0],o[1],o[2]),r.uniform1f(r.getUniformLocation(n,"uTanHalfFov"),Math.tan(e.fovDeg*Math.PI/360)),r.uniform1f(r.getUniformLocation(n,"uAspect"),Math.max(.001,e.aspect)),ut(r,n,e.sky),t.blit(n),r.depthMask(!0),r.enable(r.DEPTH_TEST)},dispose(){r.deleteProgram(n)}}}var Cn=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,Vt=`#version 300 es
precision highp float;
void main(){}`,Rr=`#version 300 es
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
  /* THE NORMAL MATRIX, not the model matrix. Under non-uniform scale the model matrix skews
     normals off the surface and the lighting rotates as the object is squashed \u2014 the transpose
     of the inverse is the only transform that keeps them perpendicular. */
  vNormal = normalize(uNormalMat * aNormal);
  /* The tangent transforms by the MODEL matrix, not the normal matrix: it is a direction lying IN
     the surface, so it follows the geometry rather than staying perpendicular to it. Using the
     normal matrix here is a common slip and rotates the brush direction under non-uniform scale. */
  vTangent = normalize(mat3(uModel) * aTangent);
  gl_Position = uViewProj * world;
}`,In=`#version 300 es
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
${lt}

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
}`;function Ae(t,r){let{gl:n}=t,e=n.createVertexArray(),o=n.createBuffer(),a=n.createBuffer(),s=n.createBuffer(),l=n.createBuffer();return!e||!o||!a||!s||!l?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(n.bindVertexArray(e),n.bindBuffer(n.ARRAY_BUFFER,o),n.bufferData(n.ARRAY_BUFFER,r.positions,n.STATIC_DRAW),n.enableVertexAttribArray(0),n.vertexAttribPointer(0,3,n.FLOAT,!1,0,0),n.bindBuffer(n.ARRAY_BUFFER,a),n.bufferData(n.ARRAY_BUFFER,r.normals,n.STATIC_DRAW),n.enableVertexAttribArray(1),n.vertexAttribPointer(1,3,n.FLOAT,!1,0,0),n.bindBuffer(n.ARRAY_BUFFER,s),n.bufferData(n.ARRAY_BUFFER,r.tangents,n.STATIC_DRAW),n.enableVertexAttribArray(2),n.vertexAttribPointer(2,3,n.FLOAT,!1,0,0),n.bindBuffer(n.ELEMENT_ARRAY_BUFFER,l),n.bufferData(n.ELEMENT_ARRAY_BUFFER,r.indices,n.STATIC_DRAW),n.bindVertexArray(null),{vao:e,indexCount:r.indices.length,indexType:r.indices instanceof Uint32Array?n.UNSIGNED_INT:n.UNSIGNED_SHORT,dispose(){n.deleteVertexArray(e),n.deleteBuffer(o),n.deleteBuffer(a),n.deleteBuffer(s),n.deleteBuffer(l)}})}function Ht(t){let{gl:r}=t,n=t.compile(Cn,Vt);if("kind"in n)return n;let e=t.compile(Un,In);if("kind"in e)return e;let o=t.compile(Rr,Vt);if("kind"in o)return o;let a=(s,l)=>r.getUniformLocation(s,l);return{shadowPass(s,l,u,p){let c=p??(()=>{});u.bind(),c("shadow.bind"),r.clear(r.DEPTH_BUFFER_BIT),r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.FRONT),r.useProgram(n),c("useProgram(shadow)"),r.uniformMatrix4fv(a(n,"uLightVP"),!1,s),c("uLightVP");for(let d of l)r.uniformMatrix4fv(a(n,"uModel"),!1,d.model),c("shadow uModel"),r.bindVertexArray(d.mesh.vao),c("shadow bindVAO"),r.drawElements(r.TRIANGLES,d.mesh.indexCount,d.mesh.indexType,0),c("shadow drawElements");r.bindVertexArray(null),r.cullFace(r.BACK)},depthPrepass(s,l){r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.colorMask(!1,!1,!1,!1),r.useProgram(o),r.uniformMatrix4fv(a(o,"uViewProj"),!1,s);for(let u of l)r.uniformMatrix4fv(a(o,"uModel"),!1,u.model),r.bindVertexArray(u.mesh.vao),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0);r.bindVertexArray(null),r.colorMask(!0,!0,!0,!0)},draw(s){let l=s.onStep??(()=>{});if(r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.useProgram(e),r.uniformMatrix4fv(a(e,"uViewProj"),!1,s.viewProj),l("uViewProj"),r.uniform3fv(a(e,"uEye"),s.eye),l("uEye"),r.uniform3fv(a(e,"uLightDir"),s.lightDir),l("uLightDir"),r.uniform3fv(a(e,"uLightColour"),s.lightColour),l("uLightColour"),r.uniform1f(a(e,"uAmbientGain"),s.ambientGain??1),l("uAmbientGain"),s.fog&&s.fog.density>0){r.uniform1f(a(e,"uFogDensity"),s.fog.density),r.uniform1f(a(e,"uFogHeight"),s.fog.height),r.uniform1f(a(e,"uFogFloor"),s.fog.floor??0);let u=s.fog.colour;u==="sky"?r.uniform3f(a(e,"uFogColour"),-1,-1,-1):r.uniform3f(a(e,"uFogColour"),u[0],u[1],u[2]),l("fog")}else r.uniform1f(a(e,"uFogDensity"),0);ut(r,e,s.sky),l("bindSky"),s.ao&&s.screenSize?(r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,s.ao),r.uniform1i(a(e,"uAO"),1),r.uniform2f(a(e,"uScreenSize"),s.screenSize[0],s.screenSize[1]),r.uniform1f(a(e,"uAOEnabled"),1)):r.uniform1f(a(e,"uAOEnabled"),0),l("bindAO"),r.uniformMatrix4fv(a(e,"uLightVP"),!1,s.lightVP),l("lit uLightVP"),s.shadow?(r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,s.shadow.depthTexture),r.uniform1i(a(e,"uShadowMap"),0),r.uniform1f(a(e,"uShadowTexel"),1/s.shadow.size),r.uniform1f(a(e,"uShadowStrength"),s.shadowStrength??1)):r.uniform1f(a(e,"uShadowStrength"),0);for(let u of s.draws)r.uniformMatrix4fv(a(e,"uModel"),!1,u.model),r.uniformMatrix3fv(a(e,"uNormalMat"),!1,u.normalMat),l("uNormalMat"),r.uniform3fv(a(e,"uBaseColour"),u.material.baseColour),l("uBaseColour"),r.uniform1f(a(e,"uRoughness"),u.material.roughness),r.uniform1f(a(e,"uMetalness"),u.material.metalness),r.uniform1f(a(e,"uAnisotropy"),u.material.anisotropy??0),r.bindVertexArray(u.mesh.vao),l("lit bindVAO"),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0),l("lit drawElements");r.bindVertexArray(null),r.disable(r.CULL_FACE)},dispose(){r.deleteProgram(n),r.deleteProgram(e),r.deleteProgram(o)}}}var jt=`
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
}`,kn=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,wr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${jt}

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
}`,Mr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${jt}

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
}`;function $t(t,r,n){let{gl:e}=t,o=t.compile(kn,wr);if("kind"in o)return o;let a=t.compile(kn,Mr);if("kind"in a)return a;let s=Math.max(1,r>>1),l=Math.max(1,n>>1),u=()=>{let h=e.createFramebuffer(),v=e.createTexture();return!h||!v?null:{fb:h,tex:v}},p=u(),c=u();if(!p||!c)return H("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let d=()=>{for(let h of[p,c])e.bindTexture(e.TEXTURE_2D,h.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,s,l,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,h.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,h.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};d(),e.bindFramebuffer(e.FRAMEBUFFER,p.fb);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE)return H("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${m.toString(16)}).`);let b=(h,v,x,w,g,T,R)=>{e.activeTexture(e.TEXTURE0+R),e.bindTexture(e.TEXTURE_2D,v),e.uniform1i(e.getUniformLocation(h,"uDepth"),R),e.uniform2f(e.getUniformLocation(h,"uNearFar"),x,w),e.uniform1f(e.getUniformLocation(h,"uTanHalfFov"),Math.tan(g*Math.PI/360)),e.uniform1f(e.getUniformLocation(h,"uAspect"),T)};return{get texture(){return p.tex},get width(){return s},get height(){return l},compute(h){e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,p.fb),e.viewport(0,0,s,l),e.useProgram(o),b(o,h.depthTexture,h.near,h.far,h.fovDeg,h.aspect,0),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/s,1/l),e.uniform1f(e.getUniformLocation(o,"uRadius"),h.radius??.55),e.uniform1f(e.getUniformLocation(o,"uStrength"),h.strength??1.15),e.uniform1f(e.getUniformLocation(o,"uBias"),h.bias??.035),t.blit(o);for(let[v,x,w]of[[p,c,[1,0]],[c,p,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,x.fb),e.viewport(0,0,s,l),e.useProgram(a),b(a,h.depthTexture,h.near,h.far,h.fovDeg,h.aspect,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,v.tex),e.uniform1i(e.getUniformLocation(a,"uAO"),1),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/s,1/l),e.uniform2f(e.getUniformLocation(a,"uDir"),w[0],w[1]),t.blit(a);e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(h,v){let x=Math.max(1,h>>1),w=Math.max(1,v>>1);x===s&&w===l||(s=x,l=w,d())},dispose(){e.deleteProgram(o),e.deleteProgram(a);for(let h of[p,c])e.deleteFramebuffer(h.fb),e.deleteTexture(h.tex)}}}var Xt={instrument:"LCX_HOUSE_DOCTRINE",provision:"absent data refuses",text:'Absent data refuses. It never renders 0, never an estimate, never an empty list that reads as "nothing happened". A refusal carries a stable code and cites the rule it applies.'},Wt={instrument:"LCX_HOUSE_DOCTRINE",provision:"three states are never collapsed",text:"Three states are never collapsed: not-loaded / present-but-withheld / genuinely-empty."},Oe={instrument:"LCX_HOUSE_DOCTRINE",provision:"an inference is never laundered into a certainty",text:"An inference is never laundered into a certainty. If you cannot know, say you cannot know."},Gn={instrument:"LCX_HOUSE_DOCTRINE",provision:"every figure from a database carries an ObservationFrame and an environment label",text:"Every figure carries an ObservationFrame and an environment label where it came from a database."},Bn={instrument:"LCX_HOUSE_DOCTRINE",provision:"a projection is a choice, not a fact",text:"Placeholders must look like placeholders, and a view must name itself. A picture that does not state its projection is read as the data rather than as one view of it."},Sr="No interpolation. A cell is drawn only where all four of its corners were observed; a missing corner leaves a hole and is never smoothed over from its neighbours.",Fr=3,_r=Math.atan(1/Math.SQRT2)*180/Math.PI,Qt={azimuthDeg:45,elevationDeg:_r,scale:1},dt=Math.PI/180;function O(t,r=Qt){let n=r.azimuthDeg*dt,e=r.elevationDeg*dt,o=Math.sin(n),a=Math.cos(n),s=Math.sin(e),l=Math.cos(e);return{sx:(-t.x*o+t.y*a)*r.scale,sy:(t.x*s*a+t.y*s*o-t.z*l)*r.scale,depth:t.x*l*a+t.y*l*o+t.z*s}}function je(t,r,n=Qt){let e=n.azimuthDeg*dt,o=n.elevationDeg*dt;return t*Math.cos(o)*Math.cos(e)+r*Math.cos(o)*Math.sin(e)}function Lr(t){if(!Number.isFinite(t.azimuthDeg)||!Number.isFinite(t.elevationDeg)||!Number.isFinite(t.scale)||t.scale<=0)return!0;let r=(t.elevationDeg%360+360)%360;if(r<=0||r>=90)return!0;let n=(t.azimuthDeg%90+90)%90;return n<1e-9||Math.abs(n-90)<1e-9}function Dr(t,r){let n=ct(t.azimuthDeg,1),e=ct(t.elevationDeg,1),o=ct(r.height/r.width,2);return`Axonometric projection, orthographic (no perspective): azimuth ${n}\xB0, elevation ${e}\xB0. Vertical axis drawn at ${o}\xD7 the plan width \u2014 a CHOICE of exaggeration, not a property of the data. One view of two; ask for another azimuth to see the far face.`}var Pr={width:100,depth:100,height:62},zn=4,Nr=.62,Vn=2;function Or(t){return[t.width,t.depth,t.height].every(r=>Number.isFinite(r)&&r>0)}var ve="withheld";function jn(t){return t.kind==="projected"}function ct(t,r){if(!Number.isFinite(t))return t;let n=10**r,e=t*n;return!Number.isFinite(e)||e===0&&t!==0?t:Math.round(e)/n}function Hn(t){return t===0?0:t}function Cr(t,r,n=4){if(!Number.isFinite(t)||!Number.isFinite(r))return[];if(r===t)return[Hn(t)];if(t>r)return[];let e=(r-t)/Math.max(1,n),o=Math.floor(Math.log10(e));if(!Number.isFinite(o))return[];let a=d=>{if(!Number.isFinite(d)||d<=0)return 0;let m=Math.ceil(t/d-1e-9)*d;return Number.isFinite(m)?Math.max(0,Math.floor((r-m)/d+1e-9)+1):0},s=0,l=1/0;for(let d of[1,2,5,10]){let m=d*10**o,b=a(m);if(b<2)continue;let h=Math.abs(b-n);(h<l||h===l&&m<s)&&(l=h,s=m)}if(s<=0&&(s=e),!Number.isFinite(s)||s<=0)return[];let u=Math.ceil(t/s-1e-9)*s;if(!Number.isFinite(u))return[];let p=new Set,c=[];for(let d=u,m=0;d<=r+s*1e-9&&m<4096;d+=s,m++){let b=Hn(ct(d,9));p.has(b)||(p.add(b),c.push(b))}return c}function I(t,r,n,e,o){return{code:t,sentence:r,rule:n,cell:e,environment:o}}function Yt(t,r,n,e){return n===r?e/2:(t-r)/(n-r)*e}function $n(t){let r=t.view??Qt,n=t.box??Pr,e=t.frame.environment.trim(),o=[];e.length===0&&o.push(I("GEOMETRY_ENVIRONMENT_NOT_STATED","This surface will not draw: the caller did not say which database the heights came from, and a picture without an environment label is read as being about production.",Gn,null,null)),t.frame.observedAt.trim().length===0&&o.push(I("GEOMETRY_OBSERVATION_NOT_DATED","This surface will not draw: no observation date was supplied, and an undated figure is a screenshot that will be lying within a month.",Gn,null,e||null)),Lr(r)?o.push(I("GEOMETRY_PROJECTION_DEGENERATE",`This surface will not draw at azimuth ${r.azimuthDeg}\xB0 / elevation ${r.elevationDeg}\xB0: that view collapses a dimension, so the picture would look like a surface while carrying the information of a flat chart.`,Bn,null,e||null)):Or(n)||o.push(I("GEOMETRY_PROJECTION_DEGENERATE",`The projection box is ${n.width}\xD7${n.depth}\xD7${n.height}. Every extent must be a finite positive number or the cells project on top of one another.`,Bn,null,e||null));let a=t.xAxis.ticks,s=t.yAxis.ticks;a.length<2&&o.push(I("GEOMETRY_AXIS_DEGENERATE",`The ${t.xAxis.label} axis has ${a.length} coordinate${a.length===1?"":"s"}. A surface needs at least two on each axis \u2014 one is a line, and a line drawn in three dimensions still only carries what a line carries.`,Oe,null,e||null)),s.length<2&&o.push(I("GEOMETRY_AXIS_DEGENERATE",`The ${t.yAxis.label} axis has ${s.length} coordinate${s.length===1?"":"s"}. A surface needs at least two on each axis.`,Oe,null,e||null));let l=i=>{for(let f=0;f<i.ticks.length;f++)if(!Number.isFinite(i.ticks[f].value))return`coordinate ${f} ("${i.ticks[f].label}") is ${String(i.ticks[f].value)}, not a finite number`;for(let f=1;f<i.ticks.length;f++)if(i.ticks[f].value<=i.ticks[f-1].value)return`coordinate ${f} (${i.ticks[f].value}) does not exceed coordinate ${f-1} (${i.ticks[f-1].value}), so the coordinates are not strictly ascending`;return null},u=!1;for(let i of[t.xAxis,t.yAxis]){if(i.ticks.length<2)continue;let f=l(i);f!==null&&(u=!0,o.push(I("GEOMETRY_AXIS_DEGENERATE",`The ${i.label} axis cannot carry a mesh: ${f}. A surface is a single-valued height field over a rectilinear grid, and that is the premise the exact paint order rests on \u2014 a folded or non-finite axis draws overlapping polygons in a meaningless order.`,Oe,null,e||null)))}let p=!1;if(t.zDomain){let[i,f]=t.zDomain;!Number.isFinite(i)||!Number.isFinite(f)?(p=!0,o.push(I("GEOMETRY_Z_NOT_FINITE",`The caller set the ${t.zAxis.label} domain to ${String(i)}\u2013${String(f)}. That is a broken computation upstream, not a wide axis \u2014 a domain like this is what \`Math.min(...[])\`/\`Math.max(...[])\` over an empty surface returns \u2014 and it is refused here rather than drawn as a figure whose every coordinate is NaN.`,Oe,null,e||null))):i>=f&&(p=!0,o.push(I("GEOMETRY_AXIS_DEGENERATE",`The caller set the ${t.zAxis.label} domain to ${i}\u2013${f}, which is ${i===f?"a single point":"inverted"}. `+(i===f?"A vertical axis with no extent shades every cell identically and would make the figure state a flatness that is a property of the axis, not of the data.":"An inverted domain draws the highest value as the deepest trough and leaves the axis with no ticks at all \u2014 a picture that is upside-down and unlabelled, not merely unusual."),Oe,null,e||null)))}if(t.rows===null)return o.push(I("GEOMETRY_GRID_NOT_LOADED","The grid was never read, which is not the same as it being empty. Nothing is drawn and no cell count is reported, because zero cells observed would read as zero cells existing.",Wt,null,e||null)),{kind:"refused",refusals:o};let c=t.rows;if(c.length===0||c.every(i=>i.length===0))return o.push(I("GEOMETRY_GRID_EMPTY","The grid was read and holds no cells. That is a genuine emptiness, not a failed read, and it is reported as such rather than drawn as a flat sheet at zero.",Wt,null,e||null)),{kind:"refused",refusals:o};if(c.length!==s.length||c.some(i=>i.length!==a.length))return o.push(I("GEOMETRY_GRID_RAGGED",`The grid is ${c.length} row${c.length===1?"":"s"} of [${[...new Set(c.map(i=>i.length))].join(", ")}] against a ${s.length}\xD7${a.length} axis pair. No mesh exists over that, and padding the short rows would invent cells.`,Xt,null,e||null)),{kind:"refused",refusals:o};let m=0,b=0,h=0,v=0,x=[];for(let i=0;i<c.length;i++)for(let f=0;f<c[i].length;f++){v++;let P=c[i][f];if(P===ve){h++;continue}if(P===null){b++;continue}if(!Number.isFinite(P)){o.push(I("GEOMETRY_Z_NOT_FINITE",`${t.zAxis.label} at (${t.xAxis.ticks[f].label}, ${t.yAxis.ticks[i].label}) is ${String(P)}. That is a broken computation upstream, not a missing measurement, and it is refused here rather than drawn as a hole where it would hide.`,Oe,[f,i],e||null));continue}m++,x.push(P)}if(m===0){let i=o.some(f=>f.code==="GEOMETRY_Z_NOT_FINITE");return!i&&b>0&&o.push(I("GEOMETRY_ALL_CELLS_ABSENT",`${b} of ${v} grid points were never measured${h>0?` and the other ${h} are present but withheld`:""}, so not one height was observed. An empty box with axes on it reads as a measured flat surface, so nothing is drawn at all.`,Xt,null,e||null)),!i&&h>0&&o.push(I("GEOMETRY_ALL_CELLS_WITHHELD",`${h} of ${v} grid points are present but WITHHELD${b>0?` and the other ${b} were never measured`:""}. These heights exist and are not shown here; that is a permission fact, not a measurement gap, and it refuses under its own code so nobody reads it as "nothing was measured".`,Wt,null,e||null)),{kind:"refused",refusals:o}}if(a.length<2||s.length<2||u||p)return{kind:"refused",refusals:o};let w=x[0],g=x[0];for(let i of x)i<w&&(w=i),i>g&&(g=i);let T=t.zDomain?t.zDomain[0]:w,R=t.zDomain?t.zDomain[1]:g,S=g===w,F=R===T,_=a[0].value,U=a[a.length-1].value,D=s[0].value,A=s[s.length-1].value,y=i=>Yt(i,_,U,n.width),E=i=>Yt(i,D,A,n.depth),M=i=>F?n.height/2:Yt(i,T,R,n.height),z=(i,f,P)=>O({x:y(a[i].value),y:E(s[f].value),z:M(P)},r),N=[],Ke=F?1:R-T;for(let i=0;i<s.length-1;i++)for(let f=0;f<a.length-1;f++){let P=[[f,i],[f+1,i],[f+1,i+1],[f,i+1]],X=P.map(([ue,Ve])=>c[Ve][ue]),K=P.filter((ue,Ve)=>X[Ve]===null),V=P.filter((ue,Ve)=>X[Ve]===ve),Z=(y(a[f].value)+y(a[f+1].value))/2,j=(E(s[i].value)+E(s[i+1].value))/2,le=je(Z,j,r);if(K.length+V.length>0){let ue=T;N.push({kind:"hole",col:f,row:i,footprint:[O({x:y(a[f].value),y:E(s[i].value),z:M(ue)},r),O({x:y(a[f+1].value),y:E(s[i].value),z:M(ue)},r),O({x:y(a[f+1].value),y:E(s[i+1].value),z:M(ue)},r),O({x:y(a[f].value),y:E(s[i+1].value),z:M(ue)},r)],paintDepth:le,absentCorners:K,withheldCorners:V});continue}let G=X,xe=(G[0]+G[1]+G[2]+G[3])/4,Je=Math.min(...G),et=Math.max(...G),Rn=F?.5:(xe-T)/Ke,wn=Math.min(1,Math.max(0,Rn));N.push({kind:"quad",col:f,row:i,corners:[z(f,i,G[0]),z(f+1,i,G[1]),z(f+1,i+1,G[2]),z(f,i+1,G[3])],paintDepth:le,zMean:xe,zMin:Je,zMax:et,shade:wn,outsideDomain:Je<T||et>R,shadeClamped:wn!==Rn})}N.sort((i,f)=>i.paintDepth-f.paintDepth);let q=N.filter(i=>i.kind==="quad"),J=N.filter(i=>i.kind==="hole");if(q.length===0&&o.push(I("GEOMETRY_NO_COMPLETE_QUAD",`${m} grid point${m===1?" was":"s were"} observed but no cell has all four corners, so every polygon would need a corner invented. The values are present; the holes are in the wrong places.`,Xt,null,e||null)),o.length>0)return{kind:"refused",refusals:o};let oe=n.width/2,ee=n.depth/2,Ge=je(oe,E(D),r)>je(oe,E(A),r)?D:A,Be=je(y(_),ee,r)>je(y(U),ee,r)?_:U,$=Math.min(T,w),ae=a.map(i=>({value:i.value,label:i.label,at:O({x:y(i.value),y:E(Ge),z:M($)},r)})),se=s.map(i=>({value:i.value,label:i.label,at:O({x:y(Be),y:E(i.value),z:M($)},r)})),ye=(i,f)=>{let P=i.sx-f.sx,X=i.sy-f.sy,K=Math.hypot(P,X);return K===0?{dx:0,dy:1}:{dx:P/K,dy:X/K}},Ee=ye(O({x:oe,y:E(Ge),z:M($)},r),O({x:oe,y:E(Ge===D?A:D),z:M($)},r)),ge=ye(O({x:y(Be),y:ee,z:M($)},r),O({x:y(Be===_?U:_),y:ee,z:M($)},r)),ze=[[_,D],[U,D],[U,A],[_,A]],mn=i=>O({x:y(i[0]),y:E(i[1]),z:0},r).sx,_e=ze.reduce((i,f)=>mn(f)<mn(i)?f:i),pr=F?[T]:Cr(T,R,t.zAxis.tickCount??4),br=t.zAxis.formatTick??(i=>`${i}`),Tt=pr.map(i=>({value:i,label:br(i),at:O({x:y(_e[0]),y:E(_e[1]),z:M(i)},r)})),fn=i=>[O({x:y(_),y:E(D),z:M(i)},r),O({x:y(U),y:E(D),z:M(i)},r),O({x:y(U),y:E(A),z:M(i)},r),O({x:y(_),y:E(A),z:M(i)},r)],pn=fn(T),bn=!F&&T<0&&R>0,yn=bn?fn(0):null,En=[O({x:y(_e[0]),y:E(_e[1]),z:M(T)},r),O({x:y(_e[0]),y:E(_e[1]),z:F?n.height/2:n.height},r)],Le=[...pn,...En,...yn??[],...ae.map(i=>i.at),...se.map(i=>i.at),...Tt.map(i=>i.at)];for(let i of N)Le.push(...i.kind==="quad"?i.corners:i.footprint);let At=(i,f)=>{let P=[],X=Math.hypot(f.dx,f.dy)||1,K=f.dx/X,V=f.dy/X;for(let Z of i){let j=Z.label.length*zn*Nr,le=zn,G=Z.at.sx+K*(j/2+Vn),xe=Z.at.sy+V*(le/2+Vn);for(let[Je,et]of[[G-j/2,xe-le],[G+j/2,xe-le],[G-j/2,xe+le],[G+j/2,xe+le]])P.push({sx:Je,sy:et,depth:Z.at.depth})}return P};Le.push(...At(ae,Ee),...At(se,ge),...At(Tt,{dx:-1,dy:0}));let Ze=4,gn=Math.min(...Le.map(i=>i.sx))-Ze,yr=Math.max(...Le.map(i=>i.sx))+Ze,xn=Math.min(...Le.map(i=>i.sy))-Ze,Er=Math.max(...Le.map(i=>i.sy))+Ze,vt=(a.length-1)*(s.length-1),ie=[],Tn=J.filter(i=>i.absentCorners.length>0),An=J.filter(i=>i.withheldCorners.length>0),qe=J.filter(i=>i.absentCorners.length>0&&i.withheldCorners.length>0).length,vn=qe===0?"":` Counts overlap: ${qe} of the ${J.length} open cells ${qe===1?"has":"have"} a never-measured corner AND a withheld one, so ${qe===1?"it is":"they are"} counted in this notice and in the other alike \u2014 the two counts do not sum to the number of open cells.`;if(Tn.length>0&&ie.push({code:"HOLES_PRESENT",sentence:`${Tn.length} of ${vt} cells are open because a corner was never measured, so the surface has a genuine gap there. The gap is the measurement, not a rendering fault.${vn}`}),An.length>0&&ie.push({code:"CELLS_WITHHELD",sentence:`${An.length} of ${vt} cells are open because a corner is PRESENT BUT WITHHELD. Those heights were measured and are not shown here \u2014 a permission decision, not a gap in the data, and a different fact from the cells nobody measured.${vn}`}),S&&ie.push({code:"SURFACE_IS_FLAT",sentence:`Every observed ${t.zAxis.label} is ${w} ${t.zAxis.unit}. The surface is flat because the data is flat \u2014 an observed constant, not a failure to vary.`}),t.zDomain&&ie.push({code:"Z_DOMAIN_OVERRIDDEN",sentence:`The vertical domain was set by the caller to ${T}\u2013${R} ${t.zAxis.unit}, not taken from these values, which run ${w}\u2013${g}. Heights are comparable across surfaces and not to this grid alone.`}),t.zDomain&&(w<T||g>R)){let i=q.filter(V=>V.zMin<T||V.zMax>R),f="";if(i.length>0){let V=i[0].zMin,Z=i[0].zMax;for(let j of i)j.zMin<V&&(V=j.zMin),j.zMax>Z&&(Z=j.zMax);f=`, reaching ${V} at the lowest corner and ${Z} at the highest`}let P=q.filter(V=>V.shadeClamped).length,X=i.length===0?"No DRAWN cell leaves the box: the excursion is at a grid point that belongs to no complete cell, so it is in the counts and not in the sheet.":`${i.length} of ${q.length} drawn cells sit beyond the box on at least one CORNER${f}. Those heights are true and are never clamped, and the renderer marks them.`,K=P===0?" No cell MEAN leaves the box, so every shading still encodes the height it is drawn at.":` The SHADING of ${P} of them is clamped, so for those cells the ink and the height disagree.`;ie.push({code:"OBSERVED_RANGE_OUTSIDE_DOMAIN",sentence:`The observed ${t.zAxis.label} runs ${w}\u2013${g} ${t.zAxis.unit}, outside the caller's vertical domain of ${T}\u2013${R}. ${X}${K} Widen the domain or drop the override.`})}if(!F&&!bn){let i=T===0?`The vertical axis starts exactly at zero ${t.zAxis.unit}, so the FLOOR of the box is the break-even line and no separate zero plane is drawn.`:R===0?`The vertical axis ends exactly at zero ${t.zAxis.unit}, so the TOP of the box is the break-even line and no separate zero plane is drawn.`:`The vertical domain runs ${T}\u2013${R} ${t.zAxis.unit} and zero is not inside it, so no break-even line is drawn.`,f=g<0?" EVERY cell on this surface is at or below break-even: read the whole sheet as loss-making \u2014 a tall cell here is a smaller loss, not a profit.":w>0?" Relative heights are exaggerated by a floor above zero; do not read a tall cell as a large multiple of a short one.":"";ie.push({code:"Z_DOMAIN_EXCLUDES_ZERO",sentence:i+f})}return t.frame.valuesArePlaceholders===!0&&ie.push({code:"VALUES_ARE_PLACEHOLDERS",sentence:"The heights are PLACEHOLDERS. The shape of this surface is arithmetic over numbers nobody has agreed, and no decision may rest on it."}),{kind:"projected",view:r,box:n,projectionLabel:Dr(r,n),viewBox:{minX:gn,minY:xn,width:yr-gn,height:Er-xn},cells:N,quads:q,holes:J,xTicks:ae,yTicks:se,zTicks:Tt,xTickOutward:Ee,yTickOutward:ge,floor:pn,zAxis:En,zDomain:[T,R],zeroPlane:yn,flat:S,observedDomain:[w,g],frame:{environment:e,observedAt:t.frame.observedAt,windowFrom:t.frame.windowFrom,windowTo:t.frame.windowTo,source:t.frame.source,xLabel:t.xAxis.label,xUnit:t.xAxis.unit,yLabel:t.yAxis.label,yUnit:t.yAxis.unit,zLabel:t.zAxis.label,zUnit:t.zAxis.unit,cellsTotal:vt,cellsDrawn:q.length,cellsHoles:J.length,pointsObserved:m,pointsAbsent:b,pointsWithheld:h,interpolation:Sr,valuesArePlaceholders:t.frame.valuesArePlaceholders===!0,ruleSetVersion:Fr},notices:ie}}var bt=new URLSearchParams(location.search),Jt=bt.get("ao")!=="0",we=bt.get("mesh")!=="0",We=Math.max(1,Math.min(3,Number(bt.get("scale")??1))),Zn=Number(bt.get("frames")??300),W=1200*We,Y=720*We,Ue=document.getElementById("c");Ue.width=W;Ue.height=Y;var qn=document.getElementById("log");function an(t){throw document.title="REFUSED",qn.textContent=t,new Error(t)}function Q(t,r){return"kind"in r&&an(`${t}: ${r.code} \u2014 ${r.reason} ${r.detail??""}`),r}var mt=wt(Ue,{alpha:!1});Rt(mt)||an(`stage: ${mt.code} \u2014 ${mt.reason}`);var B=mt,L=B.gl,Ur=`#version 300 es
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
${_t}
${Lt}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,kr=Q("present",B.compile(Ur,Ir)),Kt=Q("lit",Ht(B)),ht=Q("target",Gt(B,W,Y)),en=Q("shadow",Bt(B,1536)),Gr=Q("sky",zt(B)),Xn=Q("ao",$t(B,W,Y)),Ye=[25,50,100,250,500,1e3,2500],Qe=[7,14,30,60,90,180],Jn=[[.31,.44,.52,.58,.49,.33,.18],[.28,.41,.55,.66,.61,.42,.24],[.22,.36,.51,.71,.74,.58,.35],[.17,.29,.42,.63,.72,.66,.44],[null,.21,.33,.48,.59,ve,ve],[null,.14,.24,.36,.45,ve,.29]],Br={rows:Jn,xAxis:{label:"Ticket size",unit:"$k",ticks:Ye.map(t=>({value:t,label:String(t)}))},yAxis:{label:"Days to close",unit:"d",ticks:Qe.map(t=>({value:t,label:String(t)}))},zAxis:{label:"Win rate",unit:"",tickCount:5},frame:{environment:"harness",observedAt:"2026-08-11T00:00:00.000Z",windowFrom:null,windowTo:null,source:"docs/3d/e5/entry.ts \u2014 synthetic",valuesArePlaceholders:!0}},tn=$n(Br);jn(tn)||an(`the flat engine REFUSED this input, so the mesh must too: ${tn.refusals.map(t=>t.code).join(", ")}`);var re=tn,yt=Ye.length,Et=Qe.length,he=4.6,Me=3.4,er=1.15,sn=0,ln=0,un=[],tr=(t,r)=>Jn[r][t],me=Pt(yt,Et,(t,r)=>{let n=tr(t,r);return n===ve?(sn++,un.push([t,r]),null):n===null?(ln++,null):n},he,Me,er),Ie=.16,nr=He(he+.5,Ie,Me+.5),rr=Dt(26,22),or=He(.3,.055,.3),zr=Q("deck",Ae(B,rr)),Vr=Q("plinth",Ae(B,nr)),Hr=Q("marker",Ae(B,or)),ft=me.cellsDrawn>0?Q("surface",Ae(B,me.geometry)):null,$e=new Float32Array([1,0,0,0,1,0,0,0,1]),Xe=(t,r,n)=>{let e=nt();return e[12]=t,e[13]=r,e[14]=n,e},fe=Ie,Se=(t,r)=>[-he/2+t/(yt-1)*he,fe,-Me/2+r/(Et-1)*Me],k=(()=>{let t=null;for(let r=0;r<Et;r++)for(let n=0;n<yt;n++){let e=tr(n,r);typeof e=="number"&&(!t||e>t.v)&&(t={c:n,r,v:e})}return t})(),de=me.observedRange,jr=t=>!de||de[1]===de[0]?fe:fe+(t-de[0])/(de[1]-de[0])*er,gt=k?Math.max(.02,jr(k.v)-fe):0,ar=He(.045,gt+.3,.045),nn=k?Q("probe",Ae(B,ar)):null,Ce={target:[0,.52,.05],distance:8.5,azimuthDeg:38,elevationDeg:26,fovDeg:34},rn=at(Ce),Re=[{mesh:zr,model:Xe(0,0,0),normalMat:$e,material:{baseColour:ce("#070B14"),roughness:.88,metalness:0}},{mesh:Vr,model:Xe(0,Ie/2,0),normalMat:$e,material:{baseColour:ce("#101A31"),roughness:.62,metalness:.04}}];we&&ft&&Re.push({mesh:ft,model:Xe(0,fe,0),normalMat:$e,material:{baseColour:ce("#2C6BFF"),roughness:.34,metalness:.05,anisotropy:.55}});for(let[t,r]of un){let[n,,e]=Se(t,r);Re.push({mesh:Hr,model:Xe(n,fe+.028,e),normalMat:$e,material:{baseColour:ce("#C98A2B"),roughness:.55,metalness:.08}})}if(we&&nn&&k){let[t,,r]=Se(k.c,k.r);Re.push({mesh:nn,model:Xe(t,fe+(gt+.3)/2,r),normalMat:$e,material:{baseColour:ce("#E8EEF9"),roughness:.22,metalness:.75,anisotropy:.3}})}var sr=[.48,-.62,-.62],Wn=[-3.6,0,-2.8],Yn=[4.2,1.8,3.2],Qn=Ut({direction:sr,colour:[1,1,1],extent:6.4},kt(Wn,Yn),It(Wn,Yn)),$r=Re.reduce((t,r,n)=>t+(n===0?Ne(rr):0),0)+Ne(nr)+(we&&ft?me.cellsDrawn*2:0)+un.length*Ne(or)+(we&&nn?Ne(ar):0),Xr=.1,Wr=60;function on(){let t=st(Ce,W/Y);Kt.shadowPass(Qn,Re,en),ht.bind(),L.clear(L.DEPTH_BUFFER_BIT),Gr.draw({eye:rn,target:Ce.target,fovDeg:Ce.fovDeg??34,aspect:W/Y}),Kt.depthPrepass(t,Re),Jt&&(Xn.compute({depthTexture:ht.depthTexture,near:Xr,far:Wr,fovDeg:Ce.fovDeg??34,aspect:W/Y,radius:.35,strength:1.25}),ht.bind()),Kt.draw({viewProj:t,eye:rn,lightDir:sr,lightColour:[3.4,3.35,3.2],ambientGain:1,lightVP:Qn,shadow:en,shadowStrength:.9,draws:Re,ao:Jt?Xn.texture:null,screenSize:[W,Y]}),L.bindFramebuffer(L.FRAMEBUFFER,null),L.viewport(0,0,W,Y),L.disable(L.DEPTH_TEST),L.activeTexture(L.TEXTURE0),L.bindTexture(L.TEXTURE_2D,ht.texture),B.blit(kr,r=>L.uniform1i(L.getUniformLocation(r,"uScene"),0))}function Yr(t){on();let r=new Uint8Array(4);L.readPixels(0,0,1,1,L.RGBA,L.UNSIGNED_BYTE,r);let n=performance.now();for(let e=0;e<t;e++)on();return L.readPixels(0,0,1,1,L.RGBA,L.UNSIGNED_BYTE,r),(performance.now()-n)/t}var Zt=Yr(Math.max(1,Zn)),ke=st(Ce,W/Y),pe=W/We,be=Y/We,xt=document.createElement("div");xt.style.cssText=`position:relative;overflow:hidden;width:${pe}px;height:${be}px`;Ue.parentNode?.insertBefore(xt,Ue);xt.appendChild(Ue);var Fe=document.createElement("div");Fe.style.cssText="position:absolute;inset:0;pointer-events:none";xt.appendChild(Fe);var cn=(t,r,n,e="")=>{let o=document.createElement("div");o.style.cssText=`position:absolute;left:${t.toFixed(1)}px;top:${r.toFixed(1)}px;transform:translate(-50%,-50%);white-space:nowrap;${e}`,o.innerHTML=n,Fe.appendChild(o)},ir="font:500 10.5px/1 ui-monospace,monospace;color:rgba(196,212,240,0.82);letter-spacing:.06em",Qr=Ye.map((t,r)=>{let n=ne(ke,[Se(r,0)[0],0,-Me/2-.42],pe,be),e=ne(ke,[Se(r,0)[0],0,Me/2+.42],pe,be),o=n.sy>e.sy?n:e;return o.behind||cn(o.sx,o.sy,String(t),ir),{value:t,sx:Math.round(o.sx),sy:Math.round(o.sy),behind:o.behind}}),Kr=Qe.map((t,r)=>{let n=ne(ke,[-he/2-.46,0,Se(0,r)[2]],pe,be),e=ne(ke,[he/2+.46,0,Se(0,r)[2]],pe,be),o=n.sx>e.sx?n:e;return o.behind||cn(o.sx,o.sy,String(t),ir),{value:t,sx:Math.round(o.sx),sy:Math.round(o.sy),behind:o.behind}}),lr=null;if(we&&k){let[t,,r]=Se(k.c,k.r),n=ne(ke,[t,fe+gt+.34,r],pe,be);n.behind||(cn(n.sx,n.sy,`<div style="font:600 9.5px/1 ui-monospace,monospace;letter-spacing:.16em;color:#8FB7FF">PEAK</div><div style="font:700 19px/1.1 system-ui,sans-serif;color:#fff">${(k.v*100).toFixed(0)}%</div><div style="font:400 10px/1.3 system-ui,sans-serif;color:rgba(214,226,246,0.8)">$${Ye[k.c]}k \xB7 ${Qe[k.r]} d</div>`,"text-align:center"),lr={sx:Math.round(n.sx),sy:Math.round(n.sy)})}var Zr=(()=>{let t=Me/2+.25,r=(he+.5)/2-.18;return{topLeft:[-r,Ie-.022,t+.002],topRight:[r,Ie-.022,t+.002],bottomRight:[r,.024,t+.002],bottomLeft:[-r,.024,t+.002]}})(),pt=[Math.round(2*((he+.5)/2-.18)*190),Math.round((Ie-.046)*190)],ur=26,C=Nt(ke,Zr,pe,be,pt[0],pt[1]),cr=Te(C)?0:Math.min(Math.hypot(C.screen[0].x-C.screen[3].x,C.screen[0].y-C.screen[3].y),Math.hypot(C.screen[1].x-C.screen[2].x,C.screen[1].y-C.screen[2].y)),dr=!Te(C)&&C.signedArea>0&&cr>=ur,Kn=`<span style="font:600 13px/1 ui-monospace,monospace;letter-spacing:.13em;color:rgba(233,240,255,0.92)">WIN RATE \xB7 TICKET SIZE \xD7 DAYS TO CLOSE</span><span style="font:500 12px/1 ui-monospace,monospace;color:rgba(160,184,224,0.82)">n=${re.frame.cellsDrawn}/${re.frame.cellsTotal} CELLS</span>`;if(dr&&!Te(C)){let t=document.createElement("div");t.style.cssText=`position:absolute;left:0;top:0;width:${pt[0]}px;height:${pt[1]}px;transform-origin:0 0;transform:${C.transform};display:flex;align-items:center;justify-content:space-between;padding:0 6px;overflow:hidden;-webkit-font-smoothing:antialiased`,t.innerHTML=Kn,Fe.appendChild(t)}else{let t=document.createElement("div");t.style.cssText="position:absolute;left:16px;bottom:16px;display:flex;flex-direction:column;gap:5px",t.innerHTML=Kn,Fe.appendChild(t)}var dn=document.createElement("div");dn.style.cssText="position:absolute;left:16px;top:14px;max-width:340px;display:flex;flex-direction:column;gap:5px";dn.innerHTML=re.notices.map(t=>`<div style="font:500 10.5px/1.4 ui-monospace,monospace;letter-spacing:.04em;color:${t.code==="VALUES_ARE_PLACEHOLDERS"?"#E0A94A":"rgba(150,176,220,0.85)"}">${t.code}</div>`).join("");Fe.appendChild(dn);var hn=document.createElement("div");hn.style.cssText="position:absolute;right:16px;bottom:14px;display:flex;flex-direction:column;gap:6px;align-items:flex-end;font:500 10.5px/1 ui-monospace,monospace;letter-spacing:.05em";hn.innerHTML=[["#2C6BFF",`OBSERVED \xB7 ${me.cellsDrawn} cells`],["#C98A2B",`WITHHELD \xB7 ${sn} points`],["transparent",`ABSENT \xB7 ${ln} points (holed)`]].map(([t,r])=>`<div style="display:flex;align-items:center;gap:7px;color:rgba(196,212,240,0.85)"><span>${r}</span><span style="width:11px;height:11px;background:${t};${t==="transparent"?"border:1px dashed rgba(196,212,240,0.55)":""};display:inline-block"></span></div>`).join("");Fe.appendChild(hn);var hr={cellsTotal:[re.frame.cellsTotal,(yt-1)*(Et-1)],cellsDrawn:[re.frame.cellsDrawn,me.cellsDrawn],cellsHoles:[re.frame.cellsHoles,me.cellsHoles],pointsAbsent:[re.frame.pointsAbsent,ln],pointsWithheld:[re.frame.pointsWithheld,sn]},qr=Object.values(hr).every(([t,r])=>t===r),mr=(()=>{let t=L.getExtension("WEBGL_debug_renderer_info");return t?String(L.getParameter(t.UNMASKED_RENDERER_WEBGL)):"unknown"})(),qt=/swiftshader|llvmpipe|software/i.test(mr),fr={ao:Jt,mesh:we,hdr:B.hdr,eye:rn.map(t=>Number(t.toFixed(2))),agreesWithFlat:qr,agreement:hr,observedRange:de?de.map(t=>Number(t.toFixed(3))):null,peak:k?{value:k.v,ticket:Ye[k.c],days:Qe[k.r],probeHeight:Number(gt.toFixed(3))}:null,probeLabel:lr,ticksOffFrame:[...Qr,...Kr].filter(t=>t.behind||t.sx<0||t.sx>pe||t.sy<0||t.sy>be).length,notices:re.notices.map(t=>t.code),title:{mode:dr?"projected":"screen",plateHeightPx:Number(cr.toFixed(1)),minPlatePx:ur,refusal:Te(C)?C.refusal:null,perspectiveX:Te(C)?null:Number((C.matrix[6]*1e3).toFixed(3))},glError:L.getError(),triangles:$r,surfaceTriangles:we&&ft?me.cellsDrawn*2:0,shadowMap:en.size,resolution:`${W}x${Y}`,dprScale:We,frames:Zn,msPerFrame:Number(Zt.toFixed(3)),fps:Math.round(1e3/Zt),renderer:mr,rendererClass:qt?"software":"hardware",headroom:qt?null:Number((16.6-Zt).toFixed(3)),headroomRefusal:qt?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null,hardwareMsPerFrame:null};globalThis.E5=fr;qn.textContent=JSON.stringify(fr,null,2);on();document.title="READY";

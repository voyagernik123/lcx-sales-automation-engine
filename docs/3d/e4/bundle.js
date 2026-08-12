var kt={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected."};function w(e,r){return r===void 0?{kind:"refused",code:e,reason:kt[e]}:{kind:"refused",code:e,reason:kt[e],detail:r}}function We(e){return e.kind==="stage"}function Ye(e,r={}){let n=e.getContext("webgl2",{antialias:r.antialias??!1,alpha:r.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!n)return w("NO_WEBGL2");let t=n.getExtension("EXT_color_buffer_float"),o=e.width,a=e.height,s=t?n.RGBA16F:n.RGBA8,i=t?n.HALF_FLOAT:n.UNSIGNED_BYTE,u=(g,x)=>{let T=n.createTexture();n.bindTexture(n.TEXTURE_2D,T),n.texImage2D(n.TEXTURE_2D,0,s,g,x,0,n.RGBA,i,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE);let R=n.createFramebuffer();n.bindFramebuffer(n.FRAMEBUFFER,R),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,T,0);let M=n.checkFramebufferStatus(n.FRAMEBUFFER);return M!==n.FRAMEBUFFER_COMPLETE?w("FRAMEBUFFER_INCOMPLETE",`status 0x${M.toString(16)} at ${g}\xD7${x}`):{texture:T,framebuffer:R,width:g,height:x}},c=r.bloomShift??2,l={w:o,h:a},d=u(o,a);if("kind"in d)return d;let f=u(Math.max(1,o>>c),Math.max(1,a>>c));if("kind"in f)return f;let h=u(Math.max(1,o>>c),Math.max(1,a>>c));if("kind"in h)return h;let m=n.createVertexArray();n.bindVertexArray(m);let p=n.createBuffer();n.bindBuffer(n.ARRAY_BUFFER,p),n.bufferData(n.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),n.STATIC_DRAW),n.enableVertexAttribArray(0),n.vertexAttribPointer(0,2,n.FLOAT,!1,0,0),n.bindVertexArray(null);let b=[];return{kind:"stage",gl:n,cssWidth:e.clientWidth||o,cssHeight:e.clientHeight||a,hdr:!!t,get width(){return l.w},get height(){return l.h},get scene(){return d},get bloomA(){return f},get bloomB(){return h},setRegion(g,x){let T=Math.max(1,Math.round(g)),R=Math.max(1,Math.round(x));if(!(T===l.w&&R===l.h)){l={w:T,h:R};for(let M of[d,f,h])"kind"in M||(n.deleteFramebuffer(M.framebuffer),n.deleteTexture(M.texture));d=u(T,R),f=u(Math.max(1,T>>c),Math.max(1,R>>c)),h=u(Math.max(1,T>>c),Math.max(1,R>>c))}},compile(g,x){let T=(ue,z)=>{let B=n.createShader(ue);return n.shaderSource(B,z),n.compileShader(B),n.getShaderParameter(B,n.COMPILE_STATUS)?B:w("SHADER_COMPILE_FAILED",n.getShaderInfoLog(B)??"(no log)")},R=T(n.VERTEX_SHADER,g);if(typeof R=="object"&&"kind"in R)return R;let M=T(n.FRAGMENT_SHADER,x);if(typeof M=="object"&&"kind"in M)return M;let _=n.createProgram();return n.attachShader(_,R),n.attachShader(_,M),n.linkProgram(_),n.getProgramParameter(_,n.LINK_STATUS)?(b.push(_),_):w("PROGRAM_LINK_FAILED",n.getProgramInfoLog(_)??"(no log)")},bindTarget(g){n.bindFramebuffer(n.FRAMEBUFFER,g?g.framebuffer:null),n.viewport(0,0,g?g.width:l.w,g?g.height:l.h)},blit(g,x){n.useProgram(g),n.bindVertexArray(m),x?.(g),n.drawArrays(n.TRIANGLES,0,3),n.bindVertexArray(null)},dispose(){for(let g of b)n.deleteProgram(g);for(let g of[d,f,h])"kind"in g||(n.deleteFramebuffer(g.framebuffer),n.deleteTexture(g.texture));n.deleteBuffer(p),n.deleteVertexArray(m)}}}var ee=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function Me(e,r){let n=new Float32Array(16);for(let t=0;t<4;t++)for(let o=0;o<4;o++){let a=0;for(let s=0;s<4;s++)a+=e[s*4+o]*r[t*4+s];n[t*4+o]=a}return n}var Fe=(e,r)=>[e[0]-r[0],e[1]-r[1],e[2]-r[2]],Ae=(e,r)=>e[0]*r[0]+e[1]*r[1]+e[2]*r[2],Ke=(e,r)=>[e[1]*r[2]-e[2]*r[1],e[2]*r[0]-e[0]*r[2],e[0]*r[1]-e[1]*r[0]];function le(e){let r=Math.hypot(e[0],e[1],e[2]);return r===0?e:[e[0]/r,e[1]/r,e[2]/r]}function Qe(e,r,n,t){let o=1/Math.tan(e/2);return new Float32Array([o/r,0,0,0,0,o,0,0,0,0,(t+n)/(n-t),-1,0,0,2*t*n/(n-t),0])}function qe(e,r,n,t,o,a){let s=r-e,i=t-n,u=a-o;return new Float32Array([2/s,0,0,0,0,2/i,0,0,0,0,-2/u,0,-(r+e)/s,-(t+n)/i,-(a+o)/u,1])}function Se(e,r,n){let t=le(Fe(e,r)),o=Ke(n,t);if(Math.hypot(o[0],o[1],o[2])<1e-8)return ee();let a=le(o),s=Ke(t,a);return new Float32Array([a[0],s[0],t[0],0,a[1],s[1],t[1],0,a[2],s[2],t[2],0,-Ae(a,e),-Ae(s,e),-Ae(t,e),1])}function Ht(e,r){let n=[0,1,2,3].map(o=>e[0+o]*r[0]+e[4+o]*r[1]+e[8+o]*r[2]+e[12+o]),t=n[3];return{x:n[0]/t,y:n[1]/t,z:n[2]/t,w:t}}function V(e,r,n,t){let o=Ht(e,r);return{sx:(o.x*.5+.5)*n,sy:(1-(o.y*.5+.5))*t,behind:o.w<=0}}function $t(e){return e<=.04045?e/12.92:Math.pow((e+.055)/1.055,2.4)}var Kn=/^#?([0-9a-fA-F]{6})$/;function P(e){let r=Kn.exec(e.trim());if(!r)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(e)}`);let n=r[1];return[0,2,4].map(t=>$t(parseInt(n.slice(t,t+2),16)/255))}var Ze={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},Qn=Object.freeze(Object.fromEntries(Object.keys(Ze).map(e=>[e,P(Ze[e])])));var zt=.4;var Je=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${zt.toFixed(2)}); }`,et=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function qn(e){let r=[1/0,1/0,1/0],n=[-1/0,-1/0,-1/0];for(let t=0;t<e.length;t+=3)for(let o=0;o<3;o++){let a=e[t+o];a<r[o]&&(r[o]=a),a>n[o]&&(n[o]=a)}return e.length===0?{min:[0,0,0],max:[0,0,0]}:{min:r,max:n}}function Xt(e,r,n,t){let o=new Float32Array(e.length);for(let s=0;s<t.length;s+=3){let i=t[s],u=t[s+1],c=t[s+2],l=i*3,d=u*3,f=c*3,h=i*2,m=u*2,p=c*2,b=e[d]-e[l],E=e[d+1]-e[l+1],g=e[d+2]-e[l+2],x=e[f]-e[l],T=e[f+1]-e[l+1],R=e[f+2]-e[l+2],M=n[m]-n[h],_=n[m+1]-n[h+1],ue=n[p]-n[h],z=n[p+1]-n[h+1],B=M*z-ue*_;if(Math.abs(B)<1e-12)continue;let O=1/B,jn=(b*z-x*_)*O,Wn=(E*z-T*_)*O,Yn=(g*z-R*_)*O;for(let J of[l,d,f])o[J]=o[J]+jn,o[J+1]=o[J+1]+Wn,o[J+2]=o[J+2]+Yn}let a=new Float32Array(e.length);for(let s=0;s<a.length;s+=3){let i=r[s],u=r[s+1],c=r[s+2],l=o[s],d=o[s+1],f=o[s+2],h=l*i+d*u+f*c;l-=i*h,d-=u*h,f-=c*h;let m=Math.hypot(l,d,f);m<1e-8&&(Math.abs(i)<.9?(l=0,d=-c,f=u):(l=-c,d=0,f=i),m=Math.hypot(l,d,f)||1),a[s]=l/m,a[s+1]=d/m,a[s+2]=f/m}return a}function jt(e,r){let n=new Float32Array(e.length);for(let t=0;t<r.length;t+=3){let o=r[t]*3,a=r[t+1]*3,s=r[t+2]*3,i=e[a]-e[o],u=e[a+1]-e[o+1],c=e[a+2]-e[o+2],l=e[s]-e[o],d=e[s+1]-e[o+1],f=e[s+2]-e[o+2],h=u*f-c*d,m=c*l-i*f,p=i*d-u*l;for(let b of[o,a,s])n[b]=n[b]+h,n[b+1]=n[b+1]+m,n[b+2]=n[b+2]+p}for(let t=0;t<n.length;t+=3){let o=Math.hypot(n[t],n[t+1],n[t+2]);o>0&&(n[t]=n[t]/o,n[t+1]=n[t+1]/o,n[t+2]=n[t+2]/o)}return n}function ve(e,r,n,t,o){let{min:a,max:s}=qn(e),i=t??jt(e,n);return{positions:e,normals:i,uvs:r,indices:n,min:a,max:s,tangents:o??Xt(e,i,r,n)}}function tt(e=10,r=24){let n=Math.max(1,Math.floor(r)),t=(n+1)*(n+1),o=new Float32Array(t*3),a=new Float32Array(t*3),s=new Float32Array(t*2),i=new Uint16Array(n*n*6),u=0,c=0,l=0;for(let d=0;d<=n;d++)for(let f=0;f<=n;f++){let h=(f/n-.5)*e,m=(d/n-.5)*e;o[u]=h,o[u+1]=0,o[u+2]=m,a[u]=0,a[u+1]=1,a[u+2]=0,u+=3,s[c++]=f/n,s[c++]=d/n}for(let d=0;d<n;d++)for(let f=0;f<n;f++){let h=d*(n+1)+f,m=h+1,p=h+(n+1),b=p+1;i[l++]=h,i[l++]=p,i[l++]=m,i[l++]=m,i[l++]=p,i[l++]=b}return ve(o,s,i,a)}function Le(e=.5,r=24,n=32){let t=Math.max(2,r),o=Math.max(3,n),a=(t+1)*(o+1),s=new Float32Array(a*3),i=new Float32Array(a*3),u=new Float32Array(a*2),c=new Uint16Array(t*o*6),l=0,d=0,f=0;for(let h=0;h<=t;h++){let m=h/t*Math.PI;for(let p=0;p<=o;p++){let b=p/o*Math.PI*2,E=Math.sin(m)*Math.cos(b),g=Math.cos(m),x=Math.sin(m)*Math.sin(b);s[l]=E*e,s[l+1]=g*e,s[l+2]=x*e,i[l]=E,i[l+1]=g,i[l+2]=x,l+=3,u[d++]=p/o,u[d++]=h/t}}for(let h=0;h<t;h++)for(let m=0;m<o;m++){let p=h*(o+1)+m,b=p+1,E=p+(o+1),g=E+1;c[f++]=p,c[f++]=b,c[f++]=E,c[f++]=b,c[f++]=g,c[f++]=E}return ve(s,u,c,i)}function _e(e=.5,r=.2,n=64){let t=Math.max(3,n),o=r/2,a=[],s=[],i=[],u=[],c=[];for(let l=0;l<=t;l++){let d=l/t*Math.PI*2,f=Math.cos(d),h=Math.sin(d);a.push(f*e,o,h*e),s.push(f,0,h),i.push(l/t,1),c.push(-h,0,f),a.push(f*e,-o,h*e),s.push(f,0,h),i.push(l/t,0),c.push(-h,0,f)}for(let l=0;l<t;l++){let d=l*2,f=d+1,h=d+2,m=d+3;u.push(d,h,f,f,h,m)}for(let[l,d]of[[1,o],[-1,-o]]){let f=a.length/3;a.push(0,d,0),s.push(0,l,0),i.push(.5,.5),c.push(1,0,0);for(let h=0;h<=t;h++){let m=h/t*Math.PI*2,p=Math.cos(m),b=Math.sin(m);a.push(p*e,d,b*e),s.push(0,l,0),i.push(.5+p*.5,.5+b*.5),c.push(-b,0,p)}for(let h=0;h<t;h++){let m=f+1+h,p=f+2+h;l>0?u.push(f,p,m):u.push(f,m,p)}}return ve(new Float32Array(a),new Float32Array(i),new Uint16Array(u),new Float32Array(s),new Float32Array(c))}function we(e=.5,r=.08,n=64,t=24){let o=Math.max(3,n),a=Math.max(3,t),s=[],i=[],u=[],c=[],l=[];for(let d=0;d<=o;d++){let f=d/o*Math.PI*2,h=Math.cos(f),m=Math.sin(f);for(let p=0;p<=a;p++){let b=p/a*Math.PI*2,E=Math.cos(b),g=Math.sin(b);s.push((e+r*E)*h,r*g,(e+r*E)*m),i.push(h*E,g,m*E),u.push(d/o,p/a),l.push(-m,0,h)}}for(let d=0;d<o;d++)for(let f=0;f<a;f++){let h=d*(a+1)+f,m=h+1,p=h+(a+1),b=p+1;c.push(h,m,p,m,b,p)}return ve(new Float32Array(s),new Float32Array(u),new Uint16Array(c),new Float32Array(i),new Float32Array(l))}function G(e){return e.indices.length/3}function Zn(e){if(!Number.isFinite(e)||e===0)return"0";let r=e.toFixed(12).replace(/0+$/,"").replace(/\.$/,"");return r==="-0"?"0":r}function Wt(e,r,n,t){let[o,a]=e,[s,i]=r,[u,c]=n,[l,d]=t,f=o-s+u-l,h=a-i+c-d;if(Math.abs(f)<1e-9&&Math.abs(h)<1e-9){let R=[s-o,l-o,o,i-a,d-a,a,0,0,1],M=R[0]*R[4]-R[1]*R[3];return Math.abs(M)<1e-9?null:R}let m=s-u,p=l-u,b=i-c,E=d-c,g=m*E-p*b;if(Math.abs(g)<1e-9)return null;let x=(f*E-p*h)/g,T=(m*h-f*b)/g;return[s-o+x*s,l-o+T*l,o,i-a+x*i,d-a+T*d,a,x,T,1]}function Ne(e,r,n,t,o,a){if(!(o>0)||!(a>0))return{refusal:"EMPTY_ELEMENT_BOX"};let i=[r.topLeft,r.topRight,r.bottomRight,r.bottomLeft].map(O=>V(e,O,n,t));if(i.some(O=>O.behind))return{refusal:"CORNER_BEHIND_CAMERA"};let u=i.map(O=>({x:O.sx,y:O.sy})),[c,l,d,f]=u,h=Wt([c.x,c.y],[l.x,l.y],[d.x,d.y],[f.x,f.y]);if(!h)return{refusal:"DEGENERATE_ON_SCREEN"};let m=.5*(c.x*l.y-l.x*c.y+(l.x*d.y-d.x*l.y)+(d.x*f.y-f.x*d.y)+(f.x*c.y-c.x*f.y)),p=1/o,b=1/a,[E,g,x,T,R,M,_,ue,z]=h;return{transform:`matrix3d(${[E*p,T*p,0,_*p,g*b,R*b,0,ue*b,0,0,1,0,x,M,0,z].map(Zn).join(", ")})`,matrix:h,screen:u,signedArea:m}}function De(e){return"refusal"in e}var nt=89,rt=Math.PI/180;function ce(e){let r=Math.max(-nt,Math.min(nt,e.elevationDeg))*rt,n=e.azimuthDeg*rt,t=Math.max(1e-4,e.distance),o=Math.sin(r)*t,a=Math.cos(r)*t;return[e.target[0]+Math.sin(n)*a,e.target[1]+o,e.target[2]+Math.cos(n)*a]}function de(e,r){let n=ce(e),t=e.near??Math.max(.01,e.distance/100),o=e.far??Math.max(t+1,e.distance*8),a=Qe((e.fovDeg??38)*rt,Math.max(.001,r),t,o),s=Se(n,e.target,[0,1,0]);return Me(a,s)}function ot(e,r,n){let t=le(e.direction),o=e.extent??Math.max(.1,n*1.35),a=Math.max(1,n*2),s=[r[0]-t[0]*a,r[1]-t[1]*a,r[2]-t[2]*a],i=Math.abs(t[1])>.99?[0,0,1]:[0,1,0],u=Se(s,r,i),c=qe(-o,o,-o,o,.01,a+n*2+o);return Me(c,u)}function at(e,r){let n=Fe([r[0],r[1],r[2]],[e[0],e[1],e[2]]);return Math.hypot(n[0],n[1],n[2])/2}function st(e,r){return[(e[0]+r[0])/2,(e[1]+r[1])/2,(e[2]+r[2])/2]}function it(e,r,n){let{gl:t}=e,o=Math.max(1,Math.floor(r)),a=Math.max(1,Math.floor(n)),s=t.createFramebuffer(),i=t.createTexture(),u=t.createTexture();if(!s||!i||!u)return w("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let c=e.hdr?t.RGBA16F:t.RGBA8,l=e.hdr?t.HALF_FLOAT:t.UNSIGNED_BYTE,d=()=>{t.bindTexture(t.TEXTURE_2D,i),t.texImage2D(t.TEXTURE_2D,0,c,o,a,0,t.RGBA,l,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindTexture(t.TEXTURE_2D,u),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,o,a,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,s),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,i,0),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,u,0),t.bindFramebuffer(t.FRAMEBUFFER,null)};d(),t.bindFramebuffer(t.FRAMEBUFFER,s);let f=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),f!==t.FRAMEBUFFER_COMPLETE?w("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${f.toString(16)}). Depth texture support may be missing.`):{framebuffer:s,texture:i,depthTexture:u,get width(){return o},get height(){return a},bind(){t.bindFramebuffer(t.FRAMEBUFFER,s),t.viewport(0,0,o,a)},resize(h,m){let p=Math.max(1,Math.floor(h)),b=Math.max(1,Math.floor(m));p===o&&b===a||(o=p,a=b,d())},dispose(){t.deleteFramebuffer(s),t.deleteTexture(i),t.deleteTexture(u)}}}function ut(e,r=1024){let{gl:n}=e,t=Math.max(256,Math.min(2048,Math.floor(r))),o=n.createFramebuffer(),a=n.createTexture();if(!o||!a)return w("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");n.bindTexture(n.TEXTURE_2D,a),n.texImage2D(n.TEXTURE_2D,0,n.DEPTH_COMPONENT24,t,t,0,n.DEPTH_COMPONENT,n.UNSIGNED_INT,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.bindFramebuffer(n.FRAMEBUFFER,o),n.framebufferTexture2D(n.FRAMEBUFFER,n.DEPTH_ATTACHMENT,n.TEXTURE_2D,a,0);let s=n.checkFramebufferStatus(n.FRAMEBUFFER);return n.bindFramebuffer(n.FRAMEBUFFER,null),s!==n.FRAMEBUFFER_COMPLETE?w("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${s.toString(16)}).`):{framebuffer:o,depthTexture:a,size:t,bind(){n.bindFramebuffer(n.FRAMEBUFFER,o),n.viewport(0,0,t,t)},dispose(){n.deleteFramebuffer(o),n.deleteTexture(a)}}}var ct=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,lt={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function Yt(e,r,n={}){let t=n.zenith??lt.zenith,o=n.horizon??lt.horizon,a=n.ground??lt.ground;e.uniform3f(e.getUniformLocation(r,"uSkyZenith"),t[0],t[1],t[2]),e.uniform3f(e.getUniformLocation(r,"uSkyHorizon"),o[0],o[1],o[2]),e.uniform3f(e.getUniformLocation(r,"uSkyGround"),a[0],a[1],a[2])}var kr=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${ct}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;var Kt=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,dt=`#version 300 es
precision highp float;
void main(){}`,Jn=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,Qt=`#version 300 es
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
}`,qt=`#version 300 es
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
${ct}

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
}`;function k(e,r){let{gl:n}=e,t=n.createVertexArray(),o=n.createBuffer(),a=n.createBuffer(),s=n.createBuffer(),i=n.createBuffer();return!t||!o||!a||!s||!i?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(n.bindVertexArray(t),n.bindBuffer(n.ARRAY_BUFFER,o),n.bufferData(n.ARRAY_BUFFER,r.positions,n.STATIC_DRAW),n.enableVertexAttribArray(0),n.vertexAttribPointer(0,3,n.FLOAT,!1,0,0),n.bindBuffer(n.ARRAY_BUFFER,a),n.bufferData(n.ARRAY_BUFFER,r.normals,n.STATIC_DRAW),n.enableVertexAttribArray(1),n.vertexAttribPointer(1,3,n.FLOAT,!1,0,0),n.bindBuffer(n.ARRAY_BUFFER,s),n.bufferData(n.ARRAY_BUFFER,r.tangents,n.STATIC_DRAW),n.enableVertexAttribArray(2),n.vertexAttribPointer(2,3,n.FLOAT,!1,0,0),n.bindBuffer(n.ELEMENT_ARRAY_BUFFER,i),n.bufferData(n.ELEMENT_ARRAY_BUFFER,r.indices,n.STATIC_DRAW),n.bindVertexArray(null),{vao:t,indexCount:r.indices.length,indexType:r.indices instanceof Uint32Array?n.UNSIGNED_INT:n.UNSIGNED_SHORT,dispose(){n.deleteVertexArray(t),n.deleteBuffer(o),n.deleteBuffer(a),n.deleteBuffer(s),n.deleteBuffer(i)}})}function mt(e){let{gl:r}=e,n=e.compile(Kt,dt);if("kind"in n)return n;let t=e.compile(Qt,qt);if("kind"in t)return t;let o=e.compile(Jn,dt);if("kind"in o)return o;let a=(s,i)=>r.getUniformLocation(s,i);return{shadowPass(s,i,u,c){let l=c??(()=>{});u.bind(),l("shadow.bind"),r.clear(r.DEPTH_BUFFER_BIT),r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.FRONT),r.useProgram(n),l("useProgram(shadow)"),r.uniformMatrix4fv(a(n,"uLightVP"),!1,s),l("uLightVP");for(let d of i)r.uniformMatrix4fv(a(n,"uModel"),!1,d.model),l("shadow uModel"),r.bindVertexArray(d.mesh.vao),l("shadow bindVAO"),r.drawElements(r.TRIANGLES,d.mesh.indexCount,d.mesh.indexType,0),l("shadow drawElements");r.bindVertexArray(null),r.cullFace(r.BACK)},depthPrepass(s,i){r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.colorMask(!1,!1,!1,!1),r.useProgram(o),r.uniformMatrix4fv(a(o,"uViewProj"),!1,s);for(let u of i)r.uniformMatrix4fv(a(o,"uModel"),!1,u.model),r.bindVertexArray(u.mesh.vao),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0);r.bindVertexArray(null),r.colorMask(!0,!0,!0,!0)},draw(s){let i=s.onStep??(()=>{});if(r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.useProgram(t),r.uniformMatrix4fv(a(t,"uViewProj"),!1,s.viewProj),i("uViewProj"),r.uniform3fv(a(t,"uEye"),s.eye),i("uEye"),r.uniform3fv(a(t,"uLightDir"),s.lightDir),i("uLightDir"),r.uniform3fv(a(t,"uLightColour"),s.lightColour),i("uLightColour"),r.uniform1f(a(t,"uAmbientGain"),s.ambientGain??1),i("uAmbientGain"),s.fog&&s.fog.density>0){r.uniform1f(a(t,"uFogDensity"),s.fog.density),r.uniform1f(a(t,"uFogHeight"),s.fog.height),r.uniform1f(a(t,"uFogFloor"),s.fog.floor??0);let u=s.fog.colour;u==="sky"?r.uniform3f(a(t,"uFogColour"),-1,-1,-1):r.uniform3f(a(t,"uFogColour"),u[0],u[1],u[2]),i("fog")}else r.uniform1f(a(t,"uFogDensity"),0);Yt(r,t,s.sky),i("bindSky"),s.ao&&s.screenSize?(r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,s.ao),r.uniform1i(a(t,"uAO"),1),r.uniform2f(a(t,"uScreenSize"),s.screenSize[0],s.screenSize[1]),r.uniform1f(a(t,"uAOEnabled"),1)):r.uniform1f(a(t,"uAOEnabled"),0),i("bindAO"),r.uniformMatrix4fv(a(t,"uLightVP"),!1,s.lightVP),i("lit uLightVP"),s.shadow?(r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,s.shadow.depthTexture),r.uniform1i(a(t,"uShadowMap"),0),r.uniform1f(a(t,"uShadowTexel"),1/s.shadow.size),r.uniform1f(a(t,"uShadowStrength"),s.shadowStrength??1)):r.uniform1f(a(t,"uShadowStrength"),0);for(let u of s.draws)r.uniformMatrix4fv(a(t,"uModel"),!1,u.model),r.uniformMatrix3fv(a(t,"uNormalMat"),!1,u.normalMat),i("uNormalMat"),r.uniform3fv(a(t,"uBaseColour"),u.material.baseColour),i("uBaseColour"),r.uniform1f(a(t,"uRoughness"),u.material.roughness),r.uniform1f(a(t,"uMetalness"),u.material.metalness),r.uniform1f(a(t,"uAnisotropy"),u.material.anisotropy??0),r.bindVertexArray(u.mesh.vao),i("lit bindVAO"),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0),i("lit drawElements");r.bindVertexArray(null),r.disable(r.CULL_FACE)},dispose(){r.deleteProgram(n),r.deleteProgram(t),r.deleteProgram(o)}}}var ft=`
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
}`,Zt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,er=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${ft}

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
}`,tr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${ft}

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
}`;function ht(e,r,n){let{gl:t}=e,o=e.compile(Zt,er);if("kind"in o)return o;let a=e.compile(Zt,tr);if("kind"in a)return a;let s=Math.max(1,r>>1),i=Math.max(1,n>>1),u=()=>{let m=t.createFramebuffer(),p=t.createTexture();return!m||!p?null:{fb:m,tex:p}},c=u(),l=u();if(!c||!l)return w("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let d=()=>{for(let m of[c,l])t.bindTexture(t.TEXTURE_2D,m.tex),t.texImage2D(t.TEXTURE_2D,0,t.R8,s,i,0,t.RED,t.UNSIGNED_BYTE,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,m.fb),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,m.tex,0);t.bindFramebuffer(t.FRAMEBUFFER,null)};d(),t.bindFramebuffer(t.FRAMEBUFFER,c.fb);let f=t.checkFramebufferStatus(t.FRAMEBUFFER);if(t.bindFramebuffer(t.FRAMEBUFFER,null),f!==t.FRAMEBUFFER_COMPLETE)return w("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${f.toString(16)}).`);let h=(m,p,b,E,g,x,T)=>{t.activeTexture(t.TEXTURE0+T),t.bindTexture(t.TEXTURE_2D,p),t.uniform1i(t.getUniformLocation(m,"uDepth"),T),t.uniform2f(t.getUniformLocation(m,"uNearFar"),b,E),t.uniform1f(t.getUniformLocation(m,"uTanHalfFov"),Math.tan(g*Math.PI/360)),t.uniform1f(t.getUniformLocation(m,"uAspect"),x)};return{get texture(){return c.tex},get width(){return s},get height(){return i},compute(m){t.disable(t.DEPTH_TEST),t.depthMask(!1),t.disable(t.BLEND),t.disable(t.CULL_FACE),t.bindFramebuffer(t.FRAMEBUFFER,c.fb),t.viewport(0,0,s,i),t.useProgram(o),h(o,m.depthTexture,m.near,m.far,m.fovDeg,m.aspect,0),t.uniform2f(t.getUniformLocation(o,"uTexel"),1/s,1/i),t.uniform1f(t.getUniformLocation(o,"uRadius"),m.radius??.55),t.uniform1f(t.getUniformLocation(o,"uStrength"),m.strength??1.15),t.uniform1f(t.getUniformLocation(o,"uBias"),m.bias??.035),e.blit(o);for(let[p,b,E]of[[c,l,[1,0]],[l,c,[0,1]]])t.bindFramebuffer(t.FRAMEBUFFER,b.fb),t.viewport(0,0,s,i),t.useProgram(a),h(a,m.depthTexture,m.near,m.far,m.fovDeg,m.aspect,0),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,p.tex),t.uniform1i(t.getUniformLocation(a,"uAO"),1),t.uniform2f(t.getUniformLocation(a,"uTexel"),1/s,1/i),t.uniform2f(t.getUniformLocation(a,"uDir"),E[0],E[1]),e.blit(a);t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,null),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,null),t.bindFramebuffer(t.FRAMEBUFFER,null),t.depthMask(!0),t.enable(t.DEPTH_TEST)},resize(m,p){let b=Math.max(1,m>>1),E=Math.max(1,p>>1);b===s&&E===i||(s=b,i=E,d())},dispose(){t.deleteProgram(o),t.deleteProgram(a);for(let m of[c,l])t.deleteFramebuffer(m.fb),t.deleteTexture(m.tex)}}}var Te=new URLSearchParams(location.search),yt=Te.get("ao")!=="0",Tt=Te.get("shadow")!=="0",S=Te.get("flat")==="1",Re=Math.max(1,Math.min(3,Number(Te.get("scale")??1))),hn=Number(Te.get("frames")??300),I=1200*Re,U=720*Re,re=document.getElementById("c");re.width=I;re.height=U;var pn=document.getElementById("log");function bn(e){throw document.title="REFUSED",pn.textContent=e,new Error(e)}function D(e,r){return"kind"in r&&bn(`${e}: ${r.code} \u2014 ${r.reason} ${r.detail??""}`),r}var Ce=Ye(re,{alpha:!1});We(Ce)||bn(`stage: ${Ce.code} \u2014 ${Ce.reason}`);var L=Ce,y=L.gl,nr=`#version 300 es
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
${Je}
${et}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,or=D("present",L.compile(nr,rr)),pt=D("lit",mt(L)),Pe=D("target",it(L,I,U)),Rt=D("shadow",ut(L,1536)),Jt=D("ao",ht(L,I,U)),A="PROGRAMME",pe=[{id:A,kind:"PARTY",thetaDeg:0,count:{state:"observed",records:9}},{id:"PARTNER",kind:"PARTY",thetaDeg:18,count:{state:"observed",records:412}},{id:"PERSON",kind:"PARTY",thetaDeg:128,count:{state:"observed",records:1940}},{id:"COUNTERPARTY",kind:"PARTY",thetaDeg:236,count:{state:"absent"}},{id:"LISTING",kind:"INSTRUMENT",thetaDeg:196,count:{state:"observed",records:128}},{id:"TOKEN",kind:"INSTRUMENT",thetaDeg:52,count:{state:"observed",records:64}},{id:"SETTLEMENT",kind:"INSTRUMENT",thetaDeg:300,count:{state:"observed",records:22806}},{id:"CAMPAIGN",kind:"EVENT",thetaDeg:288,count:{state:"observed",records:37}},{id:"QUEST",kind:"EVENT",thetaDeg:8,count:{state:"observed",records:1204}},{id:"COMPARTMENT",kind:"CONTROL",thetaDeg:96,count:{state:"withheld"}},{id:"JURISDICTION",kind:"CONTROL",thetaDeg:214,count:{state:"observed",records:31}}],oe=[{a:A,b:"PARTNER",strength:.92},{a:A,b:"LISTING",strength:.71},{a:A,b:"CAMPAIGN",strength:.64},{a:A,b:"COMPARTMENT",strength:.55},{a:"PARTNER",b:"PERSON",strength:.8},{a:"PARTNER",b:"COUNTERPARTY",strength:.34},{a:"LISTING",b:"TOKEN",strength:.88},{a:"TOKEN",b:"SETTLEMENT",strength:.76},{a:"CAMPAIGN",b:"QUEST",strength:.58},{a:"QUEST",b:"PERSON",strength:.41},{a:"JURISDICTION",b:"LISTING",strength:.67},{a:"SETTLEMENT",b:"COUNTERPARTY",strength:.29},{a:"JURISDICTION",b:"PERSON",strength:null}],At=new Map(pe.map(e=>[e.id,[]]));for(let e of oe)At.get(e.a)?.push(e.b),At.get(e.b)?.push(e.a);var ne=new Map([[A,0]]);for(let e=[A];e.length>0;){let r=[];for(let n of e)for(let t of At.get(n)??[])ne.has(t)||(ne.set(t,(ne.get(n)??0)+1),r.push(t));e=r}var ar=pe.filter(e=>!ne.has(e.id)).map(e=>e.id),Y=Math.PI/180,K=e=>1+e*2.1,X={PARTY:{incDeg:0,nodeDeg:0},INSTRUMENT:{incDeg:34,nodeDeg:64},EVENT:{incDeg:-29,nodeDeg:-58},CONTROL:{incDeg:62,nodeDeg:118}};function be(e,r,n,t){let o=r*Y,a=n*Y,s=t*Y,i=e*Math.cos(o),u=e*Math.sin(o),c=-u*Math.sin(a),l=u*Math.cos(a);return[i*Math.cos(s)+l*Math.sin(s),c,-i*Math.sin(s)+l*Math.cos(s)]}function sr(e,r){let n=e*Y,t=r*Y,o=Math.cos(n),a=Math.sin(n),s=Math.cos(t),i=Math.sin(t),u=new Float32Array([s,0,-i,i*a,o,s*a,i*o,-a,s*o]),c=ee();return c[0]=u[0],c[1]=u[1],c[2]=u[2],c[4]=u[3],c[5]=u[4],c[6]=u[5],c[8]=u[6],c[9]=u[7],c[10]=u[8],{model:c,normal:u}}var gn=.15,En=.115,ir=e=>gn+En*Math.log10(Math.max(1,e)),xn=.3,ur=e=>e.state==="observed"?ir(e.records):xn,N=pe.filter(e=>ne.has(e.id)).map(e=>{let r=ne.get(e.id),n=K(r),t=X[e.kind];return{def:e,hops:r,shell:n,pos:e.id===A?[0,0,0]:be(n,e.thetaDeg,t.incDeg,t.nodeDeg),flatPos:e.id===A?[0,0,0]:be(n,e.thetaDeg,0,0),radius:ur(e.count)}}),Ge=new Map(N.map(e=>[e.def.id,e])),yn=oe.map(e=>e.strength).filter(e=>e!==null),ge=Math.min(...yn),ke=Math.max(...yn),Mt=.026,Tn=.086,Dt=e=>Mt+(Tn-Mt)*((e-ge)/Math.max(1e-6,ke-ge)),Xe=.052,Rn=e=>oe.flatMap(r=>{let n=Ge.get(r.a),t=Ge.get(r.b);return!n||!t?[]:[{rel:r,aId:r.a,bId:r.b,a:e?n.flatPos:n.pos,b:e?t.flatPos:t.pos,r:r.strength===null?Xe:Dt(r.strength),dotted:r.strength===null}]}),ae=Rn(!1),se=Rn(!0),Ft=.5,St=90,ie=S?{target:[0,0,0],distance:25,azimuthDeg:34,elevationDeg:89,fovDeg:36,near:Ft,far:St}:{target:[0,.4,0],distance:25,azimuthDeg:34,elevationDeg:26,fovDeg:36,near:Ft,far:St},Q=ce(ie),Pt=ie.fovDeg??36,v=I/Re,F=U/Re,Ot=e=>F/2/(Math.max(.01,e)*Math.tan(Pt/2*Y)),It=e=>Math.hypot(e[0]-Q[0],e[1]-Q[1],e[2]-Q[2]),W=(e,r)=>e[0]*r[0]+e[1]*r[1]+e[2]*r[2],C=(e,r)=>[e[0]-r[0],e[1]-r[1],e[2]-r[2]],$=e=>Math.hypot(e[0],e[1],e[2]),en=(e,r,n)=>[e[0]+r[0]*n,e[1]+r[1]*n,e[2]+r[2]*n];function He(e,r,n,t){let o=C(r,e),a=C(t,n),s=C(e,n),i=W(o,o),u=W(a,a),c=W(a,s),l=0,d=0;if(i<=1e-12&&u<=1e-12)return{dist:$(s),c1:e,c2:n};if(i<=1e-12)d=Math.min(1,Math.max(0,c/u));else{let m=W(o,s);if(u<=1e-12)l=Math.min(1,Math.max(0,-m/i));else{let p=W(o,a),b=i*u-p*p;l=b>1e-12?Math.min(1,Math.max(0,(p*c-m*u)/b)):0,d=(p*l+c)/u,d<0?(d=0,l=Math.min(1,Math.max(0,-m/i))):d>1&&(d=1,l=Math.min(1,Math.max(0,(p-m)/i)))}}let f=en(e,o,l),h=en(n,a,d);return{dist:$(C(f,h)),c1:f,c2:h}}var Ut=e=>{let r=[];for(let n=0;n<e.length;n++)for(let t=n+1;t<e.length;t++){let o=e[n],a=e[t];o.aId===a.aId||o.aId===a.bId||o.bId===a.aId||o.bId===a.bId||r.push([o,a])}return r};function An(e){let r=0,n=1/0,t=[];for(let[o,a]of Ut(e)){let s=He(o.a,o.b,a.a,a.b).dist;n=Math.min(n,s),s<o.r+a.r&&(r++,t.push(`${o.aId}~${o.bId} \xD7 ${a.aId}~${a.bId}`))}return{pairs:r,minSeparation:Number.isFinite(n)?n:0,worst:t}}function Mn(e,r,n,t,o,a,s,i){let u=n-e,c=t-r,l=s-o,d=i-a,f=u*d-c*l;if(Math.abs(f)<1e-9)return null;let h=o-e,m=a-r,p=(h*d-m*l)/f,b=(h*c-m*u)/f;return p<=1e-6||p>=1-1e-6||b<=1e-6||b>=1-1e-6?null:{t:p,u:b}}function lr(e,r,n,t){let o=(()=>{let m=C(e.target,r),p=$(m)||1;return[m[0]/p,m[1]/p,m[2]/p]})(),a=(()=>{let m=[-o[2],0,o[0]],p=$(m)||1;return[m[0]/p,m[1]/p,m[2]/p]})(),s=[a[1]*o[2]-a[2]*o[1],a[2]*o[0]-a[0]*o[2],a[0]*o[1]-a[1]*o[0]],i=Math.tan(Pt/2*Y),u=n/v*2-1,c=1-t/F*2,l=o[0]+a[0]*u*i*(v/F)+s[0]*c*i,d=o[1]+a[1]*u*i*(v/F)+s[1]*c*i,f=o[2]+a[2]*u*i*(v/F)+s[2]*c*i,h=Math.hypot(l,d,f)||1;return[l/h,d/h,f/h]}function Fn(e,r){let n=ce(r),t=de(r,v/F),o=new Map;for(let u of e)o.set(u,{a:V(t,u.a,v,F),b:V(t,u.b,v,F)});let a=0,s=0,i=1/0;for(let[u,c]of Ut(e)){let l=o.get(u),d=o.get(c);if(l.a.behind||l.b.behind||d.a.behind||d.b.behind)continue;let f=Mn(l.a.sx,l.a.sy,l.b.sx,l.b.sy,d.a.sx,d.a.sy,d.b.sx,d.b.sy);if(!f)continue;a++;let h=l.a.sx+(l.b.sx-l.a.sx)*f.t,m=l.a.sy+(l.b.sy-l.a.sy)*f.t,p=lr(r,n,h,m),b=[n[0]+p[0]*400,n[1]+p[1]*400,n[2]+p[2]*400],E=He(u.a,u.b,n,b).c1,g=He(c.a,c.b,n,b).c1,x=$(C(E,g));i=Math.min(i,x),x<u.r+c.r&&s++}return{total:a,ambiguous:s,minSep:Number.isFinite(i)?i:0}}function Sn(e){let r=0;for(let[n,t]of Ut(e))Mn(n.a[0],n.a[2],n.b[0],n.b[2],t.a[0],t.a[2],t.b[0],t.b[2])&&r++;return r}function tn(e,r){let n=0;for(let t of e)for(let o of N){if(o.def.id===t.aId||o.def.id===t.bId)continue;let a=r?o.flatPos:o.pos;He(t.a,t.b,a,a).dist<o.radius+t.r&&n++}return n}var cr=performance.now(),vn=12e4,Be=1/0;{let e=pe.filter(o=>o.id!==A).map(o=>o.thetaDeg),r=pe.filter(o=>o.id!==A).map(o=>o.id),n=new Map([[A,[0,0,0]]]),t=e.slice();for(let o=0;o<vn;o++){if(o>0)for(let i=t.length-1;i>0;i--){let u=Math.random()*(i+1)|0,c=t[i];t[i]=t[u],t[u]=c}for(let i=0;i<r.length;i++){let u=Ge.get(r[i]);n.set(r[i],be(u.shell,t[i],0,0))}let a=oe.flatMap(i=>{let u=n.get(i.a),c=n.get(i.b);return!u||!c?[]:[{rel:i,aId:i.a,bId:i.b,a:u,b:c,r:i.strength===null?Xe:Dt(i.strength),dotted:i.strength===null}]}),s=Sn(a);if(s<Be&&(Be=s),Be===0)break}}var dr=performance.now()-cr,q=Sn(se),bt=An(ae),vt=An(se),me=Fn(S?se:ae,ie),Ee=Array.from({length:36},(e,r)=>{let n={...ie,azimuthDeg:r*10},t=Fn(ae,n);return{azimuthDeg:r*10,total:t.total,ambiguous:t.ambiguous}}),nn=Math.max(...Ee.map(e=>e.ambiguous)),mr=[Math.min(...Ee.map(e=>e.total)),Math.max(...Ee.map(e=>e.total))],te=-3.6,Ln=tt(64,64),_n=Le(1,22,30),wn=Le(Xe,10,14),Nn=we(.24,.062,44,14),Dn=_e(.26,.36,40),Pn=_e(1,1,16),On=[1,2,3].map(e=>we(K(e),.014,96,8)),fr=D("deck",k(L,Ln)),hr=D("sphere",k(L,_n)),In=D("pip",k(L,wn)),pr=D("absent",k(L,Nn)),br=D("withheld",k(L,Dn)),Un=D("link",k(L,Pn)),gr=On.map((e,r)=>D(`ring${r}`,k(L,e))),fe=new Float32Array([1,0,0,0,1,0,0,0,1]),he=(e,r)=>{let n=ee();return n[0]=r,n[5]=r,n[10]=r,n[12]=e[0],n[13]=e[1],n[14]=e[2],n};function Er(e,r,n){let t=C(r,e),o=$(t);if(o<1e-6)return null;let a=[t[0]/o,t[1]/o,t[2]/o],s=Math.abs(a[1])<.9?[0,1,0]:[1,0,0],i=[a[1]*s[2]-a[2]*s[1],a[2]*s[0]-a[0]*s[2],a[0]*s[1]-a[1]*s[0]],u=$(i)||1,c=[i[0]/u,i[1]/u,i[2]/u],l=[a[1]*c[2]-a[2]*c[1],a[2]*c[0]-a[0]*c[2],a[0]*c[1]-a[1]*c[0]],d=ee();d[0]=c[0]*n,d[1]=c[1]*n,d[2]=c[2]*n,d[4]=a[0]*o,d[5]=a[1]*o,d[6]=a[2]*o,d[8]=l[0]*n,d[9]=l[1]*n,d[10]=l[2]*n,d[12]=(e[0]+r[0])/2,d[13]=(e[1]+r[1])/2,d[14]=(e[2]+r[2])/2;let f=new Float32Array([c[0]/n,c[1]/n,c[2]/n,a[0]/o,a[1]/o,a[2]/o,l[0]/n,l[1]/n,l[2]/n]);return{model:d,normal:f}}var Cn="#2C6BFF",Bn="#7FB2FF",xe="#FF8A3D",Vn="#6B7A99",xr="#26355A",yr="#0E1628",Tr="#05070E",Ct=e=>S?e.flatPos:e.pos,H=[{mesh:fr,model:he([0,te,0],1),normalMat:fe,material:{baseColour:P(yr),roughness:.88,metalness:0}}],$e=[],Gn=0;for(let e of Object.keys(X))for(let r of[1,2,3]){if(!N.some(o=>o.def.kind===e&&o.hops===r&&o.def.id!==A))continue;if(S&&$e.some(o=>o.hops===r)){Gn++;continue}let n=X[e],t=sr(S?0:n.incDeg,S?0:n.nodeDeg);H.push({mesh:gr[r-1],model:t.model,normalMat:t.normal,material:{baseColour:P(xr),roughness:.55,metalness:.2}}),$e.push({kind:e,hops:r})}var Lt=(S?se:ae).flatMap(e=>{if(e.dotted){let n=$(C(e.b,e.a)),t=Math.max(3,Math.round(n/(Xe*4.2)));return Array.from({length:t-1},(o,a)=>{let s=(a+1)/t,i=[e.a[0]+(e.b[0]-e.a[0])*s,e.a[1]+(e.b[1]-e.a[1])*s,e.a[2]+(e.b[2]-e.a[2])*s];return{mesh:In,model:he(i,1),normalMat:fe,material:{baseColour:P(xe),roughness:.42,metalness:.1}}})}let r=Er(e.a,e.b,e.r);return r?[{mesh:Un,model:r.model,normalMat:r.normal,material:{baseColour:P(Bn),roughness:.34,metalness:.12}}]:[]});H.push(...Lt);for(let e of N){let r=Ct(e);e.def.count.state==="absent"?H.push({mesh:pr,model:he(r,1),normalMat:fe,material:{baseColour:P(xe),roughness:.38,metalness:.15}}):e.def.count.state==="withheld"?H.push({mesh:br,model:he(r,1),normalMat:fe,material:{baseColour:P(Vn),roughness:.28,metalness:.58}}):H.push({mesh:hr,model:he(r,e.radius),normalMat:fe,material:{baseColour:P(Cn),roughness:e.def.id===A?.22:.34,metalness:e.def.id===A?.36:.08}})}var kn=[.26,-.9,-.35],rn=[-8.2,te,-8.2],on=[8.2,5,8.2],an=ot({direction:kn,colour:[1,1,1],extent:10.5},st(rn,on),at(rn,on)),Rr=G(Ln)+$e.reduce((e,r)=>e+G(On[r.hops-1]),0)+N.filter(e=>e.def.count.state==="observed").length*G(_n)+G(Nn)+G(Dn)+Lt.filter(e=>e.mesh===Un).length*G(Pn)+Lt.filter(e=>e.mesh===In).length*G(wn);function _t(){let e=de(ie,I/U);Tt&&pt.shadowPass(an,H,Rt),Pe.bind();let r=P(Tr);y.clearColor(r[0],r[1],r[2],1),y.clear(y.COLOR_BUFFER_BIT|y.DEPTH_BUFFER_BIT),pt.depthPrepass(e,H),yt&&(Jt.compute({depthTexture:Pe.depthTexture,near:Ft,far:St,fovDeg:Pt,aspect:I/U,radius:.5,strength:1.2}),Pe.bind()),pt.draw({viewProj:e,eye:Q,lightDir:kn,lightColour:[3.1,3.05,2.95],ambientGain:.52,lightVP:an,shadow:Tt?Rt:null,shadowStrength:.92,draws:H,ao:yt?Jt.texture:null,screenSize:[I,U],fog:null}),y.bindFramebuffer(y.FRAMEBUFFER,null),y.viewport(0,0,I,U),y.disable(y.DEPTH_TEST),y.activeTexture(y.TEXTURE0),y.bindTexture(y.TEXTURE_2D,Pe.texture),L.blit(or,n=>y.uniform1i(y.getUniformLocation(n,"uScene"),0))}function Ar(e){_t();let r=new Uint8Array(4);y.readPixels(0,0,1,1,y.RGBA,y.UNSIGNED_BYTE,r);let n=performance.now();for(let t=0;t<e;t++)_t();return y.readPixels(0,0,1,1,y.RGBA,y.UNSIGNED_BYTE,r),(performance.now()-n)/e}var wt=Ar(Math.max(1,hn)),ye=de(ie,I/U),je=document.createElement("div");je.style.cssText=`position:relative;overflow:hidden;width:${v}px;height:${F}px`;re.parentNode?.insertBefore(je,re);je.appendChild(re);var j=document.createElement("div");j.style.cssText="position:absolute;inset:0;pointer-events:none";je.appendChild(j);var Hn=9,Mr=6.6,Fr=5.8,Nt=30,sn=(e,r)=>Math.max(0,Math.min(e.x+e.w,r.x+r.w)-Math.max(e.x,r.x))*Math.max(0,Math.min(e.y+e.h,r.y+r.h)-Math.max(e.y,r.y)),ze=N.map(e=>{let r=Ct(e),n=It(r),t=Ot(n),o=V(ye,r,v,F),a=2*e.radius*t,s=e.def.id,i=e.def.count.state==="observed"?`${e.def.kind} \xB7 ${e.hops===0?"CORE":`${e.hops} HOP${e.hops>1?"S":""}`} \xB7 ${e.def.count.records.toLocaleString("en-US")} REC`:e.def.count.state==="absent"?`${e.def.kind} \xB7 ${e.hops} HOPS \xB7 RECORDS ABSENT`:"",u=Math.ceil(Math.max(s.length*Mr,i.length*Fr))+10;return{b:e,p:r,dist:n,ppm:t,anchor:o,bodyPx:a,name:s,meta:i,w:u}}),un=[],$n=[...ze].sort((e,r)=>e.dist-r.dist).map(e=>{let r=e.b.def.count.state==="withheld",n=e.anchor.behind||e.anchor.sx<0||e.anchor.sx>v||e.anchor.sy<0||e.anchor.sy>F,t=e.bodyPx<Hn,o=(()=>{if(e.b.def.id===A)return!1;let c=Ge.get(A),l=Ct(c),d=C(e.p,Q),f=$(d)||1,h=[d[0]/f,d[1]/f,d[2]/f],m=C(l,Q),p=W(m,h);return p<=0||p>=f?!1:W(m,m)-p*p<c.radius*c.radius})(),a={x:e.anchor.sx-e.w/2,y:e.anchor.sy-e.bodyPx/2-Nt-6,w:e.w,h:Nt},s=un.some(c=>sn(c,a)>0),i=ze.some(c=>{if(c.b.def.id===e.b.def.id)return!1;let l={x:c.anchor.sx-c.bodyPx/2,y:c.anchor.sy-c.bodyPx/2,w:c.bodyPx,h:c.bodyPx};return sn(a,l)>.3*Math.max(1,l.w*l.h)}),u=!r&&!n&&!t&&!o&&!s&&!i;return u&&un.push(a),{s:e,rect:a,shown:u,withheld:r,offFrame:n,subLegible:t,behindCore:o,collides:s,coversBody:i}});for(let e of[...$n].sort((r,n)=>n.s.dist-r.s.dist)){if(!e.shown)continue;let r=document.createElement("div");r.style.cssText=`position:absolute;left:${e.rect.x.toFixed(1)}px;top:${e.rect.y.toFixed(1)}px;width:${e.s.w}px;height:${Nt}px;display:flex;flex-direction:column;justify-content:flex-end;gap:2px;text-align:center;text-shadow:0 1px 3px rgba(0,0,0,0.9);-webkit-font-smoothing:antialiased`;let n=e.s.b.def.count.state==="absent"?xe:"rgba(196,212,240,0.80)";r.innerHTML=`<div style="font:700 11px/1.05 ui-monospace,monospace;color:#fff;letter-spacing:.02em">${e.s.name}</div><div style="font:500 9.5px/1.1 ui-monospace,monospace;letter-spacing:.08em;color:${n}">${e.s.meta}</div>`,j.appendChild(r)}var Oe=11,Ie=2.6,Ue=5.4,ln={topLeft:[-Oe/2,te+.03,Ue-Ie/2],topRight:[Oe/2,te+.03,Ue-Ie/2],bottomRight:[Oe/2,te+.03,Ue+Ie/2],bottomLeft:[-Oe/2,te+.03,Ue+Ie/2]},Sr=(()=>{let e=Ne(ye,ln,v,F,100,40);if(De(e))return{mode:"refused",reason:e.refusal,widthPx:0,heightPx:0,signedArea:0};let r=e.screen.map(i=>i.x),n=e.screen.map(i=>i.y),t=Math.round(Math.max(...r)-Math.min(...r)),o=Math.round(Math.max(...n)-Math.min(...n));if(e.signedArea<=0)return{mode:"refused",reason:"BACK_FACING",widthPx:t,heightPx:o,signedArea:e.signedArea};if(t<26||o<26)return{mode:"refused",reason:"BELOW_26PX",widthPx:t,heightPx:o,signedArea:e.signedArea};let a=Ne(ye,ln,v,F,t,o);if(De(a))return{mode:"refused",reason:a.refusal,widthPx:t,heightPx:o,signedArea:e.signedArea};let s=document.createElement("div");return s.style.cssText=`position:absolute;left:0;top:0;width:${t}px;height:${o}px;transform-origin:0 0;transform:${a.transform};display:flex;flex-direction:column;justify-content:center;align-items:center;gap:3px;overflow:hidden`,s.innerHTML='<div style="font:600 12px/1.1 ui-monospace,monospace;letter-spacing:.16em;color:rgba(143,183,255,0.92)">REFERENCE PLANE \xB7 INCLINATION 0</div><div style="font:400 11px/1.2 ui-monospace,monospace;color:rgba(196,212,240,0.72)">'+(S?`THE FLAT DIAGRAM LIVES HERE \xB7 ${q} CROSSINGS, ALL AMBIGUOUS`:`WHAT THE FLAT DIAGRAM HAS TO FIT INTO \xB7 ${q} CROSSINGS`)+"</div>",j.appendChild(s),{mode:"projected",reason:null,widthPx:t,heightPx:o,signedArea:Math.round(e.signedArea)}})(),cn=Object.keys(X).map(e=>{let r=Math.max(...N.filter(i=>i.def.kind===e&&i.def.id!==A).map(i=>i.hops),0),n=X[e],t=K(Math.max(1,r)),o=be(t,0,S?0:n.incDeg,S?0:n.nodeDeg),a=V(ye,o,v,F),s=!a.behind&&a.sx>4&&a.sx<v-4&&a.sy>4&&a.sy<F-4;if(s){let i=document.createElement("div");i.style.cssText=`position:absolute;left:${a.sx.toFixed(1)}px;top:${a.sy.toFixed(1)}px;transform:translate(-50%,-50%);font:600 9.5px/1 ui-monospace,monospace;letter-spacing:.14em;color:rgba(127,178,255,0.78);white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,0.9)`,i.textContent=`${e} ${S?0:n.incDeg}\xB0`,j.appendChild(i)}return{kind:e,incDeg:S?0:n.incDeg,sx:Math.round(a.sx),sy:Math.round(a.sy),onFrame:s}}),dn=[1,2,3].map(e=>{let r=be(K(e),152,0,0),n=V(ye,r,v,F),t=!n.behind&&n.sx>4&&n.sx<v-4&&n.sy>4&&n.sy<F-4;if(t){let o=document.createElement("div");o.style.cssText=`position:absolute;left:${n.sx.toFixed(1)}px;top:${n.sy.toFixed(1)}px;transform:translate(-50%,-50%);font:500 9.5px/1 ui-monospace,monospace;letter-spacing:.1em;color:rgba(196,212,240,0.62);white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,0.9)`,o.textContent=`${e} HOP${e>1?"S":""}`,j.appendChild(o)}return{hops:e,sx:Math.round(n.sx),sy:Math.round(n.sy),onFrame:t}}),Ve={observed:N.filter(e=>e.def.count.state==="observed").length,absent:N.filter(e=>e.def.count.state==="absent").length,withheld:N.filter(e=>e.def.count.state==="withheld").length},Bt=document.createElement("div");Bt.style.cssText="position:absolute;left:18px;top:16px;display:flex;flex-direction:column;gap:7px";Bt.innerHTML=`<div style="font:600 11px/1 ui-monospace,monospace;letter-spacing:.16em;color:#8FB7FF">ONTOLOGY AS ORBITS \xB7 ${S?"FLAT CONTROL \u2014 INCLINATIONS ZEROED":"RADIUS = HOPS \xB7 SIZE = RECORDS \xB7 TUBE = STRENGTH"}</div><div style="font:400 10.5px/1.55 ui-monospace,monospace;color:rgba(196,212,240,0.84)">${S?`${q} CROSSINGS IN PLANE &nbsp;\xB7&nbsp; ${vt.pairs} AMBIGUOUS (NO DEPTH TO RESOLVE THEM)`:`${me.total} CROSSINGS ON SCREEN &nbsp;\xB7&nbsp; ${me.ambiguous} AMBIGUOUS &nbsp;\xB7&nbsp; FLAT LAYOUT: ${q} OF ${q}`}<br>INCLINATION SEPARATES ${Object.keys(X).length} ENTITY KINDS &nbsp;\xB7&nbsp; ${N.length} ENTITIES, ${oe.length} RELATIONSHIPS</div><div style="font:500 10px/1.4 ui-monospace,monospace;color:#E0A94A">SYNTHETIC ONTOLOGY</div>`;j.appendChild(Bt);var vr=It([0,0,0]),Lr=Ot(vr),Vt=document.createElement("div");Vt.style.cssText="position:absolute;right:18px;bottom:16px;display:flex;flex-direction:column;gap:7px;align-items:flex-end;font:500 10px/1 ui-monospace,monospace;color:rgba(196,212,240,0.85)";var gt=e=>{let r=Math.max(1,2*Dt(e)*Lr);return`<div style="display:flex;align-items:center;gap:8px"><span>STRENGTH ${e.toFixed(2)}</span><span style="width:46px;height:${r.toFixed(1)}px;background:${Bn};display:inline-block"></span></div>`};Vt.innerHTML=gt(ge)+gt((ge+ke)/2)+gt(ke)+`<div style="display:flex;align-items:center;gap:8px"><span>STRENGTH NEVER MEASURED</span><span style="width:46px;display:inline-flex;gap:3px;justify-content:space-between">${'<span style="width:5px;height:5px;border-radius:50%;background:'+xe+'"></span>'.repeat(5)}</span></div><div style="height:4px"></div><div style="display:flex;align-items:center;gap:8px"><span>RECORDS OBSERVED \xB7 ${Ve.observed}</span><span style="width:11px;height:11px;border-radius:50%;background:${Cn};display:inline-block"></span></div><div style="display:flex;align-items:center;gap:8px"><span>RECORDS ABSENT \xB7 ${Ve.absent} (RING \u2014 NOT ON THE SIZE SCALE)</span><span style="width:11px;height:11px;border-radius:50%;border:3px solid ${xe};box-sizing:border-box;display:inline-block"></span></div><div style="display:flex;align-items:center;gap:8px"><span>WITHHELD \xB7 ${Ve.withheld} (DRUM \u2014 PRESENT, UNLABELLED)</span><span style="width:11px;height:11px;background:${Vn};display:inline-block"></span></div>`;j.appendChild(Vt);var zn=(S?se:ae).map(e=>{let r=[(e.a[0]+e.b[0])/2,(e.a[1]+e.b[1])/2,(e.a[2]+e.b[2])/2];return{edge:`${e.aId}~${e.bId}`,strength:e.rel.strength,radius:Number(e.r.toFixed(4)),px:Number((2*e.r*Ot(It(r))).toFixed(2)),dotted:e.dotted}}),Et=zn.filter(e=>!e.dotted).map(e=>e.px),xt=$n.map(({s:e,shown:r,withheld:n,offFrame:t,subLegible:o,behindCore:a,collides:s,coversBody:i})=>({id:e.b.def.id,kind:e.b.def.kind,hops:e.b.hops,countState:e.b.def.count.state,records:e.b.def.count.state==="observed"?e.b.def.count.records:null,radius:Number(e.b.radius.toFixed(3)),bodyPx:Number(e.bodyPx.toFixed(1)),distance:Number(e.dist.toFixed(2)),labelShown:r,labelHiddenBecause:r?null:n?"WITHHELD":t?"OFF_FRAME":a?"BEHIND_CORE":o?"BODY_BELOW_9PX":i?"WOULD_COVER_A_BODY":s?"LABEL_COLLISION":"UNKNOWN"})),Z={layout:S?"flat":"orrery",ao:yt,shadow:Tt,hdr:L.hdr,eye:Q.map(e=>Number(e.toFixed(2))),entities:N.length,relationships:oe.length,unreachableEntities:ar,hopsPerEntity:Object.fromEntries(N.map(e=>[e.def.id,e.hops])),shellRadii:{1:K(1),2:K(2),3:K(3)},inclinationsByKind:Object.fromEntries(Object.keys(X).map(e=>[e,X[e].incDeg])),ringsDrawn:$e.length,ringsCollapsedOntoAnother:Gn,crossings:{flatInPlane:q,flatAmbiguous:vt.pairs,flatMinSeparationM:Number(vt.minSeparation.toFixed(4)),flatBestOverOrderings:Be,orderingsTried:vn,orderingSearchMs:Number(dr.toFixed(1)),grazingPairs3D:bt.pairs,grazingPairs3DDetail:bt.worst,minSeparation3DM:Number(bt.minSeparation.toFixed(4)),atThisCamera:{total:me.total,ambiguous:me.ambiguous,minSepM:Number(me.minSep.toFixed(3))},sweepAzimuths:Ee.length,sweepScreenCrossings:mr,sweepWorstAmbiguous:nn,ambiguousCrossingsAvoided:q-nn},linksThroughBodies:{orrery:tn(ae,!1),flat:tn(se,!0)},countStates:Ve,sizeScale:{base:gn,perDecade:En,nominalForNonObserved:xn},bodyPx:{min:Number(Math.min(...ze.map(e=>e.bodyPx)).toFixed(1)),max:Number(Math.max(...ze.map(e=>e.bodyPx)).toFixed(1)),floor:Hn},strengthScale:{min:ge,max:ke,radiusMin:Mt,radiusMax:Tn},linkPx:{thinnest:Math.min(...Et),thickest:Math.max(...Et)},strengthLegible:Math.min(...Et)>=1.5,labelsShown:xt.filter(e=>e.labelShown).length,labelsHiddenBy:xt.filter(e=>!e.labelShown).reduce((e,r)=>{let n=r.labelHiddenBecause??"UNKNOWN";return e[n]=(e[n]??0)+1,e},{}),plate:Sr,planeTicks:cn,planeTicksOffFrame:cn.filter(e=>!e.onFrame).length,hopTicks:dn,hopTicksOffFrame:dn.filter(e=>!e.onFrame).length,perEntity:xt,perLink:zn,sweepDetail:Ee,glError:y.getError(),triangles:Rr,drawCalls:H.length,shadowMap:Rt.size,resolution:`${I}x${U}`,dprScale:Re,frames:hn,msPerFrame:Number(wt.toFixed(3)),fps:Math.round(1e3/wt),renderer:"",rendererClass:"",headroom:null,headroomRefusal:null,hardwareMsPerFrame:null},Xn=(()=>{let e=y.getExtension("WEBGL_debug_renderer_info");return e?String(y.getParameter(e.UNMASKED_RENDERER_WEBGL)):"unknown"})(),Gt=/swiftshader|llvmpipe|software/i.test(Xn);Z.renderer=Xn;Z.rendererClass=Gt?"software":"hardware";Z.headroom=Gt?null:Number((16.6-wt).toFixed(3));Z.headroomRefusal=Gt?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null;Z.hardwareMsPerFrame=null;globalThis.E4=Z;var{perEntity:mn,perLink:fn,planeTicks:wo,hopTicks:No,sweepDetail:Do,..._r}=Z;pn.textContent=JSON.stringify(_r,null,2)+`

perEntity (${mn.length}, full detail on globalThis.E4):
`+mn.map(e=>`  ${e.id.padEnd(13)} ${e.kind.padEnd(11)} h${e.hops} ${e.countState.padEnd(9)} r ${e.radius.toFixed(2)} ${String(e.bodyPx).padStart(5)}px ${String(e.distance).padStart(6)}m ${e.labelShown?"LABEL":`no label: ${e.labelHiddenBecause}`}`).join(`
`)+`

perLink (${fn.length}):
`+fn.map(e=>`  ${e.edge.padEnd(28)} s ${e.strength===null?"ABSENT":e.strength.toFixed(2)} r ${e.radius.toFixed(3)} ${String(e.px).padStart(5)}px${e.dotted?" (pips)":""}`).join(`
`);_t();document.title="READY";

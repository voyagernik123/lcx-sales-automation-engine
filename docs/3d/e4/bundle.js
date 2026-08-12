var Jt={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected."};function P(e,r){return r===void 0?{kind:"refused",code:e,reason:Jt[e]}:{kind:"refused",code:e,reason:Jt[e],detail:r}}function tt(e){return e.kind==="stage"}function nt(e,r={}){let t=e.getContext("webgl2",{antialias:r.antialias??!1,alpha:r.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!t)return P("NO_WEBGL2");let n=t.getExtension("EXT_color_buffer_float"),o=e.width,a=e.height,s=n?t.RGBA16F:t.RGBA8,i=n?t.HALF_FLOAT:t.UNSIGNED_BYTE,l=(g,E)=>{let T=t.createTexture();t.bindTexture(t.TEXTURE_2D,T),t.texImage2D(t.TEXTURE_2D,0,s,g,E,0,t.RGBA,i,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);let R=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,R),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,T,0);let S=t.checkFramebufferStatus(t.FRAMEBUFFER);return S!==t.FRAMEBUFFER_COMPLETE?P("FRAMEBUFFER_INCOMPLETE",`status 0x${S.toString(16)} at ${g}\xD7${E}`):{texture:T,framebuffer:R,width:g,height:E}},c=r.bloomShift??2,u={w:o,h:a},d=l(o,a);if("kind"in d)return d;let f=l(Math.max(1,o>>c),Math.max(1,a>>c));if("kind"in f)return f;let h=l(Math.max(1,o>>c),Math.max(1,a>>c));if("kind"in h)return h;let m=t.createVertexArray();t.bindVertexArray(m);let p=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,p),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null);let b=[];return{kind:"stage",gl:t,cssWidth:e.clientWidth||o,cssHeight:e.clientHeight||a,hdr:!!n,get width(){return u.w},get height(){return u.h},get scene(){return d},get bloomA(){return f},get bloomB(){return h},setRegion(g,E){let T=Math.max(1,Math.round(g)),R=Math.max(1,Math.round(E));if(!(T===u.w&&R===u.h)){u={w:T,h:R};for(let S of[d,f,h])"kind"in S||(t.deleteFramebuffer(S.framebuffer),t.deleteTexture(S.texture));d=l(T,R),f=l(Math.max(1,T>>c),Math.max(1,R>>c)),h=l(Math.max(1,T>>c),Math.max(1,R>>c))}},compile(g,E){let T=(me,z)=>{let G=t.createShader(me);return t.shaderSource(G,z),t.compileShader(G),t.getShaderParameter(G,t.COMPILE_STATUS)?G:P("SHADER_COMPILE_FAILED",t.getShaderInfoLog(G)??"(no log)")},R=T(t.VERTEX_SHADER,g);if(typeof R=="object"&&"kind"in R)return R;let S=T(t.FRAGMENT_SHADER,E);if(typeof S=="object"&&"kind"in S)return S;let N=t.createProgram();return t.attachShader(N,R),t.attachShader(N,S),t.linkProgram(N),t.getProgramParameter(N,t.LINK_STATUS)?(b.push(N),N):P("PROGRAM_LINK_FAILED",t.getProgramInfoLog(N)??"(no log)")},bindTarget(g){t.bindFramebuffer(t.FRAMEBUFFER,g?g.framebuffer:null),t.viewport(0,0,g?g.width:u.w,g?g.height:u.h)},blit(g,E){t.useProgram(g),t.bindVertexArray(m),E?.(g),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null)},dispose(){for(let g of b)t.deleteProgram(g);for(let g of[d,f,h])"kind"in g||(t.deleteFramebuffer(g.framebuffer),t.deleteTexture(g.texture));t.deleteBuffer(p),t.deleteVertexArray(m)}}}var K=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function ve(e,r){let t=new Float32Array(16);for(let n=0;n<4;n++)for(let o=0;o<4;o++){let a=0;for(let s=0;s<4;s++)a+=e[s*4+o]*r[n*4+s];t[n*4+o]=a}return t}var we=(e,r)=>[e[0]-r[0],e[1]-r[1],e[2]-r[2]],Se=(e,r)=>e[0]*r[0]+e[1]*r[1]+e[2]*r[2],rt=(e,r)=>[e[1]*r[2]-e[2]*r[1],e[2]*r[0]-e[0]*r[2],e[0]*r[1]-e[1]*r[0]];function fe(e){let r=Math.hypot(e[0],e[1],e[2]);return r===0?e:[e[0]/r,e[1]/r,e[2]/r]}function ot(e,r,t,n){let o=1/Math.tan(e/2);return new Float32Array([o/r,0,0,0,0,o,0,0,0,0,(n+t)/(t-n),-1,0,0,2*n*t/(t-n),0])}function at(e,r,t,n,o,a){let s=r-e,i=n-t,l=a-o;return new Float32Array([2/s,0,0,0,0,2/i,0,0,0,0,-2/l,0,-(r+e)/s,-(n+t)/i,-(a+o)/l,1])}function Le(e,r,t){let n=fe(we(e,r)),o=rt(t,n);if(Math.hypot(o[0],o[1],o[2])<1e-8)return K();let a=fe(o),s=rt(n,a);return new Float32Array([a[0],s[0],n[0],0,a[1],s[1],n[1],0,a[2],s[2],n[2],0,-Se(a,e),-Se(s,e),-Se(n,e),1])}function en(e,r){let t=[0,1,2,3].map(o=>e[0+o]*r[0]+e[4+o]*r[1]+e[8+o]*r[2]+e[12+o]),n=t[3];return{x:t[0]/n,y:t[1]/n,z:t[2]/n,w:n}}function k(e,r,t,n){let o=en(e,r);return{sx:(o.x*.5+.5)*t,sy:(1-(o.y*.5+.5))*n,behind:o.w<=0}}function tn(e){return e<=.04045?e/12.92:Math.pow((e+.055)/1.055,2.4)}function st(e){return e<=.0031308?e*12.92:1.055*Math.pow(e,1/2.4)-.055}var xr=/^#?([0-9a-fA-F]{6})$/;function I(e){let r=xr.exec(e.trim());if(!r)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(e)}`);let t=r[1];return[0,2,4].map(n=>tn(parseInt(t.slice(n,n+2),16)/255))}function it(e){return`#${e.map(t=>{let n=st(Math.min(1,Math.max(0,t)));return Math.round(n*255).toString(16).padStart(2,"0")}).join("")}`}var re={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},lt=Object.freeze(Object.fromEntries(Object.keys(re).map(e=>[e,I(re[e])])));var nn=.4;var ct=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${nn.toFixed(2)}); }`,ut=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function dt(){let e=[];for(let r of Object.keys(re)){let t=re[r].toLowerCase(),n=it(lt[r]).toLowerCase();n!==t&&e.push({key:r,expected:t,actual:n})}return e}function yr(e){let r=[1/0,1/0,1/0],t=[-1/0,-1/0,-1/0];for(let n=0;n<e.length;n+=3)for(let o=0;o<3;o++){let a=e[n+o];a<r[o]&&(r[o]=a),a>t[o]&&(t[o]=a)}return e.length===0?{min:[0,0,0],max:[0,0,0]}:{min:r,max:t}}function rn(e,r,t,n){let o=new Float32Array(e.length);for(let s=0;s<n.length;s+=3){let i=n[s],l=n[s+1],c=n[s+2],u=i*3,d=l*3,f=c*3,h=i*2,m=l*2,p=c*2,b=e[d]-e[u],y=e[d+1]-e[u+1],g=e[d+2]-e[u+2],E=e[f]-e[u],T=e[f+1]-e[u+1],R=e[f+2]-e[u+2],S=t[m]-t[h],N=t[m+1]-t[h+1],me=t[p]-t[h],z=t[p+1]-t[h+1],G=S*z-me*N;if(Math.abs(G)<1e-12)continue;let B=1/G,pr=(b*z-E*N)*B,br=(y*z-T*N)*B,gr=(g*z-R*N)*B;for(let ne of[u,d,f])o[ne]=o[ne]+pr,o[ne+1]=o[ne+1]+br,o[ne+2]=o[ne+2]+gr}let a=new Float32Array(e.length);for(let s=0;s<a.length;s+=3){let i=r[s],l=r[s+1],c=r[s+2],u=o[s],d=o[s+1],f=o[s+2],h=u*i+d*l+f*c;u-=i*h,d-=l*h,f-=c*h;let m=Math.hypot(u,d,f);m<1e-8&&(Math.abs(i)<.9?(u=0,d=-c,f=l):(u=-c,d=0,f=i),m=Math.hypot(u,d,f)||1),a[s]=u/m,a[s+1]=d/m,a[s+2]=f/m}return a}function on(e,r){let t=new Float32Array(e.length);for(let n=0;n<r.length;n+=3){let o=r[n]*3,a=r[n+1]*3,s=r[n+2]*3,i=e[a]-e[o],l=e[a+1]-e[o+1],c=e[a+2]-e[o+2],u=e[s]-e[o],d=e[s+1]-e[o+1],f=e[s+2]-e[o+2],h=l*f-c*d,m=c*u-i*f,p=i*d-l*u;for(let b of[o,a,s])t[b]=t[b]+h,t[b+1]=t[b+1]+m,t[b+2]=t[b+2]+p}for(let n=0;n<t.length;n+=3){let o=Math.hypot(t[n],t[n+1],t[n+2]);o>0&&(t[n]=t[n]/o,t[n+1]=t[n+1]/o,t[n+2]=t[n+2]/o)}return t}function De(e,r,t,n,o){let{min:a,max:s}=yr(e),i=n??on(e,t);return{positions:e,normals:i,uvs:r,indices:t,min:a,max:s,tangents:o??rn(e,i,r,t)}}function mt(e=10,r=24){let t=Math.max(1,Math.floor(r)),n=(t+1)*(t+1),o=new Float32Array(n*3),a=new Float32Array(n*3),s=new Float32Array(n*2),i=new Uint16Array(t*t*6),l=0,c=0,u=0;for(let d=0;d<=t;d++)for(let f=0;f<=t;f++){let h=(f/t-.5)*e,m=(d/t-.5)*e;o[l]=h,o[l+1]=0,o[l+2]=m,a[l]=0,a[l+1]=1,a[l+2]=0,l+=3,s[c++]=f/t,s[c++]=d/t}for(let d=0;d<t;d++)for(let f=0;f<t;f++){let h=d*(t+1)+f,m=h+1,p=h+(t+1),b=p+1;i[u++]=h,i[u++]=p,i[u++]=m,i[u++]=m,i[u++]=p,i[u++]=b}return De(o,s,i,a)}function _e(e=.5,r=24,t=32){let n=Math.max(2,r),o=Math.max(3,t),a=(n+1)*(o+1),s=new Float32Array(a*3),i=new Float32Array(a*3),l=new Float32Array(a*2),c=new Uint16Array(n*o*6),u=0,d=0,f=0;for(let h=0;h<=n;h++){let m=h/n*Math.PI;for(let p=0;p<=o;p++){let b=p/o*Math.PI*2,y=Math.sin(m)*Math.cos(b),g=Math.cos(m),E=Math.sin(m)*Math.sin(b);s[u]=y*e,s[u+1]=g*e,s[u+2]=E*e,i[u]=y,i[u+1]=g,i[u+2]=E,u+=3,l[d++]=p/o,l[d++]=h/n}}for(let h=0;h<n;h++)for(let m=0;m<o;m++){let p=h*(o+1)+m,b=p+1,y=p+(o+1),g=y+1;c[f++]=p,c[f++]=b,c[f++]=y,c[f++]=b,c[f++]=g,c[f++]=y}return De(s,l,c,i)}function Ne(e=.5,r=.2,t=64){let n=Math.max(3,t),o=r/2,a=[],s=[],i=[],l=[],c=[];for(let u=0;u<=n;u++){let d=u/n*Math.PI*2,f=Math.cos(d),h=Math.sin(d);a.push(f*e,o,h*e),s.push(f,0,h),i.push(u/n,1),c.push(-h,0,f),a.push(f*e,-o,h*e),s.push(f,0,h),i.push(u/n,0),c.push(-h,0,f)}for(let u=0;u<n;u++){let d=u*2,f=d+1,h=d+2,m=d+3;l.push(d,h,f,f,h,m)}for(let[u,d]of[[1,o],[-1,-o]]){let f=a.length/3;a.push(0,d,0),s.push(0,u,0),i.push(.5,.5),c.push(1,0,0);for(let h=0;h<=n;h++){let m=h/n*Math.PI*2,p=Math.cos(m),b=Math.sin(m);a.push(p*e,d,b*e),s.push(0,u,0),i.push(.5+p*.5,.5+b*.5),c.push(-b,0,p)}for(let h=0;h<n;h++){let m=f+1+h,p=f+2+h;u>0?l.push(f,p,m):l.push(f,m,p)}}return De(new Float32Array(a),new Float32Array(i),new Uint16Array(l),new Float32Array(s),new Float32Array(c))}function Pe(e=.5,r=.08,t=64,n=24){let o=Math.max(3,t),a=Math.max(3,n),s=[],i=[],l=[],c=[],u=[];for(let d=0;d<=o;d++){let f=d/o*Math.PI*2,h=Math.cos(f),m=Math.sin(f);for(let p=0;p<=a;p++){let b=p/a*Math.PI*2,y=Math.cos(b),g=Math.sin(b);s.push((e+r*y)*h,r*g,(e+r*y)*m),i.push(h*y,g,m*y),l.push(d/o,p/a),u.push(-m,0,h)}}for(let d=0;d<o;d++)for(let f=0;f<a;f++){let h=d*(a+1)+f,m=h+1,p=h+(a+1),b=p+1;c.push(h,m,p,m,b,p)}return De(new Float32Array(s),new Float32Array(l),new Uint16Array(c),new Float32Array(i),new Float32Array(u))}function H(e){return e.indices.length/3}function Er(e){if(!Number.isFinite(e)||e===0)return"0";let r=e.toFixed(12).replace(/0+$/,"").replace(/\.$/,"");return r==="-0"?"0":r}function an(e,r,t,n){let[o,a]=e,[s,i]=r,[l,c]=t,[u,d]=n,f=o-s+l-u,h=a-i+c-d;if(Math.abs(f)<1e-9&&Math.abs(h)<1e-9){let R=[s-o,u-o,o,i-a,d-a,a,0,0,1],S=R[0]*R[4]-R[1]*R[3];return Math.abs(S)<1e-9?null:R}let m=s-l,p=u-l,b=i-c,y=d-c,g=m*y-p*b;if(Math.abs(g)<1e-9)return null;let E=(f*y-p*h)/g,T=(m*h-f*b)/g;return[s-o+E*s,u-o+T*u,o,i-a+E*i,d-a+T*d,a,E,T,1]}function Oe(e,r,t,n,o,a){if(!(o>0)||!(a>0))return{refusal:"EMPTY_ELEMENT_BOX"};let i=[r.topLeft,r.topRight,r.bottomRight,r.bottomLeft].map(B=>k(e,B,t,n));if(i.some(B=>B.behind))return{refusal:"CORNER_BEHIND_CAMERA"};let l=i.map(B=>({x:B.sx,y:B.sy})),[c,u,d,f]=l,h=an([c.x,c.y],[u.x,u.y],[d.x,d.y],[f.x,f.y]);if(!h)return{refusal:"DEGENERATE_ON_SCREEN"};let m=.5*(c.x*u.y-u.x*c.y+(u.x*d.y-d.x*u.y)+(d.x*f.y-f.x*d.y)+(f.x*c.y-c.x*f.y)),p=1/o,b=1/a,[y,g,E,T,R,S,N,me,z]=h;return{transform:`matrix3d(${[y*p,T*p,0,N*p,g*b,R*b,0,me*b,0,0,1,0,E,S,0,z].map(Er).join(", ")})`,matrix:h,screen:l,signedArea:m}}function Ie(e){return"refusal"in e}var ft=89,ht=Math.PI/180;function oe(e){let r=Math.max(-ft,Math.min(ft,e.elevationDeg))*ht,t=e.azimuthDeg*ht,n=Math.max(1e-4,e.distance),o=Math.sin(r)*n,a=Math.cos(r)*n;return[e.target[0]+Math.sin(t)*a,e.target[1]+o,e.target[2]+Math.cos(t)*a]}function ae(e,r){let t=oe(e),n=e.near??Math.max(.01,e.distance/100),o=e.far??Math.max(n+1,e.distance*8),a=ot((e.fovDeg??38)*ht,Math.max(.001,r),n,o),s=Le(t,e.target,[0,1,0]);return ve(a,s)}function pt(e,r,t){let n=fe(e.direction),o=e.extent??Math.max(.1,t*1.35),a=Math.max(1,t*2),s=[r[0]-n[0]*a,r[1]-n[1]*a,r[2]-n[2]*a],i=Math.abs(n[1])>.99?[0,0,1]:[0,1,0],l=Le(s,r,i),c=at(-o,o,-o,o,.01,a+t*2+o);return ve(c,l)}function bt(e,r){let t=we([r[0],r[1],r[2]],[e[0],e[1],e[2]]);return Math.hypot(t[0],t[1],t[2])/2}function gt(e,r){return[(e[0]+r[0])/2,(e[1]+r[1])/2,(e[2]+r[2])/2]}function xt(e,r,t){let{gl:n}=e,o=Math.max(1,Math.floor(r)),a=Math.max(1,Math.floor(t)),s=n.createFramebuffer(),i=n.createTexture(),l=n.createTexture();if(!s||!i||!l)return P("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let c=e.hdr?n.RGBA16F:n.RGBA8,u=e.hdr?n.HALF_FLOAT:n.UNSIGNED_BYTE,d=()=>{n.bindTexture(n.TEXTURE_2D,i),n.texImage2D(n.TEXTURE_2D,0,c,o,a,0,n.RGBA,u,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.bindTexture(n.TEXTURE_2D,l),n.texImage2D(n.TEXTURE_2D,0,n.DEPTH_COMPONENT24,o,a,0,n.DEPTH_COMPONENT,n.UNSIGNED_INT,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.bindFramebuffer(n.FRAMEBUFFER,s),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,i,0),n.framebufferTexture2D(n.FRAMEBUFFER,n.DEPTH_ATTACHMENT,n.TEXTURE_2D,l,0),n.bindFramebuffer(n.FRAMEBUFFER,null)};d(),n.bindFramebuffer(n.FRAMEBUFFER,s);let f=n.checkFramebufferStatus(n.FRAMEBUFFER);return n.bindFramebuffer(n.FRAMEBUFFER,null),f!==n.FRAMEBUFFER_COMPLETE?P("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${f.toString(16)}). Depth texture support may be missing.`):{framebuffer:s,texture:i,depthTexture:l,get width(){return o},get height(){return a},bind(){n.bindFramebuffer(n.FRAMEBUFFER,s),n.viewport(0,0,o,a)},resize(h,m){let p=Math.max(1,Math.floor(h)),b=Math.max(1,Math.floor(m));p===o&&b===a||(o=p,a=b,d())},dispose(){n.deleteFramebuffer(s),n.deleteTexture(i),n.deleteTexture(l)}}}function yt(e,r=1024){let{gl:t}=e,n=Math.max(256,Math.min(2048,Math.floor(r))),o=t.createFramebuffer(),a=t.createTexture();if(!o||!a)return P("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");t.bindTexture(t.TEXTURE_2D,a),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,n,n,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,o),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,a,0);let s=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),s!==t.FRAMEBUFFER_COMPLETE?P("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${s.toString(16)}).`):{framebuffer:o,depthTexture:a,size:n,bind(){t.bindFramebuffer(t.FRAMEBUFFER,o),t.viewport(0,0,n,n)},dispose(){t.deleteFramebuffer(o),t.deleteTexture(a)}}}var Tt=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,Et={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function sn(e,r,t={}){let n=t.zenith??Et.zenith,o=t.horizon??Et.horizon,a=t.ground??Et.ground;e.uniform3f(e.getUniformLocation(r,"uSkyZenith"),n[0],n[1],n[2]),e.uniform3f(e.getUniformLocation(r,"uSkyHorizon"),o[0],o[1],o[2]),e.uniform3f(e.getUniformLocation(r,"uSkyGround"),a[0],a[1],a[2])}var To=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${Tt}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;var ln=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,Rt=`#version 300 es
precision highp float;
void main(){}`,Tr=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,cn=`#version 300 es
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
}`,un=`#version 300 es
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
${Tt}

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
}`;function $(e,r){let{gl:t}=e,n=t.createVertexArray(),o=t.createBuffer(),a=t.createBuffer(),s=t.createBuffer(),i=t.createBuffer();return!n||!o||!a||!s||!i?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(t.bindVertexArray(n),t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,r.positions,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,a),t.bufferData(t.ARRAY_BUFFER,r.normals,t.STATIC_DRAW),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,s),t.bufferData(t.ARRAY_BUFFER,r.tangents,t.STATIC_DRAW),t.enableVertexAttribArray(2),t.vertexAttribPointer(2,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,i),t.bufferData(t.ELEMENT_ARRAY_BUFFER,r.indices,t.STATIC_DRAW),t.bindVertexArray(null),{vao:n,indexCount:r.indices.length,indexType:r.indices instanceof Uint32Array?t.UNSIGNED_INT:t.UNSIGNED_SHORT,dispose(){t.deleteVertexArray(n),t.deleteBuffer(o),t.deleteBuffer(a),t.deleteBuffer(s),t.deleteBuffer(i)}})}function At(e){let{gl:r}=e,t=e.compile(ln,Rt);if("kind"in t)return t;let n=e.compile(cn,un);if("kind"in n)return n;let o=e.compile(Tr,Rt);if("kind"in o)return o;let a=(s,i)=>r.getUniformLocation(s,i);return{shadowPass(s,i,l,c){let u=c??(()=>{});l.bind(),u("shadow.bind"),r.clear(r.DEPTH_BUFFER_BIT),r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.FRONT),r.useProgram(t),u("useProgram(shadow)"),r.uniformMatrix4fv(a(t,"uLightVP"),!1,s),u("uLightVP");for(let d of i)r.uniformMatrix4fv(a(t,"uModel"),!1,d.model),u("shadow uModel"),r.bindVertexArray(d.mesh.vao),u("shadow bindVAO"),r.drawElements(r.TRIANGLES,d.mesh.indexCount,d.mesh.indexType,0),u("shadow drawElements");r.bindVertexArray(null),r.cullFace(r.BACK)},depthPrepass(s,i){r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.colorMask(!1,!1,!1,!1),r.useProgram(o),r.uniformMatrix4fv(a(o,"uViewProj"),!1,s);for(let l of i)r.uniformMatrix4fv(a(o,"uModel"),!1,l.model),r.bindVertexArray(l.mesh.vao),r.drawElements(r.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0);r.bindVertexArray(null),r.colorMask(!0,!0,!0,!0)},draw(s){let i=s.onStep??(()=>{});if(r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.useProgram(n),r.uniformMatrix4fv(a(n,"uViewProj"),!1,s.viewProj),i("uViewProj"),r.uniform3fv(a(n,"uEye"),s.eye),i("uEye"),r.uniform3fv(a(n,"uLightDir"),s.lightDir),i("uLightDir"),r.uniform3fv(a(n,"uLightColour"),s.lightColour),i("uLightColour"),r.uniform1f(a(n,"uAmbientGain"),s.ambientGain??1),i("uAmbientGain"),s.fog&&s.fog.density>0){r.uniform1f(a(n,"uFogDensity"),s.fog.density),r.uniform1f(a(n,"uFogHeight"),s.fog.height),r.uniform1f(a(n,"uFogFloor"),s.fog.floor??0);let l=s.fog.colour;l==="sky"?r.uniform3f(a(n,"uFogColour"),-1,-1,-1):r.uniform3f(a(n,"uFogColour"),l[0],l[1],l[2]),i("fog")}else r.uniform1f(a(n,"uFogDensity"),0);sn(r,n,s.sky),i("bindSky"),s.ao&&s.screenSize?(r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,s.ao),r.uniform1i(a(n,"uAO"),1),r.uniform2f(a(n,"uScreenSize"),s.screenSize[0],s.screenSize[1]),r.uniform1f(a(n,"uAOEnabled"),1)):r.uniform1f(a(n,"uAOEnabled"),0),i("bindAO"),r.uniformMatrix4fv(a(n,"uLightVP"),!1,s.lightVP),i("lit uLightVP"),s.shadow?(r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,s.shadow.depthTexture),r.uniform1i(a(n,"uShadowMap"),0),r.uniform1f(a(n,"uShadowTexel"),1/s.shadow.size),r.uniform1f(a(n,"uShadowStrength"),s.shadowStrength??1)):r.uniform1f(a(n,"uShadowStrength"),0);for(let l of s.draws)r.uniformMatrix4fv(a(n,"uModel"),!1,l.model),r.uniformMatrix3fv(a(n,"uNormalMat"),!1,l.normalMat),i("uNormalMat"),r.uniform3fv(a(n,"uBaseColour"),l.material.baseColour),i("uBaseColour"),r.uniform1f(a(n,"uRoughness"),l.material.roughness),r.uniform1f(a(n,"uMetalness"),l.material.metalness),r.uniform1f(a(n,"uAnisotropy"),l.material.anisotropy??0),r.bindVertexArray(l.mesh.vao),i("lit bindVAO"),r.drawElements(r.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0),i("lit drawElements");r.bindVertexArray(null),r.disable(r.CULL_FACE)},dispose(){r.deleteProgram(t),r.deleteProgram(n),r.deleteProgram(o)}}}var Mt=`
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
}`,dn=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Rr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${Mt}

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
}`,Ar=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${Mt}

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
}`;function Ft(e,r,t){let{gl:n}=e,o=e.compile(dn,Rr);if("kind"in o)return o;let a=e.compile(dn,Ar);if("kind"in a)return a;let s=Math.max(1,r>>1),i=Math.max(1,t>>1),l=()=>{let m=n.createFramebuffer(),p=n.createTexture();return!m||!p?null:{fb:m,tex:p}},c=l(),u=l();if(!c||!u)return P("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let d=()=>{for(let m of[c,u])n.bindTexture(n.TEXTURE_2D,m.tex),n.texImage2D(n.TEXTURE_2D,0,n.R8,s,i,0,n.RED,n.UNSIGNED_BYTE,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.bindFramebuffer(n.FRAMEBUFFER,m.fb),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,m.tex,0);n.bindFramebuffer(n.FRAMEBUFFER,null)};d(),n.bindFramebuffer(n.FRAMEBUFFER,c.fb);let f=n.checkFramebufferStatus(n.FRAMEBUFFER);if(n.bindFramebuffer(n.FRAMEBUFFER,null),f!==n.FRAMEBUFFER_COMPLETE)return P("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${f.toString(16)}).`);let h=(m,p,b,y,g,E,T)=>{n.activeTexture(n.TEXTURE0+T),n.bindTexture(n.TEXTURE_2D,p),n.uniform1i(n.getUniformLocation(m,"uDepth"),T),n.uniform2f(n.getUniformLocation(m,"uNearFar"),b,y),n.uniform1f(n.getUniformLocation(m,"uTanHalfFov"),Math.tan(g*Math.PI/360)),n.uniform1f(n.getUniformLocation(m,"uAspect"),E)};return{get texture(){return c.tex},get width(){return s},get height(){return i},compute(m){n.disable(n.DEPTH_TEST),n.depthMask(!1),n.disable(n.BLEND),n.disable(n.CULL_FACE),n.bindFramebuffer(n.FRAMEBUFFER,c.fb),n.viewport(0,0,s,i),n.useProgram(o),h(o,m.depthTexture,m.near,m.far,m.fovDeg,m.aspect,0),n.uniform2f(n.getUniformLocation(o,"uTexel"),1/s,1/i),n.uniform1f(n.getUniformLocation(o,"uRadius"),m.radius??.55),n.uniform1f(n.getUniformLocation(o,"uStrength"),m.strength??1.15),n.uniform1f(n.getUniformLocation(o,"uBias"),m.bias??.035),e.blit(o);for(let[p,b,y]of[[c,u,[1,0]],[u,c,[0,1]]])n.bindFramebuffer(n.FRAMEBUFFER,b.fb),n.viewport(0,0,s,i),n.useProgram(a),h(a,m.depthTexture,m.near,m.far,m.fovDeg,m.aspect,0),n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,p.tex),n.uniform1i(n.getUniformLocation(a,"uAO"),1),n.uniform2f(n.getUniformLocation(a,"uTexel"),1/s,1/i),n.uniform2f(n.getUniformLocation(a,"uDir"),y[0],y[1]),e.blit(a);n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,null),n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,null),n.bindFramebuffer(n.FRAMEBUFFER,null),n.depthMask(!0),n.enable(n.DEPTH_TEST)},resize(m,p){let b=Math.max(1,m>>1),y=Math.max(1,p>>1);b===s&&y===i||(s=b,i=y,d())},dispose(){n.deleteProgram(o),n.deleteProgram(a);for(let m of[c,u])n.deleteFramebuffer(m.fb),n.deleteTexture(m.tex)}}}var Mr=`
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
`;function mn(e){let r=document.createElement("style");r.textContent=Mr,document.head.appendChild(r);let t=document.createElement("section");t.id="lcx-fallback";let n=(o,a)=>{if(o===null)return`<td class="absent${a?" n":""}">absent</td>`;let s=String(o).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");return`<td class="${a?"n":""}">${s}</td>`};return t.innerHTML=`<h2>${e.title} \u2014 flat view</h2><p class="reads">${e.readsAs}</p>`+(e.notices??[]).map(o=>`<p class="notice">${o}</p>`).join("")+'<div id="lcx-refusal"></div>'+(e.html?`<div class="surface">${e.html}</div>`:"<table><thead><tr>"+e.columns.map(o=>`<th class="${o.numeric?"n":""}">${o.label}</th>`).join("")+"</tr></thead><tbody>"+e.rows.map(o=>"<tr>"+e.columns.map(a=>n(o[a.key]??null,!!a.numeric)).join("")+"</tr>").join("")+"</tbody></table>"),document.body.appendChild(t),{markRendered(){t.dataset.rendered="1"},showRefusal(o,a){let s=document.getElementById("lcx-refusal");s&&(s.innerHTML=`<p class="refusal"><strong>${o}</strong> \u2014 ${a} The measurements below are unaffected.</p>`),delete t.dataset.rendered;for(let i of Array.from(document.querySelectorAll("canvas")))i.style.display="none"}}}var Te=new URLSearchParams(location.search),Ge=Te.get("ao")!=="0",M=Te.get("flat")==="1",He=Te.get("shadow")!=="0"&&!M,Re=Math.max(1,Math.min(3,Number(Te.get("scale")??1))),Dn=Number(Te.get("frames")??300),L=1200*Re,D=720*Re,ie=document.getElementById("c");ie.width=L;ie.height=D;var Fr=document.getElementById("log");function Ht(e){document.title="REFUSED";let r=document.getElementById("log");r&&(r.textContent=e);let[t,...n]=e.split(":");throw _n?.showRefusal(t?.trim()??"REFUSED",n.join(":").trim()||e),new Error(e)}var _n=null;function O(e,r){return"kind"in r&&Ht(`${e}: ${r.code} \u2014 ${r.reason} ${r.detail??""}`),r}var A="PROGRAMME",le=[{id:A,kind:"CORE",thetaDeg:0,count:{state:"observed",records:9}},{id:"PARTNER",kind:"PARTY",thetaDeg:18,count:{state:"observed",records:412}},{id:"PERSON",kind:"PARTY",thetaDeg:128,count:{state:"observed",records:1940}},{id:"COUNTERPARTY",kind:"PARTY",thetaDeg:236,count:{state:"absent"}},{id:"LISTING",kind:"INSTRUMENT",thetaDeg:196,count:{state:"observed",records:128}},{id:"TOKEN",kind:"INSTRUMENT",thetaDeg:52,count:{state:"observed",records:64}},{id:"SETTLEMENT",kind:"INSTRUMENT",thetaDeg:300,count:{state:"observed",records:22806}},{id:"CAMPAIGN",kind:"EVENT",thetaDeg:258,count:{state:"observed",records:37}},{id:"QUEST",kind:"EVENT",thetaDeg:8,count:{state:"observed",records:1204}},{id:"COMPARTMENT",kind:"CONTROL",thetaDeg:270,count:{state:"withheld"}},{id:"JURISDICTION",kind:"CONTROL",thetaDeg:214,count:{state:"observed",records:31}}],Y=[{a:A,b:"PARTNER",strength:.92},{a:A,b:"LISTING",strength:.71},{a:A,b:"CAMPAIGN",strength:.64},{a:A,b:"COMPARTMENT",strength:.55},{a:"PARTNER",b:"PERSON",strength:.8},{a:"PARTNER",b:"COUNTERPARTY",strength:.34},{a:"LISTING",b:"TOKEN",strength:.88},{a:"TOKEN",b:"SETTLEMENT",strength:.76},{a:"CAMPAIGN",b:"QUEST",strength:.58},{a:"QUEST",b:"PERSON",strength:.41},{a:"JURISDICTION",b:"LISTING",strength:.67},{a:"SETTLEMENT",b:"COUNTERPARTY",strength:.29},{a:"JURISDICTION",b:"PERSON",strength:null}],Nn=mn({title:"E4 \xB7 The Orrery \u2014 ontology entities and couplings",readsAs:"The rendered view places each entity on an orbit whose radius is its distance from the core and whose inclination separates its kind, so coupling strength and grouping are read at once without crossing lines. These two lists carry every entity and every relationship, and none of that structure.",notices:["A SYNTHETIC ontology \u2014 the shape is deliberate, the counts are not measurements.","Absent (never measured) and withheld (measured, not shown) are separate states here, as in the render."],columns:[{key:"entity",label:"Entity"},{key:"kind",label:"Kind"},{key:"records",label:"Records",numeric:!0},{key:"couplings",label:"Couplings",numeric:!0}],rows:[...le.map(e=>({entity:e.id,kind:e.kind,records:e.count.state==="observed"?e.count.records:e.count.state==="withheld"?"withheld":null,couplings:Y.filter(r=>r.a===e.id||r.b===e.id).length})),...Y.map(e=>({entity:`${e.a} \u2192 ${e.b}`,kind:"COUPLING",records:e.strength===null?null:e.strength.toFixed(2),couplings:""}))]});_n=Nn;new URLSearchParams(location.search).get("refuse")==="1"&&Ht("FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. The three-dimensional view is not being drawn.");var Be=nt(ie,{alpha:!1});tt(Be)||Ht(`stage: ${Be.code} \u2014 ${Be.reason}`);var _=Be,x=_.gl,Sr=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,vr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${ct}
${ut}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,wr=O("present",_.compile(Sr,vr)),St=O("lit",At(_)),Ue=O("target",xt(_,L,D)),_t=O("shadow",yt(_,1536)),fn=O("ao",Ft(_,L,D)),Nt=new Map(le.map(e=>[e.id,[]]));for(let e of Y)Nt.get(e.a)?.push(e.b),Nt.get(e.b)?.push(e.a);var se=new Map([[A,0]]);for(let e=[A];e.length>0;){let r=[];for(let t of e)for(let n of Nt.get(t)??[])se.has(n)||(se.set(n,(se.get(t)??0)+1),r.push(n));e=r}var Lr=le.filter(e=>!se.has(e.id)).map(e=>e.id),X=Math.PI/180,j=e=>1+e*2.1,Ae={CORE:{incDeg:0,nodeDeg:0},PARTY:{incDeg:0,nodeDeg:0},INSTRUMENT:{incDeg:34,nodeDeg:64},EVENT:{incDeg:-29,nodeDeg:-58},CONTROL:{incDeg:62,nodeDeg:118}};function be(e,r,t,n){let o=r*X,a=t*X,s=n*X,i=e*Math.cos(o),l=e*Math.sin(o),c=-l*Math.sin(a),u=l*Math.cos(a);return[i*Math.cos(s)+u*Math.sin(s),c,-i*Math.sin(s)+u*Math.cos(s)]}function Dr(e,r){let t=e*X,n=r*X,o=Math.cos(t),a=Math.sin(t),s=Math.cos(n),i=Math.sin(n),l=new Float32Array([s,0,-i,i*a,o,s*a,i*o,-a,s*o]),c=K();return c[0]=l[0],c[1]=l[1],c[2]=l[2],c[4]=l[3],c[5]=l[4],c[6]=l[5],c[8]=l[6],c[9]=l[7],c[10]=l[8],{model:c,normal:l}}var Pn=.15,On=.115,_r=e=>Pn+On*Math.log10(Math.max(1,e)),In=.34,Un=.115,Cn=In+Un,$t=.3,Nr=.44,Pr=e=>e.state==="observed"?_r(e.records):e.state==="absent"?Cn:$t,v=le.filter(e=>se.has(e.id)).map(e=>{let r=se.get(e.id),t=j(r),n=Ae[e.kind];return{def:e,hops:r,shell:t,pos:e.id===A?[0,0,0]:be(t,e.thetaDeg,n.incDeg,n.nodeDeg),flatPos:e.id===A?[0,0,0]:be(t,e.thetaDeg,0,0),radius:Pr(e.count)}}),$e=new Map(v.map(e=>[e.def.id,e])),Ke=Object.keys(Ae).filter(e=>v.some(r=>r.def.kind===e&&r.def.id!==A)),Qe=e=>M?e.flatPos:e.pos,Bn=Y.map(e=>e.strength).filter(e=>e!==null),ge=Math.min(...Bn),ze=Math.max(...Bn),Pt=.026,kn=.086,zt=e=>Pt+(kn-Pt)*((e-ge)/Math.max(1e-6,ze-ge)),qe=.052,Vn=e=>Y.flatMap(r=>{let t=$e.get(r.a),n=$e.get(r.b);return!t||!n?[]:[{rel:r,aId:r.a,bId:r.b,a:e?t.flatPos:t.pos,b:e?n.flatPos:n.pos,r:r.strength===null?qe:zt(r.strength),dotted:r.strength===null}]}),Z=Vn(!1),J=Vn(!0),Ot=.5,It=90,hn=60,V=M?{target:[0,0,0],distance:22,azimuthDeg:hn,elevationDeg:89,fovDeg:36,near:Ot,far:It}:{target:[0,.4,0],distance:22,azimuthDeg:hn,elevationDeg:26,fovDeg:36,near:Ot,far:It},W=oe(V),jt=V.fovDeg??36,w=L/Re,F=D/Re,Me=e=>F/2/(Math.max(.01,e)*Math.tan(jt/2*X)),Ze=e=>Math.hypot(e[0]-W[0],e[1]-W[1],e[2]-W[2]),Q=(e,r)=>e[0]*r[0]+e[1]*r[1]+e[2]*r[2],U=(e,r)=>[e[0]-r[0],e[1]-r[1],e[2]-r[2]],C=e=>Math.hypot(e[0],e[1],e[2]),pn=(e,r,t)=>[e[0]+r[0]*t,e[1]+r[1]*t,e[2]+r[2]*t];function je(e,r,t,n){let o=U(r,e),a=U(n,t),s=U(e,t),i=Q(o,o),l=Q(a,a),c=Q(a,s),u=0,d=0;if(i<=1e-12&&l<=1e-12)return{dist:C(s),c1:e,c2:t};if(i<=1e-12)d=Math.min(1,Math.max(0,c/l));else{let m=Q(o,s);if(l<=1e-12)u=Math.min(1,Math.max(0,-m/i));else{let p=Q(o,a),b=i*l-p*p;u=b>1e-12?Math.min(1,Math.max(0,(p*c-m*l)/b)):0,d=(p*u+c)/l,d<0?(d=0,u=Math.min(1,Math.max(0,-m/i))):d>1&&(d=1,u=Math.min(1,Math.max(0,(p-m)/i)))}}let f=pn(e,o,u),h=pn(t,a,d);return{dist:C(U(f,h)),c1:f,c2:h}}var Xt=e=>{let r=[];for(let t=0;t<e.length;t++)for(let n=t+1;n<e.length;n++){let o=e[t],a=e[n];o.aId===a.aId||o.aId===a.bId||o.bId===a.aId||o.bId===a.bId||r.push([o,a])}return r};function Gn(e){let r=0,t=1/0,n=[];for(let[o,a]of Xt(e)){let s=je(o.a,o.b,a.a,a.b).dist;t=Math.min(t,s),s<o.r+a.r&&(r++,n.push(`${o.aId}~${o.bId} \xD7 ${a.aId}~${a.bId}`))}return{pairs:r,minSeparation:Number.isFinite(t)?t:0,worst:n}}function Hn(e,r,t,n,o,a,s,i){let l=t-e,c=n-r,u=s-o,d=i-a,f=l*d-c*u;if(Math.abs(f)<1e-9)return null;let h=o-e,m=a-r,p=(h*d-m*u)/f,b=(h*c-m*l)/f;return p<=1e-6||p>=1-1e-6||b<=1e-6||b>=1-1e-6?null:{t:p,u:b}}function Or(e,r,t,n){let o=(()=>{let m=U(e.target,r),p=C(m)||1;return[m[0]/p,m[1]/p,m[2]/p]})(),a=(()=>{let m=[-o[2],0,o[0]],p=C(m)||1;return[m[0]/p,m[1]/p,m[2]/p]})(),s=[a[1]*o[2]-a[2]*o[1],a[2]*o[0]-a[0]*o[2],a[0]*o[1]-a[1]*o[0]],i=Math.tan(jt/2*X),l=t/w*2-1,c=1-n/F*2,u=o[0]+a[0]*l*i*(w/F)+s[0]*c*i,d=o[1]+a[1]*l*i*(w/F)+s[1]*c*i,f=o[2]+a[2]*l*i*(w/F)+s[2]*c*i,h=Math.hypot(u,d,f)||1;return[u/h,d/h,f/h]}function $n(e,r){let t=oe(r),n=ae(r,w/F),o=new Map;for(let l of e)o.set(l,{a:k(n,l.a,w,F),b:k(n,l.b,w,F)});let a=0,s=0,i=1/0;for(let[l,c]of Xt(e)){let u=o.get(l),d=o.get(c);if(u.a.behind||u.b.behind||d.a.behind||d.b.behind)continue;let f=Hn(u.a.sx,u.a.sy,u.b.sx,u.b.sy,d.a.sx,d.a.sy,d.b.sx,d.b.sy);if(!f)continue;a++;let h=u.a.sx+(u.b.sx-u.a.sx)*f.t,m=u.a.sy+(u.b.sy-u.a.sy)*f.t,p=Or(r,t,h,m),b=[t[0]+p[0]*400,t[1]+p[1]*400,t[2]+p[2]*400],y=je(l.a,l.b,t,b).c1,g=je(c.a,c.b,t,b).c1,E=C(U(y,g));i=Math.min(i,E),E<l.r+c.r&&s++}return{total:a,ambiguous:s,minSep:Number.isFinite(i)?i:0}}function zn(e){let r=oe(e),t=ae(e,w/F);return v.map(n=>{let o=Qe(n),a=k(t,o,w,F),s=Math.hypot(o[0]-r[0],o[1]-r[1],o[2]-r[2]);return{id:n.def.id,cx:a.sx,cy:a.sy,r:n.radius*Me(s),behind:a.behind}})}function Ut(e){let r=zn(e),t=[];for(let n=0;n<r.length;n++)for(let o=n+1;o<r.length;o++){let a=r[n],s=r[o];if(a.behind||s.behind)continue;let i=Math.hypot(a.cx-s.cx,a.cy-s.cy)-(a.r+s.r);i<0&&t.push(`${a.id}/${s.id} overlap ${(-i).toFixed(1)}px`)}return t}function jn(e){let r=0;for(let[t,n]of Xt(e))Hn(t.a[0],t.a[2],t.b[0],t.b[2],n.a[0],n.a[2],n.b[0],n.b[2])&&r++;return r}function Ce(e,r){let t=[];for(let n of e)for(let o of v){if(o.def.id===n.aId||o.def.id===n.bId)continue;let a=r?o.flatPos:o.pos;je(n.a,n.b,a,a).dist<o.radius+n.r&&t.push(`${n.aId}~${n.bId} through ${o.def.id}`)}return t}var Ir=performance.now(),Xn=12e4,ke=1/0;{let e=le.filter(o=>o.id!==A).map(o=>o.thetaDeg),r=le.filter(o=>o.id!==A).map(o=>o.id),t=new Map([[A,[0,0,0]]]),n=e.slice();for(let o=0;o<Xn;o++){if(o>0)for(let i=n.length-1;i>0;i--){let l=Math.random()*(i+1)|0,c=n[i];n[i]=n[l],n[l]=c}for(let i=0;i<r.length;i++){let l=$e.get(r[i]);t.set(r[i],be(l.shell,n[i],0,0))}let a=Y.flatMap(i=>{let l=t.get(i.a),c=t.get(i.b);return!l||!c?[]:[{rel:i,aId:i.a,bId:i.b,a:l,b:c,r:i.strength===null?qe:zt(i.strength),dotted:i.strength===null}]}),s=jn(a);if(s<ke&&(ke=s),ke===0)break}}var Ur=performance.now()-Ir,q=jn(J),vt=Gn(Z),Ct=Gn(J),he=$n(M?J:Z,V),ce=Array.from({length:36},(e,r)=>{let t={...V,azimuthDeg:r*10},n=$n(Z,t);return{azimuthDeg:r*10,total:n.total,ambiguous:n.ambiguous,mergedDiscs:Ut(t).length}}),bn=Math.max(...ce.map(e=>e.ambiguous)),Cr=[Math.min(...ce.map(e=>e.total)),Math.max(...ce.map(e=>e.total))],Br=ce.filter(e=>e.mergedDiscs===0).map(e=>e.azimuthDeg),Wt=-2.6,Wn=mt(26,52),Yn=_e(1,22,30),Kn=_e(qe,10,14),Qn=Pe(In,Un,48,16),qn=Ne($t,Nr,40),Zn=Ne(1,1,16),Jn=.032,er=[1,2,3].map(e=>Pe(j(e),Jn,96,8)),kr=O("deck",$(_,Wn)),Vr=O("sphere",$(_,Yn)),tr=O("pip",$(_,Kn)),Gr=O("absent",$(_,Qn)),Hr=O("withheld",$(_,qn)),nr=O("link",$(_,Zn)),$r=er.map((e,r)=>O(`ring${r}`,$(_,e))),Xe=new Float32Array([1,0,0,0,1,0,0,0,1]),We=(e,r)=>{let t=K();return t[0]=r,t[5]=r,t[10]=r,t[12]=e[0],t[13]=e[1],t[14]=e[2],t};function zr(e,r,t){let n=U(r,e),o=C(n);if(o<1e-6)return null;let a=[n[0]/o,n[1]/o,n[2]/o],s=Math.abs(a[1])<.9?[0,1,0]:[1,0,0],i=[a[1]*s[2]-a[2]*s[1],a[2]*s[0]-a[0]*s[2],a[0]*s[1]-a[1]*s[0]],l=C(i)||1,c=[i[0]/l,i[1]/l,i[2]/l],u=[a[1]*c[2]-a[2]*c[1],a[2]*c[0]-a[0]*c[2],a[0]*c[1]-a[1]*c[0]],d=K();d[0]=c[0]*t,d[1]=c[1]*t,d[2]=c[2]*t,d[4]=a[0]*o,d[5]=a[1]*o,d[6]=a[2]*o,d[8]=u[0]*t,d[9]=u[1]*t,d[10]=u[2]*t,d[12]=(e[0]+r[0])/2,d[13]=(e[1]+r[1])/2,d[14]=(e[2]+r[2])/2;let f=new Float32Array([c[0]/t,c[1]/t,c[2]/t,a[0]/o,a[1]/o,a[2]/o,u[0]/t,u[1]/t,u[2]/t]);return{model:d,normal:f}}function jr(e,r){let t=U(r,e),n=C(t)||1,o=[t[0]/n,t[1]/n,t[2]/n],a=Math.abs(o[1])<.9?[0,1,0]:[1,0,0],s=[o[1]*a[2]-o[2]*a[1],o[2]*a[0]-o[0]*a[2],o[0]*a[1]-o[1]*a[0]],i=C(s)||1,l=[s[0]/i,s[1]/i,s[2]/i],c=[o[1]*l[2]-o[2]*l[1],o[2]*l[0]-o[0]*l[2],o[0]*l[1]-o[1]*l[0]],u=K();return u[0]=l[0],u[1]=l[1],u[2]=l[2],u[4]=o[0],u[5]=o[1],u[6]=o[2],u[8]=c[0],u[9]=c[1],u[10]=c[2],u[12]=e[0],u[13]=e[1],u[14]=e[2],{model:u,normal:new Float32Array([l[0],l[1],l[2],o[0],o[1],o[2],c[0],c[1],c[2]])}}var rr="#2C6BFF",or="#7FB2FF",xe="#FF8A3D",ar="#6B7A99",Xr="#22355E",Wr="#090F1C",Yr="#05070E",ue=[{mesh:kr,model:We([0,Wt,0],1),normalMat:Xe,material:{baseColour:I(Wr),roughness:.9,metalness:0}}],sr=[],Ye=[],ir=0;for(let e of Ke)for(let r of[1,2,3]){if(!v.some(o=>o.def.kind===e&&o.hops===r&&o.def.id!==A))continue;if(M&&Ye.some(o=>o.hops===r)){ir++;continue}let t=Ae[e],n=Dr(M?0:t.incDeg,M?0:t.nodeDeg);ue.push({mesh:$r[r-1],model:n.model,normalMat:n.normal,material:{baseColour:I(Xr),roughness:.55,metalness:.2}}),Ye.push({kind:e,hops:r})}var Bt=(M?J:Z).flatMap(e=>{if(e.dotted){let t=C(U(e.b,e.a)),n=Math.max(3,Math.round(t/(qe*4.2)));return Array.from({length:n-1},(o,a)=>{let s=(a+1)/n,i=[e.a[0]+(e.b[0]-e.a[0])*s,e.a[1]+(e.b[1]-e.a[1])*s,e.a[2]+(e.b[2]-e.a[2])*s];return{mesh:tr,model:We(i,1),normalMat:Xe,material:{baseColour:I(xe),roughness:.42,metalness:.1}}})}let r=zr(e.a,e.b,e.r);return r?[{mesh:nr,model:r.model,normalMat:r.normal,material:{baseColour:I(or),roughness:.34,metalness:.12}}]:[]});ue.push(...Bt);for(let e of v){let r=Qe(e),t=jr(r,W),n=e.def.count.state==="absent"?{mesh:Gr,model:t.model,normalMat:t.normal,material:{baseColour:I(xe),roughness:.52,metalness:.04}}:e.def.count.state==="withheld"?{mesh:Hr,model:We(r,1),normalMat:Xe,material:{baseColour:I(ar),roughness:.42,metalness:.15}}:{mesh:Vr,model:We(r,e.radius),normalMat:Xe,material:{baseColour:I(rr),roughness:e.def.id===A?.22:.34,metalness:e.def.id===A?.36:.08}};ue.push(n),sr.push(n)}var lr=[.14,-.966,-.22],gn=[-8.2,Wt,-8.2],xn=[8.2,5,8.2],yn=pt({direction:lr,colour:[1,1,1],extent:10.5},gt(gn,xn),bt(gn,xn)),Kr=H(Wn)+Ye.reduce((e,r)=>e+H(er[r.hops-1]),0)+v.filter(e=>e.def.count.state==="observed").length*H(Yn)+H(Qn)+H(qn)+Bt.filter(e=>e.mesh===nr).length*H(Zn)+Bt.filter(e=>e.mesh===tr).length*H(Kn),pe=Ge;function ye(){let e=ae(V,L/D);He&&St.shadowPass(yn,sr,_t),Ue.bind();let r=I(Yr);x.clearColor(r[0],r[1],r[2],1),x.clear(x.COLOR_BUFFER_BIT|x.DEPTH_BUFFER_BIT),St.depthPrepass(e,ue),pe&&(fn.compute({depthTexture:Ue.depthTexture,near:Ot,far:It,fovDeg:jt,aspect:L/D,radius:.9,strength:2}),Ue.bind()),St.draw({viewProj:e,eye:W,lightDir:lr,lightColour:[3.1,3.05,2.95],ambientGain:.52,lightVP:yn,shadow:He?_t:null,shadowStrength:.92,draws:ue,ao:pe?fn.texture:null,screenSize:[L,D],fog:null}),x.bindFramebuffer(x.FRAMEBUFFER,null),x.viewport(0,0,L,D),x.disable(x.DEPTH_TEST),x.activeTexture(x.TEXTURE0),x.bindTexture(x.TEXTURE_2D,Ue.texture),_.blit(wr,t=>x.uniform1i(x.getUniformLocation(t,"uScene"),0))}function Qr(e){ye();let r=new Uint8Array(4);x.readPixels(0,0,1,1,x.RGBA,x.UNSIGNED_BYTE,r);let t=performance.now();for(let n=0;n<e;n++)ye();return x.readPixels(0,0,1,1,x.RGBA,x.UNSIGNED_BYTE,r),(performance.now()-t)/e}var kt=Qr(Math.max(1,Dn));function qr(){let e={maxDelta:0,changed:0,fraction:0,sampled:0,meanWith:0,meanWithout:0,glErrorInProbe:0};if(!Ge)return{...e,refusal:"AO_DISABLED_BY_PARAM"};if(!He)return{...e,refusal:"AO_PROBE_REQUIRES_SHADOW_PASS"};let r=new Uint8Array(L*D*4),t=new Uint8Array(L*D*4);x.getError(),pe=!0,ye(),x.readPixels(0,0,L,D,x.RGBA,x.UNSIGNED_BYTE,r),pe=!1,ye(),x.readPixels(0,0,L,D,x.RGBA,x.UNSIGNED_BYTE,t);let n=x.getError();pe=Ge;let o=0,a=0;for(let c=0;c<r.length;c+=4)o+=r[c]+r[c+1]+r[c+2],a+=t[c]+t[c+1]+t[c+2];let s=0,i=0;for(let c=0;c<r.length;c+=4){let u=Math.abs(r[c]-t[c])+Math.abs(r[c+1]-t[c+1])+Math.abs(r[c+2]-t[c+2]);u>s&&(s=u),u>6&&i++}let l=L*D;return{maxDelta:s,changed:i,fraction:Number((i/l).toFixed(5)),sampled:l,meanWith:Number((o/(l*3)).toFixed(2)),meanWithout:Number((a/(l*3)).toFixed(2)),glErrorInProbe:n,refusal:null}}var Zr=qr(),Ee=ae(V,L/D),Fe=document.createElement("div");Fe.style.cssText=`position:relative;overflow:hidden;width:${w}px;height:${F}px`;ie.parentNode?.insertBefore(Fe,ie);Fe.appendChild(ie);var ee=document.createElement("div");ee.style.cssText="position:absolute;inset:0;pointer-events:none";Fe.appendChild(ee);var cr=9,Yt=(e,r)=>Math.max(0,Math.min(e.x+e.w,r.x+r.w)-Math.max(e.x,r.x))*Math.max(0,Math.min(e.y+e.h,r.y+r.h)-Math.max(e.y,r.y));function Kt(e){e.style.left="-99999px",e.style.top="0px",e.style.visibility="hidden",ee.appendChild(e);let r=e.getBoundingClientRect();return{x:0,y:0,w:Math.ceil(r.width),h:Math.ceil(r.height)}}function Qt(e,r){e.style.left=`${r.x.toFixed(1)}px`,e.style.top=`${r.y.toFixed(1)}px`,e.style.visibility="visible"}var Ve={observed:v.filter(e=>e.def.count.state==="observed").length,absent:v.filter(e=>e.def.count.state==="absent").length,withheld:v.filter(e=>e.def.count.state==="withheld").length},Je=document.createElement("div");Je.style.cssText="position:absolute;left:18px;top:16px;display:flex;flex-direction:column;gap:7px";Je.innerHTML=`<div style="font:600 11px/1 ui-monospace,monospace;letter-spacing:.16em;color:#8FB7FF">ONTOLOGY AS ORBITS \xB7 ${M?"FLAT CONTROL \u2014 INCLINATIONS ZEROED":"RADIUS = HOPS \xB7 SIZE = RECORDS \xB7 TUBE = STRENGTH"}</div><div style="font:400 10.5px/1.55 ui-monospace,monospace;color:rgba(196,212,240,0.84)">${M?`${q} CROSSINGS IN PLANE &nbsp;\xB7&nbsp; ${Ct.pairs} AMBIGUOUS (NO DEPTH TO RESOLVE THEM)`:`${he.total} CROSSINGS ON SCREEN &nbsp;\xB7&nbsp; ${he.ambiguous} AMBIGUOUS &nbsp;\xB7&nbsp; FLAT LAYOUT: ${q} OF ${q}`}<br>INCLINATION SEPARATES ${Ke.length} ENTITY KINDS &nbsp;\xB7&nbsp; ${v.length} ENTITIES, ${Y.length} RELATIONSHIPS</div><div style="font:500 10px/1.4 ui-monospace,monospace;color:#E0A94A">SYNTHETIC ONTOLOGY</div>`;ee.appendChild(Je);var Jr=Ze([0,0,0]),eo=Me(Jr),et=document.createElement("div");et.style.cssText="position:absolute;right:18px;bottom:16px;display:flex;flex-direction:column;gap:7px;align-items:flex-end;font:500 10px/1 ui-monospace,monospace;color:rgba(196,212,240,0.85)";var wt=e=>{let r=Math.max(1,2*zt(e)*eo);return`<div style="display:flex;align-items:center;gap:8px"><span>STRENGTH ${e.toFixed(2)}</span><span style="width:46px;height:${r.toFixed(1)}px;background:${or};display:inline-block"></span></div>`};et.innerHTML=wt(ge)+wt((ge+ze)/2)+wt(ze)+`<div style="display:flex;align-items:center;gap:8px"><span>STRENGTH NEVER MEASURED</span><span style="width:46px;display:inline-flex;gap:3px;justify-content:space-between">${('<span style="width:5px;height:5px;border-radius:50%;background:'+xe+'"></span>').repeat(5)}</span></div><div style="height:4px"></div><div style="display:flex;align-items:center;gap:8px"><span>RECORDS OBSERVED \xB7 ${Ve.observed}</span><span style="width:11px;height:11px;border-radius:50%;background:${rr};display:inline-block"></span></div><div style="display:flex;align-items:center;gap:8px"><span>RECORDS ABSENT \xB7 ${Ve.absent} (RING \u2014 NOT ON THE SIZE SCALE)</span><span style="width:11px;height:11px;border-radius:50%;border:3px solid ${xe};box-sizing:border-box;display:inline-block"></span></div><div style="display:flex;align-items:center;gap:8px"><span>WITHHELD \xB7 ${Ve.withheld} (DRUM \u2014 PRESENT, UNLABELLED)</span><span style="width:11px;height:11px;background:${ar};display:inline-block"></span></div>`;ee.appendChild(et);var En=e=>{let r=e.getBoundingClientRect(),t=Fe.getBoundingClientRect();return{x:r.left-t.left,y:r.top-t.top,w:r.width,h:r.height}},de=[En(Je),En(et)],to=zn(V).map(e=>({id:e.id,behind:e.behind,box:{x:e.cx-e.r,y:e.cy-e.r,w:2*e.r,h:2*e.r}})),no=.12,ur=(e,r)=>to.some(t=>t.id!==r&&!t.behind&&Yt(e,t.box)>no*Math.max(1,t.box.w*t.box.h)),qt=e=>e.x>=2&&e.y>=2&&e.x+e.w<=w-2&&e.y+e.h<=F-2,dr=(e,r)=>qt(e)&&!de.some(t=>Yt(t,e)>0)&&!ur(e,r),Tn=10.4,Rn=2.4,An=4.6,mr='<div style="font:600 12px/1.1 ui-monospace,monospace;letter-spacing:.16em;color:rgba(143,183,255,0.90)">REFERENCE PLANE \xB7 INCLINATION 0</div><div style="font:400 11px/1.2 ui-monospace,monospace;color:rgba(196,212,240,0.66)">'+(M?`THE FLAT DIAGRAM LIVES HERE \xB7 ${q} CROSSINGS, ALL AMBIGUOUS`:`WHAT A FLAT DIAGRAM HAS TO FIT INTO \xB7 ${q} CROSSINGS`)+"</div>",Mn=(()=>{let e=V.azimuthDeg*X,r=[Math.cos(e),0,-Math.sin(e)],t=[Math.sin(e),0,Math.cos(e)],n=Wt+.03,o=[t[0]*An,n,t[2]*An],a=(s,i)=>[o[0]+r[0]*s*Tn/2+t[0]*i*Rn/2,n,o[2]+r[2]*s*Tn/2+t[2]*i*Rn/2];return{topLeft:a(-1,-1),topRight:a(1,-1),bottomRight:a(1,1),bottomLeft:a(-1,1)}})();function Fn(){let e=document.createElement("div");e.style.cssText="position:absolute;left:18px;bottom:16px;display:flex;flex-direction:column;gap:3px",e.innerHTML=mr,ee.appendChild(e)}var ro=(()=>{let e=Oe(Ee,Mn,w,F,100,40);if(Ie(e))return Fn(),{mode:"screen",reason:e.refusal,widthPx:0,heightPx:0,signedArea:0};let r=e.screen,t=(d,f)=>Math.hypot(r[d].x-r[f].x,r[d].y-r[f].y),n=Math.round((t(0,1)+t(3,2))/2),o=Math.round((t(0,3)+t(1,2))/2),a=r.map(d=>d.x),s=r.map(d=>d.y),i={x:Math.min(...a),y:Math.min(...s),w:Math.max(...a)-Math.min(...a),h:Math.max(...s)-Math.min(...s)},l=d=>(Fn(),{mode:"screen",reason:d,widthPx:n,heightPx:o,signedArea:Math.round(e.signedArea)});if(e.signedArea<=0)return l("BACK_FACING");if(n<26||o<26)return l("BELOW_26PX");if(!qt(i))return l("OFF_FRAME");let c=Oe(Ee,Mn,w,F,n,o);if(Ie(c))return l(c.refusal);let u=document.createElement("div");return u.style.cssText=`position:absolute;left:0;top:0;width:${n}px;height:${o}px;transform-origin:0 0;transform:${c.transform};display:flex;flex-direction:column;justify-content:center;align-items:center;gap:3px;overflow:hidden`,u.innerHTML=mr,ee.appendChild(u),de.push(i),{mode:"projected",reason:null,widthPx:n,heightPx:o,signedArea:Math.round(e.signedArea)}})(),oo=[0,22,-22,48,-48,74,-74,120,-120,160],Sn=Ke.map(e=>{let r=Math.max(...v.filter(s=>s.def.kind===e&&s.def.id!==A).map(s=>s.hops)),t=Ae[e],n=j(r),o=document.createElement("div");o.style.cssText="position:absolute;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;font:600 9.5px/1.25 ui-monospace,monospace;letter-spacing:.14em;color:rgba(127,178,255,0.82);text-shadow:0 1px 3px rgba(0,0,0,0.95)",o.innerHTML=`<span style="width:5px;height:5px;border-radius:50%;background:rgba(127,178,255,0.9);flex:0 0 auto"></span><span>${e} ${M?0:t.incDeg}\xB0</span>`;let a=Kt(o);for(let s of oo){let i=be(n,s,M?0:t.incDeg,M?0:t.nodeDeg),l=k(Ee,i,w,F);if(l.behind)continue;let c={x:l.sx-2.5,y:l.sy-a.h/2,w:a.w,h:a.h};if(dr(c,null))return Qt(o,c),de.push(c),{kind:e,incDeg:M?0:t.incDeg,thetaDeg:s,sx:Math.round(l.sx),sy:Math.round(l.sy),onFrame:!0}}return o.remove(),{kind:e,incDeg:M?0:t.incDeg,thetaDeg:null,sx:0,sy:0,onFrame:!1}}),ao=[152,205,118,250,90,20],vn=[1,2,3].map(e=>{let r=document.createElement("div");r.style.cssText="position:absolute;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;font:500 9.5px/1.25 ui-monospace,monospace;letter-spacing:.1em;color:rgba(196,212,240,0.70);text-shadow:0 1px 3px rgba(0,0,0,0.95)",r.innerHTML=`<span style="width:5px;height:5px;border-radius:50%;background:rgba(196,212,240,0.8);flex:0 0 auto"></span><span>${e} HOP${e>1?"S":""}</span>`;let t=Kt(r);for(let n of ao){let o=be(j(e),n,0,0),a=k(Ee,o,w,F);if(a.behind)continue;let s={x:a.sx-2.5,y:a.sy-t.h/2,w:t.w,h:t.h};if(dr(s,null))return Qt(r,s),de.push(s),{hops:e,thetaDeg:n,sx:Math.round(a.sx),sy:Math.round(a.sy),onFrame:!0}}return r.remove(),{hops:e,thetaDeg:null,sx:0,sy:0,onFrame:!1}}),Vt=v.map(e=>{let r=Qe(e),t=Ze(r),n=k(Ee,r,w,F),o=2*e.radius*Me(t),a=e.def.count.state==="observed"?`${e.hops===0?"CORE":`${e.hops} HOP${e.hops>1?"S":""}`} \xB7 ${e.def.count.records.toLocaleString("en-US")} REC`:e.def.count.state==="absent"?`${e.hops} HOPS \xB7 RECORDS ABSENT`:"";return{b:e,p:r,dist:t,anchor:n,bodyPx:o,meta:a}}),so=[...Vt].sort((e,r)=>e.dist-r.dist).map(e=>{let r=e.b.def.count.state==="withheld",t=e.anchor.behind||e.anchor.sx<0||e.anchor.sx>w||e.anchor.sy<0||e.anchor.sy>F,n=e.bodyPx<cr,o=(()=>{if(e.b.def.id===A)return!1;let h=$e.get(A),m=Qe(h),p=U(e.p,W),b=C(p)||1,y=[p[0]/b,p[1]/b,p[2]/b],g=U(m,W),E=Q(g,y);return E<=0||E>=b?!1:Q(g,g)-E*E<h.radius*h.radius})();if(r||t||n||o)return{s:e,shown:!1,placement:null,tried:0,reason:r?"WITHHELD":t?"ANCHOR_OFF_FRAME":o?"BEHIND_CORE":"BODY_BELOW_9PX",blocked:{offFrame:0,collision:0,coversBody:0}};let a=document.createElement("div");a.style.cssText="position:absolute;display:inline-flex;flex-direction:column;gap:2px;align-items:center;text-align:center;white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,0.95);-webkit-font-smoothing:antialiased";let s=e.b.def.count.state==="absent"?xe:"rgba(196,212,240,0.80)";a.innerHTML=`<div style="font:700 11px/1.1 ui-monospace,monospace;color:#fff;letter-spacing:.02em">${e.b.def.id}</div><div style="font:500 9.5px/1.15 ui-monospace,monospace;letter-spacing:.08em;color:${s}">${e.meta}</div>`;let i=Kt(a),l=6,c=9,u=[["above",{x:e.anchor.sx-i.w/2,y:e.anchor.sy-e.bodyPx/2-l-i.h,w:i.w,h:i.h}],["below",{x:e.anchor.sx-i.w/2,y:e.anchor.sy+e.bodyPx/2+l,w:i.w,h:i.h}],["right",{x:e.anchor.sx+e.bodyPx/2+c,y:e.anchor.sy-i.h/2,w:i.w,h:i.h}],["left",{x:e.anchor.sx-e.bodyPx/2-c-i.w,y:e.anchor.sy-i.h/2,w:i.w,h:i.h}]],d={offFrame:0,collision:0,coversBody:0};for(let[h,m]of u){if(!qt(m)){d.offFrame++;continue}if(de.some(p=>Yt(p,m)>0)){d.collision++;continue}if(ur(m,e.b.def.id)){d.coversBody++;continue}return Qt(a,m),de.push(m),{s:e,shown:!0,placement:h,tried:u.length,reason:null,blocked:d}}a.remove();let f=d.collision>=d.coversBody&&d.collision>=d.offFrame?"LABEL_COLLISION":d.coversBody>=d.offFrame?"WOULD_COVER_A_BODY":"NO_PLACEMENT_ON_FRAME";return{s:e,shown:!1,placement:null,tried:u.length,reason:f,blocked:d}}),fr=(M?J:Z).map(e=>{let r=[(e.a[0]+e.b[0])/2,(e.a[1]+e.b[1])/2,(e.a[2]+e.b[2])/2];return{edge:`${e.aId}~${e.bId}`,strength:e.rel.strength,radius:Number(e.r.toFixed(4)),px:Number((2*e.r*Me(Ze(r))).toFixed(2)),dotted:e.dotted}}),Lt=fr.filter(e=>!e.dotted).map(e=>e.px),Dt=so.map(({s:e,shown:r,placement:t,reason:n,blocked:o})=>({id:e.b.def.id,kind:e.b.def.kind,hops:e.b.hops,countState:e.b.def.count.state,records:e.b.def.count.state==="observed"?e.b.def.count.records:null,radius:Number(e.b.radius.toFixed(3)),bodyPx:Number(e.bodyPx.toFixed(1)),distance:Number(e.dist.toFixed(2)),labelShown:r,labelPlacement:t,labelHiddenBecause:n,labelBlockedBy:r?null:o})),Gt=dt();if(Gt.length>0){let e="BRAND FIDELITY FAILED \u2014 "+Gt.map(t=>`${t.key}: expected ${t.expected}, got ${t.actual}`).join("; ");document.title="REFUSED";let r=document.getElementById("log");throw r&&(r.textContent=e),new Error(e)}var te={brandFidelity:Gt,layout:M?"flat":"orrery",ao:Ge,aoEffect:Zr,shadow:He,hdr:_.hdr,eye:W.map(e=>Number(e.toFixed(2))),entities:v.length,relationships:Y.length,unreachableEntities:Lr,hopsPerEntity:Object.fromEntries(v.map(e=>[e.def.id,e.hops])),shellRadii:{1:j(1),2:j(2),3:j(3)},inclinationsByKind:Object.fromEntries(Ke.map(e=>[e,Ae[e].incDeg])),ringsDrawn:Ye.length,ringsCollapsedOntoAnother:ir,crossings:{flatInPlane:q,flatAmbiguous:Ct.pairs,flatMinSeparationM:Number(Ct.minSeparation.toFixed(4)),flatBestOverOrderings:ke,orderingsTried:Xn,orderingSearchMs:Number(Ur.toFixed(1)),grazingPairs3D:vt.pairs,grazingPairs3DDetail:vt.worst,minSeparation3DM:Number(vt.minSeparation.toFixed(4)),atThisCamera:{total:he.total,ambiguous:he.ambiguous,minSepM:Number(he.minSep.toFixed(3))},sweepAzimuths:ce.length,sweepScreenCrossings:Cr,sweepWorstAmbiguous:bn,ambiguousCrossingsAvoided:q-bn},linksThroughBodies:{orrery:Ce(Z,!1).length,flat:Ce(J,!0).length,orreryDetail:Ce(Z,!1),flatDetail:Ce(J,!0)},countStates:Ve,sizeScale:{base:Pn,perDecade:On,observedRange:[Number(Math.min(...v.filter(e=>e.def.count.state==="observed").map(e=>e.radius)).toFixed(3)),Number(Math.max(...v.filter(e=>e.def.count.state==="observed").map(e=>e.radius)).toFixed(3))],absentOuter:Cn,withheldOuter:$t},bodyPx:{min:Number(Math.min(...Vt.map(e=>e.bodyPx)).toFixed(1)),max:Number(Math.max(...Vt.map(e=>e.bodyPx)).toFixed(1)),floor:cr},bodyOverlapsOnScreen:{pairs:Ut(V).length,detail:Ut(V)},cleanAzimuths:Br,strengthScale:{min:ge,max:ze,radiusMin:Pt,radiusMax:kn},ringPx:Number((2*Jn*Me(Ze([0,0,-j(3)]))).toFixed(2)),linkPx:{thinnest:Math.min(...Lt),thickest:Math.max(...Lt)},strengthLegible:Math.min(...Lt)>=1.5,labelsShown:Dt.filter(e=>e.labelShown).length,labelsHiddenBy:Dt.filter(e=>!e.labelShown).reduce((e,r)=>{let t=r.labelHiddenBecause??"UNKNOWN";return e[t]=(e[t]??0)+1,e},{}),plate:ro,planeTicks:Sn,planeTicksOffFrame:Sn.filter(e=>!e.onFrame).length,hopTicks:vn,hopTicksOffFrame:vn.filter(e=>!e.onFrame).length,perEntity:Dt,perLink:fr,sweepDetail:ce,glError:x.getError(),triangles:Kr,drawCalls:ue.length,shadowMap:_t.size,resolution:`${L}x${D}`,dprScale:Re,frames:Dn,msPerFrame:Number(kt.toFixed(3)),fps:Math.round(1e3/kt),renderer:"",rendererClass:"",headroom:null,headroomRefusal:null,hardwareMsPerFrame:null},hr=(()=>{let e=x.getExtension("WEBGL_debug_renderer_info");return e?String(x.getParameter(e.UNMASKED_RENDERER_WEBGL)):"unknown"})(),Zt=/swiftshader|llvmpipe|software/i.test(hr);te.renderer=hr;te.rendererClass=Zt?"software":"hardware";te.headroom=Zt?null:Number((16.6-kt).toFixed(3));te.headroomRefusal=Zt?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null;te.hardwareMsPerFrame=null;globalThis.E4=te;var{perEntity:wn,perLink:Ln,planeTicks:la,hopTicks:ca,sweepDetail:ua,...io}=te;Fr.textContent=JSON.stringify(io,null,2)+`

perEntity (${wn.length}, full detail on globalThis.E4):
`+wn.map(e=>`  ${e.id.padEnd(13)} ${e.kind.padEnd(11)} h${e.hops} ${e.countState.padEnd(9)} r ${e.radius.toFixed(2)} ${String(e.bodyPx).padStart(5)}px ${String(e.distance).padStart(6)}m ${e.labelShown?"LABEL":`no label: ${e.labelHiddenBecause}`}`).join(`
`)+`

perLink (${Ln.length}):
`+Ln.map(e=>`  ${e.edge.padEnd(28)} s ${e.strength===null?"ABSENT":e.strength.toFixed(2)} r ${e.radius.toFixed(3)} ${String(e.px).padStart(5)}px${e.dotted?" (pips)":""}`).join(`
`);ye();Nn.markRendered();document.title="READY";

var nn={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected."};function P(e,r){return r===void 0?{kind:"refused",code:e,reason:nn[e]}:{kind:"refused",code:e,reason:nn[e],detail:r}}function nt(e){return e.kind==="stage"}function rt(e,r={}){let t=e.getContext("webgl2",{antialias:r.antialias??!1,alpha:r.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!t)return P("NO_WEBGL2");let n=t.getExtension("EXT_color_buffer_float"),o=e.width,a=e.height,i=n?t.RGBA16F:t.RGBA8,s=n?t.HALF_FLOAT:t.UNSIGNED_BYTE,l=(g,E)=>{let T=t.createTexture();t.bindTexture(t.TEXTURE_2D,T),t.texImage2D(t.TEXTURE_2D,0,i,g,E,0,t.RGBA,s,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);let R=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,R),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,T,0);let F=t.checkFramebufferStatus(t.FRAMEBUFFER);return F!==t.FRAMEBUFFER_COMPLETE?P("FRAMEBUFFER_INCOMPLETE",`status 0x${F.toString(16)} at ${g}\xD7${E}`):{texture:T,framebuffer:R,width:g,height:E}},u=r.bloomShift??2,c={w:o,h:a},d=l(o,a);if("kind"in d)return d;let f=l(Math.max(1,o>>u),Math.max(1,a>>u));if("kind"in f)return f;let h=l(Math.max(1,o>>u),Math.max(1,a>>u));if("kind"in h)return h;let m=t.createVertexArray();t.bindVertexArray(m);let p=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,p),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null);let b=[];return{kind:"stage",gl:t,cssWidth:e.clientWidth||o,cssHeight:e.clientHeight||a,hdr:!!n,get width(){return c.w},get height(){return c.h},get scene(){return d},get bloomA(){return f},get bloomB(){return h},setRegion(g,E){let T=Math.max(1,Math.round(g)),R=Math.max(1,Math.round(E));if(!(T===c.w&&R===c.h)){c={w:T,h:R};for(let F of[d,f,h])"kind"in F||(t.deleteFramebuffer(F.framebuffer),t.deleteTexture(F.texture));d=l(T,R),f=l(Math.max(1,T>>u),Math.max(1,R>>u)),h=l(Math.max(1,T>>u),Math.max(1,R>>u))}},compile(g,E){let T=(fe,z)=>{let G=t.createShader(fe);return t.shaderSource(G,z),t.compileShader(G),t.getShaderParameter(G,t.COMPILE_STATUS)?G:P("SHADER_COMPILE_FAILED",t.getShaderInfoLog(G)??"(no log)")},R=T(t.VERTEX_SHADER,g);if(typeof R=="object"&&"kind"in R)return R;let F=T(t.FRAGMENT_SHADER,E);if(typeof F=="object"&&"kind"in F)return F;let D=t.createProgram();return t.attachShader(D,R),t.attachShader(D,F),t.linkProgram(D),t.getProgramParameter(D,t.LINK_STATUS)?(b.push(D),D):P("PROGRAM_LINK_FAILED",t.getProgramInfoLog(D)??"(no log)")},bindTarget(g){t.bindFramebuffer(t.FRAMEBUFFER,g?g.framebuffer:null),t.viewport(0,0,g?g.width:c.w,g?g.height:c.h)},blit(g,E){t.useProgram(g),t.bindVertexArray(m),E?.(g),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null)},dispose(){for(let g of b)t.deleteProgram(g);for(let g of[d,f,h])"kind"in g||(t.deleteFramebuffer(g.framebuffer),t.deleteTexture(g.texture));t.deleteBuffer(p),t.deleteVertexArray(m)}}}var Q=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function we(e,r){let t=new Float32Array(16);for(let n=0;n<4;n++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=e[i*4+o]*r[n*4+i];t[n*4+o]=a}return t}var Le=(e,r)=>[e[0]-r[0],e[1]-r[1],e[2]-r[2]],ve=(e,r)=>e[0]*r[0]+e[1]*r[1]+e[2]*r[2],ot=(e,r)=>[e[1]*r[2]-e[2]*r[1],e[2]*r[0]-e[0]*r[2],e[0]*r[1]-e[1]*r[0]];function he(e){let r=Math.hypot(e[0],e[1],e[2]);return r===0?e:[e[0]/r,e[1]/r,e[2]/r]}function at(e,r,t,n){let o=1/Math.tan(e/2);return new Float32Array([o/r,0,0,0,0,o,0,0,0,0,(n+t)/(t-n),-1,0,0,2*n*t/(t-n),0])}function it(e,r,t,n,o,a){let i=r-e,s=n-t,l=a-o;return new Float32Array([2/i,0,0,0,0,2/s,0,0,0,0,-2/l,0,-(r+e)/i,-(n+t)/s,-(a+o)/l,1])}function Ne(e,r,t){let n=he(Le(e,r)),o=ot(t,n);if(Math.hypot(o[0],o[1],o[2])<1e-8)return Q();let a=he(o),i=ot(n,a);return new Float32Array([a[0],i[0],n[0],0,a[1],i[1],n[1],0,a[2],i[2],n[2],0,-ve(a,e),-ve(i,e),-ve(n,e),1])}function rn(e,r){let t=[0,1,2,3].map(o=>e[0+o]*r[0]+e[4+o]*r[1]+e[8+o]*r[2]+e[12+o]),n=t[3];return{x:t[0]/n,y:t[1]/n,z:t[2]/n,w:n}}function k(e,r,t,n){let o=rn(e,r);return{sx:(o.x*.5+.5)*t,sy:(1-(o.y*.5+.5))*n,behind:o.w<=0}}function on(e){return e<=.04045?e/12.92:Math.pow((e+.055)/1.055,2.4)}function st(e){return e<=.0031308?e*12.92:1.055*Math.pow(e,1/2.4)-.055}var Tr=/^#?([0-9a-fA-F]{6})$/;function I(e){let r=Tr.exec(e.trim());if(!r)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(e)}`);let t=r[1];return[0,2,4].map(n=>on(parseInt(t.slice(n,n+2),16)/255))}function lt(e){return`#${e.map(t=>{let n=st(Math.min(1,Math.max(0,t)));return Math.round(n*255).toString(16).padStart(2,"0")}).join("")}`}var oe={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},ut=Object.freeze(Object.fromEntries(Object.keys(oe).map(e=>[e,I(oe[e])])));var an=.4;var ct=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${an.toFixed(2)}); }`,dt=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function mt(){let e=[];for(let r of Object.keys(oe)){let t=oe[r].toLowerCase(),n=lt(ut[r]).toLowerCase();n!==t&&e.push({key:r,expected:t,actual:n})}return e}function Rr(e){let r=[1/0,1/0,1/0],t=[-1/0,-1/0,-1/0];for(let n=0;n<e.length;n+=3)for(let o=0;o<3;o++){let a=e[n+o];a<r[o]&&(r[o]=a),a>t[o]&&(t[o]=a)}return e.length===0?{min:[0,0,0],max:[0,0,0]}:{min:r,max:t}}function sn(e,r,t,n){let o=new Float32Array(e.length);for(let i=0;i<n.length;i+=3){let s=n[i],l=n[i+1],u=n[i+2],c=s*3,d=l*3,f=u*3,h=s*2,m=l*2,p=u*2,b=e[d]-e[c],x=e[d+1]-e[c+1],g=e[d+2]-e[c+2],E=e[f]-e[c],T=e[f+1]-e[c+1],R=e[f+2]-e[c+2],F=t[m]-t[h],D=t[m+1]-t[h+1],fe=t[p]-t[h],z=t[p+1]-t[h+1],G=F*z-fe*D;if(Math.abs(G)<1e-12)continue;let B=1/G,yr=(b*z-E*D)*B,xr=(x*z-T*D)*B,Er=(g*z-R*D)*B;for(let re of[c,d,f])o[re]=o[re]+yr,o[re+1]=o[re+1]+xr,o[re+2]=o[re+2]+Er}let a=new Float32Array(e.length);for(let i=0;i<a.length;i+=3){let s=r[i],l=r[i+1],u=r[i+2],c=o[i],d=o[i+1],f=o[i+2],h=c*s+d*l+f*u;c-=s*h,d-=l*h,f-=u*h;let m=Math.hypot(c,d,f);m<1e-8&&(Math.abs(s)<.9?(c=0,d=-u,f=l):(c=-u,d=0,f=s),m=Math.hypot(c,d,f)||1),a[i]=c/m,a[i+1]=d/m,a[i+2]=f/m}return a}function ln(e,r){let t=new Float32Array(e.length);for(let n=0;n<r.length;n+=3){let o=r[n]*3,a=r[n+1]*3,i=r[n+2]*3,s=e[a]-e[o],l=e[a+1]-e[o+1],u=e[a+2]-e[o+2],c=e[i]-e[o],d=e[i+1]-e[o+1],f=e[i+2]-e[o+2],h=l*f-u*d,m=u*c-s*f,p=s*d-l*c;for(let b of[o,a,i])t[b]=t[b]+h,t[b+1]=t[b+1]+m,t[b+2]=t[b+2]+p}for(let n=0;n<t.length;n+=3){let o=Math.hypot(t[n],t[n+1],t[n+2]);o>0&&(t[n]=t[n]/o,t[n+1]=t[n+1]/o,t[n+2]=t[n+2]/o)}return t}function _e(e,r,t,n,o){let{min:a,max:i}=Rr(e),s=n??ln(e,t);return{positions:e,normals:s,uvs:r,indices:t,min:a,max:i,tangents:o??sn(e,s,r,t)}}function ft(e=10,r=24){let t=Math.max(1,Math.floor(r)),n=(t+1)*(t+1),o=new Float32Array(n*3),a=new Float32Array(n*3),i=new Float32Array(n*2),s=new Uint16Array(t*t*6),l=0,u=0,c=0;for(let d=0;d<=t;d++)for(let f=0;f<=t;f++){let h=(f/t-.5)*e,m=(d/t-.5)*e;o[l]=h,o[l+1]=0,o[l+2]=m,a[l]=0,a[l+1]=1,a[l+2]=0,l+=3,i[u++]=f/t,i[u++]=d/t}for(let d=0;d<t;d++)for(let f=0;f<t;f++){let h=d*(t+1)+f,m=h+1,p=h+(t+1),b=p+1;s[c++]=h,s[c++]=p,s[c++]=m,s[c++]=m,s[c++]=p,s[c++]=b}return _e(o,i,s,a)}function De(e=.5,r=24,t=32){let n=Math.max(2,r),o=Math.max(3,t),a=(n+1)*(o+1),i=new Float32Array(a*3),s=new Float32Array(a*3),l=new Float32Array(a*2),u=new Uint16Array(n*o*6),c=0,d=0,f=0;for(let h=0;h<=n;h++){let m=h/n*Math.PI;for(let p=0;p<=o;p++){let b=p/o*Math.PI*2,x=Math.sin(m)*Math.cos(b),g=Math.cos(m),E=Math.sin(m)*Math.sin(b);i[c]=x*e,i[c+1]=g*e,i[c+2]=E*e,s[c]=x,s[c+1]=g,s[c+2]=E,c+=3,l[d++]=p/o,l[d++]=h/n}}for(let h=0;h<n;h++)for(let m=0;m<o;m++){let p=h*(o+1)+m,b=p+1,x=p+(o+1),g=x+1;u[f++]=p,u[f++]=b,u[f++]=x,u[f++]=b,u[f++]=g,u[f++]=x}return _e(i,l,u,s)}function Pe(e=.5,r=.2,t=64){let n=Math.max(3,t),o=r/2,a=[],i=[],s=[],l=[],u=[];for(let c=0;c<=n;c++){let d=c/n*Math.PI*2,f=Math.cos(d),h=Math.sin(d);a.push(f*e,o,h*e),i.push(f,0,h),s.push(c/n,1),u.push(-h,0,f),a.push(f*e,-o,h*e),i.push(f,0,h),s.push(c/n,0),u.push(-h,0,f)}for(let c=0;c<n;c++){let d=c*2,f=d+1,h=d+2,m=d+3;l.push(d,h,f,f,h,m)}for(let[c,d]of[[1,o],[-1,-o]]){let f=a.length/3;a.push(0,d,0),i.push(0,c,0),s.push(.5,.5),u.push(1,0,0);for(let h=0;h<=n;h++){let m=h/n*Math.PI*2,p=Math.cos(m),b=Math.sin(m);a.push(p*e,d,b*e),i.push(0,c,0),s.push(.5+p*.5,.5+b*.5),u.push(-b,0,p)}for(let h=0;h<n;h++){let m=f+1+h,p=f+2+h;c>0?l.push(f,p,m):l.push(f,m,p)}}return _e(new Float32Array(a),new Float32Array(s),new Uint16Array(l),new Float32Array(i),new Float32Array(u))}function Oe(e=.5,r=.08,t=64,n=24){let o=Math.max(3,t),a=Math.max(3,n),i=[],s=[],l=[],u=[],c=[];for(let d=0;d<=o;d++){let f=d/o*Math.PI*2,h=Math.cos(f),m=Math.sin(f);for(let p=0;p<=a;p++){let b=p/a*Math.PI*2,x=Math.cos(b),g=Math.sin(b);i.push((e+r*x)*h,r*g,(e+r*x)*m),s.push(h*x,g,m*x),l.push(d/o,p/a),c.push(-m,0,h)}}for(let d=0;d<o;d++)for(let f=0;f<a;f++){let h=d*(a+1)+f,m=h+1,p=h+(a+1),b=p+1;u.push(h,m,p,m,b,p)}return _e(new Float32Array(i),new Float32Array(l),new Uint16Array(u),new Float32Array(s),new Float32Array(c))}function H(e){return e.indices.length/3}function Ar(e){if(!Number.isFinite(e)||e===0)return"0";let r=e.toFixed(12).replace(/0+$/,"").replace(/\.$/,"");return r==="-0"?"0":r}function un(e,r,t,n){let[o,a]=e,[i,s]=r,[l,u]=t,[c,d]=n,f=o-i+l-c,h=a-s+u-d;if(Math.abs(f)<1e-9&&Math.abs(h)<1e-9){let R=[i-o,c-o,o,s-a,d-a,a,0,0,1],F=R[0]*R[4]-R[1]*R[3];return Math.abs(F)<1e-9?null:R}let m=i-l,p=c-l,b=s-u,x=d-u,g=m*x-p*b;if(Math.abs(g)<1e-9)return null;let E=(f*x-p*h)/g,T=(m*h-f*b)/g;return[i-o+E*i,c-o+T*c,o,s-a+E*s,d-a+T*d,a,E,T,1]}function Ie(e,r,t,n,o,a){if(!(o>0)||!(a>0))return{refusal:"EMPTY_ELEMENT_BOX"};let s=[r.topLeft,r.topRight,r.bottomRight,r.bottomLeft].map(B=>k(e,B,t,n));if(s.some(B=>B.behind))return{refusal:"CORNER_BEHIND_CAMERA"};let l=s.map(B=>({x:B.sx,y:B.sy})),[u,c,d,f]=l,h=un([u.x,u.y],[c.x,c.y],[d.x,d.y],[f.x,f.y]);if(!h)return{refusal:"DEGENERATE_ON_SCREEN"};let m=.5*(u.x*c.y-c.x*u.y+(c.x*d.y-d.x*c.y)+(d.x*f.y-f.x*d.y)+(f.x*u.y-u.x*f.y)),p=1/o,b=1/a,[x,g,E,T,R,F,D,fe,z]=h;return{transform:`matrix3d(${[x*p,T*p,0,D*p,g*b,R*b,0,fe*b,0,0,1,0,E,F,0,z].map(Ar).join(", ")})`,matrix:h,screen:l,signedArea:m}}function Ue(e){return"refusal"in e}var ht=["minimum","reduced","full"],Mr={full:{dprScale:2,ao:!0,aoScale:.5,dof:!0,shadowMapSize:1536,shadowTaps:9,particleCapacity:4096,volumeMaxSteps:128,volumeLightSteps:6},reduced:{dprScale:2,ao:!0,aoScale:.5,dof:!1,shadowMapSize:1024,shadowTaps:9,particleCapacity:2048,volumeMaxSteps:96,volumeLightSteps:4},minimum:{dprScale:1,ao:!1,aoScale:.5,dof:!1,shadowMapSize:512,shadowTaps:1,particleCapacity:512,volumeMaxSteps:48,volumeLightSteps:0}};function pt(e){return{tier:e,...Mr[e]}}var bt=89,gt=Math.PI/180;function ae(e){let r=Math.max(-bt,Math.min(bt,e.elevationDeg))*gt,t=e.azimuthDeg*gt,n=Math.max(1e-4,e.distance),o=Math.sin(r)*n,a=Math.cos(r)*n;return[e.target[0]+Math.sin(t)*a,e.target[1]+o,e.target[2]+Math.cos(t)*a]}function ie(e,r){let t=ae(e),n=e.near??Math.max(.01,e.distance/100),o=e.far??Math.max(n+1,e.distance*8),a=at((e.fovDeg??38)*gt,Math.max(.001,r),n,o),i=Ne(t,e.target,[0,1,0]);return we(a,i)}function yt(e,r,t){let n=he(e.direction),o=e.extent??Math.max(.1,t*1.35),a=Math.max(1,t*2),i=[r[0]-n[0]*a,r[1]-n[1]*a,r[2]-n[2]*a],s=Math.abs(n[1])>.99?[0,0,1]:[0,1,0],l=Ne(i,r,s),u=it(-o,o,-o,o,.01,a+t*2+o);return we(u,l)}function xt(e,r){let t=Le([r[0],r[1],r[2]],[e[0],e[1],e[2]]);return Math.hypot(t[0],t[1],t[2])/2}function Et(e,r){return[(e[0]+r[0])/2,(e[1]+r[1])/2,(e[2]+r[2])/2]}function Tt(e,r,t){let{gl:n}=e,o=Math.max(1,Math.floor(r)),a=Math.max(1,Math.floor(t)),i=n.createFramebuffer(),s=n.createTexture(),l=n.createTexture();if(!i||!s||!l)return P("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let u=e.hdr?n.RGBA16F:n.RGBA8,c=e.hdr?n.HALF_FLOAT:n.UNSIGNED_BYTE,d=()=>{n.bindTexture(n.TEXTURE_2D,s),n.texImage2D(n.TEXTURE_2D,0,u,o,a,0,n.RGBA,c,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.bindTexture(n.TEXTURE_2D,l),n.texImage2D(n.TEXTURE_2D,0,n.DEPTH_COMPONENT24,o,a,0,n.DEPTH_COMPONENT,n.UNSIGNED_INT,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.bindFramebuffer(n.FRAMEBUFFER,i),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,s,0),n.framebufferTexture2D(n.FRAMEBUFFER,n.DEPTH_ATTACHMENT,n.TEXTURE_2D,l,0),n.bindFramebuffer(n.FRAMEBUFFER,null)};d(),n.bindFramebuffer(n.FRAMEBUFFER,i);let f=n.checkFramebufferStatus(n.FRAMEBUFFER);return n.bindFramebuffer(n.FRAMEBUFFER,null),f!==n.FRAMEBUFFER_COMPLETE?P("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${f.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:s,depthTexture:l,get width(){return o},get height(){return a},bind(){n.bindFramebuffer(n.FRAMEBUFFER,i),n.viewport(0,0,o,a)},resize(h,m){let p=Math.max(1,Math.floor(h)),b=Math.max(1,Math.floor(m));p===o&&b===a||(o=p,a=b,d())},dispose(){n.deleteFramebuffer(i),n.deleteTexture(s),n.deleteTexture(l)}}}function Rt(e,r=1024){let{gl:t}=e,n=Math.max(256,Math.min(2048,Math.floor(r))),o=t.createFramebuffer(),a=t.createTexture();if(!o||!a)return P("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");t.bindTexture(t.TEXTURE_2D,a),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,n,n,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,o),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,a,0);let i=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),i!==t.FRAMEBUFFER_COMPLETE?P("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:n,bind(){t.bindFramebuffer(t.FRAMEBUFFER,o),t.viewport(0,0,n,n)},dispose(){t.deleteFramebuffer(o),t.deleteTexture(a)}}}var Mt=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,At={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function cn(e,r,t={}){let n=t.zenith??At.zenith,o=t.horizon??At.horizon,a=t.ground??At.ground;e.uniform3f(e.getUniformLocation(r,"uSkyZenith"),n[0],n[1],n[2]),e.uniform3f(e.getUniformLocation(r,"uSkyHorizon"),o[0],o[1],o[2]),e.uniform3f(e.getUniformLocation(r,"uSkyGround"),a[0],a[1],a[2])}var vo=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${Mt}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;var dn=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,St=`#version 300 es
precision highp float;
void main(){}`,Sr=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,mn=`#version 300 es
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
}`,fn=`#version 300 es
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
${Mt}

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
}`;function $(e,r){let{gl:t}=e,n=t.createVertexArray(),o=t.createBuffer(),a=t.createBuffer(),i=t.createBuffer(),s=t.createBuffer();return!n||!o||!a||!i||!s?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(t.bindVertexArray(n),t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,r.positions,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,a),t.bufferData(t.ARRAY_BUFFER,r.normals,t.STATIC_DRAW),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,i),t.bufferData(t.ARRAY_BUFFER,r.tangents,t.STATIC_DRAW),t.enableVertexAttribArray(2),t.vertexAttribPointer(2,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,s),t.bufferData(t.ELEMENT_ARRAY_BUFFER,r.indices,t.STATIC_DRAW),t.bindVertexArray(null),{vao:n,indexCount:r.indices.length,indexType:r.indices instanceof Uint32Array?t.UNSIGNED_INT:t.UNSIGNED_SHORT,dispose(){t.deleteVertexArray(n),t.deleteBuffer(o),t.deleteBuffer(a),t.deleteBuffer(i),t.deleteBuffer(s)}})}function Ft(e){let{gl:r}=e,t=e.compile(dn,St);if("kind"in t)return t;let n=e.compile(mn,fn);if("kind"in n)return n;let o=e.compile(Sr,St);if("kind"in o)return o;let a=(i,s)=>r.getUniformLocation(i,s);return{shadowPass(i,s,l,u){let c=u??(()=>{});l.bind(),c("shadow.bind"),r.clear(r.DEPTH_BUFFER_BIT),r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.FRONT),r.useProgram(t),c("useProgram(shadow)"),r.uniformMatrix4fv(a(t,"uLightVP"),!1,i),c("uLightVP");for(let d of s)r.uniformMatrix4fv(a(t,"uModel"),!1,d.model),c("shadow uModel"),r.bindVertexArray(d.mesh.vao),c("shadow bindVAO"),r.drawElements(r.TRIANGLES,d.mesh.indexCount,d.mesh.indexType,0),c("shadow drawElements");r.bindVertexArray(null),r.cullFace(r.BACK)},depthPrepass(i,s){r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.colorMask(!1,!1,!1,!1),r.useProgram(o),r.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let l of s)r.uniformMatrix4fv(a(o,"uModel"),!1,l.model),r.bindVertexArray(l.mesh.vao),r.drawElements(r.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0);r.bindVertexArray(null),r.colorMask(!0,!0,!0,!0)},draw(i){let s=i.onStep??(()=>{});if(r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.useProgram(n),r.uniformMatrix4fv(a(n,"uViewProj"),!1,i.viewProj),s("uViewProj"),r.uniform3fv(a(n,"uEye"),i.eye),s("uEye"),r.uniform3fv(a(n,"uLightDir"),i.lightDir),s("uLightDir"),r.uniform3fv(a(n,"uLightColour"),i.lightColour),s("uLightColour"),r.uniform1f(a(n,"uAmbientGain"),i.ambientGain??1),s("uAmbientGain"),i.fog&&i.fog.density>0){r.uniform1f(a(n,"uFogDensity"),i.fog.density),r.uniform1f(a(n,"uFogHeight"),i.fog.height),r.uniform1f(a(n,"uFogFloor"),i.fog.floor??0);let l=i.fog.colour;l==="sky"?r.uniform3f(a(n,"uFogColour"),-1,-1,-1):r.uniform3f(a(n,"uFogColour"),l[0],l[1],l[2]),s("fog")}else r.uniform1f(a(n,"uFogDensity"),0);cn(r,n,i.sky),s("bindSky"),i.ao&&i.screenSize?(r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,i.ao),r.uniform1i(a(n,"uAO"),1),r.uniform2f(a(n,"uScreenSize"),i.screenSize[0],i.screenSize[1]),r.uniform1f(a(n,"uAOEnabled"),1)):r.uniform1f(a(n,"uAOEnabled"),0),s("bindAO"),r.uniformMatrix4fv(a(n,"uLightVP"),!1,i.lightVP),s("lit uLightVP"),i.shadow?(r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,i.shadow.depthTexture),r.uniform1i(a(n,"uShadowMap"),0),r.uniform1f(a(n,"uShadowTexel"),1/i.shadow.size),r.uniform1f(a(n,"uShadowStrength"),i.shadowStrength??1)):r.uniform1f(a(n,"uShadowStrength"),0);for(let l of i.draws)r.uniformMatrix4fv(a(n,"uModel"),!1,l.model),r.uniformMatrix3fv(a(n,"uNormalMat"),!1,l.normalMat),s("uNormalMat"),r.uniform3fv(a(n,"uBaseColour"),l.material.baseColour),s("uBaseColour"),r.uniform1f(a(n,"uRoughness"),l.material.roughness),r.uniform1f(a(n,"uMetalness"),l.material.metalness),r.uniform1f(a(n,"uAnisotropy"),l.material.anisotropy??0),r.bindVertexArray(l.mesh.vao),s("lit bindVAO"),r.drawElements(r.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0),s("lit drawElements");r.bindVertexArray(null),r.disable(r.CULL_FACE)},dispose(){r.deleteProgram(t),r.deleteProgram(n),r.deleteProgram(o)}}}var vt=`
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
}`,hn=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Fr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${vt}

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
}`,vr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${vt}

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
}`;function wt(e,r,t){let{gl:n}=e,o=e.compile(hn,Fr);if("kind"in o)return o;let a=e.compile(hn,vr);if("kind"in a)return a;let i=Math.max(1,r>>1),s=Math.max(1,t>>1),l=()=>{let m=n.createFramebuffer(),p=n.createTexture();return!m||!p?null:{fb:m,tex:p}},u=l(),c=l();if(!u||!c)return P("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let d=()=>{for(let m of[u,c])n.bindTexture(n.TEXTURE_2D,m.tex),n.texImage2D(n.TEXTURE_2D,0,n.R8,i,s,0,n.RED,n.UNSIGNED_BYTE,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.bindFramebuffer(n.FRAMEBUFFER,m.fb),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,m.tex,0);n.bindFramebuffer(n.FRAMEBUFFER,null)};d(),n.bindFramebuffer(n.FRAMEBUFFER,u.fb);let f=n.checkFramebufferStatus(n.FRAMEBUFFER);if(n.bindFramebuffer(n.FRAMEBUFFER,null),f!==n.FRAMEBUFFER_COMPLETE)return P("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${f.toString(16)}).`);let h=(m,p,b,x,g,E,T)=>{n.activeTexture(n.TEXTURE0+T),n.bindTexture(n.TEXTURE_2D,p),n.uniform1i(n.getUniformLocation(m,"uDepth"),T),n.uniform2f(n.getUniformLocation(m,"uNearFar"),b,x),n.uniform1f(n.getUniformLocation(m,"uTanHalfFov"),Math.tan(g*Math.PI/360)),n.uniform1f(n.getUniformLocation(m,"uAspect"),E)};return{get texture(){return u.tex},get width(){return i},get height(){return s},compute(m){n.disable(n.DEPTH_TEST),n.depthMask(!1),n.disable(n.BLEND),n.disable(n.CULL_FACE),n.bindFramebuffer(n.FRAMEBUFFER,u.fb),n.viewport(0,0,i,s),n.useProgram(o),h(o,m.depthTexture,m.near,m.far,m.fovDeg,m.aspect,0),n.uniform2f(n.getUniformLocation(o,"uTexel"),1/i,1/s),n.uniform1f(n.getUniformLocation(o,"uRadius"),m.radius??.55),n.uniform1f(n.getUniformLocation(o,"uStrength"),m.strength??1.15),n.uniform1f(n.getUniformLocation(o,"uBias"),m.bias??.035),e.blit(o);for(let[p,b,x]of[[u,c,[1,0]],[c,u,[0,1]]])n.bindFramebuffer(n.FRAMEBUFFER,b.fb),n.viewport(0,0,i,s),n.useProgram(a),h(a,m.depthTexture,m.near,m.far,m.fovDeg,m.aspect,0),n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,p.tex),n.uniform1i(n.getUniformLocation(a,"uAO"),1),n.uniform2f(n.getUniformLocation(a,"uTexel"),1/i,1/s),n.uniform2f(n.getUniformLocation(a,"uDir"),x[0],x[1]),e.blit(a);n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,null),n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,null),n.bindFramebuffer(n.FRAMEBUFFER,null),n.depthMask(!0),n.enable(n.DEPTH_TEST)},resize(m,p){let b=Math.max(1,m>>1),x=Math.max(1,p>>1);b===i&&x===s||(i=b,s=x,d())},dispose(){n.deleteProgram(o),n.deleteProgram(a);for(let m of[u,c])n.deleteFramebuffer(m.fb),n.deleteTexture(m.tex)}}}var wr=`
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
`;function pn(e){let r=document.createElement("style");r.textContent=wr,document.head.appendChild(r);let t=document.createElement("section");t.id="lcx-fallback";let n=(o,a)=>{if(o===null)return`<td class="absent${a?" n":""}">absent</td>`;let i=String(o).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");return`<td class="${a?"n":""}">${i}</td>`};return t.innerHTML=`<h2>${e.title} \u2014 flat view</h2><p class="reads">${e.readsAs}</p>`+(e.notices??[]).map(o=>`<p class="notice">${o}</p>`).join("")+'<div id="lcx-refusal"></div>'+(e.html?`<div class="surface">${e.html}</div>`:"<table><thead><tr>"+e.columns.map(o=>`<th class="${o.numeric?"n":""}">${o.label}</th>`).join("")+"</tr></thead><tbody>"+e.rows.map(o=>"<tr>"+e.columns.map(a=>n(o[a.key]??null,!!a.numeric)).join("")+"</tr>").join("")+"</tbody></table>"),document.body.appendChild(t),{markRendered(){t.dataset.rendered="1"},showRefusal(o,a){let i=document.getElementById("lcx-refusal");i&&(i.innerHTML=`<p class="refusal"><strong>${o}</strong> \u2014 ${a} The measurements below are unaffected.</p>`),delete t.dataset.rendered;for(let s of Array.from(document.querySelectorAll("canvas")))s.style.display="none"}}}var Z=new URLSearchParams(location.search),Lr=ht.includes(Z.get("tier")??"")?Z.get("tier"):"full",pe=pt(Lr),He=Z.get("ao")!=="0"&&pe.ao,M=Z.get("flat")==="1",$e=Z.get("shadow")!=="0"&&!M,Ae=Math.max(1,Math.min(3,Number(Z.get("scale")??1))),Pn=Number(Z.get("frames")??300),L=1200*Ae,N=720*Ae,le=document.getElementById("c");le.width=L;le.height=N;var Nr=document.getElementById("log");function jt(e){document.title="REFUSED";let r=document.getElementById("log");r&&(r.textContent=e);let[t,...n]=e.split(":");throw On?.showRefusal(t?.trim()??"REFUSED",n.join(":").trim()||e),new Error(e)}var On=null;function O(e,r){return"kind"in r&&jt(`${e}: ${r.code} \u2014 ${r.reason} ${r.detail??""}`),r}var A="PROGRAMME",ue=[{id:A,kind:"CORE",thetaDeg:0,count:{state:"observed",records:9}},{id:"PARTNER",kind:"PARTY",thetaDeg:18,count:{state:"observed",records:412}},{id:"PERSON",kind:"PARTY",thetaDeg:128,count:{state:"observed",records:1940}},{id:"COUNTERPARTY",kind:"PARTY",thetaDeg:236,count:{state:"absent"}},{id:"LISTING",kind:"INSTRUMENT",thetaDeg:196,count:{state:"observed",records:128}},{id:"TOKEN",kind:"INSTRUMENT",thetaDeg:52,count:{state:"observed",records:64}},{id:"SETTLEMENT",kind:"INSTRUMENT",thetaDeg:300,count:{state:"observed",records:22806}},{id:"CAMPAIGN",kind:"EVENT",thetaDeg:258,count:{state:"observed",records:37}},{id:"QUEST",kind:"EVENT",thetaDeg:8,count:{state:"observed",records:1204}},{id:"COMPARTMENT",kind:"CONTROL",thetaDeg:270,count:{state:"withheld"}},{id:"JURISDICTION",kind:"CONTROL",thetaDeg:214,count:{state:"observed",records:31}}],Y=[{a:A,b:"PARTNER",strength:.92},{a:A,b:"LISTING",strength:.71},{a:A,b:"CAMPAIGN",strength:.64},{a:A,b:"COMPARTMENT",strength:.55},{a:"PARTNER",b:"PERSON",strength:.8},{a:"PARTNER",b:"COUNTERPARTY",strength:.34},{a:"LISTING",b:"TOKEN",strength:.88},{a:"TOKEN",b:"SETTLEMENT",strength:.76},{a:"CAMPAIGN",b:"QUEST",strength:.58},{a:"QUEST",b:"PERSON",strength:.41},{a:"JURISDICTION",b:"LISTING",strength:.67},{a:"SETTLEMENT",b:"COUNTERPARTY",strength:.29},{a:"JURISDICTION",b:"PERSON",strength:null}],In=pn({title:"E4 \xB7 The Orrery \u2014 ontology entities and couplings",readsAs:"The rendered view places each entity on an orbit whose radius is its distance from the core and whose inclination separates its kind, so coupling strength and grouping are read at once without crossing lines. These two lists carry every entity and every relationship, and none of that structure.",notices:["A SYNTHETIC ontology \u2014 the shape is deliberate, the counts are not measurements.","Absent (never measured) and withheld (measured, not shown) are separate states here, as in the render."],columns:[{key:"entity",label:"Entity"},{key:"kind",label:"Kind"},{key:"records",label:"Records",numeric:!0},{key:"couplings",label:"Couplings",numeric:!0}],rows:[...ue.map(e=>({entity:e.id,kind:e.kind,records:e.count.state==="observed"?e.count.records:e.count.state==="withheld"?"withheld":null,couplings:Y.filter(r=>r.a===e.id||r.b===e.id).length})),...Y.map(e=>({entity:`${e.a} \u2192 ${e.b}`,kind:"COUPLING",records:e.strength===null?null:e.strength.toFixed(2),couplings:""}))]});On=In;new URLSearchParams(location.search).get("refuse")==="1"&&jt("FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. The three-dimensional view is not being drawn.");var ke=rt(le,{alpha:!1});nt(ke)||jt(`stage: ${ke.code} \u2014 ${ke.reason}`);var _=ke,y=_.gl,_r=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Dr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${ct}
${dt}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,Pr=O("present",_.compile(_r,Dr)),Lt=O("lit",Ft(_)),Ce=O("target",Tt(_,L,N)),Ot=O("shadow",Rt(_,pe.shadowMapSize)),bn=O("ao",wt(_,L,N)),It=new Map(ue.map(e=>[e.id,[]]));for(let e of Y)It.get(e.a)?.push(e.b),It.get(e.b)?.push(e.a);var se=new Map([[A,0]]);for(let e=[A];e.length>0;){let r=[];for(let t of e)for(let n of It.get(t)??[])se.has(n)||(se.set(n,(se.get(t)??0)+1),r.push(n));e=r}var Or=ue.filter(e=>!se.has(e.id)).map(e=>e.id),X=Math.PI/180,j=e=>1+e*2.1,Me={CORE:{incDeg:0,nodeDeg:0},PARTY:{incDeg:0,nodeDeg:0},INSTRUMENT:{incDeg:34,nodeDeg:64},EVENT:{incDeg:-29,nodeDeg:-58},CONTROL:{incDeg:62,nodeDeg:118}};function ye(e,r,t,n){let o=r*X,a=t*X,i=n*X,s=e*Math.cos(o),l=e*Math.sin(o),u=-l*Math.sin(a),c=l*Math.cos(a);return[s*Math.cos(i)+c*Math.sin(i),u,-s*Math.sin(i)+c*Math.cos(i)]}function Ir(e,r){let t=e*X,n=r*X,o=Math.cos(t),a=Math.sin(t),i=Math.cos(n),s=Math.sin(n),l=new Float32Array([i,0,-s,s*a,o,i*a,s*o,-a,i*o]),u=Q();return u[0]=l[0],u[1]=l[1],u[2]=l[2],u[4]=l[3],u[5]=l[4],u[6]=l[5],u[8]=l[6],u[9]=l[7],u[10]=l[8],{model:u,normal:l}}var Un=.15,Cn=.115,Ur=e=>Un+Cn*Math.log10(Math.max(1,e)),Bn=.34,kn=.115,Vn=Bn+kn,Xt=.3,Cr=.44,Br=e=>e.state==="observed"?Ur(e.records):e.state==="absent"?Vn:Xt,v=ue.filter(e=>se.has(e.id)).map(e=>{let r=se.get(e.id),t=j(r),n=Me[e.kind];return{def:e,hops:r,shell:t,pos:e.id===A?[0,0,0]:ye(t,e.thetaDeg,n.incDeg,n.nodeDeg),flatPos:e.id===A?[0,0,0]:ye(t,e.thetaDeg,0,0),radius:Br(e.count)}}),ze=new Map(v.map(e=>[e.def.id,e])),Ke=Object.keys(Me).filter(e=>v.some(r=>r.def.kind===e&&r.def.id!==A)),qe=e=>M?e.flatPos:e.pos,Gn=Y.map(e=>e.strength).filter(e=>e!==null),xe=Math.min(...Gn),je=Math.max(...Gn),Ut=.026,Hn=.086,Wt=e=>Ut+(Hn-Ut)*((e-xe)/Math.max(1e-6,je-xe)),Ze=.052,$n=e=>Y.flatMap(r=>{let t=ze.get(r.a),n=ze.get(r.b);return!t||!n?[]:[{rel:r,aId:r.a,bId:r.b,a:e?t.flatPos:t.pos,b:e?n.flatPos:n.pos,r:r.strength===null?Ze:Wt(r.strength),dotted:r.strength===null}]}),J=$n(!1),ee=$n(!0),Ct=.5,Bt=90,gn=60,V=M?{target:[0,0,0],distance:22,azimuthDeg:gn,elevationDeg:89,fovDeg:36,near:Ct,far:Bt}:{target:[0,.4,0],distance:22,azimuthDeg:gn,elevationDeg:26,fovDeg:36,near:Ct,far:Bt},W=ae(V),Yt=V.fovDeg??36,w=L/Ae,S=N/Ae,Se=e=>S/2/(Math.max(.01,e)*Math.tan(Yt/2*X)),Je=e=>Math.hypot(e[0]-W[0],e[1]-W[1],e[2]-W[2]),K=(e,r)=>e[0]*r[0]+e[1]*r[1]+e[2]*r[2],U=(e,r)=>[e[0]-r[0],e[1]-r[1],e[2]-r[2]],C=e=>Math.hypot(e[0],e[1],e[2]),yn=(e,r,t)=>[e[0]+r[0]*t,e[1]+r[1]*t,e[2]+r[2]*t];function Xe(e,r,t,n){let o=U(r,e),a=U(n,t),i=U(e,t),s=K(o,o),l=K(a,a),u=K(a,i),c=0,d=0;if(s<=1e-12&&l<=1e-12)return{dist:C(i),c1:e,c2:t};if(s<=1e-12)d=Math.min(1,Math.max(0,u/l));else{let m=K(o,i);if(l<=1e-12)c=Math.min(1,Math.max(0,-m/s));else{let p=K(o,a),b=s*l-p*p;c=b>1e-12?Math.min(1,Math.max(0,(p*u-m*l)/b)):0,d=(p*c+u)/l,d<0?(d=0,c=Math.min(1,Math.max(0,-m/s))):d>1&&(d=1,c=Math.min(1,Math.max(0,(p-m)/s)))}}let f=yn(e,o,c),h=yn(t,a,d);return{dist:C(U(f,h)),c1:f,c2:h}}var Qt=e=>{let r=[];for(let t=0;t<e.length;t++)for(let n=t+1;n<e.length;n++){let o=e[t],a=e[n];o.aId===a.aId||o.aId===a.bId||o.bId===a.aId||o.bId===a.bId||r.push([o,a])}return r};function zn(e){let r=0,t=1/0,n=[];for(let[o,a]of Qt(e)){let i=Xe(o.a,o.b,a.a,a.b).dist;t=Math.min(t,i),i<o.r+a.r&&(r++,n.push(`${o.aId}~${o.bId} \xD7 ${a.aId}~${a.bId}`))}return{pairs:r,minSeparation:Number.isFinite(t)?t:0,worst:n}}function jn(e,r,t,n,o,a,i,s){let l=t-e,u=n-r,c=i-o,d=s-a,f=l*d-u*c;if(Math.abs(f)<1e-9)return null;let h=o-e,m=a-r,p=(h*d-m*c)/f,b=(h*u-m*l)/f;return p<=1e-6||p>=1-1e-6||b<=1e-6||b>=1-1e-6?null:{t:p,u:b}}function kr(e,r,t,n){let o=(()=>{let m=U(e.target,r),p=C(m)||1;return[m[0]/p,m[1]/p,m[2]/p]})(),a=(()=>{let m=[-o[2],0,o[0]],p=C(m)||1;return[m[0]/p,m[1]/p,m[2]/p]})(),i=[a[1]*o[2]-a[2]*o[1],a[2]*o[0]-a[0]*o[2],a[0]*o[1]-a[1]*o[0]],s=Math.tan(Yt/2*X),l=t/w*2-1,u=1-n/S*2,c=o[0]+a[0]*l*s*(w/S)+i[0]*u*s,d=o[1]+a[1]*l*s*(w/S)+i[1]*u*s,f=o[2]+a[2]*l*s*(w/S)+i[2]*u*s,h=Math.hypot(c,d,f)||1;return[c/h,d/h,f/h]}function Xn(e,r){let t=ae(r),n=ie(r,w/S),o=new Map;for(let l of e)o.set(l,{a:k(n,l.a,w,S),b:k(n,l.b,w,S)});let a=0,i=0,s=1/0;for(let[l,u]of Qt(e)){let c=o.get(l),d=o.get(u);if(c.a.behind||c.b.behind||d.a.behind||d.b.behind)continue;let f=jn(c.a.sx,c.a.sy,c.b.sx,c.b.sy,d.a.sx,d.a.sy,d.b.sx,d.b.sy);if(!f)continue;a++;let h=c.a.sx+(c.b.sx-c.a.sx)*f.t,m=c.a.sy+(c.b.sy-c.a.sy)*f.t,p=kr(r,t,h,m),b=[t[0]+p[0]*400,t[1]+p[1]*400,t[2]+p[2]*400],x=Xe(l.a,l.b,t,b).c1,g=Xe(u.a,u.b,t,b).c1,E=C(U(x,g));s=Math.min(s,E),E<l.r+u.r&&i++}return{total:a,ambiguous:i,minSep:Number.isFinite(s)?s:0}}function Wn(e){let r=ae(e),t=ie(e,w/S);return v.map(n=>{let o=qe(n),a=k(t,o,w,S),i=Math.hypot(o[0]-r[0],o[1]-r[1],o[2]-r[2]);return{id:n.def.id,cx:a.sx,cy:a.sy,r:n.radius*Se(i),behind:a.behind}})}function kt(e){let r=Wn(e),t=[];for(let n=0;n<r.length;n++)for(let o=n+1;o<r.length;o++){let a=r[n],i=r[o];if(a.behind||i.behind)continue;let s=Math.hypot(a.cx-i.cx,a.cy-i.cy)-(a.r+i.r);s<0&&t.push(`${a.id}/${i.id} overlap ${(-s).toFixed(1)}px`)}return t}function Yn(e){let r=0;for(let[t,n]of Qt(e))jn(t.a[0],t.a[2],t.b[0],t.b[2],n.a[0],n.a[2],n.b[0],n.b[2])&&r++;return r}function Be(e,r){let t=[];for(let n of e)for(let o of v){if(o.def.id===n.aId||o.def.id===n.bId)continue;let a=r?o.flatPos:o.pos;Xe(n.a,n.b,a,a).dist<o.radius+n.r&&t.push(`${n.aId}~${n.bId} through ${o.def.id}`)}return t}var Vr=performance.now(),Qn=12e4,Ve=1/0;{let e=ue.filter(o=>o.id!==A).map(o=>o.thetaDeg),r=ue.filter(o=>o.id!==A).map(o=>o.id),t=new Map([[A,[0,0,0]]]),n=e.slice();for(let o=0;o<Qn;o++){if(o>0)for(let s=n.length-1;s>0;s--){let l=Math.random()*(s+1)|0,u=n[s];n[s]=n[l],n[l]=u}for(let s=0;s<r.length;s++){let l=ze.get(r[s]);t.set(r[s],ye(l.shell,n[s],0,0))}let a=Y.flatMap(s=>{let l=t.get(s.a),u=t.get(s.b);return!l||!u?[]:[{rel:s,aId:s.a,bId:s.b,a:l,b:u,r:s.strength===null?Ze:Wt(s.strength),dotted:s.strength===null}]}),i=Yn(a);if(i<Ve&&(Ve=i),Ve===0)break}}var Gr=performance.now()-Vr,q=Yn(ee),Nt=zn(J),Vt=zn(ee),be=Xn(M?ee:J,V),ce=Array.from({length:36},(e,r)=>{let t={...V,azimuthDeg:r*10},n=Xn(J,t);return{azimuthDeg:r*10,total:n.total,ambiguous:n.ambiguous,mergedDiscs:kt(t).length}}),xn=Math.max(...ce.map(e=>e.ambiguous)),Hr=[Math.min(...ce.map(e=>e.total)),Math.max(...ce.map(e=>e.total))],$r=ce.filter(e=>e.mergedDiscs===0).map(e=>e.azimuthDeg),Kt=-2.6,Kn=ft(26,52),qn=De(1,22,30),Zn=De(Ze,10,14),Jn=Oe(Bn,kn,48,16),er=Pe(Xt,Cr,40),tr=Pe(1,1,16),nr=.032,rr=[1,2,3].map(e=>Oe(j(e),nr,96,8)),zr=O("deck",$(_,Kn)),jr=O("sphere",$(_,qn)),or=O("pip",$(_,Zn)),Xr=O("absent",$(_,Jn)),Wr=O("withheld",$(_,er)),ar=O("link",$(_,tr)),Yr=rr.map((e,r)=>O(`ring${r}`,$(_,e))),We=new Float32Array([1,0,0,0,1,0,0,0,1]),Ye=(e,r)=>{let t=Q();return t[0]=r,t[5]=r,t[10]=r,t[12]=e[0],t[13]=e[1],t[14]=e[2],t};function Qr(e,r,t){let n=U(r,e),o=C(n);if(o<1e-6)return null;let a=[n[0]/o,n[1]/o,n[2]/o],i=Math.abs(a[1])<.9?[0,1,0]:[1,0,0],s=[a[1]*i[2]-a[2]*i[1],a[2]*i[0]-a[0]*i[2],a[0]*i[1]-a[1]*i[0]],l=C(s)||1,u=[s[0]/l,s[1]/l,s[2]/l],c=[a[1]*u[2]-a[2]*u[1],a[2]*u[0]-a[0]*u[2],a[0]*u[1]-a[1]*u[0]],d=Q();d[0]=u[0]*t,d[1]=u[1]*t,d[2]=u[2]*t,d[4]=a[0]*o,d[5]=a[1]*o,d[6]=a[2]*o,d[8]=c[0]*t,d[9]=c[1]*t,d[10]=c[2]*t,d[12]=(e[0]+r[0])/2,d[13]=(e[1]+r[1])/2,d[14]=(e[2]+r[2])/2;let f=new Float32Array([u[0]/t,u[1]/t,u[2]/t,a[0]/o,a[1]/o,a[2]/o,c[0]/t,c[1]/t,c[2]/t]);return{model:d,normal:f}}function Kr(e,r){let t=U(r,e),n=C(t)||1,o=[t[0]/n,t[1]/n,t[2]/n],a=Math.abs(o[1])<.9?[0,1,0]:[1,0,0],i=[o[1]*a[2]-o[2]*a[1],o[2]*a[0]-o[0]*a[2],o[0]*a[1]-o[1]*a[0]],s=C(i)||1,l=[i[0]/s,i[1]/s,i[2]/s],u=[o[1]*l[2]-o[2]*l[1],o[2]*l[0]-o[0]*l[2],o[0]*l[1]-o[1]*l[0]],c=Q();return c[0]=l[0],c[1]=l[1],c[2]=l[2],c[4]=o[0],c[5]=o[1],c[6]=o[2],c[8]=u[0],c[9]=u[1],c[10]=u[2],c[12]=e[0],c[13]=e[1],c[14]=e[2],{model:c,normal:new Float32Array([l[0],l[1],l[2],o[0],o[1],o[2],u[0],u[1],u[2]])}}var ir="#2C6BFF",sr="#7FB2FF",Ee="#FF8A3D",lr="#6B7A99",qr="#22355E",Zr="#090F1C",Jr="#05070E",de=[{mesh:zr,model:Ye([0,Kt,0],1),normalMat:We,material:{baseColour:I(Zr),roughness:.9,metalness:0}}],ur=[],Qe=[],cr=0;for(let e of Ke)for(let r of[1,2,3]){if(!v.some(o=>o.def.kind===e&&o.hops===r&&o.def.id!==A))continue;if(M&&Qe.some(o=>o.hops===r)){cr++;continue}let t=Me[e],n=Ir(M?0:t.incDeg,M?0:t.nodeDeg);de.push({mesh:Yr[r-1],model:n.model,normalMat:n.normal,material:{baseColour:I(qr),roughness:.55,metalness:.2}}),Qe.push({kind:e,hops:r})}var Gt=(M?ee:J).flatMap(e=>{if(e.dotted){let t=C(U(e.b,e.a)),n=Math.max(3,Math.round(t/(Ze*4.2)));return Array.from({length:n-1},(o,a)=>{let i=(a+1)/n,s=[e.a[0]+(e.b[0]-e.a[0])*i,e.a[1]+(e.b[1]-e.a[1])*i,e.a[2]+(e.b[2]-e.a[2])*i];return{mesh:or,model:Ye(s,1),normalMat:We,material:{baseColour:I(Ee),roughness:.42,metalness:.1}}})}let r=Qr(e.a,e.b,e.r);return r?[{mesh:ar,model:r.model,normalMat:r.normal,material:{baseColour:I(sr),roughness:.34,metalness:.12}}]:[]});de.push(...Gt);for(let e of v){let r=qe(e),t=Kr(r,W),n=e.def.count.state==="absent"?{mesh:Xr,model:t.model,normalMat:t.normal,material:{baseColour:I(Ee),roughness:.52,metalness:.04}}:e.def.count.state==="withheld"?{mesh:Wr,model:Ye(r,1),normalMat:We,material:{baseColour:I(lr),roughness:.42,metalness:.15}}:{mesh:jr,model:Ye(r,e.radius),normalMat:We,material:{baseColour:I(ir),roughness:e.def.id===A?.22:.34,metalness:e.def.id===A?.36:.08}};de.push(n),ur.push(n)}var dr=[.14,-.966,-.22],En=[-8.2,Kt,-8.2],Tn=[8.2,5,8.2],Rn=yt({direction:dr,colour:[1,1,1],extent:10.5},Et(En,Tn),xt(En,Tn)),eo=H(Kn)+Qe.reduce((e,r)=>e+H(rr[r.hops-1]),0)+v.filter(e=>e.def.count.state==="observed").length*H(qn)+H(Jn)+H(er)+Gt.filter(e=>e.mesh===ar).length*H(tr)+Gt.filter(e=>e.mesh===or).length*H(Zn),ge=He;function Te(){let e=ie(V,L/N);$e&&Lt.shadowPass(Rn,ur,Ot),Ce.bind();let r=I(Jr);y.clearColor(r[0],r[1],r[2],1),y.clear(y.COLOR_BUFFER_BIT|y.DEPTH_BUFFER_BIT),Lt.depthPrepass(e,de),ge&&(bn.compute({depthTexture:Ce.depthTexture,near:Ct,far:Bt,fovDeg:Yt,aspect:L/N,radius:.9,strength:2}),Ce.bind()),Lt.draw({viewProj:e,eye:W,lightDir:dr,lightColour:[3.1,3.05,2.95],ambientGain:.52,lightVP:Rn,shadow:$e?Ot:null,shadowStrength:.92,draws:de,ao:ge?bn.texture:null,screenSize:[L,N],fog:null}),y.bindFramebuffer(y.FRAMEBUFFER,null),y.viewport(0,0,L,N),y.disable(y.DEPTH_TEST),y.activeTexture(y.TEXTURE0),y.bindTexture(y.TEXTURE_2D,Ce.texture),_.blit(Pr,t=>y.uniform1i(y.getUniformLocation(t,"uScene"),0))}function to(e){Te();let r=new Uint8Array(4);y.readPixels(0,0,1,1,y.RGBA,y.UNSIGNED_BYTE,r);let t=performance.now();for(let n=0;n<e;n++)Te();return y.readPixels(0,0,1,1,y.RGBA,y.UNSIGNED_BYTE,r),(performance.now()-t)/e}var Ht=to(Math.max(1,Pn));function no(){let e={maxDelta:0,changed:0,fraction:0,sampled:0,meanWith:0,meanWithout:0,glErrorInProbe:0};if(!He)return{...e,refusal:"AO_DISABLED_BY_PARAM"};if(!$e)return{...e,refusal:"AO_PROBE_REQUIRES_SHADOW_PASS"};let r=new Uint8Array(L*N*4),t=new Uint8Array(L*N*4);y.getError(),ge=!0,Te(),y.readPixels(0,0,L,N,y.RGBA,y.UNSIGNED_BYTE,r),ge=!1,Te(),y.readPixels(0,0,L,N,y.RGBA,y.UNSIGNED_BYTE,t);let n=y.getError();ge=He;let o=0,a=0;for(let u=0;u<r.length;u+=4)o+=r[u]+r[u+1]+r[u+2],a+=t[u]+t[u+1]+t[u+2];let i=0,s=0;for(let u=0;u<r.length;u+=4){let c=Math.abs(r[u]-t[u])+Math.abs(r[u+1]-t[u+1])+Math.abs(r[u+2]-t[u+2]);c>i&&(i=c),c>6&&s++}let l=L*N;return{maxDelta:i,changed:s,fraction:Number((s/l).toFixed(5)),sampled:l,meanWith:Number((o/(l*3)).toFixed(2)),meanWithout:Number((a/(l*3)).toFixed(2)),glErrorInProbe:n,refusal:null}}var ro=no(),Re=ie(V,L/N),Fe=document.createElement("div");Fe.style.cssText=`position:relative;overflow:hidden;width:${w}px;height:${S}px`;le.parentNode?.insertBefore(Fe,le);Fe.appendChild(le);var te=document.createElement("div");te.style.cssText="position:absolute;inset:0;pointer-events:none";Fe.appendChild(te);var mr=9,qt=(e,r)=>Math.max(0,Math.min(e.x+e.w,r.x+r.w)-Math.max(e.x,r.x))*Math.max(0,Math.min(e.y+e.h,r.y+r.h)-Math.max(e.y,r.y));function Zt(e){e.style.left="-99999px",e.style.top="0px",e.style.visibility="hidden",te.appendChild(e);let r=e.getBoundingClientRect();return{x:0,y:0,w:Math.ceil(r.width),h:Math.ceil(r.height)}}function Jt(e,r){e.style.left=`${r.x.toFixed(1)}px`,e.style.top=`${r.y.toFixed(1)}px`,e.style.visibility="visible"}var Ge={observed:v.filter(e=>e.def.count.state==="observed").length,absent:v.filter(e=>e.def.count.state==="absent").length,withheld:v.filter(e=>e.def.count.state==="withheld").length},et=document.createElement("div");et.style.cssText="position:absolute;left:18px;top:16px;display:flex;flex-direction:column;gap:7px";et.innerHTML=`<div style="font:600 11px/1 ui-monospace,monospace;letter-spacing:.16em;color:#8FB7FF">ONTOLOGY AS ORBITS \xB7 ${M?"FLAT CONTROL \u2014 INCLINATIONS ZEROED":"RADIUS = HOPS \xB7 SIZE = RECORDS \xB7 TUBE = STRENGTH"}</div><div style="font:400 10.5px/1.55 ui-monospace,monospace;color:rgba(196,212,240,0.84)">${M?`${q} CROSSINGS IN PLANE &nbsp;\xB7&nbsp; ${Vt.pairs} AMBIGUOUS (NO DEPTH TO RESOLVE THEM)`:`${be.total} CROSSINGS ON SCREEN &nbsp;\xB7&nbsp; ${be.ambiguous} AMBIGUOUS &nbsp;\xB7&nbsp; FLAT LAYOUT: ${q} OF ${q}`}<br>INCLINATION SEPARATES ${Ke.length} ENTITY KINDS &nbsp;\xB7&nbsp; ${v.length} ENTITIES, ${Y.length} RELATIONSHIPS</div><div style="font:500 10px/1.4 ui-monospace,monospace;color:#E0A94A">SYNTHETIC ONTOLOGY</div>`;te.appendChild(et);var oo=Je([0,0,0]),ao=Se(oo),tt=document.createElement("div");tt.style.cssText="position:absolute;right:18px;bottom:16px;display:flex;flex-direction:column;gap:7px;align-items:flex-end;font:500 10px/1 ui-monospace,monospace;color:rgba(196,212,240,0.85)";var _t=e=>{let r=Math.max(1,2*Wt(e)*ao);return`<div style="display:flex;align-items:center;gap:8px"><span>STRENGTH ${e.toFixed(2)}</span><span style="width:46px;height:${r.toFixed(1)}px;background:${sr};display:inline-block"></span></div>`};tt.innerHTML=_t(xe)+_t((xe+je)/2)+_t(je)+`<div style="display:flex;align-items:center;gap:8px"><span>STRENGTH NEVER MEASURED</span><span style="width:46px;display:inline-flex;gap:3px;justify-content:space-between">${('<span style="width:5px;height:5px;border-radius:50%;background:'+Ee+'"></span>').repeat(5)}</span></div><div style="height:4px"></div><div style="display:flex;align-items:center;gap:8px"><span>RECORDS OBSERVED \xB7 ${Ge.observed}</span><span style="width:11px;height:11px;border-radius:50%;background:${ir};display:inline-block"></span></div><div style="display:flex;align-items:center;gap:8px"><span>RECORDS ABSENT \xB7 ${Ge.absent} (RING \u2014 NOT ON THE SIZE SCALE)</span><span style="width:11px;height:11px;border-radius:50%;border:3px solid ${Ee};box-sizing:border-box;display:inline-block"></span></div><div style="display:flex;align-items:center;gap:8px"><span>WITHHELD \xB7 ${Ge.withheld} (DRUM \u2014 PRESENT, UNLABELLED)</span><span style="width:11px;height:11px;background:${lr};display:inline-block"></span></div>`;te.appendChild(tt);var An=e=>{let r=e.getBoundingClientRect(),t=Fe.getBoundingClientRect();return{x:r.left-t.left,y:r.top-t.top,w:r.width,h:r.height}},me=[An(et),An(tt)],io=Wn(V).map(e=>({id:e.id,behind:e.behind,box:{x:e.cx-e.r,y:e.cy-e.r,w:2*e.r,h:2*e.r}})),so=.12,fr=(e,r)=>io.some(t=>t.id!==r&&!t.behind&&qt(e,t.box)>so*Math.max(1,t.box.w*t.box.h)),en=e=>e.x>=2&&e.y>=2&&e.x+e.w<=w-2&&e.y+e.h<=S-2,hr=(e,r)=>en(e)&&!me.some(t=>qt(t,e)>0)&&!fr(e,r),Mn=10.4,Sn=2.4,Fn=4.6,pr='<div style="font:600 12px/1.1 ui-monospace,monospace;letter-spacing:.16em;color:rgba(143,183,255,0.90)">REFERENCE PLANE \xB7 INCLINATION 0</div><div style="font:400 11px/1.2 ui-monospace,monospace;color:rgba(196,212,240,0.66)">'+(M?`THE FLAT DIAGRAM LIVES HERE \xB7 ${q} CROSSINGS, ALL AMBIGUOUS`:`WHAT A FLAT DIAGRAM HAS TO FIT INTO \xB7 ${q} CROSSINGS`)+"</div>",vn=(()=>{let e=V.azimuthDeg*X,r=[Math.cos(e),0,-Math.sin(e)],t=[Math.sin(e),0,Math.cos(e)],n=Kt+.03,o=[t[0]*Fn,n,t[2]*Fn],a=(i,s)=>[o[0]+r[0]*i*Mn/2+t[0]*s*Sn/2,n,o[2]+r[2]*i*Mn/2+t[2]*s*Sn/2];return{topLeft:a(-1,-1),topRight:a(1,-1),bottomRight:a(1,1),bottomLeft:a(-1,1)}})();function wn(){let e=document.createElement("div");e.style.cssText="position:absolute;left:18px;bottom:16px;display:flex;flex-direction:column;gap:3px",e.innerHTML=pr,te.appendChild(e)}var lo=(()=>{let e=Ie(Re,vn,w,S,100,40);if(Ue(e))return wn(),{mode:"screen",reason:e.refusal,widthPx:0,heightPx:0,signedArea:0};let r=e.screen,t=(d,f)=>Math.hypot(r[d].x-r[f].x,r[d].y-r[f].y),n=Math.round((t(0,1)+t(3,2))/2),o=Math.round((t(0,3)+t(1,2))/2),a=r.map(d=>d.x),i=r.map(d=>d.y),s={x:Math.min(...a),y:Math.min(...i),w:Math.max(...a)-Math.min(...a),h:Math.max(...i)-Math.min(...i)},l=d=>(wn(),{mode:"screen",reason:d,widthPx:n,heightPx:o,signedArea:Math.round(e.signedArea)});if(e.signedArea<=0)return l("BACK_FACING");if(n<26||o<26)return l("BELOW_26PX");if(!en(s))return l("OFF_FRAME");let u=Ie(Re,vn,w,S,n,o);if(Ue(u))return l(u.refusal);let c=document.createElement("div");return c.style.cssText=`position:absolute;left:0;top:0;width:${n}px;height:${o}px;transform-origin:0 0;transform:${u.transform};display:flex;flex-direction:column;justify-content:center;align-items:center;gap:3px;overflow:hidden`,c.innerHTML=pr,te.appendChild(c),me.push(s),{mode:"projected",reason:null,widthPx:n,heightPx:o,signedArea:Math.round(e.signedArea)}})(),uo=[0,22,-22,48,-48,74,-74,120,-120,160],Ln=Ke.map(e=>{let r=Math.max(...v.filter(i=>i.def.kind===e&&i.def.id!==A).map(i=>i.hops)),t=Me[e],n=j(r),o=document.createElement("div");o.style.cssText="position:absolute;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;font:600 9.5px/1.25 ui-monospace,monospace;letter-spacing:.14em;color:rgba(127,178,255,0.82);text-shadow:0 1px 3px rgba(0,0,0,0.95)",o.innerHTML=`<span style="width:5px;height:5px;border-radius:50%;background:rgba(127,178,255,0.9);flex:0 0 auto"></span><span>${e} ${M?0:t.incDeg}\xB0</span>`;let a=Zt(o);for(let i of uo){let s=ye(n,i,M?0:t.incDeg,M?0:t.nodeDeg),l=k(Re,s,w,S);if(l.behind)continue;let u={x:l.sx-2.5,y:l.sy-a.h/2,w:a.w,h:a.h};if(hr(u,null))return Jt(o,u),me.push(u),{kind:e,incDeg:M?0:t.incDeg,thetaDeg:i,sx:Math.round(l.sx),sy:Math.round(l.sy),onFrame:!0}}return o.remove(),{kind:e,incDeg:M?0:t.incDeg,thetaDeg:null,sx:0,sy:0,onFrame:!1}}),co=[152,205,118,250,90,20],Nn=[1,2,3].map(e=>{let r=document.createElement("div");r.style.cssText="position:absolute;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;font:500 9.5px/1.25 ui-monospace,monospace;letter-spacing:.1em;color:rgba(196,212,240,0.70);text-shadow:0 1px 3px rgba(0,0,0,0.95)",r.innerHTML=`<span style="width:5px;height:5px;border-radius:50%;background:rgba(196,212,240,0.8);flex:0 0 auto"></span><span>${e} HOP${e>1?"S":""}</span>`;let t=Zt(r);for(let n of co){let o=ye(j(e),n,0,0),a=k(Re,o,w,S);if(a.behind)continue;let i={x:a.sx-2.5,y:a.sy-t.h/2,w:t.w,h:t.h};if(hr(i,null))return Jt(r,i),me.push(i),{hops:e,thetaDeg:n,sx:Math.round(a.sx),sy:Math.round(a.sy),onFrame:!0}}return r.remove(),{hops:e,thetaDeg:null,sx:0,sy:0,onFrame:!1}}),$t=v.map(e=>{let r=qe(e),t=Je(r),n=k(Re,r,w,S),o=2*e.radius*Se(t),a=e.def.count.state==="observed"?`${e.hops===0?"CORE":`${e.hops} HOP${e.hops>1?"S":""}`} \xB7 ${e.def.count.records.toLocaleString("en-US")} REC`:e.def.count.state==="absent"?`${e.hops} HOPS \xB7 RECORDS ABSENT`:"";return{b:e,p:r,dist:t,anchor:n,bodyPx:o,meta:a}}),mo=[...$t].sort((e,r)=>e.dist-r.dist).map(e=>{let r=e.b.def.count.state==="withheld",t=e.anchor.behind||e.anchor.sx<0||e.anchor.sx>w||e.anchor.sy<0||e.anchor.sy>S,n=e.bodyPx<mr,o=(()=>{if(e.b.def.id===A)return!1;let h=ze.get(A),m=qe(h),p=U(e.p,W),b=C(p)||1,x=[p[0]/b,p[1]/b,p[2]/b],g=U(m,W),E=K(g,x);return E<=0||E>=b?!1:K(g,g)-E*E<h.radius*h.radius})();if(r||t||n||o)return{s:e,shown:!1,placement:null,tried:0,reason:r?"WITHHELD":t?"ANCHOR_OFF_FRAME":o?"BEHIND_CORE":"BODY_BELOW_9PX",blocked:{offFrame:0,collision:0,coversBody:0}};let a=document.createElement("div");a.style.cssText="position:absolute;display:inline-flex;flex-direction:column;gap:2px;align-items:center;text-align:center;white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,0.95);-webkit-font-smoothing:antialiased";let i=e.b.def.count.state==="absent"?Ee:"rgba(196,212,240,0.80)";a.innerHTML=`<div style="font:700 11px/1.1 ui-monospace,monospace;color:#fff;letter-spacing:.02em">${e.b.def.id}</div><div style="font:500 9.5px/1.15 ui-monospace,monospace;letter-spacing:.08em;color:${i}">${e.meta}</div>`;let s=Zt(a),l=6,u=9,c=[["above",{x:e.anchor.sx-s.w/2,y:e.anchor.sy-e.bodyPx/2-l-s.h,w:s.w,h:s.h}],["below",{x:e.anchor.sx-s.w/2,y:e.anchor.sy+e.bodyPx/2+l,w:s.w,h:s.h}],["right",{x:e.anchor.sx+e.bodyPx/2+u,y:e.anchor.sy-s.h/2,w:s.w,h:s.h}],["left",{x:e.anchor.sx-e.bodyPx/2-u-s.w,y:e.anchor.sy-s.h/2,w:s.w,h:s.h}]],d={offFrame:0,collision:0,coversBody:0};for(let[h,m]of c){if(!en(m)){d.offFrame++;continue}if(me.some(p=>qt(p,m)>0)){d.collision++;continue}if(fr(m,e.b.def.id)){d.coversBody++;continue}return Jt(a,m),me.push(m),{s:e,shown:!0,placement:h,tried:c.length,reason:null,blocked:d}}a.remove();let f=d.collision>=d.coversBody&&d.collision>=d.offFrame?"LABEL_COLLISION":d.coversBody>=d.offFrame?"WOULD_COVER_A_BODY":"NO_PLACEMENT_ON_FRAME";return{s:e,shown:!1,placement:null,tried:c.length,reason:f,blocked:d}}),br=(M?ee:J).map(e=>{let r=[(e.a[0]+e.b[0])/2,(e.a[1]+e.b[1])/2,(e.a[2]+e.b[2])/2];return{edge:`${e.aId}~${e.bId}`,strength:e.rel.strength,radius:Number(e.r.toFixed(4)),px:Number((2*e.r*Se(Je(r))).toFixed(2)),dotted:e.dotted}}),Dt=br.filter(e=>!e.dotted).map(e=>e.px),Pt=mo.map(({s:e,shown:r,placement:t,reason:n,blocked:o})=>({id:e.b.def.id,kind:e.b.def.kind,hops:e.b.hops,countState:e.b.def.count.state,records:e.b.def.count.state==="observed"?e.b.def.count.records:null,radius:Number(e.b.radius.toFixed(3)),bodyPx:Number(e.bodyPx.toFixed(1)),distance:Number(e.dist.toFixed(2)),labelShown:r,labelPlacement:t,labelHiddenBecause:n,labelBlockedBy:r?null:o})),zt=mt();if(zt.length>0){let e="BRAND FIDELITY FAILED \u2014 "+zt.map(t=>`${t.key}: expected ${t.expected}, got ${t.actual}`).join("; ");document.title="REFUSED";let r=document.getElementById("log");throw r&&(r.textContent=e),new Error(e)}var ne={tier:pe.tier,tierDprScale:pe.dprScale,tierShadowMapSize:pe.shadowMapSize,brandFidelity:zt,layout:M?"flat":"orrery",ao:He,aoEffect:ro,shadow:$e,hdr:_.hdr,eye:W.map(e=>Number(e.toFixed(2))),entities:v.length,relationships:Y.length,unreachableEntities:Or,hopsPerEntity:Object.fromEntries(v.map(e=>[e.def.id,e.hops])),shellRadii:{1:j(1),2:j(2),3:j(3)},inclinationsByKind:Object.fromEntries(Ke.map(e=>[e,Me[e].incDeg])),ringsDrawn:Qe.length,ringsCollapsedOntoAnother:cr,crossings:{flatInPlane:q,flatAmbiguous:Vt.pairs,flatMinSeparationM:Number(Vt.minSeparation.toFixed(4)),flatBestOverOrderings:Ve,orderingsTried:Qn,orderingSearchMs:Number(Gr.toFixed(1)),grazingPairs3D:Nt.pairs,grazingPairs3DDetail:Nt.worst,minSeparation3DM:Number(Nt.minSeparation.toFixed(4)),atThisCamera:{total:be.total,ambiguous:be.ambiguous,minSepM:Number(be.minSep.toFixed(3))},sweepAzimuths:ce.length,sweepScreenCrossings:Hr,sweepWorstAmbiguous:xn,ambiguousCrossingsAvoided:q-xn},linksThroughBodies:{orrery:Be(J,!1).length,flat:Be(ee,!0).length,orreryDetail:Be(J,!1),flatDetail:Be(ee,!0)},countStates:Ge,sizeScale:{base:Un,perDecade:Cn,observedRange:[Number(Math.min(...v.filter(e=>e.def.count.state==="observed").map(e=>e.radius)).toFixed(3)),Number(Math.max(...v.filter(e=>e.def.count.state==="observed").map(e=>e.radius)).toFixed(3))],absentOuter:Vn,withheldOuter:Xt},bodyPx:{min:Number(Math.min(...$t.map(e=>e.bodyPx)).toFixed(1)),max:Number(Math.max(...$t.map(e=>e.bodyPx)).toFixed(1)),floor:mr},bodyOverlapsOnScreen:{pairs:kt(V).length,detail:kt(V)},cleanAzimuths:$r,strengthScale:{min:xe,max:je,radiusMin:Ut,radiusMax:Hn},ringPx:Number((2*nr*Se(Je([0,0,-j(3)]))).toFixed(2)),linkPx:{thinnest:Math.min(...Dt),thickest:Math.max(...Dt)},strengthLegible:Math.min(...Dt)>=1.5,labelsShown:Pt.filter(e=>e.labelShown).length,labelsHiddenBy:Pt.filter(e=>!e.labelShown).reduce((e,r)=>{let t=r.labelHiddenBecause??"UNKNOWN";return e[t]=(e[t]??0)+1,e},{}),plate:lo,planeTicks:Ln,planeTicksOffFrame:Ln.filter(e=>!e.onFrame).length,hopTicks:Nn,hopTicksOffFrame:Nn.filter(e=>!e.onFrame).length,perEntity:Pt,perLink:br,sweepDetail:ce,glError:y.getError(),triangles:eo,drawCalls:de.length,shadowMap:Ot.size,resolution:`${L}x${N}`,dprScale:Ae,frames:Pn,msPerFrame:Number(Ht.toFixed(3)),fps:Math.round(1e3/Ht),renderer:"",rendererClass:"",headroom:null,headroomRefusal:null,hardwareMsPerFrame:null},gr=(()=>{let e=y.getExtension("WEBGL_debug_renderer_info");return e?String(y.getParameter(e.UNMASKED_RENDERER_WEBGL)):"unknown"})(),tn=/swiftshader|llvmpipe|software/i.test(gr);ne.renderer=gr;ne.rendererClass=tn?"software":"hardware";ne.headroom=tn?null:Number((16.6-Ht).toFixed(3));ne.headroomRefusal=tn?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null;ne.hardwareMsPerFrame=null;globalThis.E4=ne;var{perEntity:_n,perLink:Dn,planeTicks:ya,hopTicks:xa,sweepDetail:Ea,...fo}=ne;Nr.textContent=JSON.stringify(fo,null,2)+`

perEntity (${_n.length}, full detail on globalThis.E4):
`+_n.map(e=>`  ${e.id.padEnd(13)} ${e.kind.padEnd(11)} h${e.hops} ${e.countState.padEnd(9)} r ${e.radius.toFixed(2)} ${String(e.bodyPx).padStart(5)}px ${String(e.distance).padStart(6)}m ${e.labelShown?"LABEL":`no label: ${e.labelHiddenBecause}`}`).join(`
`)+`

perLink (${Dn.length}):
`+Dn.map(e=>`  ${e.edge.padEnd(28)} s ${e.strength===null?"ABSENT":e.strength.toFixed(2)} r ${e.radius.toFixed(3)} ${String(e.px).padStart(5)}px${e.dotted?" (pips)":""}`).join(`
`);Te();In.markRendered();document.title="READY";

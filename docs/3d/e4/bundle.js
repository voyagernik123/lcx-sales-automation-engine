var gn={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected.",FEEDBACK_LOOP:"A layer of this view was asked to read the surface it draws into, which every driver refuses, so the layer is not being drawn. This is a defect in the renderer, not in the data."};function O(e,n){return n===void 0?{kind:"refused",code:e,reason:gn[e]}:{kind:"refused",code:e,reason:gn[e],detail:n}}var Gr=3,Vr=24e5;function mt(e){return e.kind==="stage"}function ft(e,n={}){let t=e.getContext("webgl2",{antialias:n.antialias??!1,alpha:n.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!t)return O("NO_WEBGL2");let r=t.getExtension("EXT_color_buffer_float"),o=e.width,a=e.height,s=r?t.RGBA16F:t.RGBA8,i=r?t.HALF_FLOAT:t.UNSIGNED_BYTE,u=(g,T)=>{let S=t.createTexture();t.bindTexture(t.TEXTURE_2D,S),t.texImage2D(t.TEXTURE_2D,0,s,g,T,0,t.RGBA,i,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);let E=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,E),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,S,0);let F=t.checkFramebufferStatus(t.FRAMEBUFFER);return F!==t.FRAMEBUFFER_COMPLETE?O("FRAMEBUFFER_INCOMPLETE",`status 0x${F.toString(16)} at ${g}\xD7${T}`):{texture:S,framebuffer:E,width:g,height:T}},l=n.bloomShift??2,c={w:o,h:a},d=(g,T)=>Math.max(T,Math.ceil(Math.max(1,g)/256)*256),f=(g,T)=>{let S=d(g,1024),E=d(T,512);return{scene:u(S,E),bloomA:u(Math.max(1,S>>l),Math.max(1,E>>l)),bloomB:u(Math.max(1,S>>l),Math.max(1,E>>l)),texels:S*E}},h=g=>{for(let T of[g.scene,g.bloomA,g.bloomB])"kind"in T||(t.deleteFramebuffer(T.framebuffer),t.deleteTexture(T.texture))},p=new Map,m=`${o}x${a}`,b=f(o,a);for(let g of[b.scene,b.bloomA,b.bloomB])if("kind"in g)return h(b),g;p.set(m,b);let y=()=>{let g=p.size-1,T=0;for(let[S,E]of p)S!==m&&(T+=E.texels);for(let[S,E]of p){if(g<=Gr&&T<=Vr)return;S!==m&&(p.delete(S),h(E),g-=1,T-=E.texels)}},x=t.createVertexArray();t.bindVertexArray(x);let A=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,A),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null);let C=[];return{kind:"stage",gl:t,cssWidth:e.clientWidth||o,cssHeight:e.clientHeight||a,hdr:!!r,get width(){return c.w},get height(){return c.h},get scene(){return b.scene},get bloomA(){return b.bloomA},get bloomB(){return b.bloomB},setRegion(g,T){let S=Math.max(1,Math.round(g)),E=Math.max(1,Math.round(T));if(S===c.w&&E===c.h)return;c={w:S,h:E};let F=`${S}x${E}`,M=p.get(F);if(M){p.delete(F),p.set(F,M),b=M,m=F;return}b=f(S,E),m=F,p.set(F,b),y()},compile(g,T){let S=(xe,dt)=>{let j=t.createShader(xe);if(t.shaderSource(j,dt),t.compileShader(j),!t.getShaderParameter(j,t.COMPILE_STATUS)){let X=t.getShaderInfoLog(j)??"(no log)";return t.deleteShader(j),O("SHADER_COMPILE_FAILED",X)}return j},E=S(t.VERTEX_SHADER,g);if(typeof E=="object"&&"kind"in E)return E;let F=S(t.FRAGMENT_SHADER,T);if(typeof F=="object"&&"kind"in F)return t.deleteShader(E),F;let M=t.createProgram();if(t.attachShader(M,E),t.attachShader(M,F),t.linkProgram(M),!t.getProgramParameter(M,t.LINK_STATUS)){let xe=t.getProgramInfoLog(M)??"(no log)";return t.deleteShader(E),t.deleteShader(F),t.deleteProgram(M),O("PROGRAM_LINK_FAILED",xe)}return t.detachShader(M,E),t.detachShader(M,F),t.deleteShader(E),t.deleteShader(F),C.push(M),M},bindTarget(g){t.bindFramebuffer(t.FRAMEBUFFER,g?g.framebuffer:null),t.viewport(0,0,g?g.width:c.w,g?g.height:c.h)},blit(g,T){t.useProgram(g),t.bindVertexArray(x),T?.(g),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null)},dispose(){for(let T of C)t.deleteProgram(T);for(let T of p.values())h(T);if(p.clear(),t.deleteBuffer(A),t.deleteVertexArray(x),e.isConnected)return;let g=t.getExtension("WEBGL_lose_context");g!==null&&typeof g.loseContext=="function"&&g.loseContext()}}}var Z=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function Pe(e,n){let t=new Float32Array(16);for(let r=0;r<4;r++)for(let o=0;o<4;o++){let a=0;for(let s=0;s<4;s++)a+=e[s*4+o]*n[r*4+s];t[r*4+o]=a}return t}var Ie=(e,n)=>[e[0]-n[0],e[1]-n[1],e[2]-n[2]],De=(e,n)=>e[0]*n[0]+e[1]*n[1]+e[2]*n[2],ht=(e,n)=>[e[1]*n[2]-e[2]*n[1],e[2]*n[0]-e[0]*n[2],e[0]*n[1]-e[1]*n[0]];function ye(e){let n=Math.hypot(e[0],e[1],e[2]);return n===0?e:[e[0]/n,e[1]/n,e[2]/n]}function pt(e,n,t,r){let o=1/Math.tan(e/2);return new Float32Array([o/n,0,0,0,0,o,0,0,0,0,(r+t)/(t-r),-1,0,0,2*r*t/(t-r),0])}function bt(e,n,t,r,o,a){let s=n-e,i=r-t,u=a-o;return new Float32Array([2/s,0,0,0,0,2/i,0,0,0,0,-2/u,0,-(n+e)/s,-(r+t)/i,-(a+o)/u,1])}function Oe(e,n,t){let r=ye(Ie(e,n)),o=ht(t,r);if(Math.hypot(o[0],o[1],o[2])<1e-8)return Z();let a=ye(o),s=ht(r,a);return new Float32Array([a[0],s[0],r[0],0,a[1],s[1],r[1],0,a[2],s[2],r[2],0,-De(a,e),-De(s,e),-De(r,e),1])}function xn(e,n){let t=[0,1,2,3].map(o=>e[0+o]*n[0]+e[4+o]*n[1]+e[8+o]*n[2]+e[12+o]),r=t[3];return{x:t[0]/r,y:t[1]/r,z:t[2]/r,w:r}}function H(e,n,t,r){let o=xn(e,n);return{sx:(o.x*.5+.5)*t,sy:(1-(o.y*.5+.5))*r,behind:o.w<=0}}function yn(e){return e<=.04045?e/12.92:Math.pow((e+.055)/1.055,2.4)}function gt(e){return e<=.0031308?e*12.92:1.055*Math.pow(e,1/2.4)-.055}var Hr=/^#?([0-9a-fA-F]{6})$/;function k(e){let n=Hr.exec(e.trim());if(!n)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(e)}`);let t=n[1];return[0,2,4].map(r=>yn(parseInt(t.slice(r,r+2),16)/255))}function xt(e){return`#${e.map(t=>{let r=gt(Math.min(1,Math.max(0,t)));return Math.round(r*255).toString(16).padStart(2,"0")}).join("")}`}var se={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},yt=Object.freeze(Object.fromEntries(Object.keys(se).map(e=>[e,k(se[e])])));var En=.4;var Et=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${En.toFixed(2)}); }`,Tt=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function Rt(){let e=[];for(let n of Object.keys(se)){let t=se[n].toLowerCase(),r=xt(yt[n]).toLowerCase();r!==t&&e.push({key:n,expected:t,actual:r})}return e}function $r(e){let n=[1/0,1/0,1/0],t=[-1/0,-1/0,-1/0];for(let r=0;r<e.length;r+=3)for(let o=0;o<3;o++){let a=e[r+o];a<n[o]&&(n[o]=a),a>t[o]&&(t[o]=a)}return e.length===0?{min:[0,0,0],max:[0,0,0]}:{min:n,max:t}}function Tn(e,n,t,r){let o=new Float32Array(e.length);for(let s=0;s<r.length;s+=3){let i=r[s],u=r[s+1],l=r[s+2],c=i*3,d=u*3,f=l*3,h=i*2,p=u*2,m=l*2,b=e[d]-e[c],y=e[d+1]-e[c+1],x=e[d+2]-e[c+2],A=e[f]-e[c],C=e[f+1]-e[c+1],B=e[f+2]-e[c+2],g=t[p]-t[h],T=t[p+1]-t[h+1],S=t[m]-t[h],E=t[m+1]-t[h+1],F=g*E-S*T;if(Math.abs(F)<1e-12)continue;let M=1/F,xe=(b*E-A*T)*M,dt=(y*E-C*T)*M,j=(x*E-B*T)*M;for(let X of[c,d,f])o[X]=o[X]+xe,o[X+1]=o[X+1]+dt,o[X+2]=o[X+2]+j}let a=new Float32Array(e.length);for(let s=0;s<a.length;s+=3){let i=n[s],u=n[s+1],l=n[s+2],c=o[s],d=o[s+1],f=o[s+2],h=c*i+d*u+f*l;c-=i*h,d-=u*h,f-=l*h;let p=Math.hypot(c,d,f);p<1e-8&&(Math.abs(i)<.9?(c=0,d=-l,f=u):(c=-l,d=0,f=i),p=Math.hypot(c,d,f)||1),a[s]=c/p,a[s+1]=d/p,a[s+2]=f/p}return a}function Rn(e,n){let t=new Float32Array(e.length);for(let r=0;r<n.length;r+=3){let o=n[r]*3,a=n[r+1]*3,s=n[r+2]*3,i=e[a]-e[o],u=e[a+1]-e[o+1],l=e[a+2]-e[o+2],c=e[s]-e[o],d=e[s+1]-e[o+1],f=e[s+2]-e[o+2],h=u*f-l*d,p=l*c-i*f,m=i*d-u*c;for(let b of[o,a,s])t[b]=t[b]+h,t[b+1]=t[b+1]+p,t[b+2]=t[b+2]+m}for(let r=0;r<t.length;r+=3){let o=Math.hypot(t[r],t[r+1],t[r+2]);o>0&&(t[r]=t[r]/o,t[r+1]=t[r+1]/o,t[r+2]=t[r+2]/o)}return t}function Ce(e,n,t,r,o){let{min:a,max:s}=$r(e),i=r??Rn(e,t);return{positions:e,normals:i,uvs:n,indices:t,min:a,max:s,tangents:o??Tn(e,i,n,t)}}function At(e=10,n=24){let t=Math.max(1,Math.floor(n)),r=(t+1)*(t+1),o=new Float32Array(r*3),a=new Float32Array(r*3),s=new Float32Array(r*2),i=new Uint16Array(t*t*6),u=0,l=0,c=0;for(let d=0;d<=t;d++)for(let f=0;f<=t;f++){let h=(f/t-.5)*e,p=(d/t-.5)*e;o[u]=h,o[u+1]=0,o[u+2]=p,a[u]=0,a[u+1]=1,a[u+2]=0,u+=3,s[l++]=f/t,s[l++]=d/t}for(let d=0;d<t;d++)for(let f=0;f<t;f++){let h=d*(t+1)+f,p=h+1,m=h+(t+1),b=m+1;i[c++]=h,i[c++]=m,i[c++]=p,i[c++]=p,i[c++]=m,i[c++]=b}return Ce(o,s,i,a)}function Be(e=.5,n=24,t=32){let r=Math.max(2,n),o=Math.max(3,t),a=(r+1)*(o+1),s=new Float32Array(a*3),i=new Float32Array(a*3),u=new Float32Array(a*2),l=new Uint16Array(r*o*6),c=0,d=0,f=0;for(let h=0;h<=r;h++){let p=h/r*Math.PI;for(let m=0;m<=o;m++){let b=m/o*Math.PI*2,y=Math.sin(p)*Math.cos(b),x=Math.cos(p),A=Math.sin(p)*Math.sin(b);s[c]=y*e,s[c+1]=x*e,s[c+2]=A*e,i[c]=y,i[c+1]=x,i[c+2]=A,c+=3,u[d++]=m/o,u[d++]=h/r}}for(let h=0;h<r;h++)for(let p=0;p<o;p++){let m=h*(o+1)+p,b=m+1,y=m+(o+1),x=y+1;l[f++]=m,l[f++]=b,l[f++]=y,l[f++]=b,l[f++]=x,l[f++]=y}return Ce(s,u,l,i)}function Ue(e=.5,n=.2,t=64){let r=Math.max(3,t),o=n/2,a=[],s=[],i=[],u=[],l=[];for(let c=0;c<=r;c++){let d=c/r*Math.PI*2,f=Math.cos(d),h=Math.sin(d);a.push(f*e,o,h*e),s.push(f,0,h),i.push(c/r,1),l.push(-h,0,f),a.push(f*e,-o,h*e),s.push(f,0,h),i.push(c/r,0),l.push(-h,0,f)}for(let c=0;c<r;c++){let d=c*2,f=d+1,h=d+2,p=d+3;u.push(d,h,f,f,h,p)}for(let[c,d]of[[1,o],[-1,-o]]){let f=a.length/3;a.push(0,d,0),s.push(0,c,0),i.push(.5,.5),l.push(1,0,0);for(let h=0;h<=r;h++){let p=h/r*Math.PI*2,m=Math.cos(p),b=Math.sin(p);a.push(m*e,d,b*e),s.push(0,c,0),i.push(.5+m*.5,.5+b*.5),l.push(-b,0,m)}for(let h=0;h<r;h++){let p=f+1+h,m=f+2+h;c>0?u.push(f,m,p):u.push(f,p,m)}}return Ce(new Float32Array(a),new Float32Array(i),new Uint16Array(u),new Float32Array(s),new Float32Array(l))}function ke(e=.5,n=.08,t=64,r=24){let o=Math.max(3,t),a=Math.max(3,r),s=[],i=[],u=[],l=[],c=[];for(let d=0;d<=o;d++){let f=d/o*Math.PI*2,h=Math.cos(f),p=Math.sin(f);for(let m=0;m<=a;m++){let b=m/a*Math.PI*2,y=Math.cos(b),x=Math.sin(b);s.push((e+n*y)*h,n*x,(e+n*y)*p),i.push(h*y,x,p*y),u.push(d/o,m/a),c.push(-p,0,h)}}for(let d=0;d<o;d++)for(let f=0;f<a;f++){let h=d*(a+1)+f,p=h+1,m=h+(a+1),b=m+1;l.push(h,p,m,p,b,m)}return Ce(new Float32Array(s),new Float32Array(u),new Uint16Array(l),new Float32Array(i),new Float32Array(c))}function z(e){return e.indices.length/3}function zr(e){if(!Number.isFinite(e)||e===0)return"0";let n=e.toFixed(12).replace(/0+$/,"").replace(/\.$/,"");return n==="-0"?"0":n}function An(e,n,t,r){let[o,a]=e,[s,i]=n,[u,l]=t,[c,d]=r,f=o-s+u-c,h=a-i+l-d;if(Math.abs(f)<1e-9&&Math.abs(h)<1e-9){let B=[s-o,c-o,o,i-a,d-a,a,0,0,1],g=B[0]*B[4]-B[1]*B[3];return Math.abs(g)<1e-9?null:B}let p=s-u,m=c-u,b=i-l,y=d-l,x=p*y-m*b;if(Math.abs(x)<1e-9)return null;let A=(f*y-m*h)/x,C=(p*h-f*b)/x;return[s-o+A*s,c-o+C*c,o,i-a+A*i,d-a+C*d,a,A,C,1]}function Ge(e,n,t,r,o,a){if(!(o>0)||!(a>0))return{refusal:"EMPTY_ELEMENT_BOX"};let i=[n.topLeft,n.topRight,n.bottomRight,n.bottomLeft].map(M=>H(e,M,t,r));if(i.some(M=>M.behind))return{refusal:"CORNER_BEHIND_CAMERA"};let u=i.map(M=>({x:M.sx,y:M.sy})),[l,c,d,f]=u,h=An([l.x,l.y],[c.x,c.y],[d.x,d.y],[f.x,f.y]);if(!h)return{refusal:"DEGENERATE_ON_SCREEN"};let p=.5*(l.x*c.y-c.x*l.y+(c.x*d.y-d.x*c.y)+(d.x*f.y-f.x*d.y)+(f.x*l.y-l.x*f.y)),m=1/o,b=1/a,[y,x,A,C,B,g,T,S,E]=h;return{transform:`matrix3d(${[y*m,C*m,0,T*m,x*b,B*b,0,S*b,0,0,1,0,A,g,0,E].map(zr).join(", ")})`,matrix:h,screen:u,signedArea:p}}function Ve(e){return"refusal"in e}var Sn=e=>[e.DEPTH_TEST,e.CULL_FACE,e.BLEND];function ie(e){return[e.getParameter(e.FRAMEBUFFER_BINDING),e.getParameter(e.VIEWPORT),e.getParameter(e.DEPTH_WRITEMASK),Sn(e).map(n=>e.getParameter(n))]}function le(e,n){e.bindFramebuffer(e.FRAMEBUFFER,n[0]);let t=n[1];e.viewport(t[0]??0,t[1]??0,t[2]??0,t[3]??0),e.depthMask(n[2]),Sn(e).forEach((r,o)=>{n[3][o]?e.enable(r):e.disable(r)})}function He(e,n){for(let t=n-1;t>=0;t--)e.activeTexture(e.TEXTURE0+t),e.bindTexture(e.TEXTURE_2D,null),e.bindTexture(e.TEXTURE_3D,null);e.activeTexture(e.TEXTURE0)}var Mt=["minimum","reduced","full"],St={full:{dprScale:2,ao:!0,dof:!0,shadowMapSize:1536,shadowTaps:9,volumeLightSteps:6},reduced:{dprScale:2,ao:!0,dof:!1,shadowMapSize:1024,shadowTaps:9,volumeLightSteps:4},minimum:{dprScale:1,ao:!1,dof:!1,shadowMapSize:512,shadowTaps:1,volumeLightSteps:1}};function $e(e,n){let t=Number.isFinite(n)&&n>0?n:1024,r=St[e].shadowMapSize/St.full.shadowMapSize,o=t*r,a=2**Math.round(Math.log2(o));return Math.max(256,Math.min(t,a))}function Ft(e){return{tier:e,...St[e]}}var vt=89,wt=Math.PI/180;function ue(e){let n=Math.max(-vt,Math.min(vt,e.elevationDeg))*wt,t=e.azimuthDeg*wt,r=Math.max(1e-4,e.distance),o=Math.sin(n)*r,a=Math.cos(n)*r;return[e.target[0]+Math.sin(t)*a,e.target[1]+o,e.target[2]+Math.cos(t)*a]}function ce(e,n){let t=ue(e),r=e.near??Math.max(.01,e.distance/100),o=e.far??Math.max(r+1,e.distance*8),a=pt((e.fovDeg??38)*wt,Math.max(.001,n),r,o),s=Oe(t,e.target,[0,1,0]);return Pe(a,s)}function Lt(e,n,t){let r=ye(e.direction),o=e.extent??Math.max(.1,t*1.35),a=Math.max(1,t*2),s=[n[0]-r[0]*a,n[1]-r[1]*a,n[2]-r[2]*a],i=Math.abs(r[1])>.99?[0,0,1]:[0,1,0],u=Oe(s,n,i),l=bt(-o,o,-o,o,.01,a+t*2+o);return Pe(l,u)}function _t(e,n){let t=Ie([n[0],n[1],n[2]],[e[0],e[1],e[2]]);return Math.hypot(t[0],t[1],t[2])/2}function Nt(e,n){return[(e[0]+n[0])/2,(e[1]+n[1])/2,(e[2]+n[2])/2]}function Dt(e,n,t){let{gl:r}=e,o=Math.max(1,Math.floor(n)),a=Math.max(1,Math.floor(t)),s=r.createFramebuffer(),i=r.createTexture(),u=r.createTexture();if(!s||!i||!u)return O("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let l=e.hdr?r.RGBA16F:r.RGBA8,c=e.hdr?r.HALF_FLOAT:r.UNSIGNED_BYTE,d=()=>{r.bindTexture(r.TEXTURE_2D,i),r.texImage2D(r.TEXTURE_2D,0,l,o,a,0,r.RGBA,c,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),r.bindTexture(r.TEXTURE_2D,u),r.texImage2D(r.TEXTURE_2D,0,r.DEPTH_COMPONENT24,o,a,0,r.DEPTH_COMPONENT,r.UNSIGNED_INT,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),r.bindFramebuffer(r.FRAMEBUFFER,s),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,i,0),r.framebufferTexture2D(r.FRAMEBUFFER,r.DEPTH_ATTACHMENT,r.TEXTURE_2D,u,0),r.bindFramebuffer(r.FRAMEBUFFER,null)};d(),r.bindFramebuffer(r.FRAMEBUFFER,s);let f=r.checkFramebufferStatus(r.FRAMEBUFFER);return r.bindFramebuffer(r.FRAMEBUFFER,null),f!==r.FRAMEBUFFER_COMPLETE?O("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${f.toString(16)}). Depth texture support may be missing.`):{framebuffer:s,texture:i,depthTexture:u,get width(){return o},get height(){return a},bind(){r.bindFramebuffer(r.FRAMEBUFFER,s),r.viewport(0,0,o,a)},resize(h,p){let m=Math.max(1,Math.floor(h)),b=Math.max(1,Math.floor(p));m===o&&b===a||(o=m,a=b,d())},dispose(){r.deleteFramebuffer(s),r.deleteTexture(i),r.deleteTexture(u)}}}function Pt(e,n=1024){let{gl:t}=e,r=Math.max(256,Math.min(2048,Math.floor(n))),o=t.createFramebuffer(),a=t.createTexture();if(!o||!a)return O("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");t.bindTexture(t.TEXTURE_2D,a),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,r,r,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,o),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,a,0);let s=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),s!==t.FRAMEBUFFER_COMPLETE?O("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${s.toString(16)}).`):{framebuffer:o,depthTexture:a,size:r,bind(){t.bindFramebuffer(t.FRAMEBUFFER,o),t.viewport(0,0,r,r)},dispose(){t.deleteFramebuffer(o),t.deleteTexture(a)}}}var Ot=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,It={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function Mn(e,n,t={}){let r=t.zenith??It.zenith,o=t.horizon??It.horizon,a=t.ground??It.ground;e.uniform3f(e.getUniformLocation(n,"uSkyZenith"),r[0],r[1],r[2]),e.uniform3f(e.getUniformLocation(n,"uSkyHorizon"),o[0],o[1],o[2]),e.uniform3f(e.getUniformLocation(n,"uSkyGround"),a[0],a[1],a[2])}var Xo=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${Ot}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;var Fn=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,Ct=`#version 300 es
precision highp float;
void main(){}`,Wr=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,vn=`#version 300 es
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
}`,wn=`#version 300 es
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
${Ot}

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
}`;function W(e,n){let{gl:t}=e,r=t.createVertexArray(),o=t.createBuffer(),a=t.createBuffer(),s=t.createBuffer(),i=t.createBuffer();return!r||!o||!a||!s||!i?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(t.bindVertexArray(r),t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,n.positions,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,a),t.bufferData(t.ARRAY_BUFFER,n.normals,t.STATIC_DRAW),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,s),t.bufferData(t.ARRAY_BUFFER,n.tangents,t.STATIC_DRAW),t.enableVertexAttribArray(2),t.vertexAttribPointer(2,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,i),t.bufferData(t.ELEMENT_ARRAY_BUFFER,n.indices,t.STATIC_DRAW),t.bindVertexArray(null),{vao:r,indexCount:n.indices.length,indexType:n.indices instanceof Uint32Array?t.UNSIGNED_INT:t.UNSIGNED_SHORT,dispose(){t.deleteVertexArray(r),t.deleteBuffer(o),t.deleteBuffer(a),t.deleteBuffer(s),t.deleteBuffer(i)}})}function Bt(e){let{gl:n}=e,t=e.compile(Fn,Ct);if("kind"in t)return t;let r=e.compile(vn,wn);if("kind"in r)return r;let o=e.compile(Wr,Ct);if("kind"in o)return o;let a=(s,i)=>n.getUniformLocation(s,i);return{shadowPass(s,i,u,l){let c=ie(n),d=l??(()=>{});u.bind(),d("shadow.bind"),n.clear(n.DEPTH_BUFFER_BIT),n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.FRONT),n.useProgram(t),d("useProgram(shadow)"),n.uniformMatrix4fv(a(t,"uLightVP"),!1,s),d("uLightVP");for(let f of i)n.uniformMatrix4fv(a(t,"uModel"),!1,f.model),d("shadow uModel"),n.bindVertexArray(f.mesh.vao),d("shadow bindVAO"),n.drawElements(n.TRIANGLES,f.mesh.indexCount,f.mesh.indexType,0),d("shadow drawElements");n.bindVertexArray(null),n.cullFace(n.BACK),le(n,c)},depthPrepass(s,i){let u=ie(n);n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.colorMask(!1,!1,!1,!1),n.useProgram(o),n.uniformMatrix4fv(a(o,"uViewProj"),!1,s);for(let l of i)n.uniformMatrix4fv(a(o,"uModel"),!1,l.model),n.bindVertexArray(l.mesh.vao),n.drawElements(n.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0);n.bindVertexArray(null),n.colorMask(!0,!0,!0,!0),le(n,u)},draw(s){let i=ie(n),u=s.onStep??(()=>{});if(n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.useProgram(r),n.uniformMatrix4fv(a(r,"uViewProj"),!1,s.viewProj),u("uViewProj"),n.uniform3fv(a(r,"uEye"),s.eye),u("uEye"),n.uniform3fv(a(r,"uLightDir"),s.lightDir),u("uLightDir"),n.uniform3fv(a(r,"uLightColour"),s.lightColour),u("uLightColour"),n.uniform1f(a(r,"uAmbientGain"),s.ambientGain??1),u("uAmbientGain"),s.fog&&s.fog.density>0){n.uniform1f(a(r,"uFogDensity"),s.fog.density),n.uniform1f(a(r,"uFogHeight"),s.fog.height),n.uniform1f(a(r,"uFogFloor"),s.fog.floor??0);let l=s.fog.colour;l==="sky"?n.uniform3f(a(r,"uFogColour"),-1,-1,-1):n.uniform3f(a(r,"uFogColour"),l[0],l[1],l[2]),u("fog")}else n.uniform1f(a(r,"uFogDensity"),0);if(Mn(n,r,s.sky),u("bindSky"),s.ao&&s.screenSize?(n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,s.ao),n.uniform1i(a(r,"uAO"),1),n.uniform2f(a(r,"uScreenSize"),s.screenSize[0],s.screenSize[1]),n.uniform1f(a(r,"uAOEnabled"),1)):n.uniform1f(a(r,"uAOEnabled"),0),u("bindAO"),n.uniformMatrix4fv(a(r,"uLightVP"),!1,s.lightVP),u("lit uLightVP"),s.shadow){n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,s.shadow.depthTexture),n.uniform1i(a(r,"uShadowMap"),0),n.uniform1f(a(r,"uShadowTexel"),1/s.shadow.size),n.uniform1f(a(r,"uShadowStrength"),s.shadowStrength??1),n.uniform1i(a(r,"uShadowTaps"),(s.shadowTaps??9)>=9?9:1);let l=s.shadowBaseline,c=l&&l>0&&s.shadow.size>0?l/s.shadow.size:1;n.uniform1f(a(r,"uShadowBiasScale"),Number.isFinite(c)&&c>0?c:1)}else n.uniform1f(a(r,"uShadowStrength"),0);for(let l of s.draws)n.uniformMatrix4fv(a(r,"uModel"),!1,l.model),n.uniformMatrix3fv(a(r,"uNormalMat"),!1,l.normalMat),u("uNormalMat"),n.uniform3fv(a(r,"uBaseColour"),l.material.baseColour),u("uBaseColour"),n.uniform1f(a(r,"uRoughness"),l.material.roughness),n.uniform1f(a(r,"uMetalness"),l.material.metalness),n.uniform1f(a(r,"uAnisotropy"),l.material.anisotropy??0),n.bindVertexArray(l.mesh.vao),u("lit bindVAO"),n.drawElements(n.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0),u("lit drawElements");n.bindVertexArray(null),He(n,2),le(n,i)},dispose(){n.deleteProgram(t),n.deleteProgram(r),n.deleteProgram(o)}}}var Ut=`
uniform sampler2D uDepth;
uniform vec2 uNearFar;

float linearDepthAt(vec2 uv) {
  float d = texture(uDepth, uv).r * 2.0 - 1.0;
  float n = uNearFar.x, f = uNearFar.y;
  return (2.0 * n * f) / (f + n - d * (f - n));
}`,_n=`
uniform float uTanHalfFov;
uniform float uAspect;

vec3 viewPosAt(vec2 uv) {
  float z = linearDepthAt(uv);
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x * uTanHalfFov * uAspect * z, ndc.y * uTanHalfFov * z, -z);
}`,Nn=Ut+_n,Ln=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,jr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${Nn}

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
}`,Xr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${Ut}

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
}`;function kt(e,n,t){let{gl:r}=e,o=e.compile(Ln,jr);if("kind"in o)return o;let a=e.compile(Ln,Xr);if("kind"in a)return a;let s=Math.max(1,n>>1),i=Math.max(1,t>>1),u=()=>{let m=r.createFramebuffer(),b=r.createTexture();return!m||!b?null:{fb:m,tex:b}},l=u(),c=u();if(!l||!c)return O("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let d=()=>{for(let m of[l,c])r.bindTexture(r.TEXTURE_2D,m.tex),r.texImage2D(r.TEXTURE_2D,0,r.R8,s,i,0,r.RED,r.UNSIGNED_BYTE,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),r.bindFramebuffer(r.FRAMEBUFFER,m.fb),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,m.tex,0);r.bindFramebuffer(r.FRAMEBUFFER,null)};d(),r.bindFramebuffer(r.FRAMEBUFFER,l.fb);let f=r.checkFramebufferStatus(r.FRAMEBUFFER);if(r.bindFramebuffer(r.FRAMEBUFFER,null),f!==r.FRAMEBUFFER_COMPLETE)return O("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${f.toString(16)}).`);let h=(m,b,y,x,A)=>{r.activeTexture(r.TEXTURE0+A),r.bindTexture(r.TEXTURE_2D,b),r.uniform1i(r.getUniformLocation(m,"uDepth"),A),r.uniform2f(r.getUniformLocation(m,"uNearFar"),y,x)},p=(m,b,y,x,A,C,B)=>{h(m,b,y,x,B),r.uniform1f(r.getUniformLocation(m,"uTanHalfFov"),Math.tan(A*Math.PI/360)),r.uniform1f(r.getUniformLocation(m,"uAspect"),C)};return{get texture(){return l.tex},get width(){return s},get height(){return i},compute(m){let b=ie(r);r.disable(r.DEPTH_TEST),r.depthMask(!1),r.disable(r.BLEND),r.disable(r.CULL_FACE),r.bindFramebuffer(r.FRAMEBUFFER,l.fb),r.viewport(0,0,s,i),r.useProgram(o),p(o,m.depthTexture,m.near,m.far,m.fovDeg,m.aspect,0),r.uniform2f(r.getUniformLocation(o,"uTexel"),1/s,1/i),r.uniform1f(r.getUniformLocation(o,"uRadius"),m.radius??.55),r.uniform1f(r.getUniformLocation(o,"uStrength"),m.strength??1.15),r.uniform1f(r.getUniformLocation(o,"uBias"),m.bias??.035),e.blit(o);for(let[y,x,A]of[[l,c,[1,0]],[c,l,[0,1]]])r.bindFramebuffer(r.FRAMEBUFFER,x.fb),r.viewport(0,0,s,i),r.useProgram(a),h(a,m.depthTexture,m.near,m.far,0),r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,y.tex),r.uniform1i(r.getUniformLocation(a,"uAO"),1),r.uniform2f(r.getUniformLocation(a,"uTexel"),1/s,1/i),r.uniform2f(r.getUniformLocation(a,"uDir"),A[0],A[1]),e.blit(a);He(r,2),le(r,b)},resize(m,b){let y=Math.max(1,m>>1),x=Math.max(1,b>>1);y===s&&x===i||(s=y,i=x,d())},dispose(){r.deleteProgram(o),r.deleteProgram(a);for(let m of[l,c])r.deleteFramebuffer(m.fb),r.deleteTexture(m.tex)}}}var Yr=`
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
`;function Y(e){return String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function Dn(e){let n=document.createElement("style");n.textContent=Yr,document.head.appendChild(n);let t=document.createElement("section");t.id="lcx-fallback",t.setAttribute("aria-label",`${e.title} \u2014 flat view`),t.setAttribute("tabindex","-1"),document.getElementById("log")?.setAttribute("aria-hidden","true");let r=(a,s)=>a===null?`<td class="absent${s?" n":""}">absent</td>`:`<td class="${s?"n":""}">${Y(a)}</td>`;t.innerHTML=`<h2>${Y(e.title)} \u2014 flat view</h2><p class="reads">${Y(e.readsAs)}</p>`+(e.notices??[]).map(a=>`<p class="notice">${Y(a)}</p>`).join("")+'<div id="lcx-refusal" role="alert"></div>'+(e.html?`<div class="surface">${e.html}</div>`:`<table><caption>${Y(e.title)} \u2014 flat view</caption><thead><tr>`+e.columns.map(a=>`<th scope="col" class="${a.numeric?"n":""}">${Y(a.label)}</th>`).join("")+"</tr></thead><tbody>"+e.rows.map(a=>"<tr>"+e.columns.map(s=>r(a[s.key]??null,!!s.numeric)).join("")+"</tr>").join("")+"</tbody></table>"),document.body.appendChild(t);function o(a,s){let i=document.getElementById("lcx-refusal");i&&(i.innerHTML=`<p class="refusal"><strong>${Y(a)}</strong> \u2014 ${Y(s)} The measurements below are unaffected.</p>`),delete t.dataset.rendered;for(let u of Array.from(document.querySelectorAll("canvas")))u.style.display="none";t.focus({preventScroll:!0})}return document.addEventListener("webglcontextlost",a=>{a.preventDefault(),o("CONTEXT_LOST","The GPU dropped the WebGL context for this page mid-session.")},!0),{markRendered(){t.dataset.rendered="1"},showRefusal:o}}var me=new URLSearchParams(location.search),an=Mt.includes(me.get("tier")??"")?me.get("tier"):"full",Qe=Ft(an),Ke=me.get("ao")!=="0"&&Qe.ao,w=me.get("flat")==="1",qe=me.get("shadow")!=="0"&&!w,Wt=[],Jn=[];function Zn(e,n,t,r){let o=me.get(e);if(o===null)return n;let a=Number(o);if(!Number.isFinite(a))return Wt.push(`${e}=${o}`),n;let s=Math.max(t,Math.min(r,a));return s!==a&&Jn.push(`${e}=${o} used as ${s}`),s}var ve=Zn("scale",1,1,3),jt=Math.trunc(Zn("frames",300,1,2e4)),D=1200*ve,P=720*ve,fe=document.getElementById("c");fe.width=D;fe.height=P;var Qr=document.getElementById("log");function ot(e){document.title="REFUSED";let n=document.getElementById("log");n&&(n.textContent=e);let[t,...r]=e.split(":");throw er?.showRefusal(t?.trim()??"REFUSED",r.join(":").trim()||e),new Error(e)}var er=null;function U(e,n){return"kind"in n&&ot(`${e}: ${n.code} \u2014 ${n.reason} ${n.detail??""}`),n}var v="PROGRAMME",he=[{id:v,kind:"CORE",thetaDeg:0,count:{state:"observed",records:9}},{id:"PARTNER",kind:"PARTY",thetaDeg:18,count:{state:"observed",records:412}},{id:"PERSON",kind:"PARTY",thetaDeg:128,count:{state:"observed",records:1940}},{id:"COUNTERPARTY",kind:"PARTY",thetaDeg:236,count:{state:"absent"}},{id:"LISTING",kind:"INSTRUMENT",thetaDeg:196,count:{state:"observed",records:128}},{id:"TOKEN",kind:"INSTRUMENT",thetaDeg:52,count:{state:"observed",records:64}},{id:"SETTLEMENT",kind:"INSTRUMENT",thetaDeg:300,count:{state:"observed",records:22806}},{id:"CAMPAIGN",kind:"EVENT",thetaDeg:258,count:{state:"observed",records:37}},{id:"QUEST",kind:"EVENT",thetaDeg:8,count:{state:"observed",records:1204}},{id:"COMPARTMENT",kind:"CONTROL",thetaDeg:270,count:{state:"withheld"}},{id:"JURISDICTION",kind:"CONTROL",thetaDeg:214,count:{state:"observed",records:31}}],J=[{a:v,b:"PARTNER",strength:.92},{a:v,b:"LISTING",strength:.71},{a:v,b:"CAMPAIGN",strength:.64},{a:v,b:"COMPARTMENT",strength:.55},{a:"PARTNER",b:"PERSON",strength:.8},{a:"PARTNER",b:"COUNTERPARTY",strength:.34},{a:"LISTING",b:"TOKEN",strength:.88},{a:"TOKEN",b:"SETTLEMENT",strength:.76},{a:"CAMPAIGN",b:"QUEST",strength:.58},{a:"QUEST",b:"PERSON",strength:.41},{a:"JURISDICTION",b:"LISTING",strength:.67},{a:"SETTLEMENT",b:"COUNTERPARTY",strength:.29},{a:"JURISDICTION",b:"PERSON",strength:null}],tr=Dn({title:"E4 \xB7 The Orrery \u2014 ontology entities and couplings",readsAs:"The rendered view places each entity on an orbit whose radius is its distance from the core and whose inclination separates its kind, so coupling strength and grouping are read at once without crossing lines. These two lists carry every entity and every relationship, and none of that structure.",notices:["A SYNTHETIC ontology \u2014 the shape is deliberate, the counts are not measurements.","Absent (never measured) and withheld (measured, not shown) are separate states here, as in the render."],columns:[{key:"entity",label:"Entity"},{key:"kind",label:"Kind"},{key:"records",label:"Records",numeric:!0},{key:"couplings",label:"Couplings",numeric:!0}],rows:[...he.map(e=>({entity:e.id,kind:e.kind,records:e.count.state==="observed"?e.count.records:e.count.state==="withheld"?"withheld":null,couplings:J.filter(n=>n.a===e.id||n.b===e.id).length})),...J.map(e=>({entity:`${e.a} \u2192 ${e.b}`,kind:"COUPLING",records:e.strength===null?null:e.strength.toFixed(2),couplings:""}))]});er=tr;Wt.length>0&&ot(`BAD_PARAM: ${Wt.join(", ")} \u2014 not a number, so the system was refused rather than drawn from a nonsensical value. Every entity below is unaffected; correct the URL and reload.`);new URLSearchParams(location.search).get("refuse")==="1"&&ot("FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. The three-dimensional view is not being drawn.");var je=ft(fe,{alpha:!1});mt(je)||ot(`stage: ${je.code} \u2014 ${je.reason}`);var I=je,R=I.gl,Kr=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,qr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${Et}
${Tt}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,Jr=U("present",I.compile(Kr,qr)),Gt=U("lit",Bt(I)),ze=U("target",Dt(I,D,P)),Xt=U("shadow",Pt(I,$e(an,1536))),Pn=U("ao",kt(I,D,P)),Yt=new Map(he.map(e=>[e.id,[]]));for(let e of J)Yt.get(e.a)?.push(e.b),Yt.get(e.b)?.push(e.a);var de=new Map([[v,0]]);for(let e=[v];e.length>0;){let n=[];for(let t of e)for(let r of Yt.get(t)??[])de.has(r)||(de.set(r,(de.get(t)??0)+1),n.push(r));e=n}var Zr=he.filter(e=>!de.has(e.id)).map(e=>e.id),K=Math.PI/180,Q=e=>1+e*2.1,we={CORE:{incDeg:0,nodeDeg:0},PARTY:{incDeg:0,nodeDeg:0},INSTRUMENT:{incDeg:34,nodeDeg:64},EVENT:{incDeg:-29,nodeDeg:-58},CONTROL:{incDeg:62,nodeDeg:118}};function Re(e,n,t,r){let o=n*K,a=t*K,s=r*K,i=e*Math.cos(o),u=e*Math.sin(o),l=-u*Math.sin(a),c=u*Math.cos(a);return[i*Math.cos(s)+c*Math.sin(s),l,-i*Math.sin(s)+c*Math.cos(s)]}function eo(e,n){let t=e*K,r=n*K,o=Math.cos(t),a=Math.sin(t),s=Math.cos(r),i=Math.sin(r),u=new Float32Array([s,0,-i,i*a,o,s*a,i*o,-a,s*o]),l=Z();return l[0]=u[0],l[1]=u[1],l[2]=u[2],l[4]=u[3],l[5]=u[4],l[6]=u[5],l[8]=u[6],l[9]=u[7],l[10]=u[8],{model:l,normal:u}}var nr=.15,rr=.115,to=e=>nr+rr*Math.log10(Math.max(1,e)),or=.34,ar=.115,sr=or+ar,sn=.3,no=.44,ro=e=>e.state==="observed"?to(e.records):e.state==="absent"?sr:sn,_=he.filter(e=>de.has(e.id)).map(e=>{let n=de.get(e.id),t=Q(n),r=we[e.kind];return{def:e,hops:n,shell:t,pos:e.id===v?[0,0,0]:Re(t,e.thetaDeg,r.incDeg,r.nodeDeg),flatPos:e.id===v?[0,0,0]:Re(t,e.thetaDeg,0,0),radius:ro(e.count)}}),Je=new Map(_.map(e=>[e.def.id,e])),at=Object.keys(we).filter(e=>_.some(n=>n.def.kind===e&&n.def.id!==v)),st=e=>w?e.flatPos:e.pos,ir=J.map(e=>e.strength).filter(e=>e!==null),Ae=Math.min(...ir),Ze=Math.max(...ir),Qt=.026,lr=.086,ln=e=>Qt+(lr-Qt)*((e-Ae)/Math.max(1e-6,Ze-Ae)),it=.052,ur=e=>J.flatMap(n=>{let t=Je.get(n.a),r=Je.get(n.b);return!t||!r?[]:[{rel:n,aId:n.a,bId:n.b,a:e?t.flatPos:t.pos,b:e?r.flatPos:r.pos,r:n.strength===null?it:ln(n.strength),dotted:n.strength===null}]}),ne=ur(!1),re=ur(!0),Kt=.5,qt=90,In=60,$=w?{target:[0,0,0],distance:22,azimuthDeg:In,elevationDeg:89,fovDeg:36,near:Kt,far:qt}:{target:[0,.4,0],distance:22,azimuthDeg:In,elevationDeg:26,fovDeg:36,near:Kt,far:qt},q=ue($),un=$.fovDeg??36,N=D/ve,L=P/ve,Le=e=>L/2/(Math.max(.01,e)*Math.tan(un/2*K)),lt=e=>Math.hypot(e[0]-q[0],e[1]-q[1],e[2]-q[2]),ee=(e,n)=>e[0]*n[0]+e[1]*n[1]+e[2]*n[2],G=(e,n)=>[e[0]-n[0],e[1]-n[1],e[2]-n[2]],V=e=>Math.hypot(e[0],e[1],e[2]),On=(e,n,t)=>[e[0]+n[0]*t,e[1]+n[1]*t,e[2]+n[2]*t];function et(e,n,t,r){let o=G(n,e),a=G(r,t),s=G(e,t),i=ee(o,o),u=ee(a,a),l=ee(a,s),c=0,d=0;if(i<=1e-12&&u<=1e-12)return{dist:V(s),c1:e,c2:t};if(i<=1e-12)d=Math.min(1,Math.max(0,l/u));else{let p=ee(o,s);if(u<=1e-12)c=Math.min(1,Math.max(0,-p/i));else{let m=ee(o,a),b=i*u-m*m;c=b>1e-12?Math.min(1,Math.max(0,(m*l-p*u)/b)):0,d=(m*c+l)/u,d<0?(d=0,c=Math.min(1,Math.max(0,-p/i))):d>1&&(d=1,c=Math.min(1,Math.max(0,(m-p)/i)))}}let f=On(e,o,c),h=On(t,a,d);return{dist:V(G(f,h)),c1:f,c2:h}}var cn=e=>{let n=[];for(let t=0;t<e.length;t++)for(let r=t+1;r<e.length;r++){let o=e[t],a=e[r];o.aId===a.aId||o.aId===a.bId||o.bId===a.aId||o.bId===a.bId||n.push([o,a])}return n};function cr(e){let n=0,t=1/0,r=[];for(let[o,a]of cn(e)){let s=et(o.a,o.b,a.a,a.b).dist;t=Math.min(t,s),s<o.r+a.r&&(n++,r.push(`${o.aId}~${o.bId} \xD7 ${a.aId}~${a.bId}`))}return{pairs:n,minSeparation:Number.isFinite(t)?t:0,worst:r}}function dr(e,n,t,r,o,a,s,i){let u=t-e,l=r-n,c=s-o,d=i-a,f=u*d-l*c;if(Math.abs(f)<1e-9)return null;let h=o-e,p=a-n,m=(h*d-p*c)/f,b=(h*l-p*u)/f;return m<=1e-6||m>=1-1e-6||b<=1e-6||b>=1-1e-6?null:{t:m,u:b}}function oo(e,n,t,r){let o=(()=>{let p=G(e.target,n),m=V(p)||1;return[p[0]/m,p[1]/m,p[2]/m]})(),a=(()=>{let p=[-o[2],0,o[0]],m=V(p)||1;return[p[0]/m,p[1]/m,p[2]/m]})(),s=[a[1]*o[2]-a[2]*o[1],a[2]*o[0]-a[0]*o[2],a[0]*o[1]-a[1]*o[0]],i=Math.tan(un/2*K),u=t/N*2-1,l=1-r/L*2,c=o[0]+a[0]*u*i*(N/L)+s[0]*l*i,d=o[1]+a[1]*u*i*(N/L)+s[1]*l*i,f=o[2]+a[2]*u*i*(N/L)+s[2]*l*i,h=Math.hypot(c,d,f)||1;return[c/h,d/h,f/h]}function mr(e,n){let t=ue(n),r=ce(n,N/L),o=new Map;for(let u of e)o.set(u,{a:H(r,u.a,N,L),b:H(r,u.b,N,L)});let a=0,s=0,i=1/0;for(let[u,l]of cn(e)){let c=o.get(u),d=o.get(l);if(c.a.behind||c.b.behind||d.a.behind||d.b.behind)continue;let f=dr(c.a.sx,c.a.sy,c.b.sx,c.b.sy,d.a.sx,d.a.sy,d.b.sx,d.b.sy);if(!f)continue;a++;let h=c.a.sx+(c.b.sx-c.a.sx)*f.t,p=c.a.sy+(c.b.sy-c.a.sy)*f.t,m=oo(n,t,h,p),b=[t[0]+m[0]*400,t[1]+m[1]*400,t[2]+m[2]*400],y=et(u.a,u.b,t,b).c1,x=et(l.a,l.b,t,b).c1,A=V(G(y,x));i=Math.min(i,A),A<u.r+l.r&&s++}return{total:a,ambiguous:s,minSep:Number.isFinite(i)?i:0}}function fr(e){let n=ue(e),t=ce(e,N/L);return _.map(r=>{let o=st(r),a=H(t,o,N,L),s=Math.hypot(o[0]-n[0],o[1]-n[1],o[2]-n[2]);return{id:r.def.id,cx:a.sx,cy:a.sy,r:r.radius*Le(s),behind:a.behind}})}function Jt(e){let n=fr(e),t=[];for(let r=0;r<n.length;r++)for(let o=r+1;o<n.length;o++){let a=n[r],s=n[o];if(a.behind||s.behind)continue;let i=Math.hypot(a.cx-s.cx,a.cy-s.cy)-(a.r+s.r);i<0&&t.push(`${a.id}/${s.id} overlap ${(-i).toFixed(1)}px`)}return t}function hr(e){let n=0;for(let[t,r]of cn(e))dr(t.a[0],t.a[2],t.b[0],t.b[2],r.a[0],r.a[2],r.b[0],r.b[2])&&n++;return n}function We(e,n){let t=[];for(let r of e)for(let o of _){if(o.def.id===r.aId||o.def.id===r.bId)continue;let a=n?o.flatPos:o.pos;et(r.a,r.b,a,a).dist<o.radius+r.r&&t.push(`${r.aId}~${r.bId} through ${o.def.id}`)}return t}var ao=performance.now(),pr=12e4,Xe=1/0;{let e=he.filter(o=>o.id!==v).map(o=>o.thetaDeg),n=he.filter(o=>o.id!==v).map(o=>o.id),t=new Map([[v,[0,0,0]]]),r=e.slice();for(let o=0;o<pr;o++){if(o>0)for(let i=r.length-1;i>0;i--){let u=Math.random()*(i+1)|0,l=r[i];r[i]=r[u],r[u]=l}for(let i=0;i<n.length;i++){let u=Je.get(n[i]);t.set(n[i],Re(u.shell,r[i],0,0))}let a=J.flatMap(i=>{let u=t.get(i.a),l=t.get(i.b);return!u||!l?[]:[{rel:i,aId:i.a,bId:i.b,a:u,b:l,r:i.strength===null?it:ln(i.strength),dotted:i.strength===null}]}),s=hr(a);if(s<Xe&&(Xe=s),Xe===0)break}}var so=performance.now()-ao,te=hr(re),Vt=cr(ne),Zt=cr(re),Ee=mr(w?re:ne,$),pe=Array.from({length:36},(e,n)=>{let t={...$,azimuthDeg:n*10},r=mr(ne,t);return{azimuthDeg:n*10,total:r.total,ambiguous:r.ambiguous,mergedDiscs:Jt(t).length}}),Cn=Math.max(...pe.map(e=>e.ambiguous)),io=[Math.min(...pe.map(e=>e.total)),Math.max(...pe.map(e=>e.total))],lo=pe.filter(e=>e.mergedDiscs===0).map(e=>e.azimuthDeg),dn=-2.6,br=At(26,52),gr=Be(1,22,30),xr=Be(it,10,14),yr=ke(or,ar,48,16),Er=Ue(sn,no,40),Tr=Ue(1,1,16),Rr=.032,Ar=[1,2,3].map(e=>ke(Q(e),Rr,96,8)),uo=U("deck",W(I,br)),co=U("sphere",W(I,gr)),Sr=U("pip",W(I,xr)),mo=U("absent",W(I,yr)),fo=U("withheld",W(I,Er)),Mr=U("link",W(I,Tr)),ho=Ar.map((e,n)=>U(`ring${n}`,W(I,e))),tt=new Float32Array([1,0,0,0,1,0,0,0,1]),nt=(e,n)=>{let t=Z();return t[0]=n,t[5]=n,t[10]=n,t[12]=e[0],t[13]=e[1],t[14]=e[2],t};function po(e,n,t){let r=G(n,e),o=V(r);if(o<1e-6)return null;let a=[r[0]/o,r[1]/o,r[2]/o],s=Math.abs(a[1])<.9?[0,1,0]:[1,0,0],i=[a[1]*s[2]-a[2]*s[1],a[2]*s[0]-a[0]*s[2],a[0]*s[1]-a[1]*s[0]],u=V(i)||1,l=[i[0]/u,i[1]/u,i[2]/u],c=[a[1]*l[2]-a[2]*l[1],a[2]*l[0]-a[0]*l[2],a[0]*l[1]-a[1]*l[0]],d=Z();d[0]=l[0]*t,d[1]=l[1]*t,d[2]=l[2]*t,d[4]=a[0]*o,d[5]=a[1]*o,d[6]=a[2]*o,d[8]=c[0]*t,d[9]=c[1]*t,d[10]=c[2]*t,d[12]=(e[0]+n[0])/2,d[13]=(e[1]+n[1])/2,d[14]=(e[2]+n[2])/2;let f=new Float32Array([l[0]/t,l[1]/t,l[2]/t,a[0]/o,a[1]/o,a[2]/o,c[0]/t,c[1]/t,c[2]/t]);return{model:d,normal:f}}function bo(e,n){let t=G(n,e),r=V(t)||1,o=[t[0]/r,t[1]/r,t[2]/r],a=Math.abs(o[1])<.9?[0,1,0]:[1,0,0],s=[o[1]*a[2]-o[2]*a[1],o[2]*a[0]-o[0]*a[2],o[0]*a[1]-o[1]*a[0]],i=V(s)||1,u=[s[0]/i,s[1]/i,s[2]/i],l=[o[1]*u[2]-o[2]*u[1],o[2]*u[0]-o[0]*u[2],o[0]*u[1]-o[1]*u[0]],c=Z();return c[0]=u[0],c[1]=u[1],c[2]=u[2],c[4]=o[0],c[5]=o[1],c[6]=o[2],c[8]=l[0],c[9]=l[1],c[10]=l[2],c[12]=e[0],c[13]=e[1],c[14]=e[2],{model:c,normal:new Float32Array([u[0],u[1],u[2],o[0],o[1],o[2],l[0],l[1],l[2]])}}var Fr="#2C6BFF",vr="#7FB2FF",Se="#FF8A3D",wr="#6B7A99",go="#22355E",xo="#090F1C",yo="#05070E",be=[{mesh:uo,model:nt([0,dn,0],1),normalMat:tt,material:{baseColour:k(xo),roughness:.9,metalness:0}}],Lr=[],rt=[],_r=0;for(let e of at)for(let n of[1,2,3]){if(!_.some(o=>o.def.kind===e&&o.hops===n&&o.def.id!==v))continue;if(w&&rt.some(o=>o.hops===n)){_r++;continue}let t=we[e],r=eo(w?0:t.incDeg,w?0:t.nodeDeg);be.push({mesh:ho[n-1],model:r.model,normalMat:r.normal,material:{baseColour:k(go),roughness:.55,metalness:.2}}),rt.push({kind:e,hops:n})}var en=(w?re:ne).flatMap(e=>{if(e.dotted){let t=V(G(e.b,e.a)),r=Math.max(3,Math.round(t/(it*4.2)));return Array.from({length:r-1},(o,a)=>{let s=(a+1)/r,i=[e.a[0]+(e.b[0]-e.a[0])*s,e.a[1]+(e.b[1]-e.a[1])*s,e.a[2]+(e.b[2]-e.a[2])*s];return{mesh:Sr,model:nt(i,1),normalMat:tt,material:{baseColour:k(Se),roughness:.42,metalness:.1}}})}let n=po(e.a,e.b,e.r);return n?[{mesh:Mr,model:n.model,normalMat:n.normal,material:{baseColour:k(vr),roughness:.34,metalness:.12}}]:[]});be.push(...en);for(let e of _){let n=st(e),t=bo(n,q),r=e.def.count.state==="absent"?{mesh:mo,model:t.model,normalMat:t.normal,material:{baseColour:k(Se),roughness:.52,metalness:.04}}:e.def.count.state==="withheld"?{mesh:fo,model:nt(n,1),normalMat:tt,material:{baseColour:k(wr),roughness:.42,metalness:.15}}:{mesh:co,model:nt(n,e.radius),normalMat:tt,material:{baseColour:k(Fr),roughness:e.def.id===v?.22:.34,metalness:e.def.id===v?.36:.08}};be.push(r),Lr.push(r)}var Nr=[.14,-.966,-.22],Bn=[-8.2,dn,-8.2],Un=[8.2,5,8.2],kn=Lt({direction:Nr,colour:[1,1,1],extent:10.5},Nt(Bn,Un),_t(Bn,Un)),Eo=z(br)+rt.reduce((e,n)=>e+z(Ar[n.hops-1]),0)+_.filter(e=>e.def.count.state==="observed").length*z(gr)+z(yr)+z(Er)+en.filter(e=>e.mesh===Mr).length*z(Tr)+en.filter(e=>e.mesh===Sr).length*z(xr),Te=Ke;function Me(){let e=ce($,D/P);qe&&Gt.shadowPass(kn,Lr,Xt),ze.bind();let n=k(yo);R.clearColor(n[0],n[1],n[2],1),R.clear(R.COLOR_BUFFER_BIT|R.DEPTH_BUFFER_BIT),Gt.depthPrepass(e,be),Te&&(Pn.compute({depthTexture:ze.depthTexture,near:Kt,far:qt,fovDeg:un,aspect:D/P,radius:.9,strength:2}),ze.bind()),Gt.draw({viewProj:e,eye:q,lightDir:Nr,lightColour:[3.1,3.05,2.95],ambientGain:.52,lightVP:kn,shadow:qe?Xt:null,shadowStrength:.92,shadowTaps:Qe.shadowTaps,shadowBaseline:1536,draws:be,ao:Te?Pn.texture:null,screenSize:[D,P],fog:null}),R.bindFramebuffer(R.FRAMEBUFFER,null),R.viewport(0,0,D,P),R.disable(R.DEPTH_TEST),R.activeTexture(R.TEXTURE0),R.bindTexture(R.TEXTURE_2D,ze.texture),I.blit(Jr,t=>R.uniform1i(R.getUniformLocation(t,"uScene"),0))}var Gn=4e3;function To(e){let n=new Uint8Array(4),t=performance.now();Me(),R.readPixels(0,0,1,1,R.RGBA,R.UNSIGNED_BYTE,n);let r=Math.max(.01,performance.now()-t),o=Math.min(e,Math.max(1,Math.floor(Gn/r))),a=performance.now(),s=0;for(let i=0;i<o&&(Me(),s++,!(performance.now()-a>Gn));i++);return R.readPixels(0,0,1,1,R.RGBA,R.UNSIGNED_BYTE,n),{msPerFrame:(performance.now()-a)/s,measured:s}}var tn=To(jt),nn=tn.msPerFrame;function Ro(){let e={maxDelta:0,changed:0,fraction:0,sampled:0,meanWith:0,meanWithout:0,glErrorInProbe:0};if(!Ke)return{...e,refusal:"AO_DISABLED_BY_PARAM"};if(!qe)return{...e,refusal:"AO_PROBE_REQUIRES_SHADOW_PASS"};let n=new Uint8Array(D*P*4),t=new Uint8Array(D*P*4);R.getError(),Te=!0,Me(),R.readPixels(0,0,D,P,R.RGBA,R.UNSIGNED_BYTE,n),Te=!1,Me(),R.readPixels(0,0,D,P,R.RGBA,R.UNSIGNED_BYTE,t);let r=R.getError();Te=Ke;let o=0,a=0;for(let l=0;l<n.length;l+=4)o+=n[l]+n[l+1]+n[l+2],a+=t[l]+t[l+1]+t[l+2];let s=0,i=0;for(let l=0;l<n.length;l+=4){let c=Math.abs(n[l]-t[l])+Math.abs(n[l+1]-t[l+1])+Math.abs(n[l+2]-t[l+2]);c>s&&(s=c),c>6&&i++}let u=D*P;return{maxDelta:s,changed:i,fraction:Number((i/u).toFixed(5)),sampled:u,meanWith:Number((o/(u*3)).toFixed(2)),meanWithout:Number((a/(u*3)).toFixed(2)),glErrorInProbe:r,refusal:null}}var Ao=Ro(),Fe=ce($,D/P),_e=document.createElement("div");_e.style.cssText=`position:relative;overflow:hidden;width:${N}px;height:${L}px`;fe.parentNode?.insertBefore(_e,fe);_e.appendChild(fe);var oe=document.createElement("div");oe.style.cssText="position:absolute;inset:0;pointer-events:none";_e.appendChild(oe);var Ne="pointer-events:auto;user-select:text;-webkit-user-select:text",Vn=(e,n)=>{let t=document.createElement("div");return t.style.cssText=e,t.textContent=n,t},Dr=e=>{let n=document.createElement("span");return n.textContent=e,n},Pr=e=>{let n=document.createElement("span");return n.style.cssText=`width:5px;height:5px;border-radius:50%;background:${e};flex:0 0 auto`,n},Ir=9,mn=(e,n)=>Math.max(0,Math.min(e.x+e.w,n.x+n.w)-Math.max(e.x,n.x))*Math.max(0,Math.min(e.y+e.h,n.y+n.h)-Math.max(e.y,n.y));function fn(e){e.style.left="-99999px",e.style.top="0px",e.style.visibility="hidden",oe.appendChild(e);let n=e.getBoundingClientRect();return{x:0,y:0,w:Math.ceil(n.width),h:Math.ceil(n.height)}}function hn(e,n){e.style.left=`${n.x.toFixed(1)}px`,e.style.top=`${n.y.toFixed(1)}px`,e.style.visibility="visible"}var Ye={observed:_.filter(e=>e.def.count.state==="observed").length,absent:_.filter(e=>e.def.count.state==="absent").length,withheld:_.filter(e=>e.def.count.state==="withheld").length},ut=document.createElement("div");ut.style.cssText="position:absolute;left:18px;top:16px;display:flex;flex-direction:column;gap:7px;"+Ne;ut.innerHTML=`<div style="font:600 11px/1 ui-monospace,monospace;letter-spacing:.16em;color:#8FB7FF">ONTOLOGY AS ORBITS \xB7 ${w?"FLAT CONTROL \u2014 INCLINATIONS ZEROED":"RADIUS = HOPS \xB7 SIZE = RECORDS \xB7 TUBE = STRENGTH"}</div><div style="font:400 10.5px/1.55 ui-monospace,monospace;color:rgba(196,212,240,0.84)">${w?`${te} CROSSINGS IN PLANE &nbsp;\xB7&nbsp; ${Zt.pairs} AMBIGUOUS (NO DEPTH TO RESOLVE THEM)`:`${Ee.total} CROSSINGS ON SCREEN &nbsp;\xB7&nbsp; ${Ee.ambiguous} AMBIGUOUS &nbsp;\xB7&nbsp; FLAT LAYOUT: ${te} OF ${te}`}<br>INCLINATION SEPARATES ${at.length} ENTITY KINDS &nbsp;\xB7&nbsp; ${_.length} ENTITIES, ${J.length} RELATIONSHIPS</div><div style="font:500 10px/1.4 ui-monospace,monospace;color:#E0A94A">SYNTHETIC ONTOLOGY</div>`;oe.appendChild(ut);var So=lt([0,0,0]),Mo=Le(So),ct=document.createElement("div");ct.style.cssText="position:absolute;right:18px;bottom:16px;display:flex;flex-direction:column;gap:7px;align-items:flex-end;font:500 10px/1 ui-monospace,monospace;color:rgba(196,212,240,0.85);"+Ne;var Ht=e=>{let n=Math.max(1,2*ln(e)*Mo);return`<div style="display:flex;align-items:center;gap:8px"><span>STRENGTH ${e.toFixed(2)}</span><span style="width:46px;height:${n.toFixed(1)}px;background:${vr};display:inline-block"></span></div>`};ct.innerHTML=Ht(Ae)+Ht((Ae+Ze)/2)+Ht(Ze)+`<div style="display:flex;align-items:center;gap:8px"><span>STRENGTH NEVER MEASURED</span><span style="width:46px;display:inline-flex;gap:3px;justify-content:space-between">${('<span style="width:5px;height:5px;border-radius:50%;background:'+Se+'"></span>').repeat(5)}</span></div><div style="height:4px"></div><div style="display:flex;align-items:center;gap:8px"><span>RECORDS OBSERVED \xB7 ${Ye.observed}</span><span style="width:11px;height:11px;border-radius:50%;background:${Fr};display:inline-block"></span></div><div style="display:flex;align-items:center;gap:8px"><span>RECORDS ABSENT \xB7 ${Ye.absent} (RING \u2014 NOT ON THE SIZE SCALE)</span><span style="width:11px;height:11px;border-radius:50%;border:3px solid ${Se};box-sizing:border-box;display:inline-block"></span></div><div style="display:flex;align-items:center;gap:8px"><span>WITHHELD \xB7 ${Ye.withheld} (DRUM \u2014 PRESENT, UNLABELLED)</span><span style="width:11px;height:11px;background:${wr};display:inline-block"></span></div>`;oe.appendChild(ct);var Hn=e=>{let n=e.getBoundingClientRect(),t=_e.getBoundingClientRect();return{x:n.left-t.left,y:n.top-t.top,w:n.width,h:n.height}},ge=[Hn(ut),Hn(ct)],Fo=fr($).map(e=>({id:e.id,behind:e.behind,box:{x:e.cx-e.r,y:e.cy-e.r,w:2*e.r,h:2*e.r}})),vo=.12,Or=(e,n)=>Fo.some(t=>t.id!==n&&!t.behind&&mn(e,t.box)>vo*Math.max(1,t.box.w*t.box.h)),pn=e=>e.x>=2&&e.y>=2&&e.x+e.w<=N-2&&e.y+e.h<=L-2,Cr=(e,n)=>pn(e)&&!ge.some(t=>mn(t,e)>0)&&!Or(e,n),$n=10.4,zn=2.4,Wn=4.6,Br='<div style="font:600 12px/1.1 ui-monospace,monospace;letter-spacing:.16em;color:rgba(143,183,255,0.90)">REFERENCE PLANE \xB7 INCLINATION 0</div><div style="font:400 11px/1.2 ui-monospace,monospace;color:rgba(196,212,240,0.66)">'+(w?`THE FLAT DIAGRAM LIVES HERE \xB7 ${te} CROSSINGS, ALL AMBIGUOUS`:`WHAT A FLAT DIAGRAM HAS TO FIT INTO \xB7 ${te} CROSSINGS`)+"</div>",jn=(()=>{let e=$.azimuthDeg*K,n=[Math.cos(e),0,-Math.sin(e)],t=[Math.sin(e),0,Math.cos(e)],r=dn+.03,o=[t[0]*Wn,r,t[2]*Wn],a=(s,i)=>[o[0]+n[0]*s*$n/2+t[0]*i*zn/2,r,o[2]+n[2]*s*$n/2+t[2]*i*zn/2];return{topLeft:a(-1,-1),topRight:a(1,-1),bottomRight:a(1,1),bottomLeft:a(-1,1)}})();function Xn(){let e=document.createElement("div");e.style.cssText="position:absolute;left:18px;bottom:16px;display:flex;flex-direction:column;gap:3px",e.innerHTML=Br,oe.appendChild(e)}var wo=(()=>{let e=Ge(Fe,jn,N,L,100,40);if(Ve(e))return Xn(),{mode:"screen",reason:e.refusal,widthPx:0,heightPx:0,signedArea:0};let n=e.screen,t=(d,f)=>Math.hypot(n[d].x-n[f].x,n[d].y-n[f].y),r=Math.round((t(0,1)+t(3,2))/2),o=Math.round((t(0,3)+t(1,2))/2),a=n.map(d=>d.x),s=n.map(d=>d.y),i={x:Math.min(...a),y:Math.min(...s),w:Math.max(...a)-Math.min(...a),h:Math.max(...s)-Math.min(...s)},u=d=>(Xn(),{mode:"screen",reason:d,widthPx:r,heightPx:o,signedArea:Math.round(e.signedArea)});if(e.signedArea<=0)return u("BACK_FACING");if(r<26||o<26)return u("BELOW_26PX");if(!pn(i))return u("OFF_FRAME");let l=Ge(Fe,jn,N,L,r,o);if(Ve(l))return u(l.refusal);let c=document.createElement("div");return c.style.cssText=`position:absolute;left:0;top:0;width:${r}px;height:${o}px;transform-origin:0 0;transform:${l.transform};display:flex;flex-direction:column;justify-content:center;align-items:center;gap:3px;overflow:hidden`,c.innerHTML=Br,oe.appendChild(c),ge.push(i),{mode:"projected",reason:null,widthPx:r,heightPx:o,signedArea:Math.round(e.signedArea)}})(),Lo=[0,22,-22,48,-48,74,-74,120,-120,160],Yn=at.map(e=>{let n=Math.max(..._.filter(s=>s.def.kind===e&&s.def.id!==v).map(s=>s.hops)),t=we[e],r=Q(n),o=document.createElement("div");o.style.cssText="position:absolute;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;font:600 9.5px/1.25 ui-monospace,monospace;letter-spacing:.14em;color:rgba(127,178,255,0.82);text-shadow:0 1px 3px rgba(0,0,0,0.95);"+Ne,o.appendChild(Pr("rgba(127,178,255,0.9)")),o.appendChild(Dr(`${e} ${w?0:t.incDeg}\xB0`));let a=fn(o);for(let s of Lo){let i=Re(r,s,w?0:t.incDeg,w?0:t.nodeDeg),u=H(Fe,i,N,L);if(u.behind)continue;let l={x:u.sx-2.5,y:u.sy-a.h/2,w:a.w,h:a.h};if(Cr(l,null))return hn(o,l),ge.push(l),{kind:e,incDeg:w?0:t.incDeg,thetaDeg:s,sx:Math.round(u.sx),sy:Math.round(u.sy),onFrame:!0}}return o.remove(),{kind:e,incDeg:w?0:t.incDeg,thetaDeg:null,sx:0,sy:0,onFrame:!1}}),_o=[152,205,118,250,90,20],Qn=[1,2,3].map(e=>{let n=document.createElement("div");n.style.cssText="position:absolute;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;font:500 9.5px/1.25 ui-monospace,monospace;letter-spacing:.1em;color:rgba(196,212,240,0.70);text-shadow:0 1px 3px rgba(0,0,0,0.95);"+Ne,n.appendChild(Pr("rgba(196,212,240,0.8)")),n.appendChild(Dr(`${e} HOP${e>1?"S":""}`));let t=fn(n);for(let r of _o){let o=Re(Q(e),r,0,0),a=H(Fe,o,N,L);if(a.behind)continue;let s={x:a.sx-2.5,y:a.sy-t.h/2,w:t.w,h:t.h};if(Cr(s,null))return hn(n,s),ge.push(s),{hops:e,thetaDeg:r,sx:Math.round(a.sx),sy:Math.round(a.sy),onFrame:!0}}return n.remove(),{hops:e,thetaDeg:null,sx:0,sy:0,onFrame:!1}}),rn=_.map(e=>{let n=st(e),t=lt(n),r=H(Fe,n,N,L),o=2*e.radius*Le(t),a=e.def.count.state==="observed"?`${e.hops===0?"CORE":`${e.hops} HOP${e.hops>1?"S":""}`} \xB7 ${e.def.count.records.toLocaleString("en-US")} REC`:e.def.count.state==="absent"?`${e.hops} HOPS \xB7 RECORDS ABSENT`:"";return{b:e,p:n,dist:t,anchor:r,bodyPx:o,meta:a}}),No=[...rn].sort((e,n)=>e.dist-n.dist).map(e=>{let n=e.b.def.count.state==="withheld",t=e.anchor.behind||e.anchor.sx<0||e.anchor.sx>N||e.anchor.sy<0||e.anchor.sy>L,r=e.bodyPx<Ir,o=(()=>{if(e.b.def.id===v)return!1;let h=Je.get(v),p=st(h),m=G(e.p,q),b=V(m)||1,y=[m[0]/b,m[1]/b,m[2]/b],x=G(p,q),A=ee(x,y);return A<=0||A>=b?!1:ee(x,x)-A*A<h.radius*h.radius})();if(n||t||r||o)return{s:e,shown:!1,placement:null,tried:0,reason:n?"WITHHELD":t?"ANCHOR_OFF_FRAME":o?"BEHIND_CORE":"BODY_BELOW_9PX",blocked:{offFrame:0,collision:0,coversBody:0}};let a=document.createElement("div");a.style.cssText="position:absolute;display:inline-flex;flex-direction:column;gap:2px;align-items:center;text-align:center;white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,0.95);-webkit-font-smoothing:antialiased;"+Ne;let s=e.b.def.count.state==="absent"?Se:"rgba(196,212,240,0.80)";a.appendChild(Vn("font:700 11px/1.1 ui-monospace,monospace;color:#fff;letter-spacing:.02em",e.b.def.id)),a.appendChild(Vn(`font:500 9.5px/1.15 ui-monospace,monospace;letter-spacing:.08em;color:${s}`,e.meta));let i=fn(a),u=6,l=9,c=[["above",{x:e.anchor.sx-i.w/2,y:e.anchor.sy-e.bodyPx/2-u-i.h,w:i.w,h:i.h}],["below",{x:e.anchor.sx-i.w/2,y:e.anchor.sy+e.bodyPx/2+u,w:i.w,h:i.h}],["right",{x:e.anchor.sx+e.bodyPx/2+l,y:e.anchor.sy-i.h/2,w:i.w,h:i.h}],["left",{x:e.anchor.sx-e.bodyPx/2-l-i.w,y:e.anchor.sy-i.h/2,w:i.w,h:i.h}]],d={offFrame:0,collision:0,coversBody:0};for(let[h,p]of c){if(!pn(p)){d.offFrame++;continue}if(ge.some(m=>mn(m,p)>0)){d.collision++;continue}if(Or(p,e.b.def.id)){d.coversBody++;continue}return hn(a,p),ge.push(p),{s:e,shown:!0,placement:h,tried:c.length,reason:null,blocked:d}}a.remove();let f=d.collision>=d.coversBody&&d.collision>=d.offFrame?"LABEL_COLLISION":d.coversBody>=d.offFrame?"WOULD_COVER_A_BODY":"NO_PLACEMENT_ON_FRAME";return{s:e,shown:!1,placement:null,tried:c.length,reason:f,blocked:d}}),Ur=(w?re:ne).map(e=>{let n=[(e.a[0]+e.b[0])/2,(e.a[1]+e.b[1])/2,(e.a[2]+e.b[2])/2];return{edge:`${e.aId}~${e.bId}`,strength:e.rel.strength,radius:Number(e.r.toFixed(4)),px:Number((2*e.r*Le(lt(n))).toFixed(2)),dotted:e.dotted}}),$t=Ur.filter(e=>!e.dotted).map(e=>e.px),zt=No.map(({s:e,shown:n,placement:t,reason:r,blocked:o})=>({id:e.b.def.id,kind:e.b.def.kind,hops:e.b.hops,countState:e.b.def.count.state,records:e.b.def.count.state==="observed"?e.b.def.count.records:null,radius:Number(e.b.radius.toFixed(3)),bodyPx:Number(e.bodyPx.toFixed(1)),distance:Number(e.dist.toFixed(2)),labelShown:n,labelPlacement:t,labelHiddenBecause:r,labelBlockedBy:n?null:o})),on=Rt();if(on.length>0){let e="BRAND FIDELITY FAILED \u2014 "+on.map(t=>`${t.key}: expected ${t.expected}, got ${t.actual}`).join("; ");document.title="REFUSED";let n=document.getElementById("log");throw n&&(n.textContent=e),new Error(e)}var ae={tier:Qe.tier,tierDprScale:Qe.dprScale,tierShadowMapSize:$e(an,1536),shadowBaseline:1536,brandFidelity:on,layout:w?"flat":"orrery",ao:Ke,aoEffect:Ao,shadow:qe,hdr:I.hdr,eye:q.map(e=>Number(e.toFixed(2))),entities:_.length,relationships:J.length,unreachableEntities:Zr,hopsPerEntity:Object.fromEntries(_.map(e=>[e.def.id,e.hops])),shellRadii:{1:Q(1),2:Q(2),3:Q(3)},inclinationsByKind:Object.fromEntries(at.map(e=>[e,we[e].incDeg])),ringsDrawn:rt.length,ringsCollapsedOntoAnother:_r,crossings:{flatInPlane:te,flatAmbiguous:Zt.pairs,flatMinSeparationM:Number(Zt.minSeparation.toFixed(4)),flatBestOverOrderings:Xe,orderingsTried:pr,orderingSearchMs:Number(so.toFixed(1)),grazingPairs3D:Vt.pairs,grazingPairs3DDetail:Vt.worst,minSeparation3DM:Number(Vt.minSeparation.toFixed(4)),atThisCamera:{total:Ee.total,ambiguous:Ee.ambiguous,minSepM:Number(Ee.minSep.toFixed(3))},sweepAzimuths:pe.length,sweepScreenCrossings:io,sweepWorstAmbiguous:Cn,ambiguousCrossingsAvoided:te-Cn},linksThroughBodies:{orrery:We(ne,!1).length,flat:We(re,!0).length,orreryDetail:We(ne,!1),flatDetail:We(re,!0)},countStates:Ye,sizeScale:{base:nr,perDecade:rr,observedRange:[Number(Math.min(..._.filter(e=>e.def.count.state==="observed").map(e=>e.radius)).toFixed(3)),Number(Math.max(..._.filter(e=>e.def.count.state==="observed").map(e=>e.radius)).toFixed(3))],absentOuter:sr,withheldOuter:sn},bodyPx:{min:Number(Math.min(...rn.map(e=>e.bodyPx)).toFixed(1)),max:Number(Math.max(...rn.map(e=>e.bodyPx)).toFixed(1)),floor:Ir},bodyOverlapsOnScreen:{pairs:Jt($).length,detail:Jt($)},cleanAzimuths:lo,strengthScale:{min:Ae,max:Ze,radiusMin:Qt,radiusMax:lr},ringPx:Number((2*Rr*Le(lt([0,0,-Q(3)]))).toFixed(2)),linkPx:{thinnest:Math.min(...$t),thickest:Math.max(...$t)},strengthLegible:Math.min(...$t)>=1.5,labelsShown:zt.filter(e=>e.labelShown).length,labelsHiddenBy:zt.filter(e=>!e.labelShown).reduce((e,n)=>{let t=n.labelHiddenBecause??"UNKNOWN";return e[t]=(e[t]??0)+1,e},{}),plate:wo,planeTicks:Yn,planeTicksOffFrame:Yn.filter(e=>!e.onFrame).length,hopTicks:Qn,hopTicksOffFrame:Qn.filter(e=>!e.onFrame).length,perEntity:zt,perLink:Ur,sweepDetail:pe,glError:R.getError(),triangles:Eo,drawCalls:be.length,shadowMap:Xt.size,resolution:`${D}x${P}`,dprScale:ve,frames:tn.measured,framesRequested:jt,sweepTruncated:tn.measured<jt,paramClamps:Jn,msPerFrame:Number(nn.toFixed(3)),fps:Math.round(1e3/nn),renderer:"",rendererClass:"",headroom:null,headroomRefusal:null,hardwareMsPerFrame:null},kr=(()=>{let e=R.getExtension("WEBGL_debug_renderer_info");return e?String(R.getParameter(e.UNMASKED_RENDERER_WEBGL)):"unknown"})(),bn=/swiftshader|llvmpipe|software/i.test(kr);ae.renderer=kr;ae.rendererClass=bn?"software":"hardware";ae.headroom=bn?null:Number((16.6-nn).toFixed(3));ae.headroomRefusal=bn?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null;ae.hardwareMsPerFrame=null;globalThis.E4=ae;var{perEntity:Kn,perLink:qn,planeTicks:Va,hopTicks:Ha,sweepDetail:$a,...Do}=ae;Qr.textContent=JSON.stringify(Do,null,2)+`

perEntity (${Kn.length}, full detail on globalThis.E4):
`+Kn.map(e=>`  ${e.id.padEnd(13)} ${e.kind.padEnd(11)} h${e.hops} ${e.countState.padEnd(9)} r ${e.radius.toFixed(2)} ${String(e.bodyPx).padStart(5)}px ${String(e.distance).padStart(6)}m ${e.labelShown?"LABEL":`no label: ${e.labelHiddenBecause}`}`).join(`
`)+`

perLink (${qn.length}):
`+qn.map(e=>`  ${e.edge.padEnd(28)} s ${e.strength===null?"ABSENT":e.strength.toFixed(2)} r ${e.radius.toFixed(3)} ${String(e.px).padStart(5)}px${e.dotted?" (pips)":""}`).join(`
`);Me();tr.markRendered();document.title="READY";

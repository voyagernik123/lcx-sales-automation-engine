var mr={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected.",FEEDBACK_LOOP:"A layer of this view was asked to read the surface it draws into, which every driver refuses, so the layer is not being drawn. This is a defect in the renderer, not in the data."};function w(t,n){return n===void 0?{kind:"refused",code:t,reason:mr[t]}:{kind:"refused",code:t,reason:mr[t],detail:n}}function ot(t){return t.kind==="stage"}function at(t,n={}){let r=t.getContext("webgl2",{antialias:n.antialias??!1,alpha:n.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!r)return w("NO_WEBGL2");let e=r.getExtension("EXT_color_buffer_float"),o=t.width,a=t.height,i=e?r.RGBA16F:r.RGBA8,l=e?r.HALF_FLOAT:r.UNSIGNED_BYTE,m=(p,x)=>{let M=r.createTexture();r.bindTexture(r.TEXTURE_2D,M),r.texImage2D(r.TEXTURE_2D,0,i,p,x,0,r.RGBA,l,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE);let R=r.createFramebuffer();r.bindFramebuffer(r.FRAMEBUFFER,R),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,M,0);let v=r.checkFramebufferStatus(r.FRAMEBUFFER);return v!==r.FRAMEBUFFER_COMPLETE?w("FRAMEBUFFER_INCOMPLETE",`status 0x${v.toString(16)} at ${p}\xD7${x}`):{texture:M,framebuffer:R,width:p,height:x}},s=n.bloomShift??2,d={w:o,h:a},u=m(o,a);if("kind"in u)return u;let c=m(Math.max(1,o>>s),Math.max(1,a>>s));if("kind"in c)return c;let h=m(Math.max(1,o>>s),Math.max(1,a>>s));if("kind"in h)return h;let b=r.createVertexArray();r.bindVertexArray(b);let f=r.createBuffer();r.bindBuffer(r.ARRAY_BUFFER,f),r.bufferData(r.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),r.STATIC_DRAW),r.enableVertexAttribArray(0),r.vertexAttribPointer(0,2,r.FLOAT,!1,0,0),r.bindVertexArray(null);let E=[];return{kind:"stage",gl:r,cssWidth:t.clientWidth||o,cssHeight:t.clientHeight||a,hdr:!!e,get width(){return d.w},get height(){return d.h},get scene(){return u},get bloomA(){return c},get bloomB(){return h},setRegion(p,x){let M=Math.max(1,Math.round(p)),R=Math.max(1,Math.round(x));if(!(M===d.w&&R===d.h)){d={w:M,h:R};for(let v of[u,c,h])"kind"in v||(r.deleteFramebuffer(v.framebuffer),r.deleteTexture(v.texture));u=m(M,R),c=m(Math.max(1,M>>s),Math.max(1,R>>s)),h=m(Math.max(1,M>>s),Math.max(1,R>>s))}},compile(p,x){let M=(G,F)=>{let T=r.createShader(G);if(r.shaderSource(T,F),r.compileShader(T),!r.getShaderParameter(T,r.COMPILE_STATUS)){let y=r.getShaderInfoLog(T)??"(no log)";return r.deleteShader(T),w("SHADER_COMPILE_FAILED",y)}return T},R=M(r.VERTEX_SHADER,p);if(typeof R=="object"&&"kind"in R)return R;let v=M(r.FRAGMENT_SHADER,x);if(typeof v=="object"&&"kind"in v)return r.deleteShader(R),v;let S=r.createProgram();if(r.attachShader(S,R),r.attachShader(S,v),r.linkProgram(S),!r.getProgramParameter(S,r.LINK_STATUS)){let G=r.getProgramInfoLog(S)??"(no log)";return r.deleteShader(R),r.deleteShader(v),r.deleteProgram(S),w("PROGRAM_LINK_FAILED",G)}return r.detachShader(S,R),r.detachShader(S,v),r.deleteShader(R),r.deleteShader(v),E.push(S),S},bindTarget(p){r.bindFramebuffer(r.FRAMEBUFFER,p?p.framebuffer:null),r.viewport(0,0,p?p.width:d.w,p?p.height:d.h)},blit(p,x){r.useProgram(p),r.bindVertexArray(b),x?.(p),r.drawArrays(r.TRIANGLES,0,3),r.bindVertexArray(null)},dispose(){for(let x of E)r.deleteProgram(x);for(let x of[u,c,h])"kind"in x||(r.deleteFramebuffer(x.framebuffer),r.deleteTexture(x.texture));if(r.deleteBuffer(f),r.deleteVertexArray(b),t.isConnected)return;let p=r.getExtension("WEBGL_lose_context");p!==null&&typeof p.loseContext=="function"&&p.loseContext()}}}var de=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function Ne(t,n){let r=new Float32Array(16);for(let e=0;e<4;e++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=t[i*4+o]*n[e*4+i];r[e*4+o]=a}return r}var re=(t,n)=>[t[0]-n[0],t[1]-n[1],t[2]-n[2]],Pe=(t,n)=>t[0]*n[0]+t[1]*n[1]+t[2]*n[2],te=(t,n)=>[t[1]*n[2]-t[2]*n[1],t[2]*n[0]-t[0]*n[2],t[0]*n[1]-t[1]*n[0]];function V(t){let n=Math.hypot(t[0],t[1],t[2]);return n===0?t:[t[0]/n,t[1]/n,t[2]/n]}function it(t,n,r,e){let o=1/Math.tan(t/2);return new Float32Array([o/n,0,0,0,0,o,0,0,0,0,(e+r)/(r-e),-1,0,0,2*e*r/(r-e),0])}function st(t,n,r,e,o,a){let i=n-t,l=e-r,m=a-o;return new Float32Array([2/i,0,0,0,0,2/l,0,0,0,0,-2/m,0,-(n+t)/i,-(e+r)/l,-(a+o)/m,1])}function Ue(t,n,r){let e=V(re(t,n)),o=te(r,e);if(Math.hypot(o[0],o[1],o[2])<1e-8)return de();let a=V(o),i=te(e,a);return new Float32Array([a[0],i[0],e[0],0,a[1],i[1],e[1],0,a[2],i[2],e[2],0,-Pe(a,t),-Pe(i,t),-Pe(e,t),1])}function dr(t,n){let r=[0,1,2,3].map(o=>t[0+o]*n[0]+t[4+o]*n[1]+t[8+o]*n[2]+t[12+o]),e=r[3];return{x:r[0]/e,y:r[1]/e,z:r[2]/e,w:e}}function Ce(t,n,r,e){let o=dr(t,n);return{sx:(o.x*.5+.5)*r,sy:(1-(o.y*.5+.5))*e,behind:o.w<=0}}function fr(t){return t<=.04045?t/12.92:Math.pow((t+.055)/1.055,2.4)}function lt(t){return t<=.0031308?t*12.92:1.055*Math.pow(t,1/2.4)-.055}var bn=/^#?([0-9a-fA-F]{6})$/;function W(t){let n=bn.exec(t.trim());if(!n)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(t)}`);let r=n[1];return[0,2,4].map(e=>fr(parseInt(r.slice(e,e+2),16)/255))}function ut(t){return`#${t.map(r=>{let e=lt(Math.min(1,Math.max(0,r)));return Math.round(e*255).toString(16).padStart(2,"0")}).join("")}`}var ne={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},ct=Object.freeze(Object.fromEntries(Object.keys(ne).map(t=>[t,W(ne[t])])));var hr=.4;var mt=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${hr.toFixed(2)}); }`,dt=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function ft(){let t=[];for(let n of Object.keys(ne)){let r=ne[n].toLowerCase(),e=ut(ct[n]).toLowerCase();e!==r&&t.push({key:n,expected:r,actual:e})}return t}function En(t){let n=[1/0,1/0,1/0],r=[-1/0,-1/0,-1/0];for(let e=0;e<t.length;e+=3)for(let o=0;o<3;o++){let a=t[e+o];a<n[o]&&(n[o]=a),a>r[o]&&(r[o]=a)}return t.length===0?{min:[0,0,0],max:[0,0,0]}:{min:n,max:r}}function pr(t,n,r,e){let o=new Float32Array(t.length);for(let i=0;i<e.length;i+=3){let l=e[i],m=e[i+1],s=e[i+2],d=l*3,u=m*3,c=s*3,h=l*2,b=m*2,f=s*2,E=t[u]-t[d],g=t[u+1]-t[d+1],p=t[u+2]-t[d+2],x=t[c]-t[d],M=t[c+1]-t[d+1],R=t[c+2]-t[d+2],v=r[b]-r[h],S=r[b+1]-r[h+1],G=r[f]-r[h],F=r[f+1]-r[h+1],T=v*F-G*S;if(Math.abs(T)<1e-12)continue;let y=1/T,C=(E*F-x*S)*y,H=(g*F-M*S)*y,O=(p*F-R*S)*y;for(let L of[d,u,c])o[L]=o[L]+C,o[L+1]=o[L+1]+H,o[L+2]=o[L+2]+O}let a=new Float32Array(t.length);for(let i=0;i<a.length;i+=3){let l=n[i],m=n[i+1],s=n[i+2],d=o[i],u=o[i+1],c=o[i+2],h=d*l+u*m+c*s;d-=l*h,u-=m*h,c-=s*h;let b=Math.hypot(d,u,c);b<1e-8&&(Math.abs(l)<.9?(d=0,u=-s,c=m):(d=-s,u=0,c=l),b=Math.hypot(d,u,c)||1),a[i]=d/b,a[i+1]=u/b,a[i+2]=c/b}return a}function br(t,n){let r=new Float32Array(t.length);for(let e=0;e<n.length;e+=3){let o=n[e]*3,a=n[e+1]*3,i=n[e+2]*3,l=t[a]-t[o],m=t[a+1]-t[o+1],s=t[a+2]-t[o+2],d=t[i]-t[o],u=t[i+1]-t[o+1],c=t[i+2]-t[o+2],h=m*c-s*u,b=s*d-l*c,f=l*u-m*d;for(let E of[o,a,i])r[E]=r[E]+h,r[E+1]=r[E+1]+b,r[E+2]=r[E+2]+f}for(let e=0;e<r.length;e+=3){let o=Math.hypot(r[e],r[e+1],r[e+2]);o>0&&(r[e]=r[e]/o,r[e+1]=r[e+1]/o,r[e+2]=r[e+2]/o)}return r}function pt(t,n,r,e,o){let{min:a,max:i}=En(t),l=e??br(t,r);return{positions:t,normals:l,uvs:n,indices:r,min:a,max:i,tangents:o??pr(t,l,n,r)}}function fe(t=.5,n=24,r=32){let e=Math.max(2,n),o=Math.max(3,r),a=(e+1)*(o+1),i=new Float32Array(a*3),l=new Float32Array(a*3),m=new Float32Array(a*2),s=new Uint16Array(e*o*6),d=0,u=0,c=0;for(let h=0;h<=e;h++){let b=h/e*Math.PI;for(let f=0;f<=o;f++){let E=f/o*Math.PI*2,g=Math.sin(b)*Math.cos(E),p=Math.cos(b),x=Math.sin(b)*Math.sin(E);i[d]=g*t,i[d+1]=p*t,i[d+2]=x*t,l[d]=g,l[d+1]=p,l[d+2]=x,d+=3,m[u++]=f/o,m[u++]=h/e}}for(let h=0;h<e;h++)for(let b=0;b<o;b++){let f=h*(o+1)+b,E=f+1,g=f+(o+1),p=g+1;s[c++]=f,s[c++]=E,s[c++]=g,s[c++]=E,s[c++]=p,s[c++]=g}return pt(i,m,s,l)}function bt(t=.5,n=.08,r=64,e=24){let o=Math.max(3,r),a=Math.max(3,e),i=[],l=[],m=[],s=[],d=[];for(let u=0;u<=o;u++){let c=u/o*Math.PI*2,h=Math.cos(c),b=Math.sin(c);for(let f=0;f<=a;f++){let E=f/a*Math.PI*2,g=Math.cos(E),p=Math.sin(E);i.push((t+n*g)*h,n*p,(t+n*g)*b),l.push(h*g,p,b*g),m.push(u/o,f/a),d.push(-b,0,h)}}for(let u=0;u<o;u++)for(let c=0;c<a;c++){let h=u*(a+1)+c,b=h+1,f=h+(a+1),E=f+1;s.push(h,b,f,b,E,f)}return pt(new Float32Array(i),new Float32Array(m),new Uint16Array(s),new Float32Array(l),new Float32Array(d))}function ht(t,n){let r=t*Math.PI/180,e=n*Math.PI/180,o=Math.cos(r);return[o*Math.cos(e),Math.sin(r),o*Math.sin(e)]}function Et(t,n,r,e,o=1,a=.012,i=.22,l=96,m=8){let s=Math.max(8,l),d=Math.max(3,m),u=ht(t,n),c=ht(r,e),h=Math.max(-1,Math.min(1,u[0]*c[0]+u[1]*c[1]+u[2]*c[2])),b=Math.acos(h),f=b<1e-4||Math.abs(Math.PI-b)<1e-4,E=Math.sin(b),g=i*o*(b/Math.PI),p=[],x=[],M=[],R=[],v=[],S=F=>{if(f)return[u[0]+(c[0]-u[0])*F,u[1]+(c[1]-u[1])*F,u[2]+(c[2]-u[2])*F];let T=Math.sin((1-F)*b)/E,y=Math.sin(F*b)/E;return[u[0]*T+c[0]*y,u[1]*T+c[1]*y,u[2]*T+c[2]*y]},G=F=>{let T=S(F),y=Math.hypot(T[0],T[1],T[2])||1,C=o+g*Math.sin(Math.PI*F);return[T[0]/y*C,T[1]/y*C,T[2]/y*C]};for(let F=0;F<=s;F++){let T=F/s,y=G(T),C=G(Math.min(1,T+1/s)),H=G(Math.max(0,T-1/s)),O=C[0]-H[0],L=C[1]-H[1],J=C[2]-H[2],Ze=Math.hypot(O,L,J)||1;O/=Ze,L/=Ze,J/=Ze;let et=Math.hypot(y[0],y[1],y[2])||1,or=y[0]/et,ar=y[1]/et,ir=y[2]/et,ue=L*ir-J*ar,ce=J*or-O*ir,me=O*ar-L*or,tt=Math.hypot(ue,ce,me)||1;ue/=tt,ce/=tt,me/=tt;let fn=ce*J-me*L,hn=me*O-ue*J,pn=ue*L-ce*O;for(let De=0;De<=d;De++){let sr=De/d*Math.PI*2,rt=Math.cos(sr),nt=Math.sin(sr),lr=ue*rt+fn*nt,ur=ce*rt+hn*nt,cr=me*rt+pn*nt;p.push(y[0]+lr*a,y[1]+ur*a,y[2]+cr*a),x.push(lr,ur,cr),M.push(T,De/d),R.push(O,L,J)}}for(let F=0;F<s;F++)for(let T=0;T<d;T++){let y=F*(d+1)+T,C=y+1,H=y+(d+1),O=H+1;v.push(y,H,C,C,H,O)}return pt(new Float32Array(p),new Float32Array(M),p.length/3>65535?new Uint32Array(v):new Uint16Array(v),new Float32Array(x),new Float32Array(R))}function Z(t){return t.indices.length/3}var Er=t=>[t.DEPTH_TEST,t.CULL_FACE,t.BLEND];function I(t){return[t.getParameter(t.FRAMEBUFFER_BINDING),t.getParameter(t.VIEWPORT),t.getParameter(t.DEPTH_WRITEMASK),Er(t).map(n=>t.getParameter(n))]}function k(t,n){t.bindFramebuffer(t.FRAMEBUFFER,n[0]);let r=n[1];t.viewport(r[0]??0,r[1]??0,r[2]??0,r[3]??0),t.depthMask(n[2]),Er(t).forEach((e,o)=>{n[3][o]?t.enable(e):t.disable(e)})}function oe(t,n){for(let r=n-1;r>=0;r--)t.activeTexture(t.TEXTURE0+r),t.bindTexture(t.TEXTURE_2D,null),t.bindTexture(t.TEXTURE_3D,null);t.activeTexture(t.TEXTURE0)}var Tt=["minimum","reduced","full"],xt={full:{dprScale:2,ao:!0,dof:!0,shadowMapSize:1536,shadowTaps:9,volumeLightSteps:6},reduced:{dprScale:2,ao:!0,dof:!1,shadowMapSize:1024,shadowTaps:9,volumeLightSteps:4},minimum:{dprScale:1,ao:!1,dof:!1,shadowMapSize:512,shadowTaps:1,volumeLightSteps:1}};function Be(t,n){let r=Number.isFinite(n)&&n>0?n:1024,e=xt[t].shadowMapSize/xt.full.shadowMapSize,o=r*e,a=2**Math.round(Math.log2(o));return Math.max(256,Math.min(r,a))}function yt(t){return{tier:t,...xt[t]}}var gt=89,Rt=Math.PI/180;function he(t){let n=Math.max(-gt,Math.min(gt,t.elevationDeg))*Rt,r=t.azimuthDeg*Rt,e=Math.max(1e-4,t.distance),o=Math.sin(n)*e,a=Math.cos(n)*e;return[t.target[0]+Math.sin(r)*a,t.target[1]+o,t.target[2]+Math.cos(r)*a]}function Oe(t,n){let r=he(t),e=t.near??Math.max(.01,t.distance/100),o=t.far??Math.max(e+1,t.distance*8),a=it((t.fovDeg??38)*Rt,Math.max(.001,n),e,o),i=Ue(r,t.target,[0,1,0]);return Ne(a,i)}function Ft(t,n,r){let e=V(t.direction),o=t.extent??Math.max(.1,r*1.35),a=Math.max(1,r*2),i=[n[0]-e[0]*a,n[1]-e[1]*a,n[2]-e[2]*a],l=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],m=Ue(i,n,l),s=st(-o,o,-o,o,.01,a+r*2+o);return Ne(s,m)}function At(t,n){let r=re([n[0],n[1],n[2]],[t[0],t[1],t[2]]);return Math.hypot(r[0],r[1],r[2])/2}function vt(t,n){return[(t[0]+n[0])/2,(t[1]+n[1])/2,(t[2]+n[2])/2]}function Mt(t,n,r){let{gl:e}=t,o=Math.max(1,Math.floor(n)),a=Math.max(1,Math.floor(r)),i=e.createFramebuffer(),l=e.createTexture(),m=e.createTexture();if(!i||!l||!m)return w("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let s=t.hdr?e.RGBA16F:e.RGBA8,d=t.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,u=()=>{e.bindTexture(e.TEXTURE_2D,l),e.texImage2D(e.TEXTURE_2D,0,s,o,a,0,e.RGBA,d,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,m),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,o,a,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,l,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,m,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};u(),e.bindFramebuffer(e.FRAMEBUFFER,i);let c=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),c!==e.FRAMEBUFFER_COMPLETE?w("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${c.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:l,depthTexture:m,get width(){return o},get height(){return a},bind(){e.bindFramebuffer(e.FRAMEBUFFER,i),e.viewport(0,0,o,a)},resize(h,b){let f=Math.max(1,Math.floor(h)),E=Math.max(1,Math.floor(b));f===o&&E===a||(o=f,a=E,u())},dispose(){e.deleteFramebuffer(i),e.deleteTexture(l),e.deleteTexture(m)}}}function St(t,n=1024){let{gl:r}=t,e=Math.max(256,Math.min(2048,Math.floor(n))),o=r.createFramebuffer(),a=r.createTexture();if(!o||!a)return w("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");r.bindTexture(r.TEXTURE_2D,a),r.texImage2D(r.TEXTURE_2D,0,r.DEPTH_COMPONENT24,e,e,0,r.DEPTH_COMPONENT,r.UNSIGNED_INT,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),r.bindFramebuffer(r.FRAMEBUFFER,o),r.framebufferTexture2D(r.FRAMEBUFFER,r.DEPTH_ATTACHMENT,r.TEXTURE_2D,a,0);let i=r.checkFramebufferStatus(r.FRAMEBUFFER);return r.bindFramebuffer(r.FRAMEBUFFER,null),i!==r.FRAMEBUFFER_COMPLETE?w("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:e,bind(){r.bindFramebuffer(r.FRAMEBUFFER,o),r.viewport(0,0,e,e)},dispose(){r.deleteFramebuffer(o),r.deleteTexture(a)}}}var ke=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,Ie={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function Ge(t,n,r={}){let e=r.zenith??Ie.zenith,o=r.horizon??Ie.horizon,a=r.ground??Ie.ground;t.uniform3f(t.getUniformLocation(n,"uSkyZenith"),e[0],e[1],e[2]),t.uniform3f(t.getUniformLocation(n,"uSkyHorizon"),o[0],o[1],o[2]),t.uniform3f(t.getUniformLocation(n,"uSkyGround"),a[0],a[1],a[2])}var xn=`#version 300 es
precision highp float;
out vec2 vNdc;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`,Tn=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${ke}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;function wt(t){let{gl:n}=t,r=t.compile(xn,Tn);return"kind"in r?r:{draw(e){let o=V(re(e.target,e.eye)),a=Math.abs(o[1])>.999?[0,0,1]:[0,1,0],i=V(te(o,a)),l=V(te(i,o)),m=I(n);n.disable(n.DEPTH_TEST),n.depthMask(!1),n.disable(n.BLEND),n.useProgram(r),n.uniform3f(n.getUniformLocation(r,"uRight"),i[0],i[1],i[2]),n.uniform3f(n.getUniformLocation(r,"uUp"),l[0],l[1],l[2]),n.uniform3f(n.getUniformLocation(r,"uForward"),o[0],o[1],o[2]),n.uniform1f(n.getUniformLocation(r,"uTanHalfFov"),Math.tan(e.fovDeg*Math.PI/360)),n.uniform1f(n.getUniformLocation(r,"uAspect"),Math.max(.001,e.aspect)),Ge(n,r,e.sky),t.blit(r),k(n,m)},dispose(){n.deleteProgram(r)}}}var xr=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,Lt=`#version 300 es
precision highp float;
void main(){}`,yn=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,Tr=`#version 300 es
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
}`,yr=`#version 300 es
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
${ke}

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
}`;function ee(t,n){let{gl:r}=t,e=r.createVertexArray(),o=r.createBuffer(),a=r.createBuffer(),i=r.createBuffer(),l=r.createBuffer();return!e||!o||!a||!i||!l?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(r.bindVertexArray(e),r.bindBuffer(r.ARRAY_BUFFER,o),r.bufferData(r.ARRAY_BUFFER,n.positions,r.STATIC_DRAW),r.enableVertexAttribArray(0),r.vertexAttribPointer(0,3,r.FLOAT,!1,0,0),r.bindBuffer(r.ARRAY_BUFFER,a),r.bufferData(r.ARRAY_BUFFER,n.normals,r.STATIC_DRAW),r.enableVertexAttribArray(1),r.vertexAttribPointer(1,3,r.FLOAT,!1,0,0),r.bindBuffer(r.ARRAY_BUFFER,i),r.bufferData(r.ARRAY_BUFFER,n.tangents,r.STATIC_DRAW),r.enableVertexAttribArray(2),r.vertexAttribPointer(2,3,r.FLOAT,!1,0,0),r.bindBuffer(r.ELEMENT_ARRAY_BUFFER,l),r.bufferData(r.ELEMENT_ARRAY_BUFFER,n.indices,r.STATIC_DRAW),r.bindVertexArray(null),{vao:e,indexCount:n.indices.length,indexType:n.indices instanceof Uint32Array?r.UNSIGNED_INT:r.UNSIGNED_SHORT,dispose(){r.deleteVertexArray(e),r.deleteBuffer(o),r.deleteBuffer(a),r.deleteBuffer(i),r.deleteBuffer(l)}})}function _t(t){let{gl:n}=t,r=t.compile(xr,Lt);if("kind"in r)return r;let e=t.compile(Tr,yr);if("kind"in e)return e;let o=t.compile(yn,Lt);if("kind"in o)return o;let a=(i,l)=>n.getUniformLocation(i,l);return{shadowPass(i,l,m,s){let d=I(n),u=s??(()=>{});m.bind(),u("shadow.bind"),n.clear(n.DEPTH_BUFFER_BIT),n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.FRONT),n.useProgram(r),u("useProgram(shadow)"),n.uniformMatrix4fv(a(r,"uLightVP"),!1,i),u("uLightVP");for(let c of l)n.uniformMatrix4fv(a(r,"uModel"),!1,c.model),u("shadow uModel"),n.bindVertexArray(c.mesh.vao),u("shadow bindVAO"),n.drawElements(n.TRIANGLES,c.mesh.indexCount,c.mesh.indexType,0),u("shadow drawElements");n.bindVertexArray(null),n.cullFace(n.BACK),k(n,d)},depthPrepass(i,l){let m=I(n);n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.colorMask(!1,!1,!1,!1),n.useProgram(o),n.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let s of l)n.uniformMatrix4fv(a(o,"uModel"),!1,s.model),n.bindVertexArray(s.mesh.vao),n.drawElements(n.TRIANGLES,s.mesh.indexCount,s.mesh.indexType,0);n.bindVertexArray(null),n.colorMask(!0,!0,!0,!0),k(n,m)},draw(i){let l=I(n),m=i.onStep??(()=>{});if(n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.useProgram(e),n.uniformMatrix4fv(a(e,"uViewProj"),!1,i.viewProj),m("uViewProj"),n.uniform3fv(a(e,"uEye"),i.eye),m("uEye"),n.uniform3fv(a(e,"uLightDir"),i.lightDir),m("uLightDir"),n.uniform3fv(a(e,"uLightColour"),i.lightColour),m("uLightColour"),n.uniform1f(a(e,"uAmbientGain"),i.ambientGain??1),m("uAmbientGain"),i.fog&&i.fog.density>0){n.uniform1f(a(e,"uFogDensity"),i.fog.density),n.uniform1f(a(e,"uFogHeight"),i.fog.height),n.uniform1f(a(e,"uFogFloor"),i.fog.floor??0);let s=i.fog.colour;s==="sky"?n.uniform3f(a(e,"uFogColour"),-1,-1,-1):n.uniform3f(a(e,"uFogColour"),s[0],s[1],s[2]),m("fog")}else n.uniform1f(a(e,"uFogDensity"),0);if(Ge(n,e,i.sky),m("bindSky"),i.ao&&i.screenSize?(n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,i.ao),n.uniform1i(a(e,"uAO"),1),n.uniform2f(a(e,"uScreenSize"),i.screenSize[0],i.screenSize[1]),n.uniform1f(a(e,"uAOEnabled"),1)):n.uniform1f(a(e,"uAOEnabled"),0),m("bindAO"),n.uniformMatrix4fv(a(e,"uLightVP"),!1,i.lightVP),m("lit uLightVP"),i.shadow){n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,i.shadow.depthTexture),n.uniform1i(a(e,"uShadowMap"),0),n.uniform1f(a(e,"uShadowTexel"),1/i.shadow.size),n.uniform1f(a(e,"uShadowStrength"),i.shadowStrength??1),n.uniform1i(a(e,"uShadowTaps"),(i.shadowTaps??9)>=9?9:1);let s=i.shadowBaseline,d=s&&s>0&&i.shadow.size>0?s/i.shadow.size:1;n.uniform1f(a(e,"uShadowBiasScale"),Number.isFinite(d)&&d>0?d:1)}else n.uniform1f(a(e,"uShadowStrength"),0);for(let s of i.draws)n.uniformMatrix4fv(a(e,"uModel"),!1,s.model),n.uniformMatrix3fv(a(e,"uNormalMat"),!1,s.normalMat),m("uNormalMat"),n.uniform3fv(a(e,"uBaseColour"),s.material.baseColour),m("uBaseColour"),n.uniform1f(a(e,"uRoughness"),s.material.roughness),n.uniform1f(a(e,"uMetalness"),s.material.metalness),n.uniform1f(a(e,"uAnisotropy"),s.material.anisotropy??0),n.bindVertexArray(s.mesh.vao),m("lit bindVAO"),n.drawElements(n.TRIANGLES,s.mesh.indexCount,s.mesh.indexType,0),m("lit drawElements");n.bindVertexArray(null),oe(n,2),k(n,l)},dispose(){n.deleteProgram(r),n.deleteProgram(e),n.deleteProgram(o)}}}var pe=`
uniform sampler2D uDepth;
uniform vec2 uNearFar;

float linearDepthAt(vec2 uv) {
  float d = texture(uDepth, uv).r * 2.0 - 1.0;
  float n = uNearFar.x, f = uNearFar.y;
  return (2.0 * n * f) / (f + n - d * (f - n));
}`,Rr=`
uniform float uTanHalfFov;
uniform float uAspect;

vec3 viewPosAt(vec2 uv) {
  float z = linearDepthAt(uv);
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x * uTanHalfFov * uAspect * z, ndc.y * uTanHalfFov * z, -z);
}`,Fr=pe+Rr,gr=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,gn=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${Fr}

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
}`,Rn=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${pe}

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
}`;function Dt(t,n,r){let{gl:e}=t,o=t.compile(gr,gn);if("kind"in o)return o;let a=t.compile(gr,Rn);if("kind"in a)return a;let i=Math.max(1,n>>1),l=Math.max(1,r>>1),m=()=>{let f=e.createFramebuffer(),E=e.createTexture();return!f||!E?null:{fb:f,tex:E}},s=m(),d=m();if(!s||!d)return w("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let u=()=>{for(let f of[s,d])e.bindTexture(e.TEXTURE_2D,f.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,i,l,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,f.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,f.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};u(),e.bindFramebuffer(e.FRAMEBUFFER,s.fb);let c=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),c!==e.FRAMEBUFFER_COMPLETE)return w("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${c.toString(16)}).`);let h=(f,E,g,p,x)=>{e.activeTexture(e.TEXTURE0+x),e.bindTexture(e.TEXTURE_2D,E),e.uniform1i(e.getUniformLocation(f,"uDepth"),x),e.uniform2f(e.getUniformLocation(f,"uNearFar"),g,p)},b=(f,E,g,p,x,M,R)=>{h(f,E,g,p,R),e.uniform1f(e.getUniformLocation(f,"uTanHalfFov"),Math.tan(x*Math.PI/360)),e.uniform1f(e.getUniformLocation(f,"uAspect"),M)};return{get texture(){return s.tex},get width(){return i},get height(){return l},compute(f){let E=I(e);e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,s.fb),e.viewport(0,0,i,l),e.useProgram(o),b(o,f.depthTexture,f.near,f.far,f.fovDeg,f.aspect,0),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/i,1/l),e.uniform1f(e.getUniformLocation(o,"uRadius"),f.radius??.55),e.uniform1f(e.getUniformLocation(o,"uStrength"),f.strength??1.15),e.uniform1f(e.getUniformLocation(o,"uBias"),f.bias??.035),t.blit(o);for(let[g,p,x]of[[s,d,[1,0]],[d,s,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,p.fb),e.viewport(0,0,i,l),e.useProgram(a),h(a,f.depthTexture,f.near,f.far,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,g.tex),e.uniform1i(e.getUniformLocation(a,"uAO"),1),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/i,1/l),e.uniform2f(e.getUniformLocation(a,"uDir"),x[0],x[1]),t.blit(a);oe(e,2),k(e,E)},resize(f,E){let g=Math.max(1,f>>1),p=Math.max(1,E>>1);g===i&&p===l||(i=g,l=p,u())},dispose(){e.deleteProgram(o),e.deleteProgram(a);for(let f of[s,d])e.deleteFramebuffer(f.fb),e.deleteTexture(f.tex)}}}var Fn=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,An=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uFocusDistance;
uniform float uAperture;
uniform float uMaxCoc;
out vec4 frag;
${pe}

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
}`;function Pt(t,n,r){let{gl:e}=t,o=t.compile(Fn,An);if("kind"in o)return o;let a=Math.max(1,Math.floor(n)),i=Math.max(1,Math.floor(r)),l=e.createFramebuffer(),m=e.createTexture();if(!l||!m)return w("FRAMEBUFFER_INCOMPLETE","The GPU refused a depth-of-field buffer.");let s=()=>{e.bindTexture(e.TEXTURE_2D,m);let u=t.hdr?e.RGBA16F:e.RGBA8,c=t.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE;e.texImage2D(e.TEXTURE_2D,0,u,a,i,0,e.RGBA,c,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,l),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,m,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};s(),e.bindFramebuffer(e.FRAMEBUFFER,l);let d=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),d!==e.FRAMEBUFFER_COMPLETE?w("FRAMEBUFFER_INCOMPLETE",`The DOF buffer is incomplete (0x${d.toString(16)}).`):{texture:m,apply(u){let c=I(e);e.bindFramebuffer(e.FRAMEBUFFER,l),e.viewport(0,0,a,i),e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.useProgram(o),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,u.scene),e.uniform1i(e.getUniformLocation(o,"uScene"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,u.depthTexture),e.uniform1i(e.getUniformLocation(o,"uDepth"),1),e.uniform2f(e.getUniformLocation(o,"uNearFar"),u.near,u.far),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/a,1/i),e.uniform1f(e.getUniformLocation(o,"uFocusDistance"),u.focusDistance),e.uniform1f(e.getUniformLocation(o,"uAperture"),u.aperture??12),e.uniform1f(e.getUniformLocation(o,"uMaxCoc"),u.maxCoc??.012),t.blit(o),oe(e,2),k(e,c)},resize(u,c){let h=Math.max(1,Math.floor(u)),b=Math.max(1,Math.floor(c));h===a&&b===i||(a=h,i=b,s())},dispose(){e.deleteProgram(o),e.deleteFramebuffer(l),e.deleteTexture(m)}}}var vn=`
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
`;function j(t){return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function Ar(t){let n=document.createElement("style");n.textContent=vn,document.head.appendChild(n);let r=document.createElement("section");r.id="lcx-fallback",r.setAttribute("aria-label",`${t.title} \u2014 flat view`),r.setAttribute("tabindex","-1"),document.getElementById("log")?.setAttribute("aria-hidden","true");let e=(a,i)=>a===null?`<td class="absent${i?" n":""}">absent</td>`:`<td class="${i?"n":""}">${j(a)}</td>`;r.innerHTML=`<h2>${j(t.title)} \u2014 flat view</h2><p class="reads">${j(t.readsAs)}</p>`+(t.notices??[]).map(a=>`<p class="notice">${j(a)}</p>`).join("")+'<div id="lcx-refusal" role="alert"></div>'+(t.html?`<div class="surface">${t.html}</div>`:`<table><caption>${j(t.title)} \u2014 flat view</caption><thead><tr>`+t.columns.map(a=>`<th scope="col" class="${a.numeric?"n":""}">${j(a.label)}</th>`).join("")+"</tr></thead><tbody>"+t.rows.map(a=>"<tr>"+t.columns.map(i=>e(a[i.key]??null,!!i.numeric)).join("")+"</tr>").join("")+"</tbody></table>"),document.body.appendChild(r);function o(a,i){let l=document.getElementById("lcx-refusal");l&&(l.innerHTML=`<p class="refusal"><strong>${j(a)}</strong> \u2014 ${j(i)} The measurements below are unaffected.</p>`),delete r.dataset.rendered;for(let m of Array.from(document.querySelectorAll("canvas")))m.style.display="none";r.focus({preventScroll:!0})}return document.addEventListener("webglcontextlost",a=>{a.preventDefault(),o("CONTEXT_LOST","The GPU dropped the WebGL context for this page mid-session.")},!0),{markRendered(){r.dataset.rendered="1"},showRefusal:o}}var q=new URLSearchParams(location.search),$t=q.get("atmos")!=="0",kr=q.get("shadow")!=="0",jt=Tt.includes(q.get("tier")??"")?q.get("tier"):"full",Re=yt(jt),Gr=q.get("ao")!=="0"&&Re.ao,Ot=q.get("dof")!=="0"&&Re.dof,It=[],Hr=[];function Vr(t,n,r,e){let o=q.get(t);if(o===null)return n;let a=Number(o);if(!Number.isFinite(a))return It.push(`${t}=${o}`),n;let i=Math.max(r,Math.min(e,a));return i!==a&&Hr.push(`${t}=${o} used as ${i}`),i}var Me=Vr("scale",1,1,3),kt=Math.trunc(Vr("frames",300,1,2e4)),N=1200*Me,U=720*Me,ie=document.getElementById("c");ie.width=N;ie.height=U;var X={lat:47.14,lon:9.52};function Wr(t,n){let r=o=>o*Math.PI/180,e=Math.sin(r(X.lat))*Math.sin(r(t))+Math.cos(r(X.lat))*Math.cos(r(t))*Math.cos(r(n-X.lon));return Math.acos(Math.min(1,Math.max(-1,e)))*180/Math.PI}var K=[{to:"London",lat:51.51,lon:-.13},{to:"New York",lat:40.71,lon:-74.01},{to:"Chicago",lat:41.88,lon:-87.63},{to:"Dubai",lat:25.2,lon:55.27},{to:"Singapore",lat:1.35,lon:103.82},{to:"Tokyo",lat:35.68,lon:139.65},{to:"Johannesburg",lat:-26.2,lon:28.04}],zr=null,Xr=Ar({title:"E2 \xB7 The Globe \u2014 corridors from Vaduz",readsAs:"The rendered view states reach as arc height and time-of-day as a terminator, so which desks are awake and how far each corridor travels are read from the geometry. This table gives the same endpoints as numbers, and no reach and no daylight.",notices:["Coordinates are real. Corridor set is illustrative."],columns:[{key:"to",label:"Corridor to"},{key:"lat",label:"Lat",numeric:!0},{key:"lon",label:"Lon",numeric:!0},{key:"sep",label:"Great-circle separation",numeric:!0}],rows:K.map(t=>({to:t.to,lat:t.lat.toFixed(2),lon:t.lon.toFixed(2),sep:`${Wr(t.lat,t.lon).toFixed(1)}\xB0`}))});zr=Xr;It.length>0&&se(`BAD_PARAM: ${It.join(", ")} \u2014 not a number, so the view was refused rather than drawn from a nonsensical value. Nothing about the coordinates below has changed; correct the URL and reload.`);q.get("refuse")==="1"&&se("FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. The three-dimensional view is not being drawn.");var We=at(ie,{alpha:!1});ot(We)||se(`stage: ${We.code} \u2014 ${We.reason}`);var P=We,A=P.gl,Mn=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Sn=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${mt}
${dt}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,Yt=document.getElementById("log"),wn=t=>`${t.reason} ${t.detail??""}`;function se(t){document.title="REFUSED";let n=document.getElementById("log");n&&(n.textContent=t);let[r,...e]=t.split(":");throw zr?.showRefusal(r?.trim()??"REFUSED",e.join(":").trim()||t),new Error(t)}function B(t,n){return"kind"in n&&se(`${t}: ${wn(n)}`),n}var Ln=B("present",P.compile(Mn,Sn)),be=B("lit",_t(P)),ae=B("target",Mt(P,N,U)),vr=B("shadow",St(P,Be(jt,1024))),_n=B("sky",wt(P)),Mr=B("ao",Dt(P,N,U)),Sr=B("dof",Pt(P,N,U)),ze=Math.PI/180,D=1,Qt=1.06,$r=1.38,jr=.026,Kt=.034;function Gt(t,n,r){let e=t*ze,o=n*ze;return[r*Math.cos(e)*Math.cos(o),r*Math.sin(e),r*Math.cos(e)*Math.sin(o)]}var Yr=[{name:"London",lat:51.51,lon:-.13},{name:"Vaduz",lat:47.14,lon:9.52},{name:"Istanbul",lat:41.01,lon:28.98},{name:"Dubai",lat:25.2,lon:55.27},{name:"Mumbai",lat:19.08,lon:72.88},{name:"Lagos",lat:6.52,lon:3.38},{name:"Nairobi",lat:-1.29,lon:36.82},{name:"Johannesburg",lat:-26.2,lon:28.04},{name:"New York",lat:40.71,lon:-74.01},{name:"Chicago",lat:41.88,lon:-87.63},{name:"Singapore",lat:1.35,lon:103.82},{name:"Tokyo",lat:35.68,lon:139.65}],Xe={lat:18,lon:60},Qr=-15,Te=Gt(Xe.lat,Xe.lon,1),wr=[-Te[0],-Te[1],-Te[2]],Kr=fe(D,64,96),qr=fe(Qt,56,84),Jr=bt($r,jr,168,20),Zr=fe(Kt,14,20),Dn=B("earth mesh",ee(P,Kr)),Pn=B("atmosphere mesh",ee(P,qr)),Nn=B("ring mesh",ee(P,Jr)),Un=B("city mesh",ee(P,Zr)),qt=K.map(t=>Et(X.lat,X.lon,t.lat,t.lon,D,.016,.2,128,12)),Cn=qt.map((t,n)=>B(`corridor ${K[n].to}`,ee(P,t))),Qe=(t,n,r)=>{let e=de();return e[12]=t,e[13]=n,e[14]=r,e},Ke=new Float32Array([1,0,0,0,1,0,0,0,1]),Bn=(()=>{let t=de();return t[0]=-1,t})(),On=new Float32Array([-1,0,0,0,1,0,0,0,1]),Nt=W("#0E1628"),Ut=t=>[Nt[0]*t,Nt[1]*t,Nt[2]*t],Lr={zenith:Ut(.55),horizon:Ut(1.6),ground:Ut(.35)},In={baseColour:W("#0B2B5C"),roughness:.58,metalness:.06},kn={baseColour:W("#7FB2FF"),roughness:.86,metalness:0},Gn={baseColour:W("#8FA3C4"),roughness:.3742,metalness:.95,anisotropy:.8},Hn={baseColour:W("#2C6BFF"),roughness:.5,metalness:0},Vn={baseColour:W("#4C86FF"),roughness:.469,metalness:.85,anisotropy:.85},qe=Yr.map(t=>{let n=Gt(t.lat,t.lon,1),r=Gt(t.lat,t.lon,D);return{...t,normal:n,draw:{mesh:Un,model:Qe(r[0],r[1],r[2]),normalMat:Ke,material:Hn}}}),Ht={mesh:Dn,model:Qe(0,0,0),normalMat:Ke,material:In},Wn={mesh:Pn,model:Bn,normalMat:On,material:kn},Vt={mesh:Nn,model:Qe(0,0,0),normalMat:Ke,material:Gn},Jt=qe.map(t=>t.draw),Zt=Cn.map(t=>({mesh:t,model:Qe(0,0,0),normalMat:Ke,material:Vn})),en=$t?[Ht,Wn,Vt]:[Ht,Vt],zn=[Ht,Vt,...Jt,...Zt],Xn=[...en,...Jt,...Zt],_={target:[0,0,0],distance:5.4,azimuthDeg:90-Qr,elevationDeg:18,fovDeg:30},Fe=$r+jr,tn=[-Fe,-Qt,-Fe],rn=[Fe,Qt,Fe],He=vt(tn,rn),$n=At(tn,rn),jn=Fe*1.05,Yn=Z(Kr)+Z(Jr)+($t?Z(qr):0)+Z(Zr)*qe.length,Wt=Math.max(.01,_.distance/100),_r=Math.max(Wt+1,_.distance*8),Dr=1.6,Pr=140;function $e(){let t=Ft({direction:wr,colour:[1,1,1],extent:jn},He,$n),n=Oe(_,N/U),r=he(_);be.shadowPass(t,zn,vr),ae.bind(),A.clear(A.DEPTH_BUFFER_BIT),_n.draw({eye:r,target:_.target,fovDeg:_.fovDeg??34,aspect:N/U,sky:Lr}),be.depthPrepass(n,Xn),Gr&&(Mr.compute({depthTexture:ae.depthTexture,near:Wt,far:_r,fovDeg:_.fovDeg??34,aspect:N/U,radius:.35,strength:1.1}),ae.bind());let e={viewProj:n,eye:r,lightDir:wr,lightColour:[6.6,6.2,5.5],sky:Lr,lightVP:t,shadow:kr?vr:null,shadowStrength:.92,shadowTaps:Re.shadowTaps,shadowBaseline:1024,ao:Mr.texture,screenSize:[N,U]};be.draw({...e,ambientGain:Dr,draws:en}),be.draw({...e,ambientGain:(Dr+Pr)/2,draws:Zt}),be.draw({...e,ambientGain:Pr,draws:Jt});let o=Math.hypot(r[0]-He[0],r[1]-He[1],r[2]-He[2]);Ot&&Sr.apply({scene:ae.texture,depthTexture:ae.depthTexture,near:Wt,far:_r,fovDeg:_.fovDeg??34,aspect:N/U,focusDistance:o,aperture:.12,maxCoc:.006}),A.bindFramebuffer(A.FRAMEBUFFER,null),A.viewport(0,0,N,U),A.disable(A.DEPTH_TEST),A.activeTexture(A.TEXTURE0),A.bindTexture(A.TEXTURE_2D,Ot?Sr.texture:ae.texture),P.blit(Ln,a=>A.uniform1i(A.getUniformLocation(a,"uScene"),0))}$e();var $=he(_),Y=Math.hypot($[0],$[1],$[2]),nn=[$[0]/Y,$[1]/Y,$[2]/Y],ye=(t,n)=>t[0]*n[0]+t[1]*n[1]+t[2]*n[2],er=D/Y,Ee=qe.map(t=>({name:t.name,facing:ye(t.normal,nn)>er,sunlit:ye(t.normal,Te)>0})),Nr=4e3;function Qn(t){let n=new Uint8Array(4),r=performance.now();$e(),A.readPixels(0,0,1,1,A.RGBA,A.UNSIGNED_BYTE,n);let e=Math.max(.01,performance.now()-r),o=Math.min(t,Math.max(1,Math.floor(Nr/e))),a=performance.now(),i=0;for(let l=0;l<o&&($e(),i++,!(performance.now()-a>Nr));l++);return A.readPixels(0,0,1,1,A.RGBA,A.UNSIGNED_BYTE,n),{msPerFrame:(performance.now()-a)/i,measured:i}}var zt=Qn(kt),Ct=zt.msPerFrame,Xt=ft();if(Xt.length>0){let t="BRAND FIDELITY FAILED \u2014 "+Xt.map(r=>`${r.key}: expected ${r.expected}, got ${r.actual}`).join("; ");document.title="REFUSED";let n=document.getElementById("log");throw n&&(n.textContent=t),new Error(t)}var je=qt.map((t,n)=>{let r=0;for(let e=0;e<t.positions.length;e+=3)r=Math.max(r,Math.hypot(t.positions[e],t.positions[e+1],t.positions[e+2]));return{to:K[n].to,lift:Number((r-D).toFixed(4)),separationDeg:Number(Wr(K[n].lat,K[n].lon).toFixed(1))}}),Se=N/Me,le=U/Me,on=Oe(_,N/U),we=document.createElement("div");we.style.cssText=`position:relative;overflow:hidden;width:${Se}px;height:${le}px`;ie.parentNode?.insertBefore(we,ie);we.appendChild(ie);var Le=document.createElement("div");Le.style.cssText="position:absolute;inset:0;pointer-events:none";we.appendChild(Le);var an="pointer-events:auto;user-select:text;-webkit-user-select:text",Ye=(t,n)=>{let r=document.createElement("div");return r.style.cssText=t,r.textContent=n,r},Kn=le/2/(Math.tan((_.fovDeg??34)*ze/2)*_.distance),Q=2*Kt*Kn,tr=5,ge=tr/Q,sn=Math.min(1,2*ge),Ur=.55,xe=Q/2+4,Cr=(t,n)=>Math.max(0,Math.min(t.x+t.w,n.x+n.w)-Math.max(t.x,n.x))*Math.max(0,Math.min(t.y+t.h,n.y+n.h)-Math.max(t.y,n.y));function qn(t){t.style.left="-99999px",t.style.top="0px",t.style.visibility="hidden",Le.appendChild(t);let n=t.getBoundingClientRect();return{x:0,y:0,w:Math.ceil(n.width),h:Math.ceil(n.height)}}var Jn=t=>t>=0?`${t.toFixed(2)} E`:`${(-t).toFixed(2)} W`,Zn=t=>t>=0?`${t.toFixed(2)} N`:`${(-t).toFixed(2)} S`,ln=Yr.find(t=>t.lat===X.lat&&t.lon===X.lon);ln===void 0&&se(`HUB_NOT_SITED: no entry in CITY_SITES sits at the hub's ${X.lat}/${X.lon}, so the origin of all seven corridors would be an unnamed dot. The two declarations of Vaduz have drifted.`);var Ae=ln.name,eo=new Map(je.map(t=>[t.to,t])),to=(t,n)=>{let r=[`${Zn(t.lat)}  ${Jn(t.lon)}`,n?"daylight":"night"],e=eo.get(t.name);return e&&r.push(`corridor from ${Ae} \xB7 ${e.separationDeg}\xB0 \xB7 lift ${e.lift}`),t.name===Ae&&r.push(`hub \xB7 ${K.length} corridors leave here`),r},rr=qe.map(t=>{let n=t.normal,r=[n[0]*D,n[1]*D,n[2]*D],e=[$[0]-r[0],$[1]-r[1],$[2]-r[2]],o=Math.hypot(e[0],e[1],e[2])||1,a=D+Kt,i=ye(n,Te)>0;return{name:t.name,facing:ye(n,nn)>er,cosFace:ye(n,e)/o,lines:to(t,i),at:Ce(on,[n[0]*a,n[1]*a,n[2]*a],Se,le)}}),ro=rr.filter(t=>t.facing&&!t.at.behind).map(t=>({name:t.name,box:{x:t.at.sx-Q/2,y:t.at.sy-Q/2,w:Q,h:Q}})),nr=[],no=t=>t.x>=2&&t.y>=2&&t.x+t.w<=Se-2&&t.y+t.h<=le-2,Je=document.createElement("div");Je.style.cssText="position:absolute;left:14px;bottom:12px;white-space:nowrap;font:600 10px/1.5 ui-monospace,monospace;letter-spacing:.12em;color:#E0A94A;"+an;Je.textContent=`PLACEHOLDER SITES \xB7 ${Ae.toUpperCase()} IS THE HUB \xB7 COORDINATES REAL, CORRIDOR SET ILLUSTRATIVE`;Le.appendChild(Je);nr.push((()=>{let t=Je.getBoundingClientRect(),n=we.getBoundingClientRect();return{x:t.left-n.left,y:t.top-n.top,w:t.width,h:t.height}})());var Br=(t,n)=>no(t)&&!nr.some(r=>Cr(r,t)>0)&&!ro.some(r=>r.name!==n&&Cr(r.box,t)>0),oo=["right","left","above","below"],Or=(t,n,r,e)=>t==="right"?{x:n+xe,y:r-e.h/2,w:e.w,h:e.h}:t==="left"?{x:n-xe-e.w,y:r-e.h/2,w:e.w,h:e.h}:t==="above"?{x:n-e.w/2,y:r-xe-e.h,w:e.w,h:e.h}:{x:n-e.w/2,y:r+xe,w:e.w,h:e.h},Ve=Ce(on,_.target,Se,le),un=D*Math.sqrt(Math.max(0,1-D*D/(Y*Y)))*(le/2/(Math.tan((_.fovDeg??34)*ze/2)*(Y-D*D/Y))),Ir=6,ao=24,io=(t,n,r,e)=>{let o=n-Ve.sx,a=r-Ve.sy,i=Math.hypot(o,a),l=i<1e-6?1:o/i,m=i<1e-6?0:a/i,s=un+xe+t*ao,d=Ve.sx+l*s,u=Ve.sy+m*s;return{x:l>=0?d:d-e.w,y:u-e.h/2,w:e.w,h:e.h}};function so(t,n,r){let e=Math.min(Math.max(t,r.x),r.x+r.w),o=Math.min(Math.max(n,r.y),r.y+r.h),a=Math.hypot(e-t,o-n),i=document.createElement("div");return i.style.cssText=`position:absolute;left:${t.toFixed(1)}px;top:${n.toFixed(1)}px;width:${a.toFixed(1)}px;height:1px;background:rgba(143,178,255,0.5);transform-origin:0 50%;transform:rotate(${Math.atan2(o-n,e-t).toFixed(5)}rad)`,Le.appendChild(i),Math.round(a)}var lo=(t,n)=>t.name===Ae?-1:n.name===Ae?1:n.cosFace-t.cosFace,z=[],ve=[];for(let t of[...rr].sort(lo)){let n=Number(t.cosFace.toFixed(3)),r=`${t.name} \u2014 ${t.lines.join(" \xB7 ")}`,e=(c,h)=>{ve.push(`${r}. ${h}`),z.push({name:t.name,state:c,side:null,sx:null,sy:null,opacity:null,cosFace:n,leaderPx:null})};if(!t.facing){e("BEHIND_LIMB","Behind the limb on this face, so it is not labelled on the frame.");continue}if(t.at.behind){e("BEHIND_CAMERA","Projected behind the camera plane, so it is not labelled on the frame.");continue}if(t.cosFace<=ge){e("EDGE_ON",`The marker is ${(Q*t.cosFace).toFixed(1)} px wide there \u2014 inside the ${tr} px floor, so it is too edge-on for a label to point at.`);continue}let o=Math.min(1,Math.max(0,(t.cosFace-ge)/(sn-ge))),a=Ur+(1-Ur)*o,i=document.createElement("div");i.style.cssText=`position:absolute;display:flex;flex-direction:column;gap:1px;white-space:nowrap;font:400 9.5px/1.35 ui-monospace,monospace;text-shadow:0 1px 3px rgba(0,0,0,0.95);opacity:${a.toFixed(3)};`+an,i.appendChild(Ye("font:700 9.5px/1.2 ui-monospace,monospace;letter-spacing:.14em;color:#CFE0FF",t.name.toUpperCase()));for(let c of t.lines)i.appendChild(Ye("color:rgba(196,212,240,0.86)",c));let l=qn(i),m=oo.find(c=>Br(Or(c,t.at.sx,t.at.sy,l),t.name)),s=m===void 0?null:Or(m,t.at.sx,t.at.sy,l),d=null;for(let c=0;s===null&&c<Ir;c++){let h=io(c,t.at.sx,t.at.sy,l);Br(h,t.name)&&(s=h,d=c)}if(s===null){i.remove(),e("NO_FREE_PLACEMENT",`No free placement at this camera: four sides at the marker and ${Ir} rings out to the rim were all blocked by another marker, an already-placed label, or the frame edge.`);continue}let u=d===null?0:so(t.at.sx,t.at.sy,s);i.style.left=`${s.x.toFixed(1)}px`,i.style.top=`${s.y.toFixed(1)}px`,i.style.visibility="visible",nr.push(s),z.push({name:t.name,state:"PROJECTED",side:m??`radial+${d}`,sx:Math.round(t.at.sx),sy:Math.round(t.at.sy),opacity:Number(a.toFixed(3)),cosFace:n,leaderPx:u})}var _e=document.createElement("div");_e.id="e2-unlabelled";_e.style.cssText=`max-width:${Se}px;padding:12px 0 0;font:400 11px/1.65 ui-monospace,monospace;color:rgba(196,212,240,0.82)`;_e.appendChild(Ye("font:700 10px/1.4 ui-monospace,monospace;letter-spacing:.14em;color:#8FB7FF;padding-bottom:4px",ve.length===0?"EVERY SITE IS LABELLED ON THE FRAME":`NOT LABELLED ON THIS FACE \u2014 ${ve.length} OF ${rr.length} SITES, WITH THE REASON`));for(let t of ve)_e.appendChild(Ye("",t));var cn=Yt.parentNode;cn===null&&se("NO_WORDS_HOST: #log has no parent, so the sites that could not be labelled have nowhere to be stated. The frame would look complete while five readings had silently left the document.");cn.insertBefore(_e,Yt);var mn=(()=>{let t=A.getExtension("WEBGL_debug_renderer_info");return t?String(A.getParameter(t.UNMASKED_RENDERER_WEBGL)):"unknown"})(),Bt=/swiftshader|llvmpipe|software/i.test(mn),dn={ao:Gr,dof:Ot,tier:Re.tier,tierDprScale:Re.dprScale,tierShadowMapSize:Be(jt,1024),shadowBaseline:1024,glError:A.getError(),brandFidelity:Xt,atmosphere:$t,shadow:kr,triangles:Yn,resolution:`${N}x${U}`,dprScale:Me,frames:zt.measured,framesRequested:kt,sweepTruncated:zt.measured<kt,paramClamps:Hr,msPerFrame:Number(Ct.toFixed(3)),fps:Math.round(1e3/Ct),centralMeridian:Qr,subSolar:`${Xe.lat}N ${Xe.lon}E`,cities:Ee.length,citiesFacing:Ee.filter(t=>t.facing).length,citiesSunlit:Ee.filter(t=>t.sunlit).length,corridors:K.length,corridorTriangles:qt.reduce((t,n)=>t+Z(n),0),corridorPeakLift:je,labels:{projected:z.filter(t=>t.state==="PROJECTED").length,inWords:ve.length,faded:z.filter(t=>t.opacity!==null&&t.opacity<1).length,pushedToRim:z.filter(t=>t.leaderPx!==null&&t.leaderPx>0).length,markerPx:Number(Q.toFixed(2)),silhouettePx:Number(un.toFixed(1)),anchorFloorPx:tr,cosHide:Number(ge.toFixed(4)),cosFull:Number(sn.toFixed(4)),horizonDot:Number(er.toFixed(4)),refusedBy:["BEHIND_LIMB","BEHIND_CAMERA","EDGE_ON","NO_FREE_PLACEMENT"].map(t=>({state:t,count:z.filter(n=>n.state===t).length}))},domLabels:z,behindLimb:Ee.filter(t=>!t.facing).map(t=>t.name),onNightSide:Ee.filter(t=>t.facing&&!t.sunlit).map(t=>t.name),renderer:mn,rendererClass:Bt?"software":"hardware",headroom:Bt?null:Number((16.6-Ct).toFixed(3)),headroomRefusal:Bt?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null};globalThis.E2=dn;var{domLabels:Fa,corridorPeakLift:Aa,...uo}=dn;Yt.textContent=JSON.stringify(uo,null,2)+`

corridorPeakLift \u2014 ${je.length} arcs:
`+je.map(t=>`  ${t.to.padEnd(13)} ${String(t.separationDeg).padStart(5)}\xB0  lift ${t.lift}`).join(`
`)+`

domLabels \u2014 \xA76 rule 4, ${z.length} sites, full detail on globalThis.E2:
`+z.map(t=>`  ${t.name.padEnd(13)} ${t.state.padEnd(18)} cosFace ${String(t.cosFace).padStart(6)}`+(t.state==="PROJECTED"?`  ${t.side} at ${t.sx},${t.sy} opacity ${t.opacity}`:"")).join(`
`);$e();Xr.markRendered();document.title="READY";

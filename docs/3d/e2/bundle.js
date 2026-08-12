var kt={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected.",FEEDBACK_LOOP:"A layer of this view was asked to read the surface it draws into, which every driver refuses, so the layer is not being drawn. This is a defect in the renderer, not in the data."};function L(r,n){return n===void 0?{kind:"refused",code:r,reason:kt[r]}:{kind:"refused",code:r,reason:kt[r],detail:n}}function Ce(r){return r.kind==="stage"}function Oe(r,n={}){let t=r.getContext("webgl2",{antialias:n.antialias??!1,alpha:n.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!t)return L("NO_WEBGL2");let e=t.getExtension("EXT_color_buffer_float"),o=r.width,a=r.height,i=e?t.RGBA16F:t.RGBA8,u=e?t.HALF_FLOAT:t.UNSIGNED_BYTE,c=(h,g)=>{let M=t.createTexture();t.bindTexture(t.TEXTURE_2D,M),t.texImage2D(t.TEXTURE_2D,0,i,h,g,0,t.RGBA,u,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);let R=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,R),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,M,0);let v=t.checkFramebufferStatus(t.FRAMEBUFFER);return v!==t.FRAMEBUFFER_COMPLETE?L("FRAMEBUFFER_INCOMPLETE",`status 0x${v.toString(16)} at ${h}\xD7${g}`):{texture:M,framebuffer:R,width:h,height:g}},s=n.bloomShift??2,f={w:o,h:a},l=c(o,a);if("kind"in l)return l;let m=c(Math.max(1,o>>s),Math.max(1,a>>s));if("kind"in m)return m;let p=c(Math.max(1,o>>s),Math.max(1,a>>s));if("kind"in p)return p;let b=t.createVertexArray();t.bindVertexArray(b);let d=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,d),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null);let E=[];return{kind:"stage",gl:t,cssWidth:r.clientWidth||o,cssHeight:r.clientHeight||a,hdr:!!e,get width(){return f.w},get height(){return f.h},get scene(){return l},get bloomA(){return m},get bloomB(){return p},setRegion(h,g){let M=Math.max(1,Math.round(h)),R=Math.max(1,Math.round(g));if(!(M===f.w&&R===f.h)){f={w:M,h:R};for(let v of[l,m,p])"kind"in v||(t.deleteFramebuffer(v.framebuffer),t.deleteTexture(v.texture));l=c(M,R),m=c(Math.max(1,M>>s),Math.max(1,R>>s)),p=c(Math.max(1,M>>s),Math.max(1,R>>s))}},compile(h,g){let M=(I,F)=>{let T=t.createShader(I);if(t.shaderSource(T,F),t.compileShader(T),!t.getShaderParameter(T,t.COMPILE_STATUS)){let x=t.getShaderInfoLog(T)??"(no log)";return t.deleteShader(T),L("SHADER_COMPILE_FAILED",x)}return T},R=M(t.VERTEX_SHADER,h);if(typeof R=="object"&&"kind"in R)return R;let v=M(t.FRAGMENT_SHADER,g);if(typeof v=="object"&&"kind"in v)return t.deleteShader(R),v;let S=t.createProgram();if(t.attachShader(S,R),t.attachShader(S,v),t.linkProgram(S),!t.getProgramParameter(S,t.LINK_STATUS)){let I=t.getProgramInfoLog(S)??"(no log)";return t.deleteShader(R),t.deleteShader(v),t.deleteProgram(S),L("PROGRAM_LINK_FAILED",I)}return t.detachShader(S,R),t.detachShader(S,v),t.deleteShader(R),t.deleteShader(v),E.push(S),S},bindTarget(h){t.bindFramebuffer(t.FRAMEBUFFER,h?h.framebuffer:null),t.viewport(0,0,h?h.width:f.w,h?h.height:f.h)},blit(h,g){t.useProgram(h),t.bindVertexArray(b),g?.(h),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null)},dispose(){for(let h of E)t.deleteProgram(h);for(let h of[l,m,p])"kind"in h||(t.deleteFramebuffer(h.framebuffer),t.deleteTexture(h.texture));t.deleteBuffer(d),t.deleteVertexArray(b)}}}var oe=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function pe(r,n){let t=new Float32Array(16);for(let e=0;e<4;e++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=r[i*4+o]*n[e*4+i];t[e*4+o]=a}return t}var K=(r,n)=>[r[0]-n[0],r[1]-n[1],r[2]-n[2]],he=(r,n)=>r[0]*n[0]+r[1]*n[1]+r[2]*n[2],Q=(r,n)=>[r[1]*n[2]-r[2]*n[1],r[2]*n[0]-r[0]*n[2],r[0]*n[1]-r[1]*n[0]];function k(r){let n=Math.hypot(r[0],r[1],r[2]);return n===0?r:[r[0]/n,r[1]/n,r[2]/n]}function Ie(r,n,t,e){let o=1/Math.tan(r/2);return new Float32Array([o/n,0,0,0,0,o,0,0,0,0,(e+t)/(t-e),-1,0,0,2*e*t/(t-e),0])}function Ge(r,n,t,e,o,a){let i=n-r,u=e-t,c=a-o;return new Float32Array([2/i,0,0,0,0,2/u,0,0,0,0,-2/c,0,-(n+r)/i,-(e+t)/u,-(a+o)/c,1])}function be(r,n,t){let e=k(K(r,n)),o=Q(t,e);if(Math.hypot(o[0],o[1],o[2])<1e-8)return oe();let a=k(o),i=Q(e,a);return new Float32Array([a[0],i[0],e[0],0,a[1],i[1],e[1],0,a[2],i[2],e[2],0,-he(a,r),-he(i,r),-he(e,r),1])}function Vt(r){return r<=.04045?r/12.92:Math.pow((r+.055)/1.055,2.4)}function ke(r){return r<=.0031308?r*12.92:1.055*Math.pow(r,1/2.4)-.055}var Pr=/^#?([0-9a-fA-F]{6})$/;function V(r){let n=Pr.exec(r.trim());if(!n)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(r)}`);let t=n[1];return[0,2,4].map(e=>Vt(parseInt(t.slice(e,e+2),16)/255))}function Ve(r){return`#${r.map(t=>{let e=ke(Math.min(1,Math.max(0,t)));return Math.round(e*255).toString(16).padStart(2,"0")}).join("")}`}var q={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},He=Object.freeze(Object.fromEntries(Object.keys(q).map(r=>[r,V(q[r])])));var Ht=.4;var Xe=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${Ht.toFixed(2)}); }`,ze=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function We(){let r=[];for(let n of Object.keys(q)){let t=q[n].toLowerCase(),e=Ve(He[n]).toLowerCase();e!==t&&r.push({key:n,expected:t,actual:e})}return r}function Ur(r){let n=[1/0,1/0,1/0],t=[-1/0,-1/0,-1/0];for(let e=0;e<r.length;e+=3)for(let o=0;o<3;o++){let a=r[e+o];a<n[o]&&(n[o]=a),a>t[o]&&(t[o]=a)}return r.length===0?{min:[0,0,0],max:[0,0,0]}:{min:n,max:t}}function Xt(r,n,t,e){let o=new Float32Array(r.length);for(let i=0;i<e.length;i+=3){let u=e[i],c=e[i+1],s=e[i+2],f=u*3,l=c*3,m=s*3,p=u*2,b=c*2,d=s*2,E=r[l]-r[f],y=r[l+1]-r[f+1],h=r[l+2]-r[f+2],g=r[m]-r[f],M=r[m+1]-r[f+1],R=r[m+2]-r[f+2],v=t[b]-t[p],S=t[b+1]-t[p+1],I=t[d]-t[p],F=t[d+1]-t[p+1],T=v*F-I*S;if(Math.abs(T)<1e-12)continue;let x=1/T,D=(E*F-g*S)*x,G=(y*F-M*S)*x,U=(h*F-R*S)*x;for(let w of[f,l,m])o[w]=o[w]+D,o[w+1]=o[w+1]+G,o[w+2]=o[w+2]+U}let a=new Float32Array(r.length);for(let i=0;i<a.length;i+=3){let u=n[i],c=n[i+1],s=n[i+2],f=o[i],l=o[i+1],m=o[i+2],p=f*u+l*c+m*s;f-=u*p,l-=c*p,m-=s*p;let b=Math.hypot(f,l,m);b<1e-8&&(Math.abs(u)<.9?(f=0,l=-s,m=c):(f=-s,l=0,m=u),b=Math.hypot(f,l,m)||1),a[i]=f/b,a[i+1]=l/b,a[i+2]=m/b}return a}function zt(r,n){let t=new Float32Array(r.length);for(let e=0;e<n.length;e+=3){let o=n[e]*3,a=n[e+1]*3,i=n[e+2]*3,u=r[a]-r[o],c=r[a+1]-r[o+1],s=r[a+2]-r[o+2],f=r[i]-r[o],l=r[i+1]-r[o+1],m=r[i+2]-r[o+2],p=c*m-s*l,b=s*f-u*m,d=u*l-c*f;for(let E of[o,a,i])t[E]=t[E]+p,t[E+1]=t[E+1]+b,t[E+2]=t[E+2]+d}for(let e=0;e<t.length;e+=3){let o=Math.hypot(t[e],t[e+1],t[e+2]);o>0&&(t[e]=t[e]/o,t[e+1]=t[e+1]/o,t[e+2]=t[e+2]/o)}return t}function $e(r,n,t,e,o){let{min:a,max:i}=Ur(r),u=e??zt(r,t);return{positions:r,normals:u,uvs:n,indices:t,min:a,max:i,tangents:o??Xt(r,u,n,t)}}function ae(r=.5,n=24,t=32){let e=Math.max(2,n),o=Math.max(3,t),a=(e+1)*(o+1),i=new Float32Array(a*3),u=new Float32Array(a*3),c=new Float32Array(a*2),s=new Uint16Array(e*o*6),f=0,l=0,m=0;for(let p=0;p<=e;p++){let b=p/e*Math.PI;for(let d=0;d<=o;d++){let E=d/o*Math.PI*2,y=Math.sin(b)*Math.cos(E),h=Math.cos(b),g=Math.sin(b)*Math.sin(E);i[f]=y*r,i[f+1]=h*r,i[f+2]=g*r,u[f]=y,u[f+1]=h,u[f+2]=g,f+=3,c[l++]=d/o,c[l++]=p/e}}for(let p=0;p<e;p++)for(let b=0;b<o;b++){let d=p*(o+1)+b,E=d+1,y=d+(o+1),h=y+1;s[m++]=d,s[m++]=E,s[m++]=y,s[m++]=E,s[m++]=h,s[m++]=y}return $e(i,c,s,u)}function Ye(r=.5,n=.08,t=64,e=24){let o=Math.max(3,t),a=Math.max(3,e),i=[],u=[],c=[],s=[],f=[];for(let l=0;l<=o;l++){let m=l/o*Math.PI*2,p=Math.cos(m),b=Math.sin(m);for(let d=0;d<=a;d++){let E=d/a*Math.PI*2,y=Math.cos(E),h=Math.sin(E);i.push((r+n*y)*p,n*h,(r+n*y)*b),u.push(p*y,h,b*y),c.push(l/o,d/a),f.push(-b,0,p)}}for(let l=0;l<o;l++)for(let m=0;m<a;m++){let p=l*(a+1)+m,b=p+1,d=p+(a+1),E=d+1;s.push(p,b,d,b,E,d)}return $e(new Float32Array(i),new Float32Array(c),new Uint16Array(s),new Float32Array(u),new Float32Array(f))}function je(r,n){let t=r*Math.PI/180,e=n*Math.PI/180,o=Math.cos(t);return[o*Math.cos(e),Math.sin(t),o*Math.sin(e)]}function Qe(r,n,t,e,o=1,a=.012,i=.22,u=96,c=8){let s=Math.max(8,u),f=Math.max(3,c),l=je(r,n),m=je(t,e),p=Math.max(-1,Math.min(1,l[0]*m[0]+l[1]*m[1]+l[2]*m[2])),b=Math.acos(p),d=b<1e-4||Math.abs(Math.PI-b)<1e-4,E=Math.sin(b),y=i*o*(b/Math.PI),h=[],g=[],M=[],R=[],v=[],S=F=>{if(d)return[l[0]+(m[0]-l[0])*F,l[1]+(m[1]-l[1])*F,l[2]+(m[2]-l[2])*F];let T=Math.sin((1-F)*b)/E,x=Math.sin(F*b)/E;return[l[0]*T+m[0]*x,l[1]*T+m[1]*x,l[2]*T+m[2]*x]},I=F=>{let T=S(F),x=Math.hypot(T[0],T[1],T[2])||1,D=o+y*Math.sin(Math.PI*F);return[T[0]/x*D,T[1]/x*D,T[2]/x*D]};for(let F=0;F<=s;F++){let T=F/s,x=I(T),D=I(Math.min(1,T+1/s)),G=I(Math.max(0,T-1/s)),U=D[0]-G[0],w=D[1]-G[1],W=D[2]-G[2],De=Math.hypot(U,w,W)||1;U/=De,w/=De,W/=De;let Pe=Math.hypot(x[0],x[1],x[2])||1,Ut=x[0]/Pe,Nt=x[1]/Pe,Bt=x[2]/Pe,te=w*Bt-W*Nt,re=W*Ut-U*Bt,ne=U*Nt-w*Ut,Ue=Math.hypot(te,re,ne)||1;te/=Ue,re/=Ue,ne/=Ue;let wr=re*W-ne*w,_r=ne*U-te*W,Dr=te*w-re*U;for(let fe=0;fe<=f;fe++){let Ct=fe/f*Math.PI*2,Ne=Math.cos(Ct),Be=Math.sin(Ct),Ot=te*Ne+wr*Be,It=re*Ne+_r*Be,Gt=ne*Ne+Dr*Be;h.push(x[0]+Ot*a,x[1]+It*a,x[2]+Gt*a),g.push(Ot,It,Gt),M.push(T,fe/f),R.push(U,w,W)}}for(let F=0;F<s;F++)for(let T=0;T<f;T++){let x=F*(f+1)+T,D=x+1,G=x+(f+1),U=G+1;v.push(x,G,D,D,G,U)}return $e(new Float32Array(h),new Float32Array(M),h.length/3>65535?new Uint32Array(v):new Uint16Array(v),new Float32Array(g),new Float32Array(R))}function j(r){return r.indices.length/3}var Wt=r=>[r.DEPTH_TEST,r.CULL_FACE,r.BLEND];function C(r){return[r.getParameter(r.FRAMEBUFFER_BINDING),r.getParameter(r.VIEWPORT),r.getParameter(r.DEPTH_WRITEMASK),Wt(r).map(n=>r.getParameter(n))]}function O(r,n){r.bindFramebuffer(r.FRAMEBUFFER,n[0]);let t=n[1];r.viewport(t[0]??0,t[1]??0,t[2]??0,t[3]??0),r.depthMask(n[2]),Wt(r).forEach((e,o)=>{n[3][o]?r.enable(e):r.disable(e)})}function J(r,n){for(let t=n-1;t>=0;t--)r.activeTexture(r.TEXTURE0+t),r.bindTexture(r.TEXTURE_2D,null),r.bindTexture(r.TEXTURE_3D,null);r.activeTexture(r.TEXTURE0)}var Ke=["minimum","reduced","full"],Nr={full:{dprScale:2,ao:!0,aoScale:.5,dof:!0,shadowMapSize:1536,shadowTaps:9,particleCapacity:4096,volumeMaxSteps:128,volumeLightSteps:6},reduced:{dprScale:2,ao:!0,aoScale:.5,dof:!1,shadowMapSize:1024,shadowTaps:9,particleCapacity:2048,volumeMaxSteps:96,volumeLightSteps:4},minimum:{dprScale:1,ao:!1,aoScale:.5,dof:!1,shadowMapSize:512,shadowTaps:1,particleCapacity:512,volumeMaxSteps:48,volumeLightSteps:0}};function Ee(r,n){let t=Number.isFinite(n)&&n>0?n:1024,o=t*(r==="full"?1:r==="reduced"?.5:.25),a=2**Math.round(Math.log2(o));return Math.max(256,Math.min(t,a))}function qe(r){return{tier:r,...Nr[r]}}var Je=89,Ze=Math.PI/180;function ie(r){let n=Math.max(-Je,Math.min(Je,r.elevationDeg))*Ze,t=r.azimuthDeg*Ze,e=Math.max(1e-4,r.distance),o=Math.sin(n)*e,a=Math.cos(n)*e;return[r.target[0]+Math.sin(t)*a,r.target[1]+o,r.target[2]+Math.cos(t)*a]}function et(r,n){let t=ie(r),e=r.near??Math.max(.01,r.distance/100),o=r.far??Math.max(e+1,r.distance*8),a=Ie((r.fovDeg??38)*Ze,Math.max(.001,n),e,o),i=be(t,r.target,[0,1,0]);return pe(a,i)}function tt(r,n,t){let e=k(r.direction),o=r.extent??Math.max(.1,t*1.35),a=Math.max(1,t*2),i=[n[0]-e[0]*a,n[1]-e[1]*a,n[2]-e[2]*a],u=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],c=be(i,n,u),s=Ge(-o,o,-o,o,.01,a+t*2+o);return pe(s,c)}function rt(r,n){let t=K([n[0],n[1],n[2]],[r[0],r[1],r[2]]);return Math.hypot(t[0],t[1],t[2])/2}function nt(r,n){return[(r[0]+n[0])/2,(r[1]+n[1])/2,(r[2]+n[2])/2]}function ot(r,n,t){let{gl:e}=r,o=Math.max(1,Math.floor(n)),a=Math.max(1,Math.floor(t)),i=e.createFramebuffer(),u=e.createTexture(),c=e.createTexture();if(!i||!u||!c)return L("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let s=r.hdr?e.RGBA16F:e.RGBA8,f=r.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,l=()=>{e.bindTexture(e.TEXTURE_2D,u),e.texImage2D(e.TEXTURE_2D,0,s,o,a,0,e.RGBA,f,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,c),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,o,a,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,u,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,c,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};l(),e.bindFramebuffer(e.FRAMEBUFFER,i);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE?L("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${m.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:u,depthTexture:c,get width(){return o},get height(){return a},bind(){e.bindFramebuffer(e.FRAMEBUFFER,i),e.viewport(0,0,o,a)},resize(p,b){let d=Math.max(1,Math.floor(p)),E=Math.max(1,Math.floor(b));d===o&&E===a||(o=d,a=E,l())},dispose(){e.deleteFramebuffer(i),e.deleteTexture(u),e.deleteTexture(c)}}}function at(r,n=1024){let{gl:t}=r,e=Math.max(256,Math.min(2048,Math.floor(n))),o=t.createFramebuffer(),a=t.createTexture();if(!o||!a)return L("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");t.bindTexture(t.TEXTURE_2D,a),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,e,e,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,o),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,a,0);let i=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),i!==t.FRAMEBUFFER_COMPLETE?L("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:e,bind(){t.bindFramebuffer(t.FRAMEBUFFER,o),t.viewport(0,0,e,e)},dispose(){t.deleteFramebuffer(o),t.deleteTexture(a)}}}var xe=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,Te={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function ye(r,n,t={}){let e=t.zenith??Te.zenith,o=t.horizon??Te.horizon,a=t.ground??Te.ground;r.uniform3f(r.getUniformLocation(n,"uSkyZenith"),e[0],e[1],e[2]),r.uniform3f(r.getUniformLocation(n,"uSkyHorizon"),o[0],o[1],o[2]),r.uniform3f(r.getUniformLocation(n,"uSkyGround"),a[0],a[1],a[2])}var Br=`#version 300 es
precision highp float;
out vec2 vNdc;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`,Cr=`#version 300 es
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
}`;function it(r){let{gl:n}=r,t=r.compile(Br,Cr);return"kind"in t?t:{draw(e){let o=k(K(e.target,e.eye)),a=Math.abs(o[1])>.999?[0,0,1]:[0,1,0],i=k(Q(o,a)),u=k(Q(i,o)),c=C(n);n.disable(n.DEPTH_TEST),n.depthMask(!1),n.disable(n.BLEND),n.useProgram(t),n.uniform3f(n.getUniformLocation(t,"uRight"),i[0],i[1],i[2]),n.uniform3f(n.getUniformLocation(t,"uUp"),u[0],u[1],u[2]),n.uniform3f(n.getUniformLocation(t,"uForward"),o[0],o[1],o[2]),n.uniform1f(n.getUniformLocation(t,"uTanHalfFov"),Math.tan(e.fovDeg*Math.PI/360)),n.uniform1f(n.getUniformLocation(t,"uAspect"),Math.max(.001,e.aspect)),ye(n,t,e.sky),r.blit(t),O(n,c)},dispose(){n.deleteProgram(t)}}}var jt=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,st=`#version 300 es
precision highp float;
void main(){}`,Or=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,$t=`#version 300 es
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
}`,Yt=`#version 300 es
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
${xe}

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
}`;function $(r,n){let{gl:t}=r,e=t.createVertexArray(),o=t.createBuffer(),a=t.createBuffer(),i=t.createBuffer(),u=t.createBuffer();return!e||!o||!a||!i||!u?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(t.bindVertexArray(e),t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,n.positions,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,a),t.bufferData(t.ARRAY_BUFFER,n.normals,t.STATIC_DRAW),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,i),t.bufferData(t.ARRAY_BUFFER,n.tangents,t.STATIC_DRAW),t.enableVertexAttribArray(2),t.vertexAttribPointer(2,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,u),t.bufferData(t.ELEMENT_ARRAY_BUFFER,n.indices,t.STATIC_DRAW),t.bindVertexArray(null),{vao:e,indexCount:n.indices.length,indexType:n.indices instanceof Uint32Array?t.UNSIGNED_INT:t.UNSIGNED_SHORT,dispose(){t.deleteVertexArray(e),t.deleteBuffer(o),t.deleteBuffer(a),t.deleteBuffer(i),t.deleteBuffer(u)}})}function ut(r){let{gl:n}=r,t=r.compile(jt,st);if("kind"in t)return t;let e=r.compile($t,Yt);if("kind"in e)return e;let o=r.compile(Or,st);if("kind"in o)return o;let a=(i,u)=>n.getUniformLocation(i,u);return{shadowPass(i,u,c,s){let f=C(n),l=s??(()=>{});c.bind(),l("shadow.bind"),n.clear(n.DEPTH_BUFFER_BIT),n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.FRONT),n.useProgram(t),l("useProgram(shadow)"),n.uniformMatrix4fv(a(t,"uLightVP"),!1,i),l("uLightVP");for(let m of u)n.uniformMatrix4fv(a(t,"uModel"),!1,m.model),l("shadow uModel"),n.bindVertexArray(m.mesh.vao),l("shadow bindVAO"),n.drawElements(n.TRIANGLES,m.mesh.indexCount,m.mesh.indexType,0),l("shadow drawElements");n.bindVertexArray(null),n.cullFace(n.BACK),O(n,f)},depthPrepass(i,u){let c=C(n);n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.colorMask(!1,!1,!1,!1),n.useProgram(o),n.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let s of u)n.uniformMatrix4fv(a(o,"uModel"),!1,s.model),n.bindVertexArray(s.mesh.vao),n.drawElements(n.TRIANGLES,s.mesh.indexCount,s.mesh.indexType,0);n.bindVertexArray(null),n.colorMask(!0,!0,!0,!0),O(n,c)},draw(i){let u=C(n),c=i.onStep??(()=>{});if(n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.useProgram(e),n.uniformMatrix4fv(a(e,"uViewProj"),!1,i.viewProj),c("uViewProj"),n.uniform3fv(a(e,"uEye"),i.eye),c("uEye"),n.uniform3fv(a(e,"uLightDir"),i.lightDir),c("uLightDir"),n.uniform3fv(a(e,"uLightColour"),i.lightColour),c("uLightColour"),n.uniform1f(a(e,"uAmbientGain"),i.ambientGain??1),c("uAmbientGain"),i.fog&&i.fog.density>0){n.uniform1f(a(e,"uFogDensity"),i.fog.density),n.uniform1f(a(e,"uFogHeight"),i.fog.height),n.uniform1f(a(e,"uFogFloor"),i.fog.floor??0);let s=i.fog.colour;s==="sky"?n.uniform3f(a(e,"uFogColour"),-1,-1,-1):n.uniform3f(a(e,"uFogColour"),s[0],s[1],s[2]),c("fog")}else n.uniform1f(a(e,"uFogDensity"),0);ye(n,e,i.sky),c("bindSky"),i.ao&&i.screenSize?(n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,i.ao),n.uniform1i(a(e,"uAO"),1),n.uniform2f(a(e,"uScreenSize"),i.screenSize[0],i.screenSize[1]),n.uniform1f(a(e,"uAOEnabled"),1)):n.uniform1f(a(e,"uAOEnabled"),0),c("bindAO"),n.uniformMatrix4fv(a(e,"uLightVP"),!1,i.lightVP),c("lit uLightVP"),i.shadow?(n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,i.shadow.depthTexture),n.uniform1i(a(e,"uShadowMap"),0),n.uniform1f(a(e,"uShadowTexel"),1/i.shadow.size),n.uniform1f(a(e,"uShadowStrength"),i.shadowStrength??1)):n.uniform1f(a(e,"uShadowStrength"),0);for(let s of i.draws)n.uniformMatrix4fv(a(e,"uModel"),!1,s.model),n.uniformMatrix3fv(a(e,"uNormalMat"),!1,s.normalMat),c("uNormalMat"),n.uniform3fv(a(e,"uBaseColour"),s.material.baseColour),c("uBaseColour"),n.uniform1f(a(e,"uRoughness"),s.material.roughness),n.uniform1f(a(e,"uMetalness"),s.material.metalness),n.uniform1f(a(e,"uAnisotropy"),s.material.anisotropy??0),n.bindVertexArray(s.mesh.vao),c("lit bindVAO"),n.drawElements(n.TRIANGLES,s.mesh.indexCount,s.mesh.indexType,0),c("lit drawElements");n.bindVertexArray(null),J(n,2),O(n,u)},dispose(){n.deleteProgram(t),n.deleteProgram(e),n.deleteProgram(o)}}}var se=`
uniform sampler2D uDepth;
uniform vec2 uNearFar;

float linearDepthAt(vec2 uv) {
  float d = texture(uDepth, uv).r * 2.0 - 1.0;
  float n = uNearFar.x, f = uNearFar.y;
  return (2.0 * n * f) / (f + n - d * (f - n));
}`,Kt=`
uniform float uTanHalfFov;
uniform float uAspect;

vec3 viewPosAt(vec2 uv) {
  float z = linearDepthAt(uv);
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x * uTanHalfFov * uAspect * z, ndc.y * uTanHalfFov * z, -z);
}`,qt=se+Kt,Qt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Ir=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${qt}

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
}`,Gr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${se}

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
}`;function lt(r,n,t){let{gl:e}=r,o=r.compile(Qt,Ir);if("kind"in o)return o;let a=r.compile(Qt,Gr);if("kind"in a)return a;let i=Math.max(1,n>>1),u=Math.max(1,t>>1),c=()=>{let d=e.createFramebuffer(),E=e.createTexture();return!d||!E?null:{fb:d,tex:E}},s=c(),f=c();if(!s||!f)return L("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let l=()=>{for(let d of[s,f])e.bindTexture(e.TEXTURE_2D,d.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,i,u,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,d.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,d.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};l(),e.bindFramebuffer(e.FRAMEBUFFER,s.fb);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE)return L("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${m.toString(16)}).`);let p=(d,E,y,h,g)=>{e.activeTexture(e.TEXTURE0+g),e.bindTexture(e.TEXTURE_2D,E),e.uniform1i(e.getUniformLocation(d,"uDepth"),g),e.uniform2f(e.getUniformLocation(d,"uNearFar"),y,h)},b=(d,E,y,h,g,M,R)=>{p(d,E,y,h,R),e.uniform1f(e.getUniformLocation(d,"uTanHalfFov"),Math.tan(g*Math.PI/360)),e.uniform1f(e.getUniformLocation(d,"uAspect"),M)};return{get texture(){return s.tex},get width(){return i},get height(){return u},compute(d){let E=C(e);e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,s.fb),e.viewport(0,0,i,u),e.useProgram(o),b(o,d.depthTexture,d.near,d.far,d.fovDeg,d.aspect,0),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/i,1/u),e.uniform1f(e.getUniformLocation(o,"uRadius"),d.radius??.55),e.uniform1f(e.getUniformLocation(o,"uStrength"),d.strength??1.15),e.uniform1f(e.getUniformLocation(o,"uBias"),d.bias??.035),r.blit(o);for(let[y,h,g]of[[s,f,[1,0]],[f,s,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,h.fb),e.viewport(0,0,i,u),e.useProgram(a),p(a,d.depthTexture,d.near,d.far,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,y.tex),e.uniform1i(e.getUniformLocation(a,"uAO"),1),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/i,1/u),e.uniform2f(e.getUniformLocation(a,"uDir"),g[0],g[1]),r.blit(a);J(e,2),O(e,E)},resize(d,E){let y=Math.max(1,d>>1),h=Math.max(1,E>>1);y===i&&h===u||(i=y,u=h,l())},dispose(){e.deleteProgram(o),e.deleteProgram(a);for(let d of[s,f])e.deleteFramebuffer(d.fb),e.deleteTexture(d.tex)}}}var kr=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Vr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uFocusDistance;
uniform float uAperture;
uniform float uMaxCoc;
out vec4 frag;
${se}

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
}`;function ct(r,n,t){let{gl:e}=r,o=r.compile(kr,Vr);if("kind"in o)return o;let a=Math.max(1,Math.floor(n)),i=Math.max(1,Math.floor(t)),u=e.createFramebuffer(),c=e.createTexture();if(!u||!c)return L("FRAMEBUFFER_INCOMPLETE","The GPU refused a depth-of-field buffer.");let s=()=>{e.bindTexture(e.TEXTURE_2D,c);let l=r.hdr?e.RGBA16F:e.RGBA8,m=r.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE;e.texImage2D(e.TEXTURE_2D,0,l,a,i,0,e.RGBA,m,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,u),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,c,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};s(),e.bindFramebuffer(e.FRAMEBUFFER,u);let f=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),f!==e.FRAMEBUFFER_COMPLETE?L("FRAMEBUFFER_INCOMPLETE",`The DOF buffer is incomplete (0x${f.toString(16)}).`):{texture:c,apply(l){let m=C(e);e.bindFramebuffer(e.FRAMEBUFFER,u),e.viewport(0,0,a,i),e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.useProgram(o),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,l.scene),e.uniform1i(e.getUniformLocation(o,"uScene"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,l.depthTexture),e.uniform1i(e.getUniformLocation(o,"uDepth"),1),e.uniform2f(e.getUniformLocation(o,"uNearFar"),l.near,l.far),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/a,1/i),e.uniform1f(e.getUniformLocation(o,"uFocusDistance"),l.focusDistance),e.uniform1f(e.getUniformLocation(o,"uAperture"),l.aperture??12),e.uniform1f(e.getUniformLocation(o,"uMaxCoc"),l.maxCoc??.012),r.blit(o),J(e,2),O(e,m)},resize(l,m){let p=Math.max(1,Math.floor(l)),b=Math.max(1,Math.floor(m));p===a&&b===i||(a=p,i=b,s())},dispose(){e.deleteProgram(o),e.deleteFramebuffer(u),e.deleteTexture(c)}}}var Hr=`
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
`;function X(r){return String(r).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function Jt(r){let n=document.createElement("style");n.textContent=Hr,document.head.appendChild(n);let t=document.createElement("section");t.id="lcx-fallback",t.setAttribute("aria-label",`${r.title} \u2014 flat view`),t.setAttribute("tabindex","-1"),document.getElementById("log")?.setAttribute("aria-hidden","true");let e=(a,i)=>a===null?`<td class="absent${i?" n":""}">absent</td>`:`<td class="${i?"n":""}">${X(a)}</td>`;t.innerHTML=`<h2>${X(r.title)} \u2014 flat view</h2><p class="reads">${X(r.readsAs)}</p>`+(r.notices??[]).map(a=>`<p class="notice">${X(a)}</p>`).join("")+'<div id="lcx-refusal" role="alert"></div>'+(r.html?`<div class="surface">${r.html}</div>`:`<table><caption>${X(r.title)} \u2014 flat view</caption><thead><tr>`+r.columns.map(a=>`<th scope="col" class="${a.numeric?"n":""}">${X(a.label)}</th>`).join("")+"</tr></thead><tbody>"+r.rows.map(a=>"<tr>"+r.columns.map(i=>e(a[i.key]??null,!!i.numeric)).join("")+"</tr>").join("")+"</tbody></table>"),document.body.appendChild(t);function o(a,i){let u=document.getElementById("lcx-refusal");u&&(u.innerHTML=`<p class="refusal"><strong>${X(a)}</strong> \u2014 ${X(i)} The measurements below are unaffected.</p>`),delete t.dataset.rendered;for(let c of Array.from(document.querySelectorAll("canvas")))c.style.display="none";t.focus({preventScroll:!0})}return document.addEventListener("webglcontextlost",a=>{a.preventDefault(),o("CONTEXT_LOST","The GPU dropped the WebGL context for this page mid-session.")},!0),{markRendered(){t.dataset.rendered="1"},showRefusal:o}}var z=new URLSearchParams(location.search),vt=z.get("atmos")!=="0",cr=z.get("shadow")!=="0",Mt=Ke.includes(z.get("tier")??"")?z.get("tier"):"full",ve=qe(Mt),mr=z.get("ao")!=="0"&&ve.ao,pt=z.get("dof")!=="0"&&ve.dof,bt=[],dr=[];function fr(r,n,t,e){let o=z.get(r);if(o===null)return n;let a=Number(o);if(!Number.isFinite(a))return bt.push(`${r}=${o}`),n;let i=Math.max(t,Math.min(e,a));return i!==a&&dr.push(`${r}=${o} used as ${i}`),i}var St=fr("scale",1,1,3),Et=Math.trunc(fr("frames",300,1,2e4)),N=1200*St,B=720*St,Lt=document.getElementById("c");Lt.width=N;Lt.height=B;var ce={lat:47.14,lon:9.52};function hr(r,n){let t=o=>o*Math.PI/180,e=Math.sin(t(ce.lat))*Math.sin(t(r))+Math.cos(t(ce.lat))*Math.cos(t(r))*Math.cos(t(n-ce.lon));return Math.acos(Math.min(1,Math.max(-1,e)))*180/Math.PI}var Y=[{to:"London",lat:51.51,lon:-.13},{to:"New York",lat:40.71,lon:-74.01},{to:"Chicago",lat:41.88,lon:-87.63},{to:"Dubai",lat:25.2,lon:55.27},{to:"Singapore",lat:1.35,lon:103.82},{to:"Tokyo",lat:35.68,lon:139.65},{to:"Johannesburg",lat:-26.2,lon:28.04}],pr=null,br=Jt({title:"E2 \xB7 The Globe \u2014 corridors from Vaduz",readsAs:"The rendered view states reach as arc height and time-of-day as a terminator, so which desks are awake and how far each corridor travels are read from the geometry. This table gives the same endpoints as numbers, and no reach and no daylight.",notices:["Coordinates are real. Corridor set is illustrative."],columns:[{key:"to",label:"Corridor to"},{key:"lat",label:"Lat",numeric:!0},{key:"lon",label:"Lon",numeric:!0},{key:"sep",label:"Great-circle separation",numeric:!0}],rows:Y.map(r=>({to:r.to,lat:r.lat.toFixed(2),lon:r.lon.toFixed(2),sep:`${hr(r.lat,r.lon).toFixed(1)}\xB0`}))});pr=br;bt.length>0&&Le(`BAD_PARAM: ${bt.join(", ")} \u2014 not a number, so the view was refused rather than drawn from a nonsensical value. Nothing about the coordinates below has changed; correct the URL and reload.`);z.get("refuse")==="1"&&Le("FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. The three-dimensional view is not being drawn.");var Re=Oe(Lt,{alpha:!1});Ce(Re)||Le(`stage: ${Re.code} \u2014 ${Re.reason}`);var _=Re,A=_.gl,Xr=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,zr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${Xe}
${ze}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,Wr=document.getElementById("log"),jr=r=>`${r.reason} ${r.detail??""}`;function Le(r){document.title="REFUSED";let n=document.getElementById("log");n&&(n.textContent=r);let[t,...e]=r.split(":");throw pr?.showRefusal(t?.trim()??"REFUSED",e.join(":").trim()||r),new Error(r)}function P(r,n){return"kind"in n&&Le(`${r}: ${jr(n)}`),n}var $r=P("present",_.compile(Xr,zr)),ue=P("lit",ut(_)),Z=P("target",ot(_,N,B)),Zt=P("shadow",at(_,Ee(Mt,1024))),Yr=P("sky",it(_)),er=P("ao",lt(_,N,B)),tr=P("dof",ct(_,N,B)),rr=Math.PI/180,de=1,wt=1.06,Er=1.38,Tr=.026,Qr=.034;function Tt(r,n,t){let e=r*rr,o=n*rr;return[t*Math.cos(e)*Math.cos(o),t*Math.sin(e),t*Math.cos(e)*Math.sin(o)]}var Kr=[{name:"London",lat:51.51,lon:-.13},{name:"Vaduz",lat:47.14,lon:9.52},{name:"Istanbul",lat:41.01,lon:28.98},{name:"Dubai",lat:25.2,lon:55.27},{name:"Mumbai",lat:19.08,lon:72.88},{name:"Lagos",lat:6.52,lon:3.38},{name:"Nairobi",lat:-1.29,lon:36.82},{name:"Johannesburg",lat:-26.2,lon:28.04},{name:"New York",lat:40.71,lon:-74.01},{name:"Chicago",lat:41.88,lon:-87.63},{name:"Singapore",lat:1.35,lon:103.82},{name:"Tokyo",lat:35.68,lon:139.65}],Me={lat:18,lon:60},xr=-15,Fe=Tt(Me.lat,Me.lon,1),nr=[-Fe[0],-Fe[1],-Fe[2]],yr=ae(de,64,96),gr=ae(wt,56,84),Rr=Ye(Er,Tr,168,20),Fr=ae(Qr,14,20),qr=P("earth mesh",$(_,yr)),Jr=P("atmosphere mesh",$(_,gr)),Zr=P("ring mesh",$(_,Rr)),en=P("city mesh",$(_,Fr)),xt=Y.map(r=>Qe(ce.lat,ce.lon,r.lat,r.lon,de,.016,.2,128,12)),tn=xt.map((r,n)=>P(`corridor ${Y[n].to}`,$(_,r))),we=(r,n,t)=>{let e=oe();return e[12]=r,e[13]=n,e[14]=t,e},_e=new Float32Array([1,0,0,0,1,0,0,0,1]),rn=(()=>{let r=oe();return r[0]=-1,r})(),nn=new Float32Array([-1,0,0,0,1,0,0,0,1]),mt=V("#0E1628"),dt=r=>[mt[0]*r,mt[1]*r,mt[2]*r],or={zenith:dt(.55),horizon:dt(1.6),ground:dt(.35)},on={baseColour:V("#0B2B5C"),roughness:.58,metalness:.06},an={baseColour:V("#7FB2FF"),roughness:.86,metalness:0},sn={baseColour:V("#8FA3C4"),roughness:.14,metalness:.95,anisotropy:.8},un={baseColour:V("#2C6BFF"),roughness:.5,metalness:0},ln={baseColour:V("#4C86FF"),roughness:.22,metalness:.85,anisotropy:.85},_t=Kr.map(r=>{let n=Tt(r.lat,r.lon,1),t=Tt(r.lat,r.lon,de);return{...r,normal:n,draw:{mesh:en,model:we(t[0],t[1],t[2]),normalMat:_e,material:un}}}),yt={mesh:qr,model:we(0,0,0),normalMat:_e,material:on},cn={mesh:Jr,model:rn,normalMat:nn,material:an},gt={mesh:Zr,model:we(0,0,0),normalMat:_e,material:sn},Dt=_t.map(r=>r.draw),Pt=tn.map(r=>({mesh:r,model:we(0,0,0),normalMat:_e,material:ln})),Ar=vt?[yt,cn,gt]:[yt,gt],mn=[yt,gt,...Dt,...Pt],dn=[...Ar,...Dt,...Pt],H={target:[0,0,0],distance:5.4,azimuthDeg:90-xr,elevationDeg:18,fovDeg:30},me=Er+Tr,vr=[-me,-wt,-me],Mr=[me,wt,me],ge=nt(vr,Mr),fn=rt(vr,Mr),hn=me*1.05,pn=j(yr)+j(Rr)+(vt?j(gr):0)+j(Fr)*_t.length,Rt=Math.max(.01,H.distance/100),ar=Math.max(Rt+1,H.distance*8),ir=1.6,sr=140;function Se(){let r=tt({direction:nr,colour:[1,1,1],extent:hn},ge,fn),n=et(H,N/B),t=ie(H);ue.shadowPass(r,mn,Zt),Z.bind(),A.clear(A.DEPTH_BUFFER_BIT),Yr.draw({eye:t,target:H.target,fovDeg:H.fovDeg??34,aspect:N/B,sky:or}),ue.depthPrepass(n,dn),mr&&(er.compute({depthTexture:Z.depthTexture,near:Rt,far:ar,fovDeg:H.fovDeg??34,aspect:N/B,radius:.35,strength:1.1}),Z.bind());let e={viewProj:n,eye:t,lightDir:nr,lightColour:[6.6,6.2,5.5],sky:or,lightVP:r,shadow:cr?Zt:null,shadowStrength:.92,ao:er.texture,screenSize:[N,B]};ue.draw({...e,ambientGain:ir,draws:Ar}),ue.draw({...e,ambientGain:(ir+sr)/2,draws:Pt}),ue.draw({...e,ambientGain:sr,draws:Dt});let o=Math.hypot(t[0]-ge[0],t[1]-ge[1],t[2]-ge[2]);pt&&tr.apply({scene:Z.texture,depthTexture:Z.depthTexture,near:Rt,far:ar,fovDeg:H.fovDeg??34,aspect:N/B,focusDistance:o,aperture:.12,maxCoc:.006}),A.bindFramebuffer(A.FRAMEBUFFER,null),A.viewport(0,0,N,B),A.disable(A.DEPTH_TEST),A.activeTexture(A.TEXTURE0),A.bindTexture(A.TEXTURE_2D,pt?tr.texture:Z.texture),_.blit($r,a=>A.uniform1i(A.getUniformLocation(a,"uScene"),0))}Se();var ee=ie(H),Ae=Math.hypot(ee[0],ee[1],ee[2]),bn=[ee[0]/Ae,ee[1]/Ae,ee[2]/Ae],ur=(r,n)=>r[0]*n[0]+r[1]*n[1]+r[2]*n[2],En=de/Ae,le=_t.map(r=>({name:r.name,facing:ur(r.normal,bn)>En,sunlit:ur(r.normal,Fe)>0})),lr=4e3;function Tn(r){let n=new Uint8Array(4),t=performance.now();Se(),A.readPixels(0,0,1,1,A.RGBA,A.UNSIGNED_BYTE,n);let e=Math.max(.01,performance.now()-t),o=Math.min(r,Math.max(1,Math.floor(lr/e))),a=performance.now(),i=0;for(let u=0;u<o&&(Se(),i++,!(performance.now()-a>lr));u++);return A.readPixels(0,0,1,1,A.RGBA,A.UNSIGNED_BYTE,n),{msPerFrame:(performance.now()-a)/i,measured:i}}var Ft=Tn(Et),ft=Ft.msPerFrame,At=We();if(At.length>0){let r="BRAND FIDELITY FAILED \u2014 "+At.map(t=>`${t.key}: expected ${t.expected}, got ${t.actual}`).join("; ");document.title="REFUSED";let n=document.getElementById("log");throw n&&(n.textContent=r),new Error(r)}var Sr=(()=>{let r=A.getExtension("WEBGL_debug_renderer_info");return r?String(A.getParameter(r.UNMASKED_RENDERER_WEBGL)):"unknown"})(),ht=/swiftshader|llvmpipe|software/i.test(Sr),Lr={ao:mr,dof:pt,tier:ve.tier,tierDprScale:ve.dprScale,tierShadowMapSize:Ee(Mt,1024),shadowBaseline:1024,glError:A.getError(),brandFidelity:At,atmosphere:vt,shadow:cr,triangles:pn,resolution:`${N}x${B}`,dprScale:St,frames:Ft.measured,framesRequested:Et,sweepTruncated:Ft.measured<Et,paramClamps:dr,msPerFrame:Number(ft.toFixed(3)),fps:Math.round(1e3/ft),centralMeridian:xr,subSolar:`${Me.lat}N ${Me.lon}E`,cities:le.length,citiesFacing:le.filter(r=>r.facing).length,citiesSunlit:le.filter(r=>r.sunlit).length,corridors:Y.length,corridorTriangles:xt.reduce((r,n)=>r+j(n),0),corridorPeakLift:xt.map((r,n)=>{let t=0;for(let e=0;e<r.positions.length;e+=3)t=Math.max(t,Math.hypot(r.positions[e],r.positions[e+1],r.positions[e+2]));return{to:Y[n].to,lift:Number((t-de).toFixed(4)),separationDeg:Number(hr(Y[n].lat,Y[n].lon).toFixed(1))}}),behindLimb:le.filter(r=>!r.facing).map(r=>r.name),onNightSide:le.filter(r=>r.facing&&!r.sunlit).map(r=>r.name),renderer:Sr,rendererClass:ht?"software":"hardware",headroom:ht?null:Number((16.6-ft).toFixed(3)),headroomRefusal:ht?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null};globalThis.E2=Lr;Wr.textContent=JSON.stringify(Lr,null,2);Se();br.markRendered();document.title="READY";

var gt={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable."};function L(n,r){return r===void 0?{kind:"refused",code:n,reason:gt[n]}:{kind:"refused",code:n,reason:gt[n],detail:r}}function Me(n){return n.kind==="stage"}function Le(n,r={}){let t=n.getContext("webgl2",{antialias:r.antialias??!1,alpha:r.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!t)return L("NO_WEBGL2");let e=t.getExtension("EXT_color_buffer_float"),o=n.width,a=n.height,i=e?t.RGBA16F:t.RGBA8,s=e?t.HALF_FLOAT:t.UNSIGNED_BYTE,c=(b,v)=>{let A=t.createTexture();t.bindTexture(t.TEXTURE_2D,A),t.texImage2D(t.TEXTURE_2D,0,i,b,v,0,t.RGBA,s,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);let F=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,F),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,A,0);let M=t.checkFramebufferStatus(t.FRAMEBUFFER);return M!==t.FRAMEBUFFER_COMPLETE?L("FRAMEBUFFER_INCOMPLETE",`status 0x${M.toString(16)} at ${b}\xD7${v}`):{texture:A,framebuffer:F,width:b,height:v}},m=r.bloomShift??2,f={w:o,h:a},u=c(o,a);if("kind"in u)return u;let d=c(Math.max(1,o>>m),Math.max(1,a>>m));if("kind"in d)return d;let h=c(Math.max(1,o>>m),Math.max(1,a>>m));if("kind"in h)return h;let l=t.createVertexArray();t.bindVertexArray(l);let p=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,p),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null);let E=[];return{kind:"stage",gl:t,cssWidth:n.clientWidth||o,cssHeight:n.clientHeight||a,hdr:!!e,get width(){return f.w},get height(){return f.h},get scene(){return u},get bloomA(){return d},get bloomB(){return h},setRegion(b,v){let A=Math.max(1,Math.round(b)),F=Math.max(1,Math.round(v));if(!(A===f.w&&F===f.h)){f={w:A,h:F};for(let M of[u,d,h])"kind"in M||(t.deleteFramebuffer(M.framebuffer),t.deleteTexture(M.texture));u=c(A,F),d=c(Math.max(1,A>>m),Math.max(1,F>>m)),h=c(Math.max(1,A>>m),Math.max(1,F>>m))}},compile(b,v){let A=(k,y)=>{let T=t.createShader(k);return t.shaderSource(T,y),t.compileShader(T),t.getShaderParameter(T,t.COMPILE_STATUS)?T:L("SHADER_COMPILE_FAILED",t.getShaderInfoLog(T)??"(no log)")},F=A(t.VERTEX_SHADER,b);if(typeof F=="object"&&"kind"in F)return F;let M=A(t.FRAGMENT_SHADER,v);if(typeof M=="object"&&"kind"in M)return M;let S=t.createProgram();return t.attachShader(S,F),t.attachShader(S,M),t.linkProgram(S),t.getProgramParameter(S,t.LINK_STATUS)?(E.push(S),S):L("PROGRAM_LINK_FAILED",t.getProgramInfoLog(S)??"(no log)")},bindTarget(b){t.bindFramebuffer(t.FRAMEBUFFER,b?b.framebuffer:null),t.viewport(0,0,b?b.width:f.w,b?b.height:f.h)},blit(b,v){t.useProgram(b),t.bindVertexArray(l),v?.(b),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null)},dispose(){for(let b of E)t.deleteProgram(b);for(let b of[u,d,h])"kind"in b||(t.deleteFramebuffer(b.framebuffer),t.deleteTexture(b.texture));t.deleteBuffer(p),t.deleteVertexArray(l)}}}var q=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function se(n,r){let t=new Float32Array(16);for(let e=0;e<4;e++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=n[i*4+o]*r[e*4+i];t[e*4+o]=a}return t}var W=(n,r)=>[n[0]-r[0],n[1]-r[1],n[2]-r[2]],ie=(n,r)=>n[0]*r[0]+n[1]*r[1]+n[2]*r[2],z=(n,r)=>[n[1]*r[2]-n[2]*r[1],n[2]*r[0]-n[0]*r[2],n[0]*r[1]-n[1]*r[0]];function C(n){let r=Math.hypot(n[0],n[1],n[2]);return r===0?n:[n[0]/r,n[1]/r,n[2]/r]}function Se(n,r,t,e){let o=1/Math.tan(n/2);return new Float32Array([o/r,0,0,0,0,o,0,0,0,0,(e+t)/(t-e),-1,0,0,2*e*t/(t-e),0])}function we(n,r,t,e,o,a){let i=r-n,s=e-t,c=a-o;return new Float32Array([2/i,0,0,0,0,2/s,0,0,0,0,-2/c,0,-(r+n)/i,-(e+t)/s,-(a+o)/c,1])}function ue(n,r,t){let e=C(W(n,r)),o=z(t,e);if(Math.hypot(o[0],o[1],o[2])<1e-8)return q();let a=C(o),i=z(e,a);return new Float32Array([a[0],i[0],e[0],0,a[1],i[1],e[1],0,a[2],i[2],e[2],0,-ie(a,n),-ie(i,n),-ie(e,n),1])}function xt(n){return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4)}var rr=/^#?([0-9a-fA-F]{6})$/;function I(n){let r=rr.exec(n.trim());if(!r)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(n)}`);let t=r[1];return[0,2,4].map(e=>xt(parseInt(t.slice(e,e+2),16)/255))}var _e={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},nr=Object.freeze(Object.fromEntries(Object.keys(_e).map(n=>[n,I(_e[n])])));var yt=.4;var De=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${yt.toFixed(2)}); }`,Ue=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function or(n){let r=[1/0,1/0,1/0],t=[-1/0,-1/0,-1/0];for(let e=0;e<n.length;e+=3)for(let o=0;o<3;o++){let a=n[e+o];a<r[o]&&(r[o]=a),a>t[o]&&(t[o]=a)}return n.length===0?{min:[0,0,0],max:[0,0,0]}:{min:r,max:t}}function Rt(n,r,t,e){let o=new Float32Array(n.length);for(let i=0;i<e.length;i+=3){let s=e[i],c=e[i+1],m=e[i+2],f=s*3,u=c*3,d=m*3,h=s*2,l=c*2,p=m*2,E=n[u]-n[f],x=n[u+1]-n[f+1],b=n[u+2]-n[f+2],v=n[d]-n[f],A=n[d+1]-n[f+1],F=n[d+2]-n[f+2],M=t[l]-t[h],S=t[l+1]-t[h+1],k=t[p]-t[h],y=t[p+1]-t[h+1],T=M*y-k*S;if(Math.abs(T)<1e-12)continue;let g=1/T,D=(E*y-v*S)*g,B=(x*y-A*S)*g,P=(b*y-F*S)*g;for(let w of[f,u,d])o[w]=o[w]+D,o[w+1]=o[w+1]+B,o[w+2]=o[w+2]+P}let a=new Float32Array(n.length);for(let i=0;i<a.length;i+=3){let s=r[i],c=r[i+1],m=r[i+2],f=o[i],u=o[i+1],d=o[i+2],h=f*s+u*c+d*m;f-=s*h,u-=c*h,d-=m*h;let l=Math.hypot(f,u,d);l<1e-8&&(Math.abs(s)<.9?(f=0,u=-m,d=c):(f=-m,u=0,d=s),l=Math.hypot(f,u,d)||1),a[i]=f/l,a[i+1]=u/l,a[i+2]=d/l}return a}function At(n,r){let t=new Float32Array(n.length);for(let e=0;e<r.length;e+=3){let o=r[e]*3,a=r[e+1]*3,i=r[e+2]*3,s=n[a]-n[o],c=n[a+1]-n[o+1],m=n[a+2]-n[o+2],f=n[i]-n[o],u=n[i+1]-n[o+1],d=n[i+2]-n[o+2],h=c*d-m*u,l=m*f-s*d,p=s*u-c*f;for(let E of[o,a,i])t[E]=t[E]+h,t[E+1]=t[E+1]+l,t[E+2]=t[E+2]+p}for(let e=0;e<t.length;e+=3){let o=Math.hypot(t[e],t[e+1],t[e+2]);o>0&&(t[e]=t[e]/o,t[e+1]=t[e+1]/o,t[e+2]=t[e+2]/o)}return t}function Ne(n,r,t,e,o){let{min:a,max:i}=or(n),s=e??At(n,t);return{positions:n,normals:s,uvs:r,indices:t,min:a,max:i,tangents:o??Rt(n,s,r,t)}}function J(n=.5,r=24,t=32){let e=Math.max(2,r),o=Math.max(3,t),a=(e+1)*(o+1),i=new Float32Array(a*3),s=new Float32Array(a*3),c=new Float32Array(a*2),m=new Uint16Array(e*o*6),f=0,u=0,d=0;for(let h=0;h<=e;h++){let l=h/e*Math.PI;for(let p=0;p<=o;p++){let E=p/o*Math.PI*2,x=Math.sin(l)*Math.cos(E),b=Math.cos(l),v=Math.sin(l)*Math.sin(E);i[f]=x*n,i[f+1]=b*n,i[f+2]=v*n,s[f]=x,s[f+1]=b,s[f+2]=v,f+=3,c[u++]=p/o,c[u++]=h/e}}for(let h=0;h<e;h++)for(let l=0;l<o;l++){let p=h*(o+1)+l,E=p+1,x=p+(o+1),b=x+1;m[d++]=p,m[d++]=E,m[d++]=x,m[d++]=E,m[d++]=b,m[d++]=x}return Ne(i,c,m,s)}function Oe(n=.5,r=.08,t=64,e=24){let o=Math.max(3,t),a=Math.max(3,e),i=[],s=[],c=[],m=[],f=[];for(let u=0;u<=o;u++){let d=u/o*Math.PI*2,h=Math.cos(d),l=Math.sin(d);for(let p=0;p<=a;p++){let E=p/a*Math.PI*2,x=Math.cos(E),b=Math.sin(E);i.push((n+r*x)*h,r*b,(n+r*x)*l),s.push(h*x,b,l*x),c.push(u/o,p/a),f.push(-l,0,h)}}for(let u=0;u<o;u++)for(let d=0;d<a;d++){let h=u*(a+1)+d,l=h+1,p=h+(a+1),E=p+1;m.push(h,l,p,l,E,p)}return Ne(new Float32Array(i),new Float32Array(c),new Uint16Array(m),new Float32Array(s),new Float32Array(f))}function Pe(n,r){let t=n*Math.PI/180,e=r*Math.PI/180,o=Math.cos(t);return[o*Math.cos(e),Math.sin(t),o*Math.sin(e)]}function Be(n,r,t,e,o=1,a=.012,i=.22,s=96,c=8){let m=Math.max(8,s),f=Math.max(3,c),u=Pe(n,r),d=Pe(t,e),h=Math.max(-1,Math.min(1,u[0]*d[0]+u[1]*d[1]+u[2]*d[2])),l=Math.acos(h),p=l<1e-4||Math.abs(Math.PI-l)<1e-4,E=Math.sin(l),x=i*o*(l/Math.PI),b=[],v=[],A=[],F=[],M=[],S=y=>{if(p)return[u[0]+(d[0]-u[0])*y,u[1]+(d[1]-u[1])*y,u[2]+(d[2]-u[2])*y];let T=Math.sin((1-y)*l)/E,g=Math.sin(y*l)/E;return[u[0]*T+d[0]*g,u[1]*T+d[1]*g,u[2]*T+d[2]*g]},k=y=>{let T=S(y),g=Math.hypot(T[0],T[1],T[2])||1,D=o+x*Math.sin(Math.PI*y);return[T[0]/g*D,T[1]/g*D,T[2]/g*D]};for(let y=0;y<=m;y++){let T=y/m,g=k(T),D=k(Math.min(1,T+1/m)),B=k(Math.max(0,T-1/m)),P=D[0]-B[0],w=D[1]-B[1],V=D[2]-B[2],ye=Math.hypot(P,w,V)||1;P/=ye,w/=ye,V/=ye;let Re=Math.hypot(g[0],g[1],g[2])||1,dt=g[0]/Re,mt=g[1]/Re,ht=g[2]/Re,Y=w*ht-V*mt,$=V*dt-P*ht,K=P*mt-w*dt,Ae=Math.hypot(Y,$,K)||1;Y/=Ae,$/=Ae,K/=Ae;let Zt=$*V-K*w,er=K*P-Y*V,tr=Y*w-$*P;for(let ae=0;ae<=f;ae++){let pt=ae/f*Math.PI*2,ve=Math.cos(pt),Fe=Math.sin(pt),bt=Y*ve+Zt*Fe,Et=$*ve+er*Fe,Tt=K*ve+tr*Fe;b.push(g[0]+bt*a,g[1]+Et*a,g[2]+Tt*a),v.push(bt,Et,Tt),A.push(T,ae/f),F.push(P,w,V)}}for(let y=0;y<m;y++)for(let T=0;T<f;T++){let g=y*(f+1)+T,D=g+1,B=g+(f+1),P=B+1;M.push(g,B,D,D,B,P)}return Ne(new Float32Array(b),new Float32Array(A),b.length/3>65535?new Uint32Array(M):new Uint16Array(M),new Float32Array(v),new Float32Array(F))}function H(n){return n.indices.length/3}var Ce=89,Ie=Math.PI/180;function Q(n){let r=Math.max(-Ce,Math.min(Ce,n.elevationDeg))*Ie,t=n.azimuthDeg*Ie,e=Math.max(1e-4,n.distance),o=Math.sin(r)*e,a=Math.cos(r)*e;return[n.target[0]+Math.sin(t)*a,n.target[1]+o,n.target[2]+Math.cos(t)*a]}function Ge(n,r){let t=Q(n),e=n.near??Math.max(.01,n.distance/100),o=n.far??Math.max(e+1,n.distance*8),a=Se((n.fovDeg??38)*Ie,Math.max(.001,r),e,o),i=ue(t,n.target,[0,1,0]);return se(a,i)}function ke(n,r,t){let e=C(n.direction),o=n.extent??Math.max(.1,t*1.35),a=Math.max(1,t*2),i=[r[0]-e[0]*a,r[1]-e[1]*a,r[2]-e[2]*a],s=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],c=ue(i,r,s),m=we(-o,o,-o,o,.01,a+t*2+o);return se(m,c)}function Ve(n,r){let t=W([r[0],r[1],r[2]],[n[0],n[1],n[2]]);return Math.hypot(t[0],t[1],t[2])/2}function He(n,r){return[(n[0]+r[0])/2,(n[1]+r[1])/2,(n[2]+r[2])/2]}function Xe(n,r,t){let{gl:e}=n,o=Math.max(1,Math.floor(r)),a=Math.max(1,Math.floor(t)),i=e.createFramebuffer(),s=e.createTexture(),c=e.createTexture();if(!i||!s||!c)return L("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let m=n.hdr?e.RGBA16F:e.RGBA8,f=n.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,u=()=>{e.bindTexture(e.TEXTURE_2D,s),e.texImage2D(e.TEXTURE_2D,0,m,o,a,0,e.RGBA,f,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,c),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,o,a,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,s,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,c,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};u(),e.bindFramebuffer(e.FRAMEBUFFER,i);let d=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),d!==e.FRAMEBUFFER_COMPLETE?L("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${d.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:s,depthTexture:c,get width(){return o},get height(){return a},bind(){e.bindFramebuffer(e.FRAMEBUFFER,i),e.viewport(0,0,o,a)},resize(h,l){let p=Math.max(1,Math.floor(h)),E=Math.max(1,Math.floor(l));p===o&&E===a||(o=p,a=E,u())},dispose(){e.deleteFramebuffer(i),e.deleteTexture(s),e.deleteTexture(c)}}}function ze(n,r=1024){let{gl:t}=n,e=Math.max(256,Math.min(2048,Math.floor(r))),o=t.createFramebuffer(),a=t.createTexture();if(!o||!a)return L("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");t.bindTexture(t.TEXTURE_2D,a),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,e,e,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,o),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,a,0);let i=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),i!==t.FRAMEBUFFER_COMPLETE?L("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:e,bind(){t.bindFramebuffer(t.FRAMEBUFFER,o),t.viewport(0,0,e,e)},dispose(){t.deleteFramebuffer(o),t.deleteTexture(a)}}}var ce=`
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
}`,le={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function fe(n,r,t={}){let e=t.zenith??le.zenith,o=t.horizon??le.horizon,a=t.ground??le.ground;n.uniform3f(n.getUniformLocation(r,"uSkyZenith"),e[0],e[1],e[2]),n.uniform3f(n.getUniformLocation(r,"uSkyHorizon"),o[0],o[1],o[2]),n.uniform3f(n.getUniformLocation(r,"uSkyGround"),a[0],a[1],a[2])}var ar=`#version 300 es
precision highp float;
out vec2 vNdc;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`,ir=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${ce}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;function We(n){let{gl:r}=n,t=n.compile(ar,ir);return"kind"in t?t:{draw(e){let o=C(W(e.target,e.eye)),a=Math.abs(o[1])>.999?[0,0,1]:[0,1,0],i=C(z(o,a)),s=C(z(i,o));r.disable(r.DEPTH_TEST),r.depthMask(!1),r.disable(r.BLEND),r.useProgram(t),r.uniform3f(r.getUniformLocation(t,"uRight"),i[0],i[1],i[2]),r.uniform3f(r.getUniformLocation(t,"uUp"),s[0],s[1],s[2]),r.uniform3f(r.getUniformLocation(t,"uForward"),o[0],o[1],o[2]),r.uniform1f(r.getUniformLocation(t,"uTanHalfFov"),Math.tan(e.fovDeg*Math.PI/360)),r.uniform1f(r.getUniformLocation(t,"uAspect"),Math.max(.001,e.aspect)),fe(r,t,e.sky),n.blit(t),r.depthMask(!0),r.enable(r.DEPTH_TEST)},dispose(){r.deleteProgram(t)}}}var vt=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,je=`#version 300 es
precision highp float;
void main(){}`,sr=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,Ft=`#version 300 es
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
}`,Mt=`#version 300 es
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

out vec4 frag;
${ce}

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

  // NO TONE MAP. The composite owns the only one in the pipeline.
  frag = vec4(direct + ambient, 1.0);
}`;function X(n,r){let{gl:t}=n,e=t.createVertexArray(),o=t.createBuffer(),a=t.createBuffer(),i=t.createBuffer(),s=t.createBuffer();return!e||!o||!a||!i||!s?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(t.bindVertexArray(e),t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,r.positions,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,a),t.bufferData(t.ARRAY_BUFFER,r.normals,t.STATIC_DRAW),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,i),t.bufferData(t.ARRAY_BUFFER,r.tangents,t.STATIC_DRAW),t.enableVertexAttribArray(2),t.vertexAttribPointer(2,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,s),t.bufferData(t.ELEMENT_ARRAY_BUFFER,r.indices,t.STATIC_DRAW),t.bindVertexArray(null),{vao:e,indexCount:r.indices.length,indexType:r.indices instanceof Uint32Array?t.UNSIGNED_INT:t.UNSIGNED_SHORT,dispose(){t.deleteVertexArray(e),t.deleteBuffer(o),t.deleteBuffer(a),t.deleteBuffer(i),t.deleteBuffer(s)}})}function Ye(n){let{gl:r}=n,t=n.compile(vt,je);if("kind"in t)return t;let e=n.compile(Ft,Mt);if("kind"in e)return e;let o=n.compile(sr,je);if("kind"in o)return o;let a=(i,s)=>r.getUniformLocation(i,s);return{shadowPass(i,s,c,m){let f=m??(()=>{});c.bind(),f("shadow.bind"),r.clear(r.DEPTH_BUFFER_BIT),r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.FRONT),r.useProgram(t),f("useProgram(shadow)"),r.uniformMatrix4fv(a(t,"uLightVP"),!1,i),f("uLightVP");for(let u of s)r.uniformMatrix4fv(a(t,"uModel"),!1,u.model),f("shadow uModel"),r.bindVertexArray(u.mesh.vao),f("shadow bindVAO"),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0),f("shadow drawElements");r.bindVertexArray(null),r.cullFace(r.BACK)},depthPrepass(i,s){r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.colorMask(!1,!1,!1,!1),r.useProgram(o),r.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let c of s)r.uniformMatrix4fv(a(o,"uModel"),!1,c.model),r.bindVertexArray(c.mesh.vao),r.drawElements(r.TRIANGLES,c.mesh.indexCount,c.mesh.indexType,0);r.bindVertexArray(null),r.colorMask(!0,!0,!0,!0)},draw(i){let s=i.onStep??(()=>{});r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.useProgram(e),r.uniformMatrix4fv(a(e,"uViewProj"),!1,i.viewProj),s("uViewProj"),r.uniform3fv(a(e,"uEye"),i.eye),s("uEye"),r.uniform3fv(a(e,"uLightDir"),i.lightDir),s("uLightDir"),r.uniform3fv(a(e,"uLightColour"),i.lightColour),s("uLightColour"),r.uniform1f(a(e,"uAmbientGain"),i.ambientGain??1),s("uAmbientGain"),fe(r,e,i.sky),s("bindSky"),i.ao&&i.screenSize?(r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,i.ao),r.uniform1i(a(e,"uAO"),1),r.uniform2f(a(e,"uScreenSize"),i.screenSize[0],i.screenSize[1]),r.uniform1f(a(e,"uAOEnabled"),1)):r.uniform1f(a(e,"uAOEnabled"),0),s("bindAO"),r.uniformMatrix4fv(a(e,"uLightVP"),!1,i.lightVP),s("lit uLightVP"),i.shadow?(r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,i.shadow.depthTexture),r.uniform1i(a(e,"uShadowMap"),0),r.uniform1f(a(e,"uShadowTexel"),1/i.shadow.size),r.uniform1f(a(e,"uShadowStrength"),i.shadowStrength??1)):r.uniform1f(a(e,"uShadowStrength"),0);for(let c of i.draws)r.uniformMatrix4fv(a(e,"uModel"),!1,c.model),r.uniformMatrix3fv(a(e,"uNormalMat"),!1,c.normalMat),s("uNormalMat"),r.uniform3fv(a(e,"uBaseColour"),c.material.baseColour),s("uBaseColour"),r.uniform1f(a(e,"uRoughness"),c.material.roughness),r.uniform1f(a(e,"uMetalness"),c.material.metalness),r.uniform1f(a(e,"uAnisotropy"),c.material.anisotropy??0),r.bindVertexArray(c.mesh.vao),s("lit bindVAO"),r.drawElements(r.TRIANGLES,c.mesh.indexCount,c.mesh.indexType,0),s("lit drawElements");r.bindVertexArray(null),r.disable(r.CULL_FACE)},dispose(){r.deleteProgram(t),r.deleteProgram(e),r.deleteProgram(o)}}}var Z=`
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
}`,Lt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,ur=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${Z}

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
}`,lr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${Z}

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
}`;function $e(n,r,t){let{gl:e}=n,o=n.compile(Lt,ur);if("kind"in o)return o;let a=n.compile(Lt,lr);if("kind"in a)return a;let i=Math.max(1,r>>1),s=Math.max(1,t>>1),c=()=>{let l=e.createFramebuffer(),p=e.createTexture();return!l||!p?null:{fb:l,tex:p}},m=c(),f=c();if(!m||!f)return L("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let u=()=>{for(let l of[m,f])e.bindTexture(e.TEXTURE_2D,l.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,i,s,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,l.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,l.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};u(),e.bindFramebuffer(e.FRAMEBUFFER,m.fb);let d=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),d!==e.FRAMEBUFFER_COMPLETE)return L("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${d.toString(16)}).`);let h=(l,p,E,x,b,v,A)=>{e.activeTexture(e.TEXTURE0+A),e.bindTexture(e.TEXTURE_2D,p),e.uniform1i(e.getUniformLocation(l,"uDepth"),A),e.uniform2f(e.getUniformLocation(l,"uNearFar"),E,x),e.uniform1f(e.getUniformLocation(l,"uTanHalfFov"),Math.tan(b*Math.PI/360)),e.uniform1f(e.getUniformLocation(l,"uAspect"),v)};return{get texture(){return m.tex},get width(){return i},get height(){return s},compute(l){e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,m.fb),e.viewport(0,0,i,s),e.useProgram(o),h(o,l.depthTexture,l.near,l.far,l.fovDeg,l.aspect,0),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/i,1/s),e.uniform1f(e.getUniformLocation(o,"uRadius"),l.radius??.55),e.uniform1f(e.getUniformLocation(o,"uStrength"),l.strength??1.15),e.uniform1f(e.getUniformLocation(o,"uBias"),l.bias??.035),n.blit(o);for(let[p,E,x]of[[m,f,[1,0]],[f,m,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,E.fb),e.viewport(0,0,i,s),e.useProgram(a),h(a,l.depthTexture,l.near,l.far,l.fovDeg,l.aspect,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,p.tex),e.uniform1i(e.getUniformLocation(a,"uAO"),1),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/i,1/s),e.uniform2f(e.getUniformLocation(a,"uDir"),x[0],x[1]),n.blit(a);e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(l,p){let E=Math.max(1,l>>1),x=Math.max(1,p>>1);E===i&&x===s||(i=E,s=x,u())},dispose(){e.deleteProgram(o),e.deleteProgram(a);for(let l of[m,f])e.deleteFramebuffer(l.fb),e.deleteTexture(l.tex)}}}var cr=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,fr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uFocusDistance;
uniform float uAperture;
uniform float uMaxCoc;
out vec4 frag;
${Z}

/* Circle of confusion in UV units. The thin-lens relation reduces to a difference of
   reciprocals, which is why a subject 1 m from a 2 m focus blurs far more than one 11 m from
   12 m \u2014 a linear distance falloff gets that backwards and is the usual shortcut. */
float cocAt(vec2 uv) {
  float z = linearDepthAt(uv);
  float c = abs(1.0 / max(0.05, uFocusDistance) - 1.0 / max(0.05, z)) * uAperture;
  return clamp(c, 0.0, uMaxCoc);
}

void main(){
  float centreCoc = cocAt(vUv);
  vec3 sharp = texture(uScene, vUv).rgb;

  /* In focus: return the sharp sample untouched. Blurring by a sub-texel radius still costs 24
     taps and still softens the image slightly, and "slightly soft everywhere" is the exact look
     this effect exists to avoid. */
  if (centreCoc < 0.0015) { frag = vec4(sharp, 1.0); return; }

  vec3 sum = sharp * 0.001;
  float wsum = 0.001;

  /* 24 taps on a golden-angle spiral. A square grid at this count shows its axes in the bokeh;
     the spiral has no preferred direction, so the out-of-focus highlight stays round. */
  const int TAPS = 24;
  for (int i = 0; i < TAPS; i++) {
    float t = (float(i) + 0.5) / float(TAPS);
    float r = sqrt(t) * centreCoc;
    float a = float(i) * 2.39996323;
    vec2 off = vec2(cos(a), sin(a)) * r;
    vec2 suv = vUv + off;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;

    float sc = cocAt(suv);
    /*
     * WEIGHT BY THE SAMPLE'S OWN CoC, and this is the whole difference between depth of field
     * and smear. A SHARP sample must not bleed into a blurred pixel, or every near object grows
     * a halo of its own colour across the background behind it. A sample can only contribute as
     * far as its own circle of confusion actually reaches.
     */
    float reach = step(r, sc + uTexel.x);
    float w = reach * (0.35 + sc / max(1e-4, uMaxCoc));
    sum += texture(uScene, suv).rgb * w;
    wsum += w;
  }

  vec3 blurred = sum / wsum;
  /* Blend rather than replace: at a small CoC the gather is undersampled and shows its taps, and
     easing in over the first part of the range hides that entirely. */
  float mixAmt = smoothstep(0.0015, uMaxCoc * 0.45, centreCoc);
  frag = vec4(mix(sharp, blurred, mixAmt), 1.0);
}`;function Ke(n,r,t){let{gl:e}=n,o=n.compile(cr,fr);if("kind"in o)return o;let a=Math.max(1,Math.floor(r)),i=Math.max(1,Math.floor(t)),s=e.createFramebuffer(),c=e.createTexture();if(!s||!c)return L("FRAMEBUFFER_INCOMPLETE","The GPU refused a depth-of-field buffer.");let m=()=>{e.bindTexture(e.TEXTURE_2D,c);let u=n.hdr?e.RGBA16F:e.RGBA8,d=n.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE;e.texImage2D(e.TEXTURE_2D,0,u,a,i,0,e.RGBA,d,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,s),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,c,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};m(),e.bindFramebuffer(e.FRAMEBUFFER,s);let f=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),f!==e.FRAMEBUFFER_COMPLETE?L("FRAMEBUFFER_INCOMPLETE",`The DOF buffer is incomplete (0x${f.toString(16)}).`):{texture:c,apply(u){e.bindFramebuffer(e.FRAMEBUFFER,s),e.viewport(0,0,a,i),e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.useProgram(o),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,u.scene),e.uniform1i(e.getUniformLocation(o,"uScene"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,u.depthTexture),e.uniform1i(e.getUniformLocation(o,"uDepth"),1),e.uniform2f(e.getUniformLocation(o,"uNearFar"),u.near,u.far),e.uniform1f(e.getUniformLocation(o,"uTanHalfFov"),Math.tan(u.fovDeg*Math.PI/360)),e.uniform1f(e.getUniformLocation(o,"uAspect"),u.aspect),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/a,1/i),e.uniform1f(e.getUniformLocation(o,"uFocusDistance"),u.focusDistance),e.uniform1f(e.getUniformLocation(o,"uAperture"),u.aperture??12),e.uniform1f(e.getUniformLocation(o,"uMaxCoc"),u.maxCoc??.012),n.blit(o),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(u,d){let h=Math.max(1,Math.floor(u)),l=Math.max(1,Math.floor(d));h===a&&l===i||(a=h,i=l,m())},dispose(){e.deleteProgram(o),e.deleteFramebuffer(s),e.deleteTexture(c)}}}var Te=new URLSearchParams(location.search),at=Te.get("atmos")!=="0",Gt=Te.get("shadow")!=="0",it=Math.max(1,Math.min(3,Number(Te.get("scale")??1))),N=1200*it,O=720*it,st=document.getElementById("c");st.width=N;st.height=O;var Ze=Le(st,{alpha:!1});if(!Me(Ze))throw document.title="REFUSED",new Error(Ze.reason);var _=Ze,R=_.gl,dr=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,mr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${De}
${Ue}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,kt=document.getElementById("log"),hr=n=>`${n.reason} ${n.detail??""}`;function pr(n){throw document.title="REFUSED",kt.textContent=n,new Error(n)}function U(n,r){return"kind"in r&&pr(`${n}: ${hr(r)}`),r}var br=U("present",_.compile(dr,mr)),ee=U("lit",Ye(_)),te=U("target",Xe(_,N,O)),St=U("shadow",ze(_,1024)),Er=U("sky",We(_)),wt=U("ao",$e(_,N,O)),_t=U("dof",Ke(_,N,O)),Dt=Math.PI/180,oe=1,ut=1.06,Vt=1.38,Ht=.026,Tr=.034;function et(n,r,t){let e=n*Dt,o=r*Dt;return[t*Math.cos(e)*Math.cos(o),t*Math.sin(e),t*Math.cos(e)*Math.sin(o)]}var gr=[{name:"London",lat:51.51,lon:-.13},{name:"Vaduz",lat:47.14,lon:9.52},{name:"Istanbul",lat:41.01,lon:28.98},{name:"Dubai",lat:25.2,lon:55.27},{name:"Mumbai",lat:19.08,lon:72.88},{name:"Lagos",lat:6.52,lon:3.38},{name:"Nairobi",lat:-1.29,lon:36.82},{name:"Johannesburg",lat:-26.2,lon:28.04},{name:"New York",lat:40.71,lon:-74.01},{name:"Chicago",lat:41.88,lon:-87.63},{name:"Singapore",lat:1.35,lon:103.82},{name:"Tokyo",lat:35.68,lon:139.65}],Ut={lat:47.14,lon:9.52},pe=[{to:"London",lat:51.51,lon:-.13},{to:"New York",lat:40.71,lon:-74.01},{to:"Chicago",lat:41.88,lon:-87.63},{to:"Dubai",lat:25.2,lon:55.27},{to:"Singapore",lat:1.35,lon:103.82},{to:"Tokyo",lat:35.68,lon:139.65},{to:"Johannesburg",lat:-26.2,lon:28.04}],be={lat:18,lon:60},Xt=-15,me=et(be.lat,be.lon,1),Pt=[-me[0],-me[1],-me[2]],zt=J(oe,64,96),Wt=J(ut,56,84),jt=Oe(Vt,Ht,168,20),Yt=J(Tr,14,20),xr=U("earth mesh",X(_,zt)),yr=U("atmosphere mesh",X(_,Wt)),Rr=U("ring mesh",X(_,jt)),Ar=U("city mesh",X(_,Yt)),tt=pe.map(n=>Be(Ut.lat,Ut.lon,n.lat,n.lon,oe,.016,.2,128,12)),vr=tt.map((n,r)=>U(`corridor ${pe[r].to}`,X(_,n))),ge=(n,r,t)=>{let e=q();return e[12]=n,e[13]=r,e[14]=t,e},xe=new Float32Array([1,0,0,0,1,0,0,0,1]),Fr=(()=>{let n=q();return n[0]=-1,n})(),Mr=new Float32Array([-1,0,0,0,1,0,0,0,1]),qe=I("#0E1628"),Je=n=>[qe[0]*n,qe[1]*n,qe[2]*n],Nt={zenith:Je(.55),horizon:Je(1.6),ground:Je(.35)},Lr={baseColour:I("#0B2B5C"),roughness:.58,metalness:.06},Sr={baseColour:I("#7FB2FF"),roughness:.86,metalness:0},wr={baseColour:I("#8FA3C4"),roughness:.14,metalness:.95,anisotropy:.8},_r={baseColour:I("#2C6BFF"),roughness:.5,metalness:0},Dr={baseColour:I("#4C86FF"),roughness:.22,metalness:.85,anisotropy:.85},lt=gr.map(n=>{let r=et(n.lat,n.lon,1),t=et(n.lat,n.lon,oe);return{...n,normal:r,draw:{mesh:Ar,model:ge(t[0],t[1],t[2]),normalMat:xe,material:_r}}}),rt={mesh:xr,model:ge(0,0,0),normalMat:xe,material:Lr},Ur={mesh:yr,model:Fr,normalMat:Mr,material:Sr},nt={mesh:Rr,model:ge(0,0,0),normalMat:xe,material:wr},ct=lt.map(n=>n.draw),ft=vr.map(n=>({mesh:n,model:ge(0,0,0),normalMat:xe,material:Dr})),$t=at?[rt,Ur,nt]:[rt,nt],Pr=[rt,nt,...ct,...ft],Nr=[...$t,...ct,...ft],G={target:[0,0,0],distance:5.4,azimuthDeg:90-Xt,elevationDeg:18,fovDeg:30},ne=Vt+Ht,Kt=[-ne,-ut,-ne],qt=[ne,ut,ne],de=He(Kt,qt),Or=Ve(Kt,qt),Br=ne*1.05,Cr=H(zt)+H(jt)+(at?H(Wt):0)+H(Yt)*lt.length,ot=Math.max(.01,G.distance/100),Ot=Math.max(ot+1,G.distance*8),Bt=1.6,Ct=140;function Ee(){let n=ke({direction:Pt,colour:[1,1,1],extent:Br},de,Or),r=Ge(G,N/O),t=Q(G);ee.shadowPass(n,Pr,St),te.bind(),R.clear(R.DEPTH_BUFFER_BIT),Er.draw({eye:t,target:G.target,fovDeg:G.fovDeg??34,aspect:N/O,sky:Nt}),ee.depthPrepass(r,Nr),wt.compute({depthTexture:te.depthTexture,near:ot,far:Ot,fovDeg:G.fovDeg??34,aspect:N/O,radius:.35,strength:1.1}),te.bind();let e={viewProj:r,eye:t,lightDir:Pt,lightColour:[6.6,6.2,5.5],sky:Nt,lightVP:n,shadow:Gt?St:null,shadowStrength:.92,ao:wt.texture,screenSize:[N,O]};ee.draw({...e,ambientGain:Bt,draws:$t}),ee.draw({...e,ambientGain:(Bt+Ct)/2,draws:ft}),ee.draw({...e,ambientGain:Ct,draws:ct});let o=Math.hypot(t[0]-de[0],t[1]-de[1],t[2]-de[2]);_t.apply({scene:te.texture,depthTexture:te.depthTexture,near:ot,far:Ot,fovDeg:G.fovDeg??34,aspect:N/O,focusDistance:o,aperture:.12,maxCoc:.006}),R.bindFramebuffer(R.FRAMEBUFFER,null),R.viewport(0,0,N,O),R.disable(R.DEPTH_TEST),R.activeTexture(R.TEXTURE0),R.bindTexture(R.TEXTURE_2D,_t.texture),_.blit(br,a=>R.uniform1i(R.getUniformLocation(a,"uScene"),0))}Ee();var j=Q(G),he=Math.hypot(j[0],j[1],j[2]),Ir=[j[0]/he,j[1]/he,j[2]/he],It=(n,r)=>n[0]*r[0]+n[1]*r[1]+n[2]*r[2],Gr=oe/he,re=lt.map(n=>({name:n.name,facing:It(n.normal,Ir)>Gr,sunlit:It(n.normal,me)>0}));function kr(n){Ee();let r=new Uint8Array(4);R.readPixels(0,0,1,1,R.RGBA,R.UNSIGNED_BYTE,r);let t=performance.now();for(let e=0;e<n;e++)Ee();return R.readPixels(0,0,1,1,R.RGBA,R.UNSIGNED_BYTE,r),(performance.now()-t)/n}var Jt=Number(Te.get("frames")??300),Qe=kr(Math.max(1,Jt)),Qt={atmosphere:at,shadow:Gt,triangles:Cr,resolution:`${N}x${O}`,dprScale:it,frames:Jt,msPerFrame:Number(Qe.toFixed(3)),fps:Math.round(1e3/Qe),headroom:Number((16.6-Qe).toFixed(3)),centralMeridian:Xt,subSolar:`${be.lat}N ${be.lon}E`,cities:re.length,citiesFacing:re.filter(n=>n.facing).length,citiesSunlit:re.filter(n=>n.sunlit).length,corridors:pe.length,corridorTriangles:tt.reduce((n,r)=>n+H(r),0),corridorPeakLift:tt.map((n,r)=>{let t=0;for(let e=0;e<n.positions.length;e+=3)t=Math.max(t,Math.hypot(n.positions[e],n.positions[e+1],n.positions[e+2]));return{to:pe[r].to,lift:Number((t-oe).toFixed(4))}}),behindLimb:re.filter(n=>!n.facing).map(n=>n.name),onNightSide:re.filter(n=>n.facing&&!n.sunlit).map(n=>n.name),renderer:(()=>{let n=R.getExtension("WEBGL_debug_renderer_info");return n?String(R.getParameter(n.UNMASKED_RENDERER_WEBGL)):"unknown"})()};globalThis.E2=Qt;kt.textContent=JSON.stringify(Qt,null,2);Ee();document.title="READY";

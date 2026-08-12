var vt={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected."};function _(n,r){return r===void 0?{kind:"refused",code:n,reason:vt[n]}:{kind:"refused",code:n,reason:vt[n],detail:r}}function _e(n){return n.kind==="stage"}function Le(n,r={}){let t=n.getContext("webgl2",{antialias:r.antialias??!1,alpha:r.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!t)return _("NO_WEBGL2");let e=t.getExtension("EXT_color_buffer_float"),o=n.width,a=n.height,i=e?t.RGBA16F:t.RGBA8,u=e?t.HALF_FLOAT:t.UNSIGNED_BYTE,c=(b,F)=>{let A=t.createTexture();t.bindTexture(t.TEXTURE_2D,A),t.texImage2D(t.TEXTURE_2D,0,i,b,F,0,t.RGBA,u,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);let v=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,v),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,A,0);let M=t.checkFramebufferStatus(t.FRAMEBUFFER);return M!==t.FRAMEBUFFER_COMPLETE?_("FRAMEBUFFER_INCOMPLETE",`status 0x${M.toString(16)} at ${b}\xD7${F}`):{texture:A,framebuffer:v,width:b,height:F}},d=r.bloomShift??2,f={w:o,h:a},s=c(o,a);if("kind"in s)return s;let m=c(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in m)return m;let h=c(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in h)return h;let l=t.createVertexArray();t.bindVertexArray(l);let p=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,p),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null);let E=[];return{kind:"stage",gl:t,cssWidth:n.clientWidth||o,cssHeight:n.clientHeight||a,hdr:!!e,get width(){return f.w},get height(){return f.h},get scene(){return s},get bloomA(){return m},get bloomB(){return h},setRegion(b,F){let A=Math.max(1,Math.round(b)),v=Math.max(1,Math.round(F));if(!(A===f.w&&v===f.h)){f={w:A,h:v};for(let M of[s,m,h])"kind"in M||(t.deleteFramebuffer(M.framebuffer),t.deleteTexture(M.texture));s=c(A,v),m=c(Math.max(1,A>>d),Math.max(1,v>>d)),h=c(Math.max(1,A>>d),Math.max(1,v>>d))}},compile(b,F){let A=(V,y)=>{let T=t.createShader(V);return t.shaderSource(T,y),t.compileShader(T),t.getShaderParameter(T,t.COMPILE_STATUS)?T:_("SHADER_COMPILE_FAILED",t.getShaderInfoLog(T)??"(no log)")},v=A(t.VERTEX_SHADER,b);if(typeof v=="object"&&"kind"in v)return v;let M=A(t.FRAGMENT_SHADER,F);if(typeof M=="object"&&"kind"in M)return M;let L=t.createProgram();return t.attachShader(L,v),t.attachShader(L,M),t.linkProgram(L),t.getProgramParameter(L,t.LINK_STATUS)?(E.push(L),L):_("PROGRAM_LINK_FAILED",t.getProgramInfoLog(L)??"(no log)")},bindTarget(b){t.bindFramebuffer(t.FRAMEBUFFER,b?b.framebuffer:null),t.viewport(0,0,b?b.width:f.w,b?b.height:f.h)},blit(b,F){t.useProgram(b),t.bindVertexArray(l),F?.(b),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null)},dispose(){for(let b of E)t.deleteProgram(b);for(let b of[s,m,h])"kind"in b||(t.deleteFramebuffer(b.framebuffer),t.deleteTexture(b.texture));t.deleteBuffer(p),t.deleteVertexArray(l)}}}var q=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function se(n,r){let t=new Float32Array(16);for(let e=0;e<4;e++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=n[i*4+o]*r[e*4+i];t[e*4+o]=a}return t}var W=(n,r)=>[n[0]-r[0],n[1]-r[1],n[2]-r[2]],ue=(n,r)=>n[0]*r[0]+n[1]*r[1]+n[2]*r[2],z=(n,r)=>[n[1]*r[2]-n[2]*r[1],n[2]*r[0]-n[0]*r[2],n[0]*r[1]-n[1]*r[0]];function C(n){let r=Math.hypot(n[0],n[1],n[2]);return r===0?n:[n[0]/r,n[1]/r,n[2]/r]}function Se(n,r,t,e){let o=1/Math.tan(n/2);return new Float32Array([o/r,0,0,0,0,o,0,0,0,0,(e+t)/(t-e),-1,0,0,2*e*t/(t-e),0])}function De(n,r,t,e,o,a){let i=r-n,u=e-t,c=a-o;return new Float32Array([2/i,0,0,0,0,2/u,0,0,0,0,-2/c,0,-(r+n)/i,-(e+t)/u,-(a+o)/c,1])}function le(n,r,t){let e=C(W(n,r)),o=z(t,e);if(Math.hypot(o[0],o[1],o[2])<1e-8)return q();let a=C(o),i=z(e,a);return new Float32Array([a[0],i[0],e[0],0,a[1],i[1],e[1],0,a[2],i[2],e[2],0,-ue(a,n),-ue(i,n),-ue(e,n),1])}function Mt(n){return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4)}function we(n){return n<=.0031308?n*12.92:1.055*Math.pow(n,1/2.4)-.055}var lr=/^#?([0-9a-fA-F]{6})$/;function I(n){let r=lr.exec(n.trim());if(!r)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(n)}`);let t=r[1];return[0,2,4].map(e=>Mt(parseInt(t.slice(e,e+2),16)/255))}function Ue(n){return`#${n.map(t=>{let e=we(Math.min(1,Math.max(0,t)));return Math.round(e*255).toString(16).padStart(2,"0")}).join("")}`}var j={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},Pe=Object.freeze(Object.fromEntries(Object.keys(j).map(n=>[n,I(j[n])])));var _t=.4;var Ne=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${_t.toFixed(2)}); }`,Be=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function Oe(){let n=[];for(let r of Object.keys(j)){let t=j[r].toLowerCase(),e=Ue(Pe[r]).toLowerCase();e!==t&&n.push({key:r,expected:t,actual:e})}return n}function cr(n){let r=[1/0,1/0,1/0],t=[-1/0,-1/0,-1/0];for(let e=0;e<n.length;e+=3)for(let o=0;o<3;o++){let a=n[e+o];a<r[o]&&(r[o]=a),a>t[o]&&(t[o]=a)}return n.length===0?{min:[0,0,0],max:[0,0,0]}:{min:r,max:t}}function Lt(n,r,t,e){let o=new Float32Array(n.length);for(let i=0;i<e.length;i+=3){let u=e[i],c=e[i+1],d=e[i+2],f=u*3,s=c*3,m=d*3,h=u*2,l=c*2,p=d*2,E=n[s]-n[f],x=n[s+1]-n[f+1],b=n[s+2]-n[f+2],F=n[m]-n[f],A=n[m+1]-n[f+1],v=n[m+2]-n[f+2],M=t[l]-t[h],L=t[l+1]-t[h+1],V=t[p]-t[h],y=t[p+1]-t[h+1],T=M*y-V*L;if(Math.abs(T)<1e-12)continue;let g=1/T,w=(E*y-F*L)*g,O=(x*y-A*L)*g,P=(b*y-v*L)*g;for(let S of[f,s,m])o[S]=o[S]+w,o[S+1]=o[S+1]+O,o[S+2]=o[S+2]+P}let a=new Float32Array(n.length);for(let i=0;i<a.length;i+=3){let u=r[i],c=r[i+1],d=r[i+2],f=o[i],s=o[i+1],m=o[i+2],h=f*u+s*c+m*d;f-=u*h,s-=c*h,m-=d*h;let l=Math.hypot(f,s,m);l<1e-8&&(Math.abs(u)<.9?(f=0,s=-d,m=c):(f=-d,s=0,m=u),l=Math.hypot(f,s,m)||1),a[i]=f/l,a[i+1]=s/l,a[i+2]=m/l}return a}function St(n,r){let t=new Float32Array(n.length);for(let e=0;e<r.length;e+=3){let o=r[e]*3,a=r[e+1]*3,i=r[e+2]*3,u=n[a]-n[o],c=n[a+1]-n[o+1],d=n[a+2]-n[o+2],f=n[i]-n[o],s=n[i+1]-n[o+1],m=n[i+2]-n[o+2],h=c*m-d*s,l=d*f-u*m,p=u*s-c*f;for(let E of[o,a,i])t[E]=t[E]+h,t[E+1]=t[E+1]+l,t[E+2]=t[E+2]+p}for(let e=0;e<t.length;e+=3){let o=Math.hypot(t[e],t[e+1],t[e+2]);o>0&&(t[e]=t[e]/o,t[e+1]=t[e+1]/o,t[e+2]=t[e+2]/o)}return t}function Ie(n,r,t,e,o){let{min:a,max:i}=cr(n),u=e??St(n,t);return{positions:n,normals:u,uvs:r,indices:t,min:a,max:i,tangents:o??Lt(n,u,r,t)}}function J(n=.5,r=24,t=32){let e=Math.max(2,r),o=Math.max(3,t),a=(e+1)*(o+1),i=new Float32Array(a*3),u=new Float32Array(a*3),c=new Float32Array(a*2),d=new Uint16Array(e*o*6),f=0,s=0,m=0;for(let h=0;h<=e;h++){let l=h/e*Math.PI;for(let p=0;p<=o;p++){let E=p/o*Math.PI*2,x=Math.sin(l)*Math.cos(E),b=Math.cos(l),F=Math.sin(l)*Math.sin(E);i[f]=x*n,i[f+1]=b*n,i[f+2]=F*n,u[f]=x,u[f+1]=b,u[f+2]=F,f+=3,c[s++]=p/o,c[s++]=h/e}}for(let h=0;h<e;h++)for(let l=0;l<o;l++){let p=h*(o+1)+l,E=p+1,x=p+(o+1),b=x+1;d[m++]=p,d[m++]=E,d[m++]=x,d[m++]=E,d[m++]=b,d[m++]=x}return Ie(i,c,d,u)}function Ge(n=.5,r=.08,t=64,e=24){let o=Math.max(3,t),a=Math.max(3,e),i=[],u=[],c=[],d=[],f=[];for(let s=0;s<=o;s++){let m=s/o*Math.PI*2,h=Math.cos(m),l=Math.sin(m);for(let p=0;p<=a;p++){let E=p/a*Math.PI*2,x=Math.cos(E),b=Math.sin(E);i.push((n+r*x)*h,r*b,(n+r*x)*l),u.push(h*x,b,l*x),c.push(s/o,p/a),f.push(-l,0,h)}}for(let s=0;s<o;s++)for(let m=0;m<a;m++){let h=s*(a+1)+m,l=h+1,p=h+(a+1),E=p+1;d.push(h,l,p,l,E,p)}return Ie(new Float32Array(i),new Float32Array(c),new Uint16Array(d),new Float32Array(u),new Float32Array(f))}function Ce(n,r){let t=n*Math.PI/180,e=r*Math.PI/180,o=Math.cos(t);return[o*Math.cos(e),Math.sin(t),o*Math.sin(e)]}function Ve(n,r,t,e,o=1,a=.012,i=.22,u=96,c=8){let d=Math.max(8,u),f=Math.max(3,c),s=Ce(n,r),m=Ce(t,e),h=Math.max(-1,Math.min(1,s[0]*m[0]+s[1]*m[1]+s[2]*m[2])),l=Math.acos(h),p=l<1e-4||Math.abs(Math.PI-l)<1e-4,E=Math.sin(l),x=i*o*(l/Math.PI),b=[],F=[],A=[],v=[],M=[],L=y=>{if(p)return[s[0]+(m[0]-s[0])*y,s[1]+(m[1]-s[1])*y,s[2]+(m[2]-s[2])*y];let T=Math.sin((1-y)*l)/E,g=Math.sin(y*l)/E;return[s[0]*T+m[0]*g,s[1]*T+m[1]*g,s[2]*T+m[2]*g]},V=y=>{let T=L(y),g=Math.hypot(T[0],T[1],T[2])||1,w=o+x*Math.sin(Math.PI*y);return[T[0]/g*w,T[1]/g*w,T[2]/g*w]};for(let y=0;y<=d;y++){let T=y/d,g=V(T),w=V(Math.min(1,T+1/d)),O=V(Math.max(0,T-1/d)),P=w[0]-O[0],S=w[1]-O[1],k=w[2]-O[2],Re=Math.hypot(P,S,k)||1;P/=Re,S/=Re,k/=Re;let Ae=Math.hypot(g[0],g[1],g[2])||1,Tt=g[0]/Ae,gt=g[1]/Ae,xt=g[2]/Ae,$=S*xt-k*gt,K=k*Tt-P*xt,Q=P*gt-S*Tt,Fe=Math.hypot($,K,Q)||1;$/=Fe,K/=Fe,Q/=Fe;let ir=K*k-Q*S,ur=Q*P-$*k,sr=$*S-K*P;for(let ie=0;ie<=f;ie++){let yt=ie/f*Math.PI*2,ve=Math.cos(yt),Me=Math.sin(yt),Rt=$*ve+ir*Me,At=K*ve+ur*Me,Ft=Q*ve+sr*Me;b.push(g[0]+Rt*a,g[1]+At*a,g[2]+Ft*a),F.push(Rt,At,Ft),A.push(T,ie/f),v.push(P,S,k)}}for(let y=0;y<d;y++)for(let T=0;T<f;T++){let g=y*(f+1)+T,w=g+1,O=g+(f+1),P=O+1;M.push(g,O,w,w,O,P)}return Ie(new Float32Array(b),new Float32Array(A),b.length/3>65535?new Uint32Array(M):new Uint16Array(M),new Float32Array(F),new Float32Array(v))}function H(n){return n.indices.length/3}var ke=89,He=Math.PI/180;function Z(n){let r=Math.max(-ke,Math.min(ke,n.elevationDeg))*He,t=n.azimuthDeg*He,e=Math.max(1e-4,n.distance),o=Math.sin(r)*e,a=Math.cos(r)*e;return[n.target[0]+Math.sin(t)*a,n.target[1]+o,n.target[2]+Math.cos(t)*a]}function Xe(n,r){let t=Z(n),e=n.near??Math.max(.01,n.distance/100),o=n.far??Math.max(e+1,n.distance*8),a=Se((n.fovDeg??38)*He,Math.max(.001,r),e,o),i=le(t,n.target,[0,1,0]);return se(a,i)}function ze(n,r,t){let e=C(n.direction),o=n.extent??Math.max(.1,t*1.35),a=Math.max(1,t*2),i=[r[0]-e[0]*a,r[1]-e[1]*a,r[2]-e[2]*a],u=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],c=le(i,r,u),d=De(-o,o,-o,o,.01,a+t*2+o);return se(d,c)}function We(n,r){let t=W([r[0],r[1],r[2]],[n[0],n[1],n[2]]);return Math.hypot(t[0],t[1],t[2])/2}function je(n,r){return[(n[0]+r[0])/2,(n[1]+r[1])/2,(n[2]+r[2])/2]}function Ye(n,r,t){let{gl:e}=n,o=Math.max(1,Math.floor(r)),a=Math.max(1,Math.floor(t)),i=e.createFramebuffer(),u=e.createTexture(),c=e.createTexture();if(!i||!u||!c)return _("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let d=n.hdr?e.RGBA16F:e.RGBA8,f=n.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,s=()=>{e.bindTexture(e.TEXTURE_2D,u),e.texImage2D(e.TEXTURE_2D,0,d,o,a,0,e.RGBA,f,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,c),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,o,a,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,u,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,c,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};s(),e.bindFramebuffer(e.FRAMEBUFFER,i);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE?_("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${m.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:u,depthTexture:c,get width(){return o},get height(){return a},bind(){e.bindFramebuffer(e.FRAMEBUFFER,i),e.viewport(0,0,o,a)},resize(h,l){let p=Math.max(1,Math.floor(h)),E=Math.max(1,Math.floor(l));p===o&&E===a||(o=p,a=E,s())},dispose(){e.deleteFramebuffer(i),e.deleteTexture(u),e.deleteTexture(c)}}}function $e(n,r=1024){let{gl:t}=n,e=Math.max(256,Math.min(2048,Math.floor(r))),o=t.createFramebuffer(),a=t.createTexture();if(!o||!a)return _("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");t.bindTexture(t.TEXTURE_2D,a),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,e,e,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,o),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,a,0);let i=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),i!==t.FRAMEBUFFER_COMPLETE?_("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:e,bind(){t.bindFramebuffer(t.FRAMEBUFFER,o),t.viewport(0,0,e,e)},dispose(){t.deleteFramebuffer(o),t.deleteTexture(a)}}}var fe=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,ce={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function me(n,r,t={}){let e=t.zenith??ce.zenith,o=t.horizon??ce.horizon,a=t.ground??ce.ground;n.uniform3f(n.getUniformLocation(r,"uSkyZenith"),e[0],e[1],e[2]),n.uniform3f(n.getUniformLocation(r,"uSkyHorizon"),o[0],o[1],o[2]),n.uniform3f(n.getUniformLocation(r,"uSkyGround"),a[0],a[1],a[2])}var fr=`#version 300 es
precision highp float;
out vec2 vNdc;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`,mr=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${fe}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;function Ke(n){let{gl:r}=n,t=n.compile(fr,mr);return"kind"in t?t:{draw(e){let o=C(W(e.target,e.eye)),a=Math.abs(o[1])>.999?[0,0,1]:[0,1,0],i=C(z(o,a)),u=C(z(i,o));r.disable(r.DEPTH_TEST),r.depthMask(!1),r.disable(r.BLEND),r.useProgram(t),r.uniform3f(r.getUniformLocation(t,"uRight"),i[0],i[1],i[2]),r.uniform3f(r.getUniformLocation(t,"uUp"),u[0],u[1],u[2]),r.uniform3f(r.getUniformLocation(t,"uForward"),o[0],o[1],o[2]),r.uniform1f(r.getUniformLocation(t,"uTanHalfFov"),Math.tan(e.fovDeg*Math.PI/360)),r.uniform1f(r.getUniformLocation(t,"uAspect"),Math.max(.001,e.aspect)),me(r,t,e.sky),n.blit(t),r.depthMask(!0),r.enable(r.DEPTH_TEST)},dispose(){r.deleteProgram(t)}}}var Dt=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,Qe=`#version 300 es
precision highp float;
void main(){}`,dr=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,wt=`#version 300 es
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
}`,Ut=`#version 300 es
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
${fe}

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
}`;function X(n,r){let{gl:t}=n,e=t.createVertexArray(),o=t.createBuffer(),a=t.createBuffer(),i=t.createBuffer(),u=t.createBuffer();return!e||!o||!a||!i||!u?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(t.bindVertexArray(e),t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,r.positions,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,a),t.bufferData(t.ARRAY_BUFFER,r.normals,t.STATIC_DRAW),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,i),t.bufferData(t.ARRAY_BUFFER,r.tangents,t.STATIC_DRAW),t.enableVertexAttribArray(2),t.vertexAttribPointer(2,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,u),t.bufferData(t.ELEMENT_ARRAY_BUFFER,r.indices,t.STATIC_DRAW),t.bindVertexArray(null),{vao:e,indexCount:r.indices.length,indexType:r.indices instanceof Uint32Array?t.UNSIGNED_INT:t.UNSIGNED_SHORT,dispose(){t.deleteVertexArray(e),t.deleteBuffer(o),t.deleteBuffer(a),t.deleteBuffer(i),t.deleteBuffer(u)}})}function qe(n){let{gl:r}=n,t=n.compile(Dt,Qe);if("kind"in t)return t;let e=n.compile(wt,Ut);if("kind"in e)return e;let o=n.compile(dr,Qe);if("kind"in o)return o;let a=(i,u)=>r.getUniformLocation(i,u);return{shadowPass(i,u,c,d){let f=d??(()=>{});c.bind(),f("shadow.bind"),r.clear(r.DEPTH_BUFFER_BIT),r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.FRONT),r.useProgram(t),f("useProgram(shadow)"),r.uniformMatrix4fv(a(t,"uLightVP"),!1,i),f("uLightVP");for(let s of u)r.uniformMatrix4fv(a(t,"uModel"),!1,s.model),f("shadow uModel"),r.bindVertexArray(s.mesh.vao),f("shadow bindVAO"),r.drawElements(r.TRIANGLES,s.mesh.indexCount,s.mesh.indexType,0),f("shadow drawElements");r.bindVertexArray(null),r.cullFace(r.BACK)},depthPrepass(i,u){r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.colorMask(!1,!1,!1,!1),r.useProgram(o),r.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let c of u)r.uniformMatrix4fv(a(o,"uModel"),!1,c.model),r.bindVertexArray(c.mesh.vao),r.drawElements(r.TRIANGLES,c.mesh.indexCount,c.mesh.indexType,0);r.bindVertexArray(null),r.colorMask(!0,!0,!0,!0)},draw(i){let u=i.onStep??(()=>{});if(r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.useProgram(e),r.uniformMatrix4fv(a(e,"uViewProj"),!1,i.viewProj),u("uViewProj"),r.uniform3fv(a(e,"uEye"),i.eye),u("uEye"),r.uniform3fv(a(e,"uLightDir"),i.lightDir),u("uLightDir"),r.uniform3fv(a(e,"uLightColour"),i.lightColour),u("uLightColour"),r.uniform1f(a(e,"uAmbientGain"),i.ambientGain??1),u("uAmbientGain"),i.fog&&i.fog.density>0){r.uniform1f(a(e,"uFogDensity"),i.fog.density),r.uniform1f(a(e,"uFogHeight"),i.fog.height),r.uniform1f(a(e,"uFogFloor"),i.fog.floor??0);let c=i.fog.colour;c==="sky"?r.uniform3f(a(e,"uFogColour"),-1,-1,-1):r.uniform3f(a(e,"uFogColour"),c[0],c[1],c[2]),u("fog")}else r.uniform1f(a(e,"uFogDensity"),0);me(r,e,i.sky),u("bindSky"),i.ao&&i.screenSize?(r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,i.ao),r.uniform1i(a(e,"uAO"),1),r.uniform2f(a(e,"uScreenSize"),i.screenSize[0],i.screenSize[1]),r.uniform1f(a(e,"uAOEnabled"),1)):r.uniform1f(a(e,"uAOEnabled"),0),u("bindAO"),r.uniformMatrix4fv(a(e,"uLightVP"),!1,i.lightVP),u("lit uLightVP"),i.shadow?(r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,i.shadow.depthTexture),r.uniform1i(a(e,"uShadowMap"),0),r.uniform1f(a(e,"uShadowTexel"),1/i.shadow.size),r.uniform1f(a(e,"uShadowStrength"),i.shadowStrength??1)):r.uniform1f(a(e,"uShadowStrength"),0);for(let c of i.draws)r.uniformMatrix4fv(a(e,"uModel"),!1,c.model),r.uniformMatrix3fv(a(e,"uNormalMat"),!1,c.normalMat),u("uNormalMat"),r.uniform3fv(a(e,"uBaseColour"),c.material.baseColour),u("uBaseColour"),r.uniform1f(a(e,"uRoughness"),c.material.roughness),r.uniform1f(a(e,"uMetalness"),c.material.metalness),r.uniform1f(a(e,"uAnisotropy"),c.material.anisotropy??0),r.bindVertexArray(c.mesh.vao),u("lit bindVAO"),r.drawElements(r.TRIANGLES,c.mesh.indexCount,c.mesh.indexType,0),u("lit drawElements");r.bindVertexArray(null),r.disable(r.CULL_FACE)},dispose(){r.deleteProgram(t),r.deleteProgram(e),r.deleteProgram(o)}}}var ee=`
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
}`,Pt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,hr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${ee}

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
}`,pr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${ee}

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
}`;function Je(n,r,t){let{gl:e}=n,o=n.compile(Pt,hr);if("kind"in o)return o;let a=n.compile(Pt,pr);if("kind"in a)return a;let i=Math.max(1,r>>1),u=Math.max(1,t>>1),c=()=>{let l=e.createFramebuffer(),p=e.createTexture();return!l||!p?null:{fb:l,tex:p}},d=c(),f=c();if(!d||!f)return _("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let s=()=>{for(let l of[d,f])e.bindTexture(e.TEXTURE_2D,l.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,i,u,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,l.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,l.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};s(),e.bindFramebuffer(e.FRAMEBUFFER,d.fb);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE)return _("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${m.toString(16)}).`);let h=(l,p,E,x,b,F,A)=>{e.activeTexture(e.TEXTURE0+A),e.bindTexture(e.TEXTURE_2D,p),e.uniform1i(e.getUniformLocation(l,"uDepth"),A),e.uniform2f(e.getUniformLocation(l,"uNearFar"),E,x),e.uniform1f(e.getUniformLocation(l,"uTanHalfFov"),Math.tan(b*Math.PI/360)),e.uniform1f(e.getUniformLocation(l,"uAspect"),F)};return{get texture(){return d.tex},get width(){return i},get height(){return u},compute(l){e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,d.fb),e.viewport(0,0,i,u),e.useProgram(o),h(o,l.depthTexture,l.near,l.far,l.fovDeg,l.aspect,0),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/i,1/u),e.uniform1f(e.getUniformLocation(o,"uRadius"),l.radius??.55),e.uniform1f(e.getUniformLocation(o,"uStrength"),l.strength??1.15),e.uniform1f(e.getUniformLocation(o,"uBias"),l.bias??.035),n.blit(o);for(let[p,E,x]of[[d,f,[1,0]],[f,d,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,E.fb),e.viewport(0,0,i,u),e.useProgram(a),h(a,l.depthTexture,l.near,l.far,l.fovDeg,l.aspect,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,p.tex),e.uniform1i(e.getUniformLocation(a,"uAO"),1),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/i,1/u),e.uniform2f(e.getUniformLocation(a,"uDir"),x[0],x[1]),n.blit(a);e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(l,p){let E=Math.max(1,l>>1),x=Math.max(1,p>>1);E===i&&x===u||(i=E,u=x,s())},dispose(){e.deleteProgram(o),e.deleteProgram(a);for(let l of[d,f])e.deleteFramebuffer(l.fb),e.deleteTexture(l.tex)}}}var br=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Er=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uFocusDistance;
uniform float uAperture;
uniform float uMaxCoc;
out vec4 frag;
${ee}

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
}`;function Ze(n,r,t){let{gl:e}=n,o=n.compile(br,Er);if("kind"in o)return o;let a=Math.max(1,Math.floor(r)),i=Math.max(1,Math.floor(t)),u=e.createFramebuffer(),c=e.createTexture();if(!u||!c)return _("FRAMEBUFFER_INCOMPLETE","The GPU refused a depth-of-field buffer.");let d=()=>{e.bindTexture(e.TEXTURE_2D,c);let s=n.hdr?e.RGBA16F:e.RGBA8,m=n.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE;e.texImage2D(e.TEXTURE_2D,0,s,a,i,0,e.RGBA,m,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,u),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,c,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};d(),e.bindFramebuffer(e.FRAMEBUFFER,u);let f=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),f!==e.FRAMEBUFFER_COMPLETE?_("FRAMEBUFFER_INCOMPLETE",`The DOF buffer is incomplete (0x${f.toString(16)}).`):{texture:c,apply(s){e.bindFramebuffer(e.FRAMEBUFFER,u),e.viewport(0,0,a,i),e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.useProgram(o),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,s.scene),e.uniform1i(e.getUniformLocation(o,"uScene"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,s.depthTexture),e.uniform1i(e.getUniformLocation(o,"uDepth"),1),e.uniform2f(e.getUniformLocation(o,"uNearFar"),s.near,s.far),e.uniform1f(e.getUniformLocation(o,"uTanHalfFov"),Math.tan(s.fovDeg*Math.PI/360)),e.uniform1f(e.getUniformLocation(o,"uAspect"),s.aspect),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/a,1/i),e.uniform1f(e.getUniformLocation(o,"uFocusDistance"),s.focusDistance),e.uniform1f(e.getUniformLocation(o,"uAperture"),s.aperture??12),e.uniform1f(e.getUniformLocation(o,"uMaxCoc"),s.maxCoc??.012),n.blit(o),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(s,m){let h=Math.max(1,Math.floor(s)),l=Math.max(1,Math.floor(m));h===a&&l===i||(a=h,i=l,d())},dispose(){e.deleteProgram(o),e.deleteFramebuffer(u),e.deleteTexture(c)}}}var ge=new URLSearchParams(location.search),ft=ge.get("atmos")!=="0",Wt=ge.get("shadow")!=="0",mt=Math.max(1,Math.min(3,Number(ge.get("scale")??1))),N=1200*mt,B=720*mt,dt=document.getElementById("c");dt.width=N;dt.height=B;var ot=Le(dt,{alpha:!1});if(!_e(ot))throw document.title="REFUSED",new Error(ot.reason);var D=ot,R=D.gl,Tr=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,gr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${Ne}
${Be}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,jt=document.getElementById("log"),xr=n=>`${n.reason} ${n.detail??""}`;function yr(n){throw document.title="REFUSED",jt.textContent=n,new Error(n)}function U(n,r){return"kind"in r&&yr(`${n}: ${xr(r)}`),r}var Rr=U("present",D.compile(Tr,gr)),te=U("lit",qe(D)),re=U("target",Ye(D,N,B)),Nt=U("shadow",$e(D,1024)),Ar=U("sky",Ke(D)),Bt=U("ao",Je(D,N,B)),Ot=U("dof",Ze(D,N,B)),Ct=Math.PI/180,ae=1,ht=1.06,Yt=1.38,$t=.026,Fr=.034;function at(n,r,t){let e=n*Ct,o=r*Ct;return[t*Math.cos(e)*Math.cos(o),t*Math.sin(e),t*Math.cos(e)*Math.sin(o)]}var vr=[{name:"London",lat:51.51,lon:-.13},{name:"Vaduz",lat:47.14,lon:9.52},{name:"Istanbul",lat:41.01,lon:28.98},{name:"Dubai",lat:25.2,lon:55.27},{name:"Mumbai",lat:19.08,lon:72.88},{name:"Lagos",lat:6.52,lon:3.38},{name:"Nairobi",lat:-1.29,lon:36.82},{name:"Johannesburg",lat:-26.2,lon:28.04},{name:"New York",lat:40.71,lon:-74.01},{name:"Chicago",lat:41.88,lon:-87.63},{name:"Singapore",lat:1.35,lon:103.82},{name:"Tokyo",lat:35.68,lon:139.65}],It={lat:47.14,lon:9.52},be=[{to:"London",lat:51.51,lon:-.13},{to:"New York",lat:40.71,lon:-74.01},{to:"Chicago",lat:41.88,lon:-87.63},{to:"Dubai",lat:25.2,lon:55.27},{to:"Singapore",lat:1.35,lon:103.82},{to:"Tokyo",lat:35.68,lon:139.65},{to:"Johannesburg",lat:-26.2,lon:28.04}],Ee={lat:18,lon:60},Kt=-15,he=at(Ee.lat,Ee.lon,1),Gt=[-he[0],-he[1],-he[2]],Qt=J(ae,64,96),qt=J(ht,56,84),Jt=Ge(Yt,$t,168,20),Zt=J(Fr,14,20),Mr=U("earth mesh",X(D,Qt)),_r=U("atmosphere mesh",X(D,qt)),Lr=U("ring mesh",X(D,Jt)),Sr=U("city mesh",X(D,Zt)),it=be.map(n=>Ve(It.lat,It.lon,n.lat,n.lon,ae,.016,.2,128,12)),Dr=it.map((n,r)=>U(`corridor ${be[r].to}`,X(D,n))),xe=(n,r,t)=>{let e=q();return e[12]=n,e[13]=r,e[14]=t,e},ye=new Float32Array([1,0,0,0,1,0,0,0,1]),wr=(()=>{let n=q();return n[0]=-1,n})(),Ur=new Float32Array([-1,0,0,0,1,0,0,0,1]),et=I("#0E1628"),tt=n=>[et[0]*n,et[1]*n,et[2]*n],Vt={zenith:tt(.55),horizon:tt(1.6),ground:tt(.35)},Pr={baseColour:I("#0B2B5C"),roughness:.58,metalness:.06},Nr={baseColour:I("#7FB2FF"),roughness:.86,metalness:0},Br={baseColour:I("#8FA3C4"),roughness:.14,metalness:.95,anisotropy:.8},Or={baseColour:I("#2C6BFF"),roughness:.5,metalness:0},Cr={baseColour:I("#4C86FF"),roughness:.22,metalness:.85,anisotropy:.85},pt=vr.map(n=>{let r=at(n.lat,n.lon,1),t=at(n.lat,n.lon,ae);return{...n,normal:r,draw:{mesh:Sr,model:xe(t[0],t[1],t[2]),normalMat:ye,material:Or}}}),ut={mesh:Mr,model:xe(0,0,0),normalMat:ye,material:Pr},Ir={mesh:_r,model:wr,normalMat:Ur,material:Nr},st={mesh:Lr,model:xe(0,0,0),normalMat:ye,material:Br},bt=pt.map(n=>n.draw),Et=Dr.map(n=>({mesh:n,model:xe(0,0,0),normalMat:ye,material:Cr})),er=ft?[ut,Ir,st]:[ut,st],Gr=[ut,st,...bt,...Et],Vr=[...er,...bt,...Et],G={target:[0,0,0],distance:5.4,azimuthDeg:90-Kt,elevationDeg:18,fovDeg:30},oe=Yt+$t,tr=[-oe,-ht,-oe],rr=[oe,ht,oe],de=je(tr,rr),kr=We(tr,rr),Hr=oe*1.05,Xr=H(Qt)+H(Jt)+(ft?H(qt):0)+H(Zt)*pt.length,lt=Math.max(.01,G.distance/100),kt=Math.max(lt+1,G.distance*8),Ht=1.6,Xt=140;function Te(){let n=ze({direction:Gt,colour:[1,1,1],extent:Hr},de,kr),r=Xe(G,N/B),t=Z(G);te.shadowPass(n,Gr,Nt),re.bind(),R.clear(R.DEPTH_BUFFER_BIT),Ar.draw({eye:t,target:G.target,fovDeg:G.fovDeg??34,aspect:N/B,sky:Vt}),te.depthPrepass(r,Vr),Bt.compute({depthTexture:re.depthTexture,near:lt,far:kt,fovDeg:G.fovDeg??34,aspect:N/B,radius:.35,strength:1.1}),re.bind();let e={viewProj:r,eye:t,lightDir:Gt,lightColour:[6.6,6.2,5.5],sky:Vt,lightVP:n,shadow:Wt?Nt:null,shadowStrength:.92,ao:Bt.texture,screenSize:[N,B]};te.draw({...e,ambientGain:Ht,draws:er}),te.draw({...e,ambientGain:(Ht+Xt)/2,draws:Et}),te.draw({...e,ambientGain:Xt,draws:bt});let o=Math.hypot(t[0]-de[0],t[1]-de[1],t[2]-de[2]);Ot.apply({scene:re.texture,depthTexture:re.depthTexture,near:lt,far:kt,fovDeg:G.fovDeg??34,aspect:N/B,focusDistance:o,aperture:.12,maxCoc:.006}),R.bindFramebuffer(R.FRAMEBUFFER,null),R.viewport(0,0,N,B),R.disable(R.DEPTH_TEST),R.activeTexture(R.TEXTURE0),R.bindTexture(R.TEXTURE_2D,Ot.texture),D.blit(Rr,a=>R.uniform1i(R.getUniformLocation(a,"uScene"),0))}Te();var Y=Z(G),pe=Math.hypot(Y[0],Y[1],Y[2]),zr=[Y[0]/pe,Y[1]/pe,Y[2]/pe],zt=(n,r)=>n[0]*r[0]+n[1]*r[1]+n[2]*r[2],Wr=ae/pe,ne=pt.map(n=>({name:n.name,facing:zt(n.normal,zr)>Wr,sunlit:zt(n.normal,he)>0}));function jr(n){Te();let r=new Uint8Array(4);R.readPixels(0,0,1,1,R.RGBA,R.UNSIGNED_BYTE,r);let t=performance.now();for(let e=0;e<n;e++)Te();return R.readPixels(0,0,1,1,R.RGBA,R.UNSIGNED_BYTE,r),(performance.now()-t)/n}var nr=Number(ge.get("frames")??300),rt=jr(Math.max(1,nr)),ct=Oe();if(ct.length>0){let n="BRAND FIDELITY FAILED \u2014 "+ct.map(t=>`${t.key}: expected ${t.expected}, got ${t.actual}`).join("; ");document.title="REFUSED";let r=document.getElementById("log");throw r&&(r.textContent=n),new Error(n)}var or=(()=>{let n=R.getExtension("WEBGL_debug_renderer_info");return n?String(R.getParameter(n.UNMASKED_RENDERER_WEBGL)):"unknown"})(),nt=/swiftshader|llvmpipe|software/i.test(or),ar={brandFidelity:ct,atmosphere:ft,shadow:Wt,triangles:Xr,resolution:`${N}x${B}`,dprScale:mt,frames:nr,msPerFrame:Number(rt.toFixed(3)),fps:Math.round(1e3/rt),centralMeridian:Kt,subSolar:`${Ee.lat}N ${Ee.lon}E`,cities:ne.length,citiesFacing:ne.filter(n=>n.facing).length,citiesSunlit:ne.filter(n=>n.sunlit).length,corridors:be.length,corridorTriangles:it.reduce((n,r)=>n+H(r),0),corridorPeakLift:it.map((n,r)=>{let t=0;for(let e=0;e<n.positions.length;e+=3)t=Math.max(t,Math.hypot(n.positions[e],n.positions[e+1],n.positions[e+2]));return{to:be[r].to,lift:Number((t-ae).toFixed(4))}}),behindLimb:ne.filter(n=>!n.facing).map(n=>n.name),onNightSide:ne.filter(n=>n.facing&&!n.sunlit).map(n=>n.name),renderer:or,rendererClass:nt?"software":"hardware",headroom:nt?null:Number((16.6-rt).toFixed(3)),headroomRefusal:nt?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null};globalThis.E2=ar;jt.textContent=JSON.stringify(ar,null,2);Te();document.title="READY";

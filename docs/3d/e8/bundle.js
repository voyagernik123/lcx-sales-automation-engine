var nt={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected.",FEEDBACK_LOOP:"A layer of this view was asked to read the surface it draws into, which every driver refuses, so the layer is not being drawn. This is a defect in the renderer, not in the data."};function A(n,r){return r===void 0?{kind:"refused",code:n,reason:nt[n]}:{kind:"refused",code:n,reason:nt[n],detail:r}}function he(n){return n.kind==="stage"}function pe(n,r={}){let t=n.getContext("webgl2",{antialias:r.antialias??!1,alpha:r.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!t)return A("NO_WEBGL2");let e=t.getExtension("EXT_color_buffer_float"),o=n.width,a=n.height,i=e?t.RGBA16F:t.RGBA8,s=e?t.HALF_FLOAT:t.UNSIGNED_BYTE,l=(E,T)=>{let F=t.createTexture();t.bindTexture(t.TEXTURE_2D,F),t.texImage2D(t.TEXTURE_2D,0,i,E,T,0,t.RGBA,s,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);let y=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,y),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,F,0);let R=t.checkFramebufferStatus(t.FRAMEBUFFER);return R!==t.FRAMEBUFFER_COMPLETE?A("FRAMEBUFFER_INCOMPLETE",`status 0x${R.toString(16)} at ${E}\xD7${T}`):{texture:F,framebuffer:y,width:E,height:T}},c=r.bloomShift??2,d={w:o,h:a},u=l(o,a);if("kind"in u)return u;let f=l(Math.max(1,o>>c),Math.max(1,a>>c));if("kind"in f)return f;let h=l(Math.max(1,o>>c),Math.max(1,a>>c));if("kind"in h)return h;let p=t.createVertexArray();t.bindVertexArray(p);let m=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,m),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null);let b=[];return{kind:"stage",gl:t,cssWidth:n.clientWidth||o,cssHeight:n.clientHeight||a,hdr:!!e,get width(){return d.w},get height(){return d.h},get scene(){return u},get bloomA(){return f},get bloomB(){return h},setRegion(E,T){let F=Math.max(1,Math.round(E)),y=Math.max(1,Math.round(T));if(!(F===d.w&&y===d.h)){d={w:F,h:y};for(let R of[u,f,h])"kind"in R||(t.deleteFramebuffer(R.framebuffer),t.deleteTexture(R.texture));u=l(F,y),f=l(Math.max(1,F>>c),Math.max(1,y>>c)),h=l(Math.max(1,F>>c),Math.max(1,y>>c))}},compile(E,T){let F=(W,k)=>{let D=t.createShader(W);if(t.shaderSource(D,k),t.compileShader(D),!t.getShaderParameter(D,t.COMPILE_STATUS)){let j=t.getShaderInfoLog(D)??"(no log)";return t.deleteShader(D),A("SHADER_COMPILE_FAILED",j)}return D},y=F(t.VERTEX_SHADER,E);if(typeof y=="object"&&"kind"in y)return y;let R=F(t.FRAGMENT_SHADER,T);if(typeof R=="object"&&"kind"in R)return t.deleteShader(y),R;let v=t.createProgram();if(t.attachShader(v,y),t.attachShader(v,R),t.linkProgram(v),!t.getProgramParameter(v,t.LINK_STATUS)){let W=t.getProgramInfoLog(v)??"(no log)";return t.deleteShader(y),t.deleteShader(R),t.deleteProgram(v),A("PROGRAM_LINK_FAILED",W)}return t.detachShader(v,y),t.detachShader(v,R),t.deleteShader(y),t.deleteShader(R),b.push(v),v},bindTarget(E){t.bindFramebuffer(t.FRAMEBUFFER,E?E.framebuffer:null),t.viewport(0,0,E?E.width:d.w,E?E.height:d.h)},blit(E,T){t.useProgram(E),t.bindVertexArray(p),T?.(E),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null)},dispose(){for(let T of b)t.deleteProgram(T);for(let T of[u,f,h])"kind"in T||(t.deleteFramebuffer(T.framebuffer),t.deleteTexture(T.texture));if(t.deleteBuffer(m),t.deleteVertexArray(p),n.isConnected)return;let E=t.getExtension("WEBGL_lose_context");E!==null&&typeof E.loseContext=="function"&&E.loseContext()}}}var J=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function Z(n,r){let t=new Float32Array(16);for(let e=0;e<4;e++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=n[i*4+o]*r[e*4+i];t[e*4+o]=a}return t}var V=(n,r)=>[n[0]-r[0],n[1]-r[1],n[2]-r[2]],q=(n,r)=>n[0]*r[0]+n[1]*r[1]+n[2]*r[2],G=(n,r)=>[n[1]*r[2]-n[2]*r[1],n[2]*r[0]-n[0]*r[2],n[0]*r[1]-n[1]*r[0]];function P(n){let r=Math.hypot(n[0],n[1],n[2]);return r===0?n:[n[0]/r,n[1]/r,n[2]/r]}function be(n,r,t,e){let o=1/Math.tan(n/2);return new Float32Array([o/r,0,0,0,0,o,0,0,0,0,(e+t)/(t-e),-1,0,0,2*e*t/(t-e),0])}function Ee(n,r,t,e,o,a){let i=r-n,s=e-t,l=a-o;return new Float32Array([2/i,0,0,0,0,2/s,0,0,0,0,-2/l,0,-(r+n)/i,-(e+t)/s,-(a+o)/l,1])}function ee(n,r,t){let e=P(V(n,r)),o=G(t,e);if(Math.hypot(o[0],o[1],o[2])<1e-8)return J();let a=P(o),i=G(e,a);return new Float32Array([a[0],i[0],e[0],0,a[1],i[1],e[1],0,a[2],i[2],e[2],0,-q(a,n),-q(i,n),-q(e,n),1])}function ot(n,r){let t=[0,1,2,3].map(o=>n[0+o]*r[0]+n[4+o]*r[1]+n[8+o]*r[2]+n[12+o]),e=t[3];return{x:t[0]/e,y:t[1]/e,z:t[2]/e,w:e}}function Te(n,r,t,e){let o=ot(n,r);return{sx:(o.x*.5+.5)*t,sy:(1-(o.y*.5+.5))*e,behind:o.w<=0}}function at(n){return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4)}function xe(n){return n<=.0031308?n*12.92:1.055*Math.pow(n,1/2.4)-.055}var kt=/^#?([0-9a-fA-F]{6})$/;function B(n){let r=kt.exec(n.trim());if(!r)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(n)}`);let t=r[1];return[0,2,4].map(e=>at(parseInt(t.slice(e,e+2),16)/255))}function ye(n){return`#${n.map(t=>{let e=xe(Math.min(1,Math.max(0,t)));return Math.round(e*255).toString(16).padStart(2,"0")}).join("")}`}var H={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},ge=Object.freeze(Object.fromEntries(Object.keys(H).map(n=>[n,B(H[n])])));var it=.4;var Fe=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${it.toFixed(2)}); }`,Re=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function Ae(){let n=[];for(let r of Object.keys(H)){let t=H[r].toLowerCase(),e=ye(ge[r]).toLowerCase();e!==t&&n.push({key:r,expected:t,actual:e})}return n}function It(n){let r=[1/0,1/0,1/0],t=[-1/0,-1/0,-1/0];for(let e=0;e<n.length;e+=3)for(let o=0;o<3;o++){let a=n[e+o];a<r[o]&&(r[o]=a),a>t[o]&&(t[o]=a)}return n.length===0?{min:[0,0,0],max:[0,0,0]}:{min:r,max:t}}function st(n,r,t,e){let o=new Float32Array(n.length);for(let i=0;i<e.length;i+=3){let s=e[i],l=e[i+1],c=e[i+2],d=s*3,u=l*3,f=c*3,h=s*2,p=l*2,m=c*2,b=n[u]-n[d],g=n[u+1]-n[d+1],E=n[u+2]-n[d+2],T=n[f]-n[d],F=n[f+1]-n[d+1],y=n[f+2]-n[d+2],R=t[p]-t[h],v=t[p+1]-t[h+1],W=t[m]-t[h],k=t[m+1]-t[h+1],D=R*k-W*v;if(Math.abs(D)<1e-12)continue;let j=1/D,Bt=(b*k-T*v)*j,Ct=(g*k-F*v)*j,Ot=(E*k-y*v)*j;for(let I of[d,u,f])o[I]=o[I]+Bt,o[I+1]=o[I+1]+Ct,o[I+2]=o[I+2]+Ot}let a=new Float32Array(n.length);for(let i=0;i<a.length;i+=3){let s=r[i],l=r[i+1],c=r[i+2],d=o[i],u=o[i+1],f=o[i+2],h=d*s+u*l+f*c;d-=s*h,u-=l*h,f-=c*h;let p=Math.hypot(d,u,f);p<1e-8&&(Math.abs(s)<.9?(d=0,u=-c,f=l):(d=-c,u=0,f=s),p=Math.hypot(d,u,f)||1),a[i]=d/p,a[i+1]=u/p,a[i+2]=f/p}return a}function ut(n,r){let t=new Float32Array(n.length);for(let e=0;e<r.length;e+=3){let o=r[e]*3,a=r[e+1]*3,i=r[e+2]*3,s=n[a]-n[o],l=n[a+1]-n[o+1],c=n[a+2]-n[o+2],d=n[i]-n[o],u=n[i+1]-n[o+1],f=n[i+2]-n[o+2],h=l*f-c*u,p=c*d-s*f,m=s*u-l*d;for(let b of[o,a,i])t[b]=t[b]+h,t[b+1]=t[b+1]+p,t[b+2]=t[b+2]+m}for(let e=0;e<t.length;e+=3){let o=Math.hypot(t[e],t[e+1],t[e+2]);o>0&&(t[e]=t[e]/o,t[e+1]=t[e+1]/o,t[e+2]=t[e+2]/o)}return t}function ve(n,r,t,e,o){let{min:a,max:i}=It(n),s=e??ut(n,t);return{positions:n,normals:s,uvs:r,indices:t,min:a,max:i,tangents:o??st(n,s,r,t)}}function Se(n=10,r=24){let t=Math.max(1,Math.floor(r)),e=(t+1)*(t+1),o=new Float32Array(e*3),a=new Float32Array(e*3),i=new Float32Array(e*2),s=new Uint16Array(t*t*6),l=0,c=0,d=0;for(let u=0;u<=t;u++)for(let f=0;f<=t;f++){let h=(f/t-.5)*n,p=(u/t-.5)*n;o[l]=h,o[l+1]=0,o[l+2]=p,a[l]=0,a[l+1]=1,a[l+2]=0,l+=3,i[c++]=f/t,i[c++]=u/t}for(let u=0;u<t;u++)for(let f=0;f<t;f++){let h=u*(t+1)+f,p=h+1,m=h+(t+1),b=m+1;s[d++]=h,s[d++]=m,s[d++]=p,s[d++]=p,s[d++]=m,s[d++]=b}return ve(o,i,s,a)}function te(n=.5,r=.2,t=64){let e=Math.max(3,t),o=r/2,a=[],i=[],s=[],l=[],c=[];for(let d=0;d<=e;d++){let u=d/e*Math.PI*2,f=Math.cos(u),h=Math.sin(u);a.push(f*n,o,h*n),i.push(f,0,h),s.push(d/e,1),c.push(-h,0,f),a.push(f*n,-o,h*n),i.push(f,0,h),s.push(d/e,0),c.push(-h,0,f)}for(let d=0;d<e;d++){let u=d*2,f=u+1,h=u+2,p=u+3;l.push(u,h,f,f,h,p)}for(let[d,u]of[[1,o],[-1,-o]]){let f=a.length/3;a.push(0,u,0),i.push(0,d,0),s.push(.5,.5),c.push(1,0,0);for(let h=0;h<=e;h++){let p=h/e*Math.PI*2,m=Math.cos(p),b=Math.sin(p);a.push(m*n,u,b*n),i.push(0,d,0),s.push(.5+m*.5,.5+b*.5),c.push(-b,0,m)}for(let h=0;h<e;h++){let p=f+1+h,m=f+2+h;d>0?l.push(f,m,p):l.push(f,p,m)}}return ve(new Float32Array(a),new Float32Array(s),new Uint16Array(l),new Float32Array(i),new Float32Array(c))}function Me(n=.5,r=.08,t=64,e=24){let o=Math.max(3,t),a=Math.max(3,e),i=[],s=[],l=[],c=[],d=[];for(let u=0;u<=o;u++){let f=u/o*Math.PI*2,h=Math.cos(f),p=Math.sin(f);for(let m=0;m<=a;m++){let b=m/a*Math.PI*2,g=Math.cos(b),E=Math.sin(b);i.push((n+r*g)*h,r*E,(n+r*g)*p),s.push(h*g,E,p*g),l.push(u/o,m/a),d.push(-p,0,h)}}for(let u=0;u<o;u++)for(let f=0;f<a;f++){let h=u*(a+1)+f,p=h+1,m=h+(a+1),b=m+1;c.push(h,p,m,p,b,m)}return ve(new Float32Array(i),new Float32Array(l),new Uint16Array(c),new Float32Array(s),new Float32Array(d))}function Le(n){return n.indices.length/3}var lt=n=>[n.DEPTH_TEST,n.CULL_FACE,n.BLEND];function L(n){return[n.getParameter(n.FRAMEBUFFER_BINDING),n.getParameter(n.VIEWPORT),n.getParameter(n.DEPTH_WRITEMASK),lt(n).map(r=>n.getParameter(r))]}function w(n,r){n.bindFramebuffer(n.FRAMEBUFFER,r[0]);let t=r[1];n.viewport(t[0]??0,t[1]??0,t[2]??0,t[3]??0),n.depthMask(r[2]),lt(n).forEach((e,o)=>{r[3][o]?n.enable(e):n.disable(e)})}function z(n,r){for(let t=r-1;t>=0;t--)n.activeTexture(n.TEXTURE0+t),n.bindTexture(n.TEXTURE_2D,null),n.bindTexture(n.TEXTURE_3D,null);n.activeTexture(n.TEXTURE0)}var _e=["minimum","reduced","full"],we={full:{dprScale:2,ao:!0,dof:!0,shadowMapSize:1536,shadowTaps:9,volumeLightSteps:6},reduced:{dprScale:2,ao:!0,dof:!1,shadowMapSize:1024,shadowTaps:9,volumeLightSteps:4},minimum:{dprScale:1,ao:!1,dof:!1,shadowMapSize:512,shadowTaps:1,volumeLightSteps:1}};function re(n,r){let t=Number.isFinite(r)&&r>0?r:1024,e=we[n].shadowMapSize/we.full.shadowMapSize,o=t*e,a=2**Math.round(Math.log2(o));return Math.max(256,Math.min(t,a))}function De(n){return{tier:n,...we[n]}}var Pe=89,Ue=Math.PI/180;function ne(n){let r=Math.max(-Pe,Math.min(Pe,n.elevationDeg))*Ue,t=n.azimuthDeg*Ue,e=Math.max(1e-4,n.distance),o=Math.sin(r)*e,a=Math.cos(r)*e;return[n.target[0]+Math.sin(t)*a,n.target[1]+o,n.target[2]+Math.cos(t)*a]}function oe(n,r){let t=ne(n),e=n.near??Math.max(.01,n.distance/100),o=n.far??Math.max(e+1,n.distance*8),a=be((n.fovDeg??38)*Ue,Math.max(.001,r),e,o),i=ee(t,n.target,[0,1,0]);return Z(a,i)}function Ne(n,r,t){let e=P(n.direction),o=n.extent??Math.max(.1,t*1.35),a=Math.max(1,t*2),i=[r[0]-e[0]*a,r[1]-e[1]*a,r[2]-e[2]*a],s=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],l=ee(i,r,s),c=Ee(-o,o,-o,o,.01,a+t*2+o);return Z(c,l)}function Be(n,r){let t=V([r[0],r[1],r[2]],[n[0],n[1],n[2]]);return Math.hypot(t[0],t[1],t[2])/2}function Ce(n,r){return[(n[0]+r[0])/2,(n[1]+r[1])/2,(n[2]+r[2])/2]}function Oe(n,r,t){let{gl:e}=n,o=Math.max(1,Math.floor(r)),a=Math.max(1,Math.floor(t)),i=e.createFramebuffer(),s=e.createTexture(),l=e.createTexture();if(!i||!s||!l)return A("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let c=n.hdr?e.RGBA16F:e.RGBA8,d=n.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,u=()=>{e.bindTexture(e.TEXTURE_2D,s),e.texImage2D(e.TEXTURE_2D,0,c,o,a,0,e.RGBA,d,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,l),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,o,a,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,s,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,l,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};u(),e.bindFramebuffer(e.FRAMEBUFFER,i);let f=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),f!==e.FRAMEBUFFER_COMPLETE?A("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${f.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:s,depthTexture:l,get width(){return o},get height(){return a},bind(){e.bindFramebuffer(e.FRAMEBUFFER,i),e.viewport(0,0,o,a)},resize(h,p){let m=Math.max(1,Math.floor(h)),b=Math.max(1,Math.floor(p));m===o&&b===a||(o=m,a=b,u())},dispose(){e.deleteFramebuffer(i),e.deleteTexture(s),e.deleteTexture(l)}}}function ke(n,r=1024){let{gl:t}=n,e=Math.max(256,Math.min(2048,Math.floor(r))),o=t.createFramebuffer(),a=t.createTexture();if(!o||!a)return A("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");t.bindTexture(t.TEXTURE_2D,a),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,e,e,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,o),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,a,0);let i=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),i!==t.FRAMEBUFFER_COMPLETE?A("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:e,bind(){t.bindFramebuffer(t.FRAMEBUFFER,o),t.viewport(0,0,e,e)},dispose(){t.deleteFramebuffer(o),t.deleteTexture(a)}}}var ie=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,ae={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function se(n,r,t={}){let e=t.zenith??ae.zenith,o=t.horizon??ae.horizon,a=t.ground??ae.ground;n.uniform3f(n.getUniformLocation(r,"uSkyZenith"),e[0],e[1],e[2]),n.uniform3f(n.getUniformLocation(r,"uSkyHorizon"),o[0],o[1],o[2]),n.uniform3f(n.getUniformLocation(r,"uSkyGround"),a[0],a[1],a[2])}var Gt=`#version 300 es
precision highp float;
out vec2 vNdc;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`,Vt=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${ie}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;function Ie(n){let{gl:r}=n,t=n.compile(Gt,Vt);return"kind"in t?t:{draw(e){let o=P(V(e.target,e.eye)),a=Math.abs(o[1])>.999?[0,0,1]:[0,1,0],i=P(G(o,a)),s=P(G(i,o)),l=L(r);r.disable(r.DEPTH_TEST),r.depthMask(!1),r.disable(r.BLEND),r.useProgram(t),r.uniform3f(r.getUniformLocation(t,"uRight"),i[0],i[1],i[2]),r.uniform3f(r.getUniformLocation(t,"uUp"),s[0],s[1],s[2]),r.uniform3f(r.getUniformLocation(t,"uForward"),o[0],o[1],o[2]),r.uniform1f(r.getUniformLocation(t,"uTanHalfFov"),Math.tan(e.fovDeg*Math.PI/360)),r.uniform1f(r.getUniformLocation(t,"uAspect"),Math.max(.001,e.aspect)),se(r,t,e.sky),n.blit(t),w(r,l)},dispose(){r.deleteProgram(t)}}}var ct=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,Ge=`#version 300 es
precision highp float;
void main(){}`,Ht=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,ft=`#version 300 es
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
}`,dt=`#version 300 es
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
${ie}

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
}`;function Ve(n,r){let{gl:t}=n,e=t.createVertexArray(),o=t.createBuffer(),a=t.createBuffer(),i=t.createBuffer(),s=t.createBuffer();return!e||!o||!a||!i||!s?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(t.bindVertexArray(e),t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,r.positions,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,a),t.bufferData(t.ARRAY_BUFFER,r.normals,t.STATIC_DRAW),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,i),t.bufferData(t.ARRAY_BUFFER,r.tangents,t.STATIC_DRAW),t.enableVertexAttribArray(2),t.vertexAttribPointer(2,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,s),t.bufferData(t.ELEMENT_ARRAY_BUFFER,r.indices,t.STATIC_DRAW),t.bindVertexArray(null),{vao:e,indexCount:r.indices.length,indexType:r.indices instanceof Uint32Array?t.UNSIGNED_INT:t.UNSIGNED_SHORT,dispose(){t.deleteVertexArray(e),t.deleteBuffer(o),t.deleteBuffer(a),t.deleteBuffer(i),t.deleteBuffer(s)}})}function He(n){let{gl:r}=n,t=n.compile(ct,Ge);if("kind"in t)return t;let e=n.compile(ft,dt);if("kind"in e)return e;let o=n.compile(Ht,Ge);if("kind"in o)return o;let a=(i,s)=>r.getUniformLocation(i,s);return{shadowPass(i,s,l,c){let d=L(r),u=c??(()=>{});l.bind(),u("shadow.bind"),r.clear(r.DEPTH_BUFFER_BIT),r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.FRONT),r.useProgram(t),u("useProgram(shadow)"),r.uniformMatrix4fv(a(t,"uLightVP"),!1,i),u("uLightVP");for(let f of s)r.uniformMatrix4fv(a(t,"uModel"),!1,f.model),u("shadow uModel"),r.bindVertexArray(f.mesh.vao),u("shadow bindVAO"),r.drawElements(r.TRIANGLES,f.mesh.indexCount,f.mesh.indexType,0),u("shadow drawElements");r.bindVertexArray(null),r.cullFace(r.BACK),w(r,d)},depthPrepass(i,s){let l=L(r);r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.colorMask(!1,!1,!1,!1),r.useProgram(o),r.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let c of s)r.uniformMatrix4fv(a(o,"uModel"),!1,c.model),r.bindVertexArray(c.mesh.vao),r.drawElements(r.TRIANGLES,c.mesh.indexCount,c.mesh.indexType,0);r.bindVertexArray(null),r.colorMask(!0,!0,!0,!0),w(r,l)},draw(i){let s=L(r),l=i.onStep??(()=>{});if(r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.useProgram(e),r.uniformMatrix4fv(a(e,"uViewProj"),!1,i.viewProj),l("uViewProj"),r.uniform3fv(a(e,"uEye"),i.eye),l("uEye"),r.uniform3fv(a(e,"uLightDir"),i.lightDir),l("uLightDir"),r.uniform3fv(a(e,"uLightColour"),i.lightColour),l("uLightColour"),r.uniform1f(a(e,"uAmbientGain"),i.ambientGain??1),l("uAmbientGain"),i.fog&&i.fog.density>0){r.uniform1f(a(e,"uFogDensity"),i.fog.density),r.uniform1f(a(e,"uFogHeight"),i.fog.height),r.uniform1f(a(e,"uFogFloor"),i.fog.floor??0);let c=i.fog.colour;c==="sky"?r.uniform3f(a(e,"uFogColour"),-1,-1,-1):r.uniform3f(a(e,"uFogColour"),c[0],c[1],c[2]),l("fog")}else r.uniform1f(a(e,"uFogDensity"),0);if(se(r,e,i.sky),l("bindSky"),i.ao&&i.screenSize?(r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,i.ao),r.uniform1i(a(e,"uAO"),1),r.uniform2f(a(e,"uScreenSize"),i.screenSize[0],i.screenSize[1]),r.uniform1f(a(e,"uAOEnabled"),1)):r.uniform1f(a(e,"uAOEnabled"),0),l("bindAO"),r.uniformMatrix4fv(a(e,"uLightVP"),!1,i.lightVP),l("lit uLightVP"),i.shadow){r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,i.shadow.depthTexture),r.uniform1i(a(e,"uShadowMap"),0),r.uniform1f(a(e,"uShadowTexel"),1/i.shadow.size),r.uniform1f(a(e,"uShadowStrength"),i.shadowStrength??1),r.uniform1i(a(e,"uShadowTaps"),(i.shadowTaps??9)>=9?9:1);let c=i.shadowBaseline,d=c&&c>0&&i.shadow.size>0?c/i.shadow.size:1;r.uniform1f(a(e,"uShadowBiasScale"),Number.isFinite(d)&&d>0?d:1)}else r.uniform1f(a(e,"uShadowStrength"),0);for(let c of i.draws)r.uniformMatrix4fv(a(e,"uModel"),!1,c.model),r.uniformMatrix3fv(a(e,"uNormalMat"),!1,c.normalMat),l("uNormalMat"),r.uniform3fv(a(e,"uBaseColour"),c.material.baseColour),l("uBaseColour"),r.uniform1f(a(e,"uRoughness"),c.material.roughness),r.uniform1f(a(e,"uMetalness"),c.material.metalness),r.uniform1f(a(e,"uAnisotropy"),c.material.anisotropy??0),r.bindVertexArray(c.mesh.vao),l("lit bindVAO"),r.drawElements(r.TRIANGLES,c.mesh.indexCount,c.mesh.indexType,0),l("lit drawElements");r.bindVertexArray(null),z(r,2),w(r,s)},dispose(){r.deleteProgram(t),r.deleteProgram(e),r.deleteProgram(o)}}}var $=`
uniform sampler2D uDepth;
uniform vec2 uNearFar;

float linearDepthAt(vec2 uv) {
  float d = texture(uDepth, uv).r * 2.0 - 1.0;
  float n = uNearFar.x, f = uNearFar.y;
  return (2.0 * n * f) / (f + n - d * (f - n));
}`,ht=`
uniform float uTanHalfFov;
uniform float uAspect;

vec3 viewPosAt(vec2 uv) {
  float z = linearDepthAt(uv);
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x * uTanHalfFov * uAspect * z, ndc.y * uTanHalfFov * z, -z);
}`,pt=$+ht,mt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,zt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${pt}

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
}`,Xt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${$}

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
}`;function ze(n,r,t){let{gl:e}=n,o=n.compile(mt,zt);if("kind"in o)return o;let a=n.compile(mt,Xt);if("kind"in a)return a;let i=Math.max(1,r>>1),s=Math.max(1,t>>1),l=()=>{let m=e.createFramebuffer(),b=e.createTexture();return!m||!b?null:{fb:m,tex:b}},c=l(),d=l();if(!c||!d)return A("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let u=()=>{for(let m of[c,d])e.bindTexture(e.TEXTURE_2D,m.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,i,s,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,m.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,m.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};u(),e.bindFramebuffer(e.FRAMEBUFFER,c.fb);let f=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),f!==e.FRAMEBUFFER_COMPLETE)return A("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${f.toString(16)}).`);let h=(m,b,g,E,T)=>{e.activeTexture(e.TEXTURE0+T),e.bindTexture(e.TEXTURE_2D,b),e.uniform1i(e.getUniformLocation(m,"uDepth"),T),e.uniform2f(e.getUniformLocation(m,"uNearFar"),g,E)},p=(m,b,g,E,T,F,y)=>{h(m,b,g,E,y),e.uniform1f(e.getUniformLocation(m,"uTanHalfFov"),Math.tan(T*Math.PI/360)),e.uniform1f(e.getUniformLocation(m,"uAspect"),F)};return{get texture(){return c.tex},get width(){return i},get height(){return s},compute(m){let b=L(e);e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,c.fb),e.viewport(0,0,i,s),e.useProgram(o),p(o,m.depthTexture,m.near,m.far,m.fovDeg,m.aspect,0),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/i,1/s),e.uniform1f(e.getUniformLocation(o,"uRadius"),m.radius??.55),e.uniform1f(e.getUniformLocation(o,"uStrength"),m.strength??1.15),e.uniform1f(e.getUniformLocation(o,"uBias"),m.bias??.035),n.blit(o);for(let[g,E,T]of[[c,d,[1,0]],[d,c,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,E.fb),e.viewport(0,0,i,s),e.useProgram(a),h(a,m.depthTexture,m.near,m.far,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,g.tex),e.uniform1i(e.getUniformLocation(a,"uAO"),1),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/i,1/s),e.uniform2f(e.getUniformLocation(a,"uDir"),T[0],T[1]),n.blit(a);z(e,2),w(e,b)},resize(m,b){let g=Math.max(1,m>>1),E=Math.max(1,b>>1);g===i&&E===s||(i=g,s=E,u())},dispose(){e.deleteProgram(o),e.deleteProgram(a);for(let m of[c,d])e.deleteFramebuffer(m.fb),e.deleteTexture(m.tex)}}}var Wt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,jt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uFocusDistance;
uniform float uAperture;
uniform float uMaxCoc;
out vec4 frag;
${$}

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
}`;function Xe(n,r,t){let{gl:e}=n,o=n.compile(Wt,jt);if("kind"in o)return o;let a=Math.max(1,Math.floor(r)),i=Math.max(1,Math.floor(t)),s=e.createFramebuffer(),l=e.createTexture();if(!s||!l)return A("FRAMEBUFFER_INCOMPLETE","The GPU refused a depth-of-field buffer.");let c=()=>{e.bindTexture(e.TEXTURE_2D,l);let u=n.hdr?e.RGBA16F:e.RGBA8,f=n.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE;e.texImage2D(e.TEXTURE_2D,0,u,a,i,0,e.RGBA,f,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,s),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,l,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};c(),e.bindFramebuffer(e.FRAMEBUFFER,s);let d=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),d!==e.FRAMEBUFFER_COMPLETE?A("FRAMEBUFFER_INCOMPLETE",`The DOF buffer is incomplete (0x${d.toString(16)}).`):{texture:l,apply(u){let f=L(e);e.bindFramebuffer(e.FRAMEBUFFER,s),e.viewport(0,0,a,i),e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.useProgram(o),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,u.scene),e.uniform1i(e.getUniformLocation(o,"uScene"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,u.depthTexture),e.uniform1i(e.getUniformLocation(o,"uDepth"),1),e.uniform2f(e.getUniformLocation(o,"uNearFar"),u.near,u.far),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/a,1/i),e.uniform1f(e.getUniformLocation(o,"uFocusDistance"),u.focusDistance),e.uniform1f(e.getUniformLocation(o,"uAperture"),u.aperture??12),e.uniform1f(e.getUniformLocation(o,"uMaxCoc"),u.maxCoc??.012),n.blit(o),z(e,2),w(e,f)},resize(u,f){let h=Math.max(1,Math.floor(u)),p=Math.max(1,Math.floor(f));h===a&&p===i||(a=h,i=p,c())},dispose(){e.deleteProgram(o),e.deleteFramebuffer(s),e.deleteTexture(l)}}}var $t=`
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
`;function N(n){return String(n).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function bt(n){let r=document.createElement("style");r.textContent=$t,document.head.appendChild(r);let t=document.createElement("section");t.id="lcx-fallback",t.setAttribute("aria-label",`${n.title} \u2014 flat view`),t.setAttribute("tabindex","-1"),document.getElementById("log")?.setAttribute("aria-hidden","true");let e=(a,i)=>a===null?`<td class="absent${i?" n":""}">absent</td>`:`<td class="${i?"n":""}">${N(a)}</td>`;t.innerHTML=`<h2>${N(n.title)} \u2014 flat view</h2><p class="reads">${N(n.readsAs)}</p>`+(n.notices??[]).map(a=>`<p class="notice">${N(a)}</p>`).join("")+'<div id="lcx-refusal" role="alert"></div>'+(n.html?`<div class="surface">${n.html}</div>`:`<table><caption>${N(n.title)} \u2014 flat view</caption><thead><tr>`+n.columns.map(a=>`<th scope="col" class="${a.numeric?"n":""}">${N(a.label)}</th>`).join("")+"</tr></thead><tbody>"+n.rows.map(a=>"<tr>"+n.columns.map(i=>e(a[i.key]??null,!!i.numeric)).join("")+"</tr>").join("")+"</tbody></table>"),document.body.appendChild(t);function o(a,i){let s=document.getElementById("lcx-refusal");s&&(s.innerHTML=`<p class="refusal"><strong>${N(a)}</strong> \u2014 ${N(i)} The measurements below are unaffected.</p>`),delete t.dataset.rendered;for(let l of Array.from(document.querySelectorAll("canvas")))l.style.display="none";t.focus({preventScroll:!0})}return document.addEventListener("webglcontextlost",a=>{a.preventDefault(),o("CONTEXT_LOST","The GPU dropped the WebGL context for this page mid-session.")},!0),{markRendered(){t.dataset.rendered="1"},showRefusal:o}}var C=new URLSearchParams(location.search),Qe=[],Ft=[];function Rt(n,r,t,e){let o=C.get(n);if(o===null)return r;let a=Number(o);if(!Number.isFinite(a))return Qe.push(`${n}=${o}`),r;let i=Math.max(t,Math.min(e,a));return i!==a&&Ft.push(`${n}=${o} used as ${i}`),i}var Y=C.get("aniso")!=="0",tt=_e.includes(C.get("tier")??"")?C.get("tier"):"full",Q=De(tt),Ke=C.get("ao")!=="0"&&Q.ao,qe=C.get("dof")!=="0"&&Q.dof,K=Rt("scale",1,1,3),S=1200*K,M=720*K,rt=document.getElementById("c");rt.width=S;rt.height=M;function me(n){document.title="REFUSED";let r=document.getElementById("log");r&&(r.textContent=n);let[t,...e]=n.split(":");throw At?.showRefusal(t?.trim()??"REFUSED",e.join(":").trim()||n),new Error(n)}var At=null;function O(n,r){return"kind"in r&&me(`${n}: ${r.code} \u2014 ${r.reason} ${r.detail??""}`),r}var vt=bt({title:"E8 \xB7 The Forge \u2014 the machined mark",readsAs:"The rendered view is anisotropic GGX on a brushed disc: the highlight stretches along the lathe direction rather than across it, which is what reads as machined instead of scratched. The shipping surface resolves instead to ForgePlate, a CSS gradient \u2014 this table states what the render is evidence for.",notices:["A material study, not a data surface \u2014 there is no measurement in this frame to lose.","The SHIPPED fallback for this environment is apps/web/src/components/brand/ForgePlate.tsx."],columns:[{key:"part",label:"Part"},{key:"hex",label:"Base colour"},{key:"roughness",label:"Roughness",numeric:!0},{key:"metalness",label:"Metalness",numeric:!0},{key:"aniso",label:"Anisotropy",numeric:!0}],rows:[{part:"Disc face (brushed)",hex:"#C9D4E4",roughness:.22,metalness:.9,aniso:Y?.85:0},{part:"Ring",hex:"#C9D4E4",roughness:.18,metalness:.94,aniso:Y?.9:0},{part:"Mark inlay",hex:"#2C6BFF",roughness:.3,metalness:.05,aniso:0}]});At=vt;Qe.length>0&&me(`BAD_PARAM: ${Qe.join(", ")} \u2014 not a number, so the view was not drawn rather than drawn at a nonsensical size. Nothing about the underlying measurements has changed; correct the URL and reload.`);C.get("refuse")==="1"&&me("FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. The three-dimensional view is not being drawn.");var Je=pe(rt,{alpha:!1});if(!he(Je))throw document.title="REFUSED",new Error(Je.reason);var _=Je,x=_.gl,Yt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Qt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${Fe}
${Re}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,Kt=document.getElementById("log"),qt=n=>`${n.reason} ${n.detail??""}`,Jt=O("present",_.compile(Yt,Qt)),We=O("lit",He(_)),X=O("target",Oe(_,S,M)),Et=O("shadow",ke(_,re(tt,1024))),Zt=O("skyBox",Ie(_)),Tt=O("ao",ze(_,S,M)),xt=O("dof",Xe(_,S,M)),St=te(.92,.16,96),Mt=Me(1.06,.055,128,32),Lt=te(1.9,.09,96),wt=Se(16,24),ue=[St,Mt,Lt,wt].map(n=>{let r=Ve(_,n);return"kind"in r&&me(`mesh: ${qt(r)}`),r}),le=(n,r,t)=>{let e=J();return e[12]=n,e[13]=r,e[14]=t,e},ce=new Float32Array([1,0,0,0,1,0,0,0,1]),fe=.3,je=[{mesh:ue[3],model:le(0,0,0),normalMat:ce,material:{baseColour:B("#080C15"),roughness:.88,metalness:0}},{mesh:ue[2],model:le(0,.045,0),normalMat:ce,material:{baseColour:B("#161D2E"),roughness:.52,metalness:.35}},{mesh:ue[0],model:le(0,fe,0),normalMat:ce,material:{baseColour:B("#8FA3C4"),roughness:.5477,metalness:.95,anisotropy:Y?.86:0}},{mesh:ue[1],model:le(0,fe,0),normalMat:ce,material:{baseColour:B("#2C6BFF"),roughness:.3606,metalness:.92,anisotropy:Y?.72:0}}],U={target:[0,.34,0],distance:5,azimuthDeg:22,elevationDeg:24,fovDeg:30},_t=[-2,0,-2],Dt=[2,.55,2],er=Ce(_t,Dt),yt=Be(_t,Dt),tr=[St,Mt,Lt,wt].reduce((n,r)=>n+Le(r),0),Ze=Math.max(.01,U.distance/100),gt=Math.max(Ze+1,U.distance*8);function de(n){let r=-.9+Math.sin(n*.9)*.75,t=[Math.sin(r)*.85,-.95,Math.cos(r)*.55],e=Ne({direction:t,colour:[1,1,1],extent:yt*.9},er,yt),o=oe(U,S/M),a=ne(U);We.shadowPass(e,je,Et),X.bind(),x.clear(x.DEPTH_BUFFER_BIT),Zt.draw({eye:a,target:U.target,fovDeg:U.fovDeg??34,aspect:S/M}),We.depthPrepass(o,je),Ke&&Tt.compute({depthTexture:X.depthTexture,near:Ze,far:gt,fovDeg:U.fovDeg??34,aspect:S/M,radius:.42,strength:1.3}),X.bind(),We.draw({viewProj:o,eye:a,lightDir:t,lightColour:[5.2,5,4.6],ambientGain:1.15,lightVP:e,shadow:Et,shadowStrength:.9,shadowTaps:Q.shadowTaps,shadowBaseline:1024,draws:je,ao:Ke?Tt.texture:null,screenSize:[S,M]});let i=Math.hypot(a[0],a[1]-fe,a[2]);qe&&xt.apply({scene:X.texture,depthTexture:X.depthTexture,near:Ze,far:gt,fovDeg:U.fovDeg??34,aspect:S/M,focusDistance:i,aperture:7,maxCoc:.009}),x.bindFramebuffer(x.FRAMEBUFFER,null),x.viewport(0,0,S,M),x.disable(x.DEPTH_TEST),x.activeTexture(x.TEXTURE0),x.bindTexture(x.TEXTURE_2D,qe?xt.texture:X.texture),_.blit(Jt,s=>x.uniform1i(x.getUniformLocation(s,"uScene"),0))}function rr(){let n=document.getElementById("mark");if(!n)return;let r=oe(U,S/M),t=Te(r,[0,fe+.08,0],S/K,M/K);if(t.behind){n.style.visibility="hidden";return}n.style.visibility="visible",n.style.left=`${t.sx}px`,n.style.top=`${t.sy}px`}rr();de(1.6);function nr(n){de(1.6);let r=new Uint8Array(4);x.readPixels(0,0,1,1,x.RGBA,x.UNSIGNED_BYTE,r);let t=performance.now();for(let e=0;e<n;e++)de(1.6);return x.readPixels(0,0,1,1,x.RGBA,x.UNSIGNED_BYTE,r),(performance.now()-t)/n}var Pt=Math.trunc(Rt("frames",300,1,2e4)),$e=nr(Math.max(1,Pt)),et=Ae();if(et.length>0){let n="BRAND FIDELITY FAILED \u2014 "+et.map(t=>`${t.key}: expected ${t.expected}, got ${t.actual}`).join("; ");document.title="REFUSED";let r=document.getElementById("log");throw r&&(r.textContent=n),new Error(n)}var Ut=(()=>{let n=x.getExtension("WEBGL_debug_renderer_info");return n?String(x.getParameter(n.UNMASKED_RENDERER_WEBGL)):"unknown"})(),Ye=/swiftshader|llvmpipe|software/i.test(Ut),Nt={paramClamps:Ft,ao:Ke,dof:qe,tier:Q.tier,tierDprScale:Q.dprScale,tierShadowMapSize:re(tt,1024),shadowBaseline:1024,glError:x.getError(),brandFidelity:et,anisotropy:Y,triangles:tr,resolution:`${S}x${M}`,dprScale:K,frames:Pt,msPerFrame:Number($e.toFixed(3)),fps:Math.round(1e3/$e),renderer:Ut,rendererClass:Ye?"software":"hardware",headroom:Ye?null:Number((16.6-$e).toFixed(3)),headroomRefusal:Ye?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null};globalThis.E8=Nt;Kt.textContent=JSON.stringify(Nt,null,2);de(1.6);vt.markRendered();document.title="READY";

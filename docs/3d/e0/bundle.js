var ft={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected.",FEEDBACK_LOOP:"A layer of this view was asked to read the surface it draws into, which every driver refuses, so the layer is not being drawn. This is a defect in the renderer, not in the data."};function w(n,r){return r===void 0?{kind:"refused",code:n,reason:ft[n]}:{kind:"refused",code:n,reason:ft[n],detail:r}}var Vt=3,Ht=24e5;function ge(n){return n.kind==="stage"}function ye(n,r={}){let t=n.getContext("webgl2",{antialias:r.antialias??!1,alpha:r.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!t)return w("NO_WEBGL2");let e=t.getExtension("EXT_color_buffer_float"),a=n.width,o=n.height,i=e?t.RGBA16F:t.RGBA8,u=e?t.HALF_FLOAT:t.UNSIGNED_BYTE,l=(T,g)=>{let y=t.createTexture();t.bindTexture(t.TEXTURE_2D,y),t.texImage2D(t.TEXTURE_2D,0,i,T,g,0,t.RGBA,u,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);let x=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,x),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,y,0);let F=t.checkFramebufferStatus(t.FRAMEBUFFER);return F!==t.FRAMEBUFFER_COMPLETE?w("FRAMEBUFFER_INCOMPLETE",`status 0x${F.toString(16)} at ${T}\xD7${g}`):{texture:y,framebuffer:x,width:T,height:g}},s=r.bloomShift??2,c={w:a,h:o},f=(T,g)=>Math.max(g,Math.ceil(Math.max(1,T)/256)*256),d=(T,g)=>{let y=f(T,1024),x=f(g,512);return{scene:l(y,x),bloomA:l(Math.max(1,y>>s),Math.max(1,x>>s)),bloomB:l(Math.max(1,y>>s),Math.max(1,x>>s)),texels:y*x}},h=T=>{for(let g of[T.scene,T.bloomA,T.bloomB])"kind"in g||(t.deleteFramebuffer(g.framebuffer),t.deleteTexture(g.texture))},p=new Map,m=`${a}x${o}`,b=d(a,o);for(let T of[b.scene,b.bloomA,b.bloomB])if("kind"in T)return h(b),T;p.set(m,b);let R=()=>{let T=p.size-1,g=0;for(let[y,x]of p)y!==m&&(g+=x.texels);for(let[y,x]of p){if(T<=Vt&&g<=Ht)return;y!==m&&(p.delete(y),h(x),T-=1,g-=x.texels)}},A=t.createVertexArray();t.bindVertexArray(A);let L=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,L),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null);let z=[];return{kind:"stage",gl:t,cssWidth:n.clientWidth||a,cssHeight:n.clientHeight||o,hdr:!!e,get width(){return c.w},get height(){return c.h},get scene(){return b.scene},get bloomA(){return b.bloomA},get bloomB(){return b.bloomB},setRegion(T,g){let y=Math.max(1,Math.round(T)),x=Math.max(1,Math.round(g));if(y===c.w&&x===c.h)return;c={w:y,h:x};let F=`${y}x${x}`,v=p.get(F);if(v){p.delete(F),p.set(F,v),b=v,m=F;return}b=d(y,x),m=F,p.set(F,b),R()},compile(T,g){let y=(K,xe)=>{let B=t.createShader(K);if(t.shaderSource(B,xe),t.compileShader(B),!t.getShaderParameter(B,t.COMPILE_STATUS)){let C=t.getShaderInfoLog(B)??"(no log)";return t.deleteShader(B),w("SHADER_COMPILE_FAILED",C)}return B},x=y(t.VERTEX_SHADER,T);if(typeof x=="object"&&"kind"in x)return x;let F=y(t.FRAGMENT_SHADER,g);if(typeof F=="object"&&"kind"in F)return t.deleteShader(x),F;let v=t.createProgram();if(t.attachShader(v,x),t.attachShader(v,F),t.linkProgram(v),!t.getProgramParameter(v,t.LINK_STATUS)){let K=t.getProgramInfoLog(v)??"(no log)";return t.deleteShader(x),t.deleteShader(F),t.deleteProgram(v),w("PROGRAM_LINK_FAILED",K)}return t.detachShader(v,x),t.detachShader(v,F),t.deleteShader(x),t.deleteShader(F),z.push(v),v},bindTarget(T){t.bindFramebuffer(t.FRAMEBUFFER,T?T.framebuffer:null),t.viewport(0,0,T?T.width:c.w,T?T.height:c.h)},blit(T,g){t.useProgram(T),t.bindVertexArray(A),g?.(T),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null)},dispose(){for(let g of z)t.deleteProgram(g);for(let g of p.values())h(g);if(p.clear(),t.deleteBuffer(L),t.deleteVertexArray(A),n.isConnected)return;let T=t.getExtension("WEBGL_lose_context");T!==null&&typeof T.loseContext=="function"&&T.loseContext()}}}var ie=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function se(n,r){let t=new Float32Array(16);for(let e=0;e<4;e++)for(let a=0;a<4;a++){let o=0;for(let i=0;i<4;i++)o+=n[i*4+a]*r[e*4+i];t[e*4+a]=o}return t}var W=(n,r)=>[n[0]-r[0],n[1]-r[1],n[2]-r[2]],ae=(n,r)=>n[0]*r[0]+n[1]*r[1]+n[2]*r[2],X=(n,r)=>[n[1]*r[2]-n[2]*r[1],n[2]*r[0]-n[0]*r[2],n[0]*r[1]-n[1]*r[0]];function N(n){let r=Math.hypot(n[0],n[1],n[2]);return r===0?n:[n[0]/r,n[1]/r,n[2]/r]}function Re(n,r,t,e){let a=1/Math.tan(n/2);return new Float32Array([a/r,0,0,0,0,a,0,0,0,0,(e+t)/(t-e),-1,0,0,2*e*t/(t-e),0])}function Fe(n,r,t,e,a,o){let i=r-n,u=e-t,l=o-a;return new Float32Array([2/i,0,0,0,0,2/u,0,0,0,0,-2/l,0,-(r+n)/i,-(e+t)/u,-(o+a)/l,1])}function ue(n,r,t){let e=N(W(n,r)),a=X(t,e);if(Math.hypot(a[0],a[1],a[2])<1e-8)return ie();let o=N(a),i=X(e,o);return new Float32Array([o[0],i[0],e[0],0,o[1],i[1],e[1],0,o[2],i[2],e[2],0,-ae(o,n),-ae(i,n),-ae(e,n),1])}function dt(n){return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4)}function Ae(n){return n<=.0031308?n*12.92:1.055*Math.pow(n,1/2.4)-.055}var zt=/^#?([0-9a-fA-F]{6})$/;function $(n){let r=zt.exec(n.trim());if(!r)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(n)}`);let t=r[1];return[0,2,4].map(e=>dt(parseInt(t.slice(e,e+2),16)/255))}function ve(n){return`#${n.map(t=>{let e=Ae(Math.min(1,Math.max(0,t)));return Math.round(e*255).toString(16).padStart(2,"0")}).join("")}`}var j={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},Se=Object.freeze(Object.fromEntries(Object.keys(j).map(n=>[n,$(j[n])])));var mt=.4;var Me=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${mt.toFixed(2)}); }`,we=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function Le(){let n=[];for(let r of Object.keys(j)){let t=j[r].toLowerCase(),e=ve(Se[r]).toLowerCase();e!==t&&n.push({key:r,expected:t,actual:e})}return n}function Xt(n){let r=[1/0,1/0,1/0],t=[-1/0,-1/0,-1/0];for(let e=0;e<n.length;e+=3)for(let a=0;a<3;a++){let o=n[e+a];o<r[a]&&(r[a]=o),o>t[a]&&(t[a]=o)}return n.length===0?{min:[0,0,0],max:[0,0,0]}:{min:r,max:t}}function ht(n,r,t,e){let a=new Float32Array(n.length);for(let i=0;i<e.length;i+=3){let u=e[i],l=e[i+1],s=e[i+2],c=u*3,f=l*3,d=s*3,h=u*2,p=l*2,m=s*2,b=n[f]-n[c],R=n[f+1]-n[c+1],A=n[f+2]-n[c+2],L=n[d]-n[c],z=n[d+1]-n[c+1],oe=n[d+2]-n[c+2],T=t[p]-t[h],g=t[p+1]-t[h+1],y=t[m]-t[h],x=t[m+1]-t[h+1],F=T*x-y*g;if(Math.abs(F)<1e-12)continue;let v=1/F,K=(b*x-L*g)*v,xe=(R*x-z*g)*v,B=(A*x-oe*g)*v;for(let C of[c,f,d])a[C]=a[C]+K,a[C+1]=a[C+1]+xe,a[C+2]=a[C+2]+B}let o=new Float32Array(n.length);for(let i=0;i<o.length;i+=3){let u=r[i],l=r[i+1],s=r[i+2],c=a[i],f=a[i+1],d=a[i+2],h=c*u+f*l+d*s;c-=u*h,f-=l*h,d-=s*h;let p=Math.hypot(c,f,d);p<1e-8&&(Math.abs(u)<.9?(c=0,f=-s,d=l):(c=-s,f=0,d=u),p=Math.hypot(c,f,d)||1),o[i]=c/p,o[i+1]=f/p,o[i+2]=d/p}return o}function pt(n,r){let t=new Float32Array(n.length);for(let e=0;e<r.length;e+=3){let a=r[e]*3,o=r[e+1]*3,i=r[e+2]*3,u=n[o]-n[a],l=n[o+1]-n[a+1],s=n[o+2]-n[a+2],c=n[i]-n[a],f=n[i+1]-n[a+1],d=n[i+2]-n[a+2],h=l*d-s*f,p=s*c-u*d,m=u*f-l*c;for(let b of[a,o,i])t[b]=t[b]+h,t[b+1]=t[b+1]+p,t[b+2]=t[b+2]+m}for(let e=0;e<t.length;e+=3){let a=Math.hypot(t[e],t[e+1],t[e+2]);a>0&&(t[e]=t[e]/a,t[e+1]=t[e+1]/a,t[e+2]=t[e+2]/a)}return t}function _e(n,r,t,e,a){let{min:o,max:i}=Xt(n),u=e??pt(n,t);return{positions:n,normals:u,uvs:r,indices:t,min:o,max:i,tangents:a??ht(n,u,r,t)}}function De(n=1,r=1,t=1){let e=n/2,a=r/2,o=t/2,i=[[[-e,-a,o],[e,-a,o],[e,a,o],[-e,a,o]],[[e,-a,-o],[-e,-a,-o],[-e,a,-o],[e,a,-o]],[[e,-a,o],[e,-a,-o],[e,a,-o],[e,a,o]],[[-e,-a,-o],[-e,-a,o],[-e,a,o],[-e,a,-o]],[[-e,a,o],[e,a,o],[e,a,-o],[-e,a,-o]],[[-e,-a,-o],[e,-a,-o],[e,-a,o],[-e,-a,o]]],u=new Float32Array(72),l=new Float32Array(48),s=new Uint16Array(36),c=0,f=0,d=0,h=0;for(let p of i){for(let[m,b,R]of p)u[c++]=m,u[c++]=b,u[c++]=R;l[f++]=0,l[f++]=0,l[f++]=1,l[f++]=0,l[f++]=1,l[f++]=1,l[f++]=0,l[f++]=1,s[d++]=h,s[d++]=h+1,s[d++]=h+2,s[d++]=h,s[d++]=h+2,s[d++]=h+3,h+=4}return _e(u,l,s)}function Pe(n=10,r=24){let t=Math.max(1,Math.floor(r)),e=(t+1)*(t+1),a=new Float32Array(e*3),o=new Float32Array(e*3),i=new Float32Array(e*2),u=new Uint16Array(t*t*6),l=0,s=0,c=0;for(let f=0;f<=t;f++)for(let d=0;d<=t;d++){let h=(d/t-.5)*n,p=(f/t-.5)*n;a[l]=h,a[l+1]=0,a[l+2]=p,o[l]=0,o[l+1]=1,o[l+2]=0,l+=3,i[s++]=d/t,i[s++]=f/t}for(let f=0;f<t;f++)for(let d=0;d<t;d++){let h=f*(t+1)+d,p=h+1,m=h+(t+1),b=m+1;u[c++]=h,u[c++]=m,u[c++]=p,u[c++]=p,u[c++]=m,u[c++]=b}return _e(a,i,u,o)}function Ue(n=.5,r=24,t=32){let e=Math.max(2,r),a=Math.max(3,t),o=(e+1)*(a+1),i=new Float32Array(o*3),u=new Float32Array(o*3),l=new Float32Array(o*2),s=new Uint16Array(e*a*6),c=0,f=0,d=0;for(let h=0;h<=e;h++){let p=h/e*Math.PI;for(let m=0;m<=a;m++){let b=m/a*Math.PI*2,R=Math.sin(p)*Math.cos(b),A=Math.cos(p),L=Math.sin(p)*Math.sin(b);i[c]=R*n,i[c+1]=A*n,i[c+2]=L*n,u[c]=R,u[c+1]=A,u[c+2]=L,c+=3,l[f++]=m/a,l[f++]=h/e}}for(let h=0;h<e;h++)for(let p=0;p<a;p++){let m=h*(a+1)+p,b=m+1,R=m+(a+1),A=R+1;s[d++]=m,s[d++]=b,s[d++]=R,s[d++]=b,s[d++]=A,s[d++]=R}return _e(i,l,s,u)}function q(n){return n.indices.length/3}var bt=n=>[n.DEPTH_TEST,n.CULL_FACE,n.BLEND];function P(n){return[n.getParameter(n.FRAMEBUFFER_BINDING),n.getParameter(n.VIEWPORT),n.getParameter(n.DEPTH_WRITEMASK),bt(n).map(r=>n.getParameter(r))]}function U(n,r){n.bindFramebuffer(n.FRAMEBUFFER,r[0]);let t=r[1];n.viewport(t[0]??0,t[1]??0,t[2]??0,t[3]??0),n.depthMask(r[2]),bt(n).forEach((e,a)=>{r[3][a]?n.enable(e):n.disable(e)})}function Y(n,r){for(let t=r-1;t>=0;t--)n.activeTexture(n.TEXTURE0+t),n.bindTexture(n.TEXTURE_2D,null),n.bindTexture(n.TEXTURE_3D,null);n.activeTexture(n.TEXTURE0)}var Be=["minimum","reduced","full"],Ne={full:{dprScale:2,ao:!0,dof:!0,shadowMapSize:1536,shadowTaps:9,volumeLightSteps:6},reduced:{dprScale:2,ao:!0,dof:!1,shadowMapSize:1024,shadowTaps:9,volumeLightSteps:4},minimum:{dprScale:1,ao:!1,dof:!1,shadowMapSize:512,shadowTaps:1,volumeLightSteps:1}};function le(n,r){let t=Number.isFinite(r)&&r>0?r:1024,e=Ne[n].shadowMapSize/Ne.full.shadowMapSize,a=t*e,o=2**Math.round(Math.log2(a));return Math.max(256,Math.min(t,o))}function Ce(n){return{tier:n,...Ne[n]}}var Oe=89,Ge=Math.PI/180;function I(n){let r=Math.max(-Oe,Math.min(Oe,n.elevationDeg))*Ge,t=n.azimuthDeg*Ge,e=Math.max(1e-4,n.distance),a=Math.sin(r)*e,o=Math.cos(r)*e;return[n.target[0]+Math.sin(t)*o,n.target[1]+a,n.target[2]+Math.cos(t)*o]}function J(n,r){let t=I(n),e=n.near??Math.max(.01,n.distance/100),a=n.far??Math.max(e+1,n.distance*8),o=Re((n.fovDeg??38)*Ge,Math.max(.001,r),e,a),i=ue(t,n.target,[0,1,0]);return se(o,i)}function Ie(n,r,t){let e=N(n.direction),a=n.extent??Math.max(.1,t*1.35),o=Math.max(1,t*2),i=[r[0]-e[0]*o,r[1]-e[1]*o,r[2]-e[2]*o],u=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],l=ue(i,r,u),s=Fe(-a,a,-a,a,.01,o+t*2+a);return se(s,l)}function ke(n,r){let t=W([r[0],r[1],r[2]],[n[0],n[1],n[2]]);return Math.hypot(t[0],t[1],t[2])/2}function Ve(n,r){return[(n[0]+r[0])/2,(n[1]+r[1])/2,(n[2]+r[2])/2]}function He(n,r,t){let{gl:e}=n,a=Math.max(1,Math.floor(r)),o=Math.max(1,Math.floor(t)),i=e.createFramebuffer(),u=e.createTexture(),l=e.createTexture();if(!i||!u||!l)return w("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let s=n.hdr?e.RGBA16F:e.RGBA8,c=n.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,f=()=>{e.bindTexture(e.TEXTURE_2D,u),e.texImage2D(e.TEXTURE_2D,0,s,a,o,0,e.RGBA,c,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,l),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,a,o,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,u,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,l,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};f(),e.bindFramebuffer(e.FRAMEBUFFER,i);let d=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),d!==e.FRAMEBUFFER_COMPLETE?w("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${d.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:u,depthTexture:l,get width(){return a},get height(){return o},bind(){e.bindFramebuffer(e.FRAMEBUFFER,i),e.viewport(0,0,a,o)},resize(h,p){let m=Math.max(1,Math.floor(h)),b=Math.max(1,Math.floor(p));m===a&&b===o||(a=m,o=b,f())},dispose(){e.deleteFramebuffer(i),e.deleteTexture(u),e.deleteTexture(l)}}}function ze(n,r=1024){let{gl:t}=n,e=Math.max(256,Math.min(2048,Math.floor(r))),a=t.createFramebuffer(),o=t.createTexture();if(!a||!o)return w("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");t.bindTexture(t.TEXTURE_2D,o),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,e,e,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,a),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,o,0);let i=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),i!==t.FRAMEBUFFER_COMPLETE?w("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:a,depthTexture:o,size:e,bind(){t.bindFramebuffer(t.FRAMEBUFFER,a),t.viewport(0,0,e,e)},dispose(){t.deleteFramebuffer(a),t.deleteTexture(o)}}}var fe=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,ce={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function de(n,r,t={}){let e=t.zenith??ce.zenith,a=t.horizon??ce.horizon,o=t.ground??ce.ground;n.uniform3f(n.getUniformLocation(r,"uSkyZenith"),e[0],e[1],e[2]),n.uniform3f(n.getUniformLocation(r,"uSkyHorizon"),a[0],a[1],a[2]),n.uniform3f(n.getUniformLocation(r,"uSkyGround"),o[0],o[1],o[2])}var Wt=`#version 300 es
precision highp float;
out vec2 vNdc;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`,jt=`#version 300 es
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
}`;function Xe(n){let{gl:r}=n,t=n.compile(Wt,jt);return"kind"in t?t:{draw(e){let a=N(W(e.target,e.eye)),o=Math.abs(a[1])>.999?[0,0,1]:[0,1,0],i=N(X(a,o)),u=N(X(i,a)),l=P(r);r.disable(r.DEPTH_TEST),r.depthMask(!1),r.disable(r.BLEND),r.useProgram(t),r.uniform3f(r.getUniformLocation(t,"uRight"),i[0],i[1],i[2]),r.uniform3f(r.getUniformLocation(t,"uUp"),u[0],u[1],u[2]),r.uniform3f(r.getUniformLocation(t,"uForward"),a[0],a[1],a[2]),r.uniform1f(r.getUniformLocation(t,"uTanHalfFov"),Math.tan(e.fovDeg*Math.PI/360)),r.uniform1f(r.getUniformLocation(t,"uAspect"),Math.max(.001,e.aspect)),de(r,t,e.sky),n.blit(t),U(r,l)},dispose(){r.deleteProgram(t)}}}var Et=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,We=`#version 300 es
precision highp float;
void main(){}`,$t=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,Tt=`#version 300 es
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
}`,xt=`#version 300 es
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
${fe}

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
}`;function je(n,r){let{gl:t}=n,e=t.createVertexArray(),a=t.createBuffer(),o=t.createBuffer(),i=t.createBuffer(),u=t.createBuffer();return!e||!a||!o||!i||!u?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(t.bindVertexArray(e),t.bindBuffer(t.ARRAY_BUFFER,a),t.bufferData(t.ARRAY_BUFFER,r.positions,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,r.normals,t.STATIC_DRAW),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,i),t.bufferData(t.ARRAY_BUFFER,r.tangents,t.STATIC_DRAW),t.enableVertexAttribArray(2),t.vertexAttribPointer(2,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,u),t.bufferData(t.ELEMENT_ARRAY_BUFFER,r.indices,t.STATIC_DRAW),t.bindVertexArray(null),{vao:e,indexCount:r.indices.length,indexType:r.indices instanceof Uint32Array?t.UNSIGNED_INT:t.UNSIGNED_SHORT,dispose(){t.deleteVertexArray(e),t.deleteBuffer(a),t.deleteBuffer(o),t.deleteBuffer(i),t.deleteBuffer(u)}})}function $e(n){let{gl:r}=n,t=n.compile(Et,We);if("kind"in t)return t;let e=n.compile(Tt,xt);if("kind"in e)return e;let a=n.compile($t,We);if("kind"in a)return a;let o=(i,u)=>r.getUniformLocation(i,u);return{shadowPass(i,u,l,s){let c=P(r),f=s??(()=>{});l.bind(),f("shadow.bind"),r.clear(r.DEPTH_BUFFER_BIT),r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.FRONT),r.useProgram(t),f("useProgram(shadow)"),r.uniformMatrix4fv(o(t,"uLightVP"),!1,i),f("uLightVP");for(let d of u)r.uniformMatrix4fv(o(t,"uModel"),!1,d.model),f("shadow uModel"),r.bindVertexArray(d.mesh.vao),f("shadow bindVAO"),r.drawElements(r.TRIANGLES,d.mesh.indexCount,d.mesh.indexType,0),f("shadow drawElements");r.bindVertexArray(null),r.cullFace(r.BACK),U(r,c)},depthPrepass(i,u){let l=P(r);r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.colorMask(!1,!1,!1,!1),r.useProgram(a),r.uniformMatrix4fv(o(a,"uViewProj"),!1,i);for(let s of u)r.uniformMatrix4fv(o(a,"uModel"),!1,s.model),r.bindVertexArray(s.mesh.vao),r.drawElements(r.TRIANGLES,s.mesh.indexCount,s.mesh.indexType,0);r.bindVertexArray(null),r.colorMask(!0,!0,!0,!0),U(r,l)},draw(i){let u=P(r),l=i.onStep??(()=>{});if(r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.useProgram(e),r.uniformMatrix4fv(o(e,"uViewProj"),!1,i.viewProj),l("uViewProj"),r.uniform3fv(o(e,"uEye"),i.eye),l("uEye"),r.uniform3fv(o(e,"uLightDir"),i.lightDir),l("uLightDir"),r.uniform3fv(o(e,"uLightColour"),i.lightColour),l("uLightColour"),r.uniform1f(o(e,"uAmbientGain"),i.ambientGain??1),l("uAmbientGain"),i.fog&&i.fog.density>0){r.uniform1f(o(e,"uFogDensity"),i.fog.density),r.uniform1f(o(e,"uFogHeight"),i.fog.height),r.uniform1f(o(e,"uFogFloor"),i.fog.floor??0);let s=i.fog.colour;s==="sky"?r.uniform3f(o(e,"uFogColour"),-1,-1,-1):r.uniform3f(o(e,"uFogColour"),s[0],s[1],s[2]),l("fog")}else r.uniform1f(o(e,"uFogDensity"),0);if(de(r,e,i.sky),l("bindSky"),i.ao&&i.screenSize?(r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,i.ao),r.uniform1i(o(e,"uAO"),1),r.uniform2f(o(e,"uScreenSize"),i.screenSize[0],i.screenSize[1]),r.uniform1f(o(e,"uAOEnabled"),1)):r.uniform1f(o(e,"uAOEnabled"),0),l("bindAO"),r.uniformMatrix4fv(o(e,"uLightVP"),!1,i.lightVP),l("lit uLightVP"),i.shadow){r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,i.shadow.depthTexture),r.uniform1i(o(e,"uShadowMap"),0),r.uniform1f(o(e,"uShadowTexel"),1/i.shadow.size),r.uniform1f(o(e,"uShadowStrength"),i.shadowStrength??1),r.uniform1i(o(e,"uShadowTaps"),(i.shadowTaps??9)>=9?9:1);let s=i.shadowBaseline,c=s&&s>0&&i.shadow.size>0?s/i.shadow.size:1;r.uniform1f(o(e,"uShadowBiasScale"),Number.isFinite(c)&&c>0?c:1)}else r.uniform1f(o(e,"uShadowStrength"),0);for(let s of i.draws)r.uniformMatrix4fv(o(e,"uModel"),!1,s.model),r.uniformMatrix3fv(o(e,"uNormalMat"),!1,s.normalMat),l("uNormalMat"),r.uniform3fv(o(e,"uBaseColour"),s.material.baseColour),l("uBaseColour"),r.uniform1f(o(e,"uRoughness"),s.material.roughness),r.uniform1f(o(e,"uMetalness"),s.material.metalness),r.uniform1f(o(e,"uAnisotropy"),s.material.anisotropy??0),r.bindVertexArray(s.mesh.vao),l("lit bindVAO"),r.drawElements(r.TRIANGLES,s.mesh.indexCount,s.mesh.indexType,0),l("lit drawElements");r.bindVertexArray(null),Y(r,2),U(r,u)},dispose(){r.deleteProgram(t),r.deleteProgram(e),r.deleteProgram(a)}}}var Z=`
uniform sampler2D uDepth;
uniform vec2 uNearFar;

float linearDepthAt(vec2 uv) {
  float d = texture(uDepth, uv).r * 2.0 - 1.0;
  float n = uNearFar.x, f = uNearFar.y;
  return (2.0 * n * f) / (f + n - d * (f - n));
}`,yt=`
uniform float uTanHalfFov;
uniform float uAspect;

vec3 viewPosAt(vec2 uv) {
  float z = linearDepthAt(uv);
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x * uTanHalfFov * uAspect * z, ndc.y * uTanHalfFov * z, -z);
}`,Rt=Z+yt,gt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Yt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${Rt}

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
}`,Qt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${Z}

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
}`;function Ye(n,r,t){let{gl:e}=n,a=n.compile(gt,Yt);if("kind"in a)return a;let o=n.compile(gt,Qt);if("kind"in o)return o;let i=Math.max(1,r>>1),u=Math.max(1,t>>1),l=()=>{let m=e.createFramebuffer(),b=e.createTexture();return!m||!b?null:{fb:m,tex:b}},s=l(),c=l();if(!s||!c)return w("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let f=()=>{for(let m of[s,c])e.bindTexture(e.TEXTURE_2D,m.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,i,u,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,m.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,m.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};f(),e.bindFramebuffer(e.FRAMEBUFFER,s.fb);let d=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),d!==e.FRAMEBUFFER_COMPLETE)return w("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${d.toString(16)}).`);let h=(m,b,R,A,L)=>{e.activeTexture(e.TEXTURE0+L),e.bindTexture(e.TEXTURE_2D,b),e.uniform1i(e.getUniformLocation(m,"uDepth"),L),e.uniform2f(e.getUniformLocation(m,"uNearFar"),R,A)},p=(m,b,R,A,L,z,oe)=>{h(m,b,R,A,oe),e.uniform1f(e.getUniformLocation(m,"uTanHalfFov"),Math.tan(L*Math.PI/360)),e.uniform1f(e.getUniformLocation(m,"uAspect"),z)};return{get texture(){return s.tex},get width(){return i},get height(){return u},compute(m){let b=P(e);e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,s.fb),e.viewport(0,0,i,u),e.useProgram(a),p(a,m.depthTexture,m.near,m.far,m.fovDeg,m.aspect,0),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/i,1/u),e.uniform1f(e.getUniformLocation(a,"uRadius"),m.radius??.55),e.uniform1f(e.getUniformLocation(a,"uStrength"),m.strength??1.15),e.uniform1f(e.getUniformLocation(a,"uBias"),m.bias??.035),n.blit(a);for(let[R,A,L]of[[s,c,[1,0]],[c,s,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,A.fb),e.viewport(0,0,i,u),e.useProgram(o),h(o,m.depthTexture,m.near,m.far,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,R.tex),e.uniform1i(e.getUniformLocation(o,"uAO"),1),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/i,1/u),e.uniform2f(e.getUniformLocation(o,"uDir"),L[0],L[1]),n.blit(o);Y(e,2),U(e,b)},resize(m,b){let R=Math.max(1,m>>1),A=Math.max(1,b>>1);R===i&&A===u||(i=R,u=A,f())},dispose(){e.deleteProgram(a),e.deleteProgram(o);for(let m of[s,c])e.deleteFramebuffer(m.fb),e.deleteTexture(m.tex)}}}var Kt=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,qt=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uFocusDistance;
uniform float uAperture;
uniform float uMaxCoc;
out vec4 frag;
${Z}

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
}`;function Qe(n,r,t){let{gl:e}=n,a=n.compile(Kt,qt);if("kind"in a)return a;let o=Math.max(1,Math.floor(r)),i=Math.max(1,Math.floor(t)),u=e.createFramebuffer(),l=e.createTexture();if(!u||!l)return w("FRAMEBUFFER_INCOMPLETE","The GPU refused a depth-of-field buffer.");let s=()=>{e.bindTexture(e.TEXTURE_2D,l);let f=n.hdr?e.RGBA16F:e.RGBA8,d=n.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE;e.texImage2D(e.TEXTURE_2D,0,f,o,i,0,e.RGBA,d,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,u),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,l,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};s(),e.bindFramebuffer(e.FRAMEBUFFER,u);let c=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),c!==e.FRAMEBUFFER_COMPLETE?w("FRAMEBUFFER_INCOMPLETE",`The DOF buffer is incomplete (0x${c.toString(16)}).`):{texture:l,apply(f){let d=P(e);e.bindFramebuffer(e.FRAMEBUFFER,u),e.viewport(0,0,o,i),e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.useProgram(a),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,f.scene),e.uniform1i(e.getUniformLocation(a,"uScene"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,f.depthTexture),e.uniform1i(e.getUniformLocation(a,"uDepth"),1),e.uniform2f(e.getUniformLocation(a,"uNearFar"),f.near,f.far),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/o,1/i),e.uniform1f(e.getUniformLocation(a,"uFocusDistance"),f.focusDistance),e.uniform1f(e.getUniformLocation(a,"uAperture"),f.aperture??12),e.uniform1f(e.getUniformLocation(a,"uMaxCoc"),f.maxCoc??.012),n.blit(a),Y(e,2),U(e,d)},resize(f,d){let h=Math.max(1,Math.floor(f)),p=Math.max(1,Math.floor(d));h===o&&p===i||(o=h,i=p,s())},dispose(){e.deleteProgram(a),e.deleteFramebuffer(u),e.deleteTexture(l)}}}var Jt=`
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
`;function O(n){return String(n).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function Ft(n){let r=document.createElement("style");r.textContent=Jt,document.head.appendChild(r);let t=document.createElement("section");t.id="lcx-fallback",t.setAttribute("aria-label",`${n.title} \u2014 flat view`),t.setAttribute("tabindex","-1"),document.getElementById("log")?.setAttribute("aria-hidden","true");let e=(o,i)=>o===null?`<td class="absent${i?" n":""}">absent</td>`:`<td class="${i?"n":""}">${O(o)}</td>`;t.innerHTML=`<h2>${O(n.title)} \u2014 flat view</h2><p class="reads">${O(n.readsAs)}</p>`+(n.notices??[]).map(o=>`<p class="notice">${O(o)}</p>`).join("")+'<div id="lcx-refusal" role="alert"></div>'+(n.html?`<div class="surface">${n.html}</div>`:`<table><caption>${O(n.title)} \u2014 flat view</caption><thead><tr>`+n.columns.map(o=>`<th scope="col" class="${o.numeric?"n":""}">${O(o.label)}</th>`).join("")+"</tr></thead><tbody>"+n.rows.map(o=>"<tr>"+n.columns.map(i=>e(o[i.key]??null,!!i.numeric)).join("")+"</tr>").join("")+"</tbody></table>"),document.body.appendChild(t);function a(o,i){let u=document.getElementById("lcx-refusal");u&&(u.innerHTML=`<p class="refusal"><strong>${O(o)}</strong> \u2014 ${O(i)} The measurements below are unaffected.</p>`),delete t.dataset.rendered;for(let l of Array.from(document.querySelectorAll("canvas")))l.style.display="none";t.focus({preventScroll:!0})}return document.addEventListener("webglcontextlost",o=>{o.preventDefault(),a("CONTEXT_LOST","The GPU dropped the WebGL context for this page mid-session.")},!0),{markRendered(){t.dataset.rendered="1"},showRefusal:a}}var H=new URLSearchParams(location.search),it=Be.includes(H.get("tier")??"")?H.get("tier"):"full",Q=Ce(it),tt=[],Lt=[];function st(n,r,t,e){let a=H.get(n);if(a===null)return r;let o=Number(a);if(!Number.isFinite(o))return tt.push(`${n}=${a}`),r;let i=Math.max(t,Math.min(e,o));return i!==o&&Lt.push(`${n}=${a} used as ${i}`),i}var ut=st("scale",1,1,3),S=1280*ut,M=800*ut,rt=Math.trunc(st("frames",600,1,2e4)),_t=Math.trunc(st("repeat",1,1,64)),lt=H.get("diag")==="1",Zt=H.get("refuse")==="1",ct=document.getElementById("c");ct.width=S;ct.height=M;function Te(n){document.title="REFUSED";let r=document.getElementById("log");r&&(r.textContent=n);let[t,...e]=n.split(":");throw Dt?.showRefusal(t?.trim()??"REFUSED",e.join(":").trim()||n),new Error(n)}var Dt=null;function G(n,r){return"kind"in r&&Te(`${n}: ${r.code} \u2014 ${r.reason} ${r.detail??""}`),r}var Pt=Ft({title:"E0 \xB7 The Spike \u2014 material study",readsAs:"The rendered view is the evidence: GGX with a Smith visibility term, a shadow map, ambient occlusion and a gathered depth of field, at a measured cost. The table below states what each surface in that frame is set to, which is what the capture is evidence for.",notices:["A study, not a data surface \u2014 there is no measurement in this frame to lose."],columns:[{key:"object",label:"Object"},{key:"hex",label:"Base colour"},{key:"roughness",label:"Roughness",numeric:!0},{key:"metalness",label:"Metalness",numeric:!0}],rows:[{object:"Deck plate",hex:"#0E1628",roughness:.82,metalness:0},{object:"Brand-blue dielectric sphere",hex:"#2C6BFF",roughness:.34,metalness:.05},{object:"Metal sphere",hex:"#C9D4E4",roughness:lt?.045:.18,metalness:.92}]});Dt=Pt;tt.length>0&&Te(`BAD_PARAM: ${tt.join(", ")} \u2014 not a number, so the view was not drawn rather than drawn at a nonsensical size. Nothing about the underlying measurements has changed; correct the URL and reload.`);Zt&&Te("FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. The three-dimensional view is not being drawn.");var me=ye(ct,{alpha:!1});ge(me)||Te(`stage: ${me.code} \u2014 ${me.reason}`);var D=me,E=D.gl,er=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,tr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${Me}
${we}
void main(){
  vec3 c = texture(uScene, vUv).rgb;
  frag = vec4(lcxEncode(lcxToneMap(c)), 1.0);
}`,rr=G("present",D.compile(er,tr)),ee=G("lit",$e(D)),V=G("target",He(D,S,M)),re=G("shadow",ze(D,le(it,1024))),Ut=G("skyBox",Xe(D)),At=G("ao",Ye(D,S,M)),vt=G("dof",Qe(D,S,M)),Nt=Pe(14,24),Bt=De(1.4,1.4,1.4),Ct=Ue(.75,32,48),Ke=[Nt,Bt,Ct].map((n,r)=>G(`mesh ${r}`,je(D,n))),qe=(n,r,t)=>{let e=ie();return e[12]=n,e[13]=r,e[14]=t,e},Je=new Float32Array([1,0,0,0,1,0,0,0,1]),te=[{mesh:Ke[0],model:qe(0,0,0),normalMat:Je,material:{baseColour:$("#0E1628"),roughness:.82,metalness:0}},{mesh:Ke[1],model:qe(-1.15,.7,0),normalMat:Je,material:{baseColour:$("#2C6BFF"),roughness:.34,metalness:.05}},{mesh:Ke[2],model:qe(1.15,.75,.3),normalMat:Je,material:{baseColour:$("#C9D4E4"),roughness:lt?.045:.18,metalness:.92}}],ne={direction:[-.45,-1,-.35],colour:[3.4,3.3,3.05]},Ot=[-7,0,-7],Gt=[7,2.2,7],nr=Ve(Ot,Gt),St=ke(Ot,Gt),he=Ie({...ne,extent:St*.8},nr,St),_={target:[0,.6,0],distance:7.2,azimuthDeg:34,elevationDeg:22,fovDeg:36},pe=H.get("ao")!=="0"&&Q.ao,nt=H.get("dof")!=="0"&&Q.dof,or={zenith:[1.6,.05,.05],horizon:[.05,.08,1.6],ground:[.05,1.2,.05]},be=lt?or:void 0;function Ee(){let n=J(_,S/M),r=I(_);ee.shadowPass(he,te,re),V.bind(),E.clear(E.DEPTH_BUFFER_BIT),Ut.draw({eye:r,target:_.target,fovDeg:_.fovDeg??36,aspect:S/M,sky:be});let t=Math.max(.01,_.distance/100),e=Math.max(t+1,_.distance*8);ee.depthPrepass(n,te),pe&&(At.compute({depthTexture:V.depthTexture,near:t,far:e,fovDeg:_.fovDeg??36,aspect:S/M,radius:.6,strength:1.25}),V.bind());for(let o=0;o<_t;o++)ee.draw({viewProj:n,eye:r,lightDir:ne.direction,lightColour:ne.colour,ambientGain:1,sky:be,lightVP:he,shadow:re,shadowStrength:.92,shadowTaps:Q.shadowTaps,shadowBaseline:1024,draws:te,ao:pe?At.texture:null,screenSize:[S,M]});let a=V.texture;if(nt){let o=Math.hypot(r[0]-1.15,r[1]-.75,r[2]-.3);vt.apply({scene:V.texture,depthTexture:V.depthTexture,near:t,far:e,fovDeg:_.fovDeg??36,aspect:S/M,focusDistance:o,aperture:9,maxCoc:.01}),a=vt.texture}E.bindFramebuffer(E.FRAMEBUFFER,null),E.viewport(0,0,S,M),E.disable(E.DEPTH_TEST),E.activeTexture(E.TEXTURE0),E.bindTexture(E.TEXTURE_2D,a),D.blit(rr,o=>E.uniform1i(E.getUniformLocation(o,"uScene"),0))}Ee();var Mt=4e3;function ar(n){let r=new Uint8Array(4),t=performance.now();Ee(),E.readPixels(0,0,1,1,E.RGBA,E.UNSIGNED_BYTE,r);let e=Math.max(.01,performance.now()-t),a=Math.min(n,Math.max(1,Math.floor(Mt/e))),o=performance.now(),i=0;for(let u=0;u<a&&(Ee(),i++,!(performance.now()-o>Mt));u++);return E.readPixels(0,0,1,1,E.RGBA,E.UNSIGNED_BYTE,r),{msPerFrame:(performance.now()-o)/i,measured:i}}var k=(()=>{let n=0;for(let s=0,c=E.getError();s<32&&c!==E.NO_ERROR;s++,c=E.getError())n=c;let r=[],t=s=>{let c=E.getError();c!==E.NO_ERROR&&r.push(`${s}=0x${c.toString(16)}`)};ee.shadowPass(he,te,re,t),V.bind(),t("target.bind"),E.clear(E.DEPTH_BUFFER_BIT),t("clear"),Ut.draw({eye:I(_),target:_.target,fovDeg:_.fovDeg??36,aspect:S/M,sky:be}),t("sky"),ee.draw({viewProj:J(_,S/M),eye:I(_),lightDir:ne.direction,lightColour:ne.colour,ambientGain:1,sky:be,lightVP:he,shadow:re,shadowStrength:.92,shadowTaps:Q.shadowTaps,shadowBaseline:1024,draws:te,onStep:t});let e=E.getError(),a=E.getParameter(E.IMPLEMENTATION_COLOR_READ_FORMAT),o=E.getParameter(E.IMPLEMENTATION_COLOR_READ_TYPE),i=s=>{let c=s&32768?-1:1,f=s>>10&31,d=s&1023;return f===0?c*d*2**-24:f===31?d===0?c*(1/0):NaN:c*(1+d/1024)*2**(f-15)},u;if(o===E.HALF_FLOAT){let s=new Uint16Array(4);E.readPixels(S>>1,M>>2,1,1,a,o,s),u=Array.from(s,c=>Number(i(c).toFixed(4)))}else if(o===E.FLOAT){let s=new Float32Array(4);E.readPixels(S>>1,M>>2,1,1,a,o,s),u=Array.from(s,c=>Number(c.toFixed(4)))}else{let s=new Uint8Array(4);E.readPixels(S>>1,M>>2,1,1,a,o,s),u=Array.from(s)}let l=E.getError();return{centre:u,afterDraw:e,afterRead:l,bad:r,drained:n,readFormat:a,readType:o}})(),ir=q(Nt)+q(Bt)+q(Ct),ot=ar(rt),Ze=ot.msPerFrame,wt=(()=>{let n=J(_,S/M),r=-1.15,t=1.4,e=0,a=n[0]*r+n[4]*t+n[8]*e+n[12],o=n[1]*r+n[5]*t+n[9]*e+n[13],i=n[3]*r+n[7]*t+n[11]*e+n[15];return{ndc:[Number((a/i).toFixed(3)),Number((o/i).toFixed(3))],w:Number(i.toFixed(3))}})(),at=Le();if(at.length>0){let n="BRAND FIDELITY FAILED \u2014 "+at.map(t=>`${t.key}: expected ${t.expected}, got ${t.actual}`).join("; ");document.title="REFUSED";let r=document.getElementById("log");throw r&&(r.textContent=n),new Error(n)}var It=(()=>{let n=E.getExtension("WEBGL_debug_renderer_info");return n?String(E.getParameter(n.UNMASKED_RENDERER_WEBGL)):"unknown"})(),et=/swiftshader|llvmpipe|software/i.test(It),kt={ao:pe,dof:nt,tier:Q.tier,tierDprScale:Q.dprScale,tierShadowMapSize:le(it,1024),shadowBaseline:1024,glError:E.getError(),glDuringSetup:k.drained,brandFidelity:at,hdr:D.hdr,eye:I(_).map(n=>Number(n.toFixed(2))),boxTopNdc:wt.ndc,boxTopW:wt.w,targetCentre:k.centre,targetReadFormat:`0x${k.readFormat.toString(16)}`,targetReadType:`0x${k.readType.toString(16)}`,failingCalls:k.bad,glAfterDraw:k.afterDraw,glAfterRead:k.afterRead,triangles:ir,shadowMap:re.size,resolution:`${S}x${M}`,dprScale:ut,aoEnabled:pe,dofEnabled:nt,frames:ot.measured,framesRequested:rt,sweepTruncated:ot.measured<rt,repeat:_t,paramClamps:Lt,msPerFrame:Number(Ze.toFixed(3)),fps:Math.round(1e3/Ze),renderer:It,rendererClass:et?"software":"hardware",headroom:et?null:Number((16.6-Ze).toFixed(3)),headroomRefusal:et?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null};globalThis.E0=kt;document.getElementById("log").textContent=JSON.stringify(kt,null,2);Ee();Pt.markRendered();document.title="READY";

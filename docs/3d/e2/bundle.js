var _t={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected."};function S(r,n){return n===void 0?{kind:"refused",code:r,reason:_t[r]}:{kind:"refused",code:r,reason:_t[r],detail:n}}function _e(r){return r.kind==="stage"}function we(r,n={}){let t=r.getContext("webgl2",{antialias:n.antialias??!1,alpha:n.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!t)return S("NO_WEBGL2");let e=t.getExtension("EXT_color_buffer_float"),o=r.width,a=r.height,i=e?t.RGBA16F:t.RGBA8,s=e?t.HALF_FLOAT:t.UNSIGNED_BYTE,c=(b,A)=>{let F=t.createTexture();t.bindTexture(t.TEXTURE_2D,F),t.texImage2D(t.TEXTURE_2D,0,i,b,A,0,t.RGBA,s,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);let M=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,M),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,F,0);let v=t.checkFramebufferStatus(t.FRAMEBUFFER);return v!==t.FRAMEBUFFER_COMPLETE?S("FRAMEBUFFER_INCOMPLETE",`status 0x${v.toString(16)} at ${b}\xD7${A}`):{texture:F,framebuffer:M,width:b,height:A}},d=n.bloomShift??2,m={w:o,h:a},l=c(o,a);if("kind"in l)return l;let f=c(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in f)return f;let h=c(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in h)return h;let u=t.createVertexArray();t.bindVertexArray(u);let p=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,p),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null);let E=[];return{kind:"stage",gl:t,cssWidth:r.clientWidth||o,cssHeight:r.clientHeight||a,hdr:!!e,get width(){return m.w},get height(){return m.h},get scene(){return l},get bloomA(){return f},get bloomB(){return h},setRegion(b,A){let F=Math.max(1,Math.round(b)),M=Math.max(1,Math.round(A));if(!(F===m.w&&M===m.h)){m={w:F,h:M};for(let v of[l,f,h])"kind"in v||(t.deleteFramebuffer(v.framebuffer),t.deleteTexture(v.texture));l=c(F,M),f=c(Math.max(1,F>>d),Math.max(1,M>>d)),h=c(Math.max(1,F>>d),Math.max(1,M>>d))}},compile(b,A){let F=(G,g)=>{let T=t.createShader(G);return t.shaderSource(T,g),t.compileShader(T),t.getShaderParameter(T,t.COMPILE_STATUS)?T:S("SHADER_COMPILE_FAILED",t.getShaderInfoLog(T)??"(no log)")},M=F(t.VERTEX_SHADER,b);if(typeof M=="object"&&"kind"in M)return M;let v=F(t.FRAGMENT_SHADER,A);if(typeof v=="object"&&"kind"in v)return v;let L=t.createProgram();return t.attachShader(L,M),t.attachShader(L,v),t.linkProgram(L),t.getProgramParameter(L,t.LINK_STATUS)?(E.push(L),L):S("PROGRAM_LINK_FAILED",t.getProgramInfoLog(L)??"(no log)")},bindTarget(b){t.bindFramebuffer(t.FRAMEBUFFER,b?b.framebuffer:null),t.viewport(0,0,b?b.width:m.w,b?b.height:m.h)},blit(b,A){t.useProgram(b),t.bindVertexArray(u),A?.(b),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null)},dispose(){for(let b of E)t.deleteProgram(b);for(let b of[l,f,h])"kind"in b||(t.deleteFramebuffer(b.framebuffer),t.deleteTexture(b.texture));t.deleteBuffer(p),t.deleteVertexArray(u)}}}var J=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function me(r,n){let t=new Float32Array(16);for(let e=0;e<4;e++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=r[i*4+o]*n[e*4+i];t[e*4+o]=a}return t}var W=(r,n)=>[r[0]-n[0],r[1]-n[1],r[2]-n[2]],ce=(r,n)=>r[0]*n[0]+r[1]*n[1]+r[2]*n[2],j=(r,n)=>[r[1]*n[2]-r[2]*n[1],r[2]*n[0]-r[0]*n[2],r[0]*n[1]-r[1]*n[0]];function O(r){let n=Math.hypot(r[0],r[1],r[2]);return n===0?r:[r[0]/n,r[1]/n,r[2]/n]}function De(r,n,t,e){let o=1/Math.tan(r/2);return new Float32Array([o/n,0,0,0,0,o,0,0,0,0,(e+t)/(t-e),-1,0,0,2*e*t/(t-e),0])}function Ue(r,n,t,e,o,a){let i=n-r,s=e-t,c=a-o;return new Float32Array([2/i,0,0,0,0,2/s,0,0,0,0,-2/c,0,-(n+r)/i,-(e+t)/s,-(a+o)/c,1])}function fe(r,n,t){let e=O(W(r,n)),o=j(t,e);if(Math.hypot(o[0],o[1],o[2])<1e-8)return J();let a=O(o),i=j(e,a);return new Float32Array([a[0],i[0],e[0],0,a[1],i[1],e[1],0,a[2],i[2],e[2],0,-ce(a,r),-ce(i,r),-ce(e,r),1])}function wt(r){return r<=.04045?r/12.92:Math.pow((r+.055)/1.055,2.4)}function Pe(r){return r<=.0031308?r*12.92:1.055*Math.pow(r,1/2.4)-.055}var pr=/^#?([0-9a-fA-F]{6})$/;function I(r){let n=pr.exec(r.trim());if(!n)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(r)}`);let t=n[1];return[0,2,4].map(e=>wt(parseInt(t.slice(e,e+2),16)/255))}function Ne(r){return`#${r.map(t=>{let e=Pe(Math.min(1,Math.max(0,t)));return Math.round(e*255).toString(16).padStart(2,"0")}).join("")}`}var Y={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},Be=Object.freeze(Object.fromEntries(Object.keys(Y).map(r=>[r,I(Y[r])])));var Dt=.4;var Ce=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${Dt.toFixed(2)}); }`,Oe=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function Ie(){let r=[];for(let n of Object.keys(Y)){let t=Y[n].toLowerCase(),e=Ne(Be[n]).toLowerCase();e!==t&&r.push({key:n,expected:t,actual:e})}return r}function br(r){let n=[1/0,1/0,1/0],t=[-1/0,-1/0,-1/0];for(let e=0;e<r.length;e+=3)for(let o=0;o<3;o++){let a=r[e+o];a<n[o]&&(n[o]=a),a>t[o]&&(t[o]=a)}return r.length===0?{min:[0,0,0],max:[0,0,0]}:{min:n,max:t}}function Ut(r,n,t,e){let o=new Float32Array(r.length);for(let i=0;i<e.length;i+=3){let s=e[i],c=e[i+1],d=e[i+2],m=s*3,l=c*3,f=d*3,h=s*2,u=c*2,p=d*2,E=r[l]-r[m],x=r[l+1]-r[m+1],b=r[l+2]-r[m+2],A=r[f]-r[m],F=r[f+1]-r[m+1],M=r[f+2]-r[m+2],v=t[u]-t[h],L=t[u+1]-t[h+1],G=t[p]-t[h],g=t[p+1]-t[h+1],T=v*g-G*L;if(Math.abs(T)<1e-12)continue;let y=1/T,D=(E*g-A*L)*y,C=(x*g-F*L)*y,P=(b*g-M*L)*y;for(let _ of[m,l,f])o[_]=o[_]+D,o[_+1]=o[_+1]+C,o[_+2]=o[_+2]+P}let a=new Float32Array(r.length);for(let i=0;i<a.length;i+=3){let s=n[i],c=n[i+1],d=n[i+2],m=o[i],l=o[i+1],f=o[i+2],h=m*s+l*c+f*d;m-=s*h,l-=c*h,f-=d*h;let u=Math.hypot(m,l,f);u<1e-8&&(Math.abs(s)<.9?(m=0,l=-d,f=c):(m=-d,l=0,f=s),u=Math.hypot(m,l,f)||1),a[i]=m/u,a[i+1]=l/u,a[i+2]=f/u}return a}function Pt(r,n){let t=new Float32Array(r.length);for(let e=0;e<n.length;e+=3){let o=n[e]*3,a=n[e+1]*3,i=n[e+2]*3,s=r[a]-r[o],c=r[a+1]-r[o+1],d=r[a+2]-r[o+2],m=r[i]-r[o],l=r[i+1]-r[o+1],f=r[i+2]-r[o+2],h=c*f-d*l,u=d*m-s*f,p=s*l-c*m;for(let E of[o,a,i])t[E]=t[E]+h,t[E+1]=t[E+1]+u,t[E+2]=t[E+2]+p}for(let e=0;e<t.length;e+=3){let o=Math.hypot(t[e],t[e+1],t[e+2]);o>0&&(t[e]=t[e]/o,t[e+1]=t[e+1]/o,t[e+2]=t[e+2]/o)}return t}function Ge(r,n,t,e,o){let{min:a,max:i}=br(r),s=e??Pt(r,t);return{positions:r,normals:s,uvs:n,indices:t,min:a,max:i,tangents:o??Ut(r,s,n,t)}}function Z(r=.5,n=24,t=32){let e=Math.max(2,n),o=Math.max(3,t),a=(e+1)*(o+1),i=new Float32Array(a*3),s=new Float32Array(a*3),c=new Float32Array(a*2),d=new Uint16Array(e*o*6),m=0,l=0,f=0;for(let h=0;h<=e;h++){let u=h/e*Math.PI;for(let p=0;p<=o;p++){let E=p/o*Math.PI*2,x=Math.sin(u)*Math.cos(E),b=Math.cos(u),A=Math.sin(u)*Math.sin(E);i[m]=x*r,i[m+1]=b*r,i[m+2]=A*r,s[m]=x,s[m+1]=b,s[m+2]=A,m+=3,c[l++]=p/o,c[l++]=h/e}}for(let h=0;h<e;h++)for(let u=0;u<o;u++){let p=h*(o+1)+u,E=p+1,x=p+(o+1),b=x+1;d[f++]=p,d[f++]=E,d[f++]=x,d[f++]=E,d[f++]=b,d[f++]=x}return Ge(i,c,d,s)}function Ve(r=.5,n=.08,t=64,e=24){let o=Math.max(3,t),a=Math.max(3,e),i=[],s=[],c=[],d=[],m=[];for(let l=0;l<=o;l++){let f=l/o*Math.PI*2,h=Math.cos(f),u=Math.sin(f);for(let p=0;p<=a;p++){let E=p/a*Math.PI*2,x=Math.cos(E),b=Math.sin(E);i.push((r+n*x)*h,n*b,(r+n*x)*u),s.push(h*x,b,u*x),c.push(l/o,p/a),m.push(-u,0,h)}}for(let l=0;l<o;l++)for(let f=0;f<a;f++){let h=l*(a+1)+f,u=h+1,p=h+(a+1),E=p+1;d.push(h,u,p,u,E,p)}return Ge(new Float32Array(i),new Float32Array(c),new Uint16Array(d),new Float32Array(s),new Float32Array(m))}function ke(r,n){let t=r*Math.PI/180,e=n*Math.PI/180,o=Math.cos(t);return[o*Math.cos(e),Math.sin(t),o*Math.sin(e)]}function He(r,n,t,e,o=1,a=.012,i=.22,s=96,c=8){let d=Math.max(8,s),m=Math.max(3,c),l=ke(r,n),f=ke(t,e),h=Math.max(-1,Math.min(1,l[0]*f[0]+l[1]*f[1]+l[2]*f[2])),u=Math.acos(h),p=u<1e-4||Math.abs(Math.PI-u)<1e-4,E=Math.sin(u),x=i*o*(u/Math.PI),b=[],A=[],F=[],M=[],v=[],L=g=>{if(p)return[l[0]+(f[0]-l[0])*g,l[1]+(f[1]-l[1])*g,l[2]+(f[2]-l[2])*g];let T=Math.sin((1-g)*u)/E,y=Math.sin(g*u)/E;return[l[0]*T+f[0]*y,l[1]*T+f[1]*y,l[2]*T+f[2]*y]},G=g=>{let T=L(g),y=Math.hypot(T[0],T[1],T[2])||1,D=o+x*Math.sin(Math.PI*g);return[T[0]/y*D,T[1]/y*D,T[2]/y*D]};for(let g=0;g<=d;g++){let T=g/d,y=G(T),D=G(Math.min(1,T+1/d)),C=G(Math.max(0,T-1/d)),P=D[0]-C[0],_=D[1]-C[1],V=D[2]-C[2],Ae=Math.hypot(P,_,V)||1;P/=Ae,_/=Ae,V/=Ae;let Me=Math.hypot(y[0],y[1],y[2])||1,Rt=y[0]/Me,Ft=y[1]/Me,At=y[2]/Me,Q=_*At-V*Ft,K=V*Rt-P*At,q=P*Ft-_*Rt,ve=Math.hypot(Q,K,q)||1;Q/=ve,K/=ve,q/=ve;let fr=K*V-q*_,dr=q*P-Q*V,hr=Q*_-K*P;for(let ue=0;ue<=m;ue++){let Mt=ue/m*Math.PI*2,Se=Math.cos(Mt),Le=Math.sin(Mt),vt=Q*Se+fr*Le,St=K*Se+dr*Le,Lt=q*Se+hr*Le;b.push(y[0]+vt*a,y[1]+St*a,y[2]+Lt*a),A.push(vt,St,Lt),F.push(T,ue/m),M.push(P,_,V)}}for(let g=0;g<d;g++)for(let T=0;T<m;T++){let y=g*(m+1)+T,D=y+1,C=y+(m+1),P=C+1;v.push(y,C,D,D,C,P)}return Ge(new Float32Array(b),new Float32Array(F),b.length/3>65535?new Uint32Array(v):new Uint16Array(v),new Float32Array(A),new Float32Array(M))}function H(r){return r.indices.length/3}var Xe=["minimum","reduced","full"],Er={full:{dprScale:2,ao:!0,aoScale:.5,dof:!0,shadowMapSize:1536,shadowTaps:9,particleCapacity:4096,volumeMaxSteps:128,volumeLightSteps:6},reduced:{dprScale:2,ao:!0,aoScale:.5,dof:!1,shadowMapSize:1024,shadowTaps:9,particleCapacity:2048,volumeMaxSteps:96,volumeLightSteps:4},minimum:{dprScale:1,ao:!1,aoScale:.5,dof:!1,shadowMapSize:512,shadowTaps:1,particleCapacity:512,volumeMaxSteps:48,volumeLightSteps:0}};function ze(r){return{tier:r,...Er[r]}}var je=89,We=Math.PI/180;function ee(r){let n=Math.max(-je,Math.min(je,r.elevationDeg))*We,t=r.azimuthDeg*We,e=Math.max(1e-4,r.distance),o=Math.sin(n)*e,a=Math.cos(n)*e;return[r.target[0]+Math.sin(t)*a,r.target[1]+o,r.target[2]+Math.cos(t)*a]}function Ye(r,n){let t=ee(r),e=r.near??Math.max(.01,r.distance/100),o=r.far??Math.max(e+1,r.distance*8),a=De((r.fovDeg??38)*We,Math.max(.001,n),e,o),i=fe(t,r.target,[0,1,0]);return me(a,i)}function $e(r,n,t){let e=O(r.direction),o=r.extent??Math.max(.1,t*1.35),a=Math.max(1,t*2),i=[n[0]-e[0]*a,n[1]-e[1]*a,n[2]-e[2]*a],s=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],c=fe(i,n,s),d=Ue(-o,o,-o,o,.01,a+t*2+o);return me(d,c)}function Qe(r,n){let t=W([n[0],n[1],n[2]],[r[0],r[1],r[2]]);return Math.hypot(t[0],t[1],t[2])/2}function Ke(r,n){return[(r[0]+n[0])/2,(r[1]+n[1])/2,(r[2]+n[2])/2]}function qe(r,n,t){let{gl:e}=r,o=Math.max(1,Math.floor(n)),a=Math.max(1,Math.floor(t)),i=e.createFramebuffer(),s=e.createTexture(),c=e.createTexture();if(!i||!s||!c)return S("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let d=r.hdr?e.RGBA16F:e.RGBA8,m=r.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,l=()=>{e.bindTexture(e.TEXTURE_2D,s),e.texImage2D(e.TEXTURE_2D,0,d,o,a,0,e.RGBA,m,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,c),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,o,a,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,s,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,c,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};l(),e.bindFramebuffer(e.FRAMEBUFFER,i);let f=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),f!==e.FRAMEBUFFER_COMPLETE?S("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${f.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:s,depthTexture:c,get width(){return o},get height(){return a},bind(){e.bindFramebuffer(e.FRAMEBUFFER,i),e.viewport(0,0,o,a)},resize(h,u){let p=Math.max(1,Math.floor(h)),E=Math.max(1,Math.floor(u));p===o&&E===a||(o=p,a=E,l())},dispose(){e.deleteFramebuffer(i),e.deleteTexture(s),e.deleteTexture(c)}}}function Je(r,n=1024){let{gl:t}=r,e=Math.max(256,Math.min(2048,Math.floor(n))),o=t.createFramebuffer(),a=t.createTexture();if(!o||!a)return S("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");t.bindTexture(t.TEXTURE_2D,a),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,e,e,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,o),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,a,0);let i=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),i!==t.FRAMEBUFFER_COMPLETE?S("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:e,bind(){t.bindFramebuffer(t.FRAMEBUFFER,o),t.viewport(0,0,e,e)},dispose(){t.deleteFramebuffer(o),t.deleteTexture(a)}}}var he=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,de={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function pe(r,n,t={}){let e=t.zenith??de.zenith,o=t.horizon??de.horizon,a=t.ground??de.ground;r.uniform3f(r.getUniformLocation(n,"uSkyZenith"),e[0],e[1],e[2]),r.uniform3f(r.getUniformLocation(n,"uSkyHorizon"),o[0],o[1],o[2]),r.uniform3f(r.getUniformLocation(n,"uSkyGround"),a[0],a[1],a[2])}var Tr=`#version 300 es
precision highp float;
out vec2 vNdc;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`,yr=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${he}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;function Ze(r){let{gl:n}=r,t=r.compile(Tr,yr);return"kind"in t?t:{draw(e){let o=O(W(e.target,e.eye)),a=Math.abs(o[1])>.999?[0,0,1]:[0,1,0],i=O(j(o,a)),s=O(j(i,o));n.disable(n.DEPTH_TEST),n.depthMask(!1),n.disable(n.BLEND),n.useProgram(t),n.uniform3f(n.getUniformLocation(t,"uRight"),i[0],i[1],i[2]),n.uniform3f(n.getUniformLocation(t,"uUp"),s[0],s[1],s[2]),n.uniform3f(n.getUniformLocation(t,"uForward"),o[0],o[1],o[2]),n.uniform1f(n.getUniformLocation(t,"uTanHalfFov"),Math.tan(e.fovDeg*Math.PI/360)),n.uniform1f(n.getUniformLocation(t,"uAspect"),Math.max(.001,e.aspect)),pe(n,t,e.sky),r.blit(t),n.depthMask(!0),n.enable(n.DEPTH_TEST)},dispose(){n.deleteProgram(t)}}}var Nt=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,et=`#version 300 es
precision highp float;
void main(){}`,xr=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,Bt=`#version 300 es
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
}`,Ct=`#version 300 es
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
${he}

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
}`;function X(r,n){let{gl:t}=r,e=t.createVertexArray(),o=t.createBuffer(),a=t.createBuffer(),i=t.createBuffer(),s=t.createBuffer();return!e||!o||!a||!i||!s?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(t.bindVertexArray(e),t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,n.positions,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,a),t.bufferData(t.ARRAY_BUFFER,n.normals,t.STATIC_DRAW),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,i),t.bufferData(t.ARRAY_BUFFER,n.tangents,t.STATIC_DRAW),t.enableVertexAttribArray(2),t.vertexAttribPointer(2,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,s),t.bufferData(t.ELEMENT_ARRAY_BUFFER,n.indices,t.STATIC_DRAW),t.bindVertexArray(null),{vao:e,indexCount:n.indices.length,indexType:n.indices instanceof Uint32Array?t.UNSIGNED_INT:t.UNSIGNED_SHORT,dispose(){t.deleteVertexArray(e),t.deleteBuffer(o),t.deleteBuffer(a),t.deleteBuffer(i),t.deleteBuffer(s)}})}function tt(r){let{gl:n}=r,t=r.compile(Nt,et);if("kind"in t)return t;let e=r.compile(Bt,Ct);if("kind"in e)return e;let o=r.compile(xr,et);if("kind"in o)return o;let a=(i,s)=>n.getUniformLocation(i,s);return{shadowPass(i,s,c,d){let m=d??(()=>{});c.bind(),m("shadow.bind"),n.clear(n.DEPTH_BUFFER_BIT),n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.FRONT),n.useProgram(t),m("useProgram(shadow)"),n.uniformMatrix4fv(a(t,"uLightVP"),!1,i),m("uLightVP");for(let l of s)n.uniformMatrix4fv(a(t,"uModel"),!1,l.model),m("shadow uModel"),n.bindVertexArray(l.mesh.vao),m("shadow bindVAO"),n.drawElements(n.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0),m("shadow drawElements");n.bindVertexArray(null),n.cullFace(n.BACK)},depthPrepass(i,s){n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.colorMask(!1,!1,!1,!1),n.useProgram(o),n.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let c of s)n.uniformMatrix4fv(a(o,"uModel"),!1,c.model),n.bindVertexArray(c.mesh.vao),n.drawElements(n.TRIANGLES,c.mesh.indexCount,c.mesh.indexType,0);n.bindVertexArray(null),n.colorMask(!0,!0,!0,!0)},draw(i){let s=i.onStep??(()=>{});if(n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.useProgram(e),n.uniformMatrix4fv(a(e,"uViewProj"),!1,i.viewProj),s("uViewProj"),n.uniform3fv(a(e,"uEye"),i.eye),s("uEye"),n.uniform3fv(a(e,"uLightDir"),i.lightDir),s("uLightDir"),n.uniform3fv(a(e,"uLightColour"),i.lightColour),s("uLightColour"),n.uniform1f(a(e,"uAmbientGain"),i.ambientGain??1),s("uAmbientGain"),i.fog&&i.fog.density>0){n.uniform1f(a(e,"uFogDensity"),i.fog.density),n.uniform1f(a(e,"uFogHeight"),i.fog.height),n.uniform1f(a(e,"uFogFloor"),i.fog.floor??0);let c=i.fog.colour;c==="sky"?n.uniform3f(a(e,"uFogColour"),-1,-1,-1):n.uniform3f(a(e,"uFogColour"),c[0],c[1],c[2]),s("fog")}else n.uniform1f(a(e,"uFogDensity"),0);pe(n,e,i.sky),s("bindSky"),i.ao&&i.screenSize?(n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,i.ao),n.uniform1i(a(e,"uAO"),1),n.uniform2f(a(e,"uScreenSize"),i.screenSize[0],i.screenSize[1]),n.uniform1f(a(e,"uAOEnabled"),1)):n.uniform1f(a(e,"uAOEnabled"),0),s("bindAO"),n.uniformMatrix4fv(a(e,"uLightVP"),!1,i.lightVP),s("lit uLightVP"),i.shadow?(n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,i.shadow.depthTexture),n.uniform1i(a(e,"uShadowMap"),0),n.uniform1f(a(e,"uShadowTexel"),1/i.shadow.size),n.uniform1f(a(e,"uShadowStrength"),i.shadowStrength??1)):n.uniform1f(a(e,"uShadowStrength"),0);for(let c of i.draws)n.uniformMatrix4fv(a(e,"uModel"),!1,c.model),n.uniformMatrix3fv(a(e,"uNormalMat"),!1,c.normalMat),s("uNormalMat"),n.uniform3fv(a(e,"uBaseColour"),c.material.baseColour),s("uBaseColour"),n.uniform1f(a(e,"uRoughness"),c.material.roughness),n.uniform1f(a(e,"uMetalness"),c.material.metalness),n.uniform1f(a(e,"uAnisotropy"),c.material.anisotropy??0),n.bindVertexArray(c.mesh.vao),s("lit bindVAO"),n.drawElements(n.TRIANGLES,c.mesh.indexCount,c.mesh.indexType,0),s("lit drawElements");n.bindVertexArray(null),n.disable(n.CULL_FACE)},dispose(){n.deleteProgram(t),n.deleteProgram(e),n.deleteProgram(o)}}}var te=`
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
}`,Ot=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,gr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${te}

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
}`,Rr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${te}

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
}`;function rt(r,n,t){let{gl:e}=r,o=r.compile(Ot,gr);if("kind"in o)return o;let a=r.compile(Ot,Rr);if("kind"in a)return a;let i=Math.max(1,n>>1),s=Math.max(1,t>>1),c=()=>{let u=e.createFramebuffer(),p=e.createTexture();return!u||!p?null:{fb:u,tex:p}},d=c(),m=c();if(!d||!m)return S("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let l=()=>{for(let u of[d,m])e.bindTexture(e.TEXTURE_2D,u.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,i,s,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,u.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,u.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};l(),e.bindFramebuffer(e.FRAMEBUFFER,d.fb);let f=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),f!==e.FRAMEBUFFER_COMPLETE)return S("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${f.toString(16)}).`);let h=(u,p,E,x,b,A,F)=>{e.activeTexture(e.TEXTURE0+F),e.bindTexture(e.TEXTURE_2D,p),e.uniform1i(e.getUniformLocation(u,"uDepth"),F),e.uniform2f(e.getUniformLocation(u,"uNearFar"),E,x),e.uniform1f(e.getUniformLocation(u,"uTanHalfFov"),Math.tan(b*Math.PI/360)),e.uniform1f(e.getUniformLocation(u,"uAspect"),A)};return{get texture(){return d.tex},get width(){return i},get height(){return s},compute(u){e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,d.fb),e.viewport(0,0,i,s),e.useProgram(o),h(o,u.depthTexture,u.near,u.far,u.fovDeg,u.aspect,0),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/i,1/s),e.uniform1f(e.getUniformLocation(o,"uRadius"),u.radius??.55),e.uniform1f(e.getUniformLocation(o,"uStrength"),u.strength??1.15),e.uniform1f(e.getUniformLocation(o,"uBias"),u.bias??.035),r.blit(o);for(let[p,E,x]of[[d,m,[1,0]],[m,d,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,E.fb),e.viewport(0,0,i,s),e.useProgram(a),h(a,u.depthTexture,u.near,u.far,u.fovDeg,u.aspect,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,p.tex),e.uniform1i(e.getUniformLocation(a,"uAO"),1),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/i,1/s),e.uniform2f(e.getUniformLocation(a,"uDir"),x[0],x[1]),r.blit(a);e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(u,p){let E=Math.max(1,u>>1),x=Math.max(1,p>>1);E===i&&x===s||(i=E,s=x,l())},dispose(){e.deleteProgram(o),e.deleteProgram(a);for(let u of[d,m])e.deleteFramebuffer(u.fb),e.deleteTexture(u.tex)}}}var Fr=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Ar=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uFocusDistance;
uniform float uAperture;
uniform float uMaxCoc;
out vec4 frag;
${te}

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
}`;function nt(r,n,t){let{gl:e}=r,o=r.compile(Fr,Ar);if("kind"in o)return o;let a=Math.max(1,Math.floor(n)),i=Math.max(1,Math.floor(t)),s=e.createFramebuffer(),c=e.createTexture();if(!s||!c)return S("FRAMEBUFFER_INCOMPLETE","The GPU refused a depth-of-field buffer.");let d=()=>{e.bindTexture(e.TEXTURE_2D,c);let l=r.hdr?e.RGBA16F:e.RGBA8,f=r.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE;e.texImage2D(e.TEXTURE_2D,0,l,a,i,0,e.RGBA,f,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,s),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,c,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};d(),e.bindFramebuffer(e.FRAMEBUFFER,s);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE?S("FRAMEBUFFER_INCOMPLETE",`The DOF buffer is incomplete (0x${m.toString(16)}).`):{texture:c,apply(l){e.bindFramebuffer(e.FRAMEBUFFER,s),e.viewport(0,0,a,i),e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.useProgram(o),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,l.scene),e.uniform1i(e.getUniformLocation(o,"uScene"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,l.depthTexture),e.uniform1i(e.getUniformLocation(o,"uDepth"),1),e.uniform2f(e.getUniformLocation(o,"uNearFar"),l.near,l.far),e.uniform1f(e.getUniformLocation(o,"uTanHalfFov"),Math.tan(l.fovDeg*Math.PI/360)),e.uniform1f(e.getUniformLocation(o,"uAspect"),l.aspect),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/a,1/i),e.uniform1f(e.getUniformLocation(o,"uFocusDistance"),l.focusDistance),e.uniform1f(e.getUniformLocation(o,"uAperture"),l.aperture??12),e.uniform1f(e.getUniformLocation(o,"uMaxCoc"),l.maxCoc??.012),r.blit(o),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(l,f){let h=Math.max(1,Math.floor(l)),u=Math.max(1,Math.floor(f));h===a&&u===i||(a=h,i=u,d())},dispose(){e.deleteProgram(o),e.deleteFramebuffer(s),e.deleteTexture(c)}}}var Mr=`
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
`;function It(r){let n=document.createElement("style");n.textContent=Mr,document.head.appendChild(n);let t=document.createElement("section");t.id="lcx-fallback";let e=(o,a)=>{if(o===null)return`<td class="absent${a?" n":""}">absent</td>`;let i=String(o).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");return`<td class="${a?"n":""}">${i}</td>`};return t.innerHTML=`<h2>${r.title} \u2014 flat view</h2><p class="reads">${r.readsAs}</p>`+(r.notices??[]).map(o=>`<p class="notice">${o}</p>`).join("")+'<div id="lcx-refusal"></div>'+(r.html?`<div class="surface">${r.html}</div>`:"<table><thead><tr>"+r.columns.map(o=>`<th class="${o.numeric?"n":""}">${o.label}</th>`).join("")+"</tr></thead><tbody>"+r.rows.map(o=>"<tr>"+r.columns.map(a=>e(o[a.key]??null,!!a.numeric)).join("")+"</tr>").join("")+"</tbody></table>"),document.body.appendChild(t),{markRendered(){t.dataset.rendered="1"},showRefusal(o,a){let i=document.getElementById("lcx-refusal");i&&(i.innerHTML=`<p class="refusal"><strong>${o}</strong> \u2014 ${a} The measurements below are unaffected.</p>`),delete t.dataset.rendered;for(let s of Array.from(document.querySelectorAll("canvas")))s.style.display="none"}}}var z=new URLSearchParams(location.search),pt=z.get("atmos")!=="0",Qt=z.get("shadow")!=="0",vr=Xe.includes(z.get("tier")??"")?z.get("tier"):"full",Ee=ze(vr),bt=Math.max(1,Math.min(3,Number(z.get("scale")??1))),N=1200*bt,B=720*bt,Et=document.getElementById("c");Et.width=N;Et.height=B;var ae={lat:47.14,lon:9.52},ie=[{to:"London",lat:51.51,lon:-.13},{to:"New York",lat:40.71,lon:-74.01},{to:"Chicago",lat:41.88,lon:-87.63},{to:"Dubai",lat:25.2,lon:55.27},{to:"Singapore",lat:1.35,lon:103.82},{to:"Tokyo",lat:35.68,lon:139.65},{to:"Johannesburg",lat:-26.2,lon:28.04}],Kt=null,qt=It({title:"E2 \xB7 The Globe \u2014 corridors from Vaduz",readsAs:"The rendered view states reach as arc height and time-of-day as a terminator, so which desks are awake and how far each corridor travels are read from the geometry. This table gives the same endpoints as numbers, and no reach and no daylight.",notices:["Coordinates are real. Corridor set is illustrative."],columns:[{key:"to",label:"Corridor to"},{key:"lat",label:"Lat",numeric:!0},{key:"lon",label:"Lon",numeric:!0},{key:"sep",label:"Great-circle separation",numeric:!0}],rows:ie.map(r=>{let n=o=>o*Math.PI/180,t=Math.sin(n(ae.lat))*Math.sin(n(r.lat))+Math.cos(n(ae.lat))*Math.cos(n(r.lat))*Math.cos(n(r.lon-ae.lon)),e=Math.acos(Math.min(1,Math.max(-1,t)))*180/Math.PI;return{to:r.to,lat:r.lat.toFixed(2),lon:r.lon.toFixed(2),sep:`${e.toFixed(1)}\xB0`}})});Kt=qt;z.get("refuse")==="1"&&Jt("FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. The three-dimensional view is not being drawn.");var lt=we(Et,{alpha:!1});if(!_e(lt))throw document.title="REFUSED",new Error(lt.reason);var w=lt,R=w.gl,Sr=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Lr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${Ce}
${Oe}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,_r=document.getElementById("log"),wr=r=>`${r.reason} ${r.detail??""}`;function Jt(r){document.title="REFUSED";let n=document.getElementById("log");n&&(n.textContent=r);let[t,...e]=r.split(":");throw Kt?.showRefusal(t?.trim()??"REFUSED",e.join(":").trim()||r),new Error(r)}function U(r,n){return"kind"in n&&Jt(`${r}: ${wr(n)}`),n}var Dr=U("present",w.compile(Sr,Lr)),re=U("lit",tt(w)),ne=U("target",qe(w,N,B)),kt=U("shadow",Je(w,Ee.shadowMapSize)),Ur=U("sky",Ze(w)),Gt=U("ao",rt(w,N,B)),Vt=U("dof",nt(w,N,B)),Ht=Math.PI/180,le=1,Tt=1.06,Zt=1.38,er=.026,Pr=.034;function ut(r,n,t){let e=r*Ht,o=n*Ht;return[t*Math.cos(e)*Math.cos(o),t*Math.sin(e),t*Math.cos(e)*Math.sin(o)]}var Nr=[{name:"London",lat:51.51,lon:-.13},{name:"Vaduz",lat:47.14,lon:9.52},{name:"Istanbul",lat:41.01,lon:28.98},{name:"Dubai",lat:25.2,lon:55.27},{name:"Mumbai",lat:19.08,lon:72.88},{name:"Lagos",lat:6.52,lon:3.38},{name:"Nairobi",lat:-1.29,lon:36.82},{name:"Johannesburg",lat:-26.2,lon:28.04},{name:"New York",lat:40.71,lon:-74.01},{name:"Chicago",lat:41.88,lon:-87.63},{name:"Singapore",lat:1.35,lon:103.82},{name:"Tokyo",lat:35.68,lon:139.65}],xe={lat:18,lon:60},tr=-15,Te=ut(xe.lat,xe.lon,1),Xt=[-Te[0],-Te[1],-Te[2]],rr=Z(le,64,96),nr=Z(Tt,56,84),or=Ve(Zt,er,168,20),ar=Z(Pr,14,20),Br=U("earth mesh",X(w,rr)),Cr=U("atmosphere mesh",X(w,nr)),Or=U("ring mesh",X(w,or)),Ir=U("city mesh",X(w,ar)),ct=ie.map(r=>He(ae.lat,ae.lon,r.lat,r.lon,le,.016,.2,128,12)),kr=ct.map((r,n)=>U(`corridor ${ie[n].to}`,X(w,r))),Re=(r,n,t)=>{let e=J();return e[12]=r,e[13]=n,e[14]=t,e},Fe=new Float32Array([1,0,0,0,1,0,0,0,1]),Gr=(()=>{let r=J();return r[0]=-1,r})(),Vr=new Float32Array([-1,0,0,0,1,0,0,0,1]),ot=I("#0E1628"),at=r=>[ot[0]*r,ot[1]*r,ot[2]*r],zt={zenith:at(.55),horizon:at(1.6),ground:at(.35)},Hr={baseColour:I("#0B2B5C"),roughness:.58,metalness:.06},Xr={baseColour:I("#7FB2FF"),roughness:.86,metalness:0},zr={baseColour:I("#8FA3C4"),roughness:.14,metalness:.95,anisotropy:.8},jr={baseColour:I("#2C6BFF"),roughness:.5,metalness:0},Wr={baseColour:I("#4C86FF"),roughness:.22,metalness:.85,anisotropy:.85},yt=Nr.map(r=>{let n=ut(r.lat,r.lon,1),t=ut(r.lat,r.lon,le);return{...r,normal:n,draw:{mesh:Ir,model:Re(t[0],t[1],t[2]),normalMat:Fe,material:jr}}}),mt={mesh:Br,model:Re(0,0,0),normalMat:Fe,material:Hr},Yr={mesh:Cr,model:Gr,normalMat:Vr,material:Xr},ft={mesh:Or,model:Re(0,0,0),normalMat:Fe,material:zr},xt=yt.map(r=>r.draw),gt=kr.map(r=>({mesh:r,model:Re(0,0,0),normalMat:Fe,material:Wr})),ir=pt?[mt,Yr,ft]:[mt,ft],$r=[mt,ft,...xt,...gt],Qr=[...ir,...xt,...gt],k={target:[0,0,0],distance:5.4,azimuthDeg:90-tr,elevationDeg:18,fovDeg:30},se=Zt+er,sr=[-se,-Tt,-se],lr=[se,Tt,se],be=Ke(sr,lr),Kr=Qe(sr,lr),qr=se*1.05,Jr=H(rr)+H(or)+(pt?H(nr):0)+H(ar)*yt.length,dt=Math.max(.01,k.distance/100),jt=Math.max(dt+1,k.distance*8),Wt=1.6,Yt=140;function ge(){let r=$e({direction:Xt,colour:[1,1,1],extent:qr},be,Kr),n=Ye(k,N/B),t=ee(k);re.shadowPass(r,$r,kt),ne.bind(),R.clear(R.DEPTH_BUFFER_BIT),Ur.draw({eye:t,target:k.target,fovDeg:k.fovDeg??34,aspect:N/B,sky:zt}),re.depthPrepass(n,Qr),Gt.compute({depthTexture:ne.depthTexture,near:dt,far:jt,fovDeg:k.fovDeg??34,aspect:N/B,radius:.35,strength:1.1}),ne.bind();let e={viewProj:n,eye:t,lightDir:Xt,lightColour:[6.6,6.2,5.5],sky:zt,lightVP:r,shadow:Qt?kt:null,shadowStrength:.92,ao:Gt.texture,screenSize:[N,B]};re.draw({...e,ambientGain:Wt,draws:ir}),re.draw({...e,ambientGain:(Wt+Yt)/2,draws:gt}),re.draw({...e,ambientGain:Yt,draws:xt});let o=Math.hypot(t[0]-be[0],t[1]-be[1],t[2]-be[2]);Vt.apply({scene:ne.texture,depthTexture:ne.depthTexture,near:dt,far:jt,fovDeg:k.fovDeg??34,aspect:N/B,focusDistance:o,aperture:.12,maxCoc:.006}),R.bindFramebuffer(R.FRAMEBUFFER,null),R.viewport(0,0,N,B),R.disable(R.DEPTH_TEST),R.activeTexture(R.TEXTURE0),R.bindTexture(R.TEXTURE_2D,Vt.texture),w.blit(Dr,a=>R.uniform1i(R.getUniformLocation(a,"uScene"),0))}ge();var $=ee(k),ye=Math.hypot($[0],$[1],$[2]),Zr=[$[0]/ye,$[1]/ye,$[2]/ye],$t=(r,n)=>r[0]*n[0]+r[1]*n[1]+r[2]*n[2],en=le/ye,oe=yt.map(r=>({name:r.name,facing:$t(r.normal,Zr)>en,sunlit:$t(r.normal,Te)>0}));function tn(r){ge();let n=new Uint8Array(4);R.readPixels(0,0,1,1,R.RGBA,R.UNSIGNED_BYTE,n);let t=performance.now();for(let e=0;e<r;e++)ge();return R.readPixels(0,0,1,1,R.RGBA,R.UNSIGNED_BYTE,n),(performance.now()-t)/r}var ur=Number(z.get("frames")??300),it=tn(Math.max(1,ur)),ht=Ie();if(ht.length>0){let r="BRAND FIDELITY FAILED \u2014 "+ht.map(t=>`${t.key}: expected ${t.expected}, got ${t.actual}`).join("; ");document.title="REFUSED";let n=document.getElementById("log");throw n&&(n.textContent=r),new Error(r)}var cr=(()=>{let r=R.getExtension("WEBGL_debug_renderer_info");return r?String(R.getParameter(r.UNMASKED_RENDERER_WEBGL)):"unknown"})(),st=/swiftshader|llvmpipe|software/i.test(cr),mr={tier:Ee.tier,tierDprScale:Ee.dprScale,tierShadowMapSize:Ee.shadowMapSize,glError:R.getError(),brandFidelity:ht,atmosphere:pt,shadow:Qt,triangles:Jr,resolution:`${N}x${B}`,dprScale:bt,frames:ur,msPerFrame:Number(it.toFixed(3)),fps:Math.round(1e3/it),centralMeridian:tr,subSolar:`${xe.lat}N ${xe.lon}E`,cities:oe.length,citiesFacing:oe.filter(r=>r.facing).length,citiesSunlit:oe.filter(r=>r.sunlit).length,corridors:ie.length,corridorTriangles:ct.reduce((r,n)=>r+H(n),0),corridorPeakLift:ct.map((r,n)=>{let t=0;for(let e=0;e<r.positions.length;e+=3)t=Math.max(t,Math.hypot(r.positions[e],r.positions[e+1],r.positions[e+2]));return{to:ie[n].to,lift:Number((t-le).toFixed(4))}}),behindLimb:oe.filter(r=>!r.facing).map(r=>r.name),onNightSide:oe.filter(r=>r.facing&&!r.sunlit).map(r=>r.name),renderer:cr,rendererClass:st?"software":"hardware",headroom:st?null:Number((16.6-it).toFixed(3)),headroomRefusal:st?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null};globalThis.E2=mr;_r.textContent=JSON.stringify(mr,null,2);ge();qt.markRendered();document.title="READY";

var L={E0:{id:"E0",name:"THE SPIKE",verdict:"GATE MET"},E1:{id:"E1",name:"THE THEATRE",verdict:"THE HYBRID WORKS. \xA77(b) is now a real tension, not a gap."},E2:{id:"E2",name:"THE GLOBE",verdict:"CARRIES INFORMATION. \xA77(b) still unproven."},E3:{id:"E3",name:"THE PIPELINE",verdict:"READS, and it cost two engine bugs, a lost object and a fog that erased the room."},E4:{id:"E4",name:"THE ORRERY",verdict:`THE CROSSING CLAIM HOLDS AND IS CAMERA-INDEPENDENT. \xA72's "compartment you fly into" is not built, and \xA77(b) is not timed.`},E5:{id:"E5",name:"THE SURFACE",verdict:"AGREES WITH THE SHIPPING ENGINE. \xA72's ribbons and drag are not built."},E6:{id:"E6",name:"THE VAULT",verdict:"READS. Six framing errors, every one caught by a count."},E7:{id:"E7",name:"THE STORM",verdict:"THE INTEGRAL IS THE DATA \u2014 verified to 0.00% against the table, but a pixel mixes six days and \xA72's rotation is not built."},E8:{id:"E8",name:"THE FORGE",verdict:"the first shippable environment"},E9:{id:"E9",name:"THE AUDIT",verdict:"1 of 9 environments have findings"}};var mt={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected."};function P(t,n){return n===void 0?{kind:"refused",code:t,reason:mt[t]}:{kind:"refused",code:t,reason:mt[t],detail:n}}function Me(t){return t.kind==="stage"}function ve(t,n={}){let r=t.getContext("webgl2",{antialias:n.antialias??!1,alpha:n.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!r)return P("NO_WEBGL2");let e=r.getExtension("EXT_color_buffer_float"),o=t.width,a=t.height,i=e?r.RGBA16F:r.RGBA8,s=e?r.HALF_FLOAT:r.UNSIGNED_BYTE,u=(p,R)=>{let g=r.createTexture();r.bindTexture(r.TEXTURE_2D,g),r.texImage2D(r.TEXTURE_2D,0,i,p,R,0,r.RGBA,s,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE);let y=r.createFramebuffer();r.bindFramebuffer(r.FRAMEBUFFER,y),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,g,0);let _=r.checkFramebufferStatus(r.FRAMEBUFFER);return _!==r.FRAMEBUFFER_COMPLETE?P("FRAMEBUFFER_INCOMPLETE",`status 0x${_.toString(16)} at ${p}\xD7${R}`):{texture:g,framebuffer:y,width:p,height:R}},d=n.bloomShift??2,c={w:o,h:a},l=u(o,a);if("kind"in l)return l;let m=u(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in m)return m;let h=u(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in h)return h;let f=r.createVertexArray();r.bindVertexArray(f);let b=r.createBuffer();r.bindBuffer(r.ARRAY_BUFFER,b),r.bufferData(r.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),r.STATIC_DRAW),r.enableVertexAttribArray(0),r.vertexAttribPointer(0,2,r.FLOAT,!1,0,0),r.bindVertexArray(null);let E=[];return{kind:"stage",gl:r,cssWidth:t.clientWidth||o,cssHeight:t.clientHeight||a,hdr:!!e,get width(){return c.w},get height(){return c.h},get scene(){return l},get bloomA(){return m},get bloomB(){return h},setRegion(p,R){let g=Math.max(1,Math.round(p)),y=Math.max(1,Math.round(R));if(!(g===c.w&&y===c.h)){c={w:g,h:y};for(let _ of[l,m,h])"kind"in _||(r.deleteFramebuffer(_.framebuffer),r.deleteTexture(_.texture));l=u(g,y),m=u(Math.max(1,g>>d),Math.max(1,y>>d)),h=u(Math.max(1,g>>d),Math.max(1,y>>d))}},compile(p,R){let g=(A,M)=>{let w=r.createShader(A);return r.shaderSource(w,M),r.compileShader(w),r.getShaderParameter(w,r.COMPILE_STATUS)?w:P("SHADER_COMPILE_FAILED",r.getShaderInfoLog(w)??"(no log)")},y=g(r.VERTEX_SHADER,p);if(typeof y=="object"&&"kind"in y)return y;let _=g(r.FRAGMENT_SHADER,R);if(typeof _=="object"&&"kind"in _)return _;let x=r.createProgram();return r.attachShader(x,y),r.attachShader(x,_),r.linkProgram(x),r.getProgramParameter(x,r.LINK_STATUS)?(E.push(x),x):P("PROGRAM_LINK_FAILED",r.getProgramInfoLog(x)??"(no log)")},bindTarget(p){r.bindFramebuffer(r.FRAMEBUFFER,p?p.framebuffer:null),r.viewport(0,0,p?p.width:c.w,p?p.height:c.h)},blit(p,R){r.useProgram(p),r.bindVertexArray(f),R?.(p),r.drawArrays(r.TRIANGLES,0,3),r.bindVertexArray(null)},dispose(){for(let p of E)r.deleteProgram(p);for(let p of[l,m,h])"kind"in p||(r.deleteFramebuffer(p.framebuffer),r.deleteTexture(p.texture));r.deleteBuffer(b),r.deleteVertexArray(f)}}}var oe=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function ae(t,n){let r=new Float32Array(16);for(let e=0;e<4;e++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=t[i*4+o]*n[e*4+i];r[e*4+o]=a}return r}var $=(t,n)=>[t[0]-n[0],t[1]-n[1],t[2]-n[2]],ne=(t,n)=>t[0]*n[0]+t[1]*n[1]+t[2]*n[2],W=(t,n)=>[t[1]*n[2]-t[2]*n[1],t[2]*n[0]-t[0]*n[2],t[0]*n[1]-t[1]*n[0]];function O(t){let n=Math.hypot(t[0],t[1],t[2]);return n===0?t:[t[0]/n,t[1]/n,t[2]/n]}function Se(t,n,r,e){let o=1/Math.tan(t/2);return new Float32Array([o/n,0,0,0,0,o,0,0,0,0,(e+r)/(r-e),-1,0,0,2*e*r/(r-e),0])}function _e(t,n,r,e,o,a){let i=n-t,s=e-r,u=a-o;return new Float32Array([2/i,0,0,0,0,2/s,0,0,0,0,-2/u,0,-(n+t)/i,-(e+r)/s,-(a+o)/u,1])}function ie(t,n,r){let e=O($(t,n)),o=W(r,e);if(Math.hypot(o[0],o[1],o[2])<1e-8)return oe();let a=O(o),i=W(e,a);return new Float32Array([a[0],i[0],e[0],0,a[1],i[1],e[1],0,a[2],i[2],e[2],0,-ne(a,t),-ne(i,t),-ne(e,t),1])}function ht(t,n){let r=[0,1,2,3].map(o=>t[0+o]*n[0]+t[4+o]*n[1]+t[8+o]*n[2]+t[12+o]),e=r[3];return{x:r[0]/e,y:r[1]/e,z:r[2]/e,w:e}}function V(t,n,r,e){let o=ht(t,n);return{sx:(o.x*.5+.5)*r,sy:(1-(o.y*.5+.5))*e,behind:o.w<=0}}function bt(t){return t<=.04045?t/12.92:Math.pow((t+.055)/1.055,2.4)}function Le(t){return t<=.0031308?t*12.92:1.055*Math.pow(t,1/2.4)-.055}var Kt=/^#?([0-9a-fA-F]{6})$/;function Z(t){let n=Kt.exec(t.trim());if(!n)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(t)}`);let r=n[1];return[0,2,4].map(e=>bt(parseInt(r.slice(e,e+2),16)/255))}function we(t){return`#${t.map(r=>{let e=Le(Math.min(1,Math.max(0,r)));return Math.round(e*255).toString(16).padStart(2,"0")}).join("")}`}var Q={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},De=Object.freeze(Object.fromEntries(Object.keys(Q).map(t=>[t,Z(Q[t])])));var pt=.4;var Pe=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${pt.toFixed(2)}); }`,Ne=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function Ue(){let t=[];for(let n of Object.keys(Q)){let r=Q[n].toLowerCase(),e=we(De[n]).toLowerCase();e!==r&&t.push({key:n,expected:r,actual:e})}return t}function qt(t){let n=[1/0,1/0,1/0],r=[-1/0,-1/0,-1/0];for(let e=0;e<t.length;e+=3)for(let o=0;o<3;o++){let a=t[e+o];a<n[o]&&(n[o]=a),a>r[o]&&(r[o]=a)}return t.length===0?{min:[0,0,0],max:[0,0,0]}:{min:n,max:r}}function Et(t,n,r,e){let o=new Float32Array(t.length);for(let i=0;i<e.length;i+=3){let s=e[i],u=e[i+1],d=e[i+2],c=s*3,l=u*3,m=d*3,h=s*2,f=u*2,b=d*2,E=t[l]-t[c],F=t[l+1]-t[c+1],p=t[l+2]-t[c+2],R=t[m]-t[c],g=t[m+1]-t[c+1],y=t[m+2]-t[c+2],_=r[f]-r[h],x=r[f+1]-r[h+1],A=r[b]-r[h],M=r[b+1]-r[h+1],w=_*M-A*x;if(Math.abs(w)<1e-12)continue;let D=1/w,q=(E*M-R*x)*D,G=(F*M-g*x)*D,J=(p*M-y*x)*D;for(let j of[c,l,m])o[j]=o[j]+q,o[j+1]=o[j+1]+G,o[j+2]=o[j+2]+J}let a=new Float32Array(t.length);for(let i=0;i<a.length;i+=3){let s=n[i],u=n[i+1],d=n[i+2],c=o[i],l=o[i+1],m=o[i+2],h=c*s+l*u+m*d;c-=s*h,l-=u*h,m-=d*h;let f=Math.hypot(c,l,m);f<1e-8&&(Math.abs(s)<.9?(c=0,l=-d,m=u):(c=-d,l=0,m=s),f=Math.hypot(c,l,m)||1),a[i]=c/f,a[i+1]=l/f,a[i+2]=m/f}return a}function xt(t,n){let r=new Float32Array(t.length);for(let e=0;e<n.length;e+=3){let o=n[e]*3,a=n[e+1]*3,i=n[e+2]*3,s=t[a]-t[o],u=t[a+1]-t[o+1],d=t[a+2]-t[o+2],c=t[i]-t[o],l=t[i+1]-t[o+1],m=t[i+2]-t[o+2],h=u*m-d*l,f=d*c-s*m,b=s*l-u*c;for(let E of[o,a,i])r[E]=r[E]+h,r[E+1]=r[E+1]+f,r[E+2]=r[E+2]+b}for(let e=0;e<r.length;e+=3){let o=Math.hypot(r[e],r[e+1],r[e+2]);o>0&&(r[e]=r[e]/o,r[e+1]=r[e+1]/o,r[e+2]=r[e+2]/o)}return r}function yt(t,n,r,e,o){let{min:a,max:i}=qt(t),s=e??xt(t,r);return{positions:t,normals:s,uvs:n,indices:r,min:a,max:i,tangents:o??Et(t,s,n,r)}}function Oe(t=1,n=1,r=1){let e=t/2,o=n/2,a=r/2,i=[[[-e,-o,a],[e,-o,a],[e,o,a],[-e,o,a]],[[e,-o,-a],[-e,-o,-a],[-e,o,-a],[e,o,-a]],[[e,-o,a],[e,-o,-a],[e,o,-a],[e,o,a]],[[-e,-o,-a],[-e,-o,a],[-e,o,a],[-e,o,-a]],[[-e,o,a],[e,o,a],[e,o,-a],[-e,o,-a]],[[-e,-o,-a],[e,-o,-a],[e,-o,a],[-e,-o,a]]],s=new Float32Array(72),u=new Float32Array(48),d=new Uint16Array(36),c=0,l=0,m=0,h=0;for(let f of i){for(let[b,E,F]of f)s[c++]=b,s[c++]=E,s[c++]=F;u[l++]=0,u[l++]=0,u[l++]=1,u[l++]=0,u[l++]=1,u[l++]=1,u[l++]=0,u[l++]=1,d[m++]=h,d[m++]=h+1,d[m++]=h+2,d[m++]=h,d[m++]=h+2,d[m++]=h+3,h+=4}return yt(s,u,d)}function Be(t=10,n=24){let r=Math.max(1,Math.floor(n)),e=(r+1)*(r+1),o=new Float32Array(e*3),a=new Float32Array(e*3),i=new Float32Array(e*2),s=new Uint16Array(r*r*6),u=0,d=0,c=0;for(let l=0;l<=r;l++)for(let m=0;m<=r;m++){let h=(m/r-.5)*t,f=(l/r-.5)*t;o[u]=h,o[u+1]=0,o[u+2]=f,a[u]=0,a[u+1]=1,a[u+2]=0,u+=3,i[d++]=m/r,i[d++]=l/r}for(let l=0;l<r;l++)for(let m=0;m<r;m++){let h=l*(r+1)+m,f=h+1,b=h+(r+1),E=b+1;s[c++]=h,s[c++]=b,s[c++]=f,s[c++]=f,s[c++]=b,s[c++]=E}return yt(o,i,s,a)}function Ce(t){return t.indices.length/3}function Jt(t){if(!Number.isFinite(t)||t===0)return"0";let n=t.toFixed(12).replace(/0+$/,"").replace(/\.$/,"");return n==="-0"?"0":n}function Tt(t,n,r,e){let[o,a]=t,[i,s]=n,[u,d]=r,[c,l]=e,m=o-i+u-c,h=a-s+d-l;if(Math.abs(m)<1e-9&&Math.abs(h)<1e-9){let y=[i-o,c-o,o,s-a,l-a,a,0,0,1],_=y[0]*y[4]-y[1]*y[3];return Math.abs(_)<1e-9?null:y}let f=i-u,b=c-u,E=s-d,F=l-d,p=f*F-b*E;if(Math.abs(p)<1e-9)return null;let R=(m*F-b*h)/p,g=(f*h-m*E)/p;return[i-o+R*i,c-o+g*c,o,s-a+R*s,l-a+g*l,a,R,g,1]}function Ie(t,n,r,e,o,a){if(!(o>0)||!(a>0))return{refusal:"EMPTY_ELEMENT_BOX"};let s=[n.topLeft,n.topRight,n.bottomRight,n.bottomLeft].map(D=>V(t,D,r,e));if(s.some(D=>D.behind))return{refusal:"CORNER_BEHIND_CAMERA"};let u=s.map(D=>({x:D.sx,y:D.sy})),[d,c,l,m]=u,h=Tt([d.x,d.y],[c.x,c.y],[l.x,l.y],[m.x,m.y]);if(!h)return{refusal:"DEGENERATE_ON_SCREEN"};let f=.5*(d.x*c.y-c.x*d.y+(c.x*l.y-l.x*c.y)+(l.x*m.y-m.x*l.y)+(m.x*d.y-d.x*m.y)),b=1/o,E=1/a,[F,p,R,g,y,_,x,A,M]=h;return{transform:`matrix3d(${[F*b,g*b,0,x*b,p*E,y*E,0,A*E,0,0,1,0,R,_,0,M].map(Jt).join(", ")})`,matrix:h,screen:u,signedArea:f}}function ke(t){return"refusal"in t}var Ge=["minimum","reduced","full"],Zt={full:{dprScale:2,ao:!0,aoScale:.5,dof:!0,shadowMapSize:1536,shadowTaps:9,particleCapacity:4096,volumeMaxSteps:128,volumeLightSteps:6},reduced:{dprScale:2,ao:!0,aoScale:.5,dof:!1,shadowMapSize:1024,shadowTaps:9,particleCapacity:2048,volumeMaxSteps:96,volumeLightSteps:4},minimum:{dprScale:1,ao:!1,aoScale:.5,dof:!1,shadowMapSize:512,shadowTaps:1,particleCapacity:512,volumeMaxSteps:48,volumeLightSteps:0}};function se(t,n){let r=Number.isFinite(n)&&n>0?n:1024,o=r*(t==="full"?1:t==="reduced"?.5:.25),a=2**Math.round(Math.log2(o));return Math.max(256,Math.min(r,a))}function Ve(t){return{tier:t,...Zt[t]}}var He=89,ze=Math.PI/180;function ue(t){let n=Math.max(-He,Math.min(He,t.elevationDeg))*ze,r=t.azimuthDeg*ze,e=Math.max(1e-4,t.distance),o=Math.sin(n)*e,a=Math.cos(n)*e;return[t.target[0]+Math.sin(r)*a,t.target[1]+o,t.target[2]+Math.cos(r)*a]}function le(t,n){let r=ue(t),e=t.near??Math.max(.01,t.distance/100),o=t.far??Math.max(e+1,t.distance*8),a=Se((t.fovDeg??38)*ze,Math.max(.001,n),e,o),i=ie(r,t.target,[0,1,0]);return ae(a,i)}function Xe(t,n,r){let e=O(t.direction),o=t.extent??Math.max(.1,r*1.35),a=Math.max(1,r*2),i=[n[0]-e[0]*a,n[1]-e[1]*a,n[2]-e[2]*a],s=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],u=ie(i,n,s),d=_e(-o,o,-o,o,.01,a+r*2+o);return ae(d,u)}function je(t,n){let r=$([n[0],n[1],n[2]],[t[0],t[1],t[2]]);return Math.hypot(r[0],r[1],r[2])/2}function We(t,n){return[(t[0]+n[0])/2,(t[1]+n[1])/2,(t[2]+n[2])/2]}function $e(t,n,r){let{gl:e}=t,o=Math.max(1,Math.floor(n)),a=Math.max(1,Math.floor(r)),i=e.createFramebuffer(),s=e.createTexture(),u=e.createTexture();if(!i||!s||!u)return P("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let d=t.hdr?e.RGBA16F:e.RGBA8,c=t.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,l=()=>{e.bindTexture(e.TEXTURE_2D,s),e.texImage2D(e.TEXTURE_2D,0,d,o,a,0,e.RGBA,c,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,u),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,o,a,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,s,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,u,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};l(),e.bindFramebuffer(e.FRAMEBUFFER,i);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE?P("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${m.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:s,depthTexture:u,get width(){return o},get height(){return a},bind(){e.bindFramebuffer(e.FRAMEBUFFER,i),e.viewport(0,0,o,a)},resize(h,f){let b=Math.max(1,Math.floor(h)),E=Math.max(1,Math.floor(f));b===o&&E===a||(o=b,a=E,l())},dispose(){e.deleteFramebuffer(i),e.deleteTexture(s),e.deleteTexture(u)}}}function Qe(t,n=1024){let{gl:r}=t,e=Math.max(256,Math.min(2048,Math.floor(n))),o=r.createFramebuffer(),a=r.createTexture();if(!o||!a)return P("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");r.bindTexture(r.TEXTURE_2D,a),r.texImage2D(r.TEXTURE_2D,0,r.DEPTH_COMPONENT24,e,e,0,r.DEPTH_COMPONENT,r.UNSIGNED_INT,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),r.bindFramebuffer(r.FRAMEBUFFER,o),r.framebufferTexture2D(r.FRAMEBUFFER,r.DEPTH_ATTACHMENT,r.TEXTURE_2D,a,0);let i=r.checkFramebufferStatus(r.FRAMEBUFFER);return r.bindFramebuffer(r.FRAMEBUFFER,null),i!==r.FRAMEBUFFER_COMPLETE?P("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:e,bind(){r.bindFramebuffer(r.FRAMEBUFFER,o),r.viewport(0,0,e,e)},dispose(){r.deleteFramebuffer(o),r.deleteTexture(a)}}}var de=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,ce={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function fe(t,n,r={}){let e=r.zenith??ce.zenith,o=r.horizon??ce.horizon,a=r.ground??ce.ground;t.uniform3f(t.getUniformLocation(n,"uSkyZenith"),e[0],e[1],e[2]),t.uniform3f(t.getUniformLocation(n,"uSkyHorizon"),o[0],o[1],o[2]),t.uniform3f(t.getUniformLocation(n,"uSkyGround"),a[0],a[1],a[2])}var er=`#version 300 es
precision highp float;
out vec2 vNdc;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`,tr=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${de}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;function Ye(t){let{gl:n}=t,r=t.compile(er,tr);return"kind"in r?r:{draw(e){let o=O($(e.target,e.eye)),a=Math.abs(o[1])>.999?[0,0,1]:[0,1,0],i=O(W(o,a)),s=O(W(i,o));n.disable(n.DEPTH_TEST),n.depthMask(!1),n.disable(n.BLEND),n.useProgram(r),n.uniform3f(n.getUniformLocation(r,"uRight"),i[0],i[1],i[2]),n.uniform3f(n.getUniformLocation(r,"uUp"),s[0],s[1],s[2]),n.uniform3f(n.getUniformLocation(r,"uForward"),o[0],o[1],o[2]),n.uniform1f(n.getUniformLocation(r,"uTanHalfFov"),Math.tan(e.fovDeg*Math.PI/360)),n.uniform1f(n.getUniformLocation(r,"uAspect"),Math.max(.001,e.aspect)),fe(n,r,e.sky),t.blit(r),n.depthMask(!0),n.enable(n.DEPTH_TEST)},dispose(){n.deleteProgram(r)}}}var gt=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,Ke=`#version 300 es
precision highp float;
void main(){}`,rr=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,Rt=`#version 300 es
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
}`,At=`#version 300 es
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
${de}

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
}`;function me(t,n){let{gl:r}=t,e=r.createVertexArray(),o=r.createBuffer(),a=r.createBuffer(),i=r.createBuffer(),s=r.createBuffer();return!e||!o||!a||!i||!s?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(r.bindVertexArray(e),r.bindBuffer(r.ARRAY_BUFFER,o),r.bufferData(r.ARRAY_BUFFER,n.positions,r.STATIC_DRAW),r.enableVertexAttribArray(0),r.vertexAttribPointer(0,3,r.FLOAT,!1,0,0),r.bindBuffer(r.ARRAY_BUFFER,a),r.bufferData(r.ARRAY_BUFFER,n.normals,r.STATIC_DRAW),r.enableVertexAttribArray(1),r.vertexAttribPointer(1,3,r.FLOAT,!1,0,0),r.bindBuffer(r.ARRAY_BUFFER,i),r.bufferData(r.ARRAY_BUFFER,n.tangents,r.STATIC_DRAW),r.enableVertexAttribArray(2),r.vertexAttribPointer(2,3,r.FLOAT,!1,0,0),r.bindBuffer(r.ELEMENT_ARRAY_BUFFER,s),r.bufferData(r.ELEMENT_ARRAY_BUFFER,n.indices,r.STATIC_DRAW),r.bindVertexArray(null),{vao:e,indexCount:n.indices.length,indexType:n.indices instanceof Uint32Array?r.UNSIGNED_INT:r.UNSIGNED_SHORT,dispose(){r.deleteVertexArray(e),r.deleteBuffer(o),r.deleteBuffer(a),r.deleteBuffer(i),r.deleteBuffer(s)}})}function qe(t){let{gl:n}=t,r=t.compile(gt,Ke);if("kind"in r)return r;let e=t.compile(Rt,At);if("kind"in e)return e;let o=t.compile(rr,Ke);if("kind"in o)return o;let a=(i,s)=>n.getUniformLocation(i,s);return{shadowPass(i,s,u,d){let c=d??(()=>{});u.bind(),c("shadow.bind"),n.clear(n.DEPTH_BUFFER_BIT),n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.FRONT),n.useProgram(r),c("useProgram(shadow)"),n.uniformMatrix4fv(a(r,"uLightVP"),!1,i),c("uLightVP");for(let l of s)n.uniformMatrix4fv(a(r,"uModel"),!1,l.model),c("shadow uModel"),n.bindVertexArray(l.mesh.vao),c("shadow bindVAO"),n.drawElements(n.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0),c("shadow drawElements");n.bindVertexArray(null),n.cullFace(n.BACK)},depthPrepass(i,s){n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.colorMask(!1,!1,!1,!1),n.useProgram(o),n.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let u of s)n.uniformMatrix4fv(a(o,"uModel"),!1,u.model),n.bindVertexArray(u.mesh.vao),n.drawElements(n.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0);n.bindVertexArray(null),n.colorMask(!0,!0,!0,!0)},draw(i){let s=i.onStep??(()=>{});if(n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.useProgram(e),n.uniformMatrix4fv(a(e,"uViewProj"),!1,i.viewProj),s("uViewProj"),n.uniform3fv(a(e,"uEye"),i.eye),s("uEye"),n.uniform3fv(a(e,"uLightDir"),i.lightDir),s("uLightDir"),n.uniform3fv(a(e,"uLightColour"),i.lightColour),s("uLightColour"),n.uniform1f(a(e,"uAmbientGain"),i.ambientGain??1),s("uAmbientGain"),i.fog&&i.fog.density>0){n.uniform1f(a(e,"uFogDensity"),i.fog.density),n.uniform1f(a(e,"uFogHeight"),i.fog.height),n.uniform1f(a(e,"uFogFloor"),i.fog.floor??0);let u=i.fog.colour;u==="sky"?n.uniform3f(a(e,"uFogColour"),-1,-1,-1):n.uniform3f(a(e,"uFogColour"),u[0],u[1],u[2]),s("fog")}else n.uniform1f(a(e,"uFogDensity"),0);fe(n,e,i.sky),s("bindSky"),i.ao&&i.screenSize?(n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,i.ao),n.uniform1i(a(e,"uAO"),1),n.uniform2f(a(e,"uScreenSize"),i.screenSize[0],i.screenSize[1]),n.uniform1f(a(e,"uAOEnabled"),1)):n.uniform1f(a(e,"uAOEnabled"),0),s("bindAO"),n.uniformMatrix4fv(a(e,"uLightVP"),!1,i.lightVP),s("lit uLightVP"),i.shadow?(n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,i.shadow.depthTexture),n.uniform1i(a(e,"uShadowMap"),0),n.uniform1f(a(e,"uShadowTexel"),1/i.shadow.size),n.uniform1f(a(e,"uShadowStrength"),i.shadowStrength??1)):n.uniform1f(a(e,"uShadowStrength"),0);for(let u of i.draws)n.uniformMatrix4fv(a(e,"uModel"),!1,u.model),n.uniformMatrix3fv(a(e,"uNormalMat"),!1,u.normalMat),s("uNormalMat"),n.uniform3fv(a(e,"uBaseColour"),u.material.baseColour),s("uBaseColour"),n.uniform1f(a(e,"uRoughness"),u.material.roughness),n.uniform1f(a(e,"uMetalness"),u.material.metalness),n.uniform1f(a(e,"uAnisotropy"),u.material.anisotropy??0),n.bindVertexArray(u.mesh.vao),s("lit bindVAO"),n.drawElements(n.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0),s("lit drawElements");n.bindVertexArray(null),n.disable(n.CULL_FACE)},dispose(){n.deleteProgram(r),n.deleteProgram(e),n.deleteProgram(o)}}}var ee=`
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
}`,Ft=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,nr=`#version 300 es
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
}`,or=`#version 300 es
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
}`;function Je(t,n,r){let{gl:e}=t,o=t.compile(Ft,nr);if("kind"in o)return o;let a=t.compile(Ft,or);if("kind"in a)return a;let i=Math.max(1,n>>1),s=Math.max(1,r>>1),u=()=>{let f=e.createFramebuffer(),b=e.createTexture();return!f||!b?null:{fb:f,tex:b}},d=u(),c=u();if(!d||!c)return P("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let l=()=>{for(let f of[d,c])e.bindTexture(e.TEXTURE_2D,f.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,i,s,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,f.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,f.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};l(),e.bindFramebuffer(e.FRAMEBUFFER,d.fb);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE)return P("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${m.toString(16)}).`);let h=(f,b,E,F,p,R,g)=>{e.activeTexture(e.TEXTURE0+g),e.bindTexture(e.TEXTURE_2D,b),e.uniform1i(e.getUniformLocation(f,"uDepth"),g),e.uniform2f(e.getUniformLocation(f,"uNearFar"),E,F),e.uniform1f(e.getUniformLocation(f,"uTanHalfFov"),Math.tan(p*Math.PI/360)),e.uniform1f(e.getUniformLocation(f,"uAspect"),R)};return{get texture(){return d.tex},get width(){return i},get height(){return s},compute(f){e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,d.fb),e.viewport(0,0,i,s),e.useProgram(o),h(o,f.depthTexture,f.near,f.far,f.fovDeg,f.aspect,0),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/i,1/s),e.uniform1f(e.getUniformLocation(o,"uRadius"),f.radius??.55),e.uniform1f(e.getUniformLocation(o,"uStrength"),f.strength??1.15),e.uniform1f(e.getUniformLocation(o,"uBias"),f.bias??.035),t.blit(o);for(let[b,E,F]of[[d,c,[1,0]],[c,d,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,E.fb),e.viewport(0,0,i,s),e.useProgram(a),h(a,f.depthTexture,f.near,f.far,f.fovDeg,f.aspect,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,b.tex),e.uniform1i(e.getUniformLocation(a,"uAO"),1),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/i,1/s),e.uniform2f(e.getUniformLocation(a,"uDir"),F[0],F[1]),t.blit(a);e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(f,b){let E=Math.max(1,f>>1),F=Math.max(1,b>>1);E===i&&F===s||(i=E,s=F,l())},dispose(){e.deleteProgram(o),e.deleteProgram(a);for(let f of[d,c])e.deleteFramebuffer(f.fb),e.deleteTexture(f.tex)}}}var ar=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,ir=`#version 300 es
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
}`;function Ze(t,n,r){let{gl:e}=t,o=t.compile(ar,ir);if("kind"in o)return o;let a=Math.max(1,Math.floor(n)),i=Math.max(1,Math.floor(r)),s=e.createFramebuffer(),u=e.createTexture();if(!s||!u)return P("FRAMEBUFFER_INCOMPLETE","The GPU refused a depth-of-field buffer.");let d=()=>{e.bindTexture(e.TEXTURE_2D,u);let l=t.hdr?e.RGBA16F:e.RGBA8,m=t.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE;e.texImage2D(e.TEXTURE_2D,0,l,a,i,0,e.RGBA,m,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,s),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,u,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};d(),e.bindFramebuffer(e.FRAMEBUFFER,s);let c=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),c!==e.FRAMEBUFFER_COMPLETE?P("FRAMEBUFFER_INCOMPLETE",`The DOF buffer is incomplete (0x${c.toString(16)}).`):{texture:u,apply(l){e.bindFramebuffer(e.FRAMEBUFFER,s),e.viewport(0,0,a,i),e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.useProgram(o),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,l.scene),e.uniform1i(e.getUniformLocation(o,"uScene"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,l.depthTexture),e.uniform1i(e.getUniformLocation(o,"uDepth"),1),e.uniform2f(e.getUniformLocation(o,"uNearFar"),l.near,l.far),e.uniform1f(e.getUniformLocation(o,"uTanHalfFov"),Math.tan(l.fovDeg*Math.PI/360)),e.uniform1f(e.getUniformLocation(o,"uAspect"),l.aspect),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/a,1/i),e.uniform1f(e.getUniformLocation(o,"uFocusDistance"),l.focusDistance),e.uniform1f(e.getUniformLocation(o,"uAperture"),l.aperture??12),e.uniform1f(e.getUniformLocation(o,"uMaxCoc"),l.maxCoc??.012),t.blit(o),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),e.bindFramebuffer(e.FRAMEBUFFER,null),e.depthMask(!0),e.enable(e.DEPTH_TEST)},resize(l,m){let h=Math.max(1,Math.floor(l)),f=Math.max(1,Math.floor(m));h===a&&f===i||(a=h,i=f,d())},dispose(){e.deleteProgram(o),e.deleteFramebuffer(s),e.deleteTexture(u)}}}var sr=`
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
`;function Mt(t){let n=document.createElement("style");n.textContent=sr,document.head.appendChild(n);let r=document.createElement("section");r.id="lcx-fallback";let e=(o,a)=>{if(o===null)return`<td class="absent${a?" n":""}">absent</td>`;let i=String(o).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");return`<td class="${a?"n":""}">${i}</td>`};return r.innerHTML=`<h2>${t.title} \u2014 flat view</h2><p class="reads">${t.readsAs}</p>`+(t.notices??[]).map(o=>`<p class="notice">${o}</p>`).join("")+'<div id="lcx-refusal"></div>'+(t.html?`<div class="surface">${t.html}</div>`:"<table><thead><tr>"+t.columns.map(o=>`<th class="${o.numeric?"n":""}">${o.label}</th>`).join("")+"</tr></thead><tbody>"+t.rows.map(o=>"<tr>"+t.columns.map(a=>e(o[a.key]??null,!!a.numeric)).join("")+"</tr>").join("")+"</tbody></table>"),document.body.appendChild(r),{markRendered(){r.dataset.rendered="1"},showRefusal(o,a){let i=document.getElementById("lcx-refusal");i&&(i.innerHTML=`<p class="refusal"><strong>${o}</strong> \u2014 ${a} The measurements below are unaffected.</p>`),delete r.dataset.rendered;for(let s of Array.from(document.querySelectorAll("canvas")))s.style.display="none"}}}var H=new URLSearchParams(location.search),lt=Ge.includes(H.get("tier")??"")?H.get("tier"):"full",pe=Ve(lt),Ee=H.get("dof")!=="0"&&pe.dof,at=H.get("ao")!=="0"&&pe.ao,N=Math.max(1,Math.min(3,Number(H.get("scale")??1))),Ut=Number(H.get("frames")??300),v=1200*N,S=720*N,z=document.getElementById("c");z.width=v;z.height=S;var ur=document.getElementById("log");function ct(t){document.title="REFUSED";let n=document.getElementById("log");n&&(n.textContent=t);let[r,...e]=t.split(":");throw Ot?.showRefusal(r?.trim()??"REFUSED",e.join(":").trim()||t),new Error(t)}var Ot=null;function C(t,n){return"kind"in n&&ct(`${t}: ${n.code} \u2014 ${n.reason} ${n.detail??""}`),n}var Bt=Mt({title:"E1 \xB7 The Theatre \u2014 3D programme state",readsAs:"The rendered view puts five of these on lit panels at graded depths and racks focus to the one being built, which states where to look in a way a list cannot. This table has no such emphasis and no depth \u2014 and it carries every environment, including the one the five panels cannot show.",notices:["Each verdict is read from that environment's own README first line at build time, not typed here."],columns:[{key:"id",label:"Env"},{key:"name",label:"Name"},{key:"verdict",label:"Verdict (from its README)"}],rows:Object.values(L).map(t=>({id:t.id,name:t.name,verdict:t.verdict}))});Ot=Bt;H.get("refuse")==="1"&&ct("FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. The three-dimensional view is not being drawn.");var he=ve(z,{alpha:!1});Me(he)||ct(`stage: ${he.code} \u2014 ${he.reason}`);var U=he,T=U.gl,lr=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,cr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${Pe}
${Ne}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,dr=C("present",U.compile(lr,cr)),et=C("lit",qe(U)),Y=C("target",$e(U,v,S)),it=C("shadow",Qe(U,se(lt,1536))),fr=C("sky",Ye(U)),vt=C("ao",Je(U,v,S)),St=C("dof",Ze(U,v,S)),X={target:[0,.62,.1],distance:8.4,azimuthDeg:1.5,elevationDeg:7.2,fovDeg:38},k=ue(X),tt=X.fovDeg??38,st=Math.max(.01,X.distance/100),_t=Math.max(st+1,X.distance*8),xe=.06,Ct=[{id:"P1",x:-3.55,z:-1.25,w:1.72,h:1.3,hex:"#16203A",roughness:.5},{id:"P2",x:-1.62,z:.75,w:1.3,h:1.62,hex:"#16203A",roughness:.46},{id:"P3",x:.18,z:2.35,w:1.44,h:1.36,hex:"#2C6BFF",roughness:.42},{id:"P4",x:1.62,z:1.15,w:1.2,h:1.54,hex:"#2C6BFF",roughness:.44},{id:"P5",x:3.62,z:-2.1,w:1.78,h:1.18,hex:"#16203A",roughness:.52}],mr=.72,It=Be(30,24),kt=Ct.map(t=>Oe(t.w,t.h,xe)),hr=C("deck mesh",me(U,It)),br=kt.map((t,n)=>C(`panel ${n} mesh`,me(U,t))),Gt=(t,n,r,e)=>{let o=oe(),a=Math.cos(e),i=Math.sin(e);return o[0]=a,o[2]=-i,o[8]=i,o[10]=a,o[12]=t,o[13]=n,o[14]=r,o},pr=t=>new Float32Array([t[0],t[1],t[2],t[4],t[5],t[6],t[8],t[9],t[10]]),B=Ct.map((t,n)=>{let r=Math.atan2(k[0]-t.x,k[2]-t.z)*mr,e=Math.cos(r),o=Math.sin(r),a=Gt(t.x,t.h/2,t.z,r),i=(u,d)=>[t.x+e*u+o*(xe/2),d,t.z-o*u+e*(xe/2)],s=i(0,t.h/2);return{...t,yaw:r,model:a,facePoint:i,mesh:br[n],normalMat:pr(a),eyeDistance:Math.hypot(k[0]-s[0],k[1]-s[1],k[2]-s[2])}}),Vt=B.reduce((t,n)=>n.eyeDistance<t.eyeDistance?n:t),Te=Vt.eyeDistance,Er=new Float32Array([1,0,0,0,1,0,0,0,1]),rt=[{mesh:hr,model:Gt(0,0,0,0),normalMat:Er,material:{baseColour:Z("#070B14"),roughness:.86,metalness:0}},...B.map(t=>({mesh:t.mesh,model:t.model,normalMat:t.normalMat,material:{baseColour:Z(t.hex),roughness:t.roughness,metalness:.06}}))],I=[.62,-.55,-.58],Ht=[-4.8,0,-4.6],zt=[6.2,1.9,3],xr=We(Ht,zt),yr=je(Ht,zt),Lt=Xe({direction:I,colour:[1,1,1],extent:7.6},xr,yr),Tr=[It,...kt].reduce((t,n)=>t+Ce(n),0);function ye(){let t=le(X,v/S);et.shadowPass(Lt,rt,it),Y.bind(),T.clear(T.DEPTH_BUFFER_BIT),fr.draw({eye:k,target:X.target,fovDeg:tt,aspect:v/S}),et.depthPrepass(t,rt),at&&(vt.compute({depthTexture:Y.depthTexture,near:st,far:_t,fovDeg:tt,aspect:v/S,radius:.5,strength:1.3}),Y.bind()),et.draw({viewProj:t,eye:k,lightDir:I,lightColour:[3.5,3.45,3.3],ambientGain:1.05,lightVP:Lt,shadow:it,shadowStrength:.92,draws:rt,ao:at?vt.texture:null,screenSize:[v,S]});let n=Y.texture;Ee&&(St.apply({scene:Y.texture,depthTexture:Y.depthTexture,near:st,far:_t,fovDeg:tt,aspect:v/S,focusDistance:Te,aperture:.16,maxCoc:.014}),n=St.texture),T.bindFramebuffer(T.FRAMEBUFFER,null),T.viewport(0,0,v,S),T.disable(T.DEPTH_TEST),T.activeTexture(T.TEXTURE0),T.bindTexture(T.TEXTURE_2D,n),U.blit(dr,r=>T.uniform1i(T.getUniformLocation(r,"uScene"),0))}ye();function gr(t){ye();let n=new Uint8Array(4);T.readPixels(0,0,1,1,T.RGBA,T.UNSIGNED_BYTE,n);let r=performance.now();for(let e=0;e<t;e++)ye();return T.readPixels(0,0,1,1,T.RGBA,T.UNSIGNED_BYTE,n),(performance.now()-r)/t}var nt=gr(Math.max(1,Ut)),ge=le(X,v/S),Rr=t=>[t.facePoint(-t.w/2,0),t.facePoint(t.w/2,0),t.facePoint(t.w/2,t.h),t.facePoint(-t.w/2,t.h)].map(n=>V(ge,n,v,S)),K=B.map(Rr),dt=(t,n,r)=>{let e=0;for(let o=0;o<4;o++){let a=t[o],i=t[(o+1)%4],s=(i.sx-a.sx)*(r-a.sy)-(i.sy-a.sy)*(n-a.sx);if(Math.abs(s)<1e-9)continue;let u=s>0?1:-1;if(e===0)e=u;else if(u!==e)return!1}return!0},te=(()=>{let t=Math.hypot(I[0],I[1],I[2]);return[-I[0]/t,-I[1]/t,-I[2]/t]})(),Xt=(t,n,r,e)=>B.some((o,a)=>{if(a===e)return!1;let i=Math.cos(o.yaw),s=Math.sin(o.yaw),u=s*te[0]+i*te[2];if(Math.abs(u)<1e-6)return!1;let d=(s*(o.x-t)+i*(o.z-r))/u;if(d<=0)return!1;let c=t+te[0]*d,l=n+te[1]*d,m=r+te[2]*d,h=(c-o.x)*i-(m-o.z)*s;return Math.abs(h)<=o.w/2&&l>=0&&l<=o.h}),Ar=B.map((t,n)=>{let r=0,e=0,o=0,a=null;for(let c=1;c<=15;c++)for(let l=1;l<=23;l++){let m=(l/24-.5)*t.w,h=c/16*t.h,f=t.facePoint(m,h),b=V(ge,f,v,S);if(e++,Xt(f[0],f[1],f[2],n)&&o++,b.behind||b.sx<0||b.sx>=v||b.sy<0||b.sy>=S||B.some((F,p)=>p!==n&&F.eyeDistance<t.eyeDistance&&dt(K[p],b.sx,b.sy)))continue;r++;let E=Math.abs(m)/t.w+Math.abs(h-t.h/2)/t.h;(!a||E<a.rank)&&(a={sx:b.sx,sy:b.sy,rank:E})}let i=new Uint8Array(4);a&&T.readPixels(Math.round(a.sx),Math.round(S-a.sy),1,1,T.RGBA,T.UNSIGNED_BYTE,i);let s=Math.min(.014,Math.abs(1/Te-1/t.eyeDistance)*.16),u=K[n].map(c=>c.sx),d=K[n].map(c=>c.sy);return{id:t.id,hex:t.hex,eyeDistance:Number(t.eyeDistance.toFixed(2)),yawDeg:Number((t.yaw*180/Math.PI).toFixed(1)),cocPx:Number((s*(v/N)).toFixed(1)),visiblePct:Math.round(100*r/e),inShadowPct:Math.round(100*o/e),offFrame:K[n].some(c=>c.behind||c.sx<0||c.sx>v||c.sy<0||c.sy>S),screen:[Math.round(Math.min(...u)/N),Math.round(Math.min(...d)/N),Math.round(Math.max(...u)/N),Math.round(Math.max(...d)/N)],sample:a?{sx:Math.round(a.sx/N),sy:Math.round(a.sy/N),rgb:[i[0],i[1],i[2]]}:null}}),Fr=(()=>{let t=new Uint8Array(4),n={lit:{r:0,g:0,b:0,n:0},shade:{r:0,g:0,b:0,n:0}};for(let e=-5;e<=5.001;e+=.25)for(let o=-3.5;o<=4.001;o+=.25){let a=V(ge,[e,0,o],v,S);if(a.behind||a.sx<0||a.sx>=v||a.sy<0||a.sy>=S||K.some(s=>dt(s,a.sx,a.sy)))continue;T.readPixels(Math.round(a.sx),Math.round(S-a.sy),1,1,T.RGBA,T.UNSIGNED_BYTE,t);let i=Xt(e,0,o,-1)?n.shade:n.lit;i.r+=t[0],i.g+=t[1],i.b+=t[2],i.n+=1}let r=e=>e.n===0?null:[Math.round(e.r/e.n),Math.round(e.g/e.n),Math.round(e.b/e.n)];return{litSamples:n.lit.n,litRgb:r(n.lit),shadowedSamples:n.shade.n,shadowedRgb:r(n.shade)}})(),Mr={E0:"GGX + shadows + AO + DOF. 1.305 ms/frame at 1x on the M1, by trailing-readPixels",E1:"real DOM content projected onto lit GL surfaces \u2014 the panel you are reading",E2:"seven corridors, lift monotonic with distance; no landmasses yet",E5:"driven from the same input as the shipping flat engine; cell counts agree exactly",E6:"depth is time; fog is the reading limit on it, and both horizons are reported",E8:"on the sign-in route in both themes, with a CSS fallback and a pixel ratchet"},wt=["E1","E8","E0","E6","E5","E2"],Re=Object.keys(L).sort((t,n)=>(wt.indexOf(t)+1||99)-(wt.indexOf(n)+1||99)),ft=["P3","P4","P2","P5","P1"],jt=Re.slice(0,ft.length),be=Re.slice(ft.length),vr=t=>{let n=t.split(/[.·—]/)[0].trim();if(n.length<=26)return n.toUpperCase();let r=n.slice(0,26),e=r.lastIndexOf(" ");return(e>8?r.slice(0,e):r).toUpperCase()},Sr=Object.fromEntries(jt.map((t,n)=>{let r=ft[n],e=L[t];return[r,{tag:`${e.id} \xB7 ${e.name}`,state:vr(e.verdict),note:Mr[t]??e.verdict}]})),Dt=250,Pt=.11,re=.1,Ae=document.createElement("div");Ae.style.cssText="position:absolute;inset:0;pointer-events:none";var Fe=document.createElement("div");Fe.style.cssText="position:relative;overflow:hidden;width:1200px;height:720px";z.parentNode?.insertBefore(Fe,z);Fe.appendChild(z);Fe.appendChild(Ae);var _r=[...B].map((t,n)=>({p:t,i:n})).sort((t,n)=>n.p.eyeDistance-t.p.eyeDistance),Lr=[0,.06,-.06,.12,-.12,.18,-.18,.24,-.24,.3,-.3,.36,-.36],wr=[1,.92,.84,.76,.68,.6],Wt=t=>Math.min(.014,Math.abs(1/Te-1/t)*.16)*(v/N),Nt=Math.max(...B.map(t=>Wt(t.eyeDistance))),Dr=2.4,Pr=_r.map(({p:t,i:n})=>{let r=Sr[t.id],e=xe/2+.008,o=Math.cos(t.yaw),a=Math.sin(t.yaw),i=(x,A)=>[t.x+o*x+a*e,A,t.z-a*x+o*e],s=(x,A,M)=>({topLeft:i(M-x/2,re+A),topRight:i(M+x/2,re+A),bottomRight:i(M+x/2,re),bottomLeft:i(M-x/2,re)}),u=x=>x.filter(A=>B.some((M,w)=>w!==n&&M.eyeDistance<t.eyeDistance&&dt(K[w],A.x*N,A.y*N))).length,d=null,c=null,l=4;e:for(let x of wr){let A=Math.max(.2,(t.w-2*Pt)*x),M=Math.max(.2,(t.h-2*re)*x),w=Math.round(A*Dt),D=Math.round(M*Dt);for(let q of Lr){if(Math.abs(q)+A/2>t.w/2-Pt*.5)continue;let G=Ie(ge,s(A,M,q),v/N,S/N,w,D);if(ke(G)){c=G.refusal;continue}let J=u(G.screen);if(l=Math.min(l,J),J===0&&G.signedArea>0){d={proj:G,ew:w,eh:D,shift:q,scale:x,occluded:J};break e}}}if(!d)return{id:t.id,shown:!1,refusal:c??"NO_UNOCCLUDED_PLACEMENT",backFacing:!1,occludedCorners:l,contentShift:null,contentScale:null,perspectiveX:null,elementPx:null,rectError:null};let{proj:m,ew:h,eh:f}=d,b=t.hex==="#2C6BFF",E=b?"rgba(255,255,255,0.78)":"#7fb2ff",F=b?"rgba(255,255,255,0.80)":"rgba(198,212,236,0.78)",p=Wt(t.eyeDistance),R=Ee?Dr*(p/Math.max(1e-6,Nt)):0,g=Ee?1-.42*(p/Math.max(1e-6,Nt)):1,y=document.createElement("div");y.style.cssText=["position:absolute","left:0","top:0",`width:${h}px`,`height:${f}px`,"transform-origin:0 0",`transform:${m.transform}`,"display:flex","flex-direction:column","justify-content:flex-end","gap:7px","overflow:hidden",`filter:blur(${R.toFixed(2)}px)`,`opacity:${g.toFixed(3)}`,"-webkit-font-smoothing:antialiased"].join(";"),y.innerHTML=`<div style="font:600 11px/1 ui-monospace,monospace;letter-spacing:.14em;color:${E}">${r.tag}</div><div style="font:700 27px/1.02 system-ui,sans-serif;color:#fff;letter-spacing:-0.01em">${r.state}</div><div style="font:400 11.5px/1.45 system-ui,sans-serif;color:${F}">${r.note}</div>`,Ae.appendChild(y);let _=null;{let x=z.getBoundingClientRect(),A=y.getBoundingClientRect(),M=m.screen.map(D=>D.x),w=m.screen.map(D=>D.y);_=Number(Math.max(Math.abs(A.left-x.left-Math.min(...M)),Math.abs(A.top-x.top-Math.min(...w)),Math.abs(A.right-x.left-Math.max(...M)),Math.abs(A.bottom-x.top-Math.max(...w))).toFixed(2))}return{id:t.id,shown:!0,refusal:null,backFacing:!1,occludedCorners:0,contentShift:Number(d.shift.toFixed(2)),contentScale:d.scale,perspectiveX:Number((m.matrix[6]*1e3).toFixed(3)),elementPx:[h,f],cocPx:Number(p.toFixed(1)),domBlurPx:Number(R.toFixed(2)),domOpacity:Number(g.toFixed(3)),rectError:_}}),$t=(()=>{let t=T.getExtension("WEBGL_debug_renderer_info");return t?String(T.getParameter(t.UNMASKED_RENDERER_WEBGL)):"unknown"})(),ot=/swiftshader|llvmpipe|software/i.test($t);{let t=document.createElement("div");t.style.cssText="position:absolute;left:16px;top:14px;display:flex;flex-direction:column;gap:5px;font:500 10.5px/1.4 ui-monospace,monospace;letter-spacing:.05em",t.innerHTML=`<div style="color:#8FB7FF;font-weight:600;letter-spacing:.15em">3D PROGRAMME \xB7 ${Re.length} ENVIRONMENTS</div><div style="color:rgba(196,212,240,0.8)">STATE DERIVED FROM EACH README AT BUILD TIME</div>`+(be.length?`<div style="color:#E0A94A">${be.length} NOT SHOWN \u2014 ONLY 5 PANELS: ${be.join(" ")}</div>`:""),Ae.appendChild(t)}var ut=Ue();if(ut.length>0){let t="BRAND FIDELITY FAILED \u2014 "+ut.map(r=>`${r.key}: expected ${r.expected}, got ${r.actual}`).join("; ");document.title="REFUSED";let n=document.getElementById("log");throw n&&(n.textContent=t),new Error(t)}var Qt={tier:pe.tier,tierDprScale:pe.dprScale,tierShadowMapSize:se(lt,1536),shadowBaseline:1536,brandFidelity:ut,dof:Ee,ao:at,hdr:U.hdr,eye:k.map(t=>Number(t.toFixed(2))),focusPanel:Vt.id,focusDistance:Number(Te.toFixed(2)),panels:Ar,projections:Pr,environments:Re,environmentsShown:jt,environmentsOmitted:be,deck:Fr,glError:T.getError(),triangles:Tr,shadowMap:it.size,resolution:`${v}x${S}`,dprScale:N,frames:Ut,msPerFrame:Number(nt.toFixed(3)),fps:Math.round(1e3/nt),renderer:$t,rendererClass:ot?"software":"hardware",headroom:ot?null:Number((16.6-nt).toFixed(3)),headroomRefusal:ot?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null,hardwareMsPerFrame:null};globalThis.E1=Qt;ur.textContent=JSON.stringify(Qt,null,2);ye();Bt.markRendered();document.title="READY";

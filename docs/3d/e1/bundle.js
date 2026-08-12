var D={E0:{id:"E0",name:"THE SPIKE",verdict:"GATE MET"},E1:{id:"E1",name:"THE THEATRE",verdict:"THE HYBRID WORKS. \xA77(b) is now a real tension, not a gap."},E2:{id:"E2",name:"THE GLOBE",verdict:"CARRIES INFORMATION. \xA77(b) still unproven."},E3:{id:"E3",name:"THE PIPELINE",verdict:"READS, and it cost two engine bugs, a lost object and a fog that erased the room."},E4:{id:"E4",name:"THE ORRERY",verdict:`THE CROSSING CLAIM HOLDS AND IS CAMERA-INDEPENDENT. \xA72's "compartment you fly into" is not built, and \xA77(b) is not timed.`},E5:{id:"E5",name:"THE SURFACE",verdict:"AGREES WITH THE SHIPPING ENGINE. \xA72's ribbons and drag are not built."},E6:{id:"E6",name:"THE VAULT",verdict:"READS. Six framing errors, every one caught by a count."},E7:{id:"E7",name:"THE STORM",verdict:"THE INTEGRAL IS THE DATA \u2014 verified to 0.00% against the table, but a pixel mixes six days and \xA72's rotation is not built."},E8:{id:"E8",name:"THE FORGE",verdict:"the first shippable environment"}};var Rt={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected.",FEEDBACK_LOOP:"A layer of this view was asked to read the surface it draws into, which every driver refuses, so the layer is not being drawn. This is a defect in the renderer, not in the data."};function P(t,n){return n===void 0?{kind:"refused",code:t,reason:Rt[t]}:{kind:"refused",code:t,reason:Rt[t],detail:n}}function Pe(t){return t.kind==="stage"}function Ne(t,n={}){let r=t.getContext("webgl2",{antialias:n.antialias??!1,alpha:n.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!r)return P("NO_WEBGL2");let e=r.getExtension("EXT_color_buffer_float"),o=t.width,a=t.height,i=e?r.RGBA16F:r.RGBA8,s=e?r.HALF_FLOAT:r.UNSIGNED_BYTE,u=(p,y)=>{let A=r.createTexture();r.bindTexture(r.TEXTURE_2D,A),r.texImage2D(r.TEXTURE_2D,0,i,p,y,0,r.RGBA,s,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE);let x=r.createFramebuffer();r.bindFramebuffer(r.FRAMEBUFFER,x),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,A,0);let g=r.checkFramebufferStatus(r.FRAMEBUFFER);return g!==r.FRAMEBUFFER_COMPLETE?P("FRAMEBUFFER_INCOMPLETE",`status 0x${g.toString(16)} at ${p}\xD7${y}`):{texture:A,framebuffer:x,width:p,height:y}},l=n.bloomShift??2,d={w:o,h:a},c=u(o,a);if("kind"in c)return c;let m=u(Math.max(1,o>>l),Math.max(1,a>>l));if("kind"in m)return m;let h=u(Math.max(1,o>>l),Math.max(1,a>>l));if("kind"in h)return h;let E=r.createVertexArray();r.bindVertexArray(E);let f=r.createBuffer();r.bindBuffer(r.ARRAY_BUFFER,f),r.bufferData(r.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),r.STATIC_DRAW),r.enableVertexAttribArray(0),r.vertexAttribPointer(0,2,r.FLOAT,!1,0,0),r.bindVertexArray(null);let b=[];return{kind:"stage",gl:r,cssWidth:t.clientWidth||o,cssHeight:t.clientHeight||a,hdr:!!e,get width(){return d.w},get height(){return d.h},get scene(){return c},get bloomA(){return m},get bloomB(){return h},setRegion(p,y){let A=Math.max(1,Math.round(p)),x=Math.max(1,Math.round(y));if(!(A===d.w&&x===d.h)){d={w:A,h:x};for(let g of[c,m,h])"kind"in g||(r.deleteFramebuffer(g.framebuffer),r.deleteTexture(g.texture));c=u(A,x),m=u(Math.max(1,A>>l),Math.max(1,x>>l)),h=u(Math.max(1,A>>l),Math.max(1,x>>l))}},compile(p,y){let A=(R,F)=>{let M=r.createShader(R);if(r.shaderSource(M,F),r.compileShader(M),!r.getShaderParameter(M,r.COMPILE_STATUS)){let S=r.getShaderInfoLog(M)??"(no log)";return r.deleteShader(M),P("SHADER_COMPILE_FAILED",S)}return M},x=A(r.VERTEX_SHADER,p);if(typeof x=="object"&&"kind"in x)return x;let g=A(r.FRAGMENT_SHADER,y);if(typeof g=="object"&&"kind"in g)return r.deleteShader(x),g;let w=r.createProgram();if(r.attachShader(w,x),r.attachShader(w,g),r.linkProgram(w),!r.getProgramParameter(w,r.LINK_STATUS)){let R=r.getProgramInfoLog(w)??"(no log)";return r.deleteShader(x),r.deleteShader(g),r.deleteProgram(w),P("PROGRAM_LINK_FAILED",R)}return r.detachShader(w,x),r.detachShader(w,g),r.deleteShader(x),r.deleteShader(g),b.push(w),w},bindTarget(p){r.bindFramebuffer(r.FRAMEBUFFER,p?p.framebuffer:null),r.viewport(0,0,p?p.width:d.w,p?p.height:d.h)},blit(p,y){r.useProgram(p),r.bindVertexArray(E),y?.(p),r.drawArrays(r.TRIANGLES,0,3),r.bindVertexArray(null)},dispose(){for(let p of b)r.deleteProgram(p);for(let p of[c,m,h])"kind"in p||(r.deleteFramebuffer(p.framebuffer),r.deleteTexture(p.texture));r.deleteBuffer(f),r.deleteVertexArray(E)}}}var le=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function ce(t,n){let r=new Float32Array(16);for(let e=0;e<4;e++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=t[i*4+o]*n[e*4+i];r[e*4+o]=a}return r}var K=(t,n)=>[t[0]-n[0],t[1]-n[1],t[2]-n[2]],ue=(t,n)=>t[0]*n[0]+t[1]*n[1]+t[2]*n[2],Y=(t,n)=>[t[1]*n[2]-t[2]*n[1],t[2]*n[0]-t[0]*n[2],t[0]*n[1]-t[1]*n[0]];function I(t){let n=Math.hypot(t[0],t[1],t[2]);return n===0?t:[t[0]/n,t[1]/n,t[2]/n]}function Ue(t,n,r,e){let o=1/Math.tan(t/2);return new Float32Array([o/n,0,0,0,0,o,0,0,0,0,(e+r)/(r-e),-1,0,0,2*e*r/(r-e),0])}function Ce(t,n,r,e,o,a){let i=n-t,s=e-r,u=a-o;return new Float32Array([2/i,0,0,0,0,2/s,0,0,0,0,-2/u,0,-(n+t)/i,-(e+r)/s,-(a+o)/u,1])}function de(t,n,r){let e=I(K(t,n)),o=Y(r,e);if(Math.hypot(o[0],o[1],o[2])<1e-8)return le();let a=I(o),i=Y(e,a);return new Float32Array([a[0],i[0],e[0],0,a[1],i[1],e[1],0,a[2],i[2],e[2],0,-ue(a,t),-ue(i,t),-ue(e,t),1])}function At(t,n){let r=[0,1,2,3].map(o=>t[0+o]*n[0]+t[4+o]*n[1]+t[8+o]*n[2]+t[12+o]),e=r[3];return{x:r[0]/e,y:r[1]/e,z:r[2]/e,w:e}}function W(t,n,r,e){let o=At(t,n);return{sx:(o.x*.5+.5)*r,sy:(1-(o.y*.5+.5))*e,behind:o.w<=0}}function Ft(t){return t<=.04045?t/12.92:Math.pow((t+.055)/1.055,2.4)}function Oe(t){return t<=.0031308?t*12.92:1.055*Math.pow(t,1/2.4)-.055}var cr=/^#?([0-9a-fA-F]{6})$/;function oe(t){let n=cr.exec(t.trim());if(!n)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(t)}`);let r=n[1];return[0,2,4].map(e=>Ft(parseInt(r.slice(e,e+2),16)/255))}function Be(t){return`#${t.map(r=>{let e=Oe(Math.min(1,Math.max(0,r)));return Math.round(e*255).toString(16).padStart(2,"0")}).join("")}`}var q={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},Ie=Object.freeze(Object.fromEntries(Object.keys(q).map(t=>[t,oe(q[t])])));var Mt=.4;var Ge=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${Mt.toFixed(2)}); }`,ke=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function Ve(){let t=[];for(let n of Object.keys(q)){let r=q[n].toLowerCase(),e=Be(Ie[n]).toLowerCase();e!==r&&t.push({key:n,expected:r,actual:e})}return t}function dr(t){let n=[1/0,1/0,1/0],r=[-1/0,-1/0,-1/0];for(let e=0;e<t.length;e+=3)for(let o=0;o<3;o++){let a=t[e+o];a<n[o]&&(n[o]=a),a>r[o]&&(r[o]=a)}return t.length===0?{min:[0,0,0],max:[0,0,0]}:{min:n,max:r}}function vt(t,n,r,e){let o=new Float32Array(t.length);for(let i=0;i<e.length;i+=3){let s=e[i],u=e[i+1],l=e[i+2],d=s*3,c=u*3,m=l*3,h=s*2,E=u*2,f=l*2,b=t[c]-t[d],v=t[c+1]-t[d+1],p=t[c+2]-t[d+2],y=t[m]-t[d],A=t[m+1]-t[d+1],x=t[m+2]-t[d+2],g=r[E]-r[h],w=r[E+1]-r[h+1],R=r[f]-r[h],F=r[f+1]-r[h+1],M=g*F-R*w;if(Math.abs(M)<1e-12)continue;let S=1/M,V=(b*F-y*w)*S,ne=(v*F-A*w)*S,j=(p*F-x*w)*S;for(let C of[d,c,m])o[C]=o[C]+V,o[C+1]=o[C+1]+ne,o[C+2]=o[C+2]+j}let a=new Float32Array(t.length);for(let i=0;i<a.length;i+=3){let s=n[i],u=n[i+1],l=n[i+2],d=o[i],c=o[i+1],m=o[i+2],h=d*s+c*u+m*l;d-=s*h,c-=u*h,m-=l*h;let E=Math.hypot(d,c,m);E<1e-8&&(Math.abs(s)<.9?(d=0,c=-l,m=u):(d=-l,c=0,m=s),E=Math.hypot(d,c,m)||1),a[i]=d/E,a[i+1]=c/E,a[i+2]=m/E}return a}function St(t,n){let r=new Float32Array(t.length);for(let e=0;e<n.length;e+=3){let o=n[e]*3,a=n[e+1]*3,i=n[e+2]*3,s=t[a]-t[o],u=t[a+1]-t[o+1],l=t[a+2]-t[o+2],d=t[i]-t[o],c=t[i+1]-t[o+1],m=t[i+2]-t[o+2],h=u*m-l*c,E=l*d-s*m,f=s*c-u*d;for(let b of[o,a,i])r[b]=r[b]+h,r[b+1]=r[b+1]+E,r[b+2]=r[b+2]+f}for(let e=0;e<r.length;e+=3){let o=Math.hypot(r[e],r[e+1],r[e+2]);o>0&&(r[e]=r[e]/o,r[e+1]=r[e+1]/o,r[e+2]=r[e+2]/o)}return r}function Lt(t,n,r,e,o){let{min:a,max:i}=dr(t),s=e??St(t,r);return{positions:t,normals:s,uvs:n,indices:r,min:a,max:i,tangents:o??vt(t,s,n,r)}}function He(t=1,n=1,r=1){let e=t/2,o=n/2,a=r/2,i=[[[-e,-o,a],[e,-o,a],[e,o,a],[-e,o,a]],[[e,-o,-a],[-e,-o,-a],[-e,o,-a],[e,o,-a]],[[e,-o,a],[e,-o,-a],[e,o,-a],[e,o,a]],[[-e,-o,-a],[-e,-o,a],[-e,o,a],[-e,o,-a]],[[-e,o,a],[e,o,a],[e,o,-a],[-e,o,-a]],[[-e,-o,-a],[e,-o,-a],[e,-o,a],[-e,-o,a]]],s=new Float32Array(72),u=new Float32Array(48),l=new Uint16Array(36),d=0,c=0,m=0,h=0;for(let E of i){for(let[f,b,v]of E)s[d++]=f,s[d++]=b,s[d++]=v;u[c++]=0,u[c++]=0,u[c++]=1,u[c++]=0,u[c++]=1,u[c++]=1,u[c++]=0,u[c++]=1,l[m++]=h,l[m++]=h+1,l[m++]=h+2,l[m++]=h,l[m++]=h+2,l[m++]=h+3,h+=4}return Lt(s,u,l)}function ze(t=10,n=24){let r=Math.max(1,Math.floor(n)),e=(r+1)*(r+1),o=new Float32Array(e*3),a=new Float32Array(e*3),i=new Float32Array(e*2),s=new Uint16Array(r*r*6),u=0,l=0,d=0;for(let c=0;c<=r;c++)for(let m=0;m<=r;m++){let h=(m/r-.5)*t,E=(c/r-.5)*t;o[u]=h,o[u+1]=0,o[u+2]=E,a[u]=0,a[u+1]=1,a[u+2]=0,u+=3,i[l++]=m/r,i[l++]=c/r}for(let c=0;c<r;c++)for(let m=0;m<r;m++){let h=c*(r+1)+m,E=h+1,f=h+(r+1),b=f+1;s[d++]=h,s[d++]=f,s[d++]=E,s[d++]=E,s[d++]=f,s[d++]=b}return Lt(o,i,s,a)}function Xe(t){return t.indices.length/3}function mr(t){if(!Number.isFinite(t)||t===0)return"0";let n=t.toFixed(12).replace(/0+$/,"").replace(/\.$/,"");return n==="-0"?"0":n}function _t(t,n,r,e){let[o,a]=t,[i,s]=n,[u,l]=r,[d,c]=e,m=o-i+u-d,h=a-s+l-c;if(Math.abs(m)<1e-9&&Math.abs(h)<1e-9){let x=[i-o,d-o,o,s-a,c-a,a,0,0,1],g=x[0]*x[4]-x[1]*x[3];return Math.abs(g)<1e-9?null:x}let E=i-u,f=d-u,b=s-l,v=c-l,p=E*v-f*b;if(Math.abs(p)<1e-9)return null;let y=(m*v-f*h)/p,A=(E*h-m*b)/p;return[i-o+y*i,d-o+A*d,o,s-a+y*s,c-a+A*c,a,y,A,1]}function je(t,n,r,e,o,a){if(!(o>0)||!(a>0))return{refusal:"EMPTY_ELEMENT_BOX"};let s=[n.topLeft,n.topRight,n.bottomRight,n.bottomLeft].map(S=>W(t,S,r,e));if(s.some(S=>S.behind))return{refusal:"CORNER_BEHIND_CAMERA"};let u=s.map(S=>({x:S.sx,y:S.sy})),[l,d,c,m]=u,h=_t([l.x,l.y],[d.x,d.y],[c.x,c.y],[m.x,m.y]);if(!h)return{refusal:"DEGENERATE_ON_SCREEN"};let E=.5*(l.x*d.y-d.x*l.y+(d.x*c.y-c.x*d.y)+(c.x*m.y-m.x*c.y)+(m.x*l.y-l.x*m.y)),f=1/o,b=1/a,[v,p,y,A,x,g,w,R,F]=h;return{transform:`matrix3d(${[v*f,A*f,0,w*f,p*b,x*b,0,R*b,0,0,1,0,y,g,0,F].map(mr).join(", ")})`,matrix:h,screen:u,signedArea:E}}function We(t){return"refusal"in t}var wt=t=>[t.DEPTH_TEST,t.CULL_FACE,t.BLEND];function O(t){return[t.getParameter(t.FRAMEBUFFER_BINDING),t.getParameter(t.VIEWPORT),t.getParameter(t.DEPTH_WRITEMASK),wt(t).map(n=>t.getParameter(n))]}function B(t,n){t.bindFramebuffer(t.FRAMEBUFFER,n[0]);let r=n[1];t.viewport(r[0]??0,r[1]??0,r[2]??0,r[3]??0),t.depthMask(n[2]),wt(t).forEach((e,o)=>{n[3][o]?t.enable(e):t.disable(e)})}function J(t,n){for(let r=n-1;r>=0;r--)t.activeTexture(t.TEXTURE0+r),t.bindTexture(t.TEXTURE_2D,null),t.bindTexture(t.TEXTURE_3D,null);t.activeTexture(t.TEXTURE0)}var $e=["minimum","reduced","full"],fr={full:{dprScale:2,ao:!0,aoScale:.5,dof:!0,shadowMapSize:1536,shadowTaps:9,particleCapacity:4096,volumeMaxSteps:128,volumeLightSteps:6},reduced:{dprScale:2,ao:!0,aoScale:.5,dof:!1,shadowMapSize:1024,shadowTaps:9,particleCapacity:2048,volumeMaxSteps:96,volumeLightSteps:4},minimum:{dprScale:1,ao:!1,aoScale:.5,dof:!1,shadowMapSize:512,shadowTaps:1,particleCapacity:512,volumeMaxSteps:48,volumeLightSteps:0}};function me(t,n){let r=Number.isFinite(n)&&n>0?n:1024,o=r*(t==="full"?1:t==="reduced"?.5:.25),a=2**Math.round(Math.log2(o));return Math.max(256,Math.min(r,a))}function Qe(t){return{tier:t,...fr[t]}}var Ye=89,Ke=Math.PI/180;function fe(t){let n=Math.max(-Ye,Math.min(Ye,t.elevationDeg))*Ke,r=t.azimuthDeg*Ke,e=Math.max(1e-4,t.distance),o=Math.sin(n)*e,a=Math.cos(n)*e;return[t.target[0]+Math.sin(r)*a,t.target[1]+o,t.target[2]+Math.cos(r)*a]}function he(t,n){let r=fe(t),e=t.near??Math.max(.01,t.distance/100),o=t.far??Math.max(e+1,t.distance*8),a=Ue((t.fovDeg??38)*Ke,Math.max(.001,n),e,o),i=de(r,t.target,[0,1,0]);return ce(a,i)}function qe(t,n,r){let e=I(t.direction),o=t.extent??Math.max(.1,r*1.35),a=Math.max(1,r*2),i=[n[0]-e[0]*a,n[1]-e[1]*a,n[2]-e[2]*a],s=Math.abs(e[1])>.99?[0,0,1]:[0,1,0],u=de(i,n,s),l=Ce(-o,o,-o,o,.01,a+r*2+o);return ce(l,u)}function Je(t,n){let r=K([n[0],n[1],n[2]],[t[0],t[1],t[2]]);return Math.hypot(r[0],r[1],r[2])/2}function Ze(t,n){return[(t[0]+n[0])/2,(t[1]+n[1])/2,(t[2]+n[2])/2]}function et(t,n,r){let{gl:e}=t,o=Math.max(1,Math.floor(n)),a=Math.max(1,Math.floor(r)),i=e.createFramebuffer(),s=e.createTexture(),u=e.createTexture();if(!i||!s||!u)return P("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let l=t.hdr?e.RGBA16F:e.RGBA8,d=t.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE,c=()=>{e.bindTexture(e.TEXTURE_2D,s),e.texImage2D(e.TEXTURE_2D,0,l,o,a,0,e.RGBA,d,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_2D,u),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,o,a,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,s,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,u,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};c(),e.bindFramebuffer(e.FRAMEBUFFER,i);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE?P("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${m.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:s,depthTexture:u,get width(){return o},get height(){return a},bind(){e.bindFramebuffer(e.FRAMEBUFFER,i),e.viewport(0,0,o,a)},resize(h,E){let f=Math.max(1,Math.floor(h)),b=Math.max(1,Math.floor(E));f===o&&b===a||(o=f,a=b,c())},dispose(){e.deleteFramebuffer(i),e.deleteTexture(s),e.deleteTexture(u)}}}function tt(t,n=1024){let{gl:r}=t,e=Math.max(256,Math.min(2048,Math.floor(n))),o=r.createFramebuffer(),a=r.createTexture();if(!o||!a)return P("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");r.bindTexture(r.TEXTURE_2D,a),r.texImage2D(r.TEXTURE_2D,0,r.DEPTH_COMPONENT24,e,e,0,r.DEPTH_COMPONENT,r.UNSIGNED_INT,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),r.bindFramebuffer(r.FRAMEBUFFER,o),r.framebufferTexture2D(r.FRAMEBUFFER,r.DEPTH_ATTACHMENT,r.TEXTURE_2D,a,0);let i=r.checkFramebufferStatus(r.FRAMEBUFFER);return r.bindFramebuffer(r.FRAMEBUFFER,null),i!==r.FRAMEBUFFER_COMPLETE?P("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:e,bind(){r.bindFramebuffer(r.FRAMEBUFFER,o),r.viewport(0,0,e,e)},dispose(){r.deleteFramebuffer(o),r.deleteTexture(a)}}}var be=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,pe={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function Ee(t,n,r={}){let e=r.zenith??pe.zenith,o=r.horizon??pe.horizon,a=r.ground??pe.ground;t.uniform3f(t.getUniformLocation(n,"uSkyZenith"),e[0],e[1],e[2]),t.uniform3f(t.getUniformLocation(n,"uSkyHorizon"),o[0],o[1],o[2]),t.uniform3f(t.getUniformLocation(n,"uSkyGround"),a[0],a[1],a[2])}var hr=`#version 300 es
precision highp float;
out vec2 vNdc;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`,pr=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${be}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;function rt(t){let{gl:n}=t,r=t.compile(hr,pr);return"kind"in r?r:{draw(e){let o=I(K(e.target,e.eye)),a=Math.abs(o[1])>.999?[0,0,1]:[0,1,0],i=I(Y(o,a)),s=I(Y(i,o)),u=O(n);n.disable(n.DEPTH_TEST),n.depthMask(!1),n.disable(n.BLEND),n.useProgram(r),n.uniform3f(n.getUniformLocation(r,"uRight"),i[0],i[1],i[2]),n.uniform3f(n.getUniformLocation(r,"uUp"),s[0],s[1],s[2]),n.uniform3f(n.getUniformLocation(r,"uForward"),o[0],o[1],o[2]),n.uniform1f(n.getUniformLocation(r,"uTanHalfFov"),Math.tan(e.fovDeg*Math.PI/360)),n.uniform1f(n.getUniformLocation(r,"uAspect"),Math.max(.001,e.aspect)),Ee(n,r,e.sky),t.blit(r),B(n,u)},dispose(){n.deleteProgram(r)}}}var Dt=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,nt=`#version 300 es
precision highp float;
void main(){}`,br=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,Pt=`#version 300 es
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
}`,Nt=`#version 300 es
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
${be}

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
}`;function xe(t,n){let{gl:r}=t,e=r.createVertexArray(),o=r.createBuffer(),a=r.createBuffer(),i=r.createBuffer(),s=r.createBuffer();return!e||!o||!a||!i||!s?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(r.bindVertexArray(e),r.bindBuffer(r.ARRAY_BUFFER,o),r.bufferData(r.ARRAY_BUFFER,n.positions,r.STATIC_DRAW),r.enableVertexAttribArray(0),r.vertexAttribPointer(0,3,r.FLOAT,!1,0,0),r.bindBuffer(r.ARRAY_BUFFER,a),r.bufferData(r.ARRAY_BUFFER,n.normals,r.STATIC_DRAW),r.enableVertexAttribArray(1),r.vertexAttribPointer(1,3,r.FLOAT,!1,0,0),r.bindBuffer(r.ARRAY_BUFFER,i),r.bufferData(r.ARRAY_BUFFER,n.tangents,r.STATIC_DRAW),r.enableVertexAttribArray(2),r.vertexAttribPointer(2,3,r.FLOAT,!1,0,0),r.bindBuffer(r.ELEMENT_ARRAY_BUFFER,s),r.bufferData(r.ELEMENT_ARRAY_BUFFER,n.indices,r.STATIC_DRAW),r.bindVertexArray(null),{vao:e,indexCount:n.indices.length,indexType:n.indices instanceof Uint32Array?r.UNSIGNED_INT:r.UNSIGNED_SHORT,dispose(){r.deleteVertexArray(e),r.deleteBuffer(o),r.deleteBuffer(a),r.deleteBuffer(i),r.deleteBuffer(s)}})}function ot(t){let{gl:n}=t,r=t.compile(Dt,nt);if("kind"in r)return r;let e=t.compile(Pt,Nt);if("kind"in e)return e;let o=t.compile(br,nt);if("kind"in o)return o;let a=(i,s)=>n.getUniformLocation(i,s);return{shadowPass(i,s,u,l){let d=O(n),c=l??(()=>{});u.bind(),c("shadow.bind"),n.clear(n.DEPTH_BUFFER_BIT),n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.FRONT),n.useProgram(r),c("useProgram(shadow)"),n.uniformMatrix4fv(a(r,"uLightVP"),!1,i),c("uLightVP");for(let m of s)n.uniformMatrix4fv(a(r,"uModel"),!1,m.model),c("shadow uModel"),n.bindVertexArray(m.mesh.vao),c("shadow bindVAO"),n.drawElements(n.TRIANGLES,m.mesh.indexCount,m.mesh.indexType,0),c("shadow drawElements");n.bindVertexArray(null),n.cullFace(n.BACK),B(n,d)},depthPrepass(i,s){let u=O(n);n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.colorMask(!1,!1,!1,!1),n.useProgram(o),n.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let l of s)n.uniformMatrix4fv(a(o,"uModel"),!1,l.model),n.bindVertexArray(l.mesh.vao),n.drawElements(n.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0);n.bindVertexArray(null),n.colorMask(!0,!0,!0,!0),B(n,u)},draw(i){let s=O(n),u=i.onStep??(()=>{});if(n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.useProgram(e),n.uniformMatrix4fv(a(e,"uViewProj"),!1,i.viewProj),u("uViewProj"),n.uniform3fv(a(e,"uEye"),i.eye),u("uEye"),n.uniform3fv(a(e,"uLightDir"),i.lightDir),u("uLightDir"),n.uniform3fv(a(e,"uLightColour"),i.lightColour),u("uLightColour"),n.uniform1f(a(e,"uAmbientGain"),i.ambientGain??1),u("uAmbientGain"),i.fog&&i.fog.density>0){n.uniform1f(a(e,"uFogDensity"),i.fog.density),n.uniform1f(a(e,"uFogHeight"),i.fog.height),n.uniform1f(a(e,"uFogFloor"),i.fog.floor??0);let l=i.fog.colour;l==="sky"?n.uniform3f(a(e,"uFogColour"),-1,-1,-1):n.uniform3f(a(e,"uFogColour"),l[0],l[1],l[2]),u("fog")}else n.uniform1f(a(e,"uFogDensity"),0);Ee(n,e,i.sky),u("bindSky"),i.ao&&i.screenSize?(n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,i.ao),n.uniform1i(a(e,"uAO"),1),n.uniform2f(a(e,"uScreenSize"),i.screenSize[0],i.screenSize[1]),n.uniform1f(a(e,"uAOEnabled"),1)):n.uniform1f(a(e,"uAOEnabled"),0),u("bindAO"),n.uniformMatrix4fv(a(e,"uLightVP"),!1,i.lightVP),u("lit uLightVP"),i.shadow?(n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,i.shadow.depthTexture),n.uniform1i(a(e,"uShadowMap"),0),n.uniform1f(a(e,"uShadowTexel"),1/i.shadow.size),n.uniform1f(a(e,"uShadowStrength"),i.shadowStrength??1)):n.uniform1f(a(e,"uShadowStrength"),0);for(let l of i.draws)n.uniformMatrix4fv(a(e,"uModel"),!1,l.model),n.uniformMatrix3fv(a(e,"uNormalMat"),!1,l.normalMat),u("uNormalMat"),n.uniform3fv(a(e,"uBaseColour"),l.material.baseColour),u("uBaseColour"),n.uniform1f(a(e,"uRoughness"),l.material.roughness),n.uniform1f(a(e,"uMetalness"),l.material.metalness),n.uniform1f(a(e,"uAnisotropy"),l.material.anisotropy??0),n.bindVertexArray(l.mesh.vao),u("lit bindVAO"),n.drawElements(n.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0),u("lit drawElements");n.bindVertexArray(null),J(n,2),B(n,s)},dispose(){n.deleteProgram(r),n.deleteProgram(e),n.deleteProgram(o)}}}var ae=`
uniform sampler2D uDepth;
uniform vec2 uNearFar;

float linearDepthAt(vec2 uv) {
  float d = texture(uDepth, uv).r * 2.0 - 1.0;
  float n = uNearFar.x, f = uNearFar.y;
  return (2.0 * n * f) / (f + n - d * (f - n));
}`,Ct=`
uniform float uTanHalfFov;
uniform float uAspect;

vec3 viewPosAt(vec2 uv) {
  float z = linearDepthAt(uv);
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x * uTanHalfFov * uAspect * z, ndc.y * uTanHalfFov * z, -z);
}`,Ot=ae+Ct,Ut=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Er=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${Ot}

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
}`,xr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${ae}

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
}`;function at(t,n,r){let{gl:e}=t,o=t.compile(Ut,Er);if("kind"in o)return o;let a=t.compile(Ut,xr);if("kind"in a)return a;let i=Math.max(1,n>>1),s=Math.max(1,r>>1),u=()=>{let f=e.createFramebuffer(),b=e.createTexture();return!f||!b?null:{fb:f,tex:b}},l=u(),d=u();if(!l||!d)return P("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let c=()=>{for(let f of[l,d])e.bindTexture(e.TEXTURE_2D,f.tex),e.texImage2D(e.TEXTURE_2D,0,e.R8,i,s,0,e.RED,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,f.fb),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,f.tex,0);e.bindFramebuffer(e.FRAMEBUFFER,null)};c(),e.bindFramebuffer(e.FRAMEBUFFER,l.fb);let m=e.checkFramebufferStatus(e.FRAMEBUFFER);if(e.bindFramebuffer(e.FRAMEBUFFER,null),m!==e.FRAMEBUFFER_COMPLETE)return P("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${m.toString(16)}).`);let h=(f,b,v,p,y)=>{e.activeTexture(e.TEXTURE0+y),e.bindTexture(e.TEXTURE_2D,b),e.uniform1i(e.getUniformLocation(f,"uDepth"),y),e.uniform2f(e.getUniformLocation(f,"uNearFar"),v,p)},E=(f,b,v,p,y,A,x)=>{h(f,b,v,p,x),e.uniform1f(e.getUniformLocation(f,"uTanHalfFov"),Math.tan(y*Math.PI/360)),e.uniform1f(e.getUniformLocation(f,"uAspect"),A)};return{get texture(){return l.tex},get width(){return i},get height(){return s},compute(f){let b=O(e);e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.bindFramebuffer(e.FRAMEBUFFER,l.fb),e.viewport(0,0,i,s),e.useProgram(o),E(o,f.depthTexture,f.near,f.far,f.fovDeg,f.aspect,0),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/i,1/s),e.uniform1f(e.getUniformLocation(o,"uRadius"),f.radius??.55),e.uniform1f(e.getUniformLocation(o,"uStrength"),f.strength??1.15),e.uniform1f(e.getUniformLocation(o,"uBias"),f.bias??.035),t.blit(o);for(let[v,p,y]of[[l,d,[1,0]],[d,l,[0,1]]])e.bindFramebuffer(e.FRAMEBUFFER,p.fb),e.viewport(0,0,i,s),e.useProgram(a),h(a,f.depthTexture,f.near,f.far,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,v.tex),e.uniform1i(e.getUniformLocation(a,"uAO"),1),e.uniform2f(e.getUniformLocation(a,"uTexel"),1/i,1/s),e.uniform2f(e.getUniformLocation(a,"uDir"),y[0],y[1]),t.blit(a);J(e,2),B(e,b)},resize(f,b){let v=Math.max(1,f>>1),p=Math.max(1,b>>1);v===i&&p===s||(i=v,s=p,c())},dispose(){e.deleteProgram(o),e.deleteProgram(a);for(let f of[l,d])e.deleteFramebuffer(f.fb),e.deleteTexture(f.tex)}}}var yr=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Tr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uFocusDistance;
uniform float uAperture;
uniform float uMaxCoc;
out vec4 frag;
${ae}

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
}`;function it(t,n,r){let{gl:e}=t,o=t.compile(yr,Tr);if("kind"in o)return o;let a=Math.max(1,Math.floor(n)),i=Math.max(1,Math.floor(r)),s=e.createFramebuffer(),u=e.createTexture();if(!s||!u)return P("FRAMEBUFFER_INCOMPLETE","The GPU refused a depth-of-field buffer.");let l=()=>{e.bindTexture(e.TEXTURE_2D,u);let c=t.hdr?e.RGBA16F:e.RGBA8,m=t.hdr?e.HALF_FLOAT:e.UNSIGNED_BYTE;e.texImage2D(e.TEXTURE_2D,0,c,a,i,0,e.RGBA,m,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,s),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,u,0),e.bindFramebuffer(e.FRAMEBUFFER,null)};l(),e.bindFramebuffer(e.FRAMEBUFFER,s);let d=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),d!==e.FRAMEBUFFER_COMPLETE?P("FRAMEBUFFER_INCOMPLETE",`The DOF buffer is incomplete (0x${d.toString(16)}).`):{texture:u,apply(c){let m=O(e);e.bindFramebuffer(e.FRAMEBUFFER,s),e.viewport(0,0,a,i),e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.useProgram(o),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,c.scene),e.uniform1i(e.getUniformLocation(o,"uScene"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,c.depthTexture),e.uniform1i(e.getUniformLocation(o,"uDepth"),1),e.uniform2f(e.getUniformLocation(o,"uNearFar"),c.near,c.far),e.uniform2f(e.getUniformLocation(o,"uTexel"),1/a,1/i),e.uniform1f(e.getUniformLocation(o,"uFocusDistance"),c.focusDistance),e.uniform1f(e.getUniformLocation(o,"uAperture"),c.aperture??12),e.uniform1f(e.getUniformLocation(o,"uMaxCoc"),c.maxCoc??.012),t.blit(o),J(e,2),B(e,m)},resize(c,m){let h=Math.max(1,Math.floor(c)),E=Math.max(1,Math.floor(m));h===a&&E===i||(a=h,i=E,l())},dispose(){e.deleteProgram(o),e.deleteFramebuffer(s),e.deleteTexture(u)}}}var gr=`
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
`;function H(t){return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function Bt(t){let n=document.createElement("style");n.textContent=gr,document.head.appendChild(n);let r=document.createElement("section");r.id="lcx-fallback",r.setAttribute("aria-label",`${t.title} \u2014 flat view`),r.setAttribute("tabindex","-1"),document.getElementById("log")?.setAttribute("aria-hidden","true");let e=(a,i)=>a===null?`<td class="absent${i?" n":""}">absent</td>`:`<td class="${i?"n":""}">${H(a)}</td>`;r.innerHTML=`<h2>${H(t.title)} \u2014 flat view</h2><p class="reads">${H(t.readsAs)}</p>`+(t.notices??[]).map(a=>`<p class="notice">${H(a)}</p>`).join("")+'<div id="lcx-refusal" role="alert"></div>'+(t.html?`<div class="surface">${t.html}</div>`:`<table><caption>${H(t.title)} \u2014 flat view</caption><thead><tr>`+t.columns.map(a=>`<th scope="col" class="${a.numeric?"n":""}">${H(a.label)}</th>`).join("")+"</tr></thead><tbody>"+t.rows.map(a=>"<tr>"+t.columns.map(i=>e(a[i.key]??null,!!i.numeric)).join("")+"</tr>").join("")+"</tbody></table>"),document.body.appendChild(r);function o(a,i){let s=document.getElementById("lcx-refusal");s&&(s.innerHTML=`<p class="refusal"><strong>${H(a)}</strong> \u2014 ${H(i)} The measurements below are unaffected.</p>`),delete r.dataset.rendered;for(let u of Array.from(document.querySelectorAll("canvas")))u.style.display="none";r.focus({preventScroll:!0})}return document.addEventListener("webglcontextlost",a=>{a.preventDefault(),o("CONTEXT_LOST","The GPU dropped the WebGL context for this page mid-session.")},!0),{markRendered(){r.dataset.rendered="1"},showRefusal:o}}var re=new URLSearchParams(location.search),yt=$e.includes(re.get("tier")??"")?re.get("tier"):"full",ge=Qe(yt),Re=re.get("dof")!=="0"&&ge.dof,mt=re.get("ao")!=="0"&&ge.ao,ft=[],$t=[];function Qt(t,n,r,e){let o=re.get(t);if(o===null)return n;let a=Number(o);if(!Number.isFinite(a))return ft.push(`${t}=${o}`),n;let i=Math.max(r,Math.min(e,a));return i!==a&&$t.push(`${t}=${o} used as ${i}`),i}var N=Qt("scale",1,1,3),ht=Math.trunc(Qt("frames",300,1,2e4)),L=1200*N,_=720*N,$=document.getElementById("c");$.width=L;$.height=_;var Rr=document.getElementById("log");function Me(t){document.title="REFUSED";let n=document.getElementById("log");n&&(n.textContent=t);let[r,...e]=t.split(":");throw Yt?.showRefusal(r?.trim()??"REFUSED",e.join(":").trim()||t),new Error(t)}var Yt=null;function k(t,n){return"kind"in n&&Me(`${t}: ${n.code} \u2014 ${n.reason} ${n.detail??""}`),n}var Kt=Bt({title:"E1 \xB7 The Theatre \u2014 3D programme state",readsAs:"The rendered view puts five of these on lit panels at graded depths and racks focus to the one being built, which states where to look in a way a list cannot. This table has no such emphasis and no depth \u2014 and it carries every environment, including the four the five panels cannot show.",notices:["Each verdict is read from that environment's own README first line at build time, not typed here."],columns:[{key:"id",label:"Env"},{key:"name",label:"Name"},{key:"verdict",label:"Verdict (from its README)"}],rows:Object.values(D).map(t=>({id:t.id,name:t.name,verdict:t.verdict}))});Yt=Kt;ft.length>0&&Me(`BAD_PARAM: ${ft.join(", ")} \u2014 not a number, so the theatre was refused rather than drawn from a nonsensical value. Every row below is unaffected; correct the URL and reload.`);re.get("refuse")==="1"&&Me("FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. The three-dimensional view is not being drawn.");var ye=Ne($,{alpha:!1});Pe(ye)||Me(`stage: ${ye.code} \u2014 ${ye.reason}`);var U=ye,T=U.gl,Ar=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Fr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${Ge}
${ke}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,Mr=k("present",U.compile(Ar,Fr)),st=k("lit",ot(U)),Z=k("target",et(U,L,_)),pt=k("shadow",tt(U,me(yt,1536))),vr=k("sky",rt(U)),It=k("ao",at(U,L,_)),Gt=k("dof",it(U,L,_)),Q={target:[0,.62,.1],distance:8.4,azimuthDeg:1.5,elevationDeg:7.2,fovDeg:38},X=fe(Q),ut=Q.fovDeg??38,bt=Math.max(.01,Q.distance/100),kt=Math.max(bt+1,Q.distance*8),Ae=.06,qt=[{id:"P1",x:-3.55,z:-1.25,w:1.72,h:1.3,hex:"#16203A",roughness:.5},{id:"P2",x:-1.62,z:.75,w:1.3,h:1.62,hex:"#16203A",roughness:.46},{id:"P3",x:.18,z:2.35,w:1.44,h:1.36,hex:"#2C6BFF",roughness:.42},{id:"P4",x:1.62,z:1.15,w:1.2,h:1.54,hex:"#2C6BFF",roughness:.44},{id:"P5",x:3.62,z:-2.1,w:1.78,h:1.18,hex:"#16203A",roughness:.52}],Sr=.72,Jt=ze(30,24),Zt=qt.map(t=>He(t.w,t.h,Ae)),Lr=k("deck mesh",xe(U,Jt)),_r=Zt.map((t,n)=>k(`panel ${n} mesh`,xe(U,t))),er=(t,n,r,e)=>{let o=le(),a=Math.cos(e),i=Math.sin(e);return o[0]=a,o[2]=-i,o[8]=i,o[10]=a,o[12]=t,o[13]=n,o[14]=r,o},wr=t=>new Float32Array([t[0],t[1],t[2],t[4],t[5],t[6],t[8],t[9],t[10]]),G=qt.map((t,n)=>{let r=Math.atan2(X[0]-t.x,X[2]-t.z)*Sr,e=Math.cos(r),o=Math.sin(r),a=er(t.x,t.h/2,t.z,r),i=(u,l)=>[t.x+e*u+o*(Ae/2),l,t.z-o*u+e*(Ae/2)],s=i(0,t.h/2);return{...t,yaw:r,model:a,facePoint:i,mesh:_r[n],normalMat:wr(a),eyeDistance:Math.hypot(X[0]-s[0],X[1]-s[1],X[2]-s[2])}}),tr=G.reduce((t,n)=>n.eyeDistance<t.eyeDistance?n:t),ve=tr.eyeDistance,Dr=new Float32Array([1,0,0,0,1,0,0,0,1]),lt=[{mesh:Lr,model:er(0,0,0,0),normalMat:Dr,material:{baseColour:oe("#070B14"),roughness:.86,metalness:0}},...G.map(t=>({mesh:t.mesh,model:t.model,normalMat:t.normalMat,material:{baseColour:oe(t.hex),roughness:t.roughness,metalness:.06}}))],z=[.62,-.55,-.58],rr=[-4.8,0,-4.6],nr=[6.2,1.9,3],Pr=Ze(rr,nr),Nr=Je(rr,nr),Vt=qe({direction:z,colour:[1,1,1],extent:7.6},Pr,Nr),Ur=[Jt,...Zt].reduce((t,n)=>t+Xe(n),0);function Fe(){let t=he(Q,L/_);st.shadowPass(Vt,lt,pt),Z.bind(),T.clear(T.DEPTH_BUFFER_BIT),vr.draw({eye:X,target:Q.target,fovDeg:ut,aspect:L/_}),st.depthPrepass(t,lt),mt&&(It.compute({depthTexture:Z.depthTexture,near:bt,far:kt,fovDeg:ut,aspect:L/_,radius:.5,strength:1.3}),Z.bind()),st.draw({viewProj:t,eye:X,lightDir:z,lightColour:[3.5,3.45,3.3],ambientGain:1.05,lightVP:Vt,shadow:pt,shadowStrength:.92,draws:lt,ao:mt?It.texture:null,screenSize:[L,_]});let n=Z.texture;Re&&(Gt.apply({scene:Z.texture,depthTexture:Z.depthTexture,near:bt,far:kt,fovDeg:ut,aspect:L/_,focusDistance:ve,aperture:.16,maxCoc:.014}),n=Gt.texture),T.bindFramebuffer(T.FRAMEBUFFER,null),T.viewport(0,0,L,_),T.disable(T.DEPTH_TEST),T.activeTexture(T.TEXTURE0),T.bindTexture(T.TEXTURE_2D,n),U.blit(Mr,r=>T.uniform1i(T.getUniformLocation(r,"uScene"),0))}Fe();var Ht=4e3;function Cr(t){let n=new Uint8Array(4),r=performance.now();Fe(),T.readPixels(0,0,1,1,T.RGBA,T.UNSIGNED_BYTE,n);let e=Math.max(.01,performance.now()-r),o=Math.min(t,Math.max(1,Math.floor(Ht/e))),a=performance.now(),i=0;for(let s=0;s<o&&(Fe(),i++,!(performance.now()-a>Ht));s++);return T.readPixels(0,0,1,1,T.RGBA,T.UNSIGNED_BYTE,n),{msPerFrame:(performance.now()-a)/i,measured:i}}var Et=Cr(ht),ct=Et.msPerFrame,Se=he(Q,L/_),Or=t=>[t.facePoint(-t.w/2,0),t.facePoint(t.w/2,0),t.facePoint(t.w/2,t.h),t.facePoint(-t.w/2,t.h)].map(n=>W(Se,n,L,_)),ee=G.map(Or),Tt=(t,n,r)=>{let e=0;for(let o=0;o<4;o++){let a=t[o],i=t[(o+1)%4],s=(i.sx-a.sx)*(r-a.sy)-(i.sy-a.sy)*(n-a.sx);if(Math.abs(s)<1e-9)continue;let u=s>0?1:-1;if(e===0)e=u;else if(u!==e)return!1}return!0},ie=(()=>{let t=Math.hypot(z[0],z[1],z[2]);return[-z[0]/t,-z[1]/t,-z[2]/t]})(),or=(t,n,r,e)=>G.some((o,a)=>{if(a===e)return!1;let i=Math.cos(o.yaw),s=Math.sin(o.yaw),u=s*ie[0]+i*ie[2];if(Math.abs(u)<1e-6)return!1;let l=(s*(o.x-t)+i*(o.z-r))/u;if(l<=0)return!1;let d=t+ie[0]*l,c=n+ie[1]*l,m=r+ie[2]*l,h=(d-o.x)*i-(m-o.z)*s;return Math.abs(h)<=o.w/2&&c>=0&&c<=o.h}),Br=G.map((t,n)=>{let r=0,e=0,o=0,a=null;for(let d=1;d<=15;d++)for(let c=1;c<=23;c++){let m=(c/24-.5)*t.w,h=d/16*t.h,E=t.facePoint(m,h),f=W(Se,E,L,_);if(e++,or(E[0],E[1],E[2],n)&&o++,f.behind||f.sx<0||f.sx>=L||f.sy<0||f.sy>=_||G.some((v,p)=>p!==n&&v.eyeDistance<t.eyeDistance&&Tt(ee[p],f.sx,f.sy)))continue;r++;let b=Math.abs(m)/t.w+Math.abs(h-t.h/2)/t.h;(!a||b<a.rank)&&(a={sx:f.sx,sy:f.sy,rank:b})}let i=new Uint8Array(4);a&&T.readPixels(Math.round(a.sx),Math.round(_-a.sy),1,1,T.RGBA,T.UNSIGNED_BYTE,i);let s=Math.min(.014,Math.abs(1/ve-1/t.eyeDistance)*.16),u=ee[n].map(d=>d.sx),l=ee[n].map(d=>d.sy);return{id:t.id,hex:t.hex,eyeDistance:Number(t.eyeDistance.toFixed(2)),yawDeg:Number((t.yaw*180/Math.PI).toFixed(1)),cocPx:Number((s*(L/N)).toFixed(1)),visiblePct:Math.round(100*r/e),inShadowPct:Math.round(100*o/e),offFrame:ee[n].some(d=>d.behind||d.sx<0||d.sx>L||d.sy<0||d.sy>_),screen:[Math.round(Math.min(...u)/N),Math.round(Math.min(...l)/N),Math.round(Math.max(...u)/N),Math.round(Math.max(...l)/N)],sample:a?{sx:Math.round(a.sx/N),sy:Math.round(a.sy/N),rgb:[i[0],i[1],i[2]]}:null}}),Ir=(()=>{let t=new Uint8Array(4),n={lit:{r:0,g:0,b:0,n:0},shade:{r:0,g:0,b:0,n:0}};for(let e=-5;e<=5.001;e+=.25)for(let o=-3.5;o<=4.001;o+=.25){let a=W(Se,[e,0,o],L,_);if(a.behind||a.sx<0||a.sx>=L||a.sy<0||a.sy>=_||ee.some(s=>Tt(s,a.sx,a.sy)))continue;T.readPixels(Math.round(a.sx),Math.round(_-a.sy),1,1,T.RGBA,T.UNSIGNED_BYTE,t);let i=or(e,0,o,-1)?n.shade:n.lit;i.r+=t[0],i.g+=t[1],i.b+=t[2],i.n+=1}let r=e=>e.n===0?null:[Math.round(e.r/e.n),Math.round(e.g/e.n),Math.round(e.b/e.n)];return{litSamples:n.lit.n,litRgb:r(n.lit),shadowedSamples:n.shade.n,shadowedRgb:r(n.shade)}})(),Gr={E0:"GGX + shadows + AO + DOF. 1.305 ms/frame at 1x on the M1, by trailing-readPixels",E1:"real DOM content projected onto lit GL surfaces \u2014 the panel you are reading",E2:"seven corridors, lift monotonic with distance; no landmasses yet",E5:"driven from the same input as the shipping flat engine; cell counts agree exactly",E6:"depth is time; fog is the reading limit on it, and both horizons are reported",E8:"on the sign-in route in both themes, with a CSS fallback and a pixel ratchet"},zt=["E1","E8","E0","E6","E5","E2"],Le=Object.keys(D).sort((t,n)=>(zt.indexOf(t)+1||99)-(zt.indexOf(n)+1||99)),_e=["P3","P4","P2","P5","P1"],gt=Le.slice(0,_e.length),Te=Le.slice(_e.length),kr=t=>{let n=t.split(/[.·—]/)[0].trim();if(n.length<=26)return n.toUpperCase();let r=n.slice(0,26),e=r.lastIndexOf(" ");return(e>8?r.slice(0,e):r).toUpperCase()},Vr=Object.fromEntries(gt.map((t,n)=>{let r=_e[n],e=D[t];return[r,{tag:`${e.id} \xB7 ${e.name}`,state:kr(e.verdict),note:Gr[t]??e.verdict}]})),Xt=250,jt=.11,se=.1,te=(t,n)=>{let r=document.createElement("div");return r.style.cssText=t,r.textContent=n,r},we=document.createElement("div");we.style.cssText="position:absolute;inset:0;pointer-events:none";var De=document.createElement("div");De.style.cssText="position:relative;overflow:hidden;width:1200px;height:720px";$.parentNode?.insertBefore(De,$);De.appendChild($);De.appendChild(we);var ar=[...G].map((t,n)=>({p:t,i:n})).sort((t,n)=>n.p.eyeDistance-t.p.eyeDistance),Hr=new Map(ar.map(({p:t},n)=>[t.id,n])),zr=_e.slice(0,gt.length).map(t=>ar.find(n=>n.p.id===t)).filter(t=>t!==void 0),Xr=[0,.06,-.06,.12,-.12,.18,-.18,.24,-.24,.3,-.3,.36,-.36],jr=[1,.92,.84,.76,.68,.6],ir=t=>Math.min(.014,Math.abs(1/ve-1/t)*.16)*(L/N),Wt=Math.max(...G.map(t=>ir(t.eyeDistance))),Wr=.45,$r=.1,Qr=zr.map(({p:t,i:n})=>{let r=Vr[t.id],e=Hr.get(t.id)??0,o=Ae/2+.008,a=Math.cos(t.yaw),i=Math.sin(t.yaw),s=(R,F)=>[t.x+a*R+i*o,F,t.z-i*R+a*o],u=(R,F,M)=>({topLeft:s(M-R/2,se+F),topRight:s(M+R/2,se+F),bottomRight:s(M+R/2,se),bottomLeft:s(M-R/2,se)}),l=R=>R.filter(F=>G.some((M,S)=>S!==n&&M.eyeDistance<t.eyeDistance&&Tt(ee[S],F.x*N,F.y*N))).length,d=null,c=null,m=4;e:for(let R of jr){let F=Math.max(.2,(t.w-2*jt)*R),M=Math.max(.2,(t.h-2*se)*R),S=Math.round(F*Xt),V=Math.round(M*Xt);for(let ne of Xr){if(Math.abs(ne)+F/2>t.w/2-jt*.5)continue;let j=je(Se,u(F,M,ne),L/N,_/N,S,V);if(We(j)){c=j.refusal;continue}let C=l(j.screen);if(m=Math.min(m,C),C===0&&j.signedArea>0){d={proj:j,ew:S,eh:V,shift:ne,scale:R,occluded:C};break e}}}if(!d)return{id:t.id,shown:!1,refusal:c??"NO_UNOCCLUDED_PLACEMENT",backFacing:!1,occludedCorners:m,contentShift:null,contentScale:null,perspectiveX:null,elementPx:null,rectError:null};let{proj:h,ew:E,eh:f}=d,b=t.hex==="#2C6BFF",v=b?"#EAF1FF":"#7fb2ff",p=b?"#FFFFFF":"#C6D4EC",y=ir(t.eyeDistance),A=Re?Wr*(y/Math.max(1e-6,Wt)):0,x=Re?1-$r*(y/Math.max(1e-6,Wt)):1,g=document.createElement("div");g.style.cssText=["position:absolute","left:0","top:0",`width:${E}px`,`height:${f}px`,"pointer-events:auto","user-select:text","-webkit-user-select:text",`z-index:${e}`,"transform-origin:0 0",`transform:${h.transform}`,"display:flex","flex-direction:column","justify-content:flex-end","gap:7px","overflow:hidden",`filter:blur(${A.toFixed(2)}px)`,`opacity:${x.toFixed(3)}`,"-webkit-font-smoothing:antialiased"].join(";"),g.appendChild(te(`font:600 11px/1 ui-monospace,monospace;letter-spacing:.14em;color:${v}`,r.tag)),g.appendChild(te("font:700 27px/1.02 system-ui,sans-serif;color:#fff;letter-spacing:-0.01em",r.state)),g.appendChild(te(`font:400 11.5px/1.45 system-ui,sans-serif;color:${p}`,r.note)),we.appendChild(g);let w=null;{let R=$.getBoundingClientRect(),F=g.getBoundingClientRect(),M=h.screen.map(V=>V.x),S=h.screen.map(V=>V.y);w=Number(Math.max(Math.abs(F.left-R.left-Math.min(...M)),Math.abs(F.top-R.top-Math.min(...S)),Math.abs(F.right-R.left-Math.max(...M)),Math.abs(F.bottom-R.top-Math.max(...S))).toFixed(2))}return{id:t.id,shown:!0,refusal:null,backFacing:!1,occludedCorners:0,contentShift:Number(d.shift.toFixed(2)),contentScale:d.scale,perspectiveX:Number((h.matrix[6]*1e3).toFixed(3)),elementPx:[E,f],cocPx:Number(y.toFixed(1)),domBlurPx:Number(A.toFixed(2)),domOpacity:Number(x.toFixed(3)),rectError:w}}),sr=(()=>{let t=T.getExtension("WEBGL_debug_renderer_info");return t?String(T.getParameter(t.UNMASKED_RENDERER_WEBGL)):"unknown"})(),dt=/swiftshader|llvmpipe|software/i.test(sr);{let t=document.createElement("div");t.style.cssText="position:absolute;left:16px;top:14px;display:flex;flex-direction:column;gap:5px;font:500 10.5px/1.4 ui-monospace,monospace;letter-spacing:.05em;background:rgba(4,6,11,0.82);padding:9px 11px;border-radius:5px;pointer-events:auto;user-select:text;-webkit-user-select:text",t.appendChild(te("color:#8FB7FF;font-weight:600;letter-spacing:.15em",`3D PROGRAMME \xB7 ${Le.length} ENVIRONMENTS`)),t.appendChild(te("color:rgba(196,212,240,0.8)","STATE DERIVED FROM EACH README AT BUILD TIME")),Te.length&&t.appendChild(te("color:#E0A94A",`${Te.length} NOT SHOWN \u2014 ONLY 5 PANELS: ${Te.join(" ")}`)),we.appendChild(t)}var xt=Ve();if(xt.length>0){let t="BRAND FIDELITY FAILED \u2014 "+xt.map(r=>`${r.key}: expected ${r.expected}, got ${r.actual}`).join("; ");document.title="REFUSED";let n=document.getElementById("log");throw n&&(n.textContent=t),new Error(t)}var ur={tier:ge.tier,tierDprScale:ge.dprScale,tierShadowMapSize:me(yt,1536),shadowBaseline:1536,brandFidelity:xt,dof:Re,ao:mt,hdr:U.hdr,eye:X.map(t=>Number(t.toFixed(2))),focusPanel:tr.id,focusDistance:Number(ve.toFixed(2)),panels:Br,projections:Qr,environments:Le,environmentsShown:gt,environmentsOmitted:Te,deck:Ir,glError:T.getError(),triangles:Ur,shadowMap:pt.size,resolution:`${L}x${_}`,dprScale:N,frames:Et.measured,framesRequested:ht,sweepTruncated:Et.measured<ht,paramClamps:$t,msPerFrame:Number(ct.toFixed(3)),fps:Math.round(1e3/ct),renderer:sr,rendererClass:dt?"software":"hardware",headroom:dt?null:Number((16.6-ct).toFixed(3)),headroomRefusal:dt?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null,hardwareMsPerFrame:null};globalThis.E1=ur;Rr.textContent=JSON.stringify(ur,null,2);Fe();Kt.markRendered();document.title="READY";

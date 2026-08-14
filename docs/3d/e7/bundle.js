var Jn=`
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
`;function oe(e){return String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function Hr(e){let r=document.createElement("style");r.textContent=Jn,document.head.appendChild(r);let n=document.createElement("section");n.id="lcx-fallback",n.setAttribute("aria-label",`${e.title} \u2014 flat view`),n.setAttribute("tabindex","-1"),document.getElementById("log")?.setAttribute("aria-hidden","true");let t=(a,i)=>a===null?`<td class="absent${i?" n":""}">absent</td>`:`<td class="${i?"n":""}">${oe(a)}</td>`;n.innerHTML=`<h2>${oe(e.title)} \u2014 flat view</h2><p class="reads">${oe(e.readsAs)}</p>`+(e.notices??[]).map(a=>`<p class="notice">${oe(a)}</p>`).join("")+'<div id="lcx-refusal" role="alert"></div>'+(e.html?`<div class="surface">${e.html}</div>`:`<table><caption>${oe(e.title)} \u2014 flat view</caption><thead><tr>`+e.columns.map(a=>`<th scope="col" class="${a.numeric?"n":""}">${oe(a.label)}</th>`).join("")+"</tr></thead><tbody>"+e.rows.map(a=>"<tr>"+e.columns.map(i=>t(a[i.key]??null,!!i.numeric)).join("")+"</tr>").join("")+"</tbody></table>"),document.body.appendChild(n);function o(a,i){let s=document.getElementById("lcx-refusal");s&&(s.innerHTML=`<p class="refusal"><strong>${oe(a)}</strong> \u2014 ${oe(i)} The measurements below are unaffected.</p>`),delete n.dataset.rendered;for(let l of Array.from(document.querySelectorAll("canvas")))l.style.display="none";n.focus({preventScroll:!0})}return document.addEventListener("webglcontextlost",a=>{a.preventDefault(),o("CONTEXT_LOST","The GPU dropped the WebGL context for this page mid-session.")},!0),{markRendered(){n.dataset.rendered="1"},showRefusal:o}}var Vr={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected.",FEEDBACK_LOOP:"A layer of this view was asked to read the surface it draws into, which every driver refuses, so the layer is not being drawn. This is a defect in the renderer, not in the data."};function L(e,r){return r===void 0?{kind:"refused",code:e,reason:Vr[e]}:{kind:"refused",code:e,reason:Vr[e],detail:r}}var eo=3,to=24e5;function Ft(e){return e.kind==="stage"}function Mt(e,r={}){let n=e.getContext("webgl2",{antialias:r.antialias??!1,alpha:r.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!n)return L("NO_WEBGL2");let t=n.getExtension("EXT_color_buffer_float"),o=e.width,a=e.height,i=t?n.RGBA16F:n.RGBA8,s=t?n.HALF_FLOAT:n.UNSIGNED_BYTE,l=(x,g)=>{let A=n.createTexture();n.bindTexture(n.TEXTURE_2D,A),n.texImage2D(n.TEXTURE_2D,0,i,x,g,0,n.RGBA,s,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE);let y=n.createFramebuffer();n.bindFramebuffer(n.FRAMEBUFFER,y),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,A,0);let F=n.checkFramebufferStatus(n.FRAMEBUFFER);return F!==n.FRAMEBUFFER_COMPLETE?L("FRAMEBUFFER_INCOMPLETE",`status 0x${F.toString(16)} at ${x}\xD7${g}`):{texture:A,framebuffer:y,width:x,height:g}},u=r.bloomShift??2,m={w:o,h:a},d=(x,g)=>Math.max(g,Math.ceil(Math.max(1,x)/256)*256),c=(x,g)=>{let A=d(x,1024),y=d(g,512);return{scene:l(A,y),bloomA:l(Math.max(1,A>>u),Math.max(1,y>>u)),bloomB:l(Math.max(1,A>>u),Math.max(1,y>>u)),texels:A*y}},b=x=>{for(let g of[x.scene,x.bloomA,x.bloomB])"kind"in g||(n.deleteFramebuffer(g.framebuffer),n.deleteTexture(g.texture))},E=new Map,f=`${o}x${a}`,p=c(o,a);for(let x of[p.scene,p.bloomA,p.bloomB])if("kind"in x)return b(p),x;E.set(f,p);let T=()=>{let x=E.size-1,g=0;for(let[A,y]of E)A!==f&&(g+=y.texels);for(let[A,y]of E){if(x<=eo&&g<=to)return;A!==f&&(E.delete(A),b(y),x-=1,g-=y.texels)}},R=n.createVertexArray();n.bindVertexArray(R);let v=n.createBuffer();n.bindBuffer(n.ARRAY_BUFFER,v),n.bufferData(n.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),n.STATIC_DRAW),n.enableVertexAttribArray(0),n.vertexAttribPointer(0,2,n.FLOAT,!1,0,0),n.bindVertexArray(null);let N=[];return{kind:"stage",gl:n,cssWidth:e.clientWidth||o,cssHeight:e.clientHeight||a,hdr:!!t,get width(){return m.w},get height(){return m.h},get scene(){return p.scene},get bloomA(){return p.bloomA},get bloomB(){return p.bloomB},setRegion(x,g){let A=Math.max(1,Math.round(x)),y=Math.max(1,Math.round(g));if(A===m.w&&y===m.h)return;m={w:A,h:y};let F=`${A}x${y}`,S=E.get(F);if(S){E.delete(F),E.set(F,S),p=S,f=F;return}p=c(A,y),f=F,E.set(F,p),T()},compile(x,g){let A=(Oe,vt)=>{let re=n.createShader(Oe);if(n.shaderSource(re,vt),n.compileShader(re),!n.getShaderParameter(re,n.COMPILE_STATUS)){let ne=n.getShaderInfoLog(re)??"(no log)";return n.deleteShader(re),L("SHADER_COMPILE_FAILED",ne)}return re},y=A(n.VERTEX_SHADER,x);if(typeof y=="object"&&"kind"in y)return y;let F=A(n.FRAGMENT_SHADER,g);if(typeof F=="object"&&"kind"in F)return n.deleteShader(y),F;let S=n.createProgram();if(n.attachShader(S,y),n.attachShader(S,F),n.linkProgram(S),!n.getProgramParameter(S,n.LINK_STATUS)){let Oe=n.getProgramInfoLog(S)??"(no log)";return n.deleteShader(y),n.deleteShader(F),n.deleteProgram(S),L("PROGRAM_LINK_FAILED",Oe)}return n.detachShader(S,y),n.detachShader(S,F),n.deleteShader(y),n.deleteShader(F),N.push(S),S},bindTarget(x){n.bindFramebuffer(n.FRAMEBUFFER,x?x.framebuffer:null),n.viewport(0,0,x?x.width:m.w,x?x.height:m.h)},blit(x,g){n.useProgram(x),n.bindVertexArray(R),g?.(x),n.drawArrays(n.TRIANGLES,0,3),n.bindVertexArray(null)},dispose(){for(let g of N)n.deleteProgram(g);for(let g of E.values())b(g);if(E.clear(),n.deleteBuffer(v),n.deleteVertexArray(R),e.isConnected)return;let x=n.getExtension("WEBGL_lose_context");x!==null&&typeof x.loseContext=="function"&&x.loseContext()}}}var ot=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function at(e,r){let n=new Float32Array(16);for(let t=0;t<4;t++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=e[i*4+o]*r[t*4+i];n[t*4+o]=a}return n}var be=(e,r)=>[e[0]-r[0],e[1]-r[1],e[2]-r[2]],nt=(e,r)=>e[0]*r[0]+e[1]*r[1]+e[2]*r[2],Ae=(e,r)=>[e[1]*r[2]-e[2]*r[1],e[2]*r[0]-e[0]*r[2],e[0]*r[1]-e[1]*r[0]];function z(e){let r=Math.hypot(e[0],e[1],e[2]);return r===0?e:[e[0]/r,e[1]/r,e[2]/r]}function wt(e,r,n,t){let o=1/Math.tan(e/2);return new Float32Array([o/r,0,0,0,0,o,0,0,0,0,(t+n)/(n-t),-1,0,0,2*t*n/(n-t),0])}function _t(e,r,n,t,o,a){let i=r-e,s=t-n,l=a-o;return new Float32Array([2/i,0,0,0,0,2/s,0,0,0,0,-2/l,0,-(r+e)/i,-(t+n)/s,-(a+o)/l,1])}function it(e,r,n){let t=z(be(e,r)),o=Ae(n,t);if(Math.hypot(o[0],o[1],o[2])<1e-8)return ot();let a=z(o),i=Ae(t,a);return new Float32Array([a[0],i[0],t[0],0,a[1],i[1],t[1],0,a[2],i[2],t[2],0,-nt(a,e),-nt(i,e),-nt(t,e),1])}function Wr(e,r){let n=[0,1,2,3].map(o=>e[0+o]*r[0]+e[4+o]*r[1]+e[8+o]*r[2]+e[12+o]),t=n[3];return{x:n[0]/t,y:n[1]/t,z:n[2]/t,w:t}}function Se(e,r,n,t){let o=Wr(e,r);return{sx:(o.x*.5+.5)*n,sy:(1-(o.y*.5+.5))*t,behind:o.w<=0}}function Xr(e){return e<=.04045?e/12.92:Math.pow((e+.055)/1.055,2.4)}function Lt(e){return e<=.0031308?e*12.92:1.055*Math.pow(e,1/2.4)-.055}var ro=/^#?([0-9a-fA-F]{6})$/;function G(e){let r=ro.exec(e.trim());if(!r)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(e)}`);let n=r[1];return[0,2,4].map(t=>Xr(parseInt(n.slice(t,t+2),16)/255))}function Dt(e){return`#${e.map(n=>{let t=Lt(Math.min(1,Math.max(0,n)));return Math.round(t*255).toString(16).padStart(2,"0")}).join("")}`}var ve={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},Nt=Object.freeze(Object.fromEntries(Object.keys(ve).map(e=>[e,G(ve[e])])));var zr=.4;var Pt=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${zr.toFixed(2)}); }`,Ut=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function Bt(){let e=[];for(let r of Object.keys(ve)){let n=ve[r].toLowerCase(),t=Dt(Nt[r]).toLowerCase();t!==n&&e.push({key:r,expected:n,actual:t})}return e}function no(e){let r=[1/0,1/0,1/0],n=[-1/0,-1/0,-1/0];for(let t=0;t<e.length;t+=3)for(let o=0;o<3;o++){let a=e[t+o];a<r[o]&&(r[o]=a),a>n[o]&&(n[o]=a)}return e.length===0?{min:[0,0,0],max:[0,0,0]}:{min:r,max:n}}function $r(e,r,n,t){let o=new Float32Array(e.length);for(let i=0;i<t.length;i+=3){let s=t[i],l=t[i+1],u=t[i+2],m=s*3,d=l*3,c=u*3,b=s*2,E=l*2,f=u*2,p=e[d]-e[m],T=e[d+1]-e[m+1],R=e[d+2]-e[m+2],v=e[c]-e[m],N=e[c+1]-e[m+1],W=e[c+2]-e[m+2],x=n[E]-n[b],g=n[E+1]-n[b+1],A=n[f]-n[b],y=n[f+1]-n[b+1],F=x*y-A*g;if(Math.abs(F)<1e-12)continue;let S=1/F,Oe=(p*y-v*g)*S,vt=(T*y-N*g)*S,re=(R*y-W*g)*S;for(let ne of[m,d,c])o[ne]=o[ne]+Oe,o[ne+1]=o[ne+1]+vt,o[ne+2]=o[ne+2]+re}let a=new Float32Array(e.length);for(let i=0;i<a.length;i+=3){let s=r[i],l=r[i+1],u=r[i+2],m=o[i],d=o[i+1],c=o[i+2],b=m*s+d*l+c*u;m-=s*b,d-=l*b,c-=u*b;let E=Math.hypot(m,d,c);E<1e-8&&(Math.abs(s)<.9?(m=0,d=-u,c=l):(m=-u,d=0,c=s),E=Math.hypot(m,d,c)||1),a[i]=m/E,a[i+1]=d/E,a[i+2]=c/E}return a}function jr(e,r){let n=new Float32Array(e.length);for(let t=0;t<r.length;t+=3){let o=r[t]*3,a=r[t+1]*3,i=r[t+2]*3,s=e[a]-e[o],l=e[a+1]-e[o+1],u=e[a+2]-e[o+2],m=e[i]-e[o],d=e[i+1]-e[o+1],c=e[i+2]-e[o+2],b=l*c-u*d,E=u*m-s*c,f=s*d-l*m;for(let p of[o,a,i])n[p]=n[p]+b,n[p+1]=n[p+1]+E,n[p+2]=n[p+2]+f}for(let t=0;t<n.length;t+=3){let o=Math.hypot(n[t],n[t+1],n[t+2]);o>0&&(n[t]=n[t]/o,n[t+1]=n[t+1]/o,n[t+2]=n[t+2]/o)}return n}function oo(e,r,n,t,o){let{min:a,max:i}=no(e),s=t??jr(e,n);return{positions:e,normals:s,uvs:r,indices:n,min:a,max:i,tangents:o??$r(e,s,r,n)}}function Q(e=1,r=1,n=1){let t=e/2,o=r/2,a=n/2,i=[[[-t,-o,a],[t,-o,a],[t,o,a],[-t,o,a]],[[t,-o,-a],[-t,-o,-a],[-t,o,-a],[t,o,-a]],[[t,-o,a],[t,-o,-a],[t,o,-a],[t,o,a]],[[-t,-o,-a],[-t,-o,a],[-t,o,a],[-t,o,-a]],[[-t,o,a],[t,o,a],[t,o,-a],[-t,o,-a]],[[-t,-o,-a],[t,-o,-a],[t,-o,a],[-t,-o,a]]],s=new Float32Array(72),l=new Float32Array(48),u=new Uint16Array(36),m=0,d=0,c=0,b=0;for(let E of i){for(let[f,p,T]of E)s[m++]=f,s[m++]=p,s[m++]=T;l[d++]=0,l[d++]=0,l[d++]=1,l[d++]=0,l[d++]=1,l[d++]=1,l[d++]=0,l[d++]=1,u[c++]=b,u[c++]=b+1,u[c++]=b+2,u[c++]=b,u[c++]=b+2,u[c++]=b+3,b+=4}return oo(s,l,u)}function K(e){return e.indices.length/3}function ao(e){if(!Number.isFinite(e)||e===0)return"0";let r=e.toFixed(12).replace(/0+$/,"").replace(/\.$/,"");return r==="-0"?"0":r}function Yr(e,r,n,t){let[o,a]=e,[i,s]=r,[l,u]=n,[m,d]=t,c=o-i+l-m,b=a-s+u-d;if(Math.abs(c)<1e-9&&Math.abs(b)<1e-9){let W=[i-o,m-o,o,s-a,d-a,a,0,0,1],x=W[0]*W[4]-W[1]*W[3];return Math.abs(x)<1e-9?null:W}let E=i-l,f=m-l,p=s-u,T=d-u,R=E*T-f*p;if(Math.abs(R)<1e-9)return null;let v=(c*T-f*b)/R,N=(E*b-c*p)/R;return[i-o+v*i,m-o+N*m,o,s-a+v*s,d-a+N*d,a,v,N,1]}function st(e,r,n,t,o,a){if(!(o>0)||!(a>0))return{refusal:"EMPTY_ELEMENT_BOX"};let s=[r.topLeft,r.topRight,r.bottomRight,r.bottomLeft].map(S=>Se(e,S,n,t));if(s.some(S=>S.behind))return{refusal:"CORNER_BEHIND_CAMERA"};let l=s.map(S=>({x:S.sx,y:S.sy})),[u,m,d,c]=l,b=Yr([u.x,u.y],[m.x,m.y],[d.x,d.y],[c.x,c.y]);if(!b)return{refusal:"DEGENERATE_ON_SCREEN"};let E=.5*(u.x*m.y-m.x*u.y+(m.x*d.y-d.x*m.y)+(d.x*c.y-c.x*d.y)+(c.x*u.y-u.x*c.y)),f=1/o,p=1/a,[T,R,v,N,W,x,g,A,y]=b;return{transform:`matrix3d(${[T*f,N*f,0,g*f,R*p,W*p,0,A*p,0,0,1,0,v,x,0,y].map(ao).join(", ")})`,matrix:b,screen:l,signedArea:E}}function Fe(e){return"refusal"in e}function Ot(e,r,n,t,o,a,i=0){let s=Math.cos(a),l=Math.sin(a),u=(d,c)=>[e+s*d+l*i,n+c,r-l*d+s*i],m=t/2;return{topLeft:u(-m,o),topRight:u(m,o),bottomRight:u(m,0),bottomLeft:u(-m,0)}}var Qr=e=>[e.DEPTH_TEST,e.CULL_FACE,e.BLEND];function ae(e){return[e.getParameter(e.FRAMEBUFFER_BINDING),e.getParameter(e.VIEWPORT),e.getParameter(e.DEPTH_WRITEMASK),Qr(e).map(r=>e.getParameter(r))]}function ie(e,r){e.bindFramebuffer(e.FRAMEBUFFER,r[0]);let n=r[1];e.viewport(n[0]??0,n[1]??0,n[2]??0,n[3]??0),e.depthMask(r[2]),Qr(e).forEach((t,o)=>{r[3][o]?e.enable(t):e.disable(t)})}function Me(e,r){for(let n=r-1;n>=0;n--)e.activeTexture(e.TEXTURE0+n),e.bindTexture(e.TEXTURE_2D,null),e.bindTexture(e.TEXTURE_3D,null);e.activeTexture(e.TEXTURE0)}function Kr(e,r){return!e.getParameter(e.FRAMEBUFFER_BINDING)||e.getFramebufferAttachmentParameter(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE)!==e.TEXTURE?!1:e.getFramebufferAttachmentParameter(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME)===r}function ut(e,r,n,t){let o=-1/0,a=1/0;for(let i=0;i<3;i++){let s=r[i],l=e[i],u=n[i],m=t[i];if(Math.abs(s)<1e-12){if(l<u||l>m)return null;continue}let d=1/s,c=(u-l)*d,b=(m-l)*d;if(c>b){let E=c;c=b,b=E}if(c>o&&(o=c),b<a&&(a=b),o>a)return null}return a<0?null:{tNear:Math.max(0,o),tFar:a}}function lt(e,r,n){if(!(e>0)||!(r>0))return{steps:0,step:0,truncated:!1};let t=Math.ceil(e/r),o=Math.min(Math.max(1,t),Math.max(1,Math.floor(n)));return{steps:o,step:r,truncated:t>o}}var qr=`
/* Mirrors rayBoxSlab() in volume.ts line for line. If one changes, change both. */
bool lcxRayBox(vec3 o, vec3 d, vec3 bmin, vec3 bmax, out float tNear, out float tFar){
  tNear = -1e30; tFar = 1e30;
  for (int a = 0; a < 3; a++) {
    float dd = d[a], oo = o[a], lo = bmin[a], hi = bmax[a];
    if (abs(dd) < 1e-12) {
      if (oo < lo || oo > hi) return false;
      continue;
    }
    float inv = 1.0 / dd;
    float t0 = (lo - oo) * inv;
    float t1 = (hi - oo) * inv;
    if (t0 > t1) { float t = t0; t0 = t1; t1 = t; }
    tNear = max(tNear, t0);
    tFar = min(tFar, t1);
    if (tNear > tFar) return false;
  }
  if (tFar < 0.0) return false;
  tNear = max(0.0, tNear);
  return true;
}
`,io=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,so=`#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 vUv;

uniform sampler3D uDensity;
uniform sampler2D uSceneDepth;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform vec3 uEye;
uniform vec3 uForward;
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uTanHalfFov;
uniform float uAspect;
uniform float uNear;
uniform float uFar;
uniform float uWorldStep;
uniform int uMaxSteps;
uniform float uDensityScale;
uniform vec3 uColourLow;
uniform vec3 uColourHigh;
uniform vec3 uLightDir;
uniform float uLightSteps;
uniform float uEmission;

out vec4 frag;
${qr}

float sampleDensity(vec3 p){
  vec3 uvw = (p - uBoxMin) / (uBoxMax - uBoxMin);
  if (any(lessThan(uvw, vec3(0.0))) || any(greaterThan(uvw, vec3(1.0)))) return 0.0;
  return texture(uDensity, uvw).r * uDensityScale;
}

float lightTransmittance(vec3 p){
  if (uLightSteps < 1.0) return 1.0;
  vec3 toLight = -normalize(uLightDir);
  float tN, tF;
  if (!lcxRayBox(p, toLight, uBoxMin, uBoxMax, tN, tF)) return 1.0;
  float len = tF - tN;
  int n = int(uLightSteps);
  float dl = len / float(n);
  float tau = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= n) break;
    tau += sampleDensity(p + toLight * (float(i) + 0.5) * dl) * dl;
  }
  return exp(-tau);
}

void main(){

  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 dir = normalize(uForward + uRight * (ndc.x * uTanHalfFov * uAspect) + uUp * (ndc.y * uTanHalfFov));

  float tN, tF;
  if (!lcxRayBox(uEye, dir, uBoxMin, uBoxMax, tN, tF)) { frag = vec4(0.0); return; }

  float dz = texture(uSceneDepth, vUv).r * 2.0 - 1.0;
  float viewZ = (2.0 * uNear * uFar) / (uFar + uNear - dz * (uFar - uNear));
  float cosA = max(1e-4, dot(dir, normalize(uForward)));
  float tGeom = viewZ / cosA;
  tF = min(tF, tGeom);
  if (tF <= tN) { frag = vec4(0.0); return; }

  float len = tF - tN;
  int steps = int(min(float(uMaxSteps), max(1.0, ceil(len / uWorldStep))));
  float dt = uWorldStep;

  vec3 acc = vec3(0.0);
  float alpha = 0.0;
  for (int i = 0; i < 256; i++) {
    if (i >= steps) break;
    float t = tN + (float(i) + 0.5) * dt;
    if (t > tF) break;
    float d = sampleDensity(uEye + dir * t);
    if (d <= 0.0005) continue;

    vec3 col = mix(uColourLow, uColourHigh, clamp(d, 0.0, 1.0));
    float tr = lightTransmittance(uEye + dir * t);

    vec3 lit = col * (uEmission + (1.0 - uEmission) * tr);

    float a = 1.0 - exp(-d * dt);
    acc += lit * a * (1.0 - alpha);
    alpha += a * (1.0 - alpha);

    if (alpha > 0.995) break;
  }

  frag = vec4(acc, alpha);
}`;function It(e,r,n,t){let o=e.gl,a=Math.max(2,Math.floor(r)),i=Math.max(2,Math.floor(n)),s=Math.max(2,Math.floor(t));if(!o.getExtension("OES_texture_float_linear"))return L("MISSING_EXTENSION","the volume needs OES_texture_float_linear for trilinear sampling of the density grid \u2014 without it a float sampler3D silently falls back to NEAREST and the field renders as voxel blocks");let l=e.compile(io,so);if("kind"in l)return l;let u=o.createTexture();o.bindTexture(o.TEXTURE_3D,u),o.texStorage3D(o.TEXTURE_3D,1,o.R32F,a,i,s),o.texParameteri(o.TEXTURE_3D,o.TEXTURE_MIN_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_3D,o.TEXTURE_MAG_FILTER,o.LINEAR);for(let c of[o.TEXTURE_WRAP_S,o.TEXTURE_WRAP_T,o.TEXTURE_WRAP_R])o.texParameteri(o.TEXTURE_3D,c,o.CLAMP_TO_EDGE);o.bindTexture(o.TEXTURE_3D,null);let m=o.createVertexArray(),d=c=>o.getUniformLocation(l,c);return{size:[a,i,s],upload(c){let b=a*i*s,E=c.length===b?c:(()=>{let f=new Float32Array(b);return f.set(c.subarray(0,Math.min(b,c.length))),f})();o.bindTexture(o.TEXTURE_3D,u),o.texSubImage3D(o.TEXTURE_3D,0,0,0,0,a,i,s,o.RED,o.FLOAT,E),o.bindTexture(o.TEXTURE_3D,null)},draw(c){if(Kr(o,c.sceneDepth))return L("FEEDBACK_LOOP","the volumetric field was asked to march against the depth attachment of the very framebuffer it is drawing into \u2014 draw it into a separate target and composite that, as E7 does");let b=ae(o);o.useProgram(l),o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_3D,u),o.uniform1i(d("uDensity"),0),o.activeTexture(o.TEXTURE1),o.bindTexture(o.TEXTURE_2D,c.sceneDepth),o.uniform1i(d("uSceneDepth"),1),o.uniform3fv(d("uBoxMin"),c.boxMin),o.uniform3fv(d("uBoxMax"),c.boxMax),o.uniform3fv(d("uEye"),c.eye),o.uniform3fv(d("uForward"),c.forward),o.uniform3fv(d("uRight"),c.right),o.uniform3fv(d("uUp"),c.up),o.uniform1f(d("uTanHalfFov"),Math.tan(c.fovDeg*Math.PI/360)),o.uniform1f(d("uAspect"),c.aspect),o.uniform1f(d("uNear"),c.near),o.uniform1f(d("uFar"),c.far),o.uniform1f(d("uWorldStep"),c.worldStep??.06),o.uniform1i(d("uMaxSteps"),Math.min(256,c.maxSteps??128)),o.uniform1f(d("uDensityScale"),c.densityScale??1),o.uniform3fv(d("uColourLow"),c.colourLow),o.uniform3fv(d("uColourHigh"),c.colourHigh),o.uniform3fv(d("uLightDir"),c.lightDir),o.uniform1f(d("uLightSteps"),Math.min(16,Math.max(0,c.lightSteps??6))),o.uniform1f(d("uEmission"),Math.min(1,Math.max(0,c.emission??.25))),o.enable(o.BLEND),o.blendFunc(o.ONE,o.ONE_MINUS_SRC_ALPHA),o.disable(o.DEPTH_TEST),o.depthMask(!1),o.bindVertexArray(m),o.drawArrays(o.TRIANGLES,0,3),o.bindVertexArray(null),Me(o,2),ie(o,b)},dispose(){o.deleteTexture(u),o.deleteVertexArray(m),o.deleteProgram(l)}}}var kt=["minimum","reduced","full"],Ct={full:{dprScale:2,ao:!0,dof:!0,shadowMapSize:1536,shadowTaps:9,volumeLightSteps:6},reduced:{dprScale:2,ao:!0,dof:!1,shadowMapSize:1024,shadowTaps:9,volumeLightSteps:4},minimum:{dprScale:1,ao:!1,dof:!1,shadowMapSize:512,shadowTaps:1,volumeLightSteps:1}};function ct(e,r){let n=Number.isFinite(r)&&r>0?r:1024,t=Ct[e].shadowMapSize/Ct.full.shadowMapSize,o=n*t,a=2**Math.round(Math.log2(o));return Math.max(256,Math.min(n,a))}function Gt(e){return{tier:e,...Ct[e]}}var Ht=89,Vt=Math.PI/180;function dt(e){let r=Math.max(-Ht,Math.min(Ht,e.elevationDeg))*Vt,n=e.azimuthDeg*Vt,t=Math.max(1e-4,e.distance),o=Math.sin(r)*t,a=Math.cos(r)*t;return[e.target[0]+Math.sin(n)*a,e.target[1]+o,e.target[2]+Math.cos(n)*a]}function mt(e,r){let n=dt(e),t=e.near??Math.max(.01,e.distance/100),o=e.far??Math.max(t+1,e.distance*8),a=wt((e.fovDeg??38)*Vt,Math.max(.001,r),t,o),i=it(n,e.target,[0,1,0]);return at(a,i)}function Wt(e,r,n){let t=z(e.direction),o=e.extent??Math.max(.1,n*1.35),a=Math.max(1,n*2),i=[r[0]-t[0]*a,r[1]-t[1]*a,r[2]-t[2]*a],s=Math.abs(t[1])>.99?[0,0,1]:[0,1,0],l=it(i,r,s),u=_t(-o,o,-o,o,.01,a+n*2+o);return at(u,l)}function Xt(e,r){let n=be([r[0],r[1],r[2]],[e[0],e[1],e[2]]);return Math.hypot(n[0],n[1],n[2])/2}function zt(e,r){return[(e[0]+r[0])/2,(e[1]+r[1])/2,(e[2]+r[2])/2]}function Ie(e,r,n){let{gl:t}=e,o=Math.max(1,Math.floor(r)),a=Math.max(1,Math.floor(n)),i=t.createFramebuffer(),s=t.createTexture(),l=t.createTexture();if(!i||!s||!l)return L("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let u=e.hdr?t.RGBA16F:t.RGBA8,m=e.hdr?t.HALF_FLOAT:t.UNSIGNED_BYTE,d=()=>{t.bindTexture(t.TEXTURE_2D,s),t.texImage2D(t.TEXTURE_2D,0,u,o,a,0,t.RGBA,m,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindTexture(t.TEXTURE_2D,l),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,o,a,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,i),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,s,0),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,l,0),t.bindFramebuffer(t.FRAMEBUFFER,null)};d(),t.bindFramebuffer(t.FRAMEBUFFER,i);let c=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),c!==t.FRAMEBUFFER_COMPLETE?L("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${c.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:s,depthTexture:l,get width(){return o},get height(){return a},bind(){t.bindFramebuffer(t.FRAMEBUFFER,i),t.viewport(0,0,o,a)},resize(b,E){let f=Math.max(1,Math.floor(b)),p=Math.max(1,Math.floor(E));f===o&&p===a||(o=f,a=p,d())},dispose(){t.deleteFramebuffer(i),t.deleteTexture(s),t.deleteTexture(l)}}}function $t(e,r=1024){let{gl:n}=e,t=Math.max(256,Math.min(2048,Math.floor(r))),o=n.createFramebuffer(),a=n.createTexture();if(!o||!a)return L("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");n.bindTexture(n.TEXTURE_2D,a),n.texImage2D(n.TEXTURE_2D,0,n.DEPTH_COMPONENT24,t,t,0,n.DEPTH_COMPONENT,n.UNSIGNED_INT,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.bindFramebuffer(n.FRAMEBUFFER,o),n.framebufferTexture2D(n.FRAMEBUFFER,n.DEPTH_ATTACHMENT,n.TEXTURE_2D,a,0);let i=n.checkFramebufferStatus(n.FRAMEBUFFER);return n.bindFramebuffer(n.FRAMEBUFFER,null),i!==n.FRAMEBUFFER_COMPLETE?L("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:t,bind(){n.bindFramebuffer(n.FRAMEBUFFER,o),n.viewport(0,0,t,t)},dispose(){n.deleteFramebuffer(o),n.deleteTexture(a)}}}var Yt=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,jt={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function Zr(e,r,n={}){let t=n.zenith??jt.zenith,o=n.horizon??jt.horizon,a=n.ground??jt.ground;e.uniform3f(e.getUniformLocation(r,"uSkyZenith"),t[0],t[1],t[2]),e.uniform3f(e.getUniformLocation(r,"uSkyHorizon"),o[0],o[1],o[2]),e.uniform3f(e.getUniformLocation(r,"uSkyGround"),a[0],a[1],a[2])}var la=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${Yt}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;var Jr=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,Qt=`#version 300 es
precision highp float;
void main(){}`,uo=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,en=`#version 300 es
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
}`,tn=`#version 300 es
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
${Yt}

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
}`;function q(e,r){let{gl:n}=e,t=n.createVertexArray(),o=n.createBuffer(),a=n.createBuffer(),i=n.createBuffer(),s=n.createBuffer();return!t||!o||!a||!i||!s?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(n.bindVertexArray(t),n.bindBuffer(n.ARRAY_BUFFER,o),n.bufferData(n.ARRAY_BUFFER,r.positions,n.STATIC_DRAW),n.enableVertexAttribArray(0),n.vertexAttribPointer(0,3,n.FLOAT,!1,0,0),n.bindBuffer(n.ARRAY_BUFFER,a),n.bufferData(n.ARRAY_BUFFER,r.normals,n.STATIC_DRAW),n.enableVertexAttribArray(1),n.vertexAttribPointer(1,3,n.FLOAT,!1,0,0),n.bindBuffer(n.ARRAY_BUFFER,i),n.bufferData(n.ARRAY_BUFFER,r.tangents,n.STATIC_DRAW),n.enableVertexAttribArray(2),n.vertexAttribPointer(2,3,n.FLOAT,!1,0,0),n.bindBuffer(n.ELEMENT_ARRAY_BUFFER,s),n.bufferData(n.ELEMENT_ARRAY_BUFFER,r.indices,n.STATIC_DRAW),n.bindVertexArray(null),{vao:t,indexCount:r.indices.length,indexType:r.indices instanceof Uint32Array?n.UNSIGNED_INT:n.UNSIGNED_SHORT,dispose(){n.deleteVertexArray(t),n.deleteBuffer(o),n.deleteBuffer(a),n.deleteBuffer(i),n.deleteBuffer(s)}})}function Kt(e){let{gl:r}=e,n=e.compile(Jr,Qt);if("kind"in n)return n;let t=e.compile(en,tn);if("kind"in t)return t;let o=e.compile(uo,Qt);if("kind"in o)return o;let a=(i,s)=>r.getUniformLocation(i,s);return{shadowPass(i,s,l,u){let m=ae(r),d=u??(()=>{});l.bind(),d("shadow.bind"),r.clear(r.DEPTH_BUFFER_BIT),r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.FRONT),r.useProgram(n),d("useProgram(shadow)"),r.uniformMatrix4fv(a(n,"uLightVP"),!1,i),d("uLightVP");for(let c of s)r.uniformMatrix4fv(a(n,"uModel"),!1,c.model),d("shadow uModel"),r.bindVertexArray(c.mesh.vao),d("shadow bindVAO"),r.drawElements(r.TRIANGLES,c.mesh.indexCount,c.mesh.indexType,0),d("shadow drawElements");r.bindVertexArray(null),r.cullFace(r.BACK),ie(r,m)},depthPrepass(i,s){let l=ae(r);r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.colorMask(!1,!1,!1,!1),r.useProgram(o),r.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let u of s)r.uniformMatrix4fv(a(o,"uModel"),!1,u.model),r.bindVertexArray(u.mesh.vao),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0);r.bindVertexArray(null),r.colorMask(!0,!0,!0,!0),ie(r,l)},draw(i){let s=ae(r),l=i.onStep??(()=>{});if(r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.useProgram(t),r.uniformMatrix4fv(a(t,"uViewProj"),!1,i.viewProj),l("uViewProj"),r.uniform3fv(a(t,"uEye"),i.eye),l("uEye"),r.uniform3fv(a(t,"uLightDir"),i.lightDir),l("uLightDir"),r.uniform3fv(a(t,"uLightColour"),i.lightColour),l("uLightColour"),r.uniform1f(a(t,"uAmbientGain"),i.ambientGain??1),l("uAmbientGain"),i.fog&&i.fog.density>0){r.uniform1f(a(t,"uFogDensity"),i.fog.density),r.uniform1f(a(t,"uFogHeight"),i.fog.height),r.uniform1f(a(t,"uFogFloor"),i.fog.floor??0);let u=i.fog.colour;u==="sky"?r.uniform3f(a(t,"uFogColour"),-1,-1,-1):r.uniform3f(a(t,"uFogColour"),u[0],u[1],u[2]),l("fog")}else r.uniform1f(a(t,"uFogDensity"),0);if(Zr(r,t,i.sky),l("bindSky"),i.ao&&i.screenSize?(r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,i.ao),r.uniform1i(a(t,"uAO"),1),r.uniform2f(a(t,"uScreenSize"),i.screenSize[0],i.screenSize[1]),r.uniform1f(a(t,"uAOEnabled"),1)):r.uniform1f(a(t,"uAOEnabled"),0),l("bindAO"),r.uniformMatrix4fv(a(t,"uLightVP"),!1,i.lightVP),l("lit uLightVP"),i.shadow){r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,i.shadow.depthTexture),r.uniform1i(a(t,"uShadowMap"),0),r.uniform1f(a(t,"uShadowTexel"),1/i.shadow.size),r.uniform1f(a(t,"uShadowStrength"),i.shadowStrength??1),r.uniform1i(a(t,"uShadowTaps"),(i.shadowTaps??9)>=9?9:1);let u=i.shadowBaseline,m=u&&u>0&&i.shadow.size>0?u/i.shadow.size:1;r.uniform1f(a(t,"uShadowBiasScale"),Number.isFinite(m)&&m>0?m:1)}else r.uniform1f(a(t,"uShadowStrength"),0);for(let u of i.draws)r.uniformMatrix4fv(a(t,"uModel"),!1,u.model),r.uniformMatrix3fv(a(t,"uNormalMat"),!1,u.normalMat),l("uNormalMat"),r.uniform3fv(a(t,"uBaseColour"),u.material.baseColour),l("uBaseColour"),r.uniform1f(a(t,"uRoughness"),u.material.roughness),r.uniform1f(a(t,"uMetalness"),u.material.metalness),r.uniform1f(a(t,"uAnisotropy"),u.material.anisotropy??0),r.bindVertexArray(u.mesh.vao),l("lit bindVAO"),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0),l("lit drawElements");r.bindVertexArray(null),Me(r,2),ie(r,s)},dispose(){r.deleteProgram(n),r.deleteProgram(t),r.deleteProgram(o)}}}var qt=`
uniform sampler2D uDepth;
uniform vec2 uNearFar;

float linearDepthAt(vec2 uv) {
  float d = texture(uDepth, uv).r * 2.0 - 1.0;
  float n = uNearFar.x, f = uNearFar.y;
  return (2.0 * n * f) / (f + n - d * (f - n));
}`,nn=`
uniform float uTanHalfFov;
uniform float uAspect;

vec3 viewPosAt(vec2 uv) {
  float z = linearDepthAt(uv);
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x * uTanHalfFov * uAspect * z, ndc.y * uTanHalfFov * z, -z);
}`,on=qt+nn,rn=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,lo=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${on}

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
}`,co=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${qt}

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
}`;function Zt(e,r,n){let{gl:t}=e,o=e.compile(rn,lo);if("kind"in o)return o;let a=e.compile(rn,co);if("kind"in a)return a;let i=Math.max(1,r>>1),s=Math.max(1,n>>1),l=()=>{let f=t.createFramebuffer(),p=t.createTexture();return!f||!p?null:{fb:f,tex:p}},u=l(),m=l();if(!u||!m)return L("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let d=()=>{for(let f of[u,m])t.bindTexture(t.TEXTURE_2D,f.tex),t.texImage2D(t.TEXTURE_2D,0,t.R8,i,s,0,t.RED,t.UNSIGNED_BYTE,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,f.fb),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,f.tex,0);t.bindFramebuffer(t.FRAMEBUFFER,null)};d(),t.bindFramebuffer(t.FRAMEBUFFER,u.fb);let c=t.checkFramebufferStatus(t.FRAMEBUFFER);if(t.bindFramebuffer(t.FRAMEBUFFER,null),c!==t.FRAMEBUFFER_COMPLETE)return L("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${c.toString(16)}).`);let b=(f,p,T,R,v)=>{t.activeTexture(t.TEXTURE0+v),t.bindTexture(t.TEXTURE_2D,p),t.uniform1i(t.getUniformLocation(f,"uDepth"),v),t.uniform2f(t.getUniformLocation(f,"uNearFar"),T,R)},E=(f,p,T,R,v,N,W)=>{b(f,p,T,R,W),t.uniform1f(t.getUniformLocation(f,"uTanHalfFov"),Math.tan(v*Math.PI/360)),t.uniform1f(t.getUniformLocation(f,"uAspect"),N)};return{get texture(){return u.tex},get width(){return i},get height(){return s},compute(f){let p=ae(t);t.disable(t.DEPTH_TEST),t.depthMask(!1),t.disable(t.BLEND),t.disable(t.CULL_FACE),t.bindFramebuffer(t.FRAMEBUFFER,u.fb),t.viewport(0,0,i,s),t.useProgram(o),E(o,f.depthTexture,f.near,f.far,f.fovDeg,f.aspect,0),t.uniform2f(t.getUniformLocation(o,"uTexel"),1/i,1/s),t.uniform1f(t.getUniformLocation(o,"uRadius"),f.radius??.55),t.uniform1f(t.getUniformLocation(o,"uStrength"),f.strength??1.15),t.uniform1f(t.getUniformLocation(o,"uBias"),f.bias??.035),e.blit(o);for(let[T,R,v]of[[u,m,[1,0]],[m,u,[0,1]]])t.bindFramebuffer(t.FRAMEBUFFER,R.fb),t.viewport(0,0,i,s),t.useProgram(a),b(a,f.depthTexture,f.near,f.far,0),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,T.tex),t.uniform1i(t.getUniformLocation(a,"uAO"),1),t.uniform2f(t.getUniformLocation(a,"uTexel"),1/i,1/s),t.uniform2f(t.getUniformLocation(a,"uDir"),v[0],v[1]),e.blit(a);Me(t,2),ie(t,p)},resize(f,p){let T=Math.max(1,f>>1),R=Math.max(1,p>>1);T===i&&R===s||(i=T,s=R,d())},dispose(){t.deleteProgram(o),t.deleteProgram(a);for(let f of[u,m])t.deleteFramebuffer(f.fb),t.deleteTexture(f.tex)}}}var ye=new URLSearchParams(location.search),sr=[],bn=[];function hn(e,r,n,t){let o=ye.get(e);if(o===null)return r;let a=Number(o);if(!Number.isFinite(a))return sr.push(`${e}=${o}`),r;let i=Math.max(n,Math.min(t,a));return i!==a&&bn.push(`${e}=${o} used as ${i}`),i}var pn=ye.get("vol")!=="0",Sr=ye.get("depth")!=="0",vr=kt.includes(ye.get("tier")??"")?ye.get("tier"):"full",Le=Gt(vr),ur=ye.get("ao")!=="0"&&Le.ao,qe=hn("scale",1,1,3),En=Math.trunc(hn("frames",300,1,2e4)),O=1200*qe,I=720*qe,De=document.getElementById("c");De.width=O;De.height=I;var Fr=document.getElementById("log");function Rt(e){document.title="REFUSED",Fr.textContent=e;let[r,...n]=e.split(":");throw xn?.showRefusal(r?.trim()??"REFUSED",n.join(":").trim()||e),new Error(e)}var xn=null;function B(e,r){return"kind"in r&&Rt(`${e}: ${r.code} \u2014 ${r.reason} ${r.detail??""}`),r}var C=["PAID_SEARCH","PAID_SOCIAL","INFLUENCER","EMAIL","PR_EARNED","AFFILIATE","COMMUNITY"],Ue=["ADVISORY","ELEVATED","SEVERE"],_=28,mo=[.05,.07,.04,.025,.02,.055,.045],Ze=[{ch:0,day:1,band:1,w:.3},{ch:3,day:2,band:1,w:.25},{ch:6,day:3,band:1,w:.2},{ch:2,day:4,band:1,w:.5},{ch:2,day:5,band:1,w:.8},{ch:2,day:6,band:2,w:.7},{ch:2,day:7,band:2,w:1},{ch:2,day:8,band:2,w:.9},{ch:2,day:9,band:1,w:.6},{ch:2,day:10,band:1,w:.35},{ch:1,day:6,band:1,w:.4},{ch:1,day:7,band:1,w:.75},{ch:1,day:8,band:2,w:.85},{ch:1,day:9,band:2,w:1.05},{ch:1,day:10,band:2,w:.8},{ch:1,day:11,band:1,w:.5},{ch:1,day:12,band:1,w:.3},{ch:6,day:8,band:1,w:.3},{ch:6,day:9,band:1,w:.55},{ch:6,day:10,band:2,w:.7},{ch:6,day:11,band:2,w:.95},{ch:6,day:12,band:2,w:.75},{ch:6,day:13,band:1,w:.45},{ch:6,day:14,band:1,w:.25},{ch:4,day:10,band:1,w:.35},{ch:4,day:11,band:1,w:.6},{ch:4,day:12,band:2,w:.8},{ch:4,day:13,band:2,w:.6},{ch:4,day:14,band:1,w:.4},{ch:0,day:13,band:1,w:.45},{ch:0,day:14,band:2,w:.75},{ch:0,day:15,band:2,w:.6},{ch:0,day:16,band:1,w:.3},{ch:3,day:14,band:1,w:.4},{ch:3,day:15,band:1,w:.55},{ch:3,day:16,band:1,w:.3},{ch:5,day:24,band:1,w:.5},{ch:5,day:25,band:2,w:.7},{ch:5,day:26,band:1,w:.4}],X=[13,14,15],Je=[22,23],U=e=>X.includes(e)?"ABSENT":Je.includes(e)?"WITHHELD":"OBSERVED",te=C.map((e,r)=>Array.from({length:_},(n,t)=>{let o=[0,0,0];return U(t)==="OBSERVED"&&(o[0]=mo[r]),o}));for(let e of Ze)U(e.day)==="OBSERVED"&&(te[e.ch][e.day][e.band]+=e.w);var yn=Ze.filter(e=>U(e.day)!=="OBSERVED"),je=0;for(let e of te)for(let r of e)for(let n of r)je=Math.max(je,n);var Mr=8,Ce=0,J=-1,bt=null,xt=[];for(let e=0;e<_;e++){if(U(e)!=="OBSERVED"){xt.push(Ce),J<0&&bt===null&&(bt=U(e)==="ABSENT"?"THRESHOLD_NOT_REACHED_BEFORE_UNMEASURED_DAY":"THRESHOLD_NOT_REACHED_BEFORE_WITHHELD_DAY");continue}for(let r=0;r<C.length;r++)for(let n=0;n<Ue.length;n++)Ce+=te[r][e][n];xt.push(Ce),J<0&&Ce>=Mr&&(J=e,bt=null)}var fo=Math.min(...X),lr=Math.min(...Je),wr=e=>{let r=U(e);return r==="ABSENT"?"DAY_NOT_MEASURED":r==="WITHHELD"?"DAY_WITHHELD":e>fo?"INTEGRAL_CROSSES_UNMEASURED_DAY":e>lr?"INTEGRAL_CROSSES_WITHHELD_DAY":"INTEGRABLE"},_r=Math.max(...Array.from({length:_},(e,r)=>r).filter(e=>wr(e)==="INTEGRABLE")),gn=Hr({title:"E7 \xB7 The Storm \u2014 marketing risk by day, channel and severity",readsAs:"Depth is days ahead in the rendered view, and the opacity along any line of sight is the total risk between the viewer and that day \u2014 an accumulation a per-cell table cannot show. The front advancing across channels, the three-day hole where the monitor was down, and the two days that are measured but withheld are all shapes there and rows here. This table carries every cell; what it cannot carry is what lies between you and a day.",notices:[`SYNTHETIC RISK DATA \u2014 ${Ze.length} hand-authored flagged items over ${_} days. The shape is deliberate; the values are not measurements.`,`D${Math.min(...X)}-D${Math.max(...X)} were NOT MEASURED, and ${yn.length} already-scheduled flagged items landed inside them: their weight is in no cell below and is not zero. Every cumulative figure past that day is REFUSED.`],columns:[{key:"day",label:"Day"},{key:"state",label:"State"},{key:"reading",label:"Cumulative reading"},{key:"advisory",label:"Advisory",numeric:!0},{key:"elevated",label:"Elevated",numeric:!0},{key:"severe",label:"Severe",numeric:!0},{key:"total",label:"Day total",numeric:!0},{key:"cumulative",label:"Cumulative",numeric:!0}],rows:Array.from({length:_},(e,r)=>{let n=U(r),t=n==="OBSERVED",o=wr(r),a=s=>t?Number(C.reduce((l,u,m)=>l+te[m][r][s],0).toFixed(3)):null,i=t?Number(Ue.reduce((s,l,u)=>s+C.reduce((m,d,c)=>m+te[c][r][u],0),0).toFixed(3)):null;return{day:`D${r}`,state:n,reading:o==="INTEGRABLE"?"integrable":o,advisory:a(0),elevated:a(1),severe:a(2),total:i,cumulative:o==="INTEGRABLE"?Number(xt[r].toFixed(2)):null}})});xn=gn;sr.length>0&&Rt(`BAD_PARAM: ${sr.join(", ")} \u2014 not a number, so the view was not drawn rather than drawn at a nonsensical size. Nothing about the underlying measurements has changed; correct the URL and reload.`);ye.get("refuse")==="1"&&Rt("FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. The volumetric field is not being drawn.");var ht=Mt(De,{alpha:!1});Ft(ht)||Rt(`stage: ${ht.code} \u2014 ${ht.reason}`);var w=ht,h=w.gl,Tn=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,bo=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${Pt}
${Ut}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,ho=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uVolume;
out vec4 frag;
void main(){ frag = texture(uVolume, vUv); }`,po=B("present",w.compile(Tn,bo)),Eo=B("composite",w.compile(Tn,ho)),Jt=B("lit",Kt(w)),we=B("target",Ie(w,O,I)),an=B("volume target",Ie(w,O,I)),Rn=B("far depth",Ie(w,4,4)),cr=B("shadow",$t(w,ct(vr,1536))),sn=B("ao",Zt(w,O,I));Rn.bind();h.clearDepth(1);h.clear(h.DEPTH_BUFFER_BIT);h.bindFramebuffer(h.FRAMEBUFFER,null);var $=.5,Lr=2.6,xo=_*$,Ne=.62,Be=.46,Ye=.025,se=$*.78,j=.56,k=Ye/2,Y=e=>(e-(C.length-1)/2)*Ne,V=Y(C.length-1)+Be/2,he=Y(0)-Be/2-.03-j/2,Dr=he-j/2,yt=(Dr+V)/2,D=e=>-Lr-e*$,et=e=>D(e)-$/2,tt=.6,At=k+.02,An=At+Ue.length*tt,Sn=e=>At+(e+.5)*tt,M=[-V,At,D(_)],P=[V,An,D(0)],rt=.7,Nr=je*rt/$,de=76,me=42,ge=112,vn=(e,r,n)=>e+de*(r+me*n),yo=e=>{for(let r=0;r<C.length;r++)if(Math.abs(e-Y(r))<=Be/2)return r;return-1},go=e=>{let r=Math.floor((-e-Lr)/$);return r>=0&&r<_?r:-1},To=e=>{let r=Math.floor((e-At)/tt);return r>=0&&r<Ue.length?r:-1},Ro=.62,Ao=(e,r,n)=>{let t=yo(e);if(t<0)return 0;let o=go(n);if(o<0||U(o)!=="OBSERVED")return 0;let a=To(r);if(a<0)return 0;let i=Math.abs(r-Sn(a))/(tt/2),s=Math.max(0,Math.min(1,(1-i)/(1-Ro)));return s<=0?0:te[t][o][a]*s/je},Ee=new Float32Array(de*me*ge);for(let e=0;e<ge;e++){let r=M[2]+(e+.5)/ge*(P[2]-M[2]);for(let n=0;n<me;n++){let t=M[1]+(n+.5)/me*(P[1]-M[1]);for(let o=0;o<de;o++){let a=M[0]+(o+.5)/de*(P[0]-M[0]);Ee[vn(o,n,e)]=Ao(a,t,r)}}}var dr=1/0,mr=-1/0,Fn=0,fr=0;for(let e of Ee)e<dr&&(dr=e),e>mr&&(mr=e),Fn+=e,e>0&&fr++;var pe=pn?It(w,de,me,ge):null,br=pe&&"kind"in pe?`${pe.code} \u2014 ${pe.reason}`:null,Pe=pe&&!("kind"in pe)?pe:null;Pe&&Pe.upload(Ee);var ke=.125,Ge=128,hr=2.5,pr=32,ue={target:[yt,.366,et(5.13)],distance:10,azimuthDeg:0,elevationDeg:21.3,fovDeg:33,near:hr,far:pr},H=dt(ue),ee=z(be(ue.target,H)),He=z(Ae(ee,[0,1,0])),pt=z(Ae(He,ee)),_e=Math.tan((ue.fovDeg??36)*Math.PI/360),xe=O/I,Mn=Q(Be,Ye,se),wn=Q(j,Ye,se),_n=Q(2*V,.42,se),Ln=Q(2*V+j+.06,.1,.05),Dn=Q(2*V,.07,.05),Nn=Q(2*V,.11,.05),Pn=Q(.075,1.05,.075),Un=B("tile",q(w,Mn)),Bn=B("gutter",q(w,wn)),On=B("lid",q(w,_n)),In=B("rail",q(w,Ln)),Cn=B("week bar",q(w,Dn)),kn=B("gate",q(w,Nn)),Gn=B("post",q(w,Pn)),So=new Float32Array([1,0,0,0,1,0,0,0,1]),vo=(e,r,n)=>{let t=ot();return t[12]=e,t[13]=r,t[14]=n,t},Z={tile:{baseColour:G("#22315A"),roughness:.74,metalness:.03},gutter:{baseColour:G("#131E36"),roughness:.84,metalness:0},withheldTile:{baseColour:G("#1B2540"),roughness:.55,metalness:.1},lid:{baseColour:G("#6B7A99"),roughness:.62,metalness:.35},rail:{baseColour:G("#6B7A99"),roughness:.58,metalness:.25},week:{baseColour:G("#26355A"),roughness:.6,metalness:.05},gate:{baseColour:G("#2C6BFF"),roughness:.52,metalness:.06}},Pr=[],Ve=[],le=(e,r,n,t,o,a,i,s)=>{Ve.push({mesh:i,model:vo(e,r,n),normalMat:So,material:s}),Pr.push({min:[e-t/2,r-o/2,n-a/2],max:[e+t/2,r+o/2,n+a/2]})},Hn=0,Vn=0;for(let e=0;e<_;e++){let r=U(e),n=et(e);if(r==="ABSENT"){Vn+=C.length+1;continue}le(he,0,n,j,Ye,se,Bn,Z.gutter);for(let t=0;t<C.length;t++)le(Y(t),0,n,Be,Ye,se,Un,r==="WITHHELD"?Z.withheldTile:Z.tile);Hn+=C.length+1,r==="WITHHELD"&&le(0,k+.21,n,2*V,.42,se,On,Z.lid)}var Fo=[D(Math.min(...X))+.02,D(Math.max(...X)+1)-.02];for(let e of Fo){le(yt,k+.05,e,2*V+j+.06,.1,.05,In,Z.rail);for(let r=0;r<=C.length;r++)le(Y(0)-Ne/2+r*Ne,k+.525,e,.075,1.05,.075,Gn,Z.rail)}var Ur=[7,14,21,28],Wn=Ur.filter(e=>U(e-1)!=="ABSENT"&&U(Math.min(e,_-1))!=="ABSENT");for(let e of Wn)le(0,k+.035,D(e),2*V,.07,.05,Cn,Z.week);if(J>=0){let e=D(J);le(0,k+.055,e,2*V,.11,.05,kn,Z.gate);for(let r=0;r<=C.length;r++)le(Y(0)-Ne/2+r*Ne,k+.525,e,.075,1.05,.075,Gn,Z.gate)}var Er=[.44,-.66,-.61],un=[Dr-.2,0,D(_)-.3],ln=[V+.2,An,-Lr+.3],cn=Wt({direction:Er,colour:[1,1,1],extent:9.5},zt(un,ln),Xt(un,ln)),Mo=Ve.reduce((e,r)=>e+(r.mesh===Un?K(Mn):r.mesh===Bn?K(wn):r.mesh===On?K(_n):r.mesh===In?K(Ln):r.mesh===Cn?K(Dn):r.mesh===kn?K(Nn):K(Pn)),0),er=G("#070B14"),wo={zenith:[.01,.014,.03],horizon:[.03,.044,.08],ground:[.006,.007,.012]},tr=G("#2C6BFF"),rr=G("#FF8A3D"),_o=[tr[0]*.55,tr[1]*.55,tr[2]*.55],Lo=[rr[0]*1.45,rr[1]*1.45,rr[2]*1.45],Xn=$/rt,Do=te.reduce((e,r)=>e+r.reduce((n,t)=>n+t.filter(o=>o>Xn).length,0),0);function Qe(e=Sr){let r=mt(ue,xe);Jt.shadowPass(cn,Ve,cr),we.bind(),h.clearColor(er[0],er[1],er[2],1),h.clear(h.COLOR_BUFFER_BIT|h.DEPTH_BUFFER_BIT),Jt.depthPrepass(r,Ve),ur&&(sn.compute({depthTexture:we.depthTexture,near:hr,far:pr,fovDeg:ue.fovDeg??36,aspect:xe,radius:.34,strength:1.15}),we.bind()),Jt.draw({viewProj:r,eye:H,lightDir:Er,lightColour:[2.05,2,1.92],ambientGain:.62,sky:wo,lightVP:cn,shadow:cr,shadowStrength:.92,shadowTaps:Le.shadowTaps,shadowBaseline:1536,draws:Ve,ao:ur?sn.texture:null,screenSize:[O,I]}),Pe&&(an.bind(),h.clearColor(0,0,0,0),h.clear(h.COLOR_BUFFER_BIT|h.DEPTH_BUFFER_BIT),Pe.draw({eye:H,forward:ee,right:He,up:pt,fovDeg:ue.fovDeg??36,aspect:xe,near:hr,far:pr,sceneDepth:e?we.depthTexture:Rn.depthTexture,boxMin:M,boxMax:P,worldStep:ke,maxSteps:Ge,densityScale:Nr,colourLow:_o,colourHigh:Lo,lightDir:Er,lightSteps:Le.volumeLightSteps,emission:.26}),we.bind(),h.enable(h.BLEND),h.blendFunc(h.ONE,h.ONE_MINUS_SRC_ALPHA),h.disable(h.DEPTH_TEST),h.activeTexture(h.TEXTURE0),h.bindTexture(h.TEXTURE_2D,an.texture),w.blit(Eo,n=>h.uniform1i(h.getUniformLocation(n,"uVolume"),0)),h.disable(h.BLEND)),h.bindFramebuffer(h.FRAMEBUFFER,null),h.viewport(0,0,O,I),h.disable(h.DEPTH_TEST),h.activeTexture(h.TEXTURE0),h.bindTexture(h.TEXTURE_2D,we.texture),w.blit(po,n=>h.uniform1i(h.getUniformLocation(n,"uScene"),0))}function No(e){Qe();let r=new Uint8Array(4);h.readPixels(0,0,1,1,h.RGBA,h.UNSIGNED_BYTE,r);let n=performance.now();for(let t=0;t<e;t++)Qe();return h.readPixels(0,0,1,1,h.RGBA,h.UNSIGNED_BYTE,r),(performance.now()-n)/e}var nr=No(Math.max(1,En));function Po(){if(!Pe)return{pixels:0,pct:0,meanDelta:0,maxDelta:0};let e=new Uint8Array(O*I*4),r=new Uint8Array(O*I*4);Qe(!0),h.readPixels(0,0,O,I,h.RGBA,h.UNSIGNED_BYTE,e),Qe(!1),h.readPixels(0,0,O,I,h.RGBA,h.UNSIGNED_BYTE,r);let n=0,t=0,o=0;for(let a=0;a<e.length;a+=4){let i=Math.max(Math.abs(e[a]-r[a]),Math.abs(e[a+1]-r[a+1]),Math.abs(e[a+2]-r[a+2]));i>2&&(n++,t+=i,i>o&&(o=i))}return{pixels:n,pct:Number((100*n/(O*I)).toFixed(2)),meanDelta:Number((t/Math.max(1,n)).toFixed(1)),maxDelta:o}}var ft=Po(),Uo=(e,r,n)=>{let t=(e-M[0])/(P[0]-M[0]),o=(r-M[1])/(P[1]-M[1]),a=(n-M[2])/(P[2]-M[2]);if(t<0||t>1||o<0||o>1||a<0||a>1)return 0;let i=t*de-.5,s=o*me-.5,l=a*ge-.5,u=Math.floor(i),m=Math.floor(s),d=Math.floor(l),c=i-u,b=s-m,E=l-d,f=(T,R)=>T<0?0:T>R-1?R-1:T,p=0;for(let T=0;T<2;T++)for(let R=0;R<2;R++)for(let v=0;v<2;v++){let N=(v?c:1-c)*(R?b:1-b)*(T?E:1-E);N<=0||(p+=N*Ee[vn(f(u+v,de),f(m+R,me),f(d+T,ge))])}return p*Nr},zn=(e,r,n)=>{let t=ut(e,r,M,P);if(!t)return{tau:0,truncated:!1,capped:!1,hit:!1,tStart:0,tEnd:0};let o=Math.min(t.tFar,n),a=n<t.tFar;if(o<=t.tNear)return{tau:0,truncated:!1,capped:a,hit:!0,tStart:t.tNear,tEnd:t.tNear};let i=lt(o-t.tNear,ke,Ge),s=0;for(let l=0;l<i.steps;l++){let u=t.tNear+(l+.5)*i.step;if(u>o)break;let m=Uo(e[0]+r[0]*u,e[1]+r[1]*u,e[2]+r[2]*u);m<=5e-4||(s+=m*i.step)}return{tau:s,truncated:i.truncated,capped:a,hit:!0,tStart:t.tNear,tEnd:o}},ce=C.flatMap((e,r)=>Ue.map((n,t)=>{let o=te[r].reduce((s,l,u)=>s+(U(u)==="OBSERVED"?l[t]:0),0),a=zn([Y(r),Sn(t),P[2]+1],[0,0,-1],1/0),i=a.tau/rt;return{channel:e,band:n,expected:Number(o.toFixed(4)),measured:Number(i.toFixed(4)),errorPct:o>1e-6?Number((100*Math.abs(i-o)/o).toFixed(2)):0,truncated:a.truncated}})),Bo=Math.max(...ce.map(e=>e.errorPct)),Oo=Number((ce.reduce((e,r)=>e+r.errorPct,0)/ce.length).toFixed(3)),Io=e=>{let r=1/0;for(let n of Pr){let t=ut(H,e,n.min,n.max);t&&t.tNear>0&&t.tNear<r&&(r=t.tNear)}return r},We=61,Xe=37,ze=0,$n=0,jn=0,Ke=1/0,gt=0,Yn=0,xr=0,Qn=0,yr=0,Br=0,gr=0,Or=0;for(let e=0;e<Xe;e++)for(let r=0;r<We;r++){let n=2*(r+.5)/We-1,t=2*(e+.5)/Xe-1,o=z([ee[0]+He[0]*n*_e*xe+pt[0]*t*_e,ee[1]+He[1]*n*_e*xe+pt[1]*t*_e,ee[2]+He[2]*n*_e*xe+pt[2]*t*_e]),a=zn(H,o,Io(o));if(!a.hit)continue;ze++,a.capped&&$n++,a.truncated&&jn++,Ke=Math.min(Ke,a.tau),gt=Math.max(gt,a.tau),Yn+=a.tau;let i=(m,d)=>H[d]+o[d]*m,s=Math.abs(i(a.tEnd,0)-i(a.tStart,0))/Ne,l=Math.abs(i(a.tEnd,2)-i(a.tStart,2))/$,u=Math.abs(i(a.tEnd,1)-i(a.tStart,1))/tt;xr=Math.max(xr,s),Qn+=s,yr=Math.max(yr,l),Br+=l,gr=Math.max(gr,u),Or+=u}Number.isFinite(Ke)||(Ke=0);var $e=e=>Number((e/Math.max(1,ze)).toFixed(2)),Tt=mt(ue,xe),Te=O/qe,Re=I/qe,St=document.createElement("div");St.style.cssText=`position:relative;overflow:hidden;width:${Te}px;height:${Re}px`;De.parentNode?.insertBefore(St,De);St.appendChild(De);var fe=document.createElement("div");fe.style.cssText="position:absolute;inset:0;pointer-events:none";St.appendChild(fe);var Co=e=>{let r=(i,s)=>Math.hypot(i.x-s.x,i.y-s.y),n=e[0],t=e[1],o=e[2],a=e[3];return{ew:Math.max(1,Math.round(Math.max(r(n,t),r(a,o)))),eh:Math.max(1,Math.round(Math.max(r(n,a),r(t,o))))}},ko=26,Go=15,or=[],dn=(e,r,n)=>{let t=0;for(let o=0;o<4;o++){let a=e[o],i=e[(o+1)%4],s=(i.x-a.x)*(n-a.y)-(i.y-a.y)*(r-a.x);if(Math.abs(s)<1e-9)continue;let l=s>0?1:-1;if(t===0)t=l;else if(l!==t)return!1}return!0},Kn=(e,r,n,t)=>{let o=Math.hypot(n[0]-H[0],n[1]-H[1],n[2]-H[2]),a=st(Tt,r,Te,Re,100,100);if(Fe(a))return{key:e,proj:a,ew:0,eh:0,distance:o,shown:!1,reason:a.refusal,widthPx:0,heightPx:0};let{ew:i,eh:s}=Co(a.screen),l=st(Tt,r,Te,Re,i,s),u=a.signedArea<=0,m=t??(u?"BACK_FACING":i<ko?"EDGE_ON":s<Go?"TOO_FLAT":a.screen.filter(c=>or.some(b=>dn(b,c.x,c.y))).length+or.reduce((c,b)=>c+b.filter(E=>dn(a.screen.map(f=>({x:f.x,y:f.y})),E.x,E.y)).length,0)>=2?"OCCLUDED":null),d=m===null&&!Fe(l);return d&&or.push(a.screen.map(c=>({x:c.x,y:c.y}))),{key:e,proj:l,ew:i,eh:s,distance:o,shown:d,reason:m,widthPx:i,heightPx:s}},Tr=C.map((e,r)=>{let n=Ot(Y(r),D(0)+.04,k+.02,Be,.15,Math.atan2(H[0]-Y(r),H[2]-D(0)),.01);return{...Kn(`ch:${e}`,n,[Y(r),k+.09,D(0)+.04],null),name:e,total:Number(te[r].reduce((t,o,a)=>t+(U(a)==="OBSERVED"?o.reduce((i,s)=>i+s,0):0),0).toFixed(2))}}),Rr=Array.from({length:_},(e,r)=>r).map(e=>{let r=U(e),n=D(e)-($-se)/2,t=n-se,o=k+.004,a={topLeft:[he-j/2,o,t],topRight:[he+j/2,o,t],bottomRight:[he+j/2,o,n],bottomLeft:[he-j/2,o,n]},i=r==="ABSENT"?"DAY_NOT_MEASURED":null;return{...Kn(`day:${e}`,a,[he,o,et(e)],i),day:e,state:r}}).sort((e,r)=>e.distance-r.distance),mn=e=>e.filter(r=>!r.shown).reduce((r,n)=>{let t=n.reason??"UNKNOWN";return r[t]=(r[t]??0)+1,r},{});for(let e of[...Tr].sort((r,n)=>n.distance-r.distance)){if(!e.shown||Fe(e.proj))continue;let r=document.createElement("div");r.style.cssText=`position:absolute;left:0;top:0;width:${e.ew}px;height:${e.eh}px;transform-origin:0 0;transform:${e.proj.transform};display:flex;align-items:center;justify-content:center;overflow:hidden;-webkit-font-smoothing:antialiased`;let n=document.createElement("div");n.style.cssText="font:600 9.5px/1 ui-monospace,monospace;letter-spacing:.08em;color:rgba(220,232,255,0.92);white-space:nowrap",n.textContent=e.name,r.appendChild(n),fe.appendChild(r)}for(let e of[...Rr].sort((r,n)=>n.distance-r.distance)){if(!e.shown||Fe(e.proj))continue;let r=document.createElement("div");r.style.cssText=`position:absolute;left:0;top:0;width:${e.ew}px;height:${e.eh}px;transform-origin:0 0;transform:${e.proj.transform};display:flex;align-items:center;justify-content:center;overflow:hidden;-webkit-font-smoothing:antialiased`;let n=e.state==="WITHHELD"?"WITHHELD":`D${e.day}`,t=e.state==="WITHHELD"?"#B7C2D8":"rgba(200,216,244,0.88)",o=document.createElement("div");o.style.cssText=`font:600 10px/1 ui-monospace,monospace;letter-spacing:.06em;color:${t};white-space:nowrap`,o.textContent=n,r.appendChild(o),fe.appendChild(r)}var Ir=(e,r,n,t)=>{let o=Se(Tt,e,Te,Re),a=!o.behind&&o.sx>-60&&o.sx<Te+60&&o.sy>0&&o.sy<Re;if(a){let i=document.createElement("div");i.style.cssText=`position:absolute;left:${o.sx.toFixed(1)}px;top:${o.sy.toFixed(1)}px;transform:translate(-50%,-50%);font:600 9.5px/1 ui-monospace,monospace;letter-spacing:.1em;color:${n};border:1px solid ${t};padding:3px 6px;white-space:nowrap;background:rgba(6,10,18,0.72)`,i.textContent=r,fe.appendChild(i)}return{onFrame:a,sx:Math.round(o.sx),sy:Math.round(o.sy)}},Cr=V+.34,Ho=Ir([Cr,k+.22,et((Math.min(...X)+Math.max(...X))/2)],`D${Math.min(...X)}-D${Math.max(...X)} NOT MEASURED`,"#E0A94A","rgba(224,169,74,0.55)"),Vo=Ir([Cr,k+.22,et(lr+.5)],`D${lr}-D${Math.max(...Je)} WITHHELD`,"#B7C2D8","rgba(183,194,216,0.5)"),Wo=J>=0?Ir([Cr,k+.22,D(J)],`REVIEW THRESHOLD ${Mr} \xB7 D${J}`,"#9EC4FF","rgba(158,196,255,0.5)"):{onFrame:!1,sx:0,sy:0},ar=Ur.map(e=>{let r=e-1<=_r,n=[Dr-.1,k+.02,D(e)],t=Se(Tt,n,Te,Re),o=!t.behind&&t.sx>-40&&t.sx<Te&&t.sy>0&&t.sy<Re;if(o){let a=document.createElement("div");a.style.cssText=`position:absolute;left:16px;top:${t.sy.toFixed(1)}px;transform:translate(0,-50%);font:500 10px/1.35 ui-monospace,monospace;letter-spacing:.07em;white-space:nowrap;color:${r?"rgba(196,212,240,0.85)":"#E0A94A"}`;let i=document.createElement("div");if(i.textContent=`D${e}`,a.appendChild(i),!r){let s=document.createElement("div");s.textContent="NO INTEGRAL",a.appendChild(s)}fe.appendChild(a)}return{day:e,readable:r,onFrame:o,sx:Math.round(t.sx),sy:Math.round(t.sy)}}),kr=document.createElement("div");kr.style.cssText="position:absolute;left:18px;top:16px;display:flex;flex-direction:column;gap:7px";kr.innerHTML=`<div style="font:600 11px/1 ui-monospace,monospace;letter-spacing:.16em;color:#8FB7FF">MARKETING RISK \xB7 DEPTH IS DAYS AHEAD</div><div style="font:400 10.5px/1.55 ui-monospace,monospace;color:rgba(196,212,240,0.86)">THE DEPTH OF COLOUR IS THE TOTAL RISK BETWEEN YOU AND THAT DAY<br>${$} m PER DAY &nbsp;\xB7&nbsp; ${rt} OPTICAL DEPTH PER RISK UNIT<br>A PIXEL INTEGRATES ~${$e(Br).toFixed(0)} DAYS AND ~${$e(Or).toFixed(1)} BANDS \u2014 ONE CHANNEL ONLY DOWN THE AXIS<br>INTEGRABLE TO D${_r} &nbsp;\xB7&nbsp; CALENDAR VISIBLE TO D${_-1}${Pe?"":" &nbsp;\xB7&nbsp; FIELD NOT RENDERED"}</div><div style="font:500 10px/1.45 ui-monospace,monospace;color:#E0A94A">SYNTHETIC RISK DATA \xB7 ${Ze.length} HAND-AUTHORED FLAGGED ITEMS${br?`<br>VOLUME REFUSED \xB7 ${br.split(" \u2014 ")[0]}`:""}${Sr?"":"<br>SCENE DEPTH OFF \u2014 THE FIELD IS PAINTED OVER THE GEOMETRY"}</div>`;fe.appendChild(kr);var Et={OBSERVED:Array.from({length:_},(e,r)=>r).filter(e=>U(e)==="OBSERVED").length,ABSENT:X.length,WITHHELD:Je.length},Gr=document.createElement("div");Gr.style.cssText="position:absolute;right:18px;bottom:16px;display:flex;flex-direction:column;gap:6px;align-items:flex-end;font:500 10.5px/1 ui-monospace,monospace";Gr.innerHTML=`<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;color:rgba(196,212,240,0.85)"><span>RISK IN THAT CELL \u2014 LOW TO HIGH</span><span style="width:132px;height:9px;display:inline-block;background:linear-gradient(90deg,#2C6BFF,#FF8A3D);border:1px solid rgba(196,212,240,0.4)"></span></div><div style="color:rgba(196,212,240,0.85);text-align:right">SEVERITY IS HEIGHT<br><span style="opacity:.8">${[...Ue].reverse().join(" / ")}</span></div>`+[["#101B2F",`OBSERVED \xB7 ${Et.OBSERVED} days`],["transparent",`NOT MEASURED \xB7 ${Et.ABSENT} days \u2014 hole in the floor`],["#6B7A99",`WITHHELD \xB7 ${Et.WITHHELD} days \u2014 lid, measured, not shown`]].map(([e,r])=>`<div style="display:flex;align-items:center;gap:7px;color:rgba(196,212,240,0.85)"><span>${r}</span><span style="width:11px;height:11px;background:${e};border:1px solid rgba(196,212,240,0.45);display:inline-block;forced-color-adjust:none"></span></div>`).join("");fe.appendChild(Gr);var qn=(()=>{let e=h.getExtension("WEBGL_debug_renderer_info");return e?String(h.getParameter(e.UNMASKED_RENDERER_WEBGL)):"unknown"})(),ir=/swiftshader|llvmpipe|software/i.test(qn),Ar=Bt();if(Ar.length>0){let e="BRAND FIDELITY FAILED \u2014 "+Ar.map(r=>`${r.key}: expected ${r.expected}, got ${r.actual}`).join("; ");throw document.title="REFUSED",Fr.textContent=e,new Error(e)}var fn=e=>{let r=z(be(e,H));return Number((Math.acos(Math.max(-1,Math.min(1,r[0]*ee[0]+r[1]*ee[1]+r[2]*ee[2])))*180/Math.PI).toFixed(2))},Zn={paramClamps:bn,tier:Le.tier,tierDprScale:Le.dprScale,tierVolumeLightSteps:Le.volumeLightSteps,tierShadowMapSize:ct(vr,1536),shadowBaseline:1536,brandFidelity:Ar,volume:pn,volumeRefusal:br,sceneDepth:Sr,ao:ur,hdr:w.hdr,eye:H.map(e=>Number(e.toFixed(2))),integrableToDay:_r,visibleToDay:_-1,metresPerDay:$,calendarLengthM:xo,riskToTau:rt,reviewThreshold:Mr,frontDay:J,frontRefusal:bt,totalObservedRisk:Number(Ce.toFixed(3)),days:Et,absentDays:X,withheldDays:Je,absentRenderedAs:"FLOOR_HOLE_PLUS_EDGE_RAILS",withheldRenderedAs:"STEEL_LID_ON_INTACT_TILE",observedRenderedAs:"TILE_PLUS_VOLUMETRIC_MASS",readingStates:Array.from({length:_},(e,r)=>r).reduce((e,r)=>{let n=wr(r);return e[n]=(e[n]??0)+1,e},{}),flaggedItems:Ze.length,flaggedLostToNonObservedDays:yn.length,gridSize:[de,me,ge],gridVoxels:Ee.length,fieldMin:Number(dr.toFixed(5)),fieldMax:Number(mr.toFixed(5)),fieldMean:Number((Fn/Ee.length).toFixed(6)),fieldNonZeroVoxels:fr,fieldOccupancyPct:Number((100*fr/Ee.length).toFixed(2)),densityScale:Number(Nr.toFixed(4)),maxCell:Number(je.toFixed(3)),rampSaturatesAtRiskUnits:Number(Xn.toFixed(3)),cellsAboveRampSaturation:Do,worldStep:ke,maxSteps:Ge,marchReachM:Number((ke*Ge).toFixed(2)),boxDiagonalM:Number(Math.hypot(P[0]-M[0],P[1]-M[1],P[2]-M[2]).toFixed(2)),longestRayPlan:lt(Math.hypot(P[0]-M[0],P[1]-M[1],P[2]-M[2]),ke,Ge),eyeRays:{sweep:`${We}x${Xe}`,total:We*Xe,hitBox:ze,missedBox:We*Xe-ze,geometryCapped:$n,truncated:jn,tauMin:Number(Ke.toFixed(4)),tauMax:Number(gt.toFixed(4)),tauMean:Number((Yn/Math.max(1,ze)).toFixed(4)),alphaMax:Number((1-Math.exp(-gt)).toFixed(3))},axialCheck:{rays:ce.length,maxErrorPct:Bo,meanErrorPct:Oo,truncated:ce.filter(e=>e.truncated).length},eyeRayLaneDriftMax:Number(xr.toFixed(2)),eyeRayLaneDriftMean:$e(Qn),eyeRayDaysSpannedMax:Number(yr.toFixed(2)),eyeRayDaysSpannedMean:$e(Br),eyeRayBandsSpannedMax:Number(gr.toFixed(2)),eyeRayBandsSpannedMean:$e(Or),glOcclusionPixels:ft.pixels,glOcclusionPct:ft.pct,glOcclusionMeanDelta:ft.meanDelta,glOcclusionMaxDelta:ft.maxDelta,halfFovDeg:Number(((ue.fovDeg??36)/2).toFixed(2)),nearEdgeOffAxisDeg:fn([yt,0,D(0)]),farEdgeOffAxisDeg:fn([yt,0,D(_)]),channelLabels:{shown:Tr.filter(e=>e.shown).length,refusedBy:mn(Tr)},dateLabels:{shown:Rr.filter(e=>e.shown).length,refusedBy:mn(Rr)},weekTicksOffFrame:ar.filter(e=>!e.onFrame).length,weekBarsSuppressedForAbsence:Ur.length-Wn.length,weekTicksRefusingIntegral:ar.filter(e=>!e.readable).length,markersOnFrame:{absent:Ho.onFrame,withheld:Vo.onFrame,gate:Wo.onFrame},triangles:Mo,tilesDrawn:Hn,tilesOmittedForAbsence:Vn,solids:Pr.length,shadowMap:cr.size,resolution:`${O}x${I}`,dprScale:qe,frames:En,msPerFrame:Number(nr.toFixed(3)),fps:Math.round(1e3/nr),glError:h.getError(),renderer:qn,rendererClass:ir?"software":"hardware",headroom:ir?null:Number((16.6-nr).toFixed(3)),headroomRefusal:ir?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null,hardwareMsPerFrame:null,axialRays:ce,cumulativeByDay:xt.map(e=>Number(e.toFixed(2))),weekTicks:ar};globalThis.E7=Zn;var{axialRays:ai,cumulativeByDay:ii,weekTicks:si,...Xo}=Zn;Fr.textContent=JSON.stringify(Xo,null,2)+`

axialCheck per (channel, band) \u2014 ${ce.length} rays, full detail on globalThis.E7:
`+ce.map(e=>`  ${e.channel.padEnd(12)} b${e.band} expected ${String(e.expected).padStart(7)} measured ${String(e.measured).padStart(7)} err ${String(e.errorPct).padStart(5)}%`).join(`
`);Qe();gn.markRendered();document.title="READY";

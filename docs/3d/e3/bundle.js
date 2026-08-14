var vn={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected.",FEEDBACK_LOOP:"A layer of this view was asked to read the surface it draws into, which every driver refuses, so the layer is not being drawn. This is a defect in the renderer, not in the data."};function P(e,r){return r===void 0?{kind:"refused",code:e,reason:vn[e]}:{kind:"refused",code:e,reason:vn[e],detail:r}}var no=3,ro=24e5;function st(e){return e.kind==="stage"}function it(e,r={}){let t=e.getContext("webgl2",{antialias:r.antialias??!1,alpha:r.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!t)return P("NO_WEBGL2");let n=t.getExtension("EXT_color_buffer_float"),o=e.width,a=e.height,s=n?t.RGBA16F:t.RGBA8,l=n?t.HALF_FLOAT:t.UNSIGNED_BYTE,i=(h,y)=>{let v=t.createTexture();t.bindTexture(t.TEXTURE_2D,v),t.texImage2D(t.TEXTURE_2D,0,s,h,y,0,t.RGBA,l,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);let S=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,S),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,v,0);let R=t.checkFramebufferStatus(t.FRAMEBUFFER);return R!==t.FRAMEBUFFER_COMPLETE?P("FRAMEBUFFER_INCOMPLETE",`status 0x${R.toString(16)} at ${h}\xD7${y}`):{texture:v,framebuffer:S,width:h,height:y}},u=r.bloomShift??2,c={w:o,h:a},d=(h,y)=>({scene:i(h,y),bloomA:i(Math.max(1,h>>u),Math.max(1,y>>u)),bloomB:i(Math.max(1,h>>u),Math.max(1,y>>u)),texels:h*y}),f=h=>{for(let y of[h.scene,h.bloomA,h.bloomB])"kind"in y||(t.deleteFramebuffer(y.framebuffer),t.deleteTexture(y.texture))},p=new Map,b=`${o}x${a}`,m=d(o,a);for(let h of[m.scene,m.bloomA,m.bloomB])if("kind"in h)return f(m),h;p.set(b,m);let E=()=>{let h=p.size-1,y=0;for(let[v,S]of p)v!==b&&(y+=S.texels);for(let[v,S]of p){if(h<=no&&y<=ro)return;v!==b&&(p.delete(v),f(S),h-=1,y-=S.texels)}},x=t.createVertexArray();t.bindVertexArray(x);let A=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,A),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null);let F=[];return{kind:"stage",gl:t,cssWidth:e.clientWidth||o,cssHeight:e.clientHeight||a,hdr:!!n,get width(){return c.w},get height(){return c.h},get scene(){return m.scene},get bloomA(){return m.bloomA},get bloomB(){return m.bloomB},setRegion(h,y){let v=Math.max(1,Math.round(h)),S=Math.max(1,Math.round(y));if(v===c.w&&S===c.h)return;c={w:v,h:S};let R=`${v}x${S}`,M=p.get(R);if(M){p.delete(R),p.set(R,M),m=M,b=R;return}m=d(v,S),b=R,p.set(R,m),E()},compile(h,y){let v=(L,Q)=>{let G=t.createShader(L);if(t.shaderSource(G,Q),t.compileShader(G),!t.getShaderParameter(G,t.COMPILE_STATUS)){let be=t.getShaderInfoLog(G)??"(no log)";return t.deleteShader(G),P("SHADER_COMPILE_FAILED",be)}return G},S=v(t.VERTEX_SHADER,h);if(typeof S=="object"&&"kind"in S)return S;let R=v(t.FRAGMENT_SHADER,y);if(typeof R=="object"&&"kind"in R)return t.deleteShader(S),R;let M=t.createProgram();if(t.attachShader(M,S),t.attachShader(M,R),t.linkProgram(M),!t.getProgramParameter(M,t.LINK_STATUS)){let L=t.getProgramInfoLog(M)??"(no log)";return t.deleteShader(S),t.deleteShader(R),t.deleteProgram(M),P("PROGRAM_LINK_FAILED",L)}return t.detachShader(M,S),t.detachShader(M,R),t.deleteShader(S),t.deleteShader(R),F.push(M),M},bindTarget(h){t.bindFramebuffer(t.FRAMEBUFFER,h?h.framebuffer:null),t.viewport(0,0,h?h.width:c.w,h?h.height:c.h)},blit(h,y){t.useProgram(h),t.bindVertexArray(x),y?.(h),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null)},dispose(){for(let y of F)t.deleteProgram(y);for(let y of p.values())f(y);if(p.clear(),t.deleteBuffer(A),t.deleteVertexArray(x),e.isConnected)return;let h=t.getExtension("WEBGL_lose_context");h!==null&&typeof h.loseContext=="function"&&h.loseContext()}}}var ve=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function Oe(e,r){let t=new Float32Array(16);for(let n=0;n<4;n++)for(let o=0;o<4;o++){let a=0;for(let s=0;s<4;s++)a+=e[s*4+o]*r[n*4+s];t[n*4+o]=a}return t}var ke=(e,r)=>[e[0]-r[0],e[1]-r[1],e[2]-r[2]],Ie=(e,r)=>e[0]*r[0]+e[1]*r[1]+e[2]*r[2],lt=(e,r)=>[e[1]*r[2]-e[2]*r[1],e[2]*r[0]-e[0]*r[2],e[0]*r[1]-e[1]*r[0]];function Se(e){let r=Math.hypot(e[0],e[1],e[2]);return r===0?e:[e[0]/r,e[1]/r,e[2]/r]}function ut(e,r,t,n){let o=1/Math.tan(e/2);return new Float32Array([o/r,0,0,0,0,o,0,0,0,0,(n+t)/(t-n),-1,0,0,2*n*t/(t-n),0])}function ct(e,r,t,n,o,a){let s=r-e,l=n-t,i=a-o;return new Float32Array([2/s,0,0,0,0,2/l,0,0,0,0,-2/i,0,-(r+e)/s,-(n+t)/l,-(a+o)/i,1])}function Ge(e,r,t){let n=Se(ke(e,r)),o=lt(t,n);if(Math.hypot(o[0],o[1],o[2])<1e-8)return ve();let a=Se(o),s=lt(n,a);return new Float32Array([a[0],s[0],n[0],0,a[1],s[1],n[1],0,a[2],s[2],n[2],0,-Ie(a,e),-Ie(s,e),-Ie(n,e),1])}function Rn(e,r){let t=[0,1,2,3].map(o=>e[0+o]*r[0]+e[4+o]*r[1]+e[8+o]*r[2]+e[12+o]),n=t[3];return{x:t[0]/n,y:t[1]/n,z:t[2]/n,w:n}}function B(e,r,t,n){let o=Rn(e,r);return{sx:(o.x*.5+.5)*t,sy:(1-(o.y*.5+.5))*n,behind:o.w<=0}}var Fn=`#version 300 es
precision highp float;
layout(location=0) in vec3 p;
uniform mat4 uMVP;
out float vY;
void main(){ vY = p.y; gl_Position = uMVP * vec4(p, 1.0); }`,Mn=`#version 300 es
precision highp float;
in float vY;
uniform vec3 uColour;
uniform float uGain, uFade, uFadeFrom, uFadeTo;
out vec4 frag;
void main(){
  float t = clamp((vY - uFadeFrom) / max(uFadeTo - uFadeFrom, 1e-4), 0.0, 1.0);
  frag = vec4(uColour * uGain * (1.0 - uFade * t), 1.0);
}`;function dt(e){let{gl:r}=e,t=e.compile(Fn,Mn);if("kind"in t)return t;let n=r.createVertexArray();r.bindVertexArray(n);let o=r.createBuffer();r.bindBuffer(r.ARRAY_BUFFER,o),r.enableVertexAttribArray(0),r.vertexAttribPointer(0,3,r.FLOAT,!1,0,0),r.bindVertexArray(null);let a=u=>r.getUniformLocation(t,u),s={mvp:a("uMVP"),colour:a("uColour"),gain:a("uGain"),fade:a("uFade"),fadeFrom:a("uFadeFrom"),fadeTo:a("uFadeTo")},l=(u,c,d)=>{r.useProgram(t),r.bindVertexArray(n),r.bindBuffer(r.ARRAY_BUFFER,o),r.bufferData(r.ARRAY_BUFFER,c,r.STREAM_DRAW),r.uniformMatrix4fv(s.mvp,!1,u),r.uniform3fv(s.colour,d.colour),r.uniform1f(s.gain,d.gain),r.uniform1f(s.fade,d.fade??0),r.uniform1f(s.fadeFrom,d.fadeFrom??0),r.uniform1f(s.fadeTo,d.fadeTo??1),r.drawArrays(r.TRIANGLE_STRIP,0,c.length/3),r.bindVertexArray(null)},i=(u,c,d,f,p,b,m,E)=>{let x=f-c,A=p-d,F=Math.hypot(x,A)||1,g=-A/F*m,h=x/F*m;l(u,new Float32Array([c-g,d-h,b,c+g,d+h,b,f-g,p-h,b,f+g,p+h,b]),E)};return{rule(u,c,d,f,p,b,m){i(u,c,d,f,p,0,b,m)},ruleAtDepth(u,c,d,f,p,b,m,E){i(u,c,d,f,p,b,m,E)},curve(u,c,d,f){let p=c.length/2,b=new Float32Array(p*6);for(let m=0;m<p;m++){let E=c[m*2],x=c[m*2+1];b[m*6+0]=E,b[m*6+1]=x-d,b[m*6+2]=0,b[m*6+3]=E,b[m*6+4]=x+d,b[m*6+5]=0}l(u,b,f)},dispose(){r.deleteBuffer(o),r.deleteVertexArray(n),r.deleteProgram(t)}}}function Ln(e){return e<=.04045?e/12.92:Math.pow((e+.055)/1.055,2.4)}function mt(e){return e<=.0031308?e*12.92:1.055*Math.pow(e,1/2.4)-.055}var oo=/^#?([0-9a-fA-F]{6})$/;function U(e){let r=oo.exec(e.trim());if(!r)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(e)}`);let t=r[1];return[0,2,4].map(n=>Ln(parseInt(t.slice(n,n+2),16)/255))}function ft(e){return`#${e.map(t=>{let n=mt(Math.min(1,Math.max(0,t)));return Math.round(n*255).toString(16).padStart(2,"0")}).join("")}`}var Ee={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},pt=Object.freeze(Object.fromEntries(Object.keys(Ee).map(e=>[e,U(Ee[e])])));function ht(e,r,t){let n=Math.min(1,Math.max(0,t));return[e[0]+(r[0]-e[0])*n,e[1]+(r[1]-e[1])*n,e[2]+(r[2]-e[2])*n]}var wn=.4;var bt=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${wn.toFixed(2)}); }`,Et=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function xt(){let e=[];for(let r of Object.keys(Ee)){let t=Ee[r].toLowerCase(),n=ft(pt[r]).toLowerCase();n!==t&&e.push({key:r,expected:t,actual:n})}return e}function ao(e){let r=[1/0,1/0,1/0],t=[-1/0,-1/0,-1/0];for(let n=0;n<e.length;n+=3)for(let o=0;o<3;o++){let a=e[n+o];a<r[o]&&(r[o]=a),a>t[o]&&(t[o]=a)}return e.length===0?{min:[0,0,0],max:[0,0,0]}:{min:r,max:t}}function _n(e,r,t,n){let o=new Float32Array(e.length);for(let s=0;s<n.length;s+=3){let l=n[s],i=n[s+1],u=n[s+2],c=l*3,d=i*3,f=u*3,p=l*2,b=i*2,m=u*2,E=e[d]-e[c],x=e[d+1]-e[c+1],A=e[d+2]-e[c+2],F=e[f]-e[c],g=e[f+1]-e[c+1],h=e[f+2]-e[c+2],y=t[b]-t[p],v=t[b+1]-t[p+1],S=t[m]-t[p],R=t[m+1]-t[p+1],M=y*R-S*v;if(Math.abs(M)<1e-12)continue;let L=1/M,Q=(E*R-F*v)*L,G=(x*R-g*v)*L,be=(A*R-h*v)*L;for(let ne of[c,d,f])o[ne]=o[ne]+Q,o[ne+1]=o[ne+1]+G,o[ne+2]=o[ne+2]+be}let a=new Float32Array(e.length);for(let s=0;s<a.length;s+=3){let l=r[s],i=r[s+1],u=r[s+2],c=o[s],d=o[s+1],f=o[s+2],p=c*l+d*i+f*u;c-=l*p,d-=i*p,f-=u*p;let b=Math.hypot(c,d,f);b<1e-8&&(Math.abs(l)<.9?(c=0,d=-u,f=i):(c=-u,d=0,f=l),b=Math.hypot(c,d,f)||1),a[s]=c/b,a[s+1]=d/b,a[s+2]=f/b}return a}function Dn(e,r){let t=new Float32Array(e.length);for(let n=0;n<r.length;n+=3){let o=r[n]*3,a=r[n+1]*3,s=r[n+2]*3,l=e[a]-e[o],i=e[a+1]-e[o+1],u=e[a+2]-e[o+2],c=e[s]-e[o],d=e[s+1]-e[o+1],f=e[s+2]-e[o+2],p=i*f-u*d,b=u*c-l*f,m=l*d-i*c;for(let E of[o,a,s])t[E]=t[E]+p,t[E+1]=t[E+1]+b,t[E+2]=t[E+2]+m}for(let n=0;n<t.length;n+=3){let o=Math.hypot(t[n],t[n+1],t[n+2]);o>0&&(t[n]=t[n]/o,t[n+1]=t[n+1]/o,t[n+2]=t[n+2]/o)}return t}function Ve(e,r,t,n,o){let{min:a,max:s}=ao(e),l=n??Dn(e,t);return{positions:e,normals:l,uvs:r,indices:t,min:a,max:s,tangents:o??_n(e,l,r,t)}}function xe(e=1,r=1,t=1){let n=e/2,o=r/2,a=t/2,s=[[[-n,-o,a],[n,-o,a],[n,o,a],[-n,o,a]],[[n,-o,-a],[-n,-o,-a],[-n,o,-a],[n,o,-a]],[[n,-o,a],[n,-o,-a],[n,o,-a],[n,o,a]],[[-n,-o,-a],[-n,-o,a],[-n,o,a],[-n,o,-a]],[[-n,o,a],[n,o,a],[n,o,-a],[-n,o,-a]],[[-n,-o,-a],[n,-o,-a],[n,-o,a],[-n,-o,a]]],l=new Float32Array(72),i=new Float32Array(48),u=new Uint16Array(36),c=0,d=0,f=0,p=0;for(let b of s){for(let[m,E,x]of b)l[c++]=m,l[c++]=E,l[c++]=x;i[d++]=0,i[d++]=0,i[d++]=1,i[d++]=0,i[d++]=1,i[d++]=1,i[d++]=0,i[d++]=1,u[f++]=p,u[f++]=p+1,u[f++]=p+2,u[f++]=p,u[f++]=p+2,u[f++]=p+3,p+=4}return Ve(l,i,u)}function yt(e=10,r=24){let t=Math.max(1,Math.floor(r)),n=(t+1)*(t+1),o=new Float32Array(n*3),a=new Float32Array(n*3),s=new Float32Array(n*2),l=new Uint16Array(t*t*6),i=0,u=0,c=0;for(let d=0;d<=t;d++)for(let f=0;f<=t;f++){let p=(f/t-.5)*e,b=(d/t-.5)*e;o[i]=p,o[i+1]=0,o[i+2]=b,a[i]=0,a[i+1]=1,a[i+2]=0,i+=3,s[u++]=f/t,s[u++]=d/t}for(let d=0;d<t;d++)for(let f=0;f<t;f++){let p=d*(t+1)+f,b=p+1,m=p+(t+1),E=m+1;l[c++]=p,l[c++]=m,l[c++]=b,l[c++]=b,l[c++]=m,l[c++]=E}return Ve(o,s,l,a)}function gt(e=.5,r=24,t=32){let n=Math.max(2,r),o=Math.max(3,t),a=(n+1)*(o+1),s=new Float32Array(a*3),l=new Float32Array(a*3),i=new Float32Array(a*2),u=new Uint16Array(n*o*6),c=0,d=0,f=0;for(let p=0;p<=n;p++){let b=p/n*Math.PI;for(let m=0;m<=o;m++){let E=m/o*Math.PI*2,x=Math.sin(b)*Math.cos(E),A=Math.cos(b),F=Math.sin(b)*Math.sin(E);s[c]=x*e,s[c+1]=A*e,s[c+2]=F*e,l[c]=x,l[c+1]=A,l[c+2]=F,c+=3,i[d++]=m/o,i[d++]=p/n}}for(let p=0;p<n;p++)for(let b=0;b<o;b++){let m=p*(o+1)+b,E=m+1,x=m+(o+1),A=x+1;u[f++]=m,u[f++]=E,u[f++]=x,u[f++]=E,u[f++]=A,u[f++]=x}return Ve(s,i,u,l)}function Tt(e=.5,r=.08,t=64,n=24){let o=Math.max(3,t),a=Math.max(3,n),s=[],l=[],i=[],u=[],c=[];for(let d=0;d<=o;d++){let f=d/o*Math.PI*2,p=Math.cos(f),b=Math.sin(f);for(let m=0;m<=a;m++){let E=m/a*Math.PI*2,x=Math.cos(E),A=Math.sin(E);s.push((e+r*x)*p,r*A,(e+r*x)*b),l.push(p*x,A,b*x),i.push(d/o,m/a),c.push(-b,0,p)}}for(let d=0;d<o;d++)for(let f=0;f<a;f++){let p=d*(a+1)+f,b=p+1,m=p+(a+1),E=m+1;u.push(p,b,m,b,E,m)}return Ve(new Float32Array(s),new Float32Array(i),new Uint16Array(u),new Float32Array(l),new Float32Array(c))}function K(e){return e.indices.length/3}function so(e){if(!Number.isFinite(e)||e===0)return"0";let r=e.toFixed(12).replace(/0+$/,"").replace(/\.$/,"");return r==="-0"?"0":r}function Pn(e,r,t,n){let[o,a]=e,[s,l]=r,[i,u]=t,[c,d]=n,f=o-s+i-c,p=a-l+u-d;if(Math.abs(f)<1e-9&&Math.abs(p)<1e-9){let h=[s-o,c-o,o,l-a,d-a,a,0,0,1],y=h[0]*h[4]-h[1]*h[3];return Math.abs(y)<1e-9?null:h}let b=s-i,m=c-i,E=l-u,x=d-u,A=b*x-m*E;if(Math.abs(A)<1e-9)return null;let F=(f*x-m*p)/A,g=(b*p-f*E)/A;return[s-o+F*s,c-o+g*c,o,l-a+F*l,d-a+g*d,a,F,g,1]}function At(e,r,t,n,o,a){if(!(o>0)||!(a>0))return{refusal:"EMPTY_ELEMENT_BOX"};let l=[r.topLeft,r.topRight,r.bottomRight,r.bottomLeft].map(L=>B(e,L,t,n));if(l.some(L=>L.behind))return{refusal:"CORNER_BEHIND_CAMERA"};let i=l.map(L=>({x:L.sx,y:L.sy})),[u,c,d,f]=i,p=Pn([u.x,u.y],[c.x,c.y],[d.x,d.y],[f.x,f.y]);if(!p)return{refusal:"DEGENERATE_ON_SCREEN"};let b=.5*(u.x*c.y-c.x*u.y+(c.x*d.y-d.x*c.y)+(d.x*f.y-f.x*d.y)+(f.x*u.y-u.x*f.y)),m=1/o,E=1/a,[x,A,F,g,h,y,v,S,R]=p;return{transform:`matrix3d(${[x*m,g*m,0,v*m,A*E,h*E,0,S*E,0,0,1,0,F,y,0,R].map(so).join(", ")})`,matrix:p,screen:i,signedArea:b}}function q(e){return"refusal"in e}function St(e,r,t,n,o,a,s=0){let l=Math.cos(a),i=Math.sin(a),u=(d,f)=>[e+l*d+i*s,t+f,r-i*d+l*s],c=n/2;return{topLeft:u(-c,o),topRight:u(c,o),bottomRight:u(c,0),bottomLeft:u(-c,0)}}var Un=e=>[e.DEPTH_TEST,e.CULL_FACE,e.BLEND];function Z(e){return[e.getParameter(e.FRAMEBUFFER_BINDING),e.getParameter(e.VIEWPORT),e.getParameter(e.DEPTH_WRITEMASK),Un(e).map(r=>e.getParameter(r))]}function W(e,r){e.bindFramebuffer(e.FRAMEBUFFER,r[0]);let t=r[1];e.viewport(t[0]??0,t[1]??0,t[2]??0,t[3]??0),e.depthMask(r[2]),Un(e).forEach((n,o)=>{r[3][o]?e.enable(n):e.disable(n)})}function ue(e,r){for(let t=r-1;t>=0;t--)e.activeTexture(e.TEXTURE0+t),e.bindTexture(e.TEXTURE_2D,null),e.bindTexture(e.TEXTURE_3D,null);e.activeTexture(e.TEXTURE0)}function Nn(e){let r=Number.isFinite(e)?Math.max(1,Math.floor(e)):1,t=Math.max(1,2**Math.ceil(Math.log2(Math.ceil(Math.sqrt(r))))),n=Math.max(1,2**Math.ceil(Math.log2(Math.ceil(r/t))));return{width:t,height:n,slots:t*n}}function Cn(e,r,t){let n=[],o=[];for(let a=0;a<e.length;a++){let s=Math.max(0,e[a].rate),l=Math.max(0,Math.min(.1,r)),i=s*l+(t[a]??0),u=Math.floor(i);n.push(u),o.push(i-u)}return{counts:n,carry:o}}var Bn=`
float lcxHash(vec3 p){
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float lcxNoise(vec3 p){
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(lcxHash(i + vec3(0,0,0)), lcxHash(i + vec3(1,0,0)), u.x),
        mix(lcxHash(i + vec3(0,1,0)), lcxHash(i + vec3(1,1,0)), u.x), u.y),
    mix(mix(lcxHash(i + vec3(0,0,1)), lcxHash(i + vec3(1,0,1)), u.x),
        mix(lcxHash(i + vec3(0,1,1)), lcxHash(i + vec3(1,1,1)), u.x), u.y), u.z);
}
vec3 lcxPotential(vec3 p){
  return vec3(
    lcxNoise(p + vec3(0.0, 0.0, 0.0)),
    lcxNoise(p + vec3(31.416, 7.13, 19.7)),
    lcxNoise(p + vec3(-13.9, 41.2, -5.31))
  );
}
vec3 lcxCurl(vec3 p, float e){
  vec3 dx = vec3(e, 0.0, 0.0), dy = vec3(0.0, e, 0.0), dz = vec3(0.0, 0.0, e);
  vec3 px1 = lcxPotential(p + dx), px0 = lcxPotential(p - dx);
  vec3 py1 = lcxPotential(p + dy), py0 = lcxPotential(p - dy);
  vec3 pz1 = lcxPotential(p + dz), pz0 = lcxPotential(p - dz);
  float inv = 1.0 / (2.0 * e);
  return vec3(
    ((py1.z - py0.z) - (pz1.y - pz0.y)) * inv,
    ((pz1.x - pz0.x) - (px1.z - px0.z)) * inv,
    ((px1.y - px0.y) - (py1.x - py0.x)) * inv
  );
}
`,io=`#version 300 es
precision highp float;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,lo=`#version 300 es
precision highp float;
uniform sampler2D uState;     // xyz = position, w = age in seconds
uniform sampler2D uVel;       // xyz = velocity, w = source index
uniform vec2 uSize;
uniform float uDt;
uniform float uTime;
uniform float uNoiseScale;
uniform float uNoiseStrength;
uniform float uDrag;
uniform vec3 uGravity;
uniform int uEmitCount;
uniform vec4 uEmitRange[8];   // x = first slot, y = last slot, z = source index, w = life
uniform vec4 uEmitPos[8];     // xyz = position, w = spread
uniform vec4 uEmitVel[8];     // xyz = velocity, w unused
uniform float uLifes[8];      // seconds, per SOURCE, uploaded every step
layout(location = 0) out vec4 outState;
layout(location = 1) out vec4 outVel;
${Bn}
void main(){
  ivec2 texel = ivec2(gl_FragCoord.xy);
  int slot = texel.y * int(uSize.x) + texel.x;
  vec4 st = texture(uState, gl_FragCoord.xy / uSize);
  vec4 vl = texture(uVel, gl_FragCoord.xy / uSize);

  bool reborn = false;
  for (int i = 0; i < 8; i++) {
    if (i >= uEmitCount) break;
    if (float(slot) >= uEmitRange[i].x && float(slot) <= uEmitRange[i].y) {
      float h1 = lcxHash(vec3(float(slot), uTime, 1.0));
      float h2 = lcxHash(vec3(float(slot), uTime, 2.0));
      float h3 = lcxHash(vec3(float(slot), uTime, 3.0));
      vec3 jitter = (vec3(h1, h2, h3) - 0.5) * 2.0 * uEmitPos[i].w;
      st = vec4(uEmitPos[i].xyz + jitter, 0.0);
      vl = vec4(uEmitVel[i].xyz, uEmitRange[i].z);
      reborn = true;
    }
  }

  if (!reborn && st.w < 0.0) { outState = st; outVel = vl; return; }

  int src = clamp(int(vl.w + 0.5), 0, 7);
  float life = max(0.0001, uLifes[src]);

  vec3 flow = lcxCurl(st.xyz * uNoiseScale + vec3(0.0, uTime * 0.15, 0.0), 0.35) * uNoiseStrength;
  vec3 vel = vl.xyz + (flow + uGravity) * uDt;
  vel *= max(0.0, 1.0 - uDrag * uDt);
  vec3 pos = st.xyz + vel * uDt;
  float age = st.w + uDt;

  if (!reborn && age > life) { outState = vec4(st.xyz, -1.0); outVel = vec4(0.0, 0.0, 0.0, vl.w); return; }

  outState = vec4(pos, age);
  outVel = vec4(vel, vl.w);
}`,uo=`#version 300 es
precision highp float;
uniform sampler2D uState;
uniform sampler2D uVel;
uniform vec2 uSize;
uniform mat4 uViewProj;
uniform float uPointScale;
uniform vec3 uColours[8];
uniform float uLifes[8];
out vec3 vColour;
out float vFade;
void main(){
  int slot = gl_VertexID;
  ivec2 texel = ivec2(slot % int(uSize.x), slot / int(uSize.x));
  vec4 st = texelFetch(uState, texel, 0);
  vec4 vl = texelFetch(uVel, texel, 0);

  if (st.w < 0.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); gl_PointSize = 0.0; vFade = 0.0; vColour = vec3(0.0); return; }

  int src = int(vl.w + 0.5);
  vColour = uColours[src];
  float life = max(0.0001, uLifes[src]);
  float t = clamp(st.w / life, 0.0, 1.0);
  vFade = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.55, 1.0, t));

  vec4 clip = uViewProj * vec4(st.xyz, 1.0);
  gl_Position = clip;
  gl_PointSize = clamp(uPointScale / max(0.25, clip.w), 1.0, 64.0);
}`,co=`#version 300 es
precision highp float;
in vec3 vColour;
in float vFade;
out vec4 frag;
void main(){
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;
  float a = (1.0 - r2) * (1.0 - r2);
  frag = vec4(vColour * (a * vFade), a * vFade);
}`;function vt(e,r){let t=e.gl,{width:n,height:o,slots:a}=Nn(r);if(!t.getExtension("EXT_color_buffer_float"))return P("MISSING_EXTENSION","particle simulation needs EXT_color_buffer_float to write positions to a texture \u2014 without it the state textures never update and the field renders frozen");let s=e.compile(io,lo);if("kind"in s)return s;let l=e.compile(uo,co);if("kind"in l)return l;let i=h=>{let y=t.createTexture();return t.bindTexture(t.TEXTURE_2D,y),t.texImage2D(t.TEXTURE_2D,0,t.RGBA32F,n,o,0,t.RGBA,t.FLOAT,h),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),y},u=new Float32Array(a*4);for(let h=0;h<a;h++)u[h*4+3]=-1;let c=i(u),d=i(u),f=i(new Float32Array(a*4)),p=i(new Float32Array(a*4)),b=t.createFramebuffer(),m=t.createFramebuffer(),E=t.createVertexArray(),x=0,A=[],F=(h,y)=>(t.bindFramebuffer(t.FRAMEBUFFER,b),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,h,0),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT1,t.TEXTURE_2D,y,0),t.drawBuffers([t.COLOR_ATTACHMENT0,t.COLOR_ATTACHMENT1]),t.checkFramebufferStatus(t.FRAMEBUFFER)===t.FRAMEBUFFER_COMPLETE),g=(h,y)=>t.getUniformLocation(h,y);return{slots:a,width:n,height:o,step(h){let y=Z(t),v=h.sources.slice(0,8),S=Cn(v,h.dtSeconds,A);A=S.carry;let R=[],M=[],L=[],Q=0;for(let X=0;X<v.length&&Q<8;X++){let re=v[X],ot=Math.min(S.counts[X]??0,a);for(;ot>0&&Q<8;){let Be=x,at=Math.min(ot,a-Be);R.push(Be,Be+at-1,X,re.life),M.push(re.at[0],re.at[1],re.at[2],re.spread??0),L.push(re.velocity[0],re.velocity[1],re.velocity[2],0),x=(Be+at)%a,ot-=at,Q++}}if(!F(d,p)){W(t,y);return}t.viewport(0,0,n,o),t.disable(t.DEPTH_TEST),t.disable(t.BLEND),t.useProgram(s),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,c),t.uniform1i(g(s,"uState"),0),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,f),t.uniform1i(g(s,"uVel"),1),t.uniform2f(g(s,"uSize"),n,o),t.uniform1f(g(s,"uDt"),Math.max(0,Math.min(.1,h.dtSeconds))),t.uniform1f(g(s,"uTime"),performance.now()/1e3%3600),t.uniform1f(g(s,"uNoiseScale"),h.noiseScale??.35),t.uniform1f(g(s,"uNoiseStrength"),h.noiseStrength??.6),t.uniform1f(g(s,"uDrag"),h.drag??.4);let G=h.gravity??[0,0,0];t.uniform3f(g(s,"uGravity"),G[0],G[1],G[2]),t.uniform1i(g(s,"uEmitCount"),Q),Q>0&&(t.uniform4fv(g(s,"uEmitRange"),new Float32Array(R)),t.uniform4fv(g(s,"uEmitPos"),new Float32Array(M)),t.uniform4fv(g(s,"uEmitVel"),new Float32Array(L)));let be=new Float32Array(8);for(let X=0;X<8;X++)be[X]=v[X]?.life??1;t.uniform1fv(g(s,"uLifes"),be),t.bindVertexArray(E),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null);let ne=c;c=d,d=ne;let to=f;f=p,p=to,ue(t,2),W(t,y)},draw(h){let y=Z(t),v=h.sources.slice(0,8);t.useProgram(l),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,c),t.uniform1i(g(l,"uState"),0),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,f),t.uniform1i(g(l,"uVel"),1),t.uniform2f(g(l,"uSize"),n,o),t.uniformMatrix4fv(g(l,"uViewProj"),!1,h.viewProj),t.uniform1f(g(l,"uPointScale"),h.pointScale??28);let S=new Float32Array(24),R=new Float32Array(8);for(let M=0;M<8;M++){let L=v[M];S[M*3]=L?L.colour[0]:0,S[M*3+1]=L?L.colour[1]:0,S[M*3+2]=L?L.colour[2]:0,R[M]=L?L.life:1}t.uniform3fv(g(l,"uColours"),S),t.uniform1fv(g(l,"uLifes"),R),t.enable(t.BLEND),t.blendFunc(t.ONE,t.ONE),t.enable(t.DEPTH_TEST),t.depthMask(!1),t.bindVertexArray(E),t.drawArrays(t.POINTS,0,a),t.bindVertexArray(null),ue(t,2),W(t,y)},readState(){t.bindFramebuffer(t.FRAMEBUFFER,m),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,c,0);let h=new Float32Array(a*4);return t.checkFramebufferStatus(t.FRAMEBUFFER)===t.FRAMEBUFFER_COMPLETE&&t.readPixels(0,0,n,o,t.RGBA,t.FLOAT,h),t.bindFramebuffer(t.FRAMEBUFFER,null),h},dispose(){for(let h of[c,d,f,p])t.deleteTexture(h);t.deleteFramebuffer(b),t.deleteFramebuffer(m),t.deleteVertexArray(E),t.deleteProgram(s),t.deleteProgram(l)}}}var Ft=["minimum","reduced","full"],Rt={full:{dprScale:2,ao:!0,dof:!0,shadowMapSize:1536,shadowTaps:9,volumeLightSteps:6},reduced:{dprScale:2,ao:!0,dof:!1,shadowMapSize:1024,shadowTaps:9,volumeLightSteps:4},minimum:{dprScale:1,ao:!1,dof:!1,shadowMapSize:512,shadowTaps:1,volumeLightSteps:1}};function He(e,r){let t=Number.isFinite(r)&&r>0?r:1024,n=Rt[e].shadowMapSize/Rt.full.shadowMapSize,o=t*n,a=2**Math.round(Math.log2(o));return Math.max(256,Math.min(t,a))}function Mt(e){return{tier:e,...Rt[e]}}var Lt=89,wt=Math.PI/180;function ze(e){let r=Math.max(-Lt,Math.min(Lt,e.elevationDeg))*wt,t=e.azimuthDeg*wt,n=Math.max(1e-4,e.distance),o=Math.sin(r)*n,a=Math.cos(r)*n;return[e.target[0]+Math.sin(t)*a,e.target[1]+o,e.target[2]+Math.cos(t)*a]}function $e(e,r){let t=ze(e),n=e.near??Math.max(.01,e.distance/100),o=e.far??Math.max(n+1,e.distance*8),a=ut((e.fovDeg??38)*wt,Math.max(.001,r),n,o),s=Ge(t,e.target,[0,1,0]);return Oe(a,s)}function _t(e,r,t){let n=Se(e.direction),o=e.extent??Math.max(.1,t*1.35),a=Math.max(1,t*2),s=[r[0]-n[0]*a,r[1]-n[1]*a,r[2]-n[2]*a],l=Math.abs(n[1])>.99?[0,0,1]:[0,1,0],i=Ge(s,r,l),u=ct(-o,o,-o,o,.01,a+t*2+o);return Oe(u,i)}function Dt(e,r){let t=ke([r[0],r[1],r[2]],[e[0],e[1],e[2]]);return Math.hypot(t[0],t[1],t[2])/2}function Pt(e,r){return[(e[0]+r[0])/2,(e[1]+r[1])/2,(e[2]+r[2])/2]}function Ut(e,r,t){let{gl:n}=e,o=Math.max(1,Math.floor(r)),a=Math.max(1,Math.floor(t)),s=n.createFramebuffer(),l=n.createTexture(),i=n.createTexture();if(!s||!l||!i)return P("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let u=e.hdr?n.RGBA16F:n.RGBA8,c=e.hdr?n.HALF_FLOAT:n.UNSIGNED_BYTE,d=()=>{n.bindTexture(n.TEXTURE_2D,l),n.texImage2D(n.TEXTURE_2D,0,u,o,a,0,n.RGBA,c,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.bindTexture(n.TEXTURE_2D,i),n.texImage2D(n.TEXTURE_2D,0,n.DEPTH_COMPONENT24,o,a,0,n.DEPTH_COMPONENT,n.UNSIGNED_INT,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.bindFramebuffer(n.FRAMEBUFFER,s),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,l,0),n.framebufferTexture2D(n.FRAMEBUFFER,n.DEPTH_ATTACHMENT,n.TEXTURE_2D,i,0),n.bindFramebuffer(n.FRAMEBUFFER,null)};d(),n.bindFramebuffer(n.FRAMEBUFFER,s);let f=n.checkFramebufferStatus(n.FRAMEBUFFER);return n.bindFramebuffer(n.FRAMEBUFFER,null),f!==n.FRAMEBUFFER_COMPLETE?P("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${f.toString(16)}). Depth texture support may be missing.`):{framebuffer:s,texture:l,depthTexture:i,get width(){return o},get height(){return a},bind(){n.bindFramebuffer(n.FRAMEBUFFER,s),n.viewport(0,0,o,a)},resize(p,b){let m=Math.max(1,Math.floor(p)),E=Math.max(1,Math.floor(b));m===o&&E===a||(o=m,a=E,d())},dispose(){n.deleteFramebuffer(s),n.deleteTexture(l),n.deleteTexture(i)}}}function Nt(e,r=1024){let{gl:t}=e,n=Math.max(256,Math.min(2048,Math.floor(r))),o=t.createFramebuffer(),a=t.createTexture();if(!o||!a)return P("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");t.bindTexture(t.TEXTURE_2D,a),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,n,n,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,o),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,a,0);let s=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),s!==t.FRAMEBUFFER_COMPLETE?P("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${s.toString(16)}).`):{framebuffer:o,depthTexture:a,size:n,bind(){t.bindFramebuffer(t.FRAMEBUFFER,o),t.viewport(0,0,n,n)},dispose(){t.deleteFramebuffer(o),t.deleteTexture(a)}}}var Bt=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,Ct={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function In(e,r,t={}){let n=t.zenith??Ct.zenith,o=t.horizon??Ct.horizon,a=t.ground??Ct.ground;e.uniform3f(e.getUniformLocation(r,"uSkyZenith"),n[0],n[1],n[2]),e.uniform3f(e.getUniformLocation(r,"uSkyHorizon"),o[0],o[1],o[2]),e.uniform3f(e.getUniformLocation(r,"uSkyGround"),a[0],a[1],a[2])}var fa=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${Bt}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;var On=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,It=`#version 300 es
precision highp float;
void main(){}`,mo=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,kn=`#version 300 es
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
}`,Gn=`#version 300 es
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
${Bt}

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
}`;function J(e,r){let{gl:t}=e,n=t.createVertexArray(),o=t.createBuffer(),a=t.createBuffer(),s=t.createBuffer(),l=t.createBuffer();return!n||!o||!a||!s||!l?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(t.bindVertexArray(n),t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,r.positions,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,a),t.bufferData(t.ARRAY_BUFFER,r.normals,t.STATIC_DRAW),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,s),t.bufferData(t.ARRAY_BUFFER,r.tangents,t.STATIC_DRAW),t.enableVertexAttribArray(2),t.vertexAttribPointer(2,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,l),t.bufferData(t.ELEMENT_ARRAY_BUFFER,r.indices,t.STATIC_DRAW),t.bindVertexArray(null),{vao:n,indexCount:r.indices.length,indexType:r.indices instanceof Uint32Array?t.UNSIGNED_INT:t.UNSIGNED_SHORT,dispose(){t.deleteVertexArray(n),t.deleteBuffer(o),t.deleteBuffer(a),t.deleteBuffer(s),t.deleteBuffer(l)}})}function Ot(e){let{gl:r}=e,t=e.compile(On,It);if("kind"in t)return t;let n=e.compile(kn,Gn);if("kind"in n)return n;let o=e.compile(mo,It);if("kind"in o)return o;let a=(s,l)=>r.getUniformLocation(s,l);return{shadowPass(s,l,i,u){let c=Z(r),d=u??(()=>{});i.bind(),d("shadow.bind"),r.clear(r.DEPTH_BUFFER_BIT),r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.FRONT),r.useProgram(t),d("useProgram(shadow)"),r.uniformMatrix4fv(a(t,"uLightVP"),!1,s),d("uLightVP");for(let f of l)r.uniformMatrix4fv(a(t,"uModel"),!1,f.model),d("shadow uModel"),r.bindVertexArray(f.mesh.vao),d("shadow bindVAO"),r.drawElements(r.TRIANGLES,f.mesh.indexCount,f.mesh.indexType,0),d("shadow drawElements");r.bindVertexArray(null),r.cullFace(r.BACK),W(r,c)},depthPrepass(s,l){let i=Z(r);r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.colorMask(!1,!1,!1,!1),r.useProgram(o),r.uniformMatrix4fv(a(o,"uViewProj"),!1,s);for(let u of l)r.uniformMatrix4fv(a(o,"uModel"),!1,u.model),r.bindVertexArray(u.mesh.vao),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0);r.bindVertexArray(null),r.colorMask(!0,!0,!0,!0),W(r,i)},draw(s){let l=Z(r),i=s.onStep??(()=>{});if(r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.useProgram(n),r.uniformMatrix4fv(a(n,"uViewProj"),!1,s.viewProj),i("uViewProj"),r.uniform3fv(a(n,"uEye"),s.eye),i("uEye"),r.uniform3fv(a(n,"uLightDir"),s.lightDir),i("uLightDir"),r.uniform3fv(a(n,"uLightColour"),s.lightColour),i("uLightColour"),r.uniform1f(a(n,"uAmbientGain"),s.ambientGain??1),i("uAmbientGain"),s.fog&&s.fog.density>0){r.uniform1f(a(n,"uFogDensity"),s.fog.density),r.uniform1f(a(n,"uFogHeight"),s.fog.height),r.uniform1f(a(n,"uFogFloor"),s.fog.floor??0);let u=s.fog.colour;u==="sky"?r.uniform3f(a(n,"uFogColour"),-1,-1,-1):r.uniform3f(a(n,"uFogColour"),u[0],u[1],u[2]),i("fog")}else r.uniform1f(a(n,"uFogDensity"),0);if(In(r,n,s.sky),i("bindSky"),s.ao&&s.screenSize?(r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,s.ao),r.uniform1i(a(n,"uAO"),1),r.uniform2f(a(n,"uScreenSize"),s.screenSize[0],s.screenSize[1]),r.uniform1f(a(n,"uAOEnabled"),1)):r.uniform1f(a(n,"uAOEnabled"),0),i("bindAO"),r.uniformMatrix4fv(a(n,"uLightVP"),!1,s.lightVP),i("lit uLightVP"),s.shadow){r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,s.shadow.depthTexture),r.uniform1i(a(n,"uShadowMap"),0),r.uniform1f(a(n,"uShadowTexel"),1/s.shadow.size),r.uniform1f(a(n,"uShadowStrength"),s.shadowStrength??1),r.uniform1i(a(n,"uShadowTaps"),(s.shadowTaps??9)>=9?9:1);let u=s.shadowBaseline,c=u&&u>0&&s.shadow.size>0?u/s.shadow.size:1;r.uniform1f(a(n,"uShadowBiasScale"),Number.isFinite(c)&&c>0?c:1)}else r.uniform1f(a(n,"uShadowStrength"),0);for(let u of s.draws)r.uniformMatrix4fv(a(n,"uModel"),!1,u.model),r.uniformMatrix3fv(a(n,"uNormalMat"),!1,u.normalMat),i("uNormalMat"),r.uniform3fv(a(n,"uBaseColour"),u.material.baseColour),i("uBaseColour"),r.uniform1f(a(n,"uRoughness"),u.material.roughness),r.uniform1f(a(n,"uMetalness"),u.material.metalness),r.uniform1f(a(n,"uAnisotropy"),u.material.anisotropy??0),r.bindVertexArray(u.mesh.vao),i("lit bindVAO"),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0),i("lit drawElements");r.bindVertexArray(null),ue(r,2),W(r,l)},dispose(){r.deleteProgram(t),r.deleteProgram(n),r.deleteProgram(o)}}}var kt=`
uniform sampler2D uDepth;
uniform vec2 uNearFar;

float linearDepthAt(vec2 uv) {
  float d = texture(uDepth, uv).r * 2.0 - 1.0;
  float n = uNearFar.x, f = uNearFar.y;
  return (2.0 * n * f) / (f + n - d * (f - n));
}`,Hn=`
uniform float uTanHalfFov;
uniform float uAspect;

vec3 viewPosAt(vec2 uv) {
  float z = linearDepthAt(uv);
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x * uTanHalfFov * uAspect * z, ndc.y * uTanHalfFov * z, -z);
}`,zn=kt+Hn,Vn=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,fo=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${zn}

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
}`,po=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${kt}

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
}`;function Gt(e,r,t){let{gl:n}=e,o=e.compile(Vn,fo);if("kind"in o)return o;let a=e.compile(Vn,po);if("kind"in a)return a;let s=Math.max(1,r>>1),l=Math.max(1,t>>1),i=()=>{let m=n.createFramebuffer(),E=n.createTexture();return!m||!E?null:{fb:m,tex:E}},u=i(),c=i();if(!u||!c)return P("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let d=()=>{for(let m of[u,c])n.bindTexture(n.TEXTURE_2D,m.tex),n.texImage2D(n.TEXTURE_2D,0,n.R8,s,l,0,n.RED,n.UNSIGNED_BYTE,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.bindFramebuffer(n.FRAMEBUFFER,m.fb),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,m.tex,0);n.bindFramebuffer(n.FRAMEBUFFER,null)};d(),n.bindFramebuffer(n.FRAMEBUFFER,u.fb);let f=n.checkFramebufferStatus(n.FRAMEBUFFER);if(n.bindFramebuffer(n.FRAMEBUFFER,null),f!==n.FRAMEBUFFER_COMPLETE)return P("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${f.toString(16)}).`);let p=(m,E,x,A,F)=>{n.activeTexture(n.TEXTURE0+F),n.bindTexture(n.TEXTURE_2D,E),n.uniform1i(n.getUniformLocation(m,"uDepth"),F),n.uniform2f(n.getUniformLocation(m,"uNearFar"),x,A)},b=(m,E,x,A,F,g,h)=>{p(m,E,x,A,h),n.uniform1f(n.getUniformLocation(m,"uTanHalfFov"),Math.tan(F*Math.PI/360)),n.uniform1f(n.getUniformLocation(m,"uAspect"),g)};return{get texture(){return u.tex},get width(){return s},get height(){return l},compute(m){let E=Z(n);n.disable(n.DEPTH_TEST),n.depthMask(!1),n.disable(n.BLEND),n.disable(n.CULL_FACE),n.bindFramebuffer(n.FRAMEBUFFER,u.fb),n.viewport(0,0,s,l),n.useProgram(o),b(o,m.depthTexture,m.near,m.far,m.fovDeg,m.aspect,0),n.uniform2f(n.getUniformLocation(o,"uTexel"),1/s,1/l),n.uniform1f(n.getUniformLocation(o,"uRadius"),m.radius??.55),n.uniform1f(n.getUniformLocation(o,"uStrength"),m.strength??1.15),n.uniform1f(n.getUniformLocation(o,"uBias"),m.bias??.035),e.blit(o);for(let[x,A,F]of[[u,c,[1,0]],[c,u,[0,1]]])n.bindFramebuffer(n.FRAMEBUFFER,A.fb),n.viewport(0,0,s,l),n.useProgram(a),p(a,m.depthTexture,m.near,m.far,0),n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,x.tex),n.uniform1i(n.getUniformLocation(a,"uAO"),1),n.uniform2f(n.getUniformLocation(a,"uTexel"),1/s,1/l),n.uniform2f(n.getUniformLocation(a,"uDir"),F[0],F[1]),e.blit(a);ue(n,2),W(n,E)},resize(m,E){let x=Math.max(1,m>>1),A=Math.max(1,E>>1);x===s&&A===l||(s=x,l=A,d())},dispose(){n.deleteProgram(o),n.deleteProgram(a);for(let m of[u,c])n.deleteFramebuffer(m.fb),n.deleteTexture(m.tex)}}}var ho=`
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
`;function oe(e){return String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function $n(e){let r=document.createElement("style");r.textContent=ho,document.head.appendChild(r);let t=document.createElement("section");t.id="lcx-fallback",t.setAttribute("aria-label",`${e.title} \u2014 flat view`),t.setAttribute("tabindex","-1"),document.getElementById("log")?.setAttribute("aria-hidden","true");let n=(a,s)=>a===null?`<td class="absent${s?" n":""}">absent</td>`:`<td class="${s?"n":""}">${oe(a)}</td>`;t.innerHTML=`<h2>${oe(e.title)} \u2014 flat view</h2><p class="reads">${oe(e.readsAs)}</p>`+(e.notices??[]).map(a=>`<p class="notice">${oe(a)}</p>`).join("")+'<div id="lcx-refusal" role="alert"></div>'+(e.html?`<div class="surface">${e.html}</div>`:`<table><caption>${oe(e.title)} \u2014 flat view</caption><thead><tr>`+e.columns.map(a=>`<th scope="col" class="${a.numeric?"n":""}">${oe(a.label)}</th>`).join("")+"</tr></thead><tbody>"+e.rows.map(a=>"<tr>"+e.columns.map(s=>n(a[s.key]??null,!!s.numeric)).join("")+"</tr>").join("")+"</tbody></table>"),document.body.appendChild(t);function o(a,s){let l=document.getElementById("lcx-refusal");l&&(l.innerHTML=`<p class="refusal"><strong>${oe(a)}</strong> \u2014 ${oe(s)} The measurements below are unaffected.</p>`),delete t.dataset.rendered;for(let i of Array.from(document.querySelectorAll("canvas")))i.style.display="none";t.focus({preventScroll:!0})}return document.addEventListener("webglcontextlost",a=>{a.preventDefault(),o("CONTEXT_LOST","The GPU dropped the WebGL context for this page mid-session.")},!0),{markRendered(){t.dataset.rendered="1"},showRefusal:o}}var me=new URLSearchParams(location.search),cn=me.get("settle")!=="0",dn=me.get("particles")!=="0",mn=Ft.includes(me.get("tier")??"")?me.get("tier"):"full",Wt=Mt(mn),br=me.get("fog")!=="0",jt=[],Er=[];function xr(e,r,t,n){let o=me.get(e);if(o===null)return r;let a=Number(o);if(!Number.isFinite(a))return jt.push(`${e}=${o}`),r;let s=Math.max(t,Math.min(n,a));return s!==a&&Er.push(`${e}=${o} used as ${s}`),s}var we=xr("scale",1,1,3),Yt=Math.trunc(xr("frames",300,1,2e4)),V=1200*we,O=720*we,ge=document.getElementById("c");ge.width=V;ge.height=O;var fn=document.getElementById("log");function _e(e){document.title="REFUSED",fn.textContent=e;let[r,...t]=e.split(":");throw yr?.showRefusal(r?.trim()??"REFUSED",t.join(":").trim()||e),new Error(e)}var yr=null;function k(e,r){return"kind"in r&&_e(`${e}: ${r.code} \u2014 ${r.reason} ${r.detail??""}`),r}var et=["SOURCED","QUALIFIED","DILIGENCE","TERMS","SIGNED"],Fe=[{name:"SABLE TREASURY",stage:"SOURCED",valueUsd:24e4,daysSinceUpdate:63,known:"OBSERVED"},{name:"PRAXIS DESK",stage:"SOURCED",valueUsd:null,daysSinceUpdate:9,known:"VALUE_ABSENT"},{name:"CASTOR LABS",stage:"SOURCED",valueUsd:15e4,daysSinceUpdate:34,known:"OBSERVED"},{name:"LUMEN CUSTODY",stage:"SOURCED",valueUsd:95e3,daysSinceUpdate:17,known:"OBSERVED"},{name:"TIBER CLEARING",stage:"QUALIFIED",valueUsd:31e4,daysSinceUpdate:4,known:"OBSERVED"},{name:"VANTA MARKETS",stage:"QUALIFIED",valueUsd:62e4,daysSinceUpdate:28,known:"OBSERVED"},{name:"\u2014",stage:"QUALIFIED",valueUsd:null,daysSinceUpdate:null,known:"WITHHELD"},{name:"HELIOS EXCHANGE",stage:"DILIGENCE",valueUsd:175e4,daysSinceUpdate:52,known:"OBSERVED"},{name:"KESTREL FUND",stage:"DILIGENCE",valueUsd:43e4,daysSinceUpdate:11,known:"OBSERVED"},{name:"MERIDIAN PAY",stage:"TERMS",valueUsd:26e5,daysSinceUpdate:41,known:"OBSERVED"},{name:"NORDIC CUSTODY",stage:"TERMS",valueUsd:88e4,daysSinceUpdate:6,known:"OBSERVED"},{name:"ATLAS OTC",stage:"SIGNED",valueUsd:42e5,daysSinceUpdate:3,known:"OBSERVED"}],Xn=Fe.flatMap(e=>{let r=[],t=(n,o)=>{o!==null&&(Number.isFinite(o)?o<0&&r.push(`${e.name}: ${n} is negative (${o})`):r.push(`${e.name}: ${n} is ${o}`))};return t("valueUsd",e.valueUsd),t("daysSinceUpdate",e.daysSinceUpdate),e.known==="OBSERVED"&&(e.valueUsd===null||e.daysSinceUpdate===null)&&r.push(`${e.name}: state is OBSERVED but a field is absent`),e.known==="WITHHELD"&&(e.valueUsd!==null||e.daysSinceUpdate!==null)&&r.push(`${e.name}: state is WITHHELD but a field carries a value`),e.known==="VALUE_ABSENT"&&e.valueUsd!==null&&r.push(`${e.name}: state is VALUE_ABSENT but a value is present`),r}),Y=45,gr=$n({title:"E3 \xB7 The Pipeline \u2014 deals by stage, package value and days since update",readsAs:`In the rendered view a deal is an object: its size is package value, its position along the channel is the gates it has cleared, and its HEIGHT is movement \u2014 a deal untouched for ${Y} days rests on the floor of the channel. That is what this table cannot do. Every figure below is here, and sorting by any one column hides the other two, which is why the quantity that matters \u2014 value that has cleared diligence and then stopped \u2014 takes two sorts and arithmetic here and one look there.`,notices:[`SYNTHETIC DEALS \u2014 ${Fe.length} hand-authored records. The shape is deliberate (a funnel, value skewed to two names, the two largest late-stage deals stalled); the values are not measurements.`,"One deal was never priced and one is in a compartment that may not be read. Both are ABSENT below rather than blank or zero, the STATE column separates them, and every aggregate in the rendered view excludes both rather than estimating them."],columns:[{key:"name",label:"Deal"},{key:"stage",label:"Stage"},{key:"state",label:"State"},{key:"value",label:"Package value (USD)",numeric:!0},{key:"days",label:"Days since update",numeric:!0},{key:"movement",label:"Movement"}],rows:Fe.map(e=>({name:e.known==="WITHHELD"?"withheld":e.name,stage:e.stage,state:e.known,value:e.valueUsd,days:e.daysSinceUpdate,movement:e.daysSinceUpdate===null?null:e.daysSinceUpdate>=Y?"stalled \u2014 on the floor":e.daysSinceUpdate>=.6*Y?"stalled":"moving"}))});yr=gr;Xn.length>0&&_e(`INVALID_DEAL_DATA: ${Xn.join("; ")} \u2014 a value that is present must be a finite non-negative number, and the state column must agree with which fields are present. The channel was not drawn rather than drawn from a value that cannot be a package value.`);jt.length>0&&_e(`BAD_PARAM: ${jt.join(", ")} \u2014 not a number, so the channel was refused rather than drawn from a nonsensical value. Every deal below is unaffected; correct the URL and reload.`);me.get("refuse")==="1"&&_e("FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. The channel is not being drawn.");var Ye=it(ge,{alpha:!1});st(Ye)||_e(`stage: ${Ye.code} \u2014 ${Ye.reason}`);var D=Ye,T=D.gl,bo=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Eo=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${bt}
${Et}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,xo=k("present",D.compile(bo,Eo)),Vt=k("lit",Ot(D)),Xe=k("target",Ut(D,V,O)),Qt=k("shadow",Nt(D,He(mn,1536))),Wn=k("ao",Gt(D,V,O)),ye=k("strokes",dt(D)),Te=.86,Tr=.46,yo=Math.max(...Fe.map(e=>e.valueUsd??0)),go=e=>Tr*Math.cbrt(e/yo),fe=.11,w=1.45,pn=2.2,Ar=-10.6,De=Ar-2.6,Ae=1.7,Sr=Ae-De,Kt=(Ae+De)/2,ee=1.15,tt=e=>Ar+e*pn,To=.58,Ao=.38,jn=.6,qt=.66,Zt=.3,Yn=.16,vr=e=>e%2===0?Yn:Yn+Zt+.06,Qe=.45,Jt=190,Rr=13.5,Me=br?Math.log(2)/Rr:0,Qn="#0C1322",Fr=90,hn=800,Ke=1.4,bn=2048,Mr=150,Lr="#2C6BFF",wr="#C9552B",Pe="#E0A94A",_r="#5C6880",Dr=yt(2*w,40),Pr=xe(.18,1.25,Sr),Ur=xe(.1,ee,.1),Nr=xe(2*w,.05,.13),Cr=xe(1,1,1),Br=Tt(fe*1.25,fe*.34,40,14),Ir=gt(fe,20,28),So=k("floor",J(D,Dr)),Kn=k("wall",J(D,Pr)),qn=k("post",J(D,Ur)),vo=k("sill",J(D,Nr)),Ro=k("deal",J(D,Cr)),Fo=k("absent",J(D,Br)),Mo=k("withheld",J(D,Ir)),ae=new Float32Array([1,0,0,0,1,0,0,0,1]),Lo=new Float32Array([1,0,0,0,0,1,0,-1,0]),se=(e,r,t,n=1)=>{let o=ve();return o[0]=n,o[5]=n,o[10]=n,o[12]=e,o[13]=r,o[14]=t,o},wo=(e,r,t)=>{let n=ve();return n[5]=0,n[6]=1,n[9]=-1,n[10]=0,n[12]=e,n[13]=r,n[14]=t,n},Or=.1,kr=40,qe={target:[0,.7,-5.2],distance:8.2,azimuthDeg:9,elevationDeg:14,fovDeg:35,near:Or,far:kr},z=ze(qe),Zn=new Map,_=Fe.map((e,r)=>{let t=et.indexOf(e.stage),n=Zn.get(e.stage)??0;Zn.set(e.stage,n+1);let o=tt(t)+To+n*Ao,a=n%2===0?-jn:jn,s=e.valueUsd===null?null:go(e.valueUsd),l=e.known==="VALUE_ABSENT"?"MASS_REFUSED_VALUE_NEVER_MEASURED":e.known==="WITHHELD"?"MASS_REFUSED_VALUE_WITHHELD":null,i=e.daysSinceUpdate===null?null:e.daysSinceUpdate/Y,u=i===null?null:cn?Math.min(1,i):0,c=e.daysSinceUpdate===null?"SETTLE_REFUSED_LAST_TOUCH_WITHHELD":null,d=s!==null?s/2:fe,f=u===null?Te+.3:(1-u)*Te,p=f+d;return{d:e,i:r,stageIndex:t,slot:n,x:a,z:o,edge:s,settle:u,settleClamped:i!==null&&i>1,baseY:f,centreY:p,topY:f+2*d,massRefusal:l,settleRefusal:c,distance:Math.hypot(a-z[0],p-z[1],o-z[2])}}),_o=_.filter(e=>{let r=e.edge!==null?e.edge/2:fe,t=e.z-tt(e.stageIndex);return t-r<.05||t+r>pn-.05}).map(e=>e.d.name),Do=e=>_.filter(r=>r.stageIndex>=e&&r.d.known==="OBSERVED"&&r.d.valueUsd!==null).reduce((r,t)=>r+(t.d.valueUsd??0),0),I=et.map((e,r)=>{let t=tt(r),n=Do(r),o=n/Fr,a=o/hn,s=Math.min(pn,Ae-t-.2),l=Math.max(.2,s/Ke);return{label:e,index:r,z:t,clearedUsd:n,usdPerDay:o,ratePerSec:a,life:l,linearDensityPerMetre:a/Ke}}),Po=[.1,.3,1.15],Gr=I.map(e=>({at:[0,.34,e.z+.06],rate:e.ratePerSec,velocity:[0,0,Ke],spread:.26,colour:Po,life:e.life})),ce=dn?vt(D,bn):null,H=ce!==null&&!("kind"in ce)?ce:null,en=ce!==null&&"kind"in ce?`${ce.code} \u2014 ${ce.reason}`:dn?null:"DISABLED_BY_PARAM",Uo=Math.round(I.reduce((e,r)=>e+r.ratePerSec*r.life,0)),Jn=I.reduce((e,r)=>e+r.ratePerSec,0),er=Jn>0?(H?.slots??bn)/Jn:1/0,tr=Math.max(...I.map(e=>e.life)),Vr={sources:Gr,dtSeconds:1/60,noiseScale:.55,noiseStrength:.12,drag:.5},nr={baseColour:U("#1E2A42"),roughness:.6,metalness:.03},Ht={baseColour:U("#31415C"),roughness:.36,metalness:.2},Hr=se(0,0,Kt,1);Hr[10]=Sr/(2*w);var de=[{mesh:So,model:Hr,normalMat:ae,material:{baseColour:U("#22304A"),roughness:.82,metalness:0}},{mesh:Kn,model:se(-(w+.09),.625,Kt),normalMat:ae,material:nr},{mesh:Kn,model:se(w+.09,.625,Kt),normalMat:ae,material:nr}];for(let e of I)de.push({mesh:qn,model:se(-(w+.05),ee/2,e.z),normalMat:ae,material:Ht},{mesh:qn,model:se(w+.05,ee/2,e.z),normalMat:ae,material:Ht},{mesh:vo,model:se(0,.025,e.z),normalMat:ae,material:Ht});for(let e of _)if(e.d.known==="WITHHELD")de.push({mesh:Mo,model:se(e.x,e.centreY,e.z),normalMat:ae,material:{baseColour:U(_r),roughness:.55,metalness:.25}});else if(e.edge===null)de.push({mesh:Fo,model:wo(e.x,e.centreY,e.z),normalMat:Lo,material:{baseColour:U(Pe),roughness:.44,metalness:.1}});else{let r=ht(U(Lr),U(wr),e.settle??0);de.push({mesh:Ro,model:se(e.x,e.centreY,e.z,e.edge),normalMat:ae,material:{baseColour:r,roughness:.34+.16*(e.settle??0),metalness:.06}})}var zr=[-.62,-.38,-.69],rr=[-2,0,De],or=[2,1.9,Ae],ar=_t({direction:zr,colour:[1,1,1],extent:9.6},Pt(rr,or),Dt(rr,or)),No=K(Dr)+2*K(Pr)+I.length*(2*K(Ur)+K(Nr))+_.filter(e=>e.d.known==="OBSERVED").length*K(Cr)+_.filter(e=>e.d.known==="VALUE_ABSENT").length*K(Br)+_.filter(e=>e.d.known==="WITHHELD").length*K(Ir),$=$e(qe,V/O),N=V/we,C=O/we,En=e=>Me<=0?0:1-Math.exp(-Me*e),Le=e=>e>=1e6?`$${(e/1e6).toFixed(2)}M`:e>=1e4?`$${Math.round(e/1e3)}k`:`$${(e/1e3).toFixed(1)}k`,zt=[],sr=(e,r,t)=>{let n=0;for(let o=0;o<4;o++){let a=e[o],s=e[(o+1)%4],l=(s.x-a.x)*(t-a.y)-(s.y-a.y)*(r-a.x);if(Math.abs(l)<1e-9)continue;let i=l>0?1:-1;if(n===0)n=i;else if(i!==n)return!1}return!0},$r=e=>{let r=B($,[e.x,e.baseY,e.z],N,C),t=B($,[e.x,e.topY,e.z],N,C);return r.behind||t.behind?0:Math.abs(r.sy-t.sy)},Xr=e=>{let r=B($,[e.x,e.centreY,e.z],N,C);if(r.behind)return!1;let t=B($,[e.x,e.topY,e.z],N,C),n=Math.max(6,Math.abs(r.sy-t.sy));return r.sx>n&&r.sx<N-n&&r.sy>n&&r.sy<C-n},Ze=e=>{let r=B($,[e.x,e.centreY,e.z],N,C);return r.behind?null:r.sy},xn=e=>{if(e.settle===null)return null;let r=e.edge!==null?e.edge/2:fe,t=B($,[e.x,e.baseY+r,e.z],N,C),n=B($,[e.x,Te+r,e.z],N,C);return t.behind||n.behind?null:Math.abs(t.sy-n.sy)},nt=[..._].sort((e,r)=>e.distance-r.distance).map(e=>{let r=e.d.known==="WITHHELD",t=e.distance>Rr,n=Math.round(qt*Jt),o=Math.round(Zt*Jt),a=e.x<0?e.x-Qe:e.x+Qe,s=Math.atan2(z[0]-a,z[2]-e.z),l=St(a,e.z,e.topY+vr(e.slot),qt,Zt,s,0),i=At($,l,N,C,n,o),u=q(i)?i.refusal:null,c=!q(i)&&i.signedArea<=0,d=q(i)?0:Math.max(Math.hypot(i.screen[0].x-i.screen[1].x,i.screen[0].y-i.screen[1].y),Math.hypot(i.screen[3].x-i.screen[2].x,i.screen[3].y-i.screen[2].y)),f=d<26,p=q(i)?!1:i.screen.every(x=>x.x<0||x.x>N||x.y<0||x.y>C),b=q(i)?0:i.screen.filter(x=>zt.some(A=>sr(A,x.x,x.y))).length+zt.reduce((x,A)=>x+A.filter(F=>sr(i.screen.map(g=>({x:g.x,y:g.y})),F.x,F.y)).length,0),m=b>=2,E=!u&&!c&&!r&&!t&&!f&&!p&&!m;return E&&!q(i)&&zt.push(i.screen.map(x=>({x:x.x,y:x.y}))),{p:e,proj:i,shown:E,ew:n,eh:o,refusal:u,backFacing:c,withheld:r,tooFar:t,edgeOn:f,offFrame:p,occluded:m,widthPx:d,coveredCorners:b}}),Co=nt.filter(e=>e.shown).map(e=>e.p),We={colour:U("#4E8CFF"),gain:1.5},Bo={colour:U("#7FB2FF"),gain:1.1},Io={colour:U("#7FB2FF"),gain:.45},ie=z[0]>=0?1:-1,Wr=ie*(w-.42),jr=ie*(w-.12),Oo=ie*(w+.2),yn=tt(3),ko=.055,gn=[0,20,Y].map(e=>({days:e,y:(1-Math.min(1,e/Y))*Te+ko,label:e>=Y?`${e}d+`:`${e}d`}));function tn(){let e=$e(qe,V/O);H&&H.step(Vr),Vt.shadowPass(ar,de,Qt),Xe.bind();let r=U(Qn);T.clearColor(r[0],r[1],r[2],1),T.clear(T.COLOR_BUFFER_BIT|T.DEPTH_BUFFER_BIT),Vt.depthPrepass(e,de),Wn.compute({depthTexture:Xe.depthTexture,near:Or,far:kr,fovDeg:qe.fovDeg??35,aspect:V/O,radius:.36,strength:1.25}),Xe.bind(),Vt.draw({viewProj:e,eye:z,lightDir:zr,lightColour:[3.4,3.3,3.14],ambientGain:.44,lightVP:ar,shadow:Qt,shadowStrength:.92,shadowTaps:Wt.shadowTaps,shadowBaseline:1536,draws:de,ao:Wn.texture,screenSize:[V,O],fog:Me>0?{density:Me,height:5,floor:0,colour:U(Qn)}:null}),T.enable(T.BLEND),T.blendFunc(T.ONE,T.ONE),T.enable(T.DEPTH_TEST),T.depthMask(!1);for(let t of I)ye.ruleAtDepth(e,-w,.02,w,.02,t.z,.012,We),ye.ruleAtDepth(e,-w,ee,w,ee,t.z,.01,We),ye.ruleAtDepth(e,-w,.02,-w,ee,t.z,.01,We),ye.ruleAtDepth(e,w,.02,w,ee,t.z,.01,We);for(let t of gn)ye.ruleAtDepth(e,jr,t.y,Wr,t.y,yn,.006,Bo);for(let t of Co){let n=t.x<0?t.x-Qe:t.x+Qe;ye.ruleAtDepth(e,t.x,t.topY,n,t.topY+vr(t.slot),t.z,.008,Io)}T.depthMask(!0),T.disable(T.BLEND),H&&H.draw({viewProj:e,sources:Gr,pointScale:18}),T.bindFramebuffer(T.FRAMEBUFFER,null),T.viewport(0,0,V,O),T.disable(T.DEPTH_TEST),T.activeTexture(T.TEXTURE0),T.bindTexture(T.TEXTURE_2D,Xe.texture),D.blit(xo,t=>T.uniform1i(T.getUniformLocation(t,"uScene"),0))}var ir=4e3;function Go(e){let r=new Uint8Array(4),t=performance.now();tn(),T.readPixels(0,0,1,1,T.RGBA,T.UNSIGNED_BYTE,r);let n=Math.max(.01,performance.now()-t),o=Math.min(e,Math.max(1,Math.floor(ir/n))),a=performance.now(),s=0;for(let l=0;l<o&&(tn(),s++,!(performance.now()-a>ir));l++);return T.readPixels(0,0,1,1,T.RGBA,T.UNSIGNED_BYTE,r),{msPerFrame:(performance.now()-a)/s,measured:s}}if(H)for(let e=0;e<Mr;e++)H.step(Vr);var nn=Go(Yt),$t=nn.msPerFrame,te=(e,r)=>{let t=document.createElement("div");return t.style.cssText=e,t.textContent=r,t},rt=document.createElement("div");rt.style.cssText=`position:relative;overflow:hidden;width:${N}px;height:${C}px`;ge.parentNode?.insertBefore(rt,ge);rt.appendChild(ge);var he=document.createElement("div");he.style.cssText="position:absolute;inset:0;pointer-events:none";rt.appendChild(he);var Ue="pointer-events:auto;user-select:text;-webkit-user-select:text";for(let e of[...nt].sort((r,t)=>t.p.distance-r.p.distance)){let{p:r,proj:t,shown:n,ew:o,eh:a}=e;if(!n||q(t))continue;let s=En(r.distance),l=document.createElement("div");l.style.cssText=`position:absolute;left:0;top:0;width:${o}px;height:${a}px;transform-origin:0 0;transform:${t.transform};display:flex;flex-direction:column;justify-content:center;gap:3px;padding:0 5px;overflow:hidden;${Ue};opacity:${(1-.7*s).toFixed(3)};-webkit-font-smoothing:antialiased`;let i=r.d.daysSinceUpdate===null?"\u2014":`${r.d.daysSinceUpdate} d`;l.appendChild(te("font:700 11px/1.05 ui-monospace,monospace;color:#fff",r.d.name));let u=te("font:400 10.5px/1.2 ui-monospace,monospace;color:rgba(255,255,255,0.80)",r.d.valueUsd===null?`VALUE ABSENT \xB7 ${i}`:`${Le(r.d.valueUsd)} \xB7 ${i}`);r.d.valueUsd===null&&(u.style.color=Pe),l.appendChild(u),l.appendChild(te("font:600 9px/1 ui-monospace,monospace;letter-spacing:.14em;color:rgba(255,255,255,0.60)",r.d.stage)),he.appendChild(l)}var lr=[],ur=[...I].reverse().map(e=>{let r=e.index%2===0,t=B($,[r?-(w+.14):w+.14,2.1,e.z],N,C),n=En(Math.hypot(z[0],z[1]-ee,z[2]-e.z)),o=!t.behind&&t.sx>30&&t.sx<N-30&&t.sy>8&&t.sy<C-8,a=o&&lr.some(s=>Math.hypot(s.x-t.sx,s.y-t.sy)<30);if(o&&!a){lr.push({x:t.sx,y:t.sy});let s=document.createElement("div");s.style.cssText=`position:absolute;left:${t.sx.toFixed(1)}px;top:${t.sy.toFixed(1)}px;transform:translate(${r?"-100%":"0"},-100%);text-align:${r?"right":"left"};white-space:nowrap;opacity:${(1-.72*n).toFixed(3)};${Ue}`,s.appendChild(te("font:600 10px/1.25 ui-monospace,monospace;letter-spacing:.16em;color:#9CC2FF",e.label)),s.appendChild(te("font:400 9.5px/1.25 ui-monospace,monospace;color:rgba(196,212,240,0.72)",j?`${Le(e.usdPerDay)}/d`:"THROUGHPUT ABSENT")),he.appendChild(s)}return{stage:e.label,sx:Math.round(t.sx),sy:Math.round(t.sy),onFrame:o,crowded:a}}),Vo=[{y:Te+.15,label:"DAYS SINCE UPDATE"},...gn].map(e=>{let r=B($,[Oo,e.y,yn],N,C),t=!r.behind&&r.sx>0&&r.sx<N&&r.sy>0&&r.sy<C;if(t){let n=document.createElement("div");n.style.cssText=`position:absolute;left:${r.sx.toFixed(1)}px;top:${r.sy.toFixed(1)}px;transform:translate(${ie>0?"0":"-100%"},-50%);text-align:${ie>0?"left":"right"};font:500 9.5px/1 ui-monospace,monospace;letter-spacing:.08em;color:rgba(196,212,240,0.78);white-space:nowrap;${ie>0?"padding-left":"padding-right"}:5px;${Ue}`,n.textContent=e.label,he.appendChild(n)}return{label:e.label,onFrame:t}}),Yr=et.map((e,r)=>{let t=_.filter(l=>l.stageIndex===r&&l.settle!==null&&l.edge!==null);if(t.length<2)return{stage:e,readable:t.length,separationPx:null};let n=t.reduce((l,i)=>(i.settle??0)>(l.settle??0)?i:l),o=t.reduce((l,i)=>(i.settle??0)<(l.settle??0)?i:l),a=Ze(n),s=Ze(o);return{stage:e,readable:t.length,separationPx:a===null||s===null?null:Math.round(Math.abs(a-s))}}),cr=Yr.map(e=>e.separationPx).filter(e=>e!==null),Ho=cr.length>0?Math.min(...cr):null,Qr=[];for(let e of _)for(let r of _){if(e.i>=r.i||e.stageIndex!==r.stageIndex||e.settle===null||r.settle===null)continue;let[t,n]=e.settle>r.settle?[e,r]:[r,e],o=Ze(t),a=Ze(n);o!==null&&a!==null&&o<a&&Qr.push(`${t.d.name} above ${n.d.name}`)}var pe=_.filter(e=>e.edge!==null&&e.d.known==="OBSERVED"),rn=new Map;for(let e of pe)rn.set(e.i,$r(e));var Kr=0,qr=0;for(let e of pe)for(let r of pe){if(e.i>=r.i)continue;let[t,n]=(e.d.valueUsd??0)>(r.d.valueUsd??0)?[e,r]:[r,e];(rn.get(t.i)??0)<(rn.get(n.i)??0)&&(Kr++,t.stageIndex===n.stageIndex&&qr++)}var Tn=.6,An=pe.reduce((e,r)=>e+(r.d.valueUsd??0),0),j=pe.length>0&&An>0,zo=j?null:"NO_READABLE_VALUE_IN_THE_BOOK",on=e=>j?Number((e/An).toFixed(3)):null,Ne=pe.filter(e=>(e.settle??0)>=Tn),dr=Ne.reduce((e,r)=>e+(r.d.valueUsd??0),0),$o=Ne.filter(e=>e.stageIndex>=et.indexOf("DILIGENCE")),Je=$o.reduce((e,r)=>e+(r.d.valueUsd??0),0),mr=Ne.map(e=>xn(e)).filter(e=>e!==null),Xo=mr.length>0?Math.round(Math.min(...mr)):null,fr=_.map(e=>xn(e)).filter(e=>e!==null),Wo=fr.length>0?Math.round(Math.max(...fr)):null,le={OBSERVED:_.filter(e=>e.d.known==="OBSERVED").length,VALUE_ABSENT:_.filter(e=>e.d.known==="VALUE_ABSENT").length,WITHHELD:_.filter(e=>e.d.known==="WITHHELD").length},Ce=document.createElement("div");Ce.style.cssText="position:absolute;left:18px;top:16px;display:flex;flex-direction:column;gap:7px;"+Ue;Ce.appendChild(te("font:600 11px/1 ui-monospace,monospace;letter-spacing:.16em;color:#8FB7FF","PIPELINE \xB7 SIZE IS VALUE, HEIGHT IS MOVEMENT"));{let e=document.createElement("div");e.style.cssText="font:400 10.5px/1.55 ui-monospace,monospace;color:rgba(196,212,240,0.86)";let r=document.createElement("div");if(j){let t=document.createElement("b");t.style.color="#FF9B76",t.textContent=Le(Je),r.appendChild(t),r.appendChild(document.createTextNode(` PAST DILIGENCE AND STALLED  \xB7  ${Math.round(100*(on(Je)??0))}% OF THE READABLE BOOK`))}else{let t=document.createElement("b");t.style.color=Pe,t.textContent="NO READABLE VALUE IN THE BOOK",r.appendChild(t),r.appendChild(document.createTextNode(` \u2014 ${le.WITHHELD} withheld, ${le.VALUE_ABSENT} never priced, so no share is computable`))}e.appendChild(r),e.appendChild(te("",`${Y} d = ON THE FLOOR  \xB7  1 PARTICLE = ${Le(hn)}/d CLEARED`)),e.appendChild(te("",`${cn?"MOVEMENT AXIS ON":"MOVEMENT AXIS OFF \u2014 every deal pinned to the rail"}  \xB7  ${en===null?"THROUGHPUT ON":`THROUGHPUT OFF \u2014 ${en.split(" \u2014 ")[0]}`}`)),Ce.appendChild(e)}Ce.appendChild(te(`font:500 10px/1.4 ui-monospace,monospace;color:${Pe}`,"SYNTHETIC DEALS"));he.appendChild(Ce);var Sn=document.createElement("div");Sn.style.cssText="position:absolute;right:18px;bottom:16px;display:flex;flex-direction:column;gap:6px;align-items:flex-end;font:500 10.5px/1 ui-monospace,monospace;"+Ue;Sn.innerHTML=[[Lr,"UPDATED \xB7 rides the rail"],[wr,`STALLED \xB7 ${Ne.length} of ${le.OBSERVED} at ${Math.round(Tn*Y)} d+`],[Pe,`VALUE ABSENT \xB7 ${le.VALUE_ABSENT} (ring: no mass to give)`],[_r,`WITHHELD \xB7 ${le.WITHHELD} (off the movement axis)`]].map(([e,r])=>`<div style="display:flex;align-items:center;gap:7px;color:rgba(196,212,240,0.85)"><span>${r}</span><span style="width:11px;height:11px;background:${e};display:inline-block"></span></div>`).join("");he.appendChild(Sn);var Re=H?H.readState():null,an=0,Zr=0,sn=1/0,ln=-1/0;if(Re&&H)for(let e=0;e<H.slots;e++){let r=Re[e*4],t=Re[e*4+1],n=Re[e*4+2];Re[e*4+3]<0||(an++,n<sn&&(sn=n),n>ln&&(ln=n),(Math.abs(r)>w||t<-.15||t>ee+.25||n<De||n>Ae)&&Zr++)}var Jr=(()=>{let e=T.getExtension("WEBGL_debug_renderer_info");return e?String(T.getParameter(e.UNMASKED_RENDERER_WEBGL)):"unknown"})(),Xt=/swiftshader|llvmpipe|software/i.test(Jr),un=xt();if(un.length>0){let e="BRAND FIDELITY FAILED \u2014 "+un.map(r=>`${r.key}: expected ${r.expected}, got ${r.actual}`).join("; ");throw document.title="REFUSED",fn.textContent=e,new Error(e)}var je=nt.map(e=>({name:e.p.d.name,stage:e.p.d.stage,known:e.p.d.known,valueUsd:e.p.d.valueUsd,days:e.p.d.daysSinceUpdate,edgeM:e.p.edge===null?null:Number(e.p.edge.toFixed(3)),settle:e.p.settle===null?null:Number(e.p.settle.toFixed(3)),settleClamped:e.p.settleClamped,baseY:Number(e.p.baseY.toFixed(3)),distance:Number(e.p.distance.toFixed(2)),screenHeightPx:Math.round($r(e.p)),fallenPx:(()=>{let r=xn(e.p);return r===null?null:Math.round(r)})(),fog:Number(En(e.p.distance).toFixed(3)),tagWidthPx:Math.round(e.widthPx),tagShown:e.shown,massRefusal:e.p.massRefusal,settleRefusal:e.p.settleRefusal,hiddenBecause:e.shown?null:e.withheld?"WITHHELD":e.refusal?e.refusal:e.backFacing?"BACK_FACING":e.offFrame?"OFF_FRAME":e.edgeOn?"EDGE_ON":e.tooFar?"BEYOND_LEGIBLE_RANGE":"OCCLUDED",objectOnFrame:Xr(e.p)})),eo={tier:Wt.tier,tierDprScale:Wt.dprScale,tierShadowMapSize:He(mn,1536),shadowBaseline:1536,settleAxis:cn,particlesRequested:dn,fog:br,fogDensity:Number(Me.toFixed(4)),hdr:D.hdr,eye:z.map(e=>Number(e.toFixed(2))),deals:_.length,counts:le,aggregateExcludes:{valueAbsent:le.VALUE_ABSENT,withheld:le.WITHHELD,code:"AGGREGATE_EXCLUDES_UNREADABLE_VALUE"},totalObservedUsd:An,stallDays:Y,stalledFrom:Tn,stalledCount:Ne.length,stalledUsd:dr,stalledShare:on(dr),deepStalledUsd:Je,deepStalledShare:on(Je),bookRefusal:zo,settleClamped:_.filter(e=>e.settleClamped).length,minStalledDisplacementPx:Xo,maxDisplacementPx:Wo,minSeparationPx:Ho,settleInversions:Qr,railLiftM:Te,edgeMaxM:Tr,edgeMinM:Number(Math.min(...pe.map(e=>e.edge??0)).toFixed(3)),referenceSizeM:fe,massAmbiguousPairs:Kr,massAmbiguousWithinStage:qr,outOfSegment:_o,windowDays:Fr,usdPerParticle:hn,particleSpeed:Ke,rateMonotoneDown:j?I.every((e,r)=>r===0||e.ratePerSec<=I[r-1].ratePerSec+1e-9):null,rateRatioFirstLast:j?Number((I[0].ratePerSec/Math.max(1e-9,I[I.length-1].ratePerSec)).toFixed(2)):null,particleField:{refusal:en,capacity:bn,slots:H?.slots??0,aliveExpected:Uo,aliveActual:an,outOfChannel:Zr,zRange:an>0?[Number(sn.toFixed(2)),Number(ln.toFixed(2))]:null,channelZ:[De,Ae],slotRecycleSeconds:Number(er.toFixed(2)),maxLifeSeconds:Number(tr.toFixed(2)),recycleSafe:er>tr,primeSteps:Mr},tagsShown:nt.filter(e=>e.shown).length,hiddenBy:je.filter(e=>!e.tagShown).reduce((e,r)=>{let t=r.hiddenBecause??"UNKNOWN";return e[t]=(e[t]??0)+1,e},{}),nameOverflow:_.filter(e=>e.d.known!=="WITHHELD"&&e.d.name.length*6.6>qt*Jt-10).map(e=>e.d.name),objectsOffFrame:_.filter(e=>!Xr(e)).map(e=>e.d.name),gateLabelsOffFrame:ur.filter(e=>!e.onFrame).map(e=>e.stage),gateLabelsCrowded:ur.filter(e=>e.crowded).map(e=>e.stage),axisLabelsOffFrame:Vo.filter(e=>!e.onFrame).length,axisTicksDrawn:gn.map(e=>{let r=B($,[(Wr+jr)/2,e.y,yn],V,O);if(r.behind||r.sx<2||r.sx>V-2||r.sy<4||r.sy>O-4)return{label:e.label,drawn:!1,why:"OFF_FRAME"};let t=(a,s)=>{let l=s-a+1,i=new Uint8Array(4*l);T.readPixels(Math.round(r.sx),Math.round(O-r.sy)+a,1,l,T.RGBA,T.UNSIGNED_BYTE,i);let u=0;for(let c=0;c<l;c++)u=Math.max(u,i[c*4]+i[c*4+1]+i[c*4+2]);return u},n=t(-2,2),o=t(8,12);return{label:e.label,drawn:n>o+12,lum:n,background:o}}),axisSide:ie>0?"right":"left",axisOnEyeSide:ie>0==z[0]>=0,fogNearest:Math.min(...je.map(e=>e.fog)),fogFurthest:Math.max(...je.map(e=>e.fog)),brandFidelity:un,glError:T.getError(),triangles:No,shadowMap:Qt.size,resolution:`${V}x${O}`,dprScale:we,frames:nn.measured,framesRequested:Yt,sweepTruncated:nn.measured<Yt,paramClamps:Er,msPerFrame:Number($t.toFixed(3)),fps:Math.round(1e3/$t),renderer:Jr,rendererClass:Xt?"software":"hardware",headroom:Xt?null:Number((16.6-$t).toFixed(3)),headroomRefusal:Xt?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null,hardwareMsPerFrame:null,gates:I.map(e=>({stage:e.label,z:e.z,clearedUsd:j?e.clearedUsd:null,usdPerDay:j?Math.round(e.usdPerDay):null,ratePerSec:j?Number(e.ratePerSec.toFixed(2)):null,perMetre:j?Number(e.linearDensityPerMetre.toFixed(2)):null,lifeSeconds:Number(e.life.toFixed(2))})),perStageSeparation:Yr,perDeal:je};globalThis.E3=eo;var{perDeal:pr,gates:hr,perStageSeparation:jo,...Yo}=eo;fn.textContent=JSON.stringify(Yo,null,2)+`

gates (${hr.length}):
`+hr.map(e=>`  ${e.stage.padEnd(10)} ${(e.usdPerDay===null?"absent":`$${e.usdPerDay}`).padStart(8)}/d ${String(e.ratePerSec??"absent").padStart(7)} p/s ${String(e.perMetre??"absent").padStart(7)} p/m life ${e.lifeSeconds}s`).join(`
`)+`

settle separation on screen:
`+jo.map(e=>`  ${e.stage.padEnd(10)} ${e.separationPx===null?"n/a (needs 2 readable)":`${e.separationPx} px`}`).join(`
`)+`

perDeal (${pr.length}, full detail on globalThis.E3):
`+pr.map(e=>`  ${e.name.padEnd(16)} ${e.stage.padEnd(10)} ${(e.valueUsd===null?"ABSENT":Le(e.valueUsd)).padStart(7)} ${(e.days===null?"\u2014":`${e.days}d`).padStart(4)} base ${e.baseY.toFixed(2)} fallen ${String(e.fallenPx??"\u2014").padStart(3)}px ${String(e.distance).padStart(5)}m ${String(e.screenHeightPx).padStart(3)}px ${e.tagShown?"TAG":`no tag: ${e.hiddenBecause}`}`).join(`
`);tn();gr.markRendered();document.title="READY";

var An={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected.",FEEDBACK_LOOP:"A layer of this view was asked to read the surface it draws into, which every driver refuses, so the layer is not being drawn. This is a defect in the renderer, not in the data."};function D(e,r){return r===void 0?{kind:"refused",code:e,reason:An[e]}:{kind:"refused",code:e,reason:An[e],detail:r}}function st(e){return e.kind==="stage"}function it(e,r={}){let t=e.getContext("webgl2",{antialias:r.antialias??!1,alpha:r.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!t)return D("NO_WEBGL2");let n=t.getExtension("EXT_color_buffer_float"),o=e.width,a=e.height,s=n?t.RGBA16F:t.RGBA8,l=n?t.HALF_FLOAT:t.UNSIGNED_BYTE,i=(x,A)=>{let g=t.createTexture();t.bindTexture(t.TEXTURE_2D,g),t.texImage2D(t.TEXTURE_2D,0,s,x,A,0,t.RGBA,l,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);let E=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,E),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,g,0);let S=t.checkFramebufferStatus(t.FRAMEBUFFER);return S!==t.FRAMEBUFFER_COMPLETE?D("FRAMEBUFFER_INCOMPLETE",`status 0x${S.toString(16)} at ${x}\xD7${A}`):{texture:g,framebuffer:E,width:x,height:A}},u=r.bloomShift??2,c={w:o,h:a},d=i(o,a);if("kind"in d)return d;let m=i(Math.max(1,o>>u),Math.max(1,a>>u));if("kind"in m)return m;let p=i(Math.max(1,o>>u),Math.max(1,a>>u));if("kind"in p)return p;let h=t.createVertexArray();t.bindVertexArray(h);let f=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,f),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null);let b=[];return{kind:"stage",gl:t,cssWidth:e.clientWidth||o,cssHeight:e.clientHeight||a,hdr:!!n,get width(){return c.w},get height(){return c.h},get scene(){return d},get bloomA(){return m},get bloomB(){return p},setRegion(x,A){let g=Math.max(1,Math.round(x)),E=Math.max(1,Math.round(A));if(!(g===c.w&&E===c.h)){c={w:g,h:E};for(let S of[d,m,p])"kind"in S||(t.deleteFramebuffer(S.framebuffer),t.deleteTexture(S.texture));d=i(g,E),m=i(Math.max(1,g>>u),Math.max(1,E>>u)),p=i(Math.max(1,g>>u),Math.max(1,E>>u))}},compile(x,A){let g=(w,C)=>{let F=t.createShader(w);if(t.shaderSource(F,C),t.compileShader(F),!t.getShaderParameter(F,t.COMPILE_STATUS)){let R=t.getShaderInfoLog(F)??"(no log)";return t.deleteShader(F),D("SHADER_COMPILE_FAILED",R)}return F},E=g(t.VERTEX_SHADER,x);if(typeof E=="object"&&"kind"in E)return E;let S=g(t.FRAGMENT_SHADER,A);if(typeof S=="object"&&"kind"in S)return t.deleteShader(E),S;let v=t.createProgram();if(t.attachShader(v,E),t.attachShader(v,S),t.linkProgram(v),!t.getProgramParameter(v,t.LINK_STATUS)){let w=t.getProgramInfoLog(v)??"(no log)";return t.deleteShader(E),t.deleteShader(S),t.deleteProgram(v),D("PROGRAM_LINK_FAILED",w)}return t.detachShader(v,E),t.detachShader(v,S),t.deleteShader(E),t.deleteShader(S),b.push(v),v},bindTarget(x){t.bindFramebuffer(t.FRAMEBUFFER,x?x.framebuffer:null),t.viewport(0,0,x?x.width:c.w,x?x.height:c.h)},blit(x,A){t.useProgram(x),t.bindVertexArray(h),A?.(x),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null)},dispose(){for(let x of b)t.deleteProgram(x);for(let x of[d,m,p])"kind"in x||(t.deleteFramebuffer(x.framebuffer),t.deleteTexture(x.texture));t.deleteBuffer(f),t.deleteVertexArray(h)}}}var Se=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function Be(e,r){let t=new Float32Array(16);for(let n=0;n<4;n++)for(let o=0;o<4;o++){let a=0;for(let s=0;s<4;s++)a+=e[s*4+o]*r[n*4+s];t[n*4+o]=a}return t}var ke=(e,r)=>[e[0]-r[0],e[1]-r[1],e[2]-r[2]],Oe=(e,r)=>e[0]*r[0]+e[1]*r[1]+e[2]*r[2],lt=(e,r)=>[e[1]*r[2]-e[2]*r[1],e[2]*r[0]-e[0]*r[2],e[0]*r[1]-e[1]*r[0]];function Ae(e){let r=Math.hypot(e[0],e[1],e[2]);return r===0?e:[e[0]/r,e[1]/r,e[2]/r]}function ut(e,r,t,n){let o=1/Math.tan(e/2);return new Float32Array([o/r,0,0,0,0,o,0,0,0,0,(n+t)/(t-n),-1,0,0,2*n*t/(t-n),0])}function ct(e,r,t,n,o,a){let s=r-e,l=n-t,i=a-o;return new Float32Array([2/s,0,0,0,0,2/l,0,0,0,0,-2/i,0,-(r+e)/s,-(n+t)/l,-(a+o)/i,1])}function Ge(e,r,t){let n=Ae(ke(e,r)),o=lt(t,n);if(Math.hypot(o[0],o[1],o[2])<1e-8)return Se();let a=Ae(o),s=lt(n,a);return new Float32Array([a[0],s[0],n[0],0,a[1],s[1],n[1],0,a[2],s[2],n[2],0,-Oe(a,e),-Oe(s,e),-Oe(n,e),1])}function Sn(e,r){let t=[0,1,2,3].map(o=>e[0+o]*r[0]+e[4+o]*r[1]+e[8+o]*r[2]+e[12+o]),n=t[3];return{x:t[0]/n,y:t[1]/n,z:t[2]/n,w:n}}function I(e,r,t,n){let o=Sn(e,r);return{sx:(o.x*.5+.5)*t,sy:(1-(o.y*.5+.5))*n,behind:o.w<=0}}var vn=`#version 300 es
precision highp float;
layout(location=0) in vec3 p;
uniform mat4 uMVP;
out float vY;
void main(){ vY = p.y; gl_Position = uMVP * vec4(p, 1.0); }`,Rn=`#version 300 es
precision highp float;
in float vY;
uniform vec3 uColour;
uniform float uGain, uFade, uFadeFrom, uFadeTo;
out vec4 frag;
void main(){
  float t = clamp((vY - uFadeFrom) / max(uFadeTo - uFadeFrom, 1e-4), 0.0, 1.0);
  frag = vec4(uColour * uGain * (1.0 - uFade * t), 1.0);
}`;function dt(e){let{gl:r}=e,t=e.compile(vn,Rn);if("kind"in t)return t;let n=r.createVertexArray();r.bindVertexArray(n);let o=r.createBuffer();r.bindBuffer(r.ARRAY_BUFFER,o),r.enableVertexAttribArray(0),r.vertexAttribPointer(0,3,r.FLOAT,!1,0,0),r.bindVertexArray(null);let a=u=>r.getUniformLocation(t,u),s={mvp:a("uMVP"),colour:a("uColour"),gain:a("uGain"),fade:a("uFade"),fadeFrom:a("uFadeFrom"),fadeTo:a("uFadeTo")},l=(u,c,d)=>{r.useProgram(t),r.bindVertexArray(n),r.bindBuffer(r.ARRAY_BUFFER,o),r.bufferData(r.ARRAY_BUFFER,c,r.STREAM_DRAW),r.uniformMatrix4fv(s.mvp,!1,u),r.uniform3fv(s.colour,d.colour),r.uniform1f(s.gain,d.gain),r.uniform1f(s.fade,d.fade??0),r.uniform1f(s.fadeFrom,d.fadeFrom??0),r.uniform1f(s.fadeTo,d.fadeTo??1),r.drawArrays(r.TRIANGLE_STRIP,0,c.length/3),r.bindVertexArray(null)},i=(u,c,d,m,p,h,f,b)=>{let y=m-c,x=p-d,A=Math.hypot(y,x)||1,g=-x/A*f,E=y/A*f;l(u,new Float32Array([c-g,d-E,h,c+g,d+E,h,m-g,p-E,h,m+g,p+E,h]),b)};return{rule(u,c,d,m,p,h,f){i(u,c,d,m,p,0,h,f)},ruleAtDepth(u,c,d,m,p,h,f,b){i(u,c,d,m,p,h,f,b)},curve(u,c,d,m){let p=c.length/2,h=new Float32Array(p*6);for(let f=0;f<p;f++){let b=c[f*2],y=c[f*2+1];h[f*6+0]=b,h[f*6+1]=y-d,h[f*6+2]=0,h[f*6+3]=b,h[f*6+4]=y+d,h[f*6+5]=0}l(u,h,m)},dispose(){r.deleteBuffer(o),r.deleteVertexArray(n),r.deleteProgram(t)}}}function Fn(e){return e<=.04045?e/12.92:Math.pow((e+.055)/1.055,2.4)}function mt(e){return e<=.0031308?e*12.92:1.055*Math.pow(e,1/2.4)-.055}var to=/^#?([0-9a-fA-F]{6})$/;function P(e){let r=to.exec(e.trim());if(!r)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(e)}`);let t=r[1];return[0,2,4].map(n=>Fn(parseInt(t.slice(n,n+2),16)/255))}function ft(e){return`#${e.map(t=>{let n=mt(Math.min(1,Math.max(0,t)));return Math.round(n*255).toString(16).padStart(2,"0")}).join("")}`}var he={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},pt=Object.freeze(Object.fromEntries(Object.keys(he).map(e=>[e,P(he[e])])));function ht(e,r,t){let n=Math.min(1,Math.max(0,t));return[e[0]+(r[0]-e[0])*n,e[1]+(r[1]-e[1])*n,e[2]+(r[2]-e[2])*n]}var Mn=.4;var bt=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${Mn.toFixed(2)}); }`,Et=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function xt(){let e=[];for(let r of Object.keys(he)){let t=he[r].toLowerCase(),n=ft(pt[r]).toLowerCase();n!==t&&e.push({key:r,expected:t,actual:n})}return e}function no(e){let r=[1/0,1/0,1/0],t=[-1/0,-1/0,-1/0];for(let n=0;n<e.length;n+=3)for(let o=0;o<3;o++){let a=e[n+o];a<r[o]&&(r[o]=a),a>t[o]&&(t[o]=a)}return e.length===0?{min:[0,0,0],max:[0,0,0]}:{min:r,max:t}}function Ln(e,r,t,n){let o=new Float32Array(e.length);for(let s=0;s<n.length;s+=3){let l=n[s],i=n[s+1],u=n[s+2],c=l*3,d=i*3,m=u*3,p=l*2,h=i*2,f=u*2,b=e[d]-e[c],y=e[d+1]-e[c+1],x=e[d+2]-e[c+2],A=e[m]-e[c],g=e[m+1]-e[c+1],E=e[m+2]-e[c+2],S=t[h]-t[p],v=t[h+1]-t[p+1],w=t[f]-t[p],C=t[f+1]-t[p+1],F=S*C-w*v;if(Math.abs(F)<1e-12)continue;let R=1/F,ie=(b*C-A*v)*R,Te=(y*C-g*v)*R,Ce=(x*C-E*v)*R;for(let ee of[c,d,m])o[ee]=o[ee]+ie,o[ee+1]=o[ee+1]+Te,o[ee+2]=o[ee+2]+Ce}let a=new Float32Array(e.length);for(let s=0;s<a.length;s+=3){let l=r[s],i=r[s+1],u=r[s+2],c=o[s],d=o[s+1],m=o[s+2],p=c*l+d*i+m*u;c-=l*p,d-=i*p,m-=u*p;let h=Math.hypot(c,d,m);h<1e-8&&(Math.abs(l)<.9?(c=0,d=-u,m=i):(c=-u,d=0,m=l),h=Math.hypot(c,d,m)||1),a[s]=c/h,a[s+1]=d/h,a[s+2]=m/h}return a}function _n(e,r){let t=new Float32Array(e.length);for(let n=0;n<r.length;n+=3){let o=r[n]*3,a=r[n+1]*3,s=r[n+2]*3,l=e[a]-e[o],i=e[a+1]-e[o+1],u=e[a+2]-e[o+2],c=e[s]-e[o],d=e[s+1]-e[o+1],m=e[s+2]-e[o+2],p=i*m-u*d,h=u*c-l*m,f=l*d-i*c;for(let b of[o,a,s])t[b]=t[b]+p,t[b+1]=t[b+1]+h,t[b+2]=t[b+2]+f}for(let n=0;n<t.length;n+=3){let o=Math.hypot(t[n],t[n+1],t[n+2]);o>0&&(t[n]=t[n]/o,t[n+1]=t[n+1]/o,t[n+2]=t[n+2]/o)}return t}function Ve(e,r,t,n,o){let{min:a,max:s}=no(e),l=n??_n(e,t);return{positions:e,normals:l,uvs:r,indices:t,min:a,max:s,tangents:o??Ln(e,l,r,t)}}function be(e=1,r=1,t=1){let n=e/2,o=r/2,a=t/2,s=[[[-n,-o,a],[n,-o,a],[n,o,a],[-n,o,a]],[[n,-o,-a],[-n,-o,-a],[-n,o,-a],[n,o,-a]],[[n,-o,a],[n,-o,-a],[n,o,-a],[n,o,a]],[[-n,-o,-a],[-n,-o,a],[-n,o,a],[-n,o,-a]],[[-n,o,a],[n,o,a],[n,o,-a],[-n,o,-a]],[[-n,-o,-a],[n,-o,-a],[n,-o,a],[-n,-o,a]]],l=new Float32Array(72),i=new Float32Array(48),u=new Uint16Array(36),c=0,d=0,m=0,p=0;for(let h of s){for(let[f,b,y]of h)l[c++]=f,l[c++]=b,l[c++]=y;i[d++]=0,i[d++]=0,i[d++]=1,i[d++]=0,i[d++]=1,i[d++]=1,i[d++]=0,i[d++]=1,u[m++]=p,u[m++]=p+1,u[m++]=p+2,u[m++]=p,u[m++]=p+2,u[m++]=p+3,p+=4}return Ve(l,i,u)}function yt(e=10,r=24){let t=Math.max(1,Math.floor(r)),n=(t+1)*(t+1),o=new Float32Array(n*3),a=new Float32Array(n*3),s=new Float32Array(n*2),l=new Uint16Array(t*t*6),i=0,u=0,c=0;for(let d=0;d<=t;d++)for(let m=0;m<=t;m++){let p=(m/t-.5)*e,h=(d/t-.5)*e;o[i]=p,o[i+1]=0,o[i+2]=h,a[i]=0,a[i+1]=1,a[i+2]=0,i+=3,s[u++]=m/t,s[u++]=d/t}for(let d=0;d<t;d++)for(let m=0;m<t;m++){let p=d*(t+1)+m,h=p+1,f=p+(t+1),b=f+1;l[c++]=p,l[c++]=f,l[c++]=h,l[c++]=h,l[c++]=f,l[c++]=b}return Ve(o,s,l,a)}function gt(e=.5,r=24,t=32){let n=Math.max(2,r),o=Math.max(3,t),a=(n+1)*(o+1),s=new Float32Array(a*3),l=new Float32Array(a*3),i=new Float32Array(a*2),u=new Uint16Array(n*o*6),c=0,d=0,m=0;for(let p=0;p<=n;p++){let h=p/n*Math.PI;for(let f=0;f<=o;f++){let b=f/o*Math.PI*2,y=Math.sin(h)*Math.cos(b),x=Math.cos(h),A=Math.sin(h)*Math.sin(b);s[c]=y*e,s[c+1]=x*e,s[c+2]=A*e,l[c]=y,l[c+1]=x,l[c+2]=A,c+=3,i[d++]=f/o,i[d++]=p/n}}for(let p=0;p<n;p++)for(let h=0;h<o;h++){let f=p*(o+1)+h,b=f+1,y=f+(o+1),x=y+1;u[m++]=f,u[m++]=b,u[m++]=y,u[m++]=b,u[m++]=x,u[m++]=y}return Ve(s,i,u,l)}function Tt(e=.5,r=.08,t=64,n=24){let o=Math.max(3,t),a=Math.max(3,n),s=[],l=[],i=[],u=[],c=[];for(let d=0;d<=o;d++){let m=d/o*Math.PI*2,p=Math.cos(m),h=Math.sin(m);for(let f=0;f<=a;f++){let b=f/a*Math.PI*2,y=Math.cos(b),x=Math.sin(b);s.push((e+r*y)*p,r*x,(e+r*y)*h),l.push(p*y,x,h*y),i.push(d/o,f/a),c.push(-h,0,p)}}for(let d=0;d<o;d++)for(let m=0;m<a;m++){let p=d*(a+1)+m,h=p+1,f=p+(a+1),b=f+1;u.push(p,h,f,h,b,f)}return Ve(new Float32Array(s),new Float32Array(i),new Uint16Array(u),new Float32Array(l),new Float32Array(c))}function Y(e){return e.indices.length/3}function ro(e){if(!Number.isFinite(e)||e===0)return"0";let r=e.toFixed(12).replace(/0+$/,"").replace(/\.$/,"");return r==="-0"?"0":r}function wn(e,r,t,n){let[o,a]=e,[s,l]=r,[i,u]=t,[c,d]=n,m=o-s+i-c,p=a-l+u-d;if(Math.abs(m)<1e-9&&Math.abs(p)<1e-9){let E=[s-o,c-o,o,l-a,d-a,a,0,0,1],S=E[0]*E[4]-E[1]*E[3];return Math.abs(S)<1e-9?null:E}let h=s-i,f=c-i,b=l-u,y=d-u,x=h*y-f*b;if(Math.abs(x)<1e-9)return null;let A=(m*y-f*p)/x,g=(h*p-m*b)/x;return[s-o+A*s,c-o+g*c,o,l-a+A*l,d-a+g*d,a,A,g,1]}function At(e,r,t,n,o,a){if(!(o>0)||!(a>0))return{refusal:"EMPTY_ELEMENT_BOX"};let l=[r.topLeft,r.topRight,r.bottomRight,r.bottomLeft].map(R=>I(e,R,t,n));if(l.some(R=>R.behind))return{refusal:"CORNER_BEHIND_CAMERA"};let i=l.map(R=>({x:R.sx,y:R.sy})),[u,c,d,m]=i,p=wn([u.x,u.y],[c.x,c.y],[d.x,d.y],[m.x,m.y]);if(!p)return{refusal:"DEGENERATE_ON_SCREEN"};let h=.5*(u.x*c.y-c.x*u.y+(c.x*d.y-d.x*c.y)+(d.x*m.y-m.x*d.y)+(m.x*u.y-u.x*m.y)),f=1/o,b=1/a,[y,x,A,g,E,S,v,w,C]=p;return{transform:`matrix3d(${[y*f,g*f,0,v*f,x*b,E*b,0,w*b,0,0,1,0,A,S,0,C].map(ro).join(", ")})`,matrix:p,screen:i,signedArea:h}}function Q(e){return"refusal"in e}function St(e,r,t,n,o,a,s=0){let l=Math.cos(a),i=Math.sin(a),u=(d,m)=>[e+l*d+i*s,t+m,r-i*d+l*s],c=n/2;return{topLeft:u(-c,o),topRight:u(c,o),bottomRight:u(c,0),bottomLeft:u(-c,0)}}var Dn=e=>[e.DEPTH_TEST,e.CULL_FACE,e.BLEND];function K(e){return[e.getParameter(e.FRAMEBUFFER_BINDING),e.getParameter(e.VIEWPORT),e.getParameter(e.DEPTH_WRITEMASK),Dn(e).map(r=>e.getParameter(r))]}function X(e,r){e.bindFramebuffer(e.FRAMEBUFFER,r[0]);let t=r[1];e.viewport(t[0]??0,t[1]??0,t[2]??0,t[3]??0),e.depthMask(r[2]),Dn(e).forEach((n,o)=>{r[3][o]?e.enable(n):e.disable(n)})}function le(e,r){for(let t=r-1;t>=0;t--)e.activeTexture(e.TEXTURE0+t),e.bindTexture(e.TEXTURE_2D,null),e.bindTexture(e.TEXTURE_3D,null);e.activeTexture(e.TEXTURE0)}function Pn(e){let r=Number.isFinite(e)?Math.max(1,Math.floor(e)):1,t=Math.max(1,2**Math.ceil(Math.log2(Math.ceil(Math.sqrt(r))))),n=Math.max(1,2**Math.ceil(Math.log2(Math.ceil(r/t))));return{width:t,height:n,slots:t*n}}function Un(e,r,t){let n=[],o=[];for(let a=0;a<e.length;a++){let s=Math.max(0,e[a].rate),l=Math.max(0,Math.min(.1,r)),i=s*l+(t[a]??0),u=Math.floor(i);n.push(u),o.push(i-u)}return{counts:n,carry:o}}var Nn=`
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
`,oo=`#version 300 es
precision highp float;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,ao=`#version 300 es
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
${Nn}
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
}`,so=`#version 300 es
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
}`,io=`#version 300 es
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
}`;function vt(e,r){let t=e.gl,{width:n,height:o,slots:a}=Pn(r);if(!t.getExtension("EXT_color_buffer_float"))return D("MISSING_EXTENSION","particle simulation needs EXT_color_buffer_float to write positions to a texture \u2014 without it the state textures never update and the field renders frozen");let s=e.compile(oo,ao);if("kind"in s)return s;let l=e.compile(so,io);if("kind"in l)return l;let i=E=>{let S=t.createTexture();return t.bindTexture(t.TEXTURE_2D,S),t.texImage2D(t.TEXTURE_2D,0,t.RGBA32F,n,o,0,t.RGBA,t.FLOAT,E),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),S},u=new Float32Array(a*4);for(let E=0;E<a;E++)u[E*4+3]=-1;let c=i(u),d=i(u),m=i(new Float32Array(a*4)),p=i(new Float32Array(a*4)),h=t.createFramebuffer(),f=t.createFramebuffer(),b=t.createVertexArray(),y=0,x=[],A=(E,S)=>(t.bindFramebuffer(t.FRAMEBUFFER,h),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,E,0),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT1,t.TEXTURE_2D,S,0),t.drawBuffers([t.COLOR_ATTACHMENT0,t.COLOR_ATTACHMENT1]),t.checkFramebufferStatus(t.FRAMEBUFFER)===t.FRAMEBUFFER_COMPLETE),g=(E,S)=>t.getUniformLocation(E,S);return{slots:a,width:n,height:o,step(E){let S=K(t),v=E.sources.slice(0,8),w=Un(v,E.dtSeconds,x);x=w.carry;let C=[],F=[],R=[],ie=0;for(let $=0;$<v.length&&ie<8;$++){let te=v[$],ot=Math.min(w.counts[$]??0,a);for(;ot>0&&ie<8;){let Ie=y,at=Math.min(ot,a-Ie);C.push(Ie,Ie+at-1,$,te.life),F.push(te.at[0],te.at[1],te.at[2],te.spread??0),R.push(te.velocity[0],te.velocity[1],te.velocity[2],0),y=(Ie+at)%a,ot-=at,ie++}}if(!A(d,p)){X(t,S);return}t.viewport(0,0,n,o),t.disable(t.DEPTH_TEST),t.disable(t.BLEND),t.useProgram(s),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,c),t.uniform1i(g(s,"uState"),0),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,m),t.uniform1i(g(s,"uVel"),1),t.uniform2f(g(s,"uSize"),n,o),t.uniform1f(g(s,"uDt"),Math.max(0,Math.min(.1,E.dtSeconds))),t.uniform1f(g(s,"uTime"),performance.now()/1e3%3600),t.uniform1f(g(s,"uNoiseScale"),E.noiseScale??.35),t.uniform1f(g(s,"uNoiseStrength"),E.noiseStrength??.6),t.uniform1f(g(s,"uDrag"),E.drag??.4);let Te=E.gravity??[0,0,0];t.uniform3f(g(s,"uGravity"),Te[0],Te[1],Te[2]),t.uniform1i(g(s,"uEmitCount"),ie),ie>0&&(t.uniform4fv(g(s,"uEmitRange"),new Float32Array(C)),t.uniform4fv(g(s,"uEmitPos"),new Float32Array(F)),t.uniform4fv(g(s,"uEmitVel"),new Float32Array(R)));let Ce=new Float32Array(8);for(let $=0;$<8;$++)Ce[$]=v[$]?.life??1;t.uniform1fv(g(s,"uLifes"),Ce),t.bindVertexArray(b),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null);let ee=c;c=d,d=ee;let eo=m;m=p,p=eo,le(t,2),X(t,S)},draw(E){let S=K(t),v=E.sources.slice(0,8);t.useProgram(l),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,c),t.uniform1i(g(l,"uState"),0),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,m),t.uniform1i(g(l,"uVel"),1),t.uniform2f(g(l,"uSize"),n,o),t.uniformMatrix4fv(g(l,"uViewProj"),!1,E.viewProj),t.uniform1f(g(l,"uPointScale"),E.pointScale??28);let w=new Float32Array(24),C=new Float32Array(8);for(let F=0;F<8;F++){let R=v[F];w[F*3]=R?R.colour[0]:0,w[F*3+1]=R?R.colour[1]:0,w[F*3+2]=R?R.colour[2]:0,C[F]=R?R.life:1}t.uniform3fv(g(l,"uColours"),w),t.uniform1fv(g(l,"uLifes"),C),t.enable(t.BLEND),t.blendFunc(t.ONE,t.ONE),t.enable(t.DEPTH_TEST),t.depthMask(!1),t.bindVertexArray(b),t.drawArrays(t.POINTS,0,a),t.bindVertexArray(null),le(t,2),X(t,S)},readState(){t.bindFramebuffer(t.FRAMEBUFFER,f),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,c,0);let E=new Float32Array(a*4);return t.checkFramebufferStatus(t.FRAMEBUFFER)===t.FRAMEBUFFER_COMPLETE&&t.readPixels(0,0,n,o,t.RGBA,t.FLOAT,E),t.bindFramebuffer(t.FRAMEBUFFER,null),E},dispose(){for(let E of[c,d,m,p])t.deleteTexture(E);t.deleteFramebuffer(h),t.deleteFramebuffer(f),t.deleteVertexArray(b),t.deleteProgram(s),t.deleteProgram(l)}}}var Rt=["minimum","reduced","full"],lo={full:{dprScale:2,ao:!0,aoScale:.5,dof:!0,shadowMapSize:1536,shadowTaps:9,particleCapacity:4096,volumeMaxSteps:128,volumeLightSteps:6},reduced:{dprScale:2,ao:!0,aoScale:.5,dof:!1,shadowMapSize:1024,shadowTaps:9,particleCapacity:2048,volumeMaxSteps:96,volumeLightSteps:4},minimum:{dprScale:1,ao:!1,aoScale:.5,dof:!1,shadowMapSize:512,shadowTaps:1,particleCapacity:512,volumeMaxSteps:48,volumeLightSteps:0}};function He(e,r){let t=Number.isFinite(r)&&r>0?r:1024,o=t*(e==="full"?1:e==="reduced"?.5:.25),a=2**Math.round(Math.log2(o));return Math.max(256,Math.min(t,a))}function Ft(e){return{tier:e,...lo[e]}}var Mt=89,Lt=Math.PI/180;function ze(e){let r=Math.max(-Mt,Math.min(Mt,e.elevationDeg))*Lt,t=e.azimuthDeg*Lt,n=Math.max(1e-4,e.distance),o=Math.sin(r)*n,a=Math.cos(r)*n;return[e.target[0]+Math.sin(t)*a,e.target[1]+o,e.target[2]+Math.cos(t)*a]}function $e(e,r){let t=ze(e),n=e.near??Math.max(.01,e.distance/100),o=e.far??Math.max(n+1,e.distance*8),a=ut((e.fovDeg??38)*Lt,Math.max(.001,r),n,o),s=Ge(t,e.target,[0,1,0]);return Be(a,s)}function _t(e,r,t){let n=Ae(e.direction),o=e.extent??Math.max(.1,t*1.35),a=Math.max(1,t*2),s=[r[0]-n[0]*a,r[1]-n[1]*a,r[2]-n[2]*a],l=Math.abs(n[1])>.99?[0,0,1]:[0,1,0],i=Ge(s,r,l),u=ct(-o,o,-o,o,.01,a+t*2+o);return Be(u,i)}function wt(e,r){let t=ke([r[0],r[1],r[2]],[e[0],e[1],e[2]]);return Math.hypot(t[0],t[1],t[2])/2}function Dt(e,r){return[(e[0]+r[0])/2,(e[1]+r[1])/2,(e[2]+r[2])/2]}function Pt(e,r,t){let{gl:n}=e,o=Math.max(1,Math.floor(r)),a=Math.max(1,Math.floor(t)),s=n.createFramebuffer(),l=n.createTexture(),i=n.createTexture();if(!s||!l||!i)return D("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let u=e.hdr?n.RGBA16F:n.RGBA8,c=e.hdr?n.HALF_FLOAT:n.UNSIGNED_BYTE,d=()=>{n.bindTexture(n.TEXTURE_2D,l),n.texImage2D(n.TEXTURE_2D,0,u,o,a,0,n.RGBA,c,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.bindTexture(n.TEXTURE_2D,i),n.texImage2D(n.TEXTURE_2D,0,n.DEPTH_COMPONENT24,o,a,0,n.DEPTH_COMPONENT,n.UNSIGNED_INT,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.bindFramebuffer(n.FRAMEBUFFER,s),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,l,0),n.framebufferTexture2D(n.FRAMEBUFFER,n.DEPTH_ATTACHMENT,n.TEXTURE_2D,i,0),n.bindFramebuffer(n.FRAMEBUFFER,null)};d(),n.bindFramebuffer(n.FRAMEBUFFER,s);let m=n.checkFramebufferStatus(n.FRAMEBUFFER);return n.bindFramebuffer(n.FRAMEBUFFER,null),m!==n.FRAMEBUFFER_COMPLETE?D("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${m.toString(16)}). Depth texture support may be missing.`):{framebuffer:s,texture:l,depthTexture:i,get width(){return o},get height(){return a},bind(){n.bindFramebuffer(n.FRAMEBUFFER,s),n.viewport(0,0,o,a)},resize(p,h){let f=Math.max(1,Math.floor(p)),b=Math.max(1,Math.floor(h));f===o&&b===a||(o=f,a=b,d())},dispose(){n.deleteFramebuffer(s),n.deleteTexture(l),n.deleteTexture(i)}}}function Ut(e,r=1024){let{gl:t}=e,n=Math.max(256,Math.min(2048,Math.floor(r))),o=t.createFramebuffer(),a=t.createTexture();if(!o||!a)return D("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");t.bindTexture(t.TEXTURE_2D,a),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,n,n,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,o),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,a,0);let s=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),s!==t.FRAMEBUFFER_COMPLETE?D("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${s.toString(16)}).`):{framebuffer:o,depthTexture:a,size:n,bind(){t.bindFramebuffer(t.FRAMEBUFFER,o),t.viewport(0,0,n,n)},dispose(){t.deleteFramebuffer(o),t.deleteTexture(a)}}}var Ct=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,Nt={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function Cn(e,r,t={}){let n=t.zenith??Nt.zenith,o=t.horizon??Nt.horizon,a=t.ground??Nt.ground;e.uniform3f(e.getUniformLocation(r,"uSkyZenith"),n[0],n[1],n[2]),e.uniform3f(e.getUniformLocation(r,"uSkyHorizon"),o[0],o[1],o[2]),e.uniform3f(e.getUniformLocation(r,"uSkyGround"),a[0],a[1],a[2])}var da=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${Ct}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;var In=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,It=`#version 300 es
precision highp float;
void main(){}`,uo=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,On=`#version 300 es
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
}`,Bn=`#version 300 es
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
${Ct}

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
}`;function q(e,r){let{gl:t}=e,n=t.createVertexArray(),o=t.createBuffer(),a=t.createBuffer(),s=t.createBuffer(),l=t.createBuffer();return!n||!o||!a||!s||!l?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(t.bindVertexArray(n),t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,r.positions,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,a),t.bufferData(t.ARRAY_BUFFER,r.normals,t.STATIC_DRAW),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,s),t.bufferData(t.ARRAY_BUFFER,r.tangents,t.STATIC_DRAW),t.enableVertexAttribArray(2),t.vertexAttribPointer(2,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,l),t.bufferData(t.ELEMENT_ARRAY_BUFFER,r.indices,t.STATIC_DRAW),t.bindVertexArray(null),{vao:n,indexCount:r.indices.length,indexType:r.indices instanceof Uint32Array?t.UNSIGNED_INT:t.UNSIGNED_SHORT,dispose(){t.deleteVertexArray(n),t.deleteBuffer(o),t.deleteBuffer(a),t.deleteBuffer(s),t.deleteBuffer(l)}})}function Ot(e){let{gl:r}=e,t=e.compile(In,It);if("kind"in t)return t;let n=e.compile(On,Bn);if("kind"in n)return n;let o=e.compile(uo,It);if("kind"in o)return o;let a=(s,l)=>r.getUniformLocation(s,l);return{shadowPass(s,l,i,u){let c=K(r),d=u??(()=>{});i.bind(),d("shadow.bind"),r.clear(r.DEPTH_BUFFER_BIT),r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.FRONT),r.useProgram(t),d("useProgram(shadow)"),r.uniformMatrix4fv(a(t,"uLightVP"),!1,s),d("uLightVP");for(let m of l)r.uniformMatrix4fv(a(t,"uModel"),!1,m.model),d("shadow uModel"),r.bindVertexArray(m.mesh.vao),d("shadow bindVAO"),r.drawElements(r.TRIANGLES,m.mesh.indexCount,m.mesh.indexType,0),d("shadow drawElements");r.bindVertexArray(null),r.cullFace(r.BACK),X(r,c)},depthPrepass(s,l){let i=K(r);r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.colorMask(!1,!1,!1,!1),r.useProgram(o),r.uniformMatrix4fv(a(o,"uViewProj"),!1,s);for(let u of l)r.uniformMatrix4fv(a(o,"uModel"),!1,u.model),r.bindVertexArray(u.mesh.vao),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0);r.bindVertexArray(null),r.colorMask(!0,!0,!0,!0),X(r,i)},draw(s){let l=K(r),i=s.onStep??(()=>{});if(r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.useProgram(n),r.uniformMatrix4fv(a(n,"uViewProj"),!1,s.viewProj),i("uViewProj"),r.uniform3fv(a(n,"uEye"),s.eye),i("uEye"),r.uniform3fv(a(n,"uLightDir"),s.lightDir),i("uLightDir"),r.uniform3fv(a(n,"uLightColour"),s.lightColour),i("uLightColour"),r.uniform1f(a(n,"uAmbientGain"),s.ambientGain??1),i("uAmbientGain"),s.fog&&s.fog.density>0){r.uniform1f(a(n,"uFogDensity"),s.fog.density),r.uniform1f(a(n,"uFogHeight"),s.fog.height),r.uniform1f(a(n,"uFogFloor"),s.fog.floor??0);let u=s.fog.colour;u==="sky"?r.uniform3f(a(n,"uFogColour"),-1,-1,-1):r.uniform3f(a(n,"uFogColour"),u[0],u[1],u[2]),i("fog")}else r.uniform1f(a(n,"uFogDensity"),0);Cn(r,n,s.sky),i("bindSky"),s.ao&&s.screenSize?(r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,s.ao),r.uniform1i(a(n,"uAO"),1),r.uniform2f(a(n,"uScreenSize"),s.screenSize[0],s.screenSize[1]),r.uniform1f(a(n,"uAOEnabled"),1)):r.uniform1f(a(n,"uAOEnabled"),0),i("bindAO"),r.uniformMatrix4fv(a(n,"uLightVP"),!1,s.lightVP),i("lit uLightVP"),s.shadow?(r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,s.shadow.depthTexture),r.uniform1i(a(n,"uShadowMap"),0),r.uniform1f(a(n,"uShadowTexel"),1/s.shadow.size),r.uniform1f(a(n,"uShadowStrength"),s.shadowStrength??1)):r.uniform1f(a(n,"uShadowStrength"),0);for(let u of s.draws)r.uniformMatrix4fv(a(n,"uModel"),!1,u.model),r.uniformMatrix3fv(a(n,"uNormalMat"),!1,u.normalMat),i("uNormalMat"),r.uniform3fv(a(n,"uBaseColour"),u.material.baseColour),i("uBaseColour"),r.uniform1f(a(n,"uRoughness"),u.material.roughness),r.uniform1f(a(n,"uMetalness"),u.material.metalness),r.uniform1f(a(n,"uAnisotropy"),u.material.anisotropy??0),r.bindVertexArray(u.mesh.vao),i("lit bindVAO"),r.drawElements(r.TRIANGLES,u.mesh.indexCount,u.mesh.indexType,0),i("lit drawElements");r.bindVertexArray(null),le(r,2),X(r,l)},dispose(){r.deleteProgram(t),r.deleteProgram(n),r.deleteProgram(o)}}}var Bt=`
uniform sampler2D uDepth;
uniform vec2 uNearFar;

float linearDepthAt(vec2 uv) {
  float d = texture(uDepth, uv).r * 2.0 - 1.0;
  float n = uNearFar.x, f = uNearFar.y;
  return (2.0 * n * f) / (f + n - d * (f - n));
}`,Gn=`
uniform float uTanHalfFov;
uniform float uAspect;

vec3 viewPosAt(vec2 uv) {
  float z = linearDepthAt(uv);
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x * uTanHalfFov * uAspect * z, ndc.y * uTanHalfFov * z, -z);
}`,Vn=Bt+Gn,kn=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,co=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${Vn}

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
}`,mo=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${Bt}

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
}`;function kt(e,r,t){let{gl:n}=e,o=e.compile(kn,co);if("kind"in o)return o;let a=e.compile(kn,mo);if("kind"in a)return a;let s=Math.max(1,r>>1),l=Math.max(1,t>>1),i=()=>{let f=n.createFramebuffer(),b=n.createTexture();return!f||!b?null:{fb:f,tex:b}},u=i(),c=i();if(!u||!c)return D("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let d=()=>{for(let f of[u,c])n.bindTexture(n.TEXTURE_2D,f.tex),n.texImage2D(n.TEXTURE_2D,0,n.R8,s,l,0,n.RED,n.UNSIGNED_BYTE,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.bindFramebuffer(n.FRAMEBUFFER,f.fb),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,f.tex,0);n.bindFramebuffer(n.FRAMEBUFFER,null)};d(),n.bindFramebuffer(n.FRAMEBUFFER,u.fb);let m=n.checkFramebufferStatus(n.FRAMEBUFFER);if(n.bindFramebuffer(n.FRAMEBUFFER,null),m!==n.FRAMEBUFFER_COMPLETE)return D("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${m.toString(16)}).`);let p=(f,b,y,x,A)=>{n.activeTexture(n.TEXTURE0+A),n.bindTexture(n.TEXTURE_2D,b),n.uniform1i(n.getUniformLocation(f,"uDepth"),A),n.uniform2f(n.getUniformLocation(f,"uNearFar"),y,x)},h=(f,b,y,x,A,g,E)=>{p(f,b,y,x,E),n.uniform1f(n.getUniformLocation(f,"uTanHalfFov"),Math.tan(A*Math.PI/360)),n.uniform1f(n.getUniformLocation(f,"uAspect"),g)};return{get texture(){return u.tex},get width(){return s},get height(){return l},compute(f){let b=K(n);n.disable(n.DEPTH_TEST),n.depthMask(!1),n.disable(n.BLEND),n.disable(n.CULL_FACE),n.bindFramebuffer(n.FRAMEBUFFER,u.fb),n.viewport(0,0,s,l),n.useProgram(o),h(o,f.depthTexture,f.near,f.far,f.fovDeg,f.aspect,0),n.uniform2f(n.getUniformLocation(o,"uTexel"),1/s,1/l),n.uniform1f(n.getUniformLocation(o,"uRadius"),f.radius??.55),n.uniform1f(n.getUniformLocation(o,"uStrength"),f.strength??1.15),n.uniform1f(n.getUniformLocation(o,"uBias"),f.bias??.035),e.blit(o);for(let[y,x,A]of[[u,c,[1,0]],[c,u,[0,1]]])n.bindFramebuffer(n.FRAMEBUFFER,x.fb),n.viewport(0,0,s,l),n.useProgram(a),p(a,f.depthTexture,f.near,f.far,0),n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,y.tex),n.uniform1i(n.getUniformLocation(a,"uAO"),1),n.uniform2f(n.getUniformLocation(a,"uTexel"),1/s,1/l),n.uniform2f(n.getUniformLocation(a,"uDir"),A[0],A[1]),e.blit(a);le(n,2),X(n,b)},resize(f,b){let y=Math.max(1,f>>1),x=Math.max(1,b>>1);y===s&&x===l||(s=y,l=x,d())},dispose(){n.deleteProgram(o),n.deleteProgram(a);for(let f of[u,c])n.deleteFramebuffer(f.fb),n.deleteTexture(f.tex)}}}var fo=`
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
`;function ne(e){return String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function Hn(e){let r=document.createElement("style");r.textContent=fo,document.head.appendChild(r);let t=document.createElement("section");t.id="lcx-fallback",t.setAttribute("aria-label",`${e.title} \u2014 flat view`),t.setAttribute("tabindex","-1"),document.getElementById("log")?.setAttribute("aria-hidden","true");let n=(a,s)=>a===null?`<td class="absent${s?" n":""}">absent</td>`:`<td class="${s?"n":""}">${ne(a)}</td>`;t.innerHTML=`<h2>${ne(e.title)} \u2014 flat view</h2><p class="reads">${ne(e.readsAs)}</p>`+(e.notices??[]).map(a=>`<p class="notice">${ne(a)}</p>`).join("")+'<div id="lcx-refusal" role="alert"></div>'+(e.html?`<div class="surface">${e.html}</div>`:`<table><caption>${ne(e.title)} \u2014 flat view</caption><thead><tr>`+e.columns.map(a=>`<th scope="col" class="${a.numeric?"n":""}">${ne(a.label)}</th>`).join("")+"</tr></thead><tbody>"+e.rows.map(a=>"<tr>"+e.columns.map(s=>n(a[s.key]??null,!!s.numeric)).join("")+"</tr>").join("")+"</tbody></table>"),document.body.appendChild(t);function o(a,s){let l=document.getElementById("lcx-refusal");l&&(l.innerHTML=`<p class="refusal"><strong>${ne(a)}</strong> \u2014 ${ne(s)} The measurements below are unaffected.</p>`),delete t.dataset.rendered;for(let i of Array.from(document.querySelectorAll("canvas")))i.style.display="none";t.focus({preventScroll:!0})}return document.addEventListener("webglcontextlost",a=>{a.preventDefault(),o("CONTEXT_LOST","The GPU dropped the WebGL context for this page mid-session.")},!0),{markRendered(){t.dataset.rendered="1"},showRefusal:o}}var de=new URLSearchParams(location.search),ln=de.get("settle")!=="0",un=de.get("particles")!=="0",cn=Rt.includes(de.get("tier")??"")?de.get("tier"):"full",zn=Ft(cn),hr=de.get("fog")!=="0",Xt=[],br=[];function Er(e,r,t,n){let o=de.get(e);if(o===null)return r;let a=Number(o);if(!Number.isFinite(a))return Xt.push(`${e}=${o}`),r;let s=Math.max(t,Math.min(n,a));return s!==a&&br.push(`${e}=${o} used as ${s}`),s}var Le=Er("scale",1,1,3),Wt=Math.trunc(Er("frames",300,1,2e4)),G=1200*Le,B=720*Le,xe=document.getElementById("c");xe.width=G;xe.height=B;var dn=document.getElementById("log");function _e(e){document.title="REFUSED",dn.textContent=e;let[r,...t]=e.split(":");throw xr?.showRefusal(r?.trim()??"REFUSED",t.join(":").trim()||e),new Error(e)}var xr=null;function k(e,r){return"kind"in r&&_e(`${e}: ${r.code} \u2014 ${r.reason} ${r.detail??""}`),r}var et=["SOURCED","QUALIFIED","DILIGENCE","TERMS","SIGNED"],Re=[{name:"SABLE TREASURY",stage:"SOURCED",valueUsd:24e4,daysSinceUpdate:63,known:"OBSERVED"},{name:"PRAXIS DESK",stage:"SOURCED",valueUsd:null,daysSinceUpdate:9,known:"VALUE_ABSENT"},{name:"CASTOR LABS",stage:"SOURCED",valueUsd:15e4,daysSinceUpdate:34,known:"OBSERVED"},{name:"LUMEN CUSTODY",stage:"SOURCED",valueUsd:95e3,daysSinceUpdate:17,known:"OBSERVED"},{name:"TIBER CLEARING",stage:"QUALIFIED",valueUsd:31e4,daysSinceUpdate:4,known:"OBSERVED"},{name:"VANTA MARKETS",stage:"QUALIFIED",valueUsd:62e4,daysSinceUpdate:28,known:"OBSERVED"},{name:"\u2014",stage:"QUALIFIED",valueUsd:null,daysSinceUpdate:null,known:"WITHHELD"},{name:"HELIOS EXCHANGE",stage:"DILIGENCE",valueUsd:175e4,daysSinceUpdate:52,known:"OBSERVED"},{name:"KESTREL FUND",stage:"DILIGENCE",valueUsd:43e4,daysSinceUpdate:11,known:"OBSERVED"},{name:"MERIDIAN PAY",stage:"TERMS",valueUsd:26e5,daysSinceUpdate:41,known:"OBSERVED"},{name:"NORDIC CUSTODY",stage:"TERMS",valueUsd:88e4,daysSinceUpdate:6,known:"OBSERVED"},{name:"ATLAS OTC",stage:"SIGNED",valueUsd:42e5,daysSinceUpdate:3,known:"OBSERVED"}],$n=Re.flatMap(e=>{let r=[],t=(n,o)=>{o!==null&&(Number.isFinite(o)?o<0&&r.push(`${e.name}: ${n} is negative (${o})`):r.push(`${e.name}: ${n} is ${o}`))};return t("valueUsd",e.valueUsd),t("daysSinceUpdate",e.daysSinceUpdate),e.known==="OBSERVED"&&(e.valueUsd===null||e.daysSinceUpdate===null)&&r.push(`${e.name}: state is OBSERVED but a field is absent`),e.known==="WITHHELD"&&(e.valueUsd!==null||e.daysSinceUpdate!==null)&&r.push(`${e.name}: state is WITHHELD but a field carries a value`),e.known==="VALUE_ABSENT"&&e.valueUsd!==null&&r.push(`${e.name}: state is VALUE_ABSENT but a value is present`),r}),j=45,yr=Hn({title:"E3 \xB7 The Pipeline \u2014 deals by stage, package value and days since update",readsAs:`In the rendered view a deal is an object: its size is package value, its position along the channel is the gates it has cleared, and its HEIGHT is movement \u2014 a deal untouched for ${j} days rests on the floor of the channel. That is what this table cannot do. Every figure below is here, and sorting by any one column hides the other two, which is why the quantity that matters \u2014 value that has cleared diligence and then stopped \u2014 takes two sorts and arithmetic here and one look there.`,notices:[`SYNTHETIC DEALS \u2014 ${Re.length} hand-authored records. The shape is deliberate (a funnel, value skewed to two names, the two largest late-stage deals stalled); the values are not measurements.`,"One deal was never priced and one is in a compartment that may not be read. Both are ABSENT below rather than blank or zero, the STATE column separates them, and every aggregate in the rendered view excludes both rather than estimating them."],columns:[{key:"name",label:"Deal"},{key:"stage",label:"Stage"},{key:"state",label:"State"},{key:"value",label:"Package value (USD)",numeric:!0},{key:"days",label:"Days since update",numeric:!0},{key:"movement",label:"Movement"}],rows:Re.map(e=>({name:e.known==="WITHHELD"?"withheld":e.name,stage:e.stage,state:e.known,value:e.valueUsd,days:e.daysSinceUpdate,movement:e.daysSinceUpdate===null?null:e.daysSinceUpdate>=j?"stalled \u2014 on the floor":e.daysSinceUpdate>=.6*j?"stalled":"moving"}))});xr=yr;$n.length>0&&_e(`INVALID_DEAL_DATA: ${$n.join("; ")} \u2014 a value that is present must be a finite non-negative number, and the state column must agree with which fields are present. The channel was not drawn rather than drawn from a value that cannot be a package value.`);Xt.length>0&&_e(`BAD_PARAM: ${Xt.join(", ")} \u2014 not a number, so the channel was refused rather than drawn from a nonsensical value. Every deal below is unaffected; correct the URL and reload.`);de.get("refuse")==="1"&&_e("FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. The channel is not being drawn.");var Ye=it(xe,{alpha:!1});st(Ye)||_e(`stage: ${Ye.code} \u2014 ${Ye.reason}`);var _=Ye,T=_.gl,po=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,ho=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${bt}
${Et}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,bo=k("present",_.compile(po,ho)),Gt=k("lit",Ot(_)),Xe=k("target",Pt(_,G,B)),jt=k("shadow",Ut(_,He(cn,1536))),Xn=k("ao",kt(_,G,B)),Ee=k("strokes",dt(_)),ye=.86,gr=.46,Eo=Math.max(...Re.map(e=>e.valueUsd??0)),xo=e=>gr*Math.cbrt(e/Eo),me=.11,M=1.45,mn=2.2,Tr=-10.6,we=Tr-2.6,ge=1.7,Ar=ge-we,Yt=(ge+we)/2,Z=1.15,tt=e=>Tr+e*mn,yo=.58,go=.38,Wn=.6,Qt=.66,Kt=.3,jn=.16,Sr=e=>e%2===0?jn:jn+Kt+.06,Qe=.45,qt=190,vr=13.5,Fe=hr?Math.log(2)/vr:0,Yn="#0C1322",Rr=90,fn=800,Ke=1.4,pn=2048,Fr=150,Mr="#2C6BFF",Lr="#C9552B",De="#E0A94A",_r="#5C6880",wr=yt(2*M,40),Dr=be(.18,1.25,Ar),Pr=be(.1,Z,.1),Ur=be(2*M,.05,.13),Nr=be(1,1,1),Cr=Tt(me*1.25,me*.34,40,14),Ir=gt(me,20,28),To=k("floor",q(_,wr)),Qn=k("wall",q(_,Dr)),Kn=k("post",q(_,Pr)),Ao=k("sill",q(_,Ur)),So=k("deal",q(_,Nr)),vo=k("absent",q(_,Cr)),Ro=k("withheld",q(_,Ir)),re=new Float32Array([1,0,0,0,1,0,0,0,1]),Fo=new Float32Array([1,0,0,0,0,1,0,-1,0]),oe=(e,r,t,n=1)=>{let o=Se();return o[0]=n,o[5]=n,o[10]=n,o[12]=e,o[13]=r,o[14]=t,o},Mo=(e,r,t)=>{let n=Se();return n[5]=0,n[6]=1,n[9]=-1,n[10]=0,n[12]=e,n[13]=r,n[14]=t,n},Or=.1,Br=40,qe={target:[0,.7,-5.2],distance:8.2,azimuthDeg:9,elevationDeg:14,fovDeg:35,near:Or,far:Br},H=ze(qe),qn=new Map,L=Re.map((e,r)=>{let t=et.indexOf(e.stage),n=qn.get(e.stage)??0;qn.set(e.stage,n+1);let o=tt(t)+yo+n*go,a=n%2===0?-Wn:Wn,s=e.valueUsd===null?null:xo(e.valueUsd),l=e.known==="VALUE_ABSENT"?"MASS_REFUSED_VALUE_NEVER_MEASURED":e.known==="WITHHELD"?"MASS_REFUSED_VALUE_WITHHELD":null,i=e.daysSinceUpdate===null?null:e.daysSinceUpdate/j,u=i===null?null:ln?Math.min(1,i):0,c=e.daysSinceUpdate===null?"SETTLE_REFUSED_LAST_TOUCH_WITHHELD":null,d=s!==null?s/2:me,m=u===null?ye+.3:(1-u)*ye,p=m+d;return{d:e,i:r,stageIndex:t,slot:n,x:a,z:o,edge:s,settle:u,settleClamped:i!==null&&i>1,baseY:m,centreY:p,topY:m+2*d,massRefusal:l,settleRefusal:c,distance:Math.hypot(a-H[0],p-H[1],o-H[2])}}),Lo=L.filter(e=>{let r=e.edge!==null?e.edge/2:me,t=e.z-tt(e.stageIndex);return t-r<.05||t+r>mn-.05}).map(e=>e.d.name),_o=e=>L.filter(r=>r.stageIndex>=e&&r.d.known==="OBSERVED"&&r.d.valueUsd!==null).reduce((r,t)=>r+(t.d.valueUsd??0),0),O=et.map((e,r)=>{let t=tt(r),n=_o(r),o=n/Rr,a=o/fn,s=Math.min(mn,ge-t-.2),l=Math.max(.2,s/Ke);return{label:e,index:r,z:t,clearedUsd:n,usdPerDay:o,ratePerSec:a,life:l,linearDensityPerMetre:a/Ke}}),wo=[.1,.3,1.15],kr=O.map(e=>({at:[0,.34,e.z+.06],rate:e.ratePerSec,velocity:[0,0,Ke],spread:.26,colour:wo,life:e.life})),ue=un?vt(_,pn):null,V=ue!==null&&!("kind"in ue)?ue:null,Zt=ue!==null&&"kind"in ue?`${ue.code} \u2014 ${ue.reason}`:un?null:"DISABLED_BY_PARAM",Do=Math.round(O.reduce((e,r)=>e+r.ratePerSec*r.life,0)),Zn=O.reduce((e,r)=>e+r.ratePerSec,0),Jn=Zn>0?(V?.slots??pn)/Zn:1/0,er=Math.max(...O.map(e=>e.life)),Gr={sources:kr,dtSeconds:1/60,noiseScale:.55,noiseStrength:.12,drag:.5},tr={baseColour:P("#1E2A42"),roughness:.6,metalness:.03},Vt={baseColour:P("#31415C"),roughness:.36,metalness:.2},Vr=oe(0,0,Yt,1);Vr[10]=Ar/(2*M);var ce=[{mesh:To,model:Vr,normalMat:re,material:{baseColour:P("#22304A"),roughness:.82,metalness:0}},{mesh:Qn,model:oe(-(M+.09),.625,Yt),normalMat:re,material:tr},{mesh:Qn,model:oe(M+.09,.625,Yt),normalMat:re,material:tr}];for(let e of O)ce.push({mesh:Kn,model:oe(-(M+.05),Z/2,e.z),normalMat:re,material:Vt},{mesh:Kn,model:oe(M+.05,Z/2,e.z),normalMat:re,material:Vt},{mesh:Ao,model:oe(0,.025,e.z),normalMat:re,material:Vt});for(let e of L)if(e.d.known==="WITHHELD")ce.push({mesh:Ro,model:oe(e.x,e.centreY,e.z),normalMat:re,material:{baseColour:P(_r),roughness:.55,metalness:.25}});else if(e.edge===null)ce.push({mesh:vo,model:Mo(e.x,e.centreY,e.z),normalMat:Fo,material:{baseColour:P(De),roughness:.44,metalness:.1}});else{let r=ht(P(Mr),P(Lr),e.settle??0);ce.push({mesh:So,model:oe(e.x,e.centreY,e.z,e.edge),normalMat:re,material:{baseColour:r,roughness:.34+.16*(e.settle??0),metalness:.06}})}var Hr=[-.62,-.38,-.69],nr=[-2,0,we],rr=[2,1.9,ge],or=_t({direction:Hr,colour:[1,1,1],extent:9.6},Dt(nr,rr),wt(nr,rr)),Po=Y(wr)+2*Y(Dr)+O.length*(2*Y(Pr)+Y(Ur))+L.filter(e=>e.d.known==="OBSERVED").length*Y(Nr)+L.filter(e=>e.d.known==="VALUE_ABSENT").length*Y(Cr)+L.filter(e=>e.d.known==="WITHHELD").length*Y(Ir),z=$e(qe,G/B),U=G/Le,N=B/Le,hn=e=>Fe<=0?0:1-Math.exp(-Fe*e),Me=e=>e>=1e6?`$${(e/1e6).toFixed(2)}M`:e>=1e4?`$${Math.round(e/1e3)}k`:`$${(e/1e3).toFixed(1)}k`,Ht=[],ar=(e,r,t)=>{let n=0;for(let o=0;o<4;o++){let a=e[o],s=e[(o+1)%4],l=(s.x-a.x)*(t-a.y)-(s.y-a.y)*(r-a.x);if(Math.abs(l)<1e-9)continue;let i=l>0?1:-1;if(n===0)n=i;else if(i!==n)return!1}return!0},zr=e=>{let r=I(z,[e.x,e.baseY,e.z],U,N),t=I(z,[e.x,e.topY,e.z],U,N);return r.behind||t.behind?0:Math.abs(r.sy-t.sy)},$r=e=>{let r=I(z,[e.x,e.centreY,e.z],U,N);if(r.behind)return!1;let t=I(z,[e.x,e.topY,e.z],U,N),n=Math.max(6,Math.abs(r.sy-t.sy));return r.sx>n&&r.sx<U-n&&r.sy>n&&r.sy<N-n},Ze=e=>{let r=I(z,[e.x,e.centreY,e.z],U,N);return r.behind?null:r.sy},bn=e=>{if(e.settle===null)return null;let r=e.edge!==null?e.edge/2:me,t=I(z,[e.x,e.baseY+r,e.z],U,N),n=I(z,[e.x,ye+r,e.z],U,N);return t.behind||n.behind?null:Math.abs(t.sy-n.sy)},nt=[...L].sort((e,r)=>e.distance-r.distance).map(e=>{let r=e.d.known==="WITHHELD",t=e.distance>vr,n=Math.round(Qt*qt),o=Math.round(Kt*qt),a=e.x<0?e.x-Qe:e.x+Qe,s=Math.atan2(H[0]-a,H[2]-e.z),l=St(a,e.z,e.topY+Sr(e.slot),Qt,Kt,s,0),i=At(z,l,U,N,n,o),u=Q(i)?i.refusal:null,c=!Q(i)&&i.signedArea<=0,d=Q(i)?0:Math.max(Math.hypot(i.screen[0].x-i.screen[1].x,i.screen[0].y-i.screen[1].y),Math.hypot(i.screen[3].x-i.screen[2].x,i.screen[3].y-i.screen[2].y)),m=d<26,p=Q(i)?!1:i.screen.every(y=>y.x<0||y.x>U||y.y<0||y.y>N),h=Q(i)?0:i.screen.filter(y=>Ht.some(x=>ar(x,y.x,y.y))).length+Ht.reduce((y,x)=>y+x.filter(A=>ar(i.screen.map(g=>({x:g.x,y:g.y})),A.x,A.y)).length,0),f=h>=2,b=!u&&!c&&!r&&!t&&!m&&!p&&!f;return b&&!Q(i)&&Ht.push(i.screen.map(y=>({x:y.x,y:y.y}))),{p:e,proj:i,shown:b,ew:n,eh:o,refusal:u,backFacing:c,withheld:r,tooFar:t,edgeOn:m,offFrame:p,occluded:f,widthPx:d,coveredCorners:h}}),Uo=nt.filter(e=>e.shown).map(e=>e.p),We={colour:P("#4E8CFF"),gain:1.5},No={colour:P("#7FB2FF"),gain:1.1},Co={colour:P("#7FB2FF"),gain:.45},ae=H[0]>=0?1:-1,Xr=ae*(M+.2),Wr=ae*(M+.48),Io=ae*(M+.56),En=tt(3),Oo=.055,xn=[0,20,j].map(e=>({days:e,y:(1-Math.min(1,e/j))*ye+Oo,label:e>=j?`${e}d+`:`${e}d`}));function Jt(){let e=$e(qe,G/B);V&&V.step(Gr),Gt.shadowPass(or,ce,jt),Xe.bind();let r=P(Yn);T.clearColor(r[0],r[1],r[2],1),T.clear(T.COLOR_BUFFER_BIT|T.DEPTH_BUFFER_BIT),Gt.depthPrepass(e,ce),Xn.compute({depthTexture:Xe.depthTexture,near:Or,far:Br,fovDeg:qe.fovDeg??35,aspect:G/B,radius:.36,strength:1.25}),Xe.bind(),Gt.draw({viewProj:e,eye:H,lightDir:Hr,lightColour:[3.4,3.3,3.14],ambientGain:.44,lightVP:or,shadow:jt,shadowStrength:.92,draws:ce,ao:Xn.texture,screenSize:[G,B],fog:Fe>0?{density:Fe,height:5,floor:0,colour:P(Yn)}:null}),T.enable(T.BLEND),T.blendFunc(T.ONE,T.ONE),T.enable(T.DEPTH_TEST),T.depthMask(!1);for(let t of O)Ee.ruleAtDepth(e,-M,.02,M,.02,t.z,.012,We),Ee.ruleAtDepth(e,-M,Z,M,Z,t.z,.01,We),Ee.ruleAtDepth(e,-M,.02,-M,Z,t.z,.01,We),Ee.ruleAtDepth(e,M,.02,M,Z,t.z,.01,We);for(let t of xn)Ee.ruleAtDepth(e,Wr,t.y,Xr,t.y,En,.006,No);for(let t of Uo){let n=t.x<0?t.x-Qe:t.x+Qe;Ee.ruleAtDepth(e,t.x,t.topY,n,t.topY+Sr(t.slot),t.z,.008,Co)}T.depthMask(!0),T.disable(T.BLEND),V&&V.draw({viewProj:e,sources:kr,pointScale:18}),T.bindFramebuffer(T.FRAMEBUFFER,null),T.viewport(0,0,G,B),T.disable(T.DEPTH_TEST),T.activeTexture(T.TEXTURE0),T.bindTexture(T.TEXTURE_2D,Xe.texture),_.blit(bo,t=>T.uniform1i(T.getUniformLocation(t,"uScene"),0))}var sr=4e3;function Bo(e){let r=new Uint8Array(4),t=performance.now();Jt(),T.readPixels(0,0,1,1,T.RGBA,T.UNSIGNED_BYTE,r);let n=Math.max(.01,performance.now()-t),o=Math.min(e,Math.max(1,Math.floor(sr/n))),a=performance.now(),s=0;for(let l=0;l<o&&(Jt(),s++,!(performance.now()-a>sr));l++);return T.readPixels(0,0,1,1,T.RGBA,T.UNSIGNED_BYTE,r),{msPerFrame:(performance.now()-a)/s,measured:s}}if(V)for(let e=0;e<Fr;e++)V.step(Gr);var en=Bo(Wt),zt=en.msPerFrame,J=(e,r)=>{let t=document.createElement("div");return t.style.cssText=e,t.textContent=r,t},rt=document.createElement("div");rt.style.cssText=`position:relative;overflow:hidden;width:${U}px;height:${N}px`;xe.parentNode?.insertBefore(rt,xe);rt.appendChild(xe);var pe=document.createElement("div");pe.style.cssText="position:absolute;inset:0;pointer-events:none";rt.appendChild(pe);var Pe="pointer-events:auto;user-select:text;-webkit-user-select:text";for(let e of[...nt].sort((r,t)=>t.p.distance-r.p.distance)){let{p:r,proj:t,shown:n,ew:o,eh:a}=e;if(!n||Q(t))continue;let s=hn(r.distance),l=document.createElement("div");l.style.cssText=`position:absolute;left:0;top:0;width:${o}px;height:${a}px;transform-origin:0 0;transform:${t.transform};display:flex;flex-direction:column;justify-content:center;gap:3px;padding:0 5px;overflow:hidden;${Pe};opacity:${(1-.7*s).toFixed(3)};-webkit-font-smoothing:antialiased`;let i=r.d.daysSinceUpdate===null?"\u2014":`${r.d.daysSinceUpdate} d`;l.appendChild(J("font:700 11px/1.05 ui-monospace,monospace;color:#fff",r.d.name));let u=J("font:400 10.5px/1.2 ui-monospace,monospace;color:rgba(255,255,255,0.80)",r.d.valueUsd===null?`VALUE ABSENT \xB7 ${i}`:`${Me(r.d.valueUsd)} \xB7 ${i}`);r.d.valueUsd===null&&(u.style.color=De),l.appendChild(u),l.appendChild(J("font:600 9px/1 ui-monospace,monospace;letter-spacing:.14em;color:rgba(255,255,255,0.60)",r.d.stage)),pe.appendChild(l)}var ir=[],lr=[...O].reverse().map(e=>{let r=e.index%2===0,t=I(z,[r?-(M+.14):M+.14,2.1,e.z],U,N),n=hn(Math.hypot(H[0],H[1]-Z,H[2]-e.z)),o=!t.behind&&t.sx>30&&t.sx<U-30&&t.sy>8&&t.sy<N-8,a=o&&ir.some(s=>Math.hypot(s.x-t.sx,s.y-t.sy)<30);if(o&&!a){ir.push({x:t.sx,y:t.sy});let s=document.createElement("div");s.style.cssText=`position:absolute;left:${t.sx.toFixed(1)}px;top:${t.sy.toFixed(1)}px;transform:translate(${r?"-100%":"0"},-100%);text-align:${r?"right":"left"};white-space:nowrap;opacity:${(1-.72*n).toFixed(3)};${Pe}`,s.appendChild(J("font:600 10px/1.25 ui-monospace,monospace;letter-spacing:.16em;color:#9CC2FF",e.label)),s.appendChild(J("font:400 9.5px/1.25 ui-monospace,monospace;color:rgba(196,212,240,0.72)",W?`${Me(e.usdPerDay)}/d`:"THROUGHPUT ABSENT")),pe.appendChild(s)}return{stage:e.label,sx:Math.round(t.sx),sy:Math.round(t.sy),onFrame:o,crowded:a}}),ko=[{y:ye+.15,label:"DAYS SINCE UPDATE"},...xn].map(e=>{let r=I(z,[Io,e.y,En],U,N),t=!r.behind&&r.sx>0&&r.sx<U&&r.sy>0&&r.sy<N;if(t){let n=document.createElement("div");n.style.cssText=`position:absolute;left:${r.sx.toFixed(1)}px;top:${r.sy.toFixed(1)}px;transform:translate(${ae>0?"0":"-100%"},-50%);text-align:${ae>0?"left":"right"};font:500 9.5px/1 ui-monospace,monospace;letter-spacing:.08em;color:rgba(196,212,240,0.78);white-space:nowrap;${ae>0?"padding-left":"padding-right"}:5px;${Pe}`,n.textContent=e.label,pe.appendChild(n)}return{label:e.label,onFrame:t}}),jr=et.map((e,r)=>{let t=L.filter(l=>l.stageIndex===r&&l.settle!==null&&l.edge!==null);if(t.length<2)return{stage:e,readable:t.length,separationPx:null};let n=t.reduce((l,i)=>(i.settle??0)>(l.settle??0)?i:l),o=t.reduce((l,i)=>(i.settle??0)<(l.settle??0)?i:l),a=Ze(n),s=Ze(o);return{stage:e,readable:t.length,separationPx:a===null||s===null?null:Math.round(Math.abs(a-s))}}),ur=jr.map(e=>e.separationPx).filter(e=>e!==null),Go=ur.length>0?Math.min(...ur):null,Yr=[];for(let e of L)for(let r of L){if(e.i>=r.i||e.stageIndex!==r.stageIndex||e.settle===null||r.settle===null)continue;let[t,n]=e.settle>r.settle?[e,r]:[r,e],o=Ze(t),a=Ze(n);o!==null&&a!==null&&o<a&&Yr.push(`${t.d.name} above ${n.d.name}`)}var fe=L.filter(e=>e.edge!==null&&e.d.known==="OBSERVED"),tn=new Map;for(let e of fe)tn.set(e.i,zr(e));var Qr=0,Kr=0;for(let e of fe)for(let r of fe){if(e.i>=r.i)continue;let[t,n]=(e.d.valueUsd??0)>(r.d.valueUsd??0)?[e,r]:[r,e];(tn.get(t.i)??0)<(tn.get(n.i)??0)&&(Qr++,t.stageIndex===n.stageIndex&&Kr++)}var yn=.6,gn=fe.reduce((e,r)=>e+(r.d.valueUsd??0),0),W=fe.length>0&&gn>0,Vo=W?null:"NO_READABLE_VALUE_IN_THE_BOOK",nn=e=>W?Number((e/gn).toFixed(3)):null,Ue=fe.filter(e=>(e.settle??0)>=yn),cr=Ue.reduce((e,r)=>e+(r.d.valueUsd??0),0),Ho=Ue.filter(e=>e.stageIndex>=et.indexOf("DILIGENCE")),Je=Ho.reduce((e,r)=>e+(r.d.valueUsd??0),0),dr=Ue.map(e=>bn(e)).filter(e=>e!==null),zo=dr.length>0?Math.round(Math.min(...dr)):null,mr=L.map(e=>bn(e)).filter(e=>e!==null),$o=mr.length>0?Math.round(Math.max(...mr)):null,se={OBSERVED:L.filter(e=>e.d.known==="OBSERVED").length,VALUE_ABSENT:L.filter(e=>e.d.known==="VALUE_ABSENT").length,WITHHELD:L.filter(e=>e.d.known==="WITHHELD").length},Ne=document.createElement("div");Ne.style.cssText="position:absolute;left:18px;top:16px;display:flex;flex-direction:column;gap:7px;"+Pe;Ne.appendChild(J("font:600 11px/1 ui-monospace,monospace;letter-spacing:.16em;color:#8FB7FF","PIPELINE \xB7 SIZE IS VALUE, HEIGHT IS MOVEMENT"));{let e=document.createElement("div");e.style.cssText="font:400 10.5px/1.55 ui-monospace,monospace;color:rgba(196,212,240,0.86)";let r=document.createElement("div");if(W){let t=document.createElement("b");t.style.color="#FF9B76",t.textContent=Me(Je),r.appendChild(t),r.appendChild(document.createTextNode(` PAST DILIGENCE AND STALLED  \xB7  ${Math.round(100*(nn(Je)??0))}% OF THE READABLE BOOK`))}else{let t=document.createElement("b");t.style.color=De,t.textContent="NO READABLE VALUE IN THE BOOK",r.appendChild(t),r.appendChild(document.createTextNode(` \u2014 ${se.WITHHELD} withheld, ${se.VALUE_ABSENT} never priced, so no share is computable`))}e.appendChild(r),e.appendChild(J("",`${j} d = ON THE FLOOR  \xB7  1 PARTICLE = ${Me(fn)}/d CLEARED`)),e.appendChild(J("",`${ln?"MOVEMENT AXIS ON":"MOVEMENT AXIS OFF \u2014 every deal pinned to the rail"}  \xB7  ${Zt===null?"THROUGHPUT ON":`THROUGHPUT OFF \u2014 ${Zt.split(" \u2014 ")[0]}`}`)),Ne.appendChild(e)}Ne.appendChild(J(`font:500 10px/1.4 ui-monospace,monospace;color:${De}`,"SYNTHETIC DEALS"));pe.appendChild(Ne);var Tn=document.createElement("div");Tn.style.cssText="position:absolute;right:18px;bottom:16px;display:flex;flex-direction:column;gap:6px;align-items:flex-end;font:500 10.5px/1 ui-monospace,monospace;"+Pe;Tn.innerHTML=[[Mr,"UPDATED \xB7 rides the rail"],[Lr,`STALLED \xB7 ${Ue.length} of ${se.OBSERVED} at ${Math.round(yn*j)} d+`],[De,`VALUE ABSENT \xB7 ${se.VALUE_ABSENT} (ring: no mass to give)`],[_r,`WITHHELD \xB7 ${se.WITHHELD} (off the movement axis)`]].map(([e,r])=>`<div style="display:flex;align-items:center;gap:7px;color:rgba(196,212,240,0.85)"><span>${r}</span><span style="width:11px;height:11px;background:${e};display:inline-block"></span></div>`).join("");pe.appendChild(Tn);var ve=V?V.readState():null,rn=0,qr=0,on=1/0,an=-1/0;if(ve&&V)for(let e=0;e<V.slots;e++){let r=ve[e*4],t=ve[e*4+1],n=ve[e*4+2];ve[e*4+3]<0||(rn++,n<on&&(on=n),n>an&&(an=n),(Math.abs(r)>M||t<-.15||t>Z+.25||n<we||n>ge)&&qr++)}var Zr=(()=>{let e=T.getExtension("WEBGL_debug_renderer_info");return e?String(T.getParameter(e.UNMASKED_RENDERER_WEBGL)):"unknown"})(),$t=/swiftshader|llvmpipe|software/i.test(Zr),sn=xt();if(sn.length>0){let e="BRAND FIDELITY FAILED \u2014 "+sn.map(r=>`${r.key}: expected ${r.expected}, got ${r.actual}`).join("; ");throw document.title="REFUSED",dn.textContent=e,new Error(e)}var je=nt.map(e=>({name:e.p.d.name,stage:e.p.d.stage,known:e.p.d.known,valueUsd:e.p.d.valueUsd,days:e.p.d.daysSinceUpdate,edgeM:e.p.edge===null?null:Number(e.p.edge.toFixed(3)),settle:e.p.settle===null?null:Number(e.p.settle.toFixed(3)),settleClamped:e.p.settleClamped,baseY:Number(e.p.baseY.toFixed(3)),distance:Number(e.p.distance.toFixed(2)),screenHeightPx:Math.round(zr(e.p)),fallenPx:(()=>{let r=bn(e.p);return r===null?null:Math.round(r)})(),fog:Number(hn(e.p.distance).toFixed(3)),tagWidthPx:Math.round(e.widthPx),tagShown:e.shown,massRefusal:e.p.massRefusal,settleRefusal:e.p.settleRefusal,hiddenBecause:e.shown?null:e.withheld?"WITHHELD":e.refusal?e.refusal:e.backFacing?"BACK_FACING":e.offFrame?"OFF_FRAME":e.edgeOn?"EDGE_ON":e.tooFar?"BEYOND_LEGIBLE_RANGE":"OCCLUDED",objectOnFrame:$r(e.p)})),Jr={tier:zn.tier,tierDprScale:zn.dprScale,tierShadowMapSize:He(cn,1536),shadowBaseline:1536,settleAxis:ln,particlesRequested:un,fog:hr,fogDensity:Number(Fe.toFixed(4)),hdr:_.hdr,eye:H.map(e=>Number(e.toFixed(2))),deals:L.length,counts:se,aggregateExcludes:{valueAbsent:se.VALUE_ABSENT,withheld:se.WITHHELD,code:"AGGREGATE_EXCLUDES_UNREADABLE_VALUE"},totalObservedUsd:gn,stallDays:j,stalledFrom:yn,stalledCount:Ue.length,stalledUsd:cr,stalledShare:nn(cr),deepStalledUsd:Je,deepStalledShare:nn(Je),bookRefusal:Vo,settleClamped:L.filter(e=>e.settleClamped).length,minStalledDisplacementPx:zo,maxDisplacementPx:$o,minSeparationPx:Go,settleInversions:Yr,railLiftM:ye,edgeMaxM:gr,edgeMinM:Number(Math.min(...fe.map(e=>e.edge??0)).toFixed(3)),referenceSizeM:me,massAmbiguousPairs:Qr,massAmbiguousWithinStage:Kr,outOfSegment:Lo,windowDays:Rr,usdPerParticle:fn,particleSpeed:Ke,rateMonotoneDown:W?O.every((e,r)=>r===0||e.ratePerSec<=O[r-1].ratePerSec+1e-9):null,rateRatioFirstLast:W?Number((O[0].ratePerSec/Math.max(1e-9,O[O.length-1].ratePerSec)).toFixed(2)):null,particleField:{refusal:Zt,capacity:pn,slots:V?.slots??0,aliveExpected:Do,aliveActual:rn,outOfChannel:qr,zRange:rn>0?[Number(on.toFixed(2)),Number(an.toFixed(2))]:null,channelZ:[we,ge],slotRecycleSeconds:Number(Jn.toFixed(2)),maxLifeSeconds:Number(er.toFixed(2)),recycleSafe:Jn>er,primeSteps:Fr},tagsShown:nt.filter(e=>e.shown).length,hiddenBy:je.filter(e=>!e.tagShown).reduce((e,r)=>{let t=r.hiddenBecause??"UNKNOWN";return e[t]=(e[t]??0)+1,e},{}),nameOverflow:L.filter(e=>e.d.known!=="WITHHELD"&&e.d.name.length*6.6>Qt*qt-10).map(e=>e.d.name),objectsOffFrame:L.filter(e=>!$r(e)).map(e=>e.d.name),gateLabelsOffFrame:lr.filter(e=>!e.onFrame).map(e=>e.stage),gateLabelsCrowded:lr.filter(e=>e.crowded).map(e=>e.stage),axisLabelsOffFrame:ko.filter(e=>!e.onFrame).length,axisTicksDrawn:xn.map(e=>{let r=I(z,[(Xr+Wr)/2,e.y,En],G,B);if(r.behind||r.sx<2||r.sx>G-2||r.sy<4||r.sy>B-4)return{label:e.label,drawn:!1,why:"OFF_FRAME"};let t=(a,s)=>{let l=s-a+1,i=new Uint8Array(4*l);T.readPixels(Math.round(r.sx),Math.round(B-r.sy)+a,1,l,T.RGBA,T.UNSIGNED_BYTE,i);let u=0;for(let c=0;c<l;c++)u=Math.max(u,i[c*4]+i[c*4+1]+i[c*4+2]);return u},n=t(-2,2),o=t(8,12);return{label:e.label,drawn:n>o+12,lum:n,background:o}}),axisSide:ae>0?"right":"left",axisOnEyeSide:ae>0==H[0]>=0,fogNearest:Math.min(...je.map(e=>e.fog)),fogFurthest:Math.max(...je.map(e=>e.fog)),brandFidelity:sn,glError:T.getError(),triangles:Po,shadowMap:jt.size,resolution:`${G}x${B}`,dprScale:Le,frames:en.measured,framesRequested:Wt,sweepTruncated:en.measured<Wt,paramClamps:br,msPerFrame:Number(zt.toFixed(3)),fps:Math.round(1e3/zt),renderer:Zr,rendererClass:$t?"software":"hardware",headroom:$t?null:Number((16.6-zt).toFixed(3)),headroomRefusal:$t?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null,hardwareMsPerFrame:null,gates:O.map(e=>({stage:e.label,z:e.z,clearedUsd:W?e.clearedUsd:null,usdPerDay:W?Math.round(e.usdPerDay):null,ratePerSec:W?Number(e.ratePerSec.toFixed(2)):null,perMetre:W?Number(e.linearDensityPerMetre.toFixed(2)):null,lifeSeconds:Number(e.life.toFixed(2))})),perStageSeparation:jr,perDeal:je};globalThis.E3=Jr;var{perDeal:fr,gates:pr,perStageSeparation:Xo,...Wo}=Jr;dn.textContent=JSON.stringify(Wo,null,2)+`

gates (${pr.length}):
`+pr.map(e=>`  ${e.stage.padEnd(10)} ${(e.usdPerDay===null?"absent":`$${e.usdPerDay}`).padStart(8)}/d ${String(e.ratePerSec??"absent").padStart(7)} p/s ${String(e.perMetre??"absent").padStart(7)} p/m life ${e.lifeSeconds}s`).join(`
`)+`

settle separation on screen:
`+Xo.map(e=>`  ${e.stage.padEnd(10)} ${e.separationPx===null?"n/a (needs 2 readable)":`${e.separationPx} px`}`).join(`
`)+`

perDeal (${fr.length}, full detail on globalThis.E3):
`+fr.map(e=>`  ${e.name.padEnd(16)} ${e.stage.padEnd(10)} ${(e.valueUsd===null?"ABSENT":Me(e.valueUsd)).padStart(7)} ${(e.days===null?"\u2014":`${e.days}d`).padStart(4)} base ${e.baseY.toFixed(2)} fallen ${String(e.fallenPx??"\u2014").padStart(3)}px ${String(e.distance).padStart(5)}m ${String(e.screenHeightPx).padStart(3)}px ${e.tagShown?"TAG":`no tag: ${e.hiddenBecause}`}`).join(`
`);Jt();yr.markRendered();document.title="READY";

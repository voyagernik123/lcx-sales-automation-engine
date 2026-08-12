var rn={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected."};function D(e,r){return r===void 0?{kind:"refused",code:e,reason:rn[e]}:{kind:"refused",code:e,reason:rn[e],detail:r}}function Qe(e){return e.kind==="stage"}function Ze(e,r={}){let t=e.getContext("webgl2",{antialias:r.antialias??!1,alpha:r.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!t)return D("NO_WEBGL2");let n=t.getExtension("EXT_color_buffer_float"),o=e.width,a=e.height,s=n?t.RGBA16F:t.RGBA8,l=n?t.HALF_FLOAT:t.UNSIGNED_BYTE,i=(g,v)=>{let x=t.createTexture();t.bindTexture(t.TEXTURE_2D,x),t.texImage2D(t.TEXTURE_2D,0,s,g,v,0,t.RGBA,l,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);let E=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,E),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,x,0);let A=t.checkFramebufferStatus(t.FRAMEBUFFER);return A!==t.FRAMEBUFFER_COMPLETE?D("FRAMEBUFFER_INCOMPLETE",`status 0x${A.toString(16)} at ${g}\xD7${v}`):{texture:x,framebuffer:E,width:g,height:v}},d=r.bloomShift??2,u={w:o,h:a},c=i(o,a);if("kind"in c)return c;let f=i(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in f)return f;let p=i(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in p)return p;let m=t.createVertexArray();t.bindVertexArray(m);let h=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,h),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null);let b=[];return{kind:"stage",gl:t,cssWidth:e.clientWidth||o,cssHeight:e.clientHeight||a,hdr:!!n,get width(){return u.w},get height(){return u.h},get scene(){return c},get bloomA(){return f},get bloomB(){return p},setRegion(g,v){let x=Math.max(1,Math.round(g)),E=Math.max(1,Math.round(v));if(!(x===u.w&&E===u.h)){u={w:x,h:E};for(let A of[c,f,p])"kind"in A||(t.deleteFramebuffer(A.framebuffer),t.deleteTexture(A.texture));c=i(x,E),f=i(Math.max(1,x>>d),Math.max(1,E>>d)),p=i(Math.max(1,x>>d),Math.max(1,E>>d))}},compile(g,v){let x=(k,M)=>{let F=t.createShader(k);return t.shaderSource(F,M),t.compileShader(F),t.getShaderParameter(F,t.COMPILE_STATUS)?F:D("SHADER_COMPILE_FAILED",t.getShaderInfoLog(F)??"(no log)")},E=x(t.VERTEX_SHADER,g);if(typeof E=="object"&&"kind"in E)return E;let A=x(t.FRAGMENT_SHADER,v);if(typeof A=="object"&&"kind"in A)return A;let R=t.createProgram();return t.attachShader(R,E),t.attachShader(R,A),t.linkProgram(R),t.getProgramParameter(R,t.LINK_STATUS)?(b.push(R),R):D("PROGRAM_LINK_FAILED",t.getProgramInfoLog(R)??"(no log)")},bindTarget(g){t.bindFramebuffer(t.FRAMEBUFFER,g?g.framebuffer:null),t.viewport(0,0,g?g.width:u.w,g?g.height:u.h)},blit(g,v){t.useProgram(g),t.bindVertexArray(m),v?.(g),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null)},dispose(){for(let g of b)t.deleteProgram(g);for(let g of[c,f,p])"kind"in g||(t.deleteFramebuffer(g.framebuffer),t.deleteTexture(g.texture));t.deleteBuffer(h),t.deleteVertexArray(m)}}}var he=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function Fe(e,r){let t=new Float32Array(16);for(let n=0;n<4;n++)for(let o=0;o<4;o++){let a=0;for(let s=0;s<4;s++)a+=e[s*4+o]*r[n*4+s];t[n*4+o]=a}return t}var Se=(e,r)=>[e[0]-r[0],e[1]-r[1],e[2]-r[2]],Re=(e,r)=>e[0]*r[0]+e[1]*r[1]+e[2]*r[2],qe=(e,r)=>[e[1]*r[2]-e[2]*r[1],e[2]*r[0]-e[0]*r[2],e[0]*r[1]-e[1]*r[0]];function pe(e){let r=Math.hypot(e[0],e[1],e[2]);return r===0?e:[e[0]/r,e[1]/r,e[2]/r]}function Je(e,r,t,n){let o=1/Math.tan(e/2);return new Float32Array([o/r,0,0,0,0,o,0,0,0,0,(n+t)/(t-n),-1,0,0,2*n*t/(t-n),0])}function et(e,r,t,n,o,a){let s=r-e,l=n-t,i=a-o;return new Float32Array([2/s,0,0,0,0,2/l,0,0,0,0,-2/i,0,-(r+e)/s,-(n+t)/l,-(a+o)/i,1])}function Me(e,r,t){let n=pe(Se(e,r)),o=qe(t,n);if(Math.hypot(o[0],o[1],o[2])<1e-8)return he();let a=pe(o),s=qe(n,a);return new Float32Array([a[0],s[0],n[0],0,a[1],s[1],n[1],0,a[2],s[2],n[2],0,-Re(a,e),-Re(s,e),-Re(n,e),1])}function on(e,r){let t=[0,1,2,3].map(o=>e[0+o]*r[0]+e[4+o]*r[1]+e[8+o]*r[2]+e[12+o]),n=t[3];return{x:t[0]/n,y:t[1]/n,z:t[2]/n,w:n}}function O(e,r,t,n){let o=on(e,r);return{sx:(o.x*.5+.5)*t,sy:(1-(o.y*.5+.5))*n,behind:o.w<=0}}var an=`#version 300 es
precision highp float;
layout(location=0) in vec3 p;
uniform mat4 uMVP;
out float vY;
void main(){ vY = p.y; gl_Position = uMVP * vec4(p, 1.0); }`,sn=`#version 300 es
precision highp float;
in float vY;
uniform vec3 uColour;
uniform float uGain, uFade, uFadeFrom, uFadeTo;
out vec4 frag;
void main(){
  float t = clamp((vY - uFadeFrom) / max(uFadeTo - uFadeFrom, 1e-4), 0.0, 1.0);
  frag = vec4(uColour * uGain * (1.0 - uFade * t), 1.0);
}`;function tt(e){let{gl:r}=e,t=e.compile(an,sn);if("kind"in t)return t;let n=r.createVertexArray();r.bindVertexArray(n);let o=r.createBuffer();r.bindBuffer(r.ARRAY_BUFFER,o),r.enableVertexAttribArray(0),r.vertexAttribPointer(0,3,r.FLOAT,!1,0,0),r.bindVertexArray(null);let a=d=>r.getUniformLocation(t,d),s={mvp:a("uMVP"),colour:a("uColour"),gain:a("uGain"),fade:a("uFade"),fadeFrom:a("uFadeFrom"),fadeTo:a("uFadeTo")},l=(d,u,c)=>{r.useProgram(t),r.bindVertexArray(n),r.bindBuffer(r.ARRAY_BUFFER,o),r.bufferData(r.ARRAY_BUFFER,u,r.STREAM_DRAW),r.uniformMatrix4fv(s.mvp,!1,d),r.uniform3fv(s.colour,c.colour),r.uniform1f(s.gain,c.gain),r.uniform1f(s.fade,c.fade??0),r.uniform1f(s.fadeFrom,c.fadeFrom??0),r.uniform1f(s.fadeTo,c.fadeTo??1),r.drawArrays(r.TRIANGLE_STRIP,0,u.length/3),r.bindVertexArray(null)},i=(d,u,c,f,p,m,h,b)=>{let y=f-u,g=p-c,v=Math.hypot(y,g)||1,x=-g/v*h,E=y/v*h;l(d,new Float32Array([u-x,c-E,m,u+x,c+E,m,f-x,p-E,m,f+x,p+E,m]),b)};return{rule(d,u,c,f,p,m,h){i(d,u,c,f,p,0,m,h)},ruleAtDepth(d,u,c,f,p,m,h,b){i(d,u,c,f,p,m,h,b)},curve(d,u,c,f){let p=u.length/2,m=new Float32Array(p*6);for(let h=0;h<p;h++){let b=u[h*2],y=u[h*2+1];m[h*6+0]=b,m[h*6+1]=y-c,m[h*6+2]=0,m[h*6+3]=b,m[h*6+4]=y+c,m[h*6+5]=0}l(d,m,f)},dispose(){r.deleteBuffer(o),r.deleteVertexArray(n)}}}function ln(e){return e<=.04045?e/12.92:Math.pow((e+.055)/1.055,2.4)}function nt(e){return e<=.0031308?e*12.92:1.055*Math.pow(e,1/2.4)-.055}var Lr=/^#?([0-9a-fA-F]{6})$/;function P(e){let r=Lr.exec(e.trim());if(!r)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(e)}`);let t=r[1];return[0,2,4].map(n=>ln(parseInt(t.slice(n,n+2),16)/255))}function rt(e){return`#${e.map(t=>{let n=nt(Math.min(1,Math.max(0,t)));return Math.round(n*255).toString(16).padStart(2,"0")}).join("")}`}var oe={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},ot=Object.freeze(Object.fromEntries(Object.keys(oe).map(e=>[e,P(oe[e])])));function at(e,r,t){let n=Math.min(1,Math.max(0,t));return[e[0]+(r[0]-e[0])*n,e[1]+(r[1]-e[1])*n,e[2]+(r[2]-e[2])*n]}var un=.4;var st=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${un.toFixed(2)}); }`,it=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function lt(){let e=[];for(let r of Object.keys(oe)){let t=oe[r].toLowerCase(),n=rt(ot[r]).toLowerCase();n!==t&&e.push({key:r,expected:t,actual:n})}return e}function _r(e){let r=[1/0,1/0,1/0],t=[-1/0,-1/0,-1/0];for(let n=0;n<e.length;n+=3)for(let o=0;o<3;o++){let a=e[n+o];a<r[o]&&(r[o]=a),a>t[o]&&(t[o]=a)}return e.length===0?{min:[0,0,0],max:[0,0,0]}:{min:r,max:t}}function cn(e,r,t,n){let o=new Float32Array(e.length);for(let s=0;s<n.length;s+=3){let l=n[s],i=n[s+1],d=n[s+2],u=l*3,c=i*3,f=d*3,p=l*2,m=i*2,h=d*2,b=e[c]-e[u],y=e[c+1]-e[u+1],g=e[c+2]-e[u+2],v=e[f]-e[u],x=e[f+1]-e[u+1],E=e[f+2]-e[u+2],A=t[m]-t[p],R=t[m+1]-t[p+1],k=t[h]-t[p],M=t[h+1]-t[p+1],F=A*M-k*R;if(Math.abs(F)<1e-12)continue;let w=1/F,fe=(b*M-v*R)*w,Ae=(y*M-x*R)*w,We=(g*M-E*R)*w;for(let Q of[u,c,f])o[Q]=o[Q]+fe,o[Q+1]=o[Q+1]+Ae,o[Q+2]=o[Q+2]+We}let a=new Float32Array(e.length);for(let s=0;s<a.length;s+=3){let l=r[s],i=r[s+1],d=r[s+2],u=o[s],c=o[s+1],f=o[s+2],p=u*l+c*i+f*d;u-=l*p,c-=i*p,f-=d*p;let m=Math.hypot(u,c,f);m<1e-8&&(Math.abs(l)<.9?(u=0,c=-d,f=i):(u=-d,c=0,f=l),m=Math.hypot(u,c,f)||1),a[s]=u/m,a[s+1]=c/m,a[s+2]=f/m}return a}function dn(e,r){let t=new Float32Array(e.length);for(let n=0;n<r.length;n+=3){let o=r[n]*3,a=r[n+1]*3,s=r[n+2]*3,l=e[a]-e[o],i=e[a+1]-e[o+1],d=e[a+2]-e[o+2],u=e[s]-e[o],c=e[s+1]-e[o+1],f=e[s+2]-e[o+2],p=i*f-d*c,m=d*u-l*f,h=l*c-i*u;for(let b of[o,a,s])t[b]=t[b]+p,t[b+1]=t[b+1]+m,t[b+2]=t[b+2]+h}for(let n=0;n<t.length;n+=3){let o=Math.hypot(t[n],t[n+1],t[n+2]);o>0&&(t[n]=t[n]/o,t[n+1]=t[n+1]/o,t[n+2]=t[n+2]/o)}return t}function Le(e,r,t,n,o){let{min:a,max:s}=_r(e),l=n??dn(e,t);return{positions:e,normals:l,uvs:r,indices:t,min:a,max:s,tangents:o??cn(e,l,r,t)}}function ae(e=1,r=1,t=1){let n=e/2,o=r/2,a=t/2,s=[[[-n,-o,a],[n,-o,a],[n,o,a],[-n,o,a]],[[n,-o,-a],[-n,-o,-a],[-n,o,-a],[n,o,-a]],[[n,-o,a],[n,-o,-a],[n,o,-a],[n,o,a]],[[-n,-o,-a],[-n,-o,a],[-n,o,a],[-n,o,-a]],[[-n,o,a],[n,o,a],[n,o,-a],[-n,o,-a]],[[-n,-o,-a],[n,-o,-a],[n,-o,a],[-n,-o,a]]],l=new Float32Array(72),i=new Float32Array(48),d=new Uint16Array(36),u=0,c=0,f=0,p=0;for(let m of s){for(let[h,b,y]of m)l[u++]=h,l[u++]=b,l[u++]=y;i[c++]=0,i[c++]=0,i[c++]=1,i[c++]=0,i[c++]=1,i[c++]=1,i[c++]=0,i[c++]=1,d[f++]=p,d[f++]=p+1,d[f++]=p+2,d[f++]=p,d[f++]=p+2,d[f++]=p+3,p+=4}return Le(l,i,d)}function ut(e=10,r=24){let t=Math.max(1,Math.floor(r)),n=(t+1)*(t+1),o=new Float32Array(n*3),a=new Float32Array(n*3),s=new Float32Array(n*2),l=new Uint16Array(t*t*6),i=0,d=0,u=0;for(let c=0;c<=t;c++)for(let f=0;f<=t;f++){let p=(f/t-.5)*e,m=(c/t-.5)*e;o[i]=p,o[i+1]=0,o[i+2]=m,a[i]=0,a[i+1]=1,a[i+2]=0,i+=3,s[d++]=f/t,s[d++]=c/t}for(let c=0;c<t;c++)for(let f=0;f<t;f++){let p=c*(t+1)+f,m=p+1,h=p+(t+1),b=h+1;l[u++]=p,l[u++]=h,l[u++]=m,l[u++]=m,l[u++]=h,l[u++]=b}return Le(o,s,l,a)}function ct(e=.5,r=24,t=32){let n=Math.max(2,r),o=Math.max(3,t),a=(n+1)*(o+1),s=new Float32Array(a*3),l=new Float32Array(a*3),i=new Float32Array(a*2),d=new Uint16Array(n*o*6),u=0,c=0,f=0;for(let p=0;p<=n;p++){let m=p/n*Math.PI;for(let h=0;h<=o;h++){let b=h/o*Math.PI*2,y=Math.sin(m)*Math.cos(b),g=Math.cos(m),v=Math.sin(m)*Math.sin(b);s[u]=y*e,s[u+1]=g*e,s[u+2]=v*e,l[u]=y,l[u+1]=g,l[u+2]=v,u+=3,i[c++]=h/o,i[c++]=p/n}}for(let p=0;p<n;p++)for(let m=0;m<o;m++){let h=p*(o+1)+m,b=h+1,y=h+(o+1),g=y+1;d[f++]=h,d[f++]=b,d[f++]=y,d[f++]=b,d[f++]=g,d[f++]=y}return Le(s,i,d,l)}function dt(e=.5,r=.08,t=64,n=24){let o=Math.max(3,t),a=Math.max(3,n),s=[],l=[],i=[],d=[],u=[];for(let c=0;c<=o;c++){let f=c/o*Math.PI*2,p=Math.cos(f),m=Math.sin(f);for(let h=0;h<=a;h++){let b=h/a*Math.PI*2,y=Math.cos(b),g=Math.sin(b);s.push((e+r*y)*p,r*g,(e+r*y)*m),l.push(p*y,g,m*y),i.push(c/o,h/a),u.push(-m,0,p)}}for(let c=0;c<o;c++)for(let f=0;f<a;f++){let p=c*(a+1)+f,m=p+1,h=p+(a+1),b=h+1;d.push(p,m,h,m,b,h)}return Le(new Float32Array(s),new Float32Array(i),new Uint16Array(d),new Float32Array(l),new Float32Array(u))}function j(e){return e.indices.length/3}function wr(e){if(!Number.isFinite(e)||e===0)return"0";let r=e.toFixed(12).replace(/0+$/,"").replace(/\.$/,"");return r==="-0"?"0":r}function mn(e,r,t,n){let[o,a]=e,[s,l]=r,[i,d]=t,[u,c]=n,f=o-s+i-u,p=a-l+d-c;if(Math.abs(f)<1e-9&&Math.abs(p)<1e-9){let E=[s-o,u-o,o,l-a,c-a,a,0,0,1],A=E[0]*E[4]-E[1]*E[3];return Math.abs(A)<1e-9?null:E}let m=s-i,h=u-i,b=l-d,y=c-d,g=m*y-h*b;if(Math.abs(g)<1e-9)return null;let v=(f*y-h*p)/g,x=(m*p-f*b)/g;return[s-o+v*s,u-o+x*u,o,l-a+v*l,c-a+x*c,a,v,x,1]}function mt(e,r,t,n,o,a){if(!(o>0)||!(a>0))return{refusal:"EMPTY_ELEMENT_BOX"};let l=[r.topLeft,r.topRight,r.bottomRight,r.bottomLeft].map(w=>O(e,w,t,n));if(l.some(w=>w.behind))return{refusal:"CORNER_BEHIND_CAMERA"};let i=l.map(w=>({x:w.sx,y:w.sy})),[d,u,c,f]=i,p=mn([d.x,d.y],[u.x,u.y],[c.x,c.y],[f.x,f.y]);if(!p)return{refusal:"DEGENERATE_ON_SCREEN"};let m=.5*(d.x*u.y-u.x*d.y+(u.x*c.y-c.x*u.y)+(c.x*f.y-f.x*c.y)+(f.x*d.y-d.x*f.y)),h=1/o,b=1/a,[y,g,v,x,E,A,R,k,M]=p;return{transform:`matrix3d(${[y*h,x*h,0,R*h,g*b,E*b,0,k*b,0,0,1,0,v,A,0,M].map(wr).join(", ")})`,matrix:p,screen:i,signedArea:m}}function W(e){return"refusal"in e}function ft(e,r,t,n,o,a,s=0){let l=Math.cos(a),i=Math.sin(a),d=(c,f)=>[e+l*c+i*s,t+f,r-i*c+l*s],u=n/2;return{topLeft:d(-u,o),topRight:d(u,o),bottomRight:d(u,0),bottomLeft:d(-u,0)}}function fn(e){let r=Number.isFinite(e)?Math.max(1,Math.floor(e)):1,t=Math.max(1,2**Math.ceil(Math.log2(Math.ceil(Math.sqrt(r))))),n=Math.max(1,2**Math.ceil(Math.log2(Math.ceil(r/t))));return{width:t,height:n,slots:t*n}}function pn(e,r,t){let n=[],o=[];for(let a=0;a<e.length;a++){let s=Math.max(0,e[a].rate),l=Math.max(0,Math.min(.1,r)),i=s*l+(t[a]??0),d=Math.floor(i);n.push(d),o.push(i-d)}return{counts:n,carry:o}}var hn=`
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
`,Dr=`#version 300 es
precision highp float;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Pr=`#version 300 es
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
${hn}
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
}`,Ur=`#version 300 es
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
}`,Nr=`#version 300 es
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
}`;function pt(e,r){let t=e.gl,{width:n,height:o,slots:a}=fn(r);if(!t.getExtension("EXT_color_buffer_float"))return D("MISSING_EXTENSION","particle simulation needs EXT_color_buffer_float to write positions to a texture \u2014 without it the state textures never update and the field renders frozen");let s=e.compile(Dr,Pr);if("kind"in s)return s;let l=e.compile(Ur,Nr);if("kind"in l)return l;let i=E=>{let A=t.createTexture();return t.bindTexture(t.TEXTURE_2D,A),t.texImage2D(t.TEXTURE_2D,0,t.RGBA32F,n,o,0,t.RGBA,t.FLOAT,E),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),A},d=new Float32Array(a*4);for(let E=0;E<a;E++)d[E*4+3]=-1;let u=i(d),c=i(d),f=i(new Float32Array(a*4)),p=i(new Float32Array(a*4)),m=t.createFramebuffer(),h=t.createFramebuffer(),b=t.createVertexArray(),y=0,g=[],v=(E,A)=>(t.bindFramebuffer(t.FRAMEBUFFER,m),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,E,0),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT1,t.TEXTURE_2D,A,0),t.drawBuffers([t.COLOR_ATTACHMENT0,t.COLOR_ATTACHMENT1]),t.checkFramebufferStatus(t.FRAMEBUFFER)===t.FRAMEBUFFER_COMPLETE),x=(E,A)=>t.getUniformLocation(E,A);return{slots:a,width:n,height:o,step(E){let A=E.sources.slice(0,8),R=pn(A,E.dtSeconds,g);g=R.carry;let k=[],M=[],F=[],w=0;for(let G=0;G<A.length&&w<8;G++){let Z=A[G],Ye=Math.min(R.counts[G]??0,a);for(;Ye>0&&w<8;){let ve=y,Ke=Math.min(Ye,a-ve);k.push(ve,ve+Ke-1,G,Z.life),M.push(Z.at[0],Z.at[1],Z.at[2],Z.spread??0),F.push(Z.velocity[0],Z.velocity[1],Z.velocity[2],0),y=(ve+Ke)%a,Ye-=Ke,w++}}if(!v(c,p))return;t.viewport(0,0,n,o),t.disable(t.DEPTH_TEST),t.disable(t.BLEND),t.useProgram(s),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,u),t.uniform1i(x(s,"uState"),0),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,f),t.uniform1i(x(s,"uVel"),1),t.uniform2f(x(s,"uSize"),n,o),t.uniform1f(x(s,"uDt"),Math.max(0,Math.min(.1,E.dtSeconds))),t.uniform1f(x(s,"uTime"),performance.now()/1e3%3600),t.uniform1f(x(s,"uNoiseScale"),E.noiseScale??.35),t.uniform1f(x(s,"uNoiseStrength"),E.noiseStrength??.6),t.uniform1f(x(s,"uDrag"),E.drag??.4);let fe=E.gravity??[0,0,0];t.uniform3f(x(s,"uGravity"),fe[0],fe[1],fe[2]),t.uniform1i(x(s,"uEmitCount"),w),w>0&&(t.uniform4fv(x(s,"uEmitRange"),new Float32Array(k)),t.uniform4fv(x(s,"uEmitPos"),new Float32Array(M)),t.uniform4fv(x(s,"uEmitVel"),new Float32Array(F)));let Ae=new Float32Array(8);for(let G=0;G<8;G++)Ae[G]=A[G]?.life??1;t.uniform1fv(x(s,"uLifes"),Ae),t.bindVertexArray(b),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null);let We=u;u=c,c=We;let Q=f;f=p,p=Q,t.bindFramebuffer(t.FRAMEBUFFER,null)},draw(E){let A=E.sources.slice(0,8);t.useProgram(l),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,u),t.uniform1i(x(l,"uState"),0),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,f),t.uniform1i(x(l,"uVel"),1),t.uniform2f(x(l,"uSize"),n,o),t.uniformMatrix4fv(x(l,"uViewProj"),!1,E.viewProj),t.uniform1f(x(l,"uPointScale"),E.pointScale??28);let R=new Float32Array(24),k=new Float32Array(8);for(let M=0;M<8;M++){let F=A[M];R[M*3]=F?F.colour[0]:0,R[M*3+1]=F?F.colour[1]:0,R[M*3+2]=F?F.colour[2]:0,k[M]=F?F.life:1}t.uniform3fv(x(l,"uColours"),R),t.uniform1fv(x(l,"uLifes"),k),t.enable(t.BLEND),t.blendFunc(t.ONE,t.ONE),t.enable(t.DEPTH_TEST),t.depthMask(!1),t.bindVertexArray(b),t.drawArrays(t.POINTS,0,a),t.bindVertexArray(null),t.depthMask(!0),t.disable(t.BLEND),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,null),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,null)},readState(){t.bindFramebuffer(t.FRAMEBUFFER,h),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,u,0);let E=new Float32Array(a*4);return t.checkFramebufferStatus(t.FRAMEBUFFER)===t.FRAMEBUFFER_COMPLETE&&t.readPixels(0,0,n,o,t.RGBA,t.FLOAT,E),t.bindFramebuffer(t.FRAMEBUFFER,null),E},dispose(){for(let E of[u,c,f,p])t.deleteTexture(E);t.deleteFramebuffer(m),t.deleteFramebuffer(h),t.deleteVertexArray(b),t.deleteProgram(s),t.deleteProgram(l)}}}var ht=89,bt=Math.PI/180;function _e(e){let r=Math.max(-ht,Math.min(ht,e.elevationDeg))*bt,t=e.azimuthDeg*bt,n=Math.max(1e-4,e.distance),o=Math.sin(r)*n,a=Math.cos(r)*n;return[e.target[0]+Math.sin(t)*a,e.target[1]+o,e.target[2]+Math.cos(t)*a]}function we(e,r){let t=_e(e),n=e.near??Math.max(.01,e.distance/100),o=e.far??Math.max(n+1,e.distance*8),a=Je((e.fovDeg??38)*bt,Math.max(.001,r),n,o),s=Me(t,e.target,[0,1,0]);return Fe(a,s)}function Et(e,r,t){let n=pe(e.direction),o=e.extent??Math.max(.1,t*1.35),a=Math.max(1,t*2),s=[r[0]-n[0]*a,r[1]-n[1]*a,r[2]-n[2]*a],l=Math.abs(n[1])>.99?[0,0,1]:[0,1,0],i=Me(s,r,l),d=et(-o,o,-o,o,.01,a+t*2+o);return Fe(d,i)}function xt(e,r){let t=Se([r[0],r[1],r[2]],[e[0],e[1],e[2]]);return Math.hypot(t[0],t[1],t[2])/2}function yt(e,r){return[(e[0]+r[0])/2,(e[1]+r[1])/2,(e[2]+r[2])/2]}function gt(e,r,t){let{gl:n}=e,o=Math.max(1,Math.floor(r)),a=Math.max(1,Math.floor(t)),s=n.createFramebuffer(),l=n.createTexture(),i=n.createTexture();if(!s||!l||!i)return D("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let d=e.hdr?n.RGBA16F:n.RGBA8,u=e.hdr?n.HALF_FLOAT:n.UNSIGNED_BYTE,c=()=>{n.bindTexture(n.TEXTURE_2D,l),n.texImage2D(n.TEXTURE_2D,0,d,o,a,0,n.RGBA,u,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.bindTexture(n.TEXTURE_2D,i),n.texImage2D(n.TEXTURE_2D,0,n.DEPTH_COMPONENT24,o,a,0,n.DEPTH_COMPONENT,n.UNSIGNED_INT,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.bindFramebuffer(n.FRAMEBUFFER,s),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,l,0),n.framebufferTexture2D(n.FRAMEBUFFER,n.DEPTH_ATTACHMENT,n.TEXTURE_2D,i,0),n.bindFramebuffer(n.FRAMEBUFFER,null)};c(),n.bindFramebuffer(n.FRAMEBUFFER,s);let f=n.checkFramebufferStatus(n.FRAMEBUFFER);return n.bindFramebuffer(n.FRAMEBUFFER,null),f!==n.FRAMEBUFFER_COMPLETE?D("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${f.toString(16)}). Depth texture support may be missing.`):{framebuffer:s,texture:l,depthTexture:i,get width(){return o},get height(){return a},bind(){n.bindFramebuffer(n.FRAMEBUFFER,s),n.viewport(0,0,o,a)},resize(p,m){let h=Math.max(1,Math.floor(p)),b=Math.max(1,Math.floor(m));h===o&&b===a||(o=h,a=b,c())},dispose(){n.deleteFramebuffer(s),n.deleteTexture(l),n.deleteTexture(i)}}}function Tt(e,r=1024){let{gl:t}=e,n=Math.max(256,Math.min(2048,Math.floor(r))),o=t.createFramebuffer(),a=t.createTexture();if(!o||!a)return D("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");t.bindTexture(t.TEXTURE_2D,a),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,n,n,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,o),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,a,0);let s=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),s!==t.FRAMEBUFFER_COMPLETE?D("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${s.toString(16)}).`):{framebuffer:o,depthTexture:a,size:n,bind(){t.bindFramebuffer(t.FRAMEBUFFER,o),t.viewport(0,0,n,n)},dispose(){t.deleteFramebuffer(o),t.deleteTexture(a)}}}var vt=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,At={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function bn(e,r,t={}){let n=t.zenith??At.zenith,o=t.horizon??At.horizon,a=t.ground??At.ground;e.uniform3f(e.getUniformLocation(r,"uSkyZenith"),n[0],n[1],n[2]),e.uniform3f(e.getUniformLocation(r,"uSkyHorizon"),o[0],o[1],o[2]),e.uniform3f(e.getUniformLocation(r,"uSkyGround"),a[0],a[1],a[2])}var Do=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${vt}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;var En=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,Rt=`#version 300 es
precision highp float;
void main(){}`,Cr=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,xn=`#version 300 es
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
}`,yn=`#version 300 es
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
${vt}

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
}`;function Y(e,r){let{gl:t}=e,n=t.createVertexArray(),o=t.createBuffer(),a=t.createBuffer(),s=t.createBuffer(),l=t.createBuffer();return!n||!o||!a||!s||!l?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(t.bindVertexArray(n),t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,r.positions,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,a),t.bufferData(t.ARRAY_BUFFER,r.normals,t.STATIC_DRAW),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,s),t.bufferData(t.ARRAY_BUFFER,r.tangents,t.STATIC_DRAW),t.enableVertexAttribArray(2),t.vertexAttribPointer(2,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,l),t.bufferData(t.ELEMENT_ARRAY_BUFFER,r.indices,t.STATIC_DRAW),t.bindVertexArray(null),{vao:n,indexCount:r.indices.length,indexType:r.indices instanceof Uint32Array?t.UNSIGNED_INT:t.UNSIGNED_SHORT,dispose(){t.deleteVertexArray(n),t.deleteBuffer(o),t.deleteBuffer(a),t.deleteBuffer(s),t.deleteBuffer(l)}})}function Ft(e){let{gl:r}=e,t=e.compile(En,Rt);if("kind"in t)return t;let n=e.compile(xn,yn);if("kind"in n)return n;let o=e.compile(Cr,Rt);if("kind"in o)return o;let a=(s,l)=>r.getUniformLocation(s,l);return{shadowPass(s,l,i,d){let u=d??(()=>{});i.bind(),u("shadow.bind"),r.clear(r.DEPTH_BUFFER_BIT),r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.FRONT),r.useProgram(t),u("useProgram(shadow)"),r.uniformMatrix4fv(a(t,"uLightVP"),!1,s),u("uLightVP");for(let c of l)r.uniformMatrix4fv(a(t,"uModel"),!1,c.model),u("shadow uModel"),r.bindVertexArray(c.mesh.vao),u("shadow bindVAO"),r.drawElements(r.TRIANGLES,c.mesh.indexCount,c.mesh.indexType,0),u("shadow drawElements");r.bindVertexArray(null),r.cullFace(r.BACK)},depthPrepass(s,l){r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.colorMask(!1,!1,!1,!1),r.useProgram(o),r.uniformMatrix4fv(a(o,"uViewProj"),!1,s);for(let i of l)r.uniformMatrix4fv(a(o,"uModel"),!1,i.model),r.bindVertexArray(i.mesh.vao),r.drawElements(r.TRIANGLES,i.mesh.indexCount,i.mesh.indexType,0);r.bindVertexArray(null),r.colorMask(!0,!0,!0,!0)},draw(s){let l=s.onStep??(()=>{});if(r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!0),r.disable(r.BLEND),r.enable(r.CULL_FACE),r.cullFace(r.BACK),r.useProgram(n),r.uniformMatrix4fv(a(n,"uViewProj"),!1,s.viewProj),l("uViewProj"),r.uniform3fv(a(n,"uEye"),s.eye),l("uEye"),r.uniform3fv(a(n,"uLightDir"),s.lightDir),l("uLightDir"),r.uniform3fv(a(n,"uLightColour"),s.lightColour),l("uLightColour"),r.uniform1f(a(n,"uAmbientGain"),s.ambientGain??1),l("uAmbientGain"),s.fog&&s.fog.density>0){r.uniform1f(a(n,"uFogDensity"),s.fog.density),r.uniform1f(a(n,"uFogHeight"),s.fog.height),r.uniform1f(a(n,"uFogFloor"),s.fog.floor??0);let i=s.fog.colour;i==="sky"?r.uniform3f(a(n,"uFogColour"),-1,-1,-1):r.uniform3f(a(n,"uFogColour"),i[0],i[1],i[2]),l("fog")}else r.uniform1f(a(n,"uFogDensity"),0);bn(r,n,s.sky),l("bindSky"),s.ao&&s.screenSize?(r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,s.ao),r.uniform1i(a(n,"uAO"),1),r.uniform2f(a(n,"uScreenSize"),s.screenSize[0],s.screenSize[1]),r.uniform1f(a(n,"uAOEnabled"),1)):r.uniform1f(a(n,"uAOEnabled"),0),l("bindAO"),r.uniformMatrix4fv(a(n,"uLightVP"),!1,s.lightVP),l("lit uLightVP"),s.shadow?(r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,s.shadow.depthTexture),r.uniform1i(a(n,"uShadowMap"),0),r.uniform1f(a(n,"uShadowTexel"),1/s.shadow.size),r.uniform1f(a(n,"uShadowStrength"),s.shadowStrength??1)):r.uniform1f(a(n,"uShadowStrength"),0);for(let i of s.draws)r.uniformMatrix4fv(a(n,"uModel"),!1,i.model),r.uniformMatrix3fv(a(n,"uNormalMat"),!1,i.normalMat),l("uNormalMat"),r.uniform3fv(a(n,"uBaseColour"),i.material.baseColour),l("uBaseColour"),r.uniform1f(a(n,"uRoughness"),i.material.roughness),r.uniform1f(a(n,"uMetalness"),i.material.metalness),r.uniform1f(a(n,"uAnisotropy"),i.material.anisotropy??0),r.bindVertexArray(i.mesh.vao),l("lit bindVAO"),r.drawElements(r.TRIANGLES,i.mesh.indexCount,i.mesh.indexType,0),l("lit drawElements");r.bindVertexArray(null),r.disable(r.CULL_FACE)},dispose(){r.deleteProgram(t),r.deleteProgram(n),r.deleteProgram(o)}}}var St=`
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
}`,gn=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Or=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${St}

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
}`,Ir=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${St}

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
}`;function Mt(e,r,t){let{gl:n}=e,o=e.compile(gn,Or);if("kind"in o)return o;let a=e.compile(gn,Ir);if("kind"in a)return a;let s=Math.max(1,r>>1),l=Math.max(1,t>>1),i=()=>{let m=n.createFramebuffer(),h=n.createTexture();return!m||!h?null:{fb:m,tex:h}},d=i(),u=i();if(!d||!u)return D("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let c=()=>{for(let m of[d,u])n.bindTexture(n.TEXTURE_2D,m.tex),n.texImage2D(n.TEXTURE_2D,0,n.R8,s,l,0,n.RED,n.UNSIGNED_BYTE,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.bindFramebuffer(n.FRAMEBUFFER,m.fb),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,m.tex,0);n.bindFramebuffer(n.FRAMEBUFFER,null)};c(),n.bindFramebuffer(n.FRAMEBUFFER,d.fb);let f=n.checkFramebufferStatus(n.FRAMEBUFFER);if(n.bindFramebuffer(n.FRAMEBUFFER,null),f!==n.FRAMEBUFFER_COMPLETE)return D("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${f.toString(16)}).`);let p=(m,h,b,y,g,v,x)=>{n.activeTexture(n.TEXTURE0+x),n.bindTexture(n.TEXTURE_2D,h),n.uniform1i(n.getUniformLocation(m,"uDepth"),x),n.uniform2f(n.getUniformLocation(m,"uNearFar"),b,y),n.uniform1f(n.getUniformLocation(m,"uTanHalfFov"),Math.tan(g*Math.PI/360)),n.uniform1f(n.getUniformLocation(m,"uAspect"),v)};return{get texture(){return d.tex},get width(){return s},get height(){return l},compute(m){n.disable(n.DEPTH_TEST),n.depthMask(!1),n.disable(n.BLEND),n.disable(n.CULL_FACE),n.bindFramebuffer(n.FRAMEBUFFER,d.fb),n.viewport(0,0,s,l),n.useProgram(o),p(o,m.depthTexture,m.near,m.far,m.fovDeg,m.aspect,0),n.uniform2f(n.getUniformLocation(o,"uTexel"),1/s,1/l),n.uniform1f(n.getUniformLocation(o,"uRadius"),m.radius??.55),n.uniform1f(n.getUniformLocation(o,"uStrength"),m.strength??1.15),n.uniform1f(n.getUniformLocation(o,"uBias"),m.bias??.035),e.blit(o);for(let[h,b,y]of[[d,u,[1,0]],[u,d,[0,1]]])n.bindFramebuffer(n.FRAMEBUFFER,b.fb),n.viewport(0,0,s,l),n.useProgram(a),p(a,m.depthTexture,m.near,m.far,m.fovDeg,m.aspect,0),n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,h.tex),n.uniform1i(n.getUniformLocation(a,"uAO"),1),n.uniform2f(n.getUniformLocation(a,"uTexel"),1/s,1/l),n.uniform2f(n.getUniformLocation(a,"uDir"),y[0],y[1]),e.blit(a);n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,null),n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,null),n.bindFramebuffer(n.FRAMEBUFFER,null),n.depthMask(!0),n.enable(n.DEPTH_TEST)},resize(m,h){let b=Math.max(1,m>>1),y=Math.max(1,h>>1);b===s&&y===l||(s=b,l=y,c())},dispose(){n.deleteProgram(o),n.deleteProgram(a);for(let m of[d,u])n.deleteFramebuffer(m.fb),n.deleteTexture(m.tex)}}}var Br=`
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
`;function Tn(e){let r=document.createElement("style");r.textContent=Br,document.head.appendChild(r);let t=document.createElement("section");t.id="lcx-fallback";let n=(o,a)=>{if(o===null)return`<td class="absent${a?" n":""}">absent</td>`;let s=String(o).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");return`<td class="${a?"n":""}">${s}</td>`};return t.innerHTML=`<h2>${e.title} \u2014 flat view</h2><p class="reads">${e.readsAs}</p>`+(e.notices??[]).map(o=>`<p class="notice">${o}</p>`).join("")+'<div id="lcx-refusal"></div>'+(e.html?`<div class="surface">${e.html}</div>`:"<table><thead><tr>"+e.columns.map(o=>`<th class="${o.numeric?"n":""}">${o.label}</th>`).join("")+"</tr></thead><tbody>"+e.rows.map(o=>"<tr>"+e.columns.map(a=>n(o[a.key]??null,!!a.numeric)).join("")+"</tr>").join("")+"</tbody></table>"),document.body.appendChild(t),{markRendered(){t.dataset.rendered="1"},showRefusal(o,a){let s=document.getElementById("lcx-refusal");s&&(s.innerHTML=`<p class="refusal"><strong>${o}</strong> \u2014 ${a} The measurements below are unaffected.</p>`),delete t.dataset.rendered;for(let l of Array.from(document.querySelectorAll("canvas")))l.style.display="none"}}}var de=new URLSearchParams(location.search),$t=de.get("settle")!=="0",jt=de.get("particles")!=="0",Xn=de.get("fog")!=="0",ye=Math.max(1,Math.min(3,Number(de.get("scale")??1))),$n=Number(de.get("frames")??300),V=1200*ye,H=720*ye,le=document.getElementById("c");le.width=V;le.height=H;var Wt=document.getElementById("log");function Yt(e){document.title="REFUSED",Wt.textContent=e;let[r,...t]=e.split(":");throw jn?.showRefusal(r?.trim()??"REFUSED",t.join(":").trim()||e),new Error(e)}var jn=null;function I(e,r){return"kind"in r&&Yt(`${e}: ${r.code} \u2014 ${r.reason} ${r.detail??""}`),r}var He=["SOURCED","QUALIFIED","DILIGENCE","TERMS","SIGNED"],Oe=[{name:"SABLE TREASURY",stage:"SOURCED",valueUsd:24e4,daysSinceUpdate:63,known:"OBSERVED"},{name:"PRAXIS DESK",stage:"SOURCED",valueUsd:null,daysSinceUpdate:9,known:"VALUE_ABSENT"},{name:"CASTOR LABS",stage:"SOURCED",valueUsd:15e4,daysSinceUpdate:34,known:"OBSERVED"},{name:"LUMEN CUSTODY",stage:"SOURCED",valueUsd:95e3,daysSinceUpdate:17,known:"OBSERVED"},{name:"TIBER CLEARING",stage:"QUALIFIED",valueUsd:31e4,daysSinceUpdate:4,known:"OBSERVED"},{name:"VANTA MARKETS",stage:"QUALIFIED",valueUsd:62e4,daysSinceUpdate:28,known:"OBSERVED"},{name:"\u2014",stage:"QUALIFIED",valueUsd:null,daysSinceUpdate:null,known:"WITHHELD"},{name:"HELIOS EXCHANGE",stage:"DILIGENCE",valueUsd:175e4,daysSinceUpdate:52,known:"OBSERVED"},{name:"KESTREL FUND",stage:"DILIGENCE",valueUsd:43e4,daysSinceUpdate:11,known:"OBSERVED"},{name:"MERIDIAN PAY",stage:"TERMS",valueUsd:26e5,daysSinceUpdate:41,known:"OBSERVED"},{name:"NORDIC CUSTODY",stage:"TERMS",valueUsd:88e4,daysSinceUpdate:6,known:"OBSERVED"},{name:"ATLAS OTC",stage:"SIGNED",valueUsd:42e5,daysSinceUpdate:3,known:"OBSERVED"}],z=45,Wn=Tn({title:"E3 \xB7 The Pipeline \u2014 deals by stage, package value and days since update",readsAs:`In the rendered view a deal is an object: its size is package value, its position along the channel is the gates it has cleared, and its HEIGHT is movement \u2014 a deal untouched for ${z} days rests on the floor of the channel. That is what this table cannot do. Every figure below is here, and sorting by any one column hides the other two, which is why the quantity that matters \u2014 value that has cleared diligence and then stopped \u2014 takes two sorts and arithmetic here and one look there.`,notices:[`SYNTHETIC DEALS \u2014 ${Oe.length} hand-authored records. The shape is deliberate (a funnel, value skewed to two names, the two largest late-stage deals stalled); the values are not measurements.`,"One deal was never priced and one is in a compartment that may not be read. Both are ABSENT below rather than blank or zero, the STATE column separates them, and every aggregate in the rendered view excludes both rather than estimating them."],columns:[{key:"name",label:"Deal"},{key:"stage",label:"Stage"},{key:"state",label:"State"},{key:"value",label:"Package value (USD)",numeric:!0},{key:"days",label:"Days since update",numeric:!0},{key:"movement",label:"Movement"}],rows:Oe.map(e=>({name:e.known==="WITHHELD"?"withheld":e.name,stage:e.stage,state:e.known,value:e.valueUsd,days:e.daysSinceUpdate,movement:e.daysSinceUpdate===null?null:e.daysSinceUpdate>=z?"stalled \u2014 on the floor":e.daysSinceUpdate>=.6*z?"stalled":"moving"}))});jn=Wn;de.get("refuse")==="1"&&Yt("FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. The channel is not being drawn.");var Ne=Ze(le,{alpha:!1});Qe(Ne)||Yt(`stage: ${Ne.code} \u2014 ${Ne.reason}`);var _=Ne,T=_.gl,kr=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Gr=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${st}
${it}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,Vr=I("present",_.compile(kr,Gr)),Lt=I("lit",Ft(_)),De=I("target",gt(_,V,H)),Ut=I("shadow",Tt(_,1536)),An=I("ao",Mt(_,V,H)),se=I("strokes",tt(_)),ue=.86,Yn=.46,Hr=Math.max(...Oe.map(e=>e.valueUsd??0)),zr=e=>Yn*Math.cbrt(e/Hr),ne=.11,S=1.45,Kt=2.2,Kn=-10.6,ge=Kn-2.6,me=1.7,Qn=me-ge,Nt=(me+ge)/2,K=1.15,ze=e=>Kn+e*Kt,Xr=.58,$r=.38,vn=.6,Ct=.66,Ot=.3,Rn=.16,Zn=e=>e%2===0?Rn:Rn+Ot+.06,Ie=.45,It=190,qn=13.5,Ee=Xn?Math.log(2)/qn:0,Fn="#0C1322",Jn=90,Qt=800,Be=1.4,Zt=2048,er=150,tr="#2C6BFF",nr="#C9552B",Xe="#E0A94A",rr="#5C6880",or=ut(2*S,40),ar=ae(.18,1.25,Qn),sr=ae(.1,K,.1),ir=ae(2*S,.05,.13),lr=ae(1,1,1),ur=dt(ne*1.25,ne*.34,40,14),cr=ct(ne,20,28),jr=I("floor",Y(_,or)),Sn=I("wall",Y(_,ar)),Mn=I("post",Y(_,sr)),Wr=I("sill",Y(_,ir)),Yr=I("deal",Y(_,lr)),Kr=I("absent",Y(_,ur)),Qr=I("withheld",Y(_,cr)),q=new Float32Array([1,0,0,0,1,0,0,0,1]),Zr=new Float32Array([1,0,0,0,0,1,0,-1,0]),J=(e,r,t,n=1)=>{let o=he();return o[0]=n,o[5]=n,o[10]=n,o[12]=e,o[13]=r,o[14]=t,o},qr=(e,r,t)=>{let n=he();return n[5]=0,n[6]=1,n[9]=-1,n[10]=0,n[12]=e,n[13]=r,n[14]=t,n},dr=.1,mr=40,ke={target:[0,.7,-5.2],distance:8.2,azimuthDeg:9,elevationDeg:14,fovDeg:35,near:dr,far:mr},X=_e(ke),Ln=new Map,L=Oe.map((e,r)=>{let t=He.indexOf(e.stage),n=Ln.get(e.stage)??0;Ln.set(e.stage,n+1);let o=ze(t)+Xr+n*$r,a=n%2===0?-vn:vn,s=e.valueUsd===null?null:zr(e.valueUsd),l=e.known==="VALUE_ABSENT"?"MASS_REFUSED_VALUE_NEVER_MEASURED":e.known==="WITHHELD"?"MASS_REFUSED_VALUE_WITHHELD":null,i=e.daysSinceUpdate===null?null:e.daysSinceUpdate/z,d=i===null?null:$t?Math.min(1,i):0,u=e.daysSinceUpdate===null?"SETTLE_REFUSED_LAST_TOUCH_WITHHELD":null,c=s!==null?s/2:ne,f=d===null?ue+.3:(1-d)*ue,p=f+c;return{d:e,i:r,stageIndex:t,slot:n,x:a,z:o,edge:s,settle:d,settleClamped:i!==null&&i>1,baseY:f,centreY:p,topY:f+2*c,massRefusal:l,settleRefusal:u,distance:Math.hypot(a-X[0],p-X[1],o-X[2])}}),Jr=L.filter(e=>{let r=e.edge!==null?e.edge/2:ne,t=e.z-ze(e.stageIndex);return t-r<.05||t+r>Kt-.05}).map(e=>e.d.name),eo=e=>L.filter(r=>r.stageIndex>=e&&r.d.known==="OBSERVED"&&r.d.valueUsd!==null).reduce((r,t)=>r+(t.d.valueUsd??0),0),C=He.map((e,r)=>{let t=ze(r),n=eo(r),o=n/Jn,a=o/Qt,s=Math.min(Kt,me-t-.2),l=Math.max(.2,s/Be);return{label:e,index:r,z:t,clearedUsd:n,usdPerDay:o,ratePerSec:a,life:l,linearDensityPerMetre:a/Be}}),to=[.1,.3,1.15],fr=C.map(e=>({at:[0,.34,e.z+.06],rate:e.ratePerSec,velocity:[0,0,Be],spread:.26,colour:to,life:e.life})),ee=jt?pt(_,Zt):null,B=ee!==null&&!("kind"in ee)?ee:null,Bt=ee!==null&&"kind"in ee?`${ee.code} \u2014 ${ee.reason}`:jt?null:"DISABLED_BY_PARAM",no=Math.round(C.reduce((e,r)=>e+r.ratePerSec*r.life,0)),_n=C.reduce((e,r)=>e+r.ratePerSec,0),wn=_n>0?(B?.slots??Zt)/_n:1/0,Dn=Math.max(...C.map(e=>e.life)),pr={sources:fr,dtSeconds:1/60,noiseScale:.55,noiseStrength:.12,drag:.5},Pn={baseColour:P("#1E2A42"),roughness:.6,metalness:.03},_t={baseColour:P("#31415C"),roughness:.36,metalness:.2},hr=J(0,0,Nt,1);hr[10]=Qn/(2*S);var te=[{mesh:jr,model:hr,normalMat:q,material:{baseColour:P("#22304A"),roughness:.82,metalness:0}},{mesh:Sn,model:J(-(S+.09),.625,Nt),normalMat:q,material:Pn},{mesh:Sn,model:J(S+.09,.625,Nt),normalMat:q,material:Pn}];for(let e of C)te.push({mesh:Mn,model:J(-(S+.05),K/2,e.z),normalMat:q,material:_t},{mesh:Mn,model:J(S+.05,K/2,e.z),normalMat:q,material:_t},{mesh:Wr,model:J(0,.025,e.z),normalMat:q,material:_t});for(let e of L)if(e.d.known==="WITHHELD")te.push({mesh:Qr,model:J(e.x,e.centreY,e.z),normalMat:q,material:{baseColour:P(rr),roughness:.55,metalness:.25}});else if(e.edge===null)te.push({mesh:Kr,model:qr(e.x,e.centreY,e.z),normalMat:Zr,material:{baseColour:P(Xe),roughness:.44,metalness:.1}});else{let r=at(P(tr),P(nr),e.settle??0);te.push({mesh:Yr,model:J(e.x,e.centreY,e.z,e.edge),normalMat:q,material:{baseColour:r,roughness:.34+.16*(e.settle??0),metalness:.06}})}var br=[-.62,-.38,-.69],Un=[-2,0,ge],Nn=[2,1.9,me],Cn=Et({direction:br,colour:[1,1,1],extent:9.6},yt(Un,Nn),xt(Un,Nn)),ro=j(or)+2*j(ar)+C.length*(2*j(sr)+j(ir))+L.filter(e=>e.d.known==="OBSERVED").length*j(lr)+L.filter(e=>e.d.known==="VALUE_ABSENT").length*j(ur)+L.filter(e=>e.d.known==="WITHHELD").length*j(cr),$=we(ke,V/H),U=V/ye,N=H/ye,qt=e=>Ee<=0?0:1-Math.exp(-Ee*e),xe=e=>e>=1e6?`$${(e/1e6).toFixed(2)}M`:e>=1e4?`$${Math.round(e/1e3)}k`:`$${(e/1e3).toFixed(1)}k`,wt=[],On=(e,r,t)=>{let n=0;for(let o=0;o<4;o++){let a=e[o],s=e[(o+1)%4],l=(s.x-a.x)*(t-a.y)-(s.y-a.y)*(r-a.x);if(Math.abs(l)<1e-9)continue;let i=l>0?1:-1;if(n===0)n=i;else if(i!==n)return!1}return!0},Er=e=>{let r=O($,[e.x,e.baseY,e.z],U,N),t=O($,[e.x,e.topY,e.z],U,N);return r.behind||t.behind?0:Math.abs(r.sy-t.sy)},xr=e=>{let r=O($,[e.x,e.centreY,e.z],U,N);if(r.behind)return!1;let t=O($,[e.x,e.topY,e.z],U,N),n=Math.max(6,Math.abs(r.sy-t.sy));return r.sx>n&&r.sx<U-n&&r.sy>n&&r.sy<N-n},Ge=e=>{let r=O($,[e.x,e.centreY,e.z],U,N);return r.behind?null:r.sy},Jt=e=>{if(e.settle===null)return null;let r=e.edge!==null?e.edge/2:ne,t=O($,[e.x,e.baseY+r,e.z],U,N),n=O($,[e.x,ue+r,e.z],U,N);return t.behind||n.behind?null:Math.abs(t.sy-n.sy)},$e=[...L].sort((e,r)=>e.distance-r.distance).map(e=>{let r=e.d.known==="WITHHELD",t=e.distance>qn,n=Math.round(Ct*It),o=Math.round(Ot*It),a=e.x<0?e.x-Ie:e.x+Ie,s=Math.atan2(X[0]-a,X[2]-e.z),l=ft(a,e.z,e.topY+Zn(e.slot),Ct,Ot,s,0),i=mt($,l,U,N,n,o),d=W(i)?i.refusal:null,u=!W(i)&&i.signedArea<=0,c=W(i)?0:Math.max(Math.hypot(i.screen[0].x-i.screen[1].x,i.screen[0].y-i.screen[1].y),Math.hypot(i.screen[3].x-i.screen[2].x,i.screen[3].y-i.screen[2].y)),f=c<26,p=W(i)?!1:i.screen.every(y=>y.x<0||y.x>U||y.y<0||y.y>N),m=W(i)?0:i.screen.filter(y=>wt.some(g=>On(g,y.x,y.y))).length+wt.reduce((y,g)=>y+g.filter(v=>On(i.screen.map(x=>({x:x.x,y:x.y})),v.x,v.y)).length,0),h=m>=2,b=!d&&!u&&!r&&!t&&!f&&!p&&!h;return b&&!W(i)&&wt.push(i.screen.map(y=>({x:y.x,y:y.y}))),{p:e,proj:i,shown:b,ew:n,eh:o,refusal:d,backFacing:u,withheld:r,tooFar:t,edgeOn:f,offFrame:p,occluded:h,widthPx:c,coveredCorners:m}}),oo=$e.filter(e=>e.shown).map(e=>e.p),Pe={colour:P("#4E8CFF"),gain:1.5},ao={colour:P("#7FB2FF"),gain:1.1},so={colour:P("#7FB2FF"),gain:.45},yr=ze(3),gr=[0,20,z].map(e=>({days:e,y:(1-Math.min(1,e/z))*ue+.012,label:e>=z?`${e}d+`:`${e}d`}));function kt(){let e=we(ke,V/H);B&&B.step(pr),Lt.shadowPass(Cn,te,Ut),De.bind();let r=P(Fn);T.clearColor(r[0],r[1],r[2],1),T.clear(T.COLOR_BUFFER_BIT|T.DEPTH_BUFFER_BIT),Lt.depthPrepass(e,te),An.compute({depthTexture:De.depthTexture,near:dr,far:mr,fovDeg:ke.fovDeg??35,aspect:V/H,radius:.36,strength:1.25}),De.bind(),Lt.draw({viewProj:e,eye:X,lightDir:br,lightColour:[3.4,3.3,3.14],ambientGain:.44,lightVP:Cn,shadow:Ut,shadowStrength:.92,draws:te,ao:An.texture,screenSize:[V,H],fog:Ee>0?{density:Ee,height:5,floor:0,colour:P(Fn)}:null}),T.enable(T.BLEND),T.blendFunc(T.ONE,T.ONE),T.enable(T.DEPTH_TEST),T.depthMask(!1);for(let t of C)se.ruleAtDepth(e,-S,.02,S,.02,t.z,.012,Pe),se.ruleAtDepth(e,-S,K,S,K,t.z,.01,Pe),se.ruleAtDepth(e,-S,.02,-S,K,t.z,.01,Pe),se.ruleAtDepth(e,S,.02,S,K,t.z,.01,Pe);for(let t of gr)se.ruleAtDepth(e,-(S+.48),t.y,-(S+.2),t.y,yr,.006,ao);for(let t of oo){let n=t.x<0?t.x-Ie:t.x+Ie;se.ruleAtDepth(e,t.x,t.topY,n,t.topY+Zn(t.slot),t.z,.008,so)}T.depthMask(!0),T.disable(T.BLEND),B&&B.draw({viewProj:e,sources:fr,pointScale:18}),T.bindFramebuffer(T.FRAMEBUFFER,null),T.viewport(0,0,V,H),T.disable(T.DEPTH_TEST),T.activeTexture(T.TEXTURE0),T.bindTexture(T.TEXTURE_2D,De.texture),_.blit(Vr,t=>T.uniform1i(T.getUniformLocation(t,"uScene"),0))}function io(e){kt();let r=new Uint8Array(4);T.readPixels(0,0,1,1,T.RGBA,T.UNSIGNED_BYTE,r);let t=performance.now();for(let n=0;n<e;n++)kt();return T.readPixels(0,0,1,1,T.RGBA,T.UNSIGNED_BYTE,r),(performance.now()-t)/e}if(B)for(let e=0;e<er;e++)B.step(pr);var Dt=io(Math.max(1,$n)),je=document.createElement("div");je.style.cssText=`position:relative;overflow:hidden;width:${U}px;height:${N}px`;le.parentNode?.insertBefore(je,le);je.appendChild(le);var re=document.createElement("div");re.style.cssText="position:absolute;inset:0;pointer-events:none";je.appendChild(re);for(let e of[...$e].sort((r,t)=>t.p.distance-r.p.distance)){let{p:r,proj:t,shown:n,ew:o,eh:a}=e;if(!n||W(t))continue;let s=qt(r.distance),l=document.createElement("div");l.style.cssText=`position:absolute;left:0;top:0;width:${o}px;height:${a}px;transform-origin:0 0;transform:${t.transform};display:flex;flex-direction:column;justify-content:center;gap:3px;padding:0 5px;overflow:hidden;opacity:${(1-.7*s).toFixed(3)};-webkit-font-smoothing:antialiased`;let i=r.d.valueUsd===null?`<span style="color:${Xe}">VALUE ABSENT</span>`:xe(r.d.valueUsd),d=r.d.daysSinceUpdate===null?"\u2014":`${r.d.daysSinceUpdate} d`;l.innerHTML=`<div style="font:700 11px/1.05 ui-monospace,monospace;color:#fff">${r.d.name}</div><div style="font:400 10.5px/1.2 ui-monospace,monospace;color:rgba(255,255,255,0.80)">${i} \xB7 ${d}</div><div style="font:600 9px/1 ui-monospace,monospace;letter-spacing:.14em;color:rgba(255,255,255,0.60)">${r.d.stage}</div>`,re.appendChild(l)}var In=[],Bn=[...C].reverse().map(e=>{let r=e.index%2===0,t=O($,[r?-(S+.14):S+.14,2.1,e.z],U,N),n=qt(Math.hypot(X[0],X[1]-K,X[2]-e.z)),o=!t.behind&&t.sx>30&&t.sx<U-30&&t.sy>8&&t.sy<N-8,a=o&&In.some(s=>Math.hypot(s.x-t.sx,s.y-t.sy)<30);if(o&&!a){In.push({x:t.sx,y:t.sy});let s=document.createElement("div");s.style.cssText=`position:absolute;left:${t.sx.toFixed(1)}px;top:${t.sy.toFixed(1)}px;transform:translate(${r?"-100%":"0"},-100%);text-align:${r?"right":"left"};white-space:nowrap;opacity:${(1-.72*n).toFixed(3)}`,s.innerHTML=`<div style="font:600 10px/1.25 ui-monospace,monospace;letter-spacing:.16em;color:#9CC2FF">${e.label}</div><div style="font:400 9.5px/1.25 ui-monospace,monospace;color:rgba(196,212,240,0.72)">${xe(e.usdPerDay)}/d</div>`,re.appendChild(s)}return{stage:e.label,sx:Math.round(t.sx),sy:Math.round(t.sy),onFrame:o,crowded:a}}),lo=[{y:ue+.15,label:"DAYS SINCE UPDATE"},...gr].map(e=>{let r=O($,[-(S+.56),e.y,yr],U,N),t=!r.behind&&r.sx>0&&r.sx<U&&r.sy>0&&r.sy<N;if(t){let n=document.createElement("div");n.style.cssText=`position:absolute;left:${r.sx.toFixed(1)}px;top:${r.sy.toFixed(1)}px;transform:translate(-100%,-50%);font:500 9.5px/1 ui-monospace,monospace;letter-spacing:.08em;color:rgba(196,212,240,0.78);white-space:nowrap;padding-right:5px`,n.textContent=e.label,re.appendChild(n)}return{label:e.label,onFrame:t}}),Tr=He.map((e,r)=>{let t=L.filter(l=>l.stageIndex===r&&l.settle!==null&&l.edge!==null);if(t.length<2)return{stage:e,readable:t.length,separationPx:null};let n=t.reduce((l,i)=>(i.settle??0)>(l.settle??0)?i:l),o=t.reduce((l,i)=>(i.settle??0)<(l.settle??0)?i:l),a=Ge(n),s=Ge(o);return{stage:e,readable:t.length,separationPx:a===null||s===null?null:Math.round(Math.abs(a-s))}}),kn=Tr.map(e=>e.separationPx).filter(e=>e!==null),uo=kn.length>0?Math.min(...kn):0,Ar=[];for(let e of L)for(let r of L){if(e.i>=r.i||e.stageIndex!==r.stageIndex||e.settle===null||r.settle===null)continue;let[t,n]=e.settle>r.settle?[e,r]:[r,e],o=Ge(t),a=Ge(n);o!==null&&a!==null&&o<a&&Ar.push(`${t.d.name} above ${n.d.name}`)}var ce=L.filter(e=>e.edge!==null&&e.d.known==="OBSERVED"),Gt=new Map;for(let e of ce)Gt.set(e.i,Er(e));var vr=0,Rr=0;for(let e of ce)for(let r of ce){if(e.i>=r.i)continue;let[t,n]=(e.d.valueUsd??0)>(r.d.valueUsd??0)?[e,r]:[r,e];(Gt.get(t.i)??0)<(Gt.get(n.i)??0)&&(vr++,t.stageIndex===n.stageIndex&&Rr++)}var en=.6,Ce=ce.reduce((e,r)=>e+(r.d.valueUsd??0),0),Te=ce.filter(e=>(e.settle??0)>=en),Gn=Te.reduce((e,r)=>e+(r.d.valueUsd??0),0),co=Te.filter(e=>e.stageIndex>=He.indexOf("DILIGENCE")),Ve=co.reduce((e,r)=>e+(r.d.valueUsd??0),0),Vn=Te.map(e=>Jt(e)).filter(e=>e!==null),mo=Vn.length>0?Math.round(Math.min(...Vn)):0,fo=Math.round(Math.max(0,...L.map(e=>Jt(e)).filter(e=>e!==null))),ie={OBSERVED:L.filter(e=>e.d.known==="OBSERVED").length,VALUE_ABSENT:L.filter(e=>e.d.known==="VALUE_ABSENT").length,WITHHELD:L.filter(e=>e.d.known==="WITHHELD").length},tn=document.createElement("div");tn.style.cssText="position:absolute;left:18px;top:16px;display:flex;flex-direction:column;gap:7px";tn.innerHTML=`<div style="font:600 11px/1 ui-monospace,monospace;letter-spacing:.16em;color:#8FB7FF">PIPELINE \xB7 SIZE IS VALUE, HEIGHT IS MOVEMENT</div><div style="font:400 10.5px/1.55 ui-monospace,monospace;color:rgba(196,212,240,0.86)"><b style="color:#FF9B76">${xe(Ve)}</b> PAST DILIGENCE AND STALLED &nbsp;\xB7&nbsp; ${Math.round(100*Ve/Math.max(1,Ce))}% OF THE READABLE BOOK<br>${z} d = ON THE FLOOR &nbsp;\xB7&nbsp; 1 PARTICLE = ${xe(Qt)}/d CLEARED<br>${$t?"MOVEMENT AXIS ON":"MOVEMENT AXIS OFF \u2014 every deal pinned to the rail"} &nbsp;\xB7&nbsp; ${Bt===null?"THROUGHPUT ON":`THROUGHPUT OFF \u2014 ${Bt.split(" \u2014 ")[0]}`}</div><div style="font:500 10px/1.4 ui-monospace,monospace;color:${Xe}">SYNTHETIC DEALS</div>`;re.appendChild(tn);var nn=document.createElement("div");nn.style.cssText="position:absolute;right:18px;bottom:16px;display:flex;flex-direction:column;gap:6px;align-items:flex-end;font:500 10.5px/1 ui-monospace,monospace";nn.innerHTML=[[tr,"UPDATED \xB7 rides the rail"],[nr,`STALLED \xB7 ${Te.length} of ${ie.OBSERVED} at ${Math.round(en*z)} d+`],[Xe,`VALUE ABSENT \xB7 ${ie.VALUE_ABSENT} (ring: no mass to give)`],[rr,`WITHHELD \xB7 ${ie.WITHHELD} (off the movement axis)`]].map(([e,r])=>`<div style="display:flex;align-items:center;gap:7px;color:rgba(196,212,240,0.85)"><span>${r}</span><span style="width:11px;height:11px;background:${e};display:inline-block"></span></div>`).join("");re.appendChild(nn);var be=B?B.readState():null,Vt=0,Fr=0,Ht=1/0,zt=-1/0;if(be&&B)for(let e=0;e<B.slots;e++){let r=be[e*4],t=be[e*4+1],n=be[e*4+2];be[e*4+3]<0||(Vt++,n<Ht&&(Ht=n),n>zt&&(zt=n),(Math.abs(r)>S||t<-.15||t>K+.25||n<ge||n>me)&&Fr++)}var Sr=(()=>{let e=T.getExtension("WEBGL_debug_renderer_info");return e?String(T.getParameter(e.UNMASKED_RENDERER_WEBGL)):"unknown"})(),Pt=/swiftshader|llvmpipe|software/i.test(Sr),Xt=lt();if(Xt.length>0){let e="BRAND FIDELITY FAILED \u2014 "+Xt.map(r=>`${r.key}: expected ${r.expected}, got ${r.actual}`).join("; ");throw document.title="REFUSED",Wt.textContent=e,new Error(e)}var Ue=$e.map(e=>({name:e.p.d.name,stage:e.p.d.stage,known:e.p.d.known,valueUsd:e.p.d.valueUsd,days:e.p.d.daysSinceUpdate,edgeM:e.p.edge===null?null:Number(e.p.edge.toFixed(3)),settle:e.p.settle===null?null:Number(e.p.settle.toFixed(3)),settleClamped:e.p.settleClamped,baseY:Number(e.p.baseY.toFixed(3)),distance:Number(e.p.distance.toFixed(2)),screenHeightPx:Math.round(Er(e.p)),fallenPx:(()=>{let r=Jt(e.p);return r===null?null:Math.round(r)})(),fog:Number(qt(e.p.distance).toFixed(3)),tagWidthPx:Math.round(e.widthPx),tagShown:e.shown,massRefusal:e.p.massRefusal,settleRefusal:e.p.settleRefusal,hiddenBecause:e.shown?null:e.withheld?"WITHHELD":e.refusal?e.refusal:e.backFacing?"BACK_FACING":e.offFrame?"OFF_FRAME":e.edgeOn?"EDGE_ON":e.tooFar?"BEYOND_LEGIBLE_RANGE":"OCCLUDED",objectOnFrame:xr(e.p)})),Mr={settleAxis:$t,particlesRequested:jt,fog:Xn,fogDensity:Number(Ee.toFixed(4)),hdr:_.hdr,eye:X.map(e=>Number(e.toFixed(2))),deals:L.length,counts:ie,aggregateExcludes:{valueAbsent:ie.VALUE_ABSENT,withheld:ie.WITHHELD,code:"AGGREGATE_EXCLUDES_UNREADABLE_VALUE"},totalObservedUsd:Ce,stallDays:z,stalledFrom:en,stalledCount:Te.length,stalledUsd:Gn,stalledShare:Number((Gn/Math.max(1,Ce)).toFixed(3)),deepStalledUsd:Ve,deepStalledShare:Number((Ve/Math.max(1,Ce)).toFixed(3)),settleClamped:L.filter(e=>e.settleClamped).length,minStalledDisplacementPx:mo,maxDisplacementPx:fo,minSeparationPx:uo,settleInversions:Ar,railLiftM:ue,edgeMaxM:Yn,edgeMinM:Number(Math.min(...ce.map(e=>e.edge??0)).toFixed(3)),referenceSizeM:ne,massAmbiguousPairs:vr,massAmbiguousWithinStage:Rr,outOfSegment:Jr,windowDays:Jn,usdPerParticle:Qt,particleSpeed:Be,rateMonotoneDown:C.every((e,r)=>r===0||e.ratePerSec<=C[r-1].ratePerSec+1e-9),rateRatioFirstLast:Number((C[0].ratePerSec/Math.max(1e-9,C[C.length-1].ratePerSec)).toFixed(2)),particleField:{refusal:Bt,capacity:Zt,slots:B?.slots??0,aliveExpected:no,aliveActual:Vt,outOfChannel:Fr,zRange:Vt>0?[Number(Ht.toFixed(2)),Number(zt.toFixed(2))]:null,channelZ:[ge,me],slotRecycleSeconds:Number(wn.toFixed(2)),maxLifeSeconds:Number(Dn.toFixed(2)),recycleSafe:wn>Dn,primeSteps:er},tagsShown:$e.filter(e=>e.shown).length,hiddenBy:Ue.filter(e=>!e.tagShown).reduce((e,r)=>{let t=r.hiddenBecause??"UNKNOWN";return e[t]=(e[t]??0)+1,e},{}),nameOverflow:L.filter(e=>e.d.known!=="WITHHELD"&&e.d.name.length*6.6>Ct*It-10).map(e=>e.d.name),objectsOffFrame:L.filter(e=>!xr(e)).map(e=>e.d.name),gateLabelsOffFrame:Bn.filter(e=>!e.onFrame).map(e=>e.stage),gateLabelsCrowded:Bn.filter(e=>e.crowded).map(e=>e.stage),axisLabelsOffFrame:lo.filter(e=>!e.onFrame).length,fogNearest:Math.min(...Ue.map(e=>e.fog)),fogFurthest:Math.max(...Ue.map(e=>e.fog)),brandFidelity:Xt,glError:T.getError(),triangles:ro,shadowMap:Ut.size,resolution:`${V}x${H}`,dprScale:ye,frames:$n,msPerFrame:Number(Dt.toFixed(3)),fps:Math.round(1e3/Dt),renderer:Sr,rendererClass:Pt?"software":"hardware",headroom:Pt?null:Number((16.6-Dt).toFixed(3)),headroomRefusal:Pt?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null,hardwareMsPerFrame:null,gates:C.map(e=>({stage:e.label,z:e.z,clearedUsd:e.clearedUsd,usdPerDay:Math.round(e.usdPerDay),ratePerSec:Number(e.ratePerSec.toFixed(2)),perMetre:Number(e.linearDensityPerMetre.toFixed(2)),lifeSeconds:Number(e.life.toFixed(2))})),perStageSeparation:Tr,perDeal:Ue};globalThis.E3=Mr;var{perDeal:Hn,gates:zn,perStageSeparation:po,...ho}=Mr;Wt.textContent=JSON.stringify(ho,null,2)+`

gates (${zn.length}):
`+zn.map(e=>`  ${e.stage.padEnd(10)} $${String(e.usdPerDay).padStart(7)}/d ${String(e.ratePerSec).padStart(7)} p/s ${String(e.perMetre).padStart(7)} p/m life ${e.lifeSeconds}s`).join(`
`)+`

settle separation on screen:
`+po.map(e=>`  ${e.stage.padEnd(10)} ${e.separationPx===null?"n/a (needs 2 readable)":`${e.separationPx} px`}`).join(`
`)+`

perDeal (${Hn.length}, full detail on globalThis.E3):
`+Hn.map(e=>`  ${e.name.padEnd(16)} ${e.stage.padEnd(10)} ${(e.valueUsd===null?"ABSENT":xe(e.valueUsd)).padStart(7)} ${(e.days===null?"\u2014":`${e.days}d`).padStart(4)} base ${e.baseY.toFixed(2)} fallen ${String(e.fallenPx??"\u2014").padStart(3)}px ${String(e.distance).padStart(5)}m ${String(e.screenHeightPx).padStart(3)}px ${e.tagShown?"TAG":`no tag: ${e.hiddenBecause}`}`).join(`
`);kt();Wn.markRendered();document.title="READY";

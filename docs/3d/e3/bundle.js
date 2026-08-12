var zt={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected."};function D(t,n){return n===void 0?{kind:"refused",code:t,reason:zt[t]}:{kind:"refused",code:t,reason:zt[t],detail:n}}function We(t){return t.kind==="stage"}function $e(t,n={}){let e=t.getContext("webgl2",{antialias:n.antialias??!1,alpha:n.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!e)return D("NO_WEBGL2");let r=e.getExtension("EXT_color_buffer_float"),o=t.width,a=t.height,i=r?e.RGBA16F:e.RGBA8,s=r?e.HALF_FLOAT:e.UNSIGNED_BYTE,l=(x,R)=>{let y=e.createTexture();e.bindTexture(e.TEXTURE_2D,y),e.texImage2D(e.TEXTURE_2D,0,i,x,R,0,e.RGBA,s,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE);let b=e.createFramebuffer();e.bindFramebuffer(e.FRAMEBUFFER,b),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,y,0);let A=e.checkFramebufferStatus(e.FRAMEBUFFER);return A!==e.FRAMEBUFFER_COMPLETE?D("FRAMEBUFFER_INCOMPLETE",`status 0x${A.toString(16)} at ${x}\xD7${R}`):{texture:y,framebuffer:b,width:x,height:R}},d=n.bloomShift??2,u={w:o,h:a},c=l(o,a);if("kind"in c)return c;let f=l(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in f)return f;let p=l(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in p)return p;let m=e.createVertexArray();e.bindVertexArray(m);let E=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,E),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindVertexArray(null);let h=[];return{kind:"stage",gl:e,cssWidth:t.clientWidth||o,cssHeight:t.clientHeight||a,hdr:!!r,get width(){return u.w},get height(){return u.h},get scene(){return c},get bloomA(){return f},get bloomB(){return p},setRegion(x,R){let y=Math.max(1,Math.round(x)),b=Math.max(1,Math.round(R));if(!(y===u.w&&b===u.h)){u={w:y,h:b};for(let A of[c,f,p])"kind"in A||(e.deleteFramebuffer(A.framebuffer),e.deleteTexture(A.texture));c=l(y,b),f=l(Math.max(1,y>>d),Math.max(1,b>>d)),p=l(Math.max(1,y>>d),Math.max(1,b>>d))}},compile(x,R){let y=(B,M)=>{let F=e.createShader(B);return e.shaderSource(F,M),e.compileShader(F),e.getShaderParameter(F,e.COMPILE_STATUS)?F:D("SHADER_COMPILE_FAILED",e.getShaderInfoLog(F)??"(no log)")},b=y(e.VERTEX_SHADER,x);if(typeof b=="object"&&"kind"in b)return b;let A=y(e.FRAGMENT_SHADER,R);if(typeof A=="object"&&"kind"in A)return A;let v=e.createProgram();return e.attachShader(v,b),e.attachShader(v,A),e.linkProgram(v),e.getProgramParameter(v,e.LINK_STATUS)?(h.push(v),v):D("PROGRAM_LINK_FAILED",e.getProgramInfoLog(v)??"(no log)")},bindTarget(x){e.bindFramebuffer(e.FRAMEBUFFER,x?x.framebuffer:null),e.viewport(0,0,x?x.width:u.w,x?x.height:u.h)},blit(x,R){e.useProgram(x),e.bindVertexArray(m),R?.(x),e.drawArrays(e.TRIANGLES,0,3),e.bindVertexArray(null)},dispose(){for(let x of h)e.deleteProgram(x);for(let x of[c,f,p])"kind"in x||(e.deleteFramebuffer(x.framebuffer),e.deleteTexture(x.texture));e.deleteBuffer(E),e.deleteVertexArray(m)}}}var de=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function Te(t,n){let e=new Float32Array(16);for(let r=0;r<4;r++)for(let o=0;o<4;o++){let a=0;for(let i=0;i<4;i++)a+=t[i*4+o]*n[r*4+i];e[r*4+o]=a}return e}var ge=(t,n)=>[t[0]-n[0],t[1]-n[1],t[2]-n[2]],ye=(t,n)=>t[0]*n[0]+t[1]*n[1]+t[2]*n[2],Ye=(t,n)=>[t[1]*n[2]-t[2]*n[1],t[2]*n[0]-t[0]*n[2],t[0]*n[1]-t[1]*n[0]];function ce(t){let n=Math.hypot(t[0],t[1],t[2]);return n===0?t:[t[0]/n,t[1]/n,t[2]/n]}function Ke(t,n,e,r){let o=1/Math.tan(t/2);return new Float32Array([o/n,0,0,0,0,o,0,0,0,0,(r+e)/(e-r),-1,0,0,2*r*e/(e-r),0])}function Qe(t,n,e,r,o,a){let i=n-t,s=r-e,l=a-o;return new Float32Array([2/i,0,0,0,0,2/s,0,0,0,0,-2/l,0,-(n+t)/i,-(r+e)/s,-(a+o)/l,1])}function Ae(t,n,e){let r=ce(ge(t,n)),o=Ye(e,r);if(Math.hypot(o[0],o[1],o[2])<1e-8)return de();let a=ce(o),i=Ye(r,a);return new Float32Array([a[0],i[0],r[0],0,a[1],i[1],r[1],0,a[2],i[2],r[2],0,-ye(a,t),-ye(i,t),-ye(r,t),1])}function Xt(t,n){let e=[0,1,2,3].map(o=>t[0+o]*n[0]+t[4+o]*n[1]+t[8+o]*n[2]+t[12+o]),r=e[3];return{x:e[0]/r,y:e[1]/r,z:e[2]/r,w:r}}function X(t,n,e,r){let o=Xt(t,n);return{sx:(o.x*.5+.5)*e,sy:(1-(o.y*.5+.5))*r,behind:o.w<=0}}var jt=`#version 300 es
precision highp float;
layout(location=0) in vec3 p;
uniform mat4 uMVP;
out float vY;
void main(){ vY = p.y; gl_Position = uMVP * vec4(p, 1.0); }`,Wt=`#version 300 es
precision highp float;
in float vY;
uniform vec3 uColour;
uniform float uGain, uFade, uFadeFrom, uFadeTo;
out vec4 frag;
void main(){
  float t = clamp((vY - uFadeFrom) / max(uFadeTo - uFadeFrom, 1e-4), 0.0, 1.0);
  frag = vec4(uColour * uGain * (1.0 - uFade * t), 1.0);
}`;function Ze(t){let{gl:n}=t,e=t.compile(jt,Wt);if("kind"in e)return e;let r=n.createVertexArray();n.bindVertexArray(r);let o=n.createBuffer();n.bindBuffer(n.ARRAY_BUFFER,o),n.enableVertexAttribArray(0),n.vertexAttribPointer(0,3,n.FLOAT,!1,0,0),n.bindVertexArray(null);let a=d=>n.getUniformLocation(e,d),i={mvp:a("uMVP"),colour:a("uColour"),gain:a("uGain"),fade:a("uFade"),fadeFrom:a("uFadeFrom"),fadeTo:a("uFadeTo")},s=(d,u,c)=>{n.useProgram(e),n.bindVertexArray(r),n.bindBuffer(n.ARRAY_BUFFER,o),n.bufferData(n.ARRAY_BUFFER,u,n.STREAM_DRAW),n.uniformMatrix4fv(i.mvp,!1,d),n.uniform3fv(i.colour,c.colour),n.uniform1f(i.gain,c.gain),n.uniform1f(i.fade,c.fade??0),n.uniform1f(i.fadeFrom,c.fadeFrom??0),n.uniform1f(i.fadeTo,c.fadeTo??1),n.drawArrays(n.TRIANGLE_STRIP,0,u.length/3),n.bindVertexArray(null)},l=(d,u,c,f,p,m,E,h)=>{let T=f-u,x=p-c,R=Math.hypot(T,x)||1,y=-x/R*E,b=T/R*E;s(d,new Float32Array([u-y,c-b,m,u+y,c+b,m,f-y,p-b,m,f+y,p+b,m]),h)};return{rule(d,u,c,f,p,m,E){l(d,u,c,f,p,0,m,E)},ruleAtDepth(d,u,c,f,p,m,E,h){l(d,u,c,f,p,m,E,h)},curve(d,u,c,f){let p=u.length/2,m=new Float32Array(p*6);for(let E=0;E<p;E++){let h=u[E*2],T=u[E*2+1];m[E*6+0]=h,m[E*6+1]=T-c,m[E*6+2]=0,m[E*6+3]=h,m[E*6+4]=T+c,m[E*6+5]=0}s(d,m,f)},dispose(){n.deleteBuffer(o),n.deleteVertexArray(r)}}}function $t(t){return t<=.04045?t/12.92:Math.pow((t+.055)/1.055,2.4)}var dn=/^#?([0-9a-fA-F]{6})$/;function w(t){let n=dn.exec(t.trim());if(!n)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(t)}`);let e=n[1];return[0,2,4].map(r=>$t(parseInt(e.slice(r,r+2),16)/255))}var qe={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},mn=Object.freeze(Object.fromEntries(Object.keys(qe).map(t=>[t,w(qe[t])])));function Je(t,n,e){let r=Math.min(1,Math.max(0,e));return[t[0]+(n[0]-t[0])*r,t[1]+(n[1]-t[1])*r,t[2]+(n[2]-t[2])*r]}var Yt=.4;var et=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${Yt.toFixed(2)}); }`,tt=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function fn(t){let n=[1/0,1/0,1/0],e=[-1/0,-1/0,-1/0];for(let r=0;r<t.length;r+=3)for(let o=0;o<3;o++){let a=t[r+o];a<n[o]&&(n[o]=a),a>e[o]&&(e[o]=a)}return t.length===0?{min:[0,0,0],max:[0,0,0]}:{min:n,max:e}}function Kt(t,n,e,r){let o=new Float32Array(t.length);for(let i=0;i<r.length;i+=3){let s=r[i],l=r[i+1],d=r[i+2],u=s*3,c=l*3,f=d*3,p=s*2,m=l*2,E=d*2,h=t[c]-t[u],T=t[c+1]-t[u+1],x=t[c+2]-t[u+2],R=t[f]-t[u],y=t[f+1]-t[u+1],b=t[f+2]-t[u+2],A=e[m]-e[p],v=e[m+1]-e[p+1],B=e[E]-e[p],M=e[E+1]-e[p+1],F=A*M-B*v;if(Math.abs(F)<1e-12)continue;let L=1/F,ue=(h*M-R*v)*L,ke=(T*M-y*v)*L,ze=(x*M-b*v)*L;for(let C of[u,c,f])o[C]=o[C]+ue,o[C+1]=o[C+1]+ke,o[C+2]=o[C+2]+ze}let a=new Float32Array(t.length);for(let i=0;i<a.length;i+=3){let s=n[i],l=n[i+1],d=n[i+2],u=o[i],c=o[i+1],f=o[i+2],p=u*s+c*l+f*d;u-=s*p,c-=l*p,f-=d*p;let m=Math.hypot(u,c,f);m<1e-8&&(Math.abs(s)<.9?(u=0,c=-d,f=l):(u=-d,c=0,f=s),m=Math.hypot(u,c,f)||1),a[i]=u/m,a[i+1]=c/m,a[i+2]=f/m}return a}function Qt(t,n){let e=new Float32Array(t.length);for(let r=0;r<n.length;r+=3){let o=n[r]*3,a=n[r+1]*3,i=n[r+2]*3,s=t[a]-t[o],l=t[a+1]-t[o+1],d=t[a+2]-t[o+2],u=t[i]-t[o],c=t[i+1]-t[o+1],f=t[i+2]-t[o+2],p=l*f-d*c,m=d*u-s*f,E=s*c-l*u;for(let h of[o,a,i])e[h]=e[h]+p,e[h+1]=e[h+1]+m,e[h+2]=e[h+2]+E}for(let r=0;r<e.length;r+=3){let o=Math.hypot(e[r],e[r+1],e[r+2]);o>0&&(e[r]=e[r]/o,e[r+1]=e[r+1]/o,e[r+2]=e[r+2]/o)}return e}function Re(t,n,e,r,o){let{min:a,max:i}=fn(t),s=r??Qt(t,e);return{positions:t,normals:s,uvs:n,indices:e,min:a,max:i,tangents:o??Kt(t,s,n,e)}}function Z(t=1,n=1,e=1){let r=t/2,o=n/2,a=e/2,i=[[[-r,-o,a],[r,-o,a],[r,o,a],[-r,o,a]],[[r,-o,-a],[-r,-o,-a],[-r,o,-a],[r,o,-a]],[[r,-o,a],[r,-o,-a],[r,o,-a],[r,o,a]],[[-r,-o,-a],[-r,-o,a],[-r,o,a],[-r,o,-a]],[[-r,o,a],[r,o,a],[r,o,-a],[-r,o,-a]],[[-r,-o,-a],[r,-o,-a],[r,-o,a],[-r,-o,a]]],s=new Float32Array(72),l=new Float32Array(48),d=new Uint16Array(36),u=0,c=0,f=0,p=0;for(let m of i){for(let[E,h,T]of m)s[u++]=E,s[u++]=h,s[u++]=T;l[c++]=0,l[c++]=0,l[c++]=1,l[c++]=0,l[c++]=1,l[c++]=1,l[c++]=0,l[c++]=1,d[f++]=p,d[f++]=p+1,d[f++]=p+2,d[f++]=p,d[f++]=p+2,d[f++]=p+3,p+=4}return Re(s,l,d)}function rt(t=10,n=24){let e=Math.max(1,Math.floor(n)),r=(e+1)*(e+1),o=new Float32Array(r*3),a=new Float32Array(r*3),i=new Float32Array(r*2),s=new Uint16Array(e*e*6),l=0,d=0,u=0;for(let c=0;c<=e;c++)for(let f=0;f<=e;f++){let p=(f/e-.5)*t,m=(c/e-.5)*t;o[l]=p,o[l+1]=0,o[l+2]=m,a[l]=0,a[l+1]=1,a[l+2]=0,l+=3,i[d++]=f/e,i[d++]=c/e}for(let c=0;c<e;c++)for(let f=0;f<e;f++){let p=c*(e+1)+f,m=p+1,E=p+(e+1),h=E+1;s[u++]=p,s[u++]=E,s[u++]=m,s[u++]=m,s[u++]=E,s[u++]=h}return Re(o,i,s,a)}function nt(t=.5,n=24,e=32){let r=Math.max(2,n),o=Math.max(3,e),a=(r+1)*(o+1),i=new Float32Array(a*3),s=new Float32Array(a*3),l=new Float32Array(a*2),d=new Uint16Array(r*o*6),u=0,c=0,f=0;for(let p=0;p<=r;p++){let m=p/r*Math.PI;for(let E=0;E<=o;E++){let h=E/o*Math.PI*2,T=Math.sin(m)*Math.cos(h),x=Math.cos(m),R=Math.sin(m)*Math.sin(h);i[u]=T*t,i[u+1]=x*t,i[u+2]=R*t,s[u]=T,s[u+1]=x,s[u+2]=R,u+=3,l[c++]=E/o,l[c++]=p/r}}for(let p=0;p<r;p++)for(let m=0;m<o;m++){let E=p*(o+1)+m,h=E+1,T=E+(o+1),x=T+1;d[f++]=E,d[f++]=h,d[f++]=T,d[f++]=h,d[f++]=x,d[f++]=T}return Re(i,l,d,s)}function ot(t=.5,n=.08,e=64,r=24){let o=Math.max(3,e),a=Math.max(3,r),i=[],s=[],l=[],d=[],u=[];for(let c=0;c<=o;c++){let f=c/o*Math.PI*2,p=Math.cos(f),m=Math.sin(f);for(let E=0;E<=a;E++){let h=E/a*Math.PI*2,T=Math.cos(h),x=Math.sin(h);i.push((t+n*T)*p,n*x,(t+n*T)*m),s.push(p*T,x,m*T),l.push(c/o,E/a),u.push(-m,0,p)}}for(let c=0;c<o;c++)for(let f=0;f<a;f++){let p=c*(a+1)+f,m=p+1,E=p+(a+1),h=E+1;d.push(p,m,E,m,h,E)}return Re(new Float32Array(i),new Float32Array(l),new Uint16Array(d),new Float32Array(s),new Float32Array(u))}function G(t){return t.indices.length/3}function pn(t){if(!Number.isFinite(t)||t===0)return"0";let n=t.toFixed(12).replace(/0+$/,"").replace(/\.$/,"");return n==="-0"?"0":n}function Zt(t,n,e,r){let[o,a]=t,[i,s]=n,[l,d]=e,[u,c]=r,f=o-i+l-u,p=a-s+d-c;if(Math.abs(f)<1e-9&&Math.abs(p)<1e-9){let b=[i-o,u-o,o,s-a,c-a,a,0,0,1],A=b[0]*b[4]-b[1]*b[3];return Math.abs(A)<1e-9?null:b}let m=i-l,E=u-l,h=s-d,T=c-d,x=m*T-E*h;if(Math.abs(x)<1e-9)return null;let R=(f*T-E*p)/x,y=(m*p-f*h)/x;return[i-o+R*i,u-o+y*u,o,s-a+R*s,c-a+y*c,a,R,y,1]}function at(t,n,e,r,o,a){if(!(o>0)||!(a>0))return{refusal:"EMPTY_ELEMENT_BOX"};let s=[n.topLeft,n.topRight,n.bottomRight,n.bottomLeft].map(L=>X(t,L,e,r));if(s.some(L=>L.behind))return{refusal:"CORNER_BEHIND_CAMERA"};let l=s.map(L=>({x:L.sx,y:L.sy})),[d,u,c,f]=l,p=Zt([d.x,d.y],[u.x,u.y],[c.x,c.y],[f.x,f.y]);if(!p)return{refusal:"DEGENERATE_ON_SCREEN"};let m=.5*(d.x*u.y-u.x*d.y+(u.x*c.y-c.x*u.y)+(c.x*f.y-f.x*c.y)+(f.x*d.y-d.x*f.y)),E=1/o,h=1/a,[T,x,R,y,b,A,v,B,M]=p;return{transform:`matrix3d(${[T*E,y*E,0,v*E,x*h,b*h,0,B*h,0,0,1,0,R,A,0,M].map(pn).join(", ")})`,matrix:p,screen:l,signedArea:m}}function Q(t){return"refusal"in t}function it(t,n,e,r,o,a,i=0){let s=Math.cos(a),l=Math.sin(a),d=(c,f)=>[t+s*c+l*i,e+f,n-l*c+s*i],u=r/2;return{topLeft:d(-u,o),topRight:d(u,o),bottomRight:d(u,0),bottomLeft:d(-u,0)}}function qt(t){let n=Number.isFinite(t)?Math.max(1,Math.floor(t)):1,e=Math.max(1,2**Math.ceil(Math.log2(Math.ceil(Math.sqrt(n))))),r=Math.max(1,2**Math.ceil(Math.log2(Math.ceil(n/e))));return{width:e,height:r,slots:e*r}}function Jt(t,n,e){let r=[],o=[];for(let a=0;a<t.length;a++){let i=Math.max(0,t[a].rate),s=Math.max(0,Math.min(.1,n)),l=i*s+(e[a]??0),d=Math.floor(l);r.push(d),o.push(l-d)}return{counts:r,carry:o}}var er=`
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
`,En=`#version 300 es
precision highp float;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,hn=`#version 300 es
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
layout(location = 0) out vec4 outState;
layout(location = 1) out vec4 outVel;
${er}
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

  float life = 1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= uEmitCount) break;
    if (abs(vl.w - uEmitRange[i].z) < 0.5) life = uEmitRange[i].w;
  }

  vec3 flow = lcxCurl(st.xyz * uNoiseScale + vec3(0.0, uTime * 0.15, 0.0), 0.35) * uNoiseStrength;
  vec3 vel = vl.xyz + (flow + uGravity) * uDt;
  vel *= max(0.0, 1.0 - uDrag * uDt);
  vec3 pos = st.xyz + vel * uDt;
  float age = st.w + uDt;

  if (!reborn && age > life) { outState = vec4(st.xyz, -1.0); outVel = vec4(0.0, 0.0, 0.0, vl.w); return; }

  outState = vec4(pos, age);
  outVel = vec4(vel, vl.w);
}`,bn=`#version 300 es
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
}`,xn=`#version 300 es
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
}`;function st(t,n){let e=t.gl,{width:r,height:o,slots:a}=qt(n);if(!e.getExtension("EXT_color_buffer_float"))return D("MISSING_EXTENSION","particle simulation needs EXT_color_buffer_float to write positions to a texture \u2014 without it the state textures never update and the field renders frozen");let i=t.compile(En,hn);if("kind"in i)return i;let s=t.compile(bn,xn);if("kind"in s)return s;let l=b=>{let A=e.createTexture();return e.bindTexture(e.TEXTURE_2D,A),e.texImage2D(e.TEXTURE_2D,0,e.RGBA32F,r,o,0,e.RGBA,e.FLOAT,b),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),A},d=new Float32Array(a*4);for(let b=0;b<a;b++)d[b*4+3]=-1;let u=l(d),c=l(d),f=l(new Float32Array(a*4)),p=l(new Float32Array(a*4)),m=e.createFramebuffer(),E=e.createFramebuffer(),h=e.createVertexArray(),T=0,x=[],R=(b,A)=>(e.bindFramebuffer(e.FRAMEBUFFER,m),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,b,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT1,e.TEXTURE_2D,A,0),e.drawBuffers([e.COLOR_ATTACHMENT0,e.COLOR_ATTACHMENT1]),e.checkFramebufferStatus(e.FRAMEBUFFER)===e.FRAMEBUFFER_COMPLETE),y=(b,A)=>e.getUniformLocation(b,A);return{slots:a,width:r,height:o,step(b){let A=b.sources.slice(0,8),v=Jt(A,b.dtSeconds,x);x=v.carry;let B=[],M=[],F=[],L=0;for(let C=0;C<A.length&&L<8;C++){let K=A[C],Xe=Math.min(v.counts[C]??0,a);for(;Xe>0&&L<8;){let xe=T,je=Math.min(Xe,a-xe);B.push(xe,xe+je-1,C,K.life),M.push(K.at[0],K.at[1],K.at[2],K.spread??0),F.push(K.velocity[0],K.velocity[1],K.velocity[2],0),T=(xe+je)%a,Xe-=je,L++}}if(!R(c,p))return;e.viewport(0,0,r,o),e.disable(e.DEPTH_TEST),e.disable(e.BLEND),e.useProgram(i),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,u),e.uniform1i(y(i,"uState"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,f),e.uniform1i(y(i,"uVel"),1),e.uniform2f(y(i,"uSize"),r,o),e.uniform1f(y(i,"uDt"),Math.max(0,Math.min(.1,b.dtSeconds))),e.uniform1f(y(i,"uTime"),performance.now()/1e3%3600),e.uniform1f(y(i,"uNoiseScale"),b.noiseScale??.35),e.uniform1f(y(i,"uNoiseStrength"),b.noiseStrength??.6),e.uniform1f(y(i,"uDrag"),b.drag??.4);let ue=b.gravity??[0,0,0];e.uniform3f(y(i,"uGravity"),ue[0],ue[1],ue[2]),e.uniform1i(y(i,"uEmitCount"),L),L>0&&(e.uniform4fv(y(i,"uEmitRange"),new Float32Array(B)),e.uniform4fv(y(i,"uEmitPos"),new Float32Array(M)),e.uniform4fv(y(i,"uEmitVel"),new Float32Array(F))),e.bindVertexArray(h),e.drawArrays(e.TRIANGLES,0,3),e.bindVertexArray(null);let ke=u;u=c,c=ke;let ze=f;f=p,p=ze,e.bindFramebuffer(e.FRAMEBUFFER,null)},draw(b){let A=b.sources.slice(0,8);e.useProgram(s),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,u),e.uniform1i(y(s,"uState"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,f),e.uniform1i(y(s,"uVel"),1),e.uniform2f(y(s,"uSize"),r,o),e.uniformMatrix4fv(y(s,"uViewProj"),!1,b.viewProj),e.uniform1f(y(s,"uPointScale"),b.pointScale??28);let v=new Float32Array(24),B=new Float32Array(8);for(let M=0;M<8;M++){let F=A[M];v[M*3]=F?F.colour[0]:0,v[M*3+1]=F?F.colour[1]:0,v[M*3+2]=F?F.colour[2]:0,B[M]=F?F.life:1}e.uniform3fv(y(s,"uColours"),v),e.uniform1fv(y(s,"uLifes"),B),e.enable(e.BLEND),e.blendFunc(e.ONE,e.ONE),e.enable(e.DEPTH_TEST),e.depthMask(!1),e.bindVertexArray(h),e.drawArrays(e.POINTS,0,a),e.bindVertexArray(null),e.depthMask(!0),e.disable(e.BLEND),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null)},readState(){e.bindFramebuffer(e.FRAMEBUFFER,E),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,u,0);let b=new Float32Array(a*4);return e.checkFramebufferStatus(e.FRAMEBUFFER)===e.FRAMEBUFFER_COMPLETE&&e.readPixels(0,0,r,o,e.RGBA,e.FLOAT,b),e.bindFramebuffer(e.FRAMEBUFFER,null),b},dispose(){for(let b of[u,c,f,p])e.deleteTexture(b);e.deleteFramebuffer(m),e.deleteFramebuffer(E),e.deleteVertexArray(h),e.deleteProgram(i),e.deleteProgram(s)}}}var lt=89,ut=Math.PI/180;function ve(t){let n=Math.max(-lt,Math.min(lt,t.elevationDeg))*ut,e=t.azimuthDeg*ut,r=Math.max(1e-4,t.distance),o=Math.sin(n)*r,a=Math.cos(n)*r;return[t.target[0]+Math.sin(e)*a,t.target[1]+o,t.target[2]+Math.cos(e)*a]}function Fe(t,n){let e=ve(t),r=t.near??Math.max(.01,t.distance/100),o=t.far??Math.max(r+1,t.distance*8),a=Ke((t.fovDeg??38)*ut,Math.max(.001,n),r,o),i=Ae(e,t.target,[0,1,0]);return Te(a,i)}function ct(t,n,e){let r=ce(t.direction),o=t.extent??Math.max(.1,e*1.35),a=Math.max(1,e*2),i=[n[0]-r[0]*a,n[1]-r[1]*a,n[2]-r[2]*a],s=Math.abs(r[1])>.99?[0,0,1]:[0,1,0],l=Ae(i,n,s),d=Qe(-o,o,-o,o,.01,a+e*2+o);return Te(d,l)}function dt(t,n){let e=ge([n[0],n[1],n[2]],[t[0],t[1],t[2]]);return Math.hypot(e[0],e[1],e[2])/2}function mt(t,n){return[(t[0]+n[0])/2,(t[1]+n[1])/2,(t[2]+n[2])/2]}function ft(t,n,e){let{gl:r}=t,o=Math.max(1,Math.floor(n)),a=Math.max(1,Math.floor(e)),i=r.createFramebuffer(),s=r.createTexture(),l=r.createTexture();if(!i||!s||!l)return D("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let d=t.hdr?r.RGBA16F:r.RGBA8,u=t.hdr?r.HALF_FLOAT:r.UNSIGNED_BYTE,c=()=>{r.bindTexture(r.TEXTURE_2D,s),r.texImage2D(r.TEXTURE_2D,0,d,o,a,0,r.RGBA,u,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),r.bindTexture(r.TEXTURE_2D,l),r.texImage2D(r.TEXTURE_2D,0,r.DEPTH_COMPONENT24,o,a,0,r.DEPTH_COMPONENT,r.UNSIGNED_INT,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),r.bindFramebuffer(r.FRAMEBUFFER,i),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,s,0),r.framebufferTexture2D(r.FRAMEBUFFER,r.DEPTH_ATTACHMENT,r.TEXTURE_2D,l,0),r.bindFramebuffer(r.FRAMEBUFFER,null)};c(),r.bindFramebuffer(r.FRAMEBUFFER,i);let f=r.checkFramebufferStatus(r.FRAMEBUFFER);return r.bindFramebuffer(r.FRAMEBUFFER,null),f!==r.FRAMEBUFFER_COMPLETE?D("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${f.toString(16)}). Depth texture support may be missing.`):{framebuffer:i,texture:s,depthTexture:l,get width(){return o},get height(){return a},bind(){r.bindFramebuffer(r.FRAMEBUFFER,i),r.viewport(0,0,o,a)},resize(p,m){let E=Math.max(1,Math.floor(p)),h=Math.max(1,Math.floor(m));E===o&&h===a||(o=E,a=h,c())},dispose(){r.deleteFramebuffer(i),r.deleteTexture(s),r.deleteTexture(l)}}}function pt(t,n=1024){let{gl:e}=t,r=Math.max(256,Math.min(2048,Math.floor(n))),o=e.createFramebuffer(),a=e.createTexture();if(!o||!a)return D("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");e.bindTexture(e.TEXTURE_2D,a),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,r,r,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,o),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,a,0);let i=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),i!==e.FRAMEBUFFER_COMPLETE?D("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${i.toString(16)}).`):{framebuffer:o,depthTexture:a,size:r,bind(){e.bindFramebuffer(e.FRAMEBUFFER,o),e.viewport(0,0,r,r)},dispose(){e.deleteFramebuffer(o),e.deleteTexture(a)}}}var ht=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,Et={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function tr(t,n,e={}){let r=e.zenith??Et.zenith,o=e.horizon??Et.horizon,a=e.ground??Et.ground;t.uniform3f(t.getUniformLocation(n,"uSkyZenith"),r[0],r[1],r[2]),t.uniform3f(t.getUniformLocation(n,"uSkyHorizon"),o[0],o[1],o[2]),t.uniform3f(t.getUniformLocation(n,"uSkyGround"),a[0],a[1],a[2])}var po=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${ht}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;var rr=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,bt=`#version 300 es
precision highp float;
void main(){}`,yn=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,nr=`#version 300 es
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
}`,or=`#version 300 es
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
${ht}

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
}`;function V(t,n){let{gl:e}=t,r=e.createVertexArray(),o=e.createBuffer(),a=e.createBuffer(),i=e.createBuffer(),s=e.createBuffer();return!r||!o||!a||!i||!s?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(e.bindVertexArray(r),e.bindBuffer(e.ARRAY_BUFFER,o),e.bufferData(e.ARRAY_BUFFER,n.positions,e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,3,e.FLOAT,!1,0,0),e.bindBuffer(e.ARRAY_BUFFER,a),e.bufferData(e.ARRAY_BUFFER,n.normals,e.STATIC_DRAW),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,3,e.FLOAT,!1,0,0),e.bindBuffer(e.ARRAY_BUFFER,i),e.bufferData(e.ARRAY_BUFFER,n.tangents,e.STATIC_DRAW),e.enableVertexAttribArray(2),e.vertexAttribPointer(2,3,e.FLOAT,!1,0,0),e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,s),e.bufferData(e.ELEMENT_ARRAY_BUFFER,n.indices,e.STATIC_DRAW),e.bindVertexArray(null),{vao:r,indexCount:n.indices.length,indexType:n.indices instanceof Uint32Array?e.UNSIGNED_INT:e.UNSIGNED_SHORT,dispose(){e.deleteVertexArray(r),e.deleteBuffer(o),e.deleteBuffer(a),e.deleteBuffer(i),e.deleteBuffer(s)}})}function xt(t){let{gl:n}=t,e=t.compile(rr,bt);if("kind"in e)return e;let r=t.compile(nr,or);if("kind"in r)return r;let o=t.compile(yn,bt);if("kind"in o)return o;let a=(i,s)=>n.getUniformLocation(i,s);return{shadowPass(i,s,l,d){let u=d??(()=>{});l.bind(),u("shadow.bind"),n.clear(n.DEPTH_BUFFER_BIT),n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.FRONT),n.useProgram(e),u("useProgram(shadow)"),n.uniformMatrix4fv(a(e,"uLightVP"),!1,i),u("uLightVP");for(let c of s)n.uniformMatrix4fv(a(e,"uModel"),!1,c.model),u("shadow uModel"),n.bindVertexArray(c.mesh.vao),u("shadow bindVAO"),n.drawElements(n.TRIANGLES,c.mesh.indexCount,c.mesh.indexType,0),u("shadow drawElements");n.bindVertexArray(null),n.cullFace(n.BACK)},depthPrepass(i,s){n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.colorMask(!1,!1,!1,!1),n.useProgram(o),n.uniformMatrix4fv(a(o,"uViewProj"),!1,i);for(let l of s)n.uniformMatrix4fv(a(o,"uModel"),!1,l.model),n.bindVertexArray(l.mesh.vao),n.drawElements(n.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0);n.bindVertexArray(null),n.colorMask(!0,!0,!0,!0)},draw(i){let s=i.onStep??(()=>{});if(n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.useProgram(r),n.uniformMatrix4fv(a(r,"uViewProj"),!1,i.viewProj),s("uViewProj"),n.uniform3fv(a(r,"uEye"),i.eye),s("uEye"),n.uniform3fv(a(r,"uLightDir"),i.lightDir),s("uLightDir"),n.uniform3fv(a(r,"uLightColour"),i.lightColour),s("uLightColour"),n.uniform1f(a(r,"uAmbientGain"),i.ambientGain??1),s("uAmbientGain"),i.fog&&i.fog.density>0){n.uniform1f(a(r,"uFogDensity"),i.fog.density),n.uniform1f(a(r,"uFogHeight"),i.fog.height),n.uniform1f(a(r,"uFogFloor"),i.fog.floor??0);let l=i.fog.colour;l==="sky"?n.uniform3f(a(r,"uFogColour"),-1,-1,-1):n.uniform3f(a(r,"uFogColour"),l[0],l[1],l[2]),s("fog")}else n.uniform1f(a(r,"uFogDensity"),0);tr(n,r,i.sky),s("bindSky"),i.ao&&i.screenSize?(n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,i.ao),n.uniform1i(a(r,"uAO"),1),n.uniform2f(a(r,"uScreenSize"),i.screenSize[0],i.screenSize[1]),n.uniform1f(a(r,"uAOEnabled"),1)):n.uniform1f(a(r,"uAOEnabled"),0),s("bindAO"),n.uniformMatrix4fv(a(r,"uLightVP"),!1,i.lightVP),s("lit uLightVP"),i.shadow?(n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,i.shadow.depthTexture),n.uniform1i(a(r,"uShadowMap"),0),n.uniform1f(a(r,"uShadowTexel"),1/i.shadow.size),n.uniform1f(a(r,"uShadowStrength"),i.shadowStrength??1)):n.uniform1f(a(r,"uShadowStrength"),0);for(let l of i.draws)n.uniformMatrix4fv(a(r,"uModel"),!1,l.model),n.uniformMatrix3fv(a(r,"uNormalMat"),!1,l.normalMat),s("uNormalMat"),n.uniform3fv(a(r,"uBaseColour"),l.material.baseColour),s("uBaseColour"),n.uniform1f(a(r,"uRoughness"),l.material.roughness),n.uniform1f(a(r,"uMetalness"),l.material.metalness),n.uniform1f(a(r,"uAnisotropy"),l.material.anisotropy??0),n.bindVertexArray(l.mesh.vao),s("lit bindVAO"),n.drawElements(n.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0),s("lit drawElements");n.bindVertexArray(null),n.disable(n.CULL_FACE)},dispose(){n.deleteProgram(e),n.deleteProgram(r),n.deleteProgram(o)}}}var yt=`
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
}`,ar=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Tn=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${yt}

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
}`,gn=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${yt}

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
}`;function Tt(t,n,e){let{gl:r}=t,o=t.compile(ar,Tn);if("kind"in o)return o;let a=t.compile(ar,gn);if("kind"in a)return a;let i=Math.max(1,n>>1),s=Math.max(1,e>>1),l=()=>{let m=r.createFramebuffer(),E=r.createTexture();return!m||!E?null:{fb:m,tex:E}},d=l(),u=l();if(!d||!u)return D("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let c=()=>{for(let m of[d,u])r.bindTexture(r.TEXTURE_2D,m.tex),r.texImage2D(r.TEXTURE_2D,0,r.R8,i,s,0,r.RED,r.UNSIGNED_BYTE,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),r.bindFramebuffer(r.FRAMEBUFFER,m.fb),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,m.tex,0);r.bindFramebuffer(r.FRAMEBUFFER,null)};c(),r.bindFramebuffer(r.FRAMEBUFFER,d.fb);let f=r.checkFramebufferStatus(r.FRAMEBUFFER);if(r.bindFramebuffer(r.FRAMEBUFFER,null),f!==r.FRAMEBUFFER_COMPLETE)return D("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${f.toString(16)}).`);let p=(m,E,h,T,x,R,y)=>{r.activeTexture(r.TEXTURE0+y),r.bindTexture(r.TEXTURE_2D,E),r.uniform1i(r.getUniformLocation(m,"uDepth"),y),r.uniform2f(r.getUniformLocation(m,"uNearFar"),h,T),r.uniform1f(r.getUniformLocation(m,"uTanHalfFov"),Math.tan(x*Math.PI/360)),r.uniform1f(r.getUniformLocation(m,"uAspect"),R)};return{get texture(){return d.tex},get width(){return i},get height(){return s},compute(m){r.disable(r.DEPTH_TEST),r.depthMask(!1),r.disable(r.BLEND),r.disable(r.CULL_FACE),r.bindFramebuffer(r.FRAMEBUFFER,d.fb),r.viewport(0,0,i,s),r.useProgram(o),p(o,m.depthTexture,m.near,m.far,m.fovDeg,m.aspect,0),r.uniform2f(r.getUniformLocation(o,"uTexel"),1/i,1/s),r.uniform1f(r.getUniformLocation(o,"uRadius"),m.radius??.55),r.uniform1f(r.getUniformLocation(o,"uStrength"),m.strength??1.15),r.uniform1f(r.getUniformLocation(o,"uBias"),m.bias??.035),t.blit(o);for(let[E,h,T]of[[d,u,[1,0]],[u,d,[0,1]]])r.bindFramebuffer(r.FRAMEBUFFER,h.fb),r.viewport(0,0,i,s),r.useProgram(a),p(a,m.depthTexture,m.near,m.far,m.fovDeg,m.aspect,0),r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,E.tex),r.uniform1i(r.getUniformLocation(a,"uAO"),1),r.uniform2f(r.getUniformLocation(a,"uTexel"),1/i,1/s),r.uniform2f(r.getUniformLocation(a,"uDir"),T[0],T[1]),t.blit(a);r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,null),r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,null),r.bindFramebuffer(r.FRAMEBUFFER,null),r.depthMask(!0),r.enable(r.DEPTH_TEST)},resize(m,E){let h=Math.max(1,m>>1),T=Math.max(1,E>>1);h===i&&T===s||(i=h,s=T,c())},dispose(){r.deleteProgram(o),r.deleteProgram(a);for(let m of[d,u])r.deleteFramebuffer(m.fb),r.deleteTexture(m.tex)}}}var Ee=new URLSearchParams(location.search),Ct=Ee.get("settle")!=="0",Ot=Ee.get("particles")!=="0",Sr=Ee.get("fog")!=="0",he=Math.max(1,Math.min(3,Number(Ee.get("scale")??1))),Mr=Number(Ee.get("frames")??300),H=1200*he,k=720*he,oe=document.getElementById("c");oe.width=H;oe.height=k;var _r=document.getElementById("log");function Lr(t){throw document.title="REFUSED",_r.textContent=t,new Error(t)}function N(t,n){return"kind"in n&&Lr(`${t}: ${n.code} \u2014 ${n.reason} ${n.detail??""}`),n}var De=$e(oe,{alpha:!1});We(De)||Lr(`stage: ${De.code} \u2014 ${De.reason}`);var _=De,g=_.gl,An=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Rn=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${et}
${tt}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,vn=N("present",_.compile(An,Rn)),gt=N("lit",xt(_)),Se=N("target",ft(_,H,k)),Ft=N("shadow",pt(_,1536)),ir=N("ao",Tt(_,H,k)),te=N("strokes",Ze(_)),Oe=["SOURCED","QUALIFIED","DILIGENCE","TERMS","SIGNED"],Dr=[{name:"SABLE TREASURY",stage:"SOURCED",valueUsd:24e4,daysSinceUpdate:63,known:"OBSERVED"},{name:"PRAXIS DESK",stage:"SOURCED",valueUsd:null,daysSinceUpdate:9,known:"VALUE_ABSENT"},{name:"CASTOR LABS",stage:"SOURCED",valueUsd:15e4,daysSinceUpdate:34,known:"OBSERVED"},{name:"LUMEN CUSTODY",stage:"SOURCED",valueUsd:95e3,daysSinceUpdate:17,known:"OBSERVED"},{name:"TIBER CLEARING",stage:"QUALIFIED",valueUsd:31e4,daysSinceUpdate:4,known:"OBSERVED"},{name:"VANTA MARKETS",stage:"QUALIFIED",valueUsd:62e4,daysSinceUpdate:28,known:"OBSERVED"},{name:"\u2014",stage:"QUALIFIED",valueUsd:null,daysSinceUpdate:null,known:"WITHHELD"},{name:"HELIOS EXCHANGE",stage:"DILIGENCE",valueUsd:175e4,daysSinceUpdate:52,known:"OBSERVED"},{name:"KESTREL FUND",stage:"DILIGENCE",valueUsd:43e4,daysSinceUpdate:11,known:"OBSERVED"},{name:"MERIDIAN PAY",stage:"TERMS",valueUsd:26e5,daysSinceUpdate:41,known:"OBSERVED"},{name:"NORDIC CUSTODY",stage:"TERMS",valueUsd:88e4,daysSinceUpdate:6,known:"OBSERVED"},{name:"ATLAS OTC",stage:"SIGNED",valueUsd:42e5,daysSinceUpdate:3,known:"OBSERVED"}],re=45,Pe=.86,wr=.46,Fn=Math.max(...Dr.map(t=>t.valueUsd??0)),Sn=t=>wr*Math.cbrt(t/Fn),ae=.11,S=1.45,Bt=2.8,Pr=-13,be=Pr-2.6,le=.4,Ur=le-be,St=(le+be)/2,I=1.15,Be=t=>Pr+t*Bt,Mn=.62,_n=.58,sr=.6,Mt=.66,lr=.3,Nr=.16,_t=190,Ln=13.5,fe=Sr?Math.log(10)/17.5:0,ur="#080D18",Cr=90,It=1600,Ue=1.4,Gt=1024,Or=150,Br="#2C6BFF",Ir="#C9552B",Ie="#E0A94A",Gr="#5C6880",Vr=rt(2*S,96),Hr=Z(.18,1.25,Ur),kr=Z(.1,I,.1),zr=Z(2*S+.2,.1,.1),Xr=Z(2*S,.05,.13),jr=Z(1,1,1),Wr=ot(ae*1.25,ae*.34,40,14),$r=nt(ae,20,28),Dn=N("floor",V(_,Vr)),cr=N("wall",V(_,Hr)),dr=N("post",V(_,kr)),wn=N("lintel",V(_,zr)),Pn=N("sill",V(_,Xr)),Un=N("deal",V(_,jr)),Nn=N("absent",V(_,Wr)),Cn=N("withheld",V(_,$r)),j=new Float32Array([1,0,0,0,1,0,0,0,1]),On=new Float32Array([1,0,0,0,0,1,0,-1,0]),W=(t,n,e,r=1)=>{let o=de();return o[0]=r,o[5]=r,o[10]=r,o[12]=t,o[13]=n,o[14]=e,o},Bn=(t,n,e)=>{let r=de();return r[5]=0,r[6]=1,r[9]=-1,r[10]=0,r[12]=t,r[13]=n,r[14]=e,r},Yr=.1,Kr=44,Ne={target:[0,.85,-6.6],distance:8,azimuthDeg:19,elevationDeg:12.5,fovDeg:35,near:Yr,far:Kr},z=ve(Ne),mr=new Map,U=Dr.map((t,n)=>{let e=Oe.indexOf(t.stage),r=mr.get(t.stage)??0;mr.set(t.stage,r+1);let o=Be(e)+Mn+r*_n,a=r%2===0?-sr:sr,i=t.valueUsd===null?null:Sn(t.valueUsd),s=t.known==="VALUE_ABSENT"?"MASS_REFUSED_VALUE_NEVER_MEASURED":t.known==="WITHHELD"?"MASS_REFUSED_VALUE_WITHHELD":null,l=t.daysSinceUpdate===null?null:t.daysSinceUpdate/re,d=l===null?null:Ct?Math.min(1,l):0,u=t.daysSinceUpdate===null?"SETTLE_REFUSED_LAST_TOUCH_WITHHELD":null,c=i!==null?i/2:ae,f=d===null?Pe+.3:(1-d)*Pe,p=f+c;return{d:t,i:n,stageIndex:e,slot:r,x:a,z:o,edge:i,settle:d,settleClamped:l!==null&&l>1,baseY:f,centreY:p,topY:f+2*c,massRefusal:s,settleRefusal:u,distance:Math.hypot(a-z[0],p-z[1],o-z[2])}}),In=U.filter(t=>{let n=t.edge!==null?t.edge/2:ae,e=t.z-Be(t.stageIndex);return e-n<.05||e+n>Bt-.05}).map(t=>t.d.name),Gn=t=>U.filter(n=>n.stageIndex>=t&&n.d.known==="OBSERVED"&&n.d.valueUsd!==null).reduce((n,e)=>n+(e.d.valueUsd??0),0),P=Oe.map((t,n)=>{let e=Be(n),r=Gn(n),o=r/Cr,a=o/It,i=Math.min(Bt,le-e-.2),s=Math.max(.2,i/Ue);return{label:t,index:n,z:e,clearedUsd:r,usdPerDay:o,ratePerSec:a,life:s,linearDensityPerMetre:a/Ue}}),Vn=[.055,.16,.62],Qr=P.map(t=>({at:[0,.52,t.z+.06],rate:t.ratePerSec,velocity:[0,0,Ue],spread:.44,colour:Vn,life:t.life})),q=Ot?st(_,Gt):null,O=q!==null&&!("kind"in q)?q:null,Lt=q!==null&&"kind"in q?`${q.code} \u2014 ${q.reason}`:Ot?null:"DISABLED_BY_PARAM",Hn=Math.round(P.reduce((t,n)=>t+n.ratePerSec*n.life,0)),fr=P.reduce((t,n)=>t+n.ratePerSec,0),pr=fr>0?(O?.slots??Gt)/fr:1/0,Er=Math.max(...P.map(t=>t.life)),Zr={sources:Qr,dtSeconds:1/60,noiseScale:.55,noiseStrength:.22,drag:.5},hr={baseColour:w("#131D31"),roughness:.6,metalness:.03},Me={baseColour:w("#2C6BFF"),roughness:.28,metalness:.18},qr=W(0,0,St,1);qr[10]=Ur/(2*S);var J=[{mesh:Dn,model:qr,normalMat:j,material:{baseColour:w("#080D17"),roughness:.82,metalness:0}},{mesh:cr,model:W(-(S+.09),.625,St),normalMat:j,material:hr},{mesh:cr,model:W(S+.09,.625,St),normalMat:j,material:hr}];for(let t of P)J.push({mesh:dr,model:W(-(S+.05),I/2,t.z),normalMat:j,material:Me},{mesh:dr,model:W(S+.05,I/2,t.z),normalMat:j,material:Me},{mesh:wn,model:W(0,I,t.z),normalMat:j,material:Me},{mesh:Pn,model:W(0,.025,t.z),normalMat:j,material:Me});for(let t of U)if(t.d.known==="WITHHELD")J.push({mesh:Cn,model:W(t.x,t.centreY,t.z),normalMat:j,material:{baseColour:w(Gr),roughness:.28,metalness:.58}});else if(t.edge===null)J.push({mesh:Nn,model:Bn(t.x,t.centreY,t.z),normalMat:On,material:{baseColour:w(Ie),roughness:.44,metalness:.1}});else{let n=Je(w(Br),w(Ir),t.settle??0);J.push({mesh:Un,model:W(t.x,t.centreY,t.z,t.edge),normalMat:j,material:{baseColour:n,roughness:.34+.16*(t.settle??0),metalness:.06}})}var Jr=[.42,-.66,-.62],br=[-2,0,be],xr=[2,1.9,le],yr=ct({direction:Jr,colour:[1,1,1],extent:9.6},mt(br,xr),dt(br,xr)),kn=G(Vr)+2*G(Hr)+P.length*(2*G(kr)+G(zr)+G(Xr))+U.filter(t=>t.d.known==="OBSERVED").length*G(jr)+U.filter(t=>t.d.known==="VALUE_ABSENT").length*G(Wr)+U.filter(t=>t.d.known==="WITHHELD").length*G($r),ie=Fe(Ne,H/k),$=H/he,Y=k/he,Vt=t=>fe<=0?0:1-Math.exp(-fe*t),pe=t=>t>=1e6?`$${(t/1e6).toFixed(2)}M`:`$${Math.round(t/1e3)}k`,At=[],Tr=(t,n,e)=>{let r=0;for(let o=0;o<4;o++){let a=t[o],i=t[(o+1)%4],s=(i.x-a.x)*(e-a.y)-(i.y-a.y)*(n-a.x);if(Math.abs(s)<1e-9)continue;let l=s>0?1:-1;if(r===0)r=l;else if(l!==r)return!1}return!0},en=t=>{let n=X(ie,[t.x,t.baseY,t.z],$,Y),e=X(ie,[t.x,t.topY,t.z],$,Y);return n.behind||e.behind?0:Math.abs(n.sy-e.sy)},gr=t=>{let n=X(ie,[t.x,t.centreY,t.z],$,Y);return n.behind?null:n.sy},Ge=[...U].sort((t,n)=>t.distance-n.distance).map(t=>{let n=t.d.known==="WITHHELD",e=t.distance>Ln,r=Math.round(Mt*_t),o=Math.round(lr*_t),a=Math.atan2(z[0]-t.x,z[2]-t.z),i=it(t.x,t.z,t.topY+Nr,Mt,lr,a,0),s=at(ie,i,$,Y,r,o),l=Q(s)?s.refusal:null,d=!Q(s)&&s.signedArea<=0,u=Q(s)?0:Math.max(Math.hypot(s.screen[0].x-s.screen[1].x,s.screen[0].y-s.screen[1].y),Math.hypot(s.screen[3].x-s.screen[2].x,s.screen[3].y-s.screen[2].y)),c=u<26,f=Q(s)?0:s.screen.filter(E=>At.some(h=>Tr(h,E.x,E.y))).length+At.reduce((E,h)=>E+h.filter(T=>Tr(s.screen.map(x=>({x:x.x,y:x.y})),T.x,T.y)).length,0),p=f>=2,m=!l&&!d&&!n&&!e&&!c&&!p;return m&&!Q(s)&&At.push(s.screen.map(E=>({x:E.x,y:E.y}))),{p:t,proj:s,shown:m,ew:r,eh:o,refusal:l,backFacing:d,withheld:n,tooFar:e,edgeOn:c,occluded:p,widthPx:u,coveredCorners:f}}),zn=Ge.filter(t=>t.shown).map(t=>t.p),_e={colour:w("#4E8CFF"),gain:2.4},Xn={colour:w("#7FB2FF"),gain:1.1},jn={colour:w("#7FB2FF"),gain:.85},tn=Be(P.length-1),rn=[0,20,re].map(t=>({days:t,y:(1-Math.min(1,t/re))*Pe+.012,label:t>=re?`${t}d+`:`${t}d`}));function Dt(){let t=Fe(Ne,H/k);O&&O.step(Zr),gt.shadowPass(yr,J,Ft),Se.bind();let n=w(ur);g.clearColor(n[0],n[1],n[2],1),g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT),gt.depthPrepass(t,J),ir.compute({depthTexture:Se.depthTexture,near:Yr,far:Kr,fovDeg:Ne.fovDeg??35,aspect:H/k,radius:.36,strength:1.25}),Se.bind(),gt.draw({viewProj:t,eye:z,lightDir:Jr,lightColour:[3.1,3.02,2.9],ambientGain:.42,lightVP:yr,shadow:Ft,shadowStrength:.92,draws:J,ao:ir.texture,screenSize:[H,k],fog:fe>0?{density:fe,height:5,floor:0,colour:w(ur)}:null}),g.enable(g.BLEND),g.blendFunc(g.ONE,g.ONE),g.enable(g.DEPTH_TEST),g.depthMask(!1);for(let e of P)te.ruleAtDepth(t,-S,.02,S,.02,e.z,.012,_e),te.ruleAtDepth(t,-S,I,S,I,e.z,.01,_e),te.ruleAtDepth(t,-S,.02,-S,I,e.z,.01,_e),te.ruleAtDepth(t,S,.02,S,I,e.z,.01,_e);for(let e of rn)te.ruleAtDepth(t,S-.3,e.y,S-.02,e.y,tn,.006,Xn);for(let e of zn)te.ruleAtDepth(t,e.x,e.topY,e.x,e.topY+Nr,e.z,.005,jn);g.depthMask(!0),g.disable(g.BLEND),O&&O.draw({viewProj:t,sources:Qr,pointScale:22}),g.bindFramebuffer(g.FRAMEBUFFER,null),g.viewport(0,0,H,k),g.disable(g.DEPTH_TEST),g.activeTexture(g.TEXTURE0),g.bindTexture(g.TEXTURE_2D,Se.texture),_.blit(vn,e=>g.uniform1i(g.getUniformLocation(e,"uScene"),0))}function Wn(t){Dt();let n=new Uint8Array(4);g.readPixels(0,0,1,1,g.RGBA,g.UNSIGNED_BYTE,n);let e=performance.now();for(let r=0;r<t;r++)Dt();return g.readPixels(0,0,1,1,g.RGBA,g.UNSIGNED_BYTE,n),(performance.now()-e)/t}if(O)for(let t=0;t<Or;t++)O.step(Zr);var Rt=Wn(Math.max(1,Mr)),Ve=document.createElement("div");Ve.style.cssText=`position:relative;overflow:hidden;width:${$}px;height:${Y}px`;oe.parentNode?.insertBefore(Ve,oe);Ve.appendChild(oe);var ee=document.createElement("div");ee.style.cssText="position:absolute;inset:0;pointer-events:none";Ve.appendChild(ee);for(let t of[...Ge].sort((n,e)=>e.p.distance-n.p.distance)){let{p:n,proj:e,shown:r,ew:o,eh:a}=t;if(!r||Q(e))continue;let i=Vt(n.distance),s=document.createElement("div");s.style.cssText=`position:absolute;left:0;top:0;width:${o}px;height:${a}px;transform-origin:0 0;transform:${e.transform};display:flex;flex-direction:column;justify-content:center;gap:3px;padding:0 5px;overflow:hidden;opacity:${(1-.7*i).toFixed(3)};-webkit-font-smoothing:antialiased`;let l=n.d.valueUsd===null?`<span style="color:${Ie}">VALUE ABSENT</span>`:pe(n.d.valueUsd),d=n.d.daysSinceUpdate===null?"\u2014":`${n.d.daysSinceUpdate} d`;s.innerHTML=`<div style="font:700 11px/1.05 ui-monospace,monospace;color:#fff">${n.d.name}</div><div style="font:400 10.5px/1.2 ui-monospace,monospace;color:rgba(255,255,255,0.80)">${l} \xB7 ${d}</div><div style="font:600 9px/1 ui-monospace,monospace;letter-spacing:.14em;color:rgba(255,255,255,0.60)">${n.d.stage}</div>`,ee.appendChild(s)}var $n=P.map(t=>{let n=X(ie,[0,I+.3,t.z],$,Y),e=Vt(Math.hypot(z[0],z[1]-I,z[2]-t.z)),r=!n.behind&&n.sx>30&&n.sx<$-30&&n.sy>8&&n.sy<Y-8;if(r){let o=document.createElement("div");o.style.cssText=`position:absolute;left:${n.sx.toFixed(1)}px;top:${n.sy.toFixed(1)}px;transform:translate(-50%,-100%);text-align:center;white-space:nowrap;opacity:${(1-.72*e).toFixed(3)}`,o.innerHTML=`<div style="font:600 10px/1.25 ui-monospace,monospace;letter-spacing:.16em;color:#9CC2FF">${t.label}</div><div style="font:400 9.5px/1.25 ui-monospace,monospace;color:rgba(196,212,240,0.72)">${pe(t.usdPerDay)}/d</div>`,ee.appendChild(o)}return{stage:t.label,sx:Math.round(n.sx),sy:Math.round(n.sy),onFrame:r}}),Yn=rn.map(t=>{let n=X(ie,[S+.06,t.y,tn],$,Y),e=!n.behind&&n.sx>0&&n.sx<$&&n.sy>0&&n.sy<Y;if(e){let r=document.createElement("div");r.style.cssText=`position:absolute;left:${n.sx.toFixed(1)}px;top:${n.sy.toFixed(1)}px;transform:translate(2px,-50%);font:500 9.5px/1 ui-monospace,monospace;letter-spacing:.08em;color:rgba(196,212,240,0.78);white-space:nowrap`,r.textContent=t.label,ee.appendChild(r)}return{label:t.label,onFrame:e}}),nn=Oe.map((t,n)=>{let e=U.filter(s=>s.stageIndex===n&&s.settle!==null&&s.edge!==null);if(e.length<2)return{stage:t,readable:e.length,separationPx:null};let r=e.reduce((s,l)=>(l.settle??0)>(s.settle??0)?l:s),o=e.reduce((s,l)=>(l.settle??0)<(s.settle??0)?l:s),a=gr(r),i=gr(o);return{stage:t,readable:e.length,separationPx:a===null||i===null?null:Math.round(Math.abs(a-i))}}),Ar=nn.map(t=>t.separationPx).filter(t=>t!==null),Kn=Ar.length>0?Math.min(...Ar):0,se=U.filter(t=>t.edge!==null&&t.d.known==="OBSERVED"),wt=new Map;for(let t of se)wt.set(t.i,en(t));var on=0,an=0;for(let t of se)for(let n of se){if(t.i>=n.i)continue;let[e,r]=(t.d.valueUsd??0)>(n.d.valueUsd??0)?[t,n]:[n,t];(wt.get(e.i)??0)<(wt.get(r.i)??0)&&(on++,e.stageIndex===r.stageIndex&&an++)}var sn=.6,we=se.reduce((t,n)=>t+(n.d.valueUsd??0),0),He=se.filter(t=>(t.settle??0)>=sn),Rr=He.reduce((t,n)=>t+(n.d.valueUsd??0),0),Qn=He.filter(t=>t.stageIndex>=Oe.indexOf("DILIGENCE")),Ce=Qn.reduce((t,n)=>t+(n.d.valueUsd??0),0),ne={OBSERVED:U.filter(t=>t.d.known==="OBSERVED").length,VALUE_ABSENT:U.filter(t=>t.d.known==="VALUE_ABSENT").length,WITHHELD:U.filter(t=>t.d.known==="WITHHELD").length},Ht=document.createElement("div");Ht.style.cssText="position:absolute;left:18px;top:16px;display:flex;flex-direction:column;gap:7px";Ht.innerHTML=`<div style="font:600 11px/1 ui-monospace,monospace;letter-spacing:.16em;color:#8FB7FF">PIPELINE \xB7 SIZE IS VALUE, HEIGHT IS MOVEMENT</div><div style="font:400 10.5px/1.55 ui-monospace,monospace;color:rgba(196,212,240,0.86)"><b style="color:#FF9B76">${pe(Ce)}</b> PAST DILIGENCE AND SETTLED &nbsp;\xB7&nbsp; ${Math.round(100*Ce/Math.max(1,we))}% OF THE READABLE BOOK<br>${re} d = ON THE FLOOR &nbsp;\xB7&nbsp; 1 PARTICLE = ${pe(It)}/d CLEARED<br>${Ct?"MOVEMENT AXIS ON":"MOVEMENT AXIS OFF \u2014 every deal pinned to the rail"} &nbsp;\xB7&nbsp; ${Lt===null?"THROUGHPUT ON":`THROUGHPUT OFF \u2014 ${Lt.split(" \u2014 ")[0]}`}</div><div style="font:500 10px/1.4 ui-monospace,monospace;color:${Ie}">SYNTHETIC DEALS</div>`;ee.appendChild(Ht);var kt=document.createElement("div");kt.style.cssText="position:absolute;right:18px;bottom:16px;display:flex;flex-direction:column;gap:6px;align-items:flex-end;font:500 10.5px/1 ui-monospace,monospace";kt.innerHTML=[[Br,"UPDATED \xB7 rides the rail"],[Ir,`SETTLED \xB7 ${He.length} of ${ne.OBSERVED} on the floor`],[Ie,`VALUE ABSENT \xB7 ${ne.VALUE_ABSENT} (ring: no mass to give)`],[Gr,`WITHHELD \xB7 ${ne.WITHHELD} (off the movement axis)`]].map(([t,n])=>`<div style="display:flex;align-items:center;gap:7px;color:rgba(196,212,240,0.85)"><span>${n}</span><span style="width:11px;height:11px;background:${t};display:inline-block"></span></div>`).join("");ee.appendChild(kt);var me=O?O.readState():null,Pt=0,ln=0,Ut=1/0,Nt=-1/0;if(me&&O)for(let t=0;t<O.slots;t++){let n=me[t*4],e=me[t*4+1],r=me[t*4+2];me[t*4+3]<0||(Pt++,r<Ut&&(Ut=r),r>Nt&&(Nt=r),(Math.abs(n)>S||e<-.15||e>I+.25||r<be||r>le)&&ln++)}var un=(()=>{let t=g.getExtension("WEBGL_debug_renderer_info");return t?String(g.getParameter(t.UNMASKED_RENDERER_WEBGL)):"unknown"})(),vt=/swiftshader|llvmpipe|software/i.test(un),Le=Ge.map(t=>({name:t.p.d.name,stage:t.p.d.stage,known:t.p.d.known,valueUsd:t.p.d.valueUsd,days:t.p.d.daysSinceUpdate,edgeM:t.p.edge===null?null:Number(t.p.edge.toFixed(3)),settle:t.p.settle===null?null:Number(t.p.settle.toFixed(3)),settleClamped:t.p.settleClamped,baseY:Number(t.p.baseY.toFixed(3)),distance:Number(t.p.distance.toFixed(2)),screenHeightPx:Math.round(en(t.p)),fog:Number(Vt(t.p.distance).toFixed(3)),tagWidthPx:Math.round(t.widthPx),tagShown:t.shown,massRefusal:t.p.massRefusal,settleRefusal:t.p.settleRefusal,hiddenBecause:t.shown?null:t.withheld?"WITHHELD":t.refusal?t.refusal:t.backFacing?"BACK_FACING":t.edgeOn?"EDGE_ON":t.tooFar?"BEYOND_LEGIBLE_RANGE":"OCCLUDED"})),cn={settleAxis:Ct,particlesRequested:Ot,fog:Sr,fogDensity:Number(fe.toFixed(4)),hdr:_.hdr,eye:z.map(t=>Number(t.toFixed(2))),deals:U.length,counts:ne,aggregateExcludes:{valueAbsent:ne.VALUE_ABSENT,withheld:ne.WITHHELD,code:"AGGREGATE_EXCLUDES_UNREADABLE_VALUE"},totalObservedUsd:we,stallDays:re,stalledFrom:sn,stalledCount:He.length,stalledUsd:Rr,stalledShare:Number((Rr/Math.max(1,we)).toFixed(3)),deepStalledUsd:Ce,deepStalledShare:Number((Ce/Math.max(1,we)).toFixed(3)),settleClamped:U.filter(t=>t.settleClamped).length,minSeparationPx:Kn,railLiftM:Pe,edgeMaxM:wr,edgeMinM:Number(Math.min(...se.map(t=>t.edge??0)).toFixed(3)),referenceSizeM:ae,massAmbiguousPairs:on,massAmbiguousWithinStage:an,outOfSegment:In,windowDays:Cr,usdPerParticle:It,particleSpeed:Ue,rateMonotoneDown:P.every((t,n)=>n===0||t.ratePerSec<=P[n-1].ratePerSec+1e-9),rateRatioFirstLast:Number((P[0].ratePerSec/Math.max(1e-9,P[P.length-1].ratePerSec)).toFixed(2)),particleField:{refusal:Lt,capacity:Gt,slots:O?.slots??0,aliveExpected:Hn,aliveActual:Pt,outOfChannel:ln,zRange:Pt>0?[Number(Ut.toFixed(2)),Number(Nt.toFixed(2))]:null,channelZ:[be,le],slotRecycleSeconds:Number(pr.toFixed(2)),maxLifeSeconds:Number(Er.toFixed(2)),recycleSafe:pr>Er,primeSteps:Or},tagsShown:Ge.filter(t=>t.shown).length,hiddenBy:Le.filter(t=>!t.tagShown).reduce((t,n)=>{let e=n.hiddenBecause??"UNKNOWN";return t[e]=(t[e]??0)+1,t},{}),nameOverflow:U.filter(t=>t.d.known!=="WITHHELD"&&t.d.name.length*6.6>Mt*_t-10).map(t=>t.d.name),gateLabelsOffFrame:$n.filter(t=>!t.onFrame).map(t=>t.stage),axisLabelsOffFrame:Yn.filter(t=>!t.onFrame).length,fogNearest:Math.min(...Le.map(t=>t.fog)),fogFurthest:Math.max(...Le.map(t=>t.fog)),glError:g.getError(),triangles:kn,shadowMap:Ft.size,resolution:`${H}x${k}`,dprScale:he,frames:Mr,msPerFrame:Number(Rt.toFixed(3)),fps:Math.round(1e3/Rt),renderer:un,rendererClass:vt?"software":"hardware",headroom:vt?null:Number((16.6-Rt).toFixed(3)),headroomRefusal:vt?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null,hardwareMsPerFrame:null,gates:P.map(t=>({stage:t.label,z:t.z,clearedUsd:t.clearedUsd,usdPerDay:Math.round(t.usdPerDay),ratePerSec:Number(t.ratePerSec.toFixed(2)),perMetre:Number(t.linearDensityPerMetre.toFixed(2)),lifeSeconds:Number(t.life.toFixed(2))})),perStageSeparation:nn,perDeal:Le};globalThis.E3=cn;var{perDeal:vr,gates:Fr,perStageSeparation:Zn,...qn}=cn;_r.textContent=JSON.stringify(qn,null,2)+`

gates (${Fr.length}):
`+Fr.map(t=>`  ${t.stage.padEnd(10)} $${String(t.usdPerDay).padStart(7)}/d ${String(t.ratePerSec).padStart(7)} p/s ${String(t.perMetre).padStart(7)} p/m life ${t.lifeSeconds}s`).join(`
`)+`

settle separation on screen:
`+Zn.map(t=>`  ${t.stage.padEnd(10)} ${t.separationPx===null?"n/a (needs 2 readable)":`${t.separationPx} px`}`).join(`
`)+`

perDeal (${vr.length}, full detail on globalThis.E3):
`+vr.map(t=>`  ${t.name.padEnd(16)} ${t.stage.padEnd(10)} ${(t.valueUsd===null?"ABSENT":pe(t.valueUsd)).padStart(7)} ${(t.days===null?"\u2014":`${t.days}d`).padStart(4)} base ${t.baseY.toFixed(2)} ${String(t.distance).padStart(5)}m ${String(t.screenHeightPx).padStart(3)}px ${t.tagShown?"TAG":`no tag: ${t.hiddenBecause}`}`).join(`
`);Dt();document.title="READY";

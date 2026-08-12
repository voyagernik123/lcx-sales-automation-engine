var Wt={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected."};function w(t,n){return n===void 0?{kind:"refused",code:t,reason:Wt[t]}:{kind:"refused",code:t,reason:Wt[t],detail:n}}function Ye(t){return t.kind==="stage"}function Ke(t,n={}){let e=t.getContext("webgl2",{antialias:n.antialias??!1,alpha:n.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!e)return w("NO_WEBGL2");let r=e.getExtension("EXT_color_buffer_float"),o=t.width,a=t.height,s=r?e.RGBA16F:e.RGBA8,i=r?e.HALF_FLOAT:e.UNSIGNED_BYTE,l=(x,v)=>{let y=e.createTexture();e.bindTexture(e.TEXTURE_2D,y),e.texImage2D(e.TEXTURE_2D,0,s,x,v,0,e.RGBA,i,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE);let b=e.createFramebuffer();e.bindFramebuffer(e.FRAMEBUFFER,b),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,y,0);let A=e.checkFramebufferStatus(e.FRAMEBUFFER);return A!==e.FRAMEBUFFER_COMPLETE?w("FRAMEBUFFER_INCOMPLETE",`status 0x${A.toString(16)} at ${x}\xD7${v}`):{texture:y,framebuffer:b,width:x,height:v}},d=n.bloomShift??2,u={w:o,h:a},c=l(o,a);if("kind"in c)return c;let f=l(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in f)return f;let p=l(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in p)return p;let m=e.createVertexArray();e.bindVertexArray(m);let E=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,E),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindVertexArray(null);let h=[];return{kind:"stage",gl:e,cssWidth:t.clientWidth||o,cssHeight:t.clientHeight||a,hdr:!!r,get width(){return u.w},get height(){return u.h},get scene(){return c},get bloomA(){return f},get bloomB(){return p},setRegion(x,v){let y=Math.max(1,Math.round(x)),b=Math.max(1,Math.round(v));if(!(y===u.w&&b===u.h)){u={w:y,h:b};for(let A of[c,f,p])"kind"in A||(e.deleteFramebuffer(A.framebuffer),e.deleteTexture(A.texture));c=l(y,b),f=l(Math.max(1,y>>d),Math.max(1,b>>d)),p=l(Math.max(1,y>>d),Math.max(1,b>>d))}},compile(x,v){let y=(O,M)=>{let S=e.createShader(O);return e.shaderSource(S,M),e.compileShader(S),e.getShaderParameter(S,e.COMPILE_STATUS)?S:w("SHADER_COMPILE_FAILED",e.getShaderInfoLog(S)??"(no log)")},b=y(e.VERTEX_SHADER,x);if(typeof b=="object"&&"kind"in b)return b;let A=y(e.FRAGMENT_SHADER,v);if(typeof A=="object"&&"kind"in A)return A;let R=e.createProgram();return e.attachShader(R,b),e.attachShader(R,A),e.linkProgram(R),e.getProgramParameter(R,e.LINK_STATUS)?(h.push(R),R):w("PROGRAM_LINK_FAILED",e.getProgramInfoLog(R)??"(no log)")},bindTarget(x){e.bindFramebuffer(e.FRAMEBUFFER,x?x.framebuffer:null),e.viewport(0,0,x?x.width:u.w,x?x.height:u.h)},blit(x,v){e.useProgram(x),e.bindVertexArray(m),v?.(x),e.drawArrays(e.TRIANGLES,0,3),e.bindVertexArray(null)},dispose(){for(let x of h)e.deleteProgram(x);for(let x of[c,f,p])"kind"in x||(e.deleteFramebuffer(x.framebuffer),e.deleteTexture(x.texture));e.deleteBuffer(E),e.deleteVertexArray(m)}}}var me=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function Re(t,n){let e=new Float32Array(16);for(let r=0;r<4;r++)for(let o=0;o<4;o++){let a=0;for(let s=0;s<4;s++)a+=t[s*4+o]*n[r*4+s];e[r*4+o]=a}return e}var Se=(t,n)=>[t[0]-n[0],t[1]-n[1],t[2]-n[2]],ve=(t,n)=>t[0]*n[0]+t[1]*n[1]+t[2]*n[2],Qe=(t,n)=>[t[1]*n[2]-t[2]*n[1],t[2]*n[0]-t[0]*n[2],t[0]*n[1]-t[1]*n[0]];function de(t){let n=Math.hypot(t[0],t[1],t[2]);return n===0?t:[t[0]/n,t[1]/n,t[2]/n]}function Ze(t,n,e,r){let o=1/Math.tan(t/2);return new Float32Array([o/n,0,0,0,0,o,0,0,0,0,(r+e)/(e-r),-1,0,0,2*r*e/(e-r),0])}function qe(t,n,e,r,o,a){let s=n-t,i=r-e,l=a-o;return new Float32Array([2/s,0,0,0,0,2/i,0,0,0,0,-2/l,0,-(n+t)/s,-(r+e)/i,-(a+o)/l,1])}function Fe(t,n,e){let r=de(Se(t,n)),o=Qe(e,r);if(Math.hypot(o[0],o[1],o[2])<1e-8)return me();let a=de(o),s=Qe(r,a);return new Float32Array([a[0],s[0],r[0],0,a[1],s[1],r[1],0,a[2],s[2],r[2],0,-ve(a,t),-ve(s,t),-ve(r,t),1])}function $t(t,n){let e=[0,1,2,3].map(o=>t[0+o]*n[0]+t[4+o]*n[1]+t[8+o]*n[2]+t[12+o]),r=e[3];return{x:e[0]/r,y:e[1]/r,z:e[2]/r,w:r}}function I(t,n,e,r){let o=$t(t,n);return{sx:(o.x*.5+.5)*e,sy:(1-(o.y*.5+.5))*r,behind:o.w<=0}}var Yt=`#version 300 es
precision highp float;
layout(location=0) in vec3 p;
uniform mat4 uMVP;
out float vY;
void main(){ vY = p.y; gl_Position = uMVP * vec4(p, 1.0); }`,Kt=`#version 300 es
precision highp float;
in float vY;
uniform vec3 uColour;
uniform float uGain, uFade, uFadeFrom, uFadeTo;
out vec4 frag;
void main(){
  float t = clamp((vY - uFadeFrom) / max(uFadeTo - uFadeFrom, 1e-4), 0.0, 1.0);
  frag = vec4(uColour * uGain * (1.0 - uFade * t), 1.0);
}`;function Je(t){let{gl:n}=t,e=t.compile(Yt,Kt);if("kind"in e)return e;let r=n.createVertexArray();n.bindVertexArray(r);let o=n.createBuffer();n.bindBuffer(n.ARRAY_BUFFER,o),n.enableVertexAttribArray(0),n.vertexAttribPointer(0,3,n.FLOAT,!1,0,0),n.bindVertexArray(null);let a=d=>n.getUniformLocation(e,d),s={mvp:a("uMVP"),colour:a("uColour"),gain:a("uGain"),fade:a("uFade"),fadeFrom:a("uFadeFrom"),fadeTo:a("uFadeTo")},i=(d,u,c)=>{n.useProgram(e),n.bindVertexArray(r),n.bindBuffer(n.ARRAY_BUFFER,o),n.bufferData(n.ARRAY_BUFFER,u,n.STREAM_DRAW),n.uniformMatrix4fv(s.mvp,!1,d),n.uniform3fv(s.colour,c.colour),n.uniform1f(s.gain,c.gain),n.uniform1f(s.fade,c.fade??0),n.uniform1f(s.fadeFrom,c.fadeFrom??0),n.uniform1f(s.fadeTo,c.fadeTo??1),n.drawArrays(n.TRIANGLE_STRIP,0,u.length/3),n.bindVertexArray(null)},l=(d,u,c,f,p,m,E,h)=>{let T=f-u,x=p-c,v=Math.hypot(T,x)||1,y=-x/v*E,b=T/v*E;i(d,new Float32Array([u-y,c-b,m,u+y,c+b,m,f-y,p-b,m,f+y,p+b,m]),h)};return{rule(d,u,c,f,p,m,E){l(d,u,c,f,p,0,m,E)},ruleAtDepth(d,u,c,f,p,m,E,h){l(d,u,c,f,p,m,E,h)},curve(d,u,c,f){let p=u.length/2,m=new Float32Array(p*6);for(let E=0;E<p;E++){let h=u[E*2],T=u[E*2+1];m[E*6+0]=h,m[E*6+1]=T-c,m[E*6+2]=0,m[E*6+3]=h,m[E*6+4]=T+c,m[E*6+5]=0}i(d,m,f)},dispose(){n.deleteBuffer(o),n.deleteVertexArray(r)}}}function Qt(t){return t<=.04045?t/12.92:Math.pow((t+.055)/1.055,2.4)}var En=/^#?([0-9a-fA-F]{6})$/;function P(t){let n=En.exec(t.trim());if(!n)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(t)}`);let e=n[1];return[0,2,4].map(r=>Qt(parseInt(e.slice(r,r+2),16)/255))}var et={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},hn=Object.freeze(Object.fromEntries(Object.keys(et).map(t=>[t,P(et[t])])));function tt(t,n,e){let r=Math.min(1,Math.max(0,e));return[t[0]+(n[0]-t[0])*r,t[1]+(n[1]-t[1])*r,t[2]+(n[2]-t[2])*r]}var Zt=.4;var rt=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${Zt.toFixed(2)}); }`,nt=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function bn(t){let n=[1/0,1/0,1/0],e=[-1/0,-1/0,-1/0];for(let r=0;r<t.length;r+=3)for(let o=0;o<3;o++){let a=t[r+o];a<n[o]&&(n[o]=a),a>e[o]&&(e[o]=a)}return t.length===0?{min:[0,0,0],max:[0,0,0]}:{min:n,max:e}}function qt(t,n,e,r){let o=new Float32Array(t.length);for(let s=0;s<r.length;s+=3){let i=r[s],l=r[s+1],d=r[s+2],u=i*3,c=l*3,f=d*3,p=i*2,m=l*2,E=d*2,h=t[c]-t[u],T=t[c+1]-t[u+1],x=t[c+2]-t[u+2],v=t[f]-t[u],y=t[f+1]-t[u+1],b=t[f+2]-t[u+2],A=e[m]-e[p],R=e[m+1]-e[p+1],O=e[E]-e[p],M=e[E+1]-e[p+1],S=A*M-O*R;if(Math.abs(S)<1e-12)continue;let D=1/S,ce=(h*M-v*R)*D,ge=(T*M-y*R)*D,je=(x*M-b*R)*D;for(let K of[u,c,f])o[K]=o[K]+ce,o[K+1]=o[K+1]+ge,o[K+2]=o[K+2]+je}let a=new Float32Array(t.length);for(let s=0;s<a.length;s+=3){let i=n[s],l=n[s+1],d=n[s+2],u=o[s],c=o[s+1],f=o[s+2],p=u*i+c*l+f*d;u-=i*p,c-=l*p,f-=d*p;let m=Math.hypot(u,c,f);m<1e-8&&(Math.abs(i)<.9?(u=0,c=-d,f=l):(u=-d,c=0,f=i),m=Math.hypot(u,c,f)||1),a[s]=u/m,a[s+1]=c/m,a[s+2]=f/m}return a}function Jt(t,n){let e=new Float32Array(t.length);for(let r=0;r<n.length;r+=3){let o=n[r]*3,a=n[r+1]*3,s=n[r+2]*3,i=t[a]-t[o],l=t[a+1]-t[o+1],d=t[a+2]-t[o+2],u=t[s]-t[o],c=t[s+1]-t[o+1],f=t[s+2]-t[o+2],p=l*f-d*c,m=d*u-i*f,E=i*c-l*u;for(let h of[o,a,s])e[h]=e[h]+p,e[h+1]=e[h+1]+m,e[h+2]=e[h+2]+E}for(let r=0;r<e.length;r+=3){let o=Math.hypot(e[r],e[r+1],e[r+2]);o>0&&(e[r]=e[r]/o,e[r+1]=e[r+1]/o,e[r+2]=e[r+2]/o)}return e}function Me(t,n,e,r,o){let{min:a,max:s}=bn(t),i=r??Jt(t,e);return{positions:t,normals:i,uvs:n,indices:e,min:a,max:s,tangents:o??qt(t,i,n,e)}}function J(t=1,n=1,e=1){let r=t/2,o=n/2,a=e/2,s=[[[-r,-o,a],[r,-o,a],[r,o,a],[-r,o,a]],[[r,-o,-a],[-r,-o,-a],[-r,o,-a],[r,o,-a]],[[r,-o,a],[r,-o,-a],[r,o,-a],[r,o,a]],[[-r,-o,-a],[-r,-o,a],[-r,o,a],[-r,o,-a]],[[-r,o,a],[r,o,a],[r,o,-a],[-r,o,-a]],[[-r,-o,-a],[r,-o,-a],[r,-o,a],[-r,-o,a]]],i=new Float32Array(72),l=new Float32Array(48),d=new Uint16Array(36),u=0,c=0,f=0,p=0;for(let m of s){for(let[E,h,T]of m)i[u++]=E,i[u++]=h,i[u++]=T;l[c++]=0,l[c++]=0,l[c++]=1,l[c++]=0,l[c++]=1,l[c++]=1,l[c++]=0,l[c++]=1,d[f++]=p,d[f++]=p+1,d[f++]=p+2,d[f++]=p,d[f++]=p+2,d[f++]=p+3,p+=4}return Me(i,l,d)}function ot(t=10,n=24){let e=Math.max(1,Math.floor(n)),r=(e+1)*(e+1),o=new Float32Array(r*3),a=new Float32Array(r*3),s=new Float32Array(r*2),i=new Uint16Array(e*e*6),l=0,d=0,u=0;for(let c=0;c<=e;c++)for(let f=0;f<=e;f++){let p=(f/e-.5)*t,m=(c/e-.5)*t;o[l]=p,o[l+1]=0,o[l+2]=m,a[l]=0,a[l+1]=1,a[l+2]=0,l+=3,s[d++]=f/e,s[d++]=c/e}for(let c=0;c<e;c++)for(let f=0;f<e;f++){let p=c*(e+1)+f,m=p+1,E=p+(e+1),h=E+1;i[u++]=p,i[u++]=E,i[u++]=m,i[u++]=m,i[u++]=E,i[u++]=h}return Me(o,s,i,a)}function at(t=.5,n=24,e=32){let r=Math.max(2,n),o=Math.max(3,e),a=(r+1)*(o+1),s=new Float32Array(a*3),i=new Float32Array(a*3),l=new Float32Array(a*2),d=new Uint16Array(r*o*6),u=0,c=0,f=0;for(let p=0;p<=r;p++){let m=p/r*Math.PI;for(let E=0;E<=o;E++){let h=E/o*Math.PI*2,T=Math.sin(m)*Math.cos(h),x=Math.cos(m),v=Math.sin(m)*Math.sin(h);s[u]=T*t,s[u+1]=x*t,s[u+2]=v*t,i[u]=T,i[u+1]=x,i[u+2]=v,u+=3,l[c++]=E/o,l[c++]=p/r}}for(let p=0;p<r;p++)for(let m=0;m<o;m++){let E=p*(o+1)+m,h=E+1,T=E+(o+1),x=T+1;d[f++]=E,d[f++]=h,d[f++]=T,d[f++]=h,d[f++]=x,d[f++]=T}return Me(s,l,d,i)}function st(t=.5,n=.08,e=64,r=24){let o=Math.max(3,e),a=Math.max(3,r),s=[],i=[],l=[],d=[],u=[];for(let c=0;c<=o;c++){let f=c/o*Math.PI*2,p=Math.cos(f),m=Math.sin(f);for(let E=0;E<=a;E++){let h=E/a*Math.PI*2,T=Math.cos(h),x=Math.sin(h);s.push((t+n*T)*p,n*x,(t+n*T)*m),i.push(p*T,x,m*T),l.push(c/o,E/a),u.push(-m,0,p)}}for(let c=0;c<o;c++)for(let f=0;f<a;f++){let p=c*(a+1)+f,m=p+1,E=p+(a+1),h=E+1;d.push(p,m,E,m,h,E)}return Me(new Float32Array(s),new Float32Array(l),new Uint16Array(d),new Float32Array(i),new Float32Array(u))}function k(t){return t.indices.length/3}function xn(t){if(!Number.isFinite(t)||t===0)return"0";let n=t.toFixed(12).replace(/0+$/,"").replace(/\.$/,"");return n==="-0"?"0":n}function er(t,n,e,r){let[o,a]=t,[s,i]=n,[l,d]=e,[u,c]=r,f=o-s+l-u,p=a-i+d-c;if(Math.abs(f)<1e-9&&Math.abs(p)<1e-9){let b=[s-o,u-o,o,i-a,c-a,a,0,0,1],A=b[0]*b[4]-b[1]*b[3];return Math.abs(A)<1e-9?null:b}let m=s-l,E=u-l,h=i-d,T=c-d,x=m*T-E*h;if(Math.abs(x)<1e-9)return null;let v=(f*T-E*p)/x,y=(m*p-f*h)/x;return[s-o+v*s,u-o+y*u,o,i-a+v*i,c-a+y*c,a,v,y,1]}function it(t,n,e,r,o,a){if(!(o>0)||!(a>0))return{refusal:"EMPTY_ELEMENT_BOX"};let i=[n.topLeft,n.topRight,n.bottomRight,n.bottomLeft].map(D=>I(t,D,e,r));if(i.some(D=>D.behind))return{refusal:"CORNER_BEHIND_CAMERA"};let l=i.map(D=>({x:D.sx,y:D.sy})),[d,u,c,f]=l,p=er([d.x,d.y],[u.x,u.y],[c.x,c.y],[f.x,f.y]);if(!p)return{refusal:"DEGENERATE_ON_SCREEN"};let m=.5*(d.x*u.y-u.x*d.y+(u.x*c.y-c.x*u.y)+(c.x*f.y-f.x*c.y)+(f.x*d.y-d.x*f.y)),E=1/o,h=1/a,[T,x,v,y,b,A,R,O,M]=p;return{transform:`matrix3d(${[T*E,y*E,0,R*E,x*h,b*h,0,O*h,0,0,1,0,v,A,0,M].map(xn).join(", ")})`,matrix:p,screen:l,signedArea:m}}function Z(t){return"refusal"in t}function lt(t,n,e,r,o,a,s=0){let i=Math.cos(a),l=Math.sin(a),d=(c,f)=>[t+i*c+l*s,e+f,n-l*c+i*s],u=r/2;return{topLeft:d(-u,o),topRight:d(u,o),bottomRight:d(u,0),bottomLeft:d(-u,0)}}function tr(t){let n=Number.isFinite(t)?Math.max(1,Math.floor(t)):1,e=Math.max(1,2**Math.ceil(Math.log2(Math.ceil(Math.sqrt(n))))),r=Math.max(1,2**Math.ceil(Math.log2(Math.ceil(n/e))));return{width:e,height:r,slots:e*r}}function rr(t,n,e){let r=[],o=[];for(let a=0;a<t.length;a++){let s=Math.max(0,t[a].rate),i=Math.max(0,Math.min(.1,n)),l=s*i+(e[a]??0),d=Math.floor(l);r.push(d),o.push(l-d)}return{counts:r,carry:o}}var nr=`
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
`,yn=`#version 300 es
precision highp float;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Tn=`#version 300 es
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
${nr}
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
}`,gn=`#version 300 es
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
}`,An=`#version 300 es
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
}`;function ut(t,n){let e=t.gl,{width:r,height:o,slots:a}=tr(n);if(!e.getExtension("EXT_color_buffer_float"))return w("MISSING_EXTENSION","particle simulation needs EXT_color_buffer_float to write positions to a texture \u2014 without it the state textures never update and the field renders frozen");let s=t.compile(yn,Tn);if("kind"in s)return s;let i=t.compile(gn,An);if("kind"in i)return i;let l=b=>{let A=e.createTexture();return e.bindTexture(e.TEXTURE_2D,A),e.texImage2D(e.TEXTURE_2D,0,e.RGBA32F,r,o,0,e.RGBA,e.FLOAT,b),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),A},d=new Float32Array(a*4);for(let b=0;b<a;b++)d[b*4+3]=-1;let u=l(d),c=l(d),f=l(new Float32Array(a*4)),p=l(new Float32Array(a*4)),m=e.createFramebuffer(),E=e.createFramebuffer(),h=e.createVertexArray(),T=0,x=[],v=(b,A)=>(e.bindFramebuffer(e.FRAMEBUFFER,m),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,b,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT1,e.TEXTURE_2D,A,0),e.drawBuffers([e.COLOR_ATTACHMENT0,e.COLOR_ATTACHMENT1]),e.checkFramebufferStatus(e.FRAMEBUFFER)===e.FRAMEBUFFER_COMPLETE),y=(b,A)=>e.getUniformLocation(b,A);return{slots:a,width:r,height:o,step(b){let A=b.sources.slice(0,8),R=rr(A,b.dtSeconds,x);x=R.carry;let O=[],M=[],S=[],D=0;for(let H=0;H<A.length&&D<8;H++){let Q=A[H],We=Math.min(R.counts[H]??0,a);for(;We>0&&D<8;){let Ae=T,$e=Math.min(We,a-Ae);O.push(Ae,Ae+$e-1,H,Q.life),M.push(Q.at[0],Q.at[1],Q.at[2],Q.spread??0),S.push(Q.velocity[0],Q.velocity[1],Q.velocity[2],0),T=(Ae+$e)%a,We-=$e,D++}}if(!v(c,p))return;e.viewport(0,0,r,o),e.disable(e.DEPTH_TEST),e.disable(e.BLEND),e.useProgram(s),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,u),e.uniform1i(y(s,"uState"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,f),e.uniform1i(y(s,"uVel"),1),e.uniform2f(y(s,"uSize"),r,o),e.uniform1f(y(s,"uDt"),Math.max(0,Math.min(.1,b.dtSeconds))),e.uniform1f(y(s,"uTime"),performance.now()/1e3%3600),e.uniform1f(y(s,"uNoiseScale"),b.noiseScale??.35),e.uniform1f(y(s,"uNoiseStrength"),b.noiseStrength??.6),e.uniform1f(y(s,"uDrag"),b.drag??.4);let ce=b.gravity??[0,0,0];e.uniform3f(y(s,"uGravity"),ce[0],ce[1],ce[2]),e.uniform1i(y(s,"uEmitCount"),D),D>0&&(e.uniform4fv(y(s,"uEmitRange"),new Float32Array(O)),e.uniform4fv(y(s,"uEmitPos"),new Float32Array(M)),e.uniform4fv(y(s,"uEmitVel"),new Float32Array(S)));let ge=new Float32Array(8);for(let H=0;H<8;H++)ge[H]=A[H]?.life??1;e.uniform1fv(y(s,"uLifes"),ge),e.bindVertexArray(h),e.drawArrays(e.TRIANGLES,0,3),e.bindVertexArray(null);let je=u;u=c,c=je;let K=f;f=p,p=K,e.bindFramebuffer(e.FRAMEBUFFER,null)},draw(b){let A=b.sources.slice(0,8);e.useProgram(i),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,u),e.uniform1i(y(i,"uState"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,f),e.uniform1i(y(i,"uVel"),1),e.uniform2f(y(i,"uSize"),r,o),e.uniformMatrix4fv(y(i,"uViewProj"),!1,b.viewProj),e.uniform1f(y(i,"uPointScale"),b.pointScale??28);let R=new Float32Array(24),O=new Float32Array(8);for(let M=0;M<8;M++){let S=A[M];R[M*3]=S?S.colour[0]:0,R[M*3+1]=S?S.colour[1]:0,R[M*3+2]=S?S.colour[2]:0,O[M]=S?S.life:1}e.uniform3fv(y(i,"uColours"),R),e.uniform1fv(y(i,"uLifes"),O),e.enable(e.BLEND),e.blendFunc(e.ONE,e.ONE),e.enable(e.DEPTH_TEST),e.depthMask(!1),e.bindVertexArray(h),e.drawArrays(e.POINTS,0,a),e.bindVertexArray(null),e.depthMask(!0),e.disable(e.BLEND),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null)},readState(){e.bindFramebuffer(e.FRAMEBUFFER,E),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,u,0);let b=new Float32Array(a*4);return e.checkFramebufferStatus(e.FRAMEBUFFER)===e.FRAMEBUFFER_COMPLETE&&e.readPixels(0,0,r,o,e.RGBA,e.FLOAT,b),e.bindFramebuffer(e.FRAMEBUFFER,null),b},dispose(){for(let b of[u,c,f,p])e.deleteTexture(b);e.deleteFramebuffer(m),e.deleteFramebuffer(E),e.deleteVertexArray(h),e.deleteProgram(s),e.deleteProgram(i)}}}var ct=89,dt=Math.PI/180;function _e(t){let n=Math.max(-ct,Math.min(ct,t.elevationDeg))*dt,e=t.azimuthDeg*dt,r=Math.max(1e-4,t.distance),o=Math.sin(n)*r,a=Math.cos(n)*r;return[t.target[0]+Math.sin(e)*a,t.target[1]+o,t.target[2]+Math.cos(e)*a]}function Le(t,n){let e=_e(t),r=t.near??Math.max(.01,t.distance/100),o=t.far??Math.max(r+1,t.distance*8),a=Ze((t.fovDeg??38)*dt,Math.max(.001,n),r,o),s=Fe(e,t.target,[0,1,0]);return Re(a,s)}function mt(t,n,e){let r=de(t.direction),o=t.extent??Math.max(.1,e*1.35),a=Math.max(1,e*2),s=[n[0]-r[0]*a,n[1]-r[1]*a,n[2]-r[2]*a],i=Math.abs(r[1])>.99?[0,0,1]:[0,1,0],l=Fe(s,n,i),d=qe(-o,o,-o,o,.01,a+e*2+o);return Re(d,l)}function ft(t,n){let e=Se([n[0],n[1],n[2]],[t[0],t[1],t[2]]);return Math.hypot(e[0],e[1],e[2])/2}function pt(t,n){return[(t[0]+n[0])/2,(t[1]+n[1])/2,(t[2]+n[2])/2]}function Et(t,n,e){let{gl:r}=t,o=Math.max(1,Math.floor(n)),a=Math.max(1,Math.floor(e)),s=r.createFramebuffer(),i=r.createTexture(),l=r.createTexture();if(!s||!i||!l)return w("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let d=t.hdr?r.RGBA16F:r.RGBA8,u=t.hdr?r.HALF_FLOAT:r.UNSIGNED_BYTE,c=()=>{r.bindTexture(r.TEXTURE_2D,i),r.texImage2D(r.TEXTURE_2D,0,d,o,a,0,r.RGBA,u,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),r.bindTexture(r.TEXTURE_2D,l),r.texImage2D(r.TEXTURE_2D,0,r.DEPTH_COMPONENT24,o,a,0,r.DEPTH_COMPONENT,r.UNSIGNED_INT,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),r.bindFramebuffer(r.FRAMEBUFFER,s),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,i,0),r.framebufferTexture2D(r.FRAMEBUFFER,r.DEPTH_ATTACHMENT,r.TEXTURE_2D,l,0),r.bindFramebuffer(r.FRAMEBUFFER,null)};c(),r.bindFramebuffer(r.FRAMEBUFFER,s);let f=r.checkFramebufferStatus(r.FRAMEBUFFER);return r.bindFramebuffer(r.FRAMEBUFFER,null),f!==r.FRAMEBUFFER_COMPLETE?w("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${f.toString(16)}). Depth texture support may be missing.`):{framebuffer:s,texture:i,depthTexture:l,get width(){return o},get height(){return a},bind(){r.bindFramebuffer(r.FRAMEBUFFER,s),r.viewport(0,0,o,a)},resize(p,m){let E=Math.max(1,Math.floor(p)),h=Math.max(1,Math.floor(m));E===o&&h===a||(o=E,a=h,c())},dispose(){r.deleteFramebuffer(s),r.deleteTexture(i),r.deleteTexture(l)}}}function ht(t,n=1024){let{gl:e}=t,r=Math.max(256,Math.min(2048,Math.floor(n))),o=e.createFramebuffer(),a=e.createTexture();if(!o||!a)return w("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");e.bindTexture(e.TEXTURE_2D,a),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT24,r,r,0,e.DEPTH_COMPONENT,e.UNSIGNED_INT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,o),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,a,0);let s=e.checkFramebufferStatus(e.FRAMEBUFFER);return e.bindFramebuffer(e.FRAMEBUFFER,null),s!==e.FRAMEBUFFER_COMPLETE?w("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${s.toString(16)}).`):{framebuffer:o,depthTexture:a,size:r,bind(){e.bindFramebuffer(e.FRAMEBUFFER,o),e.viewport(0,0,r,r)},dispose(){e.deleteFramebuffer(o),e.deleteTexture(a)}}}var xt=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,bt={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function or(t,n,e={}){let r=e.zenith??bt.zenith,o=e.horizon??bt.horizon,a=e.ground??bt.ground;t.uniform3f(t.getUniformLocation(n,"uSkyZenith"),r[0],r[1],r[2]),t.uniform3f(t.getUniformLocation(n,"uSkyHorizon"),o[0],o[1],o[2]),t.uniform3f(t.getUniformLocation(n,"uSkyGround"),a[0],a[1],a[2])}var To=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${xt}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;var ar=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,yt=`#version 300 es
precision highp float;
void main(){}`,vn=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,sr=`#version 300 es
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
}`,ir=`#version 300 es
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
${xt}

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
}`;function z(t,n){let{gl:e}=t,r=e.createVertexArray(),o=e.createBuffer(),a=e.createBuffer(),s=e.createBuffer(),i=e.createBuffer();return!r||!o||!a||!s||!i?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(e.bindVertexArray(r),e.bindBuffer(e.ARRAY_BUFFER,o),e.bufferData(e.ARRAY_BUFFER,n.positions,e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,3,e.FLOAT,!1,0,0),e.bindBuffer(e.ARRAY_BUFFER,a),e.bufferData(e.ARRAY_BUFFER,n.normals,e.STATIC_DRAW),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,3,e.FLOAT,!1,0,0),e.bindBuffer(e.ARRAY_BUFFER,s),e.bufferData(e.ARRAY_BUFFER,n.tangents,e.STATIC_DRAW),e.enableVertexAttribArray(2),e.vertexAttribPointer(2,3,e.FLOAT,!1,0,0),e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,i),e.bufferData(e.ELEMENT_ARRAY_BUFFER,n.indices,e.STATIC_DRAW),e.bindVertexArray(null),{vao:r,indexCount:n.indices.length,indexType:n.indices instanceof Uint32Array?e.UNSIGNED_INT:e.UNSIGNED_SHORT,dispose(){e.deleteVertexArray(r),e.deleteBuffer(o),e.deleteBuffer(a),e.deleteBuffer(s),e.deleteBuffer(i)}})}function Tt(t){let{gl:n}=t,e=t.compile(ar,yt);if("kind"in e)return e;let r=t.compile(sr,ir);if("kind"in r)return r;let o=t.compile(vn,yt);if("kind"in o)return o;let a=(s,i)=>n.getUniformLocation(s,i);return{shadowPass(s,i,l,d){let u=d??(()=>{});l.bind(),u("shadow.bind"),n.clear(n.DEPTH_BUFFER_BIT),n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.FRONT),n.useProgram(e),u("useProgram(shadow)"),n.uniformMatrix4fv(a(e,"uLightVP"),!1,s),u("uLightVP");for(let c of i)n.uniformMatrix4fv(a(e,"uModel"),!1,c.model),u("shadow uModel"),n.bindVertexArray(c.mesh.vao),u("shadow bindVAO"),n.drawElements(n.TRIANGLES,c.mesh.indexCount,c.mesh.indexType,0),u("shadow drawElements");n.bindVertexArray(null),n.cullFace(n.BACK)},depthPrepass(s,i){n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.colorMask(!1,!1,!1,!1),n.useProgram(o),n.uniformMatrix4fv(a(o,"uViewProj"),!1,s);for(let l of i)n.uniformMatrix4fv(a(o,"uModel"),!1,l.model),n.bindVertexArray(l.mesh.vao),n.drawElements(n.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0);n.bindVertexArray(null),n.colorMask(!0,!0,!0,!0)},draw(s){let i=s.onStep??(()=>{});if(n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.useProgram(r),n.uniformMatrix4fv(a(r,"uViewProj"),!1,s.viewProj),i("uViewProj"),n.uniform3fv(a(r,"uEye"),s.eye),i("uEye"),n.uniform3fv(a(r,"uLightDir"),s.lightDir),i("uLightDir"),n.uniform3fv(a(r,"uLightColour"),s.lightColour),i("uLightColour"),n.uniform1f(a(r,"uAmbientGain"),s.ambientGain??1),i("uAmbientGain"),s.fog&&s.fog.density>0){n.uniform1f(a(r,"uFogDensity"),s.fog.density),n.uniform1f(a(r,"uFogHeight"),s.fog.height),n.uniform1f(a(r,"uFogFloor"),s.fog.floor??0);let l=s.fog.colour;l==="sky"?n.uniform3f(a(r,"uFogColour"),-1,-1,-1):n.uniform3f(a(r,"uFogColour"),l[0],l[1],l[2]),i("fog")}else n.uniform1f(a(r,"uFogDensity"),0);or(n,r,s.sky),i("bindSky"),s.ao&&s.screenSize?(n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,s.ao),n.uniform1i(a(r,"uAO"),1),n.uniform2f(a(r,"uScreenSize"),s.screenSize[0],s.screenSize[1]),n.uniform1f(a(r,"uAOEnabled"),1)):n.uniform1f(a(r,"uAOEnabled"),0),i("bindAO"),n.uniformMatrix4fv(a(r,"uLightVP"),!1,s.lightVP),i("lit uLightVP"),s.shadow?(n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,s.shadow.depthTexture),n.uniform1i(a(r,"uShadowMap"),0),n.uniform1f(a(r,"uShadowTexel"),1/s.shadow.size),n.uniform1f(a(r,"uShadowStrength"),s.shadowStrength??1)):n.uniform1f(a(r,"uShadowStrength"),0);for(let l of s.draws)n.uniformMatrix4fv(a(r,"uModel"),!1,l.model),n.uniformMatrix3fv(a(r,"uNormalMat"),!1,l.normalMat),i("uNormalMat"),n.uniform3fv(a(r,"uBaseColour"),l.material.baseColour),i("uBaseColour"),n.uniform1f(a(r,"uRoughness"),l.material.roughness),n.uniform1f(a(r,"uMetalness"),l.material.metalness),n.uniform1f(a(r,"uAnisotropy"),l.material.anisotropy??0),n.bindVertexArray(l.mesh.vao),i("lit bindVAO"),n.drawElements(n.TRIANGLES,l.mesh.indexCount,l.mesh.indexType,0),i("lit drawElements");n.bindVertexArray(null),n.disable(n.CULL_FACE)},dispose(){n.deleteProgram(e),n.deleteProgram(r),n.deleteProgram(o)}}}var gt=`
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
}`,lr=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Rn=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${gt}

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
}`,Sn=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${gt}

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
}`;function At(t,n,e){let{gl:r}=t,o=t.compile(lr,Rn);if("kind"in o)return o;let a=t.compile(lr,Sn);if("kind"in a)return a;let s=Math.max(1,n>>1),i=Math.max(1,e>>1),l=()=>{let m=r.createFramebuffer(),E=r.createTexture();return!m||!E?null:{fb:m,tex:E}},d=l(),u=l();if(!d||!u)return w("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let c=()=>{for(let m of[d,u])r.bindTexture(r.TEXTURE_2D,m.tex),r.texImage2D(r.TEXTURE_2D,0,r.R8,s,i,0,r.RED,r.UNSIGNED_BYTE,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),r.bindFramebuffer(r.FRAMEBUFFER,m.fb),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,m.tex,0);r.bindFramebuffer(r.FRAMEBUFFER,null)};c(),r.bindFramebuffer(r.FRAMEBUFFER,d.fb);let f=r.checkFramebufferStatus(r.FRAMEBUFFER);if(r.bindFramebuffer(r.FRAMEBUFFER,null),f!==r.FRAMEBUFFER_COMPLETE)return w("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${f.toString(16)}).`);let p=(m,E,h,T,x,v,y)=>{r.activeTexture(r.TEXTURE0+y),r.bindTexture(r.TEXTURE_2D,E),r.uniform1i(r.getUniformLocation(m,"uDepth"),y),r.uniform2f(r.getUniformLocation(m,"uNearFar"),h,T),r.uniform1f(r.getUniformLocation(m,"uTanHalfFov"),Math.tan(x*Math.PI/360)),r.uniform1f(r.getUniformLocation(m,"uAspect"),v)};return{get texture(){return d.tex},get width(){return s},get height(){return i},compute(m){r.disable(r.DEPTH_TEST),r.depthMask(!1),r.disable(r.BLEND),r.disable(r.CULL_FACE),r.bindFramebuffer(r.FRAMEBUFFER,d.fb),r.viewport(0,0,s,i),r.useProgram(o),p(o,m.depthTexture,m.near,m.far,m.fovDeg,m.aspect,0),r.uniform2f(r.getUniformLocation(o,"uTexel"),1/s,1/i),r.uniform1f(r.getUniformLocation(o,"uRadius"),m.radius??.55),r.uniform1f(r.getUniformLocation(o,"uStrength"),m.strength??1.15),r.uniform1f(r.getUniformLocation(o,"uBias"),m.bias??.035),t.blit(o);for(let[E,h,T]of[[d,u,[1,0]],[u,d,[0,1]]])r.bindFramebuffer(r.FRAMEBUFFER,h.fb),r.viewport(0,0,s,i),r.useProgram(a),p(a,m.depthTexture,m.near,m.far,m.fovDeg,m.aspect,0),r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,E.tex),r.uniform1i(r.getUniformLocation(a,"uAO"),1),r.uniform2f(r.getUniformLocation(a,"uTexel"),1/s,1/i),r.uniform2f(r.getUniformLocation(a,"uDir"),T[0],T[1]),t.blit(a);r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,null),r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,null),r.bindFramebuffer(r.FRAMEBUFFER,null),r.depthMask(!0),r.enable(r.DEPTH_TEST)},resize(m,E){let h=Math.max(1,m>>1),T=Math.max(1,E>>1);h===s&&T===i||(s=h,i=T,c())},dispose(){r.deleteProgram(o),r.deleteProgram(a);for(let m of[d,u])r.deleteFramebuffer(m.fb),r.deleteTexture(m.tex)}}}var be=new URLSearchParams(location.search),It=be.get("settle")!=="0",Bt=be.get("particles")!=="0",Lr=be.get("fog")!=="0",xe=Math.max(1,Math.min(3,Number(be.get("scale")??1))),Dr=Number(be.get("frames")??300),X=1200*xe,j=720*xe,ie=document.getElementById("c");ie.width=X;ie.height=j;var wr=document.getElementById("log");function Pr(t){throw document.title="REFUSED",wr.textContent=t,new Error(t)}function N(t,n){return"kind"in n&&Pr(`${t}: ${n.code} \u2014 ${n.reason} ${n.detail??""}`),n}var Ne=Ke(ie,{alpha:!1});Ye(Ne)||Pr(`stage: ${Ne.code} \u2014 ${Ne.reason}`);var L=Ne,g=L.gl,Fn=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Mn=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${rt}
${nt}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,_n=N("present",L.compile(Fn,Mn)),vt=N("lit",Tt(L)),De=N("target",Et(L,X,j)),Mt=N("shadow",ht(L,1536)),ur=N("ao",At(L,X,j)),oe=N("strokes",Je(L)),Ve=["SOURCED","QUALIFIED","DILIGENCE","TERMS","SIGNED"],Ur=[{name:"SABLE TREASURY",stage:"SOURCED",valueUsd:24e4,daysSinceUpdate:63,known:"OBSERVED"},{name:"PRAXIS DESK",stage:"SOURCED",valueUsd:null,daysSinceUpdate:9,known:"VALUE_ABSENT"},{name:"CASTOR LABS",stage:"SOURCED",valueUsd:15e4,daysSinceUpdate:34,known:"OBSERVED"},{name:"LUMEN CUSTODY",stage:"SOURCED",valueUsd:95e3,daysSinceUpdate:17,known:"OBSERVED"},{name:"TIBER CLEARING",stage:"QUALIFIED",valueUsd:31e4,daysSinceUpdate:4,known:"OBSERVED"},{name:"VANTA MARKETS",stage:"QUALIFIED",valueUsd:62e4,daysSinceUpdate:28,known:"OBSERVED"},{name:"\u2014",stage:"QUALIFIED",valueUsd:null,daysSinceUpdate:null,known:"WITHHELD"},{name:"HELIOS EXCHANGE",stage:"DILIGENCE",valueUsd:175e4,daysSinceUpdate:52,known:"OBSERVED"},{name:"KESTREL FUND",stage:"DILIGENCE",valueUsd:43e4,daysSinceUpdate:11,known:"OBSERVED"},{name:"MERIDIAN PAY",stage:"TERMS",valueUsd:26e5,daysSinceUpdate:41,known:"OBSERVED"},{name:"NORDIC CUSTODY",stage:"TERMS",valueUsd:88e4,daysSinceUpdate:6,known:"OBSERVED"},{name:"ATLAS OTC",stage:"SIGNED",valueUsd:42e5,daysSinceUpdate:3,known:"OBSERVED"}],ae=45,pe=.86,Nr=.46,Ln=Math.max(...Ur.map(t=>t.valueUsd??0)),Dn=t=>Nr*Math.cbrt(t/Ln),re=.11,F=1.45,Gt=2.8,Cr=-13,ye=Cr-2.6,ue=.4,Or=ue-ye,_t=(ue+ye)/2,B=1.15,He=t=>Cr+t*Gt,wn=.62,Pn=.4,cr=.6,Lt=.66,dr=.3,Ir=.16,Dt=190,Un=13.5,Ee=Lr?Math.log(10)/17.5:0,mr="#080D18",Br=90,Vt=1600,Oe=1.4,Ht=1024,Gr=150,Vr="#2C6BFF",Hr="#C9552B",ke="#E0A94A",kr="#5C6880",zr=ot(2*F,40),Xr=J(.18,1.25,Or),jr=J(.1,B,.1),Wr=J(2*F+.2,.1,.1),$r=J(2*F,.05,.13),Yr=J(1,1,1),Kr=st(re*1.25,re*.34,40,14),Qr=at(re,20,28),Nn=N("floor",z(L,zr)),fr=N("wall",z(L,Xr)),pr=N("post",z(L,jr)),Cn=N("lintel",z(L,Wr)),On=N("sill",z(L,$r)),In=N("deal",z(L,Yr)),Bn=N("absent",z(L,Kr)),Gn=N("withheld",z(L,Qr)),$=new Float32Array([1,0,0,0,1,0,0,0,1]),Vn=new Float32Array([1,0,0,0,0,1,0,-1,0]),Y=(t,n,e,r=1)=>{let o=me();return o[0]=r,o[5]=r,o[10]=r,o[12]=t,o[13]=n,o[14]=e,o},Hn=(t,n,e)=>{let r=me();return r[5]=0,r[6]=1,r[9]=-1,r[10]=0,r[12]=t,r[13]=n,r[14]=e,r},Zr=.1,qr=44,Ie={target:[0,.85,-6.6],distance:8,azimuthDeg:19,elevationDeg:12.5,fovDeg:35,near:Zr,far:qr},W=_e(Ie),Er=new Map,_=Ur.map((t,n)=>{let e=Ve.indexOf(t.stage),r=Er.get(t.stage)??0;Er.set(t.stage,r+1);let o=He(e)+wn+r*Pn,a=r%2===0?-cr:cr,s=t.valueUsd===null?null:Dn(t.valueUsd),i=t.known==="VALUE_ABSENT"?"MASS_REFUSED_VALUE_NEVER_MEASURED":t.known==="WITHHELD"?"MASS_REFUSED_VALUE_WITHHELD":null,l=t.daysSinceUpdate===null?null:t.daysSinceUpdate/ae,d=l===null?null:It?Math.min(1,l):0,u=t.daysSinceUpdate===null?"SETTLE_REFUSED_LAST_TOUCH_WITHHELD":null,c=s!==null?s/2:re,f=d===null?pe+.3:(1-d)*pe,p=f+c;return{d:t,i:n,stageIndex:e,slot:r,x:a,z:o,edge:s,settle:d,settleClamped:l!==null&&l>1,baseY:f,centreY:p,topY:f+2*c,massRefusal:i,settleRefusal:u,distance:Math.hypot(a-W[0],p-W[1],o-W[2])}}),kn=_.filter(t=>{let n=t.edge!==null?t.edge/2:re,e=t.z-He(t.stageIndex);return e-n<.05||e+n>Gt-.05}).map(t=>t.d.name),zn=t=>_.filter(n=>n.stageIndex>=t&&n.d.known==="OBSERVED"&&n.d.valueUsd!==null).reduce((n,e)=>n+(e.d.valueUsd??0),0),U=Ve.map((t,n)=>{let e=He(n),r=zn(n),o=r/Br,a=o/Vt,s=Math.min(Gt,ue-e-.2),i=Math.max(.2,s/Oe);return{label:t,index:n,z:e,clearedUsd:r,usdPerDay:o,ratePerSec:a,life:i,linearDensityPerMetre:a/Oe}}),Xn=[.055,.16,.62],Jr=U.map(t=>({at:[0,.52,t.z+.06],rate:t.ratePerSec,velocity:[0,0,Oe],spread:.44,colour:Xn,life:t.life})),ee=Bt?ut(L,Ht):null,C=ee!==null&&!("kind"in ee)?ee:null,wt=ee!==null&&"kind"in ee?`${ee.code} \u2014 ${ee.reason}`:Bt?null:"DISABLED_BY_PARAM",jn=Math.round(U.reduce((t,n)=>t+n.ratePerSec*n.life,0)),hr=U.reduce((t,n)=>t+n.ratePerSec,0),br=hr>0?(C?.slots??Ht)/hr:1/0,xr=Math.max(...U.map(t=>t.life)),en={sources:Jr,dtSeconds:1/60,noiseScale:.55,noiseStrength:.22,drag:.5},yr={baseColour:P("#131D31"),roughness:.6,metalness:.03},we={baseColour:P("#2C6BFF"),roughness:.28,metalness:.18},tn=Y(0,0,_t,1);tn[10]=Or/(2*F);var te=[{mesh:Nn,model:tn,normalMat:$,material:{baseColour:P("#080D17"),roughness:.82,metalness:0}},{mesh:fr,model:Y(-(F+.09),.625,_t),normalMat:$,material:yr},{mesh:fr,model:Y(F+.09,.625,_t),normalMat:$,material:yr}];for(let t of U)te.push({mesh:pr,model:Y(-(F+.05),B/2,t.z),normalMat:$,material:we},{mesh:pr,model:Y(F+.05,B/2,t.z),normalMat:$,material:we},{mesh:Cn,model:Y(0,B,t.z),normalMat:$,material:we},{mesh:On,model:Y(0,.025,t.z),normalMat:$,material:we});for(let t of _)if(t.d.known==="WITHHELD")te.push({mesh:Gn,model:Y(t.x,t.centreY,t.z),normalMat:$,material:{baseColour:P(kr),roughness:.28,metalness:.58}});else if(t.edge===null)te.push({mesh:Bn,model:Hn(t.x,t.centreY,t.z),normalMat:Vn,material:{baseColour:P(ke),roughness:.44,metalness:.1}});else{let n=tt(P(Vr),P(Hr),t.settle??0);te.push({mesh:In,model:Y(t.x,t.centreY,t.z,t.edge),normalMat:$,material:{baseColour:n,roughness:.34+.16*(t.settle??0),metalness:.06}})}var rn=[.42,-.66,-.62],Tr=[-2,0,ye],gr=[2,1.9,ue],Ar=mt({direction:rn,colour:[1,1,1],extent:9.6},pt(Tr,gr),ft(Tr,gr)),Wn=k(zr)+2*k(Xr)+U.length*(2*k(jr)+k(Wr)+k($r))+_.filter(t=>t.d.known==="OBSERVED").length*k(Yr)+_.filter(t=>t.d.known==="VALUE_ABSENT").length*k(Kr)+_.filter(t=>t.d.known==="WITHHELD").length*k(Qr),q=Le(Ie,X/j),G=X/xe,V=j/xe,kt=t=>Ee<=0?0:1-Math.exp(-Ee*t),he=t=>t>=1e6?`$${(t/1e6).toFixed(2)}M`:`$${Math.round(t/1e3)}k`,Rt=[],vr=(t,n,e)=>{let r=0;for(let o=0;o<4;o++){let a=t[o],s=t[(o+1)%4],i=(s.x-a.x)*(e-a.y)-(s.y-a.y)*(n-a.x);if(Math.abs(i)<1e-9)continue;let l=i>0?1:-1;if(r===0)r=l;else if(l!==r)return!1}return!0},nn=t=>{let n=I(q,[t.x,t.baseY,t.z],G,V),e=I(q,[t.x,t.topY,t.z],G,V);return n.behind||e.behind?0:Math.abs(n.sy-e.sy)},Be=t=>{let n=I(q,[t.x,t.centreY,t.z],G,V);return n.behind?null:n.sy},zt=t=>{if(t.settle===null)return null;let n=t.edge!==null?t.edge/2:re,e=I(q,[t.x,t.baseY+n,t.z],G,V),r=I(q,[t.x,pe+n,t.z],G,V);return e.behind||r.behind?null:Math.abs(e.sy-r.sy)},ze=[..._].sort((t,n)=>t.distance-n.distance).map(t=>{let n=t.d.known==="WITHHELD",e=t.distance>Un,r=Math.round(Lt*Dt),o=Math.round(dr*Dt),a=Math.atan2(W[0]-t.x,W[2]-t.z),s=lt(t.x,t.z,t.topY+Ir,Lt,dr,a,0),i=it(q,s,G,V,r,o),l=Z(i)?i.refusal:null,d=!Z(i)&&i.signedArea<=0,u=Z(i)?0:Math.max(Math.hypot(i.screen[0].x-i.screen[1].x,i.screen[0].y-i.screen[1].y),Math.hypot(i.screen[3].x-i.screen[2].x,i.screen[3].y-i.screen[2].y)),c=u<26,f=Z(i)?0:i.screen.filter(E=>Rt.some(h=>vr(h,E.x,E.y))).length+Rt.reduce((E,h)=>E+h.filter(T=>vr(i.screen.map(x=>({x:x.x,y:x.y})),T.x,T.y)).length,0),p=f>=2,m=!l&&!d&&!n&&!e&&!c&&!p;return m&&!Z(i)&&Rt.push(i.screen.map(E=>({x:E.x,y:E.y}))),{p:t,proj:i,shown:m,ew:r,eh:o,refusal:l,backFacing:d,withheld:n,tooFar:e,edgeOn:c,occluded:p,widthPx:u,coveredCorners:f}}),$n=ze.filter(t=>t.shown).map(t=>t.p),Pe={colour:P("#4E8CFF"),gain:2.4},Yn={colour:P("#7FB2FF"),gain:1.1},Kn={colour:P("#7FB2FF"),gain:.85},on=He(U.length-1),an=[0,20,ae].map(t=>({days:t,y:(1-Math.min(1,t/ae))*pe+.012,label:t>=ae?`${t}d+`:`${t}d`}));function Pt(){let t=Le(Ie,X/j);C&&C.step(en),vt.shadowPass(Ar,te,Mt),De.bind();let n=P(mr);g.clearColor(n[0],n[1],n[2],1),g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT),vt.depthPrepass(t,te),ur.compute({depthTexture:De.depthTexture,near:Zr,far:qr,fovDeg:Ie.fovDeg??35,aspect:X/j,radius:.36,strength:1.25}),De.bind(),vt.draw({viewProj:t,eye:W,lightDir:rn,lightColour:[3.1,3.02,2.9],ambientGain:.42,lightVP:Ar,shadow:Mt,shadowStrength:.92,draws:te,ao:ur.texture,screenSize:[X,j],fog:Ee>0?{density:Ee,height:5,floor:0,colour:P(mr)}:null}),g.enable(g.BLEND),g.blendFunc(g.ONE,g.ONE),g.enable(g.DEPTH_TEST),g.depthMask(!1);for(let e of U)oe.ruleAtDepth(t,-F,.02,F,.02,e.z,.012,Pe),oe.ruleAtDepth(t,-F,B,F,B,e.z,.01,Pe),oe.ruleAtDepth(t,-F,.02,-F,B,e.z,.01,Pe),oe.ruleAtDepth(t,F,.02,F,B,e.z,.01,Pe);for(let e of an)oe.ruleAtDepth(t,F-.3,e.y,F-.02,e.y,on,.006,Yn);for(let e of $n)oe.ruleAtDepth(t,e.x,e.topY,e.x,e.topY+Ir,e.z,.005,Kn);g.depthMask(!0),g.disable(g.BLEND),C&&C.draw({viewProj:t,sources:Jr,pointScale:22}),g.bindFramebuffer(g.FRAMEBUFFER,null),g.viewport(0,0,X,j),g.disable(g.DEPTH_TEST),g.activeTexture(g.TEXTURE0),g.bindTexture(g.TEXTURE_2D,De.texture),L.blit(_n,e=>g.uniform1i(g.getUniformLocation(e,"uScene"),0))}function Qn(t){Pt();let n=new Uint8Array(4);g.readPixels(0,0,1,1,g.RGBA,g.UNSIGNED_BYTE,n);let e=performance.now();for(let r=0;r<t;r++)Pt();return g.readPixels(0,0,1,1,g.RGBA,g.UNSIGNED_BYTE,n),(performance.now()-e)/t}if(C)for(let t=0;t<Gr;t++)C.step(en);var St=Qn(Math.max(1,Dr)),Xe=document.createElement("div");Xe.style.cssText=`position:relative;overflow:hidden;width:${G}px;height:${V}px`;ie.parentNode?.insertBefore(Xe,ie);Xe.appendChild(ie);var ne=document.createElement("div");ne.style.cssText="position:absolute;inset:0;pointer-events:none";Xe.appendChild(ne);for(let t of[...ze].sort((n,e)=>e.p.distance-n.p.distance)){let{p:n,proj:e,shown:r,ew:o,eh:a}=t;if(!r||Z(e))continue;let s=kt(n.distance),i=document.createElement("div");i.style.cssText=`position:absolute;left:0;top:0;width:${o}px;height:${a}px;transform-origin:0 0;transform:${e.transform};display:flex;flex-direction:column;justify-content:center;gap:3px;padding:0 5px;overflow:hidden;opacity:${(1-.7*s).toFixed(3)};-webkit-font-smoothing:antialiased`;let l=n.d.valueUsd===null?`<span style="color:${ke}">VALUE ABSENT</span>`:he(n.d.valueUsd),d=n.d.daysSinceUpdate===null?"\u2014":`${n.d.daysSinceUpdate} d`;i.innerHTML=`<div style="font:700 11px/1.05 ui-monospace,monospace;color:#fff">${n.d.name}</div><div style="font:400 10.5px/1.2 ui-monospace,monospace;color:rgba(255,255,255,0.80)">${l} \xB7 ${d}</div><div style="font:600 9px/1 ui-monospace,monospace;letter-spacing:.14em;color:rgba(255,255,255,0.60)">${n.d.stage}</div>`,ne.appendChild(i)}var Zn=U.map(t=>{let n=I(q,[0,B+.3,t.z],G,V),e=kt(Math.hypot(W[0],W[1]-B,W[2]-t.z)),r=!n.behind&&n.sx>30&&n.sx<G-30&&n.sy>8&&n.sy<V-8;if(r){let o=document.createElement("div");o.style.cssText=`position:absolute;left:${n.sx.toFixed(1)}px;top:${n.sy.toFixed(1)}px;transform:translate(-50%,-100%);text-align:center;white-space:nowrap;opacity:${(1-.72*e).toFixed(3)}`,o.innerHTML=`<div style="font:600 10px/1.25 ui-monospace,monospace;letter-spacing:.16em;color:#9CC2FF">${t.label}</div><div style="font:400 9.5px/1.25 ui-monospace,monospace;color:rgba(196,212,240,0.72)">${he(t.usdPerDay)}/d</div>`,ne.appendChild(o)}return{stage:t.label,sx:Math.round(n.sx),sy:Math.round(n.sy),onFrame:r}}),qn=an.map(t=>{let n=I(q,[F+.06,t.y,on],G,V),e=!n.behind&&n.sx>0&&n.sx<G&&n.sy>0&&n.sy<V;if(e){let r=document.createElement("div");r.style.cssText=`position:absolute;left:${n.sx.toFixed(1)}px;top:${n.sy.toFixed(1)}px;transform:translate(2px,-50%);font:500 9.5px/1 ui-monospace,monospace;letter-spacing:.08em;color:rgba(196,212,240,0.78);white-space:nowrap`,r.textContent=t.label,ne.appendChild(r)}return{label:t.label,onFrame:e}}),sn=Ve.map((t,n)=>{let e=_.filter(i=>i.stageIndex===n&&i.settle!==null&&i.edge!==null);if(e.length<2)return{stage:t,readable:e.length,separationPx:null};let r=e.reduce((i,l)=>(l.settle??0)>(i.settle??0)?l:i),o=e.reduce((i,l)=>(l.settle??0)<(i.settle??0)?l:i),a=Be(r),s=Be(o);return{stage:t,readable:e.length,separationPx:a===null||s===null?null:Math.round(Math.abs(a-s))}}),Rr=sn.map(t=>t.separationPx).filter(t=>t!==null),Jn=Rr.length>0?Math.min(...Rr):0,ln=[];for(let t of _)for(let n of _){if(t.i>=n.i||t.stageIndex!==n.stageIndex||t.settle===null||n.settle===null)continue;let[e,r]=t.settle>n.settle?[t,n]:[n,t],o=Be(e),a=Be(r);o!==null&&a!==null&&o<a&&ln.push(`${e.d.name} above ${r.d.name}`)}var le=_.filter(t=>t.edge!==null&&t.d.known==="OBSERVED"),Ut=new Map;for(let t of le)Ut.set(t.i,nn(t));var un=0,cn=0;for(let t of le)for(let n of le){if(t.i>=n.i)continue;let[e,r]=(t.d.valueUsd??0)>(n.d.valueUsd??0)?[t,n]:[n,t];(Ut.get(e.i)??0)<(Ut.get(r.i)??0)&&(un++,e.stageIndex===r.stageIndex&&cn++)}var dn=.6,Ce=le.reduce((t,n)=>t+(n.d.valueUsd??0),0),Te=le.filter(t=>(t.settle??0)>=dn),Sr=Te.reduce((t,n)=>t+(n.d.valueUsd??0),0),eo=Te.filter(t=>t.stageIndex>=Ve.indexOf("DILIGENCE")),Ge=eo.reduce((t,n)=>t+(n.d.valueUsd??0),0),Fr=Te.map(t=>zt(t)).filter(t=>t!==null),to=Fr.length>0?Math.round(Math.min(...Fr)):0,ro=Math.round(Math.max(0,..._.map(t=>zt(t)).filter(t=>t!==null))),se={OBSERVED:_.filter(t=>t.d.known==="OBSERVED").length,VALUE_ABSENT:_.filter(t=>t.d.known==="VALUE_ABSENT").length,WITHHELD:_.filter(t=>t.d.known==="WITHHELD").length},Xt=document.createElement("div");Xt.style.cssText="position:absolute;left:18px;top:16px;display:flex;flex-direction:column;gap:7px";Xt.innerHTML=`<div style="font:600 11px/1 ui-monospace,monospace;letter-spacing:.16em;color:#8FB7FF">PIPELINE \xB7 SIZE IS VALUE, HEIGHT IS MOVEMENT</div><div style="font:400 10.5px/1.55 ui-monospace,monospace;color:rgba(196,212,240,0.86)"><b style="color:#FF9B76">${he(Ge)}</b> PAST DILIGENCE AND SETTLED &nbsp;\xB7&nbsp; ${Math.round(100*Ge/Math.max(1,Ce))}% OF THE READABLE BOOK<br>${ae} d = ON THE FLOOR &nbsp;\xB7&nbsp; 1 PARTICLE = ${he(Vt)}/d CLEARED<br>${It?"MOVEMENT AXIS ON":"MOVEMENT AXIS OFF \u2014 every deal pinned to the rail"} &nbsp;\xB7&nbsp; ${wt===null?"THROUGHPUT ON":`THROUGHPUT OFF \u2014 ${wt.split(" \u2014 ")[0]}`}</div><div style="font:500 10px/1.4 ui-monospace,monospace;color:${ke}">SYNTHETIC DEALS</div>`;ne.appendChild(Xt);var jt=document.createElement("div");jt.style.cssText="position:absolute;right:18px;bottom:16px;display:flex;flex-direction:column;gap:6px;align-items:flex-end;font:500 10.5px/1 ui-monospace,monospace";jt.innerHTML=[[Vr,"UPDATED \xB7 rides the rail"],[Hr,`SETTLED \xB7 ${Te.length} of ${se.OBSERVED} on the floor`],[ke,`VALUE ABSENT \xB7 ${se.VALUE_ABSENT} (ring: no mass to give)`],[kr,`WITHHELD \xB7 ${se.WITHHELD} (off the movement axis)`]].map(([t,n])=>`<div style="display:flex;align-items:center;gap:7px;color:rgba(196,212,240,0.85)"><span>${n}</span><span style="width:11px;height:11px;background:${t};display:inline-block"></span></div>`).join("");ne.appendChild(jt);var fe=C?C.readState():null,Nt=0,mn=0,Ct=1/0,Ot=-1/0;if(fe&&C)for(let t=0;t<C.slots;t++){let n=fe[t*4],e=fe[t*4+1],r=fe[t*4+2];fe[t*4+3]<0||(Nt++,r<Ct&&(Ct=r),r>Ot&&(Ot=r),(Math.abs(n)>F||e<-.15||e>B+.25||r<ye||r>ue)&&mn++)}var fn=(()=>{let t=g.getExtension("WEBGL_debug_renderer_info");return t?String(g.getParameter(t.UNMASKED_RENDERER_WEBGL)):"unknown"})(),Ft=/swiftshader|llvmpipe|software/i.test(fn),Ue=ze.map(t=>({name:t.p.d.name,stage:t.p.d.stage,known:t.p.d.known,valueUsd:t.p.d.valueUsd,days:t.p.d.daysSinceUpdate,edgeM:t.p.edge===null?null:Number(t.p.edge.toFixed(3)),settle:t.p.settle===null?null:Number(t.p.settle.toFixed(3)),settleClamped:t.p.settleClamped,baseY:Number(t.p.baseY.toFixed(3)),distance:Number(t.p.distance.toFixed(2)),screenHeightPx:Math.round(nn(t.p)),fallenPx:(()=>{let n=zt(t.p);return n===null?null:Math.round(n)})(),fog:Number(kt(t.p.distance).toFixed(3)),tagWidthPx:Math.round(t.widthPx),tagShown:t.shown,massRefusal:t.p.massRefusal,settleRefusal:t.p.settleRefusal,hiddenBecause:t.shown?null:t.withheld?"WITHHELD":t.refusal?t.refusal:t.backFacing?"BACK_FACING":t.edgeOn?"EDGE_ON":t.tooFar?"BEYOND_LEGIBLE_RANGE":"OCCLUDED"})),pn={settleAxis:It,particlesRequested:Bt,fog:Lr,fogDensity:Number(Ee.toFixed(4)),hdr:L.hdr,eye:W.map(t=>Number(t.toFixed(2))),deals:_.length,counts:se,aggregateExcludes:{valueAbsent:se.VALUE_ABSENT,withheld:se.WITHHELD,code:"AGGREGATE_EXCLUDES_UNREADABLE_VALUE"},totalObservedUsd:Ce,stallDays:ae,stalledFrom:dn,stalledCount:Te.length,stalledUsd:Sr,stalledShare:Number((Sr/Math.max(1,Ce)).toFixed(3)),deepStalledUsd:Ge,deepStalledShare:Number((Ge/Math.max(1,Ce)).toFixed(3)),settleClamped:_.filter(t=>t.settleClamped).length,minStalledDisplacementPx:to,maxDisplacementPx:ro,minSeparationPx:Jn,settleInversions:ln,railLiftM:pe,edgeMaxM:Nr,edgeMinM:Number(Math.min(...le.map(t=>t.edge??0)).toFixed(3)),referenceSizeM:re,massAmbiguousPairs:un,massAmbiguousWithinStage:cn,outOfSegment:kn,windowDays:Br,usdPerParticle:Vt,particleSpeed:Oe,rateMonotoneDown:U.every((t,n)=>n===0||t.ratePerSec<=U[n-1].ratePerSec+1e-9),rateRatioFirstLast:Number((U[0].ratePerSec/Math.max(1e-9,U[U.length-1].ratePerSec)).toFixed(2)),particleField:{refusal:wt,capacity:Ht,slots:C?.slots??0,aliveExpected:jn,aliveActual:Nt,outOfChannel:mn,zRange:Nt>0?[Number(Ct.toFixed(2)),Number(Ot.toFixed(2))]:null,channelZ:[ye,ue],slotRecycleSeconds:Number(br.toFixed(2)),maxLifeSeconds:Number(xr.toFixed(2)),recycleSafe:br>xr,primeSteps:Gr},tagsShown:ze.filter(t=>t.shown).length,hiddenBy:Ue.filter(t=>!t.tagShown).reduce((t,n)=>{let e=n.hiddenBecause??"UNKNOWN";return t[e]=(t[e]??0)+1,t},{}),nameOverflow:_.filter(t=>t.d.known!=="WITHHELD"&&t.d.name.length*6.6>Lt*Dt-10).map(t=>t.d.name),gateLabelsOffFrame:Zn.filter(t=>!t.onFrame).map(t=>t.stage),axisLabelsOffFrame:qn.filter(t=>!t.onFrame).length,fogNearest:Math.min(...Ue.map(t=>t.fog)),fogFurthest:Math.max(...Ue.map(t=>t.fog)),glError:g.getError(),triangles:Wn,shadowMap:Mt.size,resolution:`${X}x${j}`,dprScale:xe,frames:Dr,msPerFrame:Number(St.toFixed(3)),fps:Math.round(1e3/St),renderer:fn,rendererClass:Ft?"software":"hardware",headroom:Ft?null:Number((16.6-St).toFixed(3)),headroomRefusal:Ft?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null,hardwareMsPerFrame:null,gates:U.map(t=>({stage:t.label,z:t.z,clearedUsd:t.clearedUsd,usdPerDay:Math.round(t.usdPerDay),ratePerSec:Number(t.ratePerSec.toFixed(2)),perMetre:Number(t.linearDensityPerMetre.toFixed(2)),lifeSeconds:Number(t.life.toFixed(2))})),perStageSeparation:sn,perDeal:Ue};globalThis.E3=pn;var{perDeal:Mr,gates:_r,perStageSeparation:no,...oo}=pn;wr.textContent=JSON.stringify(oo,null,2)+`

gates (${_r.length}):
`+_r.map(t=>`  ${t.stage.padEnd(10)} $${String(t.usdPerDay).padStart(7)}/d ${String(t.ratePerSec).padStart(7)} p/s ${String(t.perMetre).padStart(7)} p/m life ${t.lifeSeconds}s`).join(`
`)+`

settle separation on screen:
`+no.map(t=>`  ${t.stage.padEnd(10)} ${t.separationPx===null?"n/a (needs 2 readable)":`${t.separationPx} px`}`).join(`
`)+`

perDeal (${Mr.length}, full detail on globalThis.E3):
`+Mr.map(t=>`  ${t.name.padEnd(16)} ${t.stage.padEnd(10)} ${(t.valueUsd===null?"ABSENT":he(t.valueUsd)).padStart(7)} ${(t.days===null?"\u2014":`${t.days}d`).padStart(4)} base ${t.baseY.toFixed(2)} fallen ${String(t.fallenPx??"\u2014").padStart(3)}px ${String(t.distance).padStart(5)}m ${String(t.screenHeightPx).padStart(3)}px ${t.tagShown?"TAG":`no tag: ${t.hiddenBecause}`}`).join(`
`);Pt();document.title="READY";

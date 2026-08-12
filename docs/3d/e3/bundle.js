var cr={NO_WEBGL2:"This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. Nothing about the underlying measurements has changed \u2014 the data is unaffected.",CONTEXT_LOST:"The graphics context was lost, usually because the GPU process restarted. The view will redraw on the next interaction; the data is unaffected.",SHADER_COMPILE_FAILED:"A shader failed to compile on this driver. This is a defect in the renderer, not in the data.",PROGRAM_LINK_FAILED:"A shader program failed to link on this driver. This is a defect in the renderer, not in the data.",FRAMEBUFFER_INCOMPLETE:"This driver would not allocate the render targets this view needs. The data is unaffected; only the three-dimensional presentation of it is unavailable.",MISSING_EXTENSION:"This driver is missing a graphics capability this view needs, so it is not being drawn rather than drawn wrongly. The data is unaffected."};function D(e,n){return n===void 0?{kind:"refused",code:e,reason:cr[e]}:{kind:"refused",code:e,reason:cr[e],detail:n}}function Ze(e){return e.kind==="stage"}function Je(e,n={}){let t=e.getContext("webgl2",{antialias:n.antialias??!1,alpha:n.alpha??!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0});if(!t)return D("NO_WEBGL2");let r=t.getExtension("EXT_color_buffer_float"),o=e.width,a=e.height,s=r?t.RGBA16F:t.RGBA8,l=r?t.HALF_FLOAT:t.UNSIGNED_BYTE,i=(g,S)=>{let x=t.createTexture();t.bindTexture(t.TEXTURE_2D,x),t.texImage2D(t.TEXTURE_2D,0,s,g,S,0,t.RGBA,l,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);let E=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,E),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,x,0);let A=t.checkFramebufferStatus(t.FRAMEBUFFER);return A!==t.FRAMEBUFFER_COMPLETE?D("FRAMEBUFFER_INCOMPLETE",`status 0x${A.toString(16)} at ${g}\xD7${S}`):{texture:x,framebuffer:E,width:g,height:S}},d=n.bloomShift??2,u={w:o,h:a},c=i(o,a);if("kind"in c)return c;let f=i(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in f)return f;let p=i(Math.max(1,o>>d),Math.max(1,a>>d));if("kind"in p)return p;let m=t.createVertexArray();t.bindVertexArray(m);let h=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,h),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null);let b=[];return{kind:"stage",gl:t,cssWidth:e.clientWidth||o,cssHeight:e.clientHeight||a,hdr:!!r,get width(){return u.w},get height(){return u.h},get scene(){return c},get bloomA(){return f},get bloomB(){return p},setRegion(g,S){let x=Math.max(1,Math.round(g)),E=Math.max(1,Math.round(S));if(!(x===u.w&&E===u.h)){u={w:x,h:E};for(let A of[c,f,p])"kind"in A||(t.deleteFramebuffer(A.framebuffer),t.deleteTexture(A.texture));c=i(x,E),f=i(Math.max(1,x>>d),Math.max(1,E>>d)),p=i(Math.max(1,x>>d),Math.max(1,E>>d))}},compile(g,S){let x=(H,M)=>{let v=t.createShader(H);return t.shaderSource(v,M),t.compileShader(v),t.getShaderParameter(v,t.COMPILE_STATUS)?v:D("SHADER_COMPILE_FAILED",t.getShaderInfoLog(v)??"(no log)")},E=x(t.VERTEX_SHADER,g);if(typeof E=="object"&&"kind"in E)return E;let A=x(t.FRAGMENT_SHADER,S);if(typeof A=="object"&&"kind"in A)return A;let R=t.createProgram();return t.attachShader(R,E),t.attachShader(R,A),t.linkProgram(R),t.getProgramParameter(R,t.LINK_STATUS)?(b.push(R),R):D("PROGRAM_LINK_FAILED",t.getProgramInfoLog(R)??"(no log)")},bindTarget(g){t.bindFramebuffer(t.FRAMEBUFFER,g?g.framebuffer:null),t.viewport(0,0,g?g.width:u.w,g?g.height:u.h)},blit(g,S){t.useProgram(g),t.bindVertexArray(m),S?.(g),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null)},dispose(){for(let g of b)t.deleteProgram(g);for(let g of[c,f,p])"kind"in g||(t.deleteFramebuffer(g.framebuffer),t.deleteTexture(g.texture));t.deleteBuffer(h),t.deleteVertexArray(m)}}}var be=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function Fe(e,n){let t=new Float32Array(16);for(let r=0;r<4;r++)for(let o=0;o<4;o++){let a=0;for(let s=0;s<4;s++)a+=e[s*4+o]*n[r*4+s];t[r*4+o]=a}return t}var Me=(e,n)=>[e[0]-n[0],e[1]-n[1],e[2]-n[2]],ve=(e,n)=>e[0]*n[0]+e[1]*n[1]+e[2]*n[2],et=(e,n)=>[e[1]*n[2]-e[2]*n[1],e[2]*n[0]-e[0]*n[2],e[0]*n[1]-e[1]*n[0]];function he(e){let n=Math.hypot(e[0],e[1],e[2]);return n===0?e:[e[0]/n,e[1]/n,e[2]/n]}function tt(e,n,t,r){let o=1/Math.tan(e/2);return new Float32Array([o/n,0,0,0,0,o,0,0,0,0,(r+t)/(t-r),-1,0,0,2*r*t/(t-r),0])}function rt(e,n,t,r,o,a){let s=n-e,l=r-t,i=a-o;return new Float32Array([2/s,0,0,0,0,2/l,0,0,0,0,-2/i,0,-(n+e)/s,-(r+t)/l,-(a+o)/i,1])}function Le(e,n,t){let r=he(Me(e,n)),o=et(t,r);if(Math.hypot(o[0],o[1],o[2])<1e-8)return be();let a=he(o),s=et(r,a);return new Float32Array([a[0],s[0],r[0],0,a[1],s[1],r[1],0,a[2],s[2],r[2],0,-ve(a,e),-ve(s,e),-ve(r,e),1])}function dr(e,n){let t=[0,1,2,3].map(o=>e[0+o]*n[0]+e[4+o]*n[1]+e[8+o]*n[2]+e[12+o]),r=t[3];return{x:t[0]/r,y:t[1]/r,z:t[2]/r,w:r}}function C(e,n,t,r){let o=dr(e,n);return{sx:(o.x*.5+.5)*t,sy:(1-(o.y*.5+.5))*r,behind:o.w<=0}}var mr=`#version 300 es
precision highp float;
layout(location=0) in vec3 p;
uniform mat4 uMVP;
out float vY;
void main(){ vY = p.y; gl_Position = uMVP * vec4(p, 1.0); }`,fr=`#version 300 es
precision highp float;
in float vY;
uniform vec3 uColour;
uniform float uGain, uFade, uFadeFrom, uFadeTo;
out vec4 frag;
void main(){
  float t = clamp((vY - uFadeFrom) / max(uFadeTo - uFadeFrom, 1e-4), 0.0, 1.0);
  frag = vec4(uColour * uGain * (1.0 - uFade * t), 1.0);
}`;function nt(e){let{gl:n}=e,t=e.compile(mr,fr);if("kind"in t)return t;let r=n.createVertexArray();n.bindVertexArray(r);let o=n.createBuffer();n.bindBuffer(n.ARRAY_BUFFER,o),n.enableVertexAttribArray(0),n.vertexAttribPointer(0,3,n.FLOAT,!1,0,0),n.bindVertexArray(null);let a=d=>n.getUniformLocation(t,d),s={mvp:a("uMVP"),colour:a("uColour"),gain:a("uGain"),fade:a("uFade"),fadeFrom:a("uFadeFrom"),fadeTo:a("uFadeTo")},l=(d,u,c)=>{n.useProgram(t),n.bindVertexArray(r),n.bindBuffer(n.ARRAY_BUFFER,o),n.bufferData(n.ARRAY_BUFFER,u,n.STREAM_DRAW),n.uniformMatrix4fv(s.mvp,!1,d),n.uniform3fv(s.colour,c.colour),n.uniform1f(s.gain,c.gain),n.uniform1f(s.fade,c.fade??0),n.uniform1f(s.fadeFrom,c.fadeFrom??0),n.uniform1f(s.fadeTo,c.fadeTo??1),n.drawArrays(n.TRIANGLE_STRIP,0,u.length/3),n.bindVertexArray(null)},i=(d,u,c,f,p,m,h,b)=>{let y=f-u,g=p-c,S=Math.hypot(y,g)||1,x=-g/S*h,E=y/S*h;l(d,new Float32Array([u-x,c-E,m,u+x,c+E,m,f-x,p-E,m,f+x,p+E,m]),b)};return{rule(d,u,c,f,p,m,h){i(d,u,c,f,p,0,m,h)},ruleAtDepth(d,u,c,f,p,m,h,b){i(d,u,c,f,p,m,h,b)},curve(d,u,c,f){let p=u.length/2,m=new Float32Array(p*6);for(let h=0;h<p;h++){let b=u[h*2],y=u[h*2+1];m[h*6+0]=b,m[h*6+1]=y-c,m[h*6+2]=0,m[h*6+3]=b,m[h*6+4]=y+c,m[h*6+5]=0}l(d,m,f)},dispose(){n.deleteBuffer(o),n.deleteVertexArray(r)}}}function pr(e){return e<=.04045?e/12.92:Math.pow((e+.055)/1.055,2.4)}function ot(e){return e<=.0031308?e*12.92:1.055*Math.pow(e,1/2.4)-.055}var In=/^#?([0-9a-fA-F]{6})$/;function U(e){let n=In.exec(e.trim());if(!n)throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(e)}`);let t=n[1];return[0,2,4].map(r=>pr(parseInt(t.slice(r,r+2),16)/255))}function at(e){return`#${e.map(t=>{let r=ot(Math.min(1,Math.max(0,t)));return Math.round(r*255).toString(16).padStart(2,"0")}).join("")}`}var se={brand:"#2C6BFF",brandBright:"#7FB2FF",brandDeep:"#12326E",reference:"#FF8A3D",refusal:"#6B7A99",rule:"#26355A",plate:"#0E1628"},st=Object.freeze(Object.fromEntries(Object.keys(se).map(e=>[e,U(se[e])])));function it(e,n,t){let r=Math.min(1,Math.max(0,t));return[e[0]+(n[0]-e[0])*r,e[1]+(n[1]-e[1])*r,e[2]+(n[2]-e[2])*r]}var hr=.4;var lt=`vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${hr.toFixed(2)}); }`,ut=`vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;function ct(){let e=[];for(let n of Object.keys(se)){let t=se[n].toLowerCase(),r=at(st[n]).toLowerCase();r!==t&&e.push({key:n,expected:t,actual:r})}return e}function On(e){let n=[1/0,1/0,1/0],t=[-1/0,-1/0,-1/0];for(let r=0;r<e.length;r+=3)for(let o=0;o<3;o++){let a=e[r+o];a<n[o]&&(n[o]=a),a>t[o]&&(t[o]=a)}return e.length===0?{min:[0,0,0],max:[0,0,0]}:{min:n,max:t}}function br(e,n,t,r){let o=new Float32Array(e.length);for(let s=0;s<r.length;s+=3){let l=r[s],i=r[s+1],d=r[s+2],u=l*3,c=i*3,f=d*3,p=l*2,m=i*2,h=d*2,b=e[c]-e[u],y=e[c+1]-e[u+1],g=e[c+2]-e[u+2],S=e[f]-e[u],x=e[f+1]-e[u+1],E=e[f+2]-e[u+2],A=t[m]-t[p],R=t[m+1]-t[p+1],H=t[h]-t[p],M=t[h+1]-t[p+1],v=A*M-H*R;if(Math.abs(v)<1e-12)continue;let w=1/v,pe=(b*M-S*R)*w,Se=(y*M-x*R)*w,Qe=(g*M-E*R)*w;for(let K of[u,c,f])o[K]=o[K]+pe,o[K+1]=o[K+1]+Se,o[K+2]=o[K+2]+Qe}let a=new Float32Array(e.length);for(let s=0;s<a.length;s+=3){let l=n[s],i=n[s+1],d=n[s+2],u=o[s],c=o[s+1],f=o[s+2],p=u*l+c*i+f*d;u-=l*p,c-=i*p,f-=d*p;let m=Math.hypot(u,c,f);m<1e-8&&(Math.abs(l)<.9?(u=0,c=-d,f=i):(u=-d,c=0,f=l),m=Math.hypot(u,c,f)||1),a[s]=u/m,a[s+1]=c/m,a[s+2]=f/m}return a}function Er(e,n){let t=new Float32Array(e.length);for(let r=0;r<n.length;r+=3){let o=n[r]*3,a=n[r+1]*3,s=n[r+2]*3,l=e[a]-e[o],i=e[a+1]-e[o+1],d=e[a+2]-e[o+2],u=e[s]-e[o],c=e[s+1]-e[o+1],f=e[s+2]-e[o+2],p=i*f-d*c,m=d*u-l*f,h=l*c-i*u;for(let b of[o,a,s])t[b]=t[b]+p,t[b+1]=t[b+1]+m,t[b+2]=t[b+2]+h}for(let r=0;r<t.length;r+=3){let o=Math.hypot(t[r],t[r+1],t[r+2]);o>0&&(t[r]=t[r]/o,t[r+1]=t[r+1]/o,t[r+2]=t[r+2]/o)}return t}function _e(e,n,t,r,o){let{min:a,max:s}=On(e),l=r??Er(e,t);return{positions:e,normals:l,uvs:n,indices:t,min:a,max:s,tangents:o??br(e,l,n,t)}}function ie(e=1,n=1,t=1){let r=e/2,o=n/2,a=t/2,s=[[[-r,-o,a],[r,-o,a],[r,o,a],[-r,o,a]],[[r,-o,-a],[-r,-o,-a],[-r,o,-a],[r,o,-a]],[[r,-o,a],[r,-o,-a],[r,o,-a],[r,o,a]],[[-r,-o,-a],[-r,-o,a],[-r,o,a],[-r,o,-a]],[[-r,o,a],[r,o,a],[r,o,-a],[-r,o,-a]],[[-r,-o,-a],[r,-o,-a],[r,-o,a],[-r,-o,a]]],l=new Float32Array(72),i=new Float32Array(48),d=new Uint16Array(36),u=0,c=0,f=0,p=0;for(let m of s){for(let[h,b,y]of m)l[u++]=h,l[u++]=b,l[u++]=y;i[c++]=0,i[c++]=0,i[c++]=1,i[c++]=0,i[c++]=1,i[c++]=1,i[c++]=0,i[c++]=1,d[f++]=p,d[f++]=p+1,d[f++]=p+2,d[f++]=p,d[f++]=p+2,d[f++]=p+3,p+=4}return _e(l,i,d)}function dt(e=10,n=24){let t=Math.max(1,Math.floor(n)),r=(t+1)*(t+1),o=new Float32Array(r*3),a=new Float32Array(r*3),s=new Float32Array(r*2),l=new Uint16Array(t*t*6),i=0,d=0,u=0;for(let c=0;c<=t;c++)for(let f=0;f<=t;f++){let p=(f/t-.5)*e,m=(c/t-.5)*e;o[i]=p,o[i+1]=0,o[i+2]=m,a[i]=0,a[i+1]=1,a[i+2]=0,i+=3,s[d++]=f/t,s[d++]=c/t}for(let c=0;c<t;c++)for(let f=0;f<t;f++){let p=c*(t+1)+f,m=p+1,h=p+(t+1),b=h+1;l[u++]=p,l[u++]=h,l[u++]=m,l[u++]=m,l[u++]=h,l[u++]=b}return _e(o,s,l,a)}function mt(e=.5,n=24,t=32){let r=Math.max(2,n),o=Math.max(3,t),a=(r+1)*(o+1),s=new Float32Array(a*3),l=new Float32Array(a*3),i=new Float32Array(a*2),d=new Uint16Array(r*o*6),u=0,c=0,f=0;for(let p=0;p<=r;p++){let m=p/r*Math.PI;for(let h=0;h<=o;h++){let b=h/o*Math.PI*2,y=Math.sin(m)*Math.cos(b),g=Math.cos(m),S=Math.sin(m)*Math.sin(b);s[u]=y*e,s[u+1]=g*e,s[u+2]=S*e,l[u]=y,l[u+1]=g,l[u+2]=S,u+=3,i[c++]=h/o,i[c++]=p/r}}for(let p=0;p<r;p++)for(let m=0;m<o;m++){let h=p*(o+1)+m,b=h+1,y=h+(o+1),g=y+1;d[f++]=h,d[f++]=b,d[f++]=y,d[f++]=b,d[f++]=g,d[f++]=y}return _e(s,i,d,l)}function ft(e=.5,n=.08,t=64,r=24){let o=Math.max(3,t),a=Math.max(3,r),s=[],l=[],i=[],d=[],u=[];for(let c=0;c<=o;c++){let f=c/o*Math.PI*2,p=Math.cos(f),m=Math.sin(f);for(let h=0;h<=a;h++){let b=h/a*Math.PI*2,y=Math.cos(b),g=Math.sin(b);s.push((e+n*y)*p,n*g,(e+n*y)*m),l.push(p*y,g,m*y),i.push(c/o,h/a),u.push(-m,0,p)}}for(let c=0;c<o;c++)for(let f=0;f<a;f++){let p=c*(a+1)+f,m=p+1,h=p+(a+1),b=h+1;d.push(p,m,h,m,b,h)}return _e(new Float32Array(s),new Float32Array(i),new Uint16Array(d),new Float32Array(l),new Float32Array(u))}function j(e){return e.indices.length/3}function Bn(e){if(!Number.isFinite(e)||e===0)return"0";let n=e.toFixed(12).replace(/0+$/,"").replace(/\.$/,"");return n==="-0"?"0":n}function xr(e,n,t,r){let[o,a]=e,[s,l]=n,[i,d]=t,[u,c]=r,f=o-s+i-u,p=a-l+d-c;if(Math.abs(f)<1e-9&&Math.abs(p)<1e-9){let E=[s-o,u-o,o,l-a,c-a,a,0,0,1],A=E[0]*E[4]-E[1]*E[3];return Math.abs(A)<1e-9?null:E}let m=s-i,h=u-i,b=l-d,y=c-d,g=m*y-h*b;if(Math.abs(g)<1e-9)return null;let S=(f*y-h*p)/g,x=(m*p-f*b)/g;return[s-o+S*s,u-o+x*u,o,l-a+S*l,c-a+x*c,a,S,x,1]}function pt(e,n,t,r,o,a){if(!(o>0)||!(a>0))return{refusal:"EMPTY_ELEMENT_BOX"};let l=[n.topLeft,n.topRight,n.bottomRight,n.bottomLeft].map(w=>C(e,w,t,r));if(l.some(w=>w.behind))return{refusal:"CORNER_BEHIND_CAMERA"};let i=l.map(w=>({x:w.sx,y:w.sy})),[d,u,c,f]=i,p=xr([d.x,d.y],[u.x,u.y],[c.x,c.y],[f.x,f.y]);if(!p)return{refusal:"DEGENERATE_ON_SCREEN"};let m=.5*(d.x*u.y-u.x*d.y+(u.x*c.y-c.x*u.y)+(c.x*f.y-f.x*c.y)+(f.x*d.y-d.x*f.y)),h=1/o,b=1/a,[y,g,S,x,E,A,R,H,M]=p;return{transform:`matrix3d(${[y*h,x*h,0,R*h,g*b,E*b,0,H*b,0,0,1,0,S,A,0,M].map(Bn).join(", ")})`,matrix:p,screen:i,signedArea:m}}function W(e){return"refusal"in e}function ht(e,n,t,r,o,a,s=0){let l=Math.cos(a),i=Math.sin(a),d=(c,f)=>[e+l*c+i*s,t+f,n-i*c+l*s],u=r/2;return{topLeft:d(-u,o),topRight:d(u,o),bottomRight:d(u,0),bottomLeft:d(-u,0)}}function yr(e){let n=Number.isFinite(e)?Math.max(1,Math.floor(e)):1,t=Math.max(1,2**Math.ceil(Math.log2(Math.ceil(Math.sqrt(n))))),r=Math.max(1,2**Math.ceil(Math.log2(Math.ceil(n/t))));return{width:t,height:r,slots:t*r}}function gr(e,n,t){let r=[],o=[];for(let a=0;a<e.length;a++){let s=Math.max(0,e[a].rate),l=Math.max(0,Math.min(.1,n)),i=s*l+(t[a]??0),d=Math.floor(i);r.push(d),o.push(i-d)}return{counts:r,carry:o}}var Tr=`
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
`,kn=`#version 300 es
precision highp float;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Gn=`#version 300 es
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
${Tr}
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
}`,Vn=`#version 300 es
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
}`,Hn=`#version 300 es
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
}`;function bt(e,n){let t=e.gl,{width:r,height:o,slots:a}=yr(n);if(!t.getExtension("EXT_color_buffer_float"))return D("MISSING_EXTENSION","particle simulation needs EXT_color_buffer_float to write positions to a texture \u2014 without it the state textures never update and the field renders frozen");let s=e.compile(kn,Gn);if("kind"in s)return s;let l=e.compile(Vn,Hn);if("kind"in l)return l;let i=E=>{let A=t.createTexture();return t.bindTexture(t.TEXTURE_2D,A),t.texImage2D(t.TEXTURE_2D,0,t.RGBA32F,r,o,0,t.RGBA,t.FLOAT,E),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),A},d=new Float32Array(a*4);for(let E=0;E<a;E++)d[E*4+3]=-1;let u=i(d),c=i(d),f=i(new Float32Array(a*4)),p=i(new Float32Array(a*4)),m=t.createFramebuffer(),h=t.createFramebuffer(),b=t.createVertexArray(),y=0,g=[],S=(E,A)=>(t.bindFramebuffer(t.FRAMEBUFFER,m),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,E,0),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT1,t.TEXTURE_2D,A,0),t.drawBuffers([t.COLOR_ATTACHMENT0,t.COLOR_ATTACHMENT1]),t.checkFramebufferStatus(t.FRAMEBUFFER)===t.FRAMEBUFFER_COMPLETE),x=(E,A)=>t.getUniformLocation(E,A);return{slots:a,width:r,height:o,step(E){let A=E.sources.slice(0,8),R=gr(A,E.dtSeconds,g);g=R.carry;let H=[],M=[],v=[],w=0;for(let X=0;X<A.length&&w<8;X++){let q=A[X],Ke=Math.min(R.counts[X]??0,a);for(;Ke>0&&w<8;){let Re=y,qe=Math.min(Ke,a-Re);H.push(Re,Re+qe-1,X,q.life),M.push(q.at[0],q.at[1],q.at[2],q.spread??0),v.push(q.velocity[0],q.velocity[1],q.velocity[2],0),y=(Re+qe)%a,Ke-=qe,w++}}if(!S(c,p))return;t.viewport(0,0,r,o),t.disable(t.DEPTH_TEST),t.disable(t.BLEND),t.useProgram(s),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,u),t.uniform1i(x(s,"uState"),0),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,f),t.uniform1i(x(s,"uVel"),1),t.uniform2f(x(s,"uSize"),r,o),t.uniform1f(x(s,"uDt"),Math.max(0,Math.min(.1,E.dtSeconds))),t.uniform1f(x(s,"uTime"),performance.now()/1e3%3600),t.uniform1f(x(s,"uNoiseScale"),E.noiseScale??.35),t.uniform1f(x(s,"uNoiseStrength"),E.noiseStrength??.6),t.uniform1f(x(s,"uDrag"),E.drag??.4);let pe=E.gravity??[0,0,0];t.uniform3f(x(s,"uGravity"),pe[0],pe[1],pe[2]),t.uniform1i(x(s,"uEmitCount"),w),w>0&&(t.uniform4fv(x(s,"uEmitRange"),new Float32Array(H)),t.uniform4fv(x(s,"uEmitPos"),new Float32Array(M)),t.uniform4fv(x(s,"uEmitVel"),new Float32Array(v)));let Se=new Float32Array(8);for(let X=0;X<8;X++)Se[X]=A[X]?.life??1;t.uniform1fv(x(s,"uLifes"),Se),t.bindVertexArray(b),t.drawArrays(t.TRIANGLES,0,3),t.bindVertexArray(null);let Qe=u;u=c,c=Qe;let K=f;f=p,p=K,t.bindFramebuffer(t.FRAMEBUFFER,null)},draw(E){let A=E.sources.slice(0,8);t.useProgram(l),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,u),t.uniform1i(x(l,"uState"),0),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,f),t.uniform1i(x(l,"uVel"),1),t.uniform2f(x(l,"uSize"),r,o),t.uniformMatrix4fv(x(l,"uViewProj"),!1,E.viewProj),t.uniform1f(x(l,"uPointScale"),E.pointScale??28);let R=new Float32Array(24),H=new Float32Array(8);for(let M=0;M<8;M++){let v=A[M];R[M*3]=v?v.colour[0]:0,R[M*3+1]=v?v.colour[1]:0,R[M*3+2]=v?v.colour[2]:0,H[M]=v?v.life:1}t.uniform3fv(x(l,"uColours"),R),t.uniform1fv(x(l,"uLifes"),H),t.enable(t.BLEND),t.blendFunc(t.ONE,t.ONE),t.enable(t.DEPTH_TEST),t.depthMask(!1),t.bindVertexArray(b),t.drawArrays(t.POINTS,0,a),t.bindVertexArray(null),t.depthMask(!0),t.disable(t.BLEND),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,null),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,null)},readState(){t.bindFramebuffer(t.FRAMEBUFFER,h),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,u,0);let E=new Float32Array(a*4);return t.checkFramebufferStatus(t.FRAMEBUFFER)===t.FRAMEBUFFER_COMPLETE&&t.readPixels(0,0,r,o,t.RGBA,t.FLOAT,E),t.bindFramebuffer(t.FRAMEBUFFER,null),E},dispose(){for(let E of[u,c,f,p])t.deleteTexture(E);t.deleteFramebuffer(m),t.deleteFramebuffer(h),t.deleteVertexArray(b),t.deleteProgram(s),t.deleteProgram(l)}}}var Et=["minimum","reduced","full"],zn={full:{dprScale:2,ao:!0,aoScale:.5,dof:!0,shadowMapSize:1536,shadowTaps:9,particleCapacity:4096,volumeMaxSteps:128,volumeLightSteps:6},reduced:{dprScale:2,ao:!0,aoScale:.5,dof:!1,shadowMapSize:1024,shadowTaps:9,particleCapacity:2048,volumeMaxSteps:96,volumeLightSteps:4},minimum:{dprScale:1,ao:!1,aoScale:.5,dof:!1,shadowMapSize:512,shadowTaps:1,particleCapacity:512,volumeMaxSteps:48,volumeLightSteps:0}};function we(e,n){let t=Number.isFinite(n)&&n>0?n:1024,o=t*(e==="full"?1:e==="reduced"?.5:.25),a=2**Math.round(Math.log2(o));return Math.max(256,Math.min(t,a))}function xt(e){return{tier:e,...zn[e]}}var yt=89,gt=Math.PI/180;function De(e){let n=Math.max(-yt,Math.min(yt,e.elevationDeg))*gt,t=e.azimuthDeg*gt,r=Math.max(1e-4,e.distance),o=Math.sin(n)*r,a=Math.cos(n)*r;return[e.target[0]+Math.sin(t)*a,e.target[1]+o,e.target[2]+Math.cos(t)*a]}function Ue(e,n){let t=De(e),r=e.near??Math.max(.01,e.distance/100),o=e.far??Math.max(r+1,e.distance*8),a=tt((e.fovDeg??38)*gt,Math.max(.001,n),r,o),s=Le(t,e.target,[0,1,0]);return Fe(a,s)}function Tt(e,n,t){let r=he(e.direction),o=e.extent??Math.max(.1,t*1.35),a=Math.max(1,t*2),s=[n[0]-r[0]*a,n[1]-r[1]*a,n[2]-r[2]*a],l=Math.abs(r[1])>.99?[0,0,1]:[0,1,0],i=Le(s,n,l),d=rt(-o,o,-o,o,.01,a+t*2+o);return Fe(d,i)}function At(e,n){let t=Me([n[0],n[1],n[2]],[e[0],e[1],e[2]]);return Math.hypot(t[0],t[1],t[2])/2}function St(e,n){return[(e[0]+n[0])/2,(e[1]+n[1])/2,(e[2]+n[2])/2]}function Rt(e,n,t){let{gl:r}=e,o=Math.max(1,Math.floor(n)),a=Math.max(1,Math.floor(t)),s=r.createFramebuffer(),l=r.createTexture(),i=r.createTexture();if(!s||!l||!i)return D("FRAMEBUFFER_INCOMPLETE","The GPU refused a render target for the 3-D scene.");let d=e.hdr?r.RGBA16F:r.RGBA8,u=e.hdr?r.HALF_FLOAT:r.UNSIGNED_BYTE,c=()=>{r.bindTexture(r.TEXTURE_2D,l),r.texImage2D(r.TEXTURE_2D,0,d,o,a,0,r.RGBA,u,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),r.bindTexture(r.TEXTURE_2D,i),r.texImage2D(r.TEXTURE_2D,0,r.DEPTH_COMPONENT24,o,a,0,r.DEPTH_COMPONENT,r.UNSIGNED_INT,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),r.bindFramebuffer(r.FRAMEBUFFER,s),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,l,0),r.framebufferTexture2D(r.FRAMEBUFFER,r.DEPTH_ATTACHMENT,r.TEXTURE_2D,i,0),r.bindFramebuffer(r.FRAMEBUFFER,null)};c(),r.bindFramebuffer(r.FRAMEBUFFER,s);let f=r.checkFramebufferStatus(r.FRAMEBUFFER);return r.bindFramebuffer(r.FRAMEBUFFER,null),f!==r.FRAMEBUFFER_COMPLETE?D("FRAMEBUFFER_INCOMPLETE",`The 3-D render target is incomplete (0x${f.toString(16)}). Depth texture support may be missing.`):{framebuffer:s,texture:l,depthTexture:i,get width(){return o},get height(){return a},bind(){r.bindFramebuffer(r.FRAMEBUFFER,s),r.viewport(0,0,o,a)},resize(p,m){let h=Math.max(1,Math.floor(p)),b=Math.max(1,Math.floor(m));h===o&&b===a||(o=h,a=b,c())},dispose(){r.deleteFramebuffer(s),r.deleteTexture(l),r.deleteTexture(i)}}}function vt(e,n=1024){let{gl:t}=e,r=Math.max(256,Math.min(2048,Math.floor(n))),o=t.createFramebuffer(),a=t.createTexture();if(!o||!a)return D("FRAMEBUFFER_INCOMPLETE","The GPU refused a shadow map.");t.bindTexture(t.TEXTURE_2D,a),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT24,r,r,0,t.DEPTH_COMPONENT,t.UNSIGNED_INT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,o),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,a,0);let s=t.checkFramebufferStatus(t.FRAMEBUFFER);return t.bindFramebuffer(t.FRAMEBUFFER,null),s!==t.FRAMEBUFFER_COMPLETE?D("FRAMEBUFFER_INCOMPLETE",`The shadow map framebuffer is incomplete (0x${s.toString(16)}).`):{framebuffer:o,depthTexture:a,size:r,bind(){t.bindFramebuffer(t.FRAMEBUFFER,o),t.viewport(0,0,r,r)},dispose(){t.deleteFramebuffer(o),t.deleteTexture(a)}}}var Mt=`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`,Ft={zenith:[.012,.02,.052],horizon:[.075,.098,.155],ground:[.01,.011,.016]};function Ar(e,n,t={}){let r=t.zenith??Ft.zenith,o=t.horizon??Ft.horizon,a=t.ground??Ft.ground;e.uniform3f(e.getUniformLocation(n,"uSkyZenith"),r[0],r[1],r[2]),e.uniform3f(e.getUniformLocation(n,"uSkyHorizon"),o[0],o[1],o[2]),e.uniform3f(e.getUniformLocation(n,"uSkyGround"),a[0],a[1],a[2])}var zo=`#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${Mt}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;var Sr=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,Lt=`#version 300 es
precision highp float;
void main(){}`,Xn=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`,Rr=`#version 300 es
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
}`,vr=`#version 300 es
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
${Mt}

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
}`;function Y(e,n){let{gl:t}=e,r=t.createVertexArray(),o=t.createBuffer(),a=t.createBuffer(),s=t.createBuffer(),l=t.createBuffer();return!r||!o||!a||!s||!l?{kind:"refused",code:"FRAMEBUFFER_INCOMPLETE",reason:"The GPU refused a vertex buffer."}:(t.bindVertexArray(r),t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,n.positions,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,a),t.bufferData(t.ARRAY_BUFFER,n.normals,t.STATIC_DRAW),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,s),t.bufferData(t.ARRAY_BUFFER,n.tangents,t.STATIC_DRAW),t.enableVertexAttribArray(2),t.vertexAttribPointer(2,3,t.FLOAT,!1,0,0),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,l),t.bufferData(t.ELEMENT_ARRAY_BUFFER,n.indices,t.STATIC_DRAW),t.bindVertexArray(null),{vao:r,indexCount:n.indices.length,indexType:n.indices instanceof Uint32Array?t.UNSIGNED_INT:t.UNSIGNED_SHORT,dispose(){t.deleteVertexArray(r),t.deleteBuffer(o),t.deleteBuffer(a),t.deleteBuffer(s),t.deleteBuffer(l)}})}function _t(e){let{gl:n}=e,t=e.compile(Sr,Lt);if("kind"in t)return t;let r=e.compile(Rr,vr);if("kind"in r)return r;let o=e.compile(Xn,Lt);if("kind"in o)return o;let a=(s,l)=>n.getUniformLocation(s,l);return{shadowPass(s,l,i,d){let u=d??(()=>{});i.bind(),u("shadow.bind"),n.clear(n.DEPTH_BUFFER_BIT),n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.FRONT),n.useProgram(t),u("useProgram(shadow)"),n.uniformMatrix4fv(a(t,"uLightVP"),!1,s),u("uLightVP");for(let c of l)n.uniformMatrix4fv(a(t,"uModel"),!1,c.model),u("shadow uModel"),n.bindVertexArray(c.mesh.vao),u("shadow bindVAO"),n.drawElements(n.TRIANGLES,c.mesh.indexCount,c.mesh.indexType,0),u("shadow drawElements");n.bindVertexArray(null),n.cullFace(n.BACK)},depthPrepass(s,l){n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.colorMask(!1,!1,!1,!1),n.useProgram(o),n.uniformMatrix4fv(a(o,"uViewProj"),!1,s);for(let i of l)n.uniformMatrix4fv(a(o,"uModel"),!1,i.model),n.bindVertexArray(i.mesh.vao),n.drawElements(n.TRIANGLES,i.mesh.indexCount,i.mesh.indexType,0);n.bindVertexArray(null),n.colorMask(!0,!0,!0,!0)},draw(s){let l=s.onStep??(()=>{});if(n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.depthMask(!0),n.disable(n.BLEND),n.enable(n.CULL_FACE),n.cullFace(n.BACK),n.useProgram(r),n.uniformMatrix4fv(a(r,"uViewProj"),!1,s.viewProj),l("uViewProj"),n.uniform3fv(a(r,"uEye"),s.eye),l("uEye"),n.uniform3fv(a(r,"uLightDir"),s.lightDir),l("uLightDir"),n.uniform3fv(a(r,"uLightColour"),s.lightColour),l("uLightColour"),n.uniform1f(a(r,"uAmbientGain"),s.ambientGain??1),l("uAmbientGain"),s.fog&&s.fog.density>0){n.uniform1f(a(r,"uFogDensity"),s.fog.density),n.uniform1f(a(r,"uFogHeight"),s.fog.height),n.uniform1f(a(r,"uFogFloor"),s.fog.floor??0);let i=s.fog.colour;i==="sky"?n.uniform3f(a(r,"uFogColour"),-1,-1,-1):n.uniform3f(a(r,"uFogColour"),i[0],i[1],i[2]),l("fog")}else n.uniform1f(a(r,"uFogDensity"),0);Ar(n,r,s.sky),l("bindSky"),s.ao&&s.screenSize?(n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,s.ao),n.uniform1i(a(r,"uAO"),1),n.uniform2f(a(r,"uScreenSize"),s.screenSize[0],s.screenSize[1]),n.uniform1f(a(r,"uAOEnabled"),1)):n.uniform1f(a(r,"uAOEnabled"),0),l("bindAO"),n.uniformMatrix4fv(a(r,"uLightVP"),!1,s.lightVP),l("lit uLightVP"),s.shadow?(n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,s.shadow.depthTexture),n.uniform1i(a(r,"uShadowMap"),0),n.uniform1f(a(r,"uShadowTexel"),1/s.shadow.size),n.uniform1f(a(r,"uShadowStrength"),s.shadowStrength??1)):n.uniform1f(a(r,"uShadowStrength"),0);for(let i of s.draws)n.uniformMatrix4fv(a(r,"uModel"),!1,i.model),n.uniformMatrix3fv(a(r,"uNormalMat"),!1,i.normalMat),l("uNormalMat"),n.uniform3fv(a(r,"uBaseColour"),i.material.baseColour),l("uBaseColour"),n.uniform1f(a(r,"uRoughness"),i.material.roughness),n.uniform1f(a(r,"uMetalness"),i.material.metalness),n.uniform1f(a(r,"uAnisotropy"),i.material.anisotropy??0),n.bindVertexArray(i.mesh.vao),l("lit bindVAO"),n.drawElements(n.TRIANGLES,i.mesh.indexCount,i.mesh.indexType,0),l("lit drawElements");n.bindVertexArray(null),n.disable(n.CULL_FACE)},dispose(){n.deleteProgram(t),n.deleteProgram(r),n.deleteProgram(o)}}}var wt=`
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
}`,Fr=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,$n=`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${wt}

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
}`,jn=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${wt}

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
}`;function Dt(e,n,t){let{gl:r}=e,o=e.compile(Fr,$n);if("kind"in o)return o;let a=e.compile(Fr,jn);if("kind"in a)return a;let s=Math.max(1,n>>1),l=Math.max(1,t>>1),i=()=>{let m=r.createFramebuffer(),h=r.createTexture();return!m||!h?null:{fb:m,tex:h}},d=i(),u=i();if(!d||!u)return D("FRAMEBUFFER_INCOMPLETE","The GPU refused an AO buffer.");let c=()=>{for(let m of[d,u])r.bindTexture(r.TEXTURE_2D,m.tex),r.texImage2D(r.TEXTURE_2D,0,r.R8,s,l,0,r.RED,r.UNSIGNED_BYTE,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),r.bindFramebuffer(r.FRAMEBUFFER,m.fb),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,m.tex,0);r.bindFramebuffer(r.FRAMEBUFFER,null)};c(),r.bindFramebuffer(r.FRAMEBUFFER,d.fb);let f=r.checkFramebufferStatus(r.FRAMEBUFFER);if(r.bindFramebuffer(r.FRAMEBUFFER,null),f!==r.FRAMEBUFFER_COMPLETE)return D("FRAMEBUFFER_INCOMPLETE",`The AO buffer is incomplete (0x${f.toString(16)}).`);let p=(m,h,b,y,g,S,x)=>{r.activeTexture(r.TEXTURE0+x),r.bindTexture(r.TEXTURE_2D,h),r.uniform1i(r.getUniformLocation(m,"uDepth"),x),r.uniform2f(r.getUniformLocation(m,"uNearFar"),b,y),r.uniform1f(r.getUniformLocation(m,"uTanHalfFov"),Math.tan(g*Math.PI/360)),r.uniform1f(r.getUniformLocation(m,"uAspect"),S)};return{get texture(){return d.tex},get width(){return s},get height(){return l},compute(m){r.disable(r.DEPTH_TEST),r.depthMask(!1),r.disable(r.BLEND),r.disable(r.CULL_FACE),r.bindFramebuffer(r.FRAMEBUFFER,d.fb),r.viewport(0,0,s,l),r.useProgram(o),p(o,m.depthTexture,m.near,m.far,m.fovDeg,m.aspect,0),r.uniform2f(r.getUniformLocation(o,"uTexel"),1/s,1/l),r.uniform1f(r.getUniformLocation(o,"uRadius"),m.radius??.55),r.uniform1f(r.getUniformLocation(o,"uStrength"),m.strength??1.15),r.uniform1f(r.getUniformLocation(o,"uBias"),m.bias??.035),e.blit(o);for(let[h,b,y]of[[d,u,[1,0]],[u,d,[0,1]]])r.bindFramebuffer(r.FRAMEBUFFER,b.fb),r.viewport(0,0,s,l),r.useProgram(a),p(a,m.depthTexture,m.near,m.far,m.fovDeg,m.aspect,0),r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,h.tex),r.uniform1i(r.getUniformLocation(a,"uAO"),1),r.uniform2f(r.getUniformLocation(a,"uTexel"),1/s,1/l),r.uniform2f(r.getUniformLocation(a,"uDir"),y[0],y[1]),e.blit(a);r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,null),r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,null),r.bindFramebuffer(r.FRAMEBUFFER,null),r.depthMask(!0),r.enable(r.DEPTH_TEST)},resize(m,h){let b=Math.max(1,m>>1),y=Math.max(1,h>>1);b===s&&y===l||(s=b,l=y,c())},dispose(){r.deleteProgram(o),r.deleteProgram(a);for(let m of[d,u])r.deleteFramebuffer(m.fb),r.deleteTexture(m.tex)}}}var Wn=`
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
`;function Mr(e){let n=document.createElement("style");n.textContent=Wn,document.head.appendChild(n);let t=document.createElement("section");t.id="lcx-fallback";let r=(o,a)=>{if(o===null)return`<td class="absent${a?" n":""}">absent</td>`;let s=String(o).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");return`<td class="${a?"n":""}">${s}</td>`};return t.innerHTML=`<h2>${e.title} \u2014 flat view</h2><p class="reads">${e.readsAs}</p>`+(e.notices??[]).map(o=>`<p class="notice">${o}</p>`).join("")+'<div id="lcx-refusal"></div>'+(e.html?`<div class="surface">${e.html}</div>`:"<table><thead><tr>"+e.columns.map(o=>`<th class="${o.numeric?"n":""}">${o.label}</th>`).join("")+"</tr></thead><tbody>"+e.rows.map(o=>"<tr>"+e.columns.map(a=>r(o[a.key]??null,!!a.numeric)).join("")+"</tr>").join("")+"</tbody></table>"),document.body.appendChild(t),{markRendered(){t.dataset.rendered="1"},showRefusal(o,a){let s=document.getElementById("lcx-refusal");s&&(s.innerHTML=`<p class="refusal"><strong>${o}</strong> \u2014 ${a} The measurements below are unaffected.</p>`),delete t.dataset.rendered;for(let l of Array.from(document.querySelectorAll("canvas")))l.style.display="none"}}}var te=new URLSearchParams(location.search),Qt=te.get("settle")!=="0",Kt=te.get("particles")!=="0",qt=Et.includes(te.get("tier")??"")?te.get("tier"):"full",Lr=xt(qt),qr=te.get("fog")!=="0",ge=Math.max(1,Math.min(3,Number(te.get("scale")??1))),Zr=Number(te.get("frames")??300),k=1200*ge,O=720*ge,ce=document.getElementById("c");ce.width=k;ce.height=O;var Zt=document.getElementById("log");function Jt(e){document.title="REFUSED",Zt.textContent=e;let[n,...t]=e.split(":");throw Jr?.showRefusal(n?.trim()??"REFUSED",t.join(":").trim()||e),new Error(e)}var Jr=null;function B(e,n){return"kind"in n&&Jt(`${e}: ${n.code} \u2014 ${n.reason} ${n.detail??""}`),n}var Xe=["SOURCED","QUALIFIED","DILIGENCE","TERMS","SIGNED"],Be=[{name:"SABLE TREASURY",stage:"SOURCED",valueUsd:24e4,daysSinceUpdate:63,known:"OBSERVED"},{name:"PRAXIS DESK",stage:"SOURCED",valueUsd:null,daysSinceUpdate:9,known:"VALUE_ABSENT"},{name:"CASTOR LABS",stage:"SOURCED",valueUsd:15e4,daysSinceUpdate:34,known:"OBSERVED"},{name:"LUMEN CUSTODY",stage:"SOURCED",valueUsd:95e3,daysSinceUpdate:17,known:"OBSERVED"},{name:"TIBER CLEARING",stage:"QUALIFIED",valueUsd:31e4,daysSinceUpdate:4,known:"OBSERVED"},{name:"VANTA MARKETS",stage:"QUALIFIED",valueUsd:62e4,daysSinceUpdate:28,known:"OBSERVED"},{name:"\u2014",stage:"QUALIFIED",valueUsd:null,daysSinceUpdate:null,known:"WITHHELD"},{name:"HELIOS EXCHANGE",stage:"DILIGENCE",valueUsd:175e4,daysSinceUpdate:52,known:"OBSERVED"},{name:"KESTREL FUND",stage:"DILIGENCE",valueUsd:43e4,daysSinceUpdate:11,known:"OBSERVED"},{name:"MERIDIAN PAY",stage:"TERMS",valueUsd:26e5,daysSinceUpdate:41,known:"OBSERVED"},{name:"NORDIC CUSTODY",stage:"TERMS",valueUsd:88e4,daysSinceUpdate:6,known:"OBSERVED"},{name:"ATLAS OTC",stage:"SIGNED",valueUsd:42e5,daysSinceUpdate:3,known:"OBSERVED"}],$=45,en=Mr({title:"E3 \xB7 The Pipeline \u2014 deals by stage, package value and days since update",readsAs:`In the rendered view a deal is an object: its size is package value, its position along the channel is the gates it has cleared, and its HEIGHT is movement \u2014 a deal untouched for ${$} days rests on the floor of the channel. That is what this table cannot do. Every figure below is here, and sorting by any one column hides the other two, which is why the quantity that matters \u2014 value that has cleared diligence and then stopped \u2014 takes two sorts and arithmetic here and one look there.`,notices:[`SYNTHETIC DEALS \u2014 ${Be.length} hand-authored records. The shape is deliberate (a funnel, value skewed to two names, the two largest late-stage deals stalled); the values are not measurements.`,"One deal was never priced and one is in a compartment that may not be read. Both are ABSENT below rather than blank or zero, the STATE column separates them, and every aggregate in the rendered view excludes both rather than estimating them."],columns:[{key:"name",label:"Deal"},{key:"stage",label:"Stage"},{key:"state",label:"State"},{key:"value",label:"Package value (USD)",numeric:!0},{key:"days",label:"Days since update",numeric:!0},{key:"movement",label:"Movement"}],rows:Be.map(e=>({name:e.known==="WITHHELD"?"withheld":e.name,stage:e.stage,state:e.known,value:e.valueUsd,days:e.daysSinceUpdate,movement:e.daysSinceUpdate===null?null:e.daysSinceUpdate>=$?"stalled \u2014 on the floor":e.daysSinceUpdate>=.6*$?"stalled":"moving"}))});Jr=en;te.get("refuse")==="1"&&Jt("FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. The channel is not being drawn.");var Ie=Je(ce,{alpha:!1});Ze(Ie)||Jt(`stage: ${Ie.code} \u2014 ${Ie.reason}`);var _=Ie,T=_.gl,Yn=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,Qn=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${lt}
${ut}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`,Kn=B("present",_.compile(Yn,Qn)),Ut=B("lit",_t(_)),Pe=B("target",Rt(_,k,O)),Ot=B("shadow",vt(_,we(qt,1536))),_r=B("ao",Dt(_,k,O)),le=B("strokes",nt(_)),de=.86,tn=.46,qn=Math.max(...Be.map(e=>e.valueUsd??0)),Zn=e=>tn*Math.cbrt(e/qn),oe=.11,F=1.45,er=2.2,rn=-10.6,Te=rn-2.6,fe=1.7,nn=fe-Te,Bt=(fe+Te)/2,Q=1.15,$e=e=>rn+e*er,Jn=.58,eo=.38,wr=.6,kt=.66,Gt=.3,Dr=.16,on=e=>e%2===0?Dr:Dr+Gt+.06,ke=.45,Vt=190,an=13.5,xe=qr?Math.log(2)/an:0,Ur="#0C1322",sn=90,tr=800,Ge=1.4,rr=2048,ln=150,un="#2C6BFF",cn="#C9552B",je="#E0A94A",dn="#5C6880",mn=dt(2*F,40),fn=ie(.18,1.25,nn),pn=ie(.1,Q,.1),hn=ie(2*F,.05,.13),bn=ie(1,1,1),En=ft(oe*1.25,oe*.34,40,14),xn=mt(oe,20,28),to=B("floor",Y(_,mn)),Pr=B("wall",Y(_,fn)),Nr=B("post",Y(_,pn)),ro=B("sill",Y(_,hn)),no=B("deal",Y(_,bn)),oo=B("absent",Y(_,En)),ao=B("withheld",Y(_,xn)),Z=new Float32Array([1,0,0,0,1,0,0,0,1]),so=new Float32Array([1,0,0,0,0,1,0,-1,0]),J=(e,n,t,r=1)=>{let o=be();return o[0]=r,o[5]=r,o[10]=r,o[12]=e,o[13]=n,o[14]=t,o},io=(e,n,t)=>{let r=be();return r[5]=0,r[6]=1,r[9]=-1,r[10]=0,r[12]=e,r[13]=n,r[14]=t,r},yn=.1,gn=40,Ve={target:[0,.7,-5.2],distance:8.2,azimuthDeg:9,elevationDeg:14,fovDeg:35,near:yn,far:gn},V=De(Ve),Cr=new Map,L=Be.map((e,n)=>{let t=Xe.indexOf(e.stage),r=Cr.get(e.stage)??0;Cr.set(e.stage,r+1);let o=$e(t)+Jn+r*eo,a=r%2===0?-wr:wr,s=e.valueUsd===null?null:Zn(e.valueUsd),l=e.known==="VALUE_ABSENT"?"MASS_REFUSED_VALUE_NEVER_MEASURED":e.known==="WITHHELD"?"MASS_REFUSED_VALUE_WITHHELD":null,i=e.daysSinceUpdate===null?null:e.daysSinceUpdate/$,d=i===null?null:Qt?Math.min(1,i):0,u=e.daysSinceUpdate===null?"SETTLE_REFUSED_LAST_TOUCH_WITHHELD":null,c=s!==null?s/2:oe,f=d===null?de+.3:(1-d)*de,p=f+c;return{d:e,i:n,stageIndex:t,slot:r,x:a,z:o,edge:s,settle:d,settleClamped:i!==null&&i>1,baseY:f,centreY:p,topY:f+2*c,massRefusal:l,settleRefusal:u,distance:Math.hypot(a-V[0],p-V[1],o-V[2])}}),lo=L.filter(e=>{let n=e.edge!==null?e.edge/2:oe,t=e.z-$e(e.stageIndex);return t-n<.05||t+n>er-.05}).map(e=>e.d.name),uo=e=>L.filter(n=>n.stageIndex>=e&&n.d.known==="OBSERVED"&&n.d.valueUsd!==null).reduce((n,t)=>n+(t.d.valueUsd??0),0),I=Xe.map((e,n)=>{let t=$e(n),r=uo(n),o=r/sn,a=o/tr,s=Math.min(er,fe-t-.2),l=Math.max(.2,s/Ge);return{label:e,index:n,z:t,clearedUsd:r,usdPerDay:o,ratePerSec:a,life:l,linearDensityPerMetre:a/Ge}}),co=[.1,.3,1.15],Tn=I.map(e=>({at:[0,.34,e.z+.06],rate:e.ratePerSec,velocity:[0,0,Ge],spread:.26,colour:co,life:e.life})),re=Kt?bt(_,rr):null,G=re!==null&&!("kind"in re)?re:null,Ht=re!==null&&"kind"in re?`${re.code} \u2014 ${re.reason}`:Kt?null:"DISABLED_BY_PARAM",mo=Math.round(I.reduce((e,n)=>e+n.ratePerSec*n.life,0)),Ir=I.reduce((e,n)=>e+n.ratePerSec,0),Or=Ir>0?(G?.slots??rr)/Ir:1/0,Br=Math.max(...I.map(e=>e.life)),An={sources:Tn,dtSeconds:1/60,noiseScale:.55,noiseStrength:.12,drag:.5},kr={baseColour:U("#1E2A42"),roughness:.6,metalness:.03},Pt={baseColour:U("#31415C"),roughness:.36,metalness:.2},Sn=J(0,0,Bt,1);Sn[10]=nn/(2*F);var ne=[{mesh:to,model:Sn,normalMat:Z,material:{baseColour:U("#22304A"),roughness:.82,metalness:0}},{mesh:Pr,model:J(-(F+.09),.625,Bt),normalMat:Z,material:kr},{mesh:Pr,model:J(F+.09,.625,Bt),normalMat:Z,material:kr}];for(let e of I)ne.push({mesh:Nr,model:J(-(F+.05),Q/2,e.z),normalMat:Z,material:Pt},{mesh:Nr,model:J(F+.05,Q/2,e.z),normalMat:Z,material:Pt},{mesh:ro,model:J(0,.025,e.z),normalMat:Z,material:Pt});for(let e of L)if(e.d.known==="WITHHELD")ne.push({mesh:ao,model:J(e.x,e.centreY,e.z),normalMat:Z,material:{baseColour:U(dn),roughness:.55,metalness:.25}});else if(e.edge===null)ne.push({mesh:oo,model:io(e.x,e.centreY,e.z),normalMat:so,material:{baseColour:U(je),roughness:.44,metalness:.1}});else{let n=it(U(un),U(cn),e.settle??0);ne.push({mesh:no,model:J(e.x,e.centreY,e.z,e.edge),normalMat:Z,material:{baseColour:n,roughness:.34+.16*(e.settle??0),metalness:.06}})}var Rn=[-.62,-.38,-.69],Gr=[-2,0,Te],Vr=[2,1.9,fe],Hr=Tt({direction:Rn,colour:[1,1,1],extent:9.6},St(Gr,Vr),At(Gr,Vr)),fo=j(mn)+2*j(fn)+I.length*(2*j(pn)+j(hn))+L.filter(e=>e.d.known==="OBSERVED").length*j(bn)+L.filter(e=>e.d.known==="VALUE_ABSENT").length*j(En)+L.filter(e=>e.d.known==="WITHHELD").length*j(xn),z=Ue(Ve,k/O),P=k/ge,N=O/ge,nr=e=>xe<=0?0:1-Math.exp(-xe*e),ye=e=>e>=1e6?`$${(e/1e6).toFixed(2)}M`:e>=1e4?`$${Math.round(e/1e3)}k`:`$${(e/1e3).toFixed(1)}k`,Nt=[],zr=(e,n,t)=>{let r=0;for(let o=0;o<4;o++){let a=e[o],s=e[(o+1)%4],l=(s.x-a.x)*(t-a.y)-(s.y-a.y)*(n-a.x);if(Math.abs(l)<1e-9)continue;let i=l>0?1:-1;if(r===0)r=i;else if(i!==r)return!1}return!0},vn=e=>{let n=C(z,[e.x,e.baseY,e.z],P,N),t=C(z,[e.x,e.topY,e.z],P,N);return n.behind||t.behind?0:Math.abs(n.sy-t.sy)},Fn=e=>{let n=C(z,[e.x,e.centreY,e.z],P,N);if(n.behind)return!1;let t=C(z,[e.x,e.topY,e.z],P,N),r=Math.max(6,Math.abs(n.sy-t.sy));return n.sx>r&&n.sx<P-r&&n.sy>r&&n.sy<N-r},He=e=>{let n=C(z,[e.x,e.centreY,e.z],P,N);return n.behind?null:n.sy},or=e=>{if(e.settle===null)return null;let n=e.edge!==null?e.edge/2:oe,t=C(z,[e.x,e.baseY+n,e.z],P,N),r=C(z,[e.x,de+n,e.z],P,N);return t.behind||r.behind?null:Math.abs(t.sy-r.sy)},We=[...L].sort((e,n)=>e.distance-n.distance).map(e=>{let n=e.d.known==="WITHHELD",t=e.distance>an,r=Math.round(kt*Vt),o=Math.round(Gt*Vt),a=e.x<0?e.x-ke:e.x+ke,s=Math.atan2(V[0]-a,V[2]-e.z),l=ht(a,e.z,e.topY+on(e.slot),kt,Gt,s,0),i=pt(z,l,P,N,r,o),d=W(i)?i.refusal:null,u=!W(i)&&i.signedArea<=0,c=W(i)?0:Math.max(Math.hypot(i.screen[0].x-i.screen[1].x,i.screen[0].y-i.screen[1].y),Math.hypot(i.screen[3].x-i.screen[2].x,i.screen[3].y-i.screen[2].y)),f=c<26,p=W(i)?!1:i.screen.every(y=>y.x<0||y.x>P||y.y<0||y.y>N),m=W(i)?0:i.screen.filter(y=>Nt.some(g=>zr(g,y.x,y.y))).length+Nt.reduce((y,g)=>y+g.filter(S=>zr(i.screen.map(x=>({x:x.x,y:x.y})),S.x,S.y)).length,0),h=m>=2,b=!d&&!u&&!n&&!t&&!f&&!p&&!h;return b&&!W(i)&&Nt.push(i.screen.map(y=>({x:y.x,y:y.y}))),{p:e,proj:i,shown:b,ew:r,eh:o,refusal:d,backFacing:u,withheld:n,tooFar:t,edgeOn:f,offFrame:p,occluded:h,widthPx:c,coveredCorners:m}}),po=We.filter(e=>e.shown).map(e=>e.p),Ne={colour:U("#4E8CFF"),gain:1.5},ho={colour:U("#7FB2FF"),gain:1.1},bo={colour:U("#7FB2FF"),gain:.45},ee=V[0]>=0?1:-1,Mn=ee*(F+.2),Ln=ee*(F+.48),Eo=ee*(F+.56),ar=$e(3),xo=.055,sr=[0,20,$].map(e=>({days:e,y:(1-Math.min(1,e/$))*de+xo,label:e>=$?`${e}d+`:`${e}d`}));function zt(){let e=Ue(Ve,k/O);G&&G.step(An),Ut.shadowPass(Hr,ne,Ot),Pe.bind();let n=U(Ur);T.clearColor(n[0],n[1],n[2],1),T.clear(T.COLOR_BUFFER_BIT|T.DEPTH_BUFFER_BIT),Ut.depthPrepass(e,ne),_r.compute({depthTexture:Pe.depthTexture,near:yn,far:gn,fovDeg:Ve.fovDeg??35,aspect:k/O,radius:.36,strength:1.25}),Pe.bind(),Ut.draw({viewProj:e,eye:V,lightDir:Rn,lightColour:[3.4,3.3,3.14],ambientGain:.44,lightVP:Hr,shadow:Ot,shadowStrength:.92,draws:ne,ao:_r.texture,screenSize:[k,O],fog:xe>0?{density:xe,height:5,floor:0,colour:U(Ur)}:null}),T.enable(T.BLEND),T.blendFunc(T.ONE,T.ONE),T.enable(T.DEPTH_TEST),T.depthMask(!1);for(let t of I)le.ruleAtDepth(e,-F,.02,F,.02,t.z,.012,Ne),le.ruleAtDepth(e,-F,Q,F,Q,t.z,.01,Ne),le.ruleAtDepth(e,-F,.02,-F,Q,t.z,.01,Ne),le.ruleAtDepth(e,F,.02,F,Q,t.z,.01,Ne);for(let t of sr)le.ruleAtDepth(e,Ln,t.y,Mn,t.y,ar,.006,ho);for(let t of po){let r=t.x<0?t.x-ke:t.x+ke;le.ruleAtDepth(e,t.x,t.topY,r,t.topY+on(t.slot),t.z,.008,bo)}T.depthMask(!0),T.disable(T.BLEND),G&&G.draw({viewProj:e,sources:Tn,pointScale:18}),T.bindFramebuffer(T.FRAMEBUFFER,null),T.viewport(0,0,k,O),T.disable(T.DEPTH_TEST),T.activeTexture(T.TEXTURE0),T.bindTexture(T.TEXTURE_2D,Pe.texture),_.blit(Kn,t=>T.uniform1i(T.getUniformLocation(t,"uScene"),0))}function yo(e){zt();let n=new Uint8Array(4);T.readPixels(0,0,1,1,T.RGBA,T.UNSIGNED_BYTE,n);let t=performance.now();for(let r=0;r<e;r++)zt();return T.readPixels(0,0,1,1,T.RGBA,T.UNSIGNED_BYTE,n),(performance.now()-t)/e}if(G)for(let e=0;e<ln;e++)G.step(An);var Ct=yo(Math.max(1,Zr)),Ye=document.createElement("div");Ye.style.cssText=`position:relative;overflow:hidden;width:${P}px;height:${N}px`;ce.parentNode?.insertBefore(Ye,ce);Ye.appendChild(ce);var ae=document.createElement("div");ae.style.cssText="position:absolute;inset:0;pointer-events:none";Ye.appendChild(ae);for(let e of[...We].sort((n,t)=>t.p.distance-n.p.distance)){let{p:n,proj:t,shown:r,ew:o,eh:a}=e;if(!r||W(t))continue;let s=nr(n.distance),l=document.createElement("div");l.style.cssText=`position:absolute;left:0;top:0;width:${o}px;height:${a}px;transform-origin:0 0;transform:${t.transform};display:flex;flex-direction:column;justify-content:center;gap:3px;padding:0 5px;overflow:hidden;opacity:${(1-.7*s).toFixed(3)};-webkit-font-smoothing:antialiased`;let i=n.d.valueUsd===null?`<span style="color:${je}">VALUE ABSENT</span>`:ye(n.d.valueUsd),d=n.d.daysSinceUpdate===null?"\u2014":`${n.d.daysSinceUpdate} d`;l.innerHTML=`<div style="font:700 11px/1.05 ui-monospace,monospace;color:#fff">${n.d.name}</div><div style="font:400 10.5px/1.2 ui-monospace,monospace;color:rgba(255,255,255,0.80)">${i} \xB7 ${d}</div><div style="font:600 9px/1 ui-monospace,monospace;letter-spacing:.14em;color:rgba(255,255,255,0.60)">${n.d.stage}</div>`,ae.appendChild(l)}var Xr=[],$r=[...I].reverse().map(e=>{let n=e.index%2===0,t=C(z,[n?-(F+.14):F+.14,2.1,e.z],P,N),r=nr(Math.hypot(V[0],V[1]-Q,V[2]-e.z)),o=!t.behind&&t.sx>30&&t.sx<P-30&&t.sy>8&&t.sy<N-8,a=o&&Xr.some(s=>Math.hypot(s.x-t.sx,s.y-t.sy)<30);if(o&&!a){Xr.push({x:t.sx,y:t.sy});let s=document.createElement("div");s.style.cssText=`position:absolute;left:${t.sx.toFixed(1)}px;top:${t.sy.toFixed(1)}px;transform:translate(${n?"-100%":"0"},-100%);text-align:${n?"right":"left"};white-space:nowrap;opacity:${(1-.72*r).toFixed(3)}`,s.innerHTML=`<div style="font:600 10px/1.25 ui-monospace,monospace;letter-spacing:.16em;color:#9CC2FF">${e.label}</div><div style="font:400 9.5px/1.25 ui-monospace,monospace;color:rgba(196,212,240,0.72)">${ye(e.usdPerDay)}/d</div>`,ae.appendChild(s)}return{stage:e.label,sx:Math.round(t.sx),sy:Math.round(t.sy),onFrame:o,crowded:a}}),go=[{y:de+.15,label:"DAYS SINCE UPDATE"},...sr].map(e=>{let n=C(z,[Eo,e.y,ar],P,N),t=!n.behind&&n.sx>0&&n.sx<P&&n.sy>0&&n.sy<N;if(t){let r=document.createElement("div");r.style.cssText=`position:absolute;left:${n.sx.toFixed(1)}px;top:${n.sy.toFixed(1)}px;transform:translate(${ee>0?"0":"-100%"},-50%);text-align:${ee>0?"left":"right"};font:500 9.5px/1 ui-monospace,monospace;letter-spacing:.08em;color:rgba(196,212,240,0.78);white-space:nowrap;${ee>0?"padding-left":"padding-right"}:5px`,r.textContent=e.label,ae.appendChild(r)}return{label:e.label,onFrame:t}}),_n=Xe.map((e,n)=>{let t=L.filter(l=>l.stageIndex===n&&l.settle!==null&&l.edge!==null);if(t.length<2)return{stage:e,readable:t.length,separationPx:null};let r=t.reduce((l,i)=>(i.settle??0)>(l.settle??0)?i:l),o=t.reduce((l,i)=>(i.settle??0)<(l.settle??0)?i:l),a=He(r),s=He(o);return{stage:e,readable:t.length,separationPx:a===null||s===null?null:Math.round(Math.abs(a-s))}}),jr=_n.map(e=>e.separationPx).filter(e=>e!==null),To=jr.length>0?Math.min(...jr):0,wn=[];for(let e of L)for(let n of L){if(e.i>=n.i||e.stageIndex!==n.stageIndex||e.settle===null||n.settle===null)continue;let[t,r]=e.settle>n.settle?[e,n]:[n,e],o=He(t),a=He(r);o!==null&&a!==null&&o<a&&wn.push(`${t.d.name} above ${r.d.name}`)}var me=L.filter(e=>e.edge!==null&&e.d.known==="OBSERVED"),Xt=new Map;for(let e of me)Xt.set(e.i,vn(e));var Dn=0,Un=0;for(let e of me)for(let n of me){if(e.i>=n.i)continue;let[t,r]=(e.d.valueUsd??0)>(n.d.valueUsd??0)?[e,n]:[n,e];(Xt.get(t.i)??0)<(Xt.get(r.i)??0)&&(Dn++,t.stageIndex===r.stageIndex&&Un++)}var ir=.6,Oe=me.reduce((e,n)=>e+(n.d.valueUsd??0),0),Ae=me.filter(e=>(e.settle??0)>=ir),Wr=Ae.reduce((e,n)=>e+(n.d.valueUsd??0),0),Ao=Ae.filter(e=>e.stageIndex>=Xe.indexOf("DILIGENCE")),ze=Ao.reduce((e,n)=>e+(n.d.valueUsd??0),0),Yr=Ae.map(e=>or(e)).filter(e=>e!==null),So=Yr.length>0?Math.round(Math.min(...Yr)):0,Ro=Math.round(Math.max(0,...L.map(e=>or(e)).filter(e=>e!==null))),ue={OBSERVED:L.filter(e=>e.d.known==="OBSERVED").length,VALUE_ABSENT:L.filter(e=>e.d.known==="VALUE_ABSENT").length,WITHHELD:L.filter(e=>e.d.known==="WITHHELD").length},lr=document.createElement("div");lr.style.cssText="position:absolute;left:18px;top:16px;display:flex;flex-direction:column;gap:7px";lr.innerHTML=`<div style="font:600 11px/1 ui-monospace,monospace;letter-spacing:.16em;color:#8FB7FF">PIPELINE \xB7 SIZE IS VALUE, HEIGHT IS MOVEMENT</div><div style="font:400 10.5px/1.55 ui-monospace,monospace;color:rgba(196,212,240,0.86)"><b style="color:#FF9B76">${ye(ze)}</b> PAST DILIGENCE AND STALLED &nbsp;\xB7&nbsp; ${Math.round(100*ze/Math.max(1,Oe))}% OF THE READABLE BOOK<br>${$} d = ON THE FLOOR &nbsp;\xB7&nbsp; 1 PARTICLE = ${ye(tr)}/d CLEARED<br>${Qt?"MOVEMENT AXIS ON":"MOVEMENT AXIS OFF \u2014 every deal pinned to the rail"} &nbsp;\xB7&nbsp; ${Ht===null?"THROUGHPUT ON":`THROUGHPUT OFF \u2014 ${Ht.split(" \u2014 ")[0]}`}</div><div style="font:500 10px/1.4 ui-monospace,monospace;color:${je}">SYNTHETIC DEALS</div>`;ae.appendChild(lr);var ur=document.createElement("div");ur.style.cssText="position:absolute;right:18px;bottom:16px;display:flex;flex-direction:column;gap:6px;align-items:flex-end;font:500 10.5px/1 ui-monospace,monospace";ur.innerHTML=[[un,"UPDATED \xB7 rides the rail"],[cn,`STALLED \xB7 ${Ae.length} of ${ue.OBSERVED} at ${Math.round(ir*$)} d+`],[je,`VALUE ABSENT \xB7 ${ue.VALUE_ABSENT} (ring: no mass to give)`],[dn,`WITHHELD \xB7 ${ue.WITHHELD} (off the movement axis)`]].map(([e,n])=>`<div style="display:flex;align-items:center;gap:7px;color:rgba(196,212,240,0.85)"><span>${n}</span><span style="width:11px;height:11px;background:${e};display:inline-block"></span></div>`).join("");ae.appendChild(ur);var Ee=G?G.readState():null,$t=0,Pn=0,jt=1/0,Wt=-1/0;if(Ee&&G)for(let e=0;e<G.slots;e++){let n=Ee[e*4],t=Ee[e*4+1],r=Ee[e*4+2];Ee[e*4+3]<0||($t++,r<jt&&(jt=r),r>Wt&&(Wt=r),(Math.abs(n)>F||t<-.15||t>Q+.25||r<Te||r>fe)&&Pn++)}var Nn=(()=>{let e=T.getExtension("WEBGL_debug_renderer_info");return e?String(T.getParameter(e.UNMASKED_RENDERER_WEBGL)):"unknown"})(),It=/swiftshader|llvmpipe|software/i.test(Nn),Yt=ct();if(Yt.length>0){let e="BRAND FIDELITY FAILED \u2014 "+Yt.map(n=>`${n.key}: expected ${n.expected}, got ${n.actual}`).join("; ");throw document.title="REFUSED",Zt.textContent=e,new Error(e)}var Ce=We.map(e=>({name:e.p.d.name,stage:e.p.d.stage,known:e.p.d.known,valueUsd:e.p.d.valueUsd,days:e.p.d.daysSinceUpdate,edgeM:e.p.edge===null?null:Number(e.p.edge.toFixed(3)),settle:e.p.settle===null?null:Number(e.p.settle.toFixed(3)),settleClamped:e.p.settleClamped,baseY:Number(e.p.baseY.toFixed(3)),distance:Number(e.p.distance.toFixed(2)),screenHeightPx:Math.round(vn(e.p)),fallenPx:(()=>{let n=or(e.p);return n===null?null:Math.round(n)})(),fog:Number(nr(e.p.distance).toFixed(3)),tagWidthPx:Math.round(e.widthPx),tagShown:e.shown,massRefusal:e.p.massRefusal,settleRefusal:e.p.settleRefusal,hiddenBecause:e.shown?null:e.withheld?"WITHHELD":e.refusal?e.refusal:e.backFacing?"BACK_FACING":e.offFrame?"OFF_FRAME":e.edgeOn?"EDGE_ON":e.tooFar?"BEYOND_LEGIBLE_RANGE":"OCCLUDED",objectOnFrame:Fn(e.p)})),Cn={tier:Lr.tier,tierDprScale:Lr.dprScale,tierShadowMapSize:we(qt,1536),shadowBaseline:1536,settleAxis:Qt,particlesRequested:Kt,fog:qr,fogDensity:Number(xe.toFixed(4)),hdr:_.hdr,eye:V.map(e=>Number(e.toFixed(2))),deals:L.length,counts:ue,aggregateExcludes:{valueAbsent:ue.VALUE_ABSENT,withheld:ue.WITHHELD,code:"AGGREGATE_EXCLUDES_UNREADABLE_VALUE"},totalObservedUsd:Oe,stallDays:$,stalledFrom:ir,stalledCount:Ae.length,stalledUsd:Wr,stalledShare:Number((Wr/Math.max(1,Oe)).toFixed(3)),deepStalledUsd:ze,deepStalledShare:Number((ze/Math.max(1,Oe)).toFixed(3)),settleClamped:L.filter(e=>e.settleClamped).length,minStalledDisplacementPx:So,maxDisplacementPx:Ro,minSeparationPx:To,settleInversions:wn,railLiftM:de,edgeMaxM:tn,edgeMinM:Number(Math.min(...me.map(e=>e.edge??0)).toFixed(3)),referenceSizeM:oe,massAmbiguousPairs:Dn,massAmbiguousWithinStage:Un,outOfSegment:lo,windowDays:sn,usdPerParticle:tr,particleSpeed:Ge,rateMonotoneDown:I.every((e,n)=>n===0||e.ratePerSec<=I[n-1].ratePerSec+1e-9),rateRatioFirstLast:Number((I[0].ratePerSec/Math.max(1e-9,I[I.length-1].ratePerSec)).toFixed(2)),particleField:{refusal:Ht,capacity:rr,slots:G?.slots??0,aliveExpected:mo,aliveActual:$t,outOfChannel:Pn,zRange:$t>0?[Number(jt.toFixed(2)),Number(Wt.toFixed(2))]:null,channelZ:[Te,fe],slotRecycleSeconds:Number(Or.toFixed(2)),maxLifeSeconds:Number(Br.toFixed(2)),recycleSafe:Or>Br,primeSteps:ln},tagsShown:We.filter(e=>e.shown).length,hiddenBy:Ce.filter(e=>!e.tagShown).reduce((e,n)=>{let t=n.hiddenBecause??"UNKNOWN";return e[t]=(e[t]??0)+1,e},{}),nameOverflow:L.filter(e=>e.d.known!=="WITHHELD"&&e.d.name.length*6.6>kt*Vt-10).map(e=>e.d.name),objectsOffFrame:L.filter(e=>!Fn(e)).map(e=>e.d.name),gateLabelsOffFrame:$r.filter(e=>!e.onFrame).map(e=>e.stage),gateLabelsCrowded:$r.filter(e=>e.crowded).map(e=>e.stage),axisLabelsOffFrame:go.filter(e=>!e.onFrame).length,axisTicksDrawn:sr.map(e=>{let n=C(z,[(Mn+Ln)/2,e.y,ar],k,O);if(n.behind||n.sx<2||n.sx>k-2||n.sy<4||n.sy>O-4)return{label:e.label,drawn:!1,why:"OFF_FRAME"};let t=(a,s)=>{let l=s-a+1,i=new Uint8Array(4*l);T.readPixels(Math.round(n.sx),Math.round(O-n.sy)+a,1,l,T.RGBA,T.UNSIGNED_BYTE,i);let d=0;for(let u=0;u<l;u++)d=Math.max(d,i[u*4]+i[u*4+1]+i[u*4+2]);return d},r=t(-2,2),o=t(8,12);return{label:e.label,drawn:r>o+12,lum:r,background:o}}),axisSide:ee>0?"right":"left",axisOnEyeSide:ee>0==V[0]>=0,fogNearest:Math.min(...Ce.map(e=>e.fog)),fogFurthest:Math.max(...Ce.map(e=>e.fog)),brandFidelity:Yt,glError:T.getError(),triangles:fo,shadowMap:Ot.size,resolution:`${k}x${O}`,dprScale:ge,frames:Zr,msPerFrame:Number(Ct.toFixed(3)),fps:Math.round(1e3/Ct),renderer:Nn,rendererClass:It?"software":"hardware",headroom:It?null:Number((16.6-Ct).toFixed(3)),headroomRefusal:It?"SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET":null,hardwareMsPerFrame:null,gates:I.map(e=>({stage:e.label,z:e.z,clearedUsd:e.clearedUsd,usdPerDay:Math.round(e.usdPerDay),ratePerSec:Number(e.ratePerSec.toFixed(2)),perMetre:Number(e.linearDensityPerMetre.toFixed(2)),lifeSeconds:Number(e.life.toFixed(2))})),perStageSeparation:_n,perDeal:Ce};globalThis.E3=Cn;var{perDeal:Qr,gates:Kr,perStageSeparation:vo,...Fo}=Cn;Zt.textContent=JSON.stringify(Fo,null,2)+`

gates (${Kr.length}):
`+Kr.map(e=>`  ${e.stage.padEnd(10)} $${String(e.usdPerDay).padStart(7)}/d ${String(e.ratePerSec).padStart(7)} p/s ${String(e.perMetre).padStart(7)} p/m life ${e.lifeSeconds}s`).join(`
`)+`

settle separation on screen:
`+vo.map(e=>`  ${e.stage.padEnd(10)} ${e.separationPx===null?"n/a (needs 2 readable)":`${e.separationPx} px`}`).join(`
`)+`

perDeal (${Qr.length}, full detail on globalThis.E3):
`+Qr.map(e=>`  ${e.name.padEnd(16)} ${e.stage.padEnd(10)} ${(e.valueUsd===null?"ABSENT":ye(e.valueUsd)).padStart(7)} ${(e.days===null?"\u2014":`${e.days}d`).padStart(4)} base ${e.baseY.toFixed(2)} fallen ${String(e.fallenPx??"\u2014").padStart(3)}px ${String(e.distance).padStart(5)}m ${String(e.screenHeightPx).padStart(3)}px ${e.tagShown?"TAG":`no tag: ${e.hiddenBecause}`}`).join(`
`);zt();en.markRendered();document.title="READY";

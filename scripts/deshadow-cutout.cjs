#!/usr/bin/env node
// Removes a baked floor shadow from a catalogue cutout. Used 2026-11-03 on 22 Patek
// pieces. Find candidates by the share of semi-transparent pixels in the lowest 14% of
// the watch: shadowed cutouts scored 3.7% or more, clean ones 1.2% or less. Upload the
// result under a new name (<n>-ns1-cutout.webp plus -thumb) and PATCH images_cutout,
// because storage files are cached as immutable and the originals stay as the backup.
const sharp=require('sharp');
async function deshadow(input,{SOLID=205,BAND=.84}={}){
  const {data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const w=info.width,h=info.height,A=(x,y)=>data[(y*w+x)*4+3];
  let top=h,bot=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(A(x,y)>8){if(y<top)top=y;if(y>bot)bot=y}
  const start=Math.floor(top+(bot-top)*BAND);
  // solid = strap; rows below the last solid row are pure shadow
  const solid=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(A(x,y)>=SOLID)solid[y*w+x]=1;
  // a row only counts as strap if it has a real run of solid pixels, not a stray speck
  const near=(x,y)=>{for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const X=x+dx,Y=y+dy;if(X>=0&&Y>=0&&X<w&&Y<h&&solid[Y*w+X])return true}return false};
  const out=Buffer.from(data);let cleared=0;
  for(let y=start;y<h;y++)for(let x=0;x<w;x++){const o=(y*w+x)*4,a=data[o+3];if(a===0||a>=SOLID)continue;if(!near(x,y)||a<40){out[o+3]=0;cleared++}}
  // drop isolated specks left in the shadow band
  const clean=Buffer.from(out);for(let y=start;y<h;y++)for(let x=0;x<w;x++){const o=(y*w+x)*4;if(!out[o+3])continue;let n=0;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const X=x+dx,Y=y+dy;if(X>=0&&Y>=0&&X<w&&Y<h&&out[(Y*w+X)*4+3]>=SOLID)n++}if(n<4)clean[o+3]=0}
  const trimmed=await sharp(clean,{raw:{width:w,height:h,channels:4}}).png().trim({threshold:1}).toBuffer();
  const cutout=await sharp(trimmed).resize(520,520,{fit:'inside',kernel:'lanczos3'}).webp({quality:90,alphaQuality:100,effort:5}).toBuffer();
  const thumb=await sharp(cutout).resize(224,224,{fit:'inside',kernel:'lanczos3'}).webp({quality:88,alphaQuality:100,effort:5}).toBuffer();
  return{cutout,thumb,cleared,w,h,start};
}
module.exports={deshadow};

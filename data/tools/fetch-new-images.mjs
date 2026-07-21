#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
const SITE=new URL("../../",import.meta.url).pathname;
const OUT=path.join(SITE,"assets/img/products");
const UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const DELAY=900;
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
// id -> array of candidate queries (most specific first)
const Q={
"rf-p300-12":["Rockford Fosgate P300-12"],"rf-p300-10":["Rockford Fosgate P300-10"],
"rf-p3d4-12":["Rockford Fosgate P3D4-12"],"rf-p2d4-10":["Rockford Fosgate P2D4-10"],
"rf-r2d4-12":["Rockford Fosgate R2D4-12"],"rf-r500x1d":["Rockford Fosgate R500X1D amplifier"],
"rf-r1200-1d":["Rockford Fosgate R1200-1D amplifier"],"rf-r150x2":["Rockford Fosgate R150X2 amplifier"],
"rf-t400-4":["Rockford Fosgate T400-4 amplifier"],"rf-r1675x2":["Rockford Fosgate R1675X2"],
"rf-r169x2":["Rockford Fosgate R169X2"],"rf-p1692":["Rockford Fosgate P1692"],
"rf-pm282":["Rockford Fosgate PM282 marine speaker"],"rf-dsr1":["Rockford Fosgate DSR1 processor"],
"alpine-ilx-w670":["Alpine iLX-W670"],"alpine-ilx-507":["Alpine iLX-507"],
"alpine-ute-73bt":["Alpine UTE-73BT"],"alpine-s-s65":["Alpine S-S65 speaker"],
"alpine-s-s69":["Alpine S-S69 speaker"],"alpine-s-s65c":["Alpine S-S65C component"],
"alpine-s-w10d4":["Alpine S-W10D4 subwoofer"],"alpine-s-w12d4":["Alpine S-W12D4 subwoofer"],
"alpine-r-w12d4":["Alpine R-W12D4 subwoofer"],"alpine-s-a60m":["Alpine S-A60M amplifier"],
"alpine-s-a32f":["Alpine S-A32F amplifier"],"alpine-k-a450":["Alpine KTA-450 amplifier"],
"pioneer-dmh-w2770nex":["Pioneer DMH-W2770NEX"],"pioneer-avh-2550nex":["Pioneer AVH-2550NEX"],
"pioneer-mvh-s522bs":["Pioneer MVH-S522BS"],"pioneer-ts-a6991f":["Pioneer TS-A6991F"],
"pioneer-ts-a1681f":["Pioneer TS-A1681F"],"pioneer-ts-a301d4":["Pioneer TS-A301D4 subwoofer"],
"pioneer-ts-sw2502s4":["Pioneer TS-SW2502S4 shallow subwoofer"],"pioneer-gm-d9701":["Pioneer GM-D9701 amplifier"],
"pioneer-gm-d8704":["Pioneer GM-D8704 amplifier"],
"kenwood-dmx809s":["Kenwood DMX809S"],"kenwood-kdc-bt282u":["Kenwood KDC-BT282U"],
"kenwood-kmm-bt332u":["Kenwood KMM-BT332U"],"kenwood-kfc-6966s":["Kenwood KFC-6966S"],
"kenwood-kfc-1666s":["Kenwood KFC-1666S"],"kenwood-kfc-w3016ps":["Kenwood KFC-W3016PS subwoofer"],
"kenwood-x502-1":["Kenwood X502-1 amplifier"],"kenwood-x802-5":["Kenwood X802-5 amplifier"],
"gravity-gr-12pw":["Gravity 12 inch car subwoofer"],"gravity-gr-10pw":["Gravity 10 inch car subwoofer"],
"gravity-gr-2500-1d":["mono car amplifier 2500w class d"],"gravity-gr-800-4":["4 channel car amplifier"],
"gravity-gr-695":["6x9 car speakers pair"],"gravity-gr-654":["6.5 inch car speakers pair"],
"gravity-gr-din-bt":["single din car stereo bluetooth"],
"kicker-c12":["Kicker Comp C12 subwoofer"],"kicker-cwr122":["Kicker CompR CWR122 subwoofer"],
"kicker-46csc654":["Kicker 46CSC654"],"kicker-46cxa8001":["Kicker 46CXA800.1 amplifier"],
"kicker-43dcwr122":["Kicker DCWR122 loaded enclosure"],
"jl-12w0v3-4":["JL Audio 12W0v3 subwoofer"],"jl-10w3v3-4":["JL Audio 10W3v3 subwoofer"],
"jl-c1-650":["JL Audio C1-650 speaker"],"jl-jx500-1d":["JL Audio JX500/1D amplifier"],
"jl-cp112-w0v3":["JL Audio CP112-W0v3 enclosure"],
"box-single-12":["single 12 inch subwoofer box enclosure carpeted","12 subwoofer enclosure empty box"],
"box-dual-12":["dual 12 inch subwoofer box enclosure carpeted","dual 12 subwoofer enclosure empty"],
"box-single-10":["single 10 inch subwoofer box enclosure carpeted"],
"truck-single-12":["single 12 truck subwoofer box behind seat slim","truck sub box 12 inch"],
"truck-single-10":["single 10 truck subwoofer box under seat","truck sub box 10 inch"],
"truck-dual-10":["dual 10 truck subwoofer box crew cab","truck dual sub box"],
"truck-dual-12":["dual 12 truck subwoofer box crew cab downfire","truck dual 12 sub box"],
"truck-silverado-12":["silverado crew cab under seat sub box 12","silverado underseat subwoofer enclosure"],
"truck-f150-10":["f150 supercrew under seat sub box 10","ford f150 underseat subwoofer enclosure"],
};
async function ddgFetch(u){return fetch(u,{headers:{"User-Agent":UA,"Accept-Language":"en-US,en;q=0.9",Referer:"https://duckduckgo.com/"}});}
async function ddgImages(q){const pr=await ddgFetch(`https://duckduckgo.com/?q=${encodeURIComponent(q)}`);if(!pr.ok)throw new Error("page "+pr.status);const html=await pr.text();const m=html.match(/vqd="([^"]+)"/)||html.match(/vqd=([\d-]+)/);if(!m)throw new Error("no vqd");await sleep(350);const r=await ddgFetch(`https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(q)}&vqd=${encodeURIComponent(m[1])}&f=,,,&p=1`);if(!r.ok)throw new Error("ijs "+r.status);const d=await r.json();return (d.results||[]).filter(x=>x.image&&/\.(jpe?g|png)($|\?)/i.test(x.image)).filter(x=>!x.width||x.width>=380).map(x=>({murl:x.image,t:x.title||""}));}
let last=0;const okList=[],failList=[];
for(const[id,queries]of Object.entries(Q)){
  const dest=path.join(OUT,id+".jpg");if(fs.existsSync(dest)){okList.push(id);continue;}
  let done=false;
  for(const q of queries){
    try{
      const wait=Math.max(0,last+DELAY-Date.now());if(wait)await sleep(wait);last=Date.now();
      const results=await ddgImages(q);
      for(const res of results.slice(0,6)){
        try{const ir=await fetch(res.murl,{headers:{"User-Agent":UA,Referer:"https://duckduckgo.com/"}});if(!ir.ok)continue;const ct=ir.headers.get("content-type")||"";if(!/image\/(jpeg|jpg|png)/i.test(ct))continue;const buf=Buffer.from(await ir.arrayBuffer());if(buf.length<6000)continue;fs.writeFileSync(dest,buf);done=true;break;}catch(e){}
      }
      if(done)break;
    }catch(e){/* try next query */}
  }
  if(done){okList.push(id);console.log("OK",id);}else{failList.push(id);console.log("FAIL",id);}
}
fs.writeFileSync(new URL("../new-image-report.json",import.meta.url),JSON.stringify({ok:okList,fail:failList},null,2));
console.log("DONE ok="+okList.length+" fail="+failList.length);

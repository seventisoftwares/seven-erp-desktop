import { buildReferenceDanfeHtml, extractReferenceDanfeData } from "./nfe-danfe-reference.mjs";

const FIT_CSS = `<style>
.page{padding:4mm 6mm 4mm;font-size:5.8pt}
.receipt{height:14mm}.receipt-title{height:4.8mm;padding:.55mm .8mm;font-size:4.6pt}.receipt-sign{height:8.6mm}.receipt-sign>div{padding:.45mm .8mm}.receipt-nfe{padding:.6mm 1.5mm}.receipt-nfe b{font-size:7.5pt}.receipt-nfe strong{font-size:6pt}
.header{height:35.5mm;margin-top:1mm}.issuer{padding:.8mm 1.4mm}.issuer>span{font-size:6.3pt}.issuer h1{font-size:9pt;margin:.45mm 0 .1mm}.issuer h2{font-size:6.4pt;margin:0 0 .35mm}.issuer p{margin:.15mm 0;font-size:5pt}.danfe{padding:.7mm 1mm}.danfe h2{font-size:13pt;margin:0 0 .25mm}.danfe p{font-size:4.6pt;margin:.15mm 0}.danfe .flow{font-size:5.1pt;line-height:1.35;margin:.25mm 0}.danfe .flow b{top:1.4mm;padding:.4mm 1mm;font-size:8pt}.danfe strong{font-size:6.4pt;line-height:1.25}.barcode{height:14mm;padding:.8mm 1.2mm .55mm}.access-key{height:8.5mm;padding:.5mm 1mm}.access-key b{font-size:5.6pt;margin-top:.35mm}.access p{font-size:4.7pt;line-height:1.15;margin:.7mm 1mm}
.compact{margin-top:.65mm}.field{min-height:6.1mm;padding:.35mm .65mm}.field span,.access-key span,.additional span{font-size:4pt}.field b{font-size:5.7pt;line-height:1.08;margin-top:.2mm}.single-line{height:5.5mm;padding:.9mm 1.2mm;font-size:5.4pt}h3{font-size:5pt;margin:.75mm 0 -.15mm}
.products{min-height:77mm}.products th,.products td{padding:.32mm .28mm}.products th{font-size:3.75pt}.products td{font-size:4.45pt;height:5.8mm}.products td.desc b{font-size:4.8pt}.products td.desc small{font-size:4.05pt;margin-top:.2mm}.product-filler{min-height:28mm}
.additional{height:27mm}.additional>div{padding:.65mm .9mm}.additional p{font-size:4.75pt;line-height:1.15;margin:.45mm 0}.additional span{font-size:4.1pt}footer{font-size:4.4pt;margin-top:.55mm}footer b{font-size:6.2pt}
.watermark{font-size:27pt}
</style>`;

export { extractReferenceDanfeData };
export function buildReferenceDanfeFitHtml(options) {
  return buildReferenceDanfeHtml(options).replace("</head>", `${FIT_CSS}</head>`);
}

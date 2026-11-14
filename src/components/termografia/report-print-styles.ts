/** A4 geometry and typography taken from the customer-supplied November 2026 model. */
export const reportPrintStyles = `
@font-face{font-family:RadialReport;src:url('/termografia/fonts/open-sans-latin-400-normal.woff2') format('woff2');font-style:normal;font-weight:400;font-display:block}
@font-face{font-family:RadialReport;src:url('/termografia/fonts/open-sans-latin-600-normal.woff2') format('woff2');font-style:normal;font-weight:600;font-display:block}
@font-face{font-family:RadialReport;src:url('/termografia/fonts/open-sans-latin-700-normal.woff2') format('woff2');font-style:normal;font-weight:700;font-display:block}
.tr-document{font-family:RadialReport,'Open Sans',Arial,sans-serif;color:#202e3b;font-size:9pt;line-height:1.45;width:210mm;text-align:left}
.tr-document *{box-sizing:border-box}
.tr-sheet{--tr-photo-height:94mm;background:white;width:210mm;min-height:297mm;padding:8mm 12.7mm 6.5mm;display:flex;flex-direction:column;margin:0 0 7mm;box-shadow:0 2px 12px #152d4420;position:relative}
.tr-has-occurrences{--tr-photo-height:82mm}
.tr-header{height:17mm;flex-shrink:0;display:flex;align-items:flex-start;justify-content:space-between;gap:10mm}
.tr-header img{width:56mm;height:auto;max-height:15mm;object-fit:contain}
.tr-header>div{text-align:right;padding-top:1mm;max-width:115mm;color:#193247}
.tr-header strong{font-size:10.5pt;display:block;line-height:1.3}
.tr-header span{display:block;font-size:7.1pt;color:#52677d;margin-top:1mm}
.tr-content{flex:1;min-width:0}
.tr-kicker{margin:0 0 4mm!important;font-weight:700;text-transform:uppercase;font-size:7.5pt;color:#52677d;letter-spacing:.1pt}
.tr-title-row{display:flex;justify-content:space-between;align-items:center;gap:4mm;margin:0 0 5mm}
.tr-document h1,.tr-document h2,.tr-document h3,.tr-document p,.tr-document figure{padding:0}
.tr-document h2{font-size:21pt;line-height:1.24;letter-spacing:-.2pt;margin:0;font-weight:700}
.tr-title-row:has(.tr-status) h2{font-size:19pt}
.tr-status{font-size:7.5pt;font-weight:700;text-transform:uppercase;max-width:57mm;text-align:right;line-height:1.3;color:#53667a}
.tr-document h3{font-size:9pt;font-weight:700;text-transform:uppercase;color:#193247;margin:9mm 0 3mm}
.tr-document p{margin:0 0 6mm;overflow-wrap:anywhere}
.tr-document strong{font-weight:700}
.tr-danger-text{color:#b33321!important}
.tr-subtitle{font-size:9pt;color:#52677d;margin-top:-2mm!important;margin-bottom:5.5mm!important}
.tr-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8.8pt;margin:0 0 7mm}
.tr-table th,.tr-table td{border:1px solid #ccd8e4;padding:3mm 2.5mm;vertical-align:middle;overflow-wrap:anywhere;font-weight:400;text-align:left}
.tr-table th{font-weight:700}
.tr-table thead th{background:#193247;color:white;font-size:7.5pt;text-transform:uppercase}
.tr-table tbody tr:nth-child(odd){background:#f1f4f7}
.tr-data th{width:30%;text-transform:uppercase;font-size:8pt;background:#f1f4f7;font-weight:400}
.tr-data td{background:transparent}
.tr-footer{flex-shrink:0;min-height:12mm;border-top:1px solid #ccd8e4;margin-top:7mm;padding-top:3mm;display:flex;justify-content:space-between;align-items:flex-start;color:#193247;font-size:7pt;gap:5mm}
.tr-footer>div>span{display:block;font-size:6.5pt;color:#52677d;margin-top:1mm}
.tr-footer>span{white-space:nowrap}
.tr-cover .tr-header{height:46mm;padding-top:7mm}
.tr-cover .tr-header img{width:84mm;max-height:23mm}
.tr-cover .tr-kicker{font-size:11pt;margin-bottom:6mm!important}
.tr-cover h1{font-size:37pt;line-height:1.1;margin:0 0 7mm;letter-spacing:-.25pt;font-weight:700}
.tr-cover-client{font-size:24pt!important;color:#193247;margin:0 0 3mm!important;max-width:180mm}
.tr-cover-subtitle{font-size:13pt;color:#52677d;margin-bottom:16mm!important}
.tr-cover .tr-table{font-size:9.5pt}
.tr-cover .tr-table th{width:23%;font-size:9.5pt}
.tr-cover .tr-table td,.tr-cover .tr-table th{padding:2.6mm 2.4mm}
.tr-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;margin-top:27mm}
.tr-metrics strong{display:block;font-size:29pt;line-height:1.1;color:#193247}
.tr-metrics span{display:block;font-size:9pt;color:#52677d;margin-top:3mm}
.tr-cover-note{font-size:9pt;color:#52677d;margin-top:11mm!important}
.tr-cover .tr-footer{margin-top:6mm}
.tr-index{margin:8mm 0 14mm}
.tr-index>div{display:grid;grid-template-columns:11mm 1fr 22mm;gap:3mm;border-bottom:1px solid #ccd8e4;padding:4mm 0;font-size:10.5pt;align-items:baseline}
.tr-index>div>span:first-child{color:#52677d}
.tr-index>div>span:last-child{text-align:right;color:#193247}
.tr-summary-occurrences th:first-child{width:10%}.tr-summary-occurrences th:nth-child(2){width:57%}.tr-summary-occurrences th:nth-child(3){width:17%}
.tr-summary-occurrences td{font-size:8pt;padding:2.4mm}
.tr-notice{border-left:3px solid #b87d27;padding:3mm 4mm!important;background:#fff7e7;font-size:8.5pt}
.tr-relation{font-size:7.5pt;margin-bottom:3.5mm}
.tr-relation th,.tr-relation td{padding:2mm 2mm;height:7.8mm;line-height:1.25}
.tr-relation th{font-size:6.8pt!important;height:12mm}
.tr-relation th:first-child{white-space:nowrap;padding-left:1mm;padding-right:1mm}
.tr-relation th:nth-child(n+4),.tr-relation td:nth-child(n+4),.tr-relation td:first-child{text-align:center}
.tr-file-code{display:inline}.tr-file-code+.tr-file-code:before{content:', '}
.tr-table tr.tr-occurrence-row{background:#fff0e9;color:#8e2d20}
.tr-occurrence-row>td:first-child{border-left:3px solid #b33321}
.tr-occurrence-cell strong{display:inline-block;min-width:6mm;padding:.5mm 1mm;border-radius:1mm}
.tr-occurrence-row .tr-occurrence-cell strong{background:#b33321;color:white}
.tr-legend{font-size:8pt!important;color:#52677d;margin:3mm 0!important}
.tr-inspection{margin:0 0 2mm;font-size:8.5pt}
.tr-inspection col:nth-child(odd){width:26%}.tr-inspection col:nth-child(even){width:24%}
.tr-inspection th{font-size:7pt;text-transform:uppercase;background:#f1f4f7;color:#52677d}
.tr-inspection td{background:white}
.tr-inspection td,.tr-inspection th{height:11mm;padding:2mm;line-height:1.25}
.tr-inspection-reason{font-size:8pt;margin:2mm 0!important}
.tr-photo-pair{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:4.5mm}
.tr-photo-pair figure{margin:0;min-width:0}
.tr-photo-pair figcaption{text-align:center;font-size:8pt;font-weight:700;text-transform:uppercase;color:#193247;height:5.5mm}
.tr-photo-frame{height:calc(var(--tr-photo-height) + .5mm);display:flex;align-items:center;justify-content:center;background:#f1f4f7;border:1px solid #ccd8e4;overflow:hidden}
.tr-photo-image{position:relative;flex-shrink:1;line-height:0}
.tr-photo-image>img{display:block;width:100%;height:auto;max-width:100%}
.tr-annotations{position:absolute;inset:0;width:100%;height:100%}
.tr-photo-empty{color:#52677d;font-size:9pt}
.tr-filename{margin:1.2mm 0 0!important;text-align:center;font-size:6.5pt;color:#52677d;line-height:1.25;min-height:5mm;overflow-wrap:anywhere}
.tr-action h3{font-size:8pt;margin:2mm 0 2mm}
.tr-action p{font-size:9pt;line-height:1.35;margin:0 0 3mm}
.tr-maintenance{border:1px solid #ccd8e4;font-size:6.8pt;color:#52677d}
.tr-maintenance>div{min-height:9mm;border-bottom:1px solid #ccd8e4;display:grid;grid-template-columns:26% 1fr}
.tr-maintenance>div:last-child{border-bottom-color:transparent}
.tr-maintenance strong{background:#f1f4f7;border-right:1px solid #ccd8e4;padding:2mm;text-transform:uppercase;font-weight:700;display:flex;align-items:center}
.tr-maintenance .tr-two-fields{grid-template-columns:26% 24% 26% 24%}
.tr-maintenance .tr-two-fields>strong:nth-child(3){border-left:1px solid #ccd8e4}
.tr-has-occurrences .tr-maintenance>div{min-height:8mm}
.tr-occurrence-notes{font-size:8pt;line-height:1.3;margin:1mm 0 3mm}
.tr-occurrence-description{margin-bottom:2mm;border-left:2px solid #b33321;padding-left:2mm}
.tr-occurrence-description strong{color:#a52c1b;margin-right:2mm}
.tr-occurrence-description span+span:before{content:' · ';white-space:normal}
.tr-occurrence-description span{white-space:pre-wrap;overflow-wrap:anywhere}
.tr-detail{background:#fff6f1;border:1px solid #e1bfb1;padding:5mm;margin-top:6mm}
.tr-detail h3{margin:0 0 4mm;color:#a52c1b}
.tr-detail p{white-space:pre-wrap;font-size:9pt;margin:0}
.tr-action-card{border:1px solid #ccd8e4;padding:4mm;margin:6mm 0}
.tr-action-card h3{font-size:9pt;margin:0 0 4mm}
.tr-action-card p{font-size:8.5pt;margin-bottom:3mm}
.tr-action-card>div{border-top:1px solid #ccd8e4;min-height:12mm;font-size:8pt;padding-top:2mm;color:#52677d}
.tr-reference-temperatures{font-size:8pt}
.tr-reference-temperatures td,.tr-reference-temperatures th{padding:2.2mm}
.tr-reference-temperatures th:first-child{width:34%}.tr-reference-temperatures th:last-child{width:12%}
.tr-reference-temperatures td:last-child{text-align:center}
.tr-signature{width:125mm;max-width:100%;margin:25mm auto 0;text-align:center;break-inside:avoid}
.tr-signature .tr-signature-hint{font-size:8pt;color:#52677d;margin:0}
.tr-signature-space{height:40mm;border-bottom:1px solid #52677d;margin-bottom:4mm}
.tr-signature>strong{font-size:12pt;color:#193247}
.tr-signature>p{margin:1.5mm 0;font-size:10pt}
.tr-signature .tr-signature-company{margin-top:4mm;color:#52677d}
@media print{
 @page{size:A4;margin:0}
 html,body{margin:0!important;padding:0!important;background:white!important}
 .field-report-print{background:white!important;padding:0!important}
 .tr-preview{padding:0!important;overflow:visible!important}
 .tr-document{zoom:1!important;margin:0!important}
 .tr-document,.tr-document *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
 .tr-sheet{box-shadow:none;margin:0;break-after:page;min-height:297mm}
 .tr-sheet:last-child{break-after:auto}
 .tr-header,.tr-footer,.tr-photo-pair,.tr-maintenance,.tr-table tr{break-inside:avoid}
 .tr-table thead{display:table-header-group}
 .tr-title-row,h3{break-after:avoid}
}
`;

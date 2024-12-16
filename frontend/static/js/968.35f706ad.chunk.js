"use strict";(self.webpackChunkerp=self.webpackChunkerp||[]).push([[968],{13724:(e,l,a)=>{a.d(l,{A:()=>M,c:()=>E});var t=a(69060),n=a(93996),o=a(14696),r=a(13224),i=a(27454),s=a(700),c=a(5548),d=a(3358),u=a(66931),m=a(89500),p=a(99904),v=a(85624),x=a(33856),h=a(58612),g=a(53248),b=a(29504),f=a(5930),j=a(39308),C=a(41459),_=a(46864),N=a(4284),y=a(76491),F=a(10728),w=a(49608),S=a(28064),D=(a(37692),a(35832)),k=a(82496);const B=(e,l)=>e.map((e=>{const a={};return l.forEach(((l,t)=>{if(l.isVisible||l.Defult_Display)if(l.isCustomCell&&l.Cell){const n=l.Cell({row:e}),o=l.ColumnHeader?String(l.ColumnHeader).replace(/\s+/g,"_").toLowerCase():"field_".concat(t+1);"string"!==typeof n&&"number"!==typeof n&&"bigint"!==typeof n||(a[o]=n)}else{let t=l.Field_Name;a[t]=e[t]||""}})),a})),M=function(){let e=arguments.length>2&&void 0!==arguments[2]?arguments[2]:"";return{isVisible:1,Field_Name:arguments.length>0&&void 0!==arguments[0]?arguments[0]:"",Fied_Data:arguments.length>1&&void 0!==arguments[1]?arguments[1]:"string",align:arguments.length>3&&void 0!==arguments[3]?arguments[3]:"left",verticalAlign:arguments.length>4&&void 0!==arguments[4]?arguments[4]:"center",...e&&{ColumnHeader:e}}},P=e=>{let{dataArray:l=[],columns:a=[],onClickFun:M=null,isExpendable:P=!1,expandableComp:E=null,tableMaxHeight:A=550,initialPageCount:H=20,EnableSerialNumber:T=!1,CellSize:V="small",disablePagination:G=!1,title:z="",PDFPrintOption:O=!1,ExcelPrintOption:Q=!1,maxHeightOption:L=!1,ButtonArea:R=null,MenuButtons:I=[]}=e;const[W,q]=(0,t.useState)(0),[$,X]=(0,t.useState)(H),[J,K]=(0,t.useState)([]),[U,Y]=(0,t.useState)(!0),Z=U&&L?" max-content ":A,ee=[{type:"left",class:"text-start"},{type:"right",class:"text-end"},{type:"center",class:"text-center"}],le=[{type:"top",class:" vtop "},{type:"bottom",class:" vbottom "},{type:"center",class:" vctr "}],ae=(e=>{if(!J.length)return e;return[...e].sort(((e,l)=>{for(const a of J){const{columnId:t,direction:n}=a,o=e[t],r=l[t];if(o!==r)return"asc"===n?o>r?1:-1:o<r?1:-1}return 0}))})(l),te=W*$,ne=te+$,oe=ae.slice(te,ne),re=(e,l)=>{switch(l){case"number":return(0,j.SA)(e);case"date":return(0,j.uy)(e);case"time":return(0,j.AX)(e);case"string":return e;default:return""}},ie=e=>{let{row:l,index:n}=e;const[o,r]=(0,t.useState)(!1),d="20px";return(0,k.jsxs)(t.Fragment,{children:[(0,k.jsxs)(i.c,{children:[!0===P&&E&&(0,k.jsx)(s.c,{className:"fa-13 border-end text-center vtop",children:(0,k.jsx)(c.c,{size:"small",onClick:()=>r((e=>!e)),children:o?(0,k.jsx)(C.c,{sx:{fontSize:d}}):(0,k.jsx)(_.c,{sx:{fontSize:d}})})}),!0===T&&(0,k.jsx)(s.c,{className:"fa-13 border-end text-center vtop",children:$*W+n+1}),null===a||void 0===a?void 0:a.map(((e,a)=>{var t,n;return((0,j.Qr)(null===e||void 0===e?void 0:e.Defult_Display,1)||(0,j.Qr)(null===e||void 0===e?void 0:e.isVisible,1))&&(!1!==Boolean(null===e||void 0===e?void 0:e.isCustomCell)&&e.Cell?(0,k.jsx)(s.c,{className:"fa-13 border-end "+(e.align?null===(t=ee.find((l=>l.type===String(e.align).toLowerCase())))||void 0===t?void 0:t.class:"")+(e.verticalAlign?null===(n=le.find((l=>l.type===String(e.verticalAlign).toLowerCase())))||void 0===n?void 0:n.class:" vctr "),children:e.Cell({row:l,Field_Name:e.Field_Name})},a):Object.entries(l).map((t=>{var n,o;let[r,i]=t;return e.Field_Name===r&&((0,j.Qr)(null===e||void 0===e?void 0:e.Defult_Display,1)||(0,j.Qr)(null===e||void 0===e?void 0:e.isVisible,1))&&(0,k.jsx)(s.c,{className:"fa-13 border-end "+(e.align?null===(n=ee.find((l=>l.type===String(e.align).toLowerCase())))||void 0===n?void 0:n.class:"")+(e.verticalAlign?null===(o=le.find((l=>l.type===String(e.verticalAlign).toLowerCase())))||void 0===o?void 0:o.class:" vctr "),onClick:()=>M?M(l):console.log("Function not supplied"),children:re(i,null===e||void 0===e?void 0:e.Fied_Data)},a)})))}))]}),!0===P&&E&&o&&(0,k.jsx)(i.c,{children:(0,k.jsx)(s.c,{colSpan:Number(null===a||void 0===a?void 0:a.length)+(!0===T?2:1),children:E({row:l,index:n})})})]})},se=()=>{const[e,i]=(0,t.useState)(null),s=Boolean(e);return(0,k.jsxs)(k.Fragment,{children:[(0,k.jsx)(d.c,{title:"Export options and more...",children:(0,k.jsx)(c.c,{"aria-describedby":s,onClick:e=>{i(e.currentTarget)},className:"ms-2",size:"small",children:(0,k.jsx)(N.c,{})})}),(0,k.jsx)(u.cp,{open:s,anchorEl:e,onClose:()=>{i(null)},anchorOrigin:{vertical:"bottom",horizontal:"left"},transformOrigin:{vertical:"top",horizontal:"left"},children:(0,k.jsxs)(m.c,{children:[L&&(0,k.jsxs)(n.c,{onClick:()=>Y((e=>!e)),disabled:(0,j.Qr)(null===l||void 0===l?void 0:l.length,0),children:[(0,k.jsx)(o.c,{children:U?(0,k.jsx)(y.c,{fontSize:"small",color:"primary"}):(0,k.jsx)(F.c,{fontSize:"small"})}),(0,k.jsx)(r.c,{color:U?"success":"",children:"Max Height"})]}),O&&(0,k.jsxs)(n.c,{onClick:()=>((e,l)=>{try{const a=new S.default,t=B(e,l),n=l.filter((e=>e.isVisible||e.Defult_Display)).map((e=>e.Field_Name||String(e.ColumnHeader).replace(/\s+/g,"_").toLowerCase())),o=t.map((e=>n.map((l=>e[l])))).map(((e,l)=>({...e,Sno:l+1})));a.autoTable({head:[n],body:o}),a.save("table.pdf")}catch(a){console.error(a)}})(l,a),disabled:(0,j.Qr)(null===l||void 0===l?void 0:l.length,0),children:[(0,k.jsx)(o.c,{children:(0,k.jsx)(w.c,{fontSize:"small",color:"primary"})}),(0,k.jsx)(r.c,{children:"Download PDF"})]}),Q&&(0,k.jsxs)(n.c,{onClick:()=>((e,l)=>{try{const a=B(e,l),t=D.c$.json_to_sheet(a),n=D.c$.book_new();D.c$.book_append_sheet(n,t,"Data"),D.a8(n,"table.xlsx")}catch(a){console.error(a)}})(l,a),disabled:(0,j.Qr)(null===l||void 0===l?void 0:l.length,0),children:[(0,k.jsx)(o.c,{children:(0,k.jsx)(w.c,{fontSize:"small",color:"primary"})}),(0,k.jsx)(r.c,{children:"Download Excel"})]}),I.map((e=>function(e,l,a){let t=arguments.length>3&&void 0!==arguments[3]&&arguments[3];return(0,k.jsxs)(n.c,{onClick:a,disabled:t,children:[(0,k.jsx)(o.c,{children:l}),(0,k.jsx)(r.c,{children:e})]})}(e.name,e.icon,e.onclick,e.disabled)))]})})]})};return(0,k.jsxs)("div",{className:"rounded-3 bg-white overflow-hidden",children:[(0,k.jsxs)("div",{className:"d-flex align-items-center flex-wrap px-3 py-2 flex-row-reverse ",children:[(O||Q||I.length>0||L)&&(0,k.jsx)(se,{}),R&&R,z&&(0,k.jsx)("h6",{className:"fw-bold text-muted flex-grow-1 m-0",children:z})]}),(0,k.jsx)(p.c,{component:v.c,sx:{maxHeight:Z},children:(0,k.jsxs)(x.c,{stickyHeader:!0,size:V,children:[(0,k.jsx)(h.c,{children:(0,k.jsxs)(i.c,{children:[P&&E&&(0,k.jsx)(s.c,{className:"fa-13 fw-bold border-end border-top text-center",style:{backgroundColor:"#EDF0F7"},children:"#"}),T&&(0,k.jsx)(s.c,{className:"fa-13 fw-bold border-end border-top text-center",style:{backgroundColor:"#EDF0F7"},children:"SNo"}),a.map(((e,l)=>{const a=(0,j.Qr)(null===e||void 0===e?void 0:e.Defult_Display,1)||(0,j.Qr)(null===e||void 0===e?void 0:e.isVisible,1),t=!1===Boolean(null===e||void 0===e?void 0:e.isCustomCell)||!e.Cell,n=J.find((l=>l.columnId===e.Field_Name)),o=n?n.direction:"asc";var r,i,c,d;return a?t?(0,k.jsx)(s.c,{className:"fa-13 fw-bold border-end border-top "+(e.align?null===(r=ee.find((l=>l.type===String(e.align).toLowerCase())))||void 0===r?void 0:r.class:""),style:{backgroundColor:"#EDF0F7"},sortDirection:!!n&&o,children:(0,k.jsx)(g.c,{active:!!n,direction:o,onClick:()=>(e=>{const l=J.find((l=>l.columnId===e));if(l){const a="asc"===l.direction;K(J.map((l=>l.columnId===e?{...l,direction:a?"desc":"asc"}:l)))}else K([...J,{columnId:e,direction:"asc"}])})(e.Field_Name),children:e.ColumnHeader||(null===e||void 0===e||null===(i=e.Field_Name)||void 0===i?void 0:i.replace(/_/g," "))})},l):(0,k.jsx)(s.c,{className:"".concat(e.ColumnHeader||null!==e&&void 0!==e&&e.Field_Name?" fa-13 fw-bold border-end border-top p-2 appFont ":" p-0 "," ")+(e.align?null===(c=ee.find((l=>l.type===String(e.align).toLowerCase())))||void 0===c?void 0:c.class:""),style:{backgroundColor:"#EDF0F7"},children:e.ColumnHeader||(null===e||void 0===e||null===(d=e.Field_Name)||void 0===d?void 0:d.replace(/_/g," "))},l):null}))]})}),(0,k.jsxs)(b.c,{children:[(G?ae:oe).map(((e,l)=>(0,k.jsx)(ie,{row:e,index:l},l))),0===l.length&&(0,k.jsx)(i.c,{children:(0,k.jsx)(s.c,{colSpan:a.length+(!0===P&&E?1:0)+(!0===T?1:0),sx:{textAlign:"center"},children:"No Data"})})]})]})}),!G&&0!==oe.length&&(0,k.jsx)("div",{className:"p-2 pb-0",children:(0,k.jsx)(f.c,{component:"div",count:l.length,page:W,onPageChange:(e,l)=>{q(l)},rowsPerPage:$,onRowsPerPageChange:e=>{X(parseInt(e.target.value,10)),q(0)},rowsPerPageOptions:Array.from(new Set([H,5,20,50,100,200,500])).sort(((e,l)=>e-l)),labelRowsPerPage:"Rows per page",showFirstButton:!0,showLastButton:!0})})]})};P.defaultProps={dataArray:[],columns:[],onClickFun:null,isExpendable:!1,expandableComp:null,tableMaxHeight:550,initialPageCount:20,EnableSerialNumber:!1,CellSize:"small",disablePagination:!1,title:void 0,PDFPrintOption:!1,ExcelPrintOption:!1,maxHeightOption:!1,ButtonArea:null,MenuButtons:[]};const E=P},88808:(e,l,a)=>{a.r(l),a.d(l,{default:()=>B});var t=a(69060),n=a(1908),o=a(39308),r=a(13724),i=a(71448),s=a(52924),c=a(44380),d=a(43692),u=a(3358),m=a(5548),p=a(84436),v=a(12572),x=a(15786),h=a(82656),g=a(4488),b=a(90048),f=a(89e3),j=a(18256),C=a(29720),_=a(61584),N=a(68424),y=a(39504),F=a(61988),w=a(74912),S=a(82496);const D=(0,S.jsx)(N.c,{fontSize:"small"}),k=(0,S.jsx)(y.c,{fontSize:"small"}),B=e=>{let{loadingOn:l,loadingOff:a}=e;const[N,y]=(0,t.useState)([]),[B,M]=(0,t.useState)([]),[P,E]=(0,t.useState)({Fromdata:(0,o.SO)(7),Todate:(0,o.Q7)(),view:"Grouped"}),[A,H]=(0,t.useState)({}),[T,V]=(0,t.useState)(!1),[G,z]=(0,t.useState)(N),O=[{Field_Name:"Stock_Group",Fied_Data:"string",isVisible:1},{Field_Name:"Grade_Item_Group",Fied_Data:"string",isVisible:1},{Field_Name:"Group_Name",Fied_Data:"string",isVisible:1},{Field_Name:"stock_item_name",Fied_Data:"string",isVisible:1},{Field_Name:"godown_name",Fied_Data:"string",isVisible:1},..."List"===P.view?[{Field_Name:"Act_Bags",Fied_Data:"number",ColumnHeader:"Bags",isVisible:1},{Field_Name:"Bal_Act_Qty",Fied_Data:"number",ColumnHeader:"Balance Quantity",isVisible:1}]:[]];(0,t.useEffect)((()=>{L()}),[A]),(0,t.useEffect)((()=>H({})),[P.view]);const Q=(e,l)=>{H((a=>({...a,[e]:l})))},L=()=>{let e=[...N];for(const a of O)if(A[a.Field_Name])if("range"===A[a.Field_Name].type){const{min:l,max:t}=A[a.Field_Name];e=e.filter((e=>{const n=e[a.Field_Name];return(void 0===l||n>=l)&&(void 0===t||n<=t)}))}else if("date"===A[a.Field_Name].type){const{start:l,end:t}=A[a.Field_Name].value;e=e.filter((e=>{const n=new Date(e[a.Field_Name]);return(void 0===l||n>=new Date(l))&&(void 0===t||n<=new Date(t))}))}else if(Array.isArray(A[a.Field_Name])){var l;e=(null===(l=A[a.Field_Name])||void 0===l?void 0:l.length)>0?e.filter((e=>{var l;return A[a.Field_Name].includes(null===(l=e[a.Field_Name])||void 0===l?void 0:l.toLowerCase().trim())})):e}z(e)},R=e=>{const{Field_Name:l,Fied_Data:a}=e;var t,n,o,r,d,u,m,p,v,x;if("number"===a)return(0,S.jsxs)("div",{className:"d-flex justify-content-between px-2",children:[(0,S.jsx)("input",{placeholder:"Min",type:"number",className:"bg-light border-0 m-1 p-1 w-50",value:null!==(t=null===(n=A[l])||void 0===n?void 0:n.min)&&void 0!==t?t:"",onChange:e=>Q(l,{type:"range",...A[l],min:e.target.value?parseFloat(e.target.value):void 0})}),(0,S.jsx)("input",{placeholder:"Max",type:"number",className:"bg-light border-0 m-1 p-1 w-50",value:null!==(o=null===(r=A[l])||void 0===r?void 0:r.max)&&void 0!==o?o:"",onChange:e=>Q(l,{type:"range",...A[l],max:e.target.value?parseFloat(e.target.value):void 0})})]});if("date"===a)return(0,S.jsxs)("div",{className:"d-flex justify-content-between px-2",children:[(0,S.jsx)("input",{placeholder:"Start Date",type:"date",className:"bg-light border-0 m-1 p-1 w-50",value:null!==(d=null===(u=A[l])||void 0===u||null===(m=u.value)||void 0===m?void 0:m.start)&&void 0!==d?d:"",onChange:e=>{var a;return Q(l,{type:"date",value:{...null===(a=A[l])||void 0===a?void 0:a.value,start:e.target.value||void 0}})}}),(0,S.jsx)("input",{placeholder:"End Date",type:"date",className:"bg-light border-0 m-1 p-1 w-50",value:null!==(p=null===(v=A[l])||void 0===v||null===(x=v.value)||void 0===x?void 0:x.end)&&void 0!==p?p:"",onChange:e=>{var a;return Q(l,{type:"date",value:{...null===(a=A[l])||void 0===a?void 0:a.value,end:e.target.value||void 0}})}})]});if("string"===a){const e=[...new Set(N.map((e=>{var a,t;return null===(a=e[l])||void 0===a||null===(t=a.toLowerCase())||void 0===t?void 0:t.trim()})))];return(0,S.jsx)(i.c,{multiple:!0,id:"".concat(l,"-filter"),options:e,disableCloseOnSelect:!0,getOptionLabel:e=>e,value:A[l]||[],onChange:(e,a)=>Q(l,a),renderOption:(e,l,a)=>{let{selected:t}=a;return(0,S.jsxs)("li",{...e,children:[(0,S.jsx)(s.c,{icon:D,checkedIcon:k,style:{marginRight:8},checked:t}),l]})},isOptionEqualToValue:(e,l)=>e===l,renderInput:e=>(0,S.jsx)(c.c,{...e,label:l,placeholder:"Select ".concat(null===l||void 0===l?void 0:l.replace(/_/g," "))})})}};(0,t.useEffect)((()=>{l&&l(),(0,n.q)({address:"reports/liveStockReport?Fromdata=".concat(P.Fromdata,"&Todate=").concat(P.Todate)}).then((e=>{e.success&&y(e.data)})).catch((e=>console.error(e))).finally((()=>{a&&a()}))}),[P.Fromdata,P.Todate]),(0,t.useEffect)((()=>{(async()=>{try{const e=Object.keys(A).length>0?G:N;l&&await l();const a=(0,o.ui)(e,"Stock_Group"),t=null===a||void 0===a?void 0:a.sort(((e,l)=>{var a;return String(e.Stock_Group).localeCompare(null!==(a=l.Stock_Group)&&void 0!==a?a:"")})).map((e=>({...e,BagsTotal:(0,o.SW)(e.groupedData,"Act_Bags"),BalQtyTotal:(0,o.SW)(e.groupedData,"Bal_Act_Qty")}))),n=(null===t||void 0===t?void 0:t.map((e=>({...e,groupedData:(0,o.ui)(null===e||void 0===e?void 0:e.groupedData,"Grade_Item_Group")})))).map((e=>{var l;return{...e,groupedData:null===(l=e.groupedData)||void 0===l?void 0:l.map((e=>({...e,BagsTotal:(0,o.SW)(e.groupedData,"Act_Bags"),BalQtyTotal:(0,o.SW)(e.groupedData,"Bal_Act_Qty")})))}})),r=n.map((e=>{var l;return{...e,groupedData:null===(l=e.groupedData)||void 0===l?void 0:l.map((e=>({...e,groupedData:(0,o.ui)(null===e||void 0===e?void 0:e.groupedData,"Group_Name")})))}})).map((e=>{var l;return{...e,groupedData:null===(l=e.groupedData)||void 0===l?void 0:l.map((e=>{var l;return{...e,groupedData:null===e||void 0===e||null===(l=e.groupedData)||void 0===l?void 0:l.map((e=>({...e,BagsTotal:(0,o.SW)(e.groupedData,"Act_Bags"),BalQtyTotal:(0,o.SW)(e.groupedData,"Bal_Act_Qty")})))}}))}}));setTimeout((()=>M(r)),500)}catch(e){console.error(e)}finally{a&&setTimeout((()=>a()),500)}})()}),[N,A,G]);const I=e=>[{Field_Name:e,isVisible:1,Fied_Data:"string"},{Field_Name:"BagsTotal",ColumnHeader:"Bags",isVisible:1,Fied_Data:"number"},{Field_Name:"BalQtyTotal",ColumnHeader:"Balance Quantity",isVisible:1,Fied_Data:"number"}];return(0,S.jsxs)(S.Fragment,{children:[(0,S.jsxs)(d.c,{children:[(0,S.jsxs)("div",{className:"p-1 d-flex justify-content-between align-items-center flex-wrap border-bottom",children:[(0,S.jsx)("h5",{className:"ps-2 pt-2",children:"Live Stock Report"}),(0,S.jsxs)("span",{children:[(0,S.jsx)("input",{type:"date",value:P.Fromdata,className:"cus-inpt w-auto p-1",onChange:e=>E((l=>({...l,Fromdata:e.target.value})))})," - TO -",(0,S.jsx)("input",{type:"date",value:P.Todate,className:"cus-inpt w-auto p-1",onChange:e=>E((l=>({...l,Todate:e.target.value})))}),(0,S.jsx)(u.c,{title:"Filters",children:(0,S.jsx)(m.c,{onClick:()=>V(!0),size:"small",className:"d-md-none d-inline",children:(0,S.jsx)(F.c,{})})})]})]}),(0,S.jsx)(p.c,{children:(0,S.jsxs)("div",{className:"row",children:[(0,S.jsx)("div",{className:"col-xxl-10 col-lg-9 col-md-8",children:(0,S.jsxs)(j.cp,{value:P.view,children:[(0,S.jsx)(v.c,{sx:{borderBottom:1,borderColor:"divider"},children:(0,S.jsxs)(C.c,{indicatorColor:"transparant",onChange:(e,l)=>E((e=>({...e,view:l}))),variant:"scrollable",scrollButtons:"auto",allowScrollButtonsMobile:!0,children:[(0,S.jsx)(x.c,{sx:"Grouped"===P.view?{backgroundColor:"#c6d7eb"}:{},label:"Grouped",value:"Grouped"}),(0,S.jsx)(x.c,{sx:"List"===P.view?{backgroundColor:"#c6d7eb"}:{},label:"List",value:"List"})]})}),(0,S.jsx)(_.c,{value:"Grouped",sx:{px:0,py:2},children:(0,S.jsx)(r.c,{dataArray:B,title:"Stock Group",columns:I("Stock_Group"),isExpendable:!0,EnableSerialNumber:!0,expandableComp:e=>{let{row:l}=e;return(0,S.jsx)(r.c,{dataArray:l.groupedData,title:"Grade Item Group",columns:I("Grade_Item_Group"),isExpendable:!0,EnableSerialNumber:!0,expandableComp:e=>{let{row:l}=e;return(0,S.jsx)(r.c,{dataArray:l.groupedData,title:"Group Name",columns:I("Group_Name"),isExpendable:!0,EnableSerialNumber:!0,expandableComp:e=>{let{row:l}=e;return(0,S.jsx)(r.c,{dataArray:l.groupedData,title:"Stock Item Name",columns:[{Field_Name:"stock_item_name",ColumnHeader:"Stock Item Name",Fied_Data:"string",isVisible:1},{Field_Name:"Bags",Fied_Data:"number",isVisible:1},{Field_Name:"Bal_Act_Qty",ColumnHeader:"Balance Quantity",Fied_Data:"number",isVisible:1},{Field_Name:"godown_name",ColumnHeader:"Godown",Fied_Data:"string",isVisible:1}],EnableSerialNumber:!0,tableMaxHeight:2e3,disablePagination:!0})},tableMaxHeight:3e3,disablePagination:!0})},tableMaxHeight:4e3,disablePagination:!0})},tableMaxHeight:5e3,disablePagination:!0})}),(0,S.jsx)(_.c,{value:"List",sx:{px:0,py:2},children:(0,S.jsx)(r.c,{dataArray:Object.keys(A).length>0?G:N,columns:O})})]})}),(0,S.jsxs)("div",{className:"col-xxl-2 col-lg-3 col-md-4 d-none d-md-block",children:[(0,S.jsxs)("h5",{className:"d-flex justify-content-between px-2",children:[(0,S.jsx)("span",{children:"Filters"}),(0,S.jsx)("span",{children:(0,S.jsx)(u.c,{title:"Clear Filters",children:(0,S.jsx)(m.c,{size:"small",onClick:()=>H({}),children:(0,S.jsx)(w.c,{})})})})]}),(0,S.jsxs)("div",{className:"border rounded-3 ",children:[O.map(((e,l)=>{var a;return(0,S.jsxs)("div",{className:"py-3 px-3 hov-bg border-bottom",children:[(0,S.jsx)("label",{className:"mt-2 mb-1",children:null===e||void 0===e||null===(a=e.Field_Name)||void 0===a?void 0:a.replace(/_/g," ")}),R(e)]},l)})),(0,S.jsx)("br",{})]})]})]})})]}),(0,S.jsxs)(h.c,{open:T,onClose:()=>V(!1),maxWidth:"sm",fullWidth:!0,children:[(0,S.jsxs)(g.c,{children:[(0,S.jsxs)("h5",{className:"d-flex justify-content-between px-2",children:[(0,S.jsx)("span",{children:"Filters"}),(0,S.jsx)("span",{children:(0,S.jsx)(u.c,{title:"Clear Filters",children:(0,S.jsx)(m.c,{size:"small",onClick:()=>H({}),children:(0,S.jsx)(w.c,{})})})})]}),(0,S.jsxs)("div",{className:"border rounded-3 ",children:[O.map(((e,l)=>{var a;return(0,S.jsxs)("div",{className:"py-3 px-3 hov-bg border-bottom",children:[(0,S.jsx)("label",{className:"mt-2 mb-1",children:null===e||void 0===e||null===(a=e.Field_Name)||void 0===a?void 0:a.replace(/_/g," ")}),R(e)]},l)})),(0,S.jsx)("br",{})]})]}),(0,S.jsx)(b.c,{children:(0,S.jsx)(f.c,{onClick:()=>V(!1),color:"error",children:"close"})})]})]})}},39504:(e,l,a)=>{a.d(l,{c:()=>o});var t=a(27664),n=a(82496);const o=(0,t.c)((0,n.jsx)("path",{d:"M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2m-9 14-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8z"}),"CheckBox")},68424:(e,l,a)=>{a.d(l,{c:()=>o});var t=a(27664),n=a(82496);const o=(0,t.c)((0,n.jsx)("path",{d:"M19 5v14H5V5zm0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2"}),"CheckBoxOutlineBlank")},61988:(e,l,a)=>{a.d(l,{c:()=>o});var t=a(27664),n=a(82496);const o=(0,t.c)((0,n.jsx)("path",{d:"M4.25 5.61C6.27 8.2 10 13 10 13v6c0 .55.45 1 1 1h2c.55 0 1-.45 1-1v-6s3.72-4.8 5.74-7.39c.51-.66.04-1.61-.79-1.61H5.04c-.83 0-1.3.95-.79 1.61"}),"FilterAlt")},74912:(e,l,a)=>{a.d(l,{c:()=>o});var t=a(27664),n=a(82496);const o=(0,t.c)((0,n.jsx)("path",{d:"M19.79 5.61C20.3 4.95 19.83 4 19 4H6.83l7.97 7.97zM2.81 2.81 1.39 4.22 10 13v6c0 .55.45 1 1 1h2c.55 0 1-.45 1-1v-2.17l5.78 5.78 1.41-1.41z"}),"FilterAltOff")},18256:(e,l,a)=>{a.d(l,{Ed:()=>c,cp:()=>r,oF:()=>i,qM:()=>s});var t=a(69060),n=a(82496);const o=t.createContext(null);function r(e){const{children:l,value:a}=e,r=function(){const[e,l]=t.useState(null);return t.useEffect((()=>{l("mui-p-".concat(Math.round(1e5*Math.random())))}),[]),e}(),i=t.useMemo((()=>({idPrefix:r,value:a})),[r,a]);return(0,n.jsx)(o.Provider,{value:i,children:l})}function i(){return t.useContext(o)}function s(e,l){const{idPrefix:a}=e;return null===a?null:"".concat(e.idPrefix,"-P-").concat(l)}function c(e,l){const{idPrefix:a}=e;return null===a?null:"".concat(e.idPrefix,"-T-").concat(l)}},29720:(e,l,a)=>{a.d(l,{c:()=>d});var t=a(45072),n=a(95656),o=a(69060),r=a(77828),i=a(18256),s=a(82496);const c=["children"],d=o.forwardRef((function(e,l){const{children:a}=e,d=(0,n.c)(e,c),u=(0,i.oF)();if(null===u)throw new TypeError("No TabContext provided");const m=o.Children.map(a,(e=>o.isValidElement(e)?o.cloneElement(e,{"aria-controls":(0,i.qM)(u,e.props.value),id:(0,i.Ed)(u,e.props.value)}):null));return(0,s.jsx)(r.c,(0,t.c)({},d,{ref:l,value:u.value,children:m}))}))},61584:(e,l,a)=>{a.d(l,{c:()=>h});var t=a(45072),n=a(95656),o=a(69060),r=a(79736),i=a(12556),s=a(23456),c=a(21412),d=a(33448);function u(e){return(0,d.cp)("MuiTabPanel",e)}(0,a(10099).c)("MuiTabPanel",["root"]);var m=a(18256),p=a(82496);const v=["children","className","value"],x=(0,i.cp)("div",{name:"MuiTabPanel",slot:"Root",overridesResolver:(e,l)=>l.root})((e=>{let{theme:l}=e;return{padding:l.spacing(3)}})),h=o.forwardRef((function(e,l){const a=(0,s.c)({props:e,name:"MuiTabPanel"}),{children:o,className:i,value:d}=a,h=(0,n.c)(a,v),g=(0,t.c)({},a),b=(e=>{const{classes:l}=e;return(0,c.c)({root:["root"]},u,l)})(g),f=(0,m.oF)();if(null===f)throw new TypeError("No TabContext provided");const j=(0,m.qM)(f,d),C=(0,m.Ed)(f,d);return(0,p.jsx)(x,(0,t.c)({"aria-labelledby":C,className:(0,r.c)(b.root,i),hidden:d!==f.value,id:j,ref:l,role:"tabpanel",ownerState:g},h,{children:d===f.value&&o}))}))},12572:(e,l,a)=>{a.d(l,{c:()=>c});var t=a(0),n=a(31152),o=a(46712),r=a(83068);const i=(0,a(10099).c)("MuiBox",["root"]),s=(0,o.c)(),c=(0,t.c)({themeId:r.c,defaultTheme:s,defaultClassName:i.root,generateClassName:n.c.generate})},84436:(e,l,a)=>{a.d(l,{c:()=>h});var t=a(45072),n=a(95656),o=a(69060),r=a(79736),i=a(21412),s=a(12556),c=a(49836),d=a(10099),u=a(33448);function m(e){return(0,u.cp)("MuiCardContent",e)}(0,d.c)("MuiCardContent",["root"]);var p=a(82496);const v=["className","component"],x=(0,s.cp)("div",{name:"MuiCardContent",slot:"Root",overridesResolver:(e,l)=>l.root})((()=>({padding:16,"&:last-child":{paddingBottom:24}}))),h=o.forwardRef((function(e,l){const a=(0,c.C)({props:e,name:"MuiCardContent"}),{className:o,component:s="div"}=a,d=(0,n.c)(a,v),u=(0,t.c)({},a,{component:s}),h=(e=>{const{classes:l}=e;return(0,i.c)({root:["root"]},m,l)})(u);return(0,p.jsx)(x,(0,t.c)({as:s,className:(0,r.c)(h.root,o),ownerState:u,ref:l},d))}))},43692:(e,l,a)=>{a.d(l,{c:()=>g});var t=a(45072),n=a(95656),o=a(69060),r=a(79736),i=a(21412),s=a(12556),c=a(49836),d=a(85624),u=a(10099),m=a(33448);function p(e){return(0,m.cp)("MuiCard",e)}(0,u.c)("MuiCard",["root"]);var v=a(82496);const x=["className","raised"],h=(0,s.cp)(d.c,{name:"MuiCard",slot:"Root",overridesResolver:(e,l)=>l.root})((()=>({overflow:"hidden"}))),g=o.forwardRef((function(e,l){const a=(0,c.C)({props:e,name:"MuiCard"}),{className:o,raised:s=!1}=a,d=(0,n.c)(a,x),u=(0,t.c)({},a,{raised:s}),m=(e=>{const{classes:l}=e;return(0,i.c)({root:["root"]},p,l)})(u);return(0,v.jsx)(h,(0,t.c)({className:(0,r.c)(m.root,o),elevation:s?8:void 0,ref:l,ownerState:u},d))}))},81568:(e,l,a)=>{function t(e){return t="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(e){return typeof e}:function(e){return e&&"function"==typeof Symbol&&e.constructor===Symbol&&e!==Symbol.prototype?"symbol":typeof e},t(e)}a.d(l,{c:()=>t})}}]);
//# sourceMappingURL=968.35f706ad.chunk.js.map
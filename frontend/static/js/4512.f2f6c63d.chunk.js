"use strict";(self.webpackChunkerp=self.webpackChunkerp||[]).push([[4512],{13724:(e,t,a)=>{a.d(t,{A5:()=>G,Om:()=>P,cp:()=>k});var l=a(69060),n=a(3358),o=a(5548),r=a(66931),s=a(89500),i=a(93996),d=a(14696),c=a(13224),u=a(27454),m=a(700),h=a(43692),v=a(85624),p=a(99904),_=a(33856),x=a(58612),g=a(53248),b=a(29504),f=a(5930),C=a(39308),j=a(4284),N=a(41459),S=a(46864),T=a(76491),y=a(10728),I=a(49608),w=a(28064),D=(a(37692),a(35832)),F=a(82496);const A=(e,t)=>e.map((e=>{const a={};return t.forEach(((t,l)=>{if(t.isVisible||t.Defult_Display)if(t.isCustomCell&&t.Cell){const n=t.Cell({row:e}),o=t.ColumnHeader?String(t.ColumnHeader).replace(/\s+/g,"_").toLowerCase():"field_".concat(l+1);"string"!==typeof n&&"number"!==typeof n&&"bigint"!==typeof n||(a[o]=n)}else{let l=t.Field_Name;a[l]=e[l]||""}})),a})),G=function(){let e=arguments.length>2&&void 0!==arguments[2]?arguments[2]:"";return{isVisible:1,Field_Name:arguments.length>0&&void 0!==arguments[0]?arguments[0]:"",Fied_Data:arguments.length>1&&void 0!==arguments[1]?arguments[1]:"string",align:arguments.length>3&&void 0!==arguments[3]?arguments[3]:"left",verticalAlign:arguments.length>4&&void 0!==arguments[4]?arguments[4]:"center",...e&&{ColumnHeader:e}}},P=e=>{let{buttonsData:t=[],ToolTipText:a="Options"}=e;const[u,m]=(0,l.useState)(null),h=Boolean(u);return(0,F.jsxs)(F.Fragment,{children:[(0,F.jsx)(n.c,{title:a,children:(0,F.jsx)(o.c,{"aria-describedby":h,onClick:e=>{m(e.currentTarget)},className:"ms-2",size:"small",children:(0,F.jsx)(j.c,{})})}),(0,F.jsx)(r.cp,{open:h,anchorEl:u,onClose:()=>{m(null)},anchorOrigin:{vertical:"bottom",horizontal:"left"},transformOrigin:{vertical:"top",horizontal:"left"},children:(0,F.jsx)(s.c,{children:t.map(((e,t)=>(0,F.jsxs)(i.c,{onClick:()=>(null===e||void 0===e?void 0:e.onclick)&&(null===e||void 0===e?void 0:e.onclick()),disabled:null===e||void 0===e?void 0:e.disabled,children:[(0,F.jsx)(d.c,{children:null===e||void 0===e?void 0:e.icon}),(0,F.jsx)(c.c,{children:null===e||void 0===e?void 0:e.name})]},t)))})})]})},E=e=>{let{dataArray:t=[],columns:a=[],onClickFun:n=null,isExpendable:r=!1,expandableComp:s=null,tableMaxHeight:i=550,initialPageCount:d=20,EnableSerialNumber:c=!1,CellSize:j="small",disablePagination:G=!1,title:E="",PDFPrintOption:k=!1,ExcelPrintOption:Q=!1,maxHeightOption:B=!1,ButtonArea:M=null,MenuButtons:O=[]}=e;const[H,R]=(0,l.useState)(0),[L,z]=(0,l.useState)(d),[J,K]=(0,l.useState)([]),[V,$]=(0,l.useState)(!0),q=V&&B?" max-content ":i,U=[{type:"left",class:"text-start"},{type:"right",class:"text-end"},{type:"center",class:"text-center"}],Y=[{type:"top",class:" vtop "},{type:"bottom",class:" vbottom "},{type:"center",class:" vctr "}],W=(e=>{if(!J.length)return e;return[...e].sort(((e,t)=>{for(const a of J){const{columnId:l,direction:n}=a,o=e[l],r=t[l];if(o!==r)return"asc"===n?o>r?1:-1:o<r?1:-1}return 0}))})(t),Z=H*L,X=Z+L,ee=W.slice(Z,X),te=(e,t)=>{switch(t){case"number":return e?(0,C.SA)(e):e;case"date":return e?(0,C.uy)(e):e;case"time":return e?(0,C.AX)(e):e;case"string":return e;default:return""}},ae=e=>{let{row:t,index:i}=e;const[d,h]=(0,l.useState)(!1),v="20px";return(0,F.jsxs)(l.Fragment,{children:[(0,F.jsxs)(u.c,{children:[!0===r&&s&&(0,F.jsx)(m.c,{className:"fa-13 border-end text-center vtop",children:(0,F.jsx)(o.c,{size:"small",onClick:()=>h((e=>!e)),children:d?(0,F.jsx)(N.c,{sx:{fontSize:v}}):(0,F.jsx)(S.c,{sx:{fontSize:v}})})}),!0===c&&(0,F.jsx)(m.c,{className:"fa-13 border-end text-center vtop",children:L*H+i+1}),null===a||void 0===a?void 0:a.map(((e,a)=>{var l,o;const r=(0,C.Qr)(null===e||void 0===e?void 0:e.Defult_Display,1)||(0,C.Qr)(null===e||void 0===e?void 0:e.isVisible,1),s=Boolean(null===e||void 0===e?void 0:e.isCustomCell)&&e.Cell,d=!s,c=e.align?null===(l=U.find((t=>t.type===String(e.align).toLowerCase())))||void 0===l?void 0:l.class:"",u=e.verticalAlign?null===(o=Y.find((t=>t.type===String(e.verticalAlign).toLowerCase())))||void 0===o?void 0:o.class:" vctr ";return r&&d?Object.entries(t).map((l=>{let[o,r]=l;return e.Field_Name===o&&(0,F.jsx)(m.c,{className:"fa-13 border-end "+c+u,onClick:()=>n?n(t):console.log("Function not supplied"),children:te(r,null===e||void 0===e?void 0:e.Fied_Data)},a)})):r&&s?(0,F.jsx)(m.c,{className:"fa-13 border-end "+c+u,children:e.Cell({row:t,Field_Name:e.Field_Name,index:i})},a):(0,F.jsx)(m.c,{className:"fa-13 border-end "+c+u},a)}))]}),!0===r&&s&&d&&(0,F.jsx)(u.c,{children:(0,F.jsx)(m.c,{colSpan:Number(null===a||void 0===a?void 0:a.length)+(!0===c?2:1),children:s({row:t,index:i})})})]})};return(0,F.jsxs)(h.c,{className:"rounded-3 bg-white overflow-hidden",component:v.c,children:[(0,F.jsxs)("div",{className:"d-flex align-items-center flex-wrap px-3 py-2 flex-row-reverse ",children:[(k||Q||O.length>0||B)&&(0,F.jsx)(P,{ToolTipText:"Table Options",buttonsData:[...B?[{name:"Max Height",icon:V?(0,F.jsx)(T.c,{fontSize:"small",color:"primary"}):(0,F.jsx)(y.c,{fontSize:"small"}),onclick:()=>$((e=>!e)),disabled:(0,C.Qr)(null===t||void 0===t?void 0:t.length,0)}]:[],...k?[{name:"PDF Print",icon:(0,F.jsx)(I.c,{fontSize:"small",color:"primary"}),onclick:()=>((e,t)=>{try{const a=new w.default,l=A(e,t),n=t.filter((e=>e.isVisible||e.Defult_Display)).map((e=>e.Field_Name||String(e.ColumnHeader).replace(/\s+/g,"_").toLowerCase())),o=l.map((e=>n.map((t=>e[t])))).map(((e,t)=>({...e,Sno:t+1})));a.autoTable({head:[n],body:o}),a.save("table.pdf")}catch(a){console.error(a)}})(t,a),disabled:(0,C.Qr)(null===t||void 0===t?void 0:t.length,0)}]:[],...Q?[{name:"Excel Print",icon:(0,F.jsx)(I.c,{fontSize:"small",color:"primary"}),onclick:()=>((e,t)=>{try{const a=A(e,t),l=D.c$.json_to_sheet(a),n=D.c$.book_new();D.c$.book_append_sheet(n,l,"Data"),D.a8(n,"table.xlsx")}catch(a){console.error(a)}})(t,a),disabled:(0,C.Qr)(null===t||void 0===t?void 0:t.length,0)}]:[],...O]}),M&&M,E&&(0,F.jsx)("h6",{className:"fw-bold text-muted flex-grow-1 m-0",children:E})]}),(0,F.jsx)(p.c,{sx:{maxHeight:q},children:(0,F.jsxs)(_.c,{stickyHeader:!0,size:j,children:[(0,F.jsx)(x.c,{children:(0,F.jsxs)(u.c,{children:[r&&s&&(0,F.jsx)(m.c,{className:"fa-13 fw-bold border-end border-top text-center",style:{backgroundColor:"#EDF0F7"},children:"#"}),c&&(0,F.jsx)(m.c,{className:"fa-13 fw-bold border-end border-top text-center",style:{backgroundColor:"#EDF0F7"},children:"SNo"}),a.map(((e,t)=>{const a=(0,C.Qr)(null===e||void 0===e?void 0:e.Defult_Display,1)||(0,C.Qr)(null===e||void 0===e?void 0:e.isVisible,1),l=!1===Boolean(null===e||void 0===e?void 0:e.isCustomCell)||!e.Cell,n=J.find((t=>t.columnId===e.Field_Name)),o=n?n.direction:"asc";var r,s,i,d;return a?l?(0,F.jsx)(m.c,{className:"fa-13 fw-bold border-end border-top "+(e.align?null===(r=U.find((t=>t.type===String(e.align).toLowerCase())))||void 0===r?void 0:r.class:""),style:{backgroundColor:"#EDF0F7"},sortDirection:!!n&&o,children:(0,F.jsx)(g.c,{active:!!n,direction:o,onClick:()=>(e=>{const t=J.find((t=>t.columnId===e));if(t){const a="asc"===t.direction;K(J.map((t=>t.columnId===e?{...t,direction:a?"desc":"asc"}:t)))}else K([...J,{columnId:e,direction:"asc"}])})(e.Field_Name),children:e.ColumnHeader||(null===e||void 0===e||null===(s=e.Field_Name)||void 0===s?void 0:s.replace(/_/g," "))})},t):(0,F.jsx)(m.c,{className:"".concat(e.ColumnHeader||null!==e&&void 0!==e&&e.Field_Name?" fa-13 fw-bold border-end border-top p-2 appFont ":" p-0 "," ")+(e.align?null===(i=U.find((t=>t.type===String(e.align).toLowerCase())))||void 0===i?void 0:i.class:""),style:{backgroundColor:"#EDF0F7"},children:e.ColumnHeader||(null===e||void 0===e||null===(d=e.Field_Name)||void 0===d?void 0:d.replace(/_/g," "))},t):null}))]})}),(0,F.jsxs)(b.c,{children:[(G?W:ee).map(((e,t)=>(0,F.jsx)(ae,{row:e,index:t},t))),0===t.length&&(0,F.jsx)(u.c,{children:(0,F.jsx)(m.c,{colSpan:a.length+(!0===r&&s?1:0)+(!0===c?1:0),sx:{textAlign:"center"},children:"No Data"})})]})]})}),!G&&0!==ee.length&&(0,F.jsx)("div",{className:"p-2 pb-0",children:(0,F.jsx)(f.c,{component:"div",count:t.length,page:H,onPageChange:(e,t)=>{R(t)},rowsPerPage:L,onRowsPerPageChange:e=>{z(parseInt(e.target.value,10)),R(0)},rowsPerPageOptions:Array.from(new Set([d,5,20,50,100,200,500])).sort(((e,t)=>e-t)),labelRowsPerPage:"Rows per page",showFirstButton:!0,showLastButton:!0})})]})};E.defaultProps={dataArray:[],columns:[],onClickFun:null,isExpendable:!1,expandableComp:null,tableMaxHeight:550,initialPageCount:20,EnableSerialNumber:!1,CellSize:"small",disablePagination:!1,title:void 0,PDFPrintOption:!1,ExcelPrintOption:!1,maxHeightOption:!1,ButtonArea:null,MenuButtons:[]};const k=E},62344:(e,t,a)=>{a.d(t,{o$:()=>r,o5:()=>s,cF:()=>o,iI:()=>n});const l=a.p+"static/media/smt.aa4d4f940bbebff07a57.png",n={table:{style:{width:"auto",backgroundColor:"transparent"}},rows:{style:{backgroundColor:"transparent"}},headCells:{style:{backgroundColor:"#6b9080f8",color:"white",fontSize:"14px"}}},o={control:(e,t)=>({...e,height:"45px",background:"rgba(255, 255, 255, 0.322)"}),menu:(e,t)=>({...e,zIndex:9999}),menuPortal:e=>({...e,zIndex:9999})},r=[{id:1,headname:"Menu ID",variant:"head",align:"left",width:100},{id:2,headname:"MenuName"},{id:3,headname:"Read Rights"},{id:4,headname:"Add Rights"},{id:5,headname:"Edit Rights"},{id:6,headname:"Delete Rights"},{id:7,headname:"Print Rights"},{id:8,headname:"Action"}],s=[{dataBase:1,name:"SHANKAR TRADERS",business:"Wholesale Merchant in Dhall",address:"32, Chitrakara Street, Madurai - 01 <br /> Bill of Supply -Disclaimer Affidavlt Field Extemped",logo:l,gstin:"33AADFS6973R1ZD",phone:"984-313-1353, 984-335-5166",fssai:"12418012000818",bankAccount:"0021 5032 0885 122",ifsc:"TMBL0000002"},{dataBase:2,name:"SMT AGRO PRODUCTS",business:"",address:"H.O: 153, Chitrakara Street, 2nd Floor, Madurai -01 <br /> G.O: 746 Puliyur, Sayanapuram, Svga <br /> Bill of Supply -Disclaimer Affidavlt Field Extemped",logo:l,gstin:"33ACMFS3420Q1ZQ",phone:"0452-4371625",fssai:"12418012000818",bankAccount:"0025 3031 0875 947",ifsc:"TMBL0000002"},{dataBase:3,name:"BHAVANI TRADERS",business:"",address:"H.O: 152-A, Chitrakara Street, Madurai -01 <br /> G.O: 30/1-Rajman Nagar, Chintamani Main Road, Mdu-01 <br /> Tax Invoice",logo:l,gstin:"33AAEFB6728J1ZG",phone:"958-559-7641, 958-559-7614",fssai:"12418012000670",bankAccount:"0021 5005 0800 309",ifsc:"TMBL0000002"}]},37384:(e,t,a)=>{a.r(t),a.d(t,{default:()=>I});var l=a(69060),n=a(1908),o=a(43692),r=a(89e3),s=a(84436),i=a(5548),d=a(82656),c=a(26773),u=a(4488),m=a(90048),h=a(39308),v=a(30612),p=a(62344),_=a(45180),x=a(57704),g=a(14499),b=a(13724);const f={Trip_Id:"",Challan_No:"",Branch_Id:"",Trip_Date:(0,h.Q7)(),Vehicle_No:"",StartTime:"",EndTime:"",Trip_No:"",Trip_ST_KM:"",Trip_EN_KM:"",Trip_Tot_Kms:"",Created_By:"",Updated_By:""},C={Id:"",Trip_Id:"",STJ_Id:"",Batch_No:"",Journal_no:"",From_Location:"",To_Location:"",S_No:"",Reason:"",Product_Id:"",HSN_Code:"",QTY:"",KGS:"",GST_Inclusive:"",IS_IGST:"",Gst_Rate:"",Gst_P:"",Cgst_P:"",Sgst_P:"",Igst_P:"",Taxable_Value:"",Round_off:"",Total_Value:"",Trip_From:"",Party_And_Branch_Id:"",Transporter_Id:"",Dispatch_Date:"",Delivery_Date:"",Created_By:"",Updated_By:""},j={Id:"",Trip_Id:"",Involved_Emp_Id:"",Cost_Center_Type_Id:"",Emp_Name:""};var N=a(56480),S=a(51560),T=a(82496);const y=function(){var e;let t=arguments.length>1?arguments[1]:void 0;return null!==(e=(arguments.length>0&&void 0!==arguments[0]?arguments[0]:[]).find((e=>(0,h.Qr)(e.Product_Id,t))))&&void 0!==e?e:{}},I=e=>{var t;let{loadingOn:a,loadingOff:I}=e;const w=(0,S.IT)(),D=((0,S.i6)(),w.state),[F,A]=(0,l.useState)({FromGodown:"",FromGodownName:"Select From Location",ToGodown:"",ToGodownName:"Select To Location",Fromdate:(0,h.Q7)(),Todate:(0,h.Q7)(),search:!1,addItemDialog:!1}),[G,P]=(0,l.useState)([]),[E,k]=(0,l.useState)([]),[Q,B]=(0,l.useState)([]),[M,O]=(0,l.useState)([]),[H,R]=(0,l.useState)([]),[L,z]=(0,l.useState)([]),[J,K]=(0,l.useState)(f),[V,$]=(0,l.useState)([]),[q,U]=(0,l.useState)([]);(0,l.useEffect)((()=>{(async()=>{try{const[e,t,a,l,o]=await Promise.all([(0,n.q)({address:"masters/branch/dropDown"}),(0,n.q)({address:"masters/products"}),(0,n.q)({address:"dataEntry/godownLocationMaster"}),(0,n.q)({address:"dataEntry/costCenter"}),(0,n.q)({address:"dataEntry/costCenter/category"})]),r=(e.success?e.data:[]).sort(((e,t)=>String(null===e||void 0===e?void 0:e.BranchName).localeCompare(null===t||void 0===t?void 0:t.BranchName))),s=(t.success?t.data:[]).sort(((e,t)=>String(null===e||void 0===e?void 0:e.Product_Name).localeCompare(null===t||void 0===t?void 0:t.Product_Name))),i=(a.success?a.data:[]).sort(((e,t)=>String(null===e||void 0===e?void 0:e.Godown_Name).localeCompare(null===t||void 0===t?void 0:t.Godown_Name))),d=(l.success?l.data:[]).sort(((e,t)=>String(null===e||void 0===e?void 0:e.Cost_Center_Name).localeCompare(null===t||void 0===t?void 0:t.Cost_Center_Name))),c=(o.success?o.data:[]).sort(((e,t)=>String(null===e||void 0===e?void 0:e.Cost_Category).localeCompare(null===t||void 0===t?void 0:t.Cost_Category)));z(r),B(s),k(i),O(d),R(c)}catch(e){console.error("Error fetching data:",e)}})()}),[]),(0,l.useEffect)((()=>{const e=null===D||void 0===D?void 0:D.Products_List,t=null===D||void 0===D?void 0:D.Employees_Involved;(0,h.CY)(D)&&Array.isArray(e)&&Array.isArray(t)&&(K(Object.fromEntries(Object.entries(f).map((e=>{var t;let[a,l]=e;return"Trip_Date"===a?[a,D[a]?(0,h.Q7)(D[a]):l]:"StartTime"===a||"EndTime"===a?[a,D[a]?(0,h.OM)(D[a]):l]:[a,null!==(t=D[a])&&void 0!==t?t:l]})))),U(e.map((e=>Object.fromEntries(Object.entries(C).map((t=>{var a;let[l,n]=t;return"Dispatch_Date"===l||"Delivery_Date"===l?[l,e[l]?(0,h.Q7)(e[l]):n]:[l,null!==(a=e[l])&&void 0!==a?a:n]})))))),$(t.map((e=>Object.fromEntries(Object.entries(j).map((t=>{var a;let[l,n]=t;return[l,null!==(a=e[l])&&void 0!==a?a:n]})))))))}),[D]);const Y=(e,t)=>{U((a=>{const l=a.filter((t=>!(0,h.Qr)(t.STJ_Id,e.STJ_Id)));if(t)return l;{const t=G.filter((t=>(0,h.Qr)(t.STJ_Id,e.STJ_Id))).map((e=>{const t=y(Q,e.Sour_Item_Id),a=(0,h.Q$)(null===e||void 0===e?void 0:e.GST_Inclusive)?Number(null===e||void 0===e?void 0:e.GST_Inclusive):0,l=(0,h.Q$)(null===e||void 0===e?void 0:e.IS_IGST)?Number(null===e||void 0===e?void 0:e.IS_IGST):0,n=Number(l?t.Igst_P:t.Gst_P),o=Number(e.Sour_Qty),r=(0,h.kR)(e.Sour_Rate),s=(0,h.eX)(o,r),i=function(){let e=arguments.length>1&&void 0!==arguments[1]?arguments[1]:0,t=arguments.length>2&&void 0!==arguments[2]?arguments[2]:0;switch(arguments.length>0&&void 0!==arguments[0]?arguments[0]:1){case 0:return(0,h.kR)(e*(t/100));case 1:return(0,h.kR)(e-e*(100/(100+t)));default:return 0}}(a,s,n),d=s,c=(0,h.Q5)(s,i);return Object.fromEntries(Object.entries(C).map((s=>{var i,u,m,h;let[v,p]=s;switch(v){case"STJ_Id":return[v,Number(e.STJ_Id)];case"Batch_No":return[v,null===e||void 0===e?void 0:e.Sour_Batch_Lot_No];case"From_Location":return[v,null===e||void 0===e?void 0:e.Sour_Goodown_Id];case"To_Location":return[v,null===e||void 0===e?void 0:e.Dest_Goodown_Id];case"Product_Id":return[v,Number(null===e||void 0===e?void 0:e.Sour_Item_Id)];case"HSN_Code":return[v,t.HSN_Code];case"QTY":return[v,o];case"KGS":case"Round_off":return[v,0];case"GST_Inclusive":return[v,a];case"IS_IGST":return[v,l];case"Gst_Rate":return[v,r];case"Gst_P":return[v,n];case"Cgst_P":return[v,null!==(i=n/2)&&void 0!==i?i:0];case"Sgst_P":return[v,null!==(u=n/2)&&void 0!==u?u:0];case"Igst_P":return[v,null!==(m=n/2)&&void 0!==m?m:0];case"Taxable_Value":return[v,d];case"Total_Value":return[v,c];case"Trip_From":return[v,"STOCK JOURNAL"];case"Party_And_Branch_Id":return[v,1];case"Journal_no":return[v,null!==(h=e.Journal_no)&&void 0!==h?h:""];default:return[v,p]}})))}));return l.concat(t)}}))},W=()=>{a&&a(),(0,n.q)({address:"inventory/tripSheet",method:(0,h.Q$)(null===J||void 0===J?void 0:J.Trip_Id)?"PUT":"POST",bodyData:{...J,StartTime:J.StartTime&&J.Trip_Date?(0,h.Oc)(J.Trip_Date,J.StartTime):"",EndTime:J.EndTime&&J.Trip_Date?(0,h.Oc)(J.Trip_Date,J.EndTime):"",Product_Array:q,EmployeesInvolved:V.filter((e=>(0,h.Q$)(e.Involved_Emp_Id)&&(0,h.Q$)(e.Cost_Center_Type_Id)))}}).then((e=>{e.success?(U([]),$([]),K(f),P([]),N.m4.success(e.message)):N.m4.error(e.message)})).catch((e=>console.log(e))).finally((()=>{I&&I()}))};return(0,T.jsxs)(T.Fragment,{children:[(0,T.jsxs)(o.c,{children:[(0,T.jsxs)("div",{className:"d-flex flex-wrap align-items-center border-bottom p-2",children:[(0,T.jsx)("h5",{className:"flex-grow-1 m-0 ps-2",children:"Trip Sheet Creation"}),(0,T.jsx)(r.c,{variant:"outlined",onClick:W,disabled:0===q.length||!(0,h.e8)(J.Trip_Date),children:"Save"})]}),(0,T.jsxs)(s.c,{style:{minHeight:500},children:[(0,T.jsxs)("div",{className:"row ",children:[(0,T.jsx)("div",{className:"col-xxl-3 col-lg-4 col-md-5 p-2",children:(0,T.jsxs)("div",{className:"border p-2",style:{minHeight:"30vh",height:"100%"},children:[(0,T.jsxs)("div",{className:"d-flex align-items-center flex-wrap mb-2 border-bottom pb-2",children:[(0,T.jsx)("h6",{className:"flex-grow-1 m-0",children:"Staff Involved"}),(0,T.jsx)(r.c,{variant:"outlined",color:"primary",type:"button",onClick:()=>$([...V,{...j}]),children:"Add"})]}),(0,T.jsxs)("table",{className:"table table-bordered",children:[(0,T.jsx)("thead",{children:(0,T.jsxs)("tr",{children:[(0,T.jsx)("th",{className:"fa-13",children:"Sno"}),(0,T.jsx)("th",{className:"fa-13",children:"Staff Name"}),(0,T.jsx)("th",{className:"fa-13",children:"Category"})]})}),(0,T.jsx)("tbody",{children:V.map(((e,t)=>(0,T.jsxs)("tr",{children:[(0,T.jsx)("td",{className:"fa-13 vctr text-center",children:t+1}),(0,T.jsx)("td",{className:"fa-13 w-100 p-0",children:(0,T.jsx)(v.cp,{value:{value:null===e||void 0===e?void 0:e.Involved_Emp_Id,label:null===e||void 0===e?void 0:e.Emp_Name},onChange:e=>$((a=>a.map(((a,l)=>{if((0,h.Qr)(l,t)){var n;const t=M.find((t=>(0,h.Qr)(t.Cost_Center_Id,e.value)));return{...a,Cost_Center_Type_Id:(0,h.Q$)(a.Cost_Center_Type_Id)?a.Cost_Center_Type_Id:(0,h.Q$)(t.User_Type)?t.User_Type:0,Involved_Emp_Id:e.value,Emp_Name:null!==(n=t.Cost_Center_Name)&&void 0!==n?n:""}}return a})))),options:[...M.filter((e=>-1===V.findIndex((t=>(0,h.Qr)(t.Cost_Center_Type_Id,e.Cost_Center_Id)))))].map((e=>({value:e.Cost_Center_Id,label:e.Cost_Center_Name}))),styles:p.cF,isSearchable:!0,placeholder:"Select Staff"})}),(0,T.jsx)("td",{className:"fa-13 vctr p-0",style:{maxWidth:"130px",minWidth:"110px"},children:(0,T.jsxs)("select",{value:null===e||void 0===e?void 0:e.Cost_Center_Type_Id,onChange:e=>$((a=>a.map(((a,l)=>(0,h.Qr)(l,t)?{...a,Cost_Center_Type_Id:e.target.value}:a)))),className:"cus-inpt p-2",children:[(0,T.jsx)("option",{value:"",children:"Select"}),H.map(((e,t)=>(0,T.jsx)("option",{value:null===e||void 0===e?void 0:e.Cost_Category_Id,children:null===e||void 0===e?void 0:e.Cost_Category},t)))]})})]},t)))})]})]})}),(0,T.jsx)("div",{className:"col-xxl-9 col-lg-8 col-md-7 py-2 px-0",children:(0,T.jsxs)("div",{className:"border p-2",style:{minHeight:"30vh",height:"100%"},children:[(0,T.jsxs)("div",{className:"row",children:[(0,T.jsxs)("div",{className:"col-xl-3 col-md-4 col-sm-6 p-2",children:[(0,T.jsx)("label",{children:"Branch"}),(0,T.jsxs)("select",{value:J.Branch_Id,onChange:e=>K({...J,Branch_Id:e.target.value}),placeholder:"Select Branch",className:"cus-inpt mb-2 p-2",children:[(0,T.jsx)("option",{value:"",disabled:!0,children:"Select Branch"}),L.map(((e,t)=>(0,T.jsx)("option",{value:e.BranchId,children:e.BranchName},t)))]})]}),(0,T.jsxs)("div",{className:"col-xl-3 col-md-4 col-sm-6 p-2",children:[(0,T.jsx)("label",{children:"Date"}),(0,T.jsx)("input",{value:J.Trip_Date,type:"date",onChange:e=>K({...J,Trip_Date:e.target.value}),className:"cus-inpt p-2 mb-2"})]}),(0,T.jsxs)("div",{className:"col-xl-3 col-md-4 col-sm-6 p-2",children:[(0,T.jsx)("label",{children:"Vehicle No"}),(0,T.jsx)("input",{value:J.Vehicle_No,onChange:e=>K({...J,Vehicle_No:e.target.value}),className:"cus-inpt p-2 mb-2"})]}),(0,T.jsxs)("div",{className:"col-xl-3 col-md-4 col-sm-6 p-2",children:[(0,T.jsx)("label",{children:"Trip No"}),(0,T.jsx)("input",{value:J.Trip_No,onChange:e=>K({...J,Trip_No:e.target.value}),className:"cus-inpt p-2 mb-2"})]})]}),(0,T.jsx)("div",{className:"table-responsive",children:(0,T.jsxs)("table",{className:"table table-bordered",children:[(0,T.jsxs)("thead",{children:[(0,T.jsxs)("tr",{children:[(0,T.jsx)("th",{colSpan:2,className:"fa-13 text-center",children:"Time"}),(0,T.jsx)("th",{colSpan:2,className:"fa-13 text-center",children:"Distance"})]}),(0,T.jsxs)("tr",{children:[(0,T.jsx)("th",{className:"fa-13 text-center",children:"Start"}),(0,T.jsx)("th",{className:"fa-13 text-center",children:"End"}),(0,T.jsx)("th",{className:"fa-13 text-center",children:"Start (Km)"}),(0,T.jsx)("th",{className:"fa-13 text-center",children:"End (Km)"})]})]}),(0,T.jsx)("tbody",{children:(0,T.jsxs)("tr",{children:[(0,T.jsx)("td",{className:"fa-13",children:(0,T.jsx)("input",{type:"time",onChange:e=>K((t=>({...t,StartTime:e.target.value}))),value:null===J||void 0===J?void 0:J.StartTime,className:"cus-inpt p-2"})}),(0,T.jsx)("td",{className:"fa-13",children:(0,T.jsx)("input",{type:"time",onChange:e=>K((t=>({...t,EndTime:e.target.value}))),value:null===J||void 0===J?void 0:J.EndTime,className:"cus-inpt p-2"})}),(0,T.jsx)("td",{className:"fa-13",children:(0,T.jsx)("input",{type:"number",onChange:e=>K((t=>{var a,l;return{...t,Trip_ST_KM:e.target.value,Trip_Tot_Kms:(0,h.od)(null!==(a=t.Trip_EN_KM)&&void 0!==a?a:0,null!==(l=e.target.value)&&void 0!==l?l:0)}})),value:null===J||void 0===J?void 0:J.Trip_ST_KM,min:0,className:"cus-inpt p-2",placeholder:"Kilometers"})}),(0,T.jsx)("td",{className:"fa-13",children:(0,T.jsx)("input",{type:"number",onChange:e=>K((t=>{var a,l;return{...t,Trip_EN_KM:e.target.value,Trip_Tot_Kms:(0,h.od)(null!==(a=e.target.value)&&void 0!==a?a:0,null!==(l=t.Trip_ST_KM)&&void 0!==l?l:0)}})),value:null===J||void 0===J?void 0:J.Trip_EN_KM,min:(0,h.Q5)(null===J||void 0===J?void 0:J.Trip_ST_KM,1),className:"cus-inpt p-2",placeholder:"Kilometers"})})]})})]})})]})})]}),(0,T.jsx)(b.cp,{dataArray:q,ButtonArea:(0,T.jsxs)(T.Fragment,{children:[(0,T.jsx)(r.c,{onClick:()=>A((e=>({...e,addItemDialog:!0}))),children:"Add"}),(0,T.jsx)(r.c,{onClick:()=>U([]),className:"me-2",children:"clear"})]}),EnableSerialNumber:!0,disablePagination:!0,title:"\n                            Selected Items: ".concat(q.length," \n                            QTY: ").concat(null===q||void 0===q?void 0:q.reduce(((e,t)=>{var a;return(0,h.Q5)(e,null!==(a=t.QTY)&&void 0!==a?a:0)}),0),"\n                        "),maxHeightOption:!0,columns:[{isVisible:1,ColumnHeader:"Item",isCustomCell:!0,Cell:e=>{var t;let{row:a}=e;return null===(t=y(Q,a.Product_Id))||void 0===t?void 0:t.Product_Name}},(0,b.A5)("Journal_no","string"),(0,b.A5)("HSN_Code","string","HSN Code"),(0,b.A5)("QTY","number","Quantity"),(0,b.A5)("KGS","number","KGs"),(0,b.A5)("Gst_Rate","number","Rate"),(0,b.A5)("Total_Value","number","Amount"),{isVisible:1,ColumnHeader:"#",isCustomCell:!0,Cell:e=>{let{row:t}=e;return(0,T.jsx)(i.c,{variant:"contained",color:"error",size:"small",onClick:()=>{const e=q.filter((e=>!(0,h.Qr)(e.STJ_Id,t.STJ_Id)));U(e)},children:(0,T.jsx)(_.c,{className:"fa-20"})})}}]})]}),(0,T.jsx)("div",{className:"border-top p-2 text-end",children:(0,T.jsx)(r.c,{variant:"outlined",onClick:W,disabled:0===q.length||!(0,h.e8)(J.Trip_Date),children:"Save"})})]}),(0,T.jsx)(d.c,{open:F.addItemDialog,onClose:()=>A((e=>({...e,addItemDialog:!1}))),maxWidth:"lg",fullWidth:!0,fullScreen:!0,children:(0,T.jsxs)("form",{onSubmit:e=>{e.preventDefault();const{FromGodown:t,ToGodown:l,Fromdate:o,Todate:r}=F;t&&l&&(0,h.e8)(o)&&(0,h.e8)(r)&&(a&&a(),P([]),(0,n.q)({address:"inventory/stockJournal/godownActivity?FromDate=".concat(o,"&ToDate=").concat(r,"&fromGodown=").concat(t,"&toGodown=").concat(l)}).then((e=>{e.success&&P(e.data)})).catch((e=>console.log(e))).finally((()=>{I&&I()})))},children:[(0,T.jsxs)(c.c,{className:"d-flex align-items-center",children:[(0,T.jsx)("span",{className:"flex-grow-1",children:"Add Item"}),(0,T.jsx)(r.c,{variant:"outlined",type:"submit",className:"me-2",disabled:!F.FromGodown||!F.ToGodown,startIcon:(0,T.jsx)(x.c,{}),children:"Search"}),(0,T.jsx)(i.c,{size:"small",color:"error",onClick:()=>A((e=>({...e,addItemDialog:!1}))),children:(0,T.jsx)(g.c,{})})]}),(0,T.jsxs)(u.c,{children:[(0,T.jsx)("div",{className:"table-responsive",children:(0,T.jsx)("table",{className:"table table-bordered",children:(0,T.jsxs)("tbody",{children:[(0,T.jsxs)("tr",{children:[(0,T.jsx)("td",{className:"text-center fa-13 fw-bold",colSpan:2,children:"Godown Location"}),(0,T.jsx)("td",{className:"text-center fa-13 fw-bold",colSpan:2,children:"Date"})]}),(0,T.jsxs)("tr",{children:[(0,T.jsx)("td",{className:"text-center fa-13 fw-bold",children:"From"}),(0,T.jsx)("td",{className:"text-center fa-13 fw-bold",children:"To"}),(0,T.jsx)("td",{className:"text-center fa-13 fw-bold",children:"From"}),(0,T.jsx)("td",{className:"text-center fa-13 fw-bold",children:"To"})]}),(0,T.jsxs)("tr",{children:[(0,T.jsx)("td",{className:"fa-13 ",children:(0,T.jsx)(v.cp,{value:{value:F.FromGodown,label:F.FromGodownName},onChange:e=>A((t=>({...t,FromGodown:e.value,FromGodownName:e.label}))),menuPortalTarget:document.body,options:[{value:"",label:"Search",isDisabled:!0},...E.filter((e=>!(0,h.Qr)(e.Godown_Id,F.ToGodown))).map((e=>({value:null===e||void 0===e?void 0:e.Godown_Id,label:null===e||void 0===e?void 0:e.Godown_Name})))],styles:p.cF,isSearchable:!0,placeholder:"Select Godown",maxMenuHeight:300})}),(0,T.jsx)("td",{className:"fa-13 ",children:(0,T.jsx)(v.cp,{value:{value:F.ToGodown,label:F.ToGodownName},onChange:e=>A((t=>({...t,ToGodown:e.value,ToGodownName:e.label}))),menuPortalTarget:document.body,options:[{value:"",label:"Search",isDisabled:!0},...E.filter((e=>!(0,h.Qr)(e.Godown_Id,F.FromGodown))).map((e=>({value:null===e||void 0===e?void 0:e.Godown_Id,label:null===e||void 0===e?void 0:e.Godown_Name})))],styles:p.cF,isSearchable:!0,placeholder:"Select Godown",maxMenuHeight:300})}),(0,T.jsx)("td",{className:"fa-13 text-center ",children:(0,T.jsx)("input",{type:"date",value:F.Fromdate,className:"cus-inpt p-2",required:!0,max:F.Todate,onChange:e=>A((t=>({...t,Fromdate:e.target.value})))})}),(0,T.jsx)("td",{className:"fa-13 text-center ",children:(0,T.jsx)("input",{type:"date",value:F.Todate,className:"cus-inpt p-2",min:F.Fromdate,required:!0,onChange:e=>A((t=>({...t,Todate:e.target.value})))})})]})]})})}),(0,T.jsx)(b.cp,{dataArray:G,disablePagination:!0,title:"Godown Transactions From: ".concat(null===(t=G[0])||void 0===t?void 0:t.Source_Godown_Name),maxHeightOption:!0,columns:[{isVisible:1,ColumnHeader:"#",isCustomCell:!0,Cell:e=>{let{row:t}=e;const a=-1!==q.findIndex((e=>(0,h.Qr)(e.STJ_Id,t.STJ_Id)&&(0,h.Qr)(e.From_Location,t.Sour_Goodown_Id)&&(0,h.Qr)(e.Product_Id,t.Sour_Item_Id)));return(0,T.jsx)("div",{children:(0,T.jsx)("input",{className:"form-check-input shadow-none pointer",style:{padding:"0.7em"},type:"checkbox",checked:a,onChange:()=>{a?Y(t,!0):Y(t)}})})}},(0,b.A5)("Journal_no","string","Journal_no"),(0,b.A5)("Sour_Item_Name","string","Item"),(0,b.A5)("Stock_Journal_Voucher_type","string","Voucher"),(0,b.A5)("Stock_Journal_Bill_type","string","Bill-Type"),(0,b.A5)("Sour_Batch_Lot_No","string","Batch"),(0,b.A5)("Sour_Qty","number","Quantity"),(0,b.A5)("Sour_Amt","number","Amount"),(0,b.A5)("Source_Godown_Name","string","From"),{isVisible:1,ColumnHeader:"To",isCustomCell:!0,Cell:e=>{var t;let{row:a}=e;return null!==(t=E.find((e=>(0,h.Qr)(e.Godown_Id,null===a||void 0===a?void 0:a.Dest_Goodown_Id))).Godown_Name)&&void 0!==t?t:" - "}}]})]}),(0,T.jsx)(m.c,{children:(0,T.jsx)(r.c,{type:"button",onClick:()=>A((e=>({...e,addItemDialog:!1}))),children:"close"})})]})})]})}},14499:(e,t,a)=>{a.d(t,{c:()=>o});var l=a(27664),n=a(82496);const o=(0,l.c)((0,n.jsx)("path",{d:"M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"}),"Close")},45180:(e,t,a)=>{a.d(t,{c:()=>o});var l=a(27664),n=a(82496);const o=(0,l.c)((0,n.jsx)("path",{d:"M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z"}),"Delete")},57704:(e,t,a)=>{a.d(t,{c:()=>o});var l=a(27664),n=a(82496);const o=(0,l.c)((0,n.jsx)("path",{d:"M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14"}),"Search")},84436:(e,t,a)=>{a.d(t,{c:()=>_});var l=a(45072),n=a(95656),o=a(69060),r=a(79736),s=a(21412),i=a(12556),d=a(49836),c=a(10099),u=a(33448);function m(e){return(0,u.cp)("MuiCardContent",e)}(0,c.c)("MuiCardContent",["root"]);var h=a(82496);const v=["className","component"],p=(0,i.cp)("div",{name:"MuiCardContent",slot:"Root",overridesResolver:(e,t)=>t.root})((()=>({padding:16,"&:last-child":{paddingBottom:24}}))),_=o.forwardRef((function(e,t){const a=(0,d.C)({props:e,name:"MuiCardContent"}),{className:o,component:i="div"}=a,c=(0,n.c)(a,v),u=(0,l.c)({},a,{component:i}),_=(e=>{const{classes:t}=e;return(0,s.c)({root:["root"]},m,t)})(u);return(0,h.jsx)(p,(0,l.c)({as:i,className:(0,r.c)(_.root,o),ownerState:u,ref:t},c))}))}}]);
//# sourceMappingURL=4512.f2f6c63d.chunk.js.map
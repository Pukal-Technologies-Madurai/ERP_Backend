"use strict";(self.webpackChunkerp=self.webpackChunkerp||[]).push([[7806],{77806:(e,l,a)=>{a.r(l),a.d(l,{default:()=>T});var s=a(69060),r=a(3358),t=a(5548),d=a(89e3),i=a(82656),n=a(26773),o=a(4488),c=a(90048),u=a(30612),h=a(62344),m=a(39308),v=a(91924),x=a(71412),j=a(86e3),b=a(61988),_=a(96064),p=a(1908),g=a(13724),N=a(51560),C=a(82496);const T=e=>{let{loadingOn:l,loadingOff:a}=e;const T=JSON.parse(localStorage.getItem("user")),[f,F]=(0,s.useState)([]),[I,y]=(0,s.useState)([]),[S,D]=(0,s.useState)([]),[R,P]=(0,s.useState)({}),k=(0,N.i6)(),[A,G]=(0,s.useState)({Fromdate:(0,m.Q7)(),Todate:(0,m.Q7)(),Retailer_Id:"",RetailerGet:"ALL",Created_by:"",CreatedByGet:"ALL",Cancel_status:0}),[L,O]=(0,s.useState)({filters:!1,orderDetails:!1});(0,s.useEffect)((()=>{l&&l(),(0,p.q)({address:"purchase/purchaseOrder?Fromdate=".concat(null===A||void 0===A?void 0:A.Fromdate,"&Todate=").concat(null===A||void 0===A?void 0:A.Todate,"&Retailer_Id=").concat(null===A||void 0===A?void 0:A.Retailer_Id,"&Created_by=").concat(null===A||void 0===A?void 0:A.Created_by,"&Cancel_status=").concat(null===A||void 0===A?void 0:A.Cancel_status)}).then((e=>{e.success&&F(null===e||void 0===e?void 0:e.data)})).catch((e=>console.error(e))).finally((()=>{a&&a()}))}),[A.Fromdate,null===A||void 0===A?void 0:A.Todate,null===A||void 0===A?void 0:A.Retailer_Id,null===A||void 0===A?void 0:A.Created_by,null===A||void 0===A?void 0:A.Cancel_status]),(0,s.useEffect)((()=>{(0,p.q)({address:"masters/retailers/dropDown"}).then((e=>{e.success&&y(e.data)})).catch((e=>console.error(e))),(0,p.q)({address:"masters/user/dropDown?Company_id=".concat(null===T||void 0===T?void 0:T.Company_id)}).then((e=>{e.success&&D(e.data)})).catch((e=>console.error(e)))}),[]);const V=e=>{let{page:l="",stateToTransfer:a={}}=e;k(l,{state:a})},w=[{Field_Name:"Po_Inv_No",ColumnHeader:"Order ID",Fied_Data:"string",isVisible:1},{Field_Name:"Po_Inv_Date",ColumnHeader:"Date",Fied_Data:"date",isVisible:1,align:"center"},{Field_Name:"Retailer_Name",ColumnHeader:"Party",Fied_Data:"string",isVisible:1},{Field_Name:"Total_Before_Tax",ColumnHeader:"Before Tax",Fied_Data:"number",isVisible:1,align:"center"},{Field_Name:"Total_Tax",ColumnHeader:"Tax",Fied_Data:"number",isVisible:1,align:"center"},{Field_Name:"Total_Invoice_value",ColumnHeader:"Invoice Value",Fied_Data:"number",isVisible:1,align:"center"},{Field_Name:"Action",isVisible:1,isCustomCell:!0,Cell:e=>{let{row:l}=e;return(0,C.jsxs)(C.Fragment,{children:[(0,C.jsx)(r.c,{title:"View Order",children:(0,C.jsx)(t.c,{onClick:()=>{P({orderDetails:l,orderProducts:null!==l&&void 0!==l&&l.Products_List?null===l||void 0===l?void 0:l.Products_List:[]})},color:"primary",size:"small",children:(0,C.jsx)(x.c,{className:"fa-16"})})}),(0,C.jsx)(r.c,{title:"Edit",children:(0,C.jsx)(t.c,{onClick:()=>{V({page:"create",stateToTransfer:{invoiceInfo:l,orderInfo:null===l||void 0===l?void 0:l.Products_List}})},size:"small",children:(0,C.jsx)(j.c,{className:"fa-16"})})})]})}}],H=()=>{O({...L,filters:!1,orderDetails:!1})};return(0,C.jsxs)(C.Fragment,{children:[(0,C.jsx)(g.c,{dataArray:f,columns:w,title:"Purchase Invoices",isExpendable:!0,tableMaxHeight:550,expandableComp:e=>{let{row:l}=e;return(0,C.jsx)(C.Fragment,{children:(0,C.jsx)("table",{className:"table",children:(0,C.jsxs)("tbody",{children:[(0,C.jsxs)("tr",{children:[(0,C.jsx)("td",{className:"border p-2 bg-light",children:"Branch"}),(0,C.jsx)("td",{className:"border p-2",children:l.Branch_Name}),(0,C.jsx)("td",{className:"border p-2 bg-light",children:"Sales Person"}),(0,C.jsx)("td",{className:"border p-2",children:null===l||void 0===l?void 0:l.Sales_Person_Name}),(0,C.jsx)("td",{className:"border p-2 bg-light",children:"Round off"}),(0,C.jsx)("td",{className:"border p-2",children:l.Round_off})]}),(0,C.jsxs)("tr",{children:[(0,C.jsx)("td",{className:"border p-2 bg-light",children:"Invoice Type"}),(0,C.jsxs)("td",{className:"border p-2",children:[(0,m.Qr)(l.GST_Inclusive,1)&&"Inclusive",(0,m.Qr)(l.GST_Inclusive,0)&&"Exclusive"]}),(0,C.jsx)("td",{className:"border p-2 bg-light",children:"Tax Type"}),(0,C.jsxs)("td",{className:"border p-2",children:[(0,m.Qr)(l.IS_IGST,1)&&"IGST",(0,m.Qr)(l.IS_IGST,0)&&"GST"]}),(0,C.jsx)("td",{className:"border p-2 bg-light",children:"Sales Person"}),(0,C.jsx)("td",{className:"border p-2",children:l.Sales_Person_Name})]}),(0,C.jsxs)("tr",{children:[(0,C.jsx)("td",{className:"border p-2 bg-light",children:"Narration"}),(0,C.jsx)("td",{className:"border p-2",colSpan:5,children:l.Narration})]})]})})})},ButtonArea:(0,C.jsxs)(C.Fragment,{children:[(0,C.jsx)(r.c,{title:"Filters",children:(0,C.jsx)(t.c,{size:"small",className:"ms-2",onClick:()=>O({...L,filters:!0}),children:(0,C.jsx)(b.c,{})})}),(0,C.jsx)(d.c,{variant:"outlined",startIcon:(0,C.jsx)(_.c,{}),onClick:()=>V({page:"create"}),children:"Add"})]})}),Object.keys(R).length>0&&(0,C.jsx)(v.c,{orderDetails:null===R||void 0===R?void 0:R.orderDetails,orderProducts:null===R||void 0===R?void 0:R.orderProducts,download:!0,actionOpen:!0,clearDetails:()=>P({}),TitleText:"Purchase Order"}),(0,C.jsxs)(i.c,{open:L.filters,onClose:H,fullWidth:!0,maxWidth:"sm",children:[(0,C.jsx)(n.c,{children:"Filters"}),(0,C.jsx)(o.c,{children:(0,C.jsx)("div",{className:"table-responsive pb-4",children:(0,C.jsx)("table",{className:"table",children:(0,C.jsxs)("tbody",{children:[(0,C.jsxs)("tr",{children:[(0,C.jsx)("td",{style:{verticalAlign:"middle"},children:"Retailer"}),(0,C.jsx)("td",{children:(0,C.jsx)(u.cp,{value:{value:null===A||void 0===A?void 0:A.Retailer_Id,label:null===A||void 0===A?void 0:A.RetailerGet},onChange:e=>G({...A,Retailer_Id:e.value,RetailerGet:e.label}),options:[{value:"",label:"ALL"},...I.map((e=>({value:null===e||void 0===e?void 0:e.Retailer_Id,label:null===e||void 0===e?void 0:e.Retailer_Name})))],styles:h.cF,isSearchable:!0,placeholder:"Retailer Name"})})]}),(0,C.jsxs)("tr",{children:[(0,C.jsx)("td",{style:{verticalAlign:"middle"},children:"From"}),(0,C.jsx)("td",{children:(0,C.jsx)("input",{type:"date",value:A.Fromdate,onChange:e=>G({...A,Fromdate:e.target.value}),className:"cus-inpt"})})]}),(0,C.jsxs)("tr",{children:[(0,C.jsx)("td",{style:{verticalAlign:"middle"},children:"To"}),(0,C.jsx)("td",{children:(0,C.jsx)("input",{type:"date",value:A.Todate,onChange:e=>G({...A,Todate:e.target.value}),className:"cus-inpt"})})]})]})})})}),(0,C.jsx)(c.c,{children:(0,C.jsx)(d.c,{onClick:H,children:"close"})})]})]})}}}]);
//# sourceMappingURL=7806.103169ee.chunk.js.map
"use strict";(self.webpackChunkerp=self.webpackChunkerp||[]).push([[5496],{35496:(e,t,s)=>{s.r(t),s.d(t,{default:()=>p});var a=s(69060),l=s(39308),r=s(56480),i=s(43692),n=s(89e3),d=s(84436),c=s(5548),o=s(82656),v=s(26773),u=s(4488),h=s(90048),m=s(86e3),x=s(77536),j=s(1908),N=s(82496);const p=()=>{const e=JSON.parse(localStorage.getItem("user")),[t,s]=(0,a.useState)([]),[p,g]=(0,a.useState)(!1),b={Id:"",EntryDate:(0,l.Q7)(),EntryTime:(0,l.Ix)(),LocationDetails:"MILL",NotTaken:0,NotVerified:0,NotDelivery:0,OverAllSales:0,EntryBy:e.UserId},[y,f]=(0,a.useState)(b),{contextObj:C}=(0,a.useContext)(x.a),[D,L]=(0,a.useState)({reqDate:(0,l.Q7)(),LocationDetails:"MILL",dialog:!1});(0,a.useEffect)((()=>{s([]),(0,j.q)({address:"dataEntry/deliveryActivities?reqDate=".concat(D.reqDate,"&reqLocation=").concat(D.LocationDetails)}).then((e=>s(null===e||void 0===e?void 0:e.data))).catch((e=>console.error(e)))}),[p,D.reqDate,D.LocationDetails]);const A=()=>{L((e=>({...e,dialog:!1}))),f(b)};return(0,N.jsxs)(N.Fragment,{children:[(0,N.jsxs)(i.c,{children:[(0,N.jsxs)("div",{className:"fa-16 fw-bold border-bottom d-flex justify-content-between align-items-center",children:[(0,N.jsx)("span",{className:"p-3",children:"Delivery Activities"}),(0,l.Qr)(null===C||void 0===C?void 0:C.Add_Rights,1)&&(0,N.jsx)(n.c,{variant:"outlined",onClick:()=>L((e=>({...e,dialog:!0}))),className:"me-2",children:"Add Activity"})]}),(0,N.jsxs)(d.c,{children:[(0,N.jsxs)("div",{className:"d-flex flex-wrap",children:[(0,N.jsxs)("div",{className:"p-2",children:[(0,N.jsx)("label",{children:"Date"}),(0,N.jsx)("br",{}),(0,N.jsx)("input",{value:D.reqDate,type:"date",className:"cus-inpt w-auto",onChange:e=>L((t=>({...t,reqDate:e.target.value})))})]}),(0,N.jsxs)("div",{className:"p-2",children:[(0,N.jsx)("label",{children:"LOCATION"}),(0,N.jsx)("br",{}),(0,N.jsxs)("select",{className:"cus-inpt",value:D.LocationDetails,onChange:e=>L((t=>({...t,LocationDetails:e.target.value}))),children:[(0,N.jsx)("option",{value:"MILL",children:"MILL"}),(0,N.jsx)("option",{value:"GODOWN",children:"GODOWN"})]})]})]}),(0,N.jsx)("div",{className:"table-responsive",children:(0,N.jsxs)("table",{className:"table",children:[(0,N.jsx)("thead",{children:(0,N.jsxs)("tr",{children:[["sno","time","NOT TAKEN - 30 MINS","Not verified - Before 45 mins","Not Delivery - Before 105 mins","OVERALL SALES"].map(((e,t)=>(0,N.jsx)("th",{className:"border text-center fa-13 text-uppercase",children:e},t))),(0,l.Qr)(null===C||void 0===C?void 0:C.Edit_Rights,1)&&(0,N.jsx)("th",{className:"border text-center fa-13",children:"ACTION"})]})}),(0,N.jsx)("tbody",{children:null===t||void 0===t?void 0:t.map((e=>{var t;return null===e||void 0===e||null===(t=e.DeliveryList)||void 0===t?void 0:t.map(((e,t)=>(0,N.jsxs)("tr",{children:[(0,N.jsx)("td",{className:"fa-13 border text-center",children:t+1}),(0,N.jsx)("td",{className:"fa-16 border text-center fw-bold text-primary",children:(0,l.Wk)(null===e||void 0===e?void 0:e.EntryTime)}),["NotTaken","NotVerified","NotDelivery","OverAllSales"].map(((t,s)=>(0,N.jsx)("td",{className:"fa-13 border text-center",children:(0,l.aU)(e[t])},s))),(0,l.Qr)(null===C||void 0===C?void 0:C.Edit_Rights,1)&&(0,N.jsx)("td",{className:"fa-13 border text-center",children:(0,N.jsx)(c.c,{onClick:()=>{f(e),L((e=>({...e,dialog:!0})))},size:"small",children:(0,N.jsx)(m.c,{className:"fa-18"})})})]},t)))}))})]})})]})]}),(0,N.jsxs)(o.c,{open:D.dialog,onClose:A,fullWidth:!0,maxWidth:"sm",children:[(0,N.jsx)(v.c,{className:" bg-light",children:null!==y&&void 0!==y&&y.Id?"Modify Activity":"Add Delivery Activity"}),(0,N.jsx)(u.c,{children:(0,N.jsx)("div",{className:"table-responsive",children:(0,N.jsx)("table",{className:"table",children:(0,N.jsxs)("tbody",{children:[(0,N.jsxs)("tr",{children:[(0,N.jsx)("td",{className:"border-0",style:{verticalAlign:"middle"},children:"Location"}),(0,N.jsx)("td",{className:"border-0",children:(0,N.jsxs)("select",{value:null===y||void 0===y?void 0:y.LocationDetails,onChange:e=>f((t=>({...t,LocationDetails:e.target.value}))),className:"cus-inpt",children:[(0,N.jsx)("option",{value:"MILL",children:"MILL"}),(0,N.jsx)("option",{value:"GODOWN",children:"GODOWN"})]})})]}),(0,N.jsxs)("tr",{children:[(0,N.jsx)("td",{className:"border-0",style:{verticalAlign:"middle"},children:"Date"}),(0,N.jsx)("td",{className:"border-0",children:(0,N.jsx)("input",{type:"date",value:null===y||void 0===y?void 0:y.EntryDate,className:"cus-inpt",onChange:e=>f((t=>({...t,EntryDate:e.target.value})))})})]}),(0,N.jsxs)("tr",{children:[(0,N.jsx)("td",{className:"border-0",style:{verticalAlign:"middle"},children:"Time"}),(0,N.jsx)("td",{className:"border-0",children:(0,N.jsx)("input",{type:"time",value:null===y||void 0===y?void 0:y.EntryTime,className:"cus-inpt",onChange:e=>f((t=>({...t,EntryTime:e.target.value})))})})]}),(0,N.jsxs)("tr",{children:[(0,N.jsx)("td",{className:"border-0",style:{verticalAlign:"middle"},children:"Not Taken"}),(0,N.jsx)("td",{className:"border-0",children:(0,N.jsx)("input",{value:(0,l.aU)(null===y||void 0===y?void 0:y.NotTaken),className:"cus-inpt",onInput:l.Gk,onChange:e=>f((t=>({...t,NotTaken:e.target.value})))})})]}),(0,N.jsxs)("tr",{children:[(0,N.jsx)("td",{className:"border-0",style:{verticalAlign:"middle"},children:"Not Verified"}),(0,N.jsx)("td",{className:"border-0",children:(0,N.jsx)("input",{value:(0,l.aU)(null===y||void 0===y?void 0:y.NotVerified),className:"cus-inpt",onInput:l.Gk,onChange:e=>f((t=>({...t,NotVerified:e.target.value})))})})]}),(0,N.jsxs)("tr",{children:[(0,N.jsx)("td",{className:"border-0",style:{verticalAlign:"middle"},children:"Not Delivery"}),(0,N.jsx)("td",{className:"border-0",children:(0,N.jsx)("input",{value:(0,l.aU)(null===y||void 0===y?void 0:y.NotDelivery),className:"cus-inpt",onInput:l.Gk,onChange:e=>f((t=>({...t,NotDelivery:e.target.value})))})})]}),(0,N.jsxs)("tr",{children:[(0,N.jsx)("td",{className:"border-0",style:{verticalAlign:"middle"},children:"Overall Sales"}),(0,N.jsx)("td",{className:"border-0",children:(0,N.jsx)("input",{value:(0,l.aU)(null===y||void 0===y?void 0:y.OverAllSales),className:"cus-inpt",onInput:l.Gk,onChange:e=>f((t=>({...t,OverAllSales:e.target.value})))})})]})]})})})}),(0,N.jsxs)(h.c,{children:[(0,N.jsx)(n.c,{children:"CANCEL"}),(0,N.jsx)(n.c,{variant:"outlined",onClick:()=>{(0,j.q)({address:"dataEntry/deliveryActivities",method:y.Id?"PUT":"POST",headers:{"Content-Type":"application/json"},bodyData:y}).then((e=>{e.success?(r.m4.success(e.message),A(),g(!p)):r.m4.error(e.message)})).catch((e=>console.error(e)))},children:"save"})]})]})]})}},86e3:(e,t,s)=>{s.d(t,{c:()=>r});var a=s(27664),l=s(82496);const r=(0,a.c)((0,l.jsx)("path",{d:"M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z"}),"Edit")},84436:(e,t,s)=>{s.d(t,{c:()=>j});var a=s(45072),l=s(95656),r=s(69060),i=s(79736),n=s(21412),d=s(12556),c=s(49836),o=s(10099),v=s(33448);function u(e){return(0,v.cp)("MuiCardContent",e)}(0,o.c)("MuiCardContent",["root"]);var h=s(82496);const m=["className","component"],x=(0,d.cp)("div",{name:"MuiCardContent",slot:"Root",overridesResolver:(e,t)=>t.root})((()=>({padding:16,"&:last-child":{paddingBottom:24}}))),j=r.forwardRef((function(e,t){const s=(0,c.C)({props:e,name:"MuiCardContent"}),{className:r,component:d="div"}=s,o=(0,l.c)(s,m),v=(0,a.c)({},s,{component:d}),j=(e=>{const{classes:t}=e;return(0,n.c)({root:["root"]},u,t)})(v);return(0,h.jsx)(x,(0,a.c)({as:d,className:(0,i.c)(j.root,r),ownerState:v,ref:t},o))}))},43692:(e,t,s)=>{s.d(t,{c:()=>N});var a=s(45072),l=s(95656),r=s(69060),i=s(79736),n=s(21412),d=s(12556),c=s(49836),o=s(85624),v=s(10099),u=s(33448);function h(e){return(0,u.cp)("MuiCard",e)}(0,v.c)("MuiCard",["root"]);var m=s(82496);const x=["className","raised"],j=(0,d.cp)(o.c,{name:"MuiCard",slot:"Root",overridesResolver:(e,t)=>t.root})((()=>({overflow:"hidden"}))),N=r.forwardRef((function(e,t){const s=(0,c.C)({props:e,name:"MuiCard"}),{className:r,raised:d=!1}=s,o=(0,l.c)(s,x),v=(0,a.c)({},s,{raised:d}),u=(e=>{const{classes:t}=e;return(0,n.c)({root:["root"]},h,t)})(v);return(0,m.jsx)(j,(0,a.c)({className:(0,i.c)(u.root,r),elevation:d?8:void 0,ref:t,ownerState:v},o))}))}}]);
//# sourceMappingURL=5496.2e34db05.chunk.js.map
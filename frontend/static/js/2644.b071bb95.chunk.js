/*! For license information please see 2644.b071bb95.chunk.js.LICENSE.txt */
"use strict";(self.webpackChunkerp=self.webpackChunkerp||[]).push([[2644,3692,4712],{52700:(e,t,r)=>{r.r(t),r.d(t,{default:()=>S});var a=r(69060),l=r(39308),s=r(56480),n=r(43692),o=r(89e3),c=r(84436),i=r(12572),d=r(15786),u=r(82656),v=r(26773),m=r(4488),h=r(90048),f=r(18256),x=r(29720),p=r(61584),j=r(77536),b=r(1908),N=r(82496);const S=()=>{const e=JSON.parse(localStorage.getItem("user")),{contextObj:t}=(0,a.useContext)(j.a),r={Id:"",EntryDate:(0,l.Q7)(),EntryTime:"10:00",LocationDetails:"MILL",Category:"OTHERS 1 - PRINT",StaffName:"",Tonnage:"",EntryBy:e.UserId},[S,y]=(0,a.useState)([]),[g,T]=(0,a.useState)([]),[C,A]=(0,a.useState)([]),[E,D]=(0,a.useState)(r),[w,R]=(0,a.useState)(!1),[M,L]=(0,a.useState)({reqDate:(0,l.Q7)(),reqLocation:"MILL",dialog:!1,view:"DATA ENTRY"});(0,a.useEffect)((()=>{(0,b.q)({address:"dataEntry/staffActivities/staffs"}).then((e=>A(e.data))).catch((e=>console.error(e)))}),[w]),(0,a.useEffect)((()=>{"DATA ENTRY"===M.view&&(y([]),(0,b.q)({address:"dataEntry/staffActivities?reqDate=".concat(M.reqDate,"&reqLocation=").concat(M.reqLocation)}).then((e=>{e.success&&y(e.data)})).catch((e=>console.error(e)))),"STAFF BASED"===M.view&&(T([]),(0,b.q)({address:"dataEntry/staffActivities/staffBased?reqDate=".concat(M.reqDate,"&reqLocation=").concat(M.reqLocation)}).then((e=>{e.success&&T(e.data)})).catch((e=>console.error(e))))}),[w,M.reqDate,M.reqLocation,M.view]);const q=()=>{L((e=>({...e,dialog:!1}))),D(r)},O=e=>{var r,s,n,o;switch(e){case"DATA ENTRY":return(0,N.jsx)("div",{className:"table-responsive",children:(0,N.jsxs)("table",{className:"table",children:[(0,N.jsx)("thead",{children:(0,N.jsxs)("tr",{children:[(0,N.jsx)("th",{className:"fa-14 border text-center py-2 tble-hed-stick",children:"TIME"}),S[0]&&(null===(r=S[0])||void 0===r||null===(s=r.Categories)||void 0===s?void 0:s.map(((e,t)=>(0,N.jsx)("th",{className:"fa-14 border text-center py-2 tble-hed-stick",children:null===e||void 0===e?void 0:e.Category},t))))]})}),(0,N.jsx)("tbody",{children:null===S||void 0===S?void 0:S.map(((e,r)=>{var s,n;return(0,N.jsxs)(a.Fragment,{children:[(0,N.jsxs)("tr",{children:[(0,N.jsx)("td",{className:"fa-14 fw-bold border text-center text-primary",style:{verticalAlign:"middle"},children:(0,l.Gu)(null===e||void 0===e?void 0:e.EntryTime)}),null===e||void 0===e||null===(s=e.Categories)||void 0===s?void 0:s.map(((e,r)=>{var a;return(0,N.jsx)("td",{className:"fa-13 fw-bold text-muted border",children:null===e||void 0===e||null===(a=e.StaffDetails)||void 0===a?void 0:a.map(((e,r)=>(0,N.jsxs)("p",{className:"d-flex justify-content-between mb-0 p-1 cellHover",onClick:(0,l.Qr)(null===t||void 0===t?void 0:t.Edit_Rights,1)?()=>{D(e),L((e=>({...e,dialog:!0})))}:()=>{},children:[(0,N.jsx)("span",{children:null===e||void 0===e?void 0:e.StaffName}),(0,N.jsx)("span",{className:"text-primary ps-2",children:null===e||void 0===e?void 0:e.Tonnage})]},r)))},r)}))]}),(0,N.jsxs)("tr",{children:[(0,N.jsx)("td",{className:"border fa-14 text-muted",style:{verticalAlign:"middle"},children:"Total"}),null===e||void 0===e||null===(n=e.Categories)||void 0===n?void 0:n.map(((e,t)=>{var r;return(0,N.jsx)("td",{className:"border text-end text-primary fw-bold",children:(0,l.SA)(null===e||void 0===e||null===(r=e.StaffDetails)||void 0===r?void 0:r.reduce(((e,t)=>null!==t&&void 0!==t&&t.Tonnage?(null===t||void 0===t?void 0:t.Tonnage)+e:0),0))},t)}))]})]},r)}))})]})});case"STAFF BASED":return(0,N.jsx)(N.Fragment,{children:(0,N.jsx)("div",{className:"table-responsive",children:(0,N.jsxs)("table",{className:"table",children:[(0,N.jsx)("thead",{children:(0,N.jsxs)("tr",{children:[(0,N.jsx)("th",{className:"fa-14 text-center border",children:"Sno"}),(0,N.jsx)("th",{className:"fa-14 text-center border",children:"Staff Name"}),null===(n=g[0])||void 0===n||null===(o=n.Categories)||void 0===o?void 0:o.map(((e,t)=>(0,N.jsx)("th",{className:"fa-14 text-center border",children:null===e||void 0===e?void 0:e.Category},t))),(0,N.jsx)("th",{className:"fa-14 text-center border",children:"Total"})]})}),(0,N.jsx)("tbody",{children:null===g||void 0===g?void 0:g.map(((e,t)=>{var r,a;return(0,N.jsxs)("tr",{children:[(0,N.jsx)("td",{className:"fa-13 text-center border",children:t+1}),(0,N.jsx)("td",{className:"fa-13 text-center border",children:null===e||void 0===e?void 0:e.StaffName}),null===e||void 0===e||null===(r=e.Categories)||void 0===r?void 0:r.map(((e,t)=>{var r,a;return(0,N.jsx)("td",{className:"fa-13 text-center border",children:null!==e&&void 0!==e&&null!==(r=e.StaffDetails)&&void 0!==r&&r.Tonnage?(0,l.SA)(null===e||void 0===e||null===(a=e.StaffDetails)||void 0===a?void 0:a.Tonnage):""},t)})),(0,N.jsx)("td",{className:"fa-14 text-center border blue-text",children:(0,l.SA)(null===e||void 0===e||null===(a=e.Categories)||void 0===a?void 0:a.reduce(((e,t)=>{var r,a;let l=0;return l+="OTHERS 1 - PRINT"!==(null===t||void 0===t?void 0:t.Category)&&null!==(r=null===t||void 0===t||null===(a=t.StaffDetails)||void 0===a?void 0:a.Tonnage)&&void 0!==r?r:0,l+e}),0))})]},t)}))})]})})});default:return(0,N.jsx)(N.Fragment,{})}};return(0,N.jsxs)(N.Fragment,{children:[(0,N.jsxs)(n.c,{children:[(0,N.jsxs)("div",{className:"p-3 fa-16 fw-bold border-bottom d-flex justify-content-between",children:[(0,N.jsx)("span",{children:"Staff Activities"}),(0,l.Qr)(null===t||void 0===t?void 0:t.Add_Rights,1)&&(0,N.jsx)(o.c,{variant:"outlined",onClick:()=>L((e=>({...e,dialog:!0}))),children:"Add Activity"})]}),(0,N.jsxs)("div",{className:"d-flex p-2 px-3",children:[(0,N.jsxs)("div",{children:[(0,N.jsx)("label",{className:"mb-1 w-100",children:"DATE"}),(0,N.jsx)("input",{type:"date",className:"cus-inpt w-auto",value:M.reqDate,onChange:e=>L((t=>({...t,reqDate:e.target.value})))})]}),(0,N.jsxs)("div",{children:[(0,N.jsx)("label",{className:"mb-1 w-100",children:"LOCATION"}),(0,N.jsxs)("select",{className:"cus-inpt w-auto",value:M.reqLocation,onChange:e=>L((t=>({...t,reqLocation:e.target.value}))),children:[(0,N.jsx)("option",{value:"MILL",children:"MILL"}),(0,N.jsx)("option",{value:"GODOWN",children:"GODOWN"})]})]})]}),(0,N.jsx)(c.c,{children:(0,N.jsxs)(f.cp,{value:M.view,children:[(0,N.jsx)(i.c,{sx:{borderBottom:1,borderColor:"divider"},children:(0,N.jsxs)(x.c,{indicatorColor:"transparant",onChange:(e,t)=>L((e=>({...e,view:t}))),variant:"scrollable",scrollButtons:"auto",allowScrollButtonsMobile:!0,children:[(0,N.jsx)(d.c,{sx:"DATA ENTRY"===M.view?{backgroundColor:"#c6d7eb"}:{},label:"DATA ENTRY",value:"DATA ENTRY"}),(0,N.jsx)(d.c,{sx:"STAFF BASED"===M.view?{backgroundColor:"#c6d7eb"}:{},label:"STAFF BASED",value:"STAFF BASED"})]})}),["DATA ENTRY","STAFF BASED"].map((e=>(0,N.jsx)(p.c,{value:e,sx:{px:0,py:2},children:S.length||g.length?O(e):(0,N.jsx)(N.Fragment,{})},e)))]})})]}),(0,N.jsxs)(u.c,{open:M.dialog,onClose:q,fullWidth:!0,maxWidth:"sm",children:[(0,N.jsx)(v.c,{children:null!==E&&void 0!==E&&E.Id?"Modify Activity":"Add Staff Activity"}),(0,N.jsxs)("form",{onSubmit:e=>{e.preventDefault(),(0,b.q)({address:"dataEntry/staffActivities",method:E.Id?"PUT":"POST",headers:{"Content-Type":"application/json"},bodyData:E}).then((e=>{e.success?(s.m4.success(e.message),R(!w)):s.m4.error(e.message)})).catch((e=>console.error(e)))},children:[(0,N.jsx)(m.c,{children:(0,N.jsx)("div",{className:"table-responsive",children:(0,N.jsx)("table",{className:"table",children:(0,N.jsxs)("tbody",{children:[(0,N.jsxs)("tr",{children:[(0,N.jsx)("td",{className:"border-0",style:{verticalAlign:"middle"},children:"Location"}),(0,N.jsx)("td",{className:"border-0",children:(0,N.jsxs)("select",{value:null===E||void 0===E?void 0:E.LocationDetails,onChange:e=>D((t=>({...t,LocationDetails:e.target.value}))),className:"cus-inpt",required:!0,children:[(0,N.jsx)("option",{value:"MILL",children:"MILL"}),(0,N.jsx)("option",{value:"GODOWN",children:"GODOWN"})]})})]}),(0,N.jsxs)("tr",{children:[(0,N.jsx)("td",{className:"border-0",style:{verticalAlign:"middle"},children:"Date"}),(0,N.jsx)("td",{className:"border-0",children:(0,N.jsx)("input",{type:"date",value:null===E||void 0===E?void 0:E.EntryDate,className:"cus-inpt",onChange:e=>D((t=>({...t,EntryDate:e.target.value}))),required:!0})})]}),(0,N.jsxs)("tr",{children:[(0,N.jsx)("td",{className:"border-0",style:{verticalAlign:"middle"},children:"Time"}),(0,N.jsx)("td",{className:"border-0",children:(0,N.jsx)("input",{value:null===E||void 0===E?void 0:E.EntryTime,type:"time",required:!0,className:"cus-inpt",onChange:e=>D((t=>({...t,EntryTime:e.target.value})))})})]}),(0,N.jsxs)("tr",{children:[(0,N.jsx)("td",{className:"border-0",style:{verticalAlign:"middle"},children:"Category"}),(0,N.jsx)("td",{className:"border-0",children:(0,N.jsxs)("select",{value:null===E||void 0===E?void 0:E.Category,onChange:e=>D((t=>({...t,Category:e.target.value}))),className:"cus-inpt",required:!0,children:[(0,N.jsx)("option",{value:"OTHERS 1 - PRINT",children:"OTHERS 1 - PRINT"}),(0,N.jsx)("option",{value:"OTHERS 2 - TAKEN",children:"OTHERS 2 - TAKEN"}),(0,N.jsx)("option",{value:"OTHERS 3 - CHECK/ADDRESS",children:"OTHERS 3 - CHECK/ADDRESS"}),(0,N.jsx)("option",{value:"OTHERS 4 - DISPATCH",children:"OTHERS 4 - DISPATCH"})]})})]}),(0,N.jsxs)("tr",{children:[(0,N.jsx)("td",{className:"border-0",style:{verticalAlign:"middle"},children:"Staff Name"}),(0,N.jsx)("td",{className:"border-0",children:(0,N.jsx)("input",{value:null===E||void 0===E?void 0:E.StaffName,type:"search",list:"staffList",required:!0,className:"cus-inpt",placeholder:"Type or Search Staff name",onChange:e=>D((t=>({...t,StaffName:e.target.value})))})})]}),(0,N.jsxs)("tr",{children:[(0,N.jsx)("td",{className:"border-0",style:{verticalAlign:"middle"},children:"Tonnage Value"}),(0,N.jsx)("td",{className:"border-0",children:(0,N.jsx)("input",{value:null===E||void 0===E?void 0:E.Tonnage,className:"cus-inpt",onInput:l.Gk,required:!0,onChange:e=>D((t=>({...t,Tonnage:e.target.value})))})})]})]})})})}),(0,N.jsxs)(h.c,{children:[(0,N.jsx)(o.c,{onClick:q,type:"button",children:"Cancel"}),(0,N.jsx)(o.c,{type:"submit",children:"SUBMIT"})]})]})]}),(0,N.jsx)("datalist",{id:"staffList",children:C.map(((e,t)=>(0,N.jsx)("option",{value:e.StaffName},t)))})]})}},18256:(e,t,r)=>{r.d(t,{Ed:()=>i,cp:()=>n,oF:()=>o,qM:()=>c});var a=r(69060),l=r(82496);const s=a.createContext(null);function n(e){const{children:t,value:r}=e,n=function(){const[e,t]=a.useState(null);return a.useEffect((()=>{t("mui-p-".concat(Math.round(1e5*Math.random())))}),[]),e}(),o=a.useMemo((()=>({idPrefix:n,value:r})),[n,r]);return(0,l.jsx)(s.Provider,{value:o,children:t})}function o(){return a.useContext(s)}function c(e,t){const{idPrefix:r}=e;return null===r?null:"".concat(e.idPrefix,"-P-").concat(t)}function i(e,t){const{idPrefix:r}=e;return null===r?null:"".concat(e.idPrefix,"-T-").concat(t)}},29720:(e,t,r)=>{r.d(t,{c:()=>d});var a=r(45072),l=r(95656),s=r(69060),n=r(77828),o=r(18256),c=r(82496);const i=["children"],d=s.forwardRef((function(e,t){const{children:r}=e,d=(0,l.c)(e,i),u=(0,o.oF)();if(null===u)throw new TypeError("No TabContext provided");const v=s.Children.map(r,(e=>s.isValidElement(e)?s.cloneElement(e,{"aria-controls":(0,o.qM)(u,e.props.value),id:(0,o.Ed)(u,e.props.value)}):null));return(0,c.jsx)(n.c,(0,a.c)({},d,{ref:t,value:u.value,children:v}))}))},61584:(e,t,r)=>{r.d(t,{c:()=>x});var a=r(45072),l=r(95656),s=r(69060),n=r(79736),o=r(12556),c=r(23456),i=r(21412),d=r(33448);function u(e){return(0,d.cp)("MuiTabPanel",e)}(0,r(10099).c)("MuiTabPanel",["root"]);var v=r(18256),m=r(82496);const h=["children","className","value"],f=(0,o.cp)("div",{name:"MuiTabPanel",slot:"Root",overridesResolver:(e,t)=>t.root})((e=>{let{theme:t}=e;return{padding:t.spacing(3)}})),x=s.forwardRef((function(e,t){const r=(0,c.c)({props:e,name:"MuiTabPanel"}),{children:s,className:o,value:d}=r,x=(0,l.c)(r,h),p=(0,a.c)({},r),j=(e=>{const{classes:t}=e;return(0,i.c)({root:["root"]},u,t)})(p),b=(0,v.oF)();if(null===b)throw new TypeError("No TabContext provided");const N=(0,v.qM)(b,d),S=(0,v.Ed)(b,d);return(0,m.jsx)(f,(0,a.c)({"aria-labelledby":S,className:(0,n.c)(j.root,o),hidden:d!==b.value,id:N,ref:t,role:"tabpanel",ownerState:p},x,{children:d===b.value&&s}))}))},12572:(e,t,r)=>{r.d(t,{c:()=>i});var a=r(0),l=r(31152),s=r(46712),n=r(83068);const o=(0,r(10099).c)("MuiBox",["root"]),c=(0,s.c)(),i=(0,a.c)({themeId:n.c,defaultTheme:c,defaultClassName:o.root,generateClassName:l.c.generate})},84436:(e,t,r)=>{r.d(t,{c:()=>x});var a=r(45072),l=r(95656),s=r(69060),n=r(79736),o=r(21412),c=r(12556),i=r(49836),d=r(10099),u=r(33448);function v(e){return(0,u.cp)("MuiCardContent",e)}(0,d.c)("MuiCardContent",["root"]);var m=r(82496);const h=["className","component"],f=(0,c.cp)("div",{name:"MuiCardContent",slot:"Root",overridesResolver:(e,t)=>t.root})((()=>({padding:16,"&:last-child":{paddingBottom:24}}))),x=s.forwardRef((function(e,t){const r=(0,i.C)({props:e,name:"MuiCardContent"}),{className:s,component:c="div"}=r,d=(0,l.c)(r,h),u=(0,a.c)({},r,{component:c}),x=(e=>{const{classes:t}=e;return(0,o.c)({root:["root"]},v,t)})(u);return(0,m.jsx)(f,(0,a.c)({as:c,className:(0,n.c)(x.root,s),ownerState:u,ref:t},d))}))},43692:(e,t,r)=>{r.d(t,{c:()=>p});var a=r(45072),l=r(95656),s=r(69060),n=r(79736),o=r(21412),c=r(12556),i=r(49836),d=r(85624),u=r(10099),v=r(33448);function m(e){return(0,v.cp)("MuiCard",e)}(0,u.c)("MuiCard",["root"]);var h=r(82496);const f=["className","raised"],x=(0,c.cp)(d.c,{name:"MuiCard",slot:"Root",overridesResolver:(e,t)=>t.root})((()=>({overflow:"hidden"}))),p=s.forwardRef((function(e,t){const r=(0,i.C)({props:e,name:"MuiCard"}),{className:s,raised:c=!1}=r,d=(0,l.c)(r,f),u=(0,a.c)({},r,{raised:c}),v=(e=>{const{classes:t}=e;return(0,o.c)({root:["root"]},m,t)})(u);return(0,h.jsx)(x,(0,a.c)({className:(0,n.c)(v.root,s),elevation:c?8:void 0,ref:t,ownerState:u},d))}))},38780:(e,t,r)=>{r.d(t,{c:()=>s});r(69060);var a=r(27664),l=r(82496);const s=(0,a.c)((0,l.jsx)("path",{d:"M15.41 16.09l-4.58-4.59 4.58-4.59L14 5.5l-6 6 6 6z"}),"KeyboardArrowLeft")},46320:(e,t,r)=>{r.d(t,{c:()=>s});r(69060);var a=r(27664),l=r(82496);const s=(0,a.c)((0,l.jsx)("path",{d:"M8.59 16.34l4.58-4.59-4.58-4.59L10 5.75l6 6-6 6z"}),"KeyboardArrowRight")},88928:(e,t)=>{var r,a=Symbol.for("react.element"),l=Symbol.for("react.portal"),s=Symbol.for("react.fragment"),n=Symbol.for("react.strict_mode"),o=Symbol.for("react.profiler"),c=Symbol.for("react.provider"),i=Symbol.for("react.context"),d=Symbol.for("react.server_context"),u=Symbol.for("react.forward_ref"),v=Symbol.for("react.suspense"),m=Symbol.for("react.suspense_list"),h=Symbol.for("react.memo"),f=Symbol.for("react.lazy"),x=Symbol.for("react.offscreen");function p(e){if("object"===typeof e&&null!==e){var t=e.$$typeof;switch(t){case a:switch(e=e.type){case s:case o:case n:case v:case m:return e;default:switch(e=e&&e.$$typeof){case d:case i:case u:case f:case h:case c:return e;default:return t}}case l:return t}}}r=Symbol.for("react.module.reference")},27852:(e,t,r)=>{r(88928)},72144:(e,t,r)=>{r.d(t,{c:()=>a});const a=r(46576).c},93976:(e,t,r)=>{r.d(t,{c:()=>a});const a=r(6848).c},31328:(e,t,r)=>{r.d(t,{c:()=>a});const a=r(7608).c},87188:(e,t,r)=>{r.d(t,{c:()=>a});const a=r(92576).c},46576:(e,t,r)=>{function a(e){let t,r=arguments.length>1&&void 0!==arguments[1]?arguments[1]:166;function a(){for(var a=arguments.length,l=new Array(a),s=0;s<a;s++)l[s]=arguments[s];clearTimeout(t),t=setTimeout((()=>{e.apply(this,l)}),r)}return a.clear=()=>{clearTimeout(t)},a}r.d(t,{c:()=>a})}}]);
//# sourceMappingURL=2644.b071bb95.chunk.js.map